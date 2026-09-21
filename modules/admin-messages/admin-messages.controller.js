import { MessageValidationError } from './admin-messages.validation.js';
export function createAdminMessagesController(service) {
  const action = (fn, fallback, successFlag = false) => async (req, res) => {
    try { return res.json(await fn(req)); }
    catch (error) {
      res.locals?.reportError?.(error);
      return res.status(error instanceof MessageValidationError ? 400 : 500).json({
        ...(successFlag ? { success: false } : {}), error: error?.message || fallback,
      });
    }
  };
  return {
    refresh: action(() => service.getRefresh(), 'Failed to load refresh state'),
    requestRefresh: action((req) => service.requestRefresh(req.body), 'Failed to update refresh state'),
    current: action((req) => service.current(req.query), 'Failed to load admin broadcast'),
    history: action((req) => service.history(req.query), 'Failed to load admin broadcast history'),
    send: action((req) => service.send(req.body), 'Failed to send admin broadcast', true),
    clear: action((req) => service.clear(req.body), 'Failed to clear admin broadcast', true),
    individual: action((req) => service.individual(req.params.id, req.body), 'Failed to update agent message'),
  };
}
