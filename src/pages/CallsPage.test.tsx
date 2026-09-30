import type { HTMLAttributes } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CallsPage from "@/pages/CallsPage";

const mockState = vi.hoisted(() => ({
  auth: {
    user: { id: "AG001", role: "agent" as const },
  },
  callCenter: {
    addFollowUp: vi.fn(),
    prefillDialedNumber: vi.fn(),
  },
  api: {
    getCallsList: vi.fn(),
    getCustomerProfile: vi.fn(),
    getCustomerCallHistory: vi.fn(),
    getIntakeFormHistory: vi.fn(),
    getBlockedNumbers: vi.fn(),
    getRecordings: vi.fn(),
  },
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("@/contexts/CallCenterContext", () => ({
  useCallCenter: () => mockState.callCenter,
}));

vi.mock("@/hooks/useRealBranches", () => ({
  useRealBranches: () => ({ branches: [], loading: false }),
}));

vi.mock("@/hooks/useAgentDirectory", () => ({
  useAgentDirectory: () => ({
    agents: [],
    resolveAgentName: (_agentId?: string, fallback?: string) => fallback || "—",
  }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: mockState.api,
  };
});

describe("CallsPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockState.api.getCallsList.mockResolvedValue({
      page: 1,
      limit: 30,
      total: 0,
      totalPages: 0,
      results: [],
    });
    mockState.api.getCustomerProfile.mockResolvedValue({
      phone: "",
      customerName: "",
      mob2: "",
      district: "",
      location: "",
      branch: "",
      language: "",
      businessType: "",
      metalType: "",
      grams: "",
      releasingAmount: "",
      bankName: "",
      onlinePrice: "",
      pricePerGram: "",
      advertisement: "",
      lead: "",
      formStatus: "",
      purpose: "",
      statusFollowUpAt: "",
      notes: "",
      hasSavedDetails: false,
    });
    mockState.api.getCustomerCallHistory.mockResolvedValue({
      phone: "",
      total: 0,
      results: [],
    });
    mockState.api.getIntakeFormHistory.mockResolvedValue({
      phone: "",
      total: 0,
      results: [],
    });
    mockState.api.getBlockedNumbers.mockResolvedValue([]);
    mockState.api.getRecordings.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it.each([
    ["incoming" as const, "Incoming Calls"],
    ["outgoing" as const, "Outgoing Calls"],
  ])("renders the %s calls route without crashing", (direction, heading) => {
    act(() => {
      root.render(<CallsPage direction={direction} />);
    });

    expect(container.textContent).toContain(heading);
    expect(container.textContent).toContain("Filters");
  });

  it("shows the lead source in the outgoing calls table", async () => {
    mockState.api.getCallsList.mockResolvedValue({
      page: 1,
      limit: 30,
      total: 1,
      totalPages: 1,
      results: [
        {
          id: "CALL-WEB-1",
          callerId: "9876543210",
          callerName: "Web Customer",
          customerName: "Web Customer",
          agentId: "AG001",
          agentName: "Agent 1",
          direction: "outgoing",
          status: "completed",
          duration: "00:42",
          time: "10:30",
          date: "2026-04-20",
          language: "",
          hasRecording: false,
          branch: "Main Branch",
          place: "",
          purpose: "",
          callbackStatus: "Interested",
          leadSource: "Website Lead",
        },
      ],
    });

    await act(async () => {
      root.render(<CallsPage direction="outgoing" />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Source");
    expect(container.textContent).toContain("Website Lead");
  });

  it("shows the business source in the incoming calls table", async () => {
    mockState.api.getCallsList.mockResolvedValue({
      page: 1,
      limit: 30,
      total: 1,
      totalPages: 1,
      results: [
        {
          id: "CALL-IN-1",
          callerId: "9876543210",
          callerName: "Incoming Customer",
          customerName: "Incoming Customer",
          agentId: "AG001",
          agentName: "Agent 1",
          direction: "incoming",
          status: "completed",
          duration: "00:42",
          time: "10:30",
          date: "2026-04-20",
          language: "",
          hasRecording: false,
          branch: "Main Branch",
          place: "",
          purpose: "",
          callbackStatus: "Interested",
          leadSource: "Campaign Calls",
        },
      ],
    });

    await act(async () => {
      root.render(<CallsPage direction="incoming" />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Source");
    expect(container.textContent).toContain("Campaign Calls");
  });

  it("shows only the saved intake details for the selected call", async () => {
    mockState.api.getCallsList.mockResolvedValue({
      page: 1,
      limit: 30,
      total: 1,
      totalPages: 1,
      results: [
        {
          id: "CALL-EXACT",
          intakeToken: "INTAKE-CALL-CALL-EXACT",
          callerId: "9876543210",
          callerName: "",
          customerName: "",
          agentId: "AG001",
          agentName: "Agent 1",
          direction: "incoming",
          status: "completed",
          duration: "00:42",
          time: "10:30",
          date: "2026-04-20",
          language: "",
          hasRecording: false,
          branch: "",
          place: "",
          purpose: "",
          callbackStatus: "Interested",
        },
      ],
    });
    mockState.api.getIntakeFormHistory.mockResolvedValue({
      phone: "9876543210",
      total: 2,
      results: [
        {
          callId: "CALL-OTHER",
          intakeToken: "INTAKE-CALL-CALL-OTHER",
          normalizedPhone: "9876543210",
          customerName: "Wrong Customer",
          place: "Wrong City",
          district: "Wrong District",
          branch: "Wrong Branch",
          businessType: "Wrong Business",
          purpose: "Wrong Purpose",
          notes: "Wrong notes",
        },
        {
          callId: "CALL-EXACT",
          intakeToken: "INTAKE-CALL-CALL-EXACT",
          normalizedPhone: "9876543210",
          customerName: "Exact Customer",
          place: "Exact City",
          district: "Exact District",
          branch: "Exact Branch",
          businessType: "Exact Business",
          purpose: "Exact Purpose",
          notes: "Exact notes",
        },
      ],
    });

    await act(async () => {
      root.render(<CallsPage direction="incoming" />);
      await Promise.resolve();
    });

    const viewButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "View");
    expect(viewButton).toBeTruthy();

    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockState.api.getIntakeFormHistory).toHaveBeenCalledWith("9876543210");
    expect(container.textContent).toContain("Exact Customer");
    expect(container.textContent).toContain("Exact City");
    expect(container.textContent).toContain("Exact Branch");
    expect(container.textContent).toContain("Exact notes");
    expect(container.textContent).not.toContain("Wrong Customer");
    expect(container.textContent).not.toContain("Wrong City");
    expect(container.textContent).not.toContain("Wrong Branch");
    expect(container.textContent).not.toContain("Wrong notes");
  });
});
