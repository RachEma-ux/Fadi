#!/bin/bash
# BD-7 — restauration de contrôle (jamais sur la base en service) : une sauvegarde de base et l'archive du journal sont
# rejouées dans un dossier jetable, sur un serveur PostgreSQL privé (aucune écoute réseau), jusqu'à la fin du journal
# disponible ou jusqu'à un instant donné ; puis contrôles de lecture et durées, en une ligne JSON sur la sortie.
#   verifier-restauration.sh <dossier de la base (base.tar.gz)> <dossier du journal> <dossier de travail> [instant]
# Utilisateur non root (postgres) ; binaires PostgreSQL dans le PATH (pg_ctl, psql).
set -euo pipefail
base=$1 wal=$2 travail=$3 instant=${4:-}
[ "$(id -u)" != 0 ] || { echo "verifier-restauration : à lancer avec l'utilisateur postgres" >&2; exit 1; }
[ -f "$base/base.tar.gz" ] || { echo "verifier-restauration : $base/base.tar.gz absent" >&2; exit 1; }
[ -d "$wal" ] || { echo "verifier-restauration : journal $wal absent" >&2; exit 1; }
debut=$(date +%s)
data=$travail/data sock=$travail/sock
rm -rf "$data" "$sock"; mkdir -p "$data" "$sock"; chmod 0700 "$data"
tar -xzf "$base/base.tar.gz" -C "$data"
touch "$data/recovery.signal"
{
  echo "restore_command = 'cp \"$wal/%f\" \"%p\"'"
  echo "recovery_target_action = 'promote'"
  [ -z "$instant" ] || echo "recovery_target_time = '$instant'"
  echo "archive_mode = 'off'"
  echo "listen_addresses = ''"
  echo "unix_socket_directories = '$sock'"
  echo "port = 5499"
  echo "shared_preload_libraries = ''"
} >> "$data/postgresql.auto.conf"
arreter() { pg_ctl -D "$data" -m fast -w stop > /dev/null 2>&1 || true; }
trap arreter EXIT
pg_ctl -D "$data" -l "$travail/restauration.log" -w -t 3600 start > /dev/null
q() { psql -h "$sock" -p 5499 -d "${PITR_BASE_NOM:-fadi}" -U "${PITR_VERIF_ROLE:-postgres}" -XAtqc "$1"; }
for _ in $(seq 1 3600); do [ "$(q 'SELECT pg_is_in_recovery()')" = f ] && break; sleep 1; done
[ "$(q 'SELECT pg_is_in_recovery()')" = f ] || { echo "verifier-restauration : restauration non terminée" >&2; exit 1; }
tables=$(q "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public', 'auth', 'admin')")
lignes=$(q "SELECT coalesce(sum(n_live_tup), 0) FROM pg_stat_user_tables")
derniere=$(q "SELECT coalesce(to_char(max(appliquee_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), '') FROM admin.schema_applications" 2>/dev/null || true)
[ "$tables" -gt 0 ] || { echo "verifier-restauration : aucune table restaurée" >&2; exit 1; }
duree=$(( $(date +%s) - debut ))
printf '{"resultat":"succes","tables":%s,"derniere_migration":"%s","instant_vise":"%s","duree_restauration_s":%s,"base":"%s"}\n' \
  "$tables" "$derniere" "$instant" "$duree" "$(basename "$base")"
: "$lignes"
