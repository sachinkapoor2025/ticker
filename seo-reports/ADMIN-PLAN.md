# Tickerplay Admin Dashboard — plan (vs hr-ecom)

Reference: `/Users/sachinkapoor/Desktop/HR_EC/hr-ecom` admin (ecommerce).

## Included (relevant to LED ticker B2B)

| Module | Why |
| --- | --- |
| Dashboard KPIs | Leads, 30d leads, page views, conversion rate |
| Enquiry pipeline | new → contacted → follow_up → converted / closed + notes |
| Visitors | Recent page views + referrer/session (lite analytics) |
| Top pages | See which product/industry pages convert interest |
| Site beacon | `/js/analytics-beacon.js` → `POST /api/analytics` |

## Excluded (ecommerce-only noise)

Products, categories, cart, checkout, coupons, payments/Stripe, shipping rates, email campaign blast tools, load-test console.

## Future (phase 2)

- Quote value / estimated project size fields  
- Email/Slack alert on new lead  
- UTM capture on forms  
- Cognito instead of shared password  
- CSV export  

## Access

- URL: `/admin/` (noindex)  
- Default password via SAM param `AdminPassword` (change in deploy)  
- APIs under `/api/admin/*` (proxied by Amplify like contact)
