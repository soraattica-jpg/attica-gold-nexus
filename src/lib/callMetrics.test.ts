import { describe, expect, it } from "vitest";

import type { CallRecord } from "@/data/mockData";
import {
  dedupeCallInteractions,
  getAgentCallMetricsByAgent,
  isConnectedCall,
  isInboundMissedCall,
} from "@/lib/callMetrics";

const buildCall = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  id: "CALL-1",
  callerId: "9999999999",
  callerName: "Customer",
  customerName: "Customer",
  displayCustomerName: "Customer",
  agentId: "AG001",
  agentName: "Agent 1",
  direction: "outgoing",
  status: "completed",
  duration: "00:30",
  time: "10:00",
  date: "2026-04-18",
  language: "",
  hasRecording: true,
  ringStartedAt: "2026-04-18T10:00:00.000Z",
  answeredAt: "2026-04-18T10:00:05.000Z",
  endedAt: "2026-04-18T10:00:35.000Z",
  talkDurationSeconds: 30,
  branch: "",
  place: "",
  purpose: "",
  callbackStatus: "Completed",
  followUpFlag: false,
  notes: "",
  createdAt: "2026-04-18T10:00:00.000Z",
  ...overrides,
});

describe("callMetrics", () => {
  it("dedupes duplicate rows from the same interaction even when record ids differ", () => {
    const rows = dedupeCallInteractions([
      buildCall({
        id: "DB-ROW-1",
        status: "active",
        duration: "00:00",
        endedAt: "",
        callbackStatus: "",
      }),
      buildCall({
        id: "DB-ROW-2",
        status: "completed",
        duration: "00:42",
        talkDurationSeconds: 42,
        callbackStatus: "Completed",
        notes: "Call ended by agent",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("completed");
    expect(rows[0]?.duration).toBe("00:42");
    expect(rows[0]?.notes).toBe("Call ended by agent");
  });

  it("keeps separate retries when the interaction timestamps differ", () => {
    const rows = dedupeCallInteractions([
      buildCall({
        id: "CALL-A",
        status: "failed",
        duration: "00:12",
        answeredAt: "",
        endedAt: "2026-04-18T10:00:12.000Z",
        ringStartedAt: "2026-04-18T10:00:00.000Z",
        createdAt: "2026-04-18T10:00:00.000Z",
      }),
      buildCall({
        id: "CALL-B",
        status: "completed",
        duration: "00:55",
        ringStartedAt: "2026-04-18T10:03:00.000Z",
        answeredAt: "2026-04-18T10:03:05.000Z",
        endedAt: "2026-04-18T10:04:00.000Z",
        createdAt: "2026-04-18T10:03:00.000Z",
      }),
    ]);

    expect(rows).toHaveLength(2);
  });

  it("dedupes duplicate backend rows when event timestamps are missing but the call minute matches", () => {
    const rows = dedupeCallInteractions([
      buildCall({
        id: "ROW-1",
        status: "active",
        duration: "00:00",
        ringStartedAt: "",
        answeredAt: "",
        endedAt: "",
        createdAt: "",
      }),
      buildCall({
        id: "ROW-2",
        status: "completed",
        duration: "00:34",
        talkDurationSeconds: 34,
        ringStartedAt: "",
        answeredAt: "",
        endedAt: "",
        createdAt: "",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("completed");
    expect(rows[0]?.duration).toBe("00:34");
  });

  it("builds agent counts from deduped interactions instead of raw rows", () => {
    const metricsByAgent = getAgentCallMetricsByAgent([
      buildCall({
        id: "ROW-1",
        direction: "incoming",
        status: "active",
        duration: "00:00",
        endedAt: "",
      }),
      buildCall({
        id: "ROW-2",
        direction: "incoming",
        status: "completed",
        duration: "01:00",
        talkDurationSeconds: 60,
      }),
      buildCall({
        id: "ROW-3",
        direction: "incoming",
        status: "missed",
        callbackStatus: "Pending",
        callerId: "8888888888",
        createdAt: "2026-04-18T11:00:00.000Z",
        ringStartedAt: "2026-04-18T11:00:00.000Z",
        answeredAt: "",
        endedAt: "2026-04-18T11:00:15.000Z",
      }),
    ]);

    expect(metricsByAgent.get("AG001")).toMatchObject({
      totalCalls: 2,
      inboundCalls: 2,
      outboundCalls: 0,
      connectedCalls: 1,
      missedCalls: 1,
      totalDurationSeconds: 60,
    });
  });

  it("distinguishes inbound missed calls from connected calls", () => {
    expect(isInboundMissedCall({ direction: "incoming", status: "missed" })).toBe(true);
    expect(isInboundMissedCall({ direction: "incoming", status: "missed", callbackStatus: "Duplicate Removed" })).toBe(false);
    expect(isConnectedCall({ direction: "outgoing", status: "connected" })).toBe(false);
    expect(isConnectedCall({ direction: "outgoing", status: "completed" })).toBe(true);
  });
});
