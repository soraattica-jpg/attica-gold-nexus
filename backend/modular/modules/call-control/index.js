import { createOwnedRouteMount } from '../../shared/owned-route.js';

export const mountCallControlRoute = createOwnedRouteMount('call-control', {
  '/api/admin/incoming-2of5-gate/status': ['get'], '/api/admin/incoming-5of10-gate/status': ['get'],
  '/api/admin/incoming-2of5-gate/control': ['post'], '/api/live-call-monitor': ['post'],
  '/api/calls/conference': ['post'], '/api/calls/transfer': ['post'],
  '/api/transfer-context': ['get', 'post'], '/api/transfer-context/resolve': ['post'],
});
