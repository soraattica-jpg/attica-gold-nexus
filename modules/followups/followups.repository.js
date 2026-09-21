export function createFollowupsRepository(adapters) {
  const required = ['expire','list','serialize','loadRnrDisconnected','save','update','statusList','serializeStatus','statusUpdate'];
  for (const key of required) if (typeof adapters?.[key] !== 'function') throw new Error(`Follow-ups adapter missing: ${key}`);
  return adapters;
}
