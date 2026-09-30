import { describe, expect, it } from "vitest";

import { getCallDisplayDate, getCallDisplayTime, getCallDisplayTimestamp } from "@/lib/callDateTime";

describe("callDateTime", () => {
  it("prefers answeredAt over stale createdAt and raw time", () => {
    const call = {
      answeredAt: "2026-04-20T11:20:00.000Z",
      ringStartedAt: "2026-04-20T11:19:45.000Z",
      endedAt: "2026-04-20T11:21:01.000Z",
      createdAt: "2026-04-20T11:13:00.000Z",
      date: "2026-04-20",
      time: "11:13",
    };

    expect(getCallDisplayTimestamp(call)).toBe(new Date("2026-04-20T11:20:00.000Z").getTime());
    expect(getCallDisplayDate(call)).toBe("2026-04-20");
    expect(getCallDisplayTime(call)).toBe("16:50:00");
  });

  it("falls back to ringStartedAt when the call was never answered", () => {
    const call = {
      answeredAt: "",
      ringStartedAt: "2026-04-20T09:45:00.000Z",
      endedAt: "2026-04-20T09:45:20.000Z",
      createdAt: "",
      date: "2026-04-20",
      time: "09:40",
    };

    expect(getCallDisplayTime(call)).toBe("15:15:00");
  });

  it("falls back to raw date and time when no event timestamps exist", () => {
    const call = {
      answeredAt: "",
      ringStartedAt: "",
      endedAt: "",
      createdAt: "",
      date: "2026-04-20",
      time: "11:13",
    };

    expect(getCallDisplayDate(call)).toBe("2026-04-20");
    expect(getCallDisplayTime(call)).toBe("11:13:00");
  });

  it("shows the canonical call timestamp in IST instead of a stale UTC clock field", () => {
    const call = {
      answeredAt: "2026-09-01T06:00:56.000Z",
      ringStartedAt: "2026-09-01T06:00:55.000Z",
      endedAt: "2026-09-01T06:04:05.000Z",
      createdAt: "2026-09-01T06:00:56.000Z",
      date: "2026-09-01",
      time: "06:00:56",
    };

    expect(getCallDisplayTime(call)).toBe("11:30:56");
  });

  it("formats midnight in the 00 hour instead of the locale-specific 24 hour", () => {
    const call = {
      answeredAt: "2026-08-01T19:23:55.000Z",
      ringStartedAt: "",
      endedAt: "",
      createdAt: "",
      date: "2026-08-02",
      time: "19:23:55",
    };

    expect(getCallDisplayTime(call)).toBe("00:53:55");
  });
});
