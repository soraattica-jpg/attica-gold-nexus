import type { CallRecord } from "@/data/mockData";

type LiveCallRecordLike = {
  id?: string | null;
  status?: string | null;
  endedAt?: string | null;
  duration?: string | null;
  ringStartedAt?: string | null;
  answeredAt?: string | null;
  talkDurationSeconds?: number | string | null;
};

type LiveAgentLike = {
  status?: string | null;
  activeCalls?: number | string | null;
};

const normalizeText = (value: unknown) => (
  typeof value === "string"
    ? value.trim()
    : (typeof value === "number" && Number.isFinite(value) ? String(value) : "")
);

export const isAgentCurrentlyOnCall = (agent?: LiveAgentLike | null) => {
  const normalizedStatus = normalizeText(agent?.status).toLowerCase();
  const activeCalls = Number(agent?.activeCalls || 0);
  return normalizedStatus === "on-call" || (Number.isFinite(activeCalls) && activeCalls > 0);
};

export const isOpenLiveCallRecord = (call?: LiveCallRecordLike | null) => {
  const normalizedCallId = normalizeText(call?.id);
  if (!normalizedCallId) return false;

  const normalizedStatus = normalizeText(call?.status).toLowerCase();
  if (!["ringing", "connecting", "answered", "active", "on-hold"].includes(normalizedStatus)) {
    return false;
  }

  return !normalizeText(call?.endedAt);
};

export const mergeCallsPreservingLocalLiveCall = ({
  incomingCalls,
  existingCalls,
  activeCallId,
}: {
  incomingCalls: CallRecord[];
  existingCalls: CallRecord[];
  activeCallId?: string | null;
}) => {
  const normalizedActiveCallId = normalizeText(activeCallId);
  if (!normalizedActiveCallId) {
    return Array.isArray(incomingCalls) ? [...incomingCalls] : [];
  }

  const localLiveCall = existingCalls.find((call) => (
    normalizeText(call?.id) === normalizedActiveCallId && isOpenLiveCallRecord(call)
  ));
  if (!localLiveCall) {
    return Array.isArray(incomingCalls) ? [...incomingCalls] : [];
  }

  const nextCalls = Array.isArray(incomingCalls) ? [...incomingCalls] : [];
  const incomingIndex = nextCalls.findIndex((call) => normalizeText(call?.id) === normalizedActiveCallId);

  if (incomingIndex === -1) {
    return [localLiveCall, ...nextCalls];
  }

  const incomingCall = nextCalls[incomingIndex];
  if (isOpenLiveCallRecord(incomingCall)) {
    return nextCalls;
  }

  nextCalls[incomingIndex] = {
    ...incomingCall,
    ...localLiveCall,
    status: localLiveCall.status,
    endedAt: "",
    duration: localLiveCall.duration || incomingCall.duration,
    ringStartedAt: localLiveCall.ringStartedAt || incomingCall.ringStartedAt,
    answeredAt: localLiveCall.answeredAt || incomingCall.answeredAt,
    talkDurationSeconds: Math.max(
      Number(incomingCall.talkDurationSeconds) || 0,
      Number(localLiveCall.talkDurationSeconds) || 0,
    ),
  };

  return nextCalls;
};
