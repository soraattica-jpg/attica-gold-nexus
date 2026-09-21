// Preserves the legacy cleanJustDialString semantics for extracted features.
export function cleanString(value, max = 255) {
  if (value === null || value === undefined) return '';
  let next = String(value).trim().replace(/[\x00-\x1F\x7F]/g, '');
  if (next.length > max) next = next.slice(0, max);
  return next;
}
