export const isBoardScopedAgentId = (agentId: string | undefined) => (
  String(agentId || "").trim().startsWith("AG0")
);

export function partitionBoardScopedCalls<T extends { agentId?: string }>(calls: T[]) {
  const assigned: T[] = [];
  const unassigned: T[] = [];

  calls.forEach((call) => {
    if (isBoardScopedAgentId(call.agentId)) {
      assigned.push(call);
      return;
    }
    unassigned.push(call);
  });

  return { assigned, unassigned };
}
