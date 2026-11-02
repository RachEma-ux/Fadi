-- BD-9.1 (chantier base-donnees, décision D-BD-8, constats Q6 / S13) : fichiers en stockage objet S3 — phase « expand ».
--
-- Tables visées : step_files, drawing_exports, volumes, com_pieces. Hors champ : geodata_fichiers (archivage en base
-- exigé par D-GD-29, confirmé par D-BD-8) et geodata_rasters (grilles de valeurs GeoData, pas des fichiers).
--
-- Une ligne porte soit son contenu (`content`, bytea, inchangé), soit une clé d'objet (`objet_cle`) ; l'empreinte
-- SHA-256 et la taille restent en base (`size` existant ; `empreinte` ajoutée là où elle manquait ; `volumes.id` et
-- `com_pieces.empreinte` sont déjà le SHA-256 du contenu).
--
-- Aucune réécriture : colonnes ajoutées nullables sans défaut, `DROP NOT NULL` ne touche que le catalogue, CHECK en
-- NOT VALID (aucun parcours sous verrou exclusif). Toutes les lignes existantes ont un contenu : la validation
-- (`npm run db:validate-constraints`, verrou SHARE UPDATE EXCLUSIVE) réussira ; elle se fait hors déploiement ou dans
-- une migration suivante.
--
-- Compatibilité avec la Release précédente : son code lit et écrit toujours `content` ; tant que FADI_STOCKAGE vaut
-- `base` (défaut) et qu'aucune reprise n'a été lancée, `content` reste rempli partout et le retour à l'image précédente
-- est sans effet. Après `FADI_STOCKAGE=s3` ou la reprise (`npm run db:fichiers-vers-objet -- --appliquer`), les lignes
-- déplacées n'ont plus de `content` : un retour à l'image précédente exige alors de les rapatrier d'abord
-- (docs/deploiement.md, « Stockage des fichiers »). La colonne bytea est conservée (contraction éventuelle : Release
-- ultérieure, `-- bd: contraction`).
--
-- Retour arrière du schéma (inutile pour l'application précédente, qui ignore les colonnes ajoutées) : supprimer les
-- contraintes `*_contenu_ck`, `*_objet_ck`, puis les colonnes `objet_cle` et `empreinte` ajoutées ici, une fois tous les
-- contenus revenus en base ; `SET NOT NULL` sur `content` passerait alors par un CHECK validé.

ALTER TABLE step_files ADD COLUMN IF NOT EXISTS objet_cle text;
ALTER TABLE step_files ADD COLUMN IF NOT EXISTS empreinte text;
ALTER TABLE drawing_exports ADD COLUMN IF NOT EXISTS objet_cle text;
ALTER TABLE drawing_exports ADD COLUMN IF NOT EXISTS empreinte text;
ALTER TABLE volumes ADD COLUMN IF NOT EXISTS objet_cle text;
ALTER TABLE com_pieces ADD COLUMN IF NOT EXISTS objet_cle text;

-- bd: nullable (BD-9.1) — `content` devient facultatif pour qu'une ligne déplacée dans le stockage objet n'ait plus de
-- bytea ; DROP NOT NULL modifie seulement le catalogue (verrou bref, aucun parcours). La règle « contenu ou clé » est
-- tenue par les CHECK `*_contenu_ck` ci-dessous.
ALTER TABLE step_files ALTER COLUMN content DROP NOT NULL;
ALTER TABLE drawing_exports ALTER COLUMN content DROP NOT NULL;
ALTER TABLE volumes ALTER COLUMN content DROP NOT NULL;
ALTER TABLE com_pieces ALTER COLUMN content DROP NOT NULL;

-- Contenu ou clé d'objet, jamais aucun des deux.
ALTER TABLE step_files ADD CONSTRAINT step_files_contenu_ck CHECK (content IS NOT NULL OR objet_cle IS NOT NULL) NOT VALID;
ALTER TABLE drawing_exports ADD CONSTRAINT drawing_exports_contenu_ck CHECK (content IS NOT NULL OR objet_cle IS NOT NULL) NOT VALID;
ALTER TABLE volumes ADD CONSTRAINT volumes_contenu_ck CHECK (content IS NOT NULL OR objet_cle IS NOT NULL) NOT VALID;
ALTER TABLE com_pieces ADD CONSTRAINT com_pieces_contenu_ck CHECK (content IS NOT NULL OR objet_cle IS NOT NULL) NOT VALID;

-- Forme de la clé (adressée par le contenu : `<table>/<2 caractères>/<sha256>`) et empreinte présente avec une clé.
ALTER TABLE step_files ADD CONSTRAINT step_files_objet_ck CHECK (
  (objet_cle IS NULL OR (empreinte IS NOT NULL AND objet_cle = 'step_files/' || substr(empreinte, 1, 2) || '/' || empreinte))
  AND (empreinte IS NULL OR empreinte ~ '^[0-9a-f]{64}$')) NOT VALID;
ALTER TABLE drawing_exports ADD CONSTRAINT drawing_exports_objet_ck CHECK (
  (objet_cle IS NULL OR (empreinte IS NOT NULL AND objet_cle = 'drawing_exports/' || substr(empreinte, 1, 2) || '/' || empreinte))
  AND (empreinte IS NULL OR empreinte ~ '^[0-9a-f]{64}$')) NOT VALID;
ALTER TABLE volumes ADD CONSTRAINT volumes_objet_ck CHECK (
  objet_cle IS NULL OR objet_cle = 'volumes/' || substr(id, 1, 2) || '/' || id) NOT VALID;
ALTER TABLE com_pieces ADD CONSTRAINT com_pieces_objet_ck CHECK (
  objet_cle IS NULL OR objet_cle = 'com_pieces/' || substr(empreinte, 1, 2) || '/' || empreinte) NOT VALID;
