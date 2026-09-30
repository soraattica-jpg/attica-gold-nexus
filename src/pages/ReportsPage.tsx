import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Ban, Download, FileBarChart, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  api,
  type CallsByDateResult,
  type CallsByPhoneResult,
  type CallsListResult,
  type CallsReportSummaryResult,
  type ConversionApiRecord,
  type CustomerProfileResult,
  type IntakeFormHistoryResult,
  type StatsRecord,
} from "@/lib/api";
import type { CallRecord } from "@/data/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentDirectory } from "@/hooks/useAgentDirectory";
import { getCallDisplayCustomerName } from "@/lib/callDisplay";
import { getBusinessDateString } from "@/lib/businessDate";
import { getCallDisplayDate, getCallDisplayTime } from "@/lib/callDateTime";
import { getCallCustomerUid } from "@/lib/customerIdentity";
import { formatCallDurationForExport } from "@/lib/callDuration";
import { dedupeCallInteractions } from "@/lib/callMetrics";
import {
  DISPOSITION_CATEGORY_OPTIONS,
  DISPOSITION_GROUPS,
  getCallCategory,
  getDispositionCategory,
  getDispositionLabel,
} from "@/lib/dispositions";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  formatReportExportDate,
  formatReportExportTime,
  getReportExportDateKey,
} from "@/lib/reportExport";
import { getGramCategory } from "@/lib/gramCategory";
import { isAdminRole } from "@/lib/roles";

const REPORTS_TABLE_PAGE_SIZE = 50;

const getInitialReportDate = (parameter: "fromDate" | "toDate") => {
  if (typeof window !== "undefined") {
    const value = new URLSearchParams(window.location.search).get(parameter) || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  return getBusinessDateString(new Date());
};

const getCallDispositionCategory = (call: CallRecord) => (
  getCallCategory(call) || call.dispositionCategory || getDispositionCategory(call.callbackStatus)
);

const getLeadSourceDisplay = (call: Pick<CallRecord, "leadSource" | "direction">) => {
  const source = call.leadSource?.trim() || "";
  if (call.direction === "incoming") {
    return !source || source === "—" || source === "â€”" ? "Incoming" : source;
  }
  return !source || source === "—" || source === "â€”" ? "Manual" : source;
};

const getDurationDisplay = (call: Pick<CallRecord, "duration" | "talkDurationSeconds">) => {
  const duration = call.duration?.trim() || "";
  const seconds = Number(call.talkDurationSeconds) || 0;
  if (duration && duration !== "00:00" && duration !== "00:00:00") return duration;
  if (seconds > 0) return formatCallDurationForExport(duration, seconds);
  return duration || "—";
};

const compareReportSource = (left: string, right: string) => (
  left.localeCompare(right, "en-IN", { sensitivity: "base" })
);

const parseDateKey = (value: string) => {
  const matched = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;

  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateKey = (value: Date) => [
  value.getUTCFullYear(),
  String(value.getUTCMonth() + 1).padStart(2, "0"),
  String(value.getUTCDate()).padStart(2, "0"),
].join("-");

const addDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getDateKeysInRange = (fromDate: string, toDate: string) => {
  const start = parseDateKey(fromDate);
  const end = parseDateKey(toDate);
  if (!start || !end || start.getTime() > end.getTime()) return [];

  const keys: string[] = [];
  for (let current = start; current.getTime() <= end.getTime(); current = addDays(current, 1)) {
    keys.push(formatDateKey(current));
  }
  return keys;
};

const EMPTY_DATE_RESULT: CallsByDateResult = {
  date: "",
  total: 0,
  inbound: 0,
  outbound: 0,
  results: [],
};

const EMPTY_REPORT_SUMMARY: CallsReportSummaryResult = {
  summary: {},
  hourly: [],
  branches: [],
  purposes: [],
  dispositionCategories: [],
  sources: [],
  agents: [],
  rowCount: 0,
  maxRows: 0,
};

const readSummaryNumber = (summary: Record<string, unknown> | undefined, key: string, fallback = 0) => {
  const value = Number(summary?.[key]);
  return Number.isFinite(value) ? value : fallback;
};

const EMPTY_HISTORY_RESULT: CallsByPhoneResult = {
  phone: "",
  total: 0,
  results: [],
};

const EMPTY_PROFILE_RESULT: CustomerProfileResult = {
  phone: "",
  customerId: "",
  customerUid: "",
  customerName: "",
  mob2: "",
  district: "",
  location: "",
  branch: "",
  language: "",
  businessType: "",
  metalType: "",
  grams: "",
  releasingAmount: "",
  bankName: "",
  onlinePrice: "",
  pricePerGram: "",
  advertisement: "",
  lead: "",
  formStatus: "",
  purpose: "",
  statusFollowUpAt: "",
  notes: "",
  latestCallStatus: "",
  latestStatus: "",
  latestFormStatus: "",
  latestDisposition: "",
  latestDispositionCategory: "",
  hasSavedDetails: false,
};

const EMPTY_INTAKE_HISTORY_RESULT: IntakeFormHistoryResult = {
  phone: "",
  total: 0,
  results: [],
};

export default function ReportsPage() {
  const { user } = useAuth();
  const { resolveAgentName } = useAgentDirectory();
  const canManageBlockedNumbers = isAdminRole(user?.role);
  const [, setStats] = useState<StatsRecord | null>(null);
  const [exportStartDate, setExportStartDate] = useState(() => getInitialReportDate("fromDate"));
  const [exportEndDate, setExportEndDate] = useState(() => getInitialReportDate("toDate"));
  const [exportLoading, setExportLoading] = useState(false);
  const [historySearchValue, setHistorySearchValue] = useState("");
  const [dateCalls, setDateCalls] = useState<CallsByDateResult>(EMPTY_DATE_RESULT);
  const [reportSummary, setReportSummary] = useState<CallsReportSummaryResult>(EMPTY_REPORT_SUMMARY);
  const [dateLoading, setDateLoading] = useState(false);
  const [detailCalls, setDetailCalls] = useState<CallsListResult>({
    page: 1,
    limit: REPORTS_TABLE_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    results: [],
  });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(REPORTS_TABLE_PAGE_SIZE);
  const [detailDisposition, setDetailDisposition] = useState("all");
  const [detailDispositionCategory, setDetailDispositionCategory] = useState("all");
  const [detailSource, setDetailSource] = useState("all");
  const [historyPhone, setHistoryPhone] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResult, setHistoryResult] = useState<CallsByPhoneResult>(EMPTY_HISTORY_RESULT);
  const [historyProfile, setHistoryProfile] = useState<CustomerProfileResult>(EMPTY_PROFILE_RESULT);
  const [historyIntakeResult, setHistoryIntakeResult] = useState<IntakeFormHistoryResult>(EMPTY_INTAKE_HISTORY_RESULT);
  const [historyCustomerData, setHistoryCustomerData] = useState<ConversionApiRecord[]>([]);
  const [historyBlocked, setHistoryBlocked] = useState(false);
  const [historyBlockSaving, setHistoryBlockSaving] = useState(false);

  useEffect(() => {
    api.getStats().then((data) => { setStats(data); });
  }, []);

  const reportRangeLabel = exportStartDate === exportEndDate
    ? exportStartDate
    : `${exportStartDate} to ${exportEndDate}`;

  const loadCallsForSelectedRange = useCallback(async (): Promise<CallsByDateResult> => {
    if (!exportStartDate || !exportEndDate || exportStartDate > exportEndDate) {
      return { ...EMPTY_DATE_RESULT, date: reportRangeLabel };
    }

    const listResult = await api.getCallsList({
      fromDate: exportStartDate,
      toDate: exportEndDate,
      page: 1,
      limit: REPORTS_TABLE_PAGE_SIZE,
      dedupe: false,
    });
    const summary = listResult.summary || {};

    return {
      date: reportRangeLabel,
      total: readSummaryNumber(summary, "total", listResult.total),
      inbound: readSummaryNumber(summary, "inbound"),
      outbound: readSummaryNumber(summary, "outbound"),
      summary,
      results: listResult.results,
    };
  }, [exportEndDate, exportStartDate, reportRangeLabel]);

  const loadReportSummary = useCallback(async () => {
    if (!exportStartDate || !exportEndDate || exportStartDate > exportEndDate) {
      return EMPTY_REPORT_SUMMARY;
    }

    return api.getCallsReportSummary({
      fromDate: exportStartDate,
      toDate: exportEndDate,
    });
  }, [exportEndDate, exportStartDate]);

  useEffect(() => {
    let ignore = false;

    const loadDateCalls = async () => {
      setDateLoading(true);
      try {
        const [data, summaryData] = await Promise.all([
          loadCallsForSelectedRange(),
          loadReportSummary(),
        ]);
        if (!ignore) {
          setDateCalls(data);
          setReportSummary(summaryData);
        }
      } finally {
        if (!ignore) {
          setDateLoading(false);
        }
      }
    };

    void loadDateCalls();
    return () => {
      ignore = true;
    };
  }, [loadCallsForSelectedRange, loadReportSummary]);

  useEffect(() => {
    setDetailPage(1);
  }, [exportEndDate, exportStartDate, detailDisposition, detailDispositionCategory, detailSource, detailPageSize]);

  useEffect(() => {
    let ignore = false;

    const loadDetailCalls = async () => {
      if (!exportStartDate || !exportEndDate || exportStartDate > exportEndDate) {
        setDetailCalls({
          page: 1,
          limit: detailPageSize,
          total: 0,
          totalPages: 0,
          results: [],
        });
        return;
      }

      setDetailLoading(true);
      try {
        const data = await api.getCallsList({
          fromDate: exportStartDate,
          toDate: exportEndDate,
          page: detailPage,
          limit: detailPageSize,
          disposition: detailDisposition === "all" ? undefined : detailDisposition,
          dispositionCategory: detailDispositionCategory === "all" ? undefined : detailDispositionCategory,
          source: detailSource === "all" ? undefined : detailSource,
          dedupe: false,
        });
        if (!ignore) {
          setDetailCalls(data);
        }
      } finally {
        if (!ignore) {
          setDetailLoading(false);
        }
      }
    };

    void loadDetailCalls();
    return () => {
      ignore = true;
    };
  }, [detailDisposition, detailDispositionCategory, detailPage, detailPageSize, detailSource, exportEndDate, exportStartDate]);

  const refresh = async () => {
    const [statsData, dateData, summaryData] = await Promise.all([
      api.getStats(),
      loadCallsForSelectedRange(),
      loadReportSummary(),
    ]);
    setStats(statsData);
    setDateCalls(dateData);
    setReportSummary(summaryData);
    setDetailPage(1);
    toast.success("Reports refreshed");
  };

  const openCustomerHistory = async (phone: string) => {
    const normalizedPhone = normalizePhoneNumber(phone);
    if (normalizedPhone.length !== 10) {
      toast.error("Enter a valid 10-digit customer number");
      return;
    }

    setHistorySearchValue(normalizedPhone);
    setHistoryPhone(normalizedPhone);
    setHistoryLoading(true);
    setHistoryBlocked(false);
    setHistoryProfile({ ...EMPTY_PROFILE_RESULT, phone: normalizedPhone });
    setHistoryIntakeResult({ ...EMPTY_INTAKE_HISTORY_RESULT, phone: normalizedPhone });
    setHistoryCustomerData([]);
    setHistoryResult({ ...EMPTY_HISTORY_RESULT, phone: normalizedPhone });
    try {
      const [profileResult, intakeHistoryResult, callHistoryResult, customerDataResult, blockedResult] = await Promise.allSettled([
        api.getCustomerProfile(normalizedPhone),
        api.getIntakeFormHistory(normalizedPhone),
        api.getCustomerCallHistory(normalizedPhone),
        api.getConversionData(normalizedPhone, { strict: true }),
        api.getBlockedNumber(normalizedPhone),
      ]);

      const profile = profileResult.status === "fulfilled"
        ? profileResult.value
        : { ...EMPTY_PROFILE_RESULT, phone: normalizedPhone };
      const intakeHistory = intakeHistoryResult.status === "fulfilled"
        ? intakeHistoryResult.value
        : { ...EMPTY_INTAKE_HISTORY_RESULT, phone: normalizedPhone };
      const callHistory = callHistoryResult.status === "fulfilled"
        ? callHistoryResult.value
        : { ...EMPTY_HISTORY_RESULT, phone: normalizedPhone };
      const customerData = customerDataResult.status === "fulfilled"
        ? customerDataResult.value
        : [];

      if (
        profileResult.status === "rejected" &&
        intakeHistoryResult.status === "rejected" &&
        callHistoryResult.status === "rejected"
      ) {
        toast.error("Unable to load customer history right now");
      }

      setHistoryProfile(profile);
      setHistoryIntakeResult(intakeHistory);
      setHistoryResult(callHistory);
      setHistoryCustomerData(customerData);
      setHistoryBlocked(blockedResult.status === "fulfilled" && blockedResult.value.blocked === true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistorySearch = async () => {
    await openCustomerHistory(historySearchValue);
  };

  const closeCustomerHistory = () => {
    setHistoryPhone("");
    setHistoryLoading(false);
    setHistoryResult(EMPTY_HISTORY_RESULT);
    setHistoryProfile(EMPTY_PROFILE_RESULT);
    setHistoryIntakeResult(EMPTY_INTAKE_HISTORY_RESULT);
    setHistoryCustomerData([]);
    setHistoryBlocked(false);
    setHistoryBlockSaving(false);
  };

  const toggleHistoryBlockedNumber = async () => {
    if (!canManageBlockedNumbers || !historyPhone) return;

    const nextBlocked = !historyBlocked;
    setHistoryBlockSaving(true);
    const result = await api.setBlockedNumber(historyPhone, {
      blocked: nextBlocked,
      blockedById: user?.id || "",
      blockedByName: user?.name || "",
      note: "Reports customer search toggle",
    });
    setHistoryBlockSaving(false);

    if (result.error) {
      toast.error(nextBlocked ? "Failed to block number" : "Failed to unblock number");
      return;
    }

    setHistoryBlocked(result.blocked ?? nextBlocked);
    toast.success(nextBlocked ? "Number blocked" : "Number unblocked");
  };

  const visibleHistoryCalls = useMemo(
    () => dedupeCallInteractions(historyResult.results),
    [historyResult.results],
  );
  const visibleIntakeHistory = useMemo(
    () => dedupeCallInteractions(historyIntakeResult.results),
    [historyIntakeResult.results],
  );
  const historyCustomerName = useMemo(() => {
    if (historyProfile.customerName) return historyProfile.customerName;
    if (historyCustomerData[0]?.customerName) return historyCustomerData[0].customerName;
    if (visibleIntakeHistory[0]) return getCallDisplayCustomerName(visibleIntakeHistory[0]);
    if (visibleHistoryCalls[0]) return getCallDisplayCustomerName(visibleHistoryCalls[0]);
    return "";
  }, [historyCustomerData, historyProfile.customerName, visibleHistoryCalls, visibleIntakeHistory]);
  const hasCustomerHistoryData = Boolean(
    historyProfile.hasSavedDetails ||
    historyCustomerData.length > 0 ||
    visibleIntakeHistory.length > 0 ||
    visibleHistoryCalls.length > 0,
  );
  const summaryStats = detailCalls.summary || dateCalls.summary || reportSummary.summary || {};
  const fullAnalyticsLoading = dateLoading && reportSummary.rowCount === 0;
  const totalCallCount = readSummaryNumber(summaryStats, "total", detailCalls.total);
  const inboundCount = readSummaryNumber(summaryStats, "inbound");
  const outboundCount = readSummaryNumber(summaryStats, "outbound");
  const answeredCount = readSummaryNumber(summaryStats, "answered");
  const missedCount = readSummaryNumber(summaryStats, "missed");
  const hourlyData = useMemo(() => {
    const hourlyByLabel = new Map(reportSummary.hourly.map((row) => [row.hour, Number(row.calls) || 0]));
    return Array.from({ length: 24 }, (_, hour) => {
      const label = `${String(hour).padStart(2, "0")}:00`;
      return { hour: label, calls: hourlyByLabel.get(label) || 0 };
    });
  }, [reportSummary.hourly]);

  const agentData = reportSummary.agents;

  const branchData = reportSummary.branches;

  const purposeData = reportSummary.purposes;

  const dispositionCategoryData = reportSummary.dispositionCategories;

  const sourceOptions = useMemo(() => {
    const sources = new Set<string>();
    reportSummary.sources.forEach((source) => sources.add(source));
    if (detailSource !== "all") {
      sources.add(detailSource);
    }
    return Array.from(sources).filter(Boolean).sort(compareReportSource);
  }, [detailSource, reportSummary.sources]);

  const visibleDetailCalls = detailCalls.results;

  useEffect(() => {
    if (detailCalls.totalPages > 0 && detailPage > detailCalls.totalPages) {
      setDetailPage(detailCalls.totalPages);
    }
  }, [detailCalls.totalPages, detailPage]);

  const visiblePageNumbers = useMemo(() => {
    if (detailCalls.totalPages <= 1) return [];
    const startPage = Math.max(1, detailPage - 2);
    const endPage = Math.min(detailCalls.totalPages, startPage + 4);
    const adjustedStart = Math.max(1, endPage - 4);

    return Array.from({ length: endPage - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [detailCalls.totalPages, detailPage]);

  const exportCSV = async () => {
    if (!exportStartDate || !exportEndDate) {
      toast.error("Select both start and end dates");
      return;
    }
    if (exportStartDate > exportEndDate) {
      toast.error("Start date must be before end date");
      return;
    }

    setExportLoading(true);
    try {
      const result = await api.downloadCallsReportCsv({
        fromDate: exportStartDate,
        toDate: exportEndDate,
        disposition: detailDisposition === "all" ? undefined : detailDisposition,
        dispositionCategory: detailDispositionCategory === "all" ? undefined : detailDispositionCategory,
        source: detailSource === "all" ? undefined : detailSource,
        filename: `attica-report-${exportStartDate}-to-${exportEndDate}.csv`,
      });
      if (result.rowCount < 0) {
        toast.success(`Report download started for ${exportStartDate} to ${exportEndDate}`);
      } else if (result.rowCount === 0) {
        toast.error("No report rows found for the selected dates");
      } else if (result.maxRows > 0 && result.rowCount >= result.maxRows) {
        toast.warning(`Report exported ${result.rowCount} rows. Narrow the date range if you need more rows.`);
      } else {
        toast.success(`Report exported ${result.rowCount} rows for ${exportStartDate} to ${exportEndDate}`);
      }
    } catch (error) {
      console.error("Report export failed", error);
      toast.error("Report export failed. Please try again.");
    } finally {
      setExportLoading(false);
    }
  };

  const renderCustomerHistoryTable = (records: CallRecord[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date &amp; Time</th>
            <th className="px-4 py-3">Direction</th>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Call Source</th>
            <th className="px-4 py-3">Duration</th>
            <th className="px-4 py-3">Area</th>
            <th className="px-4 py-3">District</th>
            <th className="px-4 py-3">Business</th>
            <th className="px-4 py-3">Purpose</th>
            <th className="px-4 py-3">Branch</th>
            <th className="px-4 py-3">Disposition</th>
            <th className="px-4 py-3">Disposition Category</th>
            <th className="px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody>
          {records.map((call) => (
            <tr key={call.id} className="border-t border-border">
              <td className="px-4 py-3 font-mono text-xs">{[getCallDisplayDate(call), getCallDisplayTime(call)].filter(Boolean).join(", ") || "—"}</td>
              <td className="px-4 py-3 capitalize">{call.direction}</td>
              <td className="px-4 py-3">{resolveAgentName(call.agentId, call.agentName)}</td>
              <td className="px-4 py-3">{getCallDisplayCustomerName(call)}</td>
              <td className="px-4 py-3">{getLeadSourceDisplay(call)}</td>
              <td className="px-4 py-3 font-mono text-xs">{getDurationDisplay(call)}</td>
              <td className="px-4 py-3">{call.place || "—"}</td>
              <td className="px-4 py-3">{call.district || "—"}</td>
              <td className="px-4 py-3">{call.businessType || "—"}</td>
              <td className="px-4 py-3">{call.purpose || "—"}</td>
              <td className="px-4 py-3">{call.branch || "—"}</td>
              <td className="min-w-[210px] max-w-[280px] px-4 py-3 whitespace-normal break-words" title={getDispositionLabel(call.callbackStatus) || call.callbackStatus || ""}>
                {getDispositionLabel(call.callbackStatus) || call.callbackStatus || "—"}
              </td>
              <td className="px-4 py-3">{getCallDispositionCategory(call) || "—"}</td>
              <td className="px-4 py-3 max-w-[320px] whitespace-pre-wrap break-words">{call.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSavedIntakeHistoryTable = (records: CallRecord[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date &amp; Time</th>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Call Source</th>
            <th className="px-4 py-3">Duration</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">District</th>
            <th className="px-4 py-3">Business</th>
            <th className="px-4 py-3">Purpose</th>
            <th className="px-4 py-3">Branch</th>
            <th className="px-4 py-3">Form Status</th>
            <th className="px-4 py-3">Disposition</th>
            <th className="px-4 py-3">Disposition Category</th>
            <th className="px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody>
          {records.map((call) => (
            <tr key={call.id} className="border-t border-border align-top">
              <td className="px-4 py-3 font-mono text-xs">{[getCallDisplayDate(call), getCallDisplayTime(call)].filter(Boolean).join(", ") || "—"}</td>
              <td className="px-4 py-3">{resolveAgentName(call.agentId, call.agentName)}</td>
              <td className="px-4 py-3">{getCallDisplayCustomerName(call)}</td>
              <td className="px-4 py-3">{getLeadSourceDisplay(call)}</td>
              <td className="px-4 py-3 font-mono text-xs">{getDurationDisplay(call)}</td>
              <td className="px-4 py-3">{call.place || "—"}</td>
              <td className="px-4 py-3">{call.district || "—"}</td>
              <td className="px-4 py-3">{call.businessType || "—"}</td>
              <td className="px-4 py-3">{call.purpose || "—"}</td>
              <td className="px-4 py-3">{call.branch || "—"}</td>
              <td className="px-4 py-3">{call.formStatus || "—"}</td>
              <td className="min-w-[210px] max-w-[280px] px-4 py-3 whitespace-normal break-words" title={getDispositionLabel(call.callbackStatus) || call.callbackStatus || ""}>
                {getDispositionLabel(call.callbackStatus) || call.callbackStatus || "—"}
              </td>
              <td className="px-4 py-3">{getCallDispositionCategory(call) || "—"}</td>
              <td className="px-4 py-3 max-w-[320px] whitespace-pre-wrap break-words">{call.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Analytics</p>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><FileBarChart className="h-6 w-6 text-accent" />Reports</h1>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Start Date
              <input
                type="date"
                value={exportStartDate}
                onChange={(e) => {
                  setExportStartDate(e.target.value);
                  setDetailPage(1);
                }}
                className="control-field text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              End Date
              <input
                type="date"
                value={exportEndDate}
                onChange={(e) => {
                  setExportEndDate(e.target.value);
                  setDetailPage(1);
                }}
                className="control-field text-sm"
              />
            </label>
            <button onClick={() => void exportCSV()} disabled={exportLoading || dateLoading} className="action-outline disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {exportLoading ? "Exporting..." : dateLoading ? "Loading..." : "Export CSV"}
            </button>
            <button onClick={() => void refresh()} className="action-outline"><RefreshCw className="h-4 w-4" />Refresh</button>
          </div>
        </div>

        <div className="surface-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Customer Search</h2>
              <p className="text-sm text-muted-foreground">Search all historic customer data by CX number to view full saved details, intake history, and call history.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-xl">
              <input
                type="text"
                inputMode="numeric"
                value={historySearchValue}
                onChange={(event) => setHistorySearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleHistorySearch();
                  }
                }}
                placeholder="Enter 10-digit customer number"
                className="control-field flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleHistorySearch()}
                disabled={historyLoading}
                className="action-gold justify-center px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                {historyLoading ? "Searching..." : "Search Customer"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          {[
            { label: "Total Calls", value: totalCallCount },
            { label: "Inbound", value: inboundCount },
            { label: "Outbound", value: outboundCount },
            { label: "Answered", value: answeredCount },
            { label: "Missed", value: missedCount },
          ].map((card) => (
            <div key={card.label} className="surface-panel p-4">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-3xl font-semibold">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface-panel p-5">
            <h2 className="mb-4 text-lg font-semibold">Calls per Hour</h2>
            {fullAnalyticsLoading ? (
              <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">Calculating the complete filtered dataset...</p>
            ) : <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="calls" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>}
          </div>

          <div className="surface-panel p-5">
            <h2 className="mb-4 text-lg font-semibold">Calls by Branch</h2>
            {fullAnalyticsLoading ? (
              <p className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">Calculating the complete filtered dataset...</p>
            ) : branchData.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No data for this date</p>
            ) : (
              <div className="h-[250px] space-y-3 overflow-y-auto pr-1">
                {branchData.map((item, index) => {
                  const maxCalls = branchData[0]?.calls || 1;
                  const widthPercent = Math.max(8, Math.round((item.calls / maxCalls) * 100));
                  return (
                    <div key={item.branch} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">#{index + 1}</p>
                          <p className="truncate text-sm font-medium">{item.branch}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-semibold text-accent">{item.calls}</p>
                          <p className="text-xs text-muted-foreground">calls</p>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-border/70">
                        <div
                          className="h-2 rounded-full bg-accent transition-all"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="surface-panel p-5">
          <h2 className="mb-4 text-lg font-semibold">Disposition Category Summary</h2>
          {fullAnalyticsLoading ? (
            <p className="py-8 text-center text-muted-foreground">Calculating the complete filtered dataset...</p>
          ) : dispositionCategoryData.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No disposition category data for this date</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
              {dispositionCategoryData.map((item) => (
                <div key={item.category} className="rounded-xl border border-border bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-semibold text-accent">{item.calls}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="surface-panel overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-0">
            <div>
              <h2 className="text-lg font-semibold">Call Details — {reportRangeLabel}</h2>
              <p className="text-sm text-muted-foreground">Click a customer number to open full call history for that customer.</p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div>{detailCalls.total} records</div>
              {detailLoading ? <div>Loading page...</div> : <div>Page {detailCalls.page} of {Math.max(detailCalls.totalPages, 1)}</div>}
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <select
                  className="control-field min-w-[210px] text-sm"
                  value={detailSource}
                  onChange={(event) => setDetailSource(event.target.value)}
                >
                  <option value="all">All call sources</option>
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
                <select
                  className="control-field min-w-[230px] text-sm"
                  value={detailDisposition}
                  onChange={(event) => setDetailDisposition(event.target.value)}
                >
                  <option value="all">All dispositions</option>
                  {Object.entries(DISPOSITION_GROUPS).map(([groupName, items]) => (
                    <optgroup key={groupName} label={groupName}>
                      {items.map((item) => (
                        <option key={item.code} value={item.code}>{item.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  className="control-field min-w-[230px] text-sm"
                  value={detailDispositionCategory}
                  onChange={(event) => setDetailDispositionCategory(event.target.value)}
                >
                  <option value="all">All disposition categories</option>
                  {DISPOSITION_CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="px-5 pt-3 text-xs text-muted-foreground">
            Scroll horizontally to see all columns from <span className="font-medium text-foreground">Mobile 2</span> through <span className="font-medium text-foreground">Notes</span>.
          </div>
          <div className="overflow-x-auto pb-2">
          <table className="w-full min-w-[2740px] table-auto text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">S.No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Customer ID</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Call Source</th>
                <th className="px-4 py-3">Mobile 2</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3">Metal</th>
                <th className="px-4 py-3">Grams</th>
                <th className="px-4 py-3">Gram Category</th>
                <th className="px-4 py-3">Release Amt</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Advertisement</th>
                <th className="px-4 py-3">Form Status</th>
                <th className="px-4 py-3">Disposition</th>
                <th className="px-4 py-3">Disposition Category</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {!detailLoading && visibleDetailCalls.length === 0 ? (
                <tr><td colSpan={27} className="px-4 py-8 text-center text-muted-foreground">No calls found for this date and disposition filters</td></tr>
              ) : visibleDetailCalls.map((call, index) => (
                <tr key={call.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-mono text-xs">{((detailCalls.page - 1) * detailCalls.limit) + index + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatReportExportDate(call) || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatReportExportTime(call) || "—"}</td>
                  <td className="px-4 py-3 capitalize">{call.direction}</td>
                  <td className="px-4 py-3">{resolveAgentName(call.agentId, call.agentName)}</td>
                  <td className="px-4 py-3 font-medium">{getCallDisplayCustomerName(call)}</td>
                  <td className="px-4 py-3">
                    {call.callerId ? (
                      <button className="font-mono text-xs font-semibold text-accent underline-offset-2 hover:underline" onClick={() => void openCustomerHistory(call.callerId)}>
                        {getCallCustomerUid(call) || "—"}
                      </button>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {call.callerId ? (
                      <button className="text-accent underline-offset-2 hover:underline" onClick={() => void openCustomerHistory(call.callerId)}>
                        {call.callerId}
                      </button>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">{getLeadSourceDisplay(call)}</td>
                  <td className="px-4 py-3">{call.mob2 || "—"}</td>
                  <td className="px-4 py-3">{call.place || "—"}</td>
                  <td className="px-4 py-3">{call.district || "—"}</td>
                  <td className="px-4 py-3">{call.language || "—"}</td>
                  <td className="px-4 py-3">{call.businessType || "—"}</td>
                  <td className="px-4 py-3">{call.purpose || "—"}</td>
                  <td className="px-4 py-3">{call.metalType || "—"}</td>
                  <td className="px-4 py-3">{call.grams || "—"}</td>
                  <td className="px-4 py-3">{getGramCategory(call.grams) || "—"}</td>
                  <td className="px-4 py-3">{call.releasingAmount || "—"}</td>
                  <td className="px-4 py-3">{call.bankName || "—"}</td>
                  <td className="px-4 py-3">{call.branch || "—"}</td>
                  <td className="px-4 py-3">{call.lead || "—"}</td>
                  <td className="px-4 py-3">{call.advertisement || "—"}</td>
                  <td className="px-4 py-3">{call.formStatus || "—"}</td>
                  <td className="min-w-[210px] max-w-[280px] px-4 py-3 whitespace-normal break-words" title={getDispositionLabel(call.callbackStatus) || call.callbackStatus || ""}>
                    {getDispositionLabel(call.callbackStatus) || call.callbackStatus || "—"}
                  </td>
                  <td className="px-4 py-3">{getCallDispositionCategory(call) || "—"}</td>
                  <td className="px-4 py-3 max-w-[320px]">
                    <p
                      className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words leading-5"
                      title={call.notes || ""}
                    >
                      {call.notes || "—"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pt-4">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <label>
                Rows per page
                <select
                  className="control-field ml-2"
                  value={detailPageSize}
                  onChange={(event) => setDetailPageSize(Number(event.target.value))}
                  disabled={detailLoading}
                >
                  {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <span>Showing {(detailCalls.total === 0 ? 0 : ((detailCalls.page - 1) * detailCalls.limit) + 1)} to {Math.min(detailCalls.page * detailCalls.limit, detailCalls.total)} of {detailCalls.total}</span>
            </div>
            {detailCalls.totalPages > 1 ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailPage(1)}
                  disabled={detailPage <= 1 || detailLoading}
                  className="action-outline px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  First
                </button>
                <button
                  type="button"
                  onClick={() => setDetailPage((current) => Math.max(1, current - 1))}
                  disabled={detailPage <= 1 || detailLoading}
                  className="action-outline px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                {visiblePageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setDetailPage(pageNumber)}
                    disabled={detailLoading}
                    className={pageNumber === detailPage ? "action-gold min-w-10 justify-center px-3 py-2 text-sm" : "action-outline min-w-10 justify-center px-3 py-2 text-sm"}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDetailPage((current) => Math.min(detailCalls.totalPages, current + 1))}
                  disabled={detailPage >= detailCalls.totalPages || detailLoading}
                  className="action-outline px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => setDetailPage(detailCalls.totalPages)}
                  disabled={detailPage >= detailCalls.totalPages || detailLoading}
                  className="action-outline px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Last
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="surface-panel overflow-x-auto">
          <div className="p-5 pb-0"><h2 className="text-lg font-semibold">Agent Performance — {reportRangeLabel}</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Answered</th><th className="px-4 py-3">Missed</th><th className="px-4 py-3">Answer Rate</th></tr>
            </thead>
            <tbody>{fullAnalyticsLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Calculating the complete filtered dataset...</td></tr>
            ) : agentData.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No calls for this date</td></tr>
            ) : agentData.map((a) => (
              <tr key={a.name} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3">{a.total}</td>
                <td className="px-4 py-3 text-green-600">{a.answered}</td>
                <td className="px-4 py-3 text-red-500">{a.missed}</td>
                <td className="px-4 py-3">{a.total > 0 ? Math.round((a.answered / a.total) * 100) : 0}%</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div className="surface-panel p-5">
          <h2 className="mb-4 text-lg font-semibold">Call Purpose Breakdown</h2>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            {!fullAnalyticsLoading && purposeData.map((p) => (
              <div key={p.purpose} className="rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-semibold text-accent">{p.calls}</p>
                <p className="text-sm text-muted-foreground">{p.purpose}</p>
              </div>
            ))}
            {fullAnalyticsLoading
              ? <p className="col-span-full py-4 text-center text-muted-foreground">Calculating the complete filtered dataset...</p>
              : purposeData.length === 0 && <p className="col-span-full py-4 text-center text-muted-foreground">No data</p>}
          </div>
        </div>
      </motion.div>

      {historyPhone ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8 backdrop-blur-sm">
          <div className="w-full max-w-6xl rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Customer History</h2>
                <p className="font-mono text-sm font-semibold text-accent">{getCallCustomerUid({ callerId: historyPhone })}</p>
                <p className="text-sm text-muted-foreground">Full historic customer data for {historyPhone}</p>
                {historyBlocked ? (
                  <span className="mt-2 inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                    Blocked number
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canManageBlockedNumbers ? (
                  <button
                    type="button"
                    className={historyBlocked ? "action-outline text-emerald-600 hover:border-emerald-300 hover:text-emerald-700" : "action-outline text-destructive hover:border-destructive/30 hover:text-destructive"}
                    onClick={() => void toggleHistoryBlockedNumber()}
                    disabled={historyLoading || historyBlockSaving}
                  >
                    {historyBlocked ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    {historyBlockSaving ? "Saving..." : historyBlocked ? "Unblock Number" : "Block Number"}
                  </button>
                ) : null}
                <button className="action-outline" onClick={closeCustomerHistory}><X className="h-4 w-4" />Close</button>
              </div>
            </div>
            {historyLoading ? (
              <p className="py-10 text-center text-muted-foreground">Loading customer history...</p>
            ) : !hasCustomerHistoryData ? (
              <p className="py-10 text-center text-muted-foreground">No history found for this customer number.</p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    { label: "Customer", value: historyCustomerName || "—" },
                    { label: "Customer ID", value: historyProfile.customerId || historyProfile.customerUid || getCallCustomerUid({ callerId: historyPhone }) || "—" },
                    { label: "Primary Number", value: historyPhone || "—" },
                    { label: "Mobile 2", value: historyProfile.mob2 || "—" },
                    { label: "Latest Branch", value: historyProfile.branch || "—" },
                    { label: "Call Status", value: historyProfile.latestCallStatus || "—" },
                    { label: "Latest Status", value: historyProfile.latestStatus || "—" },
                    { label: "Form Status", value: historyProfile.latestFormStatus || historyProfile.formStatus || "—" },
                    { label: "Disposition", value: historyProfile.latestDisposition || "—" },
                    { label: "Disposition Category", value: historyProfile.latestDispositionCategory || "—" },
                    { label: "Call Records", value: String(visibleHistoryCalls.length) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-border bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="mt-2 text-sm font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="surface-panel p-4">
                  <h3 className="text-base font-semibold">Latest Saved Customer Details</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "Location", value: historyProfile.location },
                      { label: "District", value: historyProfile.district },
                      { label: "Language", value: historyProfile.language },
                      { label: "Business Type", value: historyProfile.businessType },
                      { label: "Purpose", value: historyProfile.purpose },
                      { label: "Metal Type", value: historyProfile.metalType },
                      { label: "Grams", value: historyProfile.grams },
                      { label: "Release Amount", value: historyProfile.releasingAmount },
                      { label: "Bank Name", value: historyProfile.bankName },
                      { label: "Online Price", value: historyProfile.onlinePrice },
                      { label: "Price Per Gram", value: historyProfile.pricePerGram },
                      { label: "Lead", value: historyProfile.lead },
                      { label: "Advertisement", value: historyProfile.advertisement },
                      { label: "Follow-up At", value: historyProfile.statusFollowUpAt ? `${getCallDisplayDate({ createdAt: historyProfile.statusFollowUpAt, answeredAt: "", ringStartedAt: "", endedAt: "", date: "", time: "" }) || ""} ${getCallDisplayTime({ createdAt: historyProfile.statusFollowUpAt, answeredAt: "", ringStartedAt: "", endedAt: "", date: "", time: "" }) || ""}`.trim() : "" },
                      { label: "Notes", value: historyProfile.notes },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.value || "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Customer Data Billing Records</h3>
                      <p className="text-sm text-muted-foreground">{historyCustomerData.length} billing records matched to this number</p>
                    </div>
                  </div>
                  {historyCustomerData.length === 0 ? (
                    <p className="rounded-xl border border-border px-4 py-6 text-center text-muted-foreground">No Customer Data billing records found.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60 text-left text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Customer</th>
                            <th className="px-3 py-2">Bill ID</th>
                            <th className="px-3 py-2">Bill Date</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Gold Weight</th>
                            <th className="px-3 py-2">Bill Amount</th>
                            <th className="px-3 py-2">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyCustomerData.map((record) => (
                            <tr key={`${record.billId}-${record.date}-${record.time}`} className="border-t border-border">
                              <td className="px-3 py-2">{record.customerName || "—"}</td>
                              <td className="px-3 py-2 font-mono text-xs">{record.billId || "—"}</td>
                              <td className="px-3 py-2">{record.date || "—"} {record.time || ""}</td>
                              <td className="px-3 py-2">{record.status || record.transactionStatus || "—"}</td>
                              <td className="px-3 py-2">{record.grossW || "—"}</td>
                              <td className="px-3 py-2">{record.billAmount ? `₹${record.billAmount.toLocaleString("en-IN")}` : "—"}</td>
                              <td className="px-3 py-2 font-medium text-accent">{record.source || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Saved Intake History</h3>
                      <p className="text-sm text-muted-foreground">{visibleIntakeHistory.length} saved intake records</p>
                    </div>
                  </div>
                  {visibleIntakeHistory.length === 0 ? (
                    <p className="rounded-xl border border-border px-4 py-6 text-center text-muted-foreground">No saved intake records found.</p>
                  ) : renderSavedIntakeHistoryTable(visibleIntakeHistory)}
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Call History</h3>
                      <p className="text-sm text-muted-foreground">{visibleHistoryCalls.length} call records</p>
                    </div>
                  </div>
                  {visibleHistoryCalls.length === 0 ? (
                    <p className="rounded-xl border border-border px-4 py-6 text-center text-muted-foreground">No call records found.</p>
                  ) : renderCustomerHistoryTable(visibleHistoryCalls)}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
