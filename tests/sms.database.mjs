import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { createPreviewSms } from '../config/preview-sms.js';

const config = JSON.parse(readFileSync(new URL('../.private/sms-preview-db.json', import.meta.url), 'utf8'));
assert.equal(config.database, 'attica_next_sms');
assert.equal(config.user, 'attica_sms_preview');

test('MariaDB: fake Kaleyra send stores approved Smler message and delivery updates same row', async () => {
  const feature = await createPreviewSms();
  try {
    await feature.reset();
    const sent = await feature.service.send({ phone: '9000000001', branchId: 'TEST001' });
    assert.equal(sent.status, 200);
    assert.equal(sent.payload.provider, 'kaleyra');
    assert.equal(sent.payload.branchUrl, 'https://smler.in/ATTGPL/TESTONLY');
    assert.equal(feature.deliveries.length, 1);
    assert.match(feature.deliveries[0].message, /https:\/\/smler\.in\/ATTGPL\/TESTONLY$/);
    let rows = await feature.service.list({ limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delivery_status, 'submitted');
    const callback = { token: feature.dlrToken, client_id: rows[0].client_message_id, message_id: rows[0].provider_message_id, status: 'DELIVRD', delivered: '2026-09-21 15:30:00', country_name: 'India', source: 'API' };
    assert.equal((await feature.service.delivery(callback)).payload.matched, true);
    assert.equal((await feature.service.delivery(callback)).payload.matched, true);
    rows = await feature.service.list({ limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delivery_status, 'delivered');
    assert.equal(JSON.parse(rows[0].dlr_payload_json).token, undefined);
  } finally {
    await feature.reset();
    await feature.close();
  }
});

test('MariaDB: SMS preview account cannot inspect or mutate production tables', async () => {
  const db = await mysql.createConnection(config);
  try {
    for (const sql of ['SELECT COUNT(*) FROM asterisk.attica_sms_log', "INSERT INTO asterisk.attica_sms_log (phone) VALUES ('9000000001')"]) {
      await assert.rejects(db.query(sql), error => [1044, 1142].includes(error.errno));
    }
  } finally {
    await db.end();
  }
});
