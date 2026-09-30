import { api, type AgentRecord } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";

let cachedAgents: AgentRecord[] = [];

const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

export function useAgentDirectory(refreshMs = 30000) {
  const [agents, setAgents] = useState<AgentRecord[]>(cachedAgents);

  const loadAgents = useCallback(async () => {
    const nextAgents = await api.getAgents();
    if (Array.isArray(nextAgents)) {
      cachedAgents = nextAgents;
      setAgents(nextAgents);
    }
  }, []);

  useEffect(() => {
    if (cachedAgents.length > 0) {
      setAgents(cachedAgents);
    } else {
      void loadAgents();
    }
    if (refreshMs <= 0) return;
    const interval = window.setInterval(() => {
      void loadAgents();
    }, refreshMs);
    return () => window.clearInterval(interval);
  }, [loadAgents, refreshMs]);

  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, normalizeOptionalString(agent.name) || agent.id])),
    [agents],
  );

  const resolveAgentName = useCallback((agentId?: string, fallback?: string) => {
    if (agentId && agentNameById.has(agentId)) {
      return agentNameById.get(agentId) || fallback || agentId;
    }
    return fallback || agentId || "—";
  }, [agentNameById]);

  return {
    agents,
    loadAgents,
    agentNameById,
    resolveAgentName,
  };
}
