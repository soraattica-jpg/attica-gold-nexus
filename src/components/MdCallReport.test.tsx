import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MdCallReport, { MdCallDrilldown } from './MdCallReport';

const mocks = vi.hoisted(()=>({summary:vi.fn(),records:vi.fn(),detail:vi.fn(),export:vi.fn(),live:vi.fn()}));
vi.mock('@/lib/mdReporting',()=>({mdReporting:mocks}));
vi.mock('@/lib/api',()=>({api:{getLiveAgents:mocks.live}}));
vi.mock('recharts',()=>Object.fromEntries(['Bar','BarChart','CartesianGrid','ResponsiveContainer','Tooltip','XAxis','YAxis'].map(name=>[name,({children}:{children?:React.ReactNode})=><div>{children}</div>])));

const summary = {
  snapshotId:'snapshot-1',dataAsOf:'2026-09-10T06:00:00Z',expiresAt:'2026-09-10T07:00:00Z',
  summary:{total:1035,inbound:389,outbound:646,answered:800,missed:8,uniqueCallers:896},
  hourly:Array.from({length:24},(_,i)=>({hour:`${String(i).padStart(2,'0')}:00`,calls:i===11?1035:0})),
  languages:[{language:'Telugu',calls:600},{language:'Tamil',calls:435}],
  dispositions:[{disposition:'RNR',calls:400},{disposition:'Planning to Visit',calls:635}],
  dispositionCategories:[{category:'RNR',calls:400},{category:'QL',calls:635}],
  sources:[{source:'Website',calls:500}],branches:[{branch:'Branch A',calls:1035}],
  agents:[{id:'AG001',name:'Agent One',total:389,inbound:389,outbound:0,answered:300,missed:8,totalTalkTimeSeconds:1000,avgDurationSeconds:50}],
  daily:[{date:'2026-09-10',total:1035,inbound:389,outbound:646,answered:800,missed:8,uniqueCallers:896}],
};
beforeEach(()=>{
  vi.clearAllMocks();mocks.live.mockResolvedValue([]);mocks.summary.mockResolvedValue(summary);
  mocks.records.mockImplementation(async query=>({snapshotId:'snapshot-1',dataAsOf:summary.dataAsOf,page:query.page,pageSize:query.pageSize,
    totalRecords:query.metric==='unique'?896:389,totalPages:query.metric==='unique'?18:8,
    rows:[{id:`CALL-${query.page}`,date:'2026-09-10',time:'11:00:00',customerName:`Page ${query.page} Customer`,callerId:'9000000001',direction:'incoming',status:'completed',talkDurationSeconds:60}]}));
  mocks.detail.mockResolvedValue({id:'CALL-1',notes:'Full detail notes'});
});
afterEach(cleanup);

describe('MD report pagination',()=>{
  it('opens no detail requests initially and uses full summary counts',async()=>{
    render(<MdCallReport fromDate="2026-09-10" toDate="2026-09-10" refreshKey={0}/>);
    await screen.findByRole('button',{name:/Inbound\s+389/});
    expect(mocks.records).not.toHaveBeenCalled();expect(mocks.detail).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:/Telugu\s+600/})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/Inbound\s+389/}));
    await screen.findByText('389 matching calls');
    expect(mocks.records).toHaveBeenLastCalledWith(expect.objectContaining({metric:'inbound',page:1,pageSize:50,snapshotId:'snapshot-1',fromDate:'2026-09-10'}),expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button',{name:'Next page'}));
    await screen.findByText('Page 2 Customer');
    expect(mocks.records).toHaveBeenLastCalledWith(expect.objectContaining({metric:'inbound',page:2,pageSize:50}),expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button',{name:'Last page'}));
    await screen.findByText('Showing 351 to 389 of 389');
  });
  it('passes exact language and unique metrics instead of filtering loaded rows',async()=>{
    const view=render(<MdCallReport fromDate="2026-09-10" toDate="2026-09-10" refreshKey={0}/>);
    fireEvent.click(await screen.findByRole('button',{name:/Telugu\s+600/}));
    await screen.findByText('389 matching calls');
    expect(mocks.records).toHaveBeenLastCalledWith(expect.objectContaining({language:'Telugu',page:1}),expect.any(AbortSignal));
    view.unmount();
    render(<MdCallReport fromDate="2026-09-10" toDate="2026-09-10" refreshKey={0}/>);
    fireEvent.click(await screen.findByRole('button',{name:/Unique Callers\s+896/}));
    await screen.findByText('896 matching callers');
    expect(mocks.records).toHaveBeenLastCalledWith(expect.objectContaining({metric:'unique',page:1}),expect.any(AbortSignal));
  });
  it('resets paging on page-size change, exports separate scopes, loads details on demand',async()=>{
    render(<MdCallDrilldown title="Inbound" filters={{snapshotId:'snapshot-1',metric:'inbound',source:'Website'}} onClose={()=>{}}/>);
    await screen.findByText('Page 1 Customer');expect(mocks.detail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Next page'}));await screen.findByText('Page 2 Customer');
    fireEvent.change(screen.getByLabelText('Rows per page'),{target:{value:'100'}});await screen.findByText('Page 1 Customer');
    expect(mocks.records).toHaveBeenLastCalledWith(expect.objectContaining({page:1,pageSize:100,source:'Website'}),expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button',{name:'Export Current Page'}));expect(mocks.export).toHaveBeenLastCalledWith(expect.objectContaining({page:1,pageSize:100,metric:'inbound',source:'Website'}),'page');
    fireEvent.click(screen.getByRole('button',{name:'Export All Matching Records'}));expect(mocks.export).toHaveBeenLastCalledWith(expect.objectContaining({metric:'inbound',source:'Website'}),'all');
    fireEvent.click(screen.getByRole('button',{name:'Details for CALL-1'}));await screen.findByText('Full detail notes');
    expect(mocks.detail).toHaveBeenCalledWith('snapshot-1','CALL-1',expect.any(AbortSignal));
  });
  it('aborts the prior page request and ignores late responses',async()=>{
    let resolveFirst:(value:unknown)=>void=()=>{};
    mocks.records.mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;}));
    render(<MdCallDrilldown title="Inbound" filters={{snapshotId:'snapshot-1',metric:'inbound'}} onClose={()=>{}}/>);
    await waitFor(()=>expect(mocks.records).toHaveBeenCalledTimes(1));
    const firstSignal=mocks.records.mock.calls[0][1];
    fireEvent.change(screen.getByLabelText('Rows per page'),{target:{value:'25'}});
    await screen.findByText('Page 1 Customer');expect(firstSignal.aborted).toBe(true);
    resolveFirst({rows:[{id:'STALE',customerName:'Stale Customer'}],page:1,pageSize:50,totalRecords:999,totalPages:20});
    await waitFor(()=>expect(screen.queryByText('Stale Customer')).toBeNull());
  });
  it('does not turn failed requests into a successful empty table',async()=>{
    mocks.records.mockRejectedValue(new Error('Reporting snapshot expired. Refresh the dashboard.'));
    render(<MdCallDrilldown title="Inbound" filters={{snapshotId:'snapshot-1'}} onClose={()=>{}}/>);
    await screen.findByRole('alert');expect(screen.getByRole('alert').textContent).toContain('snapshot expired');
    expect((screen.getByRole('button',{name:'Export All Matching Records'}) as HTMLButtonElement).disabled).toBe(true);
  });
});
