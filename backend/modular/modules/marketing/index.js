import { createOwnedRouteMount } from '../../shared/owned-route.js';

export const mountMarketingRoute = createOwnedRouteMount('marketing', {
  '/api/seo-marketing/leads': ['get'], '/api/seo-marketing/lead-to-bill/summary': ['get'],
  '/api/seo-marketing/lead-to-bill/details': ['get'], '/api/seo-marketing/google/status': ['get'],
  '/api/warroom/marketing/spend': ['get'], '/api/warroom/marketing/spend/export': ['get'],
  '/api/seo-marketing/leads/export': ['get'],
});
