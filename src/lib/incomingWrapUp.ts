export const isCustomerDisconnectedWrapUp = (call: { callbackStatus?: string; notes?: string } | null | undefined) => {
  const callbackStatus = String(call?.callbackStatus || "").trim().toLowerCase();
  const notes = String(call?.notes || "").trim().toLowerCase();
  return callbackStatus === "customer disconnected" || notes.includes("customer disconnected");
};

const CONNECTED_CALL_STATUSES = new Set([
  "active",
  "on-hold",
  "answered",
  "completed",
  "transferred",
]);

const normalizeCallId = (value?: string | null) => String(value || "").trim();

const hasConnectedCallSnapshot = (
  call?: {
    status?: string;
    answeredAt?: string;
    talkDurationSeconds?: number;
  } | null,
) => {
  if (!call) return false;

  const normalizedStatus = String(call.status || "").trim().toLowerCase();
  if (CONNECTED_CALL_STATUSES.has(normalizedStatus)) {
    return true;
  }

  if (String(call.answeredAt || "").trim()) {
    return true;
  }

  return Number(call.talkDurationSeconds) > 0;
};

export const hasIncomingCallEverConnected = ({
  wasConnected,
  call,
  finalizedCallSnapshot,
}: {
  wasConnected: boolean;
  call?: {
    status?: string;
    answeredAt?: string;
    talkDurationSeconds?: number;
  } | null;
  finalizedCallSnapshot?: {
    status?: string;
    answeredAt?: string;
    talkDurationSeconds?: number;
  } | null;
}) => (
  wasConnected
  || hasConnectedCallSnapshot(call)
  || hasConnectedCallSnapshot(finalizedCallSnapshot)
);

export const didIncomingInviteReachConnectedState = ({
  inviteWasEstablished,
  incomingDialogCallId,
  activeCallId,
}: {
  inviteWasEstablished: boolean;
  incomingDialogCallId?: string | null;
  activeCallId?: string | null;
}) => {
  if (inviteWasEstablished) {
    return true;
  }

  const normalizedIncomingDialogCallId = normalizeCallId(incomingDialogCallId);
  const normalizedActiveCallId = normalizeCallId(activeCallId);

  return Boolean(
    normalizedIncomingDialogCallId
    && normalizedActiveCallId
    && normalizedIncomingDialogCallId === normalizedActiveCallId,
  );
};

export const shouldAutoDraftCloseIncomingWrapUp = ({
  callEnded,
  wasConnected,
  call,
}: {
  callEnded: boolean;
  wasConnected: boolean;
  call?: { callbackStatus?: string; notes?: string } | null;
}) => (
  callEnded
  && wasConnected
  && isCustomerDisconnectedWrapUp(call)
);
