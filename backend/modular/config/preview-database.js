import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function createPreviewDatabase() {
  const file = process.env.CREDENTIALS_DIRECTORY
    ? join(process.env.CREDENTIALS_DIRECTORY, 'preview-db.json')
    : '/etc/attica-next/preview-db.json';
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (config.host !== '127.0.0.1' || config.database !== 'attica_api_next_preview' || config.user !== 'attica_next_read') {
    throw new Error('Preview requires the isolated staging database and SELECT-only account');
  }
  const pool = mysql.createPool({
    host: config.host, database: config.database, user: config.user, password: config.password,
    connectionLimit: 2, waitForConnections: true, queueLimit: 20,
    connectTimeout: 3000, multipleStatements: false,
  });
  try { await pool.query('SELECT 1'); }
  catch (error) { await pool.end(); throw error; }
  return {
    async query(sql, params) {
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Preview database adapter only allows SELECT');
      return pool.query(sql, params);
    },
    close: () => pool.end(),
  };
}
