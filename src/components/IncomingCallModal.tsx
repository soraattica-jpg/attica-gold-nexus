import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, PhoneCall, PhoneOff } from "lucide-react";
import { IsolatedCustomerIntakeForm } from "@/components/CustomerIntakeForm";
import { useAuth } from "@/contexts/AuthContext";
import { api, buildApiUrl } from "@/lib/api";
import { useCallCenter, type ManagedCall } from "@/contexts/CallCenterContext";
import { getMeaningfulCustomerName } from "@/lib/callDisplay";
import { hasIncomingCallEverConnected } from "@/lib/incomingWrapUp";
import { hidePhoneDisplay, normalizePhoneNumber } from "@/lib/phone";

type IncomingLanguageResponse = {
  language?: string;
  businessType?: string;
  purpose?: string;
};

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

const isIncomingCallRecord = (value: unknown): value is ManagedCall => (
  Boolean(value && typeof value === "object")
);

const normalizeCallLookupId = (value: unknown) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const separatorIndex = normalized.indexOf("|");
  if (separatorIndex <= 0) return normalized;
  return normalized.slice(0, separatorIndex).trim() || normalized;
};

type IncomingDialogFormProps = ComponentProps<typeof IsolatedCustomerIntakeForm>;

type IncomingCallDialogViewProps = {
  modalVisible: boolean;
  visibleCustomerName: string;
  visibleIncomingPhone: string;
  detectedLanguage: string;
  callPhase: "idle" | "dialing" | "connected";
  callEnded: boolean;
  wasConnected: boolean;
  answering: boolean;
  formProps: IncomingDialogFormProps;
  onAnswer: () => void;
  onReject: () => void;
  onClose: () => void;
};

const IncomingCallDialogView = memo(function IncomingCallDialogView({
  modalVisible,
  visibleCustomerName,
  visibleIncomingPhone,
  detectedLanguage,
  callPhase,
  callEnded,
  wasConnected,
  answering,
  formProps,
  onAnswer,
  onReject,
  onClose,
}: IncomingCallDialogViewProps) {
  if (!modalVisible) return null;
  const formInstanceKey = `incoming-form:${formProps.callId || formProps.phone || "active"}`;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex h-[100dvh] items-center justify-center overflow-hidden bg-black/50 p-2 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          className="flex h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] min-h-0 w-[min(1160px,calc(100vw-16px))] max-w-none flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-2xl max-md:rounded-none"
        >
          <div className="flex items-center justify-between border-b border-border p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <BellRing className="h-4 w-4 live-pulse" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Incoming Call</p>
                <p className="text-sm font-semibold">{visibleCustomerName}</p>
                {visibleIncomingPhone ? <p className="text-xs font-mono text-muted-foreground">{visibleIncomingPhone}</p> : null}
              </div>
              {detectedLanguage && <span className="done-badge ml-2 text-xs">{detectedLanguage}</span>}
            </div>
            <span className={callPhase === "connected" ? "success-badge" : callEnded ? "done-badge" : answering ? "warning-badge" : "live-badge"}>
              {callPhase === "connected" ? "Connected" : callEnded ? (wasConnected ? "Call Ended" : "Missed") : answering ? "Connecting" : "Alerting"}
            </span>
          </div>

          {answering && !callEnded && callPhase !== "connected" && (
            <div className="border-b border-border px-2 py-1.5">
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-1.5 text-xs text-sky-700">
                <p className="font-medium">Auto connecting the customer call...</p>
                <p className="mt-1 text-xs text-sky-800/80">
                  Keep your headset ready. Speak to the customer as soon as the call connects.
                </p>
              </div>
            </div>
          )}

          {!(callEnded && wasConnected) ? <div className="flex gap-2 border-b border-border p-2">
            {callPhase === "connected" ? (
              <button
                onClick={onReject}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </button>
            ) : callEnded && !wasConnected ? (
              <>
                <button onClick={onClose} className="action-gold flex-1 justify-center py-1.5">
                  Close
                </button>
                <button onClick={onClose} className="action-outline flex-1 justify-center py-1.5">
                  Dismiss
                </button>
              </>
            ) : (
              <div className="flex w-full items-center gap-2">
                <div className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
                  <BellRing className="h-4 w-4 live-pulse" />
                  {answering ? "Connecting..." : "Incoming call waiting"}
                </div>
                <button
                  type="button"
                  onClick={onAnswer}
                  disabled={answering}
                  className="flex items-center justify-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-600/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PhoneCall className="h-4 w-4" />
                  Answer
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  disabled={answering}
                  className="flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PhoneOff className="h-4 w-4" />
                  Reject
                </button>
              </div>
            )}
          </div> : null}

          {(callPhase === "connected" || (callEnded && wasConnected)) && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
              <div className="min-h-0 flex-1 overflow-hidden">
                <IsolatedCustomerIntakeForm key={formInstanceKey} {...formProps} />
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}, (previous, next) => (
  previous.modalVisible === next.modalVisible
  && previous.visibleCustomerName === next.visibleCustomerName
  && previous.visibleIncomingPhone === next.visibleIncomingPhone
  && previous.detectedLanguage === next.detectedLanguage
  && previous.callPhase === next.callPhase
  && previous.callEnded === next.callEnded
  && previous.wasConnected === next.wasConnected
  && previous.answering === next.answering
  && previous.formProps === next.formProps
  && previous.onAnswer === next.onAnswer
  && previous.onReject === next.onReject
  && previous.onClose === next.onClose
));

export default function IncomingCallModal() {
  const { user } = useAuth();
  const {
    incomingDialogOpen,
    incomingDraftPhone,
    incomingDialogCallId,
    answerIncoming,
    skipIncomingLead,
    endCall,
    callPhase,
    calls,
    followUps,
    completeCallWrapUp,
    addFollowUp,
    closePendingFollowUpsForPhone,
    syncCallRecord,
    isOnHold,
    toggleHold,
    transferCurrentCall,
    startConferenceCall,
    agentStatus,
    getFinalizedCallSnapshot,
    getLiveCallSnapshot,
  } = useCallCenter();
  const [answering, setAnswering] = useState(false);
  const [wasConnected, setWasConnected] = useState(false);
  const [callReceived, setCallReceived] = useState(false);
  const [keepModalOpen, setKeepModalOpen] = useState(false);
  const [latchedIncomingPhone, setLatchedIncomingPhone] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState("");
  const [detectedBusinessType, setDetectedBusinessType] = useState("");
  const [detectedPurpose, setDetectedPurpose] = useState("");
  const [detectedCustomerName, setDetectedCustomerName] = useState("");
  const shouldMaskPhone = user?.role === "agent";
  const safeCalls = useMemo(
    () => (Array.isArray(calls) ? calls.filter(isIncomingCallRecord) : []),
    [calls],
  );
  const safeCallsRef = useRef<ManagedCall[]>(safeCalls);
  const effectiveIncomingPhone = incomingDraftPhone || latchedIncomingPhone;
  const modalVisible = incomingDialogOpen || keepModalOpen;
  const visibleIncomingPhone = shouldMaskPhone ? hidePhoneDisplay(effectiveIncomingPhone) : effectiveIncomingPhone;
  const visibleCustomerName = getMeaningfulCustomerName(detectedCustomerName) || "Unknown Customer";

  useEffect(() => {
    safeCallsRef.current = safeCalls;
  }, [safeCalls]);

  useEffect(() => {
    if (!modalVisible) {
      setAnswering(false);
      setWasConnected(false);
      setCallReceived(false);
      setKeepModalOpen(false);
      setLatchedIncomingPhone("");
      setDetectedLanguage("");
      setDetectedBusinessType("");
      setDetectedPurpose("");
      setDetectedCustomerName("");
      return;
    }

    if (incomingDialogOpen) {
      setKeepModalOpen(true);
      setCallReceived(true);
    }
    if (incomingDraftPhone) {
      setLatchedIncomingPhone(incomingDraftPhone);
    }
  }, [incomingDialogOpen, incomingDraftPhone, modalVisible]);

  useEffect(() => {
    if (callPhase === "connected") {
      setAnswering(false);
      setWasConnected(true);
      return;
    }

    if (callPhase === "idle" || !incomingDialogOpen) {
      setAnswering(false);
    }
  }, [callPhase, incomingDialogOpen]);

  useEffect(() => {
    if (modalVisible && effectiveIncomingPhone) {
      Promise.all([
        fetch(buildApiUrl(`/call-ivr/${encodeURIComponent(effectiveIncomingPhone)}`), {
          cache: "no-store",
        })
          .then((response) => response.json() as Promise<IncomingLanguageResponse>)
          .catch(() => ({} as IncomingLanguageResponse)),
        api.getCustomerProfile(effectiveIncomingPhone).catch(() => ({
          phone: effectiveIncomingPhone,
          customerName: "",
          mob2: "",
          district: "",
          location: "",
          branch: "",
          language: "",
          businessType: "",
          metalType: "",
          grams: "",
          releasingAmount: "",
          bankName: "",
          onlinePrice: "",
          pricePerGram: "",
          advertisement: "",
          lead: "",
          formStatus: "",
          purpose: "",
          notes: "",
          hasSavedDetails: false,
        })),
      ])
        .then(([ivrPayload, profilePayload]) => {
          if (ivrPayload.language) {
            setDetectedLanguage(ivrPayload.language);
          }
          if (ivrPayload.businessType) {
            setDetectedBusinessType(ivrPayload.businessType);
          }
          if (ivrPayload.purpose) {
            setDetectedPurpose(ivrPayload.purpose);
          }
          if (profilePayload.customerName) {
            setDetectedCustomerName(profilePayload.customerName);
          }
        })
        .catch(() => {});
    }
  }, [effectiveIncomingPhone, modalVisible]);

  const resetLocalModalState = useCallback(() => {
    setKeepModalOpen(false);
    setAnswering(false);
    setWasConnected(false);
    setCallReceived(false);
    setLatchedIncomingPhone("");
    setDetectedLanguage("");
    setDetectedBusinessType("");
    setDetectedPurpose("");
    setDetectedCustomerName("");
  }, []);

  const handleReject = useCallback(() => {
    resetLocalModalState();
    endCall();
    skipIncomingLead();
  }, [endCall, resetLocalModalState, skipIncomingLead]);

  const handleAnswer = useCallback(() => {
    if (answering || callPhase !== "dialing") return;
    setAnswering(true);
    void answerIncoming().then((answered) => {
      if (!answered) {
        setAnswering(false);
      }
    }).catch((error) => {
      console.error("Incoming answer action failed:", error);
      setAnswering(false);
    });
  }, [answerIncoming, answering, callPhase]);

  const callEnded = callPhase === "idle" && callReceived;

  const handleClose = useCallback(() => {
    resetLocalModalState();
    skipIncomingLead();
  }, [resetLocalModalState, skipIncomingLead]);

  const handleFormSaved = useCallback(() => {
    completeCallWrapUp();
    handleClose();
  }, [completeCallWrapUp, handleClose]);

  const handleWrapUpClosed = useCallback(() => {
    completeCallWrapUp();
    handleClose();
  }, [completeCallWrapUp, handleClose]);

  const matchedCall = useMemo(() => {
    const normalizedDialogCallId = normalizeCallLookupId(incomingDialogCallId);
    if (normalizedDialogCallId) {
      const exactMatch = safeCalls.find((call) => normalizeCallLookupId(call.id) === normalizedDialogCallId);
      if (exactMatch) return exactMatch;
    }

    return safeCalls
      .filter((call) => (
        call.direction === "incoming"
        && normalizePhoneNumber(call.callerId) === normalizePhoneNumber(effectiveIncomingPhone)
      ))
      .sort((left, right) => {
        const priorityDelta = getCallPriority(right.status) - getCallPriority(left.status);
        if (priorityDelta !== 0) return priorityDelta;
        return getCallTimestamp(right) - getCallTimestamp(left);
      })[0];
  }, [effectiveIncomingPhone, incomingDialogCallId, safeCalls]);
  const matchedCallId = matchedCall?.id;
  const normalizedDialogCallId = normalizeCallLookupId(incomingDialogCallId);
  const finalizedMatchedCallSnapshot = useMemo(
    () => getFinalizedCallSnapshot(matchedCallId || normalizedDialogCallId),
    [getFinalizedCallSnapshot, matchedCallId, normalizedDialogCallId],
  );
  const resolvedWasConnected = hasIncomingCallEverConnected({
    wasConnected,
    call: matchedCall,
    finalizedCallSnapshot: finalizedMatchedCallSnapshot,
  });
  useEffect(() => {
    if (
      !incomingDialogOpen
      && keepModalOpen
      && callPhase === "idle"
      && callReceived
      && !resolvedWasConnected
      && !matchedCall
    ) {
      resetLocalModalState();
    }
  }, [
    callPhase,
    callReceived,
    incomingDialogOpen,
    keepModalOpen,
    matchedCall,
    resetLocalModalState,
    resolvedWasConnected,
  ]);
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
      duration: "00:00",
      time: matchedCall.time,
      date: matchedCall.date,
      language: matchedCall.language,
      branch: matchedCall.branch,
      place: matchedCall.place,
      purpose: matchedCall.purpose,
      callbackStatus: matchedCall.callbackStatus,
      followUpFlag: matchedCall.followUpFlag,
      leadSource: matchedCall.leadSource,
      carrierTrunk: matchedCall.carrierTrunk,
      trunkCode: matchedCall.trunkCode,
      pilot: matchedCall.pilot,
      didOrCli: matchedCall.didOrCli,
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
      talkDurationSeconds: 0,
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
    matchedCall?.time,
    matchedCall?.date,
    matchedCall?.language,
    matchedCall?.branch,
    matchedCall?.place,
    matchedCall?.purpose,
    matchedCall?.callbackStatus,
    matchedCall?.followUpFlag,
    matchedCall?.leadSource,
    matchedCall?.carrierTrunk,
    matchedCall?.trunkCode,
    matchedCall?.pilot,
    matchedCall?.didOrCli,
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
    matchedCall?.hasRecording,
  ]);
  const getCurrentCall = useCallback((lookup: { callId?: string; intakeToken?: string }) => {
    const normalizedCallId = normalizeCallLookupId(lookup.callId);
    const normalizedIntakeToken = String(lookup.intakeToken || "").trim();
    return safeCallsRef.current.find((call) => (
      (normalizedCallId && call.id === normalizedCallId)
      || (normalizedIntakeToken && call.intakeToken === normalizedIntakeToken)
    )) || null;
  }, []);
  const incomingFormProps = useMemo<IncomingDialogFormProps>(() => ({
    phone: effectiveIncomingPhone,
    customerName: getMeaningfulCustomerName(detectedCustomerName),
    direction: "incoming",
    language: detectedLanguage,
    businessType: detectedBusinessType,
    purpose: detectedPurpose,
    callId: matchedCallId,
    inline: true,
    onSave: handleFormSaved,
    onClose: callEnded ? handleWrapUpClosed : undefined,
    showCloseButton: false,
    showDraftCloseButton: callEnded,
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
    agentStatus,
    transferCurrentCall,
    startConferenceCall,
    getFinalizedCallSnapshot,
    getLiveCallSnapshot,
  }), [
    addFollowUp,
    callEnded,
    callPhase,
    closePendingFollowUpsForPhone,
    detectedBusinessType,
    detectedCustomerName,
    detectedLanguage,
    detectedPurpose,
    effectiveIncomingPhone,
    followUps,
    getCurrentCall,
    getFinalizedCallSnapshot,
    getLiveCallSnapshot,
    agentStatus,
    isOnHold,
    handleFormSaved,
    handleWrapUpClosed,
    matchedCallId,
    stableMatchedCallSnapshot,
    syncCallRecord,
    startConferenceCall,
    transferCurrentCall,
    toggleHold,
  ]);
  if (!modalVisible) return null;

  return (
    <IncomingCallDialogView
      modalVisible={modalVisible}
      visibleCustomerName={visibleCustomerName}
      visibleIncomingPhone={visibleIncomingPhone}
      detectedLanguage={detectedLanguage}
      callPhase={callPhase}
      callEnded={callEnded}
      wasConnected={resolvedWasConnected}
      answering={answering}
      formProps={incomingFormProps}
      onAnswer={handleAnswer}
      onReject={callPhase === "connected" ? () => { void endCall(); } : handleReject}
      onClose={handleClose}
    />
  );
}
