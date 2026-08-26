-- Musafir Tourism: database schema
-- Run via: npm run db:init  (or paste into MySQL Workbench)

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cognito_sub VARCHAR(64) UNIQUE,          -- filled when auth is swapped to Cognito at deploy time
  password_hash VARCHAR(100),              -- local auth (Phase 3); NULL once Cognito takes over
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  role ENUM('USER','ADMIN') DEFAULT 'USER',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE, -- set TRUE via the ZeptoMail verification link
  verify_token VARCHAR(64) UNIQUE,
  verify_expires DATETIME,
  reset_token VARCHAR(64) UNIQUE,
  reset_expires DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  destination VARCHAR(100) NOT NULL,       -- e.g. "Manali"
  state VARCHAR(60) NOT NULL,              -- e.g. "Himachal Pradesh"
  category ENUM('BEACH','HILLS','HERITAGE','WILDLIFE','SPIRITUAL') NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,            -- per person, INR
  duration_days INT NOT NULL,
  image_url VARCHAR(500),                  -- Phase 4: becomes S3/CloudFront URL
  lat DECIMAL(9,5),                        -- for weather widget + maps
  lon DECIMAL(9,5),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS package_itinerary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  day_number INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  details TEXT,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_pkg_day (package_id, day_number)
);

CREATE TABLE IF NOT EXISTS package_dates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  start_date DATE NOT NULL,
  total_slots INT NOT NULL DEFAULT 20,
  slots_left INT NOT NULL DEFAULT 20,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_pkg_date (package_id, start_date)
);

CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  discount_pct INT NOT NULL,               -- e.g. 10 = 10% off
  max_discount DECIMAL(10,2) DEFAULT NULL, -- cap in INR, NULL = no cap
  is_active BOOLEAN DEFAULT TRUE,
  expires_at DATE
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_ref VARCHAR(20) NOT NULL UNIQUE, -- e.g. MSFR-8F3K2A shown to user
  user_id INT NOT NULL,
  package_id INT NOT NULL,
  package_date_id INT NOT NULL,
  travelers INT NOT NULL DEFAULT 1,
  amount DECIMAL(10,2) NOT NULL,           -- final amount after coupon
  coupon_code VARCHAR(30),
  status ENUM('PENDING','CONFIRMED','COMPLETED','CANCELLED') DEFAULT 'PENDING',
  razorpay_order_id VARCHAR(64),
  razorpay_payment_id VARCHAR(64),
  invoice_url VARCHAR(500),                -- Phase 4: S3 link to Lambda-generated PDF
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (package_id) REFERENCES packages(id),
  FOREIGN KEY (package_date_id) REFERENCES package_dates(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  package_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_pkg (user_id, package_id)   -- one review per user per package
);
