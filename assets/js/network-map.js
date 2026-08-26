/* ============================================================
   TANTO — network-map.js
   "The Tanto Network" — flagship interactive map.

   - Pure SVG + rAF (no map library). Land geometry is inlined
     in the page (assets/map/indonesia-land.svg source).
   - Route/port data comes from data/network.json (generated
     data/network.js) — visualization and source data are
     deliberately separate.
   - Route search resolves the FULL transit chain over the
     published service graph (hops through transshipment hubs),
     e.g. Makassar → Surabaya → Batam, drawn as one continuous
     luminous yellow line.
   - Reveal: on first viewport entry every route draws itself in
     one staggered west → east wave and the ports fade in — no
     narrative intro. Never traps scroll; instant under
     prefers-reduced-motion or on small screens.
   - Exit: as the pinned stage releases, the map pulls back
     (scale + fade) so the hand-off to the next section feels
     intentional.
   ============================================================ */
(function () {
  'use strict';

  var NETWORK = window.TANTO_NETWORK;
  var world = document.getElementById('mapWorld');
  if (!NETWORK || !world) return;

  var ports = NETWORK.ports || [];
  var routes = NETWORK.routes || [];
  var byId = {};
  ports.forEach(function (p) { byId[p.id] = p; });

  var stage = document.querySelector('.network-stage');
  var mapFrame = document.querySelector('.map-frame');
  var viewport = document.getElementById('mapViewport');
  var routesG = document.getElementById('mapRoutesG');
  var portsG = document.getElementById('mapPortsG');
  var selG = document.getElementById('mapSelG');
  if (!selG && routesG && portsG) {
    selG = svg('g', { id: 'mapSelG' });
    routesG.parentNode.insertBefore(selG, portsG);
  }
  var vesselDot = document.getElementById('mapVessel');
  var tip = document.getElementById('mapTip');
  var routeInfo = document.getElementById('mapRouteInfo');
  var sheet = document.getElementById('mapSheet');
  var storyEl = document.getElementById('mapStory'); // legacy intro overlay (hidden; markup may be absent)

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = function () { return window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches; };

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* ---------- geometry ---------- */
  function curve(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.hypot(dx, dy) || 1;
    var nx = -dy / dist, ny = dx / dist;          // left-normal of travel
    var bow = dist * 0.16;
    var mx = (a.x + b.x) / 2 + nx * bow;
    var my = (a.y + b.y) / 2 + ny * bow;
    return 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) +
           ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' +
           b.x.toFixed(1) + ' ' + b.y.toFixed(1);
  }

  /* ---------- build routes (published base network) ---------- */
  var routePaths = [];   // { route, els: [] }
  var portConnections = {}; // id -> [{from, freq, via}]
  routes.forEach(function (r) {
    (portConnections[r.to] = portConnections[r.to] || []).push(r);
  });

  routes.forEach(function (r) {
    var A = byId[r.from], B = byId[r.to];
    if (!A || !B) return;
    var entry = { route: r, els: [] };
    if (r.via) {
      var V = byId[r.via];
      if (!V) return;
      var s1 = svg('path', { d: curve(A, V), class: 'map-route via' });
      var s2 = svg('path', { d: curve(V, B), class: 'map-route via' });
      routesG.appendChild(s1); routesG.appendChild(s2);
      entry.els = [s1, s2];
    } else {
      var p = svg('path', { d: curve(A, B), class: 'map-route' });
      routesG.appendChild(p);
      entry.els = [p];
    }
    routePaths.push(entry);
  });

  /* Inland offices are represented as ports for search and interaction, but
     do not have a published maritime route in the schedule data. Keep that
     distinction clear while still showing the requested illustrative link
     from the Surabaya gateway to POSO. These paths stay out of routePaths so
     they are never presented as a selectable direct service or dimmed as
     part of a maritime result. */
  var inlandConnectors = [{ from: 'SBY', to: 'PSO' }];
  inlandConnectors.forEach(function (connectorDef) {
    var A = byId[connectorDef.from], B = byId[connectorDef.to];
    if (!A || !B) return;
    var connector = svg('path', {
      d: curve(A, B),
      class: 'map-route inland',
      'data-from': connectorDef.from,
      'data-to': connectorDef.to,
      'aria-hidden': 'true'
    });
    routesG.appendChild(connector);
  });

  /* ---------- service graph (for transit-chain routing) ----------
     Every published service becomes an edge between its endpoints,
     carrying the full call sequence (origin → via → destination).
     Transshipment services also expose each leg (origin→via,
     via→destination) so freight can transfer at the via port —
     exactly how "transits via X" operates.
     Edge cost = one service change; ties broken by higher
     published frequency, so trunk routes (e.g. SBY–MKS) win.   */
  var edges = [];   // {a, b, seq:[ids], freqMid, region, direct, label}
  function addEdge(a, b, seq, freqMid, region, direct, label) {
    edges.push({ a: a, b: b, seq: seq, freqMid: freqMid, region: region, direct: direct, label: label });
  }
  routes.forEach(function (r) {
    if (!byId[r.from] || !byId[r.to]) return;
    var seq = [r.from];
    if (r.via && byId[r.via]) seq.push(r.via);
    seq.push(r.to);
    var mid = (r.freqMin + r.freqMax) / 2;
    var label = r.freqMin > 0 ? r.freq.replace(' times', '') + '\u00d7/mo' : 'transfer';
    if (seq.length === 2) {
      addEdge(r.from, r.to, seq, mid, r.region, true, label);
    } else {
      addEdge(r.from, r.to, seq, mid, r.region, false, 'transfer'); // full service
      for (var i = 0; i + 1 < seq.length; i++) {
        addEdge(seq[i], seq[i + 1], [seq[i], seq[i + 1]], 0, r.region, false, 'transfer'); // transfer leg
      }
    }
  });
  var adj = {};
  ports.forEach(function (p) { adj[p.id] = []; });
  edges.forEach(function (e, i) { adj[e.a].push(i); adj[e.b].push(i); });

  /* Shortest service chain between two ports (Dijkstra, 33 nodes). */
  function findChain(fromId, toId) {
    if (!byId[fromId] || !byId[toId] || fromId === toId) return null;
    var INF = Infinity;
    var dist = {}, prev = {}, done = {};
    ports.forEach(function (p) { dist[p.id] = INF; prev[p.id] = null; });
    dist[fromId] = 0;
    for (var iter = 0; iter < ports.length; iter++) {
      var u = null, best = INF;
      for (var id in dist) {
        if (!done[id] && dist[id] < best) { best = dist[id]; u = id; }
      }
      if (u === null) break;
      if (u === toId) break;
      done[u] = true;
      (adj[u] || []).forEach(function (ei) {
        var e = edges[ei];
        var v = e.a === u ? e.b : e.a;
        if (done[v]) return;
        var c = dist[u] + 1000 - e.freqMid;
        if (c < dist[v]) { dist[v] = c; prev[v] = { node: u, edge: e }; }
      });
    }
    if (dist[toId] === INF) return null;
    var chainEdges = [];
    var cur = toId;
    while (prev[cur]) { chainEdges.unshift(prev[cur].edge); cur = prev[cur].node; }
    var chain = [fromId];
    chainEdges.forEach(function (e) {
      var last = chain[chain.length - 1];
      var seq = (e.a === last) ? e.seq : e.seq.slice().reverse();
      for (var i = 1; i < seq.length; i++) chain.push(seq[i]);
    });
    return { chain: chain, edges: chainEdges };
  }


  /* ---------- build ports ---------- */
  var portNodes = {};
  ports.forEach(function (p) {
    var g = svg('g', {
      class: 'map-port' + (p.hub ? ' hub' : ''),
      'data-id': p.id,
      tabindex: '0',
      role: 'button',
      'aria-label': p.name + ', ' + p.region + (p.headquarters ? ' — head office' : '')
    });
    g.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')');
    // Keep the visual marker precise while giving touch users a comfortable
    // target on the compact mobile map.
    g.appendChild(svg('circle', { class: 'p-hit', r: 16, fill: 'transparent', 'pointer-events': 'all' }));
    if (p.hub) g.appendChild(svg('circle', { class: 'p-halo', r: 13 }));
    g.appendChild(svg('circle', { class: 'p-core', r: p.hub ? 5.4 : 3.6 }));
    // Labels: Surabaya & Jakarta stay on by default; every other port's name
    // is hidden until it is picked as a FROM/TO endpoint (see setEndpointLabels).
    var label = svg('text', {
      class: 'map-port-label' + (p.id === 'SBY' || p.id === 'JKT' ? ' on' : ''),
      x: 0, y: p.hub ? -18 : -14, 'text-anchor': 'middle'
    });
    label.textContent = p.name;
    g.appendChild(label);
    portsG.appendChild(g);
    portNodes[p.id] = g;
  });

  /* ---------- port details ---------- */
  function portDetail(p) {
    var conns = portConnections[p.id] || [];
    var from = [];
    var freq = '—';
    if (conns.length) {
      conns.forEach(function (c) {
        var viaTxt = c.via ? ' (via ' + byId[c.via].name + ')' : '';
        if (c.freqMin > 0) freq = c.freq + '/mo';
        from.push(byId[c.from].name + ' ' + (c.freqMin > 0 ? c.freq + '/mo' : '') + viaTxt);
      });
      // fallback: if no direct freq, show via services
      if (from.length && conns.every(function (c) { return c.freqMin === 0; })) freq = 'transshipment';
    } else {
      from.push('Surabaya · Jakarta gateways');
    }
    var direct = conns.some(function (c) { return !c.via && c.freqMin > 0; });
    return {
      name: p.name,
      region: p.region,
      from: from.join(' · ') || '—',
      freq: freq,
      routing: direct ? 'Direct service' : (conns.length ? 'Via transshipment' : 'Served from main gateways')
    };
  }

  /* ---------- tooltip (desktop) ---------- */
  var lockedPort = null;
  function showTip(p) {
    var d = portDetail(p);
    tip.innerHTML =
      '<h3>' + esc(d.name) + ' <span class="region">' + esc(d.region) + '</span></h3>' +
      '<dl>' +
      '<div><dt>Connected from</dt><dd>' + esc(d.from) + '</dd></div>' +
      '<div><dt>Frequency</dt><dd>' + esc(d.freq) + '</dd></div>' +
      '<div><dt>Routing</dt><dd>' + esc(d.routing) + '</dd></div>' +
      '</dl>' +
      '<a class="tip-cta" href="/schedules/">View schedule <span aria-hidden="true">→</span></a>';
    var node = portNodes[p.id];
    var rect = node.getBoundingClientRect();
    var vrect = viewport.getBoundingClientRect();
    tip.classList.add('show');
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = rect.left - vrect.left + rect.width / 2 - tw / 2;
    left = Math.max(12, Math.min(left, vrect.width - tw - 12));
    var top = rect.top - vrect.top - th - 16;
    if (top < 8) top = rect.bottom - vrect.top + 16;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() {
    if (lockedPort) return;
    tip.classList.remove('show');
  }

  /* ---------- bottom sheet (mobile) ---------- */
  function openSheet(title, region, rows, ctaHref) {
    document.getElementById('sheetName').textContent = title;
    document.getElementById('sheetRegion').textContent = region;
    rows.forEach(function (r) {
      var dd = document.getElementById(r.id);
      if (dd) dd.textContent = r.value;
    });
    var cta = document.getElementById('sheetCta');
    cta.href = ctaHref || '/schedules/';
    sheet.classList.add('show');
  }
  function closeSheet() { sheet.classList.remove('show'); }
  document.getElementById('sheetClose').addEventListener('click', closeSheet);

  /* ---------- port interaction ---------- */
  ports.forEach(function (p) {
    var node = portNodes[p.id];
    node.addEventListener('mouseenter', function () { if (!mobile()) showTip(p); });
    node.addEventListener('mouseleave', function () { hideTip(); });
    node.addEventListener('focus', function () { if (!mobile()) showTip(p); });
    node.addEventListener('blur', function () { hideTip(); });
    function activate() {
      if (mobile()) {
        var d = portDetail(p);
        openSheet(d.name, d.region, [
          { id: 'sheetFrom', value: d.from },
          { id: 'sheetFreq', value: d.freq },
          { id: 'sheetVia', value: d.routing }
        ]);
      } else if (lockedPort === p.id) {
        lockedPort = null;
        node.classList.remove('active');
        hideTip();
      } else {
        if (lockedPort && portNodes[lockedPort]) portNodes[lockedPort].classList.remove('active');
        lockedPort = p.id;
        node.classList.add('active');
        showTip(p);
      }
    }
    node.addEventListener('click', activate);
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });
  document.addEventListener('click', function (e) {
    if (lockedPort && !e.target.closest('.map-port') && !e.target.closest('.map-tip')) {
      var node = portNodes[lockedPort];
      if (node) node.classList.remove('active');
      lockedPort = null;
      tip.classList.remove('show');
    }
  });

  /* ---------- route search (full transit chain) ---------- */
  var selFrom = document.getElementById('mapFrom');
  var selTo = document.getElementById('mapTo');
  var goBtn = document.getElementById('mapGo');
  var clearBtn = document.getElementById('mapClear');
  var swapBtn = document.getElementById('mapSwap');

  /* Custom dropdowns (in-page listbox). Native <select> popups are unreliable
     in Chrome inside this sticky / backdrop-filter stage, so FROM/TO use an
     accessible combobox. Each keeps a .value property and dispatches a
     bubbling 'change' event, so the route logic below works unchanged. */
  function closeDDs() {
    [selFrom, selTo].forEach(function (dd) {
      if (dd.classList.contains('open')) {
        dd.classList.remove('open');
        dd.setAttribute('aria-expanded', 'false');
        dd.querySelector('.dd-list').style.left = '';
        dd.querySelectorAll('.dd-list li.active').forEach(function (li) { li.classList.remove('active'); });
      }
    });
  }
  function makeDD(root) {
    var list = root.querySelector('.dd-list');
    var val = root.querySelector('.dd-val');
    var value = '';
    var active = -1;
    function items() { return list.querySelectorAll('li'); }
    function render() {
      val.textContent = value ? byId[value].name : '—';
      val.classList.toggle('empty', !value);
      items().forEach(function (li) {
        li.setAttribute('aria-selected', li.dataset.id === value ? 'true' : 'false');
      });
    }
    function setActive(i) {
      var its = items();
      its.forEach(function (li) { li.classList.remove('active'); });
      active = (i < 0 || i >= its.length) ? -1 : i;
      if (active > -1) {
        its[active].classList.add('active');
        its[active].scrollIntoView({ block: 'nearest' });
      }
    }
    function open() {
      closeDDs();
      root.classList.add('open');
      root.setAttribute('aria-expanded', 'true');
      var its = items();
      var start = 0;
      its.forEach(function (li, i) { if (li.dataset.id === value) start = i; });
      setActive(start);
      requestAnimationFrame(function () {
        var lr = list.getBoundingClientRect();
        var over = lr.right - (window.innerWidth - 10);
        if (over > 0) list.style.left = (-over) + 'px';
      });
    }
    function close() {
      root.classList.remove('open');
      root.setAttribute('aria-expanded', 'false');
      list.style.left = '';
      setActive(-1);
    }
    function pick(id) {
      var changed = id !== value;
      value = id;
      render();
      close();
      root.focus();
      if (changed) root.dispatchEvent(new Event('change', { bubbles: true }));
    }
    ports.forEach(function (p) {
      var li = document.createElement('li');
      li.dataset.id = p.id;
      li.textContent = p.name;
      li.setAttribute('role', 'option');
      li.addEventListener('click', function (e) { e.stopPropagation(); pick(p.id); });
      list.appendChild(li);
    });
    root.addEventListener('click', function (e) {
      if (e.target.closest('.dd-list')) return; // list items handle their own click
      if (root.classList.contains('open')) close(); else open();
    });
    root.addEventListener('keydown', function (e) {
      var its = items();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!root.classList.contains('open')) { open(); return; }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          if (active > -1) pick(its[active].dataset.id);
          return;
        }
        var next = active + (e.key === 'ArrowDown' ? 1 : -1);
        if (next < 0) next = its.length - 1;
        if (next >= its.length) next = 0;
        setActive(next);
      } else if (e.key === 'Escape') {
        if (root.classList.contains('open')) { e.preventDefault(); close(); }
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        if (root.classList.contains('open')) setActive(e.key === 'Home' ? 0 : its.length - 1);
      } else if (e.key === 'Tab') {
        close();
      } else if (/^[a-zàáâãäçèéêëìíîïñòóôõöùúûü]$/.test(e.key)) {
        // Typeahead: jump to the first option starting with that letter
        if (!root.classList.contains('open')) open();
        for (var i = 0; i < its.length; i++) {
          var idx = (active + 1 + i) % its.length;
          if (its[idx].textContent.toLowerCase().charAt(0) === e.key.toLowerCase()) { setActive(idx); break; }
        }
      }
    });
    Object.defineProperty(root, 'value', {
      get: function () { return value; },
      set: function (v) { value = v || ''; render(); }
    });
    render();
  }
  makeDD(selFrom);
  makeDD(selTo);
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.dd')) closeDDs();
  });

  swapBtn.addEventListener('click', function () {
    var a = selFrom.value;
    selFrom.value = selTo.value;
    selTo.value = a;
  });

  var voyage = null; // active rAF
  function stopVoyage() {
    if (voyage) { cancelAnimationFrame(voyage); voyage = null; }
    vesselDot.setAttribute('visibility', 'hidden');
  }

  /* ---------- endpoint labels ----------
     Default state: only Surabaya + Jakarta are named on the map. When a port
     is selected as FROM or TO, its name fades in above the point; clearing the
     selection fades it back out (transit ports stay unlabelled). */
  var DEFAULT_LABELS = { SBY: true, JKT: true };
  function setEndpointLabels(fromId, toId) {
    ports.forEach(function (p) {
      var node = portNodes[p.id];
      var label = node && node.querySelector('.map-port-label');
      if (label) label.classList.toggle('on', !!DEFAULT_LABELS[p.id] || p.id === fromId || p.id === toId);
    });
  }

  function clearSelection() {
    stopVoyage();
    while (selG && selG.firstChild) selG.removeChild(selG.firstChild);
    routePaths.forEach(function (rp) {
      rp.els.forEach(function (el2) { el2.classList.remove('dim'); });
    });
    ports.forEach(function (p) {
      var n = portNodes[p.id];
      n.classList.remove('dim', 'chain-end');
    });
    setEndpointLabels(null, null);
    routeInfo.classList.remove('show');
    closeSheet();
    clearBtn.hidden = true;
  }

  function chainHtml(chain) {
    return chain.map(function (id, i) {
      var name = byId[id].name;
      if (i === 0 || i === chain.length - 1) return esc(name);
      return '<span class="via-port">' + esc(name) + '</span>';
    }).join(' <span class="arrow">→</span> ');
  }

  function selectRoute(fromId, toId) {
    var A = byId[fromId], B = byId[toId];
    if (!A || !B) return;
    setEndpointLabels(fromId, toId);
    var result = findChain(fromId, toId);
    stopVoyage();
    while (selG && selG.firstChild) selG.removeChild(selG.firstChild);
    ports.forEach(function (p) {
      portNodes[p.id].classList.remove('dim', 'chain-end');
    });
    routePaths.forEach(function (rp) {
      rp.els.forEach(function (el2) { el2.classList.toggle('dim', !!result); });
    });

    if (!result) {
      clearBtn.hidden = false;
      var html =
        '<div class="mri-route">' + esc(A.name) + ' <span class="arrow">→</span> ' + esc(B.name) + '</div>' +
        '<div class="mri-note">No published frequent service between these ports yet.</div>' +
        '<div class="mri-cta"><a class="btn btn-azure btn-sm" href="/schedules/?from=' + fromId + '&to=' + toId + '">Check live schedule</a>' +
        '<a class="btn btn-ghost-light btn-sm" href="/contact/">Contact the office</a></div>';
      routeInfo.innerHTML = html;
      routeInfo.classList.toggle('show', !mobile());
      if (mobile()) {
        openSheet(A.name + ' → ' + B.name, 'No published frequent service', [
          { id: 'sheetFrom', value: 'Check the live schedule or contact the office' },
          { id: 'sheetFreq', value: '—' },
          { id: 'sheetVia', value: '—' }
        ], '/schedules/?from=' + fromId + '&to=' + toId);
      }
      return;
    }

    var chain = result.chain;
    var inChain = {};
    chain.forEach(function (id) { inChain[id] = true; });

    // Draw the selected route as one continuous luminous line.
    var segs = [];
    for (var i = 0; i + 1 < chain.length; i++) {
      var P = byId[chain[i]], Q = byId[chain[i + 1]];
      var path = svg('path', { d: curve(P, Q), class: 'map-sel' });
      selG.appendChild(path);
      segs.push(path);
    }
    ports.forEach(function (p) {
      var n = portNodes[p.id];
      n.classList.toggle('dim', !inChain[p.id]);
      n.classList.toggle('chain-end', p.id === fromId || p.id === toId);
    });
    clearBtn.hidden = false;

    // Info: full chain + per-leg frequency + routing.
    var viaPorts = chain.slice(1, -1).map(function (id) { return byId[id].name; });
    var routingTxt = viaPorts.length ? 'Via ' + viaPorts.join(' · ') : 'Direct';
    var freqTxt = result.edges.map(function (e) { return e.label; }).join(' · ');
    var regionTxt = (!viaPorts.length && result.edges[0] && result.edges[0].direct) ? ' · ' + result.edges[0].region : '';
    var html =
      '<div class="mri-route">' + chainHtml(chain) + '</div>' +
      '<div class="mri-meta">' +
      '<span>Frequency<b>' + esc(freqTxt) + '</b></span>' +
      '<span>Routing<b>' + esc(routingTxt) + esc(regionTxt) + '</b></span>' +
      '</div>' +
      '<div class="mri-cta"><a class="btn btn-azure btn-sm" href="/schedules/?from=' + fromId + '&to=' + toId + '">View full schedule</a></div>';
    routeInfo.innerHTML = html;
    routeInfo.classList.toggle('show', !mobile());
    if (mobile()) {
      openSheet(A.name + ' → ' + B.name, routingTxt, [
        { id: 'sheetFrom', value: chain.map(function (id) { return byId[id].name; }).join(' · ') },
        { id: 'sheetFreq', value: freqTxt },
        { id: 'sheetVia', value: viaPorts.length ? 'Transits ' + viaPorts.length + ' port' + (viaPorts.length > 1 ? 's' : '') : 'Direct connection' }
      ], '/schedules/?from=' + fromId + '&to=' + toId);
    }

    // Voyage dot along the selected geometry.
    var lens = segs.map(function (s) { return s.getTotalLength(); });
    var total = lens.reduce(function (a, b) { return a + b; }, 0);
    var D = reduced ? 0 : 5200; // ms per traversal
    var t0 = performance.now();
    function frame(now) {
      var t = D ? ((now - t0) % D) / D : 0;
      var target = t * total;
      var i = 0;
      while (i < segs.length - 1 && target > lens[i]) { target -= lens[i]; i++; }
      var pt = segs[i].getPointAtLength(target);
      var lookAhead = Math.min(lens[i], target + 6);
      var ahead = segs[i].getPointAtLength(lookAhead);
      var angle = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI;
      vesselDot.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ') rotate(' + angle.toFixed(1) + ')');
      vesselDot.setAttribute('visibility', 'visible');
      voyage = requestAnimationFrame(frame);
    }
    if (!reduced) { vesselDot.setAttribute('visibility', 'visible'); voyage = requestAnimationFrame(frame); }
  }

  goBtn.addEventListener('click', function () {
    if (!selFrom.value || !selTo.value || selFrom.value === selTo.value) {
      if (!mobile()) {
        routeInfo.innerHTML = '<div class="mri-route">Select two different ports to show the route.</div>';
        routeInfo.classList.add('show');
      }
      return;
    }
    selectRoute(selFrom.value, selTo.value);
  });
  [selFrom, selTo].forEach(function (s) {
    s.addEventListener('change', function () {
      if (selFrom.value && selTo.value && selFrom.value !== selTo.value) selectRoute(selFrom.value, selTo.value);
      else clearSelection();
    });
  });
  clearBtn.addEventListener('click', clearSelection);

  /* ---------- exit: camera pull-back as the stage releases ---------- */
  function updateExit() {
    if (!mapFrame || reduced || mobile() || !stage) return;
    var st = stage.getBoundingClientRect();
    var vh = window.innerHeight;
    if (st.bottom < -60 || st.top > vh + 60) {
      mapFrame.style.transform = '';
      mapFrame.style.opacity = '';
      return;
    }
    var p = clamp01(-st.top / st.height);
    if (p <= 0) {
      mapFrame.style.transform = '';
      mapFrame.style.opacity = '';
      return;
    }
    mapFrame.style.transform = 'scale(' + (1 - 0.10 * p).toFixed(4) + ')';
    mapFrame.style.opacity = (1 - 0.55 * p).toFixed(3);
  }
  var exitQueued = false;
  function queueExit() {
    if (exitQueued) return;
    exitQueued = true;
    requestAnimationFrame(function () { exitQueued = false; updateExit(); });
  }
  if (window.TANTO_MOTION && window.TANTO_MOTION.subscribe) {
    window.TANTO_MOTION.subscribe(function () { updateExit(); });
  } else {
    window.addEventListener('scroll', queueExit, { passive: true });
    window.addEventListener('resize', queueExit, { passive: true });
  }

  /* ---------- network reveal ----------
     No narrative intro: the first time the section enters the viewport,
     every published route draws itself in one staggered west → east wave
     while the ports fade in, and the map settles centred — straight into
     interactive mode. Reduced motion / mobile: shown instantly. */
  var revealed = false;
  var revealTimers = [];

  function panMax() {
    var wr = world.getBoundingClientRect();
    var vr = viewport.getBoundingClientRect();
    return Math.max(0, wr.width - vr.width);
  }
  function panTo(frac, ms) {
    world.style.transition = reduced ? 'none' : 'transform ' + (ms || 1600) + 'ms cubic-bezier(.22,1,.36,1)';
    world.style.transform = 'translateX(' + (-frac * panMax()).toFixed(1) + 'px)';
  }

  /* Show the whole network at once (reduced motion / mobile / fallback). */
  function showAll() {
    if (storyEl) storyEl.style.display = 'none';
    routePaths.forEach(function (rp) {
      rp.els.forEach(function (el2) {
        el2.style.transition = 'none';
        el2.style.strokeDasharray = 'none';
        el2.style.strokeDashoffset = '';
        el2.style.opacity = '';
      });
    });
    ports.forEach(function (p) {
      var core = portNodes[p.id] && portNodes[p.id].querySelector('.p-core');
      if (core) { core.classList.remove('pop'); core.style.animationDelay = ''; core.style.opacity = ''; }
    });
    panTo(0.5, 0);
  }

  function revealNetwork() {
    if (revealed) return;
    revealed = true;
    if (storyEl) storyEl.style.display = 'none';
    if (reduced || mobile()) { showAll(); return; }
    panTo(0.5, 0);

    // One west → east wave across every published route.
    var ordered = routePaths
      .map(function (rp) { return { rp: rp, x: byId[rp.route.from].x }; })
      .sort(function (a, b) { return a.x - b.x; });
    ordered.forEach(function (o, k) {
      var delay = k * 0.028;
      o.rp.els.forEach(function (el2, j) {
        if (el2.classList.contains('via')) {
          el2.style.transition = 'none';
          el2.style.opacity = '0';
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            el2.style.transition = 'opacity .9s ease ' + (delay + j * 0.1) + 's';
            el2.style.opacity = '';
          }); });
          revealTimers.push(setTimeout(function () { el2.style.transition = ''; }, 1100 + (delay + j * 0.1) * 1000));
        } else {
          var L = el2.getTotalLength();
          el2.style.transition = 'none';
          el2.style.strokeDasharray = L;
          el2.style.strokeDashoffset = L;
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            el2.style.transition = 'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1) ' + delay + 's';
            el2.style.strokeDashoffset = '0';
          }); });
          revealTimers.push(setTimeout(function () {
            el2.style.strokeDasharray = 'none';
            el2.style.strokeDashoffset = '';
            el2.style.transition = '';
          }, 1500 + delay * 1000));
        }
      });
    });

    // Ports fade in, west → east, just behind the wave.
    var portsOrdered = ports.slice().sort(function (a, b) { return a.x - b.x; });
    portsOrdered.forEach(function (p, i) {
      var core = portNodes[p.id] && portNodes[p.id].querySelector('.p-core');
      if (!core) return;
      core.classList.add('pop');
      core.style.animationDelay = (0.15 + i * 0.018) + 's';
      revealTimers.push(setTimeout(function () {
        core.classList.remove('pop');
        core.style.animationDelay = '';
      }, 900 + (0.15 + i * 0.018) * 1000));
    });
  }

  // Pre-draw state: routes hidden until the first reveal.
  if (!reduced && !mobile()) {
    routePaths.forEach(function (rp) {
      rp.els.forEach(function (el2) {
        if (el2.classList.contains('via')) el2.style.opacity = '0';
        else {
          var L = el2.getTotalLength();
          el2.style.strokeDasharray = L;
          el2.style.strokeDashoffset = L;
        }
      });
    });
    if ('IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            seen.disconnect();
            revealTimers.push(setTimeout(revealNetwork, 350));
          }
        });
      }, { threshold: 0.35 });
      seen.observe(document.querySelector('.network-scroll'));
    } else {
      revealNetwork();
    }
  } else {
    if (storyEl) storyEl.style.display = 'none';
    showAll();
  }

  // keep tooltip position sane on scroll/resize
  function refreshTooltip() {
    if (tip && tip.classList.contains('show') && lockedPort) {
      var p = byId[lockedPort];
      if (p) showTip(p);
    }
  }
  if (window.TANTO_MOTION && window.TANTO_MOTION.subscribe) window.TANTO_MOTION.subscribe(refreshTooltip);
  else window.addEventListener('scroll', refreshTooltip, { passive: true });
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (lockedPort && tip && tip.classList.contains('show')) showTip(byId[lockedPort]);
      if (!revealed) panTo(0.5, 0);
    }, 150);
  }, { passive: true });
})();
