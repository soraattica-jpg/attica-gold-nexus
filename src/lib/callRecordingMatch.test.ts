import { describe, expect, it } from "vitest";

import { findBestRecordingMatch, getCallRecordingReferenceTimes, scoreRecordingMatch, type RecordingMatchEntry } from "@/lib/callRecordingMatch";

const buildRecording = (overrides: Partial<RecordingMatchEntry> = {}): RecordingMatchEntry => ({
  name: "20260418-075044-7022452883-inbound.wav",
  haystack: "20260418-075044-7022452883-inbound.wav 20260418 075044 7022452883 inbound",
  recordedAt: new Date("2026-04-18T07:50:44.000Z").getTime(),
  size: 5000,
  ...overrides,
});

describe("callRecordingMatch", () => {
  it("prefers the closest same-direction recording for a call", () => {
    const call = {
      callerId: "7022452883",
      direction: "incoming" as const,
      ringStartedAt: "2026-04-18T07:50:45.000Z",
      answeredAt: "2026-04-18T07:51:06.000Z",
      endedAt: "2026-04-18T07:52:28.000Z",
      createdAt: "2026-04-18T07:50:45.000Z",
    };
    const correctMatch = buildRecording();
    const wrongTime = buildRecording({
      name: "20260418-082000-7022452883-inbound.wav",
      haystack: "20260418-082000-7022452883-inbound.wav 20260418 082000 7022452883 inbound",
      recordedAt: new Date("2026-04-18T08:20:00.000Z").getTime(),
    });
    const wrongDirection = buildRecording({
      name: "20260418-075044-68711200-7022452883.wav",
      haystack: "20260418-075044-68711200-7022452883.wav 20260418 075044 68711200 7022452883",
    });

    expect(findBestRecordingMatch([wrongTime, wrongDirection, correctMatch], call)).toEqual(correctMatch);
  });

  it("does not match a different phone number just because the timestamp is close", () => {
    const call = {
      callerId: "7022452883",
      direction: "incoming" as const,
      ringStartedAt: "2026-04-18T07:50:59.000Z",
      answeredAt: "2026-04-18T07:51:06.000Z",
      endedAt: "2026-04-18T07:51:07.000Z",
      createdAt: "2026-04-18T07:51:07.000Z",
    };
    const wrongNumberSameMinute = buildRecording({
      name: "20260418-075044-919059584409-inbound.wav",
      haystack: "20260418-075044-919059584409-inbound.wav 20260418 075044 919059584409 inbound",
      recordedAt: new Date("2026-04-18T07:50:44.000Z").getTime(),
    });

    expect(findBestRecordingMatch([wrongNumberSameMinute], call)).toBeNull();
  });

  it("does not match a same-number recording that only contains the wav header", () => {
    const call = {
      callerId: "7022452883",
      direction: "incoming" as const,
      ringStartedAt: "2026-04-18T07:50:59.000Z",
      answeredAt: "2026-04-18T07:51:06.000Z",
      endedAt: "2026-04-18T07:51:07.000Z",
      createdAt: "2026-04-18T07:51:07.000Z",
    };
    const tinySameNumberRecording = buildRecording({
      name: "20260418-075044-917022452883-inbound.wav",
      haystack: "20260418-075044-917022452883-inbound.wav 20260418 075044 917022452883 inbound",
      recordedAt: new Date("2026-04-18T07:50:44.000Z").getTime(),
      size: 44,
    });

    expect(findBestRecordingMatch([tinySameNumberRecording], call)).toBeNull();
  });

  it("can still identify a header-only same-number recording when small files are allowed", () => {
    const call = {
      callerId: "7022452883",
      direction: "incoming" as const,
      ringStartedAt: "2026-04-18T07:50:59.000Z",
      answeredAt: "2026-04-18T07:51:06.000Z",
      endedAt: "2026-04-18T07:51:07.000Z",
      createdAt: "2026-04-18T07:51:07.000Z",
    };
    const tinySameNumberRecording = buildRecording({
      name: "20260418-075044-917022452883-inbound.wav",
      haystack: "20260418-075044-917022452883-inbound.wav 20260418 075044 917022452883 inbound",
      recordedAt: new Date("2026-04-18T07:50:44.000Z").getTime(),
      size: 44,
    });

    expect(findBestRecordingMatch([tinySameNumberRecording], call, { allowSmallFiles: true })).toEqual(tinySameNumberRecording);
  });

  it("does not match a same-number recording that is too far from the call time", () => {
    const call = {
      callerId: "7022452883",
      direction: "outgoing" as const,
      ringStartedAt: "2026-04-18T07:47:12.000Z",
      answeredAt: "2026-04-18T07:47:20.000Z",
      endedAt: "2026-04-18T07:48:34.000Z",
      createdAt: "2026-04-18T07:47:10.000Z",
    };
    const farAwayRecording = buildRecording({
      name: "20260418-090500-68711200-7022452883.wav",
      haystack: "20260418-090500-68711200-7022452883.wav 20260418 090500 68711200 7022452883",
      recordedAt: new Date("2026-04-18T09:05:00.000Z").getTime(),
    });

    expect(findBestRecordingMatch([farAwayRecording], call)).toBeNull();
  });

  it("uses the earliest live call timestamps when scoring a recording", () => {
    const call = {
      callerId: "7022452883",
      direction: "incoming" as const,
      ringStartedAt: "2026-04-18T07:50:44.000Z",
      answeredAt: "2026-04-18T07:51:06.000Z",
      endedAt: "2026-04-18T07:52:28.000Z",
      createdAt: "2026-04-18T07:51:10.000Z",
    };
    const match = buildRecording();

    expect(getCallRecordingReferenceTimes(call)).toEqual([
      new Date("2026-04-18T07:50:44.000Z").getTime(),
      new Date("2026-04-18T07:51:06.000Z").getTime(),
      new Date("2026-04-18T07:51:10.000Z").getTime(),
      new Date("2026-04-18T07:52:28.000Z").getTime(),
    ]);
    expect(scoreRecordingMatch(match, call).score).toBeGreaterThan(300);
  });
});
