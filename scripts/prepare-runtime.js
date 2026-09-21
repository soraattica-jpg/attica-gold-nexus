import { mkdirSync, writeFileSync } from 'node:fs';
import { branchPaths, parseSource, projectRoot, readBaseline, routeCall } from './source-tools.js';

const source = readBaseline();
const ast = parseSource(source);
const edits = [];
let removed = 0;
for (const statement of ast.body) {
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
if (removed !== 6 || edits.length !== 7) throw new Error('Unexpected baseline layout; refusing an incomplete extraction.');
let candidate = source;
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  candidate = candidate.slice(0, edit.start) + edit.text + candidate.slice(edit.end);
}
candidate = `import { createBranchesModule, mountBranchesCatalog, mountBranchesAutocomplete } from '../modules/branches/index.js';
// This full candidate still contains legacy startup side effects. It is a
// review artifact, not the staging entrypoint. Use ../server.js for tests.
throw new Error('Full runtime startup is disabled during phase 1; use the isolated staging server.');
\n` + candidate;
mkdirSync(projectRoot + 'runtime', { recursive: true, mode: 0o700 });
writeFileSync(projectRoot + 'runtime/server.js', candidate, { mode: 0o600 });
for (const name of ['intake-workflow.mjs', 'md-reporting.mjs']) {
  writeFileSync(projectRoot + 'runtime/' + name, readBaseline(name), { mode: 0o600 });
}
console.log(`Prepared non-runnable full candidate: ${source.split('\n').length - candidate.split('\n').length} fewer server.js lines; six routes mounted at their original positions.`);
