import type { CallRecord } from "@/data/mockData";

const NON_MEANINGFUL_CUSTOMER_NAMES = new Set([
  "unknown",
  "unknown caller",
  "unknown customer",
  "anonymous",
  "n/a",
  "na",
  "missed",
  "incoming",
  "incoming caller",
  "incoming call",
  "outgoing",
  "outgoing call",
]);

const normalizeText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

export function isMeaningfulCustomerName(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (/\d{5,}/.test(normalized)) return false;
  if (/\b(call|dial)\b/i.test(normalized)) return false;

  const compact = normalized.toLowerCase().replace(/\s+/g, " ");
  return !NON_MEANINGFUL_CUSTOMER_NAMES.has(compact);
}

export function getMeaningfulCustomerName(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (isMeaningfulCustomerName(normalized)) {
      return normalized;
    }
  }
  return "";
}

export function getCallResolvedCustomerName(
  call: Pick<CallRecord, "displayCustomerName" | "customerName" | "callerName">,
) {
  return getMeaningfulCustomerName(
    call.displayCustomerName,
    call.customerName,
    call.callerName,
  );
}

export function getCallDisplayCustomerName(
  call: Pick<CallRecord, "displayCustomerName" | "customerName" | "callerName" | "callerId">,
  _options?: { maskPhone?: boolean },
) {
  const displayName = getCallResolvedCustomerName(call);
  if (displayName) {
    return displayName;
  }

  return "N/A";
}

export function getCallDisplayType(call: Pick<CallRecord, "direction" | "leadSource" | "purpose">) {
  const leadSource = normalizeText(call.leadSource);
  if (leadSource) return leadSource;

  const purpose = normalizeText(call.purpose);
  if (purpose) {
    if (purpose === "Auto Dial") return "Auto Dial Lead";
    if (purpose === "Outbound") return "Manual Outbound";
    return purpose;
  }

  return call.direction === "incoming" ? "Inbound Call" : "Outbound Call";
}

export function getAutoDialLeadSourceLabel(sourceFile?: string) {
  const value = normalizeText(sourceFile);
  if (!value) return "Auto Dial Lead";

  const normalized = value.toLowerCase();
  if (normalized.includes("website")) return "Website Lead";
  if (normalized.includes("justdial")) return "JustDial Lead";
  if (normalized.includes("meta")) return "Meta Lead";
  if (normalized.includes("status") && normalized.includes("follow")) return "Status Follow-Up";
  if (normalized.includes("missed") || normalized.includes("rnr") || normalized.includes("auto follow-up")) return "Follow-Up";
  if (normalized.includes("followup")) return "Status Follow-Up";

  return value.replace(/\.(xlsx|xls|csv)$/i, "");
}
