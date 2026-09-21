import { createOwnedRouteMount } from '../../shared/owned-route.js';

export const mountAutoDialRoute = createOwnedRouteMount('auto-dial', {
  '/api/auto-dial/control': ['get', 'put'], '/api/auto-dial/leads': ['get'],
  '/api/auto-dial/import': ['post'], '/api/auto-dial/agent/:agentId/current': ['get'],
  '/api/auto-dial/leads/:id': ['put'],
});
