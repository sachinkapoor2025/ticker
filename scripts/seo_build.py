#!/usr/bin/env python3
"""
Build-time SEO assets for the static Tickerplay site.

Env:
  IS_PRODUCTION=true|false  (default: false → staging/noindex)
  SITE_ORIGIN=https://www.tickerplay.com
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"
REPORTS = ROOT / "seo-reports"

IS_PRODUCTION = os.environ.get("IS_PRODUCTION", "false").lower() in {"1", "true", "yes"}
SITE_ORIGIN = os.environ.get("SITE_ORIGIN", "https://www.tickerplay.com").rstrip("/")


def page_routes() -> list[str]:
    routes = []
    for index in WEBSITE.rglob("index.html"):
        rel = index.parent.relative_to(WEBSITE).as_posix()
        route = "/" if rel == "." else f"/{rel}/"
        routes.append(route)
    return sorted(set(routes))


def load_stub_redirects() -> list[dict]:
    path = REPORTS / "amplify-blog-301s.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def write_sitemap(routes: list[str]) -> None:
    """Indexable routes only — exclude thank-you style paths if added later."""
    exclude_prefixes = ("/thankyou", "/thank-you", "/admin", "/ticker-admin", "/cgi-bin")
    stubs = {r["source"] if r["source"].endswith("/") else r["source"] + "/" for r in load_stub_redirects()}
    # stubs file may have both with/without slash; normalize
    stub_paths = set()
    for r in load_stub_redirects():
        s = r["source"]
        stub_paths.add(s if s.endswith("/") else s + "/")
        stub_paths.add(s.rstrip("/"))

    indexable = []
    for route in routes:
        if any(route.startswith(p) for p in exclude_prefixes):
            continue
        if route in stub_paths or route.rstrip("/") in stub_paths:
            continue
        indexable.append(route)

    core = [r for r in indexable if not r.startswith("/blog/")]
    blogs = [r for r in indexable if r.startswith("/blog/")]

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def urlset(paths: list[str], priority: str) -> str:
        items = []
        for path in paths:
            loc = f"{SITE_ORIGIN}{path}"
            items.append(
                f"  <url>\n    <loc>{escape(loc)}</loc>\n"
                f"    <lastmod>{now}</lastmod>\n"
                f"    <changefreq>weekly</changefreq>\n"
                f"    <priority>{priority}</priority>\n  </url>"
            )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(items)
            + "\n</urlset>\n"
        )

    (WEBSITE / "sitemap-pages.xml").write_text(urlset(core, "0.8"), encoding="utf-8")
    (WEBSITE / "sitemap-blog.xml").write_text(urlset(blogs, "0.6"), encoding="utf-8")

    index = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <sitemap><loc>{escape(SITE_ORIGIN)}/sitemap-pages.xml</loc>"
        f"<lastmod>{now}</lastmod></sitemap>\n"
        f"  <sitemap><loc>{escape(SITE_ORIGIN)}/sitemap-blog.xml</loc>"
        f"<lastmod>{now}</lastmod></sitemap>\n"
        "</sitemapindex>\n"
    )
    (WEBSITE / "sitemap.xml").write_text(index, encoding="utf-8")
    print(f"sitemap: {len(core)} pages + {len(blogs)} blog posts")


def write_robots() -> None:
    if IS_PRODUCTION:
        body = f"""# Tickerplay production robots.txt
User-agent: *
Allow: /

# AI / answer-engine crawlers — explicitly allowed for visibility
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: Bingbot
Allow: /

# Internal / non-indexable
Disallow: /thankyou
Disallow: /thank-you
Disallow: /cgi-bin
Disallow: /admin
Disallow: /ticker-admin

Sitemap: {SITE_ORIGIN}/sitemap.xml
"""
    else:
        # Staging / Amplify preview — keep fully closed to crawlers
        body = """User-agent: *
Disallow: /
"""
    (WEBSITE / "robots.txt").write_text(body, encoding="utf-8")
    print(f"robots.txt written (IS_PRODUCTION={IS_PRODUCTION})")


def write_custom_http() -> None:
    """Amplify customHttp.yml — staging gets X-Robots-Tag; both get security headers."""
    common = [
        {"key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload"},
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"},
        {
            "key": "Content-Security-Policy",
            "value": (
                "default-src 'self' https: data: blob:; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; "
                "style-src 'self' 'unsafe-inline' https:; "
                "img-src 'self' data: https: blob:; "
                "font-src 'self' data: https:; "
                "connect-src 'self' https:; "
                "frame-src https:; "
                "media-src 'self' https: blob:;"
            ),
        },
    ]
    if not IS_PRODUCTION:
        common.insert(0, {"key": "X-Robots-Tag", "value": "noindex, nofollow"})

    # Amplify customHttp.yml format
    lines = ["customHeaders:", "  - pattern: '**'", "    headers:"]
    for h in common:
        lines.append(f"      - key: '{h['key']}'")
        # escape single quotes in value
        val = h["value"].replace("'", "''")
        lines.append(f"        value: '{val}'")
    # long cache for static assets
    lines += [
        "  - pattern: '/css/**'",
        "    headers:",
        "      - key: 'Cache-Control'",
        "        value: 'public, max-age=31536000, immutable'",
        "  - pattern: '/js/**'",
        "    headers:",
        "      - key: 'Cache-Control'",
        "        value: 'public, max-age=31536000, immutable'",
        "  - pattern: '/img/**'",
        "    headers:",
        "      - key: 'Cache-Control'",
        "        value: 'public, max-age=31536000, immutable'",
        "  - pattern: '/fonts/**'",
        "    headers:",
        "      - key: 'Cache-Control'",
        "        value: 'public, max-age=31536000, immutable'",
    ]
    (ROOT / "customHttp.yml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"customHttp.yml written (noindex={'yes' if not IS_PRODUCTION else 'no'})")


PRODUCT_PATHS = {
    "/led-ticker-tape/",
    "/indoor-ticker-tape/",
    "/outdoor-ticker-tape/",
    "/flexible-ticker-tape/",
    "/circular-ticker-tape/",
    "/custom-led-ticker-tape/",
    "/led-stock-ticker/",
    "/led-financial-ticker/",
    "/led-sports-ticker/",
    "/led-news-ticker/",
    "/led-twitter-ticker/",
    "/led-rss-ticker/",
    "/stock-market-ticker/",
    "/programmable-scrolling-led-sign/",
    "/multi-time-zone-digital-wall-clock/",
    "/ticker-models/",
}

ORG_SCHEMA = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Tickerplay",
    "alternateName": "Tickerplay Systems",
    "url": f"{SITE_ORIGIN}/",
    "logo": f"{SITE_ORIGIN}/img/logo-dark.png",
    "telephone": "+1-800-966-9329",
    "contactPoint": [
        {
            "@type": "ContactPoint",
            "telephone": "+1-800-966-9329",
            "contactType": "sales",
            "areaServed": "US",
            "availableLanguage": ["English"],
        }
    ],
    "sameAs": [],
}


def _strip_tags(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


def _extract_meta(text: str, name: str) -> str:
    m = re.search(
        rf'<meta[^>]+name=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']*)["\']',
        text,
        re.I,
    )
    if m:
        return m.group(1).strip()
    m = re.search(
        rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']{re.escape(name)}["\']',
        text,
        re.I,
    )
    return m.group(1).strip() if m else ""


def _extract_title(text: str) -> str:
    m = re.search(r"<title>([^<]*)</title>", text, re.I)
    return _strip_tags(m.group(1)) if m else "Tickerplay"


def _extract_faqs(text: str) -> list[dict]:
    # Ignore commented-out legacy FAQ blocks
    text = re.sub(r"(?is)<!--.*?-->", "", text)
    faqs = []
    seen = set()

    def add(q: str, a: str) -> None:
        q, a = _strip_tags(q), _strip_tags(a)
        key = q.lower()
        if q and a and key not in seen:
            seen.add(key)
            faqs.append(
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
            )

    # Prefer visible accordion FAQ when present
    for m in re.finditer(
        r'<button[^>]*class="[^"]*tp-faq-button[^"]*"[^>]*>\s*<span>(.*?)</span>.*?</button>\s*'
        r'<div[^>]*class="[^"]*tp-faq-panel[^"]*"[^>]*>\s*<p>(.*?)</p>',
        text,
        re.I | re.S,
    ):
        add(m.group(1), m.group(2))
    if faqs:
        return faqs

    for m in re.finditer(
        r"<h4[^>]*>\s*<b>\s*Q:\s*(.*?)</b>\s*</h4>\s*<p[^>]*>\s*<b>\s*A:\s*</b>\s*(.*?)</p>",
        text,
        re.I | re.S,
    ):
        add(m.group(1), m.group(2))
    return faqs


def _breadcrumbs(route: str, title: str) -> dict:
    parts = [p for p in route.strip("/").split("/") if p]
    items = [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE_ORIGIN}/"}
    ]
    path = ""
    for i, part in enumerate(parts, start=2):
        path += f"/{part}"
        label = title if part == parts[-1] else part.replace("-", " ").title()
        items.append(
            {
                "@type": "ListItem",
                "position": i,
                "name": label,
                "item": f"{SITE_ORIGIN}{path}/",
            }
        )
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def _jsonld_script(data) -> str:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f'<script type="application/ld+json">{payload}</script>'


def _inject_head(text: str, block: str) -> str:
    # remove prior build injections
    text = re.sub(
        r"\n?<!-- tickerplay-seo-start -->.*?<!-- tickerplay-seo-end -->\n?",
        "\n",
        text,
        flags=re.S,
    )
    injection = f"<!-- tickerplay-seo-start -->\n{block}\n<!-- tickerplay-seo-end -->\n"
    if re.search(r"</head>", text, re.I):
        return re.sub(r"</head>", injection + "</head>", text, count=1, flags=re.I)
    return injection + text


def enhance_html_files(routes: list[str]) -> None:
    sports_fixed = 0
    canonical_fixed = 0
    schema_pages = 0
    skip_prefixes = ("/ticker-admin/", "/admin/")
    for index in WEBSITE.rglob("index.html"):
        rel = index.parent.relative_to(WEBSITE).as_posix()
        route = "/" if rel == "." else f"/{rel}/"
        if any(route.startswith(p) for p in skip_prefixes):
            continue
        text = index.read_text(encoding="utf-8", errors="replace")
        original = text

        text2, n = re.subn(r'href="//sports-bars/"', 'href="/sports-bars/"', text)
        text, sports_fixed = text2, sports_fixed + n
        text2, n = re.subn(r"href='//sports-bars/'", "href='/sports-bars/'", text)
        text, sports_fixed = text2, sports_fixed + n

        abs_canonical = f"{SITE_ORIGIN}{route}"
        if re.search(r'rel=["\']canonical["\']', text, re.I):
            text2, n = re.subn(
                r'(<link[^>]*rel=["\']canonical["\'][^>]*href=["\'])([^"\']*)(["\'])',
                rf"\g<1>{abs_canonical}\g<3>",
                text,
                count=1,
                flags=re.I,
            )
            if n == 0:
                text2, n = re.subn(
                    r'(<link[^>]*href=["\'])([^"\']*)(["\'][^>]*rel=["\']canonical["\'])',
                    rf"\g<1>{abs_canonical}\g<3>",
                    text,
                    count=1,
                    flags=re.I,
                )
            text = text2
            if n:
                canonical_fixed += 1
        else:
            text = re.sub(
                r"</head>",
                f'    <link rel="canonical" href="{abs_canonical}" />\n</head>',
                text,
                count=1,
                flags=re.I,
            )
            canonical_fixed += 1

        text = re.sub(r"<html(?![^>]*lang=)", '<html lang="en"', text, count=1, flags=re.I)

        # Performance: hero video
        text = re.sub(
            r"<video([^>]*)playsinline=\"playsinline\" autoplay=\"autoplay\" muted=\"muted\" loop=\"loop\">",
            '<video\\1playsinline="playsinline" autoplay="autoplay" muted="muted" loop="loop" '
            'preload="metadata" poster="/img/led-stock-ticker.png">',
            text,
            count=1,
            flags=re.I,
        )
        # Lazy-load images missing loading= (skip logo / first few likely LCP)
        def lazy_img(m):
            tag = m.group(0)
            if "loading=" in tag or "logo-dark" in tag or "led-stock-ticker.png" in tag:
                return tag
            return tag[:-1] + ' loading="lazy" decoding="async">'

        text = re.sub(r"<img\b[^>]*>", lazy_img, text, flags=re.I)

        # Defer non-critical local scripts (keep inline alone)
        text = re.sub(
            r'<script\s+src="(/js/[^"]+)"(?![^>]*defer)([^>]*)>\s*</script>',
            r'<script src="\1" defer\2></script>',
            text,
            flags=re.I,
        )

        # Accessibility: skip link + main landmark once
        if 'id="main-content"' not in text:
            skip = (
                '<a class="sr-only sr-only-focusable" href="#main-content" '
                'style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">'
                "Skip to content</a>\n"
            )
            text = re.sub(r"<body([^>]*)>", r"<body\1>\n" + skip, text, count=1, flags=re.I)
            # wrap first major content: after nav bar end if present
            if 'class="main-container"' in text and 'id="main-content"' not in text:
                text = text.replace(
                    '<div class="main-container">',
                    '<main id="main-content" class="main-container" role="main">',
                    1,
                )
                # close main before common footer markers — best-effort
                text = re.sub(
                    r'(<footer\b)',
                    r"</main>\n\1",
                    text,
                    count=1,
                    flags=re.I,
                )

        # JSON-LD graphs
        title = _extract_title(text)
        desc = _extract_meta(text, "description") or title
        graphs = [ORG_SCHEMA]
        if route != "/":
            graphs.append(_breadcrumbs(route, title))

        if route in PRODUCT_PATHS:
            img_m = re.search(r'<img[^>]+src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']', text, re.I)
            image = (
                f"{SITE_ORIGIN}{img_m.group(1)}"
                if img_m and img_m.group(1).startswith("/")
                else f"{SITE_ORIGIN}/img/led-stock-ticker.png"
            )
            graphs.append(
                {
                    "@context": "https://schema.org",
                    "@type": "Product",
                    "name": title,
                    "description": desc,
                    "image": image,
                    "brand": {"@type": "Brand", "name": "Tickerplay"},
                    "url": abs_canonical,
                }
            )

        faqs = _extract_faqs(text)
        if faqs:
            graphs.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faqs})

        if route.startswith("/blog/") and route not in ("/blog/", "/blog/blogs/"):
            published = None
            mod = None
            pm = re.search(
                r'property=["\']article:published_time["\'][^>]*content=["\']([^"\']+)["\']',
                text,
                re.I,
            ) or re.search(
                r'content=["\']([^"\']+)["\'][^>]*property=["\']article:published_time["\']',
                text,
                re.I,
            )
            mm = re.search(
                r'property=["\']article:modified_time["\'][^>]*content=["\']([^"\']+)["\']',
                text,
                re.I,
            ) or re.search(
                r'content=["\']([^"\']+)["\'][^>]*property=["\']article:modified_time["\']',
                text,
                re.I,
            )
            if pm:
                published = pm.group(1)
            if mm:
                mod = mm.group(1)
            if not published:
                # fallback: first visible calendar date in page (not invented)
                date_m = re.search(
                    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}",
                    text,
                )
                if date_m:
                    published = date_m.group(0)
            article = {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                "headline": title,
                "description": desc,
                "mainEntityOfPage": abs_canonical,
                "author": {"@type": "Organization", "name": "Tickerplay"},
                "publisher": {
                    "@type": "Organization",
                    "name": "Tickerplay",
                    "logo": {"@type": "ImageObject", "url": f"{SITE_ORIGIN}/img/logo-dark.png"},
                },
            }
            if published:
                article["datePublished"] = published
                article["dateModified"] = mod or published
            graphs.append(article)

        block = "\n".join(_jsonld_script(g) for g in graphs)
        text = _inject_head(text, block)
        schema_pages += 1

        # First-party visitor beacon (skip admin UI)
        if "ticker-admin" not in str(index) and "/admin/" not in str(index) and "analytics-beacon.js" not in text:
            text = re.sub(
                r"</body>",
                '<script src="/js/analytics-beacon.js?v=2" defer></script>\n</body>',
                text,
                count=1,
                flags=re.I,
            )
        elif 'src="/js/analytics-beacon.js"' in text:
            text = text.replace(
                'src="/js/analytics-beacon.js"',
                'src="/js/analytics-beacon.js?v=2"',
            )

        if text != original:
            index.write_text(text, encoding="utf-8")

    print(
        f"enhanced HTML: sports={sports_fixed} canonical={canonical_fixed} schema_pages={schema_pages}"
    )


def write_404() -> None:
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page not found | Tickerplay</title>
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="{SITE_ORIGIN}/404.html" />
  <link href="/css/bootstrap.css" rel="stylesheet" />
  <link href="/css/theme.css" rel="stylesheet" />
</head>
<body>
  <main id="main-content" style="max-width:720px;margin:80px auto;padding:24px;font-family:system-ui,sans-serif;">
    <h1>Page not found</h1>
    <p>The page you requested is not available. It may have moved, or the link may be outdated.</p>
    <p><a href="/">Return home</a> · <a href="/blogs/">News &amp; Events</a> · <a href="/contact/">Contact</a></p>
  </main>
</body>
</html>
"""
    (WEBSITE / "404.html").write_text(html, encoding="utf-8")
    print("404.html written")


def write_llms_txt(routes: list[str]) -> None:
    """Curated map for AI crawlers (Step 3 partial — authoritative pages)."""
    descriptions = {
        "/": "LED stock ticker displays and ticker tapes for real-time market, news, and sports data.",
        "/about-us/": "About Tickerplay — LED ticker manufacturer and integrator.",
        "/contact/": "Contact Tickerplay for quotes and project consultation.",
        "/led-stock-ticker/": "LED stock ticker displays for trading floors and finance labs.",
        "/led-financial-ticker/": "Financial LED tickers for banks, brokerages, and wealth firms.",
        "/led-sports-ticker/": "Sports LED tickers for scores, live updates, and venues.",
        "/led-news-ticker/": "News LED ticker tapes for headlines and breaking updates.",
        "/led-ticker-tape/": "Overview of LED ticker tape products and form factors.",
        "/indoor-ticker-tape/": "Indoor LED ticker tape solutions.",
        "/outdoor-ticker-tape/": "Weather-resistant outdoor LED ticker tapes.",
        "/flexible-ticker-tape/": "Flexible LED ticker tapes for custom shapes.",
        "/circular-ticker-tape/": "Circular LED ticker displays.",
        "/custom-led-ticker-tape/": "Custom-angle and bespoke LED ticker installations.",
        "/university-finance-lab/": "LED tickers for university finance labs and trading rooms.",
        "/stock-brokerage-firms/": "Ticker displays for stock brokerage firms.",
        "/business-school/": "LED tickers for business schools.",
        "/sports-bars/": "Sports ticker installations for sports bars and hospitality.",
        "/blogs/": "Tickerplay news, guides, and industry articles.",
        "/gallery/": "Installation gallery of Tickerplay LED ticker projects.",
        "/ticker-models/": "Tickerplay LED ticker models and configurations.",
    }
    lines = [
        "# Tickerplay",
        "",
        "> Tickerplay designs and installs LED stock tickers, financial tickers, sports tickers, and custom LED ticker tapes for universities, brokerages, corporate floors, and venues.",
        "",
        f"Canonical site: {SITE_ORIGIN}/",
        "",
        "## Primary pages",
        "",
    ]
    for path, desc in descriptions.items():
        if path == "/" or (WEBSITE / path.strip("/")).joinpath("index.html").exists() or path == "/":
            if path != "/" and not (WEBSITE / path.strip("/") / "index.html").exists():
                # homepage check
                if path != "/":
                    continue
            lines.append(f"- [{path}]({SITE_ORIGIN}{path}): {desc}")
    lines += [
        "",
        "## Blog",
        "",
        f"- [/blogs/]({SITE_ORIGIN}/blogs/): Article index",
        f"- See {SITE_ORIGIN}/sitemap-blog.xml for the full post list",
        "",
        "## Optional",
        "",
        f"- [/privacy-policy/]({SITE_ORIGIN}/privacy-policy/)",
        f"- [/shipping-and-handling/]({SITE_ORIGIN}/shipping-and-handling/)",
        f"- [/why-tickerplay/]({SITE_ORIGIN}/why-tickerplay/): Why Tickerplay / brand comparisons",
        f"- [/industries/]({SITE_ORIGIN}/industries/): Industry applications",
        f"- [/service-areas/]({SITE_ORIGIN}/service-areas/): Nationwide installation coverage",
        "",
    ]
    (WEBSITE / "llms.txt").write_text("\n".join(lines), encoding="utf-8")
    print("llms.txt written")


def write_amplify_redirects_bundle() -> None:
    """Merge API proxies + blog 301s for Amplify customRules."""
    contact = "https://9h23e2v4l9.execute-api.us-east-1.amazonaws.com/prod/api/contact"
    analytics = "https://9h23e2v4l9.execute-api.us-east-1.amazonaws.com/prod/api/analytics"
    geo = "https://9h23e2v4l9.execute-api.us-east-1.amazonaws.com/prod/api/geo"
    admin = "https://9h23e2v4l9.execute-api.us-east-1.amazonaws.com/prod/api/admin"
    app_json = ROOT / "amplify-app.json"
    if app_json.exists():
        try:
            data = json.loads(app_json.read_text())
            contact = data.get("contactApi", contact)
            analytics = data.get("analyticsApi", analytics)
            geo = data.get("geoApi", geo)
            admin = data.get("adminApi", admin)
        except Exception:
            pass

    rules = [
        {"source": "/api/contact", "target": contact, "status": "200"},
        {"source": "/api/analytics", "target": analytics, "status": "200"},
        {"source": "/api/geo", "target": geo, "status": "200"},
        {"source": "/api/admin/<*>", "target": f"{admin}/<*>", "status": "200"},
    ]
    rules.extend(load_stub_redirects())
    out = REPORTS / "amplify-custom-rules.json"
    out.write_text(json.dumps(rules, indent=2), encoding="utf-8")
    print(f"amplify custom rules: {len(rules)} → {out}")


def main() -> int:
    if not WEBSITE.exists():
        print("website/ missing", file=sys.stderr)
        return 1
    routes = page_routes()
    print(f"routes on disk: {len(routes)} | IS_PRODUCTION={IS_PRODUCTION} | origin={SITE_ORIGIN}")
    write_sitemap(routes)
    write_robots()
    write_custom_http()
    enhance_html_files(routes)
    write_llms_txt(routes)
    write_amplify_redirects_bundle()
    write_404()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
