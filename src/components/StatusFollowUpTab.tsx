import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import TablePagination from "@/components/TablePagination";
import { useClientPagination } from "@/hooks/useClientPagination";
import { api, type StatusFollowUpQueueRecord } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { useAgentDirectory } from "@/hooks/useAgentDirectory";
import { toast } from "sonner";

function formatDateTime(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function getAutoDialBadge(status: string) {
  switch (status) {
    case "pending":
      return "warning-badge";
    case "assigned":
    case "dialing":
      return "done-badge";
    case "completed":
      return "success-badge";
    case "failed":
      return "danger-badge";
    default:
      return "done-badge";
  }
}

export default function StatusFollowUpTab({ active }: { active: boolean }) {
  const { resolveAgentName } = useAgentDirectory();
  const [rows, setRows] = useState<StatusFollowUpQueueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [resolvingId, setResolvingId] = useState("");
  const [search, setSearch] = useState("");
  const [autoDialFilter, setAutoDialFilter] = useState("all");

  const loadRows = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const nextRows = await api.getStatusFollowUps();
      if (Array.isArray(nextRows)) {
        setRows(nextRows);
        setLastSync(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadRows();
  }, [active, loadRows]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      void loadRows({ silent: true });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [active, loadRows]);

  const summary = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.autoDialStatus === "pending").length,
    assigned: rows.filter((row) => row.autoDialStatus === "assigned" || row.autoDialStatus === "dialing").length,
    byStatus: new Set(rows.map((row) => row.formStatus).filter(Boolean)).size,
  }), [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !term || [
        row.customerName,
        row.phone,
        row.formStatus,
        row.branch,
        row.agentId,
        row.agentName,
        row.scheduledAgentId,
        row.scheduledAgentName,
        row.autoDialAssignedAgentId,
        row.autoDialAssignedAgentName,
        row.language,
        row.location,
        row.purpose,
        row.scheduledFor,
      ].some((value) => String(value || "").toLowerCase().includes(term));

      const matchesAutoDial = autoDialFilter === "all" || row.autoDialStatus === autoDialFilter;
      return matchesSearch && matchesAutoDial;
    });
  }, [autoDialFilter, rows, search]);
  const rowPager = useClientPagination(filteredRows, { resetKey: `${search}|${autoDialFilter}` });

  const exportRowsCsv = useCallback(() => {
    if (filteredRows.length === 0) {
      toast.error("No status follow-up rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-status-follow-up-${autoDialFilter || "all"}.csv`,
      ["Customer", "Phone", "Form Status", "Scheduled For", "Branch", "Agent", "Language", "Location", "Purpose", "Auto Dial Status", "Routed Agent", "Updated At", "Last Error"],
      filteredRows.map((row) => [
        row.customerName || "",
        row.phone || "",
        row.formStatus || "",
        row.scheduledFor || "",
        row.branch || "",
        resolveAgentName(row.agentId, row.agentName),
        row.language || "",
        row.location || "",
        row.purpose || "",
        row.autoDialStatus || "",
        resolveAgentName(row.autoDialAssignedAgentId, row.autoDialAssignedAgentName),
        row.updatedAt || "",
        row.autoDialLastError || "",
      ]),
    );
    toast.success("Status follow-up queue exported as CSV");
  }, [autoDialFilter, filteredRows, resolveAgentName]);

  const handleResolve = async (row: StatusFollowUpQueueRecord, formStatus: string) => {
    setResolvingId(`${row.id}:${formStatus}`);
    try {
      const result = await api.updateStatusFollowUp(row.id, formStatus);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${row.customerName || row.phone} marked as ${formStatus}`);
      await loadRows({ silent: true });
    } finally {
      setResolvingId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.total}</p>
          <p className="text-sm text-muted-foreground">Open Follow-Ups</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.pending}</p>
          <p className="text-sm text-muted-foreground">Pending Auto Dial</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.assigned}</p>
          <p className="text-sm text-muted-foreground">Assigned / Dialing</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.byStatus}</p>
          <p className="text-sm text-muted-foreground">Open Status Types</p>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Status Follow-Up Queue</h2>
            <p className="text-sm text-muted-foreground">Customers saved with unresolved intake statuses stay here until their status is resolved.</p>
          </div>
          <div className="flex items-center gap-3">
            {lastSync ? <span className="text-xs text-muted-foreground">Last sync: {lastSync}</span> : null}
            <button className="action-gold" onClick={() => void loadRows()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[260px]"
              placeholder="Search customer, mobile, status, branch, or agent..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="control-field min-w-[180px]" value={autoDialFilter} onChange={(event) => setAutoDialFilter(event.target.value)}>
              <option value="all">All auto dial states</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="dialing">Dialing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{filteredRows.length} of {rows.length} follow-ups</p>
            <button className="action-outline" onClick={exportRowsCsv} disabled={filteredRows.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scheduled For</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Auto Dial</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Resolve</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    {loading ? "Loading status follow-up queue..." : rows.length === 0 ? "No open status follow-up records" : "No follow-ups found for the selected search/filter."}
                  </td>
                </tr>
              ) : rowPager.pageItems.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.customerName || "—"}</p>
                    <p className="text-xs text-muted-foreground">{row.location || row.purpose || "—"}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-accent">{row.phone}</td>
                  <td className="px-4 py-3"><span className="warning-badge">{row.formStatus || "—"}</span></td>
                  <td className="px-4 py-3">
                    <p>{formatDateTime(row.scheduledFor)}</p>
                    {row.scheduledAgentId || row.scheduledAgentName ? (
                      <p className="text-xs text-muted-foreground">
                        Scheduled by {resolveAgentName(row.scheduledAgentId, row.scheduledAgentName)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{row.branch || "—"}</td>
                  <td className="px-4 py-3">
                    <p>{resolveAgentName(row.agentId, row.agentName)}</p>
                    <p className="text-xs font-mono text-muted-foreground">{row.agentId || "—"}</p>
                  </td>
                  <td className="px-4 py-3">{row.language || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={getAutoDialBadge(row.autoDialStatus)}>{row.autoDialStatus || "idle"}</span>
                    {row.autoDialAssignedAgentId || row.autoDialAssignedAgentName ? (
                      <p className="text-xs text-muted-foreground">
                        Routed to {resolveAgentName(row.autoDialAssignedAgentId, row.autoDialAssignedAgentName)}
                      </p>
                    ) : null}
                    {row.autoDialLastError ? (
                      <p className="max-w-[220px] text-xs text-destructive">{row.autoDialLastError}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{formatDateTime(row.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="action-outline text-xs"
                        onClick={() => void handleResolve(row, "Visited Sold")}
                        disabled={Boolean(resolvingId)}
                      >
                        {resolvingId === `${row.id}:Visited Sold` ? "..." : "Visited Sold"}
                      </button>
                      <button
                        className="action-outline text-xs"
                        onClick={() => void handleResolve(row, "Visited Not Sold")}
                        disabled={Boolean(resolvingId)}
                      >
                        {resolvingId === `${row.id}:Visited Not Sold` ? "..." : "Visited Not Sold"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={rowPager.page}
          totalPages={rowPager.totalPages}
          totalItems={rowPager.totalItems}
          pageSize={rowPager.pageSize}
          onPageChange={rowPager.setPage}
          disabled={loading || Boolean(resolvingId)}
        />
      </div>
    </div>
  );
}
