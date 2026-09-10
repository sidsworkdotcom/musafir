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
  is_active BOOLEAN NOT NULL DEFAULT TRUE,   -- admin soft-deactivate; never hard-DELETE (bookings FK)
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
  type ENUM('PACKAGE','FLIGHT','TRAIN','HOTEL') NOT NULL DEFAULT 'PACKAGE',
  package_id INT NULL,                     -- PACKAGE bookings only
  package_date_id INT NULL,                -- PACKAGE bookings only
  item_id INT NULL,                        -- flights.id / trains.id / hotels.id
  travel_date DATE NULL,                   -- departure / check-in
  end_date DATE NULL,                      -- hotel check-out
  sub_key VARCHAR(20) NULL,                -- train class code / hotel room type code
  title VARCHAR(200) NULL,                 -- snapshot for e-ticket (e.g. "6E 5301 BOM → GOI")
  details JSON NULL,                       -- snapshot: times, from/to, hotel address...
  travelers INT NOT NULL DEFAULT 1,        -- passengers, or rooms for hotels
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

-- ===== Multi-vertical inventory: flights, trains, hotels (self-managed via /admin) =====

CREATE TABLE IF NOT EXISTS flights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  flight_no VARCHAR(10) NOT NULL,          -- 6E 5301
  airline VARCHAR(60) NOT NULL,
  from_code CHAR(3) NOT NULL,              -- IATA
  from_city VARCHAR(60) NOT NULL,
  to_code CHAR(3) NOT NULL,
  to_city VARCHAR(60) NOT NULL,
  dep_time TIME NOT NULL,
  arr_time TIME NOT NULL,
  duration_min INT NOT NULL,
  days_of_week CHAR(7) NOT NULL DEFAULT '1234567',  -- ISO weekdays that operate: 1=Mon … 7=Sun
  price DECIMAL(10,2) NOT NULL,            -- per passenger
  seats_per_day INT NOT NULL DEFAULT 180,
  is_active BOOLEAN DEFAULT TRUE,
  INDEX idx_route (from_code, to_code)
);

CREATE TABLE IF NOT EXISTS trains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  train_no VARCHAR(6) NOT NULL,            -- 12951
  name VARCHAR(80) NOT NULL,               -- Mumbai Rajdhani
  from_code VARCHAR(6) NOT NULL,           -- station code
  from_city VARCHAR(60) NOT NULL,
  to_code VARCHAR(6) NOT NULL,
  to_city VARCHAR(60) NOT NULL,
  dep_time TIME NOT NULL,
  arr_time TIME NOT NULL,
  duration_min INT NOT NULL,
  days_of_week CHAR(7) NOT NULL DEFAULT '1234567',
  is_active BOOLEAN DEFAULT TRUE,
  INDEX idx_route (from_code, to_code)
);

CREATE TABLE IF NOT EXISTS train_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  train_id INT NOT NULL,
  class_code VARCHAR(4) NOT NULL,          -- SL, 3A, 2A, 1A, CC, EC
  class_name VARCHAR(40) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  seats_per_day INT NOT NULL DEFAULT 72,
  UNIQUE KEY uq_train_class (train_id, class_code),
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hotels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  city VARCHAR(60) NOT NULL,
  area VARCHAR(100),                       -- e.g. "Calangute, North Goa"
  stars TINYINT NOT NULL DEFAULT 3,
  description TEXT,
  amenities VARCHAR(300),                  -- comma separated
  image_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  INDEX idx_city (city)
);

CREATE TABLE IF NOT EXISTS hotel_rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hotel_id INT NOT NULL,
  room_code VARCHAR(10) NOT NULL,          -- STD, DLX, SUITE
  room_name VARCHAR(60) NOT NULL,
  price_per_night DECIMAL(10,2) NOT NULL,
  rooms_total INT NOT NULL DEFAULT 10,
  max_guests TINYINT NOT NULL DEFAULT 2,
  UNIQUE KEY uq_hotel_room (hotel_id, room_code),
  FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
);

-- Per-date availability, created lazily on first booking. One row per (item, date, class/room).
-- Decremented with UPDATE ... WHERE seats_left >= ? — same atomic pattern as package_dates.
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_type ENUM('FLIGHT','TRAIN','HOTEL') NOT NULL,
  item_id INT NOT NULL,
  travel_date DATE NOT NULL,
  sub_key VARCHAR(20) NOT NULL DEFAULT '',
  seats_total INT NOT NULL,
  seats_left INT NOT NULL,
  UNIQUE KEY uq_inv (item_type, item_id, travel_date, sub_key)
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
