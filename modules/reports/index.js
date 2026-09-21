import {createReportsRepository} from './reports.repository.js';import {createReportsService} from './reports.service.js';import {createReportsController} from './reports.controller.js';
export {mountReports,mountDashboardStats,mountCallDateDetails} from './reports.routes.js';
export function createReportsModule(adapters){const service=createReportsService(createReportsRepository(adapters));return {service,controller:createReportsController(service)};}
