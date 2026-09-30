import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingLiveMonitorRequest,
  consumePendingLiveMonitorRequest,
  getPendingLiveMonitorRequest,
  LIVE_MONITOR_PENDING_KEY,
  LIVE_MONITOR_PENDING_TTL_MS,
  queuePendingLiveMonitorRequest,
  shouldRejectUnmatchedAdminSipInvite,
} from "@/lib/liveMonitor";

describe("liveMonitor", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it("stores and consumes the pending live monitor request", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T13:00:00.000Z"));

    const queued = queuePendingLiveMonitorRequest({
      mode: "listen",
      targetAgentId: "AGENT42",
    }, 10_000);

    expect(getPendingLiveMonitorRequest()).toEqual(queued);
    expect(consumePendingLiveMonitorRequest()).toEqual(queued);
    expect(getPendingLiveMonitorRequest()).toBeNull();
  });

  it("uses the shared default ttl for pending live monitor requests", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T13:00:00.000Z"));

    const queued = queuePendingLiveMonitorRequest({ mode: "listen", targetAgentId: "AGENT77" });

    expect(queued.expiresAt).toBe(new Date("2026-04-17T13:00:30.000Z").toISOString());
    expect(LIVE_MONITOR_PENDING_TTL_MS).toBe(30_000);
  });

  it("drops expired pending requests", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T13:00:00.000Z"));

    queuePendingLiveMonitorRequest({ mode: "barge" }, 2_000);
    vi.advanceTimersByTime(2_001);

    expect(getPendingLiveMonitorRequest()).toBeNull();
    expect(window.sessionStorage.getItem(LIVE_MONITOR_PENDING_KEY)).toBeNull();
  });

  it("clears the pending monitor request explicitly", () => {
    queuePendingLiveMonitorRequest({ mode: "listen", targetAgentId: "AGENT11" });
    clearPendingLiveMonitorRequest();

    expect(getPendingLiveMonitorRequest()).toBeNull();
  });

  it("rejects admin SIP invites that are not tied to a pending live monitor request", () => {
    const pendingRequest = queuePendingLiveMonitorRequest({
      mode: "listen",
      targetAgentId: "AGENT42",
    });

    expect(shouldRejectUnmatchedAdminSipInvite("admin", null)).toBe(true);
    expect(shouldRejectUnmatchedAdminSipInvite("superadmin", null)).toBe(true);
    expect(shouldRejectUnmatchedAdminSipInvite("admin", pendingRequest)).toBe(false);
    expect(shouldRejectUnmatchedAdminSipInvite("agent", null)).toBe(false);
  });
});
