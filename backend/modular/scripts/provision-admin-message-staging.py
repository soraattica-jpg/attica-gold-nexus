"""One-time isolated fixture provisioning. Refuses to replace existing schemas.
Reads only the production broadcast table definition, never agent/message data.
"""
from pathlib import Path
import json, secrets, subprocess
root = Path(__file__).resolve().parents[1]
private = root / '.private'
private.mkdir(mode=0o700, exist_ok=True)
names = ['attica_next_messages_preview', 'attica_next_messages_contract']
found = subprocess.check_output(['mysql', '-N', '-B', '-e', "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN ('attica_next_messages_preview','attica_next_messages_contract');"], text=True)
if found.strip():
    raise SystemExit('Schemas already exist; no changes made.')
actors = [
    {'id':'TEST_ADMIN1','name':'Staging Admin One','role':'admin'},
    {'id':'TEST_ADMIN2','name':'Staging Admin Two','role':'admin'},
    {'id':'TEST_IN','name':'Staging Incoming','role':'agent'},
    {'id':'TEST_OUT','name':'Staging Outgoing','role':'agent'},
    {'id':'TEST_FOLLOW','name':'Staging Follow Up','role':'agent'},
    {'id':'TEST_MANUAL','name':'Staging Manual','role':'agent'},
    {'id':'TEST_OFF','name':'Staging Offline','role':'agent'},
]
# Minimal staging projection; no credentials or real agent details are copied.
agent_schema='''CREATE TABLE {schema}.attica_agents (
 id varchar(80) PRIMARY KEY, role varchar(30), status varchar(50), is_logged_in int,
 incoming_access int, outgoing_access int, follow_up_access int, admin_message varchar(500));'''
for index, schema in enumerate(names):
    user = ['attica_msg_preview','attica_msg_contract'][index]
    password=secrets.token_hex(32)
    sql=f'CREATE DATABASE {schema}; CREATE TABLE {schema}.attica_admin_broadcasts LIKE asterisk.attica_admin_broadcasts;\n'+agent_schema.format(schema=schema)
    sql+=f"INSERT INTO {schema}.attica_agents VALUES ('TEST_ADMIN1','admin','active',1,0,0,0,NULL),('TEST_ADMIN2','admin','active',1,0,0,0,NULL),('TEST_IN','agent','active',1,1,0,0,NULL),('TEST_OUT','agent','outbound-auto',1,0,1,0,NULL),('TEST_FOLLOW','agent','follow-up',1,0,0,1,NULL),('TEST_MANUAL','agent','manual-outgoing',1,0,1,0,NULL),('TEST_OFF','agent','inactive',0,1,1,1,NULL);"
    sql+=f"CREATE USER '{user}'@'localhost' IDENTIFIED BY '{password}'; GRANT SELECT,INSERT,UPDATE,DELETE ON {schema}.* TO '{user}'@'localhost';"
    subprocess.run(['mysql'],input=sql,text=True,check=True,capture_output=True)
    path=private/('messages-preview-db.json' if index==0 else 'messages-contract-db.json')
    path.write_text(json.dumps({'host':'127.0.0.1','user':user,'password':password,'database':schema}));path.chmod(0o600)
for actor in actors:actor['token']=secrets.token_hex(32)
path=private/'message-actors.json';path.write_text(json.dumps(actors));path.chmod(0o600)
print('Provisioned synthetic message/agent datasets, staging-only users and test actor credentials.')
