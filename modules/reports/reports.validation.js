export function normalizeReportDate(value) {
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date=new Date(text+'T00:00:00Z');
  return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==text?'':text;
}
export const normalizeReportAgent=value=>String(value||'').trim().toUpperCase();
