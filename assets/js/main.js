/* ============================================================
   TANTO — main.js
   Navigation · reveals · stats · fleet · command bar ·
   customer stories · news · heritage · journey scroll
   ============================================================ */
(function () {
  'use strict';

  var CONTENT = window.TANTO_CONTENT || {};
  var NETWORK = window.TANTO_NETWORK || { ports: [], routes: [] };
  var FLEET = window.TANTO_FLEET || { classes: [], categories: [] };

  /* GSAP plugins — ScrollTrigger drives the cinematic journey scroll.
     Must be registered before any timeline is built with scrollTrigger config. */
  if (window.gsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isCoarse = window.matchMedia('(pointer: coarse)').matches;
  var isNarrow = window.matchMedia('(max-width: 900px)').matches;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'href' || k === 'target' || k === 'rel') n.setAttribute(k, attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- Navigation ---------------- */
  function initNav() {
    var nav = $('#siteNav');
    var burger = $('.nav-burger', nav);
    var menu = $('#mobileMenu');
    if (!nav) return;

    var onScroll = function () {
      nav.classList.toggle('is-solid', window.scrollY > 40);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Mega menus (hover + focus + keyboard)
    $all('.nav-drop', nav).forEach(function (drop) {
      var btn = $('button', drop);
      var open = false;
      var t;
      function setOpen(v) {
        open = v;
        drop.classList.toggle('open', v);
        btn.setAttribute('aria-expanded', String(v));
      }
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(!open);
      });
      drop.addEventListener('mouseenter', function () {
        if (isCoarse) return;
        clearTimeout(t);
        setOpen(true);
      });
      drop.addEventListener('mouseleave', function () {
        clearTimeout(t);
        t = setTimeout(function () { setOpen(false); }, 140);
      });
      drop.addEventListener('focusout', function (e) {
        if (!drop.contains(e.relatedTarget)) setOpen(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && open) { setOpen(false); btn.focus(); }
      });
    });

    // Mobile menu
    if (burger && menu) {
      var previousOverflowY = '';
      var lastFocused = null;
      var mobileQuery = window.matchMedia('(max-width: 900px)');

      // Keep the primary actions above the long navigation list on phones.
      // Moving the existing node preserves all IDs, URLs and analytics hooks.
      var menuUtility = $('.mm-utility', menu);
      var menuList = $('ol', menu);
      if (menuUtility && menuList) menu.insertBefore(menuUtility, menuList);
      var menuLinks = $all('a, button', menu);

      var setMenu = function (v, restoreFocus) {
        if (v && !mobileQuery.matches) return;
        if (v) lastFocused = document.activeElement;
        burger.setAttribute('aria-expanded', String(v));
        menu.classList.toggle('open', v);
        nav.classList.toggle('menu-open', v);
        document.documentElement.classList.toggle('menu-open', v);
        if (v) {
          previousOverflowY = document.body.style.overflowY;
          document.body.style.overflowY = 'hidden';
          menu.removeAttribute('inert');
          menu.setAttribute('aria-hidden', 'false');
          window.requestAnimationFrame(function () {
            var first = menuLinks[0];
            if (first && menu.classList.contains('open')) first.focus();
          });
        } else {
          document.body.style.overflowY = previousOverflowY;
          menu.setAttribute('aria-hidden', 'true');
          menu.setAttribute('inert', '');
          if (restoreFocus !== false && lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus({ preventScroll: true });
          }
        }
      };
      menu.setAttribute('aria-hidden', 'true');
      menu.setAttribute('inert', '');
      burger.addEventListener('click', function () {
        setMenu(burger.getAttribute('aria-expanded') !== 'true');
      });
      $all('a', menu).forEach(function (a) {
        a.addEventListener('click', function () { setMenu(false, false); });
      });
      document.addEventListener('keydown', function (e) {
        var open = burger.getAttribute('aria-expanded') === 'true';
        if (!open) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          setMenu(false);
          return;
        }
        if (e.key !== 'Tab' || !menuLinks.length) return;
        var first = menuLinks[0];
        var last = menuLinks[menuLinks.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
      var onMenuMediaChange = function (e) { if (!e.matches) setMenu(false, false); };
      if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onMenuMediaChange);
      else if (mobileQuery.addListener) mobileQuery.addListener(onMenuMediaChange);
      window.addEventListener('pageshow', function (e) {
        if (e.persisted) setMenu(false, false);
      });
    }
  }

  /* ---------------- Editorial page transitions ----------------
     Keep same-page anchors immediate, but give internal document changes a
     short dark curtain so the site reads as one composed experience. */
  function initPageTransitions() {
    if (reducedMotion) return;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var link = e.target.closest && e.target.closest('a');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      var raw = link.getAttribute('href');
      if (!raw || raw.charAt(0) === '#' || raw.indexOf('mailto:') === 0 || raw.indexOf('tel:') === 0) return;
      var next;
      try { next = new URL(raw, window.location.href); } catch (_) { return; }
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      e.preventDefault();
      document.documentElement.classList.add('is-leaving');
      window.setTimeout(function () { window.location.assign(next.href); }, 380);
    });

    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        document.documentElement.classList.remove('is-leaving');
      }
    });
  }

  /* ---------------- Homepage chapter rail ---------------- */
  function initChapterRail() {
    var rail = $('#chapterRail');
    if (!rail) return;
    var links = $all('a[data-chapter]', rail);
    var current = $('#chapterCurrent', rail);
    var sections = links.map(function (link) { return $('#' + link.dataset.chapter); }).filter(Boolean);
    if (!links.length || !sections.length) return;

    function setActive(id) {
      var activeIndex = -1;
      links.forEach(function (link, i) {
        var on = link.dataset.chapter === id;
        link.classList.toggle('active', on);
        if (on) {
          activeIndex = i;
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
      if (current && activeIndex > -1) current.textContent = String(activeIndex + 1).padStart(2, '0');
    }
    setActive(sections[0].id);

    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { threshold: 0, rootMargin: '-42% 0px -48% 0px' });
    sections.forEach(function (section) { io.observe(section); });
  }

  /* ---------------- Desktop cursor light ----------------
     A low-contrast light follows the pointer with a small amount of lag. It
     stays out of the interaction layer and is disabled for touch/reduced
     motion so it never becomes a performance or accessibility tax. */
  function initCursorLight() {
    if (reducedMotion || isCoarse || isNarrow) return;
    var light = $('#cursorLight');
    if (!light) return;

    var targetX = 0;
    var targetY = 0;
    var currentX = -400;
    var currentY = -400;
    var frame = 0;
    var active = false;

    function stop() {
      active = false;
      light.classList.remove('is-active');
    }
    function render() {
      currentX += (targetX - currentX) * .16;
      currentY += (targetY - currentY) * .16;
      light.style.transform = 'translate3d(' + currentX.toFixed(1) + 'px,' + currentY.toFixed(1) + 'px,0) translate(-50%,-50%)';
      if (Math.abs(targetX - currentX) > .2 || Math.abs(targetY - currentY) > .2) {
        frame = requestAnimationFrame(render);
      } else {
        frame = 0;
      }
    }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      targetX = e.clientX;
      targetY = e.clientY;
      if (!active) {
        active = true;
        light.classList.add('is-active');
      }
      if (!frame) frame = requestAnimationFrame(render);
    }, { passive: true });
    window.addEventListener('blur', stop, { passive: true });
    document.addEventListener('mouseleave', stop, { passive: true });
  }

  /* ---------------- Reveal on scroll ----------------
     One shared observer for ALL .reveal/.reveal-scale nodes — including
     ones injected after boot (scale stat rows, news items, …). A
     MutationObserver picks up late additions so nothing stays hidden. */
  var revealIO = null;
  function observeReveals(nodes) {
    if (!nodes.length) return;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('in'); });
      return;
    }
    if (!revealIO) {
      revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            revealIO.unobserve(en.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    }
    nodes.forEach(function (n) { if (!n.classList.contains('in')) revealIO.observe(n); });
  }
  function initReveals() {
    var initialNodes = $all('.reveal, .reveal-scale');
    observeReveals(initialNodes);
    // CSS keeps reveal content visible until this capability is confirmed.
    // A failed boot therefore cannot leave entire sections transparent.
    document.documentElement.classList.add('reveal-ready');
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (!n || n.nodeType !== 1) return;
            var found = [];
            if (n.matches && n.matches('.reveal, .reveal-scale')) found.push(n);
            if (n.querySelectorAll) found = found.concat(Array.prototype.slice.call(n.querySelectorAll('.reveal, .reveal-scale')));
            observeReveals(found);
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ---------------- Scale / stats ---------------- */
  function fmtNum(n) { return n.toLocaleString('en-US'); }

  // Capacity and distance metrics use locale grouping, while calendar years
  // are identifiers and must remain ungrouped (for example, 1971).
  function formatCount(node, value) {
    return node.getAttribute('data-format') === 'year' ? String(value) : fmtNum(value);
  }

  function countUp(node, target, dur) {
    if (reducedMotion) { node.textContent = formatCount(node, target); return; }
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = formatCount(node, Math.round(target * e));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initStats() {
    var observer = null;

    function play(node) {
      var target = parseInt(node.getAttribute('data-count'), 10);
      if (!isNaN(target)) countUp(node, target, 1600);
    }

    function watch(node) {
      if (!node || node.getAttribute('data-count-watched') === 'true') return;
      node.setAttribute('data-count-watched', 'true');
      if (reducedMotion || !('IntersectionObserver' in window)) {
        node.querySelectorAll('.stat-count').forEach(play);
        return;
      }
      observer.observe(node);
    }

    observer = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        observer.unobserve(en.target);
        en.target.querySelectorAll('.stat-count').forEach(play);
      });
    }, { threshold: 0.3 }) : null;

    function prepareMetric(node) {
      if (!node || node.getAttribute('data-count-ready') === 'true') return;
      var raw = node.textContent.trim();
      var match = raw.match(/^([^0-9]*)([0-9][0-9,]*)(.*)$/);
      if (!match) return;
      var target = parseInt(match[2].replace(/,/g, ''), 10);
      // Years and phone-area codes are labels, not count-up metrics.
      if (isNaN(target) || (target >= 1900 && target <= 2100) || /^\(\d+\)$/.test(raw)) return;
      var count = el('span', { class: 'stat-count', 'data-count': String(target) }, '0');
      node.textContent = '';
      if (match[1]) node.appendChild(document.createTextNode(match[1]));
      node.appendChild(count);
      if (match[3]) node.appendChild(el('span', { class: 'suffix' }, match[3]));
      node.setAttribute('data-count-ready', 'true');
      watch(node);
    }

    // 1. Dynamic homepage stat rows (from CONTENT.stats)
    var wrap = $('#statRows');
    if (wrap) {
      var stats = CONTENT.stats || [];
      var rows = stats.map(function (s) {
        var row = el('div', { class: 'stat-row reveal' });
        var num = el('div', { class: 'stat-num' });
        var countAttrs = { 'data-count': String(s.value), class: 'stat-count' };
        if (s.format === 'year') countAttrs['data-format'] = 'year';
        var numInner = el('span', countAttrs);
        numInner.textContent = s.format === 'year' ? String(s.value) : '0';
        if (s.suffix) num.appendChild(el('span', { class: 'suffix' }, s.suffix));
        num.insertBefore(numInner, s.suffix ? num.firstChild : null);
        row.appendChild(num);
        var meta = el('div');
        meta.appendChild(el('p', { class: 'stat-label' }, esc(s.label)));
        meta.appendChild(el('p', { class: 'stat-detail' }, esc(s.detail)));
        row.appendChild(meta);
        return row;
      });
      rows.forEach(function (r) { wrap.appendChild(r); watch(r); });
    }

    // 2. Static subpage stat numbers (e.g. .fact-strip on /about/, /history/, etc.)
    $all('.fact-strip .fs-item b').forEach(function (b) {
      var raw = b.textContent.trim();
      // Ignore founding year (1971) so it doesn't count up from 0
      if (raw === '1971') return;

      var num = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num) && num > 0) {
        var suffix = raw.replace(/[0-9,\s]/g, ''); // extracts '+', 'M+', etc.
        b.innerHTML = '<span class="stat-count" data-count="' + num + '">0</span>' + (suffix ? '<span class="suffix">' + esc(suffix) + '</span>' : '');
        var parentItem = b.closest('.fs-item') || b;
        watch(parentItem);
      }
    });

    // Page heroes carry the same compact figures as the homepage scale.
    // Convert only standalone metric labels; phone codes and years stay static.
    $all('.ph-meta b').forEach(prepareMetric);
  }

  /* ---------------- Fleet ---------------- */
  var FLEET_PHOTO = {
    feeder: 'LUMOSO GEMBIRA',
    shallow: 'MT. TANTO CITRA',
    heavylift: 'MT. TANTO BERSINAR',
    mainline: 'MT. TANTO BERSAMA'
  };

  function initFleet() {
    var catsWrap = $('#fleetCats');
    var specs = $('#fleetSpecs');
    var media = $('#fleetMedia');
    var tag = $('#fleetTag');
    if (!catsWrap || !specs || !media) return;

    var categories = FLEET.categories || [];
    var classes = FLEET.classes || [];

    function classRow(name) {
      return classes.filter(function (c) { return c.name === name; })[0] || null;
    }

    categories.forEach(function (cat, i) {
      var rows = cat.classes.map(classRow).filter(Boolean);
      var min = Math.min.apply(null, rows.map(function (r) { return r.teu; }));
      var max = Math.max.apply(null, rows.map(function (r) { return r.teu; }));
      var minSp = Math.min.apply(null, rows.map(function (r) { return r.speed; }));
      var maxSp = Math.max.apply(null, rows.map(function (r) { return r.speed; }));
      var maxRf = Math.max.apply(null, rows.map(function (r) { return r.reefer; }));

      var btn = el('button', {
        class: 'fleet-cat', type: 'button', role: 'tab',
        id: 'fleetCat-' + cat.id,
        'aria-selected': i === 0 ? 'true' : 'false'
      });
      btn.innerHTML =
        '<span class="fc-idx">0' + (i + 1) + '</span>' +
        '<h3>' + esc(cat.title) + '</h3>' +
        '<p class="fc-cap">' + min + ' – ' + max + ' TEU · ' + minSp + '–' + maxSp + ' KN</p>';
      btn.addEventListener('click', function () { selectCat(cat.id, btn); });
      catsWrap.appendChild(btn);
    });

    function selectCat(id, btn) {
      var cat = categories.filter(function (c) { return c.id === id; })[0];
      if (!cat) return;
      $all('.fleet-cat', catsWrap).forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
      $all('img', media).forEach(function (img) {
        img.classList.toggle('on', img.getAttribute('data-cat') === id);
      });
      if (tag) tag.textContent = FLEET_PHOTO[id] || '';
      var rows = cat.classes.map(classRow).filter(Boolean);
      var min = Math.min.apply(null, rows.map(function (r) { return r.teu; }));
      var max = Math.max.apply(null, rows.map(function (r) { return r.teu; }));
      var minSp = Math.min.apply(null, rows.map(function (r) { return r.speed; }));
      var maxSp = Math.max.apply(null, rows.map(function (r) { return r.speed; }));
      var maxRf = Math.max.apply(null, rows.map(function (r) { return r.reefer; }));
      var maxDwt = Math.max.apply(null, rows.map(function (r) { return r.dwt; }));

      // 1. Trigger the fade-out
      specs.classList.add('is-updating');

      // 2. Wait 150ms for fade-out, update markup, then fade back in
      setTimeout(function () {
        specs.innerHTML =
          '<h3 class="fs-title">' + esc(cat.title) + '</h3>' +
          '<p class="fs-blurb">' + esc(cat.blurb) + '</p>' +
          '<dl class="fs-grid">' +
          '<div><dt>TEU Capacity</dt><dd>' + (min === max ? min : min + '–' + max) + '</dd></div>' +
          '<div><dt>Service Speed</dt><dd>' + (minSp === maxSp ? minSp : minSp + '–' + maxSp) + '<small> kn</small></dd></div>' +
          '<div><dt>Reefer Plugs</dt><dd>≤ ' + maxRf + '</dd></div>' +
          '<div><dt>Max DWT</dt><dd>' + fmtNum(maxDwt) + '<small> t</small></dd></div>' +
          '</dl>' +
          '<ul class="fs-classes">' + cat.classes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';

        specs.classList.remove('is-updating');
      }, 150);
    }
    selectCat('feeder', $('#fleetCat-feeder'));

    // Full specification table
    var tbody = $('#fleetTable tbody');
    var catName = { feeder: 'Feeder', shallow: 'Shallow Draft', heavylift: 'Heavy Lift', mainline: 'Mainline' };
    classes.forEach(function (c) {
      var tr = el('tr');
      tr.innerHTML =
        '<td data-label="Class">' + esc(c.name) + '</td>' +
        '<td data-label="Category"><span class="cat-tag">' + esc(catName[c.category] || c.category) + '</span></td>' +
        '<td data-label="DWT">' + fmtNum(c.dwt) + '</td>' +
        '<td data-label="GRT">' + fmtNum(c.grt) + '</td>' +
        '<td data-label="TEU">' + fmtNum(c.teu) + '</td>' +
        '<td data-label="Speed (kn)">' + c.speed + '</td>' +
        '<td data-label="RF plugs">' + c.reefer + '</td>';
      tbody.appendChild(tr);
    });
    var toggle = $('#fleetTableToggle');
    var wrapT = $('#fleetTableWrap');
    if (toggle && wrapT) {
      toggle.addEventListener('click', function () {
        var show = !wrapT.classList.contains('show');
        wrapT.classList.toggle('show', show);
        toggle.setAttribute('aria-expanded', String(show));
        toggle.querySelector('.arr').textContent = show ? '−' : '+';
      });
    }
  }

  /* ---------------- Command bar (tabs) ---------------- */
  function initTabs() {
    var tabs = $all('.command-tabs [role="tab"]');
    if (!tabs.length) return;
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        if (j != null) { e.preventDefault(); tabs[j].focus(); select(tabs[j]); }
      });
    });
  }

  function portOptions(select, placeholder) {
    select.innerHTML = '';
    var opt = el('option', { value: '' }, placeholder);
    select.appendChild(opt);
    (NETWORK.ports || []).forEach(function (p) {
      var label = p.name + (p.headquarters ? ' — HQ' : '');
      select.appendChild(el('option', { value: p.id }, label));
    });
  }

  function findPort(id) {
    return (NETWORK.ports || []).filter(function (p) { return p.id === id; })[0];
  }

  function routeBetween(a, b) {
    return (NETWORK.routes || []).filter(function (r) {
      return (r.from === a && r.to === b) || (r.from === b && r.to === a);
    });
  }

  /* ---------------- Tracking (live) ---------------- */
  function renderTrackResult(box, res, err) {
    box.classList.add('show');
    if (err) {
      box.innerHTML = '<div class="res-empty"><span>' + esc(err) + '</span>' +
        '<a class="btn-link" href="/tracking/">Open tracking page</a></div>';
      return;
    }
    if (!res.ok) {
      box.innerHTML = '<div class="res-empty"><span>No data found for this container. Check the number format (e.g. TAKU 1234567-8) and try again.</span></div>';
      return;
    }
    box.innerHTML =
      '<div class="track-result">' +
      '<div class="tr-cell"><div class="tr-label">Container</div><div class="tr-value">' + esc(res.container) + '</div></div>' +
      '<div class="tr-cell"><div class="tr-label">Activity</div><div class="tr-value"><span class="ok"></span>' + esc(res.activity) + '</div></div>' +
      '<div class="tr-cell"><div class="tr-label">Date</div><div class="tr-value">' + esc(res.actDate) + '</div></div>' +
      '</div>';
  }

  function initTrackForm() {
    var form = $('#trackForm');
    var btn = $('#trackBtn');
    var box = $('#trackResult');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = $('#containerNo').value.trim();
      if (!val) { $('#containerNo').focus(); return; }
      btn.disabled = true;
      btn.textContent = 'Querying…';
      window.TANTO_API.track(val)
        .then(function (res) { renderTrackResult(box, res); })
        .catch(function (err) { renderTrackResult(box, null, 'Could not reach the tracking service (' + esc(err.message) + '). The live feed is only reachable from the Tanto domain or the local dev server.'); })
        .finally(function () { btn.disabled = false; btn.textContent = 'Track'; });
    });
  }

  /* ---------------- Schedule (live) ---------------- */
  function initScheduleForm() {
    var form = $('#scheduleForm');
    var pol = $('#cmdPol');
    var pod = $('#cmdPod');
    var box = $('#scheduleResult');
    var btn = $('#scheduleBtn');
    if (!form || !pol || !pod) return;
    portOptions(pol, 'Select port of load');
    portOptions(pod, 'Select port of discharge');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = findPort(pol.value), d = findPort(pod.value);
      box.classList.add('show');
      if (!p || !d) {
        box.innerHTML = '<div class="res-empty"><span>Select both origin and destination.</span></div>';
        return;
      }
      if (!p.apiId || !d.apiId) {
        box.innerHTML = '<div class="res-empty"><span>Live schedule data is not available for this pair yet — see the frequent schedule below.</span>' +
          '<a class="btn-link" href="/schedules/">Frequent schedules</a></div>';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Searching…';
      box.innerHTML = '<div class="res-empty"><span>Searching the schedule system…</span></div>';
      window.TANTO_API.schedule(p.apiId, d.apiId, p.name)
        .then(function (data) {
          var rows = [];
          (data || []).forEach(function (block) {
            (block.jadwal || []).forEach(function (j) { rows.push(j); });
          });
          if (!rows.length) {
            var freq = routeBetween(p.id, d.id);
            var freqTxt = freq.length ? freq[0].freq + (freq[0].via ? ' (via ' + findPort(freq[0].via).name + ')' : '') : '—';
            box.innerHTML =
              '<div class="res-empty"><span>No sailings are published for ' + esc(p.name) + ' → ' + esc(d.name) + ' right now. Published frequency: <strong>' + esc(freqTxt) + '</strong> per month.</span>' +
              '<a class="btn-link" href="/schedules/">All frequent schedules</a></div>';
            return;
          }
          var trs = rows.slice(0, 12).map(function (j) {
            return '<tr><td data-label="Vessel">' + esc(j.vessel || j.name_kapal || '—') + '</td>' +
              '<td data-label="Route">' + esc(j.route || (p.name + ' → ' + d.name)) + '</td>' +
              '<td data-label="Closing">' + esc(j.closing || j.tgl_closing || '—') + '</td>' +
              '<td data-label="ETD">' + esc(j.etd || '—') + '</td>' +
              '<td data-label="ETA">' + esc(j.eta || '—') + '</td></tr>';
          }).join('');
          box.innerHTML =
            '<div class="schedule-result"><table class="mobile-card-table"><thead><tr>' +
            '<th>Vessel</th><th>Route</th><th>Closing</th><th>ETD</th><th>ETA</th>' +
            '</tr></thead><tbody>' + trs + '</tbody></table></div>';
        })
        .catch(function (err) {
          box.innerHTML = '<div class="res-empty"><span>Schedule service unreachable (' + esc(err.message) + '). The full frequent-schedule table is published at the schedules page.</span>' +
            '<a class="btn-link" href="/schedules/">Open schedules</a></div>';
        })
        .finally(function () { btn.disabled = false; btn.textContent = 'Find Sailings'; });
    });
  }

  /* ---------------- Route lookup ---------------- */
  function initRouteForm() {
    var form = $('#routeForm');
    var a = $('#cmdRFrom'), b = $('#cmdRTo');
    var box = $('#routeResult');
    if (!form || !a || !b) return;
    portOptions(a, 'Select origin');
    portOptions(b, 'Select destination');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pa = findPort(a.value), pb = findPort(b.value);
      box.classList.add('show');
      if (!pa || !pb) {
        box.innerHTML = '<div class="res-empty"><span>Select both ports.</span></div>';
        return;
      }
      var rs = routeBetween(pa.id, pb.id);
      if (!rs.length) {
        box.innerHTML = '<div class="res-empty"><span>No direct published service between ' + esc(pa.name) + ' and ' + esc(pb.name) + '. Both ports are served from the Surabaya / Jakarta gateways — see the full network.</span>' +
          '<a class="btn-link" href="#network">Explore the network</a></div>';
        return;
      }
      var r = rs[0];
      var viaTxt = r.via ? 'Via ' + (findPort(r.via) || { name: r.via }).name : 'Direct';
      var dir = (r.from === pa.id) ? pa.name + ' <span class="arrow">→</span> ' + pb.name
                                   : pb.name + ' <span class="arrow">→</span> ' + pa.name;
      box.innerHTML =
        '<div class="route-result">' +
        '<div class="rr-route">' + dir + '</div>' +
        '<div class="rr-meta">' +
        '<div><span>Frequency</span><b>' + esc(r.freq) + ' / month</b></div>' +
        '<div><span>Routing</span><b>' + esc(viaTxt) + '</b></div>' +
        '<div><span>Region</span><b>' + esc(r.region) + '</b></div>' +
        '</div>' +
        '<div class="rr-actions">' +
        '<a class="btn btn-azure btn-sm" href="/schedules/">View full schedule</a>' +
        '<a class="btn btn-ghost-light btn-sm" href="#network">Show on network map</a>' +
        '</div></div>';
      if (r.note) {
        box.innerHTML += '<p class="cmd-hint" style="margin-top:10px">' + esc(r.note) + '</p>';
      }
    });
  }

  /* ---------------- Ops board (live where possible) ---------------- */
  function initOpsBoard() {
    var tbody = $('#opsBoard');
    if (!tbody) return;
    var pairs = [
      { from: 'SBY', to: 'MKS' },
      { from: 'JKT', to: 'MDN' },
      { from: 'SBY', to: 'JYP' },
      { from: 'SBY', to: 'AMB' }
    ];
    // Base rows from published data (always available)
    function baseRows() {
      return pairs.map(function (pr) {
        var p = findPort(pr.from), d = findPort(pr.to);
        var r = routeBetween(pr.from, pr.to)[0] || { freq: '—', via: null };
        return {
          route: p.name + ' → ' + d.name,
          freq: r.freq,
          via: r.via ? 'via ' + (findPort(r.via) || {}).name : 'direct',
          live: null
        };
      });
    }
    function renderRows(rows) {
      tbody.innerHTML = rows.map(function (row) {
        var etd = row.live && row.live.etd ? row.live.etd : '—';
        var eta = row.live && row.live.eta ? row.live.eta : '—';
        return '<tr><td data-label="Route">' + esc(row.route) + '</td><td data-label="ETD">' + esc(etd) + '</td><td data-label="ETA">' + esc(eta) + '</td>' +
          '<td data-label="Status"><span class="status-chip ' + (row.live ? 'on-time' : 'loading') + '">' + (row.live ? 'scheduled' : 'frequency') + ' · ' + esc(row.freq) + '</span></td></tr>';
      }).join('');
    }
    renderRows(baseRows());
    // Try to enrich with live sailings (best-effort; silently keeps base rows on failure)
    if (!window.TANTO_API) return;
    pairs.forEach(function (pr, i) {
      var p = findPort(pr.from), d = findPort(pr.to);
      if (!p || !d || !p.apiId || !d.apiId) return;
      window.TANTO_API.schedule(p.apiId, d.apiId, p.name)
        .then(function (data) {
          var rows = [];
          (data || []).forEach(function (b) { (b.jadwal || []).forEach(function (j) { rows.push(j); }); });
          if (rows.length) {
            var first = rows[0];
            var base = baseRows()[i];
            base.live = { etd: first.etd || first.tgl_etd, eta: first.eta || first.tgl_eta };
            renderRows(baseRows());
          }
        })
        .catch(function () { /* keep base rows */ });
    });
  }

  /* ---------------- Ops tracking demo (live) ---------------- */
  function initOpsTrack() {
    var form = $('#opsTrackForm');
    var out = $('#opsTrackResult');
    var input = $('#opsContainer');
    if (!form || !out) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      out.innerHTML = 'Querying live feed…';
      window.TANTO_API.track(v)
        .then(function (r) {
          if (r.ok) {
            out.innerHTML = '<span class="ok">●</span> ' + esc(r.container) + ' — ' + esc(r.activity) + ' · ' + esc(r.actDate);
          } else {
            out.innerHTML = '<span class="err">●</span> No data found for this container.';
          }
        })
        .catch(function (err) {
          out.innerHTML = '<span class="err">●</span> Feed unreachable from this origin (' + esc(err.message) + ').';
        });
    });
  }

  /* ---------------- Customer stories ---------------- */
  function initStories() {
    // Customer logos render on any page that carries the strip
    var logos = $('#customerLogos');
    if (logos) {
      (CONTENT.customers || []).forEach(function (c) {
        logos.appendChild(el('li', null, '<img src="' + esc(c.logo) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">'));
      });
    }
    var stage = $('#quoteStage');
    var count = $('#storyCount');
    if (!stage) return;
    var items = CONTENT.testimonials || [];
    if (!items.length) return;
    items.forEach(function (t, i) {
      var slide = el('blockquote', { class: 'quote-slide' + (i === 0 ? ' on' : '') });
      slide.innerHTML =
        '<p>“' + esc(t.quote) + '”</p>' +
        (t.quoteEn ? '<p class="q-en">' + esc(t.quoteEn) + '</p>' : '') +
        '<div class="q-who"><span class="q-mark"></span><div><b>' + esc(t.person) + '</b><span>' + esc(t.position) + ' · ' + esc(t.company) + '</span></div></div>';
      stage.appendChild(slide);
    });
    var slides = $all('.quote-slide', stage);
    var idx = 0;
    function show(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) { s.classList.toggle('on', j === idx); });
      if (count) count.textContent = '0' + (idx + 1) + ' / 0' + slides.length;
    }
    $('#storyPrev').addEventListener('click', function () { show(idx - 1); });
    $('#storyNext').addEventListener('click', function () { show(idx + 1); });
    stage.setAttribute('tabindex', '0');
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });

    var touchStartX = 0;
    stage.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });

    stage.addEventListener('touchend', function (e) {
      var diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 45) {
        show(diff < 0 ? idx + 1 : idx - 1);
      }
    }, { passive: true });
  }

  /* ---------------- Heritage timeline ---------------- */
  function initTimeline() {
    var wrap = $('#timeline');
    if (!wrap) return;
    (CONTENT.milestones || []).forEach(function (m) {
      wrap.appendChild(el('li', { class: 'reveal' },
        '<span class="tl-year">' + esc(m.year) + '</span>' +
        '<div><h3>' + esc(m.title) + '</h3><p>' + esc(m.text) + '</p></div>'));
    });
  }

  /* ---------------- News ---------------- */
  function initNews() {
    var wrap = $('#newsList');
    if (!wrap) return;
    (CONTENT.news || []).forEach(function (n) {
      var a = el('a', { class: 'news-item reveal' + (n.type === 'operational' ? ' operational' : ''), href: '/news/' });
      a.innerHTML =
        '<span class="news-cat ' + n.type + '">' + esc(n.category) + '</span>' +
        '<div><h3>' + esc(n.title) + '</h3><p>' + esc(n.text) + '</p></div>' +
        '<span class="ni-arr" aria-hidden="true">→</span>';
      wrap.appendChild(a);
    });
  }

  /* ---------------- Journey (cinematic scroll) ---------------- */
  function initJourney() {
    var pin = $('#journeyPin');
    if (!pin) return;
    var journey = pin.closest ? pin.closest('.journey') : pin.parentElement.parentElement;
    var layers = $all('.j-layer', pin);
    var caption = {
      step: $('#jcStep'), title: $('#jcTitle'), text: $('#jcText')
    };
    var dots = $all('.jp-dot');
    var currentStage = -1;
    var STAGES = [
      { step: '01 / Container', title: 'It Starts With A Container.', text: 'More than 60,000 ISO containers of every size — the average one under five years old.' },
      { step: '02 / Port', title: 'The Port Is Where It Moves.', text: 'Fully-owned handling equipment at every port on the network — reach stackers and forklifts, with operators certified and recertified every year.' },
      { step: '03 / Crane', title: 'Loaded, Stowed, Secured.', text: 'Geared vessels load and discharge at the berth — no waiting on third-party equipment.' },
      { step: '04 / Vessel', title: 'A Fleet Built for These Waters.', text: 'From shallow-draft river boats to 1,500 TEU mainliners — 60+ vessels, 70,000+ TEU.' },
      { step: '05 / Archipelago', title: 'From West to East.', text: '39 ports across the Indonesian archipelago. One network, one standard.' }
    ];
    function setStage(i) {
      if (!caption.step || i === currentStage) return;
      currentStage = i;
      var s = STAGES[i];
      caption.step.textContent = s.step;
      caption.title.textContent = s.title;
      caption.text.textContent = s.text;
      dots.forEach(function (d, j) { d.classList.toggle('on', j <= i); });
    }

    function useFallback() {
      if (journey) {
        journey.classList.remove('is-enhancing', 'is-enhanced');
        journey.classList.add('is-fallback');
      }
      setStage(0);
    }

    if (reducedMotion || !window.gsap || !window.ScrollTrigger || layers.length < 2) {
      useFallback();
      return;
    }

    var n = layers.length;
    var STEP = 0.92 / (n - 1); // 0.23 for five stages

    /* One 1:1 scrubbed timeline drives all five cross-fades. Design notes:
       - scrub: true (no lag tween): the playhead is a pure function of the
         scroll position, so fast reverse scrolls can never desync or leave a
         slide frozen mid-fade (the old scrub: 0.6 lerp + tl.call() combo did).
       - Fade windows OVERLAP (this layer's fade-out ends after the next
         layer's fade-in has started), so a slide is always on screen —
         no black flash between stages even on a fast flick.
       - Caption/dots come from onUpdate (deterministic, works in both
         scroll directions) instead of tl.call callbacks. */
    var tl;
    try {
      // The enhanced class switches from the static, labelled stack to the
      // pinned composition. It is removed again if timeline construction
      // fails, leaving a useful page instead of a tall transparent spacer.
      if (journey) {
        journey.classList.remove('is-fallback');
        journey.classList.add('is-enhancing');
      }
      tl = gsap.timeline({
        scrollTrigger: {
          trigger: pin.parentElement,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          onUpdate: function (self) {
            var t = self.progress * tl.duration();
            var i = Math.floor((t - 0.215) / STEP + 1);
            if (i < 0) i = 0;
            if (i > n - 1) i = n - 1;
            setStage(i);
          }
        }
      });
      layers.forEach(function (layer, i) {
        var start = i * STEP;
        if (i === 0) {
          tl.set(layer, { opacity: 1, scale: 1.05 }, 0);
        } else {
          tl.fromTo(layer,
            { opacity: 0, scale: 1.12 },
            { opacity: 1, scale: 1.03, ease: 'none', duration: 0.08 }, start - 0.03);
        }
        if (i < n - 1) {
          /* Ends after the next layer's fade-in has begun: no black flash. */
          tl.to(layer, { opacity: 0, scale: 1.0, ease: 'none', duration: 0.08 }, start + 0.16);
        }
      });
      if (journey) {
        journey.classList.remove('is-enhancing');
        journey.classList.add('is-enhanced');
      }
    } catch (err) {
      if (tl && tl.kill) tl.kill();
      layers.forEach(function (layer) {
        layer.style.removeProperty('opacity');
        layer.style.removeProperty('transform');
      });
      useFallback();
      return;
    }
    setStage(0);

    // Mobile browser chrome and orientation changes alter the sticky
    // viewport after the timeline is created. Refresh its trigger geometry
    // once the new visual viewport has settled.
    var refreshTimer;
    function refreshJourney() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      }, 180);
    }
    window.addEventListener('resize', refreshJourney, { passive: true });
    window.addEventListener('orientationchange', refreshJourney, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refreshJourney, { passive: true });
  }

  /* ---------------- Hero parallax (subtle) ---------------- */
  function initHeroParallax() {
    if (reducedMotion) return;
    var hero = $('.hero');
    if (!hero) return;
    var img = $('.hero-media img', hero);
    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY;
      var h = hero.offsetHeight || 1;
      if (y < h * 1.2) {
        img.style.transform = 'translateY(' + (y * 0.12).toFixed(1) + 'px) scale(' + Math.max(1, 1.07 - y * 0.00002).toFixed(4) + ')';
      }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  /* ---------------- ISO 6346 Container Formatter ---------------- */
  function initContainerFormatters() {
    function attachContainerFormatter(input) {
      if (!input) return;
      input.addEventListener('input', function () {
        var raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        var formatted = raw;
        if (raw.length > 4 && raw.length <= 10) {
          formatted = raw.slice(0, 4) + ' ' + raw.slice(4);
        } else if (raw.length > 10) {
          formatted = raw.slice(0, 4) + ' ' + raw.slice(4, 10) + '-' + raw.slice(10, 11);
        }
        input.value = formatted;
      });
    }

    attachContainerFormatter($('#containerNo'));
    attachContainerFormatter($('#opsContainer'));
  }

  /* ---------------- Maritime Live Clock ---------------- */
  function initLiveClock() {
    var status = $('.command-status');
    if (!status) return;
    var clockEl = el('span', { class: 'mono', style: 'margin-left: 8px; opacity: 0.85;' });
    status.appendChild(clockEl);

    function update() {
      var now = new Date();
      // Convert local browser time to UTC+7 (WIB / Surabaya HQ)
      var wib = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60000);
      var hrs = String(wib.getHours()).padStart(2, '0');
      var min = String(wib.getMinutes()).padStart(2, '0');
      var sec = String(wib.getSeconds()).padStart(2, '0');
      clockEl.textContent = hrs + ':' + min + ':' + sec + ' WIB';
    }
    update();
    setInterval(update, 1000);
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    initNav();
    initPageTransitions();
    initChapterRail();
    initCursorLight();
    initReveals();
    initStats();
    initFleet();
    initTabs();
    initTrackForm();
    initScheduleForm();
    initRouteForm();
    initOpsBoard();
    initOpsTrack();
    initStories();
    initTimeline();
    initNews();
    initJourney();
    initHeroParallax();
    initContainerFormatters();
    initLiveClock();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
