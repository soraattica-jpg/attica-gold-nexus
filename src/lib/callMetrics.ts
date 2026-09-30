import type { CallRecord } from "@/data/mockData";
import { parseDurationToSeconds } from "@/lib/agentSession";
import { getLongerCallDuration } from "@/lib/callDuration";
import { normalizePhoneNumber } from "@/lib/phone";

type CallLike = {
  id?: string | null;
  callId?: string | null;
  call_id?: string | null;
  agentId?: string | null;
  agent_id?: string | null;
  agentName?: string | null;
  agent_name?: string | null;
  direction?: string | null;
  status?: string | null;
  callbackStatus?: string | null;
  callback_status?: string | null;
  answeredAt?: string | null;
  notes?: string | null;
};

export type AgentCallMetrics = {
  agentId: string;
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  connectedCalls: number;
  missedCalls: number;
  totalDurationSeconds: number;
};

const connectedCallStatuses = new Set<CallRecord["status"]>([
  "active",
  "on-hold",
  "answered",
  "completed",
  "transferred",
]);

const callStatusPriority: Record<CallRecord["status"], number> = {
  completed: 70,
  transferred: 69,
  "on-hold": 68,
  active: 67,
  answered: 66,
  failed: 65,
  missed: 64,
};

const normalizeEventTimestamp = (value: string | undefined) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
};

const normalizeKeyPart = (value: string | undefined) => (
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
);

const getCallDurationSeconds = (call: Pick<CallRecord, "talkDurationSeconds" | "duration">) => (
  Math.max(Number(call.talkDurationSeconds) || 0, parseDurationToSeconds(call.duration || ""))
);

const getNormalizedCallMinute = (value: string | undefined) => {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";

  const hour = String(Number(match[1] || 0)).padStart(2, "0");
  const minute = match[2] || "";
  return minute ? `${hour}:${minute}` : "";
};

const getCallTimestamp = (call: Pick<CallRecord, "endedAt" | "answeredAt" | "ringStartedAt" | "createdAt" | "date" | "time">) => {
  const eventTimestamp = [
    normalizeEventTimestamp(call.endedAt),
    normalizeEventTimestamp(call.answeredAt),
    normalizeEventTimestamp(call.ringStartedAt),
    normalizeEventTimestamp(call.createdAt),
  ].find(Boolean);

  if (eventTimestamp) {
    return new Date(eventTimestamp).getTime();
  }

  const combined = new Date(`${call.date || ""}T${call.time || ""}`).getTime();
  return Number.isFinite(combined) ? combined : 0;
};

const getCallCompletenessScore = (call: CallRecord) => {
  const optionalFields = [
    call.callbackStatus,
    call.notes,
    call.branch,
    call.place,
    call.purpose,
    call.businessType,
    call.language,
    call.displayCustomerName,
    call.customerName,
    call.ringStartedAt,
    call.answeredAt,
    call.endedAt,
  ];

  return optionalFields.reduce((score, value) => score + (String(value || "").trim() ? 1 : 0), 0);
};

const compareCallQuality = (left: CallRecord, right: CallRecord, leftSourcePriority = 0, rightSourcePriority = 0) => {
  if (leftSourcePriority !== rightSourcePriority) {
    return leftSourcePriority - rightSourcePriority;
  }

  const leftStatusPriority = callStatusPriority[left.status] || 0;
  const rightStatusPriority = callStatusPriority[right.status] || 0;
  if (leftStatusPriority !== rightStatusPriority) {
    return leftStatusPriority - rightStatusPriority;
  }

  const leftDurationSeconds = Math.max(Number(left.talkDurationSeconds) || 0, parseDurationToSeconds(left.duration || ""));
  const rightDurationSeconds = Math.max(Number(right.talkDurationSeconds) || 0, parseDurationToSeconds(right.duration || ""));
  if (leftDurationSeconds !== rightDurationSeconds) {
    return leftDurationSeconds - rightDurationSeconds;
  }

  const leftCompleteness = getCallCompletenessScore(left);
  const rightCompleteness = getCallCompletenessScore(right);
  if (leftCompleteness !== rightCompleteness) {
    return leftCompleteness - rightCompleteness;
  }

  return getCallTimestamp(left) - getCallTimestamp(right);
};

const pickNonEmpty = (...values: Array<string | undefined>) => (
  values.find((value) => String(value || "").trim()) || ""
);

const pickEarliestTimestamp = (...values: Array<string | undefined>) => {
  const timestamps = values
    .map((value) => normalizeEventTimestamp(value))
    .filter(Boolean)
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

  return timestamps[0] || "";
};

const pickLatestTimestamp = (...values: Array<string | undefined>) => {
  const timestamps = values
    .map((value) => normalizeEventTimestamp(value))
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());

  return timestamps[0] || "";
};

const buildFallbackInteractionBase = (call: CallRecord) => (
  [
    String(call.agentId || "").trim() || "unknown-agent",
    String(call.direction || "").trim() || "unknown-direction",
    normalizePhoneNumber(call.callerId) || String(call.callerId || "").trim() || "unknown-phone",
  ].join("|")
);

const buildInteractionKeys = (call: CallRecord) => {
  const keys = new Set<string>();
  const normalizedId = String(call.id || "").trim();
  const normalizedIntakeToken = String(call.intakeToken || "").trim();
  const interactionBase = buildFallbackInteractionBase(call);
  const normalizedDate = normalizeKeyPart(call.date);
  const normalizedTime = getNormalizedCallMinute(call.time);
  const normalizedCallbackStatus = normalizeKeyPart(call.callbackStatus);
  const normalizedFormStatus = normalizeKeyPart(call.formStatus);
  const normalizedBranch = normalizeKeyPart(call.branch);
  const normalizedPurpose = normalizeKeyPart(call.purpose);
  const normalizedCustomerName = normalizeKeyPart(call.displayCustomerName || call.customerName || call.callerName);
  const normalizedNotes = normalizeKeyPart(call.notes);
  const durationSeconds = getCallDurationSeconds(call);
  const eventKeys = [
    normalizeEventTimestamp(call.createdAt),
    normalizeEventTimestamp(call.ringStartedAt),
    normalizeEventTimestamp(call.answeredAt),
    normalizeEventTimestamp(call.endedAt),
  ].filter(Boolean);

  if (normalizedIntakeToken) {
    keys.add(`intake:${normalizedIntakeToken}`);
  }
  if (normalizedId) {
    keys.add(`id:${normalizedId}`);
  }
  eventKeys.forEach((eventKey) => {
    keys.add(`event:${interactionBase}|${eventKey}`);
  });

  if (
    normalizedDate
    || normalizedTime
    || durationSeconds > 0
    || eventKeys.length > 0
    || normalizedCallbackStatus
    || normalizedFormStatus
    || normalizedBranch
    || normalizedPurpose
    || normalizedCustomerName
    || normalizedNotes
  ) {
    keys.add([
      "content",
      interactionBase,
      normalizedDate,
      normalizedTime,
      normalizeKeyPart(call.status),
      String(durationSeconds),
      normalizedCallbackStatus,
      normalizedFormStatus,
      normalizedBranch,
      normalizedPurpose,
      normalizedCustomerName,
      normalizedNotes,
      normalizeEventTimestamp(call.ringStartedAt),
      normalizeEventTimestamp(call.answeredAt),
      normalizeEventTimestamp(call.endedAt),
    ].join(":"));
  }

  if (!normalizedIntakeToken && eventKeys.length === 0 && normalizedDate && normalizedTime) {
    keys.add([
      "minute",
      interactionBase,
      normalizedDate,
      normalizedTime,
      normalizedPurpose,
      normalizedBranch,
      normalizedCustomerName,
    ].join(":"));
  }

  return Array.from(keys);
};

const mergeCallRecords = (
  existing: CallRecord,
  incoming: CallRecord,
  existingSourcePriority = 0,
  incomingSourcePriority = 0,
) => {
  const incomingWins = compareCallQuality(existing, incoming, existingSourcePriority, incomingSourcePriority) < 0;
  const preferred = incomingWins ? incoming : existing;
  const alternate = incomingWins ? existing : incoming;

  return {
    ...alternate,
    ...preferred,
    id: String(preferred.id || alternate.id || "").trim(),
    intakeToken: pickNonEmpty(preferred.intakeToken, alternate.intakeToken),
    callerId: pickNonEmpty(preferred.callerId, alternate.callerId),
    callerName: pickNonEmpty(preferred.callerName, alternate.callerName),
    customerName: pickNonEmpty(preferred.customerName, alternate.customerName),
    displayCustomerName: pickNonEmpty(preferred.displayCustomerName, alternate.displayCustomerName),
    agentId: pickNonEmpty(preferred.agentId, alternate.agentId),
    agentName: pickNonEmpty(preferred.agentName, alternate.agentName),
    status: preferred.status,
    duration: getLongerCallDuration(preferred.duration, alternate.duration),
    time: pickNonEmpty(preferred.time, alternate.time),
    date: pickNonEmpty(preferred.date, alternate.date),
    language: pickNonEmpty(preferred.language, alternate.language),
    hasRecording: preferred.hasRecording || alternate.hasRecording,
    ringStartedAt: pickEarliestTimestamp(preferred.ringStartedAt, alternate.ringStartedAt),
    answeredAt: pickEarliestTimestamp(preferred.answeredAt, alternate.answeredAt),
    endedAt: pickLatestTimestamp(preferred.endedAt, alternate.endedAt),
    talkDurationSeconds: Math.max(
      Number(preferred.talkDurationSeconds) || 0,
      Number(alternate.talkDurationSeconds) || 0,
      parseDurationToSeconds(preferred.duration || ""),
      parseDurationToSeconds(alternate.duration || ""),
    ),
    branch: pickNonEmpty(preferred.branch, alternate.branch),
    place: pickNonEmpty(preferred.place, alternate.place),
    purpose: pickNonEmpty(preferred.purpose, alternate.purpose),
    callbackStatus: pickNonEmpty(preferred.callbackStatus, alternate.callbackStatus),
    notes: pickNonEmpty(preferred.notes, alternate.notes),
    leadSource: pickNonEmpty(preferred.leadSource, alternate.leadSource),
    mob2: pickNonEmpty(preferred.mob2, alternate.mob2),
    district: pickNonEmpty(preferred.district, alternate.district),
    businessType: pickNonEmpty(preferred.businessType, alternate.businessType),
    metalType: pickNonEmpty(preferred.metalType, alternate.metalType),
    grams: pickNonEmpty(preferred.grams, alternate.grams),
    releasingAmount: pickNonEmpty(preferred.releasingAmount, alternate.releasingAmount),
    bankName: pickNonEmpty(preferred.bankName, alternate.bankName),
    onlinePrice: pickNonEmpty(preferred.onlinePrice, alternate.onlinePrice),
    pricePerGram: pickNonEmpty(preferred.pricePerGram, alternate.pricePerGram),
    advertisement: pickNonEmpty(preferred.advertisement, alternate.advertisement),
    lead: pickNonEmpty(preferred.lead, alternate.lead),
    formStatus: pickNonEmpty(preferred.formStatus, alternate.formStatus),
    statusFollowUpAt: pickNonEmpty(preferred.statusFollowUpAt, alternate.statusFollowUpAt),
    smsSent: preferred.smsSent || alternate.smsSent,
    createdAt: pickEarliestTimestamp(preferred.createdAt, alternate.createdAt),
  } satisfies CallRecord;
};

function dedupeCallInteractionEntries(
  entries: Array<{ call: CallRecord; sourcePriority: number }>,
) {
  const interactions = new Map<string, { call: CallRecord; sourcePriority: number }>();
  const interactionIdByKey = new Map<string, string>();

  entries.forEach((entry, index) => {
    const keys = buildInteractionKeys(entry.call);
    const matchedInteractionIds = Array.from(new Set(
      keys
        .map((key) => interactionIdByKey.get(key))
        .filter((value): value is string => Boolean(value)),
    ));
    const interactionId = matchedInteractionIds[0] || `interaction:${index}`;
    const current = interactions.get(interactionId);
    const merged = current
      ? {
          call: mergeCallRecords(current.call, entry.call, current.sourcePriority, entry.sourcePriority),
          sourcePriority: Math.max(current.sourcePriority, entry.sourcePriority),
        }
      : entry;

    interactions.set(interactionId, merged);
    buildInteractionKeys(merged.call).forEach((key) => {
      interactionIdByKey.set(key, interactionId);
    });
  });

  return Array.from(interactions.values())
    .map((entry) => entry.call)
    .sort((left, right) => getCallTimestamp(right) - getCallTimestamp(left));
}

export function isInboundMissedCall(call: CallLike) {
  return isCountableIncomingCall(call) && call.status === "missed" && !isDuplicateRemovedCall(call);
}

export function isOpenInboundMissedCall(call: CallLike) {
  if (!isInboundMissedCall(call)) return false;
  return String(call.callbackStatus || call.callback_status || "").trim().toLowerCase() === "pending";
}

export function isDuplicateRemovedCall(call: CallLike) {
  return String(call.callbackStatus || call.callback_status || "").trim().toLowerCase() === "duplicate removed";
}

export function isIvrAbandonedIncomingCall(call: CallLike) {
  if (call.direction !== "incoming") return false;
  const id = String(call.id || call.callId || call.call_id || "").trim().toUpperCase();
  const agentId = String(call.agentId || call.agent_id || "").trim().toUpperCase();
  const agentName = String(call.agentName || call.agent_name || "").trim().toLowerCase();
  const notes = String(call.notes || "").trim().toLowerCase();

  return agentId === "IVR"
    || agentName.includes("ivr abandoned")
    || agentName === "ivr queue handled"
    || agentName === "ivr duplicate removed"
    || notes.includes("caller disconnected after ivr selection")
    || notes.includes("false ivr abandoned suppressed");
}

export function isCountableIncomingCall(call: CallLike) {
  return call.direction === "incoming" && !isIvrAbandonedIncomingCall(call);
}

export function isConnectedCall(call: CallLike) {
  const status = String(call.status || "").trim().toLowerCase();
  if (String(call.answeredAt || "").trim()) return true;
  return status === "active" || status === "on-hold" || status === "answered" || status === "transferred" || status === "completed";
}

export function dedupeCallInteractions(calls: CallRecord[]) {
  return dedupeCallInteractionEntries(
    calls.map((call) => ({ call, sourcePriority: 0 })),
  );
}

export function dedupeCallInteractionsWithSource(entries: Array<{ call: CallRecord; sourcePriority: number }>) {
  return dedupeCallInteractionEntries(entries);
}

export function getAgentCallMetricsByAgent(calls: CallRecord[], options: { dedupe?: boolean } = {}) {
  const dedupedCalls = options.dedupe === false ? calls : dedupeCallInteractions(calls);
  const metricsByAgentId = new Map<string, AgentCallMetrics>();

  dedupedCalls.forEach((call) => {
    const agentId = String(call.agentId || "").trim();
    if (!agentId) return;

    const metrics = metricsByAgentId.get(agentId) || {
      agentId,
      totalCalls: 0,
      inboundCalls: 0,
      outboundCalls: 0,
      connectedCalls: 0,
      missedCalls: 0,
      totalDurationSeconds: 0,
    };

    metrics.totalCalls += 1;
    if (isCountableIncomingCall(call)) metrics.inboundCalls += 1;
    if (call.direction === "outgoing") metrics.outboundCalls += 1;
    if (isConnectedCall(call)) metrics.connectedCalls += 1;
    if (isOpenInboundMissedCall(call)) metrics.missedCalls += 1;
    if (isConnectedCall(call)) {
      metrics.totalDurationSeconds += Math.max(
        Number(call.talkDurationSeconds) || 0,
        parseDurationToSeconds(call.duration || ""),
      );
    }

    metricsByAgentId.set(agentId, metrics);
  });

  return metricsByAgentId;
}
