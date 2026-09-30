import type { FollowUpRecord } from "@/data/mockData";

export const isOpenFollowUpStatus = (
  status: FollowUpRecord["status"] | string | null | undefined,
) => status === "Pending" || status === "Rescheduled";

export const getFollowUpDismissKey = (
  item: Pick<FollowUpRecord, "id" | "followUpAt" | "updatedAt" | "status"> | null | undefined,
) => (
  item
    ? [
        String(item.id || "").trim(),
        String(item.followUpAt || "").trim(),
        String(item.updatedAt || "").trim(),
        String(item.status || "").trim(),
      ].join("|")
    : ""
);

export const getFollowUpTimestamp = (value: string | null | undefined) => {
  const timestamp = new Date(String(value || "")).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const isDueFollowUp = (
  item: Pick<FollowUpRecord, "status" | "followUpAt">,
  now = Date.now(),
) => {
  const timestamp = getFollowUpTimestamp(item.followUpAt);
  return timestamp !== null && timestamp <= now && isOpenFollowUpStatus(item.status);
};

export const pickNextDueFollowUp = (
  followUps: FollowUpRecord[],
  options?: {
    agentId?: string | null;
    excludeIds?: Iterable<string>;
    now?: number;
  },
) => {
  const agentId = options?.agentId?.trim() || "";
  const excludedIds = new Set(options?.excludeIds || []);
  const now = options?.now ?? Date.now();

  return followUps
    .filter((item) => {
      if (agentId && item.agentId !== agentId) return false;
      if (excludedIds.has(item.id)) return false;
      return isDueFollowUp(item, now);
    })
    .sort((left, right) => {
      const leftTime = getFollowUpTimestamp(left.followUpAt) ?? Number.MAX_SAFE_INTEGER;
      const rightTime = getFollowUpTimestamp(right.followUpAt) ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;

      const leftUpdatedAt = getFollowUpTimestamp(left.updatedAt) ?? 0;
      const rightUpdatedAt = getFollowUpTimestamp(right.updatedAt) ?? 0;
      if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt - rightUpdatedAt;

      return left.id.localeCompare(right.id);
    })[0] ?? null;
};
