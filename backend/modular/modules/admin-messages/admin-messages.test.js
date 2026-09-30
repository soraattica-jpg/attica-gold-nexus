import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { once } from 'node:events';
import { readBaseline, parseSource, routeCall } from '../../scripts/source-tools.js';
import { createAdminMessagesModule } from './index.js';
import { createTestAdminMessageSink, connectTestAgent } from '../../events/test-admin-message-sink.js';
import { createPreviewMessageAuthorization } from '../../middleware/preview-message-auth.js';
import { createApp } from '../../app.js';
import { createFixtureDb, createFixtureGeocoding } from '../../tests/fixtures/staging.js';
import { getAdminBroadcastExpiryDate } from './admin-messages.validation.js';
const FIXED = Date.parse('2026-09-21T10:00:00Z');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [FIXED])); } static now() { return FIXED; } }
const source = readBaseline();
const functions = ['serializeAdminBroadcastRecord','getActiveAdminBroadcast','adminBroadcastAppliesToAgent','getAdminBroadcastExpiryDate','normalizeAgentId','parsePositiveInteger','toApiIsoString','toDatabaseDateTime','normalizeAgentUpdateValue'];
const paths = ['/api/admin-broadcast','/api/admin-broadcast/history','/api/ui-refresh','/api/agents/:id'];
const oldCode = parseSource(source).body.filter((n) =>
  (n.type === 'FunctionDeclaration' && functions.includes(n.id.name))
  || (n.type === 'VariableDeclaration' && ['ADMIN_BROADCAST_SCOPES','ADMIN_BROADCAST_EXPIRIES'].includes(n.declarations[0]?.id.name))
  || (n.expression && routeCall(n.expression) && paths.includes(n.expression.arguments[0]?.value) && !(n.expression.arguments[0]?.value === '/api/agents/:id' && n.expression.callee.property.name !== 'put')))
  .map((n) => source.slice(n.start,n.end)).join('\n');
const record = { id: 1, message: 'Test message', recipient_scope: 'all', expiry_code: 'until-cleared', is_active: 1, sent_at: '2026-09-21T10:00:00Z', sent_by_id: 'TEST_ADMIN1', sent_by_name: 'Test Admin' };
const agent = { id: 'TEST_IN', role: 'agent', status: 'active', is_logged_in: 1, incoming_access: 1, outgoing_access: 1, follow_up_access: 1, admin_message: 'Private test' };
const json = (x) => JSON.parse(JSON.stringify(x));
async function run(spec, legacy) {
  const queries=[], handlers=new Map();let i=0, invalidations=0;
  const db={async query(sql,params){queries.push({sql:sql.trim().replace(/\s+/g,' '),params:params??null});const outcome=spec.outcomes?.[i++];if(!outcome)throw new Error('Unexpected query');if(outcome.error)throw new Error(outcome.error);return [structuredClone(outcome.rows??[])];}};
  const sink=createTestAdminMessageSink();let state={token:'initial',scope:'none',reason:'',triggeredAt:new FixedDate().toISOString()};
  if(legacy){
    const app=Object.fromEntries(['get','post','put','delete'].map(m=>[m,(p,fn)=>handlers.set(m+' '+p,fn)]));
    const context={app,pool:db,Date:FixedDate,DISPLAY_TIME_ZONE:'Asia/Kolkata',uiRefreshState:state,
      getReportedComputerIp:()=>'',sanitizeLoginDeviceId:()=>'',isStaleAgentLoginUpdate:()=>false,isAgentBreakStatusValue:()=>false,
      invalidateAgentsEndpointCache:()=>{invalidations++;}};
    vm.createContext(context);vm.runInContext(oldCode,context);state=()=>context.uiRefreshState;
  }else{
    const feature=createAdminMessagesModule({db,events:sink,refreshState:{get:()=>state,set:n=>{state=n;}},clock:()=>new FixedDate(),invalidateAgents:()=>{invalidations++;}});
    for(const [route,name] of Object.entries({'get /api/ui-refresh':'refresh','post /api/ui-refresh':'requestRefresh','get /api/admin-broadcast':'current','get /api/admin-broadcast/history':'history','post /api/admin-broadcast':'send','delete /api/admin-broadcast':'clear','put /api/agents/:id':'individual'}))handlers.set(route,feature.controller[name]);
  }
  let status=200,body;const res={status(s){status=s;return this;},json(v){body=json(v);return this;}};
  await handlers.get(spec.route)({body:{},query:{},params:{id:'TEST_IN'},...spec.request},res);
  assert.equal(i,spec.outcomes?.length||0);
  const result=json({status,body,queries,invalidations,refresh:typeof state==='function'?state():state});
  if(!legacy){if(status>=400)assert.equal(sink.list().length,0);else if(['post','put','delete'].includes(spec.route.split(' ')[0]))assert.equal(sink.list().length,1);}
  return result;
}
const cases=[
 {name:'no active message',route:'get /api/admin-broadcast',outcomes:[{rows:[]}]},
 {name:'admin current view',route:'get /api/admin-broadcast',outcomes:[{rows:[record]}]},
 {name:'unknown agent',route:'get /api/admin-broadcast',request:{query:{agentId:'missing'}},outcomes:[{rows:[record]},{rows:[]}]},
 {name:'private plus broadcast',route:'get /api/admin-broadcast',request:{query:{agentId:' test_in '}},outcomes:[{rows:[record]},{rows:[agent]}]},
 {name:'duplicate message text',route:'get /api/admin-broadcast',request:{query:{agentId:'TEST_IN'}},outcomes:[{rows:[record]},{rows:[{...agent,admin_message:' Test message '}]}]},
 {name:'non-agent',route:'get /api/admin-broadcast',request:{query:{agentId:'TEST_IN'}},outcomes:[{rows:[record]},{rows:[{...agent,role:'admin'}]}]},
 {name:'load error',route:'get /api/admin-broadcast',outcomes:[{error:'offline'}]},
 {name:'missing message',route:'post /api/admin-broadcast'},
 {name:'bad scope',route:'post /api/admin-broadcast',request:{body:{message:'Test',recipientScope:'invalid'}}},
 {name:'bad expiry',route:'post /api/admin-broadcast',request:{body:{message:'Test',expiry:'invalid'}}},
 {name:'history error',route:'get /api/admin-broadcast/history',outcomes:[{error:'offline'}]},
 {name:'clear error',route:'delete /api/admin-broadcast',outcomes:[{error:'offline'}]},
 {name:'clear active',route:'delete /api/admin-broadcast',request:{body:{clearedById:' Test ',clearedByName:' Admin '}},outcomes:[{rows:{affectedRows:2}}]},
 {name:'clear no message',route:'delete /api/admin-broadcast',outcomes:[{rows:{affectedRows:0}}]},
 {name:'refresh read',route:'get /api/ui-refresh'},
 {name:'refresh invalid scope',route:'post /api/ui-refresh',request:{body:{scope:'oops',reason:'x'.repeat(300)}}},
 {name:'refresh all',route:'post /api/ui-refresh',request:{body:{scope:'ALL',reason:'Test'}}},
];
for(const scope of ['all','online','incoming','outgoing','follow-up','manual-dial']){
 for(const loggedIn of [0,1,'1'])cases.push({name:`audience ${scope}, login ${JSON.stringify(loggedIn)}`,route:'get /api/admin-broadcast',request:{query:{agentId:'TEST_IN'}},outcomes:[{rows:[{...record,recipient_scope:scope}]},{rows:[{...agent,is_logged_in:loggedIn,status:scope==='manual-dial'?'manual-outgoing':'active'}]}]});
 cases.push({name:`send ${scope}`,route:'post /api/admin-broadcast',request:{body:{message:' Test message ',recipientScope:scope,sentById:' TEST_ADMIN1 ',sentByName:' Admin '}},outcomes:[{rows:{affectedRows:1}},{rows:{insertId:1}},{rows:[{...record,recipient_scope:scope}]}]});
}
for(const expiry of ['until-cleared','30-minutes','1-hour','2-hours','end-of-day'])cases.push({name:`expiry ${expiry}`,route:'post /api/admin-broadcast',request:{body:{message:'x'.repeat(600),expiry}},outcomes:[{rows:{}},{rows:{insertId:1}},{rows:[record]}]});
for(const limit of [undefined,'0','1','101','invalid','-1','12x'])cases.push({name:`history limit ${limit}`,route:'get /api/admin-broadcast/history',request:{query:{limit}},outcomes:[{rows:[record]}]});
for(const message of ['  Individual message  ','',null,'x'.repeat(600)])cases.push({name:`individual ${String(message).slice(0,20)}`,route:'put /api/agents/:id',request:{body:{adminMessage:message}},outcomes:[{rows:{affectedRows:1}}]});
for(const stage of [0,1,2])cases.push({name:`save failure at query ${stage}`,route:'post /api/admin-broadcast',request:{body:{message:'Test'}},outcomes:[{rows:{}},{rows:{insertId:1}},{rows:[record]}].slice(0,stage).concat({error:'write failed'})});
for(const spec of cases)test('legacy Admin Messages: '+spec.name,async()=>assert.deepEqual(await run(spec,false),await run(spec,true)));

test('IST end-of-day expiry at midnight boundary',()=>{
 assert.equal(getAdminBroadcastExpiryDate('end-of-day',Date.parse('2026-09-21T18:29:59Z')).toISOString(),'2026-09-21T18:30:00.000Z');
 assert.equal(getAdminBroadcastExpiryDate('end-of-day',Date.parse('2026-09-21T18:30:00Z')).toISOString(),'2026-09-22T18:30:00.000Z');
});

test('preview denies unauthorized, forged identity and mixed agent edits before database access',async(t)=>{
 let writes=0;const feature=createAdminMessagesModule({db:{query:async()=>{writes++;return [[]];}},events:createTestAdminMessageSink(),refreshState:{get:()=>({}),set:()=>{}}});
 const actors=[{id:'TEST_ADMIN1',name:'Test Admin',role:'admin',token:'admin-test-token'},{id:'TEST_IN',role:'agent',token:'agent-test-token'}];
 const app=createApp({db:createFixtureDb(),geocoding:createFixtureGeocoding(),staging:true,logger:{info(){},error(){}},adminMessages:{...feature,events:createTestAdminMessageSink(),authorize:createPreviewMessageAuthorization(actors)}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 const call=(path,method='GET',token,body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('/api/admin-broadcast','POST',undefined,{message:'Test'})).status,401);
 assert.equal((await call('/api/admin-broadcast','POST','agent-test-token',{message:'Test',role:'admin',sentById:'TEST_ADMIN1'})).status,403);
 assert.equal((await call('/api/admin-broadcast?agentId=TEST_OTHER','GET','agent-test-token')).status,403);
 assert.equal((await call('/api/admin-broadcast/history','GET','agent-test-token')).status,403);
 assert.equal((await call('/api/agents/TEST_IN','PUT','agent-test-token',{adminMessage:'Test'})).status,403);
 assert.equal((await call('/api/agents/TEST_IN','PUT','admin-test-token',{adminMessage:'Test',status:'active'})).status,405);
 assert.equal(writes,0);
 assert.equal((await call('/api/agents/TEST_IN','PUT','admin-test-token',{adminMessage:'Test'})).status,200);
 assert.equal(writes,1);
});


test('test event adapter recovers after a transient lookup or display failure', async () => {
  const sink = createTestAdminMessageSink();
  let message = 'Initial', failLookup = false, failDisplay = false;
  const displayed = [];
  const connection = await connectTestAgent({ agentId: 'TEST_IN', sink,
    service: { current: async () => { if (failLookup) throw new Error('Temporary lookup outage'); return { message }; } },
    onMessage: async (value) => { if (failDisplay) throw new Error('Temporary display outage'); displayed.push(value.message); },
  });
  message = 'Updated'; failLookup = true;
  await assert.rejects(connection.refresh());
  failLookup = false; failDisplay = true;
  await assert.rejects(connection.refresh());
  failDisplay = false;
  await connection.refresh();
  assert.deepEqual(displayed, ['Initial', 'Updated']);
  connection.close();
  message = 'Closed'; await sink.publish({ kind: 'broadcast' });
  assert.deepEqual(displayed, ['Initial', 'Updated']);
});
