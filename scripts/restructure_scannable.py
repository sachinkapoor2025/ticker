#!/usr/bin/env python3
"""
Restructure dense marketing intro blocks into intro + bullets.
Preserves keyword phrases; does not delete ranking-relevant copy — redistributes it.
"""
from __future__ import annotations

import re
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"

# Homepage + 13 upgraded application/product pages
TARGETS = [
    WEBSITE / "index.html",
    WEBSITE / "university-finance-lab" / "index.html",
    WEBSITE / "stock-brokerage-firms" / "index.html",
    WEBSITE / "business-school" / "index.html",
    WEBSITE / "wealth-management-firms" / "index.html",
    WEBSITE / "investment-firms" / "index.html",
    WEBSITE / "share-traders" / "index.html",
    WEBSITE / "trading-labs" / "index.html",
    WEBSITE / "sports-bars" / "index.html",
    WEBSITE / "corporate-floors" / "index.html",
    WEBSITE / "stock-exchange" / "index.html",
    WEBSITE / "showrooms" / "index.html",
    WEBSITE / "schools" / "index.html",
    WEBSITE / "led-stock-ticker" / "index.html",
]


def plain(html: str) -> str:
    t = re.sub(r"(?is)<[^>]+>", " ", html)
    t = unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def restructure_paragraph_block(paras_html: list[str]) -> str | None:
    """Turn a list of <p>...</p> inner HTML into intro + bullets, preserving all sentences/keywords."""
    full = " ".join(plain(p) for p in paras_html)
    words = full.split()
    if len(words) < 55:
        return None
    sents = sentences(full)
    if len(sents) < 2:
        return None

    intro_n = 2 if len(sents) >= 3 else 1
    intro = " ".join(sents[:intro_n])
    rest = sents[intro_n:]
    if not rest:
        # Split a single long remaining blob isn't available — use later clauses from intro paras
        rest = sents[1:] if len(sents) > 1 else sents
        intro = sents[0]

    # Prefer 3–5 visible bullets; fold extras into the last bullet so nothing is deleted
    bullets = rest[:5]
    extras = rest[5:]
    if extras:
        bullets[-1] = bullets[-1].rstrip(".") + ". " + " ".join(extras)

    li = "".join(f"<li>{b}</li>" for b in bullets)
    return f'<p class="tp-scan-intro">{intro}</p>\n<ul class="tp-scan-list">{li}</ul>\n'


HOME_UNI_BLOCK = """                    <h2><b>Transform Your University Business Environment with Mesmerizing LED Stock Tickers from Tickerplay</b></h2>
                    <p class="tp-scan-intro lead" style="color: black;">
                        Enhance the university business environment with the captivating power of LED Stock Tickers.
                        Experience the dynamic display of live-scrolling stocks, bonds, shares, CMEs, and more through our cutting-edge LED Ticker Tape.
                    </p>
                    <ul class="tp-scan-list">
                        <li>High-quality LED Ticker signs create a mesmerizing ambiance that keeps students and faculty engaged and informed.</li>
                        <li>Seamless scrolling and streaming displays deliver an exceptional viewing experience on campus.</li>
                        <li>LED Stock Ticker displays are available in various sizes and customizable options to fit preferences and budget.</li>
                        <li>Advanced LED Ticker technology helps universities stay in sync with the market.</li>
                        <li>Ideal for taking your university business environment to new heights with professional LED ticker installations.</li>
                    </ul>
"""


def fix_homepage(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    if 'class="tp-scan-list"' in text and "Transform Your University Business Environment" in text:
        # already partially done — still try FAQ
        changed = False
    else:
        pattern = re.compile(
            r'(<h2><b>Transform Your University Business Environment.*?</h2>\s*)'
            r'<p class="lead"[^>]*>.*?</p>',
            re.I | re.S,
        )
        new_text, n = pattern.subn(HOME_UNI_BLOCK, text, count=1)
        if n:
            text = new_text
            changed = True
        else:
            changed = False

    # FAQ table → accordion (preserve Q/A text)
    if 'class="tp-faq"' not in text:
        faq_pat = re.compile(
            r'(<h2 class="text-center mb-5"><b>FAQ\'s</b></h2>\s*)'
            r'<div class="scroll-area-lg table-responsive">.*?</div>\s*</div>\s*</div>',
            re.I | re.S,
        )
        m = faq_pat.search(text)
        if m:
            table_html = m.group(0)
            qa = re.findall(
                r"<h4[^>]*>\s*<b>Q:\s*(.*?)</b>\s*</h4>\s*<p[^>]*>\s*<b>A:\s*</b>\s*(.*?)</p>",
                table_html,
                re.I | re.S,
            )
            if qa:
                items = []
                for i, (q, a) in enumerate(qa):
                    q = plain(q)
                    a = plain(a)
                    items.append(
                        f'<div class="tp-faq-item">'
                        f'<button type="button" class="tp-faq-button" id="tp-faq-btn-{i}">'
                        f'<span>{q}</span><span class="tp-faq-icon" aria-hidden="true">+</span></button>'
                        f'<div class="tp-faq-panel" id="tp-faq-panel-{i}" role="region" aria-labelledby="tp-faq-btn-{i}">'
                        f"<p>{a}</p></div></div>"
                    )
                replacement = (
                    m.group(1)
                    + '<div class="tp-faq" data-tp-faq="1">\n'
                    + "\n".join(items)
                    + "\n</div>"
                )
                text = text[: m.start()] + replacement + text[m.end() :]
                changed = True

    # Make footer phone a link if plain text
    text2 = re.sub(
        r"(<li>\s*)800\.966\.9329 \(US\)(\s*</li>)",
        r'\1<a class="tp-footer-phone" href="tel:+18009669329">800.966.9329 (US)</a>\2',
        text,
        count=1,
    )
    if text2 != text:
        text = text2
        changed = True

    # Client logo caption (neutral — does not assert verification)
    if "Our Clients" in text and "tp-clients-caption" not in text:
        text = text.replace(
            "<h2><b>Our Clients</b></h2>",
            '<h2><b>Our Clients</b></h2>\n            <p class="tp-clients-caption" style="color:#555;max-width:720px;margin:0 auto 8px;">'
            "Organizations that have worked with Tickerplay on LED ticker projects. "
            "<em>Logo verification pending owner confirmation — see UX report.</em></p>",
            1,
        )
        changed = True

    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def restructure_first_cop_block(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    if "tp-scan-list" in text:
        return False

    # First cluster of consecutive <p> (optional <br> between) in .col-12.mt-5
    pattern = re.compile(
        r'(<div class="col-12 mt-5">\s*)((?:<p>.*?</p>\s*(?:<br\s*/?>\s*)?){2,})',
        re.I | re.S,
    )
    m = pattern.search(text)
    if not m:
        pattern = re.compile(
            r'(<div class="col-12(?: text-center)?">\s*)((?:<p>.*?</p>\s*(?:<br\s*/?>\s*)?){2,})',
            re.I | re.S,
        )
        m = pattern.search(text)
    if not m:
        return False

    paras = re.findall(r"<p>(.*?)</p>", m.group(2), re.I | re.S)
    block = restructure_paragraph_block(paras)
    if not block:
        return False

    # Append any leftover sentences not represented — already handled in helper
    replacement = m.group(1) + block
    text = text[: m.start()] + replacement + text[m.end() :]
    path.write_text(text, encoding="utf-8")
    return True


def main() -> None:
    done = []
    if fix_homepage(WEBSITE / "index.html"):
        done.append("/")
    for path in TARGETS:
        if path == WEBSITE / "index.html":
            continue
        if not path.exists():
            continue
        if restructure_first_cop_block(path):
            done.append("/" + path.parent.name + "/")
    print("Restructured:", ", ".join(done) if done else "(none)")


if __name__ == "__main__":
    main()
