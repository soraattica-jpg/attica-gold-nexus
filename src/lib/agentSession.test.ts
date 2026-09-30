import { describe, expect, it } from "vitest";

import {
  formatSessionDuration,
  getActiveSessionDurationSeconds,
  getBreakDurationSecondsForSession,
  parseDurationToSeconds,
} from "@/lib/agentSession";

describe("agentSession", () => {
  it("parses common duration formats", () => {
    expect(parseDurationToSeconds("05:30")).toBe(330);
    expect(parseDurationToSeconds("01:05:30")).toBe(3930);
    expect(parseDurationToSeconds("12 mins")).toBe(720);
  });

  it("computes break overlap and active duration for a login session", () => {
    const sessionStartedAt = "2026-04-16T09:00:00.000Z";
    const sessionEndedAt = "2026-04-16T10:00:00.000Z";
    const breakLogs = [
      {
        id: "BRK-1",
        agentId: "AG001",
        agentName: "Agent 1",
        startTime: "02:35 PM",
        endTime: "02:45 PM",
        duration: "00:10:00",
        createdAt: "2026-04-16T09:15:00.000Z",
      },
      {
        id: "BRK-2",
        agentId: "AG001",
        agentName: "Agent 1",
        startTime: "03:05 PM",
        duration: "00:05:00",
        createdAt: "2026-04-16T09:45:00.000Z",
      },
    ];

    const breakSeconds = getBreakDurationSecondsForSession({
      breakLogs,
      agentId: "AG001",
      sessionStartedAt,
      sessionEndedAt,
    });
    const activeSeconds = getActiveSessionDurationSeconds({
      sessionStartedAt,
      sessionEndedAt,
      breakDurationSeconds: breakSeconds,
    });

    expect(breakSeconds).toBe(900);
    expect(activeSeconds).toBe(2700);
    expect(formatSessionDuration(activeSeconds)).toBe("00:45:00");
  });

  it("does not count break duration from a previous day when it does not overlap the session", () => {
    const sessionStartedAt = "2026-04-17T10:57:04.000Z";
    const sessionEndedAt = "2026-04-17T10:59:26.000Z";
    const breakLogs = [
      {
        id: "BRK-STALE",
        agentId: "AG001",
        agentName: "Agent 1",
        startTime: "04:48 AM",
        endTime: "10:57 AM",
        duration: "30:09:01",
        createdAt: "2026-04-16T04:48:03.000Z",
      },
    ];

    const breakSeconds = getBreakDurationSecondsForSession({
      breakLogs,
      agentId: "AG001",
      sessionStartedAt,
      sessionEndedAt,
    });
    const activeSeconds = getActiveSessionDurationSeconds({
      sessionStartedAt,
      sessionEndedAt,
      breakDurationSeconds: breakSeconds,
    });

    expect(breakSeconds).toBe(0);
    expect(activeSeconds).toBe(142);
  });

  it("prefers explicit startedAt and endedAt timestamps over createdAt and duration text", () => {
    const sessionStartedAt = "2026-04-24T06:00:00.000Z";
    const sessionEndedAt = "2026-04-24T07:00:00.000Z";
    const breakLogs = [
      {
        id: "BRK-EXPLICIT",
        agentId: "AG008",
        agentName: "Agent 8",
        breakType: "restroom-break",
        startTime: "11:58 AM",
        endTime: "12:06 PM",
        duration: "00:00",
        createdAt: "2026-04-24T06:30:00.000Z",
        startedAt: "2026-04-24T06:10:00.000Z",
        endedAt: "2026-04-24T06:18:00.000Z",
      },
    ];

    const breakSeconds = getBreakDurationSecondsForSession({
      breakLogs,
      agentId: "AG008",
      sessionStartedAt,
      sessionEndedAt,
    });

    expect(breakSeconds).toBe(480);
    expect(formatSessionDuration(breakSeconds)).toBe("00:08:00");
  });
});
