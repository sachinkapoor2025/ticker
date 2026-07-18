# Step 8 — Pre-launch checklist (Tickerplay → production)

Staging: https://dev.d3b6br5rr6wbn2.amplifyapp.com/  
Production target: https://www.tickerplay.com/

## 1) URL parity (must be green before cutover)

- [x] All **38** core live paths exist at the same slug in this repo
- [x] **208** real `/blog/*` posts mirrored at the same paths
- [x] **96** stale sitemap blog URLs configured as **301 → `/blogs/`** (matches live redirect behavior)
- [x] No intentional slug renames without approved 301s
- [ ] Re-crawl staging with Screaming Frog / Search Console export and confirm zero unexpected 404s on the live URL set
- [ ] Confirm Amplify custom rules (193) are also applied on the **production** Amplify app (not only `dev`)

## 2) Staging must stay deindexed; production must open

| Setting | Staging (`dev`) | Production |
| --- | --- | --- |
| Amplify env `IS_PRODUCTION` | `false` (set) | **`true` (required)** |
| `robots.txt` | `Disallow: /` | Allow + Sitemap |
| `X-Robots-Tag` | `noindex, nofollow` via `customHttp.yml` | **Must NOT include noindex** |

- [x] Staging currently sends `X-Robots-Tag: noindex, nofollow` and disallow-all robots
- [ ] Create/configure production Amplify branch/app with `IS_PRODUCTION=true`
- [ ] After first production deploy, curl headers and confirm **no** `noindex`
- [ ] After cutover, submit `https://www.tickerplay.com/sitemap.xml` to Google Search Console + Bing Webmaster Tools

## 3) Technical SEO already in repo

- [x] Dynamic sitemap index (`sitemap.xml` + pages + blog)
- [x] Absolute canonicals → `https://www.tickerplay.com{path}/`
- [x] `llms.txt` + AI crawler allows (production robots)
- [x] JSON-LD: Organization, FAQPage, Product, BreadcrumbList, BlogPosting
- [x] Security headers (HSTS, nosniff, Referrer-Policy, CSP, Permissions-Policy)
- [x] Real 404 page + stale-blog 301s
- [x] Contact API rewrite `/api/contact` → Lambda

## 4) Lighthouse (staging) — see `LIGHTHOUSE-COMPARE.md`

**Important judgment call:** Lighthouse **SEO scores dropped on staging** primarily because the site is intentionally **blocked from indexing** (`is-crawlable` / robots noindex). That is correct for staging and will reverse on production when `IS_PRODUCTION=true`.

| Page | Perf Δ | A11y Δ | BP Δ | SEO Δ |
| --- | --- | --- | --- | --- |
| Home desktop | -19 | +5 | +3 | -14 (noindex) |
| Home mobile | **+26** | +8 | +3 | -14 (noindex) |
| LED stock ticker | +1 | +7 | +3 | -14 (noindex) |
| About us | 0 | +5 | 0 | -22 (noindex) |

- [ ] Re-run Lighthouse on **production** URLs after cutover (same 4 pages) and compare to staging-after (ignore staging SEO score)
- [ ] Target: LCP &lt; 2.5s, CLS &lt; 0.1, INP &lt; 200ms on mobile (continue WebP/srcset if still short)

## 5) Cutover day

1. [ ] Freeze content changes
2. [ ] Deploy `dev` (or `main`) to production Amplify with `IS_PRODUCTION=true`
3. [ ] Apply production Amplify redirects/rewrites from `seo-reports/amplify-custom-rules.json`
4. [ ] Point DNS / confirm www canonical host still preferred
5. [ ] Validate: homepage, 2 product pages, 2 blog posts, 1 stale-blog 301, `/api/contact`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`
6. [ ] Rich Results Test on production homepage FAQ + 1 Product + 1 BlogPosting
7. [ ] Submit sitemap in GSC + Bing
8. [ ] Monitor GSC Coverage/Performance daily for 14 days (new 404s, impression drops, crawl errors)

## 6) Residual improvements (post-launch OK)

- WebP/AVIF + `srcset` image pipeline (largest remaining CWV lever on desktop)
- `font-display: swap` / preload primary font files
- Fuller keyboard/contrast audit on quote modal + nav dropdowns
- Deduplicate homepage dual FAQ visual sections (schema already de-duped)
- Confirm `sameAs` social profile URLs when client provides official profiles
