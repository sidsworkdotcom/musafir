# Musafir — Tourism Booking Platform

TYBCA Cloud Computing project. A dynamic tourism site deployed on AWS.
Live at: `https://musafir.siddheshgupta.com` (Phase 2 onward)

## What's built so far (Phases 1 + 3 ✅)

- Home page with featured packages and ticket-style search
- Packages listing with search + filters (destination, category, budget, duration) and sorting
- Package detail page: day-by-day itinerary, upcoming departures with live slot counts ("Only 3 left!"), reviews
- Admin panel (session login): create/edit/hide packages, itineraries, and departure dates
- MySQL schema for the entire project (users, packages, itineraries, dates, bookings, reviews, coupons)
- User accounts: signup/login (bcrypt sessions, structured to swap to Cognito at deploy time)
- Full booking flow: pick departure date + travellers → coupon validation → payment → confirmed booking with MSFR-XXXXXX reference
- Razorpay test-mode checkout (auto-enables when keys are in `.env`; otherwise a clearly-labelled simulate-payment mode so the flow works with zero external accounts)
- Atomic slot management: conditional decrement inside a transaction prevents overbooking races; cancellation restores slots
- My Bookings dashboard with status lifecycle (PENDING → CONFIRMED → CANCELLED) and one-click cancel
- Reviews gated to verified bookings only

## Tech

Node.js + Express + EJS + MySQL (mysql2). No frontend framework — fast to deploy, easy to explain in viva.

## Run locally

```bash
# 1. Prerequisites: Node 18+, MySQL/MariaDB running locally
# 2. Create a MySQL user (or use root):
#    CREATE USER 'musafir'@'localhost' IDENTIFIED BY 'musafirpass';
#    GRANT ALL PRIVILEGES ON *.* TO 'musafir'@'localhost';

cp .env.example .env        # then edit if your DB credentials differ
npm install
npm run db:init             # creates DB, tables, and seed data (6 packages)
npm run dev                 # http://localhost:3000
```

Admin panel: `http://localhost:3000/admin` → username `admin`, password `admin123` (change in `.env`).
Demo traveller: `aarav@example.com` / `demo1234` (pre-verified).

### Email (ZeptoMail SMTP)
Fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` (`emailapikey`), `SMTP_PASS` and `MAIL_FROM` in `.env`. With them blank the app runs in **dev mode**: every email is printed to the server console with its action link, so signup/verify/reset are fully testable offline. Set `APP_URL` to the public URL so links in emails resolve. Moving to Amazon SES later is a `.env`-only change (SES SMTP host + credentials).

### Already have a database from an earlier phase?
`npm run db:migrate` — adds the new `users` columns in place. No need to drop anything.
Demo traveller login: `aarav@example.com` / `demo1234`.

### Razorpay test mode (optional but recommended)
1. Create a free account at razorpay.com → switch to **Test Mode**
2. Settings → API Keys → Generate test key
3. Put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`, restart
4. Checkout now opens the real Razorpay popup — pay with test card `4111 1111 1111 1111`, any future expiry, any CVV
Without keys, the app runs in simulate-payment mode so everything still works.

## Roadmap (matches the project phases)

| Phase | What | AWS services |
|-------|------|--------------|
| 1 ✅ | Dynamic site + admin CRUD (this repo) | — |
| 2 | Deploy: EC2 + nginx, DB → RDS, domain + HTTPS | EC2, RDS, Route 53 |
| 3 ✅ | User auth, booking flow, Razorpay test checkout, coupons | (local; Cognito swap at deploy) |
| 4 | Image uploads, emails, PDF invoices, weather | S3, CloudFront, SES, Lambda |
| 5 | Polish, monitoring, report | CloudWatch |

## Phase 2 deploy cheat-sheet (EC2)

```bash
# On a fresh Ubuntu t3.micro:
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
git clone <your-repo> && cd musafir && npm install
cp .env.example .env   # point DB_HOST at your RDS endpoint
npm run db:init
sudo npm install -g pm2 && pm2 start server.js --name musafir && pm2 startup && pm2 save
# nginx reverse proxy 80 → 3000, then certbot for HTTPS
# In .env on the server: NODE_ENV=production  APP_URL=https://musafir.siddheshgupta.com  (enables secure cookies behind nginx)
```

Security notes:
- `.env` is git-ignored. Never commit it.
- RDS security group: allow port 3306 **only from the EC2 security group**, never 0.0.0.0/0.
- Set a CloudWatch billing alarm before anything else.

## Project structure

```
server.js            → Express app entry
routes/site.js       → public pages (home, listing, detail)
routes/admin.js      → admin login + package CRUD
routes/auth.js       → signup / verify / login / forgot / reset
routes/booking.js    → generic confirm/cancel/e-ticket for all verticals + package checkout
routes/travel.js     → flights / trains / hotels search, review, checkout
lib/inventory.js     → per-date availability engine (lazy rows, atomic take/release, multi-night)
db/seed-travel.sql   → 31 flights, 18 trains + classes, 18 hotels + room types
middleware/auth.js   → session boundary (swap for Cognito here)
mail/mailer.js       → ZeptoMail SMTP transport + email templates
db/migrate.js        → idempotent ALTER TABLE migrations
public/js/site.js    → popup, coupon copy, live fare preview
db/schema.sql        → all 7 tables (full project schema)
db/seed.sql          → 6 demo packages, dates, coupons, reviews
db/init.js           → one-command DB setup
db/pool.js           → shared connection pool (swap .env for RDS, zero code change)
views/               → EJS templates
public/css/style.css → design system (boarding-pass theme)
```
