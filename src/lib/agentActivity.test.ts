import { describe, expect, it } from "vitest";

import { buildAgentActivityRows } from "@/lib/agentActivity";
import type { AgentRecord, LiveAgentRecord } from "@/lib/api";
import type { AgentCallMetrics } from "@/lib/callMetrics";

describe("agentActivity", () => {
  it("defaults to live snapshot call counts when metric preference is not enabled", () => {
    const directoryAgents: AgentRecord[] = [{
      id: "AG001",
      name: "Agent 1",
      email: "agent1@example.com",
      role: "agent",
      extension: "2001",
      isLoggedIn: true,
    }];
    const liveAgents: LiveAgentRecord[] = [{
      agentId: "AG001",
      agentName: "Agent 1",
      extension: "2001",
      status: "available",
      callsToday: 7,
      inboundToday: 3,
      outboundToday: 4,
      followUpsPending: 2,
    }];
    const metricsByAgentId = new Map<string, AgentCallMetrics>([[
      "AG001",
      {
        agentId: "AG001",
        totalCalls: 10,
        inboundCalls: 6,
        outboundCalls: 4,
        connectedCalls: 8,
        missedCalls: 1,
        totalDurationSeconds: 320,
      },
    ]]);

    const rows = buildAgentActivityRows(directoryAgents, liveAgents, metricsByAgentId, {
      agentIdPrefix: "AG0",
      includeSeedAgents: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentId: "AG001",
      totalCalls: 7,
      inboundCalls: 3,
      outboundCalls: 4,
      totalTalkTimeSeconds: 320,
      followUpsPending: 2,
      isLoggedIn: true,
      status: "available",
    });
  });

  it("uses deduped call metrics when metric preference is enabled", () => {
    const directoryAgents: AgentRecord[] = [{
      id: "AG001",
      name: "Agent 1",
      email: "agent1@example.com",
      role: "agent",
      extension: "2001",
      isLoggedIn: true,
    }];
    const liveAgents: LiveAgentRecord[] = [{
      agentId: "AG001",
      agentName: "Agent 1",
      extension: "2001",
      status: "available",
      callsToday: 7,
      inboundToday: 3,
      outboundToday: 4,
      followUpsPending: 2,
    }];
    const metricsByAgentId = new Map<string, AgentCallMetrics>([[
      "AG001",
      {
        agentId: "AG001",
        totalCalls: 10,
        inboundCalls: 6,
        outboundCalls: 4,
        connectedCalls: 8,
        missedCalls: 1,
        totalDurationSeconds: 320,
      },
    ]]);

    const rows = buildAgentActivityRows(directoryAgents, liveAgents, metricsByAgentId, {
      agentIdPrefix: "AG0",
      includeSeedAgents: false,
      preferCallMetrics: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentId: "AG001",
      totalCalls: 10,
      inboundCalls: 6,
      outboundCalls: 4,
      totalTalkTimeSeconds: 320,
      followUpsPending: 2,
      isLoggedIn: true,
      status: "available",
    });
  });

  it("includes seeded AG agents even when live data is sparse", () => {
    const rows = buildAgentActivityRows([], [], new Map(), {
      agentIdPrefix: "AG0",
      includeSeedAgents: true,
    });

    expect(rows.some((row) => row.agentId === "AG001")).toBe(true);
  });
});
