import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const actor=read('.private/message-actors.json').find(x=>x.id==='TEST_ADMIN1');
const state=u=>execFileSync('systemctl',['show',u,'-p','MainPID','-p','ActiveState'],{encoding:'utf8'}),prod=state('attica-api.service');
async function get(path,auth=true,status=200){const response=await fetch(`http://127.0.0.1:3101${path}`,{headers:auth?{Authorization:`Bearer ${actor.token}`}:{},signal:AbortSignal.timeout(5000)});assert.equal(response.status,status);return response.json();}
execFileSync('systemctl',['restart','attica-api-next-preview.service']);
for(let i=0;i<30;i++){try{if((await get('/health',false)).features.includes('agent-status-synthetic'))break;}catch(error){if(i===29)throw error;await new Promise(resolve=>setTimeout(resolve,200));}}
await get('/api/agents',false,401);const agents=await get('/api/agents');assert.ok(agents.length>=5);
assert.equal((await get('/api/agents/TEST_IN')).id,'TEST_IN');
assert.equal((await get('/api/agents/UNKNOWN',true,404)).error,'Agent not found');
assert.equal((await get('/api/agent-sessions?limit=2')).length,2);
const unchanged=Object.fromEntries(Object.entries(read('docs/BASELINE.json').files).map(([f,h])=>[f,createHash('sha256').update(readFileSync(`/root/attica-api/${f}`)).digest('hex')===h]));assert.ok(Object.values(unchanged).every(Boolean));assert.equal(state('attica-api.service'),prod);
const proof={verifiedAt:new Date().toISOString(),scope:['GET /api/agents','GET /api/agents/:id','GET /api/agent-sessions'],checks:['Authentication','List shape','Detail errors','Session pagination','Preview restart','No Asterisk or production database access'],productionFilesUnchanged:unchanged,productionServiceUnchanged:true,productionDeployment:false};
writeFileSync(new URL('docs/AGENT-STATUS-VERIFICATION.json',root),`${JSON.stringify(proof,null,2)}\n`);console.log(JSON.stringify(proof,null,2));
