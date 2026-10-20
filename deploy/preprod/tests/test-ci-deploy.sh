#!/bin/bash
# Safe, offline checks for the SSH forced-command gateway.
# No SSH connection, Docker daemon, sudo, or privileged action is required.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
GATE="$ROOT/ci-ssh"
DEPLOY="$ROOT/ci-deploy"
FP="$ROOT/fadi-preprod"

for script in "$GATE" "$DEPLOY" "$FP"; do bash -n "$script"; done
echo "✓ scripts Bash syntaxiques"

reject() {
  local original=$1
  if SSH_ORIGINAL_COMMAND="$original" bash "$GATE" >/dev/null 2>&1; then
    echo "✗ commande SSH refusée à tort : $original" >&2
    exit 1
  fi
}
reject ""
reject "whoami"
reject "deploy main"
reject "deploy 7e9994ed"
reject "deploy $(printf '%040d' 0) ; id"
reject "deploy $(printf '%040d' 0) extra"
reject "deploy $(printf '%040d' 0)\nid"
echo "✓ commandes SSH arbitraires refusées"

# These are invariants of the review, not substitutes for independent code review.
grep -qF '/usr/bin/sudo -n /usr/local/sbin/fadi-preprod-ci-deploy "$sha"' "$GATE"
grep -qF 'refs/heads/main' "$DEPLOY"
grep -qF 'actions/workflows/ci.yml/runs?' "$DEPLOY"
grep -qF 'apps/api/src/db deploy/preprod' "$DEPLOY"
grep -qF '"$FP" backup' "$DEPLOY"
grep -qF '"$FP" build-app' "$DEPLOY"
grep -qF '"$FP" smoke' "$DEPLOY"
grep -qF '"$FP" sync "$OLD"' "$DEPLOY"
grep -qF 'build-app)' "$FP"
! grep -Eq 'docker[[:space:]]+compose[[:space:]]+.*(proxy|production)' "$DEPLOY"
echo "✓ limites CI/main, ressources, sauvegarde et retour arrière présentes"
