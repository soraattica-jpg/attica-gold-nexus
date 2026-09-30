import { createCustomerHistoryRepository } from './customer-history.repository.js';
import { createCustomerHistoryService } from './customer-history.service.js';
import { createCustomerHistoryController } from './customer-history.controller.js';
export { mountCustomerHistory, mountCustomerCallsByPhone, mountCustomerProfile, mountIntakeHistory, mountCustomerCallHistory } from './customer-history.routes.js';
export function createCustomerHistoryModule({db,...dependencies}) {
  const service=createCustomerHistoryService({repository:createCustomerHistoryRepository(db),...dependencies});
  return {service,controller:createCustomerHistoryController(service)};
}
