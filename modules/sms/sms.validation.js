export const clean = (value, max = 1000) => String(value ?? '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, max);

export function normalizeSmsDeliveryStatus(value, deliveredAt = '') {
  const status = String(value || '').trim().toLowerCase().replace(/[_\s-]+/g, '');
  if (deliveredAt || ['delivered', 'delivrd', 'deliverysuccess'].includes(status)) return 'delivered';
  if (['undelivered', 'undelivrd', 'notsent', 'rejected', 'rejectd', 'failed', 'expired', 'deleted'].includes(status)) return 'failed';
  if (['sent', 'submitted', 'accepted', 'queued', 'awaitingdlr', 'enroute', 'acknowledged'].includes(status)) return 'submitted';
  return status ? status.slice(0, 32) : 'unknown';
}

export function normalizeSmsDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const offsetMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}:?\d{2})$/);
  if (offsetMatch) {
    const normalizedOffset = offsetMatch[3].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2');
    const parsed = new Date(`${offsetMatch[1]}T${offsetMatch[2]}${normalizedOffset}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 19).replace('T', ' ');
  }
  const localIndiaMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (localIndiaMatch) {
    const [, year, month, day, hour, minute, second] = localIndiaMatch;
    const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - (5.5 * 60 * 60 * 1000);
    return new Date(utc).toISOString().slice(0, 19).replace('T', ' ');
  }
  const numeric = Number(raw);
  const date = Number.isFinite(numeric) && numeric > 1000000000 ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric) : new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 19).replace('T', ' ');
}

export function firstSmsValue(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

export function parseSmsCallbackPayload(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  return { ...query, ...body, _query: query, _body: body };
}
