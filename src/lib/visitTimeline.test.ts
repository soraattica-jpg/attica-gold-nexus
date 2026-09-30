import { describe, expect, it } from "vitest";

import { getVisitTimelineSummary } from "@/lib/visitTimeline";

describe("visitTimeline", () => {
  it("returns a formatted visit timeline for tentative and planned visit statuses", () => {
    expect(getVisitTimelineSummary({
      formStatus: "Tentative Visit",
      statusFollowUpAt: "2026-04-17T10:30:00.000Z",
    })?.label).toBe("Tentative Visit");

    expect(getVisitTimelineSummary({
      formStatus: "Planning to Visit",
      statusFollowUpAt: "2026-04-17T10:30:00.000Z",
    })?.label).toBe("Planned Visit");
  });

  it("ignores statuses without a visit timeline or invalid timestamps", () => {
    expect(getVisitTimelineSummary({
      formStatus: "Pending",
      statusFollowUpAt: "2026-04-17T10:30:00.000Z",
    })).toBeNull();

    expect(getVisitTimelineSummary({
      formStatus: "Tentative Visit",
      statusFollowUpAt: "invalid",
    })).toBeNull();
  });
});
