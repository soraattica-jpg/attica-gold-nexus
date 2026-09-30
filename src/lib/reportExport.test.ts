import { describe, expect, it } from "vitest";

import type { CallRecord } from "@/data/mockData";
import {
  REPORT_EXPORT_HEADERS,
  buildReportExportRows,
  formatReportExportDate,
  formatReportExportTime,
  getReportExportDateKey,
  isReportCallWithinDateRange,
  validateReportExportRows,
} from "@/lib/reportExport";

const buildCall = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  id: "CALL-1",
  callerId: "9999999999",
  callerName: "Customer",
  customerName: "Customer",
  displayCustomerName: "Customer",
  agentId: "AG001",
  agentName: "Agent 1",
  direction: "outgoing",
  status: "completed",
  duration: "00:30",
  time: "10:00:00",
  date: "2026-06-10",
  language: "",
  hasRecording: true,
  recordingName: "rec-1.wav",
  ringStartedAt: "2026-06-10T10:00:00.000Z",
  answeredAt: "2026-06-10T10:00:05.000Z",
  endedAt: "2026-06-10T10:00:35.000Z",
  talkDurationSeconds: 30,
  branch: "Bangalore",
  place: "",
  purpose: "",
  callbackStatus: "Completed",
  dispositionCategory: "Connected",
  followUpFlag: false,
  leadSource: "Auto Dial",
  notes: "",
  createdAt: "2026-06-10T10:00:00.000Z",
  ...overrides,
});

const rowOptions = {
  resolveAgentName: (_agentId?: string, agentName?: string) => agentName || "",
  getDisposition: (call: CallRecord) => call.callbackStatus || "",
  getDispositionCategory: (call: CallRecord) => call.dispositionCategory || "",
  getLeadSource: (call: CallRecord) => call.leadSource || "",
};

describe("reportExport", () => {
  it("formats export dates as DD-MM-YYYY from valid date fields", () => {
    const call = buildCall({ date: "2026-06-10" });

    expect(getReportExportDateKey(call)).toBe("2026-06-10");
    expect(formatReportExportDate(call)).toBe("10-06-2026");
    expect(formatReportExportTime(call)).toBe("15:30:05");
    expect(isReportCallWithinDateRange(call, "2026-06-10", "2026-06-10")).toBe(true);
  });

  it("keeps auto-dial notes in Remarks and never in Date", () => {
    const remarks = "Auto-synced missed callback status from auto-dial lead, needs retry\npipe | retained";
    const rows = buildReportExportRows([
      buildCall({
        date: "k status from auto-dial lead | Auto-synced missed callback status from auto-dial lead",
        time: "d callback status from auto-dial lead | Auto-synced missed callback status",
        notes: remarks,
        grams: "15",
        createdAt: "2026-06-11T11:42:10.000Z",
        answeredAt: "",
        ringStartedAt: "",
        endedAt: "",
      }),
    ], rowOptions);

    expect(rows[0]).toHaveLength(REPORT_EXPORT_HEADERS.length);
    expect(rows[0]?.[0]).toBe("11-06-2026");
    expect(rows[0]?.[1]).toBe("17:12:10");
    expect(rows[0]?.[7]).toBe("15");
    expect(rows[0]?.[8]).toBe("PLATINUM");
    expect(rows[0]?.[15]).toBe(remarks);
    expect(validateReportExportRows(REPORT_EXPORT_HEADERS, rows).valid).toBe(true);
  });

  it("blocks rows when no real date can be derived", () => {
    const rows = buildReportExportRows([
      buildCall({
        date: "Auto-synced missed callback status from auto-dial lead",
        time: "not a time",
        createdAt: "",
        answeredAt: "",
        ringStartedAt: "",
        endedAt: "",
      }),
    ], rowOptions);

    const validation = validateReportExportRows(REPORT_EXPORT_HEADERS, rows);

    expect(rows[0]?.[0]).toBe("");
    expect(validation.valid).toBe(false);
    expect(validation.invalidRows[0]?.columnCount).toBe(REPORT_EXPORT_HEADERS.length);
  });

  it("uses the timestamp in IST when the legacy time field contains UTC", () => {
    const call = buildCall({
      time: "06:00:56",
      ringStartedAt: "2026-09-01T06:00:55.000Z",
      answeredAt: "2026-09-01T06:00:56.000Z",
      endedAt: "2026-09-01T06:04:05.000Z",
      createdAt: "2026-09-01T06:00:56.000Z",
    });

    expect(formatReportExportTime(call)).toBe("11:30:56");
  });
});
