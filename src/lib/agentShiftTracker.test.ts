import { describe, expect, it } from "vitest";

import {
  buildAgentShiftTrackerRows,
  buildAgentShiftTrackerSummaries,
} from "@/lib/agentShiftTracker";

describe("agentShiftTracker", () => {
  it("keeps all sessions for the day instead of collapsing to the latest login", () => {
    const rows = buildAgentShiftTrackerRows(
      [],
      [
        {
          id: "SES-1",
          agentId: "AG001",
          agentName: "Saranya S",
          role: "agent",
          sessionState: "logged-out",
          loginAt: "2026-04-20T08:01:00.000Z",
          logoutAt: "2026-04-20T08:10:00.000Z",
        },
        {
          id: "SES-2",
          agentId: "AG001",
          agentName: "Saranya S",
          role: "agent",
          sessionState: "logged-out",
          loginAt: "2026-04-20T08:45:00.000Z",
          logoutAt: "2026-04-20T09:30:00.000Z",
        },
      ],
      {
        now: new Date("2026-04-20T10:00:00.000Z").getTime(),
      },
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.loginTime)).toEqual(["01:31 pm", "02:15 pm"]);
    expect(rows.map((row) => row.actualLogoutTime)).toEqual(["01:40 pm", "03:00 pm"]);
    expect(rows.map((row) => row.sessionHours)).toEqual(["00:09", "00:45"]);
  });

  it("marks active sessions as overtime once they cross the 9-hour expected logout", () => {
    const rows = buildAgentShiftTrackerRows(
      [],
      [
        {
          id: "SES-3",
          agentId: "AG002",
          agentName: "Rakshitha",
          role: "agent",
          sessionState: "logged-in",
          loginAt: "2026-04-20T04:45:00.000Z",
        },
      ],
      {
        now: new Date("2026-04-20T14:00:00.000Z").getTime(),
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      loginTime: "10:15 am",
      expectedLogoutTime: "07:15 pm",
      actualLogoutTime: "",
      workingStatus: "overtime",
      workingStatusLabel: "Overtime",
      remarksTitle: "Overtime Running",
    });
  });

  it("builds daily totals from all session durations", () => {
    const rows = buildAgentShiftTrackerRows(
      [],
      [
        {
          id: "SES-1",
          agentId: "AG001",
          agentName: "Saranya S",
          role: "agent",
          sessionState: "logged-out",
          loginAt: "2026-04-20T08:01:00.000Z",
          logoutAt: "2026-04-20T08:10:00.000Z",
        },
        {
          id: "SES-2",
          agentId: "AG001",
          agentName: "Saranya S",
          role: "agent",
          sessionState: "logged-out",
          loginAt: "2026-04-20T08:45:00.000Z",
          logoutAt: "2026-04-20T09:30:00.000Z",
        },
      ],
      {
        now: new Date("2026-04-20T10:00:00.000Z").getTime(),
      },
    );

    const summaries = buildAgentShiftTrackerSummaries(rows);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      agentId: "AG001",
      firstLoginTime: "01:31 pm",
      lastLogoutTime: "03:00 pm",
      totalSessions: 2,
      totalWorkedHours: "00:54",
    });
  });
});
