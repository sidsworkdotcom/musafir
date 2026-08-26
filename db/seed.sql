-- Musafir Tourism: seed data (6 packages across categories, dates, itineraries, coupons)
-- Departure dates are relative to CURDATE() so the demo never shows an empty calendar.

INSERT INTO users (name, email, role, password_hash, is_verified) VALUES
('Demo Admin', 'admin@musafir.local', 'ADMIN', NULL, TRUE),
('Aarav Traveller', 'aarav@example.com', 'USER', '$2b$10$JmZ3fQTkfR5wnas5bKJaA.xLgRBxx2gzhzy6Bh5LMeqJYxT0W8gOe', TRUE); -- password: demo1234

INSERT INTO packages (title, slug, destination, state, category, description, price, duration_days, image_url, lat, lon) VALUES
('Goa Sun & Sand Escape', 'goa-sun-sand', 'Goa', 'Goa', 'BEACH',
 'Four easy days of North Goa beaches, forts, and shacks. Baga and Anjuna by day, Tito''s Lane by night, with a sunset cruise on the Mandovi to close it out.',
 12999, 4, 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1200', 15.49660, 73.82780),
('Manali Mountain Retreat', 'manali-mountain-retreat', 'Manali', 'Himachal Pradesh', 'HILLS',
 'Five days in the Kullu valley: Solang adventure sports, Hadimba temple, Old Manali cafes, and a day trip toward Atal Tunnel and Sissu.',
 15499, 5, 'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=1200', 32.23960, 77.18870),
('Jaipur Royal Heritage Trail', 'jaipur-heritage-trail', 'Jaipur', 'Rajasthan', 'HERITAGE',
 'Three days inside the Pink City: Amber Fort by elephant path, City Palace, Hawa Mahal at golden hour, and a bazaar walk through Johari Bazaar.',
 9999, 3, 'https://images.unsplash.com/photo-1477587458883-47145ed94245?w=1200', 26.91240, 75.78730),
('Jim Corbett Safari Weekend', 'corbett-safari-weekend', 'Jim Corbett', 'Uttarakhand', 'WILDLIFE',
 'Two jeep safaris in Bijrani and Jhirna zones with a naturalist, riverside resort stay, and a bonfire evening on the Kosi.',
 11499, 3, 'https://images.unsplash.com/photo-1615963244664-5b845b2025ee?w=1200', 29.53000, 78.77470),
('Varanasi Ganga Aarti Sojourn', 'varanasi-ganga-aarti', 'Varanasi', 'Uttar Pradesh', 'SPIRITUAL',
 'Dawn boat ride past the ghats, the evening Ganga Aarti at Dashashwamedh, Sarnath excursion, and the old city''s lanes with a local guide.',
 8499, 3, 'https://images.unsplash.com/photo-1561361058-c24cecae35ca?w=1200', 25.31760, 82.97390),
('Munnar Tea Country Trails', 'munnar-tea-trails', 'Munnar', 'Kerala', 'HILLS',
 'Four days among the tea gardens: Eravikulam National Park, Mattupetty Dam, a working tea factory tour, and sunrise at Top Station.',
 13999, 4, 'https://images.unsplash.com/photo-1591017403286-fd8493524e1e?w=1200', 10.08890, 77.05950);

INSERT INTO package_itinerary (package_id, day_number, title, details) VALUES
(1,1,'Arrival & Baga Beach','Check in, afternoon at Baga, evening at a beach shack.'),
(1,2,'Forts & North Goa','Aguada Fort, Chapora Fort, Anjuna flea market.'),
(1,3,'Water Sports & Cruise','Parasailing at Baga, sunset cruise on the Mandovi.'),
(1,4,'Leisure & Departure','Free morning, checkout by noon.'),
(2,1,'Arrival in Manali','Scenic drive up the Kullu valley, Mall Road evening.'),
(2,2,'Solang Valley','Ropeway, zorbing, paragliding (season permitting).'),
(2,3,'Atal Tunnel & Sissu','Day trip across the tunnel into Lahaul.'),
(2,4,'Old Manali & Hadimba','Cafes, Hadimba temple, Manu temple walk.'),
(2,5,'Departure','Breakfast and checkout.'),
(3,1,'Amber & Jaigarh','Amber Fort morning, Jaigarh ramparts, Jal Mahal photo stop.'),
(3,2,'Pink City Core','City Palace, Jantar Mantar, Hawa Mahal at sunset.'),
(3,3,'Bazaars & Departure','Johari Bazaar walk, block-printing demo, departure.'),
(4,1,'Arrival & Riverside Evening','Resort check-in on the Kosi, bonfire dinner.'),
(4,2,'Twin Safaris','Dawn safari in Bijrani, afternoon safari in Jhirna.'),
(4,3,'Corbett Museum & Departure','Dhangarhi museum, departure after lunch.'),
(5,1,'Ghats at Dusk','Arrival, evening Ganga Aarti at Dashashwamedh Ghat.'),
(5,2,'Dawn Boat & Sarnath','Sunrise boat ride, Sarnath stupa and museum.'),
(5,3,'Old City Walk','Kachori gali breakfast, Vishwanath corridor, departure.'),
(6,1,'Arrival via Cochin','Ghat-road drive up, tea garden viewpoints.'),
(6,2,'Eravikulam & Mattupetty','Nilgiri tahr spotting, dam and echo point.'),
(6,3,'Tea Factory & Top Station','Working factory tour, sunset at Top Station.'),
(6,4,'Departure','Spice market stop, drive down.');

-- Departure dates over the next months (slots vary so "Only X left!" shows naturally)
INSERT INTO package_dates (package_id, start_date, total_slots, slots_left) VALUES
(1,DATE_ADD(CURDATE(), INTERVAL 19 DAY),20,20),(1,DATE_ADD(CURDATE(), INTERVAL 33 DAY),20,3),(1,DATE_ADD(CURDATE(), INTERVAL 47 DAY),20,14),
(2,DATE_ADD(CURDATE(), INTERVAL 21 DAY),15,15),(2,DATE_ADD(CURDATE(), INTERVAL 35 DAY),15,2),(2,DATE_ADD(CURDATE(), INTERVAL 49 DAY),15,9),
(3,DATE_ADD(CURDATE(), INTERVAL 14 DAY),25,25),(3,DATE_ADD(CURDATE(), INTERVAL 28 DAY),25,11),(3,DATE_ADD(CURDATE(), INTERVAL 42 DAY),25,25),
(4,DATE_ADD(CURDATE(), INTERVAL 22 DAY),12,5),(4,DATE_ADD(CURDATE(), INTERVAL 36 DAY),12,12),
(5,DATE_ADD(CURDATE(), INTERVAL 15 DAY),18,18),(5,DATE_ADD(CURDATE(), INTERVAL 29 DAY),18,7),
(6,DATE_ADD(CURDATE(), INTERVAL 20 DAY),16,16),(6,DATE_ADD(CURDATE(), INTERVAL 34 DAY),16,1),(6,DATE_ADD(CURDATE(), INTERVAL 48 DAY),16,16);

INSERT INTO coupons (code, discount_pct, max_discount, expires_at) VALUES
('WELCOME10', 10, 1500.00, DATE_ADD(CURDATE(), INTERVAL 365 DAY)),
('MONSOON20', 20, 2500.00, DATE_ADD(CURDATE(), INTERVAL 60 DAY)),
('HILLS15',   15, 2000.00, DATE_ADD(CURDATE(), INTERVAL 120 DAY)),
('NODETENTION2026',     25, 3000.00, DATE_ADD(CURDATE(), INTERVAL 365 DAY)),
('DEKHO_MAAM_WE_TRIED', 30, 3500.00, DATE_ADD(CURDATE(), INTERVAL 365 DAY));

-- A couple of seed reviews (from the demo user, pretend past bookings)
INSERT INTO reviews (user_id, package_id, rating, comment) VALUES
(2, 1, 5, 'The sunset cruise alone was worth it. Perfectly paced trip.'),
(2, 3, 4, 'Amber Fort at 8am before the crowds - great planning by the team.');
