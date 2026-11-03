-- BD-8.5 (constat B3) : proximité des équipements (`routes/geodata/consultation.ts`, `ST_DWithin(o.geom::geography,
-- t.geom::geography, rayon)`). Sans index sur l'expression géographique, chaque appel parcourait toute la couche cible.
-- Avec cet index, PostGIS ajoute de lui-même le préfiltre `(geom)::geography && _st_expand(cible, rayon)` : boîte
-- calculée sur la sphère, arcs de grand cercle compris, donc résultat identique au calcul sans index. Un préfiltre en
-- degrés sur la géométrie (ST_Expand) a été écarté : les arcs d'une longue arête sortent du rectangle de ses sommets.
-- Retour arrière : DROP INDEX CONCURRENTLY IF EXISTS geodata_objets_geog_idx.
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_objets_geog_idx ON geodata_objets USING gist ((geom::geography));
ANALYZE geodata_objets;
