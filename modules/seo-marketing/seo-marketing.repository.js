const METHODS = [
  'getDashboard',
  'getLeadToBillSummary',
  'getLeadToBillDetails',
  'getGoogleStatus',
  'getSpend',
  'exportSpend',
  'exportLeads',
];

export function createSeoMarketingRepository(adapters = {}) {
  for (const method of METHODS) {
    if (typeof adapters[method] !== 'function') {
      throw new Error(`seo-marketing repository requires ${method} adapter`);
    }
  }
  return Object.fromEntries(METHODS.map((method) => [method, (...args) => adapters[method](...args)]));
}
