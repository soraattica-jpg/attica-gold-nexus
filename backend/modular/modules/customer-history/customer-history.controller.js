import { emptyProfile } from './customer-history.validation.js';
export function createCustomerHistoryController(service) {
  const history = (fn) => async (req,res) => { try { res.json(await fn(req.query)); } catch(error) { res.status(500).json({error:error.message,results:[]}); } };
  return {
    callsByPhone: history(service.callsByPhone), callHistory: history(service.callHistory), intakes: history(service.intakes),
    profile: async (req,res) => { try { res.json(await service.profile(req.query)); }
      catch(error) { res.status(500).json({error:error.message,...emptyProfile()}); } },
  };
}
