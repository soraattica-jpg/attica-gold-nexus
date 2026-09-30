export const mountBillingList = (app, controller, authorize) => app.get('/api/customerdata/list', authorize('read'), controller.list);
export const mountBillingLookup = (app, controller, authorize) => app.get('/api/customerdata', authorize('read'), controller.lookup);

export function mountBilling(app, controller, authorize) {
  if (typeof authorize !== 'function') throw new Error('Billing requires explicit authorization');
  mountBillingList(app, controller, authorize);
  mountBillingLookup(app, controller, authorize);
}
