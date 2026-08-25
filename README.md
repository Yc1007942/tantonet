# PT Tanto Intim Line — Website Redesign 

A complete redesign of [tantonet.com](https://www.tantonet.com/) as a premium "maritime-tech" brand: a cinematic 10-scene homepage, a flagship interactive Indonesia network map, and a full set of utility subpages — all built on **real, verified Tanto data** with **no fabricated content** and **no fake backend**.

> **Tanto is not merely a company that owns ships. Tanto is infrastructure connecting Indonesia.**

---

## 1. Audit of the original site

The pre-redesign site (audited Aug 2026) was a small static PHP site with exactly **8 content pages**:

| Old URL | Content | Destination in new site |
|---|---|---|
| `/` (`index.php`) | Hero, stats, app promo | `/` (fully redesigned) |
| `we-are.php` | About, vision, mission | `/about/` + `/history/` |
| `we-do.php` | Service advantages, dry bulk (Lumoso), service routes | `/shipping/` |
| `we-have.php` | Containers (20'/40' specs), handlers, vessel table, ISO certs | `/equipment/` + `/fleet/` |
| `schedule.php` | Monthly departure frequencies by region | `/schedules/` + `/routes/` |
| `career.php` | Job vacancy + application form | `/careers/` |
| `contact.php` | 32-office directory ("Our Office") | `/offices/` (new `/contact/` for HQ/channels) |
| `privacy-policy.php` | Bilingual (EN/ID) privacy policy | `/privacy/` (full policy re-hosted) |

Plus a separate customer dashboard at `/dashboard/index.php` (kept untouched) and an inline container-tracking widget on every page.

**Live APIs (production system, origin-gated to `www.tantonet.com`):**

| Endpoint | Method | Purpose |
|---|---|---|
| `https://sync.tantooffice.com/api/tcm/container_tracking` | POST `{container}` | Live container activity + date |
| `https://sync.tantooffice.com/api/tcm/get_city_schedule` | POST `{act: 'city'}` | Port/city list (id + name) |
| `https://sync.tantooffice.com/api/tcm/get_schedule_multi` | POST `{pol, listPod[], kota_asal}` | Live sailings for a port pair |

The API verifies the request `Origin` and answers anything other than `https://www.tantonet.com` with "Access denied". The client calls the upstream directly on `www.tantonet.com`; local development uses `dev-server.mjs`, and Vercel previews use the deployed `/api/tcm/*` function proxy.

---

## 2. New site architecture

Static, dependency-free HTML/CSS/JS (no build step, no framework). GSAP + ScrollTrigger are vendored for the homepage cinematic scroll only.

```
/
├── index.html                  10-scene cinematic homepage (hero → command bar → network map →
│                               scale → container journey → fleet → digital → heritage →
│                               stories → news → departure → footer)
├── 404.html                    "Off The Published Route."
├── shipping/                   Services: general cargo, reefer, heavy lift, Lumoso dry bulk
├── routes/                     Flagship interactive network map + full published route table
├── schedules/                  Live sailing search + frequent schedules by region
├── tracking/                   Live container tracking + help + app/dashboard/office channels
├── fleet/                      Vessel category viewer + full 12-class specification table
├── equipment/                  Container spec viewer (20'/40'), yards & handling
├── digital-services/           T-Link, dashboard, schedule feed, payments, digital history
├── about/                      Company profile, vision/mission, certifications, customers
├── history/                    Verified milestones timeline (1971 → today)
├── offices/                    Interactive office map + searchable 32-office directory
├── news/                       Operational advisories + company news (filterable)
├── careers/                    Why Tanto + how to apply (no fabricated vacancies)
├── contact/                    HQ, channels (service, chartering, dashboard, offices)
├── privacy/                    Full EN/ID privacy policy (from privacy-policy.php)
├── legal/                      Terms of use, IP, liability, contact
├── assets/
│   ├── css/main.css            Design system: tokens (§1) … subpage components (§22)
│   ├── js/main.js              Nav, reveals, stats, fleet tabs, live track/schedule/route
│   ├── js/network-map.js       Flagship map (pure SVG + rAF: story mode, route search,
│   │                           port tooltips, mobile bottom sheet, reduced-motion fallback)
│   ├── js/pages.js             Subpage logic (route tables, schedule tables, office
│   │                           map + directory, news filter, container viewer, EN/ID toggle)
│   ├── js/api.js               Origin-aware API client (prod URL ↔ local /api/tcm/ proxy)
│   ├── fonts/                  Self-hosted: Archivo (variable 400–800), IBM Plex Mono 400/500/600
│   ├── img/                    Genuine + project-generated Tanto assets
│   │                           (vessel photos incl. Lumoso Gembira / Tanto Citra / Bersinar /
│   │                            Bersama / Jaya; logo-t.webp = red T mark for dark surfaces,
│   │                            logo-flag.webp = blue flag for light surfaces; hero-poster.webp
│   │                            = poster frame for the hero video)
│   ├── video/hero.mp4          Homepage hero video (720p H.264, ~20 MB, faststart;
│   │                           plays on desktop ≥901px only — mobile & reduced-motion keep
│   │                           the poster image)
│   ├── map/indonesia-land.svg  Indonesia land geometry (1920×764, equirect 94–142°E)
│   └── vendor/                 gsap.min.js, ScrollTrigger.min.js
├── data/
│   ├── content.json/.js        Stats, milestones, testimonials, customers, news, company
│   ├── network.json/.js        33 ports (coords + API ids), 42 published routes + frequencies
│   ├── fleet.json/.js          12 vessel classes (DWT/GRT/TEU/speed/reefer), 4 categories
│   └── offices.json/.js        32 offices (address, phones, email, lat/lng, region)
├── dev-server.mjs              Static server + /api/tcm/* proxy (port 4173);
│                               supports HTTP Range (206) for video seeking
├── sitemap.xml · robots.txt · vercel.json
└── .vercelignore                Keeps local source/docs out of the deployment
```

### Data pipeline

`data/*.json` is the single source of truth. Each `.js` file is a generated wrapper (`window.TANTO_* = {…}`) loaded as a classic script, so the site works from any static host with no fetch/CORS concerns. **To update data: edit the `.json`, then regenerate the `.js` wrapper** (the header comment in each file says so). The JSON carries `meta.source` (where it was extracted from) and `verifyBeforePublication` flags.

### Design system (`main.css` §1 tokens)

- **Colour:** Tanto Blue `#163e71` (hero brand) · Container Azure `#0ba3ff` (digital accent on dark) · ink navy `#060d18–#1a2f4e` (premium dark surfaces) · paper `#f5f7fa` (light surfaces) · logo red `#ed2024` (micro-accents only)
- **Type:** Archivo (variable, 400–800) for display + text · IBM Plex Mono for data, labels, coordinates
- **Radius:** 2px / 4px only (restrained) · **Motion:** one easing curve `cubic-bezier(.22,1,.36,1)`, slow/intentional, `prefers-reduced-motion` fully honoured
- **Layout:** 1480px container, `clamp()` fluid type and spacing, 76px nav

---

## 3. Development

```bash
node dev-server.mjs        # → http://localhost:4173
```

- Serves the static site and proxies `POST /api/tcm/*` to the production API with the accepted Origin, so **live tracking and schedule search work in local development** exactly as they will in production.
- Unknown paths serve `404.html` with status 404.
- No dependencies; Node ≥ 18 (uses global `fetch`).

### Production deployment

1. Import the repository into Vercel with no build command; this is a static site.
2. Set the production domain to `www.tantonet.com`; `vercel.json` contains the old-URL 301 redirects. Preview domains such as `*.vercel.app` use the included `/api/tcm/*` proxy for live API calls.
3. Keep `/dashboard/` on its existing application or add a Vercel rewrite to that origin.
4. No build step, environment variables or API keys are required — the API client auto-detects origin.

---

## 4. Real-data policy & items flagged for verification

All copy, figures, routes, offices and testimonials come from the live tantonet.com (extracted 2026-08-17). **Nothing was invented.** Flagged items (marked in-page with a `verify` note where shown to visitors, and in `data/*.json` `meta`):

- **Fleet & network figures (2026, stakeholder-confirmed)** — 60+ vessels, 70,000+ TEU, 39 ports served, 32 branch offices, 60,000+ ISO containers, 1M+ containers moved each year. These supersede the originally extracted figures (50+ vessels, 26,731 TEU, 32 ports, 300,000/year) and are used consistently across the site (site-wide sync completed in round 9).
- **Benete (Sumbawa)** — appears in the published schedule but has no port code in the live schedule API; listed on `/routes/` and `/schedules/` with a note.
- **Frequencies** — monthly departures as published; the live sailing feed is authoritative when published for a pair.
- **Careers** — no open vacancies are listed (none were published); the page directs applicants to the head office.
- **Historical imagery** — no archival photos were available; `/history/` uses current operations photography and says so.

---

## 5. Deployment footprint

Verification screenshots and source JSON are kept out of the Vercel upload by `.vercelignore`. The generated `data/*.js` wrappers remain in the deployment because the pages load them directly in the browser.

---

## 6. Accessibility & performance notes

- Semantic landmarks, one `h1` per page, skip link, ARIA on tabs/carousels/dialogs, `aria-live` on live results, focus-visible states, keyboard support for the map route search, fleet tabs, container viewer and office filters.
- `prefers-reduced-motion`: story mode, journey scroll, parallax, count-ups and route animation all fall back to static states.
- Self-hosted fonts (no third-party requests), WebP imagery, `loading="lazy"` below the fold, `fetchpriority="high"` hero, no runtime dependencies beyond vendored GSAP on the homepage.

---

## 7. Change log — stakeholder feedback (round 3)

| Change | Where |
|---|---|
| Route search resolves the **full transit chain** via shortest-path over the published service graph (e.g. Makassar → Surabaya → Jakarta → Batam; transshipment services expose their legs so freight can change at the via port). Unrelated routes dim to 0.07; a "no published service" state is shown honestly when a pair has no route | `assets/js/network-map.js` (rewritten: graph + Dijkstra), `data/network.json` |
| Selected route renders as a continuous **yellow luminous line** (`.map-sel` double drop-shadow glow), endpoint ports get yellow cores (`.chain-end`), transit ports amber (`.via-port`); legend gained a "Selected route" swatch; info-panel accent + a live voyage dot travel the chain | `assets/css/main.css`, `index.html` + `routes/index.html` (`#mapSelG` SVG layer) |
| Removed the dead navy band after the network map: `.network-scroll` 190vh → 140vh, plus a scroll-driven **camera pull-back** as the sticky stage releases (`.map-frame` scale 1→0.9 + fade), guarded for mobile / reduced-motion | `assets/css/main.css`, `network-map.js` (`updateExit`) |
| **Fleet & network figures** updated to stakeholder-confirmed values (60+ vessels, 70,000+ TEU, 33 ports, 1M+ containers/year), superseding the originally extracted figures, consistently across all pages | `data/content.json`·`fleet.json` (+ regenerated `.js`), all HTML pages, `main.js` journey captions |
| **Heavy-lift (Tanto Bersinar) photo re-centred** so the vessel sits on the waterline | `assets/css/main.css` (`.fleet-media img[data-cat="heavylift"]` `object-position`) |
| **Nav "TANTO" wordmark → dark deep blue** (`--t-blue-deep`) in both nav states; the transparent (over-hero) state carries a soft light text-lift for legibility | `assets/css/main.css` |
| **Command bar no longer overlaps the hero** on scroll: new `--cmd-overlap` token pulls the console up over the hero base and floats the hero status strip just above it (16px gap) instead of letting it collide | `assets/css/main.css`, `index.html` |
| **Dev server sends `Cache-Control: no-cache`** for `.html`/`.js`/`.css` (media & fonts keep 1h) so code edits show on a normal refresh without a hard reload | `dev-server.mjs` |

---

## 8. Change log — rounds 4–5 (map utility + journey engine repair)

| Change | Where |
|---|---|
| **Map legend moved below the map** into the frame's bottom strip (no longer covers the archipelago); **route-info panel moved into the same strip** (left) so the selected-route readout sits in the empty space under the map instead of over the routes | `assets/css/main.css` (`.map-frame` inset, `.network-legend`, `.map-routeinfo`) |
| **FROM/TO port pickers replaced with a custom in-page accessible dropdown** (combobox pattern). Root cause: Chrome fails to open *native* `<select>` popups inside the sticky, `overflow:hidden` + `backdrop-filter` map stage (diagnostics ruled out covering elements, option counts and JS errors). The custom list supports click, full keyboard (arrows/Home/End/Enter/Escape), typeahead, one-open-at-a-time and keeps the `.value`/`change` contract, so all route logic is unchanged. Applies to homepage **and** `/routes/`. Remaining native selects (command bar, schedules) get `color-scheme: dark` so their popups render dark-on-dark correctly | `index.html` + `routes/index.html` (`.dd` markup), `assets/js/network-map.js` (`makeDD`), `assets/css/main.css` |
| **Journey scene 02 imagery: yard → port** — the user-supplied aerial port photograph now plays the "02" stage (container → **port** → crane → vessel → archipelago); stage caption re-titled "The Port Is Where It Moves." with copy about fully-owned handling equipment. `yard-reachstacker.webp` is untouched elsewhere (about/careers/history/equipment/scale/heritage) | `index.html`, `assets/js/main.js` (`STAGES`), `assets/img/port-priok.webp` (new) |
| **Journey scroll engine repaired (latent production bug).** Two defects: (1) `gsap.registerPlugin(ScrollTrigger)` was never called, so the journey timeline's `scrollTrigger` config was silently dropped and desktop users saw a dark empty pinned panel for the whole 4.6k-px scroll; (2) the layer fade-ins used `duration: fadeEnd`, where `fadeEnd` is a timeline *position* — durations grew 0.27/0.50/0.73/0.96, stretching the timeline to 1.86 and making every layer fade out before finishing its fade-in (peak ≈50% opacity). Fix: register the plugin at boot and use `duration: fadeEnd - (start - 0.02)`. Verified live: trigger geometry exact (start/end = section top/bottom minus viewport), the five stage captions fire at ≈0/27/51/75/99% of the scroll range, and each layer holds full opacity inside its window (port layer measured at 1.0) | `assets/js/main.js` (plugin registration + journey timeline) |
| **Verification captures refreshed** in `docs/screenshots/` (1440×900 / 1920×1080 / 390×844 classes): hero ×3, network map ×2, route selected (SBY→TMK direct), **dropdown open (new)**, **journey port stage (new)**, `/routes/` MKS→BTM chain, fleet heavy-lift viewer. Captures are headless-Chrome, one fresh instance per page and a never-reused viewport size per frame (the machine's shared GPU tile cache poisons same-size re-captures, so pixel sizes are ±7 px — clean frames over exact dimensions) | `docs/screenshots/` |
| **Hero status strip moved into flow below the CTAs.** It was absolutely positioned at `bottom: calc(var(--cmd-overlap) + 16px)` while the buttons sat at `padding-bottom: clamp(120px, 16vh, 170px)` — two independent clamps that diverged by viewport height, so the strip could run through the buttons. Now the strip is the last in-flow child of `.hero-inner` (fixed `margin-top` gap, impossible to overlap) and the hero's `padding-bottom` is derived from the same `--cmd-overlap` token, keeping the strip 16px clear of the command console's lift at every height. Verified by bounding-box sweep: 1440×700/900/1080, 1920×1080, 1366×768, 390×844 — button→strip gap 31–44px, strip→console 16–20px, zero collisions | `index.html` (hero markup), `assets/css/main.css` |

### Round 6 — journey imagery, map intro, dropdown hit-testing, SCALE photo

| Change | Where |
|---|---|
| **Map FROM/TO dropdowns: click-stealing fixed (root cause).** The map SVG overflows `.map-frame` (1920×764 world centred in a shorter frame) and, being positioned, painted *and hit-tested above* the static route-search header — so on shorter windows (e.g. 1920×800) the SVG intercepted clicks over the FROM/TO pickers and covered the open dropdown list. Fix: `.network-head { position: relative; z-index: 6 }` (header now stacks above the map) plus `.map-viewport { overflow: hidden }` (clips the ~48 px ocean overflow as belt-and-braces). Verified with **real CDP `Input.dispatchMouseEvent` clicks** at 1920×800 — JS `.click()` was masking the bug in earlier rounds because it skips hit-testing: topmost element over the picker is now the picker itself, both dropdowns open, SBY→BTM selects and resolves to `SURABAYA → JAKARTA → BATAM` with the yellow selected line | `assets/css/main.css` (`.network-head`, `.map-viewport`) |
| **Map intro story removed — network reveals itself.** Per request, the narrative overlay ("From Indonesia's major gateways…" + skip button) is gone from the markup entirely. On first viewport entry all 42 published routes draw in one staggered west→east wave (28 ms apart, 1.3 s stroke-dash) with the ports fading in just behind it, then straight into interactive mode. Reduced-motion / mobile: instant `showAll()` as before | `index.html` + `routes/index.html` (`#mapStory` removed), `assets/js/network-map.js` (reveal section), `assets/css/main.css` (`.port-fade`) |
| **Journey stages 03 & 04 replaced with user photos.** Stage 03 (Crane) now uses the supplied berth photograph with the blue STS crane; stage 04 (Vessel) uses the supplied geared-vessel-on-water photograph. Note: the supplied crane candidate with the yellow crane lifting TANTO boxes was also provided — say the word and stage 03 swaps back. The new photos are 720–800 px wide, so they are soft at full-viewport scale; higher-resolution versions would sharpen them | `index.html` (stage 2/3 `<img>`), `assets/img/journey-crane.webp` + `journey-vessel.webp` (new) |
| **SCALE section: island-port photograph.** The right column now carries the supplied aerial island-port photo ("A vessel at an island port — the network reaches the whole archipelago"). It replaced the yard/reach-stacker photo in that one slot — the user experienced the section as text-only because the stats were invisible (bug below); `yard-reachstacker.webp` is untouched on about/careers/history/equipment/heritage | `index.html` (`.scale-photo`), `assets/img/scale-port-island.webp` (new) |
| **Reveal observer: late-injected nodes now observed (latent production bug).** `initStats()` and `initNews()` inject `.reveal` rows *after* the initial reveal snapshot, so the IntersectionObserver never saw them and the SCALE stat rows and news items sat at `opacity: 0` forever (visible in the old `home_scale` capture's blank right column). Fix: a shared `revealIO` + `observeReveals()` helper with a `MutationObserver` on `<body>` that observes late additions. Verified: all stat rows and news items reach `.in` in view | `assets/js/main.js` (`initReveals`) |
| **Mobile map box tightened.** Below 900 px the frame no longer reserves 88 px for the hidden legend (`.map-frame { inset: 0 }`) and the viewport's min-height dropped 380 → 230 px, so the map (≈155 px tall at 390 px wide) sits in a snug box instead of a large empty dark area. Desktop layout untouched | `assets/css/main.css` (`@media (max-width: 900px)`) |
| **Verification captures refreshed** in `docs/screenshots/`: network map 1440 / 1920 / **390 (new)**, SCALE (stats now visible), **journey crane stage (new)** — same headless recipe, never-reused viewport sizes | `docs/screenshots/` |

### Round 7 — homepage figures, journey container, offices filter fix, new photography

| Change | Where |
|---|---|
| **Homepage figures updated (homepage only, per request; corrected in-round).** SCALE stats now read **39 ports served**, **32 branch offices**, **60,000+ ISO containers**, **1,000,000+ containers moved each year** (was 33 / 29 / 50,000+ / 1,000,000+). All other "33 ports" strings on the homepage (meta/OG/Twitter/JSON-LD, nav mega-note, hero sub, SCALE photo caption) were synced to 39, and the two remaining "50,000" strings (nav Equipment description, journey stage-01 caption in both `index.html` and the `STAGES` array in `main.js`) were synced to 60,000. `data/content.json` + `data/content.js` updated together (only the homepage consumes `CONTENT.stats`). **Not yet synced (flagged to user):** About page meta, subpage nav mega-notes ("33 ports · 7 regions"), and the /history/ "Today" milestone still carry the old figures | `data/content.json` + `data/content.js`, `index.html`, `assets/js/main.js` |
| **Offices region filter + search fixed (root cause).** `.office-card { display: flex }` (author rule) overrode the UA `[hidden] { display: none }`, so the chips' `hidden = true` had no visual effect — chips highlighted but the grid never changed; the search box was broken the same way. Fix: a global semantic guard `[hidden] { display: none !important; }` — which also repairs the /news/ category filter, the /privacy/ EN-ID toggle and the map Clear button, all of which toggle `hidden` on author-display elements. Verified with real CDP mouse clicks: Papua → exactly 7 cards (Biak, Jayapura, Manokwari, Merauke, Nabire, Sorong, Timika), hidden cards compute to `display: none`, All → 32, search "makassar" → 1 | `assets/css/main.css` (§0.5 guard) |
| **Journey stage 01 (Container) — photorealistic TANTO box.** The vector illustration is replaced with the supplied photorealistic render (TAKU 123456, 45G1). The PNG already carries a soft alpha mask (transparent margins), so it was converted straight to WebP with alpha — no flood-fill needed — and the container floats on the stage's dark gradient exactly like the old illustration. 2112×744, 147 KB | `index.html` (stage-0 `<img>`), `assets/img/journey-container.webp` (new) |
| **Contact head-office photo → the office building.** The "HEAD OFFICE / PT Tanto Intim Line" figure now shows the supplied glass-facade HQ photograph with caption "Headquarters, Surabaya" (was the vessel photo "The network, from the water") | `contact/index.html`, `assets/img/office-building.webp` (new) |
| **History "Old Company" strip refreshed.** THE FLEET · TODAY now uses the supplied MT. Tanto Tenang-at-port photograph (1600 px WebP); THE ROUTES · TODAY is now a render of the live network map (archipelago + all 42 routes, captured from the page SVG via CDP clip — the same blue map as the homepage, so the brand element carries through). THE YARDS · TODAY kept as requested | `history/index.html`, `assets/img/heritage-fleet.webp` + `assets/img/heritage-routes-map.webp` (new) |
| **Verification captures refreshed/added** in `docs/screenshots/`: SCALE (39/32/60,000+ visible), **journey container stage (new)**, **history strip (new)**, **contact head office (new)**, **offices directory with Papua filter (new)** | `docs/screenshots/` |

### Round 9 — site-wide figure sync

| Change | Where |
|---|---|
| **Every page synced to the canonical figures** ("change all to be consistent data"): **39 ports served**, **32 branch offices**, **60,000+ ISO containers**, **1M+ containers moved each year** — extending the round-7 homepage-only sync site-wide. Nav mega-note ("39 ports · 7 regions") + Equipment mega description ("60,000+ containers") on all 16 subpages; homepage hero status strip ("39 PORTS"); About hero meta + In-Brief paragraph + "39 Ports served" tile + meta/OG/Twitter/JSON-LD — including its Organization JSON-LD, which still carried the original extracted "50+ vessels across 32 ports" (now "60+ vessels across 39 ports"); /history/ "Today" milestone (33→39 ports, 50,000+→60,000+ containers) + meta strings; /equipment/ lede, ph-meta and body copy (50,000+→60,000+); /shipping/ + /routes/ meta, ledes and ph-meta — both hero tiles read a stale "32 PORTS" and are now 39; journey stage-05 caption; `data/content.json` + `data/content.js` "Today" milestone (kept in lockstep, no build step). `70,000+ TEU` deliberately untouched (different metric). Verified by re-grep: zero stale `33 ports` / `50,000` / `50+ vessels` occurrences outside this README's historical change-log entries |
All 20 files: `index.html`, 16 subpage HTML files, `data/content.json` + `content.js`, `assets/js/main.js`, `README.md` |
| **Verification captures refreshed** in `docs/screenshots/` (1440×900 / 1920×1080 / 390×844 classes): homepage hero strip ×3 (now "39 PORTS"), About hero (ph-meta "39 PORTS") and About In-Brief (39 Ports served tile), Equipment hero ("60,000+ CONTAINERS") | `docs/screenshots/` |

### Round 10 — map endpoint labels on selection

| Change | Where |
|---|---|
| **Network map port labels now follow the selection.** Default state: only **Surabaya and Jakarta** are named on the map (previously all four hubs — the Makassar and Medan labels were removed). When a port is picked as **FROM or TO** in the route search, its name fades in above the point in the bright hub-style treatment (matching the yellow endpoint dot); clearing the selection fades it back out. Transit ports in the resolved chain stay unlabelled — the chain remains readable via the info panel (e.g. Makassar → Surabaya → Jakarta → Batam). Applies to the homepage map and /routes/ (shared component) | `assets/js/network-map.js` (every port gets a label node + new `setEndpointLabels()` hooked into `selectRoute`/`clearSelection`), `assets/css/main.css` (`.map-port-label` opacity + `.on` state, `.chain-end` label styling) |
| **Verification captures refreshed**: `home_network_1440x900.png` + `home_network_1920x1080.png` (default state — only SBY/JKT named), `home_network_route_1440x900.png` (Makassar → Surabaya → Jakarta → Batam selection, endpoint labels visible — the stakeholder's own example pair), `sub_routes_map_1440x900.png` (routes page, same component). Note: on this machine headless viewport screenshots of *scrolled* regions on the homepage come out blank (compositor quirk — subpages and unscrolled frames are fine), so map captures now use `captureBeyondViewport` with a page-coordinate clip of the sticky stage | `docs/screenshots/` |

### Round 11 — mobile hero video + mobile journey, journey freeze fix

| Change | Where |
|---|---|
| **Hero video now plays on mobile** (it was intentionally desktop-only before). The element already carries `playsinline` + `muted` + `autoplay` (iOS inline-autoplay requirements), so the fix is CSS-only: `.hero-video` is `display: block` at every viewport; `prefers-reduced-motion` still keeps the static poster | `assets/css/main.css` (`.hero-video`) |
| **The scroll journey now runs on mobile.** Narrow viewports previously fell back to a static image stack (the `isNarrow` gate in `initJourney` + stacked mobile CSS), which read as "no animation". Mobile now gets the same 480vh pinned scroll journey as desktop; the static stack remains for `prefers-reduced-motion` (CSS) and no-JS (new `<noscript>` styles) | `assets/js/main.js` (`initJourney` gate), `assets/css/main.css` (≤899px journey block), `index.html` (`<noscript>`) |
| **Journey freeze bug fixed (root cause).** Five full-viewport `will-change` layers inside a sticky container, a lagging `scrub: 0.6` tween and `tl.call()` caption callbacks could leave a slide frozen mid-fade after fast reverse scrolls, and a brief black gap existed between stages. The timeline is now a pure function of the scroll position: `scrub: true` (1:1 — no lag tween, so it cannot desync), overlapping cross-fade windows (a slide is always on screen), caption/dots driven deterministically from `ScrollTrigger.onUpdate` instead of `tl.call`, and the persistent `will-change` removed (layers promote only while animating). Verified headless: all five stages exact at their scroll positions, 0/5 desyncs after six fast down-up flicks, and the darkest cross-fade point is now 25% max layer opacity (previously a 0% black gap) | `assets/js/main.js` (`initJourney` rewrite), `assets/css/main.css` (`.j-layer`) |
| **Verification captures refreshed**: `home_top_390x844.png` (mobile hero, video now playing), `home_journey_container_1440x900.png` + `home_journey_1440x900.png` (stages 01/03), new `home_journey_mobile_390x844.png` (stage 03 at 390px). State-dump verification: mobile video `paused=false readyState=4`, mobile journey `sticky` + 480vh with all stages at 100% at their positions, and a reduced-motion run (emulated before load) shows video hidden + stacked journey with no GSAP inline styles | `docs/screenshots/` |
