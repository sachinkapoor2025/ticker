#!/usr/bin/env python3
"""Inject site UX CSS/JS into every public HTML page (idempotent)."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"

CSS_TAG = '<link href="/css/site-ux.css" rel="stylesheet" type="text/css" media="all" />'
JS_TAGS = [
    '<script src="/js/site-search.js" defer></script>',
    '<script src="/js/country-picker.js" defer></script>',
    '<script src="/js/site-ux.js" defer></script>',
]
SKIP = {"ticker-admin", "admin"}


def should_skip(path: Path) -> bool:
    try:
        rel = path.relative_to(WEBSITE)
    except ValueError:
        return True
    return any(part in SKIP for part in rel.parts)


def inject(html: str) -> str:
    original = html
    if "/css/site-ux.css" not in html:
        if re.search(r'href="/css/custom\.css"', html):
            html = re.sub(
                r'(<link href="/css/custom\.css"[^>]*>)',
                r"\1\n    " + CSS_TAG,
                html,
                count=1,
            )
        else:
            html = html.replace("</head>", f"    {CSS_TAG}\n</head>", 1)

    for tag in JS_TAGS:
        src = re.search(r'src="([^"]+)"', tag).group(1)
        if src in html:
            continue
        if "analytics-beacon.js" in html:
            html = re.sub(
                r'(<script src="/js/analytics-beacon\.js[^"]*"[^>]*></script>)',
                tag + "\n" + r"\1",
                html,
                count=1,
            )
        else:
            html = html.replace("</body>", f"{tag}\n</body>", 1)

    return html if html != original else original


def main() -> None:
    n = 0
    for path in WEBSITE.rglob("*.html"):
        if should_skip(path):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        updated = inject(text)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            n += 1
    print(f"UX assets injected/updated on {n} HTML files")


if __name__ == "__main__":
    main()
