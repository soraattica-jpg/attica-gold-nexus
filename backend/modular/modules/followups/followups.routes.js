export const mountFollowupsList=(app,c,a)=>app.get('/api/followups',a('read'),c.list);
export const mountFollowupsLoad=(app,c,a)=>app.post('/api/followups/load-rnr-disconnected',a('maintenance'),c.load);
export const mountFollowupsSave=(app,c,a)=>app.post('/api/followups',a('write'),c.save);
export const mountFollowupsUpdate=(app,c,a)=>app.put('/api/followups/:id',a('write'),c.update);
export const mountStatusFollowupsList=(app,c,a)=>app.get('/api/status-followups',a('read'),c.statusList);
export const mountStatusFollowupsUpdate=(app,c,a)=>app.put('/api/status-followups/:id',a('write'),c.statusUpdate);
export function mountFollowups(app,c,a){if(typeof a!=='function')throw new Error('Follow-ups requires explicit authorization');mountFollowupsList(app,c,a);mountFollowupsLoad(app,c,a);mountFollowupsSave(app,c,a);mountFollowupsUpdate(app,c,a);mountStatusFollowupsList(app,c,a);mountStatusFollowupsUpdate(app,c,a);}
