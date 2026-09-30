import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const mysql = createRequire('/root/attica-api/package.json')('mysql2/promise');
const apply = process.argv.includes('--apply');
const days = Number(process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1] || 15);
if (!Number.isInteger(days) || days<1 || days>30) throw new Error('days must be 1..30');
const c = await mysql.createConnection({socketPath:'/run/mysqld/mysqld.sock',user:'root',database:'asterisk',timezone:'Z'});
try {
  const [rows] = await c.query(`WITH f AS (
    SELECT f.*,RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),10) phone10,
      ROW_NUMBER() OVER(PARTITION BY RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),10) ORDER BY follow_up_at,id) rn
    FROM attica_followups f WHERE status IN ('Pending','Rescheduled') AND is_active=1
      AND COALESCE(followup_created_at,created_at)>=UTC_TIMESTAMP()-INTERVAL ? DAY
      AND (followup_expires_at IS NULL OR followup_expires_at>UTC_TIMESTAMP())
  ) SELECT f.* FROM f LEFT JOIN attica_customers cu ON cu.normalized_phone=f.phone10
    WHERE f.rn=1 AND f.phone10 REGEXP '^[6-9][0-9]{9}$'
      AND NOT EXISTS(SELECT 1 FROM attica_blocked_numbers b WHERE b.phone=f.phone10)
      AND NOT EXISTS(SELECT 1 FROM attica_auto_dial_leads a WHERE a.normalized_number=f.phone10
        AND ((a.status IN ('pending','assigned','dialing') AND a.is_active=1)
          OR (a.retry_allowed=0 AND COALESCE(a.queue_exit_reason,'') NOT IN ('','Already Called'))))
      AND NOT EXISTS(SELECT 1 FROM attica_auto_dial_retry_state r WHERE r.normalized_number=f.phone10
        AND r.scope_key LIKE CONCAT(DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE),':%')
        GROUP BY r.normalized_number HAVING SUM(r.attempt_count)>=2 OR MAX(r.connected_once)>0)
      AND LOWER(TRIM(IFNULL(cu.form_status,''))) NOT IN ('not interested','sold out')
      AND LOWER(TRIM(IFNULL(cu.callback_status,''))) NOT IN ('not interested','sold out')`,[days]);
  console.log(JSON.stringify({apply,days,candidates:rows.length,future:rows.filter(row=>new Date(row.follow_up_at)>new Date()).length}));
  if (apply && rows.length) {
    const directory='/root/attica-api/backups/followup-15days-2026-09-10';
    await mkdir(directory,{recursive:true,mode:0o700});
    const [before]=await c.query('SELECT * FROM attica_auto_dial_leads WHERE id IN (?)',[rows.map(row=>row.id)]);
    await writeFile(`${directory}/pending-before-${Date.now()}.json`,JSON.stringify({rows,queue:before}),{mode:0o600});
    const restored=[];let skipped=0;
    for (const f of rows) {
      await c.beginTransaction();
      try {
        const [[current]]=await c.query(`SELECT * FROM attica_followups WHERE id=? AND status IN ('Pending','Rescheduled')
          AND is_active=1 AND (followup_expires_at IS NULL OR followup_expires_at>UTC_TIMESTAMP()) FOR UPDATE`,[f.id]);
        const [[busy]]=await c.query(`SELECT id FROM attica_auto_dial_leads WHERE normalized_number=?
          AND status IN ('pending','assigned','dialing') AND is_active=1 LIMIT 1`,[f.phone10]);
        const [[blocked]]=await c.query('SELECT phone FROM attica_blocked_numbers WHERE phone=?',[f.phone10]);
        const [[stopped]]=await c.query(`SELECT 1 stop FROM attica_auto_dial_leads WHERE normalized_number=?
          AND retry_allowed=0 AND COALESCE(queue_exit_reason,'') NOT IN ('','Already Called') LIMIT 1`,[f.phone10]);
        const [[retry]]=await c.query(`SELECT COALESCE(SUM(attempt_count),0) attempts,COALESCE(MAX(connected_once),0) connected
          FROM attica_auto_dial_retry_state WHERE normalized_number=?
          AND scope_key LIKE CONCAT(DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE),':%')`,[f.phone10]);
        const [[closed]]=await c.query(`SELECT 1 closed FROM attica_customers WHERE normalized_phone=?
          AND (LOWER(TRIM(IFNULL(form_status,''))) IN ('not interested','sold out')
            OR LOWER(TRIM(IFNULL(callback_status,''))) IN ('not interested','sold out')) LIMIT 1`,[f.phone10]);
        if (!current || busy || blocked || stopped || closed || Number(retry.attempts)>=2 || Number(retry.connected)>0
          || String(current.phone).replace(/[^0-9]/g,'').slice(-10)!==f.phone10) {await c.rollback();skipped++;continue;}
        const [[old]]=await c.query('SELECT * FROM attica_auto_dial_leads WHERE id=? FOR UPDATE',[f.id]);
        if(old && (['assigned','dialing'].includes(old.status) || old.assigned_agent_id
          || (old.retry_allowed===0 && old.queue_exit_reason && old.queue_exit_reason!=='Already Called'))) {
          await c.rollback();skipped++;continue;
        }
        const payload={customer_name:current.customer_name || '',mobile_number:f.phone10,normalized_number:f.phone10,
          open_dedupe_number:f.phone10,area:current.branch || '',source_file:'Agent Follow-Up',lead_type:current.followup_reason || 'Scheduled Follow-Up',
          status:'pending',is_active:1,retry_allowed:1,queue_exit_reason:null,assigned_agent_id:null,assigned_agent_name:null,
          assigned_at:null,dial_started_at:null,completed_at:null,scheduled_agent_id:current.agent_id || null,
          scheduled_agent_name:current.agent_name || null,scheduled_for:current.follow_up_at || new Date(),
          followup_created_at:current.followup_created_at || current.created_at,followup_expires_at:current.followup_expires_at,
          followup_reason:current.followup_reason || 'Follow-Up',last_error:'',updated_at:new Date()};
        if(old) await c.query('UPDATE attica_auto_dial_leads SET ? WHERE id=?',[payload,f.id]);
        else await c.query('INSERT INTO attica_auto_dial_leads SET ?',[{id:f.id,...payload}]);
        await c.commit();restored.push(f.id);
      } catch(error) {
        await c.rollback();
        if(error.code==='ER_DUP_ENTRY' || error.code==='ER_LOCK_DEADLOCK'){skipped++;continue;}
        throw error;
      }
    }
    await writeFile(`${directory}/pending-result-${Date.now()}.json`,JSON.stringify({restored,skipped}),{mode:0o600});
    console.log(JSON.stringify({restored:restored.length,skipped}));
  }
} finally {await c.end();}
