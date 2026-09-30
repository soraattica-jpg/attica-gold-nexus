import { act } from "react";
import { writeFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PendingIntakeRecovery from "./PendingIntakeRecovery";
import { api } from "@/lib/api";

const state = vi.hoisted(() => ({user:{id:"AG025",role:"agent"},center:{} as Record<string,unknown>,formProps:{} as Record<string,unknown>}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:state.user})}));
vi.mock("@/contexts/CallCenterContext",()=>({useCallCenter:()=>state.center}));
vi.mock("@/lib/api",()=>({api:{getPendingIntakeWorkflow:vi.fn()}}));
vi.mock("@/components/CustomerIntakeForm",()=>({IsolatedCustomerIntakeForm:(props:Record<string,unknown>)=>{
  state.formProps=props;
  return <button onClick={()=> (props.onSave as () => void)()}>Save recovered form</button>;
}}));
const pending = {workflow:{callId:"OLD-CALL",agentId:"AG025",confirmedEndedAt:"2026-09-09T11:00:00Z"},
  call:{id:"OLD-CALL",agentId:"AG025",callerId:"9000000000",direction:"outgoing",date:"2026-09-09",time:"16:30"}};
let root:Root;
let host:HTMLDivElement;
const render=()=>act(()=>root.render(<PendingIntakeRecovery/>));
const flush=()=>act(async()=>{await Promise.resolve();});
beforeEach(()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers(); vi.resetAllMocks();
  state.user={id:"AG025",role:"agent"};
  state.center={callPhase:"idle",callWrapUpPending:false,incomingDialogOpen:false,agentStatus:"outbound-auto",followUps:[]};
  state.formProps={};
  host=document.createElement("div"); document.body.append(host); root=createRoot(host);
  vi.mocked(api.getPendingIntakeWorkflow).mockResolvedValue(pending as never);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();});
describe("pending intake recovery",()=>{
  it("opens the exact ended form from yesterday and stops discovery polling",async()=>{
    render(); await flush();
    expect(document.body.textContent).toContain("Pending Customer Details");
    expect(state.formProps.callId).toBe("OLD-CALL");
    expect(state.formProps.showDraftCloseButton).toBe(false);
    if (process.env.ATTICA_RECOVERY_SCREENSHOT_HTML) writeFileSync(process.env.ATTICA_RECOVERY_SCREENSHOT_HTML,document.body.innerHTML);
    await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
    expect(api.getPendingIntakeWorkflow).toHaveBeenCalledTimes(1);
  });
  it.each([
    {callPhase:"connected"},{callPhase:"dialing"},{incomingDialogOpen:true},
    {callWrapUpPending:true},{autoDialAlertLead:{id:"new"}},{currentAutoDialLead:{id:"new"}},
    {agentStatus:"lunch-break"},
  ])("never opens over protected work: %j",async(overrides)=>{
    Object.assign(state.center,overrides); render(); await flush();
    expect(api.getPendingIntakeWorkflow).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Save recovered form");
  });
  it("does not run for admin users",async()=>{
    state.user.role="superadmin";render();await flush();
    expect(api.getPendingIntakeWorkflow).not.toHaveBeenCalled();
  });
  it("ignores a delayed response after a live call starts",async()=>{
    let resolve!:(value:never)=>void;
    vi.mocked(api.getPendingIntakeWorkflow).mockImplementationOnce(()=>new Promise((r)=>{resolve=r;}));
    render();state.center.callPhase="connected";render();
    await act(async()=>resolve(pending as never));
    expect(document.body.textContent).not.toContain("Save recovered form");
  });
  it("does not overlap requests and cancels discovery on logout",async()=>{
    vi.mocked(api.getPendingIntakeWorkflow).mockImplementationOnce(()=>new Promise(()=>{}));
    render();await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
    expect(api.getPendingIntakeWorkflow).toHaveBeenCalledTimes(1);
    const signal=vi.mocked(api.getPendingIntakeWorkflow).mock.calls[0][1];
    state.user.role="";render();expect(signal?.aborted).toBe(true);
  });
  it("checks for the next pending form only after successful submission",async()=>{
    render();await flush();
    vi.mocked(api.getPendingIntakeWorkflow).mockResolvedValue(null);
    await act(async()=>document.querySelector<HTMLButtonElement>('[role="dialog"] button:not([class])')?.click());
    expect(api.getPendingIntakeWorkflow).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain("Save recovered form");
  });
  it("retries a failed lookup without discarding any server draft",async()=>{
    vi.mocked(api.getPendingIntakeWorkflow).mockRejectedValueOnce(new Error("offline"));
    render();await flush();
    await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});
    expect(document.body.textContent).toContain("Save recovered form");
  });
});
