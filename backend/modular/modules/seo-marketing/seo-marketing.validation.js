const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeReportDate(value) {
  const date = String(value ?? '').trim();
  if (!DATE_PATTERN.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? '' : date;
}

export function nextReportDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function getKolkataDateRange(query = {}, fallbackDate) {
  const fallback = normalizeReportDate(fallbackDate);
  const endDate = normalizeReportDate(query.endDate || query.to || query.dateTo) || fallback;
  const startDate = normalizeReportDate(query.startDate || query.from || query.dateFrom) || endDate;
  if (!startDate || !endDate || startDate > endDate) {
    const error = new Error('Invalid SEO/Marketing date range');
    error.status = 400;
    throw error;
  }
  return {
    startDate,
    endDate,
    startDateTime: `${startDate} 00:00:00`,
    endDateTime: `${nextReportDate(endDate)} 00:00:00`,
    timeZone: 'Asia/Kolkata',
  };
}

export function normalizeSeoMarketingQuery(query = {}, fallbackDate) {
  const range = getKolkataDateRange(query, fallbackDate);
  return {
    ...query,
    startDate: range.startDate,
    endDate: range.endDate,
    page: Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1),
    limit: Math.min(100, Math.max(1, Number.parseInt(String(query.limit || '50'), 10) || 50)),
  };
}
