import { createHash, randomBytes } from 'node:crypto';

const TTL_MINUTES = 30;
const BATCH_SIZE = 250;
const METRICS = new Set(['total', 'inbound', 'outbound', 'answered', 'missed', 'unique']);
const clean = (value, length = 160) => String(value ?? '').trim().slice(0, length);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const number = value => Number(value) || 0;

export function normalizeMdPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.length === 10 ? digits : null;
}

export function mdFilters(query = {}) {
  const filters = {};
  for (const key of ['source', 'agent', 'language', 'branch', 'disposition', 'category', 'search', 'status', 'direction']) {
    const value = clean(query[key]);
    filters[key] = value.toLowerCase() === 'all' ? '' : value;
  }
  filters.metric = clean(query.metric) || 'total';
  if (!METRICS.has(filters.metric)) throw fail('Unsupported call metric');
  filters.date = clean(query.date);
  if (filters.date && !/^\d{4}-\d{2}-\d{2}$/.test(filters.date)) throw fail('Invalid date');
  filters.hour = query.hour === undefined || query.hour === '' ? null : Number(query.hour);
  if (filters.hour !== null && (!Number.isInteger(filters.hour) || filters.hour < 0 || filters.hour > 23)) throw fail('Invalid hour');
  return filters;
}

export function mdWhere(snapshotId, query = {}) {
  const f = mdFilters(query);
  let where = 'snapshot_id=?';
  const params = [snapshotId];
  const columns = { source: 'source', agent: 'agent_key', language: 'language', branch: 'branch',
    disposition: 'disposition', category: 'category', status: 'status', direction: 'direction', date: 'call_date' };
  for (const [key, column] of Object.entries(columns)) {
    if (!f[key]) continue;
    where += ` AND ${column}=?`; params.push(f[key]);
  }
  if (f.hour !== null) { where += ' AND call_hour=?'; params.push(f.hour); }
  if (f.search) {
    where += ' AND (customer LIKE ? OR phone LIKE ? OR agent_name LIKE ? OR agent_key LIKE ? OR raw_id LIKE ? OR source LIKE ? OR branch LIKE ? OR disposition LIKE ?)';
    params.push(...Array(8).fill(`%${f.search}%`));
  }
  if (f.metric === 'inbound') where += " AND direction='incoming'";
  if (f.metric === 'outbound') where += " AND direction='outgoing'";
  if (f.metric === 'answered') where += ' AND answered=1';
  if (f.metric === 'missed') where += ' AND missed=1';
  const unique = f.metric === 'unique' || f.metric === 'missed';
  if (unique) where += ' AND phone IS NOT NULL';
  return { where, params, unique };
}

const SUMMARY_SQL = `COUNT(*) total, SUM(direction='incoming') inbound, SUM(direction='outgoing') outbound,
  SUM(answered) answered, COUNT(DISTINCT CASE WHEN missed=1 THEN phone END) missed,
  COUNT(DISTINCT phone) uniqueCallers`;
const csvCell = value => {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const CSV_COLUMNS = [
  ['Call ID', 'id'], ['Date (IST)', 'date'], ['Time (IST)', 'time'], ['Customer', 'customerName'],
  ['Number', 'callerId'], ['Direction', 'direction'], ['Source', 'leadSource'], ['Agent ID', 'agentId'],
  ['Agent', 'agentName'], ['Language', 'language'], ['Branch', 'branch'], ['Status', 'status'],
  ['Talk Seconds', 'talkDurationSeconds'], ['Disposition', 'callbackStatus'], ['Category', 'dispositionCategory'],
];

// Report-only tables: never modify the operational calls, queues, agents or intakes.
export function createMdReporting({ pool, readerPool = pool, readBatch, normalizeRows, readDetail }) {
  let schema;
  function ensureSchema() {
    if (!schema) schema = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS attica_md_snapshots (
        id char(32) PRIMARY KEY, cache_key char(64) NOT NULL, created_at datetime(3) NOT NULL,
        expires_at datetime(3) NOT NULL, ready tinyint NOT NULL DEFAULT 0,
        from_date date NOT NULL, to_date date NOT NULL,
        KEY cache_lookup(cache_key,ready,created_at), KEY expiry(expires_at)
      ) ENGINE=InnoDB`);
      await pool.query(`CREATE TABLE IF NOT EXISTS attica_md_snapshot_rows (
        snapshot_id char(32) NOT NULL, seq bigint unsigned NOT NULL, raw_id varchar(120) NOT NULL,
        call_date date NOT NULL, call_hour tinyint unsigned NOT NULL, phone varchar(20),
        customer varchar(255) NOT NULL, agent_key varchar(120) NOT NULL, agent_name varchar(120) NOT NULL,
        source varchar(255) NOT NULL, language varchar(40) NOT NULL, branch varchar(150) NOT NULL,
        disposition varchar(160) NOT NULL, category varchar(100) NOT NULL, direction varchar(20) NOT NULL,
        status varchar(40) NOT NULL, answered tinyint NOT NULL, missed tinyint NOT NULL,
        talk_seconds int unsigned NOT NULL, payload mediumtext NOT NULL,
        PRIMARY KEY(snapshot_id,seq), KEY phone_page(snapshot_id,phone,seq),
        KEY direction_page(snapshot_id,direction,seq), KEY agent_page(snapshot_id,agent_key,seq),
        CONSTRAINT fk_attica_md_snapshot FOREIGN KEY(snapshot_id) REFERENCES attica_md_snapshots(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`);
    })().catch(error => { schema = undefined; throw error; });
    return schema;
  }

  async function getSnapshot(query) {
    await ensureSchema();
    if (query.snapshotId) {
      const id = clean(query.snapshotId, 32);
      if (!/^[a-f0-9]{32}$/.test(id)) throw fail('Invalid reporting snapshot');
      const [[row]] = await pool.query('SELECT * FROM attica_md_snapshots WHERE id=? AND ready=1 AND expires_at>UTC_TIMESTAMP(3)', [id]);
      if (!row) throw fail('Reporting snapshot expired. Refresh the dashboard.', 410);
      return row;
    }
    const fromDate = clean(query.fromDate || query.startDate, 10);
    const toDate = clean(query.toDate || query.endDate, 10);
    for (const date of [fromDate, toDate]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
        || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) throw fail('Valid Start Date and End Date required');
    }
    if (fromDate > toDate) throw fail('Start Date must not follow End Date');
    const cacheKey = createHash('sha256').update(`md-v2-ist:${fromDate}:${toDate}`).digest('hex');
    const connection = await pool.getConnection();
    let locked = false;
    let snapshotId;
    try {
      const [[lock]] = await connection.query('SELECT GET_LOCK(?,0) acquired', [`md-report:${cacheKey.slice(0,48)}`]);
      locked = number(lock.acquired) === 1;
      if (!locked) throw fail('Report is being prepared. Try again shortly.', 503);
      const [[cached]] = await connection.query(`SELECT * FROM attica_md_snapshots WHERE cache_key=? AND ready=1
        AND created_at>UTC_TIMESTAMP(3)-INTERVAL 60 SECOND ORDER BY created_at DESC LIMIT 1`, [cacheKey]);
      if (cached) return cached;
      await connection.query('DELETE FROM attica_md_snapshots WHERE expires_at<UTC_TIMESTAMP(3) LIMIT 5');
      snapshotId = randomBytes(16).toString('hex');
      await connection.query(`INSERT INTO attica_md_snapshots(id,cache_key,created_at,expires_at,from_date,to_date)
        VALUES (?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)+INTERVAL ? MINUTE,?,?)`, [snapshotId,cacheKey,TTL_MINUTES,fromDate,toDate]);
      // A read-only MVCC transaction freezes call values across bounded batches.
      const reader = await readerPool.getConnection();
      try {
        await reader.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await reader.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        let cursor = null;
        let seq = 0;
        while (true) {
          const rows = await readBatch(reader, { fromDate, toDate }, cursor, BATCH_SIZE);
          if (!rows.length) break;
          const normalized = await normalizeRows(rows, reader);
          const values = rows.map((raw, index) => {
            const r = normalized[index];
            const payload = Object.fromEntries(['id','date','time','customerName','callerId','agentId','agentName','direction',
              'status','duration','talkDurationSeconds','branch','language','purpose','callbackStatus','dispositionCategory',
              'leadSource','hasRecording'].map(key => [key,r[key] ?? '']));
            payload.id = raw.id;
            payload.callbackStatus = r.callbackStatus || 'None';
            payload.dispositionCategory = r.dispositionCategory || 'Unmapped';
            payload.language = clean(r.language,40) || 'Unknown';
            payload.leadSource = r.leadSource || (r.direction === 'incoming' ? 'Incoming' : 'Manual');
            payload.customerName = clean(r.customerName,255) || 'N/A';
            return [snapshotId,++seq,raw.id,r.date,raw.report_hour,
              normalizeMdPhone(raw.normalized_customer_number || r.callerId),payload.customerName,
              r.agentId || r.agentName || 'UNKNOWN',clean(r.agentName,120),clean(payload.leadSource,255),payload.language,
              clean(r.branch,150) || 'Unknown',clean(payload.callbackStatus),clean(payload.dispositionCategory,100),
              r.direction,r.status,number(raw.report_answered),number(raw.report_missed),number(r.talkDurationSeconds),JSON.stringify(payload)];
          });
          await connection.query('INSERT INTO attica_md_snapshot_rows VALUES ?', [values]);
          const last = rows.at(-1);
          cursor = { createdAt:last.created_at,id:last.id };
        }
        await reader.commit();
      } catch(error) { await reader.rollback(); throw error; }
      finally { reader.release(); }
      await connection.query('UPDATE attica_md_snapshots SET ready=1 WHERE id=?',[snapshotId]);
      const [[snapshot]] = await connection.query('SELECT * FROM attica_md_snapshots WHERE id=?',[snapshotId]);
      return snapshot;
    } catch(error) {
      if(snapshotId) await connection.query('DELETE FROM attica_md_snapshots WHERE id=?',[snapshotId]);
      throw error;
    } finally {
      if(locked) await connection.query('SELECT RELEASE_LOCK(?)',[`md-report:${cacheKey.slice(0,48)}`]);
      connection.release();
    }
  }

  const metadata = snapshot => ({ snapshotId:snapshot.id, dataAsOf:new Date(snapshot.created_at).toISOString(),
    expiresAt:new Date(snapshot.expires_at).toISOString() });
  async function summary(query) {
    const snapshot = await getSnapshot(query);
    const {where,params} = mdWhere(snapshot.id,{...query,metric:'total'});
    const [[totals]] = await pool.query(`SELECT ${SUMMARY_SQL} FROM attica_md_snapshot_rows WHERE ${where}`,params);
    const buckets = async (column, key) => {
      const [rows] = await pool.query(`SELECT ${column} name,COUNT(*) calls FROM attica_md_snapshot_rows WHERE ${where}
        GROUP BY ${column} ORDER BY calls DESC,name`,params);
      return rows.map(row=>({[key]:row.name,calls:number(row.calls)}));
    };
    const languages = await buckets('language','language');
    const dispositions = await buckets('disposition','disposition');
    const dispositionCategories = await buckets('category','category');
    const sources = await buckets('source','source');
    const branches = await buckets('branch','branch');
    const hours = await buckets('call_hour','hour');
    const [agents] = await pool.query(`SELECT agent_key id,MAX(agent_name) name,${SUMMARY_SQL},
      SUM(CASE WHEN answered=1 THEN talk_seconds ELSE 0 END) totalTalkTimeSeconds,
      COALESCE(ROUND(AVG(CASE WHEN answered=1 AND talk_seconds>0 THEN talk_seconds END)),0) avgDurationSeconds
      FROM attica_md_snapshot_rows WHERE ${where} GROUP BY agent_key ORDER BY total DESC,id`,params);
    const [daily] = await pool.query(`SELECT DATE_FORMAT(call_date,'%Y-%m-%d') date,${SUMMARY_SQL}
      FROM attica_md_snapshot_rows WHERE ${where} GROUP BY call_date ORDER BY call_date`,params);
    return {...metadata(snapshot),summary:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,number(v)])),
      languages,dispositions,dispositionCategories,sources,branches,agents,daily,
      hourly:Array.from({length:24},(_,hour)=>({hour:`${String(hour).padStart(2,'0')}:00`,calls:hours.find(r=>number(r.hour)===hour)?.calls||0}))};
  }

  function selection(query,snapshot) {
    const {where,params,unique} = mdWhere(snapshot.id,query);
    // Deduplication precedes LIMIT/OFFSET over the entire filtered population.
    const sql = unique
      ? `SELECT r.* FROM attica_md_snapshot_rows r JOIN (SELECT MIN(seq) seq FROM attica_md_snapshot_rows WHERE ${where} GROUP BY phone) u ON u.seq=r.seq WHERE r.snapshot_id=?`
      : `SELECT * FROM attica_md_snapshot_rows WHERE ${where}`;
    return { sql, params:unique?[...params,snapshot.id]:params, where, countParams:params, unique };
  }
  async function records(query) {
    const snapshot = await getSnapshot(query);
    const s = selection(query,snapshot);
    const [[count]] = await pool.query(`SELECT ${s.unique?'COUNT(DISTINCT phone)':'COUNT(*)'} total FROM attica_md_snapshot_rows WHERE ${s.where}`,s.countParams);
    const totalRecords = number(count.total);
    const pageSize = [25,50,100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 50;
    const totalPages = Math.ceil(totalRecords/pageSize);
    const page = Math.min(Math.max(1,Math.floor(number(query.page)||1)),Math.max(1,totalPages));
    const sorts = { newest:'seq ASC',oldest:'seq DESC',customer:'customer ASC,seq ASC',duration:'talk_seconds DESC,seq ASC' };
    const order = sorts[query.sort || 'newest'];
    if (!order) throw fail('Invalid report sort');
    const [rows] = await pool.query(`${s.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,[...s.params,pageSize,(page-1)*pageSize]);
    return {...metadata(snapshot),rows:rows.map(row=>JSON.parse(row.payload)),totalRecords,page,pageSize,totalPages};
  }

  async function exportCsv(query,res) {
    const snapshot = await getSnapshot(query);
    const s = selection(query,snapshot);
    const sort = {newest:'seq ASC',oldest:'seq DESC',customer:'customer ASC,seq ASC',duration:'talk_seconds DESC,seq ASC'}[query.sort||'newest'];
    if(!sort) throw fail('Invalid report sort');
    let sql = `${s.sql} ORDER BY ${sort}`;
    const params = [...s.params];
    if(query.scope === 'page') {
      const result = await records({...query,snapshotId:snapshot.id});
      sql+=' LIMIT ? OFFSET ?';params.push(result.pageSize,(result.page-1)*result.pageSize);
    } else if(query.scope !== 'all') throw fail('Choose page or all export scope');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="attica-md-${mdFilters(query).metric}-${query.scope}.csv"`);
    const connection = await pool.getConnection();
    let stream;
    const close = () => stream?.destroy();
    res.on('close',close);
    try {
      res.write('\uFEFF'+CSV_COLUMNS.map(([label])=>csvCell(label)).join(',')+'\r\n');
      stream = connection.connection.query(sql,params).stream({highWaterMark:50});
      for await (const row of stream) {
        const data = JSON.parse(row.payload);
        if(res.destroyed) break;
        if(!res.write(CSV_COLUMNS.map(([,key])=>csvCell(data[key])).join(',')+'\r\n')) {
          await new Promise(resolve => {
            const ready = () => {res.off('drain',ready);res.off('close',ready);resolve();};
            res.once('drain',ready);res.once('close',ready);
          });
        }
      }
      if(!res.destroyed) res.end();
    } finally { res.off('close',close);stream?.destroy();connection.release(); }
  }

  async function detail(query) {
    const snapshot = await getSnapshot(query);
    const [[row]] = await pool.query('SELECT raw_id FROM attica_md_snapshot_rows WHERE snapshot_id=? AND raw_id=? LIMIT 1',[snapshot.id,clean(query.callId,120)]);
    if(!row) throw fail('Call not in this report',404);
    return readDetail(row.raw_id);
  }
  return {ensureSchema,summary,records,exportCsv,detail};
}

export function mountMdReporting(app,service) {
  for(const [path,handler] of Object.entries({summary:service.summary,records:service.records,detail:service.detail})) {
    app.get(`/api/md-dashboard/${path}`,async(req,res)=>{
      try {res.json(await handler(req.query));}
      catch(error){res.status(error.status||500).json({error:error.status?error.message:'Unable to load report'});if(!error.status) console.error('[md-report]',error);}
    });
  }
  app.get('/api/md-dashboard/export',async(req,res)=>{
    try {await service.exportCsv(req.query,res);}
    catch(error){if(res.headersSent)res.destroy(error);else res.status(error.status||500).json({error:error.status?error.message:'Unable to export report'});}
  });
}
