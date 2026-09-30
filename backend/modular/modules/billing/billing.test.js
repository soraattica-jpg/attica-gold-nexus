import assert from 'node:assert/strict';
import test from 'node:test';
import { createBillingService } from './billing.service.js';

function fixture(overrides = {}) {
  const calls = [];
  const repository = {
    normalizeDate: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '',
    normalizeContact: value => {
      const digits = String(value || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      return /^\d{10}$/.test(digits) ? digits : '';
    },
    listRows: async (date, limit, options) => { calls.push(['listRows', date, limit, options]); return [{ billId: 'B-1' }]; },
    lastSyncedAt: async date => { calls.push(['lastSyncedAt', date]); return '2026-09-20T10:00:00.000Z'; },
    toIsoString: value => value,
    syncIfStale: async () => { calls.push(['sync']); },
    cachedRemoteByPhone: async phone => { calls.push(['remote', phone]); return []; },
    localByPhone: async phone => { calls.push(['local', phone]); return [{ contact: phone, type: 'local' }]; },
    remoteLookup: async phone => { calls.push(['external', phone]); return { ok: true, payload: [] }; },
    hasPayloadRows: payload => Array.isArray(payload) ? payload.length > 0 : Boolean(payload && Object.keys(payload).length),
    ...overrides,
  };
  return { service: createBillingService(repository), calls };
}

test('billing list preserves date, source, force and safe limit response', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.list({ date: '2026-09-20', limit: '99999', force: 'refresh' }), {
    date: '2026-09-20', source: 'atticagold.biz', total: 1, results: [{ billId: 'B-1' }], lastSyncedAt: '2026-09-20T10:00:00.000Z',
  });
  assert.deepEqual(calls[0], ['listRows', '2026-09-20', 10000, { force: true }]);
});

test('invalid contact returns empty without database or network access', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.lookup({ contact: 'invalid' }), []);
  assert.deepEqual(calls, []);
});

test('strict lookup returns cached remote rows and skips local/network', async () => {
  const remote = [{ billId: 'B-1' }];
  const { service, calls } = fixture({ cachedRemoteByPhone: async phone => { calls.push(['remote', phone]); return remote; } });
  assert.deepEqual(await service.lookup({ contact: '+91 90000 00001', strict: 'yes' }), remote);
  assert.deepEqual(calls, [['sync'], ['remote', '9000000001']]);
});

test('normal lookup combines cached billing and local customer rows', async () => {
  const { service } = fixture({ cachedRemoteByPhone: async () => [{ billId: 'B-1' }] });
  const rows = await service.lookup({ contact: '9000000001' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].billId, 'B-1');
  assert.equal(rows[1].type, 'local');
});

test('strict remote failure returns empty and normal failure falls back to local', async () => {
  const failing = { remoteLookup: async () => { throw new Error('offline'); } };
  assert.deepEqual(await fixture(failing).service.lookup({ contact: '9000000001', strict: '1' }), []);
  assert.deepEqual(await fixture(failing).service.lookup({ contact: '9000000001' }), [{ contact: '9000000001', type: 'local' }]);
});

test('remote payload is returned without rewriting its legacy shape', async () => {
  const payload = { data: [{ contact: '9000000001', billId: 'REMOTE-1' }] };
  const { service } = fixture({ localByPhone: async () => [], remoteLookup: async () => ({ ok: true, payload }) });
  assert.equal(await service.lookup({ contact: '9000000001' }), payload);
});

test('strict non-OK remote response retains legacy local fallback', async () => {
  const { service } = fixture({ remoteLookup: async () => ({ ok: false, payload: [] }) });
  assert.deepEqual(await service.lookup({ contact: '9000000001', strict: 'true' }), [{ contact: '9000000001', type: 'local' }]);
});
