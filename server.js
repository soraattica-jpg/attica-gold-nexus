// Isolated preview entrypoint: no production adapters, jobs or telephony.
import { createApp } from './app.js';
import { createPreviewDatabase } from './config/preview-database.js';
import { createFixtureDb, createFixtureGeocoding } from './tests/fixtures/staging.js';

const port = Number(process.env.ATTICA_STAGING_PORT || 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3001, 3015].includes(port)) {
  throw new Error('Use an unused staging port (default 3101), not a production port.');
}
const dataMode = process.env.ATTICA_PREVIEW_DATA || 'staging-database';
if (!['staging-database', 'synthetic'].includes(dataMode)) throw new Error('Invalid preview data mode');
const db = dataMode === 'staging-database' ? await createPreviewDatabase() : createFixtureDb();
const app = createApp({ db, geocoding: createFixtureGeocoding(), staging: true, dataMode });
const server = app.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'startup', port, host: '127.0.0.1', dataMode, readOnly: true }));
});
server.on('error', async (error) => {
  console.error(JSON.stringify({ event: 'startup_error', code: error.code || 'LISTEN_FAILED' }));
  await db.close?.();
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
      clearTimeout(deadline);
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
