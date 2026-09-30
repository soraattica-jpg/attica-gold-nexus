import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrunkRouter } from './trunk-router.service.js';
import { getChannelCapacity } from './channel-capacity.service.js';
import { TATA_NEW, isAuthorizedTataNewCli, isTataNewDid, normalizeTataNewDid } from './trunks/tata-new.config.js';

test('new Tata DID normalization accepts the pilot and activated range formats', () => {
  assert.equal(normalizeTataNewDid('+91 8065200221'), '8065200221');
  assert.equal(normalizeTataNewDid('08065200221'), '8065200221');
  assert.equal(normalizeTataNewDid('65200221'), '8065200221');
  assert.equal(isTataNewDid('8065200220'), true);
  assert.equal(isTataNewDid('8065200399'), true);
  assert.equal(isTataNewDid('8065200400'), false);
  assert.equal(isAuthorizedTataNewCli('8065200220'), false);
  assert.equal(isAuthorizedTataNewCli('8065200221'), true);
  assert.equal(isAuthorizedTataNewCli('8065200399'), true);
});

test('manual trunk selection defaults to existing Tata and never fails over automatically', async () => {
  let primary = '';
  const router = createTrunkRouter({
    readPrimary: async () => primary,
    writePrimary: async (value) => { primary = value; },
    readHealth: async () => ({ available: false }),
  });
  assert.equal(await router.getPrimary(), 'TATA_PRIMARY');
  await router.setPrimary('TATA_NEW');
  const selected = await router.selectOutbound();
  assert.equal(selected.trunk.code, 'TATA_NEW');
  assert.equal(selected.automaticFailover, false);
  assert.match(selected.warning, /manual route change/i);
  await assert.rejects(router.setPrimary('UNKNOWN'), /TATA_PRIMARY or TATA_NEW/);
});

test('new Tata capacity reserves ten channels for incoming traffic', () => {
  assert.deepEqual(getChannelCapacity(TATA_NEW, { incoming: 7, outgoing: 25 }), {
    capacity: 60, active: 32, incoming: 7, outgoing: 25, free: 28, outboundLimit: 50, canStartOutbound: true,
  });
  assert.equal(getChannelCapacity(TATA_NEW, { incoming: 0, outgoing: 50 }).canStartOutbound, false);
  assert.equal(getChannelCapacity(TATA_NEW, { incoming: 11, outgoing: 49 }).canStartOutbound, false);
});
