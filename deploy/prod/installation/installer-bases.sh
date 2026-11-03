#!/bin/bash
# Installation sur le VPS de la sauvegarde continue et de la rétention de la base (chantier bases-de-donnees, BD-7 et
# BD-8 ; décision du maître d'ouvrage du 3 novembre 2026) — geste unique de l'administrateur, APRÈS la mise en
# production (Release) du commit qui contient ces fichiers :
#   sudo bash installer-bases.sh <commit40>
#
# Ce que fait ce script, dans cet ordre (il s'arrête à la première anomalie) :
#   1. vérifie que le commit appartient à main (API publique de GitHub) et que la copie de production l'a déjà reçu ;
#   2. télécharge fadi-pitr, fadi-backup-retention et leurs unités systemd figés sur ce commit et refuse tout fichier
#      dont l'empreinte SHA-256 diffère de celle inscrite ci-dessous (ops/pitr/tests/run.sh la contrôle) ;
#   3. installe (anciennes versions gardées en *.avant-<commit court>) et recharge systemd ;
#   4. recrée les SEULS conteneurs db et backup avec la configuration du commit (archivage du journal, statistiques des
#      requêtes, sauvegarde par le rôle fadi_backup) : la base est indisponible quelques secondes, l'application se
#      reconnecte seule ; les données (volume fadi-db) ne sont pas touchées ;
#   5. contrôle : application en ligne (/health), archivage d'un segment, première sauvegarde de base envoyée hors du
#      VPS, première restauration de contrôle depuis le dépôt hors VPS (durée mesurée) ;
#   6. active les minuteurs : envoi toutes les 10 minutes, base chaque nuit, contrôle mensuel, rétention hebdomadaire.
# Retour arrière : systemctl disable --now fadi-pitr-envoi.timer fadi-pitr-base.timer fadi-pitr-verifier.timer
#   fadi-backup-retention.timer ; les conteneurs reprennent l'ancienne configuration avec le commit précédent.
set -euo pipefail
umask 022

# fichier source | destination | mode | SHA-256 attendue
FICHIERS=(
  "ops/pitr/fadi-pitr|/usr/local/sbin/fadi-pitr|0755|07c6ac2d52d30dceade5941e3076aba83a24f4a249a188fdd193a3532e2e4e07"
  "scripts/backup-retention-restic.sh|/usr/local/sbin/fadi-backup-retention|0755|8ea3dce7f2c57786aa482be7bbce8ee309514935efb458b3fb99a9a26fc96e02"
  "ops/systemd/fadi-pitr-envoi.service|/etc/systemd/system/fadi-pitr-envoi.service|0644|56ff5df4a2f5608ed509a4ffad995266d25b94d968d906a4e11bda0e1bce1c7e"
  "ops/systemd/fadi-pitr-envoi.timer|/etc/systemd/system/fadi-pitr-envoi.timer|0644|2638ddb7900a6c72a50ecb8025a6899c93550ecedd02afd5341dafede492e69c"
  "ops/systemd/fadi-pitr-base.service|/etc/systemd/system/fadi-pitr-base.service|0644|439d9342caa2cecf85cb004ced7d594c62fb10e6501bd9d49691ab238a84494f"
  "ops/systemd/fadi-pitr-base.timer|/etc/systemd/system/fadi-pitr-base.timer|0644|9fb355fc2069d508fbe976a24e385559e777d0da360ae81e428199580ce33a05"
  "ops/systemd/fadi-pitr-verifier.service|/etc/systemd/system/fadi-pitr-verifier.service|0644|9582dd19c7266a7fb63487bd50f401a3c800c40f922b74c8ce92e4e80d1fb088"
  "ops/systemd/fadi-pitr-verifier.timer|/etc/systemd/system/fadi-pitr-verifier.timer|0644|9183d3b0becd45ca813b43e1b0c15f68738895366d02ce157e98c8d911927a3c"
  "ops/systemd/fadi-backup-retention.service|/etc/systemd/system/fadi-backup-retention.service|0644|4882ff12327698dbb52b2e972ae57dadd9d56b852963ebedef90d0b5e67818e0"
  "ops/systemd/fadi-backup-retention.timer|/etc/systemd/system/fadi-backup-retention.timer|0644|b8ba8379aeaf42de6d16e05d08ed3e81deb9e8f3ad1d39914f7a8110455eea3d"
)
MINUTEURS=(fadi-pitr-envoi.timer fadi-pitr-base.timer fadi-pitr-verifier.timer fadi-backup-retention.timer)
APP=/mnt/data/fadi/app
DOMAINE=${FADI_PROD_URL:-https://www.fadimmo.com}

die() { echo "❌ $*" >&2; exit 1; }
log() { echo "── $*"; }

COMMIT=${1:-}
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || die "usage : sudo bash $0 <commit40>"
[ "$(id -u)" -eq 0 ] || die "à lancer en root (sudo bash $0 …)"
for c in curl sha256sum python3 systemctl systemd-analyze git docker flock restic; do command -v "$c" > /dev/null || die "$c introuvable"; done
COURT=${COMMIT:0:12}
RAW=https://raw.githubusercontent.com/RachEma-ux/Fadi/$COMMIT
dc() { docker compose -p app --project-directory "$APP" --env-file "$APP/.env.deploy" -f "$APP/docker-compose.yml" "$@"; }
sqlsu() { dc exec -T -u postgres db psql -U fadi -d fadi -XAtqc "$1"; }

log "prérequis"
[ -d "$APP/.git" ] && [ -f "$APP/docker-compose.yml" ] && [ -f "$APP/.env.deploy" ] || die "$APP n'est pas la copie de production attendue"
[ -f /etc/fadi/restic.env ] || die "/etc/fadi/restic.env absent : la sauvegarde hors VPS doit être installée (docs/sauvegarde-externe.md)"
systemctl cat fadi-backup-offsite.service > /dev/null 2>&1 || die "fadi-backup-offsite.service absent"
git -c "safe.directory=$APP" -C "$APP" merge-base --is-ancestor "$COMMIT" HEAD \
  || die "la production n'a pas encore reçu $COURT : publier d'abord la Release qui le contient, puis relancer"
[ -x "$APP/ops/pitr/entrypoint.sh" ] && [ -x "$APP/ops/pitr/archiver-wal.sh" ] || die "ops/pitr absent de la copie de production"
[ "$(sqlsu "SELECT rolreplication FROM pg_roles WHERE rolname = 'fadi_backup'")" = t ] \
  || die "fadi_backup sans droit de réplication : la migration de cette version n'a pas tourné (Release)"
echo "   ✓ copie de production au commit, dépôt hors VPS configuré, rôle fadi_backup prêt"

log "le commit $COMMIT appartient-il à main ?"
statut=$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/RachEma-ux/Fadi/compare/$COMMIT...main" \
  | python3 -I -c 'import json, sys; print(json.load(sys.stdin).get("status", ""))') || die "API GitHub injoignable"
case "$statut" in identical|ahead) echo "   ✓ $statut" ;; *) die "$COMMIT n'appartient pas à main ($statut)" ;; esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
log "téléchargement depuis le commit $COMMIT"
for f in "${FICHIERS[@]}"; do
  IFS='|' read -r src dst mode attendu <<< "$f"
  curl -fsSL --retry 3 -m 60 -o "$TMP/$(basename "$dst")" "$RAW/$src" || die "téléchargement impossible : $src"
  reel=$(sha256sum "$TMP/$(basename "$dst")" | cut -d' ' -f1)
  [ "$reel" = "$attendu" ] || die "empreinte inattendue pour $src ($reel ≠ $attendu) : rien n'est installé"
  echo "   ✓ $src (sha256 vérifiée)"
done
bash -n "$TMP/fadi-pitr" && bash -n "$TMP/fadi-backup-retention" || die "erreur de syntaxe"

exec 9> /mnt/data/fadi/deployments/deploiement.lock
flock -w 14400 9 || die "un déploiement de production est en cours : réessayer plus tard"

log "installation (anciennes versions gardées en *.avant-$COURT)"
for f in "${FICHIERS[@]}"; do
  IFS='|' read -r src dst mode attendu <<< "$f"
  [ -e "$dst" ] && cp -p "$dst" "$dst.avant-$COURT"
  install -o root -g root -m "$mode" "$TMP/$(basename "$dst")" "$dst"
  echo "   ✓ $dst ($mode)"
done
systemctl daemon-reload
for f in "${FICHIERS[@]}"; do
  IFS='|' read -r src dst mode attendu <<< "$f"
  case "$dst" in *.service|*.timer) systemd-analyze verify "$dst" ;; esac
done

log "recréation des conteneurs db et backup (quelques secondes d'indisponibilité de la base)"
dc up -d --no-deps --no-build --wait --wait-timeout 180 db backup || die "db / backup non démarrés : voir docker compose logs db"
for _ in $(seq 1 60); do curl -fsS -m 5 "$DOMAINE/health" 2> /dev/null | grep -q '"db":"ok"' && break; sleep 2; done
curl -fsS -m 5 "$DOMAINE/health" | grep -q '"db":"ok"' || die "application sans base après la recréation"
echo "   ✓ base recréée, application en ligne"
[ "$(sqlsu 'SHOW archive_mode')" = on ] || die "archivage inactif après la recréation"
seg=$(sqlsu "SELECT pg_walfile_name(pg_switch_wal())")
for _ in $(seq 1 60); do [ "$(sqlsu "SELECT coalesce(last_archived_wal >= '$seg', false) FROM pg_stat_archiver")" = t ] && break; sleep 2; done
[ "$(sqlsu "SELECT coalesce(last_archived_wal >= '$seg', false) FROM pg_stat_archiver")" = t ] || die "segment $seg non archivé : voir docker compose logs db"
echo "   ✓ journal archivé ($seg)"
flock -u 9

log "première sauvegarde de base et envoi hors du VPS"
systemctl start fadi-pitr-base.service || die "fadi-pitr-base en échec : journalctl -u fadi-pitr-base -n 50"
log "première restauration de contrôle depuis le dépôt hors VPS (durée mesurée)"
systemctl start fadi-pitr-verifier.service || die "restauration de contrôle en échec : journalctl -u fadi-pitr-verifier -n 80"
cat /mnt/data/fadi/pitr/derniere-verification.json

log "minuteurs"
systemctl enable --now "${MINUTEURS[@]}" > /dev/null
systemctl list-timers "${MINUTEURS[@]}" --no-pager
echo
echo "✓ Sauvegarde continue en service. Contrôles : /usr/local/sbin/fadi-pitr etat ; journalctl -u fadi-pitr-envoi -n 20"
