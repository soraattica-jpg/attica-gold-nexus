"""Create isolated intake workflow preview storage."""
from pathlib import Path
import json,secrets,subprocess
root=Path(__file__).resolve().parents[1];private=root/'.private';private.mkdir(mode=0o700,exist_ok=True);schema='attica_next_intake';user='attica_intake_preview'
if subprocess.check_output(['mysql','-N','-B','-e',f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{schema}'"],text=True).strip():raise SystemExit('Schema already exists; no changes made.')
password=secrets.token_hex(32);sql=f'''CREATE DATABASE {schema};
CREATE TABLE {schema}.attica_calls(id VARCHAR(120) PRIMARY KEY,status VARCHAR(40),agent_id VARCHAR(20));
CREATE TABLE {schema}.attica_intake_forms(call_id VARCHAR(120) PRIMARY KEY,intake_token VARCHAR(120) UNIQUE,normalized_phone VARCHAR(20),customer_name VARCHAR(255),agent_id VARCHAR(20),agent_name VARCHAR(100),language VARCHAR(30),business_type VARCHAR(100),purpose VARCHAR(150),notes TEXT,submission_status VARCHAR(32),submitted_at DATETIME(3),submission_method VARCHAR(20),last_saved_at DATETIME(3));
CREATE TABLE {schema}.attica_intake_workflows(call_id VARCHAR(120) PRIMARY KEY,intake_token VARCHAR(120) UNIQUE,agent_id VARCHAR(20),agent_name VARCHAR(100),normalized_phone VARCHAR(20),direction VARCHAR(20),draft_json LONGTEXT,draft_revision BIGINT DEFAULT 0,confirmed_ended_at DATETIME(3),disposition_selected_at DATETIME(3),auto_submit_at DATETIME(3),finalized_at DATETIME(3),submission_method VARCHAR(20),review_reasons TEXT,last_error VARCHAR(255),created_at DATETIME(3));
INSERT INTO {schema}.attica_calls VALUES('TEST-INTAKE-CALL','completed','TEST_IN');
INSERT INTO {schema}.attica_intake_forms(call_id,intake_token,normalized_phone,agent_id,agent_name,submission_status,last_saved_at) VALUES('TEST-INTAKE-CALL','TEST-INTAKE-TOKEN','9000000001','TEST_IN','Staging Incoming','Draft',UTC_TIMESTAMP(3));
INSERT INTO {schema}.attica_intake_workflows VALUES('TEST-INTAKE-CALL','TEST-INTAKE-TOKEN','TEST_IN','Staging Incoming','9000000001','incoming','{{}}',0,UTC_TIMESTAMP(3),NULL,NULL,NULL,NULL,'[]',NULL,UTC_TIMESTAMP(3));
CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}';GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.* TO '{user}'@'localhost';'''
subprocess.run(['mysql'],input=sql,text=True,check=True,capture_output=True);p=private/'intake-preview-db.json';p.write_text(json.dumps({'host':'127.0.0.1','user':user,'password':password,'database':schema}));p.chmod(0o600);print('Provisioned isolated intake preview database.')
