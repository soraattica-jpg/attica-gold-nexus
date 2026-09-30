import { parseDurationToSeconds } from "@/lib/agentSession";

export function formatCallDurationFromSeconds(value: number) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function normalizeCallDuration(value?: string | null, fallback = "00:00") {
  const totalSeconds = parseDurationToSeconds(value || "");
  if (totalSeconds <= 0) {
    return fallback;
  }
  return formatCallDurationFromSeconds(totalSeconds);
}

export function formatCallDurationForExport(value?: string | null, secondsValue?: number | null) {
  const totalSeconds = Math.max(
    0,
    Math.floor(Number(secondsValue) || 0),
    parseDurationToSeconds(value || ""),
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getLongerCallDuration(...values: Array<string | null | undefined>) {
  const totalSeconds = values.reduce((maxValue, value) => Math.max(maxValue, parseDurationToSeconds(value || "")), 0);
  return formatCallDurationFromSeconds(totalSeconds);
}
