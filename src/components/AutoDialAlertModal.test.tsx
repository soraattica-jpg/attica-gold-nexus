import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AutoDialAlertModal from "@/components/AutoDialAlertModal";
import type { AutoDialLeadRecord } from "@/lib/api";

const mockState = vi.hoisted(() => ({
  auth: {
    user: { role: "agent" as const },
  },
  callCenter: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("@/contexts/CallCenterContext", () => ({
  useCallCenter: () => mockState.callCenter,
}));

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
  sourceFile: "website-followup.xlsx",
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

describe("AutoDialAlertModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockState.callCenter = {
      autoDialAlertLead: null,
      autoDialAlertAutoConnectActive: false,
      acceptAutoDialAlert: vi.fn(),
      rejectAutoDialAlert: vi.fn(),
      snoozeAutoDialAlert: vi.fn(),
      agentStatus: "active",
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("does not render the follow-up alert while the agent is active", () => {
    mockState.callCenter = {
      ...mockState.callCenter,
      autoDialAlertLead: buildLead(),
      agentStatus: "active",
    };

    act(() => {
      root.render(<AutoDialAlertModal />);
    });

    expect(container.textContent).not.toContain("Follow-Up Call");
    expect(container.textContent).not.toContain("Priya");
  });

  it("renders the follow-up alert while the agent is in follow-up", () => {
    mockState.callCenter = {
      ...mockState.callCenter,
      autoDialAlertLead: buildLead(),
      agentStatus: "follow-up",
    };

    act(() => {
      root.render(<AutoDialAlertModal />);
    });

    expect(container.textContent).toContain("Follow-Up Call");
    expect(container.textContent).toContain("Dial Follow-Up");
    expect(container.textContent).toContain("Priya");
  });

  it("does not show the manual dial button while auto-connect is active", () => {
    mockState.callCenter = {
      ...mockState.callCenter,
      autoDialAlertLead: buildLead(),
      autoDialAlertAutoConnectActive: true,
      agentStatus: "follow-up",
    };

    act(() => {
      root.render(<AutoDialAlertModal />);
    });

    expect(container.textContent).toContain("Follow-up call is starting automatically.");
    expect(container.textContent).toContain("Auto Dialing...");
    expect(container.textContent).not.toContain("Dial Follow-Up");
  });
});
