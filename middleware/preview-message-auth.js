import { timingSafeEqual } from 'node:crypto';
// Staging-only actors. Never trust sentById, role, or agentId supplied by a caller.
export function createPreviewMessageAuthorization(actors) {
  function actorFor(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!/^Bearer\s+/i.test(req.headers.authorization || '')) return null;
    for (const actor of actors) {
      const a = Buffer.from(token), b = Buffer.from(actor.token);
      if (a.length === b.length && timingSafeEqual(a, b)) return actor;
    }
    return null;
  }
  return (access) => (req, res, next) => {
    const actor = actorFor(req);
    if (!actor) return res.status(401).json({ success: false, error: 'Staging authentication required' });
    if (access === 'admin' && actor.role !== 'admin') return res.status(403).json({ success: false, error: 'Administrator access required' });
    if (actor.role !== 'admin') {
      if (req.path === '/api/admin-broadcast' && req.query.agentId !== actor.id) return res.status(403).json({ success: false, error: 'Only your own admin message is accessible' });
      if (req.path !== '/api/admin-broadcast' && req.path !== '/api/ui-refresh') return res.status(403).json({ success: false, error: 'Administrator access required' });
    }
    if (actor.role === 'admin' && req.body && ['/api/admin-broadcast'].includes(req.path)) {
      if (req.method === 'POST') { req.body.sentById = actor.id; req.body.sentByName = actor.name; }
      if (req.method === 'DELETE') { req.body.clearedById = actor.id; req.body.clearedByName = actor.name; }
    }
    res.locals.actorId = actor.id;
    next();
  };
}
