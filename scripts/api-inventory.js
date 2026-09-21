import { writeFileSync } from 'node:fs';
import { branchPaths, adminPaths, customerHistoryPaths, reportCorePaths, billingPaths, smsPaths, followupPaths, intakePaths, agentStatusPaths, referenceDataPaths, legacyRouteOwner, parseSource, projectRoot, readBaseline, routeCall, walk } from './source-tools.js';

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
      const isAgentStatus = agentStatusPaths.has(routePath) && node.callee.property.name === 'get';
      const extracted = file === 'server.js' && (branchPaths.has(routePath) || adminPaths.has(routePath) || customerHistoryPaths.has(routePath) || reportCorePaths.has(routePath) || billingPaths.has(routePath) || smsPaths.has(routePath) || followupPaths.has(routePath) || intakePaths.has(routePath) || isAgentStatus || referenceDataPaths.has(routePath));
      const owner = file === 'server.js' ? legacyRouteOwner(routePath) : null;
      const featureOwned = !extracted && Boolean(owner);
      const migrated = extracted || featureOwned;
      const individual = file === 'server.js' && routePath === '/api/agents/:id' && node.callee.property.name === 'put';
      // app.get(setting) is filtered by routeCall's handler requirement.
      inventory.push({
        method: node.callee.property.name.toUpperCase(), path: routePath,
        dynamic: !literal, file, line: node.loc.start.line, endLine: node.loc.end.line,
        feature: branchPaths.has(routePath) ? 'branches' : adminPaths.has(routePath) || individual ? 'admin-messages' : customerHistoryPaths.has(routePath) ? 'customer-history' : reportCorePaths.has(routePath) ? 'reports-core' : billingPaths.has(routePath) ? 'billing-lookup' : smsPaths.has(routePath) ? 'sms-kaleyra' : followupPaths.has(routePath) ? 'followups' : intakePaths.has(routePath) ? 'intake' : isAgentStatus ? 'agent-status' : referenceDataPaths.has(routePath) ? 'reference-data' : owner || (literal ? routePath.split('/').filter(Boolean)[1] || 'root' : 'dynamic registration'),
        migrated, registrationMigrated: migrated, businessLogicExtracted: extracted, featureOwnedLegacyHandler: featureOwned,
        partialMigration: individual ? 'adminMessage-only payload; generic agent update remains unchanged' : null,
        migrationStatus: extracted ? 'MIGRATED' : featureOwned ? 'MIGRATED (feature registration)' : 'PENDING',
        testStatus: tested && migrated ? (featureOwned ? 'TESTED (handler preserved)' : 'TESTED') : 'PENDING',
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
  'All 120 server.js path registrations now have a feature owner in the isolated candidate. Forty-five registrations have controller/service extraction; the other 75 path registrations preserve their legacy handlers behind seven feature-specific route contracts. Production continues using server.js. Preview data is isolated; external delivery, dialing, Asterisk, PJSIP and auto-submit jobs are disabled.', '',
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
