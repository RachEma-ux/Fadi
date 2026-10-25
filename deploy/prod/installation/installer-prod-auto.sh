#!/bin/bash
# Installation sur le VPS de fadi-prod-auto (docs/deploiement-automatique.md, phase B) — geste de l'administrateur.
#
# À lancer en root sur le VPS, avec le commit de main qui contient ces fichiers (sha complet, relu) :
#   sudo bash installer-prod-auto.sh <commit40>             installe, minuteur NON activé
#   sudo bash installer-prod-auto.sh <commit40> --activer   installe et active le minuteur (toutes les 10 minutes)
#
# Ce que fait ce script :
#   1. vérifie que le commit appartient à main (API publique de GitHub, lecture seule) ;
#   2. télécharge fadi-prod-auto, fadi-prod-auto.service et fadi-prod-auto.timer figés sur ce commit (jamais une
#      branche mobile) et refuse tout fichier dont l'empreinte SHA-256 diffère de celle inscrite ci-dessous (relue
#      en revue ; deploy/prod/tests/run.sh contrôle qu'elle est celle des fichiers du dépôt) ;
#   3. vérifie les prérequis : /mnt/data/fadi/app (copie git), /mnt/data/fadi/deployments (root, 0700), l'unité de
#      sauvegarde hors VPS fadi-backup-offsite.service, l'état de la préproduction (/opt/fadi-preprod) ;
#   4. sauvegarde les versions installées (suffixe .avant-<commit court>), installe (root, 0755 / 0644), crée
#      /etc/fadi-prod-auto (0700), recharge systemd, vérifie les unités ; n'active le minuteur que sur --activer.
# L'adresse Healthchecks de la production (contrôle distinct de celui de la préproduction) se pose à la main :
#   install -o root -g root -m 0600 /dev/stdin /etc/fadi-prod-auto/healthchecks-url   (coller l'adresse, puis Ctrl-D)
# Retour arrière : systemctl disable --now fadi-prod-auto.timer ; réinstaller les fichiers *.avant-<commit court>.
set -euo pipefail
umask 022

# fichier source | destination | mode | SHA-256 attendue
FICHIERS=(
  "deploy/prod/fadi-prod-auto|/usr/local/sbin/fadi-prod-auto|0755|87c75e7ea5cfda4440dd786afcbc1e4e8fd2f480bc507ab75894c9b2787bb8e7"
  "deploy/prod/systemd/fadi-prod-auto.service|/etc/systemd/system/fadi-prod-auto.service|0644|f815e8e7c9be48d1a8e614df4a6e3913fbe3524657082beac43a39c9d034ad43"
  "deploy/prod/systemd/fadi-prod-auto.timer|/etc/systemd/system/fadi-prod-auto.timer|0644|8159a8cc0e591c3fc3b94cb24a8f33ec372f8e053a9fd5228f16b33cc31faeda"
)

die() { echo "❌ $*" >&2; exit 1; }
log() { echo "── $*"; }

COMMIT=${1:-}
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || die "usage : sudo bash $0 <commit40> [--activer]"
ACTIVER=0
case "${2:-}" in "") ;; --activer) ACTIVER=1 ;; *) die "usage : sudo bash $0 <commit40> [--activer]" ;; esac
[ "$(id -u)" -eq 0 ] || die "à lancer en root (sudo bash $0 …)"
for c in curl sha256sum python3 systemctl systemd-analyze git docker flock; do command -v "$c" > /dev/null || die "$c introuvable"; done
COURT=${COMMIT:0:12}
RAW=https://raw.githubusercontent.com/RachEma-ux/Fadi/$COMMIT

log "prérequis"
[ -d /mnt/data/fadi/app/.git ] && [ -f /mnt/data/fadi/app/docker-compose.yml ] && [ -f /mnt/data/fadi/app/.env.deploy ] \
  || die "/mnt/data/fadi/app n'est pas la copie de production attendue (.git, docker-compose.yml, .env.deploy)"
[ -d /mnt/data/fadi/deployments ] || install -d -o root -g root -m 0700 /mnt/data/fadi/deployments
[ "$(stat -c '%u %a' /mnt/data/fadi/deployments)" = "0 700" ] || die "/mnt/data/fadi/deployments doit être root, 0700"
systemctl cat fadi-backup-offsite.service > /dev/null 2>&1 || die "fadi-backup-offsite.service absent : la sauvegarde hors VPS doit être installée (docs/sauvegarde-externe.md)"
[ -f /opt/fadi-preprod/etat.json ] && [ -f /opt/fadi-preprod/approved-commit ] || die "état de la préproduction absent (/opt/fadi-preprod) : fadi-preprod-auto doit tourner"
echo "   ✓ copie de production, dossier des déploiements, sauvegarde hors VPS, état de la préproduction"

log "le commit $COMMIT appartient-il à main ?"
statut=$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/RachEma-ux/Fadi/compare/$COMMIT...main" \
  | python3 -I -c 'import json, sys; print(json.load(sys.stdin).get("status", ""))') || die "API GitHub injoignable"
case "$statut" in identical|ahead) echo "   ✓ $statut" ;; *) die "$COMMIT n'appartient pas à main ($statut)" ;; esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
log "téléchargement depuis le commit $COMMIT"
for f in "${FICHIERS[@]}"; do
  IFS='|' read -r src dst mode attendu <<< "$f"
  local_f=$TMP/$(basename "$src")
  curl -fsSL --retry 3 -m 60 -o "$local_f" "$RAW/$src" || die "téléchargement impossible : $src"
  reel=$(sha256sum "$local_f" | cut -d' ' -f1)
  [ "$reel" = "$attendu" ] || die "empreinte inattendue pour $src ($reel ≠ $attendu) : rien n'est installé"
  echo "   ✓ $src (sha256 vérifiée)"
done
bash -n "$TMP/fadi-prod-auto" || die "erreur de syntaxe dans fadi-prod-auto"

log "installation (anciennes versions gardées en *.avant-$COURT)"
systemctl stop fadi-prod-auto.timer 2> /dev/null || true
exec 9> /mnt/data/fadi/deployments/deploiement.lock
flock -w 14400 9 || die "un déploiement de production est toujours en cours : réessayer plus tard"
for f in "${FICHIERS[@]}"; do
  IFS='|' read -r src dst mode attendu <<< "$f"
  [ -e "$dst" ] && cp -p "$dst" "$dst.avant-$COURT"
  install -o root -g root -m "$mode" "$TMP/$(basename "$src")" "$dst"
  echo "   ✓ $dst ($mode)"
done
flock -u 9
[ -d /etc/fadi-prod-auto ] || install -d -o root -g root -m 0700 /etc/fadi-prod-auto
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/fadi-prod-auto.service /etc/systemd/system/fadi-prod-auto.timer

if [ "$ACTIVER" = 1 ]; then
  systemctl enable --now fadi-prod-auto.timer > /dev/null
  log "minuteur activé : $(systemctl show -p TimersCalendar --value fadi-prod-auto.timer)"
else
  log "minuteur NON activé. Pour l'activer : systemctl enable --now fadi-prod-auto.timer"
fi
[ -f /etc/fadi-prod-auto/healthchecks-url ] || echo "⚠ /etc/fadi-prod-auto/healthchecks-url absent : aucune notification (voir l'en-tête de ce script)"
echo
echo "✓ Installation terminée. Contrôles :"
echo "   systemctl list-timers fadi-prod-auto.timer"
echo "   cat /mnt/data/fadi/deployments/etat.json"
echo "   journalctl -u fadi-prod-auto.service -n 50"
