import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAudioOnlyConstraints,
  ensureUsableAudioInputStream,
  getPreferredAudioInputDeviceId,
  getPreferredAudioStream,
  setPreferredAudioInputDeviceId,
  waitForUsableAudioTrack,
} from "@/lib/audioDevices";

describe("audioDevices", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the preferred audio input device id", () => {
    setPreferredAudioInputDeviceId("mic-42");
    expect(getPreferredAudioInputDeviceId()).toBe("mic-42");
  });

  it("builds audio constraints with the selected device id", () => {
    expect(buildAudioOnlyConstraints("mic-7")).toEqual({
      audio: {
        deviceId: { exact: "mic-7" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  });

  it("falls back to the default microphone when the saved device is gone", async () => {
    const fallbackStream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Missing device", "NotFoundError"))
      .mockResolvedValueOnce(fallbackStream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    setPreferredAudioInputDeviceId("missing-mic");

    await expect(getPreferredAudioStream("missing-mic")).resolves.toBe(fallbackStream);
    expect(getPreferredAudioInputDeviceId()).toBe("");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[0][0]).toEqual({
      audio: {
        deviceId: { exact: "missing-mic" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    expect(getUserMedia.mock.calls[1][0]).toEqual({
      audio: {
        deviceId: undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  });

  it("waits for an audio track to unmute before using it", async () => {
    class FakeAudioTrack extends EventTarget {
      kind = "audio";
      muted = true;
      readyState: MediaStreamTrackState = "live";
      stop = vi.fn();
    }

    const track = new FakeAudioTrack();
    const waitPromise = waitForUsableAudioTrack(track as unknown as MediaStreamTrack, 60);

    window.setTimeout(() => {
      track.muted = false;
      track.dispatchEvent(new Event("unmute"));
    }, 10);

    await expect(waitPromise).resolves.toBe(true);
  });

  it("falls back to the browser default microphone when the preferred track never starts", async () => {
    class FakeAudioTrack extends EventTarget {
      kind = "audio";
      muted: boolean;
      readyState: MediaStreamTrackState = "live";
      stop = vi.fn();

      constructor(muted: boolean) {
        super();
        this.muted = muted;
      }
    }

    const stalledTrack = new FakeAudioTrack(true);
    const stalledStream = {
      getTracks: () => [stalledTrack],
      getAudioTracks: () => [stalledTrack],
    } as unknown as MediaStream;

    const healthyTrack = new FakeAudioTrack(false);
    const healthyStream = {
      getTracks: () => [healthyTrack],
      getAudioTracks: () => [healthyTrack],
    } as unknown as MediaStream;

    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(stalledStream)
      .mockResolvedValueOnce(healthyStream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const result = await ensureUsableAudioInputStream("preferred-mic", 20);

    expect(result).toMatchObject({
      stream: healthyStream,
      usedFallbackDevice: true,
      resolvedDeviceId: "",
    });
    expect(stalledTrack.stop).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[0][0]).toEqual({
      audio: {
        deviceId: { exact: "preferred-mic" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    expect(getUserMedia.mock.calls[1][0]).toEqual({
      audio: {
        deviceId: undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  });

  it("accepts a live default microphone track after a preferred device stalls", async () => {
    class FakeAudioTrack extends EventTarget {
      kind = "audio";
      muted: boolean;
      readyState: MediaStreamTrackState = "live";
      stop = vi.fn();

      constructor(muted: boolean) {
        super();
        this.muted = muted;
      }
    }

    const stalledPreferredTrack = new FakeAudioTrack(true);
    const stalledPreferredStream = {
      getTracks: () => [stalledPreferredTrack],
      getAudioTracks: () => [stalledPreferredTrack],
    } as unknown as MediaStream;

    const stalledDefaultTrack = new FakeAudioTrack(true);
    const stalledDefaultStream = {
      getTracks: () => [stalledDefaultTrack],
      getAudioTracks: () => [stalledDefaultTrack],
    } as unknown as MediaStream;

    const liveDefaultTrack = new FakeAudioTrack(true);
    const liveDefaultStream = {
      getTracks: () => [liveDefaultTrack],
      getAudioTracks: () => [liveDefaultTrack],
    } as unknown as MediaStream;

    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(stalledPreferredStream)
      .mockResolvedValueOnce(stalledDefaultStream)
      .mockResolvedValueOnce(liveDefaultStream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    await expect(ensureUsableAudioInputStream("preferred-mic", 20)).resolves.toMatchObject({
      stream: liveDefaultStream,
      usedFallbackDevice: true,
      resolvedDeviceId: "",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(stalledPreferredTrack.stop).toHaveBeenCalledTimes(1);
    expect(stalledDefaultTrack.stop).toHaveBeenCalledTimes(1);
    expect(liveDefaultTrack.stop).not.toHaveBeenCalled();
  });

  it("retries the browser default microphone when the first default track stays muted during warm-up", async () => {
    class FakeAudioTrack extends EventTarget {
      kind = "audio";
      muted: boolean;
      readyState: MediaStreamTrackState = "live";
      stop = vi.fn();

      constructor(muted: boolean) {
        super();
        this.muted = muted;
      }
    }

    const stalledTrack = new FakeAudioTrack(true);
    const stalledStream = {
      getTracks: () => [stalledTrack],
      getAudioTracks: () => [stalledTrack],
    } as unknown as MediaStream;

    const healthyTrack = new FakeAudioTrack(false);
    const healthyStream = {
      getTracks: () => [healthyTrack],
      getAudioTracks: () => [healthyTrack],
    } as unknown as MediaStream;

    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(stalledStream)
      .mockResolvedValueOnce(healthyStream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    await expect(ensureUsableAudioInputStream("", 20)).resolves.toMatchObject({
      stream: healthyStream,
      usedFallbackDevice: false,
      resolvedDeviceId: "",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(stalledTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("tries another detected microphone when the preferred and default inputs stay muted", async () => {
    class FakeAudioTrack extends EventTarget {
      kind = "audio";
      muted: boolean;
      readyState: MediaStreamTrackState = "live";
      stop = vi.fn();

      constructor(muted: boolean) {
        super();
        this.muted = muted;
      }

      getSettings() {
        return { deviceId: this.muted ? "" : "usb-mic" };
      }
    }

    const stalledPreferredTrack = new FakeAudioTrack(true);
    const stalledPreferredStream = {
      getTracks: () => [stalledPreferredTrack],
      getAudioTracks: () => [stalledPreferredTrack],
    } as unknown as MediaStream;

    const stalledDefaultTrack = new FakeAudioTrack(true);
    const stalledDefaultStream = {
      getTracks: () => [stalledDefaultTrack],
      getAudioTracks: () => [stalledDefaultTrack],
    } as unknown as MediaStream;

    const healthyTrack = new FakeAudioTrack(false);
    const healthyStream = {
      getTracks: () => [healthyTrack],
      getAudioTracks: () => [healthyTrack],
    } as unknown as MediaStream;

    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(stalledPreferredStream)
      .mockResolvedValueOnce(stalledDefaultStream)
      .mockResolvedValueOnce(healthyStream);
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: "audioinput", deviceId: "preferred-mic" },
      { kind: "audioinput", deviceId: "usb-mic" },
    ] as MediaDeviceInfo[]);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });

    await expect(ensureUsableAudioInputStream("preferred-mic", 20)).resolves.toMatchObject({
      stream: healthyStream,
      usedFallbackDevice: true,
      resolvedDeviceId: "usb-mic",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(stalledPreferredTrack.stop).toHaveBeenCalledTimes(1);
    expect(stalledDefaultTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("rejects a muted default microphone when no healthy input can be found", async () => {
    class FakeAudioTrack extends EventTarget {
      kind = "audio";
      muted = true;
      readyState: MediaStreamTrackState = "live";
      stop = vi.fn();
    }

    const stalledTrack = new FakeAudioTrack();
    const stalledStream = {
      getTracks: () => [stalledTrack],
      getAudioTracks: () => [stalledTrack],
    } as unknown as MediaStream;

    const getUserMedia = vi.fn().mockResolvedValue(stalledStream);
    const enumerateDevices = vi.fn().mockResolvedValue([] as MediaDeviceInfo[]);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });

    await expect(ensureUsableAudioInputStream("", 20)).rejects.toThrow(
      "Microphone connected but did not start sending audio",
    );
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(stalledTrack.stop).toHaveBeenCalledTimes(2);
  });
});
