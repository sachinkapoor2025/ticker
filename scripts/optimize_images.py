#!/usr/bin/env python3
"""Convert raster images to WebP and rewrite HTML <img> tags to <picture> with fallback."""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

WEBSITE = Path(__file__).resolve().parents[1] / "website"
IMG_ROOT = WEBSITE / "img"
SKIP_EXT = {".svg", ".gif", ".mp4", ".webp", ".ico"}
MAX_DIM = 1920  # cap long edge for generated webp


def to_webp(src: Path) -> Path | None:
    if src.suffix.lower() in SKIP_EXT:
        return None
    if src.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
        return None
    dest = src.with_suffix(".webp")
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return dest
    try:
        with Image.open(src) as im:
            if im.mode in ("P", "RGBA", "LA"):
                im = im.convert("RGBA")
            else:
                im = im.convert("RGB")
            w, h = im.size
            if max(w, h) > MAX_DIM:
                scale = MAX_DIM / float(max(w, h))
                im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
            save_kwargs = {"quality": 78, "method": 4}
            if src.suffix.lower() == ".png" and im.mode == "RGBA":
                im.save(dest, "WEBP", **save_kwargs)
            else:
                if im.mode == "RGBA":
                    im = im.convert("RGB")
                im.save(dest, "WEBP", **save_kwargs)
        return dest
    except Exception as e:
        print(f"skip {src}: {e}")
        return None


def convert_all() -> int:
    n = 0
    for src in IMG_ROOT.rglob("*"):
        if not src.is_file():
            continue
        if to_webp(src):
            n += 1
    return n


def webp_url(src_url: str) -> str | None:
    if not src_url.startswith("/") or src_url.startswith("//"):
        return None
    p = Path(src_url)
    if p.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
        return None
    candidate = WEBSITE / src_url.lstrip("/")
    webp = candidate.with_suffix(".webp")
    if webp.exists():
        return "/" + webp.relative_to(WEBSITE).as_posix()
    return None


def rewrite_html() -> int:
    changed = 0
    img_re = re.compile(r"<img\b[^>]*>", re.I)

    def repl(m: re.Match) -> str:
        tag = m.group(0)
        if tag.lower().startswith("<picture") or "data-no-webp" in tag:
            return tag
        # already inside picture from prior run — skip if parent handled (we replace whole img only)
        src_m = re.search(r'\bsrc=["\']([^"\']+)["\']', tag, re.I)
        if not src_m:
            return tag
        src = src_m.group(1)
        webp = webp_url(src)
        if not webp:
            return tag
        # extract width/height if present for CLS
        attrs = tag[4:-1]  # inside img
        # ensure decoding/loading preserved on img
        return (
            f"<picture>"
            f'<source type="image/webp" srcset="{webp}">'
            f"<img{attrs}>"
            f"</picture>"
        )

    for html in WEBSITE.rglob("*.html"):
        text = html.read_text(encoding="utf-8", errors="replace")
        # unwrap prior picture wrappers to avoid nesting on re-run
        text2 = re.sub(
            r"<picture>\s*<source[^>]*type=[\"']image/webp[\"'][^>]*>\s*(<img\b[^>]*>)\s*</picture>",
            r"\1",
            text,
            flags=re.I,
        )
        text3, n = img_re.subn(repl, text2)
        if text3 != text:
            html.write_text(text3, encoding="utf-8")
            changed += 1
    return changed


def ensure_font_display() -> None:
    custom = WEBSITE / "css" / "custom.css"
    snippet = "\n/* CWV: ensure web fonts swap quickly */\n@font-face { font-display: swap; }\n"
    # Google Fonts already often use display=swap; also force on CSS @font-face in theme
    for css_name in ("custom.css", "theme.css", "stack-interface.css"):
        css = WEBSITE / "css" / css_name
        if not css.exists():
            continue
        text = css.read_text(encoding="utf-8", errors="replace")
        if "font-display" in text:
            continue
        # add to existing @font-face blocks
        text2 = re.sub(
            r"(@font-face\s*\{)",
            r"\1\n  font-display: swap;",
            text,
            flags=re.I,
        )
        if text2 == text and css_name == "custom.css":
            text2 = text + snippet
        if text2 != text:
            css.write_text(text2, encoding="utf-8")
            print(f"font-display added in {css_name}")


def main() -> None:
    n = convert_all()
    print(f"webp created/updated: {n}")
    pages = rewrite_html()
    print(f"html pages updated with <picture>: {pages}")
    ensure_font_display()


if __name__ == "__main__":
    main()
