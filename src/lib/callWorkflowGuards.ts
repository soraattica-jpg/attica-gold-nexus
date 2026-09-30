export type CallWorkflowPhase = "idle" | "dialing" | "connected";

type ManagedCallLike = {
  id?: string | null;
  status?: string | null;
};

const normalizeCallId = (value?: string | null) => String(value || "").trim();

export const isProtectedCallWorkflowActive = ({
  callPhase,
  incomingDialogOpen,
  callWrapUpPending,
  hasAutoDialAlert,
}: {
  callPhase: CallWorkflowPhase;
  incomingDialogOpen: boolean;
  callWrapUpPending: boolean;
  hasAutoDialAlert: boolean;
}) => (
  callPhase !== "idle" ||
  incomingDialogOpen ||
  callWrapUpPending ||
  hasAutoDialAlert
);

export const shouldWarnBeforeUnloadForCallWorkflow = ({
  callPhase,
  incomingDialogOpen,
}: {
  callPhase: CallWorkflowPhase;
  incomingDialogOpen: boolean;
}) => (
  callPhase === "connected" ||
  (callPhase === "dialing" && !incomingDialogOpen)
);

export const shouldRepairSessionMicrophone = ({
  callPhase,
}: {
  callPhase: CallWorkflowPhase;
}) => (
  callPhase === "connected"
);

export const isLiveManagedCall = (call?: ManagedCallLike | null) => {
  const normalizedCallId = normalizeCallId(call?.id);
  if (!normalizedCallId) return false;

  const normalizedStatus = String(call?.status || "").trim().toLowerCase();
  return normalizedStatus === "active" || normalizedStatus === "on-hold";
};

export const canAnswerIncomingDialogWithoutBrowserConflict = ({
  currentSessionMatchesIncoming,
  callPhase,
  outboundDialStartInFlight,
  incomingAnswerInFlight,
  callWrapUpPending,
  activeCall,
  allowedCallId,
}: {
  currentSessionMatchesIncoming: boolean;
  callPhase: CallWorkflowPhase;
  outboundDialStartInFlight: boolean;
  incomingAnswerInFlight: boolean;
  callWrapUpPending: boolean;
  activeCall?: ManagedCallLike | null;
  allowedCallId?: string | null;
}) => {
  if (!currentSessionMatchesIncoming) return false;
  if (!(callPhase === "dialing" || callPhase === "idle")) return false;
  if (outboundDialStartInFlight || incomingAnswerInFlight || callWrapUpPending) return false;

  if (!isLiveManagedCall(activeCall)) {
    return true;
  }

  return normalizeCallId(activeCall?.id) === normalizeCallId(allowedCallId);
};
