// One-command database setup: creates the DB (if missing), runs schema.sql, then seed.sql.
// Usage: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const migrate = require('./migrate');

(async () => {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const conn = await mysql.createConnection({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    multipleStatements: true,
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
  await conn.query(`USE \`${DB_NAME}\``);

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('✔ Schema created');
  await migrate(conn); // bring older DBs up to date without dropping them

  const [rows] = await conn.query('SELECT COUNT(*) AS n FROM packages');
  if (rows[0].n === 0) {
    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await conn.query(seed);
    console.log('✔ Seed data inserted (6 packages, dates, itineraries, 3 coupons)');
  } else {
    console.log('↷ Packages already exist, skipping seed');
  }

  await conn.end();
  console.log('Database ready. Run: npm run dev');
})().catch((err) => { console.error('DB init failed:', err.message); process.exit(1); });
