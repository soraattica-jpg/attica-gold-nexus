const MIN_AUDIO_WAV_BYTES = 45;
const AUDIO_CONTENT_TYPE_PATTERN = /^audio\//i;
const GENERIC_BINARY_CONTENT_TYPE_PATTERN = /^(application\/octet-stream\b|binary\/octet-stream\b)/i;
const KNOWN_NON_AUDIO_CONTENT_TYPE_PATTERN = /^(text\/html\b|text\/plain\b|application\/json\b|text\/json\b|application\/problem\+json\b|application\/xml\b|text\/xml\b)/i;

const hasPrefix = (bytes: Uint8Array, prefix: number[]) => (
  prefix.every((value, index) => bytes[index] === value)
);

export const hasLikelyAudioHeader = (bytes: Uint8Array) => {
  if (bytes.length >= 12) {
    const riff = hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]);
    const wave = hasPrefix(bytes.slice(8), [0x57, 0x41, 0x56, 0x45]);
    if (riff && wave) return true;
  }

  if (bytes.length >= 4 && hasPrefix(bytes, [0x4f, 0x67, 0x67, 0x53])) {
    return true;
  }

  if (bytes.length >= 3 && hasPrefix(bytes, [0x49, 0x44, 0x33])) {
    return true;
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return true;
  }

  return false;
};

const getContentType = (value?: string | null) => String(value || "").split(";")[0].trim().toLowerCase();

export const isLikelyAudioContentType = (contentType?: string | null) => {
  const normalized = getContentType(contentType);
  if (!normalized) return null;
  if (AUDIO_CONTENT_TYPE_PATTERN.test(normalized)) return true;
  if (GENERIC_BINARY_CONTENT_TYPE_PATTERN.test(normalized)) return null;
  if (KNOWN_NON_AUDIO_CONTENT_TYPE_PATTERN.test(normalized)) return false;
  return null;
};

export const isLikelyAudioBlob = async (blob: Blob) => {
  if (blob.size < MIN_AUDIO_WAV_BYTES) {
    return false;
  }

  const blobTypeHint = isLikelyAudioContentType(blob.type);
  if (blobTypeHint === true) {
    return true;
  }
  if (blobTypeHint === false) {
    return false;
  }

  try {
    const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    return hasLikelyAudioHeader(header);
  } catch {
    return false;
  }
};

export async function fetchPlayableRecordingBlob(
  candidates: string[],
  options?: {
    credentials?: RequestCredentials;
  },
) {
  const credentials = options?.credentials ?? "same-origin";

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { credentials });
      if (!response.ok) continue;

      const responseTypeHint = isLikelyAudioContentType(response.headers.get("content-type"));
      if (responseTypeHint === false) {
        continue;
      }

      const blob = await response.blob();
      if (!(await isLikelyAudioBlob(blob))) {
        continue;
      }

      return blob;
    } catch (error) {
      console.error(`Recording fetch failed for ${candidate}:`, error);
    }
  }

  return null;
}
