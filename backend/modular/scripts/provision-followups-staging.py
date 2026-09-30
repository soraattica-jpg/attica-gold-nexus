"""Create isolated synthetic follow-up preview storage with no dialer grants."""
from pathlib import Path
import json,secrets,subprocess
root=Path(__file__).resolve().parents[1];private=root/'.private';private.mkdir(mode=0o700,exist_ok=True);schema='attica_next_followups';user='attica_followups_preview'
found=subprocess.check_output(['mysql','-N','-B','-e',f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{schema}'"],text=True)
if found.strip():raise SystemExit('Schema already exists; no changes made.')
password=secrets.token_hex(32)
sql=f'''CREATE DATABASE {schema};
CREATE TABLE {schema}.attica_followups (id VARCHAR(100) PRIMARY KEY,customer_name VARCHAR(255),phone VARCHAR(30),branch VARCHAR(255),follow_up_at DATETIME NULL,status VARCHAR(40),agent_id VARCHAR(60),agent_name VARCHAR(255),notes TEXT,outcome VARCHAR(100),source_call_id VARCHAR(100),source_status VARCHAR(100),created_at DATETIME,updated_at DATETIME,INDEX idx_due(status,follow_up_at));
CREATE TABLE {schema}.attica_status_followup_queue (id VARCHAR(100) PRIMARY KEY,phone VARCHAR(30),form_status VARCHAR(100),is_active TINYINT,updated_at DATETIME,source_call_id VARCHAR(100),follow_up_id VARCHAR(100));
CREATE TABLE {schema}.test_followup_candidates (id VARCHAR(100) PRIMARY KEY,customer_name VARCHAR(255),phone VARCHAR(30),branch VARCHAR(255),follow_up_at DATETIME,agent_id VARCHAR(60),agent_name VARCHAR(255),source_call_id VARCHAR(100),reason VARCHAR(40),occurred_at DATETIME,processed_at DATETIME NULL);
INSERT INTO {schema}.attica_followups VALUES ('TEST-FOLLOWUP-1','Staging Customer','9000000001','Staging Branch',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),'Pending','TEST_IN','Staging Incoming','Synthetic follow-up','RNR','TEST-CALL-2','RNR',UTC_TIMESTAMP(),UTC_TIMESTAMP());
INSERT INTO {schema}.attica_status_followup_queue VALUES ('TEST-STATUS-1','9000000003','RNR',1,UTC_TIMESTAMP(),'TEST-CALL-ID','TEST-FOLLOWUP-STATUS');
INSERT INTO {schema}.test_followup_candidates VALUES ('CAND-1','RNR Customer','9000000004','Staging Branch',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),'TEST_OUT','Staging Outgoing','TEST-RNR-1','RNR',UTC_TIMESTAMP(),NULL),('CAND-2','Disconnected Customer','9000000005','Staging Branch',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),'TEST_OUT','Staging Outgoing','TEST-DISC-1','Disconnected',UTC_TIMESTAMP(),NULL);
CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}';GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.* TO '{user}'@'localhost';'''
subprocess.run(['mysql'],input=sql,text=True,check=True,capture_output=True);p=private/'followups-preview-db.json';p.write_text(json.dumps({'host':'127.0.0.1','user':user,'password':password,'database':schema}));p.chmod(0o600);print('Provisioned isolated synthetic follow-up preview database; no telephony grants exist.')
