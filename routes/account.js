// My account: profile, password, booking summary.
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

async function loadAccount(userId) {
  const [[u]] = await pool.query('SELECT id, name, email, created_at FROM users WHERE id = ?', [userId]);
  const [[stats]] = await pool.query(`
    SELECT COUNT(*) AS total,
           SUM(status = 'CONFIRMED') AS upcoming,
           SUM(status = 'CANCELLED') AS cancelled,
           COALESCE(SUM(CASE WHEN status IN ('CONFIRMED','COMPLETED') THEN amount END), 0) AS spent
    FROM bookings WHERE user_id = ?`, [userId]);
  const [recent] = await pool.query('SELECT booking_ref, type, title, travel_date, status, amount FROM bookings WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]);
  return { u, stats, recent };
}

router.get('/account', requireLogin, async (req, res, next) => {
  try {
    const data = await loadAccount(req.session.user.id);
    res.render('account', { ...data, profileError: null, pwError: null });
  } catch (err) { next(err); }
});

router.post('/account/profile', requireLogin, async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (name.length < 2) {
      const data = await loadAccount(req.session.user.id);
      return res.render('account', { ...data, profileError: 'Please enter your name.', pwError: null });
    }
    await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, req.session.user.id]);
    req.session.user.name = name;
    req.session.flash = { type: 'ok', text: 'Profile updated.' };
    res.redirect('/account');
  } catch (err) { next(err); }
});

router.post('/account/password', requireLogin, async (req, res, next) => {
  try {
    const { current, password, confirm } = req.body;
    const [[u]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);
    const fail = async msg => { const data = await loadAccount(req.session.user.id); res.render('account', { ...data, profileError: null, pwError: msg }); };
    if (!u || !u.password_hash || !(await bcrypt.compare(current || '', u.password_hash))) return fail('Current password is wrong.');
    if ((password || '').length < 8) return fail('New password needs at least 8 characters.');
    if (password !== confirm) return fail('New passwords don\'t match.');
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), req.session.user.id]);
    req.session.flash = { type: 'ok', text: 'Password changed.' };
    res.redirect('/account');
  } catch (err) { next(err); }
});

module.exports = router;
