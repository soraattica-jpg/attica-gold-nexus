import { motion } from "framer-motion";
import { Delete, Hash, Mic, Pause, Phone, PhoneOff } from "lucide-react";
import { useCallCenter } from "@/contexts/CallCenterContext";

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export default function DialerPanel() {
  const {
    dialedNumber,
    callPhase,
    callTimer,
    isMuted,
    isOnHold,
    appendDigit,
    backspaceDialedNumber,
    clearDialedNumber,
    setDialedNumber,
    startCall,
    endCall,
    toggleHold,
    toggleMute,
  } = useCallCenter();

  const connected = callPhase === "connected";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Manual Dialer</p>
          <h2 className="text-xl font-semibold">Agent Call Console</h2>
        </div>
        <div className={connected ? "live-badge" : callPhase === "dialing" ? "warning-badge" : "done-badge"}>
          {connected ? "Connected" : callPhase === "dialing" ? "Ringing" : "Ready"}
        </div>
      </div>

      <div className="space-y-4">
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">Dialed Number</span>
          <input
            value={dialedNumber}
            onChange={(event) => setDialedNumber(event.target.value)}
            placeholder="Type or tap digits"
            className="control-field text-center font-mono text-xl tracking-[0.2em]"
            disabled={callPhase !== "idle"}
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          {keys.map((key) => (
            <button
              key={key}
              onClick={() => appendDigit(key)}
              className="dialer-key"
              disabled={callPhase !== "idle"}
            >
              {key === "#" ? <Hash className="h-5 w-5" /> : key}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={backspaceDialedNumber} className="action-outline" disabled={callPhase !== "idle"}>
            <Delete className="h-4 w-4" />
            Backspace
          </button>
          <button onClick={clearDialedNumber} className="action-outline" disabled={callPhase !== "idle"}>
            Clear
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Call Timer</span>
            <span className="font-mono text-lg text-foreground">{callTimer}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2 flex items-center justify-center">
              <button
                onClick={connected || callPhase === "dialing" ? endCall : startCall}
                className={`call-action-button ${connected || callPhase === "dialing" ? "call-action-danger" : "call-action-primary"} ${callPhase !== "idle" ? "call-button-ring" : ""}`}
                disabled={!dialedNumber.trim() && callPhase === "idle"}
              >
                {connected || callPhase === "dialing" ? <PhoneOff className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                {connected || callPhase === "dialing" ? "End" : "Call"}
              </button>
            </div>
            <button onClick={toggleHold} className={`call-control-button ${isOnHold ? "warning-badge" : "action-outline"}`} disabled={!connected}>
              <Pause className="h-4 w-4" />
              Hold
            </button>
            <button onClick={toggleMute} className={`call-control-button ${isMuted ? "warning-badge" : "action-outline"}`} disabled={!connected}>
              <Mic className="h-4 w-4" />
              Mute
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
