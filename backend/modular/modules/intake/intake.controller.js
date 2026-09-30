export function createIntakeController(service,logger=console){return{
 saveForm:async(req,res)=>{try{const result=await service.saveForm(req.body||{});res.status(result.status).json(result.payload);}catch(error){const status=service.statusForSaveError(error),code=service.errorCode(error);logger.error?.('Intake form save failed:',{statusCode:status,stage:'intake-form-upsert',code,message:error?.message||error});res.status(status).json({success:false,error:error?.message||'Unable to save the intake form',stage:'intake-form-upsert',code:code||undefined,status});}},
 pending:async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await service.pending(req.query));}catch{res.status(503).json({success:false,error:'Unable to restore pending intake'});}},
 read:async(req,res)=>{try{res.json(await service.read(req.query));}catch{res.status(503).json({success:false,error:'Pending Server Save'});}},
 mutate:async(req,res)=>{try{res.json(await service.mutate(req.body||{}));}catch(error){res.status(Number(error.statusCode)||503).json({success:false,error:error.message||'Pending Server Save'});}},
};}
