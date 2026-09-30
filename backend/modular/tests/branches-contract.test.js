import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createApp } from '../app.js';
import { createBranchesModule, mountBranchesCatalog, mountBranchesAutocomplete } from '../modules/branches/index.js';
import { parseSource, readBaseline, branchPaths, adminPaths, adminHelperNames, adminConstantNames, customerHistoryPaths, reportCorePaths, billingPaths, smsPaths, followupPaths, intakePaths, agentStatusPaths, referenceDataPaths, legacyRouteOwner, routeCall, projectRoot } from '../scripts/source-tools.js';
import { createFixtureDb, createFixtureGeocoding } from './fixtures/staging.js';

const baseline = readBaseline();
const ast = parseSource(baseline);
const oldStatements = ast.body.filter((node) =>
  (node.type === 'FunctionDeclaration' && ['serializeBranchRow', 'cleanJustDialString'].includes(node.id.name))
  || (node.expression && routeCall(node.expression) && branchPaths.has(node.expression.arguments[0]?.value)));
const oldCode = oldStatements.map((node) => baseline.slice(node.start, node.end)).join('\n');
const branch = {
  branchId: 'TEST001', branchName: 'Test Branch', addressline: 'Test Address', area: 'Area', city: 'City', state: 'State',
  pincode: '000000', timings: 'Test hours', latitude: '12.9', longitude: '77.6',
  url: 'https://example.invalid/legacy', map_url: '  https://example.invalid/maps\u0000  ', bitly_url: 'https://example.invalid/short',
};
const json = (value) => JSON.parse(JSON.stringify(value));

function harness(spec, legacy) {
  const operations = [], geocodeCalls = [], logs = [], handlers = new Map();
  let queryIndex = 0;
  const db = { async query(sql, params) {
    operations.push({ sql: sql.trim().replace(/\s+/g, ' '), params: params === undefined ? null : params });
    const outcome = (spec.outcomes || [])[queryIndex++];
    if (!outcome) throw new Error('Unexpected query');
    if (outcome.error) throw new Error(outcome.error);
    return [structuredClone(outcome.rows || [])];
  } };
  const logger = { error: (...args) => logs.push(args) };
  const geocoding = {
    hasGooglePlacesApiKey: () => Boolean(spec.googleEnabled),
    geocodeGooglePlace: async (args) => {
      geocodeCalls.push(['google', args]);
      if (spec.googleError) throw new Error(spec.googleError);
      return spec.google || null;
    },
    geocodePhotonPlace: async (args) => {
      geocodeCalls.push(['photon', args]);
      if (spec.photonError) throw new Error(spec.photonError);
      return spec.photon || null;
    },
  };
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [method, (path, fn) => handlers.set(method + ' ' + path, fn)]));
  if (legacy) {
    vm.runInNewContext(oldCode, { app, pool: db, console: logger, ...geocoding });
  } else {
    const controller = createBranchesModule({ db, geocoding, logger });
    mountBranchesCatalog(app, controller);
    mountBranchesAutocomplete(app, controller);
  }
  return { async run() {
    let status = 200, body;
    const res = { status(code) { status = code; return this; }, json(value) { body = json(value); return this; } };
    const req = { body: {}, params: { id: 'TEST001' }, query: {}, ...spec.request };
    await handlers.get(spec.route)(req, res);
    assert.equal(queryIndex, (spec.outcomes || []).length, 'every expected query must execute');
    return json({ status, body, operations, geocodeCalls, logs });
  } };
}

const cases = [
  { name: 'list maps branch fields and URL precedence', route: 'get /api/branches', outcomes: [{ rows: [branch] }] },
  { name: 'list empty', route: 'get /api/branches', outcomes: [{ rows: [] }] },
  { name: 'list preserves database failure', route: 'get /api/branches', outcomes: [{ error: 'database unavailable' }] },
  { name: 'legacy URL and aliases', route: 'get /api/branches', outcomes: [{ rows: [{ branchId: 'TEST', url: '\nhttps://example.invalid/map\t', bitlyUrl: ' https://example.invalid/s ' }, { branchId: 'TEST2', bitly_url: 'https://example.invalid/only-short' }] }] },
  { name: 'long URL truncation', route: 'get /api/branches', outcomes: [{ rows: [{ ...branch, map_url: 'a'.repeat(1100) }] }] },
  { name: 'create requires ID', route: 'post /api/branches', request: { body: { branchName: 'Test' } } },
  { name: 'create requires name', route: 'post /api/branches', request: { body: { branchId: 'TEST001' } } },
  { name: 'create defaults', route: 'post /api/branches', request: { body: { branchId: 'TEST001', branchName: 'Test' } }, outcomes: [{}] },
  { name: 'create full payload and aliases', route: 'post /api/branches', request: { body: { ...branch, mapUrl: ' https://example.invalid/new\u0000 ', bitlyUrl: 'https://example.invalid/new-short', ignored: 'value' } }, outcomes: [{}] },
  { name: 'create database error', route: 'post /api/branches', request: { body: branch }, outcomes: [{ error: 'duplicate branch' }] },
  { name: 'update rejects empty', route: 'put /api/branches/:id' },
  { name: 'update ignores unsupported fields', route: 'put /api/branches/:id', request: { body: { forgedColumn: 'bad' } } },
  { name: 'update explicit null and zero', route: 'put /api/branches/:id', request: { body: { branchName: null, status: 0, timings: '' } }, outcomes: [{}] },
  { name: 'update preserves duplicate alias precedence', route: 'put /api/branches/:id', request: { body: { map_url: 'snake', mapUrl: 'camel', bitly_url: 'short-snake', bitlyUrl: 'short-camel' } }, outcomes: [{}] },
  { name: 'update parameterizes identity', route: 'put /api/branches/:id', request: { params: { id: "TEST' OR 1=1" }, body: { branchName: 'Test' } }, outcomes: [{}] },
  { name: 'update database failure', route: 'put /api/branches/:id', request: { body: { branchName: 'Test' } }, outcomes: [{ error: 'offline' }] },
  { name: 'delete soft deactivates', route: 'delete /api/branches/:id', outcomes: [{}] },
  { name: 'delete failure', route: 'delete /api/branches/:id', outcomes: [{ error: 'offline' }] },
  { name: 'autocomplete missing', route: 'get /api/branches/autocomplete' },
  { name: 'autocomplete short', route: 'get /api/branches/autocomplete', request: { query: { q: 'a' } } },
  { name: 'autocomplete rows and wildcards', route: 'get /api/branches/autocomplete', request: { query: { q: 'Te%' } }, outcomes: [{ rows: [{ city: 'Test City' }, { area: 'Test Area' }, { branchName: 'Test Branch' }] }] },
  { name: 'autocomplete failure returns empty 200', route: 'get /api/branches/autocomplete', request: { query: { q: 'Te' } }, outcomes: [{ error: 'offline' }] },
  { name: 'nearby missing location', route: 'get /api/branches/search-nearby' },
  { name: 'nearby partial coordinates', route: 'get /api/branches/search-nearby', request: { query: { lat: '12.9' } } },
  { name: 'nearby coordinates distance rounding', route: 'get /api/branches/search-nearby', request: { query: { lat: '12.9', lng: '77.6' } }, outcomes: [{ rows: [{ ...branch, distance: 2.7 }] }] },
  { name: 'nearby radius fallback', route: 'get /api/branches/search-nearby', request: { query: { lat: '12.9', lng: '77.6' } }, outcomes: [{ rows: [] }, { rows: [{ ...branch, distance: 250.2 }] }] },
  { name: 'nearby Google success', route: 'get /api/branches/search-nearby', request: { query: { location: ' Test ' } }, googleEnabled: true, google: { lat: 12.9, lng: 77.6 }, outcomes: [{ rows: [{ ...branch, distance: 1.5 }] }] },
  { name: 'nearby Google error then Photon', route: 'get /api/branches/search-nearby', request: { query: { location: 'Test' } }, googleEnabled: true, googleError: 'unavailable', photon: { lat: 12.9, lng: 77.6 }, outcomes: [{ rows: [branch] }] },
  { name: 'nearby database coordinates fallback', route: 'get /api/branches/search-nearby', request: { query: { location: 'Test' } }, photonError: 'offline', outcomes: [{ rows: [{ latitude: '12.9', longitude: '77.6' }] }, { rows: [{ ...branch, distance: 5 }] }] },
  { name: 'nearby text fallback', route: 'get /api/branches/search-nearby', request: { query: { location: 'Test' } }, outcomes: [{ rows: [] }, { rows: [branch] }] },
  { name: 'nearby invalid geocoder coordinates uses database', route: 'get /api/branches/search-nearby', request: { query: { location: 'Test' } }, googleEnabled: true, google: { lat: '12.9', lng: '77.6' }, outcomes: [{ rows: [] }, { rows: [] }] },
  { name: 'nearby database error', route: 'get /api/branches/search-nearby', request: { query: { lat: '12', lng: '77' } }, outcomes: [{ error: 'offline' }] },
];
for (const spec of cases) {
  test('legacy compatibility: ' + spec.name, async () => {
    const expected = await harness(spec, true).run();
    const actual = await harness(spec, false).run();
    assert.deepEqual(actual, expected);
  });
}

test('HTTP mounts, caching, errors and staging write isolation', async (t) => {
  const app = createApp({ db: createFixtureDb(), geocoding: createFixtureGeocoding(), staging: true });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = 'http://127.0.0.1:' + server.address().port;
  const health = await fetch(url + '/health');
  assert.equal((await health.json()).mode, 'staging');
  for (const path of ['/api/branches', '/api/branches/autocomplete?q=Te', '/api/branches/search-nearby?lat=12&lng=77']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(await response.json()));
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('x-attica-staging'), 'synthetic-data-only');
  }
  assert.equal((await fetch(url + '/api/branches/search-nearby')).status, 400);
  assert.equal((await fetch(url + '/api/calls')).status, 404);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await fetch(url + '/api/branches', { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 405);
  }
});

test('all unmigrated candidate statements match production baseline exactly', () => {
  const candidate = readFileSync(projectRoot + 'runtime/server.js', 'utf8');
  const skipBaseline = (node) => (node.type === 'FunctionDeclaration' && (node.id.name === 'serializeBranchRow' || adminHelperNames.has(node.id.name)))
    || (node.type === 'VariableDeclaration' && adminConstantNames.has(node.declarations[0]?.id.name))
    || (node.expression && routeCall(node.expression));
  const skipCandidate = (node) => (node.type === 'ImportDeclaration' && ['../modules/branches/index.js', '../modules/admin-messages/index.js', '../modules/customer-history/index.js', '../modules/reports/index.js', '../modules/billing/index.js', '../modules/sms/index.js', '../modules/followups/index.js', '../modules/intake/index.js', '../modules/agent-status/index.js', '../modules/reference-data/index.js', '../modules/call-records/index.js', '../modules/agent-management/index.js', '../modules/call-control/index.js', '../modules/lead-ingestion/index.js', '../modules/marketing/index.js', '../modules/auto-dial/index.js', '../modules/location-ivr/index.js', '../integrations/sms/providers/kaleyra.client.js'].includes(node.source.value))
    || (node.type === 'ThrowStatement')
    || (node.type === 'VariableDeclaration' && ['branchesController', 'adminMessagesController', 'legacyMessageAuthorization', 'customerHistoryController', 'legacyCustomerHistoryAuthorization', 'reportsController', 'legacyReportsAuthorization', 'billingController', 'legacyBillingAuthorization', 'kaleyraProvider', 'smsController', 'legacySmsAuthorization', 'followupsController', 'legacyFollowupsAuthorization', 'intakeController', 'legacyIntakeAuthorization', 'agentStatusController', 'legacyAgentStatusAuthorization', 'referenceDataController', 'legacyReferenceDataAuthorization'].includes(node.declarations[0]?.id.name))
    || (node.expression?.type === 'CallExpression' && ['mountBranchesCatalog', 'mountBranchesAutocomplete', 'mountAdminMessages', 'mountIndividualMessage', 'mountCustomerCallsByPhone', 'mountCustomerProfile', 'mountIntakeHistory', 'mountCustomerCallHistory', 'mountDashboardStats', 'mountCallDateDetails', 'mountCallExport', 'mountReportSummary', 'mountCallList', 'mountBillingList', 'mountBillingLookup', 'mountSendSms', 'mountSmsLog', 'mountSmsDelivery', 'mountFollowupsList', 'mountFollowupsLoad', 'mountFollowupsSave', 'mountFollowupsUpdate', 'mountStatusFollowupsList', 'mountStatusFollowupsUpdate', 'mountIntakeFormSave', 'mountIntakePending', 'mountIntakeRead', 'mountIntakeMutate', 'mountAgentsList', 'mountAgentDetail', 'mountAgentSessions', 'mountRatesList', 'mountRatesUpdate', 'mountRatesCreate', 'mountRatesDelete', 'mountPledgePlacesList', 'mountPledgePlacesUpdate', 'mountCallRecordsRoute', 'mountAgentManagementRoute', 'mountCallControlRoute', 'mountLeadIngestionRoute', 'mountMarketingRoute', 'mountAutoDialRoute', 'mountLocationIvrRoute'].includes(node.expression.callee.name));
  const old = ast.body.filter((n) => !skipBaseline(n)).map((n) => baseline.slice(n.start, n.end));
  const next = parseSource(candidate).body.filter((n) => !skipCandidate(n)).map((n) => candidate.slice(n.start, n.end));
  // Compare hashes so a failure cannot print legacy embedded credentials.
  assert.equal(next.length, old.length);
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  next.forEach((value, index) => assert.equal(digest(value), digest(old[index]), `Unmigrated statement ${index}`));
});

test('full candidate preserves endpoint registration order', () => {
  const candidate = readFileSync(projectRoot + 'runtime/server.js', 'utf8');
  const expected = ast.body.filter((n) => n.expression && routeCall(n.expression)).map((n) => baseline.slice(n.expression.callee.property.start, n.expression.arguments[0].end));
  const actual = [];
  for (const node of parseSource(candidate).body) {
    const expression = node.expression;
    if (!expression) continue;
    if (routeCall(expression)) actual.push(candidate.slice(expression.callee.property.start, expression.arguments[0].end));
    if (expression.callee?.name === 'mountAdminMessages') { actual.push("get('/api/ui-refresh'", "post('/api/ui-refresh'", "get('/api/admin-broadcast'", "get('/api/admin-broadcast/history'", "post('/api/admin-broadcast'", "delete('/api/admin-broadcast'"); }
    if (expression.callee?.name === 'mountBranchesCatalog') {
      actual.push("get('/api/branches'", "post('/api/branches'", "put('/api/branches/:id'", "delete('/api/branches/:id'", "get('/api/branches/search-nearby'");
    }
    if (expression.callee?.name === 'mountBranchesAutocomplete') actual.push("get('/api/branches/autocomplete'");
    if (expression.callee?.name === 'mountCustomerCallsByPhone') actual.push("get('/api/calls/phone'");
    if (expression.callee?.name === 'mountCustomerProfile') actual.push("get('/api/customer-profile'");
    if (expression.callee?.name === 'mountIntakeHistory') actual.push("get('/api/intake-forms/phone'");
    if (expression.callee?.name === 'mountCustomerCallHistory') actual.push("get('/api/calls/customer-history'");
    if (expression.callee?.name === 'mountDashboardStats') actual.push("get('/api/stats'");
    if (expression.callee?.name === 'mountCallDateDetails') actual.push("get('/api/calls/date-details'");
    if (expression.callee?.name === 'mountCallExport') actual.push("get('/api/calls/export'");
    if (expression.callee?.name === 'mountReportSummary') actual.push("get('/api/calls/report-summary'");
    if (expression.callee?.name === 'mountCallList') actual.push("get('/api/calls/list'");
    if (expression.callee?.name === 'mountBillingList') actual.push("get('/api/customerdata/list'");
    if (expression.callee?.name === 'mountBillingLookup') actual.push("get('/api/customerdata'");
    if (expression.callee?.name === 'mountSendSms') actual.push("post('/api/send-sms'");
    if (expression.callee?.name === 'mountSmsLog') actual.push("get('/api/sms-log'");
    if (expression.callee?.name === 'mountSmsDelivery') actual.push("all('/api/sms/dlr'");
    if (expression.callee?.name === 'mountFollowupsList') actual.push("get('/api/followups'");
    if (expression.callee?.name === 'mountFollowupsLoad') actual.push("post('/api/followups/load-rnr-disconnected'");
    if (expression.callee?.name === 'mountFollowupsSave') actual.push("post('/api/followups'");
    if (expression.callee?.name === 'mountFollowupsUpdate') actual.push("put('/api/followups/:id'");
    if (expression.callee?.name === 'mountStatusFollowupsList') actual.push("get('/api/status-followups'");
    if (expression.callee?.name === 'mountStatusFollowupsUpdate') actual.push("put('/api/status-followups/:id'");
    if (expression.callee?.name === 'mountIntakeFormSave') actual.push("post('/api/intake-forms'");
    if (expression.callee?.name === 'mountIntakePending') actual.push("get('/api/intake-workflow/pending'");
    if (expression.callee?.name === 'mountIntakeRead') actual.push("get('/api/intake-workflow'");
    if (expression.callee?.name === 'mountIntakeMutate') actual.push("post('/api/intake-workflow'");
    if (expression.callee?.name === 'mountAgentsList') actual.push("get('/api/agents'");
    if (expression.callee?.name === 'mountAgentDetail') actual.push("get('/api/agents/:id'");
    if (expression.callee?.name === 'mountAgentSessions') actual.push("get('/api/agent-sessions'");
    if(expression.callee?.name==='mountRatesList')actual.push("get('/api/rates'");if(expression.callee?.name==='mountRatesUpdate')actual.push("put('/api/rates'");if(expression.callee?.name==='mountRatesCreate')actual.push("post('/api/rates'");if(expression.callee?.name==='mountRatesDelete')actual.push("delete('/api/rates'");if(expression.callee?.name==='mountPledgePlacesList')actual.push("get('/api/pledge-places'");if(expression.callee?.name==='mountPledgePlacesUpdate')actual.push("put('/api/pledge-places'");
    if(['mountCallRecordsRoute','mountAgentManagementRoute','mountCallControlRoute','mountLeadIngestionRoute','mountMarketingRoute','mountAutoDialRoute','mountLocationIvrRoute'].includes(expression.callee?.name))actual.push(`${expression.arguments[1].value}(${candidate.slice(expression.arguments[2].start,expression.arguments[2].end)}`);
  }
  assert.deepEqual(actual, expected);
});

test('feature-owned mounts preserve every legacy path and handler expression byte-for-byte',()=>{
  const candidate=readFileSync(projectRoot+'runtime/server.js','utf8'),candidateAst=parseSource(candidate);
  const extracted=(expression)=>{const path=expression.arguments[0]?.value,method=expression.callee.property.name;return branchPaths.has(path)||adminPaths.has(path)||customerHistoryPaths.has(path)||reportCorePaths.has(path)||billingPaths.has(path)||smsPaths.has(path)||followupPaths.has(path)||intakePaths.has(path)||(agentStatusPaths.has(path)&&method==='get')||referenceDataPaths.has(path);};
  const original=ast.body.filter(node=>node.expression&&routeCall(node.expression)&&!extracted(node.expression)).map(node=>node.expression);
  const ownerMounts=new Set(['mountCallRecordsRoute','mountAgentManagementRoute','mountCallControlRoute','mountLeadIngestionRoute','mountMarketingRoute','mountAutoDialRoute','mountLocationIvrRoute']);
  const mounted=candidateAst.body.filter(node=>ownerMounts.has(node.expression?.callee?.name)).map(node=>node.expression);
  assert.equal(mounted.length,69);assert.equal(original.length,mounted.length);
  const digest=value=>createHash('sha256').update(value).digest('hex');
  original.forEach((expression,index)=>{const next=mounted[index],path=expression.arguments[0].type==='ArrayExpression'?expression.arguments[0].elements[0].value:expression.arguments[0].value;assert.ok(legacyRouteOwner(path));assert.equal(next.arguments[1].value,expression.callee.property.name);assert.equal(next.arguments.length-2,expression.arguments.length);expression.arguments.forEach((argument,argIndex)=>{const oldArg=baseline.slice(argument.start,argument.end),newArgument=next.arguments[argIndex+2],newArg=candidate.slice(newArgument.start,newArgument.end);assert.equal(digest(newArg),digest(oldArg),`Feature-owned handler ${index}, argument ${argIndex}`);});});
});
