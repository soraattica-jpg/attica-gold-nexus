import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createMdReporting, mountMdReporting, normalizeMdPhone } from '../deployment/md-reporting.mjs';
import XLSX from 'xlsx';
const require = createRequire('/root/attica-api/package.json');
const mysql = require('mysql2/promise');
const express = require('express');
const root = await mysql.createConnection({socketPath:'/run/mysqld/mysqld.sock',user:'root'});
const database = `attica_md_test_${process.pid}`;
let pool,server;
let checks = 0;
const check = (actual,expected) => {assert.deepEqual(actual,expected);checks++;};
try {
  await root.query(`CREATE DATABASE ${database}`);
  pool = mysql.createPool({socketPath:'/run/mysqld/mysqld.sock',user:'root',database,timezone:'Z',connectionLimit:8});
  await pool.query(`CREATE TABLE fixture_calls (id varchar(120) PRIMARY KEY,created_at datetime(3),payload text,INDEX(created_at,id))`);
  const values = Array.from({length:1035},(_,i)=>{
    const phone=String(9000000000+i%896);
    return [`TEST-${String(i).padStart(5,'0')}`,'2026-09-10 06:00:00',JSON.stringify({
      callerId:i%3===0?`+91 ${phone.slice(0,5)} ${phone.slice(5)}`:i%3===1?`0${phone}`:phone,
      customerName:i===17?'Quoted "Name", next\nline':`Customer ${i}`,
      agentId:i%2?'AG001':'AG002',agentName:i%2?'First':'Second',
      direction:i<389?'incoming':'outgoing',date:'2026-09-10',time:'11:30:00',status:'completed',
      talkDurationSeconds:i%4?30:0,callbackStatus:i%2?'Planning to Visit':'Pending',
      dispositionCategory:i%2?'QL':'Others',language:i%3?'Telugu':'Tamil',
      branch:i%2?'Branch A':'Branch B',leadSource:i%2?'Website':'Manual',report_hour:i%24,
    })];
  });
  await pool.query('INSERT INTO fixture_calls VALUES ?',[values]);
  let batches=0,details=0;
  const service = createMdReporting({pool,
    readBatch:async(connection,filters,cursor,limit)=>{
      batches++;
      const [rows]=await connection.query(`SELECT * FROM fixture_calls WHERE created_at>=? AND created_at<?
        ${cursor?'AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT ?`,
        [filters.fromDate,`${filters.toDate} 23:59:59`,...(cursor?[cursor.createdAt,cursor.createdAt,cursor.id]:[]),limit]);
      return rows.map(row=>({...row,report_hour:JSON.parse(row.payload).report_hour,
        report_answered:JSON.parse(row.payload).talkDurationSeconds>0?1:0,
        report_missed:JSON.parse(row.payload).direction==='incoming'&&Number(row.id.slice(-5))%8===0?1:0}));
    },normalizeRows:async rows=>rows.map(row=>({id:row.id,...JSON.parse(row.payload)})),
    readDetail:async id=>{details++;return {id,notes:'Only loaded on demand'};},
  });
  const first=await service.summary({fromDate:'2026-09-10',toDate:'2026-09-10'});
  check(first.summary.total,1035);check(first.summary.inbound,389);check(first.summary.outbound,646);check(first.summary.uniqueCallers,896);
  check(first.languages.reduce((n,r)=>n+r.calls,0),1035);check(first.dispositions.reduce((n,r)=>n+r.calls,0),1035);
  check(first.dispositionCategories.reduce((n,r)=>n+r.calls,0),1035);check(first.hourly.reduce((n,r)=>n+r.calls,0),1035);
  check(first.hourly.map(r=>r.hour),Array.from({length:24},(_,h)=>`${String(h).padStart(2,'0')}:00`));
  check(details,0);check(batches,6);
  const scope={snapshotId:first.snapshotId};
  for(const [metric,total] of [['inbound',389],['outbound',646],['unique',896],['total',1035],['missed',first.summary.missed]]) {
    const ids=[];
    for(let page=1;page<=Math.ceil(total/50);page++) {
      const data=await service.records({...scope,metric,page});
      check(data.totalRecords,total);assert.ok(data.rows.length<=50);ids.push(...data.rows.map(row=>row.id));
    }
    check(ids.length,total);check(new Set(ids).size,total);
  }
  check((await service.records({...scope,metric:'inbound',page:8})).rows.length,39);
  check((await service.records({...scope,pageSize:100})).rows.length,100);
  check((await service.records({...scope,pageSize:9999})).rows.length,50);
  check((await service.records({...scope,pageSize:25})).rows.length,25);
  check((await service.records({...scope,source:'Website'})).totalRecords,517);
  check((await service.records({...scope,language:'Telugu'})).totalRecords,690);
  check((await service.records({...scope,category:'QL'})).totalRecords,517);
  check((await service.records({...scope,disposition:'Planning to Visit',agent:'AG001'})).totalRecords,517);
  const hour=await service.records({...scope,hour:1});check(hour.totalRecords,first.hourly[1].calls);
  const empty=await service.records({...scope,search:'not a real customer'});check(empty.totalRecords,0);check(empty.rows,[]);
  check((await service.records({...scope,search:'Customer 1020'})).totalRecords,1);
  const before=await service.records({...scope,page:2});
  await pool.query("DELETE FROM fixture_calls WHERE id='TEST-00000'");
  await pool.query("UPDATE fixture_calls SET payload=JSON_SET(payload,'$.customerName','CHANGED')");
  const after=await service.records({...scope,page:2});check(after.rows,before.rows);
  check((await service.summary(scope)).summary,first.summary);
  check((await service.detail({...scope,callId:'TEST-00000'})).notes,'Only loaded on demand');check(details,1);
  await assert.rejects(()=>service.records({...scope,metric:'spend'}),/Unsupported/);checks++;
  await assert.rejects(()=>service.summary({fromDate:'2026-02-31',toDate:'2026-03-01'}),/Valid Start/);checks++;
  check(['+91 98765 43210','919876543210','09876543210','98765-43210'].map(normalizeMdPhone),Array(4).fill('9876543210'));
  check(normalizeMdPhone(''),null);check(normalizeMdPhone('68711237'),null);
  const app=express();mountMdReporting(app,service);server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  for(const [scopeName,expected] of [['all',389],['page',50]]) {
    const url=`http://127.0.0.1:${server.address().port}/api/md-dashboard/export?${new URLSearchParams({...scope,metric:'inbound',scope:scopeName})}`;
    const response=await fetch(url);check(response.status,200);
    const csv=await response.text();
    const sheet=XLSX.read(csv,{type:'string',raw:true}).Sheets.Sheet1;
    const rows=XLSX.utils.sheet_to_json(sheet);
    check(rows.length,expected);check(rows.every(r=>r.Direction==='incoming'),true);
    if(scopeName==='all')check(rows.some(r=>r.Customer==='Quoted "Name", next\nline'),true);
  }
  await pool.query('UPDATE attica_md_snapshots SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND');
  await assert.rejects(()=>service.records(scope),error=>error.status===410);checks++;
  console.log(`PASS: ${checks} MD checks: complete aggregates, page navigation, unique callers, filters, immutable snapshot, CSV, expiry.`);
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  if(pool)await pool.end();
  await root.query(`DROP DATABASE IF EXISTS ${database}`);await root.end();
}
