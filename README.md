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
         ↘ /api/admin/*    → Lambda → DynamoDB (Cognito JWT + admin group)
Admin UI → /ticker-admin/ (hidden URL, Cognito login, noindex)
```

## Repo layout

```
website/              # Public site + /ticker-admin (hidden)
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
# admin (manual URL only): http://localhost:4173/ticker-admin/
```

## SEO keywords

- Curated from `Seo.xlsx`: **481 included**, **20 excluded** (broad digital-signage noise).
- See `seo-reports/KEYWORDS-PLAN.md`.
- Applied on Amplify build via `scripts/apply_keywords.py`.

## Admin dashboard

- **URL:** `/ticker-admin/` — type it manually; there is **no** login link on the public site.
- **Auth:** Cognito email + password; user must be in group **`admin`**.
- **Modules:** Dashboard, Live users, Analytics (devices / geo / sources), Search keywords, Visitor journeys, Enquiries CRM.
- Details: `seo-reports/ADMIN-PLAN.md`.

## Deploy API (local)

```bash
npm run api:install
sam build -t infra/template.yaml
sam deploy --stack-name tickerplay-api-prod --capabilities CAPABILITY_IAM --resolve-s3 \
  --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides EnvironmentName=prod AllowedOrigin=*
# then refresh Cognito IDs into amplify-app.json + config.js:
python3 scripts/sync_cognito_config.py
```

## GitHub Actions secrets

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` (optional)

## Amplify rewrites (status 200)

| Source | Target |
| --- | --- |
| `/api/contact` | `…/prod/api/contact` |
| `/api/analytics` | `…/prod/api/analytics` |
| `/api/geo` | `…/prod/api/geo` |
| `/api/admin/<*>` | `…/prod/api/admin/<*>` |

Generated bundle: `seo-reports/amplify-custom-rules.json`.

Staging app: `https://dev.d3b6br5rr6wbn2.amplifyapp.com` (`IS_PRODUCTION` unset → noindex).
