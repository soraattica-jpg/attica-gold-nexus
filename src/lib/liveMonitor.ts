import type { LiveCallMonitorMode } from "@/lib/api";
import { isAdminRole } from "@/lib/roles";
import {
  readSessionStorageJson,
  removeSessionStorageItem,
  writeSessionStorageItem,
} from "@/lib/browserStorage";

export const LIVE_MONITOR_PENDING_KEY = "attica_live_monitor_pending";
export const LIVE_MONITOR_PENDING_TTL_MS = 30_000;

export type PendingLiveMonitorRequest = {
  mode: LiveCallMonitorMode;
  targetAgentId?: string;
  requestedAt: string;
  expiresAt: string;
};

const isExpiredPendingRequest = (request: PendingLiveMonitorRequest) => {
  const expiresAt = new Date(request.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
};

export const clearPendingLiveMonitorRequest = () => {
  removeSessionStorageItem(LIVE_MONITOR_PENDING_KEY);
};

export const getPendingLiveMonitorRequest = () => {
  const request = readSessionStorageJson<PendingLiveMonitorRequest | null>(LIVE_MONITOR_PENDING_KEY, null);
  if (!request) return null;
  if (isExpiredPendingRequest(request)) {
    clearPendingLiveMonitorRequest();
    return null;
  }
  return request;
};

export const queuePendingLiveMonitorRequest = (
  payload: { mode: LiveCallMonitorMode; targetAgentId?: string },
  ttlMs = LIVE_MONITOR_PENDING_TTL_MS,
) => {
  const now = Date.now();
  const safeTtl = Math.max(1_000, Math.floor(ttlMs));
  const nextRequest: PendingLiveMonitorRequest = {
    mode: payload.mode,
    targetAgentId: payload.targetAgentId?.trim() || undefined,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + safeTtl).toISOString(),
  };

  writeSessionStorageItem(LIVE_MONITOR_PENDING_KEY, JSON.stringify(nextRequest));
  return nextRequest;
};

export const consumePendingLiveMonitorRequest = () => {
  const request = getPendingLiveMonitorRequest();
  if (!request) return null;
  clearPendingLiveMonitorRequest();
  return request;
};

export const shouldRejectUnmatchedAdminSipInvite = (
  role: string | null | undefined,
  pendingRequest: PendingLiveMonitorRequest | null,
) => isAdminRole(role) && !pendingRequest;
