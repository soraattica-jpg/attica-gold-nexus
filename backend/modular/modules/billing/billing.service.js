import { boundedLimit, truthy } from './billing.validation.js';

export function createBillingService(repository) {
  return {
    async list(query = {}) {
      const date = repository.normalizeDate(query.date);
      const limit = boundedLimit(query.limit, 5000, 10000);
      const force = truthy(query.force, ['refresh']);
      const rows = await repository.listRows(date, limit, { force });
      const lastSyncedAt = repository.toIsoString(await repository.lastSyncedAt(date));
      return { date, source: 'atticagold.biz', total: rows.length, results: rows, lastSyncedAt };
    },

    async lookup(query = {}) {
      const contact = repository.normalizeContact(query.contact);
      const strict = truthy(query.strict);
      if (!contact) return [];

      await repository.syncIfStale();
      const cachedRemoteRows = await repository.cachedRemoteByPhone(contact, 100);
      if (strict && cachedRemoteRows.length > 0) return cachedRemoteRows;

      if (!strict) {
        const localRows = await repository.localByPhone(contact, 100);
        if (cachedRemoteRows.length > 0 || localRows.length > 0) return [...cachedRemoteRows, ...localRows];
      }

      try {
        const response = await repository.remoteLookup(contact, 2500);
        if (response?.ok) {
          if (repository.hasPayloadRows(response.payload)) return response.payload;
          if (strict) return [];
        }
      } catch (_error) {
        if (strict) return [];
      }

      return repository.localByPhone(contact, 100);
    },
  };
}
