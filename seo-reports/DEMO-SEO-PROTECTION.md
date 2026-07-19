# Demo URL protection (main / dev / dev-prof)

These Amplify preview hosts are for **client demos only** and must never compete with live [tickerplay.com](https://www.tickerplay.com):

- `https://main.d3b6br5rr6wbn2.amplifyapp.com`
- `https://dev.d3b6br5rr6wbn2.amplifyapp.com`
- `https://dev-prof.d3b6br5rr6wbn2.amplifyapp.com`
- any other `*.amplifyapp.com` branch preview

## Automatic protections (when `IS_PRODUCTION` is unset/false)

| Layer | Behavior |
| --- | --- |
| `robots.txt` | `Disallow: /` for all agents (incl. Googlebot / AI bots) |
| `customHttp.yml` | `X-Robots-Tag: noindex, nofollow, noarchive` on every response |
| HTML `<meta name="robots">` | Forced to `noindex, nofollow, noarchive` at build time |
| Sitemaps | Empty on demo builds (production owns crawl maps) |
| `llms.txt` | Explicit “do not crawl this host” + points to live site |

Live site rankings stay on **www.tickerplay.com** only.

## Amplify console checklist (do once)

1. For the demo Amplify app (`d3b6br5rr6wbn2`), confirm env **`IS_PRODUCTION` is unset or `false`** on **every** branch (`main`, `dev`, `dev-prof`, …).
2. Do **not** set `IS_PRODUCTION=true` on this demo app.
3. Prefer sharing demo links privately (email / Zoom). Avoid posting them publicly or submitting them to Google Search Console.
4. If a demo URL was ever submitted to Search Console, remove it / request removal — property should be **www.tickerplay.com** only.

## After deploy — quick verify

```bash
curl -sI https://dev-prof.d3b6br5rr6wbn2.amplifyapp.com/ | grep -i x-robots
curl -s https://dev-prof.d3b6br5rr6wbn2.amplifyapp.com/robots.txt
# Expect: X-Robots-Tag: noindex… and robots Disallow: /
```
