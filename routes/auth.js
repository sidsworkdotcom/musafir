const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const mailer = require('../mail/mailer');
const router = express.Router();

const token = () => crypto.randomBytes(24).toString('hex');
const hours = h => new Date(Date.now() + h * 3600 * 1000);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WELCOME_COUPON = 'WELCOME10';

function login(req, user) {
  req.session.user = { id: user.id, name: user.name, email: user.email };
}
function finishLogin(req, res) {
  const dest = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(dest);
}

// ---------- Sign up → verification email ----------
router.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/signup', { error: null, form: {} });
});

router.post('/signup', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const form = { name, email };

    if (name.length < 2) return res.render('auth/signup', { error: 'Please enter your name.', form });
    if (!EMAIL_RE.test(email)) return res.render('auth/signup', { error: 'That email doesn\'t look right.', form });
    if (password.length < 8) return res.render('auth/signup', { error: 'Password needs at least 8 characters.', form });

    const [[existing]] = await pool.query('SELECT id, is_verified FROM users WHERE email = ?', [email]);
    if (existing && existing.is_verified) {
      return res.render('auth/signup', { error: 'An account with this email already exists. Try logging in.', form });
    }

    const hash = await bcrypt.hash(password, 10);
    const t = token();
    if (existing) {
      // Unverified leftover from an earlier attempt: refresh it instead of erroring.
      await pool.query('UPDATE users SET name = ?, password_hash = ?, verify_token = ?, verify_expires = ? WHERE id = ?',
        [name, hash, t, hours(24), existing.id]);
    } else {
      await pool.query('INSERT INTO users (name, email, password_hash, verify_token, verify_expires) VALUES (?,?,?,?,?)',
        [name, email, hash, t, hours(24)]);
    }

    await mailer.verifyEmail({ to: email, name, token: t });
    res.render('auth/check-email', { email, mode: 'verify', devMail: !mailer.enabled });
  } catch (err) { next(err); }
});

// ---------- Verify link ----------
router.get('/verify/:token', async (req, res, next) => {
  try {
    const [[user]] = await pool.query('SELECT * FROM users WHERE verify_token = ?', [req.params.token]);
    if (!user) return res.status(400).render('auth/status', { ok: false, title: 'This link isn\'t valid', message: 'It may have already been used. Try logging in, or sign up again.', resendEmail: null, forgot: false });
    if (new Date(user.verify_expires) < new Date()) {
      return res.status(400).render('auth/status', { ok: false, title: 'This link has expired', message: 'Verification links last 24 hours. Send yourself a fresh one:', resendEmail: user.email, forgot: false });
    }
    await pool.query('UPDATE users SET is_verified = TRUE, verify_token = NULL, verify_expires = NULL WHERE id = ?', [user.id]);
    mailer.welcome({ to: user.email, name: user.name, coupon: WELCOME_COUPON }).catch(e => console.error('welcome mail failed:', e.message));
    login(req, user);
    req.session.flash = { type: 'ok', text: `Email verified. Welcome aboard, ${user.name.split(' ')[0]} — ${WELCOME_COUPON} is waiting in your inbox.` };
    finishLogin(req, res);
  } catch (err) { next(err); }
});

// ---------- Resend verification ----------
router.post('/resend-verification', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ? AND is_verified = FALSE', [email]);
    if (user) {
      const t = token();
      await pool.query('UPDATE users SET verify_token = ?, verify_expires = ? WHERE id = ?', [t, hours(24), user.id]);
      await mailer.verifyEmail({ to: email, name: user.name, token: t });
    }
    // Same response either way so the form can't be used to probe which emails exist.
    res.render('auth/check-email', { email, mode: 'verify', devMail: !mailer.enabled });
  } catch (err) { next(err); }
});

// ---------- Log in ----------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { error: null, form: {}, unverified: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const ok = user && user.password_hash && await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.render('auth/login', { error: 'Wrong email or password.', form: { email }, unverified: null });
    if (!user.is_verified) {
      return res.render('auth/login', { error: 'Confirm your email first — check your inbox for the link.', form: { email }, unverified: email });
    }
    login(req, user);
    finishLogin(req, res);
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Forgot / reset password ----------
router.get('/forgot', (req, res) => res.render('auth/forgot', { error: null }));

router.post('/forgot', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.render('auth/forgot', { error: 'That email doesn\'t look right.' });
    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ? AND password_hash IS NOT NULL', [email]);
    if (user) {
      const t = token();
      await pool.query('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [t, hours(1), user.id]);
      await mailer.resetPassword({ to: email, name: user.name, token: t });
    }
    res.render('auth/check-email', { email, mode: 'reset', devMail: !mailer.enabled });
  } catch (err) { next(err); }
});

async function validResetUser(t) {
  const [[user]] = await pool.query('SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()', [t]);
  return user || null;
}
const badReset = res => res.status(400).render('auth/status', { ok: false, title: 'This reset link isn\'t valid', message: 'Reset links last 1 hour and work once. Request a new one:', resendEmail: null, forgot: true });

router.get('/reset/:token', async (req, res, next) => {
  try {
    const user = await validResetUser(req.params.token);
    if (!user) return badReset(res);
    res.render('auth/reset', { token: req.params.token, error: null });
  } catch (err) { next(err); }
});

router.post('/reset/:token', async (req, res, next) => {
  try {
    const user = await validResetUser(req.params.token);
    if (!user) return badReset(res);
    const password = req.body.password || '';
    if (password.length < 8) return res.render('auth/reset', { token: req.params.token, error: 'Password needs at least 8 characters.' });
    if (password !== req.body.confirm) return res.render('auth/reset', { token: req.params.token, error: 'Passwords don\'t match.' });
    const hash = await bcrypt.hash(password, 10);
    // Clicking a reset link proves inbox ownership, so it also verifies the account.
    await pool.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, is_verified = TRUE WHERE id = ?', [hash, user.id]);
    login(req, user);
    req.session.flash = { type: 'ok', text: 'Password updated. You\'re logged in.' };
    res.redirect('/');
  } catch (err) { next(err); }
});

module.exports = router;
