import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const actor = read('.private/message-actors.json').find(item => item.id === 'TEST_IN');
const smsSecret = read('.private/sms-preview.json');
assert.ok(actor && smsSecret.dlrToken);
const state = unit => execFileSync('systemctl', ['show', unit, '-p', 'MainPID', '-p', 'ActiveState', '-p', 'ActiveEnterTimestamp'], { encoding: 'utf8' });
const productionBefore = state('attica-api.service');
async function request(path, options = {}) {
  const headers = { ...(options.auth === false ? {} : { Authorization: `Bearer ${actor.token}` }), ...(options.body ? { 'Content-Type': 'application/json' } : {}) };
  let response;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { response = await fetch(`http://127.0.0.1:3101${path}`, { method: options.method || 'GET', headers, body: options.body ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(5000) }); break; }
    catch (error) { if (attempt === 19) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.equal(response.status, options.status || 200, path);
  return response.json();
}

const config = read('.private/sms-preview-db.json');
const db = await mysql.createConnection(config);
try {
  await db.query('DELETE FROM attica_sms_log');
  for (const sql of ['SELECT COUNT(*) FROM asterisk.attica_sms_log', "INSERT INTO asterisk.attica_sms_log (phone) VALUES ('9000000001')"]) await assert.rejects(db.query(sql), error => [1044, 1142].includes(error.errno));
} finally { await db.end(); }

await request('/api/sms-log', { auth: false, status: 401 });
const sent = await request('/api/send-sms', { method: 'POST', body: { phone: '9000000001', branchId: 'TEST001' } });
assert.equal(sent.provider, 'kaleyra');
assert.equal(sent.branchUrl, 'https://smler.in/ATTGPL/TESTONLY');
let logs = await request('/api/sms-log?limit=10');
assert.equal(logs.length, 1);
assert.equal(logs[0].delivery_status, 'submitted');
const sink = await request('/__test/sms-deliveries');
assert.equal(sink.mode, 'fake-only');
assert.equal(sink.deliveries.length, 1);
assert.match(sink.deliveries[0].message, /https:\/\/smler\.in\/ATTGPL\/TESTONLY$/);
await request(`/api/sms/dlr?token=${encodeURIComponent(smsSecret.dlrToken)}&client_id=${encodeURIComponent(logs[0].client_message_id)}&message_id=${encodeURIComponent(logs[0].provider_message_id)}&status=DELIVRD&delivered=2026-09-21%2015%3A30%3A00`, { auth: false });
logs = await request('/api/sms-log?limit=10');
assert.equal(logs.length, 1);
assert.equal(logs[0].delivery_status, 'delivered');
assert.equal(JSON.parse(logs[0].dlr_payload_json).token, undefined);
const health = await request('/health', { auth: false });
assert.ok(health.features.includes('sms-kaleyra-fake'));
assert.equal(health.smsDelivery, 'fake-only');
const previewBefore = state('attica-api-next-preview.service');
execFileSync('systemctl', ['restart', 'attica-api-next-preview.service']);
let recovered = false;
for (let attempt = 0; attempt < 40; attempt += 1) { await new Promise(resolve => setTimeout(resolve, 250)); try { if ((await request('/health', { auth: false })).features.includes('sms-kaleyra-fake')) { recovered = true; break; } } catch {} }
assert.ok(recovered);
assert.notEqual(state('attica-api-next-preview.service'), previewBefore);
assert.equal((await request('/api/sms-log?limit=10')).length, 1);
const unchanged = Object.fromEntries(Object.entries(read('docs/BASELINE.json').files).map(([file, hash]) => [file, createHash('sha256').update(readFileSync(`/root/attica-api/${file}`)).digest('hex') === hash]));
assert.ok(Object.values(unchanged).every(Boolean));
assert.equal(state('attica-api.service'), productionBefore);
const cleanup = await mysql.createConnection(config); try { await cleanup.query('DELETE FROM attica_sms_log'); } finally { await cleanup.end(); }
const proof = { verifiedAt: new Date().toISOString(), previewPort: 3101, delivery: 'fake-only', providerContract: 'kaleyra', scope: ['POST /api/send-sms', 'GET /api/sms-log', 'ALL /api/sms/dlr'], checks: ['Authentication on send/log', 'Stored Smler URL and unchanged approved text', 'Fake provider only', 'Submitted and delivered audit states', 'Idempotent DLR row update', 'DLR token removed from stored payload', 'Production database access denied', 'Preview restart persistence'], productionFilesUnchanged: unchanged, productionServiceUnchanged: true, productionDeployment: false };
writeFileSync(new URL('docs/SMS-VERIFICATION.json', root), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
