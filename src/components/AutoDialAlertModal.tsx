import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Clock3, PhoneCall } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";
import type { AutoDialQueueExitReason } from "@/lib/api";
import { getAutoDialLeadSourceLabel } from "@/lib/callDisplay";
import { hidePhoneDisplay } from "@/lib/phone";

type BrowserWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export default function AutoDialAlertModal() {
  const { user } = useAuth();
  const {
    autoDialAlertLead,
    autoDialAlertAutoConnectActive,
    acceptAutoDialAlert,
    rejectAutoDialAlert,
    snoozeAutoDialAlert,
    agentStatus,
  } = useCallCenter();
  const audioContextRef = useRef<AudioContext | null>(null);
  const [pendingAction, setPendingAction] = useState<string>("");
  const shouldMaskPhone = user?.role === "agent";
  const sourceLabel = getAutoDialLeadSourceLabel(autoDialAlertLead?.sourceFile);
  const alertTitle = agentStatus === "outbound-auto" ? "Outbound Auto Call" : "Follow-Up Call";
  const rejectActions: AutoDialQueueExitReason[] = [
    "Wrong Number",
    "Duplicate Lead",
    "Invalid Lead",
    "Remove from Queue",
  ];
  const suspendAlertAudio = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    void context.suspend().catch(() => {});
  }, []);

  useEffect(() => {
    if (!autoDialAlertLead) {
      suspendAlertAudio();
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as BrowserWindow).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    const context = audioContextRef.current;
    let cancelled = false;

    const beep = () => {
      if (cancelled) return;
      if (context.state === "suspended") {
        void context.resume().catch(() => {});
      }

      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.0001;
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      const now = context.currentTime;
      gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      oscillator.start(now);
      oscillator.stop(now + 0.3);
    };

    beep();
    const interval = window.setInterval(beep, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      suspendAlertAudio();
    };
  }, [autoDialAlertLead, suspendAlertAudio]);

  useEffect(() => () => {
    suspendAlertAudio();
  }, [suspendAlertAudio]);

  useEffect(() => {
    setPendingAction("");
  }, [autoDialAlertLead?.id]);

  if (!autoDialAlertLead || (agentStatus !== "outbound-auto" && agentStatus !== "follow-up")) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-8 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl"
        >
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
                <BellRing className="h-5 w-5 live-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">{alertTitle}</p>
                <h2 className="text-xl font-semibold">{autoDialAlertLead.customerName || (shouldMaskPhone ? hidePhoneDisplay(autoDialAlertLead.mobileNumber) : autoDialAlertLead.mobileNumber)}</h2>
                <p className="text-sm font-mono text-muted-foreground">{shouldMaskPhone ? hidePhoneDisplay(autoDialAlertLead.mobileNumber) : autoDialAlertLead.mobileNumber}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-3 rounded-2xl border border-border bg-muted/25 p-4 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Source</p>
                <p className="text-sm font-semibold text-foreground">{sourceLabel}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Area</p>
                <p className="text-sm font-semibold text-foreground">{autoDialAlertLead.area || "Not provided"}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Gold Weight</p>
                <p className="text-sm font-semibold text-foreground">{autoDialAlertLead.goldWeight || "Not provided"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700">
              <Clock3 className="h-4 w-4" />
              {autoDialAlertAutoConnectActive
                ? `${agentStatus === "outbound-auto" ? "Outbound auto call" : "Follow-up call"} is starting automatically.`
                : `${agentStatus === "outbound-auto" ? "Outbound auto call is ready." : "Follow-up is ready."} The agent is being alerted before the call is dialed.`}
            </div>

            <div className="flex flex-wrap gap-3">
              {autoDialAlertAutoConnectActive ? (
                <div className="action-gold flex-1 justify-center py-3 opacity-80">
                  <PhoneCall className="h-4 w-4" />
                  Auto Dialing...
                </div>
              ) : (
                <button
                  onClick={() => {
                    setPendingAction("dial");
                    acceptAutoDialAlert();
                  }}
                  className="action-gold flex-1 justify-center py-3"
                  disabled={Boolean(pendingAction)}
                >
                  <PhoneCall className="h-4 w-4" />
                  {pendingAction === "dial" ? "Dialing..." : agentStatus === "outbound-auto" ? "Dial Outbound Lead" : "Dial Follow-Up"}
                </button>
              )}
              <button
                type="button"
                className="action-outline justify-center py-3"
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  setPendingAction("snooze");
                  snoozeAutoDialAlert();
                  setPendingAction("");
                }}
              >
                {pendingAction === "snooze" ? "Snoozing..." : "Snooze 1 Min"}
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {rejectActions.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className="action-outline justify-center border-red-300 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(pendingAction)}
                  onClick={() => {
                    setPendingAction(reason);
                    void rejectAutoDialAlert(reason).finally(() => {
                      setPendingAction((current) => (current === reason ? "" : current));
                    });
                  }}
                >
                  {pendingAction === reason ? "Saving..." : reason}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
