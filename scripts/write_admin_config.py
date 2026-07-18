#!/usr/bin/env python3
"""Write website/ticker-admin/config.js from amplify-app.json or env."""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "amplify-app.json"
OUT = ROOT / "website" / "ticker-admin" / "config.js"


def main() -> None:
    data = {}
    if APP.exists():
        data = json.loads(APP.read_text())
    pool = os.environ.get("COGNITO_USER_POOL_ID") or data.get("userPoolId") or ""
    client = os.environ.get("COGNITO_USER_POOL_CLIENT_ID") or data.get("userPoolClientId") or ""
    region = os.environ.get("COGNITO_REGION") or data.get("region") or "us-east-1"
    api = data.get("adminApi") or "/api/admin"
    # Prefer same-origin proxy path in browser
    api_base = "/api/admin"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        f"""/** Auto-generated — do not edit by hand */
window.TP_ADMIN_CONFIG = {{
  region: {json.dumps(region)},
  userPoolId: {json.dumps(pool)},
  userPoolClientId: {json.dumps(client)},
  apiBase: {json.dumps(api_base)},
  adminApiDirect: {json.dumps(api)}
}};
""",
        encoding="utf-8",
    )
    print(f"wrote {OUT} pool={pool[:12]}… client={client[:8]}…")


if __name__ == "__main__":
    main()
