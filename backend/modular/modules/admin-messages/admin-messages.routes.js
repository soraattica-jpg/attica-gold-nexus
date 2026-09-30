import { isMessageOnlyUpdate } from './admin-messages.validation.js';
export function mountAdminMessages(app, controller, authorize) {
  if (typeof authorize !== 'function') throw new Error('Admin Messages requires an explicit authorization adapter');
  app.get('/api/ui-refresh', authorize('read'), controller.refresh);
  app.post('/api/ui-refresh', authorize('admin'), controller.requestRefresh);
  app.get('/api/admin-broadcast', authorize('read'), controller.current);
  app.get('/api/admin-broadcast/history', authorize('admin'), controller.history);
  app.post('/api/admin-broadcast', authorize('admin'), controller.send);
  app.delete('/api/admin-broadcast', authorize('admin'), controller.clear);
}
export function mountIndividualMessage(app, controller, authorize) {
  // Only the existing message-only payload is extracted. Mixed agent updates
  // continue to the original handler; no session, queue or call logic moves.
  app.put('/api/agents/:id', (req, res, next) => {
    if (!isMessageOnlyUpdate(req.body)) return next();
    return authorize('admin')(req, res, () => controller.individual(req, res));
  });
}
