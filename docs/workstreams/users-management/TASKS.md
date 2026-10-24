# Gestion des comptes (Users Management) — Tâches

## À faire

- [ ] UM-SERVICE — Mise en service en **préproduction** (preprod.fadimmo.com) selon RUNBOOK §3 bis et §5 à §9 : variables
  SMTP `PREPROD_MAIL_*` / `PREPROD_SMTP_*` et envoi de test, premier administrateur (`create-admin.mjs`), double
  authentification, `PREPROD_FADI_ADMIN_ENABLED=true`, recette (inscription, connexion en deux étapes, invitation, accès
  support, suspension, mot de passe oublié). Gestes de l'administrateur sur le VPS ; rien n'est consigné ni vérifiable
  depuis une session cloud (Issue : #253).
- [ ] UM-DEPLOY — Déploiement en **production** (www.fadimmo.com) : **hors de toute action** (consigne du 2026-10-23 : on n'y touche pas, tout se déploie sur preprod.fadimmo.com) ; seulement sur nouvelle instruction explicite du maître d'ouvrage, selon RUNBOOK.md (Issue : #253, close ; UM-26).

## En cours

- Aucune tâche en cours dans ce dossier ; PR ouverte qui le met à jour elle-même : #274 (UM-29).

## Terminé

- [x] UM-30 — Langue des courriels = langue de l'interface, sinon français (`Accept-Language` n'est plus lu) :
  [PR #275](https://github.com/RachEma-ux/Fadi/pull/275) fusionnée le 2026-10-24 à 18:08 UTC (`5767835`) ; contrôle en
  préproduction rattaché à UM-SERVICE (Issue : #253).
- [x] UM-27 — Corbeille des comptes et « Anonymiser maintenant » (amendement de D-5) : [PR #270](https://github.com/RachEma-ux/Fadi/pull/270)
  fusionnée le 2026-10-24 à 16:09 UTC (`2cc038a`), CI de `main` verte (Issue : #253).
- [x] UM-28 — Courriel en préproduction, domaines réservés jamais envoyés : [PR #271](https://github.com/RachEma-ux/Fadi/pull/271)
  fusionnée le 2026-10-24 à 15:46 UTC (`e03fdfc`) ; variables SMTP sur le VPS : voir UM-SERVICE (Issue : #253).
- [x] UM-P0 — Cadrage : concept.md + anti-dérive, audit, matrice, décisions (Issue : #253).
- [x] UM-P1 — Modèle de données additif, journal d'audit append-only (Issue : #253).
- [x] UM-P2 — Durcissement de l'authentification et purge client (Issue : #253).
- [x] UM-P3 — RBAC plateforme, accès support (Issue : #253).
- [x] UM-P4 — Cycle de vie des comptes et courriel (Issue : #253).
- [x] UM-P5 — Écrans (Issue : #253).
- [x] UM-P6 — Scénario e2e, Mailpit en CI, drapeau, runbook (Issue : #253) — sauf DB-3.
- [x] UM-P6-DB3 — 12 suites historiques (105 tests) vertes sur PostGIS éphémère attesté, run CI 39855284507 (Issue : #253).
- [x] UM-CI — CI de la PR #255 verte sur `570d248` et `1d787c4` (Issue : #253).
- [x] UM-EN — Écrans d'administration et accès support relevés en anglais, passe anglaise dans `comptes-admin.mjs` (Issue : #253).
- [x] UM-SEC — Trois blocages de la revue de `c7dbc92` (UM-18 assurance de session, UM-19 dernier administrateur
  atomique, UM-20 capacité « export ») : reproduits, corrigés, vérifiés en CI sur `873f740` (Issue : #253).
- [x] UM-CODEX — Trois constats de la revue Codex de `fcb0dd1` (UM-21 à UM-23) : corrigés, vérifiés en CI sur `24ed965`
  (Issue : #253).
- [x] UM-1 — Chantier « Organisations, participation et revue externe » ouvert par le maître d'ouvrage le 2026-10-23
  (UM-25) ; suivi dans `docs/workstreams/organisations-participation/` (Issue : #262).
- [x] UM-ACC — Fusion de la PR #255 par le maître d'ouvrage le 2026-10-23 (`516e2f7`), CI de `main` verte (Issue : #253).
- [x] UM-E2E — Recette des accueils : retrait d'interception par `unrouteAll({ behavior: "wait" })` et attente de l'accueil
  de B ; 15/15 en local, CI verte sur `18cd1d0` (80 ✓) (Issue : #253).
- [x] UM-PREPROD — Préproduction compatible D-7 (PR #264), `init-env` lancé, `02329e1` déployé avec succès le 2026-10-23
  à 15:28 UTC (UM-26) (Issue : #253).
- [x] UM-CLOSE — Issue #253 close par le maître d'ouvrage le 2026-10-23 (terminée) (UM-26).
- [x] UM-31 — Invitations : « Renvoyer » (nouveau lien, l'ancien invalidé) et « Copier le lien » sans courriel ; filtre
  serveur « Masquer les comptes de test » (domaines réservés) ; icônes et raccourcis (règle d'or). Vérifié en local et en CI ;
  PR #278 fusionnée le 2026-10-24 (`bf21c4b`, DECISIONS.md UM-31).
- [x] UM-D7 — Amendement D-7 : schémas `auth` / `admin`, rôles au moindre privilège, CI et restauration (Issue : #253).

## Bloqué

- Aucun blocage déclaré.

## Critères de sortie

- Chaque tâche liée à une preuve, une Issue et une PR si elle modifie le dépôt.
- Tests pertinents connus et signalés ; décision d'acceptation consignée.
