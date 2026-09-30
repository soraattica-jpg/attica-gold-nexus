"""Create isolated synthetic SMS preview storage and a write-limited account."""
from pathlib import Path
import json
import secrets
import subprocess

root = Path(__file__).resolve().parents[1]
private = root / '.private'
private.mkdir(mode=0o700, exist_ok=True)
schema = 'attica_next_sms'
user = 'attica_sms_preview'
found = subprocess.check_output(['mysql', '-N', '-B', '-e', f"SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{schema}'"], text=True)
if found.strip():
    raise SystemExit('Schema already exists; no changes made.')
password = secrets.token_hex(32)
dlr_token = secrets.token_urlsafe(32)
sql = f'''CREATE DATABASE {schema};
CREATE TABLE {schema}.wp_branches_database (
  branchId VARCHAR(50) PRIMARY KEY,
  branchName VARCHAR(255) NOT NULL,
  url VARCHAR(1000), map_url VARCHAR(1000), bitly_url VARCHAR(1000)
);
CREATE TABLE {schema}.attica_sms_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(30), branch_id VARCHAR(50), branch_name VARCHAR(255), message TEXT,
  status VARCHAR(32), provider VARCHAR(50), message_type VARCHAR(50), source VARCHAR(50),
  client_message_id VARCHAR(120), provider_message_id VARCHAR(120), delivery_status VARCHAR(32),
  delivery_status_code VARCHAR(100), delivery_reason VARCHAR(255), country VARCHAR(100), iso_code VARCHAR(20),
  network VARCHAR(100), cost VARCHAR(50), units VARCHAR(50), provider_response_json MEDIUMTEXT,
  dlr_payload_json MEDIUMTEXT, submitted_at DATETIME NULL, sent_at DATETIME NULL, delivered_at DATETIME NULL,
  status_updated_at DATETIME NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  INDEX idx_client (client_message_id), INDEX idx_provider (provider_message_id), INDEX idx_created (created_at)
);
INSERT INTO {schema}.wp_branches_database VALUES
 ('TEST001','Staging Branch','https://maps.example.invalid/long','https://maps.example.invalid/map','https://smler.in/ATTGPL/TESTONLY');
CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}';
GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.* TO '{user}'@'localhost';'''
subprocess.run(['mysql'], input=sql, text=True, check=True, capture_output=True)
(private / 'sms-preview-db.json').write_text(json.dumps({'host': '127.0.0.1', 'user': user, 'password': password, 'database': schema}))
(private / 'sms-preview-db.json').chmod(0o600)
(private / 'sms-preview.json').write_text(json.dumps({'dlrToken': dlr_token}))
(private / 'sms-preview.json').chmod(0o600)
print('Provisioned isolated synthetic SMS preview database and fake-delivery configuration.')
