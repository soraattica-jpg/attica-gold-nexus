export function createReportsController(service) {
  return {
    stats:async(_req,res)=>{try{res.json(await service.stats());}catch(error){res.status(500).json({error:error.message});}},
    dateDetails:async(req,res)=>{try{res.json(await service.dateDetails(req.query));}catch(error){res.status(error.status||500).json(error.payload||{error:error.message,results:[]});}},
  };
}
