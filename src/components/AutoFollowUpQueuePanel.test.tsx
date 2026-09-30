import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AutoFollowUpQueuePanel from "@/components/AutoFollowUpQueuePanel";
import type { AutoDialLeadRecord } from "@/lib/api";

const mockState = vi.hoisted(() => ({
  auth: {
    user: { id: "AG001", role: "agent" as const },
  },
  callCenter: {} as Record<string, unknown>,
  api: {
    getAutoDialLeadsSnapshot: vi.fn(),
    getAutoDialControl: vi.fn(),
    getIntakeFormHistory: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("@/contexts/CallCenterContext", () => ({
  useCallCenter: () => mockState.callCenter,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: mockState.api,
  };
});

const buildLead = (overrides: Partial<AutoDialLeadRecord> = {}): AutoDialLeadRecord => ({
  id: "AUTO-1",
  customerName: "Priya",
  mobileNumber: "9876543210",
  area: "JP Nagar",
  state: "Karnataka",
  language: "Kannada",
  goldWeight: "28",
  type: "Release",
  sourceState: "Karnataka",
  preferredLanguage: "Kannada",
  status: "pending",
  assignedAgentId: "",
  assignedAgentName: "",
  scheduledAgentId: "",
  scheduledAgentName: "",
  sourceFile: "auto follow-up.xlsx",
  callId: "",
  assignedAt: "",
  dialStartedAt: "",
  completedAt: "",
  scheduledFor: "",
  lastError: "",
  queueExitReason: "",
  retryAllowed: true,
  createdAt: "2026-04-22T10:00:00.000Z",
  updatedAt: "2026-04-22T10:00:00.000Z",
  ...overrides,
});

describe("AutoFollowUpQueuePanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockState.callCenter = {
      callPhase: "idle",
      callWrapUpPending: false,
      currentAutoDialLead: null,
      queuedAutoDialLead: null,
      agentStatus: "follow-up",
      sipRegistered: true,
      sipStatusReason: "",
      loadAutoDialLeadIntoDialer: vi.fn().mockResolvedValue(true),
    };
    mockState.api.getAutoDialLeadsSnapshot.mockResolvedValue({
      ok: true,
      data: [],
    });
    mockState.api.getAutoDialControl.mockResolvedValue({
      enabled: true,
      freshLeadAutoConnectEnabled: false,
      freshLeadAutoConnectIntervalSeconds: 10,
    });
    mockState.api.getIntakeFormHistory.mockResolvedValue({ results: [] });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("shows only eligible auto follow-up queue rows", async () => {
    mockState.api.getAutoDialLeadsSnapshot.mockResolvedValue({
      ok: true,
      data: [
        buildLead(),
        buildLead({
          id: "AUTO-2",
          customerName: "Future Lead",
          scheduledFor: "2099-04-22T12:00:00.000Z",
        }),
        buildLead({
          id: "AUTO-3",
          customerName: "Closed Lead",
          status: "failed",
          queueExitReason: "Wrong Number",
        }),
        buildLead({
          id: "AUTO-4",
          customerName: "Other Agent",
          status: "assigned",
          assignedAgentId: "AG010",
        }),
      ],
    });

    await act(async () => {
      root.render(<AutoFollowUpQueuePanel />);
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Follow-Up Queue");
    expect(container.textContent).toContain("Priya");
    expect(container.textContent).toContain("28");
    expect(container.textContent).toContain("JP Nagar, Karnataka");
    expect(container.textContent).toContain("Follow-Up");
    expect(container.textContent).not.toContain("Future Lead");
    expect(container.textContent).not.toContain("Closed Lead");
    expect(container.textContent).not.toContain("Other Agent");
  });

  it("falls back to the global queue when the agent-scoped queue is empty", async () => {
    mockState.api.getAutoDialLeadsSnapshot
      .mockResolvedValueOnce({
        ok: true,
        data: [],
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [
          buildLead({
            id: "AUTO-GLOBAL",
            customerName: "Global Ready Lead",
            scheduledAgentId: "",
            assignedAgentId: "",
          }),
          buildLead({
            id: "AUTO-SCHEDULED",
            customerName: "Scheduled Offline Lead",
            scheduledAgentId: "AG010",
            assignedAgentId: "",
          }),
          buildLead({
            id: "AUTO-OTHER",
            customerName: "Other Reserved Lead",
            status: "assigned",
            scheduledAgentId: "AG010",
            assignedAgentId: "AG010",
          }),
        ],
      });

    await act(async () => {
      root.render(<AutoFollowUpQueuePanel />);
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.getAutoDialLeadsSnapshot).toHaveBeenNthCalledWith(1, { agentId: "AG001", readyOnly: true, workMode: "follow-up" });
    expect(mockState.api.getAutoDialLeadsSnapshot).toHaveBeenNthCalledWith(2, { readyOnly: true, workMode: "follow-up" });
    expect(container.textContent).toContain("Global Ready Lead");
    expect(container.textContent).toContain("Scheduled Offline Lead");
    expect(container.textContent).not.toContain("Other Reserved Lead");
  });

  it("loads the selected queue row into the dialer flow", async () => {
    const loadAutoDialLeadIntoDialer = vi.fn().mockResolvedValue(true);
    const lead = buildLead({
      id: "AUTO-9",
      customerName: "Loaded Lead",
      mobileNumber: "9000011111",
    });
    mockState.callCenter = {
      ...mockState.callCenter,
      loadAutoDialLeadIntoDialer,
    };
    mockState.api.getAutoDialLeadsSnapshot.mockResolvedValue({
      ok: true,
      data: [lead],
    });

    await act(async () => {
      root.render(<AutoFollowUpQueuePanel />);
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const callNowButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Call Now"));

    if (!callNowButton) {
      throw new Error("Call Now button not found");
    }

    await act(async () => {
      callNowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(loadAutoDialLeadIntoDialer).toHaveBeenCalledTimes(1);
    expect(loadAutoDialLeadIntoDialer).toHaveBeenCalledWith(expect.objectContaining({
      id: "AUTO-9",
      mobileNumber: "9000011111",
    }));
  });

  it("disables the follow-up manual dial button when auto-connect is enabled", async () => {
    mockState.api.getAutoDialControl.mockResolvedValue({
      enabled: true,
      freshLeadAutoConnectEnabled: true,
      freshLeadAutoConnectIntervalSeconds: 10,
    });
    mockState.api.getAutoDialLeadsSnapshot.mockResolvedValue({
      ok: true,
      data: [buildLead()],
    });

    await act(async () => {
      root.render(<AutoFollowUpQueuePanel />);
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const autoCallButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Auto Calling"));

    expect(container.textContent).toContain("Auto Calling Enabled");
    expect(autoCallButton).toBeTruthy();
    expect(autoCallButton).toBeDisabled();
    expect(container.textContent).not.toContain("Call Now");
  });
});
