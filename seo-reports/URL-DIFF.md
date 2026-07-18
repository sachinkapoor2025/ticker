# URL Diff: codebase vs live sitemap (www.tickerplay.com)

## Status after blog mirror (option 1)

- Local core routes: 38
- Local blog path coverage: **304 / 304** (every live sitemap `/blog/*` path has a file)
- Live preferred domain: `https://www.tickerplay.com` (www)

## Blog content quality split (judgment call)

Production currently **redirects many stale sitemap URLs to `/blogs/`**. After mirroring:

| Category | Count | Action |
| --- | --- | --- |
| Real blog posts (unique content) | 208 | Keep as indexable pages at same URL |
| Stale sitemap URLs that redirect to `/blogs/` on live | 96 | Do **not** keep as 200 duplicates; implement **301 → `/blogs/`** in Amplify redirects to match production and avoid soft-404s |

## Core pages
All 38 non-blog marketing/product/policy URLs match live paths 1:1. No slug changes.

## Known broken link
- `href="//sports-bars/"` → must become `/sports-bars/`
