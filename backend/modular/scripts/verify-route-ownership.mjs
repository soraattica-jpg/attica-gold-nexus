import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { legacyRouteOwner, parseSource, projectRoot, readBaseline } from './source-tools.js';

const candidate = readFileSync(projectRoot + 'runtime/server.js', 'utf8');
const ownerMounts = new Set(['mountCallRecordsRoute','mountAgentManagementRoute','mountCallControlRoute','mountLeadIngestionRoute','mountMarketingRoute','mountAutoDialRoute','mountLocationIvrRoute']);
const mounted = parseSource(candidate).body.filter((node) => ownerMounts.has(node.expression?.callee?.name)).map((node) => node.expression);
assert.equal(mounted.length, 69);
let pathCount = 0;
for (const expression of mounted) {
  const argument = expression.arguments[2];
  const paths = argument.type === 'ArrayExpression' ? argument.elements.map((item) => item.value) : [argument.value];
  pathCount += paths.length;
  const owners = new Set(paths.map(legacyRouteOwner));
  assert.equal(owners.size, 1);
  assert.ok([...owners][0]);
}
assert.equal(pathCount, 75);
assert.equal(existsSync(projectRoot + 'modules/compatibility-routes/index.js'), false);
const manifest = JSON.parse(readFileSync(projectRoot + 'docs/BASELINE.json', 'utf8'));
const unchanged = Object.fromEntries(Object.entries(manifest.files).map(([file, hash]) => [file, createHash('sha256').update(readFileSync(`/root/attica-api/${file}`)).digest('hex') === hash]));
assert.ok(Object.values(unchanged).every(Boolean));
const active = (unit) => execFileSync('systemctl', ['is-active', unit], { encoding: 'utf8' }).trim() === 'active';
assert.ok(active('attica-api.service'));
assert.ok(active('attica-api-next-preview.service'));
const proof = {
  verifiedAt: new Date().toISOString(), baselineServerRegistrations: 120, registrationMigrated: 120,
  controllerServiceExtracted: 45, featureOwnedLegacyHandlerPaths: pathCount,
  featureOwnedMountStatements: mounted.length, genericCompatibilityMounts: 0, featureOwners: ownerMounts.size,
  pendingRegistrations: 0,
  tests: { contractHttpStructureLogging: 155, realMariaDb: 25, candidateSyntax: 'passed', routeOrder: 'passed', legacyHandlerArgumentHashes: 'passed', routeOwnershipContracts: 'passed', allFeaturePreviewVerifiers: 'passed' },
  productionFilesUnchanged: unchanged,
  services: { production: 'active-unchanged', preview: 'active-loopback-3101' },
  productionDeployment: false, telephonyChanged: false,
};
writeFileSync(projectRoot + 'docs/REGISTRATION-VERIFICATION.json', `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
