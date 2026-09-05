const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
    parseDateValue,
    getSchoolYearFromDate,
    getCurrentSchoolYearKey,
    getAvailableSchoolYears,
    getVotesForSchoolYear
} = require('../lib/helpers');

// Load ui.js in sandbox to verify client-side calculations and empty-state handling
const uiCode = fs.readFileSync(path.join(__dirname, '../ui.js'), 'utf8');

const matchSYDate = uiCode.match(/function getSchoolYearFromDate\s*\([\s\S]*?\n\}/);
const matchCurrentSY = uiCode.match(/function getCurrentSchoolYearKey\s*\([\s\S]*?\n\}/);
const matchAvailSY = uiCode.match(/function getAvailableSchoolYears\s*\([\s\S]*?\n\}/);
const matchVotesSY = uiCode.match(/function getVotesForSchoolYear\s*\([\s\S]*?\n\}/);
const matchTrend = uiCode.match(/function getGradeMonthlyTrendSummary\s*\([\s\S]*?\n\}/);
const matchCalcolaMedia = uiCode.match(/function calcolaMedia\s*\([\s\S]*?\n\}/);
const matchNumeric = uiCode.match(/function getNumericGradeValue\s*\([\s\S]*?\n\}/);
const matchAvg = uiCode.match(/function averageFromNumeric\s*\([\s\S]*?\n\}/);
const matchGiustifica = uiCode.match(/function isGiustifica\s*\([\s\S]*?\n\}/);

const uiSandbox = new Function(`
    let state = { voti: [] };
    function getVotiData() { return state.voti || []; }
    function parseArgoDate(raw) {
        if (!raw) return new Date(0);
        if (raw instanceof Date) return raw;
        const s = String(raw).trim();
        const iso = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
        if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10), 12, 0, 0);
        const ita = s.match(/^(\\d{1,2})[\\/\\.-](\\d{1,2})[\\/\\.-](\\d{4})/);
        if (ita) return new Date(parseInt(ita[3], 10), parseInt(ita[2], 10) - 1, parseInt(ita[1], 10), 12, 0, 0);
        const d = new Date(s);
        return isNaN(d.getTime()) ? new Date(0) : d;
    }
    ${matchGiustifica[0]}
    ${matchNumeric[0]}
    ${matchAvg[0]}
    ${matchCalcolaMedia[0]}
    ${matchSYDate[0]}
    ${matchCurrentSY[0]}
    ${matchAvailSY[0]}
    ${matchVotesSY[0]}
    ${matchTrend[0]}
    return {
        getSchoolYearFromDate,
        getCurrentSchoolYearKey,
        getAvailableSchoolYears,
        getVotesForSchoolYear,
        getGradeMonthlyTrendSummary,
        calcolaMedia
    };
`)();

test('Italian School Year (A.S.) Recognition & Boundary Tests', async (t) => {
    await t.test('September 1st belongs to the new school year', () => {
        const sy1 = getSchoolYearFromDate('2026-09-01');
        assert.strictEqual(sy1.key, '2026/27');
        assert.strictEqual(sy1.startYear, 2026);
        assert.strictEqual(sy1.endYear, 2027);
        assert.strictEqual(sy1.label, 'A.S. 2026/27');

        const sy2 = getSchoolYearFromDate('2025-09-01');
        assert.strictEqual(sy2.key, '2025/26');
    });

    await t.test('August 31st belongs to the previous school year', () => {
        const sy1 = getSchoolYearFromDate('2026-08-31');
        assert.strictEqual(sy1.key, '2025/26');
        assert.strictEqual(sy1.startYear, 2025);
        assert.strictEqual(sy1.endYear, 2026);
        assert.strictEqual(sy1.label, 'A.S. 2025/26');
    });

    await t.test('Mid-year dates (Nov, Jan, May, June) resolve accurately', () => {
        assert.strictEqual(getSchoolYearFromDate('2025-11-15').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-01-10').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-05-28').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-06-05').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-10-20').key, '2026/27');
        assert.strictEqual(getSchoolYearFromDate('2027-02-14').key, '2026/27');
    });

    await t.test('Supports Italian DD/MM/YYYY dates and Date instances', () => {
        assert.strictEqual(getSchoolYearFromDate('05/09/2026').key, '2026/27');
        assert.strictEqual(getSchoolYearFromDate('15/05/2026').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate(new Date(2026, 8, 5)).key, '2026/27');
    });

    await t.test('Returns null on invalid or missing dates without throwing', () => {
        assert.strictEqual(getSchoolYearFromDate(null), null);
        assert.strictEqual(getSchoolYearFromDate(''), null);
        assert.strictEqual(getSchoolYearFromDate('invalid-date'), null);
    });
});

test('School Year Votes Partitioning & Available Years', async (t) => {
    const mockVotes = [
        { materia: 'Matematica', valore: '8', data: '2025-11-10' }, // 2025/26
        { materia: 'Italiano', valore: '7', data: '2026-01-20' },   // 2025/26
        { materia: 'Storia', valore: '9', data: '2026-05-15' },     // 2025/26
        { materia: 'Fisica', valore: '6.5', data: '2026-06-01' },   // 2025/26
        { materia: 'Inglese', valore: '8.5', data: '2026-09-15' }   // 2026/27
    ];

    await t.test('getAvailableSchoolYears returns sorted unique school years including current year', () => {
        const refDate = new Date('2026-09-05');
        const years = getAvailableSchoolYears(mockVotes, refDate);
        assert.deepStrictEqual(years, ['2026/27', '2025/26']);
    });

    await t.test('getAvailableSchoolYears always includes current school year even if 0 votes exist', () => {
        const refDate = new Date('2026-09-05');
        const emptyVotes = [];
        const years = getAvailableSchoolYears(emptyVotes, refDate);
        assert.deepStrictEqual(years, ['2026/27']);
    });

    await t.test('getVotesForSchoolYear filters correctly by school year key', () => {
        const votes2526 = getVotesForSchoolYear('2025/26', mockVotes);
        assert.strictEqual(votes2526.length, 4);
        assert.ok(votes2526.every(v => v.data < '2026-09-01'));

        const votes2627 = getVotesForSchoolYear('2026/27', mockVotes);
        assert.strictEqual(votes2627.length, 1);
        assert.strictEqual(votes2627[0].materia, 'Inglese');
    });

    await t.test('New school year with 0 votes returns empty array', () => {
        const pastOnlyVotes = [
            { materia: 'Matematica', valore: '8', data: '2025-11-10' },
            { materia: 'Italiano', valore: '7', data: '2026-05-15' }
        ];
        const currentYearVotes = getVotesForSchoolYear('2026/27', pastOnlyVotes);
        assert.strictEqual(currentYearVotes.length, 0);
    });
});

test('UI Grades Calculations & Zero-State Integrity (ui.js)', async (t) => {
    await t.test('getGradeMonthlyTrendSummary returns media null and empty diff when votes are empty (no fake 7.85)', () => {
        const summary = uiSandbox.getGradeMonthlyTrendSummary([]);
        assert.strictEqual(summary.media, null);
        assert.strictEqual(summary.diffStr, '');
        assert.strictEqual(summary.monthList.length, 0);
        assert.strictEqual(summary.hasComparison, false);
    });

    await t.test('calcolaMedia returns null when given empty array or no valid numeric grades', () => {
        assert.strictEqual(uiSandbox.calcolaMedia([]), null);
        assert.strictEqual(uiSandbox.calcolaMedia([{ valore: '—' }, { valore: 'giustificato' }]), null);
    });

    await t.test('ui.js school year helpers match expected current year 2026/27 in September 2026', () => {
        const refDate = new Date(2026, 8, 5); // 5 Sep 2026
        assert.strictEqual(uiSandbox.getCurrentSchoolYearKey(refDate), '2026/27');

        const pastVotes = [
            { materia: 'Latino', valore: '8', data: '2026-04-12' },
            { materia: 'Filosofia', valore: '9', data: '2026-05-10' }
        ];
        const avail = uiSandbox.getAvailableSchoolYears(pastVotes, refDate);
        assert.deepStrictEqual(avail, ['2026/27', '2025/26']);

        const currVotes = uiSandbox.getVotesForSchoolYear('2026/27', pastVotes);
        assert.strictEqual(currVotes.length, 0);

        const summary = uiSandbox.getGradeMonthlyTrendSummary(currVotes);
        assert.strictEqual(summary.media, null);
    });
});
