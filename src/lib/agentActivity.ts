import { agents as seedAgents, type CallRecord } from "@/data/mockData";
import type { AgentRecord, LiveAgentRecord } from "@/lib/api";
import type { AgentCallMetrics } from "@/lib/callMetrics";

export type AgentActivityRow = {
  agentId: string;
  agentName: string;
  extension: string;
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  totalTalkTimeSeconds: number;
  isLoggedIn: boolean;
  status: string;
  followUpsPending: number;
  convertedBills: number;
  enquiryToday: number;
  releaseToday: number;
  convertedTotal: number;
  followUpStartedAt?: string;
  followUpDuration?: string;
};

type BuildAgentActivityRowsOptions = {
  agentIdPrefix?: string;
  includeSeedAgents?: boolean;
  preferCallMetrics?: boolean;
};

const normalizeAgentId = (value: string | undefined) => String(value || "").trim();

const matchesAgentIdPrefix = (agentId: string, agentIdPrefix: string) => (
  !agentIdPrefix || agentId.startsWith(agentIdPrefix)
);

const getNonNegativeCount = (value: unknown) => Math.max(0, Number(value) || 0);

const resolveLiveAgentDisplayStatus = (liveAgent: LiveAgentRecord | undefined, fallbackStatus: string) => {
  if (!liveAgent) return fallbackStatus;
  const status = String(liveAgent.status || "").trim().toLowerCase();
  const sipStatus = String(liveAgent.sipStatus || "").trim().toLowerCase();
  if (status === "on-call" || getNonNegativeCount(liveAgent.activeCalls) > 0) return liveAgent.status || "on-call";
  if (status === "ringing" || status === "dialing" || sipStatus === "ringing") return status;
  if (getNonNegativeCount(liveAgent.activeAutoDialCount) > 0) return "dialing";
  return liveAgent.status || fallbackStatus;
};

export function buildAgentActivityRows(
  directoryAgents: AgentRecord[],
  liveAgents: LiveAgentRecord[],
  agentCallMetricsById: Map<string, AgentCallMetrics> = new Map(),
  options: BuildAgentActivityRowsOptions = {},
) {
  const agentIdPrefix = String(options.agentIdPrefix || "").trim();
  const includeSeedAgents = options.includeSeedAgents === true;
  const preferCallMetrics = options.preferCallMetrics === true;
  const directoryById = new Map(
    directoryAgents
      .filter((agent) => agent.role === "agent")
      .map((agent) => [agent.id, agent]),
  );
  const liveById = new Map(
    liveAgents
      .filter((agent) => normalizeAgentId(agent.agentId))
      .map((agent) => [normalizeAgentId(agent.agentId), agent]),
  );
  const seededAgentIds = includeSeedAgents
    ? seedAgents
        .filter((agent) => agent.role === "agent")
        .map((agent) => agent.id)
        .filter((agentId) => matchesAgentIdPrefix(agentId, agentIdPrefix))
    : [];
  const ids = Array.from(new Set([
    ...seededAgentIds,
    ...directoryAgents
      .filter((agent) => agent.role === "agent")
      .map((agent) => normalizeAgentId(agent.id))
      .filter((agentId) => matchesAgentIdPrefix(agentId, agentIdPrefix)),
    ...liveAgents
      .map((agent) => normalizeAgentId(agent.agentId))
      .filter((agentId) => matchesAgentIdPrefix(agentId, agentIdPrefix)),
  ])).sort((left, right) => left.localeCompare(right));

  return ids.map((agentId) => {
    const directoryAgent = directoryById.get(agentId);
    const liveAgent = liveById.get(agentId);
    const callMetrics = agentCallMetricsById.get(agentId);
    const usesLiveSnapshotCounts = Boolean(liveAgent) && !preferCallMetrics;

    return {
      agentId,
      agentName: String(directoryAgent?.name || liveAgent?.agentName || agentId).trim() || agentId,
      extension: String(directoryAgent?.extension || liveAgent?.extension || "").trim(),
      totalCalls: usesLiveSnapshotCounts
        ? getNonNegativeCount(liveAgent?.callsToday)
        : getNonNegativeCount(callMetrics?.totalCalls),
      inboundCalls: usesLiveSnapshotCounts
        ? getNonNegativeCount(liveAgent?.inboundToday)
        : getNonNegativeCount(callMetrics?.inboundCalls),
      outboundCalls: usesLiveSnapshotCounts
        ? getNonNegativeCount(liveAgent?.outboundToday)
        : getNonNegativeCount(callMetrics?.outboundCalls),
      totalTalkTimeSeconds: getNonNegativeCount(callMetrics?.totalDurationSeconds),
      isLoggedIn: directoryAgent?.isLoggedIn === true,
      status: String(resolveLiveAgentDisplayStatus(liveAgent, directoryAgent?.status || "offline")).trim() || "offline",
      followUpsPending: getNonNegativeCount(liveAgent?.followUpsPending),
      convertedBills: getNonNegativeCount(liveAgent?.convertedBills),
      enquiryToday: getNonNegativeCount(liveAgent?.enquiryToday),
      releaseToday: getNonNegativeCount(liveAgent?.releaseToday),
      convertedTotal: getNonNegativeCount(liveAgent?.convertedTotal),
      followUpStartedAt: liveAgent?.followUpStartedAt,
      followUpDuration: liveAgent?.followUpDuration,
    } satisfies AgentActivityRow;
  });
}
