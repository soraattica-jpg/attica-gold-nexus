import { describe, expect, it } from "vitest";
import type { AutoDialLeadRecord, LiveAgentRecord } from "@/lib/api";
import type { CallRecord } from "@/data/mockData";
import { buildActiveAutoDialCallRows } from "@/lib/autoDialLiveCalls";

const baseLead: AutoDialLeadRecord = {
  id: "LEAD-1",
  customerName: "Customer One",
  mobileNumber: "9876543210",
  area: "Chennai",
  goldWeight: "20g",
  type: "Gold Loan",
  status: "dialing",
  assignedAgentId: "AG001",
  assignedAgentName: "Agent One",
  sourceFile: "website-leads.xlsx",
};

const baseCall: CallRecord = {
  id: "CALL-1",
  callerId: "9876543210",
  callerName: "Customer One",
  customerName: "Customer One",
  agentId: "AG001",
  agentName: "Agent One",
  direction: "outgoing",
  status: "active",
  duration: "00:42",
  time: "10:00",
  date: "2026-04-20",
  language: "",
  hasRecording: true,
  answeredAt: "2026-04-20T10:00:05.000Z",
  createdAt: "2026-04-20T10:00:00.000Z",
};

const liveAgents: LiveAgentRecord[] = [
  {
    agentId: "AG001",
    agentName: "Agent One",
    status: "on-call",
    callsToday: 4,
    extension: "2001",
  },
];

describe("autoDialLiveCalls", () => {
  it("matches a live auto-dial row by lead call id", () => {
    const rows = buildActiveAutoDialCallRows(
      [{ ...baseLead, callId: "CALL-1" }],
      [baseCall],
      liveAgents,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.lead.id).toBe("LEAD-1");
    expect(rows[0]?.call.id).toBe("CALL-1");
  });

  it("falls back to agent and normalized phone when the call id is missing", () => {
    const rows = buildActiveAutoDialCallRows(
      [{ ...baseLead, mobileNumber: "+91 98765 43210" }],
      [baseCall],
      liveAgents,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.call.id).toBe("CALL-1");
  });

  it("ignores calls when the agent is not currently marked on-call", () => {
    const rows = buildActiveAutoDialCallRows(
      [{ ...baseLead, callId: "CALL-1" }],
      [baseCall],
      [{ ...liveAgents[0], status: "available" }],
    );

    expect(rows).toHaveLength(0);
  });

  it("ignores non-live call records even if the lead points to them", () => {
    const rows = buildActiveAutoDialCallRows(
      [{ ...baseLead, callId: "CALL-1" }],
      [{ ...baseCall, status: "completed" }],
      liveAgents,
    );

    expect(rows).toHaveLength(0);
  });

  it("ignores active-looking rows that already have an ended timestamp", () => {
    const rows = buildActiveAutoDialCallRows(
      [{ ...baseLead, callId: "CALL-1" }],
      [{ ...baseCall, endedAt: "2026-04-20T10:01:00.000Z" }],
      liveAgents,
    );

    expect(rows).toHaveLength(0);
  });

  it("accepts agents with activeCalls > 0 even if the status has not flipped to on-call yet", () => {
    const rows = buildActiveAutoDialCallRows(
      [{ ...baseLead, callId: "CALL-1" }],
      [baseCall],
      [{ ...liveAgents[0], status: "follow-up", activeCalls: 1 }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.call.id).toBe("CALL-1");
  });
});
