import {createFollowupsRepository} from './followups.repository.js';import {createFollowupsService} from './followups.service.js';import {createFollowupsController} from './followups.controller.js';
export * from './followups.routes.js';
export function createFollowupsModule(adapters,logger=console){const service=createFollowupsService(createFollowupsRepository(adapters));return {service,controller:createFollowupsController(service,logger)};}
