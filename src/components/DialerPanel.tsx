import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Coffee, Delete, Mic, MicOff, Pause, Phone, PhoneOff, Users } from "lucide-react";
import { IsolatedCustomerIntakeForm } from "@/components/CustomerIntakeForm";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter, type ManagedCall } from "@/contexts/CallCenterContext";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { canReceiveTransferredCalls, getAgentStatusBadgeClass, getAgentStatusLabel } from "@/lib/agentStatus";
import { api, type AutoDialLeadRecord, type LiveAgentRecord } from "@/lib/api";
import { getAutoDialLeadSourceLabel, getCallDisplayCustomerName, getCallResolvedCustomerName, getMeaningfulCustomerName } from "@/lib/callDisplay";
import { hidePhoneDisplay } from "@/lib/phone";
import { formatCallDurationFromSeconds, getLongerCallDuration } from "@/lib/callDuration";

const MAX_DIALED_INPUT_LENGTH = 20;

const normalizeText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const normalizePhoneValue = (value: unknown) => normalizeText(value).replace(/[^0-9]/g, "").slice(-10);
const formatMetaLeadAnswer = (value: unknown) => normalizeText(value).replace(/_/g, " ");
const formatCallTime = (value?: string) => {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(parsed);
};

const isDialerCallRecord = (value: unknown): value is ManagedCall => (
  Boolean(value && typeof value === "object")
);

const getCallTimestamp = (call: { createdAt?: string; date?: string; time?: string }) => {
  const createdAt = new Date(call.createdAt || "").getTime();
  if (Number.isFinite(createdAt)) return createdAt;
  const combined = new Date(`${call.date || ""}T${call.time || ""}`).getTime();
  return Number.isFinite(combined) ? combined : 0;
};

const getCallPriority = (status: string) => {
  if (status === "active" || status === "on-hold") return 3;
  if (status === "completed" || status === "answered" || status === "transferred") return 2;
  if (status === "missed" || status === "failed") return 1;
  return 0;
};

const normalizeCallLookupId = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const separatorIndex = normalized.indexOf("|");
  if (separatorIndex <= 0) return normalized;
  return normalized.slice(0, separatorIndex).trim() || normalized;
};

const sortTransferAgents = (agents: LiveAgentRecord[]) => (
  [...agents].sort((left, right) => {
    const leftLabel = `${normalizeText(left.agentName) || normalizeText(left.agentId)}|${normalizeText(left.extension)}`;
    const rightLabel = `${normalizeText(right.agentName) || normalizeText(right.agentId)}|${normalizeText(right.extension)}`;
    return leftLabel.localeCompare(rightLabel);
  })
);

const getTransferSourceMode = ({
  agentStatus,
  matchedCall,
  currentAutoDialLead,
  queuedAutoDialLead,
}: {
  agentStatus?: string;
  matchedCall?: ManagedCall | null;
  currentAutoDialLead?: { sourceFile?: string | null } | null;
  queuedAutoDialLead?: { sourceFile?: string | null } | null;
}) => {
  const normalizedAgentStatus = normalizeText(agentStatus).toLowerCase();
  const sourceText = [
    matchedCall?.leadSource,
    currentAutoDialLead?.sourceFile,
    queuedAutoDialLead?.sourceFile,
  ].map((value) => normalizeText(value).toLowerCase()).join(" ");

  if (normalizedAgentStatus === "outbound-auto") {
    return "outbound-auto";
  }
  if (normalizedAgentStatus === "follow-up") {
    return "follow-up";
  }
  if (
    Boolean(currentAutoDialLead)
    || Boolean(queuedAutoDialLead)
    || normalizeText(matchedCall?.direction).toLowerCase() === "outgoing"
  ) {
    return "outbound-auto";
  }
  if (/follow|missed callback|auto follow|status follow/.test(sourceText)) {
    return "follow-up";
  }
  return "active";
};

const getLiveSelfTransferMode = (agent?: LiveAgentRecord) => {
  const workMode = normalizeText(agent?.workMode).toLowerCase();
  if (workMode === "outbound-auto" || workMode === "follow-up") return workMode;
  const status = normalizeText(agent?.status).toLowerCase();
  if (status === "outbound-auto" || status === "follow-up") return status;
  return "";
};

type DialerOverlayFormProps = ComponentProps<typeof IsolatedCustomerIntakeForm>;

type DialerFormOverlayProps = {
  showForm: boolean;
  callPhase: "idle" | "dialing" | "connected";
  showPostCall: boolean;
  matchedCallStatus: string;
  formProps: DialerOverlayFormProps;
};

const DialerFormOverlay = memo(function DialerFormOverlay({
  showForm,
  callPhase,
  showPostCall,
  matchedCallStatus,
  formProps,
}: DialerFormOverlayProps) {
  if (!showForm) return null;
  const formInstanceKey = `dialer-form:${formProps.callId || formProps.phone || "active"}`;

  return (
    <div
      className="agent-form-overlay fixed inset-0 z-40 flex h-[100dvh] items-center justify-center overflow-hidden bg-black/40 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="agent-form-host flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <SectionErrorBoundary
            resetKey={formInstanceKey}
            title="Call form failed to render"
            description="Dial controls are still available. Reload the page if the intake form does not recover."
          >
            <IsolatedCustomerIntakeForm key={formInstanceKey} {...formProps} />
          </SectionErrorBoundary>
        </div>
      </div>
    </div>
  );
}, (previous, next) => (
  previous.showForm === next.showForm
  && previous.callPhase === next.callPhase
  && previous.showPostCall === next.showPostCall
  && previous.matchedCallStatus === next.matchedCallStatus
  && previous.formProps === next.formProps
));

export default function DialerPanel({ compact = false }: { compact?: boolean } = {}) {
  const { user } = useAuth();
  const {
    dialedNumber,
    appendDigit,
    clearDialedNumber,
    setDialedNumber,
    startCall,
    endCall,
    callPhase,
    callTimer,
    toggleMute,
    toggleHold,
    isMuted,
    isOnHold,
    calls,
    followUps,
    callWrapUpPending,
    completeCallWrapUp,
    currentAutoDialLead,
    queuedAutoDialLead,
    addFollowUp,
    closePendingFollowUpsForPhone,
    syncCallRecord,
    transferCurrentCall,
    startConferenceCall,
    agentStatus,
    agentStatusTimer,
    setAgentWorkStatus,
    getFinalizedCallSnapshot,
    getLiveCallSnapshot,
  } = useCallCenter();

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferExt, setTransferExt] = useState("");
  const [availableTransferAgents, setAvailableTransferAgents] = useState<LiveAgentRecord[]>([]);
  const [latchedOutgoingPhone, setLatchedOutgoingPhone] = useState("");
  const [latchedOutgoingCallId, setLatchedOutgoingCallId] = useState("");
  const [connectedIntakeFormKey, setConnectedIntakeFormKey] = useState("");
  const [closedFormKey, setClosedFormKey] = useState("");
  const safeDialedNumber = normalizeText(dialedNumber);
  const safeCalls = useMemo(
    () => (Array.isArray(calls) ? calls.filter(isDialerCallRecord) : []),
    [calls],
  );
  const safeCallsRef = useRef<ManagedCall[]>(safeCalls);
  const safeAgentStatus = normalizeText(agentStatus) || "active";
  const safeAgentStatusTimer = normalizeText(agentStatusTimer);
  const safeCallTimer = normalizeText(callTimer) || "00:00";
  const statusAccessByMode = {
    "on-break": true,
    "lunch-break": true,
    "restroom-break": true,
  } satisfies Partial<Record<Parameters<typeof setAgentWorkStatus>[0], boolean>>;
  const normalizedDialedNumber = safeDialedNumber.replace(/[^0-9]/g, "").slice(-10);
  const shouldMaskPhone = user?.role === "agent";
  const effectiveOutgoingPhone = normalizedDialedNumber || latchedOutgoingPhone;

  const hasOutgoingCallContext = useMemo(() => {
    if (!effectiveOutgoingPhone) return false;
    return safeCalls.some((call) => {
      const candidate = normalizePhoneValue(call.callerId);
      return candidate === effectiveOutgoingPhone && call.direction === "outgoing";
    });
  }, [effectiveOutgoingPhone, safeCalls]);

  useEffect(() => {
    safeCallsRef.current = safeCalls;
  }, [safeCalls]);

  useEffect(() => {
    if (normalizedDialedNumber) {
      setLatchedOutgoingPhone(normalizedDialedNumber);
    }
  }, [normalizedDialedNumber]);

  useEffect(() => {
    if (callPhase === "idle" && !callWrapUpPending && !connectedIntakeFormKey) {
      setLatchedOutgoingPhone("");
      setLatchedOutgoingCallId("");
      setClosedFormKey("");
    }
  }, [callPhase, callWrapUpPending, connectedIntakeFormKey]);

  const handleCloseForm = useCallback(() => {
    setShowTransfer(false);
    setTransferExt("");
    setAvailableTransferAgents([]);
    setLatchedOutgoingPhone("");
    setLatchedOutgoingCallId("");
    setConnectedIntakeFormKey("");
    clearDialedNumber();
  }, [clearDialedNumber]);

  const matchedCall = useMemo(() => {
    if (latchedOutgoingCallId) {
      const callById = safeCalls.find((call) => call.id === latchedOutgoingCallId && call.direction === "outgoing");
      if (callById) return callById;
    }

    if (!effectiveOutgoingPhone) return undefined;

    return safeCalls
      .filter((call) => {
        const candidate = normalizePhoneValue(call.callerId);
        return candidate === effectiveOutgoingPhone && call.direction === "outgoing";
      })
      .sort((left, right) => {
        const priorityDelta = getCallPriority(right.status) - getCallPriority(left.status);
        if (priorityDelta !== 0) return priorityDelta;
        return getCallTimestamp(right) - getCallTimestamp(left);
      })[0];
  }, [effectiveOutgoingPhone, latchedOutgoingCallId, safeCalls]);

  useEffect(() => {
    if (matchedCall?.id) {
      setLatchedOutgoingCallId(matchedCall.id);
    }
  }, [matchedCall?.id]);

  const matchedCallId = matchedCall?.id || latchedOutgoingCallId;
  const latestAgentCall = useMemo(() => safeCalls
    .filter((call) => !user?.id || call.agentId === user.id)
    .sort((left, right) => getCallTimestamp(right) - getCallTimestamp(left))[0], [safeCalls, user?.id]);
  const timingCall = matchedCall || (callPhase === "idle" ? latestAgentCall : undefined);
  const isBreakStatus = ["on-break", "lunch-break", "restroom-break"].includes(safeAgentStatus);
  const agentDurationLabel = isBreakStatus
    ? "Break Time"
    : callPhase === "idle"
      ? "Idle Time"
      : "Active Time";
  const retainedTalkTime = timingCall
    ? getLongerCallDuration(
      safeCallTimer,
      timingCall.duration,
      Number(timingCall.talkDurationSeconds || 0) > 0
        ? formatCallDurationFromSeconds(Number(timingCall.talkDurationSeconds))
        : "",
    )
    : safeCallTimer;
  const matchedNamedCall = useMemo(() => {
    if (!effectiveOutgoingPhone) return undefined;

    return safeCalls
      .filter((call) => normalizePhoneValue(call.callerId) === effectiveOutgoingPhone)
      .sort((left, right) => getCallTimestamp(right) - getCallTimestamp(left))
      .find((call) => Boolean(getCallResolvedCustomerName(call)));
  }, [effectiveOutgoingPhone, safeCalls]);
  const resolvedOutgoingCustomerName = useMemo(() => (
    getMeaningfulCustomerName(
      currentAutoDialLead?.customerName,
      queuedAutoDialLead?.customerName,
      getCallResolvedCustomerName(matchedCall ?? { displayCustomerName: "", customerName: "", callerName: "" }),
      getCallResolvedCustomerName(matchedNamedCall ?? { displayCustomerName: "", customerName: "", callerName: "" }),
    )
  ), [currentAutoDialLead?.customerName, matchedCall, matchedNamedCall, queuedAutoDialLead?.customerName]);
  const autoDialSourceLabel = useMemo(() => {
    if (currentAutoDialLead) return getAutoDialLeadSourceLabel(currentAutoDialLead.sourceFile);
    if (queuedAutoDialLead) return getAutoDialLeadSourceLabel(queuedAutoDialLead.sourceFile);
    const matchedLeadSource = normalizeText(matchedCall?.leadSource);
    if (matchedLeadSource) return matchedLeadSource;
    return "";
  }, [currentAutoDialLead, matchedCall?.leadSource, queuedAutoDialLead]);
  const autoDialLeadSummary = useMemo(() => {
    if (currentAutoDialLead) {
      return [
        resolvedOutgoingCustomerName || "Unknown Customer",
        normalizeText(currentAutoDialLead.area),
      ].filter(Boolean).join(" · ");
    }
    if (queuedAutoDialLead) {
      return [
        resolvedOutgoingCustomerName || "Unknown Customer",
        normalizeText(queuedAutoDialLead.area),
      ].filter(Boolean).join(" · ");
    }
    if (matchedCall) {
      return [
        resolvedOutgoingCustomerName || "Unknown Customer",
        normalizeText(matchedCall.place),
      ].filter(Boolean).join(" · ");
    }
    return "";
  }, [currentAutoDialLead, matchedCall, queuedAutoDialLead, resolvedOutgoingCustomerName]);
  const activeAutoDialLeadDetails = currentAutoDialLead || queuedAutoDialLead || null;
  const metaLeadDetails = useMemo(() => {
    const lead = activeAutoDialLeadDetails as AutoDialLeadRecord | null;
    if (!lead) return [];
    const isMetaLead = normalizeText(lead.sourceFile).toLowerCase() === "meta lead"
      || Boolean(lead.metaFullName || lead.metaPhoneNumber || lead.metaServiceLookingFor || lead.metaGoldAmount || lead.metaPlannedVisit);
    if (!isMetaLead) return [];
    return [
      ["State", lead.metaState || lead.sourceState],
      ["City", lead.metaCity || lead.area],
      ["Full Name", lead.metaFullName || lead.customerName],
      ["Phone Number", lead.metaPhoneNumber || lead.mobileNumber],
      ["What service are you looking for?", lead.metaServiceLookingFor],
      ["Approximately how much gold do you have?", lead.metaGoldAmount || lead.goldWeight],
      ["When are you planning to visit an Attica Gold Company branch?", lead.metaPlannedVisit],
      ["Date", lead.metaDate],
    ].map(([label, value]) => [label, formatMetaLeadAnswer(value)] as const);
  }, [activeAutoDialLeadDetails]);

  const activeFormKey = matchedCallId || effectiveOutgoingPhone;
  const showPostCall = callPhase === "idle" && (callWrapUpPending || Boolean(connectedIntakeFormKey)) && Boolean(effectiveOutgoingPhone || matchedCallId);
  useEffect(() => {
    if (callPhase === "connected" && activeFormKey) {
      setConnectedIntakeFormKey(activeFormKey);
    }
  }, [activeFormKey, callPhase]);
  const transferSourceStatus = useMemo(() => getTransferSourceMode({
    agentStatus: safeAgentStatus,
    matchedCall,
    currentAutoDialLead,
    queuedAutoDialLead,
  }), [
    currentAutoDialLead,
    matchedCall,
    queuedAutoDialLead,
    safeAgentStatus,
  ]);

  useEffect(() => {
    if (!showTransfer || callPhase !== "connected") {
      setAvailableTransferAgents([]);
      setTransferExt("");
      return;
    }

    let cancelled = false;
    const sourceLanguage = matchedCall?.language || currentAutoDialLead?.preferredLanguage || queuedAutoDialLead?.preferredLanguage || "";

    const loadTransferAgents = async () => {
      const liveAgents = await api.getLiveAgents().catch(() => []);
      if (cancelled || !Array.isArray(liveAgents)) return;
      const liveSelfMode = getLiveSelfTransferMode(
        liveAgents.find((agent) => agent.agentId === user?.id),
      );
      const effectiveTransferSourceStatus = liveSelfMode || transferSourceStatus;

      const nextAgents = sortTransferAgents(liveAgents.filter((agent) => (
        canReceiveTransferredCalls({
          status: agent.status,
          workMode: agent.workMode,
          sourceStatus: effectiveTransferSourceStatus,
          activeCalls: agent.activeCalls,
          sipStatus: agent.sipStatus,
          isLoggedIn: agent.isLoggedIn,
          queuePaused: agent.queuePaused,
          onBreak: agent.onBreak,
          languages: agent.languages,
          sourceLanguage,
        })
        && normalizeText(agent.extension)
        && agent.agentId !== user?.id
      )));

      setAvailableTransferAgents(nextAgents);
      setTransferExt((current) => (
        current && nextAgents.some((agent) => agent.extension === current)
          ? current
          : (nextAgents[0]?.extension || "")
      ));
    };

    void loadTransferAgents();
    const interval = window.setInterval(() => {
      void loadTransferAgents();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [callPhase, currentAutoDialLead?.preferredLanguage, matchedCall?.language, queuedAutoDialLead?.preferredLanguage, showTransfer, transferSourceStatus, user?.id]);

  const stableMatchedCallSnapshot = useMemo(() => {
    if (!matchedCall?.id) return null;

    return {
      id: matchedCall.id,
      intakeToken: matchedCall.intakeToken,
      callerId: matchedCall.callerId,
      callerName: matchedCall.callerName,
      customerName: matchedCall.customerName,
      displayCustomerName: matchedCall.displayCustomerName,
      agentId: matchedCall.agentId,
      agentName: matchedCall.agentName,
      direction: matchedCall.direction,
      status: matchedCall.status,
      duration: matchedCall.duration,
      time: matchedCall.time,
      date: matchedCall.date,
      language: matchedCall.language,
      branch: matchedCall.branch,
      place: matchedCall.place,
      purpose: matchedCall.purpose,
      callbackStatus: matchedCall.callbackStatus,
      followUpFlag: matchedCall.followUpFlag,
      leadSource: matchedCall.leadSource,
      mob2: matchedCall.mob2,
      district: matchedCall.district,
      businessType: matchedCall.businessType,
      metalType: matchedCall.metalType,
      grams: matchedCall.grams,
      releasingAmount: matchedCall.releasingAmount,
      bankName: matchedCall.bankName,
      onlinePrice: matchedCall.onlinePrice,
      pricePerGram: matchedCall.pricePerGram,
      advertisement: matchedCall.advertisement,
      lead: matchedCall.lead,
      formStatus: matchedCall.formStatus,
      statusFollowUpAt: matchedCall.statusFollowUpAt,
      quickNote: matchedCall.quickNote,
      notes: matchedCall.notes,
      smsSent: matchedCall.smsSent,
      createdAt: matchedCall.createdAt,
      ringStartedAt: matchedCall.ringStartedAt,
      answeredAt: matchedCall.answeredAt,
      endedAt: matchedCall.endedAt,
      talkDurationSeconds: matchedCall.talkDurationSeconds,
      hasRecording: matchedCall.hasRecording,
    };
  }, [
    matchedCall?.id,
    matchedCall?.intakeToken,
    matchedCall?.callerId,
    matchedCall?.callerName,
    matchedCall?.customerName,
    matchedCall?.displayCustomerName,
    matchedCall?.agentId,
    matchedCall?.agentName,
    matchedCall?.direction,
    matchedCall?.status,
    matchedCall?.duration,
    matchedCall?.time,
    matchedCall?.date,
    matchedCall?.language,
    matchedCall?.branch,
    matchedCall?.place,
    matchedCall?.purpose,
    matchedCall?.callbackStatus,
    matchedCall?.followUpFlag,
    matchedCall?.leadSource,
    matchedCall?.mob2,
    matchedCall?.district,
    matchedCall?.businessType,
    matchedCall?.metalType,
    matchedCall?.grams,
    matchedCall?.releasingAmount,
    matchedCall?.bankName,
    matchedCall?.onlinePrice,
    matchedCall?.pricePerGram,
    matchedCall?.advertisement,
    matchedCall?.lead,
    matchedCall?.formStatus,
    matchedCall?.statusFollowUpAt,
    matchedCall?.quickNote,
    matchedCall?.notes,
    matchedCall?.smsSent,
    matchedCall?.createdAt,
    matchedCall?.ringStartedAt,
    matchedCall?.answeredAt,
    matchedCall?.endedAt,
    matchedCall?.talkDurationSeconds,
    matchedCall?.hasRecording,
  ]);
  const getCurrentCall = useCallback((lookup: { callId?: string; intakeToken?: string }) => {
    const normalizedCallId = normalizeCallLookupId(lookup.callId);
    const normalizedIntakeToken = normalizeText(lookup.intakeToken);
    return safeCallsRef.current.find((call) => (
      (normalizedCallId && call.id === normalizedCallId)
      || (normalizedIntakeToken && call.intakeToken === normalizedIntakeToken)
    )) || null;
  }, []);

  const handleFormSaved = useCallback(() => {
    setClosedFormKey(activeFormKey);
    completeCallWrapUp();
    handleCloseForm();
  }, [activeFormKey, completeCallWrapUp, handleCloseForm]);

  const handleWrapUpClosed = useCallback(() => {
    setClosedFormKey(activeFormKey);
    completeCallWrapUp();
    handleCloseForm();
  }, [activeFormKey, completeCallWrapUp, handleCloseForm]);
  const dialerFormProps = useMemo<DialerOverlayFormProps>(() => ({
    phone: effectiveOutgoingPhone,
    customerName: resolvedOutgoingCustomerName,
    direction: "outgoing",
    callId: matchedCallId,
    inline: true,
    onSave: handleFormSaved,
    onClose: showPostCall ? handleWrapUpClosed : undefined,
    showCloseButton: false,
    showDraftCloseButton: showPostCall,
    draftCloseLabel: "Close as Draft",
    addFollowUp,
    closePendingFollowUpsForPhone,
    followUps,
    liveCallSnapshot: stableMatchedCallSnapshot,
    getCurrentCall,
    syncCallRecord,
    callPhase,
    isOnHold,
    toggleHold,
    agentStatus: safeAgentStatus,
    transferCurrentCall,
    startConferenceCall,
    getFinalizedCallSnapshot,
    getLiveCallSnapshot,
  }), [
    addFollowUp,
    callPhase,
    closePendingFollowUpsForPhone,
    effectiveOutgoingPhone,
    followUps,
    getCurrentCall,
    getFinalizedCallSnapshot,
    getLiveCallSnapshot,
    isOnHold,
    handleFormSaved,
    handleWrapUpClosed,
    matchedCallId,
    resolvedOutgoingCustomerName,
    safeAgentStatus,
    showPostCall,
    stableMatchedCallSnapshot,
    syncCallRecord,
    startConferenceCall,
    transferCurrentCall,
    toggleHold,
  ]);

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  const showForm = (
    ((callPhase === "connected" && Boolean(effectiveOutgoingPhone || hasOutgoingCallContext || matchedCallId)) || showPostCall)
    && (!activeFormKey || closedFormKey !== activeFormKey)
  );
  const statusOptions = [
    { key: "on-break", label: "On Break", compactLabel: "Break", icon: <Coffee className="h-4 w-4" /> },
    { key: "lunch-break", label: "Lunch Break", compactLabel: "Lunch", icon: <Coffee className="h-4 w-4" /> },
    { key: "restroom-break", label: "Rest Break", compactLabel: "Rest", icon: <Coffee className="h-4 w-4" /> },
  ];

  return (
    <div className={compact ? "min-w-0 space-y-2 overflow-hidden" : "space-y-4"}>
      <div className={compact ? "surface-panel min-w-0 overflow-hidden p-3" : "surface-panel p-5"}>
        <div className={compact ? "mb-2 flex flex-wrap items-center justify-between gap-2" : "mb-3 flex items-center justify-between"}>
          <h2 className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>Dialer</h2>
          <div className={compact ? "flex items-center gap-1.5 text-xs text-muted-foreground" : "flex items-center gap-2 text-sm text-muted-foreground"}>
            <span>Talk Time</span>
            <span className={compact ? "font-mono text-base font-semibold text-foreground" : "font-mono text-lg font-semibold text-foreground"}>{retainedTalkTime}</span>
          </div>
        </div>

        <div className={compact ? "mb-2 rounded-xl border border-border bg-muted/20 p-2" : "mb-3 rounded-xl border border-border bg-muted/20 p-3"}>
          <div className={compact ? "mb-2 flex flex-wrap items-center justify-between gap-2" : "mb-2 flex items-center justify-between gap-3"}>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Agent Status</p>
              {!compact ? (
                <p className="text-sm font-semibold text-foreground">Work mode is assigned by admin. Break states block routing immediately.</p>
              ) : null}
            </div>
            <span className={`${getAgentStatusBadgeClass(safeAgentStatus)} max-w-full shrink-0 whitespace-nowrap`}>
              {getAgentStatusLabel(safeAgentStatus)}
            </span>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4" aria-label="Agent and call timing">
            {[
              [agentDurationLabel, safeAgentStatusTimer || "00:00"],
              ["Call Start", formatCallTime(timingCall?.ringStartedAt || timingCall?.createdAt)],
              ["Connected", formatCallTime(timingCall?.answeredAt)],
              ["Call End", formatCallTime(timingCall?.endedAt)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 bg-card px-2 py-1.5">
                <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="truncate font-mono text-[11px] font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className={compact ? "flex min-w-0 flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
            {statusOptions.map((statusOption) => {
              const statusKey = statusOption.key as Parameters<typeof setAgentWorkStatus>[0];
              const isDisabled = !statusAccessByMode[statusKey];
              return (
                <button
                  key={statusOption.key}
                  onClick={() => setAgentWorkStatus(statusKey)}
                  disabled={isDisabled}
                  title={isDisabled ? `${statusOption.label} access is not enabled for your user` : undefined}
                  className={`${
                    safeAgentStatus === statusOption.key
                      ? compact ? "action-gold px-2 py-1.5 text-xs" : "action-gold px-4 py-2"
                      : compact ? "action-outline px-2 py-1.5 text-xs" : "action-outline px-4 py-2"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {statusOption.icon}
                  {compact ? statusOption.compactLabel : statusOption.label}
                </button>
              );
            })}
          </div>
        </div>

        <input
          type={shouldMaskPhone ? "password" : "tel"}
          value={safeDialedNumber}
          onChange={(event) => {
            if (callPhase !== "idle") return;
            setDialedNumber(event.currentTarget.value.replace(/[^0-9*#]/g, "").slice(0, MAX_DIALED_INPUT_LENGTH));
          }}
          placeholder="Type or tap digits"
          aria-label="Phone number"
          inputMode="tel"
          maxLength={MAX_DIALED_INPUT_LENGTH}
          readOnly={callPhase !== "idle"}
          className={compact ? "control-field mb-2 text-center font-mono text-lg tracking-[0.24em]" : "control-field mb-3 text-center text-xl font-mono tracking-[0.3em]"}
          autoComplete="off"
        />

        {autoDialSourceLabel && (callPhase !== "idle" || showPostCall || queuedAutoDialLead) && (
          <div className={compact ? "mb-2 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2" : "mb-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Auto Dial Source</p>
                <p className="truncate text-sm font-semibold text-foreground">{autoDialSourceLabel}</p>
                {autoDialLeadSummary ? (
                  <p className="truncate text-xs text-muted-foreground">{autoDialLeadSummary}</p>
                ) : null}
              </div>
              <span className={callPhase === "connected" ? "success-badge" : callPhase === "dialing" ? "warning-badge" : queuedAutoDialLead ? "done-badge" : "done-badge"}>
                {callPhase === "connected" ? "Connected" : callPhase === "dialing" ? "Connecting" : queuedAutoDialLead ? "Loaded" : "Completed"}
              </span>
            </div>
            {metaLeadDetails.length > 0 ? (
              <div className={compact ? "mt-2 grid grid-cols-1 gap-1.5 text-xs" : "mt-3 grid grid-cols-2 gap-2 text-xs"}>
                {metaLeadDetails.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="whitespace-normal break-words text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="whitespace-normal break-words font-semibold text-foreground">{value || "—"}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {callPhase === "idle" && (
          <div className={compact ? "mb-2 grid grid-cols-3 gap-1.5" : "mb-3 grid grid-cols-3 gap-2"}>
            {digits.map((digit) => (
              <button
                key={digit}
                onClick={() => appendDigit(digit)}
                className={compact ? "rounded-xl border border-border bg-muted/40 py-2 text-base font-semibold transition hover:bg-muted" : "rounded-xl border border-border bg-muted/40 py-3 text-lg font-semibold transition hover:bg-muted"}
              >
                {digit}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {callPhase === "idle" ? (
            <>
              <button onClick={startCall} disabled={!safeDialedNumber} className={compact ? "action-gold flex-1 justify-center py-2" : "action-gold flex-1 justify-center py-3"}>
                <Phone className="h-4 w-4" />
                Call
              </button>
              <button onClick={clearDialedNumber} className="action-outline">
                <Delete className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => endCall()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </button>
              <button
                onClick={toggleHold}
                className={
                  isOnHold
                    ? "flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/20"
                    : "flex items-center justify-center gap-2 rounded-xl border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-600/20"
                }
              >
                <Pause className="h-4 w-4" />
                {isOnHold ? "Resume" : "Hold"}
              </button>
              <button onClick={toggleMute} className={isMuted ? "warning-badge px-4 py-3" : "action-outline px-4 py-3"}>
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button onClick={() => setShowTransfer((prev) => !prev)} className="action-outline px-4 py-3">
                <Users className="h-4 w-4" />
                Transfer
              </button>
            </>
          )}
        </div>

        {showTransfer && (
          <div className="mt-2 flex gap-2">
            <select
              value={transferExt}
              onChange={(e) => setTransferExt(e.target.value)}
              className="control-field flex-1"
              disabled={availableTransferAgents.length === 0}
            >
              {availableTransferAgents.length === 0 ? (
                <option value="">No available {getAgentStatusLabel(safeAgentStatus)} agents</option>
              ) : availableTransferAgents.map((agent) => (
                <option key={agent.agentId} value={agent.extension}>
                  {(agent.agentName || agent.agentId) + " - Ext " + (agent.extension || "")}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                const transferred = await transferCurrentCall(transferExt);
                if (!transferred) return;
                setShowTransfer(false);
              }}
              disabled={availableTransferAgents.length === 0 || !transferExt}
              className="action-gold"
            >
              Transfer
            </button>
          </div>
        )}
      </div>

      <DialerFormOverlay
        showForm={showForm}
        callPhase={callPhase}
        showPostCall={showPostCall}
        matchedCallStatus={matchedCall?.status || ""}
        formProps={dialerFormProps}
      />
    </div>
  );
}
