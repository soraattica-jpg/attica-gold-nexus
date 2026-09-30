import { describe, expect, it, vi } from "vitest";
import { canRebuildSipClient, observeSipRegistration, type SipRegistrationSource } from "./sipRegistration";

function registration() {
  const listeners = new Set<(state: string) => void>();
  const source: SipRegistrationSource = {
    state: "Initial",
    stateChange: { addListener: fn => { listeners.add(fn); }, removeListener: fn => { listeners.delete(fn); } },
  };
  return { source, listeners, emit: (state: string) => { source.state = state; listeners.forEach(fn => fn(state)); } };
}

describe("SIP registration confirmation", () => {
  it("does not report online just because REGISTER was submitted", async () => {
    const { source, emit } = registration();
    const changed = vi.fn();
    observeSipRegistration(source, () => true, changed);
    await Promise.resolve({ request: "REGISTER" });
    expect(changed).toHaveBeenLastCalledWith(false, "Initial");
    emit("Registered");
    expect(changed).toHaveBeenLastCalledWith(true, "Registered");
  });
  it("reflects rejection and registration expiry", () => {
    const { source, emit } = registration();
    const changed = vi.fn();
    observeSipRegistration(source, () => true, changed);
    emit("Registered");
    emit("Unregistered");
    expect(changed).toHaveBeenLastCalledWith(false, "Unregistered");
  });
  it("does not call a stale registered state online while WSS is disconnected", () => {
    const { source, emit } = registration();
    const changed = vi.fn();
    let connected = false;
    const watcher = observeSipRegistration(source, () => connected, changed);
    emit("Registered");
    expect(changed).toHaveBeenLastCalledWith(false, "Registered");
    connected = true;
    watcher.refresh();
    expect(changed).toHaveBeenLastCalledWith(true, "Registered");
  });
  it("cleans up the exact listener on logout or client replacement", () => {
    const { source, emit, listeners } = registration();
    const changed = vi.fn();
    const watcher = observeSipRegistration(source, () => true, changed);
    expect(listeners.size).toBe(1);
    watcher.dispose();
    expect(listeners.size).toBe(0);
    changed.mockClear();
    emit("Terminated");
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("SIP reconnect guard", () => {
  it.each(["Initial", "Establishing", "Established", "Terminating"])("preserves a %s session", state => {
    expect(canRebuildSipClient("idle", state)).toBe(false);
  });
  it.each(["dialing", "connected"])("preserves a %s call even before the session ref arrives", phase => {
    expect(canRebuildSipClient(phase)).toBe(false);
  });
  it("permits replacement only after the phone becomes idle", () => {
    expect(canRebuildSipClient("idle", "Terminated")).toBe(true);
    expect(canRebuildSipClient("idle", null)).toBe(true);
  });
  it("does not treat an unknown session state as an idle phone", () => {
    expect(canRebuildSipClient("idle", {})).toBe(false);
    expect(canRebuildSipClient("idle", "")).toBe(false);
  });
});
