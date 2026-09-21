import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { createBillingModule } from '../modules/billing/index.js';
import { createPreviewReadAuthorization } from '../middleware/preview-read-auth.js';

const normalizeDate = value => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? '' : text;
};
const normalizeContact = value => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : '';
};
const iso = value => value ? new Date(value).toISOString() : '';
const remoteRow = row => ({
  type: row.customer_type || '',
  walkinType: row.walkin_type || row.customer_type || '',
  remoteId: row.remote_id || '',
  customerName: row.customer_name || '',
  contact: normalizeContact(row.contact),
  branch: row.branch || '',
  date: row.record_date instanceof Date ? row.record_date.toISOString().slice(0, 10) : String(row.record_date || '').slice(0, 10),
  time: String(row.record_time || ''),
  status: row.status || '',
  source: row.source_attribution || '',
  sourceAttribution: row.source_attribution || '',
  billId: row.bill_id || row.remote_id || '',
  transactionStatus: row.transaction_status || '',
  dispositionCategory: 'Billed',
  grossW: row.gross_w || '',
  netW: row.net_w || '',
  billAmount: Math.max(0, Number(row.billing_amount) || 0),
  firstAgentId: row.attributed_agent_id || '',
  firstAgentName: row.attributed_agent_name || '',
  attributedAgentId: row.attributed_agent_id || '',
  attributedAgentName: row.attributed_agent_name || '',
  totalTalkSeconds: Number(row.total_talk_seconds) || 0,
  connectedCallCount: Number(row.connected_call_count) || 0,
  attributionWindowStart: iso(row.attribution_window_start),
  attributionWindowEnd: iso(row.attribution_window_end),
  attributionMethod: row.attribution_method || '',
  attributionReason: row.attribution_reason || '',
  attributedAt: iso(row.attributed_at),
});

export async function createPreviewBilling() {
  const config = JSON.parse(readFileSync(new URL('../.private/billing-db.json', import.meta.url), 'utf8'));
  if (config.host !== '127.0.0.1' || config.database !== 'attica_next_billing' || config.user !== 'attica_billing_read') {
    throw new Error('Billing requires isolated read-only staging database');
  }
  const db = mysql.createPool({ ...config, connectionLimit: 2, waitForConnections: true, queueLimit: 20, connectTimeout: 3000, multipleStatements: false });
  await db.query('SELECT 1');
  const listRows = async (date, limit) => {
    if (!date) return [];
    const [rows] = await db.query(`SELECT * FROM attica_remote_customer_data
      WHERE record_date=? AND LOWER(TRIM(status)) IN ('billed','release')
      ORDER BY record_date DESC, record_time DESC, remote_id DESC LIMIT ?`, [date, limit]);
    return rows.filter(row => normalizeContact(row.contact) && row.attributed_agent_id).map(remoteRow);
  };
  const lastSyncedAt = async date => {
    const [[row]] = await db.query('SELECT MAX(synced_at) AS last_synced_at FROM attica_remote_customer_data WHERE record_date=?', [date]);
    return row?.last_synced_at || null;
  };
  const cachedRemoteByPhone = async (phone, limit) => {
    const [rows] = await db.query(`SELECT * FROM attica_remote_customer_data
      WHERE RIGHT(REGEXP_REPLACE(IFNULL(contact,''),'[^0-9]',''),10)=?
      ORDER BY record_date DESC, record_time DESC, remote_id DESC LIMIT ?`, [phone, limit]);
    return rows.map(remoteRow);
  };
  const localByPhone = async (phone, limit) => {
    const [rows] = await db.query(`SELECT * FROM attica_intake_forms WHERE normalized_phone=?
      ORDER BY COALESCE(last_saved_at,updated_at,created_at) DESC, updated_at DESC, created_at DESC LIMIT ?`, [phone, limit]);
    return rows.map(row => {
      const recordedAt = row.created_at || row.last_saved_at || row.updated_at;
      return { customerName: row.customer_name || row.caller_name || '', contact: normalizeContact(row.normalized_phone), type: row.business_type || row.purpose || '', branch: row.branch || '', date: recordedAt ? new Date(recordedAt).toISOString().slice(0, 10) : '', time: recordedAt ? new Date(recordedAt).toISOString().slice(11, 19) : '', status: row.callback_status || row.form_status || '', dispositionCategory: row.callback_status || row.form_status || '', grossW: row.grams || '', walkinType: row.purpose || '', firstAgentName: row.agent_name || '' };
    });
  };
  const actors = JSON.parse(readFileSync(new URL('../.private/message-actors.json', import.meta.url), 'utf8'));
  return {
    ...createBillingModule({
      normalizeDate,
      normalizeContact,
      listRows,
      lastSyncedAt,
      toIsoString: iso,
      syncIfStale: async () => 0,
      cachedRemoteByPhone,
      localByPhone,
      remoteLookup: async () => ({ ok: true, payload: [] }),
      hasPayloadRows: payload => Array.isArray(payload) ? payload.length > 0 : Boolean(payload && typeof payload === 'object' && (Array.isArray(payload.data) ? payload.data.length : Object.keys(payload).length)),
    }),
    authorize: createPreviewReadAuthorization(actors),
    close: () => db.end(),
  };
}
