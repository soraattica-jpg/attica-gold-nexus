import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { createCustomerHistoryModule } from '../modules/customer-history/index.js';
import { serializePreviewCall, serializePreviewIntake, createPreviewProfileBuilder } from '../modules/customer-history/preview-adapters.js';
import { createPreviewReadAuthorization } from '../middleware/preview-read-auth.js';
export async function createPreviewCustomerHistory() {
  const config=JSON.parse(readFileSync(new URL('../.private/customer-history-db.json',import.meta.url),'utf8'));
  if(config.host!=='127.0.0.1'||config.database!=='attica_next_customer_history'||config.user!=='attica_history_read') throw new Error('Customer History requires isolated read-only staging database');
  const db=mysql.createPool({...config,connectionLimit:2,waitForConnections:true,queueLimit:20,connectTimeout:3000,multipleStatements:false});
  await db.query('SELECT 1');
  const actors=JSON.parse(readFileSync(new URL('../.private/message-actors.json',import.meta.url),'utf8'));
  return {...createCustomerHistoryModule({db,serializeCalls:async rows=>rows.map(serializePreviewCall),serializeIntakes:serializePreviewIntake,buildProfile:createPreviewProfileBuilder(db)}),
    authorize:createPreviewReadAuthorization(actors),close:()=>db.end()};
}
