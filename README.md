# Tickerplay

Local copy of [tickerplay.com](https://tickerplay.com) prepared for serverless hosting on AWS.

## Architecture

| Layer | Service |
| --- | --- |
| Static website | **AWS Amplify Hosting** |
| Contact / Analytics / Admin APIs | **API Gateway HTTP API** + **Lambda** |
| Leads + page views | **DynamoDB** |
| Email notify (optional) | **SES** |
| Website CI/CD | **Amplify** (GitHub → Amplify console) |
| API CI/CD | **GitHub Actions** → SAM |

```
Browser → Amplify → website/*
         ↘ /api/contact    → Lambda → DynamoDB (+ SES)
         ↘ /api/analytics  → Lambda → DynamoDB
         ↘ /api/admin/*    → Lambda → DynamoDB (JWT)
Admin UI → /admin/ (static, noindex)
```

## Repo layout

```
website/              # Public site + /admin dashboard
api/contact|analytics|admin/
infra/template.yaml
scripts/              # SEO, keywords, image optimize
seo-reports/          # Keyword plans, Amplify rules, checklists
Seo.xlsx              # Source keyword list (501)
```

## Local preview

```bash
npm run serve
# site: http://localhost:4173
# admin: http://localhost:4173/admin/
```

## SEO keywords

- Curated from `Seo.xlsx`: **481 included**, **20 excluded** (broad digital-signage noise).
- See `seo-reports/KEYWORDS-PLAN.md`.
- Applied on Amplify build via `scripts/apply_keywords.py`.

## Admin dashboard

- URL: `/admin/` (password-gated API).
- Tracks: visitors (page views), enquiries/leads, status pipeline, conversion rate, top pages.
- Default SAM password: `TickerplayAdmin!2026` — **change** via parameter `AdminPassword` or GitHub secret `ADMIN_PASSWORD`.
- Plan: `seo-reports/ADMIN-PLAN.md`.

## Deploy API (local)

```bash
npm run api:install
sam build -t infra/template.yaml
sam deploy --stack-name tickerplay-api-prod --capabilities CAPABILITY_IAM --resolve-s3 \
  --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides EnvironmentName=prod AllowedOrigin=* AdminPassword='YOUR_STRONG_PASSWORD'
```

## GitHub Actions secrets

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` (optional)
- `ADMIN_PASSWORD` / `ADMIN_TOKEN_SECRET` (recommended)

## Amplify rewrites (status 200)

| Source | Target |
| --- | --- |
| `/api/contact` | `…/prod/api/contact` |
| `/api/analytics` | `…/prod/api/analytics` |
| `/api/admin/<*>` | `…/prod/api/admin/<*>` |

Generated bundle: `seo-reports/amplify-custom-rules.json`.

Staging app: `https://dev.d3b6br5rr6wbn2.amplifyapp.com` (`IS_PRODUCTION` unset → noindex).
