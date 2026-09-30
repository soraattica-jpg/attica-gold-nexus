import type { UserRole } from "@/contexts/AuthContext";
import { applyPreferredAudioOutput, enumerateAvailableAudioDevices, getPreferredAudioStream } from "@/lib/audioDevices";

const getDefaultSipServer = () => {
  if (import.meta.env.VITE_SIP_SERVER) {
    return import.meta.env.VITE_SIP_SERVER;
  }

  // The Asterisk WSS certificate is issued for the apex host. Deriving this
  // from window.location would break browser trust when users open the app via
  // aliases such as www.atticagold.xyz.
  return "atticagold.xyz";
};

export const SIP_SERVER = getDefaultSipServer();
export const WSS_URL = import.meta.env.VITE_SIP_WSS_URL || `wss://${SIP_SERVER}:8089/ws`;
export const SIP_AUTH_PASSWORD = import.meta.env.VITE_SIP_AUTH_PASSWORD || (process.env.ATTICA_VERIFY_AGENT_PASSWORD || "");

export interface SipAgentProfile {
  id: string;
  ext: string;
  name: string;
  role: UserRole;
  sipPassword?: string;
}

const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

export function buildSipAgentProfile(user: {
  id: string;
  extension?: string;
  name: string;
  role: UserRole;
  sipPassword?: string;
}): SipAgentProfile | null {
  const ext = normalizeOptionalString(user.extension);
  if (!ext) {
    return null;
  }
  if (user.role !== "agent" && !normalizeOptionalString(user.sipPassword)) {
    return null;
  }

  return {
    id: user.id,
    ext,
    name: user.name,
    role: user.role,
    sipPassword: normalizeOptionalString(user.sipPassword) || SIP_AUTH_PASSWORD || undefined,
  };
}

export async function getAudioDevices() {
  try {
    const devices = await enumerateAvailableAudioDevices();
    return {
      inputs: devices.inputs,
      outputs: devices.outputs,
    };
  } catch (error) {
    console.error("Audio device access error:", error);
    return { inputs: [], outputs: [] };
  }
}

export async function ensureMicrophoneAccess() {
  try {
    const stream = await getPreferredAudioStream();
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true as const, message: "" };
  } catch (error) {
    console.error("Microphone access error:", error);
    const message =
      error instanceof DOMException
        ? error.message
        : error instanceof Error
          ? error.message
          : "Microphone access denied";
    return { ok: false as const, message };
  }
}

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

export async function setAudioOutput(deviceId: string) {
  const audio = document.getElementById("remoteAudio") as SinkAudioElement | null;
  try {
    await applyPreferredAudioOutput(audio, deviceId);
  } catch (error) {
    console.error("Audio output switch error:", error);
  }
}

export function playTestTone() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 440;
    oscillator.connect(context.destination);
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      void context.close();
    }, 500);
  } catch (error) {
    console.error("Test tone error:", error);
  }
}
