"""Create a synthetic, SELECT-only Billing lookup database. Refuses replacement."""
from pathlib import Path
import json
import secrets
import subprocess

root = Path(__file__).resolve().parents[1]
private = root / '.private'
private.mkdir(mode=0o700, exist_ok=True)
schema = 'attica_next_billing'
user = 'attica_billing_read'
found = subprocess.check_output([
    'mysql', '-N', '-B', '-e',
    f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{schema}'",
], text=True)
if found.strip():
    raise SystemExit('Schema already exists; no changes made.')

password = secrets.token_hex(32)
sql = f'''CREATE DATABASE {schema};
CREATE TABLE {schema}.attica_remote_customer_data (
  remote_id VARCHAR(80) PRIMARY KEY,
  contact VARCHAR(30) NOT NULL,
  customer_name VARCHAR(255),
  customer_type VARCHAR(100),
  branch VARCHAR(150),
  record_date DATE NOT NULL,
  record_time TIME,
  status VARCHAR(100),
  gross_w VARCHAR(50),
  net_w VARCHAR(50),
  bill_id VARCHAR(80),
  billing_amount DECIMAL(15,2),
  transaction_status VARCHAR(100),
  walkin_type VARCHAR(150),
  source_attribution VARCHAR(120),
  attributed_agent_id VARCHAR(50),
  attributed_agent_name VARCHAR(100),
  total_talk_seconds INT DEFAULT 0,
  connected_call_count INT DEFAULT 0,
  attribution_window_start DATETIME NULL,
  attribution_window_end DATETIME NULL,
  attribution_method VARCHAR(80),
  attribution_reason VARCHAR(255),
  attributed_at DATETIME NULL,
  synced_at DATETIME NOT NULL,
  INDEX idx_date (record_date),
  INDEX idx_contact (contact)
);
CREATE TABLE {schema}.attica_intake_forms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  normalized_phone VARCHAR(20) NOT NULL,
  caller_name VARCHAR(255),
  customer_name VARCHAR(255),
  agent_name VARCHAR(100),
  business_type VARCHAR(100),
  branch VARCHAR(150),
  purpose VARCHAR(150),
  form_status VARCHAR(100),
  callback_status VARCHAR(100),
  grams VARCHAR(50),
  created_at DATETIME,
  updated_at DATETIME,
  last_saved_at DATETIME,
  INDEX idx_phone (normalized_phone)
);
INSERT INTO {schema}.attica_remote_customer_data
 (remote_id,contact,customer_name,customer_type,branch,record_date,record_time,status,gross_w,net_w,bill_id,billing_amount,transaction_status,walkin_type,source_attribution,attributed_agent_id,attributed_agent_name,total_talk_seconds,connected_call_count,attribution_window_start,attribution_window_end,attribution_method,attribution_reason,attributed_at,synced_at)
 VALUES
 ('TEST-BILL-2','9000000001','Staging Customer','Gold','Staging Branch','2026-09-20','11:30:00','Billed','12.50','11.80','TEST-INVOICE-2',150000.00,'Completed','Gold Sale','Google LP','TEST_IN','Staging Incoming',80,1,'2026-09-05 11:30:00','2026-09-20 11:30:00','15-day-connected-talk','Synthetic attribution','2026-09-20 12:00:00','2026-09-20 12:00:00'),
 ('TEST-BILL-1','9000000003','Billing Only Customer','Gold','Other Branch','2026-09-19','09:30:00','Release','8.00','7.50','TEST-INVOICE-1',80000.00,'Completed','Release','Meta Ads','TEST_OUT','Staging Outgoing',40,1,'2026-09-04 09:30:00','2026-09-19 09:30:00','15-day-connected-talk','Synthetic attribution','2026-09-19 10:00:00','2026-09-19 10:00:00');
INSERT INTO {schema}.attica_intake_forms
 (normalized_phone,caller_name,customer_name,agent_name,business_type,branch,purpose,form_status,callback_status,grams,created_at,updated_at,last_saved_at)
 VALUES
 ('9000000001','Staging Customer','Staging Customer','Staging Incoming','Physical','Staging Branch','Gold Sale','Submitted','Coming to Office','12.50','2026-09-20 11:00:00','2026-09-20 11:02:00','2026-09-20 11:02:00'),
 ('9000000004','Local Only Customer','Local Only Customer','Staging Incoming','Physical','Staging Branch','Enquiry','Submitted','Enquiry','0','2026-09-18 08:00:00','2026-09-18 08:01:00','2026-09-18 08:01:00');
CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}';
GRANT SELECT ON {schema}.* TO '{user}'@'localhost';'''
subprocess.run(['mysql'], input=sql, text=True, check=True, capture_output=True)
path = private / 'billing-db.json'
path.write_text(json.dumps({'host': '127.0.0.1', 'user': user, 'password': password, 'database': schema}))
path.chmod(0o600)
print('Provisioned synthetic Billing schema and SELECT-only user.')
