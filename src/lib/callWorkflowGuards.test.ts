import { describe, expect, it } from "vitest";
import {
  canAnswerIncomingDialogWithoutBrowserConflict,
  isLiveManagedCall,
  isProtectedCallWorkflowActive,
  shouldRepairSessionMicrophone,
  shouldWarnBeforeUnloadForCallWorkflow,
} from "@/lib/callWorkflowGuards";

describe("call workflow guards", () => {
  it("keeps safe reload deferred while incoming call UI is still open", () => {
    expect(isProtectedCallWorkflowActive({
      callPhase: "idle",
      incomingDialogOpen: true,
      callWrapUpPending: false,
      hasAutoDialAlert: false,
    })).toBe(true);
  });

  it("keeps safe reload deferred during wrap-up even after the live call ends", () => {
    expect(isProtectedCallWorkflowActive({
      callPhase: "idle",
      incomingDialogOpen: false,
      callWrapUpPending: true,
      hasAutoDialAlert: false,
    })).toBe(true);
  });

  it("treats the workflow as safe only after call UI is cleared", () => {
    expect(isProtectedCallWorkflowActive({
      callPhase: "idle",
      incomingDialogOpen: false,
      callWrapUpPending: false,
      hasAutoDialAlert: false,
    })).toBe(false);
  });

  it("does not show the browser leave warning for an unanswered incoming ring", () => {
    expect(shouldWarnBeforeUnloadForCallWorkflow({
      callPhase: "dialing",
      incomingDialogOpen: true,
    })).toBe(false);
  });

  it("still warns before unload for connected calls", () => {
    expect(shouldWarnBeforeUnloadForCallWorkflow({
      callPhase: "connected",
      incomingDialogOpen: true,
    })).toBe(true);
  });

  it("keeps microphone repair disabled while an outgoing call is still ringing", () => {
    expect(shouldRepairSessionMicrophone({ callPhase: "dialing" })).toBe(false);
  });

  it("keeps microphone repair disabled while an incoming call is still being answered", () => {
    expect(shouldRepairSessionMicrophone({ callPhase: "idle" })).toBe(false);
    expect(shouldRepairSessionMicrophone({ callPhase: "dialing" })).toBe(false);
  });

  it("only repairs the session microphone after the call is connected", () => {
    expect(shouldRepairSessionMicrophone({ callPhase: "connected" })).toBe(true);
  });

  it("treats active and on-hold managed calls as live browser locks", () => {
    expect(isLiveManagedCall({ id: "CALL-1", status: "active" })).toBe(true);
    expect(isLiveManagedCall({ id: "CALL-2", status: "on-hold" })).toBe(true);
    expect(isLiveManagedCall({ id: "CALL-3", status: "completed" })).toBe(false);
    expect(isLiveManagedCall({ id: "", status: "active" })).toBe(false);
  });

  it("allows answering the current incoming dialog when no separate live call exists", () => {
    expect(canAnswerIncomingDialogWithoutBrowserConflict({
      currentSessionMatchesIncoming: true,
      callPhase: "dialing",
      outboundDialStartInFlight: false,
      incomingAnswerInFlight: false,
      callWrapUpPending: false,
      activeCall: null,
      allowedCallId: "CALL-NEW",
    })).toBe(true);
  });

  it("blocks answering when another live managed call is still active", () => {
    expect(canAnswerIncomingDialogWithoutBrowserConflict({
      currentSessionMatchesIncoming: true,
      callPhase: "dialing",
      outboundDialStartInFlight: false,
      incomingAnswerInFlight: false,
      callWrapUpPending: false,
      activeCall: { id: "CALL-OLD", status: "active" },
      allowedCallId: "CALL-NEW",
    })).toBe(false);
  });
});
