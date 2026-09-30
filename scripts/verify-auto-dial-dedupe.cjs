const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mysql = require('/root/attica-api/node_modules/mysql2/promise');

// Extract production functions without starting the API, scheduler or PBX hooks.
const source = ts.createSourceFile('server.js', fs.readFileSync('/root/attica-api/server.js', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['deferFollowUpLeadForPhoneCooldown', 'clearStaleOpenAutoDialDedupeNumbers',
  'findExistingOpenAutoDialLeadByPhone', 'isAutoDialOpenSlotConflict', 'updateAutoDialLeadOpenSlot',
  'requeueAutoDialLeadForRedispatch', 'reopenFailedSourceAutoDialLead'];
const functions = names.map(name => {
  const node = source.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, name);
  return node.getText(source);
}).join('\n');

async function main() {
  const database = `attica_dedupe_test_${process.pid}`;
  assert.match(database, /^attica_dedupe_test_\d+$/);
  const options = { user: 'root', socketPath: '/run/mysqld/mysqld.sock' };
  const admin = await mysql.createConnection(options);
  let pool;
  let passed = 0;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    pool = mysql.createPool({ ...options, database, connectionLimit: 4, dateStrings: true });
    await pool.query(`CREATE TABLE attica_auto_dial_leads (
      id VARCHAR(80) PRIMARY KEY, normalized_number VARCHAR(20), mobile_number VARCHAR(20),
      open_dedupe_number VARCHAR(20) NULL,
      UNIQUE KEY uniq_attica_auto_dial_open_dedupe_number (open_dedupe_number),
      status VARCHAR(30) DEFAULT 'pending', is_active TINYINT DEFAULT 1, retry_allowed TINYINT DEFAULT 1,
      source_file VARCHAR(80) DEFAULT 'Status Follow-Up', assigned_agent_id VARCHAR(80), assigned_agent_name VARCHAR(80),
      assigned_at DATETIME, dial_started_at DATETIME, completed_at DATETIME, call_id VARCHAR(80),
      scheduled_for DATETIME, queue_exit_reason VARCHAR(80), last_error TEXT, updated_at DATETIME, created_at DATETIME
    ) ENGINE=InnoDB`);
    await pool.query('CREATE TABLE attica_blocked_numbers (phone VARCHAR(20) PRIMARY KEY)');
    await pool.query(`CREATE TABLE attica_auto_dial_retry_state (
      normalized_number VARCHAR(20), scope_key VARCHAR(80), connected_once TINYINT DEFAULT 0
    )`);
    const context = vm.createContext({
      pool, cleanJustDialString: (value, max) => String(value || '').trim().slice(0, max),
      canonicalizeAutoDialLeadId: value => String(value || '').trim(),
      normalizeAutoDialPhone: value => String(value || '').replace(/\D/g, '').slice(-10),
      toDatabaseDateTime: value => value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : '',
      FOLLOW_UP_PHONE_RETRY_COOLDOWN_MINUTES: 180,
      FOLLOW_UP_AUTO_DIAL_PREDICATE_SQL: "source_file='Status Follow-Up'",
      MYSQL_QUEUE_NOW_SQL: 'NOW()', OPEN_AUTO_DIAL_LEAD_ORDER_SQL: 'id ASC',
      getBusinessDateString: () => '2026-09-09',
      AUTO_DIAL_MAX_ATTEMPTS_PER_NUMBER: 3,
      getClosedCustomerQueueBlockByPhone: async () => null,
      fetchAutoDialRetryStateByPhones: async () => new Map(),
      isTerminalAutoDialQueueExitReason: reason => ['Blocked', 'Already Called'].includes(reason),
      buildAutoDialQueueBlockMessage: reason => reason,
      getAutoDialDailyAttemptLimitMessage: () => 'Daily limit',
      syncAutoDialLeadStatusToSources: async () => {},
    });
    vm.runInContext(functions, context);
    const insert = async (id, data = {}) => {
      const row = { id, normalized_number: '0000000001', ...data };
      await pool.query('INSERT INTO attica_auto_dial_leads SET ?', row);
    };
    const read = async id => (await pool.query('SELECT * FROM attica_auto_dial_leads WHERE id=?', [id]))[0][0];
    const test = async (label, action) => {
      await pool.query('DELETE FROM attica_auto_dial_leads');
      await pool.query('DELETE FROM attica_auto_dial_retry_state');
      await action();
      passed += 1;
      console.log(`PASS ${label}`);
    };
    const defer = id => context.deferFollowUpLeadForPhoneCooldown(id, '2026-09-10T12:00:00Z', 'Cooldown');
    const requeue = id => context.requeueAutoDialLeadForRedispatch(id, 'Retry', { allowedStatuses: ['failed'] });
    const reopen = (id, connection = pool) => context.reopenFailedSourceAutoDialLead(connection, { leadId: id, phoneNumber: '0000000001' });

    await test('inactive follow-up never reacquires a queue slot', async () => {
      await insert('inactive', { is_active: 0 });
      assert.equal(await defer('inactive'), false);
      assert.equal((await read('inactive')).open_dedupe_number, null);
    });
    await test('cooldown preserves active assignment and call metadata', async () => {
      for (const status of ['assigned', 'dialing']) {
        await insert(status, { status, call_id: 'test-call', assigned_agent_id: 'test-agent' });
        assert.equal(await defer(status), false);
        const row = await read(status);
        assert.equal(row.status, status);
        assert.equal(row.call_id, 'test-call');
        assert.equal(row.assigned_agent_id, 'test-agent');
      }
    });
    await test('cooldown excludes disabled retries and does not compete for a slot', async () => {
      await insert('owner', { open_dedupe_number: '0000000001' });
      await insert('failed', { status: 'failed' });
      await insert('disabled', { retry_allowed: 0 });
      assert.equal(await defer('disabled'), false);
      assert.equal(await defer('failed'), true);
      assert.equal((await read('failed')).status, 'failed');
      assert.equal((await read('failed')).open_dedupe_number, null);
      assert.equal((await read('owner')).open_dedupe_number, '0000000001');
    });
    await test('cooldown keeps later dates and bounded idempotent notes', async () => {
      await insert('pending', { scheduled_for: '2026-09-11 12:00:00', open_dedupe_number: '0000000001' });
      await defer('pending');
      await defer('pending');
      const row = await read('pending');
      assert.equal(row.scheduled_for, '2026-09-11 12:00:00');
      assert.equal(row.last_error, 'Cooldown');
      assert.equal(row.open_dedupe_number, '0000000001');
    });
    await test('stale cleanup preserves assigned and dialing reservations', async () => {
      await insert('old', { status: 'completed', open_dedupe_number: '0000000001' });
      await insert('assigned', { status: 'assigned', retry_allowed: 0, normalized_number: '0000000002', open_dedupe_number: '0000000002' });
      await insert('dialing', { status: 'dialing', retry_allowed: 0, normalized_number: '0000000003', open_dedupe_number: '0000000003' });
      assert.equal(await context.clearStaleOpenAutoDialDedupeNumbers(), 1);
      assert.equal((await read('assigned')).open_dedupe_number, '0000000002');
      assert.equal((await read('dialing')).open_dedupe_number, '0000000003');
    });
    await test('stale cleanup rechecks ownership after concurrent revival', async () => {
      await insert('raced', { is_active: 0, open_dedupe_number: '0000000001' });
      context.pool = { query: async (sql, params) => {
        const result = await pool.query(sql, params);
        if (sql.includes('SELECT id')) await pool.query("UPDATE attica_auto_dial_leads SET is_active=1 WHERE id='raced'");
        return result;
      } };
      try { assert.equal(await context.clearStaleOpenAutoDialDedupeNumbers(), 0); }
      finally { context.pool = pool; }
      assert.equal((await read('raced')).open_dedupe_number, '0000000001');
    });
    await test('eligible retry acquires one slot; inactive retry stays closed', async () => {
      await insert('eligible', { status: 'failed' });
      await insert('inactive', { status: 'failed', is_active: 0 });
      assert.equal(await requeue('eligible'), true);
      assert.equal(await requeue('inactive'), false);
      assert.equal((await read('eligible')).open_dedupe_number, '0000000001');
    });
    await test('a competing live slot returns false without throwing or stealing', async () => {
      await insert('owner', { status: 'dialing', open_dedupe_number: '0000000001' });
      await insert('competitor', { status: 'failed' });
      assert.equal(await requeue('competitor'), false);
      assert.equal((await read('owner')).open_dedupe_number, '0000000001');
      assert.equal((await read('competitor')).status, 'failed');
    });
    await test('a stale slot is released and the eligible retry succeeds', async () => {
      await insert('stale', { status: 'completed', open_dedupe_number: '0000000001' });
      await insert('eligible', { status: 'failed' });
      assert.equal(await requeue('eligible'), true);
      assert.equal((await read('stale')).open_dedupe_number, null);
      assert.equal((await read('eligible')).open_dedupe_number, '0000000001');
    });
    await test('unrelated database errors are not hidden', async () => {
      const error = Object.assign(new Error('Other unique key'), { code: 'ER_DUP_ENTRY' });
      await assert.rejects(context.updateAutoDialLeadOpenSlot({ query: async () => { throw error; } }, 'id', '', []), value => value === error);
    });
    await test('inactive and terminal source leads cannot be reopened', async () => {
      await insert('inactive', { status: 'failed', is_active: 0 });
      await insert('terminal', { status: 'failed', queue_exit_reason: 'Already Called' });
      assert.equal((await reopen('inactive')).success, false);
      assert.equal((await reopen('terminal')).success, false);
      assert.equal((await read('inactive')).status, 'failed');
      assert.equal((await read('terminal')).status, 'failed');
    });
    await test('source reopen tolerates an owner arriving after its initial lookup', async () => {
      await insert('eligible', { status: 'failed' });
      await pool.query("INSERT INTO attica_auto_dial_retry_state VALUES ('0000000001', '2026-09-09:test', 0)");
      let raced = false;
      const connection = { query: async (sql, params) => {
        const result = await pool.query(sql, params);
        if (!raced && sql.includes('SELECT *') && sql.includes('open_dedupe_number=?')) {
          raced = true;
          await insert('owner', { open_dedupe_number: '0000000001' });
        }
        return result;
      } };
      const result = await reopen('eligible', connection);
      assert.equal(result.success, true);
      assert.equal(result.deduped, true);
      assert.equal(result.autoDialLeadId, 'owner');
      assert.equal((await pool.query('SELECT COUNT(*) AS n FROM attica_auto_dial_retry_state'))[0][0].n, 1);
    });
    await test('eligible source reopen still works normally', async () => {
      await insert('eligible', { status: 'failed' });
      assert.equal((await reopen('eligible')).requeued, true);
      assert.equal((await read('eligible')).status, 'pending');
    });
    await test('simultaneous retries leave exactly one active owner', async () => {
      await insert('a', { status: 'failed' });
      await insert('b', { status: 'failed' });
      const results = await Promise.all([requeue('a'), requeue('b')]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await pool.query('SELECT COUNT(*) AS n FROM attica_auto_dial_leads WHERE open_dedupe_number IS NOT NULL'))[0][0].n, 1);
    });
    console.log(`${passed} regression tests passed; no production data or PBX calls touched.`);
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
