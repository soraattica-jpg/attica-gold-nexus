import { createOwnedRouteMount } from '../../shared/owned-route.js';

export const mountLocationIvrRoute = createOwnedRouteMount('location-ivr', {
  '/api/places/autocomplete': ['get'], '/api/places/geocode': ['get'],
  '/api/save-call-language': ['get'], '/api/save-call-ivr': ['get'],
  '/api/call-language/:callerId': ['get'], '/api/call-ivr/:callerId': ['get'],
});
