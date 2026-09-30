import { createBillingRepository } from './billing.repository.js';
import { createBillingService } from './billing.service.js';
import { createBillingController } from './billing.controller.js';

export { mountBilling, mountBillingList, mountBillingLookup } from './billing.routes.js';

export function createBillingModule(adapters, logger = console) {
  const service = createBillingService(createBillingRepository(adapters));
  return { service, controller: createBillingController(service, logger) };
}
