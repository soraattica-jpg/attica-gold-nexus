import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createResponseCache, getResponseCacheKey, shouldBypassResponseCache } from './seo-marketing.cache.js';
import { createSeoMarketingModule } from './index.js';
import { mountSeoMarketing } from './seo-marketing.routes.js';
import { getKolkataDateRange } from './seo-marketing.validation.js';
import { createPreviewSeoMarketing } from '../../config/preview-seo-marketing.js';

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

test('the isolated preview preserves date, paging, export and authorization contracts', async () => {
  const app = express();
  mountSeoMarketing(app, createPreviewSeoMarketing().controller);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const request = (path) => fetch(`http://127.0.0.1:${port}${path}`);

  try {
    const dashboard = await request('/api/seo-marketing/leads?role=seo&startDate=2026-09-20&endDate=2026-09-21&page=1&limit=2');
    assert.equal(dashboard.status, 200);
    assert.deepEqual(await dashboard.json(), {
      range: {
        startDate: '2026-09-20', endDate: '2026-09-21', startDateTime: '2026-09-20 00:00:00', endDateTime: '2026-09-22 00:00:00', timeZone: 'Asia/Kolkata',
      },
      metric: '', view: '', page: 1, limit: 2, total: 4, totalPages: 2, partialSummary: false,
      rows: [
        { leadId: 'SEO-001', leadDate: '2026-09-20', leadTime: '09:15:00', customerName: 'Preview Meera', customerNumber: '9000000001', source: 'Google LP Leads', platform: 'Google', campaignName: 'Gold Sale Bengaluru', keyword: 'sell gold', callAttempts: 2, connectedCalls: 1, businessStage: 'QL', billCount: 1, billAmount: 152000, billingGrossWeight: 18.4 },
        { leadId: 'SEO-002', leadDate: '2026-09-20', leadTime: '10:25:00', customerName: 'Preview Arun', customerNumber: '9000000002', source: 'Meta Ads', platform: 'Meta', campaignName: 'Gold Release Chennai', keyword: 'release gold', callAttempts: 1, connectedCalls: 0, businessStage: 'RNR', billCount: 0, billAmount: 0, billingGrossWeight: 0 },
      ],
      summary: {
        leadsToday: 4, uniqueLeadsToday: 4, contactedToday: 4, connectedToday: 3, followUpsToday: 1, qualifiedLeadsToday: 1, lostLeadsToday: 1, billsToday: 1, billedLeadsToday: 1, totalBillingAmountToday: 152000, totalBillingGrossWeightToday: 18.4, campaignSpendToday: 7200, leadToBillConversionRate: 25, costPerLead: 1800, costPerBill: 7200,
      },
      sourceFunnel: [], campaignPerformance: [], keywordPerformance: [], landingPagePerformance: [],
      billConversionHistory: [{ leadId: 'SEO-001', leadDate: '2026-09-20', leadTime: '09:15:00', customerName: 'Preview Meera', customerNumber: '9000000001', source: 'Google LP Leads', platform: 'Google', campaignName: 'Gold Sale Bengaluru', keyword: 'sell gold', callAttempts: 2, connectedCalls: 1, businessStage: 'QL', billCount: 1, billAmount: 152000, billingGrossWeight: 18.4 }],
    });

    const unauthorized = await request('/api/seo-marketing/leads?role=agent');
    assert.equal(unauthorized.status, 403);
    assert.equal((await unauthorized.json()).error, 'Forbidden');

    const metaOnly = await request('/api/seo-marketing/leads?role=seo&startDate=2026-09-20&endDate=2026-09-21&source=Meta');
    assert.equal((await metaOnly.json()).summary.campaignSpendToday, 0);

    const currentExport = await request('/api/seo-marketing/leads/export?role=seo&startDate=2026-09-20&endDate=2026-09-21&page=2&limit=2&exportScope=current');
    const allExport = await request('/api/seo-marketing/leads/export?role=seo&startDate=2026-09-20&endDate=2026-09-21&page=2&limit=2&exportScope=all');
    assert.equal((await currentExport.text()).trim().split('\n').length, 3);
    assert.equal((await allExport.text()).trim().split('\n').length, 5);

    const spend = await request('/api/warroom/marketing/spend?role=seo&startDate=2026-09-20&endDate=2026-09-21&page=2&limit=1');
    assert.deepEqual(await spend.json(), {
      metric: 'spend', totalSpend: 7200, page: 2, limit: 1, totalRows: 2, totalPages: 2,
      rows: [{ date: '2026-09-21', platform: 'Google Ads', adAccount: 'preview-account', campaignId: 'preview-001', campaignName: 'Gold Sale Bengaluru', impressions: 1520, clicks: 72, spend: 3240 }],
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
