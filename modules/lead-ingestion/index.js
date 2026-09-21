import { createOwnedRouteMount } from '../../shared/owned-route.js';

export const mountLeadIngestionRoute = createOwnedRouteMount('lead-ingestion', {
  '/api/justdial/lead-receiver': ['all'], '/api/justdial/lead_receiver': ['all'],
  '/api/justdial-leads/lead-receiver': ['all'], '/api/justdial-leads/lead_receiver': ['all'],
  '/api/justdial/leads': ['get'], '/api/lead-source-counts/today': ['get'],
  '/api/auto-dial/source-coverage-report': ['get'], '/api/justdial/leads/export-followups': ['post'],
  '/api/justdial/leads/:leadId/queue-autodial': ['post'],
  '/api/website-leads/form-receiver': ['all'], '/api/website-leads/form_receiver': ['all'],
  '/api/website-leads/form-push': ['all'], '/api/website-leads/lead-receiver': ['all'],
  '/api/website-leads': ['get'], '/api/website-leads/export-followups': ['post'],
  '/api/website-leads/:leadId/queue-autodial': ['post'], '/api/blog-leads': ['get'],
  '/api/blog-leads/export-followups': ['post'], '/api/internal/meta-leads/ingest': ['post'],
  '/api/meta-leads': ['get'], '/api/meta-leads/export-followups': ['post'],
  '/api/meta-leads/:leadId/queue-autodial': ['post'], '/api/google-leads': ['get'],
});
