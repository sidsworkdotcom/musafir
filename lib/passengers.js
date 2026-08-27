// Parse + validate traveller / guest details posted from the checkout forms.
// Flights, trains, packages: pax[i][name|age|gender]. Hotels: rooms[r][guests|bed|floor|nonsmoking|guests_list[j][...]].
const clean = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 80);

function parsePassengers(body, qty) {
  const raw = body.pax || {};
  const list = [];
  for (let i = 0; i < qty; i++) {
    const p = raw[i] || raw[String(i)] || {};
    const name = clean(p.name), age = Number(p.age), gender = clean(p.gender);
    if (name.length < 2) return { error: `Enter a name for traveller ${i + 1}.` };
    if (!(age >= 0 && age <= 120)) return { error: `Enter a valid age for ${name}.` };
    if (!['Male', 'Female', 'Other'].includes(gender)) return { error: `Select a gender for ${name}.` };
    list.push({ name, age, gender });
  }
  return { passengers: list };
}

function parseRooms(body, qty, maxGuests) {
  const raw = body.rooms || {};
  const rooms = [];
  for (let r = 0; r < qty; r++) {
    const rm = raw[r] || raw[String(r)] || {};
    const guests = Number(rm.guests);
    if (!(guests >= 1 && guests <= maxGuests)) return { error: `Room ${r + 1}: guests must be between 1 and ${maxGuests}.` };
    const gl = rm.guests_list || {};
    const names = [];
    for (let j = 0; j < guests; j++) {
      const g = gl[j] || gl[String(j)] || {};
      const name = clean(g.name), age = Number(g.age), gender = clean(g.gender);
      if (name.length < 2) return { error: `Room ${r + 1}: enter a name for guest ${j + 1}.` };
      if (!(age >= 0 && age <= 120)) return { error: `Room ${r + 1}: enter a valid age for ${name}.` };
      if (!['Male', 'Female', 'Other'].includes(gender)) return { error: `Room ${r + 1}: select a gender for ${name}.` };
      names.push({ name, age, gender });
    }
    rooms.push({ guests, guests_list: names, bed: clean(rm.bed) || 'No preference', floor: clean(rm.floor) || 'No preference', nonsmoking: rm.nonsmoking === '1' });
  }
  return { rooms, special_request: clean(body.special_request).slice(0, 300) };
}

const namesOf = details => {
  if (!details) return [];
  if (details.passengers) return details.passengers.map(p => p.name);
  if (details.rooms) return details.rooms.flatMap(r => r.guests_list.map(g => g.name));
  return [];
};

module.exports = { parsePassengers, parseRooms, namesOf };
