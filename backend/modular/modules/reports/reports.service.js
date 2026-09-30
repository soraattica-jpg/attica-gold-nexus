import {normalizeReportDate,normalizeReportAgent,reportFilters,validateReportRange} from './reports.validation.js';
export function createReportsService(repository) {
  return {
    async stats() {
      const today=repository.businessDate();
      const [summary,queue,hourly]=await Promise.all([repository.dashboardSummary(today),repository.queueMetrics(),repository.hourly({date:today})]);
      return {total:summary.total,inbound:summary.inbound,outbound:summary.outbound,answered:summary.answered,missed:summary.missed,
        incomingTotal:summary.incomingTotal,incomingAnswered:summary.incomingAnswered,incomingMissed:summary.incomingMissed,incomingUnique:summary.incomingUnique,
        outgoingTotal:summary.outgoingTotal,outgoingQueue:queue.outgoingQueue,outgoingDialed:summary.outgoingDialed,outgoingAnswered:summary.outgoingAnswered,
        outgoingUnique:summary.outgoingUnique,outgoingUniqueAnswered:summary.outgoingUniqueAnswered,followUpTotal:summary.followUpTotal,
        followUpQueue:queue.followUpQueue,followUpDialed:summary.followUpDialed,followUpAnswered:summary.followUpAnswered,
        followUpUnique:summary.followUpUnique,followUpUniqueAnswered:summary.followUpUniqueAnswered,hourly};
    },
    async dateDetails(query={}) {
      const date=normalizeReportDate(query.date),agentId=normalizeReportAgent(query.agentId);
      if(!date){const error=new Error('date required');error.status=400;error.payload={error:'date required',results:[]};throw error;}
      const rows=await repository.dateRows({date,agentId});const serialized=await repository.serializeRows(rows);const summary=repository.summarizeRows(serialized);
      return {date,...summary,summary,results:serialized};
    },
    async reportSummary(query={}) {
      const filters=reportFilters(query);validateReportRange(filters);
      const key=repository.summaryCacheKey(filters),now=Date.now(),cached=repository.summaryCache.get(key);
      if(cached&&cached.expiresAt>now)return cached.promise;
      const shared=repository.readSharedSummary(key);if(shared){repository.summaryCache.set(key,{expiresAt:now+repository.summaryCacheTtl,promise:Promise.resolve(shared)});return shared;}
      const promise=(async()=>{const dispositionKey=filters.disposition?repository.normalizeDisposition(filters.disposition):'';
        if(!filters.source&&!dispositionKey){const [summary,hourly,breakdowns]=await Promise.all([repository.filteredSummary(filters),repository.filteredHourly(filters),repository.filteredBreakdowns(filters)]);return {summary,hourly,...breakdowns,rowCount:summary.total,maxRows:0};}
        const rows=await repository.filteredRows({...filters,disposition:''});
        const byDisposition=dispositionKey?rows.filter(row=>repository.normalizeDisposition(row?.callbackStatus||row?.callback_status||row?.formStatus||row?.form_status||row?.disposition||'')===dispositionKey):rows;
        const sourceKey=repository.normalizeSource(filters.source);const filtered=filters.source?byDisposition.filter(row=>repository.normalizeSource(row?.leadSource||(row?.direction==='incoming'?'Incoming':'Manual'))===sourceKey):byDisposition;
        return repository.buildAnalytics(filtered,{});
      })();
      repository.summaryCache.set(key,{expiresAt:now+repository.summaryCacheTtl,promise});
      promise.then(payload=>repository.writeSharedSummary(key,payload));
      if(repository.summaryCache.size>40)for(const [cacheKey,entry] of repository.summaryCache.entries())if(!entry||entry.expiresAt<=now||repository.summaryCache.size>40)repository.summaryCache.delete(cacheKey);
      promise.catch(()=>repository.summaryCache.delete(key));return promise;
    },
    async list(query={}) {
      const page=Math.max(1,Number.parseInt(query.page,10)||1),limit=Math.min(repository.maxListLimit,Math.max(10,Number.parseInt(query.limit,10)||repository.defaultListLimit));
      const filters=reportFilters(query);if(!filters.source)return repository.databaseList({filters,page,limit});
      const rows=await repository.filteredRows({...filters,source:''}),sourceKey=repository.normalizeSource(filters.source),filtered=rows.filter(row=>repository.normalizeSource(row?.leadSource||'Manual')===sourceKey),total=filtered.length,offset=(page-1)*limit;
      return {page,limit,total,totalPages:total>0?Math.ceil(total/limit):0,summary:repository.summarizeRows(filtered),results:repository.compactRows(filtered.slice(offset,offset+limit))};
    },
    async exportCsv(query,res){const filters=reportFilters(query);validateReportRange(filters);return repository.exportCsv({filters,res});},
  };
}
