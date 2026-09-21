export function normalizeSmsMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return local.length === 10 ? `91${local}` : '';
}

export function getKaleyraMessageId(result) {
  return String(result?.data?.[0]?.message_id || result?.data?.[0]?.id || result?.message_id || result?.id || '').trim();
}

export function createKaleyraClient(options) {
  const {
    apiDomain,
    sender,
    smsType,
    templateId,
    publicBaseUrl,
    readApiKey,
    readSid,
    readDlrToken,
    fetchImpl = fetch,
  } = options;
  return {
    provider: 'kaleyra',
    smsType,
    readDlrToken,
    async send({ phone, message, clientMessageId }) {
      const apiKey = readApiKey();
      const sid = readSid();
      if (!apiKey || !sid) throw new Error('Kaleyra API credentials are not configured');
      const mobiles = normalizeSmsMobile(phone);
      if (!mobiles) throw new Error('Invalid Indian mobile number');
      const callbackToken = readDlrToken();
      if (!callbackToken) throw new Error('SMS delivery callback token is not configured');
      const callbackUrl = `${String(publicBaseUrl).replace(/\/+$/, '')}/api/sms/dlr?token=${encodeURIComponent(callbackToken)}&client_id=${encodeURIComponent(clientMessageId)}`;
      const payload = {
        to: `+${mobiles}`,
        sender,
        type: smsType,
        channel: 'SMS',
        body: message,
        template_id: templateId,
        ref: clientMessageId,
        callback: { url: callbackUrl, method: 'GET' },
      };
      const response = await fetchImpl(`${String(apiDomain).replace(/\/+$/, '')}/v2/${encodeURIComponent(sid)}/messages`, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); } catch { result = { raw }; }
      const providerError = result?.success === false || Boolean(result?.error && Object.keys(result.error).length) || Boolean(result?.code && /^E/i.test(String(result.code)));
      if (!response.ok || providerError) {
        const detail = String(result?.message || result?.error?.message || result?.error || raw || `HTTP ${response.status}`).slice(0, 500);
        throw new Error(`Kaleyra rejected SMS: ${detail}`);
      }
      return result;
    },
    getMessageId: getKaleyraMessageId,
  };
}
