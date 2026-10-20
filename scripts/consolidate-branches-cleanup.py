"""One-time branch cleanup explicitly requested by the owner on 20 October 2026.

Only the checkpoint's exact branch names are eligible. Preflight all branches
before any deletion; never delete main or a branch with unmerged/new commits.
Commit history remains reachable through the consolidation merge.
"""
import json
import os
import re
import time
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "RachEma-ux/Fadi"
CHECKPOINT = os.environ.get("CLEANUP_CHECKPOINT", "docs/continuity/BRANCH-CONSOLIDATION-2026-10-20.md")
EXPECTED_COUNT = int(os.environ.get("CLEANUP_EXPECTED_BRANCHES", "18"))
HELPER = os.environ.get("CLEANUP_HELPER_BRANCH", "chore/consolidate-fadi-branches")


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def api(path, method="GET"):
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}", method=method,
        headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        if method in ("GET", "DELETE") and error.code == 404:
            return None
        raise


def main():
    if os.environ.get("GH_REPO") != REPO:
        raise SystemExit("Wrong repository; cleanup refused")
    commit = os.environ["CLEANUP_COMMIT"]
    if not re.fullmatch(r"[0-9a-f]{40}", commit) or git("rev-parse", "HEAD") != commit:
        raise SystemExit("Unexpected checkout; cleanup refused")
    rows = re.findall(r"^\| `([^`]+)` \| `([0-9a-f]{40})` \|$",
                      Path(CHECKPOINT).read_text(), re.MULTILINE)
    if len(rows) != EXPECTED_COUNT or len({name for name, _ in rows}) != EXPECTED_COUNT:
        raise SystemExit("Original branch checkpoint invalid; cleanup refused")
    # The helper tip must be the PR's second merge parent. This also refuses
    # cleanup after squash/rebase, which would lose the original ancestry.
    parents = git("show", "-s", "--format=%P", commit).split()
    if len(parents) != 2:
        raise SystemExit("Expected two-parent consolidation PR merge; cleanup refused")
    rows.append((HELPER, parents[1]))
    plan = []
    for name, expected in rows:
        if name == "main":
            raise SystemExit("main must never be deleted")
        if subprocess.run(["git", "merge-base", "--is-ancestor", expected, commit]).returncode:
            raise SystemExit(f"Unmerged commit on {name}; cleanup refused")
        path = "git/refs/heads/" + urllib.parse.quote(name, safe="/")
        ref = api(path)
        if ref is None:
            print(f"Already absent: {name}")
            continue
        if ref["object"]["sha"] != expected:
            raise SystemExit(f"Branch moved: {name}; cleanup refused before deleting anything")
        plan.append((name, expected, path))
    # Re-read immediately before each deletion to detect concurrent pushes.
    # GitHub's DELETE-ref endpoint has no conditional-SHA parameter.
    deleted = []
    for name, expected, path in plan:
        ref = api(path)
        if ref is None:
            continue
        if ref["object"]["sha"] != expected:
            raise SystemExit(f"Branch moved during cleanup: {name}; stopped")
        api(path, method="DELETE")
        for attempt in range(8):
            if api(path) is None:
                break
            time.sleep(1)
        else:
            raise SystemExit(f"Deletion not confirmed after retries: {name}")
        print(f"Deleted merged branch: {name} ({expected})")
        deleted.append(name)
    for attempt in range(8):
        remaining = api("branches?per_page=100")
        names = [branch["name"] for branch in remaining]
        if names == ["main"]:
            break
        time.sleep(1)
    print("Remaining branches:", json.dumps(names))
    summary = "## Authorized branch cleanup\n\n" + "\n".join(f"- Deleted `{n}`" for n in deleted)
    summary += "\n\nRemaining: " + ", ".join(f"`{n}`" for n in names) + "\n"
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write(summary)
    if names != ["main"]:
        raise SystemExit("Additional branches remain; no unrecorded branch was deleted")


if __name__ == "__main__":
    main()
