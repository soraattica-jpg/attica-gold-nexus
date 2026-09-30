import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

const updates = [
 ['776133','Google LP'],['776254','Google LP'],['776637','Google LP'],['776884','Google LP'],['776889','Google LP'],
 ['777288','Google LP'],['777557','Google LP'],['777618','Google LP'],['777664','Google LP'],['777785','Google LP'],
 ['777965','Google LP'],['778118','Google LP'],['778120','Google LP'],['778171','Google LP'],['778179','Google LP'],
 ['778288','Google LP'],['778737','Google LP'],['779121','Google LP'],['779243','Google LP'],['779384','Google LP'],
 ['779407','Meta Leads'],['779606','Meta Leads'],['779867','Meta Leads'],['779924','Meta Leads'],['780218','Meta Leads'],
 ['780230','Meta Leads'],['780358','Meta Leads'],['780468','Meta Leads'],['780575','Meta Leads'],['780827','Meta Leads']
];
const runId = crypto.randomUUID();
const conn = await mysql.createConnection({host:'127.0.0.1', user:'custom', password:(process.env.ATTICA_DB_PASSWORD || ""), database:'asterisk'});
try {
  await conn.query(`CREATE TABLE IF NOT EXISTS attica_customer_source_attribution_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    update_run_id CHAR(36) NOT NULL,
    remote_id VARCHAR(80) NOT NULL,
    normalized_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    bill_id VARCHAR(80),
    bill_date DATE,
    gross_w VARCHAR(50),
    previous_source VARCHAR(255),
    new_source VARCHAR(255),
    previous_raw_payload LONGTEXT,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_source_audit_run (update_run_id),
    KEY idx_source_audit_remote (remote_id)
  ) ENGINE=InnoDB`);
  await conn.query('START TRANSACTION');
  await conn.query('CREATE TEMPORARY TABLE tmp_source_updates (remote_id VARCHAR(80) PRIMARY KEY, new_source VARCHAR(50) NOT NULL) ENGINE=InnoDB');
  await conn.query('INSERT INTO tmp_source_updates (remote_id,new_source) VALUES ' + updates.map(()=>'(?,?)').join(','), updates.flat());

  const [[counts]] = await conn.query(`SELECT COUNT(*) selected_count, COUNT(DISTINCT remote_id) distinct_count FROM tmp_source_updates`);
  if (counts.selected_count !== 30 || counts.distinct_count !== 30) throw new Error(`Selection count invalid: ${JSON.stringify(counts)}`);

  const [[validation]] = await conn.query(`
    SELECT COUNT(*) row_count,
      SUM(CASE WHEN r.record_date >= '2026-09-01' AND r.record_date < '2026-09-17' THEN 1 ELSE 0 END) date_ok,
      SUM(CASE WHEN LOWER(TRIM(r.status)) IN ('billed','completed') AND LOWER(TRIM(r.transaction_status)) IN ('approved','completed','billed') THEN 1 ELSE 0 END) status_ok,
      SUM(CASE WHEN CAST(NULLIF(REPLACE(r.gross_w,',',''),'') AS DECIMAL(14,3)) > 30 THEN 1 ELSE 0 END) grams_ok,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM attica_calls c WHERE c.normalized_customer_number = RIGHT(REGEXP_REPLACE(COALESCE(r.contact,''),'[^0-9]',''),10)) THEN 1 ELSE 0 END) history_ok,
      COALESCE(SUM(CAST(NULLIF(REPLACE(r.gross_w,',',''),'') AS DECIMAL(14,3))),0) total_grams
    FROM tmp_source_updates s JOIN attica_remote_customer_data r ON r.remote_id=s.remote_id`);
  if (Number(validation.row_count) !== 30 || Number(validation.date_ok) !== 30 || Number(validation.status_ok) !== 30 || Number(validation.grams_ok) !== 30 || Number(validation.history_ok) !== 30) {
    throw new Error(`Eligibility validation failed: ${JSON.stringify(validation)}`);
  }

  const [[jsonCheck]] = await conn.query(`SELECT SUM(JSON_VALID(COALESCE(r.raw_payload,''))=1) valid_json, COUNT(*) total FROM tmp_source_updates s JOIN attica_remote_customer_data r ON r.remote_id=s.remote_id`);
  if (Number(jsonCheck.valid_json) !== 30) throw new Error(`Cannot safely update source JSON: ${JSON.stringify(jsonCheck)}`);

  await conn.query(`INSERT INTO attica_customer_source_attribution_audit
    (update_run_id,remote_id,normalized_phone,customer_name,bill_id,bill_date,gross_w,previous_source,new_source,previous_raw_payload)
    SELECT ?,r.remote_id,RIGHT(REGEXP_REPLACE(COALESCE(r.contact,''),'[^0-9]',''),10),r.customer_name,r.bill_id,r.record_date,r.gross_w,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.raw_payload,'$.howToKnowAttica')),''),s.new_source,r.raw_payload
    FROM tmp_source_updates s JOIN attica_remote_customer_data r ON r.remote_id=s.remote_id`, [runId]);

  const [result] = await conn.query(`UPDATE attica_remote_customer_data r JOIN tmp_source_updates s ON s.remote_id=r.remote_id
    SET r.raw_payload=JSON_SET(r.raw_payload,'$.howToKnowAttica',s.new_source)`);
  if (result.affectedRows !== 30) throw new Error(`Unexpected updated row count: ${result.affectedRows}`);

  const [[verify]] = await conn.query(`SELECT
    COUNT(*) total,
    SUM(JSON_UNQUOTE(JSON_EXTRACT(r.raw_payload,'$.howToKnowAttica'))='Google LP') google_lp,
    SUM(JSON_UNQUOTE(JSON_EXTRACT(r.raw_payload,'$.howToKnowAttica'))='Meta Leads') meta_leads,
    SUM(JSON_UNQUOTE(JSON_EXTRACT(r.raw_payload,'$.howToKnowAttica')) NOT IN ('Google LP','Meta Leads')) other_sources
    FROM tmp_source_updates s JOIN attica_remote_customer_data r ON r.remote_id=s.remote_id`);
  if (Number(verify.total) !== 30 || Number(verify.google_lp) !== 20 || Number(verify.meta_leads) !== 10 || Number(verify.other_sources) !== 0) {
    throw new Error(`Source verification failed: ${JSON.stringify(verify)}`);
  }
  await conn.commit();
  console.log(JSON.stringify({status:'committed',runId,validation,verify,updatedRows:result.affectedRows},null,2));
} catch (e) {
  try { await conn.rollback(); } catch {}
  console.error(JSON.stringify({status:'rolled_back',runId,error:e.message},null,2));
  process.exitCode=1;
} finally { await conn.end(); }
