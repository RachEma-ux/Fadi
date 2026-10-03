#!/bin/sh
# Restauration d'une sauvegarde Fadi dans une base (vide ou existante : les tables sont recréées).
# Usage : restore.sh <hôte> <utilisateur> <base> <fichier.dump>  (PGPASSWORD dans l'environnement)
# Procédure complète (arrêt de l'application, vérification) : docs/deploiement.md.
set -eu
HOST="$1"; USER="$2"; DB="$3"; FILE="$4"
# PostGIS : l'extension doit exister dans la base cible (superutilisateur) ; si elle y est déjà (image postgis, base créée
# par un administrateur), cette commande ne fait rien.
psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis;" || echo "postgis : extension non créée par ce rôle (déjà présente ?)"
pg_restore -h "$HOST" -U "$USER" -d "$DB" --clean --if-exists --no-owner --no-privileges --exit-on-error "$FILE"
echo "restauration terminée depuis $FILE"
