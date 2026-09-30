export function getChannelCapacity(config, usage = {}) {
  const incoming = Math.max(0, Number(usage.incoming) || 0);
  const outgoing = Math.max(0, Number(usage.outgoing) || 0);
  const capacity = Math.max(1, Number(config.channels) || 1);
  const outboundLimit = Math.min(capacity, Math.max(0, Number(config.outboundChannelLimit) || capacity));
  const active = incoming + outgoing;
  return {
    capacity,
    active,
    incoming,
    outgoing,
    free: Math.max(0, capacity - active),
    outboundLimit,
    canStartOutbound: active < capacity && outgoing < outboundLimit,
  };
}
