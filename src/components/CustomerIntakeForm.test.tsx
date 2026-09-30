/// <reference types="node" />
import type { HTMLAttributes } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { writeFileSync } from "node:fs";

import CustomerIntakeForm from "@/components/CustomerIntakeForm";
import type { ManagedCall } from "@/contexts/CallCenterContext";

const mockState = vi.hoisted(() => {
  const api = {
    getCustomerProfile: vi.fn(),
    getIntakeFormHistory: vi.fn(),
    getTransferContext: vi.fn(),
    getLiveAgents: vi.fn(),
    getAgent: vi.fn(),
    getPlaceSuggestions: vi.fn(),
    geocodePlace: vi.fn(),
    searchNearbyBranches: vi.fn(),
    saveIntakeFormWithResult: vi.fn(),
    saveCallWithResult: vi.fn(),
    clearTransferContext: vi.fn(),
    saveTransferContext: vi.fn(),
    getIntakeWorkflow: vi.fn().mockResolvedValue(null),
    saveIntakeWorkflow: vi.fn(),
    saveCallIvrSelection: vi.fn().mockResolvedValue({success:true}),
  };

  return {
    auth: {
      user: { id: "AG001", name: "Agent 1", role: "agent" as const },
    },
    callCenter: {} as Record<string, unknown>,
    storage: {
      local: new Map<string, string>(),
      session: new Map<string, string>(),
    },
    api,
    googlePlaces: {
      getGooglePlaceSuggestions: vi.fn(),
      geocodeGoogleAddress: vi.fn(),
    },
  };
});

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

vi.mock("@/lib/api", () => ({
  api: mockState.api,
  resolveBackendUrl: (value?: string | null) => String(value || "").trim(),
}));

vi.mock("@/hooks/useRealBranches", () => ({
  useRealBranches: () => ({
    branches: [
      { id: "BTM-1", name: "BTM", city: "Bengaluru", area: "BTM", url: "https://maps.google.com/?q=BTM" },
      { id: "HSR-1", name: "HSR", city: "Bengaluru", area: "HSR", url: "https://maps.google.com/?q=HSR" },
    ],
    loading: false,
  }),
}));

vi.mock("@/components/BranchSelector", () => ({
  default: ({
    value,
    onChange,
    preferredBranches = [],
  }: {
    value?: string;
    onChange?: (value: string) => void;
    preferredBranches?: Array<{ name?: string }>;
  }) => (
    <select
      data-testid="branch-selector"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">Select Branch</option>
      {preferredBranches.map((branch) => (
        <option key={branch.name} value={branch.name}>{branch.name}</option>
      ))}
      <option value="BTM">BTM</option>
    </select>
  ),
}));

vi.mock("@/lib/browserStorage", () => ({
  readLocalStorageItem: (key: string) => mockState.storage.local.get(key) ?? null,
  readSessionStorageItem: (key: string) => mockState.storage.session.get(key) ?? null,
  writeLocalStorageItem: (key: string, value: string) => {
    mockState.storage.local.set(key, value);
  },
  writeSessionStorageItem: (key: string, value: string) => {
    mockState.storage.session.set(key, value);
  },
  removeLocalStorageItem: (key: string) => {
    mockState.storage.local.delete(key);
  },
  removeSessionStorageItem: (key: string) => {
    mockState.storage.session.delete(key);
  },
}));

vi.mock("@/lib/intakeSave", () => ({
  markIntakeFormActive: vi.fn(),
  markIntakeFormInactive: vi.fn(),
  markIntakeSaveStarted: vi.fn(),
  markIntakeSaveFinished: vi.fn(),
}));

vi.mock("@/lib/visitTimeline", () => ({
  getVisitTimelineSummary: vi.fn(() => null),
}));

vi.mock("@/lib/googlePlaces", () => ({
  getGooglePlaceSuggestions: mockState.googlePlaces.getGooglePlaceSuggestions,
  geocodeGoogleAddress: mockState.googlePlaces.geocodeGoogleAddress,
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
  addFollowUp: vi.fn(),
  closePendingFollowUpsForPhone: vi.fn(),
  followUps: [
    null,
    {
      id: "FU-1",
      customerName: "Customer",
      phone: "9876543210",
      branch: "",
      followUpAt: "2026-04-18T10:10:00.000Z",
      status: "Pending",
      agentId: "AG001",
      agentName: "Agent 1",
      notes: "",
      outcome: "",
      updatedAt: "",
      sourceCallId: "CALL-1",
      sourceStatus: "",
    },
  ],
  calls: [
    null,
    buildCall(),
  ],
  syncCallRecord: vi.fn(),
  callPhase: "connected",
  isOnHold: false,
  toggleHold: vi.fn(),
  transferCurrentCall: vi.fn().mockResolvedValue(true),
  startConferenceCall: vi.fn().mockResolvedValue(true),
  getFinalizedCallSnapshot: vi.fn(() => null),
  getLiveCallSnapshot: vi.fn(() => null),
  ...overrides,
});

const findButtonByText = (container: HTMLElement, text: string) => {
  const button = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.includes(text));
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
};

const findDispositionSelect = (container: HTMLElement, testId: string) => {
  void testId;
  findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const select = container.querySelector<HTMLSelectElement>('select[data-testid="final-disposition-select"]');
  if (!select) {
    throw new Error(`Disposition select not found: ${testId}`);
  }
  return select;
};

const findLanguageSelect = (container: HTMLElement) => {
  const select = Array.from(container.querySelectorAll("select"))
    .find((candidate) => Array.from(candidate.options).some((option) => option.value === "Kannada")
      && Array.from(candidate.options).some((option) => option.value === "Tamil")
      && Array.from(candidate.options).some((option) => option.value === "Telugu"));
  if (!select) {
    throw new Error("Language select not found");
  }
  return select as HTMLSelectElement;
};

const findGramsInput = (container: HTMLElement) => {
  const input = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'))
    .find((candidate) => candidate.placeholder === "0.00");
  if (!input) {
    throw new Error("Grams input not found");
  }
  return input;
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

describe("CustomerIntakeForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockState.storage.local.clear();
    mockState.storage.session.clear();
    mockState.callCenter = buildCallCenterMock();
    mockState.api.getCustomerProfile.mockResolvedValue({
      phone: "9876543210",
      customerName: "Customer",
      mob2: "",
      age: "34",
      gender: "Male",
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
    mockState.api.getIntakeFormHistory.mockResolvedValue({
      phone: "9876543210",
      total: 2,
      results: [
        null,
        buildCall({
          id: "CALL-OLD",
          status: "completed",
          agentName: "Agent 2",
          createdAt: "2026-04-17T10:00:00.000Z",
        }),
      ],
    });
    mockState.api.getTransferContext.mockResolvedValue(null);
    mockState.api.getLiveAgents.mockResolvedValue([]);
    mockState.api.getAgent.mockResolvedValue({ id: "AG001", adminMessage: "Please verify the customer details" });
    mockState.api.getPlaceSuggestions.mockResolvedValue([]);
    mockState.api.geocodePlace.mockResolvedValue(null);
    mockState.api.searchNearbyBranches.mockResolvedValue([]);
    mockState.googlePlaces.getGooglePlaceSuggestions.mockResolvedValue([]);
    mockState.googlePlaces.geocodeGoogleAddress.mockResolvedValue(null);
    mockState.api.saveIntakeFormWithResult.mockResolvedValue({ success: true });
    mockState.api.saveCallWithResult.mockResolvedValue({ success: true });
    mockState.api.clearTransferContext.mockResolvedValue({ success: true });
    mockState.api.saveTransferContext.mockResolvedValue({ success: true });
    mockState.api.getIntakeWorkflow.mockResolvedValue(null);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps the form open on backdrop click and Escape, then closes from the explicit close button", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<CustomerIntakeForm phone="9876543210" customerName="Customer" onClose={onClose} />);
    });
    const backdrop = container.querySelector<HTMLElement>('[data-testid="intake-modal-backdrop"]');
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(backdrop).not.toBeNull();
    expect(dialog?.className).toContain("agent-form-shell");
    expect(container.querySelector('[data-testid="intake-fixed-body"]')?.className).toContain("overflow-hidden");
    expect(container.querySelector('[data-testid="intake-fixed-body"]')?.className).not.toContain("min-h-[500px]");
    expect(container.querySelector(".agent-intake-content")?.className).toContain("overflow-hidden");
    expect(container.querySelector('[data-testid="schedule-no-scroll"]')?.className).toContain("overflow-hidden");
    expect(container.querySelector('[data-testid="intake-fixed-footer"]')?.className).toContain("h-[58px]");
    expect(container.querySelector('[data-testid="intake-fixed-footer"]')?.className).toContain("max-sm:h-[108px]");
    act(() => {
      backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    const closeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    expect(closeButton).not.toBeNull();
    act(() => closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the prototype customer order, removes legacy fields, and shows the admin message", async () => {
    await act(async () => {
      root.render(<CustomerIntakeForm phone="9876543210" customerName="Customer" />);
    });
    const customerSection = container.querySelector<HTMLElement>('[aria-labelledby="customer-information-heading"]');
    const labels = Array.from(customerSection?.querySelectorAll("label") || []).map((label) => label.textContent?.trim());
    expect(labels).toEqual([
      "Customer Name", "Gender", "Purpose of Call", "Business Type",
      "Mobile 2 / Alternate", "District", "Location / Area",
    ]);
    expect(labels).not.toContain("Date");
    expect(labels).not.toContain("Age");
    expect(container.querySelector<HTMLInputElement>('[data-testid="admin-message"]')?.readOnly).toBe(true);
    expect(container.querySelector('[data-testid="advertisement-final-field"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="history-independent-scroll"]')?.className).toContain("overflow-hidden");
    expect(container.querySelector('.intake-middle')).toBeTruthy();
    expect(container.querySelector('[data-testid="intake-fixed-body"]')?.className).toContain("grid-rows-[auto_auto_auto]");
    expect(container.querySelector('.calculations-panel')?.className).toContain("min-h-[max-content]");
    expect(container.querySelector('[data-testid="intake-row-resize-handle"]')).toBeNull();
    const procedure = container.querySelector<HTMLElement>('[data-testid="intake-procedure-stepper"]');
    expect(procedure?.textContent).toContain("Connected");
    expect(procedure?.textContent).toContain("Customer Details");
    expect(procedure?.textContent).toContain("Calculations");
    expect(procedure?.textContent).toContain("Schedule / Remarks");
    expect(procedure?.textContent).toContain("Call Ended");
    expect(procedure?.textContent).toContain("Submit");
    expect(procedure?.textContent).toContain("Disposition");
    expect(procedure?.textContent).toContain("Completed");
    expect(procedure?.querySelector('[aria-current="step"]')?.textContent).toContain("Customer Details");
  });

  it("preselects an incoming IVR language while keeping it selectable", async () => {
    await act(async () => {
      root.render(<CustomerIntakeForm phone="9876543210" direction="incoming" language="Kannada" customerName="Customer" />);
    });
    const statusBar = container.querySelector<HTMLElement>('[data-testid="call-status-bar"]');
    const languageLabel = Array.from(statusBar?.querySelectorAll("label") || [])
      .find((label) => label.textContent?.includes("Language"));
    const languageSelect = languageLabel?.parentElement?.querySelector("select");
    expect(languageLabel?.textContent).toContain("IVR");
    expect(languageSelect?.value).toBe("Kannada");
    expect(languageSelect?.disabled).toBe(false);
    expect(statusBar?.textContent).toContain("Total Call Connected");
    expect(statusBar?.textContent).toContain("Total Data Filling Time");
  });

  it("shows an editable pledge place field when Other is selected", async () => {
    await act(async () => {
      root.render(<CustomerIntakeForm phone="9876543210" businessType="Release" customerName="Customer" />);
      await Promise.resolve();
    });
    const pledgeSelect = Array.from(container.querySelectorAll<HTMLSelectElement>("select"))
      .find((select) => Array.from(select.options).some((option) => option.textContent === "Select Pledge Place"));
    expect(pledgeSelect).not.toBeUndefined();
    if (!pledgeSelect) return;
    await act(async () => {
      setSelectValue(pledgeSelect, "Other");
      await Promise.resolve();
    });
    expect(container.querySelector<HTMLInputElement>('input[placeholder="Type name"]')).not.toBeNull();
  });

  it("keeps wrap-up open after hangup without a submit countdown", async () => {
    vi.useFakeTimers();
    mockState.callCenter.endCall=vi.fn();
    const now=Date.now();
    let workflow={callId:"CALL-1",agentId:"AG001",intakeToken:"INTAKE-CALL-CALL-1",revision:0,
      confirmedEndedAt:new Date(now).toISOString(),dispositionSelectedAt:null as string | null,autoSubmitAt:new Date(now+15000).toISOString() as string | null,
      submittedAt:null as string | null,submissionMethod:null as string | null,requiresReview:[],pendingServerSave:false,
      draft:{} as Record<string,unknown>,serverNow:new Date(now).toISOString()};
    mockState.api.getIntakeWorkflow.mockImplementation(async () => ({...workflow,serverNow:new Date().toISOString()}));
    mockState.api.saveIntakeWorkflow.mockImplementation(async (payload) => {
      workflow={...workflow,draft:payload.draft,revision:workflow.revision+1,serverNow:new Date().toISOString()};
      if (!workflow.dispositionSelectedAt && payload.selectedDisposition && payload.selectedDisposition === payload.draft.callbackStatus) {
        workflow.dispositionSelectedAt=new Date().toISOString();
      }
      if(payload.action!=="draft") workflow={...workflow,submittedAt:new Date().toISOString(),submissionMethod:"automatic"};
      return {success:true,workflow};
    });
    const onClose=vi.fn();
    await act(async () => {root.render(<CustomerIntakeForm phone="9876543210" callId="CALL-1" customerName="Customer" onClose={onClose}/>);});
    expect(container.textContent).toContain("Complete the customer details, then select Submit Now.");
    expect(container.textContent).not.toContain("Auto-submit");
    if(process.env.ATTICA_INTAKE_SCREENSHOT_HTML) writeFileSync(process.env.ATTICA_INTAKE_SCREENSHOT_HTML,container.innerHTML);
    await act(async () => {await vi.advanceTimersByTimeAsync(14000);});
    await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
    expect(onClose).not.toHaveBeenCalled();
    expect(mockState.api.saveIntakeWorkflow).not.toHaveBeenCalledWith(expect.objectContaining({ action: "auto" }));
    expect(mockState.callCenter.endCall).not.toHaveBeenCalled();
  });

  it("manually submits a completed wrap-up and lets the parent close the form", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    let workflow = {
      callId: "CALL-1", agentId: "AG001", intakeToken: "INTAKE-CALL-CALL-1", revision: 0,
      confirmedEndedAt: new Date(now).toISOString(), dispositionSelectedAt: null as string | null,
      autoSubmitAt: new Date(now + 15000).toISOString() as string | null, submittedAt: null as string | null,
      submissionMethod: null as string | null, requiresReview: [], pendingServerSave: false,
      draft: {} as Record<string, unknown>, serverNow: new Date(now).toISOString(),
    };
    mockState.api.getIntakeWorkflow.mockImplementation(async () => ({ ...workflow, serverNow: new Date().toISOString() }));
    mockState.api.saveIntakeWorkflow.mockImplementation(async (payload) => {
      workflow = {
        ...workflow,
        draft: payload.draft,
        revision: workflow.revision + 1,
        autoSubmitAt: null,
        submittedAt: new Date().toISOString(),
        submissionMethod: "manual",
        serverNow: new Date().toISOString(),
      };
      return { success: true, workflow };
    });
    const onSave = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(<CustomerIntakeForm phone="9876543210" callId="CALL-1" customerName="Customer" onSave={onSave} onClose={onClose} />);
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("Auto-submit");

    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      setSelectValue(container.querySelector<HTMLSelectElement>('[data-testid="final-disposition-select"]')!, "Coming To Branch");
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Auto-submit");
  });

  it("renders safely with malformed stored draft data and malformed live call arrays", async () => {
    const malformedDraft = JSON.stringify({
      disposition: "Coming To Branch",
      form: {
        name: "Stored Customer",
        mob1: 9876543210,
        mob2: 9988,
        status: null,
        businessType: ["Release"],
        purpose: { label: "Gold Loan" },
        language: false,
        remarks: [null, 42],
        followUpAction: "broken",
        statusFollowUpPeriod: "xx",
      },
      smsSent: false,
      updatedAt: Date.now(),
    });
    mockState.storage.local.set("attica_intake_draft:outgoing:CALL-1", malformedDraft);
    mockState.storage.local.set("attica_intake_draft:outgoing:9876543210", malformedDraft);

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone={"9876543210" as unknown as string}
          callId={"CALL-1" as unknown as string}
          customerName={"Customer" as unknown as string}
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Customer Intake Form");
    expect(mockState.api.getCustomerProfile).toHaveBeenCalledWith("9876543210");

    const customerNameInput = container.querySelector('input[placeholder="Full name"]') as HTMLInputElement | null;
    expect(customerNameInput).not.toBeNull();
    if (!customerNameInput) {
      throw new Error("Customer name input not found");
    }
    expect(customerNameInput.value).toBe("Stored Customer");
    expect(container.textContent).toContain("Draft saved");
    expect(container.textContent).toContain("History");
    expect(container.textContent).not.toContain("Call form failed to render");
  });

  it("does not restore the removed lead-type control when grams change", async () => {
    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const gramsInput = findGramsInput(container);
    await act(async () => {
      setInputValue(gramsInput, "25");
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("Lead Type");
    expect(container.textContent).toContain("PLATINUM");

    await act(async () => {
      setInputValue(gramsInput, "10");
      await Promise.resolve();
    });
    expect(container.textContent).toContain("GOLD");

    await act(async () => {
      setInputValue(gramsInput, "5");
      await Promise.resolve();
    });
    expect(container.textContent).toContain("SILVER");
  });

  it("keeps lead type out of customer information", async () => {
    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.textContent).not.toContain("Lead Type");
    expect(Array.from(container.querySelectorAll("option")).some((option) => option.value === "Visited")).toBe(false);
  });

  it("binds saves to the live call once callId arrives after the form has mounted", async () => {
    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledTimes(1);
    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "CALL-1",
        intakeToken: "INTAKE-CALL-CALL-1",
      }),
    );
  });

  it("does not reuse a stale phone draft token for a new live call id", async () => {
    mockState.storage.local.set("attica_intake_draft:phone:9876543210", JSON.stringify({
      disposition: "Coming To Branch",
      form: {
        name: "Customer",
        mob1: "9876543210",
        remarks: ["previous draft"],
      },
      smsSent: false,
      resolvedCallId: "IN-OLD",
      intakeToken: "INTAKE-CALL-IN-OLD",
      updatedAt: Date.now(),
    }));

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          direction="incoming"
          callId="IN-CURRENT"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "IN-CURRENT",
        intakeToken: "INTAKE-CALL-IN-CURRENT",
      }),
    );
  });

  it("canonicalizes malformed composite call ids before saving the intake form", async () => {
    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1|9876543210|2026-04-18T13:21:00.000Z"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "CALL-1",
        intakeToken: "INTAKE-CALL-CALL-1",
      }),
    );
  });

  it("supports grouped call disposition options in the save flow", async () => {
    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Visited Sold Out");
    expect(container.textContent).toContain("Coming To Branch");
    expect(container.textContent).toContain("Planning to Visit (Date and Time)");
    expect(container.textContent).toContain("Gold Rate Enquiry - Old Gold");
    expect(container.textContent).toContain("Quotation Mismatch");
    expect(container.textContent).toContain("Silver Enquiry");
    expect(container.textContent).toContain("Diamond Enquiry");
    expect(container.textContent).toContain("Repledge Enquiry");
    expect(container.textContent).toContain("Margin Reduce Request");
    expect(container.textContent).toContain("Not Serviceable");
    expect(container.textContent).toContain("Abuse Call");
    expect(container.textContent).toContain("Pending Calls");

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Gold Rate Enquiry - Old Gold";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "CALL-1",
        callbackStatus: "Gold Rate Enquiry - Old Gold",
      }),
    );
  });

  it("loads nearby branches from a searched place and auto-selects the nearest branch", async () => {
    mockState.googlePlaces.getGooglePlaceSuggestions.mockResolvedValue([
      {
        description: "Koramangala, Bengaluru, Karnataka",
        lat: 12.9352,
        lng: 77.6245,
      },
    ]);
    mockState.api.searchNearbyBranches.mockResolvedValue([
      {
        id: "BR-1",
        name: "Koramangala Branch",
        area: "Koramangala",
        city: "Bengaluru",
        state: "Karnataka",
        distance: 2,
      },
      {
        id: "BR-2",
        name: "HSR Branch",
        area: "HSR Layout",
        city: "Bengaluru",
        state: "Karnataka",
        distance: 5,
      },
    ]);

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const locationInput = container.querySelector('input[placeholder="Area / Locality"]') as HTMLInputElement | null;
    expect(locationInput).not.toBeNull();
    if (!locationInput) {
      throw new Error("Location input not found");
    }

    await act(async () => {
      setInputValue(locationInput, "Koram");
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const suggestionButton = Array.from(container.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.includes("Koramangala, Bengaluru, Karnataka"));
    expect(suggestionButton).not.toBeUndefined();
    if (!suggestionButton) {
      throw new Error("Location suggestion not found");
    }

    await act(async () => {
      suggestionButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const districtInput = container.querySelector('input[placeholder="District"]') as HTMLInputElement | null;
    expect(districtInput?.value).toBe("Bengaluru");

    const branchSelector = container.querySelector('[data-testid="branch-selector"]') as HTMLSelectElement | null;
    expect(branchSelector?.value).toBe("Koramangala Branch");
    expect(mockState.api.searchNearbyBranches).toHaveBeenCalledWith({ lat: 12.9352, lng: 77.6245 });
    expect(container.textContent).toContain("Nearest branch Koramangala Branch (2 km) selected.");
  });

  it("ignores a second final save click while the first request is in flight", async () => {
    let resolveSave: ((value: { success: true }) => void) | null = null;
    mockState.api.saveCallWithResult.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve as (value: { success: true }) => void;
    }));

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      const saveButton = findButtonByText(container, "Save & Close Call");
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledTimes(1);

    if (!resolveSave) {
      throw new Error("Save resolver not captured");
    }

    await act(async () => {
      resolveSave({ success: true });
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  });

  it("falls back to a saved draft and closes the wrap-up when the final save returns 503 after call end", async () => {
    const onClose = vi.fn();
    mockState.callCenter = buildCallCenterMock({
      callPhase: "idle",
      calls: [
        buildCall({
          id: "CALL-1",
          status: "completed",
          duration: "00:45",
          endedAt: "2026-04-18T10:00:45.000Z",
          talkDurationSeconds: 40,
        }),
      ],
    });
    mockState.api.saveCallWithResult.mockResolvedValueOnce({ success: false, error: "Request failed (503)" });
    mockState.api.saveIntakeFormWithResult.mockResolvedValueOnce({ success: true });

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
          onClose={onClose}
          showDraftCloseButton
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledTimes(1);
    expect(mockState.api.saveIntakeFormWithResult).toHaveBeenCalledTimes(1);
    expect(mockState.api.saveIntakeFormWithResult).toHaveBeenCalledWith(expect.objectContaining({
      id: "CALL-1",
      intakeToken: "INTAKE-CALL-CALL-1",
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Final save failed on server: Request failed (503). Draft saved to server only. Reopen to retry Save to Server.",
    );

    const storedDraft = mockState.storage.local.get("attica_intake_draft:outgoing:CALL-1");
    expect(storedDraft).toBeTruthy();
    expect(JSON.parse(storedDraft || "{}")).toEqual(expect.objectContaining({
      resolvedCallId: "CALL-1",
      intakeToken: "INTAKE-CALL-CALL-1",
      finalSaveState: "server-draft-only",
      finalSaveError: "Request failed (503)",
    }));
  });

  it("reopens a pending server save draft in retry mode", async () => {
    mockState.storage.local.set("attica_intake_draft:outgoing:CALL-1", JSON.stringify({
      disposition: "Coming To Branch",
      form: {
        date: "2026-04-20",
        name: "Customer",
        mob1: "9876543210",
        mob2: "",
        age: "",
        gender: "",
        location: "",
        district: "",
        businessType: "",
        metalType: "Gold",
        grams: "",
        releasingAmount: "",
        bankName: "",
        assignedBranch: "",
        onlinePrice: "",
        pricePerGram: "",
        advertisement: "",
        lead: "Hot",
        status: "",
        purpose: "",
        language: "",
        remarks: [""],
        statusFollowUpAt: "",
        statusFollowUpDate: "",
        statusFollowUpHour: "",
        statusFollowUpMinute: "",
        statusFollowUpPeriod: "",
        followUpAction: "none",
      },
      smsSent: false,
      resolvedCallId: "CALL-1",
      intakeToken: "INTAKE-CALL-CALL-1",
      finalSaveState: "local-only",
      finalSaveError: "Unable to reserve the live call slot (503).",
      updatedAt: Date.now(),
    }));

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Saved locally only. Final server save is pending");
    expect(findButtonByText(container, "Submit Now")).toBeTruthy();
  });

  it("does not refetch intake autofill data when only live call duration changes", async () => {
    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.getCustomerProfile).toHaveBeenCalledTimes(1);
    expect(mockState.api.getIntakeFormHistory).toHaveBeenCalledTimes(1);

    mockState.callCenter = buildCallCenterMock({
      calls: [
        buildCall({
          id: "CALL-1",
          duration: "00:07",
          talkDurationSeconds: 7,
        }),
      ],
    });

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.getCustomerProfile).toHaveBeenCalledTimes(1);
    expect(mockState.api.getIntakeFormHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps richer saved intake values when the latest interaction is sparse", async () => {
    mockState.api.getCustomerProfile.mockResolvedValue({
      phone: "9876543210",
      customerName: "Customer",
      mob2: "",
      age: "",
      gender: "",
      district: "",
      location: "Karnataka",
      branch: "BTM",
      language: "Kannada",
      businessType: "Physical",
      metalType: "Gold",
      grams: "3.5",
      releasingAmount: "",
      bankName: "",
      onlinePrice: "",
      pricePerGram: "",
      advertisement: "TV",
      lead: "Hot",
      formStatus: "Planning to Visit",
      purpose: "Gold Sale",
      statusFollowUpAt: "",
      notes: "",
      hasSavedDetails: true,
    });
    mockState.api.getIntakeFormHistory.mockResolvedValue({
      phone: "9876543210",
      total: 2,
      results: [
        buildCall({
          id: "CALL-RECENT",
          status: "completed",
          createdAt: "2026-04-18T10:05:00.000Z",
          place: "Karnataka",
          notes: "Customer disconnected",
          branch: "",
          businessType: "",
          formStatus: "",
          purpose: "",
        }),
        buildCall({
          id: "CALL-OLDER",
          status: "completed",
          createdAt: "2026-04-18T10:00:00.000Z",
          branch: "BTM",
          businessType: "Physical",
          formStatus: "Planning to Visit",
          purpose: "Gold Sale",
        }),
      ],
    });

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const branchSelector = container.querySelector('[data-testid="branch-selector"]') as HTMLSelectElement | null;
    expect(branchSelector).not.toBeNull();
    if (!branchSelector) {
      throw new Error("Branch selector not found");
    }
    expect(branchSelector.value).toBe("BTM");

    const statusSelect = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.value === "Planning to Visit"));
    expect((statusSelect as HTMLSelectElement | undefined)?.value).toBe("");
  });

  it("auto-fills the language from saved state or location details and keeps it editable", async () => {
    mockState.api.getCustomerProfile.mockResolvedValueOnce({
      phone: "9876543210",
      customerName: "Customer",
      mob2: "",
      age: "",
      gender: "",
      district: "Tamil Nadu",
      location: "Chennai",
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
      hasSavedDetails: true,
    });

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const languageSelect = findLanguageSelect(container);
    expect(languageSelect.value).toBe("Tamil");

    await act(async () => {
      setSelectValue(languageSelect, "English");
      await Promise.resolve();
    });

    expect(languageSelect.value).toBe("English");
  });

  it("does not overwrite a manual language change when the location changes", async () => {
    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const locationInput = container.querySelector('input[placeholder="Area / Locality"]') as HTMLInputElement | null;
    expect(locationInput).not.toBeNull();
    if (!locationInput) {
      throw new Error("Location input not found");
    }

    await act(async () => {
      setInputValue(locationInput, "Hyderabad");
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const languageSelect = findLanguageSelect(container);
    expect(languageSelect.value).toBe("Telugu");

    await act(async () => {
      setSelectValue(languageSelect, "Tamil");
      await Promise.resolve();
    });

    expect(languageSelect.value).toBe("Tamil");

    await act(async () => {
      setInputValue(locationInput, "Bengaluru");
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(languageSelect.value).toBe("Tamil");
  });

  it("uses the live call snapshot when saving a connected call", async () => {
    mockState.callCenter = buildCallCenterMock({
      calls: [
        buildCall({
          id: "CALL-1",
          duration: "00:00",
          talkDurationSeconds: 0,
        }),
      ],
      getLiveCallSnapshot: vi.fn(() => ({
        id: "CALL-1",
        status: "active",
        duration: "00:42",
        ringStartedAt: "2026-04-18T10:00:00.000Z",
        answeredAt: "2026-04-18T10:00:03.000Z",
        endedAt: "",
        talkDurationSeconds: 42,
      })),
    });

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "CALL-1",
        duration: "00:42",
        answeredAt: "2026-04-18T10:00:03.000Z",
        talkDurationSeconds: 42,
      }),
    );
  });

  it("does not create a duplicate plain follow-up for planning visits scheduled from the intake form", async () => {
    mockState.callCenter = buildCallCenterMock({
      followUps: [],
    });

    mockState.storage.local.set("attica_intake_draft:outgoing:CALL-1", JSON.stringify({
      disposition: "",
      form: {
        date: "2026-04-20",
        name: "Customer",
        mob1: "9876543210",
        mob2: "",
        location: "",
        district: "",
        businessType: "",
        metalType: "Gold",
        grams: "",
        releasingAmount: "",
        bankName: "",
        assignedBranch: "Kadapa-Central",
        onlinePrice: "",
        pricePerGram: "",
        advertisement: "",
        lead: "Hot",
        status: "Planning to Visit",
        purpose: "",
        language: "",
        remarks: ["Reminder: Auto call scheduled for 20/4/2026 12:15 PM"],
        statusFollowUpAt: "2026-04-20T12:15",
        statusFollowUpDate: "2026-04-20",
        statusFollowUpHour: "12",
        statusFollowUpMinute: "15",
        statusFollowUpPeriod: "PM",
        followUpAction: "schedule",
      },
      smsSent: false,
      resolvedCallId: "CALL-1",
      intakeToken: "INTAKE-CALL-CALL-1",
      updatedAt: Date.now(),
    }));

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "CALL-1",
        formStatus: "Planning to Visit",
        followUpFlag: true,
      }),
    );
    expect(mockState.callCenter.addFollowUp).not.toHaveBeenCalled();
  });

  it("allows saving a connected call without age or gender", async () => {
    mockState.api.getCustomerProfile.mockResolvedValueOnce({
      phone: "9876543210",
      customerName: "Customer",
      mob2: "",
      age: "",
      gender: "",
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

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-query");
      select.value = "Coming To Branch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledTimes(1);
    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(expect.objectContaining({
      age: "",
      gender: "",
    }));
  });

  it("saves NA for age and gender when the call did not connect", async () => {
    mockState.api.getCustomerProfile.mockResolvedValueOnce({
      phone: "9876543210",
      customerName: "Customer",
      mob2: "",
      age: "",
      gender: "",
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
    mockState.callCenter = buildCallCenterMock({
      callPhase: "idle",
      calls: [
        buildCall({
          id: "CALL-1",
          status: "failed",
          duration: "00:00",
          answeredAt: "",
          endedAt: "2026-04-18T10:00:20.000Z",
          talkDurationSeconds: 0,
        }),
      ],
      getLiveCallSnapshot: vi.fn(() => ({
        id: "CALL-1",
        status: "failed",
        duration: "00:00",
        ringStartedAt: "2026-04-18T10:00:00.000Z",
        answeredAt: "",
        endedAt: "2026-04-18T10:00:20.000Z",
        talkDurationSeconds: 0,
      })),
    });

    await act(async () => {
      root.render(
        <CustomerIntakeForm
          phone="9876543210"
          customerName="Customer"
          callId="CALL-1"
        />,
      );
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      const select = findDispositionSelect(container, "disposition-others");
      select.value = "Not Serviceable";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText(container, "Submit Now").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      findButtonByText(container, "Save & Close Call").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mockState.api.saveCallWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "CALL-1",
        age: "NA",
        gender: "NA",
        status: "failed",
      }),
    );
  });

});
