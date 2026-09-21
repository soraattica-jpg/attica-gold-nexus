import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { createSmsModule, createDatabaseSmsRepository } from '../modules/sms/index.js';
import { createPreviewReadAuthorization } from '../middleware/preview-read-auth.js';

export async function createPreviewSms() {
  const config = JSON.parse(readFileSync(new URL('../.private/sms-preview-db.json', import.meta.url), 'utf8'));
  const secret = JSON.parse(readFileSync(new URL('../.private/sms-preview.json', import.meta.url), 'utf8'));
  if (config.host !== '127.0.0.1' || config.database !== 'attica_next_sms' || config.user !== 'attica_sms_preview') throw new Error('SMS requires isolated staging database');
  const db = mysql.createPool({ ...config, connectionLimit: 2, waitForConnections: true, queueLimit: 20, connectTimeout: 3000, multipleStatements: false });
  await db.query('SELECT 1');
  let sequence = 0;
  const deliveries = [];
  const provider = {
    provider: 'kaleyra',
    smsType: 'TXN',
    readDlrToken: () => secret.dlrToken,
    async send(value) {
      const providerMessageId = `TEST-KALEYRA-${++sequence}`;
      deliveries.push({ ...value, providerMessageId });
      return { success: true, message: 'Accepted by fake Kaleyra sink', data: [{ message_id: providerMessageId }] };
    },
    getMessageId: result => String(result?.data?.[0]?.message_id || ''),
  };
  const actors = JSON.parse(readFileSync(new URL('../.private/message-actors.json', import.meta.url), 'utf8'));
  return {
    ...createSmsModule(createDatabaseSmsRepository(db), provider),
    authorize: createPreviewReadAuthorization(actors),
    deliveries,
    dlrToken: secret.dlrToken,
    reset: () => db.query('DELETE FROM attica_sms_log'),
    close: () => db.end(),
  };
}
