export function createCustomerHistoryRepository(db) {
  return {
    async resolveByCustomerId(customerId) {
      const [customers] = await db.query(`SELECT normalized_phone FROM attica_customers
        WHERE customer_uid=? AND COALESCE(normalized_phone,'')<>'' LIMIT 1`, [customerId]);
      if (customers[0]?.normalized_phone) return customers[0].normalized_phone;
      const [calls] = await db.query(`SELECT normalized_customer_number FROM attica_calls
        WHERE customer_uid=? AND COALESCE(normalized_customer_number,'')<>''
        ORDER BY created_at DESC LIMIT 1`, [customerId]);
      return calls[0]?.normalized_customer_number || '';
    },
    async resolveByPhone(phone) {
      const [rows] = await db.query(`SELECT normalized_phone FROM attica_customers
        WHERE normalized_phone=? OR RIGHT(REGEXP_REPLACE(COALESCE(mob2,''), '[^0-9]', ''), 10)=?
        ORDER BY CASE WHEN normalized_phone=? THEN 0 ELSE 1 END,
          COALESCE(last_saved_at, updated_at, created_at) DESC LIMIT 1`, [phone, phone, phone]);
      return rows[0]?.normalized_phone || '';
    },
    async calls(phone, limit) {
      const [rows] = await db.query(`SELECT * FROM attica_calls
        WHERE normalized_customer_number=? ORDER BY created_at DESC LIMIT ?`, [phone, limit]);
      return rows;
    },
    async intakes(phone) {
      const [rows] = await db.query(`SELECT f.*, c.direction AS call_direction, c.status AS call_status,
          c.duration AS call_duration, c.call_date AS call_date, c.call_time AS call_time,
          c.has_recording AS call_has_recording, c.ring_started_at AS call_ring_started_at,
          c.answered_at AS call_answered_at, c.ended_at AS call_ended_at,
          c.talk_duration_seconds AS call_talk_duration_seconds
        FROM attica_intake_forms f LEFT JOIN attica_calls c ON c.id=f.call_id
        WHERE f.normalized_phone=?
        ORDER BY COALESCE(f.last_saved_at,f.updated_at,f.created_at) DESC,
          f.updated_at DESC,f.created_at DESC LIMIT 100`, [phone]);
      return rows;
    },
  };
}
