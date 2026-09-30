# Attica Digital War Room

Independent reporting service for analytics and marketing attribution.

## Services

- Production read-only source API: `attica-reporting-api.service`
- VM dashboard/sync service: `attica-war-room.service`

## Data Flow

```text
Production call-center DB
  -> /api/v1/war-room/* read-only APIs
  -> VM sync worker
  -> attica_reporting MariaDB
  -> /api/dashboard/* APIs
  -> dashboard frontend
```

The dashboard frontend must query only the VM service. It must not query the production database or external platforms directly.

## Local VM URLs

- Dashboard: `http://127.0.0.1:8080/` inside the VM
- Health: `http://127.0.0.1:8080/api/health`
- Sync status: `http://127.0.0.1:8080/api/sync/status`
- Manual sync: `POST http://127.0.0.1:8080/api/sync/run`

## Sync Behavior

- Initial sync backfills historical rows in pages.
- Completed endpoints switch to `updated_after` incremental sync.
- Large lists are stored in local reporting tables and served with backend pagination.
- External spend/SEO connectors are represented by local tables and should be filled by background jobs, not by browser requests.

## Environment Files

- Production source API: `/etc/attica/reporting-api.env`
- VM war-room service: `/etc/attica-war-room/war-room.env`

Both files must remain mode `600`.

## Key Tables

- `fact_leads`
- `fact_calls`
- `fact_followups`
- `fact_visits`
- `fact_bills`
- `fact_customer_status`
- `fact_marketing_spend`
- `fact_seo_metrics`
- `fact_website_analytics`
- `fact_whatsapp_events`
- `sync_watermarks`
- `webhook_events`

## External Connectors

Meta reporting exposes three independent connector states:

- Lead Ads reconciliation populates `meta_leads` and `fact_leads` and enriches missing campaign, ad-set, ad and form fields in bounded batches.
- Daily ad-level Marketing Insights populate `meta_ad_insights_daily`; dashboard spend is read from these rows and never estimated from lead volume.
- The signed `GET/POST /api/webhooks/meta/leadgen` webhook records its own verification and delivery health.

Configure the VM with backend-only values:

```env
META_GRAPH_VERSION=v25.0
META_APP_ID=...
META_ACCESS_TOKEN_FILE=/etc/attica-war-room/meta-access-token
META_APP_SECRET_FILE=/etc/attica-war-room/meta-app-secret
META_WEBHOOK_VERIFY_TOKEN_FILE=/etc/attica-war-room/meta-webhook-verify-token
META_PAGE_IDS=...
META_AD_ACCOUNT_IDS=act_...
META_SYNC_INTERVAL_MS=900000
META_RECONCILIATION_DAYS=37
META_GRAPH_MAX_PAGES=100
META_ENRICH_MAX_LEADS=200
META_LEAD_FORWARD_URL=http://192.168.122.1:3001/api/internal/meta-leads/ingest
META_LEAD_FORWARD_SECRET_FILE=/etc/attica-war-room/meta-lead-forward-secret
```

The dashboard retains previously synchronized rows when authentication or asset access fails. Lead Sync, Insights Sync and Webhook health are stored separately in `meta_sync_state` and exposed through `/api/sync/status`.
The leadgen webhook also forwards each saved lead to the call-center's existing Meta fresh-lead queue when the forwarding settings are present. Configure the same secret on the call-center API with `ATTICA_META_REALTIME_INGEST_SECRET` or `ATTICA_META_REALTIME_INGEST_SECRET_FILE`.

Google LP and Organic have dedicated report tabs with the same page-wise lead, call, qualification and billing attribution used by the Meta report. Google LP reads actual Google Ads spend, impressions, clicks and conversion actions. Organic synchronizes Search Console landing-page and query metrics into `fact_seo_metrics`, and GA4 Organic Search sessions and key events into `fact_website_analytics`. The default reconciliation window is 37 days and runs every six hours; the dashboard always reads the local reporting database.

Organic connector settings:

```env
ATTICA_SEARCH_CONSOLE_SITE_URL=https://www.atticagoldcompany.com/
ATTICA_GA4_PROPERTY_ID=123456789
GOOGLE_ORGANIC_SYNC_INTERVAL_MS=21600000
GOOGLE_ORGANIC_RECONCILIATION_DAYS=37
```

The existing Google service-account credentials must have read access to the configured Search Console property and GA4 property. Set `GOOGLE_ORGANIC_STARTUP_SYNC=0` only for maintenance runs where the startup reconciliation should be skipped.

## Other External Connectors Pending

- Google Ads OAuth refresh-token based reporting sync
- Search Console reporting sync
- GA4 reporting sync
- Website/blog production webhook wiring
- WATI/AiSensy event forwarding

These should write into the reporting tables through backend workers.
