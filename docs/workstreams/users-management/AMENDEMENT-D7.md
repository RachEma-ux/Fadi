# Amendement D-7 — Schémas PostgreSQL séparés et rôles au moindre privilège

> **Destinataire : Claude Code.** Cet amendement s'applique au plan `docs/workstreams/users-management/PLAN.md` (« plan UM ») et au plan `docs/workstreams/admin-console/PLAN.md` (« plan console »), **pendant leur exécution**.
> À placer dans `docs/workstreams/users-management/AMENDEMENT-D7.md`.
> Il prime sur les deux plans pour tout ce qui concerne l'emplacement des tables et les droits en base.

---

## 1. Décision D-7 (validée le 2026-10-22)

- **Une seule base PostgreSQL**, découpée en **schémas** :
  - `public` : tables **existantes** (projets, membres, Studio, etc.) — **elles ne bougent pas** ;
  - `auth` : nouvelles tables liées aux comptes ;
  - `admin` : nouvelles tables d'audit, de paramétrage et d'exploitation.
- **Rôles PostgreSQL au moindre privilège** : l'API ne se connecte plus avec un rôle qui a tous les droits.
- Ajouter D-7 dans `docs/workstreams/users-management/DECISIONS.md` et dans l'annexe A des deux plans.

### Répartition des tables

| Table | Schéma |
|---|---|
| `user_sessions`, `account_tokens`, `user_recovery_codes` | `auth` |
| `audit_log`, `mail_outbox`, `app_settings`, `worker_heartbeats` | `admin` |
| `project_support_grants` | `public` (lié aux projets) |
| `users` (table existante) et ses nouvelles colonnes | **reste dans `public`** |
| `projects.organization_id`, `projects.archived_at` | `public` |

> `users` reste dans `public` : la déplacer toucherait toutes les clés étrangères et requêtes existantes, pour un gain faible. Les données sensibles des comptes (sessions, jetons, codes de secours) sont, elles, isolées dans `auth`.

### Rôles

| Rôle | Connexion | Droits |
|---|---|---|
| `fadi_owner` | non (`NOLOGIN`) | propriétaire de tous les schémas et tables |
| `fadi_migrator` | oui (`DATABASE_MIGRATION_URL`) | membre de `fadi_owner` : DDL, utilisé **uniquement** par `npm run db:migrate` |
| `fadi_app` | oui (`DATABASE_URL`) | `USAGE` sur `public`, `auth`, `admin` ; `SELECT, INSERT, UPDATE, DELETE` sur les tables applicatives ; **sur `admin.audit_log` : `SELECT, INSERT` seulement** ; **aucun** DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`) |
| `fadi_retention` | oui (`DATABASE_RETENTION_URL`) | `SELECT` + `UPDATE` limité aux colonnes à anonymiser de `admin.audit_log` (plan console, Phase 6) ; rien d'autre |
| `fadi_backup` | oui (optionnel) | lecture seule sur tout, pour `pg_dump` |

Les mots de passe des rôles ne sont **jamais** dans le dépôt : variables d'environnement du serveur ou secrets GitHub.

---

## 2. Où en est l'exécution ? Choisir le cas

Commence par vérifier l'état réel (`git log`, migrations présentes dans `init.sql`, tables existantes en base de développement) et consigne-le dans `STATUS.md`.

### Cas A — La Phase 1 du plan UM n'a pas encore créé de tables
Appliquer directement : créer les schémas et rôles **en tête** de la Phase 1, puis créer chaque nouvelle table dans son schéma cible.

### Cas B — La Phase 1 a déjà créé des tables dans `public` (branche non fusionnée)
Corriger la migration sur la branche en cours : créer les tables directement dans leur schéma cible. Ne pas laisser de trace dans `public`.

### Cas C — La Phase 1 est déjà fusionnée dans `main`
Nouvelle PR dédiée `feat/um-d7-schemas-roles`, avec une migration **additive et idempotente** qui déplace les tables :
```sql
-- exemple de motif idempotent
DO $$
BEGIN
  IF to_regclass('public.audit_log') IS NOT NULL
     AND to_regclass('admin.audit_log') IS NULL THEN
    ALTER TABLE public.audit_log SET SCHEMA admin;
  END IF;
END $$;
```
`ALTER TABLE … SET SCHEMA` conserve données, index, contraintes, clés étrangères et déclencheurs. Vérifier ensuite que le déclencheur d'immuabilité d'`audit_log` est toujours actif.

### 🛑 Point d'arrêt D7-0
Indique le cas (A, B ou C), la liste des tables concernées et le plan de modification. Attends la validation avant de modifier une migration.

---

## 3. Tâches

### 3.1 Migration (`apps/api/src/db/init.sql`)
1. Créer les rôles **s'ils n'existent pas** (bloc `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = …)`), sans mot de passe dans le SQL : les mots de passe sont définis hors dépôt par l'administrateur du serveur (voir RUNBOOK).
2. `CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION fadi_owner;` idem `admin`.
3. Créer ou déplacer les tables selon le cas A, B ou C.
4. Rendre `fadi_owner` propriétaire des schémas et tables applicatives (`ALTER … OWNER TO fadi_owner`), y compris les tables existantes de `public`.
5. `REVOKE ALL ON SCHEMA public FROM PUBLIC;` puis accorder explicitement les `USAGE` aux rôles prévus.
6. Accorder les droits du tableau des rôles, **table par table** pour `audit_log`, puis `ALTER DEFAULT PRIVILEGES FOR ROLE fadi_owner IN SCHEMA public, auth, admin GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fadi_app;` et l'équivalent pour les séquences (`USAGE, SELECT`).
7. Corriger immédiatement après : `REVOKE UPDATE, DELETE, TRUNCATE ON admin.audit_log FROM fadi_app;`
8. Définir `ALTER ROLE fadi_app SET search_path = public, auth, admin;` (idem `fadi_migrator`).
9. Toute la migration reste idempotente : la jouer deux fois ne doit rien casser.

### 3.2 Drizzle (`apps/api/src/db/schema.ts`)
1. Déclarer `export const authSchema = pgSchema('auth');` et `export const adminSchema = pgSchema('admin');`.
2. Définir les nouvelles tables avec `authSchema.table(…)` / `adminSchema.table(…)` ; les requêtes générées sont alors qualifiées (`"auth"."account_tokens"`), sans dépendre du `search_path`.
3. Vérifier que les clés étrangères entre schémas (`auth.user_sessions.user_id → public.users.id`) sont bien déclarées.

### 3.3 Connexions
1. `apps/api/.env.example` : ajouter `DATABASE_MIGRATION_URL`, `DATABASE_RETENTION_URL` (valeurs factices) ; `DATABASE_URL` désigne désormais `fadi_app`.
2. `npm run db:migrate` utilise `DATABASE_MIGRATION_URL` ; l'API utilise `DATABASE_URL` ; la tâche de rétention utilise `DATABASE_RETENTION_URL`.
3. Au démarrage, l'API vérifie qu'elle **n'a pas** de droits excessifs (`SELECT has_schema_privilege(current_user, 'public', 'CREATE')` doit être faux) ; si oui en production → refus de démarrer ; en développement → avertissement.
4. Adapter la garde de test DB-1/2 et la base jetable de CI (décision D-4) : créer les rôles dans le conteneur, lancer les migrations avec `fadi_migrator`, les tests avec `fadi_app`.
5. Adapter `scripts/verify-restore.sh` et la sauvegarde : inclure les schémas `auth` et `admin` et les rôles (`pg_dumpall --roles-only` sans mots de passe, ou documentation de recréation).

### 3.4 Tests (obligatoires)
- Migration jouée deux fois sans erreur, sur une base vide et sur une base avec données.
- Connecté en `fadi_app` :
  - `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `TRUNCATE` → refusés ;
  - `UPDATE` / `DELETE` sur `admin.audit_log` → refusés ;
  - lecture/écriture normale sur les tables applicatives → autorisées.
- Connecté en `fadi_retention` : seule la mise à jour des colonnes d'anonymisation d'`audit_log` est possible.
- Toute la suite de tests existante passe en se connectant avec `fadi_app` (et non plus avec un super-utilisateur).
- Sauvegarde → restauration → l'application démarre et les droits sont identiques.

### 3.5 Documentation
- `RUNBOOK.md` : création des rôles et de leurs mots de passe sur le serveur, nouvelles variables d'environnement, ordre de mise en production (sauvegarde → création des rôles → migration avec `fadi_migrator` → bascule de `DATABASE_URL` vers `fadi_app` → vérification → retour arrière possible en remettant l'ancienne `DATABASE_URL`).
- `STATUS.md` / `HANDOFF.md` : état de l'amendement.

### Acceptation
- Aucune nouvelle table dans `public` hors celles prévues au tableau.
- L'API tourne avec `fadi_app` sans aucun droit DDL ; tous les tests verts avec ce rôle.
- `audit_log` non modifiable par `fadi_app`, prouvé par test.

### 🛑 Point d'arrêt D7-final
Revue humaine obligatoire avant fusion : ce changement touche toutes les connexions à la base. **Aucune application en production** sans accord explicite.

---

## 4. Effet sur la suite des plans

- **Plan UM, Phase 1 et suivantes** : toute nouvelle table liée aux comptes → `auth` ; toute table d'audit/exploitation → `admin`.
- **Plan console, Phases 5 et 6** : `app_settings`, `worker_heartbeats` → `admin` ; la tâche de rétention utilise `fadi_retention` (remplace la mention « rôle base de données dédié » de la Phase 6).
- Toute future table doit indiquer son schéma dans la PR ; une table créée sans schéma explicite est un défaut de revue.
