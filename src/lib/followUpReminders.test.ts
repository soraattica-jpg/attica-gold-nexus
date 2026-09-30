import { describe, expect, it } from "vitest";

import {
  getFollowUpDismissKey,
  isDueFollowUp,
  isOpenFollowUpStatus,
  pickNextDueFollowUp,
} from "@/lib/followUpReminders";
import type { FollowUpRecord } from "@/data/mockData";

const NOW = Date.UTC(2026, 3, 20, 10, 0, 0);

const buildFollowUp = (overrides: Partial<FollowUpRecord> = {}): FollowUpRecord => ({
  id: "FU-1",
  customerName: "Customer",
  phone: "9998887776",
  branch: "Chennai",
  followUpAt: new Date(NOW - 60_000).toISOString(),
  status: "Pending",
  agentId: "AG001",
  agentName: "Agent 1",
  notes: "",
  outcome: "",
  updatedAt: new Date(NOW - 120_000).toISOString(),
  ...overrides,
});

describe("followUpReminders", () => {
  it("treats rescheduled follow-ups as still open work", () => {
    expect(isOpenFollowUpStatus("Pending")).toBe(true);
    expect(isOpenFollowUpStatus("Rescheduled")).toBe(true);
    expect(isOpenFollowUpStatus("Called")).toBe(false);
  });

  it("keeps rescheduled follow-ups eligible once their new time is due", () => {
    expect(isDueFollowUp(buildFollowUp({ status: "Rescheduled" }), NOW)).toBe(true);
    expect(isDueFollowUp(buildFollowUp({ status: "Rescheduled", followUpAt: new Date(NOW + 60_000).toISOString() }), NOW)).toBe(false);
  });

  it("picks the earliest due follow-up for the current agent while skipping dismissed ids", () => {
    const result = pickNextDueFollowUp([
      buildFollowUp({ id: "FU-3", agentId: "AG002", followUpAt: new Date(NOW - 180_000).toISOString() }),
      buildFollowUp({ id: "FU-2", followUpAt: new Date(NOW - 120_000).toISOString() }),
      buildFollowUp({ id: "FU-1", followUpAt: new Date(NOW - 240_000).toISOString() }),
    ], {
      agentId: "AG001",
      excludeIds: ["FU-1"],
      now: NOW,
    });

    expect(result?.id).toBe("FU-2");
  });

  it("builds a dismiss key that changes when reminder timing changes", () => {
    const followUp = buildFollowUp({
      id: "FU-7",
      followUpAt: new Date(NOW - 60_000).toISOString(),
      updatedAt: new Date(NOW - 30_000).toISOString(),
      status: "Pending",
    });

    expect(getFollowUpDismissKey(followUp)).toBe(`FU-7|${followUp.followUpAt}|${followUp.updatedAt}|Pending`);
    expect(getFollowUpDismissKey({
      ...followUp,
      followUpAt: new Date(NOW + 60_000).toISOString(),
    })).not.toBe(getFollowUpDismissKey(followUp));
  });
});
