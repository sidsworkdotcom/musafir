// Idempotent migrations for an EXISTING database (so you never have to DROP DATABASE between phases).
// Usage: npm run db:migrate   — safe to run repeatedly; also run automatically by db:init.
require('dotenv').config();
const mysql = require('mysql2/promise');

const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  // [table, column, definition]
  ['users', 'is_verified',    'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['users', 'verify_token',   'VARCHAR(64) UNIQUE'],
  ['users', 'verify_expires', 'DATETIME'],
  ['users', 'reset_token',    'VARCHAR(64) UNIQUE'],
  ['users', 'reset_expires',  'DATETIME'],
  // admin CRM: soft-deactivate instead of DELETE (bookings.user_id is a FK)
  ['users', 'is_active',      'BOOLEAN NOT NULL DEFAULT TRUE'],
  // multi-vertical bookings (flights / trains / hotels)
  ['bookings', 'type',        "ENUM('PACKAGE','FLIGHT','TRAIN','HOTEL') NOT NULL DEFAULT 'PACKAGE'"],
  ['bookings', 'item_id',     'INT NULL'],
  ['bookings', 'travel_date', 'DATE NULL'],
  ['bookings', 'end_date',    'DATE NULL'],
  ['bookings', 'sub_key',     'VARCHAR(20) NULL'],
  ['bookings', 'title',       'VARCHAR(200) NULL'],
  ['bookings', 'details',     'JSON NULL'],
];

// Columns whose definition changed (NOT NULL -> NULL). MODIFY is idempotent.
const MODIFY = [
  ['bookings', 'package_id',      'INT NULL'],
  ['bookings', 'package_date_id', 'INT NULL'],
];

async function migrate(conn) {
  const { DB_NAME } = process.env;
  let applied = 0;

  // New tables (CREATE TABLE IF NOT EXISTS in schema.sql is safe to re-run in full).
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const [[before]] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [DB_NAME]);
  await conn.query(schema);
  const [[after]] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [DB_NAME]);
  if (after.n > before.n) { console.log(`  + ${after.n - before.n} new table(s)`); applied++; }
  for (const [table, column, def] of MIGRATIONS) {
    const [[row]] = await conn.query(
      'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [DB_NAME, table, column]);
    if (row.n === 0) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
      console.log(`  + ${table}.${column}`);
      applied++;
    }
  }
  for (const [table, column, def] of MODIFY) {
    const [[row]] = await conn.query(
      'SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [DB_NAME, table, column]);
    if (row && row.IS_NULLABLE === 'NO') {
      await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${def}`);
      console.log(`  ~ ${table}.${column} now nullable`);
      applied++;
    }
  }

  // Travel inventory seed (flights/trains/hotels) if the tables are empty.
  const [[fl]] = await conn.query('SELECT COUNT(*) AS n FROM flights');
  if (fl.n === 0) {
    const travelSeed = fs.readFileSync(path.join(__dirname, 'seed-travel.sql'), 'utf8');
    await conn.query(travelSeed);
    console.log('  + travel inventory seeded (flights, trains, hotels)');
    applied++;
  }

  // One-off: early seed priced Sleeper fares ~10x too high. Recalibrate if that formula is detected.
  const [[bad]] = await conn.query("SELECT COUNT(*) AS n FROM train_classes c JOIN trains t ON t.id = c.train_id WHERE c.class_code = 'SL' AND c.price > t.duration_min * 2");
  if (bad.n > 0) {
    await conn.query(`UPDATE train_classes c JOIN trains t ON t.id = c.train_id
      SET c.price = ROUND((CASE c.class_code WHEN 'SL' THEN 0.45 WHEN '3A' THEN 1.2 WHEN '2A' THEN 1.7 WHEN '1A' THEN 2.9 END) * t.duration_min / 10) * 10
      WHERE c.class_code IN ('SL','3A','2A','1A') AND t.train_no NOT IN ('12951','12952','12430','12301')`);
    console.log('  ~ train fares recalibrated'); applied++;
  }

  // Coupons added after the original seed (INSERT IGNORE = no duplicates on re-run).
  await conn.query(`INSERT IGNORE INTO coupons (code, discount_pct, max_discount, expires_at) VALUES
    ('HILLS15', 15, 2000.00, DATE_ADD(CURDATE(), INTERVAL 120 DAY)),
    ('NODETENTION2026', 25, 3000.00, DATE_ADD(CURDATE(), INTERVAL 365 DAY)),
    ('DEKHO_MAAM_WE_TRIED', 30, 3500.00, DATE_ADD(CURDATE(), INTERVAL 365 DAY))`);

  // Accounts created before email verification existed stay usable.
  const [r] = await conn.query('UPDATE users SET is_verified = TRUE WHERE password_hash IS NOT NULL AND verify_token IS NULL AND is_verified = FALSE');
  if (r.affectedRows) console.log(`  ~ marked ${r.affectedRows} pre-existing user(s) verified`);
  return applied;
}

module.exports = migrate;

if (require.main === module) {
  (async () => {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, multipleStatements: true });
    const n = await migrate(conn);
    console.log(n ? `✔ ${n} migration(s) applied` : '✔ Schema already up to date');
    await conn.end();
  })().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
}
