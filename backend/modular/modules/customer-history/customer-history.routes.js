export function mountCustomerHistory(app, controller, authorize) {
  if (typeof authorize !== 'function') throw new Error('Customer History requires an explicit authorization adapter');
  mountCustomerCallsByPhone(app,controller,authorize);
  mountCustomerProfile(app,controller,authorize);
  mountIntakeHistory(app,controller,authorize);
  mountCustomerCallHistory(app,controller,authorize);
}
export const mountCustomerCallsByPhone=(app,c,a)=>app.get('/api/calls/phone',a('read'),c.callsByPhone);
export const mountCustomerProfile=(app,c,a)=>app.get('/api/customer-profile',a('read'),c.profile);
export const mountIntakeHistory=(app,c,a)=>app.get('/api/intake-forms/phone',a('read'),c.intakes);
export const mountCustomerCallHistory=(app,c,a)=>app.get('/api/calls/customer-history',a('read'),c.callHistory);
