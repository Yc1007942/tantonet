/* ============================================================
   TANTO — pages.js
   Subpage logic. Every initializer is element-guarded, so the
   file is safe to load on any page.

   - /routes/      published route table
   - /schedules/   frequent schedule tables (grouped by region)
   - /offices/     interactive office map + searchable directory
   - /news/        category filtering
   - /equipment/   20' / 40' container specification viewer
   - /privacy/     English / Bahasa policy toggle

   Data comes from data/*.js (generated from data/*.json) —
   the same single source of truth as the homepage.
   ============================================================ */
(function () {
  'use strict';

  var NETWORK = window.TANTO_NETWORK || { ports: [], routes: [] };
  var OFFICES = window.TANTO_OFFICES || { offices: [] };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The land silhouette is a stylized illustration, not a geographic map.
     Office dots therefore reuse the artwork-calibrated network coordinates;
     latitude/longitude projection is retained only as a data fallback. */
  var MAP_W = 1920, MAP_H = 764;
  function project(lat, lng) {
    return { x: (lng - 94) * 40, y: (7.6 - lat) * 40 };
  }
  var mapPortsByName = {};
  (NETWORK.ports || []).forEach(function (port) {
    mapPortsByName[String(port.name || '').toUpperCase()] = port;
    if (port.alias) mapPortsByName[String(port.alias).toUpperCase()] = port;
  });
  function officeMapPoint(office) {
    var port = mapPortsByName[String(office.city || '').toUpperCase()] ||
      mapPortsByName[String(office.alias || '').toUpperCase()];
    return port ? { x: port.x, y: port.y } : project(office.lat, office.lng);
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var REGION_ORDER = ['Sumatra & Kep. Riau', 'Kalimantan', 'Nusa Tenggara', 'Sulawesi', 'Maluku', 'Papua'];

  function portName(id) {
    var p = (NETWORK.ports || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : id;
  }

  /* ---------------- /routes/ — full published route table ---------------- */
  function initRouteTable() {
    var body = $('#routeTableBody');
    if (!body) return;
    var routes = NETWORK.routes || [];
    var seen = {};
    REGION_ORDER.forEach(function (region) {
      var rows = routes.filter(function (r) { return r.region === region; });
      if (!rows.length) return;
      seen[region] = true;
      body.insertAdjacentHTML('beforeend',
        '<tr class="rt-group"><th scope="rowgroup" colspan="4">' + esc(region) + '</th></tr>');
      rows.forEach(function (r) {
        var routing = r.via
          ? 'Via ' + portName(r.via)
          : 'Direct';
        body.insertAdjacentHTML('beforeend',
          '<tr class="reveal"><td data-label="From">' + esc(portName(r.from)) + '</td>' +
          '<td data-label="To">' + esc(portName(r.to)) + '</td>' +
          '<td data-label="Frequency / month" class="rt-freq">' + esc(r.freq) + '</td>' +
          '<td data-label="Routing" class="' + (r.via ? 'rt-via' : 'rt-direct') + '">' + esc(routing) + '</td></tr>');
      });
    });
    // Regions present in the data but outside the canonical order
    routes.forEach(function (r) {
      if (!seen[r.region]) {
        seen[r.region] = true;
        body.insertAdjacentHTML('beforeend',
          '<tr class="rt-group"><th scope="rowgroup" colspan="4">' + esc(r.region) + '</th></tr>');
      }
    });
    var count = $('#routeCount');
    if (count) {
      var live = (NETWORK.ports || []).filter(function (p) { return p.apiId; }).length;
      count.textContent = routes.length + ' published routes · ' + live + ' live ports';
    }
  }

  /* ---------------- /schedules/ — frequent schedules by region ---------------- */
  function initScheduleTables() {
    var wrap = $('#schedGroups');
    if (!wrap) return;
    var routes = NETWORK.routes || [];
    REGION_ORDER.forEach(function (region) {
      var rows = routes.filter(function (r) { return r.region === region; });
      if (!rows.length) return;
      var trs = rows.map(function (r) {
        return '<tr class="reveal">' +
          '<td data-label="From">' + esc(portName(r.from)) + '</td>' +
          '<td data-label="To">' + esc(portName(r.to)) + '</td>' +
          '<td data-label="Frequency / month">' + esc(r.freq) + '</td>' +
          '<td data-label="Routing" class="' + (r.via ? '' : 'direct') + '">' + (r.via ? 'Via ' + esc(portName(r.via)) : 'Direct') + '</td>' +
          '</tr>';
      }).join('');
      var note = region === 'Nusa Tenggara'
        ? 'Benete (Sumbawa) appears in the published schedule; port code not in the live schedule system — verify before publication.'
        : 'Monthly departures as published on the Tanto schedule.';
      wrap.insertAdjacentHTML('beforeend',
        '<section class="sched-section reveal">' +
        '<h2>' + esc(region) + '</h2>' +
        '<p class="ss-note">' + esc(note) + '</p>' +
        '<div class="sched-table mobile-card-table"><table>' +
        '<caption>' + esc(region) + ' — published monthly departure frequencies</caption>' +
        '<thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Frequency / month</th><th scope="col">Routing</th></tr></thead>' +
        '<tbody>' + trs + '</tbody></table></div>' +
        '</section>');
    });
  }

  /* ---------------- /offices/ — map + directory ---------------- */
  function initOffices() {
    var grid = $('#officeGrid');
    if (!grid) return;
    var offices = OFFICES.offices || [];
    var dots = $('#officesDots');
    var search = $('#officeSearch');
    var chips = $('#officeChips');
    var count = $('#officeCount');

    var regions = ['All'];
    ['Jawa', 'Sumatra', 'Kalimantan', 'Sulawesi', 'Maluku', 'Papua', 'Nusa Tenggara'].forEach(function (r) {
      if (offices.some(function (o) { return o.region === r; })) regions.push(r);
    });

    function mapQuery(o) {
      return 'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(o.address + ' ' + o.city + ' Indonesia');
    }

    function card(o, i) {
      var alias = o.alias ? ' <span class="oc-alias">(' + esc(o.alias) + ')</span>' : '';
      return '<article class="office-card reveal" id="office-' + i + '" data-region="' + esc(o.region) + '" ' +
        'data-city="' + esc(o.city.toLowerCase()) + (o.alias ? ' ' + esc(o.alias.toLowerCase()) : '') + '" ' +
        'data-address="' + esc(o.address.toLowerCase()) + '">' +
        '<div class="oc-head"><h3>' + esc(o.city) + alias + '</h3>' +
        '<span class="oc-region">' + esc(o.region) + '</span></div>' +
        (o.headquarters ? '<span class="oc-hq">Headquarters</span>' : '') +
        '<address>' + esc(o.address) + '</address>' +
        '<div class="oc-rows">' +
        (o.phone1 ? '<div class="oc-row"><span class="k">Tel</span><a href="tel:' + esc(o.phone1.replace(/[^+\d]/g, '')) + '">' + esc(o.phone1) + '</a></div>' : '') +
        (o.phone2 ? '<div class="oc-row"><span class="k">Tel</span><a href="tel:' + esc(o.phone2.replace(/[^+\d]/g, '')) + '">' + esc(o.phone2) + '</a></div>' : '') +
        '<div class="oc-row"><span class="k">Mail</span><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a></div>' +
        '</div>' +
        '<a class="oc-map" href="' + mapQuery(o) + '" target="_blank" rel="noopener">Directions' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7m0 0H8m9 0v9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></a>' +
        '</article>';
    }

    grid.innerHTML = offices.map(card).join('');

    // Map dots. The land SVG is rendered with preserveAspectRatio="xMidYMid slice",
    // so dot positions must mirror the slice transform: scale to cover the panel,
    // then centre-crop the 1920×764 projection to the panel box.
    if (dots) {
      dots.innerHTML = offices.map(function (o, i) {
        // The reference map labels the Tangkian terminal (the LUWUK office)
        // by its terminal name; keep Morowali's public city label intact even
        // though its office record uses Bungku as an alias.
        var mapName = o.headquarters ? o.city + ' (Head Office)' :
          (o.city === 'LUWUK' && o.alias ? o.alias : o.city);
        return '<button type="button" class="o-dot' + (o.headquarters ? ' hq' : '') + '" ' +
          'data-idx="' + i + '" data-region="' + esc(o.region) + '" ' +
          'aria-label="' + esc(mapName) + ' office" title="' + esc(mapName) + '">' +
          '<span class="o-dot-label">' + esc(mapName) + '</span></button>';
      }).join('');
      var dotEls = $all('.o-dot', dots);
      function layoutDots() {
        var box = dots.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var scale = Math.max(box.width / MAP_W, box.height / MAP_H);
        var cropW = box.width / scale, cropH = box.height / scale;
        var offX = (MAP_W - cropW) / 2, offY = (MAP_H - cropH) / 2;
        offices.forEach(function (o, i) {
          var d = dotEls[i];
          if (!d) return;
          var p = officeMapPoint(o);
          d.style.left = ((p.x - offX) / cropW * 100).toFixed(3) + '%';
          d.style.top = ((p.y - offY) / cropH * 100).toFixed(3) + '%';
        });
      }
      layoutDots();
      var rT;
      window.addEventListener('resize', function () {
        clearTimeout(rT);
        rT = setTimeout(layoutDots, 120);
      });
      $all('.o-dot', dots).forEach(function (d) {
        d.addEventListener('click', function () {
          var cardEl = document.getElementById('office-' + d.getAttribute('data-idx'));
          if (!cardEl) return;
          cardEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
          cardEl.classList.add('flash');
          setTimeout(function () { cardEl.classList.remove('flash'); }, 1600);
        });
        d.addEventListener('mouseenter', function () {
          var cardEl = document.getElementById('office-' + d.getAttribute('data-idx'));
          if (cardEl) cardEl.classList.add('hot');
        });
        d.addEventListener('mouseleave', function () {
          var cardEl = document.getElementById('office-' + d.getAttribute('data-idx'));
          if (cardEl) cardEl.classList.remove('hot');
        });
      });
    }

    if (count) count.textContent = offices.length + ' locations · ' + (regions.length - 1) + ' regions';

    // Region filter chips
    var activeRegion = 'All';
    if (chips) {
      chips.innerHTML = regions.map(function (r) {
        return '<button type="button" class="' + (r === 'All' ? 'on' : '') + '" data-region="' + esc(r) + '">' + esc(r) + '</button>';
      }).join('');
      $all('button', chips).forEach(function (b) {
        b.addEventListener('click', function () {
          activeRegion = b.getAttribute('data-region');
          $all('button', chips).forEach(function (x) { x.classList.toggle('on', x === b); });
          apply();
        });
      });
    }

    function apply() {
      var q = search && search.value ? search.value.trim().toLowerCase() : '';
      var shown = 0;
      offices.forEach(function (o, i) {
        var cardEl = document.getElementById('office-' + i);
        var dot = dots && dots.querySelector('.o-dot[data-idx="' + i + '"]');
        var okRegion = activeRegion === 'All' || o.region === activeRegion;
        var okQ = !q || cardEl.dataset.city.indexOf(q) !== -1 || cardEl.dataset.address.indexOf(q) !== -1;
        var show = okRegion && okQ;
        cardEl.hidden = !show;
        if (dot) dot.classList.toggle('dim', !show);
        if (show) shown++;
      });
      var none = $('#officeNone');
      if (none) none.hidden = shown !== 0;
    }
    if (search) search.addEventListener('input', apply);
  }

  /* ---------------- /news/ — category filter ---------------- */
  function initNewsFilter() {
    var chips = $('#newsChips');
    if (!chips) return;
    var items = $all('#newsItems .news-row');
    $all('button', chips).forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-type');
        $all('button', chips).forEach(function (x) { x.classList.toggle('on', x === b); });
        items.forEach(function (it) {
          it.hidden = f !== 'all' && it.getAttribute('data-type') !== f;
        });
      });
    });
  }

  /* ---------------- /equipment/ — 20' / 40' spec viewer ---------------- */
  var EQ_DATA = {
    '20': [
      ['Interior — length', '5.80 m'],
      ['Interior — width', '2.35 m'],
      ['Interior — height', '2.38 m'],
      ['Max payload', '22.5 t'],
      ['Container weight', '2.5 t'],
      ['Max gross weight', '25 t']
    ],
    '40': [
      ['Interior — length', '11.60 m'],
      ['Interior — width', '2.35 m'],
      ['Interior — height', '2.38 m'],
      ['Max payload', '20 t'],
      ['Container weight', '5 t'],
      ['Max gross weight', '25 t']
    ]
  };

  function initEqViewer() {
    var tabs = $('#eqTabs');
    var body = $('#eqBody');
    if (!tabs || !body) return;
    function show(size) {
      $all('button', tabs).forEach(function (b) {
        var on = b.getAttribute('data-size') === size;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', String(on));
      });
      body.innerHTML = EQ_DATA[size].map(function (row) {
        return '<tr class="reveal"><td data-label="Specification">' + esc(row[0]) + '</td><td data-label="Value" class="eq-val">' + esc(row[1]) + '</td></tr>';
      }).join('');
      var cap = $('#eqCap');
      if (cap) cap.textContent = size + ' standard ISO container — ' + (size === '20' ? '20 foot' : '40 foot');
    }
    $all('button', tabs).forEach(function (b, i) {
      b.addEventListener('click', function () { show(b.getAttribute('data-size')); });
      b.addEventListener('keydown', function (e) {
        var j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % 2;
        if (e.key === 'ArrowLeft') j = (i + 1) % 2;
        if (j != null) { e.preventDefault(); tabs.querySelectorAll('button')[j].focus(); show(tabs.querySelectorAll('button')[j].getAttribute('data-size')); }
      });
    });
    show('20');
  }

  /* ---------------- /privacy/ — EN / ID toggle ---------------- */
  function initPrivTabs() {
    var tabs = $('#privTabs');
    if (!tabs) return;
    $all('button', tabs).forEach(function (b) {
      b.addEventListener('click', function () {
        var lang = b.getAttribute('data-lang');
        $all('button', tabs).forEach(function (x) {
          var on = x === b;
          x.classList.toggle('on', on);
          x.setAttribute('aria-selected', String(on));
        });
        $('#privEn').hidden = lang !== 'en';
        $('#privId').hidden = lang !== 'id';
      });
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    initRouteTable();
    initScheduleTables();
    initOffices();
    initNewsFilter();
    initEqViewer();
    initPrivTabs();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
