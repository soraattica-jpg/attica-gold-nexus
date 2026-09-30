// Test-only transport. No sockets, external requests, or production recipients.
export function createTestAdminMessageSink({ limit = 100 } = {}) {
  const events = [], listeners = new Set();
  let sequence = 0;
  return {
    mode: 'test-only',
    async publish(event) {
      const next = Object.freeze({ ...event, sequence: ++sequence });
      events.push(next);
      if (events.length > limit) events.shift();
      await Promise.allSettled([...listeners].map((listener) => listener(next)));
    },
    list: () => events.map((event) => ({ ...event })),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

// Models an intake opening or an agent reconnecting. Re-read the repository,
// never replay a stale broadcast body. Call refresh on ordinary agent polling
// as well so expiry works even if no transport event is delivered.
export async function connectTestAgent({ agentId, service, sink, onMessage }) {
  let last, closed = false, pending = Promise.resolve();
  const refresh = () => {
    pending = pending.catch(() => {}).then(async () => {
      if (closed) return;
      const current = await service.current({ agentId });
      const encoded = JSON.stringify(current);
      if (!closed && encoded !== last) { await onMessage(current); last = encoded; }
    });
    return pending;
  };
  const unsubscribe = sink.subscribe(refresh);
  try { await refresh(); } catch (error) { closed = true; unsubscribe(); throw error; }
  return { refresh, close() { closed = true; unsubscribe(); } };
}
