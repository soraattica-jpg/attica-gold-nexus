import { parseSmsCallbackPayload } from './sms.validation.js';

export function createSmsController(service, logger = console) {
  return {
    send: async (req, res) => {
      try { const result = await service.send(req.body); res.status(result.status).json(result.payload); }
      catch (error) { res.status(500).json({ error: error.message }); }
    },
    list: async (req, res) => {
      try { res.json(await service.list(req.query)); }
      catch (error) { res.status(500).json({ error: error.message }); }
    },
    delivery: async (req, res) => {
      try { const result = await service.delivery(parseSmsCallbackPayload(req)); res.status(result.status).json(result.payload); }
      catch (error) { logger.error?.('[sms] delivery callback failed:', error?.message || error); res.status(200).json({ success: false }); }
    },
  };
}
