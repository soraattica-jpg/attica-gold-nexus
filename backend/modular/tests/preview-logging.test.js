import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.js';
import { createFixtureGeocoding } from './fixtures/staging.js';

test('request and handled-error logs include correlation/status but exclude query/body/SQL secrets', async (t) => {
  const logs = [];
  const logger = { info: (line) => logs.push(JSON.parse(line)), error: (line) => logs.push(JSON.parse(line)) };
  const app = createApp({
    db: { query: async () => { const error = new Error('private-database-message'); error.code = 'ER_TEST_FAILURE'; throw error; } },
    geocoding: createFixtureGeocoding(), logger, staging: true,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(url + '/api/branches?token=private-query-value');
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'private-database-message'); // Existing API contract preserved.
  await fetch(url + '/api/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"private-message"}' });
  await fetch(url + '/api/branches/autocomplete?q=private-search'); // Existing error fallback stays 200.
  assert.ok(logs.some((entry) => entry.event === 'request_error' && entry.code === 'ER_TEST_FAILURE'));
  assert.ok(logs.some((entry) => entry.event === 'request' && entry.status === 500));
  assert.ok(logs.some((entry) => entry.event === 'request' && entry.status === 405));
  assert.ok(logs.some((entry) => entry.event === 'request' && entry.status === 200));
  assert.ok(logs.every((entry) => entry.requestId));
  assert.doesNotMatch(JSON.stringify(logs), /private-query-value|private-message|private-search|private-database-message/);
});
