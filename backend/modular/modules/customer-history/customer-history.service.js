import { normalizeIndianPhone } from '../../shared/phone.js';
import { readIdentity, emptyProfile } from './customer-history.validation.js';

export function createCustomerHistoryService({ repository, serializeCalls, serializeIntakes, buildProfile }) {
  if (!repository || !serializeCalls || !serializeIntakes || !buildProfile) throw new Error('Customer History dependencies are required');
  async function resolve(phone, customerId = '') {
    if (!phone && !customerId) return '';
    if (customerId) {
      const linked = normalizeIndianPhone(await repository.resolveByCustomerId(customerId));
      if (linked) return linked;
    }
    if (!phone) return '';
    return normalizeIndianPhone(await repository.resolveByPhone(phone)) || phone;
  }
  async function calls(query, limit) {
    const requested = String(query?.phone || '').replace(/[^0-9]/g, '');
    if (!requested || requested.length < 5) return { error:'Invalid phone', results:[] };
    const phone = await resolve(normalizeIndianPhone(requested));
    const rows = await repository.calls(phone, limit);
    return { phone: requested, total: rows.length, results: await serializeCalls(rows) };
  }
  return {
    resolve,
    callsByPhone: (query) => calls(query, 100),
    callHistory: (query) => calls(query, 200),
    async intakes(query) {
      const requested = normalizeIndianPhone(query?.phone);
      const phone = await resolve(requested);
      if (!phone) return { phone:'', total:0, results:[] };
      const rows = await repository.intakes(phone);
      return { phone, total:rows.length, results:rows.map(serializeIntakes) };
    },
    async profile(query) {
      const identity = readIdentity(query);
      if ((!identity.phone || identity.phone.length < 5) && !identity.customerId) return emptyProfile();
      return buildProfile(identity.phone, identity.customerId);
    },
  };
}
