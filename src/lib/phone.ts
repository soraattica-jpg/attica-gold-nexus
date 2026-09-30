export function normalizePhoneNumber(value: string | null | undefined): string {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length > 10 && digits.startsWith("91")) {
    return digits.slice(-10);
  }

  return digits.slice(-10);
}

export function hidePhoneDisplay(
  value: string | null | undefined,
  placeholder = "Phone Hidden",
): string {
  return normalizePhoneNumber(value) ? placeholder : "";
}

export function maskPhoneNumber(
  value: string | null | undefined,
  options?: { visibleStartDigits?: number; visibleEndDigits?: number; maskChar?: string },
): string {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return "";

  const visibleStartDigits = Math.max(0, options?.visibleStartDigits ?? 0);
  const visibleEndDigits = Math.max(0, options?.visibleEndDigits ?? 0);
  const maskChar = options?.maskChar ?? "*";
  const safeVisibleEndDigits = Math.min(visibleEndDigits, Math.max(normalized.length - visibleStartDigits, 0));
  const maskCount = Math.max(normalized.length - visibleStartDigits - safeVisibleEndDigits, 0);

  if (maskCount === 0) return normalized;

  return `${normalized.slice(0, visibleStartDigits)}${maskChar.repeat(maskCount)}${normalized.slice(normalized.length - safeVisibleEndDigits)}`;
}
