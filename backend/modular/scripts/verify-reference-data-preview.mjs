import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const actor = readJson('.private/message-actors.json').find((item) => item.id === 'TEST_ADMIN1');
const serviceState = (name) => execFileSync('systemctl', ['show', name, '-p', 'MainPID', '-p', 'ActiveState'], { encoding: 'utf8' });
const productionBefore = serviceState('attica-api.service');

async function request(path, { method = 'GET', body, auth = true, status = 200 } = {}) {
  const response = await fetch(`http://127.0.0.1:3101${path}`, {
    method,
    headers: { ...(auth ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  return response.json();
}

execFileSync('systemctl', ['restart', 'attica-api-next-preview.service']);
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    if ((await request('/health', { auth: false })).features.includes('reference-data-synthetic')) break;
  } catch (error) {
    if (attempt === 29) throw error;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
await request('/api/rates', { auth: false, status: 401 });
assert.ok((await request('/api/rates')).some((row) => row.label === 'Gold'));
await request('/api/rates', { method: 'POST', body: { label: 'TEST_METAL', value: '42' } });
assert.ok((await request('/api/rates')).some((row) => row.label === 'TEST_METAL'));
await request('/api/rates', { method: 'DELETE', body: {}, status: 400 });
await request('/api/rates', { method: 'DELETE', body: { label: 'TEST_METAL' } });
await request('/api/pledge-places', { method: 'PUT', body: { places: ['TEST_FINANCE', 'Other'] } });
assert.deepEqual((await request('/api/pledge-places')).places, ['TEST_FINANCE', 'Other']);

execFileSync('systemctl', ['restart', 'attica-api-next-preview.service']);
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    if ((await request('/api/pledge-places')).places.includes('Muthoot Finance')) break;
  } catch (error) {
    if (attempt === 29) throw error;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
assert.ok(!(await request('/api/rates')).some((row) => row.label === 'TEST_METAL'));
const manifest = readJson('docs/BASELINE.json');
const unchanged = Object.fromEntries(Object.entries(manifest.files).map(([file, hash]) => [file, createHash('sha256').update(readFileSync(`/root/attica-api/${file}`)).digest('hex') === hash]));
assert.ok(Object.values(unchanged).every(Boolean));
assert.equal(serviceState('attica-api.service'), productionBefore);
const proof = { verifiedAt: new Date().toISOString(), scope: ['GET/PUT/POST/DELETE /api/rates', 'GET/PUT /api/pledge-places'], checks: ['Authentication', 'Rate lifecycle', 'Validation contract', 'Pledge-place lifecycle', 'Restart resets synthetic mutations', 'Production isolation'], productionFilesUnchanged: unchanged, productionServiceUnchanged: true, productionDeployment: false };
writeFileSync(new URL('docs/REFERENCE-DATA-VERIFICATION.json', root), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
