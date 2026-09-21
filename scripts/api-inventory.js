import { writeFileSync } from 'node:fs';
import { branchPaths, parseSource, projectRoot, readBaseline, routeCall, walk } from './source-tools.js';

const inventory = [];
for (const file of ['server.js', 'md-reporting.mjs', 'intake-workflow.mjs']) {
  const source = readBaseline(file);
  walk(parseSource(source), (node) => {
    if (!routeCall(node)) return;
    const argument = node.arguments[0];
    const paths = argument.type === 'ArrayExpression' ? argument.elements : [argument];
    for (const path of paths) {
      const literal = path.type === 'Literal' && typeof path.value === 'string';
      const routePath = literal ? path.value : source.slice(path.start, path.end);
      // app.get(setting) is filtered by routeCall's handler requirement.
      inventory.push({
        method: node.callee.property.name.toUpperCase(), path: routePath,
        dynamic: !literal, file, line: node.loc.start.line,
        feature: branchPaths.has(routePath) ? 'branches' : (literal ? routePath.split('/').filter(Boolean)[1] || 'root' : 'dynamic registration'),
        migrated: file === 'server.js' && branchPaths.has(routePath),
      });
    }
  });
}
const tested = process.argv.includes('--tested');
writeFileSync(projectRoot + 'docs/API-INVENTORY.json', JSON.stringify(inventory, null, 2) + '\n');
const lines = [
  '# Attica API migration inventory', '',
  'Generated from the hash-verified production snapshot; no server was imported or started.', '',
  `${inventory.length} route registrations (${inventory.filter((r) => r.dynamic).length} dynamic expressions). ALL covers multiple HTTP methods; aliases appear separately. Dynamic registrations require runtime expansion before claiming an endpoint total.`, '',
  'The six Branches routes are migrated only in the isolated candidate. Production continues using server.js. No API path, payload, or global middleware was changed.', '',
  '| Method | Path / expression | Original location | Migrated | Tested | Production |',
  '| --- | --- | --- | --- | --- | --- |',
];
for (const row of inventory) {
  const p = row.path.replaceAll('|', '\\|').replaceAll('`', '');
  lines.push(`| ${row.method} | ${p} | ${row.file}:${row.line} | ${row.migrated ? 'Candidate only' : 'Pending'} | ${row.migrated && tested ? 'Contract + HTTP tests' : 'Pending'} | Legacy |`);
}
lines.push('', 'Middleware order, cluster/scheduler initialization, authorization, and external integration contracts remain separate migration checkpoints. Existing md-reporting and intake-workflow modules are recorded as baseline dependencies, not newly migrated work.', '');
writeFileSync(projectRoot + 'docs/API-INVENTORY.md', lines.join('\n'));
console.log(`Inventoried ${inventory.length} route registrations; ${inventory.filter((r) => r.migrated).length} Branches registrations migrated in candidate only.`);
