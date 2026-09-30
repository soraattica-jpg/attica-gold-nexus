import type { CallRecord } from "@/data/mockData";

export type RecordingMatchEntry = {
  name: string;
  haystack: string;
  recordedAt: number | null;
  size: number;
};

type CallRecordingLookup = Pick<
  CallRecord,
  "id" | "callerId" | "direction" | "ringStartedAt" | "answeredAt" | "endedAt" | "createdAt" | "recordingName"
>;

const MIN_RECORDING_MATCH_SCORE = 260;
export const MIN_PLAYABLE_RECORDING_BYTES = 45;
const INBOUND_RECORDING_PATTERN = /(?:^|[-_])inbound(?:\.[^.]+)?$/i;

const toTimestamp = (value: string | undefined) => {
  const timestamp = new Date(String(value || "").trim()).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const getCallRecordingReferenceTimes = (call: CallRecordingLookup) => (
  [
    toTimestamp(call.ringStartedAt),
    toTimestamp(call.answeredAt),
    toTimestamp(call.createdAt),
    toTimestamp(call.endedAt),
  ].filter((value): value is number => Number.isFinite(value))
);

const getCallRecordingSortTimestamp = (call: CallRecordingLookup) => (
  getCallRecordingReferenceTimes(call)[0] ?? 0
);

export const findRecordingByName = (
  catalog: RecordingMatchEntry[],
  recordingName: string | undefined,
) => {
  const normalizedName = String(recordingName || "").trim().toLowerCase();
  if (!normalizedName) return null;
  return catalog.find((entry) => entry.name.trim().toLowerCase() === normalizedName) ?? null;
};

export const scoreRecordingMatch = (
  entry: RecordingMatchEntry,
  call: CallRecordingLookup,
  options?: {
    allowSmallFiles?: boolean;
  },
) => {
  const allowSmallFiles = options?.allowSmallFiles ?? false;
  const phoneDigits = String(call.callerId || "").replace(/[^0-9]/g, "");
  const lastTenDigits = phoneDigits.slice(-10);
  const hasFullPhoneMatch = Boolean(phoneDigits) && entry.haystack.includes(phoneDigits);
  const hasLastTenPhoneMatch = lastTenDigits.length >= 10 && entry.haystack.includes(lastTenDigits);
  const hasStrongPhoneMatch = !phoneDigits || hasFullPhoneMatch || hasLastTenPhoneMatch;
  const isInboundRecording = INBOUND_RECORDING_PATTERN.test(entry.name);
  const referenceTimes = getCallRecordingReferenceTimes(call);
  const nearestTimeDistance = (
    entry.recordedAt && referenceTimes.length > 0
      ? Math.min(...referenceTimes.map((timestamp) => Math.abs(entry.recordedAt! - timestamp)))
      : Number.POSITIVE_INFINITY
  );

  if (!hasStrongPhoneMatch || (!allowSmallFiles && entry.size < MIN_PLAYABLE_RECORDING_BYTES)) {
    return {
      score: Number.NEGATIVE_INFINITY,
      nearestTimeDistance,
    };
  }

  let score = 0;

  if (hasFullPhoneMatch) score += 180;
  else if (hasLastTenPhoneMatch) score += 140;

  if (call.direction === "incoming") {
    score += isInboundRecording ? 80 : -160;
  } else {
    score += isInboundRecording ? -120 : 40;
  }

  score += 10;

  if (nearestTimeDistance <= 60_000) score += 220;
  else if (nearestTimeDistance <= 2 * 60_000) score += 180;
  else if (nearestTimeDistance <= 5 * 60_000) score += 120;
  else if (nearestTimeDistance <= 10 * 60_000) score += 60;
  else if (nearestTimeDistance <= 15 * 60_000) score += 20;
  else if (nearestTimeDistance <= 30 * 60_000) score -= 40;
  else if (nearestTimeDistance <= 60 * 60_000) score -= 120;
  else if (nearestTimeDistance <= 2 * 60 * 60_000) score -= 200;
  else if (Number.isFinite(nearestTimeDistance)) score -= 260;

  return {
    score,
    nearestTimeDistance,
  };
};

export const findBestRecordingMatch = (
  catalog: RecordingMatchEntry[],
  call: CallRecordingLookup,
  options?: {
    allowSmallFiles?: boolean;
  },
) => {
  const exactMatch = findRecordingByName(catalog, call.recordingName);
  if (exactMatch) {
    return exactMatch;
  }

  const rankedEntries = catalog
    .map((entry) => {
      const { score, nearestTimeDistance } = scoreRecordingMatch(entry, call, options);
      return { entry, score, nearestTimeDistance };
    })
    .filter(({ score }) => score >= MIN_RECORDING_MATCH_SCORE)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.nearestTimeDistance !== right.nearestTimeDistance) {
        return left.nearestTimeDistance - right.nearestTimeDistance;
      }
      return right.entry.size - left.entry.size;
    });

  return rankedEntries[0]?.entry ?? null;
};

export const matchRecordingsToCalls = (
  catalog: RecordingMatchEntry[],
  calls: CallRecordingLookup[],
  options?: {
    allowSmallFiles?: boolean;
  },
) => {
  const matches: Record<string, RecordingMatchEntry> = {};
  const usedRecordingNames = new Set<string>();

  for (const call of calls) {
    if (!call.id) continue;
    const exactMatch = findRecordingByName(catalog, call.recordingName);
    if (!exactMatch || usedRecordingNames.has(exactMatch.name)) {
      continue;
    }

    matches[call.id] = exactMatch;
    usedRecordingNames.add(exactMatch.name);
  }

  const candidatePairs = calls.flatMap((call, index) => {
    if (!call.id || matches[call.id]) {
      return [];
    }

    return catalog
      .map((entry) => {
        const { score, nearestTimeDistance } = scoreRecordingMatch(entry, call, options);
        return {
          callId: call.id,
          entry,
          index,
          score,
          nearestTimeDistance,
          callTimestamp: getCallRecordingSortTimestamp(call),
        };
      })
      .filter(({ score }) => score >= MIN_RECORDING_MATCH_SCORE);
  });

  candidatePairs.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.nearestTimeDistance !== right.nearestTimeDistance) {
      return left.nearestTimeDistance - right.nearestTimeDistance;
    }
    if (right.entry.size !== left.entry.size) return right.entry.size - left.entry.size;
    if (right.callTimestamp !== left.callTimestamp) return right.callTimestamp - left.callTimestamp;
    return left.index - right.index;
  });

  for (const candidate of candidatePairs) {
    if (matches[candidate.callId] || usedRecordingNames.has(candidate.entry.name)) {
      continue;
    }

    matches[candidate.callId] = candidate.entry;
    usedRecordingNames.add(candidate.entry.name);
  }

  return matches;
};
