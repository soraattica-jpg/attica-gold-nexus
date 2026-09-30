import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const actor = read('.private/message-actors.json').find(item => item.id === 'TEST_IN');
assert.ok(actor);
const state = unit => execFileSync('systemctl', ['show', unit, '-p', 'MainPID', '-p', 'ActiveState', '-p', 'ActiveEnterTimestamp'], { encoding: 'utf8' });
const productionBefore = state('attica-api.service');

async function request(path, { auth = true, status = 200 } = {}) {
  let response;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:3101${path}`, { headers: auth ? { Authorization: `Bearer ${actor.token}` } : {}, signal: AbortSignal.timeout(5000) });
      break;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  assert.equal(response.status, status, path);
  return response.json();
}

const config = read('.private/billing-db.json');
const db = await mysql.createConnection(config);
try {
  await assert.rejects(db.query("UPDATE attica_remote_customer_data SET status='x' WHERE remote_id='TEST-BILL-2'"), error => error.errno === 1142);
  for (const sql of ['SELECT COUNT(*) FROM asterisk.attica_remote_customer_data', 'UPDATE asterisk.attica_remote_customer_data SET status=status WHERE 1=0']) {
    await assert.rejects(db.query(sql), error => [1044, 1142].includes(error.errno));
  }
} finally {
  await db.end();
}

await request('/api/customerdata/list?date=2026-09-20', { auth: false, status: 401 });
const list = await request('/api/customerdata/list?date=2026-09-20&limit=50');
assert.equal(list.source, 'atticagold.biz');
assert.equal(list.total, 1);
assert.equal(list.results[0].billId, 'TEST-INVOICE-2');
assert.equal(list.results[0].billAmount, 150000);
const combined = await request('/api/customerdata?contact=%2B919000000001');
assert.equal(combined.length, 2);
assert.equal(combined[0].billId, 'TEST-INVOICE-2');
const strict = await request('/api/customerdata?contact=9000000001&strict=true');
assert.equal(strict.length, 1);
assert.equal(strict[0].billId, 'TEST-INVOICE-2');
assert.deepEqual(await request('/api/customerdata?contact=invalid'), []);
const health = await request('/health', { auth: false });
assert.ok(health.features.includes('billing-lookup'));
assert.equal(health.externalBillingSync, false);

const previewBefore = state('attica-api-next-preview.service');
execFileSync('systemctl', ['restart', 'attica-api-next-preview.service']);
let recovered = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250));
  try {
    if ((await request('/health', { auth: false })).features.includes('billing-lookup')) { recovered = true; break; }
  } catch {}
}
assert.ok(recovered);
assert.notEqual(state('attica-api-next-preview.service'), previewBefore);
assert.equal((await request('/api/customerdata/list?date=2026-09-20')).total, 1);

const unchanged = Object.fromEntries(Object.entries(read('docs/BASELINE.json').files).map(([file, hash]) => [file, createHash('sha256').update(readFileSync(`/root/attica-api/${file}`)).digest('hex') === hash]));
assert.ok(Object.values(unchanged).every(Boolean));
assert.equal(state('attica-api.service'), productionBefore);
const proof = {
  verifiedAt: new Date().toISOString(),
  previewPort: 3101,
  dataset: 'synthetic-select-only',
  externalBillingSync: false,
  scope: ['GET /api/customerdata/list', 'GET /api/customerdata'],
  checks: ['Authentication required', 'Date list and stable billing fields', 'Normalized +91 lookup', 'Strict and combined lookup behavior', 'Database writes and production access denied', 'No external customer-data calls in preview', 'Preview restart persistence'],
  productionFilesUnchanged: unchanged,
  productionServiceUnchanged: true,
  productionDeployment: false,
};
writeFileSync(new URL('docs/BILLING-VERIFICATION.json', root), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
