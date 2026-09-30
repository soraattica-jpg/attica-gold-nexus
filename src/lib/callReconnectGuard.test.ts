import { describe, expect, it } from "vitest";

import {
  RECENT_CALL_RECONNECT_COOLDOWN_MS,
  createRecentEndedCustomer,
  getActiveRecentEndedCustomer,
  isReconnectSuppressed,
} from "@/lib/callReconnectGuard";

describe("callReconnectGuard", () => {
  it("creates a recent-ended customer cooldown for valid phone numbers", () => {
    const record = createRecentEndedCustomer("+91 98765 43210", 1_000);

    expect(record).toEqual({
      phone: "9876543210",
      until: 1_000 + RECENT_CALL_RECONNECT_COOLDOWN_MS,
    });
  });

  it("suppresses reconnects only while the cooldown is active for the same phone", () => {
    const record = createRecentEndedCustomer("9876543210", 5_000, 20_000);

    expect(isReconnectSuppressed("9876543210", record, 10_000)).toBe(true);
    expect(isReconnectSuppressed("9123456789", record, 10_000)).toBe(false);
    expect(getActiveRecentEndedCustomer(record, 30_000)).toBeNull();
    expect(isReconnectSuppressed("9876543210", record, 30_000)).toBe(false);
  });
});
