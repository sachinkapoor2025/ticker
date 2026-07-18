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
