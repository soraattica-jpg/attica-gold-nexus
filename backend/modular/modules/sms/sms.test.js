import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmsService } from './sms.service.js';
import { normalizeSmsDateTime, normalizeSmsDeliveryStatus } from './sms.validation.js';
import { createKaleyraClient } from '../../integrations/sms/providers/kaleyra.client.js';

function fixture(overrides = {}) {
  const calls = [];
  const repository = {
    getBranch: async id => ({ branchName: 'Test Branch', url: 'https://maps.invalid/long', map_url: 'https://maps.invalid/map', bitly_url: 'https://smler.in/ATTGPL/test', branchId: id }),
    createQueued: async value => { calls.push(['queued', value]); return 7; },
    markSent: async (...args) => calls.push(['sent', ...args]),
    markFailed: async (...args) => calls.push(['failed', ...args]),
    list: async limit => [{ id: 1, limit }],
    findByClientId: async value => value === 'client-1' ? 7 : null,
    findByProviderId: async () => null,
    findPendingByRecipient: async () => null,
    updateDelivery: async (...args) => calls.push(['delivery', ...args]),
    ...overrides.repository,
  };
  const provider = {
    provider: 'kaleyra', smsType: 'TXN', readDlrToken: () => 'test-token',
    send: async value => { calls.push(['provider', value]); return { data: [{ message_id: 'provider-1' }], message: 'Accepted' }; },
    getMessageId: value => value.data[0].message_id,
    ...overrides.provider,
  };
  return { service: createSmsService(repository, provider, { createClientId: () => 'client-1' }), calls };
}

test('SMS send keeps approved text and uses stored short URL without rewriting', async () => {
  const { service, calls } = fixture();
  const result = await service.send({ phone: '9000000001', branchId: 'B1' });
  assert.equal(result.status, 200);
  assert.equal(result.payload.branchUrl, 'https://smler.in/ATTGPL/test');
  assert.equal(result.payload.provider, 'kaleyra');
  assert.equal(calls[0][1].message, 'Dear Customer, Thank you for choosing Attica Gold Company, Click the link to find your nearest branch: https://smler.in/ATTGPL/test');
  assert.equal(calls[1][1].clientMessageId, 'client-1');
  assert.equal(calls[2][0], 'sent');
});

test('SMS send validates required input, branch and map URL', async () => {
  assert.equal((await fixture().service.send({})).status, 400);
  assert.equal((await fixture({ repository: { getBranch: async () => null } }).service.send({ phone: '1', branchId: 'x' })).status, 404);
  assert.equal((await fixture({ repository: { getBranch: async () => ({ branchName: 'x' }) } }).service.send({ phone: '1', branchId: 'x' })).status, 400);
});

test('provider failure marks the same queued SMS failed', async () => {
  const { service, calls } = fixture({ provider: { send: async () => { throw new Error('provider offline'); } } });
  await assert.rejects(service.send({ phone: '9000000001', branchId: 'B1' }), /provider offline/);
  assert.deepEqual(calls.at(-1), ['failed', 7, 'provider offline']);
});

test('SMS log limit stays within legacy 1 to 1000 bounds', async () => {
  assert.equal((await fixture().service.list({ limit: '9999' }))[0].limit, 1000);
  assert.equal((await fixture().service.list({ limit: '0' }))[0].limit, 200);
});

test('DLR verifies token, matches client id and removes token before storage', async () => {
  const { service, calls } = fixture();
  assert.equal((await service.delivery({ token: 'bad' })).status, 401);
  const result = await service.delivery({ token: 'test-token', client_id: 'client-1?', status: 'DELIVRD', delivered: '2026-09-21 15:30:00', message_id: 'provider-1', country: 'India' });
  assert.deepEqual(result, { status: 200, payload: { success: true, matched: true } });
  const saved = calls.find(call => call[0] === 'delivery')[2];
  assert.equal(saved.deliveryStatus, 'delivered');
  assert.equal(saved.status, 'delivered');
  assert.equal(JSON.parse(saved.serializedPayload).token, undefined);
});

test('unmatched DLR remains successful and idempotent', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.delivery({ token: 'test-token', client_id: 'missing', status: 'sent' }), { status: 200, payload: { success: true, matched: false } });
  assert.equal(calls.length, 0);
});

test('delivery status and India-local timestamp mapping retain legacy behavior', () => {
  assert.equal(normalizeSmsDeliveryStatus('undelivrd'), 'failed');
  assert.equal(normalizeSmsDeliveryStatus('awaiting_dlr'), 'submitted');
  assert.equal(normalizeSmsDateTime('2026-09-21 15:30:00'), '2026-09-21 10:00:00');
});

test('Kaleyra client builds provider payload and detects provider errors', async () => {
  let request;
  const client = createKaleyraClient({ apiDomain: 'https://api.invalid/', sender: 'ATTGPL', smsType: 'TXN', templateId: 'T1', publicBaseUrl: 'https://attica.invalid/', readApiKey: () => 'key', readSid: () => 'sid', readDlrToken: () => 'token', fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, text: async () => '{"data":[{"message_id":"m1"}]}' }; } });
  const result = await client.send({ phone: '9000000001', message: 'hello', clientMessageId: 'c1' });
  assert.equal(client.getMessageId(result), 'm1');
  assert.equal(request.url, 'https://api.invalid/v2/sid/messages');
  const body = JSON.parse(request.options.body);
  assert.equal(body.to, '+919000000001');
  assert.equal(body.callback.url, 'https://attica.invalid/api/sms/dlr?token=token&client_id=c1');
});
