# Tickerplay Admin Dashboard

## Access (hidden URL — no public login button)

| Item | Value |
| --- | --- |
| URL | `/ticker-admin/` (type manually; not linked from the public website) |
| Auth | Amazon Cognito username (email) + password |
| Authorization | User must be in Cognito group **`admin`** |

## Modules

| Module | Purpose |
| --- | --- |
| **Dashboard** | KPIs, traffic trend, live preview, top pages, devices, countries, pipeline snapshot |
| **Live users** | Who is on the site now, which page, device, location (15s refresh) |
| **Analytics** | Page views, sessions, duration, devices, browsers, OS, geo, traffic sources, CTAs |
| **Searches** | Top keywords (`utm_term`, `q`/`s`, on-site search) + counts + CSV export |
| **Visitors** | Session list + journey drawer (paths, time on page, source) + CSV |
| **Enquiries** | Contact-us CRM — status, assignee, notes, filters, CSV export |

## Tracking (public site)

`website/js/analytics-beacon.js` sends:

- `page_view`, `session_ping` (time on page), `heartbeat` (live presence)
- `search` (keywords), `cta_click` (pricing/contact interest)
- Device / browser / OS, timezone, UTM, geo via `/api/geo`

## API (Cognito JWT + admin group)

| Method | Path |
| --- | --- |
| GET | `/api/admin/me` |
| GET | `/api/admin/overview?days=` |
| GET | `/api/admin/analytics?days=` |
| GET | `/api/admin/searches?days=` |
| GET | `/api/admin/sessions?days=` |
| GET | `/api/admin/sessions/{id}` |
| GET | `/api/admin/live` |
| GET | `/api/admin/visitors?days=` |
| GET | `/api/admin/leads` |
| PATCH | `/api/admin/leads/{id}` |
| POST | `/api/analytics` (public ingest) |
| GET | `/api/geo` (public geo bridge) |

## Excluded (ecommerce-only)

Products, cart, coupons, Stripe/Razorpay, abandoned-cart email — not relevant for this LED marketing site.

## Create an admin user

```bash
POOL_ID=<UserPoolId from stack outputs>
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username you@company.com \
  --user-attributes Name=email,Value=you@company.com Name=email_verified,Value=true \
  --temporary-password 'TempPass1234' \
  --message-action SUPPRESS

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username you@company.com \
  --group-name admin
```

First login at `/ticker-admin/` will prompt to set a new password.

## Deploy

1. Deploy SAM stack (`infra/template.yaml`) so new admin routes + `/api/geo` + analytics TTL exist.
2. Ensure Amplify custom rules include `/api/geo` (see `seo-reports/amplify-custom-rules.json` / `scripts/seo_build.py`).
3. Publish `website/` (includes `/ticker-admin/` + updated `analytics-beacon.js`).
