import compression from 'compression';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8080);
const SOURCE_API_BASE = String(process.env.SOURCE_API_BASE || '').replace(/\/$/, '');
const SOURCE_API_TOKEN = String(process.env.SOURCE_API_TOKEN || '').trim();
const INTERNAL_WEBHOOK_SECRET = String(process.env.INTERNAL_WEBHOOK_SECRET || '').trim();
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 60000);
const SOURCE_RECONCILIATION_DAYS = Math.max(2, Math.min(7, Number(process.env.SOURCE_RECONCILIATION_DAYS || 2)));
const PAGE_LIMIT_MAX = Math.min(Number(process.env.PAGE_LIMIT_MAX || 100), 250);
const SYNC_LIMIT = Math.min(Number(process.env.SYNC_LIMIT || 500), 500);
const SYNC_MAX_PAGES_PER_ENDPOINT = Math.max(1, Number(process.env.SYNC_MAX_PAGES_PER_ENDPOINT || 80));
const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim();
const AUTH_USERS = JSON.parse(process.env.WAR_ROOM_USERS_JSON || '[]');
const LOGIN_LOCK_MAX_ATTEMPTS = Number(process.env.LOGIN_LOCK_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_WINDOW_MS = Number(process.env.LOGIN_LOCK_WINDOW_MS || 15 * 60 * 1000);
const LOGIN_LOCK_DURATION_MS = Number(process.env.LOGIN_LOCK_DURATION_MS || 15 * 60 * 1000);
const SESSION_DURATION_MS = Number(process.env.SESSION_DURATION_MS || 8 * 60 * 60 * 1000);
const REMEMBER_SESSION_DURATION_MS = Number(process.env.REMEMBER_SESSION_DURATION_MS || 7 * 24 * 60 * 60 * 1000);
const GOOGLE_SERVICE_ACCOUNT_PATH = String(process.env.ATTICA_GOOGLE_SERVICE_ACCOUNT_PATH || '/etc/attica/google-service-account.json').trim();
const GOOGLE_ADS_CUSTOMER_ID = String(process.env.ATTICA_GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
const GOOGLE_ADS_MANAGER_CUSTOMER_ID = String(process.env.ATTICA_GOOGLE_ADS_MANAGER_CUSTOMER_ID || '').replace(/\D/g, '');
const GOOGLE_ADS_DEVELOPER_TOKEN = String(process.env.ATTICA_GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
const GOOGLE_ADS_API_VERSION = String(process.env.ATTICA_GOOGLE_ADS_API_VERSION || 'v25').trim();
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const GOOGLE_SEARCH_CONSOLE_SITE_URL = String(process.env.ATTICA_SEARCH_CONSOLE_SITE_URL || '').trim();
const GOOGLE_GA4_PROPERTY_ID = String(process.env.ATTICA_GA4_PROPERTY_ID || '').replace(/\D/g, '');
const GOOGLE_ORGANIC_SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly';
const GOOGLE_ORGANIC_SYNC_INTERVAL_MS = Math.max(30 * 60 * 1000, Number(process.env.GOOGLE_ORGANIC_SYNC_INTERVAL_MS || 6 * 60 * 60 * 1000));
const GOOGLE_ORGANIC_RECONCILIATION_DAYS = Math.max(1, Math.min(90, Number(process.env.GOOGLE_ORGANIC_RECONCILIATION_DAYS || 37)));
const GOOGLE_ORGANIC_STARTUP_SYNC = String(process.env.GOOGLE_ORGANIC_STARTUP_SYNC ?? '1').trim() !== '0';

function readSecretValue(value, filePath) {
  const direct = String(value || '').trim();
  if (direct) return direct;
  const resolvedPath = String(filePath || '').trim();
  if (!resolvedPath) return '';
  try {
    return fs.readFileSync(resolvedPath, 'utf8').trim();
  } catch {
    return '';
  }
}

function commaSeparatedValues(value) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

const META_GRAPH_VERSION = String(process.env.META_GRAPH_VERSION || 'v25.0').replace(/^\/?/, '');
const META_ACCESS_TOKEN = readSecretValue(process.env.META_ACCESS_TOKEN, process.env.META_ACCESS_TOKEN_FILE);
const META_APP_ID = String(process.env.META_APP_ID || '').trim();
const META_APP_SECRET = readSecretValue(process.env.META_APP_SECRET, process.env.META_APP_SECRET_FILE);
const META_WEBHOOK_VERIFY_TOKEN = readSecretValue(
  process.env.META_WEBHOOK_VERIFY_TOKEN,
  process.env.META_WEBHOOK_VERIFY_TOKEN_FILE,
);
const META_PAGE_IDS = commaSeparatedValues(process.env.META_PAGE_IDS || process.env.META_PAGE_ID);
const META_AD_ACCOUNT_IDS = commaSeparatedValues(process.env.META_AD_ACCOUNT_IDS || process.env.META_AD_ACCOUNT_ID)
  .map((id) => id.startsWith('act_') ? id : `act_${id}`);
const META_SYNC_INTERVAL_MS = Math.max(5 * 60 * 1000, Number(process.env.META_SYNC_INTERVAL_MS || 15 * 60 * 1000));
const META_RECONCILIATION_DAYS = Math.max(1, Math.min(90, Number(process.env.META_RECONCILIATION_DAYS || 37)));
const META_GRAPH_MAX_PAGES = Math.max(1, Math.min(500, Number(process.env.META_GRAPH_MAX_PAGES || 100)));
const META_ENRICH_MAX_LEADS = Math.max(1, Math.min(500, Number(process.env.META_ENRICH_MAX_LEADS || 200)));
const META_STARTUP_SYNC = String(process.env.META_STARTUP_SYNC ?? '1').trim() !== '0';
const META_LEAD_FORWARD_URL = String(process.env.META_LEAD_FORWARD_URL || '').trim();
const META_LEAD_FORWARD_SECRET = readSecretValue(
  process.env.META_LEAD_FORWARD_SECRET,
  process.env.META_LEAD_FORWARD_SECRET_FILE,
);

const app = express();
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buffer) => {
    if (req.originalUrl.startsWith('/api/webhooks/meta/leadgen')) {
      req.rawBody = Buffer.from(buffer);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const loginAttempts = new Map();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'war_room',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'attica_reporting',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 12),
  namedPlaceholders: true,
  dateStrings: true,
});

const sourceEndpoints = [
  'agents',
  'branches',
  'dispositions',
  'leads',
  'bills',
  'customers',
  'followups',
  'visits',
  'calls',
  'loss-reasons',
];
const dateWindowSyncEndpoints = new Set(['leads', 'bills', 'calls', 'followups', 'visits']);

function todayIst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftIsoDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

let googleAdsAccessTokenCache = null;
let googleOrganicAccessTokenCache = null;
const googleAdsMetricsCache = new Map();
const GOOGLE_ADS_METRICS_CACHE_MS = 60 * 1000;

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseGoogleServiceAccount() {
  if (!GOOGLE_SERVICE_ACCOUNT_PATH) return null;
  try {
    return JSON.parse(fs.readFileSync(GOOGLE_SERVICE_ACCOUNT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function getGoogleAdsAccessToken() {
  const now = Date.now();
  if (googleAdsAccessTokenCache && googleAdsAccessTokenCache.expiresAt > now + 60000) {
    return googleAdsAccessTokenCache.accessToken;
  }
  const credential = parseGoogleServiceAccount();
  if (!credential?.client_email || !credential?.private_key) {
    throw new Error('Google service account is not configured on War Room VM');
  }
  const iat = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: credential.client_email,
    scope: GOOGLE_ADS_SCOPE,
    aud: credential.token_uri || 'https://oauth2.googleapis.com/token',
    exp: iat + 3600,
    iat,
  }));
  const input = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256')
    .update(input)
    .sign(credential.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const response = await fetch(credential.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${input}.${signature}`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google OAuth token failed: HTTP ${response.status}`);
  }
  googleAdsAccessTokenCache = {
    accessToken: payload.access_token,
    expiresAt: now + ((Number(payload.expires_in) || 3600) * 1000),
  };
  return googleAdsAccessTokenCache.accessToken;
}

async function getGoogleOrganicAccessToken() {
  const now = Date.now();
  if (googleOrganicAccessTokenCache && googleOrganicAccessTokenCache.expiresAt > now + 60000) return googleOrganicAccessTokenCache.accessToken;
  const credential = parseGoogleServiceAccount();
  if (!credential?.client_email || !credential?.private_key) throw new Error('Google service account is not configured on War Room VM');
  const iat = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: credential.client_email,
    scope: GOOGLE_ORGANIC_SCOPES,
    aud: credential.token_uri || 'https://oauth2.googleapis.com/token',
    exp: iat + 3600,
    iat,
  }));
  const input = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(credential.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const response = await fetch(credential.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${signature}` }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || `Google OAuth token failed: HTTP ${response.status}`);
  googleOrganicAccessTokenCache = { accessToken: payload.access_token, expiresAt: now + ((Number(payload.expires_in) || 3600) * 1000) };
  return googleOrganicAccessTokenCache.accessToken;
}

async function fetchGoogleAdsSearchStream(query) {
  if (!GOOGLE_ADS_CUSTOMER_ID || !GOOGLE_ADS_DEVELOPER_TOKEN) return [];
  const accessToken = await getGoogleAdsAccessToken();
  const runSearch = async (useManagerHeader) => {
    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
          ...(useManagerHeader && GOOGLE_ADS_MANAGER_CUSTOMER_ID && GOOGLE_ADS_MANAGER_CUSTOMER_ID !== GOOGLE_ADS_CUSTOMER_ID
            ? { 'login-customer-id': GOOGLE_ADS_MANAGER_CUSTOMER_ID }
            : {}),
        },
        body: JSON.stringify({ query }),
      }
    );
    return { response, payload: await response.json().catch(() => null), useManagerHeader };
  };
  let { response, payload, useManagerHeader } = await runSearch(Boolean(GOOGLE_ADS_MANAGER_CUSTOMER_ID && GOOGLE_ADS_MANAGER_CUSTOMER_ID !== GOOGLE_ADS_CUSTOMER_ID));
  const googleAdsError = Array.isArray(payload) ? payload[0]?.error : payload?.error;
  const authError = googleAdsError?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError || '';
  if (!response.ok && useManagerHeader && authError === 'USER_PERMISSION_DENIED') {
    ({ response, payload } = await runSearch(false));
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.[0]?.error?.message || `Google Ads API failed: HTTP ${response.status}`;
    throw new Error(message);
  }
  return Array.isArray(payload) ? payload.flatMap((chunk) => chunk.results || []) : [];
}

async function fetchGoogleAdsMetricsForDateRange(startDate, endDate) {
  if (!GOOGLE_ADS_CUSTOMER_ID || !GOOGLE_ADS_DEVELOPER_TOKEN) return { spend: 0, clicks: 0, impressions: 0, campaignRows: [] };
  const cacheKey = `${startDate}:${endDate}:${GOOGLE_ADS_CUSTOMER_ID}:${GOOGLE_ADS_API_VERSION}`;
  const cached = googleAdsMetricsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const rows = await fetchGoogleAdsSearchStream(`
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY metrics.cost_micros DESC
  `);
  const campaignRows = rows.map((row) => {
    const metrics = row.metrics || {};
    const campaign = row.campaign || {};
    const segments = row.segments || {};
    return {
      date: segments.date || startDate,
      platform: 'Google Ads',
      ad_account: GOOGLE_ADS_CUSTOMER_ID,
      campaign_id: campaign.id || '',
      campaign_name: campaign.name || 'N/A',
      ad_set_or_ad_group: 'N/A',
      ad_or_creative: 'N/A',
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      spend: Number(((Number(metrics.costMicros) || 0) / 1000000).toFixed(2)),
      platform_conversions: Number(metrics.conversions) || 0,
      platform_conversion_value: Number(metrics.conversionsValue) || 0,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
    };
  });
  const value = campaignRows.reduce((total, row) => {
    total.spend += Number(row.spend) || 0;
    total.clicks += Number(row.clicks) || 0;
    total.impressions += Number(row.impressions) || 0;
    total.google_conversions += Number(row.platform_conversions) || 0;
    total.google_conversion_value += Number(row.platform_conversion_value) || 0;
    return total;
  }, { spend: 0, clicks: 0, impressions: 0, google_conversions: 0, google_conversion_value: 0, campaignRows });
  value.spend = Number(value.spend.toFixed(2));
  googleAdsMetricsCache.set(cacheKey, { value, expiresAt: Date.now() + GOOGLE_ADS_METRICS_CACHE_MS });
  return value;
}

async function fetchSearchConsoleRows(startDate, endDate) {
  if (!GOOGLE_SEARCH_CONSOLE_SITE_URL) throw new Error('Search Console site is not configured');
  const accessToken = await getGoogleOrganicAccessToken();
  const rows = [];
  const rowLimit = 25000;
  for (const dimension of ['page', 'query']) {
    for (let startRow = 0; ; startRow += rowLimit) {
      const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GOOGLE_SEARCH_CONSOLE_SITE_URL)}/searchAnalytics/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions: ['date', dimension], rowLimit, startRow, dataState: 'all' }),
        signal: AbortSignal.timeout(60000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Search Console API failed: HTTP ${response.status}`);
      const pageRows = Array.isArray(payload.rows) ? payload.rows : [];
      rows.push(...pageRows.map((row) => ({
        metric_date: String(row.keys?.[0] || '').slice(0, 10),
        query_text: dimension === 'query' ? String(row.keys?.[1] || '').slice(0, 255) : '',
        landing_page: dimension === 'page' ? String(row.keys?.[1] || '') : '',
        country: dimension,
        device: '',
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        average_position: Number(row.position || 0),
      })).filter((row) => row.metric_date));
      if (pageRows.length < rowLimit) break;
    }
  }
  return rows;
}

async function fetchGa4OrganicRows(startDate, endDate) {
  if (!GOOGLE_GA4_PROPERTY_ID) throw new Error('GA4 property is not configured');
  const accessToken = await getGoogleOrganicAccessToken();
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${GOOGLE_GA4_PROPERTY_ID}:runReport`;
  const rows = [];
  const limit = 100000;
  for (let offset = 0; ; offset += limit) {
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }, { name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'landingPagePlusQueryString' }],
      metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
      dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search', caseSensitive: false } } },
      limit: String(limit),
      offset: String(offset),
      keepEmptyRows: false,
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `GA4 Data API failed: HTTP ${response.status}`);
    const pageRows = Array.isArray(payload.rows) ? payload.rows : [];
    rows.push(...pageRows.map((row) => {
      const dimensions = row.dimensionValues || [];
      const metrics = row.metricValues || [];
      const rawDate = String(dimensions[0]?.value || '');
      return {
        metric_date: /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate.slice(0, 10),
        source: String(dimensions[1]?.value || '').slice(0, 80),
        medium: String(dimensions[2]?.value || '').slice(0, 120),
        campaign: String(dimensions[3]?.value || '').slice(0, 255),
        landing_page: String(dimensions[4]?.value || ''),
        sessions: Number(metrics[0]?.value || 0),
        form_leads: Number(metrics[1]?.value || 0),
      };
    }).filter((row) => row.metric_date));
    if (pageRows.length < limit || offset + limit >= Number(payload.rowCount || 0)) break;
  }
  return rows;
}

async function replaceOrganicMetricRows(table, columns, startDate, endDate, rows) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`DELETE FROM ${table} WHERE metric_date BETWEEN ? AND ?`, [startDate, endDate]);
    for (let index = 0; index < rows.length; index += 500) {
      const chunk = rows.slice(index, index + 500);
      const placeholders = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      const values = chunk.flatMap((row) => columns.map((column) => row[column] ?? null));
      await connection.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`, values);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

let organicSyncPromise = null;
async function runOrganicSync(options = {}) {
  if (organicSyncPromise) return organicSyncPromise;
  organicSyncPromise = (async () => {
    const startDate = String(options.startDate || dateDaysAgo(GOOGLE_ORGANIC_RECONCILIATION_DAYS - 1)).slice(0, 10);
    const endDate = String(options.endDate || todayIst()).slice(0, 10);
    const result = { startDate, endDate };
    if (GOOGLE_SEARCH_CONSOLE_SITE_URL) {
      try {
        const rows = await fetchSearchConsoleRows(startDate, endDate);
        await replaceOrganicMetricRows('fact_seo_metrics', ['metric_date','query_text','landing_page','country','device','clicks','impressions','ctr','average_position'], startDate, endDate, rows);
        await saveWatermark('google_search_console', null, mysqlNowIst(), 'ok', null);
        result.searchConsole = { status: 'healthy', records: rows.length };
      } catch (error) {
        await saveWatermark('google_search_console', null, null, 'error', String(error?.message || error).slice(0, 1000));
        result.searchConsole = { status: 'attention', error: error?.message || String(error) };
      }
    } else result.searchConsole = { status: 'pending', error: 'Search Console site is not configured' };
    if (GOOGLE_GA4_PROPERTY_ID) {
      try {
        const rows = await fetchGa4OrganicRows(startDate, endDate);
        await replaceOrganicMetricRows('fact_website_analytics', ['metric_date','source','medium','campaign','landing_page','sessions','form_leads'], startDate, endDate, rows);
        await saveWatermark('google_analytics_organic', null, mysqlNowIst(), 'ok', null);
        result.analytics = { status: 'healthy', records: rows.length };
      } catch (error) {
        await saveWatermark('google_analytics_organic', null, null, 'error', String(error?.message || error).slice(0, 1000));
        result.analytics = { status: 'attention', error: error?.message || String(error) };
      }
    } else result.analytics = { status: 'pending', error: 'GA4 property is not configured' };
    return result;
  })().finally(() => { organicSyncPromise = null; });
  return organicSyncPromise;
}

function metaGraphError(payload, status) {
  const error = payload?.error || {};
  const details = [error.message, error.code ? `code ${error.code}` : '', error.error_subcode ? `subcode ${error.error_subcode}` : '']
    .filter(Boolean)
    .join(' | ');
  return new Error(details || `Meta Graph API failed: HTTP ${status}`);
}

function metaAppSecretProof(token) {
  return META_APP_SECRET && token
    ? crypto.createHmac('sha256', META_APP_SECRET).update(token).digest('hex')
    : '';
}

async function metaGraphPage(pathOrUrl, params = {}, token = META_ACCESS_TOKEN) {
  if (!token) throw new Error('Meta access token is not configured');
  const url = /^https:\/\//i.test(pathOrUrl)
    ? new URL(pathOrUrl)
    : new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${String(pathOrUrl).replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', token);
  const proof = metaAppSecretProof(token);
  if (proof && !url.searchParams.has('appsecret_proof')) url.searchParams.set('appsecret_proof', proof);
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw metaGraphError(payload, response.status);
  return payload;
}

async function metaGraphAll(path, params = {}, token = META_ACCESS_TOKEN) {
  const rows = [];
  let payload = await metaGraphPage(path, { limit: 100, ...params }, token);
  let pages = 0;
  while (payload && pages < META_GRAPH_MAX_PAGES) {
    rows.push(...(Array.isArray(payload.data) ? payload.data : []));
    pages += 1;
    const next = payload?.paging?.next;
    if (!next) break;
    payload = await metaGraphPage(next, {}, token);
  }
  if (payload?.paging?.next && pages >= META_GRAPH_MAX_PAGES) {
    throw new Error(`Meta pagination exceeded the configured ${META_GRAPH_MAX_PAGES}-page safety limit`);
  }
  return rows;
}

function mysqlDateTimeInIst(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function metaFieldValues(fieldData = []) {
  const values = new Map();
  for (const field of Array.isArray(fieldData) ? fieldData : []) {
    const key = String(field?.name || '').trim().toLowerCase();
    const value = Array.isArray(field?.values) ? field.values.map((item) => String(item || '').trim()).filter(Boolean).join(', ') : '';
    if (key && value) values.set(key, value);
  }
  return values;
}

function firstMetaField(fields, names) {
  for (const name of names) {
    const value = fields.get(name);
    if (value) return value;
  }
  return '';
}

async function saveMetaSyncState(syncType, status, details = {}) {
  const successful = status === 'healthy';
  await pool.query(
    `INSERT INTO meta_sync_state
      (sync_type, last_success_at, last_cursor, last_error, last_error_at, records_received, status, token_expires_at, updated_at)
     VALUES (?, ${successful ? 'NOW()' : 'NULL'}, ?, ?, ${successful ? 'NULL' : 'NOW()'}, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       last_success_at=IF(VALUES(status)='healthy', NOW(), last_success_at),
       last_cursor=VALUES(last_cursor),
       last_error=VALUES(last_error),
       last_error_at=IF(VALUES(status)='healthy', NULL, NOW()),
       records_received=VALUES(records_received),
       status=VALUES(status),
       token_expires_at=COALESCE(VALUES(token_expires_at), token_expires_at),
       updated_at=NOW()`,
    [
      syncType,
      details.cursor || null,
      successful ? null : String(details.error || 'Meta connector requires attention').slice(0, 1000),
      Number(details.records || 0),
      status,
      details.tokenExpiresAt || null,
    ],
  );
}

async function inspectMetaToken() {
  const payload = await metaGraphPage('/debug_token', { input_token: META_ACCESS_TOKEN });
  const data = payload?.data || {};
  const expiresAt = Number(data.expires_at || 0);
  const tokenExpiresAt = expiresAt ? mysqlDateTimeInIst(new Date(expiresAt * 1000)) : null;
  if (!data.is_valid) throw new Error('Meta access token is invalid');
  const expiresSoon = expiresAt && (expiresAt * 1000) <= Date.now() + (3 * 86400000);
  await saveMetaSyncState('meta_token', expiresSoon ? 'attention' : 'healthy', {
    records: 1,
    tokenExpiresAt,
    error: expiresSoon ? `Meta access token expires at ${tokenExpiresAt}` : null,
  });
  return {
    appId: String(data.app_id || META_APP_ID || ''),
    expiresAt: tokenExpiresAt,
    dataAccessExpiresAt: Number(data.data_access_expires_at || 0)
      ? mysqlDateTimeInIst(new Date(Number(data.data_access_expires_at) * 1000))
      : null,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    warning: expiresSoon ? `Meta access token expires at ${tokenExpiresAt}` : '',
  };
}

async function discoverMetaPages() {
  if (META_PAGE_IDS.length) {
    const pages = [];
    for (const pageId of META_PAGE_IDS) {
      const page = await metaGraphPage(`/${pageId}`, { fields: 'id,name' });
      pages.push({ id: String(page.id || pageId), name: String(page.name || pageId) });
    }
    return pages;
  }
  return (await metaGraphAll('/me/accounts', { fields: 'id,name' }))
    .map((page) => ({ id: String(page.id || ''), name: String(page.name || page.id || '') }))
    .filter((page) => page.id);
}

async function upsertMetaLead(lead, context = {}) {
  const fields = metaFieldValues(lead?.field_data);
  const rawPhone = firstMetaField(fields, ['phone_number', 'phone', 'mobile_number', 'mobile']);
  const customerName = firstMetaField(fields, ['full_name', 'name', 'first_name']);
  const email = firstMetaField(fields, ['email']);
  const city = firstMetaField(fields, ['city']);
  const state = firstMetaField(fields, ['state', 'select_your_state']);
  const metaLeadId = String(lead?.id || '').trim();
  if (!metaLeadId) return false;
  const createdTime = mysqlDateTimeInIst(lead.created_time) || mysqlNowIst();
  const phone = normalizePhone(rawPhone);
  const platform = String(lead.platform || '').trim() || (lead.is_organic ? 'facebook' : 'Meta');
  const values = {
    pageId: String(lead.page_id || context.pageId || ''),
    formId: String(lead.form_id || context.formId || ''),
    formName: String(lead.form_name || context.formName || ''),
    campaignId: String(lead.campaign_id || ''),
    campaignName: String(lead.campaign_name || ''),
    adsetId: String(lead.adset_id || ''),
    adsetName: String(lead.adset_name || ''),
    adId: String(lead.ad_id || ''),
    adName: String(lead.ad_name || ''),
  };
  await pool.query(
    `INSERT INTO meta_leads
      (meta_lead_id, page_id, form_id, form_name, customer_name, phone_raw, phone_normalized, email, city, state,
       created_time, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, platform, is_organic,
       raw_field_data_json, synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       page_id=COALESCE(NULLIF(VALUES(page_id),''),page_id),
       form_id=COALESCE(NULLIF(VALUES(form_id),''),form_id),
       form_name=COALESCE(NULLIF(VALUES(form_name),''),form_name),
       customer_name=COALESCE(NULLIF(VALUES(customer_name),''),customer_name),
       phone_raw=COALESCE(NULLIF(VALUES(phone_raw),''),phone_raw),
       phone_normalized=COALESCE(NULLIF(VALUES(phone_normalized),''),phone_normalized),
       email=COALESCE(NULLIF(VALUES(email),''),email),
       city=COALESCE(NULLIF(VALUES(city),''),city),
       state=COALESCE(NULLIF(VALUES(state),''),state),
       created_time=COALESCE(VALUES(created_time),created_time),
       campaign_id=COALESCE(NULLIF(VALUES(campaign_id),''),campaign_id),
       campaign_name=COALESCE(NULLIF(VALUES(campaign_name),''),campaign_name),
       adset_id=COALESCE(NULLIF(VALUES(adset_id),''),adset_id),
       adset_name=COALESCE(NULLIF(VALUES(adset_name),''),adset_name),
       ad_id=COALESCE(NULLIF(VALUES(ad_id),''),ad_id),
       ad_name=COALESCE(NULLIF(VALUES(ad_name),''),ad_name),
       platform=COALESCE(NULLIF(VALUES(platform),''),platform),
       is_organic=VALUES(is_organic),
       raw_field_data_json=VALUES(raw_field_data_json),
       synced_at=NOW(), updated_at=NOW()`,
    [
      metaLeadId, values.pageId, values.formId, values.formName, customerName, rawPhone, phone, email, city, state,
      createdTime, values.campaignId, values.campaignName, values.adsetId, values.adsetName, values.adId, values.adName,
      platform, lead.is_organic ? 1 : 0, JSON.stringify(lead.field_data || []),
    ],
  );
  await pool.query(
    `INSERT INTO fact_leads
      (lead_id, customer_name, normalized_phone, lead_created_at, lead_updated_at, source, platform, medium,
       campaign_id, campaign_name, adset_or_adgroup_id, adset_or_adgroup_name, ad_id, ad_name, form_id, current_stage)
     VALUES (?, ?, ?, ?, NOW(), 'Meta Ads', ?, 'Lead Ads', ?, ?, ?, ?, ?, ?, ?, 'New')
     ON DUPLICATE KEY UPDATE
       customer_name=COALESCE(NULLIF(VALUES(customer_name),''),customer_name),
       normalized_phone=COALESCE(NULLIF(VALUES(normalized_phone),''),normalized_phone),
       lead_created_at=COALESCE(VALUES(lead_created_at),lead_created_at),
       lead_updated_at=NOW(), source='Meta Ads',
       platform=COALESCE(NULLIF(VALUES(platform),''),platform),
       campaign_id=COALESCE(NULLIF(VALUES(campaign_id),''),campaign_id),
       campaign_name=COALESCE(NULLIF(VALUES(campaign_name),''),campaign_name),
       adset_or_adgroup_id=COALESCE(NULLIF(VALUES(adset_or_adgroup_id),''),adset_or_adgroup_id),
       adset_or_adgroup_name=COALESCE(NULLIF(VALUES(adset_or_adgroup_name),''),adset_or_adgroup_name),
       ad_id=COALESCE(NULLIF(VALUES(ad_id),''),ad_id),
       ad_name=COALESCE(NULLIF(VALUES(ad_name),''),ad_name),
       form_id=COALESCE(NULLIF(VALUES(form_id),''),form_id)`,
    [
      metaLeadId, customerName, phone, createdTime, platform, values.campaignId, values.campaignName,
      values.adsetId, values.adsetName, values.adId, values.adName, values.formId,
    ],
  );
  return true;
}

async function forwardMetaLeadToCallCenter(lead, context = {}) {
  if (!META_LEAD_FORWARD_URL || !META_LEAD_FORWARD_SECRET) return { skipped: true };
  const fields = metaFieldValues(lead?.field_data);
  const phoneRaw = firstMetaField(fields, ['phone_number', 'phone', 'mobile_number', 'mobile']);
  const response = await fetch(META_LEAD_FORWARD_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-attica-meta-secret': META_LEAD_FORWARD_SECRET,
    },
    body: JSON.stringify({
      metaLeadId: String(lead?.id || ''),
      customerName: firstMetaField(fields, ['full_name', 'name', 'first_name']),
      phoneRaw,
      phoneNormalized: normalizePhone(phoneRaw),
      email: firstMetaField(fields, ['email']),
      city: firstMetaField(fields, ['city']),
      state: firstMetaField(fields, ['state', 'select_your_state']),
      grams: firstMetaField(fields, ['approximately_how_much_gold_do_you_have', 'gold_amount', 'grams']),
      createdTime: lead?.created_time || '',
      pageId: String(lead?.page_id || context.pageId || ''),
      formId: String(lead?.form_id || context.formId || ''),
      formName: String(lead?.form_name || context.formName || ''),
      campaignId: String(lead?.campaign_id || ''),
      campaignName: String(lead?.campaign_name || ''),
      adsetId: String(lead?.adset_id || ''),
      adsetName: String(lead?.adset_name || ''),
      adId: String(lead?.ad_id || ''),
      adName: String(lead?.ad_name || ''),
      platform: String(lead?.platform || ''),
      isOrganic: Boolean(lead?.is_organic),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    let message = responseText;
    try { message = JSON.parse(responseText)?.error || responseText; } catch (_error) {}
    throw new Error(`Call-center Meta lead handoff failed (${response.status}): ${String(message).slice(0, 300)}`);
  }
  return { forwarded: true };
}

async function bootstrapMetaLeadsFromReportingFacts() {
  const metaSourceSql = canonicalSourceSql('l');
  const [result] = await pool.query(
    `INSERT INTO meta_leads
      (meta_lead_id, form_id, customer_name, phone_normalized, created_time, campaign_id, campaign_name,
       adset_id, adset_name, ad_id, ad_name, platform, is_organic, synced_at, updated_at)
     SELECT l.lead_id, l.form_id, l.customer_name, l.normalized_phone, l.lead_created_at, l.campaign_id, l.campaign_name,
       l.adset_or_adgroup_id, l.adset_or_adgroup_name, l.ad_id, l.ad_name, l.platform, 0, NOW(), NOW()
     FROM fact_leads l
     WHERE ${metaSourceSql}='META'
     ON DUPLICATE KEY UPDATE
       form_id=COALESCE(NULLIF(VALUES(form_id),''),meta_leads.form_id),
       customer_name=COALESCE(NULLIF(VALUES(customer_name),''),meta_leads.customer_name),
       phone_normalized=COALESCE(NULLIF(VALUES(phone_normalized),''),meta_leads.phone_normalized),
       created_time=COALESCE(VALUES(created_time),meta_leads.created_time),
       campaign_id=COALESCE(NULLIF(VALUES(campaign_id),''),meta_leads.campaign_id),
       campaign_name=COALESCE(NULLIF(VALUES(campaign_name),''),meta_leads.campaign_name),
       adset_id=COALESCE(NULLIF(VALUES(adset_id),''),meta_leads.adset_id),
       adset_name=COALESCE(NULLIF(VALUES(adset_name),''),meta_leads.adset_name),
       ad_id=COALESCE(NULLIF(VALUES(ad_id),''),meta_leads.ad_id),
       ad_name=COALESCE(NULLIF(VALUES(ad_name),''),meta_leads.ad_name),
       platform=COALESCE(NULLIF(VALUES(platform),''),meta_leads.platform),
       updated_at=NOW()`,
  );
  return Number(result.affectedRows || 0);
}

async function syncMetaLeadAds() {
  const pages = await discoverMetaPages();
  if (!pages.length) throw new Error('No Facebook Pages are accessible to the configured Meta token');
  const sinceEpoch = Math.floor((Date.now() - META_RECONCILIATION_DAYS * 86400000) / 1000);
  let received = 0;
  for (const page of pages) {
    const forms = await metaGraphAll(`/${page.id}/leadgen_forms`, { fields: 'id,name,status' });
    for (const form of forms) {
      await pool.query(
        `INSERT INTO meta_forms (form_id, form_name, status, page_id, page_name, synced_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE form_name=VALUES(form_name), status=VALUES(status), page_id=VALUES(page_id),
           page_name=VALUES(page_name), synced_at=NOW(), updated_at=NOW()`,
        [String(form.id || ''), String(form.name || ''), String(form.status || ''), page.id, page.name],
      );
      const fields = 'id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic';
      let leads;
      try {
        leads = await metaGraphAll(`/${form.id}/leads`, {
          fields,
          filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: sinceEpoch }]),
        });
      } catch (error) {
        if (!String(error.message || '').includes('filter')) throw error;
        leads = await metaGraphAll(`/${form.id}/leads`, { fields });
      }
      for (const lead of leads) {
        if (await upsertMetaLead(lead, { pageId: page.id, formId: form.id, formName: form.name })) received += 1;
      }
    }
  }
  await saveMetaSyncState('meta_leads', 'healthy', { records: received });
  return { pages: pages.length, records: received };
}

async function enrichExistingMetaLeadMarketingFields() {
  const [candidates] = await pool.query(
    `SELECT meta_lead_id
     FROM meta_leads
     WHERE meta_lead_id IS NOT NULL AND meta_lead_id <> ''
       AND (
         COALESCE(campaign_id,'')='' OR COALESCE(campaign_name,'')=''
         OR COALESCE(adset_id,'')='' OR COALESCE(adset_name,'')=''
         OR COALESCE(ad_id,'')='' OR COALESCE(ad_name,'')=''
         OR COALESCE(form_id,'')=''
       )
     ORDER BY created_time DESC, meta_lead_id DESC
     LIMIT ?`,
    [META_ENRICH_MAX_LEADS],
  );
  let enriched = 0;
  const failures = [];
  for (const candidate of candidates) {
    try {
      const lead = await metaGraphPage(`/${candidate.meta_lead_id}`, {
        fields: 'id,form_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name',
      });
      const formId = String(lead.form_id || '');
      let formName = '';
      if (formId) {
        const [[form]] = await pool.query('SELECT form_name FROM meta_forms WHERE form_id=? LIMIT 1', [formId]);
        formName = String(form?.form_name || '');
        if (!formName) {
          try {
            const remoteForm = await metaGraphPage(`/${formId}`, { fields: 'id,name' });
            formName = String(remoteForm?.name || '');
          } catch (_error) {}
        }
      }
      const values = [
        String(lead.campaign_id || ''), String(lead.campaign_name || ''),
        String(lead.adset_id || ''), String(lead.adset_name || ''),
        String(lead.ad_id || ''), String(lead.ad_name || ''), formId, formName,
        candidate.meta_lead_id,
      ];
      await pool.query(
        `UPDATE meta_leads SET
           campaign_id=COALESCE(NULLIF(?,''),campaign_id), campaign_name=COALESCE(NULLIF(?,''),campaign_name),
           adset_id=COALESCE(NULLIF(?,''),adset_id), adset_name=COALESCE(NULLIF(?,''),adset_name),
           ad_id=COALESCE(NULLIF(?,''),ad_id), ad_name=COALESCE(NULLIF(?,''),ad_name),
           form_id=COALESCE(NULLIF(?,''),form_id), form_name=COALESCE(NULLIF(?,''),form_name),
           synced_at=NOW(), updated_at=NOW()
         WHERE meta_lead_id=?`,
        values,
      );
      await pool.query(
        `UPDATE fact_leads SET
           campaign_id=COALESCE(NULLIF(?,''),campaign_id), campaign_name=COALESCE(NULLIF(?,''),campaign_name),
           adset_or_adgroup_id=COALESCE(NULLIF(?,''),adset_or_adgroup_id),
           adset_or_adgroup_name=COALESCE(NULLIF(?,''),adset_or_adgroup_name),
           ad_id=COALESCE(NULLIF(?,''),ad_id), ad_name=COALESCE(NULLIF(?,''),ad_name),
           form_id=COALESCE(NULLIF(?,''),form_id), lead_updated_at=NOW()
         WHERE lead_id=? AND ${canonicalSourceSql('fact_leads')}='META'`,
        [values[0], values[1], values[2], values[3], values[4], values[5], values[6], candidate.meta_lead_id],
      );
      enriched += 1;
    } catch (error) {
      failures.push(String(error?.message || error));
      if (/code 190|access token|session has expired|invalid oauth/i.test(String(error?.message || error))) throw error;
    }
  }
  return { attempted: candidates.length, enriched, failures: failures.length };
}

function dateDaysAgo(days) {
  const date = new Date(Date.now() - days * 86400000);
  return mysqlDateTimeInIst(date).slice(0, 10);
}

async function discoverMetaAdAccounts() {
  if (META_AD_ACCOUNT_IDS.length) return META_AD_ACCOUNT_IDS.map((id) => ({ id }));
  return (await metaGraphAll('/me/adaccounts', { fields: 'id,name,account_status,currency,timezone_name' }))
    .filter((account) => Number(account.account_status || 0) === 1 && account.id);
}

function metaActionCount(actions = []) {
  const leadActions = new Set(['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']);
  return (Array.isArray(actions) ? actions : []).reduce(
    (sum, action) => sum + (leadActions.has(String(action?.action_type || '')) ? Number(action?.value || 0) : 0),
    0,
  );
}

async function syncMetaInsights(options = {}) {
  const startDate = String(options.startDate || dateDaysAgo(META_RECONCILIATION_DAYS - 1)).slice(0, 10);
  const endDate = String(options.endDate || todayIst()).slice(0, 10);
  const requestedAccountIds = commaSeparatedValues(options.accountIds || options.accountId)
    .map((id) => id.startsWith('act_') ? id : `act_${id}`);
  const accounts = requestedAccountIds.length
    ? requestedAccountIds.map((id) => ({ id }))
    : await discoverMetaAdAccounts();
  if (!accounts.length) throw new Error('No active Meta ad accounts are accessible to the configured token');
  let received = 0;
  let successfulAccounts = 0;
  const failures = [];
  for (const account of accounts) {
    try {
      const accountDetails = account.name ? account : await metaGraphPage(`/${account.id}`, {
        fields: 'id,name,account_status,currency,timezone_name',
      });
      const rows = await metaGraphAll(`/${account.id}/insights`, {
        limit: 500,
        level: 'ad',
        fields: 'date_start,date_stop,account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,reach,clicks,spend,cpc,cpm,ctr,frequency,actions,action_values',
        time_increment: 1,
        time_range: JSON.stringify({ since: startDate, until: endDate }),
      });
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(
          'DELETE FROM meta_ad_insights_daily WHERE account_id=? AND metric_date BETWEEN ? AND ?',
          [String(account.id).replace(/^act_/, ''), startDate, endDate],
        );
        for (const row of rows) {
          await connection.query(
            `INSERT INTO meta_ad_insights_daily
              (metric_date, account_id, account_name, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
               impressions, reach, clicks, spend, cpc, cpm, ctr, frequency, actions_json, action_values_json, currency, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               account_name=VALUES(account_name), campaign_name=VALUES(campaign_name), adset_name=VALUES(adset_name),
               ad_name=VALUES(ad_name), impressions=VALUES(impressions), reach=VALUES(reach), clicks=VALUES(clicks),
               spend=VALUES(spend), cpc=VALUES(cpc), cpm=VALUES(cpm), ctr=VALUES(ctr), frequency=VALUES(frequency),
               actions_json=VALUES(actions_json), action_values_json=VALUES(action_values_json), currency=VALUES(currency), synced_at=NOW()`,
            [
              row.date_start, String(row.account_id || account.id).replace(/^act_/, ''), row.account_name || accountDetails.name || '',
              row.campaign_id || '', row.campaign_name || '', row.adset_id || '', row.adset_name || '', row.ad_id || '', row.ad_name || '',
              Number(row.impressions || 0), Number(row.reach || 0), Number(row.clicks || 0), Number(row.spend || 0),
              Number(row.cpc || 0), Number(row.cpm || 0), Number(row.ctr || 0), Number(row.frequency || 0),
              JSON.stringify(row.actions || []), JSON.stringify(row.action_values || []), accountDetails.currency || 'INR',
            ],
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      received += rows.length;
      successfulAccounts += 1;
    } catch (error) {
      failures.push({ accountId: account.id, error: String(error?.message || error).slice(0, 500) });
    }
  }
  const status = failures.length ? 'attention' : 'healthy';
  const error = failures.map((failure) => `${failure.accountId}: ${failure.error}`).join('; ');
  await saveMetaSyncState('meta_insights', status, { records: received, error });
  return { status, accounts: accounts.length, successfulAccounts, records: received, startDate, endDate, failures };
}

let metaSyncPromise = null;
async function runMetaSync(options = {}) {
  if (metaSyncPromise) return metaSyncPromise;
  metaSyncPromise = (async () => {
    await bootstrapMetaLeadsFromReportingFacts();
    if (!META_ACCESS_TOKEN) {
      const error = 'Meta access token is not configured';
      await saveMetaSyncState('meta_token', 'attention', { error });
      await saveMetaSyncState('meta_leads', 'attention', { error });
      await saveMetaSyncState('meta_insights', 'attention', { error });
      return { token: { status: 'attention', error } };
    }
    const result = {};
    try {
      const tokenDetails = await inspectMetaToken();
      result.token = { status: tokenDetails.warning ? 'attention' : 'healthy', ...tokenDetails };
    } catch (error) {
      await saveMetaSyncState('meta_token', 'attention', { error: error.message });
      await saveMetaSyncState('meta_leads', 'attention', { error: error.message });
      await saveMetaSyncState('meta_insights', 'attention', { error: error.message });
      return { token: { status: 'attention', error: error.message } };
    }
    try {
      result.leads = { status: 'healthy', ...(await syncMetaLeadAds()) };
    } catch (error) {
      await saveMetaSyncState('meta_leads', 'attention', { error: error.message });
      result.leads = { status: 'attention', error: error.message };
    }
    try {
      result.leads.enrichment = await enrichExistingMetaLeadMarketingFields();
    } catch (error) {
      const reconciliationError = result.leads.error ? `${result.leads.error}; ` : '';
      const combinedError = `${reconciliationError}Metadata enrichment: ${error.message}`;
      await saveMetaSyncState('meta_leads', 'attention', { error: combinedError });
      result.leads = { ...result.leads, status: 'attention', error: combinedError };
    }
    try {
      result.insights = { status: 'healthy', ...(await syncMetaInsights(options)) };
    } catch (error) {
      await saveMetaSyncState('meta_insights', 'attention', { error: error.message });
      result.insights = { status: 'attention', error: error.message };
    }
    return result;
  })().finally(() => {
    metaSyncPromise = null;
  });
  return metaSyncPromise;
}

function mysqlNowIst() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.slice(-10) : '';
}

function toNumber(value) {
  const numeric = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function dateParams(req) {
  const startDate = String(req.query.start_date || req.query.startDate || todayIst()).slice(0, 10);
  const endDate = String(req.query.end_date || req.query.endDate || startDate).slice(0, 10);
  return { startDate, endDate };
}

function pageParams(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const requestedLimit = Number(req.query.limit || 50);
  const limit = [25, 50, 100].includes(requestedLimit) && requestedLimit <= PAGE_LIMIT_MAX ? requestedLimit : 50;
  return { page, limit, offset: (page - 1) * limit };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const canonicalSources = [
  ['GOOGLE_LP', 'Google LP'],
  ['GOOGLE_ADS', 'Google Ads'],
  ['META', 'Meta Ads'],
  ['WEBSITE_DIRECT', 'Website Direct'],
  ['BLOG', 'Blog'],
  ['JUSTDIAL', 'Justdial'],
  ['ORGANIC', 'Organic'],
  ['WHATSAPP', 'WhatsApp'],
  ['UNKNOWN', 'Unknown'],
];

const sourceLabelByCanonical = Object.fromEntries(canonicalSources);

function normalizeLeadSource(value = '') {
  const source = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (['google lp leads', 'google lp', 'google landing page'].includes(source)) return 'GOOGLE_LP';
  if (['google ads', 'google cpc'].includes(source)) return 'GOOGLE_ADS';
  if (['meta', 'meta ads', 'facebook', 'facebook ads'].includes(source)) return 'META';
  if (['blog', 'blogs'].includes(source)) return 'BLOG';
  if (['justdial', 'just dial', 'justdial lead'].includes(source)) return 'JUSTDIAL';
  if (source === 'seo') return 'ORGANIC';
  if (['organic', 'google organic'].includes(source)) return 'ORGANIC';
  if (['whatsapp', 'wati', 'whatsapp ads'].includes(source)) return 'WHATSAPP';
  if (['website', 'website direct', 'web', 'website lead', 'form', 'home page', 'service page', 'branch', 'contact us', 'sell gold page', 'release pledged gold page', 'landing page', 'online gold rate', 'about us'].includes(source)) return 'WEBSITE_DIRECT';
  return 'UNKNOWN';
}

function sourceLabel(source) {
  return sourceLabelByCanonical[normalizeLeadSource(source)] || sourceLabelByCanonical.UNKNOWN;
}

function canonicalSourceSql(alias = 'l') {
  const expr = `LOWER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(${alias}.source,''), '_', ' '), '-', ' '), '  ', ' ')))`;
  return `CASE
    WHEN ${expr} IN ('google lp leads','google lp','google landing page') THEN 'GOOGLE_LP'
    WHEN ${expr} IN ('google ads','google cpc') THEN 'GOOGLE_ADS'
    WHEN ${expr} IN ('meta','meta ads','facebook','facebook ads') THEN 'META'
    WHEN ${expr} IN ('blog','blogs') THEN 'BLOG'
    WHEN ${expr} IN ('justdial','just dial','justdial lead') THEN 'JUSTDIAL'
    WHEN ${expr} = 'seo' THEN 'ORGANIC'
    WHEN ${expr} IN ('organic','google organic') THEN 'ORGANIC'
    WHEN ${expr} IN ('whatsapp','wati','whatsapp ads') THEN 'WHATSAPP'
    WHEN ${expr} IN ('website','website direct','web','website lead','form','home page','service page','branch','contact us','sell gold page','release pledged gold page','landing page','online gold rate','about us') THEN 'WEBSITE_DIRECT'
    ELSE 'UNKNOWN'
  END`;
}

function normalizedDashboardSourceFilter(value = '') {
  const raw = String(value || '').trim();
  if (!raw || raw.toUpperCase() === 'ALL') return '';
  return normalizeLeadSource(raw);
}

function validFactBillCondition(alias = 'b') {
  return `(
    COALESCE(NULLIF(${alias}.invoice_number, ''), '') <> ''
    OR NOT EXISTS (
      SELECT 1
      FROM fact_bills bx
      WHERE bx.normalized_phone = ${alias}.normalized_phone
        AND bx.bill_date = ${alias}.bill_date
        AND ABS(COALESCE(bx.gold_weight, 0) - COALESCE(${alias}.gold_weight, 0)) < 0.05
        AND COALESCE(NULLIF(bx.invoice_number, ''), '') <> ''
    )
  )`;
}

function dedupedFactBillsSql(alias = 'b') {
  return `(
    SELECT *
    FROM (
      SELECT
        fb.*,
        ROW_NUMBER() OVER (
          PARTITION BY fb.normalized_phone, fb.bill_date, ROUND(COALESCE(fb.gold_weight, 0), 2)
          ORDER BY
            CASE WHEN COALESCE(NULLIF(fb.invoice_number, ''), '') <> '' THEN 0 ELSE 1 END ASC,
            COALESCE(fb.transaction_value, 0) ASC,
            fb.bill_id ASC
        ) AS bill_dedupe_rank
      FROM fact_bills fb
      WHERE ${validFactBillCondition('fb')}
    ) deduped_fact_bills
    WHERE bill_dedupe_rank = 1
  ) ${alias}`;
}

function decorateSourceRows(rows = []) {
  return rows.map((row) => {
    const canonical = normalizedDashboardSourceFilter(row.canonical_source || row.source);
    return {
      ...row,
      canonical_source: canonical || 'UNKNOWN',
      source: sourceLabel(canonical || row.source),
    };
  });
}

function qualifiedCategoryCondition(columnSql) {
  const value = `LOWER(TRIM(COALESCE(${columnSql}, '')))`;
  return `(
    ${value} = 'ql'
    OR ${value} LIKE '%planning to visit%'
    OR ${value} LIKE '%tentative visit%'
    OR ${value} LIKE '%coming to branch%'
    OR ${value} LIKE '%coming to office%'
    OR ${value} LIKE '%nearest branch%'
    OR ${value} LIKE '%branch timing%'
    OR (${value} LIKE '%interested%' AND ${value} NOT LIKE '%not interested%')
    OR ${value} LIKE '%margin reduce%'
    OR ${value} LIKE '%increase quotation%'
    OR ${value} LIKE '%speed up validation%'
    OR ${value} LIKE '%door-step%'
    OR ${value} LIKE '%door step%'
  )`;
}

function lostCategoryCondition(columnSql) {
  const value = `LOWER(TRIM(COALESCE(${columnSql}, '')))`;
  return `(
    ${value} = 'lost'
    OR ${value} LIKE '%l2 lost%'
    OR ${value} LIKE '%abuse%'
    OR ${value} LIKE '%not interested%'
    OR ${value} LIKE '%wrong call%'
    OR ${value} LIKE '%wrong number%'
    OR ${value} LIKE '%job related%'
    OR ${value} LIKE '%advertisement%'
    OR ${value} LIKE '%general enquiry - other%'
    OR ${value} LIKE '%disconnected - language barrier%'
    OR ${value} LIKE '%spam%'
    OR ${value} LIKE '%not feasible%'
    OR ${value} LIKE '%can''t send executive%'
    OR ${value} LIKE '%cant send executive%'
    OR ${value} LIKE '%quotation mismatch%'
    OR ${value} LIKE '%bm behaviour%'
    OR ${value} LIKE '%branch closed%'
    OR ${value} LIKE '%without purity%'
    OR ${value} LIKE '%service delay%'
    OR ${value} LIKE '%staff behaviour%'
    OR ${value} LIKE '%not serviceable%'
    OR ${value} LIKE '%sold outside%'
    OR ${value} LIKE '%advertisement%'
  )`;
}

function leadLatestAgentSql(leadAlias = 'l') {
  const callAgent = "COALESCE(NULLIF(NULLIF(TRIM(c.agent_name),''),'N/A'),NULLIF(NULLIF(TRIM(a2.agent_name),''),'N/A'),NULLIF(NULLIF(TRIM(c.agent_id),''),'N/A'))";
  return `COALESCE(
    (SELECT ${callAgent}
     FROM fact_calls c LEFT JOIN dim_agents a2 ON a2.agent_id=c.agent_id
     WHERE c.normalized_phone=${leadAlias}.normalized_phone AND c.started_at>=${leadAlias}.lead_created_at
       AND c.talk_duration_seconds>0 AND ${callAgent} IS NOT NULL
     ORDER BY c.started_at DESC,c.call_uuid DESC LIMIT 1),
    (SELECT ${callAgent}
     FROM fact_calls c LEFT JOIN dim_agents a2 ON a2.agent_id=c.agent_id
     WHERE c.normalized_phone=${leadAlias}.normalized_phone AND c.started_at>=${leadAlias}.lead_created_at
       AND ${callAgent} IS NOT NULL
     ORDER BY c.started_at DESC,c.call_uuid DESC LIMIT 1),
    (SELECT NULLIF(NULLIF(TRIM(a3.agent_name),''),'N/A') FROM dim_agents a3 WHERE a3.agent_id=${leadAlias}.assigned_agent_id LIMIT 1),
    NULLIF(NULLIF(TRIM(${leadAlias}.assigned_agent_id),''),'N/A'),'N/A')`;
}

function leadLatestDispositionSql(leadAlias = 'l') {
  return `(SELECT COALESCE(NULLIF(NULLIF(TRIM(c.disposition_name),''),'N/A'),NULLIF(NULLIF(TRIM(c.disposition_code),''),'N/A'))
    FROM fact_calls c
    WHERE c.normalized_phone=${leadAlias}.normalized_phone AND c.started_at>=${leadAlias}.lead_created_at
      AND COALESCE(NULLIF(NULLIF(TRIM(c.disposition_name),''),'N/A'),NULLIF(NULLIF(TRIM(c.disposition_code),''),'N/A')) IS NOT NULL
    ORDER BY c.started_at DESC,c.call_uuid DESC LIMIT 1)`;
}

function leadLatestCategorySql(leadAlias = 'l') {
  return `(SELECT NULLIF(NULLIF(TRIM(c.disposition_category),''),'N/A')
    FROM fact_calls c
    WHERE c.normalized_phone=${leadAlias}.normalized_phone AND c.started_at>=${leadAlias}.lead_created_at
      AND NULLIF(NULLIF(TRIM(c.disposition_category),''),'N/A') IS NOT NULL
    ORDER BY c.started_at DESC,c.call_uuid DESC LIMIT 1)`;
}

function leadOperationalStageSql(leadAlias = 'l') {
  return `CASE
    WHEN EXISTS (SELECT 1 FROM fact_bills b WHERE b.normalized_phone=${leadAlias}.normalized_phone
      AND b.bill_date>=${leadAlias}.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN 'Billed'
    WHEN EXISTS (SELECT 1 FROM fact_followups f WHERE f.normalized_phone=${leadAlias}.normalized_phone
      AND COALESCE(f.created_at,f.scheduled_at)>=${leadAlias}.lead_created_at
      AND COALESCE(f.created_at,f.scheduled_at)<DATE_ADD(:endDate,INTERVAL 1 DAY)
      AND LOWER(TRIM(COALESCE(f.status,''))) NOT IN ('completed','closed','cancelled','canceled','done')) THEN 'Follow-Up'
    WHEN ${lostCategoryCondition(leadLatestCategorySql(leadAlias))} THEN 'Lost'
    WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=${leadAlias}.normalized_phone
      AND c.started_at>=${leadAlias}.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)
      AND c.talk_duration_seconds>0) THEN 'Connected'
    ELSE 'Queued'
  END`;
}

function followupCategoryCondition(columnSql) {
  const value = `LOWER(TRIM(COALESCE(${columnSql}, '')))`;
  return `(
    ${value} LIKE '%follow%'
    OR ${value} LIKE '%pending%'
    OR ${value} LIKE '%call back%'
    OR ${value} LIKE '%callback%'
    OR ${value} LIKE '%discuss and come%'
  )`;
}

function billedCategoryCondition(columnSql) {
  const value = `LOWER(TRIM(COALESCE(${columnSql}, '')))`;
  return `(
    ${value} LIKE '%service enquiry - sell gold%'
    OR ${value} LIKE '%service enquiry - buy gold%'
    OR ${value} LIKE '%service enquiry - release gold%'
    OR ${value} LIKE '%sale done%'
    OR ${value} LIKE '%sold out%'
    OR ${value} LIKE '%visited sold out%'
    OR ${value} LIKE '%billed%'
    OR ${value} LIKE '%final sale%'
  )`;
}

function followupBusinessStageCondition(dispositionSql, statusSql, directionSql, durationSql) {
  const disposition = `LOWER(TRIM(COALESCE(${dispositionSql}, '')))`;
  const status = `LOWER(TRIM(COALESCE(${statusSql}, '')))`;
  const direction = `LOWER(TRIM(COALESCE(${directionSql}, '')))`;
  const duration = `COALESCE(${durationSql}, 0)`;
  return `(
    ${followupCategoryCondition(dispositionSql)}
    OR (
      ${direction} = 'incoming'
      AND ${duration} > 0
      AND ${status} IN ('completed', 'answered', 'transferred')
      AND (${disposition} IN ('rnr', 'na') OR ${disposition} LIKE '%ring no reply%' OR ${disposition} LIKE '%no answer%')
    )
    OR (
      ${status} = 'completed'
      AND (
        ${disposition} LIKE '%customer disconnected%'
        OR ${disposition} LIKE '%call disconnected%'
        OR ${disposition} = 'disconnected'
        OR ${disposition} LIKE '%pending calls%'
        OR ${disposition} = 'pending'
      )
    )
  )`;
}

function leadLinkedBillExistsSql(leadAlias = 'l', billAlias = 'b2') {
  return `EXISTS (
    SELECT 1
    FROM ${dedupedFactBillsSql(billAlias)}
    WHERE (
      (${billAlias}.customer_id IS NOT NULL AND ${billAlias}.customer_id <> '' AND ${billAlias}.customer_id = ${leadAlias}.customer_id)
      OR (${billAlias}.normalized_phone IS NOT NULL AND ${billAlias}.normalized_phone <> '' AND ${billAlias}.normalized_phone = ${leadAlias}.normalized_phone)
    )
      AND ${billAlias}.bill_date >= ${leadAlias}.lead_created_at
      AND DATE(${billAlias}.bill_date) BETWEEN ? AND ?
  )`;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1
          ? [decodeURIComponent(part), '']
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function cookieLine(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false) parts.push('Secure');
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join('; ');
}

function createSession(user, remember = false) {
  const exp = Date.now() + (remember ? REMEMBER_SESSION_DURATION_MS : SESSION_DURATION_MS);
  const payload = base64url(JSON.stringify({
    username: user.username,
    role: user.role,
    exp,
    nonce: crypto.randomBytes(12).toString('hex'),
  }));
  return `${payload}.${signPayload(payload)}`;
}

function readSession(req) {
  if (!SESSION_SECRET) return null;
  const token = parseCookies(req).war_room_session;
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = signPayload(payload);
  if (
    !signature ||
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function pbkdf2Hash(password, salt, iterations = 210000) {
  return crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('base64url');
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationsRaw, salt, hash] = String(storedHash || '').split('$');
  if (scheme !== 'pbkdf2' || !salt || !hash) return false;
  const calculated = pbkdf2Hash(password, salt, Number(iterationsRaw || 210000));
  return calculated.length === hash.length && crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash));
}

function findUser(identifier) {
  const normalized = String(identifier || '').trim().toLowerCase();
  return AUTH_USERS.find((user) => {
    const ids = [user.username, user.email, user.employeeId].filter(Boolean).map((entry) => String(entry).toLowerCase());
    return ids.includes(normalized);
  });
}

function attemptKey(req, identifier) {
  return `${req.ip || req.socket?.remoteAddress || 'unknown'}:${String(identifier || '').trim().toLowerCase()}`;
}

function isLocked(req, identifier) {
  const record = loginAttempts.get(attemptKey(req, identifier));
  return record?.lockedUntil && record.lockedUntil > Date.now();
}

function recordAttempt(req, identifier, success) {
  const key = attemptKey(req, identifier);
  const now = Date.now();
  const current = loginAttempts.get(key);
  const record = current && current.windowUntil > now
    ? current
    : { count: 0, windowUntil: now + LOGIN_LOCK_WINDOW_MS, lockedUntil: 0 };
  if (success) {
    loginAttempts.delete(key);
    return;
  }
  record.count += 1;
  if (record.count >= LOGIN_LOCK_MAX_ATTEMPTS) {
    record.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
  }
  loginAttempts.set(key, record);
}

async function logLoginAttempt(req, identifier, success, reason) {
  try {
    await pool.query(
      `INSERT INTO war_room_login_attempts (identifier, ip_address, user_agent, success, reason, attempted_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        String(identifier || '').slice(0, 160),
        String(req.ip || req.socket?.remoteAddress || '').slice(0, 80),
        String(req.get('user-agent') || '').slice(0, 255),
        success ? 1 : 0,
        reason,
      ]
    );
  } catch (error) {
    console.error('[auth-log]', error.message);
  }
}

function csrfToken(req, res) {
  const cookies = parseCookies(req);
  const existing = cookies.war_room_csrf;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = crypto.randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie', cookieLine('war_room_csrf', token, { httpOnly: false, maxAge: 60 * 60 }));
  return token;
}

function verifyCsrf(req) {
  const cookies = parseCookies(req);
  const submitted = String(req.body?.csrf || req.get('x-csrf-token') || '');
  return submitted && cookies.war_room_csrf && submitted === cookies.war_room_csrf;
}

function requireSession(req, res, next) {
  const session = readSession(req);
  if (!session) {
    if (req.originalUrl.startsWith('/api/')) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }
    res.redirect('/login');
    return;
  }
  req.session = session;
  next();
}

function loginPage(csrf, error = '') {
  const errorHtml = error ? `<div class="error" role="alert">${error}</div>` : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Attica Gold Digital War Room | SEO & Marketing Analytics</title>
    <meta name="description" content="Secure login for Attica Gold Digital War Room, SEO, marketing, lead attribution and billing conversion analytics." />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" type="image/png" href="/assets/favicon.png" />
    <link rel="apple-touch-icon" href="/assets/attica_gold_logo.png" />
    <style>
      :root {
        --gold: #D9A514;
        --bright-gold: #F5C400;
        --dark-brown: #4A1C10;
        --cream: #FFF9EE;
        --white: #FFFFFF;
        --dark-text: #171717;
        --muted-text: #6B7280;
        --line: rgba(74, 28, 16, .16);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--dark-text);
        background:
          radial-gradient(circle at top left, rgba(245,196,0,.18), transparent 35%),
          linear-gradient(135deg, #fffaf0 0%, #ffffff 50%, #f7efe9 100%);
      }
      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 55% 45%;
        padding: 34px;
      }
      .visual {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 28px 0 0 28px;
        padding: 38px;
        background:
          linear-gradient(90deg, rgba(255,255,255,.78), rgba(255,249,238,.62)),
          radial-gradient(circle at 75% 15%, rgba(245,196,0,.2), transparent 24%);
      }
      .visual::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image: radial-gradient(rgba(74,28,16,.16) 1px, transparent 1px);
        background-size: 22px 22px;
        opacity: .35;
      }
      .brand, .hero, .analytics, .funnel { position: relative; z-index: 1; }
      .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 52px; }
      .brand img {
        width: 82px;
        height: 70px;
        object-fit: contain;
        background: var(--white);
        border-radius: 16px;
        padding: 8px;
        box-shadow: 0 14px 35px rgba(74,28,16,.12);
      }
      .brand-text strong { display: block; color: var(--dark-brown); font-size: 18px; }
      .brand-text span { color: var(--muted-text); font-size: 13px; }
      h1 {
        margin: 0 0 12px;
        color: var(--dark-brown);
        font-size: clamp(36px, 5vw, 64px);
        line-height: 1.02;
        letter-spacing: 0;
      }
      .subtitle { font-size: 22px; font-weight: 750; color: #7a4d06; margin-bottom: 14px; }
      .support { max-width: 720px; color: var(--muted-text); font-size: 17px; line-height: 1.7; }
      .analytics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 36px;
      }
      .mini {
        min-height: 118px;
        background: rgba(255,255,255,.82);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px;
        box-shadow: 0 16px 38px rgba(74,28,16,.08);
      }
      .mini span { display: block; color: var(--muted-text); font-size: 12px; margin-top: 10px; }
      .bars { display: flex; gap: 5px; align-items: end; height: 42px; }
      .bars i { flex: 1; border-radius: 8px 8px 3px 3px; background: linear-gradient(180deg, var(--bright-gold), var(--gold)); }
      .line-chart {
        height: 44px;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(140deg, transparent 20%, rgba(217,165,20,.18) 20%, transparent 23%, transparent 45%, rgba(217,165,20,.3) 46%, transparent 50%);
      }
      .nodes { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .node { height: 18px; border-radius: 999px; background: #fff4cf; border: 1px solid rgba(217,165,20,.35); }
      .coin { width: 46px; height: 46px; border-radius: 50%; background: linear-gradient(135deg, #fff0a8, #d9a514); display: grid; place-items: center; font-weight: 900; color: #4a1c10; }
      .funnel {
        margin-top: 30px;
        background: rgba(74,28,16,.88);
        color: var(--white);
        border-radius: 18px;
        padding: 18px;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }
      .step { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 12px; min-height: 76px; }
      .step small { color: #ffe7a0; display: block; margin-bottom: 8px; }
      .login-wrap {
        display: grid;
        place-items: center;
        padding: 28px;
        border: 1px solid var(--line);
        border-left: 0;
        border-radius: 0 28px 28px 0;
        background: rgba(255,255,255,.74);
        backdrop-filter: blur(14px);
      }
      .login-card {
        width: min(440px, 100%);
        background: var(--white);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 30px;
        box-shadow: 0 24px 70px rgba(74,28,16,.12);
      }
      .login-card h2 { margin: 0 0 8px; color: var(--dark-brown); font-size: 30px; }
      .login-card p { margin: 0 0 26px; color: var(--muted-text); line-height: 1.55; }
      label { display: grid; gap: 8px; color: #4b5563; font-size: 13px; font-weight: 650; margin-bottom: 16px; }
      input[type="text"], input[type="password"] {
        width: 100%;
        min-height: 46px;
        border: 1px solid #d8d5ca;
        border-radius: 12px;
        padding: 0 13px;
        font: inherit;
        outline: none;
        background: #fffdf8;
      }
      input:focus { border-color: var(--gold); box-shadow: 0 0 0 4px rgba(217,165,20,.15); }
      .password-row { position: relative; }
      .toggle {
        position: absolute;
        right: 8px;
        top: 7px;
        height: 32px;
        border: 0;
        background: transparent;
        color: var(--dark-brown);
        cursor: pointer;
        font-weight: 750;
      }
      .actions {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin: 6px 0 20px;
        color: var(--muted-text);
        font-size: 13px;
      }
      .remember { display: flex; gap: 8px; align-items: center; }
      .forgot { color: var(--dark-brown); text-decoration: none; font-weight: 750; }
      .login-button {
        background: linear-gradient(90deg, #F5C400, #D99A13);
        color: #241500;
        font-weight: 800;
        border-radius: 12px;
        min-height: 46px;
        width: 100%;
        border: 0;
        cursor: pointer;
        transition: transform .18s ease, box-shadow .18s ease;
        font-size: 15px;
      }
      .login-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 25px rgba(217, 165, 20, 0.28);
      }
      .secure { color: var(--muted-text); font-size: 12px; text-align: center; margin-top: 18px; }
      .error { background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3; border-radius: 12px; padding: 10px 12px; margin-bottom: 16px; font-size: 13px; }
      @media (max-width: 980px) {
        .shell { grid-template-columns: 45% 55%; padding: 18px; }
        .visual { padding: 24px; }
        .analytics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .funnel { grid-template-columns: 1fr; }
        h1 { font-size: 38px; }
      }
      @media (max-width: 720px) {
        .shell { display: block; padding: 14px; }
        .visual { border-radius: 22px 22px 0 0; padding: 22px; }
        .analytics, .funnel { display: none; }
        .brand { margin-bottom: 22px; }
        .support { font-size: 15px; }
        .login-wrap { border-left: 1px solid var(--line); border-radius: 0 0 22px 22px; padding: 16px; }
        .login-card { padding: 22px; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="visual" aria-label="SEO and marketing analytics overview">
        <div class="brand">
          <img src="/assets/attica_gold_logo.png" alt="Attica Gold Company" />
          <div class="brand-text">
            <strong>Attica Gold Company</strong>
            <span>Digital performance command center</span>
          </div>
        </div>
        <div class="hero">
          <h1>Attica Gold Digital War Room</h1>
          <div class="subtitle">SEO, Marketing & Lead Conversion Analytics</div>
          <div class="support">Track campaign spend, keywords, lead sources, customer journeys, branch performance and billing conversions from one centralized dashboard.</div>
        </div>
        <div class="analytics">
          <div class="mini"><div class="bars"><i style="height:38%"></i><i style="height:62%"></i><i style="height:48%"></i><i style="height:86%"></i></div><span>Campaign Spend</span></div>
          <div class="mini"><div class="nodes"><i class="node"></i><i class="node"></i><i class="node"></i><i class="node"></i></div><span>Lead Sources</span></div>
          <div class="mini"><div class="line-chart"></div><span>Keyword Performance</span></div>
          <div class="mini"><div class="coin">₹</div><span>Bill Conversion</span></div>
        </div>
        <div class="funnel">
          <div class="step"><small>01</small>Search & Campaigns</div>
          <div class="step"><small>02</small>Leads</div>
          <div class="step"><small>03</small>Qualified</div>
          <div class="step"><small>04</small>Walk-In</div>
          <div class="step"><small>05</small>Billed</div>
        </div>
      </section>
      <section class="login-wrap">
        <form class="login-card" method="post" action="/api/auth/login">
          <h2>Welcome Back</h2>
          <p>Sign in to monitor digital performance and business conversions.</p>
          ${errorHtml}
          <input type="hidden" name="csrf" value="${csrf}" />
          <label>Email or Employee ID
            <input name="identifier" type="text" autocomplete="username" required autofocus />
          </label>
          <label>Password
            <span class="password-row">
              <input id="password" name="password" type="password" autocomplete="current-password" required />
              <button class="toggle" type="button" aria-label="Show password" onclick="const p=document.getElementById('password'); p.type=p.type==='password'?'text':'password'; this.textContent=p.type==='password'?'Show':'Hide'">Show</button>
            </span>
          </label>
          <div class="actions">
            <label class="remember"><input name="remember" type="checkbox" value="1" /> Remember Me</label>
            <a class="forgot" href="#" onclick="return false">Forgot Password?</a>
          </div>
          <button class="login-button" type="submit">Sign In</button>
          <div class="secure">Secure access for authorized Attica Gold users only.</div>
        </form>
      </section>
    </main>
  </body>
</html>`;
}

async function migrate() {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS dim_agents (
      agent_id VARCHAR(40) PRIMARY KEY,
      agent_code VARCHAR(40),
      agent_name VARCHAR(120),
      agent_group VARCHAR(80),
      language VARCHAR(255),
      branch_id VARCHAR(80),
      active_status VARCHAR(40),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS dim_branches (
      branch_id VARCHAR(80) PRIMARY KEY,
      branch_name VARCHAR(180),
      branch_code VARCHAR(80),
      state VARCHAR(120),
      city VARCHAR(120),
      region VARCHAR(120),
      latitude VARCHAR(50),
      longitude VARCHAR(50),
      active_status VARCHAR(40),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS dim_dispositions (
      disposition_code VARCHAR(120) PRIMARY KEY,
      disposition_name VARCHAR(180),
      category VARCHAR(80),
      is_qualified TINYINT(1) DEFAULT 0,
      is_lost TINYINT(1) DEFAULT 0,
      is_followup TINYINT(1) DEFAULT 0,
      is_final TINYINT(1) DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS fact_leads (
      lead_id VARCHAR(160) PRIMARY KEY,
      customer_id VARCHAR(80),
      customer_name VARCHAR(255),
      normalized_phone VARCHAR(20),
      lead_created_at DATETIME,
      lead_updated_at DATETIME,
      source VARCHAR(80),
      platform VARCHAR(80),
      medium VARCHAR(120),
      campaign_id VARCHAR(160),
      campaign_name VARCHAR(255),
      adset_or_adgroup_id VARCHAR(160),
      adset_or_adgroup_name VARCHAR(255),
      ad_id VARCHAR(160),
      ad_name VARCHAR(255),
      keyword VARCHAR(255),
      search_term VARCHAR(255),
      landing_page TEXT,
      form_id VARCHAR(160),
      assigned_agent_id VARCHAR(40),
      branch_id VARCHAR(80),
      current_disposition VARCHAR(160),
      current_category VARCHAR(100),
      current_stage VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_leads_created (lead_created_at),
      KEY idx_leads_phone (normalized_phone),
      KEY idx_leads_source (source)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_calls (
      call_uuid VARCHAR(160) PRIMARY KEY,
      linkedid VARCHAR(160),
      lead_id VARCHAR(160),
      customer_id VARCHAR(80),
      normalized_phone VARCHAR(20),
      direction VARCHAR(30),
      call_type VARCHAR(80),
      source VARCHAR(120),
      agent_id VARCHAR(40),
      agent_name VARCHAR(120),
      branch_id VARCHAR(80),
      language VARCHAR(40),
      started_at DATETIME,
      answered_at DATETIME,
      ended_at DATETIME,
      talk_duration_seconds INT UNSIGNED DEFAULT 0,
      ring_duration_seconds INT UNSIGNED DEFAULT 0,
      status VARCHAR(80),
      disposition_code VARCHAR(160),
      disposition_name VARCHAR(180),
      disposition_category VARCHAR(100),
      recording_available TINYINT(1) DEFAULT 0,
      updated_at DATETIME,
      KEY idx_calls_started (started_at),
      KEY idx_calls_phone (normalized_phone),
      KEY idx_calls_agent (agent_id),
      KEY idx_calls_category (disposition_category)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_followups (
      followup_id VARCHAR(120) PRIMARY KEY,
      lead_id VARCHAR(160),
      customer_id VARCHAR(80),
      normalized_phone VARCHAR(20),
      agent_id VARCHAR(40),
      reason VARCHAR(180),
      disposition VARCHAR(180),
      status VARCHAR(60),
      created_at DATETIME,
      scheduled_at DATETIME,
      last_attempt_at DATETIME,
      next_dial_at DATETIME,
      expires_at DATETIME,
      completed_at DATETIME,
      KEY idx_followups_phone (normalized_phone),
      KEY idx_followups_status (status),
      KEY idx_followups_scheduled (scheduled_at)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_visits (
      visit_id VARCHAR(160) PRIMARY KEY,
      lead_id VARCHAR(160),
      customer_id VARCHAR(80),
      normalized_phone VARCHAR(20),
      branch_id VARCHAR(80),
      scheduled_visit_at DATETIME,
      actual_visit_at DATETIME,
      visit_status VARCHAR(80),
      visit_source VARCHAR(120),
      agent_id VARCHAR(40),
      created_at DATETIME,
      updated_at DATETIME,
      KEY idx_visits_actual (actual_visit_at),
      KEY idx_visits_phone (normalized_phone)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_bills (
      bill_id VARCHAR(160) PRIMARY KEY,
      invoice_number VARCHAR(160),
      customer_id VARCHAR(80),
      normalized_phone VARCHAR(20),
      bill_date DATETIME,
      branch_id VARCHAR(80),
      business_type VARCHAR(120),
      transaction_type VARCHAR(120),
      gold_weight DECIMAL(12,3) DEFAULT 0,
      gross_amount DECIMAL(14,2) DEFAULT 0,
      transaction_value DECIMAL(14,2) DEFAULT 0,
      bill_status VARCHAR(100),
      created_at DATETIME,
      updated_at DATETIME,
      attributed_agent_id VARCHAR(40),
      attribution_method VARCHAR(120),
      attribution_talk_seconds INT UNSIGNED DEFAULT 0,
      KEY idx_bills_date (bill_date),
      KEY idx_bills_phone (normalized_phone),
      KEY idx_bills_agent (attributed_agent_id)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_customer_status (
      customer_id VARCHAR(80) PRIMARY KEY,
      normalized_phone VARCHAR(20),
      customer_name VARCHAR(255),
      first_lead_at DATETIME,
      first_connected_at DATETIME,
      first_bill_at DATETIME,
      latest_bill_at DATETIME,
      total_transactions INT DEFAULT 0,
      customer_type VARCHAR(60),
      current_status VARCHAR(100),
      loss_reason_code VARCHAR(120),
      loss_reason VARCHAR(255),
      updated_at DATETIME,
      KEY idx_customer_phone (normalized_phone)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_marketing_spend (
      metric_date DATE,
      platform VARCHAR(80),
      campaign_id VARCHAR(160),
      adset_or_adgroup_id VARCHAR(160),
      ad_id VARCHAR(160),
      impressions INT DEFAULT 0,
      clicks INT DEFAULT 0,
      spend DECIMAL(14,2) DEFAULT 0,
      platform_conversions INT DEFAULT 0,
      PRIMARY KEY (metric_date, platform, campaign_id, adset_or_adgroup_id, ad_id)
    )`,
    `CREATE TABLE IF NOT EXISTS meta_leads (
      meta_lead_id VARCHAR(255) PRIMARY KEY,
      page_id VARCHAR(160),
      form_id VARCHAR(160),
      form_name VARCHAR(255),
      customer_name VARCHAR(255),
      phone_raw VARCHAR(80),
      phone_normalized VARCHAR(20),
      email VARCHAR(255),
      city VARCHAR(160),
      state VARCHAR(160),
      created_time DATETIME,
      campaign_id VARCHAR(160),
      campaign_name VARCHAR(255),
      adset_id VARCHAR(160),
      adset_name VARCHAR(255),
      ad_id VARCHAR(160),
      ad_name VARCHAR(255),
      platform VARCHAR(80),
      is_organic TINYINT(1) DEFAULT 0,
      raw_field_data_json JSON,
      synced_at DATETIME,
      updated_at DATETIME,
      KEY idx_meta_leads_created (created_time),
      KEY idx_meta_leads_phone (phone_normalized),
      KEY idx_meta_leads_campaign (campaign_id, adset_id, ad_id)
    )`,
    `CREATE TABLE IF NOT EXISTS meta_forms (
      form_id VARCHAR(160) PRIMARY KEY,
      form_name VARCHAR(255),
      status VARCHAR(60),
      page_id VARCHAR(160),
      page_name VARCHAR(255),
      synced_at DATETIME,
      updated_at DATETIME,
      KEY idx_meta_forms_page (page_id)
    )`,
    `CREATE TABLE IF NOT EXISTS meta_ad_insights_daily (
      metric_date DATE NOT NULL,
      account_id VARCHAR(160) NOT NULL,
      account_name VARCHAR(255),
      campaign_id VARCHAR(160) NOT NULL,
      campaign_name VARCHAR(255),
      adset_id VARCHAR(160) NOT NULL,
      adset_name VARCHAR(255),
      ad_id VARCHAR(160) NOT NULL,
      ad_name VARCHAR(255),
      impressions BIGINT UNSIGNED DEFAULT 0,
      reach BIGINT UNSIGNED DEFAULT 0,
      clicks BIGINT UNSIGNED DEFAULT 0,
      spend DECIMAL(16,2) DEFAULT 0,
      cpc DECIMAL(16,6) DEFAULT 0,
      cpm DECIMAL(16,6) DEFAULT 0,
      ctr DECIMAL(16,6) DEFAULT 0,
      frequency DECIMAL(16,6) DEFAULT 0,
      actions_json JSON,
      action_values_json JSON,
      currency VARCHAR(20),
      synced_at DATETIME,
      PRIMARY KEY (metric_date, account_id, campaign_id, adset_id, ad_id),
      KEY idx_meta_insights_campaign (campaign_id, metric_date),
      KEY idx_meta_insights_adset (adset_id, metric_date),
      KEY idx_meta_insights_ad (ad_id, metric_date)
    )`,
    `CREATE TABLE IF NOT EXISTS meta_sync_state (
      sync_type VARCHAR(80) PRIMARY KEY,
      last_success_at DATETIME,
      last_cursor VARCHAR(500),
      last_error TEXT,
      last_error_at DATETIME,
      records_received BIGINT UNSIGNED DEFAULT 0,
      status VARCHAR(40) DEFAULT 'pending',
      token_expires_at DATETIME,
      updated_at DATETIME,
      KEY idx_meta_sync_status (status)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_seo_metrics (
      metric_date DATE,
      query_text VARCHAR(255),
      landing_page TEXT,
      country VARCHAR(20),
      device VARCHAR(40),
      clicks INT DEFAULT 0,
      impressions INT DEFAULT 0,
      ctr DECIMAL(10,6) DEFAULT 0,
      average_position DECIMAL(10,3) DEFAULT 0,
      KEY idx_seo_date (metric_date)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_website_analytics (
      metric_date DATE,
      source VARCHAR(80),
      medium VARCHAR(120),
      campaign VARCHAR(255),
      landing_page TEXT,
      sessions INT DEFAULT 0,
      form_leads INT DEFAULT 0,
      KEY idx_web_date (metric_date)
    )`,
    `CREATE TABLE IF NOT EXISTS fact_whatsapp_events (
      event_id VARCHAR(160) PRIMARY KEY,
      normalized_phone VARCHAR(20),
      event_type VARCHAR(120),
      campaign VARCHAR(180),
      tag_name VARCHAR(120),
      event_at DATETIME,
      raw_summary TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sync_watermarks (
      source_name VARCHAR(80) PRIMARY KEY,
      cursor_value VARCHAR(255),
      updated_after DATETIME,
      last_synced_at DATETIME,
      last_status VARCHAR(40),
      last_error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS webhook_events (
      event_id VARCHAR(160) PRIMARY KEY,
      event_type VARCHAR(120),
      occurred_at DATETIME,
      entity_id VARCHAR(160),
      payload JSON,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS dashboard_daily_summary (
      summary_date DATE PRIMARY KEY,
      payload JSON,
      generated_at DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS war_room_login_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      identifier VARCHAR(160),
      ip_address VARCHAR(80),
      user_agent VARCHAR(255),
      success TINYINT(1) DEFAULT 0,
      reason VARCHAR(120),
      attempted_at DATETIME,
      KEY idx_login_attempted_at (attempted_at),
      KEY idx_login_identifier (identifier)
    )`,
  ];

  for (const statement of ddl) {
    await pool.query(statement);
  }
}

async function sourceFetch(endpoint, cursor = null, updatedAfter = null, dateWindow = null) {
  if (!SOURCE_API_BASE || !SOURCE_API_TOKEN) {
    throw new Error('source_api_not_configured');
  }
  const url = new URL(`${SOURCE_API_BASE}/api/v1/war-room/${endpoint}`);
  url.searchParams.set('limit', String(SYNC_LIMIT));
  if (cursor) url.searchParams.set('cursor', cursor);
  if (dateWindow?.startDate) url.searchParams.set('start_date', dateWindow.startDate);
  if (dateWindow?.endDate) url.searchParams.set('end_date', dateWindow.endDate);
  if (updatedAfter && !cursor && !dateWindow) url.searchParams.set('updated_after', updatedAfter);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${SOURCE_API_TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`source_${endpoint}_${response.status}`);
  }
  return response.json();
}

async function watermark(endpoint) {
  const [[row]] = await pool.query('SELECT cursor_value, updated_after FROM sync_watermarks WHERE source_name = ?', [endpoint]);
  return {
    cursor: row?.cursor_value || null,
    updatedAfter: row?.updated_after || null,
  };
}

async function saveWatermark(endpoint, cursor, updatedAfter, status = 'ok', error = null) {
  await pool.query(
    `INSERT INTO sync_watermarks (source_name, cursor_value, updated_after, last_synced_at, last_status, last_error)
     VALUES (?, ?, ?, NOW(), ?, ?)
     ON DUPLICATE KEY UPDATE cursor_value = VALUES(cursor_value), updated_after = ?, last_synced_at = NOW(), last_status = VALUES(last_status), last_error = VALUES(last_error)`,
    [endpoint, cursor, updatedAfter, status, error, updatedAfter]
  );
}

async function upsertRows(endpoint, rows) {
  if (!rows.length) return;
  const tableMap = {
    agents: ['dim_agents', ['agent_id', 'agent_code', 'agent_name', 'agent_group', 'language', 'branch_id', 'active_status']],
    branches: ['dim_branches', ['branch_id', 'branch_name', 'branch_code', 'state', 'city', 'region', 'latitude', 'longitude', 'active_status']],
    dispositions: ['dim_dispositions', ['disposition_code', 'disposition_name', 'category', 'is_qualified', 'is_lost', 'is_followup', 'is_final']],
    leads: ['fact_leads', ['lead_id', 'customer_id', 'customer_name', 'normalized_phone', 'lead_created_at', 'lead_updated_at', 'source', 'platform', 'medium', 'campaign_id', 'campaign_name', 'adset_or_adgroup_id', 'adset_or_adgroup_name', 'ad_id', 'ad_name', 'keyword', 'search_term', 'landing_page', 'form_id', 'assigned_agent_id', 'branch_id', 'current_disposition', 'current_category', 'current_stage']],
    calls: ['fact_calls', ['call_uuid', 'linkedid', 'lead_id', 'customer_id', 'normalized_phone', 'direction', 'call_type', 'source', 'agent_id', 'agent_name', 'branch_id', 'language', 'started_at', 'answered_at', 'ended_at', 'talk_duration_seconds', 'ring_duration_seconds', 'status', 'disposition_code', 'disposition_name', 'disposition_category', 'recording_available', 'updated_at']],
    followups: ['fact_followups', ['followup_id', 'lead_id', 'customer_id', 'normalized_phone', 'agent_id', 'reason', 'disposition', 'status', 'created_at', 'scheduled_at', 'last_attempt_at', 'next_dial_at', 'expires_at', 'completed_at']],
    visits: ['fact_visits', ['visit_id', 'lead_id', 'customer_id', 'normalized_phone', 'branch_id', 'scheduled_visit_at', 'actual_visit_at', 'visit_status', 'visit_source', 'agent_id', 'created_at', 'updated_at']],
    bills: ['fact_bills', ['bill_id', 'invoice_number', 'customer_id', 'normalized_phone', 'bill_date', 'branch_id', 'business_type', 'transaction_type', 'gold_weight', 'gross_amount', 'transaction_value', 'bill_status', 'created_at', 'updated_at', 'attributed_agent_id', 'attribution_method', 'attribution_talk_seconds']],
    customers: ['fact_customer_status', ['customer_id', 'normalized_phone', 'customer_name', 'first_lead_at', 'first_connected_at', 'first_bill_at', 'latest_bill_at', 'total_transactions', 'customer_type', 'current_status', 'loss_reason_code', 'loss_reason', 'updated_at']],
  };
  const map = tableMap[endpoint];
  if (!map) return;
  const [table, columns] = map;
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns.slice(1).map((col) => `${col}=VALUES(${col})`).join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
  for (const row of rows) {
    if (endpoint === 'leads' && Number(row.reporting_excluded) === 1) {
      await pool.query('DELETE FROM fact_leads WHERE lead_id = ?', [row.lead_id]);
      continue;
    }
    const values = columns.map((column) => {
      if (column === 'normalized_phone') return normalizePhone(row[column]);
      if (['gold_weight', 'gross_amount', 'transaction_value'].includes(column)) return toNumber(row[column]);
      return row[column] ?? null;
    });
    await pool.query(sql, values);
  }
}

function syncDateWindowForEndpoint(endpoint, overrideWindow = null) {
  if (!dateWindowSyncEndpoints.has(endpoint)) return null;
  if (overrideWindow?.startDate && overrideWindow?.endDate) return overrideWindow;
  const today = todayIst();
  return {
    startDate: shiftIsoDate(today, 1 - SOURCE_RECONCILIATION_DAYS),
    endDate: today,
  };
}

async function syncEndpoint(endpoint, options = {}) {
  const mark = await watermark(endpoint);
  let cursor = mark.cursor;
  let updatedAfter = mark.updatedAfter;
  let total = 0;
  let loops = 0;
  const syncStartedAt = mysqlNowIst();
  const dateWindow = syncDateWindowForEndpoint(endpoint, options.dateWindow);
  const effectiveUpdatedAfter = dateWindow ? null : updatedAfter;
  try {
    do {
      const payload = await sourceFetch(endpoint, cursor, effectiveUpdatedAfter, dateWindow);
      const rows = Array.isArray(payload.data) ? payload.data : [];
      await upsertRows(endpoint, rows);
      total += rows.length;
      cursor = payload.next_cursor || null;
      loops += 1;
      if (!payload.has_more) cursor = null;
      if (!cursor) updatedAfter = syncStartedAt;
      await saveWatermark(endpoint, cursor, updatedAfter, 'ok', null);
    } while (cursor && loops < SYNC_MAX_PAGES_PER_ENDPOINT);
    return { endpoint, total, status: 'ok' };
  } catch (error) {
    await saveWatermark(endpoint, cursor, updatedAfter, 'error', error.message);
    return { endpoint, total, status: 'error', error: error.message };
  }
}

let syncRunning = false;
async function runSync(options = {}) {
  if (syncRunning) return { skipped: true, reason: 'sync_already_running' };
  syncRunning = true;
  try {
    const results = [];
    for (const endpoint of sourceEndpoints) {
      results.push(await syncEndpoint(endpoint, options));
    }
    return { skipped: false, results, synced_at: nowIso() };
  } finally {
    syncRunning = false;
  }
}

async function summaryRows(startDate, endDate) {
  const [[leadStats]] = await pool.query(
    `SELECT COUNT(*) AS leads, COUNT(DISTINCT normalized_phone) AS unique_leads
     FROM fact_leads
     WHERE DATE(lead_created_at) BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  const [[callStats]] = await pool.query(
    `SELECT
       COUNT(DISTINCT CASE
         WHEN EXISTS (
           SELECT 1 FROM fact_calls c
           WHERE c.normalized_phone = l.normalized_phone
             AND DATE(c.started_at) BETWEEN ? AND ?
         ) THEN l.lead_id
       END) AS contacted,
       COUNT(DISTINCT CASE
         WHEN EXISTS (
           SELECT 1 FROM fact_calls c
           WHERE c.normalized_phone = l.normalized_phone
             AND DATE(c.started_at) BETWEEN ? AND ?
             AND (c.talk_duration_seconds > 0 OR c.answered_at IS NOT NULL)
         ) THEN l.lead_id
       END) AS connected,
       COALESCE((
         SELECT SUM(c.talk_duration_seconds)
         FROM fact_calls c
         INNER JOIN (
           SELECT DISTINCT normalized_phone
           FROM fact_leads
           WHERE DATE(lead_created_at) BETWEEN ? AND ?
             AND normalized_phone IS NOT NULL
             AND normalized_phone <> ''
         ) lp ON lp.normalized_phone = c.normalized_phone
         WHERE DATE(c.started_at) BETWEEN ? AND ?
       ), 0) AS talk_seconds
     FROM fact_leads l
     WHERE DATE(l.lead_created_at) BETWEEN ? AND ?`,
    [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate]
  );
  const latestCallCategorySubquery = `
    SELECT
      normalized_phone,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          COALESCE(NULLIF(disposition_category, ''), '')
          ORDER BY started_at DESC, updated_at DESC SEPARATOR '\u001f'
        ),
        '\u001f',
        1
      ) AS latest_disposition,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          COALESCE(NULLIF(status, ''), '')
          ORDER BY started_at DESC, updated_at DESC SEPARATOR '\u001f'
        ),
        '\u001f',
        1
      ) AS latest_status,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          COALESCE(NULLIF(direction, ''), '')
          ORDER BY started_at DESC, updated_at DESC SEPARATOR '\u001f'
        ),
        '\u001f',
        1
      ) AS latest_direction,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          COALESCE(talk_duration_seconds, 0)
          ORDER BY started_at DESC, updated_at DESC SEPARATOR '\u001f'
        ),
        '\u001f',
        1
      ) AS latest_duration
    FROM fact_calls
    WHERE DATE(started_at) BETWEEN ? AND ?
    GROUP BY normalized_phone
  `;
  const [[stageStats]] = await pool.query(
    `SELECT
       COUNT(CASE
         WHEN has_bill = 0
          AND ${followupBusinessStageCondition('latest_disposition', 'latest_status', 'latest_direction', 'latest_duration')}
         THEN 1 END) AS followups,
       COUNT(CASE
         WHEN has_bill = 0
          AND NOT ${followupBusinessStageCondition('latest_disposition', 'latest_status', 'latest_direction', 'latest_duration')}
          AND NOT ${lostCategoryCondition('latest_disposition')}
          AND NOT ${billedCategoryCondition('latest_disposition')}
          AND ${qualifiedCategoryCondition('latest_disposition')}
         THEN 1 END) AS qualified,
       COUNT(CASE
         WHEN has_bill = 0
          AND ${lostCategoryCondition('latest_disposition')}
         THEN 1 END) AS lost
     FROM (
       SELECT
         l.lead_id,
         COALESCE(lc.latest_disposition, '') AS latest_disposition,
         COALESCE(lc.latest_status, '') AS latest_status,
         COALESCE(lc.latest_direction, '') AS latest_direction,
         COALESCE(lc.latest_duration, 0) AS latest_duration,
         CASE WHEN ${leadLinkedBillExistsSql('l', 'b2')} THEN 1 ELSE 0 END AS has_bill
       FROM fact_leads l
       LEFT JOIN (${latestCallCategorySubquery}) lc ON lc.normalized_phone = l.normalized_phone
       WHERE DATE(l.lead_created_at) BETWEEN ? AND ?
     ) scoped_leads`,
    [startDate, endDate, startDate, endDate, startDate, endDate]
  );
  const [[allBillStats]] = await pool.query(
    `SELECT COUNT(DISTINCT bill_id) AS bills, SUM(transaction_value) AS billing_amount, SUM(gold_weight) AS gold_weight
     FROM ${dedupedFactBillsSql('b')}
     WHERE DATE(b.bill_date) BETWEEN ? AND ?`,
    [startDate, endDate]
  );
  const [[linkedBillDateStats]] = await pool.query(
    `SELECT
       COUNT(*) AS bills,
       COUNT(DISTINCT lead_id) AS billed_leads,
       SUM(transaction_value) AS billing_amount,
       SUM(gold_weight) AS gold_weight
     FROM (
       SELECT
         b.bill_id,
         MIN(l.lead_id) AS lead_id,
         MAX(b.transaction_value) AS transaction_value,
         MAX(b.gold_weight) AS gold_weight
       FROM ${dedupedFactBillsSql('b')}
       INNER JOIN fact_leads l
         ON (
           (b.customer_id IS NOT NULL AND b.customer_id <> '' AND b.customer_id = l.customer_id)
           OR (b.normalized_phone IS NOT NULL AND b.normalized_phone <> '' AND b.normalized_phone = l.normalized_phone)
         )
        AND b.bill_date >= l.lead_created_at
       WHERE DATE(b.bill_date) BETWEEN ? AND ?
         AND DATE(l.lead_created_at) BETWEEN ? AND ?
       GROUP BY b.bill_id
     ) matched_bills`,
    [startDate, endDate, startDate, endDate]
  );
  const [[linkedBillStats]] = await pool.query(
    `SELECT
       COUNT(*) AS linked_bills,
       COUNT(DISTINCT lead_id) AS billed_leads,
       SUM(transaction_value) AS billing_amount,
       SUM(gold_weight) AS gold_weight
     FROM (
       SELECT
         b.bill_id,
         SUBSTRING_INDEX(
           GROUP_CONCAT(l.lead_id ORDER BY l.lead_created_at ASC, l.lead_id ASC SEPARATOR '\u001f'),
           '\u001f',
           1
         ) AS lead_id,
         MAX(b.transaction_value) AS transaction_value,
         MAX(b.gold_weight) AS gold_weight
       FROM ${dedupedFactBillsSql('b')}
       INNER JOIN fact_leads l
         ON (
           (b.customer_id IS NOT NULL AND b.customer_id <> '' AND b.customer_id = l.customer_id)
           OR (b.normalized_phone IS NOT NULL AND b.normalized_phone <> '' AND b.normalized_phone = l.normalized_phone)
         )
        AND b.bill_date >= l.lead_created_at
       WHERE DATE(l.lead_created_at) BETWEEN ? AND ?
       GROUP BY b.bill_id
     ) matched_cohort_bills`,
    [startDate, endDate]
  );
  const [[spendStats]] = await pool.query(
    `SELECT COALESCE(SUM(spend),0) AS campaign_spend FROM (
       SELECT spend FROM fact_marketing_spend
       WHERE metric_date BETWEEN ? AND ?
         AND LOWER(COALESCE(platform,'')) NOT LIKE '%meta%'
         AND LOWER(COALESCE(platform,'')) NOT LIKE '%facebook%'
       UNION ALL
       SELECT spend FROM meta_ad_insights_daily WHERE metric_date BETWEEN ? AND ?
     ) combined_spend`,
    [startDate, endDate, startDate, endDate]
  );
  let googleAdsSpendStats = { spend: 0 };
  try {
    googleAdsSpendStats = await fetchGoogleAdsMetricsForDateRange(startDate, endDate);
  } catch (error) {
    console.warn('[war-room/google-ads] campaign spend sync failed:', error?.message || error);
  }
  const leads = Number(leadStats.leads || 0);
  const uniqueLeads = Number(leadStats.unique_leads || 0);
  const leadBillDateCount = Number(linkedBillDateStats.bills || 0);
  const linkedBills = Number(linkedBillStats.linked_bills || 0);
  const leadBillDateLeadCount = Number(linkedBillDateStats.billed_leads || 0);
  const cohortBilledLeads = Number(linkedBillStats.billed_leads || 0);
  const allBusinessBills = Number(allBillStats.bills || 0);
  const spend = Number(((Number(spendStats.campaign_spend || 0) + Number(googleAdsSpendStats.spend || 0))).toFixed(2));
  return {
    date_range: { start_date: startDate, end_date: endDate },
    leads_today: leads,
    unique_leads_today: uniqueLeads,
    contacted_today: Number(callStats.contacted || 0),
    connected_today: Number(callStats.connected || 0),
    followups_today: Number(stageStats.followups || 0),
    qualified_leads_today: Number(stageStats.qualified || 0),
    lost_leads_today: Number(stageStats.lost || 0),
    bills_today: linkedBills,
    lead_to_bill_rate: uniqueLeads ? Number(((cohortBilledLeads / uniqueLeads) * 100).toFixed(2)) : 0,
    lead_billed_leads_today: cohortBilledLeads,
    lead_cohort_billed_leads_today: cohortBilledLeads,
    lead_linked_bills_today: linkedBills,
    billing_amount: Number(linkedBillStats.billing_amount || 0),
    gold_weight: Number(linkedBillStats.gold_weight || 0),
    lead_bill_date_bills_today: leadBillDateCount,
    lead_bill_date_billed_leads_today: leadBillDateLeadCount,
    all_business_bills_today: allBusinessBills,
    all_business_billing_amount: Number(allBillStats.billing_amount || 0),
    all_business_gold_weight: Number(allBillStats.gold_weight || 0),
    campaign_spend: spend,
    campaign_spend_status: spend ? 'synced' : 'sync_pending',
    google_ads_spend: Number(googleAdsSpendStats.spend || 0),
    google_ads_clicks: Number(googleAdsSpendStats.clicks || 0),
    google_ads_impressions: Number(googleAdsSpendStats.impressions || 0),
    cost_per_lead: spend && uniqueLeads ? Number((spend / uniqueLeads).toFixed(2)) : null,
    cost_per_bill: spend && linkedBills ? Number((spend / linkedBills).toFixed(2)) : null,
    talk_seconds: Number(callStats.talk_seconds || 0),
  };
}

async function drilldown(metric, startDate, endDate, page, limit, offset, filters = {}) {
  const params = { startDate, endDate, limit, offset };
  const where = [];
  const source = normalizedDashboardSourceFilter(filters.source);
  const sourceSql = canonicalSourceSql('l');
  const search = String(filters.search || '').trim();
  where.push('DATE(l.lead_created_at) BETWEEN :startDate AND :endDate');
  if (source) params.source = source;
  if (search) params.search = `%${search}%`;
  if (['bills', 'billing_amount', 'cost_per_bill'].includes(metric)) {
    const billFilters = [
      'DATE(l.lead_created_at) BETWEEN :startDate AND :endDate',
    ];
    if (source) billFilters.push(`${sourceSql} = :source`);
    if (search) {
      billFilters.push(`(
        b.bill_id LIKE :search
        OR b.normalized_phone LIKE :search
        OR COALESCE(l.customer_name, cs.customer_name, '') LIKE :search
        OR COALESCE(l.source, '') LIKE :search
        OR COALESCE(l.platform, '') LIKE :search
        OR COALESCE(l.campaign_name, '') LIKE :search
        OR COALESCE(a.agent_name, '') LIKE :search
      )`);
    }
    const billWhereSql = `WHERE ${billFilters.join(' AND ')}`;
    const [[countRow]] = await pool.query(
      `SELECT COUNT(DISTINCT b.bill_id) AS total
       FROM ${dedupedFactBillsSql('b')}
       INNER JOIN fact_leads l
         ON (
           (b.customer_id IS NOT NULL AND b.customer_id <> '' AND b.customer_id = l.customer_id)
           OR (b.normalized_phone IS NOT NULL AND b.normalized_phone <> '' AND b.normalized_phone = l.normalized_phone)
         )
        AND b.bill_date >= l.lead_created_at
       LEFT JOIN fact_customer_status cs ON cs.normalized_phone = b.normalized_phone
       LEFT JOIN dim_agents a ON a.agent_id = b.attributed_agent_id
       ${billWhereSql}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT
        b.bill_date AS record_date,
        b.bill_id,
        b.normalized_phone AS customer_number,
        COALESCE(l.customer_name, cs.customer_name, 'N/A') AS customer_name,
        ${sourceSql} AS canonical_source,
        COALESCE(l.source, 'Unknown') AS raw_source,
        l.platform,
        l.campaign_name,
        b.transaction_value AS bill_amount,
        b.gold_weight,
        b.bill_status,
        b.attributed_agent_id,
        a.agent_name AS credited_agent,
        b.attribution_method
       FROM ${dedupedFactBillsSql('b')}
       INNER JOIN fact_leads l
         ON (
           (b.customer_id IS NOT NULL AND b.customer_id <> '' AND b.customer_id = l.customer_id)
           OR (b.normalized_phone IS NOT NULL AND b.normalized_phone <> '' AND b.normalized_phone = l.normalized_phone)
         )
        AND b.bill_date >= l.lead_created_at
       LEFT JOIN fact_customer_status cs ON cs.normalized_phone = b.normalized_phone
       LEFT JOIN dim_agents a ON a.agent_id = b.attributed_agent_id
       ${billWhereSql}
       GROUP BY b.bill_id
       ORDER BY b.bill_date DESC
       LIMIT :limit OFFSET :offset`,
      params
    );
    return { total: Number(countRow.total || 0), rows: decorateSourceRows(rows) };
  }
  const latestDispositionSql = `(SELECT COALESCE(NULLIF(c.disposition_category, ''), '')
    FROM fact_calls c
    WHERE c.normalized_phone = l.normalized_phone
      AND DATE(c.started_at) BETWEEN :startDate AND :endDate
    ORDER BY c.started_at DESC, c.updated_at DESC
    LIMIT 1)`;
  const latestStatusSql = `(SELECT COALESCE(NULLIF(c.status, ''), '')
    FROM fact_calls c
    WHERE c.normalized_phone = l.normalized_phone
      AND DATE(c.started_at) BETWEEN :startDate AND :endDate
    ORDER BY c.started_at DESC, c.updated_at DESC
    LIMIT 1)`;
  const latestDirectionSql = `(SELECT COALESCE(NULLIF(c.direction, ''), '')
    FROM fact_calls c
    WHERE c.normalized_phone = l.normalized_phone
      AND DATE(c.started_at) BETWEEN :startDate AND :endDate
    ORDER BY c.started_at DESC, c.updated_at DESC
    LIMIT 1)`;
  const latestDurationSql = `(SELECT COALESCE(c.talk_duration_seconds, 0)
    FROM fact_calls c
    WHERE c.normalized_phone = l.normalized_phone
      AND DATE(c.started_at) BETWEEN :startDate AND :endDate
    ORDER BY c.started_at DESC, c.updated_at DESC
    LIMIT 1)`;
  const hasSelectedBillSql = `EXISTS (
    SELECT 1
    FROM ${dedupedFactBillsSql('b2')}
    WHERE (
      (b2.customer_id IS NOT NULL AND b2.customer_id <> '' AND b2.customer_id = l.customer_id)
      OR (b2.normalized_phone IS NOT NULL AND b2.normalized_phone <> '' AND b2.normalized_phone = l.normalized_phone)
    )
      AND b2.bill_date >= l.lead_created_at
      AND DATE(b2.bill_date) BETWEEN :startDate AND :endDate
  )`;
  const isFollowupSql = followupBusinessStageCondition(
    latestDispositionSql,
    latestStatusSql,
    latestDirectionSql,
    latestDurationSql,
  );
  if (metric === 'unique') {
    where.push(`l.lead_id = (
      SELECT l2.lead_id
      FROM fact_leads l2
      WHERE l2.normalized_phone = l.normalized_phone
        AND DATE(l2.lead_created_at) BETWEEN :startDate AND :endDate
      ORDER BY l2.lead_created_at DESC, l2.lead_id DESC
      LIMIT 1
    )`);
  } else if (metric === 'connected') {
    where.push('EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone = l.normalized_phone AND DATE(c.started_at) BETWEEN :startDate AND :endDate AND (c.talk_duration_seconds > 0 OR c.answered_at IS NOT NULL))');
  } else if (metric === 'contacted') {
    where.push('EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone = l.normalized_phone AND DATE(c.started_at) BETWEEN :startDate AND :endDate)');
  } else if (metric === 'followups') {
    where.push(`NOT ${hasSelectedBillSql} AND ${isFollowupSql}`);
  } else if (metric === 'qualified') {
    where.push(`NOT ${hasSelectedBillSql}
      AND NOT ${isFollowupSql}
      AND NOT ${lostCategoryCondition(latestDispositionSql)}
      AND NOT ${billedCategoryCondition(latestDispositionSql)}
      AND ${qualifiedCategoryCondition(latestDispositionSql)}`);
  } else if (metric === 'lost') {
    where.push(`NOT ${hasSelectedBillSql} AND ${lostCategoryCondition(latestDispositionSql)}`);
  }
  if (source) where.push(`${sourceSql} = :source`);
  if (search) {
    where.push(`(
      l.lead_id LIKE :search
      OR l.customer_name LIKE :search
      OR l.normalized_phone LIKE :search
      OR l.source LIKE :search
      OR l.platform LIKE :search
      OR l.campaign_name LIKE :search
      OR l.adset_or_adgroup_name LIKE :search
      OR l.ad_name LIKE :search
      OR l.keyword LIKE :search
      OR l.search_term LIKE :search
      OR l.landing_page LIKE :search
      OR a.agent_name LIKE :search
      OR EXISTS (SELECT 1 FROM fact_calls cs WHERE cs.normalized_phone=l.normalized_phone
        AND (cs.agent_name LIKE :search OR cs.agent_id LIKE :search OR cs.disposition_name LIKE :search OR cs.disposition_category LIKE :search))
    )`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM fact_leads l
     LEFT JOIN dim_agents a ON a.agent_id = l.assigned_agent_id
     ${whereSql}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT
      l.lead_created_at,
      l.lead_id,
      l.customer_name,
      l.normalized_phone AS customer_number,
      ${sourceSql} AS canonical_source,
      l.source AS raw_source,
      l.platform,
      l.campaign_name,
      l.adset_or_adgroup_name,
      l.ad_name,
      l.keyword,
      l.search_term,
      l.landing_page,
      l.assigned_agent_id,
      ${leadLatestAgentSql('l')} AS latest_agent,
      ${leadLatestAgentSql('l')} AS assigned_agent,
      (SELECT COUNT(*) FROM fact_calls c WHERE c.normalized_phone = l.normalized_phone) AS call_attempts,
      (SELECT COUNT(*) FROM fact_calls c WHERE c.normalized_phone = l.normalized_phone AND c.talk_duration_seconds > 0) AS connected_calls,
      (SELECT COALESCE(SUM(c.talk_duration_seconds),0) FROM fact_calls c WHERE c.normalized_phone = l.normalized_phone) AS total_talk_time,
      ${leadLatestDispositionSql('l')} AS latest_disposition,
      ${leadLatestCategorySql('l')} AS current_category,
      ${leadOperationalStageSql('l')} AS current_stage,
      (SELECT f.scheduled_at FROM fact_followups f WHERE f.normalized_phone = l.normalized_phone ORDER BY f.scheduled_at DESC LIMIT 1) AS follow_up_date,
      (SELECT b.bill_status FROM ${dedupedFactBillsSql('b')} WHERE b.normalized_phone = l.normalized_phone ORDER BY b.bill_date DESC LIMIT 1) AS bill_status,
      (SELECT b.bill_date FROM ${dedupedFactBillsSql('b')} WHERE b.normalized_phone = l.normalized_phone ORDER BY b.bill_date DESC LIMIT 1) AS bill_date,
      (SELECT b.transaction_value FROM ${dedupedFactBillsSql('b')} WHERE b.normalized_phone = l.normalized_phone ORDER BY b.bill_date DESC LIMIT 1) AS bill_amount,
      (SELECT b.gold_weight FROM ${dedupedFactBillsSql('b')} WHERE b.normalized_phone = l.normalized_phone ORDER BY b.bill_date DESC LIMIT 1) AS bill_weight
     FROM fact_leads l
     LEFT JOIN dim_agents a ON a.agent_id = l.assigned_agent_id
     ${whereSql}
     ORDER BY l.lead_created_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  return { total: Number(countRow.total || 0), rows: decorateSourceRows(rows) };
}

function normalizeCampaignKey(value = '') {
  const key = String(value || '').trim();
  return key || 'N/A';
}

function canonicalFromSpendPlatform(value = '') {
  const platform = String(value || '').trim().toLowerCase();
  if (platform.includes('google')) return 'GOOGLE_ADS';
  if (platform.includes('meta') || platform.includes('facebook')) return 'META';
  if (platform.includes('whatsapp') || platform.includes('wati')) return 'WHATSAPP';
  if (platform.includes('justdial') || platform.includes('just dial')) return 'JUSTDIAL';
  if (platform.includes('seo')) return 'ORGANIC';
  if (platform.includes('organic')) return 'ORGANIC';
  if (platform.includes('website')) return 'WEBSITE_DIRECT';
  return 'UNKNOWN';
}

function rowMatchesSearch(row, search = '') {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return true;
  return [
    row.date,
    row.platform,
    row.ad_account,
    row.campaign_id,
    row.campaign_name,
    row.ad_set_or_ad_group,
    row.ad_or_creative,
    row.sync_status,
  ].some((value) => String(value || '').toLowerCase().includes(needle));
}

async function campaignAttributionStats(startDate, endDate, filters = {}) {
  const source = normalizedDashboardSourceFilter(filters.source);
  const sourceSql = canonicalSourceSql('l');
  const params = { startDate, endDate };
  const leadWhere = ['DATE(l.lead_created_at) BETWEEN :startDate AND :endDate'];
  if (source) {
    params.source = source;
    leadWhere.push(`${sourceSql} = :source`);
  }
  const [leadRows] = await pool.query(
    `SELECT
       ${sourceSql} AS canonical_source,
       COALESCE(NULLIF(l.campaign_id,''),'') AS campaign_id,
       COALESCE(NULLIF(l.campaign_name,''),'') AS campaign_name,
       COUNT(*) AS leads,
       COUNT(DISTINCT l.normalized_phone) AS unique_leads,
       COUNT(DISTINCT CASE
         WHEN EXISTS (
           SELECT 1
           FROM fact_calls c
           WHERE c.normalized_phone = l.normalized_phone
             AND DATE(c.started_at) BETWEEN :startDate AND :endDate
             AND ${qualifiedCategoryCondition('c.disposition_category')}
         ) THEN l.lead_id
       END) AS qualified_leads
     FROM fact_leads l
     WHERE ${leadWhere.join(' AND ')}
     GROUP BY ${sourceSql},COALESCE(NULLIF(l.campaign_id,''),''),COALESCE(NULLIF(l.campaign_name,''),'')`,
    params
  );
  const [billRows] = await pool.query(
    `SELECT
       linked.canonical_source,linked.campaign_id,linked.campaign_name,
       COUNT(DISTINCT linked.lead_id) AS billed_leads,
       COUNT(DISTINCT linked.bill_id) AS bill_records,
       SUM(linked.transaction_value) AS billing_amount
     FROM (
       SELECT
         ${sourceSql} AS canonical_source,
         COALESCE(NULLIF(l.campaign_id,''),'') AS campaign_id,
         COALESCE(NULLIF(l.campaign_name,''),'') AS campaign_name,
         l.lead_id,
         b.bill_id,
         MAX(b.transaction_value) AS transaction_value
       FROM fact_leads l
       INNER JOIN ${dedupedFactBillsSql('b')}
         ON (
           (b.customer_id IS NOT NULL AND b.customer_id <> '' AND b.customer_id = l.customer_id)
           OR (b.normalized_phone IS NOT NULL AND b.normalized_phone <> '' AND b.normalized_phone = l.normalized_phone)
         )
        AND b.bill_date >= l.lead_created_at
       WHERE ${leadWhere.join(' AND ')}
       GROUP BY ${sourceSql},COALESCE(NULLIF(l.campaign_id,''),''),COALESCE(NULLIF(l.campaign_name,''),''),l.lead_id,b.bill_id
     ) linked
     GROUP BY linked.canonical_source,linked.campaign_id,linked.campaign_name`,
    params
  );
  const stats = new Map();
  const addStats = (key, row, billOnly = false) => {
    if (!key) return;
    const current = stats.get(key) || { leads: 0, unique_leads: 0, qualified_leads: 0, billed_leads: 0, bill_records: 0, billing_amount: 0 };
    if (!billOnly) {
      current.leads += Number(row.leads || 0);
      current.unique_leads += Number(row.unique_leads || 0);
      current.qualified_leads += Number(row.qualified_leads || 0);
    } else {
      current.billed_leads += Number(row.billed_leads || 0);
      current.bill_records += Number(row.bill_records || 0);
      current.billing_amount += Number(row.billing_amount || 0);
    }
    stats.set(key, current);
  };
  for (const row of leadRows) {
    const sourceKey = String(row.canonical_source || 'UNKNOWN');
    if (row.campaign_id) addStats(`id:${sourceKey}:${String(row.campaign_id).toLowerCase()}`, row);
    else if (row.campaign_name) addStats(`name:${sourceKey}:${String(row.campaign_name).toLowerCase()}`, row);
  }
  for (const row of billRows) {
    const sourceKey = String(row.canonical_source || 'UNKNOWN');
    if (row.campaign_id) addStats(`id:${sourceKey}:${String(row.campaign_id).toLowerCase()}`, row, true);
    else if (row.campaign_name) addStats(`name:${sourceKey}:${String(row.campaign_name).toLowerCase()}`, row, true);
  }
  return stats;
}

function enrichSpendRow(row, statsByCampaign) {
  const spendSource = canonicalFromSpendPlatform(row.platform);
  const allowedLeadSources = spendSource === 'GOOGLE_ADS' ? ['GOOGLE_ADS', 'GOOGLE_LP'] : [spendSource];
  const emptyStats = {
    leads: 0,
    unique_leads: 0,
    qualified_leads: 0,
    billed_leads: 0,
    bill_records: 0,
    billing_amount: 0,
  };
  const stats = allowedLeadSources.reduce((combined, source) => {
    const campaignId = String(row.campaign_id || '').trim().toLowerCase();
    const campaignName = String(row.campaign_name || '').trim().toLowerCase();
    const matched = (campaignId && campaignId !== 'n/a' && statsByCampaign.get(`id:${source}:${campaignId}`))
      || (campaignName && campaignName !== 'n/a' && statsByCampaign.get(`name:${source}:${campaignName}`));
    if (!matched) return combined;
    for (const key of Object.keys(emptyStats)) combined[key] += Number(matched[key] || 0);
    return combined;
  }, { ...emptyStats });
  const spend = Number(row.spend || 0);
  const leads = Number(stats.leads || 0);
  const uniqueLeads = Number(stats.unique_leads || 0);
  const qualifiedLeads = Number(stats.qualified_leads || 0);
  const billRecords = Number(stats.bill_records || 0);
  const billingAmount = Number(stats.billing_amount || 0);
  return {
    date: row.date,
    platform: row.platform || 'N/A',
    ad_account: row.ad_account || 'N/A',
    campaign_id: row.campaign_id || 'N/A',
    campaign_name: row.campaign_name || row.campaign_id || 'N/A',
    ad_set_or_ad_group: row.ad_set_or_ad_group_name || row.ad_set_or_ad_group || 'N/A',
    ad_or_creative: row.ad_or_creative_name || row.ad_or_creative || 'N/A',
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    spend,
    leads,
    unique_leads: uniqueLeads,
    qualified_leads: qualifiedLeads,
    billed_leads: Number(stats.billed_leads || 0),
    bill_records: billRecords,
    billing_amount: billingAmount,
    cpl: uniqueLeads ? Number((spend / uniqueLeads).toFixed(2)) : null,
    cost_per_qualified_lead: qualifiedLeads ? Number((spend / qualifiedLeads).toFixed(2)) : null,
    cost_per_bill: billRecords ? Number((spend / billRecords).toFixed(2)) : null,
    roas: spend ? Number((billingAmount / spend).toFixed(2)) : null,
    last_synced_at: row.last_synced_at || 'N/A',
    sync_status: row.sync_status || 'synced',
    source_canonical: canonicalFromSpendPlatform(row.platform),
  };
}

async function marketingSpendDetails(startDate, endDate, page, limit, offset, filters = {}) {
  const source = normalizedDashboardSourceFilter(filters.source);
  const search = String(filters.search || '').trim();
  const statsByCampaign = await campaignAttributionStats(startDate, endDate, filters);
  const [storedRows] = await pool.query(
    `SELECT
       metric_date AS date,
       platform,
       'Reporting DB' AS ad_account,
       campaign_id,
       campaign_id AS campaign_name,
       adset_or_adgroup_id AS ad_set_or_ad_group,
       ad_id AS ad_or_creative,
       SUM(impressions) AS impressions,
       SUM(clicks) AS clicks,
       SUM(spend) AS spend,
       SUM(platform_conversions) AS platform_conversions,
       'synced' AS sync_status,
       'Reporting DB' AS last_synced_at
     FROM fact_marketing_spend
     WHERE metric_date BETWEEN ? AND ?
       AND LOWER(COALESCE(platform,'')) NOT LIKE '%meta%'
       AND LOWER(COALESCE(platform,'')) NOT LIKE '%facebook%'
     GROUP BY metric_date, platform, campaign_id, adset_or_adgroup_id, ad_id
     HAVING spend > 0 OR clicks > 0 OR impressions > 0`,
    [startDate, endDate]
  );
  const [metaStoredRows] = await pool.query(
    `SELECT metric_date AS date,
       'Meta Ads' AS platform,
       COALESCE(NULLIF(MAX(account_name),''),'Meta Ad Account') AS ad_account,
       campaign_id,
       COALESCE(NULLIF(MAX(campaign_name),''),campaign_id,'N/A') AS campaign_name,
       adset_id AS ad_set_or_ad_group,
       COALESCE(NULLIF(MAX(adset_name),''),adset_id,'N/A') AS ad_set_or_ad_group_name,
       ad_id AS ad_or_creative,
       COALESCE(NULLIF(MAX(ad_name),''),ad_id,'N/A') AS ad_or_creative_name,
       SUM(impressions) AS impressions,
       SUM(clicks) AS clicks,
       SUM(spend) AS spend,
       0 AS platform_conversions,
       'synced' AS sync_status,
       MAX(synced_at) AS last_synced_at
     FROM meta_ad_insights_daily
     WHERE metric_date BETWEEN ? AND ?
     GROUP BY metric_date,campaign_id,adset_id,ad_id
     HAVING spend > 0 OR clicks > 0 OR impressions > 0`,
    [startDate, endDate],
  );
  let googleRows = [];
  try {
    const googleStats = await fetchGoogleAdsMetricsForDateRange(startDate, endDate);
    googleRows = googleStats.campaignRows || [];
  } catch (error) {
    console.warn('[war-room/google-ads] campaign spend details failed:', error?.message || error);
  }
  const enriched = [...storedRows, ...metaStoredRows, ...googleRows]
    .map((row) => enrichSpendRow(row, statsByCampaign))
    .filter((row) => !source || row.source_canonical === source || row.leads > 0 || row.bill_records > 0)
    .filter((row) => rowMatchesSearch(row, search))
    .sort((a, b) => (Number(b.spend || 0) - Number(a.spend || 0)) || String(a.campaign_name).localeCompare(String(b.campaign_name)));
  const totalSpend = Number(enriched.reduce((sum, row) => sum + Number(row.spend || 0), 0).toFixed(2));
  const rows = enriched.slice(offset, offset + limit);
  return {
    metric: 'spend',
    total: enriched.length,
    total_spend: totalSpend,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(enriched.length / limit)),
    rows,
  };
}

async function metaConnectorStatus() {
  const [rows] = await pool.query(
    `SELECT sync_type, last_success_at, last_error, last_error_at, records_received, status, token_expires_at, updated_at
     FROM meta_sync_state
     ORDER BY FIELD(sync_type, 'meta_token', 'meta_leads', 'meta_insights', 'meta_webhook'), sync_type`,
  );
  const byType = Object.fromEntries(rows.map((row) => [row.sync_type, row]));
  const webhookConfigured = Boolean(META_WEBHOOK_VERIFY_TOKEN && META_APP_SECRET);
  const webhook = byType.meta_webhook || {
    sync_type: 'meta_webhook',
    status: webhookConfigured ? 'pending' : 'attention',
    last_error: webhookConfigured ? null : 'Meta webhook verify token or app secret is not configured',
    last_success_at: null,
  };
  const connectorRows = [byType.meta_leads, byType.meta_insights, webhook].filter(Boolean);
  const statuses = connectorRows.map((row) => String(row.status || 'pending'));
  const healthyCount = statuses.filter((status) => status === 'healthy').length;
  const attentionCount = statuses.filter((status) => status === 'attention').length;
  let overall = 'pending';
  if (statuses.length && statuses.every((status) => status === 'healthy')) overall = 'healthy';
  else if (attentionCount && (healthyCount || statuses.includes('pending'))) overall = 'partial';
  else if (attentionCount && attentionCount === statuses.length) overall = 'attention';
  return {
    overall,
    token_configured: Boolean(META_ACCESS_TOKEN),
    page_ids_configured: META_PAGE_IDS.length,
    ad_accounts_configured: META_AD_ACCOUNT_IDS.length,
    token: byType.meta_token || null,
    leads: byType.meta_leads || null,
    insights: byType.meta_insights || null,
    webhook,
  };
}

async function metaSummaryRows(startDate, endDate) {
  const sourceSql = canonicalSourceSql('l');
  const params = { startDate, endDate };
  const [[[leadStats]], [[activityStats]], [[billStats]], [[spendStats]], connector] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS leads, COUNT(DISTINCT NULLIF(l.normalized_phone,'')) AS unique_leads
       FROM fact_leads l
       WHERE ${sourceSql}='META' AND DATE(l.lead_created_at) BETWEEN :startDate AND :endDate`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN EXISTS (
           SELECT 1 FROM fact_calls c
           WHERE c.normalized_phone=l.normalized_phone
             AND c.started_at>=l.lead_created_at
             AND c.started_at<DATE_ADD(:endDate, INTERVAL 1 DAY)
         ) THEN NULLIF(l.normalized_phone,'') END) AS contacted,
         COUNT(DISTINCT CASE WHEN EXISTS (
           SELECT 1 FROM fact_calls c
           WHERE c.normalized_phone=l.normalized_phone
             AND c.started_at>=l.lead_created_at
             AND c.started_at<DATE_ADD(:endDate, INTERVAL 1 DAY)
             AND c.talk_duration_seconds>0
         ) THEN NULLIF(l.normalized_phone,'') END) AS connected,
         COUNT(DISTINCT CASE WHEN EXISTS (
           SELECT 1 FROM fact_calls c
           WHERE c.normalized_phone=l.normalized_phone
             AND c.started_at>=l.lead_created_at
             AND c.started_at<DATE_ADD(:endDate, INTERVAL 1 DAY)
             AND ${qualifiedCategoryCondition('c.disposition_category')}
         ) THEN NULLIF(l.normalized_phone,'') END) AS qualified,
         COUNT(DISTINCT CASE WHEN EXISTS (
           SELECT 1 FROM fact_followups f
           WHERE f.normalized_phone=l.normalized_phone
             AND COALESCE(f.created_at,f.scheduled_at)>=l.lead_created_at
             AND COALESCE(f.created_at,f.scheduled_at)<DATE_ADD(:endDate, INTERVAL 1 DAY)
         ) THEN NULLIF(l.normalized_phone,'') END) AS followups,
         COUNT(DISTINCT CASE WHEN EXISTS (
           SELECT 1 FROM fact_calls c
           WHERE c.normalized_phone=l.normalized_phone
             AND c.started_at>=l.lead_created_at
             AND c.started_at<DATE_ADD(:endDate, INTERVAL 1 DAY)
             AND ${lostCategoryCondition('c.disposition_category')}
         ) THEN NULLIF(l.normalized_phone,'') END) AS lost
       FROM fact_leads l
       WHERE ${sourceSql}='META' AND DATE(l.lead_created_at) BETWEEN :startDate AND :endDate`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(DISTINCT NULLIF(l.normalized_phone,'')) AS billed_leads,
         COUNT(DISTINCT b.bill_id) AS bill_records,
         COUNT(DISTINCT CASE WHEN NOT EXISTS (
           SELECT 1 FROM fact_bills prior_bill
           WHERE prior_bill.normalized_phone=l.normalized_phone AND prior_bill.bill_date<l.lead_created_at
         ) THEN NULLIF(l.normalized_phone,'') END) AS new_billed_customers,
         COALESCE(SUM(b.transaction_value),0) AS billing_amount,
         COALESCE(SUM(b.gold_weight),0) AS gold_weight
       FROM fact_leads l
       INNER JOIN ${dedupedFactBillsSql('b')}
         ON b.normalized_phone=l.normalized_phone
        AND b.bill_date>=l.lead_created_at
        AND b.bill_date<DATE_ADD(:endDate, INTERVAL 1 DAY)
       WHERE ${sourceSql}='META'
         AND DATE(l.lead_created_at) BETWEEN :startDate AND :endDate
         AND l.lead_id=(
           SELECT l2.lead_id FROM fact_leads l2
           WHERE ${canonicalSourceSql('l2')}='META'
             AND l2.normalized_phone=l.normalized_phone
             AND l2.lead_created_at<=b.bill_date
           ORDER BY l2.lead_created_at DESC,l2.lead_id DESC LIMIT 1
         )`,
      params,
    ),
    pool.query(
      `SELECT COALESCE(SUM(spend),0) AS spend
       FROM meta_ad_insights_daily
       WHERE metric_date BETWEEN :startDate AND :endDate`,
      params,
    ),
    metaConnectorStatus(),
  ]);
  const uniqueLeads = Number(leadStats.unique_leads || 0);
  const spend = Number(spendStats.spend || 0);
  const billedLeads = Number(billStats.billed_leads || 0);
  const billRecords = Number(billStats.bill_records || 0);
  const newBilledCustomers = Number(billStats.new_billed_customers || 0);
  const rate = (value) => uniqueLeads ? Number(((Number(value || 0) / uniqueLeads) * 100).toFixed(2)) : 0;
  return {
    start_date: startDate,
    end_date: endDate,
    campaign_spend: Number(spend.toFixed(2)),
    meta_leads: Number(leadStats.leads || 0),
    unique_meta_leads: uniqueLeads,
    cpl: uniqueLeads ? Number((spend / uniqueLeads).toFixed(2)) : null,
    contacted_leads: Number(activityStats.contacted || 0),
    contact_rate: rate(activityStats.contacted),
    connected_leads: Number(activityStats.connected || 0),
    connected_rate: rate(activityStats.connected),
    qualified_leads: Number(activityStats.qualified || 0),
    qualified_rate: rate(activityStats.qualified),
    followups: Number(activityStats.followups || 0),
    lost_leads: Number(activityStats.lost || 0),
    billed_meta_leads: billedLeads,
    lead_to_bill_rate: rate(billedLeads),
    meta_bill_records: billRecords,
    meta_billing_amount: Number(billStats.billing_amount || 0),
    meta_gold_weight: Number(billStats.gold_weight || 0),
    cost_per_bill: billRecords ? Number((spend / billRecords).toFixed(2)) : null,
    cac: newBilledCustomers ? Number((spend / newBilledCustomers).toFixed(2)) : null,
    new_billed_customers: newBilledCustomers,
    connector,
    data_as_of: connector.insights?.last_success_at || connector.leads?.last_success_at || null,
  };
}

function metaPerformanceDimension(level, alias) {
  const campaignId = `COALESCE(NULLIF(${alias}.campaign_id,''),'N/A')`;
  const campaignName = `COALESCE(NULLIF(MAX(${alias}.campaign_name),''),NULLIF(${alias}.campaign_id,''),'N/A')`;
  const adsetId = `COALESCE(NULLIF(${alias}.${alias === 'i' ? 'adset_id' : 'adset_or_adgroup_id'},''),'N/A')`;
  const adsetName = `COALESCE(NULLIF(MAX(${alias}.${alias === 'i' ? 'adset_name' : 'adset_or_adgroup_name'}),''),NULLIF(${alias}.${alias === 'i' ? 'adset_id' : 'adset_or_adgroup_id'},''),'N/A')`;
  const adId = `COALESCE(NULLIF(${alias}.ad_id,''),'N/A')`;
  const adName = `COALESCE(NULLIF(MAX(${alias}.ad_name),''),NULLIF(${alias}.ad_id,''),'N/A')`;
  if (level === 'ad') {
    return {
      select: `${campaignId} campaign_id, ${campaignName} campaign_name, ${adsetId} adset_id, ${adsetName} adset_name, ${adId} ad_id, ${adName} ad_name`,
      group: `${campaignId},${adsetId},${adId}`,
      key: (row) => `ad:${row.campaign_id}:${row.adset_id}:${row.ad_id}`,
    };
  }
  if (level === 'adset') {
    return {
      select: `${campaignId} campaign_id, ${campaignName} campaign_name, ${adsetId} adset_id, ${adsetName} adset_name, 'N/A' ad_id, 'N/A' ad_name`,
      group: `${campaignId},${adsetId}`,
      key: (row) => `adset:${row.campaign_id}:${row.adset_id}`,
    };
  }
  return {
    select: `${campaignId} campaign_id, ${campaignName} campaign_name, 'N/A' adset_id, 'N/A' adset_name, 'N/A' ad_id, 'N/A' ad_name`,
    group: campaignId,
    key: (row) => `campaign:${row.campaign_id}`,
  };
}

async function metaPerformanceRows(startDate, endDate, level = 'campaign', filters = {}) {
  const safeLevel = ['campaign', 'adset', 'ad'].includes(level) ? level : 'campaign';
  const leadDim = metaPerformanceDimension(safeLevel, 'l');
  const insightDim = metaPerformanceDimension(safeLevel, 'i');
  const params = { startDate, endDate };
  const leadWhere = [`${canonicalSourceSql('l')}='META'`, 'DATE(l.lead_created_at) BETWEEN :startDate AND :endDate'];
  const insightWhere = ['i.metric_date BETWEEN :startDate AND :endDate'];
  if (filters.campaignId) {
    params.campaignId = filters.campaignId;
    leadWhere.push("COALESCE(NULLIF(l.campaign_id,''),'N/A')=:campaignId");
    insightWhere.push("COALESCE(NULLIF(i.campaign_id,''),'N/A')=:campaignId");
  }
  if (filters.adsetId) {
    params.adsetId = filters.adsetId;
    leadWhere.push("COALESCE(NULLIF(l.adset_or_adgroup_id,''),'N/A')=:adsetId");
    insightWhere.push("COALESCE(NULLIF(i.adset_id,''),'N/A')=:adsetId");
  }
  const [leadRows] = await pool.query(
    `SELECT ${leadDim.select},
       COUNT(*) leads,
       COUNT(DISTINCT NULLIF(l.normalized_phone,'')) unique_leads,
       COUNT(DISTINCT CASE WHEN EXISTS (
         SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone
           AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)
       ) THEN NULLIF(l.normalized_phone,'') END) contacted,
       COUNT(DISTINCT CASE WHEN EXISTS (
         SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone
           AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)
           AND c.talk_duration_seconds>0
       ) THEN NULLIF(l.normalized_phone,'') END) connected,
       COUNT(DISTINCT CASE WHEN EXISTS (
         SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone
           AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)
           AND ${qualifiedCategoryCondition('c.disposition_category')}
       ) THEN NULLIF(l.normalized_phone,'') END) qualified_leads
     FROM fact_leads l WHERE ${leadWhere.join(' AND ')} GROUP BY ${leadDim.group}`,
    params,
  );
  const [billRows] = await pool.query(
    `SELECT ${leadDim.select}, COUNT(DISTINCT b.bill_id) bill_records,
       COUNT(DISTINCT NULLIF(l.normalized_phone,'')) billed_leads,
       COALESCE(SUM(b.transaction_value),0) billing_amount
     FROM fact_leads l
     INNER JOIN ${dedupedFactBillsSql('b')} ON b.normalized_phone=l.normalized_phone
       AND b.bill_date>=l.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY)
     WHERE ${leadWhere.join(' AND ')}
       AND l.lead_id=(SELECT l2.lead_id FROM fact_leads l2
         WHERE ${canonicalSourceSql('l2')}='META' AND l2.normalized_phone=l.normalized_phone
           AND l2.lead_created_at<=b.bill_date ORDER BY l2.lead_created_at DESC,l2.lead_id DESC LIMIT 1)
     GROUP BY ${leadDim.group}`,
    params,
  );
  const [insightRows] = await pool.query(
    `SELECT ${insightDim.select}, MAX(i.account_name) account_name, MAX(i.currency) currency,
       SUM(i.impressions) impressions, SUM(i.reach) reach, SUM(i.clicks) clicks, SUM(i.spend) spend
     FROM meta_ad_insights_daily i WHERE ${insightWhere.join(' AND ')} GROUP BY ${insightDim.group}`,
    params,
  );
  const merged = new Map();
  const merge = (row) => {
    const key = leadDim.key(row);
    merged.set(key, { ...(merged.get(key) || {}), ...row });
  };
  leadRows.forEach(merge);
  billRows.forEach(merge);
  insightRows.forEach(merge);
  const rows = Array.from(merged.values()).map((row) => {
    const spend = Number(row.spend || 0);
    const uniqueLeads = Number(row.unique_leads || 0);
    const billRecords = Number(row.bill_records || 0);
    const impressions = Number(row.impressions || 0);
    const clicks = Number(row.clicks || 0);
    return {
      level: safeLevel,
      account_name: row.account_name || 'N/A',
      campaign_id: row.campaign_id || 'N/A',
      campaign_name: row.campaign_name || row.campaign_id || 'N/A',
      adset_id: row.adset_id || 'N/A',
      adset_name: row.adset_name || row.adset_id || 'N/A',
      ad_id: row.ad_id || 'N/A',
      ad_name: row.ad_name || row.ad_id || 'N/A',
      spend,
      impressions,
      reach: Number(row.reach || 0),
      clicks,
      ctr: impressions ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
      cpc: clicks ? Number((spend / clicks).toFixed(2)) : null,
      leads: Number(row.leads || 0),
      unique_leads: uniqueLeads,
      contacted: Number(row.contacted || 0),
      connected: Number(row.connected || 0),
      qualified_leads: Number(row.qualified_leads || 0),
      billed_leads: Number(row.billed_leads || 0),
      bill_records: billRecords,
      billing_amount: Number(row.billing_amount || 0),
      cpl: uniqueLeads ? Number((spend / uniqueLeads).toFixed(2)) : null,
      bill_rate: uniqueLeads ? Number(((Number(row.billed_leads || 0) / uniqueLeads) * 100).toFixed(2)) : 0,
      cost_per_bill: billRecords ? Number((spend / billRecords).toFixed(2)) : null,
      currency: row.currency || 'INR',
    };
  });
  const search = String(filters.search || '').trim().toLowerCase();
  return rows
    .filter((row) => !search || [row.campaign_name, row.adset_name, row.ad_name, row.campaign_id, row.adset_id, row.ad_id]
      .some((value) => String(value || '').toLowerCase().includes(search)))
    .sort((a, b) => (b.spend - a.spend) || (b.leads - a.leads) || a.campaign_name.localeCompare(b.campaign_name));
}

async function metaLeadDetails(startDate, endDate, page, limit, offset, filters = {}, allRows = false) {
  const params = { startDate, endDate, limit, offset };
  const where = [`${canonicalSourceSql('l')}='META'`, 'DATE(l.lead_created_at) BETWEEN :startDate AND :endDate'];
  const metric = String(filters.metric || 'leads');
  if (filters.campaignId) {
    params.campaignId = filters.campaignId;
    where.push("COALESCE(NULLIF(l.campaign_id,''),'N/A')=:campaignId");
  }
  if (filters.adsetId) {
    params.adsetId = filters.adsetId;
    where.push("COALESCE(NULLIF(l.adset_or_adgroup_id,''),'N/A')=:adsetId");
  }
  if (filters.adId) {
    params.adId = filters.adId;
    where.push("COALESCE(NULLIF(l.ad_id,''),'N/A')=:adId");
  }
  if (filters.search) {
    params.search = `%${filters.search}%`;
    where.push(`(l.lead_id LIKE :search OR l.customer_name LIKE :search OR l.normalized_phone LIKE :search
      OR l.campaign_name LIKE :search OR l.adset_or_adgroup_name LIKE :search OR l.ad_name LIKE :search
      OR EXISTS (SELECT 1 FROM fact_calls cs WHERE cs.normalized_phone=l.normalized_phone AND cs.started_at>=l.lead_created_at
        AND (cs.agent_name LIKE :search OR cs.agent_id LIKE :search OR cs.disposition_name LIKE :search OR cs.disposition_category LIKE :search)))`);
  }
  if (['unique', 'billed'].includes(metric)) {
    where.push(`l.lead_id=(SELECT l2.lead_id FROM fact_leads l2
      WHERE ${canonicalSourceSql('l2')}='META' AND l2.normalized_phone=l.normalized_phone
        AND DATE(l2.lead_created_at) BETWEEN :startDate AND :endDate
      ORDER BY l2.lead_created_at DESC,l2.lead_id DESC LIMIT 1)`);
  }
  if (metric === 'contacted') where.push('EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY))');
  if (metric === 'connected') where.push('EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND c.talk_duration_seconds>0)');
  if (metric === 'qualified') where.push(`EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${qualifiedCategoryCondition('c.disposition_category')})`);
  if (metric === 'followups') where.push('EXISTS (SELECT 1 FROM fact_followups f WHERE f.normalized_phone=l.normalized_phone AND COALESCE(f.created_at,f.scheduled_at)>=l.lead_created_at AND COALESCE(f.created_at,f.scheduled_at)<DATE_ADD(:endDate,INTERVAL 1 DAY))');
  if (metric === 'lost') where.push(`EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${lostCategoryCondition('c.disposition_category')})`);
  if (metric === 'billed') where.push(`EXISTS (SELECT 1 FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY))`);
  const whereSql = where.join(' AND ');
  const [[countRow]] = await pool.query(`SELECT COUNT(*) total FROM fact_leads l WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT l.lead_created_at, l.lead_id AS meta_lead_id, l.customer_name, l.normalized_phone AS customer_number,
       COALESCE(ml.form_name,l.form_id,'N/A') form_name,
       COALESCE(l.campaign_name,l.campaign_id,'N/A') campaign_name,
       COALESCE(l.adset_or_adgroup_name,l.adset_or_adgroup_id,'N/A') adset_name,
       COALESCE(l.ad_name,l.ad_id,'N/A') ad_name,
       COALESCE(l.platform,'Meta') platform,
       l.assigned_agent_id,
       ${leadLatestAgentSql('l')} latest_agent,
       (SELECT COUNT(*) FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at) call_attempts,
       (SELECT COUNT(*) FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.talk_duration_seconds>0) connected_calls,
       (SELECT COALESCE(SUM(c.talk_duration_seconds),0) FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at) total_talk_time,
       ${leadLatestDispositionSql('l')} disposition,
       ${leadLatestCategorySql('l')} category,
       ${leadOperationalStageSql('l')} stage,
       (SELECT f.status FROM fact_followups f WHERE f.normalized_phone=l.normalized_phone AND COALESCE(f.created_at,f.scheduled_at)>=l.lead_created_at ORDER BY COALESCE(f.scheduled_at,f.created_at) DESC LIMIT 1) follow_up,
       (SELECT b.bill_status FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) bill_status,
       (SELECT b.bill_date FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) bill_date,
       (SELECT b.transaction_value FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) bill_amount,
       (SELECT b.gold_weight FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) gold_weight
     FROM fact_leads l LEFT JOIN meta_leads ml ON ml.meta_lead_id=l.lead_id
     WHERE ${whereSql} ORDER BY l.lead_created_at DESC,l.lead_id DESC ${allRows ? '' : 'LIMIT :limit OFFSET :offset'}`,
    params,
  );
  return { metric, total: Number(countRow.total || 0), page, limit, total_pages: Math.max(1, Math.ceil(Number(countRow.total || 0) / limit)), rows };
}

async function metaSpendDetails(startDate, endDate, page, limit, offset, filters = {}, allRows = false) {
  const params = { startDate, endDate, limit, offset };
  const where = ['metric_date BETWEEN :startDate AND :endDate'];
  if (filters.campaignId) { params.campaignId = filters.campaignId; where.push('campaign_id=:campaignId'); }
  if (filters.adsetId) { params.adsetId = filters.adsetId; where.push('adset_id=:adsetId'); }
  if (filters.adId) { params.adId = filters.adId; where.push('ad_id=:adId'); }
  if (filters.search) {
    params.search = `%${filters.search}%`;
    where.push('(campaign_name LIKE :search OR adset_name LIKE :search OR ad_name LIKE :search OR account_name LIKE :search)');
  }
  const whereSql = where.join(' AND ');
  const [[totals]] = await pool.query(`SELECT COUNT(*) total,COALESCE(SUM(spend),0) total_spend FROM meta_ad_insights_daily WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT metric_date AS date,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,
       spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,currency,actions_json,synced_at
     FROM meta_ad_insights_daily WHERE ${whereSql}
     ORDER BY metric_date DESC,spend DESC,campaign_name,adset_name,ad_name ${allRows ? '' : 'LIMIT :limit OFFSET :offset'}`,
    params,
  );
  return {
    total: Number(totals.total || 0),
    total_spend: Number(totals.total_spend || 0),
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(Number(totals.total || 0) / limit)),
    rows: rows.map(({ actions_json: actionsJson, ...row }) => ({
      ...row,
      platform_leads: metaActionCount(typeof actionsJson === 'string' ? JSON.parse(actionsJson || '[]') : actionsJson),
    })),
  };
}

const channelReportConfigs = {
  'google-lp': {
    key: 'google-lp',
    label: 'Google LP',
    canonicalSources: ['GOOGLE_LP', 'GOOGLE_ADS'],
    paid: true,
  },
  organic: {
    key: 'organic',
    label: 'Organic',
    canonicalSources: ['ORGANIC', 'SEO'],
    paid: false,
  },
};

function channelReportConfig(value) {
  return channelReportConfigs[String(value || '').trim().toLowerCase()] || null;
}

function channelSourceCondition(alias, config) {
  const sources = config.canonicalSources.map((source) => `'${source}'`).join(',');
  return `${canonicalSourceSql(alias)} IN (${sources})`;
}

async function channelConnectorStatus(config, startDate, endDate) {
  if (config.paid) {
    if (!GOOGLE_ADS_CUSTOMER_ID || !GOOGLE_ADS_DEVELOPER_TOKEN || !parseGoogleServiceAccount()) {
      return { overall: 'attention', message: 'Google Ads reporting credentials require attention.', data_as_of: null };
    }
    try {
      const metrics = await fetchGoogleAdsMetricsForDateRange(startDate, endDate);
      return {
        overall: 'healthy',
        message: 'Google Ads reporting is connected.',
        data_as_of: metrics.campaignRows?.[0]?.last_synced_at || nowIso(),
      };
    } catch (error) {
      return { overall: 'attention', message: String(error?.message || error).slice(0, 500), data_as_of: null };
    }
  }
  const [[[seo]], [[web]], [syncRows]] = await Promise.all([
    pool.query('SELECT COUNT(*) records,MAX(metric_date) data_as_of FROM fact_seo_metrics'),
    pool.query('SELECT COUNT(*) records,MAX(metric_date) data_as_of FROM fact_website_analytics'),
    pool.query("SELECT source_name,last_synced_at,last_status,last_error FROM sync_watermarks WHERE source_name IN ('google_search_console','google_analytics_organic')"),
  ]);
  const records = Number(seo.records || 0) + Number(web.records || 0);
  const failed = syncRows.find((row) => row.last_status === 'error');
  const missing = [];
  if (!GOOGLE_SEARCH_CONSOLE_SITE_URL) missing.push('Search Console site');
  if (!GOOGLE_GA4_PROPERTY_ID) missing.push('GA4 property');
  const overall = failed || missing.length ? 'attention' : (records ? 'healthy' : 'pending');
  return {
    overall,
    message: failed?.last_error || (missing.length ? `${missing.join(' and ')} require configuration.` : records ? 'Organic search and website analytics are synchronized.' : 'Waiting for the first organic analytics synchronization.'),
    data_as_of: [seo.data_as_of, web.data_as_of].filter(Boolean).sort().at(-1) || null,
  };
}

async function channelSummaryRows(startDate, endDate, config) {
  const sourceCondition = channelSourceCondition('l', config);
  const latestSourceCondition = channelSourceCondition('l2', config);
  const params = { startDate, endDate };
  const [[[leadStats]], [[activityStats]], [[billStats]], connector] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) leads,COUNT(DISTINCT NULLIF(l.normalized_phone,'')) unique_leads
       FROM fact_leads l WHERE ${sourceCondition} AND DATE(l.lead_created_at) BETWEEN :startDate AND :endDate`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN NULLIF(l.normalized_phone,'') END) contacted,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND c.talk_duration_seconds>0) THEN NULLIF(l.normalized_phone,'') END) connected,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${qualifiedCategoryCondition('c.disposition_category')}) THEN NULLIF(l.normalized_phone,'') END) qualified,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_followups f WHERE f.normalized_phone=l.normalized_phone AND COALESCE(f.created_at,f.scheduled_at)>=l.lead_created_at AND COALESCE(f.created_at,f.scheduled_at)<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN NULLIF(l.normalized_phone,'') END) followups,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${lostCategoryCondition('c.disposition_category')}) THEN NULLIF(l.normalized_phone,'') END) lost
       FROM fact_leads l WHERE ${sourceCondition} AND DATE(l.lead_created_at) BETWEEN :startDate AND :endDate`,
      params,
    ),
    pool.query(
      `SELECT COUNT(DISTINCT NULLIF(l.normalized_phone,'')) billed_leads,COUNT(DISTINCT b.bill_id) bill_records,
         COUNT(DISTINCT CASE WHEN NOT EXISTS (SELECT 1 FROM fact_bills prior_bill WHERE prior_bill.normalized_phone=l.normalized_phone AND prior_bill.bill_date<l.lead_created_at) THEN NULLIF(l.normalized_phone,'') END) new_billed_customers,
         COALESCE(SUM(b.transaction_value),0) billing_amount,COALESCE(SUM(b.gold_weight),0) gold_weight
       FROM fact_leads l INNER JOIN ${dedupedFactBillsSql('b')} ON b.normalized_phone=l.normalized_phone
         AND b.bill_date>=l.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY)
       WHERE ${sourceCondition} AND DATE(l.lead_created_at) BETWEEN :startDate AND :endDate
         AND l.lead_id=(SELECT l2.lead_id FROM fact_leads l2 WHERE ${latestSourceCondition}
           AND l2.normalized_phone=l.normalized_phone AND l2.lead_created_at<=b.bill_date
           ORDER BY l2.lead_created_at DESC,l2.lead_id DESC LIMIT 1)`,
      params,
    ),
    channelConnectorStatus(config, startDate, endDate),
  ]);
  let media = { spend: null, impressions: 0, clicks: 0, platform_conversions: 0, sessions: 0, form_leads: 0, average_position: null };
  if (config.paid) {
    try {
      const google = await fetchGoogleAdsMetricsForDateRange(startDate, endDate);
      media = { ...media, spend: Number(google.spend || 0), impressions: Number(google.impressions || 0), clicks: Number(google.clicks || 0), platform_conversions: Number(google.google_conversions || 0) };
    } catch (_error) {}
  } else {
    const [[[seo]], [[web]]] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(clicks),0) clicks,COALESCE(SUM(impressions),0) impressions,
        CASE WHEN SUM(impressions)>0 THEN SUM(average_position*impressions)/SUM(impressions) ELSE NULL END average_position
        FROM fact_seo_metrics WHERE metric_date BETWEEN ? AND ? AND (country='page' OR country IS NULL OR country='')`, [startDate, endDate]),
      pool.query(`SELECT COALESCE(SUM(sessions),0) sessions,COALESCE(SUM(form_leads),0) form_leads
        FROM fact_website_analytics WHERE metric_date BETWEEN ? AND ?
          AND (LOWER(COALESCE(source,'')) LIKE '%organic%' OR LOWER(COALESCE(medium,'')) LIKE '%organic%' OR LOWER(COALESCE(source,'')) LIKE '%seo%')`, [startDate, endDate]),
    ]);
    media = { ...media, impressions: Number(seo.impressions || 0), clicks: Number(seo.clicks || 0), sessions: Number(web.sessions || 0), form_leads: Number(web.form_leads || 0), average_position: seo.average_position == null ? null : Number(Number(seo.average_position).toFixed(2)) };
  }
  const uniqueLeads = Number(leadStats.unique_leads || 0);
  const spend = media.spend;
  const billedLeads = Number(billStats.billed_leads || 0);
  const billRecords = Number(billStats.bill_records || 0);
  const newBilledCustomers = Number(billStats.new_billed_customers || 0);
  const rate = (value) => uniqueLeads ? Number(((Number(value || 0) / uniqueLeads) * 100).toFixed(2)) : 0;
  return {
    channel: config.key, label: config.label, start_date: startDate, end_date: endDate,
    campaign_spend: spend, leads: Number(leadStats.leads || 0), unique_leads: uniqueLeads,
    cpl: spend != null && uniqueLeads ? Number((spend / uniqueLeads).toFixed(2)) : null,
    impressions: media.impressions, clicks: media.clicks,
    ctr: media.impressions ? Number(((media.clicks / media.impressions) * 100).toFixed(2)) : 0,
    platform_conversions: media.platform_conversions, sessions: media.sessions, form_leads: media.form_leads,
    average_position: media.average_position,
    contacted_leads: Number(activityStats.contacted || 0), contact_rate: rate(activityStats.contacted),
    connected_leads: Number(activityStats.connected || 0), connected_rate: rate(activityStats.connected),
    qualified_leads: Number(activityStats.qualified || 0), qualified_rate: rate(activityStats.qualified),
    followups: Number(activityStats.followups || 0), lost_leads: Number(activityStats.lost || 0),
    billed_leads: billedLeads, lead_to_bill_rate: rate(billedLeads), bill_records: billRecords,
    billing_amount: Number(billStats.billing_amount || 0), gold_weight: Number(billStats.gold_weight || 0),
    cost_per_bill: spend != null && billRecords ? Number((spend / billRecords).toFixed(2)) : null,
    cac: spend != null && newBilledCustomers ? Number((spend / newBilledCustomers).toFixed(2)) : null,
    connector, data_as_of: connector.data_as_of,
  };
}

async function channelLeadDetails(startDate, endDate, page, limit, offset, config, filters = {}, allRows = false) {
  const params = { startDate, endDate, limit, offset };
  const sourceCondition = channelSourceCondition('l', config);
  const latestSourceCondition = channelSourceCondition('l2', config);
  const where = [sourceCondition, 'DATE(l.lead_created_at) BETWEEN :startDate AND :endDate'];
  const metric = String(filters.metric || 'leads');
  if (filters.campaignId) { params.campaignId = filters.campaignId; where.push("COALESCE(NULLIF(l.campaign_id,''),NULLIF(l.campaign_name,''),'N/A')=:campaignId"); }
  if (filters.adsetId) { params.adsetId = filters.adsetId; where.push("COALESCE(NULLIF(l.adset_or_adgroup_id,''),'N/A')=:adsetId"); }
  if (filters.adId) { params.adId = filters.adId; where.push("COALESCE(NULLIF(l.ad_id,''),'N/A')=:adId"); }
  if (filters.landingPage) { params.landingPage = filters.landingPage; where.push("COALESCE(NULLIF(l.landing_page,''),'N/A')=:landingPage"); }
  if (filters.search) {
    params.search = `%${filters.search}%`;
    where.push(`(l.lead_id LIKE :search OR l.customer_name LIKE :search OR l.normalized_phone LIKE :search OR l.campaign_name LIKE :search OR l.adset_or_adgroup_name LIKE :search OR l.ad_name LIKE :search OR l.keyword LIKE :search OR l.search_term LIKE :search OR l.landing_page LIKE :search
      OR EXISTS (SELECT 1 FROM fact_calls cs WHERE cs.normalized_phone=l.normalized_phone AND cs.started_at>=l.lead_created_at
        AND (cs.agent_name LIKE :search OR cs.agent_id LIKE :search OR cs.disposition_name LIKE :search OR cs.disposition_category LIKE :search)))`);
  }
  if (['unique', 'billed'].includes(metric)) where.push(`l.lead_id=(SELECT l2.lead_id FROM fact_leads l2 WHERE ${latestSourceCondition} AND l2.normalized_phone=l.normalized_phone AND DATE(l2.lead_created_at) BETWEEN :startDate AND :endDate ORDER BY l2.lead_created_at DESC,l2.lead_id DESC LIMIT 1)`);
  if (metric === 'contacted') where.push('EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY))');
  if (metric === 'connected') where.push('EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND c.talk_duration_seconds>0)');
  if (metric === 'qualified') where.push(`EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${qualifiedCategoryCondition('c.disposition_category')})`);
  if (metric === 'followups') where.push('EXISTS (SELECT 1 FROM fact_followups f WHERE f.normalized_phone=l.normalized_phone AND COALESCE(f.created_at,f.scheduled_at)>=l.lead_created_at AND COALESCE(f.created_at,f.scheduled_at)<DATE_ADD(:endDate,INTERVAL 1 DAY))');
  if (metric === 'lost') where.push(`EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${lostCategoryCondition('c.disposition_category')})`);
  if (metric === 'billed') where.push('EXISTS (SELECT 1 FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY))');
  const whereSql = where.join(' AND ');
  const [[countRow]] = await pool.query(`SELECT COUNT(*) total FROM fact_leads l WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT l.lead_created_at,l.lead_id,l.customer_name,l.normalized_phone customer_number,
       ${canonicalSourceSql('l')} canonical_source,l.platform,l.form_id,l.campaign_id,l.campaign_name,
       l.adset_or_adgroup_id,l.adset_or_adgroup_name,l.ad_id,l.ad_name,l.keyword,l.search_term,l.landing_page,l.assigned_agent_id,
       ${leadLatestAgentSql('l')} latest_agent,
       (SELECT COUNT(*) FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at) call_attempts,
       (SELECT COUNT(*) FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.talk_duration_seconds>0) connected_calls,
       (SELECT COALESCE(SUM(c.talk_duration_seconds),0) FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at) total_talk_time,
       ${leadLatestDispositionSql('l')} disposition,
       ${leadLatestCategorySql('l')} category,
       ${leadOperationalStageSql('l')} stage,
       (SELECT f.status FROM fact_followups f WHERE f.normalized_phone=l.normalized_phone AND COALESCE(f.created_at,f.scheduled_at)>=l.lead_created_at ORDER BY COALESCE(f.scheduled_at,f.created_at) DESC LIMIT 1) follow_up,
       (SELECT b.bill_status FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) bill_status,
       (SELECT b.bill_date FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) bill_date,
       (SELECT b.transaction_value FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) bill_amount,
       (SELECT b.gold_weight FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at ORDER BY b.bill_date DESC LIMIT 1) gold_weight
     FROM fact_leads l WHERE ${whereSql} ORDER BY l.lead_created_at DESC,l.lead_id DESC ${allRows ? '' : 'LIMIT :limit OFFSET :offset'}`,
    params,
  );
  return { metric, total: Number(countRow.total || 0), page, limit, total_pages: Math.max(1, Math.ceil(Number(countRow.total || 0) / limit)), rows: decorateSourceRows(rows) };
}

function channelLeadDimension(level, alias = 'l') {
  if (level === 'ad') return { select: `COALESCE(NULLIF(${alias}.campaign_id,''),NULLIF(${alias}.campaign_name,''),'N/A') campaign_id,MAX(COALESCE(NULLIF(${alias}.campaign_name,''),NULLIF(${alias}.campaign_id,''),'N/A')) campaign_name,COALESCE(NULLIF(${alias}.adset_or_adgroup_id,''),'N/A') adset_id,MAX(COALESCE(NULLIF(${alias}.adset_or_adgroup_name,''),NULLIF(${alias}.adset_or_adgroup_id,''),'N/A')) adset_name,COALESCE(NULLIF(${alias}.ad_id,''),'N/A') ad_id,MAX(COALESCE(NULLIF(${alias}.ad_name,''),NULLIF(${alias}.ad_id,''),'N/A')) ad_name`, group: `COALESCE(NULLIF(${alias}.campaign_id,''),NULLIF(${alias}.campaign_name,''),'N/A'),COALESCE(NULLIF(${alias}.adset_or_adgroup_id,''),'N/A'),COALESCE(NULLIF(${alias}.ad_id,''),'N/A')`, key: (row) => `ad:${row.campaign_id}:${row.adset_id}:${row.ad_id}` };
  if (level === 'adset') return { select: `COALESCE(NULLIF(${alias}.campaign_id,''),NULLIF(${alias}.campaign_name,''),'N/A') campaign_id,MAX(COALESCE(NULLIF(${alias}.campaign_name,''),NULLIF(${alias}.campaign_id,''),'N/A')) campaign_name,COALESCE(NULLIF(${alias}.adset_or_adgroup_id,''),'N/A') adset_id,MAX(COALESCE(NULLIF(${alias}.adset_or_adgroup_name,''),NULLIF(${alias}.adset_or_adgroup_id,''),'N/A')) adset_name,'N/A' ad_id,'N/A' ad_name`, group: `COALESCE(NULLIF(${alias}.campaign_id,''),NULLIF(${alias}.campaign_name,''),'N/A'),COALESCE(NULLIF(${alias}.adset_or_adgroup_id,''),'N/A')`, key: (row) => `adset:${row.campaign_id}:${row.adset_id}` };
  return { select: `COALESCE(NULLIF(${alias}.campaign_id,''),NULLIF(${alias}.campaign_name,''),'N/A') campaign_id,MAX(COALESCE(NULLIF(${alias}.campaign_name,''),NULLIF(${alias}.campaign_id,''),'N/A')) campaign_name,'N/A' adset_id,'N/A' adset_name,'N/A' ad_id,'N/A' ad_name`, group: `COALESCE(NULLIF(${alias}.campaign_id,''),NULLIF(${alias}.campaign_name,''),'N/A')`, key: (row) => `campaign:${row.campaign_id}` };
}

async function googleChannelPerformanceRows(startDate, endDate, level = 'campaign', filters = {}) {
  const safeLevel = ['campaign', 'adset', 'ad'].includes(level) ? level : 'campaign';
  const config = channelReportConfigs['google-lp'];
  const dim = channelLeadDimension(safeLevel);
  const params = { startDate, endDate };
  const where = [channelSourceCondition('l', config), 'DATE(l.lead_created_at) BETWEEN :startDate AND :endDate'];
  if (filters.campaignId) { params.campaignId = filters.campaignId; where.push("COALESCE(NULLIF(l.campaign_id,''),NULLIF(l.campaign_name,''),'N/A')=:campaignId"); }
  if (filters.adsetId) { params.adsetId = filters.adsetId; where.push("COALESCE(NULLIF(l.adset_or_adgroup_id,''),'N/A')=:adsetId"); }
  const [leadRows] = await pool.query(
    `SELECT ${dim.select},COUNT(*) leads,COUNT(DISTINCT NULLIF(l.normalized_phone,'')) unique_leads,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN NULLIF(l.normalized_phone,'') END) contacted,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND c.talk_duration_seconds>0) THEN NULLIF(l.normalized_phone,'') END) connected,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${qualifiedCategoryCondition('c.disposition_category')}) THEN NULLIF(l.normalized_phone,'') END) qualified_leads
     FROM fact_leads l WHERE ${where.join(' AND ')} GROUP BY ${dim.group}`,
    params,
  );
  const [billRows] = await pool.query(
    `SELECT ${dim.select},COUNT(DISTINCT b.bill_id) bill_records,COUNT(DISTINCT NULLIF(l.normalized_phone,'')) billed_leads,COALESCE(SUM(b.transaction_value),0) billing_amount
     FROM fact_leads l INNER JOIN ${dedupedFactBillsSql('b')} ON b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY)
     WHERE ${where.join(' AND ')} GROUP BY ${dim.group}`,
    params,
  );
  const merged = new Map();
  const merge = (row) => merged.set(dim.key(row), { ...(merged.get(dim.key(row)) || {}), ...row });
  leadRows.forEach(merge); billRows.forEach(merge);
  if (safeLevel === 'campaign') {
    try {
      const google = await fetchGoogleAdsMetricsForDateRange(startDate, endDate);
      for (const insight of google.campaignRows || []) {
        const campaignId = String(insight.campaign_id || insight.campaign_name || 'N/A');
        if (filters.campaignId && filters.campaignId !== campaignId) continue;
        const key = `campaign:${campaignId}`;
        const existing = merged.get(key) || { campaign_id: campaignId, campaign_name: insight.campaign_name || campaignId, adset_id: 'N/A', adset_name: 'N/A', ad_id: 'N/A', ad_name: 'N/A' };
        existing.spend = Number(existing.spend || 0) + Number(insight.spend || 0);
        existing.impressions = Number(existing.impressions || 0) + Number(insight.impressions || 0);
        existing.clicks = Number(existing.clicks || 0) + Number(insight.clicks || 0);
        merged.set(key, existing);
      }
    } catch (_error) {}
  }
  const search = String(filters.search || '').trim().toLowerCase();
  return Array.from(merged.values()).map((row) => {
    const spend = Number(row.spend || 0), impressions = Number(row.impressions || 0), clicks = Number(row.clicks || 0), uniqueLeads = Number(row.unique_leads || 0), bills = Number(row.bill_records || 0);
    return { level: safeLevel, campaign_id: row.campaign_id || 'N/A', campaign_name: row.campaign_name || row.campaign_id || 'N/A', adset_id: row.adset_id || 'N/A', adset_name: row.adset_name || row.adset_id || 'N/A', ad_id: row.ad_id || 'N/A', ad_name: row.ad_name || row.ad_id || 'N/A', spend, impressions, clicks, ctr: impressions ? Number(((clicks/impressions)*100).toFixed(2)) : 0, cpc: clicks ? Number((spend/clicks).toFixed(2)) : null, leads: Number(row.leads || 0), unique_leads: uniqueLeads, contacted: Number(row.contacted || 0), connected: Number(row.connected || 0), qualified_leads: Number(row.qualified_leads || 0), billed_leads: Number(row.billed_leads || 0), bill_records: bills, billing_amount: Number(row.billing_amount || 0), cpl: uniqueLeads ? Number((spend/uniqueLeads).toFixed(2)) : null, bill_rate: uniqueLeads ? Number(((Number(row.billed_leads || 0)/uniqueLeads)*100).toFixed(2)) : 0, cost_per_bill: bills ? Number((spend/bills).toFixed(2)) : null };
  }).filter((row) => !search || [row.campaign_name,row.adset_name,row.ad_name].some((value) => String(value).toLowerCase().includes(search))).sort((a,b) => (b.spend-a.spend)||(b.leads-a.leads)||a.campaign_name.localeCompare(b.campaign_name));
}

async function organicPerformanceRows(startDate, endDate, view = 'landing', filters = {}) {
  const params = { startDate, endDate };
  const config = channelReportConfigs.organic;
  const search = String(filters.search || '').trim();
  if (view === 'query') {
    if (search) params.search = `%${search}%`;
    const [rows] = await pool.query(
      `SELECT COALESCE(NULLIF(query_text,''),'N/A') query_text,COALESCE(NULLIF(landing_page,''),'N/A') landing_page,
        SUM(clicks) clicks,SUM(impressions) impressions,
        CASE WHEN SUM(impressions)>0 THEN SUM(clicks)/SUM(impressions)*100 ELSE 0 END ctr,
        CASE WHEN SUM(impressions)>0 THEN SUM(average_position*impressions)/SUM(impressions) ELSE NULL END average_position
       FROM fact_seo_metrics WHERE metric_date BETWEEN :startDate AND :endDate AND country='query' ${search ? 'AND query_text LIKE :search' : ''}
       GROUP BY COALESCE(NULLIF(query_text,''),'N/A'),COALESCE(NULLIF(landing_page,''),'N/A') ORDER BY clicks DESC,impressions DESC,query_text`,
      params,
    );
    return rows.map((row) => ({ ...row, clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), ctr: Number(Number(row.ctr || 0).toFixed(2)), average_position: row.average_position == null ? null : Number(Number(row.average_position).toFixed(2)) }));
  }
  if (search) params.search = `%${search}%`;
  const where = [channelSourceCondition('l', config), 'DATE(l.lead_created_at) BETWEEN :startDate AND :endDate'];
  if (filters.landingPage) { params.landingPage = filters.landingPage; where.push("COALESCE(NULLIF(l.landing_page,''),'N/A')=:landingPage"); }
  if (search) where.push('(l.landing_page LIKE :search OR l.campaign_name LIKE :search OR l.keyword LIKE :search)');
  const [rows] = await pool.query(
    `SELECT COALESCE(NULLIF(l.landing_page,''),'N/A') landing_page,COUNT(*) leads,COUNT(DISTINCT NULLIF(l.normalized_phone,'')) unique_leads,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN NULLIF(l.normalized_phone,'') END) contacted,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND c.talk_duration_seconds>0) THEN NULLIF(l.normalized_phone,'') END) connected,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${qualifiedCategoryCondition('c.disposition_category')}) THEN NULLIF(l.normalized_phone,'') END) qualified_leads,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN NULLIF(l.normalized_phone,'') END) billed_leads
     FROM fact_leads l WHERE ${where.join(' AND ')} GROUP BY COALESCE(NULLIF(l.landing_page,''),'N/A') ORDER BY leads DESC,landing_page`,
    params,
  );
  const [seoRows] = await pool.query(`SELECT COALESCE(NULLIF(landing_page,''),'N/A') landing_page,SUM(clicks) clicks,SUM(impressions) impressions,CASE WHEN SUM(impressions)>0 THEN SUM(clicks)/SUM(impressions)*100 ELSE 0 END ctr,CASE WHEN SUM(impressions)>0 THEN SUM(average_position*impressions)/SUM(impressions) ELSE NULL END average_position FROM fact_seo_metrics WHERE metric_date BETWEEN ? AND ? AND (country='page' OR country IS NULL OR country='') GROUP BY COALESCE(NULLIF(landing_page,''),'N/A')`, [startDate,endDate]);
  const map = new Map(rows.map((row) => [String(row.landing_page),row]));
  for (const row of seoRows) map.set(String(row.landing_page),{ ...(map.get(String(row.landing_page)) || { landing_page: row.landing_page }), ...row });
  return Array.from(map.values()).map((row) => ({ ...row, leads: Number(row.leads || 0), unique_leads: Number(row.unique_leads || 0), contacted: Number(row.contacted || 0), connected: Number(row.connected || 0), qualified_leads: Number(row.qualified_leads || 0), billed_leads: Number(row.billed_leads || 0), clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), ctr: Number(Number(row.ctr || 0).toFixed(2)), average_position: row.average_position == null ? null : Number(Number(row.average_position).toFixed(2)) })).sort((a,b) => (b.clicks-a.clicks)||(b.leads-a.leads)||String(a.landing_page).localeCompare(String(b.landing_page)));
}

async function organicPerformancePage(startDate, endDate, view, filters, page, limit, offset, allRows = false) {
  const params = { startDate, endDate, limit, offset };
  const search = String(filters.search || '').trim();
  if (search) params.search = `%${search}%`;
  if (view === 'query') {
    const where = ["metric_date BETWEEN :startDate AND :endDate", "country='query'", "NULLIF(query_text,'') IS NOT NULL"];
    if (search) where.push('query_text LIKE :search');
    const whereSql = where.join(' AND ');
    const [[countRow]] = await pool.query(`SELECT COUNT(*) total FROM (SELECT query_text FROM fact_seo_metrics WHERE ${whereSql} GROUP BY query_text) q`, params);
    const [rows] = await pool.query(
      `SELECT query_text,SUM(clicks) clicks,SUM(impressions) impressions,
        CASE WHEN SUM(impressions)>0 THEN SUM(clicks)/SUM(impressions)*100 ELSE 0 END ctr,
        CASE WHEN SUM(impressions)>0 THEN SUM(average_position*impressions)/SUM(impressions) ELSE NULL END average_position
       FROM fact_seo_metrics WHERE ${whereSql} GROUP BY query_text ORDER BY clicks DESC,impressions DESC,query_text ${allRows ? '' : 'LIMIT :limit OFFSET :offset'}`,
      params,
    );
    return { total: Number(countRow.total || 0), page, limit, total_pages: Math.max(1, Math.ceil(Number(countRow.total || 0) / limit)), rows: rows.map((row) => ({ ...row, clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), ctr: Number(Number(row.ctr || 0).toFixed(2)), average_position: row.average_position == null ? null : Number(Number(row.average_position).toFixed(2)) })) };
  }
  const config = channelReportConfigs.organic;
  const leadWhere = [channelSourceCondition('l', config), 'DATE(l.lead_created_at) BETWEEN :startDate AND :endDate', "NULLIF(l.landing_page,'') IS NOT NULL"];
  const seoWhere = ["metric_date BETWEEN :startDate AND :endDate", "country='page'", "NULLIF(landing_page,'') IS NOT NULL"];
  if (filters.landingPage) {
    params.landingPage = filters.landingPage;
    leadWhere.push('l.landing_page=:landingPage');
    seoWhere.push('landing_page=:landingPage');
  }
  if (search) {
    leadWhere.push('(l.landing_page LIKE :search OR l.campaign_name LIKE :search OR l.keyword LIKE :search)');
    seoWhere.push('landing_page LIKE :search');
  }
  const leadWhereSql = leadWhere.join(' AND ');
  const seoWhereSql = seoWhere.join(' AND ');
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) total FROM (
       SELECT landing_page FROM fact_seo_metrics WHERE ${seoWhereSql} GROUP BY landing_page
       UNION
       SELECT l.landing_page FROM fact_leads l WHERE ${leadWhereSql} GROUP BY l.landing_page
     ) pages`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT landing_page,SUM(clicks) clicks,SUM(impressions) impressions,
       CASE WHEN SUM(impressions)>0 THEN SUM(clicks)/SUM(impressions)*100 ELSE 0 END ctr,
       CASE WHEN SUM(impressions)>0 THEN SUM(position_weight)/SUM(impressions) ELSE NULL END average_position,
       SUM(leads) leads,SUM(unique_leads) unique_leads,SUM(contacted) contacted,SUM(connected) connected,SUM(qualified_leads) qualified_leads,SUM(billed_leads) billed_leads
     FROM (
       SELECT landing_page,SUM(clicks) clicks,SUM(impressions) impressions,SUM(average_position*impressions) position_weight,
         0 leads,0 unique_leads,0 contacted,0 connected,0 qualified_leads,0 billed_leads
       FROM fact_seo_metrics WHERE ${seoWhereSql} GROUP BY landing_page
       UNION ALL
       SELECT l.landing_page,0 clicks,0 impressions,0 position_weight,COUNT(*) leads,COUNT(DISTINCT NULLIF(l.normalized_phone,'')) unique_leads,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN NULLIF(l.normalized_phone,'') END) contacted,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND c.talk_duration_seconds>0) THEN NULLIF(l.normalized_phone,'') END) connected,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_calls c WHERE c.normalized_phone=l.normalized_phone AND c.started_at>=l.lead_created_at AND c.started_at<DATE_ADD(:endDate,INTERVAL 1 DAY) AND ${qualifiedCategoryCondition('c.disposition_category')}) THEN NULLIF(l.normalized_phone,'') END) qualified_leads,
         COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM fact_bills b WHERE b.normalized_phone=l.normalized_phone AND b.bill_date>=l.lead_created_at AND b.bill_date<DATE_ADD(:endDate,INTERVAL 1 DAY)) THEN NULLIF(l.normalized_phone,'') END) billed_leads
       FROM fact_leads l WHERE ${leadWhereSql} GROUP BY l.landing_page
     ) combined GROUP BY landing_page ORDER BY clicks DESC,leads DESC,landing_page ${allRows ? '' : 'LIMIT :limit OFFSET :offset'}`,
    params,
  );
  return { total: Number(countRow.total || 0), page, limit, total_pages: Math.max(1, Math.ceil(Number(countRow.total || 0) / limit)), rows: rows.map((row) => ({ ...row, clicks: Number(row.clicks || 0), impressions: Number(row.impressions || 0), ctr: Number(Number(row.ctr || 0).toFixed(2)), average_position: row.average_position == null ? null : Number(Number(row.average_position).toFixed(2)), leads: Number(row.leads || 0), unique_leads: Number(row.unique_leads || 0), contacted: Number(row.contacted || 0), connected: Number(row.connected || 0), qualified_leads: Number(row.qualified_leads || 0), billed_leads: Number(row.billed_leads || 0) })) };
}

async function googleSpendDetails(startDate, endDate, page, limit, offset, filters = {}, allRows = false) {
  let rows = [];
  try { rows = (await fetchGoogleAdsMetricsForDateRange(startDate, endDate)).campaignRows || []; } catch (_error) {}
  const search = String(filters.search || '').trim().toLowerCase();
  rows = rows.filter((row) => !filters.campaignId || String(row.campaign_id || row.campaign_name || '') === filters.campaignId)
    .filter((row) => !search || [row.campaign_name,row.campaign_id].some((value) => String(value || '').toLowerCase().includes(search)))
    .sort((a,b) => String(b.date).localeCompare(String(a.date)) || Number(b.spend || 0)-Number(a.spend || 0));
  return { total: rows.length, total_spend: Number(rows.reduce((sum,row) => sum+Number(row.spend || 0),0).toFixed(2)), page, limit, total_pages: Math.max(1,Math.ceil(rows.length/limit)), rows: allRows ? rows : rows.slice(offset,offset+limit) };
}

app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
  index: false,
  maxAge: '7d',
}));

app.get('/api/health', async (_req, res) => {
  const [[db]] = await pool.query('SELECT DATABASE() AS db');
  res.json({ ok: true, database: db.db, generated_at: nowIso() });
});

app.get('/', (req, res) => {
  res.redirect(readSession(req) ? '/dashboard' : '/login');
});

app.get('/login', (req, res) => {
  if (readSession(req)) {
    res.redirect('/dashboard');
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.send(loginPage(csrfToken(req, res), req.query.error ? 'Invalid login details. Please try again.' : ''));
});

app.post('/api/auth/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const identifier = String(req.body?.identifier || '').trim();
  const password = String(req.body?.password || '');
  const remember = req.body?.remember === '1';

  if (!verifyCsrf(req)) {
    await logLoginAttempt(req, identifier, false, 'csrf_failed');
    res.status(400).send(loginPage(csrfToken(req, res), 'Invalid login details. Please try again.'));
    return;
  }
  if (isLocked(req, identifier)) {
    await logLoginAttempt(req, identifier, false, 'locked');
    res.status(429).send(loginPage(csrfToken(req, res), 'Invalid login details. Please try again.'));
    return;
  }

  const user = findUser(identifier);
  const valid = Boolean(user?.passwordHash && verifyPassword(password, user.passwordHash));
  recordAttempt(req, identifier, valid);
  await logLoginAttempt(req, identifier, valid, valid ? 'success' : 'invalid_credentials');

  if (!valid) {
    res.status(401).send(loginPage(csrfToken(req, res), 'Invalid login details. Please try again.'));
    return;
  }

  res.setHeader('Set-Cookie', [
    cookieLine('war_room_session', createSession(user, remember), {
      maxAge: Math.floor((remember ? REMEMBER_SESSION_DURATION_MS : SESSION_DURATION_MS) / 1000),
    }),
    cookieLine('war_room_csrf', '', { maxAge: 0, httpOnly: false }),
  ]);
  res.redirect(303, '/dashboard');
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', cookieLine('war_room_session', '', { maxAge: 0 }));
  res.json({ ok: true });
});

app.get('/api/auth/me', requireSession, (req, res) => {
  res.json({ user: { username: req.session.username, role: req.session.role } });
});

app.get('/dashboard', requireSession, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/api/sync', requireSession);
app.use('/api/dashboard', requireSession);

app.post('/api/sync/meta', async (req, res) => {
  const startDate = String(req.query.startDate || req.query.start_date || '').slice(0, 10);
  const endDate = String(req.query.endDate || req.query.end_date || startDate).slice(0, 10);
  const dateWindow = startDate && endDate ? { startDate, endDate } : {};
  res.json({ meta: await runMetaSync(dateWindow), synced_at: nowIso() });
});

app.post('/api/sync/meta/insights', async (req, res) => {
  const startDate = String(req.query.startDate || req.query.start_date || '').slice(0, 10);
  const endDate = String(req.query.endDate || req.query.end_date || startDate).slice(0, 10);
  const accountIds = commaSeparatedValues(req.query.account_ids || req.query.account_id);
  const options = { ...(startDate && endDate ? { startDate, endDate } : {}), accountIds };
  res.json({ insights: await syncMetaInsights(options), synced_at: nowIso() });
});

app.post('/api/sync/run', async (req, res) => {
  const startDate = String(req.query.startDate || req.query.start_date || '').slice(0, 10);
  const endDate = String(req.query.endDate || req.query.end_date || startDate).slice(0, 10);
  const dateWindow = startDate && endDate ? { startDate, endDate } : null;
  const source = await runSync({ dateWindow });
  const meta = await runMetaSync(dateWindow || {});
  const organic = await runOrganicSync(dateWindow || {});
  res.json({ source, meta, organic, synced_at: nowIso() });
});

app.get('/api/sync/status', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM sync_watermarks ORDER BY source_name');
  res.json({ rows, running: syncRunning, meta: await metaConnectorStatus(), meta_running: Boolean(metaSyncPromise) });
});

app.get('/api/dashboard/meta/summary', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  res.json(await metaSummaryRows(startDate, endDate));
});

app.get('/api/dashboard/meta/performance', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  const level = String(req.query.level || 'campaign').toLowerCase();
  const allRows = await metaPerformanceRows(startDate, endDate, level, {
    campaignId: String(req.query.campaign_id || ''),
    adsetId: String(req.query.adset_id || ''),
    search: String(req.query.search || ''),
  });
  res.json({
    level,
    start_date: startDate,
    end_date: endDate,
    page,
    limit,
    total: allRows.length,
    total_pages: Math.max(1, Math.ceil(allRows.length / limit)),
    rows: allRows.slice(offset, offset + limit),
  });
});

app.get('/api/dashboard/meta/leads', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  res.json({
    start_date: startDate,
    end_date: endDate,
    ...(await metaLeadDetails(startDate, endDate, page, limit, offset, {
      metric: req.query.metric,
      campaignId: String(req.query.campaign_id || ''),
      adsetId: String(req.query.adset_id || ''),
      adId: String(req.query.ad_id || ''),
      search: String(req.query.search || ''),
    })),
  });
});

app.get('/api/dashboard/meta/spend', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  res.json({
    start_date: startDate,
    end_date: endDate,
    ...(await metaSpendDetails(startDate, endDate, page, limit, offset, {
      campaignId: String(req.query.campaign_id || ''),
      adsetId: String(req.query.adset_id || ''),
      adId: String(req.query.ad_id || ''),
      search: String(req.query.search || ''),
    })),
  });
});

app.get('/api/dashboard/meta/export', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const view = String(req.query.view || 'leads').toLowerCase();
  const currentPageOnly = String(req.query.scope || '').toLowerCase() === 'current';
  const { page, limit, offset } = pageParams(req);
  const exportPage = currentPageOnly ? page : 1;
  const exportLimit = limit;
  const exportOffset = currentPageOnly ? offset : 0;
  let rows = [];
  if (view === 'spend') {
    rows = (await metaSpendDetails(startDate, endDate, exportPage, exportLimit, exportOffset, {
      campaignId: String(req.query.campaign_id || ''),
      adsetId: String(req.query.adset_id || ''),
      adId: String(req.query.ad_id || ''),
      search: String(req.query.search || ''),
    }, !currentPageOnly)).rows;
  } else if (['campaign', 'adset', 'ad'].includes(view)) {
    rows = await metaPerformanceRows(startDate, endDate, view, {
      campaignId: String(req.query.campaign_id || ''),
      adsetId: String(req.query.adset_id || ''),
      search: String(req.query.search || ''),
    });
    if (currentPageOnly) rows = rows.slice(exportOffset, exportOffset + exportLimit);
  } else {
    rows = (await metaLeadDetails(startDate, endDate, exportPage, exportLimit, exportOffset, {
      metric: req.query.metric,
      campaignId: String(req.query.campaign_id || ''),
      adsetId: String(req.query.adset_id || ''),
      adId: String(req.query.ad_id || ''),
      search: String(req.query.search || ''),
    }, !currentPageOnly)).rows;
  }
  const headers = Object.keys(rows[0] || { empty: '' });
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="war-room-meta-${view}-${currentPageOnly ? `page-${page}-` : 'all-'}${startDate}-to-${endDate}.csv"`);
  res.setHeader('X-Export-Row-Count', String(rows.length));
  res.send(csv);
});

function channelApi(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(`[war-room/channel/${req.params.channel || 'unknown'}]`, error?.message || error);
      if (!res.headersSent) res.status(500).json({ error: error?.message || String(error), rows: [] });
    }
  };
}

app.get('/api/dashboard/channel/:channel/summary', channelApi(async (req, res) => {
  const config = channelReportConfig(req.params.channel);
  if (!config) return res.status(404).json({ error: 'Unknown reporting channel' });
  const { startDate, endDate } = dateParams(req);
  return res.json(await channelSummaryRows(startDate, endDate, config));
}));

app.get('/api/dashboard/channel/:channel/performance', channelApi(async (req, res) => {
  const config = channelReportConfig(req.params.channel);
  if (!config) return res.status(404).json({ error: 'Unknown reporting channel' });
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  const view = String(req.query.view || (config.paid ? 'campaign' : 'landing')).toLowerCase();
  if (!config.paid) {
    const result = await organicPerformancePage(startDate, endDate, view, {
      landingPage: String(req.query.landing_page || ''),
      search: String(req.query.search || ''),
    }, page, limit, offset);
    return res.json({ channel: config.key, view, start_date: startDate, end_date: endDate, ...result });
  }
  const rows = await googleChannelPerformanceRows(startDate, endDate, view, {
      campaignId: String(req.query.campaign_id || ''),
      adsetId: String(req.query.adset_id || ''),
      search: String(req.query.search || ''),
    });
  return res.json({ channel: config.key, view, start_date: startDate, end_date: endDate, page, limit, total: rows.length, total_pages: Math.max(1, Math.ceil(rows.length / limit)), rows: rows.slice(offset, offset + limit) });
}));

app.get('/api/dashboard/channel/:channel/leads', channelApi(async (req, res) => {
  const config = channelReportConfig(req.params.channel);
  if (!config) return res.status(404).json({ error: 'Unknown reporting channel' });
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  return res.json({ channel: config.key, start_date: startDate, end_date: endDate, ...(await channelLeadDetails(startDate, endDate, page, limit, offset, config, {
    metric: req.query.metric,
    campaignId: String(req.query.campaign_id || ''),
    adsetId: String(req.query.adset_id || ''),
    adId: String(req.query.ad_id || ''),
    landingPage: String(req.query.landing_page || ''),
    search: String(req.query.search || ''),
  })) });
}));

app.get('/api/dashboard/channel/google-lp/spend', channelApi(async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  return res.json({ channel: 'google-lp', start_date: startDate, end_date: endDate, ...(await googleSpendDetails(startDate, endDate, page, limit, offset, {
    campaignId: String(req.query.campaign_id || ''),
    search: String(req.query.search || ''),
  })) });
}));

app.get('/api/dashboard/channel/:channel/export', channelApi(async (req, res) => {
  const config = channelReportConfig(req.params.channel);
  if (!config) return res.status(404).json({ error: 'Unknown reporting channel' });
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  const currentPageOnly = String(req.query.scope || '').toLowerCase() === 'current';
  const view = String(req.query.view || 'leads').toLowerCase();
  const exportPage = currentPageOnly ? page : 1;
  const exportLimit = currentPageOnly ? limit : 100000;
  const exportOffset = currentPageOnly ? offset : 0;
  let rows;
  if (config.paid && view === 'spend') {
    rows = (await googleSpendDetails(startDate, endDate, exportPage, exportLimit, exportOffset, {
      campaignId: String(req.query.campaign_id || ''), search: String(req.query.search || ''),
    }, !currentPageOnly)).rows;
  } else if (view === 'leads') {
    rows = (await channelLeadDetails(startDate, endDate, exportPage, exportLimit, exportOffset, config, {
      metric: req.query.metric, campaignId: String(req.query.campaign_id || ''), adsetId: String(req.query.adset_id || ''), adId: String(req.query.ad_id || ''), landingPage: String(req.query.landing_page || ''), search: String(req.query.search || ''),
    }, !currentPageOnly)).rows;
  } else {
    if (config.paid) {
      rows = await googleChannelPerformanceRows(startDate, endDate, view, { campaignId: String(req.query.campaign_id || ''), adsetId: String(req.query.adset_id || ''), search: String(req.query.search || '') });
      if (currentPageOnly) rows = rows.slice(exportOffset, exportOffset + exportLimit);
    } else {
      rows = (await organicPerformancePage(startDate, endDate, view, { landingPage: String(req.query.landing_page || ''), search: String(req.query.search || '') }, exportPage, exportLimit, exportOffset, !currentPageOnly)).rows;
    }
  }
  const headers = Object.keys(rows[0] || { empty: '' });
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="war-room-${config.key}-${view}-${currentPageOnly ? `page-${page}-` : 'all-'}${startDate}-to-${endDate}.csv"`);
  res.setHeader('X-Export-Row-Count', String(rows.length));
  return res.send(csv);
}));

app.get('/api/dashboard/summary', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  res.json(await summaryRows(startDate, endDate));
});

app.get('/api/dashboard/business', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const summary = await summaryRows(startDate, endDate);
  res.json({
    gold_purchased: summary.all_business_gold_weight,
    transactions: summary.all_business_bills_today,
    average_transaction_value: summary.all_business_bills_today
      ? Number((summary.all_business_billing_amount / summary.all_business_bills_today).toFixed(2))
      : 0,
    billing_amount: summary.all_business_billing_amount,
  });
});

app.get('/api/dashboard/marketing', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const sourceSql = canonicalSourceSql('l');
  const [leadRows] = await pool.query(
    `SELECT
       ${sourceSql} AS canonical_source,
       COUNT(*) AS leads,
       COUNT(DISTINCT l.normalized_phone) AS unique_leads
     FROM fact_leads l
     WHERE DATE(l.lead_created_at) BETWEEN ? AND ?
     GROUP BY ${sourceSql}`,
    [startDate, endDate]
  );
  const [billRows] = await pool.query(
    `SELECT
       linked.canonical_source,
       COUNT(DISTINCT linked.lead_id) AS billed_leads,
       COUNT(DISTINCT linked.bill_id) AS bill_records,
       SUM(linked.transaction_value) AS billing_amount,
       SUM(linked.gold_weight) AS gold_weight
     FROM (
       SELECT
         b.bill_id,
         SUBSTRING_INDEX(
           GROUP_CONCAT(${sourceSql} ORDER BY l.lead_created_at ASC, l.lead_id ASC SEPARATOR '\u001f'),
           '\u001f',
           1
         ) AS canonical_source,
         SUBSTRING_INDEX(
           GROUP_CONCAT(l.lead_id ORDER BY l.lead_created_at ASC, l.lead_id ASC SEPARATOR '\u001f'),
           '\u001f',
           1
         ) AS lead_id,
         MAX(b.transaction_value) AS transaction_value,
         MAX(b.gold_weight) AS gold_weight
       FROM fact_leads l
       INNER JOIN ${dedupedFactBillsSql('b')}
         ON (
           (b.customer_id IS NOT NULL AND b.customer_id <> '' AND b.customer_id = l.customer_id)
           OR (b.normalized_phone IS NOT NULL AND b.normalized_phone <> '' AND b.normalized_phone = l.normalized_phone)
         )
       AND b.bill_date >= l.lead_created_at
       WHERE DATE(l.lead_created_at) BETWEEN ? AND ?
       GROUP BY b.bill_id
     ) linked
     GROUP BY linked.canonical_source`,
    [startDate, endDate]
  );

  const rowsBySource = new Map(canonicalSources.map(([key, label]) => [
    key,
    {
      canonical_source: key,
      source: label,
      platform: key === 'META' ? 'Meta' : key.startsWith('GOOGLE') ? 'Google' : label.replace(/ Leads$/, ''),
      leads: 0,
      unique_leads: 0,
      billed_leads: 0,
      bills: 0,
      bill_records: 0,
      conversion_rate: 0,
      billing_amount: 0,
      gold_weight: 0,
    },
  ]));

  for (const row of leadRows) {
    const key = normalizedDashboardSourceFilter(row.canonical_source) || 'UNKNOWN';
    const target = rowsBySource.get(key) || rowsBySource.get('UNKNOWN');
    target.leads += Number(row.leads || 0);
    target.unique_leads += Number(row.unique_leads || 0);
  }

  for (const row of billRows) {
    const key = normalizedDashboardSourceFilter(row.canonical_source) || 'UNKNOWN';
    const target = rowsBySource.get(key) || rowsBySource.get('UNKNOWN');
    target.billed_leads += Number(row.billed_leads || 0);
    target.bills += Number(row.bill_records || 0);
    target.bill_records += Number(row.bill_records || 0);
    target.billing_amount += Number(row.billing_amount || 0);
    target.gold_weight += Number(row.gold_weight || 0);
  }

  const rows = Array.from(rowsBySource.values()).map((row) => ({
    ...row,
    conversion_rate: row.unique_leads ? Number(((row.billed_leads / row.unique_leads) * 100).toFixed(2)) : 0,
  })).sort((a, b) => (b.leads - a.leads) || (b.bills - a.bills) || a.source.localeCompare(b.source));

  res.json({ rows });
});

app.get('/api/dashboard/sales-funnel', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const summary = await summaryRows(startDate, endDate);
  res.json({
    leads: summary.unique_leads_today,
    contacted: summary.contacted_today,
    connected: summary.connected_today,
    qualified: summary.qualified_leads_today,
    visits: 0,
    bills: summary.bills_today,
    contact_rate: summary.unique_leads_today ? Number(((summary.contacted_today / summary.unique_leads_today) * 100).toFixed(2)) : 0,
    connected_rate: summary.contacted_today ? Number(((summary.connected_today / summary.contacted_today) * 100).toFixed(2)) : 0,
    conversion_rate: summary.lead_to_bill_rate,
  });
});

app.get('/api/dashboard/branches', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const { limit } = pageParams(req);
  const [rows] = await pool.query(
    `SELECT COALESCE(NULLIF(b.branch_name, ''), NULLIF(fb.branch_id, ''), 'Unknown') AS branch_name,
      COUNT(DISTINCT fb.bill_id) AS bills,
      SUM(fb.gold_weight) AS gold_weight,
      SUM(fb.transaction_value) AS billing_amount
     FROM ${dedupedFactBillsSql('fb')}
     LEFT JOIN dim_branches b
       ON b.branch_id = fb.branch_id
       OR b.branch_code = fb.branch_id
       OR b.branch_name = fb.branch_id
     WHERE DATE(fb.bill_date) BETWEEN ? AND ?
     GROUP BY COALESCE(NULLIF(b.branch_name, ''), NULLIF(fb.branch_id, ''), 'Unknown')
     ORDER BY bills DESC
     LIMIT ?`,
    [startDate, endDate, limit]
  );
  res.json({ rows });
});

app.get('/api/dashboard/customers', async (req, res) => {
  const { page, limit, offset } = pageParams(req);
  const type = req.query.type ? String(req.query.type) : null;
  const params = { limit, offset, type };
  const where = type ? 'WHERE customer_type = :type' : '';
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM fact_customer_status ${where}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM fact_customer_status ${where} ORDER BY updated_at DESC LIMIT :limit OFFSET :offset`,
    params
  );
  res.json({ rows, total: Number(countRow.total || 0), page, limit });
});

app.get('/api/dashboard/digital-sources', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const sourceSql = canonicalSourceSql('l');
  const [rows] = await pool.query(
    `SELECT
       ${sourceSql} AS canonical_source,
       l.source AS raw_source,
       l.platform,
       l.campaign_name,
       COUNT(*) AS leads,
       COUNT(DISTINCT l.normalized_phone) AS unique_leads
     FROM fact_leads l
     WHERE DATE(l.lead_created_at) BETWEEN ? AND ?
     GROUP BY ${sourceSql}, l.source, l.platform, l.campaign_name
     ORDER BY leads DESC`,
    [startDate, endDate]
  );
  res.json({ rows: decorateSourceRows(rows) });
});

app.get('/api/dashboard/marketing-spend', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  const data = await marketingSpendDetails(startDate, endDate, page, limit, offset, {
    source: req.query.source,
    search: req.query.search,
  });
  res.json({ start_date: startDate, end_date: endDate, ...data });
});

app.get('/api/dashboard/marketing-spend/export', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const result = await marketingSpendDetails(startDate, endDate, 1, 5000, 0, {
    source: req.query.source,
    search: req.query.search,
  });
  const headers = [
    'date',
    'platform',
    'ad_account',
    'campaign_id',
    'campaign_name',
    'ad_set_or_ad_group',
    'ad_or_creative',
    'impressions',
    'clicks',
    'spend',
    'leads',
    'unique_leads',
    'qualified_leads',
    'billed_leads',
    'bill_records',
    'billing_amount',
    'cpl',
    'cost_per_qualified_lead',
    'cost_per_bill',
    'roas',
    'last_synced_at',
    'sync_status',
  ];
  const csv = [
    headers.join(','),
    ...result.rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="war-room-campaign-spend-${startDate}-to-${endDate}.csv"`);
  res.send(csv);
});

app.get('/api/dashboard/loss-reasons', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const [rows] = await pool.query(
    `SELECT disposition_name AS loss_reason, COUNT(*) AS calls, COUNT(DISTINCT normalized_phone) AS customers
     FROM fact_calls
     WHERE DATE(started_at) BETWEEN ? AND ?
       AND LOWER(COALESCE(disposition_category, '')) = 'lost'
     GROUP BY disposition_name
     ORDER BY calls DESC`,
    [startDate, endDate]
  );
  res.json({ rows });
});

app.get('/api/dashboard/drilldown', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const { page, limit, offset } = pageParams(req);
  const metric = String(req.query.metric || 'leads');
  const result = await drilldown(metric, startDate, endDate, page, limit, offset, {
    source: req.query.source,
    search: req.query.search,
  });
  res.json({ metric, start_date: startDate, end_date: endDate, page, limit, total: result.total, rows: result.rows });
});

app.get('/api/dashboard/leads/:leadId/journey', async (req, res) => {
  const [[lead]] = await pool.query('SELECT * FROM fact_leads WHERE lead_id = ?', [req.params.leadId]);
  if (!lead) {
    res.status(404).json({ error: 'lead_not_found' });
    return;
  }
  const phone = lead.normalized_phone;
  const [calls] = await pool.query('SELECT * FROM fact_calls WHERE normalized_phone = ? ORDER BY started_at ASC', [phone]);
  const [followups] = await pool.query('SELECT * FROM fact_followups WHERE normalized_phone = ? ORDER BY created_at ASC', [phone]);
  const [bills] = await pool.query(`SELECT * FROM ${dedupedFactBillsSql('b')} WHERE b.normalized_phone = ? ORDER BY b.bill_date ASC`, [phone]);
  const events = [
    { at: lead.lead_created_at, type: 'Lead Generated', detail: `${lead.source || 'Unknown'} ${lead.campaign_name || ''}`.trim() },
    ...calls.map((call) => ({ at: call.started_at, type: 'Call', detail: `${call.direction} ${call.disposition_name || call.status || ''}`.trim(), call })),
    ...followups.map((f) => ({ at: f.created_at, type: 'Follow-Up', detail: `${f.reason || ''} ${f.status || ''}`.trim(), followup: f })),
    ...bills.map((bill) => ({ at: bill.bill_date, type: 'Bill Created', detail: `${bill.bill_id} ${bill.transaction_value || ''}`.trim(), bill })),
  ].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  res.json({ lead, events });
});

app.get('/api/dashboard/calls/export', async (req, res, next) => {
  const { startDate, endDate } = dateParams(req);
  const params = { startDate, endDate };
  const where = [
    'started_at >= :startDate',
    'started_at < DATE_ADD(:endDate, INTERVAL 1 DAY)',
  ];
  for (const [queryKey, column] of [
    ['direction', 'direction'],
    ['source', 'source'],
    ['agent_id', 'agent_id'],
    ['branch_id', 'branch_id'],
    ['language', 'language'],
  ]) {
    const value = String(req.query[queryKey] || '').trim();
    if (value) {
      params[queryKey] = value;
      where.push(`${column} = :${queryKey}`);
    }
  }
  const search = String(req.query.search || '').trim();
  if (search) {
    params.search = `%${search}%`;
    where.push(`(call_uuid LIKE :search OR linkedid LIKE :search OR lead_id LIKE :search
      OR normalized_phone LIKE :search OR agent_name LIKE :search OR disposition_name LIKE :search
      OR disposition_category LIKE :search)`);
  }
  const whereSql = where.join(' AND ');
  const columns = [
    'call_uuid', 'linkedid', 'lead_id', 'customer_id', 'customer_number', 'direction', 'call_type',
    'source', 'agent_id', 'agent_name', 'branch_id', 'language', 'started_at', 'answered_at', 'ended_at',
    'talk_duration_seconds', 'ring_duration_seconds', 'status', 'disposition_code', 'disposition_name',
    'disposition_category', 'recording_available', 'updated_at',
  ];
  try {
    const [[countRow]] = await pool.query(`SELECT COUNT(*) total FROM fact_calls WHERE ${whereSql}`, params);
    const total = Number(countRow.total || 0);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="call-center-calls-${startDate}-to-${endDate}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Export-Row-Count', String(total));
    res.write(`${columns.join(',')}\n`);
    let cursorStartedAt = '';
    let cursorCallUuid = '';
    let exported = 0;
    while (!res.destroyed) {
      const cursorWhere = cursorStartedAt
        ? 'AND (started_at > :cursorStartedAt OR (started_at = :cursorStartedAt AND call_uuid > :cursorCallUuid))'
        : '';
      const [rows] = await pool.query(
        `SELECT call_uuid,linkedid,lead_id,customer_id,normalized_phone customer_number,direction,call_type,
           source,agent_id,agent_name,branch_id,language,started_at,answered_at,ended_at,talk_duration_seconds,
           ring_duration_seconds,status,disposition_code,disposition_name,disposition_category,recording_available,updated_at
         FROM fact_calls WHERE ${whereSql} ${cursorWhere}
         ORDER BY started_at,call_uuid LIMIT 5000`,
        { ...params, cursorStartedAt, cursorCallUuid },
      );
      if (!rows.length) break;
      const chunk = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')).join('\n');
      if (!res.write(`${chunk}\n`) && !res.destroyed) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
      exported += rows.length;
      const last = rows.at(-1);
      cursorStartedAt = last.started_at;
      cursorCallUuid = last.call_uuid;
      if (rows.length < 5000) break;
    }
    if (!res.destroyed) res.end();
    console.log('[calls-export]', JSON.stringify({ startDate, endDate, total, exported }));
  } catch (error) {
    if (res.headersSent) res.destroy(error);
    else next(error);
  }
});

app.get('/api/dashboard/export', async (req, res) => {
  const { startDate, endDate } = dateParams(req);
  const metric = String(req.query.metric || 'leads');
  const result = await drilldown(metric, startDate, endDate, 1, 5000, 0, {
    source: req.query.source,
    search: req.query.search,
  });
  const headers = Object.keys(result.rows[0] || { empty: '' });
  const csv = [
    headers.join(','),
    ...result.rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="war-room-${metric}-${startDate}-to-${endDate}.csv"`);
  res.send(csv);
});

function verifyWebhook(req, res, next) {
  if (!INTERNAL_WEBHOOK_SECRET) {
    next();
    return;
  }
  const provided = String(req.get('x-attica-signature') || '');
  const raw = JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', INTERNAL_WEBHOOK_SECRET).update(raw).digest('hex');
  if (provided !== expected) {
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }
  next();
}

function hasValidMetaWebhookSignature(req) {
  if (!META_APP_SECRET || !req.rawBody) return false;
  const provided = String(req.get('x-hub-signature-256') || '');
  const expected = `sha256=${crypto.createHmac('sha256', META_APP_SECRET).update(req.rawBody).digest('hex')}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

async function processMetaLeadWebhook(payload) {
  const changes = (Array.isArray(payload?.entry) ? payload.entry : [])
    .flatMap((entry) => (Array.isArray(entry?.changes) ? entry.changes.map((change) => ({ entry, change })) : []))
    .filter(({ change }) => change?.field === 'leadgen' && change?.value?.leadgen_id);
  let processed = 0;
  for (const { entry, change } of changes) {
    const value = change.value || {};
    const leadgenId = String(value.leadgen_id || '');
    const eventId = `META-LEADGEN-${leadgenId}`;
    await pool.query(
      `INSERT INTO webhook_events (event_id,event_type,occurred_at,entity_id,payload,processed_at)
       VALUES (?,'meta_leadgen',FROM_UNIXTIME(?),?,?,NULL)
       ON DUPLICATE KEY UPDATE payload=VALUES(payload),received_at=CURRENT_TIMESTAMP`,
      [eventId, Number(entry.time || Math.floor(Date.now() / 1000)), leadgenId, JSON.stringify({ entry, change })],
    );
    const lead = await metaGraphPage(`/${leadgenId}`, {
      fields: 'id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic',
    });
    await upsertMetaLead(lead, {
      pageId: String(value.page_id || entry.id || ''),
      formId: String(value.form_id || lead.form_id || ''),
    });
    await forwardMetaLeadToCallCenter(lead, {
      pageId: String(value.page_id || entry.id || ''),
      formId: String(value.form_id || lead.form_id || ''),
    });
    await pool.query('UPDATE webhook_events SET processed_at=NOW() WHERE event_id=?', [eventId]);
    processed += 1;
  }
  await saveMetaSyncState('meta_leads', 'healthy', { records: processed });
  await saveMetaSyncState('meta_webhook', 'healthy', { records: processed });
  return processed;
}

app.get('/api/webhooks/meta/leadgen', (req, res) => {
  const mode = String(req.query['hub.mode'] || '');
  const providedToken = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');
  if (mode === 'subscribe' && META_WEBHOOK_VERIFY_TOKEN && providedToken === META_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    void saveMetaSyncState('meta_webhook', 'healthy', { records: 0 }).catch(() => {});
    return;
  }
  res.status(403).json({ error: 'meta_webhook_verification_failed' });
});

app.post('/api/webhooks/meta/leadgen', (req, res) => {
  if (!META_APP_SECRET) {
    res.status(503).json({ error: 'meta_app_secret_not_configured' });
    return;
  }
  if (!hasValidMetaWebhookSignature(req)) {
    res.status(401).json({ error: 'invalid_meta_signature' });
    return;
  }
  res.status(200).json({ received: true });
  void processMetaLeadWebhook(req.body).catch(async (error) => {
    console.error('[war-room/meta] leadgen webhook processing failed:', error?.message || error);
    await saveMetaSyncState('meta_leads', 'attention', { error: error?.message || String(error) }).catch(() => {});
    await saveMetaSyncState('meta_webhook', 'attention', { error: error?.message || String(error) }).catch(() => {});
  });
});

app.post('/webhooks/internal/events', verifyWebhook, async (req, res) => {
  const eventId = req.body.event_id || crypto.randomUUID();
  await pool.query(
    `INSERT INTO webhook_events (event_id, event_type, occurred_at, entity_id, payload)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), received_at = CURRENT_TIMESTAMP`,
    [eventId, req.body.event_type || 'unknown', req.body.occurred_at || null, req.body.entity_id || null, JSON.stringify(req.body)]
  );
  res.json({ ok: true, event_id: eventId });
});

async function ingestLead(req, res, source) {
  const body = req.body || {};
  const submissionId = body.submission_id || `${source}-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO fact_leads
      (lead_id, customer_name, normalized_phone, lead_created_at, lead_updated_at, source, platform, medium, campaign_name, keyword, landing_page, form_id, current_stage)
     VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, 'New')
     ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), normalized_phone=VALUES(normalized_phone), lead_updated_at=NOW(), source=VALUES(source), campaign_name=VALUES(campaign_name), keyword=VALUES(keyword), landing_page=VALUES(landing_page)`,
    [
      submissionId,
      body.name || body.customer_name || null,
      normalizePhone(body.phone || body.contact || body.contact_number),
      body.submitted_at || body.created_at || new Date(),
      source,
      body.platform || 'Website',
      body.utm_medium || null,
      body.utm_campaign || null,
      body.utm_term || body.keyword || null,
      body.page_url || body.landing_page_url || null,
      body.form_id || body.form_name || null,
    ]
  );
  res.json({ ok: true, lead_id: submissionId });
}

app.post('/webhooks/leads/website', verifyWebhook, (req, res) => ingestLead(req, res, 'Website Direct'));
app.post('/webhooks/leads/blog', verifyWebhook, (req, res) => ingestLead(req, res, 'Blog'));

app.get('/index.html', (_req, res) => {
  res.redirect('/dashboard');
});

app.use((err, _req, res, _next) => {
  console.error('[war-room]', err);
  res.status(500).json({ error: 'internal_error' });
});

await migrate();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`attica-war-room listening on ${PORT}`);
  runSync()
    .then(async (result) => {
      console.log('[sync:first]', JSON.stringify(result));
      if (META_STARTUP_SYNC) console.log('[meta-sync:first]', JSON.stringify(await runMetaSync()));
      if (GOOGLE_ORGANIC_STARTUP_SYNC) console.log('[organic-sync:first]', JSON.stringify(await runOrganicSync()));
    })
    .catch((error) => console.error('[sync:first]', error));
  setInterval(() => {
    runSync().then((result) => console.log('[sync]', JSON.stringify(result))).catch((error) => console.error('[sync]', error));
  }, SYNC_INTERVAL_MS).unref();
  setInterval(() => {
    runMetaSync().then((result) => console.log('[meta-sync]', JSON.stringify(result))).catch((error) => console.error('[meta-sync]', error));
  }, META_SYNC_INTERVAL_MS).unref();
  setInterval(() => {
    runOrganicSync().then((result) => console.log('[organic-sync]', JSON.stringify(result))).catch((error) => console.error('[organic-sync]', error));
  }, GOOGLE_ORGANIC_SYNC_INTERVAL_MS).unref();
});
