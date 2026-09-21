export function normalizeIndianPhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return digits.slice(-10);
}
