export type DispositionOption = {
  code: string;
  label: string;
};

export const DISPOSITION_CATEGORY_OPTIONS = [
  "Lost",
  "Enquiry",
  "Follow Up / Call Back",
  "L2 Lost & Complaints",
  "RNR",
  "QL",
  "Billed",
  "Others",
  "Active / Scheduled Call",
  "Walkin",
] as const;

export type DispositionCategory = (typeof DISPOSITION_CATEGORY_OPTIONS)[number];

const disposition = (label: string): DispositionOption => ({ code: label, label });

export const DISPOSITION_GROUPS = {
  Query: [
    disposition("Pending (They will discuss and come)"),
    disposition("Visited Not Sold Out"),
    disposition("Visited Sold Out"),
    disposition("Sold Out"),
    disposition("Coming To Branch"),
    disposition("Planning to Visit (Date and Time)"),
    disposition("Silver Enquiry"),
    disposition("Diamond Enquiry"),
    disposition("Repledge Enquiry"),
    disposition("Door-Step Enquiry"),
    disposition("Gold Rate Enquiry - Old Gold"),
    disposition("Gold Rate Enquiry - New Gold Purchase"),
    disposition("Nearest Branch Location"),
    disposition("Branch Timings"),
    disposition("Payment Channel Enquiry"),
    disposition("Service Enquiry - Sell Gold"),
    disposition("Service Enquiry - Buy Gold"),
    disposition("Service Enquiry - Release Gold"),
    disposition("Documents Required Information"),
  ],
  Complaint: [
    disposition("Quotation Mismatch"),
    disposition("BM Behaviour Issue"),
    disposition("Branch Closed but Customer Visited"),
    disposition("Quotation Given Without Purity Check"),
    disposition("Service Delay Complaint"),
    disposition("Staff Behaviour Complaint"),
  ],
  Request: [
    disposition("Margin Reduce Request"),
    disposition("Increase Quotation Amount Request"),
    disposition("Speed Up Validation Request"),
  ],
  Others: [
    disposition("None"),
    disposition("Not Interested"),
    disposition("Sold Outside"),
    disposition("Call Transfer"),
    disposition("Not Serviceable"),
    disposition("Abuse Call"),
    disposition("Pending Calls"),
    disposition("Job Related Call"),
    disposition("Advertisement Related Call"),
    disposition("Out of State"),
    disposition("General Enquiry - Other"),
    disposition("Disconnected - Language Barrier"),
    disposition("Disconnected - Not Connected"),
    disposition("Spam Call"),
  ],
} as const satisfies Record<string, readonly DispositionOption[]>;

export const DISPOSITION_OPTIONS: DispositionOption[] = Object.values(DISPOSITION_GROUPS).flatMap((group) => group);

const LEGACY_DISPOSITION_OPTIONS: DispositionOption[] = [
  { code: "VISITED_SOLD_OUT", label: "Visited Sold Out" },
  { code: "COMING_TO_BRANCH", label: "Coming To Branch" },
  { code: "CTO", label: "Coming to Office" },
  { code: "CB", label: "Call Back" },
  { code: "LM", label: "Left Message" },
  { code: "DEC", label: "Declined" },
  { code: "CSE", label: "Can't Send Executive" },
  { code: "WN", label: "Wrong Number" },
  { code: "NI", label: "Not Interested" },
  { code: "INT", label: "Interested" },
  { code: "ENQ", label: "Enquiry" },
  { code: "LB", label: "Line Busy" },
  { code: "PND", label: "Pending" },
  { code: "RNR", label: "Ring No Reply" },
  { code: "NA", label: "No Answer" },
  { code: "DIS", label: "Disconnected" },
  { code: "SOLD", label: "Sale Done" },
  { code: "PLANNING_TO_VISIT", label: "Planning to Visit (Date and Time)" },
  { code: "SILVER_ENQ", label: "Silver Enquiry" },
  { code: "DIAMOND_ENQ", label: "Diamond Enquiry" },
  { code: "REPLEDGE_ENQ", label: "Repledge Enquiry" },
  { code: "GRE_OLD", label: "Gold Rate Enquiry - Old Gold" },
  { code: "GRE_NEW", label: "Gold Rate Enquiry - New Gold Purchase" },
  { code: "NBL", label: "Nearest Branch Location" },
  { code: "BT", label: "Branch Timings" },
  { code: "PCE", label: "Payment Channel Enquiry" },
  { code: "SE_SELL", label: "Service Enquiry - Sell Gold" },
  { code: "SE_BUY", label: "Service Enquiry - Buy Gold" },
  { code: "SE_RELEASE", label: "Service Enquiry - Release Gold" },
  { code: "DOC_REQ", label: "Documents Required Information" },
  { code: "QM", label: "Quotation Mismatch" },
  { code: "BMI", label: "BM Behaviour Issue" },
  { code: "BCV", label: "Branch Closed but Customer Visited" },
  { code: "WCPQ", label: "Quotation Given Without Purity Check" },
  { code: "SDC", label: "Service Delay Complaint" },
  { code: "SBC", label: "Staff Behaviour Complaint" },
  { code: "MRR", label: "Margin Reduce Request" },
  { code: "IQA", label: "Increase Quotation Amount Request" },
  { code: "SUV", label: "Speed Up Validation Request" },
  { code: "NOT_SERVICEABLE", label: "Not Serviceable" },
  { code: "ABUSE_CALL", label: "Abuse Call" },
  { code: "DOOR_STEP_ENQUIRY", label: "Door-Step Enquiry" },
  { code: "MISSED", label: "Missed" },
  { code: "NONE", label: "None" },
  { code: "PENDING_CALLS", label: "Pending Calls" },
  { code: "CUSTOMER_DISCONNECTED", label: "Customer Disconnected" },
  { code: "VISITED_BRANCH", label: "Visited Branch" },
  { code: "JRC", label: "Job Related Call" },
  { code: "ARC", label: "Advertisement Related Call" },
  { code: "OOS", label: "Out of State" },
  { code: "GL_OTHER", label: "General Enquiry - Other" },
  { code: "DIS_LB", label: "Disconnected - Language Barrier" },
  { code: "DIS_NC", label: "Disconnected - Not Connected" },
  { code: "SPAM", label: "Spam Call" },
];

const DISPOSITION_LABELS = new Map(
  [...DISPOSITION_OPTIONS, ...LEGACY_DISPOSITION_OPTIONS].flatMap((option) => [
    [normalizeDispositionKey(option.code), option.label],
    [normalizeDispositionKey(option.label), option.label],
  ]),
);

function normalizeDispositionKey(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

const DISPOSITION_ALIASES = new Map<string, string>(
  Object.entries({
    "#N/A": "",
    "N/A": "",
    COMPLETED: "",
    TRANSFERRED: "Transferred",
    SCHEDULED: "Scheduled",
    MISSED: "Missed",
    RNR: "Ring No Reply",
    NA: "No Answer",
    LB: "Line Busy",
    DIS_LB: "Disconnected - Language Barrier",
    DIS: "Disconnected",
    DIS_NC: "Disconnected - Not Connected",
    "DISCONNECTED - NOT C": "Disconnected - Not Connected",
    "CUSTOMER DISCONNECTE": "Customer Disconnected",
    "CUSTOMER DISCONNECTED": "Customer Disconnected",
    CUSTOMER_DISCONNECTED: "Customer Disconnected",
    CTR: "Call Transfer",
    "CALL TRANSFER": "Call Transfer",
    CTO: "Coming to Office",
    CB: "Call Back",
    "CALL BACK": "Call Back",
    LM: "Left Message",
    "LEFT MESSAGE": "Left Message",
    DEC: "Declined",
    DECLINED: "Declined",
    CSE: "Can't Send Executive",
    "CAN'T SEND EXECUTIVE": "Can't Send Executive",
    "CANT SEND EXECUTIVE": "Can't Send Executive",
    "COMING TO BRANCH": "Coming To Branch",
    "COMING TO OFFICE": "Coming to Office",
    COMING_TO_BRANCH: "Coming To Branch",
    VNS: "Visited Not Sold Out",
    "VISITED NOT SOLD OUT": "Visited Not Sold Out",
    VISITED_SOLD_OUT: "Visited Sold Out",
    "VISITED SOLD OUT": "Visited Sold Out",
    SOLD_OUT: "Sold Out",
    "SOLD OUT": "Sold Out",
    SOLDOUT: "Sold Out",
    "CUSTOMER SOLD OUT": "Sold Out",
    "FINAL SALE": "Sold Out",
    BILLED: "Sold Out",
    PND: "Pending",
    PENDING: "Pending",
    PENDING_CALLS: "Pending Calls",
    "PENDING CALLS": "Pending Calls",
    "PENDING (THEY WILL D": "Pending (They will discuss and come)",
    "PENDING (THEY WILL DISCUSS AND COME)": "Pending (They will discuss and come)",
    NI: "Not Interested",
    INT: "Interested",
    INTERESTED: "Interested",
    "NOT INTERESTED": "Not Interested",
    SOLD: "Sale Done",
    "SALE DONE": "Sale Done",
    "SOLD OUTSIDE": "Sold Outside",
    NONE: "None",
    WN: "Wrong Number",
    OOS: "Out of State",
    OUT_OF_STATE: "Out of State",
    "OUT OF STATE": "Out of State",
    DEC: "Declined",
    ENQ: "General Enquiry - Other",
    GL_OTHER: "General Enquiry - Other",
    "GENERAL ENQUIRY - OT": "General Enquiry - Other",
    "GENERAL ENQUIRY - OTHER": "General Enquiry - Other",
    "GOLD RATE ENQUIRY -": "Gold Rate Enquiry - Old Gold",
    GRE_OLD: "Gold Rate Enquiry - Old Gold",
    "GOLD RATE ENQUIRY - OLD GOLD": "Gold Rate Enquiry - Old Gold",
    GRE_NEW: "Gold Rate Enquiry - New Gold Purchase",
    NBL: "Nearest Branch Location",
    "NEAREST BRANCH LOCATION": "Nearest Branch Location",
    "NEAREST BRANCH LOCAT": "Nearest Branch Location",
    NOT_SERVICEABLE: "Not Serviceable",
    "NOT SERVICEABLE": "Not Serviceable",
    ABUSE_CALL: "Abuse Call",
    "ABUSE CALL": "Abuse Call",
    DOOR_STEP_ENQUIRY: "Door-Step Enquiry",
    "DOOR STEP ENQUIRY": "Door-Step Enquiry",
    "DOOR-STEP ENQUIRY": "Door-Step Enquiry",
    "VISITED BRANCH": "Visited Branch",
    VISITED_BRANCH: "Visited Branch",
    SE_SELL: "Service Enquiry - Sell Gold",
    "SERVICE ENQUIRY - SE": "Service Enquiry - Sell Gold",
    "SERVICE ENQUIRY - SELL GOLD": "Service Enquiry - Sell Gold",
    SE_RELEASE: "Service Enquiry - Release Gold",
    "SERVICE ENQUIRY - RE": "Service Enquiry - Release Gold",
    "SERVICE ENQUIRY - RELEASE GOLD": "Service Enquiry - Release Gold",
    IQA: "Increase Quotation Amount Request",
    "INCREASE QUOTATION A": "Increase Quotation Amount Request",
    "INCREASE QUOTATION AMOUNT REQUEST": "Increase Quotation Amount Request",
    MRR: "Margin Reduce Request",
    "MARGIN REDUCE REQUES": "Margin Reduce Request",
    "MARGIN REDUCE REQUEST": "Margin Reduce Request",
    SUV: "Speed Up Validation Request",
    "SPEED UP VALIDATION": "Speed Up Validation Request",
    "SPEED UP VALIDATION REQUEST": "Speed Up Validation Request",
    PLANNING_TO_VISIT: "Planning to Visit (Date and Time)",
    "PLANNING TO VISIT (D": "Planning to Visit (Date and Time)",
    "PLANNING TO VISIT (DATE AND TIME)": "Planning to Visit (Date and Time)",
    "DISCONNECTED - LANGU": "Disconnected - Language Barrier",
    "DOCUMENTS REQUIRED I": "Documents Required Information",
    "DOCUMENTS REQUIRED INFORMATION": "Documents Required Information",
    "PAYMENT CHANNEL ENQU": "Payment Channel Enquiry",
    "PAYMENT CHANNEL ENQUIRY": "Payment Channel Enquiry",
    "QUOTATION GIVEN WITH": "Quotation Given Without Purity Check",
    "QUOTATION GIVEN WITHOUT PURITY CHECK": "Quotation Given Without Purity Check",
    "SERVICE DELAY COMPLA": "Service Delay Complaint",
    "SERVICE DELAY COMPLAINT": "Service Delay Complaint",
    "STAFF BEHAVIOUR COMP": "Staff Behaviour Complaint",
    "STAFF BEHAVIOUR COMPLAINT": "Staff Behaviour Complaint",
  }).map(([key, label]) => [normalizeDispositionKey(key), label]),
);

export const DISPOSITION_CATEGORY_MAP: Record<string, DispositionCategory> = {
  ABUSE_CALL: "Lost",
  NI: "Lost",
  WN: "Lost",
  JRC: "Lost",
  ARC: "Lost",
  GL_OTHER: "Lost",
  DIS_LB: "Lost",
  SPAM: "Lost",

  GRE_OLD: "Enquiry",
  GRE_NEW: "Enquiry",
  PCE: "Enquiry",
  DOC_REQ: "Enquiry",
  CTR: "Enquiry",
  ENQ: "Enquiry",
  LB: "Enquiry",
  PND: "Enquiry",
  REPLEDGE_ENQ: "Enquiry",
  SILVER_ENQ: "Enquiry",
  TRANSFERRED: "Enquiry",

  CB: "Follow Up / Call Back",
  LM: "Follow Up / Call Back",
  DEC: "Follow Up / Call Back",
  CUSTOMER_DISCONNECTED: "Follow Up / Call Back",
  MISSED: "Follow Up / Call Back",
  PENDING_CALLS: "Follow Up / Call Back",

  CSE: "L2 Lost & Complaints",
  QM: "L2 Lost & Complaints",
  BMI: "L2 Lost & Complaints",
  BCV: "L2 Lost & Complaints",
  WCPQ: "L2 Lost & Complaints",
  SDC: "L2 Lost & Complaints",
  SBC: "L2 Lost & Complaints",
  NOT_SERVICEABLE: "L2 Lost & Complaints",
  SOLD_OUTSIDE: "L2 Lost & Complaints",

  RNR: "RNR",
  NA: "RNR",
  DIS: "RNR",
  DIS_NC: "RNR",

  CTO: "QL",
  VNS: "QL",
  INT: "QL",
  NBL: "QL",
  BT: "QL",
  MRR: "QL",
  IQA: "QL",
  SUV: "QL",
  DOOR_STEP_ENQUIRY: "QL",
  PLANNING_TO_VISIT: "QL",

  SE_SELL: "Billed",
  SE_BUY: "Billed",
  SE_RELEASE: "Billed",
  SOLD: "Billed",
  SOLD_OUT: "Billed",

  NONE: "Others",
  OOS: "Others",
  SCHEDULED: "Active / Scheduled Call",
  VISITED_BRANCH: "Walkin",
};

const DISPOSITION_CATEGORY_LABEL_MAP = new Map<string, DispositionCategory>();

for (const [code, category] of Object.entries(DISPOSITION_CATEGORY_MAP)) {
  DISPOSITION_CATEGORY_LABEL_MAP.set(normalizeDispositionKey(code), category);
  const label = DISPOSITION_LABELS.get(normalizeDispositionKey(code)) ?? DISPOSITION_ALIASES.get(normalizeDispositionKey(code));
  if (label) {
    DISPOSITION_CATEGORY_LABEL_MAP.set(normalizeDispositionKey(label), category);
  }
}

[
  ["Not Interested", "Lost"],
  ["Wrong Number", "Lost"],
  ["Job Related Call", "Lost"],
  ["Advertisement Related Call", "Lost"],
  ["General Enquiry - Other", "Lost"],
  ["Disconnected - Language Barrier", "Lost"],
  ["Spam Call", "Lost"],
  ["Abuse Call", "Lost"],
  ["Gold Rate Enquiry - Old Gold", "Enquiry"],
  ["Gold Rate Enquiry - New Gold Purchase", "Enquiry"],
  ["Payment Channel Enquiry", "Enquiry"],
  ["Documents Required Information", "Enquiry"],
  ["Call Transfer", "Enquiry"],
  ["Enquiry", "Enquiry"],
  ["Line Busy", "Enquiry"],
  ["Pending", "Enquiry"],
  ["Repledge Enquiry", "Enquiry"],
  ["Silver Enquiry", "Enquiry"],
  ["Transferred", "Enquiry"],
  ["Call Back", "Follow Up / Call Back"],
  ["Left Message", "Follow Up / Call Back"],
  ["Declined", "Follow Up / Call Back"],
  ["Missed", "Follow Up / Call Back"],
  ["Pending (They will discuss and come)", "Follow Up / Call Back"],
  ["Pending Calls", "Follow Up / Call Back"],
  ["Customer Disconnected", "Follow Up / Call Back"],
  ["Can't Send Executive", "L2 Lost & Complaints"],
  ["Quotation Mismatch", "L2 Lost & Complaints"],
  ["BM Behaviour Issue", "L2 Lost & Complaints"],
  ["Branch Closed but Customer Visited", "L2 Lost & Complaints"],
  ["Quotation Given Without Purity Check", "L2 Lost & Complaints"],
  ["Service Delay Complaint", "L2 Lost & Complaints"],
  ["Staff Behaviour Complaint", "L2 Lost & Complaints"],
  ["Not Serviceable", "L2 Lost & Complaints"],
  ["Sold Outside", "L2 Lost & Complaints"],
  ["Ring No Reply", "RNR"],
  ["No Answer", "RNR"],
  ["Disconnected", "RNR"],
  ["Disconnected - Not Connected", "RNR"],
  ["Coming to Office", "QL"],
  ["Coming To Branch", "QL"],
  ["Visited Not-Sold", "QL"],
  ["Visited Not Sold Out", "QL"],
  ["Interested", "QL"],
  ["Nearest Branch Location", "QL"],
  ["Branch Timings", "QL"],
  ["Margin Reduce Request", "QL"],
  ["Increase Quotation Amount Request", "QL"],
  ["Speed Up Validation Request", "QL"],
  ["Door-Step Enquiry", "QL"],
  ["Planning to Visit (Date and Time)", "QL"],
  ["Service Enquiry - Sell Gold", "Billed"],
  ["Service Enquiry - Buy Gold", "Billed"],
  ["Service Enquiry - Release Gold", "Billed"],
  ["Sale Done", "Billed"],
  ["Sold Out", "Billed"],
  ["Visited Sold Out", "Billed"],
  ["Billed", "Billed"],
  ["Final Sale", "Billed"],
  ["None", "Others"],
  ["Out of State", "Others"],
  ["Scheduled", "Active / Scheduled Call"],
  ["Visited Branch", "Walkin"],
].forEach(([label, category]) => {
  DISPOSITION_CATEGORY_LABEL_MAP.set(normalizeDispositionKey(label), category as DispositionCategory);
});

export const getDispositionLabel = (code?: string) => {
  const normalizedCode = normalizeDispositionKey(code || "");
  return DISPOSITION_ALIASES.get(normalizedCode) ?? DISPOSITION_LABELS.get(normalizedCode) ?? String(code || "").trim();
};

export const getDispositionCategory = (code?: string) => {
  const normalizedCode = normalizeDispositionKey(code || "");
  if (!normalizedCode) return "";
  const directCategory = DISPOSITION_CATEGORY_MAP[normalizedCode];
  if (directCategory) return directCategory;

  const aliasLabel = DISPOSITION_ALIASES.get(normalizedCode) ?? DISPOSITION_LABELS.get(normalizedCode);
  const normalizedLabel = normalizeDispositionKey(aliasLabel || code || "");
  return DISPOSITION_CATEGORY_LABEL_MAP.get(normalizedLabel) ?? "";
};

const normalizeCategoryRuleKey = (value?: string) => (
  getDispositionLabel(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
);

const parseDurationSecondsForCategory = (value?: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) return 0;
  if (["0", "00", "00:00", "00:00:00"].includes(normalized)) return 0;
  const parts = normalized.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
};

export const getCallCategory = (row: {
  duration?: string;
  durationSeconds?: number;
  duration_seconds?: number;
  talkDurationSeconds?: number;
  talk_duration_seconds?: number;
  status?: string;
  sourceStatus?: string;
  source_status?: string;
  disposition?: string;
  callbackStatus?: string;
  callback_status?: string;
  formStatus?: string;
  form_status?: string;
}) => {
  const status = String(row.status || row.sourceStatus || row.source_status || "").trim().toLowerCase();
  const disposition = String(
    row.disposition
    || row.callbackStatus
    || row.callback_status
    || row.formStatus
    || row.form_status
    || ""
  ).trim();
  const dispositionKey = normalizeCategoryRuleKey(disposition);
  const durationSeconds = Math.max(
    parseDurationSecondsForCategory(row.duration),
    Number(row.durationSeconds ?? row.duration_seconds ?? row.talkDurationSeconds ?? row.talk_duration_seconds ?? 0) || 0,
  );
  const isZeroDuration = durationSeconds === 0 || ["00:00:00", "00:00", "0", "00"].includes(String(row.duration || "").trim());

  if (isZeroDuration && status === "failed" && ["ringnoreply", "rnr"].includes(dispositionKey)) {
    return "RNR";
  }

  if (
    status === "completed"
    && ["planningtovisit", "planningtovisitdatetime", "comingtooffice", "comingtobranch"].includes(dispositionKey)
  ) {
    return "QL";
  }

  if (
    status === "completed"
    && ["customerdisconnected", "calldisconnected", "disconnected"].includes(dispositionKey)
  ) {
    return "Follow Up / Call Back";
  }

  if (status === "completed" && ["pendingcalls", "pending", "pnd"].includes(dispositionKey)) {
    return "Follow Up / Call Back";
  }

  if (status === "active" && (!dispositionKey || ["none", "null"].includes(dispositionKey))) {
    return "Others";
  }

  if (status === "active" && dispositionKey === "scheduled") {
    return "Active / Scheduled Call";
  }

  return getDispositionCategory(disposition) || "Others";
};
