import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
const mysql = createRequire('/root/attica-api/package.json')('mysql2/promise');
const source = readFileSync('/root/attica-api/server.js','utf8');
const tree = ts.createSourceFile('server.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadRnrDisconnectedCallsToFollowUpQueue');
assert.ok(declaration);
const database = `attica_followup_reload_test_${process.pid}`;
const root = await mysql.createConnection({socketPath:'/run/mysqld/mysqld.sock',user:'root'});
let pool;
try {
  await root.query(`CREATE DATABASE ${database}`);
  pool = mysql.createPool({socketPath:'/run/mysqld/mysqld.sock',user:'root',database,timezone:'Z',connectionLimit:2});
  for (const table of ['attica_calls','attica_followups','attica_auto_dial_leads','attica_customers','attica_blocked_numbers','attica_auto_dial_retry_state']) {
    await pool.query(`CREATE TABLE ${table} LIKE asterisk.${table}`);
  }
  const scope={pool,AUTO_RNR_DISCONNECTED_FOLLOWUP_LOOKBACK_DAYS:7,MYSQL_QUEUE_NOW_SQL:'UTC_TIMESTAMP()',
    AUTO_DIAL_MAX_ATTEMPTS_PER_NUMBER:2,FOLLOW_UP_RETENTION_DAYS:7,
    formatDateInZone:()=>new Date().toISOString().slice(0,10),triggerAutoDialAssignment:()=>{}};
  const load=compileFunction(`${declaration.getText(tree)}; return loadRnrDisconnectedCallsToFollowUpQueue;`,Object.keys(scope))(...Object.values(scope));
  for (const [id,phone,disposition,age] of [['retry','9000000001','RNR',10],['disconnect','9000000002','Customer Disconnected',2],['too-old','9000000003','RNR',16],['blocked','9000000004','RNR',2],['future','9000000005','RNR',2]]) {
    await pool.query(`INSERT INTO attica_calls (id,caller_id,normalized_customer_number,customer_name,direction,status,callback_status,created_at,ended_at)
      VALUES (?,?,?,'Synthetic Customer','outgoing','failed',?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY),DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY))`,[id,phone,phone,disposition,age,age]);
  }
  await pool.query("INSERT INTO attica_blocked_numbers (phone) VALUES ('9000000004')");
  await pool.query(`INSERT INTO attica_followups(id,phone,status,is_active,follow_up_at,followup_created_at,followup_expires_at,notes)
    VALUES ('RNR-retry','9000000001','Expired',0,UTC_TIMESTAMP()-INTERVAL 10 DAY,UTC_TIMESTAMP()-INTERVAL 10 DAY,UTC_TIMESTAMP()-INTERVAL 3 DAY,'Agent note')`);
  await pool.query(`INSERT INTO attica_auto_dial_leads(id,mobile_number,normalized_number,status,is_active,retry_allowed,followup_expires_at)
    VALUES ('RNR-retry','9000000001','9000000001','completed',0,1,UTC_TIMESTAMP()-INTERVAL 3 DAY)`);
  await pool.query(`INSERT INTO attica_followups(id,phone,status,is_active,follow_up_at,followup_created_at,followup_expires_at)
    VALUES ('RNR-future','9000000005','Pending',1,UTC_TIMESTAMP()+INTERVAL 2 DAY,UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 7 DAY)`);
  const preview=await load({force:true,lookbackDays:15,rnrOnly:true,dryRun:true});
  assert.equal(preview.candidateCount,2);
  const [[before]]=await pool.query("SELECT status,is_active FROM attica_followups WHERE id='RNR-retry'");
  assert.equal(before.status,'Expired'); assert.equal(before.is_active,0);
  const result=await load({force:true,lookbackDays:15,rnrOnly:true});
  assert.equal(result.candidateCount,2);
  const [[row]]=await pool.query(`SELECT f.status,f.notes,f.followup_expires_at>UTC_TIMESTAMP() AS valid,
    a.is_active,a.queue_work_mode,a.followup_expires_at=f.followup_expires_at AS same_expiry
    FROM attica_followups f JOIN attica_auto_dial_leads a ON a.id=f.id WHERE f.id='RNR-retry'`);
  assert.equal(row.status,'Pending');assert.ok(row.notes.startsWith('Agent note'));
  assert.equal(Number(row.valid),1);assert.equal(row.is_active,1);assert.equal(row.queue_work_mode,'follow-up');assert.equal(Number(row.same_expiry),1);
  const [[future]]=await pool.query("SELECT scheduled_for>UTC_TIMESTAMP()+INTERVAL 1 DAY AS future FROM attica_auto_dial_leads WHERE id='RNR-future'");
  assert.equal(Number(future.future),1);
  const again=await load({force:true,lookbackDays:15,rnrOnly:true});assert.equal(again.candidateCount,0);
  const [[count]]=await pool.query('SELECT COUNT(*) n FROM attica_auto_dial_leads');assert.equal(Number(count.n),2);
  console.log('PASS: 13 reload checks: dry run, 15-day scope, RNR-only, blocked exclusions, expiry renewal, future schedule, deduplication.');
} finally {
  if(pool) await pool.end();
  await root.query(`DROP DATABASE IF EXISTS ${database}`);await root.end();
}
