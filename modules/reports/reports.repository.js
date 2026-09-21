export function createReportsRepository(adapters) {
  const required=['businessDate','dashboardSummary','queueMetrics','hourly','dateRows','serializeRows','summarizeRows'];
  for(const key of required) if(typeof adapters?.[key]!=='function') throw new Error(`Reports adapter missing: ${key}`);
  return adapters;
}
