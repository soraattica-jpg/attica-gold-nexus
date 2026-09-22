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
