# SEO worklog — summaries by step

## Blog mirror (option 1) — DONE

| Item | Result |
| --- | --- |
| Live `/blog/*` sitemap URLs | 304 |
| Real unique posts on disk | **208** at same paths |
| Stale URLs that redirect to `/blogs/` on production | **96** → Amplify **301 → `/blogs/`** (rules in `amplify-custom-rules.json`) |
| Soft-200 stub HTML | Removed (would hurt SEO) |

**Judgment call:** Matching production’s redirects for dead blog URLs (301 to `/blogs/`) instead of republishing empty/duplicate listing pages as 200s.

## Step 2 (in progress) — DONE locally

- Build script: `scripts/seo_build.py` (runs in Amplify `preBuild`)
- `website/sitemap.xml` index + `sitemap-pages.xml` (38) + `sitemap-blog.xml` (208)
- Staging `robots.txt` = `Disallow: /`
- Production robots (when `IS_PRODUCTION=true`) allows search + AI bots, points to sitemap
- Absolute canonicals → `https://www.tickerplay.com{path}/` on all 246 HTML pages
- Fixed `//sports-bars/` → `/sports-bars/`
- `customHttp.yml`: staging `X-Robots-Tag: noindex, nofollow` + security headers + asset cache
- `llms.txt` created (Step 3 start)
- Amplify rules bundle: API proxy + 192 blog 301s → `seo-reports/amplify-custom-rules.json`

**Amplify console (manual):** set env `IS_PRODUCTION=false` on staging app `d3b6br5rr6wbn2`. Only set `true` on the future production app.

## Amplify `dev` app (d3b6br5rr6wbn2) — applied

- Branch env: `IS_PRODUCTION=false`
- Custom rules: 193 (API `/api/contact` proxy + 192 blog 301s → `/blogs/`)
- Staging URL: https://dev.d3b6br5rr6wbn2.amplifyapp.com/
- Pushed commit to `dev` with SEO pipeline + blog mirror + schema/CWV/a11y basics

## Steps 3–7 incremental (this push)

- JSON-LD: Organization (all), FAQPage (where FAQs exist), Product (product paths), BreadcrumbList (inner), BlogPosting (blog posts)
- `llms.txt` + AI crawler allows in production robots
- Hero video: `preload=metadata` + poster
- Lazy images, deferred `/js/*`, skip link, `<main id="main-content">`
- `404.html`, security headers via `customHttp.yml` (staging includes X-Robots-Tag)

## Step 5 — content quality (DONE)

- Unique meta descriptions for all 38 core pages (`scripts/content_quality.py`)
- Audience-specific **Why Choose Us** copy on application/product pages (sports bars, schools, finance lab, brokerage, etc.)
- Alt text filled for images missing/empty alt (filename-derived; logos labeled)
- Fixed broken `img` tags from earlier lazy-load (`"/ loading=` → `" loading=`)
- Blog posts (208): visible “Last updated” + `article:published_time` / `modified_time` from on-page dates (not invented); BlogPosting schema uses ISO

## Still open (next increments)

- Step 4 deeper: WebP/srcset pipeline, unused CSS purge, font-display
- Step 6 fuller keyboard/contrast audit
- Step 8: after-Lighthouse + production cutover checklist
