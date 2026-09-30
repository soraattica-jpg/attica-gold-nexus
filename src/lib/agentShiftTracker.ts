import type { AgentRecord, AgentSessionRecord } from "@/lib/api";
import { BUSINESS_TIME_ZONE, getBusinessDateString } from "@/lib/businessDate";
import { toTimestamp } from "@/lib/agentSession";

export const AGENT_SHIFT_DURATION_HOURS = 9;
export const AGENT_SHIFT_DURATION_MS = AGENT_SHIFT_DURATION_HOURS * 60 * 60 * 1000;

export type AgentShiftTrackerStatus = "logged-in" | "logged-out" | "overtime" | "pending-logout";

export type AgentShiftTrackerRow = {
  id: string;
  agentId: string;
  agentName: string;
  employeeId: string;
  loginDate: string;
  loginDateKey: string;
  loginAt: string;
  loginTime: string;
  expectedLogoutAt: string;
  expectedLogoutTime: string;
  actualLogoutAt: string;
  actualLogoutTime: string;
  sessionHours: string;
  sessionDurationSeconds: number;
  workingStatus: AgentShiftTrackerStatus;
  workingStatusLabel: string;
  workingStatusClass: string;
  remarksTitle: string;
  remarksText: string;
  remarksClass: string;
  sortTimestamp: number;
};

export type AgentShiftTrackerSummary = {
  key: string;
  agentId: string;
  agentName: string;
  employeeId: string;
  loginDate: string;
  loginDateKey: string;
  firstLoginAt: string;
  firstLoginTime: string;
  lastLogoutAt: string;
  lastLogoutTime: string;
  totalSessions: number;
  totalWorkedSeconds: number;
  totalWorkedHours: string;
  sortTimestamp: number;
};

type BuildAgentShiftTrackerRowsOptions = {
  now?: number;
  today?: string;
};

const formatTrackerDate = (timestamp: number) => new Date(timestamp).toLocaleDateString("en-IN", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const formatTrackerTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString("en-IN", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export const formatWorkedDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const getStatusPresentation = (status: AgentShiftTrackerStatus) => {
  switch (status) {
    case "logged-in":
      return {
        label: "Logged In",
        className: "success-badge",
      };
    case "logged-out":
      return {
        label: "Logged Out",
        className: "done-badge",
      };
    case "overtime":
      return {
        label: "Overtime",
        className: "danger-badge",
      };
    case "pending-logout":
    default:
      return {
        label: "Pending Logout",
        className: "warning-badge",
      };
  }
};

const getRemarksPresentation = (status: AgentShiftTrackerStatus) => {
  switch (status) {
    case "logged-in":
    case "pending-logout":
      return {
        title: "Logout Pending",
        text: "Agent has not logged out yet.",
        className: "warning-badge",
      };
    case "overtime":
      return {
        title: "Overtime Running",
        text: "The agent has crossed the expected logout time.",
        className: "danger-badge",
      };
    case "logged-out":
    default:
      return {
        title: "",
        text: "",
        className: "done-badge",
      };
  }
};

const getReferenceTimestamp = (session: AgentSessionRecord) => {
  const loginTimestamp = toTimestamp(session.loginAt);
  if (!Number.isNaN(loginTimestamp)) return loginTimestamp;

  const logoutTimestamp = toTimestamp(session.logoutAt);
  if (!Number.isNaN(logoutTimestamp)) return logoutTimestamp;

  const createdAtTimestamp = toTimestamp(session.createdAt);
  if (!Number.isNaN(createdAtTimestamp)) return createdAtTimestamp;

  return toTimestamp(session.updatedAt);
};

const getSessionStatus = (args: {
  now: number;
  expectedLogoutTimestamp: number;
  logoutTimestamp: number;
  sessionState: AgentSessionRecord["sessionState"];
}) => {
  const {
    now,
    expectedLogoutTimestamp,
    logoutTimestamp,
    sessionState,
  } = args;

  if (Number.isFinite(logoutTimestamp)) {
    return "logged-out" satisfies AgentShiftTrackerStatus;
  }

  if (sessionState === "logged-in") {
    return now > expectedLogoutTimestamp ? "overtime" : "logged-in";
  }

  return now > expectedLogoutTimestamp ? "pending-logout" : "logged-in";
};

export function buildAgentShiftTrackerRows(
  agents: AgentRecord[],
  sessions: AgentSessionRecord[],
  options: BuildAgentShiftTrackerRowsOptions = {},
) {
  const now = options.now ?? Date.now();
  const today = options.today || getBusinessDateString(now);
  const agentNameById = new Map(
    agents
      .filter((agent) => agent.role === "agent")
      .map((agent) => [agent.id, agent.name]),
  );

  return sessions
    .filter((session) => session.role === "agent" && Boolean(session.agentId))
    .map((session) => {
      const referenceTimestamp = getReferenceTimestamp(session);
      if (Number.isNaN(referenceTimestamp) || getBusinessDateString(referenceTimestamp) !== today) {
        return null;
      }

      const loginTimestamp = toTimestamp(session.loginAt);
      if (Number.isNaN(loginTimestamp) || getBusinessDateString(loginTimestamp) !== today) {
        return null;
      }

      const logoutTimestamp = toTimestamp(session.logoutAt);
      const expectedLogoutTimestamp = loginTimestamp + AGENT_SHIFT_DURATION_MS;
      const sessionEndTimestamp = Number.isFinite(logoutTimestamp) ? logoutTimestamp : now;
      const sessionDurationSeconds = Math.max(0, Math.floor((sessionEndTimestamp - loginTimestamp) / 1000));
      const workingStatus = getSessionStatus({
        now,
        expectedLogoutTimestamp,
        logoutTimestamp,
        sessionState: session.sessionState,
      });
      const statusPresentation = getStatusPresentation(workingStatus);
      const remarksPresentation = getRemarksPresentation(workingStatus);

      return {
        id: session.id || `${session.agentId}-${loginTimestamp}`,
        agentId: session.agentId,
        agentName: String(session.agentName || agentNameById.get(session.agentId) || session.agentId).trim(),
        employeeId: session.agentId,
        loginDate: formatTrackerDate(loginTimestamp),
        loginDateKey: getBusinessDateString(loginTimestamp),
        loginAt: new Date(loginTimestamp).toISOString(),
        loginTime: formatTrackerTime(loginTimestamp),
        expectedLogoutAt: new Date(expectedLogoutTimestamp).toISOString(),
        expectedLogoutTime: formatTrackerTime(expectedLogoutTimestamp),
        actualLogoutAt: Number.isFinite(logoutTimestamp) ? new Date(logoutTimestamp).toISOString() : "",
        actualLogoutTime: Number.isFinite(logoutTimestamp) ? formatTrackerTime(logoutTimestamp) : "",
        sessionHours: formatWorkedDuration(sessionDurationSeconds),
        sessionDurationSeconds,
        workingStatus,
        workingStatusLabel: statusPresentation.label,
        workingStatusClass: statusPresentation.className,
        remarksTitle: remarksPresentation.title,
        remarksText: remarksPresentation.text,
        remarksClass: remarksPresentation.className,
        sortTimestamp: loginTimestamp,
      } satisfies AgentShiftTrackerRow;
    })
    .filter((row): row is AgentShiftTrackerRow => Boolean(row))
    .sort((left, right) => {
      if (left.sortTimestamp !== right.sortTimestamp) {
        return left.sortTimestamp - right.sortTimestamp;
      }

      return left.agentName.localeCompare(right.agentName);
    });
}

export function buildAgentShiftTrackerSummaries(rows: AgentShiftTrackerRow[]) {
  const summaries = new Map<string, AgentShiftTrackerSummary>();

  rows.forEach((row) => {
    const key = `${row.agentId}:${row.loginDateKey}`;
    const existing = summaries.get(key);

    if (!existing) {
      summaries.set(key, {
        key,
        agentId: row.agentId,
        agentName: row.agentName,
        employeeId: row.employeeId,
        loginDate: row.loginDate,
        loginDateKey: row.loginDateKey,
        firstLoginAt: row.loginAt,
        firstLoginTime: row.loginTime,
        lastLogoutAt: row.actualLogoutAt,
        lastLogoutTime: row.actualLogoutTime,
        totalSessions: 1,
        totalWorkedSeconds: row.sessionDurationSeconds,
        totalWorkedHours: formatWorkedDuration(row.sessionDurationSeconds),
        sortTimestamp: row.sortTimestamp,
      });
      return;
    }

    existing.totalSessions += 1;
    existing.totalWorkedSeconds += row.sessionDurationSeconds;
    existing.totalWorkedHours = formatWorkedDuration(existing.totalWorkedSeconds);

    if (new Date(row.loginAt).getTime() < new Date(existing.firstLoginAt).getTime()) {
      existing.firstLoginAt = row.loginAt;
      existing.firstLoginTime = row.loginTime;
      existing.sortTimestamp = row.sortTimestamp;
    }

    const existingLogoutTimestamp = toTimestamp(existing.lastLogoutAt);
    const nextLogoutTimestamp = toTimestamp(row.actualLogoutAt);
    if (!Number.isNaN(nextLogoutTimestamp) && (Number.isNaN(existingLogoutTimestamp) || nextLogoutTimestamp > existingLogoutTimestamp)) {
      existing.lastLogoutAt = row.actualLogoutAt;
      existing.lastLogoutTime = row.actualLogoutTime;
    }
  });

  return Array.from(summaries.values()).sort((left, right) => {
    if (left.sortTimestamp !== right.sortTimestamp) {
      return left.sortTimestamp - right.sortTimestamp;
    }

    return left.agentName.localeCompare(right.agentName);
  });
}
