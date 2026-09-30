import { describe, expect, it } from "vitest";
import type { CallRecord } from "@/data/mockData";
import { getCallBusinessDateKey, mergeCallsForDate } from "@/lib/dashboardCalls";

describe("dashboardCalls", () => {
  it("keeps local call updates over slower dashboard snapshots", () => {
    const dashboardCall: CallRecord = {
      id: "CALL-1",
      callerId: "9999999999",
      callerName: "Customer",
      customerName: "Customer",
      agentId: "AG001",
      agentName: "Agent 1",
      direction: "outgoing",
      status: "completed",
      duration: "00:10",
      time: "10:00",
      date: "2026-04-18",
      language: "",
      hasRecording: false,
    };

    const localCall: CallRecord = {
      ...dashboardCall,
      status: "active",
      duration: "00:45",
    };

    const merged = mergeCallsForDate([dashboardCall], [localCall], "2026-04-18");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("active");
    expect(merged[0]?.duration).toBe("00:45");
  });

  it("includes local today calls that are not in the dashboard snapshot yet", () => {
    const localCall: CallRecord = {
      id: "CALL-2",
      callerId: "8888888888",
      callerName: "Inbound",
      customerName: "Inbound",
      agentId: "AG002",
      agentName: "Agent 2",
      direction: "incoming",
      status: "active",
      duration: "00:12",
      time: "11:00",
      date: "2026-04-18",
      language: "",
      hasRecording: true,
    };

    const merged = mergeCallsForDate([], [localCall], "2026-04-18");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("CALL-2");
  });

  it("dedupes the same interaction across dashboard and local rows even when ids differ", () => {
    const dashboardCall: CallRecord = {
      id: "DB-ROW-1",
      callerId: "9999999999",
      callerName: "Customer",
      customerName: "Customer",
      agentId: "AG001",
      agentName: "Agent 1",
      direction: "outgoing",
      status: "completed",
      duration: "00:20",
      time: "10:00",
      date: "2026-04-18",
      language: "",
      hasRecording: true,
      ringStartedAt: "2026-04-18T10:00:00.000Z",
      answeredAt: "2026-04-18T10:00:05.000Z",
      endedAt: "2026-04-18T10:00:25.000Z",
      talkDurationSeconds: 20,
      callbackStatus: "Completed",
      createdAt: "2026-04-18T10:00:00.000Z",
    };
    const localCall: CallRecord = {
      ...dashboardCall,
      id: "CALL-LOCAL-1",
      status: "active",
      duration: "00:48",
      endedAt: "",
      callbackStatus: "",
      notes: "Live browser state",
    };

    const merged = mergeCallsForDate([dashboardCall], [localCall], "2026-04-18");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("CALL-LOCAL-1");
    expect(merged[0]?.status).toBe("active");
    expect(merged[0]?.duration).toBe("00:48");
  });

  it("derives a business date from createdAt when date is missing", () => {
    expect(getCallBusinessDateKey({
      date: "",
      createdAt: "2026-04-18T12:34:56.000Z",
    })).toBe("2026-04-18");
  });

  it("keeps agent dashboards scoped to the current agent when local cache contains other calls", () => {
    const myCall: CallRecord = {
      id: "CALL-MINE",
      callerId: "9999999999",
      callerName: "Mine",
      customerName: "Mine",
      agentId: "AG001",
      agentName: "Agent 1",
      direction: "outgoing",
      status: "completed",
      duration: "00:30",
      time: "12:00",
      date: "2026-04-18",
      language: "",
      hasRecording: false,
    };
    const otherAgentLocalCall: CallRecord = {
      id: "CALL-OTHER",
      callerId: "8888888888",
      callerName: "Other",
      customerName: "Other",
      agentId: "AG002",
      agentName: "Agent 2",
      direction: "incoming",
      status: "active",
      duration: "00:20",
      time: "12:10",
      date: "2026-04-18",
      language: "",
      hasRecording: false,
    };

    const merged = mergeCallsForDate([myCall], [otherAgentLocalCall], "2026-04-18", {
      agentId: "AG001",
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("CALL-MINE");
  });
});
