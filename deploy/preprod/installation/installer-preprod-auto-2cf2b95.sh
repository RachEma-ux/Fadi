#!/bin/bash
# Installation sur le VPS des scripts de préproduction issus de la PR #308 (commit de main 2cf2b95).
#
# À lancer en root sur le VPS :   sudo bash deploy/preprod/installation/installer-preprod-auto-2cf2b95.sh (ou le fichier seul, copié sur le VPS)
#
# Ce que fait ce script :
#   1. télécharge fadi-preprod, fadi-preprod-auto et fadi-preprod-auto.timer depuis GitHub, figés sur le commit
#      2cf2b95 (jamais une branche mobile), et refuse tout fichier dont l'empreinte SHA-256 diffère de celle relue ;
#   2. met le minuteur en pause et attend la fin d'un déploiement automatique en cours (verrou du script) ;
#   3. sauvegarde les versions installées (suffixe .avant-2cf2b95), installe les nouvelles (root, 0755 / 0644) ;
#   4. recharge systemd, relance le minuteur (toutes les 3 minutes) ;
#   5. première purge des images des anciens commits (fadi-preprod nettoyer : commit approuvé et commit en ligne gardés).
# Retour arrière : réinstaller les fichiers *.avant-2cf2b95, puis systemctl daemon-reload && systemctl restart fadi-preprod-auto.timer.
set -euo pipefail
umask 022

COMMIT=2cf2b95fad6c66400b307010b5d713ff53cf7e80
RAW=https://raw.githubusercontent.com/RachEma-ux/Fadi/$COMMIT
BASE=/opt/fadi-preprod
# fichier source | destination | mode | SHA-256 attendue (relue sur le commit)
FICHIERS=(
  "deploy/preprod/fadi-preprod|/usr/local/sbin/fadi-preprod|0755|845e5b26ce8d3110f49f057d620b387a51d3dcdcef28a03baf3ed0f0af46d2da"
  "deploy/preprod/fadi-preprod-auto|/usr/local/sbin/fadi-preprod-auto|0755|09f9be08eb757a3d71b43252a67efdf92e75a6c853a35310dadb761e04426c7f"
  "deploy/preprod/systemd/fadi-preprod-auto.timer|/etc/systemd/system/fadi-preprod-auto.timer|0644|1a424291a8f8242ae2916ef5e6985c697ae4629fd8898cee6116bd77f3dc71b2"
)

die() { echo "❌ $*" >&2; exit 1; }
log() { echo "── $*"; }

[ "$(id -u)" -eq 0 ] || die "à lancer en root (sudo bash $0)"
[ -d "$BASE" ] || die "$BASE absent : la préproduction n'est pas installée sur cette machine"
command -v sha256sum > /dev/null || die "sha256sum introuvable"
command -v curl > /dev/null || die "curl introuvable"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"; systemctl start fadi-preprod-auto.timer 2> /dev/null || true' EXIT

log "téléchargement depuis le commit $COMMIT"
for f in "${FICHIERS[@]}"; do
  IFS='|' read -r src dst mode attendu <<< "$f"
  local_f=$TMP/$(basename "$src")
  curl -fsSL --retry 3 -m 60 -o "$local_f" "$RAW/$src" || die "téléchargement impossible : $src"
  reel=$(sha256sum "$local_f" | cut -d' ' -f1)
  [ "$reel" = "$attendu" ] || die "empreinte inattendue pour $src ($reel ≠ $attendu) : rien n'est installé"
  echo "   ✓ $src (sha256 vérifiée)"
done
bash -n "$TMP/fadi-preprod" && bash -n "$TMP/fadi-preprod-auto" || die "erreur de syntaxe dans un script téléchargé"

log "pause du minuteur et attente de la fin d'un éventuel déploiement en cours"
systemctl stop fadi-preprod-auto.timer
exec 8> "$BASE/.auto.verrou"
flock -w 5400 8 || die "un déploiement automatique est toujours en cours après 90 min : réessayer plus tard"

log "installation (anciennes versions gardées en *.avant-2cf2b95)"
for f in "${FICHIERS[@]}"; do
  IFS='|' read -r src dst mode attendu <<< "$f"
  [ -e "$dst" ] && cp -p "$dst" "$dst.avant-2cf2b95"
  install -o root -g root -m "$mode" "$TMP/$(basename "$src")" "$dst"
  echo "   ✓ $dst ($mode)"
done
flock -u 8

systemctl daemon-reload
systemctl enable --now fadi-preprod-auto.timer > /dev/null
log "minuteur : $(systemctl show -p TimersCalendar --value fadi-preprod-auto.timer)"

log "première purge des images des anciens commits"
garder=$(python3 -I -c 'import json, sys
try: print(json.load(open(sys.argv[1])).get("en_ligne", ""))
except Exception: print("")' "$BASE/etat.json" 2> /dev/null || true)
if [[ $garder =~ ^[0-9a-f]{40}$ ]]; then
  fadi-preprod nettoyer "$garder" || echo "⚠ purge en échec (sans conséquence sur le déploiement) : relancer fadi-preprod nettoyer plus tard"
else
  fadi-preprod nettoyer || echo "⚠ purge en échec (sans conséquence sur le déploiement) : relancer fadi-preprod nettoyer plus tard"
fi

echo
echo "✓ Installation terminée. Contrôles :"
echo "   systemctl list-timers fadi-preprod-auto.timer"
echo "   fadi-preprod status"
echo "   journalctl -u fadi-preprod-auto.service -n 50"
echo "Le premier déploiement suivant reconstruit une fois la couche npm ci de l'image de recette ; les suivants sont plus rapides."
