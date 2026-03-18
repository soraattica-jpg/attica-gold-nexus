export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  agentId: string;
  agentName: string;
  direction: "incoming" | "outgoing";
  status: "answered" | "missed" | "transferred" | "active" | "on-hold" | "completed";
  duration: string;
  time: string;
  date: string;
  language: string;
  hasRecording: boolean;
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

export const callRecords: CallRecord[] = [
  { id: "CALL-001", callerId: "+91 98765 43210", callerName: "Ramesh Gupta", agentId: "USR-002", agentName: "Arun Patel", direction: "incoming", status: "answered", duration: "04:32", time: "09:15", date: "2026-03-18", language: "Hindi", hasRecording: true },
  { id: "CALL-002", callerId: "+91 87654 32109", callerName: "Sunita Devi", agentId: "USR-003", agentName: "Meena Iyer", direction: "incoming", status: "answered", duration: "03:18", time: "09:22", date: "2026-03-18", language: "Tamil", hasRecording: true },
  { id: "CALL-003", callerId: "+91 76543 21098", callerName: "Mohan Das", agentId: "USR-004", agentName: "Priya Sharma", direction: "incoming", status: "missed", duration: "00:00", time: "09:28", date: "2026-03-18", language: "Hindi", hasRecording: false },
  { id: "CALL-004", callerId: "+91 65432 10987", callerName: "Kavitha R", agentId: "USR-006", agentName: "Lakshmi Rao", direction: "incoming", status: "answered", duration: "06:45", time: "09:35", date: "2026-03-18", language: "Telugu", hasRecording: true },
  { id: "CALL-005", callerId: "+91 54321 09876", callerName: "Ajay Mehta", agentId: "USR-002", agentName: "Arun Patel", direction: "outgoing", status: "completed", duration: "02:15", time: "09:45", date: "2026-03-18", language: "English", hasRecording: true },
  { id: "CALL-006", callerId: "+91 43210 98765", callerName: "Deepa Nair", agentId: "USR-003", agentName: "Meena Iyer", direction: "incoming", status: "active", duration: "01:22", time: "10:05", date: "2026-03-18", language: "Malayalam", hasRecording: false },
  { id: "CALL-007", callerId: "+91 32109 87654", callerName: "Sanjay Verma", agentId: "USR-005", agentName: "Vikram Singh", direction: "incoming", status: "on-hold", duration: "03:10", time: "10:12", date: "2026-03-18", language: "Punjabi", hasRecording: false },
  { id: "CALL-008", callerId: "+91 21098 76543", callerName: "Fatima Sheikh", agentId: "USR-004", agentName: "Priya Sharma", direction: "incoming", status: "missed", duration: "00:00", time: "10:18", date: "2026-03-18", language: "Hindi", hasRecording: false },
  { id: "CALL-009", callerId: "+91 10987 65432", callerName: "Ravi Shankar", agentId: "USR-006", agentName: "Lakshmi Rao", direction: "outgoing", status: "completed", duration: "05:30", time: "10:30", date: "2026-03-18", language: "Kannada", hasRecording: true },
  { id: "CALL-010", callerId: "+91 99876 54321", callerName: "Geeta Patel", agentId: "USR-002", agentName: "Arun Patel", direction: "incoming", status: "transferred", duration: "01:45", time: "10:42", date: "2026-03-18", language: "Gujarati", hasRecording: true },
  { id: "CALL-011", callerId: "+91 88765 43210", callerName: "Harish Reddy", agentId: "USR-003", agentName: "Meena Iyer", direction: "incoming", status: "answered", duration: "07:20", time: "11:00", date: "2026-03-18", language: "Telugu", hasRecording: true },
  { id: "CALL-012", callerId: "+91 77654 32109", callerName: "Neha Kapoor", agentId: "USR-005", agentName: "Vikram Singh", direction: "outgoing", status: "completed", duration: "03:55", time: "11:15", date: "2026-03-18", language: "Hindi", hasRecording: true },
  { id: "CALL-013", callerId: "+91 66543 21098", callerName: "Amit Joshi", agentId: "USR-004", agentName: "Priya Sharma", direction: "incoming", status: "answered", duration: "02:48", time: "11:30", date: "2026-03-18", language: "English", hasRecording: true },
  { id: "CALL-014", callerId: "+91 55432 10987", callerName: "Pooja Bhat", agentId: "USR-006", agentName: "Lakshmi Rao", direction: "incoming", status: "missed", duration: "00:00", time: "11:45", date: "2026-03-18", language: "Kannada", hasRecording: false },
  { id: "CALL-015", callerId: "+91 44321 09876", callerName: "Karthik S", agentId: "USR-002", agentName: "Arun Patel", direction: "incoming", status: "active", duration: "00:45", time: "12:00", date: "2026-03-18", language: "Tamil", hasRecording: false },
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

export const qcGroups: QCGroup[] = [
  { id: "QC-001", name: "Hindi Team Review", reviewerId: "USR-007", reviewerName: "Anita Desai", agentIds: ["USR-002", "USR-004", "USR-005"], reviewTarget: 20 },
  { id: "QC-002", name: "South Languages Review", reviewerId: "USR-008", reviewerName: "Suresh Nair", agentIds: ["USR-003", "USR-006"], reviewTarget: 15 },
];

export const allLanguages = ["English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Gujarati", "Punjabi", "Marathi", "Bengali"];
export const allShifts = ["Morning (9AM-5PM)", "Afternoon (1PM-9PM)", "Night (9PM-5AM)"];
