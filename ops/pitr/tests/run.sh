#!/bin/bash
# BD-7 — essais des scripts de sauvegarde continue (ops/pitr) sur un serveur PostgreSQL jetable : archivage du journal,
# sauvegarde de base et rétention locale, restauration à la fin du journal et à un instant donné. Aucun réseau, aucun
# secret ; à lancer en root (le serveur jetable tourne avec l'utilisateur postgres). En CI : dans l'image de la base,
#   docker run --rm -v "$PWD:/src:ro" postgis/postgis:16-3.4 bash /src/ops/pitr/tests/run.sh
set -euo pipefail
ICI=$(cd "$(dirname "$0")/.." && pwd)
BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
export PATH=$BIN:$PATH
[ "$(id -u)" = 0 ] || { echo "à lancer en root" >&2; exit 1; }
T=$(mktemp -d); chown postgres "$T"; chmod 0700 "$T"
ok=0 ko=0
pass() { echo "✓ $1"; ok=$((ok + 1)); }
fail() { echo "✗ $1"; ko=$((ko + 1)); }
pg() { runuser -u postgres -- env PATH="$PATH" "$@"; }
fin() { pg pg_ctl -D "$T/prod" -m immediate -w stop > /dev/null 2>&1 || true; rm -rf "$T"; }
trap fin EXIT

echo "== sources : syntaxe, empreintes de l'installeur, rétention"
R=$(cd "$ICI/../.." && pwd)
for f in "$ICI"/*.sh "$ICI/fadi-pitr" "$R/scripts/backup-retention-restic.sh" "$R/deploy/prod/installation/installer-bases.sh"; do
  bash -n "$f" && pass "bash -n $(basename "$f")" || fail "bash -n $f"
done
n=0
while IFS='|' read -r src _ _ attendu; do
  src=${src#*\"}; attendu=${attendu%\"}
  [ "$(sha256sum "$R/$src" | cut -d' ' -f1)" = "$attendu" ] && n=$((n + 1)) || fail "empreinte de $src dans installer-bases.sh"
done < <(grep -E '^  "[^"]+\|[^|]+\|[0-9]+\|[0-9a-f]{64}"$' "$R/deploy/prod/installation/installer-bases.sh")
[ "$n" = 10 ] && pass "installer-bases.sh : 10 empreintes conformes aux fichiers du dépôt" || fail "installer-bases.sh : $n empreintes conformes sur 10"
r="$R/scripts/backup-retention-restic.sh"
grep -q -- '--dry-run' "$r" && fail "rétention : --dry-run présent" || pass "rétention réelle (aucun --dry-run)"
for o in "--tag fadi,postgres" "--group-by host,paths" "--keep-last 5" "--keep-daily 14" "--keep-weekly 8" "--keep-monthly 12" "--keep-within 14d" "restic prune" "48 * 3600"; do
  grep -qF -- "$o" "$r" || fail "rétention : $o absent"
done
pass "rétention : politique 5 / 14 / 8 / 12, journal 14 jours, garde-fou 48 h"
grep -q 'archive_command=/opt/fadi-pitr/archiver-wal.sh %p %f' "$R/docker-compose.yml" && grep -q 'fadi-db-socket:/var/run/postgresql' "$R/docker-compose.yml" \
  && pass "docker-compose.yml : archivage et socket partagé" || fail "docker-compose.yml : archivage ou socket"
grep -q 'PGPASSWORD' <(sed -n '/^  backup:/,/^volumes:/p' "$R/docker-compose.yml") && fail "backup détient encore PGPASSWORD" || pass "backup sans mot de passe du super-utilisateur"
if command -v systemd-analyze > /dev/null; then
  for u in "$R"/ops/systemd/fadi-pitr-*.timer "$R"/ops/systemd/fadi-backup-retention.timer; do
    c=$(sed -n 's/^OnCalendar=//p' "$u"); systemd-analyze calendar "$c" > /dev/null && pass "calendrier valide : $(basename "$u")" || fail "calendrier $u"
  done
fi

echo "== archiver-wal.sh"
pg mkdir -p "$T/wal" "$T/base" "$T/sock" "$T/x"
printf 'segment' > "$T/x/seg"; chown postgres "$T/x/seg"
N=000000010000000000000001
pg env PITR_WAL="$T/wal" "$ICI/archiver-wal.sh" "$T/x/seg" $N && [ -f "$T/wal/$N" ] && pass "segment archivé" || fail "segment archivé"
pg env PITR_WAL="$T/wal" "$ICI/archiver-wal.sh" "$T/x/seg" $N && pass "segment identique déjà archivé : accepté" || fail "segment identique"
printf 'autre' > "$T/x/seg2"; chown postgres "$T/x/seg2"
pg env PITR_WAL="$T/wal" "$ICI/archiver-wal.sh" "$T/x/seg2" $N 2> /dev/null && fail "contenu différent refusé" || pass "contenu différent sous le même nom : refusé"
pg env PITR_WAL="$T/wal" "$ICI/archiver-wal.sh" "$T/x/seg" "../evil" 2> /dev/null && fail "nom refusé" || pass "nom hors format : refusé"
rm -f "$T/wal/$N"

echo "== serveur jetable avec archivage"
pg initdb -D "$T/prod" -U postgres --auth=trust > /dev/null
cat >> "$T/prod/postgresql.conf" <<CONF
listen_addresses = ''
unix_socket_directories = '$T/sock'
port = 5498
wal_level = replica
archive_mode = on
archive_command = 'PITR_WAL=$T/wal $ICI/archiver-wal.sh %p %f'
archive_timeout = 60
CONF
pg pg_ctl -D "$T/prod" -l "$T/prod.log" -w start > /dev/null
q() { pg psql -h "$T/sock" -p 5498 -U postgres -d "${2:-fadi}" -XAtqc "$1"; }
q "CREATE DATABASE fadi" postgres
q "CREATE ROLE fadi_backup LOGIN REPLICATION; CREATE SCHEMA admin; CREATE TABLE admin.schema_applications (id int, appliquee_le timestamptz); GRANT USAGE ON SCHEMA admin TO fadi_backup; GRANT SELECT ON ALL TABLES IN SCHEMA admin TO fadi_backup"
q "INSERT INTO admin.schema_applications VALUES (1, '2026-01-01T00:00:00Z')"

echo "== base.sh et rétention locale"
B() { pg env PITR_BASE="$T/base" PITR_WAL="$T/wal" PITR_SOCKET="$T/sock" PITR_PORT=5498 PITR_GARDER=2 "$ICI/base.sh"; }
for i in 1 2 3; do B > "$T/base-$i.log" 2>&1 || { cat "$T/base-$i.log"; fail "base $i"; }; sleep 1; done
n=$(find "$T/base" -mindepth 1 -maxdepth 1 -type d | wc -l)
[ "$n" = 2 ] && pass "trois bases, deux gardées" || fail "rétention locale ($n bases)"
pa=$(find "$T/base" -mindepth 1 -maxdepth 1 -type d | sort | head -1)
debut=$(cat "$pa/wal-debut")
avant=$(find "$T/wal" -maxdepth 1 -regextype posix-extended -regex '.*/[0-9A-F]{24}' -printf '%f\n' | awk -v d="$debut" '$1 < d' | wc -l)
[ "$avant" = 0 ] && pass "journal antérieur à la plus ancienne base retiré" || fail "journal antérieur gardé ($avant)"
grep -q "base écrite" "$T/base-3.log" && pass "base écrite par fadi_backup (lecture et réplication)" || fail "journal de base.sh"

echo "== activité après la base, puis restaurations"
q "INSERT INTO admin.schema_applications VALUES (2, now())"
sleep 2; instant=$(date -u +%Y-%m-%dT%H:%M:%S+00); sleep 2
q "INSERT INTO admin.schema_applications VALUES (3, now() + interval '1 day')"
q "SELECT pg_switch_wal()" > /dev/null
for _ in $(seq 1 60); do [ "$(q "SELECT last_archived_wal IS NOT NULL AND last_archived_time > now() - interval '30 seconds' FROM pg_stat_archiver" postgres)" = t ] && break; sleep 1; done
derniere_base=$(find "$T/base" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)
V() { pg env PITR_VERIF_ROLE=postgres "$ICI/verifier-restauration.sh" "$derniere_base" "$T/wal" "$T/verif" "${1:-}"; }
pg mkdir -p "$T/verif"
r=$(V) || { cat "$T/verif/restauration.log"; fail "restauration complète"; r=; }
attendu=$(q "SELECT to_char(max(appliquee_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') FROM admin.schema_applications")
[[ $r == *'"resultat":"succes"'* && $r == *"\"derniere_migration\":\"$attendu\""* ]] && pass "restauration jusqu'à la fin du journal : dernière écriture retrouvée" || fail "restauration complète : $r"
r=$(V "$instant") || { cat "$T/verif/restauration.log"; fail "restauration à un instant"; r=; }
[[ $r == *'"resultat":"succes"'* && $r != *"\"derniere_migration\":\"$attendu\""* ]] && pass "restauration à un instant donné : écriture postérieure absente" || fail "restauration à l'instant $instant : $r"
[ "$(q "SELECT count(*) FROM admin.schema_applications")" = 3 ] && pass "base en service intacte" || fail "base en service modifiée"
q "SELECT 1" > /dev/null && pass "aucun effet sur le serveur en service" || fail "serveur en service"

echo
echo "Sauvegarde continue (ops/pitr) : $ok réussi(s), $ko échec(s)"
[ "$ko" = 0 ]
