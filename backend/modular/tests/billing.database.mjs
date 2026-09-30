import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { createPreviewBilling } from '../config/preview-billing.js';

const config = JSON.parse(readFileSync(new URL('../.private/billing-db.json', import.meta.url), 'utf8'));
assert.equal(config.database, 'attica_next_billing');
assert.equal(config.user, 'attica_billing_read');

test('MariaDB: billing list returns only the selected full date with stable billing fields', async () => {
  const feature = await createPreviewBilling();
  try {
    const payload = await feature.service.list({ date: '2026-09-20', limit: '50' });
    assert.equal(payload.source, 'atticagold.biz');
    assert.equal(payload.total, 1);
    assert.equal(payload.results[0].billId, 'TEST-INVOICE-2');
    assert.equal(payload.results[0].billAmount, 150000);
    assert.equal(payload.results[0].attributedAgentId, 'TEST_IN');
    assert.match(payload.lastSyncedAt, /^2026-09-20T/);
  } finally {
    await feature.close();
  }
});

test('MariaDB: normalized billing lookup combines cached bill and local intake; strict keeps bill only', async () => {
  const feature = await createPreviewBilling();
  try {
    const combined = await feature.service.lookup({ contact: '+91 90000 00001' });
    assert.equal(combined.length, 2);
    assert.equal(combined[0].billId, 'TEST-INVOICE-2');
    assert.equal(combined[1].customerName, 'Staging Customer');
    const strict = await feature.service.lookup({ contact: '919000000001', strict: 'true' });
    assert.equal(strict.length, 1);
    assert.equal(strict[0].billId, 'TEST-INVOICE-2');
    const localOnly = await feature.service.lookup({ contact: '9000000004' });
    assert.equal(localOnly.length, 1);
    assert.equal(localOnly[0].customerName, 'Local Only Customer');
  } finally {
    await feature.close();
  }
});

test('MariaDB: billing preview account is SELECT-only and cannot inspect production', async () => {
  const db = await mysql.createConnection(config);
  try {
    await assert.rejects(db.query("UPDATE attica_remote_customer_data SET status='x' WHERE remote_id='TEST-BILL-2'"), error => error.errno === 1142);
    for (const sql of ['SELECT COUNT(*) FROM asterisk.attica_remote_customer_data', 'UPDATE asterisk.attica_remote_customer_data SET status=status WHERE 1=0']) {
      await assert.rejects(db.query(sql), error => [1044, 1142].includes(error.errno));
    }
  } finally {
    await db.end();
  }
});
