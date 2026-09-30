/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from "react";
import { api, type AuthUserRecord } from "@/lib/api";
import {
  formatSessionDuration,
  formatSessionEventTime,
  getActiveSessionDurationSeconds,
  getBreakDurationSecondsForSession,
} from "@/lib/agentSession";
import {
  readLocalStorageItem,
  removeLocalStorageItem,
  readSessionStorageItem,
  readSessionStorageJson,
  removeSessionStorageItem,
  writeLocalStorageItem,
  writeSessionStorageItem,
} from "@/lib/browserStorage";
import { getBusinessDateString } from "@/lib/businessDate";
import { preloadRouteForPath } from "@/lib/routePreload";

export type UserRole = "admin" | "superadmin" | "agent" | "qc" | "seo";

export interface User {
  name: string;
  role: UserRole;
  id: string;
  extension: string;
  status?: "active" | "inactive" | "on-break" | "lunch-break" | "restroom-break" | "outbound-auto" | "follow-up" | "manual-outgoing";
  email?: string;
  sipPassword?: string;
  isLoggedIn?: boolean;
  loginTime?: string;
  logoutTime?: string;
  lastLoginAt?: string;
  lastLogoutAt?: string;
  publicLoginIp?: string;
  workstationIp?: string;
  workstationIpLastSeenAt?: string;
  lastLoginIp?: string;
  lastLoginIpIsGateway?: boolean;
  lastLoginDeviceId?: string;
  activeDuration?: string;
  breakTime?: string;
  followUpStartedAt?: string;
  followUpDuration?: string;
  incomingAccess?: boolean;
  outgoingAccess?: boolean;
  followUpAccess?: boolean;
  activeCallId?: string;
  activeCallDirection?: string;
  activeCallStartedAt?: string;
  callStateUpdatedAt?: string;
  lastCallEndedAt?: string;
  uiRefreshToken?: string;
  uiRefreshScope?: string;
  uiRefreshTriggeredAt?: string;
}

interface AuthContextType {
  user: User | null;
  login: (agentId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  updateUser: (patch: Partial<User>) => void;
}

type AuthUserWithSip = AuthUserRecord & {
  sipPassword?: string;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const DEVICE_ID_STORAGE_KEY = "attica_device_id";
const COMPUTER_IP_STORAGE_KEY = "attica_computer_ip";
const COMPUTER_IP_DETECTED_AT_STORAGE_KEY = "attica_computer_ip_detected_at";
const UI_REFRESH_SEEN_KEY = "attica_ui_refresh_seen";
const CURRENT_USER_REFRESH_MS = 15000;
const COMPUTER_IP_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const getOrCreateLoginDeviceId = () => {
  const existing = readLocalStorageItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const randomPart = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  const deviceId = `DEV-${randomPart.toUpperCase()}`;
  writeLocalStorageItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
};

const normalizeComputerIpCandidate = (value: string) => {
  const match = value.match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/);
  return match?.[0] || "";
};

const isUsableComputerIp = (value: string) => {
  const ip = normalizeComputerIpCandidate(value);
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip.endsWith(".1") || ip.endsWith(".254")) return false;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip);
};

let computerIpPromise: Promise<string> | null = null;

const detectComputerIp = () => {
  const storedIp = readLocalStorageItem(COMPUTER_IP_STORAGE_KEY) || "";
  const storedDetectedAt = Number(readLocalStorageItem(COMPUTER_IP_DETECTED_AT_STORAGE_KEY) || 0);
  if (
    isUsableComputerIp(storedIp) &&
    Number.isFinite(storedDetectedAt) &&
    Date.now() - storedDetectedAt < COMPUTER_IP_CACHE_MAX_AGE_MS
  ) {
    return Promise.resolve(storedIp);
  }
  if (storedIp) {
    removeLocalStorageItem(COMPUTER_IP_STORAGE_KEY);
    removeLocalStorageItem(COMPUTER_IP_DETECTED_AT_STORAGE_KEY);
  }
  if (computerIpPromise) return computerIpPromise;

  computerIpPromise = new Promise((resolve) => {
    if (typeof window === "undefined" || typeof window.RTCPeerConnection !== "function") {
      resolve("");
      return;
    }

    const foundIps = new Set<string>();
    const finish = (peer?: RTCPeerConnection) => {
      const localDescription = peer?.localDescription?.sdp || "";
      localDescription
        .split(/\r?\n/)
        .map(normalizeComputerIpCandidate)
        .filter(Boolean)
        .forEach((ip) => foundIps.add(ip));
      try {
        peer?.close();
      } catch {
        // Ignore cleanup errors; this detector is best-effort only.
      }
      const computerIp = Array.from(foundIps).find(isUsableComputerIp) || "";
      if (computerIp) {
        writeLocalStorageItem(COMPUTER_IP_STORAGE_KEY, computerIp);
        writeLocalStorageItem(COMPUTER_IP_DETECTED_AT_STORAGE_KEY, String(Date.now()));
      } else {
        removeLocalStorageItem(COMPUTER_IP_STORAGE_KEY);
        removeLocalStorageItem(COMPUTER_IP_DETECTED_AT_STORAGE_KEY);
        computerIpPromise = null;
      }
      resolve(computerIp);
    };

    try {
      const peer = new window.RTCPeerConnection({ iceServers: [] });
      const timer = window.setTimeout(() => finish(peer), 2500);
      peer.createDataChannel("attica-ip-check");
      peer.onicecandidate = (event) => {
        const candidateText = event.candidate?.candidate || "";
        const ip = normalizeComputerIpCandidate(candidateText);
        if (ip) foundIps.add(ip);
        const usableIp = Array.from(foundIps).find(isUsableComputerIp);
        if (usableIp) {
          window.clearTimeout(timer);
          finish(peer);
        }
      };
      void peer.createOffer()
        .then((offer) => {
          const offerIp = normalizeComputerIpCandidate(offer.sdp || "");
          if (offerIp) foundIps.add(offerIp);
          return peer.setLocalDescription(offer);
        })
        .catch(() => {
          window.clearTimeout(timer);
          finish(peer);
        });
    } catch {
      resolve("");
    }
  });

  return computerIpPromise;
};

const isStaleStoredAgentSession = (value: User | null) => {
  if (!value || value.role !== "agent" || value.isLoggedIn === false || !value.lastLoginAt) return false;
  return getBusinessDateString(value.lastLoginAt) < getBusinessDateString(new Date());
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = readSessionStorageJson<User | null>("attica_user", null);
    return isStaleStoredAgentSession(storedUser) ? null : storedUser;
  });

  useEffect(() => {
    if (user) {
      writeSessionStorageItem("attica_user", JSON.stringify(user));
    } else {
      removeSessionStorageItem("attica_user");
    }
  }, [user]);

  const userRef = useRef<User | null>(user);
  const currentUserRefreshInFlightRef = useRef(false);
  const sessionSyncInFlightRef = useRef(false);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const persistUser = (nextUser: User | null) => {
    userRef.current = nextUser;
    setUser(nextUser);
    if (nextUser) {
      writeSessionStorageItem("attica_user", JSON.stringify(nextUser));
      return;
    }
    removeSessionStorageItem("attica_user");
  };

  const updateUser = (patch: Partial<User>) => {
    setUser((current) => {
      if (!current) return current;
      const nextUser = { ...current, ...patch };
      writeSessionStorageItem("attica_user", JSON.stringify(nextUser));
      return nextUser;
    });
  };

  const mapAuthUser = (dbUser: AuthUserRecord): User => ({
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email || "",
    role: dbUser.role,
    extension: dbUser.extension || "",
    status: dbUser.status,
    sipPassword: normalizeOptionalString((dbUser as AuthUserWithSip).sipPassword),
    isLoggedIn: dbUser.isLoggedIn,
    loginTime: dbUser.loginTime,
    logoutTime: dbUser.logoutTime,
    lastLoginAt: dbUser.lastLoginAt,
    lastLogoutAt: dbUser.lastLogoutAt,
    publicLoginIp: dbUser.publicLoginIp,
    workstationIp: dbUser.workstationIp,
    workstationIpLastSeenAt: dbUser.workstationIpLastSeenAt,
    lastLoginIp: dbUser.lastLoginIp,
    lastLoginIpIsGateway: dbUser.lastLoginIpIsGateway,
    lastLoginDeviceId: dbUser.lastLoginDeviceId,
    activeDuration: dbUser.activeDuration,
    breakTime: dbUser.breakTime,
    followUpStartedAt: dbUser.followUpStartedAt,
    followUpDuration: dbUser.followUpDuration,
    incomingAccess: dbUser.incomingAccess,
    outgoingAccess: dbUser.outgoingAccess,
    followUpAccess: dbUser.followUpAccess,
    activeCallId: dbUser.activeCallId,
    activeCallDirection: dbUser.activeCallDirection,
    activeCallStartedAt: dbUser.activeCallStartedAt,
    callStateUpdatedAt: dbUser.callStateUpdatedAt,
    lastCallEndedAt: dbUser.lastCallEndedAt,
    uiRefreshToken: dbUser.uiRefreshToken,
    uiRefreshScope: dbUser.uiRefreshScope,
    uiRefreshTriggeredAt: dbUser.uiRefreshTriggeredAt,
  });

  const syncSessionDurations = async (options?: {
    loginAtOverride?: string;
    logoutAtOverride?: string;
    forceLoggedOut?: boolean;
  }) => {
    const currentUser = userRef.current;
    if (!currentUser?.id) return null;

    const sessionStartedAt = options?.loginAtOverride || currentUser.lastLoginAt || "";
    if (!sessionStartedAt) return null;

    const sessionEndedAt = options?.logoutAtOverride || currentUser.lastLogoutAt || "";
    const effectiveLoggedIn = options?.forceLoggedOut ? false : currentUser.isLoggedIn !== false;

    try {
      const breakLogs = await api.getBreaks({ agentId: currentUser.id, limit: 80 });
      const breakDurationSeconds = getBreakDurationSecondsForSession({
        breakLogs: Array.isArray(breakLogs) ? breakLogs : [],
        agentId: currentUser.id,
        sessionStartedAt,
        sessionEndedAt: effectiveLoggedIn ? undefined : sessionEndedAt,
      });
      const activeDurationSeconds = getActiveSessionDurationSeconds({
        sessionStartedAt,
        sessionEndedAt: effectiveLoggedIn ? undefined : sessionEndedAt,
        breakDurationSeconds,
      });

      return {
        activeDuration: formatSessionDuration(activeDurationSeconds),
        breakTime: formatSessionDuration(breakDurationSeconds),
      } satisfies Pick<User, "activeDuration" | "breakTime">;
    } catch (error) {
      console.error("Session duration sync failed:", error);
      return null;
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    let ignore = false;
    const refreshCurrentUser = async () => {
      const currentUser = userRef.current;
      if (!currentUser?.id) return;
      if (currentUserRefreshInFlightRef.current) return;
      currentUserRefreshInFlightRef.current = true;
      try {
        let matched = await api.getAgent(currentUser.id);
        if (!matched) {
          const liveAgents = await api.getAgents();
          if (!Array.isArray(liveAgents) || ignore) return;
          matched = liveAgents.find((entry) => entry.id === currentUser.id) || null;
        }
        if (ignore) return;
        if (!matched) return;

        if (
          currentUser.role === "agent" &&
          currentUser.isLoggedIn !== false &&
          matched.isLoggedIn === false &&
          matched.lastLogoutAt
        ) {
          persistUser(null);
          return;
        }

        const nextUser: User = {
          id: matched.id,
          name: matched.name || currentUser.name,
          email: matched.email || currentUser.email || "",
          role: matched.role,
          extension: matched.extension || currentUser.extension || "",
          status: matched.status,
          sipPassword: currentUser.sipPassword || "",
          isLoggedIn: matched.isLoggedIn,
          loginTime: matched.loginTime,
          logoutTime: matched.logoutTime,
          lastLoginAt: matched.lastLoginAt,
          lastLogoutAt: matched.lastLogoutAt,
          publicLoginIp: matched.publicLoginIp,
          workstationIp: matched.workstationIp,
          workstationIpLastSeenAt: matched.workstationIpLastSeenAt,
          lastLoginIp: matched.lastLoginIp,
          lastLoginIpIsGateway: matched.lastLoginIpIsGateway,
          lastLoginDeviceId: matched.lastLoginDeviceId,
          activeDuration: matched.activeDuration,
          breakTime: matched.breakTime,
          followUpStartedAt: matched.followUpStartedAt,
          followUpDuration: matched.followUpDuration,
          incomingAccess: matched.incomingAccess,
          outgoingAccess: matched.outgoingAccess,
          followUpAccess: matched.followUpAccess,
          activeCallId: matched.activeCallId,
          activeCallDirection: matched.activeCallDirection,
          activeCallStartedAt: matched.activeCallStartedAt,
          callStateUpdatedAt: matched.callStateUpdatedAt,
          lastCallEndedAt: matched.lastCallEndedAt,
          uiRefreshToken: matched.uiRefreshToken,
          uiRefreshScope: matched.uiRefreshScope,
          uiRefreshTriggeredAt: matched.uiRefreshTriggeredAt,
        };

        const nextRefreshToken = matched.uiRefreshToken || "";
        const seenRefreshToken = readSessionStorageItem(UI_REFRESH_SEEN_KEY) || "";

        if (nextRefreshToken && nextRefreshToken !== seenRefreshToken) {
          writeSessionStorageItem(UI_REFRESH_SEEN_KEY, nextRefreshToken);
        }

        if (
          nextUser.name !== currentUser.name ||
          nextUser.email !== (currentUser.email || "") ||
          nextUser.role !== currentUser.role ||
          nextUser.extension !== currentUser.extension ||
          nextUser.status !== currentUser.status ||
          nextUser.isLoggedIn !== currentUser.isLoggedIn ||
          nextUser.loginTime !== currentUser.loginTime ||
          nextUser.logoutTime !== currentUser.logoutTime ||
          nextUser.lastLoginAt !== currentUser.lastLoginAt ||
          nextUser.lastLogoutAt !== currentUser.lastLogoutAt ||
          nextUser.publicLoginIp !== currentUser.publicLoginIp ||
          nextUser.workstationIp !== currentUser.workstationIp ||
          nextUser.workstationIpLastSeenAt !== currentUser.workstationIpLastSeenAt ||
          nextUser.lastLoginIp !== currentUser.lastLoginIp ||
          nextUser.lastLoginIpIsGateway !== currentUser.lastLoginIpIsGateway ||
          nextUser.lastLoginDeviceId !== currentUser.lastLoginDeviceId ||
          nextUser.activeDuration !== currentUser.activeDuration ||
          nextUser.breakTime !== currentUser.breakTime ||
          nextUser.followUpStartedAt !== currentUser.followUpStartedAt ||
          nextUser.followUpDuration !== currentUser.followUpDuration ||
          nextUser.incomingAccess !== currentUser.incomingAccess ||
          nextUser.outgoingAccess !== currentUser.outgoingAccess ||
          nextUser.followUpAccess !== currentUser.followUpAccess ||
          nextUser.activeCallId !== currentUser.activeCallId ||
          nextUser.activeCallDirection !== currentUser.activeCallDirection ||
          nextUser.activeCallStartedAt !== currentUser.activeCallStartedAt ||
          nextUser.callStateUpdatedAt !== currentUser.callStateUpdatedAt ||
          nextUser.lastCallEndedAt !== currentUser.lastCallEndedAt ||
          nextUser.uiRefreshToken !== currentUser.uiRefreshToken ||
          nextUser.uiRefreshScope !== currentUser.uiRefreshScope ||
          nextUser.uiRefreshTriggeredAt !== currentUser.uiRefreshTriggeredAt
        ) {
          persistUser(nextUser);
        }
      } catch (error) {
        console.error("Current user refresh failed:", error);
      } finally {
        currentUserRefreshInFlightRef.current = false;
      }
    };

    void refreshCurrentUser();
    const interval = window.setInterval(() => {
      void refreshCurrentUser();
    }, CURRENT_USER_REFRESH_MS);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !user.lastLoginAt || user.isLoggedIn === false) return;
    if (isStaleStoredAgentSession(user)) {
      persistUser(null);
      return;
    }

    let ignore = false;
    const syncCurrentSession = async () => {
      if (sessionSyncInFlightRef.current) return;
      sessionSyncInFlightRef.current = true;
      try {
        const metrics = await syncSessionDurations();
        if (!metrics || ignore) return;
        const computerIp = await detectComputerIp();

        updateUser(metrics);
        await api.updateAgent(user.id, {
          isLoggedIn: true,
          loginTime: user.loginTime || formatSessionEventTime(user.lastLoginAt),
          lastLoginAt: user.lastLoginAt,
          deviceId: getOrCreateLoginDeviceId(),
          computerIp,
          activeDuration: metrics.activeDuration,
          breakTime: metrics.breakTime,
        });
      } finally {
        sessionSyncInFlightRef.current = false;
      }
    };

    void syncCurrentSession();
    const interval = window.setInterval(() => {
      void syncCurrentSession();
    }, 60000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [user?.id, user?.isLoggedIn, user?.lastLoginAt, user?.loginTime]);

  const login = async (agentId: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const id = agentId.toUpperCase().trim();
    const deviceId = getOrCreateLoginDeviceId();
    const computerIp = await detectComputerIp();

    try {
      const dbUser = await api.login(id, password, { deviceId, computerIp });
      if (dbUser?.id) {
        const loginTimestamp = new Date().toISOString();
        const loginTime = formatSessionEventTime(loginTimestamp);
        if (dbUser.uiRefreshToken) {
          writeSessionStorageItem(UI_REFRESH_SEEN_KEY, dbUser.uiRefreshToken);
        }
        await preloadRouteForPath("/");
        const nextUser = {
          ...mapAuthUser(dbUser),
          isLoggedIn: true,
          loginTime,
          logoutTime: "",
          lastLoginAt: loginTimestamp,
          lastLogoutAt: "",
          workstationIp: dbUser.workstationIp || computerIp,
          workstationIpLastSeenAt: dbUser.workstationIpLastSeenAt || (computerIp ? loginTimestamp : ""),
          lastLoginDeviceId: dbUser.lastLoginDeviceId || deviceId,
          activeDuration: "00:00:00",
          breakTime: "00:00:00",
        } satisfies User;
        persistUser(nextUser);
        userRef.current = nextUser;
        void api.updateAgent(dbUser.id, {
          isLoggedIn: true,
          loginTime,
          logoutTime: "",
          lastLoginAt: loginTimestamp,
          lastLogoutAt: "",
          deviceId,
          computerIp,
          activeDuration: "00:00:00",
          breakTime: "00:00:00",
        });
        return { success: true };
      }
    } catch (error) {
      console.error("Login request failed:", error);
      return {
        success: false,
        error: error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Backend login unavailable",
      };
    }

    return { success: false, error: "Login failed" };
  };

  const logout = () => {
    const currentUser = userRef.current;
    if (currentUser?.id) {
      const logoutTimestamp = new Date().toISOString();
      const logoutTime = formatSessionEventTime(logoutTimestamp);
      void (async () => {
        const metrics = await syncSessionDurations({
          logoutAtOverride: logoutTimestamp,
          forceLoggedOut: true,
        });
        await api.updateAgent(currentUser.id, {
          isLoggedIn: false,
          logoutTime,
          lastLogoutAt: logoutTimestamp,
          activeDuration: metrics?.activeDuration || currentUser.activeDuration || "00:00:00",
          breakTime: metrics?.breakTime || currentUser.breakTime || "00:00:00",
        });
      })();
    }
    persistUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
