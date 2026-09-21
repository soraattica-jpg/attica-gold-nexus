import {normalizeReportDate,normalizeReportAgent} from './reports.validation.js';
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
  };
}
