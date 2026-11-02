#!/bin/sh
# BD-5.1 (chantier base-donnees) : essai de restauration à un instant précis (PITR) avec pgBackRest, sur un cluster
# PostgreSQL JETABLE créé par ce script (jamais sur une base existante). Prouve la chaîne : archivage WAL, sauvegarde
# complète, écritures, restauration à l'instant choisi (la ligne écrite après la cible doit disparaître).
# Usage : sudo sh scripts/validation/pitr-essai.sh [dossier-de-travail]   (PostgreSQL 16 et pgbackrest installés)
set -eu
B="${PG_BIN:-/usr/lib/postgresql/16/bin}"
R="${1:-/tmp/fadi-pitr-essai}"
PORT="${PITR_PORT:-54399}"
[ -e "$R" ] && { echo "Le dossier $R existe : choisir un dossier neuf (jetable)."; exit 2; }
mkdir -p "$R/repo" "$R/log" "$R/sock"; chown -R postgres:postgres "$R"
cat > "$R/pgbackrest.conf" <<CONF
[global]
repo1-path=$R/repo
repo1-retention-full=1
log-path=$R/log
lock-path=$R/lock
start-fast=y
[essai]
pg1-path=$R/data
pg1-port=$PORT
pg1-socket-path=$R/sock
CONF
chown postgres:postgres "$R/pgbackrest.conf"
PGB="pgbackrest --config=$R/pgbackrest.conf --stanza=essai"
su postgres -c "$B/initdb -D $R/data -U postgres -A trust >/dev/null"
cat >> "$R/data/postgresql.conf" <<CONF
port = $PORT
unix_socket_directories = '$R/sock'
listen_addresses = ''
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --config=$R/pgbackrest.conf --stanza=essai archive-push %p'
CONF
arreter() { su postgres -c "$B/pg_ctl -D $R/data stop -m fast >/dev/null" 2>/dev/null || true; }
trap arreter EXIT
su postgres -c "$B/pg_ctl -D $R/data -l $R/pg.log start -w >/dev/null"
P="psql -h $R/sock -p $PORT -U postgres -tA"
su postgres -c "$PGB stanza-create" >/dev/null
su postgres -c "$PGB check" >/dev/null
$P -c "CREATE TABLE essai (id int)" -c "INSERT INTO essai VALUES (1)" >/dev/null
su postgres -c "$PGB --type=full backup" >/dev/null
$P -c "INSERT INTO essai VALUES (2)" >/dev/null; sleep 1
CIBLE=$($P -c "SELECT now()"); sleep 1
$P -c "INSERT INTO essai VALUES (3)" -c "SELECT pg_switch_wal()" >/dev/null; sleep 2
DEBUT=$(date +%s)
arreter
su postgres -c "$PGB --delta --type=time '--target=$CIBLE' --target-action=promote restore" >/dev/null
su postgres -c "$B/pg_ctl -D $R/data -l $R/pg.log start -w >/dev/null"
until [ "$($P -c 'SELECT pg_is_in_recovery()')" = "f" ]; do sleep 1; done
LIGNES=$($P -c "SELECT string_agg(id::text, ',' ORDER BY id) FROM essai")
echo "Restauration à $CIBLE : lignes $LIGNES, en $(( $(date +%s) - DEBUT )) s."
[ "$LIGNES" = "1,2" ] || { echo "ÉCHEC : attendu 1,2"; exit 1; }
echo "PITR : essai réussi (la ligne écrite après la cible n'est pas restaurée)."
