const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const mailer = require('../mail/mailer');
const router = express.Router();

// Razorpay is optional in dev: with no keys in .env the app runs in SIMULATE mode
// so the whole booking flow is demoable before you create a Razorpay account.
const RZP_ENABLED = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
let razorpay = null;
if (RZP_ENABLED) {
  const Razorpay = require('razorpay');
  razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

const makeRef = () => 'MSFR-' + crypto.randomBytes(3).toString('hex').toUpperCase();

async function validateCoupon(code) {
  if (!code) return null;
  const [[c]] = await pool.query(
    'SELECT * FROM coupons WHERE code = ? AND is_active = TRUE AND (expires_at IS NULL OR expires_at >= CURDATE())',
    [code.trim().toUpperCase()]
  );
  return c || null;
}

async function activeCoupons() {
  const [rows] = await pool.query('SELECT code, discount_pct, max_discount, expires_at FROM coupons WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at >= CURDATE()) ORDER BY discount_pct DESC');
  return rows;
}

function priceWithCoupon(base, coupon) {
  if (!coupon) return { amount: base, discount: 0 };
  let discount = Math.round(base * coupon.discount_pct / 100);
  if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
  return { amount: base - discount, discount };
}

// ---------- Step 1: booking form ----------
router.get('/book/:slug', requireLogin, async (req, res, next) => {
  try {
    const [[pkg]] = await pool.query('SELECT * FROM packages WHERE slug = ? AND is_active = TRUE', [req.params.slug]);
    if (!pkg) return res.status(404).render('error', { code: 404, message: 'Package not found.' });
    const [dates] = await pool.query(
      'SELECT * FROM package_dates WHERE package_id = ? AND start_date >= CURDATE() AND slots_left > 0 ORDER BY start_date', [pkg.id]);
    const coupons = await activeCoupons();
    res.render('book', { pkg, dates, coupons, error: null, prefill: (req.query.coupon || '').toUpperCase() });
  } catch (err) { next(err); }
});

// ---------- Step 2: create PENDING booking + payment order ----------
router.post('/book/:slug/checkout', requireLogin, async (req, res, next) => {
  try {
    const [[pkg]] = await pool.query('SELECT * FROM packages WHERE slug = ? AND is_active = TRUE', [req.params.slug]);
    if (!pkg) return res.status(404).render('error', { code: 404, message: 'Package not found.' });

    const dateId = Number(req.body.date_id);
    const travelers = Math.max(1, Math.min(10, Number(req.body.travelers) || 1));

    const [[slot]] = await pool.query(
      'SELECT * FROM package_dates WHERE id = ? AND package_id = ? AND start_date >= CURDATE()', [dateId, pkg.id]);
    const [dates] = await pool.query(
      'SELECT * FROM package_dates WHERE package_id = ? AND start_date >= CURDATE() AND slots_left > 0 ORDER BY start_date', [pkg.id]);

    const coupons = await activeCoupons();
    const fail = msg => res.render('book', { pkg, dates, coupons, error: msg, prefill: (req.body.coupon || '').toUpperCase() });
    if (!slot) return fail('Please pick a departure date.');
    if (slot.slots_left < travelers) return fail(`Only ${slot.slots_left} slot(s) left on that date - reduce travellers or pick another date.`);

    const coupon = await validateCoupon(req.body.coupon);
    if (req.body.coupon && !coupon) return fail('That coupon code is invalid or expired.');

    const base = Number(pkg.price) * travelers;
    const { amount, discount } = priceWithCoupon(base, coupon);
    const ref = makeRef();

    let rzpOrderId = null;
    if (RZP_ENABLED) {
      const order = await razorpay.orders.create({ amount: amount * 100, currency: 'INR', receipt: ref });
      rzpOrderId = order.id;
    }

    const [r] = await pool.query(
      `INSERT INTO bookings (booking_ref, user_id, package_id, package_date_id, travelers, amount, coupon_code, status, razorpay_order_id)
       VALUES (?,?,?,?,?,?,?, 'PENDING', ?)`,
      [ref, req.session.user.id, pkg.id, dateId, travelers, amount, coupon ? coupon.code : null, rzpOrderId]
    );

    res.render('pay', {
      pkg, slot, travelers, base, discount, amount,
      couponCode: coupon ? coupon.code : null,
      bookingId: r.insertId, bookingRef: ref,
      rzpEnabled: RZP_ENABLED, rzpKeyId: process.env.RAZORPAY_KEY_ID || null, rzpOrderId,
    });
  } catch (err) { next(err); }
});

// ---------- Confirm helpers: atomic slot decrement is the concurrency story ----------
async function confirmBooking(bookingId, userId, paymentId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[b]] = await conn.query('SELECT * FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE', [bookingId, userId]);
    if (!b || b.status !== 'PENDING') { await conn.rollback(); return { ok: false, reason: 'Booking not found or already processed.' }; }

    // Conditional decrement: if two people race for the last slots, only one UPDATE matches.
    const [upd] = await conn.query(
      'UPDATE package_dates SET slots_left = slots_left - ? WHERE id = ? AND slots_left >= ?',
      [b.travelers, b.package_date_id, b.travelers]
    );
    if (upd.affectedRows === 0) { await conn.rollback(); return { ok: false, reason: 'Sorry - those slots were just taken. Your payment (if any) will be refunded.' }; }

    await conn.query('UPDATE bookings SET status = "CONFIRMED", razorpay_payment_id = ? WHERE id = ?', [paymentId, bookingId]);
    await conn.commit();
    sendConfirmationMail(b).catch(e => console.error('confirmation mail failed:', e.message));
    return { ok: true, ref: b.booking_ref };
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}

// Fire-and-forget: the booking is already committed; a mail failure must never undo it.
async function sendConfirmationMail(b) {
  const [[row]] = await pool.query(`
    SELECT u.email, u.name, p.title, p.destination, p.price, d.start_date
    FROM bookings bk JOIN users u ON u.id = bk.user_id JOIN packages p ON p.id = bk.package_id JOIN package_dates d ON d.id = bk.package_date_id
    WHERE bk.id = ?`, [b.id]);
  if (!row) return;
  const base = Number(row.price) * b.travelers;
  await mailer.bookingConfirmed({
    to: row.email, name: row.name,
    booking: { ref: b.booking_ref, title: row.title, destination: row.destination, startDate: row.start_date,
      travelers: b.travelers, amount: b.amount, coupon: b.coupon_code, discount: base - Number(b.amount) },
  });
}

// ---------- Step 3a: real Razorpay verification ----------
router.post('/book/verify', requireLogin, async (req, res, next) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).render('error', { code: 400, message: 'Payment verification failed. If money was deducted it will be auto-refunded by Razorpay.' });
    }
    const result = await confirmBooking(Number(bookingId), req.session.user.id, razorpay_payment_id);
    if (!result.ok) return res.render('error', { code: 409, message: result.reason });
    res.redirect('/my-bookings?confirmed=' + result.ref);
  } catch (err) { next(err); }
});

// ---------- Step 3b: simulate mode (no Razorpay keys configured) ----------
router.post('/book/simulate-pay', requireLogin, async (req, res, next) => {
  try {
    if (RZP_ENABLED) return res.status(400).render('error', { code: 400, message: 'Simulate mode is disabled when Razorpay is configured.' });
    const result = await confirmBooking(Number(req.body.bookingId), req.session.user.id, 'SIMULATED-' + Date.now());
    if (!result.ok) return res.render('error', { code: 409, message: result.reason });
    res.redirect('/my-bookings?confirmed=' + result.ref);
  } catch (err) { next(err); }
});

// ---------- My Bookings ----------
router.get('/my-bookings', requireLogin, async (req, res, next) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.*, p.title, p.slug, p.destination, p.image_url, d.start_date,
             (SELECT COUNT(*) FROM reviews r WHERE r.user_id = b.user_id AND r.package_id = b.package_id) AS has_review
      FROM bookings b
      JOIN packages p ON p.id = b.package_id
      JOIN package_dates d ON d.id = b.package_date_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [req.session.user.id]);
    res.render('my-bookings', { bookings, confirmedRef: req.query.confirmed || null });
  } catch (err) { next(err); }
});

// ---------- Cancel (restores slots; fake "refund initiated" for demo) ----------
router.post('/bookings/:id/cancel', requireLogin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[b]] = await conn.query('SELECT * FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.session.user.id]);
    if (b && (b.status === 'PENDING' || b.status === 'CONFIRMED')) {
      if (b.status === 'CONFIRMED') {
        await conn.query('UPDATE package_dates SET slots_left = LEAST(slots_left + ?, total_slots) WHERE id = ?', [b.travelers, b.package_date_id]);
      }
      await conn.query('UPDATE bookings SET status = "CANCELLED" WHERE id = ?', [b.id]);
    }
    await conn.commit();
    res.redirect('/my-bookings');
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// ---------- Reviews: verified bookings only ----------
router.post('/packages/:id/review', requireLogin, async (req, res, next) => {
  try {
    const pkgId = Number(req.params.id);
    const rating = Math.max(1, Math.min(5, Number(req.body.rating) || 0));
    const comment = (req.body.comment || '').trim().slice(0, 500);

    const [[booked]] = await pool.query(
      'SELECT id FROM bookings WHERE user_id = ? AND package_id = ? AND status IN ("CONFIRMED","COMPLETED") LIMIT 1',
      [req.session.user.id, pkgId]);
    if (!booked) return res.status(403).render('error', { code: 403, message: 'Only travellers with a confirmed booking can review this package.' });

    await pool.query(
      `INSERT INTO reviews (user_id, package_id, rating, comment) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
      [req.session.user.id, pkgId, rating, comment || null]);

    const [[pkg]] = await pool.query('SELECT slug FROM packages WHERE id = ?', [pkgId]);
    res.redirect('/packages/' + pkg.slug + '#reviews');
  } catch (err) { next(err); }
});

module.exports = router;
