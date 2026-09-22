export const TATA_NEW = Object.freeze({
  code: 'TATA_NEW',
  peer: 'TATA_NEW',
  pilot: '8065200220',
  didStart: '8065200221',
  didEnd: '8065200399',
  fan: '203892041',
  customerIp: '10.54.137.22',
  network: '10.54.137.20/30',
  gateway: '10.54.137.21',
  sbcIp: '10.79.212.38',
  mediaNetworks: ['10.79.166.0/28', '10.79.165.208/28'],
  bandwidthMbps: 6,
  channels: 60,
  outboundChannelLimit: 50,
  direction: 'bidirectional',
  role: 'planned-primary-outbound',
  authentication: 'awaiting-tata-confirmation',
  incomingContext: 'from-tata-new',
});

export function normalizeTataNewDid(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 8 && digits.startsWith('65200')) digits = `80${digits}`;
  return digits;
}

export function isTataNewDid(value) {
  const did = normalizeTataNewDid(value);
  if (!/^8065200\d{3}$/.test(did)) return false;
  const suffix = Number(did.slice(-3));
  return suffix >= 220 && suffix <= 399;
}

export function isAuthorizedTataNewCli(value) {
  const did = normalizeTataNewDid(value);
  if (!/^8065200\d{3}$/.test(did)) return false;
  const suffix = Number(did.slice(-3));
  return suffix >= 221 && suffix <= 399;
}
