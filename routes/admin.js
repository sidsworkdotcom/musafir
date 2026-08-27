const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// ---------- Simple session login (Phase 1). Users get Cognito in Phase 3;
// the admin panel can stay on this or move to a Cognito admin group later. ----------
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

router.get('/login', (req, res) => res.render('admin/login', { error: null }));

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Wrong username or password.' });
});

router.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

// ---------- Dashboard: list all packages ----------
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const [packages] = await pool.query(`
      SELECT p.*, COUNT(DISTINCT d.id) AS date_count, COUNT(DISTINCT b.id) AS booking_count
      FROM packages p
      LEFT JOIN package_dates d ON d.package_id = p.id
      LEFT JOIN bookings b ON b.package_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC
    `);
    res.render('admin/dashboard', { packages });
  } catch (err) { next(err); }
});

// ---------- Create ----------
router.get('/packages/new', requireAdmin, (req, res) => {
  res.render('admin/package-form', { pkg: null, itineraryText: '', datesText: '', error: null });
});

// ---------- Edit ----------
router.get('/packages/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const [[pkg]] = await pool.query('SELECT * FROM packages WHERE id = ?', [req.params.id]);
    if (!pkg) return res.redirect('/admin');
    const [itinerary] = await pool.query('SELECT * FROM package_itinerary WHERE package_id = ? ORDER BY day_number', [pkg.id]);
    const [dates] = await pool.query('SELECT * FROM package_dates WHERE package_id = ? ORDER BY start_date', [pkg.id]);
    const itineraryText = itinerary.map(i => `${i.title} | ${i.details || ''}`).join('\n');
    const datesText = dates.map(d => `${d.start_date.toISOString().slice(0, 10)} | ${d.total_slots}`).join('\n');
    res.render('admin/package-form', { pkg, itineraryText, datesText, error: null });
  } catch (err) { next(err); }
});

// ---------- Save (create or update) ----------
router.post('/packages/save', requireAdmin, async (req, res, next) => {
  const { id, title, destination, state, category, description, price, duration_days, image_url, lat, lon, itineraryText, datesText } = req.body;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let pkgId = id;

    if (id) {
      await conn.query(
        `UPDATE packages SET title=?, slug=?, destination=?, state=?, category=?, description=?, price=?, duration_days=?, image_url=?, lat=?, lon=? WHERE id=?`,
        [title, slug, destination, state, category, description, price, duration_days, image_url || null, lat || null, lon || null, id]
      );
      await conn.query('DELETE FROM package_itinerary WHERE package_id = ?', [id]);
    } else {
      const [r] = await conn.query(
        `INSERT INTO packages (title, slug, destination, state, category, description, price, duration_days, image_url, lat, lon)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [title, slug, destination, state, category, description, price, duration_days, image_url || null, lat || null, lon || null]
      );
      pkgId = r.insertId;
    }

    // Itinerary: one line per day, "Title | details"
    const days = (itineraryText || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < days.length; i++) {
      const [t, d] = days[i].split('|').map(s => (s || '').trim());
      await conn.query('INSERT INTO package_itinerary (package_id, day_number, title, details) VALUES (?,?,?,?)', [pkgId, i + 1, t || `Day ${i + 1}`, d || null]);
    }

    // Dates: one line per departure, "YYYY-MM-DD | slots". Upsert so existing slots_left survive edits.
    const dateLines = (datesText || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of dateLines) {
      const [date, slots] = line.split('|').map(s => (s || '').trim());
      const total = Number(slots) || 20;
      await conn.query(
        `INSERT INTO package_dates (package_id, start_date, total_slots, slots_left) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE total_slots = VALUES(total_slots)`,
        [pkgId, date, total, total]
      );
    }

    await conn.commit();
    res.redirect('/admin');
  } catch (err) {
    await conn.rollback();
    res.render('admin/package-form', {
      pkg: id ? { ...req.body, id } : null,
      itineraryText: itineraryText || '', datesText: datesText || '',
      error: 'Save failed: ' + err.message,
    });
  } finally { conn.release(); }
});

// ---------- Toggle active / soft delete ----------
router.post('/packages/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('UPDATE packages SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.redirect('/admin');
  } catch (err) { next(err); }
});

// ================= Flights / Trains / Hotels (data-driven CRUD) =================
// Each vertical declares its table, editable fields and an optional child table edited as "one per line".
const TRAVEL = {
  flights: {
    table: 'flights', label: 'Flights', singular: 'Flight',
    fields: [
      ['airline', 'Airline', 'text', 'IndiGo'], ['flight_no', 'Flight no.', 'text', '6E 5301'],
      ['from_code', 'From (IATA)', 'text', 'BOM'], ['from_city', 'From city', 'text', 'Mumbai'],
      ['to_code', 'To (IATA)', 'text', 'GOI'], ['to_city', 'To city', 'text', 'Goa'],
      ['dep_time', 'Departs (HH:MM)', 'time', ''], ['arr_time', 'Arrives (HH:MM)', 'time', ''],
      ['duration_min', 'Duration (min)', 'number', '75'], ['days_of_week', 'Days (1=Mon … 7=Sun)', 'text', '1234567'],
      ['price', 'Fare per pax (₹)', 'number', '3499'], ['seats_per_day', 'Seats per day', 'number', '180'],
    ],
    listCols: [['flight_no', 'Flight'], ['airline', 'Airline'], ['route', 'Route'], ['dep_time', 'Dep'], ['price', '₹'], ['seats_per_day', 'Seats']],
  },
  trains: {
    table: 'trains', label: 'Trains', singular: 'Train',
    fields: [
      ['train_no', 'Train no.', 'text', '12951'], ['name', 'Name', 'text', 'Mumbai Rajdhani'],
      ['from_code', 'From (station)', 'text', 'BCT'], ['from_city', 'From city', 'text', 'Mumbai'],
      ['to_code', 'To (station)', 'text', 'NDLS'], ['to_city', 'To city', 'text', 'Delhi'],
      ['dep_time', 'Departs (HH:MM)', 'time', ''], ['arr_time', 'Arrives (HH:MM)', 'time', ''],
      ['duration_min', 'Duration (min)', 'number', '935'], ['days_of_week', 'Days (1=Mon … 7=Sun)', 'text', '1234567'],
    ],
    child: { table: 'train_classes', fk: 'train_id', label: 'Classes — one per line: CODE | Name | price | seats per day', cols: ['class_code', 'class_name', 'price', 'seats_per_day'], example: '3A | AC 3 Tier | 2100 | 64' },
    listCols: [['train_no', 'No.'], ['name', 'Name'], ['route', 'Route'], ['dep_time', 'Dep'], ['days_of_week', 'Days']],
  },
  hotels: {
    table: 'hotels', label: 'Hotels', singular: 'Hotel',
    fields: [
      ['name', 'Name', 'text', 'Taj Fort Aguada'], ['city', 'City', 'text', 'Goa'], ['area', 'Area', 'text', 'Sinquerim, North Goa'],
      ['stars', 'Stars (1–5)', 'number', '4'], ['image_url', 'Image URL', 'text', 'https://…'],
      ['amenities', 'Amenities (comma separated)', 'text', 'Pool, Breakfast included, Free Wi-Fi'],
      ['description', 'Description', 'textarea', ''],
    ],
    child: { table: 'hotel_rooms', fk: 'hotel_id', label: 'Room types — one per line: CODE | Name | price per night | rooms | max guests', cols: ['room_code', 'room_name', 'price_per_night', 'rooms_total', 'max_guests'], example: 'DLX | Deluxe Room | 7500 | 8 | 3' },
    listCols: [['name', 'Hotel'], ['city', 'City'], ['stars', '★'], ['rooms', 'Room types']],
  },
};

router.get('/:kind(flights|trains|hotels)', requireAdmin, async (req, res, next) => {
  try {
    const cfg = TRAVEL[req.params.kind];
    let rows;
    if (cfg.table === 'hotels') [rows] = await pool.query('SELECT h.*, COUNT(r.id) AS rooms FROM hotels h LEFT JOIN hotel_rooms r ON r.hotel_id = h.id GROUP BY h.id ORDER BY h.city, h.stars DESC');
    else [rows] = await pool.query(`SELECT *, CONCAT(from_code, ' → ', to_code) AS route FROM ${cfg.table} ORDER BY from_code, to_code, dep_time`);
    res.render('admin/travel-list', { kind: req.params.kind, cfg, rows, travel: TRAVEL });
  } catch (err) { next(err); }
});

router.get('/:kind(flights|trains|hotels)/new', requireAdmin, (req, res) => {
  const cfg = TRAVEL[req.params.kind];
  res.render('admin/travel-form', { kind: req.params.kind, cfg, item: null, childText: '', error: null });
});

router.get('/:kind(flights|trains|hotels)/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const cfg = TRAVEL[req.params.kind];
    const [[item]] = await pool.query(`SELECT * FROM ${cfg.table} WHERE id = ?`, [req.params.id]);
    if (!item) return res.redirect('/admin/' + req.params.kind);
    let childText = '';
    if (cfg.child) {
      const [kids] = await pool.query(`SELECT * FROM ${cfg.child.table} WHERE ${cfg.child.fk} = ? ORDER BY id`, [item.id]);
      childText = kids.map(k => cfg.child.cols.map(c => k[c]).join(' | ')).join('\n');
    }
    res.render('admin/travel-form', { kind: req.params.kind, cfg, item, childText, error: null });
  } catch (err) { next(err); }
});

router.post('/:kind(flights|trains|hotels)/save', requireAdmin, async (req, res, next) => {
  const cfg = TRAVEL[req.params.kind];
  const { id, childText } = req.body;
  const values = cfg.fields.map(([name]) => (req.body[name] === '' ? null : req.body[name]));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let itemId = id;
    const cols = cfg.fields.map(([name]) => name);
    if (cfg.table === 'hotels') { cols.push('slug'); values.push(String(req.body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }
    if (id) {
      await conn.query(`UPDATE ${cfg.table} SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`, [...values, id]);
    } else {
      const [r] = await conn.query(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, values);
      itemId = r.insertId;
    }
    if (cfg.child) {
      // Upsert child rows by code so existing per-date inventory keeps working; remove codes no longer listed.
      const lines = (childText || '').split('\n').map(l => l.trim()).filter(Boolean);
      const keep = [];
      for (const line of lines) {
        const parts = line.split('|').map(x => x.trim());
        if (parts.length < cfg.child.cols.length) continue;
        const code = parts[0].toUpperCase(); keep.push(code); parts[0] = code;
        const set = cfg.child.cols.slice(1).map(c => c + ' = VALUES(' + c + ')').join(', ');
        await conn.query(`INSERT INTO ${cfg.child.table} (${cfg.child.fk}, ${cfg.child.cols.join(', ')}) VALUES (?, ${cfg.child.cols.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${set}`, [itemId, ...parts]);
      }
      if (keep.length) await conn.query(`DELETE FROM ${cfg.child.table} WHERE ${cfg.child.fk} = ? AND ${cfg.child.cols[0]} NOT IN (?)`, [itemId, keep]);
      else await conn.query(`DELETE FROM ${cfg.child.table} WHERE ${cfg.child.fk} = ?`, [itemId]);
    }
    await conn.commit();
    res.redirect('/admin/' + req.params.kind);
  } catch (err) {
    await conn.rollback();
    res.render('admin/travel-form', { kind: req.params.kind, cfg, item: id ? { ...req.body, id } : req.body, childText: childText || '', error: 'Save failed: ' + err.message });
  } finally { conn.release(); }
});

router.post('/:kind(flights|trains|hotels)/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const cfg = TRAVEL[req.params.kind];
    await pool.query(`UPDATE ${cfg.table} SET is_active = NOT is_active WHERE id = ?`, [req.params.id]);
    res.redirect('/admin/' + req.params.kind);
  } catch (err) { next(err); }
});

module.exports = router;
