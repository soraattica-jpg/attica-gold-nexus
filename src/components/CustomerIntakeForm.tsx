import { memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { flushSync } from "react-dom";
import { CalendarClock, Calculator, Clock3, Copy, ExternalLink, History, MapPin, MessageCircle, Pause, PhoneCall, Plus, Save, Send, User, Users, X } from "lucide-react";
import { toast } from "sonner";
import { api, resolveBackendUrl, type LiveAgentRecord, type NearbyBranchRecord, type PlaceSuggestionRecord, type RealBranchRecord } from "@/lib/api";
import BranchSelector from "@/components/BranchSelector";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useRealBranches } from "@/hooks/useRealBranches";
import { usePostCallIntake } from "@/hooks/usePostCallIntake";
import { getBranchLocationUrl } from "@/lib/branchLocation";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter, type ManagedCall } from "@/contexts/CallCenterContext";
import {
  readLocalStorageItem,
  readSessionStorageItem,
  removeLocalStorageItem,
  removeSessionStorageItem,
  writeLocalStorageItem,
  writeSessionStorageItem,
} from "@/lib/browserStorage";
import { getMeaningfulCustomerName } from "@/lib/callDisplay";
import { hidePhoneDisplay, normalizePhoneNumber } from "@/lib/phone";
import { getBusinessDateString } from "@/lib/businessDate";
import { getCallDisplayDate, getCallDisplayTime } from "@/lib/callDateTime";
import { formatCallDurationFromSeconds, getLongerCallDuration, normalizeCallDuration } from "@/lib/callDuration";
import { getGramCategory } from "@/lib/gramCategory";
import { geocodeGoogleAddress, getGooglePlaceSuggestions } from "@/lib/googlePlaces";
import { DISPOSITION_GROUPS } from "@/lib/dispositions";
import { canReceiveTransferredCalls, getAgentStatusLabel } from "@/lib/agentStatus";
import {
  markIntakeFormActive,
  markIntakeFormInactive,
  markIntakeSaveFinished,
  markIntakeSaveStarted,
} from "@/lib/intakeSave";
import { getVisitTimelineSummary } from "@/lib/visitTimeline";

const BUSINESS_TYPES = ["Physical", "Release", "Physical+Release", "Enquiry"];
const METAL_TYPES = ["Gold", "Silver", "Gold+Silver", "Platinum"];
const DEFAULT_PLEDGE_PLACES = [
  "NBFC", "Muthoot Finance", "Manappuram Finance", "IIFL Finance",
  "Bank of India", "SBI", "Canara Bank", "Co-operative Bank", "Local Finance", "Pawn Broker", "Other",
];
const LEAD_TEMPERATURE_GUIDE: Record<string, { classification: string; rule: string; action: string }> = {
  Hot: {
    classification: "HOT",
    rule: "Customer is ready to sell, asks for immediate valuation, or branch visit.",
    action: "Call back immediately; prioritise branch appointment.",
  },
  Warm: {
    classification: "WARM",
    rule: "Customer shows genuine interest but needs time, price, or location discussion.",
    action: "Follow up within agreed SLA.",
  },
  Cold: {
    classification: "COLD",
    rule: "General enquiry, low intent, or only information seeking.",
    action: "Nurture and re-contact later.",
  },
};
const GRAM_WEIGHT_GUIDE = {
  SILVER: {
    classification: "SILVER",
  },
  GOLD: {
    classification: "GOLD",
  },
  PLATINUM: {
    classification: "PLATINUM",
  },
};
const STATUSES = ["Planning to Visit", "Tentative Visit", "Pending", "RNR", "Enquiry Call", "Can't Send Executive", "Not Interested", "Not Feasible", "Pledge", "Re-Pledge", "Sold Out", "Job Enquiry", "Advertisement Call", "Wrong Call", "Others"];
const ADVERTISEMENTS = ["TV", "Bus", "Friends", "Website", "Google", "Justdial", "Chatgpt", "Existing", "Whatsapp", "Instagram", "Socialmedia", "Newspaper", "LED Screen", "Youtube", "Facebook"];
const PURPOSES = ["Gold Sale", "Gold Loan", "Gold Release", "Home Service", "Gold Purchase", "Jewellery Enquiry", "Gold Exchange", "Silver Sale", "General Enquiry", "Other"];
const GENDERS = ["Male", "Female", "Other", "NA"];
const RELEASE_PURPOSES = new Set(["release", "gold release"]);

const isReleaseIntakeCase = (purpose: unknown, businessType: unknown) => {
  const normalizedPurpose = normalizeOptionalString(purpose).trim().toLowerCase();
  const normalizedBusinessType = normalizeOptionalString(businessType).trim().toLowerCase();
  return RELEASE_PURPOSES.has(normalizedPurpose) || normalizedBusinessType === "release";
};

const formatCallTimestamp = (value?: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(parsed);
};

const getCallModeLabel = (direction: "incoming" | "outgoing", agentStatus?: string) => {
  if (direction === "incoming") return "Incoming Call";
  const normalizedStatus = String(agentStatus || "").trim().toLowerCase();
  if (normalizedStatus === "follow-up") return "Follow-Up Call";
  if (normalizedStatus === "outbound-auto") return "Auto Dial Call";
  return "Outgoing Call";
};
const LOCATION_LANGUAGE_AUTO_FILL_RULES = [
  {
    language: "Kannada",
    keywords: [
      "karnataka",
      "bangalore",
      "bengaluru",
      "mysore",
      "mysuru",
      "mangalore",
      "mangaluru",
      "hubli",
      "hubballi",
      "belgaum",
      "belagavi",
      "davangere",
      "davanagere",
      "shimoga",
      "shivamogga",
      "tumkur",
      "tumakuru",
      "udupi",
      "hassan",
      "mandya",
      "ramanagara",
      "ballari",
      "bellary",
      "raichur",
      "yelahanka",
      "rajajinagar",
      "malleshwaram",
      "peenya",
    ],
  },
  {
    language: "Tamil",
    keywords: [
      "tamil nadu",
      "tamilnadu",
      "chennai",
      "coimbatore",
      "madurai",
      "trichy",
      "tiruchirappalli",
      "tiruppur",
      "salem",
      "erode",
      "vellore",
      "hosur",
      "thanjavur",
      "thoothukudi",
      "tuticorin",
      "nagercoil",
      "krishnagiri",
    ],
  },
  {
    language: "Telugu",
    keywords: [
      "andhra pradesh",
      "andhrapradesh",
      "telangana",
      "hyderabad",
      "secunderabad",
      "vijayawada",
      "visakhapatnam",
      "vizag",
      "guntur",
      "tirupati",
      "nellore",
      "kurnool",
      "warangal",
      "karimnagar",
      "nizamabad",
      "khammam",
      "rajahmundry",
      "kakinada",
      "srikakulam",
      "kadapa",
      "anantapur",
      "eluru",
    ],
  },
] as const;
const ALL_DISPOSITION_OPTIONS = Object.entries(DISPOSITION_GROUPS).flatMap(([group, options]) => (
  options.map((option) => ({ ...option, group }))
));
type DispositionGroupName = keyof typeof DISPOSITION_GROUPS;
const DISPOSITION_GROUP_NAMES = Object.keys(DISPOSITION_GROUPS) as DispositionGroupName[];
const INTAKE_PROCEDURE_STEPS = [
  "Connected",
  "Customer Details",
  "Calculations",
  "Schedule / Remarks",
  "Call Ended",
  "Submit",
  "Disposition",
  "Completed",
] as const;
const getDispositionGroupName = (value: string): DispositionGroupName => (
  DISPOSITION_GROUP_NAMES.find((group) => DISPOSITION_GROUPS[group].some((option) => option.code === value)) || "Query"
);

const sortTransferAgents = (agentRows: LiveAgentRecord[]) => (
  [...agentRows].sort((left, right) => {
    const leftLabel = `${normalizeOptionalString(left.agentName) || normalizeOptionalString(left.agentId)}|${normalizeOptionalString(left.extension)}`;
    const rightLabel = `${normalizeOptionalString(right.agentName) || normalizeOptionalString(right.agentId)}|${normalizeOptionalString(right.extension)}`;
    return leftLabel.localeCompare(rightLabel);
  })
);

const getIntakeTransferSourceStatus = (direction: "incoming" | "outgoing", agentStatus?: string) => {
  const normalizedStatus = normalizeOptionalString(agentStatus).toLowerCase();
  if (normalizedStatus === "follow-up") return "follow-up";
  if (normalizedStatus === "outbound-auto" || normalizedStatus === "manual-outgoing") return "outbound-auto";
  return direction === "incoming" ? "active" : "outbound-auto";
};

type FollowUpAction = "none" | "call-done" | "schedule";
type FollowUpPeriod = "" | "AM" | "PM";
const MAX_ALT_PHONE_LENGTH = 15;
const INTAKE_DRAFT_STORAGE_PREFIX = "attica_intake_draft";
const CLOSED_FORM_STATUSES = new Set(["visited sold", "visited not sold", "sold out", "pledge", "re-pledge", "not interested", "not feasible", "wrong call"]);
const FOLLOW_UP_HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const FOLLOW_UP_MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const DEMOGRAPHIC_NA_VALUE = "NA";
const DEMOGRAPHIC_NA_PATTERN = /^n\/?a$/i;
const DEFAULT_ESTIMATED_PURITY = "0.91";

const RESTORABLE_FORM_FIELDS = [
  "name",
  "mob2",
  "age",
  "gender",
  "location",
  "district",
  "language",
  "businessType",
  "metalType",
  "grams",
  "releaseGrossAmount",
  "releasingAmount",
  "pledgePlace",
  "otherPledgePlace",
  "bankName",
  "assignedBranch",
  "onlinePrice",
  "pricePerGram",
  "estimatedPurity",
  "advertisement",
  "lead",
  "status",
  "purpose",
] as const;

type RestorableFormField = typeof RESTORABLE_FORM_FIELDS[number];

const getLocalDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const getLocalDateKeyFromToday = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return getLocalDateKey(date);
};

const getDateTimestamp = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
};

interface FormData {
  date: string; name: string; mob1: string; mob2: string;
  age: string; gender: string;
  location: string; district: string; businessType: string; metalType: string;
  grams: string; releaseGrossAmount: string; releasingAmount: string; pledgePlace: string; otherPledgePlace: string; bankName: string;
  assignedBranch: string; onlinePrice: string; pricePerGram: string; estimatedPurity: string;
  advertisement: string; lead: string; status: string; purpose: string;
  language: string; quickNote: string; remarks: string[]; statusFollowUpAt: string;
  statusFollowUpDate: string; statusFollowUpHour: string; statusFollowUpMinute: string; statusFollowUpPeriod: FollowUpPeriod;
  followUpAction: FollowUpAction;
}

interface CustomerIntakeFormProps {
  phone?: string;
  customerName?: string;
  direction?: "incoming" | "outgoing";
  onSave?: (data: ManagedCall) => void;
  onClose?: () => void;
  callId?: string;
  language?: string;
  businessType?: string;
  purpose?: string;
  inline?: boolean;
  showCloseButton?: boolean;
  closeLabel?: string;
  showDraftCloseButton?: boolean;
  draftCloseLabel?: string;
}

type LocalCallAutofillContext = {
  id: string;
  displayCustomerName: string;
  customerName: string;
  callerName: string;
  mob2: string;
  age: string;
  gender: string;
  district: string;
  place: string;
  language: string;
  businessType: string;
  metalType: string;
  grams: string;
  releaseGrossAmount: string;
  releasingAmount: string;
  pledgePlace: string;
  otherPledgePlace: string;
  bankName: string;
  branch: string;
  onlinePrice: string;
  pricePerGram: string;
  advertisement: string;
  lead: string;
  formStatus: string;
  purpose: string;
};

type NewFollowUpPayload = {
  customerName: string;
  phone: string;
  branch: string;
  followUpAt: string;
  notes?: string;
  callId?: string;
  sourceCallId?: string;
  sourceStatus?: string;
};

type ClosePendingFollowUpsPayload = {
  phone: string;
  outcome?: string;
  throughDate?: string;
};

type FinalizedCallSnapshotLike = {
  status: ManagedCall["status"];
  duration: string;
  ringStartedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  talkDurationSeconds?: number;
} | null;

type CustomerIntakeFormRuntimeProps = {
  addFollowUp: (payload: NewFollowUpPayload) => void;
  closePendingFollowUpsForPhone: (payload: ClosePendingFollowUpsPayload) => void;
  followUps: unknown[];
  liveCallSnapshot?: ManagedCall | null;
  getCurrentCall: (lookup: { callId?: string; intakeToken?: string }) => ManagedCall | null;
  syncCallRecord: (call: Partial<ManagedCall>) => void;
  callPhase: "idle" | "dialing" | "connected";
  isOnHold?: boolean;
  toggleHold?: () => void;
  agentStatus?: string;
  transferCurrentCall?: (
    targetExtension: string,
    targetAgentName?: string,
    ivrSelection?: { phone?: string; language?: string; businessType?: string; purpose?: string },
  ) => Promise<boolean>;
  startConferenceCall: (targetPhone: string) => Promise<boolean>;
  getFinalizedCallSnapshot: (callId?: string) => FinalizedCallSnapshotLike;
  getLiveCallSnapshot: (callId?: string) => FinalizedCallSnapshotLike;
};

type IntakeDraftPayload = {
  disposition: string;
  selectedDisposition?: string;
  form: FormData;
  smsSent: boolean;
  resolvedCallId?: string;
  intakeToken?: string;
  finalSaveState?: "server-draft-only" | "local-only";
  finalSaveError?: string;
  serverSavedAt?: number;
  formOpenedAt?: number;
  updatedAt: number;
};

type DraftSaveState = "idle" | "saving" | "saved" | "error" | "server-draft-only" | "local-only";

type FinalSaveState = Extract<DraftSaveState, "server-draft-only" | "local-only">;

type SaveCustomerDetailsOptions = {
  autoRetry?: boolean;
  closeOnSuccess?: boolean;
  suppressFailureToast?: boolean;
  suppressSuccessToast?: boolean;
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const normalizeLocationLanguageLookupValue = (value: unknown) => (
  normalizeOptionalString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
);

const inferLanguageFromLocationDetails = (...values: unknown[]) => {
  const normalizedValue = values
    .map((value) => normalizeLocationLanguageLookupValue(value))
    .filter(Boolean)
    .join(" ");
  if (!normalizedValue) return "";

  for (const rule of LOCATION_LANGUAGE_AUTO_FILL_RULES) {
    if (rule.keywords.some((keyword) => normalizedValue.includes(keyword))) {
      return rule.language;
    }
  }

  return "";
};

const normalizeAgeValue = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return "";
  return DEMOGRAPHIC_NA_PATTERN.test(normalized) ? DEMOGRAPHIC_NA_VALUE : normalized;
};

const normalizeGenderValue = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return "";
  if (DEMOGRAPHIC_NA_PATTERN.test(normalized)) return DEMOGRAPHIC_NA_VALUE;

  const matchedGender = GENDERS.find((option) => option.toLowerCase() === normalized.toLowerCase());
  return matchedGender || "";
};

const hasMeaningfulDemographicValue = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  return Boolean(normalized) && !DEMOGRAPHIC_NA_PATTERN.test(normalized);
};

const hasCustomerConnection = (snapshot: { status?: string; answeredAt?: string }) => (
  Boolean(normalizeOptionalString(snapshot.answeredAt))
  || ["active", "on-hold", "answered", "completed", "transferred"].includes(normalizeOptionalString(snapshot.status).toLowerCase())
);

const normalizeCallIdValue = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return "";

  const separatorIndex = normalized.indexOf("|");
  if (separatorIndex <= 0) return normalized;

  const canonicalCallId = normalized.slice(0, separatorIndex).trim();
  return canonicalCallId || normalized;
};

const hasValidCoordinate = (value: number | null | undefined): value is number => (
  typeof value === "number" && Number.isFinite(value)
);

const parseLocationSuggestion = (description: string) => {
  const normalized = normalizeOptionalString(description).replace(/\s+/g, " ");
  if (!normalized) {
    return {
      location: "",
      district: "",
    };
  }

  const parenthesizedMatch = normalized.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenthesizedMatch) {
    return {
      location: parenthesizedMatch[1].trim(),
      district: parenthesizedMatch[2].trim(),
    };
  }

  const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    location: parts[0] || normalized,
    district: parts[1] || "",
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

const isManagedCallRecord = (value: unknown): value is ManagedCall => (
  isRecord(value) && typeof value.id === "string"
);

const isFollowUpRecord = (value: unknown): value is { status?: unknown; phone?: unknown; followUpAt?: unknown } => (
  isRecord(value)
);

const normalizeFollowUpAction = (value: unknown): FollowUpAction => {
  const normalized = normalizeOptionalString(value).toLowerCase();
  if (normalized === "call-done" || normalized === "schedule" || normalized === "none") {
    return normalized;
  }
  return "none";
};

const normalizeFollowUpPeriod = (value: unknown): FollowUpPeriod => {
  const normalized = normalizeOptionalString(value).toUpperCase();
  if (normalized === "AM" || normalized === "PM") {
    return normalized;
  }
  return "";
};

const buildGeneratedIntakeCallId = () => `CALL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildGeneratedIntakeToken = ({
  callId = "",
  direction = "outgoing",
  phone = "",
}: Pick<CustomerIntakeFormProps, "callId" | "direction" | "phone">) => {
  const normalizedCallId = normalizeCallIdValue(callId);
  if (normalizedCallId) {
    return `INTAKE-CALL-${normalizedCallId}`;
  }

  const normalizedPhone = normalizePhoneNumber(normalizeOptionalString(phone));
  return `INTAKE-${direction}-${normalizedPhone || "unknown"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getCallIdFromGeneratedIntakeToken = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized.startsWith("INTAKE-CALL-")) return "";
  return normalizeCallIdValue(normalized.slice("INTAKE-CALL-".length));
};

const isIntakeTokenForCallId = (intakeToken: unknown, callId: unknown) => {
  const normalizedCallId = normalizeCallIdValue(callId);
  return Boolean(normalizedCallId && getCallIdFromGeneratedIntakeToken(intakeToken) === normalizedCallId);
};

const getGramWeightGuide = (value: unknown) => {
  const category = getGramCategory(normalizeOptionalString(value));
  return category ? GRAM_WEIGHT_GUIDE[category as keyof typeof GRAM_WEIGHT_GUIDE] : null;
};

const buildInitialFormData = ({
  phone = "",
  customerName = "",
  language = "",
  businessType = "",
  purpose = "",
}: Pick<CustomerIntakeFormProps, "phone" | "customerName" | "language" | "businessType" | "purpose">): FormData => ({
  date: getBusinessDateString(new Date()),
  name: getMeaningfulCustomerName(normalizeOptionalString(customerName)),
  mob1: normalizeOptionalString(phone),
  mob2: "",
  age: "",
  gender: "",
  location: "",
  district: "",
  businessType: normalizeOptionalString(businessType),
  metalType: "Gold",
  grams: "",
  releaseGrossAmount: "",
  releasingAmount: "",
  pledgePlace: "",
  otherPledgePlace: "",
  bankName: "",
  assignedBranch: "",
  onlinePrice: "",
  pricePerGram: "",
  estimatedPurity: DEFAULT_ESTIMATED_PURITY,
  advertisement: "",
  lead: "",
  status: "",
  purpose: normalizeOptionalString(purpose),
  language: normalizeOptionalString(language),
  quickNote: "",
  remarks: [""],
  statusFollowUpAt: "",
  statusFollowUpDate: "",
  statusFollowUpHour: "",
  statusFollowUpMinute: "",
  statusFollowUpPeriod: "",
  followUpAction: "none",
});

const parseFollowUpDateTimeValue = (value: string) => {
  if (!value) {
    return {
      statusFollowUpDate: "",
      statusFollowUpHour: "",
      statusFollowUpMinute: "",
      statusFollowUpPeriod: "" as FollowUpPeriod,
    };
  }

  const localMatch = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  let datePart = "";
  let hour24 = 0;
  let minutePart = "";

  if (localMatch) {
    datePart = localMatch[1];
    hour24 = Number(localMatch[2]);
    minutePart = localMatch[3];
  } else {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return {
        statusFollowUpDate: "",
        statusFollowUpHour: "",
        statusFollowUpMinute: "",
        statusFollowUpPeriod: "" as FollowUpPeriod,
      };
    }

    datePart = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    hour24 = parsed.getHours();
    minutePart = String(parsed.getMinutes()).padStart(2, "0");
  }

  const period: FollowUpPeriod = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return {
    statusFollowUpDate: datePart,
    statusFollowUpHour: String(hour12).padStart(2, "0"),
    statusFollowUpMinute: minutePart,
    statusFollowUpPeriod: period,
  };
};

const buildFollowUpDateTimeValue = ({
  statusFollowUpDate,
  statusFollowUpHour,
  statusFollowUpMinute,
  statusFollowUpPeriod,
}: Pick<FormData, "statusFollowUpDate" | "statusFollowUpHour" | "statusFollowUpMinute" | "statusFollowUpPeriod">) => {
  if (!statusFollowUpDate || !statusFollowUpHour || !statusFollowUpMinute || !statusFollowUpPeriod) return "";

  const parsedHour = Number(statusFollowUpHour);
  const parsedMinute = Number(statusFollowUpMinute);
  if (!Number.isInteger(parsedHour) || parsedHour < 1 || parsedHour > 12) return "";
  if (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59) return "";

  let hour24 = parsedHour % 12;
  if (statusFollowUpPeriod === "PM") {
    hour24 += 12;
  }

  return `${statusFollowUpDate}T${String(hour24).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}`;
};

const normalizeFollowUpScheduleFields = (form: FormData): FormData => {
  const parsed = parseFollowUpDateTimeValue(form.statusFollowUpAt);
  const nextDate = form.statusFollowUpDate || parsed.statusFollowUpDate;
  const nextHour = form.statusFollowUpHour || parsed.statusFollowUpHour;
  const nextMinute = form.statusFollowUpMinute || parsed.statusFollowUpMinute;
  const nextPeriod = form.statusFollowUpPeriod || parsed.statusFollowUpPeriod;

  return {
    ...form,
    statusFollowUpDate: nextDate,
    statusFollowUpHour: nextHour,
    statusFollowUpMinute: nextMinute,
    statusFollowUpPeriod: nextPeriod,
    statusFollowUpAt: buildFollowUpDateTimeValue({
      statusFollowUpDate: nextDate,
      statusFollowUpHour: nextHour,
      statusFollowUpMinute: nextMinute,
      statusFollowUpPeriod: nextPeriod,
    }),
  };
};

const getCallTimestamp = (call: ManagedCall) => {
  const createdAt = new Date(call.createdAt || "").getTime();
  if (Number.isFinite(createdAt)) return createdAt;

  const combined = new Date(`${call.date || ""}T${call.time || ""}`).getTime();
  return Number.isFinite(combined) ? combined : 0;
};

const hasRestorableCallDetails = (call: ManagedCall) => Boolean(
  [
    getMeaningfulCustomerName(
      call.displayCustomerName,
      call.callerName,
      call.customerName,
    ),
    call.mob2,
    hasMeaningfulDemographicValue(call.age) ? normalizeAgeValue(call.age) : "",
    hasMeaningfulDemographicValue(call.gender) ? normalizeGenderValue(call.gender) : "",
    call.district,
    call.place,
    call.language,
    call.branch,
    call.businessType,
    call.purpose,
    call.metalType,
    call.grams,
    call.releaseGrossAmount,
    call.releasingAmount,
    call.pledgePlace,
    call.otherPledgePlace,
    call.bankName,
    call.onlinePrice,
    call.pricePerGram,
    call.advertisement,
    call.lead,
    call.formStatus,
    call.quickNote,
    call.notes,
  ].some((value) => Boolean(normalizeOptionalString(value))),
);

const mergeHistoryRecords = (callRecords: ManagedCall[], intakeRecords: ManagedCall[]) => {
  const merged = new Map<string, ManagedCall>();
  [...callRecords, ...intakeRecords].forEach((record) => {
    if (!isManagedCallRecord(record)) return;
    const key = normalizeOptionalString(record.id)
      || normalizeOptionalString(record.intakeToken)
      || normalizeOptionalString((record as ManagedCall & { callUuid?: string }).callUuid);
    if (!key) return;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, record);
      return;
    }

    const next = { ...previous } as ManagedCall;
    Object.entries(record).forEach(([field, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "string" && value.trim() === "") return;
      (next as unknown as Record<string, unknown>)[field] = value;
    });
    merged.set(key, next);
  });

  return [...merged.values()].sort((left, right) => getCallTimestamp(right) - getCallTimestamp(left));
};

const buildIntakeDraftStorageKey = ({
  callId = "",
  direction = "outgoing",
  phone = "",
}: Pick<CustomerIntakeFormProps, "callId" | "direction" | "phone">) => {
  const normalizedCallId = normalizeOptionalString(callId);
  const normalizedPhoneValue = normalizeOptionalString(phone);
  const normalizedPhone = normalizePhoneNumber(normalizedPhoneValue);
  return `${INTAKE_DRAFT_STORAGE_PREFIX}:${direction}:${normalizedCallId || normalizedPhone || normalizedPhoneValue || "unknown"}`;
};

const EMPTY_INTAKE_DRAFT: IntakeDraftPayload = {
  disposition: "",
  form: buildInitialFormData({}),
  smsSent: false,
  resolvedCallId: "",
  intakeToken: "",
  finalSaveError: "",
  serverSavedAt: 0,
  formOpenedAt: 0,
  updatedAt: 0,
};

const buildPhoneDraftStorageKey = (phone: string) => {
  const normalizedPhone = normalizePhoneNumber(normalizeOptionalString(phone));
  return normalizedPhone ? `${INTAKE_DRAFT_STORAGE_PREFIX}:phone:${normalizedPhone}` : "";
};

const normalizeDraftFormData = (value: unknown, fallbackForm: FormData): FormData => {
  const row = isRecord(value) ? value : {};
  const remarks = Array.isArray(row.remarks)
    ? row.remarks.map((remark) => normalizeOptionalString(remark))
    : fallbackForm.remarks;

  return normalizeFollowUpScheduleFields({
    ...fallbackForm,
    date: normalizeOptionalString(row.date) || fallbackForm.date,
    name: getMeaningfulCustomerName(normalizeOptionalString(row.name)) || fallbackForm.name,
    mob1: normalizeOptionalString(row.mob1) || fallbackForm.mob1,
    mob2: normalizeOptionalString(row.mob2),
    age: normalizeAgeValue(row.age),
    gender: normalizeGenderValue(row.gender),
    location: normalizeOptionalString(row.location),
    district: normalizeOptionalString(row.district),
    businessType: normalizeOptionalString(row.businessType),
    metalType: normalizeOptionalString(row.metalType) || fallbackForm.metalType,
    grams: normalizeOptionalString(row.grams),
    releaseGrossAmount: normalizeOptionalString(row.releaseGrossAmount),
    releasingAmount: normalizeOptionalString(row.releasingAmount),
    pledgePlace: normalizeOptionalString(row.pledgePlace),
    otherPledgePlace: normalizeOptionalString(row.otherPledgePlace),
    bankName: normalizeOptionalString(row.bankName),
    assignedBranch: normalizeOptionalString(row.assignedBranch),
    onlinePrice: normalizeOptionalString(row.onlinePrice),
    pricePerGram: normalizeOptionalString(row.pricePerGram),
    estimatedPurity: normalizeOptionalString(row.estimatedPurity) || fallbackForm.estimatedPurity,
    advertisement: normalizeOptionalString(row.advertisement),
    lead: normalizeOptionalString(row.lead) || fallbackForm.lead,
    status: normalizeOptionalString(row.status),
    purpose: normalizeOptionalString(row.purpose),
    language: normalizeOptionalString(row.language),
    quickNote: normalizeOptionalString(row.quickNote).slice(0, 500),
    remarks: remarks.length > 0 ? remarks : fallbackForm.remarks,
    statusFollowUpAt: normalizeOptionalString(row.statusFollowUpAt),
    statusFollowUpDate: normalizeOptionalString(row.statusFollowUpDate),
    statusFollowUpHour: normalizeOptionalString(row.statusFollowUpHour),
    statusFollowUpMinute: normalizeOptionalString(row.statusFollowUpMinute),
    statusFollowUpPeriod: normalizeFollowUpPeriod(row.statusFollowUpPeriod),
    followUpAction: normalizeFollowUpAction(row.followUpAction),
  });
};

const parseIntakeDraft = (raw: string | null, fallbackForm: FormData): IntakeDraftPayload | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<IntakeDraftPayload>;
    return {
      disposition: typeof parsed.disposition === "string" ? parsed.disposition : "",
      selectedDisposition: typeof parsed.selectedDisposition === "string" ? parsed.selectedDisposition : "",
      form: normalizeDraftFormData(parsed.form, fallbackForm),
      smsSent: Boolean(parsed.smsSent),
      resolvedCallId: typeof parsed.resolvedCallId === "string" ? parsed.resolvedCallId.trim() : "",
      intakeToken: typeof parsed.intakeToken === "string" ? parsed.intakeToken.trim() : "",
      finalSaveState: parsed.finalSaveState === "server-draft-only" || parsed.finalSaveState === "local-only"
        ? parsed.finalSaveState
        : undefined,
      finalSaveError: typeof parsed.finalSaveError === "string" ? parsed.finalSaveError.trim() : "",
      serverSavedAt: typeof parsed.serverSavedAt === "number" && Number.isFinite(parsed.serverSavedAt)
        ? parsed.serverSavedAt
        : 0,
      formOpenedAt: typeof parsed.formOpenedAt === "number" && Number.isFinite(parsed.formOpenedAt)
        ? parsed.formOpenedAt
        : 0,
      updatedAt: typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
    };
  } catch (error) {
    console.error("Failed to parse intake draft:", error);
    return null;
  }
};

const readIntakeDraft = (keys: string[], fallbackForm: FormData): IntakeDraftPayload => {
  if (typeof window === "undefined" || keys.length === 0) {
    return { ...EMPTY_INTAKE_DRAFT, form: fallbackForm };
  }

  const candidates = keys.flatMap((key) => {
    const sessionDraft = parseIntakeDraft(readSessionStorageItem(key), fallbackForm);
    const localDraft = parseIntakeDraft(readLocalStorageItem(key), fallbackForm);
    return [sessionDraft, localDraft].filter((draft): draft is IntakeDraftPayload => Boolean(draft));
  });

  const latestDraft = candidates.sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (!latestDraft) {
    return { ...EMPTY_INTAKE_DRAFT, form: fallbackForm };
  }

  return latestDraft;
};

const persistIntakeDraft = (keys: string[], payload: Omit<IntakeDraftPayload, "updatedAt">) => {
  if (typeof window === "undefined") return;

  const serialized = JSON.stringify({
    ...payload,
    updatedAt: Date.now(),
  } satisfies IntakeDraftPayload);

  keys.filter(Boolean).forEach((key) => {
    writeSessionStorageItem(key, serialized);
    writeLocalStorageItem(key, serialized);
  });
};

const clearIntakeDraft = (keys: string[]) => {
  if (typeof window === "undefined") return;

  keys.filter(Boolean).forEach((key) => {
    removeSessionStorageItem(key);
    removeLocalStorageItem(key);
  });
};

const hasIntakeDraftContent = (
  form: FormData,
  initialForm: FormData,
  disposition: string,
  smsSent: boolean,
) => {
  if (smsSent || disposition.trim() || form.statusFollowUpAt.trim()) {
    return true;
  }

  if (form.remarks.some((remark) => remark.trim())) {
    return true;
  }

  return RESTORABLE_FORM_FIELDS.some((field) => {
    const currentValue = String(form[field] || "").trim();
    const initialValue = String(initialForm[field] || "").trim();
    return currentValue !== initialValue;
  });
};

const isStatusFollowUpAutoDialStatus = (value: string) => (
  value === "Planning to Visit" || value === "Tentative Visit"
);


function CustomerIntakeFormView({
  phone = "", customerName = "", direction = "outgoing", onSave, onClose, callId = "", language = "", businessType = "", purpose = "", inline = false, showCloseButton = true, closeLabel = "Close", showDraftCloseButton = false, draftCloseLabel = "Close as Draft",
  addFollowUp,
  closePendingFollowUpsForPhone,
  followUps,
  liveCallSnapshot,
	  getCurrentCall,
	  syncCallRecord,
	  callPhase,
  isOnHold = false,
  toggleHold = () => {},
  agentStatus = "",
  transferCurrentCall,
  startConferenceCall,
  getFinalizedCallSnapshot,
  getLiveCallSnapshot,
}: CustomerIntakeFormProps & CustomerIntakeFormRuntimeProps) {
  const { user } = useAuth();
  const safePhone = normalizeOptionalString(phone);
  const safeCustomerName = normalizeOptionalString(customerName);
  const safeCallId = normalizeCallIdValue(callId);
  const safeLanguage = normalizeOptionalString(language);
  const safeBusinessType = normalizeOptionalString(businessType);
  const safePurpose = normalizeOptionalString(purpose);
  const safeDirection = direction === "incoming" ? "incoming" : "outgoing";
  const today = getBusinessDateString(new Date());
  const safeFollowUps = useMemo(
    () => (Array.isArray(followUps) ? followUps.filter(isFollowUpRecord) : []),
    [followUps],
  );
  const initialFormDataRef = useRef(buildInitialFormData({
    phone: safePhone,
    customerName: safeCustomerName,
    language: safeLanguage,
    businessType: safeBusinessType,
    purpose: safePurpose,
  }));
  const initialDraftKeyRef = useRef(buildIntakeDraftStorageKey({ callId: safeCallId, direction: safeDirection, phone: safePhone }));
  const initialPhoneDraftKeyRef = useRef(buildPhoneDraftStorageKey(safePhone));
  const initialDraftRef = useRef(readIntakeDraft(
    (safeCallId ? [initialDraftKeyRef.current] : [initialDraftKeyRef.current, initialPhoneDraftKeyRef.current]).filter(Boolean),
    initialFormDataRef.current,
  ));
  const [resolvedCallId, setResolvedCallId] = useState(() => (
    safeCallId
    || normalizeCallIdValue(initialDraftRef.current.resolvedCallId)
    || buildGeneratedIntakeCallId()
  ));
  const [intakeToken, setIntakeToken] = useState(() => (
    (
      !safeCallId || isIntakeTokenForCallId(initialDraftRef.current.intakeToken, safeCallId)
        ? initialDraftRef.current.intakeToken?.trim()
        : ""
    )
    || buildGeneratedIntakeToken({
      callId: safeCallId || normalizeCallIdValue(initialDraftRef.current.resolvedCallId),
      direction: safeDirection,
      phone: safePhone,
    })
  ));
  const [form, setForm] = useState<FormData>(() => initialDraftRef.current.form);

  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(initialDraftRef.current.smsSent);
  const [disposition, setDisposition] = useState(initialDraftRef.current.disposition);
  const [dispositionSelection, setDispositionSelection] = useState(() => ({
    callId: safeCallId || resolvedCallId,
    value: initialDraftRef.current.resolvedCallId === (safeCallId || resolvedCallId)
      ? initialDraftRef.current.selectedDisposition || "" : "",
  }));
  const selectedDisposition = dispositionSelection.callId === (safeCallId || resolvedCallId) ? dispositionSelection.value : "";
  const [saving, setSaving] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>(() => (
    initialDraftRef.current.finalSaveState
    || (initialDraftRef.current.updatedAt > 0 ? "saved" : "idle")
  ));
  const [lastFinalSaveError, setLastFinalSaveError] = useState(() => initialDraftRef.current.finalSaveError || "");
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string>(() => (
    (initialDraftRef.current.serverSavedAt || initialDraftRef.current.updatedAt) > 0
      ? new Date(initialDraftRef.current.serverSavedAt || initialDraftRef.current.updatedAt).toISOString()
      : ""
  ));
  const [hasUserDraftChanges, setHasUserDraftChanges] = useState(() => initialDraftRef.current.updatedAt > 0);
  const [locationLookupState, setLocationLookupState] = useState<"idle" | "loading" | "found" | "not-found">("idle");
  const [locationSuggestionLoading, setLocationSuggestionLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestionRecord[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [nearbyBranchState, setNearbyBranchState] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [nearbyBranches, setNearbyBranches] = useState<NearbyBranchRecord[]>([]);
  const [nearbyBranchMessage, setNearbyBranchMessage] = useState("");
  const [customerHistoryLoading, setCustomerHistoryLoading] = useState(false);
  const [customerHistory, setCustomerHistory] = useState<ManagedCall[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [timingNow, setTimingNow] = useState(() => Date.now());
  const [adminMessage, setAdminMessage] = useState("");
  const [pledgePlaces, setPledgePlaces] = useState<string[]>(DEFAULT_PLEDGE_PLACES);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showDispositionDialog, setShowDispositionDialog] = useState(false);
  const [activeDispositionGroup, setActiveDispositionGroup] = useState<DispositionGroupName>(() => getDispositionGroupName(initialDraftRef.current.disposition));
  const formOpenedAtRef = useRef(
    initialDraftRef.current.formOpenedAt
    && (!safeCallId || normalizeCallIdValue(initialDraftRef.current.resolvedCallId) === safeCallId)
      ? initialDraftRef.current.formOpenedAt
      : Date.now(),
  );
  const [stackedLayout, setStackedLayout] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 1050px)").matches
      : false
  ));
  const [conferenceNumber, setConferenceNumber] = useState("");
  const [conferenceCalling, setConferenceCalling] = useState(false);
  const [transferExt, setTransferExt] = useState("");
  const [availableTransferAgents, setAvailableTransferAgents] = useState<LiveAgentRecord[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const loadPledgePlaces = api.getPledgePlaces;
    if (typeof loadPledgePlaces !== "function") return () => { cancelled = true; };
    void loadPledgePlaces().then((places) => {
      if (!cancelled && places.length > 0) {
        setPledgePlaces(Array.from(new Set([...places, "Other"])));
      }
    }).catch(() => {
      // Keep the safe defaults while the configurable master is unavailable.
    });
    return () => { cancelled = true; };
  }, []);
  const draftSaveTimeoutRef = useRef<number | null>(null);
  const ivrSyncTimeoutRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const draftSaveInFlightRef = useRef(false);
  const pendingDraftSaveRef = useRef(false);
  const handleSaveRef = useRef<((options?: SaveCustomerDetailsOptions) => Promise<boolean>) | null>(null);
  const pendingFinalSaveAutoRetryAttemptedRef = useRef(false);
  const lastDraftFingerprintRef = useRef("");
  const lastIvrSelectionSyncFingerprintRef = useRef("");
  const lastCustomerHistoryLookupPhoneRef = useRef("");
  const autoFilledFieldValuesRef = useRef<Partial<Record<RestorableFormField, string>>>({});
  const locationInferredLanguageRef = useRef("");
  const locationSuggestionRequestRef = useRef(0);
  const nearbyBranchRequestRef = useRef(0);
  const draftStorageKey = buildIntakeDraftStorageKey({ callId: resolvedCallId, direction: safeDirection, phone: form.mob1 || safePhone });
  const phoneDraftStorageKey = buildPhoneDraftStorageKey(form.mob1 || safePhone);
  const previousDraftStorageKeyRef = useRef(draftStorageKey);
  const previousPhoneDraftStorageKeyRef = useRef(phoneDraftStorageKey);
  const followUpActionRef = useRef<HTMLSelectElement | null>(null);
  const statusFollowUpInputRef = useRef<HTMLInputElement | null>(null);
  const { branches } = useRealBranches();
  const backendCallPhone = normalizePhoneNumber(liveCallSnapshot?.callerId || safePhone);
  const normalizedPrimaryPhone = normalizePhoneNumber(form.mob1) || backendCallPhone;

  useEffect(() => {
    if (!backendCallPhone || normalizePhoneNumber(form.mob1) === backendCallPhone) return;
    setForm((previous) => (
      normalizePhoneNumber(previous.mob1) === backendCallPhone
        ? previous
        : { ...previous, mob1: backendCallPhone }
    ));
  }, [backendCallPhone, form.mob1]);

  useEffect(() => {
    setTimingNow(Date.now());
    const interval = window.setInterval(() => setTimingNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const loadAdminMessage = async () => {
      const broadcastRequest = typeof api.getAdminBroadcast === "function"
        ? api.getAdminBroadcast({ agentId: user.id }).catch(() => null)
        : Promise.resolve(null);
      const [broadcast, agent] = await Promise.all([
        broadcastRequest,
        api.getAgent(user.id).catch(() => null),
      ]);
      if (!cancelled) {
        const nextMessage = broadcast?.active
          ? broadcast.message
          : agent?.adminMessage;
        setAdminMessage(normalizeOptionalString(nextMessage));
      }
    };
    void loadAdminMessage();
    const interval = window.setInterval(() => { void loadAdminMessage(); }, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [user?.id]);
  const selectableBranches = useMemo(() => {
    const seen = new Set<string>();
    const merged: RealBranchRecord[] = [];
    const pushBranch = (branch: RealBranchRecord | NearbyBranchRecord | null | undefined) => {
      if (!branch) return;
      const key = normalizeOptionalString(branch.id || branch.name).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(branch);
    };

    nearbyBranches.forEach(pushBranch);
    branches.forEach(pushBranch);

    return merged;
  }, [branches, nearbyBranches]);
  const selectedAssignedBranch = useMemo(() => {
    const selectedValue = normalizeOptionalString(form.assignedBranch).toLowerCase();
    if (!selectedValue) return null;

    return selectableBranches.find((branch) => {
      const branchName = normalizeOptionalString(branch.name).toLowerCase();
      const branchId = normalizeOptionalString(branch.id).toLowerCase();
      return branchName === selectedValue || branchId === selectedValue;
    }) || null;
  }, [form.assignedBranch, selectableBranches]);
  const selectedBranchMapUrl = useMemo(
    () => resolveBackendUrl(normalizeOptionalString(getBranchLocationUrl(selectedAssignedBranch))),
    [selectedAssignedBranch],
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 1050px)");
    const update = () => setStackedLayout(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  const requiresStatusFollowUpTiming = form.status === "Planning to Visit" || form.status === "Tentative Visit";
  const isClosedStatus = CLOSED_FORM_STATUSES.has(form.status.trim().toLowerCase());
  const todayDateKey = getLocalDateKey(new Date());
  const nowTimestamp = Date.now();
  const dueTodayFollowUpsForPhone = safeFollowUps.filter((item) => (
    normalizeOptionalString(item.status) === "Pending" &&
    normalizePhoneNumber(normalizeOptionalString(item.phone)) === normalizedPrimaryPhone &&
    getDateTimestamp(normalizeOptionalString(item.followUpAt)) <= nowTimestamp
  ));
  const effectiveFollowUpAction: FollowUpAction = form.followUpAction === "none" && dueTodayFollowUpsForPhone.length > 0
    ? "call-done"
    : form.followUpAction;
  const shouldShowFollowUpControls = !isClosedStatus && (requiresStatusFollowUpTiming || dueTodayFollowUpsForPhone.length > 0 || effectiveFollowUpAction !== "none" || Boolean(form.statusFollowUpAt));
  const hasPlanningFollowUp = effectiveFollowUpAction === "schedule" && Boolean(form.statusFollowUpAt);
  const isReleaseCase = isReleaseIntakeCase(form.purpose, form.businessType);
  const isOtherPledgePlace = normalizeOptionalString(form.pledgePlace).trim().toLowerCase() === "other";
  const showReleaseGrossAmount = isReleaseCase;
  const showAutoCalculatedPricePerGram = user?.role !== "agent";
  const isAgentUser = user?.role === "agent";
  const goldCalculation = useMemo(() => {
    const goldWeight = Number.parseFloat(form.grams) || 0;
    const goldRate = Number.parseFloat(form.onlinePrice) || 0;
    const releasingAmount = Number.parseFloat(form.releasingAmount) || 0;
    const rawPurity = Number.parseFloat(form.estimatedPurity) || 0;
    const estimatedPurity = rawPurity > 1 ? rawPurity / 100 : rawPurity;
    const grossAmount = goldWeight > 0 && goldRate > 0 && estimatedPurity > 0
      ? goldRate * estimatedPurity * goldWeight
      : 0;
    const releaseGrossAmount = grossAmount > 0
      ? grossAmount - releasingAmount
      : 0;
    const formatMoney = (value: number) => new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value);

    return {
      estimatedPurity,
      grossAmount,
      releasingAmount,
      releaseGrossAmount,
      grossAmountDisplay: grossAmount > 0 ? formatMoney(grossAmount) : "",
      releaseGrossAmountDisplay: grossAmount > 0 ? formatMoney(releaseGrossAmount) : "",
      differenceAmount: releaseGrossAmount,
      differenceAmountDisplay: grossAmount > 0 || releasingAmount > 0 ? formatMoney(releaseGrossAmount) : "",
    };
  }, [form.estimatedPurity, form.grams, form.onlinePrice, form.releasingAmount]);
  const gramWeightGuide = useMemo(() => getGramWeightGuide(form.grams), [form.grams]);
  const leadTemperatureGuide = useMemo(() => LEAD_TEMPERATURE_GUIDE[form.lead] || null, [form.lead]);
  const effectiveReleaseGrossAmount = showReleaseGrossAmount && goldCalculation.grossAmount > 0
    ? goldCalculation.releaseGrossAmount.toFixed(2)
    : "";
  const hasPendingFinalSave = draftSaveState === "server-draft-only" || draftSaveState === "local-only";
  const preferredCustomerName = getMeaningfulCustomerName(safeCustomerName);
  const effectiveCallId = safeCallId || resolvedCallId;
  const visiblePrimaryPhone = isAgentUser ? hidePhoneDisplay(form.mob1, "Number Hidden") : form.mob1;
  const visibleSecondaryPhone = isAgentUser ? "*".repeat(form.mob2.length) : form.mob2;
  const inferredLocationLanguage = useMemo(
    () => inferLanguageFromLocationDetails(form.location, form.district),
    [form.district, form.location],
  );
  const labelClass = "mb-0.5 block text-[10px] font-medium uppercase text-muted-foreground";
  const fieldClass = "control-field min-h-8 px-2 py-1.5 text-sm";
  const monoFieldClass = "control-field min-h-8 px-2 py-1.5 text-sm font-mono";
  const filteredCustomerHistory = customerHistory.filter((item) => item.id !== effectiveCallId);
  const priorCustomerHistory = filteredCustomerHistory.filter((item) => item.status !== "active" && item.status !== "on-hold");
  const recentCustomerHistory = (priorCustomerHistory.length > 0 ? priorCustomerHistory : filteredCustomerHistory).slice(0, 3);
  const lastCustomerInteraction = recentCustomerHistory[0] || null;
  const previousHistoryNotes = recentCustomerHistory
    .filter((item) => normalizeOptionalString(item.notes))
    .slice(0, 3);
  const localCallMatch = useMemo(() => {
    if (!liveCallSnapshot || !isManagedCallRecord(liveCallSnapshot) || !effectiveCallId) return undefined;
    return liveCallSnapshot.id === effectiveCallId ? liveCallSnapshot : undefined;
  }, [effectiveCallId, liveCallSnapshot]);
  const callModeLabel = getCallModeLabel(safeDirection, agentStatus);
  const persistedCallSnapshot = effectiveCallId ? getCurrentCall({ callId: effectiveCallId, intakeToken }) : null;
  const persistedCallPhone = normalizePhoneNumber(persistedCallSnapshot?.callerId);
  useEffect(() => {
    if (!persistedCallPhone || normalizePhoneNumber(form.mob1) === persistedCallPhone) return;
    setForm((previous) => (
      normalizePhoneNumber(previous.mob1) === persistedCallPhone
        ? previous
        : { ...previous, mob1: persistedCallPhone }
    ));
  }, [form.mob1, persistedCallPhone]);
  const liveTimingSnapshot = effectiveCallId ? getLiveCallSnapshot(effectiveCallId) : null;
  const finalizedTimingSnapshot = effectiveCallId ? getFinalizedCallSnapshot(effectiveCallId) : null;
  const timingSnapshot = finalizedTimingSnapshot || liveTimingSnapshot || persistedCallSnapshot || localCallMatch;
  const callStartedAt = timingSnapshot?.ringStartedAt || persistedCallSnapshot?.createdAt || localCallMatch?.createdAt || "";
  const callConnectedAt = timingSnapshot?.answeredAt || "";
  const callEndedAt = timingSnapshot?.endedAt || "";
  const liveTalkSeconds = callPhase === "connected" && callConnectedAt
    ? Math.max(0, Math.floor((timingNow - new Date(callConnectedAt).getTime()) / 1000))
    : 0;
  const storedTalkSeconds = Math.max(
    Number(timingSnapshot?.talkDurationSeconds) || 0,
    Number(persistedCallSnapshot?.talkDurationSeconds) || 0,
  );
  const callTalkTime = liveTalkSeconds > 0
    ? formatCallDurationFromSeconds(Math.max(liveTalkSeconds, storedTalkSeconds))
    : storedTalkSeconds > 0
      ? formatCallDurationFromSeconds(storedTalkSeconds)
      : normalizeCallDuration(timingSnapshot?.duration || persistedCallSnapshot?.duration);
  const dataFillingDurationSeconds = Math.max(0, Math.floor((timingNow - formOpenedAtRef.current) / 1000));
  const dataFillingTime = formatCallDurationFromSeconds(dataFillingDurationSeconds);
  const localCallMatchId = localCallMatch?.id || "";
  const localCallMatchDisplayCustomerName = localCallMatch?.displayCustomerName || "";
  const localCallMatchCustomerName = localCallMatch?.customerName || "";
  const localCallMatchCallerName = localCallMatch?.callerName || "";
  const localCallMatchMob2 = localCallMatch?.mob2 || "";
  const localCallMatchAge = normalizeAgeValue(localCallMatch?.age);
  const localCallMatchGender = normalizeGenderValue(localCallMatch?.gender);
  const localCallMatchDistrict = localCallMatch?.district || "";
  const localCallMatchPlace = localCallMatch?.place || "";
  const localCallMatchLanguage = localCallMatch?.language || "";
  const localCallMatchBusinessType = localCallMatch?.businessType || "";
  const localCallMatchMetalType = localCallMatch?.metalType || "";
  const localCallMatchGrams = localCallMatch?.grams || "";
  const localCallMatchReleaseGrossAmount = localCallMatch?.releaseGrossAmount || "";
  const localCallMatchReleasingAmount = localCallMatch?.releasingAmount || "";
  const localCallMatchPledgePlace = localCallMatch?.pledgePlace || "";
  const localCallMatchOtherPledgePlace = localCallMatch?.otherPledgePlace || "";
  const localCallMatchBankName = localCallMatch?.bankName || "";
  const localCallMatchBranch = localCallMatch?.branch || "";
  const localCallMatchOnlinePrice = localCallMatch?.onlinePrice || "";
  const localCallMatchPricePerGram = localCallMatch?.pricePerGram || "";
  const localCallMatchAdvertisement = localCallMatch?.advertisement || "";
  const localCallMatchLead = localCallMatch?.lead || "";
  const localCallMatchFormStatus = localCallMatch?.formStatus || "";
  const localCallMatchPurpose = localCallMatch?.purpose || "";
  const localCallAutofillContext = useMemo<LocalCallAutofillContext | null>(() => {
    if (!localCallMatchId) return null;

    return {
      id: localCallMatchId,
      displayCustomerName: localCallMatchDisplayCustomerName,
      customerName: localCallMatchCustomerName,
      callerName: localCallMatchCallerName,
      mob2: localCallMatchMob2,
      age: localCallMatchAge,
      gender: localCallMatchGender,
      district: localCallMatchDistrict,
      place: localCallMatchPlace,
      language: localCallMatchLanguage,
      businessType: localCallMatchBusinessType,
      metalType: localCallMatchMetalType,
      grams: localCallMatchGrams,
      releaseGrossAmount: localCallMatchReleaseGrossAmount,
      releasingAmount: localCallMatchReleasingAmount,
      pledgePlace: localCallMatchPledgePlace,
      otherPledgePlace: localCallMatchOtherPledgePlace,
      bankName: localCallMatchBankName,
      branch: localCallMatchBranch,
      onlinePrice: localCallMatchOnlinePrice,
      pricePerGram: localCallMatchPricePerGram,
      advertisement: localCallMatchAdvertisement,
      lead: localCallMatchLead,
      formStatus: localCallMatchFormStatus,
      purpose: localCallMatchPurpose,
    };
  }, [
    localCallMatchId,
    localCallMatchDisplayCustomerName,
    localCallMatchCustomerName,
    localCallMatchCallerName,
    localCallMatchMob2,
    localCallMatchAge,
    localCallMatchGender,
    localCallMatchDistrict,
    localCallMatchPlace,
    localCallMatchLanguage,
    localCallMatchBusinessType,
    localCallMatchMetalType,
    localCallMatchGrams,
    localCallMatchReleaseGrossAmount,
    localCallMatchReleasingAmount,
    localCallMatchPledgePlace,
    localCallMatchOtherPledgePlace,
    localCallMatchBankName,
    localCallMatchBranch,
    localCallMatchOnlinePrice,
    localCallMatchPricePerGram,
    localCallMatchAdvertisement,
    localCallMatchLead,
    localCallMatchFormStatus,
    localCallMatchPurpose,
  ]);
  const markDraftChanged = () => {
    setHasUserDraftChanges(true);
    setDraftSaveState((prev) => {
      if (prev === "saving" || prev === "server-draft-only" || prev === "local-only") {
        return prev;
      }
      return "idle";
    });
  };

  useEffect(() => {
    if (form.releaseGrossAmount === effectiveReleaseGrossAmount) return;

    markDraftChanged();
    setForm((prev) => (
      prev.releaseGrossAmount === effectiveReleaseGrossAmount
        ? prev
        : { ...prev, releaseGrossAmount: effectiveReleaseGrossAmount }
    ));
  }, [effectiveReleaseGrossAmount, form.releaseGrossAmount]);
  const handleDispositionSelect = (value: string) => {
    markDraftChanged();
    setDisposition(value);
    setDispositionSelection({callId:safeCallId || resolvedCallId,value});
  };

  const handleDispositionGroupSelect = (group: DispositionGroupName) => {
    setActiveDispositionGroup(group);
    if (!DISPOSITION_GROUPS[group].some((option) => option.code === disposition)) {
      handleDispositionSelect("");
    }
  };

  const handleOpenDispositionDialog = () => {
    setActiveDispositionGroup(getDispositionGroupName(disposition));
    setShowDispositionDialog(true);
  };

  const buildDraftPersistencePayload = useCallback((options?: {
    nextCallId?: string;
    nextIntakeToken?: string;
    finalSaveState?: FinalSaveState;
    finalSaveError?: string;
    serverSavedAt?: string;
  }) => ({
    disposition,
    selectedDisposition,
    form,
    smsSent,
    resolvedCallId: options?.nextCallId || resolvedCallId,
    intakeToken: options?.nextIntakeToken || intakeToken,
    finalSaveState: options?.finalSaveState ?? (hasPendingFinalSave ? draftSaveState : undefined),
    finalSaveError: options?.finalSaveError ?? lastFinalSaveError,
    serverSavedAt: options?.serverSavedAt
      ? Date.parse(options.serverSavedAt)
      : (lastDraftSavedAt ? Date.parse(lastDraftSavedAt) : 0),
    formOpenedAt: formOpenedAtRef.current,
  }), [
    disposition,
    selectedDisposition,
    draftSaveState,
    form,
    hasPendingFinalSave,
    intakeToken,
    lastDraftSavedAt,
    lastFinalSaveError,
    resolvedCallId,
    smsSent,
  ]);

  useEffect(() => {
    if (!safeCallId) return;

    // The live call can become discoverable after the form mounts; once it does,
    // bind future saves to that authoritative call record instead of a temp ID
    // or an older phone-level draft from a previous call.
    if (safeCallId !== resolvedCallId) {
      setResolvedCallId(safeCallId);
    }
    if (!isIntakeTokenForCallId(intakeToken, safeCallId)) {
      setIntakeToken(buildGeneratedIntakeToken({
        callId: safeCallId,
        direction: safeDirection,
        phone: safePhone,
      }));
    }
  }, [intakeToken, resolvedCallId, safeCallId, safeDirection, safePhone]);

  const syncAutofillValues = (prev: FormData, values: Partial<Record<RestorableFormField, string>>) => {
    let next = prev;
    let changed = false;
    const nextAutoFilledValues = { ...autoFilledFieldValuesRef.current };

    for (const field of RESTORABLE_FORM_FIELDS) {
      const incomingValue = values[field]?.trim() || "";
      const currentValue = String(prev[field] || "").trim();
      const baselineValue = String(initialFormDataRef.current[field] || "").trim();
      const previousAutoFilledValue = autoFilledFieldValuesRef.current[field]?.trim() || "";
      const canOverwrite = !currentValue || currentValue === baselineValue || (previousAutoFilledValue !== "" && currentValue === previousAutoFilledValue);

      if (!incomingValue) {
        if (previousAutoFilledValue !== "" && currentValue === previousAutoFilledValue && currentValue !== baselineValue) {
          if (!changed) next = { ...prev };
          next[field] = initialFormDataRef.current[field];
          changed = true;
        }
        delete nextAutoFilledValues[field];
        continue;
      }

      if (!canOverwrite) {
        continue;
      }

      if (currentValue !== incomingValue) {
        if (!changed) next = { ...prev };
        next[field] = incomingValue;
        changed = true;
      }

      nextAutoFilledValues[field] = incomingValue;
    }

    autoFilledFieldValuesRef.current = nextAutoFilledValues;
    return changed ? next : prev;
  };

  useEffect(() => {
    if (!preferredCustomerName) return;

    setForm((prev) => {
      const currentMeaningfulName = getMeaningfulCustomerName(prev.name);
      const currentNameAsPhone = normalizePhoneNumber(prev.name);
      const looksLikePrimaryPhone = Boolean(currentNameAsPhone && currentNameAsPhone === normalizePhoneNumber(prev.mob1 || safePhone));

      if (currentMeaningfulName && !looksLikePrimaryPhone) {
        return prev;
      }

      if (currentMeaningfulName === preferredCustomerName) {
        return prev;
      }

      autoFilledFieldValuesRef.current = {
        ...autoFilledFieldValuesRef.current,
        name: preferredCustomerName,
      };

      return {
        ...prev,
        name: preferredCustomerName,
      };
    });
  }, [preferredCustomerName, safePhone]);

  const formatInteractionDateTime = (item: ManagedCall) => {
    const createdAt = item.createdAt ? new Date(item.createdAt) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      return createdAt.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    const parts = [item.date, item.time].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "--";
  };

  const getInteractionDisposition = (item: ManagedCall) => (
    normalizeOptionalString(item.callbackStatus) || "--"
  );

  const getInteractionUpdate = (item: ManagedCall) => (
    normalizeOptionalString(item.dispositionCategory) || "--"
  );

  const getInteractionType = (item: ManagedCall) => (
    [normalizeOptionalString(item.businessType), normalizeOptionalString(item.purpose)].filter(Boolean).join(" / ") || "--"
  );

  const getInteractionGoldWeight = (item: ManagedCall) => (
    normalizeOptionalString(item.grams) ? `${normalizeOptionalString(item.grams)} g` : "--"
  );

  const getInteractionVisitTimeline = (item: ManagedCall) => {
    const summary = getVisitTimelineSummary(item);
    return summary ? `${summary.label}: ${summary.formatted}` : "--";
  };

  useEffect(() => {
    const previousKey = previousDraftStorageKeyRef.current;
    const previousPhoneKey = previousPhoneDraftStorageKeyRef.current;
    if (previousKey === draftStorageKey && previousPhoneKey === phoneDraftStorageKey) return;

    const previousDraft = readIntakeDraft(
      [previousKey, previousPhoneKey].filter(Boolean),
      initialFormDataRef.current,
    );
    const nextDraft = readIntakeDraft(
      [draftStorageKey, phoneDraftStorageKey].filter(Boolean),
      initialFormDataRef.current,
    );

    if (previousDraft.updatedAt > 0 && nextDraft.updatedAt === 0) {
      persistIntakeDraft([draftStorageKey, phoneDraftStorageKey].filter(Boolean), buildDraftPersistencePayload({
        nextCallId: resolvedCallId || previousDraft.resolvedCallId || "",
        nextIntakeToken: intakeToken || previousDraft.intakeToken || "",
      }));
    }

    clearIntakeDraft([previousKey, previousPhoneKey].filter(Boolean));
    previousDraftStorageKeyRef.current = draftStorageKey;
    previousPhoneDraftStorageKeyRef.current = phoneDraftStorageKey;
  }, [buildDraftPersistencePayload, draftStorageKey, intakeToken, phoneDraftStorageKey, resolvedCallId]);

  useEffect(() => {
    persistIntakeDraft([draftStorageKey, phoneDraftStorageKey].filter(Boolean), buildDraftPersistencePayload());
  }, [buildDraftPersistencePayload, draftStorageKey, phoneDraftStorageKey]);

  // Update language from prop
  useEffect(() => {
    if (!safeLanguage) return;
    locationInferredLanguageRef.current = "";
    setForm(p => ({ ...p, language: safeLanguage }));
  }, [safeLanguage]);

  useEffect(() => {
    setForm((prev) => {
      const currentLanguage = normalizeOptionalString(prev.language);
      const baselineLanguage = normalizeOptionalString(initialFormDataRef.current.language);
      const previousInferredLanguage = normalizeOptionalString(locationInferredLanguageRef.current);

      if (!inferredLocationLanguage) {
        locationInferredLanguageRef.current = "";
        if (previousInferredLanguage && currentLanguage === previousInferredLanguage && currentLanguage !== baselineLanguage) {
          return {
            ...prev,
            language: baselineLanguage,
          };
        }
        return prev;
      }

      const canOverwrite = !currentLanguage || (previousInferredLanguage !== "" && currentLanguage === previousInferredLanguage);
      if (!canOverwrite) {
        return prev;
      }

      locationInferredLanguageRef.current = inferredLocationLanguage;
      if (currentLanguage === inferredLocationLanguage) {
        return prev;
      }

      return {
        ...prev,
        language: inferredLocationLanguage,
      };
    });
  }, [inferredLocationLanguage]);

  useEffect(() => {
    if (safeBusinessType) setForm((prev) => ({ ...prev, businessType: safeBusinessType }));
  }, [safeBusinessType]);

  useEffect(() => {
    if (safePurpose) setForm((prev) => ({ ...prev, purpose: safePurpose }));
  }, [safePurpose]);

  useEffect(() => {
    if (form.businessType !== "Release" && form.bankName) {
      setForm((prev) => ({ ...prev, bankName: "" }));
    }
  }, [form.bankName, form.businessType]);

  useEffect(() => {
    if (!shouldShowFollowUpControls && (form.statusFollowUpAt || form.followUpAction !== "none")) {
      setForm((prev) => ({
        ...prev,
        statusFollowUpAt: "",
        statusFollowUpDate: "",
        statusFollowUpHour: "",
        statusFollowUpMinute: "",
        statusFollowUpPeriod: "",
        followUpAction: "none",
      }));
    }
  }, [form.followUpAction, form.statusFollowUpAt, shouldShowFollowUpControls]);

  useEffect(() => {
    let ignore = false;
    const shouldLoadCustomerHistory = normalizedPrimaryPhone.length === 10;

    if (normalizedPrimaryPhone.length !== 10) {
      lastCustomerHistoryLookupPhoneRef.current = "";
      setLocationLookupState("idle");
      setCustomerHistory([]);
      setCustomerHistoryLoading(false);
      setForm((prev) => syncAutofillValues(prev, {}));
      return;
    }

    if (lastCustomerHistoryLookupPhoneRef.current !== normalizedPrimaryPhone) {
      lastCustomerHistoryLookupPhoneRef.current = normalizedPrimaryPhone;
      setCustomerHistory([]);
      setHistoryExpanded(false);
    }

    const loadLatestLocation = async () => {
      setLocationLookupState("loading");
      setCustomerHistoryLoading(isAgentUser);
      const lookupCustomerId = localCallMatch?.customerId || persistedCallSnapshot?.customerId;
      const [profile, history, callHistory, transferContext] = await Promise.all([
        lookupCustomerId
          ? api.getCustomerProfile(normalizedPrimaryPhone, { customerId: lookupCustomerId })
          : api.getCustomerProfile(normalizedPrimaryPhone),
        shouldLoadCustomerHistory
          ? api.getIntakeFormHistory(normalizedPrimaryPhone)
          : Promise.resolve({ phone: normalizedPrimaryPhone, total: 0, results: [] }),
        shouldLoadCustomerHistory
          ? (typeof api.getCustomerCallHistory === "function"
            ? api.getCustomerCallHistory(normalizedPrimaryPhone)
            : Promise.resolve({ phone: normalizedPrimaryPhone, total: 0, results: [] }))
          : Promise.resolve({ phone: normalizedPrimaryPhone, total: 0, results: [] }),
        api.getTransferContext(normalizedPrimaryPhone, safeCallId || resolvedCallId || undefined).catch(() => null),
      ]);
      if (ignore) return;

      if (!safeCallId && transferContext?.isActive) {
        const transferSourceCallId = normalizeOptionalString(transferContext.sourceCallId);
        const transferIntakeToken = normalizeOptionalString(transferContext.intakeToken);

        if (transferSourceCallId && transferSourceCallId !== resolvedCallId) {
          setResolvedCallId(transferSourceCallId);
        }
        if (transferIntakeToken && transferIntakeToken !== intakeToken) {
          setIntakeToken(transferIntakeToken);
        } else if (transferSourceCallId && !transferIntakeToken) {
          const fallbackTransferToken = buildGeneratedIntakeToken({
            callId: transferSourceCallId,
            direction: safeDirection,
            phone: normalizedPrimaryPhone,
          });
          if (fallbackTransferToken !== intakeToken) {
            setIntakeToken(fallbackTransferToken);
          }
        }
      }

      const nextLocation = normalizeOptionalString(profile.location);
      const nextCustomerName = getMeaningfulCustomerName(profile.customerName);
      const nextMobile2 = normalizeOptionalString(profile.mob2);
      const nextAge = hasMeaningfulDemographicValue(profile.age) ? normalizeAgeValue(profile.age) : "";
      const nextGender = hasMeaningfulDemographicValue(profile.gender) ? normalizeGenderValue(profile.gender) : "";
      const nextDistrict = normalizeOptionalString(profile.district);
      const nextLanguage = normalizeOptionalString(profile.language);
      const nextBusinessType = normalizeOptionalString(profile.businessType);
      const nextMetalType = normalizeOptionalString(profile.metalType);
      const nextGrams = normalizeOptionalString(profile.grams);
      const nextReleaseGrossAmount = normalizeOptionalString(profile.releaseGrossAmount);
      const nextReleasingAmount = normalizeOptionalString(profile.releasingAmount);
      const nextBankName = normalizeOptionalString(profile.bankName);
      const nextAssignedBranch = normalizeOptionalString(profile.branch);
      const nextOnlinePrice = normalizeOptionalString(profile.onlinePrice);
      const nextPricePerGram = normalizeOptionalString(profile.pricePerGram);
      const nextAdvertisement = normalizeOptionalString(profile.advertisement);
      const nextLead = normalizeOptionalString(profile.lead);
      const nextPurpose = normalizeOptionalString(profile.purpose);
      const intakeHistoryResults = Array.isArray(history.results)
        ? history.results.filter((item): item is ManagedCall => isManagedCallRecord(item))
        : [];
      const callHistoryResults = Array.isArray(callHistory.results)
        ? callHistory.results.filter((item): item is ManagedCall => isManagedCallRecord(item))
        : [];
      const historyResults = mergeHistoryRecords(callHistoryResults, intakeHistoryResults);
      const latestSavedInteraction = historyResults
        .filter((item) => item.id !== resolvedCallId && item.status !== "active" && item.status !== "on-hold" && hasRestorableCallDetails(item))
        .sort((left, right) => getCallTimestamp(right) - getCallTimestamp(left))[0]
        || historyResults
          .filter((item) => item.id !== resolvedCallId && hasRestorableCallDetails(item))
          .sort((left, right) => getCallTimestamp(right) - getCallTimestamp(left))[0];

      const hasAnySavedDetails = Boolean(
        profile.hasSavedDetails ||
        nextLocation ||
        nextCustomerName ||
        nextMobile2 ||
        nextDistrict ||
        latestSavedInteraction,
      );
      setLocationLookupState(hasAnySavedDetails ? "found" : "not-found");
      setCustomerHistory(historyResults);
      setCustomerHistoryLoading(false);

      setForm((prev) => {
        let next = syncAutofillValues(prev, {
          name: nextCustomerName,
          mob2: nextMobile2,
          age: nextAge,
          gender: nextGender,
          location: nextLocation,
          district: nextDistrict,
          language: nextLanguage,
          businessType: nextBusinessType,
          metalType: nextMetalType,
          grams: nextGrams,
          releaseGrossAmount: nextReleaseGrossAmount,
          releasingAmount: nextReleasingAmount,
          bankName: nextBankName,
          assignedBranch: nextAssignedBranch,
          onlinePrice: nextOnlinePrice,
          pricePerGram: nextPricePerGram,
          advertisement: nextAdvertisement,
          lead: nextLead,
            purpose: nextPurpose,
        });

        if (latestSavedInteraction) {
          next = syncAutofillValues(next, {
            name:
              getMeaningfulCustomerName(
                latestSavedInteraction.displayCustomerName,
                latestSavedInteraction.customerName,
                latestSavedInteraction.callerName,
              )
              || nextCustomerName,
            mob2: normalizeOptionalString(latestSavedInteraction.mob2) || nextMobile2,
            age: hasMeaningfulDemographicValue(latestSavedInteraction.age) ? normalizeAgeValue(latestSavedInteraction.age) : nextAge,
            gender: hasMeaningfulDemographicValue(latestSavedInteraction.gender) ? normalizeGenderValue(latestSavedInteraction.gender) : nextGender,
            location: normalizeOptionalString(latestSavedInteraction.place) || nextLocation,
            district: normalizeOptionalString(latestSavedInteraction.district) || nextDistrict,
            language: normalizeOptionalString(latestSavedInteraction.language) || nextLanguage,
            businessType: normalizeOptionalString(latestSavedInteraction.businessType) || nextBusinessType,
            metalType: normalizeOptionalString(latestSavedInteraction.metalType) || nextMetalType,
            grams: normalizeOptionalString(latestSavedInteraction.grams) || nextGrams,
            releaseGrossAmount: normalizeOptionalString(latestSavedInteraction.releaseGrossAmount) || nextReleaseGrossAmount,
            releasingAmount: normalizeOptionalString(latestSavedInteraction.releasingAmount) || nextReleasingAmount,
            pledgePlace: normalizeOptionalString(latestSavedInteraction.pledgePlace),
            otherPledgePlace: normalizeOptionalString(latestSavedInteraction.otherPledgePlace),
            bankName: normalizeOptionalString(latestSavedInteraction.bankName) || nextBankName,
            assignedBranch: normalizeOptionalString(latestSavedInteraction.branch) || nextAssignedBranch,
            onlinePrice: normalizeOptionalString(latestSavedInteraction.onlinePrice) || nextOnlinePrice,
            pricePerGram: normalizeOptionalString(latestSavedInteraction.pricePerGram) || nextPricePerGram,
            advertisement: normalizeOptionalString(latestSavedInteraction.advertisement) || nextAdvertisement,
            lead: normalizeOptionalString(latestSavedInteraction.lead) || nextLead,
            purpose: normalizeOptionalString(latestSavedInteraction.purpose) || nextPurpose,
          });
        }

        if (localCallAutofillContext) {
          next = syncAutofillValues(next, {
            name:
              getMeaningfulCustomerName(
                localCallAutofillContext.displayCustomerName,
                localCallAutofillContext.customerName,
                localCallAutofillContext.callerName,
              )
              || nextCustomerName,
            mob2: normalizeOptionalString(localCallAutofillContext.mob2) || nextMobile2,
            age: hasMeaningfulDemographicValue(localCallAutofillContext.age) ? normalizeAgeValue(localCallAutofillContext.age) : nextAge,
            gender: hasMeaningfulDemographicValue(localCallAutofillContext.gender) ? normalizeGenderValue(localCallAutofillContext.gender) : nextGender,
            location: normalizeOptionalString(localCallAutofillContext.place) || nextLocation,
            district: normalizeOptionalString(localCallAutofillContext.district) || nextDistrict,
            language: normalizeOptionalString(localCallAutofillContext.language) || nextLanguage,
            businessType: normalizeOptionalString(localCallAutofillContext.businessType) || nextBusinessType,
            metalType: normalizeOptionalString(localCallAutofillContext.metalType) || nextMetalType,
            grams: normalizeOptionalString(localCallAutofillContext.grams) || nextGrams,
            releaseGrossAmount: normalizeOptionalString(localCallAutofillContext.releaseGrossAmount) || nextReleaseGrossAmount,
            releasingAmount: normalizeOptionalString(localCallAutofillContext.releasingAmount) || nextReleasingAmount,
            pledgePlace: normalizeOptionalString(localCallAutofillContext.pledgePlace),
            otherPledgePlace: normalizeOptionalString(localCallAutofillContext.otherPledgePlace),
            bankName: normalizeOptionalString(localCallAutofillContext.bankName) || nextBankName,
            assignedBranch: normalizeOptionalString(localCallAutofillContext.branch) || nextAssignedBranch,
            onlinePrice: normalizeOptionalString(localCallAutofillContext.onlinePrice) || nextOnlinePrice,
            pricePerGram: normalizeOptionalString(localCallAutofillContext.pricePerGram) || nextPricePerGram,
            advertisement: normalizeOptionalString(localCallAutofillContext.advertisement) || nextAdvertisement,
            lead: normalizeOptionalString(localCallAutofillContext.lead) || nextLead,
            purpose: normalizeOptionalString(localCallAutofillContext.purpose) || nextPurpose,
          });
        }

        if (transferContext?.isActive) {
          next = syncAutofillValues(next, {
            name: getMeaningfulCustomerName(transferContext.customerName) || nextCustomerName,
            mob2: normalizeOptionalString(transferContext.mob2) || nextMobile2,
            age: hasMeaningfulDemographicValue(transferContext.age) ? normalizeAgeValue(transferContext.age) : nextAge,
            gender: hasMeaningfulDemographicValue(transferContext.gender) ? normalizeGenderValue(transferContext.gender) : nextGender,
            location: normalizeOptionalString(transferContext.location) || nextLocation,
            district: normalizeOptionalString(transferContext.district) || nextDistrict,
            language: normalizeOptionalString(transferContext.language) || nextLanguage,
            businessType: normalizeOptionalString(transferContext.businessType) || nextBusinessType,
            metalType: normalizeOptionalString(transferContext.metalType) || nextMetalType,
            grams: normalizeOptionalString(transferContext.grams) || nextGrams,
            releaseGrossAmount: normalizeOptionalString(transferContext.releaseGrossAmount) || nextReleaseGrossAmount,
            releasingAmount: normalizeOptionalString(transferContext.releasingAmount) || nextReleasingAmount,
            pledgePlace: normalizeOptionalString(transferContext.pledgePlace),
            otherPledgePlace: normalizeOptionalString(transferContext.otherPledgePlace),
            bankName: normalizeOptionalString(transferContext.bankName) || nextBankName,
            assignedBranch: normalizeOptionalString(transferContext.branch) || nextAssignedBranch,
            onlinePrice: normalizeOptionalString(transferContext.onlinePrice) || nextOnlinePrice,
            pricePerGram: normalizeOptionalString(transferContext.pricePerGram) || nextPricePerGram,
            advertisement: normalizeOptionalString(transferContext.advertisement) || nextAdvertisement,
            lead: normalizeOptionalString(transferContext.lead) || nextLead,
            purpose: normalizeOptionalString(transferContext.purpose) || nextPurpose,
          });
        }

        return next;
      });
    };

    void loadLatestLocation().catch((error) => {
      if (ignore) return;
      console.error("Failed to load intake form context:", error);
      setLocationLookupState("not-found");
      setCustomerHistory([]);
      setCustomerHistoryLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [intakeToken, isAgentUser, localCallAutofillContext, localCallMatch?.customerId, normalizedPrimaryPhone, persistedCallSnapshot?.customerId, resolvedCallId, safeCallId, safeDirection]);

  const buildDraftServerPayload = useCallback(() => {
    const saveCallId = safeCallId || resolvedCallId || buildGeneratedIntakeCallId();
    const saveIntakeToken = intakeToken || buildGeneratedIntakeToken({
      callId: saveCallId,
      direction: safeDirection,
      phone: normalizedPrimaryPhone || safePhone,
    });
    const resolvedCustomerName = getMeaningfulCustomerName(
      form.name,
      safeCustomerName,
      localCallAutofillContext?.displayCustomerName,
      localCallAutofillContext?.customerName,
      localCallAutofillContext?.callerName,
    );

    return {
      id: saveCallId,
      intakeToken: saveIntakeToken,
      callerId: normalizedPrimaryPhone || safePhone,
      callerName: resolvedCustomerName,
      customerName: resolvedCustomerName,
      displayCustomerName: resolvedCustomerName,
      agentId: user?.id || "",
      agentName: user?.name || "",
      direction: safeDirection,
      status: callPhase === "connected" ? "active" : "completed",
      language: form.language,
      branch: form.assignedBranch,
      place: form.location,
      purpose: form.purpose,
      callbackStatus: disposition,
      notes: form.remarks.filter((remark) => remark.trim()).join(" | "),
      smsSent,
      statusFollowUpAt: form.statusFollowUpAt,
      quickNote: form.quickNote,
      mob2: form.mob2,
      age: normalizeAgeValue(form.age),
      gender: normalizeGenderValue(form.gender),
      district: form.district,
      businessType: form.businessType,
      metalType: form.metalType,
      grams: form.grams,
      releaseGrossAmount: effectiveReleaseGrossAmount,
      releasingAmount: form.releasingAmount,
      pledgePlace: isReleaseCase ? form.pledgePlace : "",
      otherPledgePlace: isReleaseCase && isOtherPledgePlace ? form.otherPledgePlace : "",
      differenceAmount: effectiveReleaseGrossAmount,
      bankName: "",
      onlinePrice: form.onlinePrice,
      pricePerGram: form.pricePerGram,
      advertisement: form.advertisement,
      lead: form.lead || localCallMatch?.lead || localCallMatch?.leadSource || "",
      leadSource: localCallMatch?.leadSource || "",
      carrierTrunk: localCallMatch?.carrierTrunk || "",
      trunkCode: localCallMatch?.trunkCode || "",
      pilot: localCallMatch?.pilot || "",
      didOrCli: localCallMatch?.didOrCli || "",
      formStatus: form.status,
      dataFillingStartedAt: new Date(formOpenedAtRef.current).toISOString(),
      dataFillingDurationSeconds,
      createdAt: lastDraftSavedAt || new Date().toISOString(),
    } satisfies Partial<ManagedCall>;
  }, [
    callPhase,
    disposition,
    effectiveReleaseGrossAmount,
    form,
    intakeToken,
    lastDraftSavedAt,
    localCallAutofillContext,
    localCallMatch?.carrierTrunk,
    localCallMatch?.didOrCli,
    localCallMatch?.lead,
    localCallMatch?.leadSource,
    localCallMatch?.pilot,
    localCallMatch?.trunkCode,
    normalizedPrimaryPhone,
    resolvedCallId,
    safeCallId,
    safeCustomerName,
    safeDirection,
    safePhone,
    smsSent,
    dataFillingDurationSeconds,
    user?.id,
    user?.name,
  ]);

  const buildDraftFingerprint = useCallback((nextCallId: string, nextIntakeToken: string) => JSON.stringify({
    resolvedCallId: nextCallId,
    intakeToken: nextIntakeToken,
    disposition,
    form,
    smsSent,
  }), [disposition, form, smsSent]);

  const postCallIntake = usePostCallIntake({
    callId: safeCallId || resolvedCallId, agentId: user?.id || "", enabled: isAgentUser && Boolean(safeCallId),
    selectedDisposition,
    draft: {...buildDraftServerPayload(), followUpAction: effectiveFollowUpAction}, hasLocalChanges: hasUserDraftChanges,
    onRestore: (draft) => {
      setDisposition(String(draft.callbackStatus || ""));
      setSmsSent(Boolean(draft.smsSent));
      setForm((previous) => {
        const next = {...previous};
        const mapping: Record<string,string> = {name:"customerName",mob1:"callerId",location:"place",assignedBranch:"branch",status:"formStatus"};
        for (const key of Object.keys(previous)) {
          const sourceKey = mapping[key] || key;
          if (key !== "remarks" && typeof draft[sourceKey] === "string") (next as unknown as Record<string,unknown>)[key] = draft[sourceKey];
        }
        next.remarks = [String(draft.notes || "")];
        Object.assign(next,parseFollowUpDateTimeValue(String(draft.statusFollowUpAt || "")));
        return next;
      });
    },
    onSubmitted: (workflow) => {
      if (workflow.callId !== (safeCallId || resolvedCallId)) return;
      clearIntakeDraft([draftStorageKey,phoneDraftStorageKey].filter(Boolean));
      setHasUserDraftChanges(false);
      setDraftSaveState("saved");
      setLastFinalSaveError("");
      markIntakeFormInactive();
      toast.success("Saved to server");
      if (workflow.requiresReview.length) toast.info("Requires Review: " + workflow.requiresReview.join(", "));
      const current = getCurrentCall({callId:workflow.callId});
      syncCallRecord({...current,...workflow.draft,id:workflow.callId,intakeToken:workflow.intakeToken} as ManagedCall);
      onSave?.({...current,...workflow.draft,id:workflow.callId,intakeToken:workflow.intakeToken} as ManagedCall);
      if (!onSave) onClose?.();
    },
  });

  const cacheDraftLocally = useCallback((nextCallId: string, nextIntakeToken: string, options?: {
    finalSaveState?: FinalSaveState;
    finalSaveError?: string;
    serverSavedAt?: string;
  }) => {
    const draftPhone = normalizedPrimaryPhone || safePhone;
    persistIntakeDraft([
      buildIntakeDraftStorageKey({ callId: nextCallId, direction: safeDirection, phone: draftPhone }),
      buildPhoneDraftStorageKey(draftPhone),
    ].filter(Boolean), buildDraftPersistencePayload({
      nextCallId,
      nextIntakeToken,
      finalSaveState: options?.finalSaveState,
      finalSaveError: options?.finalSaveError,
      serverSavedAt: options?.serverSavedAt,
    }));
    if (nextCallId !== resolvedCallId) {
      setResolvedCallId(nextCallId);
    }
    if (nextIntakeToken !== intakeToken) {
      setIntakeToken(nextIntakeToken);
    }
  }, [
    buildDraftPersistencePayload,
    intakeToken,
    normalizedPrimaryPhone,
    resolvedCallId,
    safeDirection,
    safePhone,
  ]);

  const markDraftServerSynced = useCallback((fingerprint: string, options?: {
    state?: Extract<DraftSaveState, "saved" | "server-draft-only">;
    finalSaveError?: string;
    savedAt?: string;
  }) => {
    lastDraftFingerprintRef.current = fingerprint;
    setLastDraftSavedAt(options?.savedAt || new Date().toISOString());
    setDraftSaveState(options?.state || "saved");
    setLastFinalSaveError(options?.finalSaveError || "");
    setHasUserDraftChanges(false);
  }, []);

  const autoSaveDraft = useCallback(async (reason: "change" | "blur" | "interval" | "pending" = "change") => {
    if (postCallIntake.workflow) return false;
    if (saving || saveInFlightRef.current || draftSaveInFlightRef.current) {
      if (!saving) {
        pendingDraftSaveRef.current = true;
      }
      return false;
    }

    if (!hasUserDraftChanges || normalizedPrimaryPhone.length !== 10) {
      return false;
    }

    if (!hasIntakeDraftContent(form, initialFormDataRef.current, disposition, smsSent)) {
      return false;
    }

    const saveCallId = safeCallId || resolvedCallId || buildGeneratedIntakeCallId();
    const saveIntakeToken = intakeToken || buildGeneratedIntakeToken({
      callId: saveCallId,
      direction: safeDirection,
      phone: normalizedPrimaryPhone || safePhone,
    });

    if (saveCallId !== resolvedCallId) {
      setResolvedCallId(saveCallId);
    }
    if (saveIntakeToken !== intakeToken) {
      setIntakeToken(saveIntakeToken);
    }

    const fingerprint = buildDraftFingerprint(saveCallId, saveIntakeToken);

    if (fingerprint === lastDraftFingerprintRef.current && reason !== "blur") {
      return false;
    }

    draftSaveInFlightRef.current = true;
    setDraftSaveState("saving");

    try {
      const draftSaveResult = await api.saveIntakeFormWithResult(buildDraftServerPayload());
      if (!draftSaveResult.success) {
        throw new Error(draftSaveResult.error || "Unable to sync the draft");
      }

      const savedAt = new Date().toISOString();
      cacheDraftLocally(saveCallId, saveIntakeToken, hasPendingFinalSave ? {
        finalSaveState: "server-draft-only",
        finalSaveError: lastFinalSaveError,
        serverSavedAt: savedAt,
      } : undefined);
      markDraftServerSynced(fingerprint, hasPendingFinalSave ? {
        state: "server-draft-only",
        finalSaveError: lastFinalSaveError,
        savedAt,
      } : {
        savedAt,
      });
      return true;
    } catch (error) {
      console.error("Auto-save draft failed:", error);
      setDraftSaveState("error");
      return false;
    } finally {
      draftSaveInFlightRef.current = false;
      if (pendingDraftSaveRef.current) {
        pendingDraftSaveRef.current = false;
        void autoSaveDraft("pending");
      }
    }
  }, [
    postCallIntake.workflow,
    safeCallId,
    safeDirection,
    disposition,
    form,
    buildDraftServerPayload,
    buildDraftFingerprint,
    cacheDraftLocally,
    hasUserDraftChanges,
    intakeToken,
    lastFinalSaveError,
    markDraftServerSynced,
    hasPendingFinalSave,
    normalizedPrimaryPhone,
    safePhone,
    resolvedCallId,
    saving,
    smsSent,
  ]);

  useEffect(() => {
    if (!hasUserDraftChanges || saving) return;
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
    }
    draftSaveTimeoutRef.current = window.setTimeout(() => {
      void autoSaveDraft("change");
    }, 700);

    return () => {
      if (draftSaveTimeoutRef.current !== null) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [autoSaveDraft, form, disposition, hasUserDraftChanges, saving, smsSent]);

  useEffect(() => {
    if (!hasUserDraftChanges) return;
    const interval = window.setInterval(() => {
      void autoSaveDraft("interval");
    }, 6000);
    return () => window.clearInterval(interval);
  }, [autoSaveDraft, hasUserDraftChanges]);

  useEffect(() => () => {
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    if (ivrSyncTimeoutRef.current !== null) {
      window.clearTimeout(ivrSyncTimeoutRef.current);
      ivrSyncTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    markIntakeFormActive();
    return () => {
      markIntakeFormInactive();
    };
  }, []);

  const handleFormBlur = () => {
    if (!hasUserDraftChanges || saving) return;
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    window.setTimeout(() => {
      void autoSaveDraft("blur");
    }, 0);
  };

  useEffect(() => {
    if (ivrSyncTimeoutRef.current !== null) {
      window.clearTimeout(ivrSyncTimeoutRef.current);
      ivrSyncTimeoutRef.current = null;
    }

    const currentLanguage = normalizeOptionalString(form.language);
    const currentBusinessType = normalizeOptionalString(form.businessType);
    const currentPurpose = normalizeOptionalString(form.purpose);
    const hasIvrSelection = Boolean(currentLanguage || currentBusinessType || currentPurpose);
    if (callPhase !== "connected" || normalizedPrimaryPhone.length !== 10 || !hasIvrSelection) {
      return;
    }

    const syncFingerprint = [
      effectiveCallId,
      normalizedPrimaryPhone,
      currentLanguage,
      currentBusinessType,
      currentPurpose,
    ].join("|");
    if (lastIvrSelectionSyncFingerprintRef.current === syncFingerprint) {
      return;
    }

    if (effectiveCallId) {
      syncCallRecord({
        id: effectiveCallId,
        language: currentLanguage,
        businessType: currentBusinessType,
        purpose: currentPurpose,
      });
    }

    ivrSyncTimeoutRef.current = window.setTimeout(() => {
      console.info("IVR selection sync:", {
        source: "intake-form-live",
        callId: effectiveCallId,
        agentId: user?.id || "",
        agentName: user?.name || "",
        phone: normalizedPrimaryPhone,
        language: currentLanguage,
        businessType: currentBusinessType,
        purpose: currentPurpose,
      });

      void api.saveCallIvrSelection({
        phone: normalizedPrimaryPhone,
        language: currentLanguage,
        businessType: currentBusinessType,
        purpose: currentPurpose,
        agentId: user?.id || "",
        agentName: user?.name || "",
        source: "intake-form-live",
      }).then((result) => {
        if (result.error) {
          console.error("Failed to sync IVR selection from intake form:", result.error);
          return;
        }
        lastIvrSelectionSyncFingerprintRef.current = syncFingerprint;
      }).catch((error) => {
        console.error("Failed to sync IVR selection from intake form:", error);
      });
    }, 350);

    return () => {
      if (ivrSyncTimeoutRef.current !== null) {
        window.clearTimeout(ivrSyncTimeoutRef.current);
        ivrSyncTimeoutRef.current = null;
      }
    };
  }, [
    callPhase,
    effectiveCallId,
    form.businessType,
    form.language,
    form.purpose,
    normalizedPrimaryPhone,
    syncCallRecord,
    user?.id,
    user?.name,
  ]);

  const getDraftStatusLabel = () => {
    if (saving) return "Saving final details...";
    if (draftSaveState === "saving") return "Saving draft...";
    if (draftSaveState === "local-only") {
      return lastFinalSaveError
        ? `Saved locally only. Final server save is pending: ${lastFinalSaveError}`
        : "Saved locally only. Final server save is pending.";
    }
    if (draftSaveState === "server-draft-only") {
      return lastDraftSavedAt
        ? `Saved to server draft only at ${new Date(lastDraftSavedAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}. Final server save is still pending.`
        : "Saved to server draft only. Final server save is still pending.";
    }
    if (draftSaveState === "error") return "Draft sync failed. Saved locally only until the server is reachable.";
    if (draftSaveState === "saved" && lastDraftSavedAt) {
      return `Draft saved to server ${new Date(lastDraftSavedAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return "Draft saves automatically while you type.";
  };

  // Auto-calculate price per gram
  useEffect(() => {
    if (!showAutoCalculatedPricePerGram) {
      setForm((prev) => (prev.pricePerGram ? { ...prev, pricePerGram: "" } : prev));
      return;
    }
    const grams = parseFloat(form.grams) || 0;
    const amount = parseFloat(form.releasingAmount) || 0;
    if (grams > 0 && amount > 0 && ["Release", "Physical+Release"].includes(form.businessType)) {
      setForm(p => ({ ...p, pricePerGram: (amount / grams).toFixed(2) }));
    }
  }, [form.grams, form.releasingAmount, form.businessType, showAutoCalculatedPricePerGram]);

  const set = (key: keyof FormData, val: string) => {
    markDraftChanged();
    setForm((p) => ({ ...p, [key]: val }));
  };

  const setPledgePlace = (value: string) => {
    markDraftChanged();
    setForm((prev) => ({
      ...prev,
      pledgePlace: value,
      otherPledgePlace: value.trim().toLowerCase() === "other" ? prev.otherPledgePlace : "",
    }));
  };

  const setFields = (updates: Partial<FormData>) => {
    markDraftChanged();
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const applyNearbyBranches = (matches: NearbyBranchRecord[], sourceLabel?: string) => {
    setNearbyBranches(matches);

    if (matches.length === 0) {
      setNearbyBranchState("empty");
      setNearbyBranchMessage(sourceLabel
        ? `No nearby branch found for ${sourceLabel}.`
        : "No nearby branch found for this location.");
      return;
    }

    const nearestBranch = matches[0];
    const nearestLabel = nearestBranch.distance != null
      ? `${nearestBranch.name} (${nearestBranch.distance} km)`
      : nearestBranch.name;

    setNearbyBranchState("ready");
    setNearbyBranchMessage(`Nearest branch ${nearestLabel} selected. You can still change it manually.`);
    setFields({
      assignedBranch: nearestBranch.name || form.assignedBranch,
      district: form.district || nearestBranch.city || form.district,
    });
  };

  const loadNearbyBranchesForCoordinates = async (latitude: number, longitude: number, sourceLabel?: string) => {
    const requestId = ++nearbyBranchRequestRef.current;
    setNearbyBranchState("loading");
    setNearbyBranchMessage("");

    try {
      const matches = await api.searchNearbyBranches({ lat: latitude, lng: longitude });
      if (requestId !== nearbyBranchRequestRef.current) return;
      applyNearbyBranches(matches, sourceLabel);
    } catch {
      if (requestId !== nearbyBranchRequestRef.current) return;
      setNearbyBranches([]);
      setNearbyBranchState("error");
      setNearbyBranchMessage("Unable to fetch nearby branches right now.");
    }
  };

  const resolvePlaceSuggestions = async (query: string) => {
    const backendSuggestions = await api.getPlaceSuggestions(query);
    if (backendSuggestions.length > 0) {
      return backendSuggestions;
    }

    try {
      const googleSuggestions = await getGooglePlaceSuggestions(query);
      return googleSuggestions.map((suggestion) => ({
        description: suggestion.description,
        placeId: suggestion.placeId,
        lat: "lat" in suggestion ? (suggestion as PlaceSuggestionRecord).lat : undefined,
        lng: "lng" in suggestion ? (suggestion as PlaceSuggestionRecord).lng : undefined,
        district: "district" in suggestion ? (suggestion as PlaceSuggestionRecord).district : undefined,
        state: "state" in suggestion ? (suggestion as PlaceSuggestionRecord).state : undefined,
      }));
    } catch {
      return [];
    }
  };

  const resolvePlaceGeocode = async (query: string) => {
    const backendResult = await api.geocodePlace(query);
    if (hasValidCoordinate(backendResult?.lat) && hasValidCoordinate(backendResult?.lng)) {
      return backendResult;
    }

    try {
      const googleResult = await geocodeGoogleAddress(query);
      if (googleResult && (hasValidCoordinate(googleResult.lat) || hasValidCoordinate(googleResult.lng) || googleResult.district || googleResult.label)) {
        return {
          lat: googleResult.lat,
          lng: googleResult.lng,
          district: googleResult.district,
          label: googleResult.label,
        };
      }
    } catch {
      // Ignore browser geocode failures and keep the backend result/fallback path.
    }

    return backendResult;
  };

  const handleLocationSuggestionSelect = async (suggestion: PlaceSuggestionRecord) => {
    const description = normalizeOptionalString(suggestion.description);
    if (!description) return;

    const parsed = parseLocationSuggestion(description);
    let resolvedLocation = parsed.location || description;
    let resolvedDistrict = suggestion.district || parsed.district || form.district;
    setShowLocationSuggestions(false);
    setLocationSuggestions([]);

    let latitude = suggestion.lat;
    let longitude = suggestion.lng;

    if (!hasValidCoordinate(latitude) || !hasValidCoordinate(longitude)) {
      const geocoded = await resolvePlaceGeocode(description);
      if (geocoded?.label) {
        const parsedGeocoded = parseLocationSuggestion(geocoded.label);
        resolvedLocation = parsedGeocoded.location || resolvedLocation;
      }
      if (geocoded?.district) {
        resolvedDistrict = geocoded.district;
      }
      latitude = geocoded?.lat;
      longitude = geocoded?.lng;
    }

    setFields({
      location: resolvedLocation,
      district: resolvedDistrict,
    });

    if (hasValidCoordinate(latitude) && hasValidCoordinate(longitude)) {
      await loadNearbyBranchesForCoordinates(latitude, longitude, description);
      return;
    }

    setNearbyBranchState("loading");
    setNearbyBranchMessage("");
    try {
      applyNearbyBranches(await api.searchNearbyBranches(description), description);
    } catch {
      setNearbyBranches([]);
      setNearbyBranchState("error");
      setNearbyBranchMessage("Unable to fetch nearby branches right now.");
    }
  };

  const handleLocationInputChange = (value: string) => {
    set("location", value);
    setNearbyBranches([]);
    setNearbyBranchState("idle");
    setNearbyBranchMessage("");

    const trimmedValue = normalizeOptionalString(value);
    if (trimmedValue.length < 2) {
      locationSuggestionRequestRef.current += 1;
      setLocationSuggestionLoading(false);
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    const requestId = ++locationSuggestionRequestRef.current;
    setLocationSuggestionLoading(true);

    void resolvePlaceSuggestions(trimmedValue)
      .then((suggestions) => {
        if (requestId !== locationSuggestionRequestRef.current) return;
        setLocationSuggestions(suggestions);
        setShowLocationSuggestions(suggestions.length > 0);
      })
      .catch(() => {
        if (requestId !== locationSuggestionRequestRef.current) return;
        setLocationSuggestions([]);
        setShowLocationSuggestions(false);
      })
      .finally(() => {
        if (requestId !== locationSuggestionRequestRef.current) return;
        setLocationSuggestionLoading(false);
      });
  };

  const handleLocationSearch = async () => {
    const searchText = [normalizeOptionalString(form.location), normalizeOptionalString(form.district)]
      .filter(Boolean)
      .join(", ");
    if (!searchText) {
      toast.error("Enter a location first");
      return;
    }

    setShowLocationSuggestions(false);
    setLocationSuggestions([]);
    setNearbyBranchState("loading");
    setNearbyBranchMessage("");

    try {
      const geocoded = await resolvePlaceGeocode(searchText);
      if (hasValidCoordinate(geocoded?.lat) && hasValidCoordinate(geocoded?.lng)) {
        setFields({
          location: form.location || geocoded?.label || searchText,
          district: geocoded?.district || form.district,
        });
        await loadNearbyBranchesForCoordinates(geocoded.lat, geocoded.lng, searchText);
        return;
      }

      applyNearbyBranches(await api.searchNearbyBranches(searchText), searchText);
    } catch {
      setNearbyBranches([]);
      setNearbyBranchState("error");
      setNearbyBranchMessage("Unable to fetch nearby branches right now.");
    }
  };

  const handleLocationKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();

    if (showLocationSuggestions && locationSuggestions.length > 0) {
      void handleLocationSuggestionSelect(locationSuggestions[0]);
      return;
    }

    void handleLocationSearch();
  };

  const clearLocationSearch = () => {
    locationSuggestionRequestRef.current += 1;
    setLocationSuggestionLoading(false);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    setNearbyBranches([]);
    setNearbyBranchState("idle");
    setNearbyBranchMessage("");
    setFields({
      location: "",
      district: "",
      assignedBranch: "",
    });
  };

  const updateMaskedAlternateNumber = (input: HTMLInputElement, nextValue: string, nextCursor: number) => {
    const sanitizedValue = nextValue.replace(/\D/g, "").slice(0, MAX_ALT_PHONE_LENGTH);
    const safeCursor = Math.max(0, Math.min(nextCursor, sanitizedValue.length));
    markDraftChanged();
    setForm((prev) => ({ ...prev, mob2: sanitizedValue }));
    window.requestAnimationFrame(() => {
      input.setSelectionRange(safeCursor, safeCursor);
    });
  };

  const handleMaskedAlternateNumberKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isAgentUser) return;

    const input = event.currentTarget;
    const currentValue = form.mob2;
    const selectionStart = input.selectionStart ?? currentValue.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;

    if (
      event.key === "Tab" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (selectionStart !== selectionEnd) {
        updateMaskedAlternateNumber(
          input,
          currentValue.slice(0, selectionStart) + currentValue.slice(selectionEnd),
          selectionStart,
        );
        return;
      }
      if (selectionStart === 0) return;
      updateMaskedAlternateNumber(
        input,
        currentValue.slice(0, selectionStart - 1) + currentValue.slice(selectionEnd),
        selectionStart - 1,
      );
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      if (selectionStart !== selectionEnd) {
        updateMaskedAlternateNumber(
          input,
          currentValue.slice(0, selectionStart) + currentValue.slice(selectionEnd),
          selectionStart,
        );
        return;
      }
      if (selectionStart >= currentValue.length) return;
      updateMaskedAlternateNumber(
        input,
        currentValue.slice(0, selectionStart) + currentValue.slice(selectionStart + 1),
        selectionStart,
      );
      return;
    }

    if (event.key.length !== 1) {
      return;
    }

    event.preventDefault();
    const nextDigit = event.key.replace(/\D/g, "");
    if (!nextDigit) return;
    updateMaskedAlternateNumber(
      input,
      currentValue.slice(0, selectionStart) + nextDigit + currentValue.slice(selectionEnd),
      selectionStart + nextDigit.length,
    );
  };

  const handleMaskedAlternateNumberPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!isAgentUser) return;

    event.preventDefault();
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pastedDigits) return;

    const input = event.currentTarget;
    const selectionStart = input.selectionStart ?? form.mob2.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    updateMaskedAlternateNumber(
      input,
      form.mob2.slice(0, selectionStart) + pastedDigits + form.mob2.slice(selectionEnd),
      selectionStart + pastedDigits.length,
    );
  };

  const addRemark = () => {
    if (form.remarks.length >= 15) { toast.error("Maximum 15 remarks"); return; }
    markDraftChanged();
    setForm(p => ({ ...p, remarks: [...p.remarks, ""] }));
  };

  const updateRemark = (idx: number, val: string) => {
    markDraftChanged();
    setForm(p => ({ ...p, remarks: p.remarks.map((r, i) => i === idx ? val : r) }));
  };

  const handleFollowUpActionChange = (value: FollowUpAction) => {
    markDraftChanged();
    setForm((prev) => ({
      ...prev,
      followUpAction: value,
      statusFollowUpAt: value === "schedule" ? prev.statusFollowUpAt : "",
      statusFollowUpDate: value === "schedule" ? prev.statusFollowUpDate : "",
      statusFollowUpHour: value === "schedule" ? prev.statusFollowUpHour : "",
      statusFollowUpMinute: value === "schedule" ? prev.statusFollowUpMinute : "",
      statusFollowUpPeriod: value === "schedule" ? prev.statusFollowUpPeriod : "",
    }));
    if (value === "schedule") {
      window.setTimeout(() => statusFollowUpInputRef.current?.focus(), 0);
    }
  };

  const handleStatusFollowUpScheduleChange = (
    field: "statusFollowUpDate" | "statusFollowUpHour" | "statusFollowUpMinute" | "statusFollowUpPeriod",
    value: string,
  ) => {
    markDraftChanged();
    setForm((prev) => {
      const next = {
        ...prev,
        followUpAction: "schedule" as FollowUpAction,
        [field]: value,
      };

      return {
        ...next,
        statusFollowUpAt: buildFollowUpDateTimeValue(next),
      };
    });
  };

  const handleStatusFollowUpQuickDate = (offsetDays: number) => {
    handleStatusFollowUpScheduleChange("statusFollowUpDate", getLocalDateKeyFromToday(offsetDays));
  };

  const handleFollowUpButtonClick = () => {
    if (!shouldShowFollowUpControls) {
      const nextAction: FollowUpAction = dueTodayFollowUpsForPhone.length > 0 ? "call-done" : "schedule";
      handleFollowUpActionChange(nextAction);
      if (nextAction === "call-done") {
        window.setTimeout(() => followUpActionRef.current?.focus(), 0);
      }
      return;
    }
    if (effectiveFollowUpAction === "schedule") {
      statusFollowUpInputRef.current?.focus();
      return;
    }
    followUpActionRef.current?.focus();
  };

  const handleSendSMS = async () => {
    if (!form.mob1 || !form.assignedBranch) { toast.error("Need mobile and branch"); return; }
    setSmsSending(true);
    const selectedBranchName = normalizeOptionalString(form.assignedBranch).toLowerCase();
    const branch = selectableBranches.find((candidate) => (
      normalizeOptionalString(candidate.name).toLowerCase() === selectedBranchName ||
      normalizeOptionalString(candidate.id).toLowerCase() === selectedBranchName
    ));
    if (!branch) { toast.error("Branch not found"); setSmsSending(false); return; }
    const result = await api.sendSMS(form.mob1, branch.id);
    setSmsSending(false);
    if (result.success) { markDraftChanged(); setSmsSent(true); toast.success("Location SMS sent to " + (isAgentUser ? hidePhoneDisplay(form.mob1) : form.mob1)); }
    else toast.error("SMS failed");
  };

  const handleOpenBranchMap = () => {
    if (!selectedBranchMapUrl) {
      toast.error("Map URL is unavailable for the selected branch");
      return;
    }

    const openedWindow = window.open(selectedBranchMapUrl, "_blank", "noopener,noreferrer");
    if (!openedWindow) {
      toast.error("Unable to open the branch map");
    }
  };

  const handleCopyBranchMap = async () => {
    if (!selectedBranchMapUrl) {
      toast.error("Map URL is unavailable for the selected branch");
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedBranchMapUrl);
      toast.success("Branch map URL copied");
    } catch {
      toast.error("Unable to copy the branch map URL");
    }
  };

  const handleSendWhatsAppLocation = () => {
    if (!normalizedPrimaryPhone || !selectedBranchMapUrl) {
      toast.error("Need a customer mobile number and branch location");
      return;
    }
    const message = `Attica Gold ${form.assignedBranch} branch location: ${selectedBranchMapUrl}`;
    const openedWindow = window.open(
      `https://wa.me/91${normalizedPrimaryPhone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
    if (!openedWindow) toast.error("Unable to open WhatsApp");
  };

  const handleSave = async (options?: SaveCustomerDetailsOptions) => {
    if (isReleaseCase && (!form.pledgePlace || (isOtherPledgePlace && !form.otherPledgePlace.trim()))) {
      if (!options?.suppressFailureToast) toast.error(isOtherPledgePlace ? "Enter the other pledge place" : "Select a pledge place");
      return false;
    }
    if (postCallIntake.workflow) {
      const saved = await postCallIntake.submit();
      if (!saved && !options?.autoRetry) toast.error("Pending Server Save. Your entered details are retained.");
      return saved;
    }
    if (isAgentUser && safeCallId && !postCallIntake.ready) return false;
    const closeOnSuccess = options?.closeOnSuccess ?? true;
    const isAutoRetry = options?.autoRetry === true;
    const shouldSuppressFailureToast = options?.suppressFailureToast === true;
    const shouldSuppressSuccessToast = options?.suppressSuccessToast === true;
    const shouldShowFailureToast = !shouldSuppressFailureToast && !isAutoRetry;

    if (saving || saveInFlightRef.current) return false;
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    if (!disposition) {
      if (shouldShowFailureToast) {
        toast.error("Select a call disposition");
      }
      return false;
    }
    if (effectiveFollowUpAction === "schedule" && !form.statusFollowUpAt) {
      if (shouldShowFailureToast) {
        toast.error("Enter follow-up date and time to schedule the auto call");
      }
      return false;
    }

    const parsedStatusFollowUpAt = form.statusFollowUpAt ? new Date(form.statusFollowUpAt) : null;
    if (form.statusFollowUpAt && (!parsedStatusFollowUpAt || Number.isNaN(parsedStatusFollowUpAt.getTime()))) {
      if (shouldShowFailureToast) {
        toast.error("Enter a valid follow-up call time");
      }
      return false;
    }
    const expectedPrimaryPhone = normalizePhoneNumber(safePhone);
    if (isAgentUser && expectedPrimaryPhone && normalizedPrimaryPhone !== expectedPrimaryPhone) {
      autoFilledFieldValuesRef.current = {};
      setDisposition("");
      setForm(buildInitialFormData({
        phone: expectedPrimaryPhone,
        customerName: safeCustomerName,
        language: safeLanguage,
        businessType: safeBusinessType,
        purpose: safePurpose,
      }));
      setHasUserDraftChanges(false);
      if (shouldShowFailureToast) {
        toast.error("Call form was refreshed for the current customer. Please review and save again.");
      }
      return false;
    }
    const shouldScheduleFollowUp = effectiveFollowUpAction === "schedule" && Boolean(parsedStatusFollowUpAt);
    const shouldUseStatusFollowUpQueue = shouldScheduleFollowUp && isStatusFollowUpAutoDialStatus(form.status);

    const remarks = form.remarks.filter((remark) => remark.trim());
    const notes = [
      ...remarks,
      effectiveFollowUpAction === "call-done"
        ? "Follow-up CX marked as call done"
        : "",
      shouldScheduleFollowUp && parsedStatusFollowUpAt
        ? `Auto call scheduled for: ${parsedStatusFollowUpAt.toLocaleString("en-IN")}`
        : "",
    ].filter(Boolean).join(" | ");
    const saveCallId = safeCallId || resolvedCallId || buildGeneratedIntakeCallId();
    const saveIntakeToken = intakeToken || buildGeneratedIntakeToken({
      callId: saveCallId,
      direction: safeDirection,
      phone: normalizedPrimaryPhone || safePhone,
    });
    const draftFingerprint = buildDraftFingerprint(saveCallId, saveIntakeToken);
    if (saveCallId !== resolvedCallId) {
      setResolvedCallId(saveCallId);
    }
    if (saveIntakeToken !== intakeToken) {
      setIntakeToken(saveIntakeToken);
    }
    const existingCall = getCurrentCall({ callId: saveCallId, intakeToken: saveIntakeToken })
      || (liveCallSnapshot && (liveCallSnapshot.id === saveCallId || liveCallSnapshot.intakeToken === saveIntakeToken)
        ? liveCallSnapshot
        : null);
    const liveCallState = getLiveCallSnapshot(saveCallId);
    const finalizedCallSnapshot = getFinalizedCallSnapshot(saveCallId);
    const needsCompletedWrapUp = callPhase !== "connected" && ["active", "on-hold"].includes(existingCall?.status || "");
    const resolvedCustomerName = getMeaningfulCustomerName(
      form.name,
      existingCall?.displayCustomerName,
      existingCall?.customerName,
      existingCall?.callerName,
    );
    const resolvedStatus = finalizedCallSnapshot?.status
      || liveCallState?.status
      || (needsCompletedWrapUp ? "completed" : (existingCall?.status || (callPhase === "connected" ? "active" : "completed")));
    const resolvedDuration = finalizedCallSnapshot?.duration
      || liveCallState?.duration
      || (needsCompletedWrapUp
        ? getLongerCallDuration(normalizeCallDuration(existingCall?.duration), "00:01")
        : normalizeCallDuration(existingCall?.duration, "00:00"));
    const resolvedRingStartedAt = finalizedCallSnapshot?.ringStartedAt || liveCallState?.ringStartedAt || existingCall?.ringStartedAt || "";
    const resolvedAnsweredAt = finalizedCallSnapshot?.answeredAt || liveCallState?.answeredAt || existingCall?.answeredAt || "";
    const resolvedEndedAt = finalizedCallSnapshot?.endedAt || liveCallState?.endedAt || existingCall?.endedAt || "";
    const resolvedTalkDurationSeconds = Math.max(
      Number(finalizedCallSnapshot?.talkDurationSeconds) || 0,
      Number(liveCallState?.talkDurationSeconds) || 0,
      Number(existingCall?.talkDurationSeconds) || 0,
    );
    const resolvedCreatedAt = resolvedAnsweredAt || resolvedRingStartedAt || resolvedEndedAt || existingCall?.createdAt || new Date().toISOString();
    const resolvedDate = getCallDisplayDate({
      answeredAt: resolvedAnsweredAt,
      ringStartedAt: resolvedRingStartedAt,
      endedAt: resolvedEndedAt,
      createdAt: resolvedCreatedAt,
      date: existingCall?.date || form.date,
      time: existingCall?.time || "",
    }) || form.date;
    const resolvedTime = getCallDisplayTime({
      answeredAt: resolvedAnsweredAt,
      ringStartedAt: resolvedRingStartedAt,
      endedAt: resolvedEndedAt,
      createdAt: resolvedCreatedAt,
      date: resolvedDate,
      time: existingCall?.time || "",
    }) || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const callWasConnected = hasCustomerConnection({
      status: resolvedStatus,
      answeredAt: resolvedAnsweredAt,
    });
    const normalizedAge = normalizeAgeValue(form.age);
    const normalizedGender = normalizeGenderValue(form.gender);
    const resolvedAge = callWasConnected ? normalizedAge : (normalizedAge || DEMOGRAPHIC_NA_VALUE);
    const resolvedGender = callWasConnected ? normalizedGender : (normalizedGender || DEMOGRAPHIC_NA_VALUE);

    saveInFlightRef.current = true;
    setSaving(true);
    markIntakeSaveStarted();

    try {
      const callData: ManagedCall = {
        id: saveCallId,
        intakeToken: saveIntakeToken,
        callerId: normalizedPrimaryPhone,
        callerName: resolvedCustomerName,
        customerName: resolvedCustomerName,
        displayCustomerName: resolvedCustomerName,
        agentId: user?.id || "",
        agentName: user?.name || "",
        direction: existingCall?.direction || safeDirection,
        status: resolvedStatus,
        duration: resolvedDuration,
        ringStartedAt: resolvedRingStartedAt,
        answeredAt: resolvedAnsweredAt,
        endedAt: resolvedEndedAt,
        talkDurationSeconds: resolvedTalkDurationSeconds,
        time: resolvedTime,
        date: resolvedDate,
        language: form.language,
        hasRecording: existingCall?.hasRecording ?? true,
        branch: form.assignedBranch,
        place: form.location,
        purpose: form.purpose,
        callbackStatus: disposition,
        followUpFlag: shouldScheduleFollowUp,
        quickNote: form.quickNote,
        notes,
        smsSent: smsSent,
        statusFollowUpAt: shouldScheduleFollowUp && parsedStatusFollowUpAt ? parsedStatusFollowUpAt.toISOString() : "",
        leadSource: existingCall?.leadSource || "",
        carrierTrunk: existingCall?.carrierTrunk || "",
        trunkCode: existingCall?.trunkCode || "",
        pilot: existingCall?.pilot || "",
        didOrCli: existingCall?.didOrCli || "",
        createdAt: resolvedCreatedAt,
        // Extended fields
        mob2: form.mob2,
        age: resolvedAge,
        gender: resolvedGender,
        district: form.district,
        businessType: form.businessType,
        metalType: form.metalType,
        grams: form.grams,
        releaseGrossAmount: effectiveReleaseGrossAmount,
        releasingAmount: form.releasingAmount,
        pledgePlace: isReleaseCase ? form.pledgePlace : "",
        otherPledgePlace: isReleaseCase && isOtherPledgePlace ? form.otherPledgePlace : "",
        differenceAmount: effectiveReleaseGrossAmount,
        bankName: "",
        onlinePrice: form.onlinePrice,
        pricePerGram: form.pricePerGram,
        advertisement: form.advertisement,
        lead: form.lead || existingCall?.lead || existingCall?.leadSource || "",
        formStatus: form.status,
        dataFillingStartedAt: new Date(formOpenedAtRef.current).toISOString(),
        dataFillingDurationSeconds,
      };

      const saveResult = await api.saveCallWithResult(callData);
      if (!saveResult.success) {
        const finalSaveError = normalizeOptionalString(saveResult.error) || "Unable to save the customer details to the server";
        console.error("Final customer save failed:", {
          error: finalSaveError,
          status: saveResult.status,
          stage: saveResult.stage,
          code: saveResult.code,
          callId: saveCallId,
          intakeToken: saveIntakeToken,
          agentId: user?.id || "",
        });

        cacheDraftLocally(saveCallId, saveIntakeToken, {
          finalSaveState: "local-only",
          finalSaveError,
        });
        if (saveResult.code === "CALL_SAVE_LOCK_TIMEOUT") {
          if (shouldShowFailureToast) {
            toast.error("Save is still processing. Please retry in a few seconds.");
          }
          return false;
        }
        const fallbackDraftResult = await api.saveIntakeFormWithResult(callData);
        if (fallbackDraftResult.success) {
          const savedAt = new Date().toISOString();
          cacheDraftLocally(saveCallId, saveIntakeToken, {
            finalSaveState: "server-draft-only",
            finalSaveError,
            serverSavedAt: savedAt,
          });
          markDraftServerSynced(draftFingerprint, {
            state: "server-draft-only",
            finalSaveError,
            savedAt,
          });
          if (showDraftCloseButton && onClose && callPhase !== "connected" && closeOnSuccess) {
            if (shouldShowFailureToast) {
              toast.error(`Final save failed on server: ${finalSaveError}. Draft saved to server only. Reopen to retry Save to Server.`);
            }
            markIntakeFormInactive();
            try {
              onClose();
            } catch (error) {
              console.error("Customer intake onClose handler failed after draft fallback:", error);
            }
            return false;
          }
          if (shouldShowFailureToast) {
            toast.error(`Final save failed on server: ${finalSaveError}. Draft saved to server only.`);
          }
          return false;
        }
        console.error("Fallback intake draft save failed after final save error:", {
          finalSaveError,
          fallbackError: fallbackDraftResult.error,
          fallbackStatus: fallbackDraftResult.status,
          fallbackStage: fallbackDraftResult.stage,
          fallbackCode: fallbackDraftResult.code,
          callId: saveCallId,
          intakeToken: saveIntakeToken,
        });
        setDraftSaveState("local-only");
        setLastFinalSaveError(finalSaveError);
        setHasUserDraftChanges(false);
        if (shouldShowFailureToast) {
          toast.error(`Saved locally only. Final server save failed: ${finalSaveError}`);
        }
        return false;
      }

      try {
        syncCallRecord(callData);
      } catch (error) {
        console.error("Failed to sync local call record after save:", error);
      }

      if (dueTodayFollowUpsForPhone.length > 0 && normalizedPrimaryPhone && effectiveFollowUpAction !== "none") {
        try {
          closePendingFollowUpsForPhone({
            phone: normalizedPrimaryPhone,
            throughDate: todayDateKey,
            outcome: shouldScheduleFollowUp && parsedStatusFollowUpAt
              ? `Rescheduled from intake form to ${parsedStatusFollowUpAt.toLocaleString("en-IN")}`
              : "Call done from intake form",
          });
        } catch (error) {
          console.error("Failed to close local follow-ups after save:", error);
        }
      }
      if (shouldScheduleFollowUp && parsedStatusFollowUpAt && normalizedPrimaryPhone && !shouldUseStatusFollowUpQueue) {
        try {
          addFollowUp({
            customerName: resolvedCustomerName,
            phone: normalizedPrimaryPhone,
            branch: form.assignedBranch,
            followUpAt: parsedStatusFollowUpAt.toISOString(),
            notes: notes || "Follow-up scheduled from intake form",
            callId: saveCallId,
            sourceCallId: saveCallId,
            sourceStatus: form.status,
          });
        } catch (error) {
          console.error("Failed to add local follow-up after save:", error);
        }
      }

      clearIntakeDraft([draftStorageKey, phoneDraftStorageKey].filter(Boolean));
      setDraftSaveState("saved");
      setLastDraftSavedAt(new Date().toISOString());
      setLastFinalSaveError("");
      setHasUserDraftChanges(false);
      if (normalizedPrimaryPhone) {
        void api.clearTransferContext({ phone: normalizedPrimaryPhone, sourceCallId: saveCallId });
      }
      if (!shouldSuppressSuccessToast) {
        toast.success("Saved to server");
      }
      if (closeOnSuccess) {
        markIntakeFormInactive();
      }
      try {
        onSave?.(callData);
      } catch (error) {
        console.error("Customer intake onSave handler failed:", error);
      }
      if (closeOnSuccess) {
        try {
          onClose?.();
        } catch (error) {
          console.error("Customer intake onClose handler failed:", error);
        }
      }
      return true;
    } catch (error) {
      console.error("Failed to save intake form:", error);
      if (shouldShowFailureToast) {
        toast.error(error instanceof Error ? error.message : "Failed to save customer details");
      }
      return false;
    } finally {
      saveInFlightRef.current = false;
      markIntakeSaveFinished();
      setSaving(false);
    }
  };
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (!hasPendingFinalSave) {
      pendingFinalSaveAutoRetryAttemptedRef.current = false;
      return;
    }
    if (pendingFinalSaveAutoRetryAttemptedRef.current) {
      return;
    }

    pendingFinalSaveAutoRetryAttemptedRef.current = true;
    const timeout = window.setTimeout(() => {
      if (typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine === false) {
        return;
      }
      void handleSaveRef.current?.({
        autoRetry: true,
        closeOnSuccess: false,
        suppressFailureToast: true,
      });
    }, 1250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [hasPendingFinalSave]);

  useEffect(() => {
    if (!hasPendingFinalSave) {
      return;
    }

    const handleOnline = () => {
      void handleSaveRef.current?.({
        autoRetry: true,
        closeOnSuccess: false,
        suppressFailureToast: true,
      });
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [hasPendingFinalSave]);

  const handleCloseForm = () => {
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    if (hasPendingFinalSave || draftSaveState === "error") {
      persistIntakeDraft([draftStorageKey, phoneDraftStorageKey].filter(Boolean), buildDraftPersistencePayload());
    } else {
      clearIntakeDraft([draftStorageKey, phoneDraftStorageKey].filter(Boolean));
    }
    markIntakeFormInactive();
    onClose?.();
  };

  const handleCloseAsDraft = useCallback(async (options?: { notify?: boolean }) => {
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    const draftSaved = await autoSaveDraft("blur");
    markIntakeFormInactive();
    if (options?.notify) {
      toast.info(
        draftSaved
          ? "Customer disconnected. Draft saved and wrap-up closed."
          : "Customer disconnected. Wrap-up closed.",
      );
    }
    onClose?.();
  }, [autoSaveDraft, onClose]);

  useEffect(() => {
    // Transfer agents are only needed while the transfer picker is visible.
    // Refreshing this list every 10 seconds for every connected intake form
    // created a large /live-agents request storm and made the panel sluggish.
    if (callPhase !== "connected" || !transferCurrentCall || !showTransferDialog) {
      setAvailableTransferAgents([]);
      setTransferExt("");
      setTransferLoading(false);
      return;
    }

    let cancelled = false;
    const sourceStatus = getIntakeTransferSourceStatus(safeDirection, agentStatus);
    const sourceLanguage = normalizeOptionalString(form.language || safeLanguage);

    const loadTransferAgents = async () => {
      setTransferLoading(true);
      const liveAgents = await api.getLiveAgents().catch(() => []);
      if (cancelled) return;

      const nextAgents = sortTransferAgents((Array.isArray(liveAgents) ? liveAgents : []).filter((agent) => (
        canReceiveTransferredCalls({
          status: agent.status,
          workMode: agent.workMode,
          sourceStatus,
          activeCalls: agent.activeCalls,
          sipStatus: agent.sipStatus,
          isLoggedIn: agent.isLoggedIn,
          queuePaused: agent.queuePaused,
          onBreak: agent.onBreak,
          languages: agent.languages,
          sourceLanguage,
        })
        && normalizeOptionalString(agent.extension)
        && agent.agentId !== user?.id
      )));

      setAvailableTransferAgents(nextAgents);
      setTransferExt((current) => (
        current && nextAgents.some((agent) => normalizeOptionalString(agent.extension) === current)
          ? current
          : normalizeOptionalString(nextAgents[0]?.extension)
      ));
      setTransferLoading(false);
    };

    void loadTransferAgents();
    const interval = window.setInterval(() => {
      void loadTransferAgents();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [agentStatus, callPhase, form.language, safeDirection, safeLanguage, showTransferDialog, transferCurrentCall, user?.id]);

  const handleTransferCall = async () => {
    if (!transferCurrentCall) {
      toast.error("Transfer is not available in this call window");
      return;
    }
    const selectedExtension = normalizeOptionalString(transferExt);
    if (!selectedExtension) {
      toast.error("Select an agent to transfer the call");
      return;
    }

    const selectedAgent = availableTransferAgents.find((agent) => normalizeOptionalString(agent.extension) === selectedExtension);
    setTransferSubmitting(true);
    const transferred = await transferCurrentCall(
      selectedExtension,
      selectedAgent?.agentName || selectedAgent?.agentId || selectedExtension,
      {
        phone: normalizedPrimaryPhone || safePhone,
        language: form.language || safeLanguage,
        businessType: form.businessType || safeBusinessType,
        purpose: form.purpose || safePurpose,
      },
    );
    setTransferSubmitting(false);

    if (transferred) {
      setTransferExt("");
      setShowTransferDialog(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!disposition) {
      toast.error("Select a call disposition");
      return;
    }
    const saved = await handleSave({ closeOnSuccess: true });
    if (saved) setShowDispositionDialog(false);
  };

  const callHasEnded = Boolean(postCallIntake.workflow?.confirmedEndedAt || callEndedAt);
  const hasCustomerDetails = Boolean(
    normalizeOptionalString(form.mob1)
      && normalizeOptionalString(form.name)
      && normalizeOptionalString(form.purpose)
      && normalizeOptionalString(form.businessType),
  );
  const hasCalculationDetails = Boolean(
    normalizeOptionalString(form.metalType)
      && Number.parseFloat(form.grams) > 0
      && Number.parseFloat(form.onlinePrice) > 0
      && Number.parseFloat(form.estimatedPurity) > 0,
  );
  const hasScheduleDetails = effectiveFollowUpAction !== "schedule" || Boolean(form.statusFollowUpAt);
  const procedureCurrentStep = postCallIntake.workflow?.submittedAt
    ? INTAKE_PROCEDURE_STEPS.length - 1
    : (showDispositionDialog || Boolean(postCallIntake.workflow?.dispositionSelectedAt) || Boolean(disposition))
      ? INTAKE_PROCEDURE_STEPS.indexOf("Disposition")
      : callHasEnded
        ? INTAKE_PROCEDURE_STEPS.indexOf("Submit")
        : callPhase !== "connected"
          ? INTAKE_PROCEDURE_STEPS.indexOf("Connected")
          : !hasCustomerDetails
            ? INTAKE_PROCEDURE_STEPS.indexOf("Customer Details")
            : !hasCalculationDetails
              ? INTAKE_PROCEDURE_STEPS.indexOf("Calculations")
              : !hasScheduleDetails
                ? INTAKE_PROCEDURE_STEPS.indexOf("Schedule / Remarks")
                : INTAKE_PROCEDURE_STEPS.indexOf("Call Ended");

  const procedureCompletedThrough = postCallIntake.workflow?.submittedAt
    ? INTAKE_PROCEDURE_STEPS.length - 1
    : Math.max(0, procedureCurrentStep - (callHasEnded || showDispositionDialog || Boolean(disposition) ? 1 : 0));

  const normalizedConferenceNumber = normalizePhoneNumber(conferenceNumber);
  const canStartConferenceCall = normalizedConferenceNumber.length === 10 && callPhase === "connected" && !conferenceCalling;
  const historyRecords = priorCustomerHistory.length > 0 ? priorCustomerHistory : filteredCustomerHistory;
  const nextCallLabel = form.statusFollowUpAt && Number.isFinite(Date.parse(form.statusFollowUpAt))
    ? new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(form.statusFollowUpAt))
    : "Not scheduled";

  const handleConferenceCall = async () => {
    if (!canStartConferenceCall) {
      toast.error("Enter a valid 10-digit number for conference call");
      return;
    }

    setConferenceCalling(true);
    const started = await startConferenceCall(normalizedConferenceNumber);
    setConferenceCalling(false);
    if (started) {
      setConferenceNumber("");
    }
  };

  return (
    <div
      data-testid="intake-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      className={inline ? "agent-form-inline flex h-full min-h-0 w-full items-center justify-center" : "agent-form-overlay fixed inset-0 z-50 flex h-[100dvh] items-center justify-center overflow-hidden bg-black/50 backdrop-blur-sm"}
    >
      <motion.div
        role="dialog"
        aria-modal={!inline}
        aria-labelledby="customer-intake-title"
        onBlurCapture={handleFormBlur}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        initial={false}
        animate={{ opacity: 1, scale: 1 }}
        className="agent-form-shell relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-2xl text-sm max-md:rounded-none"
      >
        <header className="grid shrink-0 grid-cols-[auto_minmax(240px,1fr)_auto] items-center gap-3 border-b border-border bg-card px-3 py-2 max-md:grid-cols-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id="customer-intake-title" className="text-sm font-semibold tracking-tight">Customer Intake Form</h2>
              <p className={`min-h-3 truncate text-[10px] ${draftSaveState === "error" || draftSaveState === "local-only" ? "text-destructive" : "text-muted-foreground"}`}>{getDraftStatusLabel()}</p>
            </div>
          </div>
          <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Admin Message</span>
            <input
              value={adminMessage}
              readOnly
              placeholder="No message from administrator"
              className="control-field min-h-8 min-w-0 bg-muted/40 px-2 py-1.5 text-sm"
              data-testid="admin-message"
            />
          </label>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <div className="text-right">
              <p className="text-xs font-semibold">{callModeLabel}</p>
              {localCallMatch?.leadSource ? <p className="text-[10px] font-medium text-muted-foreground">Source: {localCallMatch.leadSource}</p> : null}
              <p className="text-[10px] text-muted-foreground">
                {new Intl.DateTimeFormat("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                }).format(new Date())}
              </p>
            </div>
            {onClose && showCloseButton && !postCallIntake.workflow ? (
              <button type="button" onClick={handleCloseForm} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={closeLabel}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </header>

        <div className="agent-intake-content flex min-h-0 flex-1 flex-col overflow-hidden">
        <section className="mx-3 mt-1.5 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2 max-md:grid-cols-1" aria-label="Live call status" data-testid="call-status-bar">
          <div className={callPhase === "connected" && !postCallIntake.workflow?.confirmedEndedAt ? "text-green-700" : "text-amber-700"}>
            <p className="call-status-label text-[9px] font-semibold uppercase tracking-[0.18em]">Call Status</p>
            <p className="call-status-value text-sm font-bold">{callPhase === "connected" && !postCallIntake.workflow?.confirmedEndedAt ? "CALL ACTIVE" : "CALL ENDED"}</p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
            <div className="bg-card px-2 py-1">
              <p className="timing-label text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Total Call Connected</p>
              <p className="timing-value font-mono text-sm font-semibold tabular-nums">{callTalkTime}</p>
            </div>
            <div className="bg-card px-2 py-1">
              <p className="timing-label text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Total Data Filling Time</p>
              <p className="timing-value font-mono text-sm font-semibold tabular-nums">{dataFillingTime}</p>
            </div>
          </div>
          <div className="grid min-w-[270px] grid-cols-[1fr_120px] gap-2">
            <div className="min-w-0">
              <label className={labelClass}>Mobile</label>
              <p className="truncate font-mono text-sm font-semibold">{visiblePrimaryPhone || "—"}</p>
            </div>
            <div>
              <label className={labelClass}>Language {safeDirection === "incoming" && safeLanguage ? "· IVR" : ""}</label>
              <select value={form.language} onChange={(event) => set("language", event.target.value)} className={fieldClass}>
                <option value="">Select</option>
                {["Kannada", "Tamil", "Telugu", "Hindi", "English"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="mx-3 mt-1 shrink-0 overflow-hidden rounded-lg border border-border bg-card px-2 py-1" aria-label="Intake procedure" data-testid="intake-procedure-stepper">
          <ol className="flex min-w-max items-center gap-1 overflow-x-auto py-0.5" aria-label="Call and intake procedure steps">
            {INTAKE_PROCEDURE_STEPS.map((step, index) => {
              const isCurrent = index === procedureCurrentStep;
                  const isComplete = index < procedureCompletedThrough || Boolean(postCallIntake.workflow?.submittedAt);
              return (
                <li key={step} className="flex shrink-0 items-center gap-1" data-step-state={isComplete ? "complete" : isCurrent ? "current" : "upcoming"}>
                  <span
                    className={`procedure-step inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none transition ${isComplete ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : isCurrent ? "border-accent bg-accent/15 text-accent" : "border-border bg-muted/30 text-muted-foreground"}`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {isComplete ? "✓ " : ""}{step}
                  </span>
                  {index < INTAKE_PROCEDURE_STEPS.length - 1 ? <span className="procedure-arrow text-[10px] text-muted-foreground/60" aria-hidden="true">→</span> : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mx-3 mt-1.5 shrink-0 rounded-lg border border-border bg-muted/10 px-2.5 py-1.5" aria-labelledby="customer-information-heading">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <h3 id="customer-information-heading" className="text-xs font-semibold">Customer Information</h3>
              {customerHistoryLoading ? (
                <span className="truncate rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent" data-testid="customer-history-loading-indicator">
                  Checking customer history…
                </span>
              ) : historyRecords.length > 0 ? (
                <span className="truncate rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" data-testid="existing-customer-indicator">
                  ✓ Existing Customer · {historyRecords.length} previous {historyRecords.length === 1 ? "interaction" : "interactions"}{lastCustomerInteraction ? ` · Last contacted ${formatInteractionDateTime(lastCustomerInteraction)}` : ""}
                </span>
              ) : (
                <span className="truncate rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground" data-testid="new-customer-indicator">
                  New Customer · No previous interaction found
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">Draft auto-save: 700ms</span>
          </div>
          <div className="customer-row-1 grid grid-cols-2 gap-1.5 min-[900px]:grid-cols-[1.15fr_.85fr_1.05fr_1.05fr]">
            <div><label className={labelClass}>Customer Name</label>
              <input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Full name" className={fieldClass} />
            </div>
            <div><label className={labelClass}>Gender</label>
              <select value={form.gender} onChange={(event) => set("gender", event.target.value)} className={fieldClass}>
                <option value="">Select Gender</option>
                {GENDERS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Purpose of Call</label>
              <select value={form.purpose} onChange={(event) => set("purpose", event.target.value)} className={fieldClass}>
                <option value="">Select</option>
                {PURPOSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Business Type</label>
              <select value={form.businessType} onChange={(event) => set("businessType", event.target.value)} className={fieldClass}>
                <option value="">Select Type</option>
                {BUSINESS_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>
          <div className="customer-row-2 mt-1.5 grid grid-cols-2 gap-1.5 min-[900px]:grid-cols-[.9fr_1fr_1.6fr]">
            <div><label className={labelClass}>Mobile 2 / Alternate</label>
              <input
                value={visibleSecondaryPhone}
                onChange={isAgentUser ? () => {} : (event) => set("mob2", event.target.value)}
                onKeyDown={isAgentUser ? handleMaskedAlternateNumberKeyDown : undefined}
                onPaste={isAgentUser ? handleMaskedAlternateNumberPaste : undefined}
                placeholder="Alternate number"
                className={monoFieldClass}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div><label className={labelClass}>District</label>
              <input value={form.district} onChange={(event) => set("district", event.target.value)} placeholder="District" className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Location / Area</label>
              <div className="relative flex gap-1">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={form.location}
                    onChange={(event) => handleLocationInputChange(event.target.value)}
                    onKeyDown={handleLocationKeyDown}
                    onBlur={() => window.setTimeout(() => setShowLocationSuggestions(false), 150)}
                    onFocus={() => locationSuggestions.length > 0 && setShowLocationSuggestions(true)}
                    placeholder="Area / Locality"
                    className={`${fieldClass} pr-7`}
                  />
                  {form.location ? (
                    <button type="button" onClick={clearLocationSearch} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Clear location"><X className="h-3 w-3" /></button>
                  ) : null}
                  {showLocationSuggestions && locationSuggestions.length > 0 ? (
                    <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[280px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                      {locationSuggestions.map((suggestion) => (
                        <button key={`${suggestion.description}-${suggestion.lat ?? ""}-${suggestion.lng ?? ""}`} type="button" onMouseDown={() => { void handleLocationSuggestionSelect(suggestion); }} className="w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-muted/60 last:border-0">
                          {suggestion.description}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="button" onClick={() => { void handleLocationSearch(); }} className="action-outline min-h-8 shrink-0 px-1.5 text-[10px]" disabled={nearbyBranchState === "loading"} aria-label="Find nearby branches">
                  {nearbyBranchState === "loading" ? "..." : "Near"}
                </button>
              </div>
            </div>
          </div>
          {(locationLookupState === "loading" || locationLookupState === "found" || locationSuggestionLoading || nearbyBranchState !== "idle") ? (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {locationLookupState === "loading" ? "Checking saved customer details..." : null}
              {locationLookupState === "found" ? "Matched saved customer details. " : null}
              {locationSuggestionLoading ? "Searching locations..." : null}
              {nearbyBranchState !== "idle" ? nearbyBranchMessage : null}
            </p>
          ) : null}
        </section>

        <div className="agent-intake-body grid min-h-0 flex-1 content-start grid-rows-[auto_auto_auto] gap-1.5 overflow-hidden px-3 py-1.5" data-testid="intake-fixed-body">
          <div className="intake-middle h-full min-h-[max-content]">
          <ResizablePanelGroup direction={stackedLayout ? "vertical" : "horizontal"} className="h-full min-h-[max-content] rounded-lg border border-border">
            <ResizablePanel defaultSize={70} minSize={stackedLayout ? 42 : 40}>
              <section className="calculations-panel h-full min-h-[max-content] overflow-visible bg-card px-2.5 py-1.5" aria-labelledby="calculations-heading">
                <div className="mb-1.5 rounded-lg border border-accent/20 bg-accent/5 p-1.5" aria-labelledby="message-heading">
                  <div className="mb-1 flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5 text-accent" />
                    <h3 id="message-heading" className="text-xs font-semibold">Send Message</h3>
                  </div>
                  <div className="send-message-row grid grid-cols-[minmax(220px,1fr)_auto_auto_auto] items-center gap-1.5 max-lg:grid-cols-2">
                    <BranchSelector
                      value={form.assignedBranch}
                      onChange={(name) => set("assignedBranch", name)}
                      preferredBranches={nearbyBranches}
                      preferredLoading={nearbyBranchState === "loading"}
                      preferredLabel={nearbyBranchState === "ready" ? nearbyBranchMessage : ""}
                    />
                    <button type="button" onClick={handleSendSMS} disabled={smsSending || smsSent || !form.mob1 || !form.assignedBranch} className={smsSent ? "success-badge min-h-8 justify-center px-2 text-xs" : "action-gold min-h-8 justify-center px-2 text-xs"}>
                      <Send className="h-3.5 w-3.5" />{smsSent ? "SMS Sent" : smsSending ? "Sending..." : "Branch SMS"}
                    </button>
                    <button type="button" onClick={handleSendWhatsAppLocation} disabled={!normalizedPrimaryPhone || !selectedBranchMapUrl} className="action-outline min-h-8 justify-center px-2 text-xs">
                      <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                    </button>
                    <button type="button" onClick={handleOpenBranchMap} disabled={!selectedBranchMapUrl} className="action-outline min-h-8 justify-center px-2 text-xs">
                      <MapPin className="h-3.5 w-3.5" />Location
                    </button>
                  </div>
                </div>
                <div className="mb-1.5 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-accent" />
                  <h3 id="calculations-heading" className="text-sm font-semibold">Calculations</h3>
                </div>
                <div className="calculation-grid grid grid-cols-3 items-start gap-1.5 p-0.5 max-[720px]:grid-cols-2">
                  <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Metal Type</label>
                    <select value={form.metalType} onChange={(event) => set("metalType", event.target.value)} className={fieldClass}>
                      {METAL_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Grams</label>
                    <input type="number" value={form.grams} onChange={(event) => set("grams", event.target.value)} placeholder="0.00" className={monoFieldClass} />
                    {gramWeightGuide ? <p className="mt-1 text-[11px] text-muted-foreground">Gram Category: <span className="font-semibold text-foreground">{gramWeightGuide.classification}</span></p> : null}
                  </div>
                  <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Gold Rate ₹/g</label>
                    <input type="number" value={form.onlinePrice} onChange={(event) => set("onlinePrice", event.target.value)} placeholder="15000" className={monoFieldClass} />
                  </div>
                  <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Estimated Purity</label>
                    <input type="number" value={form.estimatedPurity} onChange={(event) => set("estimatedPurity", event.target.value)} placeholder="0.91" className={monoFieldClass} step="0.01" />
                  </div>
                  <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Gross Amount</label>
                    <input value={goldCalculation.grossAmountDisplay} readOnly className="control-field min-h-8 border-2 border-[hsl(var(--attica-gold-deep))] bg-[hsl(var(--attica-gold))] px-2 py-1.5 text-sm font-bold font-mono text-black" placeholder="0.00" />
                  </div>
                  {showReleaseGrossAmount ? (
                    <>
                      <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Pledge / Releasing Amount ₹</label>
                        <input type="number" value={form.releasingAmount} onChange={(event) => set("releasingAmount", event.target.value)} placeholder="0" className={monoFieldClass} />
                      </div>
                      <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Difference Amount ₹</label>
                        <input value={goldCalculation.differenceAmountDisplay} readOnly className="control-field min-h-8 border-2 border-[hsl(var(--attica-gold-deep))] bg-[hsl(var(--attica-gold))] px-2 py-1.5 text-sm font-bold font-mono text-black" placeholder="0.00" aria-label="Difference Amount" />
                      </div>
                      <div className="min-w-0">
                        <label className={`${labelClass} min-h-6 leading-3`}>Pledge Place</label>
                          <select value={form.pledgePlace} onChange={(event) => setPledgePlace(event.target.value)} className={fieldClass} required={isReleaseCase}>
                          <option value="">Select Pledge Place</option>
                          {pledgePlaces.map((place) => <option key={place} value={place}>{place}</option>)}
                        </select>
                      </div>
                      {isOtherPledgePlace ? (
                        <div className="min-w-0">
                          <label className={`${labelClass} min-h-6 leading-3`}>Other Pledge Place</label>
                          <input value={form.otherPledgePlace} onChange={(event) => set("otherPledgePlace", event.target.value)} placeholder="Type name" className={fieldClass} required={isReleaseCase} />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {showAutoCalculatedPricePerGram ? (
                    <div className="min-w-0"><label className={`${labelClass} min-h-6 leading-3`}>Price/Gram (auto)</label>
                      <input value={form.pricePerGram} readOnly className="control-field min-h-8 bg-muted/40 px-2 py-1.5 text-sm font-mono" placeholder="Auto-calculated" />
                    </div>
                  ) : null}
                </div>
              </section>
            </ResizablePanel>
            <ResizableHandle withHandle className={stackedLayout ? "h-2 w-full" : "w-2"} />
            <ResizablePanel defaultSize={30} minSize={stackedLayout ? 35 : 25}>
              <section className="history-panel flex h-full min-h-0 flex-col self-start overflow-hidden bg-muted/10 px-2.5 py-1.5" aria-labelledby="history-heading" data-testid="history-independent-scroll">
                <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-accent" />
                    <h3 id="history-heading" className="text-sm font-semibold">History</h3>
                  </div>
                  {customerHistoryLoading ? <span className="text-[11px] text-muted-foreground">Loading...</span> : (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{historyRecords.length} interactions</span>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                {customerHistoryLoading ? (
                  <p className="text-sm text-muted-foreground">Checking previous interactions...</p>
                ) : lastCustomerInteraction ? (
                  <>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Last Interaction</p>
                    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm">
                      <dt className="text-muted-foreground">Last Agent</dt><dd className="font-medium">{lastCustomerInteraction.agentName || lastCustomerInteraction.agentId || "—"}</dd>
                      <dt className="text-muted-foreground">Disposition</dt><dd className="font-medium">{getInteractionDisposition(lastCustomerInteraction)}</dd>
                      <dt className="text-muted-foreground">Category</dt><dd className="font-medium">{lastCustomerInteraction.dispositionCategory || getInteractionUpdate(lastCustomerInteraction)}</dd>
                      <dt className="text-muted-foreground">Call</dt><dd className="font-medium capitalize">{lastCustomerInteraction.direction || "—"}</dd>
                      <dt className="text-muted-foreground">Duration</dt><dd className="font-medium font-mono">{Number(lastCustomerInteraction.talkDurationSeconds || 0) > 0 ? formatCallDurationFromSeconds(Number(lastCustomerInteraction.talkDurationSeconds)) : normalizeCallDuration(lastCustomerInteraction.duration) || "—"}</dd>
                      <dt className="text-muted-foreground">Branch</dt><dd className="font-medium">{lastCustomerInteraction.branch || "—"}</dd>
                      <dt className="text-muted-foreground">Last Connected</dt><dd className="font-medium">{formatInteractionDateTime(lastCustomerInteraction)}</dd>
                      <dt className="text-muted-foreground">Talk Time</dt><dd className="font-medium font-mono">{Number(lastCustomerInteraction.talkDurationSeconds || 0) > 0 ? formatCallDurationFromSeconds(Number(lastCustomerInteraction.talkDurationSeconds)) : normalizeCallDuration(lastCustomerInteraction.duration)}</dd>
                    </dl>
                    {normalizeOptionalString(lastCustomerInteraction.notes) ? (
                      <div className="mt-2 rounded-lg border border-amber-300/40 bg-amber-50/70 p-2 dark:bg-amber-950/10">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Previous Notes</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{normalizeOptionalString(lastCustomerInteraction.notes)}</p>
                      </div>
                    ) : null}
                    {normalizeOptionalString(lastCustomerInteraction.quickNote) ? (
                      <div className="mt-2 rounded-lg border border-sky-300/40 bg-sky-50/70 p-2 dark:bg-sky-950/10">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Quick Note</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{normalizeOptionalString(lastCustomerInteraction.quickNote)}</p>
                      </div>
                    ) : null}
                    <button type="button" onClick={() => setHistoryExpanded((value) => !value)} className="action-outline mt-3 w-full justify-center text-xs" aria-expanded={historyExpanded}>
                      {historyExpanded ? "Hide Full History" : `View Full History – ${historyRecords.length}`}
                    </button>
                    {historyExpanded ? (
                      <div className="mt-2 rounded-lg border border-border bg-card">
                        {historyRecords.map((item) => (
                          <article key={item.id} className="border-b border-border p-2 last:border-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold">{item.agentName || item.agentId || "Unknown agent"}</p>
                              <time className="text-[10px] text-muted-foreground">{formatInteractionDateTime(item)}</time>
                            </div>
                            <p className="mt-1 text-xs">{getInteractionDisposition(item)} · {getInteractionUpdate(item)}</p>
                            {normalizeOptionalString(item.quickNote) ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs font-medium text-sky-700">Quick Note: {normalizeOptionalString(item.quickNote)}</p> : null}
                            {normalizeOptionalString(item.notes) ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{normalizeOptionalString(item.notes)}</p> : null}
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No previous interaction found for this mobile number.</p>
                )}
                </div>
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
          </div>
          <section className="schedule-panel min-h-0 overflow-hidden rounded-lg border border-border bg-muted/10 px-2.5 py-1" aria-labelledby="schedule-heading" data-testid="schedule-no-scroll">
                <div className="mb-1 flex shrink-0 items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-accent" />
                  <h3 id="schedule-heading" className="text-sm font-semibold">Schedule</h3>
                </div>
                <div className="schedule-grid grid min-h-0 grid-cols-4 gap-x-2 gap-y-1 max-md:grid-cols-2">
                <div className="min-w-0">
                  <label className={labelClass}>Follow-Up Required</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => handleFollowUpActionChange("schedule")} className={`${effectiveFollowUpAction === "schedule" ? "action-gold" : "action-outline"} h-[30px] min-h-[30px] justify-center py-0`} disabled={isClosedStatus}>Yes</button>
                    <button type="button" onClick={() => handleFollowUpActionChange(dueTodayFollowUpsForPhone.length > 0 ? "call-done" : "none")} className={`${effectiveFollowUpAction !== "schedule" ? "action-gold" : "action-outline"} h-[30px] min-h-[30px] justify-center py-0`}>No</button>
                  </div>
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>Quick Date</label>
                  <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-1.5">
                    <button type="button" onClick={() => handleStatusFollowUpQuickDate(0)} disabled={effectiveFollowUpAction !== "schedule"} className={`${effectiveFollowUpAction === "schedule" && form.statusFollowUpDate === getLocalDateKeyFromToday(0) ? "action-gold" : "action-outline"} h-[30px] min-h-[30px] justify-center px-1 py-0 text-[10px]`}>Today</button>
                    <button type="button" onClick={() => handleStatusFollowUpQuickDate(1)} disabled={effectiveFollowUpAction !== "schedule"} className={`${effectiveFollowUpAction === "schedule" && form.statusFollowUpDate === getLocalDateKeyFromToday(1) ? "action-gold" : "action-outline"} h-[30px] min-h-[30px] justify-center px-1 py-0 text-[10px]`}>Tomorrow</button>
                    <input ref={statusFollowUpInputRef} type="date" aria-label="Select Date" value={effectiveFollowUpAction === "schedule" ? form.statusFollowUpDate : ""} onChange={(event) => handleStatusFollowUpScheduleChange("statusFollowUpDate", event.target.value)} className={`${fieldClass} h-[30px] min-h-[30px] py-0`} disabled={effectiveFollowUpAction !== "schedule"} />
                  </div>
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>Time</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select value={effectiveFollowUpAction === "schedule" ? form.statusFollowUpHour : ""} onChange={(event) => handleStatusFollowUpScheduleChange("statusFollowUpHour", event.target.value)} className={`${fieldClass} h-[30px] min-h-[30px] py-0`} disabled={effectiveFollowUpAction !== "schedule"}>
                      <option value="">Hour</option>{FOLLOW_UP_HOURS.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                    </select>
                    <select value={effectiveFollowUpAction === "schedule" ? form.statusFollowUpMinute : ""} onChange={(event) => handleStatusFollowUpScheduleChange("statusFollowUpMinute", event.target.value)} className={`${fieldClass} h-[30px] min-h-[30px] py-0`} disabled={effectiveFollowUpAction !== "schedule"}>
                      <option value="">Minute</option>{FOLLOW_UP_MINUTES.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
                    </select>
                    <select value={effectiveFollowUpAction === "schedule" ? form.statusFollowUpPeriod : ""} onChange={(event) => handleStatusFollowUpScheduleChange("statusFollowUpPeriod", event.target.value)} className={`${fieldClass} h-[30px] min-h-[30px] py-0`} disabled={effectiveFollowUpAction !== "schedule"}>
                      <option value="">AM/PM</option><option value="AM">AM</option><option value="PM">PM</option>
                    </select>
                  </div>
                </div>
                <div className="min-w-0"><label className={labelClass}>Reason</label>
                  <select value={form.status} onChange={(event) => set("status", event.target.value)} className={`${fieldClass} h-[30px] min-h-[30px] py-0`} disabled={effectiveFollowUpAction !== "schedule"}>
                    <option value="">Select Reason</option>
                    {["Pending", "RNR", "Planning to Visit", "Tentative Visit", "Others"].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="col-span-4 flex min-h-[30px] items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-2 py-1 max-md:col-span-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next Call</p>
                  <p className="truncate text-sm font-semibold">{nextCallLabel}</p>
                </div>
                </div>
          </section>

          <section className="rounded-lg border border-border bg-card px-2.5 py-1.5" aria-labelledby="remarks-heading">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 id="remarks-heading" className="text-sm font-semibold">Remarks / Notes</h3>
                <button type="button" onClick={addRemark} className="action-outline h-[28px] min-h-[28px] py-0 text-xs"><Plus className="h-3 w-3" />Add Remark</button>
              </div>
              <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-2 max-md:grid-cols-1">
              <div data-testid="advertisement-final-field">
                <label className={labelClass}>Advertisement</label>
                <select value={form.advertisement} onChange={(event) => set("advertisement", event.target.value)} className={`${fieldClass} h-[30px] min-h-[30px] py-0`}>
                  <option value="">Select</option>
                  {ADVERTISEMENTS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                {form.remarks.map((remark, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="mt-2 w-5 text-xs text-muted-foreground">{index + 1}.</span>
                    <textarea value={remark} onChange={(event) => updateRemark(index, event.target.value)} placeholder={`Remark ${index + 1}`} className="control-field h-[30px] min-h-[30px] flex-1 resize-none px-2 py-1 text-sm" rows={1} />
                  </div>
                ))}
              </div>
              </div>
          </section>
        </div>
        </div>

        {showTransferDialog ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="presentation">
            <section className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="transfer-call-title">
              <h3 id="transfer-call-title" className="text-base font-semibold">Transfer Call</h3>
              <label className={`${labelClass} mt-4`}>Available Agent</label>
              <select value={transferExt} onChange={(event) => setTransferExt(event.target.value)} className={fieldClass} disabled={transferLoading || transferSubmitting || availableTransferAgents.length === 0}>
                {availableTransferAgents.length === 0 ? <option value="">{transferLoading ? "Checking available agents..." : "No eligible agents available"}</option> : availableTransferAgents.map((agent) => <option key={agent.agentId || agent.extension} value={normalizeOptionalString(agent.extension)}>{(agent.agentName || agent.agentId || "Agent") + " - Ext " + (agent.extension || "")}</option>)}
              </select>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowTransferDialog(false)} disabled={transferSubmitting} className="action-outline">Cancel</button>
                <button type="button" onClick={() => { void handleTransferCall(); }} disabled={!transferCurrentCall || !transferExt || transferLoading || transferSubmitting || callPhase !== "connected"} className="action-gold"><Users className="h-4 w-4" />{transferSubmitting ? "Transferring..." : "Transfer Call"}</button>
              </div>
            </section>
          </div>
        ) : null}

        {showDispositionDialog ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="presentation">
            <section className="flex max-h-[80dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="disposition-dialog-title">
              <h3 id="disposition-dialog-title" className="text-base font-semibold">Select Call Disposition</h3>
              <p className="mt-1 text-xs text-muted-foreground">Choose a category, then select the call result.</p>
              <div className="mt-3 grid grid-cols-4 gap-2" aria-label="Disposition categories">
                {DISPOSITION_GROUP_NAMES.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => handleDispositionGroupSelect(group)}
                    className={activeDispositionGroup === group ? "action-gold justify-center" : "action-outline justify-center"}
                    aria-pressed={activeDispositionGroup === group}
                    data-testid={`disposition-category-${group.toLowerCase()}`}
                  >
                    {group}
                  </button>
                ))}
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted/10 p-2">
                {DISPOSITION_GROUP_NAMES.map((group) => (
                  <section key={group} hidden={activeDispositionGroup !== group} aria-label={`${group} dispositions`}>
                    <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                      {DISPOSITION_GROUPS[group].map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => handleDispositionSelect(option.code)}
                          className={`min-h-9 rounded-lg border px-3 py-2 text-left text-sm transition ${disposition === option.code ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border bg-card hover:border-accent/50 hover:bg-muted/50"}`}
                          aria-pressed={disposition === option.code}
                          data-disposition-code={option.code}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {import.meta.env.MODE === "test" ? (
                <select value={disposition} onChange={(event) => handleDispositionSelect(event.target.value)} className="sr-only" data-testid="final-disposition-select" tabIndex={-1} aria-hidden="true">
                  <option value="">Select disposition</option>
                  {ALL_DISPOSITION_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                </select>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowDispositionDialog(false)} disabled={saving || postCallIntake.saving} className="action-outline">Cancel</button>
                <button type="button" onClick={() => { void handleFinalSubmit(); }} disabled={!disposition || saving || postCallIntake.saving} className="action-gold"><Save className="h-4 w-4" />{saving || postCallIntake.saving ? "Saving..." : "Save & Close Call"}</button>
              </div>
            </section>
          </div>
        ) : null}

        <footer className="relative bottom-0 z-20 flex h-[58px] min-h-[58px] shrink-0 flex-col justify-center border-t border-border bg-card/95 px-4 py-1.5 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.55)] backdrop-blur max-sm:h-[108px] max-sm:min-h-[108px] max-sm:px-2" data-testid="intake-fixed-footer">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div role="status" className="footer-status min-h-9">
              {postCallIntake.workflow?.confirmedEndedAt && !postCallIntake.workflow.submittedAt ? (
                <div className="flex items-center gap-2 text-amber-700"><Clock3 className="h-4 w-4" /><div><p className="text-sm font-semibold">Call Ended · Agent Status: WRAP UP</p><p className="text-xs">Complete the customer details, then select Submit Now.</p></div></div>
              ) : callPhase === "connected" ? (
                <div className="flex items-center gap-2 text-green-700"><PhoneCall className="h-4 w-4" /><div><p className="text-sm font-semibold">Call Active</p><p className="text-xs">No countdown while speaking or on hold.</p></div></div>
              ) : (
                <p className="text-xs text-muted-foreground">{postCallIntake.pending ? "Pending Server Save" : "Draft protection is active."}</p>
              )}
            </div>
            <div className="flex min-w-[360px] gap-2 max-sm:min-w-0 max-sm:w-full max-sm:gap-1">
              <button
                type="button"
                onClick={toggleHold}
                disabled={callPhase !== "connected" || saving || postCallIntake.saving || Boolean(postCallIntake.workflow?.submittedAt)}
                className="action-outline flex-1 justify-center py-2 text-sm"
              >
                <Pause className="h-4 w-4" />{isOnHold ? "Resume" : "Hold"}
              </button>
              <button
                type="button"
                onClick={() => setShowTransferDialog(true)}
                disabled={callPhase !== "connected" || !transferCurrentCall || saving || postCallIntake.saving}
                className="action-outline flex-1 justify-center py-2 text-sm"
              >
                <Users className="h-4 w-4" />Call Transfer
              </button>
              <button
                type="button"
                onClick={(event) => { event.preventDefault(); flushSync(handleOpenDispositionDialog); }}
                disabled={saving || postCallIntake.saving || (isAgentUser && Boolean(safeCallId) && !postCallIntake.ready)}
                className="action-gold flex-1 justify-center py-2 text-sm"
              >
                <Save className="h-4 w-4" />{saving || postCallIntake.saving ? "Saving..." : "Submit Now"}
              </button>
            </div>
          </div>
          {postCallIntake.pending ? <p className="mt-1 text-xs font-semibold text-destructive">Pending Server Save. Entered details are retained.</p> : null}
        </footer>
    </motion.div>
    </div>
  );
}

export const IsolatedCustomerIntakeForm = memo(CustomerIntakeFormView);

export default function CustomerIntakeForm(props: CustomerIntakeFormProps) {
  const {
    addFollowUp,
    closePendingFollowUpsForPhone,
    followUps,
	    calls,
	    syncCallRecord,
	    callPhase,
    isOnHold,
    toggleHold,
    agentStatus,
    transferCurrentCall,
    startConferenceCall,
    getFinalizedCallSnapshot,
    getLiveCallSnapshot,
  } = useCallCenter();
  const safeCallId = normalizeCallIdValue(props.callId);
  const safeCalls = useMemo(
    () => (Array.isArray(calls) ? calls.filter((item): item is ManagedCall => isManagedCallRecord(item)) : []),
    [calls],
  );
  const liveCallSnapshot = useMemo(() => {
    if (!safeCallId) return null;
    return safeCalls.find((item) => item.id === safeCallId) || null;
  }, [safeCallId, safeCalls]);
  const getCurrentCall = useCallback((lookup: { callId?: string; intakeToken?: string }) => {
    const normalizedCallId = normalizeCallIdValue(lookup.callId);
    const normalizedIntakeToken = normalizeOptionalString(lookup.intakeToken);
    return safeCalls.find((item) => (
      (normalizedCallId && item.id === normalizedCallId)
      || (normalizedIntakeToken && item.intakeToken === normalizedIntakeToken)
    )) || null;
  }, [safeCalls]);

  return (
    <IsolatedCustomerIntakeForm
      {...props}
      addFollowUp={addFollowUp}
      closePendingFollowUpsForPhone={closePendingFollowUpsForPhone}
      followUps={followUps}
      liveCallSnapshot={liveCallSnapshot}
	      getCurrentCall={getCurrentCall}
	      syncCallRecord={syncCallRecord}
      callPhase={callPhase}
      isOnHold={isOnHold}
      toggleHold={toggleHold}
      agentStatus={agentStatus}
      transferCurrentCall={transferCurrentCall}
      startConferenceCall={startConferenceCall}
      getFinalizedCallSnapshot={getFinalizedCallSnapshot}
      getLiveCallSnapshot={getLiveCallSnapshot}
    />
  );
}
