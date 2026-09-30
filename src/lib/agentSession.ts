import type { BreakLogRecord } from "@/lib/api";
import { BUSINESS_TIME_ZONE } from "@/lib/businessDate";

const CLOCK_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i;

export function parseDurationToSeconds(value: string | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return 0;

  const minuteMatch = normalized.match(/^(\d+)\s*min(?:ute)?s?$/);
  if (minuteMatch) {
    return Number(minuteMatch[1] || 0) * 60;
  }

  const timeParts = normalized.split(":").map((part) => Number(part));
  if (timeParts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (timeParts.length === 2) {
    const [minutes = 0, seconds = 0] = timeParts;
    return (minutes * 60) + seconds;
  }

  if (timeParts.length === 3) {
    const [hours = 0, minutes = 0, seconds = 0] = timeParts;
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return 0;
}

export function formatSessionDuration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSessionEventTime(value: string | number | Date | null | undefined) {
  const timestamp = toTimestamp(value);
  if (Number.isNaN(timestamp)) return "";

  return new Date(timestamp).toLocaleTimeString("en-IN", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function toTimestamp(value: string | number | Date | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }

  const normalized = String(value || "").trim();
  if (!normalized) return Number.NaN;

  const parsed = new Date(normalized);
  return parsed.getTime();
}

function parseClockTimeOnReferenceDay(value: string | undefined, referenceTimestamp: number) {
  const normalized = String(value || "").trim();
  if (!normalized || Number.isNaN(referenceTimestamp)) return Number.NaN;

  const match = normalized.match(CLOCK_TIME_PATTERN);
  if (!match) return Number.NaN;

  const [, hoursRaw, minutesRaw, secondsRaw, meridiemRaw] = match;
  let hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);
  const seconds = Number(secondsRaw || 0);

  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return Number.NaN;
  }

  const meridiem = meridiemRaw?.toUpperCase();
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  } else if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  const referenceDate = new Date(referenceTimestamp);
  referenceDate.setHours(hours, minutes, seconds, 0);
  return referenceDate.getTime();
}

function getBreakWindowStart(log: BreakLogRecord, fallbackReferenceTimestamp: number) {
  const startedAtTimestamp = toTimestamp(log.startedAt);
  if (!Number.isNaN(startedAtTimestamp)) {
    return startedAtTimestamp;
  }

  const createdAtTimestamp = toTimestamp(log.createdAt);
  if (!Number.isNaN(createdAtTimestamp)) {
    return createdAtTimestamp;
  }

  return parseClockTimeOnReferenceDay(log.startTime, fallbackReferenceTimestamp);
}

function getBreakWindowEnd(log: BreakLogRecord, startTimestamp: number, fallbackEndTimestamp: number) {
  const endedAtTimestamp = toTimestamp(log.endedAt);
  if (!Number.isNaN(endedAtTimestamp)) {
    return endedAtTimestamp;
  }

  const durationSeconds = parseDurationToSeconds(log.duration);
  if (!Number.isNaN(startTimestamp) && durationSeconds > 0) {
    return startTimestamp + (durationSeconds * 1000);
  }

  const parsedEndTimestamp = parseClockTimeOnReferenceDay(log.endTime, Number.isNaN(startTimestamp) ? fallbackEndTimestamp : startTimestamp);
  if (!Number.isNaN(parsedEndTimestamp)) {
    if (!Number.isNaN(startTimestamp) && parsedEndTimestamp < startTimestamp) {
      return parsedEndTimestamp + 24 * 60 * 60 * 1000;
    }
    return parsedEndTimestamp;
  }

  if (!log.endTime) {
    return fallbackEndTimestamp;
  }

  return Number.NaN;
}

export function getBreakDurationSecondsForSession(args: {
  breakLogs: BreakLogRecord[];
  agentId: string;
  sessionStartedAt?: string | number | Date | null;
  sessionEndedAt?: string | number | Date | null;
  now?: number;
}) {
  const {
    breakLogs,
    agentId,
    sessionStartedAt,
    sessionEndedAt,
    now = Date.now(),
  } = args;

  const sessionStart = toTimestamp(sessionStartedAt);
  if (Number.isNaN(sessionStart)) return 0;

  const sessionEnd = Number.isNaN(toTimestamp(sessionEndedAt)) ? now : toTimestamp(sessionEndedAt);
  if (sessionEnd <= sessionStart) return 0;

  return breakLogs
    .filter((log) => log.agentId === agentId)
    .reduce((sum, log) => {
      const breakStart = getBreakWindowStart(log, sessionStart);
      const breakEnd = getBreakWindowEnd(log, breakStart, sessionEnd);

      if (!Number.isNaN(breakStart) && !Number.isNaN(breakEnd)) {
        const overlapStart = Math.max(breakStart, sessionStart);
        const overlapEnd = Math.min(breakEnd, sessionEnd);
        if (overlapEnd > overlapStart) {
          return sum + Math.floor((overlapEnd - overlapStart) / 1000);
        }
        return sum;
      }

      const durationSeconds = parseDurationToSeconds(log.duration);
      return sum + durationSeconds;
    }, 0);
}

export function getActiveSessionDurationSeconds(args: {
  sessionStartedAt?: string | number | Date | null;
  sessionEndedAt?: string | number | Date | null;
  breakDurationSeconds?: number;
  now?: number;
}) {
  const {
    sessionStartedAt,
    sessionEndedAt,
    breakDurationSeconds = 0,
    now = Date.now(),
  } = args;

  const sessionStart = toTimestamp(sessionStartedAt);
  if (Number.isNaN(sessionStart)) return 0;

  const sessionEnd = Number.isNaN(toTimestamp(sessionEndedAt)) ? now : toTimestamp(sessionEndedAt);
  if (sessionEnd <= sessionStart) return 0;

  return Math.max(0, Math.floor((sessionEnd - sessionStart) / 1000) - breakDurationSeconds);
}
