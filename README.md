# Tickerplay

Local copy of [tickerplay.com](https://tickerplay.com) prepared for serverless hosting on AWS.

## Architecture

| Layer | Service |
| --- | --- |
| Static website | **AWS Amplify Hosting** (CloudFront CDN under the hood) |
| Contact API | **API Gateway HTTP API** + **Lambda** |
| Lead storage | **DynamoDB** |
| Email notify (optional) | **SES** |
| CI/CD | **GitHub Actions** → SAM deploy + Amplify zip deploy |

```
Browser → Amplify (CloudFront) → website/*
         ↘ rewrite /api/contact → API Gateway → Lambda → DynamoDB (+ SES)
```

## Repo layout

```
website/          # Mirrored public site (HTML/CSS/JS/images)
api/contact/      # Lambda handler for lead forms
infra/template.yaml
scripts/setup-aws.sh
.github/workflows/deploy.yml
amplify.yml
```

## Local preview

```bash
npm run serve
# open http://localhost:4173
```

## One-time AWS bootstrap

Requires AWS CLI credentials (already configured on this machine as user `AI`).

```bash
export AWS_REGION=us-east-1
# optional once SES identities are verified:
# export CONTACT_TO_EMAIL=you@example.com
# export CONTACT_FROM_EMAIL=noreply@yourdomain.com

npm run deploy:aws
```

This will:

1. Deploy the contact API stack (`tickerplay-api-prod`)
2. Create Amplify app `tickerplay` + `main` branch
3. Proxy `/api/contact` to the Lambda URL
4. Upload the `website/` folder

## GitHub + Actions

1. Create/push this repo to GitHub
2. Add repository secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AMPLIFY_APP_ID` (printed by `npm run deploy:aws`, also in `.amplify-app-id`)
   - `AMPLIFY_BRANCH` = `main`
   - `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` (optional)
3. Push to `main` — workflow deploys API then website

## Notes

- **Core marketing pages** (38) + assets are mirrored now.
- **~300 blog posts** are still on the live server; we can pull them next (or use Monday’s server files for a complete PHP→static migration).
- Live PHP backend (`/mail/index.php`) is replaced by `/api/contact` Lambda.
- When Monday’s server dump arrives, we can merge missing assets, blogs, and CMS content into this repo.
