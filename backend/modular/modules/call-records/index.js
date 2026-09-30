import { createOwnedRouteMount } from '../../shared/owned-route.js';

export const mountCallRecordsRoute = createOwnedRouteMount('call-records', {
  '/api/blocked-numbers': ['get'], '/api/blocked-numbers/:phone': ['put'],
  '/api/calls': ['get', 'post'], '/api/calls/duplicate-audit': ['get'],
  '/api/recordings/:name': ['get'], '/api/recordings': ['get'],
  '/api/missed/today': ['get'], '/api/missed': ['get'], '/api/missed/:id/callback': ['put'],
  '/api/live-waiting-queue': ['get'],
});
