#!/usr/bin/env python3
"""Apply curated Seo.xlsx keywords to site pages (natural language, not stuffing)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"
BY_PAGE = json.loads((ROOT / "seo-reports/keywords-by-page.json").read_text())
ORIGIN = "https://www.tickerplay.com"

SHELL = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <meta name="keywords" content="{keywords}" />
  <link rel="canonical" href="{canonical}" />
  <link href="/css/bootstrap.css" rel="stylesheet" />
  <link href="/css/theme.css" rel="stylesheet" />
  <link href="/css/custom.css" rel="stylesheet" />
</head>
<body>
<a class="sr-only" href="#main-content">Skip to content</a>
<nav class="bar bar--sm" style="padding:12px 20px;border-bottom:1px solid #eee;">
  <a href="/"><img src="/img/logo-dark.png" alt="Tickerplay logo" style="height:36px"></a>
  <span style="float:right;margin-top:8px;">
    <a href="/led-stock-ticker/">Stock Tickers</a> ·
    <a href="/sports-bars/">Sports</a> ·
    <a href="/contact/">Get Quote</a>
  </span>
</nav>
<main id="main-content" class="container" style="max-width:920px;margin:40px auto;padding:0 16px 80px;font-family:system-ui,sans-serif;line-height:1.55;color:#222;">
{body}
<p style="margin-top:48px;"><a href="/contact/">Request a quote</a> · <a href="/">Home</a></p>
</main>
<script src="/js/analytics-beacon.js" defer></script>
</body>
</html>
"""


def kw_list(path: str, limit: int = 24) -> list[str]:
    items = BY_PAGE.get(path, [])
    # Prefer Must-Have then Good-to-Have
    must = [i["keyword"] for i in items if i.get("priority") == "Must-Have"]
    good = [i["keyword"] for i in items if i.get("priority") != "Must-Have"]
    ordered = must + good
    # dedupe preserve order
    seen = set()
    out = []
    for k in ordered:
        kl = k.lower()
        if kl in seen:
            continue
        seen.add(kl)
        out.append(k)
        if len(out) >= limit:
            break
    return out


def meta_keywords(path: str) -> str:
    return ", ".join(kw_list(path, 18))


def seo_block(path: str, heading: str = "Related searches & solutions") -> str:
    kws = kw_list(path, 16)
    if not kws:
        return ""
    # Natural prose using keywords — not a raw keyword dump
    chips = " · ".join(kws[:12])
    return f"""
<section class="tp-seo-related" style="margin:48px 0;padding:24px;background:#f7f9fb;border-radius:8px;">
  <h2 style="font-size:1.35rem;margin:0 0 12px;">{heading}</h2>
  <p style="margin:0 0 8px;">Customers researching Tickerplay often look for: <strong>{chips}</strong>.</p>
  <p style="margin:0;color:#444;">We design and install commercial LED ticker systems for finance, sports, education, and corporate environments — request a custom quote for your space.</p>
</section>
"""


def upsert_block(html: str, block: str) -> str:
    html = re.sub(
        r'<section class="tp-seo-related"[\s\S]*?</section>\s*',
        "",
        html,
        flags=re.I,
    )
    if re.search(r"</main>", html, re.I):
        return re.sub(r"</main>", block + "\n</main>", html, count=1, flags=re.I)
    # before footer or end body
    if re.search(r"<footer\b", html, re.I):
        return re.sub(r"<footer\b", block + "\n<footer", html, count=1, flags=re.I)
    return re.sub(r"</body>", block + "\n</body>", html, count=1, flags=re.I)


def set_keywords_meta(html: str, keywords: str) -> str:
    if re.search(r'name=["\']keywords["\']', html, re.I):
        html2, n = re.subn(
            r'(<meta[^>]*name=["\']keywords["\'][^>]*content=["\'])([^"\']*)(["\'])',
            rf"\g<1>{keywords}\g<3>",
            html,
            count=1,
            flags=re.I,
        )
        if n:
            return html2
    return re.sub(
        r"</head>",
        f'    <meta name="keywords" content="{keywords}" />\n</head>',
        html,
        count=1,
        flags=re.I,
    )


def write_new_page(slug: str, title: str, description: str, body: str) -> None:
    path = f"/{slug}/"
    kws = meta_keywords(path)
    html = SHELL.format(
        title=title,
        description=description[:160],
        keywords=kws,
        canonical=f"{ORIGIN}{path}",
        body=body + seo_block(path),
    )
    dest = WEBSITE / slug / "index.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")
    print("wrote", dest)


def create_special_pages() -> None:
    write_new_page(
        "why-tickerplay",
        "Why Tickerplay | Best LED Ticker Company & Rise Display Alternative",
        "Compare Tickerplay LED tickers vs other brands. Custom stock, sports, and news tickers with certified hardware and U.S. support.",
        """
<h1>Why choose Tickerplay for your LED ticker project?</h1>
<p>Teams comparing the <strong>best LED ticker company</strong>, looking for a <strong>Rise Display alternative</strong>, or evaluating <strong>LED ticker brands</strong> choose Tickerplay for purpose-built stock, sports, news, and custom ticker systems — not generic digital signage bolted onto a ticker use case.</p>
<h2>What sets Tickerplay apart</h2>
<ul>
  <li><strong>Ticker-first engineering</strong> — indoor, outdoor, flexible, and circular LED ticker tapes designed for continuous scrolling data.</li>
  <li><strong>Vertical expertise</strong> — trading floors, university finance labs, sports bars, schools, and corporate lobbies.</li>
  <li><strong>Certified quality</strong> — ISO 9001:2015, UL-1950, ETL &amp; CE aligned builds for commercial environments.</li>
  <li><strong>Project support</strong> — sizing, feeds, installation guidance, and ongoing technical assistance.</li>
</ul>
<h2>Tickerplay vs typical LED sign vendors</h2>
<p>Generic LED sign shops often optimize for static menus or video walls. Tickerplay focuses on <strong>LED stock tickers</strong>, <strong>sports tickers</strong>, and high-uptime data displays with the content workflows those spaces need.</p>
<p><a href="/contact/">Request a quote</a> to compare options for your site.</p>
""",
    )

    write_new_page(
        "industries",
        "LED Tickers by Industry | Casinos, Airports, Hotels, Museums & More",
        "LED ticker displays for casinos, airports, hotels, gyms, dealerships, churches, museums, and convention centers from Tickerplay.",
        """
<h1>LED tickers for every industry</h1>
<p>Beyond finance and sports bars, organizations use Tickerplay LED tickers wherever live information needs to move at a glance.</p>
<h2>Popular industry applications</h2>
<ul>
  <li><strong>Casinos &amp; resorts</strong> — sportsbooks, promotions, and amenity messaging.</li>
  <li><strong>Airports &amp; transit</strong> — flight-style alerts, news, and wayfinding support content.</li>
  <li><strong>Hotels &amp; cruise</strong> — lobby news, entertainment, and guest communications (including cruise-ship style installs).</li>
  <li><strong>Gyms, museums, churches, dealerships, convention centers</strong> — schedules, headlines, and branded messaging.</li>
  <li><strong>Government buildings</strong> — public information and procurement-friendly commercial displays.</li>
</ul>
<p>Tell us your venue type on the <a href="/contact/">quote form</a> and we will recommend the right indoor/outdoor configuration.</p>
""",
    )

    write_new_page(
        "service-areas",
        "LED Ticker Installation Nationwide | USA Manufacturer & Installer",
        "Tickerplay designs and installs LED ticker displays nationwide across the USA — New York, Los Angeles, Chicago, Texas, Florida, and more.",
        """
<h1>Nationwide LED ticker design &amp; installation</h1>
<p>Tickerplay is a U.S.-focused <strong>LED sign manufacturer</strong> and ticker specialist supporting projects nationwide — from single lobby installs to multi-site rollouts.</p>
<h2>Service coverage</h2>
<p>We regularly support customers seeking an <strong>LED display company in New York</strong>, <strong>LED ticker company in Los Angeles</strong>, <strong>Chicago</strong>, <strong>Texas</strong>, <strong>Florida</strong>, and other major markets, plus nationwide shipping and installation coordination.</p>
<p>Looking for an <strong>LED ticker installer near me</strong>? Start with a remote site review and quote — we will match hardware, mounting, and content needs to your location.</p>
<p><a href="/contact/">Get a nationwide project quote</a></p>
""",
    )


def enhance_existing() -> None:
    # Ensure new paths exist in BY_PAGE keys when empty
    for path, items in BY_PAGE.items():
        if path in ("/why-tickerplay/", "/industries/", "/service-areas/"):
            continue  # handled by create
        rel = "index.html" if path == "/" else path.strip("/") + "/index.html"
        file = WEBSITE / rel
        if not file.exists():
            print("skip missing", path)
            continue
        html = file.read_text(encoding="utf-8", errors="replace")
        kws = meta_keywords(path)
        if kws:
            html = set_keywords_meta(html, kws)
            html = upsert_block(html, seo_block(path))
            file.write_text(html, encoding="utf-8")
            print("enhanced", path, "kws", len(kws.split(", ")))


def main() -> None:
    create_special_pages()
    enhance_existing()
    # also enhance new pages' keyword meta already set
    print("keyword apply complete")


if __name__ == "__main__":
    main()
