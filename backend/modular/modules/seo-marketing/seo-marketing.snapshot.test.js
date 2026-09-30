import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewSeoMarketingSnapshot } from '../../config/preview-seo-marketing-snapshot.js';

test('snapshot adapter keeps lead cohort bills and follow-up stages without any write query', async () => {
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      assert.match(sql, /^SELECT\b/i);
      if (sql.includes('FROM seo_marketing_lead_snapshot')) {
        return [[{
          source_key: 'website', lead_id: 'lead-1', customer_name: 'Preview Customer', phone: '9000000001', state_name: 'Karnataka', city: 'Bengaluru', language: 'Kannada', source_name: 'Google LP Leads', platform: 'Google', campaign_name: 'Gold Sale', keyword_name: 'sell gold', lead_created_at: '2026-09-21 10:00:00', auto_dial_status: 'completed', assigned_agent_id: 'AG001', assigned_agent_name: 'Agent One',
        }]];
      }
      if (sql.includes('FROM seo_marketing_call_snapshot')) {
        return [[{
          phone: '9000000001', call_attempts: 2, connected_calls: 1, total_talk_seconds: 30, latest_call_at: '2026-09-21 10:10:00', latest_agent_name: 'Agent One', latest_agent_id: 'AG001', latest_disposition: 'Pending', latest_callback_status: 'Pending Calls', latest_status: 'completed', latest_direction: 'incoming', latest_duration_seconds: 30,
        }]];
      }
      if (sql.includes('FROM seo_marketing_spend_snapshot')) return [[]];
      if (sql.includes('AND bill_date BETWEEN')) return [[]];
      if (sql.includes('FROM seo_marketing_bill_snapshot')) {
        return [[{ bill_id: 'bill-1', phone: '9000000001', customer_name: 'Preview Customer', bill_date: '2026-09-22', billing_amount: 100000, gross_weight: 12.5 }]];
      }
      throw new Error(`Unexpected snapshot query: ${sql}`);
    },
  };

  const module = createPreviewSeoMarketingSnapshot(db);
  const report = await module.service.getDashboard({ role: 'seo', query: { startDate: '2026-09-21', endDate: '2026-09-21', metric: 'bills', page: 1, limit: 50 } });

  assert.equal(module.mode, 'reporting-snapshot');
  assert.equal(report.total, 1);
  assert.equal(report.rows[0].billIds, 'bill-1');
  assert.equal(report.summary.followUpsToday, 1);
  assert.equal(report.summary.billsToday, 1);
  assert.equal(report.summary.totalBillingAmountToday, 100000);
  assert.equal(report.range.endDateTime, '2026-09-22 00:00:00');
  assert.ok(statements.length >= 3);
});

test('snapshot exports retain the live CSV schemas and current-page scope', async () => {
  const db = {
    async query(sql) {
      assert.match(sql, /^SELECT\b/i);
      if (sql.includes('FROM seo_marketing_lead_snapshot')) {
        return [[{
          source_key: 'website', lead_id: 'lead-1', customer_name: 'Preview Customer', phone: '9000000001', state_name: 'Karnataka', city: 'Bengaluru', language: 'Kannada', source_name: 'Google LP Leads', platform: 'Google', campaign_name: 'Gold Sale', keyword_name: 'sell gold', lead_created_at: '2026-09-21 10:00:00', auto_dial_status: 'completed', assigned_agent_id: 'AG001', assigned_agent_name: 'Agent One',
        }]];
      }
      if (sql.includes('FROM seo_marketing_call_snapshot')) return [[{ phone: '9000000001', call_attempts: 2, connected_calls: 1, total_talk_seconds: 30 }]];
      if (sql.includes('FROM seo_marketing_spend_snapshot_metadata')) return [[]];
      if (sql.includes('FROM seo_marketing_spend_snapshot')) return [[{ metric_date: '2026-09-21', platform: 'Google Ads', ad_account: '123', campaign_id: '456', campaign_name: 'Gold Sale', adset_or_adgroup: 'Search', ad_or_creative: 'Ad one', impressions: 10, clicks: 2, spend: 25, leads: 1, unique_leads: 1, qualified_leads: 0, billed_leads: 0, bill_records: 0, billing_amount: 0, cpl: 25, cost_per_qualified_lead: 0, cost_per_bill: 0, roas: 0, last_synced_at: '2026-09-22T00:00:00Z', sync_status: 'healthy' }]];
      if (sql.includes('AND bill_date BETWEEN')) return [[]];
      if (sql.includes('FROM seo_marketing_bill_snapshot')) return [[]];
      throw new Error(`Unexpected snapshot query: ${sql}`);
    },
  };
  const module = createPreviewSeoMarketingSnapshot(db);
  const params = { role: 'seo', query: { startDate: '2026-09-21', endDate: '2026-09-21', page: 1, limit: 1, exportScope: 'current' } };
  const leads = await module.service.exportLeads(params);
  const spend = await module.service.exportSpend(params);
  const leadLines = leads.body.replace(/^\uFEFF/, '').split('\r\n');
  const spendLines = spend.body.replace(/^\uFEFF/, '').split('\r\n');
  assert.equal(leadLines.length, 2);
  assert.equal(spendLines.length, 2);
  assert.deepEqual(leadLines[0].replaceAll('"', '').split(','), [
    'Lead Date', 'Lead Time', 'Lead ID', 'Customer Name', 'Customer Number', 'Source', 'Platform', 'Medium', 'Campaign ID', 'Campaign Name',
    'Ad Set / Ad Group', 'Ad / Creative', 'Form', 'Keyword', 'Search Term', 'Landing Page / Blog', 'Current Stage', 'Business Stage', 'Disposition',
    'Assigned Agent', 'Call Attempts', 'Connected Calls', 'Total Talk Time', 'Bill Status', 'Bill Date', 'Bill Count', 'Bill IDs', 'Bill Amount', 'Billed Weight', 'Import File Name',
  ]);
  assert.deepEqual(spendLines[0].replaceAll('"', '').split(','), [
    'Date', 'Platform', 'Ad Account', 'Campaign ID', 'Campaign Name', 'Ad Set / Ad Group', 'Ad / Creative', 'Impressions', 'Clicks', 'Spend',
    'Leads', 'Unique Leads', 'Qualified Leads', 'Billed Leads', 'Bill Records', 'Billing Amount', 'CPL', 'Cost per Qualified Lead', 'Cost per Bill', 'ROAS', 'Last Synced At', 'Sync Status',
  ]);
  assert.match(leadLines[1], /"00:00:30"/);
});
