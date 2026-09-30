import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, PhoneCall, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import TablePagination from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, type WebsiteLeadRecord } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";

function formatDateTime(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

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

export default function WebsiteLeadsTab({ active }: { active: boolean }) {
  const [leads, setLeads] = useState<WebsiteLeadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [queueingAll, setQueueingAll] = useState(false);
  const [queueingLeadId, setQueueingLeadId] = useState("");
  const [exportingFollowUps, setExportingFollowUps] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [todayReceived, setTodayReceived] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadLeads = useCallback(async (options?: { silent?: boolean; forceSync?: boolean }) => {
    const silent = options?.silent ?? false;
    const forceSync = options?.forceSync ?? false;
    if (!silent) setLoading(true);
    try {
      const rows = await api.getWebsiteLeads({ forceSync });
      const todayCounts = await api.getTodayLeadSourceCounts();
      if (Array.isArray(rows)) {
        setLeads(rows);
        setTodayReceived(Number(todayCounts?.website || 0));
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
        lead.slNo,
        lead.form,
        lead.branchId,
        lead.branchName,
        lead.customerName,
        lead.contactNumber,
        lead.goldWeight,
        lead.language,
        lead.type,
        lead.state,
        lead.city,
        lead.area,
        lead.leadFrom,
        lead.utmSource,
        lead.utmCampaignName,
        lead.keyword,
        lead.adgroupid,
        lead.gclid,
        lead.date,
        lead.time,
        lead.timing,
        lead.device,
        lead.remarks,
        lead.comments,
        lead.followupDate,
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
      toast.error("No website lead rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-website-leads-${statusFilter || "all"}.csv`,
      ["Lead ID", "SL No", "Form", "Branch ID", "Branch Name", "Customer Name", "Contact Number", "Gold Weight", "Language", "Type", "State", "Preferred to Call", "Area", "Lead From", "UTM Source", "UTM Campaign", "Keyword", "Ad Group ID", "GCLID", "Date", "Time", "Timing", "Device", "Remarks", "Comments", "Followup Date", "Received At", "Auto Dial Status"],
      filteredLeads.map((lead) => [
        lead.leadid,
        lead.slNo || "",
        lead.form || "",
        lead.branchId || "",
        lead.branchName || "",
        lead.customerName || "",
        lead.contactNumber || "",
        lead.goldWeight || "",
        lead.language || "",
        lead.type || "",
        lead.state || "",
        lead.city || "",
        lead.area || "",
        lead.leadFrom || "",
        lead.utmSource || "",
        lead.utmCampaignName || "",
        lead.keyword || "",
        lead.adgroupid || "",
        lead.gclid || "",
        lead.date || "",
        lead.time || "",
        lead.timing || "",
        lead.device || "",
        lead.remarks || "",
        lead.comments || "",
        lead.followupDate || "",
        lead.receivedAt || "",
        lead.autoDialStatus || "idle",
      ]),
    );
    toast.success("Website leads exported as CSV");
  }, [filteredLeads, statusFilter]);

  const handleQueueAll = async () => {
    if (queueableLeads.length === 0) return;
    setQueueingAll(true);
    try {
      let queuedCount = 0;
      let failedCount = 0;

      for (const lead of queueableLeads) {
        const result = await api.queueWebsiteLead(lead.leadid);
        if (result?.error) {
          failedCount += 1;
          continue;
        }
        queuedCount += 1;
      }

      await loadLeads({ silent: true });
      if (queuedCount > 0) {
        toast.success(`${queuedCount} Website lead${queuedCount === 1 ? "" : "s"} sent to auto dial`);
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
      const result = await api.queueWebsiteLead(lead.leadid, { priority: true });
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
      const result = await api.exportWebsiteLeadsToFollowUps(filteredLeads.map((lead) => lead.leadid));
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const skipped = result.skipped ? `, ${result.skipped} skipped` : "";
      toast.success(`${result.processed || 0} Website lead follow-up${result.processed === 1 ? "" : "s"} ready${skipped}`);
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
          <p className="text-sm text-muted-foreground">Loaded Leads</p>
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
              placeholder="Search customer, contact, language, or source..."
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

        <div className="overflow-x-auto">
              <table className="w-full min-w-[2700px] text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Lead ID</th>
                <th className="px-4 py-3">SL No</th>
                <th className="px-4 py-3">Form</th>
                <th className="px-4 py-3">Branch ID</th>
                <th className="px-4 py-3">Branch Name</th>
                <th className="px-4 py-3">Customer Name</th>
                <th className="px-4 py-3">Contact Number</th>
                <th className="px-4 py-3">Gold Weight (g)</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Preferred to Call</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Lead From</th>
                <th className="px-4 py-3">UTM Source</th>
                <th className="px-4 py-3">UTM Campaign</th>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3">Ad Group ID</th>
                <th className="px-4 py-3">GCLID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Timing</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3">Comments</th>
                <th className="px-4 py-3">Followup Date</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Auto Dial</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={29} className="px-4 py-8 text-center text-muted-foreground">
                    {leads.length === 0 ? "No Website lead records received yet." : "No Website leads found for the selected search/filter."}
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
                  <td className="px-4 py-3 font-mono text-accent">{lead.leadid}</td>
                  <td className="px-4 py-3">{lead.slNo || "—"}</td>
                  <td className="px-4 py-3">{lead.form || "—"}</td>
                  <td className="px-4 py-3">{lead.branchId || "—"}</td>
                  <td className="px-4 py-3">{lead.branchName || "—"}</td>
                  <td className="px-4 py-3 font-medium">{lead.customerName || "—"}</td>
                  <td className="px-4 py-3 font-mono">{lead.contactNumber || "—"}</td>
                  <td className="px-4 py-3">{lead.goldWeight || "—"}</td>
                  <td className="px-4 py-3">{lead.language || "—"}</td>
                  <td className="px-4 py-3">{lead.type || "—"}</td>
                  <td className="px-4 py-3">{lead.state || "—"}</td>
                  <td className="px-4 py-3">{lead.city || "—"}</td>
                  <td className="px-4 py-3">{lead.area || "—"}</td>
                  <td className="px-4 py-3">{lead.leadFrom || "—"}</td>
                  <td className="px-4 py-3">{lead.utmSource || "—"}</td>
                  <td className="px-4 py-3">{lead.utmCampaignName || "—"}</td>
                  <td className="px-4 py-3">{lead.keyword || "—"}</td>
                  <td className="px-4 py-3">{lead.adgroupid || "—"}</td>
                  <td className="px-4 py-3">{lead.gclid || "—"}</td>
                  <td className="px-4 py-3">{lead.date || "—"}</td>
                  <td className="px-4 py-3">{lead.time || "—"}</td>
                  <td className="px-4 py-3">{lead.timing || "—"}</td>
                  <td className="px-4 py-3">{lead.device || "—"}</td>
                  <td className="px-4 py-3">{lead.remarks || "—"}</td>
                  <td className="px-4 py-3">{lead.comments || "—"}</td>
                  <td className="px-4 py-3">{lead.followupDate || "—"}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(lead.receivedAt)}</td>
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
