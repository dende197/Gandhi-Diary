const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const {
    normalizeClass, detectTrack, parseClassDetails, CLASS_REGEX
} = require('../lib/helpers');
const { extractClassFromDashboard } = require('../lib/argo');

describe('Class & Section Recognition & Track Attribution', () => {

    test('Standard class without track formats year and section (4D, 3A, 1B)', () => {
        assert.strictEqual(normalizeClass('4d'), '4D');
        assert.strictEqual(normalizeClass('3a'), '3A');
        assert.strictEqual(normalizeClass('1b'), '1B');
        assert.strictEqual(normalizeClass(' 4 d '), '4D');
        assert.strictEqual(normalizeClass('5A'), '5A');
        assert.strictEqual(normalizeClass('3inf'), '3INF');
        assert.strictEqual(normalizeClass('CLASSE 4 SEZ. D'), '4D');
        assert.strictEqual(normalizeClass('4^ D'), '4D');
    });

    test('Written words and Roman numerals are normalized', () => {
        assert.strictEqual(normalizeClass('QUARTA D'), '4D');
        assert.strictEqual(normalizeClass('TERZA A'), '3A');
        assert.strictEqual(normalizeClass('PRIMA B'), '1B');
        assert.strictEqual(normalizeClass('IV D'), '4D');
        assert.strictEqual(normalizeClass('III A'), '3A');
    });

    test('Scienze Applicate (SA) track recognition in all forms', () => {
        assert.strictEqual(normalizeClass('4d sa'), '4D (SA)');
        assert.strictEqual(normalizeClass('4D SA'), '4D (SA)');
        assert.strictEqual(normalizeClass('4d (sa)'), '4D (SA)');
        assert.strictEqual(normalizeClass('4DSA'), '4D (SA)');
        assert.strictEqual(normalizeClass('4 d sa'), '4D (SA)');
        assert.strictEqual(normalizeClass('4D SCIENZE APPLICATE'), '4D (SA)');
        assert.strictEqual(normalizeClass('4 D - SCIENZE APPLICATE'), '4D (SA)');
        assert.strictEqual(normalizeClass('4D - LICEO SCIENTIFICO OPZIONE SCIENZE APPLICATE'), '4D (SA)');
        assert.strictEqual(normalizeClass('4D', { course: 'SCIENZE APPLICATE' }), '4D (SA)');
        assert.strictEqual(normalizeClass('4', { section: 'D', course: 'SCIENZE APPLICATE' }), '4D (SA)');
    });

    test('Scientifico (LS) track recognition in all forms', () => {
        assert.strictEqual(normalizeClass('4d ls'), '4D (LS)');
        assert.strictEqual(normalizeClass('4D LS'), '4D (LS)');
        assert.strictEqual(normalizeClass('4d (ls)'), '4D (LS)');
        assert.strictEqual(normalizeClass('4DLS'), '4D (LS)');
        assert.strictEqual(normalizeClass('4 d ls'), '4D (LS)');
        assert.strictEqual(normalizeClass('4D SCIENTIFICO'), '4D (LS)');
        assert.strictEqual(normalizeClass('4 D - LICEO SCIENTIFICO'), '4D (LS)');
        assert.strictEqual(normalizeClass('4D', { course: 'LICEO SCIENTIFICO' }), '4D (LS)');
    });

    test('Classico (CL / LC) track recognition in all forms', () => {
        assert.strictEqual(normalizeClass('3a cl'), '3A (CL)');
        assert.strictEqual(normalizeClass('3A CL'), '3A (CL)');
        assert.strictEqual(normalizeClass('3a (cl)'), '3A (CL)');
        assert.strictEqual(normalizeClass('3ACL'), '3A (CL)');
        assert.strictEqual(normalizeClass('3a lc'), '3A (CL)');
        assert.strictEqual(normalizeClass('3A CLASSICO'), '3A (CL)');
        assert.strictEqual(normalizeClass('3 A - LICEO CLASSICO'), '3A (CL)');
        assert.strictEqual(normalizeClass('3A', { course: 'CLASSICO' }), '3A (CL)');
        assert.strictEqual(normalizeClass('3', { section: 'A', course: 'CLASSICO' }), '3A (CL)');
    });

    test('Scienze Umane (SU) track recognition in all forms', () => {
        assert.strictEqual(normalizeClass('1b su'), '1B (SU)');
        assert.strictEqual(normalizeClass('1B SU'), '1B (SU)');
        assert.strictEqual(normalizeClass('1b (su)'), '1B (SU)');
        assert.strictEqual(normalizeClass('1BSU'), '1B (SU)');
        assert.strictEqual(normalizeClass('1B SCIENZE UMANE'), '1B (SU)');
        assert.strictEqual(normalizeClass('1 B - LICEO SCIENZE UMANE'), '1B (SU)');
        assert.strictEqual(normalizeClass('1B', { course: 'SCIENZE UMANE' }), '1B (SU)');
        assert.strictEqual(normalizeClass('1', { section: 'B', course: 'SCIENZE UMANE' }), '1B (SU)');
    });

    test('detectTrack detects all expected tracks and abbreviations', () => {
        assert.strictEqual(detectTrack('SCIENZE APPLICATE')?.code, 'SA');
        assert.strictEqual(detectTrack('OPZIONE SCIENZE APPLICATE')?.code, 'SA');
        assert.strictEqual(detectTrack('SA')?.code, 'SA');

        assert.strictEqual(detectTrack('SCIENTIFICO')?.code, 'LS');
        assert.strictEqual(detectTrack('LICEO SCIENTIFICO')?.code, 'LS');
        assert.strictEqual(detectTrack('LS')?.code, 'LS');

        assert.strictEqual(detectTrack('SCIENZE UMANE')?.code, 'SU');
        assert.strictEqual(detectTrack('SU')?.code, 'SU');

        assert.strictEqual(detectTrack('CLASSICO')?.code, 'CL');
        assert.strictEqual(detectTrack('LICEO CLASSICO')?.code, 'CL');
        assert.strictEqual(detectTrack('CL')?.code, 'CL');
        assert.strictEqual(detectTrack('LC')?.code, 'CL');

        assert.strictEqual(detectTrack('LINGUISTICO')?.code, 'LL');
        assert.strictEqual(detectTrack('ARTISTICO')?.code, 'LA');
        assert.strictEqual(detectTrack(''), null);
    });

    test('parseClassDetails extracts complete metadata object', () => {
        const d1 = parseClassDetails('4D SA');
        assert.deepStrictEqual(d1, {
            year: 4,
            section: 'D',
            track: 'SA',
            trackName: 'Scienze Applicate',
            classOnly: '4D',
            formatted: '4D (SA)'
        });

        const d2 = parseClassDetails('3A', { course: 'LICEO CLASSICO' });
        assert.deepStrictEqual(d2, {
            year: 3,
            section: 'A',
            track: 'CL',
            trackName: 'Classico',
            classOnly: '3A',
            formatted: '3A (CL)'
        });

        const d3 = parseClassDetails('1B');
        assert.deepStrictEqual(d3, {
            year: 1,
            section: 'B',
            track: null,
            trackName: null,
            classOnly: '1B',
            formatted: '1B'
        });
    });

    test('CLASS_REGEX validates classes with and without track', () => {
        assert.strictEqual(CLASS_REGEX.test('4D'), true);
        assert.strictEqual(CLASS_REGEX.test('3A'), true);
        assert.strictEqual(CLASS_REGEX.test('1B'), true);
        assert.strictEqual(CLASS_REGEX.test('5A'), true);
        assert.strictEqual(CLASS_REGEX.test('3INF'), true);
        assert.strictEqual(CLASS_REGEX.test('4D (SA)'), true);
        assert.strictEqual(CLASS_REGEX.test('4D (LS)'), true);
        assert.strictEqual(CLASS_REGEX.test('3A (CL)'), true);
        assert.strictEqual(CLASS_REGEX.test('1B (SU)'), true);
        assert.strictEqual(CLASS_REGEX.test('N/D'), false);
        assert.strictEqual(CLASS_REGEX.test('STUDENTE'), false);
        assert.strictEqual(CLASS_REGEX.test(''), false);
    });

    test('extractClassFromDashboard recovers class from homework/activities', () => {
        const mockDashboard = {
            compiti: [
                { desMateria: 'Matematica', desClasse: '4D SA', compito: 'Esercizi pag 100' }
            ]
        };
        const extracted = extractClassFromDashboard(mockDashboard);
        assert.notStrictEqual(extracted, null);
        assert.strictEqual(extracted.formatted, '4D (SA)');
        assert.strictEqual(extracted.track, 'SA');
    });

    test('extractClassFromDashboard recovers class from class activities if compiti is empty', () => {
        const mockDashboard = {
            compiti: [],
            attivita: {
                svolte: [
                    { desMateria: 'Fisica', desClasse: '3A', desCorso: 'CLASSICO', attivita: 'Termodinamica' }
                ]
            }
        };
        const extracted = extractClassFromDashboard(mockDashboard);
        assert.notStrictEqual(extracted, null);
        assert.strictEqual(extracted.formatted, '3A (CL)');
        assert.strictEqual(extracted.track, 'CL');
    });
});
