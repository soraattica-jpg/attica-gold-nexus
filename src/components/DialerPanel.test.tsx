import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import DialerPanel from "@/components/DialerPanel";
import type { ManagedCall } from "@/contexts/CallCenterContext";

const mockState = vi.hoisted(() => ({
  auth: {
    user: { role: "agent" },
  },
  callCenter: {} as Record<string, unknown>,
  customerIntakeShouldThrow: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("@/contexts/CallCenterContext", () => ({
  useCallCenter: () => mockState.callCenter,
}));

vi.mock("@/components/CustomerIntakeForm", () => ({
  default: () => {
    if (mockState.customerIntakeShouldThrow) {
      throw new Error("Customer intake render failed");
    }

    return <div data-testid="customer-intake-form">Customer Intake Form</div>;
  },
  IsolatedCustomerIntakeForm: (props: { onSave?: (call?: Partial<ManagedCall>) => void }) => {
    if (mockState.customerIntakeShouldThrow) {
      throw new Error("Customer intake render failed");
    }

    return (
      <button
        type="button"
        data-testid="customer-intake-form"
        onClick={() => props.onSave?.({ id: "CALL-1", status: "active" })}
      >
        Customer Intake Form
      </button>
    );
  },
}));

const buildCall = (overrides: Partial<ManagedCall> = {}): ManagedCall => ({
  id: "CALL-1",
  callerId: "9876543210",
  callerName: "Customer",
  customerName: "Customer",
  displayCustomerName: "Customer",
  agentId: "AG001",
  agentName: "Agent 1",
  direction: "outgoing",
  status: "active",
  duration: "00:00",
  time: "10:00",
  date: "2026-04-18",
  language: "",
  hasRecording: true,
  ringStartedAt: "2026-04-18T10:00:00.000Z",
  answeredAt: "2026-04-18T10:00:05.000Z",
  endedAt: "",
  talkDurationSeconds: 0,
  branch: "",
  place: "",
  purpose: "Outbound",
  callbackStatus: "",
  followUpFlag: false,
  leadSource: "",
  mob2: "",
  district: "",
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
  statusFollowUpAt: "",
  notes: "",
  smsSent: false,
  createdAt: "2026-04-18T10:00:00.000Z",
  ...overrides,
});

const buildCallCenterMock = (overrides: Record<string, unknown> = {}) => ({
  dialedNumber: "",
  appendDigit: vi.fn(),
  clearDialedNumber: vi.fn(),
  setDialedNumber: vi.fn(),
  startCall: vi.fn(),
  endCall: vi.fn(),
  callPhase: "idle",
  callTimer: "00:00",
  toggleMute: vi.fn(),
  toggleHold: vi.fn(),
  isMuted: false,
  isOnHold: false,
  calls: [],
  callWrapUpPending: false,
  completeCallWrapUp: vi.fn(),
  currentAutoDialLead: null,
  transferCurrentCall: vi.fn().mockResolvedValue(true),
  startConferenceCall: vi.fn().mockResolvedValue(true),
  getFinalizedCallSnapshot: vi.fn(() => null),
  getLiveCallSnapshot: vi.fn(() => null),
  agentStatus: "active",
  agentStatusTimer: "00:00",
  setAgentWorkStatus: vi.fn(),
  ...overrides,
});

describe("DialerPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockState.auth = {
      user: { id: "AG001", role: "agent" },
    };
    mockState.callCenter = buildCallCenterMock();
    mockState.customerIntakeShouldThrow = false;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders safely when dialed number and call entries are malformed", () => {
    mockState.callCenter = buildCallCenterMock({
      dialedNumber: null,
      calls: [
        null,
        buildCall({ id: "CALL-2", status: "completed" }),
      ],
    });

    act(() => {
      root.render(<DialerPanel />);
    });

    expect(container.textContent).toContain("Dialer");
    expect((container.querySelector('input[placeholder="Type or tap digits"]') as HTMLInputElement | null)?.value).toBe("");
    expect(container.textContent).toContain("Call");
  });

  it("accepts agent phone input events while keeping the number visually masked", () => {
    const setDialedNumber = vi.fn();
    mockState.callCenter = buildCallCenterMock({ setDialedNumber });

    act(() => {
      root.render(<DialerPanel />);
    });

    const input = container.querySelector('input[aria-label="Phone number"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.type).toBe("password");

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "987-65a#");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(setDialedNumber).toHaveBeenCalledWith("98765#");
  });

  it("keeps the latest completed call timing visible after the dialer returns to idle", () => {
    mockState.callCenter = buildCallCenterMock({
      calls: [buildCall({
        status: "completed",
        duration: "00:33",
        talkDurationSeconds: 33,
        ringStartedAt: "2026-09-15T06:11:38.000Z",
        answeredAt: "2026-09-15T06:11:49.000Z",
        endedAt: "2026-09-15T06:12:22.000Z",
      })],
      callPhase: "idle",
      callTimer: "00:00",
      agentStatusTimer: "02:15",
    });

    act(() => {
      root.render(<DialerPanel />);
    });

    expect(container.textContent).toContain("Talk Time00:33");
    expect(container.textContent).toContain("Idle Time02:15");
    expect(container.textContent).toContain("Call Start11:41:38 am");
    expect(container.textContent).toContain("Connected11:41:49 am");
    expect(container.textContent).toContain("Call End11:42:22 am");
  });

  it("keeps dial controls rendered when the intake form crashes", () => {
    mockState.callCenter = buildCallCenterMock({
      dialedNumber: "9876543210",
      callPhase: "connected",
      calls: [buildCall()],
    });
    mockState.customerIntakeShouldThrow = true;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    act(() => {
      root.render(<DialerPanel />);
    });

    expect(container.textContent).toContain("Dialer");
    expect(container.textContent).toContain("Call form failed to render");
    expect(container.textContent).toContain("End Call");

    consoleErrorSpy.mockRestore();
  });

  it("closes the outgoing intake overlay after a successful submit while the call is connected", () => {
    const clearDialedNumber = vi.fn();
    const completeCallWrapUp = vi.fn();
    mockState.callCenter = buildCallCenterMock({
      dialedNumber: "9876543210",
      callPhase: "connected",
      calls: [buildCall()],
      clearDialedNumber,
      completeCallWrapUp,
    });

    act(() => {
      root.render(<DialerPanel />);
    });

    const formButton = container.querySelector('[data-testid="customer-intake-form"]') as HTMLButtonElement | null;
    expect(formButton).toBeTruthy();

    act(() => {
      formButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(completeCallWrapUp).toHaveBeenCalledTimes(1);
    expect(clearDialedNumber).toHaveBeenCalledTimes(1);
  });

  it("keeps the same outgoing intake overlay open after hangup even if the shared Wrap-Up flag is briefly stale", () => {
    const completeCallWrapUp = vi.fn();
    const connectedCall = buildCall();
    mockState.callCenter = buildCallCenterMock({
      dialedNumber: "9876543210",
      callPhase: "connected",
      calls: [connectedCall],
      completeCallWrapUp,
    });

    act(() => {
      root.render(<DialerPanel />);
    });
    expect(container.querySelector('[data-testid="customer-intake-form"]')).toBeTruthy();

    mockState.callCenter = buildCallCenterMock({
      dialedNumber: "9876543210",
      callPhase: "idle",
      callWrapUpPending: false,
      calls: [buildCall({ status: "completed", endedAt: "2026-04-18T10:00:45.000Z" })],
      completeCallWrapUp,
    });
    act(() => {
      root.render(<DialerPanel />);
    });

    expect(container.querySelector('[data-testid="customer-intake-form"]')).toBeTruthy();
    expect(completeCallWrapUp).not.toHaveBeenCalled();
  });
});
