import { createAdminMessagesRepository } from './admin-messages.repository.js';
import { createAdminMessagesService } from './admin-messages.service.js';
import { createAdminMessagesController } from './admin-messages.controller.js';
export { mountAdminMessages, mountIndividualMessage } from './admin-messages.routes.js';
export function createAdminMessagesModule({ db, ...dependencies }) {
  const service = createAdminMessagesService({ repository: createAdminMessagesRepository(db), ...dependencies });
  return { service, controller: createAdminMessagesController(service) };
}
