export function mountSeoMarketing(app, controller) {
  app.get('/api/seo-marketing/leads', controller.dashboard);
  app.get('/api/seo-marketing/lead-to-bill/summary', controller.leadToBillSummary);
  app.get('/api/seo-marketing/lead-to-bill/details', controller.leadToBillDetails);
  app.get('/api/seo-marketing/google/status', controller.googleStatus);
  app.get('/api/warroom/marketing/spend', controller.spend);
  app.get('/api/warroom/marketing/spend/export', controller.exportSpend);
  app.get('/api/seo-marketing/leads/export', controller.exportLeads);
}
