export const mountDashboardStats=(app,c,a)=>app.get('/api/stats',a('read'),c.stats);
export const mountCallDateDetails=(app,c,a)=>app.get('/api/calls/date-details',a('read'),c.dateDetails);
export const mountReportSummary=(app,c,a)=>app.get('/api/calls/report-summary',a('read'),c.reportSummary);
export const mountCallList=(app,c,a)=>app.get('/api/calls/list',a('read'),c.list);
export const mountCallExport=(app,c,a)=>app.get('/api/calls/export',a('read'),c.exportCsv);
export function mountReports(app,controller,authorize){if(typeof authorize!=='function')throw new Error('Reports requires explicit authorization');mountDashboardStats(app,controller,authorize);mountCallDateDetails(app,controller,authorize);mountReportSummary(app,controller,authorize);mountCallList(app,controller,authorize);mountCallExport(app,controller,authorize);}
