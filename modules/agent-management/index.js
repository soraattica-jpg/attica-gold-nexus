import { createOwnedRouteMount } from '../../shared/owned-route.js';

export const mountAgentManagementRoute = createOwnedRouteMount('agent-management', {
  '/api/breaks': ['get', 'post'], '/api/agent-languages': ['get', 'post'], '/api/live-agents': ['get'],
  '/api/frontend-errors': ['post'], '/api/agents': ['post'], '/api/agents/:id': ['put'],
  '/api/agents/:id/call-slot/claim': ['post'], '/api/agents/:id/call-slot/release': ['post'],
  '/api/agents/:id/call-state/reset': ['post'], '/api/agents/:id/password': ['put'], '/api/login': ['post'],
});
