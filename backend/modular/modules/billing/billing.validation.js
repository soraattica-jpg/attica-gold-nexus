export const truthy = (value, extra = []) => [
  '1',
  'true',
  'yes',
  ...extra,
].includes(String(value || '').trim().toLowerCase());

export function boundedLimit(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(1, Math.min(maximum, Number.isFinite(parsed) && parsed > 0 ? parsed : fallback));
}
