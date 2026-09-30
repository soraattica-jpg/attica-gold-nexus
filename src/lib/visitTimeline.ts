type VisitTimelineSource = {
  formStatus?: string | null;
  statusFollowUpAt?: string | null;
};

const VISIT_TIMELINE_STATUSES = new Map<string, string>([
  ["planning to visit", "Planned Visit"],
  ["tentative visit", "Tentative Visit"],
]);

export function getVisitTimelineSummary(source: VisitTimelineSource): { label: string; formatted: string } | null {
  const normalizedStatus = String(source.formStatus || "").trim().toLowerCase();
  const label = VISIT_TIMELINE_STATUSES.get(normalizedStatus);
  if (!label) return null;

  const rawValue = String(source.statusFollowUpAt || "").trim();
  if (!rawValue) return null;

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    label,
    formatted: parsed.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}
