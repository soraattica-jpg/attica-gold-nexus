export const mountSendSms = (app, controller, authorize) => app.post('/api/send-sms', authorize('send'), controller.send);
export const mountSmsLog = (app, controller, authorize) => app.get('/api/sms-log', authorize('read'), controller.list);
export const mountSmsDelivery = (app, controller) => app.all('/api/sms/dlr', controller.delivery);

export function mountSms(app, controller, authorize) {
  if (typeof authorize !== 'function') throw new Error('SMS requires explicit authorization');
  mountSendSms(app, controller, authorize);
  mountSmsLog(app, controller, authorize);
  mountSmsDelivery(app, controller);
}
