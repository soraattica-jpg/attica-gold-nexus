import assert from 'node:assert/strict';
import fs from 'node:fs';
import XLSX from 'xlsx';
import { normalizeMdPhone } from '../deployment/md-reporting.mjs';

const base = process.env.MD_TEST_API || 'http://127.0.0.1:3001/api/md-dashboard';
const file = process.env.MD_TEST_SNAPSHOT;
if (!file) throw new Error('Set MD_TEST_SNAPSHOT to a saved summary response');
const summary = JSON.parse(fs.readFileSync(file,'utf8'));
const scope = {snapshotId:summary.snapshotId};
let checks = 0;
let maxBytes = 0;
let maxMs = 0;
async function get(path,params) {
  const started = performance.now();
  const response = await fetch(`${base}/${path}?${new URLSearchParams({...scope,...params})}`);
  assert.equal(response.status,200); checks++;
  const text = await response.text();
  maxBytes = Math.max(maxBytes,Buffer.byteLength(text));
  maxMs = Math.max(maxMs,performance.now()-started);
  return JSON.parse(text);
}
for (const [metric,key] of [['total','total'],['inbound','inbound'],['outbound','outbound'],['unique','uniqueCallers'],['missed','missed']]) {
  const total = summary.summary[key];
  const ids = new Set(),phones = new Set();
  for(let page=1;page<=Math.max(1,Math.ceil(total/50));page++) {
    const data = await get('records',{metric,page,pageSize:50});
    assert.equal(data.totalRecords,total);assert.ok(data.rows.length<=50);
    assert.equal(data.dataAsOf,summary.dataAsOf);
    for(const row of data.rows) {
      assert.ok(!ids.has(row.id));ids.add(row.id);
      assert.ok(!('notes' in row));assert.ok(!('recordingName' in row));
      if(metric==='unique') {const phone=normalizeMdPhone(row.callerId);assert.ok(phone);assert.ok(!phones.has(phone));phones.add(phone);}
      if(metric==='inbound')assert.equal(row.direction,'incoming');
      if(metric==='outbound')assert.equal(row.direction,'outgoing');
    }
  }
  assert.equal(ids.size,total);checks++;
  console.log(`${metric}: ${total} records, every page verified`);
}
for(const [bucket,key] of [['languages','language'],['sources','source'],['dispositions','disposition'],['dispositionCategories','category'],['branches','branch']]) {
  for(const row of summary[bucket]) {
    const result=await get('records',{[key]:row[key]});
    assert.equal(result.totalRecords,row.calls);checks++;
  }
  assert.equal(summary[bucket].reduce((n,r)=>n+r.calls,0),summary.summary.total);checks++;
}
for(let hour=0;hour<24;hour++)assert.equal((await get('records',{hour})).totalRecords,summary.hourly[hour].calls);
for(const agent of summary.agents)assert.equal((await get('records',{agent:agent.id})).totalRecords,Number(agent.total));
for(const pageSize of [25,100])assert.equal((await get('records',{pageSize})).rows.length,Math.min(pageSize,summary.summary.total));
for(const [exportScope,expected] of [['page',Math.min(50,summary.summary.inbound)],['all',summary.summary.inbound]]) {
  const response=await fetch(`${base}/export?${new URLSearchParams({...scope,metric:'inbound',scope:exportScope,page:1,pageSize:50})}`);
  assert.equal(response.status,200);
  const csv=await response.text();const book=XLSX.read(csv,{type:'string',raw:true});
  const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.equal(rows.length,expected);assert.ok(rows.every(r=>r.Direction==='incoming'));checks++;
  console.log(`${exportScope} CSV: ${rows.length} incoming calls`);
}
console.log(JSON.stringify({checks,maxJsonBytes:maxBytes,maxRequestMs:Math.round(maxMs),dataAsOf:summary.dataAsOf}));
