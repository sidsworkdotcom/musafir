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

  // ---------- Flash dismiss ----------
  document.addEventListener('click', function (e) {
    if (e.target.matches('[data-dismiss]')) e.target.closest('.flash').remove();
  });

  // ---------- Search tabs (home) ----------
  var tabs = document.querySelectorAll('.search-tab');
  var catInput = document.getElementById('search-category');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
      t.setAttribute('aria-selected', 'true');
      if (catInput) catInput.value = t.getAttribute('data-cat') || '';
    });
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
    var travelers = form.querySelector('[name=travelers]');
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
      var n = Math.max(1, Math.min(10, Number(travelers.value) || 1));
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
