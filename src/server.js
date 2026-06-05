const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'keys.db')
  : path.join(__dirname, '..', 'keys.db');

let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_code TEXT, property TEXT, unit TEXT, unit_type TEXT,
      UNIQUE(property_code, unit)
    );
    CREATE TABLE IF NOT EXISTS key_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER, has_keys INTEGER,
      checked_at TEXT, checked_by TEXT, notes TEXT
    );
  `);

  // Seed if empty
  const count = db.exec('SELECT COUNT(*) as c FROM units')[0].values[0][0];
  if (count === 0) {
    const units = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'units_data.json'), 'utf8'));
    const stmt = db.prepare('INSERT OR IGNORE INTO units (property_code, property, unit, unit_type) VALUES (?,?,?,?)');
    for (const u of units) stmt.run([u.property_code, u.property, u.unit, u.unit_type]);
    stmt.free();
    saveDb();
    console.log(`Seeded ${units.length} units`);
  }
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function queryAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch(e) { console.error(e); return []; }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/properties', (req, res) => {
  const rows = queryAll(`
    SELECT u.property_code, u.property,
      COUNT(*) as total,
      SUM(CASE WHEN kc.has_keys IS NOT NULL THEN 1 ELSE 0 END) as checked,
      SUM(CASE WHEN kc.has_keys = 1 THEN 1 ELSE 0 END) as keys_yes,
      SUM(CASE WHEN kc.has_keys = 0 THEN 1 ELSE 0 END) as keys_no
    FROM units u
    LEFT JOIN (
      SELECT unit_id, has_keys FROM key_checks
      WHERE id IN (SELECT MAX(id) FROM key_checks GROUP BY unit_id)
    ) kc ON kc.unit_id = u.id
    GROUP BY u.property_code, u.property
    ORDER BY u.property
  `);
  res.json(rows);
});

app.get('/api/units', (req, res) => {
  const code = req.query.property_code;
  const rows = queryAll(`
    SELECT u.id, u.unit, u.unit_type,
      kc.has_keys, kc.checked_at, kc.checked_by, kc.notes
    FROM units u
    LEFT JOIN (
      SELECT unit_id, has_keys, checked_at, checked_by, notes
      FROM key_checks
      WHERE id IN (SELECT MAX(id) FROM key_checks GROUP BY unit_id)
    ) kc ON kc.unit_id = u.id
    WHERE u.property_code = ?
    ORDER BY u.unit
  `, [code]);
  res.json(rows);
});

app.post('/api/check', (req, res) => {
  const { unit_id, has_keys, checked_by, notes } = req.body;
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO key_checks (unit_id, has_keys, checked_at, checked_by, notes) VALUES (?,?,?,?,?)',
    [unit_id, has_keys ? 1 : 0, now, checked_by || 'unknown', notes || null]
  );
  saveDb();
  res.json({ ok: true });
});

app.get('/api/export', (req, res) => {
  const rows = queryAll(`
    SELECT u.property, u.unit, u.unit_type,
      CASE kc.has_keys WHEN 1 THEN 'Yes' WHEN 0 THEN 'No' ELSE 'Unchecked' END as has_keys,
      kc.checked_at, kc.checked_by, kc.notes
    FROM units u
    LEFT JOIN (
      SELECT unit_id, has_keys, checked_at, checked_by, notes
      FROM key_checks
      WHERE id IN (SELECT MAX(id) FROM key_checks GROUP BY unit_id)
    ) kc ON kc.unit_id = u.id
    ORDER BY u.property, u.unit
  `);
  const csv = [
    'Property,Unit,Unit Type,Has Keys,Checked At,Checked By,Notes',
    ...rows.map(r =>
      ['property','unit','unit_type','has_keys','checked_at','checked_by','notes']
        .map(k => `"${String(r[k] || '').replace(/"/g,'""')}"`)
        .join(',')
    )
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="key_check_results.csv"');
  res.send(csv);
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Key Tracker running on port ${PORT}`));
});
