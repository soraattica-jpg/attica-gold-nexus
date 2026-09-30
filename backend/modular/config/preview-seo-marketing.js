import { createSeoMarketingModule } from '../modules/seo-marketing/index.js';
import { getKolkataDateRange } from '../modules/seo-marketing/seo-marketing.validation.js';

const LEADS = [
  { leadId: 'SEO-001', leadDate: '2026-09-20', leadTime: '09:15:00', customerName: 'Preview Meera', customerNumber: '9000000001', source: 'Google LP Leads', platform: 'Google', campaignName: 'Gold Sale Bengaluru', keyword: 'sell gold', callAttempts: 2, connectedCalls: 1, businessStage: 'QL', billCount: 1, billAmount: 152000, billingGrossWeight: 18.4 },
  { leadId: 'SEO-002', leadDate: '2026-09-20', leadTime: '10:25:00', customerName: 'Preview Arun', customerNumber: '9000000002', source: 'Meta Ads', platform: 'Meta', campaignName: 'Gold Release Chennai', keyword: 'release gold', callAttempts: 1, connectedCalls: 0, businessStage: 'RNR', billCount: 0, billAmount: 0, billingGrossWeight: 0 },
  { leadId: 'SEO-003', leadDate: '2026-09-21', leadTime: '14:40:00', customerName: 'Preview Kavya', customerNumber: '9000000003', source: 'Website Direct', platform: 'Website', campaignName: '', keyword: '', callAttempts: 1, connectedCalls: 1, businessStage: 'Follow Up', billCount: 0, billAmount: 0, billingGrossWeight: 0 },
  { leadId: 'SEO-004', leadDate: '2026-09-21', leadTime: '16:05:00', customerName: 'Preview Hari', customerNumber: '9000000004', source: 'Google LP Leads', platform: 'Google', campaignName: 'Gold Sale Bengaluru', keyword: 'sell gold', callAttempts: 3, connectedCalls: 1, businessStage: 'Lost', billCount: 0, billAmount: 0, billingGrossWeight: 0 },
];

const SPEND = [
  { date: '2026-09-20', platform: 'Google Ads', adAccount: 'preview-account', campaignId: 'preview-001', campaignName: 'Gold Sale Bengaluru', impressions: 1800, clicks: 88, spend: 3960 },
  { date: '2026-09-21', platform: 'Google Ads', adAccount: 'preview-account', campaignId: 'preview-001', campaignName: 'Gold Sale Bengaluru', impressions: 1520, clicks: 72, spend: 3240 },
];

const csv = (headers, rows) => `\uFEFF${[headers, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}\r\n`;
const text = (value) => String(value || '').trim().toLowerCase();
const number = (value) => Math.max(0, Number(value) || 0);

function matchRows(query) {
  const source = text(query.source);
  const platform = text(query.platform);
  const campaign = text(query.campaign);
  const keyword = text(query.keyword);
  const search = text(query.search);
  return LEADS.filter((row) => {
    if (row.leadDate < query.startDate || row.leadDate > query.endDate) return false;
    if (source && !text(row.source).includes(source)) return false;
    if (platform && !text(row.platform).includes(platform)) return false;
    if (campaign && !text(row.campaignName).includes(campaign)) return false;
    if (keyword && !text(row.keyword).includes(keyword)) return false;
    if (search && !text(Object.values(row).join(' ')).includes(search)) return false;
    return true;
  });
}

function metricRows(rows, query) {
  if (query.metric === 'bills') return rows.filter((row) => number(row.billCount) > 0);
  if (query.metric === 'leadToBillRate' && query.view !== 'unique-leads') return rows.filter((row) => number(row.billCount) > 0);
  if (query.metric === 'connected') return rows.filter((row) => number(row.connectedCalls) > 0);
  if (query.metric === 'contacted') return rows.filter((row) => number(row.callAttempts) > 0);
  if (query.metric === 'ql') return rows.filter((row) => text(row.businessStage) === 'ql');
  if (query.metric === 'lost') return rows.filter((row) => text(row.businessStage) === 'lost');
  if (query.metric === 'followups') return rows.filter((row) => text(row.businessStage) === 'follow up');
  return rows;
}

function summary(rows, query) {
  const unique = new Set(rows.map((row) => row.customerNumber));
  const billed = rows.filter((row) => number(row.billCount) > 0);
  const leads = rows.length;
  const uniqueLeads = unique.size;
  const bills = billed.reduce((total, row) => total + number(row.billCount), 0);
  // Google Ads spend must not appear when the selected lead source/platform
  // excludes Google. This mirrors the production dashboard's attribution rule.
  const includeGoogleSpend = (!text(query.source) || text(query.source).includes('google'))
    && (!text(query.platform) || text(query.platform).includes('google'));
  const spend = SPEND
    .filter((row) => includeGoogleSpend && row.date >= query.startDate && row.date <= query.endDate)
    .reduce((total, row) => total + number(row.spend), 0);
  return {
    leadsToday: leads,
    uniqueLeadsToday: uniqueLeads,
    contactedToday: rows.filter((row) => number(row.callAttempts) > 0).length,
    connectedToday: rows.filter((row) => number(row.connectedCalls) > 0).length,
    followUpsToday: rows.filter((row) => text(row.businessStage) === 'follow up').length,
    qualifiedLeadsToday: rows.filter((row) => text(row.businessStage) === 'ql').length,
    lostLeadsToday: rows.filter((row) => text(row.businessStage) === 'lost').length,
    billsToday: bills,
    billedLeadsToday: billed.length,
    totalBillingAmountToday: billed.reduce((total, row) => total + number(row.billAmount), 0),
    totalBillingGrossWeightToday: billed.reduce((total, row) => total + number(row.billingGrossWeight), 0),
    campaignSpendToday: spend,
    leadToBillConversionRate: uniqueLeads ? Number(((billed.length / uniqueLeads) * 100).toFixed(2)) : 0,
    costPerLead: uniqueLeads ? Number((spend / uniqueLeads).toFixed(2)) : 0,
    costPerBill: bills ? Number((spend / bills).toFixed(2)) : 0,
  };
}

function pageRows(rows, query) {
  const offset = (query.page - 1) * query.limit;
  return rows.slice(offset, offset + query.limit);
}

function response(query) {
  const allRows = matchRows(query);
  const rows = metricRows(allRows, query);
  const total = rows.length;
  return {
    range: getKolkataDateRange(query, '2026-09-22'),
    metric: query.metric || '', view: query.view || '', page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)), partialSummary: false,
    rows: pageRows(rows, query), summary: summary(allRows, query), sourceFunnel: [], campaignPerformance: [], keywordPerformance: [], landingPagePerformance: [], billConversionHistory: allRows.filter((row) => number(row.billCount) > 0),
  };
}

function spendResponse(query) {
  const includeGoogleSpend = (!text(query.source) || text(query.source).includes('google'))
    && (!text(query.platform) || text(query.platform).includes('google'));
  const rows = SPEND.filter((row) => includeGoogleSpend
    && row.date >= query.startDate
    && row.date <= query.endDate
    && (!query.campaign || text(row.campaignName).includes(text(query.campaign))));
  const totalSpend = rows.reduce((total, row) => total + number(row.spend), 0);
  const selected = query.exportScope === 'all' ? rows : pageRows(rows, query);
  return { metric: 'spend', totalSpend, page: query.page, limit: query.exportScope === 'all' ? Math.max(1, rows.length) : query.limit, totalRows: rows.length, totalPages: query.exportScope === 'all' ? 1 : Math.max(1, Math.ceil(rows.length / query.limit)), rows: selected };
}

export function createPreviewSeoMarketing() {
  const adapters = {
    getDashboard: async (query) => response(query),
    getLeadToBillSummary: async (query) => {
      const result = response({ ...query, metric: '' });
      return { leadRecords: result.summary.leadsToday, uniqueLeads: result.summary.uniqueLeadsToday, billedLeads: result.summary.billedLeadsToday, conversionRate: result.summary.leadToBillConversionRate, range: result.range };
    },
    getLeadToBillDetails: async (query) => response({ ...query, metric: 'leadToBillRate' }),
    getGoogleStatus: async () => ({ configured: false, source: 'preview-local-fixture', updatedAt: '2026-09-22T00:00:00.000Z', warnings: ['Preview uses local fixture data only.'] }),
    getSpend: async (query) => spendResponse(query),
    exportSpend: async (query) => {
      const rows = spendResponse(query).rows;
      return { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="preview-spend-${query.startDate}-to-${query.endDate}.csv"` }, body: csv(['Date', 'Campaign', 'Spend'], rows.map((row) => [row.date, row.campaignName, row.spend])) };
    },
    exportLeads: async (query) => {
      const result = response(query);
      const all = metricRows(matchRows(query), query);
      const rows = query.exportScope === 'current' ? result.rows : all;
      return { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="preview-seo-leads-${query.startDate}-to-${query.endDate}.csv"` }, body: csv(['Lead ID', 'Customer', 'Source', 'Bill Amount'], rows.map((row) => [row.leadId, row.customerName, row.source, row.billAmount])) };
    },
  };
  return createSeoMarketingModule({ adapters, getBusinessDate: () => '2026-09-22', getRole: (req) => String(req.query?.role || req.get('x-user-role') || '') });
}
