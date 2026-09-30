import { createSmsRepository } from './sms.repository.js';
import { createSmsService } from './sms.service.js';
import { createSmsController } from './sms.controller.js';

export { mountSms, mountSendSms, mountSmsLog, mountSmsDelivery } from './sms.routes.js';
export { createDatabaseSmsRepository } from './sms.repository.js';
export { normalizeSmsDeliveryStatus, normalizeSmsDateTime, firstSmsValue, parseSmsCallbackPayload } from './sms.validation.js';

export function createSmsModule(adapters, provider, options = {}) {
  const service = createSmsService(createSmsRepository(adapters), provider, options);
  return { service, controller: createSmsController(service, options.logger) };
}
