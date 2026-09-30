import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (!process.env.ATTICA_DB_PASSWORD) {
  throw new Error('Set ATTICA_DB_PASSWORD in the environment or backend/production/.env before starting the API.');
}

await import('./server.js');
