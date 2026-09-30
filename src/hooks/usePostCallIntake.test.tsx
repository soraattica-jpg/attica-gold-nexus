import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type IntakeWorkflowRecord } from "@/lib/api";
import { remainingIntakeSeconds, usePostCallIntake } from "./usePostCallIntake";

vi.mock("@/lib/api", () => ({api:{getIntakeWorkflow:vi.fn(),saveIntakeWorkflow:vi.fn()}}));
const start = Date.parse("2026-09-09T09:00:00Z");
let row: IntakeWorkflowRecord;
let root: Root;
let host: HTMLDivElement;
const draft = {customerName:"Test Customer",callerName:"Test Customer",callbackStatus:"Enquiry Call",notes:"Entered details"};
const flush = () => act(async () => { await Promise.resolve(); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
function setup(callId = "CALL-1") {
  const onSubmitted = vi.fn();
  const props = {callId,agentId:"AG001",enabled:true,draft,selectedDisposition:"",hasLocalChanges:false,onRestore:vi.fn(),onSubmitted};
  const result = {current:null as unknown as ReturnType<typeof usePostCallIntake>};
  function Harness(p: typeof props) { result.current=usePostCallIntake(p); return null; }
  const rerender = (p: typeof props) => act(() => { root.render(<Harness {...p}/>); });
  rerender(props);
  return {result,rerender,props,onSubmitted};
}
beforeEach(() => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers(); vi.setSystemTime(start); vi.resetAllMocks();
  host=document.createElement("div"); document.body.append(host); root=createRoot(host);
  row = {callId:"CALL-1",agentId:"AG001",intakeToken:"TOKEN-1",revision:1,confirmedEndedAt:null,dispositionSelectedAt:null,autoSubmitAt:null,submittedAt:null,submissionMethod:null,requiresReview:[],pendingServerSave:false,draft,serverNow:new Date().toISOString()};
  vi.mocked(api.getIntakeWorkflow).mockImplementation(async () => ({...row,serverNow:new Date().toISOString()}));
  vi.mocked(api.saveIntakeWorkflow).mockImplementation(async (payload) => {
    row = {...row,draft:payload.draft,revision:row.revision+1,serverNow:new Date().toISOString()};
    if (!row.dispositionSelectedAt && payload.selectedDisposition === payload.draft.callbackStatus) row.dispositionSelectedAt=new Date().toISOString();
    if (!row.autoSubmitAt && row.confirmedEndedAt) row.autoSubmitAt=new Date(Date.parse(row.confirmedEndedAt)+15000).toISOString();
    if (payload.action !== "draft") row = {...row,submittedAt:new Date().toISOString(),submissionMethod:payload.action === "auto" ? "automatic" : "manual"};
    return {success:true,workflow:row};
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

describe("confirmed post-call intake", () => {
  it("restores an untouched server draft after login without confirming an inherited disposition", async () => {
    row.revision=0;
    row.confirmedEndedAt=null;
    const h=setup(); await flush();
    expect(h.props.onRestore).toHaveBeenCalledWith(row.draft);
    await advance(70000);
    expect(api.saveIntakeWorkflow).not.toHaveBeenCalled();
    expect(h.result.current.remaining).toBeNull();
  });
  it("does not count down or finalize without the exact backend end event", async () => {
    const h = setup(); await flush(); await advance(20000);
    expect(h.result.current.remaining).toBeNull();
    expect(api.saveIntakeWorkflow).not.toHaveBeenCalled();
    expect(h.onSubmitted).not.toHaveBeenCalled();
  });
  it("ignores the old automatic-submit deadline after reload", async () => {
    row.confirmedEndedAt = new Date(start-55000).toISOString();
    row.dispositionSelectedAt = new Date(start-60000).toISOString();
    row.autoSubmitAt = new Date(start+5000).toISOString();
    const h = setup(); await flush();
    expect(h.result.current.remaining).toBeNull();
    await advance(6000);
    expect(h.onSubmitted).not.toHaveBeenCalled();
    expect(api.saveIntakeWorkflow).not.toHaveBeenCalled();
  });
  it("manual submission stops expiry and finalizes once", async () => {
    row.dispositionSelectedAt = new Date(start).toISOString();
    row.confirmedEndedAt = new Date(start).toISOString(); row.autoSubmitAt = new Date(start+15000).toISOString();
    const h = setup(); await flush();
    await act(async () => { await h.result.current.submit(); });
    expect(h.result.current.remaining).toBeNull();
    await advance(70000);
    expect(h.onSubmitted).toHaveBeenCalledTimes(1);
    expect(api.saveIntakeWorkflow).toHaveBeenCalledTimes(1);
  });
  it("does not automatically submit after confirmed hangup", async () => {
    row.confirmedEndedAt = new Date(start).toISOString();
    row.autoSubmitAt = new Date(start+15000).toISOString();
    const h=setup(); await flush();
    expect(h.result.current.remaining).toBeNull();
    await advance(70000);
    expect(h.onSubmitted).not.toHaveBeenCalled();
    expect(api.saveIntakeWorkflow).not.toHaveBeenCalled();
  });
  it("saves an explicit selection even when the disposition value has not changed", async () => {
    row.confirmedEndedAt = new Date(start-30000).toISOString();
    row.autoSubmitAt = new Date(start+15000).toISOString();
    const h=setup(); await flush();
    h.rerender({...h.props,selectedDisposition:draft.callbackStatus});
    await advance(1000);
    expect(api.saveIntakeWorkflow).toHaveBeenCalledWith(expect.objectContaining({selectedDisposition:draft.callbackStatus,action:"draft"}));
    expect(h.result.current.remaining).toBeNull();
    await advance(14000);
    expect(h.onSubmitted).not.toHaveBeenCalled();
  });
  it("does not start the countdown when disposition is selected during the call", async () => {
    const h=setup(); await flush();
    h.rerender({...h.props,selectedDisposition:draft.callbackStatus});
    await advance(70000);
    expect(row.dispositionSelectedAt).not.toBeNull();
    expect(h.result.current.remaining).toBeNull();
    expect(h.onSubmitted).not.toHaveBeenCalled();
    expect(api.saveIntakeWorkflow).toHaveBeenCalledTimes(1);
  });
  it("retains failed manual-save intent and retries without closing early", async () => {
    const h = setup(); await flush();
    vi.mocked(api.saveIntakeWorkflow).mockResolvedValueOnce({success:false,error:"Unavailable"});
    await act(async () => { await h.result.current.submit(); });
    expect(h.result.current.pending).toBe(true); expect(h.onSubmitted).not.toHaveBeenCalled();
    await advance(1000);
    expect(vi.mocked(api.saveIntakeWorkflow).mock.calls[1][0].action).toBe("submit");
    expect(h.onSubmitted).toHaveBeenCalledTimes(1);
  });
  it("sends the latest edits even if the server finalized an older saved draft", async () => {
    const h = setup(); await flush();
    h.rerender({...h.props,draft:{...draft,notes:"Last keystrokes"},hasLocalChanges:true});
    row.submittedAt = new Date(start).toISOString(); row.submissionMethod = "automatic";
    await advance(1000);
    expect(vi.mocked(api.saveIntakeWorkflow).mock.calls[0][0].draft.notes).toBe("Last keystrokes");
    expect(h.onSubmitted).toHaveBeenCalledTimes(1);
  });
  it("does not submit on network loss without a confirmed end", async () => {
    const h = setup(); await flush();
    vi.mocked(api.getIntakeWorkflow).mockRejectedValue(new Error("Network unavailable"));
    await advance(30000);
    expect(h.result.current.pending).toBe(true); expect(h.result.current.remaining).toBeNull();
    expect(api.saveIntakeWorkflow).not.toHaveBeenCalled();
  });
  it("ignores a previous call's delayed save response", async () => {
    const h = setup(); await flush();
    let resolve!: (result: {success:boolean;workflow:IntakeWorkflowRecord}) => void;
    vi.mocked(api.saveIntakeWorkflow).mockImplementationOnce(() => new Promise((r) => {resolve=r;}));
    let saving!: Promise<boolean>;
    act(() => {saving=h.result.current.submit();});
    h.rerender({...h.props,callId:"CALL-2"});
    await act(async () => {resolve({success:true,workflow:{...row,submittedAt:new Date().toISOString()}}); await saving;});
    expect(h.onSubmitted).not.toHaveBeenCalled();
  });
  it("never produces a negative countdown", () => {
    expect(remainingIntakeSeconds(new Date(start-1000).toISOString(),start)).toBe(0);
  });
});
