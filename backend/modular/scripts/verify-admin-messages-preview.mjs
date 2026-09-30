// Exercises synthetic messages on loopback 3101 only. Never prints credentials.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';

const root = new URL('../', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const actors = read('.private/message-actors.json');
const admin = actors.find(a => a.id === 'TEST_ADMIN1');
const agent = actors.find(a => a.id === 'TEST_IN');
assert.ok(admin && agent);
const serviceState = (unit) => execFileSync('systemctl', ['show', unit, '-p', 'MainPID', '-p', 'ActiveState', '-p', 'ActiveEnterTimestamp'], { encoding: 'utf8' });
const productionBefore = serviceState('attica-api.service');
const config = read('.private/messages-preview-db.json');
assert.equal(config.database, 'attica_next_messages_preview');
assert.equal(config.user, 'attica_msg_preview');
const db = await mysql.createConnection(config);
const checks = [];
async function request(path, { method = 'GET', actor, body, status = 200 } = {}) {
  const response = await fetch('http://127.0.0.1:3101' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, status, method + ' ' + path);
  return response.json();
}
try {
  for (const sql of ['SELECT COUNT(*) FROM asterisk.attica_agents', 'UPDATE asterisk.attica_agents SET admin_message=admin_message WHERE 1=0']) {
    await assert.rejects(db.query(sql), error => [1044, 1142].includes(error.errno));
  }
  checks.push('Production reads and writes denied by message database grants');
  await request('/api/admin-broadcast', { method: 'POST', body: { message: 'Rejected' }, status: 401 });
  await request('/api/admin-broadcast', { method: 'POST', actor: agent, body: { message: 'Rejected', sentById: admin.id }, status: 403 });
  await request('/api/admin-broadcast/history', { actor: agent, status: 403 });
  await request('/api/admin-broadcast?agentId=TEST_OUT', { actor: agent, status: 403 });
  await request('/api/agents/TEST_IN', { method: 'PUT', actor: admin, body: { status: 'active', adminMessage: 'Rejected mixed payload' }, status: 405 });
  checks.push('Authentication, role restrictions, agent isolation and mixed updates denied');
  await request('/api/agents/TEST_IN', { method: 'PUT', actor: admin, body: { adminMessage: 'Private staging verification' } });
  const sent = await request('/api/admin-broadcast', { method: 'POST', actor: admin,
    body: { message: 'Staging restart verification', recipientScope: 'all', expiry: 'until-cleared', sentById: 'FORGED', sentByName: 'FORGED' } });
  assert.equal(sent.broadcast.sentById, admin.id);
  const before = await request('/api/admin-broadcast?agentId=TEST_IN', { actor: agent });
  assert.equal(before.message, 'Staging restart verification  •  Private staging verification');
  const events = await request('/__test/admin-message-events', { actor: admin });
  assert.equal(events.mode, 'test-only');
  assert.ok(events.events.some(e => e.kind === 'broadcast'));
  assert.ok(events.events.every(e => !('message' in e) && !('token' in e)));
  checks.push('Private and broadcast display combine correctly; audit uses authenticated sender; delivery is metadata-only test sink');
  const previewBefore = serviceState('attica-api-next-preview.service');
  execFileSync('systemctl', ['restart', 'attica-api-next-preview.service']);
  let healthy = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    try { const health = await request('/health'); healthy = health.messageDelivery === 'test-only'; if (healthy) break; } catch {}
  }
  assert.ok(healthy, 'Preview restart recovery');
  assert.notEqual(serviceState('attica-api-next-preview.service'), previewBefore);
  assert.deepEqual(await request('/api/admin-broadcast?agentId=TEST_IN', { actor: agent }), before);
  checks.push('Persisted private/broadcast message survives preview restart and agent reconnect/intake open');
  await request('/api/admin-broadcast', { method: 'DELETE', actor: admin, body: { clearedById: 'FORGED' } });
  assert.equal((await request('/api/admin-broadcast?agentId=TEST_IN', { actor: agent })).message, 'Private staging verification');
  const history = await request('/api/admin-broadcast/history', { actor: admin });
  const audit = history.find(row => row.id === sent.broadcast.id);
  assert.equal(audit.clearedById, admin.id); assert.equal(audit.active, false);
  checks.push('Clear updates agent display and retains sender/clear audit');
  assert.equal((await request('/api/branches')).length, 197);
  await request('/api/branches', { method: 'POST', body: {}, status: 405 });
  checks.push('Branches remains read-only and retains 197 active snapshot rows');
} finally {
  // Only isolated synthetic fixture cleanup, even after a failed assertion.
  await db.query('UPDATE attica_admin_broadcasts SET is_active=0, cleared_by_id=?, cleared_at=NOW() WHERE is_active=1', ['TEST_ADMIN1']);
  await db.query('UPDATE attica_agents SET admin_message=NULL WHERE id=?', ['TEST_IN']);
  await db.end();
}
const unchanged = Object.fromEntries(Object.entries(read('docs/BASELINE.json').files).map(([file, hash]) => [file,
  createHash('sha256').update(readFileSync('/root/attica-api/' + file)).digest('hex') === hash]));
assert.ok(Object.values(unchanged).every(Boolean));
assert.equal(serviceState('attica-api.service'), productionBefore);
const proof = { verifiedAt: new Date().toISOString(), previewPort: 3101, delivery: 'test-only', checks,
  productionFilesUnchanged: unchanged, productionServiceUnchanged: true, productionDeployment: false };
writeFileSync(new URL('docs/ADMIN-MESSAGES-VERIFICATION.json', root), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
