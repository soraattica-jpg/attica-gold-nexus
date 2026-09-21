import { toApiIsoString } from '../../shared/date.js';
const DISPLAY_TIME_ZONE = 'Asia/Kolkata';
export const ADMIN_BROADCAST_SCOPES = new Set(['all', 'online', 'incoming', 'outgoing', 'follow-up', 'manual-dial']);
export const ADMIN_BROADCAST_EXPIRIES = new Set(['until-cleared', '30-minutes', '1-hour', '2-hours', 'end-of-day']);
export function serializeAdminBroadcastRecord(row) {
  if (!row) return null;
  return {
    id: Number(row.id || 0) || undefined,
    message: String(row.message || ''),
    recipientScope: String(row.recipient_scope || 'all'),
    expiry: String(row.expiry_code || 'until-cleared'),
    expiresAt: toApiIsoString(row.expires_at) || null,
    sentById: String(row.sent_by_id || ''),
    sentByName: String(row.sent_by_name || ''),
    sentAt: toApiIsoString(row.sent_at) || '',
    clearedAt: toApiIsoString(row.cleared_at) || null,
    clearedById: String(row.cleared_by_id || ''),
    clearedByName: String(row.cleared_by_name || ''),
    active: Number(row.is_active || 0) === 1,
  };
}
export function adminBroadcastAppliesToAgent(row, agent) {
  if (!row || !agent || String(agent.role || '').toLowerCase() !== 'agent') return false;
  if (!(agent.is_logged_in === 1 || agent.is_logged_in === true || agent.is_logged_in === '1')) return false;
  const scope = String(row.recipient_scope || 'all').toLowerCase();
  if (scope === 'all' || scope === 'online') return true;
  if (scope === 'incoming') return Number(agent.incoming_access) !== 0;
  if (scope === 'outgoing') return Number(agent.outgoing_access) !== 0;
  if (scope === 'follow-up') return Number(agent.follow_up_access) !== 0;
  if (scope === 'manual-dial') return Number(agent.outgoing_access) !== 0 && String(agent.status || '').toLowerCase() === 'manual-outgoing';
  return false;
}
export function getAdminBroadcastExpiryDate(expiryCode, now = Date.now()) {
  const durationMs = {
    '30-minutes': 30 * 60 * 1000,
    '1-hour': 60 * 60 * 1000,
    '2-hours': 2 * 60 * 60 * 1000,
  }[expiryCode];
  if (durationMs) return new Date(now + durationMs);
  if (expiryCode === 'end-of-day') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: DISPLAY_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(now));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) {
      const nextDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
      const nextDate = nextDay.toISOString().slice(0, 10);
      return new Date(`${nextDate}T00:00:00+05:30`);
    }
  }
  return null;
}
export function normalizeAgentId(agentId) {
  const value = String(agentId || '').trim().toUpperCase();
  if (!value || value === 'NONE' || value === 'NO AGENT' || value === 'UNKNOWN') {
    return '';
  }
  return value;
}
export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class MessageValidationError extends Error {}
export function validateBroadcast(body) {
 const message = String(body?.message || '').trim().slice(0, 500);
 const recipientScope = String(body?.recipientScope || 'all').trim().toLowerCase();
 const expiry = String(body?.expiry || 'until-cleared').trim().toLowerCase();
 if (!message) throw new MessageValidationError('Broadcast message is required');
 if (!ADMIN_BROADCAST_SCOPES.has(recipientScope)) throw new MessageValidationError('Invalid recipient group');
 if (!ADMIN_BROADCAST_EXPIRIES.has(expiry)) throw new MessageValidationError('Invalid expiry option');
 return { message, recipientScope, expiry };
}
export function isMessageOnlyUpdate(body) {
 return body && typeof body === 'object' && Object.keys(body).length === 1 && body.adminMessage !== undefined;
}
