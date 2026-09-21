// Isolated preview entrypoint: no production adapters, jobs or telephony.
import { createApp } from './app.js';
import { createPreviewAdminMessages } from './config/preview-admin-messages.js';
import { createPreviewCustomerHistory } from './config/preview-customer-history.js';
import { createPreviewReports } from './config/preview-reports.js';
import { createPreviewBilling } from './config/preview-billing.js';
import { createPreviewSms } from './config/preview-sms.js';
import { createPreviewFollowups } from './config/preview-followups.js';
import { createPreviewDatabase } from './config/preview-database.js';
import { createFixtureDb, createFixtureGeocoding } from './tests/fixtures/staging.js';

const port = Number(process.env.ATTICA_STAGING_PORT || 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3001, 3015].includes(port)) {
  throw new Error('Use an unused staging port (default 3101), not a production port.');
}
const dataMode = process.env.ATTICA_PREVIEW_DATA || 'staging-database';
if (!['staging-database', 'synthetic'].includes(dataMode)) throw new Error('Invalid preview data mode');
const db = dataMode === 'staging-database' ? await createPreviewDatabase() : createFixtureDb();
const adminMessages = dataMode === 'staging-database' ? await createPreviewAdminMessages() : null;
const customerHistory = dataMode === 'staging-database' ? await createPreviewCustomerHistory() : null;
const reports = dataMode === 'staging-database' ? await createPreviewReports() : null;
const billing = dataMode === 'staging-database' ? await createPreviewBilling() : null;
const sms = dataMode === 'staging-database' ? await createPreviewSms() : null;
const followups = dataMode === 'staging-database' ? await createPreviewFollowups() : null;
const app = createApp({ db, geocoding: createFixtureGeocoding(), staging: true, dataMode, adminMessages, customerHistory, reports, billing, sms, followups });
const server = app.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'startup', port, host: '127.0.0.1', dataMode, branchesReadOnly: true, customerHistoryReadOnly: true, messageDelivery: adminMessages ? 'test-only' : null }));
});
server.on('error', async (error) => {
  console.error(JSON.stringify({ event: 'startup_error', code: error.code || 'LISTEN_FAILED' }));
  await db.close?.();
  await adminMessages?.close();
  await customerHistory?.close();
  await reports?.close();
  await billing?.close();
  await sms?.close();
  await followups?.close();
  process.exitCode = 1;
});
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 8000).unref();
    server.close(async () => {
      await db.close?.();
      await adminMessages?.close();
      await customerHistory?.close();
      await reports?.close();
      await billing?.close();
      await sms?.close();
      await followups?.close();
      clearTimeout(deadline);
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
