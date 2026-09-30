import { AnimatePresence, motion } from "framer-motion";
import { Ear, PhoneCall, PhoneOff, Radio } from "lucide-react";
import type { LiveCallMonitorMode } from "@/lib/api";
import type { ManagedCall } from "@/contexts/CallCenterContext";
import { getCallDisplayType, getCallResolvedCustomerName } from "@/lib/callDisplay";

export type LiveMonitorModalStatus = "requesting" | "waiting" | "connecting" | "connected" | "ended" | "failed";

type LiveMonitorModalProps = {
  open: boolean;
  call: ManagedCall | null;
  mode: LiveCallMonitorMode | null;
  status: LiveMonitorModalStatus;
  error?: string;
  agentName: string;
  phoneLabel: string;
  callTimer: string;
  onClose: () => void;
  onEnd: () => void;
};

const getModeTitle = (mode: LiveCallMonitorMode | null) => (
  mode === "barge" ? "Call Barging" : "Call Live Listening"
);

const getStatusBadgeClass = (status: LiveMonitorModalStatus) => {
  if (status === "connected") return "success-badge";
  if (status === "failed") return "live-badge";
  if (status === "ended") return "done-badge";
  return "warning-badge";
};

const getStatusLabel = (status: LiveMonitorModalStatus) => {
  if (status === "requesting") return "Starting";
  if (status === "waiting") return "Waiting";
  if (status === "connecting") return "Connecting";
  if (status === "connected") return "Connected";
  if (status === "ended") return "Ended";
  return "Failed";
};

const getStatusMessage = (status: LiveMonitorModalStatus, mode: LiveCallMonitorMode | null, error?: string) => {
  const modeTitle = getModeTitle(mode);

  if (status === "requesting") {
    return `Sending the ${modeTitle.toLowerCase()} request to your web phone.`;
  }
  if (status === "waiting") {
    return `Request accepted. Waiting for the live monitor session to reach your popup.`;
  }
  if (status === "connecting") {
    return `${modeTitle} is connecting now. Keep this popup open to hear the call immediately.`;
  }
  if (status === "connected") {
    return `${modeTitle} is live. Audio is routed through your selected speaker device.`;
  }
  if (status === "ended") {
    return `${modeTitle} has ended.`;
  }
  return error || `Unable to start ${modeTitle.toLowerCase()}.`;
};

export default function LiveMonitorModal({
  open,
  call,
  mode,
  status,
  error,
  agentName,
  phoneLabel,
  callTimer,
  onClose,
  onEnd,
}: LiveMonitorModalProps) {
  const customerName = call ? (getCallResolvedCustomerName(call) || "Unknown Customer") : "Unknown Customer";
  const canEnd = status === "connecting" || status === "connected";
  const canClose = status === "ended" || status === "failed";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 pt-8 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                  {mode === "barge" ? <PhoneCall className="h-5 w-5" /> : <Ear className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">Live Monitor</p>
                  <h2 className="text-xl font-semibold">{getModeTitle(mode)}</h2>
                  <p className="text-sm text-muted-foreground">Monitor the agent call in a dedicated popup.</p>
                </div>
              </div>
              <span className={getStatusBadgeClass(status)}>{getStatusLabel(status)}</span>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/25 p-4 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Agent</p>
                  <p className="text-sm font-semibold text-foreground">{agentName || "Unknown Agent"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Customer</p>
                  <p className="text-sm font-semibold text-foreground">{customerName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Phone</p>
                  <p className="text-sm font-semibold text-foreground">{phoneLabel || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Call Type</p>
                  <p className="text-sm font-semibold text-foreground">{call ? getCallDisplayType(call) : "—"}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Radio className={`h-4 w-4 ${status === "connected" ? "text-emerald-500" : "text-accent"}`} />
                    <p className="text-sm font-medium text-foreground">{getStatusMessage(status, mode, error)}</p>
                  </div>
                  {status === "connected" ? <span className="font-mono text-sm font-semibold text-foreground">{callTimer}</span> : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {canEnd ? (
                  <button type="button" onClick={onEnd} className="action-gold flex-1 justify-center py-3">
                    <PhoneOff className="h-4 w-4" />
                    End {mode === "barge" ? "Barging" : "Listening"}
                  </button>
                ) : null}

                {canClose ? (
                  <button type="button" onClick={onClose} className="action-outline flex-1 justify-center py-3">
                    Close Popup
                  </button>
                ) : null}

                {!canEnd && !canClose ? (
                  <div className="warning-badge px-4 py-3 text-sm">
                    {status === "requesting" ? "Starting live monitor..." : "Waiting for live session..."}
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
