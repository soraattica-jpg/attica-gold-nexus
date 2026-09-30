import { normalizePhoneNumber } from "@/lib/phone";

export const RECENT_CALL_RECONNECT_COOLDOWN_MS = 60_000;

export type RecentEndedCustomer = {
  phone: string;
  until: number;
};

export function createRecentEndedCustomer(
  phone: string | null | undefined,
  now = Date.now(),
  cooldownMs = RECENT_CALL_RECONNECT_COOLDOWN_MS,
): RecentEndedCustomer | null {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) return null;

  return {
    phone: normalizedPhone,
    until: now + Math.max(1_000, cooldownMs),
  };
}

export function getActiveRecentEndedCustomer(
  customer: RecentEndedCustomer | null | undefined,
  now = Date.now(),
): RecentEndedCustomer | null {
  if (!customer) return null;
  return customer.until > now ? customer : null;
}

export function isReconnectSuppressed(
  phone: string | null | undefined,
  customer: RecentEndedCustomer | null | undefined,
  now = Date.now(),
): boolean {
  const activeCustomer = getActiveRecentEndedCustomer(customer, now);
  if (!activeCustomer) return false;
  return normalizePhoneNumber(phone) === activeCustomer.phone;
}
