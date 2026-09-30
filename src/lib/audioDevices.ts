import { readLocalStorageItem, removeLocalStorageItem, writeLocalStorageItem } from "@/lib/browserStorage";

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

export type EnumeratedAudioDevices = {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  microphoneAccessible: boolean;
};

export const AUDIO_INPUT_STORAGE_KEY = "attica_audio_input_device";
export const AUDIO_OUTPUT_STORAGE_KEY = "attica_audio_output_device";
const AUDIO_TRACK_WARMUP_TIMEOUT_MS = 1500;
type AudioTrackWarmupState = "usable" | "live" | "unavailable";

const readStoredDeviceId = (key: string) => {
  return readLocalStorageItem(key)?.trim() || "";
};

const writeStoredDeviceId = (key: string, deviceId: string) => {
  const trimmed = deviceId.trim();
  if (trimmed) {
    writeLocalStorageItem(key, trimmed);
  } else {
    removeLocalStorageItem(key);
  }
};

export const getPreferredAudioInputDeviceId = () => readStoredDeviceId(AUDIO_INPUT_STORAGE_KEY);
export const getPreferredAudioOutputDeviceId = () => readStoredDeviceId(AUDIO_OUTPUT_STORAGE_KEY);
export const setPreferredAudioInputDeviceId = (deviceId: string) => writeStoredDeviceId(AUDIO_INPUT_STORAGE_KEY, deviceId);
export const setPreferredAudioOutputDeviceId = (deviceId: string) => writeStoredDeviceId(AUDIO_OUTPUT_STORAGE_KEY, deviceId);
export const clearPreferredAudioInputDeviceId = () => writeStoredDeviceId(AUDIO_INPUT_STORAGE_KEY, "");
export const clearPreferredAudioOutputDeviceId = () => writeStoredDeviceId(AUDIO_OUTPUT_STORAGE_KEY, "");

export const buildAudioOnlyConstraints = (deviceId?: string): MediaStreamConstraints => ({
  audio: {
    deviceId: deviceId?.trim() ? { exact: deviceId.trim() } : undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
});

const requestAudioInputStream = (deviceId?: string) => (
  navigator.mediaDevices.getUserMedia(buildAudioOnlyConstraints(deviceId))
);

const isMissingPreferredDeviceError = (error: unknown) => (
  error instanceof DOMException
  && (error.name === "NotFoundError" || error.name === "OverconstrainedError")
);

const isPermissionDeniedError = (error: unknown) => (
  error instanceof DOMException
  && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || error.name === "SecurityError")
);

export async function getPreferredAudioStream(preferredInputDeviceId = getPreferredAudioInputDeviceId()) {
  const trimmedDeviceId = preferredInputDeviceId.trim();

  try {
    return await requestAudioInputStream(trimmedDeviceId || undefined);
  } catch (error) {
    if (trimmedDeviceId && isMissingPreferredDeviceError(error)) {
      clearPreferredAudioInputDeviceId();
      return requestAudioInputStream();
    }
    throw error;
  }
}

const isUsableAudioTrack = (track: MediaStreamTrack | null | undefined) => (
  Boolean(track && track.kind === "audio" && track.readyState === "live" && !track.muted)
);

const getAudioTrackWarmupState = (
  track: MediaStreamTrack | null | undefined,
): AudioTrackWarmupState => {
  if (!track || track.kind !== "audio" || track.readyState !== "live") {
    return "unavailable";
  }

  if (!track.muted) {
    return "usable";
  }

  return "live";
};

const stopMediaStream = (stream: MediaStream | null | undefined) => {
  stream?.getTracks().forEach((track) => track.stop());
};

export async function enumerateAvailableAudioDevices(
  preferredInputDeviceId = getPreferredAudioInputDeviceId(),
): Promise<EnumeratedAudioDevices> {
  if (!navigator.mediaDevices) {
    return {
      inputs: [],
      outputs: [],
      microphoneAccessible: false,
    };
  }

  let microphoneAccessible = false;

  try {
    const stream = await getPreferredAudioStream(preferredInputDeviceId);
    microphoneAccessible = true;
    stopMediaStream(stream);
  } catch {
    microphoneAccessible = false;
  }

  const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => [] as MediaDeviceInfo[]) || [];
  return {
    inputs: devices.filter((device) => device.kind === "audioinput"),
    outputs: devices.filter((device) => device.kind === "audiooutput"),
    microphoneAccessible,
  };
}

const waitForAudioTrackWarmup = async (
  track: MediaStreamTrack | null | undefined,
  timeoutMs = AUDIO_TRACK_WARMUP_TIMEOUT_MS,
) => {
  const initialState = getAudioTrackWarmupState(track);
  if (initialState !== "live") return initialState;

  return new Promise<AudioTrackWarmupState>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let pollId: ReturnType<typeof globalThis.setInterval> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (pollId !== null) {
        globalThis.clearInterval(pollId);
      }
      track.removeEventListener?.("mute", inspectTrackState);
      track.removeEventListener?.("unmute", inspectTrackState);
      track.removeEventListener?.("ended", inspectTrackState);
    };

    const finish = (result: AudioTrackWarmupState) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const inspectTrackState = () => {
      const nextState = getAudioTrackWarmupState(track);
      if (nextState !== "live") {
        finish(nextState);
      }
    };

    track.addEventListener?.("mute", inspectTrackState);
    track.addEventListener?.("unmute", inspectTrackState);
    track.addEventListener?.("ended", inspectTrackState);
    pollId = globalThis.setInterval(inspectTrackState, Math.max(100, Math.min(250, Math.floor(timeoutMs / 4) || 100)));
    timeoutId = globalThis.setTimeout(() => {
      finish(getAudioTrackWarmupState(track));
    }, Math.max(0, timeoutMs));

    inspectTrackState();
  });
};

export async function waitForUsableAudioTrack(
  track: MediaStreamTrack | null | undefined,
  timeoutMs = AUDIO_TRACK_WARMUP_TIMEOUT_MS,
) {
  return (await waitForAudioTrackWarmup(track, timeoutMs)) === "usable";
}

export async function ensureUsableAudioInputStream(
  preferredInputDeviceId = getPreferredAudioInputDeviceId(),
  warmupTimeoutMs = AUDIO_TRACK_WARMUP_TIMEOUT_MS,
) {
  const trimmedDeviceId = preferredInputDeviceId.trim();
  let lastError: unknown = new Error("Microphone connected but did not start sending audio");

  const attemptCandidate = async (
    candidateDeviceId: string,
    options?: { allowLiveDefaultTrack?: boolean },
  ) => {
    const stream = await requestAudioInputStream(candidateDeviceId || undefined);
    const track = stream.getAudioTracks()[0] ?? null;
    const trackState = await waitForAudioTrackWarmup(track, warmupTimeoutMs);

    if (trackState === "usable" || (options?.allowLiveDefaultTrack && !candidateDeviceId && trackState === "live")) {
      return {
        stream,
        usedFallbackDevice: Boolean(trimmedDeviceId) && candidateDeviceId !== trimmedDeviceId,
        resolvedDeviceId: track?.getSettings?.().deviceId?.trim() || candidateDeviceId,
      };
    }

    stopMediaStream(stream);
    throw new Error("Microphone connected but did not start sending audio");
  };

  const tryCapture = async (
    candidateDeviceId: string,
    options?: { allowLiveDefaultTrack?: boolean },
  ) => {
    try {
      return await attemptCandidate(candidateDeviceId, options);
    } catch (error) {
      lastError = error;

      if (candidateDeviceId === trimmedDeviceId && isMissingPreferredDeviceError(error)) {
        clearPreferredAudioInputDeviceId();
      }

      if (isPermissionDeniedError(error)) {
        throw error;
      }

      return null;
    }
  };

  if (trimmedDeviceId) {
    const preferredResult = await tryCapture(trimmedDeviceId);
    if (preferredResult) return preferredResult;
  }

  const defaultResult = await tryCapture("");
  if (defaultResult) return defaultResult;

  const alternateInputs = await (navigator.mediaDevices?.enumerateDevices?.().catch(() => [] as MediaDeviceInfo[]) || []);
  for (const input of alternateInputs) {
    if (input.kind !== "audioinput") continue;
    const deviceId = input.deviceId.trim();
    if (!deviceId || deviceId === trimmedDeviceId) continue;
    const alternateResult = await tryCapture(deviceId);
    if (alternateResult) return alternateResult;
  }

  if (trimmedDeviceId) {
    const tolerantDefaultResult = await tryCapture("", { allowLiveDefaultTrack: true });
    if (tolerantDefaultResult) return tolerantDefaultResult;
  }

  if (!trimmedDeviceId) {
    const retriedDefaultResult = await tryCapture("");
    if (retriedDefaultResult) return retriedDefaultResult;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Microphone connected but did not start sending audio");
}

export async function applyPreferredAudioOutput(
  audioElement: SinkAudioElement | null | undefined,
  preferredOutputDeviceId = getPreferredAudioOutputDeviceId(),
) {
  if (!audioElement?.setSinkId) return;

  const trimmedDeviceId = preferredOutputDeviceId.trim();
  if (!trimmedDeviceId) return;

  try {
    await audioElement.setSinkId(trimmedDeviceId);
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "NotFoundError" || error.name === "AbortError")
    ) {
      clearPreferredAudioOutputDeviceId();
    }
    throw error;
  }
}
