import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, type CustomerDataDashboardResult } from "@/lib/api";
import { useCustomerDataDashboard } from "./useCustomerDataDashboard";

vi.mock("@/lib/api",()=>({api:{getCustomerDataDashboard:vi.fn()}}));
let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useCustomerDataDashboard>;
const today="2026-09-09";
const saved:CustomerDataDashboardResult={date:today,total:1,results:[{customerName:"Customer",contact:"9000000000",billId:"B1",type:"Gold",branch:"Test",date:today,time:"10:00",status:"Billed",dispositionCategory:"Billed",grossW:"12",netW:"11",walkinType:"",firstAgentName:"Agent"}],lastSyncedAt:"2026-09-09T10:00:00Z"};
function Harness({date=today,enabled=true}) {current=useCustomerDataDashboard(date,enabled);return null;}
const render=async(date=today,enabled=true)=>act(async()=>{root.render(<Harness date={date} enabled={enabled}/>);});
beforeEach(()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.resetAllMocks(); host=document.createElement("div"); document.body.append(host); root=createRoot(host);
  vi.mocked(api.getCustomerDataDashboard).mockResolvedValue(saved);
});
afterEach(()=>{act(()=>root.unmount());host.remove();});

it("loads the selected billing date and the real sync timestamp",async()=>{
  await render(); expect(current.data).toEqual(saved); expect(current.loading).toBe(false);
  expect(api.getCustomerDataDashboard).toHaveBeenCalledWith(today,expect.objectContaining({force:true,signal:expect.any(AbortSignal)}));
});
it("keeps saved bills on refresh failure instead of changing totals to zero",async()=>{
  await render(); vi.mocked(api.getCustomerDataDashboard).mockRejectedValue(new Error("503"));
  await act(async()=>{await current.refresh({force:true});});
  expect(current.data).toEqual(saved); expect(current.error).toContain("could not be refreshed"); expect(current.loading).toBe(false);
});
it("does not report a failed initial request as a successful empty report",async()=>{
  vi.mocked(api.getCustomerDataDashboard).mockRejectedValue(new Error("offline"));
  await render(); expect(current.error).not.toBe(""); expect(current.data.lastSyncedAt).toBeUndefined();
});
it("cancels an old date request and ignores its late response",async()=>{
  let resolveOld!: (value:CustomerDataDashboardResult)=>void;
  vi.mocked(api.getCustomerDataDashboard).mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
  await render();
  const signal=vi.mocked(api.getCustomerDataDashboard).mock.calls[0][1]?.signal;
  const next={...saved,date:"2026-09-08",results:[],total:0};
  vi.mocked(api.getCustomerDataDashboard).mockResolvedValue(next);
  await render(next.date); expect(signal?.aborted).toBe(true);
  await act(async()=>{resolveOld(saved);});
  expect(current.data).toEqual(next); expect(current.error).toBe("");
});
it("does not retain another date's bills after the newly selected date fails",async()=>{
  await render(); vi.mocked(api.getCustomerDataDashboard).mockRejectedValue(new Error("offline"));
  await render("2026-09-08"); expect(current.data.results).toEqual([]); expect(current.data.lastSyncedAt).toBeUndefined(); expect(current.error).not.toBe("");
});
it("does not fetch on another admin tab and aborts when leaving Customer Data",async()=>{
  await render(today,false); expect(api.getCustomerDataDashboard).not.toHaveBeenCalled();
  await render(); const signal=vi.mocked(api.getCustomerDataDashboard).mock.calls[0][1]?.signal;
  await render(today,false); expect(signal?.aborted).toBe(true); expect(api.getCustomerDataDashboard).toHaveBeenCalledTimes(1);
});
