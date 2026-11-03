-- BD-8.1 (constat B1) : une seule version commune par source et par empreinte. La chaîne d'import
-- (`db/geodata-reference.ts`) ne recrée jamais une version dont l'empreinte existe déjà pour la source, quel que soit
-- son état (préparation, publiée, retirée : « Version déjà présente ») ; une version retirée n'est jamais republiée
-- (déclencheur `geodata_version_immuable`). L'index rend cette règle sûre face à deux imports concurrents.
-- Versions privées (`espace_id` non nul, imports de l'utilisateur) hors du périmètre : chacune a sa propre source.
-- Échec possible si une base contient déjà des doublons (course B1 survenue) : relevé préalable
--   SELECT source_id, empreinte, count(*) FROM geodata_versions WHERE espace_id IS NULL GROUP BY 1, 2 HAVING count(*) > 1;
-- (l'index laissé invalide est supprimé puis recréé au passage suivant ; retour arrière : DROP INDEX CONCURRENTLY).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS geodata_versions_source_empreinte_uq ON geodata_versions (source_id, empreinte) WHERE espace_id IS NULL;
