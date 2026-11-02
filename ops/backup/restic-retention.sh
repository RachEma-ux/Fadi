#!/bin/sh
# BD-5.3 (chantier base-donnees, constat M14) : rétention du dépôt restic distant (Swiss Backup).
# Par défaut ESSAI À BLANC (`forget --dry-run`) : liste ce qui serait supprimé, ne supprime rien. L'application réelle
# exige à la fois `--appliquer` et FADI_RETENTION_VALIDEE=oui, puis lance `prune` et `check`. Décisions du maître
# d'ouvrage du 2 novembre 2026 : D-BD-2 (14 quotidiennes, 8 hebdomadaires, 12 mensuelles, soit 12 mois au plus) et
# D-BD-3 (forget / prune autorisés après inventaire et essai à blanc, par un timer distinct :
# ops/systemd/fadi-backup-retention.*). Politique modifiable par l'environnement :
#   RESTIC_KEEP_DAILY (14), RESTIC_KEEP_WEEKLY (8), RESTIC_KEEP_MONTHLY (12)
# Les dumps faits avant chaque déploiement automatique sont purgés au-delà de FADI_DUMPS_DEPLOIEMENT_JOURS jours si
# cette variable et FADI_DUMPS_DEPLOIEMENT_DOSSIER sont fournies (même règle : essai à blanc sans --appliquer).
# RESTIC_REPOSITORY et RESTIC_PASSWORD_FILE (ou RESTIC_PASSWORD) viennent de restic.env (ops/backup/restic.env.example).
set -eu
APPLIQUER=non
[ "${1:-}" = "--appliquer" ] && APPLIQUER=oui
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY manquant}"
: "${RESTIC_KEEP_DAILY:=14}"
: "${RESTIC_KEEP_WEEKLY:=8}"
: "${RESTIC_KEEP_MONTHLY:=12}"
for n in "$RESTIC_KEEP_DAILY" "$RESTIC_KEEP_WEEKLY" "$RESTIC_KEEP_MONTHLY"; do
  case "$n" in ''|*[!0-9]*) echo "Politique de rétention invalide : $n"; exit 2 ;; esac
done
if [ "$APPLIQUER" = oui ] && [ "${FADI_RETENTION_VALIDEE:-}" != oui ]; then
  echo "Refus : --appliquer exige FADI_RETENTION_VALIDEE=oui (posé par fadi-backup-retention.service, D-BD-3)."; exit 2
fi
GARDER="--keep-daily $RESTIC_KEEP_DAILY --keep-weekly $RESTIC_KEEP_WEEKLY --keep-monthly $RESTIC_KEEP_MONTHLY"
if [ "$APPLIQUER" = oui ]; then
  # shellcheck disable=SC2086
  restic forget $GARDER --prune
  restic check
else
  # shellcheck disable=SC2086
  restic forget $GARDER --dry-run
fi
if [ -n "${FADI_DUMPS_DEPLOIEMENT_DOSSIER:-}" ] && [ -n "${FADI_DUMPS_DEPLOIEMENT_JOURS:-}" ]; then
  if [ "$APPLIQUER" = oui ]; then
    find "$FADI_DUMPS_DEPLOIEMENT_DOSSIER" -name 'avant-deploiement.dump' -mtime +"$FADI_DUMPS_DEPLOIEMENT_JOURS" -print -delete
  else
    echo "Dumps de déploiement qui seraient supprimés :"
    find "$FADI_DUMPS_DEPLOIEMENT_DOSSIER" -name 'avant-deploiement.dump' -mtime +"$FADI_DUMPS_DEPLOIEMENT_JOURS" -print
  fi
fi
echo "Rétention : $( [ "$APPLIQUER" = oui ] && echo appliquée || echo 'essai à blanc, rien supprimé' )."
