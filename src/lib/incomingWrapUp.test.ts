import { describe, expect, it } from "vitest";

import {
  didIncomingInviteReachConnectedState,
  hasIncomingCallEverConnected,
  isCustomerDisconnectedWrapUp,
  shouldAutoDraftCloseIncomingWrapUp,
} from "@/lib/incomingWrapUp";

describe("incomingWrapUp", () => {
  it("detects customer-disconnected wrap-up state from callback status or notes", () => {
    expect(isCustomerDisconnectedWrapUp({ callbackStatus: "Customer Disconnected" })).toBe(true);
    expect(isCustomerDisconnectedWrapUp({ notes: "Customer disconnected after greeting" })).toBe(true);
    expect(isCustomerDisconnectedWrapUp({ callbackStatus: "Completed", notes: "Call ended by agent" })).toBe(false);
  });

  it("only auto-closes the incoming wrap-up after a connected call ends with customer disconnect", () => {
    expect(shouldAutoDraftCloseIncomingWrapUp({
      callEnded: true,
      wasConnected: true,
      call: { callbackStatus: "Customer Disconnected" },
    })).toBe(true);

    expect(shouldAutoDraftCloseIncomingWrapUp({
      callEnded: true,
      wasConnected: true,
      call: { callbackStatus: "Completed" },
    })).toBe(false);

    expect(shouldAutoDraftCloseIncomingWrapUp({
      callEnded: false,
      wasConnected: true,
      call: { callbackStatus: "Customer Disconnected" },
    })).toBe(false);

    expect(shouldAutoDraftCloseIncomingWrapUp({
      callEnded: true,
      wasConnected: false,
      call: { callbackStatus: "Customer Disconnected" },
    })).toBe(false);
  });

  it("treats answered or finalized inbound calls as connected even if the modal missed the transient connected phase", () => {
    expect(hasIncomingCallEverConnected({
      wasConnected: false,
      call: { status: "completed", answeredAt: "2026-04-21T09:00:00.000Z" },
    })).toBe(true);

    expect(hasIncomingCallEverConnected({
      wasConnected: false,
      finalizedCallSnapshot: { answeredAt: "2026-04-21T09:00:00.000Z" },
    })).toBe(true);

    expect(hasIncomingCallEverConnected({
      wasConnected: false,
      call: { status: "missed", answeredAt: "", talkDurationSeconds: 0 },
    })).toBe(false);
  });

  it("only treats the current inbound invite as connected when the active call matches that invite", () => {
    expect(didIncomingInviteReachConnectedState({
      inviteWasEstablished: true,
      incomingDialogCallId: "CALL-1",
      activeCallId: "",
    })).toBe(true);

    expect(didIncomingInviteReachConnectedState({
      inviteWasEstablished: false,
      incomingDialogCallId: "CALL-1",
      activeCallId: "CALL-1",
    })).toBe(true);

    expect(didIncomingInviteReachConnectedState({
      inviteWasEstablished: false,
      incomingDialogCallId: "CALL-1",
      activeCallId: "CALL-2",
    })).toBe(false);
  });
});
