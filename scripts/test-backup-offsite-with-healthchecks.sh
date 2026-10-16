#!/usr/bin/env bash
# Tests locaux sans appels à Healthchecks.io ni sauvegardes réelles.
# Exécuter : sudo bash scripts/test-backup-offsite-with-healthchecks.sh
set -Eeuo pipefail
[[ $(id -u) -eq 0 ]] || { echo "Exécuter les tests en root."; exit 1; }
cd "$(dirname "$0")/.."

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/fakebin"
chmod 700 "$work"

printf '%s\n' 'https://hc-ping.com/12345678-1234-1234-1234-123456789abc' > "$work/healthchecks-url"
chmod 600 "$work/healthchecks-url"

cat > "$work/fakebin/python3" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "${FADI_HC_EVENT:-success}" >> "$FADI_TEST_EVENT_LOG"
exit "${FADI_TEST_PING_EXIT:-0}"
MOCK
chmod 700 "$work/fakebin/python3"

cat > "$work/backup-ok" <<'MOCK'
#!/usr/bin/env bash
echo "TEST_BACKUP_OK"
exit 0
MOCK
cat > "$work/backup-fail" <<'MOCK'
#!/usr/bin/env bash
echo "TEST_BACKUP_FAIL"
exit 7
MOCK
chmod 700 "$work/backup-ok" "$work/backup-fail"

export FADI_HEALTHCHECK_URL_FILE="$work/healthchecks-url"
export FADI_TEST_EVENT_LOG="$work/events"
export PATH="$work/fakebin:$PATH"

# Sauvegarde réussie = début + succès et status 0.
export FADI_BACKUP_SCRIPT="$work/backup-ok"
: > "$work/events"
bash scripts/backup-offsite-with-healthchecks.sh > "$work/stdout" 2> "$work/stderr"
printf '/start\nsuccess\n' > "$work/expected"
diff -u "$work/expected" "$work/events"
grep -q 'succès signalé' "$work/stdout"

# Sauvegarde échouée = début + fail et conservation du code d'échec 7.
export FADI_BACKUP_SCRIPT="$work/backup-fail"
: > "$work/events"
set +e
bash scripts/backup-offsite-with-healthchecks.sh > "$work/stdout" 2> "$work/stderr"
status=$?
set -e
[[ "$status" -eq 7 ]] || { echo "Code de sortie inattendu : $status"; exit 1; }
printf '/start\n/fail\n' > "$work/expected"
diff -u "$work/expected" "$work/events"
grep -q 'code 7' "$work/stderr"

# Le réseau d'alerte indisponible ne modifie pas le résultat du backup réussi.
export FADI_BACKUP_SCRIPT="$work/backup-ok"
export FADI_TEST_PING_EXIT=1
: > "$work/events"
bash scripts/backup-offsite-with-healthchecks.sh > "$work/stdout" 2> "$work/stderr"
grep -q 'signal de succès non confirmé' "$work/stderr"
unset FADI_TEST_PING_EXIT

# Refus si URL potentiellement exposée aux autres utilisateurs.
chmod 644 "$work/healthchecks-url"
set +e
bash scripts/backup-offsite-with-healthchecks.sh > "$work/stdout" 2> "$work/stderr"
status=$?
set -e
[[ "$status" -ne 0 ]] || { echo "Permissions trop larges acceptées"; exit 1; }
grep -q 'inaccessible au groupe' "$work/stderr"

echo "FADI_MONITOR_TESTS_OK"
