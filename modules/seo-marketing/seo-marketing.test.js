import test from 'node:test';
import assert from 'node:assert/strict';
import { createResponseCache, getResponseCacheKey, shouldBypassResponseCache } from './seo-marketing.cache.js';
import { createSeoMarketingModule } from './index.js';
import { mountSeoMarketing } from './seo-marketing.routes.js';
import { getKolkataDateRange } from './seo-marketing.validation.js';

const calls = [];
const adapters = Object.fromEntries([
  'getDashboard', 'getLeadToBillSummary', 'getLeadToBillDetails', 'getGoogleStatus', 'getSpend', 'exportSpend', 'exportLeads',
].map((name) => [name, async (query) => {
  calls.push({ name, query });
  return name.startsWith('export') ? { headers: { 'Content-Type': 'text/csv' }, body: 'header\\nrow' } : { name, query, rows: [] };
}]));
const module = createSeoMarketingModule({ adapters, getBusinessDate: () => '2026-09-22', getRole: (req) => req.role });

test('Kolkata ranges use an exclusive next-day boundary', () => {
  assert.deepEqual(getKolkataDateRange({ startDate: '2026-09-21', endDate: '2026-09-21' }, '2026-09-22'), {
    startDate: '2026-09-21', endDate: '2026-09-21', startDateTime: '2026-09-21 00:00:00', endDateTime: '2026-09-22 00:00:00', timeZone: 'Asia/Kolkata',
  });
});

test('response cache keys include report filters but exclude refresh tokens', () => {
  assert.equal(getResponseCacheKey({ source: 'Meta Ads', startDate: '2026-09-01', refresh: 1 }), getResponseCacheKey({ startDate: '2026-09-01', source: 'Meta Ads', refresh: 2 }));
  assert.equal(shouldBypassResponseCache({ refresh: 'token-1' }), true);
  assert.equal(shouldBypassResponseCache({}), false);
});

test('dashboard cache bypass is local and keeps the normalized date contract', async () => {
  calls.length = 0;
  await module.service.getDashboard({ role: 'seo', query: { startDate: '2026-09-01', endDate: '2026-09-21', source: 'Meta Ads' } });
  await module.service.getDashboard({ role: 'seo', query: { startDate: '2026-09-01', endDate: '2026-09-21', source: 'Meta Ads' } });
  await module.service.getDashboard({ role: 'seo', query: { startDate: '2026-09-01', endDate: '2026-09-21', source: 'Meta Ads', refresh: 'new-view' } });
  assert.equal(calls.filter((entry) => entry.name === 'getDashboard').length, 2);
  assert.equal(calls.at(-1).query.limit, 50);
  assert.equal(calls.at(-1).query.startDate, '2026-09-01');
});

test('authorization preserves SEO and superadmin access only', async () => {
  await assert.rejects(() => module.service.getDashboard({ role: 'agent', query: {} }), { message: 'Forbidden' });
  await module.service.getDashboard({ role: 'superadmin', query: {} });
  await assert.rejects(() => module.service.getGoogleStatus({ role: 'seo', query: {} }), { message: 'Forbidden' });
});

test('cache expires deterministically', () => {
  let now = 100;
  const cache = createResponseCache({ now: () => now, ttlMs: 10 });
  cache.set('report', { total: 1 });
  assert.deepEqual(cache.get('report'), { total: 1 });
  now = 110;
  assert.equal(cache.get('report'), null);
});

test('the extracted module owns the seven legacy SEO/Marketing paths', () => {
  const paths = [];
  mountSeoMarketing({ get: (path) => paths.push(path) }, module.controller);
  assert.deepEqual(paths, [
    '/api/seo-marketing/leads',
    '/api/seo-marketing/lead-to-bill/summary',
    '/api/seo-marketing/lead-to-bill/details',
    '/api/seo-marketing/google/status',
    '/api/warroom/marketing/spend',
    '/api/warroom/marketing/spend/export',
    '/api/seo-marketing/leads/export',
  ]);
});
