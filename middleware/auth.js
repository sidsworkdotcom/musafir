// Auth boundary for the whole app.
// Today: session-based (bcrypt + ZeptoMail email verification, MySQL). At AWS deploy time this ONE file
// (plus routes/auth.js) is what changes to verify Cognito JWTs instead.
// Nothing else in the codebase knows how auth works - it just reads req.session.user.

function attachUser(req, res, next) {
  res.locals.user = req.session.user || null; // available in every EJS view
  res.locals.flash = req.session.flash || null; // one-shot banner, e.g. "Email verified"
  delete req.session.flash;
  next();
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.returnTo = req.originalUrl; // come back here after login
  req.session.flash = { type: 'info', text: 'Log in to continue with your booking.' };
  res.redirect('/login');
}

module.exports = { attachUser, requireLogin };
