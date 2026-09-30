import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlayableRecordingBlob, hasLikelyAudioHeader, isLikelyAudioBlob, isLikelyAudioContentType } from "@/lib/recordingPlayback";

const buildWavBytes = () => {
  const bytes = new Uint8Array(5000);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  return bytes;
};

describe("recordingPlayback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("skips successful html responses and falls back to the next audio candidate", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<!doctype html><html><body>app shell</body></html>", {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      }))
      .mockResolvedValueOnce(new Response(buildWavBytes(), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
        },
      }));

    vi.stubGlobal("fetch", fetchMock);

    const blob = await fetchPlayableRecordingBlob(["/recordings/bad.wav", "/api/recordings/good.wav"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(blob).not.toBeNull();
    expect(blob?.size).toBe(5000);
    expect(await isLikelyAudioBlob(blob!)).toBe(true);
  });

  it("accepts generic octet-stream responses when the blob header is valid audio", async () => {
    expect(isLikelyAudioContentType("application/octet-stream")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(buildWavBytes(), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
      },
    })));

    const blob = await fetchPlayableRecordingBlob(["/api/recordings/generic.wav"], {
      credentials: "omit",
    });

    expect(blob).not.toBeNull();
    expect(blob?.size).toBe(5000);
    expect(await isLikelyAudioBlob(blob!)).toBe(true);
  });

  it("recognizes wav headers from raw bytes", () => {
    expect(hasLikelyAudioHeader(buildWavBytes())).toBe(true);
  });
});
