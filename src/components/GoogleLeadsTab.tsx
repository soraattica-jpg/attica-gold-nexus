import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, PhoneCall, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import TablePagination from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, type GoogleLeadRecord } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";

function getQueueBadge(status?: string) {
  const normalized = String(status || "idle").trim().toLowerCase();
  if (normalized === "completed" || normalized === "dialing") return "success-badge";
  if (normalized === "assigned") return "done-badge";
  if (normalized === "failed") return "danger-badge";
  if (normalized === "queued" || normalized === "pending") return "warning-badge";
  return "done-badge";
}

function getLeadDateKey(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function GoogleLeadsTab({ active }: { active: boolean }) {
  const [leads, setLeads] = useState<GoogleLeadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [queueingLeadId, setQueueingLeadId] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadLeads = useCallback(async (options?: { silent?: boolean; forceSync?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const rows = await api.getGoogleLeads({ forceSync: options?.forceSync });
      if (Array.isArray(rows)) {
        setLeads(rows);
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
        lead.id,
        lead.customerName,
        lead.mobileNumber,
        lead.sourceState,
        lead.area,
        lead.preferredLanguage,
        lead.goldWeight,
        lead.type,
        lead.sourceFile,
        lead.status,
        lead.assignedAgentId,
        lead.assignedAgentName,
        lead.leadDate,
        lead.leadTime,
        lead.lastError,
      ].some((value) => String(value || "").toLowerCase().includes(term));

      const normalizedStatus = String(lead.status || "idle").trim().toLowerCase();
      const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const leadPager = useClientPagination(filteredLeads, { resetKey: `${search}|${statusFilter}` });
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayReceived = useMemo(
    () => leads.filter((lead) => (lead.leadDate || getLeadDateKey(lead.createdAt)) === todayKey).length,
    [leads, todayKey],
  );

  const canTriggerLead = useCallback((lead: GoogleLeadRecord) => {
    const normalizedStatus = String(lead.status || "").trim().toLowerCase();
    const blocked = normalizedStatus === "failed" && (lead.retryAllowed === false || Boolean(String(lead.queueExitReason || "").trim()));
    return Boolean(lead.mobileNumber)
      && !["assigned", "dialing", "completed"].includes(normalizedStatus)
      && !blocked;
  }, []);

  const exportLeadsCsv = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.error("No Google lead rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-google-lp-leads-${statusFilter || "all"}.csv`,
      ["Lead ID", "Name", "Number", "State", "Preferred to Call", "Language", "Gold Weight", "Type", "Lead From", "Status", "Assigned Agent", "Date", "Time", "Received At", "Last Error"],
      filteredLeads.map((lead) => [
        lead.id,
        lead.customerName || "",
        lead.mobileNumber || "",
        lead.sourceState || "",
        lead.area || "",
        lead.preferredLanguage || "",
        lead.goldWeight || "",
        lead.type || "",
        lead.sourceFile || "",
        lead.status || "",
        lead.assignedAgentName || lead.assignedAgentId || "",
        lead.leadDate || "",
        lead.leadTime || "",
        lead.receivedAt || lead.createdAt || "",
        lead.lastError || "",
      ]),
    );
    toast.success("Google LP leads exported as CSV");
  }, [filteredLeads, statusFilter]);

  const handleQueueSelected = async (lead: GoogleLeadRecord) => {
    if (!canTriggerLead(lead)) return;
    setQueueingLeadId(lead.id);
    try {
      const result = await api.queueGoogleLead(lead.id, { priority: true });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      await loadLeads({ silent: true });
      toast.success(`${lead.customerName || lead.mobileNumber || "Selected lead"} sent to auto dial`);
    } finally {
      setQueueingLeadId("");
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
          <p className="text-sm text-muted-foreground">Google LP Leads</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{leads.filter((lead) => ["queued", "pending", "assigned", "dialing"].includes(String(lead.status || "").toLowerCase())).length}</p>
          <p className="text-sm text-muted-foreground">Queued For Auto Dial</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{leads.filter((lead) => String(lead.status || "").toLowerCase() === "completed").length}</p>
          <p className="text-sm text-muted-foreground">Completed</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{leads.filter((lead) => String(lead.status || "").toLowerCase() === "failed").length}</p>
          <p className="text-sm text-muted-foreground">Failed</p>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[260px]"
              placeholder="Search name, number, state, preferred to call, language, type, agent, or status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="control-field min-w-[180px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All auto dial states</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="dialing">Dialing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            {lastSync ? <span className="text-xs text-muted-foreground">Last sync: {lastSync}</span> : null}
            <span className="text-xs text-muted-foreground">{filteredLeads.length} of {leads.length} visible</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="action-outline" onClick={exportLeadsCsv} disabled={filteredLeads.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button className="action-outline" onClick={() => void loadLeads({ forceSync: true })} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1600px] text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Lead ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Preferred to Call</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Gold Weight</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Lead From</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned Agent</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Last Error</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-muted-foreground">
                    {leads.length === 0 ? "No Google LP lead records loaded yet." : "No Google LP leads found for the selected search/filter."}
                  </td>
                </tr>
              ) : leadPager.pageItems.map((lead) => (
                <tr key={lead.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="action-outline min-h-8 px-3 text-xs"
                      disabled={!canTriggerLead(lead) || Boolean(queueingLeadId)}
                      onClick={() => void handleQueueSelected(lead)}
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      {queueingLeadId === lead.id ? "Triggering..." : "Dial Selected"}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-accent">{lead.id}</td>
                  <td className="px-4 py-3 font-medium">{lead.customerName || "--"}</td>
                  <td className="px-4 py-3 font-mono">{lead.mobileNumber || "--"}</td>
                  <td className="px-4 py-3">{lead.sourceState || "--"}</td>
                  <td className="px-4 py-3">{lead.area || "--"}</td>
                  <td className="px-4 py-3">{lead.preferredLanguage || "--"}</td>
                  <td className="px-4 py-3">{lead.goldWeight || "--"}</td>
                  <td className="px-4 py-3">{lead.type || "--"}</td>
                  <td className="px-4 py-3">{lead.sourceFile || "--"}</td>
                  <td className="px-4 py-3">
                    <span className={getQueueBadge(lead.status)}>{lead.queueExitReason || lead.status || "idle"}</span>
                  </td>
                  <td className="px-4 py-3">{lead.assignedAgentName || lead.assignedAgentId || "--"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{lead.leadDate || getLeadDateKey(lead.createdAt) || "--"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{lead.leadTime || "--"}</td>
                  <td className="px-4 py-3 max-w-[280px] whitespace-normal break-words text-xs">{lead.lastError || "--"}</td>
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
          disabled={loading}
        />
      </div>
    </div>
  );
}
