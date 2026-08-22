const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

const CATEGORIES = ['BEACH', 'HILLS', 'HERITAGE', 'WILDLIFE', 'SPIRITUAL'];

// ---------- Home ----------
router.get('/', async (req, res, next) => {
  try {
    const [featured] = await pool.query(`
      SELECT p.*, ROUND(AVG(r.rating),1) AS avg_rating, COUNT(r.id) AS review_count
      FROM packages p
      LEFT JOIN reviews r ON r.package_id = p.id
      WHERE p.is_active = TRUE
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 3
    `);
    res.render('home', { featured, categories: CATEGORIES });
  } catch (err) { next(err); }
});

// ---------- Packages listing with search + filters ----------
router.get('/packages', async (req, res, next) => {
  try {
    const { q, category, maxPrice, maxDays, sort } = req.query;
    const where = ['p.is_active = TRUE'];
    const params = [];

    if (q) { where.push('(p.title LIKE ? OR p.destination LIKE ? OR p.state LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (category && CATEGORIES.includes(category)) { where.push('p.category = ?'); params.push(category); }
    if (maxPrice) { where.push('p.price <= ?'); params.push(Number(maxPrice)); }
    if (maxDays) { where.push('p.duration_days <= ?'); params.push(Number(maxDays)); }

    const orderBy = { price_asc: 'p.price ASC', price_desc: 'p.price DESC', rating: 'avg_rating DESC' }[sort] || 'p.created_at DESC';

    const [packages] = await pool.query(`
      SELECT p.*, ROUND(AVG(r.rating),1) AS avg_rating, COUNT(DISTINCT r.id) AS review_count,
             MIN(d.slots_left) AS min_slots
      FROM packages p
      LEFT JOIN reviews r ON r.package_id = p.id
      LEFT JOIN package_dates d ON d.package_id = p.id AND d.start_date >= CURDATE() AND d.slots_left > 0
      WHERE ${where.join(' AND ')}
      GROUP BY p.id
      ORDER BY ${orderBy}
    `, params);

    res.render('packages', { packages, categories: CATEGORIES, filters: { q: q || '', category: category || '', maxPrice: maxPrice || '', maxDays: maxDays || '', sort: sort || '' } });
  } catch (err) { next(err); }
});

// ---------- Package detail ----------
router.get('/packages/:slug', async (req, res, next) => {
  try {
    const [[pkg]] = await pool.query('SELECT * FROM packages WHERE slug = ? AND is_active = TRUE', [req.params.slug]);
    if (!pkg) return res.status(404).render('error', { code: 404, message: 'Package not found.' });

    const [itinerary] = await pool.query('SELECT * FROM package_itinerary WHERE package_id = ? ORDER BY day_number', [pkg.id]);
    const [dates] = await pool.query('SELECT * FROM package_dates WHERE package_id = ? AND start_date >= CURDATE() ORDER BY start_date', [pkg.id]);
    const [reviews] = await pool.query(`
      SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.package_id = ? ORDER BY r.created_at DESC LIMIT 10
    `, [pkg.id]);
    const [[stats]] = await pool.query('SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE package_id = ?', [pkg.id]);

    res.render('package-detail', { pkg, itinerary, dates, reviews, stats });
  } catch (err) { next(err); }
});

module.exports = router;
