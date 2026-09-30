export const mountIntakeFormSave=(app,c,a)=>app.post('/api/intake-forms',a('write'),c.saveForm);
export const mountIntakePending=(app,c,a)=>app.get('/api/intake-workflow/pending',a('read'),c.pending);
export const mountIntakeRead=(app,c,a)=>app.get('/api/intake-workflow',a('read'),c.read);
export const mountIntakeMutate=(app,c,a)=>app.post('/api/intake-workflow',a('write'),c.mutate);
export function mountIntake(app,c,a){if(typeof a!=='function')throw new Error('Intake requires explicit authorization');mountIntakeFormSave(app,c,a);mountIntakePending(app,c,a);mountIntakeRead(app,c,a);mountIntakeMutate(app,c,a);}
