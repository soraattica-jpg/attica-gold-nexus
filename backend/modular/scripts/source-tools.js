import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const branchPaths = new Set(['/api/branches', '/api/branches/:id', '/api/branches/search-nearby', '/api/branches/autocomplete']);
export const adminPaths = new Set(['/api/ui-refresh', '/api/admin-broadcast', '/api/admin-broadcast/history']);
export const adminHelperNames = new Set(['serializeAdminBroadcastRecord', 'getActiveAdminBroadcast', 'adminBroadcastAppliesToAgent', 'getAdminBroadcastExpiryDate']);
export const adminConstantNames = new Set(['ADMIN_BROADCAST_SCOPES', 'ADMIN_BROADCAST_EXPIRIES']);
export const customerHistoryPaths = new Set(['/api/calls/phone','/api/customer-profile','/api/intake-forms/phone','/api/calls/customer-history']);
export const reportCorePaths = new Set(['/api/stats','/api/calls/date-details','/api/calls/export','/api/calls/report-summary','/api/calls/list']);
export const billingPaths = new Set(['/api/customerdata/list','/api/customerdata']);
export const smsPaths = new Set(['/api/send-sms','/api/sms-log','/api/sms/dlr']);
export const followupPaths = new Set(['/api/followups','/api/followups/load-rnr-disconnected','/api/followups/:id','/api/status-followups','/api/status-followups/:id']);
export const intakePaths = new Set(['/api/intake-forms','/api/intake-workflow/pending','/api/intake-workflow']);
export const agentStatusPaths = new Set(['/api/agents','/api/agents/:id','/api/agent-sessions']);
export const referenceDataPaths = new Set(['/api/rates','/api/pledge-places']);
export const legacyOwnedRouteGroups = {
  callRecords: new Set(['/api/blocked-numbers','/api/blocked-numbers/:phone','/api/calls','/api/calls/duplicate-audit','/api/recordings/:name','/api/recordings','/api/missed/today','/api/missed','/api/missed/:id/callback','/api/live-waiting-queue']),
  agentManagement: new Set(['/api/breaks','/api/agent-languages','/api/live-agents','/api/frontend-errors','/api/agents','/api/agents/:id','/api/agents/:id/call-slot/claim','/api/agents/:id/call-slot/release','/api/agents/:id/call-state/reset','/api/agents/:id/password','/api/login']),
  callControl: new Set(['/api/admin/incoming-2of5-gate/status','/api/admin/incoming-5of10-gate/status','/api/admin/incoming-2of5-gate/control','/api/live-call-monitor','/api/calls/conference','/api/calls/transfer','/api/transfer-context','/api/transfer-context/resolve']),
  leadIngestion: new Set(['/api/justdial/lead-receiver','/api/justdial/lead_receiver','/api/justdial-leads/lead-receiver','/api/justdial-leads/lead_receiver','/api/justdial/leads','/api/lead-source-counts/today','/api/auto-dial/source-coverage-report','/api/justdial/leads/export-followups','/api/justdial/leads/:leadId/queue-autodial','/api/website-leads/form-receiver','/api/website-leads/form_receiver','/api/website-leads/form-push','/api/website-leads/lead-receiver','/api/website-leads','/api/website-leads/export-followups','/api/website-leads/:leadId/queue-autodial','/api/blog-leads','/api/blog-leads/export-followups','/api/internal/meta-leads/ingest','/api/meta-leads','/api/meta-leads/export-followups','/api/meta-leads/:leadId/queue-autodial','/api/google-leads']),
  marketing: new Set(['/api/seo-marketing/leads','/api/seo-marketing/lead-to-bill/summary','/api/seo-marketing/lead-to-bill/details','/api/seo-marketing/google/status','/api/warroom/marketing/spend','/api/warroom/marketing/spend/export','/api/seo-marketing/leads/export']),
  autoDial: new Set(['/api/auto-dial/control','/api/auto-dial/leads','/api/auto-dial/import','/api/auto-dial/agent/:agentId/current','/api/auto-dial/leads/:id']),
  locationIvr: new Set(['/api/places/autocomplete','/api/places/geocode','/api/save-call-language','/api/save-call-ivr','/api/call-language/:callerId','/api/call-ivr/:callerId']),
};
export function legacyRouteOwner(path) {
  return Object.entries(legacyOwnedRouteGroups).find(([, paths]) => paths.has(path))?.[0] || null;
}
export function parseSource(source) {
  return parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
}
export function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visitor));
    else if (value && typeof value === 'object') walk(value, visitor);
  }
}
export function routeCall(node) {
  return node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
    && ['app', 'router'].includes(node.callee.object.name)
    && ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'].includes(node.callee.property.name)
    && node.arguments.length > 1;
}
export function readBaseline(name = 'server.js') {
  const manifest = JSON.parse(readFileSync(projectRoot + 'docs/BASELINE.json', 'utf8'));
  const source = readFileSync(projectRoot + 'baseline/' + name, 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  if (hash !== manifest.files[name]) throw new Error('Baseline hash mismatch: ' + name);
  return source;
}
