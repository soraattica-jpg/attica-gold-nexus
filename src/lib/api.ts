import type { UserRole } from "@/contexts/AuthContext";
import type { Branch, CallRecord, FollowUpRecord, MetalRate } from "@/data/mockData";
import { dedupeCallInteractions, isCountableIncomingCall } from "@/lib/callMetrics";
import { buildCustomerUid } from "@/lib/customerIdentity";

const DEFAULT_API_BASE_URL = "/api";

export function normalizeApiBaseUrl(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;

  const normalized = trimmed.replace(/\/+$/, "");
  if (!normalized) return DEFAULT_API_BASE_URL;

  return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
}

const API = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const inFlightGetRequests = new Map<string, Promise<ApiFetchPayload>>();

type ApiFetchPayload = {
  ok: boolean;
  status: number;
  payload: unknown;
};

export function buildApiUrl(path: string, apiBaseUrl = API) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const normalizedPath = `/${String(path || "").trim().replace(/^\/+/, "")}`;
  return normalizedPath === "/" ? baseUrl : `${baseUrl}${normalizedPath}`;
}

export function resolveBackendUrl(
  value?: string | null,
  options?: {
    apiBaseUrl?: string;
    currentOrigin?: string;
  },
) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const apiBaseUrl = options?.apiBaseUrl ?? API;
  const currentOrigin = options?.currentOrigin
    || (typeof window !== "undefined" ? window.location.origin : "http://localhost");

  if (trimmed.startsWith("/api")) {
    const apiPath = trimmed.slice(4) || "/";
    return buildApiUrl(apiPath, apiBaseUrl);
  }

  if (trimmed.startsWith("/")) {
    try {
      const backendOrigin = new URL(buildApiUrl("/", apiBaseUrl), currentOrigin).origin;
      return `${backendOrigin}${trimmed}`;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export interface AgentRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  extension?: string;
  shift?: string;
  status?: "active" | "inactive" | "online" | "offline" | "wrap-up" | "on-break" | "lunch-break" | "restroom-break" | "outbound-auto" | "follow-up" | "manual-outgoing";
  languages?: string[];
  isLoggedIn?: boolean;
  loginTime?: string;
  logoutTime?: string;
  lastLoginAt?: string;
  lastLogoutAt?: string;
  publicLoginIp?: string;
  workstationIp?: string;
  workstationIpLastSeenAt?: string;
  lastLoginIp?: string;
  lastLoginIpIsGateway?: boolean;
  lastLoginDeviceId?: string;
  activeDuration?: string;
  breakTime?: string;
  followUpStartedAt?: string;
  followUpDuration?: string;
  incomingAccess?: boolean;
  outgoingAccess?: boolean;
  followUpAccess?: boolean;
  adminMessage?: string;
  activeCallId?: string;
  activeCallLive?: boolean;
  staleActiveCallId?: string;
  activeCallDirection?: string;
  activeCallStartedAt?: string;
  callStateUpdatedAt?: string;
  lastCallEndedAt?: string;
  uiRefreshToken?: string;
  uiRefreshScope?: string;
  uiRefreshTriggeredAt?: string;
}

export interface AgentSessionRecord {
  id: string;
  agentId: string;
  agentName: string;
  role: UserRole;
  extension?: string;
  sessionState: "logged-in" | "logged-out";
  loginAt?: string;
  logoutAt?: string;
  loginTime?: string;
  logoutTime?: string;
  publicLoginIp?: string;
  workstationIp?: string;
  workstationIpLastSeenAt?: string;
  loginIp?: string;
  loginIpIsGateway?: boolean;
  deviceId?: string;
  activeDuration?: string;
  breakTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthUserRecord extends AgentRecord {
  extension: string;
}

export interface BreakLogRecord {
  id: string;
  agentId: string;
  agentName: string;
  breakType?: string;
  breakDate?: string;
  startedAt?: string;
  endedAt?: string;
  startTime: string;
  endTime?: string;
  duration?: string;
  createdAt?: string;
}

export interface LiveAgentRecord {
  agentId: string;
  agentName?: string;
  status: "available" | "on-call" | "on-break" | "offline" | string;
  callsToday: number;
  extension?: string;
  sipStatus?: string;
  activeCalls?: number;
  activeAutoDialCount?: number;
  workMode?: string;
  inboundToday?: number;
  outboundToday?: number;
  answeredToday?: number;
  missedToday?: number;
  convertedBills?: number;
  enquiryToday?: number;
  releaseToday?: number;
  convertedTotal?: number;
  followUpsPending?: number;
  followUpStartedAt?: string;
  followUpDuration?: string;
  queuePaused?: boolean;
  queueMemberships?: string[];
  queuePausedQueues?: string[];
  incomingAccess?: boolean;
  outgoingAccess?: boolean;
  followUpAccess?: boolean;
  onBreak?: boolean;
  canReceiveAutoDialAssignments?: boolean;
  isLoggedIn?: boolean;
  loginTime?: string;
  lastLoginAt?: string;
  languages?: string[];
}

export type LiveCallMonitorMode = "listen" | "barge";

export interface LiveCallMonitorResult extends MutationResult {
  mode?: LiveCallMonitorMode;
  requestedById?: string;
  requestedByName?: string;
  requesterExtension?: string;
  requesterChannel?: string;
  targetAgentId?: string;
  targetAgentName?: string;
  targetExtension?: string;
  targetChannel?: string;
}

export interface ConferenceCallResult extends MutationResult {
  conferenceId?: string;
  requesterId?: string;
  requesterExtension?: string;
  targetPhone?: string;
  redirectedChannels?: string[];
  dialChannel?: string;
}

export interface AutoDialLeadImportRow {
  customerName: string;
  mobileNumber: string;
  area: string;
  state?: string;
  language?: string;
  goldWeight: string;
  type: string;
}

export interface AutoDialLeadRecord extends AutoDialLeadImportRow {
  id: string;
  sourceState?: string;
  preferredLanguage?: string;
  status: "pending" | "assigned" | "dialing" | "completed" | "failed";
  assignedAgentId?: string;
  assignedAgentName?: string;
  scheduledAgentId?: string;
  scheduledAgentName?: string;
  sourceFile?: string;
  callId?: string;
  assignedAt?: string;
  dialStartedAt?: string;
  completedAt?: string;
  scheduledFor?: string;
  lastError?: string;
  queueExitReason?: string;
  retryAllowed?: boolean;
  metaState?: string;
  metaCity?: string;
  metaFullName?: string;
  metaPhoneNumber?: string;
  metaServiceLookingFor?: string;
  metaGoldAmount?: string;
  metaPlannedVisit?: string;
  metaDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AutoDialQueueExitReason =
  | "Wrong Number"
  | "Duplicate Lead"
  | "Invalid Lead"
  | "Not Reachable"
  | "Rejected by Agent"
  | "Remove from Queue";

export interface AutoDialControlState extends MutationResult {
  enabled: boolean;
  freshLeadAutoConnectEnabled?: boolean;
  freshLeadAutoConnectIntervalSeconds?: number;
  updatedAt?: string;
  updatedById?: string;
  updatedByName?: string;
  releasedCount?: number;
}

export type IncomingFiveOfTenGateAction = "route" | "disconnect";

export interface IncomingFiveOfTenGateStatus {
  configured: boolean;
  active: boolean;
  expired: boolean;
  pending: boolean;
  statusLabel: string;
  targetDate: string;
  todayIst: string;
  counter: number;
  rejectedCount: number;
  totalRejectedCount: number;
  stopLimit: number;
  stopCount: number;
  stopRemaining: number;
  hardStopActive: boolean;
  rateLimitSeconds: number;
  rateLimitActive: boolean;
  lastRouteEpoch: number;
  secondsSinceLastRoute: number;
  rateLimitRemainingSeconds: number;
  cycleSize: number;
  allowedPerCycle: number;
  rejectedPerCycle: number;
  nextPosition: number;
  nextAction: IncomingFiveOfTenGateAction;
  pattern: Array<{
    position: number;
    action: IncomingFiveOfTenGateAction;
    label: string;
  }>;
  updatedAt: string;
}

export interface AutoDialImportResult extends MutationResult {
  inserted?: number;
  invalid?: number;
  duplicatesIgnored?: number;
}

export interface AutoDialImportProgress {
  completedBatches: number;
  totalBatches: number;
  processedRows: number;
  totalRows: number;
  inserted: number;
  invalid: number;
  duplicatesIgnored: number;
}

export interface JustDialLeadRecord {
  id?: number;
  leadid: string;
  leadtype: string;
  prefix: string;
  name: string;
  mobile: string;
  phone: string;
  email: string;
  date: string;
  category: string;
  city: string;
  area: string;
  brancharea: string;
  dncmobile: number;
  dncphone: number;
  company: string;
  pincode: string;
  time: string;
  branchpin: string;
  parentid: string;
  state: string;
  leadStatus?: string;
  remarks?: string;
  status?: string;
  statusUpdatedAt?: string;
  doneAt?: string;
  rawPayload?: string;
  receivedAt?: string;
  updatedAt?: string;
  autoDialLeadId?: string;
  autoDialStatus?: string;
  autoDialRetryAllowed?: boolean;
  autoDialQueueExitReason?: string;
  autoDialLastError?: string;
  lastDialRequestedAt?: string;
}

export interface WebsiteLeadRecord {
  leadid: string;
  slNo?: string;
  form?: string;
  branchId?: string;
  branchName?: string;
  customerName: string;
  contactNumber: string;
  goldWeight: string;
  language: string;
  type: string;
  state: string;
  city: string;
  area: string;
  leadFrom: string;
  date: string;
  time: string;
  timing?: string;
  device: string;
  utmSource: string;
  utmCampaignName: string;
  keyword: string;
  adgroupid: string;
  gclid: string;
  remarks: string;
  comments: string;
  followupDate: string;
  rawPayload?: string;
  receivedAt?: string;
  updatedAt?: string;
  autoDialLeadId?: string;
  autoDialStatus?: string;
  autoDialRetryAllowed?: boolean;
  autoDialQueueExitReason?: string;
  autoDialLastError?: string;
  lastDialRequestedAt?: string;
}

export interface GoogleLeadRecord {
  id: string;
  customerName: string;
  mobileNumber: string;
  area: string;
  sourceState: string;
  preferredLanguage: string;
  goldWeight: string;
  type: string;
  status: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  scheduledAgentId?: string;
  scheduledAgentName?: string;
  sourceFile?: string;
  callId?: string;
  assignedAt?: string;
  dialStartedAt?: string;
  completedAt?: string;
  scheduledFor?: string;
  lastError?: string;
  queueExitReason?: string;
  retryAllowed?: boolean;
  leadDate?: string;
  leadTime?: string;
  receivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaLeadRecord {
  leadid: string;
  fullName: string;
  phoneNumber: string;
  city: string;
  state: string;
  grams: string;
  type: string;
  serviceLookingFor?: string;
  goldAmount?: string;
  plannedVisit?: string;
  date: string;
  time: string;
  rawPayload?: string;
  receivedAt?: string;
  updatedAt?: string;
  autoDialLeadId?: string;
  autoDialStatus?: string;
  autoDialRetryAllowed?: boolean;
  autoDialQueueExitReason?: string;
  autoDialLastError?: string;
  lastDialRequestedAt?: string;
}

export interface MetaLeadsResponse {
  rows: MetaLeadRecord[];
  sync?: {
    synced?: number;
    cached?: boolean;
    error?: string;
  };
  error?: string;
}

export interface BlogLeadsResponse {
  rows: WebsiteLeadRecord[];
  sync?: {
    synced?: number;
    cached?: boolean;
    error?: string;
  };
  error?: string;
}

export interface SeoMarketingLeadTimelineEvent {
  time: string;
  event: string;
}

export interface SeoMarketingLeadRow {
  leadDate: string;
  leadTime: string;
  leadCreatedAt: string;
  leadId: string;
  customerName: string;
  customerNumber: string;
  source: string;
  platform: string;
  medium: string;
  campaignId: string;
  campaignName: string;
  adSetOrAdGroupId: string;
  adSetOrAdGroupName: string;
  adId: string;
  adName: string;
  creativeId: string;
  creativeName: string;
  formId: string;
  formName: string;
  keyword: string;
  searchTerm: string;
  landingPage: string;
  blogTitle: string;
  state: string;
  city: string;
  language: string;
  goldWeight: string;
  leadType: string;
  importFileName: string;
  autoDialLeadId: string;
  queueStatus: string;
  currentStage: string;
  businessStage: string;
  disposition: string;
  assignedAgentId: string;
  assignedAgentName: string;
  assignedAt: string;
  dialStartedAt: string;
  completedAt: string;
  latestError: string;
  callAttempts: number;
  connectedCalls: number;
  totalTalkSeconds: number;
  totalTalkTime: string;
  latestCallAt: string;
  billStatus: string;
  billCount: number;
  billDate: string;
  billAmount: number;
  billIds: string;
  billingGrossWeight: number;
  creditedAgent: string;
  timeline: SeoMarketingLeadTimelineEvent[];
}

export interface SeoMarketingSummary {
  leadsToday: number;
  uniqueLeadsToday: number;
  contactedToday: number;
  connectedToday: number;
  followUpsToday: number;
  qualifiedLeadsToday: number;
  lostLeadsToday: number;
  billsToday: number;
  billedLeadsToday?: number;
  leadToBillConversionRate: number;
  totalBillingAmountToday: number;
  totalBillingGrossWeightToday?: number;
  campaignSpendToday: number;
  costPerLead: number;
  costPerBill: number;
}

export interface SeoMarketingAggregateRow {
  key: string;
  platform: string;
  source: string;
  campaignId: string;
  campaignName: string;
  adSetOrAdGroup: string;
  adOrCreative: string;
  form: string;
  keyword: string;
  searchTerm: string;
  landingPage: string;
  blogTitle: string;
  leads: number;
  contacted: number;
  connected: number;
  followUp: number;
  ql: number;
  lost: number;
  bills: number;
  spend: number;
  clicks: number;
  impressions: number;
  billingAmount: number;
  billingGrossWeight?: number;
  conversionRate: number;
  costPerLead: number;
  costPerBill: number;
  roas: number;
}

export interface SeoMarketingSpendRow {
  date: string;
  platform: string;
  adAccount: string;
  campaignId: string;
  campaignName: string;
  adSetOrAdGroup: string;
  adOrCreative: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  uniqueLeads: number;
  qualifiedLeads: number;
  billedLeads: number;
  billRecords: number;
  billingAmount: number;
  cpl: number;
  costPerQualifiedLead: number;
  costPerBill: number;
  roas: number;
  lastSyncedAt: string;
  syncStatus: string;
}

export interface SeoMarketingSpendResponse {
  metric: "spend";
  totalSpend: number;
  page: number;
  limit: number;
  totalRows: number;
  totalPages: number;
  rows: SeoMarketingSpendRow[];
  error?: string;
}

export interface SeoMarketingLeadDashboardResponse {
  range: {
    startDate: string;
    endDate: string;
    startDateTime?: string;
    endDateTime?: string;
  };
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  metric?: string;
  partialSummary?: boolean;
  summary: SeoMarketingSummary;
  sourceFunnel: SeoMarketingAggregateRow[];
  campaignPerformance: SeoMarketingAggregateRow[];
  keywordPerformance: SeoMarketingAggregateRow[];
  landingPagePerformance: SeoMarketingAggregateRow[];
  billConversionHistory: SeoMarketingLeadRow[];
  rows: SeoMarketingLeadRow[];
  error?: string;
}

export interface SeoMarketingLeadDashboardQuery {
  role?: string;
  startDate?: string;
  endDate?: string;
  metric?: string;
  view?: string;
  platform?: string;
  source?: string;
  campaign?: string;
  keyword?: string;
  searchTerm?: string;
  landingPage?: string;
  state?: string;
  language?: string;
  search?: string;
  page?: number;
  limit?: number;
  /** Bypasses the short-lived dashboard response cache without forcing a remote sync. */
  refresh?: number;
  exportScope?: "current" | "all";
}

export interface GoogleMarketingIntegrationStatus {
  configured: boolean;
  source: string;
  credentialPath: string;
  projectId: string;
  clientEmail: string;
  clientId: string;
  emailMatchesExpected: boolean;
  clientIdMatchesExpected: boolean;
  scopes: string[];
  tokenStatus: "not_checked" | "valid" | "failed" | string;
  tokenExpiresAt: string;
  tokenError: string;
  ga4: {
    configured: boolean;
    propertyId: string;
  };
  searchConsole: {
    configured: boolean;
    siteUrl: string;
  };
  googleAds: {
    configured: boolean;
    authMode?: string;
    customerId: string;
    managerCustomerId?: string;
    apiVersion?: string;
    developerTokenConfigured?: boolean;
    refreshTokenConfigured?: boolean;
    serviceAccountConfigured?: boolean;
    serviceAccountUsable: boolean;
    tokenStatus?: string;
    tokenError?: string;
    verifiedAt?: string;
  };
  warnings: string[];
  updatedAt: string;
  error?: string;
}

export interface TodayLeadSourceCounts {
  date: string;
  website: number;
  google?: number;
  blogs?: number;
  justdial: number;
  meta: number;
  error?: string;
}

export interface RealBranchRecord extends Branch {
  address?: string;
  area?: string;
  state?: string;
  pincode?: string;
  timings?: string;
  latitude?: string;
  longitude?: string;
  url?: string;
  mapUrl?: string;
  bitlyUrl?: string;
  distance?: number | null;
}

export interface BranchUpsertPayload {
  branchId?: string;
  branchName?: string;
  addressline?: string;
  area?: string;
  city: string;
  state?: string;
  pincode?: string;
  timings?: string;
  url?: string;
  mapUrl?: string;
  bitlyUrl?: string;
  name?: string;
}

export interface NearbyBranchRecord extends RealBranchRecord {
  address?: string;
}

export interface PlaceSuggestionRecord {
  description: string;
  lat?: number | null;
  lng?: number | null;
  placeId?: string;
  district?: string;
  state?: string;
  source?: string;
}

export interface GeocodePlaceResult {
  lat?: number | null;
  lng?: number | null;
  district?: string;
  state?: string;
  label?: string;
  error?: string;
}

export interface SmsResult {
  success?: boolean;
  error?: string;
  provider?: string;
  providerMessageId?: string | null;
  branchUrl?: string;
}

export interface SmsLogRecord {
  id?: number;
  phone?: string;
  branch_id?: string;
  branch_name?: string;
  message?: string;
  status?: string;
  provider?: string;
  message_type?: string;
  source?: string;
  client_message_id?: string;
  provider_message_id?: string;
  delivery_status?: string;
  delivery_status_code?: string;
  delivery_reason?: string;
  submitted_at?: string;
  sent_at?: string;
  delivered_at?: string;
  status_updated_at?: string;
  country?: string;
  iso_code?: string;
  network?: string;
  cost?: string | number | null;
  units?: string | number | null;
  created_at?: string;
  updated_at?: string;
}

export type SmsLogStatusFilter = "all" | "delivered" | "failed" | "pending";

export interface SmsLogSummary {
  all: number;
  delivered: number;
  failed: number;
  pending: number;
}

export interface SmsLogPage {
  rows: SmsLogRecord[];
  totalRecords: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: SmsLogSummary;
}

export interface MutationResult {
  success?: boolean;
  error?: string;
  status?: number;
  code?: string;
  stage?: string;
  network?: boolean;
  workflow?: IntakeWorkflowRecord | null;
}

export type AdminBroadcastRecipientScope = "all" | "online" | "incoming" | "outgoing" | "follow-up" | "manual-dial";
export type AdminBroadcastExpiry = "until-cleared" | "30-minutes" | "1-hour" | "2-hours" | "end-of-day";

export interface AdminBroadcastRecord {
  id?: number;
  message: string;
  recipientScope: AdminBroadcastRecipientScope;
  expiry: AdminBroadcastExpiry;
  expiresAt?: string | null;
  sentById?: string;
  sentByName?: string;
  sentAt?: string;
  clearedAt?: string | null;
  clearedById?: string;
  clearedByName?: string;
  active?: boolean;
}

export interface AdminBroadcastResponse {
  active: boolean;
  message: string;
  broadcast?: AdminBroadcastRecord | null;
}

export interface IntakeWorkflowRecord {
  callId: string; intakeToken: string; agentId: string; revision: number;
  confirmedEndedAt: string | null; autoSubmitAt: string | null; submittedAt: string | null;
  dispositionSelectedAt: string | null;
  submissionMethod: string | null; requiresReview: string[]; pendingServerSave: boolean;
  draft: Record<string, unknown>; serverNow: string;
}

export interface IvrCacheSyncPayload {
  phone: string;
  language?: string;
  businessType?: string;
  purpose?: string;
  agentId?: string;
  agentName?: string;
  source?: string;
}

export interface IvrCacheSyncResult extends MutationResult {
  ok?: boolean;
}

export interface BlockedNumberRecord {
  phone: string;
  blocked: boolean;
  blockedById?: string;
  blockedByName?: string;
  sourceCallId?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FollowUpStatusUpdatePayload {
  status: FollowUpRecord["status"];
  outcome?: string;
  followUpAt?: string;
}

export interface AutoDialLeadUpdatePayload {
  status?: AutoDialLeadRecord["status"];
  callId?: string;
  lastError?: string;
  queueExitReason?: AutoDialQueueExitReason | string;
  retryAllowed?: boolean;
  assignedAgentId?: string;
  assignedAgentName?: string;
}

export interface CallsByPhoneResult {
  phone: string;
  total: number;
  results: CallRecord[];
}

export interface CustomerProfileResult {
  phone: string;
  customerId?: string;
  customerUid?: string;
  customerName: string;
  mob2: string;
  age: string;
  gender: string;
  district: string;
  location: string;
  branch: string;
  language: string;
  businessType: string;
  metalType: string;
  grams: string;
  releaseGrossAmount: string;
  releasingAmount: string;
  pledgePlace?: string;
  otherPledgePlace?: string;
  differenceAmount?: string;
  bankName: string;
  onlinePrice: string;
  pricePerGram: string;
  advertisement: string;
  lead: string;
  formStatus: string;
  purpose: string;
  statusFollowUpAt?: string;
  notes: string;
  latestCallStatus?: string;
  latestStatus?: string;
  latestFormStatus?: string;
  latestDisposition?: string;
  latestDispositionCategory?: string;
  hasSavedDetails: boolean;
}

export interface IntakeFormHistoryResult {
  phone: string;
  total: number;
  results: CallRecord[];
}

export interface TransferContextRecord {
  id: string;
  phone: string;
  requestedById?: string;
  sourceExtension?: string;
  sourceCallId?: string;
  intakeToken?: string;
  targetExtension?: string;
  customerName: string;
  mob2: string;
  age: string;
  gender: string;
  district: string;
  location: string;
  branch: string;
  language: string;
  businessType: string;
  metalType: string;
  grams: string;
  releaseGrossAmount: string;
  releasingAmount: string;
  pledgePlace?: string;
  otherPledgePlace?: string;
  differenceAmount?: string;
  bankName: string;
  onlinePrice: string;
  pricePerGram: string;
  advertisement: string;
  lead: string;
  formStatus: string;
  purpose: string;
  notes: string;
  disposition?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CallsByDateResult {
  date: string;
  total: number;
  inbound: number;
  outbound: number;
  summary?: StatsRecord;
  results: CallRecord[];
}

export interface ApiLoadResult<T> {
  ok: boolean;
  data: T;
  status?: number;
  network?: boolean;
}

export interface CallsListResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  summary?: StatsRecord;
  results: CallRecord[];
}

export interface CallsReportSummaryResult {
  summary: StatsRecord;
  hourly: Array<{ hour: string; calls: number }>;
  branches: Array<{ branch: string; calls: number }>;
  purposes: Array<{ purpose: string; calls: number }>;
  dispositions: Array<{ disposition: string; calls: number }>;
  dispositionCategories: Array<{ category: string; calls: number }>;
  sources: string[];
  agents: Array<{
    id?: string;
    name: string;
    total: number;
    inbound?: number;
    outbound?: number;
    answered: number;
    missed: number;
    totalTalkTimeSeconds?: number;
    avgDurationSeconds?: number;
  }>;
  rowCount: number;
  maxRows: number;
}

export interface CallsListParams {
  page?: number;
  limit?: number;
  dedupe?: boolean;
  signal?: AbortSignal;
  date?: string;
  fromDate?: string;
  toDate?: string;
  agentId?: string;
  direction?: string;
  status?: string;
  disposition?: string;
  dispositionCategory?: string;
  source?: string;
  language?: string;
  branch?: string;
  search?: string;
}

export interface IncomingCallQueueRecord {
  id: string;
  callerId: string;
  customerName: string;
  date: string;
  time: string;
  language: string;
  callbackStatus: string;
}

export interface LiveWaitingQueueMemberRecord {
  name: string;
  extension: string;
  status: string;
  paused: boolean;
  pausedForSeconds: number;
}

export interface LiveWaitingQueueCallerRecord {
  position: number;
  channel: string;
  customerNumber: string;
  waitTime: string;
  waitTimeSeconds: number;
  priority: string;
}

export interface LiveWaitingQueueRecord {
  queueName: string;
  language: string;
  strategy: string;
  waitingCalls: number;
  completedCalls: number;
  abandonedCalls: number;
  holdTimeSeconds: number;
  talkTimeSeconds: number;
  serviceLevel: string;
  serviceLevel2: string;
  availableMembers: number;
  unavailableMembers: number;
  pausedMembers: number;
  members: LiveWaitingQueueMemberRecord[];
  callers: LiveWaitingQueueCallerRecord[];
}

export interface LiveWaitingQueueSnapshot {
  generatedAt: string;
  totalWaiting: number;
  queues: LiveWaitingQueueRecord[];
}

export interface QueueJustDialLeadResult extends MutationResult {
  autoDialLeadId?: string;
  alreadyQueued?: boolean;
}

export interface QueueWebsiteLeadResult extends MutationResult {
  autoDialLeadId?: string;
  alreadyQueued?: boolean;
}

export interface ExportSourceFollowUpsResult extends MutationResult {
  source?: "website" | "justdial" | "meta" | "blogs";
  requested?: number;
  processed?: number;
  skipped?: number;
}

export interface StatusFollowUpQueueRecord {
  id: string;
  sourceCallId: string;
  customerName: string;
  phone: string;
  branch: string;
  formStatus: string;
  agentId: string;
  agentName: string;
  direction: string;
  language: string;
  location: string;
  purpose: string;
  notes: string;
  autoDialLeadId: string;
  autoDialStatus: string;
  scheduledFor?: string;
  scheduledAgentId?: string;
  scheduledAgentName?: string;
  autoDialAssignedAgentId?: string;
  autoDialAssignedAgentName?: string;
  autoDialLastError?: string;
  followUpId: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversionApiRecord {
  billId: string;
  customerName: string;
  contact: string;
  type: string;
  branch: string;
  date: string;
  time: string;
  status: string;
  source?: string;
  transactionStatus?: string;
  billAmount?: number;
  dispositionCategory?: string;
  grossW: string;
  netW: string;
  walkinType: string;
}

export interface CustomerDataDashboardRecord extends ConversionApiRecord {
  firstAgentName: string;
}

export interface CustomerDataDashboardResult {
  date: string;
  total: number;
  results: CustomerDataDashboardRecord[];
  lastSyncedAt?: string;
}

export type StatsRecord = Record<string, unknown>;
export type AgentLanguageMap = Record<string, string[]>;
const AUTO_DIAL_IMPORT_BATCH_SIZE = 500;
const RETRYABLE_MUTATION_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const delay = (ms: number) => new Promise((resolve) => {
  globalThis.setTimeout(resolve, ms);
});

const isMutationFallbackRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && ("error" in value || "success" in value)
);

const readErrorLikeString = (value: unknown) => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const directError = typeof record.error === "string" && record.error.trim()
      ? record.error.trim()
      : "";
    if (directError) return directError;

    const directMessage = typeof record.message === "string" && record.message.trim()
      ? record.message.trim()
      : "";
    if (directMessage) return directMessage;
  }

  return "";
};

const buildRequestFallbackError = (
  path: string,
  method = "GET",
  options?: {
    status?: number;
    network?: boolean;
  },
) => {
  const normalizedMethod = method.toUpperCase();
  const statusSuffix = Number.isFinite(options?.status) ? ` (${options?.status})` : "";

  if (path.includes("/call-slot/claim")) {
    return options?.network
      ? "Unable to reserve the live call slot because the server could not be reached. Refresh and try again."
      : `Unable to reserve the live call slot${statusSuffix}.`;
  }

  if (path.includes("/call-slot/release")) {
    return options?.network
      ? "Unable to release the live call slot because the server could not be reached."
      : `Unable to release the live call slot${statusSuffix}.`;
  }

  if (path.includes("/call-state/reset")) {
    return options?.network
      ? "Unable to reset the live call state because the server could not be reached."
      : `Unable to reset the live call state${statusSuffix}.`;
  }

  if (path.includes("/transfer-context/resolve")) {
    return options?.network
      ? "Unable to clear the transfer context because the server could not be reached."
      : `Unable to clear the transfer context${statusSuffix}.`;
  }

  if (path.includes("/transfer-context")) {
    return options?.network
      ? "Unable to save the transfer context because the server could not be reached."
      : `Unable to save the transfer context${statusSuffix}.`;
  }

  if (path.includes("/save-call-ivr")) {
    return options?.network
      ? "Unable to sync the IVR selection because the server could not be reached."
      : `Unable to sync the IVR selection${statusSuffix}.`;
  }

  if (options?.network) {
    return normalizedMethod === "GET"
      ? "Unable to reach the server."
      : "Unable to reach the server for this request.";
  }

  return normalizedMethod === "GET"
    ? `Unable to load data${statusSuffix}.`
    : `Unable to complete the request${statusSuffix}.`;
};

const resolveMutationFallbackError = (
  fallbackValue: unknown,
  path: string,
  method?: string,
  options?: {
    status?: number;
    network?: boolean;
  },
) => {
  const fallbackError = readErrorLikeString(fallbackValue);
  if (fallbackError && fallbackError.toLowerCase() !== "error") {
    return fallbackError;
  }
  return buildRequestFallbackError(path, method, options);
};

type ApiRequestError = Error & {
  status?: number;
  network?: boolean;
};

const createApiRequestError = (
  message: string,
  options?: {
    status?: number;
    network?: boolean;
  },
) => {
  const error = new Error(message) as ApiRequestError;
  error.status = options?.status;
  error.network = options?.network === true;
  return error;
};

const isApiRequestError = (value: unknown): value is ApiRequestError => (
  value instanceof Error && ("status" in value || "network" in value)
);

async function readJson<T>(path: string, init?: RequestInit, fallback?: T): Promise<T> {
  try {
    const response = await fetchJsonPayload(path, init, null);
    if (!response.ok) {
      if (isMutationFallbackRecord(fallback)) {
        const mergedFallback = {
          ...fallback,
          ...(typeof response.payload === "object" && response.payload !== null ? response.payload as Record<string, unknown> : {}),
        } as Record<string, unknown>;

        mergedFallback.error = resolveMutationFallbackError(
          mergedFallback.error,
          path,
          init?.method,
          { status: response.status },
        );
        mergedFallback.success = false;
        return mergedFallback as T;
      }
      return fallback as T;
    }
    return response.payload as T;
  } catch (error) {
    console.error(`API request failed for ${path}:`, error);
    if (isMutationFallbackRecord(fallback)) {
      const mergedFallback = { ...fallback } as Record<string, unknown>;
      mergedFallback.error = resolveMutationFallbackError(
        mergedFallback.error,
        path,
        init?.method,
        { network: true },
      );
      mergedFallback.success = false;
      return mergedFallback as T;
    }
    return fallback as T;
  }
}

async function readJsonResult<T>(path: string, init: RequestInit | undefined, fallback: T): Promise<ApiLoadResult<T>> {
  try {
    const response = await fetchJsonPayload(path, init, undefined);
    if (!response.ok || response.payload === undefined) {
      return {
        ok: false,
        data: fallback,
        status: response.status,
      };
    }

    return {
      ok: true,
      data: response.payload as T,
      status: response.status,
    };
  } catch (error) {
    console.error(`API request failed for ${path}:`, error);
    return {
      ok: false,
      data: fallback,
      network: true,
    };
  }
}

async function fetchJsonPayload(path: string, init: RequestInit | undefined, emptyPayload: unknown): Promise<ApiFetchPayload> {
  const method = String(init?.method || "GET").toUpperCase();
  const url = buildApiUrl(path);
  const canDedupe = method === "GET" && !init?.signal;
  const key = canDedupe ? url : "";

  const execute = async (): Promise<ApiFetchPayload> => {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => emptyPayload);
    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  };

  if (!canDedupe) return execute();

  const existing = inFlightGetRequests.get(key);
  if (existing) return existing;

  const promise = execute().finally(() => {
    inFlightGetRequests.delete(key);
  });
  inFlightGetRequests.set(key, promise);
  return promise;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

const coerceString = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const coerceBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
};

const coerceNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeIncomingFiveOfTenGateAction = (value: unknown): IncomingFiveOfTenGateAction => (
  coerceString(value).toLowerCase() === "disconnect" ? "disconnect" : "route"
);

function buildQueryString(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

const emptySeoMarketingLeadDashboardResponse = (): SeoMarketingLeadDashboardResponse => ({
  range: { startDate: "", endDate: "" },
  page: 1,
  limit: 50,
  total: 0,
  totalPages: 1,
  summary: {
    leadsToday: 0,
    uniqueLeadsToday: 0,
    contactedToday: 0,
    connectedToday: 0,
    followUpsToday: 0,
    qualifiedLeadsToday: 0,
    lostLeadsToday: 0,
    billsToday: 0,
    billedLeadsToday: 0,
    leadToBillConversionRate: 0,
    totalBillingAmountToday: 0,
    totalBillingGrossWeightToday: 0,
    campaignSpendToday: 0,
    costPerLead: 0,
    costPerBill: 0,
  },
  sourceFunnel: [],
  campaignPerformance: [],
  keywordPerformance: [],
  landingPagePerformance: [],
  billConversionHistory: [],
  rows: [],
});

const normalizeIncomingFiveOfTenGateStatus = (payload: unknown): IncomingFiveOfTenGateStatus => {
  const record = isRecord(payload) ? payload : {};
  const patternPayload = Array.isArray(record.pattern) ? record.pattern : [];
  const cycleSize = Math.max(1, Math.trunc(coerceNumber(record.cycleSize, 5)));
  const fallbackPattern = Array.from({ length: cycleSize }, (_, index) => {
    const position = index + 1;
    const action: IncomingFiveOfTenGateAction = position === 1 || position === 3 ? "route" : "disconnect";
    return {
      position,
      action,
      label: action === "route" ? "Route to agent" : "Disconnect",
    };
  });
  const pattern = patternPayload.length > 0
    ? patternPayload.map((item, index) => {
      const row = isRecord(item) ? item : {};
      const position = Math.max(1, Math.min(cycleSize, Math.trunc(coerceNumber(row.position, index + 1))));
      const action = normalizeIncomingFiveOfTenGateAction(row.action);
      return {
        position,
        action,
        label: coerceString(row.label) || (action === "route" ? "Route to agent" : "Disconnect"),
      };
    })
    : fallbackPattern;

  return {
    configured: coerceBoolean(record.configured),
    active: coerceBoolean(record.active),
    expired: coerceBoolean(record.expired),
    pending: coerceBoolean(record.pending),
    statusLabel: coerceString(record.statusLabel) || "Unknown",
    targetDate: coerceString(record.targetDate),
    todayIst: coerceString(record.todayIst),
    counter: Math.max(0, Math.min(cycleSize, Math.trunc(coerceNumber(record.counter)))),
    rejectedCount: Math.max(0, Math.trunc(coerceNumber(record.rejectedCount))),
    totalRejectedCount: Math.max(0, Math.trunc(coerceNumber(record.totalRejectedCount, coerceNumber(record.rejectedCount)))),
    stopLimit: Math.max(0, Math.trunc(coerceNumber(record.stopLimit))),
    stopCount: Math.max(0, Math.trunc(coerceNumber(record.stopCount))),
    stopRemaining: Math.max(0, Math.trunc(coerceNumber(record.stopRemaining))),
    hardStopActive: coerceBoolean(record.hardStopActive),
    rateLimitSeconds: Math.max(0, Math.trunc(coerceNumber(record.rateLimitSeconds))),
    rateLimitActive: coerceBoolean(record.rateLimitActive),
    lastRouteEpoch: Math.max(0, Math.trunc(coerceNumber(record.lastRouteEpoch))),
    secondsSinceLastRoute: Math.max(0, Math.trunc(coerceNumber(record.secondsSinceLastRoute))),
    rateLimitRemainingSeconds: Math.max(0, Math.trunc(coerceNumber(record.rateLimitRemainingSeconds))),
    cycleSize,
    allowedPerCycle: Math.max(0, Math.trunc(coerceNumber(record.allowedPerCycle, 2))),
    rejectedPerCycle: Math.max(0, Math.trunc(coerceNumber(record.rejectedPerCycle, 3))),
    nextPosition: Math.max(0, Math.min(cycleSize, Math.trunc(coerceNumber(record.nextPosition)))),
    nextAction: normalizeIncomingFiveOfTenGateAction(record.nextAction),
    pattern,
    updatedAt: coerceString(record.updatedAt),
  };
};

const callDirectionValues = new Set<CallRecord["direction"]>(["incoming", "outgoing"]);
const callStatusValues = new Set<CallRecord["status"]>([
  "answered",
  "missed",
  "failed",
  "transferred",
  "active",
  "on-hold",
  "completed",
]);
const followUpStatusValues = new Set<FollowUpRecord["status"]>(["Pending", "Called", "Rescheduled"]);
const agentRoleValues = new Set<UserRole>(["admin", "superadmin", "agent", "qc", "seo"]);
const agentStatusValues = new Set<NonNullable<AgentRecord["status"]>>([
  "active",
  "inactive",
  "online",
  "offline",
  "wrap-up",
  "on-break",
  "lunch-break",
  "restroom-break",
  "outbound-auto",
  "follow-up",
  "manual-outgoing",
]);
const autoDialStatusValues = new Set<AutoDialLeadRecord["status"]>(["pending", "assigned", "dialing", "completed", "failed"]);

const canonicalizeCallRecordId = (value: unknown) => {
  const normalized = coerceString(value);
  if (!normalized) return "";

  const separatorIndex = normalized.indexOf("|");
  if (separatorIndex <= 0) return normalized;

  const canonicalId = normalized.slice(0, separatorIndex).trim();
  return canonicalId || normalized;
};

const canonicalizeCallIntakeToken = (value: unknown) => {
  const normalized = coerceString(value);
  if (!normalized.startsWith("INTAKE-CALL-")) return normalized;

  const canonicalCallId = canonicalizeCallRecordId(normalized.slice("INTAKE-CALL-".length));
  return canonicalCallId ? `INTAKE-CALL-${canonicalCallId}` : normalized;
};

const buildFallbackCallId = (row: Record<string, unknown>) => (
  canonicalizeCallRecordId(row.id)
  || canonicalizeCallRecordId(row.callId)
  || canonicalizeCallRecordId(row.callUuid)
  || [
    coerceString(row.callerId),
    coerceString(row.phone),
    coerceString(row.createdAt),
    coerceString(row.date),
    coerceString(row.time),
  ].filter(Boolean).join("|")
  || "unknown-call"
);

const parseDurationToSeconds = (value: string | undefined) => {
  const normalized = coerceString(value);
  if (!normalized) return 0;

  const parts = normalized.split(":").map((part) => Number(part));
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part) && part >= 0)) {
    return (parts[0] * 60) + parts[1];
  }

  return 0;
};

const preferEarlierDateTimeString = (current: string | undefined, candidate: string | undefined) => {
  const currentValue = coerceString(current);
  const candidateValue = coerceString(candidate);
  const currentTimestamp = new Date(currentValue).getTime();
  const candidateTimestamp = new Date(candidateValue).getTime();

  if (!Number.isFinite(currentTimestamp)) return candidateValue;
  if (!Number.isFinite(candidateTimestamp)) return currentValue;
  return candidateTimestamp < currentTimestamp ? candidateValue : currentValue;
};

const preferLaterDateTimeString = (current: string | undefined, candidate: string | undefined) => {
  const currentValue = coerceString(current);
  const candidateValue = coerceString(candidate);
  const currentTimestamp = new Date(currentValue).getTime();
  const candidateTimestamp = new Date(candidateValue).getTime();

  if (!Number.isFinite(currentTimestamp)) return candidateValue;
  if (!Number.isFinite(candidateTimestamp)) return currentValue;
  return candidateTimestamp > currentTimestamp ? candidateValue : currentValue;
};

const preferLongerString = (current: string | undefined, candidate: string | undefined) => {
  const currentValue = coerceString(current);
  const candidateValue = coerceString(candidate);

  if (!currentValue) return candidateValue;
  if (!candidateValue) return currentValue;
  return candidateValue.length > currentValue.length ? candidateValue : currentValue;
};

const isMeaningfulCustomerNameValue = (value: unknown) => {
  const normalized = coerceString(value);
  if (!normalized) return false;
  if (/\d{5,}/.test(normalized)) return false;
  if (/\b(call|dial)\b/i.test(normalized)) return false;

  const compact = normalized.toLowerCase().replace(/\s+/g, " ");
  return !new Set([
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
  ]).has(compact);
};

const coerceCustomerNameOrEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = coerceString(value);
    if (isMeaningfulCustomerNameValue(normalized)) {
      return normalized;
    }
  }
  return "";
};

const coerceCustomerNameOrNA = (...values: unknown[]) => (
  coerceCustomerNameOrEmpty(...values) || "N/A"
);

const isMeaningfulCallRecordPayload = (value: Record<string, unknown>) => {
  const canonicalId = (
    canonicalizeCallRecordId(value.id)
    || canonicalizeCallRecordId(value.callId)
    || canonicalizeCallRecordId(value.callUuid)
  );
  const callerId = coerceString(value.callerId || value.phone);
  const callerName = coerceString(value.callerName);
  const customerName = coerceString(value.customerName || value.displayCustomerName);
  const agentId = coerceString(value.agentId);
  const agentName = coerceString(value.agentName);
  const direction = coerceString(value.direction);
  const createdAt = coerceString(
    value.ringStartedAt
    || value.answeredAt
    || value.createdAt
    || value.endedAt
  );

  return Boolean(
    canonicalId
    && (callerId || callerName || customerName || agentId || agentName || direction || createdAt)
  );
};

const pickStableCallRecordId = (current: CallRecord, candidate: CallRecord) => {
  if (!current.id) return candidate.id;
  if (!candidate.id) return current.id;
  if (current.id === candidate.id) return current.id;

  const currentTimestamp = new Date(coerceString(current.createdAt)).getTime();
  const candidateTimestamp = new Date(coerceString(candidate.createdAt)).getTime();

  if (!Number.isFinite(currentTimestamp)) return candidate.id;
  if (!Number.isFinite(candidateTimestamp)) return current.id;
  return candidateTimestamp < currentTimestamp ? candidate.id : current.id;
};

const mergeCallRecords = (current: CallRecord, candidate: CallRecord): CallRecord => {
  const currentDurationSeconds = Math.max(parseDurationToSeconds(current.duration), current.talkDurationSeconds ?? 0);
  const candidateDurationSeconds = Math.max(parseDurationToSeconds(candidate.duration), candidate.talkDurationSeconds ?? 0);
  const stableCallId = pickStableCallRecordId(current, candidate);

  return {
    ...current,
    ...candidate,
    id: stableCallId,
    customerId: current.customerId || candidate.customerId,
    customerUid: current.customerUid || candidate.customerUid || current.customerId || candidate.customerId,
    intakeToken: current.intakeToken || candidate.intakeToken || (stableCallId ? `INTAKE-CALL-${stableCallId}` : ""),
    duration: candidateDurationSeconds > currentDurationSeconds ? candidate.duration : current.duration,
    talkDurationSeconds: Math.max(current.talkDurationSeconds ?? 0, candidate.talkDurationSeconds ?? 0),
    hasRecording: current.hasRecording || candidate.hasRecording,
    ringStartedAt: preferEarlierDateTimeString(current.ringStartedAt, candidate.ringStartedAt),
    answeredAt: preferEarlierDateTimeString(current.answeredAt, candidate.answeredAt),
    endedAt: preferLaterDateTimeString(current.endedAt, candidate.endedAt),
    callbackStatus: current.callbackStatus || candidate.callbackStatus,
    leadSource: current.leadSource || candidate.leadSource,
    carrierTrunk: current.carrierTrunk || candidate.carrierTrunk,
    trunkCode: current.trunkCode || candidate.trunkCode,
    pilot: current.pilot || candidate.pilot,
    didOrCli: current.didOrCli || candidate.didOrCli,
    displayCustomerName: preferLongerString(current.displayCustomerName, candidate.displayCustomerName),
    customerName: preferLongerString(current.customerName, candidate.customerName),
    callerName: preferLongerString(current.callerName, candidate.callerName),
    agentName: preferLongerString(current.agentName, candidate.agentName),
    notes: preferLongerString(current.notes, candidate.notes),
    mob2: current.mob2 || candidate.mob2,
    district: current.district || candidate.district,
    businessType: current.businessType || candidate.businessType,
    metalType: current.metalType || candidate.metalType,
    grams: current.grams || candidate.grams,
    releaseGrossAmount: current.releaseGrossAmount || candidate.releaseGrossAmount,
    releasingAmount: current.releasingAmount || candidate.releasingAmount,
    pledgePlace: current.pledgePlace || candidate.pledgePlace,
    otherPledgePlace: current.otherPledgePlace || candidate.otherPledgePlace,
    differenceAmount: current.differenceAmount || candidate.differenceAmount,
    bankName: current.bankName || candidate.bankName,
    onlinePrice: current.onlinePrice || candidate.onlinePrice,
    pricePerGram: current.pricePerGram || candidate.pricePerGram,
    advertisement: current.advertisement || candidate.advertisement,
    lead: current.lead || candidate.lead,
    formStatus: current.formStatus || candidate.formStatus,
    statusFollowUpAt: current.statusFollowUpAt || candidate.statusFollowUpAt,
    smsSent: current.smsSent || candidate.smsSent,
    createdAt: preferEarlierDateTimeString(current.createdAt, candidate.createdAt),
  };
};

const buildCallRecordAliasKeys = (record: CallRecord) => {
  const aliases = new Set<string>();
  const normalizedCallerId = coerceString(record.callerId).replace(/[^0-9]/g, "").slice(-10);
  const normalizedDirection = coerceString(record.direction);
  const normalizedAgentId = coerceString(record.agentId);
  const interactionTime = coerceString(
    record.answeredAt
    || record.ringStartedAt
    || record.createdAt
    || record.endedAt
  ).replace("T", " ").slice(0, 19);
  const canonicalId = coerceString(record.id);
  const intakeToken = coerceString(record.intakeToken);

  if (canonicalId) {
    aliases.add(`id:${canonicalId}`);
  }
  if (normalizedCallerId && normalizedDirection && interactionTime) {
    aliases.add(`interaction:${normalizedAgentId}:${normalizedCallerId}:${normalizedDirection}:${interactionTime}`);
  }
  if (intakeToken) {
    aliases.add(`token:${intakeToken}`);
  }

  return Array.from(aliases);
};

const normalizeCallRecord = (value: unknown): CallRecord | null => {
  if (!isRecord(value)) return null;
  if (!isMeaningfulCallRecordPayload(value)) return null;

  const directionCandidate = coerceString(value.direction);
  const statusCandidate = coerceString(value.status);

  const callerName = coerceCustomerNameOrEmpty(value.callerName);
  const customerName = coerceCustomerNameOrEmpty(value.customerName);
  const displayCustomerName = coerceCustomerNameOrEmpty(value.displayCustomerName, value.customerName, value.callerName);
  const callerId = coerceString(value.callerId || value.phone);
  const customerUid = coerceString(value.customerUid || value.customerId) || buildCustomerUid(callerId);

  return {
    id: buildFallbackCallId(value),
    callerId,
    customerId: customerUid,
    customerUid,
    callerName,
    customerName,
    displayCustomerName,
    intakeToken: canonicalizeCallIntakeToken(value.intakeToken),
    agentId: coerceString(value.agentId),
    agentName: coerceString(value.agentName),
    direction: callDirectionValues.has(directionCandidate as CallRecord["direction"])
      ? directionCandidate as CallRecord["direction"]
      : "outgoing",
    status: callStatusValues.has(statusCandidate as CallRecord["status"])
      ? statusCandidate as CallRecord["status"]
      : "completed",
    duration: coerceString(value.duration),
    time: coerceString(value.time),
    date: coerceString(value.date),
    language: coerceString(value.language),
    hasRecording: coerceBoolean(value.hasRecording, false),
    recordingName: coerceString(value.recordingName),
    ringStartedAt: coerceString(value.ringStartedAt),
    answeredAt: coerceString(value.answeredAt),
    endedAt: coerceString(value.endedAt),
    talkDurationSeconds: coerceNumber(value.talkDurationSeconds, 0),
    branch: coerceString(value.branch),
    place: coerceString(value.place || value.location),
    purpose: coerceString(value.purpose),
    callbackStatus: coerceString(value.callbackStatus || value.disposition),
    dispositionCategory: coerceString(value.dispositionCategory || value.disposition_category),
    followUpFlag: coerceBoolean(value.followUpFlag, false),
    leadSource: coerceString(value.leadSource || value.source || value.sourceFile || value.leadFrom || value.lead_from),
    carrierTrunk: coerceString(value.carrierTrunk || value.carrier_trunk),
    trunkCode: coerceString(value.trunkCode || value.trunk_code),
    pilot: coerceString(value.pilot),
    didOrCli: coerceString(value.didOrCli || value.did_or_cli || value.inboundDid || value.inbound_did),
    mob2: coerceString(value.mob2),
    age: coerceString(value.age),
    gender: coerceString(value.gender),
    district: coerceString(value.district),
    businessType: coerceString(value.businessType),
    metalType: coerceString(value.metalType),
    grams: coerceString(value.grams),
    releaseGrossAmount: coerceString(value.releaseGrossAmount || value.release_gross_amount),
    releasingAmount: coerceString(value.releasingAmount),
    pledgePlace: coerceString(value.pledgePlace || value.pledge_place),
    otherPledgePlace: coerceString(value.otherPledgePlace || value.other_pledge_place),
    differenceAmount: coerceString(value.differenceAmount || value.difference_amount),
    bankName: coerceString(value.bankName),
    onlinePrice: coerceString(value.onlinePrice),
    pricePerGram: coerceString(value.pricePerGram),
    advertisement: coerceString(value.advertisement),
    lead: coerceString(value.lead),
    formStatus: coerceString(value.formStatus),
    statusFollowUpAt: coerceString(value.statusFollowUpAt),
    quickNote: coerceString(value.quickNote || value.quick_note),
    notes: coerceString(value.notes),
    smsSent: coerceBoolean(value.smsSent, false),
    createdAt: coerceString(value.createdAt),
    callbackQueueStatus: coerceString(value.callbackQueueStatus),
    callbackCallId: coerceString(value.callbackCallId),
    callbackResult: coerceString(value.callbackResult),
    callbackDisposition: coerceString(value.callbackDisposition),
    callbackAgentId: coerceString(value.callbackAgentId),
    callbackAgentName: coerceString(value.callbackAgentName),
    callbackTime: coerceString(value.callbackTime),
    callbackCreatedAt: coerceString(value.callbackCreatedAt),
    callbackEndedAt: coerceString(value.callbackEndedAt),
  };
};

const normalizeCallRecordList = (value: unknown, options: { dedupe?: boolean } = {}) => {
  if (!Array.isArray(value)) return [];

  const records = value
    .map((record) => normalizeCallRecord(record))
    .filter((record): record is CallRecord => Boolean(record));

  return options.dedupe === false ? records : dedupeCallInteractions(records);
};

const normalizeIncomingCallQueueRecord = (value: unknown): IncomingCallQueueRecord | null => {
  if (!isRecord(value)) return null;

  const callerId = coerceString(value.callerId || value.phone);
  const customerName = coerceCustomerNameOrNA(value.customerName, value.displayCustomerName, value.callerName);
  const date = coerceString(value.date);
  const time = coerceString(value.time);

  return {
    id: coerceString(value.id)
      || [callerId, date, time].filter(Boolean).join("|")
      || "unknown-incoming-call-queue",
    callerId,
    customerName,
    date,
    time,
    language: coerceString(value.language),
    callbackStatus: coerceString(value.callbackStatus || value.disposition),
  };
};

const normalizeIncomingCallQueueRecordList = (value: unknown) => (
  Array.isArray(value)
    ? value
      .map((record) => normalizeIncomingCallQueueRecord(record))
      .filter((record): record is IncomingCallQueueRecord => Boolean(record))
    : []
);

const normalizeLiveWaitingQueueMemberRecord = (value: unknown): LiveWaitingQueueMemberRecord | null => {
  if (!isRecord(value)) return null;

  return {
    name: coerceString(value.name),
    extension: coerceString(value.extension),
    status: coerceString(value.status),
    paused: coerceBoolean(value.paused, false),
    pausedForSeconds: coerceNumber(value.pausedForSeconds, 0),
  };
};

const normalizeLiveWaitingQueueCallerRecord = (value: unknown): LiveWaitingQueueCallerRecord | null => {
  if (!isRecord(value)) return null;

  return {
    position: coerceNumber(value.position, 0),
    channel: coerceString(value.channel),
    customerNumber: coerceString(value.customerNumber),
    waitTime: coerceString(value.waitTime),
    waitTimeSeconds: coerceNumber(value.waitTimeSeconds, 0),
    priority: coerceString(value.priority),
  };
};

const normalizeLiveWaitingQueueRecord = (value: unknown): LiveWaitingQueueRecord | null => {
  if (!isRecord(value)) return null;

  const queueName = coerceString(value.queueName);
  if (!queueName) return null;

  return {
    queueName,
    language: coerceString(value.language),
    strategy: coerceString(value.strategy),
    waitingCalls: coerceNumber(value.waitingCalls, 0),
    completedCalls: coerceNumber(value.completedCalls, 0),
    abandonedCalls: coerceNumber(value.abandonedCalls, 0),
    holdTimeSeconds: coerceNumber(value.holdTimeSeconds, 0),
    talkTimeSeconds: coerceNumber(value.talkTimeSeconds, 0),
    serviceLevel: coerceString(value.serviceLevel),
    serviceLevel2: coerceString(value.serviceLevel2),
    availableMembers: coerceNumber(value.availableMembers, 0),
    unavailableMembers: coerceNumber(value.unavailableMembers, 0),
    pausedMembers: coerceNumber(value.pausedMembers, 0),
    members: Array.isArray(value.members)
      ? value.members
        .map((record) => normalizeLiveWaitingQueueMemberRecord(record))
        .filter((record): record is LiveWaitingQueueMemberRecord => Boolean(record))
      : [],
    callers: Array.isArray(value.callers)
      ? value.callers
        .map((record) => normalizeLiveWaitingQueueCallerRecord(record))
        .filter((record): record is LiveWaitingQueueCallerRecord => Boolean(record))
      : [],
  };
};

const normalizeLiveWaitingQueueSnapshot = (value: unknown): LiveWaitingQueueSnapshot => {
  if (!isRecord(value)) {
    return {
      generatedAt: "",
      totalWaiting: 0,
      queues: [],
    };
  }

  return {
    generatedAt: coerceString(value.generatedAt),
    totalWaiting: coerceNumber(value.totalWaiting, 0),
    queues: Array.isArray(value.queues)
      ? value.queues
        .map((record) => normalizeLiveWaitingQueueRecord(record))
        .filter((record): record is LiveWaitingQueueRecord => Boolean(record))
      : [],
  };
};

const normalizeCallsByPhoneResult = (value: unknown, phone: string): CallsByPhoneResult => {
  const row = isRecord(value) ? value : {};
  const results = normalizeCallRecordList(row.results);
  return {
    phone: coerceString(row.phone) || phone,
    total: coerceNumber(row.total, results.length),
    results,
  };
};

const normalizeIntakeFormHistoryRow = (value: unknown): CallRecord | null => {
  if (!isRecord(value)) return null;

  const createdAt = coerceString(value.lastSavedAt || value.updatedAt || value.createdAt || value.statusFollowUpAt);
  const callId = canonicalizeCallRecordId(value.callId || value.id);
  const callerId = coerceString(value.normalizedPhone || value.phone || value.callerId);
  if (!callId && !callerId) return null;

  const directionCandidate = coerceString(value.direction).toLowerCase();
  const statusCandidate = coerceString(value.status || value.sourceStatus).toLowerCase();
  const callerName = coerceCustomerNameOrEmpty(value.callerName, value.customerName);
  const customerName = coerceCustomerNameOrEmpty(value.customerName, value.callerName);
  return {
    id: callId || buildFallbackCallId({
      id: value.callId || value.id,
      callerId,
      createdAt,
    }),
    callerId,
    callerName,
    customerName,
    displayCustomerName: coerceCustomerNameOrEmpty(customerName, callerName),
    intakeToken: canonicalizeCallIntakeToken(value.intakeToken),
    agentId: coerceString(value.agentId),
    agentName: coerceString(value.agentName),
    direction: callDirectionValues.has(directionCandidate as CallRecord["direction"])
      ? directionCandidate as CallRecord["direction"]
      : "outgoing",
    status: callStatusValues.has(statusCandidate as CallRecord["status"])
      ? statusCandidate as CallRecord["status"]
      : "completed",
    duration: coerceString(value.duration),
    time: coerceString(value.time),
    date: coerceString(value.date),
    language: coerceString(value.language),
    hasRecording: coerceBoolean(value.hasRecording, false),
    ringStartedAt: coerceString(value.ringStartedAt),
    answeredAt: coerceString(value.answeredAt),
    endedAt: coerceString(value.endedAt),
    talkDurationSeconds: coerceNumber(value.talkDurationSeconds, 0),
    branch: coerceString(value.branch),
    place: coerceString(value.place || value.location),
    purpose: coerceString(value.purpose),
    callbackStatus: coerceString(value.callbackStatus || value.disposition),
    dispositionCategory: coerceString(value.dispositionCategory || value.disposition_category),
    followUpFlag: Boolean(coerceString(value.statusFollowUpAt)),
    leadSource: coerceString(value.leadSource || value.source || value.sourceFile || value.leadFrom || value.lead_from),
    carrierTrunk: coerceString(value.carrierTrunk || value.carrier_trunk),
    trunkCode: coerceString(value.trunkCode || value.trunk_code),
    pilot: coerceString(value.pilot),
    didOrCli: coerceString(value.didOrCli || value.did_or_cli || value.inboundDid || value.inbound_did),
    mob2: coerceString(value.mob2),
    age: coerceString(value.age),
    gender: coerceString(value.gender),
    district: coerceString(value.district),
    businessType: coerceString(value.businessType),
    metalType: coerceString(value.metalType),
    grams: coerceString(value.grams),
    releaseGrossAmount: coerceString(value.releaseGrossAmount || value.release_gross_amount),
    releasingAmount: coerceString(value.releasingAmount),
    pledgePlace: coerceString(value.pledgePlace || value.pledge_place),
    otherPledgePlace: coerceString(value.otherPledgePlace || value.other_pledge_place),
    differenceAmount: coerceString(value.differenceAmount || value.difference_amount),
    bankName: coerceString(value.bankName),
    onlinePrice: coerceString(value.onlinePrice),
    pricePerGram: coerceString(value.pricePerGram),
    advertisement: coerceString(value.advertisement),
    lead: coerceString(value.lead),
    formStatus: coerceString(value.formStatus),
    statusFollowUpAt: coerceString(value.statusFollowUpAt),
    quickNote: coerceString(value.quickNote || value.quick_note),
    notes: coerceString(value.notes),
    smsSent: coerceBoolean(value.smsSent, false),
    createdAt,
  };
};

const normalizeIntakeFormHistoryResult = (value: unknown, phone: string): IntakeFormHistoryResult => {
  const row = isRecord(value) ? value : {};
  const normalizedRows = Array.isArray(row.results)
    ? row.results.map((entry) => normalizeIntakeFormHistoryRow(entry)).filter((entry): entry is CallRecord => Boolean(entry))
    : [];
  const results = normalizeCallRecordList(normalizedRows);
  return {
    phone: coerceString(row.phone) || phone,
    total: coerceNumber(row.total, results.length),
    results,
  };
};

const normalizeCustomerDataDashboardRecord = (value: unknown): CustomerDataDashboardRecord | null => {
  if (!isRecord(value)) return null;

  const [normalized] = normalizeConversionPayload([value], coerceString(value.contact || value.normalizedPhone || value.phone));
  if (!normalized) return null;

  return {
    ...normalized,
    firstAgentName: coerceString(value.firstAgentName || value.agentName),
  };
};

const normalizeCustomerDataDashboardResult = (value: unknown, date: string): CustomerDataDashboardResult => {
  const row = isRecord(value) ? value : {};
  const results = Array.isArray(row.results)
    ? row.results
      .map((entry) => normalizeCustomerDataDashboardRecord(entry))
      .filter((entry): entry is CustomerDataDashboardRecord => Boolean(entry))
    : [];

  return {
    date: coerceString(row.date) || date,
    total: coerceNumber(row.total, results.length),
    results,
    ...(row.lastSyncedAt ? { lastSyncedAt: coerceString(row.lastSyncedAt) } : {}),
  };
};

const normalizeCallsByDateResult = (value: unknown, date: string): CallsByDateResult => {
  const row = isRecord(value) ? value : {};
  const results = normalizeCallRecordList(row.results);
  const summary = isRecord(row.summary) ? row.summary : undefined;
  const inbound = results.filter(isCountableIncomingCall).length;
  const outbound = results.filter((record) => record.direction === "outgoing").length;
  const normalized: CallsByDateResult = {
    date: coerceString(row.date) || date,
    total: results.length,
    inbound,
    outbound,
    results,
  };
  if (summary) normalized.summary = summary;
  return normalized;
};

const normalizeCallsListResult = (value: unknown, fallback: { page: number; limit: number }, options: { dedupe?: boolean } = {}): CallsListResult => {
  const row = isRecord(value) ? value : {};
  const results = normalizeCallRecordList(row.results, options);
  const page = coerceNumber(row.page, fallback.page);
  const limit = coerceNumber(row.limit, fallback.limit);
  const total = coerceNumber(row.total, results.length);
  return {
    page,
    limit,
    total,
    totalPages: coerceNumber(row.totalPages, total > 0 && limit > 0 ? Math.ceil(total / limit) : 0),
    summary: isRecord(row.summary) ? row.summary : undefined,
    results,
  };
};

const normalizeCallsReportSummaryResult = (value: unknown): CallsReportSummaryResult => {
  const row = isRecord(value) ? value : {};
  return {
    summary: isRecord(row.summary) ? row.summary : {},
    hourly: Array.isArray(row.hourly)
      ? row.hourly.map((entry) => ({
        hour: coerceString(isRecord(entry) ? entry.hour : ""),
        calls: coerceNumber(isRecord(entry) ? entry.calls : 0, 0),
      }))
      : [],
    branches: Array.isArray(row.branches)
      ? row.branches.map((entry) => ({
        branch: coerceString(isRecord(entry) ? entry.branch : "") || "Unknown",
        calls: coerceNumber(isRecord(entry) ? entry.calls : 0, 0),
      }))
      : [],
    purposes: Array.isArray(row.purposes)
      ? row.purposes.map((entry) => ({
        purpose: coerceString(isRecord(entry) ? entry.purpose : "") || "Other",
        calls: coerceNumber(isRecord(entry) ? entry.calls : 0, 0),
      }))
      : [],
    dispositions: Array.isArray(row.dispositions)
      ? row.dispositions.map((entry) => ({
        disposition: coerceString(isRecord(entry) ? entry.disposition : "") || "None",
        calls: coerceNumber(isRecord(entry) ? entry.calls : 0, 0),
      }))
      : [],
    dispositionCategories: Array.isArray(row.dispositionCategories)
      ? row.dispositionCategories.map((entry) => ({
        category: coerceString(isRecord(entry) ? entry.category : "") || "Unmapped",
        calls: coerceNumber(isRecord(entry) ? entry.calls : 0, 0),
      }))
      : [],
    sources: Array.isArray(row.sources) ? row.sources.map((entry) => coerceString(entry)).filter(Boolean) : [],
    agents: Array.isArray(row.agents)
      ? row.agents.map((entry) => ({
        id: coerceString(isRecord(entry) ? entry.id : ""),
        name: coerceString(isRecord(entry) ? entry.name : "") || "Unknown",
        total: coerceNumber(isRecord(entry) ? entry.total : 0, 0),
        inbound: coerceNumber(isRecord(entry) ? entry.inbound : 0, 0),
        outbound: coerceNumber(isRecord(entry) ? entry.outbound : 0, 0),
        answered: coerceNumber(isRecord(entry) ? entry.answered : 0, 0),
        missed: coerceNumber(isRecord(entry) ? entry.missed : 0, 0),
        totalTalkTimeSeconds: coerceNumber(isRecord(entry) ? entry.totalTalkTimeSeconds : 0, 0),
        avgDurationSeconds: coerceNumber(isRecord(entry) ? entry.avgDurationSeconds : 0, 0),
      }))
      : [],
    rowCount: coerceNumber(row.rowCount, 0),
    maxRows: coerceNumber(row.maxRows, 0),
  };
};

const normalizeCustomerProfileResult = (value: unknown, phone: string): CustomerProfileResult => {
  const row = isRecord(value) ? value : {};
  return {
    phone: coerceString(row.phone) || phone,
    customerName: coerceString(row.customerName),
    mob2: coerceString(row.mob2),
    age: coerceString(row.age),
    gender: coerceString(row.gender),
    district: coerceString(row.district),
    location: coerceString(row.location || row.place),
    branch: coerceString(row.branch),
    language: coerceString(row.language),
    businessType: coerceString(row.businessType),
    metalType: coerceString(row.metalType),
    grams: coerceString(row.grams),
    releaseGrossAmount: coerceString(row.releaseGrossAmount || row.release_gross_amount),
    releasingAmount: coerceString(row.releasingAmount),
    pledgePlace: coerceString(row.pledgePlace || row.pledge_place),
    otherPledgePlace: coerceString(row.otherPledgePlace || row.other_pledge_place),
    differenceAmount: coerceString(row.differenceAmount || row.difference_amount),
    bankName: coerceString(row.bankName),
    onlinePrice: coerceString(row.onlinePrice),
    pricePerGram: coerceString(row.pricePerGram),
    advertisement: coerceString(row.advertisement),
    lead: coerceString(row.lead),
    formStatus: coerceString(row.formStatus),
    purpose: coerceString(row.purpose),
    statusFollowUpAt: coerceString(row.statusFollowUpAt),
    notes: coerceString(row.notes),
    latestCallStatus: coerceString(row.latestCallStatus),
    latestStatus: coerceString(row.latestStatus),
    latestFormStatus: coerceString(row.latestFormStatus),
    latestDisposition: coerceString(row.latestDisposition),
    latestDispositionCategory: coerceString(row.latestDispositionCategory),
    hasSavedDetails: coerceBoolean(row.hasSavedDetails, false),
  };
};

const normalizeRealBranchRecord = (value: unknown): RealBranchRecord | null => {
  if (!isRecord(value)) return null;

  const id = coerceString(value.id || value.branchId || value.name || value.branchName);
  const name = coerceString(value.name || value.branchName);
  if (!id && !name) return null;

  return {
    id: id || name,
    name: name || id,
    city: coerceString(value.city),
    address: coerceString(value.address || value.addressline),
    area: coerceString(value.area),
    state: coerceString(value.state),
    pincode: coerceString(value.pincode),
    timings: coerceString(value.timings),
    latitude: coerceString(value.latitude),
    longitude: coerceString(value.longitude),
    url: coerceString(value.url),
    mapUrl: coerceString(value.mapUrl || value.map_url),
    bitlyUrl: coerceString(value.bitlyUrl || value.bitly_url),
    distance: value.distance == null ? null : coerceNumber(value.distance, 0),
  };
};

const normalizePlaceSuggestionRecord = (value: unknown): PlaceSuggestionRecord | null => {
  if (!isRecord(value)) return null;

  const description = coerceString(value.description || value.name || value.label);
  if (!description) return null;

  return {
    description,
    lat: value.lat == null ? null : coerceNumber(value.lat, 0),
    lng: value.lng == null ? null : coerceNumber(value.lng, 0),
    placeId: coerceString(value.placeId || value.place_id),
    district: coerceString(value.district),
    state: coerceString(value.state),
    source: coerceString(value.source),
  };
};

const normalizeGeocodePlaceResult = (value: unknown): GeocodePlaceResult | null => {
  if (!isRecord(value)) return null;

  return {
    lat: value.lat == null ? null : coerceNumber(value.lat, 0),
    lng: value.lng == null ? null : coerceNumber(value.lng, 0),
    district: coerceString(value.district),
    state: coerceString(value.state),
    label: coerceString(value.label),
    error: coerceString(value.error),
  };
};

const normalizeTransferContextRecord = (value: unknown): TransferContextRecord | null => {
  if (!isRecord(value)) return null;
  return {
    id: coerceString(value.id) || "transfer-context",
    phone: coerceString(value.phone),
    sourceCallId: coerceString(value.sourceCallId),
    intakeToken: coerceString(value.intakeToken),
    targetExtension: coerceString(value.targetExtension),
    customerName: coerceString(value.customerName),
    mob2: coerceString(value.mob2),
    age: coerceString(value.age),
    gender: coerceString(value.gender),
    district: coerceString(value.district),
    location: coerceString(value.location || value.place),
    branch: coerceString(value.branch),
    language: coerceString(value.language),
    businessType: coerceString(value.businessType),
    metalType: coerceString(value.metalType),
    grams: coerceString(value.grams),
    releaseGrossAmount: coerceString(value.releaseGrossAmount || value.release_gross_amount),
    releasingAmount: coerceString(value.releasingAmount),
    pledgePlace: coerceString(value.pledgePlace || value.pledge_place),
    otherPledgePlace: coerceString(value.otherPledgePlace || value.other_pledge_place),
    differenceAmount: coerceString(value.differenceAmount || value.difference_amount),
    bankName: coerceString(value.bankName),
    onlinePrice: coerceString(value.onlinePrice),
    pricePerGram: coerceString(value.pricePerGram),
    advertisement: coerceString(value.advertisement),
    lead: coerceString(value.lead),
    formStatus: coerceString(value.formStatus),
    purpose: coerceString(value.purpose),
    notes: coerceString(value.notes),
    disposition: coerceString(value.disposition),
    isActive: coerceBoolean(value.isActive, false),
    createdAt: coerceString(value.createdAt),
    updatedAt: coerceString(value.updatedAt),
  };
};

const normalizeFollowUpRecord = (value: unknown): FollowUpRecord | null => {
  if (!isRecord(value)) return null;
  const statusCandidate = coerceString(value.status);
  const fallbackId = [
    coerceString(value.id),
    coerceString(value.phone),
    coerceString(value.followUpAt),
  ].filter(Boolean).join("|") || "unknown-follow-up";

  return {
    id: fallbackId,
    customerName: coerceString(value.customerName),
    phone: coerceString(value.phone),
    branch: coerceString(value.branch),
    followUpAt: coerceString(value.followUpAt),
    status: followUpStatusValues.has(statusCandidate as FollowUpRecord["status"])
      ? statusCandidate as FollowUpRecord["status"]
      : "Pending",
    agentId: coerceString(value.agentId),
    agentName: coerceString(value.agentName),
    notes: coerceString(value.notes),
    outcome: coerceString(value.outcome),
    updatedAt: coerceString(value.updatedAt),
    sourceCallId: coerceString(value.sourceCallId),
    sourceStatus: coerceString(value.sourceStatus),
  };
};

const normalizeBreakLogRecord = (value: unknown): BreakLogRecord | null => {
  if (!isRecord(value)) return null;
  const fallbackId = [
    coerceString(value.id),
    coerceString(value.agentId),
    coerceString(value.createdAt),
  ].filter(Boolean).join("|") || "unknown-break";

  return {
    id: fallbackId,
    agentId: coerceString(value.agentId),
    agentName: coerceString(value.agentName),
    breakType: coerceString(value.breakType),
    breakDate: coerceString(value.breakDate),
    startedAt: coerceString(value.startedAt),
    endedAt: coerceString(value.endedAt),
    startTime: coerceString(value.startTime),
    endTime: coerceString(value.endTime),
    duration: coerceString(value.duration),
    createdAt: coerceString(value.createdAt),
  };
};

const normalizeLiveAgentRecord = (value: unknown): LiveAgentRecord | null => {
  if (!isRecord(value)) return null;

  return {
    agentId: coerceString(value.agentId || value.id),
    agentName: coerceString(value.agentName || value.name),
    status: coerceString(value.status) || "offline",
    callsToday: coerceNumber(value.callsToday, 0),
    extension: coerceString(value.extension),
    sipStatus: coerceString(value.sipStatus),
    activeCalls: coerceNumber(value.activeCalls, 0),
    activeAutoDialCount: coerceNumber(value.activeAutoDialCount, 0),
    workMode: coerceString(value.workMode),
    inboundToday: coerceNumber(value.inboundToday, 0),
    outboundToday: coerceNumber(value.outboundToday, 0),
    answeredToday: coerceNumber(value.answeredToday, 0),
    missedToday: coerceNumber(value.missedToday, 0),
    convertedBills: coerceNumber(value.convertedBills, 0),
    enquiryToday: coerceNumber(value.enquiryToday, 0),
    releaseToday: coerceNumber(value.releaseToday, 0),
    convertedTotal: coerceNumber(value.convertedTotal, 0),
    followUpsPending: coerceNumber(value.followUpsPending, 0),
    followUpStartedAt: coerceString(value.followUpStartedAt),
    followUpDuration: coerceString(value.followUpDuration),
    incomingAccess: coerceBoolean(value.incomingAccess, true),
    outgoingAccess: coerceBoolean(value.outgoingAccess, true),
    followUpAccess: coerceBoolean(value.followUpAccess, true),
    adminMessage: coerceString(value.adminMessage),
    onBreak: coerceBoolean(value.onBreak, false),
    canReceiveAutoDialAssignments: coerceBoolean(value.canReceiveAutoDialAssignments, false),
    isLoggedIn: coerceBoolean(value.isLoggedIn, false),
    loginTime: coerceString(value.loginTime),
    lastLoginAt: coerceString(value.lastLoginAt),
    queuePaused: coerceBoolean(value.queuePaused, false),
    queueMemberships: Array.isArray(value.queueMemberships)
      ? value.queueMemberships.map((entry) => coerceString(entry)).filter(Boolean)
      : [],
    queuePausedQueues: Array.isArray(value.queuePausedQueues)
      ? value.queuePausedQueues.map((entry) => coerceString(entry)).filter(Boolean)
      : [],
    languages: Array.isArray(value.languages)
      ? value.languages.map((entry) => coerceString(entry)).filter(Boolean)
      : [],
  };
};

const normalizeAutoDialLeadRecord = (value: unknown): AutoDialLeadRecord | null => {
  if (!isRecord(value)) return null;
  const statusCandidate = coerceString(value.status);
  const normalizedId = coerceString(value.id)
    || [
      coerceString(value.mobileNumber),
      coerceString(value.createdAt),
    ].filter(Boolean).join("|")
    || "unknown-auto-dial";

  return {
    id: normalizedId,
    customerName: coerceString(value.customerName),
    mobileNumber: coerceString(value.mobileNumber),
    area: coerceString(value.area),
    state: coerceString(value.state),
    language: coerceString(value.language),
    goldWeight: coerceString(value.goldWeight),
    type: coerceString(value.type),
    sourceState: coerceString(value.sourceState),
    preferredLanguage: coerceString(value.preferredLanguage),
    status: autoDialStatusValues.has(statusCandidate as AutoDialLeadRecord["status"])
      ? statusCandidate as AutoDialLeadRecord["status"]
      : "pending",
    assignedAgentId: coerceString(value.assignedAgentId),
    assignedAgentName: coerceString(value.assignedAgentName),
    scheduledAgentId: coerceString(value.scheduledAgentId),
    scheduledAgentName: coerceString(value.scheduledAgentName),
    sourceFile: coerceString(value.sourceFile),
    callId: coerceString(value.callId),
    assignedAt: coerceString(value.assignedAt),
    dialStartedAt: coerceString(value.dialStartedAt),
    completedAt: coerceString(value.completedAt),
    scheduledFor: coerceString(value.scheduledFor),
    lastError: coerceString(value.lastError),
    queueExitReason: coerceString(value.queueExitReason),
    retryAllowed: coerceBoolean(value.retryAllowed, true),
    createdAt: coerceString(value.createdAt),
    updatedAt: coerceString(value.updatedAt),
  };
};

const normalizeAgentRecord = (value: unknown): AgentRecord | null => {
  if (!isRecord(value)) return null;

  const roleCandidate = coerceString(value.role);
  const statusCandidate = coerceString(value.status);
  const languages = Array.isArray(value.languages)
    ? value.languages.map((entry) => coerceString(entry)).filter(Boolean)
    : [];

  return {
    id: coerceString(value.id),
    name: coerceString(value.name),
    email: coerceString(value.email),
    role: agentRoleValues.has(roleCandidate as UserRole) ? roleCandidate as UserRole : "agent",
    extension: coerceString(value.extension),
    shift: coerceString(value.shift),
    status: agentStatusValues.has(statusCandidate as NonNullable<AgentRecord["status"]>)
      ? statusCandidate as NonNullable<AgentRecord["status"]>
      : undefined,
    languages,
    isLoggedIn: coerceBoolean(value.isLoggedIn, false),
    loginTime: coerceString(value.loginTime),
    logoutTime: coerceString(value.logoutTime),
    lastLoginAt: coerceString(value.lastLoginAt),
    lastLogoutAt: coerceString(value.lastLogoutAt),
    publicLoginIp: coerceString(value.publicLoginIp),
    workstationIp: coerceString(value.workstationIp),
    workstationIpLastSeenAt: coerceString(value.workstationIpLastSeenAt),
    lastLoginIp: coerceString(value.lastLoginIp),
    lastLoginIpIsGateway: coerceBoolean(value.lastLoginIpIsGateway, false),
    lastLoginDeviceId: coerceString(value.lastLoginDeviceId),
    activeDuration: coerceString(value.activeDuration),
    breakTime: coerceString(value.breakTime),
    followUpStartedAt: coerceString(value.followUpStartedAt),
    followUpDuration: coerceString(value.followUpDuration),
    incomingAccess: coerceBoolean(value.incomingAccess, true),
    outgoingAccess: coerceBoolean(value.outgoingAccess, true),
    followUpAccess: coerceBoolean(value.followUpAccess, true),
    activeCallId: coerceString(value.activeCallId),
    activeCallLive: coerceBoolean(value.activeCallLive, false),
    staleActiveCallId: coerceString(value.staleActiveCallId),
    activeCallDirection: coerceString(value.activeCallDirection),
    activeCallStartedAt: coerceString(value.activeCallStartedAt),
    callStateUpdatedAt: coerceString(value.callStateUpdatedAt),
    lastCallEndedAt: coerceString(value.lastCallEndedAt),
    uiRefreshToken: coerceString(value.uiRefreshToken),
    uiRefreshScope: coerceString(value.uiRefreshScope),
    uiRefreshTriggeredAt: coerceString(value.uiRefreshTriggeredAt),
  };
};

const normalizeAuthUserRecord = (value: unknown): AuthUserRecord | null => {
  const agent = normalizeAgentRecord(value);
  if (!agent) return null;
  const authUser: AuthUserRecord & { sipPassword?: string } = {
    ...agent,
    extension: agent.extension || "",
    sipPassword: isRecord(value) ? coerceString(value.sipPassword) : "",
  };
  return authUser;
};

const buildCallsListQuery = (params: CallsListParams) => {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.dedupe === false) query.set("dedupe", "false");
  if (params.date) query.set("date", params.date);
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
  if (params.agentId) query.set("agent", params.agentId);
  if (params.direction) query.set("direction", params.direction);
  if (params.status) query.set("status", params.status);
  if (params.disposition) query.set("disposition", params.disposition);
  if (params.dispositionCategory) query.set("dispositionCategory", params.dispositionCategory);
  if (params.source) query.set("source", params.source);
  if (params.language) query.set("language", params.language);
  if (params.branch) query.set("branch", params.branch);
  if (params.search) query.set("search", params.search);
  return query.toString();
};

async function sendJson(path: string, method: string, body?: unknown): Promise<boolean> {
  const result = await sendJsonWithResult(path, method, body);
  return Boolean(result.success);
}

async function sendJsonWithResult(
  path: string,
  method: string,
  body?: unknown,
  options?: {
    retries?: number;
    retryDelayMs?: number;
    keepalive?: boolean;
  },
): Promise<MutationResult> {
  const retries = Math.max(0, options?.retries ?? 0);
  const retryDelayMs = Math.max(150, options?.retryDelayMs ?? 350);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const isLastAttempt = attempt === retries;

    try {
      const response = await fetch(buildApiUrl(path), {
        cache: "no-store",
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        keepalive: options?.keepalive,
      });

      if (response.ok) {
        const payload = await response.json().catch(() => null) as MutationResult | null;
        return payload?.success === false
          ? {
              success: false,
              error: payload.error || "Request failed",
              status: payload.status,
              code: payload.code,
              stage: payload.stage,
            }
          : {
              success: true,
              ...(typeof payload === "object" && payload !== null ? payload : {}),
            };
      }

      const payload = await response.json().catch(() => null) as MutationResult | null;
      const error = payload?.error || `Request failed (${response.status})`;
      if (
        isLastAttempt
        || payload?.code === "CALL_SAVE_LOCK_TIMEOUT"
        || !RETRYABLE_MUTATION_STATUS_CODES.has(response.status)
      ) {
        return {
          success: false,
          error,
          status: response.status,
          code: payload?.code,
          stage: payload?.stage,
        };
      }
    } catch (error) {
      if (isLastAttempt) {
        console.error(`API mutation failed for ${path}:`, error);
        return { success: false, error: "Unable to reach the server", network: true };
      }
    }

    await delay(retryDelayMs * (attempt + 1));
  }

  return { success: false, error: "Unable to complete the request" };
}

async function readMutationJsonWithRetry(
  path: string,
  init?: RequestInit,
  fallback: MutationResult = { success: false, error: "Error" },
  options?: {
    retries?: number;
    retryDelayMs?: number;
  },
): Promise<MutationResult> {
  const retries = Math.max(0, options?.retries ?? 0);
  const retryDelayMs = Math.max(150, options?.retryDelayMs ?? 350);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const isLastAttempt = attempt === retries;

    try {
      const response = await fetch(buildApiUrl(path), {
        ...init,
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null as unknown);
      if (response.ok) {
        if (isMutationFallbackRecord(payload)) {
          return payload.success === false
            ? {
                success: false,
                error: resolveMutationFallbackError(payload.error, path, init?.method),
              }
            : {
                success: true,
                ...(typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {}),
              };
        }
        return { success: true };
      }

      const mergedFallback = {
        ...fallback,
        ...(typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {}),
      } as Record<string, unknown>;
      mergedFallback.error = resolveMutationFallbackError(
        mergedFallback.error,
        path,
        init?.method,
        { status: response.status },
      );
      mergedFallback.success = false;
      if (isLastAttempt || !RETRYABLE_MUTATION_STATUS_CODES.has(response.status)) {
        return mergedFallback as MutationResult;
      }
    } catch (error) {
      console.error(`API request failed for ${path}:`, error);
      const mergedFallback = { ...fallback } as Record<string, unknown>;
      mergedFallback.error = resolveMutationFallbackError(
        mergedFallback.error,
        path,
        init?.method,
        { network: true },
      );
      mergedFallback.success = false;
      if (isLastAttempt) {
        return mergedFallback as MutationResult;
      }
    }

    await delay(retryDelayMs * (attempt + 1));
  }

  return { success: false, error: "Unable to complete the request" };
}

async function saveCallWithResult(call: Partial<CallRecord>): Promise<MutationResult> {
  try {
    return await sendJsonWithResult("/calls", "POST", {
      ...call,
      skipCallSlotSync: true,
      clientSlotManaged: true,
    }, {
      retries: 2,
      retryDelayMs: 500,
      keepalive: true,
    });
  } catch (error) {
    console.error("Call save failed:", error);
    return { success: false, error: "Unable to save the call" };
  }
}

async function saveIntakeFormWithResult(call: Partial<CallRecord>): Promise<MutationResult> {
  try {
    return await sendJsonWithResult("/intake-forms", "POST", call, {
      retries: 2,
      retryDelayMs: 500,
      keepalive: true,
    });
  } catch (error) {
    console.error("Intake form save failed:", error);
    return { success: false, error: "Unable to save the intake form draft" };
  }
}

async function postAutoDialImportBatch(fileName: string, leads: AutoDialLeadImportRow[]): Promise<AutoDialImportResult> {
  try {
    const response = await fetch(buildApiUrl("/auto-dial/import"), {
      cache: "no-store",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, leads }),
    });

    const payload = await response.json().catch(() => null) as AutoDialImportResult | null;
    if (!response.ok) {
      return {
        error: payload?.error || `Import failed (${response.status})`,
        inserted: payload?.inserted ?? 0,
        invalid: payload?.invalid ?? 0,
        duplicatesIgnored: payload?.duplicatesIgnored ?? 0,
      };
    }

    return payload || { success: true, inserted: 0, invalid: 0, duplicatesIgnored: 0 };
  } catch (error) {
    console.error("Auto dial import failed:", error);
    return { error: "Unable to reach the server for lead import", inserted: 0, invalid: 0, duplicatesIgnored: 0 };
  }
}

export const api = {
  async getPledgePlaces() {
    const payload = await readJson<unknown>("/pledge-places", undefined, []);
    const values = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.places) ? payload.places : [];
    return values
      .map((value) => (typeof value === "string" ? value.trim() : isRecord(value) ? coerceString(value.name).trim() : ""))
      .filter(Boolean);
  },

  updatePledgePlaces(places: string[], updatedById?: string, updatedByName?: string) {
    return readJson<MutationResult & { places?: string[] }>("/pledge-places", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ places, updatedById, updatedByName }),
    }, { success: false, error: "Unable to save pledge places" });
  },

  async getCalls(limit = 50) {
    const payload = await readJson<unknown>(`/calls?limit=${encodeURIComponent(String(limit))}`, undefined, []);
    return normalizeCallRecordList(payload);
  },

  async getIncomingCallQueue() {
    const payload = await readJson<unknown>("/missed", undefined, []);
    return normalizeIncomingCallQueueRecordList(payload);
  },

  async getTodayMissedCalls(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const payload = await readJson<unknown>(`/missed/today${query}`, undefined, { rows: [] });
    if (isRecord(payload) && Array.isArray(payload.rows)) {
      return {
        date: coerceString(payload.date) || date || "",
        rows: normalizeCallRecordList(payload.rows, { dedupe: false }),
      };
    }
    return {
      date: date || "",
      rows: normalizeCallRecordList(payload, { dedupe: false }),
    };
  },

  async getLiveWaitingQueueSnapshot(): Promise<ApiLoadResult<LiveWaitingQueueSnapshot>> {
    const response = await readJsonResult<unknown>("/live-waiting-queue", undefined, {
      generatedAt: "",
      totalWaiting: 0,
      queues: [],
    });
    const payload = response.data;
    return {
      ...response,
      ok: response.ok && isRecord(payload) && Array.isArray(payload.queues),
      data: normalizeLiveWaitingQueueSnapshot(payload),
    };
  },

  async getLiveWaitingQueue() {
    const result = await this.getLiveWaitingQueueSnapshot();
    return result.data;
  },

  async getIncomingTwoOfFiveGateStatus(role?: UserRole) {
    const query = role ? `?role=${encodeURIComponent(role)}` : "";
    const payload = await readJson<unknown>(
      `/admin/incoming-2of5-gate/status${query}`,
      undefined,
      null,
    );
    return normalizeIncomingFiveOfTenGateStatus(payload);
  },

  async setIncomingTwoOfFiveGateEnabled(
    enabled: boolean,
    role?: UserRole,
    options?: { stopLimit?: number; resetStopCount?: boolean },
  ) {
    const payload = await readJson<unknown>(
      "/admin/incoming-2of5-gate/control",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, role, ...options }),
      },
      null,
    );
    return normalizeIncomingFiveOfTenGateStatus(payload);
  },

  async setIncomingTwoOfFiveGateStopLimit(stopLimit: number, role?: UserRole, resetStopCount = true) {
    const payload = await readJson<unknown>(
      "/admin/incoming-2of5-gate/control",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopLimit, resetStopCount, role }),
      },
      null,
    );
    return normalizeIncomingFiveOfTenGateStatus(payload);
  },

  async setIncomingTwoOfFiveGateRateLimit(rateLimitSeconds: number, role?: UserRole, resetRateTimer = true) {
    const payload = await readJson<unknown>(
      "/admin/incoming-2of5-gate/control",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateLimitSeconds, resetRateTimer, role }),
      },
      null,
    );
    return normalizeIncomingFiveOfTenGateStatus(payload);
  },

  async getIncomingFiveOfTenGateStatus(role?: UserRole) {
    return this.getIncomingTwoOfFiveGateStatus(role);
  },

  async getCallsByPhone(phone: string) {
    const payload = await readJson<unknown>(
      `/calls/phone?phone=${encodeURIComponent(phone)}`,
      undefined,
      { phone, total: 0, results: [] },
    );
    return normalizeCallsByPhoneResult(payload, phone);
  },

  async getIntakeFormHistory(phone: string) {
    const payload = await readJson<unknown>(
      `/intake-forms/phone?phone=${encodeURIComponent(phone)}`,
      undefined,
      { phone, total: 0, results: [] },
    );
    return normalizeIntakeFormHistoryResult(payload, phone);
  },

  async getCustomerDataDashboard(date?: string, options?: { force?: boolean; signal?: AbortSignal }) {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (options?.force) params.set("force", "1");

    const queryString = params.toString();
    const response = await fetchJsonPayload(
      `/customerdata/list${queryString ? `?${queryString}` : ""}`,
      { signal: options?.signal },
      null,
    );
    const payload = response.payload;
    if (!response.ok || !isRecord(payload) || !Array.isArray(payload.results)
      || payload.success === false || payload.error) {
      throw createApiRequestError("Customer data could not be loaded. Please retry.", { status: response.status });
    }
    if (date && payload.date !== date) throw createApiRequestError("Customer data returned a different date. Please retry.");
    return normalizeCustomerDataDashboardResult(payload, date || "");
  },

  async getCustomerProfile(phone: string, options?: { customerId?: string }) {
    const params = new URLSearchParams({ phone });
    if (options?.customerId) params.set("customerId", options.customerId);
    const payload = await readJson<unknown>(
      `/customer-profile?${params.toString()}`,
      undefined,
      {
        phone,
        customerName: "",
        mob2: "",
        age: "",
        gender: "",
        district: "",
        location: "",
        branch: "",
        language: "",
        businessType: "",
        metalType: "",
        grams: "",
        releaseGrossAmount: "",
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
        hasSavedDetails: false,
      },
    );
    return normalizeCustomerProfileResult(payload, phone);
  },

  async getTransferContext(phone?: string, sourceCallId?: string, targetExtension?: string) {
    const params = new URLSearchParams();
    if (phone) params.set("phone", phone);
    if (sourceCallId) params.set("sourceCallId", sourceCallId);
    if (targetExtension) params.set("targetExtension", targetExtension);
    if (![...params.keys()].length) {
      return null;
    }
    const payload = await readJson<unknown>(
      `/transfer-context?${params.toString()}`,
      undefined,
      null,
    );
    return normalizeTransferContextRecord(payload);
  },

  saveTransferContext(payload: Partial<TransferContextRecord> & { phone: string }) {
    return readJson<MutationResult>("/transfer-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  transferCall(payload: {
    requestedById?: string;
    sourceExtension?: string;
    targetExtension: string;
    phone?: string;
    sourceCallId?: string;
  }) {
    return readJson<MutationResult>("/calls/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  clearTransferContext(payload: { phone?: string; sourceCallId?: string }) {
    return readJson<MutationResult>("/transfer-context/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  saveCallIvrSelection(payload: IvrCacheSyncPayload) {
    const phone = String(payload.phone || "").replace(/\D/g, "").slice(-10);
    if (!phone) {
      return Promise.resolve({ success: false, error: "Phone required" } satisfies IvrCacheSyncResult);
    }

    const language = String(payload.language || "").trim();
    const businessType = String(payload.businessType || "").trim();
    const purpose = String(payload.purpose || "").trim();
    if (!language && !businessType && !purpose) {
      return Promise.resolve({ success: true } satisfies IvrCacheSyncResult);
    }

    const params = new URLSearchParams({ phone });
    if (language) params.set("language", language);
    if (businessType) params.set("businessType", businessType);
    if (purpose) params.set("purpose", purpose);

    const agentId = String(payload.agentId || "").trim();
    const agentName = String(payload.agentName || "").trim();
    const source = String(payload.source || "").trim();
    if (agentId) params.set("agentId", agentId);
    if (agentName) params.set("agentName", agentName);
    if (source) params.set("source", source);

    return readJson<IvrCacheSyncResult>(`/save-call-ivr?${params.toString()}`, undefined, { error: "Error" });
  },

  async getCallsByDate(date: string, agentId?: string) {
    const result = await this.getCallsByDateSnapshot(date, agentId);
    return result.data;
  },

  async getCallsByDateSnapshot(date: string, agentId?: string): Promise<ApiLoadResult<CallsByDateResult>> {
    const params = new URLSearchParams({ date });
    if (agentId) params.set("agentId", agentId);
    const fallbackPayload = { date, total: 0, inbound: 0, outbound: 0, results: [] };
    const response = await readJsonResult<unknown>(
      `/calls/date-details?${params.toString()}`,
      undefined,
      fallbackPayload,
    );
    const payload = response.data;
    return {
      ...response,
      ok: response.ok && isRecord(payload) && Array.isArray(payload.results),
      data: normalizeCallsByDateResult(payload, date),
    };
  },

  async getCallsList(params: CallsListParams) {
    const query = buildCallsListQuery(params);
    const payload = await readJson<unknown>(
      `/calls/list?${query}`,
      params.signal ? { signal: params.signal } : undefined,
      { page: params.page || 1, limit: params.limit || 50, total: 0, totalPages: 0, results: [] },
    );
    return normalizeCallsListResult(payload, { page: params.page || 1, limit: params.limit || 50 });
  },

  async getAllCallsSnapshot(params: Omit<CallsListParams, "page" | "limit"> & { limit?: number; dedupe?: boolean }): Promise<ApiLoadResult<CallsListResult>> {
    const limit = 50;
    const fallbackPage = { page: 1, limit, total: 0, totalPages: 0, results: [] };
    const firstPageResponse = await readJsonResult<unknown>(
      `/calls/list?${buildCallsListQuery({ ...params, page: 1, limit })}`,
      undefined,
      fallbackPage,
    );
    const firstPage = normalizeCallsListResult(firstPageResponse.data, { page: 1, limit }, { dedupe: params.dedupe });
    const allResults = Array.isArray(firstPage.results) ? [...firstPage.results] : [];
    const totalPages = Math.max(1, firstPage.totalPages || Math.ceil((firstPage.total || allResults.length) / limit));
    let ok = firstPageResponse.ok;
    let lastStatus = firstPageResponse.status;
    let sawNetworkFailure = firstPageResponse.network === true;

    const maxSnapshotPages = Math.min(totalPages, 2);
    if (firstPageResponse.ok && maxSnapshotPages > 1) {
      const remainingPages = await Promise.all(
        Array.from({ length: maxSnapshotPages - 1 }, (_, index) => readJsonResult<unknown>(
          `/calls/list?${buildCallsListQuery({ ...params, page: index + 2, limit })}`,
          undefined,
          { page: index + 2, limit, total: 0, totalPages, results: [] },
        )),
      );

      remainingPages.forEach((pageResponse, index) => {
        if (!pageResponse.ok) {
          ok = false;
        }
        if (pageResponse.status) {
          lastStatus = pageResponse.status;
        }
        if (pageResponse.network === true) {
          sawNetworkFailure = true;
        }

        const pageResult = normalizeCallsListResult(pageResponse.data, { page: index + 2, limit }, { dedupe: params.dedupe });
        if (Array.isArray(pageResult.results) && pageResult.results.length > 0) {
          allResults.push(...pageResult.results);
        }
      });
    }

    return {
      ok,
      status: lastStatus,
      network: sawNetworkFailure,
      data: {
        page: 1,
        limit,
        total: firstPage.total || allResults.length,
        totalPages,
        summary: firstPage.summary,
        results: allResults,
      } satisfies CallsListResult,
    };
  },

  async getAllCalls(params: Omit<CallsListParams, "page" | "limit"> & { limit?: number; dedupe?: boolean }) {
    const limit = Math.min(1000, Math.max(100, params.limit || 1000));
    const firstPagePayload = await readJson<unknown>(
      `/calls/list?${buildCallsListQuery({ ...params, page: 1, limit })}`,
      undefined,
      { page: 1, limit, total: 0, totalPages: 0, results: [] },
    );
    const firstPage = normalizeCallsListResult(firstPagePayload, { page: 1, limit }, { dedupe: params.dedupe });
    const allResults = Array.isArray(firstPage.results) ? [...firstPage.results] : [];
    const totalPages = Math.max(1, firstPage.totalPages || Math.ceil((firstPage.total || allResults.length) / limit));

    if (totalPages > 1) {
      const remainingPages = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) => readJson<unknown>(
          `/calls/list?${buildCallsListQuery({ ...params, page: index + 2, limit })}`,
          undefined,
          { page: index + 2, limit, total: 0, totalPages, results: [] },
        )),
      );

      remainingPages.forEach((pagePayload, index) => {
        const pageResult = normalizeCallsListResult(pagePayload, { page: index + 2, limit }, { dedupe: params.dedupe });
        if (Array.isArray(pageResult.results) && pageResult.results.length > 0) {
          allResults.push(...pageResult.results);
        }
      });
    }

    return {
      page: 1,
      limit,
      total: firstPage.total || allResults.length,
      totalPages,
      summary: firstPage.summary,
      results: allResults,
    } satisfies CallsListResult;
  },

  async downloadCallsReportCsv(params: Omit<CallsListParams, "page" | "limit" | "dedupe"> & { filename?: string }) {
    const { filename: requestedFilename, ...queryParams } = params;
    const query = buildCallsListQuery(queryParams);
    const url = buildApiUrl(`/calls/export?${query}`);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = requestedFilename || "attica-report.csv";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return {
      rowCount: -1,
      maxRows: 0,
    };
  },

  async getCallsReportSummary(params: Omit<CallsListParams, "page" | "limit" | "dedupe">) {
    const query = buildCallsListQuery(params);
    const payload = await readJson<unknown>(
      `/calls/report-summary?${query}`,
      undefined,
      { summary: {}, hourly: [], branches: [], purposes: [], dispositionCategories: [], sources: [], agents: [], rowCount: 0, maxRows: 0 },
    );
    return normalizeCallsReportSummaryResult(payload);
  },

  async getCustomerCallHistory(phone: string) {
    const payload = await readJson<unknown>(
      `/calls/customer-history?phone=${encodeURIComponent(phone)}`,
      undefined,
      { phone, total: 0, results: [] },
    );
    return normalizeCallsByPhoneResult(payload, phone);
  },

  getBlockedNumbers() {
    return readJson<BlockedNumberRecord[]>("/blocked-numbers", undefined, []);
  },

  getBlockedNumber(phone: string) {
    return readJson<BlockedNumberRecord>(
      `/blocked-numbers?phone=${encodeURIComponent(phone)}`,
      undefined,
      { phone, blocked: false },
    );
  },

  setBlockedNumber(phone: string, payload: {
    blocked: boolean;
    blockedById?: string;
    blockedByName?: string;
    sourceCallId?: string;
    note?: string;
  }) {
    return readJson<BlockedNumberRecord & MutationResult>(`/blocked-numbers/${encodeURIComponent(phone)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  saveCall(call: Partial<CallRecord>) {
    return saveCallWithResult(call).then((result) => Boolean(result.success));
  },

  saveCallWithResult(call: Partial<CallRecord>) {
    return saveCallWithResult(call);
  },

  saveIntakeFormWithResult(call: Partial<CallRecord>) {
    return saveIntakeFormWithResult(call);
  },

  async getIntakeWorkflow(callId: string, agentId: string, signal?: AbortSignal): Promise<IntakeWorkflowRecord | null> {
    const query = new URLSearchParams({callId,agentId});
    const response = await fetch(buildApiUrl(`/intake-workflow?${query}`), {signal,cache:"no-store"});
    if (!response.ok) throw new Error("Pending Server Save");
    return (await response.json()).workflow || null;
  },
  async getPendingIntakeWorkflow(agentId: string, signal?: AbortSignal): Promise<{workflow: IntakeWorkflowRecord; call: CallRecord} | null> {
    const query = new URLSearchParams({agentId});
    const response = await fetch(buildApiUrl(`/intake-workflow/pending?${query}`), {signal,cache:"no-store"});
    if (!response.ok) throw new Error("Unable to restore pending intake");
    const payload = await response.json();
    if (!payload.success) throw new Error("Unable to restore pending intake");
    const call = normalizeCallRecord(payload.call);
    const workflow = payload.workflow as IntakeWorkflowRecord | null;
    if (!workflow || !call) return null;
    if (workflow.agentId !== agentId || call.agentId !== agentId || workflow.callId !== call.id
      || !workflow.confirmedEndedAt || workflow.submittedAt) throw new Error("Pending intake session does not match");
    return {workflow,call};
  },
  saveIntakeWorkflow(payload: {callId: string; intakeToken: string; agentId: string; revision: number; action: "draft" | "submit"; draft: Record<string,unknown>; selectedDisposition?: string}) {
    return sendJsonWithResult("/intake-workflow","POST",payload,{retries:0});
  },

  async getFollowUps() {
    const payload = await readJson<unknown>("/followups", undefined, []);
    return Array.isArray(payload)
      ? payload.map((record) => normalizeFollowUpRecord(record)).filter((record): record is FollowUpRecord => Boolean(record))
      : [];
  },

  saveFollowUp(followUp: FollowUpRecord) {
    return sendJson("/followups", "POST", followUp);
  },

  updateFollowUpStatus(id: string, payload: FollowUpStatusUpdatePayload) {
    return sendJson(`/followups/${id}`, "PUT", payload);
  },

  async getBreaks(options?: { agentId?: string; date?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (options?.agentId) params.set("agentId", options.agentId);
    if (options?.date) params.set("date", options.date);
    if (options?.limit) params.set("limit", String(options.limit));
    const query = params.toString();
    const payload = await readJson<unknown>(`/breaks${query ? `?${query}` : ""}`, undefined, []);
    return Array.isArray(payload)
      ? payload.map((record) => normalizeBreakLogRecord(record)).filter((record): record is BreakLogRecord => Boolean(record))
      : [];
  },

  saveBreak(breakLog: BreakLogRecord) {
    return sendJson("/breaks", "POST", breakLog);
  },

  getRates() {
    return readJson<MetalRate[]>("/rates", undefined, []);
  },

  updateRate(label: string, value: string) {
    return sendJson("/rates", "PUT", { label, value });
  },

  addRate(label: string, value: string) {
    return sendJson("/rates", "POST", { label, value });
  },

  deleteRate(label: string) {
    return sendJson("/rates", "DELETE", { label });
  },

  getRecordings() {
    return readJson<unknown[]>("/recordings", undefined, []);
  },

  async getStatsSnapshot(): Promise<ApiLoadResult<StatsRecord | null>> {
    const response = await readJsonResult<unknown>("/stats", undefined, null);
    return {
      ...response,
      ok: response.ok && isRecord(response.data),
      data: isRecord(response.data) ? response.data : null,
    };
  },

  async getStats() {
    const result = await this.getStatsSnapshot();
    return result.data;
  },

  getAgentLanguages() {
    return readJson<AgentLanguageMap | null>("/agent-languages", undefined, null);
  },

  saveAgentLanguages(agentId: string, languages: string[]) {
    return sendJson("/agent-languages", "POST", { agentId, languages });
  },

  async getLiveAgents(options?: { fresh?: boolean }) {
    const result = await this.getLiveAgentsSnapshot(options);
    return result.data;
  },

  async getLiveAgentsSnapshot(options?: { fresh?: boolean }): Promise<ApiLoadResult<LiveAgentRecord[]>> {
    const query = options?.fresh ? "?fresh=1" : "";
    const response = await readJsonResult<unknown>(`/live-agents${query}`, undefined, []);
    const payload = response.data;
    return {
      ...response,
      ok: response.ok && Array.isArray(payload),
      data: Array.isArray(payload)
        ? payload.map((record) => normalizeLiveAgentRecord(record)).filter((record): record is LiveAgentRecord => Boolean(record))
        : [],
    };
  },

  startLiveCallMonitor(payload: {
    requestedById: string;
    targetAgentId: string;
    mode: LiveCallMonitorMode;
  }) {
    return readJson<LiveCallMonitorResult>("/live-call-monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  startConferenceCall(payload: {
    requestedById: string;
    targetPhone: string;
  }) {
    return readJson<ConferenceCallResult>("/calls/conference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  async getAutoDialLeads() {
    const result = await this.getAutoDialLeadsSnapshot();
    return result.data;
  },

  async getAutoDialLeadsSnapshot(options?: {
    agentId?: string;
    readyOnly?: boolean;
    workMode?: "outbound-auto" | "follow-up";
  }): Promise<ApiLoadResult<AutoDialLeadRecord[]>> {
    const query = new URLSearchParams();
    if (options?.agentId) query.set("agentId", options.agentId);
    if (options?.readyOnly) query.set("readyOnly", "1");
    if (options?.workMode) query.set("workMode", options.workMode);
    const response = await readJsonResult<unknown>(
      `/auto-dial/leads${query.size ? `?${query.toString()}` : ""}`,
      undefined,
      [],
    );
    const payload = response.data;
    return {
      ...response,
      ok: response.ok && Array.isArray(payload),
      data: Array.isArray(payload)
        ? payload.map((record) => normalizeAutoDialLeadRecord(record)).filter((record): record is AutoDialLeadRecord => Boolean(record))
        : [],
    };
  },

  getAutoDialControl() {
    return readJson<AutoDialControlState>("/auto-dial/control", undefined, { enabled: true });
  },

  setAutoDialControl(payload: {
    enabled: boolean;
    freshLeadAutoConnectEnabled?: boolean;
    freshLeadAutoConnectIntervalSeconds?: number;
    updatedById?: string;
    updatedByName?: string;
  }) {
    return readJson<AutoDialControlState>("/auto-dial/control", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { enabled: payload.enabled, error: "Error" });
  },

  getStatusFollowUps() {
    return readJson<StatusFollowUpQueueRecord[]>("/status-followups", undefined, []);
  },

  updateStatusFollowUp(id: string, formStatus: string) {
    return readJson<MutationResult>(`/status-followups/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formStatus }),
    }, { error: "Error" });
  },

  getJustDialLeads() {
    return readJson<JustDialLeadRecord[]>("/justdial/leads", undefined, []);
  },

  getTodayLeadSourceCounts(options?: { forceSync?: boolean }) {
    const suffix = options?.forceSync ? "?sync=1" : "";
    return readJson<TodayLeadSourceCounts>(`/lead-source-counts/today${suffix}`, undefined, {
      date: "",
      website: 0,
      google: 0,
      blogs: 0,
      justdial: 0,
      meta: 0,
      error: "Error",
    });
  },

  queueJustDialLead(leadId: string, options?: { priority?: boolean }) {
    return readJson<QueueJustDialLeadResult>(`/justdial/leads/${encodeURIComponent(leadId)}/queue-autodial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: Boolean(options?.priority) }),
    }, { error: "Error" });
  },

  exportJustDialLeadsToFollowUps(leadIds: string[]) {
    return readJson<ExportSourceFollowUpsResult>("/justdial/leads/export-followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds }),
    }, { error: "Error" });
  },

  getWebsiteLeads(options?: { forceSync?: boolean }) {
    const suffix = options?.forceSync ? "?sync=1" : "";
    return readJson<WebsiteLeadRecord[]>(`/website-leads${suffix}`, undefined, []);
  },

  getBlogLeads(options?: { forceSync?: boolean }) {
    const suffix = options?.forceSync ? "?sync=1" : "";
    return readJson<BlogLeadsResponse>(`/blog-leads${suffix}`, undefined, { rows: [], error: "Error" });
  },

  getGoogleLeads(options?: { forceSync?: boolean }) {
    const suffix = options?.forceSync ? "?sync=1" : "";
    return readJson<GoogleLeadRecord[]>(`/google-leads${suffix}`, undefined, []);
  },

  queueWebsiteLead(leadId: string, options?: { priority?: boolean }) {
    return readJson<QueueWebsiteLeadResult>(`/website-leads/${encodeURIComponent(leadId)}/queue-autodial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: Boolean(options?.priority) }),
    }, { error: "Error" });
  },

  queueGoogleLead(leadId: string, options?: { priority?: boolean }) {
    return readJson<QueueWebsiteLeadResult>(`/website-leads/${encodeURIComponent(leadId)}/queue-autodial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: Boolean(options?.priority) }),
    }, { error: "Error" });
  },

  exportWebsiteLeadsToFollowUps(leadIds: string[]) {
    return readJson<ExportSourceFollowUpsResult>("/website-leads/export-followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds }),
    }, { error: "Error" });
  },

  queueBlogLead(leadId: string, options?: { priority?: boolean }) {
    return readJson<QueueWebsiteLeadResult>(`/website-leads/${encodeURIComponent(leadId)}/queue-autodial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: Boolean(options?.priority) }),
    }, { error: "Error" });
  },

  exportBlogLeadsToFollowUps(leadIds: string[]) {
    return readJson<ExportSourceFollowUpsResult>("/blog-leads/export-followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds }),
    }, { error: "Error" });
  },

  getMetaLeads(options?: { forceSync?: boolean }) {
    const suffix = options?.forceSync ? "?sync=1" : "";
    return readJson<MetaLeadsResponse>(`/meta-leads${suffix}`, undefined, { rows: [], error: "Error" });
  },

  async getSeoMarketingLeadDashboard(query: SeoMarketingLeadDashboardQuery = {}): Promise<ApiLoadResult<SeoMarketingLeadDashboardResponse>> {
    const response = await readJsonResult<SeoMarketingLeadDashboardResponse>(
      `/seo-marketing/leads${buildQueryString(query)}`,
      undefined,
      emptySeoMarketingLeadDashboardResponse(),
    );
    return {
      ...response,
      data: {
        ...emptySeoMarketingLeadDashboardResponse(),
        ...(isRecord(response.data) ? response.data : {}),
      } as SeoMarketingLeadDashboardResponse,
    };
  },

  getSeoMarketingLeadDashboardExportUrl(query: SeoMarketingLeadDashboardQuery = {}) {
    return buildApiUrl(`/seo-marketing/leads/export${buildQueryString(query)}`);
  },

  async getSeoMarketingSpendDetails(query: SeoMarketingLeadDashboardQuery = {}): Promise<ApiLoadResult<SeoMarketingSpendResponse>> {
    const fallback: SeoMarketingSpendResponse = {
      metric: "spend",
      totalSpend: 0,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 50,
      totalRows: 0,
      totalPages: 1,
      rows: [],
    };
    const response = await readJsonResult<SeoMarketingSpendResponse>(
      `/warroom/marketing/spend${buildQueryString(query)}`,
      undefined,
      fallback,
    );
    return {
      ...response,
      data: {
        ...fallback,
        ...(isRecord(response.data) ? response.data : {}),
      } as SeoMarketingSpendResponse,
    };
  },

  getSeoMarketingSpendExportUrl(query: SeoMarketingLeadDashboardQuery = {}) {
    return buildApiUrl(`/warroom/marketing/spend/export${buildQueryString(query)}`);
  },

  getGoogleMarketingIntegrationStatus(role?: UserRole, options?: { verify?: boolean }) {
    return readJson<GoogleMarketingIntegrationStatus>(
      `/seo-marketing/google/status${buildQueryString({ role, verify: options?.verify ? "1" : "" })}`,
      undefined,
      {
        configured: false,
        source: "missing",
        credentialPath: "",
        projectId: "",
        clientEmail: "",
        clientId: "",
        emailMatchesExpected: false,
        clientIdMatchesExpected: false,
        scopes: [],
        tokenStatus: "not_checked",
        tokenExpiresAt: "",
        tokenError: "",
        ga4: { configured: false, propertyId: "" },
        searchConsole: { configured: false, siteUrl: "" },
        googleAds: {
          configured: false,
          customerId: "",
          managerCustomerId: "",
          developerTokenConfigured: false,
          refreshTokenConfigured: false,
          serviceAccountUsable: false,
        },
        warnings: [],
        updatedAt: "",
      },
    );
  },

  queueMetaLead(leadId: string, options?: { priority?: boolean }) {
    return readJson<QueueWebsiteLeadResult>(`/meta-leads/${encodeURIComponent(leadId)}/queue-autodial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: Boolean(options?.priority) }),
    }, { error: "Error" });
  },

  exportMetaLeadsToFollowUps(leadIds: string[]) {
    return readJson<ExportSourceFollowUpsResult>("/meta-leads/export-followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds }),
    }, { error: "Error" });
  },

  async importAutoDialLeads(
    fileName: string,
    leads: AutoDialLeadImportRow[],
    options?: {
      batchSize?: number;
      onProgress?: (progress: AutoDialImportProgress) => void;
    },
  ) {
    const batchSize = Math.max(1, options?.batchSize ?? AUTO_DIAL_IMPORT_BATCH_SIZE);
    const totalBatches = Math.max(1, Math.ceil(leads.length / batchSize));
    let inserted = 0;
    let invalid = 0;
    let duplicatesIgnored = 0;
    let processedRows = 0;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
      const start = batchIndex * batchSize;
      const batch = leads.slice(start, start + batchSize);
      const result = await postAutoDialImportBatch(fileName, batch);
      inserted += result.inserted ?? 0;
      invalid += result.invalid ?? 0;
      duplicatesIgnored += result.duplicatesIgnored ?? 0;
      processedRows += batch.length;

      options?.onProgress?.({
        completedBatches: batchIndex + 1,
        totalBatches,
        processedRows,
        totalRows: leads.length,
        inserted,
        invalid,
        duplicatesIgnored,
      });

      if (result.error) {
        return {
          error: result.error,
          inserted,
          invalid,
          duplicatesIgnored,
        } satisfies AutoDialImportResult;
      }
    }

    return {
      success: true,
      inserted,
      invalid,
      duplicatesIgnored,
    } satisfies AutoDialImportResult;
  },

  async getCurrentAutoDialLead(agentId: string) {
    const payload = await readJson<unknown>(`/auto-dial/agent/${encodeURIComponent(agentId)}/current`, undefined, null);
    return normalizeAutoDialLeadRecord(payload);
  },

  updateAutoDialLead(id: string, payload: AutoDialLeadUpdatePayload) {
    return readJson<MutationResult>(`/auto-dial/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  getBranches() {
    return readJson<unknown>("/branches", undefined, []).then((payload) => (
      Array.isArray(payload)
        ? payload
            .map((record) => normalizeRealBranchRecord(record))
            .filter((record): record is RealBranchRecord => Boolean(record))
        : []
    ));
  },

  createBranch(data: BranchUpsertPayload) {
    return readJson<MutationResult>("/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }, { error: "Error" });
  },

  updateBranch(id: string, data: Partial<BranchUpsertPayload>) {
    return readJson<MutationResult>(`/branches/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }, { error: "Error" });
  },

  deleteBranch(id: string) {
    return readJson<MutationResult>(`/branches/${id}`, { method: "DELETE" }, { error: "Error" });
  },

  getPlaceSuggestions(query: string) {
    return readJson<unknown>(`/places/autocomplete?q=${encodeURIComponent(query)}`, undefined, []).then((payload) => (
      Array.isArray(payload)
        ? payload
            .map((record) => normalizePlaceSuggestionRecord(record))
            .filter((record): record is PlaceSuggestionRecord => Boolean(record))
        : []
    ));
  },

  geocodePlace(address: string) {
    return readJson<unknown>(`/places/geocode?address=${encodeURIComponent(address)}`, undefined, null).then((payload) => (
      normalizeGeocodePlaceResult(payload)
    ));
  },

  searchNearbyBranches(locationOrCoordinates: string | { lat: number; lng: number }) {
    const query = typeof locationOrCoordinates === "string"
      ? `location=${encodeURIComponent(locationOrCoordinates)}`
      : `lat=${encodeURIComponent(String(locationOrCoordinates.lat))}&lng=${encodeURIComponent(String(locationOrCoordinates.lng))}`;

    return readJson<unknown>(`/branches/search-nearby?${query}`, undefined, []).then((payload) => (
      Array.isArray(payload)
        ? payload
            .map((record) => normalizeRealBranchRecord(record))
            .filter((record): record is NearbyBranchRecord => Boolean(record))
        : []
    ));
  },

  sendSMS(phone: string, branchId: string) {
    return readJson<SmsResult>("/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, branchId }),
    }, { error: "Network error" });
  },

  getSMSLog(limit = 200) {
    const safeLimit = Math.min(Math.max(Math.round(limit) || 200, 1), 1000);
    return readJson<SmsLogRecord[]>(`/sms-log?limit=${safeLimit}`, undefined, []);
  },

  getSMSLogPage(options?: {
    page?: number;
    status?: SmsLogStatusFilter;
    search?: string;
    date?: string;
  }) {
    const page = Math.max(1, Math.round(options?.page || 1));
    const pageSize = 50;
    const status = options?.status || "all";
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      status,
    });
    const search = options?.search?.trim();
    if (search) params.set("search", search);
    const date = options?.date?.trim();
    if (date) params.set("date", date);
    return readJson<SmsLogPage>(`/sms-log?${params.toString()}`, undefined, {
      rows: [],
      totalRecords: 0,
      page,
      pageSize,
      totalPages: 0,
      summary: { all: 0, delivered: 0, failed: 0, pending: 0 },
    });
  },

  async getAgentsSnapshot(): Promise<ApiLoadResult<AgentRecord[]>> {
    const response = await readJsonResult<unknown>("/agents", undefined, []);
    const payload = response.data;
    return {
      ...response,
      ok: response.ok && Array.isArray(payload),
      data: Array.isArray(payload)
        ? payload.map((record) => normalizeAgentRecord(record)).filter((record): record is AgentRecord => Boolean(record))
        : [],
    };
  },

  async getAgents() {
    const result = await this.getAgentsSnapshot();
    return result.data;
  },

  async getAgent(id: string) {
    const agentId = String(id || "").trim().toUpperCase();
    if (!agentId) return null;
    const response = await readJsonResult<unknown>(`/agents/${encodeURIComponent(agentId)}`, undefined, null);
    if (!response.ok || !response.data) return null;
    return normalizeAgentRecord(response.data);
  },

  getAdminBroadcast(options?: { agentId?: string }) {
    const agentId = String(options?.agentId || "").trim();
    const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
    return readJson<AdminBroadcastResponse>(`/admin-broadcast${query}`, undefined, {
      active: false,
      message: "",
      broadcast: null,
    });
  },

  getAdminBroadcastHistory(limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    return readJson<AdminBroadcastRecord[]>(`/admin-broadcast/history?limit=${safeLimit}`, undefined, []);
  },

  sendAdminBroadcast(payload: {
    message: string;
    recipientScope: AdminBroadcastRecipientScope;
    expiry: AdminBroadcastExpiry;
    sentById?: string;
    sentByName?: string;
  }) {
    return readJson<MutationResult & { broadcast?: AdminBroadcastRecord }>("/admin-broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" });
  },

  clearAdminBroadcast(payload?: { clearedById?: string; clearedByName?: string }) {
    return readJson<MutationResult>("/admin-broadcast", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    }, { error: "Error" });
  },

  getAgentSessions(options?: { limit?: number; days?: number }) {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.days) params.set("days", String(options.days));
    const query = params.toString();
    return readJson<AgentSessionRecord[]>(`/agent-sessions${query ? `?${query}` : ""}`, undefined, []);
  },

  createAgent(data: Partial<AgentRecord> & { password: string }) {
    return readJson<MutationResult>("/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }, { error: "Error" });
  },

  updateAgent(id: string, data: Partial<AgentRecord> & Record<string, unknown>) {
    return readJson<MutationResult>(`/agents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }, { error: "Error" });
  },

  triggerUiRefresh(scope: "agents" | "all" = "agents", reason = "") {
    return readJson<MutationResult>("/ui-refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, reason }),
    }, { error: "Error" });
  },

  claimAgentCallSlot(id: string, payload: {
    callId: string;
    direction?: "incoming" | "outgoing" | string;
    fallbackAgentStatus?: "active" | "inactive" | "outbound-auto" | "follow-up" | "manual-outgoing";
    customerNumber?: string;
  }) {
    return readMutationJsonWithRetry(`/agents/${id}/call-slot/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, { error: "Error" }, {
      retries: 2,
      retryDelayMs: 300,
    });
  },

  releaseAgentCallSlot(id: string, payload: {
    callId?: string;
    nextStatus?: "active" | "inactive" | "outbound-auto" | "follow-up" | "manual-outgoing";
    force?: boolean;
    forceHangup?: boolean;
    keepalive?: boolean;
  }) {
    return readMutationJsonWithRetry(`/agents/${id}/call-slot/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: payload.callId,
        nextStatus: payload.nextStatus,
        force: payload.force,
        forceHangup: payload.forceHangup,
      }),
      keepalive: payload.keepalive,
    }, { error: "Error" }, {
      retries: 1,
      retryDelayMs: 300,
    });
  },

  resetAgentCallState(id: string, payload?: {
    nextStatus?: "active" | "inactive" | "outbound-auto" | "follow-up" | "manual-outgoing";
    finalCallStatus?: "failed" | "ended" | "missed" | "completed" | "transferred";
    reason?: string;
    forceHangup?: boolean;
    keepalive?: boolean;
  }) {
    return readMutationJsonWithRetry(`/agents/${id}/call-state/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nextStatus: payload?.nextStatus,
        finalCallStatus: payload?.finalCallStatus,
        reason: payload?.reason,
        forceHangup: payload?.forceHangup,
      }),
      keepalive: payload?.keepalive,
    }, { error: "Error" }, {
      retries: 1,
      retryDelayMs: 300,
    });
  },

  changeAgentPassword(id: string, password: string) {
    return readJson<MutationResult>(`/agents/${id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }, { error: "Error" });
  },

  async login(id: string, password: string, options?: { deviceId?: string; computerIp?: string }) {
    try {
      const response = await fetch(buildApiUrl("/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          password,
          deviceId: options?.deviceId,
          computerIp: options?.computerIp,
        }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null as unknown);

      if (!response.ok) {
        const payloadError = readErrorLikeString(payload);
        const errorMessage = response.status === 401
          ? payloadError || "Invalid credentials"
          : response.status === 403
            ? payloadError || "Account inactive"
            : "Backend login unavailable";
        throw createApiRequestError(errorMessage, { status: response.status });
      }

      return normalizeAuthUserRecord(payload);
    } catch (error) {
      if (isApiRequestError(error)) {
        throw error;
      }

      console.error("API request failed for /login:", error);
      throw createApiRequestError("Backend login unavailable", { network: true });
    }
  },

  async getConversionData(contact: string, options?: { strict?: boolean }) {
    try {
      const params = new URLSearchParams({ contact });
      if (options?.strict) {
        params.set("strict", "1");
      }

      const response = await fetch(buildApiUrl(`/customerdata?${params.toString()}`), {
        cache: "no-store",
      });
      if (!response.ok) {
        return [];
      }

      const payload = await response.json() as unknown;
      return normalizeConversionPayload(payload, contact);
    } catch (error) {
      console.error(`Conversion lookup failed for ${contact}:`, error);
      return [];
    }
  },
};

function normalizeConversionPayload(payload: unknown, fallbackContact: string): ConversionApiRecord[] {
  if (!payload) {
    return [];
  }

  const records = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && "data" in payload && Array.isArray((payload as { data?: unknown[] }).data)
      ? (payload as { data: unknown[] }).data
      : [payload];

  return records
    .filter((record): record is Record<string, unknown> => typeof record === "object" && record !== null)
    .map((row) => {
      const extra = readJsonObject(row.extra);
      const source = readString(row, ["source", "sourceAttribution", "source_status", "howToKnowAttica"]);
      const transactionStatus = readString(row, ["transactionStatus", "transaction_status"]);
      const billAmount = Number(row.billAmount ?? row.billingAmount ?? 0) || 0;
      return {
        billId: readString(row, ["billId", "bill_id", "remoteId", "remote_id", "id"]),
        customerName: readString(row, ["customerName", "customer", "cx_name", "name", "customer_name"]),
        contact: readString(row, ["contact", "mobile", "phone", "customer_mobile"]) || fallbackContact,
        type: readString(row, ["type", "customer_type"]),
        branch: readString(row, ["branch", "branch_name"]),
        date: readString(row, ["date", "created_date", "visit_date"]),
        time: readString(row, ["time", "created_time", "visit_time"]),
        status: readString(row, ["status"]),
        ...(source ? { source } : {}),
        ...(transactionStatus ? { transactionStatus } : {}),
        ...(billAmount ? { billAmount } : {}),
        dispositionCategory: readString(row, ["dispositionCategory", "disposition_category"]),
        grossW:
          readString(row, ["grossW", "gross_w", "grossWeight", "gross_weight", "gross"]) ||
          readString(extra, ["GrossW", "grossW", "gross_weight", "gross"]),
        netW:
          readString(row, ["netW", "NetW", "net_w", "netWeight", "NetWeight", "net_weight", "netweight", "netWt", "NetWt", "net_wt", "Net W", "Net Weight", "net weight"]) ||
          readString(extra, ["NetW", "netW", "NetWeight", "netWeight", "net_weight", "netweight", "netWt", "NetWt", "net_wt", "Net W", "Net Weight", "net weight"]),
        walkinType: readString(row, ["walkinType", "walkin_type", "walkin"]),
      };
    })
    .filter((row) =>
      Boolean(
        row.customerName ||
        row.billId ||
        row.contact ||
        row.type ||
        row.branch ||
        row.date ||
        row.time ||
        row.status ||
        row.grossW ||
        row.netW ||
        row.walkinType,
      ),
    );
}

function readString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
