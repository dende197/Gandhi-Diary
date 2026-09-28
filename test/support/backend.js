const fs = require('node:fs'),
    path = require('node:path'),
    vm = require('node:vm');
const { createRequire } = require('node:module');
function load(file, mocks = {}, extra = '') {
    const filename = path.resolve(__dirname, '../..', file),
        real = createRequire(filename),
        module = { exports: {} };
    vm.runInNewContext(
        fs.readFileSync(filename, 'utf8') + '\n' + extra,
        {
            module,
            exports: module.exports,
            require: (n) => (Object.hasOwn(mocks, n) ? mocks[n] : real(n)),
            process,
            Buffer,
            URL,
            URLSearchParams,
            Date,
            AbortController,
            AbortSignal,
            setTimeout,
            clearTimeout,
            console: { log() {}, warn() {}, error() {} },
        },
        { filename },
    );
    return module.exports;
}
function fakeDb(resolve) {
    const calls = [];
    function query(table, op = 'select', payload) {
        const c = { table, op, payload, filters: [] },
            q = {};
        for (const m of [
            'select',
            'insert',
            'update',
            'upsert',
            'delete',
            'eq',
            'in',
            'ilike',
            'not',
            'gt',
            'gte',
            'lt',
            'lte',
            'is',
            'order',
            'limit',
            'range',
            'single',
            'maybeSingle',
            'abortSignal',
        ])
            q[m] = (...args) => {
                if (['insert', 'update', 'upsert', 'delete'].includes(m)) {
                    c.op = m;
                    c.payload = args[0];
                }
                if (m === 'select') c.columns = args[0];
                if (['eq', 'in', 'ilike', 'not', 'gt', 'gte', 'lt', 'lte', 'is'].includes(m))
                    c.filters.push([m, ...args]);
                return q;
            };
        q.then = (yes, no) => {
            calls.push(c);
            return Promise.resolve()
                .then(() => resolve(c))
                .then(yes, no);
        };
        return q;
    }
    return { calls, from: query, rpc: (name, args) => query(name, 'rpc', args) };
}
const response = () => ({
    code: 200,
    headers: {},
    status(n) {
        this.code = n;
        return this;
    },
    json(b) {
        this.body = b;
        return this;
    },
    setHeader(k, v) {
        this.headers[k] = v;
    },
    end() {},
    redirect(u) {
        this.location = u;
        return this;
    },
});
const request = (body = {}, query = {}, method = 'POST') => ({
    body,
    query,
    method,
    url: '/api/test',
    headers: { 'x-user-id': 'p:school:alice:0', 'x-session-token': 'ab'.repeat(32) },
});
module.exports = { load, fakeDb, response, request };
