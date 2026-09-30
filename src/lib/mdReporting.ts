import { buildApiUrl } from './api';
import type { ManagedCall } from '@/contexts/CallCenterContext';

export type MdFilters = {
  fromDate?: string; toDate?: string; snapshotId?: string;
  metric?: 'total' | 'inbound' | 'outbound' | 'answered' | 'missed' | 'unique';
  source?: string; agent?: string; language?: string; branch?: string;
  disposition?: string; category?: string; status?: string; direction?: string;
  search?: string; date?: string; hour?: number;
};
export type MdTotals = {total:number;inbound:number;outbound:number;answered:number;missed:number;uniqueCallers:number};
export type MdMetadata = {snapshotId:string;dataAsOf:string;expiresAt:string};
export type MdSummary = MdMetadata & {
  summary:MdTotals;
  hourly:Array<{hour:string;calls:number}>;
  languages:Array<{language:string;calls:number}>;
  dispositions:Array<{disposition:string;calls:number}>;
  dispositionCategories:Array<{category:string;calls:number}>;
  sources:Array<{source:string;calls:number}>;
  branches:Array<{branch:string;calls:number}>;
  agents:Array<MdTotals & {id:string;name:string;totalTalkTimeSeconds:number;avgDurationSeconds:number}>;
  daily:Array<MdTotals & {date:string}>;
};
export type MdPageOptions = {page:number;pageSize:number;sort?:string};
export type MdPage = MdMetadata & MdPageOptions & {rows:ManagedCall[];totalRecords:number;totalPages:number};

export const mdReportUrl = (path:string,params:object) => {
  const query = new URLSearchParams();
  for(const [key,value] of Object.entries(params)) if(value !== undefined && value !== null && value !== '') query.set(key,String(value));
  return buildApiUrl(`/md-dashboard/${path}?${query}`);
};
async function read<T>(path:string,params:object,signal?:AbortSignal):Promise<T> {
  const response = await fetch(mdReportUrl(path,params),{signal,credentials:'same-origin'});
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || 'Report request failed');
  return data;
}
export const mdReporting = {
  summary:(filters:MdFilters,signal?:AbortSignal)=>read<MdSummary>('summary',filters,signal),
  records:(filters:MdFilters & MdPageOptions,signal?:AbortSignal)=>read<MdPage>('records',filters,signal),
  detail:(snapshotId:string,callId:string,signal?:AbortSignal)=>read<ManagedCall>('detail',{snapshotId,callId},signal),
  export:(filters:MdFilters & Partial<MdPageOptions>,scope:'page'|'all')=>{
    // Native download streams the backend CSV without building it in React memory.
    const anchor = document.createElement('a');
    anchor.href=mdReportUrl('export',{...filters,scope});anchor.download='attica-md-report.csv';anchor.click();
  },
};
