export function normalizeReportDate(value) {
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date=new Date(text+'T00:00:00Z');
  return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==text?'':text;
}
export const normalizeReportAgent=value=>String(value||'').trim().toUpperCase();
const text=(value,max)=>String(value||'').trim().replace(/[\x00-\x1F\x7F]/g,'').slice(0,max);
export function reportFilters(query={}) { return {date:normalizeReportDate(query.date),fromDate:normalizeReportDate(query.fromDate),toDate:normalizeReportDate(query.toDate),
  agentId:normalizeReportAgent(query.agent||query.agentId),direction:text(query.direction,20),status:text(query.status,40),disposition:text(query.disposition,100),
  dispositionCategory:text(query.dispositionCategory||query.disposition_category,100),source:text(query.source||query.callSource||query.leadSource,120),
  language:text(query.language,40),branch:text(query.branch,150),search:text(query.search,160)}; }
export function validateReportRange(filters){if(!filters.date&&!filters.fromDate&&!filters.toDate){const error=new Error('date, fromDate, or toDate required');error.status=400;throw error;}if(filters.fromDate&&filters.toDate&&filters.fromDate>filters.toDate){const error=new Error('fromDate must be before toDate');error.status=400;throw error;}}
