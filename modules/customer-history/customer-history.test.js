import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createCustomerHistoryService } from './customer-history.service.js';
import { createCustomerHistoryModule } from './index.js';
import { createApp } from '../../app.js';
import { createFixtureDb, createFixtureGeocoding } from '../../tests/fixtures/staging.js';

function fixture(overrides={}) {
  const calls=[{id:'C2'},{id:'C1'}],intakes=[{call_id:'C2'}];
  const repository={resolveByCustomerId:async id=>id==='CID'?'919876543210':'',resolveByPhone:async phone=>phone==='8877665544'?'9876543210':'',
    calls:async(phone,limit)=>{repository.last={phone,limit};return calls;},intakes:async phone=>{repository.lastPhone=phone;return intakes;},...overrides.repository};
  const service=createCustomerHistoryService({repository,serializeCalls:async rows=>rows.map(r=>({callId:r.id})),serializeIntakes:r=>({callId:r.call_id}),
    buildProfile:async(phone,customerId)=>({phone,customerId,hasSavedDetails:true}),...overrides});
  return {service,repository};
}
test('normalizes +91 for lookup but preserves legacy digits-only response phone',async()=>{const {service,repository}=fixture();const result=await service.callsByPhone({phone:'+91 88776-65544'});assert.equal(repository.last.phone,'9876543210');assert.equal(repository.last.limit,100);assert.deepEqual(result,{phone:'918877665544',total:2,results:[{callId:'C2'},{callId:'C1'}]});});
test('customer history uses the same resolver and a 200-row query cap',async()=>{const {service,repository}=fixture();await service.callHistory({phone:'8877665544'});assert.deepEqual(repository.last,{phone:'9876543210',limit:200});});
test('customer ID takes precedence and normalizes linked phone',async()=>{const {service}=fixture();assert.equal(await service.resolve('8877665544','CID'),'9876543210');});
test('unknown primary number remains searchable',async()=>{const {service}=fixture();assert.equal(await service.resolve('8765432109'),'8765432109');});
test('alternate phone resolves to primary for intake history',async()=>{const {service,repository}=fixture();const result=await service.intakes({phone:'8877665544'});assert.equal(repository.lastPhone,'9876543210');assert.deepEqual(result,{phone:'9876543210',total:1,results:[{callId:'C2'}]});});
test('invalid call lookup preserves legacy 200 response payload',async()=>{const {service}=fixture();assert.deepEqual(await service.callsByPhone({phone:'12'}),{error:'Invalid phone',results:[]});});
test('empty intake lookup preserves empty history payload',async()=>{const {service}=fixture();assert.deepEqual(await service.intakes({}),{phone:'',total:0,results:[]});});
test('empty profile includes stable explicit fields',async()=>{const {service}=fixture();const value=await service.profile({});assert.equal(value.hasSavedDetails,false);assert.equal(value.latestDispositionCategory,'');assert.equal(value.customerName,'');});
test('profile passes normalized phone and bounded customer ID',async()=>{const {service}=fixture();const value=await service.profile({phone:'+91 98765 43210',customerId:' CUST '});assert.deepEqual(value,{phone:'9876543210',customerId:'CUST',hasSavedDetails:true});});
test('constructor refuses missing collaborators',()=>assert.throws(()=>createCustomerHistoryService({repository:{}}),/dependencies/));

test('HTTP routes require test auth and keep all other APIs unavailable',async t=>{
  const fakeDb={query:async(sql,params)=>{if(sql.includes('attica_customers')&&sql.includes('normalized_phone=?'))return [[{normalized_phone:params[0]}]];if(sql.includes('attica_calls'))return [[{id:'C1'}]];if(sql.includes('attica_intake_forms'))return [[{call_id:'C1'}]];return [[]];}};
  const module=createCustomerHistoryModule({db:fakeDb,serializeCalls:async rows=>rows,serializeIntakes:r=>r,buildProfile:async p=>({phone:p})});
  const authorize=()=> (req,res,next)=>req.headers.authorization==='Bearer test-reader'?next():res.status(401).json({error:'Staging authentication required'});
  const app=createApp({db:createFixtureDb(),geocoding:createFixtureGeocoding(),staging:true,customerHistory:{...module,authorize}});
  const server=app.listen(0,'127.0.0.1');t.after(()=>server.close());await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/calls/customer-history?phone=9876543210')).status,401);
  const response=await fetch(base+'/api/calls/customer-history?phone=9876543210',{headers:{Authorization:'Bearer test-reader'}});assert.equal(response.status,200);assert.equal((await response.json()).total,1);
  assert.equal((await fetch(base+'/api/customerdata',{headers:{Authorization:'Bearer test-reader'}})).status,404);
});
