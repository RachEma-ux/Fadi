"""Ruleset hardening tests: no network or real credential is used."""
import contextlib
import copy
import importlib.util
import io
import json
import os
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ruleset", "scripts/apply-main-ruleset.py")
ruleset = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ruleset)

class RulesetTest(unittest.TestCase):
    def test_dry_run_never_contacts_github(self):
        with patch("sys.argv", ["apply-main-ruleset.py"]), patch.object(ruleset.urllib.request, "urlopen") as network, contextlib.redirect_stdout(io.StringIO()):
            ruleset.main()
        network.assert_not_called()

    def test_no_token_refuses_before_any_request(self):
        with patch("sys.argv", ["apply-main-ruleset.py", "--apply"]), patch.dict(os.environ, {}, clear=True), patch.object(ruleset.urllib.request, "urlopen") as network:
            with self.assertRaisesRegex(SystemExit, "no request sent"):
                ruleset.main()
        network.assert_not_called()

    def test_apply_preserves_stronger_existing_review_and_checks(self):
        current = json.loads(ruleset.Path("docs/continuity/main-ruleset.proposed.json").read_text())
        current["enforcement"] = "active"
        review = next(r for r in current["rules"] if r["type"] == "pull_request")["parameters"]
        review["required_approving_review_count"] = 2
        review["require_extra_approval_for_unattributed_changes"] = True
        checks = next(r for r in current["rules"] if r["type"] == "required_status_checks")["parameters"]
        checks["required_status_checks"].append({"context": "extra-admin-check", "integration_id": 15368})
        state = copy.deepcopy(current)
        writes = []
        def network(request, timeout):
            nonlocal state
            if request.method == "PUT":
                state = json.loads(request.data)
                writes.append(copy.deepcopy(state))
            response = io.BytesIO(json.dumps(state).encode())
            return contextlib.closing(response)
        with patch("sys.argv", ["apply-main-ruleset.py", "--apply"]), patch.dict(os.environ, {"GH_TOKEN": "test-only-placeholder"}, clear=True), patch.object(ruleset.urllib.request, "urlopen", side_effect=network), contextlib.redirect_stdout(io.StringIO()):
            ruleset.main()
        self.assertEqual(len(writes), 1)
        review = next(r for r in state["rules"] if r["type"] == "pull_request")["parameters"]
        self.assertEqual(review["required_approving_review_count"], 2)
        self.assertTrue(review["require_extra_approval_for_unattributed_changes"])
        checks = next(r for r in state["rules"] if r["type"] == "required_status_checks")["parameters"]["required_status_checks"]
        self.assertIn("extra-admin-check", [c["context"] for c in checks])

if __name__ == "__main__":
    unittest.main()
