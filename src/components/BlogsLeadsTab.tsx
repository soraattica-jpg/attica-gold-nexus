import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, PhoneCall, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import TablePagination from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, type WebsiteLeadRecord } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";

function getQueueBadge(status?: string) {
  const normalized = String(status || "idle").trim().toLowerCase();
  if (normalized === "completed" || normalized === "dialing") return "success-badge";
  if (normalized === "assigned") return "done-badge";
  if (normalized === "failed") return "danger-badge";
  if (normalized === "queued" || normalized === "pending") return "warning-badge";
  return "done-badge";
}

function isQueuedOrClosedStatus(status?: string) {
  return ["queued", "pending", "assigned", "dialing", "completed"].includes(String(status || "").trim().toLowerCase());
}

function isBlockedFailedLead(lead: WebsiteLeadRecord) {
  const normalizedStatus = String(lead.autoDialStatus || "").trim().toLowerCase();
  if (normalizedStatus !== "failed") return false;
  return lead.autoDialRetryAllowed === false || Boolean(String(lead.autoDialQueueExitReason || "").trim());
}

export default function BlogsLeadsTab({ active }: { active: boolean }) {
  const [leads, setLeads] = useState<WebsiteLeadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [queueingAll, setQueueingAll] = useState(false);
  const [queueingLeadId, setQueueingLeadId] = useState("");
  const [exportingFollowUps, setExportingFollowUps] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [todayReceived, setTodayReceived] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadLeads = useCallback(async (options?: { silent?: boolean; forceSync?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [result, todayCounts] = await Promise.all([
        api.getBlogLeads({ forceSync: options?.forceSync }),
        api.getTodayLeadSourceCounts(),
      ]);
      if (Array.isArray(result?.rows)) {
        setLeads(result.rows);
        setTodayReceived(Number(todayCounts?.blogs || 0));
        setSyncError(String(result.sync?.error || result.error || ""));
        setLastSync(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadLeads();
  }, [active, loadLeads]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      void loadLeads({ silent: true });
    }, 60000);
    return () => window.clearInterval(interval);
  }, [active, loadLeads]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !term || [
        lead.leadid,
        lead.customerName,
        lead.contactNumber,
        lead.goldWeight,
        lead.type,
        lead.state,
        lead.city,
        lead.area,
        lead.utmSource,
        lead.keyword,
        lead.date,
        lead.time,
      ].some((value) => String(value || "").toLowerCase().includes(term));

      const normalizedStatus = String(lead.autoDialStatus || "idle").trim().toLowerCase();
      const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);
  const leadPager = useClientPagination(filteredLeads, { resetKey: `${search}|${statusFilter}` });

  const queueableLeads = useMemo(() => (
    leads.filter((lead) => {
      const normalizedStatus = String(lead.autoDialStatus || "").trim().toLowerCase();
      return Boolean(lead.contactNumber) && !isQueuedOrClosedStatus(normalizedStatus) && !isBlockedFailedLead(lead);
    })
  ), [leads]);
  const blockedFailedCount = useMemo(
    () => leads.filter((lead) => isBlockedFailedLead(lead)).length,
    [leads],
  );

  const canTriggerLead = useCallback((lead: WebsiteLeadRecord) => {
    const normalizedStatus = String(lead.autoDialStatus || "").trim().toLowerCase();
    return Boolean(lead.contactNumber)
      && !["assigned", "dialing", "completed"].includes(normalizedStatus)
      && !isBlockedFailedLead(lead);
  }, []);

  const exportLeadsCsv = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.error("No Blogs lead rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-blog-leads-${statusFilter || "all"}.csv`,
      ["Timestamp", "Name", "Phone", "Weight", "Type", "State", "City", "Area", "UTM Source", "Keyword", "Auto Dial Status"],
      filteredLeads.map((lead) => [
        [lead.date, lead.time].filter(Boolean).join(" "),
        lead.customerName || "",
        lead.contactNumber || "",
        lead.goldWeight || "",
        lead.type || "",
        lead.state || "",
        lead.city || "",
        lead.area || "",
        lead.utmSource || "",
        lead.keyword || "",
        lead.autoDialStatus || "idle",
      ]),
    );
    toast.success("Blogs leads exported as CSV");
  }, [filteredLeads, statusFilter]);

  const handleQueueAll = async () => {
    if (queueableLeads.length === 0) return;
    setQueueingAll(true);
    try {
      let queuedCount = 0;
      let failedCount = 0;

      for (const lead of queueableLeads) {
        const result = await api.queueBlogLead(lead.leadid);
        if (result?.error) {
          failedCount += 1;
          continue;
        }
        queuedCount += 1;
      }

      await loadLeads({ silent: true });
      if (queuedCount > 0) {
        toast.success(`${queuedCount} Blogs lead${queuedCount === 1 ? "" : "s"} sent to auto dial`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} lead${failedCount === 1 ? "" : "s"} could not be queued`);
      }
    } finally {
      setQueueingAll(false);
    }
  };

  const handleQueueSelected = async (lead: WebsiteLeadRecord) => {
    if (!canTriggerLead(lead)) return;
    setQueueingLeadId(lead.leadid);
    try {
      const result = await api.queueBlogLead(lead.leadid, { priority: true });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      await loadLeads({ silent: true });
      toast.success(`${lead.customerName || lead.contactNumber || "Selected lead"} sent to auto dial`);
    } finally {
      setQueueingLeadId("");
    }
  };

  const handleExportToFollowUps = async () => {
    if (filteredLeads.length === 0) return;
    setExportingFollowUps(true);
    try {
      const result = await api.exportBlogLeadsToFollowUps(filteredLeads.map((lead) => lead.leadid));
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const skipped = result.skipped ? `, ${result.skipped} skipped` : "";
      toast.success(`${result.processed || 0} Blogs lead follow-up${result.processed === 1 ? "" : "s"} ready${skipped}`);
    } finally {
      setExportingFollowUps(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{todayReceived}</p>
          <p className="text-sm text-muted-foreground">Today Received</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{leads.length}</p>
          <p className="text-sm text-muted-foreground">Blogs Leads</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{leads.filter((lead) => ["queued", "pending", "assigned", "dialing"].includes(String(lead.autoDialStatus || "").toLowerCase())).length}</p>
          <p className="text-sm text-muted-foreground">Queued For Auto Dial</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{leads.filter((lead) => String(lead.autoDialStatus || "").toLowerCase() === "completed").length}</p>
          <p className="text-sm text-muted-foreground">Completed</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{leads.filter((lead) => String(lead.autoDialStatus || "").toLowerCase() === "failed").length}</p>
          <p className="text-sm text-muted-foreground">Failed</p>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[260px]"
              placeholder="Search name, phone, weight, type, state, city, area, or UTM source..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="control-field min-w-[180px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All auto dial states</option>
              <option value="idle">Idle</option>
              <option value="queued">Queued</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="dialing">Dialing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            {lastSync ? <span className="text-xs text-muted-foreground">Last sync: {lastSync}</span> : null}
            <span className="text-xs text-muted-foreground">Ready to queue: {queueableLeads.length}</span>
            <span className="text-xs text-muted-foreground">Blocked: {blockedFailedCount}</span>
            <span className="text-xs text-muted-foreground">{filteredLeads.length} of {leads.length} visible</span>
            {syncError ? <span className="text-xs text-destructive">Sync: {syncError}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="action-outline" onClick={exportLeadsCsv} disabled={filteredLeads.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              className="action-outline"
              onClick={() => void handleExportToFollowUps()}
              disabled={exportingFollowUps || filteredLeads.length === 0}
            >
              <CalendarClock className="h-4 w-4" />
              {exportingFollowUps ? "Adding..." : "Add Follow-Ups"}
            </button>
            <button
              className="action-gold"
              onClick={() => void handleQueueAll()}
              disabled={queueingAll || queueableLeads.length === 0}
            >
              <PhoneCall className="h-4 w-4" />
              {queueingAll ? "Queueing..." : queueableLeads.length === 0 ? "All Queued" : "Auto Dial All"}
            </button>
            <button className="action-outline" onClick={() => void loadLeads({ forceSync: true })} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1720px] text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Weight</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">UTM Source</th>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3">Auto Dial</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                    {leads.length === 0 ? "No Blogs lead records loaded yet." : "No Blogs leads found for the selected search/filter."}
                  </td>
                </tr>
              ) : leadPager.pageItems.map((lead) => (
                <tr key={lead.leadid} className="border-t border-border">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="action-outline min-h-8 px-3 text-xs"
                      disabled={!canTriggerLead(lead) || queueingAll || Boolean(queueingLeadId)}
                      onClick={() => void handleQueueSelected(lead)}
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      {queueingLeadId === lead.leadid ? "Triggering..." : "Dial Selected"}
                    </button>
                  </td>
                  <td className="px-4 py-3">{[lead.date, lead.time].filter(Boolean).join(" ") || "--"}</td>
                  <td className="px-4 py-3 font-medium">{lead.customerName || "--"}</td>
                  <td className="px-4 py-3 font-mono">{lead.contactNumber || "--"}</td>
                  <td className="px-4 py-3">{lead.goldWeight || "--"}</td>
                  <td className="px-4 py-3">{lead.type || "--"}</td>
                  <td className="px-4 py-3">{lead.state || "--"}</td>
                  <td className="px-4 py-3">{lead.city || "--"}</td>
                  <td className="px-4 py-3">{lead.area || "--"}</td>
                  <td className="px-4 py-3">{lead.utmSource || "--"}</td>
                  <td className="px-4 py-3">{lead.keyword || "--"}</td>
                  <td className="px-4 py-3">
                    <span className={getQueueBadge(lead.autoDialStatus)}>
                      {isBlockedFailedLead(lead) ? lead.autoDialQueueExitReason || "Blocked" : lead.autoDialStatus || "idle"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={leadPager.page}
          totalPages={leadPager.totalPages}
          totalItems={leadPager.totalItems}
          pageSize={leadPager.pageSize}
          onPageChange={leadPager.setPage}
          disabled={loading || queueingAll || exportingFollowUps}
        />
      </div>
    </div>
  );
}
