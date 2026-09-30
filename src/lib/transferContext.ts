import type { TransferContextRecord } from "@/lib/api";

const TRANSFER_CONTEXT_BYPASS_WINDOW_MS = 5 * 60 * 1000;

const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

export function shouldBypassLanguageFilterForTransfer(
  transferContext: TransferContextRecord | null | undefined,
  currentExtension: string | null | undefined,
  now = Date.now(),
) {
  if (!transferContext?.isActive) return false;

  const targetExtension = normalizeOptionalString(transferContext.targetExtension);
  const normalizedCurrentExtension = normalizeOptionalString(currentExtension);
  if (!targetExtension || !normalizedCurrentExtension || targetExtension !== normalizedCurrentExtension) {
    return false;
  }

  const updatedAt = new Date(transferContext.updatedAt || transferContext.createdAt || "").getTime();
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return true;
  }

  return Math.abs(now - updatedAt) <= TRANSFER_CONTEXT_BYPASS_WINDOW_MS;
}
