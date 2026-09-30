export function createFollowupsController(service,logger=console){return {
  list:async(req,res)=>{try{res.json(await service.list(req.query));}catch(error){res.status(500).json({error:error.message});}},
  load:async(req,res)=>{try{const remote=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');if(!['127.0.0.1','::1','localhost'].includes(remote))return res.status(403).json({success:false,error:'Local maintenance endpoint only'});res.json(await service.loadRnrDisconnected({...req.query,...req.body,days:req.query.days??req.body?.days}));}catch(error){logger.error?.('[followups/load-rnr-disconnected] failed:',error?.message||error);res.status(500).json({success:false,error:error?.message||'Unable to load follow-up calls'});}},
  save:async(req,res)=>{try{res.json(await service.save(req.body));}catch(error){res.status(500).json({error:error.message});}},
  update:async(req,res)=>{try{res.json(await service.update(req.params.id,req.body));}catch(error){res.status(500).json({error:error.message});}},
  statusList:async(_req,res)=>{try{res.json(await service.statusList());}catch(error){res.status(500).json({error:error.message});}},
  statusUpdate:async(req,res)=>{try{const result=await service.statusUpdate(req.params.id,req.body);res.status(result.status||200).json(result.payload);}catch(error){res.status(500).json({error:error.message});}},
};}
