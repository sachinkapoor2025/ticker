#!/usr/bin/env python3
"""Build a client-side search index from every public HTML page."""
from __future__ import annotations

import json
import re
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"
OUT = WEBSITE / "search-index.json"
REPORT = ROOT / "seo-reports" / "SEARCH-INDEX.md"

SKIP_DIRS = {
    "ticker-admin",
    "admin",
    "img",
    "css",
    "js",
    "fonts",
    "mirror",
}

PRODUCT_HINTS = (
    "led-",
    "ticker-tape",
    "ticker-models",
    "stock-market-ticker",
    "programmable",
    "multi-time-zone",
    "circular",
    "flexible",
    "indoor",
    "outdoor",
    "custom-led",
)
INDUSTRY_HINTS = (
    "university",
    "school",
    "brokerage",
    "wealth",
    "investment",
    "share-traders",
    "trading-labs",
    "sports-bars",
    "corporate",
    "stock-exchange",
    "showrooms",
    "business-school",
    "industries",
    "solutions",
)


def strip_tags(html: str) -> str:
    html = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    html = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", html)
    html = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", html)
    html = re.sub(r"(?is)<!--.*?-->", " ", html)
    html = re.sub(r"(?is)<[^>]+>", " ", html)
    html = unescape(html)
    html = re.sub(r"\s+", " ", html).strip()
    return html


def meta(html: str, name: str) -> str:
    m = re.search(
        rf'<meta[^>]+name=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']*)["\']',
        html,
        re.I,
    )
    if m:
        return m.group(1).strip()
    m = re.search(
        rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']{re.escape(name)}["\']',
        html,
        re.I,
    )
    return m.group(1).strip() if m else ""


def first_match(html: str, pattern: str) -> str:
    m = re.search(pattern, html, re.I | re.S)
    return strip_tags(m.group(1)) if m else ""


def classify(route: str) -> str:
    if route.startswith("/blog/") or route in ("/blogs/", "/blog/"):
        return "Blog"
    slug = route.strip("/").lower()
    if any(h in slug for h in PRODUCT_HINTS):
        return "Products"
    if any(h in slug for h in INDUSTRY_HINTS):
        return "Industries"
    if route == "/":
        return "Products"
    return "Pages"


def heading_text(html: str) -> str:
    heads = re.findall(r"(?is)<h[1-3][^>]*>(.*?)</h[1-3]>", html)
    parts = [strip_tags(h) for h in heads[:12] if strip_tags(h)]
    return " · ".join(parts)


def page_record(index_path: Path) -> dict | None:
    rel = index_path.parent.relative_to(WEBSITE).as_posix()
    if any(part in SKIP_DIRS for part in Path(rel).parts):
        return None
    if rel.startswith("blog/") is False and "blog" in Path(rel).parts:
        return None

    route = "/" if rel == "." else f"/{rel}/"
    # Skip non-public tooling
    if route.startswith("/ticker-admin") or route.startswith("/admin"):
        return None

    html = index_path.read_text(encoding="utf-8", errors="replace")
    title = first_match(html, r"(?is)<title[^>]*>(.*?)</title>") or route
    title = re.sub(r"\s+[|\-].*$", "", title).strip() or title
    h1 = first_match(html, r"(?is)<h1[^>]*>(.*?)</h1>")
    description = meta(html, "description")
    headings = heading_text(html)
    body = strip_tags(html)
    # Keep index lean: title/h1/meta/headings + first ~400 body chars for snippets
    body_snip = body[:1200]

    return {
        "url": route,
        "title": h1 or title,
        "description": description,
        "headings": headings,
        "body": body_snip,
        "type": classify(route),
        "keywords": meta(html, "keywords"),
    }


def main() -> None:
    pages: list[dict] = []
    for index in sorted(WEBSITE.rglob("index.html")):
        rec = page_record(index)
        if rec:
            pages.append(rec)

    OUT.write_text(json.dumps({"generated": True, "count": len(pages), "pages": pages}, ensure_ascii=False), encoding="utf-8")

    by_type: dict[str, list[str]] = {}
    for p in pages:
        by_type.setdefault(p["type"], []).append(p["url"])

    lines = [
        "# Site search index",
        "",
        f"Generated pages indexed: **{len(pages)}**",
        "",
        "Technology: Fuse.js (client-side) over `website/search-index.json` built at Amplify preBuild.",
        "",
    ]
    for t in ("Products", "Industries", "Blog", "Pages"):
        urls = by_type.get(t, [])
        lines.append(f"## {t} ({len(urls)})")
        lines.append("")
        for u in urls:
            lines.append(f"- `{u}`")
        lines.append("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Indexed {len(pages)} pages → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
