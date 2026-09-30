import type { CallRecord } from "@/data/mockData";
import { getBusinessDateString } from "@/lib/businessDate";

type CallDateTimeLike = Pick<CallRecord, "answeredAt" | "ringStartedAt" | "endedAt" | "createdAt" | "date" | "time">;

const DISPLAY_TIME_ZONE = "Asia/Kolkata";

const toTimestamp = (value: string | undefined) => {
  const normalized = String(value || "").trim();
  if (!normalized) return Number.NaN;

  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const normalizeDisplayTime = (value: string | undefined) => {
  const normalized = String(value || "").trim();
  const matched = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!matched) return normalized;

  return [
    String(matched[1]).padStart(2, "0"),
    matched[2],
    matched[3] || "00",
  ].join(":");
};

const getCallEventTimestamp = (call: CallDateTimeLike) => [
  toTimestamp(call.answeredAt),
  toTimestamp(call.ringStartedAt),
  toTimestamp(call.endedAt),
  toTimestamp(call.createdAt),
].find((timestamp) => Number.isFinite(timestamp)) ?? Number.NaN;

const formatEventTimeInDisplayZone = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const readPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const rawHour = readPart("hour");
  const hour = rawHour === "24" ? "00" : rawHour;
  const minute = readPart("minute");
  const second = readPart("second");
  return hour && minute && second ? `${hour}:${minute}:${second}` : "";
};

export const getCallDisplayTimestamp = (call: CallDateTimeLike) => {
  const eventTimestamp = getCallEventTimestamp(call);

  if (Number.isFinite(eventTimestamp)) {
    return eventTimestamp as number;
  }

  const combined = new Date(`${String(call.date || "").trim()}T${String(call.time || "").trim()}`).getTime();
  return Number.isFinite(combined) ? combined : Number.NaN;
};

export const getCallDisplayDate = (call: CallDateTimeLike) => {
  const eventTimestamp = getCallEventTimestamp(call);
  if (Number.isFinite(eventTimestamp)) {
    return getBusinessDateString(new Date(eventTimestamp));
  }

  return String(call.date || "").trim();
};

export const getCallDisplayTime = (
  call: CallDateTimeLike,
  options?: {
    hour12?: boolean;
  },
) => {
  const eventTimestamp = getCallEventTimestamp(call);
  if (Number.isFinite(eventTimestamp)) {
    if (options?.hour12) {
      return new Date(eventTimestamp).toLocaleTimeString("en-IN", {
        timeZone: DISPLAY_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    }
    return formatEventTimeInDisplayZone(eventTimestamp);
  }

  return normalizeDisplayTime(call.time);
};

export const getCallHourBucket = (call: Pick<CallDateTimeLike, "createdAt" | "time">) => {
  const createdAtTimestamp = toTimestamp(call.createdAt);
  if (Number.isFinite(createdAtTimestamp)) {
    const hourPart = new Intl.DateTimeFormat("en-IN", {
      timeZone: DISPLAY_TIME_ZONE,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date(createdAtTimestamp)).find((part) => part.type === "hour")?.value;

    const hour = hourPart === "24" ? "00" : hourPart;
    if (hour) return `${hour.padStart(2, "0")}:00`;
  }

  const normalizedTime = normalizeDisplayTime(call.time);
  const hour = normalizedTime.match(/^(\d{1,2})/u)?.[1];
  return hour ? `${hour.padStart(2, "0")}:00` : "";
};
