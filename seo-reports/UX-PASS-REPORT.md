# UX / Design Pass Report (Search + Professional polish)

Date: 2026-07-18  
Target: staging `dev.d3b6br5rr6wbn2.amplifyapp.com`  
Theme colors: unchanged (primary accent `#036eb1`)

---

## 1) Search technology — what & why

**Stack:** static HTML site → **build-time JSON index** (`scripts/build_search_index.py` → `website/search-index.json`) + **Fuse.js 7** (`website/js/fuse.min.js`) loaded **only when the user opens search**.

**Why this approach**
- No framework (not Next/Gatsby/Astro); pure static files on Amplify.
- Fuse.js is small, fuzzy, and works fully client-side with no backend.
- Index is regenerated on every Amplify `preBuild`, so new pages are included automatically.
- Overlay UI (not Rise Display’s thin underline) — icon opens a focused modal with grouped type-ahead results.

**UX details shipped**
- Desktop + mobile header search triggers (44×44 tap targets)
- Debounced type-ahead; results grouped: Products / Industries / Blog / Pages
- Keyboard: ↑/↓, Enter, Esc; Ctrl/Cmd+K shortcut
- Empty state offers browse links (products, sports bars, finance lab, contact)
- Mobile: full-viewport overlay

---

## 2) Pages currently indexed

**249 pages** (see full list: `seo-reports/SEARCH-INDEX.md`)

| Type | Count |
| --- | ---: |
| Blog | 209 |
| Products | 17 |
| Industries | 14 |
| Pages | 9 |

---

## 3) Screenshots

Saved under `seo-reports/ux-screenshots/`:

| File | What |
| --- | --- |
| `home-desktop.png` | Header with search icon + phone + Get Quote |
| `home-mobile.png` | Mobile header with search |
| `search-desktop.png` | Search overlay + “stock ticker” results |
| `search-mobile.png` | Full-screen mobile search |
| `faq-accordion-desktop.png` | FAQ accordion expanded |
| `country-picker-desktop.png` | Searchable country field (“Can” → Canada…) |
| `country-picker-mobile.png` | Mobile country picker (if generated) |

---

## 4) Items flagged — not changed unilaterally

### A) Client logo wall (needs your sign-off)
Homepage shows logos including **Amazon, Google, Netflix, ASOS**, plus others.  
We **did not remove** them. Added a temporary caption noting verification is pending.  
**Please confirm** which logos are verified Tickerplay clients. If confirmed, we can change the caption to: “Ticker installations for…”

### B) Photonplay vs Tickerplay brand mismatch
Footer social links still point to:
- Facebook: `facebook.com/photonplaygroup`
- LinkedIn / YouTube: `linkedin.com/company/photonplay-systems`

**Please confirm:** Photonplay = parent company (add “Tickerplay, a Photonplay company”) **or** legacy rebrand (swap to current Tickerplay profiles).

### C) Quote turnaround copy — not shipped
No SLA text was added near CTAs.  
**Confirm a real number** (e.g. “quotes within 1 business day”) before we publish it.

### D) Blog dates
**125** posts share identical `datePublished` / `article:published_time` = `2021-06-22T16:16:00` (far more than four).  
Not silently corrected — need your decision: batch-correct from CMS/original dates, or leave historical.

### E) Testimonials
No verified client quotes on file in the repo. Added a **clearly marked placeholder** section after “Our Clients” on the homepage. Provide real quotes (e.g. Symphony of the Seas) when ready.

---

## 5) Safety confirmations

| Rule | Status |
| --- | --- |
| No URL renames/removals | ✅ |
| Staging `robots.txt` = `Disallow: /` | ✅ (also reverted a prior TEMP Allow) |
| FAQPage schema kept; now synced to accordion Q&As (10) | ✅ |
| Ranking copy restructured into intro + bullets, not deleted | ✅ homepage + 13 pages |
| `/sports-bars/` links (no `https://sports-bars/`) | ✅ 0 bad links on disk |
| Theme colors unchanged | ✅ |

**Contact UX**
- Homepage ~240-item country `<select>` → searchable type-ahead (`country-picker.js`)
- Contact page already splits Billing vs other contacts; header phone `800.966.9329` / `tel:+18009669329` added
- Footer phone linkified

**Build pipeline** (`amplify.yml` / `npm run ux:build`)
1. `build_search_index.py`
2. `restructure_scannable.py`
3. `inject_ux_assets.py`

---

## Files added

- `website/css/site-ux.css`
- `website/js/site-search.js`
- `website/js/country-picker.js`
- `website/js/site-ux.js`
- `website/js/fuse.min.js`
- `website/search-index.json` (generated)
- `scripts/build_search_index.py`
- `scripts/inject_ux_assets.py`
- `scripts/restructure_scannable.py`
- `scripts/ux_screenshots.mjs`
