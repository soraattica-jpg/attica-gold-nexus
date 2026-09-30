import type { CallRecord } from "@/data/mockData";
import { getBusinessDateString } from "@/lib/businessDate";
import { getCallDisplayTime } from "@/lib/callDateTime";
import { formatCallDurationForExport } from "@/lib/callDuration";
import { getCallDisplayCustomerName } from "@/lib/callDisplay";
import type { CsvCellValue } from "@/lib/csv";
import { getGramCategory } from "@/lib/gramCategory";

export const REPORT_EXPORT_HEADERS = [
  "Date",
  "Time",
  "Direction",
  "Agent",
  "Customer",
  "Number",
  "Mobile 2",
  "Grams",
  "Gram Category",
  "Branch",
  "Disposition",
  "Disposition Category",
  "Call Source",
  "Duration",
  "Status",
  "Remarks",
  "Recording",
];

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const DISPLAY_DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;
const EXPORT_DATE_PATTERN = /^\d{2}-\d{2}-\d{4}$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;

type ReportExportCall = Pick<
  CallRecord,
  | "date"
  | "time"
  | "createdAt"
  | "answeredAt"
  | "ringStartedAt"
  | "endedAt"
  | "direction"
  | "agentId"
  | "agentName"
  | "callerId"
  | "mob2"
  | "grams"
  | "branch"
  | "callbackStatus"
  | "duration"
  | "talkDurationSeconds"
  | "status"
  | "notes"
  | "hasRecording"
  | "recordingName"
  | "customerName"
  | "callerName"
  | "displayCustomerName"
>;

type BuildReportExportRowsOptions = {
  resolveAgentName: (agentId?: string, agentName?: string) => string;
  getDisposition: (call: CallRecord) => string;
  getDispositionCategory: (call: CallRecord) => string;
  getLeadSource: (call: CallRecord) => string;
};

const parseTimestamp = (value: string | undefined) => {
  const normalized = String(value || "").trim();
  if (!normalized) return Number.NaN;

  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
};

const getCallExportTimestamp = (
  call: Pick<ReportExportCall, "answeredAt" | "ringStartedAt" | "endedAt" | "createdAt">,
) => [
  parseTimestamp(call.answeredAt),
  parseTimestamp(call.ringStartedAt),
  parseTimestamp(call.endedAt),
  parseTimestamp(call.createdAt),
].find((timestamp) => Number.isFinite(timestamp)) ?? Number.NaN;

export const getReportExportDateKey = (
  call: Pick<ReportExportCall, "date" | "createdAt" | "answeredAt" | "ringStartedAt" | "endedAt">,
) => {
  const directDate = String(call.date || "").trim();
  const dateKeyMatch = directDate.match(DATE_KEY_PATTERN);
  if (dateKeyMatch) {
    return `${dateKeyMatch[1]}-${dateKeyMatch[2]}-${dateKeyMatch[3]}`;
  }

  const displayDateMatch = directDate.match(DISPLAY_DATE_PATTERN);
  if (displayDateMatch) {
    return `${displayDateMatch[3]}-${displayDateMatch[2]}-${displayDateMatch[1]}`;
  }

  const timestamp = getCallExportTimestamp(call);
  return Number.isFinite(timestamp) ? getBusinessDateString(new Date(timestamp)) : "";
};

export const formatReportExportDate = (
  call: Pick<ReportExportCall, "date" | "createdAt" | "answeredAt" | "ringStartedAt" | "endedAt">,
) => {
  const dateKey = getReportExportDateKey(call);
  const matched = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return matched ? `${matched[3]}-${matched[2]}-${matched[1]}` : "";
};

export const formatReportExportTime = (
  call: Pick<ReportExportCall, "time" | "createdAt" | "answeredAt" | "ringStartedAt" | "endedAt">,
) => {
  const timestamp = getCallExportTimestamp(call);
  if (Number.isFinite(timestamp)) {
    return getCallDisplayTime(call);
  }

  const time = String(call.time || "").trim();
  const matched = time.match(TIME_PATTERN);
  return matched
    ? `${matched[1].padStart(2, "0")}:${matched[2]}:${matched[3] || "00"}`
    : "";
};

export const isReportCallWithinDateRange = (call: CallRecord, fromDate: string, toDate: string) => {
  const dateKey = getReportExportDateKey(call);
  return Boolean(dateKey && dateKey >= fromDate && dateKey <= toDate);
};

export function buildReportExportRows(calls: CallRecord[], options: BuildReportExportRowsOptions): CsvCellValue[][] {
  return calls.map((call) => [
    formatReportExportDate(call),
    formatReportExportTime(call),
    call.direction || "",
    options.resolveAgentName(call.agentId, call.agentName),
    getCallDisplayCustomerName(call),
    call.callerId || "",
    call.mob2 || "",
    call.grams || "",
    getGramCategory(call.grams),
    call.branch || "",
    options.getDisposition(call),
    options.getDispositionCategory(call),
    options.getLeadSource(call),
    formatCallDurationForExport(call.duration, call.talkDurationSeconds),
    call.status || "",
    call.notes || "",
    call.hasRecording ? (call.recordingName || "Available") : "",
  ]);
}

export function validateReportExportRows(headers: string[], rows: CsvCellValue[][]) {
  const invalidRows = rows
    .map((row, index) => ({
      index,
      row,
      date: String(row[0] ?? "").trim(),
      columnCount: row.length,
    }))
    .filter((entry) => entry.columnCount !== headers.length || !EXPORT_DATE_PATTERN.test(entry.date));

  return {
    valid: invalidRows.length === 0,
    invalidRows,
  };
}
