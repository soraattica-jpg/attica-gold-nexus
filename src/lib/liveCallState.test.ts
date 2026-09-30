import { describe, expect, it } from "vitest";
import { isAgentCurrentlyOnCall, isOpenLiveCallRecord, mergeCallsPreservingLocalLiveCall } from "@/lib/liveCallState";

describe("liveCallState", () => {
  it("treats only open active or on-hold calls as live", () => {
    expect(isOpenLiveCallRecord({ id: "CALL-1", status: "active", endedAt: "" })).toBe(true);
    expect(isOpenLiveCallRecord({ id: "CALL-2", status: "on-hold", endedAt: "" })).toBe(true);
    expect(isOpenLiveCallRecord({ id: "CALL-3", status: "active", endedAt: "2026-04-25T10:00:00.000Z" })).toBe(false);
    expect(isOpenLiveCallRecord({ id: "CALL-4", status: "completed", endedAt: "" })).toBe(false);
  });

  it("treats on-call or activeCalls>0 agents as currently on-call", () => {
    expect(isAgentCurrentlyOnCall({ status: "on-call", activeCalls: 0 })).toBe(true);
    expect(isAgentCurrentlyOnCall({ status: "follow-up", activeCalls: 1 })).toBe(true);
    expect(isAgentCurrentlyOnCall({ status: "available", activeCalls: 0 })).toBe(false);
  });

  it("preserves the local live call when a stale server snapshot omits it", () => {
    const merged = mergeCallsPreservingLocalLiveCall({
      activeCallId: "CALL-1",
      existingCalls: [
        {
          id: "CALL-1",
          callerId: "9000000001",
          callerName: "Caller",
          customerName: "Caller",
          agentId: "AG001",
          agentName: "Agent",
          direction: "incoming",
          status: "active",
          duration: "00:03",
          time: "10:00",
          date: "2026-04-28",
          language: "",
          hasRecording: false,
          answeredAt: "2026-04-28T10:00:00.000Z",
        },
      ],
      incomingCalls: [],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("CALL-1");
    expect(merged[0]?.status).toBe("active");
  });

  it("preserves the local live call when a stale server snapshot downgrades it", () => {
    const merged = mergeCallsPreservingLocalLiveCall({
      activeCallId: "CALL-1",
      existingCalls: [
        {
          id: "CALL-1",
          callerId: "9000000001",
          callerName: "Caller",
          customerName: "Caller",
          agentId: "AG001",
          agentName: "Agent",
          direction: "incoming",
          status: "active",
          duration: "00:05",
          time: "10:00",
          date: "2026-04-28",
          language: "",
          hasRecording: false,
          answeredAt: "2026-04-28T10:00:00.000Z",
        },
      ],
      incomingCalls: [
        {
          id: "CALL-1",
          callerId: "9000000001",
          callerName: "Caller",
          customerName: "Caller",
          agentId: "AG001",
          agentName: "Agent",
          direction: "incoming",
          status: "completed",
          duration: "00:00",
          time: "10:00",
          date: "2026-04-28",
          language: "",
          hasRecording: false,
          endedAt: "2026-04-28T10:00:02.000Z",
        },
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("active");
    expect(merged[0]?.endedAt).toBe("");
    expect(merged[0]?.duration).toBe("00:05");
  });
});
