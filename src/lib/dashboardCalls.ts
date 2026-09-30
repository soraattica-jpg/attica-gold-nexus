import type { CallRecord } from "@/data/mockData";
import { dedupeCallInteractionsWithSource } from "@/lib/callMetrics";

const getCallTimestamp = (call: Pick<CallRecord, "createdAt" | "date" | "time">) => {
  const createdAt = new Date(call.createdAt || "").getTime();
  if (Number.isFinite(createdAt)) return createdAt;

  const combined = new Date(`${call.date || ""}T${call.time || ""}`).getTime();
  return Number.isFinite(combined) ? combined : 0;
};

export const getCallBusinessDateKey = (call: Pick<CallRecord, "createdAt" | "date">) => {
  const directDate = typeof call.date === "string" ? call.date.trim() : "";
  if (directDate) return directDate;

  const createdAt = new Date(call.createdAt || "");
  if (Number.isNaN(createdAt.getTime())) return "";

  return `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;
};

export const mergeCallsForDate = (
  dashboardCalls: CallRecord[],
  localCalls: CallRecord[],
  dateKey: string,
  options?: {
    agentId?: string;
  },
) => {
  const scopedAgentId = String(options?.agentId || "").trim();
  const matchesScope = (call: Pick<CallRecord, "agentId">) => (
    !scopedAgentId || String(call.agentId || "").trim() === scopedAgentId
  );

  return dedupeCallInteractionsWithSource([
    ...dashboardCalls
      .filter((call) => getCallBusinessDateKey(call) === dateKey && matchesScope(call))
      .map((call) => ({ call, sourcePriority: 0 })),
    ...localCalls
      .filter((call) => getCallBusinessDateKey(call) === dateKey && matchesScope(call))
      .map((call) => ({ call, sourcePriority: 1 })),
  ]).sort((left, right) => getCallTimestamp(right) - getCallTimestamp(left));
};
