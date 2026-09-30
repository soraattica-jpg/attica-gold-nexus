import { describe, expect, it } from "vitest";

import { getEstablishedDisconnectOutcome, getIncomingPreAnswerOutcome, getOutboundMissedOutcome } from "@/lib/callOutcomes";

describe("callOutcomes", () => {
  it("maps outbound SIP rejection codes to distinct outcomes without flattening all failures into missed", () => {
    expect(getOutboundMissedOutcome(486)).toMatchObject({ callStatus: "failed", callbackStatus: "LB" });
    expect(getOutboundMissedOutcome(404)).toMatchObject({ callStatus: "failed", callbackStatus: "WN" });
    expect(getOutboundMissedOutcome(603)).toMatchObject({ callStatus: "failed", callbackStatus: "DEC" });
    expect(getOutboundMissedOutcome(480)).toMatchObject({ callStatus: "failed", callbackStatus: "NA" });
    expect(getOutboundMissedOutcome(503)).toMatchObject({ callStatus: "failed", callbackStatus: "Network Failure" });
    expect(getOutboundMissedOutcome(408, "Outbound ring timeout")).toMatchObject({ callStatus: "failed", callbackStatus: "RNR" });
    expect(getOutboundMissedOutcome(487)).toMatchObject({ callStatus: "failed", callbackStatus: "RNR" });
  });

  it("distinguishes transfer, agent-ended, and customer-ended established calls", () => {
    expect(getEstablishedDisconnectOutcome({ isTransferred: true }).callbackStatus).toBe("Transferred");
    expect(getEstablishedDisconnectOutcome({ endedByAgent: true }).callbackStatus).toBe("Completed");
    expect(getEstablishedDisconnectOutcome().callbackStatus).toBe("Customer Disconnected");
  });

  it("distinguishes declined inbound rings from pre-answer caller disconnects", () => {
    expect(getIncomingPreAnswerOutcome({ endedByAgent: true })).toMatchObject({
      callStatus: "missed",
      callbackStatus: "Declined",
    });
    expect(getIncomingPreAnswerOutcome()).toMatchObject({
      callStatus: "missed",
      callbackStatus: "Missed",
      note: "Caller disconnected before answer",
    });
  });
});
