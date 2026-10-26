# État des contrôles Studio — exécutés et absents

> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre ; la CI (workflow
> « Continuité de développement ») le recalcule à chaque commit et échoue s’il diffère : il est donc tenu au HEAD testé.
> Registre lu : `docs/workstreams/studio/task-register.json`, SHA-256 `cc22bf2d5ecffb3aebfc7b964e66664300b592199a740024aece66ada60d0b96`.

**Une CI verte n’est pas une couverture exhaustive** (X.4-03) : elle prouve seulement que les contrôles listés en partie 1
ont réussi aux exécutions citées. Les scénarios de la partie 2 ne sont pas couverts, quel que soit l’état de la CI.

## Répartition des 630 obligations (statut / état des tests)

| Statut / tests | Nombre |
|---|---:|
| Accepté / Non applicable | 2 |
| Accepté / Non exécuté | 57 |
| Bloqué / Non exécuté | 9 |
| En cours / Non exécuté | 35 |
| Implémenté / Non exécuté | 56 |
| Vérifié / Exécuté | 339 |
| Vérifié / Non applicable | 93 |
| À faire / Non exécuté | 39 |

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
| `apps/api/src/routes/studio-agents.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 5 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-cmd.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 11 | 7 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-delegations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-derivation-copie.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-illustrations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 9 | 4 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/routes/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 24 | 3 | 2026-10-19 14:33 | 2026-10-25 16:17 |
| `apps/api/src/routes/studio-observations-rapprochement.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-permissions.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 2 | 2026-10-19 14:33 | 2026-10-19 20:40 |
| `apps/api/src/routes/studio-profils.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
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
| `apps/web/e2e/studio-exact.mjs` | Recette du noyau exact Studio — booléens exacts chargés à la demande, aperçu provisoire, … | 7 | 6 | 1 | 2026-10-25 21:21 | 2026-10-25 21:21 |
| `apps/web/e2e/studio-faces.mjs` | Recette de la géométrie 3D Studio — édition des faces, direction d'extrusion, profil sour… | 14 | 11 | 1 | 2026-10-25 19:58 | 2026-10-25 19:58 |
| `apps/web/e2e/studio-hors-ligne.mjs` | Recette Studio hors ligne — brouillon conservé au rechargement, rejeu des enveloppes (mêm… | 8 | 4 | 2 | 2026-10-19 06:50 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-lot-f.mjs` | Lot F — illustrations depuis la vue, agents MCP sous confirmation humaine, extensions (ap… | 14 | 6 | 1 | 2026-10-26 03:17 | 2026-10-26 03:17 |
| `apps/web/e2e/studio-memoire.mjs` | Recette de mémoire Studio — 80 fermetures / réouvertures de la vue 3D, compteurs GPU, éco… | 3 | 2 | 1 | 2026-10-25 16:16 | 2026-10-25 16:16 |
| `apps/web/e2e/studio-navigation.mjs` | Recette de navigation Studio — enveloppe, étude, variantes, historique en lecture seule, … | 102 | 60 | 11 | 2026-10-18 23:02 | 2026-10-25 22:04 |
| `apps/web/e2e/studio-observations.mjs` | Recette des observations Studio — identité réemployée entre domaines, contexte, tâches, d… | 27 | 9 | 4 | 2026-10-19 12:43 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-persistance.mjs` | Recette Studio par l'API — étude, commandes, rejeu, conflits, droits, historique, puis ré… | 28 | 15 | 4 | 2026-10-18 21:30 | 2026-10-25 22:03 |
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
| `apps/web/src/lib/local-store-migration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/lib/local-store-quarantaine.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-18 22:20 | 2026-10-18 22:20 |
| `apps/web/src/modules/studio/chargement/cache-hors-ligne.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/carte-morceaux.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/gestionnaire-ressources.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 5 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/manager-exact.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/chargement/moteurs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 2 | 2026-10-19 12:39 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/chargement/ouverture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/perf.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/chargement/service-worker.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/contexte/facade-contexte.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
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
| `apps/web/src/modules/studio/illustration/illustration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 2 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/accrochage/accrochage.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/planche2d/historique-borne.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/index-incremental.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/planche2d/index-maintien.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/planche2d/index-spatial.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 4 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 4 | 2 | 2026-10-19 14:33 | 2026-10-25 16:08 |
| `apps/web/src/modules/studio/planche2d/outils/tolerance-ligne.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/planche2d/profils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 4 | 2 | 2026-10-19 06:45 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/planche2d/regle-or.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 2 | 2026-10-18 22:56 | 2026-10-18 23:34 |
| `apps/web/src/modules/studio/planche2d/rendus/comparaison-moteurs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/poc/poc-corpus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/publication/publication-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/routes-studio.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 2 | 2026-10-18 22:56 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 5 | 2 | 2026-10-19 14:33 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/taches/instrumentation.preuves-c.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/taches/journal-correlation.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/taches/ordonnanceur.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 8 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/taches/pool-studio.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/taches/pool-studio.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 6 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/taches/trace-geste.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/taches/transferts.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/variante/droits.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/variante/droits.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/web/src/modules/studio/vue3d/etat-projection.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/vue3d/extrusion.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 2 | 1 | 2026-10-18 23:43 | 2026-10-18 23:43 |
| `apps/web/src/modules/studio/vue3d/picking.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 2 | 2026-10-19 10:41 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `apps/web/src/modules/studio/vue3d/scene-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 2 | 2026-10-19 08:07 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/workers/equivalence.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/modules/studio/workers/hote-worker.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/web/src/routes/descripteur-studio.preuves-d1.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `docs/ai-team/reports/claude-m13-rep/REP-07-ESSAIS.json` | voir la preuve | 0 | 1 | 0 | 2026-10-18 18:51 | 2026-10-18 18:51 |
| `packages/atelier-model/src/studio/agents/agents.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 13 | 9 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/annotations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `packages/atelier-model/src/studio/architecture/architecture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 7 | 2 | 2026-10-19 06:45 | 2026-10-25 13:26 |
| `packages/atelier-model/src/studio/cmd/cmd.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 5 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/cmd/migration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 10 | 1 | 2026-10-25 19:50 | 2026-10-25 19:50 |
| `packages/atelier-model/src/studio/copie-independante.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/corpus/corpus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 2 | 2026-10-19 14:33 | 2026-10-26 03:10 |
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
| `scripts/registre/controle-preuves.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 5 | 1 | 2026-10-26 03:05 | 2026-10-26 03:05 |
| `scripts/registre/controles-suivi.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 9 | 1 | 2026-10-26 03:06 | 2026-10-26 03:06 |
| `scripts/securite/analyse-secrets.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 03:05 | 2026-10-26 03:05 |
| `scripts/validation/porte-g4.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 2 | 1 | 2026-10-26 03:06 | 2026-10-26 03:06 |

Total : 159 fichiers ou traces, 1106 libellés exécutés.

## 2. Scénarios absents ou incomplets

### 2.1 Obligations de recette ouvertes (67)

Obligations TEST, NAV, REC, TR et E2E qui ne sont ni « Vérifié » ni « Accepté » : leur scénario n’est pas (entièrement) couvert.

| ID | Statut | Tests | Ce qui manque (suite du registre) |
|---|---|---|---|
| REC-A-02 | À faire | Non exécuté | Agrégation des preuves TEST-001 à TEST-014, TEST-027, TEST-034/035 : elle dépend de la requalification de chaque fiche TEST par son lot ; ce lot apporte des preuves utilisables pour EX-010, EX-016, EX-045, EX-051, IF-011 (recette studio-cm… |
| REC-B-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Manifeste, chargeurs, gestionnaire, profils persistants et politique de cache sont contrôlés en CI. Le rapport réseau / mémoire est produit en CI (étape continue-on-error, artefact atelier-capt… |
| REC-B-02 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : TEST-036 est maintenant couvert (studio-preuves-b, partie 4) et TEST-019 sur document non vide. Restent TEST-016 et AC-002 : relevés à cache froid / chaud sans référence de comparaison ni verdict (mes… |
| REC-C-01 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| REC-C-02 | À faire | Non exécuté | Séparation des profils GPU et des mesures logicielles faite et testée : chaque rapport porte le moteur WebGL relevé et `renduLogiciel` ; la règle refuse toute accélération GPU mesurée en logiciel. Reste l'évaluation des profils GPU sur app… |
| REC-D-01 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| REC-D-02 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| REC-E-01 | À faire | Non exécuté | Volet TEST-032 désormais couvert (fonction livrée). Les autres volets de REC-E-01 (TEST-010, 018, 027, 028, 035, TEST-001…) ne relèvent pas du lot F et restent à l'état du registre. |
| REC-E-02 | À faire | Non exécuté | AC-007 couvert (illustration livrée). AC-008 et AC-010 restent hors du lot F (registre inchangé). |
| REC-E-03 | À faire | Non exécuté | Scénario enchaîné vérifié (base simulée simplifiée : pas d'orderBy/limit ; cycle complet sur base réelle dans studio-pub.mjs). La recette d'usage des trois parcours par le maître d'ouvrage est EXTERNE (acte du maître d'ouvrage). |
| REC-I-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Aucune « maquette d'interaction » n'existe ni n'a été validée ; la validation relève d'une recette utilisateur / décision du maître d'ouvrage (R.3-01). Aucun test ne la remplace. |
| TEST-011 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TEST-027 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-AC-001 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Ajoutés : annuler / rétablir la modification du mur (identités, hôte, métré, plan, 3D) et dossier publié conservant la version examinée sur le cas du mur. Reste : le négatif « perte de cote » est inte… |
| TR-AC-002 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : La comparaison requêtes / octets / chunks exécutés / mémoire à une référence, cache froid et chaud, n'existe que dans studio-mesures-chargement.mjs (mesure sans verdict, hors CI) ; elle demande… |
| TR-AC-004 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Depuis F5, l'index réutilisé est éprouvé sur des suites d'insertions et de suppressions contre le parcours linéaire. Fonction absente : aucune trace des cas ambigus (plusieurs cibles à égalité) n'est … |
| TR-AC-005 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (mesure requise) : Orbite, zoom, pousser / tirer et changement de matériau ne sont pas comparés avant / après optimisation (seules la sélection et l'égalité du maillage incrémental le sont) ; la séparation GPU ré… |
| TR-AC-006 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-AC-010 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Refus serveur de l'approbation au concepteur et au rôle d'administration technique (accès support) désormais testés. Fonction absente : « Approuver » n'est pas un outil du catalogue (aucune découverte… |
| TR-AC-011 | En cours | Non exécuté | Fiches d'outils (fiches-outils.ts) : risques, mesures PERF, jeux positifs / négatifs, règle prêt à développer / conforme testée. Reste : désigner le build et le profil de charge de référence (DESIGNATION_CONFORMITE = null) et joindre les p… |
| TR-EX-002 | En cours | Non exécuté | Cas négatif livré (refus nommé 400 hors_perimetre). Reste le cas positif : un parcours unique d'une petite étude du dessin au dossier de conception à travers quatre domaines (recette à composer avec les lots PUB / dossiers). |
| TR-EX-005 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-014 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-016 | En cours | Non exécuté | Machine d'états pure (a-jour R / a-recalculer / en-calcul / echec / non-applicable) et oracle livrés ; la vue 3D l'affiche. Reste : le métré, les feuilles et les publications gardent leurs propres statuts (à jour / périmée) sans les cinq é… |
| TR-EX-023 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-027 | En cours | Non exécuté | Cas négatif vérifié (préexistant). Le cas positif demande une nouvelle capacité d'outil (échelle, studio.arch.ladder) au registre des outils, propriété du lot OUT : non implémentée dans le lot PUB pour ne pas réécrire ses fichiers. |
| TR-EX-028 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-029 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-030 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-033 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-034 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-040 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-041 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-042 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-044 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-046 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-049 | En cours | Non exécuté | États « Rejetée » et « Prévisualisation abandonnée » livrés (bandeau, persistance du brouillon : rejet avec ses requestId, aperçu en cours, contrat des enveloppes ; reprise par useChargementVariante). Manque une recette navigateur de repri… |
| TR-EX-052 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-053 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-055 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-056 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-059 | En cours | Non exécuté | Mesuré en CI (Chromium logiciel) sur la lecture d'un DXF de 4,2 Mo dans le Worker : trame la plus longue 16,8 ms contre une tâche longue de 682 ms pour la même lecture sur le fil principal (local). Manque : (1) la même mesure pendant un bo… |
| TR-EX-062 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-063 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-065 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-068 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-071 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-074 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-075 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-076 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-077 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-078 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-079 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (fonction absente) : Fonction absente : la matrice d'échanges ne connaît que les sens import / export (StudioSensEchange) ; lecture, consultation, édition et aller-retour ne sont pas évalués séparément. |
| TR-EX-080 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-084 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-097 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Seule la recette studio-mesures-chargement.mjs (hors CI, non comptée) traite SwiftShader ; aucun contrôle en CI d'une mesure cache froid/chaud sur appareil identifié ni refus d'un résultat S… |
| TR-EX-098 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-101 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Skip / only / todo refusés dans les suites tracées (registre) ; aucun mécanisme ne relie une modification de Worker / Registry à ses tests pertinents et l'affaiblissement d'une assertion n'est pas dét… |
| TR-IF-003 | En cours | Non exécuté | Rapprochement du 25 octobre 2026 (non couvert) : Aucun calcul booléen dans Studio V1 (déclaré par le test « PERF-07 déclaré non applicable (aucun booléen exact dans Studio V1), jamais simulé », apps/web/src/modules/studio/chargement/perf.t… |
| TR-IF-005 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-IF-006 | En cours | Non exécuté | Point 2 du 25 octobre 2026 (partiel) : Négatif désormais complet (actorId forgé refusé 400, portée d'un autre projet 404, même requestId au contenu différent 409, aucune écriture, membres inchangés, lecteur toujours refusé). Positif : fonc… |
| TR-IF-007 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-IF-008 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-IF-009 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-IF-010 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-009 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-INV-013 | En cours | Non exécuté | Non traité dans ce lot : une annotation référencée à une face 3D elle-même exige un nouveau type de cote sur les faces de solides (géométrie 3D, lot F) ; la preuve reste celle de l'arête source (lot F1). |

### 2.2 Tests prescrits non exécutés (117)

| ID | Fichier | Libellés |
|---|---|---|
| A.3-03 | `packages/atelier-model/src/studio/composition/basculement.test.ts` | basculer de 90° autour de l'axe y : la boîte de 4 m de haut se couche le long de x ; volume, coupe et emprise suivent ; basculer autour de x après un pivot autour de z : orientation Rz · Ry · Rx, maillage exact ; revenir à zéro retire le b… |
| A.3-03 | `apps/web/src/modules/studio/vue3d/groupe-3d.test.ts` | le pivot choisit l'axe (z par défaut) ; l'échelle 3D multiplie dimensions et volume |
| A.3-03 | `apps/web/e2e/studio-out.mjs` | A.3-03 : le pivot propose l'axe vertical et les deux axes horizontaux du solide ; A.3-03 : solide basculé de 90° autour de son axe horizontal y (une commande), volume toujours évalué ; A.3-03 : échelle 3D × 2 — dimensions et volume multipl… |
| C.1-01 | `apps/web/e2e/studio-rend.mjs` | C.1-01 : mesure complète dans le navigateur — 18 corpus (S1–S5, S7 × 100 / 10000 / 100000), 0 divergence index / linéaire, rapport archivé avec machine, navigateur et commit |
| C.1-01 | `apps/web/src/modules/studio/planche2d/mesure-spatiale-analyse.test.ts` | C.1-02 — choix de l'index selon DEC-09, sur la mesure et l'exactitude > sur une vraie mesure courte (S1, S3 à 100 et 3 000 primitives) : exactitude (0 divergence) et analyse produite |
| C.1-02 | `apps/web/src/modules/studio/planche2d/mesure-spatiale-analyse.test.ts` | C.1-02 — choix de l'index selon DEC-09, sur la mesure et l'exactitude > seuil cohérent : linéaire admissible sous 1 000, index plus rapide au-delà, zéro divergence ; croisement relevé ; C.1-02 — choix de l'index selon DEC-09, sur la mesure… |
| C.1-02 | `apps/web/e2e/studio-rend.mjs` | C.1-02 : choix de l'index rapproché de la mesure (croisement mesuré, seuil DEC-09 jugé) |
| C.2-02 | `apps/web/src/modules/studio/vue3d/instanciation.test.ts` | cinq poteaux identiques et un différent : un InstancedMesh de cinq exemplaires (un objet de rendu), chaque clic rend son poteau ; objet supprimé du document : son exemplaire ne désigne jamais lui ; après mise à jour, les autres gardent leu… |
| REC-C-01 | `apps/web/src/modules/studio/workers/chemins-optimises.test.ts` | REC-C-01 — chemins optimisés et chemin direct : mêmes cotes, mêmes exports SVG / DXF / IFC > brouillon incrémental (commande par commande) et frontière du Worker : exports identiques octet pour octet, cotes identiques ; REC-C-01 — chemins … |
| D.3-02 | `apps/web/src/modules/studio/chargement/cycle-activation.test.ts` | noyau exact inactif : libération planifiée après la durée de la politique (5 min), Worker arrêté ; un nouvel usage avant l'échéance l'annule ; aucune politique pour les moteurs sans WebAssembly : planche et 3D jamais libérés automatiquemen… |
| D.3-02 | `apps/web/e2e/studio-memoire.mjs` | TEST-037 : les cycles n'écrivent rien (révision de tête inchangée) |
| REC-D-01 | `apps/web/e2e/studio-exact.mjs` | TEST-014 : le résultat calculé pour l'ancienne révision est marqué périmé, aucun bouton d'engagement, rien d'engagé ; TEST-015 : coupure du Worker — erreur affichée, noyau en échec, Worker arrêté, aucune attente en suspens ; TEST-015 : pas… |
| REC-D-01 | `apps/web/e2e/studio-memoire.mjs` | TEST-037 : les cycles n'écrivent rien (révision de tête inchangée) |
| REC-D-01 | `apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts` | plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée |
| REC-D-02 | `apps/web/src/modules/studio/taches/plantage-integrite.preuves-c.test.ts` | document et brouillon intacts, charge de reprise intacte, résultat identique à l'appel direct et remis une seule fois |
| REC-D-02 | `apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts` | plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée |
| REC-D-02 | `apps/web/e2e/studio-exact.mjs` | TEST-015 : coupure du Worker — erreur affichée, noyau en échec, Worker arrêté, aucune attente en suspens ; TEST-015 : aucune relance silencieuse — le calcul suivant est refusé (relancez), aucun nouveau Worker, attente résolue ; TEST-015 : … |
| E.5-04 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| F.1-01 | `packages/atelier-model/src/studio/accelerations.test.ts` | F.1-01 — une accélération n'est activée qu'après preuve du gain ET de la non-régression > rapport qualifiant (gain sur chaque scène, chaque critère exigé mesuré dans sa tolérance) : autorisée, gains relevés ; F.1-01 — une accélération n'es… |
| F.1-01 | `apps/web/e2e/studio-rend.mjs` | F.1-01 / TR-EX-098 : rapport réel SVG / Canvas mesuré ici et jugé par la règle — verdict rendu avec ses motifs (gain ET non-régression exigés) ; TR-EX-098 : index spatial — gain p95 mesuré ET mêmes cibles d'accrochage / même sélection, jug… |
| F.1-02 | `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts` | F.1-02 — moteur Canvas de la planche, derrière la règle F.1-01 (défaut SVG, DEC-08) > sans rapport : SVG ; rapport qualifiant : Canvas ; rapport qui ne prouve pas le gain : SVG avec le motif dit ; F.1-02 — moteur Canvas de la planche, derr… |
| F.1-02 | `apps/web/e2e/studio-rend.mjs` | F.1-02 : par défaut, la planche est rendue en SVG (DEC-08) : aucun canevas, aucun état de moteur affiché ; F.1-02 : rapport qualifiant → canevas posé exactement sur la planche (mêmes bords), planche SVG conservée (traits transparents), éta… |
| F.2-02 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| PR-01 | `scripts/registre/controle-pr.test.mjs` | PR-01 — une Issue propre à l’unité de travail est liée (le programme #156 et le canal #166 ne suffisent pas) ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio no… |
| PR-02 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatiqu… |
| PR-03 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatiqu… |
| PR-04 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatiqu… |
| PR-05 | `scripts/registre/controle-pr.test.mjs` | PR-05 — branche courte du protocole dont l’Issue est liée ; preuves vérifiables ; PR conforme : Issue propre, champs renseignés, branche du protocole, preuves, revalidation contenue ; périmètre — hors Studio non applicable ; PR automatique… |
| PR-06 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR-06 — « Testé » cite des tests exécutés ; une capture de bouton seule n’est pas une preuve métier ; PR conforme : Issue propre, champs renseignés, branche… |
| PR-09 | `scripts/registre/controle-pr.test.mjs` | PR-02, PR-03, PR-04, PR-06, PR-09 — chaque champ du modèle est exigé et non vide ; PR-09 — revalidation : le HEAD revalidé est contenu dans la branche et la base, la CI est citée ; PR conforme : Issue propre, champs renseignés, branche du … |
| TEST-011 | `packages/atelier-model/src/studio/studio-invariants.test.ts` | TEST-011 [+] annuler puis rétablir la modification d'une baie : mêmes identités, volume net 3,18 puis 3,096 m³, documents identiques |
| TEST-011 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | TEST-011 [+] API : après annuler puis rétablir l'opération, la publication diffusée reste lisible et vérifiable (mêmes empreintes), son manifeste inchangé |
| TEST-011 | `apps/web/e2e/studio-pub.mjs` | TEST-011 : chaque fichier du paquet relu à la même empreinte |
| TEST-027 | `packages/atelier-model/src/studio/studio-invariants.test.ts` | TEST-027 [+] modifier le rectangle dessiné (2 × 1 → 3 × 1) fait passer l'écart signé de 0 à +1 m² ; l'exigence n'est pas réécrite |
| TEST-027 | `apps/web/e2e/studio-exigences.mjs` | TEST-027 : mur allongé par commande (nouvelle révision) ; TEST-027 : exigence identique après la modification du dessin (même version, mêmes valeurs) ; TEST-027 : écart calculé et visible (mesure 11,6 m³ contre ≤ 10 m³, +1,6) |
| TR-EX-005 | `apps/web/src/modules/studio/vue3d/groupe-3d.test.ts` | étude neuve sans dessin 2D : choisir A et C, les déplacer ensemble en un seul lot ; B ne bouge pas ; une annulation rend l'état initial ; pivoter le groupe autour d'un axe vertical, le mettre à l'échelle (volumes compris), puis le supprime… |
| TR-EX-005 | `apps/web/e2e/studio-out.mjs` | TR-EX-005 : étude neuve — aucun objet 2D, deux solides libres ; TR-EX-005 : déplacement du groupe = un seul lot (2 commandes) ; un seul Ctrl+Z le retire en entier, les deux solides reviennent ; TR-EX-005 : relu par le serveur — A et B dépl… |
| TR-EX-014 | `packages/atelier-model/src/studio/sources/sources.test.ts` | TR-EX-014 — provenance d'une source DXF importée > cas positif : import DXF en mm, repère et restrictions déclarés → source portée par le document, exportée avec toutes ses métadonnées ; TR-EX-014 — provenance d'une source DXF importée > c… |
| TR-EX-014 | `apps/api/src/lib/studio-modeles-externes.test.ts` | Modèles externes (TR-EX-066) — réception relue par le serveur > TR-EX-014 : repère source et restrictions d'utilisation déclarés conservés (null s'ils sont absents), colonnes additives |
| TR-EX-014 | `apps/web/e2e/studio-rend.mjs` | TR-EX-014 : import DXF — source enregistrée avec auteur, format et version lue (AC1015), horodatage, unité mm lue, repère, transformation, restrictions et SHA-256 du fichier ; TR-EX-014 : modèle externe IFC — provenance exportée (auteur, v… |
| TR-EX-014 | `apps/web/e2e/studio-navigation.mjs` | Import DXF : la source est déclarée avec le lot (fichier, empreinte SHA-256, unité mm lue, aucune transformation) |
| TR-EX-023 | `packages/atelier-model/src/studio/reperes.test.ts` | TR-EX-023 — système de projet et transformations versionnées document / local / projet > cas positif : un point du document converti explicitement vers le système de projet (version 1, puis version 2), valeurs et unité comparées, trace de … |
| TR-EX-023 | `apps/web/src/modules/studio/graphismes/graphismes-ui.test.ts` | Graphismes et système de projet : saisie > système de projet : version suivante saisie, conversion du point avec la version employée ; sans déclaration, rien n'est converti |
| TR-EX-023 | `apps/web/e2e/studio-rend.mjs` | TR-EX-023 : sans déclaration, « Système de projet non déclaré : aucune conversion n’est supposée. » ; TR-EX-023 : point (3 ; 1) du dessin converti vers le projet par la version 1 (rotation 90°) : (2 599 999 ; 1 200 003) m, trace de la vers… |
| TR-EX-028 | `apps/api/src/routes/studio-quotas.test.ts` | compteur glissant : refus au-delà de la limite de la période, délai avant nouvel essai, libéré quand la fenêtre passe ; route réelle : deux lots admis, le troisième au schéma valide refusé à l'exécution (429, Retry-After), rien écrit ; un … |
| TR-EX-029 | `apps/web/src/modules/studio/planche2d/etats-outils.test.ts` | synonyme : « miroir » trouve la Symétrie, « cloison » le Mur, « cube » la Boîte, « offset » le Décalage ; famille (barre) et domaine : « architecture » et « bâtiment » trouvent les outils d'architecture ; « 3D » les volumes ; la recherche … |
| TR-EX-030 | `packages/atelier-model/src/studio/compatibilite-outils.test.ts` | tables réelles : aucun outil ni module déprécié, déclarations valides ; un outil du registre est actif, un identifiant inconnu est inconnu ; cas négatif : déprécier l'outil Rectangle puis rouvrir un document qui l'emploie — le document se … |
| TR-EX-033 | `apps/api/src/routes/studio-profils-import.test.ts` | profil importé contenant « Publier » sans le droit de publier (éditeur, lecteur) : refusé 403, rien n'est écrit ; le propriétaire, qui publie, l'importe |
| TR-EX-033 | `apps/web/e2e/studio-out.mjs` | TR-EX-033 / TR-INV-009 : profil contenant « Publier » importé par un éditeur sans droit de publier → 403 permission_non_conferee, rien d'écrit ; TR-EX-033 : le propriétaire, qui publie, importe ce même profil |
| TR-EX-034 | `apps/api/src/routes/studio-profils-import.test.ts` | enregistrer un profil avec ordre et raccourcis puis le rouvrir dans une autre session : même profileId, propriétaire, version croissante ; import par un autre compte : le compte importateur devient propriétaire, la provenance est gardée, l… |
| TR-EX-034 | `apps/web/src/modules/studio/planche2d/profils-raccourcis.test.ts` | conflits explicités : doublon, raccourci natif d'un autre outil, commande de l'éditeur, combinaison du navigateur ; table appliquée : seuls les raccourcis sans conflit, outils du registre seulement, jamais une combinaison native |
| TR-EX-034 | `apps/web/e2e/studio-out.mjs` | TR-EX-034 : profil enregistré en base — profileId, propriétaire, version 1, ordre et raccourci personnel ; TR-EX-034 : export — format fadi-studio-profil/1, même profileId, version 2 ; TR-EX-034 : import en conflit avec un raccourci du reg… |
| TR-EX-040 | `apps/web/src/modules/studio/chargement/cycle-activation.test.ts` | première activation : charge module et noyau ; seconde activation et autres outils entre-temps : même noyau, aucune réinitialisation ; cas négatif : échec du module rare — état récupérable ; la relance réussit avec un seul noyau vivant |
| TR-EX-041 | `apps/web/src/modules/studio/chargement/duplication.test.ts` | cas positif : deux outils partagent géométrie et noyau dans un même morceau — un seul exemplaire, aucune duplication ; cas négatif : un morceau par bouton qui embarque chacun le noyau et three.js — duplication détectée en octets, build ref… |
| TR-EX-042 | `apps/web/src/modules/studio/chargement/service-worker.test.ts` | installation : coquille et profil mis en cache avant les modules facultatifs, tous dans le cache du build ; une liste simple (ancienne forme) reste acceptée ; mise à jour avec une page ouverte : le dernier ancien cache est gardé, la page e… |
| TR-EX-042 | `apps/web/src/modules/studio/chargement/cache-hors-ligne.test.ts` | sans service worker, sans cache de ce build ou avec la carte d'un autre build : non évalué, jamais disponible ; tout en cache : chaque moteur et chaque outil disponibles ; lot F2 : .wasm du noyau exact absent du cache (jamais préchargé) : … |
| TR-EX-042 | `apps/web/e2e/studio-hors-ligne.mjs` | service worker : caches de ce build distincts (coquille, profil, modules — EX-042), coquille du même build, aucune réponse de l'API en cache |
| TR-EX-044 | `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts` | la file enregistre build, contrat des commandes, schéma du document et manifeste ; relue par le même build, rien n'est signalé ; mise à jour du build avec une file en attente : relue par le nouveau build, conservée intacte et rejouable, l'… |
| TR-EX-046 | `apps/api/src/lib/studio-journal-acces.test.ts` | TR-EX-046 [+] conservation de 12 mois par défaut, paramétrable par STUDIO_ACCESS_RETENTION_MONTHS (1 à 120), limite en mois civils ; TR-EX-046 [+] purge datée : supprime seulement les événements antérieurs à la limite, puis date la purge (… |
| TR-EX-046 | `apps/api/src/routes/studio-journal-acces.test.ts` | TR-EX-046 [+] base réelle : un refus et un export Studio sont journalisés sans IP ni courriel ; la purge supprime au-delà de 12 mois, garde le reste et se date ; TR-EX-046 [−] base réelle : une ligne du journal d'accès n'est jamais modifié… |
| TR-EX-046 | `apps/web/e2e/studio-dec.mjs` | TR-EX-046 : le refus et l'export sont journalisés, route générique, statut et genre ; TR-EX-046 : minimisation — ni courriel, ni adresse IP, ni identifiant d'étude dans le journal |
| TR-EX-052 | `apps/web/src/modules/studio/planche2d/mesure-spatiale-analyse.test.ts` | TR-EX-052 — recherches comparées à la cible DEC-13 (INP p75 ≤ 200 ms), chemin pris aujourd'hui > le p75 du chemin effectivement pris est comparé au budget ; au-delà, hors cible |
| TR-EX-052 | `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts` | Mesure des recherches spatiales : contrôle du script > mêmes sélections et mêmes candidats par l'index et par le parcours linéaire (S1, S2, S3, S4 à 100 et 1 000 primitives) ; Mesure des recherches spatiales : contrôle du script > TEST-022… |
| TR-EX-052 | `apps/web/e2e/studio-rend.mjs` | TR-EX-052 : chaque recherche comparée à la cible DEC-13 par le chemin pris (p75) ; C.1-01 : mesure complète dans le navigateur — 18 corpus (S1–S5, S7 × 100 / 10000 / 100000), 0 divergence index / linéaire, rapport archivé avec machine, nav… |
| TR-EX-053 | `apps/web/src/modules/studio/planche2d/accrochage/parallele.test.ts` | depuis le dernier point, le pointeur proche de la parallèle à un segment éloigné s'accroche sur cette droite (point exact, ligne guide) ; tolérance : au-delà, aucune parallèle ; sans dernier point, aucune ; mode coupé, aucune ; priorités :… |
| TR-EX-055 | `packages/atelier-model/src/studio/graphismes.test.ts` | TR-EX-055 — graphismes du document 2D (spline, hachure, symbole, transparence) > création par commande, document relu à l'identique ; opacité 1 non stockée (opaque = absente) ; TR-EX-055 — graphismes du document 2D (spline, hachure, symbol… |
| TR-EX-055 | `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts` | TR-EX-055 — splines, hachures, symboles et transparences : rendu SVG et comparaison Canvas / GPU > rendu SVG du modèle : chaque famille présente (Bézier `C`, traits de hachure, symboles, opacité), lecture sans perte ; TR-EX-055 — splines, … |
| TR-EX-055 | `apps/web/src/modules/studio/graphismes/graphismes-ui.test.ts` | Graphismes et système de projet : saisie > spline, hachure et symbole saisis → commande studio.graphisme.creer appliquée par le brouillon ; opacité en pour cent ; Graphismes et système de projet : saisie > refus dits : points illisibles, c… |
| TR-EX-055 | `apps/web/e2e/studio-rend.mjs` | TR-EX-055 : Maj+F6 crée spline, hachure et symbole ; la planche SVG les rend (courbe de Bézier `C`, traits de hachure, symbole posé, opacité 0,5) ; TR-EX-055 : enregistrés (révision serveur : 3 graphismes) et exportés en SVG par le serveur… |
| TR-EX-056 | `apps/web/src/modules/studio/vue3d/moteur-3d.test.ts` | TR-EX-056 — moteur de la vue 3D : WebGL2 par défaut, repli WebGPU → WebGL2 déclaré > WebGL2 demandé (défaut) : WebGL2, aucun repli ; TR-EX-056 — moteur de la vue 3D : WebGL2 par défaut, repli WebGPU → WebGL2 déclaré > WebGPU demandé sans n… |
| TR-EX-056 | `packages/atelier-model/src/studio/accelerations.test.ts` | TR-EX-056 / F.1-01 — blocage d'un remplacement de moteur sans preuve > moteur par défaut : SVG (planche, DEC-08) et WebGL2 (vue 3D) ; tout défaut différent de la référence sans rapport qualifiant fait échouer ce test ; TR-EX-056 / F.1-01 —… |
| TR-EX-056 | `apps/web/e2e/studio-rend.mjs` | TR-EX-056 : rendu à la demande sur S4 — aucune trame pendant 1,5 s de repos, des trames pendant l'orbite, aucune après ; TR-EX-056 : WebGPU demandé → repli WebGL2 déclaré, avec la raison constatée dans ce navigateur |
| TR-EX-062 | `packages/geometry-exact/src/index.test.ts` | TR-EX-062 : allocations WebAssembly mesurées — mémoire linéaire du noyau relevée après chaque calcul, croissante, jamais nulle |
| TR-EX-062 | `apps/web/e2e/studio-exact.mjs` | TR-EX-062 : allocations WASM — mémoire linéaire du noyau (WebAssembly.Memory) relevée après le calcul, multiple de 64 Kio, enregistrée en PERF-07 ; TR-EX-062 : après les cycles, le noyau calcule toujours (même instance) |
| TR-EX-063 | `apps/web/src/modules/studio/workers/validation-messages.test.ts` | chaque traitement du Worker de Studio a son validateur, et une nature sans validateur est refusée ; cas positif : le vrai Worker rend le maillage 3D et le métré, acceptés par la validation et identiques au calcul direct ; message bien form… |
| TR-EX-065 | `packages/atelier-model/src/studio/studio-invariants.test.ts` | TEST-027 [+] modifier le rectangle dessiné (2 × 1 → 3 × 1) fait passer l'écart signé de 0 à +1 m² ; l'exigence n'est pas réécrite |
| TR-EX-065 | `apps/web/e2e/studio-exigences.mjs` | TEST-027 : exigence identique après la modification du dessin (même version, mêmes valeurs) ; TEST-027 : écart calculé et visible (mesure 11,6 m³ contre ≤ 10 m³, +1,6) |
| TR-EX-068 | `packages/atelier-model/src/studio/conclusions-controle.test.ts` | EX-068 [+] un contrôle exécuté conclut conforme, non conforme, non testé ou non applicable justifié ; EX-068 [+] la justification « non applicable » est vérifiable : exigence de la version examinée, motif, auteur, date ; EX-068 [−] en atte… |
| TR-EX-068 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | EX-068 [+] [−] API : contrôle conclu conforme / non conforme / non applicable justifié (justification vérifiée, auteur et version du serveur) ; justification invalide refusée |
| TR-EX-068 | `apps/web/e2e/studio-exigences.mjs` | EX-068 : non applicable justifié enregistré (motif, auteur et version posés par le serveur), le reste conclu normalement ; EX-068 : conclusion normative et justification affichées ; EX-068 : justification visant une exigence absente de la … |
| TR-EX-071 | `packages/atelier-model/src/studio/agents/agents.test.ts` | TR-EX-071 [+] la provenance porte révision, caméra, paramètres, auteur, date, empreintes ; l'IA externe y ajoute fournisseur, version « inconnue », sources envoyées, consentement, coûts et quotas ; TR-EX-071 [−] appel externe sans autorisa… |
| TR-EX-071 | `apps/api/src/routes/studio-illustrations.test.ts` | TR-EX-094 [+] TR-EX-071 [+] politique, consentement au coût déclaré et clé fournie : un seul appel au double, provenance avec fournisseur, version « inconnue », source envoyée, consentement, coûts, quotas et reproductibilité non garantie ;… |
| TR-EX-071 | `packages/atelier-model/src/studio/scenes/scenes.test.ts` | EX-071 [+] le rendu conserve son auteur, ses paramètres et l'empreinte du document quand elle est disponible ; EX-071 [−] sans auteur, le rendu est refusé (jamais d'auteur inventé) ; empreinte ou paramètres illisibles refusés |
| TR-EX-074 | `packages/atelier-model/src/studio/chaine-documentaire.test.ts` | EX-074 [+] un dossier assemblé de feuilles se publie : rôles distincts (vue, feuille à format et échelle déclarés, dossier), empreintes propres ; EX-074 [−] une planche d'édition présentée comme feuille publiée est refusée ; une feuille sa… |
| TR-EX-074 | `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts` | EX-074 [+] contenu « dossier-conception » : PDF et JSON du dossier, pièces ordonnées avec origine, présentation et sources distinctes ; EX-074 [−] un dossier sans contenu « dossier-conception » (ou l'inverse) est refusé |
| TR-EX-074 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | EX-074 [+] API : un dossier de conception se publie (revue, approbation, diffusion) ; paquet PDF + JSON, manifeste avec dossier et pièces |
| TR-EX-075 | `packages/atelier-model/src/studio/vues-coupe.test.ts` | EX-075 [+] conserve révision source, niveau et repère, cadrage, échelle, visibilité, styles et annotations propres ; EX-075 [+] R12 → R13 : la vue dérivée devient périmée ; rebasée, elle garde cadrage, styles et annotations ; EX-075 [−] an… |
| TR-EX-075 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | EX-075 [+] API : la vue enregistrée garde révision, niveau, cadrage, échelle, styles et annotations ; périmée après une nouvelle révision, rebasée explicitement ; EX-075 [−] API : modifier une annotation de la vue n'écrit aucune révision n… |
| TR-EX-075 | `apps/web/e2e/studio-pub.mjs` | EX-075 : vue dérivée périmée après modification du modèle ; EX-075 : vue rebasée explicitement (définition conservée) |
| TR-EX-076 | `packages/atelier-model/src/studio/chaine-documentaire.test.ts` | EX-076 [+] détail 2D autonome et coupe de maquette publiés ensemble, chacun avec sa source distincte ; EX-076 [−] le détail indépendant annoncé « synchronisé » avec la maquette sans association : présentation refusée |
| TR-EX-076 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | EX-076 [+] [−] API : détail 2D et coupe de maquette publiés ensemble avec sources distinctes ; le détail annoncé « synchronisé » sans association est refusé (409 piece_refusee) |
| TR-EX-076 | `apps/web/e2e/studio-pub.mjs` | EX-076 [−] : détail 2D annoncé synchronisé sans association refusé (409 piece_refusee) |
| TR-EX-077 | `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts` | EX-077 [+] précision interne pleine, arrondi de présentation déclaré séparé ; exclusions (cote, grandeur non évaluée) listées avec motif ; identité stable ; IF-008 [−] ajustement manuel sans motif, sans auteur ou d'une unité incohérente : … |
| TR-EX-077 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | IF-008 [+] API : chaque quantité porte quantityId, sourceRevisionSet, ruleId / ruleVersion, objets, unité, valeur brute, affichage et actualité |
| TR-EX-078 | `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts` | EX-078 [+] quantités homogènes : brut, déductions, net, non testées et corrections manuelles distingués ; EX-078 [−] révisions hétérogènes (jeux de sources distincts) : signalé, aucun total produit ; EX-078 [−] règles incompatibles (autre … |
| TR-EX-080 | `packages/atelier-model/src/studio/reperes-echanges.test.ts` | EX-080 [+] import DXF en millimètres : repère WCS du fichier vers local-2d en mètres, facteur exact, sans translation ni rotation, Z ignoré ; EX-080 [−] unité inconnue : le repère source garde une unité nulle, aucun facteur n'est substitué… |
| TR-EX-084 | `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts` | EX-084 [+] l'observation a sa propre identité (issueId) distincte de la note qui la porte (noteId), reliées ; EX-084 [−] une proposition (même de clôture ou de dérogation), une tâche faite ou un commentaire ne résolvent pas l'observation ;… |
| TR-EX-098 | `packages/atelier-model/src/studio/accelerations.test.ts` | F.1-01 — une accélération n'est activée qu'après preuve du gain ET de la non-régression > EX-098 (cas négatif) : gain p95 avec accrochage ou sélection différents hors tolérance → accélération rejetée ; F.1-01 — une accélération n'est activ… |
| TR-EX-098 | `apps/web/src/modules/studio/workers/chemins-optimises.test.ts` | REC-C-01 — chemins optimisés et chemin direct : mêmes cotes, mêmes exports SVG / DXF / IFC > brouillon incrémental (commande par commande) et frontière du Worker : exports identiques octet pour octet, cotes identiques ; REC-C-01 — chemins … |
| TR-EX-098 | `apps/web/e2e/studio-rend.mjs` | TR-EX-098 : index spatial — gain p95 mesuré ET mêmes cibles d'accrochage / même sélection, jugé par la règle ; F.1-01 / TR-EX-098 : rapport réel SVG / Canvas mesuré ici et jugé par la règle — verdict rendu avec ses motifs (gain ET non-régr… |
| TR-INV-009 | `apps/api/src/routes/studio-profils-import.test.ts` | INV-009 : un lecteur importe un profil qui montre la Ligne — préférences changées, mais ni données, ni droits, ni révision : ses commandes restent refusées |
| TR-INV-009 | `apps/web/e2e/studio-out.mjs` | TR-INV-009 : le catalogue autorisé de l'éditeur est inchangé — Publier toujours refusé |
| TR-IF-005 | `apps/web/src/modules/studio/chargement/cycle-activation.test.ts` | cas positif : découvert → vérification → résolution → chargement → initialisation → prêt → actif, puis suspendu, repris et désactivé ; cas négatifs : incompatible et permission refusée arrêtent à la vérification — rien n'est chargé, l'outi… |
| TR-IF-007 | `apps/web/src/modules/studio/taches/statuts-if007.test.ts` | cas positif : queued → loading → running → completed, chaque statut tracé avec sa révision source, résultat remis une fois ; loading passe à running à la première progression ; sans chargement annoncé, la tâche démarre directement en runni… |
| TR-IF-008 | `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts` | IF-008 [+] la quantité du mur porte quantityId, sourceRevisionSet, ruleId / ruleVersion, sourceObjectIds, unit, rawValue, deductions, displayValue, freshnessStatus ; IF-008 [+] freshnessStatus : à jour sur la tête, périmée après une nouvel… |
| TR-IF-008 | `apps/api/src/lib/studio-quantites.test.ts` | IF-008 [+] l'ajustement en vigueur est porté à part (motif, auteur, date), rawValue intacte, freshnessStatus contre la tête ; IF-008 [−] un ajustement dont la cible a changé (à revoir) n'est pas porté comme correction : la valeur calculée … |
| TR-IF-008 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | IF-008 [+] API : chaque quantité porte quantityId, sourceRevisionSet, ruleId / ruleVersion, objets, unité, valeur brute, affichage et actualité |
| TR-IF-009 | `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts` | IF-009 [+] le manifeste porte usage, documents ordonnés et empreintes, sources (modèles), règles, rapports de contrôle et observations bloquantes résolues ; IF-009 [−] observation bloquante ni résolue ni dérogée : soumission, approbation e… |
| TR-IF-009 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | IF-009 [−] API : observation bloquante ouverte → soumission refusée (409 blocking_observation_open) ; dérogée par décision du propriétaire → manifeste à actualiser, puis soumission admise |
| TR-IF-009 | `apps/web/e2e/studio-pub.mjs` | IF-009 : publication dérogée approuvée puis diffusée |
| TR-IF-010 | `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts` | IF-010 [+] export BCF 2.1 relu à l'identique : Guid stable, catégorie, gravité, statut, objets, commentaires ; IF-010 [+] import : sujets nouveaux créés, objets inconnus conservés comme références ; IF-010 [−] même BCF-ID reçu dans un autr… |
| TR-IF-010 | `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts` | IF-010 [+] l'observation garde issueId, catégorie, source du contrôle, révisions, objets, vue, auteur, gravité, description, pièces, responsable, état, décisions, recontrôles, clôture et références BCF ; IF-010 [+] catégorie, gravité et pi… |
| TR-IF-010 | `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | IF-010 [+] API : l'observation porte issueId distinct, catégorie, gravité et pièce justificative téléchargeable, vérifiée par empreinte ; IF-010 [−] API : même BCF-ID reçu dans un autre contexte → observation distincte ; même contexte → re… |
| TR-IF-010 | `apps/web/src/modules/collaboration/commandes-collaboration.test.ts` | Lot PUB (IF-010) : exporter et importer en BCF — Ctrl+Alt+Maj+Y, I, dans la barre du panneau Observations |
| TR-IF-010 | `apps/web/e2e/studio-pub.mjs` | IF-010 : export BCF (.bcfzip) servi |
| TR-AC-006 | `apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts` | plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée |
| TR-AC-006 | `apps/web/e2e/studio-exact.mjs` | TEST-015 : pas de corruption — document identique (empreinte de contenu), aucune commande en attente ; TEST-015 : relance après retour au binaire distribué — prêt, une instance |

### 2.3 Recettes Studio présentes mais non branchées en CI (0)

Aucune : chaque `apps/web/e2e/studio-*.mjs` est une étape nommée de la CI ou lancée par un script qu’elle exécute.
