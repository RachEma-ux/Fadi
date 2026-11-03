-- BD-8.5 (constat B4) : extension des trigrammes, pour la recherche d'unités par nom (`lower(nom) LIKE '%…%'`,
-- `routes/geodata/consultation.ts`). L'index lui-même est créé sans verrou par 0008.
-- Comme `postgis` dans init.sql, l'extension est créée par le rôle de connexion de la migration et non par
-- `fadi_owner` (rôle NOLOGIN sans droit CREATE sur la base) : `SET LOCAL ROLE NONE` pour cette seule transaction.
-- Prérequis : ce rôle (superutilisateur `fadi` en CI et sous docker-compose, ou `fadi_migrator`) doit avoir le droit de
-- créer l'extension — pg_trgm est « trusted » depuis PostgreSQL 13, le droit CREATE sur la base suffit. Sinon un
-- administrateur la crée au préalable (`CREATE EXTENSION pg_trgm WITH SCHEMA public;`) et ce fichier ne fait plus rien.
-- Retour arrière : aucun (l'extension ne change aucun comportement existant).
SET LOCAL ROLE NONE;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
