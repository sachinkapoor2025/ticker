#!/usr/bin/env python3
"""Pull Cognito IDs from CloudFormation into amplify-app.json + ticker-admin config."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "amplify-app.json"
STACK = "tickerplay-api-prod"
REGION = "us-east-1"


def main() -> None:
    raw = subprocess.check_output(
        [
            "aws",
            "cloudformation",
            "describe-stacks",
            "--stack-name",
            STACK,
            "--region",
            REGION,
            "--query",
            "Stacks[0].Outputs",
            "--output",
            "json",
        ],
        text=True,
    )
    outs = {o["OutputKey"]: o["OutputValue"] for o in json.loads(raw)}
    data = json.loads(APP.read_text()) if APP.exists() else {}
    data.update(
        {
            "userPoolId": outs.get("UserPoolId", ""),
            "userPoolClientId": outs.get("UserPoolClientId", ""),
            "adminApi": outs.get("AdminApiBase", data.get("adminApi", "")),
            "adminUrl": data.get("url", "").rstrip("/") + "/ticker-admin/",
            "region": REGION,
            "note": "Admin is /ticker-admin only (Cognito admin group). No public login link.",
        }
    )
    APP.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print("updated", APP)
    subprocess.check_call(["python3", str(ROOT / "scripts" / "write_admin_config.py")])


if __name__ == "__main__":
    main()
