"""Create one synthetic, SELECT-only Customer History database. Refuses replacement."""
from pathlib import Path
import json, secrets, subprocess
root=Path(__file__).resolve().parents[1]; private=root/'.private'; private.mkdir(mode=0o700,exist_ok=True)
schema='attica_next_customer_history'; user='attica_history_read'
found=subprocess.check_output(['mysql','-N','-B','-e',f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{schema}'"],text=True)
if found.strip(): raise SystemExit('Schema already exists; no changes made.')
password=secrets.token_hex(32)
sql=f'''CREATE DATABASE {schema};
CREATE TABLE {schema}.attica_customers LIKE asterisk.attica_customers;
CREATE TABLE {schema}.attica_calls LIKE asterisk.attica_calls;
CREATE TABLE {schema}.attica_intake_forms LIKE asterisk.attica_intake_forms;
INSERT INTO {schema}.attica_customers
 (customer_uid,normalized_phone,customer_name,mob2,gender,district,language,business_type,metal_type,grams,branch,place,purpose,notes,last_saved_at)
 VALUES ('TEST-CUSTOMER-1','9000000001','Staging Customer','9000000002','Female','Bengaluru','Kannada','Physical','Gold','12.50','Staging Branch','Test Area','Gold Sale','Saved profile','2026-09-20 11:00:00');
INSERT INTO {schema}.attica_calls
 (id,caller_id,customer_name,agent_id,agent_name,direction,status,duration,call_time,call_date,language,branch,place,purpose,callback_status,notes,normalized_customer_number,customer_uid,answered_at,ended_at,talk_duration_seconds,created_at)
 VALUES
 ('TEST-CALL-2','919000000001','Staging Customer','TEST_IN','Staging Incoming','incoming','completed','01:20','11:00:00','2026-09-20','Kannada','Staging Branch','Test Area','Gold Sale','Coming to Office','Latest call','9000000001','TEST-CUSTOMER-1','2026-09-20 11:00:10','2026-09-20 11:01:30',80,'2026-09-20 11:00:00'),
 ('TEST-CALL-1','9000000001','Staging Customer','TEST_IN','Staging Incoming','outgoing','completed','00:45','10:00:00','2026-09-19','Kannada','Staging Branch','Test Area','Enquiry','Call Back','Earlier call','9000000001','TEST-CUSTOMER-1','2026-09-19 10:00:05','2026-09-19 10:00:50',45,'2026-09-19 10:00:00'),
 ('TEST-CALL-ID','9000000003','Call-only Customer','TEST_OUT','Staging Outgoing','outgoing','completed','00:20','09:00:00','2026-09-18','English','Staging Branch','Other Area','Enquiry','Enquiry','Call id fallback','9000000003','TEST-CUSTOMER-CALL','2026-09-18 09:00:05','2026-09-18 09:00:25',20,'2026-09-18 09:00:00');
INSERT INTO {schema}.attica_intake_forms
 (call_id,intake_token,normalized_phone,customer_name,agent_id,agent_name,mob2,district,language,business_type,metal_type,grams,advertisement,form_status,branch,place,purpose,callback_status,notes,source_status,last_saved_at,customer_uid,gender)
 VALUES
 ('TEST-CALL-2','TEST-INTAKE-2','9000000001','Staging Customer','TEST_IN','Staging Incoming','9000000002','Bengaluru','Kannada','Physical','Gold','12.50','Google','Submitted','Staging Branch','Test Area','Gold Sale','Coming to Office','Latest intake','completed','2026-09-20 11:02:00','TEST-CUSTOMER-1','Female'),
 ('TEST-CALL-1','TEST-INTAKE-1','9000000001','Staging Customer','TEST_IN','Staging Incoming','','Bengaluru','Kannada','Physical','Gold','10.00','Website','Submitted','Staging Branch','Test Area','Enquiry','Call Back','Earlier intake','completed','2026-09-19 10:01:00','TEST-CUSTOMER-1','Female');
CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}';
GRANT SELECT ON {schema}.* TO '{user}'@'localhost';'''
subprocess.run(['mysql'],input=sql,text=True,check=True,capture_output=True)
path=private/'customer-history-db.json';path.write_text(json.dumps({'host':'127.0.0.1','user':user,'password':password,'database':schema}));path.chmod(0o600)
print('Provisioned synthetic Customer History schema and SELECT-only user.')
