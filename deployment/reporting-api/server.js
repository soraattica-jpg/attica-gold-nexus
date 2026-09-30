import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mysql from 'mysql2/promise';

const PORT = Number(process.env.PORT || 3015);
const MAX_LIMIT = Math.min(Number(process.env.MAX_SYNC_LIMIT || 500), 1000);
const DEFAULT_LIMIT = Math.min(Number(process.env.DEFAULT_SYNC_LIMIT || 250), MAX_LIMIT);
const API_TOKEN = String(process.env.REPORTING_API_TOKEN || '').trim();
const allowedClients = String(process.env.ALLOWED_CLIENTS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const app = express();
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'asterisk',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 6),
  namedPlaceholders: true,
  dateStrings: true,
});

function clientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '');
}

function requireAuth(req, res, next) {
  if (!API_TOKEN) {
    res.status(503).json({ error: 'reporting_api_token_not_configured' });
    return;
  }
  const auth = String(req.get('authorization') || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token !== API_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (allowedClients.length && !allowedClients.includes(clientIp(req))) {
    res.status(403).json({ error: 'client_not_allowed' });
    return;
  }
  next();
}

function parseLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseCursor(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function isoNowIst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

function normalizePhoneSql(expr) {
  return `RIGHT(REGEXP_REPLACE(COALESCE(${expr}, ''), '[^0-9]', ''), 10)`;
}

function sourceFromWebsite(rowSourceExpr = 'lead_from') {
  return `
    CASE
      WHEN LOWER(COALESCE(${rowSourceExpr}, '')) LIKE '%blog%' THEN 'Blog'
      WHEN LOWER(COALESCE(${rowSourceExpr}, '')) IN ('google lp leads', 'google lp', 'google landing page') THEN 'Google LP Leads'
      WHEN LOWER(COALESCE(utm_source, '')) IN ('google organic', 'organic', 'seo') THEN 'Google Organic'
      WHEN LOWER(COALESCE(utm_source, '')) = 'google' OR COALESCE(gclid, '') <> '' THEN 'Google Ads'
      WHEN LOWER(COALESCE(${rowSourceExpr}, '')) LIKE '%justdial%' THEN 'Justdial'
      WHEN LOWER(COALESCE(${rowSourceExpr}, '')) LIKE '%meta%' OR LOWER(COALESCE(${rowSourceExpr}, '')) LIKE '%facebook%' THEN 'Meta Ads'
      ELSE 'Website Direct'
    END
  `;
}

async function pagedQuery(req, res, sql, params = {}) {
  const limit = parseLimit(req.query.limit);
  const offset = parseCursor(req.query.cursor);
  const [rows] = await pool.query(`${sql} LIMIT :limit OFFSET :offset`, {
    ...params,
    limit,
    offset,
  });
  res.json({
    data: rows,
    next_cursor: rows.length === limit ? String(offset + limit) : null,
    has_more: rows.length === limit,
    generated_at: isoNowIst(),
  });
}

function addUpdatedAfter(req, column, params, clauses) {
  if (req.query.updated_after) {
    clauses.push(`${column} >= :updated_after`);
    params.updated_after = req.query.updated_after;
  }
}

function addDateRange(req, column, params, clauses) {
  if (req.query.start_date) {
    clauses.push(`${column} >= :start_date`);
    params.start_date = req.query.start_date;
  }
  if (req.query.end_date) {
    clauses.push(`${column} < DATE_ADD(:end_date, INTERVAL 1 DAY)`);
    params.end_date = req.query.end_date;
  }
}

app.get('/api/v1/war-room/health', async (_req, res) => {
  const [[db]] = await pool.query('SELECT 1 AS ok');
  res.json({ ok: db.ok === 1, generated_at: isoNowIst() });
});

app.use('/api/v1/war-room', requireAuth);

app.get('/api/v1/war-room/leads', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ['lead_date IS NOT NULL'];
    addUpdatedAfter(req, 'updated_at', params, clauses);
    addDateRange(req, 'lead_date', params, clauses);
    if (req.query.source) {
      clauses.push('source = :source');
      params.source = req.query.source;
    }
    const sourceExpression = sourceFromWebsite('lead_from');
    const sql = `
      SELECT * FROM (
        SELECT
          CONCAT('WEB-', leadid) AS lead_id,
          NULL AS customer_id,
          customer_name,
          ${normalizePhoneSql('contact_number')} AS normalized_phone,
          TIMESTAMP(lead_date, COALESCE(NULLIF(lead_time, ''), '00:00:00')) AS lead_created_at,
          updated_at AS lead_updated_at,
          ${sourceExpression} AS source,
          CASE
            WHEN LOWER(COALESCE(lead_from, '')) LIKE '%blog%' THEN 'Website'
            WHEN LOWER(COALESCE(lead_from, '')) IN ('google lp leads', 'google lp', 'google landing page') THEN 'Google'
            WHEN LOWER(COALESCE(utm_source, '')) IN ('google organic', 'organic', 'seo') THEN 'Google'
            WHEN LOWER(COALESCE(utm_source, '')) = 'google' OR COALESCE(gclid, '') <> '' THEN 'Google'
            ELSE 'Website'
          END AS platform,
          utm_source AS medium,
          NULL AS campaign_id,
          utm_campaign_name AS campaign_name,
          adgroupid AS adset_or_adgroup_id,
          NULL AS adset_or_adgroup_name,
          NULL AS ad_id,
          NULL AS ad_name,
          keyword,
          NULL AS search_term,
          lead_from AS landing_page,
          leadid AS form_id,
          NULL AS assigned_agent_id,
          NULL AS branch_id,
          auto_dial_status AS current_disposition,
          NULL AS current_category,
          auto_dial_status AS current_stage,
          CASE WHEN LOWER(COALESCE(auto_dial_status, '')) = 'blocked' THEN 1 ELSE 0 END AS reporting_excluded,
          lead_date,
          updated_at
        FROM attica_website_leads
        UNION ALL
        SELECT
          CONCAT('META-', leadid) AS lead_id,
          NULL AS customer_id,
          full_name AS customer_name,
          ${normalizePhoneSql('phone_number')} AS normalized_phone,
          COALESCE(lead_created_at, received_at) AS lead_created_at,
          updated_at AS lead_updated_at,
          'Meta Ads' AS source,
          'Meta' AS platform,
          NULL AS medium,
          NULL AS campaign_id,
          NULL AS campaign_name,
          NULL AS adset_or_adgroup_id,
          NULL AS adset_or_adgroup_name,
          NULL AS ad_id,
          NULL AS ad_name,
          'N/A' AS keyword,
          NULL AS search_term,
          NULL AS landing_page,
          leadid AS form_id,
          NULL AS assigned_agent_id,
          NULL AS branch_id,
          auto_dial_status AS current_disposition,
          NULL AS current_category,
          auto_dial_status AS current_stage,
          CASE WHEN LOWER(COALESCE(auto_dial_status, '')) = 'blocked' THEN 1 ELSE 0 END AS reporting_excluded,
          DATE(COALESCE(lead_created_at, received_at)) AS lead_date,
          updated_at
        FROM attica_meta_leads
        UNION ALL
        SELECT
          CONCAT('JD-', leadid) AS lead_id,
          NULL AS customer_id,
          name AS customer_name,
          ${normalizePhoneSql('COALESCE(mobile, phone)')} AS normalized_phone,
          TIMESTAMP(lead_date, COALESCE(lead_time, '00:00:00')) AS lead_created_at,
          updated_at AS lead_updated_at,
          'Justdial' AS source,
          'Justdial' AS platform,
          NULL AS medium,
          parentid AS campaign_id,
          category AS campaign_name,
          NULL AS adset_or_adgroup_id,
          NULL AS adset_or_adgroup_name,
          NULL AS ad_id,
          NULL AS ad_name,
          NULL AS keyword,
          NULL AS search_term,
          brancharea AS landing_page,
          leadid AS form_id,
          NULL AS assigned_agent_id,
          NULL AS branch_id,
          status AS current_disposition,
          lead_status AS current_category,
          status AS current_stage,
          CASE WHEN LOWER(COALESCE(auto_dial_status, '')) = 'blocked' THEN 1 ELSE 0 END AS reporting_excluded,
          lead_date,
          updated_at
        FROM attica_justdial_leads
        UNION ALL
        SELECT
          CONCAT('WA-', id) AS lead_id,
          NULL AS customer_id,
          NULL AS customer_name,
          ${normalizePhoneSql('customer_number')} AS normalized_phone,
          first_seen_at AS lead_created_at,
          last_seen_at AS lead_updated_at,
          'WhatsApp Ads' AS source,
          'WhatsApp' AS platform,
          tag_name AS medium,
          tag_name AS campaign_id,
          tag_name AS campaign_name,
          NULL AS adset_or_adgroup_id,
          NULL AS adset_or_adgroup_name,
          NULL AS ad_id,
          NULL AS ad_name,
          NULL AS keyword,
          NULL AS search_term,
          NULL AS landing_page,
          tag_name AS form_id,
          NULL AS assigned_agent_id,
          NULL AS branch_id,
          'Tagged' AS current_disposition,
          NULL AS current_category,
          'New' AS current_stage,
          0 AS reporting_excluded,
          DATE(first_seen_at) AS lead_date,
          last_seen_at AS updated_at
        FROM aisensy_tagged_contacts
      ) leads
      WHERE ${clauses.join(' AND ')}
      ORDER BY lead_updated_at ASC, lead_id ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/calls', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ['1=1'];
    addUpdatedAfter(req, 'created_at', params, clauses);
    addDateRange(req, 'call_date', params, clauses);
    if (req.query.direction) {
      clauses.push('direction = :direction');
      params.direction = req.query.direction;
    }
    const sql = `
      SELECT
        COALESCE(call_uuid, id) AS call_uuid,
        call_uuid AS linkedid,
        NULL AS lead_id,
        customer_uid AS customer_id,
        COALESCE(NULLIF(normalized_customer_number, ''), ${normalizePhoneSql('caller_id')}) AS normalized_phone,
        direction,
        CASE WHEN follow_up_flag = 1 THEN 'Follow-Up' WHEN direction = 'outgoing' THEN 'Manual/Auto Outgoing' ELSE 'Incoming' END AS call_type,
        lead AS source,
        agent_id,
        agent_name,
        NULL AS branch_id,
        language,
        COALESCE(answered_at, ring_started_at, TIMESTAMP(call_date, COALESCE(NULLIF(call_time, ''), '00:00:00')), created_at) AS started_at,
        answered_at,
        ended_at,
        talk_duration_seconds,
        GREATEST(0, TIMESTAMPDIFF(SECOND, ring_started_at, COALESCE(answered_at, ended_at, ring_started_at))) AS ring_duration_seconds,
        status,
        disposition AS disposition_code,
        disposition AS disposition_name,
        COALESCE(NULLIF(form_status, ''), NULLIF(purpose, ''), 'Others') AS disposition_category,
        has_recording = 1 AS recording_available,
        created_at AS updated_at
      FROM attica_calls
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at ASC, id ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/followups', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ['1=1'];
    addUpdatedAfter(req, 'updated_at', params, clauses);
    addDateRange(req, 'created_at', params, clauses);
    const sql = `
      SELECT
        id AS followup_id,
        NULL AS lead_id,
        NULL AS customer_id,
        ${normalizePhoneSql('phone')} AS normalized_phone,
        agent_id,
        followup_reason AS reason,
        outcome AS disposition,
        status,
        created_at,
        follow_up_at AS scheduled_at,
        updated_at AS last_attempt_at,
        follow_up_at AS next_dial_at,
        followup_expires_at AS expires_at,
        CASE WHEN status = 'Called' THEN updated_at ELSE NULL END AS completed_at
      FROM attica_followups
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at ASC, id ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/visits', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ["LOWER(COALESCE(status, '')) IN ('visited', 'billed', 'release', 'approved')"];
    addUpdatedAfter(req, 'synced_at', params, clauses);
    addDateRange(req, 'record_date', params, clauses);
    const sql = `
      SELECT
        remote_id AS visit_id,
        NULL AS lead_id,
        NULL AS customer_id,
        ${normalizePhoneSql('contact')} AS normalized_phone,
        NULL AS branch_id,
        NULL AS scheduled_visit_at,
        TIMESTAMP(record_date, COALESCE(record_time, '00:00:00')) AS actual_visit_at,
        status AS visit_status,
        walkin_type AS visit_source,
        attributed_agent_id AS agent_id,
        synced_at AS created_at,
        synced_at AS updated_at
      FROM attica_remote_customer_data
      WHERE ${clauses.join(' AND ')}
      ORDER BY synced_at ASC, remote_id ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/bills', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ["LOWER(COALESCE(status, '')) IN ('billed', 'release', 'approved')"];
    addUpdatedAfter(req, 'synced_at', params, clauses);
    addDateRange(req, 'record_date', params, clauses);
    const sql = `
      SELECT
        COALESCE(NULLIF(bill_id, ''), remote_id) AS bill_id,
        bill_id AS invoice_number,
        NULL AS customer_id,
        ${normalizePhoneSql('contact')} AS normalized_phone,
        TIMESTAMP(record_date, COALESCE(record_time, '00:00:00')) AS bill_date,
        NULL AS branch_id,
        customer_type AS business_type,
        status AS transaction_type,
        CAST(NULLIF(REGEXP_REPLACE(COALESCE(gross_w, ''), '[^0-9.]', ''), '') AS DECIMAL(12,3)) AS gold_weight,
        billing_amount AS gross_amount,
        billing_amount AS transaction_value,
        status AS bill_status,
        synced_at AS created_at,
        synced_at AS updated_at,
        attributed_agent_id,
        attribution_method,
        total_talk_seconds AS attribution_talk_seconds
      FROM attica_remote_customer_data
      WHERE ${clauses.join(' AND ')}
      ORDER BY synced_at ASC, remote_id ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/customers', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ['1=1'];
    addUpdatedAfter(req, 'updated_at', params, clauses);
    const sql = `
      SELECT
        customer_uid AS customer_id,
        normalized_phone,
        COALESCE(NULLIF(customer_name, ''), caller_name) AS customer_name,
        created_at AS first_lead_at,
        NULL AS first_connected_at,
        NULL AS first_bill_at,
        NULL AS latest_bill_at,
        0 AS total_transactions,
        'Unconverted' AS customer_type,
        COALESCE(NULLIF(form_status, ''), NULLIF(source_status, ''), callback_status) AS current_status,
        NULL AS loss_reason_code,
        NULL AS loss_reason,
        updated_at
      FROM attica_customers
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at ASC, customer_uid ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/branches', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ['1=1'];
    const sql = `
      SELECT
        branchId AS branch_id,
        COALESCE(NULLIF(branchName, ''), area) AS branch_name,
        branchId AS branch_code,
        state,
        city,
        NULL AS region,
        latitude,
        longitude,
        CASE WHEN status = 1 THEN 'active' ELSE 'inactive' END AS active_status
      FROM wp_branches_database
      WHERE ${clauses.join(' AND ')}
      ORDER BY branchId ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/agents', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ['1=1'];
    addUpdatedAfter(req, 'created_at', params, clauses);
    const sql = `
      SELECT
        a.id AS agent_id,
        a.id AS agent_code,
        a.name AS agent_name,
        a.role AS \`group\`,
        GROUP_CONCAT(al.language ORDER BY al.language SEPARATOR ', ') AS language,
        NULL AS branch_id,
        a.status AS active_status
      FROM attica_agents a
      LEFT JOIN attica_agent_languages al ON al.agent_id = a.id
      WHERE ${clauses.join(' AND ')}
      GROUP BY a.id
      ORDER BY a.id ASC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/war-room/dispositions', async (_req, res) => {
  res.json({
    data: [
      { disposition_code: 'Planning to Visit', disposition_name: 'Planning to Visit', category: 'QL', is_qualified: true, is_lost: false, is_followup: false, is_final: false },
      { disposition_code: 'Coming To Branch', disposition_name: 'Coming To Branch', category: 'QL', is_qualified: true, is_lost: false, is_followup: false, is_final: false },
      { disposition_code: 'Pending', disposition_name: 'Pending', category: 'Follow Up / Call Back', is_qualified: false, is_lost: false, is_followup: true, is_final: false },
      { disposition_code: 'RNR', disposition_name: 'RNR', category: 'RNR', is_qualified: false, is_lost: false, is_followup: true, is_final: false },
      { disposition_code: 'Not Interested', disposition_name: 'Not Interested', category: 'Lost', is_qualified: false, is_lost: true, is_followup: false, is_final: true },
      { disposition_code: 'Wrong Number', disposition_name: 'Wrong Number', category: 'Lost', is_qualified: false, is_lost: true, is_followup: false, is_final: true },
      { disposition_code: 'Out of State', disposition_name: 'Out of State', category: 'Others', is_qualified: false, is_lost: false, is_followup: false, is_final: true },
      { disposition_code: 'Billed', disposition_name: 'Billed', category: 'Billed', is_qualified: true, is_lost: false, is_followup: false, is_final: true },
    ],
    next_cursor: null,
    has_more: false,
    generated_at: isoNowIst(),
  });
});

app.get('/api/v1/war-room/loss-reasons', async (req, res, next) => {
  try {
    const params = {};
    const clauses = ["LOWER(COALESCE(disposition, '')) IN ('not interested', 'wrong number', 'spam call', 'out of state')"];
    addDateRange(req, 'call_date', params, clauses);
    const sql = `
      SELECT
        disposition AS loss_reason_code,
        disposition AS loss_reason_name,
        COUNT(*) AS lead_count,
        COUNT(DISTINCT COALESCE(NULLIF(normalized_customer_number, ''), ${normalizePhoneSql('caller_id')})) AS customer_count,
        lead AS source,
        advertisement AS campaign,
        NULL AS branch_id,
        agent_id
      FROM attica_calls
      WHERE ${clauses.join(' AND ')}
      GROUP BY disposition, lead, advertisement, agent_id
      ORDER BY lead_count DESC`;
    await pagedQuery(req, res, sql, params);
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  console.error('[reporting-api]', err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`attica-reporting-api listening on ${PORT}`);
});
