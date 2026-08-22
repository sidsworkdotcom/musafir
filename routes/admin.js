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

module.exports = router;
