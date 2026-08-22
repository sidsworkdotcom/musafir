# Musafir — Tourism Booking Platform

TYBCA Cloud Computing project. A dynamic tourism site deployed on AWS.
Live at: `musafir.siddheshgupta.com` (Phase 2 onward)

## What's built so far (Phase 1 ✅)

- Home page with featured packages and ticket-style search
- Packages listing with search + filters (destination, category, budget, duration) and sorting
- Package detail page: day-by-day itinerary, upcoming departures with live slot counts ("Only 3 left!"), reviews
- Admin panel (session login): create/edit/hide packages, itineraries, and departure dates
- MySQL schema for the entire project (users, packages, itineraries, dates, bookings, reviews, coupons) — later phases only add code, not tables

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

## Roadmap (matches the project phases)

| Phase | What | AWS services |
|-------|------|--------------|
| 1 ✅ | Dynamic site + admin CRUD (this repo) | — |
| 2 | Deploy: EC2 + nginx, DB → RDS, domain + HTTPS | EC2, RDS, Route 53 |
| 3 | User auth, booking flow, Razorpay test checkout, coupons | Cognito |
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
db/schema.sql        → all 7 tables (full project schema)
db/seed.sql          → 6 demo packages, dates, coupons, reviews
db/init.js           → one-command DB setup
db/pool.js           → shared connection pool (swap .env for RDS, zero code change)
views/               → EJS templates
public/css/style.css → design system (boarding-pass theme)
```
