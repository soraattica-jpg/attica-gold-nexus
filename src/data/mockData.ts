export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  customerName?: string;
  agentId: string;
  agentName: string;
  direction: "incoming" | "outgoing";
  status: "answered" | "missed" | "transferred" | "active" | "on-hold" | "completed";
  duration: string;
  time: string;
  date: string;
  language: string;
  hasRecording: boolean;
  branch?: string;
  place?: string;
  purpose?: string;
  callbackStatus?: "Pending" | "Scheduled" | "Completed";
  followUpFlag?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent" | "qc";
  languages: string[];
  shift: string;
  status: "active" | "inactive" | "on-break";
  callsToday: number;
  avgHandleTime: string;
  missedCalls: number;
  loginTime: string;
  activeDuration: string;
  breakTime: string;
  qcGroupId?: string;
}

export interface QCGroup {
  id: string;
  name: string;
  reviewerId: string;
  reviewerName: string;
  agentIds: string[];
  reviewTarget: number;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
}

export interface FollowUpRecord {
  id: string;
  customerName: string;
  phone: string;
  branch: string;
  followUpAt: string;
  status: "Pending" | "Called" | "Rescheduled";
  agentId: string;
  agentName: string;
  notes?: string;
}

export interface MetalRate {
  label: string;
  value: string;
}

export const agents: Agent[] = [
  { id: "USR-001", name: "Rajesh Kumar", email: "rajesh@attica.com", role: "admin", languages: ["English", "Hindi"], shift: "Morning (9AM-5PM)", status: "active", callsToday: 0, avgHandleTime: "00:00", missedCalls: 0, loginTime: "08:55", activeDuration: "07:45", breakTime: "00:30" },
  { id: "USR-002", name: "Arun Patel", email: "arun@attica.com", role: "agent", languages: ["English", "Gujarati"], shift: "Morning (9AM-5PM)", status: "active", callsToday: 34, avgHandleTime: "04:22", missedCalls: 3, loginTime: "08:58", activeDuration: "07:30", breakTime: "00:45" },
  { id: "USR-003", name: "Meena Iyer", email: "meena@attica.com", role: "agent", languages: ["English", "Tamil", "Telugu"], shift: "Morning (9AM-5PM)", status: "active", callsToday: 41, avgHandleTime: "03:48", missedCalls: 1, loginTime: "08:50", activeDuration: "07:50", breakTime: "00:20" },
  { id: "USR-004", name: "Priya Sharma", email: "priya@attica.com", role: "agent", languages: ["English", "Hindi"], shift: "Afternoon (1PM-9PM)", status: "active", callsToday: 28, avgHandleTime: "05:11", missedCalls: 5, loginTime: "12:55", activeDuration: "06:20", breakTime: "00:35" },
  { id: "USR-005", name: "Vikram Singh", email: "vikram@attica.com", role: "agent", languages: ["English", "Hindi", "Punjabi"], shift: "Morning (9AM-5PM)", status: "on-break", callsToday: 22, avgHandleTime: "04:45", missedCalls: 2, loginTime: "09:02", activeDuration: "06:55", breakTime: "01:00" },
  { id: "USR-006", name: "Lakshmi Rao", email: "lakshmi@attica.com", role: "agent", languages: ["English", "Telugu", "Kannada"], shift: "Afternoon (1PM-9PM)", status: "active", callsToday: 37, avgHandleTime: "03:55", missedCalls: 0, loginTime: "12:50", activeDuration: "07:40", breakTime: "00:15" },
  { id: "USR-007", name: "Anita Desai", email: "anita@attica.com", role: "qc", languages: ["English", "Hindi", "Marathi"], shift: "Morning (9AM-5PM)", status: "active", callsToday: 0, avgHandleTime: "00:00", missedCalls: 0, loginTime: "09:00", activeDuration: "07:30", breakTime: "00:25" },
  { id: "USR-008", name: "Suresh Nair", email: "suresh@attica.com", role: "qc", languages: ["English", "Malayalam", "Tamil"], shift: "Afternoon (1PM-9PM)", status: "active", callsToday: 0, avgHandleTime: "00:00", missedCalls: 0, loginTime: "13:00", activeDuration: "06:00", breakTime: "00:30" },
];

export const branches: Branch[] = [
  { id: "BR-001", name: "Chennai Central", city: "Chennai" },
  { id: "BR-002", name: "Bangalore MG Road", city: "Bangalore" },
  { id: "BR-003", name: "Hyderabad Banjara Hills", city: "Hyderabad" },
  { id: "BR-004", name: "Mumbai Andheri", city: "Mumbai" },
  { id: "BR-005", name: "Delhi Connaught Place", city: "Delhi" },
  { id: "BR-006", name: "Coimbatore Crosscut", city: "Coimbatore" },
];

export const callRecords: CallRecord[] = [
  { id: "CALL-001", callerId: "+91 98765 43210", callerName: "Ramesh Gupta", customerName: "Ramesh Gupta", agentId: "USR-002", agentName: "Arun Patel", direction: "incoming", status: "answered", duration: "04:32", time: "09:15", date: "2026-03-18", language: "Hindi", hasRecording: true, branch: "Chennai Central", place: "Chennai", purpose: "Gold Loan", callbackStatus: "Completed", followUpFlag: false },
  { id: "CALL-002", callerId: "+91 87654 32109", callerName: "Sunita Devi", customerName: "Sunita Devi", agentId: "USR-003", agentName: "Meena Iyer", direction: "incoming", status: "answered", duration: "03:18", time: "09:22", date: "2026-03-18", language: "Tamil", hasRecording: true, branch: "Bangalore MG Road", place: "Bangalore", purpose: "Gold Purchase", callbackStatus: "Completed", followUpFlag: true },
  { id: "CALL-003", callerId: "+91 76543 21098", callerName: "Mohan Das", customerName: "Mohan Das", agentId: "USR-004", agentName: "Priya Sharma", direction: "incoming", status: "missed", duration: "00:00", time: "09:28", date: "2026-03-18", language: "Hindi", hasRecording: false, branch: "Hyderabad Banjara Hills", place: "Hyderabad", purpose: "Gold Sale", callbackStatus: "Pending", followUpFlag: true },
  { id: "CALL-004", callerId: "+91 65432 10987", callerName: "Kavitha R", customerName: "Kavitha R", agentId: "USR-006", agentName: "Lakshmi Rao", direction: "incoming", status: "answered", duration: "06:45", time: "09:35", date: "2026-03-18", language: "Telugu", hasRecording: true, branch: "Mumbai Andheri", place: "Mumbai", purpose: "Jewellery Enquiry", callbackStatus: "Scheduled", followUpFlag: false },
  { id: "CALL-005", callerId: "+91 54321 09876", callerName: "Ajay Mehta", customerName: "Ajay Mehta", agentId: "USR-002", agentName: "Arun Patel", direction: "outgoing", status: "completed", duration: "02:15", time: "09:45", date: "2026-03-18", language: "English", hasRecording: true, branch: "Delhi Connaught Place", place: "Delhi", purpose: "Gold Purchase", callbackStatus: "Completed", followUpFlag: false },
  { id: "CALL-006", callerId: "+91 43210 98765", callerName: "Deepa Nair", customerName: "Deepa Nair", agentId: "USR-003", agentName: "Meena Iyer", direction: "incoming", status: "active", duration: "01:22", time: "10:05", date: "2026-03-18", language: "Malayalam", hasRecording: false, branch: "Coimbatore Crosscut", place: "Coimbatore", purpose: "Gold Loan", callbackStatus: "Scheduled", followUpFlag: false },
  { id: "CALL-007", callerId: "+91 32109 87654", callerName: "Sanjay Verma", customerName: "Sanjay Verma", agentId: "USR-005", agentName: "Vikram Singh", direction: "incoming", status: "on-hold", duration: "03:10", time: "10:12", date: "2026-03-18", language: "Punjabi", hasRecording: false, branch: "Chennai Central", place: "Chennai", purpose: "Gold Loan", callbackStatus: "Scheduled", followUpFlag: false },
  { id: "CALL-008", callerId: "+91 21098 76543", callerName: "Fatima Sheikh", customerName: "Fatima Sheikh", agentId: "USR-004", agentName: "Priya Sharma", direction: "incoming", status: "missed", duration: "00:00", time: "10:18", date: "2026-03-18", language: "Hindi", hasRecording: false, branch: "Bangalore MG Road", place: "Bangalore", purpose: "Jewellery Enquiry", callbackStatus: "Pending", followUpFlag: true },
  { id: "CALL-009", callerId: "+91 10987 65432", callerName: "Ravi Shankar", customerName: "Ravi Shankar", agentId: "USR-006", agentName: "Lakshmi Rao", direction: "outgoing", status: "completed", duration: "05:30", time: "10:30", date: "2026-03-18", language: "Kannada", hasRecording: true, branch: "Mumbai Andheri", place: "Mumbai", purpose: "Gold Sale", callbackStatus: "Completed", followUpFlag: false },
  { id: "CALL-010", callerId: "+91 99876 54321", callerName: "Geeta Patel", customerName: "Geeta Patel", agentId: "USR-002", agentName: "Arun Patel", direction: "incoming", status: "transferred", duration: "01:45", time: "10:42", date: "2026-03-18", language: "Gujarati", hasRecording: true, branch: "Delhi Connaught Place", place: "Delhi", purpose: "Gold Purchase", callbackStatus: "Scheduled", followUpFlag: false },
  { id: "CALL-011", callerId: "+91 88765 43210", callerName: "Harish Reddy", customerName: "Harish Reddy", agentId: "USR-003", agentName: "Meena Iyer", direction: "incoming", status: "answered", duration: "07:20", time: "11:00", date: "2026-03-18", language: "Telugu", hasRecording: true, branch: "Hyderabad Banjara Hills", place: "Hyderabad", purpose: "Gold Loan", callbackStatus: "Completed", followUpFlag: true },
  { id: "CALL-012", callerId: "+91 77654 32109", callerName: "Neha Kapoor", customerName: "Neha Kapoor", agentId: "USR-005", agentName: "Vikram Singh", direction: "outgoing", status: "completed", duration: "03:55", time: "11:15", date: "2026-03-18", language: "Hindi", hasRecording: true, branch: "Mumbai Andheri", place: "Mumbai", purpose: "Gold Purchase", callbackStatus: "Completed", followUpFlag: false },
  { id: "CALL-013", callerId: "+91 66543 21098", callerName: "Amit Joshi", customerName: "Amit Joshi", agentId: "USR-004", agentName: "Priya Sharma", direction: "incoming", status: "answered", duration: "02:48", time: "11:30", date: "2026-03-18", language: "English", hasRecording: true, branch: "Chennai Central", place: "Chennai", purpose: "Other", callbackStatus: "Scheduled", followUpFlag: false },
  { id: "CALL-014", callerId: "+91 55432 10987", callerName: "Pooja Bhat", customerName: "Pooja Bhat", agentId: "USR-006", agentName: "Lakshmi Rao", direction: "incoming", status: "missed", duration: "00:00", time: "11:45", date: "2026-03-18", language: "Kannada", hasRecording: false, branch: "Coimbatore Crosscut", place: "Coimbatore", purpose: "Gold Sale", callbackStatus: "Pending", followUpFlag: true },
  { id: "CALL-015", callerId: "+91 44321 09876", callerName: "Karthik S", customerName: "Karthik S", agentId: "USR-002", agentName: "Arun Patel", direction: "incoming", status: "active", duration: "00:45", time: "12:00", date: "2026-03-18", language: "Tamil", hasRecording: false, branch: "Bangalore MG Road", place: "Bangalore", purpose: "Jewellery Enquiry", callbackStatus: "Scheduled", followUpFlag: false },
];

export const callsPerHour = [
  { hour: "08:00", calls: 5 }, { hour: "09:00", calls: 18 }, { hour: "10:00", calls: 24 },
  { hour: "11:00", calls: 31 }, { hour: "12:00", calls: 22 }, { hour: "13:00", calls: 28 },
  { hour: "14:00", calls: 35 }, { hour: "15:00", calls: 29 }, { hour: "16:00", calls: 26 },
  { hour: "17:00", calls: 19 }, { hour: "18:00", calls: 15 }, { hour: "19:00", calls: 8 },
];

export const weeklyVolume = [
  { day: "Mon", calls: 185 }, { day: "Tue", calls: 210 }, { day: "Wed", calls: 198 },
  { day: "Thu", calls: 225 }, { day: "Fri", calls: 190 }, { day: "Sat", calls: 95 },
  { day: "Sun", calls: 45 },
];

export const dailyHeatmap = [
  { slot: "09 AM", mon: 4, tue: 5, wed: 4, thu: 5, fri: 4, sat: 2, sun: 1 },
  { slot: "11 AM", mon: 6, tue: 7, wed: 6, thu: 7, fri: 6, sat: 3, sun: 1 },
  { slot: "01 PM", mon: 5, tue: 6, wed: 5, thu: 6, fri: 5, sat: 2, sun: 1 },
  { slot: "03 PM", mon: 7, tue: 8, wed: 7, thu: 8, fri: 7, sat: 4, sun: 2 },
  { slot: "05 PM", mon: 5, tue: 6, wed: 6, thu: 7, fri: 5, sat: 3, sun: 1 },
];

export const qcGroups: QCGroup[] = [
  { id: "QC-001", name: "Hindi Team Review", reviewerId: "USR-007", reviewerName: "Anita Desai", agentIds: ["USR-002", "USR-004", "USR-005"], reviewTarget: 20 },
  { id: "QC-002", name: "South Languages Review", reviewerId: "USR-008", reviewerName: "Suresh Nair", agentIds: ["USR-003", "USR-006"], reviewTarget: 15 },
];

export const followUps: FollowUpRecord[] = [
  { id: "FU-001", customerName: "Mohan Das", phone: "+91 76543 21098", branch: "Hyderabad Banjara Hills", followUpAt: "2026-03-18T13:30:00", status: "Pending", agentId: "USR-004", agentName: "Priya Sharma", notes: "Customer wants revised gold loan rate." },
  { id: "FU-002", customerName: "Sunita Devi", phone: "+91 87654 32109", branch: "Bangalore MG Road", followUpAt: "2026-03-18T16:00:00", status: "Rescheduled", agentId: "USR-003", agentName: "Meena Iyer", notes: "Asked for bridal jewellery brochure." },
  { id: "FU-003", customerName: "Pooja Bhat", phone: "+91 55432 10987", branch: "Coimbatore Crosscut", followUpAt: "2026-03-18T11:15:00", status: "Pending", agentId: "USR-006", agentName: "Lakshmi Rao", notes: "Overdue call back for gold sale enquiry." },
  { id: "FU-004", customerName: "Ramesh Gupta", phone: "+91 98765 43210", branch: "Chennai Central", followUpAt: "2026-03-19T10:00:00", status: "Pending", agentId: "USR-002", agentName: "Arun Patel", notes: "Needs branch appointment confirmation." },
  { id: "FU-005", customerName: "Harish Reddy", phone: "+91 88765 43210", branch: "Hyderabad Banjara Hills", followUpAt: "2026-03-18T15:30:00", status: "Called", agentId: "USR-003", agentName: "Meena Iyer", notes: "Callback completed, sent documentation list." },
];

export const preciousMetalRates: MetalRate[] = [
  { label: "Gold 22K", value: "₹6,450/g" },
  { label: "Gold 24K", value: "₹7,040/g" },
  { label: "Silver", value: "₹85/g" },
];

export const allLanguages = ["English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Gujarati", "Punjabi", "Marathi", "Bengali"];
export const allShifts = ["Morning (9AM-5PM)", "Afternoon (1PM-9PM)", "Night (9PM-5AM)"];
export const visitPurposes = ["Gold Loan", "Gold Purchase", "Gold Sale", "Jewellery Enquiry", "Other"];
