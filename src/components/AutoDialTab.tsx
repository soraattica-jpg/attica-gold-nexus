import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileUp, PhoneCall, RefreshCw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import TablePagination from "@/components/TablePagination";
import AutoDialLiveMonitorPanel from "@/components/AutoDialLiveMonitorPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useClientPagination } from "@/hooks/useClientPagination";
import {
  api,
  type AutoDialControlState,
  type AutoDialLeadImportRow,
  type AutoDialLeadRecord,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { normalizePhoneNumber } from "@/lib/phone";

const REQUIRED_COLUMNS = ["Customer Name", "Mobile Number", "Area/State", "Gold Weight", "Type"];
const CUSTOMER_NAME_KEYS = ["customername", "cxname", "customer", "cx"];
const MOBILE_NUMBER_KEYS = ["mobilenumber", "mobileno", "mobilenum", "mobile", "phone", "contact", "contactnumber", "number"];
const AREA_KEYS = ["area", "location", "locality", "place", "state", "city"];
const STATE_KEYS = ["state", "sourcestate", "region", "districtstate"];
const LANGUAGE_KEYS = ["language", "preferredlanguage", "lang", "customerlanguage"];
const GOLD_WEIGHT_KEYS = ["goldweight", "goldweightg", "goldwt", "weight", "grams", "grossw", "grossweight"];
const TYPE_KEYS = ["type", "leadtype", "customertype", "metaltype", "businesstype"];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function readField(row: Record<string, unknown>, keys: string[]) {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(key);
    if (!keys.includes(normalizedKey)) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function mapImportedRows(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => {
      const state = readField(row, STATE_KEYS);
      return {
        customerName: readField(row, CUSTOMER_NAME_KEYS),
        mobileNumber: normalizePhoneNumber(readField(row, MOBILE_NUMBER_KEYS)),
        area: readField(row, AREA_KEYS) || state,
        state,
        language: readField(row, LANGUAGE_KEYS),
        goldWeight: readField(row, GOLD_WEIGHT_KEYS),
        type: readField(row, TYPE_KEYS),
      };
    })
    .filter((row) => row.mobileNumber);
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function getStatusBadge(status: AutoDialLeadRecord["status"]) {
  switch (status) {
    case "pending":
      return "warning-badge";
    case "assigned":
      return "done-badge";
    case "dialing":
      return "success-badge";
    case "completed":
      return "success-badge";
    case "failed":
      return "danger-badge";
    default:
      return "done-badge";
  }
}

export default function AutoDialTab({ active }: { active: boolean }) {
  const { user } = useAuth();
  const [parsedRows, setParsedRows] = useState<AutoDialLeadImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [leads, setLeads] = useState<AutoDialLeadRecord[]>([]);
  const [autoDialControl, setAutoDialControl] = useState<AutoDialControlState>({
    enabled: true,
    freshLeadAutoConnectEnabled: true,
    freshLeadAutoConnectIntervalSeconds: 10,
  });
  const [loading, setLoading] = useState(false);
  const [controlLoading, setControlLoading] = useState(false);
  const [controlSaving, setControlSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [removingLeadId, setRemovingLeadId] = useState("");

  const loadLeads = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const nextLeads = await api.getAutoDialLeads();
      if (Array.isArray(nextLeads)) {
        setLeads(nextLeads);
        setLastSync(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadControl = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setControlLoading(true);
    try {
      const nextControl = await api.getAutoDialControl();
      setAutoDialControl({
        enabled: nextControl.enabled !== false,
        freshLeadAutoConnectEnabled: nextControl.freshLeadAutoConnectEnabled !== false,
        freshLeadAutoConnectIntervalSeconds: Number(nextControl.freshLeadAutoConnectIntervalSeconds) || 10,
        updatedAt: nextControl.updatedAt || "",
        updatedById: nextControl.updatedById || "",
        updatedByName: nextControl.updatedByName || "",
        releasedCount: nextControl.releasedCount,
      });
    } finally {
      if (!silent) setControlLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void Promise.all([loadLeads(), loadControl()]);
  }, [active, loadControl, loadLeads]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      void loadLeads({ silent: true });
      void loadControl({ silent: true });
    }, 30000);
    return () => window.clearInterval(interval);
  }, [active, loadControl, loadLeads]);

  const handleAutoDialControl = useCallback(async (enabled: boolean) => {
    if (autoDialControl.enabled === enabled) return;

    setControlSaving(true);
    try {
      const result = await api.setAutoDialControl({
        enabled,
        freshLeadAutoConnectEnabled: autoDialControl.freshLeadAutoConnectEnabled !== false,
        freshLeadAutoConnectIntervalSeconds: Number(autoDialControl.freshLeadAutoConnectIntervalSeconds) || 10,
        updatedById: user?.id,
        updatedByName: user?.name,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setAutoDialControl({
        enabled: result.enabled !== false,
        freshLeadAutoConnectEnabled: result.freshLeadAutoConnectEnabled !== false,
        freshLeadAutoConnectIntervalSeconds: Number(result.freshLeadAutoConnectIntervalSeconds) || 10,
        updatedAt: result.updatedAt || "",
        updatedById: result.updatedById || "",
        updatedByName: result.updatedByName || "",
        releasedCount: result.releasedCount,
      });
      toast.success(
        enabled
          ? "Auto call connected"
          : result.releasedCount
            ? `Auto call disconnected. ${result.releasedCount} live auto-call rows cleared`
            : "Auto call disconnected",
      );
      await loadLeads({ silent: true });
    } finally {
      setControlSaving(false);
    }
  }, [autoDialControl.enabled, autoDialControl.freshLeadAutoConnectEnabled, autoDialControl.freshLeadAutoConnectIntervalSeconds, loadLeads, user?.id, user?.name]);

  const handleFreshAutoConnectControl = useCallback(async (patch: {
    freshLeadAutoConnectEnabled?: boolean;
    freshLeadAutoConnectIntervalSeconds?: number;
  }) => {
    setControlSaving(true);
    try {
      const nextFreshEnabled = patch.freshLeadAutoConnectEnabled ?? (autoDialControl.freshLeadAutoConnectEnabled !== false);
      const nextInterval = patch.freshLeadAutoConnectIntervalSeconds ?? (Number(autoDialControl.freshLeadAutoConnectIntervalSeconds) || 10);
      const result = await api.setAutoDialControl({
        enabled: autoDialControl.enabled !== false,
        freshLeadAutoConnectEnabled: nextFreshEnabled,
        freshLeadAutoConnectIntervalSeconds: nextInterval,
        updatedById: user?.id,
        updatedByName: user?.name,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setAutoDialControl({
        enabled: result.enabled !== false,
        freshLeadAutoConnectEnabled: result.freshLeadAutoConnectEnabled !== false,
        freshLeadAutoConnectIntervalSeconds: Number(result.freshLeadAutoConnectIntervalSeconds) || 10,
        updatedAt: result.updatedAt || "",
        updatedById: result.updatedById || "",
        updatedByName: result.updatedByName || "",
        releasedCount: result.releasedCount,
      });
      toast.success(nextFreshEnabled ? "Fresh Leads Auto Connect enabled" : "Fresh Leads Auto Connect disabled");
      await loadLeads({ silent: true });
    } finally {
      setControlSaving(false);
    }
  }, [autoDialControl.enabled, autoDialControl.freshLeadAutoConnectEnabled, autoDialControl.freshLeadAutoConnectIntervalSeconds, loadLeads, user?.id, user?.name]);

  const summary = useMemo(() => ({
    total: leads.length,
    pending: leads.filter((lead) => lead.status === "pending").length,
    assigned: leads.filter((lead) => lead.status === "assigned" || lead.status === "dialing").length,
    completed: leads.filter((lead) => lead.status === "completed").length,
  }), [leads]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !term || [
        lead.customerName,
        lead.mobileNumber,
        lead.area,
        lead.sourceState,
        lead.preferredLanguage,
        lead.goldWeight,
        lead.type,
        lead.scheduledAgentId,
        lead.scheduledAgentName,
        lead.assignedAgentName,
        lead.assignedAgentId,
        lead.sourceFile,
        lead.scheduledFor,
      ].some((value) => String(value || "").toLowerCase().includes(term));

      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);
  const leadPager = useClientPagination(filteredLeads, { resetKey: `${search}|${statusFilter}` });

  const exportLeadsCsv = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.error("No auto dial rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-auto-dial-${statusFilter || "all"}.csv`,
      ["Customer", "Mobile Number", "Area", "Source State", "Preferred Language", "Gold Weight", "Type", "Status", "Scheduled For", "Scheduled Agent", "Assigned Agent", "Source File", "Updated At"],
      filteredLeads.map((lead) => [
        lead.customerName || "",
        lead.mobileNumber || "",
        lead.area || "",
        lead.sourceState || "",
        lead.preferredLanguage || "",
        lead.goldWeight || "",
        lead.type || "",
        lead.status || "",
        lead.scheduledFor || "",
        lead.scheduledAgentName || lead.scheduledAgentId || "",
        lead.assignedAgentName || lead.assignedAgentId || "",
        lead.sourceFile || "",
        lead.updatedAt || "",
      ]),
    );
    toast.success("Auto dial queue exported as CSV");
  }, [filteredLeads, statusFilter]);

  const handleRemoveLead = useCallback(async (lead: AutoDialLeadRecord) => {
    if (!["pending", "assigned", "dialing"].includes(lead.status)) return;

    setRemovingLeadId(lead.id);
    try {
      const result = await api.updateAutoDialLead(lead.id, {
        status: "failed",
        lastError: "Remove from Queue",
        queueExitReason: "Remove from Queue",
        retryAllowed: false,
      });

      if (result.success === false) {
        toast.error(result.error || "Unable to remove the lead from the auto dial queue");
        return;
      }

      toast.success(`${lead.customerName || lead.mobileNumber} removed from the auto dial queue`);
      await loadLeads({ silent: true });
    } finally {
      setRemovingLeadId((current) => (current === lead.id ? "" : current));
    }
  }, [loadLeads]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) {
        toast.error("The uploaded workbook is empty.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const mappedRows = mapImportedRows(rows);
      if (mappedRows.length === 0) {
        toast.error(`No valid rows found. Required columns: ${REQUIRED_COLUMNS.join(", ")}`);
        return;
      }

      setFileName(file.name);
      setParsedRows(mappedRows);
      toast.success(`${mappedRows.length} rows ready for import`);
    } catch (error) {
      console.error("Excel parse failed:", error);
      toast.error("Failed to read the Excel file");
    } finally {
      event.target.value = "";
    }
  };

  const handleImport = async () => {
    if (!parsedRows.length) {
      toast.error("Upload an Excel file first.");
      return;
    }

    setUploading(true);
    setImportProgress(`Preparing 0 / ${parsedRows.length} rows...`);
    try {
      const result = await api.importAutoDialLeads(fileName || "manual-upload.xlsx", parsedRows, {
        onProgress: (progress) => {
          setImportProgress(
            `Importing ${progress.processedRows} / ${progress.totalRows} rows (batch ${progress.completedBatches} / ${progress.totalBatches})`,
          );
        },
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }

      const importedCount = result?.inserted ?? 0;
      const duplicatesIgnored = result?.duplicatesIgnored ?? 0;
      const invalidCount = result?.invalid ?? 0;
      toast.success(
        [
          `Imported ${importedCount} leads`,
          duplicatesIgnored > 0 ? `${duplicatesIgnored} duplicates ignored` : "",
          invalidCount > 0 ? `${invalidCount} invalid rows skipped` : "",
        ].filter(Boolean).join(" | "),
      );
      setParsedRows([]);
      setFileName("");
      await loadLeads();
    } finally {
      setUploading(false);
      setImportProgress("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="surface-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div>
              <h2 className="text-lg font-semibold">Auto Call Master Control</h2>
              <p className="text-sm text-muted-foreground">
                Disconnect pauses all auto-call assignments and clears current auto-call work for agents.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={autoDialControl.enabled ? "success-badge" : "danger-badge"}>
                {autoDialControl.enabled ? "Connected" : "Disconnected"}
              </span>
              <span className="text-muted-foreground">
                {controlLoading
                  ? "Loading control state..."
                  : autoDialControl.updatedAt
                    ? `Last updated ${formatDateTime(autoDialControl.updatedAt)}`
                    : "No manual change recorded yet"}
              </span>
              {autoDialControl.updatedByName || autoDialControl.updatedById ? (
                <span className="text-muted-foreground">
                  by {autoDialControl.updatedByName || autoDialControl.updatedById}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="action-outline"
                onClick={() => void handleAutoDialControl(true)}
                disabled={controlLoading || controlSaving || autoDialControl.enabled}
              >
                {controlSaving && !autoDialControl.enabled ? "Connecting..." : "Connect Auto Call"}
              </button>
              <button
                className="action-outline"
                onClick={() => void handleAutoDialControl(false)}
                disabled={controlLoading || controlSaving || !autoDialControl.enabled}
              >
                {controlSaving && autoDialControl.enabled ? "Disconnecting..." : "Disconnect Auto Call"}
              </button>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Fresh Leads Auto Connect</p>
                  <p className="text-xs text-muted-foreground">Outbound agents auto-call the next fresh lead after the interval.</p>
                </div>
                <button
                  type="button"
                  className={autoDialControl.freshLeadAutoConnectEnabled !== false ? "success-badge" : "danger-badge"}
                  onClick={() => void handleFreshAutoConnectControl({
                    freshLeadAutoConnectEnabled: autoDialControl.freshLeadAutoConnectEnabled === false,
                  })}
                  disabled={controlLoading || controlSaving}
                >
                  {autoDialControl.freshLeadAutoConnectEnabled !== false ? "ON" : "OFF"}
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                Interval
                <input
                  type="number"
                  min={5}
                  max={120}
                  className="control-field h-8 w-20 px-2 py-1 text-sm"
                  value={Number(autoDialControl.freshLeadAutoConnectIntervalSeconds) || 10}
                  disabled={controlLoading || controlSaving}
                  onChange={(event) => {
                    const nextInterval = Math.max(5, Math.min(120, Number(event.target.value) || 10));
                    setAutoDialControl((current) => ({
                      ...current,
                      freshLeadAutoConnectIntervalSeconds: nextInterval,
                    }));
                  }}
                  onBlur={(event) => void handleFreshAutoConnectControl({
                    freshLeadAutoConnectIntervalSeconds: Math.max(5, Math.min(120, Number(event.target.value) || 10)),
                  })}
                />
                seconds
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.total}</p>
          <p className="text-sm text-muted-foreground">Total Leads</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.pending}</p>
          <p className="text-sm text-muted-foreground">Pending Queue</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.assigned}</p>
          <p className="text-sm text-muted-foreground">Assigned / Dialing</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{summary.completed}</p>
          <p className="text-sm text-muted-foreground">Completed</p>
        </div>
      </div>

      <AutoDialLiveMonitorPanel leads={leads} />

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="surface-panel p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Upload Auto Dial Leads</h2>
            <p className="text-sm text-muted-foreground">
              Import an Excel sheet and queue leads for free agents to dial automatically.
            </p>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center transition hover:bg-muted/40">
            <FileUp className="h-8 w-8 text-accent" />
            <div>
              <p className="font-medium">Upload `.xlsx`, `.xls`, or `.csv`</p>
              <p className="text-sm text-muted-foreground">Columns: Customer Name, Mobile Number, Area, Gold Weight, Type</p>
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </label>

          {fileName ? (
            <div className="rounded-xl border border-border px-4 py-3 text-sm">
              <p className="font-medium">{fileName}</p>
              <p className="text-muted-foreground">{parsedRows.length} rows parsed and ready</p>
              {importProgress ? <p className="text-xs text-accent">{importProgress}</p> : null}
            </div>
          ) : null}

          <button className="action-gold w-full justify-center" onClick={handleImport} disabled={!parsedRows.length || uploading}>
            <Upload className="h-4 w-4" />
            {uploading ? (importProgress || "Importing...") : "Import Leads"}
          </button>
        </div>

        <div className="surface-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Upload Preview</h2>
              <p className="text-sm text-muted-foreground">The imported fields shown here are what agents will dial from.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile Number</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Gold Weight</th>
                  <th className="px-4 py-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Upload a file to preview the parsed customer leads.
                    </td>
                  </tr>
                ) : parsedRows.slice(0, 25).map((row, index) => (
                  <tr key={`${row.mobileNumber}-${index}`} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{row.customerName || "—"}</td>
                    <td className="px-4 py-3 font-mono text-accent">{row.mobileNumber}</td>
                    <td className="px-4 py-3">{row.area || "—"}</td>
                    <td className="px-4 py-3">{row.goldWeight || "—"}</td>
                    <td className="px-4 py-3">{row.type || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Auto Dial Queue</h2>
            <p className="text-sm text-muted-foreground">Free agents receive the next assigned lead automatically.</p>
          </div>
          <div className="flex items-center gap-3">
            {lastSync ? <span className="text-xs text-muted-foreground">Last sync: {lastSync}</span> : null}
            <button
              className="action-outline"
              onClick={() => void Promise.all([loadLeads(), loadControl()])}
              disabled={loading || controlLoading}
            >
              <RefreshCw className="h-4 w-4" />
              {loading || controlLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[260px]"
              placeholder="Search customer, number, area, gold weight, type..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select className="control-field min-w-[180px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="dialing">Dialing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{filteredLeads.length} of {leads.length} leads</p>
            <button className="action-outline" onClick={exportLeadsCsv} disabled={filteredLeads.length === 0}>
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
                <th className="px-4 py-3">Mobile Number</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Gold Weight</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scheduled For</th>
                <th className="px-4 py-3">Assigned Agent</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    {leads.length === 0 ? "No auto dial leads imported yet." : "No leads found for the selected search/filter."}
                  </td>
                </tr>
              ) : leadPager.pageItems.map((lead) => (
                <tr key={lead.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{lead.customerName || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-accent">{lead.mobileNumber}</span>
                      {["pending", "assigned", "dialing"].includes(lead.status) ? (
                        <button
                          type="button"
                          className="action-outline px-2 py-1 text-xs"
                          onClick={() => void handleRemoveLead(lead)}
                          disabled={removingLeadId === lead.id}
                          title="Remove from auto dial queue"
                        >
                          <X className="h-3.5 w-3.5" />
                          {removingLeadId === lead.id ? "Removing..." : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{lead.area || "—"}</td>
                  <td className="px-4 py-3">{lead.goldWeight || "—"}</td>
                  <td className="px-4 py-3">{lead.type || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={getStatusBadge(lead.status)}>{lead.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{formatDateTime(lead.scheduledFor)}</p>
                    {lead.scheduledAgentId || lead.scheduledAgentName ? (
                      <p className="text-muted-foreground">{lead.scheduledAgentName || lead.scheduledAgentId}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {lead.assignedAgentId ? (
                      <div className="flex items-center gap-2">
                        <PhoneCall className="h-4 w-4 text-accent" />
                        <span>{lead.assignedAgentName || lead.assignedAgentId}</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{lead.sourceFile || "—"}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(lead.updatedAt)}</td>
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
          disabled={loading || Boolean(removingLeadId)}
        />
      </div>
    </div>
  );
}
