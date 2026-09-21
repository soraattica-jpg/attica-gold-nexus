import { normalizeSmsMobile } from '../../integrations/sms/providers/kaleyra.client.js';
import { clean, firstSmsValue, normalizeSmsDateTime, normalizeSmsDeliveryStatus } from './sms.validation.js';

export function createSmsService(repository, provider, options = {}) {
  const createClientId = options.createClientId || (() => `attica-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return {
    async send(body = {}) {
      const { phone, branchId } = body;
      if (!phone || !branchId) return { status: 400, payload: { error: 'Phone and branchId required' } };
      const branch = await repository.getBranch(branchId);
      if (!branch) return { status: 404, payload: { error: 'Branch not found' } };
      const branchUrl = clean(branch.bitly_url || branch.map_url || branch.url, 1000);
      if (!branchUrl) return { status: 400, payload: { error: 'Branch map URL unavailable' } };
      const message = `Dear Customer, Thank you for choosing Attica Gold Company, Click the link to find your nearest branch: ${branchUrl}`;
      const clientMessageId = createClientId();
      const logId = await repository.createQueued({ phone, branchId, branchName: branch.branchName, message, provider: provider.provider, messageType: provider.smsType, source: 'API', clientMessageId });
      try {
        const providerResult = await provider.send({ phone, message, clientMessageId });
        const providerMessageId = provider.getMessageId(providerResult);
        await repository.markSent(logId, providerMessageId, providerResult);
        return { status: 200, payload: { success: true, message: `SMS sent to ${phone}`, branchUrl, bitlyUrl: branch.bitly_url || '', provider: provider.provider, providerMessageId: providerMessageId || null, providerMessage: providerResult?.message || null } };
      } catch (error) {
        try { await repository.markFailed(logId, String(error?.message || error).slice(0, 255)); } catch (updateError) { options.logger?.error?.('[sms] failed to record send error:', updateError?.message || updateError); }
        throw error;
      }
    },

    async list(query = {}) {
      const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 200, 1), 1000);
      return repository.list(limit);
    },

    async delivery(payload) {
      const expectedToken = provider.readDlrToken();
      const suppliedToken = firstSmsValue(payload, 'token');
      if (!expectedToken || suppliedToken !== expectedToken) return { status: 401, payload: { error: 'Unauthorized' } };
      const clientMessageId = firstSmsValue(payload, 'client_id', 'ref', 'custom', 'custom1').replace(/[?]+$/, '');
      const providerMessageId = firstSmsValue(payload, 'message_id', 'sid', 'id');
      const recipient = firstSmsValue(payload, 'recipient', 'mobile', 'to');
      const rawStatus = firstSmsValue(payload, 'status', 'status_trace');
      const deliveredAt = firstSmsValue(payload, 'delivered', 'delivered_at', 'delivat');
      const deliveryStatus = normalizeSmsDeliveryStatus(rawStatus, deliveredAt);
      let rowId = clientMessageId ? await repository.findByClientId(clientMessageId) : null;
      if (!rowId && providerMessageId) rowId = await repository.findByProviderId(providerMessageId);
      if (!rowId && recipient) {
        const normalizedRecipient = normalizeSmsMobile(recipient);
        if (normalizedRecipient) rowId = await repository.findPendingByRecipient(normalizedRecipient.slice(-10));
      }
      if (!rowId) return { status: 200, payload: { success: true, matched: false } };
      const stored = { ...payload };
      delete stored.token;
      if (stored._query && typeof stored._query === 'object') { stored._query = { ...stored._query }; delete stored._query.token; }
      await repository.updateDelivery(rowId, {
        status: deliveryStatus === 'delivered' ? 'delivered' : deliveryStatus === 'failed' ? 'failed' : 'sent',
        deliveryStatus,
        providerMessageId,
        rawStatus,
        reason: firstSmsValue(payload, 'description', 'reason', 'status_trace'),
        deliveredAt: normalizeSmsDateTime(deliveredAt),
        submittedAt: normalizeSmsDateTime(firstSmsValue(payload, 'submittime', 'submit_time', 'submitat')),
        sentAt: normalizeSmsDateTime(firstSmsValue(payload, 'sent_time', 'senttime', 'sentat')),
        statusUpdatedAt: normalizeSmsDateTime(firstSmsValue(payload, 'status_time', 'delivered', 'delivered_at', 'delivat')),
        country: firstSmsValue(payload, 'country_name', 'country'),
        isoCode: firstSmsValue(payload, 'iso_code', 'iso'),
        network: firstSmsValue(payload, 'network', 'operator'),
        cost: firstSmsValue(payload, 'price', 'credits', 'cost'),
        units: firstSmsValue(payload, 'units'),
        messageType: firstSmsValue(payload, 'type', 'category'),
        source: firstSmsValue(payload, 'source'),
        serializedPayload: JSON.stringify(stored).slice(0, 200000),
      });
      return { status: 200, payload: { success: true, matched: true } };
    },
  };
}
