-- BD-3.7 (constats S11, S13).
-- Fonctions de déclencheur : chemin de recherche fixé, pour qu'un nom non qualifié (`projects`, `studio_publications`…)
-- désigne toujours la table du schéma attendu, quel que soit le search_path de la session.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'auth', 'admin') AND p.prorettype = 'trigger'::regtype
       AND p.prokind = 'f' AND p.proconfig IS NULL
       AND pg_has_role(current_user, p.proowner, 'USAGE')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, auth, admin, pg_temp', r.f);
  END LOOP;
END $$;
-- Seule table sans clé primaire : l'index unique construit en 0002 devient la clé primaire (sans reconstruction ; verrou
-- bref), puis la contrainte d'unicité identique, devenue redondante, est retirée. `onConflictDoNothing()` (sans cible)
-- s'appuie désormais sur la clé primaire. Réplication logique et outils de maintenance exigent une clé primaire.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'studio_study_steps'::regclass AND contype = 'p') THEN
    ALTER TABLE studio_study_steps ADD CONSTRAINT studio_study_steps_pkey PRIMARY KEY USING INDEX studio_study_steps_pk_idx;
  END IF;
  ALTER TABLE studio_study_steps DROP CONSTRAINT IF EXISTS studio_study_steps_unique;
END $$;
