import { describe, expect, it } from "vitest";

import {
  canReceiveAutoDialAssignmentsForStatus,
  canReceiveIncomingCallsForStatus,
  canReceiveTransferredCalls,
  getAgentStatusLabel,
  isBreakStatus,
} from "@/lib/agentStatus";

describe("agentStatus", () => {
  it("allows only follow-up agents to receive auto dial assignments", () => {
    expect(canReceiveAutoDialAssignmentsForStatus("follow-up")).toBe(true);
    expect(canReceiveAutoDialAssignmentsForStatus("active")).toBe(false);
    expect(canReceiveAutoDialAssignmentsForStatus("manual-outgoing")).toBe(false);
    expect(canReceiveAutoDialAssignmentsForStatus("on-break")).toBe(false);
    expect(canReceiveAutoDialAssignmentsForStatus("inactive")).toBe(false);
    expect(canReceiveAutoDialAssignmentsForStatus(undefined)).toBe(false);
  });

  it("keeps follow-up labels stable", () => {
    expect(getAgentStatusLabel("follow-up")).toBe("Follow-Up");
    expect(getAgentStatusLabel("manual-outgoing")).toBe("Manual Dial");
    expect(getAgentStatusLabel("lunch-break")).toBe("Lunch Break");
    expect(getAgentStatusLabel("restroom-break")).toBe("Rest Break");
  });

  it("allows incoming calls only for active and available states", () => {
    expect(canReceiveIncomingCallsForStatus("active")).toBe(true);
    expect(canReceiveIncomingCallsForStatus("available")).toBe(true);
    expect(canReceiveIncomingCallsForStatus("follow-up")).toBe(false);
    expect(canReceiveIncomingCallsForStatus("manual-outgoing")).toBe(false);
    expect(canReceiveIncomingCallsForStatus("lunch-break")).toBe(false);
    expect(canReceiveIncomingCallsForStatus("inactive")).toBe(false);
  });

  it("recognizes all break statuses", () => {
    expect(isBreakStatus("on-break")).toBe(true);
    expect(isBreakStatus("lunch-break")).toBe(true);
    expect(isBreakStatus("restroom-break")).toBe(true);
    expect(isBreakStatus("follow-up")).toBe(false);
  });

  it("allows transfers only within the same work mode and blocks busy agents", () => {
    expect(canReceiveTransferredCalls({ status: "available", workMode: "active", sourceStatus: "active", activeCalls: 0, sipStatus: "Not in use", isLoggedIn: true })).toBe(true);
    expect(canReceiveTransferredCalls({ status: "available", workMode: "active", sourceStatus: "active", activeCalls: 0, sipStatus: "Not in use", isLoggedIn: true, languages: ["Tamil"], sourceLanguage: "Kannada" })).toBe(false);
    expect(canReceiveTransferredCalls({ status: "available", workMode: "active", sourceStatus: "active", activeCalls: 0, sipStatus: "Not in use", isLoggedIn: true, languages: ["Tamil"], sourceLanguage: "Tamil" })).toBe(true);
    expect(canReceiveTransferredCalls({ status: "follow-up", workMode: "follow-up", sourceStatus: "active", activeCalls: 0, sipStatus: "Not in use", isLoggedIn: true })).toBe(false);
    expect(canReceiveTransferredCalls({ status: "outbound-auto", workMode: "outbound-auto", sourceStatus: "outbound-auto", activeCalls: 0, sipStatus: "Not in use", isLoggedIn: true })).toBe(true);
    expect(canReceiveTransferredCalls({ status: "outbound-auto", workMode: "outbound-auto", sourceStatus: "outbound-auto", activeCalls: 0, sipStatus: "Unavailable", isLoggedIn: true })).toBe(false);
    expect(canReceiveTransferredCalls({ status: "available", workMode: "active", sourceStatus: "outbound-auto", activeCalls: 0, sipStatus: "Not in use", isLoggedIn: true })).toBe(false);
    expect(canReceiveTransferredCalls({ status: "follow-up", workMode: "follow-up", sourceStatus: "follow-up", activeCalls: 0, sipStatus: "Not in use", isLoggedIn: true })).toBe(true);
    expect(canReceiveTransferredCalls({ status: "follow-up", workMode: "follow-up", sourceStatus: "follow-up", activeCalls: 1, sipStatus: "Not in use", isLoggedIn: true })).toBe(false);
    expect(canReceiveTransferredCalls({ status: "on-call", activeCalls: 0 })).toBe(false);
    expect(canReceiveTransferredCalls({ status: "offline", activeCalls: 0 })).toBe(false);
  });
});
