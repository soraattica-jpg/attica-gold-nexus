import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPAIGN_CALL_SOURCE,
  CAMPAIGN_CARRIER_TRUNK,
  classifyCallAttribution,
} from './call-attribution.service.js';

test('new Tata inbound receives Campaign Calls business and carrier attribution', () => {
  assert.deepEqual(classifyCallAttribution({
    direction: 'Incoming',
    callSource: 'Incoming',
    carrierTrunk: 'CAMPAIGN_CALLS',
    trunkCode: 'CAMPAIGN_CALLS',
    pilot: '8065200220',
    didOrCli: '+91 8065200225',
  }), {
    direction: 'incoming',
    callSource: CAMPAIGN_CALL_SOURCE,
    carrierTrunk: CAMPAIGN_CARRIER_TRUNK,
    trunkCode: CAMPAIGN_CARRIER_TRUNK,
    pilot: '8065200220',
    didOrCli: '8065200225',
  });
});

test('new Tata outbound keeps its existing business source', () => {
  const result = classifyCallAttribution({
    direction: 'Outgoing',
    callSource: 'Auto Dial',
    carrierTrunk: 'CAMPAIGN_CALLS',
    trunkCode: 'TATA_NEW',
    pilot: '8065200220',
    didOrCli: '8065200225',
  });
  assert.equal(result.callSource, 'Auto Dial');
  assert.equal(result.carrierTrunk, CAMPAIGN_CARRIER_TRUNK);
  assert.notEqual(result.callSource, CAMPAIGN_CALL_SOURCE);
});

test('existing Tata incoming remains Incoming', () => {
  const result = classifyCallAttribution({
    direction: 'incoming',
    callSource: 'Incoming',
    carrierTrunk: 'PRIMARY_TATA',
    trunkCode: 'TATA_PRIMARY',
    pilot: '8068711200',
    didOrCli: '8068711204',
  });
  assert.equal(result.callSource, 'Incoming');
  assert.equal(result.carrierTrunk, 'PRIMARY_TATA');
});
