import { createResponseCache } from './seo-marketing.cache.js';
import { createSeoMarketingController } from './seo-marketing.controller.js';
import { createSeoMarketingRepository } from './seo-marketing.repository.js';
import { createSeoMarketingService } from './seo-marketing.service.js';

export { mountSeoMarketing } from './seo-marketing.routes.js';
export * from './seo-marketing.cache.js';
export * from './seo-marketing.validation.js';

export function createSeoMarketingModule({ adapters, getBusinessDate, getRole }) {
  const repository = createSeoMarketingRepository(adapters);
  const service = createSeoMarketingService({ repository, responseCache: createResponseCache(), getBusinessDate });
  return { repository, service, controller: createSeoMarketingController(service, getRole) };
}
