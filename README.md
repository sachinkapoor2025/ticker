# Tickerplay

Local copy of [tickerplay.com](https://tickerplay.com) prepared for serverless hosting on AWS.

## Architecture

| Layer | Service |
| --- | --- |
| Static website | **AWS Amplify Hosting** (CloudFront CDN under the hood) |
| Contact API | **API Gateway HTTP API** + **Lambda** |
| Lead storage | **DynamoDB** |
| Email notify (optional) | **SES** |
| Website CI/CD | **Amplify** (connected to GitHub — managed in AWS console) |
| API CI/CD | **GitHub Actions** → SAM / Lambda only |

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

`npm run deploy:aws` can still bootstrap the API stack locally. Amplify itself is created/managed in the AWS console (GitHub → Amplify).

## GitHub Actions (API only)

On push to `main`, Actions deploys the contact API (SAM / Lambda). The website is built/hosted by Amplify from the same repo.

Repo secrets needed:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` (optional)

In Amplify console, add a rewrite so forms keep working:

| Source | Target | Status |
| --- | --- | --- |
| `/api/contact` | your ContactEndpoint from stack outputs | `200` |

Example target: `https://9h23e2v4l9.execute-api.us-east-1.amazonaws.com/prod/api/contact`

## Notes

- **Core marketing pages** (38) + assets are mirrored now.
- **~300 blog posts** are still on the live server; we can pull them next (or use Monday’s server files for a complete PHP→static migration).
- Live PHP backend (`/mail/index.php`) is replaced by `/api/contact` Lambda.
- When Monday’s server dump arrives, we can merge missing assets, blogs, and CMS content into this repo.
