#!/bin/sh
# BD-5.3 (chantier base-donnees, constat M14) : rétention du dépôt restic distant (Swiss Backup).
# Par défaut ESSAI À BLANC (`forget --dry-run`) : liste ce qui serait supprimé, ne supprime rien. L'application réelle
# exige à la fois `--appliquer` et FADI_RETENTION_VALIDEE=oui (décisions D-BD-2 et D-BD-3 du maître d'ouvrage, à
# consigner), puis lance `prune`. Politique fournie par l'environnement, sans valeur par défaut :
#   RESTIC_KEEP_DAILY, RESTIC_KEEP_WEEKLY, RESTIC_KEEP_MONTHLY   (proposition du plan : 14, 8, 12)
# Les dumps faits avant chaque déploiement automatique sont purgés au-delà de FADI_DUMPS_DEPLOIEMENT_JOURS jours si
# cette variable et FADI_DUMPS_DEPLOIEMENT_DOSSIER sont fournies (même règle : essai à blanc sans --appliquer).
# RESTIC_REPOSITORY et RESTIC_PASSWORD_FILE (ou RESTIC_PASSWORD) viennent de restic.env (ops/backup/restic.env.example).
set -eu
APPLIQUER=non
[ "${1:-}" = "--appliquer" ] && APPLIQUER=oui
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY manquant}"
: "${RESTIC_KEEP_DAILY:?RESTIC_KEEP_DAILY manquant (décision D-BD-2)}"
: "${RESTIC_KEEP_WEEKLY:?RESTIC_KEEP_WEEKLY manquant (décision D-BD-2)}"
: "${RESTIC_KEEP_MONTHLY:?RESTIC_KEEP_MONTHLY manquant (décision D-BD-2)}"
if [ "$APPLIQUER" = oui ] && [ "${FADI_RETENTION_VALIDEE:-}" != oui ]; then
  echo "Refus : --appliquer exige FADI_RETENTION_VALIDEE=oui (décisions D-BD-2 / D-BD-3 consignées)."; exit 2
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
