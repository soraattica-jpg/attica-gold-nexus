// Phase 1 preview entrypoint: deliberately uses no production adapters.
import { createApp } from './app.js';
import { createFixtureDb, createFixtureGeocoding } from './tests/fixtures/staging.js';

const port = Number(process.env.ATTICA_STAGING_PORT || 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [3001, 3015].includes(port)) {
  throw new Error('Use an unused staging port (default 3101), not a production port.');
}
const app = createApp({ db: createFixtureDb(), geocoding: createFixtureGeocoding(), staging: true });
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Attica Branches staging preview: http://127.0.0.1:${port}; synthetic data only`);
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
