# ADR-BD-01 — Isolation entre projets : contrôle applicatif, sans RLS pour l'instant

Statut : **Accepté**.
Date : 2026-11-02.
Chantier : `base-donnees` (décision D-BD-5, tâche BD-9.5, constat S10 / F10 de `docs/workstreams/base-donnees/audit/01-schema-index.md`).
Issue / PR : à ouvrir avec le chantier.

## Contexte

Aucune table n'active la sécurité par ligne (RLS) et aucune policy n'existe. L'isolation entre projets repose sur l'API :
`loadProjectAccess` et ses variantes (`apps/api/src/lib/owned-project.ts`), la vue `project_effective_access`, les rôles
et portées contrôlés par route, et des clés étrangères composites « même variante ». Le risque relevé par l'audit : une
requête qui oublie le filtre `project_id` ou le contrôle d'accès expose les données de tous les projets.

## Options examinées

- Option A : documenter le contrôle applicatif comme règle d'architecture, avec ses tests ; RLS plus tard si souhaitée.
- Option B : RLS ciblée tout de suite (`studio_revisions`, `project_comments`, `com_messages`) avec
  `set_config('app.user_id', …, true)` par transaction et une policy fondée sur `project_effective_access`.

## Décision et responsable

Option A. Décision du **maître d'ouvrage** du 2 novembre 2026 (session Claude Code, 22 h 24 heure suisse) : « D-BD-1 à
D-BD-10 : exécute tes recommandations » ; recommandation D-BD-5 du plan : « ADR maintenant ; RLS en BD-9 si souhaitée ».

Règles :

1. Toute route qui lit ou modifie une donnée de projet obtient d'abord l'accès par `loadProjectAccess` (ou une fonction
   dérivée qui l'appelle) et filtre ensuite **chaque** requête par l'identifiant de projet ainsi contrôlé.
2. Les tables enfants d'une variante gardent leurs clés étrangères composites (projet, variante) : une référence croisée
   entre projets reste impossible en base.
3. Le rôle `fadi_app` n'a ni `BYPASSRLS` ni super-utilisateur ; une RLS ajoutée plus tard s'appliquera donc sans
   changement de rôle.
4. Une nouvelle route de projet sans contrôle d'accès testé n'est pas fusionnée.

## Justification

L'accès est déjà contrôlé et testé route par route (`portees-acces.test.ts`, `portees-etroites.test.ts`,
`participants.test.ts`) ; la RLS ajouterait une seconde barrière, mais son coût (vue `project_effective_access` évaluée
dans chaque policy, `set_config` par transaction, tests de toutes les routes sous RLS) n'est pas mesuré. Sans mesure
de production (BD-0.2), l'engager maintenant serait prématuré.

## Conséquences et limites

- Le risque d'oubli de filtre reste porté par la revue et les tests ; il n'est pas couvert par la base.
- BD-9.5 reste ouvert sous la forme « RLS ciblée si souhaitée » : à reprendre après mesures, d'abord sur
  `studio_revisions`, `project_comments` et `com_messages`, en préproduction.
- Cette ADR ne change aucun code.

## Vérifications / références

- Audit : `docs/workstreams/base-donnees/audit/01-schema-index.md` (F10), plan `docs/workstreams/base-donnees/PLAN.md` (D-BD-5,
  BD-9.5).
- Absence de `BYPASSRLS` pour `fadi_app` : catalogue de la base jetable de l'audit (`pg_roles`).
