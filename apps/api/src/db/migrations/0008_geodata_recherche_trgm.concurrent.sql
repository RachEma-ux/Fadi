-- BD-8.5 (constats B4, F-12) : recherche d'unités par nom à l'intérieur du texte (`lower(o.nom) LIKE '%' || $2 || '%'`)
-- et par code (`lower(o.code) = $2`). Les deux branches du OU sont indexées : le planificateur combine les deux index
-- (BitmapOr) au lieu de parcourir toute la table. L'index (couche_id, lower(nom)) existant ne sert pas à une recherche
-- infixe. Retour arrière : DROP INDEX CONCURRENTLY IF EXISTS des deux index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_objets_nom_trgm_idx ON geodata_objets USING gin (lower(nom) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_objets_code_lower_idx ON geodata_objets (lower(code));
ANALYZE geodata_objets;
