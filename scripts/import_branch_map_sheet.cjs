const fs = require('fs');
const mysql = require('/root/attica-api/node_modules/mysql2/promise');

const csvPath = process.argv[2] || '/tmp/attica-branch-map.csv';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function isUrl(value) {
  return /^https?:\/\//i.test(clean(value));
}

function normalizeState(value) {
  const raw = clean(value);
  const key = raw.toLowerCase();
  if (key === 'ap') return 'Andhra Pradesh';
  if (key === 'tn' || key === 'chennai') return 'Tamil Nadu';
  return raw;
}

function deriveBranchName(rawBranch) {
  let text = clean(rawBranch);
  text = text.replace(/\s+/g, ' ');
  const branded = text.match(/(?:Attica\s+Gold\s+Company\s*(?:\|\s*)?)?(?:-\s*)?(?:Best\s+)?Gold\s+Buyers\s*(?:In|in)?\s*(.+)$/i);
  if (branded) text = clean(branded[1]);
  text = text.replace(/^In\s+/i, '');
  text = text.replace(/\b(?:Andhra Pradesh|Tamil Nadu|Telangana|Karnataka|India)\b/gi, '');
  text = text.replace(/\b(?:Bangalore|Bengaluru|Hyderabad|Chennai)\b/gi, '');
  text = clean(text.replace(/\s*,\s*/g, ', '));
  if (text.includes(',')) {
    const first = clean(text.split(',')[0]);
    if (first && first.length >= 3) text = first;
  }
  text = text.replace(/^[,.\-\s]+|[,.\-\s]+$/g, '');
  return clean(text) || clean(rawBranch);
}

function buildExistingIndexes(rows) {
  return rows.map((row) => {
    const keys = [
      row.branchName,
      row.area,
      row.city,
      `${row.branchName || ''} ${row.city || ''}`,
      `${row.area || ''} ${row.city || ''}`,
    ].map(normalize).filter((key) => key.length >= 4);
    return { row, keys };
  });
}

function findMatch(existing, fullBranch, derivedBranch, state) {
  const fullKey = normalize(fullBranch);
  const derivedKey = normalize(derivedBranch);
  const stateKey = normalize(state);
  const exact = existing.find((entry) => entry.keys.includes(derivedKey) || entry.keys.includes(fullKey));
  if (exact) return exact.row;
  return existing.find((entry) => {
    const rowStateKey = normalize(entry.row.state);
    const sameState = !stateKey || !rowStateKey || stateKey === rowStateKey;
    if (!sameState) return false;
    return entry.keys.some((key) => (
      key.length >= 5 &&
      (
        derivedKey.includes(key) ||
        key.includes(derivedKey) ||
        fullKey.includes(key)
      )
    ));
  })?.row || null;
}

async function main() {
  const csv = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseCsv(csv);
  const dataRows = parsed.slice(1)
    .map((row) => ({
      state: normalizeState(row[0]),
      fullBranch: clean(row[1]),
      mapUrl: isUrl(row[2]) ? clean(row[2]) : '',
      bitlyUrl: isUrl(row[3]) ? clean(row[3]) : '',
    }))
    .filter((row) => row.fullBranch && (row.mapUrl || row.bitlyUrl));

  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'custom',
    password: (process.env.ATTICA_DB_PASSWORD || ""),
    database: 'asterisk',
  });

  await db.query("ALTER TABLE wp_branches_database ADD COLUMN IF NOT EXISTS map_url tinytext DEFAULT NULL");
  await db.query("ALTER TABLE wp_branches_database ADD COLUMN IF NOT EXISTS bitly_url tinytext DEFAULT NULL");
  await db.query("UPDATE wp_branches_database SET map_url=COALESCE(NULLIF(map_url,''), NULLIF(url,'')) WHERE IFNULL(map_url,'')=''");

  const [existingRows] = await db.query("SELECT * FROM wp_branches_database WHERE status=1");
  const existing = buildExistingIndexes(existingRows);
  const [maxRows] = await db.query("SELECT COALESCE(MAX(CAST(SUBSTRING(branchId, 6) AS UNSIGNED)), 0) AS max_id FROM wp_branches_database WHERE branchId LIKE 'SHT-%'");
  let nextId = Number(maxRows[0]?.max_id || 0) + 1;
  let updated = 0;
  let inserted = 0;
  let skippedDuplicate = 0;
  const seenSheetKeys = new Set();

  for (const row of dataRows) {
    const derived = deriveBranchName(row.fullBranch);
    const dedupeKey = `${normalize(row.state)}:${normalize(derived)}:${normalize(row.mapUrl || row.bitlyUrl)}`;
    if (seenSheetKeys.has(dedupeKey)) {
      skippedDuplicate += 1;
      continue;
    }
    seenSheetKeys.add(dedupeKey);

    const match = findMatch(existing, row.fullBranch, derived, row.state);
    if (match) {
      await db.query(
        `UPDATE wp_branches_database
         SET map_url=COALESCE(NULLIF(?, ''), map_url, url),
             bitly_url=COALESCE(NULLIF(?, ''), bitly_url),
             url=COALESCE(NULLIF(?, ''), NULLIF(?, ''), url),
             state=COALESCE(NULLIF(state, ''), ?)
         WHERE branchId=?`,
        [row.mapUrl, row.bitlyUrl, row.bitlyUrl, row.mapUrl, row.state, match.branchId]
      );
      updated += 1;
      continue;
    }

    const branchId = `SHT-${String(nextId).padStart(4, '0')}`;
    nextId += 1;
    const city = row.state === 'Tamil Nadu' && normalize(row.fullBranch).includes('chennai') ? 'Chennai' : '';
    await db.query(
      `INSERT INTO wp_branches_database
       (branchId, branchName, addressline, area, city, state, pincode, timings, latitude, longitude, url, map_url, bitly_url, status)
       VALUES (?, ?, ?, ?, ?, ?, '', '9:30 AM - 6:00 PM', '', '', ?, ?, ?, 1)`,
      [
        branchId,
        derived,
        row.fullBranch,
        derived,
        city,
        row.state,
        row.bitlyUrl || row.mapUrl,
        row.mapUrl,
        row.bitlyUrl,
      ]
    );
    inserted += 1;
    existing.push({
      row: { branchId, branchName: derived, area: derived, city, state: row.state },
      keys: [derived, `${derived} ${city}`].map(normalize).filter((key) => key.length >= 4),
    });
  }

  await db.end();
  console.log(JSON.stringify({
    parsedRows: dataRows.length,
    updated,
    inserted,
    skippedDuplicate,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
