import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.createSourceFile('server.js',fs.readFileSync('/root/attica-api/server.js','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const definitions=new Map(source.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(source)]));
const normalize=value=>String(value||'').trim();
const base={console:{warn(){}},normalizeQueryDate:normalize,normalizeAutoDialPhone:normalize,normalizeAgentId:normalize,
  cleanJustDialString:normalize,parsePositiveInteger:(value,fallback)=>Number(value)||fallback,getIstDateString:()=> '2026-09-09',
  CUSTOMER_DATA_REMOTE_CACHE_MS:30000,CUSTOMER_DATA_REMOTE_TIMEOUT_MS:8000,CUSTOMER_DATA_TRANSACTION_CACHE_MS:900000,
  CUSTOMER_DATA_TRANSACTION_SYNC_LIMIT:500,CUSTOMER_DATA_REMOTE_URL:'https://example.invalid/customerdata',
  CUSTOMER_DATA_TRANSACTION_URL:'https://example.invalid/transactions',CUSTOMER_DATA_BILL_ATTRIBUTION_METHOD:'unchanged',
  remoteCustomerDataSyncInFlight:null,remoteCustomerDataRefreshInFlight:null,remoteCustomerDataLastSyncedAt:0,
  remoteCustomerDataListCache:null,remoteCustomerDataListCacheKey:'',remoteCustomerDataListCacheExpiresAt:0,
  remoteCustomerTransactionCache:new Map(),clearRemoteCustomerDataListCache() {}};
const load=(names,values={})=>{
  const context=vm.createContext({...base,...values});
  vm.runInContext(names.map(name=>{
    assert.ok(definitions.has(name),`Missing ${name}`);return definitions.get(name);
  }).join('\n'),context);
  return context;
};
let checks=0;
const bill={remoteId:'R1',billId:'B1',contact:'9000000000',date:'2026-09-09',time:'10:00',firstAgentId:'AG001',firstAgentName:'Agent',grossW:'12',netW:'11'};
let refreshCalls=0;
const list=load(['fetchRemoteCustomerDataRowsByDate','dedupeRemoteCustomerDataRowsByContactDate','getRemoteCustomerDataDedupeKey','compareRemoteCustomerDataRowsNewestFirst'],{
  refreshRemoteCustomerDataInBackground:()=>{refreshCalls++;return new Promise(()=>{});},
  fetchCachedRemoteCustomerDataRowsByDate:async date=>{assert.equal(date,'2026-09-09');return [bill,{...bill,remoteId:'R2'}];},
  fetchBillAttributionsForRemoteRows:async()=>new Map(),fetchCallCenterAgentByPhoneForRemoteRows:async()=>new Map([['9000000000',{agentId:'AG001',agentName:'Agent'}]]),
});
let timeout;
try {
  const rows=await Promise.race([list.fetchRemoteCustomerDataRowsByDate('2026-09-09',5000,{force:true}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('List waited for external API')),500);})]);
  assert.equal(rows.length,1); assert.equal(rows[0].netW,'11'); assert.equal(refreshCalls,1);checks+=3;
} finally {clearTimeout(timeout);}
await list.fetchRemoteCustomerDataRowsByDate('2026-09-09'); assert.equal(refreshCalls,1);checks++;

let releases=0,unlocks=0,sourceCalls=0;
let resolveSource;
const connection={query:async sql=>{if(sql.includes('RELEASE_LOCK'))unlocks++;return [[{locked:1}]];},release:()=>{releases++;}};
const background=load(['refreshRemoteCustomerDataInBackground'],{
  pool:{getConnection:async()=>connection},syncRemoteCustomerDataCache:async()=>{sourceCalls++;await new Promise(resolve=>{resolveSource=resolve;});},
  syncRemoteCustomerDataCacheIfStale:async()=>{},syncRemoteCustomerTransactionsForDate:async()=>{},
});
const first=background.refreshRemoteCustomerDataInBackground('2026-09-09',{force:true});
const second=background.refreshRemoteCustomerDataInBackground('2026-09-09',{force:true});
assert.equal(first,second);checks++;
await new Promise(resolve=>setImmediate(resolve));resolveSource();await first;
assert.equal(sourceCalls,1);assert.equal(unlocks,1);assert.equal(releases,1);checks+=3;
background.syncRemoteCustomerDataCache=async()=>{throw new Error('503');};
await background.refreshRemoteCustomerDataInBackground('2026-09-09',{force:true});
assert.equal(unlocks,2);assert.equal(releases,2);assert.equal(background.remoteCustomerDataRefreshInFlight,null);checks+=3;

let fetches=0;
const transaction=load(['fetchRemoteCustomerTransactionsByPhone'],{
  remoteCustomerTransactionCache:new Map(),fetchJsonWithTimeout:async()=>{fetches++;throw new Error('503');},normalizeCustomerTransactionRows:rows=>rows,
});
await assert.rejects(transaction.fetchRemoteCustomerTransactionsByPhone('9000000000'),/503/);
await assert.rejects(transaction.fetchRemoteCustomerTransactionsByPhone('9000000000'),/503/);
assert.equal(fetches,2);assert.equal(transaction.remoteCustomerTransactionCache.size,0);checks+=2;
transaction.fetchJsonWithTimeout=async()=>[];
await transaction.fetchRemoteCustomerTransactionsByPhone('9000000000');
assert.equal(transaction.remoteCustomerTransactionCache.size,1);checks++;

let attempts=0,updates=0;
const enrich=load(['syncRemoteCustomerTransactionsForDate'],{
  pool:{query:async sql=>{
    if(sql.includes('UPDATE')){updates++;return [];}return [Array.from({length:20},(_,i)=>({remote_id:`R${i}`,contact:`90000000${String(i).padStart(2,'0')}`}))];
  }},fetchRemoteCustomerTransactionsByPhone:async()=>{attempts++;throw new Error('503');},
});
await enrich.syncRemoteCustomerTransactionsForDate('2026-09-09',{force:true});
assert.equal(attempts,3);assert.equal(updates,0);checks+=2;
let enrichmentSql='',enrichmentParams=[];
enrich.pool.query=async(sql,params)=>{
  if(sql.includes('UPDATE')){enrichmentSql=sql;enrichmentParams=params;return [];}
  return [[{remote_id:'R1',contact:'9000000000',status:'Release',gross_w:'12',net_w:'11'}]];
};
enrich.fetchRemoteCustomerTransactionsByPhone=async()=>[{billId:'B1',status:'Approved'}];
enrich.pickRemoteCustomerTransaction=(_,transactions)=>transactions[0];
enrich.getRemoteCustomerBillId=row=>row.billId;
enrich.getTransactionGrossWeight=()=>'';enrich.getTransactionNetWeight=()=>'';
enrich.roundMoneyAmount=value=>value;enrich.getTransactionBillingAmount=()=>1000;
enrich.deriveRemoteCustomerOrnamentType=()=>'';
await enrich.syncRemoteCustomerTransactionsForDate('2026-09-09',{force:true});
assert.ok(!/\bstatus\s*=/.test(enrichmentSql));assert.equal(enrichmentParams[1],'Approved');checks+=2;

let upserts=0,prunes=0;
const sync=load(['syncRemoteCustomerDataCache'],{
  pool:{getConnection:async()=>connection},fetchJsonWithTimeout:async()=>({error:'Not available'}),
  upsertRemoteCustomerDataRows:async()=>{upserts++;return 1;},pruneStaleRemoteCustomerDataRows:async()=>{prunes++;return 0;},
});
await assert.rejects(sync.syncRemoteCustomerDataCache(),/Unexpected customer billing API response/);
assert.equal(upserts,0);assert.equal(prunes,0);assert.equal(sync.remoteCustomerDataLastSyncedAt,0);checks+=3;
let resolveFetch,sourceFetches=0;
sync.fetchJsonWithTimeout=async()=>{sourceFetches++;return new Promise(resolve=>{resolveFetch=resolve;});};
const sync1=sync.syncRemoteCustomerDataCache(),sync2=sync.syncRemoteCustomerDataCache({force:true});
await new Promise(resolve=>setImmediate(resolve));resolveFetch([bill]);await Promise.all([sync1,sync2]);
assert.equal(sourceFetches,1);assert.equal(upserts,1);assert.equal(prunes,1);checks+=3;
console.log(`PASS: ${checks} billing cache checks (nonblocking reads, deduplication, locks, retry, outage circuit breaker, payload validation).`);
