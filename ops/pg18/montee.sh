#!/bin/sh
# BD-9.2 (D-BD-9) : pg_upgrade 16 → 18 dans le conteneur à usage unique ops/pg18/pg-upgrade.Dockerfile, base ARRÊTÉE
# (docs/montee-postgresql-18.md, étape 4). Tourne en utilisateur postgres.
#
#   fadi-montee controle   initialise le nouveau cluster s'il est vide, puis pg_upgrade --check (rien n'est modifié dans
#                          l'ancien cluster) ; à refaire autant que voulu
#   fadi-montee executer   pg_upgrade réel
#
# Montages attendus : ancien volume (fadi-db) sur /ancien, nouveau volume (fadi-db18) sur /var/lib/postgresql.
# Variables :
#   MONTEE_LOCALE  (obligatoire) locale de l'ancien template0, relevée avant l'arrêt :
#                  SELECT datcollate FROM pg_database WHERE datname = 'template0';
#   MONTEE_MODE    copy (défaut) : l'ancien volume reste intact = retour arrière immédiat. clone / link / swap exigent
#                  les deux répertoires dans le MÊME montage (pas deux volumes Docker distincts) et rendent l'ancien
#                  cluster inutilisable après le démarrage du nouveau : sauvegarde complète vérifiée obligatoire avant.
#   MONTEE_JOBS    parallélisme de pg_upgrade (défaut : nombre de processeurs)
#   POSTGRES_USER  super-utilisateur d'installation de l'ancien cluster (fadi dans docker-compose.yml)
#   MONTEE_BIN_ANCIEN / MONTEE_BIN_NOUVEAU  binaires (défaut : /usr/lib/postgresql/16/bin et 18/bin de l image)
set -eu
ANCIEN=${MONTEE_ANCIEN:-/ancien}
NOUVEAU=${MONTEE_NOUVEAU:-/var/lib/postgresql/18/docker}
B16=${MONTEE_BIN_ANCIEN:-/usr/lib/postgresql/16/bin}
B18=${MONTEE_BIN_NOUVEAU:-/usr/lib/postgresql/18/bin}
MODE=${MONTEE_MODE:-copy}
JOBS=${MONTEE_JOBS:-$(nproc)}
U=${POSTGRES_USER:-fadi}
: "${MONTEE_LOCALE:?MONTEE_LOCALE manquant (datcollate de template0 de l ancienne base)}"
case "${1:-}" in controle | executer) ;; *) sed -n '2,20p' "$0"; exit 2 ;; esac
case "$MODE" in copy | clone | link | swap) ;; *) echo "MONTEE_MODE inconnu : $MODE"; exit 2 ;; esac
[ "$(id -u)" != 0 ] || { echo "pg_upgrade refuse root : lancer en utilisateur postgres"; exit 2; }
[ "$(cat "$ANCIEN/PG_VERSION" 2>/dev/null)" = 16 ] || { echo "$ANCIEN n'est pas un cluster PostgreSQL 16"; exit 3; }
if "$B16/pg_ctl" -D "$ANCIEN" status >/dev/null 2>&1; then echo "l'ancien serveur tourne encore : arrêter le service db"; exit 3; fi

# Sommes de contrôle : initdb 18 les active par défaut ; pg_upgrade exige le même réglage que l'ancien cluster.
SOMMES=$("$B16/pg_controldata" "$ANCIEN" | awk -F: '/checksum version/ { gsub(/ /, "", $2); print $2 }')
# (--no-data-checksums n'existe qu'à partir de 18 ; avant, l'absence d'option suffit.)
if [ "$SOMMES" != 0 ]; then OPT_SOMMES=--data-checksums
elif "$B18/initdb" --help | grep -q -- --no-data-checksums; then OPT_SOMMES=--no-data-checksums
else OPT_SOMMES=; fi
echo "ancien cluster : sommes de contrôle version ${SOMMES:-?} → initdb ${OPT_SOMMES:-(défaut)} ; mode $MODE ; $JOBS tâche(s)"

if [ ! -s "$NOUVEAU/PG_VERSION" ]; then
  install -d -m 0700 "$NOUVEAU"
  # Mot de passe local inutile : pg_upgrade se connecte par socket en « trust » ; pg_hba.conf de l'ancien cluster recopié
  # ensuite (l'API et la sauvegarde se reconnectent avec leurs mots de passe SCRAM, conservés par pg_upgrade).
  "$B18/initdb" -D "$NOUVEAU" -U "$U" --encoding=UTF8 --locale="$MONTEE_LOCALE" ${OPT_SOMMES:+"$OPT_SOMMES"} --auth=trust >/dev/null
  cp "$ANCIEN/pg_hba.conf" "$NOUVEAU/pg_hba.conf"
  [ ! -f "$ANCIEN/postgresql.auto.conf" ] || cp "$ANCIEN/postgresql.auto.conf" "$NOUVEAU/postgresql.auto.conf"
  echo "nouveau cluster initialisé : $NOUVEAU (pg_hba.conf et postgresql.auto.conf repris)"
fi
echo "réglages actifs de postgresql.conf qui diffèrent (à revoir, rien n'est recopié) :"
grep -Ev '^[[:space:]]*(#|$)' "$ANCIEN/postgresql.conf" | sed 's/[[:space:]]*#.*//' | sort > /tmp/conf16
grep -Ev '^[[:space:]]*(#|$)' "$NOUVEAU/postgresql.conf" | sed 's/[[:space:]]*#.*//' | sort > /tmp/conf18
diff /tmp/conf16 /tmp/conf18 || true

cd /tmp
set -- "$1" --old-bindir="$B16" --new-bindir="$B18" --old-datadir="$ANCIEN" --new-datadir="$NOUVEAU" \
  --username="$U" --socketdir=/tmp --jobs="$JOBS" "--$MODE"
if [ "$1" = controle ]; then
  shift; "$B18/pg_upgrade" --check "$@"
  echo "CONTROLE_OK : rien n'a été modifié ; relancer avec « executer » pendant la fenêtre"
else
  shift; DEBUT=$(date +%s)
  "$B18/pg_upgrade" "$@"
  echo "MONTEE_OK en $(( $(date +%s) - DEBUT )) s ; suite : docs/montee-postgresql-18.md, étape 5 (extensions, statistiques, index)"
fi
