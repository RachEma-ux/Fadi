# État des contrôles Studio — exécutés et absents

> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre ; la CI (workflow
> « Continuité de développement ») le recalcule à chaque commit et échoue s’il diffère : il est donc tenu au HEAD testé.
> Registre lu : `docs/workstreams/studio/task-register.json`, SHA-256 `67f954cc41b424da018289340722a8e4efaf9e1dd00c8f73b64b723a03b61f9e`.

**Une CI verte n’est pas une couverture exhaustive** (X.4-03) : elle prouve seulement que les contrôles listés en partie 1
ont réussi aux exécutions citées. Les scénarios de la partie 2 ne sont pas couverts, quel que soit l’état de la CI.

## Répartition des 630 obligations (statut / état des tests)

| Statut / tests | Nombre |
|---|---:|
| Accepté / Non applicable | 2 |
| Accepté / Non exécuté | 57 |
| Bloqué / Non exécuté | 9 |
| En cours / Non exécuté | 19 |
| Implémenté / Non exécuté | 22 |
| Vérifié / Exécuté | 394 |
| Vérifié / Non applicable | 93 |
| À faire / Non exécuté | 34 |

## 1. Contrôles effectivement exécutés

Preuves étiquetées « scénario exécuté » (G2-04) : chacune cite le commit, l’exécution GitHub Actions (ou la trace versionnée),
la date et l’environnement de l’étape qui a réussi.

| Fichier ou trace | Étape de CI qui l’exécute | Libellés exécutés | Obligations | Exécutions citées | Première date citée | Dernière date citée |
|---|---|---:|---:|---:|---|---|
| `.github/workflows/ci.yml` | voir la preuve | 0 | 2 | 1 | 2026-10-25 13:28 | 2026-10-25 13:28 |
| `apps/api/src/lib/studio-dossiers-regles.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/lib/studio-exigences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/api/src/lib/studio-modeles-externes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/lib/studio-observations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/lib/studio-preferences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/lib/studio-publication-statuts.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 4 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/api/src/lib/studio-quantites.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/routes/studio-agents.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 5 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-cmd.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 11 | 7 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-delegations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-derivation-copie.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-illustrations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 9 | 5 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/routes/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 24 | 3 | 2026-10-19 14:33 | 2026-10-25 16:17 |
| `apps/api/src/routes/studio-observations-rapprochement.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-permissions.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 2 | 2026-10-19 14:33 | 2026-10-19 20:40 |
| `apps/api/src/routes/studio-profils-import.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/routes/studio-profils.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 9 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/routes/studio-quotas.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/routes/studio-taches-projets.preuves-bloc02.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 3 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
| `apps/api/src/routes/studio.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/coex-inventaire.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/testing/livrables-lot-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/testing/revue-g1.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
| `apps/api/src/testing/studio-comptes.preuves-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-contrat-commandes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 14 | 12 | 2 | 2026-10-19 12:39 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-ecritures-architecture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/testing/studio-purete-modele.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/testing/studio-releve-ref02.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-tracabilite-ex.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 12 | 4 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/testing/studio-tracabilite.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `apps/api/src/testing/studio-validation-runtime.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/web/e2e/auto-controle.mjs` | Recette de l'auto-contrôle — option du compte, approbation signalée ou refusée, interface… | 5 | 1 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/comptes-securite.mjs` | Recette sécurité des comptes par l'API — session et double authentification, accès suppor… | 1 | 1 | 1 | 2026-10-26 03:09 | 2026-10-26 03:09 |
| `apps/web/e2e/studio-catalogue.mjs` | Recette du catalogue d'outils Studio — catalogue autorisé (droit réel), filtres, regroupe… | 18 | 7 | 3 | 2026-10-19 12:43 | 2026-10-25 22:06 |
| `apps/web/e2e/studio-chargement.mjs` | Recette du chargement des outils Studio — démarrage léger, planche, 3D au premier usage, … | 32 | 18 | 5 | 2026-10-19 12:43 | 2026-10-25 22:06 |
| `apps/web/e2e/studio-cmd.mjs` | Lot CMD — effets, essais, jobs, journal, migrations de schéma, bascule Atelier → Studio (… | 18 | 11 | 1 | 2026-10-26 03:17 | 2026-10-26 03:17 |
| `apps/web/e2e/studio-conflits.mjs` | Recette du contrat de commandes Studio — deux comptes, aperçu annulé, conflit signalé et … | 14 | 16 | 3 | 2026-10-19 12:43 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-corpus-s6.mjs` | Recette du corpus S6 — étude à variantes et révisions créée par l'API, têtes, dossier et … | 2 | 2 | 1 | 2026-10-19 14:40 | 2026-10-19 14:40 |
| `apps/web/e2e/studio-dec.mjs` | Décisions P-12 — copie indépendante, tolérances, alternatives clavier, journal d'accès, r… | 19 | 6 | 1 | 2026-10-26 03:17 | 2026-10-26 03:17 |
| `apps/web/e2e/studio-domaines.mjs` | Recette des domaines Studio — quatre domaines de la référence, planches seulement dans De… | 14 | 10 | 4 | 2026-10-19 14:39 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-dossier.mjs` | Recette de la production documentaire Studio — TEST-001 (dessin 2D publié sans 3D), feuil… | 30 | 16 | 3 | 2026-10-19 12:44 | 2026-10-25 22:08 |
| `apps/web/e2e/studio-echanges.mjs` | Recette de la matrice d'échanges Studio — commande Q, entrées livrées et reportées, couve… | 10 | 6 | 2 | 2026-10-19 14:41 | 2026-10-25 20:26 |
| `apps/web/e2e/studio-espace.mjs` | Recette de l'espace de travail Studio — accueil sans redirection, barre des domaines pers… | 3 | 3 | 1 | 2026-10-19 20:47 | 2026-10-19 20:47 |
| `apps/web/e2e/studio-exact.mjs` | Recette du noyau exact Studio — booléens exacts chargés à la demande, aperçu provisoire, … | 11 | 10 | 2 | 2026-10-25 21:21 | 2026-10-26 04:44 |
| `apps/web/e2e/studio-exigences.mjs` | Recette des exigences Studio — écarts affichés, exigence inchangée (TR-EX-065, apps/web/e… | 6 | 3 | 1 | 2026-10-26 04:38 | 2026-10-26 04:38 |
| `apps/web/e2e/studio-faces.mjs` | Recette de la géométrie 3D Studio — édition des faces, direction d'extrusion, profil sour… | 14 | 11 | 1 | 2026-10-25 19:58 | 2026-10-25 19:58 |
| `apps/web/e2e/studio-hors-ligne.mjs` | Recette Studio hors ligne — brouillon conservé au rechargement, rejeu des enveloppes (mêm… | 9 | 5 | 3 | 2026-10-19 06:50 | 2026-10-26 04:42 |
| `apps/web/e2e/studio-lot-f.mjs` | Lot F — illustrations depuis la vue, agents MCP sous confirmation humaine, extensions (ap… | 14 | 6 | 1 | 2026-10-26 03:17 | 2026-10-26 03:17 |
| `apps/web/e2e/studio-memoire.mjs` | Recette de mémoire Studio — 80 fermetures / réouvertures de la vue 3D, compteurs GPU, éco… | 4 | 4 | 1 | 2026-10-25 16:16 | 2026-10-25 16:16 |
| `apps/web/e2e/studio-navigation.mjs` | Recette de navigation Studio — enveloppe, étude, variantes, historique en lecture seule, … | 103 | 61 | 12 | 2026-10-18 23:02 | 2026-10-26 04:40 |
| `apps/web/e2e/studio-observations.mjs` | Recette des observations Studio — identité réemployée entre domaines, contexte, tâches, d… | 27 | 9 | 4 | 2026-10-19 12:43 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-out.mjs` | Lot OUT — profils d'outils, basculement et échelle 3D, édition de groupe (apps/web/e2e/st… | 14 | 5 | 1 | 2026-10-26 04:41 | 2026-10-26 04:41 |
| `apps/web/e2e/studio-persistance.mjs` | Recette Studio par l'API — étude, commandes, rejeu, conflits, droits, historique, puis ré… | 28 | 15 | 4 | 2026-10-18 21:30 | 2026-10-25 22:03 |
| `apps/web/e2e/studio-preuves-a.mjs` | Preuves Studio, groupe A — mise à jour du service worker pendant que des commandes attend… | 6 | 2 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-b.mjs` | Preuves Studio, groupe B — profils, catalogue et dépendances, service worker, accrochage … | 21 | 5 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-c.mjs` | Preuves Studio, groupe C — approbation et diffusion hors connexion jamais affichées acqui… | 6 | 1 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-d1.mjs` | Preuves Studio, groupe D1 — intégration Fadi / Studio, plein écran, parcours A, B, C, inv… | 72 | 10 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-d2.mjs` | Preuves Studio, groupe D2 — publication diffusée figée par la base, actions hors connexio… | 13 | 2 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-e.mjs` | Preuves Studio, groupe E — étapes intactes, publication figée, corps trop grand (413), ré… | 21 | 6 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-profils.mjs` | Recette des profils et favoris d'outils Studio — API (aller-retour, refus, droits) et éto… | 14 | 9 | 2 | 2026-10-19 06:50 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-pub.mjs` | Lot PUB — observations, manifeste, dossier de conception, vues de coupe, quantités, BCF, … | 6 | 5 | 1 | 2026-10-26 04:39 | 2026-10-26 04:39 |
| `apps/web/e2e/studio-publication.mjs` | Recette des publications Studio — cycle, approbation liée, approbation périmée 409, paque… | 24 | 13 | 4 | 2026-10-19 06:50 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-quantites.mjs` | Recette du métré Studio — ajustements enregistrés et versionnés, rechargement, « à revoir… | 4 | 1 | 1 | 2026-10-19 10:48 | 2026-10-19 10:48 |
| `apps/web/e2e/studio-rend.mjs` | Lot REND — graphismes, repères, provenance des sources, moteurs qualifiés, mesures (apps/… | 21 | 10 | 1 | 2026-10-26 04:40 | 2026-10-26 04:40 |
| `apps/web/e2e/studio-rendu.mjs` | Recette du rendu Studio — dégradation sûre de la vue 3D sous charge, types 3D avancés non… | 6 | 3 | 2 | 2026-10-25 20:25 | 2026-10-25 21:21 |
| `apps/web/e2e/studio-restauration.mjs` | Recette de restauration Studio — archive JSON vers une base neuve, comparaison avant / ap… | 6 | 6 | 3 | 2026-10-19 08:14 | 2026-10-25 13:26 |
| `apps/web/e2e/studio-visualisation.mjs` | Recette de visualisation Studio — rendu et export d'image sans commande ni effet sur le B… | 15 | 3 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/src/lib/inventaire-catalogues-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/lib/local-store-migration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/lib/local-store-quarantaine.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-18 22:20 | 2026-10-18 22:20 |
| `apps/web/src/modules/collaboration/commandes-collaboration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/chargement/cache-hors-ligne.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 11 | 2 | 2 | 2026-10-19 12:39 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/chargement/carte-morceaux.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/cycle-activation.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/chargement/duplication.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/chargement/gestionnaire-ressources.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 5 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/manager-exact.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/chargement/moteurs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 2 | 2026-10-19 12:39 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/chargement/ouverture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/perf.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/service-worker.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 3 | 2 | 2026-10-19 12:39 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/contexte/facade-contexte.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/contrat-commandes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 9 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/domaines/domaines.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/dossier/dossier-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/echanges/echanges-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 2 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 3 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/exact/licence-occt.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/exigences/ecarts-affichage.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/exigences/exigences-ui.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/exigences/exigences-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/frontieres.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/graphismes/graphismes-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/hors-ligne/contrats.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/hors-ligne/file-locale.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/illustration/illustration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 2 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/accrochage/accrochage.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/planche2d/accrochage/parallele.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/planche2d/etats-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/planche2d/historique-borne.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/index-incremental.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/planche2d/index-maintien.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/index-spatial.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 4 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/planche2d/mesure-spatiale-analyse.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 3 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 5 | 2 | 2026-10-19 14:33 | 2026-10-25 16:08 |
| `apps/web/src/modules/studio/planche2d/outils/tolerance-ligne.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/planche2d/profils-raccourcis.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/planche2d/profils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 4 | 2 | 2026-10-19 06:45 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/planche2d/regle-or.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 2 | 2026-10-18 22:56 | 2026-10-18 23:34 |
| `apps/web/src/modules/studio/planche2d/rendus/comparaison-moteurs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 2 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/poc/poc-corpus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/publication/publication-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/routes-studio.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 2 | 2026-10-18 22:56 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 5 | 2 | 2026-10-19 14:33 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/taches/instrumentation.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/taches/journal-correlation.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/taches/ordonnanceur.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 8 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/taches/plantage-integrite.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/taches/pool-studio.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/taches/pool-studio.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 6 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/taches/statuts-if007.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/taches/trace-geste.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/taches/transferts.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/variante/droits.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/variante/droits.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/vue3d/etat-projection.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/vue3d/extrusion.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 2 | 1 | 2026-10-18 23:43 | 2026-10-18 23:43 |
| `apps/web/src/modules/studio/vue3d/groupe-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/vue3d/instanciation.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/vue3d/moteur-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/vue3d/picking.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 2 | 2026-10-19 10:41 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 2 | 2026-10-19 08:07 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/workers/chemins-optimises.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/workers/equivalence.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/workers/hote-worker.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/workers/validation-messages.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/routes/descripteur-studio.preuves-d1.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `docs/ai-team/reports/claude-m13-rep/REP-07-ESSAIS.json` | voir la preuve | 0 | 1 | 0 | 2026-10-18 18:51 | 2026-10-18 18:51 |
| `packages/atelier-model/src/studio/accelerations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 9 | 3 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/agents/agents.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 15 | 10 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/annotations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `packages/atelier-model/src/studio/architecture/architecture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 7 | 2 | 2026-10-19 06:45 | 2026-10-25 13:26 |
| `packages/atelier-model/src/studio/chaine-documentaire.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/cmd/cmd.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 5 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/cmd/migration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/compatibilite-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/composition/basculement.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 10 | 1 | 2026-10-25 19:50 | 2026-10-25 19:50 |
| `packages/atelier-model/src/studio/conclusions-controle.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/copie-independante.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/corpus/corpus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 2 | 2026-10-19 14:33 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/couverture-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/document-2d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 4 | 2 | 2026-10-18 21:27 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/dossier-conception.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/echanges/matrice-echanges.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `packages/atelier-model/src/studio/exigences/exigences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 2 | 2026-10-19 08:07 | 2026-10-19 08:46 |
| `packages/atelier-model/src/studio/f2-booleen.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 3 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/graphismes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/history.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-18 22:56 | 2026-10-18 22:56 |
| `packages/atelier-model/src/studio/identite-bim.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `packages/atelier-model/src/studio/manifeste-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 6 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `packages/atelier-model/src/studio/mesh-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-18 23:43 | 2026-10-18 23:43 |
| `packages/atelier-model/src/studio/objets-3d/objets-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 5 | 2 | 2026-10-19 06:45 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/planche-2d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-18 22:56 | 2026-10-18 22:56 |
| `packages/atelier-model/src/studio/preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/projections.preuves-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/projections.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 12 | 5 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `packages/atelier-model/src/studio/quantites-ajustements.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `packages/atelier-model/src/studio/reperes-echanges.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/reperes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 3 | 3 | 2026-10-19 08:07 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/sources/sources.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 18 | 20 | 3 | 2026-10-19 14:33 | 2026-10-25 16:08 |
| `packages/atelier-model/src/studio/vues-coupe.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/geometry-exact/src/index.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `scripts/check-frontieres.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-19 08:05 | 2026-10-19 08:05 |
| `scripts/migration/migration-lib.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 5 | 2 | 2026-10-19 14:38 | 2026-10-25 21:52 |
| `scripts/migration/recette-simulation.mjs` | voir la preuve | 3 | 4 | 1 | 2026-10-19 14:38 | 2026-10-19 14:38 |
| `scripts/registre/controle-pr.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 7 | 1 | 2026-10-26 04:31 | 2026-10-26 04:31 |
| `scripts/registre/controle-preuves.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 5 | 1 | 2026-10-26 03:05 | 2026-10-26 03:05 |
| `scripts/registre/controles-suivi.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 9 | 1 | 2026-10-26 03:06 | 2026-10-26 03:06 |
| `scripts/securite/analyse-secrets.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 03:05 | 2026-10-26 03:05 |
| `scripts/validation/porte-g4.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 2 | 1 | 2026-10-26 03:06 | 2026-10-26 03:06 |

Total : 202 fichiers ou traces, 1352 libellés exécutés.

## 2. Scénarios absents ou incomplets

### 2.1 Obligations de recette ouvertes (26)

Obligations TEST, NAV, REC, TR et E2E qui ne sont ni « Vérifié » ni « Accepté » : leur scénario n’est pas (entièrement) couvert.

| ID | Statut | Tests | Ce qui manque (suite du registre) |
|---|---|---|---|
| REC-A-02 | À faire | Non exécuté | Rapport AGREGATS-RECETTE.md § REC-A-02 : 17 scénarios cités (TEST-001 à 014, 027, 034, 035) ; 15 Vérifiés avec preuve exécutée au registre ; TEST-011 et TEST-027 prouvés au code par le lot PUB (studio-invariants.test.ts, studio-pub.preuves… |
| REC-B-01 | À faire | Non exécuté | Rapport § REC-B-01 (facettes déclarées : manifeste et chargeurs TEST-016/017, Manager et profils TEST-018/019, cache et hors connexion TEST-020/021/036 — tous Vérifiés avec preuve exécutée ; rapport réseau / mémoire AC-002). Manque réellem… |
| REC-B-02 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| REC-C-02 | À faire | Non exécuté | Rapport § REC-C-02 : TEST-022 à 025 Vérifiés avec preuve exécutée. AC-004 : trace des cas ambigus désormais au dépôt (accrochage.preuves-b.test.ts — suite du registre périmée sur ce point) ; manque : références liées (cotes associatives, l… |
| REC-E-01 | À faire | Non exécuté | Rapport § REC-E-01 : tous les scénarios cités ont une preuve au dépôt ; TEST-027 (lot PUB) et TEST-032 (lot F) sont prouvés au code et branchés en CI mais pas encore reportés au registre. Reste : report de ces preuves puis clôture au regis… |
| REC-E-02 | À faire | Non exécuté | Rapport § REC-E-02 : AC-008 et AC-009 Vérifiés ; AC-007 prouvé au code (lot F : agents.test.ts, studio-lot-f.mjs), à reporter. Manque réellement : AC-010 — refus serveur de l'approbation au concepteur et import de profil sans effet sur les… |
| REC-E-03 | À faire | Non exécuté | Scénario enchaîné vérifié (base simulée simplifiée : pas d'orderBy/limit ; cycle complet sur base réelle dans studio-pub.mjs). La recette d'usage des trois parcours par le maître d'ouvrage est EXTERNE (acte du maître d'ouvrage). |
| REC-I-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Aucune « maquette d'interaction » n'existe ni n'a été validée ; la validation relève d'une recette utilisateur / décision du maître d'ouvrage (R.3-01). Aucun test ne la remplace. |
| TR-AC-001 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-AC-002 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-AC-004 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Depuis F5, l'index réutilisé est éprouvé sur des suites d'insertions et de suppressions contre le parcours linéaire. Fonction absente : aucune trace des cas ambigus (plusieurs cibles à égalité) n'est … |
| TR-AC-005 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-AC-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Refus serveur de l'approbation au concepteur et au rôle d'administration technique (accès support) désormais testés. Fonction absente : « Approuver » n'est pas un outil du catalogue (aucune découverte… |
| TR-AC-011 | En cours | Non exécuté | Préparé (fiches-outils.ts) : forme du build désigné (FORME_BUILD_DESIGNE : commit 40 hex + sha256 de l'artefact), profils de charge que le dépôt sait exécuter (PROFILS_CHARGE_CANDIDATS : profil de vingt outils sur Chromium bureau / télépho… |
| TR-EX-002 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-016 | Implémenté | Non exécuté | Métré, aperçu de la feuille, feuilles composées et publications affichent l'un des cinq états dérivés (pastille EtatContenu, data-studio-etat-contenu / data-etat), à côté de leurs statuts propres ; fonction pure studioEtatDeriveContenu (st… |
| TR-EX-027 | En cours | Non exécuté | Cas négatif vérifié (préexistant). Le cas positif demande une nouvelle capacité d'outil (échelle, studio.arch.ladder) au registre des outils, propriété du lot OUT : non implémentée dans le lot PUB pour ne pas réécrire ses fichiers. |
| TR-EX-046 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-049 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-059 | En cours | Non exécuté | Point (1) fait : booléen exact lourd (union de deux prismes en étoile de 320 sommets, 2,2–3,8 s dans le Worker OCCT) mesuré : trame max ≈ 50–67 ms, 14–20 interactions pendant le calcul, max 80–112 ms (< 200 ms) ; contre-épreuve « bloque » … |
| TR-EX-079 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-097 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-101 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-IF-003 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Aucun calcul booléen dans Studio V1 (déclaré par le test « PERF-07 déclaré non applicable (aucun booléen exact dans Studio V1), jamais simulé », apps/web/src/modules/studio/chargement/perf.t… |
| TR-IF-006 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Négatif désormais complet (actorId forgé refusé 400, portée d'un autre projet 404, même requestId au contenu différent 409, aucune écriture, membres inchangés, lecteur toujours refusé). Positif : fonc… |
| TR-INV-013 | En cours | Non exécuté | Non traité dans ce lot : une annotation référencée à une face 3D elle-même exige un nouveau type de cote sur les faces de solides (géométrie 3D, lot F) ; la preuve reste celle de l'arête source (lot F1). |

### 2.2 Tests prescrits non exécutés (58)

| ID | Fichier | Libellés |
|---|---|---|
| A.2-09 | `scripts/registre/controles-suivi.test.mjs` | A.2-09 [+] / [−] TEST-001 n’est clos qu’à la preuve exécutée de la publication du dessin (E.3-07) ; clos avant, ou sans elle : refusé |
| A.2-09 | `apps/web/e2e/studio-dossier.mjs` | E.3-07 : revue, approbation liée au manifeste, diffusion |
| REC-B-02 | `apps/web/e2e/studio-g4.mjs` | TR-AC-002 / TEST-016 : vingt outils ouverts — requêtes, octets transférés, octets du serveur, morceaux exécutés et tas comparés à la référence, cache froid et chaud : verdict « conforme » (aucun taux de réduction présumé) ; TR-AC-002 : mod… |
| REC-B-02 | `packages/atelier-model/src/studio/mesures/mesures.test.ts` | AC-002 / TEST-016 — verdict contre une référence versionnée, cache froid et chaud |
| X.1-02 | `packages/atelier-model/src/studio/corpus/corpus.test.ts` | X.1-02 S2 : croisements de murs en cours de portée et référence externe déclarée — fond DXF des axes relu, empreinte du fichier recalculée ; un feuillet ne coupe jamais un motif : cotes et ouvertures restent avec leur objet |
| X.1-07 | `apps/web/e2e/studio-corpus-s7.mjs` | écriture concurrente : l'autre appareil enregistre sa ligne pendant la coupure ; écriture concurrente : reconnexion en conflit, la révision de l'autre appareil n'est pas écrasée ; écriture concurrente : corpus de départ toujours intact, pr… |
| X.1-07 | `packages/atelier-model/src/studio/corpus/corpus.test.ts` | fixture de la recette (fixtures/s7-100.json) : document, commandes qui le recréent, attendus après reconnexion |
| X.1-08 | `packages/atelier-model/src/studio/corpus/corpus.test.ts` | X.1-08 fixture des références rendues : scènes S1–S7 posables par l'API (une enveloppe chacune, sous les limites) ; X.1-08 captures de référence versionnées : chaque image (planche 2D et vue 3D, S1–S7) existe avec son empreinte SHA-256 |
| X.1-08 | `apps/web/e2e/studio-corpus-references.mjs` | fixture des références : sept scènes S1–S7, synthétiques ; aucune erreur de page |
| X.3-01 | `scripts/registre/controles-suivi.test.mjs` | X.3-01 [+] les 141 fiches EX / INV / IF / AC reliées à leurs sous-lots (Checklist) et composants, identifiants inchangés ; X.3-01 [−] identifiant changé, sous-lot inconnu ou hors des lots de la fiche, lot sans sous-lot, composant absent : … |
| D.2-04 | `apps/web/src/modules/studio/exact/specification-redemarrage.test.ts` | D.2-04 [+] chaque clause S1 à S6 cite des tests existants avec leur libellé exact ; chaque constante citée a la valeur du code ; D.2-04 [−] une spécification qui dérive du code est refusée : libellé modifié, test retiré d'une clause, const… |
| D.2-04 | `apps/web/src/modules/studio/exact/client-exact.test.ts` | aucune relance silencieuse : la demande suivante est refusée (indisponible) ; relancer crée un nouveau Worker qui calcule ; le Worker s'interrompt pendant deux calculs : les deux attentes sont rejetées (plantage), le Worker est arrêté, le … |
| D.2-04 | `apps/web/e2e/studio-exact.mjs` | TEST-015 : relance contrôlée — nouveau Worker, calcul de nouveau abouti |
| E.5-04 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| E.6-04 | `packages/atelier-model/src/studio/export-3d.test.ts` | E.6-04 OBJ : un objet par élément (identifiant échappé réversible), groupe par calque, volumes relus égaux au modèle, calque masqué écrit ; E.6-04 OBJ : bilan dans l'en-tête — écrits, masqués, cotes, annotations et ouvertures comptés, jama… |
| E.6-04 | `packages/geometry-exact/src/index.test.ts` | E.6-04 STEP : un produit nommé par pièce, unité millimètre déclarée et géométrie × 1 000, relu en mètres à l'identique ; E.6-04 STEP : reproductible (horodatage de la révision), entrées mal formées refusées |
| E.6-04 | `apps/api/src/lib/studio-export-3d.test.ts` | E.6-04 STEP serveur : relu par le noyau, un produit par élément solide nommé par son identifiant, volumes et unités du modèle ; E.6-04 STEP serveur : révision sans solide — aucun fichier (null), l'API répond 422 nothing_to_export |
| E.6-04 | `apps/api/src/routes/studio-export-3d.test.ts` | E.6-04 route : OBJ, STL et STEP servis au lecteur — type model/*, nom de fichier, révision, contenu du modèle ; E.6-04 route : STEP d'une révision sans solide refusé (422 nothing_to_export) ; rapport de fidélité réservé à SVG, DXF et IFC ;… |
| E.6-04 | `packages/atelier-model/src/studio/echanges/matrice-echanges.test.ts` | E.6-04 — OBJ, STL et STEP exportés, chacun son contrat (version, entités portées / partielles / absentes, limite, route, preuves de code, de test et d'interface) ; leurs lectures non livrées, chacune sa raison ; DWG non livré selon D-179 ;… |
| E.6-04 | `apps/web/src/modules/studio/planche2d/regle-or.test.ts` | aucun raccourci ne prend une combinaison réservée par le navigateur (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Maj+N, Ctrl+Maj+T…) |
| E.6-04 | `apps/web/e2e/studio-echanges.mjs` | Exporter OBJ : fichier servi par la barre — objets nommés par leur identifiant, mètres déclarés, aucun matériau ; Exporter STL : fichier servi par la barre — une pièce solid, 24 facettes (dalle et boîte) ; Exporter STEP : fichier servi par… |
| F.2-02 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| J4 | `apps/web/e2e/studio-g1.mjs` | A.4-01 / TR-EX-002 (dessin) : mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m dessinés sur la Planche 2D — brut 3,600, déduction 0,420, net 3,180 m³ ; AC-001 : cote posée sur le mur à la souris — accrochée à ses sommets, valeur mesurée 6,000 m, r… |
| J4 | `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts` | TR-AC-001 — cote associative sur un mur (objet architectural) > [+] la cote se lie aux sommets du contour du mur ; le document relu la garde liée ; TR-AC-001 — cote associative sur un mur (objet architectural) > [+] le mur modifié (épaisse… |
| J4 | `apps/web/e2e/studio-navigation.mjs` | A.4-09 : mur modifié depuis la planche 2D (hauteur 3,2 m) — accepté, une commande en attente, même mur dessiné ; A.4-09 : le même mur modifié ensuite depuis la vue 3D (épaisseur 0,25 m) — accepté, la vue 3D garde ses identifiants ; A.4-03 … |
| J4 | `apps/web/e2e/studio-faces.mjs` | TEST-006 : formulaire du prisme — relation et direction vides (aucun choix d'office) ; TEST-006 : relations affichées dans la désignation — « référence liée · à jour » (36 m³), « copie indépendante · aucune propagation » ; TEST-006 : enreg… |
| J4 | `apps/web/e2e/studio-conflits.mjs` | TEST-012 : mur posé par l'API (6 × 3 × 0,2 m), tête commune aux deux sessions ; TEST-012 : session A modifie la hauteur du mur (3,2 m) et enregistre ; TEST-012 : session B, restée sur l'ancienne tête, modifie l'épaisseur du même mur → 409 … |
| MES-03 | `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts` | MES-03 : transfert (durée et octets), activation, calcul, rendu CPU, invalidation et mémoire résiduelle relevés séparément sur les deux chemins ; rendu GPU jamais rempli |
| MES-03 | `packages/atelier-model/src/studio/mesures/mesures.test.ts` | opération absente ou poste non mesuré (invalidation, mémoire résiduelle) : « incomplet » |
| MES-03 | `apps/web/e2e/studio-g4.mjs` | MES-03 : transfert, activation, calcul, rendu CPU, invalidation et mémoire résiduelle relevés séparément sur les deux chemins ; rendu GPU « non évalué » (rendu logiciel), jamais rempli |
| OPS-05 | `apps/web/e2e/studio-preuves-b.mjs` | B.3-10 : préparation — enveloppe en attente sur l'appareil (requestId, un pas) ; B.3-10 : préparation — script du nouveau build dérivé du service worker servi (seul l'identifiant de build change) ; B.3-10 : nouveau service worker (autre bu… |
| PASS-05 | `apps/web/e2e/studio-g1.mjs` | A.4-01 / TR-EX-002 (dessin) : mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m dessinés sur la Planche 2D — brut 3,600, déduction 0,420, net 3,180 m³ ; AC-001 : cote posée sur le mur à la souris — accrochée à ses sommets, valeur mesurée 6,000 m, r… |
| PASS-05 | `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts` | TR-AC-001 — cote associative sur un mur (objet architectural) > [+] la cote se lie aux sommets du contour du mur ; le document relu la garde liée ; TR-AC-001 — cote associative sur un mur (objet architectural) > [+] le mur modifié (épaisse… |
| PASS-05 | `apps/web/e2e/studio-navigation.mjs` | A.4-09 : mur modifié depuis la planche 2D (hauteur 3,2 m) — accepté, une commande en attente, même mur dessiné ; A.4-09 : le même mur modifié ensuite depuis la vue 3D (épaisseur 0,25 m) — accepté, la vue 3D garde ses identifiants ; A.4-03 … |
| PASS-05 | `apps/web/e2e/studio-faces.mjs` | TEST-006 : formulaire du prisme — relation et direction vides (aucun choix d'office) ; TEST-006 : relations affichées dans la désignation — « référence liée · à jour » (36 m³), « copie indépendante · aucune propagation » ; TEST-006 : enreg… |
| PASS-05 | `apps/web/e2e/studio-conflits.mjs` | TEST-012 : mur posé par l'API (6 × 3 × 0,2 m), tête commune aux deux sessions ; TEST-012 : session A modifie la hauteur du mur (3,2 m) et enregistre ; TEST-012 : session B, restée sur l'ancienne tête, modifie l'épaisseur du même mur → 409 … |
| TR-EX-002 | `apps/web/e2e/studio-g1.mjs` | A.4-01 / TR-EX-002 (dessin) : mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m dessinés sur la Planche 2D — brut 3,600, déduction 0,420, net 3,180 m³ ; TR-EX-002 (BIM) : propriété déclarée sur le mur, « non évaluée » sans valeur saisie ; TR-EX-002… |
| TR-EX-002 | `packages/atelier-model/src/studio/cmd/cmd.test.ts` | TR-EX-002 — périmètre explicitement exclu > EX-002 [−] : demande de comptabilité ou de gestion RH refusée par un motif nommé « hors-perimetre » |
| TR-EX-016 | `packages/atelier-model/src/studio/cmd/cmd.test.ts` | TR-EX-016 — états des contenus dérivés > EX-016 [+] : source R12 → R13 : à recalculer, en calcul, puis à jour R13 ou échec explicite ; TR-EX-016 — états des contenus dérivés > EX-016 [−] : ancienne image R12 présentée « à jour R13 » après … |
| TR-EX-016 | `apps/web/src/modules/studio/taches/etats-contenus.test.ts` | TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications > métré : à jour pour la révision affichée, à recalculer, en calcul, échec, non applicable (aucun objet) ; TR-EX-016 — cinq états dérivés du métré, des feuilles et d… |
| TR-EX-016 | `apps/web/e2e/studio-g1.mjs` | TR-EX-016 : métré « À jour pour la révision R » (révision affichée, état dérivé cohérent) ; TR-EX-016 : feuille composée « À jour pour la révision R » (épinglée sur la tête) ; TR-EX-016 : publication préparée « À jour pour la révision R » … |
| TR-EX-046 | `apps/api/src/lib/studio-journal-acces.test.ts` | TR-EX-046 [+] conservation de 12 mois par défaut, paramétrable par STUDIO_ACCESS_RETENTION_MONTHS (1 à 120), limite en mois civils ; TR-EX-046 [+] purge datée : supprime seulement les événements antérieurs à la limite, puis date la purge (… |
| TR-EX-046 | `apps/api/src/routes/studio-journal-acces.test.ts` | TR-EX-046 [+] base réelle : un refus et un export Studio sont journalisés sans IP ni courriel ; la purge supprime au-delà de 12 mois, garde le reste et se date ; TR-EX-046 [−] base réelle : une ligne du journal d'accès n'est jamais modifié… |
| TR-EX-046 | `apps/web/e2e/studio-dec.mjs` | TR-EX-046 : le refus et l'export sont journalisés, route générique, statut et genre ; TR-EX-046 : minimisation — ni courriel, ni adresse IP, ni identifiant d'étude dans le journal |
| TR-EX-049 | `apps/web/e2e/studio-hors-ligne.mjs` | EX-049 : un tracé commencé hors ligne est noté avec le brouillon conservé (prévisualisation en cours) ; EX-049 : à la reprise, « Prévisualisation abandonnée » est nommée ; le tracé n'a eu aucun effet (brouillon : un seul pas, aucune ligne)… |
| TR-EX-079 | `packages/atelier-model/src/studio/echanges/matrice-echanges.test.ts` | TR-EX-079 : lecture, consultation, édition, export et aller-retour évalués séparément pour chaque format ; chaque entrée rangée sous un format ; TR-EX-079 [−] : un export syntaxiquement valide ne prouve pas un aller-retour — aller-retour d… |
| TR-EX-079 | `apps/api/src/routes/studio-profils-import.test.ts` | EX-079 aller-retour : profil exporté par un compte puis importé par un autre — ordre, raccourcis, favoris et liste personnelle relus à l'identique |
| TR-EX-079 | `apps/web/e2e/studio-echanges.mjs` | TR-EX-079 : capacités par sens affichées — IFC lu, consulté, édité, exporté, aller-retour ; STEP exporté seulement ; DWG rien |
| TR-EX-097 | `packages/atelier-model/src/studio/mesures/mesures.test.ts` | EX-097 — protocole de mesure reproductible ; statistiques : quantile au rang le plus proche, distribution, aberrants de Tukey signalés et conservés ; environnement complet : quatorze champs exigés, rendu logiciel SwiftShader reconnu, GPU «… |
| TR-EX-097 | `apps/web/e2e/studio-g4.mjs` | TR-EX-097 : protocole de mesure complet — matériel, navigateur et version, mémoire, GPU / pilote (moteur WebGL non masqué), écran, caches froid et chaud, réseau, build, commit, répétitions, opérations, aberrants, méthode statistique, trace… |
| TR-EX-101 | `apps/api/src/testing/regressions-pertinentes.test.ts` | EX-101 — tests pertinents d'une modification de Worker ou du registre ; cas positif : modifier un Worker ou le registre exige des tests d'exactitude, d'historique, de permissions, de persistance et de profils ; table contre le dépôt : chaq… |
| TR-AC-001 | `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts` | TR-AC-001 — cote associative sur un mur (objet architectural) > [+] la cote se lie aux sommets du contour du mur ; le document relu la garde liée ; TR-AC-001 — cote associative sur un mur (objet architectural) > [+] le mur modifié (épaisse… |
| TR-AC-001 | `apps/web/e2e/studio-g1.mjs` | A.4-01 / TR-EX-002 (dessin) : mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m dessinés sur la Planche 2D — brut 3,600, déduction 0,420, net 3,180 m³ ; AC-001 : cote posée sur le mur à la souris — accrochée à ses sommets, valeur mesurée 6,000 m, r… |
| TR-AC-002 | `packages/atelier-model/src/studio/mesures/mesures.test.ts` | AC-002 / TEST-016 — verdict contre une référence versionnée, cache froid et chaud ; référence valide : schéma, révision, profil d'environ vingt outils, valeurs mesurées par cache, invariants ; mesure dans les tolérances : verdict « conform… |
| TR-AC-002 | `apps/web/e2e/studio-g4.mjs` | TR-AC-002 : cache chaud réellement chaud — service worker actif et morceaux servis par lui à chaque répétition ; TR-AC-002 : référence versionnée valide (schéma studio-reference-mesures/1, révision, appareil, profil de vingt outils, valeur… |
| TR-AC-005 | `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts` | AC-005 / MES-03 — avant / après optimisation de la vue 3D ; sélection, orbite, zoom, pousser / tirer et matériau : mêmes objets désignés, mêmes distances, mêmes aspects, mêmes triangles ; verdict « fidèle », GPU non évalué ; l'optimisation… |
| TR-AC-005 | `packages/atelier-model/src/studio/mesures/mesures.test.ts` | AC-005 / MES-03 — verdict avant / après optimisation, postes mesurés séparément ; cinq opérations fidèles et tous les postes mesurés : « fidèle », GPU « non évalué » ; cas négatif : géométrie modifiée pour gagner du temps (triangles retiré… |
| TR-AC-005 | `apps/web/e2e/studio-g4.mjs` | TR-AC-005 : sélection, orbite, zoom, pousser / tirer et changement de matériau comparés avant / après optimisation dans Chromium (vrai renderer.render) — mêmes objets désignés, distances, aspects et triangles à chaque répétition : verdict … |

### 2.3 Recettes Studio présentes mais non branchées en CI (0)

Aucune : chaque `apps/web/e2e/studio-*.mjs` est une étape nommée de la CI ou lancée par un script qu’elle exécute.
