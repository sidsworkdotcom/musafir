// Idempotent migrations for an EXISTING database (so you never have to DROP DATABASE between phases).
// Usage: npm run db:migrate   — safe to run repeatedly; also run automatically by db:init.
require('dotenv').config();
const mysql = require('mysql2/promise');

const MIGRATIONS = [
  // [table, column, definition]
  ['users', 'is_verified',    'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['users', 'verify_token',   'VARCHAR(64) UNIQUE'],
  ['users', 'verify_expires', 'DATETIME'],
  ['users', 'reset_token',    'VARCHAR(64) UNIQUE'],
  ['users', 'reset_expires',  'DATETIME'],
];

async function migrate(conn) {
  const { DB_NAME } = process.env;
  let applied = 0;
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
    const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
    const n = await migrate(conn);
    console.log(n ? `✔ ${n} migration(s) applied` : '✔ Schema already up to date');
    await conn.end();
  })().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
}
