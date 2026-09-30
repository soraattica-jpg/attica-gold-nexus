export function createBillingRepository(adapters) {
  const required = [
    'normalizeDate',
    'normalizeContact',
    'listRows',
    'lastSyncedAt',
    'toIsoString',
    'syncIfStale',
    'cachedRemoteByPhone',
    'localByPhone',
    'remoteLookup',
    'hasPayloadRows',
  ];
  for (const key of required) {
    if (typeof adapters?.[key] !== 'function') throw new Error(`Billing adapter missing: ${key}`);
  }
  return adapters;
}
