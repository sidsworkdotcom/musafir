// Flights · Trains · Hotels — search, review and checkout.
// Inventory is self-managed (MySQL, editable in /admin); availability per date lives in `inventory`.
const express = require('express');
const pool = require('../db/pool');
const inv = require('../lib/inventory');
const { parsePassengers, parseRooms } = require('../lib/passengers');
const { requireLogin } = require('../middleware/auth');
const { makeRef, validateCoupon, activeCoupons, priceWithCoupon, createOrder, renderPay, fmtDate } = require('./booking').helpers;
const router = express.Router();

const today = () => new Date().toISOString().slice(0, 10);
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s));
const clampInt = (v, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number(v) || dflt));
const hhmm = t => String(t).slice(0, 5);
const durText = m => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
// Arrival on a later day? (train/overnight flight)
const dayOffset = (dep, arr, dur) => Math.floor((toMin(dep) + dur) / 1440);
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

// City lists for the search dropdowns (derived from inventory, so admin additions appear automatically).
async function cityOptions() {
  const [f] = await pool.query('SELECT DISTINCT from_code AS code, from_city AS city FROM flights WHERE is_active = TRUE UNION SELECT DISTINCT to_code, to_city FROM flights WHERE is_active = TRUE ORDER BY city');
  const [t] = await pool.query('SELECT DISTINCT from_code AS code, from_city AS city FROM trains WHERE is_active = TRUE UNION SELECT DISTINCT to_code, to_city FROM trains WHERE is_active = TRUE ORDER BY city');
  const [h] = await pool.query('SELECT DISTINCT city FROM hotels WHERE is_active = TRUE ORDER BY city');
  return { flightCities: f, trainCities: t, hotelCities: h.map(r => r.city) };
}
router.cityOptions = cityOptions;

// ============ FLIGHTS ============
router.get('/flights', async (req, res, next) => {
  try {
    const q = {
      from: (req.query.from || '').toUpperCase(), to: (req.query.to || '').toUpperCase(),
      date: validDate(req.query.date) && req.query.date >= today() ? req.query.date : today(),
      pax: clampInt(req.query.pax, 1, 9, 1), sort: req.query.sort || 'price',
    };
    const cities = await cityOptions();
    let results = [];
    if (q.from && q.to) {
      const order = q.sort === 'dep' ? 'dep_time' : q.sort === 'dur' ? 'duration_min' : 'price';
      const [rows] = await pool.query(`SELECT * FROM flights WHERE from_code = ? AND to_code = ? AND is_active = TRUE ORDER BY ${order}`, [q.from, q.to]);
      for (const f of rows) {
        if (!inv.operatesOn(f.days_of_week, q.date)) continue;
        f.left = await inv.left('FLIGHT', f.id, q.date, '', f.seats_per_day);
        f.dep = hhmm(f.dep_time); f.arr = hhmm(f.arr_time); f.dur = durText(f.duration_min); f.plus = dayOffset(f.dep, f.arr, f.duration_min);
        results.push(f);
      }
    }
    res.render('travel/flights', { q, results, ...cities, fmtDate });
  } catch (err) { next(err); }
});

// ============ TRAINS ============
router.get('/trains', async (req, res, next) => {
  try {
    const q = {
      from: (req.query.from || '').toUpperCase(), to: (req.query.to || '').toUpperCase(),
      date: validDate(req.query.date) && req.query.date >= today() ? req.query.date : today(),
      pax: clampInt(req.query.pax, 1, 6, 1),
    };
    const cities = await cityOptions();
    let results = [];
    if (q.from && q.to) {
      const [rows] = await pool.query('SELECT * FROM trains WHERE from_code = ? AND to_code = ? AND is_active = TRUE ORDER BY dep_time', [q.from, q.to]);
      for (const t of rows) {
        if (!inv.operatesOn(t.days_of_week, q.date)) continue;
        const [classes] = await pool.query('SELECT * FROM train_classes WHERE train_id = ? ORDER BY price', [t.id]);
        for (const c of classes) c.left = await inv.left('TRAIN', t.id, q.date, c.class_code, c.seats_per_day);
        t.classes = classes;
        t.dep = hhmm(t.dep_time); t.arr = hhmm(t.arr_time); t.dur = durText(t.duration_min); t.plus = dayOffset(t.dep, t.arr, t.duration_min);
        results.push(t);
      }
    }
    res.render('travel/trains', { q, results, ...cities, fmtDate });
  } catch (err) { next(err); }
});

// ============ HOTELS ============
router.get('/hotels', async (req, res, next) => {
  try {
    const checkin = validDate(req.query.checkin) && req.query.checkin >= today() ? req.query.checkin : today();
    let checkout = validDate(req.query.checkout) && req.query.checkout > checkin ? req.query.checkout : inv.addDays(checkin, 1);
    const q = {
      city: (req.query.city || '').trim(), checkin, checkout, nights: inv.daysBetween(checkin, checkout),
      rooms: clampInt(req.query.rooms, 1, 5, 1), guests: clampInt(req.query.guests, 1, 10, 2),
      stars: clampInt(req.query.stars, 0, 5, 0), sort: req.query.sort || 'price',
    };
    const cities = await cityOptions();
    let results = [];
    if (q.city) {
      const [rows] = await pool.query('SELECT * FROM hotels WHERE city = ? AND is_active = TRUE AND stars >= ?', [q.city, q.stars]);
      for (const h of rows) {
        const [rooms] = await pool.query('SELECT * FROM hotel_rooms WHERE hotel_id = ? ORDER BY price_per_night', [h.id]);
        for (const r of rooms) r.left = await inv.leftNights(h.id, checkin, checkout, r.room_code, r.rooms_total);
        h.rooms = rooms;
        h.from_price = rooms.length ? Number(rooms[0].price_per_night) : null;
        h.amenity_list = (h.amenities || '').split(',').map(s => s.trim()).filter(Boolean);
        results.push(h);
      }
      results.sort((a, b) => q.sort === 'stars' ? b.stars - a.stars : (a.from_price || 1e9) - (b.from_price || 1e9));
    }
    res.render('travel/hotels', { q, results, ...cities, fmtDate });
  } catch (err) { next(err); }
});

router.get('/hotels/:slug', async (req, res, next) => {
  try {
    const [[h]] = await pool.query('SELECT * FROM hotels WHERE slug = ? AND is_active = TRUE', [req.params.slug]);
    if (!h) return res.status(404).render('error', { code: 404, message: 'Hotel not found.' });
    const checkin = validDate(req.query.checkin) && req.query.checkin >= today() ? req.query.checkin : today();
    const checkout = validDate(req.query.checkout) && req.query.checkout > checkin ? req.query.checkout : inv.addDays(checkin, 1);
    const [rooms] = await pool.query('SELECT * FROM hotel_rooms WHERE hotel_id = ? ORDER BY price_per_night', [h.id]);
    for (const r of rooms) r.left = await inv.leftNights(h.id, checkin, checkout, r.room_code, r.rooms_total);
    h.amenity_list = (h.amenities || '').split(',').map(s => s.trim()).filter(Boolean);
    res.render('travel/hotel-detail', { h, rooms, q: { checkin, checkout, nights: inv.daysBetween(checkin, checkout), rooms: clampInt(req.query.rooms, 1, 5, 1) }, fmtDate });
  } catch (err) { next(err); }
});

// ============ REVIEW + CHECKOUT (shared) ============
// Builds a normalised "offer" for the review page from the vertical + ids in the query.
async function loadOffer(p) {
  const type = (p.type || '').toUpperCase();
  const id = Number(p.id);
  const date = validDate(p.date) && p.date >= today() ? p.date : null;
  if (!type || !id || !date) return null;

  if (type === 'FLIGHT') {
    const [[f]] = await pool.query('SELECT * FROM flights WHERE id = ? AND is_active = TRUE', [id]);
    if (!f || !inv.operatesOn(f.days_of_week, date)) return null;
    const left = await inv.left('FLIGHT', f.id, date, '', f.seats_per_day);
    return {
      type, id, date, subKey: '', left, maxQty: 9, unitLabel: 'Passengers', unitPrice: Number(f.price), nights: 1,
      title: `${f.airline} ${f.flight_no} · ${f.from_code} → ${f.to_code}`,
      subtitle: `${f.from_city} ${hhmm(f.dep_time)} → ${f.to_city} ${hhmm(f.arr_time)} · ${durText(f.duration_min)} · non-stop`,
      details: { from_code: f.from_code, from_city: f.from_city, to_code: f.to_code, to_city: f.to_city, dep: hhmm(f.dep_time), arr: hhmm(f.arr_time), airline: f.airline, flight_no: f.flight_no },
      backUrl: `/flights?from=${f.from_code}&to=${f.to_code}&date=${date}`,
    };
  }
  if (type === 'TRAIN') {
    const [[t]] = await pool.query('SELECT * FROM trains WHERE id = ? AND is_active = TRUE', [id]);
    const [[c]] = await pool.query('SELECT * FROM train_classes WHERE train_id = ? AND class_code = ?', [id, (p.cls || '').toUpperCase()]);
    if (!t || !c || !inv.operatesOn(t.days_of_week, date)) return null;
    const left = await inv.left('TRAIN', t.id, date, c.class_code, c.seats_per_day);
    return {
      type, id, date, subKey: c.class_code, left, maxQty: 6, unitLabel: 'Passengers', unitPrice: Number(c.price), nights: 1,
      title: `${t.train_no} ${t.name} · ${c.class_name}`,
      subtitle: `${t.from_city} (${t.from_code}) ${hhmm(t.dep_time)} → ${t.to_city} (${t.to_code}) ${hhmm(t.arr_time)}${dayOffset(hhmm(t.dep_time), hhmm(t.arr_time), t.duration_min) ? ' +1' : ''} · ${durText(t.duration_min)}`,
      details: { from_code: t.from_code, from_city: t.from_city, to_code: t.to_code, to_city: t.to_city, dep: hhmm(t.dep_time), arr: hhmm(t.arr_time), train_no: t.train_no, train_name: t.name, class_name: c.class_name },
      backUrl: `/trains?from=${t.from_code}&to=${t.to_code}&date=${date}`,
    };
  }
  if (type === 'HOTEL') {
    const checkout = validDate(p.checkout) && p.checkout > date ? p.checkout : inv.addDays(date, 1);
    const nights = inv.daysBetween(date, checkout);
    const [[h]] = await pool.query('SELECT * FROM hotels WHERE id = ? AND is_active = TRUE', [id]);
    const [[r]] = await pool.query('SELECT * FROM hotel_rooms WHERE hotel_id = ? AND room_code = ?', [id, (p.room || '').toUpperCase()]);
    if (!h || !r) return null;
    const left = await inv.leftNights(h.id, date, checkout, r.room_code, r.rooms_total);
    return {
      type, id, date, endDate: checkout, nights, subKey: r.room_code, left, maxQty: 5, unitLabel: 'Rooms', unitPrice: Number(r.price_per_night), maxGuests: r.max_guests,
      title: `${h.name} · ${r.room_name}`,
      subtitle: `${h.area || h.city} · ${fmtDate(date)} → ${fmtDate(checkout)} · ${nights} night${nights === 1 ? '' : 's'} · up to ${r.max_guests} guests/room`,
      details: { city: h.city, area: h.area, hotel: h.name, room: r.room_name, checkin: date, checkout, nights, unit_price: Number(r.price_per_night) },
      backUrl: `/hotels/${h.slug}?checkin=${date}&checkout=${checkout}`,
    };
  }
  return null;
}

router.get('/book-travel', requireLogin, async (req, res, next) => {
  try {
    const offer = await loadOffer(req.query);
    if (!offer) return res.status(404).render('error', { code: 404, message: 'That option is no longer available. Please search again.' });
    const coupons = await activeCoupons();
    res.render('travel/book-travel', { offer, qty: clampInt(req.query.qty, 1, offer.maxQty, 1), coupons, error: null, prefill: '' });
  } catch (err) { next(err); }
});

router.post('/book-travel/checkout', requireLogin, async (req, res, next) => {
  try {
    const offer = await loadOffer(req.body);
    if (!offer) return res.status(404).render('error', { code: 404, message: 'That option is no longer available. Please search again.' });
    const qty = clampInt(req.body.qty, 1, offer.maxQty, 1);
    const coupons = await activeCoupons();
    const fail = msg => res.render('travel/book-travel', { offer, qty, coupons, error: msg, prefill: (req.body.coupon || '').toUpperCase() });
    if (offer.left < qty) return fail(`Only ${offer.left} left for that date - reduce the number or pick another option.`);
    const coupon = await validateCoupon(req.body.coupon);
    if (req.body.coupon && !coupon) return fail('That coupon code is invalid or expired.');

    // Traveller / guest details (validated server-side; the JS rows are just convenience)
    if (offer.type === 'HOTEL') {
      const parsed = parseRooms(req.body, qty, offer.maxGuests);
      if (parsed.error) return fail(parsed.error);
      offer.details.rooms = parsed.rooms; offer.details.special_request = parsed.special_request;
    } else {
      const parsed = parsePassengers(req.body, qty);
      if (parsed.error) return fail(parsed.error);
      offer.details.passengers = parsed.passengers;
    }

    const base = offer.unitPrice * qty * offer.nights;
    const { amount, discount } = priceWithCoupon(base, coupon);
    const ref = makeRef();
    const rzpOrderId = await createOrder(amount, ref);
    offer.details.unit_price = offer.unitPrice; offer.details.nights = offer.nights;

    const [r] = await pool.query(
      `INSERT INTO bookings (booking_ref, user_id, type, item_id, travel_date, end_date, sub_key, title, details, travelers, amount, coupon_code, status, razorpay_order_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING', ?)`,
      [ref, req.session.user.id, offer.type, offer.id, offer.date, offer.endDate || null, offer.subKey, offer.title, JSON.stringify(offer.details),
       qty, amount, coupon ? coupon.code : null, rzpOrderId]);

    renderPay(res, {
      summary: { kind: offer.type, title: offer.title, subtitle: offer.subtitle, dateLabel: fmtDate(offer.date), unitLabel: offer.unitLabel, unitPrice: offer.unitPrice, nights: offer.nights, names: require('../lib/passengers').namesOf(offer.details) },
      travelers: qty, base, discount, amount, couponCode: coupon ? coupon.code : null,
      bookingId: r.insertId, bookingRef: ref, rzpOrderId,
    });
  } catch (err) { next(err); }
});

module.exports = router;
