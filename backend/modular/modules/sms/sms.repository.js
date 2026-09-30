export function createSmsRepository(adapters) {
  const required = ['getBranch', 'createQueued', 'markSent', 'markFailed', 'list', 'findByClientId', 'findByProviderId', 'findPendingByRecipient', 'updateDelivery'];
  for (const key of required) if (typeof adapters?.[key] !== 'function') throw new Error(`SMS adapter missing: ${key}`);
  return adapters;
}

export function createDatabaseSmsRepository(db) {
  const one = async (sql, params) => (await db.query(sql, params))[0];
  return {
    async getBranch(branchId) { const [rows] = await db.query('SELECT branchName, url, map_url, bitly_url FROM wp_branches_database WHERE branchId=?', [branchId]); return rows[0] || null; },
    async createQueued(value) {
      const [result] = await db.query(`INSERT INTO attica_sms_log
        (phone,branch_id,branch_name,message,status,provider,message_type,source,client_message_id,delivery_status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`, [value.phone, value.branchId, value.branchName, value.message, 'queued', value.provider, value.messageType, value.source, value.clientMessageId, 'queued']);
      return result.insertId;
    },
    markSent: (id, providerMessageId, providerResult) => one(`UPDATE attica_sms_log SET status='sent', delivery_status='submitted', provider='kaleyra', provider_message_id=?, provider_response_json=?, submitted_at=COALESCE(submitted_at,NOW()), sent_at=COALESCE(sent_at,NOW()), updated_at=NOW() WHERE id=?`, [providerMessageId || null, JSON.stringify(providerResult).slice(0, 200000), id]),
    markFailed: (id, reason) => one(`UPDATE attica_sms_log SET status='failed', delivery_status='failed', delivery_reason=?, updated_at=NOW() WHERE id=?`, [reason, id]),
    async list(limit) { const [rows] = await db.query('SELECT * FROM attica_sms_log ORDER BY created_at DESC, id DESC LIMIT ?', [limit]); return rows; },
    async findByClientId(value) { const [rows] = await db.query('SELECT id FROM attica_sms_log WHERE client_message_id=? ORDER BY id DESC LIMIT 1', [value]); return rows[0]?.id || null; },
    async findByProviderId(value) { const [rows] = await db.query('SELECT id FROM attica_sms_log WHERE provider_message_id=? ORDER BY id DESC LIMIT 1', [value]); return rows[0]?.id || null; },
    async findPendingByRecipient(value) { const [rows] = await db.query(`SELECT id FROM attica_sms_log WHERE RIGHT(REPLACE(REPLACE(REPLACE(phone,'+',''),' ',''),'-',''),10)=? AND delivery_status IN ('queued','submitted') ORDER BY created_at DESC, id DESC LIMIT 1`, [value]); return rows[0]?.id || null; },
    updateDelivery: (id, value) => one(`UPDATE attica_sms_log SET status=?, delivery_status=?, provider_message_id=COALESCE(NULLIF(?,''),provider_message_id), delivery_status_code=?, delivery_reason=COALESCE(NULLIF(?,''),delivery_reason), delivered_at=COALESCE(NULLIF(?,''),delivered_at), submitted_at=COALESCE(NULLIF(?,''),submitted_at), sent_at=COALESCE(NULLIF(?,''),sent_at), status_updated_at=COALESCE(NULLIF(?,''),NOW()), country=COALESCE(NULLIF(?,''),country), iso_code=COALESCE(NULLIF(?,''),iso_code), network=COALESCE(NULLIF(?,''),network), cost=COALESCE(NULLIF(?,''),cost), units=COALESCE(NULLIF(?,''),units), message_type=COALESCE(NULLIF(?,''),message_type), source=COALESCE(NULLIF(?,''),source), dlr_payload_json=?, updated_at=NOW() WHERE id=?`, [value.status, value.deliveryStatus, value.providerMessageId, value.rawStatus, value.reason, value.deliveredAt, value.submittedAt, value.sentAt, value.statusUpdatedAt, value.country, value.isoCode, value.network, value.cost, value.units, value.messageType, value.source, value.serializedPayload, id]),
  };
}
