#!/usr/bin/env python3
"""Step 5 — unique metas, audience-specific Why Choose Us, alt text, visible last-updated on blogs."""
from __future__ import annotations

import calendar
import re
from datetime import datetime
from pathlib import Path

WEBSITE = Path(__file__).resolve().parents[1] / "website"

META = {
    "/": "Discover LED stock ticker displays and custom LED ticker tapes from Tickerplay for trading floors, campuses, and venues.",
    "/about-us/": "Learn about Tickerplay Systems — designers and installers of LED stock tickers, financial tickers, and custom ticker tapes.",
    "/contact/": "Contact Tickerplay for LED ticker quotes, demos, and project guidance. Call 800.966.9329 or send your requirements online.",
    "/blogs/": "Tickerplay news and guides on LED stock tickers, financial displays, sports tickers, and digital signage best practices.",
    "/gallery/": "See Tickerplay LED ticker installations — stock tickers, circular displays, sports bars, cruise ships, and finance labs.",
    "/solutions/": "Explore Tickerplay LED ticker solutions for finance, education, sports, corporate floors, retail, and custom environments.",
    "/ticker-models/": "Compare Tickerplay LED ticker models and configurations for indoor, outdoor, flexible, and circular installations.",
    "/led-ticker-tape/": "LED ticker tape displays from Tickerplay for scrolling stock quotes, news, and custom messages in any commercial space.",
    "/indoor-ticker-tape/": "Indoor LED ticker tapes with sleek profiles for offices, lobbies, trading rooms, and university finance labs.",
    "/outdoor-ticker-tape/": "Weather-resistant outdoor LED ticker tapes for facades, campuses, venues, and high-visibility street-facing displays.",
    "/flexible-ticker-tape/": "Flexible LED ticker tapes that bend around columns, curves, and custom architecture without losing readability.",
    "/circular-ticker-tape/": "Circular LED ticker displays that wrap columns and atriums with continuous scrolling market and news data.",
    "/custom-led-ticker-tape/": "Custom-angle and bespoke LED ticker tapes engineered to your architecture, branding, and data feed requirements.",
    "/led-stock-ticker/": "LED stock ticker displays for real-time quotes and market data on trading floors, brokerages, and finance labs.",
    "/led-financial-ticker/": "Financial LED tickers showing equities, FX, and indices for banks, wealth desks, and investment firms.",
    "/led-sports-ticker/": "LED sports tickers for live scores, game updates, and venue messaging in arenas, bars, and fan spaces.",
    "/led-news-ticker/": "LED news tickers that stream headlines and breaking updates for lobbies, campuses, and broadcast-style environments.",
    "/led-twitter-ticker/": "LED Twitter/X tickers that display live social feeds for events, campuses, and brand experiences.",
    "/led-rss-ticker/": "LED RSS tickers that pull structured feeds into bright, scrolling displays for newsrooms and operations hubs.",
    "/stock-market-ticker/": "Stock market LED tickers built for exchanges, trading rooms, and investor-facing spaces needing live market data.",
    "/programmable-scrolling-led-sign/": "Programmable scrolling LED signs for promotions, alerts, and real-time messaging indoors or outdoors.",
    "/multi-time-zone-digital-wall-clock/": "Multi-time-zone digital wall clocks with optional scrolling LED ticker data for global teams and finance floors.",
    "/university-finance-lab/": "LED stock tickers for university finance labs and trading rooms that make market data part of the curriculum.",
    "/stock-brokerage-firms/": "LED ticker displays for stock brokerage firms — client-facing market data that builds confidence and engagement.",
    "/business-school/": "LED stock tickers for business schools — immersive market data for classrooms, atriums, and trading simulations.",
    "/wealth-management-firms/": "LED financial tickers for wealth management firms delivering market context clients can see at a glance.",
    "/investment-firms/": "LED stock and financial tickers for investment firms that keep teams and visitors aligned with live markets.",
    "/share-traders/": "LED stock tickers for share traders and active desks that need glanceable, high-visibility market updates.",
    "/trading-labs/": "LED tickers for trading labs — real-time quotes and news that turn practice rooms into professional environments.",
    "/sports-bars/": "LED sports tickers for sports bars — live scores and game updates that keep guests engaged every match day.",
    "/corporate-floors/": "Corporate LED tickers for headquarters lobbies and floors — company news, markets, and brand-forward messaging.",
    "/stock-exchange/": "Exchange-grade LED ticker displays for stock exchanges and trading venues that demand clarity at scale.",
    "/showrooms/": "LED ticker displays for product showrooms — dynamic messaging that draws attention and showcases live data.",
    "/schools/": "LED tickers for schools — announcements, news, and educational market data in hallways and common areas.",
    "/privacy-policy/": "Tickerplay privacy policy — how we collect, use, and protect personal information from website inquiries.",
    "/payment-methods/": "Accepted payment methods for Tickerplay LED ticker projects, orders, and service agreements.",
    "/returns-policy/": "Tickerplay returns policy for LED ticker products, including eligibility, timelines, and how to start a return.",
    "/shipping-and-handling/": "Shipping and handling information for Tickerplay LED ticker displays, including lead times and delivery notes.",
}

# Audience-specific copy for the four Why Choose Us cards (keep headings)
WHY = {
    "default": {
        "tech": "With advanced LED and data-integration technology, we deliver real-time, accurate, and visually captivating information for your environment.",
        "custom": "Every space is different. We study your layout, content feeds, and goals to engineer a ticker solution that fits your objectives and budget.",
        "cert": "Have confidence in durability and compliance — our systems are built to meet stringent requirements including ISO 9001:2015, UL-1950, ETL, and CE.",
        "support": "From specification through installation and ongoing support, our team stays with you for advice, troubleshooting, and long-term success.",
    },
    "sports-bars": {
        "tech": "Our sports tickers stream live scores and game updates in bright, readable LED so guests never miss a play — even away from the TVs.",
        "custom": "We size and program tickers for bar sightlines, team preferences, and promo messaging so game-day energy matches your brand.",
        "cert": "Commercial-grade LED built for busy hospitality environments, tested to meet ISO 9001:2015, UL-1950, ETL, and CE requirements.",
        "support": "Need help with feeds, schedules, or a big event night? Our support team keeps your sports ticker running when it matters most.",
    },
    "schools": {
        "tech": "School-ready LED tickers share announcements, news, and educational market data in a format students actually notice.",
        "custom": "We tailor length, brightness, and content for hallways, cafeterias, and common areas without disrupting learning spaces.",
        "cert": "Durable, certified displays suitable for campus use, meeting ISO 9001:2015, UL-1950, ETL, and CE requirements.",
        "support": "Facilities and IT teams get clear setup guidance plus ongoing help for content updates and maintenance.",
    },
    "university-finance-lab": {
        "tech": "Finance-lab tickers bring live market data into the classroom so students learn with the same urgency professionals feel on a desk.",
        "custom": "We design for trading rooms and labs — symbol universes, data providers, and layouts that match your curriculum.",
        "cert": "Institutional-quality LED systems tested to ISO 9001:2015, UL-1950, ETL, and CE standards for campus installations.",
        "support": "Faculty and lab managers get installation support, feed configuration help, and responsive technical assistance.",
    },
    "business-school": {
        "tech": "Business-school tickers put equities, indices, and headlines in atriums and classrooms to reinforce real-world finance literacy.",
        "custom": "From atrium wraps to classroom strips, we customize size, content, and branding for your program’s look and learning goals.",
        "cert": "Campus-ready hardware meeting ISO 9001:2015, UL-1950, ETL, and CE requirements for long-term institutional use.",
        "support": "We support academic calendars — setup before term start, content changes, and reliable ongoing technical help.",
    },
    "stock-brokerage-firms": {
        "tech": "Brokerage tickers deliver client-facing market data that looks sharp on the floor and builds confidence in your desk.",
        "custom": "We match your watchlists, indices, and brand colors so the ticker feels native to your brokerage environment.",
        "cert": "Professional displays engineered for continuous operation and certified to ISO 9001:2015, UL-1950, ETL, and CE.",
        "support": "Trading-floor teams get rapid support for feeds, layouts, and after-hours issues when markets move.",
    },
    "wealth-management-firms": {
        "tech": "Wealth-desk tickers surface indices and market context clients can absorb at a glance in reception and advisor spaces.",
        "custom": "Quiet luxury meets clarity — we tune brightness, pace, and content for client meeting areas and advisor floors.",
        "cert": "Reliable LED systems meeting ISO 9001:2015, UL-1950, ETL, and CE for professional financial workplaces.",
        "support": "Dedicated guidance for content strategy, installation, and ongoing support as your offices evolve.",
    },
    "investment-firms": {
        "tech": "Investment-firm tickers keep partners and visitors aligned with live markets using high-visibility LED data streams.",
        "custom": "We configure symbol sets, news, and branding for partner floors, IR spaces, and client pathways.",
        "cert": "Enterprise-ready LED meeting ISO 9001:2015, UL-1950, ETL, and CE standards for always-on environments.",
        "support": "From kickoff to go-live and beyond, our team supports feeds, troubleshooting, and expansions across offices.",
    },
    "trading-labs": {
        "tech": "Trading-lab tickers recreate professional desk energy with live quotes and news for simulation and instruction.",
        "custom": "Built around your lab topology — multi-row rooms, glass walls, and instructor-controlled content where needed.",
        "cert": "Durable educational installations certified to ISO 9001:2015, UL-1950, ETL, and CE requirements.",
        "support": "Lab administrators get practical training, feed help, and responsive support during semesters and workshops.",
    },
    "corporate-floors": {
        "tech": "Corporate tickers blend market data, company news, and brand messaging to energize lobbies and workplace floors.",
        "custom": "We design for brand guidelines, wayfinding adjacency, and mixed content — not just stock symbols.",
        "cert": "Workplace-ready LED meeting ISO 9001:2015, UL-1950, ETL, and CE for continuous commercial operation.",
        "support": "Facilities and communications teams get ongoing help for content updates, schedules, and technical issues.",
    },
    "stock-exchange": {
        "tech": "Exchange-scale tickers prioritize readability, uptime, and accurate market data where every second counts.",
        "custom": "We engineer lengths, pixel pitch, and feed integration for trading venues and high-traffic exchange floors.",
        "cert": "Mission-critical builds tested to ISO 9001:2015, UL-1950, ETL, and CE for demanding venues.",
        "support": "Priority support paths for venue operators who need fast response during market hours.",
    },
    "led-sports-ticker": {
        "tech": "Sports ticker technology built for scores, clocks, and rapid updates fans can read from across the room.",
        "custom": "Configure leagues, teams, and promo slots so the display works for your venue’s event calendar.",
        "cert": "Venue-capable LED certified to ISO 9001:2015, UL-1950, ETL, and CE standards.",
        "support": "Event and AV teams get setup help, content training, and reliable post-install support.",
    },
    "led-stock-ticker": {
        "tech": "Stock ticker LED systems optimized for symbol density, refresh rates, and glanceable accuracy on busy floors.",
        "custom": "We map your data sources, symbol lists, and architecture so the ticker matches how your desk actually works.",
        "cert": "Professional financial displays meeting ISO 9001:2015, UL-1950, ETL, and CE requirements.",
        "support": "Specialists help with feeds, commissioning, and long-term reliability for market-critical spaces.",
    },
    "led-financial-ticker": {
        "tech": "Financial tickers combine equities, FX, and indices in a clear LED format for banks and investment workplaces.",
        "custom": "Content packages and layouts are tailored to reception, dealing rooms, and client experience areas.",
        "cert": "Certified commercial LED (ISO 9001:2015, UL-1950, ETL, CE) for continuous financial-services use.",
        "support": "Ongoing technical assistance for data feeds, scheduling, and multi-site rollouts.",
    },
    "outdoor-ticker-tape": {
        "tech": "Outdoor LED tickers use weather-ready engineering so messages stay bright and readable in real-world conditions.",
        "custom": "We specify pitch, brightness, and enclosures for facades, campuses, and street-facing installations.",
        "cert": "Outdoor-capable systems aligned with ISO 9001:2015, UL-1950, ETL, and CE requirements.",
        "support": "Site surveys, install guidance, and maintenance support for exterior deployments.",
    },
    "indoor-ticker-tape": {
        "tech": "Indoor ticker tapes balance elegance and clarity — slim profiles with sharp, continuous scrolling data.",
        "custom": "Perfect for lobbies, corridors, and trading-adjacent spaces with content tuned to your audience.",
        "cert": "Indoor commercial LED meeting ISO 9001:2015, UL-1950, ETL, and CE standards.",
        "support": "From mounting details to content workflows, we support a clean install and smooth day-two operations.",
    },
}

MONTHS = {m: i for i, m in enumerate(calendar.month_name) if m}
MONTHS.update({m: i for i, m in enumerate(calendar.month_abbr) if m})


def route_for(path: Path) -> str:
    if path.name == "index.html" and path.parent.name == "website":
        return "/"
    if path.parent.name == "website":
        return "/"
    # website/foo/index.html
    rel = path.parent.relative_to(WEBSITE).as_posix()
    if rel == ".":
        return "/"
    return f"/{rel}/"


def set_meta(text: str, description: str) -> str:
    description = description[:160]
    if re.search(r'name=["\']description["\']', text, re.I):
        text2, n = re.subn(
            r'(<meta[^>]*name=["\']description["\'][^>]*content=["\'])([^"\']*)(["\'])',
            rf"\g<1>{description}\g<3>",
            text,
            count=1,
            flags=re.I,
        )
        if n:
            return text2
        text2, n = re.subn(
            r'(<meta[^>]*content=["\'])([^"\']*)(["\'][^>]*name=["\']description["\'])',
            rf"\g<1>{description}\g<3>",
            text,
            count=1,
            flags=re.I,
        )
        if n:
            return text2
    return re.sub(
        r"</head>",
        f'    <meta name="description" content="{description}" />\n</head>',
        text,
        count=1,
        flags=re.I,
    )


def replace_why(text: str, slug: str) -> str:
    copy = WHY.get(slug, WHY["default"])
    # Replace the four known boilerplate paragraphs when present
    patterns = [
        (
            r'(<b>Advanced Technology</b>\s*</h4>\s*<p[^>]*>)(.*?)(</p>)',
            rf"\g<1>{copy['tech']}\g<3>",
        ),
        (
            r'(<b>Customization Based on Needs</b>\s*</h4>\s*<p[^>]*>)(.*?)(</p>)',
            rf"\g<1>{copy['custom']}\g<3>",
        ),
        (
            r'(<b>Certified Company</b>\s*</h4>\s*<p[^>]*>)(.*?)(</p>)',
            rf"\g<1>{copy['cert']}\g<3>",
        ),
        (
            r'(<b>Customer Support</b>\s*</h4>\s*<p[^>]*>)(.*?)(</p>)',
            rf"\g<1>{copy['support']}\g<3>",
        ),
    ]
    for pat, repl in patterns:
        text, _ = re.subn(pat, repl, text, count=1, flags=re.I | re.S)
    return text


def fix_alts(text: str) -> str:
    def repl(m: re.Match) -> str:
        tag = m.group(0)
        src_m = re.search(r'\bsrc=["\']([^"\']+)["\']', tag, re.I)
        src = src_m.group(1) if src_m else "image"
        name = Path(src).name
        stem = re.sub(r"[-_]+", " ", Path(name).stem)
        stem = re.sub(r"\s+", " ", stem).strip() or "Tickerplay image"
        # decorative spacers
        if any(x in src.lower() for x in ("spacer", "pixel.gif", "blank.")):
            alt = ""
        elif "logo" in src.lower():
            alt = "Tickerplay logo" if "ticker" in src.lower() or "logo-dark" in src.lower() else f"{stem} logo"
        else:
            alt = stem[:120]
        if re.search(r"\balt=", tag, re.I):
            return re.sub(r'\balt=["\'][^"\']*["\']', f'alt="{alt}"', tag, count=1, flags=re.I)
        return tag[:-1] + f' alt="{alt}">'

    return re.sub(r"<img\b[^>]*>", repl, text, flags=re.I)


def parse_blog_date(text: str) -> datetime | None:
    # Prefer explicit article timestamps like "June 22, 2021 16:16"
    m = re.search(
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December|"
        r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{2}):(\d{2}))?",
        text,
    )
    if not m:
        return None
    mon = MONTHS.get(m.group(1), MONTHS.get(m.group(1)[:3]))
    if not mon:
        return None
    day = int(m.group(2))
    year = int(m.group(3))
    hh = int(m.group(4) or 0)
    mm = int(m.group(5) or 0)
    try:
        return datetime(year, mon, day, hh, mm)
    except ValueError:
        return None


def ensure_blog_updated(text: str, dt: datetime) -> str:
    iso = dt.date().isoformat()
    label = dt.strftime("%B %d, %Y")
    if 'class="tp-last-updated"' in text:
        return re.sub(
            r'<p class="tp-last-updated"[^>]*>.*?</p>',
            f'<p class="tp-last-updated" style="color:#555;font-size:0.95rem;">Last updated: <time datetime="{iso}">{label}</time></p>',
            text,
            count=1,
            flags=re.I | re.S,
        )
    # insert after first h1
    return re.sub(
        r"(</h1>)",
        rf'\1\n<p class="tp-last-updated" style="color:#555;font-size:0.95rem;">Last updated: <time datetime="{iso}">{label}</time></p>',
        text,
        count=1,
        flags=re.I,
    )


def main() -> None:
    meta_n = why_n = alt_pages = blog_n = 0
    # Core pages
    pages = list(WEBSITE.glob("*/index.html")) + [WEBSITE / "index.html"]
    for path in pages:
        if not path.exists() or "blog/" in str(path):
            continue
        route = "/" if path == WEBSITE / "index.html" else f"/{path.parent.name}/"
        slug = "home" if route == "/" else path.parent.name
        text = path.read_text(encoding="utf-8", errors="replace")
        original = text
        if route in META:
            text = set_meta(text, META[route])
            meta_n += 1
        if "Why Choose Us" in text:
            text = replace_why(text, slug if slug in WHY else "default")
            why_n += 1
        text = fix_alts(text)
        if text != original:
            alt_pages += 1
            path.write_text(text, encoding="utf-8")

    # Blog posts — dates + alts (don't invent; only surface parsed dates)
    for path in WEBSITE.glob("blog/*/index.html"):
        text = path.read_text(encoding="utf-8", errors="replace")
        original = text
        text = fix_alts(text)
        dt = parse_blog_date(text)
        if dt:
            text = ensure_blog_updated(text, dt)
            # also stamp machine-readable meta for seo_build
            if 'property="article:published_time"' not in text:
                iso = dt.isoformat()
                text = re.sub(
                    r"</head>",
                    f'    <meta property="article:published_time" content="{iso}" />\n'
                    f'    <meta property="article:modified_time" content="{iso}" />\n</head>',
                    text,
                    count=1,
                    flags=re.I,
                )
            blog_n += 1
        if text != original:
            path.write_text(text, encoding="utf-8")

    print(f"metas set: {meta_n}; why-choose updated: {why_n}; pages touched: {alt_pages}; blogs dated: {blog_n}")


if __name__ == "__main__":
    main()
