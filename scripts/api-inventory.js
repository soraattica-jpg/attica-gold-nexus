import { writeFileSync } from 'node:fs';
import { branchPaths, adminPaths, customerHistoryPaths, reportCorePaths, billingPaths, smsPaths, followupPaths, parseSource, projectRoot, readBaseline, routeCall, walk } from './source-tools.js';

const tested = process.argv.includes('--tested');
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
      const migrated = file === 'server.js' && (branchPaths.has(routePath) || adminPaths.has(routePath) || customerHistoryPaths.has(routePath) || reportCorePaths.has(routePath) || billingPaths.has(routePath) || smsPaths.has(routePath) || followupPaths.has(routePath));
      const individual = file === 'server.js' && routePath === '/api/agents/:id' && node.callee.property.name === 'put';
      // app.get(setting) is filtered by routeCall's handler requirement.
      inventory.push({
        method: node.callee.property.name.toUpperCase(), path: routePath,
        dynamic: !literal, file, line: node.loc.start.line, endLine: node.loc.end.line,
        feature: branchPaths.has(routePath) ? 'branches' : adminPaths.has(routePath) || individual ? 'admin-messages' : customerHistoryPaths.has(routePath) ? 'customer-history' : reportCorePaths.has(routePath) ? 'reports-core' : billingPaths.has(routePath) ? 'billing-lookup' : smsPaths.has(routePath) ? 'sms-kaleyra' : followupPaths.has(routePath) ? 'followups' : (literal ? routePath.split('/').filter(Boolean)[1] || 'root' : 'dynamic registration'),
        migrated,
        partialMigration: individual ? 'adminMessage-only payload; generic agent update remains unchanged' : null,
        migrationStatus: migrated ? 'MIGRATED' : individual ? 'PARTIAL (message-only)' : 'PENDING',
        testStatus: tested && (migrated || individual) ? (individual ? 'TESTED (message-only)' : 'TESTED') : 'PENDING',
        deploymentStatus: 'LEGACY_PRODUCTION',
      });
    }
  });
}
writeFileSync(projectRoot + 'docs/API-INVENTORY.json', JSON.stringify(inventory, null, 2) + '\n');
const lines = [
  '# Attica API migration inventory', '',
  'Generated from the hash-verified production snapshot; no server was imported or started.', '',
  `${inventory.length} route registrations (${inventory.filter((r) => r.dynamic).length} dynamic expressions). ALL covers multiple HTTP methods; aliases appear separately. Dynamic registrations require runtime expansion before claiming an endpoint total.`, '',
  'Six Branches, six Admin Messages/UI refresh routes, four Customer History routes, five core Reports routes, two Billing/customer-data lookup routes, three Kaleyra SMS routes, and six Follow-Ups routes are migrated only in the isolated candidate. PUT /api/agents/:id is extracted only for adminMessage-only payloads; all other agent updates remain legacy. Production continues using server.js. Customer History, Reports and Billing use synthetic SELECT-only data; SMS and Follow-Ups use isolated writable test records with external delivery/dialing disabled. No preview request calls Kaleyra, Asterisk, the dialer or the external customer-data API. Marketing reports and billing background sync remain pending. No production API path, payload, or global middleware was changed.', '',
  '| Method | Path / expression | Original location | Migrated | Tested | Production |',
  '| --- | --- | --- | --- | --- | --- |',
];
for (const row of inventory) {
  const p = row.path.replaceAll('|', '\\|').replaceAll('`', '');
  lines.push(`| ${row.method} | ${p} | ${row.file}:${row.line} | ${row.migrationStatus} (candidate) | ${row.testStatus} | Legacy |`);
}
lines.push('', 'Middleware order, cluster/scheduler initialization, authorization, and external integration contracts remain separate migration checkpoints. Existing md-reporting and intake-workflow modules are recorded as baseline dependencies, not newly migrated work.', '');
writeFileSync(projectRoot + 'docs/API-INVENTORY.md', lines.join('\n'));
console.log(`Inventoried ${inventory.length} route registrations; ${inventory.filter((r) => r.migrated).length} registrations migrated in candidate only.`);
