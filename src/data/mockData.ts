export interface CallRecord {
  id: string; callerId: string; callerName: string; customerName?: string;
  customerId?: string;
  customerUid?: string;
  displayCustomerName?: string;
  intakeToken?: string;
  pbxSipCallId?: string;
  agentId: string; agentName: string; direction: "incoming" | "outgoing";
  status: "answered" | "missed" | "failed" | "transferred" | "active" | "on-hold" | "completed";
  duration: string; time: string; date: string; language: string; hasRecording: boolean;
  recordingName?: string;
  recordingSize?: number;
  recordingRecordedAt?: string;
  ringStartedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  talkDurationSeconds?: number;
  dataFillingStartedAt?: string;
  dataFillingDurationSeconds?: number;
  branch?: string; place?: string; purpose?: string;
  callbackStatus?: string; dispositionCategory?: string; followUpFlag?: boolean;
  leadSource?: string;
  carrierTrunk?: string;
  trunkCode?: string;
  pilot?: string;
  didOrCli?: string;
  mob2?: string; district?: string;
  age?: string;
  gender?: string;
  businessType?: string;
  metalType?: string;
  grams?: string;
  releaseGrossAmount?: string;
  releasingAmount?: string;
  pledgePlace?: string;
  otherPledgePlace?: string;
  differenceAmount?: string;
  bankName?: string;
  onlinePrice?: string;
  pricePerGram?: string;
  advertisement?: string;
  lead?: string;
  formStatus?: string;
  statusFollowUpAt?: string;
  quickNote?: string;
  notes?: string;
  smsSent?: boolean;
  createdAt?: string;
  callbackQueueStatus?: string;
  callbackCallId?: string;
  callbackResult?: string;
  callbackDisposition?: string;
  callbackAgentId?: string;
  callbackAgentName?: string;
  callbackTime?: string;
  callbackCreatedAt?: string;
  callbackEndedAt?: string;
}

export interface Agent {
  id: string; name: string; email: string; role: "admin" | "superadmin" | "agent" | "qc" | "seo";
  languages: string[]; shift: string; status: "active" | "inactive" | "on-break" | "lunch-break" | "restroom-break" | "outbound-auto" | "follow-up" | "manual-outgoing";
  callsToday: number; avgHandleTime: string; missedCalls: number;
  loginTime: string; activeDuration: string; breakTime: string;
  followUpStartedAt?: string;
  followUpDuration?: string;
  extension?: string;
}

export interface Branch { id: string; name: string; city: string; }

export interface FollowUpRecord {
  id: string; customerName: string; phone: string; branch: string;
  followUpAt: string; status: "Pending" | "Called" | "Rescheduled";
  agentId: string; agentName: string; notes?: string; outcome?: string; updatedAt?: string;
  sourceCallId?: string;
  sourceStatus?: string;
}

export interface MetalRate { label: string; value: string; }

export const MAX_AGENT_COUNT = 53;

const langs = ["English","Tamil","Hindi","Telugu","Kannada","Malayalam","Gujarati","Punjabi","Marathi","Bengali"];
const shiftList = [
  "7:00 AM - 4:00 PM",
  "7:30 AM - 4:30 PM",
  "8:00 AM - 5:00 PM",
  "9:00 AM - 6:00 PM",
  "9:30 AM - 6:30 PM",
  "10:00 AM - 7:00 PM",
  "10:30 AM - 7:30 PM",
  "11:00 AM - 8:00 PM",
];

// Real agents matching Asterisk extensions 2001-2053
const generatedAgents: Agent[] = Array.from({ length: MAX_AGENT_COUNT }, (_, index) => {
  const agentNumber = index + 1;
  return {
    id: `AG${String(agentNumber).padStart(3, "0")}`,
    name: `Agent ${agentNumber}`,
    email: `ag${String(agentNumber).padStart(3, "0")}@atticagold.com`,
    role: "agent",
    languages: [],
    shift: shiftList[index % 2],
    status: "active",
    callsToday: 0,
    avgHandleTime: "00:00",
    missedCalls: 0,
    loginTime: "",
    activeDuration: "00:00",
    breakTime: "00:00",
    extension: String(2001 + index),
  };
});

export const agents: Agent[] = [
  ...generatedAgents,
  { id:"ADMIN01", name:"Manoj", email:"admin@atticagold.com", role:"admin", languages:[], shift:shiftList[0], status:"active", callsToday:0, avgHandleTime:"00:00", missedCalls:0, loginTime:"09:00", activeDuration:"08:00", breakTime:"00:30", extension:"1001" },
  { id:"QC001", name:"Anita Desai", email:"qc1@atticagold.com", role:"qc", languages:[], shift:shiftList[0], status:"active", callsToday:0, avgHandleTime:"00:00", missedCalls:0, loginTime:"09:00", activeDuration:"07:30", breakTime:"00:25", extension:"3001" },
  { id:"QC002", name:"QC Lead", email:"qc2@atticagold.com", role:"qc", languages:[], shift:shiftList[1], status:"active", callsToday:0, avgHandleTime:"00:00", missedCalls:0, loginTime:"13:00", activeDuration:"06:00", breakTime:"00:30", extension:"3002" },
];

export const branches: Branch[] = [
  { id:"BR-001", name:"Bangalore MG Road", city:"Bangalore" },
  { id:"BR-002", name:"Chennai T Nagar", city:"Chennai" },
  { id:"BR-003", name:"Hyderabad Jubilee Hills", city:"Hyderabad" },
  { id:"BR-004", name:"Mumbai Dadar", city:"Mumbai" },
  { id:"BR-005", name:"Delhi Karol Bagh", city:"Delhi" },
  { id:"BR-006", name:"Kochi MG Road", city:"Kochi" },
];

// Start with empty — real calls populate via SIP.js
export const callRecords: CallRecord[] = [];

export const callsPerHour = [
  { hour:"08:00", calls:0 },{ hour:"09:00", calls:0 },{ hour:"10:00", calls:0 },
  { hour:"11:00", calls:0 },{ hour:"12:00", calls:0 },{ hour:"13:00", calls:0 },
  { hour:"14:00", calls:0 },{ hour:"15:00", calls:0 },{ hour:"16:00", calls:0 },
  { hour:"17:00", calls:0 },{ hour:"18:00", calls:0 },{ hour:"19:00", calls:0 },
];

export const weeklyVolume = [
  { day:"Mon", calls:0 },{ day:"Tue", calls:0 },{ day:"Wed", calls:0 },
  { day:"Thu", calls:0 },{ day:"Fri", calls:0 },{ day:"Sat", calls:0 },{ day:"Sun", calls:0 },
];

export const dailyHeatmap = [
  { slot:"09 AM", mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0 },
  { slot:"11 AM", mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0 },
  { slot:"01 PM", mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0 },
  { slot:"03 PM", mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0 },
  { slot:"05 PM", mon:0, tue:0, wed:0, thu:0, fri:0, sat:0, sun:0 },
];

// Start with empty follow-ups
export const followUps: FollowUpRecord[] = [];

export const preciousMetalRates: MetalRate[] = [
  { label:"Gold 22K", value:"₹6,450/g" },
  { label:"Gold 24K", value:"₹7,040/g" },
  { label:"Silver", value:"₹85/g" },
];

export const allLanguages = ["English","Hindi","Tamil","Telugu","Kannada","Malayalam","Gujarati","Punjabi","Marathi","Bengali"];
export const allShifts = [...shiftList];
export const visitPurposes = ["Gold Loan","Gold Purchase","Gold Sale","Jewellery Enquiry","Other"];
