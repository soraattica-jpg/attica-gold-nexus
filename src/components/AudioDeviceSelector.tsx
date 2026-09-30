import { useCallback, useEffect, useState, useRef } from "react";
import { Volume2, Mic, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import {
  applyPreferredAudioOutput,
  ensureUsableAudioInputStream,
  enumerateAvailableAudioDevices,
  getPreferredAudioInputDeviceId,
  getPreferredAudioOutputDeviceId,
  setPreferredAudioInputDeviceId,
  setPreferredAudioOutputDeviceId,
} from "@/lib/audioDevices";

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

type BrowserWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type MicrophoneSignalState = "idle" | "checking" | "active" | "silent" | "error";

export default function AudioDeviceSelector() {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState(() => getPreferredAudioInputDeviceId());
  const [selectedOutput, setSelectedOutput] = useState(() => getPreferredAudioOutputDeviceId());
  const [open, setOpen] = useState(false);
  const [tested, setTested] = useState(false);
  const [micAllowed, setMicAllowed] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [micSignalState, setMicSignalState] = useState<MicrophoneSignalState>("idle");
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const monitorStreamRef = useRef<MediaStream | null>(null);
  const monitorContextRef = useRef<AudioContext | null>(null);
  const monitorSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorAnalyserRef = useRef<AnalyserNode | null>(null);
  const monitorFrameRef = useRef<number | null>(null);
  const monitorSilenceStartedAtRef = useRef<number | null>(null);

  const stopInputMonitor = useCallback(() => {
    if (monitorFrameRef.current !== null) {
      window.cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = null;
    }
    try {
      monitorSourceRef.current?.disconnect();
    } catch (error) {
      console.debug("Microphone source cleanup skipped:", error);
    }
    try {
      monitorAnalyserRef.current?.disconnect();
    } catch (error) {
      console.debug("Microphone analyser cleanup skipped:", error);
    }
    if (monitorContextRef.current) {
      void monitorContextRef.current.close().catch(() => {});
    }
    monitorContextRef.current = null;
    monitorSourceRef.current = null;
    monitorAnalyserRef.current = null;
    monitorStreamRef.current?.getTracks().forEach((track) => track.stop());
    monitorStreamRef.current = null;
    monitorSilenceStartedAtRef.current = null;
    setMicLevel(0);
  }, []);

  const startInputMonitor = useCallback(async (deviceId: string) => {
    stopInputMonitor();
    setMicSignalState("checking");
    setMicLevel(0);

    try {
      const { stream, usedFallbackDevice, resolvedDeviceId } = await ensureUsableAudioInputStream(deviceId, 1200);
      monitorStreamRef.current = stream;
      setMicAllowed(true);

      if (usedFallbackDevice && resolvedDeviceId && resolvedDeviceId !== deviceId) {
        setSelectedInput(resolvedDeviceId);
        setPreferredAudioInputDeviceId(resolvedDeviceId);
        toast.info("Selected microphone did not respond. Switched to another available microphone.");
      }

      const AudioContextCtor = window.AudioContext || (window as BrowserWindow).webkitAudioContext;
      if (!AudioContextCtor) {
        setMicSignalState("active");
        return;
      }

      const context = new AudioContextCtor();
      monitorContextRef.current = context;
      if (context.state === "suspended") {
        await context.resume().catch(() => {});
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      monitorSourceRef.current = source;
      monitorAnalyserRef.current = analyser;

      const samples = new Uint8Array(analyser.fftSize);
      const frame = () => {
        if (!monitorAnalyserRef.current) return;
        monitorAnalyserRef.current.getByteTimeDomainData(samples);

        let squareSum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          squareSum += centered * centered;
        }

        const rms = Math.sqrt(squareSum / samples.length);
        const nextLevel = Math.min(1, rms * 3.5);
        const now = performance.now();
        setMicLevel(nextLevel);

        if (nextLevel > 0.06) {
          monitorSilenceStartedAtRef.current = null;
          setMicSignalState("active");
        } else {
          if (monitorSilenceStartedAtRef.current === null) {
            monitorSilenceStartedAtRef.current = now;
          }
          setMicSignalState(
            now - monitorSilenceStartedAtRef.current >= 1800
              ? "silent"
              : "checking",
          );
        }

        monitorFrameRef.current = window.requestAnimationFrame(frame);
      };

      frame();
    } catch (error) {
      console.error(error);
      setMicAllowed(false);
      setMicSignalState("error");
      setMicLevel(0);
      throw error;
    }
  }, [stopInputMonitor]);

  const loadDevices = useCallback(async () => {
    try {
      const { inputs: ins, outputs: outs, microphoneAccessible } = await enumerateAvailableAudioDevices(
        selectedInput || getPreferredAudioInputDeviceId(),
      );
      setMicAllowed(microphoneAccessible);
      setInputs(ins);
      setOutputs(outs);

      if (ins.length > 0) {
        const nextInput = ins.some((device) => device.deviceId === selectedInput)
          ? selectedInput
          : ins[0].deviceId;
        setSelectedInput(nextInput);
        setPreferredAudioInputDeviceId(nextInput);
        if (open) {
          void startInputMonitor(nextInput);
        }
      } else {
        stopInputMonitor();
        setMicSignalState("error");
      }

      if (outs.length > 0) {
        const nextOutput = outs.some((device) => device.deviceId === selectedOutput)
          ? selectedOutput
          : outs[0].deviceId;
        setSelectedOutput(nextOutput);
        setPreferredAudioOutputDeviceId(nextOutput);
      }
    } catch {
      setMicAllowed(false);
      setMicSignalState("error");
      stopInputMonitor();
    }
  }, [open, selectedInput, selectedOutput, startInputMonitor, stopInputMonitor]);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(!open);
    if (!open) {
      void loadDevices();
    }
  };

  const testAudio = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 500);
      setTested(true);
      toast.success("Audio working! You are connected to the server.");
      setTimeout(() => setTested(false), 3000);
    } catch (e) {
      toast.error("Audio test failed");
    }
  };

  const handleOutputChange = async (deviceId: string) => {
    setSelectedOutput(deviceId);
    setPreferredAudioOutputDeviceId(deviceId);
    const audio = document.getElementById("remoteAudio") as SinkAudioElement | null;
    try {
      await applyPreferredAudioOutput(audio, deviceId);
      toast.success("Speaker changed");
    } catch (error) {
      console.error(error);
    }
  };

  const handleInputChange = async (deviceId: string) => {
    setSelectedInput(deviceId);
    setPreferredAudioInputDeviceId(deviceId);

    try {
      await startInputMonitor(deviceId);
      setMicAllowed(true);
      toast.success("Microphone changed. New calls will use this device.");
    } catch (error) {
      console.error(error);
      setMicAllowed(false);
      toast.error("Selected microphone is not available");
    }
  };

  useEffect(() => {
    const handleDeviceChange = () => {
      if (open) {
        void loadDevices();
      }
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [loadDevices, open]);

  useEffect(() => {
    if (!open) {
      stopInputMonitor();
      setMicSignalState("idle");
    }

    return () => {
      stopInputMonitor();
    };
  }, [open, stopInputMonitor]);

  const micStatus = (() => {
    if (micAllowed === false) {
      return {
        title: "Microphone blocked",
        description: "Allow microphone access in the browser before placing or answering calls.",
        tone: "error" as const,
      };
    }

    if (inputs.length === 0) {
      return {
        title: "No microphone detected",
        description: "Plug in a headset or switch to another input device.",
        tone: "error" as const,
      };
    }

    if (micSignalState === "active") {
      return {
        title: "Microphone detected",
        description: "Input is working. Speak normally and watch the level meter move.",
        tone: "success" as const,
      };
    }

    if (micSignalState === "silent") {
      return {
        title: "No sound detected",
        description: "Try speaking, unmute the headset, or switch to another microphone.",
        tone: "warning" as const,
      };
    }

    return {
      title: "Microphone detected, waiting for input",
      description: "Speak into the selected device to confirm that audio is reaching the browser.",
      tone: "neutral" as const,
    };
  })();

  const micStatusStyles = {
    error: {
      background: "rgba(255,60,60,0.15)",
      border: "1px solid rgba(255,60,60,0.3)",
      title: "#ff6b6b",
      text: "#ffb4b4",
    },
    warning: {
      background: "rgba(245, 158, 11, 0.16)",
      border: "1px solid rgba(245, 158, 11, 0.28)",
      title: "#fbbf24",
      text: "#fde68a",
    },
    success: {
      background: "rgba(34,197,94,0.15)",
      border: "1px solid rgba(34,197,94,0.28)",
      title: "#4ade80",
      text: "#bbf7d0",
    },
    neutral: {
      background: "rgba(56, 189, 248, 0.12)",
      border: "1px solid rgba(56, 189, 248, 0.22)",
      title: "#7dd3fc",
      text: "#bae6fd",
    },
  }[micStatus.tone];

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", cursor: "pointer" }}
        title="Audio Settings">
        <Volume2 size={16} />
      </button>

      {open && (
        <div style={{
          position: "fixed", top: pos.top, right: pos.right, width: 320,
          borderRadius: 16, padding: 20, zIndex: 99999,
          background: "#1a1a2e", border: "1px solid #444",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)", color: "#fff"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#aaa" }}>Audio Devices</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", padding: 4 }}><X size={16} /></button>
          </div>

          <div style={{ background: micStatusStyles.background, border: micStatusStyles.border, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
            <p style={{ fontWeight: 600, color: micStatusStyles.title, margin: 0 }}>{micStatus.title}</p>
            <p style={{ color: micStatusStyles.text, margin: "4px 0 0", fontSize: 12 }}>{micStatus.description}</p>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: "#d4d4d8", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>Live Mic Level</span>
                <span style={{ color: "#d4d4d8", fontSize: 11 }}>{Math.round(micLevel * 100)}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 9999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${micLevel <= 0.01 ? 0 : Math.max(6, Math.round(micLevel * 100))}%`,
                    height: "100%",
                    borderRadius: 9999,
                    background: micSignalState === "silent"
                      ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                      : "linear-gradient(90deg, #38bdf8, #22c55e)",
                    transition: "width 120ms ease-out",
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#ccc" }}>
              <Mic size={14} color="#f0c040" /> Microphone
            </label>
            <select value={selectedInput} onChange={e => void handleInputChange(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "#252540", color: "#fff", border: "1px solid #555", fontSize: 13, outline: "none" }}>
              {inputs.length > 0 ? inputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "Mic " + d.deviceId.slice(0,8)}</option>) : <option>No microphone detected</option>}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#ccc" }}>
              <Volume2 size={14} color="#f0c040" /> Speaker
            </label>
            <select value={selectedOutput} onChange={e => handleOutputChange(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "#252540", color: "#fff", border: "1px solid #555", fontSize: 13, outline: "none" }}>
              {outputs.length > 0 ? outputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "Speaker " + d.deviceId.slice(0,8)}</option>) : <option>Default speaker</option>}
            </select>
          </div>

          <button onClick={testAudio}
            style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: tested ? "#22c55e" : "linear-gradient(135deg, #d4a017, #b8860b)", color: "#fff", transition: "all 0.2s" }}>
            {tested ? <><CheckCircle2 size={16} /> Speaker Test Passed</> : <><Volume2 size={16} /> Test Speaker</>}
          </button>
        </div>
      )}
    </>
  );
}
