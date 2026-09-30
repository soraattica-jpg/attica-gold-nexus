// Administrator-run only. Reads the existing local production reporting API
// and writes a range-specific spend snapshot into the isolated preview DB.
// It is never called by the preview service.
import { spawnSync } from 'node:child_process';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const decimal = (value) => Math.max(0, Number(value) || 0);
const startDate = process.argv[2] || new Date().toISOString().slice(0, 10);
const endDate = process.argv[3] || startDate;
if (!DATE.test(startDate) || !DATE.test(endDate) || startDate > endDate) throw new Error('Use valid start and end dates: YYYY-MM-DD');

const url = new URL('http://127.0.0.1:3001/api/warroom/marketing/spend');
url.search = new URLSearchParams({ role: 'seo', startDate, endDate, page: '1', limit: '100', exportScope: 'all' }).toString();
const response = await fetch(url);
if (!response.ok) throw new Error(`Production spend read failed with HTTP ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload.rows)) throw new Error('Production spend response is missing rows');
const dashboardUrl = new URL('http://127.0.0.1:3001/api/seo-marketing/leads');
dashboardUrl.search = new URLSearchParams({ role: 'seo', startDate, endDate, page: '1', limit: '1', refresh: `snapshot-${Date.now()}` }).toString();
const dashboardResponse = await fetch(dashboardUrl);
if (!dashboardResponse.ok) throw new Error(`Production dashboard spend read failed with HTTP ${dashboardResponse.status}`);
const dashboard = await dashboardResponse.json();
const dashboardSpend = decimal(dashboard?.summary?.campaignSpendToday);

const sqlText = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const rows = payload.rows.map((row) => `(${[
  sqlText(startDate), sqlText(endDate), sqlText(row.date), sqlText(row.platform), sqlText(row.adAccount), sqlText(row.campaignId), sqlText(row.campaignName), sqlText(row.adSetOrAdGroup), sqlText(row.adOrCreative),
  decimal(row.impressions), decimal(row.clicks), decimal(row.spend), decimal(row.leads), decimal(row.uniqueLeads), decimal(row.qualifiedLeads), decimal(row.billedLeads), decimal(row.billRecords), decimal(row.billingAmount), decimal(row.cpl), decimal(row.costPerQualifiedLead), decimal(row.costPerBill), decimal(row.roas), sqlText(row.lastSyncedAt), sqlText(row.syncStatus), 'NOW()',
].join(', ')})`);

const sql = [
  'CREATE TABLE IF NOT EXISTS attica_api_next_preview.seo_marketing_spend_snapshot (snapshot_start DATE NOT NULL, snapshot_end DATE NOT NULL, metric_date VARCHAR(80) NOT NULL, platform VARCHAR(80) NOT NULL, ad_account VARCHAR(80) NOT NULL DEFAULT \'\', campaign_id VARCHAR(120) NOT NULL DEFAULT \'\', campaign_name VARCHAR(255) NOT NULL DEFAULT \'\', adset_or_adgroup VARCHAR(255) NOT NULL DEFAULT \'\', ad_or_creative VARCHAR(255) NOT NULL DEFAULT \'\', impressions BIGINT UNSIGNED NOT NULL DEFAULT 0, clicks BIGINT UNSIGNED NOT NULL DEFAULT 0, spend DECIMAL(14,2) NOT NULL DEFAULT 0, leads INT UNSIGNED NOT NULL DEFAULT 0, unique_leads INT UNSIGNED NOT NULL DEFAULT 0, qualified_leads INT UNSIGNED NOT NULL DEFAULT 0, billed_leads INT UNSIGNED NOT NULL DEFAULT 0, bill_records INT UNSIGNED NOT NULL DEFAULT 0, billing_amount DECIMAL(14,2) NOT NULL DEFAULT 0, cpl DECIMAL(14,2) NOT NULL DEFAULT 0, cost_per_qualified_lead DECIMAL(14,2) NOT NULL DEFAULT 0, cost_per_bill DECIMAL(14,2) NOT NULL DEFAULT 0, roas DECIMAL(14,2) NOT NULL DEFAULT 0, last_synced_at VARCHAR(80) NOT NULL DEFAULT \'\', sync_status VARCHAR(80) NOT NULL DEFAULT \'\', captured_at DATETIME NOT NULL, KEY idx_seo_spend_snapshot_range (snapshot_start, snapshot_end), KEY idx_seo_spend_snapshot_campaign (campaign_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
  'CREATE TABLE IF NOT EXISTS attica_api_next_preview.seo_marketing_spend_snapshot_metadata (snapshot_start DATE NOT NULL, snapshot_end DATE NOT NULL, dashboard_total_spend DECIMAL(14,2) NOT NULL DEFAULT 0, captured_at DATETIME NOT NULL, PRIMARY KEY (snapshot_start, snapshot_end)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
  `DELETE FROM attica_api_next_preview.seo_marketing_spend_snapshot WHERE snapshot_start=${sqlText(startDate)} AND snapshot_end=${sqlText(endDate)};`,
  `REPLACE INTO attica_api_next_preview.seo_marketing_spend_snapshot_metadata (snapshot_start, snapshot_end, dashboard_total_spend, captured_at) VALUES (${sqlText(startDate)}, ${sqlText(endDate)}, ${dashboardSpend}, NOW());`,
  ...(rows.length ? [`INSERT INTO attica_api_next_preview.seo_marketing_spend_snapshot (snapshot_start, snapshot_end, metric_date, platform, ad_account, campaign_id, campaign_name, adset_or_adgroup, ad_or_creative, impressions, clicks, spend, leads, unique_leads, qualified_leads, billed_leads, bill_records, billing_amount, cpl, cost_per_qualified_lead, cost_per_bill, roas, last_synced_at, sync_status, captured_at) VALUES ${rows.join(', ')};`] : []),
].join('\n');
const result = spawnSync('/usr/bin/mysql', [], { input: sql, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Unable to write isolated spend snapshot');
console.log(JSON.stringify({ snapshot: 'seo-marketing-spend', startDate, endDate, rows: rows.length, totalSpend: decimal(payload.totalSpend), dashboardSpend }));
