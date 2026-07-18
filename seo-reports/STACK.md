# Step 1 — Stack discovery

| Item | Finding |
| --- | --- |
| Framework | **Static HTML site** (not React/Next/Gatsby). Mirrored from PHP/Apache production. |
| Routing | Folder-based: `website/{slug}/index.html` → `/{slug}/`. No client router. |
| `<head>` tags | Hand-authored (or CMS-rendered) inside each HTML file. Titles/descriptions/canonicals are per-file strings — many canonicals are currently relative (`href="/"`). |
| Images | Raw files under `website/img/` (JPG/PNG/WebP/MP4). No image pipeline, no `srcset`, mixed spaces in filenames. |
| Sitemap / robots | **None** in repo today. Live site has a hand-generated `sitemap.xml` (~342 URLs). |
| Amplify | Root `amplify.yml` publishes `website/` as artifacts. Hosting is Amplify + CloudFront. API is separate (API Gateway + Lambda via GitHub Actions). |
| Staging host | `main.d3b6br5rr6wbn2.amplifyapp.com` |
| Production host | `https://www.tickerplay.com` (www preferred per live sitemap) |

## Idiomatic approach for this stack

Use build-time scripts (Node) to generate `sitemap.xml`, `robots.txt`, `llms.txt`, inject JSON-LD / absolute canonicals, Amplify `customHttp.yml` for security + staging `X-Robots-Tag`, and `_redirects` / Amplify rewrites for 301s — not Next.js middleware.
