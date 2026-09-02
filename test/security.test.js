const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setCorsHeaders, redact } = require('../lib/helpers');

describe('Security Controls & Migrations', () => {
    test('RLS migration file exists and enforces restrictive policies on sensitive tables', () => {
        const migrationPath = path.join(__dirname, '../supabase/migrations/20260901_lock_rls_policies.sql');
        assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

        const content = fs.readFileSync(migrationPath, 'utf8');

        // Verify RLS is enabled on all sensitive tables
        assert.ok(content.includes('ALTER TABLE IF EXISTS public.proposals ENABLE ROW LEVEL SECURITY;'));
        assert.ok(content.includes('ALTER TABLE IF EXISTS public.proposal_votes ENABLE ROW LEVEL SECURITY;'));
        assert.ok(content.includes('ALTER TABLE IF EXISTS public.class_representatives ENABLE ROW LEVEL SECURITY;'));
        assert.ok(content.includes('ALTER TABLE IF EXISTS public.google_tokens ENABLE ROW LEVEL SECURITY;'));

        // Verify dangerous permissive policies are explicitly dropped
        assert.ok(content.includes('DROP POLICY IF EXISTS "Allow all on proposals" ON public.proposals;'));
        assert.ok(content.includes('DROP POLICY IF EXISTS "Allow all on proposal_votes" ON public.proposal_votes;'));
        assert.ok(content.includes('DROP POLICY IF EXISTS "Allow all on class_representatives" ON public.class_representatives;'));
        assert.ok(content.includes('DROP POLICY IF EXISTS "Allow all on google_tokens" ON public.google_tokens;'));

        // Verify lockdown policies are created
        assert.ok(content.includes('CREATE POLICY "Deny anon access to google_tokens"'));
        assert.ok(content.includes('CREATE POLICY "Deny anon write proposals"'));
        assert.ok(content.includes('CREATE POLICY "Deny anon write proposal_votes"'));
        assert.ok(content.includes('CREATE POLICY "Deny anon write class_representatives"'));
    });

    test('redact() masks sensitive keys (passwords, auth tokens, session tokens)', () => {
        const sample = {
            username: 'mario.rossi',
            password: 'secret_password_123',
            authToken: 'eyJhbGciOi...',
            details: {
                access_token: 'xyz',
                safeField: 'hello'
            }
        };

        const cleaned = redact(sample);
        assert.strictEqual(cleaned.password, '<redacted>');
        assert.strictEqual(cleaned.authToken, '<redacted>');
        assert.strictEqual(cleaned.details.access_token, '<redacted>');
        assert.strictEqual(cleaned.username, 'mario.rossi');
        assert.strictEqual(cleaned.details.safeField, 'hello');
    });

    test('CORS headers reject unauthorized origins when ALLOWED_ORIGINS is empty', () => {
        const req = {
            headers: {
                origin: 'https://malicious-site.com'
            }
        };
        const headersSet = {};
        const res = {
            setHeader: (key, val) => {
                headersSet[key] = val;
            }
        };

        setCorsHeaders(req, res);
        assert.strictEqual(headersSet['Access-Control-Allow-Origin'], undefined);
        assert.strictEqual(headersSet['Access-Control-Allow-Credentials'], 'false');
    });
});
