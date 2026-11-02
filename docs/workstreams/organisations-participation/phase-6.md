# Phase 6 — Recette et préparation : compte rendu

> Issue #262, [PLAN.md](PLAN.md) phase 6 (« scénario final du concept pour le périmètre livré ; runbook de déploiement
> additif ; aucun déploiement sans accord explicite. 🛑 Point d'arrêt final »). Base : `ccr-3b26a9f6-z073dc` à `3d992dc`.
> État : **Implémenté**, vérifié localement (§ 4) ; CI **non relancée** (aucun push) ; **non accepté** — le 🛑 final
> appartient au maître d'ouvrage. Aucun déploiement, aucune préproduction touchée.

## 1. Livré

| Livrable | Fichier |
| --- | --- |
| Recette finale de bout en bout (API réelle + navigateur) | `apps/web/e2e/organisations-participation-final.mjs` ; étape CI en fin de tranche `complements` (`.github/workflows/ci.yml`) |
| Runbook de déploiement additif | [`RUNBOOK-deploiement.md`](RUNBOOK-deploiement.md) |
| Contrôle après déploiement en lecture seule | `scripts/validation/organisations-participation-post-deploiement.mjs` ; étape CI du job `validate` (instantané puis comparaison) |
| Dossier de recette (matrice PLAN § 7, écarts, décisions) | [`recette-finale.md`](recette-finale.md) |
| Correctif de recette | `apps/web/e2e/portees-etroites.mjs` : le partage passe par l'invitation acceptée (OP-D2 a) — la recette attendait encore l'ajout direct (201), supprimé par la phase 3 : 39 échecs sur `3d992dc`, 87 ✓ après correctif |

### 1.1 Recette finale — déroulé (concept, « Development sequence and completion », pour le périmètre livré)

1. **Organisation** : création rejouable (clé de création), trois adhésions par invitation `organization_membership`
   **acceptée** (aperçu `lookup` avant acceptation, lien transféré refusé `wrong_account`), annuaire interne de quatre
   membres, organisation introuvable pour l'externe.
2. **Projet** : organisation enregistrée comme partie puis **partie propriétaire** (`accessChanged: false`), affichée
   dans l'en-tête du projet ; un membre de l'organisation reste en 404 sur le projet.
3. **Équipe** : contact sans compte (aucun accès) ; **aperçu de l'accès résultant** avant envoi (rien n'est écrit, relu
   en base) ; quatre invitations acceptées par l'identité visée (aperçu côté destinataire : projet et rôles proposés) —
   Concepteur ; Lecteur + Coordinateur (responsable du projet) ; Lecteur + **Concepteur de la seule étude S1** (portée
   étroite : modifie S1, 403 sur S2) ; Lecteur avec **échéance d'accès** recopiée puis dépassée (404 à la requête
   suivante, « accès expiré ») ; lien d'une invitation acceptée inopérant pour un autre compte ; vue Équipe et
   responsabilités.
4. **Revue externe** : publication Studio candidate R03 soumise ; paquet figé (empreintes = manifeste) ; note interne et
   fil d'équipe ; aperçu du destinataire (aucun accès au projet, aucune adhésion) ; relecteur externe (compte existant,
   hors organisation) et **approbatrice externe nommée** (nouveau compte par l'invitation) ; lien transféré refusé ;
   **404 sur 13 routes** du projet (projet, étapes, études, fils, publication et ses fichiers, documents, membres,
   participants, journal, archive, revues de l'équipe) ; aucun projet listé ; document figé consulté (empreinte),
   téléchargement non accordé 403.
5. **Boucle de correction** : constat sur le document, l'objet et la révision **R03** ; R04 avance, le paquet sert
   toujours R03 ; réponse de l'équipe ; correction déclarée sur R04 (transition Studio) ; recontrôle refusé sur R03
   (`correction_not_in_package`) ; approbation de R03 refusée (source changée) ; publication actualisée et resoumise ;
   **nouvelle version** v2 (R04, désigne v1, constat d'origine conservé) ; recontrôle sur v2 ; revue satisfaisante sans
   valoir approbation ; relecteur 403 à l'approbation ; **approbation par l'approbatrice nommée** sur le manifeste exact.
6. **Diffusion** : aucune diffusion par la revue ; externes 404, Concepteur sans rôle Diffuseur 403 ; diffusion par
   l'équipe ; dossier diffusé = empreintes et manifeste du paquet approuvé.
7. **Fin de participation** : aperçu des conséquences (accès retiré, rôles listés) ; terminée ; projet, études et
   commandes en 404 **à la requête suivante** ; adhésion à l'organisation intacte ; participation gardée, datée.
8. **Journal par audience** : responsable (Coordinateur) — invitations, participations, contact, partage, constat,
   décision ; non-responsable 403 `responsable-requis` ; externe et participante terminée 404 ; « Mon historique » de
   l'externe : ses actes seuls (constat), ni les actes de l'équipe, ni leurs adresses, ni note interne, jamais d'IP ;
   administrateur (promu par `create-admin.mjs`, double authentification depuis sa session) : toutes les étapes du
   projet et de l'organisation, export déclaré indisponible ; relecture en base : aucune adresse dans les métadonnées.
9. **Navigateur** : espace d'organisation (Membres), Collaboration (participants, organisations du projet, revues
   externes, historique), espace de revue, Mon historique, journal d'administration — axe-core bureau 1440 × 900 et
   téléphone 390 × 844 sans violation critique ni sérieuse, aucun défilement horizontal au téléphone ; historique visible
   du Coordinateur, absent pour le Concepteur ; **passe anglaise** (relevé des textes d'interface sur l'organisation,
   les organisations du projet, les revues externes, l'espace de revue ; « History », « My history », journal
   d'administration traduits) ; aucune erreur JavaScript.

### 1.2 Contrôle après déploiement (lecture seule)

`BEGIN TRANSACTION READ ONLY` + `default_transaction_read_only = on` ; **sonde** : une écriture (`UPDATE … WHERE false`)
doit être refusée par PostgreSQL (25006), sinon arrêt sans contrôle ; ROLLBACK final ; aucun nom ni adresse affiché.
`--instantane` (avant déploiement, compatible avec l'ancien schéma : `projects`, `project_members`) et `--reference`
(après : chaque accès relevé existe encore, ou a été retiré par une décision tracée). Contrôles et critères :
RUNBOOK § 5.1.

## 2. Décisions d'implémentation (au plus prudent)

1. **Données de la recette sans accent ni mot français** (noms, objet du paquet, constats) : la passe anglaise relève
   les textes restés en français sans confondre données et interface. « organisation » et « participants » ne sont pas
   relevés (anglais britannique).
2. **Liens d'invitation** lus dans Mailpit (CI) ou dans le journal de l'API (`API_LOG`, transport console) en attendant
   un lien **pas encore utilisé** (un même compte reçoit une invitation d'adhésion puis de projet ; la file part toutes
   les 5 s).
3. **Échéance d'accès dépassée** simulée en base (`access_expires_at` d'une participation dans le passé), comme les
   recettes des phases 3 et 4 ; sans `DATABASE_URL`, ces contrôles sont déclarés NON EXÉCUTÉS.
4. **Recette en fin de tranche** `complements` : elle crée un administrateur (comme `collaboration-support-telephone`)
   et ne doit pas fausser les recettes qui comptent les administrateurs.
5. **Contrôle de production = script en lecture seule** : les `*-migration-check.mjs` écrivent (transactions annulées)
   et refusent une base non locale ; le runbook les réserve à une copie restaurée.
6. Le script post-déploiement se lance **depuis la copie du dépôt** dans le conteneur `app` (`pg` est dans l'image,
   `scripts/` non) ; rôle `fadi_app` (le mot de passe de `fadi_backup` n'est pas fourni par `docker-compose.yml`), la
   lecture seule étant garantie par la transaction et prouvée par la sonde.
7. Aucun changement de schéma, d'API ni d'interface dans cette phase ; aucune commande nouvelle (règle d'or non
   concernée).

## 3. Écarts au plan et au concept

- Concept, acceptation finale : **« an approver accepts a dossier and a publisher releases its approved versions »** —
  la diffusion de la recette est faite par la propriétaire (le rôle Diffuseur existe et est couvert par
  `participants.mjs` et `portees-etroites.mjs`, pas rejoué ici).
- Périmètre livré seulement : délégation, affectations de travail générales, transfert accepté (C2-06), finalités
  `restricted_resource` / `live_session` ne sont pas déroulés (non livrés).
- Le représentant mandaté invité au projet depuis l'annuaire (autre lot, en parallèle) n'est pas couvert par la recette.
- Tâche de conservation : aucun interrupteur propre (déclaré au runbook § 4.2 et au dossier § 3).

## 4. Preuves (exécutées le 2026-10-25, poste local)

Environnement : PostgreSQL 16 + PostGIS, base jetable `fadi_p6` ; API construite servie sur le port 3091
(`WEB_DIST` par lien symbolique hors de `.claude/`), connectée en `fadi_app`, `FADI_ADMIN_ENABLED=true`,
`MAIL_TRANSPORT=console` + `API_LOG`, Chromium `/opt/pw-browsers/chromium`.

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` ×2 (`fadi_p6`, puis base neuve `fadi_p6v`) | « Schema applied » + « D-7 : mot de passe appliqué pour fadi_app » à chaque fois |
| `users-`, `participations-`, `organisations-`, `revues-migration-check.mjs` (base neuve `fadi_p6v`) | ✅ les quatre |
| `organisations-participation-post-deploiement.mjs` | base neuve : instantané puis `--reference` « conforme » ; `fadi_p6` après la recette finale : « conforme » ; instantané pris puis comparé après les recettes de régression : « chaque accès relevé … existe encore » |
| Détection (base dégradée exprès `fadi_p6neg`, jetable, supprimée) | rôle miroir supprimé + adresse dans le journal → 4 ❌ attendus (pont, perte d'accès, instantané, journal), code de sortie 1 |
| Même script sur `fadi_p6` après toutes les recettes | 2 ❌ attendus : `portees-etroites.mjs` **supprime en SQL** le rôle de portée projet d'un lecteur (état que l'application ne produit jamais) — le script le détecte comme une perte d'accès |
| Requêtes SQL du runbook (§ 5.2, § 6.1) en `BEGIN READ ONLY` | exécutées sans erreur ; 0 partout, droits `f | f | f` |
| `apps/web/e2e/organisations-participation-final.mjs` | **155 ✓, 0 ✗** (« tout est vert »), deux exécutions consécutives |
| Régression (même API) : `revue-externe.mjs` | tout est vert |
| `participants.mjs` / `organisations.mjs` / `journal-activite.mjs` / `invitations-participation.mjs` / `collaboration-audience.mjs` | 92 ✓ / 139 ✓ / 50 ✓ / 107 ✓ / 45 ✓, 0 ✗ |
| `portees-etroites.mjs` | 39 ✗ sur `3d992dc` (ajout direct attendu) → **87 ✓, 0 ✗** après correctif |
| `interface-anglais.mjs` | tout est vert (7 ✓) |
| `npm run typecheck` | vert |
| `npm test` | vert hors suites DB-3 : core-geometry 47, domain-model 104, atelier-model 1057, planche-model 744 (+1 ignoré), sandbox-planche-model 822 (+1 ignoré), geometry-exact 22, web 988 (+1 ignoré) ; API 592 tests hors base réussis, **15 suites DB-3 refusées par la garde** (attendu localement : code de sortie 1 de l'étape API) |
| `node scripts/check-api-tests-db3.mjs` (rapport JSON de l'API) | « ✓ seules les suites de la liste DB-3 sont refusées, et uniquement par la garde » ; `node --test scripts/check-api-tests-db3.test.mjs` 11/11 |
| `npm run build` | vert (relancé en fin de phase) |

### Ce qui n'a pas tourné

- **CI GitHub** : rien n'est poussé ; dernier run constaté sur la lignée : `0d5bb9b` (run 40141370503, vert, DB-3
  actif). Les étapes CI ajoutées (recette finale, contrôle post-déploiement) n'ont pas tourné en CI.
- **Suites DB-3** (`app.test.ts`, `reviews.test.ts`, `organizations.test.ts`, `portees-etroites.test.ts`…) : garde
  fermée hors CI, refusées localement comme attendu.
- **Mailpit** : non disponible localement (transport console) ; la recette lit Mailpit en CI.
- **Préproduction / production** : rien n'est déployé ni exécuté (🛑).

## 5. Limites et suite

- Relancer la CI complète sur le commit final de la branche (les phases 3, 4, portées étroites et 6 n'ont jamais tourné
  en CI) avant toute demande d'acceptation.
- 🛑 final et décisions ouvertes : [recette-finale.md](recette-finale.md) § 4.
