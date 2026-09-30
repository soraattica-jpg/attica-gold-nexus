import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import IncomingCallModal from "@/components/IncomingCallModal";
import type { ManagedCall } from "@/contexts/CallCenterContext";

const mockState = vi.hoisted(() => ({
  callCenter: {} as Record<string, unknown>,
  api: {
    getCustomerProfile: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "AG001", name: "Agent 1", role: "agent" } }),
}));

vi.mock("@/contexts/CallCenterContext", () => ({
  useCallCenter: () => mockState.callCenter,
}));

vi.mock("@/lib/api", () => ({
  api: mockState.api,
  buildApiUrl: (path: string) => path,
}));

vi.mock("@/components/CustomerIntakeForm", () => ({
  IsolatedCustomerIntakeForm: (props: { callId?: string }) => (
    <div data-testid="customer-intake-form" data-call-id={props.callId}>Customer Intake Form</div>
  ),
}));

const call = (overrides: Partial<ManagedCall> = {}): ManagedCall => ({
  id: "IN-CALL-1",
  intakeToken: "INTAKE-CALL-IN-CALL-1",
  callerId: "9876543210",
  callerName: "Customer",
  customerName: "Customer",
  displayCustomerName: "Customer",
  agentId: "AG001",
  agentName: "Agent 1",
  direction: "incoming",
  status: "active",
  duration: "00:00",
  time: "10:00",
  date: "2026-09-13",
  language: "",
  hasRecording: true,
  branch: "",
  place: "",
  purpose: "Inbound Enquiry",
  callbackStatus: "",
  followUpFlag: false,
  answeredAt: "2026-09-13T04:30:00.000Z",
  endedAt: "",
  talkDurationSeconds: 0,
  ...overrides,
});

const center = (overrides: Record<string, unknown> = {}) => ({
  incomingDialogOpen: true,
  incomingDraftPhone: "9876543210",
  incomingDialogCallId: "IN-CALL-1",
  answerIncoming: vi.fn().mockResolvedValue(true),
  skipIncomingLead: vi.fn(),
  endCall: vi.fn(),
  callPhase: "connected",
  calls: [call()],
  followUps: [],
  completeCallWrapUp: vi.fn(),
  addFollowUp: vi.fn(),
  closePendingFollowUpsForPhone: vi.fn(),
  syncCallRecord: vi.fn(),
  isOnHold: false,
  toggleHold: vi.fn(),
  transferCurrentCall: vi.fn(),
  startConferenceCall: vi.fn(),
  agentStatus: "active",
  getFinalizedCallSnapshot: vi.fn(() => null),
  getLiveCallSnapshot: vi.fn(() => null),
  ...overrides,
});

describe("IncomingCallModal", () => {
  let root: Root;
  let host: HTMLDivElement;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({}) })) as unknown as typeof fetch;
    mockState.api.getCustomerProfile.mockResolvedValue({});
    mockState.callCenter = center();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("keeps the same connected intake form mounted when hangup closes the SIP dialog flag", async () => {
    await act(async () => {
      root.render(<IncomingCallModal />);
      await Promise.resolve();
    });
    const beforeHangup = host.querySelector('[data-testid="customer-intake-form"]');
    expect(beforeHangup).toBeTruthy();

    const completeCallWrapUp = vi.fn();
    const skipIncomingLead = vi.fn();
    mockState.callCenter = center({
      incomingDialogOpen: false,
      incomingDraftPhone: "",
      callPhase: "idle",
      calls: [call({ status: "completed", endedAt: "2026-09-13T04:31:00.000Z", talkDurationSeconds: 60 })],
      completeCallWrapUp,
      skipIncomingLead,
    });
    await act(async () => {
      root.render(<IncomingCallModal />);
      await Promise.resolve();
    });

    const afterHangup = host.querySelector('[data-testid="customer-intake-form"]');
    expect(afterHangup).toBe(beforeHangup);
    expect(host.textContent).toContain("Call Ended");
    expect(completeCallWrapUp).not.toHaveBeenCalled();
    expect(skipIncomingLead).not.toHaveBeenCalled();
  });
});
