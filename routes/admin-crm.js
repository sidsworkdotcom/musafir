// Admin CRM + analytics. Purely additive: read-only queries over users/bookings/packages,
// plus one optional soft-deactivate toggle (needs users.is_active — see db/migrate.js).
// Mounted at /admin alongside routes/admin.js; no existing route is touched.
const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Same session gate routes/admin.js uses. Duplicated deliberately so that file stays untouched.
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// ---------------------------------------------------------------------------
// Reporting day boundary.
// TIMESTAMP columns come back in the DB session's timezone: IST on local XAMPP,
// UTC on RDS. Set REPORT_TZ_SHIFT_MIN=330 in .env on the server so "today" and
// "this month" follow IST. Default 0 = behave exactly like the DB clock.
// Both sides of every comparison are shifted, so the numbers stay consistent.
// ---------------------------------------------------------------------------
const SHIFT = Number(process.env.REPORT_TZ_SHIFT_MIN) || 0;
const L = `DATE_ADD(b.created_at, INTERVAL ${SHIFT} MINUTE)`;   // booking time, report-local
const NOW_L = `DATE_ADD(NOW(), INTERVAL ${SHIFT} MINUTE)`;      // now, report-local
const PAID = `b.status IN ('CONFIRMED','COMPLETED')`;           // money actually taken

// users.is_active only exists after db:migrate. Detect once, degrade gracefully if absent.
let _hasIsActive = null;
async function hasIsActive() {
  if (_hasIsActive !== null) return _hasIsActive;
  try {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'`);
    _hasIsActive = r.n > 0;
  } catch (e) { _hasIsActive = false; }
  return _hasIsActive;
}

// View helpers. COALESCE in SQL + these guards means an empty table renders 0, never NaN.
router.use((req, res, next) => {
  res.locals.inr = n => '\u20B9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  res.locals.num = n => Number(n || 0).toLocaleString('en-IN');
  res.locals.day = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014');
  res.locals.dayTime = d => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '\u2014');
  next();
});

// ============================ ANALYTICS ============================
router.get('/analytics', requireAdmin, async (req, res, next) => {
  try {
    // One pass over bookings for every headline number.
    const [[k]] = await pool.query(`
      SELECT
        COUNT(*)                                                            AS all_bookings,
        COALESCE(SUM(${PAID}), 0)                                           AS paid_bookings,
        COALESCE(SUM(CASE WHEN ${PAID} THEN b.amount END), 0)               AS revenue,
        COALESCE(SUM(CASE WHEN ${PAID} AND DATE(${L}) = DATE(${NOW_L})
                          THEN b.amount END), 0)                            AS revenue_today,
        COALESCE(SUM(${PAID} AND DATE(${L}) = DATE(${NOW_L})), 0)           AS bookings_today,
        COALESCE(SUM(CASE WHEN ${PAID}
                           AND YEAR(${L})  = YEAR(${NOW_L})
                           AND MONTH(${L}) = MONTH(${NOW_L})
                          THEN b.amount END), 0)                            AS revenue_month,
        COALESCE(SUM(${PAID} AND YEAR(${L}) = YEAR(${NOW_L})
                              AND MONTH(${L}) = MONTH(${NOW_L})), 0)        AS bookings_month,
        COALESCE(SUM(b.status = 'CANCELLED'), 0)                            AS cancelled,
        COALESCE(SUM(CASE WHEN b.status = 'CANCELLED' THEN b.amount END),0) AS cancelled_value,
        COALESCE(SUM(b.status = 'PENDING'), 0)                              AS pending,
        COALESCE(SUM(b.travelers), 0)                                       AS travellers
      FROM bookings b`);

    const [[u]] = await pool.query(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(is_verified), 0) AS verified,
             COALESCE(SUM(DATE(created_at) = CURDATE()), 0) AS new_today
      FROM users WHERE role <> 'ADMIN'`);

    // Revenue by month, last 12 months. Both grouped expressions are in GROUP BY,
    // so this is safe under ONLY_FULL_GROUP_BY.
    const [months] = await pool.query(`
      SELECT DATE_FORMAT(${L}, '%Y-%m') AS ym,
             DATE_FORMAT(${L}, '%b')    AS label,
             COALESCE(SUM(b.amount), 0) AS revenue,
             COUNT(*)                   AS bookings
      FROM bookings b
      WHERE ${PAID} AND ${L} >= DATE_SUB(${NOW_L}, INTERVAL 11 MONTH)
      GROUP BY ym, label
      ORDER BY ym`);

    // Flights/trains/hotels have no category — report the vertical separately from
    // package category, otherwise "most booked category" reads wrong.
    const [verticals] = await pool.query(`
      SELECT b.type,
             COUNT(*) AS bookings,
             COALESCE(SUM(CASE WHEN ${PAID} THEN b.amount END), 0) AS revenue
      FROM bookings b
      GROUP BY b.type
      ORDER BY bookings DESC`);

    const [categories] = await pool.query(`
      SELECT p.category,
             COUNT(*) AS bookings,
             COALESCE(SUM(CASE WHEN ${PAID} THEN b.amount END), 0) AS revenue
      FROM bookings b
      JOIN packages p ON p.id = b.package_id
      WHERE b.type = 'PACKAGE'
      GROUP BY p.category
      ORDER BY bookings DESC`);

    const [topCustomers] = await pool.query(`
      SELECT u.id, u.name, u.email,
             COUNT(*) AS bookings,
             COALESCE(SUM(b.amount), 0) AS spent
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE ${PAID}
      GROUP BY u.id, u.name, u.email
      ORDER BY spent DESC
      LIMIT 8`);

    const [recent] = await pool.query(`
      SELECT b.booking_ref, b.type, b.title, b.amount, b.status, b.created_at,
             u.id AS user_id, u.name, u.email
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at DESC
      LIMIT 12`);

    const paid = Number(k.paid_bookings) || 0;
    const aov = paid ? Number(k.revenue) / paid : 0;
    const cancelRate = Number(k.all_bookings) ? (Number(k.cancelled) / Number(k.all_bookings)) * 100 : 0;

    res.render('admin/analytics', {
      k, u, months, verticals, categories, topCustomers, recent,
      aov, cancelRate, shift: SHIFT,
    });
  } catch (err) { next(err); }
});

// ============================ CUSTOMERS ============================
const SORTS = {
  spent: 'spent DESC, u.id DESC',
  bookings: 'bookings DESC, u.id DESC',
  newest: 'u.created_at DESC',
  name: 'u.name ASC',
};

router.get('/customers', requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().slice(0, 100);
    const sortKey = SORTS[req.query.sort] ? req.query.sort : 'spent';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = 25;
    const offset = (page - 1) * perPage;
    const like = `%${q}%`;
    const withActive = await hasIsActive();

    const where = q ? 'WHERE (u.name LIKE ? OR u.email LIKE ?)' : '';
    const params = q ? [like, like] : [];

    const [[c]] = await pool.query(`SELECT COUNT(*) AS n FROM users u ${where}`, params);

    // Aggregate in a subquery, then join once. Joining bookings directly here would
    // fan the rows out and inflate every count.
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_verified, u.role, u.created_at,
             ${withActive ? 'u.is_active' : '1 AS is_active'},
             COALESCE(s.bookings, 0)  AS bookings,
             COALESCE(s.spent, 0)     AS spent,
             COALESCE(s.cancelled, 0) AS cancelled,
             s.last_booking
      FROM users u
      LEFT JOIN (
        SELECT user_id,
               COUNT(*) AS bookings,
               COALESCE(SUM(CASE WHEN status IN ('CONFIRMED','COMPLETED') THEN amount END), 0) AS spent,
               COALESCE(SUM(status = 'CANCELLED'), 0) AS cancelled,
               MAX(created_at) AS last_booking
        FROM bookings GROUP BY user_id
      ) s ON s.user_id = u.id
      ${where}
      ORDER BY ${SORTS[sortKey]}
      LIMIT ${perPage} OFFSET ${offset}`, params);

    res.render('admin/customers', {
      rows, q, sortKey, page, perPage,
      total: Number(c.n) || 0,
      pages: Math.max(1, Math.ceil((Number(c.n) || 0) / perPage)),
      withActive,
    });
  } catch (err) { next(err); }
});

// CSV export of the current search — handy for the report appendix.
router.get('/customers.csv', requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().slice(0, 100);
    const like = `%${q}%`;
    const where = q ? 'WHERE (u.name LIKE ? OR u.email LIKE ?)' : '';
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_verified, u.created_at,
             COALESCE(s.bookings, 0) AS bookings, COALESCE(s.spent, 0) AS spent
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS bookings,
               COALESCE(SUM(CASE WHEN status IN ('CONFIRMED','COMPLETED') THEN amount END), 0) AS spent
        FROM bookings GROUP BY user_id
      ) s ON s.user_id = u.id
      ${where} ORDER BY spent DESC`, q ? [like, like] : []);

    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = ['id,name,email,verified,joined,bookings,total_spent_inr']
      .concat(rows.map(r => [r.id, r.name, r.email, r.is_verified ? 'yes' : 'no',
        new Date(r.created_at).toISOString().slice(0, 10), r.bookings, Number(r.spent)].map(esc).join(',')))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="musafir-customers.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

router.get('/customers/:id', requireAdmin, async (req, res, next) => {
  try {
    const withActive = await hasIsActive();
    const [[cust]] = await pool.query(`
      SELECT id, name, email, role, is_verified, created_at
             ${withActive ? ', is_active' : ', 1 AS is_active'}
      FROM users WHERE id = ?`, [req.params.id]);
    if (!cust) return res.redirect('/admin/customers');

    const [[stats]] = await pool.query(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(b.status = 'CONFIRMED'), 0) AS confirmed,
             COALESCE(SUM(b.status = 'COMPLETED'), 0) AS completed,
             COALESCE(SUM(b.status = 'CANCELLED'), 0) AS cancelled,
             COALESCE(SUM(b.status = 'PENDING'), 0)   AS pending,
             COALESCE(SUM(CASE WHEN ${PAID} THEN b.amount END), 0) AS spent,
             COALESCE(SUM(CASE WHEN b.status = 'CANCELLED' THEN b.amount END), 0) AS lost,
             MIN(b.created_at) AS first_booking,
             MAX(b.created_at) AS last_booking
      FROM bookings b WHERE b.user_id = ?`, [req.params.id]);

    const [byType] = await pool.query(`
      SELECT b.type, COUNT(*) AS bookings,
             COALESCE(SUM(CASE WHEN ${PAID} THEN b.amount END), 0) AS spent
      FROM bookings b WHERE b.user_id = ?
      GROUP BY b.type ORDER BY bookings DESC`, [req.params.id]);

    const [bookings] = await pool.query(`
      SELECT b.booking_ref, b.type, b.title, b.travel_date, b.travelers,
             b.amount, b.coupon_code, b.status, b.created_at, p.title AS package_title
      FROM bookings b
      LEFT JOIN packages p ON p.id = b.package_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC`, [req.params.id]);

    res.render('admin/customer', { cust, stats, byType, bookings, withActive });
  } catch (err) { next(err); }
});

// Soft deactivate. Never a hard DELETE: bookings.user_id and reviews.user_id are
// foreign keys with no ON DELETE rule, so deleting a customer who ever booked
// fails with MySQL error 1451 and would 500 the page.
router.post('/customers/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    if (!(await hasIsActive())) {
      req.session.flash = { type: 'info', text: 'Run npm run db:migrate to enable deactivation.' };
      return res.redirect('/admin/customers');
    }
    await pool.query('UPDATE users SET is_active = NOT is_active WHERE id = ? AND role <> \'ADMIN\'', [req.params.id]);
    res.redirect(req.body.back || '/admin/customers');
  } catch (err) { next(err); }
});

module.exports = router;
