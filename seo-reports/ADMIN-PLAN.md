# Tickerplay Admin Dashboard

## Access (hidden URL — no public login button)

| Item | Value |
| --- | --- |
| URL | `/ticker-admin/` (type manually; not linked from the site) |
| Auth | Amazon Cognito username (email) + password |
| Authorization | User must be in Cognito group **`admin`** |

## Modules

- Dashboard KPIs (leads, visitors, conversion)
- Enquiry pipeline (status + notes)
- Recent visitors / top pages

## Excluded (ecommerce-only)

Products, cart, coupons, Stripe, etc.

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
