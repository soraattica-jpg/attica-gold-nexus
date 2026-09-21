import { mkdirSync, writeFileSync } from 'node:fs';
import { branchPaths, adminPaths, adminHelperNames, adminConstantNames, parseSource, projectRoot, readBaseline, routeCall } from './source-tools.js';

const source = readBaseline();
const ast = parseSource(source);
const edits = [];
let removed = 0;
let adminRemoved = 0;
for (const statement of ast.body) {
  if ((statement.type === 'FunctionDeclaration' && adminHelperNames.has(statement.id.name))
    || (statement.type === 'VariableDeclaration' && adminConstantNames.has(statement.declarations[0]?.id.name))) {
    edits.push({ start: statement.start, end: statement.end, text: '' });
  }
  const registration = statement.expression;
  if (registration && routeCall(registration) && adminPaths.has(registration.arguments[0]?.value)) {
    const text = registration.callee.property.name === 'get' && registration.arguments[0].value === '/api/ui-refresh'
      ? `// Preserve the existing shared refresh state used by agent serialization.
const adminMessagesController = createAdminMessagesModule({
  db: pool,
  refreshState: { get: () => uiRefreshState, set: (next) => { uiRefreshState = next; } },
  // Legacy delivery uses polling. A future socket adapter belongs outside the service.
  events: { publish: async () => {} },
  invalidateAgents: invalidateAgentsEndpointCache,
}).controller;
// The baseline has no message-route authorization. This adapter characterizes
// that contract only; the full candidate remains disabled pending auth review.
const legacyMessageAuthorization = () => (_req, _res, next) => next();
mountAdminMessages(app, adminMessagesController, legacyMessageAuthorization);`
      : '';
    edits.push({ start: statement.start, end: statement.end, text });
    adminRemoved++;
  }
  if (registration && routeCall(registration) && registration.callee.property.name === 'put' && registration.arguments[0]?.value === '/api/agents/:id') {
    edits.push({ start: statement.start, end: statement.start, text: 'mountIndividualMessage(app, adminMessagesController, legacyMessageAuthorization);\n' });
  }
  if (statement.type === 'FunctionDeclaration' && statement.id.name === 'serializeBranchRow') {
    edits.push({ start: statement.start, end: statement.end, text: `const branchesController = createBranchesModule({
  db: pool,
  geocoding: { hasGooglePlacesApiKey, geocodeGooglePlace, geocodePhotonPlace },
});` });
  }
  const call = statement.expression;
  if (!call || !routeCall(call) || !branchPaths.has(call.arguments[0]?.value)) continue;
  const method = call.callee.property.name;
  const path = call.arguments[0].value;
  const text = method === 'get' && path === '/api/branches'
    ? 'mountBranchesCatalog(app, branchesController);'
    : path === '/api/branches/autocomplete' ? 'mountBranchesAutocomplete(app, branchesController);' : '';
  edits.push({ start: statement.start, end: statement.end, text });
  removed++;
}
if (removed !== 6 || adminRemoved !== 6 || edits.length !== 20) throw new Error('Unexpected baseline layout; refusing an incomplete extraction.');
let candidate = source;
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  candidate = candidate.slice(0, edit.start) + edit.text + candidate.slice(edit.end);
}
candidate = `import { createAdminMessagesModule, mountAdminMessages, mountIndividualMessage } from '../modules/admin-messages/index.js';
import { createBranchesModule, mountBranchesCatalog, mountBranchesAutocomplete } from '../modules/branches/index.js';
// This full candidate still contains legacy startup side effects. It is a
// review artifact, not the staging entrypoint. Use ../server.js for tests.
throw new Error('Full runtime startup is disabled during incremental migration; use the isolated staging server.');
\n` + candidate;
mkdirSync(projectRoot + 'runtime', { recursive: true, mode: 0o700 });
writeFileSync(projectRoot + 'runtime/server.js', candidate, { mode: 0o600 });
for (const name of ['intake-workflow.mjs', 'md-reporting.mjs']) {
  writeFileSync(projectRoot + 'runtime/' + name, readBaseline(name), { mode: 0o600 });
}
console.log(`Prepared non-runnable full candidate: ${source.split('\n').length - candidate.split('\n').length} fewer server.js lines; 12 routes mounted at original positions plus a message-only agent update interceptor.`);
