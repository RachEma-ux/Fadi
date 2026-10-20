"""Prepare the existing main ruleset; --apply needs an administrator GH_TOKEN.

Default is a local dry run. Does not create a second ruleset or weaken existing
protection. The connected GitHub plugin has no administration write action.
"""
import argparse
import json
import os
from pathlib import Path
import urllib.request

URL = "https://api.github.com/repos/RachEma-ux/Fadi/rulesets/25417703"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    payload = json.loads(Path("docs/continuity/main-ruleset.proposed.json").read_text())
    payload["enforcement"] = "active"
    if not args.apply:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    token = os.environ.get("GH_TOKEN")
    if not token:
        raise SystemExit("Administrator GH_TOKEN required; no request sent")
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    def request(method, body=None):
        data = json.dumps(body).encode() if body is not None else None
        with urllib.request.urlopen(urllib.request.Request(URL, data=data, headers=headers, method=method), timeout=30) as response:
            return json.load(response)
    current = request("GET")
    if current["target"] != "branch" or current["conditions"] != payload["conditions"]:
        raise SystemExit("Existing ruleset target changed; no update sent")
    # Refuse to remove any existing protection type. This is an additive hardening.
    if not {r["type"] for r in current["rules"]}.issubset({r["type"] for r in payload["rules"]}):
        raise SystemExit("Existing additional protections need reconciliation; no update sent")
    # Preserve any stronger settings concurrently added by an administrator.
    for old_rule in current["rules"]:
        new_rule = next(r for r in payload["rules"] if r["type"] == old_rule["type"])
        old = old_rule.get("parameters", {})
        proposed = new_rule.get("parameters", {})
        combined = {**old, **proposed}
        for key, value in old.items():
            if isinstance(value, bool) and value:
                combined[key] = True
        if "required_approving_review_count" in old:
            combined["required_approving_review_count"] = max(old["required_approving_review_count"], proposed.get("required_approving_review_count", 0))
        if "required_status_checks" in old:
            checks = {(c["context"], c.get("integration_id")): c for c in old["required_status_checks"] + proposed.get("required_status_checks", [])}
            combined["required_status_checks"] = list(checks.values())
        if combined:
            new_rule["parameters"] = combined
    request("PUT", payload)
    actual = request("GET")
    expected = next(r for r in payload["rules"] if r["type"] == "required_status_checks")["parameters"]
    found = next((r for r in actual["rules"] if r["type"] == "required_status_checks"), None)
    if actual["enforcement"] != "active" or not found or found["parameters"] != expected:
        raise SystemExit("Ruleset verification failed; inspect GitHub settings")
    print("Existing main ruleset activated and required checks verified")

if __name__ == "__main__":
    main()
