-- BD-9.6 (constat B8, décision D-BD-6, règle D-GD-29 « interface ≠ base de données ») : les catalogues de données du
-- Parcours — bibliothèque des bâtiments, profils et moteur Harmonie, répartition programmatique — vivent en base.
-- Les fichiers qualifiés du dépôt (`apps/api/src/data/`) ne sont plus lus par l'API : ils sont chargés par la chaîne de
-- chargement (`db/catalogues-charger.ts`, lancée par la migration et par `npm run db:catalogues:charger`), qui archive
-- chaque fichier tel quel (octets, taille, empreinte SHA-256) avec son contenu en `jsonb`.
-- Les étapes et les formulaires (parcours-steps.json, parcours-forms.json) restent de la configuration (D-BD-6).
--
-- Modèle : un catalogue (`catalogues`) a des versions (`catalogue_versions`), immuables une fois écrites ; la version
-- servie est celle que désigne `catalogues.version_publiee_id` (même catalogue, garanti par la clé étrangère composée).
-- Droits : `fadi_app` lit seulement ; l'écriture se fait avec le rôle de migration (propriétaire). Aucune donnée ici.
-- Retour arrière : l'ancienne image lisait les fichiers JSON et ignore ces tables (expand pur) ; rien à défaire.

CREATE TABLE IF NOT EXISTS catalogues (
  cle text PRIMARY KEY CONSTRAINT catalogues_cle_ck CHECK (cle ~ '^[a-z][a-z0-9-]{1,62}$'),
  titre text NOT NULL CONSTRAINT catalogues_titre_ck CHECK (char_length(titre) BETWEEN 2 AND 200),
  version_publiee_id bigint,
  cree_le timestamptz NOT NULL DEFAULT now(),
  publie_le timestamptz
);

CREATE TABLE IF NOT EXISTS catalogue_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  catalogue_cle text NOT NULL CONSTRAINT catalogue_versions_catalogue_fk REFERENCES catalogues (cle),
  numero integer NOT NULL CONSTRAINT catalogue_versions_numero_ck CHECK (numero >= 1),
  -- Fichier source archivé tel quel : nom, chemin dans le dépôt, type, taille, empreinte et octets.
  fichier_nom text NOT NULL CONSTRAINT catalogue_versions_fichier_nom_ck CHECK (fichier_nom ~ '^[A-Za-z0-9._-]{1,120}$'),
  source text NOT NULL CONSTRAINT catalogue_versions_source_ck CHECK (char_length(source) BETWEEN 1 AND 400),
  type_media text NOT NULL DEFAULT 'application/json',
  taille bigint NOT NULL CONSTRAINT catalogue_versions_taille_positive_ck CHECK (taille >= 0),
  empreinte text NOT NULL CONSTRAINT catalogue_versions_empreinte_format_ck CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  fichier bytea NOT NULL,
  -- Contenu du fichier, lisible en SQL. L'API sert le fichier archivé (ordre des clés et écriture des nombres conservés).
  contenu jsonb NOT NULL,
  charge_le timestamptz NOT NULL DEFAULT now(),
  charge_par text NOT NULL DEFAULT current_user,
  CONSTRAINT catalogue_versions_taille_ck CHECK (octet_length(fichier) = taille),
  CONSTRAINT catalogue_versions_empreinte_ck CHECK (empreinte = encode(sha256(fichier), 'hex')),
  CONSTRAINT catalogue_versions_numero_uq UNIQUE (catalogue_cle, numero),
  CONSTRAINT catalogue_versions_empreinte_uq UNIQUE (catalogue_cle, empreinte),
  CONSTRAINT catalogue_versions_catalogue_id_uq UNIQUE (catalogue_cle, id)
);

-- La version publiée appartient au catalogue qui la désigne. Index de la clé étrangère : `catalogue_versions_numero_uq`
-- (colonne de tête `catalogue_cle`) ; la référence inverse est déjà la clé primaire de `catalogues`.
ALTER TABLE catalogues ADD CONSTRAINT catalogues_version_publiee_fk
  FOREIGN KEY (cle, version_publiee_id) REFERENCES catalogue_versions (catalogue_cle, id);

-- Versions immuables : ni modification ni suppression, quel que soit le rôle (archive des fichiers livrés).
CREATE OR REPLACE FUNCTION catalogue_versions_no_update() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'catalogue_version_immuable : une version de catalogue ne se modifie ni ne se supprime (version %)', OLD.id;
END;
$$;
CREATE OR REPLACE TRIGGER catalogue_versions_no_update BEFORE UPDATE OR DELETE ON catalogue_versions
  FOR EACH ROW EXECUTE FUNCTION catalogue_versions_no_update();

-- `fadi_app` (API) : lecture seule. Les droits par défaut de `fadi_owner` lui donnent l'écriture sur toute table nouvelle ;
-- elle est retirée ici. Rôles absents (base de développement d'un seul rôle) : rien à faire.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_app') THEN
    REVOKE ALL ON catalogues, catalogue_versions FROM fadi_app;
    REVOKE ALL ON SEQUENCE catalogue_versions_id_seq FROM fadi_app;
    GRANT SELECT ON catalogues, catalogue_versions TO fadi_app;
  END IF;
END $$;
