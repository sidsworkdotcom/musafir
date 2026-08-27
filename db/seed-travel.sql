-- Musafir: travel inventory seed (flights, trains, hotels). Loaded by db/migrate.js when `flights` is empty.
-- Schedules are fixed daily/weekly patterns; per-date seat/room availability lives in `inventory`,
-- created lazily on first booking from seats_per_day / rooms_total.

-- ============ FLIGHTS ============
INSERT INTO flights (flight_no, airline, from_code, from_city, to_code, to_city, dep_time, arr_time, duration_min, days_of_week, price, seats_per_day) VALUES
-- Mumbai <-> Goa
('6E 5301','IndiGo',      'BOM','Mumbai','GOI','Goa',      '06:10','07:25', 75,'1234567', 3499,180),
('AI 663', 'Air India',   'BOM','Mumbai','GOI','Goa',      '09:40','10:55', 75,'1234567', 4150,150),
('QP 1121','Akasa Air',   'BOM','Mumbai','GOI','Goa',      '14:20','15:35', 75,'1234567', 3299,180),
('6E 5302','IndiGo',      'GOI','Goa',   'BOM','Mumbai',   '08:05','09:20', 75,'1234567', 3599,180),
('AI 664', 'Air India',   'GOI','Goa',   'BOM','Mumbai',   '18:30','19:45', 75,'1234567', 4250,150),
-- Mumbai <-> Delhi
('6E 2135','IndiGo',      'BOM','Mumbai','DEL','Delhi',    '05:55','08:05',130,'1234567', 5299,186),
('AI 887', 'Air India',   'BOM','Mumbai','DEL','Delhi',    '11:00','13:10',130,'1234567', 5899,168),
('UK 933', 'Vistara',     'BOM','Mumbai','DEL','Delhi',    '17:45','19:55',130,'1234567', 6499,158),
('6E 2136','IndiGo',      'DEL','Delhi', 'BOM','Mumbai',   '07:30','09:40',130,'1234567', 5199,186),
('AI 888', 'Air India',   'DEL','Delhi', 'BOM','Mumbai',   '20:15','22:25',130,'1234567', 5799,168),
-- Mumbai <-> Bengaluru
('6E 6123','IndiGo',      'BOM','Mumbai','BLR','Bengaluru','06:45','08:30',105,'1234567', 4399,186),
('QP 1387','Akasa Air',   'BOM','Mumbai','BLR','Bengaluru','15:10','16:55',105,'1234567', 4099,180),
('6E 6124','IndiGo',      'BLR','Bengaluru','BOM','Mumbai','09:20','11:05',105,'1234567', 4499,186),
-- Mumbai <-> Jaipur
('6E 5065','IndiGo',      'BOM','Mumbai','JAI','Jaipur',   '07:15','09:05',110,'1234567', 4799,180),
('AI 611', 'Air India',   'JAI','Jaipur','BOM','Mumbai',   '16:40','18:30',110,'1234567', 4999,150),
-- Delhi <-> Goa
('6E 2211','IndiGo',      'DEL','Delhi', 'GOI','Goa',      '06:20','09:00',160,'1234567', 6299,186),
('UK 871', 'Vistara',     'DEL','Delhi', 'GOI','Goa',      '13:30','16:10',160,'1234567', 7199,158),
('6E 2212','IndiGo',      'GOI','Goa',   'DEL','Delhi',    '10:00','12:40',160,'1234567', 6399,186),
-- Delhi <-> Bengaluru
('6E 2019','IndiGo',      'DEL','Delhi', 'BLR','Bengaluru','08:00','10:50',170,'1234567', 6199,186),
('AI 502', 'Air India',   'BLR','Bengaluru','DEL','Delhi', '19:00','21:50',170,'1234567', 6599,168),
-- Delhi <-> Jaipur (short hop)
('6E 7203','IndiGo',      'DEL','Delhi', 'JAI','Jaipur',   '12:10','13:05', 55,'1234567', 2799,78),
('6E 7204','IndiGo',      'JAI','Jaipur','DEL','Delhi',    '14:00','14:55', 55,'1234567', 2899,78),
-- Bengaluru <-> Goa
('6E 6511','IndiGo',      'BLR','Bengaluru','GOI','Goa',   '10:30','11:45', 75,'1234567', 3899,180),
('QP 1631','Akasa Air',   'GOI','Goa',   'BLR','Bengaluru','16:20','17:35', 75,'1234567', 3799,180),
-- Hyderabad / Kolkata / Chennai links
('6E 5142','IndiGo',      'BOM','Mumbai','HYD','Hyderabad','07:50','09:20', 90,'1234567', 4299,186),
('6E 5143','IndiGo',      'HYD','Hyderabad','BOM','Mumbai','10:05','11:35', 90,'1234567', 4199,186),
('AI 771', 'Air India',   'BOM','Mumbai','CCU','Kolkata',  '08:30','11:20',170,'1234567', 6899,168),
('6E 552', 'IndiGo',      'BOM','Mumbai','MAA','Chennai',  '06:00','07:55',115,'1234567', 4699,186),
('6E 553', 'IndiGo',      'MAA','Chennai','BOM','Mumbai',  '20:30','22:25',115,'1234567', 4599,186),
('UK 811', 'Vistara',     'DEL','Delhi', 'HYD','Hyderabad','09:15','11:25',130,'1234567', 5999,158),
-- weekend-only leisure flight (shows days_of_week filtering)
('6E 7811','IndiGo',      'BOM','Mumbai','GOI','Goa',      '19:50','21:05', 75,'56 7',   2999,180);

-- ============ TRAINS ============
INSERT INTO trains (train_no, name, from_code, from_city, to_code, to_city, dep_time, arr_time, duration_min, days_of_week) VALUES
('12951','Mumbai Rajdhani',         'BCT', 'Mumbai',   'NDLS','Delhi',     '17:00','08:35', 935,'1234567'),
('12952','New Delhi Rajdhani',      'NDLS','Delhi',    'BCT', 'Mumbai',    '16:25','08:15', 950,'1234567'),
('12009','Mumbai Shatabdi',         'BCT', 'Mumbai',   'ADI', 'Ahmedabad', '06:25','12:40', 375,'123456 '),
('10103','Mandovi Express',         'CSMT','Mumbai',   'MAO', 'Madgaon',   '07:10','19:40', 750,'1234567'),
('10104','Mandovi Express',         'MAO', 'Madgaon',  'CSMT','Mumbai',    '09:15','21:45', 750,'1234567'),
('12051','Jan Shatabdi Express',    'CSMT','Mumbai',   'MAO', 'Madgaon',   '05:25','14:10', 525,'123456 '),
('22119','Tejas Express',           'CSMT','Mumbai',   'MAO', 'Madgaon',   '05:50','14:15', 505,'12 4567'),
('12955','Jaipur Superfast',        'BCT', 'Mumbai',   'JP',  'Jaipur',    '18:50','12:25',1055,'1234567'),
('12956','Jaipur–Mumbai Superfast', 'JP',  'Jaipur',   'BCT', 'Mumbai',    '14:10','07:35',1045,'1234567'),
('12163','Chennai Express',         'CSMT','Mumbai',   'MAS', 'Chennai',   '20:30','20:15',1425,'1234567'),
('12627','Karnataka Express',       'NDLS','Delhi',    'SBC', 'Bengaluru', '21:15','13:10',2395,'1234567'),
('12430','Bengaluru Rajdhani',      'NDLS','Delhi',    'SBC', 'Bengaluru', '20:45','06:40',2035,'1234567'),
('12015','Ajmer Shatabdi',          'NDLS','Delhi',    'JP',  'Jaipur',    '06:05','10:30', 265,'1234567'),
('12016','Ajmer Shatabdi',          'JP',  'Jaipur',   'NDLS','Delhi',     '17:50','22:40', 290,'1234567'),
('12301','Howrah Rajdhani',         'NDLS','Delhi',    'HWH', 'Kolkata',   '16:55','09:55',1020,'1234567'),
('12702','Hussain Sagar Express',   'HYB', 'Hyderabad','CSMT','Mumbai',    '14:45','04:40', 835,'1234567'),
('12701','Hussain Sagar Express',   'CSMT','Mumbai',   'HYB', 'Hyderabad', '21:50','11:25', 815,'1234567'),
('17311','Vasco–Bengaluru Express', 'MAO', 'Madgaon',  'SBC', 'Bengaluru', '15:10','06:20', 910,'  3  6 ');

-- Classes: (SL sleeper, 3A AC 3-tier, 2A AC 2-tier, 1A first AC, CC chair car, EC exec chair)
INSERT INTO train_classes (train_id, class_code, class_name, price, seats_per_day)
SELECT t.id, c.class_code, c.class_name, ROUND(c.rate_per_min * t.duration_min / 10) * 10, c.seats
FROM trains t
JOIN (
  SELECT 'SL' AS class_code, 'Sleeper' AS class_name, 0.45 AS rate_per_min, 72 AS seats UNION ALL
  SELECT '3A', 'AC 3 Tier', 1.20, 64 UNION ALL
  SELECT '2A', 'AC 2 Tier', 1.70, 46 UNION ALL
  SELECT '1A', 'First AC',  2.90, 18
) c
WHERE t.train_no NOT IN ('12009','12051','22119','12015','12016','12951','12952','12430','12301');

-- Rajdhanis: AC only
INSERT INTO train_classes (train_id, class_code, class_name, price, seats_per_day)
SELECT t.id, c.class_code, c.class_name, ROUND(c.rate * t.duration_min / 10) * 10, c.seats
FROM trains t
JOIN (
  SELECT '3A' AS class_code, 'AC 3 Tier' AS class_name, 2.4 AS rate, 64 AS seats UNION ALL
  SELECT '2A', 'AC 2 Tier', 3.3, 46 UNION ALL
  SELECT '1A', 'First AC',  5.6, 18
) c
WHERE t.train_no IN ('12951','12952','12430','12301');

-- Shatabdi / Jan Shatabdi / Tejas: chair cars
INSERT INTO train_classes (train_id, class_code, class_name, price, seats_per_day)
SELECT t.id, c.class_code, c.class_name, ROUND(c.rate * t.duration_min / 10) * 10, c.seats
FROM trains t
JOIN (
  SELECT 'CC' AS class_code, 'AC Chair Car' AS class_name, 2.2 AS rate, 78 AS seats UNION ALL
  SELECT 'EC', 'Executive Chair Car', 4.4, 56
) c
WHERE t.train_no IN ('12009','12051','22119','12015','12016');

-- ============ HOTELS ============
INSERT INTO hotels (name, slug, city, area, stars, description, amenities, image_url) VALUES
('Taj Fort Aguada Resort & Spa','taj-fort-aguada','Goa','Sinquerim, North Goa',5,'Sixteenth-century Portuguese fort ramparts, private beach access and sea-facing cottages. The classic Goa luxury stay.','Beach access, Pool, Spa, Breakfast included, Free Wi-Fi, Bar','https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200'),
('Novotel Goa Candolim','novotel-candolim','Goa','Candolim, North Goa',4,'Five minutes from Candolim beach with a rooftop pool and an easy walk to the Sinquerim strip.','Pool, Breakfast included, Free Wi-Fi, Gym, Restaurant','https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200'),
('The Postcard Cuelim','postcard-cuelim','Goa','Cansaulim, South Goa',4,'A restored 200-year-old Goan house with nine rooms, jackfruit trees and no checkout time.','Breakfast included, Free Wi-Fi, Garden, Bicycle rental','https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200'),
('Zostel Anjuna','zostel-anjuna','Goa','Anjuna, North Goa',2,'Backpacker favourite a short walk from Anjuna beach and the Wednesday flea market.','Free Wi-Fi, Common kitchen, Cafe, Lockers','https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200'),
('The Himalayan Village','himalayan-village','Manali','Kais, Kullu Valley',4,'Stone-and-wood cottages in traditional Kath-Kuni style above the Beas river, forty minutes from Manali town.','Breakfast included, Free Wi-Fi, Spa, Bonfire, Mountain views','https://images.unsplash.com/photo-1586375300773-8384e3e4916f?w=1200'),
('Span Resort & Spa','span-resort-manali','Manali','Katrain, Kullu–Manali Highway',5,'Riverside resort on the banks of the Beas with apple orchards, a heated pool and Himalayan views from every room.','Pool, Spa, Breakfast included, Free Wi-Fi, River view, Bar','https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=1200'),
('Zostel Old Manali','zostel-old-manali','Manali','Old Manali',2,'Riverside hostel with cafe culture, treks starting at the door and the best sunset deck in Old Manali.','Free Wi-Fi, Cafe, Lockers, Trek desk','https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1200'),
('Rambagh Palace','rambagh-palace','Jaipur','Bhawani Singh Road',5,'Former residence of the Maharaja of Jaipur. Peacocks on the lawns, marble corridors and a suite once used by royal guests.','Pool, Spa, Breakfast included, Free Wi-Fi, Palace tours, Bar','https://images.unsplash.com/photo-1477587458883-47145ed94245?w=1200'),
('Samode Haveli','samode-haveli','Jaipur','Gangapole, Old City',4,'A 175-year-old haveli inside the old city walls, with painted rooms and a courtyard pool.','Pool, Breakfast included, Free Wi-Fi, Heritage walks','https://images.unsplash.com/photo-1599661046289-e31897846e41?w=1200'),
('Pearl Palace Heritage','pearl-palace-heritage','Jaipur','Hathroi Fort, Ajmer Road',3,'Boutique heritage-style hotel with themed rooms and the well-loved Peacock Rooftop restaurant.','Breakfast included, Free Wi-Fi, Rooftop restaurant','https://images.unsplash.com/photo-1590073242678-70ee3fc28e8e?w=1200'),
('The Taj Mahal Palace','taj-mahal-palace-mumbai','Mumbai','Apollo Bunder, Colaba',5,'The 1903 landmark opposite the Gateway of India. Sea Lounge tea, harbour views and a century of guest history.','Pool, Spa, Breakfast included, Free Wi-Fi, Sea view, Bar','https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=1200'),
('Trident Bandra Kurla','trident-bkc','Mumbai','Bandra Kurla Complex',5,'Glass tower in the business district with an outdoor pool and easy airport access.','Pool, Spa, Breakfast included, Free Wi-Fi, Gym, Bar','https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200'),
('Abode Bombay','abode-bombay','Mumbai','Colaba',3,'Twenty-room boutique hotel in a 1910 building, a two-minute walk from Regal cinema and Colaba Causeway.','Breakfast included, Free Wi-Fi, Library','https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200'),
('The Imperial','the-imperial-delhi','Delhi','Janpath, Connaught Place',5,'Art Deco 1931 hotel on Janpath with a large garden, colonial-era art collection and the 1911 restaurant.','Pool, Spa, Breakfast included, Free Wi-Fi, Garden, Bar','https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200'),
('Haveli Dharampura','haveli-dharampura','Delhi','Chandni Chowk, Old Delhi',4,'UNESCO-awarded restoration of a 19th-century haveli in the lanes of Old Delhi, with rooftop kathak evenings.','Breakfast included, Free Wi-Fi, Rooftop, Heritage walks','https://images.unsplash.com/photo-1609766857041-ed402ea8069a?w=1200'),
('bloomrooms @ New Delhi Railway Station','bloomrooms-ndls','Delhi','Paharganj',3,'Bright budget rooms across from the railway station; ideal for early Shatabdi departures.','Free Wi-Fi, Breakfast included, 24h reception','https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200'),
('The Oberoi Bengaluru','oberoi-bengaluru','Bengaluru','MG Road',5,'Garden hotel in the heart of the city with a 100-year-old rain tree and MG Road at the gate.','Pool, Spa, Breakfast included, Free Wi-Fi, Garden, Bar','https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=1200'),
('Ibis Bengaluru City Centre','ibis-bengaluru-city','Bengaluru','Hosur Road',3,'Reliable mid-range stay near the metro with a rooftop bar and quick access to Koramangala.','Free Wi-Fi, Restaurant, Rooftop bar, Gym','https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200');

-- Room types per hotel, priced off star rating
INSERT INTO hotel_rooms (hotel_id, room_code, room_name, price_per_night, rooms_total, max_guests)
SELECT h.id, r.room_code, r.room_name,
       ROUND(r.mult * CASE h.stars WHEN 5 THEN 14000 WHEN 4 THEN 7500 WHEN 3 THEN 3600 ELSE 1200 END / 100) * 100,
       r.total, r.guests
FROM hotels h
JOIN (
  SELECT 'STD' AS room_code, 'Standard Room' AS room_name, 1.0 AS mult, 12 AS total, 2 AS guests UNION ALL
  SELECT 'DLX', 'Deluxe Room', 1.35, 8, 3 UNION ALL
  SELECT 'SUITE', 'Suite', 2.2, 3, 4
) r
WHERE h.stars >= 3;

-- Hostels: dorm beds + private
INSERT INTO hotel_rooms (hotel_id, room_code, room_name, price_per_night, rooms_total, max_guests)
SELECT h.id, r.room_code, r.room_name, r.price, r.total, r.guests
FROM hotels h
JOIN (
  SELECT 'DORM' AS room_code, 'Mixed Dorm Bed' AS room_name, 899 AS price, 24 AS total, 1 AS guests UNION ALL
  SELECT 'PVT', 'Private Room', 2400, 6, 2
) r
WHERE h.stars < 3;
