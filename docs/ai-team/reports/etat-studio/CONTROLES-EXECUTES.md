# État des contrôles Studio — exécutés et absents

> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre ; la CI (workflow
> « Continuité de développement ») le recalcule à chaque commit et échoue s’il diffère : il est donc tenu au HEAD testé.
> Registre lu : `docs/workstreams/studio/task-register.json`, SHA-256 `05e6725cda8085853030e73ef58fdf27a62d121613536152ea66f52fc71b92c7`.

**Une CI verte n’est pas une couverture exhaustive** (X.4-03) : elle prouve seulement que les contrôles listés en partie 1
ont réussi aux exécutions citées. Les scénarios de la partie 2 ne sont pas couverts, quel que soit l’état de la CI.

## Répartition des 630 obligations (statut / état des tests)

| Statut / tests | Nombre |
|---|---:|
| Accepté / Non applicable | 2 |
| Accepté / Non exécuté | 57 |
| Bloqué / Non exécuté | 11 |
| En cours / Non exécuté | 131 |
| En cours / Partiel | 2 |
| Vérifié / Exécuté | 274 |
| Vérifié / Non applicable | 92 |
| À faire / Non exécuté | 61 |

## 1. Contrôles effectivement exécutés

Preuves étiquetées « scénario exécuté » (G2-04) : chacune cite le commit, l’exécution GitHub Actions (ou la trace versionnée),
la date et l’environnement de l’étape qui a réussi.

| Fichier ou trace | Étape de CI qui l’exécute | Libellés exécutés | Obligations | Exécutions citées | Première date citée | Dernière date citée |
|---|---|---:|---:|---:|---|---|
| `.github/workflows/ci.yml` | voir la preuve | 0 | 2 | 1 | 2026-10-25 13:28 | 2026-10-25 13:28 |
| `apps/api/src/lib/studio-dossiers-regles.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/lib/studio-exigences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/api/src/lib/studio-observations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/lib/studio-preferences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/api/src/lib/studio-publication-statuts.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 4 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/api/src/routes/studio-delegations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/routes/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 24 | 3 | 2026-10-19 14:33 | 2026-10-25 16:17 |
| `apps/api/src/routes/studio-observations-rapprochement.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-permissions.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 2 | 2026-10-19 14:33 | 2026-10-19 20:40 |
| `apps/api/src/routes/studio-profils.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/routes/studio-taches-projets.preuves-bloc02.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
| `apps/api/src/routes/studio.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/revue-g1.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
| `apps/api/src/testing/studio-comptes.preuves-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-contrat-commandes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 14 | 12 | 2 | 2026-10-19 12:39 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-ecritures-architecture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/testing/studio-releve-ref02.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-tracabilite-ex.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 12 | 4 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/testing/studio-tracabilite.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `apps/api/src/testing/studio-validation-runtime.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/web/e2e/auto-controle.mjs` | Recette de l'auto-contrôle — option du compte, approbation signalée ou refusée, interface… | 5 | 1 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-catalogue.mjs` | Recette du catalogue d'outils Studio — catalogue autorisé (droit réel), filtres, regroupe… | 18 | 7 | 3 | 2026-10-19 12:43 | 2026-10-25 22:06 |
| `apps/web/e2e/studio-chargement.mjs` | Recette du chargement des outils Studio — démarrage léger, planche, 3D au premier usage, … | 32 | 18 | 5 | 2026-10-19 12:43 | 2026-10-25 22:06 |
| `apps/web/e2e/studio-conflits.mjs` | Recette du contrat de commandes Studio — deux comptes, aperçu annulé, conflit signalé et … | 14 | 16 | 3 | 2026-10-19 12:43 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-corpus-s6.mjs` | Recette du corpus S6 — étude à variantes et révisions créée par l'API, têtes, dossier et … | 2 | 2 | 1 | 2026-10-19 14:40 | 2026-10-19 14:40 |
| `apps/web/e2e/studio-domaines.mjs` | Recette des domaines Studio — quatre domaines de la référence, planches seulement dans De… | 14 | 10 | 4 | 2026-10-19 14:39 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-dossier.mjs` | Recette de la production documentaire Studio — TEST-001 (dessin 2D publié sans 3D), feuil… | 30 | 15 | 3 | 2026-10-19 12:44 | 2026-10-25 22:08 |
| `apps/web/e2e/studio-echanges.mjs` | Recette de la matrice d'échanges Studio — commande Q, entrées livrées et reportées, couve… | 10 | 5 | 2 | 2026-10-19 14:41 | 2026-10-25 20:26 |
| `apps/web/e2e/studio-espace.mjs` | Recette de l'espace de travail Studio — accueil sans redirection, barre des domaines pers… | 3 | 3 | 1 | 2026-10-19 20:47 | 2026-10-19 20:47 |
| `apps/web/e2e/studio-exact.mjs` | Recette du noyau exact Studio — booléens exacts chargés à la demande, aperçu provisoire, … | 7 | 5 | 1 | 2026-10-25 21:21 | 2026-10-25 21:21 |
| `apps/web/e2e/studio-faces.mjs` | Recette de la géométrie 3D Studio — édition des faces, direction d'extrusion, profil sour… | 14 | 10 | 1 | 2026-10-25 19:58 | 2026-10-25 19:58 |
| `apps/web/e2e/studio-hors-ligne.mjs` | Recette Studio hors ligne — brouillon conservé au rechargement, rejeu des enveloppes (mêm… | 8 | 4 | 2 | 2026-10-19 06:50 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-memoire.mjs` | Recette de mémoire Studio — 80 fermetures / réouvertures de la vue 3D, compteurs GPU, éco… | 3 | 1 | 1 | 2026-10-25 16:16 | 2026-10-25 16:16 |
| `apps/web/e2e/studio-navigation.mjs` | Recette de navigation Studio — enveloppe, étude, variantes, historique en lecture seule, … | 100 | 58 | 11 | 2026-10-18 23:02 | 2026-10-25 22:04 |
| `apps/web/e2e/studio-observations.mjs` | Recette des observations Studio — identité réemployée entre domaines, contexte, tâches, d… | 27 | 9 | 4 | 2026-10-19 12:43 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-persistance.mjs` | Recette Studio par l'API — étude, commandes, rejeu, conflits, droits, historique (apps/we… | 24 | 14 | 4 | 2026-10-18 21:30 | 2026-10-25 22:03 |
| `apps/web/e2e/studio-preuves-a.mjs` | Preuves Studio, groupe A — mise à jour du service worker pendant que des commandes attend… | 6 | 1 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-b.mjs` | Preuves Studio, groupe B — profils, catalogue et dépendances, service worker, accrochage … | 21 | 5 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-c.mjs` | Preuves Studio, groupe C — approbation et diffusion hors connexion jamais affichées acqui… | 6 | 1 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-d1.mjs` | Preuves Studio, groupe D1 — intégration Fadi / Studio, plein écran, parcours A, B, C, inv… | 72 | 10 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-d2.mjs` | Preuves Studio, groupe D2 — publication diffusée figée par la base, actions hors connexio… | 13 | 2 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-e.mjs` | Preuves Studio, groupe E — étapes intactes, publication figée, corps trop grand (413), ré… | 21 | 6 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-profils.mjs` | Recette des profils et favoris d'outils Studio — API (aller-retour, refus, droits) et éto… | 14 | 8 | 2 | 2026-10-19 06:50 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-publication.mjs` | Recette des publications Studio — cycle, approbation liée, approbation périmée 409, paque… | 24 | 13 | 4 | 2026-10-19 06:50 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-quantites.mjs` | Recette du métré Studio — ajustements enregistrés et versionnés, rechargement, « à revoir… | 4 | 1 | 1 | 2026-10-19 10:48 | 2026-10-19 10:48 |
| `apps/web/e2e/studio-rendu.mjs` | Recette du rendu Studio — dégradation sûre de la vue 3D sous charge, types 3D avancés non… | 6 | 3 | 2 | 2026-10-25 20:25 | 2026-10-25 21:21 |
| `apps/web/e2e/studio-restauration.mjs` | Recette de restauration Studio — archive JSON vers une base neuve, comparaison avant / ap… | 6 | 5 | 3 | 2026-10-19 08:14 | 2026-10-25 13:26 |
| `apps/web/e2e/studio-visualisation.mjs` | Recette de visualisation Studio — rendu et export d'image sans commande ni effet sur le B… | 15 | 3 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/src/lib/inventaire-catalogues-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-18 22:20 | 2026-10-18 22:20 |
| `apps/web/src/modules/studio/chargement/cache-hors-ligne.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/carte-morceaux.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/gestionnaire-ressources.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 5 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/manager-exact.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/chargement/moteurs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 2 | 2026-10-19 12:39 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/chargement/ouverture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/perf.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/service-worker.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/contrat-commandes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 9 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/domaines/domaines.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/dossier/dossier-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/echanges/echanges-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/exact/licence-occt.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/exigences/ecarts-affichage.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/exigences/exigences-ui.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/exigences/exigences-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/frontieres.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/hors-ligne/contrats.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/hors-ligne/file-locale.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 2 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/accrochage/accrochage.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/planche2d/historique-borne.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/index-incremental.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/planche2d/index-maintien.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/index-spatial.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 4 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 2 | 2026-10-19 14:33 | 2026-10-25 16:08 |
| `apps/web/src/modules/studio/planche2d/profils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 4 | 2 | 2026-10-19 06:45 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/planche2d/regle-or.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 2 | 2026-10-18 22:56 | 2026-10-18 23:34 |
| `apps/web/src/modules/studio/planche2d/rendus/comparaison-moteurs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/publication/publication-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/routes-studio.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 2 | 2026-10-18 22:56 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 5 | 2 | 2026-10-19 14:33 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/taches/instrumentation.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/taches/journal-correlation.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/taches/ordonnanceur.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 8 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/taches/pool-studio.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/taches/pool-studio.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 6 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/taches/transferts.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/variante/droits.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/variante/droits.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/vue3d/extrusion.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 2 | 1 | 2026-10-18 23:43 | 2026-10-18 23:43 |
| `apps/web/src/modules/studio/vue3d/picking.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 2 | 2026-10-19 10:41 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/workers/equivalence.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/workers/hote-worker.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/routes/descripteur-studio.preuves-d1.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `docs/ai-team/reports/claude-m13-rep/REP-07-ESSAIS.json` | voir la preuve | 0 | 1 | 0 | 2026-10-18 18:51 | 2026-10-18 18:51 |
| `packages/atelier-model/src/studio/annotations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `packages/atelier-model/src/studio/architecture/architecture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 7 | 2 | 2026-10-19 06:45 | 2026-10-25 13:26 |
| `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 10 | 1 | 2026-10-25 19:50 | 2026-10-25 19:50 |
| `packages/atelier-model/src/studio/corpus/corpus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `packages/atelier-model/src/studio/couverture-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/document-2d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 4 | 2 | 2026-10-18 21:27 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/dossier-conception.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `packages/atelier-model/src/studio/echanges/matrice-echanges.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
| `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `packages/atelier-model/src/studio/exigences/exigences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 2 | 2026-10-19 08:07 | 2026-10-19 08:46 |
| `packages/atelier-model/src/studio/f2-booleen.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 2 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/history.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-18 22:56 | 2026-10-18 22:56 |
| `packages/atelier-model/src/studio/identite-bim.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `packages/atelier-model/src/studio/manifeste-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 6 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `packages/atelier-model/src/studio/mesh-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-18 23:43 | 2026-10-18 23:43 |
| `packages/atelier-model/src/studio/objets-3d/objets-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 5 | 2 | 2026-10-19 06:45 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/planche-2d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-18 22:56 | 2026-10-18 22:56 |
| `packages/atelier-model/src/studio/preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/projections.preuves-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/projections.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 12 | 5 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `packages/atelier-model/src/studio/quantites-ajustements.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `packages/atelier-model/src/studio/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 2 | 2026-10-19 08:07 | 2026-10-25 13:26 |
| `packages/atelier-model/src/studio/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 17 | 17 | 3 | 2026-10-19 14:33 | 2026-10-25 16:08 |
| `scripts/check-frontieres.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-19 08:05 | 2026-10-19 08:05 |
| `scripts/migration/migration-lib.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 5 | 2 | 2026-10-19 14:38 | 2026-10-25 21:52 |
| `scripts/migration/recette-simulation.mjs` | voir la preuve | 3 | 4 | 1 | 2026-10-19 14:38 | 2026-10-19 14:38 |

Total : 131 fichiers ou traces, 911 libellés exécutés.

## 2. Scénarios absents ou incomplets

### 2.1 Obligations de recette ouvertes (92)

Obligations TEST, NAV, REC, TR et E2E qui ne sont ni « Vérifié » ni « Accepté » : leur scénario n’est pas (entièrement) couvert.

| ID | Statut | Tests | Ce qui manque (suite du registre) |
|---|---|---|---|
| REC-A-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Schémas (studio-document/1), contrat versionné (studio-commands/1), API, éditeurs 2D/3D et journal sont livrés et testés. Le « corpus de migration » n'existe pas : DEC-03 exclut la migration … |
| REC-A-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Obligation d'agrégation : elle suit les fiches TEST-002 à TEST-014, TEST-027, TEST-034/035 (hors liste du groupe A). Le lot F1 a ajouté des preuves pour TEST-002, 005, 006 et 007 (studio-faces, f1-geo… |
| REC-B-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Manifeste, chargeurs, gestionnaire, profils persistants et politique de cache sont contrôlés en CI. Le rapport réseau / mémoire est produit en CI (étape continue-on-error, artefact atelier-capt… |
| REC-B-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : TEST-036 est maintenant couvert (studio-preuves-b, partie 4) et TEST-019 sur document non vide. Restent TEST-016 et AC-002 : relevés à cache froid / chaud sans référence de comparaison ni verdict (mes… |
| REC-C-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Cibles, points (mode, priorité) et géométrie 3D sont comparés avant / après optimisation. Les cotes (measureStudioDimension) et les exports SVG / DXF / IFC sont calculés sur le serveur direct… |
| REC-C-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : TEST-022 à TEST-025 ont leurs tests ; AC-004 a maintenant sa trace des cas ambigus ; AC-005 est couvert pour la fidélité géométrique (poussé / tiré, matériau). Reste l'évaluation des profils GP… |
| REC-D-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : TEST-014, TEST-015, TEST-037 et AC-006 portent sur une tâche exacte / un Worker OCCT : Studio n'en a aucun (OCCT interdit par la carte des morceaux, PERF-07 non applicable). Seul l'analogue d… |
| REC-D-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Absence de corruption désormais vérifiée sur le groupe Studio : le vrai code du Worker, derrière une copie structurée, altère sa copie puis plante ; document, brouillon (tête, lots, enveloppe) inchang… |
| REC-E-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : TEST-032 (illustration IA depuis une vue) reste bloqué : fonction absente (« Illustration IA contrainte » annoncée non disponible). TEST-010, 018, 027, 028 et 035 restent partiels comme au re… |
| REC-E-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : AC-007 impossible : l'illustration est absente (P-06). AC-008 et AC-010 restent partiels (révisions enregistrées non comparées, outil d'approbation absent de la palette, profil personnel modi… |
| REC-E-03 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Le « résultat utile des trois parcours » attend la recette utilisateur du maître d'ouvrage. Le scénario chaîné sur une même étude (contrôle, écart, correction, nouveau contrôle satisfait, app… |
| REC-I-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Aucune « maquette d'interaction » n'existe ni n'a été validée ; la validation relève d'une recette utilisateur / décision du maître d'ouvrage (R.3-01). Aucun test ne la remplace. |
| REC-I-03 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Acte d'acceptation du lot I (restreinte « intégration technique » ou pleine) absent ; décision humaine. Les conditions techniques sont désormais aussi couvertes par studio-preuves-d1.mjs (I.1… |
| TEST-011 | En cours | Partiel | Annuler / rétablir vérifié au modèle avec métrés et identités (studio-invariants « TEST-011 ») ; « aucune perte de publication » et l’affichage restent à recetter. |
| TEST-027 | En cours | Partiel | Écart calculé et exigence inchangée vérifiés au modèle (« TEST-027 ») ; le caractère visible de l’écart reste à recetter en CI. |
| TEST-032 | Bloqué | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : La fonction est absente : aucun mode IA n'est retenu (P-06, F.2-03). Seule l'annonce « Non disponible » est testée, ce qui n'est pas le critère. |
| TEST-033 | Bloqué | Non exécuté | Rapprochement du 25 octobre 2026 (partiel) : Un appel simulé sur le point d'entrée commun vérifie le schéma, les droits et l'idempotence. Il manque : la confirmation (aucune étape de confirmation n'est vérifiée), une commande réellement pr… |
| TR-AC-001 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Ajoutés : annuler / rétablir la modification du mur (identités, hôte, métré, plan, 3D) et dossier publié conservant la version examinée sur le cas du mur. Reste : le négatif « perte de cote » est inte… |
| TR-AC-002 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : La comparaison requêtes / octets / chunks exécutés / mémoire à une référence, cache froid et chaud, n'existe que dans studio-mesures-chargement.mjs (mesure sans verdict, hors CI) ; elle demande… |
| TR-AC-004 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Depuis F5, l'index réutilisé est éprouvé sur des suites d'insertions et de suppressions contre le parcours linéaire. Fonction absente : aucune trace des cas ambigus (plusieurs cibles à égalité) n'est … |
| TR-AC-005 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Orbite, zoom, pousser / tirer et changement de matériau ne sont pas comparés avant / après optimisation (seules la sélection et l'égalité du maillage incrémental le sont) ; la séparation GPU ré… |
| TR-AC-006 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente dans Studio : aucune opération Studio n'exécute OCCT/WASM (le lot F2 « noyau exact » est en cours ailleurs) ; l'échec forcé d'OCCT pendant une opération, la résolution des at… |
| TR-AC-007 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : La génération d'illustration n'existe pas (« illustration-ia » déclarée indisponible, sans bouton : apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts:102) ; seule la provenance du « re… |
| TR-AC-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Refus serveur de l'approbation au concepteur et au rôle d'administration technique (accès support) désormais testés. Fonction absente : « Approuver » n'est pas un outil du catalogue (aucune découverte… |
| TR-AC-011 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le manifeste d'outils (manifeste-outils.ts) vérifie propriétaire, contrat, contexte, droit et chargeur, mais ne porte ni risques, ni mesures, ni jeux d'essai, ni la règle «… |
| TR-EX-002 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Cas négatif couvert pour « aucun module concurrent » ; aucune fonction n'« exclut explicitement » une demande de comptabilité/RH (pas de message ni de refus nommé : fonction absente). Cas positif : au… |
| TR-EX-005 | En cours | Non exécuté | Lot F1 : l'édition de face est livrée et recettée (studio-faces, « TEST-002 / TR-EX-005 »), y compris l'étude neuve sans dessin 2D. L'édition de groupe reste absente. |
| TR-EX-008 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Cas négatif (coordonnée GPU) couvert, et l'ordre commande → accusé serveur → relecture dérivée est observé. Manque : l'ordre complet intention → commande → mutation canonique → scène 3D invalidée n'es… |
| TR-EX-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucun « événement d'effets » d'une commande acceptée ne liste les références/contraintes modifiées ni les domaines dérivés invalidés (readStudioRevisionChanges rend command… |
| TR-EX-013 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Provenance et absence de propagation implicite (dans les deux sens) sont prouvées. Le cas prescrit « nouvelles identités » contredit la conception livrée : la dérivation garde les identifiant… |
| TR-EX-014 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Depuis le lot F3, un modèle externe porte auteur, format, version, unité (déclarée et lue), transformation, horodatage de réception et empreinte SHA-256 ; unité inconnue → « non évaluée », acceptation… |
| TR-EX-016 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucun contenu dérivé n'expose la suite d'états « à jour pour révision R / à recalculer / en calcul / échec / non applicable » (seuls « à jour » / « périmée » des publicatio… |
| TR-EX-019 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucune migration de schéma du document persistant (studio-document/1 seul, MIGRATIONS_BROUILLON vide) : ni transformation documentée, ni aller-retour, ni conservation ou rapport des données i… |
| TR-EX-023 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Le refus des pixels et du repère d'écran est testé ; le système de projet et les transformations versionnées document / local / projet n'existent pas (cas positif impossible à tester). |
| TR-EX-027 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Cas négatif couvert (doublon à libellés distincts rejeté sans écrasement). Cas positif impossible : aucune capacité d'objet d'accès (studio.arch.ladder) n'existe pour vérifier sa distinction avec la t… |
| TR-EX-028 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Permission, contexte, paramètres et révision sont contrôlés à l'exécution ; aucun quota d'invocation (par compte ou par période) n'existe, seulement des bornes de schéma et de document. |
| TR-EX-029 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Recherche par nom, identifiant, contexte (filtre) et barre couverte, sans lancement de moteur. Absents : recherche par synonyme et par domaine (pertinence ne lit que nom, raccourci et identifiant) et … |
| TR-EX-030 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucun statut « déprécié » d'outil ou de module dans le manifeste, ni plan de compatibilité associé : le cas « déprécier un outil puis rouvrir un document qui l'emploie » n'est pas réalisable.… |
| TR-EX-031 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Aucune déclaration d'extension (provenance, signature/confiance, permissions, mises à jour) n'existe dans le code ni dans les tests ; les extensions tierces restent une décision ouverte (le … |
| TR-EX-033 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Cas négatif prescrit impossible : aucun import de profil, aucun outil « Publier » au registre. Retrait d'un bouton et changement de profil sans révision déjà couverts. |
| TR-EX-034 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Le profil n'a ni profileId, ni version, ni raccourcis personnels ; aucun import, donc aucun conflit de raccourcis à détecter (vérifié dans planche2d/profils.ts). |
| TR-EX-036 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Le critère renvoie lui-même aux « spécifications UX » pour les chemins alternatifs aux gestes : aucune spécification n'existe, donc aucun contrôle ne peut échouer sur un geste sans alternativ… |
| TR-EX-040 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Studio n'a aucun outil exact (OCCT interdit par la carte des morceaux) : les cas « outil exact, première puis seconde activation » et « un autre outil ne crée pas un second noyau » ne peuvent… |
| TR-EX-041 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucun détecteur de duplication en octets : la carte des morceaux (chargement.json) ne relève que des familles par fichier, pas les modules par morceau, et les bundles séparés des Workers n'y … |
| TR-EX-042 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Un seul cache par build, et tout le build est précaché à l'installation : ni caches distincts (coquille, profil, modules, données/file), ni téléchargement facultatif à la demande. |
| TR-EX-044 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Le buildId n'est pas enregistré dans la file locale (persistance.ts / contrats.ts : brouillon ↔ commandes ↔ schéma seulement), et rien ne gère le quota (aucune éviction, aucune erreur de quot… |
| TR-EX-045 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucun appel d'essai serveur à portée de révision (supportsDryRun n'est qu'une métadonnée du registre) : les cas « preview R12 puis confirmation » et « résultat R12 reçu après R13 » sont sans … |
| TR-EX-046 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Aucune politique explicite de conservation des événements sensibles (durées, purge) côté serveur : à décider (maître d'ouvrage, DPO). La minimisation côté client existe et est testée (journal… |
| TR-EX-049 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Les états « rejetée » et « prévisualisation abandonnée » n'existent pas à la reprise (hors-ligne/etat.ts : en-ligne, hors-ligne, en-attente, conflit). Une enveloppe refusée hors stale_revisio… |
| TR-EX-051 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : La vue 3D n'affiche ni son sourceRevisionId ni les domaines de données périmées : seuls des attributs data-studio-maillage-revision / revision-courante existent, sans texte visible ni liste d… |
| TR-EX-052 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : La mesure S1/S3 complète tourne derrière STUDIO_MESURE_SPATIALE=1 (hors CI) et son rapport est « sans seuil ni verdict ». Comparer aux cibles demande des cibles décidées (DEC-13) et une mesure … |
| TR-EX-053 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Départage sous permutation de l'index désormais prouvé : 720 ordres d'insertion, égalités de distance réelles. Mutation tuée : tri par rang de l'index retiré. Reste absent : le mode d'accrochage « par… |
| TR-EX-055 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Splines, hachures, symboles et transparences n'existent pas dans le modèle 2D de Studio : impossible de comparer leur rendu. Il n'y a qu'un renderer dans l'application (SVG, DEC-08) ; Canvas … |
| TR-EX-056 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucun repli WebGPU dans Studio, et le rendu à la demande n'est pas qualifié sur corpus (seul le batching l'est). Le blocage d'un remplacement de moteur sans preuve n'est pas un mécanisme : il… |
| TR-EX-059 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Mesurer que le fil principal reste disponible pendant un calcul lourd demande une mesure sur appareil réel (hors CI) ; aucun booléen n'existe dans Studio (cas positif prescrit sans objet). |
| TR-EX-062 | En cours | Non exécuté | Lot F2 : taille transférée et décodée, instance unique, durée de chargement et 50 ouvertures sans croissance sont recettés (studio-exact, « TR-EX-062 : … »). Reste : allocations internes au WASM, que le noyau n'expose pas. |
| TR-EX-063 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : HoteWorker accepte toute « valeur » rattachée à un identifiant connu ; aucune validation applicative de la forme du message reçu d'un Worker interne (message bien formé mai… |
| TR-EX-065 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : L'affichage explicite de l'écart n'est vérifié que par studio-exigences.mjs, hors CI : à brancher en CI (orchestrateur). |
| TR-EX-068 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la valeur « non applicable justifié » n'existe pas dans les conclusions de contrôle ; aucun état « en attente / délai dépassé » d'un contrôle n'existe à tester. |
| TR-EX-071 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonctions absentes : l'auteur n'est pas porté par la provenance du rendu (scenes/provenance.ts) et aucun traitement IA n'existe (fournisseur, sources, autorisation, coûts). |
| TR-EX-072 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Aucune génération IA n'existe dans Studio (TYPES_RENDU : illustration-ia disponible=false) ; ni archivage des paramètres IA ni déclaration des limites de reproductibilité ne sont testés. |
| TR-EX-074 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : un dossier de conception ne se publie pas (contenu de publication limité à « complet » et « dessin-2d ») ; le refus d'une planche présentée comme feuille publiée n'a pas d'… |
| TR-EX-075 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucune vue de coupe enregistrée avec cadrage, styles et annotations propres. |
| TR-EX-076 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucune publication ne réunit un détail 2D autonome et une coupe de modèle ; aucune présentation « synchronisée » à refuser. |
| TR-EX-077 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la quantité ne porte ni identifiant / version de règle de calcul, ni précision interne, ni liste d'exclusions. |
| TR-EX-078 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Défaut corrigé (totaliserQuantites additionnait une valeur d'une autre unité que sa grandeur). Reste : aucune somme de quantités de révisions ou de règles hétérogènes n'existe à signaler (métré d'un s… |
| TR-EX-079 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la matrice d'échanges ne connaît que les sens import / export (StudioSensEchange) ; lecture, consultation, édition et aller-retour ne sont pas évalués séparément. |
| TR-EX-080 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le repère source / cible n'est pas un champ des rapports d'import DXF et d'export (seule la transformation déclarée de l'import IFC est rapportée). |
| TR-EX-084 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : L'observation partage par conception l'identité du commentaire promu (E.2-01) : identités distinctes note / observation non réalisées — lecture du critère à trancher. |
| TR-EX-088 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucun résultat de job côté serveur n'existe pour Studio (tâches exécutées dans le navigateur) ; le volet « job » ne peut pas être prouvé. |
| TR-EX-091 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la simulation ne compare pas avant / après propriétés, cotes, associations et historique ; aucune procédure d'accord ni point de retour arrière. |
| TR-EX-094 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Aucun transfert vers un service externe ni contrôle de politique/consentement avant transmission n'existe dans le code Studio ; rien à tester en l'état. |
| TR-EX-097 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Seule la recette studio-mesures-chargement.mjs (hors CI, non comptée) traite SwiftShader ; aucun contrôle en CI d'une mesure cache froid/chaud sur appareil identifié ni refus d'un résultat S… |
| TR-EX-098 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Comparer un gain de performance (p95) couplé à l'équivalence fonctionnelle demande des mesures sur appareil réel ; aucune règle de rejet automatique d'un gain hors tolérance n'existe. |
| TR-EX-101 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Skip / only / todo refusés dans les suites tracées (registre) ; aucun mécanisme ne relie une modification de Worker / Registry à ses tests pertinents et l'affaiblissement d'une assertion n'est pas dét… |
| TR-IF-001 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le contrat d'étude (POST /projects/:p/studio/studies { name }) ne porte ni site, ni sources, ni version ; « source indisponible » et « conflit de version » n'existent donc … |
| TR-IF-002 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Négatif couvert (Échap sans mutation). Le positif exige de contrôler la valeur engagée « dans la tolérance contractuelle » : aucune tolérance contractuelle n'est déclarée pour le geste Ligne … |
| TR-IF-003 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Aucun calcul booléen dans Studio V1 (déclaré par le test « PERF-07 déclaré non applicable (aucun booléen exact dans Studio V1), jamais simulé », apps/web/src/modules/studio/chargement/perf.t… |
| TR-IF-005 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le cycle d'activation ne connaît pas les états « vérification de contexte/droits », « résolution des dépendances », « suspendu », ni les erreurs « incompatible », « permiss… |
| TR-IF-006 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Négatif désormais complet (actorId forgé refusé 400, portée d'un autre projet 404, même requestId au contenu différent 409, aucune écriture, membres inchangés, lecteur toujours refusé). Positif : fonc… |
| TR-IF-007 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : l'ordonnanceur connaît queued / running / done / failed / cancelled / timed-out / stale, sans loading, cancel_requested ni superseded nommés, et sans révision source tracée… |
| TR-IF-008 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le résultat quantitatif ne porte ni quantityId, ni sourceRevisionSet, ni ruleId / ruleVersion, ni freshnessStatus (aucun de ces champs dans quantites.ts ni bilan-quantites.… |
| TR-IF-009 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le manifeste (studio-publication-statuts.ts) ne porte ni références de règles, ni rapports de contrôle, ni observations bloquantes ; la publication n'est jamais refusée pou… |
| TR-IF-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : une observation (table studio_observations, lib/studio-observations.ts) ne porte ni catégorie, ni gravité, ni pièces justificatives ; BCF n'est pas livré (matrice des échan… |
| TR-IF-011 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucun journal de changement des révisions avec eventId, transaction, horodatage serveur et relation à un job ; aucune garantie testable qu'aucune notification n'est émise a… |
| TR-INV-002 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Le mur est désormais modifié en 2D puis en 3D (TEST-003 : même objectId, hostId gardé, une seule révision), mais la révision affichée n'est pas comparée entre les deux planches : la vue 3D n'expose qu… |
| TR-INV-003 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Le cas positif prescrit (« cloner une variante avec de nouvelles identités ») contredit le modèle actuel : la dérivation de variante (POST /studies/:s/variants { fromVariantId }) garde volont… |
| TR-INV-006 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : La scène 3D ne montre pas l'identifiant de révision serveur (sourceRevisionId) de son résultat : elle porte la révision de session du document (data-studio-maillage-revision / data-studio-revision-cou… |
| TR-INV-007 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucun mécanisme n'évalue une optimisation conjointement en performance (p95) et en résultats métier (cibles, quantités, historique, export) avant/après, ni ne la rejette qu… |
| TR-INV-009 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucun import de profil d'outils (ni route ni interface) et aucun outil « Publier » au catalogue Studio ; le cas négatif prescrit (« importer un profil avec Publier sans dro… |
| TR-INV-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Aucun chemin de requête IA ou d'extension n'existe (agentExposure: none sur tout le registre) : par décision (F.2-03 « aucun mode IA retenu », acceptée par P-06, RECETTE-PILOTE-2026-10-25.md)… |
| TR-INV-013 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Depuis le lot F1, diviser la face latérale d'un prisme lié divise l'arête de sa polyligne source : les cotes de cette arête sont réattachées quand c'est prouvé, sinon « à résoudre », jamais rattachées… |

### 2.2 Tests prescrits non exécutés (0)

Aucun : chaque test ou recette cité par le registre a une exécution réussie retrouvée.

### 2.3 Recettes Studio présentes mais non branchées en CI (0)

Aucune : chaque `apps/web/e2e/studio-*.mjs` est une étape nommée de la CI.
