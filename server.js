require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const siteRoutes = require('./routes/site');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));

app.use('/', siteRoutes);
app.use('/admin', adminRoutes);

// 404
app.use((req, res) => res.status(404).render('error', { code: 404, message: 'This trail doesn\'t exist. Head back to the packages page.' }));

// 500 - friendly message if e.g. DB is down
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { code: 500, message: 'Something broke on our side. Check the server logs (is MySQL running?).' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Musafir running → http://localhost:${PORT}`));
