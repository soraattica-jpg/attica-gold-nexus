import { createSeoMarketingModule } from '../modules/seo-marketing/index.js';
import { getKolkataDateRange } from '../modules/seo-marketing/seo-marketing.validation.js';

const asText = (value) => String(value || '').trim();
const normalized = (value) => asText(value).toLowerCase();
const number = (value) => Math.max(0, Number(value) || 0);
const chunk = (values, size = 3000) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size));
const dateOnly = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? asText(value).slice(0, 10) : date.toISOString().slice(0, 10);
};

function activeFilter(value) {
  const text = normalized(value);
  return text && !['all', 'all sources', 'all platforms', 'all campaigns'].includes(text);
}

function leadFilter(query) {
  const range = getKolkataDateRange(query, '2026-09-22');
  const clauses = ['lead_created_at >= ?', 'lead_created_at < ?'];
  const params = [range.startDateTime, range.endDateTime];
  const filters = [
    ['source_name', query.source], ['platform', query.platform], ['campaign_name', query.campaign],
    ['keyword_name', query.keyword], ['state_name', query.state], ['language', query.language],
  ];
  for (const [column, value] of filters) {
    if (!activeFilter(value)) continue;
    clauses.push(`LOWER(${column}) LIKE ?`);
    params.push(`%${normalized(value)}%`);
  }
  if (activeFilter(query.search)) {
    const value = `%${normalized(query.search)}%`;
    clauses.push(`(LOWER(lead_id) LIKE ? OR LOWER(customer_name) LIKE ? OR phone LIKE ? OR LOWER(source_name) LIKE ? OR LOWER(platform) LIKE ? OR LOWER(campaign_name) LIKE ? OR LOWER(keyword_name) LIKE ? OR LOWER(assigned_agent_name) LIKE ?)`);
    params.push(value, value, value, value, value, value, value, value);
  }
  return { range, sql: clauses.join(' AND '), params };
}

function stage(row, billCount) {
  const value = normalized(row.latest_disposition || row.latest_callback_status || row.latest_status);
  const status = normalized(row.latest_status || row.auto_dial_status);
  const direction = normalized(row.latest_direction);
  const duration = number(row.latest_duration_seconds);
  if (billCount) return 'Billed';
  if (value.includes('follow') || value.includes('pending') || value.includes('call back') || value.includes('callback') || value.includes('discuss and come')
    || (direction === 'incoming' && duration > 0 && ['completed', 'answered', 'transferred'].includes(status) && (['rnr', 'na'].includes(value) || value.includes('ring no reply') || value.includes('no answer')))
    || (status === 'completed' && (value.includes('customer disconnected') || value.includes('call disconnected') || value === 'disconnected' || value.includes('pending calls')))) return 'Follow Up / Call Back';
  if (value === 'ql' || value.includes('planning to visit') || value.includes('tentative visit') || value.includes('coming to branch') || value.includes('coming to office') || value.includes('nearest branch') || value.includes('branch timing') || (value.includes('interested') && !value.includes('not interested')) || value.includes('margin reduce') || value.includes('increase quotation') || value.includes('speed up validation') || value.includes('door-step') || value.includes('door step')) return 'QL';
  if (value === 'lost' || value.includes('l2 lost') || value.includes('abuse') || value.includes('not interested') || value.includes('wrong call') || value.includes('wrong number') || value.includes('job related') || value.includes('advertisement') || value.includes('general enquiry - other') || value.includes('disconnected - language barrier') || value.includes('spam') || value.includes('not feasible') || value.includes("can't send executive") || value.includes('cant send executive') || value.includes('quotation mismatch') || value.includes('bm behaviour') || value.includes('branch closed') || value.includes('without purity') || value.includes('service delay') || value.includes('staff behaviour') || value.includes('not serviceable') || value.includes('sold outside')) return 'Lost';
  return 'Enquiry';
}

function summary(rows, linkedBillRows = [], spendRows = [], dashboardSpend = null) {
  const unique = new Set(rows.map((row) => row.customerNumber));
  const billRows = linkedBillRows.length ? linkedBillRows : rows.filter((row) => row.billCount > 0);
  const billed = new Set(billRows.map((row) => row.leadId).filter(Boolean));
  const sum = (key) => rows.reduce((total, row) => total + number(row[key]), 0);
  const billRecords = billRows.reduce((total, row) => total + number(row.billCount), 0);
  const spend = Number((dashboardSpend === null ? spendRows.reduce((total, row) => total + number(row.spend), 0) : number(dashboardSpend)).toFixed(2));
  return {
    leadsToday: rows.length,
    uniqueLeadsToday: unique.size,
    contactedToday: rows.filter((row) => row.callAttempts > 0).length,
    connectedToday: rows.filter((row) => row.connectedCalls > 0).length,
    followUpsToday: rows.filter((row) => normalized(row.businessStage).includes('follow')).length,
    qualifiedLeadsToday: rows.filter((row) => row.businessStage === 'QL').length,
    lostLeadsToday: rows.filter((row) => row.businessStage === 'Lost').length,
    billsToday: billRecords,
    billedLeadsToday: billed.size,
    totalBillingAmountToday: billRows.reduce((total, row) => total + number(row.billAmount), 0),
    totalBillingGrossWeightToday: billRows.reduce((total, row) => total + number(row.billingGrossWeight), 0),
    campaignSpendToday: spend,
    leadToBillConversionRate: unique.size ? Number(((billed.size / unique.size) * 100).toFixed(2)) : 0,
    costPerLead: unique.size ? Number((spend / unique.size).toFixed(2)) : 0,
    costPerBill: billRecords ? Number((spend / billRecords).toFixed(2)) : 0,
  };
}

function groupRows(rows, key, name) {
  const groups = new Map();
  for (const row of rows) {
    const value = asText(row[key]) || 'N/A';
    const item = groups.get(value) || { [name]: value, leads: 0, uniqueLeads: new Set(), contacted: 0, connected: 0, ql: 0, bills: 0, billingAmount: 0, billingGrossWeight: 0 };
    item.leads += 1;
    item.uniqueLeads.add(row.customerNumber);
    item.contacted += row.callAttempts > 0 ? 1 : 0;
    item.connected += row.connectedCalls > 0 ? 1 : 0;
    item.ql += row.businessStage === 'QL' ? 1 : 0;
    item.bills += row.billCount;
    item.billingAmount += row.billAmount;
    item.billingGrossWeight += row.billingGrossWeight;
    groups.set(value, item);
  }
  return [...groups.values()].map((item) => ({ ...item, uniqueLeads: item.uniqueLeads.size }));
}

function metricRows(rows, query) {
  const metric = normalized(query.metric);
  if (metric === 'bills') return rows.filter((row) => row.billCount > 0);
  if (metric === 'leadtobillrate' && normalized(query.view) !== 'unique-leads') return rows.filter((row) => row.billCount > 0);
  if (metric === 'connected') return rows.filter((row) => row.connectedCalls > 0);
  if (metric === 'contacted') return rows.filter((row) => row.callAttempts > 0);
  if (metric === 'ql') return rows.filter((row) => row.businessStage === 'QL');
  if (metric === 'lost') return rows.filter((row) => row.businessStage === 'Lost');
  if (metric === 'followups') return rows.filter((row) => normalized(row.businessStage).includes('follow'));
  return rows;
}

const leadExportHeaders = [
  'Lead Date', 'Lead Time', 'Lead ID', 'Customer Name', 'Customer Number', 'Source', 'Platform', 'Medium', 'Campaign ID', 'Campaign Name',
  'Ad Set / Ad Group', 'Ad / Creative', 'Form', 'Keyword', 'Search Term', 'Landing Page / Blog', 'Current Stage', 'Business Stage', 'Disposition',
  'Assigned Agent', 'Call Attempts', 'Connected Calls', 'Total Talk Time', 'Bill Status', 'Bill Date', 'Bill Count', 'Bill IDs', 'Bill Amount',
  'Billed Weight', 'Import File Name',
];

const spendExportHeaders = [
  'Date', 'Platform', 'Ad Account', 'Campaign ID', 'Campaign Name', 'Ad Set / Ad Group', 'Ad / Creative', 'Impressions', 'Clicks', 'Spend',
  'Leads', 'Unique Leads', 'Qualified Leads', 'Billed Leads', 'Bill Records', 'Billing Amount', 'CPL', 'Cost per Qualified Lead', 'Cost per Bill',
  'ROAS', 'Last Synced At', 'Sync Status',
];

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(number(seconds)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainingSeconds = value % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function csv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
}

function leadExportRow(row) {
  return [
    row.leadDate, row.leadTime, row.leadId, row.customerName, row.customerNumber, row.source, row.platform, '', '', row.campaignName,
    '', '', '', row.keyword, '', '', row.currentStage, row.businessStage, row.disposition,
    row.assignedAgentName || row.assignedAgentId, row.callAttempts, row.connectedCalls, formatDuration(row.totalTalkSeconds),
    row.billStatus || (row.billCount ? 'Billed' : ''), row.billDate, row.billCount, row.billIds, row.billAmount, row.billingGrossWeight, '',
  ];
}

function spendExportRow(row) {
  return [
    row.date, row.platform, row.adAccount, row.campaignId, row.campaignName, row.adSetOrAdGroup, row.adOrCreative,
    row.impressions, row.clicks, row.spend, row.leads, row.uniqueLeads, row.qualifiedLeads, row.billedLeads, row.billRecords,
    row.billingAmount, row.cpl, row.costPerQualifiedLead, row.costPerBill, row.roas, row.lastSyncedAt, row.syncStatus,
  ];
}

export function createPreviewSeoMarketingSnapshot(db) {
  if (!db?.query) throw new Error('SEO/Marketing snapshot requires the isolated preview database');

  const loadRows = async (query) => {
    const filter = leadFilter(query);
    const [sourceRows] = await db.query(`SELECT source_key, lead_id, customer_name, phone, state_name, city, language, source_name, platform, campaign_name, keyword_name, lead_created_at, auto_dial_status, assigned_agent_id, assigned_agent_name FROM seo_marketing_lead_snapshot WHERE ${filter.sql} ORDER BY lead_created_at DESC, lead_id DESC`, filter.params);
    const phones = [...new Set(sourceRows.map((row) => asText(row.phone)).filter(Boolean))];
    const callStats = new Map();
    const billStats = new Map();
    for (const phoneList of chunk(phones)) {
      const [calls] = await db.query(`SELECT phone, SUM(call_attempts) AS call_attempts, SUM(connected_calls) AS connected_calls, SUM(total_talk_seconds) AS total_talk_seconds, MAX(latest_call_at) AS latest_call_at, SUBSTRING_INDEX(GROUP_CONCAT(latest_agent_name ORDER BY latest_call_at DESC SEPARATOR 0x1F), 0x1F, 1) AS latest_agent_name, SUBSTRING_INDEX(GROUP_CONCAT(latest_agent_id ORDER BY latest_call_at DESC SEPARATOR 0x1F), 0x1F, 1) AS latest_agent_id, SUBSTRING_INDEX(GROUP_CONCAT(latest_disposition ORDER BY latest_call_at DESC SEPARATOR 0x1F), 0x1F, 1) AS latest_disposition, SUBSTRING_INDEX(GROUP_CONCAT(latest_callback_status ORDER BY latest_call_at DESC SEPARATOR 0x1F), 0x1F, 1) AS latest_callback_status, SUBSTRING_INDEX(GROUP_CONCAT(latest_status ORDER BY latest_call_at DESC SEPARATOR 0x1F), 0x1F, 1) AS latest_status, SUBSTRING_INDEX(GROUP_CONCAT(latest_direction ORDER BY latest_call_at DESC SEPARATOR 0x1F), 0x1F, 1) AS latest_direction, SUBSTRING_INDEX(GROUP_CONCAT(latest_duration_seconds ORDER BY latest_call_at DESC SEPARATOR 0x1F), 0x1F, 1) AS latest_duration_seconds FROM seo_marketing_call_snapshot WHERE phone IN (?) AND call_date >= ? AND call_date <= ? GROUP BY phone`, [phoneList, query.startDate, query.endDate]);
      for (const row of calls) callStats.set(asText(row.phone), row);
      const [bills] = await db.query(`SELECT phone, COUNT(DISTINCT bill_id) AS bill_count, GROUP_CONCAT(DISTINCT bill_id ORDER BY bill_date DESC SEPARATOR ', ') AS bill_ids, MAX(bill_date) AS bill_date, SUM(billing_amount) AS bill_amount, SUM(gross_weight) AS billing_gross_weight FROM seo_marketing_bill_snapshot WHERE phone IN (?) AND bill_date BETWEEN ? AND ? GROUP BY phone`, [phoneList, query.startDate, query.endDate]);
      for (const row of bills) billStats.set(asText(row.phone), row);
    }
    return sourceRows.map((row) => {
      const phone = asText(row.phone);
      const calls = callStats.get(phone) || {};
      const bills = billStats.get(phone) || {};
      const billCount = number(bills.bill_count);
      const leadAt = new Date(row.lead_created_at);
      return {
        leadId: asText(row.lead_id), sourceKey: asText(row.source_key), customerName: asText(row.customer_name), customerNumber: phone,
        state: asText(row.state_name), city: asText(row.city), language: asText(row.language), source: asText(row.source_name), platform: asText(row.platform), campaignName: asText(row.campaign_name) || 'N/A', keyword: asText(row.keyword_name) || 'N/A',
        leadDate: Number.isNaN(leadAt.getTime()) ? '' : leadAt.toISOString().slice(0, 10), leadTime: Number.isNaN(leadAt.getTime()) ? '' : leadAt.toISOString().slice(11, 19), leadCreatedAt: Number.isNaN(leadAt.getTime()) ? '' : leadAt.toISOString(),
        currentStage: asText(row.auto_dial_status), assignedAgentId: asText(row.assigned_agent_id || calls.latest_agent_id), assignedAgentName: asText(row.assigned_agent_name || calls.latest_agent_name),
        callAttempts: number(calls.call_attempts), connectedCalls: number(calls.connected_calls), totalTalkSeconds: number(calls.total_talk_seconds), disposition: asText(calls.latest_disposition), latestStatus: asText(calls.latest_status),
        businessStage: stage({ ...row, ...calls }, billCount), billCount, billIds: asText(bills.bill_ids), billDate: bills.bill_date ? new Date(bills.bill_date).toISOString().slice(0, 10) : '', billAmount: number(bills.bill_amount), billingGrossWeight: number(bills.billing_gross_weight),
      };
    });
  };

  const loadSpend = async (query) => {
    if (activeFilter(query.source) && !normalized(query.source).includes('google')) return [];
    if (activeFilter(query.platform) && !normalized(query.platform).includes('google')) return [];
    const clauses = ['snapshot_start = ?', 'snapshot_end = ?'];
    const params = [query.startDate, query.endDate];
    if (activeFilter(query.campaign)) {
      clauses.push('LOWER(campaign_name) LIKE ?');
      params.push(`%${normalized(query.campaign)}%`);
    }
    const [rows] = await db.query(`SELECT metric_date, platform, ad_account, campaign_id, campaign_name, adset_or_adgroup, ad_or_creative, impressions, clicks, spend, leads, unique_leads, qualified_leads, billed_leads, bill_records, billing_amount, cpl, cost_per_qualified_lead, cost_per_bill, roas, last_synced_at, sync_status FROM seo_marketing_spend_snapshot WHERE ${clauses.join(' AND ')} ORDER BY spend DESC, campaign_name ASC`, params);
    return rows.map((row) => ({
      date: asText(row.metric_date), platform: asText(row.platform), adAccount: asText(row.ad_account), campaignId: asText(row.campaign_id), campaignName: asText(row.campaign_name), adSetOrAdGroup: asText(row.adset_or_adgroup), adOrCreative: asText(row.ad_or_creative),
      impressions: number(row.impressions), clicks: number(row.clicks), spend: number(row.spend), leads: number(row.leads), uniqueLeads: number(row.unique_leads), qualifiedLeads: number(row.qualified_leads), billedLeads: number(row.billed_leads), billRecords: number(row.bill_records), billingAmount: number(row.billing_amount), cpl: number(row.cpl), costPerQualifiedLead: number(row.cost_per_qualified_lead), costPerBill: number(row.cost_per_bill), roas: number(row.roas), lastSyncedAt: asText(row.last_synced_at), syncStatus: asText(row.sync_status),
    }));
  };

  const loadDashboardSpend = async (query) => {
    const [rows] = await db.query('SELECT dashboard_total_spend FROM seo_marketing_spend_snapshot_metadata WHERE snapshot_start = ? AND snapshot_end = ?', [query.startDate, query.endDate]);
    return rows.length ? number(rows[0].dashboard_total_spend) : null;
  };

  const loadLinkedBills = async (leadRows) => {
    const byPhone = new Map();
    for (const lead of leadRows) {
      if (!lead.customerNumber || !lead.leadCreatedAt) continue;
      const list = byPhone.get(lead.customerNumber) || [];
      list.push(lead);
      byPhone.set(lead.customerNumber, list);
    }
    for (const list of byPhone.values()) list.sort((left, right) => left.leadCreatedAt.localeCompare(right.leadCreatedAt) || left.leadId.localeCompare(right.leadId));
    const linked = [];
    const seen = new Set();
    for (const phoneList of chunk([...byPhone.keys()])) {
      const [bills] = await db.query(`SELECT bill_id, phone, customer_name, bill_date, billing_amount, gross_weight FROM seo_marketing_bill_snapshot WHERE phone IN (?) ORDER BY bill_date DESC, bill_id DESC`, [phoneList]);
      for (const bill of bills) {
        const billId = asText(bill.bill_id);
        if (!billId || seen.has(billId)) continue;
        const billDate = dateOnly(bill.bill_date);
        const cutoff = `${billDate}T23:59:59.999Z`;
        const lead = (byPhone.get(asText(bill.phone)) || []).find((item) => item.leadCreatedAt <= cutoff);
        if (!lead) continue;
        seen.add(billId);
        linked.push({ ...lead, customerName: asText(bill.customer_name) || lead.customerName, billStatus: 'Billed', billCount: 1, billIds: billId, billDate, billAmount: number(bill.billing_amount), billingGrossWeight: number(bill.gross_weight), currentStage: 'Completed', businessStage: 'Billed' });
      }
    }
    return linked.sort((left, right) => right.billDate.localeCompare(left.billDate) || right.leadCreatedAt.localeCompare(left.leadCreatedAt));
  };

  const dashboard = async (query) => {
    const allRows = await loadRows(query);
    const linkedBillRows = await loadLinkedBills(allRows);
    const spendRows = await loadSpend(query);
    const dashboardSpend = await loadDashboardSpend(query);
    const selectedRows = normalized(query.metric) === 'bills' ? linkedBillRows : metricRows(allRows, query);
    const offset = (query.page - 1) * query.limit;
    const total = selectedRows.length;
    return {
      range: getKolkataDateRange(query, '2026-09-22'), metric: asText(query.metric), view: asText(query.view), page: query.page, limit: query.limit,
      total, totalPages: Math.max(1, Math.ceil(total / query.limit)), partialSummary: false, rows: selectedRows.slice(offset, offset + query.limit), summary: summary(allRows, linkedBillRows, spendRows, dashboardSpend),
      sourceFunnel: groupRows(allRows, 'source', 'source'), campaignPerformance: groupRows(allRows, 'campaignName', 'campaignName'), keywordPerformance: groupRows(allRows, 'keyword', 'keyword'), landingPagePerformance: [], billConversionHistory: linkedBillRows,
    };
  };

  const adapters = {
    getDashboard: dashboard,
    getLeadToBillSummary: async (query) => {
      const report = await dashboard({ ...query, metric: '', page: 1, limit: 1 });
      return { leadRecords: report.summary.leadsToday, uniqueLeads: report.summary.uniqueLeadsToday, billedLeads: report.summary.billedLeadsToday, conversionRate: report.summary.leadToBillConversionRate, range: report.range };
    },
    getLeadToBillDetails: async (query) => dashboard({ ...query, metric: 'leadToBillRate' }),
    getGoogleStatus: async () => ({ configured: true, source: 'isolated-reporting-snapshot', updatedAt: new Date().toISOString(), warnings: ['Preview uses captured Google spend; it does not contact Google.'] }),
    getSpend: async (query) => {
      const rows = await loadSpend(query);
      const offset = (query.page - 1) * query.limit;
      return { metric: 'spend', totalSpend: Number(rows.reduce((total, row) => total + row.spend, 0).toFixed(2)), page: query.page, limit: query.limit, totalRows: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / query.limit)), rows: rows.slice(offset, offset + query.limit) };
    },
    exportSpend: async (query) => {
      const rows = await loadSpend(query);
      const exportRows = normalized(query.exportScope) === 'current' ? rows.slice((query.page - 1) * query.limit, query.page * query.limit) : rows;
      return { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="warroom-campaign-spend-${query.startDate}-to-${query.endDate}.csv"` }, body: csv(spendExportHeaders, exportRows.map(spendExportRow)) };
    },
    exportLeads: async (query) => {
      const report = await dashboard(query);
      const rows = normalized(query.exportScope) === 'current' ? report.rows : (normalized(query.metric) === 'bills' ? report.billConversionHistory : metricRows(await loadRows(query), query));
      return { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="seo-marketing-leads-${query.startDate}-to-${query.endDate}.csv"` }, body: csv(leadExportHeaders, rows.map(leadExportRow)) };
    },
  };
  return { ...createSeoMarketingModule({ adapters, getBusinessDate: () => '2026-09-22', getRole: (req) => String(req.query?.role || req.get('x-user-role') || '') }), mode: 'reporting-snapshot' };
}
