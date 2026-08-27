// Musafir — small progressive enhancements. Everything works without JS; this just makes it nicer.
(function () {
  // ---------- Toast ----------
  var toastEl = document.createElement('div');
  toastEl.className = 'toast'; toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  var toastTimer;
  function toast(text, code) {
    toastEl.innerHTML = text + (code ? '<span class="mono">' + code + '</span>' : '');
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  // ---------- Copy coupon (any [data-copy]) ----------
  function copy(code) {
    var done = function () { toast('Copied', code); };
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, done); else done();
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-copy]');
    if (!el) return;
    e.preventDefault();
    copy(el.getAttribute('data-copy'));
  });

  // ---------- Mobile nav ----------
  var navBtn = document.querySelector('.nav-toggle');
  function setNav(open) { document.body.classList.toggle('nav-open', open); if (navBtn) navBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (navBtn) navBtn.addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
  document.addEventListener('click', function (e) { if (e.target.matches('[data-nav-close]')) setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });

  // ---------- Quantity steppers ----------
  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      var input = document.getElementById(b.getAttribute('data-step'));
      var v = (Number(input.value) || 1) + (b.classList.contains('minus') ? -1 : 1);
      v = Math.max(Number(input.min) || 1, Math.min(Number(input.max) || 10, v));
      input.value = v; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // ---------- Passenger / guest detail rows ----------
  var paxList = document.getElementById('pax-list');
  if (paxList) {
    var qtyInput = document.querySelector('[name=travelers], [name=qty]');
    var mode = paxList.getAttribute('data-mode');            // 'pax' or 'rooms'
    var maxGuests = Number(paxList.getAttribute('data-max-guests')) || 2;
    var saved = {};
    function snapshot() { paxList.querySelectorAll('input, select').forEach(function (el) { saved[el.name] = el.value; }); }
    function restore() { paxList.querySelectorAll('input, select').forEach(function (el) { if (saved[el.name] != null) el.value = saved[el.name]; }); }
    function paxRow(prefix, i, label) {
      return '<div class="pax-row"><span class="mono pax-n">' + label + '</span>' +
        '<input type="text" name="' + prefix + '[name]" placeholder="Full name (as on ID)" required maxlength="80">' +
        '<input type="number" name="' + prefix + '[age]" placeholder="Age" min="0" max="120" required class="pax-age">' +
        '<select name="' + prefix + '[gender]" required><option value="">Gender</option><option>Male</option><option>Female</option><option>Other</option></select></div>';
    }
    function render() {
      snapshot();
      var n = Math.max(1, Number(qtyInput.value) || 1), html = '';
      if (mode === 'pax') {
        for (var i = 0; i < n; i++) html += paxRow('pax[' + i + ']', i, (i + 1) + '.');
      } else {
        for (var r = 0; r < n; r++) {
          var g = Number(saved['rooms[' + r + '][guests]']) || 2; g = Math.min(g, maxGuests);
          html += '<fieldset class="room-block"><legend class="mono">ROOM ' + (r + 1) + '</legend>' +
            '<label class="inline">Guests <select name="rooms[' + r + '][guests]" data-room="' + r + '">';
          for (var k = 1; k <= maxGuests; k++) html += '<option value="' + k + '"' + (k === g ? ' selected' : '') + '>' + k + '</option>';
          html += '</select><span class="hint">max ' + maxGuests + '</span></label>';
          for (var j = 0; j < g; j++) html += paxRow('rooms[' + r + '][guests_list][' + j + ']', j, 'G' + (j + 1));
          html += '<div class="room-prefs"><label class="inline">Bed <select name="rooms[' + r + '][bed]"><option>No preference</option><option>King bed</option><option>Twin beds</option></select></label>' +
            '<label class="inline">Floor <select name="rooms[' + r + '][floor]"><option>No preference</option><option>High floor</option><option>Low floor</option></select></label>' +
            '<label class="inline"><input type="checkbox" name="rooms[' + r + '][nonsmoking]" value="1" checked> Non-smoking</label></div></fieldset>';
        }
      }
      paxList.innerHTML = html; restore();
    }
    qtyInput.addEventListener('input', render);
    paxList.addEventListener('change', function (e) { if (e.target.matches('[data-room]')) render(); });
    render();
  }

  // ---------- Flash dismiss ----------
  document.addEventListener('click', function (e) {
    if (e.target.matches('[data-dismiss]')) e.target.closest('.flash').remove();
  });

  // ---------- Search tabs: Packages / Flights / Trains / Hotels ----------
  document.querySelectorAll('.search-card').forEach(function (card) {
    var tabs = card.querySelectorAll('.search-tab');
    var panels = card.querySelectorAll('.search-panel');
    tabs.forEach(function (t) {
      t.addEventListener('click', function (e) {
        var name = t.getAttribute('data-panel');
        if (!name || panels.length < 2) return;          // results pages link out instead
        e.preventDefault();
        tabs.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
      });
    });
    // swap from/to
    card.querySelectorAll('[data-swap]').forEach(function (b) {
      b.addEventListener('click', function () {
        var ids = b.getAttribute('data-swap').split(',');
        var a = document.getElementById(ids[0]), c = document.getElementById(ids[1]);
        if (a && c) { var v = a.value; a.value = c.value; c.value = v; }
      });
    });
    // hotel: checkout must be after checkin
    var cin = card.querySelector('#h-in'), cout = card.querySelector('#h-out');
    if (cin && cout) {
      var sync = function () {
        var d = new Date(cin.value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
        var min = d.toISOString().slice(0, 10);
        cout.min = min; if (!cout.value || cout.value < min) cout.value = min;
      };
      cin.addEventListener('change', sync); sync();
    }
  });

  // ---------- First-visit offer popup ----------
  var popup = document.getElementById('offer-popup');
  if (popup) {
    var KEY = 'musafir_offer_seen';
    var seen = false;
    try { seen = sessionStorage.getItem(KEY) === '1'; } catch (_) {}
    function close() { popup.classList.remove('open'); try { sessionStorage.setItem(KEY, '1'); } catch (_) {} }
    if (!seen) {
      setTimeout(function () { popup.classList.add('open'); popup.querySelector('.popup-close').focus(); }, 1400);
    }
    popup.addEventListener('click', function (e) { if (e.target === popup || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popup.classList.contains('open')) close(); });
  }

  // ---------- Live fare preview (book page) ----------
  var form = document.getElementById('book-form');
  if (form) {
    var price = Number(form.getAttribute('data-price'));
    var coupons = JSON.parse(form.getAttribute('data-coupons') || '[]');
    var travelers = form.querySelector('[name=travelers], [name=qty]');
    var couponIn = form.querySelector('[name=coupon]');
    var dateSel = form.querySelector('[name=date_id]');
    var hint = document.getElementById('fare-hint');
    var out = {
      date: document.getElementById('f-date'), trav: document.getElementById('f-trav'),
      sub: document.getElementById('f-sub'), discRow: document.getElementById('f-disc-row'),
      discLabel: document.getElementById('f-disc-label'), disc: document.getElementById('f-disc'),
      total: document.getElementById('f-total'), btn: document.getElementById('book-submit')
    };
    var inr = function (n) { return '₹' + Number(n).toLocaleString('en-IN'); };

    function recalc() {
      var n = Math.max(1, Math.min(Number(travelers.max) || 10, Number(travelers.value) || 1));
      var base = price * n;
      var code = (couponIn.value || '').trim().toUpperCase();
      var c = coupons.filter(function (x) { return x.code === code; })[0];
      var discount = 0;
      hint.className = 'fare-hint';
      if (code && !c) { hint.textContent = 'Not a valid code — applied codes are checked again at checkout.'; hint.classList.add('bad'); }
      else if (c) {
        discount = Math.round(base * c.pct / 100);
        if (c.cap != null) discount = Math.min(discount, Number(c.cap));
        hint.textContent = c.code + ' applied — you save ' + inr(discount) + (c.cap != null && discount === Number(c.cap) ? ' (max cap)' : '');
      } else hint.textContent = '';
      document.querySelectorAll('.coupon-chip').forEach(function (ch) { ch.classList.toggle('active', ch.getAttribute('data-code') === code); });
      if (dateSel) out.date.textContent = dateSel.options[dateSel.selectedIndex].getAttribute('data-label');
      out.trav.textContent = n + ' × ' + inr(price);
      out.sub.textContent = inr(base);
      out.discRow.style.display = discount ? '' : 'none';
      out.discLabel.textContent = 'Coupon ' + code;
      out.disc.textContent = '− ' + inr(discount);
      out.total.textContent = inr(base - discount);
      out.btn.textContent = 'Continue to pay ' + inr(base - discount) + ' →';
    }
    form.addEventListener('input', recalc);
    form.addEventListener('change', recalc);
    document.querySelectorAll('.coupon-chip').forEach(function (ch) {
      ch.addEventListener('click', function () {
        var code = ch.getAttribute('data-code');
        couponIn.value = couponIn.value.toUpperCase() === code ? '' : code;
        recalc();
      });
    });
    recalc();
  }
})();
