import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, PhoneCall, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import TablePagination from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, type JustDialLeadRecord } from "@/lib/api";
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

export default function JustDialLeadsTab({ active }: { active: boolean }) {
  const [leads, setLeads] = useState<JustDialLeadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [queueingAll, setQueueingAll] = useState(false);
  const [queueingLeadId, setQueueingLeadId] = useState("");
  const [exportingFollowUps, setExportingFollowUps] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [todayReceived, setTodayReceived] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadLeads = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [rows, todayCounts] = await Promise.all([
        api.getJustDialLeads(),
        api.getTodayLeadSourceCounts(),
      ]);
      if (Array.isArray(rows)) {
        setLeads(rows);
        setTodayReceived(Number(todayCounts?.justdial || 0));
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
        lead.name,
        lead.mobile,
        lead.phone,
        lead.city,
        lead.area,
        lead.brancharea,
        lead.state,
        lead.company,
        lead.category,
        lead.leadtype,
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
      const hasCallableNumber = Boolean(lead.mobile || lead.phone);
      const alreadyQueued = ["queued", "pending", "assigned", "dialing", "completed"].includes(normalizedStatus);
      return hasCallableNumber && !alreadyQueued;
    })
  ), [leads]);

  const canTriggerLead = useCallback((lead: JustDialLeadRecord) => {
    const normalizedStatus = String(lead.autoDialStatus || "").trim().toLowerCase();
    const blocked = normalizedStatus === "failed"
      && (lead.autoDialRetryAllowed === false || Boolean(String(lead.autoDialQueueExitReason || "").trim()));
    return Boolean(lead.mobile || lead.phone)
      && !["assigned", "dialing", "completed"].includes(normalizedStatus)
      && !blocked;
  }, []);

  const exportLeadsCsv = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.error("No JustDial rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-justdial-${statusFilter || "all"}.csv`,
      ["Lead ID", "Customer", "Mobile", "Phone", "Lead Type", "Category", "City", "Area", "State", "Company", "Received At", "Auto Dial Status"],
      filteredLeads.map((lead) => [
        lead.leadid,
        lead.name || "",
        lead.mobile || "",
        lead.phone || "",
        lead.leadtype || "",
        lead.category || "",
        lead.city || "",
        lead.area || lead.brancharea || "",
        lead.state || "",
        lead.company || "",
        lead.receivedAt || "",
        lead.autoDialStatus || "idle",
      ]),
    );
    toast.success("JustDial leads exported as CSV");
  }, [filteredLeads, statusFilter]);

  const handleQueueAll = async () => {
    if (queueableLeads.length === 0) return;
    setQueueingAll(true);
    try {
      let queuedCount = 0;
      let failedCount = 0;

      for (const lead of queueableLeads) {
        const result = await api.queueJustDialLead(lead.leadid);
        if (result?.error) {
          failedCount += 1;
          continue;
        }
        queuedCount += 1;
      }

      await loadLeads({ silent: true });
      if (queuedCount > 0) {
        toast.success(`${queuedCount} JustDial lead${queuedCount === 1 ? "" : "s"} sent to auto dial`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} lead${failedCount === 1 ? "" : "s"} could not be queued`);
      }
    } finally {
      setQueueingAll(false);
    }
  };

  const handleQueueSelected = async (lead: JustDialLeadRecord) => {
    if (!canTriggerLead(lead)) return;
    setQueueingLeadId(lead.leadid);
    try {
      const result = await api.queueJustDialLead(lead.leadid, { priority: true });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      await loadLeads({ silent: true });
      toast.success(`${lead.name || lead.mobile || lead.phone || "Selected lead"} sent to auto dial`);
    } finally {
      setQueueingLeadId("");
    }
  };

  const handleExportToFollowUps = async () => {
    if (filteredLeads.length === 0) return;
    setExportingFollowUps(true);
    try {
      const result = await api.exportJustDialLeadsToFollowUps(filteredLeads.map((lead) => lead.leadid));
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const skipped = result.skipped ? `, ${result.skipped} skipped` : "";
      toast.success(`${result.processed || 0} JustDial lead follow-up${result.processed === 1 ? "" : "s"} ready${skipped}`);
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
              placeholder="Search lead ID, customer, number, city, area..."
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
            <button className="action-outline" onClick={() => void loadLeads()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Lead ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Auto Dial</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                    {leads.length === 0 ? "No JustDial lead records received yet." : "No JustDial leads found for the selected search/filter."}
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
                  <td className="px-4 py-3">
                    <p className="font-medium">{lead.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{lead.company || "—"}</p>
                  </td>
                  <td className="px-4 py-3 font-mono">{lead.mobile || "—"}</td>
                  <td className="px-4 py-3">{lead.leadtype || "—"}</td>
                  <td className="px-4 py-3">{lead.category || "—"}</td>
                  <td className="px-4 py-3">{lead.city || "—"}</td>
                  <td className="px-4 py-3">{lead.area || lead.brancharea || "—"}</td>
                  <td className="px-4 py-3">{lead.state || "—"}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(lead.receivedAt)}</td>
                  <td className="px-4 py-3">
                    <span className={getQueueBadge(lead.autoDialStatus)}>{lead.autoDialStatus || "idle"}</span>
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
