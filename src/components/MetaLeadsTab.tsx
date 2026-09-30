import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, PhoneCall, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import TablePagination from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, type MetaLeadRecord } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";

function isQueuedOrClosedStatus(status?: string) {
  return ["queued", "pending", "assigned", "dialing", "completed"].includes(String(status || "").trim().toLowerCase());
}

function isBlockedFailedLead(lead: MetaLeadRecord) {
  const normalizedStatus = String(lead.autoDialStatus || "").trim().toLowerCase();
  if (normalizedStatus !== "failed") return false;
  return lead.autoDialRetryAllowed === false || Boolean(String(lead.autoDialQueueExitReason || "").trim());
}

export default function MetaLeadsTab({ active }: { active: boolean }) {
  const [leads, setLeads] = useState<MetaLeadRecord[]>([]);
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
        api.getMetaLeads({ forceSync: options?.forceSync }),
        api.getTodayLeadSourceCounts(),
      ]);
      if (Array.isArray(result?.rows)) {
        setLeads(result.rows);
        setTodayReceived(Number(todayCounts?.meta || 0));
        setLastSync(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setSyncError(String(result.sync?.error || result.error || ""));
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
        lead.type,
        lead.state,
        lead.city,
        lead.serviceLookingFor,
        lead.goldAmount,
        lead.plannedVisit,
        lead.fullName,
        lead.phoneNumber,
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
      return Boolean(lead.phoneNumber) && !isQueuedOrClosedStatus(normalizedStatus) && !isBlockedFailedLead(lead);
    })
  ), [leads]);
  const blockedFailedCount = useMemo(
    () => leads.filter((lead) => isBlockedFailedLead(lead)).length,
    [leads],
  );

  const canTriggerLead = useCallback((lead: MetaLeadRecord) => {
    const normalizedStatus = String(lead.autoDialStatus || "").trim().toLowerCase();
    return Boolean(lead.phoneNumber)
      && !["assigned", "dialing", "completed"].includes(normalizedStatus)
      && !isBlockedFailedLead(lead);
  }, []);

  const exportLeadsCsv = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.error("No Meta lead rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-meta-leads-${statusFilter || "all"}.csv`,
      ["Platform", "State", "City", "Full Name", "Phone Number", "Service Looking For", "Approx Gold", "Planned Visit", "Date", "Time"],
      filteredLeads.map((lead) => [
        lead.type || "",
        lead.state || "",
        lead.city || "",
        lead.fullName || "",
        lead.phoneNumber || "",
        lead.serviceLookingFor || "",
        lead.goldAmount || lead.grams || "",
        lead.plannedVisit || "",
        lead.date || "",
        lead.time || "",
      ]),
    );
    toast.success("Meta leads exported as CSV");
  }, [filteredLeads, statusFilter]);

  const handleQueueAll = async () => {
    if (queueableLeads.length === 0) return;
    setQueueingAll(true);
    try {
      let queuedCount = 0;
      let failedCount = 0;

      for (const lead of queueableLeads) {
        const result = await api.queueMetaLead(lead.leadid);
        if (result?.error) {
          failedCount += 1;
          continue;
        }
        queuedCount += 1;
      }

      await loadLeads({ silent: true });
      if (queuedCount > 0) {
        toast.success(`${queuedCount} Meta lead${queuedCount === 1 ? "" : "s"} sent to auto dial`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} lead${failedCount === 1 ? "" : "s"} could not be queued`);
      }
    } finally {
      setQueueingAll(false);
    }
  };

  const handleQueueSelected = async (lead: MetaLeadRecord) => {
    if (!canTriggerLead(lead)) return;
    setQueueingLeadId(lead.leadid);
    try {
      const result = await api.queueMetaLead(lead.leadid, { priority: true });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      await loadLeads({ silent: true });
      toast.success(`${lead.fullName || lead.phoneNumber || "Selected lead"} sent to auto dial`);
    } finally {
      setQueueingLeadId("");
    }
  };

  const handleExportToFollowUps = async () => {
    if (filteredLeads.length === 0) return;
    setExportingFollowUps(true);
    try {
      const result = await api.exportMetaLeadsToFollowUps(filteredLeads.map((lead) => lead.leadid));
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const skipped = result.skipped ? `, ${result.skipped} skipped` : "";
      toast.success(`${result.processed || 0} Meta lead follow-up${result.processed === 1 ? "" : "s"} ready${skipped}`);
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
          <p className="text-sm text-muted-foreground">Fetched Leads</p>
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
              placeholder="Search platform, state, city, name, phone, answers, date, or time..."
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
        {syncError ? (
          <div className="border-b border-border px-5 py-3 text-sm text-destructive">
            {syncError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1460px] table-fixed text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="w-[140px] px-4 py-3 whitespace-normal break-words leading-tight">Action</th>
                <th className="w-[180px] px-4 py-3 whitespace-normal break-words leading-tight">Platform</th>
                <th className="w-[120px] px-4 py-3 whitespace-normal break-words leading-tight">State</th>
                <th className="w-[130px] px-4 py-3 whitespace-normal break-words leading-tight">City</th>
                <th className="w-[160px] px-4 py-3 whitespace-normal break-words leading-tight">Full Name</th>
                <th className="w-[130px] px-4 py-3 whitespace-normal break-words leading-tight">Phone Number</th>
                <th className="w-[190px] px-4 py-3 whitespace-normal break-words leading-tight">What service are you looking for?</th>
                <th className="w-[170px] px-4 py-3 whitespace-normal break-words leading-tight">Approximately how much gold do you have?</th>
                <th className="w-[210px] px-4 py-3 whitespace-normal break-words leading-tight">When are you planning to visit an Attica Gold Company branch?</th>
                <th className="w-[110px] px-4 py-3 whitespace-normal break-words leading-tight">Date</th>
                <th className="w-[100px] px-4 py-3 whitespace-normal break-words leading-tight">Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                    {leads.length === 0 ? "No Meta lead records fetched yet." : "No Meta leads found for the selected search/filter."}
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
                  <td className="px-4 py-3 whitespace-normal break-words">{lead.type || "—"}</td>
                  <td className="px-4 py-3 whitespace-normal break-words">{lead.state || "—"}</td>
                  <td className="px-4 py-3 whitespace-normal break-words">{lead.city || "—"}</td>
                  <td className="px-4 py-3 whitespace-normal break-words font-medium">{lead.fullName || "—"}</td>
                  <td className="px-4 py-3 font-mono text-accent">{lead.phoneNumber || "—"}</td>
                  <td className="px-4 py-3 whitespace-normal break-words">{lead.serviceLookingFor || "—"}</td>
                  <td className="px-4 py-3 whitespace-normal break-words">{lead.goldAmount || lead.grams || "—"}</td>
                  <td className="px-4 py-3 whitespace-normal break-words">{lead.plannedVisit || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{lead.date || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{lead.time || "—"}</td>
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
