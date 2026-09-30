import { describe, expect, it } from "vitest";

import { buildOutgoingMissedCall } from "@/lib/outgoingCallRecord";

describe("buildOutgoingMissedCall", () => {
  it("keeps unanswered outbound attempts at zero talk duration", () => {
    const call = buildOutgoingMissedCall({
      id: "CALL-1",
      callerId: "9663254924",
      customerName: "Sandeep",
      agentId: "AG001",
      agentName: "Test",
      status: "missed",
      duration: "00:26",
      callbackStatus: "RNR",
      time: "12:16",
      date: "2026-04-20",
      ringStartedAt: "2026-04-20T06:45:34.000Z",
      endedAt: "2026-04-20T06:46:00.000Z",
      talkDurationSeconds: 0,
    });

    expect(call.status).toBe("failed");
    expect(call.callbackStatus).toBe("RNR");
    expect(call.duration).toBe("00:00");
    expect(call.talkDurationSeconds).toBe(0);
  });
});
