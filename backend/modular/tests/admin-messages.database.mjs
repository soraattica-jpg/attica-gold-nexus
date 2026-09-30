import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { createAdminMessagesModule } from '../modules/admin-messages/index.js';
import { createTestAdminMessageSink, connectTestAgent } from '../events/test-admin-message-sink.js';
const config=JSON.parse(readFileSync(new URL('../.private/messages-contract-db.json',import.meta.url),'utf8'));
assert.equal(config.database,'attica_next_messages_contract');assert.equal(config.user,'attica_msg_contract');
const NOW=Date.parse('2026-09-21T10:00:00Z');
function feature(db,sink=createTestAdminMessageSink(),clock=()=>new Date(NOW),logger=console){
 let state={token:'initial',scope:'none',reason:'',triggeredAt:new Date(NOW).toISOString()};
 return {...createAdminMessagesModule({db,events:sink,refreshState:{get:()=>state,set:n=>{state=n;}},clock,logger}),sink};
}
async function withFixture(fn){
 const db=await mysql.createConnection(config);await db.query('SET timestamp=?',[NOW/1000]);await db.beginTransaction();
 try{await fn(db);}finally{await db.rollback();await db.end();}
}

test('MariaDB: all recipient groups, direct messages, offline reconnect and next intake resolve saved state',()=>withFixture(async db=>{
 const {service,sink}=feature(db);const ids=['TEST_IN','TEST_OUT','TEST_FOLLOW','TEST_MANUAL','TEST_OFF'];
 const expected={all:['TEST_IN','TEST_OUT','TEST_FOLLOW','TEST_MANUAL'],online:['TEST_IN','TEST_OUT','TEST_FOLLOW','TEST_MANUAL'],incoming:['TEST_IN'],outgoing:['TEST_OUT','TEST_MANUAL'],'follow-up':['TEST_FOLLOW'],'manual-dial':['TEST_MANUAL']};
 for(const [scope,eligible] of Object.entries(expected)){
   const sent=await service.send({message:'Test '+scope,recipientScope:scope,sentById:'TEST_ADMIN1'});
   assert.equal(sent.success,true);
   for(const agentId of ids){const current=await service.current({agentId});assert.equal(current.active,eligible.includes(agentId),scope+' '+agentId);assert.equal(current.message,eligible.includes(agentId)?'Test '+scope:'');}
 }
 await service.individual('TEST_IN',{adminMessage:' Private message '});
 await service.send({message:'General notice',recipientScope:'all'});
 assert.equal((await service.current({agentId:'TEST_IN'})).message,'General notice  •  Private message');
 const received=[];const connected=await connectTestAgent({agentId:'TEST_IN',service,sink,onMessage:v=>received.push(v)});
 assert.equal(received.at(-1).message,'General notice  •  Private message');
 connected.close();await service.send({message:'Sent while disconnected',recipientScope:'all'});
 const reopened=[];const freshService=feature(db).service;
 const connection=await connectTestAgent({agentId:'TEST_IN',service:freshService,sink,onMessage:v=>reopened.push(v)});
 assert.equal(reopened.at(-1).message,'Sent while disconnected  •  Private message');connection.close();
 assert.equal((await service.current({agentId:'TEST_OFF'})).active,false);
 await db.query("UPDATE attica_agents SET is_logged_in=1 WHERE id='TEST_OFF'");
 assert.equal((await feature(db).service.current({agentId:'TEST_OFF'})).message,'Sent while disconnected');
 await assert.rejects(db.query('SELECT COUNT(*) FROM asterisk.attica_agents'),e=>[1044,1142].includes(e.errno));
}));

test('MariaDB: expiry and clear remove display, keep private text and retain audit records',()=>withFixture(async db=>{
 const {service,sink}=feature(db);await service.individual('TEST_IN',{adminMessage:'Private'});
 await service.send({message:'Expires soon',expiry:'30-minutes',sentById:'TEST_ADMIN1',sentByName:'Admin One'});
 const displays=[];const conn=await connectTestAgent({agentId:'TEST_IN',service,sink,onMessage:v=>displays.push(v)});
 assert.equal(displays.at(-1).active,true);
 await db.query('SET timestamp=?',[NOW/1000+1801]);
 await conn.refresh();assert.equal(displays.at(-1).active,false);assert.equal(displays.at(-1).message,'Private');
 const clear=await service.clear({clearedById:'TEST_ADMIN2',clearedByName:'Admin Two'});assert.equal(clear.cleared,1);
 const history=await service.history({});assert.equal(history.length,1);assert.equal(history[0].active,false);assert.equal(history[0].clearedById,'TEST_ADMIN2');assert.equal(history[0].sentById,'TEST_ADMIN1');
 await service.send({message:'New',expiry:'until-cleared'});assert.equal(displays.at(-1).message,'New  •  Private');
 await service.clear({clearedById:'TEST_ADMIN1'});assert.equal(displays.at(-1).message,'Private');conn.close();
}));

test('MariaDB: concurrent admins retain history and newest persisted message; reordered events cannot revive stale text',async()=>{
 const a=await mysql.createConnection(config),b=await mysql.createConnection(config);
 try{
  await a.query('DELETE FROM attica_admin_broadcasts');
  await a.query('SET timestamp=?',[NOW/1000]);await b.query('SET timestamp=?',[NOW/1000]);
  const sink=createTestAdminMessageSink(),first=feature(a,sink),second=feature(b,sink);
  await Promise.all([first.service.send({message:'First admin',sentById:'TEST_ADMIN1'}),second.service.send({message:'Second admin',sentById:'TEST_ADMIN2'})]);
  const history=await first.service.history({});assert.equal(history.length,2);assert.deepEqual(new Set(history.map(r=>r.sentById)),new Set(['TEST_ADMIN1','TEST_ADMIN2']));
  const current=await first.service.current({agentId:'TEST_IN'});assert.equal(current.broadcast.id,Math.max(...history.map(r=>r.id)));
  const received=[];const c=await connectTestAgent({agentId:'TEST_IN',service:first.service,sink,onMessage:v=>received.push(v)});
  await sink.publish({kind:'broadcast',scope:'all'});await sink.publish({kind:'broadcast',scope:'all'});
  assert.equal(received.length,1);assert.equal(received[0].message,current.message);c.close();
 }finally{await a.query('DELETE FROM attica_admin_broadcasts');await a.end();await b.end();}
});

test('MariaDB: event sink failure does not undo saved message or cause duplicate insertion',()=>withFixture(async db=>{
 const logs=[];const events={publish:async()=>{throw new Error('transport unavailable');}};
 const {service}=feature(db,events,()=>new Date(NOW),{error:x=>logs.push(JSON.parse(x))});
 assert.equal((await service.send({message:'Saved despite transport outage'})).success,true);
 assert.equal((await service.history({})).length,1);assert.equal((await feature(db).service.current({agentId:'TEST_IN'})).message,'Saved despite transport outage');
 assert.equal(logs[0].event,'admin_message_delivery_error');
}));
