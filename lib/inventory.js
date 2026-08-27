// Per-date availability for flights / trains / hotels.
// Rows are created lazily the first time a (item, date, class) is looked at, from the item's
// per-day capacity. Decrement is the same atomic pattern as package_dates:
//   UPDATE inventory SET seats_left = seats_left - n WHERE ... AND seats_left >= n
// so two users racing for the last seat cannot both win.

const pool = require('../db/pool');

const ymd = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

// Add n days to a YYYY-MM-DD string (UTC-safe).
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
// ISO weekday 1..7 for YYYY-MM-DD
function isoWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun
  return d === 0 ? 7 : d;
}
const operatesOn = (daysOfWeek, dateStr) => String(daysOfWeek || '1234567').includes(String(isoWeekday(dateStr)));

// Make sure the row exists (INSERT IGNORE is race-safe thanks to the unique key).
async function ensure(conn, type, itemId, date, subKey, total) {
  await conn.query(
    'INSERT IGNORE INTO inventory (item_type, item_id, travel_date, sub_key, seats_total, seats_left) VALUES (?,?,?,?,?,?)',
    [type, itemId, date, subKey || '', total, total]);
}

// Read-only: how many left (creates the row if missing so the number is stable).
async function left(type, itemId, date, subKey, total) {
  await ensure(pool, type, itemId, date, subKey, total);
  const [[row]] = await pool.query(
    'SELECT seats_left FROM inventory WHERE item_type = ? AND item_id = ? AND travel_date = ? AND sub_key = ?',
    [type, itemId, date, subKey || '']);
  return row ? row.seats_left : 0;
}

// Atomic take inside a transaction. Returns true if all n were taken.
async function take(conn, type, itemId, date, subKey, total, n) {
  await ensure(conn, type, itemId, date, subKey, total);
  const [r] = await conn.query(
    'UPDATE inventory SET seats_left = seats_left - ? WHERE item_type = ? AND item_id = ? AND travel_date = ? AND sub_key = ? AND seats_left >= ?',
    [n, type, itemId, date, subKey || '', n]);
  return r.affectedRows === 1;
}

async function release(conn, type, itemId, date, subKey, n) {
  await conn.query(
    'UPDATE inventory SET seats_left = LEAST(seats_left + ?, seats_total) WHERE item_type = ? AND item_id = ? AND travel_date = ? AND sub_key = ?',
    [n, type, itemId, date, subKey || '']);
}

// Hotels span several nights: every night must have a room. All-or-nothing.
async function takeNights(conn, hotelId, checkin, checkout, roomCode, total, rooms) {
  const nights = daysBetween(checkin, checkout);
  for (let i = 0; i < nights; i++) {
    const ok = await take(conn, 'HOTEL', hotelId, addDays(checkin, i), roomCode, total, rooms);
    if (!ok) return false; // caller rolls back the transaction, undoing earlier nights
  }
  return true;
}
async function releaseNights(conn, hotelId, checkin, checkout, roomCode, rooms) {
  const nights = daysBetween(checkin, checkout);
  for (let i = 0; i < nights; i++) await release(conn, 'HOTEL', hotelId, addDays(checkin, i), roomCode, rooms);
}
// Minimum rooms left across the stay (for the search results badge).
async function leftNights(hotelId, checkin, checkout, roomCode, total) {
  const nights = Math.max(1, daysBetween(checkin, checkout));
  let min = Infinity;
  for (let i = 0; i < nights; i++) min = Math.min(min, await left('HOTEL', hotelId, addDays(checkin, i), roomCode, total));
  return min;
}

module.exports = { ymd, addDays, daysBetween, isoWeekday, operatesOn, left, take, release, takeNights, releaseNights, leftNights };
