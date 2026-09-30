import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import mysql from 'mysql2/promise';
import { createBranchesModule, mountBranchesCatalog, mountBranchesAutocomplete } from '../modules/branches/index.js';
import { parseSource, readBaseline, branchPaths, routeCall } from '../scripts/source-tools.js';
import { createFixtureGeocoding } from './fixtures/staging.js';
const source = readBaseline();
const legacyCode = parseSource(source).body.filter((node) =>
  (node.type === 'FunctionDeclaration' && ['serializeBranchRow', 'cleanJustDialString'].includes(node.id.name))
  || (node.expression && routeCall(node.expression) && branchPaths.has(node.expression.arguments[0]?.value)))
  .map((node) => source.slice(node.start, node.end)).join('\n');
const config = JSON.parse(readFileSync('/etc/attica-next/contract-db.json', 'utf8'));
assert.equal(config.database, 'attica_api_next_contract');
assert.equal(config.user, 'attica_next_test');
function handlers(db, legacy) {
  const map = new Map();
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [method, (path, fn) => map.set(method + ' ' + path, fn)]));
  const geocoding = createFixtureGeocoding();
  if (legacy) vm.runInNewContext(legacyCode, { app, pool: db, ...geocoding, console });
  else {
    const controller = createBranchesModule({ db, geocoding });
    mountBranchesCatalog(app, controller); mountBranchesAutocomplete(app, controller);
  }
  return async (route, request = {}) => {
    let status = 200, body;
    const res = { status(code) { status = code; return this; }, json(value) { body = JSON.parse(JSON.stringify(value)); return this; } };
    await map.get(route)({ query: {}, body: {}, params: {}, ...request }, res);
    return { status, body };
  };
}

test('real MariaDB snapshot: list, sorting, ignored pagination/filters, autocomplete and nearby parity', async () => {
  const db = await mysql.createConnection(config);
  try {
    const old = handlers(db, true), next = handlers(db, false);
    const queries = [
      ['get /api/branches', {}],
      ['get /api/branches', { query: { page: '2', limit: '1', state: 'does-not-filter', sort: 'name' } }],
      ['get /api/branches/autocomplete', { query: { q: 'Ban' } }],
      ['get /api/branches/autocomplete', { query: { q: '%' } }],
      ['get /api/branches/autocomplete', { query: { q: 'zzzz-no-match' } }],
      ['get /api/branches/search-nearby', { query: { lat: '12.97', lng: '77.59' } }],
      ['get /api/branches/search-nearby', { query: { lat: '0', lng: '0' } }],
      ['get /api/branches/search-nearby', { query: { location: 'Bangalore' } }],
      ['get /api/branches/search-nearby', { query: { location: 'zzzz-no-match' } }],
    ];
    for (const [route, req] of queries) assert.deepEqual(await next(route, req), await old(route, req), route);
    const list = await next('get /api/branches');
    assert.ok(list.body.length > 150, 'Use actual branch snapshot rather than synthetic rows');
    assert.deepEqual(await next('get /api/branches', queries[1][1]), list);
  } finally { await db.end(); }
});

test('real MariaDB: create, update, soft delete, validation and stored column parity; rollback all writes', async () => {
  const db = await mysql.createConnection(config);
  const id = 'NEXT-CONTRACT-DO-NOT-USE';
  try {
    const [[existing]] = await db.query('SELECT COUNT(*) AS n FROM wp_branches_database WHERE branchId=?', [id]);
    assert.equal(existing.n, 0);
    const run = async (legacy) => {
      await db.beginTransaction();
      try {
        const request = handlers(db, legacy), outputs = [];
        outputs.push(await request('post /api/branches', { body: { branchId: id } }));
        outputs.push(await request('post /api/branches', { body: { branchId: id, branchName: 'Staging Only', mapUrl: 'https://example.invalid/map', bitlyUrl: 'https://example.invalid/s' } }));
        outputs.push(await request('put /api/branches/:id', { params: { id }, body: { map_url: 'snake', mapUrl: 'camel', bitly_url: 'short', bitlyUrl: 'alias', unsupported: true } }));
        outputs.push(await request('put /api/branches/:id', { params: { id }, body: { unsupported: true } }));
        outputs.push(await request('delete /api/branches/:id', { params: { id } }));
        const [[row]] = await db.query('SELECT * FROM wp_branches_database WHERE branchId=?', [id]);
        delete row.id; // Auto-increment gaps after rollback are not part of any API response.
        assert.equal(row.status, 0);
        assert.equal(row.map_url, 'camel');
        return JSON.parse(JSON.stringify({ outputs, row }));
      } finally { await db.rollback(); }
    };
    assert.deepEqual(await run(false), await run(true));
    const [[left]] = await db.query('SELECT COUNT(*) AS n FROM wp_branches_database WHERE branchId=?', [id]);
    assert.equal(left.n, 0);
    await assert.rejects(db.query('SELECT COUNT(*) FROM asterisk.wp_branches_database'), (error) => [1142, 1044].includes(error.errno));
  } finally { await db.end(); }
});

test('preview account: database-level writes and production reads denied; error response parity', async () => {
  const preview = JSON.parse(readFileSync('/etc/attica-next/preview-db.json', 'utf8'));
  assert.equal(preview.database, 'attica_api_next_preview');
  const db = await mysql.createConnection(preview);
  try {
    // WHERE 1=0 makes this check safe even if privileges were mistakenly broader.
    await assert.rejects(db.query('UPDATE wp_branches_database SET status=status WHERE 1=0'), (error) => [1142, 1044].includes(error.errno));
    await assert.rejects(db.query('SELECT COUNT(*) FROM asterisk.wp_branches_database'), (error) => [1142, 1044].includes(error.errno));
    const request = { params: { id: 'DOES-NOT-EXIST' }, body: { branchName: 'Test' } };
    const original = await handlers(db, true)('put /api/branches/:id', request);
    assert.equal(original.status, 500);
    assert.deepEqual(await handlers(db, false)('put /api/branches/:id', request), original);
  } finally { await db.end(); }
});
