const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const inv = require('../lib/inventory');
const { parsePassengers, namesOf } = require('../lib/passengers');
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

async function createOrder(amount, ref) {
  if (!RZP_ENABLED) return null;
  const order = await razorpay.orders.create({ amount: amount * 100, currency: 'INR', receipt: ref });
  return order.id;
}

// Render the shared pay page. `summary` is what the fare ticket shows, regardless of vertical.
function renderPay(res, { summary, travelers, base, discount, amount, couponCode, bookingId, bookingRef, rzpOrderId }) {
  res.render('pay', {
    summary, travelers, base, discount, amount, couponCode, bookingId, bookingRef,
    rzpEnabled: RZP_ENABLED, rzpKeyId: process.env.RAZORPAY_KEY_ID || null, rzpOrderId,
  });
}

// ---------- Package booking: Step 1 form ----------
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

// ---------- Package booking: Step 2 create PENDING booking + payment order ----------
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
    const parsed = parsePassengers(req.body, travelers);
    if (parsed.error) return fail(parsed.error);
    const details = { unit_price: Number(pkg.price), passengers: parsed.passengers };

    const base = Number(pkg.price) * travelers;
    const { amount, discount } = priceWithCoupon(base, coupon);
    const ref = makeRef();
    const rzpOrderId = await createOrder(amount, ref);

    const [r] = await pool.query(
      `INSERT INTO bookings (booking_ref, user_id, type, package_id, package_date_id, travel_date, title, details, travelers, amount, coupon_code, status, razorpay_order_id)
       VALUES (?,?,'PACKAGE',?,?,?,?,?,?,?,?, 'PENDING', ?)`,
      [ref, req.session.user.id, pkg.id, dateId, inv.ymd(slot.start_date), pkg.title, JSON.stringify(details), travelers, amount, coupon ? coupon.code : null, rzpOrderId]
    );

    renderPay(res, {
      summary: {
        kind: 'PACKAGE', title: pkg.title, subtitle: `${pkg.destination}, ${pkg.state} · ${pkg.duration_days}D/${pkg.duration_days - 1}N`,
        dateLabel: fmtDate(slot.start_date), unitLabel: 'Travellers', unitPrice: Number(pkg.price), names: namesOf(details),
      },
      travelers, base, discount, amount, couponCode: coupon ? coupon.code : null,
      bookingId: r.insertId, bookingRef: ref, rzpOrderId,
    });
  } catch (err) { next(err); }
});

const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

// ---------- Confirm: atomic seat decrement is the concurrency story ----------
async function confirmBooking(bookingId, userId, paymentId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[b]] = await conn.query('SELECT * FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE', [bookingId, userId]);
    if (!b || b.status !== 'PENDING') { await conn.rollback(); return { ok: false, reason: 'Booking not found or already processed.' }; }

    const ok = await takeSeats(conn, b);
    if (!ok) { await conn.rollback(); return { ok: false, reason: 'Sorry - those seats were just taken. Your payment (if any) will be refunded.' }; }

    await conn.query('UPDATE bookings SET status = "CONFIRMED", razorpay_payment_id = ? WHERE id = ?', [paymentId, bookingId]);
    await conn.commit();
    sendConfirmationMail(b).catch(e => console.error('confirmation mail failed:', e.message));
    return { ok: true, ref: b.booking_ref };
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}

// Per-vertical seat take/release. Conditional UPDATEs: if two people race for the last seat, only one matches.
async function takeSeats(conn, b) {
  const d = inv.ymd(b.travel_date);
  switch (b.type) {
    case 'PACKAGE': {
      const [upd] = await conn.query(
        'UPDATE package_dates SET slots_left = slots_left - ? WHERE id = ? AND slots_left >= ?',
        [b.travelers, b.package_date_id, b.travelers]);
      return upd.affectedRows === 1;
    }
    case 'FLIGHT': {
      const [[f]] = await conn.query('SELECT seats_per_day FROM flights WHERE id = ?', [b.item_id]);
      return f && inv.take(conn, 'FLIGHT', b.item_id, d, '', f.seats_per_day, b.travelers);
    }
    case 'TRAIN': {
      const [[c]] = await conn.query('SELECT seats_per_day FROM train_classes WHERE train_id = ? AND class_code = ?', [b.item_id, b.sub_key]);
      return c && inv.take(conn, 'TRAIN', b.item_id, d, b.sub_key, c.seats_per_day, b.travelers);
    }
    case 'HOTEL': {
      const [[r]] = await conn.query('SELECT rooms_total FROM hotel_rooms WHERE hotel_id = ? AND room_code = ?', [b.item_id, b.sub_key]);
      return r && inv.takeNights(conn, b.item_id, d, inv.ymd(b.end_date), b.sub_key, r.rooms_total, b.travelers);
    }
  }
  return false;
}
async function releaseSeats(conn, b) {
  const d = b.travel_date ? inv.ymd(b.travel_date) : null;
  switch (b.type) {
    case 'PACKAGE': return conn.query('UPDATE package_dates SET slots_left = LEAST(slots_left + ?, total_slots) WHERE id = ?', [b.travelers, b.package_date_id]);
    case 'FLIGHT':  return inv.release(conn, 'FLIGHT', b.item_id, d, '', b.travelers);
    case 'TRAIN':   return inv.release(conn, 'TRAIN', b.item_id, d, b.sub_key, b.travelers);
    case 'HOTEL':   return inv.releaseNights(conn, b.item_id, d, inv.ymd(b.end_date), b.sub_key, b.travelers);
  }
}

// Fire-and-forget: the booking is already committed; a mail failure must never undo it.
async function sendConfirmationMail(b) {
  const [[u]] = await pool.query('SELECT email, name FROM users WHERE id = ?', [b.user_id]);
  if (!u) return;
  const details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});
  let title = b.title, destination = details.to_city || details.city || '';
  if (b.type === 'PACKAGE') {
    const [[p]] = await pool.query('SELECT title, destination, price FROM packages WHERE id = ?', [b.package_id]);
    if (p) { title = p.title; destination = p.destination; details.unit_price = Number(p.price); }
  }
  const base = Number(details.unit_price || 0) * b.travelers * (details.nights || 1);
  await mailer.bookingConfirmed({
    to: u.email, name: u.name,
    booking: {
      ref: b.booking_ref, type: b.type, title, destination, startDate: b.travel_date, endDate: b.end_date,
      travelers: b.travelers, unitLabel: b.type === 'HOTEL' ? 'Rooms' : 'Travellers',
      amount: b.amount, coupon: b.coupon_code, discount: Math.max(0, base - Number(b.amount)), details, names: namesOf(details),
    },
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

// ---------- My Bookings (all verticals) ----------
router.get('/my-bookings', requireLogin, async (req, res, next) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.*, p.slug AS package_slug, p.image_url AS package_image, p.destination AS package_destination,
             h.slug AS hotel_slug, h.image_url AS hotel_image,
             (SELECT COUNT(*) FROM reviews r WHERE r.user_id = b.user_id AND r.package_id = b.package_id) AS has_review
      FROM bookings b
      LEFT JOIN packages p ON p.id = b.package_id
      LEFT JOIN hotels h ON b.type = 'HOTEL' AND h.id = b.item_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [req.session.user.id]);
    for (const b of bookings) b.details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});
    res.render('my-bookings', { bookings, confirmedRef: req.query.confirmed || null });
  } catch (err) { next(err); }
});

// ---------- Cancel (restores seats; fake "refund initiated" for demo) ----------
router.post('/bookings/:id/cancel', requireLogin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[b]] = await conn.query('SELECT * FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.session.user.id]);
    if (b && (b.status === 'PENDING' || b.status === 'CONFIRMED')) {
      if (b.status === 'CONFIRMED') await releaseSeats(conn, b);
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
module.exports.helpers = { makeRef, validateCoupon, activeCoupons, priceWithCoupon, createOrder, renderPay, fmtDate };
