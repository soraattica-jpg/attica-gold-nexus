import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Download, Eye, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Users } from 'lucide-react';
import { api, type LiveAgentRecord } from '@/lib/api';
import { mdReporting, type MdFilters, type MdPage, type MdSummary } from '@/lib/mdReporting';
import type { ManagedCall } from '@/contexts/CallCenterContext';
import { formatCallDurationFromSeconds } from '@/lib/callDuration';
import { getAgentStatusLabel, getAgentStatusBadgeClass } from '@/lib/agentStatus';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const asOf = (value:string) => new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
const numeric = (value:unknown) => Number(value)||0;
const metricCards = [
  {label:'Total Calls',metric:'total',key:'total',Icon:Phone},
  {label:'Inbound',metric:'inbound',key:'inbound',Icon:PhoneIncoming},
  {label:'Outbound',metric:'outbound',key:'outbound',Icon:PhoneOutgoing},
  {label:'Missed',metric:'missed',key:'missed',Icon:PhoneMissed},
  {label:'Unique Callers',metric:'unique',key:'uniqueCallers',Icon:Users},
] as const;

function useDebounced(value:string) {
  const [debounced,setDebounced] = useState(value);
  useEffect(()=>{const timer=window.setTimeout(()=>setDebounced(value),400);return()=>window.clearTimeout(timer);},[value]);
  return debounced;
}

const CallRow = memo(function CallRow({row,index,onDetails}:{row:ManagedCall;index:number;onDetails:(id:string)=>void}) {
  return <tr className="border-t border-border odd:bg-muted/20">
    <td className="px-3 py-3 tabular-nums">{index}</td>
    <td className="whitespace-nowrap px-3 py-3">{row.date}<br/><span className="text-muted-foreground">{row.time}</span></td>
    <td className="px-3 py-3">{row.customerName || 'N/A'}</td>
    <td className="px-3 py-3 font-mono">{row.callerId || 'N/A'}</td>
    <td className="px-3 py-3">{row.direction}</td><td className="px-3 py-3">{row.leadSource}</td>
    <td className="px-3 py-3">{row.agentName || row.agentId || 'N/A'}</td>
    <td className="px-3 py-3">{row.language || 'Unknown'}</td><td className="px-3 py-3">{row.branch || 'Unknown'}</td>
    <td className="px-3 py-3">{row.status}</td><td className="px-3 py-3 tabular-nums">{formatCallDurationFromSeconds(row.talkDurationSeconds||0)}</td>
    <td className="px-3 py-3">{row.callbackStatus}</td><td className="px-3 py-3">{row.dispositionCategory}</td>
    <td className="px-3 py-3"><button className="action-outline p-2" title="Call details" aria-label={`Details for ${row.id}`} onClick={()=>onDetails(row.id)}><Eye className="h-4 w-4"/></button></td>
  </tr>;
});

export function MdCallDrilldown({title,filters,onClose}:{title:string;filters:MdFilters;onClose:()=>void}) {
  const [page,setPage] = useState(1);
  const [pageSize,setPageSize] = useState(50);
  const [sort,setSort] = useState('newest');
  const [search,setSearch] = useState(filters.search || '');
  const debouncedSearch = useDebounced(search);
  const [result,setResult] = useState<MdPage|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [selectedId,setSelectedId] = useState('');
  const [detail,setDetail] = useState<ManagedCall|null>(null);
  const [detailError,setDetailError] = useState('');
  const query = useMemo(()=>({...filters,page,pageSize,sort,search:debouncedSearch}),[filters,page,pageSize,sort,debouncedSearch]);
  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true);setError('');setResult(null);
    mdReporting.records(query,controller.signal).then(data=>{if(!controller.signal.aborted)setResult(data);})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[query]);
  useEffect(()=>{
    if(!selectedId || !filters.snapshotId)return;
    const controller = new AbortController();setDetail(null);setDetailError('');
    mdReporting.detail(filters.snapshotId,selectedId,controller.signal).then(data=>{if(!controller.signal.aborted)setDetail(data);})
      .catch(err=>{if(!controller.signal.aborted)setDetailError(err.message);});
    return()=>controller.abort();
  },[selectedId,filters.snapshotId]);
  const visiblePage = result?.page || page;
  const totalPages = result?.totalPages || 0;
  const total = result?.totalRecords || 0;
  const start = total ? (visiblePage-1)*pageSize+1 : 0;
  const pageNumbers = Array.from({length:Math.min(5,totalPages)},(_,index)=>Math.max(1,Math.min(visiblePage-2,totalPages-4))+index);
  return <>
    <Dialog open onOpenChange={open=>!open&&onClose()}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-24px)] max-w-[1440px] min-w-0 flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <DialogHeader className="pr-7"><DialogTitle>{title} {result && <span className="text-sm font-normal text-muted-foreground">{total} matching {filters.metric==='unique'||filters.metric==='missed'?'callers':'calls'}</span>}</DialogTitle>
          <DialogDescription>{filters.fromDate} to {filters.toDate}{result ? ` | As of ${asOf(result.dataAsOf)} IST` : ''}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-xs">Search matching records<input aria-label="Search matching records" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className="control-field mt-1 w-full"/></label>
          <label className="text-xs">Sort<select aria-label="Sort records" className="control-field mt-1 block" value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="customer">Customer name</option><option value="duration">Talk duration</option>
          </select></label>
          <button disabled={loading||!!error} className="action-outline" onClick={()=>mdReporting.export(query,'page')}><Download className="h-4 w-4"/>Export Current Page</button>
          <button disabled={loading||!!error} className="action-outline" onClick={()=>mdReporting.export(query,'all')}><Download className="h-4 w-4"/>Export All Matching Records</button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="min-h-0 flex-1 overflow-auto border-y border-border" aria-busy={loading}>
          <table className="w-full min-w-[1150px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-card text-muted-foreground"><tr>{['#','Date / Time (IST)','Customer','Number','Direction','Source','Agent','Language','Branch','Status','Talk Time','Disposition','Category','Details'].map(label=><th className="px-3 py-3 font-medium" key={label}>{label}</th>)}</tr></thead>
            <tbody>{result?.rows.map((row,index)=><CallRow key={row.id} row={row} index={start+index} onDetails={setSelectedId}/>)}
              {!result?.rows.length&&<tr><td colSpan={14} className="px-3 py-10 text-center text-muted-foreground">{loading?'Loading call details...':error?'Report unavailable':'No matching records'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label>Rows per page <select aria-label="Rows per page" value={pageSize} className="control-field ml-2" onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{[25,50,100].map(size=><option key={size}>{size}</option>)}</select></label>
          <span>{loading?'Loading...':`Showing ${start} to ${Math.min(visiblePage*pageSize,total)} of ${total}`}</span>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Detail pagination">
            <button title="First page" aria-label="First page" disabled={loading||visiblePage<=1} onClick={()=>setPage(1)} className="action-outline p-2"><ChevronFirst className="h-4 w-4"/></button>
            <button title="Previous page" aria-label="Previous page" disabled={loading||visiblePage<=1} onClick={()=>setPage(visiblePage-1)} className="action-outline p-2"><ChevronLeft className="h-4 w-4"/></button>
            {pageNumbers.map(n=><button key={n} disabled={loading} aria-current={n===visiblePage?'page':undefined} onClick={()=>setPage(n)} className={`${n===visiblePage?'action-gold':'action-outline'} min-w-9 justify-center px-2 py-1`}>{n}</button>)}
            <button title="Next page" aria-label="Next page" disabled={loading||visiblePage>=totalPages} onClick={()=>setPage(visiblePage+1)} className="action-outline p-2"><ChevronRight className="h-4 w-4"/></button>
            <button title="Last page" aria-label="Last page" disabled={loading||visiblePage>=totalPages} onClick={()=>setPage(totalPages)} className="action-outline p-2"><ChevronLast className="h-4 w-4"/></button>
          </nav>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!selectedId} onOpenChange={open=>!open&&setSelectedId('')}>
      <DialogContent className="max-h-[85dvh] overflow-auto"><DialogHeader><DialogTitle>Call Details</DialogTitle><DialogDescription>{selectedId}</DialogDescription></DialogHeader>
        {detailError?<p role="alert">{detailError}</p>:!detail?<p>Loading...</p>:<dl className="grid grid-cols-2 gap-3 text-sm">
          {[['Customer',detail.customerName],['Number',detail.callerId],['Agent',detail.agentName],['Branch',detail.branch],['Disposition',detail.callbackStatus],['Category',detail.dispositionCategory],['Grams',detail.grams],['Follow-Up',detail.statusFollowUpAt]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value||'N/A'}</dd></div>)}
          <div className="col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap break-words">{detail.notes||'N/A'}</dd></div>
        </dl>}
      </DialogContent>
    </Dialog>
  </>;
}

export default function MdCallReport({fromDate,toDate,refreshKey,daily=false}:{fromDate:string;toDate:string;refreshKey:number;daily?:boolean}) {
  const [source,setSource] = useState('');const [language,setLanguage] = useState('');const [branch,setBranch] = useState('');
  const [search,setSearch] = useState('');const debouncedSearch = useDebounced(search);
  const [report,setReport] = useState<MdSummary|null>(null);
  const [options,setOptions] = useState<MdSummary|null>(null);
  const [error,setError] = useState('');const [loading,setLoading] = useState(true);
  const [modal,setModal] = useState<{title:string;filters:MdFilters}|null>(null);
  const [agents,setAgents] = useState<LiveAgentRecord[]>([]);
  const [agentSearch,setAgentSearch] = useState('');const [agentDisposition,setAgentDisposition] = useState('');
  const [agentSummary,setAgentSummary] = useState<MdSummary|null>(null);
  const [agentError,setAgentError] = useState('');
  const snapshot = useRef<{range:string;id:string}|null>(null);
  const range = `${fromDate}:${toDate}:${refreshKey}`;
  const filters = useMemo<MdFilters>(()=>({fromDate,toDate,source,language,branch,search:debouncedSearch}),[fromDate,toDate,source,language,branch,debouncedSearch]);
  useEffect(()=>{
    const controller = new AbortController();setLoading(true);setError('');setModal(null);setReport(null);
    const load = async()=>{
      let id = snapshot.current?.range===range?snapshot.current.id:undefined;
      if(!id){
        const base = await mdReporting.summary({fromDate,toDate},controller.signal);
        if(controller.signal.aborted)return;
        id=base.snapshotId;snapshot.current={range,id};setOptions(base);
        if(!source&&!language&&!branch&&!debouncedSearch){setReport(base);return;}
      }
      const data = await mdReporting.summary({...filters,snapshotId:id},controller.signal);
      if(!controller.signal.aborted)setReport(data);
    };
    load().catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[filters,range,fromDate,toDate,source,language,branch,debouncedSearch]);
  useEffect(()=>{
    let stopped=false;let timer:number;
    const load=async()=>{try{const data=await api.getLiveAgents();if(!stopped)setAgents(data);}finally{if(!stopped)timer=window.setTimeout(load,60000);}};
    void load();return()=>{stopped=true;window.clearTimeout(timer);};
  },[]);
  useEffect(()=>{
    if(!report)return;
    if(!agentDisposition){setAgentSummary(report);setAgentError('');return;}
    const controller=new AbortController();setAgentSummary(null);setAgentError('');
    mdReporting.summary({...filters,snapshotId:report.snapshotId,disposition:agentDisposition},controller.signal)
      .then(data=>{if(!controller.signal.aborted)setAgentSummary(data);}).catch(err=>{if(!controller.signal.aborted)setAgentError(err.message);});
    return()=>controller.abort();
  },[report,filters,agentDisposition]);
  const open = (title:string,extra:MdFilters={}) => {
    if(report)setModal({title,filters:{...filters,...extra,snapshotId:report.snapshotId}});
  };
  const visibleAgents = (agentSummary?.agents||[]).filter(agent=>`${agent.id} ${agent.name}`.toLowerCase().includes(agentSearch.toLowerCase()));
  const agentCounts = new Map((report?.agents||[]).map(agent=>[agent.id,numeric(agent.total)]));
  return <section className="min-w-0 space-y-6" aria-label="MD call report">
    <div className="flex flex-wrap items-end gap-3 border-y border-border py-4">
      {([{label:'Source',value:source,set:setSource,choices:options?.sources.map(r=>r.source)||[]},
        {label:'Language',value:language,set:setLanguage,choices:options?.languages.map(r=>r.language)||[]},
        {label:'Branch',value:branch,set:setBranch,choices:options?.branches.map(r=>r.branch)||[]}]).map(field=><label className="min-w-36 text-xs" key={field.label}>{field.label}<select aria-label={field.label} className="control-field mt-1 block max-w-60" value={field.value} onChange={e=>field.set(e.target.value)}><option value="">All {field.label.toLowerCase()}s</option>{field.choices.map(v=><option key={v}>{v}</option>)}</select></label>)}
      <label className="min-w-48 flex-1 text-xs">Search report<input aria-label="Search report" className="control-field mt-1 w-full" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <button disabled={!report||loading} className="action-outline" onClick={()=>report&&mdReporting.export({...filters,snapshotId:report.snapshotId,metric:'total'},'all')}><Download className="h-4 w-4"/>Export All Matching Records</button>
    </div>
    {loading?<p role="status">Loading reporting summary...</p>:error?<p role="alert" className="text-red-600">{error}</p>:report&&<>
      <p className="text-xs text-muted-foreground">As of {asOf(report.dataAsOf)} IST</p>
      {daily?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{report.daily.map(day=><article className="rounded-lg border border-border p-4" key={day.date}>
        <h2 className="mb-3 text-lg font-semibold">{day.date}</h2><div className="grid grid-cols-2 gap-3">{metricCards.map(card=><button key={card.key} className="border-b border-border py-2 text-left hover:text-accent" onClick={()=>open(`${card.label}: ${day.date}`,{metric:card.metric,date:day.date})}><span className="block text-xs text-muted-foreground">{card.label}</span><strong className="text-xl tabular-nums">{numeric(day[card.key])}</strong></button>)}</div>
      </article>)}</div>:<>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{metricCards.map(card=><button key={card.key} className="rounded-lg border border-border bg-card p-4 text-left transition hover:border-accent" onClick={()=>open(card.label,{metric:card.metric})}>
          <span className="mb-2 flex items-center justify-between text-xs text-muted-foreground">{card.label}<card.Icon className="h-4 w-4"/></span><strong className="text-3xl tabular-nums">{numeric(report.summary[card.key])}</strong>
        </button>)}<div className="rounded-lg border border-border bg-card p-4"><p className="mb-2 text-xs text-muted-foreground">Agents Online</p><strong className="text-3xl">{agents.filter(a=>['available','on-call','follow-up'].includes(a.status)).length}</strong></div></div>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="min-w-0 border-b border-border pb-5"><h2 className="mb-4 text-lg font-semibold">Call Volume by Hour</h2>
            <ResponsiveContainer width="100%" height={250}><BarChart data={report.hourly}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="hour" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><Tooltip/>
              <Bar dataKey="calls" fill="hsl(var(--accent))" cursor="pointer" onClick={(_,index)=>open(`Hour: ${report.hourly[index].hour}`,{hour:index})}/>
            </BarChart></ResponsiveContainer>
          </section>
          <section className="border-b border-border pb-5"><h2 className="mb-4 text-lg font-semibold">Language Distribution</h2><div className="space-y-2">{report.languages.map(row=><button key={row.language} className="flex w-full items-center gap-3 py-2 text-left hover:text-accent" onClick={()=>open(`Language: ${row.language}`,{language:row.language})}>
            <span className="w-24 text-sm">{row.language}</span><span className="h-2 flex-1 bg-muted"><span className="block h-2 bg-emerald-600" style={{width:`${report.summary.total?row.calls/report.summary.total*100:0}%`}}/></span><strong className="w-14 text-right tabular-nums">{row.calls}</strong>
          </button>)}</div></section>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">{[{title:'Disposition Category Summary',rows:report.dispositionCategories.map(r=>({label:r.category,calls:r.calls})),key:'category'},
          {title:'Disposition Summary',rows:report.dispositions.map(r=>({label:r.disposition,calls:r.calls})),key:'disposition'}].map(section=><section key={section.key} className="border-b border-border pb-5"><h2 className="mb-4 text-lg font-semibold">{section.title}</h2>
            <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">{section.rows.map(row=><button className="flex justify-between gap-3 border-b border-border py-2 text-left text-sm hover:text-accent" key={row.label} onClick={()=>open(row.label,{[section.key]:row.label})}><span>{row.label}</span><strong className="tabular-nums">{row.calls}</strong></button>)}</div>
          </section>)}</div>
        <section><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><h2 className="text-lg font-semibold">Agent Performance</h2><div className="flex flex-wrap gap-3">
          <input aria-label="Search agent table" placeholder="Search agent or ID" className="control-field" value={agentSearch} onChange={e=>setAgentSearch(e.target.value)}/>
          <select aria-label="Agent performance disposition" className="control-field max-w-72" value={agentDisposition} onChange={e=>setAgentDisposition(e.target.value)}><option value="">All dispositions</option>{report.dispositions.map(row=><option key={row.disposition}>{row.disposition}</option>)}</select>
        </div></div>{agentError?<p role="alert">{agentError}</p>:<><p className="mb-2 text-xs text-muted-foreground">{visibleAgents.length} agents | {visibleAgents.reduce((sum,a)=>sum+numeric(a.total),0)} calls</p>
          <div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{['Agent','Total Calls','Inbound','Outbound','Answered','Missed','Answer Rate','Talk Time','Avg Duration'].map(label=><th className="px-3 py-3" key={label}>{label}</th>)}</tr></thead><tbody>
            {visibleAgents.map(a=><tr className="border-b border-border hover:bg-muted/30" key={a.id}><td className="px-3 py-3"><button className="text-left hover:underline" onClick={()=>open(`Agent: ${a.name||a.id}`,{agent:a.id,disposition:agentDisposition})}>{a.name||a.id} ({a.id})</button></td>
              {[a.total,a.inbound,a.outbound,a.answered,a.missed,`${numeric(a.total)?Math.round(numeric(a.answered)/numeric(a.total)*100):0}%`,formatCallDurationFromSeconds(numeric(a.totalTalkTimeSeconds)),formatCallDurationFromSeconds(numeric(a.avgDurationSeconds))].map((value,i)=><td key={i} className="px-3 py-3 tabular-nums">{value}</td>)}</tr>)}
          </tbody></table></div></>}
        </section>
        <section><h2 className="mb-4 text-lg font-semibold">Live Agent Status</h2><div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">{agents.map(a=><div className="rounded-lg border border-border p-3 text-center" key={a.agentId}><p className="mb-1 text-xs">{a.agentId}</p><span className={`${getAgentStatusBadgeClass(a.status)} text-xs`}>{getAgentStatusLabel(a.status)}</span><p className="mt-2 text-xs">{agentCounts.get(a.agentId)||0} calls</p></div>)}</div></section>
      </>}
    </>}
    {modal&&<MdCallDrilldown key={`${modal.title}:${JSON.stringify(modal.filters)}`} title={modal.title} filters={modal.filters} onClose={()=>setModal(null)}/>}
  </section>;
}
