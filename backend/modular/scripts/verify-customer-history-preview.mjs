import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
const root=new URL('../',import.meta.url);const read=file=>JSON.parse(readFileSync(new URL(file,root),'utf8'));
const actor=read('.private/message-actors.json').find(item=>item.id==='TEST_IN');assert.ok(actor);
const state=unit=>execFileSync('systemctl',['show',unit,'-p','MainPID','-p','ActiveState','-p','ActiveEnterTimestamp'],{encoding:'utf8'});
const productionBefore=state('attica-api.service');
async function request(path,{auth=true,status=200}={}){let response;for(let i=0;i<20;i++){try{response=await fetch('http://127.0.0.1:3101'+path,{headers:auth?{Authorization:'Bearer '+actor.token}:{},signal:AbortSignal.timeout(5000)});break;}catch(error){if(i===19)throw error;await new Promise(r=>setTimeout(r,100));}}assert.equal(response.status,status,path);return response.json();}
const config=read('.private/customer-history-db.json');const db=await mysql.createConnection(config);
try{
  await assert.rejects(db.query("UPDATE attica_customers SET notes='x' WHERE customer_uid='TEST-CUSTOMER-1'"),e=>e.errno===1142);
  for(const sql of ['SELECT COUNT(*) FROM asterisk.attica_calls','UPDATE asterisk.attica_calls SET notes=notes WHERE 1=0']) await assert.rejects(db.query(sql),e=>[1044,1142].includes(e.errno));
}finally{await db.end();}
await request('/api/customer-profile?phone=9000000001',{auth:false,status:401});
const primary=await request('/api/calls/customer-history?phone=9000000001');
const country=await request('/api/calls/customer-history?phone=%2B919000000001');
const alternate=await request('/api/calls/customer-history?phone=9000000002');
assert.equal(primary.total,2);assert.equal(country.phone,'919000000001');assert.deepEqual(country.results,primary.results);assert.deepEqual(alternate.results,primary.results);
const intake=await request('/api/intake-forms/phone?phone=9000000002');assert.equal(intake.phone,'9000000001');assert.equal(intake.total,2);
const profile=await request('/api/customer-profile?phone=9000000002');assert.equal(profile.customerId,'TEST-CUSTOMER-1');assert.equal(profile.customerName,'Staging Customer');assert.equal(profile.language,'Kannada');
const idFallback=await request('/api/customer-profile?customerId=TEST-CUSTOMER-CALL');assert.equal(idFallback.phone,'9000000003');
assert.deepEqual(await request('/api/calls/phone?phone=12'),{error:'Invalid phone',results:[]});
const previewBefore=state('attica-api-next-preview.service');execFileSync('systemctl',['restart','attica-api-next-preview.service']);
let recovered=false;for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));try{if((await request('/health',{auth:false})).features.includes('customer-history')){recovered=true;break;}}catch{}}
assert.ok(recovered);assert.notEqual(state('attica-api-next-preview.service'),previewBefore);assert.equal((await request('/api/calls/customer-history?phone=9000000002')).total,2);
const unchanged=Object.fromEntries(Object.entries(read('docs/BASELINE.json').files).map(([file,hash])=>[file,createHash('sha256').update(readFileSync('/root/attica-api/'+file)).digest('hex')===hash]));
assert.ok(Object.values(unchanged).every(Boolean));assert.equal(state('attica-api.service'),productionBefore);
const proof={verifiedAt:new Date().toISOString(),previewPort:3101,dataset:'synthetic-select-only',checks:['Authentication required','Primary/+91/alternate identity parity','Customer-ID fallback','Newest-first calls and intakes','Reusable profile fields','Database writes and production access denied','Preview restart persistence'],productionFilesUnchanged:unchanged,productionServiceUnchanged:true,productionDeployment:false};
writeFileSync(new URL('docs/CUSTOMER-HISTORY-VERIFICATION.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
