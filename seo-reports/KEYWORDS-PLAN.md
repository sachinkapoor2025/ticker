# Keyword integration (Seo.xlsx → site)

Source: `Seo.xlsx` (501 keywords).

## Filter (relevant traffic only)

| Set | Count | Rule |
| --- | --- | --- |
| Included | **481** | Brand, LED ticker, stock/sports/news tickers, industries, geo installs, comparisons |
| Excluded | **20** | Broad “digital signage” pillar terms that pull non-ticker traffic |

Excluded list: `keywords-excluded.json`  
Included + page map: `keywords-included.json`, `keywords-by-page.json`

## How keywords appear (no stuffing)

1. **Existing pages** — `meta keywords` + a short “Related searches & solutions” prose block (natural language).
2. **New pages**
   - `/why-tickerplay/` — brand / Rise Display alternative / best company
   - `/industries/` — casino, airport, hotel, gym, museum, etc.
   - `/service-areas/` — nationwide / city installer intent

Applied by `scripts/apply_keywords.py` during Amplify preBuild (before `seo_build.py`).
