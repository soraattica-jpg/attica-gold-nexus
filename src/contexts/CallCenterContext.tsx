import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  agents,
  branches as seedBranches,
  callRecords,
  callsPerHour,
  dailyHeatmap,
  followUps as seedFollowUps,
  preciousMetalRates,
  type Branch,
  type CallRecord,
  type FollowUpRecord,
} from "@/data/mockData";

export type ManagedCall = CallRecord;
type CallPhase = "idle" | "dialing" | "connected";

type IncomingLeadPayload = {
  phone: string;
  customerName: string;
  date: string;
  place: string;
  branch: string;
  purpose: string;
  notes: string;
};

type NewFollowUpPayload = {
  customerName: string;
  phone: string;
  branch: string;
  followUpAt: string;
  notes?: string;
  callId?: string;
};

interface CallCenterContextType {
  calls: ManagedCall[];
  branches: Branch[];
  followUps: FollowUpRecord[];
  rateTicker: string[];
  hourlyCalls: typeof callsPerHour;
  heatmap: typeof dailyHeatmap;
  dialedNumber: string;
  callPhase: CallPhase;
  callTimer: string;
  isMuted: boolean;
  isOnHold: boolean;
  incomingDialogOpen: boolean;
  incomingDraftPhone: string;
  reminderFollowUp: FollowUpRecord | null;
  followUpDueCount: number;
  setIncomingDialogOpen: (open: boolean) => void;
  appendDigit: (digit: string) => void;
  backspaceDialedNumber: () => void;
  clearDialedNumber: () => void;
  setDialedNumber: (value: string) => void;
  startCall: () => void;
  endCall: () => void;
  toggleHold: () => void;
  toggleMute: () => void;
  prefillDialedNumber: (value: string) => void;
  saveIncomingLead: (payload: IncomingLeadPayload) => void;
  skipIncomingLead: () => void;
  addFollowUp: (payload: NewFollowUpPayload) => void;
  markFollowUpStatus: (id: string, status: FollowUpRecord["status"]) => void;
  closeReminder: () => void;
  addBranch: (name: string, city: string) => void;
  updateBranch: (id: string, name: string, city: string) => void;
}

const CallCenterContext = createContext<CallCenterContextType | undefined>(undefined);

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const getCurrentDate = () => new Date().toISOString().slice(0, 10);
const getCurrentTime = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

export function CallCenterProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [calls, setCalls] = useState<ManagedCall[]>(() => [...callRecords]);
  const [branches, setBranches] = useState<Branch[]>(() => [...seedBranches]);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>(() => [...seedFollowUps]);
  const [dialedNumber, setDialedNumber] = useState("");
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [incomingDialogOpen, setIncomingDialogOpen] = useState(false);
  const [incomingDraftPhone, setIncomingDraftPhone] = useState("");
  const [reminderFollowUp, setReminderFollowUp] = useState<FollowUpRecord | null>(null);
  const dialingTimeoutRef = useRef<number | null>(null);
  const incomingShownRef = useRef(false);
  const reminderShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (callPhase !== "connected" || !callStartedAt) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [callPhase, callStartedAt]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "agent" || incomingShownRef.current) return;
    const timeout = window.setTimeout(() => {
      incomingShownRef.current = true;
      setIncomingDraftPhone("+91 90012 34567");
      setIncomingDialogOpen(true);
      toast.warning("Incoming call detected for agent desk");
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    if (!user || user.role !== "agent") return;
    const candidate = followUps
      .filter((item) => item.agentId === user.id && item.status === "Pending")
      .sort((a, b) => new Date(a.followUpAt).getTime() - new Date(b.followUpAt).getTime())[0];

    if (!candidate || reminderShownRef.current === candidate.id) return;

    const timeout = window.setTimeout(() => {
      reminderShownRef.current = candidate.id;
      setReminderFollowUp(candidate);
      toast.info(`Follow-up due: ${candidate.customerName}`);
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [followUps, user]);

  useEffect(() => {
    if (!isAuthenticated) {
      incomingShownRef.current = false;
      reminderShownRef.current = null;
      setReminderFollowUp(null);
      setIncomingDialogOpen(false);
      setDialedNumber("");
      setCallPhase("idle");
      setIsMuted(false);
      setIsOnHold(false);
      setElapsedSeconds(0);
      setCallStartedAt(null);
    }
  }, [isAuthenticated]);

  const rateTicker = useMemo(
    () => preciousMetalRates.map((rate) => `Today's ${rate.label} ${rate.value}`),
    [],
  );

  const followUpDueCount = useMemo(() => {
    const now = new Date();
    return followUps.filter((item) => item.status === "Pending" && new Date(item.followUpAt) <= now).length;
  }, [followUps]);

  const appendDigit = (digit: string) => {
    if (callPhase !== "idle") return;
    setDialedNumber((prev) => `${prev}${digit}`);
  };

  const backspaceDialedNumber = () => {
    if (callPhase !== "idle") return;
    setDialedNumber((prev) => prev.slice(0, -1));
  };

  const clearDialedNumber = () => {
    if (callPhase !== "idle") return;
    setDialedNumber("");
  };

  const prefillDialedNumber = (value: string) => {
    setDialedNumber(value);
    toast.success("Number sent to agent dialer");
  };

  const startCall = () => {
    if (!dialedNumber.trim() || callPhase !== "idle" || !user) return;
    setCallPhase("dialing");
    setIsMuted(false);
    setIsOnHold(false);
    setElapsedSeconds(0);
    toast.info(`Dialing ${dialedNumber}`);

    dialingTimeoutRef.current = window.setTimeout(() => {
      const activeCall: ManagedCall = {
        id: `CALL-${Date.now()}`,
        callerId: dialedNumber,
        callerName: "Manual Dial",
        customerName: "Manual Dial",
        agentId: user.id,
        agentName: user.name,
        direction: "outgoing",
        status: "active",
        duration: "00:00",
        time: getCurrentTime(),
        date: getCurrentDate(),
        language: "English",
        hasRecording: true,
        branch: branches[0]?.name ?? "Chennai Central",
        place: branches[0]?.city ?? "Chennai",
        purpose: "Follow-Up",
        callbackStatus: "Scheduled",
        followUpFlag: false,
      };

      setCalls((prev) => [activeCall, ...prev]);
      setCallPhase("connected");
      setCallStartedAt(Date.now());
      toast.success("Call connected");
    }, 1200);
  };

  const endCall = () => {
    if (dialingTimeoutRef.current) {
      window.clearTimeout(dialingTimeoutRef.current);
      dialingTimeoutRef.current = null;
    }

    if (callPhase === "idle") return;

    const finalDuration = formatDuration(elapsedSeconds);
    setCalls((prev) =>
      prev.map((call, index) =>
        index === 0 && call.callerId === dialedNumber && call.direction === "outgoing" && (call.status === "active" || call.status === "on-hold")
          ? { ...call, status: "completed", duration: finalDuration === "00:00" ? "00:18" : finalDuration }
          : call,
      ),
    );

    setCallPhase("idle");
    setIsMuted(false);
    setIsOnHold(false);
    setElapsedSeconds(0);
    setCallStartedAt(null);
    toast.success("Call ended and saved");
  };

  const toggleHold = () => {
    if (callPhase !== "connected") return;
    const next = !isOnHold;
    setIsOnHold(next);
    setCalls((prev) =>
      prev.map((call, index) =>
        index === 0 && call.callerId === dialedNumber && call.direction === "outgoing"
          ? { ...call, status: next ? "on-hold" : "active" }
          : call,
      ),
    );
    toast.info(next ? "Call placed on hold" : "Call resumed");
  };

  const toggleMute = () => {
    if (callPhase !== "connected") return;
    setIsMuted((prev) => {
      const next = !prev;
      toast.info(next ? "Mute enabled" : "Mute disabled");
      return next;
    });
  };

  const saveIncomingLead = (payload: IncomingLeadPayload) => {
    if (!user) return;

    const newCall: ManagedCall = {
      id: `CALL-${Date.now()}`,
      callerId: payload.phone,
      callerName: payload.customerName || "Unknown Customer",
      customerName: payload.customerName || "Unknown Customer",
      agentId: user.id,
      agentName: user.name,
      direction: "incoming",
      status: "answered",
      duration: "00:00",
      time: getCurrentTime(),
      date: payload.date,
      language: "English",
      hasRecording: false,
      branch: payload.branch,
      place: payload.place,
      purpose: payload.purpose,
      callbackStatus: "Scheduled",
      followUpFlag: false,
    };

    setCalls((prev) => [newCall, ...prev]);
    setIncomingDialogOpen(false);
    setIncomingDraftPhone("");
    toast.success("Incoming customer form saved to call log");
  };

  const skipIncomingLead = () => {
    setIncomingDialogOpen(false);
    setIncomingDraftPhone("");
    toast.info("Incoming call form skipped");
  };

  const addFollowUp = ({ customerName, phone, branch, followUpAt, notes, callId }: NewFollowUpPayload) => {
    if (!user) return;
    const newItem: FollowUpRecord = {
      id: `FU-${Date.now()}`,
      customerName,
      phone,
      branch,
      followUpAt,
      status: "Pending",
      agentId: user.id,
      agentName: user.name,
      notes,
    };

    setFollowUps((prev) => [newItem, ...prev]);
    if (callId) {
      setCalls((prev) => prev.map((call) => (call.id === callId ? { ...call, followUpFlag: true } : call)));
    }
    toast.success("Follow-up scheduled");
  };

  const markFollowUpStatus = (id: string, status: FollowUpRecord["status"]) => {
    setFollowUps((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    toast.success(`Follow-up marked as ${status}`);
  };

  const closeReminder = () => setReminderFollowUp(null);

  const addBranch = (name: string, city: string) => {
    const branch: Branch = { id: `BR-${Date.now()}`, name, city };
    setBranches((prev) => [...prev, branch]);
    toast.success("Branch added");
  };

  const updateBranch = (id: string, name: string, city: string) => {
    setBranches((prev) => prev.map((branch) => (branch.id === id ? { ...branch, name, city } : branch)));
    toast.success("Branch updated");
  };

  return (
    <CallCenterContext.Provider
      value={{
        calls,
        branches,
        followUps,
        rateTicker,
        hourlyCalls: callsPerHour,
        heatmap: dailyHeatmap,
        dialedNumber,
        callPhase,
        callTimer: formatDuration(elapsedSeconds),
        isMuted,
        isOnHold,
        incomingDialogOpen,
        incomingDraftPhone,
        reminderFollowUp,
        followUpDueCount,
        setIncomingDialogOpen,
        appendDigit,
        backspaceDialedNumber,
        clearDialedNumber,
        setDialedNumber,
        startCall,
        endCall,
        toggleHold,
        toggleMute,
        prefillDialedNumber,
        saveIncomingLead,
        skipIncomingLead,
        addFollowUp,
        markFollowUpStatus,
        closeReminder,
        addBranch,
        updateBranch,
      }}
    >
      {children}
    </CallCenterContext.Provider>
  );
}

export function useCallCenter() {
  const context = useContext(CallCenterContext);
  if (!context) throw new Error("useCallCenter must be used within CallCenterProvider");
  return context;
}

export const topAgentTalkTime = (agentId: string) => {
  const fallback = agents.find((agent) => agent.id === agentId);
  return fallback?.activeDuration ?? "00:00";
};
