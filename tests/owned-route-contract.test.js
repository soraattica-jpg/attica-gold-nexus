import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCallRecordsRoute } from '../modules/call-records/index.js';
import { mountAgentManagementRoute } from '../modules/agent-management/index.js';
import { mountCallControlRoute } from '../modules/call-control/index.js';
import { mountLeadIngestionRoute } from '../modules/lead-ingestion/index.js';
import { mountMarketingRoute } from '../modules/marketing/index.js';
import { mountAutoDialRoute } from '../modules/auto-dial/index.js';
import { mountLocationIvrRoute } from '../modules/location-ivr/index.js';

function fakeApp() {
  const calls = [];
  return { calls, ...Object.fromEntries(['get','post','put','delete','all'].map((method) => [method, (...args) => calls.push([method, ...args])])) };
}

test('feature route owners register valid paths without changing handlers', () => {
  const app = fakeApp();
  const handler = () => {};
  mountCallRecordsRoute(app, 'get', '/api/calls', handler);
  mountAgentManagementRoute(app, 'post', '/api/agents', handler);
  mountCallControlRoute(app, 'get', ['/api/admin/incoming-2of5-gate/status','/api/admin/incoming-5of10-gate/status'], handler);
  mountLeadIngestionRoute(app, 'all', ['/api/justdial/lead-receiver','/api/justdial/lead_receiver'], handler);
  mountMarketingRoute(app, 'get', '/api/warroom/marketing/spend', handler);
  mountAutoDialRoute(app, 'put', '/api/auto-dial/control', handler);
  mountLocationIvrRoute(app, 'get', '/api/call-language/:callerId', handler);
  assert.equal(app.calls.length, 7);
  assert.ok(app.calls.every((call) => call.at(-1) === handler));
});

test('feature route owners reject cross-feature and method mismatches', () => {
  const app = fakeApp();
  assert.throws(() => mountCallRecordsRoute(app, 'post', '/api/calls/transfer', () => {}), /ownership mismatch/);
  assert.throws(() => mountMarketingRoute(app, 'post', '/api/warroom/marketing/spend', () => {}), /ownership mismatch/);
  assert.throws(() => mountAutoDialRoute(app, 'patch', '/api/auto-dial/control', () => {}), /unsupported route method/);
});
