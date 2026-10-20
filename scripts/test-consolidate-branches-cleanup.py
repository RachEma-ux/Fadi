"""No-network tests for the authorized cleanup's preflight and deletion plan."""
import importlib.util
import os
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("cleanup", "scripts/consolidate-branches-cleanup.py")
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class CleanupTest(unittest.TestCase):
    def exercise(self, moved=False, unmerged=False):
        rows = cleanup.re.findall(r"^\| `([^`]+)` \| `([0-9a-f]{40})` \|$",
                                  cleanup.Path(cleanup.CHECKPOINT).read_text(), cleanup.re.MULTILINE)
        self.assertEqual(len(rows), 18)
        commit, helper = "a" * 40, "b" * 40
        refs = {"git/refs/heads/" + name: {"object": {"sha": sha}}
                for name, sha in rows + [(cleanup.HELPER, helper)]}
        deleted = []
        if moved:
            refs["git/refs/heads/" + rows[-1][0]]["object"]["sha"] = "c" * 40

        def api(path, method="GET"):
            if method == "DELETE":
                deleted.append(path)
                refs.pop(path)
                return None
            if path.startswith("branches?"):
                return [{"name": "main"}]
            return refs.get(path)

        def git(*args):
            return commit if args[0] == "rev-parse" else "d" * 40 + " " + helper

        with patch.dict(os.environ, {"GH_REPO": cleanup.REPO, "CLEANUP_COMMIT": commit}), \
             patch.object(cleanup, "api", side_effect=api), \
             patch.object(cleanup, "git", side_effect=git), \
             patch.object(cleanup.subprocess, "run", return_value=subprocess.CompletedProcess([], int(unmerged))), \
             patch("builtins.print"):
            if moved or unmerged:
                with self.assertRaises(SystemExit):
                    cleanup.main()
                self.assertEqual(deleted, [])
            else:
                cleanup.main()
                self.assertEqual(len(deleted), 19)
                self.assertNotIn("git/refs/heads/main", deleted)

    def test_unchanged_merged_branches(self):
        self.exercise()

    def test_moved_tip_refuses_before_any_deletion(self):
        self.exercise(moved=True)

    def test_unmerged_tip_refuses_before_any_deletion(self):
        self.exercise(unmerged=True)


if __name__ == "__main__":
    unittest.main()
