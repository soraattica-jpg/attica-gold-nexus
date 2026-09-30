import { toDatabaseDateTime } from '../../shared/date.js';
import { validateBroadcast, serializeAdminBroadcastRecord, adminBroadcastAppliesToAgent,
  getAdminBroadcastExpiryDate, normalizeAgentId, parsePositiveInteger } from './admin-messages.validation.js';

export function createAdminMessagesService({ repository, refreshState, events, invalidateAgents = () => {}, clock = () => new Date(), logger = console }) {
  if (!events?.publish || !refreshState?.get || !refreshState?.set) throw new Error('Explicit event sink and shared refresh state are required');
  // Events invalidate a display; they carry no customer or message text. The
  // transport reloads persisted state, so reconnects and reordered events work.
  async function publish(event) {
    try { await events.publish(event); }
    catch { logger.error(JSON.stringify({ event: 'admin_message_delivery_error', kind: event.kind })); }
  }
  function updateRefresh(reason, scope = 'agents') {
    const now = clock();
    const state = { token: String(now.getTime()), scope, reason, triggeredAt: now.toISOString() };
    refreshState.set(state);
    return state;
  }
  return {
    getRefresh: () => refreshState.get(),
    async requestRefresh(body) {
      const scope = ['agents', 'all'].includes(String(body?.scope || '').toLowerCase()) ? String(body.scope).toLowerCase() : 'agents';
      const state = updateRefresh(String(body?.reason || '').slice(0, 255), scope);
      await publish({ kind: 'refresh', scope });
      return { success: true, ...state };
    },
    async current(query) {
      const row = await repository.active();
      const agentId = normalizeAgentId(query?.agentId);
      if (!agentId) return { active: Boolean(row), message: row?.message || '', broadcast: serializeAdminBroadcastRecord(row) };
      const agent = await repository.agent(agentId);
      const applies = adminBroadcastAppliesToAgent(row, agent);
      const privateMessage = String(agent?.admin_message || '').trim();
      const message = [applies ? String(row?.message || '').trim() : '', privateMessage]
        .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join('  •  ');
      return { active: applies, message, broadcast: applies ? serializeAdminBroadcastRecord(row) : null };
    },
    async history(query) {
      const limit = Math.max(1, Math.min(100, parsePositiveInteger(query?.limit, 20)));
      return (await repository.history(limit)).map(serializeAdminBroadcastRecord);
    },
    async send(body) {
      const { message, recipientScope, expiry } = validateBroadcast(body);
      const id = String(body?.sentById || '').trim().slice(0, 80) || null;
      const name = String(body?.sentByName || '').trim().slice(0, 160) || null;
      const expiresAt = getAdminBroadcastExpiryDate(expiry, clock().getTime());
      // Preserve the legacy query sequence. Atomicity improvements must be a
      // separate reviewed change; history includes superseded messages.
      await repository.clear(id, name);
      const row = await repository.insert([message, recipientScope, expiry, expiresAt ? toDatabaseDateTime(expiresAt.toISOString()) : null, id, name]);
      const state = updateRefresh('admin-broadcast-sent');
      await publish({ kind: 'broadcast', scope: recipientScope });
      return { success: true, broadcast: serializeAdminBroadcastRecord(row), ...state };
    },
    async clear(body) {
      const id = String(body?.clearedById || '').trim().slice(0, 80) || null;
      const name = String(body?.clearedByName || '').trim().slice(0, 160) || null;
      const result = await repository.clear(id, name);
      const state = updateRefresh('admin-broadcast-cleared');
      await publish({ kind: 'clear', scope: 'all' });
      return { success: true, cleared: Number(result?.affectedRows || 0), ...state };
    },
    async individual(id, body) {
      const message = String(body.adminMessage || '').trim().slice(0, 500) || null;
      await repository.individual(id, message);
      invalidateAgents();
      await publish({ kind: 'individual', agentId: id });
      return { success: true };
    },
  };
}
