# État des contrôles Studio — exécutés et absents

> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre ; la CI (workflow
> « Continuité de développement ») le recalcule à chaque commit et échoue s’il diffère : il est donc tenu au HEAD testé.
> Registre lu : `docs/workstreams/studio/task-register.json`, SHA-256 `3b8661bedca3e62c17f9163a2e1468966a16bfecddf9ccbade8c64d3d265418b`.

**Une CI verte n’est pas une couverture exhaustive** (X.4-03) : elle prouve seulement que les contrôles listés en partie 1
ont réussi aux exécutions citées. Les scénarios de la partie 2 ne sont pas couverts, quel que soit l’état de la CI.

## Répartition des 630 obligations (statut / état des tests)

| Statut / tests | Nombre |
|---|---:|
| Accepté / Non applicable | 2 |
| Accepté / Non exécuté | 57 |
| Bloqué / Non exécuté | 9 |
| En cours / Non exécuté | 71 |
| En cours / Partiel | 2 |
| Implémenté / Non exécuté | 65 |
| Vérifié / Exécuté | 283 |
| Vérifié / Non applicable | 93 |
| À faire / Non exécuté | 48 |

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
| `apps/api/src/routes/studio-taches-projets.preuves-bloc02.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 3 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
| `apps/api/src/routes/studio.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/revue-g1.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
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
| `apps/web/e2e/studio-dossier.mjs` | Recette de la production documentaire Studio — TEST-001 (dessin 2D publié sans 3D), feuil… | 30 | 16 | 3 | 2026-10-19 12:44 | 2026-10-25 22:08 |
| `apps/web/e2e/studio-echanges.mjs` | Recette de la matrice d'échanges Studio — commande Q, entrées livrées et reportées, couve… | 10 | 6 | 2 | 2026-10-19 14:41 | 2026-10-25 20:26 |
| `apps/web/e2e/studio-espace.mjs` | Recette de l'espace de travail Studio — accueil sans redirection, barre des domaines pers… | 3 | 3 | 1 | 2026-10-19 20:47 | 2026-10-19 20:47 |
| `apps/web/e2e/studio-exact.mjs` | Recette du noyau exact Studio — booléens exacts chargés à la demande, aperçu provisoire, … | 7 | 6 | 1 | 2026-10-25 21:21 | 2026-10-25 21:21 |
| `apps/web/e2e/studio-faces.mjs` | Recette de la géométrie 3D Studio — édition des faces, direction d'extrusion, profil sour… | 14 | 11 | 1 | 2026-10-25 19:58 | 2026-10-25 19:58 |
| `apps/web/e2e/studio-hors-ligne.mjs` | Recette Studio hors ligne — brouillon conservé au rechargement, rejeu des enveloppes (mêm… | 8 | 4 | 2 | 2026-10-19 06:50 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-memoire.mjs` | Recette de mémoire Studio — 80 fermetures / réouvertures de la vue 3D, compteurs GPU, éco… | 3 | 2 | 1 | 2026-10-25 16:16 | 2026-10-25 16:16 |
| `apps/web/e2e/studio-navigation.mjs` | Recette de navigation Studio — enveloppe, étude, variantes, historique en lecture seule, … | 100 | 59 | 11 | 2026-10-18 23:02 | 2026-10-25 22:04 |
| `apps/web/e2e/studio-observations.mjs` | Recette des observations Studio — identité réemployée entre domaines, contexte, tâches, d… | 27 | 9 | 4 | 2026-10-19 12:43 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-persistance.mjs` | Recette Studio par l'API — étude, commandes, rejeu, conflits, droits, historique, puis ré… | 24 | 14 | 4 | 2026-10-18 21:30 | 2026-10-25 22:03 |
| `apps/web/e2e/studio-preuves-a.mjs` | Preuves Studio, groupe A — mise à jour du service worker pendant que des commandes attend… | 6 | 2 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-b.mjs` | Preuves Studio, groupe B — profils, catalogue et dépendances, service worker, accrochage … | 21 | 5 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-c.mjs` | Preuves Studio, groupe C — approbation et diffusion hors connexion jamais affichées acqui… | 6 | 1 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-d1.mjs` | Preuves Studio, groupe D1 — intégration Fadi / Studio, plein écran, parcours A, B, C, inv… | 72 | 10 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-d2.mjs` | Preuves Studio, groupe D2 — publication diffusée figée par la base, actions hors connexio… | 13 | 2 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-e.mjs` | Preuves Studio, groupe E — étapes intactes, publication figée, corps trop grand (413), ré… | 21 | 6 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-profils.mjs` | Recette des profils et favoris d'outils Studio — API (aller-retour, refus, droits) et éto… | 14 | 9 | 2 | 2026-10-19 06:50 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-publication.mjs` | Recette des publications Studio — cycle, approbation liée, approbation périmée 409, paque… | 24 | 13 | 4 | 2026-10-19 06:50 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-quantites.mjs` | Recette du métré Studio — ajustements enregistrés et versionnés, rechargement, « à revoir… | 4 | 1 | 1 | 2026-10-19 10:48 | 2026-10-19 10:48 |
| `apps/web/e2e/studio-rendu.mjs` | Recette du rendu Studio — dégradation sûre de la vue 3D sous charge, types 3D avancés non… | 6 | 3 | 2 | 2026-10-25 20:25 | 2026-10-25 21:21 |
| `apps/web/e2e/studio-restauration.mjs` | Recette de restauration Studio — archive JSON vers une base neuve, comparaison avant / ap… | 6 | 6 | 3 | 2026-10-19 08:14 | 2026-10-25 13:26 |
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
| `apps/web/src/modules/studio/echanges/echanges-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 2 | 1 | 2026-10-19 14:33 | 2026-10-19 14:33 |
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
| `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 4 | 2 | 2026-10-19 14:33 | 2026-10-25 16:08 |
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
| `apps/web/src/modules/studio/vue3d/picking.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 2 | 2026-10-19 10:41 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
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
| `packages/atelier-model/src/studio/f2-booleen.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 3 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
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
| `packages/atelier-model/src/studio/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 2 | 2026-10-19 08:07 | 2026-10-25 13:26 |
| `packages/atelier-model/src/studio/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 17 | 17 | 3 | 2026-10-19 14:33 | 2026-10-25 16:08 |
| `scripts/check-frontieres.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-19 08:05 | 2026-10-19 08:05 |
| `scripts/migration/migration-lib.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 5 | 2 | 2026-10-19 14:38 | 2026-10-25 21:52 |
| `scripts/migration/recette-simulation.mjs` | voir la preuve | 3 | 4 | 1 | 2026-10-19 14:38 | 2026-10-19 14:38 |

Total : 131 fichiers ou traces, 910 libellés exécutés.

## 2. Scénarios absents ou incomplets

### 2.1 Obligations de recette ouvertes (91)

Obligations TEST, NAV, REC, TR et E2E qui ne sont ni « Vérifié » ni « Accepté » : leur scénario n’est pas (entièrement) couvert.

| ID | Statut | Tests | Ce qui manque (suite du registre) |
|---|---|---|---|
| REC-A-01 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| REC-A-02 | À faire | Non exécuté | Agrégation des preuves TEST-001 à TEST-014, TEST-027, TEST-034/035 : elle dépend de la requalification de chaque fiche TEST par son lot ; ce lot apporte des preuves utilisables pour EX-010, EX-016, EX-045, EX-051, IF-011 (recette studio-cm… |
| REC-B-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Manifeste, chargeurs, gestionnaire, profils persistants et politique de cache sont contrôlés en CI. Le rapport réseau / mémoire est produit en CI (étape continue-on-error, artefact atelier-capt… |
| REC-B-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : TEST-036 est maintenant couvert (studio-preuves-b, partie 4) et TEST-019 sur document non vide. Restent TEST-016 et AC-002 : relevés à cache froid / chaud sans référence de comparaison ni verdict (mes… |
| REC-C-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Cibles, points (mode, priorité) et géométrie 3D sont comparés avant / après optimisation. Les cotes (measureStudioDimension) et les exports SVG / DXF / IFC sont calculés sur le serveur direct… |
| REC-C-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : TEST-022 à TEST-025 ont leurs tests ; AC-004 a maintenant sa trace des cas ambigus ; AC-005 est couvert pour la fidélité géométrique (poussé / tiré, matériau). Reste l'évaluation des profils GP… |
| REC-D-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : TEST-014, TEST-015, TEST-037 et AC-006 portent sur une tâche exacte / un Worker OCCT : Studio n'en a aucun (OCCT interdit par la carte des morceaux, PERF-07 non applicable). Seul l'analogue d… |
| REC-D-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Absence de corruption désormais vérifiée sur le groupe Studio : le vrai code du Worker, derrière une copie structurée, altère sa copie puis plante ; document, brouillon (tête, lots, enveloppe) inchang… |
| REC-E-01 | À faire | Non exécuté | Volet TEST-032 désormais couvert (fonction livrée). Les autres volets de REC-E-01 (TEST-010, 018, 027, 028, 035, TEST-001…) ne relèvent pas du lot F et restent à l'état du registre. |
| REC-E-02 | À faire | Non exécuté | AC-007 couvert (illustration livrée). AC-008 et AC-010 restent hors du lot F (registre inchangé). |
| REC-E-03 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Le « résultat utile des trois parcours » attend la recette utilisateur du maître d'ouvrage. Le scénario chaîné sur une même étude (contrôle, écart, correction, nouveau contrôle satisfait, app… |
| REC-I-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Aucune « maquette d'interaction » n'existe ni n'a été validée ; la validation relève d'une recette utilisateur / décision du maître d'ouvrage (R.3-01). Aucun test ne la remplace. |
| TEST-011 | En cours | Partiel | Annuler / rétablir vérifié au modèle avec métrés et identités (studio-invariants « TEST-011 ») ; « aucune perte de publication » et l’affichage restent à recetter. |
| TEST-027 | En cours | Partiel | Écart calculé et exigence inchangée vérifiés au modèle (« TEST-027 ») ; le caractère visible de l’écart reste à recetter en CI. |
| TEST-032 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TEST-033 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-AC-001 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Ajoutés : annuler / rétablir la modification du mur (identités, hôte, métré, plan, 3D) et dossier publié conservant la version examinée sur le cas du mur. Reste : le négatif « perte de cote » est inte… |
| TR-AC-002 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : La comparaison requêtes / octets / chunks exécutés / mémoire à une référence, cache froid et chaud, n'existe que dans studio-mesures-chargement.mjs (mesure sans verdict, hors CI) ; elle demande… |
| TR-AC-004 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Depuis F5, l'index réutilisé est éprouvé sur des suites d'insertions et de suppressions contre le parcours linéaire. Fonction absente : aucune trace des cas ambigus (plusieurs cibles à égalité) n'est … |
| TR-AC-005 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Orbite, zoom, pousser / tirer et changement de matériau ne sont pas comparés avant / après optimisation (seules la sélection et l'égalité du maillage incrémental le sont) ; la séparation GPU ré… |
| TR-AC-006 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente dans Studio : aucune opération Studio n'exécute OCCT/WASM (le lot F2 « noyau exact » est en cours ailleurs) ; l'échec forcé d'OCCT pendant une opération, la résolution des at… |
| TR-AC-007 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-AC-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Refus serveur de l'approbation au concepteur et au rôle d'administration technique (accès support) désormais testés. Fonction absente : « Approuver » n'est pas un outil du catalogue (aucune découverte… |
| TR-AC-011 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le manifeste d'outils (manifeste-outils.ts) vérifie propriétaire, contrat, contexte, droit et chargeur, mais ne porte ni risques, ni mesures, ni jeux d'essai, ni la règle «… |
| TR-EX-002 | En cours | Non exécuté | Cas négatif livré (refus nommé 400 hors_perimetre). Reste le cas positif : un parcours unique d'une petite étude du dessin au dossier de conception à travers quatre domaines (recette à composer avec les lots PUB / dossiers). |
| TR-EX-005 | En cours | Non exécuté | Lot F1 : l'édition de face est livrée et recettée (studio-faces, « TEST-002 / TR-EX-005 »), y compris l'étude neuve sans dessin 2D. L'édition de groupe reste absente. |
| TR-EX-008 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-010 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-013 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-014 | En cours | Non exécuté | Non traité dans ce lot (fichiers des modèles externes et de l'import DXF, propres au lot F3 / F) : manquent toujours les restrictions d'utilisation, le repère source déclaré en propre, l'export des métadonnées de provenance et la provenanc… |
| TR-EX-016 | En cours | Non exécuté | Machine d'états pure (a-jour R / a-recalculer / en-calcul / echec / non-applicable) et oracle livrés ; la vue 3D l'affiche. Reste : le métré, les feuilles et les publications gardent leurs propres statuts (à jour / périmée) sans les cinq é… |
| TR-EX-019 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-023 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Le refus des pixels et du repère d'écran est testé ; le système de projet et les transformations versionnées document / local / projet n'existent pas (cas positif impossible à tester). |
| TR-EX-027 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Cas négatif couvert (doublon à libellés distincts rejeté sans écrasement). Cas positif impossible : aucune capacité d'objet d'accès (studio.arch.ladder) n'existe pour vérifier sa distinction avec la t… |
| TR-EX-028 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Permission, contexte, paramètres et révision sont contrôlés à l'exécution ; aucun quota d'invocation (par compte ou par période) n'existe, seulement des bornes de schéma et de document. |
| TR-EX-029 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Recherche par nom, identifiant, contexte (filtre) et barre couverte, sans lancement de moteur. Absents : recherche par synonyme et par domaine (pertinence ne lit que nom, raccourci et identifiant) et … |
| TR-EX-030 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucun statut « déprécié » d'outil ou de module dans le manifeste, ni plan de compatibilité associé : le cas « déprécier un outil puis rouvrir un document qui l'emploie » n'est pas réalisable.… |
| TR-EX-031 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-033 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Cas négatif prescrit impossible : aucun import de profil, aucun outil « Publier » au registre. Retrait d'un bouton et changement de profil sans révision déjà couverts. |
| TR-EX-034 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Le profil n'a ni profileId, ni version, ni raccourcis personnels ; aucun import, donc aucun conflit de raccourcis à détecter (vérifié dans planche2d/profils.ts). |
| TR-EX-036 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-040 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Studio n'a aucun outil exact (OCCT interdit par la carte des morceaux) : les cas « outil exact, première puis seconde activation » et « un autre outil ne crée pas un second noyau » ne peuvent… |
| TR-EX-041 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucun détecteur de duplication en octets : la carte des morceaux (chargement.json) ne relève que des familles par fichier, pas les modules par morceau, et les bundles séparés des Workers n'y … |
| TR-EX-042 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Un seul cache par build, et tout le build est précaché à l'installation : ni caches distincts (coquille, profil, modules, données/file), ni téléchargement facultatif à la demande. |
| TR-EX-044 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Le buildId n'est pas enregistré dans la file locale (persistance.ts / contrats.ts : brouillon ↔ commandes ↔ schéma seulement), et rien ne gère le quota (aucune éviction, aucune erreur de quot… |
| TR-EX-045 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-046 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-049 | En cours | Non exécuté | États « Rejetée » et « Prévisualisation abandonnée » livrés (bandeau, persistance du brouillon : rejet avec ses requestId, aperçu en cours, contrat des enveloppes ; reprise par useChargementVariante). Manque une recette navigateur de repri… |
| TR-EX-051 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-052 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : La mesure S1/S3 complète tourne derrière STUDIO_MESURE_SPATIALE=1 (hors CI) et son rapport est « sans seuil ni verdict ». Comparer aux cibles demande des cibles décidées (DEC-13) et une mesure … |
| TR-EX-053 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Départage sous permutation de l'index désormais prouvé : 720 ordres d'insertion, égalités de distance réelles. Mutation tuée : tri par rang de l'index retiré. Reste absent : le mode d'accrochage « par… |
| TR-EX-055 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Splines, hachures, symboles et transparences n'existent pas dans le modèle 2D de Studio : impossible de comparer leur rendu. Il n'y a qu'un renderer dans l'application (SVG, DEC-08) ; Canvas … |
| TR-EX-056 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Aucun repli WebGPU dans Studio, et le rendu à la demande n'est pas qualifié sur corpus (seul le batching l'est). Le blocage d'un remplacement de moteur sans preuve n'est pas un mécanisme : il… |
| TR-EX-059 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Mesurer que le fil principal reste disponible pendant un calcul lourd demande une mesure sur appareil réel (hors CI) ; aucun booléen n'existe dans Studio (cas positif prescrit sans objet). |
| TR-EX-062 | En cours | Non exécuté | Lot F2 : taille transférée et décodée, instance unique, durée de chargement et 50 ouvertures sans croissance sont recettés (studio-exact, « TR-EX-062 : … »). Reste : allocations internes au WASM, que le noyau n'expose pas. |
| TR-EX-063 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : HoteWorker accepte toute « valeur » rattachée à un identifiant connu ; aucune validation applicative de la forme du message reçu d'un Worker interne (message bien formé mai… |
| TR-EX-065 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : L'affichage explicite de l'écart n'est vérifié que par studio-exigences.mjs, hors CI : à brancher en CI (orchestrateur). |
| TR-EX-068 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la valeur « non applicable justifié » n'existe pas dans les conclusions de contrôle ; aucun état « en attente / délai dépassé » d'un contrôle n'existe à tester. |
| TR-EX-071 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-072 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-074 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : un dossier de conception ne se publie pas (contenu de publication limité à « complet » et « dessin-2d ») ; le refus d'une planche présentée comme feuille publiée n'a pas d'… |
| TR-EX-075 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucune vue de coupe enregistrée avec cadrage, styles et annotations propres. |
| TR-EX-076 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucune publication ne réunit un détail 2D autonome et une coupe de modèle ; aucune présentation « synchronisée » à refuser. |
| TR-EX-077 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la quantité ne porte ni identifiant / version de règle de calcul, ni précision interne, ni liste d'exclusions. |
| TR-EX-078 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Défaut corrigé (totaliserQuantites additionnait une valeur d'une autre unité que sa grandeur). Reste : aucune somme de quantités de révisions ou de règles hétérogènes n'existe à signaler (métré d'un s… |
| TR-EX-079 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la matrice d'échanges ne connaît que les sens import / export (StudioSensEchange) ; lecture, consultation, édition et aller-retour ne sont pas évalués séparément. |
| TR-EX-080 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le repère source / cible n'est pas un champ des rapports d'import DXF et d'export (seule la transformation déclarée de l'import IFC est rapportée). |
| TR-EX-084 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : L'observation partage par conception l'identité du commentaire promu (E.2-01) : identités distinctes note / observation non réalisées — lecture du critère à trancher. |
| TR-EX-088 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-091 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-094 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-097 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Seule la recette studio-mesures-chargement.mjs (hors CI, non comptée) traite SwiftShader ; aucun contrôle en CI d'une mesure cache froid/chaud sur appareil identifié ni refus d'un résultat S… |
| TR-EX-098 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Comparer un gain de performance (p95) couplé à l'équivalence fonctionnelle demande des mesures sur appareil réel ; aucune règle de rejet automatique d'un gain hors tolérance n'existe. |
| TR-EX-101 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Skip / only / todo refusés dans les suites tracées (registre) ; aucun mécanisme ne relie une modification de Worker / Registry à ses tests pertinents et l'affaiblissement d'une assertion n'est pas dét… |
| TR-IF-001 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-IF-002 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-IF-003 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Aucun calcul booléen dans Studio V1 (déclaré par le test « PERF-07 déclaré non applicable (aucun booléen exact dans Studio V1), jamais simulé », apps/web/src/modules/studio/chargement/perf.t… |
| TR-IF-005 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le cycle d'activation ne connaît pas les états « vérification de contexte/droits », « résolution des dépendances », « suspendu », ni les erreurs « incompatible », « permiss… |
| TR-IF-006 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Négatif désormais complet (actorId forgé refusé 400, portée d'un autre projet 404, même requestId au contenu différent 409, aucune écriture, membres inchangés, lecteur toujours refusé). Positif : fonc… |
| TR-IF-007 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : l'ordonnanceur connaît queued / running / done / failed / cancelled / timed-out / stale, sans loading, cancel_requested ni superseded nommés, et sans révision source tracée… |
| TR-IF-008 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le résultat quantitatif ne porte ni quantityId, ni sourceRevisionSet, ni ruleId / ruleVersion, ni freshnessStatus (aucun de ces champs dans quantites.ts ni bilan-quantites.… |
| TR-IF-009 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : le manifeste (studio-publication-statuts.ts) ne porte ni références de règles, ni rapports de contrôle, ni observations bloquantes ; la publication n'est jamais refusée pou… |
| TR-IF-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : une observation (table studio_observations, lib/studio-observations.ts) ne porte ni catégorie, ni gravité, ni pièces justificatives ; BCF n'est pas livré (matrice des échan… |
| TR-IF-011 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-002 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-003 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-006 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-007 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-009 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : aucun import de profil d'outils (ni route ni interface) et aucun outil « Publier » au catalogue Studio ; le cas négatif prescrit (« importer un profil avec Publier sans dro… |
| TR-INV-010 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-013 | En cours | Non exécuté | Non traité dans ce lot : une annotation référencée à une face 3D elle-même exige un nouveau type de cote sur les faces de solides (géométrie 3D, lot F) ; la preuve reste celle de l'arête source (lot F1). |

### 2.2 Tests prescrits non exécutés (113)

| ID | Fichier | Libellés |
|---|---|---|
| CAD-07 | `apps/api/src/testing/coex-inventaire.test.ts` | CAD-07 [+] COEX-01 compte exactement 22 composants C01 à C22, aucun qualifié « Retirer » ni « Remplacer » ; CAD-07 [+] chaque chemin contrôlé est bien celui que nomme la ligne de son composant ; CAD-07 [+] dépôt réel : les 22 composants de… |
| ARC-03 | `apps/web/src/modules/studio/contexte/facade-contexte.test.ts` | ARC-03 [+] la façade résout le projet tel que le serveur le décrit : rôle, lecture seule, réservation d'édition ; ARC-03 [−] un refus (401, 403, 404) ne divulgue rien et prime sur un projet encore en cache ; une panne reste « indisponible … |
| ARC-05 | `apps/api/src/testing/studio-purete-modele.test.ts` | ARC-05 [+] dépôt réel : aucune source de src/studio n'importe React, le DOM, three ou une application, ni n'emploie un global du navigateur ; ARC-05 [+] le tsconfig du paquet ne déclare pas la bibliothèque DOM et le paquet expose le modèle… |
| ARC-08 | `scripts/registre/controles-suivi.test.mjs` | ARC-08 — Studio/ reste documentaire : aucun code produit ne charge ni n’importe un fichier de Studio/ ; dépôt réel — SUIVI-01, ARC-08, SUIVI-02, SUIVI-08, X.3-02 et SUIVI-09 conformes ; 141 chaînes complètes |
| G2-03 | `apps/web/src/modules/studio/poc/poc-corpus.test.ts` | G2-03 [+] chaque POC autorisé, sur chaque corpus pertinent, est conforme à son oracle ou à sa référence conservée ; G2-03 [+] résultats reproductibles : deuxième exécution, même empreinte des résultats déterministes ; G2-03 [−] une référen… |
| G2-04 | `scripts/registre/controle-preuves.test.mjs` | G2-04 — chaque preuve porte une étiquette lecture statique / test prescrit / scénario exécuté, cohérente avec ce qu’elle cite |
| A.1-07 | `apps/web/e2e/studio-persistance.mjs` | réouverture : variante relue après redémarrage ; réouverture : même tête de révision ; réouverture : document identique (empreinte) ; réouverture : historique identique, plus récente d'abord |
| REC-A-01 | `packages/atelier-model/src/studio/cmd/migration.test.ts` | REC-A-01 : tout le corpus studio-document/1 du dépôt migré vers /2, aller-retour exact, données inconnues conservées et rapportées |
| REC-A-01 | `apps/api/src/testing/livrables-lot-a.test.ts` | REC-A-01 : chaque preuve citée par le livrable est un libellé présent mot pour mot dans son fichier ; REC-A-01 : docs/studio/LIVRABLES-LOT-A.md est celui que ce test calcule (schémas, contrats, API, éditeurs, journal, corpus de migration) |
| X.1-03 | `packages/atelier-model/src/studio/corpus/corpus.test.ts` | licence du corpus établie : celle du dépôt (aucune licence ouverte déclarée, droits réservés), corpus généré sans source tierce |
| X.1-03 | `apps/web/src/modules/studio/poc/poc-corpus.test.ts` | G2-03 [+] chaque POC autorisé, sur chaque corpus pertinent, est conforme à son oracle ou à sa référence conservée |
| X.2-02 | `apps/api/src/routes/studio-permissions.test.ts` | X.2-02 — matrice rôle × route Studio × attendu (routeur réel, base simulée) > chaque cellule rend l'attendu ; aucun refus n'écrit quoi que ce soit ; X.2-02 — matrice rôle × route Studio × attendu (routeur réel, base simulée) > la matrice p… |
| X.2-02 | `apps/web/e2e/studio-dec.mjs` | X.2-02 [+] sans verrou : invitation de l'éditeur envoyée et acceptée ; X.2-02 [−] invitation refusée sous le verrou d'un autre compte (423 locked) ; X.2-02 [−] acceptation d'exigence refusée sous le verrou d'un autre compte (423) ; X.2-02 … |
| X.2-02 | `apps/web/e2e/comptes-securite.mjs` | X.2-02 : invitation refusée sur le projet de référence (403 reference-protegee) |
| X.2-04 | `scripts/validation/porte-g4.test.mjs` | X.2-04 [+] tous les défauts éliminatoires vérifiés avec une preuve qui tient : livraison admise ; X.2-04 [−] un gain de performance ne neutralise jamais un défaut : les mesures sont rapportées, non prises en compte |
| X.3-02 | `scripts/registre/controles-suivi.test.mjs` | X.3-02 / SUIVI-07 — chaînes obligation → lot → composants → TEST/NAV → DEC → décision versionnée, contrôlées ; dépôt réel — SUIVI-01, ARC-08, SUIVI-02, SUIVI-08, X.3-02 et SUIVI-09 conformes ; 141 chaînes complètes |
| X.3-03 | `scripts/registre/controles-suivi.test.mjs` | X.4-03 / X.3-03 — documents d’état : exécutés séparés des absents, preuve et contre-preuve par fiche, « à produire » sinon |
| X.4-03 | `scripts/registre/controles-suivi.test.mjs` | X.4-03 / X.3-03 — documents d’état : exécutés séparés des absents, preuve et contre-preuve par fiche, « à produire » sinon |
| X.5-01 | `scripts/registre/controles-suivi.test.mjs` | X.4-03 / X.3-03 — documents d’état : exécutés séparés des absents, preuve et contre-preuve par fiche, « à produire » sinon |
| X.5-02 | `scripts/registre/controle-preuves.test.mjs` | X.5-02 — un « Vérifié » avec un scénario exécuté complet ou une lecture justifiée complète est conforme ; X.5-02 — « Vérifié » refusé sans preuve conforme : pointeur de source seul, préparation de groupe, commit, date ou environnement abse… |
| E.5-04 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| F.2-01 | `packages/atelier-model/src/studio/agents/agents.test.ts` | F.2-01 [+] déclarations complètes ; F.2-04 [+] chaque fichier du corpus existe dans le dépôt ; F.2-01 [−] une rubrique vide rend la capacité incomplète |
| F.2-02 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| F.2-03 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| F.2-03 | `packages/atelier-model/src/studio/agents/agents.test.ts` | F.2-03 [+] le fournisseur local n'est pas une IA : nom « sans IA », aucun réseau ; même entrée → mêmes pixels, la source n'est pas touchée ; F.2-03 [−] paramètres hors contrat ou image incohérente : refusés |
| F.2-03 | `apps/web/src/modules/studio/illustration/illustration.test.ts` | F.2-03 [+] fournisseur local : image en base64, paramètres au centième, ni classification ni consentement envoyés ; F.2-03 [+] F.3-02 [+] deux commandes de l'éditeur, icône propre, barre et raccourci uniques non réservés ; F.2-03 [+] la bo… |
| F.2-03 | `apps/web/e2e/studio-lot-f.mjs` | F.2-03 : « Illustration contrainte depuis la vue » disponible, avec son déclencheur ; raccourci Ctrl+Maj+F4 : la boîte d'illustration s'ouvre sur un nouveau rendu capturé |
| F.2-04 | `packages/atelier-model/src/studio/agents/agents.test.ts` | F.2-01 [+] déclarations complètes ; F.2-04 [+] chaque fichier du corpus existe dans le dépôt |
| F.3-01 | `apps/api/src/routes/studio-agents.test.ts` | F.3-01 [+] déclaration de l'adaptateur (provenance intégrée, permissions, mises à jour) autorisée par défaut ; tools/list expose ses outils ; F.3-01 [−] adaptateur désactivé par l'administrateur : plus aucun outil n'agit ; déclaration avec… |
| F.3-02 | `apps/api/src/routes/studio-agents.test.ts` | TEST-033 [+] F.3-02 [+] l'agent propose, rien n'est écrit ; la personne confirme dans Studio ; la révision est celle que la route humaine écrit pour la même enveloppe ; F.3-02 [−] l'agent ne confirme jamais : un jeton n'ouvre aucune route … |
| F.3-02 | `packages/atelier-model/src/studio/agents/agents.test.ts` | F.3-02 [+] initialize, tools/list et tools/call : une seule écriture, la proposition, sur les identifiants du registre, à confirmer ; F.3-02 [−] outil inconnu, permission non accordée, arguments hors schéma, méthode inconnue : refus JSON-R… |
| F.3-03 | `apps/web/e2e/studio-lot-f.mjs` | F.3-03 : 80 mouvements du pointeur sur la vue 3D, aucun appel HTTP ; F.3-03 : 80 mouvements du pointeur sur la Planche 2D, aucun appel HTTP |
| F.3-03 | `apps/web/src/modules/studio/illustration/illustration.test.ts` | F.3-03 [−] le client Studio n'appelle jamais le serveur MCP, et les routes du lot F ne sont appelées que depuis des gestes explicites (ouverture, bouton), jamais d'un gestionnaire de pointeur |
| F.3-03 | `packages/atelier-model/src/studio/agents/agents.test.ts` | F.3-03 [−] aucun outil ne suit le pointeur, ne prévisualise au survol ni ne diffuse en continu : chaque appel est un acte explicite |
| BLOC-06 | `scripts/validation/porte-g4.test.mjs` | BLOC-06 [−] un défaut non vérifié refuse la livraison et nomme défaut, preuve et propriétaire ; BLOC-06 [−] une preuve qui ne tient pas (fichier absent, libellé introuvable, aucune preuve exécutable) refuse la livraison ; BLOC-06 [+] exécu… |
| BLOC-07 | `scripts/registre/controle-preuves.test.mjs` | BLOC-07 — non-applicabilité motivée, jamais pour une obligation de produit ; exclusion rattachée à sa décision |
| MIG-COEX-04 | `apps/web/src/lib/local-store-quarantaine.test.ts` | MIG-COEX-04 [+] montée v5 → v6 : les brouillons et contextes Studio sans propriétaire passent en quarantaine, intacts, au lieu d'être vidés ; MIG-COEX-04 [+] montée v6 → v7 : les lots de l'Atelier sans propriétaire passent en quarantaine ;… |
| MIG-COEX-04 | `apps/web/src/lib/local-store-migration.test.ts` | MIG-COEX-04 [+] les lignes sans propriétaire passent en quarantaine (v6 : Studio ; v7 : lots), présente dès la v6 et jamais vidée |
| MIG-COEX-04 | `apps/web/e2e/studio-dec.mjs` | MIG-COEX-04 [+] montée réelle v5 → v9 : les deux lignes sans propriétaire sont en quarantaine, consultables dans Paramètres ; MIG-COEX-04 [+] export JSON : les lignes d'origine sont restituées intactes ; MIG-COEX-04 [−] les lignes ne sont … |
| MIG-COEX-06 | `apps/api/src/routes/studio-cmd.test.ts` | MIG-COEX-06 : préparée, l'étude n'écrit pas ; basculée, elle écrit ; retour arrière, elle n'écrit plus — lecture toujours ouverte |
| MIG-COEX-06 | `apps/web/e2e/studio-cmd.mjs` | MIG-COEX-06 : sans bascule, l'Atelier écrit (commande réelle) ; MIG-COEX-06 : bascule préparée — l'Atelier écrit, l'étude Studio refuse (chemin_ecriture) et reste lisible ; MIG-COEX-06 : basculé — l'Atelier refuse toute écriture (chemin_ec… |
| SUIVI-02 | `scripts/registre/controles-suivi.test.mjs` | SUIVI-02 — une seule autorité normative : copie (contenu, nom, en-tête) hors de Studio/ refusée ; blob épinglé du registre issu de Studio/ ; dépôt réel — SUIVI-01, ARC-08, SUIVI-02, SUIVI-08, X.3-02 et SUIVI-09 conformes ; 141 chaînes comp… |
| SUIVI-07 | `scripts/registre/controles-suivi.test.mjs` | X.3-02 / SUIVI-07 — chaînes obligation → lot → composants → TEST/NAV → DEC → décision versionnée, contrôlées ; dépôt réel — SUIVI-01, ARC-08, SUIVI-02, SUIVI-08, X.3-02 et SUIVI-09 conformes ; 141 chaînes complètes |
| SUIVI-08 | `scripts/registre/controles-suivi.test.mjs` | SUIVI-08 — ADR nommées et rangées selon le protocole, sans doublon ; registre de tâches unique ; décisions uniques ; dépôt réel — SUIVI-01, ARC-08, SUIVI-02, SUIVI-08, X.3-02 et SUIVI-09 conformes ; 141 chaînes complètes |
| SUIVI-09 | `scripts/registre/controles-suivi.test.mjs` | SUIVI-09 — rapports lourds déclarés avec empreinte et raison ; empreintes des preuves stables ; exécutions citées avec leur verdict ; dépôt réel — SUIVI-01, ARC-08, SUIVI-02, SUIVI-08, X.3-02 et SUIVI-09 conformes ; 141 chaînes complètes |
| SUIVI-10 | `scripts/securite/analyse-secrets.test.mjs` | SUIVI-10 — chaque règle détecte son motif ; le constat ne montre jamais le secret ; SUIVI-10 — sans faux positif sur les variables et hôtes locaux ; SUIVI-10 — géométries de modèle ou de relevé refusées hors autorisation (IFC, DXF, LAS…) ;… |
| PR-01 | `scripts/registre/controle-pr.test.mjs` | PR-01 — une Issue propre à l’unité de travail est liée (le programme #156 et le canal #166 ne suffisent pas) ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio no… |
| PR-02 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatiqu… |
| PR-03 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatiqu… |
| PR-04 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatiqu… |
| PR-05 | `scripts/registre/controle-pr.test.mjs` | PR-05 — branche courte du protocole dont l’Issue est liée ; preuves vérifiables ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatique… |
| PR-06 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR-06 — « Testé » cite des tests exécutés ; une capture de bouton seule n’est pas une preuve métier ; PR conforme : Issue propre, champs renseignés, branche… |
| PR-07 | `scripts/registre/controle-preuves.test.mjs` | PR-07 — « Implémenté » admis avec une preuve qui cite un fichier, jamais avec la clôture vérifiée ; état inconnu refusé ; PR-07 — compteurs des checkpoints : « Implémenté » compté dans la phrase des quatre checkpoints, facultatif tant qu’i… |
| PR-08 | `scripts/registre/controle-preuves.test.mjs` | PR-08 — statut, conformité et état des tests distincts et cohérents |
| PR-09 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR-09 — revalidation : le HEAD revalidé est contenu dans la branche et la base, la CI est citée ; PR conforme : Issue propre, champs renseignés, branche du … |
| TEST-032 | `apps/api/src/routes/studio-illustrations.test.ts` | TEST-032 [+] un éditeur produit une illustration locale depuis le rendu de la vue : 201, aucune révision, tête inchangée, provenance complète dans la réponse et dans le PNG archivé ; TEST-032 [+] permissions conservées : tout lecteur de la… |
| TEST-032 | `apps/web/e2e/studio-lot-f.mjs` | TEST-032 : aucune révision écrite par l'illustration (tête inchangée) ; illustration archivée avec ses paramètres et sa provenance ; image : vrai PNG, provenance « fadi:illustration » et en-tête « non vérifiée » |
| TEST-033 | `apps/api/src/routes/studio-agents.test.ts` | TEST-033 [+] F.3-02 [+] l'agent propose, rien n'est écrit ; la personne confirme dans Studio ; la révision est celle que la route humaine écrit pour la même enveloppe ; TEST-033 [+] idempotence : proposer à nouveau le même requestId rend l… |
| TEST-033 | `apps/web/e2e/studio-lot-f.mjs` | MCP : proposition en attente de confirmation, rien n'est écrit ; TEST-033 : la confirmation écrit une révision, par le point d'entrée commun ; TEST-033 : idempotence — la même proposition rejouée rend son état confirmé, sans nouvelle écrit… |
| TR-EX-008 | `apps/web/src/modules/studio/taches/trace-geste.test.ts` | EX-008 [+] : geste confirmé — intention, commande, mutation canonique puis scène invalidée, dans cet ordre ; EX-008 [−] : scène sans mutation canonique préalable, ou d'une autre révision — l'ordre n'est pas établi |
| TR-EX-008 | `apps/web/e2e/studio-cmd.mjs` | EX-008 : un seul geste horodaté — intention → commande → mutation canonique → scène invalidée, dans cet ordre |
| TR-EX-010 | `packages/atelier-model/src/studio/cmd/cmd.test.ts` | EX-010 [+] : créer, modifier, supprimer — identifiants, relations, domaines dérivés, révision et origine cohérents ; EX-010 [+] : références et contraintes modifiées — cote rendue « à résoudre » par la suppression de son objet lié ; EX-010… |
| TR-EX-010 | `apps/api/src/routes/studio-cmd.test.ts` | IF-011 [+] : après engagement durable, l'événement garde eventId, transaction, auteur, étude, variante, base, issue, effets, horodatage serveur ; EX-010 [−] : suppression d'un objet portant une cote liée — relation retirée et cote « à réso… |
| TR-EX-010 | `apps/web/e2e/studio-cmd.mjs` | EX-010 : la réponse d'une commande acceptée porte ses effets (créés, références, domaines invalidés, révision, origine) ; EX-010 [−] : suppression de l'objet lié — relation retirée et cote « à résoudre » décrites, publications invalidées |
| TR-EX-013 | `packages/atelier-model/src/studio/copie-independante.test.ts` | TR-EX-013 [+] modifier la copie laisse la source inchangée, modifier la source laisse la copie inchangée (aucune propagation) |
| TR-EX-013 | `apps/api/src/routes/studio-derivation-copie.test.ts` | TR-EX-013 [+] mode copie : nouvelles identités et provenance par élément ; modifier la copie laisse la source inchangée, et réciproquement ; TR-EX-013 [+] mode version (défaut) : la variante dérivée garde les identifiants d'objets, sans mo… |
| TR-EX-013 | `apps/web/e2e/studio-dec.mjs` | TR-EX-013 : copie indépendante créée depuis l'interface — provenance « copie » vers la source et sa révision ; TR-EX-013 : la liste des variantes nomme la provenance « Copie indépendante de » |
| TR-EX-019 | `packages/atelier-model/src/studio/cmd/migration.test.ts` | EX-019 : la migration déclarée documente transformation, inverse, récupération et cas impossible ; EX-019 [+] : lire un document de schéma ancien, appliquer la transformation, identités et propriétés identiques (aller-retour) ; EX-019 [−] … |
| TR-EX-031 | `packages/atelier-model/src/studio/agents/agents.test.ts` | TR-EX-031 [+] extension signée par une clé de confiance : vérifiée, puis autorisée seulement pour cette version ; l'adaptateur MCP intégré est déclaré ; TR-EX-031 [−] trouvée dans le registre sans signature valide : découverte, non autoris… |
| TR-EX-031 | `apps/api/src/routes/studio-agents.test.ts` | F.3-01 [−] adaptateur désactivé par l'administrateur : plus aucun outil n'agit ; déclaration avec script : refusée, rien n'est chargé ni écrit |
| TR-EX-036 | `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts` | TR-EX-036 [+] chaque outil du manifeste a exactement une alternative déclarée ; chaque geste au pointeur a son essai sans pointeur ; TR-EX-036 [+] chaque saisie numérique déclarée produit, sans pointeur, la commande de l'outil, acceptée pa… |
| TR-EX-036 | `apps/web/e2e/studio-dec.mjs` | TR-EX-036 : Maj+D (2D → 3D) déplace le focus sur la vue 3D, avec un contour visible ; TR-EX-036 : Maj+D (3D → 2D) ramène le focus sur la planche 2D, avec un contour visible ; TR-EX-036 : flèche droite sur la planche ayant le focus — la vue… |
| TR-EX-045 | `apps/api/src/routes/studio-cmd.test.ts` | EX-045 [+] : prévisualisation sur R1 sans mutation permanente, puis confirmation sur base valide (journal relié au job) ; EX-045 [−] : essai R1 confirmé après R2, essai abandonné, base périmée : refusés, aucun engagement |
| TR-EX-045 | `packages/atelier-model/src/studio/cmd/cmd.test.ts` | EX-045 [−] : résultat d'essai R12 reçu après R13, essai abandonné : refusés sans effet |
| TR-EX-045 | `apps/web/e2e/studio-cmd.mjs` | EX-045 [+] : essai à portée de révision — résultat (géométrie, effets, validité) sans révision écrite ; EX-045 [−] : essai calculé sur R12 confirmé quand R13 est la tête — refusé (essai_perime), rien d'engagé |
| TR-EX-046 | `apps/api/src/lib/studio-journal-acces.test.ts` | TR-EX-046 [+] conservation de 12 mois par défaut, paramétrable par STUDIO_ACCESS_RETENTION_MONTHS (1 à 120), limite en mois civils ; TR-EX-046 [+] purge datée : supprime seulement les événements antérieurs à la limite, puis date la purge (… |
| TR-EX-046 | `apps/api/src/routes/studio-journal-acces.test.ts` | TR-EX-046 [+] base réelle : un refus et un export Studio sont journalisés sans IP ni courriel ; la purge supprime au-delà de 12 mois, garde le reste et se date ; TR-EX-046 [−] base réelle : une ligne du journal d'accès n'est jamais modifié… |
| TR-EX-046 | `apps/web/e2e/studio-dec.mjs` | TR-EX-046 : le refus et l'export sont journalisés, route générique, statut et genre ; TR-EX-046 : minimisation — ni courriel, ni adresse IP, ni identifiant d'étude dans le journal |
| TR-EX-051 | `apps/web/src/modules/studio/vue3d/etat-projection.test.ts` | EX-051 [+] : après la commande R13, la scène affiche sa révision source et les données périmées, puis se recalcule |
| TR-EX-051 | `packages/atelier-model/src/studio/cmd/cmd.test.ts` | EX-051 : domaines périmés après une commande — seuls les domaines invalidés par l'effet passent « à recalculer » |
| TR-EX-051 | `apps/web/e2e/studio-cmd.mjs` | EX-051 : la vue 3D affiche le sourceRevisionId serveur de son résultat (texte visible) ; EX-051 : modification non enregistrée — la révision source est nommée « brouillon non enregistré » |
| TR-EX-071 | `packages/atelier-model/src/studio/agents/agents.test.ts` | TR-EX-071 [+] la provenance porte révision, caméra, paramètres, auteur, date, empreintes ; l'IA externe y ajoute fournisseur, version « inconnue », sources envoyées, consentement, coûts et quotas ; TR-EX-071 [−] appel externe sans autorisa… |
| TR-EX-071 | `apps/api/src/routes/studio-illustrations.test.ts` | TR-EX-094 [+] TR-EX-071 [+] politique, consentement au coût déclaré et clé fournie : un seul appel au double, provenance avec fournisseur, version « inconnue », source envoyée, consentement, coûts, quotas et reproductibilité non garantie ;… |
| TR-EX-072 | `packages/atelier-model/src/studio/agents/agents.test.ts` | TR-EX-072 [+] / [−] paramètres archivés ; seule l'illustration locale promet les mêmes pixels, l'IA externe déclare ses inconnues et ne promet ni identité ni fidélité géométrique |
| TR-EX-072 | `apps/api/src/routes/studio-illustrations.test.ts` | TR-EX-072 [+] rejeu du même requestId : la même illustration (replayed) ; nouvelle génération locale avec les mêmes paramètres : mêmes pixels, déclarés reproductibles ; TR-EX-072 [−] même requestId pour un autre contenu ou un autre auteur … |
| TR-EX-088 | `apps/api/src/routes/studio-cmd.test.ts` | EX-088 [+] / [−] : job lu avec l'autorisation de son étude ; copié vers un autre projet ou par un non-membre, refus sans métadonnée |
| TR-EX-088 | `apps/web/e2e/studio-cmd.mjs` | EX-088 : résultat de job serveur traçable lu sous l'autorisation de l'étude ; autre compte refusé sans métadonnée |
| TR-EX-091 | `packages/atelier-model/src/studio/cmd/migration.test.ts` | EX-091 [+] : simulation compare identifiants, propriétés, cotes, associations, historique et accès avant / après — sans perte ; EX-091 [−] : objet non convertible conservé et rapporté (jamais supprimé pour améliorer le taux) ; perte d'hist… |
| TR-EX-091 | `apps/api/src/routes/studio-cmd.test.ts` | EX-091 [+] : simulation (job) puis accord du propriétaire, application des copies /2 et point de retour arrière ; EX-091 [−] : étude changée après la simulation, ou révision non migrable — application et accord refusés, rien n'est supprimé |
| TR-EX-091 | `apps/web/e2e/studio-cmd.mjs` | EX-091 : simulation (comparaison identifiants, propriétés, cotes, associations, historique, accès), accord du propriétaire, application des copies /2, retour arrière |
| TR-EX-094 | `packages/atelier-model/src/studio/agents/agents.test.ts` | TR-EX-094 [+] politique, fournisseur, source connue, droit d'export et consentement au coût déclaré : transfert autorisé, inconnues signalées ; TR-EX-094 [−] chaque manque bloque avant transmission : politique par défaut, source confidenti… |
| TR-EX-094 | `apps/api/src/routes/studio-illustrations.test.ts` | TR-EX-094 [−] configuration par défaut : le service externe est indisponible et une demande est refusée avant toute transmission (le double n'est jamais appelé) ; TR-EX-094 [−] service configuré mais sans consentement, sans coût accepté, c… |
| TR-EX-094 | `apps/web/src/modules/studio/illustration/illustration.test.ts` | TR-EX-094 [−] service externe : sans classification choisie → « inconnue » ; sans case cochée → aucun consentement ; le bouton reste indisponible avec sa raison |
| TR-INV-002 | `apps/web/e2e/studio-cmd.mjs` | INV-002 : même révision serveur affichée par la planche 2D (barre d'état) et par la vue 3D |
| TR-INV-002 | `apps/web/e2e/studio-navigation.mjs` | TEST-003 : dans la vue 3D, le même mur (même identifiant) porte déjà la hauteur 3,2 m saisie en 2D ; TEST-003 : enregistré en deux studio.architecture.modifier sur le même objectId |
| TR-INV-003 | `packages/atelier-model/src/studio/copie-independante.test.ts` | TR-INV-003 [+] copie indépendante : chaque élément reçoit une nouvelle identité, la provenance pointe vers sa source, les références internes suivent ; TR-INV-003 [−] une copie qui réutilise un ancien identifiant dans le nouveau propriétai… |
| TR-INV-003 | `apps/api/src/routes/studio-derivation-copie.test.ts` | TR-INV-003 [−] l'ancien identifiant est sans prise sur la copie ; un mode sans source ou inconnu est refusé ; un rejeu d'un autre mode est un conflit, sans écriture |
| TR-INV-003 | `apps/web/e2e/studio-dec.mjs` | TR-INV-003 : la copie porte de nouvelles identités (aucun identifiant de la source réutilisé), chacune reliée à sa source ; TR-INV-003 : modifier la copie ne propage rien vers la source (révision et document inchangés) |
| TR-INV-006 | `packages/atelier-model/src/studio/cmd/cmd.test.ts` | INV-006 : un résultat calculé sur R12 arrivé quand R13 est courante est ignoré, il n'écrase pas l'état courant |
| TR-INV-006 | `apps/web/src/modules/studio/vue3d/etat-projection.test.ts` | INV-006 [−] : un résultat calculé sur R12 n'est jamais présenté à jour pour R13 ; échec explicite avec l'ancienne image |
| TR-INV-006 | `apps/web/e2e/studio-cmd.mjs` | EX-016 / INV-006 : après l'enregistrement, la vue 3D est « À jour pour la révision » de la nouvelle tête, sans données périmées |
| TR-INV-007 | `packages/atelier-model/src/studio/cmd/cmd.test.ts` | INV-007 [+] : optimisation (maillage incrémental) comparée en p95 ET en résultats métier — préservée dans la tolérance ; INV-007 [−] : gain de p95 avec un résultat hors tolérance (volume différent) — optimisation rejetée |
| TR-INV-010 | `apps/api/src/routes/studio-agents.test.ts` | TR-INV-010 [+] historique des révisions : source « agent-mcp » pour la proposition confirmée, « authenticated-session » pour l'enregistrement humain ; journal : appels de l'agent (jeton) et décisions de la personne ; TR-INV-010 [−] un corp… |
| TR-INV-010 | `apps/web/e2e/studio-lot-f.mjs` | TR-INV-010 : la révision confirmée porte la source « agent-mcp » ; l'enregistrement humain garde « authenticated-session » ; TR-INV-010 : journal agent / humain |
| TR-IF-001 | `apps/api/src/routes/studio-cmd.test.ts` | IF-001 [+] : rattacher une étude à un projet autorisé avec site, sources et version — contexte validé, identifiant stable ; IF-001 [−] : source indisponible, conflit de version, droits insuffisants — erreur explicite sans création partielle |
| TR-IF-001 | `apps/web/e2e/studio-cmd.mjs` | IF-001 : étude rattachée avec ses sources et sa version — contexte validé et identifiant stable ; source indisponible refusée sans création partielle |
| TR-IF-002 | `apps/web/src/modules/studio/planche2d/outils/tolerance-ligne.test.ts` | TR-IF-002 [+] la tolérance est déclarée dans le contrat de commandes : saisie 0, pointé 1e-9 m ; TR-IF-002 [+] valeur saisie : la ligne engagée porte exactement les coordonnées tapées (écart nul) ; TR-IF-002 [+] valeur pointée : après accr… |
| TR-IF-002 | `apps/web/e2e/studio-dec.mjs` | TR-IF-002 [−] Ligne commencée puis Échap : aucune commande en attente, document du serveur inchangé |
| TR-IF-011 | `apps/api/src/routes/studio-cmd.test.ts` | IF-011 [+] : après engagement durable, l'événement garde eventId, transaction, auteur, étude, variante, base, issue, effets, horodatage serveur ; IF-011 [−] : transaction échouée — aucun événement, aucune révision, aucune notification ; la… |
| TR-IF-011 | `apps/web/e2e/studio-cmd.mjs` | IF-011 : un événement par révision engagée — eventId, transaction (applicative et PostgreSQL), auteur, étude, variante, base, issue, effets, horodatage serveur ; EX-045 [+] / IF-011 : confirmation sur base valide — révision écrite, événeme… |
| TR-AC-007 | `packages/atelier-model/src/studio/agents/agents.test.ts` | TR-AC-007 [+] / [−] l'illustration atteste le modèle inchangé et se déclare « non vérifiée » ; un modèle modifié ou une autre révision refusent l'illustration |
| TR-AC-007 | `apps/api/src/routes/studio-illustrations.test.ts` | TEST-032 [+] un éditeur produit une illustration locale depuis le rendu de la vue : 201, aucune révision, tête inchangée, provenance complète dans la réponse et dans le PNG archivé |
| TR-AC-007 | `apps/web/e2e/studio-lot-f.mjs` | illustration produite : « non vérifiée », modèle source inchangé |

### 2.3 Recettes Studio présentes mais non branchées en CI (0)

Aucune : chaque `apps/web/e2e/studio-*.mjs` est une étape nommée de la CI ou lancée par un script qu’elle exécute.
