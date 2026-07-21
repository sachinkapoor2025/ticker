# Tickerplay — Project Overview

Local mirror of **[tickerplay.com](https://www.tickerplay.com)** — LED stock / news / sports ticker products — prepared for serverless hosting on AWS.

This document is the single entry point for understanding the whole repo. For day-to-day commands, see [`README.md`](README.md). For deep plans and reports, see [`seo-reports/`](seo-reports/).

---

## What this project is

| Aspect | Detail |
| --- | --- |
| **Product** | Marketing site for LED ticker displays (stock, news, sports, RSS, custom) |
| **Site type** | Static HTML (folder-based routes), not React/Next |
| **Pages** | ~38 core pages + ~208 blog posts + hidden admin UI (~250 HTML pages) |
| **Hosting** | AWS Amplify (static) + API Gateway / Lambda (APIs) |
| **Staging** | `https://dev.d3b6br5rr6wbn2.amplifyapp.com` (noindex) |
| **Production** | `https://www.tickerplay.com` |

---

## Architecture at a glance

```
Browser
  ├─ Amplify Hosting  →  website/*          (public site + /ticker-admin)
  ├─ /api/contact     →  Lambda → DynamoDB (+ optional SES email)
  ├─ /api/analytics   →  Lambda → DynamoDB (page views, sessions, TTL)
  ├─ /api/geo         →  Lambda (visitor geo bridge)
  └─ /api/admin/*     →  Lambda → DynamoDB (Cognito JWT + admin group)

Admin UI  →  /ticker-admin/  (hidden URL, Cognito login, noindex)
```

| Layer | Technology |
| --- | --- |
| Static website | AWS Amplify Hosting + CloudFront |
| APIs | API Gateway HTTP API + Lambda (Node.js 24, arm64) |
| Data | DynamoDB (`leads`, `analytics`) |
| Auth (admin) | Amazon Cognito (email/password, group `admin`) |
| Email (optional) | Amazon SES |
| Website CI/CD | Amplify (GitHub → build via `amplify.yml`) |
| API CI/CD | GitHub Actions → SAM (`infra/template.yaml`) |

---

## Repository layout

```
ticker/
├── website/                 # Public static site (Amplify artifact root)
│   ├── index.html           # Homepage
│   ├── {slug}/index.html    # Core product / application / legal pages
│   ├── blog/**/index.html   # Blog posts (~208)
│   ├── blogs/               # Blog listing
│   ├── ticker-admin/        # Hidden admin dashboard (Cognito)
│   ├── js/                  # Site scripts (analytics, search, UX)
│   ├── css/, img/, fonts/   # Assets
│   ├── sitemap*.xml         # Generated at build time
│   ├── robots.txt           # Staging blocks crawl; prod allows when IS_PRODUCTION
│   └── search-index.json    # Fuse.js on-site search index
│
├── api/
│   ├── contact/             # Lead form → DynamoDB (+ SES)
│   ├── analytics/           # Beacon ingest + geo
│   └── admin/               # Authenticated CRM / analytics APIs
│
├── infra/
│   └── template.yaml        # SAM stack: tables, Cognito, HTTP API, Lambdas
│
├── scripts/                 # Build-time Python tooling (SEO, UX, images, admin config)
├── seo-reports/             # Plans, checklists, Lighthouse, Amplify rewrite bundles
├── .github/workflows/       # API deploy (SAM) on push
├── amplify.yml              # Amplify preBuild: SEO/UX pipeline → publish website/
├── customHttp.yml           # Security headers + staging X-Robots-Tag
├── amplify-app.json         # Amplify / Cognito app config (synced from stack)
├── package.json             # npm scripts: serve, seo:build, sam:*
├── README.md                # Quick start & deploy notes
└── PROJECT-OVERVIEW.md      # This file
```

---

## Website content map

### Core marketing pages (examples)

- **Products:** LED stock ticker, financial ticker, news/sports/RSS/Twitter tickers, indoor/outdoor/flexible/circular tapes, programmable signs, multi-timezone clocks
- **Industries / applications:** sports bars, schools, trading labs, brokerage, wealth management, corporate floors, showrooms, stock exchange, etc.
- **Company / trust:** about, gallery, why-tickerplay, solutions, industries, contact
- **Policies:** privacy, returns, shipping, payment methods, service areas

### Blog

- Listing at `/blogs/`; posts under `/blog/{slug}/`
- Stale production URLs 301 → `/blogs/` via Amplify custom rules

### Admin (`/ticker-admin/`)

Not linked from the public site. Modules: Dashboard, Live users, Analytics, Search keywords, Visitor journeys, Enquiries CRM. Details: [`seo-reports/ADMIN-PLAN.md`](seo-reports/ADMIN-PLAN.md).

---

## APIs

| Endpoint | Auth | Role |
| --- | --- | --- |
| `POST /api/contact` | Public | Contact form → leads table (+ email notify) |
| `POST /api/analytics` | Public | Page views, heartbeats, searches, CTA clicks |
| `GET /api/geo` | Public | Geo lookup for analytics beacon |
| `GET/PATCH /api/admin/*` | Cognito JWT + `admin` group | Overview, sessions, leads CRM, live users |

Amplify proxies `/api/*` to the API Gateway stage (see `seo-reports/amplify-custom-rules.json`).

---

## Build & SEO pipeline

On every Amplify build (`amplify.yml` → `preBuild`), Python scripts run in order:

1. `content_quality.py` — meta descriptions, alt text, content fixes  
2. `optimize_images.py` — WebP + `<picture>` fallbacks  
3. `apply_keywords.py` — keyword targeting from curated list (`Seo.xlsx` → reports)  
4. `seo_build.py` — sitemap, robots, canonicals, JSON-LD, Amplify rules, `llms.txt`  
5. `build_search_index.py` — Fuse.js search index  
6. `restructure_scannable.py` — scannable intros / bullets  
7. `inject_ux_assets.py` — UX script/CSS injection  
8. `write_admin_config.py` — admin Cognito config into site  

**Important:** Staging must keep `IS_PRODUCTION` unset/false so `robots.txt` + `X-Robots-Tag: noindex` protect live rankings. Only a dedicated production Amplify app should set `IS_PRODUCTION=true`.

Local equivalents:

```bash
npm run serve              # http://localhost:4173
npm run seo:build          # staging-safe SEO/UX pipeline
npm run seo:build:prod     # production crawlable output
```

---

## Local development cheat sheet

| Goal | Command / URL |
| --- | --- |
| Preview site | `npm run serve` → http://localhost:4173 |
| Admin UI | http://localhost:4173/ticker-admin/ (manual URL) |
| Install API deps | `npm run api:install` |
| Build API | `npm run sam:build` |
| Deploy API | `npm run sam:deploy` then `python3 scripts/sync_cognito_config.py` |

---

## Documentation index

| Doc | Purpose |
| --- | --- |
| [`README.md`](README.md) | Architecture summary, deploy, secrets, Amplify rewrites |
| [`seo-reports/STACK.md`](seo-reports/STACK.md) | Stack discovery & hosting approach |
| [`seo-reports/KEYWORDS-PLAN.md`](seo-reports/KEYWORDS-PLAN.md) | Keyword curation (481 included / 20 excluded) |
| [`seo-reports/ADMIN-PLAN.md`](seo-reports/ADMIN-PLAN.md) | Admin modules, tracking, API routes |
| [`seo-reports/STEP-SUMMARY.md`](seo-reports/STEP-SUMMARY.md) | SEO/UX worklog by step |
| [`seo-reports/PRE-LAUNCH-CHECKLIST.md`](seo-reports/PRE-LAUNCH-CHECKLIST.md) | Production cutover checklist |
| [`seo-reports/LIGHTHOUSE-COMPARE.md`](seo-reports/LIGHTHOUSE-COMPARE.md) | Before/after Lighthouse |
| [`seo-reports/UX-PASS-REPORT.md`](seo-reports/UX-PASS-REPORT.md) | UX polish pass notes |
| [`seo-reports/DEMO-SEO-PROTECTION.md`](seo-reports/DEMO-SEO-PROTECTION.md) | Staging noindex strategy |

---

## CI/CD summary

| Path | Trigger | What runs |
| --- | --- | --- |
| **Website** | Push → Amplify | `amplify.yml` SEO pipeline → publish `website/` |
| **API** | Push → GitHub Actions | SAM build/deploy from `infra/template.yaml` |

Required GitHub secrets for API deploy: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; optional `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL`.

---

## Mental model

1. **Content lives as static HTML** under `website/` — edit pages or run build scripts; there is no app framework.  
2. **SEO/UX are build-time** — don’t expect sitemap/canonicals/search index without running the pipeline (or Amplify).  
3. **APIs are a thin serverless layer** — contact leads, analytics ingest, admin reads/writes.  
4. **Admin is intentionally obscure** — Cognito + hidden path; not a public login flow.  
5. **Staging ≠ production for SEO** — demo Amplify apps must stay noindex until production cutover.
