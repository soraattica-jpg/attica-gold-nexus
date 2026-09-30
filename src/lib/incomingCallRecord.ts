import type { CallRecord } from "@/data/mockData";

type IncomingCallRecordArgs = {
  id: string;
  callerId: string;
  customerName: string;
  agentId: string;
  agentName: string;
  time: string;
  date: string;
  place?: string;
  mob2?: string;
  district?: string;
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
  leadSource?: string;
  carrierTrunk?: string;
  trunkCode?: string;
  pilot?: string;
  didOrCli?: string;
  formStatus?: string;
  notes?: string;
  ringStartedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  talkDurationSeconds?: number;
  status?: CallRecord["status"];
  callbackStatus?: string;
  followUpFlag?: boolean;
  hasRecording?: boolean;
  duration?: string;
  createdAt?: string;
};

export function buildIncomingCallRecord(args: IncomingCallRecordArgs): CallRecord {
  return {
    id: args.id,
    callerId: args.callerId,
    callerName: args.customerName,
    customerName: args.customerName,
    displayCustomerName: args.customerName,
    agentId: args.agentId,
    agentName: args.agentName,
    direction: "incoming",
    status: args.status || "active",
    duration: args.duration || "00:00",
    time: args.time,
    date: args.date,
    ringStartedAt: args.ringStartedAt || "",
    answeredAt: args.answeredAt || "",
    endedAt: args.endedAt || "",
    talkDurationSeconds: Math.max(0, Number(args.talkDurationSeconds) || 0),
    language: args.language || "",
    hasRecording: args.hasRecording ?? true,
    branch: args.branch || "",
    place: args.place || "",
    purpose: args.purpose || "Inbound Enquiry",
    businessType: args.businessType || "",
    metalType: args.metalType || "",
    grams: args.grams || "",
    releasingAmount: args.releasingAmount || "",
    bankName: args.bankName || "",
    onlinePrice: args.onlinePrice || "",
    pricePerGram: args.pricePerGram || "",
    advertisement: args.advertisement || "",
    lead: args.lead || "",
    leadSource: args.leadSource || "",
    carrierTrunk: args.carrierTrunk || "",
    trunkCode: args.trunkCode || "",
    pilot: args.pilot || "",
    didOrCli: args.didOrCli || "",
    formStatus: args.formStatus || "",
    mob2: args.mob2 || "",
    district: args.district || "",
    callbackStatus: args.callbackStatus || "None",
    followUpFlag: args.followUpFlag ?? false,
    notes: args.notes || "",
    createdAt: args.createdAt || args.answeredAt || args.ringStartedAt || args.endedAt || new Date().toISOString(),
  };
}
