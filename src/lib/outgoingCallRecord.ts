import type { CallRecord } from "@/data/mockData";

type OutgoingConnectedCallArgs = {
  id: string;
  callerId: string;
  customerName: string;
  agentId: string;
  agentName: string;
  time: string;
  date: string;
  place?: string;
  leadSource?: string;
  language?: string;
  branch?: string;
  purpose?: string;
  businessType?: string;
  metalType?: string;
  grams?: string;
  releasingAmount?: string;
  bankName?: string;
  onlinePrice?: string;
  pricePerGram?: string;
  advertisement?: string;
  lead?: string;
  formStatus?: string;
  mob2?: string;
  district?: string;
  notes?: string;
  ringStartedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  talkDurationSeconds?: number;
};

type OutgoingMissedCallArgs = OutgoingConnectedCallArgs & {
  duration: string;
  status?: CallRecord["status"];
  callbackStatus?: string;
  followUpFlag?: boolean;
  notes?: string;
};

export function buildOutgoingConnectedCall(args: OutgoingConnectedCallArgs): CallRecord {
  return {
    id: args.id,
    callerId: args.callerId,
    callerName: args.customerName,
    customerName: args.customerName,
    displayCustomerName: args.customerName,
    agentId: args.agentId,
    agentName: args.agentName,
    direction: "outgoing",
    status: "active",
    duration: "00:00",
    time: args.time,
    date: args.date,
    ringStartedAt: args.ringStartedAt || "",
    answeredAt: args.answeredAt || "",
    endedAt: args.endedAt || "",
    talkDurationSeconds: Math.max(0, Number(args.talkDurationSeconds) || 0),
    language: args.language || "",
    hasRecording: true,
    branch: args.branch || "",
    place: args.place || "",
    purpose: args.purpose || "Outbound",
    businessType: args.businessType || "",
    metalType: args.metalType || "",
    grams: args.grams || "",
    releasingAmount: args.releasingAmount || "",
    bankName: args.bankName || "",
    onlinePrice: args.onlinePrice || "",
    pricePerGram: args.pricePerGram || "",
    advertisement: args.advertisement || "",
    lead: args.lead || "",
    formStatus: args.formStatus || "",
    mob2: args.mob2 || "",
    district: args.district || "",
    callbackStatus: "Scheduled",
    followUpFlag: false,
    leadSource: args.leadSource || "",
    notes: args.notes || "",
    createdAt: args.answeredAt || args.ringStartedAt || args.endedAt || new Date().toISOString(),
  };
}

export function buildOutgoingMissedCall(args: OutgoingMissedCallArgs): CallRecord {
  const status = args.status === "missed" ? "failed" : (args.status || "failed");

  return {
    id: args.id,
    callerId: args.callerId,
    callerName: args.customerName,
    customerName: args.customerName,
    displayCustomerName: args.customerName,
    agentId: args.agentId,
    agentName: args.agentName,
    direction: "outgoing",
    status,
    // Unanswered attempts should not report ring time as talk time.
    duration: "00:00",
    time: args.time,
    date: args.date,
    ringStartedAt: args.ringStartedAt || "",
    answeredAt: args.answeredAt || "",
    endedAt: args.endedAt || "",
    talkDurationSeconds: Math.max(0, Number(args.talkDurationSeconds) || 0),
    language: args.language || "",
    hasRecording: true,
    branch: args.branch || "",
    place: args.place || "",
    purpose: args.purpose || "Outbound",
    businessType: args.businessType || "",
    metalType: args.metalType || "",
    grams: args.grams || "",
    releasingAmount: args.releasingAmount || "",
    bankName: args.bankName || "",
    onlinePrice: args.onlinePrice || "",
    pricePerGram: args.pricePerGram || "",
    advertisement: args.advertisement || "",
    lead: args.lead || "",
    formStatus: args.formStatus || "",
    mob2: args.mob2 || "",
    district: args.district || "",
    callbackStatus: args.callbackStatus || "RNR",
    followUpFlag: args.followUpFlag ?? true,
    leadSource: args.leadSource || "",
    notes: args.notes || (
      status === "failed"
        ? `Outbound call failed before connecting (${args.callbackStatus || "Network Failure"})`
        : "Auto-marked as RNR because the outbound call did not connect"
    ),
    createdAt: args.ringStartedAt || args.answeredAt || args.endedAt || new Date().toISOString(),
  };
}
