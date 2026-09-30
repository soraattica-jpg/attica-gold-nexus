export function createFollowupsService(repository) {
  return {
    async list(query={}) {
      await repository.expire();
      const requested=Number.parseInt(query.limit,10);
      const limit=Number.isFinite(requested)?Math.min(repository.maxLimit,Math.max(1,requested)):repository.defaultLimit;
      return (await repository.list(limit)).map(repository.serialize);
    },
    async loadRnrDisconnected(input={}) {
      const requested=Number.parseInt(input.days,10);
      const lookbackDays=Math.max(1,Math.min(30,Number.isFinite(requested)&&requested>0?requested:7));
      const result=await repository.loadRnrDisconnected({force:true,lookbackDays,rnrOnly:input.reason==='rnr',rnrDisconnectedOnly:input.reason==='rnr-disconnected',includePreviouslyProcessed:input.includePreviouslyProcessed===true,dryRun:input.dryRun===true});
      return {success:true,lookbackDays,...result};
    },
    async save(body){await repository.save(body);return {success:true};},
    async update(id,body){await repository.update(String(id||'').trim(),body);return {success:true};},
    async statusList(){await repository.expire();return (await repository.statusList()).map(repository.serializeStatus);},
    async statusUpdate(id,body){return repository.statusUpdate(String(id||'').trim(),body||{});},
  };
}
