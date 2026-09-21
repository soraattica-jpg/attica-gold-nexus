export const mountDashboardStats=(app,c,a)=>app.get('/api/stats',a('read'),c.stats);
export const mountCallDateDetails=(app,c,a)=>app.get('/api/calls/date-details',a('read'),c.dateDetails);
export function mountReports(app,controller,authorize){if(typeof authorize!=='function')throw new Error('Reports requires explicit authorization');mountDashboardStats(app,controller,authorize);mountCallDateDetails(app,controller,authorize);}
