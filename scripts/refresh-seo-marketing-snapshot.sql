-- Run only from the server's local MariaDB administration account.
-- This copies a flattened reporting snapshot into attica_api_next_preview.
-- The loopback preview account is SELECT-only and never queries asterisk.

CREATE TABLE IF NOT EXISTS attica_api_next_preview.seo_marketing_snapshot_metadata (
  snapshot_name VARCHAR(80) NOT NULL PRIMARY KEY,
  source_window_start DATETIME NOT NULL,
  source_window_end DATETIME NOT NULL,
  lead_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  call_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bill_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  refreshed_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attica_api_next_preview.seo_marketing_spend_snapshot (
  snapshot_start DATE NOT NULL,
  snapshot_end DATE NOT NULL,
  metric_date VARCHAR(80) NOT NULL,
  platform VARCHAR(80) NOT NULL,
  ad_account VARCHAR(80) NOT NULL DEFAULT '',
  campaign_id VARCHAR(120) NOT NULL DEFAULT '',
  campaign_name VARCHAR(255) NOT NULL DEFAULT '',
  adset_or_adgroup VARCHAR(255) NOT NULL DEFAULT '',
  ad_or_creative VARCHAR(255) NOT NULL DEFAULT '',
  impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  clicks BIGINT UNSIGNED NOT NULL DEFAULT 0,
  spend DECIMAL(14,2) NOT NULL DEFAULT 0,
  leads INT UNSIGNED NOT NULL DEFAULT 0,
  unique_leads INT UNSIGNED NOT NULL DEFAULT 0,
  qualified_leads INT UNSIGNED NOT NULL DEFAULT 0,
  billed_leads INT UNSIGNED NOT NULL DEFAULT 0,
  bill_records INT UNSIGNED NOT NULL DEFAULT 0,
  billing_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  cpl DECIMAL(14,2) NOT NULL DEFAULT 0,
  cost_per_qualified_lead DECIMAL(14,2) NOT NULL DEFAULT 0,
  cost_per_bill DECIMAL(14,2) NOT NULL DEFAULT 0,
  roas DECIMAL(14,2) NOT NULL DEFAULT 0,
  last_synced_at VARCHAR(80) NOT NULL DEFAULT '',
  sync_status VARCHAR(80) NOT NULL DEFAULT '',
  captured_at DATETIME NOT NULL,
  KEY idx_seo_spend_snapshot_range (snapshot_start, snapshot_end),
  KEY idx_seo_spend_snapshot_campaign (campaign_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attica_api_next_preview.seo_marketing_spend_snapshot_metadata (
  snapshot_start DATE NOT NULL,
  snapshot_end DATE NOT NULL,
  dashboard_total_spend DECIMAL(14,2) NOT NULL DEFAULT 0,
  captured_at DATETIME NOT NULL,
  PRIMARY KEY (snapshot_start, snapshot_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS attica_api_next_preview.seo_marketing_lead_snapshot_next;
CREATE TABLE attica_api_next_preview.seo_marketing_lead_snapshot_next (
  source_key VARCHAR(32) NOT NULL,
  lead_id VARCHAR(120) NOT NULL,
  customer_name VARCHAR(255) NOT NULL DEFAULT '',
  phone CHAR(10) NOT NULL,
  state_name VARCHAR(100) NOT NULL DEFAULT '',
  city VARCHAR(150) NOT NULL DEFAULT '',
  language VARCHAR(30) NOT NULL DEFAULT '',
  source_name VARCHAR(120) NOT NULL,
  platform VARCHAR(80) NOT NULL,
  campaign_name VARCHAR(255) NOT NULL DEFAULT '',
  keyword_name VARCHAR(255) NOT NULL DEFAULT '',
  lead_created_at DATETIME NOT NULL,
  auto_dial_status VARCHAR(80) NOT NULL DEFAULT '',
  assigned_agent_id VARCHAR(40) NOT NULL DEFAULT '',
  assigned_agent_name VARCHAR(150) NOT NULL DEFAULT '',
  KEY idx_seo_snapshot_date (lead_created_at),
  KEY idx_seo_snapshot_phone (phone),
  KEY idx_seo_snapshot_source (source_name, platform),
  KEY idx_seo_snapshot_campaign (campaign_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO attica_api_next_preview.seo_marketing_lead_snapshot_next (
  source_key, lead_id, customer_name, phone, state_name, city, language,
  source_name, platform, campaign_name, keyword_name, lead_created_at,
  auto_dial_status, assigned_agent_id, assigned_agent_name
)
SELECT source_key, lead_id, customer_name, phone, state_name, city, language,
  source_name, platform, campaign_name, keyword_name, lead_created_at,
  auto_dial_status, assigned_agent_id, assigned_agent_name
FROM (
  SELECT
    'website' AS source_key,
    w.leadid AS lead_id,
    COALESCE(w.customer_name, '') AS customer_name,
    RIGHT(REGEXP_REPLACE(COALESCE(w.contact_number, ''), '[^0-9]', ''), 10) AS phone,
    COALESCE(w.state, '') AS state_name,
    COALESCE(NULLIF(w.city, ''), NULLIF(w.area, ''), '') AS city,
    COALESCE(w.language, '') AS language,
    CASE
      WHEN w.lead_from = 'Blog' THEN 'Blog'
      WHEN w.lead_from = 'Google LP Leads' THEN 'Google LP Leads'
      WHEN LOWER(COALESCE(w.utm_source, '')) IN ('google organic', 'organic', 'seo') THEN 'Google Organic'
      WHEN COALESCE(w.gclid, '') <> '' OR LOWER(COALESCE(w.utm_source, '')) LIKE '%google%' THEN 'Google Ads'
      ELSE 'Website Direct'
    END AS source_name,
    CASE
      WHEN w.lead_from = 'Google LP Leads' OR COALESCE(w.gclid, '') <> '' OR LOWER(COALESCE(w.utm_source, '')) LIKE '%google%' THEN 'Google'
      ELSE 'Website'
    END AS platform,
    COALESCE(NULLIF(w.utm_campaign_name, ''), 'N/A') AS campaign_name,
    COALESCE(NULLIF(w.keyword, ''), 'N/A') AS keyword_name,
    COALESCE(
      STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(w.raw_payload, '$.createdAt')), ''), '%Y-%m-%d %H:%i:%s'),
      STR_TO_DATE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(w.raw_payload, '$.Timestamp')), ''), '%Y-%m-%d %H:%i:%s'),
      TIMESTAMP(COALESCE(w.lead_date, DATE(w.received_at)), COALESCE(NULLIF(w.lead_time, ''), TIME(w.received_at))),
      w.received_at
    ) AS lead_created_at,
    COALESCE(a.status, w.auto_dial_status, 'idle') AS auto_dial_status,
    COALESCE(a.assigned_agent_id, '') AS assigned_agent_id,
    COALESCE(a.assigned_agent_name, '') AS assigned_agent_name
  FROM asterisk.attica_website_leads w
  LEFT JOIN asterisk.attica_auto_dial_leads a ON a.id = w.auto_dial_lead_id
  WHERE LOWER(IFNULL(w.auto_dial_status, '')) <> 'blocked'

  UNION ALL

  SELECT
    'meta', m.leadid, COALESCE(m.full_name, ''),
    RIGHT(REGEXP_REPLACE(COALESCE(m.phone_number, ''), '[^0-9]', ''), 10),
    COALESCE(m.state, ''), COALESCE(m.city, ''), '', 'Meta Ads', 'Meta',
    COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(m.raw_payload, '$.campaign_name')), ''), 'N/A'), 'N/A',
    COALESCE(m.lead_created_at, m.received_at),
    COALESCE(a.status, m.auto_dial_status, 'idle'), COALESCE(a.assigned_agent_id, ''), COALESCE(a.assigned_agent_name, '')
  FROM asterisk.attica_meta_leads m
  LEFT JOIN asterisk.attica_auto_dial_leads a ON a.id = m.auto_dial_lead_id
  WHERE LOWER(IFNULL(m.auto_dial_status, '')) <> 'blocked'

  UNION ALL

  SELECT
    'justdial', j.leadid, COALESCE(j.name, ''),
    RIGHT(REGEXP_REPLACE(COALESCE(NULLIF(j.mobile, ''), j.phone, ''), '[^0-9]', ''), 10),
    COALESCE(j.state, ''), COALESCE(j.city, ''), '', 'Justdial', 'Justdial',
    COALESCE(NULLIF(j.category, ''), NULLIF(j.leadtype, ''), 'N/A'), 'N/A',
    TIMESTAMP(COALESCE(j.lead_date, DATE(j.received_at)), COALESCE(j.lead_time, TIME(j.received_at))),
    COALESCE(a.status, j.auto_dial_status, j.status, 'idle'), COALESCE(a.assigned_agent_id, ''), COALESCE(a.assigned_agent_name, '')
  FROM asterisk.attica_justdial_leads j
  LEFT JOIN asterisk.attica_auto_dial_leads a ON a.id = j.auto_dial_lead_id
  WHERE LOWER(IFNULL(j.auto_dial_status, '')) <> 'blocked'
) source_leads
WHERE phone REGEXP '^[0-9]{10}$'
  AND lead_created_at >= '2026-05-01 00:00:00'
  AND lead_created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY);

DROP TABLE IF EXISTS attica_api_next_preview.seo_marketing_call_snapshot_next;
CREATE TABLE attica_api_next_preview.seo_marketing_call_snapshot_next (
  call_date DATE NOT NULL,
  phone CHAR(10) NOT NULL,
  call_attempts INT UNSIGNED NOT NULL,
  connected_calls INT UNSIGNED NOT NULL,
  total_talk_seconds BIGINT UNSIGNED NOT NULL,
  latest_call_at DATETIME NULL,
  latest_agent_name VARCHAR(150) NOT NULL DEFAULT '',
  latest_agent_id VARCHAR(40) NOT NULL DEFAULT '',
  latest_disposition VARCHAR(150) NOT NULL DEFAULT '',
  latest_callback_status VARCHAR(150) NOT NULL DEFAULT '',
  latest_status VARCHAR(150) NOT NULL DEFAULT '',
  latest_direction VARCHAR(20) NOT NULL DEFAULT '',
  latest_duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_seo_call_snapshot_phone_date (phone, call_date),
  KEY idx_seo_call_snapshot_date (call_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO attica_api_next_preview.seo_marketing_call_snapshot_next (
  call_date, phone, call_attempts, connected_calls, total_talk_seconds,
  latest_call_at, latest_agent_name, latest_agent_id, latest_disposition,
  latest_callback_status, latest_status, latest_direction, latest_duration_seconds
)
SELECT
  c.call_date,
  RIGHT(REGEXP_REPLACE(COALESCE(c.normalized_customer_number, c.caller_id, ''), '[^0-9]', ''), 10) AS phone,
  COUNT(*) AS call_attempts,
  SUM(CASE WHEN c.talk_duration_seconds > 0 OR c.answered_at IS NOT NULL THEN 1 ELSE 0 END) AS connected_calls,
  SUM(GREATEST(IFNULL(c.talk_duration_seconds, 0), 0)) AS total_talk_seconds,
  MAX(c.created_at) AS latest_call_at,
  SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(NULLIF(c.agent_name, ''), c.agent_id, '') ORDER BY c.created_at DESC SEPARATOR 0x1F), 0x1F, 1),
  SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(c.agent_id, '') ORDER BY c.created_at DESC SEPARATOR 0x1F), 0x1F, 1),
  SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(NULLIF(c.form_status, ''), NULLIF(c.purpose, ''), NULLIF(c.callback_status, ''), NULLIF(c.status, ''), '') ORDER BY c.created_at DESC SEPARATOR 0x1F), 0x1F, 1),
  SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(NULLIF(c.callback_status, ''), '') ORDER BY c.created_at DESC SEPARATOR 0x1F), 0x1F, 1),
  SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(NULLIF(c.status, ''), '') ORDER BY c.created_at DESC SEPARATOR 0x1F), 0x1F, 1),
  SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(NULLIF(c.direction, ''), '') ORDER BY c.created_at DESC SEPARATOR 0x1F), 0x1F, 1),
  SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(c.talk_duration_seconds, 0) ORDER BY c.created_at DESC SEPARATOR 0x1F), 0x1F, 1)
FROM asterisk.attica_calls c
WHERE c.call_date >= '2026-05-01'
  AND c.call_date < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
  AND RIGHT(REGEXP_REPLACE(COALESCE(c.normalized_customer_number, c.caller_id, ''), '[^0-9]', ''), 10) REGEXP '^[0-9]{10}$'
GROUP BY c.call_date, phone;

DROP TABLE IF EXISTS attica_api_next_preview.seo_marketing_bill_snapshot_next;
CREATE TABLE attica_api_next_preview.seo_marketing_bill_snapshot_next (
  remote_id VARCHAR(80) NOT NULL,
  bill_id VARCHAR(80) NOT NULL DEFAULT '',
  phone CHAR(10) NOT NULL,
  customer_name VARCHAR(255) NOT NULL DEFAULT '',
  bill_date DATE NULL,
  bill_status VARCHAR(100) NOT NULL DEFAULT '',
  billing_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  gross_weight DECIMAL(14,3) NOT NULL DEFAULT 0,
  source_attribution VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (remote_id),
  KEY idx_seo_bill_snapshot_phone_date (phone, bill_date),
  KEY idx_seo_bill_snapshot_source (source_attribution)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO attica_api_next_preview.seo_marketing_bill_snapshot_next (
  remote_id, bill_id, phone, customer_name, bill_date, bill_status,
  billing_amount, gross_weight, source_attribution
)
SELECT
  r.remote_id,
  COALESCE(NULLIF(r.bill_id, ''), r.remote_id),
  RIGHT(REGEXP_REPLACE(COALESCE(r.contact, ''), '[^0-9]', ''), 10),
  COALESCE(r.customer_name, ''), r.record_date, COALESCE(r.status, ''),
  GREATEST(IFNULL(r.billing_amount, 0), 0),
  GREATEST(COALESCE(CAST(NULLIF(r.gross_w, '') AS DECIMAL(14,3)), 0), 0),
  COALESCE(r.source_attribution, '')
FROM asterisk.attica_remote_customer_data r
WHERE RIGHT(REGEXP_REPLACE(COALESCE(r.contact, ''), '[^0-9]', ''), 10) REGEXP '^[0-9]{10}$'
  AND LOWER(COALESCE(r.status, '')) IN ('billed', 'release');

DROP TABLE IF EXISTS attica_api_next_preview.seo_marketing_lead_snapshot;
RENAME TABLE attica_api_next_preview.seo_marketing_lead_snapshot_next TO attica_api_next_preview.seo_marketing_lead_snapshot;
DROP TABLE IF EXISTS attica_api_next_preview.seo_marketing_call_snapshot;
RENAME TABLE attica_api_next_preview.seo_marketing_call_snapshot_next TO attica_api_next_preview.seo_marketing_call_snapshot;
DROP TABLE IF EXISTS attica_api_next_preview.seo_marketing_bill_snapshot;
RENAME TABLE attica_api_next_preview.seo_marketing_bill_snapshot_next TO attica_api_next_preview.seo_marketing_bill_snapshot;

REPLACE INTO attica_api_next_preview.seo_marketing_snapshot_metadata (
  snapshot_name, source_window_start, source_window_end, lead_rows, call_rows, bill_rows, refreshed_at
) VALUES (
  'seo-marketing',
  '2026-05-01 00:00:00',
  DATE_ADD(CURDATE(), INTERVAL 1 DAY),
  (SELECT COUNT(*) FROM attica_api_next_preview.seo_marketing_lead_snapshot),
  (SELECT COUNT(*) FROM attica_api_next_preview.seo_marketing_call_snapshot),
  (SELECT COUNT(*) FROM attica_api_next_preview.seo_marketing_bill_snapshot),
  NOW()
);
