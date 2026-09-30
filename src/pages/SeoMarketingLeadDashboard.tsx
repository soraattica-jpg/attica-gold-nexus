import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Download, Eye, RefreshCw, Search, X } from "lucide-react";
import TablePagination from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";
import { api, type GoogleMarketingIntegrationStatus, type SeoMarketingAggregateRow, type SeoMarketingLeadDashboardQuery, type SeoMarketingLeadDashboardResponse, type SeoMarketingLeadRow, type SeoMarketingSpendResponse, type SeoMarketingSpendRow } from "@/lib/api";
import { isAdminRole } from "@/lib/roles";
import { hidePhoneDisplay } from "@/lib/phone";

type DashboardTab = "overview" | "source" | "campaign" | "keyword" | "website" | "journey" | "bills";
type DrillMetric = "leads" | "unique" | "contacted" | "connected" | "followups" | "ql" | "lost" | "bills" | "leadToBillRate" | "spend" | "costPerBill";
type LeadToBillView = "billed" | "unique-leads";
type DatePreset = "today" | "yesterday" | "today-yesterday" | "last-7-days" | "last-14-days" | "last-28-days" | "last-30-days" | "this-week" | "last-week" | "this-month" | "last-month" | "maximum" | "custom";
type ComparisonMode = "previous-period" | "previous-month" | "previous-year" | "custom";

interface DrillDownState {
  title: string;
  metric?: DrillMetric;
  view?: LeadToBillView;
  filters?: Partial<SeoMarketingLeadDashboardQuery>;
  note?: string;
}

const SOURCE_OPTIONS = [
  "all",
  "Meta Ads",
  "Google Ads",
  "Google Organic",
  "Website Direct",
  "Blog",
  "Justdial",
  "WhatsApp Ads",
  "Referral",
  "Manual",
  "Other",
];

const PLATFORM_OPTIONS = ["all", "Meta", "Google", "Website", "Justdial", "WhatsApp", "Other"];

const METRIC_OPTIONS: Array<{ value: "" | DrillMetric; label: string }> = [
  { value: "", label: "Select Metric" },
  { value: "leads", label: "Leads" },
  { value: "unique", label: "Unique Leads" },
  { value: "contacted", label: "Contacted" },
  { value: "connected", label: "Connected" },
  { value: "followups", label: "Follow-Ups" },
  { value: "ql", label: "Qualified Leads" },
  { value: "lost", label: "Lost Leads" },
  { value: "bills", label: "Lead Bills" },
  { value: "leadToBillRate", label: "Lead-to-Bill Rate" },
  { value: "spend", label: "Campaign Spend" },
  { value: "costPerBill", label: "Cost per Bill" },
];

function normalizeMetricValue(value: string | null): "" | DrillMetric {
  const metric = String(value || "").trim();
  if (metric === "campaignSpend") return "spend";
  return METRIC_OPTIONS.some((option) => option.value === metric) ? metric as DrillMetric : "";
}

function normalizeLeadToBillView(value: string | null): LeadToBillView {
  return value === "unique-leads" ? "unique-leads" : "billed";
}

function getMetricLabel(value: "" | DrillMetric) {
  return METRIC_OPTIONS.find((option) => option.value === value)?.label || "Marketing Drill-Down";
}

function normalizeDashboardTab(value: string | null): DashboardTab | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "campaign-performance") return "campaign";
  if (normalized === "source-funnel") return "source";
  if (normalized === "keyword-search-term") return "keyword";
  if (normalized === "website-blog") return "website";
  if (normalized === "lead-journey") return "journey";
  if (normalized === "billing-conversion") return "bills";
  return ["overview", "source", "campaign", "keyword", "website", "journey", "bills"].includes(normalized)
    ? normalized as DashboardTab
    : null;
}

function getTabUrlValue(tab: DashboardTab) {
  if (tab === "campaign") return "campaign-performance";
  if (tab === "source") return "source-funnel";
  if (tab === "keyword") return "keyword-search-term";
  if (tab === "website") return "website-blog";
  if (tab === "journey") return "lead-journey";
  if (tab === "bills") return "billing-conversion";
  return tab;
}

function getTodayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function addIstDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00+05:30`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function startOfIstWeek(date: string) {
  const value = new Date(`${date}T12:00:00+05:30`);
  return addIstDays(date, 1 - (value.getUTCDay() || 7));
}

function startOfIstMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function previousIstMonth(date: string) {
  const value = new Date(`${date.slice(0, 7)}-15T12:00:00+05:30`);
  value.setUTCMonth(value.getUTCMonth() - 1);
  return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
}

function endOfIstMonth(month: string) {
  const value = new Date(`${month}-01T12:00:00+05:30`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCDate(0);
  return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function getDateRangeForPreset(preset: DatePreset, today: string) {
  if (preset === "today") return { startDate: today, endDate: today };
  if (preset === "yesterday") return { startDate: addIstDays(today, -1), endDate: addIstDays(today, -1) };
  if (preset === "today-yesterday") return { startDate: addIstDays(today, -1), endDate: today };
  if (preset === "last-7-days") return { startDate: addIstDays(today, -6), endDate: today };
  if (preset === "last-14-days") return { startDate: addIstDays(today, -13), endDate: today };
  if (preset === "last-28-days") return { startDate: addIstDays(today, -27), endDate: today };
  if (preset === "last-30-days") return { startDate: addIstDays(today, -29), endDate: today };
  if (preset === "this-week") return { startDate: startOfIstWeek(today), endDate: today };
  if (preset === "last-week") {
    const lastWeekEnd = addIstDays(startOfIstWeek(today), -1);
    return { startDate: startOfIstWeek(lastWeekEnd), endDate: lastWeekEnd };
  }
  if (preset === "this-month") return { startDate: startOfIstMonth(today), endDate: today };
  if (preset === "last-month") {
    const month = previousIstMonth(today);
    return { startDate: `${month}-01`, endDate: endOfIstMonth(month) };
  }
  if (preset === "maximum") return { startDate: "2000-01-01", endDate: today };
  return { startDate: today, endDate: today };
}

function getComparisonRange(startDate: string, endDate: string, mode: ComparisonMode, customStartDate: string, customEndDate: string) {
  if (mode === "custom") return { startDate: customStartDate, endDate: customEndDate };
  if (mode === "previous-year") return { startDate: addIstDays(startDate, -365), endDate: addIstDays(endDate, -365) };
  if (mode === "previous-month") {
    const month = previousIstMonth(startDate);
    const lastDay = Number(endOfIstMonth(month).slice(-2));
    const startDay = Math.min(Number(startDate.slice(-2)), lastDay);
    const endDay = Math.min(Number(endDate.slice(-2)), lastDay);
    return {
      startDate: `${month}-${String(startDay).padStart(2, "0")}`,
      endDate: `${month}-${String(endDay).padStart(2, "0")}`,
    };
  }
  const days = Math.max(1, Math.round((new Date(`${endDate}T12:00:00+05:30`).getTime() - new Date(`${startDate}T12:00:00+05:30`).getTime()) / 86400000) + 1);
  return { startDate: addIstDays(startDate, -days), endDate: addIstDays(startDate, -1) };
}

function getPercentChange(current: number | undefined, previous: number | undefined) {
  const before = Number(previous) || 0;
  if (before <= 0) return null;
  return Number(((((Number(current) || 0) - before) / before) * 100).toFixed(1));
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat("en-IN").format(Math.max(0, Number(value) || 0));
}

function formatMoney(value: number | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value) || 0));
}

function formatWeight(value: number | undefined) {
  const weight = Math.max(0, Number(value) || 0);
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(weight)} g`;
}

function getPercent(value: number | undefined) {
  return `${Math.max(0, Number(value) || 0).toFixed(2)}%`;
}

function safeText(value: unknown, fallback = "N/A") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDateTime(value: string) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function maskNumber(value: string, shouldMask: boolean) {
  return shouldMask ? hidePhoneDisplay(value) : safeText(value);
}

function buildRowSourceLabel(row: SeoMarketingLeadRow) {
  const parts = [row.platform, row.source, row.campaignName].filter((part) => part && part !== "N/A");
  return parts.join(" / ") || "N/A";
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  trend,
  selected,
  onClick,
}: {
  label: string;
  value: string | number;
  note?: string;
  trend?: number | null;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title="Click to view details"
      onClick={onClick}
      className={`rounded-lg border bg-card p-4 text-left transition hover:border-accent hover:shadow-md ${selected ? "border-accent shadow-md" : "border-border"}`}
    >
      <p className="truncate text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
      {trend !== null && trend !== undefined ? (
        <p className={`mt-1 text-xs font-medium ${trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-600" : "text-muted-foreground"}`}>
          {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(trend).toFixed(1)}% vs comparison
        </p>
      ) : null}
      {note ? <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p> : null}
    </button>
  );
}

function AggregateTable({
  rows,
  mode,
  onRowClick,
}: {
  rows: SeoMarketingAggregateRow[];
  mode: DashboardTab;
  onRowClick?: (row: SeoMarketingAggregateRow) => void;
}) {
  if (rows.length === 0) return <EmptyState label="No matching aggregate data for this date range." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-muted/60 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{mode === "source" ? "Source" : mode === "website" ? "Landing Page / Blog" : "Campaign / Keyword"}</th>
            <th className="px-3 py-2">Platform</th>
            <th className="px-3 py-2">Campaign</th>
            <th className="px-3 py-2">Ad Set / Ad Group</th>
            <th className="px-3 py-2">Ad / Creative</th>
            <th className="px-3 py-2">Form</th>
            <th className="px-3 py-2 text-right">Spend</th>
            <th className="px-3 py-2 text-right">Clicks</th>
            <th className="px-3 py-2 text-right">Leads</th>
            <th className="px-3 py-2 text-right">Connected</th>
            <th className="px-3 py-2 text-right">QL</th>
            <th className="px-3 py-2 text-right">Lost</th>
            <th className="px-3 py-2 text-right">Bills</th>
            <th className="px-3 py-2 text-right">Bill Amount</th>
            <th className="px-3 py-2 text-right">Billed Weight</th>
            <th className="px-3 py-2 text-right">Conversion %</th>
            <th className="px-3 py-2 text-right">CPL</th>
            <th className="px-3 py-2 text-right">Cost / Bill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="cursor-pointer border-t border-border transition hover:bg-accent/5"
              title="Click to view details"
              onClick={() => onRowClick?.(row)}
            >
              <td className="max-w-[260px] px-3 py-2">
                <p className="truncate font-medium">{safeText(mode === "website" ? row.landingPage || row.blogTitle : row.key)}</p>
                {mode === "keyword" ? (
                  <p className="truncate text-xs text-muted-foreground">Search term: {safeText(row.searchTerm)}</p>
                ) : null}
              </td>
              <td className="px-3 py-2">{safeText(row.platform)}</td>
              <td className="max-w-[220px] px-3 py-2 truncate">{safeText(row.campaignName)}</td>
              <td className="max-w-[180px] px-3 py-2 truncate">{safeText(row.adSetOrAdGroup)}</td>
              <td className="max-w-[180px] px-3 py-2 truncate">{safeText(row.adOrCreative)}</td>
              <td className="max-w-[160px] px-3 py-2 truncate">{safeText(row.form)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.spend)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.clicks)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.leads)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.connected)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.ql)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.lost)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.bills)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.billingAmount)}</td>
              <td className="px-3 py-2 text-right">{formatWeight(row.billingGrossWeight)}</td>
              <td className="px-3 py-2 text-right">{getPercent(row.conversionRate)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.costPerLead)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.costPerBill)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatOptionalMoney(value: number | undefined) {
  const amount = Number(value) || 0;
  return amount > 0 ? formatMoney(amount) : "N/A";
}

function SpendDetailsTable({
  data,
  loading,
  onPageChange,
}: {
  data: SeoMarketingSpendResponse | null;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (loading) {
    return <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">Loading campaign spend...</div>;
  }

  const rows = data?.rows || [];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        N/A - campaign spend rows are not synced for the selected filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Spend Rows</p>
          <p className="mt-1 text-xl font-semibold">{formatNumber(data?.totalRows)}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Displayed Spend</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(rows.reduce((sum, row) => sum + Math.max(0, Number(row.spend) || 0), 0))}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Total Spend</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(data?.totalSpend)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1900px] text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2">Ad Account</th>
              <th className="px-3 py-2">Campaign ID</th>
              <th className="px-3 py-2">Campaign Name</th>
              <th className="px-3 py-2">Ad Set / Ad Group</th>
              <th className="px-3 py-2">Ad / Creative</th>
              <th className="px-3 py-2 text-right">Impressions</th>
              <th className="px-3 py-2 text-right">Clicks</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Unique Leads</th>
              <th className="px-3 py-2 text-right">QL</th>
              <th className="px-3 py-2 text-right">Billed Leads</th>
              <th className="px-3 py-2 text-right">Billing Amount</th>
              <th className="px-3 py-2 text-right">CPL</th>
              <th className="px-3 py-2 text-right">Cost / QL</th>
              <th className="px-3 py-2 text-right">Cost / Bill</th>
              <th className="px-3 py-2 text-right">ROAS</th>
              <th className="px-3 py-2">Last Synced At</th>
              <th className="px-3 py-2">Sync Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: SeoMarketingSpendRow) => (
              <tr key={`${row.platform}-${row.adAccount}-${row.campaignId || row.campaignName}-${row.date}`} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2">{safeText(row.date)}</td>
                <td className="px-3 py-2">{safeText(row.platform)}</td>
                <td className="max-w-[150px] truncate px-3 py-2">{safeText(row.adAccount)}</td>
                <td className="max-w-[150px] truncate px-3 py-2">{safeText(row.campaignId)}</td>
                <td className="max-w-[260px] truncate px-3 py-2 font-medium">{safeText(row.campaignName)}</td>
                <td className="max-w-[180px] truncate px-3 py-2">{safeText(row.adSetOrAdGroup)}</td>
                <td className="max-w-[180px] truncate px-3 py-2">{safeText(row.adOrCreative)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(row.impressions)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(row.clicks)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.spend)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(row.leads)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(row.uniqueLeads)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(row.qualifiedLeads)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(row.billedLeads)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.billingAmount)}</td>
                <td className="px-3 py-2 text-right">{formatOptionalMoney(row.cpl)}</td>
                <td className="px-3 py-2 text-right">{formatOptionalMoney(row.costPerQualifiedLead)}</td>
                <td className="px-3 py-2 text-right">{formatOptionalMoney(row.costPerBill)}</td>
                <td className="px-3 py-2 text-right">{Number(row.roas || 0) > 0 ? `${Number(row.roas).toFixed(2)}x` : "N/A"}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.lastSyncedAt ? formatDateTime(row.lastSyncedAt) : "N/A"}</td>
                <td className="px-3 py-2">{safeText(row.syncStatus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={data?.page || 1}
        totalPages={data?.totalPages || 1}
        totalItems={data?.totalRows || 0}
        pageSize={data?.limit || 50}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function LeadDrillTable({
  rows,
  shouldMaskPhone,
  onOpenLead,
}: {
  rows: SeoMarketingLeadRow[];
  shouldMaskPhone: boolean;
  onOpenLead: (row: SeoMarketingLeadRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[2100px] text-sm">
        <thead className="bg-muted/60 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Lead Date & Time</th>
            <th className="px-3 py-2">Lead ID</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Number</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Platform</th>
            <th className="px-3 py-2">Campaign</th>
            <th className="px-3 py-2">Ad Set / Ad Group</th>
            <th className="px-3 py-2">Ad / Creative</th>
            <th className="px-3 py-2">Keyword / Search Term</th>
            <th className="px-3 py-2">Landing Page</th>
            <th className="px-3 py-2">Assigned Agent</th>
            <th className="px-3 py-2 text-right">Attempts</th>
            <th className="px-3 py-2 text-right">Connected</th>
            <th className="px-3 py-2">Talk Time</th>
            <th className="px-3 py-2">Disposition</th>
            <th className="px-3 py-2">Lead Category</th>
            <th className="px-3 py-2">Current Stage</th>
            <th className="px-3 py-2">Bill Status</th>
            <th className="px-3 py-2">Bill Date</th>
            <th className="px-3 py-2 text-right">Bill Amount</th>
            <th className="px-3 py-2 text-right">Billed Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.leadId}-${row.customerNumber}-${row.leadCreatedAt}`}
              className="cursor-pointer border-t border-border transition hover:bg-accent/5"
              title="Click to view lead journey"
              onClick={() => onOpenLead(row)}
            >
              <td className="whitespace-nowrap px-3 py-2">{row.leadDate} {row.leadTime}</td>
              <td className="max-w-[150px] truncate px-3 py-2 font-mono text-xs">{row.leadId}</td>
              <td className="max-w-[180px] truncate px-3 py-2 font-medium">{safeText(row.customerName)}</td>
              <td className="px-3 py-2 font-mono text-xs">{maskNumber(row.customerNumber, shouldMaskPhone)}</td>
              <td className="max-w-[140px] truncate px-3 py-2">{safeText(row.source)}</td>
              <td className="max-w-[110px] truncate px-3 py-2">{safeText(row.platform)}</td>
              <td className="max-w-[220px] truncate px-3 py-2">{safeText(row.campaignName)}</td>
              <td className="max-w-[180px] truncate px-3 py-2">{safeText(row.adSetOrAdGroupName || row.adSetOrAdGroupId)}</td>
              <td className="max-w-[180px] truncate px-3 py-2">{safeText(row.adName || row.creativeName || row.adId || row.creativeId)}</td>
              <td className="max-w-[220px] truncate px-3 py-2">{safeText(row.keyword !== "N/A" ? row.keyword : row.searchTerm)}</td>
              <td className="max-w-[260px] truncate px-3 py-2">{safeText(row.landingPage || row.blogTitle)}</td>
              <td className="max-w-[170px] truncate px-3 py-2">{safeText(row.assignedAgentName || row.assignedAgentId)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.callAttempts)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(row.connectedCalls)}</td>
              <td className="whitespace-nowrap px-3 py-2">{safeText(row.totalTalkTime, "00:00")}</td>
              <td className="max-w-[200px] truncate px-3 py-2">{safeText(row.disposition || row.businessStage)}</td>
              <td className="px-3 py-2">{safeText(row.businessStage)}</td>
              <td className="px-3 py-2">{safeText(row.currentStage)}</td>
              <td className="px-3 py-2">{safeText(row.billStatus)}</td>
              <td className="px-3 py-2">{safeText(row.billDate)}</td>
              <td className="px-3 py-2 text-right">{formatMoney(row.billAmount)}</td>
              <td className="px-3 py-2 text-right">{formatWeight(row.billingGrossWeight)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-muted-foreground" colSpan={22}>No matching records found for the selected filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function DrillDownDrawer({
  drillDown,
  data,
  loading,
  query,
  shouldMaskPhone,
  onClose,
  onClear,
  onPageChange,
  onExport,
  onOpenLead,
  onLeadToBillViewChange,
}: {
  drillDown: DrillDownState;
  data: SeoMarketingLeadDashboardResponse | null;
  loading: boolean;
  query: SeoMarketingLeadDashboardQuery;
  shouldMaskPhone: boolean;
  onClose: () => void;
  onClear: () => void;
  onPageChange: (page: number) => void;
  onExport: (scope: "current" | "all") => void;
  onOpenLead: (row: SeoMarketingLeadRow) => void;
  onLeadToBillViewChange: (view: LeadToBillView) => void;
}) {
  const summary = data?.summary;
  const isSpendOnly = drillDown.metric === "spend" || drillDown.metric === "costPerBill";
  const isRate = drillDown.metric === "leadToBillRate";
  const leadToBillView = drillDown.view || "billed";
  const leadRecords = formatNumber(summary?.leadsToday);
  const uniqueLeads = formatNumber(summary?.uniqueLeadsToday);
  const billedLeads = formatNumber(summary?.billedLeadsToday);
  const exportLabel = isRate
    ? leadToBillView === "unique-leads" ? "Export Unique Leads" : "Export Billed Leads"
    : "Export Current Data";
  const headerCount = isRate
    ? `${billedLeads} Billed Lead from ${uniqueLeads} Unique Leads · ${leadRecords} generated lead records`
    : `${formatNumber(data?.total)} records`;

  return (
    <div className="fixed inset-0 z-40 bg-black/35" role="dialog" aria-modal="true">
      <div className="absolute right-0 top-0 flex h-full w-full max-w-6xl flex-col border-l border-border bg-background shadow-2xl">
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Drill-Down</p>
              <h2 className="mt-1 text-2xl font-semibold">{drillDown.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {headerCount} · {safeText(query.startDate)} to {safeText(query.endDate)} · {safeText(query.source || "All Sources")} | {safeText(query.platform || "All Platforms")}
              </p>
              {drillDown.note ? <p className="mt-2 text-sm text-muted-foreground">{drillDown.note}</p> : null}
            </div>
            <button className="action-outline px-3 py-2 text-sm" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
              Close
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="action-outline px-3 py-2 text-sm" type="button" onClick={onClear}>Clear Drill-Down</button>
            <button className="action-outline px-3 py-2 text-sm" type="button" onClick={() => onExport("current")}>
              <Download className="h-4 w-4" />
              Export Current Page
            </button>
            <button className="action-gold px-3 py-2 text-sm" type="button" onClick={() => onExport("all")}>
              <Download className="h-4 w-4" />
              {isRate ? exportLabel : "Export All Matching"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {isRate ? (
            <div className="mb-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Generated Lead Records</p>
                  <p className="mt-1 text-xl font-semibold">{leadRecords}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Unique Leads Used</p>
                  <p className="mt-1 text-xl font-semibold">{uniqueLeads}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Billed Leads Used</p>
                  <p className="mt-1 text-xl font-semibold">{billedLeads}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Formula</p>
                  <p className="mt-1 text-xl font-semibold">{getPercent(summary?.leadToBillConversionRate)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={leadToBillView === "billed" ? "action-gold px-3 py-2 text-sm" : "action-outline px-3 py-2 text-sm"}
                  type="button"
                  onClick={() => onLeadToBillViewChange("billed")}
                >
                  Billed Leads Used - {billedLeads}
                </button>
                <button
                  className={leadToBillView === "unique-leads" ? "action-gold px-3 py-2 text-sm" : "action-outline px-3 py-2 text-sm"}
                  type="button"
                  onClick={() => onLeadToBillViewChange("unique-leads")}
                >
                  Unique Leads Used - {uniqueLeads}
                </button>
              </div>
            </div>
          ) : null}

          {isSpendOnly ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              N/A — Sync Pending. Campaign spend data is not synced yet.
            </div>
          ) : loading ? (
            <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">Loading matching leads...</div>
          ) : (
            <LeadDrillTable rows={data?.rows || []} shouldMaskPhone={shouldMaskPhone} onOpenLead={onOpenLead} />
          )}
        </div>

        {!isSpendOnly ? (
          <TablePagination
            page={data?.page || 1}
            totalPages={data?.totalPages || 1}
            totalItems={data?.total || 0}
            pageSize={data?.limit || 50}
            onPageChange={onPageChange}
          />
        ) : null}
      </div>
    </div>
  );
}
export default function SeoMarketingLeadDashboard() {
  const { user } = useAuth();
  const today = useMemo(() => getTodayIst(), []);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("previous-period");
  const [customCompareStartDate, setCustomCompareStartDate] = useState(addIstDays(today, -1));
  const [customCompareEndDate, setCustomCompareEndDate] = useState(addIstDays(today, -1));
  const [source, setSource] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [campaign, setCampaign] = useState("");
  const [keyword, setKeyword] = useState("");
  const [landingPage, setLandingPage] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedLead, setSelectedLead] = useState<SeoMarketingLeadRow | null>(null);
  const [data, setData] = useState<SeoMarketingLeadDashboardResponse | null>(null);
  const [comparisonData, setComparisonData] = useState<SeoMarketingLeadDashboardResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [drillPage, setDrillPage] = useState(1);
  const [drillData, setDrillData] = useState<SeoMarketingLeadDashboardResponse | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<"" | DrillMetric>("");
  const [spendPage, setSpendPage] = useState(1);
  const [spendData, setSpendData] = useState<SeoMarketingSpendResponse | null>(null);
  const [spendLoading, setSpendLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleMarketingIntegrationStatus | null>(null);
  const [googleStatusLoading, setGoogleStatusLoading] = useState(false);
  const mainRequestId = useRef(0);
  const comparisonRequestId = useRef(0);
  const drillRequestId = useRef(0);
  const spendRequestId = useRef(0);
  const shouldMaskPhone = !isAdminRole(user?.role);
  const isMasterAdmin = user?.role === "superadmin";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlStartDate = params.get("startDate");
    const urlEndDate = params.get("endDate");
    const urlSource = params.get("source");
    const urlPlatform = params.get("platform");
    const urlCampaign = params.get("campaign");
    const urlKeyword = params.get("keyword");
    const urlLandingPage = params.get("landingPage");
    const urlMetric = normalizeMetricValue(params.get("metric"));
    const urlView = normalizeLeadToBillView(params.get("view"));
    const urlTab = normalizeDashboardTab(params.get("tab"));
    if (urlStartDate) { setStartDate(urlStartDate); setDatePreset("custom"); }
    if (urlEndDate) { setEndDate(urlEndDate); setDatePreset("custom"); }
    if (urlSource) setSource(urlSource);
    if (urlPlatform) setPlatform(urlPlatform);
    if (urlCampaign) setCampaign(urlCampaign);
    if (urlKeyword) setKeyword(urlKeyword);
    if (urlLandingPage) setLandingPage(urlLandingPage);
    if (urlTab) setActiveTab(urlTab);
    if (urlMetric) {
      setSelectedMetric(urlMetric);
      if (urlMetric === "spend" || urlMetric === "costPerBill") {
        setActiveTab("campaign");
      } else {
        setDrillDown({
          title: params.get("drillTitle") || getMetricLabel(urlMetric),
          metric: urlMetric,
          view: urlMetric === "leadToBillRate" ? urlView : undefined,
          filters: {
            source: urlSource || "",
            platform: urlPlatform || "",
            campaign: urlCampaign || "",
            keyword: urlKeyword || "",
            landingPage: urlLandingPage || "",
          },
        });
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo<SeoMarketingLeadDashboardQuery>(() => ({
    role: user?.role || "",
    startDate,
    endDate,
    source: source === "all" ? "" : source,
    platform: platform === "all" ? "" : platform,
    campaign,
    keyword,
    landingPage,
    search,
    page,
    limit: 50,
    refresh: refreshToken || undefined,
  }), [campaign, endDate, keyword, landingPage, page, platform, refreshToken, search, source, startDate, user?.role]);

  const comparisonRange = useMemo(
    () => getComparisonRange(startDate, endDate, comparisonMode, customCompareStartDate, customCompareEndDate),
    [comparisonMode, customCompareEndDate, customCompareStartDate, endDate, startDate],
  );

  const comparisonQuery = useMemo<SeoMarketingLeadDashboardQuery | null>(() => {
    if (!compareEnabled || !comparisonRange.startDate || !comparisonRange.endDate) return null;
    return {
      role: user?.role || "",
      startDate: comparisonRange.startDate,
      endDate: comparisonRange.endDate,
      source: source === "all" ? "" : source,
      platform: platform === "all" ? "" : platform,
      campaign,
      keyword,
      landingPage,
      search,
      page: 1,
      limit: 50,
      refresh: refreshToken || undefined,
    };
  }, [campaign, comparisonRange.endDate, comparisonRange.startDate, compareEnabled, keyword, landingPage, platform, refreshToken, search, source, user?.role]);

  const baseDrillQuery = useMemo<SeoMarketingLeadDashboardQuery>(() => ({
    role: user?.role || "",
    startDate,
    endDate,
    source: source === "all" ? "" : source,
    platform: platform === "all" ? "" : platform,
    campaign,
    keyword,
    landingPage,
    search,
    limit: 50,
    refresh: refreshToken || undefined,
  }), [campaign, endDate, keyword, landingPage, platform, refreshToken, search, source, startDate, user?.role]);

  const drillQuery = useMemo<SeoMarketingLeadDashboardQuery | null>(() => {
    if (!drillDown) return null;
    return {
      ...baseDrillQuery,
      ...(drillDown.filters || {}),
      metric: drillDown.metric,
      view: drillDown.metric === "leadToBillRate" ? drillDown.view || "billed" : undefined,
      page: drillPage,
      limit: 50,
    };
  }, [baseDrillQuery, drillDown, drillPage]);

  const spendQuery = useMemo<SeoMarketingLeadDashboardQuery>(() => ({
    ...baseDrillQuery,
    metric: selectedMetric || "spend",
    page: spendPage,
    limit: 50,
  }), [baseDrillQuery, selectedMetric, spendPage]);

  const loadData = useCallback(async () => {
    const requestId = ++mainRequestId.current;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const result = await api.getSeoMarketingLeadDashboard(query);
      if (requestId !== mainRequestId.current) return;
      if (!result.ok) {
        setError(result.data.error || "SEO & Marketing dashboard could not load.");
      }
      setData(result.data);
    } catch {
      if (requestId === mainRequestId.current) {
        setError("SEO & Marketing dashboard could not load. Please retry.");
      }
    } finally {
      if (requestId === mainRequestId.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadComparisonData = useCallback(async () => {
    const requestId = ++comparisonRequestId.current;
    if (!comparisonQuery) {
      setComparisonData(null);
      setComparisonLoading(false);
      return;
    }
    setComparisonLoading(true);
    setComparisonData(null);
    try {
      const result = await api.getSeoMarketingLeadDashboard(comparisonQuery);
      if (requestId === comparisonRequestId.current) setComparisonData(result.data);
    } finally {
      if (requestId === comparisonRequestId.current) setComparisonLoading(false);
    }
  }, [comparisonQuery]);

  useEffect(() => {
    void loadComparisonData();
  }, [loadComparisonData]);

  const loadDrillData = useCallback(async () => {
    const requestId = ++drillRequestId.current;
    if (!drillQuery) {
      setDrillData(null);
      setDrillLoading(false);
      return;
    }
    if (drillQuery.metric === "spend" || drillQuery.metric === "costPerBill") {
      setDrillData(null);
      setDrillLoading(false);
      return;
    }
    setDrillLoading(true);
    setDrillData(null);
    try {
      const result = await api.getSeoMarketingLeadDashboard(drillQuery);
      if (requestId === drillRequestId.current) setDrillData(result.data);
    } finally {
      if (requestId === drillRequestId.current) setDrillLoading(false);
    }
  }, [drillQuery]);

  useEffect(() => {
    void loadDrillData();
  }, [loadDrillData]);

  const loadSpendData = useCallback(async () => {
    const requestId = ++spendRequestId.current;
    if (activeTab !== "campaign" || (selectedMetric !== "spend" && selectedMetric !== "costPerBill")) {
      setSpendData(null);
      setSpendLoading(false);
      return;
    }
    setSpendLoading(true);
    setSpendData(null);
    try {
      const result = await api.getSeoMarketingSpendDetails(spendQuery);
      if (requestId === spendRequestId.current) setSpendData(result.data);
    } finally {
      if (requestId === spendRequestId.current) setSpendLoading(false);
    }
  }, [activeTab, selectedMetric, spendQuery]);

  useEffect(() => {
    void loadSpendData();
  }, [loadSpendData]);

  useEffect(() => {
    setDrillPage(1);
    setSpendPage(1);
  }, [campaign, endDate, keyword, landingPage, platform, search, source, startDate]);

  const loadGoogleStatus = useCallback(async (verify = false) => {
    if (!isMasterAdmin) return;
    setGoogleStatusLoading(true);
    try {
      const status = await api.getGoogleMarketingIntegrationStatus(user?.role, { verify });
      setGoogleStatus(status);
    } finally {
      setGoogleStatusLoading(false);
    }
  }, [isMasterAdmin, user?.role]);

  useEffect(() => {
    void loadGoogleStatus(false);
  }, [loadGoogleStatus]);

  const summary = data?.summary;
  const comparisonSummary = comparisonData?.summary;
  const rows = data?.rows || [];
  const billRows = data?.billConversionHistory || [];

  const sourceDistribution = useMemo(() => {
    const rows = data?.sourceFunnel || [];
    const max = Math.max(1, ...rows.map((row) => row.leads));
    return rows.slice(0, 8).map((row) => ({
      ...row,
      width: `${Math.max(6, (row.leads / max) * 100)}%`,
    }));
  }, [data?.sourceFunnel]);

  const handleExport = (scope: "current" | "all" = "all") => {
    const exportQuery = { ...query, exportScope: scope };
    if (activeTab === "campaign" && (selectedMetric === "spend" || selectedMetric === "costPerBill")) {
      window.open(api.getSeoMarketingSpendExportUrl({ ...spendQuery, exportScope: scope }), "_blank", "noopener,noreferrer");
      return;
    }
    window.open(api.getSeoMarketingLeadDashboardExportUrl(exportQuery), "_blank", "noopener,noreferrer");
  };

  const refreshDashboard = useCallback(() => {
    setRefreshToken(Date.now());
  }, []);

  const writeDrillUrl = useCallback((next: DrillDownState | null) => {
    const params = new URLSearchParams();
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    params.set("tab", next ? getTabUrlValue(activeTab) : getTabUrlValue(activeTab));
    if (source !== "all") params.set("source", source);
    if (platform !== "all") params.set("platform", platform);
    if (campaign) params.set("campaign", campaign);
    if (keyword) params.set("keyword", keyword);
    if (landingPage) params.set("landingPage", landingPage);
    if (next) {
      if (next.metric) params.set("metric", next.metric);
      if (next.metric === "leadToBillRate") params.set("view", next.view || "billed");
      if (next.title) params.set("drillTitle", next.title);
      Object.entries(next.filters || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, String(value));
      });
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [activeTab, campaign, endDate, keyword, landingPage, platform, source, startDate]);

  const writeCampaignMetricUrl = useCallback((metric: DrillMetric) => {
    const params = new URLSearchParams();
    params.set("tab", "campaign-performance");
    params.set("metric", metric);
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    params.set("page", "1");
    params.set("limit", "50");
    if (source !== "all") params.set("source", source);
    if (platform !== "all") params.set("platform", platform);
    if (campaign) params.set("campaign", campaign);
    if (keyword) params.set("keyword", keyword);
    if (landingPage) params.set("landingPage", landingPage);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [campaign, endDate, keyword, landingPage, platform, source, startDate]);

  const openDrillDown = useCallback((next: DrillDownState) => {
    setDrillPage(1);
    setDrillData(null);
    setSelectedMetric(next.metric || "");
    setDrillDown(next);
    writeDrillUrl(next);
  }, [writeDrillUrl]);

  const closeDrillDown = useCallback(() => {
    setDrillDown(null);
    setDrillData(null);
    setDrillPage(1);
    setSelectedMetric("");
    writeDrillUrl(null);
  }, [writeDrillUrl]);

  const openCampaignMetric = useCallback((metric: Extract<DrillMetric, "spend" | "costPerBill">) => {
    setActiveTab("campaign");
    setSelectedMetric(metric);
    setDrillDown(null);
    setDrillData(null);
    setDrillPage(1);
    setSpendPage(1);
    setSpendData(null);
    writeCampaignMetricUrl(metric);
  }, [writeCampaignMetricUrl]);

  const handleMetricChange = useCallback((metric: "" | DrillMetric) => {
    setSelectedMetric(metric);
    setPage(1);
    if (!metric) {
      closeDrillDown();
      return;
    }
    if (metric === "spend" || metric === "costPerBill") {
      openCampaignMetric(metric);
      return;
    }
    openDrillDown({
      title: getMetricLabel(metric),
      metric,
      view: metric === "leadToBillRate" ? "billed" : undefined,
      note: metric === "leadToBillRate"
        ? "Lead-to-Bill Rate = unique billed leads divided by unique generated leads for the selected filters."
        : undefined,
    });
  }, [closeDrillDown, openCampaignMetric, openDrillDown]);

  const handleLeadToBillViewChange = useCallback((view: LeadToBillView) => {
    if (!drillDown || drillDown.metric !== "leadToBillRate") return;
    const next = { ...drillDown, view };
    setDrillPage(1);
    setDrillData(null);
    setDrillDown(next);
    writeDrillUrl(next);
  }, [drillDown, writeDrillUrl]);

  const handleDrillExport = useCallback((scope: "current" | "all") => {
    if (!drillQuery) return;
    window.open(api.getSeoMarketingLeadDashboardExportUrl({ ...drillQuery, exportScope: scope }), "_blank", "noopener,noreferrer");
  }, [drillQuery]);

  const openAggregateDrill = useCallback((row: SeoMarketingAggregateRow, mode: DashboardTab) => {
    const filters: Partial<SeoMarketingLeadDashboardQuery> = {};
    let title = safeText(row.key);
    if (mode === "source") {
      filters.source = row.source || row.key;
      title = `${safeText(row.source || row.key)} Leads`;
    } else if (mode === "campaign") {
      filters.campaign = row.campaignName && row.campaignName !== "N/A" ? row.campaignName : row.key;
      title = `${safeText(row.campaignName || row.key)} Campaign`;
    } else if (mode === "keyword") {
      if (row.keyword && row.keyword !== "N/A") filters.keyword = row.keyword;
      if (row.searchTerm && row.searchTerm !== "N/A") filters.searchTerm = row.searchTerm;
      title = `${safeText(row.keyword !== "N/A" ? row.keyword : row.searchTerm)} Keyword`;
    } else if (mode === "website") {
      filters.landingPage = row.landingPage || row.blogTitle || row.key;
      title = `${safeText(row.landingPage || row.blogTitle || row.key)} Leads`;
    }
    openDrillDown({ title, metric: "leads", filters });
  }, [openDrillDown]);

  const metricCards: Array<{ label: string; value: string; metric: DrillMetric; note?: string; trend?: number | null }> = [
    { label: "Leads", value: formatNumber(summary?.leadsToday), metric: "leads", trend: getPercentChange(summary?.leadsToday, comparisonSummary?.leadsToday) },
    { label: "Unique Leads", value: formatNumber(summary?.uniqueLeadsToday), metric: "unique", note: "One row per customer number", trend: getPercentChange(summary?.uniqueLeadsToday, comparisonSummary?.uniqueLeadsToday) },
    { label: "Contacted", value: formatNumber(summary?.contactedToday), metric: "contacted", note: "Call attempts made", trend: getPercentChange(summary?.contactedToday, comparisonSummary?.contactedToday) },
    { label: "Connected", value: formatNumber(summary?.connectedToday), metric: "connected", trend: getPercentChange(summary?.connectedToday, comparisonSummary?.connectedToday) },
    { label: "Follow-Ups", value: formatNumber(summary?.followUpsToday), metric: "followups", trend: getPercentChange(summary?.followUpsToday, comparisonSummary?.followUpsToday) },
    { label: "Qualified Leads", value: formatNumber(summary?.qualifiedLeadsToday), metric: "ql", trend: getPercentChange(summary?.qualifiedLeadsToday, comparisonSummary?.qualifiedLeadsToday) },
    { label: "Lost Leads", value: formatNumber(summary?.lostLeadsToday), metric: "lost", trend: getPercentChange(summary?.lostLeadsToday, comparisonSummary?.lostLeadsToday) },
    { label: "Lead Bills", value: formatNumber(summary?.billsToday), metric: "bills", note: "Bills linked to generated leads", trend: getPercentChange(summary?.billsToday, comparisonSummary?.billsToday) },
    {
      label: "Lead-to-Bill Rate",
      value: getPercent(summary?.leadToBillConversionRate),
      metric: "leadToBillRate",
      note: `${formatNumber(summary?.billedLeadsToday)} billed leads / ${formatNumber(summary?.uniqueLeadsToday)} unique leads`,
      trend: getPercentChange(summary?.leadToBillConversionRate, comparisonSummary?.leadToBillConversionRate),
    },
    { label: "Lead Billing Amount", value: formatMoney(summary?.totalBillingAmountToday), metric: "bills", note: "Linked bill amount", trend: getPercentChange(summary?.totalBillingAmountToday, comparisonSummary?.totalBillingAmountToday) },
    { label: "Lead Gold Weight", value: formatWeight(summary?.totalBillingGrossWeightToday), metric: "bills", note: "Linked bill weight", trend: getPercentChange(summary?.totalBillingGrossWeightToday, comparisonSummary?.totalBillingGrossWeightToday) },
    { label: "Campaign Spend", value: formatMoney(summary?.campaignSpendToday), metric: "spend", note: "Google Ads synced", trend: getPercentChange(summary?.campaignSpendToday, comparisonSummary?.campaignSpendToday) },
    { label: "Cost per Bill", value: summary?.costPerBill ? formatMoney(summary.costPerBill) : "N/A", metric: "costPerBill", note: summary?.costPerBill ? "Spend divided by bills" : "No billed leads in range", trend: getPercentChange(summary?.costPerBill, comparisonSummary?.costPerBill) },
  ];

  const tabs: Array<{ id: DashboardTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "source", label: "Source Funnel" },
    { id: "campaign", label: "Campaign Performance" },
    { id: "keyword", label: "Keyword & Search Term" },
    { id: "website", label: "Website & Blog" },
    { id: "journey", label: "Lead Journey" },
    { id: "bills", label: "Bill Conversion History" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Marketing Attribution</p>
          <h1 className="text-3xl font-semibold tracking-tight">SEO & Marketing Lead Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lead source, dialer journey, disposition, and billing conversion attribution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="action-outline" type="button" onClick={refreshDashboard} disabled={loading || comparisonLoading}>
            <RefreshCw className="h-4 w-4" />
            {loading || comparisonLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="action-outline" type="button" onClick={() => handleExport("current")}>
            <Download className="h-4 w-4" />
            Export Current Page
          </button>
          <button className="action-gold" type="button" onClick={() => handleExport("all")}>
            <Download className="h-4 w-4" />
            Export All Matching
          </button>
        </div>
      </div>

      <div className="surface-panel sticky top-2 z-20 p-4 shadow-sm">
        <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Date Range (Kolkata Time)
            <select
              className="control-field"
              value={datePreset}
              onChange={(event) => {
                const nextPreset = event.target.value as DatePreset;
                setDatePreset(nextPreset);
                if (nextPreset !== "custom") {
                  const range = getDateRangeForPreset(nextPreset, today);
                  setStartDate(range.startDate);
                  setEndDate(range.endDate);
                }
                setPage(1);
              }}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="today-yesterday">Today and yesterday</option>
              <option value="last-7-days">Last 7 days</option>
              <option value="last-14-days">Last 14 days</option>
              <option value="last-28-days">Last 28 days</option>
              <option value="last-30-days">Last 30 days</option>
              <option value="this-week">This week</option>
              <option value="last-week">Last week</option>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="maximum">Maximum</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Start Date
            <input className="control-field" type="date" value={startDate} onChange={(event) => { setPage(1); setDatePreset("custom"); setStartDate(event.target.value); }} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            End Date
            <input className="control-field" type="date" value={endDate} onChange={(event) => { setPage(1); setDatePreset("custom"); setEndDate(event.target.value); }} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium">
            <input type="checkbox" checked={compareEnabled} onChange={(event) => { setCompareEnabled(event.target.checked); setComparisonData(null); }} />
            Compare
          </label>
          {compareEnabled ? (
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Compare With
              <select className="control-field" value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as ComparisonMode)}>
                <option value="previous-period">Previous period</option>
                <option value="previous-month">Previous month</option>
                <option value="previous-year">Previous year</option>
                <option value="custom">Custom comparison</option>
              </select>
            </label>
          ) : <div />}
        </div>

        {compareEnabled ? (
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
            {comparisonMode === "custom" ? (
              <>
                <label className="space-y-1 font-medium text-muted-foreground">Compare Start<input className="control-field block" type="date" value={customCompareStartDate} onChange={(event) => setCustomCompareStartDate(event.target.value)} /></label>
                <label className="space-y-1 font-medium text-muted-foreground">Compare End<input className="control-field block" type="date" value={customCompareEndDate} onChange={(event) => setCustomCompareEndDate(event.target.value)} /></label>
              </>
            ) : null}
            <p className="pb-2 text-muted-foreground">
              Comparison: <span className="font-medium text-foreground">{comparisonRange.startDate} to {comparisonRange.endDate}</span>{comparisonLoading ? " · Loading comparison…" : ""}
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Source
            <select className="control-field" value={source} onChange={(event) => { setPage(1); setSource(event.target.value); }}>
              {SOURCE_OPTIONS.map((option) => <option key={option} value={option}>{option === "all" ? "All Sources" : option}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Metric
            <select className="control-field" value={selectedMetric} onChange={(event) => handleMetricChange(event.target.value as "" | DrillMetric)}>
              {METRIC_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Platform
            <select className="control-field" value={platform} onChange={(event) => { setPage(1); setPlatform(event.target.value); }}>
              {PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option === "all" ? "All Platforms" : option}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Campaign
            <input className="control-field" value={campaign} onChange={(event) => { setPage(1); setCampaign(event.target.value); }} placeholder="Campaign name" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Keyword
            <input className="control-field" value={keyword} onChange={(event) => { setPage(1); setKeyword(event.target.value); setLandingPage(""); }} placeholder="Keyword or search term" />
          </label>
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            className="control-field"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search lead ID, name, number, source, campaign, keyword, landing page, or agent..."
          />
        </div>
      </div>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            note={card.note}
            trend={compareEnabled && !comparisonLoading ? card.trend : null}
            selected={(selectedMetric === card.metric || drillDown?.metric === card.metric) && !drillDown?.filters?.source}
            onClick={() => {
              if (card.metric === "spend" || card.metric === "costPerBill") {
                openCampaignMetric(card.metric);
                return;
              }
              openDrillDown({
                title: card.label,
                metric: card.metric,
                view: card.metric === "leadToBillRate" ? "billed" : undefined,
                note: card.metric === "leadToBillRate"
                  ? "Lead-to-Bill Rate = unique billed leads divided by unique generated leads for the selected filters."
                  : card.note,
              });
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "action-gold px-3 py-2 text-sm" : "action-outline px-3 py-2 text-sm"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="surface-panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-accent" />
              <h2 className="text-xl font-semibold">Source-wise Lead Distribution</h2>
            </div>
            <div className="space-y-3">
              {sourceDistribution.length === 0 ? <EmptyState label="No source distribution available." /> : sourceDistribution.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className="w-full rounded-lg border border-transparent p-2 text-left transition hover:border-accent hover:bg-accent/5 hover:shadow-sm"
                  title="Click to view details"
                  onClick={() => openAggregateDrill(row, "source")}
                >
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{row.key}</span>
                    <span className="text-muted-foreground">{formatNumber(row.leads)} leads / {formatNumber(row.bills)} bills</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: row.width }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="surface-panel p-5">
            <h2 className="text-xl font-semibold">Sync Status</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="font-medium">Local lead sources</p>
                <p className="text-muted-foreground">Meta, Google LP, Website, Blog, Justdial, and AiSensy WhatsApp Ads tags are read from synced local tables.</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="font-medium">External marketing metrics</p>
                <p className="text-muted-foreground">Google Ads spend is synced through the configured service account. GA4 sessions and Search Console aggregates populate where available.</p>
              </div>
              {isMasterAdmin ? (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Google API account</p>
                      <p className="mt-1 text-xs text-muted-foreground">{safeText(googleStatus?.clientEmail, "Not configured")}</p>
                    </div>
                    <button
                      type="button"
                      className="action-outline px-3 py-1.5 text-xs"
                      onClick={() => void loadGoogleStatus(true)}
                      disabled={googleStatusLoading}
                    >
                      {googleStatusLoading ? "Checking..." : "Verify Token"}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Credential</p>
                      <p className={googleStatus?.configured ? "text-sm font-semibold text-green-600" : "text-sm font-semibold text-amber-600"}>
                        {googleStatus?.configured ? "Configured" : "Missing"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">OAuth token</p>
                      <p className={googleStatus?.tokenStatus === "valid" ? "text-sm font-semibold text-green-600" : googleStatus?.tokenStatus === "failed" ? "text-sm font-semibold text-red-600" : "text-sm font-semibold"}>
                        {safeText(googleStatus?.tokenStatus, "Not checked")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">GA4</p>
                      <p className={googleStatus?.ga4?.configured ? "text-sm font-semibold text-green-600" : "text-sm font-semibold text-amber-600"}>
                        {googleStatus?.ga4?.configured ? googleStatus.ga4.propertyId : "Property ID needed"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Search Console</p>
                      <p className={googleStatus?.searchConsole?.configured ? "truncate text-sm font-semibold text-green-600" : "text-sm font-semibold text-amber-600"}>
                        {googleStatus?.searchConsole?.configured ? googleStatus.searchConsole.siteUrl : "Site URL needed"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Google Ads Manager</p>
                      <p className={googleStatus?.googleAds?.managerCustomerId ? "text-sm font-semibold text-green-600" : "text-sm font-semibold text-amber-600"}>
                        {safeText(googleStatus?.googleAds?.managerCustomerId, "Manager ID needed")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Google Ads Auth</p>
                      <p className={googleStatus?.googleAds?.configured ? "text-sm font-semibold text-green-600" : "text-sm font-semibold text-amber-600"}>
                        {googleStatus?.googleAds?.configured
                          ? googleStatus.googleAds.authMode === "service_account"
                            ? "Service account"
                            : "OAuth refresh token"
                          : googleStatus?.googleAds?.developerTokenConfigured
                            ? "Service account JSON needed"
                            : "Developer token needed"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Google Ads Token</p>
                      <p className={googleStatus?.googleAds?.tokenStatus === "valid" ? "text-sm font-semibold text-green-600" : googleStatus?.googleAds?.tokenStatus === "failed" ? "text-sm font-semibold text-red-600" : "text-sm font-semibold"}>
                        {safeText(googleStatus?.googleAds?.tokenStatus, "Not checked")}
                      </p>
                    </div>
                  </div>
                  {googleStatus?.warnings?.length ? (
                    <p className="mt-3 text-xs text-muted-foreground">{googleStatus.warnings.join(" · ")}</p>
                  ) : null}
                </div>
              ) : null}
              {data?.partialSummary ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700">
                  Summary is based on the latest 10,000 filtered leads to protect dashboard performance.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "source" ? (
        <div className="surface-panel p-5">
          <h2 className="mb-4 text-xl font-semibold">Source Funnel</h2>
          <AggregateTable rows={data?.sourceFunnel || []} mode="source" onRowClick={(row) => openAggregateDrill(row, "source")} />
        </div>
      ) : null}

      {activeTab === "campaign" ? (
        <div className="surface-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{selectedMetric === "spend" || selectedMetric === "costPerBill" ? "Campaign Spend Details" : "Campaign Performance"}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedMetric === "spend" || selectedMetric === "costPerBill"
                  ? "Spend, lead, QL, bill and cost rows for the selected filters."
                  : "Campaign-level lead and billing performance."}
              </p>
            </div>
            {selectedMetric === "spend" || selectedMetric === "costPerBill" ? (
              <button className="action-gold px-3 py-2 text-sm" type="button" onClick={() => handleExport("all")}>
                <Download className="h-4 w-4" />
                Export Spend
              </button>
            ) : null}
          </div>
          {selectedMetric === "spend" || selectedMetric === "costPerBill" ? (
            <SpendDetailsTable data={spendData} loading={spendLoading} onPageChange={setSpendPage} />
          ) : (
            <AggregateTable rows={data?.campaignPerformance || []} mode="campaign" onRowClick={(row) => openAggregateDrill(row, "campaign")} />
          )}
        </div>
      ) : null}

      {activeTab === "keyword" ? (
        <div className="surface-panel p-5">
          <h2 className="mb-4 text-xl font-semibold">Keyword and Search-Term Performance</h2>
          <AggregateTable rows={data?.keywordPerformance || []} mode="keyword" onRowClick={(row) => openAggregateDrill(row, "keyword")} />
        </div>
      ) : null}

      {activeTab === "website" ? (
        <div className="surface-panel p-5">
          <h2 className="mb-4 text-xl font-semibold">Website and Blog Performance</h2>
          <AggregateTable rows={data?.landingPagePerformance || []} mode="website" onRowClick={(row) => openAggregateDrill(row, "website")} />
        </div>
      ) : null}

      {activeTab === "journey" ? (
        <div className="surface-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-xl font-semibold">Lead Journey</h2>
              <p className="text-sm text-muted-foreground">{formatNumber(data?.total)} filtered leads, 50 rows per page</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1900px] text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Lead Date</th>
                  <th className="px-3 py-2">Lead ID</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Campaign</th>
                  <th className="px-3 py-2">Ad Set / Ad Group</th>
                  <th className="px-3 py-2">Ad / Creative</th>
                  <th className="px-3 py-2">Keyword</th>
                  <th className="px-3 py-2">Search Term</th>
                  <th className="px-3 py-2">Landing Page / Blog</th>
                  <th className="px-3 py-2">Current Stage</th>
                  <th className="px-3 py-2">Disposition</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2 text-right">Attempts</th>
                  <th className="px-3 py-2 text-right">Connected</th>
                  <th className="px-3 py-2">Talk Time</th>
                  <th className="px-3 py-2">Bill</th>
                  <th className="px-3 py-2 text-right">Bill Amount</th>
                  <th className="px-3 py-2 text-right">Billed Weight</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.leadId}-${row.customerNumber}`} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button className="action-outline px-2 py-1 text-xs" type="button" onClick={() => setSelectedLead(row)}>
                        <Eye className="h-3.5 w-3.5" />
                        Timeline
                      </button>
                    </td>
                    <td className="px-3 py-2">{row.leadDate} {row.leadTime}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-mono text-xs">{row.leadId}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 font-medium">{safeText(row.customerName)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{maskNumber(row.customerNumber, shouldMaskPhone)}</td>
                    <td className="max-w-[220px] truncate px-3 py-2">{buildRowSourceLabel(row)}</td>
                    <td className="max-w-[190px] truncate px-3 py-2">{safeText(row.campaignName)}</td>
                    <td className="max-w-[170px] truncate px-3 py-2">{safeText(row.adSetOrAdGroupName || row.adSetOrAdGroupId)}</td>
                    <td className="max-w-[170px] truncate px-3 py-2">{safeText(row.adName || row.creativeName || row.adId || row.creativeId)}</td>
                    <td className="max-w-[150px] truncate px-3 py-2">{safeText(row.keyword)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2">{safeText(row.searchTerm)}</td>
                    <td className="max-w-[240px] truncate px-3 py-2">{safeText(row.landingPage || row.blogTitle)}</td>
                    <td className="px-3 py-2">{safeText(row.currentStage)}</td>
                    <td className="max-w-[190px] truncate px-3 py-2">{safeText(row.disposition || row.businessStage)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2">{safeText(row.assignedAgentName || row.assignedAgentId)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(row.callAttempts)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(row.connectedCalls)}</td>
                    <td className="px-3 py-2">{row.totalTalkTime}</td>
                    <td className="px-3 py-2">{row.billStatus}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.billAmount)}</td>
                    <td className="px-3 py-2 text-right">{formatWeight(row.billingGrossWeight)}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={21}>No leads found for these filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={data?.page || page}
            totalPages={data?.totalPages || 1}
            totalItems={data?.total || 0}
            pageSize={data?.limit || 50}
            onPageChange={setPage}
          />
        </div>
      ) : null}

      {activeTab === "bills" ? (
        <div className="surface-panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-xl font-semibold">Bill Conversion History</h2>
            <p className="text-sm text-muted-foreground">Bill rows are shown on their actual bill date when available.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Bill Date</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Original Lead Date</th>
                  <th className="px-3 py-2">Marketing Source</th>
                  <th className="px-3 py-2">Campaign</th>
                  <th className="px-3 py-2">Ad / Keyword / Page</th>
                  <th className="px-3 py-2">Bill IDs</th>
                  <th className="px-3 py-2 text-right">Bill Count</th>
                  <th className="px-3 py-2 text-right">Bill Amount</th>
                  <th className="px-3 py-2 text-right">Billed Weight</th>
                  <th className="px-3 py-2">Credited Agent</th>
                  <th className="px-3 py-2">Attribution Reason</th>
                </tr>
              </thead>
              <tbody>
                {billRows.map((row) => (
                  <tr key={`bill-${row.leadId}-${row.billIds}`} className="border-t border-border">
                    <td className="px-3 py-2">{safeText(row.billDate)}</td>
                    <td className="px-3 py-2 font-medium">{safeText(row.customerName)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{maskNumber(row.customerNumber, shouldMaskPhone)}</td>
                    <td className="px-3 py-2">{safeText(row.leadDate)}</td>
                    <td className="px-3 py-2">{safeText(row.source)}</td>
                    <td className="max-w-[220px] truncate px-3 py-2">{safeText(row.campaignName)}</td>
                    <td className="max-w-[260px] truncate px-3 py-2">{safeText(row.keyword !== "N/A" ? row.keyword : row.landingPage || row.adName || row.creativeName)}</td>
                    <td className="max-w-[240px] truncate px-3 py-2">{safeText(row.billIds)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(row.billCount)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.billAmount)}</td>
                    <td className="px-3 py-2 text-right">{formatWeight(row.billingGrossWeight)}</td>
                    <td className="px-3 py-2">{safeText(row.creditedAgent || row.assignedAgentName)}</td>
                    <td className="px-3 py-2">Highest talk time within 15 days</td>
                  </tr>
                ))}
                {billRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={13}>No bill conversions found for the selected filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {drillDown && drillQuery ? (
        <DrillDownDrawer
          drillDown={drillDown}
          data={drillData}
          loading={drillLoading}
          query={drillQuery}
          shouldMaskPhone={shouldMaskPhone}
          onClose={closeDrillDown}
          onClear={closeDrillDown}
          onPageChange={setDrillPage}
          onExport={handleDrillExport}
          onOpenLead={setSelectedLead}
          onLeadToBillViewChange={handleLeadToBillViewChange}
        />
      ) : null}

      {selectedLead ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Lead Journey</p>
                <h2 className="mt-1 text-xl font-semibold">{safeText(selectedLead.customerName)}</h2>
                <p className="text-sm text-muted-foreground">{maskNumber(selectedLead.customerNumber, shouldMaskPhone)} / {safeText(selectedLead.source)}</p>
              </div>
              <button className="action-outline px-3 py-1.5 text-sm" type="button" onClick={() => setSelectedLead(null)}>Close</button>
            </div>
            <div className="mt-5 space-y-3">
              {selectedLead.timeline.length === 0 ? <EmptyState label="No timeline events available." /> : selectedLead.timeline.map((item, index) => (
                <div key={`${item.time}-${index}`} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{formatDateTime(item.time)}</p>
                  <p className="mt-1 font-medium">{item.event}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
