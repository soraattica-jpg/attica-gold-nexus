import { getResponseCacheKey, shouldBypassResponseCache } from './seo-marketing.cache.js';
import { getKolkataDateRange, normalizeSeoMarketingQuery } from './seo-marketing.validation.js';

function canAccess(role) {
  return ['superadmin', 'seo'].includes(String(role || '').trim().toLowerCase());
}

function assertAccess(role) {
  if (!canAccess(role)) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
}

export function createSeoMarketingService({ repository, responseCache, getBusinessDate }) {
  if (!repository || !responseCache || typeof getBusinessDate !== 'function') {
    throw new Error('seo-marketing service requires repository, responseCache and getBusinessDate');
  }

  const normalize = (query) => normalizeSeoMarketingQuery(query, getBusinessDate());
  return {
    getDateRange(query) {
      return getKolkataDateRange(query, getBusinessDate());
    },
    async getDashboard({ role, query }) {
      assertAccess(role);
      const normalizedQuery = normalize(query);
      const key = getResponseCacheKey(normalizedQuery);
      if (!shouldBypassResponseCache(normalizedQuery)) {
        const cached = responseCache.get(key);
        if (cached) return cached;
      }
      const payload = await repository.getDashboard(normalizedQuery);
      responseCache.set(key, payload);
      return payload;
    },
    async getLeadToBillSummary({ role, query }) {
      assertAccess(role);
      return repository.getLeadToBillSummary(normalize(query));
    },
    async getLeadToBillDetails({ role, query }) {
      assertAccess(role);
      return repository.getLeadToBillDetails(normalize(query));
    },
    async getGoogleStatus({ role, query }) {
      if (String(role || '').trim().toLowerCase() !== 'superadmin') {
        const error = new Error('Forbidden');
        error.status = 403;
        throw error;
      }
      return repository.getGoogleStatus(query);
    },
    async getSpend({ role, query }) {
      assertAccess(role);
      return repository.getSpend(normalize(query));
    },
    async exportSpend({ role, query }) {
      assertAccess(role);
      return repository.exportSpend(normalize(query));
    },
    async exportLeads({ role, query }) {
      assertAccess(role);
      return repository.exportLeads(normalize(query));
    },
  };
}
