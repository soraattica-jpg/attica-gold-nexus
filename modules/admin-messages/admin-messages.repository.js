const columns = `id, message, recipient_scope, expiry_code, expires_at,
  sent_by_id, sent_by_name, sent_at,
  cleared_by_id, cleared_by_name, cleared_at, is_active`;
export function createAdminMessagesRepository(db) {
  return {
    async active() {
      const [[row]] = await db.query(`SELECT ${columns} FROM attica_admin_broadcasts
        WHERE is_active=1 AND IFNULL(message, '') <> '' AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY sent_at DESC, id DESC LIMIT 1`);
      return row || null;
    },
    async agent(id) {
      const [[row]] = await db.query(`SELECT id, role, status, is_logged_in, incoming_access, outgoing_access, follow_up_access, admin_message
        FROM attica_agents WHERE id=? LIMIT 1`, [id]);
      return row;
    },
    async history(limit) {
      const [rows] = await db.query(`SELECT ${columns} FROM attica_admin_broadcasts ORDER BY sent_at DESC, id DESC LIMIT ?`, [limit]);
      return rows;
    },
    async clear(id, name) {
      const [result] = await db.query(`UPDATE attica_admin_broadcasts
        SET is_active=0, cleared_by_id=?, cleared_by_name=?, cleared_at=NOW() WHERE is_active=1`, [id, name]);
      return result;
    },
    async insert(values) {
      const [result] = await db.query(`INSERT INTO attica_admin_broadcasts
        (message, recipient_scope, expiry_code, expires_at, sent_by_id, sent_by_name, sent_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`, values);
      const [[row]] = await db.query(`SELECT ${columns} FROM attica_admin_broadcasts WHERE id=? LIMIT 1`, [result.insertId]);
      return row;
    },
    async individual(id, message) {
      await db.query('UPDATE attica_agents SET admin_message=? WHERE id=?', [message, id]);
    },
  };
}
