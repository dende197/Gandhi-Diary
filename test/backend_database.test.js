const { test } = require('node:test');
const assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('legacy tables retain data and service access while public access is closed', async () => {
    const db = new PGlite();
    const tables = ['conversations', 'conversation_participants', 'mental_health_logs', 'push_subscriptions'];
    const migration = fs.readFileSync(path.join(__dirname,
        '../supabase/migrations/202609290001_lock_legacy_tables.sql'), 'utf8');
    try {
        await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
        await db.exec(migration); // Fresh installations do not have the historical feature tables.
        for (const table of tables) {
            await db.exec(`CREATE TABLE ${table}(id integer PRIMARY KEY);
                INSERT INTO ${table} VALUES(1);
                GRANT ALL ON ${table} TO PUBLIC, anon, authenticated;
                CREATE POLICY legacy_public ON ${table} USING(true) WITH CHECK(true);`);
        }
        await db.exec(migration);
        await db.exec(migration);
        for (const table of tables) {
            for (const role of ['anon', 'authenticated']) {
                await db.exec(`SET ROLE ${role}`);
                await assert.rejects(() => db.query(`SELECT * FROM ${table}`), /permission denied/);
                await assert.rejects(() => db.query(`INSERT INTO ${table} VALUES(2)`), /permission denied/);
                await db.exec('RESET ROLE');
            }
            assert.equal((await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='${table}'::regclass`)).rows[0].relrowsecurity, true);
            await db.exec('SET ROLE service_role');
            assert.deepEqual((await db.query(`SELECT * FROM ${table}`)).rows, [{ id: 1 }]);
            await db.exec(`INSERT INTO ${table} VALUES(2); RESET ROLE;`);
        }
    } finally {
        await db.close();
    }
});
test('B05/B35/B38 database policies, atomic planner writes, representative limits and closed votes', async () => {
    const db = new PGlite();
    try {
        await db.exec(
            'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE PUBLICATION supabase_realtime;',
        );
        for (const file of fs
            .readdirSync(path.join(__dirname, '../supabase/migrations'))
            .filter((f) => f.endsWith('.sql'))
            .sort())
            await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8'));
        // Idempotent upgrade, and removal of an unexpected permissive policy.
        await db.exec('CREATE POLICY accidental_public ON profiles FOR SELECT USING(true);');
        await db.exec(
            fs.readFileSync(
                path.join(__dirname, '../supabase/migrations/202609280001_backend_integrity.sql'),
                'utf8',
            ),
        );
        assert.equal(
            (await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'")).rows[0].n,
            0,
        );
        await db.exec('SET ROLE anon');
        await assert.rejects(() => db.query('SELECT * FROM proposal_votes'), /permission denied/);
        await assert.rejects(
            () => db.query("SELECT public.save_planner('alice',0,'{}')"),
            /permission denied/,
        );
        await db.exec('RESET ROLE');
        const save = (v, p) =>
            db.query('SELECT * FROM save_planner($1,$2,$3)', ['alice', v, JSON.stringify(p)]);
        assert.equal(
            (await save(0, { planned_tasks: { a: 1 }, stress_levels: { b: 2 } })).rows[0].version,
            1,
        );
        const [a, b] = await Promise.all([
            save(1, { planned_tasks: { a: 2 } }),
            save(1, { planned_tasks: { a: 3 } }),
        ]);
        assert.equal(a.rows.length + b.rows.length, 1);
        const planner = (await db.query("SELECT * FROM planners WHERE user_id='alice'")).rows[0];
        assert.deepEqual(planner.stress_levels, { b: 2 });
        assert.equal(planner.version, 2);
        const cls = 'school:2026/27:5D';
        for (const user of ['alice', 'bob', 'carol']) {
            await db.query('INSERT INTO verified_memberships VALUES($1,$2,$3,$4,$5,now())', [
                user,
                cls,
                '5D',
                'school',
                user,
            ]);
            await db.query('INSERT INTO class_rep_grants(user_id,class_key) VALUES($1,$2)', [user, cls]);
        }
        const rep = (user) => db.query('SELECT set_class_representative($1,$2,$1,true) ok', [user, cls]);
        const reps = await Promise.all(['alice', 'bob', 'carol'].map(rep));
        assert.equal(reps.filter((r) => r.rows[0].ok).length, 2);
        assert.equal((await rep('mallory')).rows[0].ok, false);
        const created = await db.query(
            "SELECT * FROM create_class_proposal('alice',$1,'Alice','ASSEMBLY','2026-10-01',null,'','2 ore','Motivo')",
            [cls],
        );
        const id = created.rows[0].id;
        assert.equal(
            (await db.query('SELECT count(*)::int n FROM proposal_votes WHERE proposal_id=$1', [id])).rows[0]
                .n,
            1,
        );
        const vote = (user) =>
            db.query("SELECT vote_class_proposal($1,$2,'ACCEPT',null,'',$1) ok", [user, id]);
        assert.equal((await vote('mallory')).rows[0].ok, false);
        assert.equal((await vote('bob')).rows[0].ok, true);
        await db.query("UPDATE proposals SET status='APPROVED' WHERE id=$1", [id]);
        assert.equal((await vote('carol')).rows[0].ok, false);
        const owner = '00000000-0000-4000-8000-000000000001';
        assert.equal(
            (await db.query("SELECT acquire_backend_lease('x',$1,60) ok", [owner])).rows[0].ok,
            true,
        );
        assert.equal(
            (await db.query("SELECT acquire_backend_lease('x',$1,60) ok", [owner])).rows[0].ok,
            false,
        );
        const quota = () => db.query("SELECT take_backend_quota('x',2,60) ok");
        assert.equal((await quota()).rows[0].ok, true);
        assert.equal((await quota()).rows[0].ok, true);
        assert.equal((await quota()).rows[0].ok, false);
    } finally {
        await db.close();
    }
});
