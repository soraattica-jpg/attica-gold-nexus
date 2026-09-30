import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { createAdminMessagesModule } from '../modules/admin-messages/index.js';
import { createTestAdminMessageSink } from '../events/test-admin-message-sink.js';
import { createPreviewMessageAuthorization } from '../middleware/preview-message-auth.js';

export async function createPreviewAdminMessages() {
  const config = JSON.parse(readFileSync(new URL('../.private/messages-preview-db.json', import.meta.url), 'utf8'));
  if (config.host !== '127.0.0.1' || config.database !== 'attica_next_messages_preview' || config.user !== 'attica_msg_preview') throw new Error('Admin messages requires an isolated preview database');
  const db = mysql.createPool({ host: config.host, database: config.database, user: config.user, password: config.password,
    connectionLimit: 2, waitForConnections: true, queueLimit: 20, connectTimeout: 3000, multipleStatements: false });
  try { await db.query('SELECT 1'); } catch (error) { await db.end(); throw error; }
  let state = { token: String(Date.now()), scope: 'none', reason: '', triggeredAt: new Date().toISOString() };
  const events = createTestAdminMessageSink();
  const feature = createAdminMessagesModule({ db, refreshState: { get: () => state, set: (next) => { state = next; } }, events });
  const actors = JSON.parse(readFileSync(new URL('../.private/message-actors.json', import.meta.url), 'utf8'));
  return { ...feature, events, authorize: createPreviewMessageAuthorization(actors), close: () => db.end() };
}
