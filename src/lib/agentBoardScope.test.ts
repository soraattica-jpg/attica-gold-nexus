import { describe, expect, it } from "vitest";

import { isBoardScopedAgentId, partitionBoardScopedCalls } from "@/lib/agentBoardScope";

describe("agentBoardScope", () => {
  it("recognizes AG0 agent ids as board-scoped assigned agents", () => {
    expect(isBoardScopedAgentId("AG001")).toBe(true);
    expect(isBoardScopedAgentId(" AG032 ")).toBe(true);
    expect(isBoardScopedAgentId("No Agent")).toBe(false);
    expect(isBoardScopedAgentId("")).toBe(false);
    expect(isBoardScopedAgentId(undefined)).toBe(false);
  });

  it("partitions assigned and unassigned calls by the shared board filter", () => {
    const calls = [
      { id: "1", agentId: "AG001" },
      { id: "2", agentId: "No Agent" },
      { id: "3", agentId: "" },
      { id: "4", agentId: "AG021" },
    ];

    const result = partitionBoardScopedCalls(calls);

    expect(result.assigned.map((call) => call.id)).toEqual(["1", "4"]);
    expect(result.unassigned.map((call) => call.id)).toEqual(["2", "3"]);
  });
});
