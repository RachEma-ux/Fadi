# État des contrôles Studio — exécutés et absents

> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre ; la CI (workflow
> « Continuité de développement ») le recalcule à chaque commit et échoue s’il diffère : il est donc tenu au HEAD testé.
> Registre lu : `docs/workstreams/studio/task-register.json`, SHA-256 `ad5fb84ab8cada885e05eb81074182ed09f38eb7289889418a2ce14d85716bee`.

**Une CI verte n’est pas une couverture exhaustive** (X.4-03) : elle prouve seulement que les contrôles listés en partie 1
ont réussi aux exécutions citées. Les scénarios de la partie 2 ne sont pas couverts, quel que soit l’état de la CI.

## Répartition des 630 obligations (statut / état des tests)

| Statut / tests | Nombre |
|---|---:|
| Accepté / Non applicable | 2 |
| Accepté / Non exécuté | 57 |
| Bloqué / Non exécuté | 9 |
| En cours / Non exécuté | 12 |
| Implémenté / Non exécuté | 1 |
| Vérifié / Exécuté | 427 |
| Vérifié / Non applicable | 93 |
| À faire / Non exécuté | 29 |

## 1. Contrôles effectivement exécutés

Preuves étiquetées « scénario exécuté » (G2-04) : chacune cite le commit, l’exécution GitHub Actions (ou la trace versionnée),
la date et l’environnement de l’étape qui a réussi.

| Fichier ou trace | Étape de CI qui l’exécute | Libellés exécutés | Obligations | Exécutions citées | Première date citée | Dernière date citée |
|---|---|---:|---:|---:|---|---|
| `.github/workflows/ci.yml` | voir la preuve | 0 | 2 | 1 | 2026-10-25 13:28 | 2026-10-25 13:28 |
| `apps/api/src/lib/studio-dossiers-regles.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/lib/studio-exigences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 4 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/api/src/lib/studio-export-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 06:26 | 2026-10-26 06:26 |
| `apps/api/src/lib/studio-modeles-externes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/lib/studio-observations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `apps/api/src/lib/studio-preferences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/lib/studio-publication-statuts.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 4 | 1 | 2026-10-19 08:08 | 2026-10-19 08:08 |
| `apps/api/src/lib/studio-quantites.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/routes/studio-agents.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 6 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-cmd.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 11 | 7 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-delegations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-derivation-copie.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-export-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 06:26 | 2026-10-26 06:26 |
| `apps/api/src/routes/studio-g2.preuves-g2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 4 | 1 | 2026-10-26 06:26 | 2026-10-26 06:26 |
| `apps/api/src/routes/studio-illustrations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 9 | 8 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/routes/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/routes/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 27 | 3 | 2026-10-19 14:33 | 2026-10-25 16:17 |
| `apps/api/src/routes/studio-observations-rapprochement.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 3 | 1 | 2026-10-25 20:25 | 2026-10-25 20:25 |
| `apps/api/src/routes/studio-permissions.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 2 | 2026-10-19 14:33 | 2026-10-19 20:40 |
| `apps/api/src/routes/studio-profils-import.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 4 | 2 | 2026-10-26 04:45 | 2026-10-26 06:26 |
| `apps/api/src/routes/studio-profils.preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/routes/studio-pub.preuves-pub.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 10 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/routes/studio-quotas.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 04:45 | 2026-10-26 04:45 |
| `apps/api/src/routes/studio-taches-projets.preuves-bloc02.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 6 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
| `apps/api/src/routes/studio.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/coex-inventaire.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/testing/livrables-lot-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-26 03:21 | 2026-10-26 03:21 |
| `apps/api/src/testing/regressions-pertinentes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 1 | 1 | 2026-10-26 06:26 | 2026-10-26 06:26 |
| `apps/api/src/testing/revue-g1.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 3 | 1 | 2026-10-25 22:48 | 2026-10-25 22:48 |
| `apps/api/src/testing/studio-comptes.preuves-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:58 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-contrat-commandes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 14 | 12 | 2 | 2026-10-19 12:39 | 2026-10-25 21:58 |
| `apps/api/src/testing/studio-ecritures-architecture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
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
| `apps/web/e2e/studio-conflits.mjs` | Recette du contrat de commandes Studio — deux comptes, aperçu annulé, conflit signalé et … | 17 | 19 | 3 | 2026-10-19 12:43 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-corpus-references.mjs` | Références visuelles des corpus S1–S7 — planche 2D et vue 3D comparées aux captures versi… | 2 | 1 | 1 | 2026-10-26 06:21 | 2026-10-26 06:21 |
| `apps/web/e2e/studio-corpus-s6.mjs` | Recette du corpus S6 — étude à variantes et révisions créée par l'API, têtes, dossier et … | 2 | 2 | 1 | 2026-10-19 14:40 | 2026-10-19 14:40 |
| `apps/web/e2e/studio-corpus-s7.mjs` | Recette du corpus S7 — session hors réseau puis reconnectée sur le corpus de départ, une … | 3 | 1 | 1 | 2026-10-26 06:21 | 2026-10-26 06:21 |
| `apps/web/e2e/studio-dec.mjs` | Décisions P-12 — copie indépendante, tolérances, alternatives clavier, journal d'accès, r… | 19 | 6 | 1 | 2026-10-26 03:17 | 2026-10-26 03:17 |
| `apps/web/e2e/studio-domaines.mjs` | Recette des domaines Studio — quatre domaines de la référence, planches seulement dans De… | 14 | 10 | 4 | 2026-10-19 14:39 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-dossier.mjs` | Recette de la production documentaire Studio — TEST-001 (dessin 2D publié sans 3D), feuil… | 30 | 20 | 3 | 2026-10-19 12:44 | 2026-10-25 22:08 |
| `apps/web/e2e/studio-echanges.mjs` | Recette de la matrice d'échanges Studio — commande Q, entrées livrées et reportées, couve… | 16 | 10 | 3 | 2026-10-19 14:41 | 2026-10-26 06:25 |
| `apps/web/e2e/studio-espace.mjs` | Recette de l'espace de travail Studio — accueil sans redirection, barre des domaines pers… | 3 | 3 | 1 | 2026-10-19 20:47 | 2026-10-19 20:47 |
| `apps/web/e2e/studio-exact.mjs` | Recette du noyau exact Studio — booléens exacts chargés à la demande, aperçu provisoire, … | 11 | 12 | 2 | 2026-10-25 21:21 | 2026-10-26 04:44 |
| `apps/web/e2e/studio-exigences.mjs` | Recette des exigences Studio — écarts affichés, exigence inchangée (TR-EX-065, apps/web/e… | 6 | 6 | 1 | 2026-10-26 04:38 | 2026-10-26 04:38 |
| `apps/web/e2e/studio-faces.mjs` | Recette de la géométrie 3D Studio — édition des faces, direction d'extrusion, profil sour… | 18 | 14 | 1 | 2026-10-25 19:58 | 2026-10-25 19:58 |
| `apps/web/e2e/studio-g1.mjs` | Lot G1 — parcours du dessin au dossier publié, états dérivés des contenus, association mu… | 32 | 5 | 1 | 2026-10-26 06:24 | 2026-10-26 06:24 |
| `apps/web/e2e/studio-g2.mjs` | Lot G2 — échelle d'accès, accrochage ambigu, cote de face 3D, Approuver par rôle, envelop… | 22 | 6 | 1 | 2026-10-26 06:24 | 2026-10-26 06:24 |
| `apps/web/e2e/studio-g4.mjs` | Mesures et qualité Studio (lot G4) — vingt outils froid / chaud comparés à la référence v… | 8 | 5 | 1 | 2026-10-26 06:23 | 2026-10-26 06:23 |
| `apps/web/e2e/studio-hors-ligne.mjs` | Recette Studio hors ligne — brouillon conservé au rechargement, rejeu des enveloppes (mêm… | 15 | 6 | 4 | 2026-10-19 06:50 | 2026-10-26 06:21 |
| `apps/web/e2e/studio-lot-f.mjs` | Lot F — illustrations depuis la vue, agents MCP sous confirmation humaine, extensions (ap… | 14 | 9 | 1 | 2026-10-26 03:17 | 2026-10-26 03:17 |
| `apps/web/e2e/studio-memoire.mjs` | Recette de mémoire Studio — 80 fermetures / réouvertures de la vue 3D, compteurs GPU, éco… | 4 | 4 | 1 | 2026-10-25 16:16 | 2026-10-25 16:16 |
| `apps/web/e2e/studio-navigation.mjs` | Recette de navigation Studio — enveloppe, étude, variantes, historique en lecture seule, … | 103 | 67 | 12 | 2026-10-18 23:02 | 2026-10-26 04:40 |
| `apps/web/e2e/studio-observations.mjs` | Recette des observations Studio — identité réemployée entre domaines, contexte, tâches, d… | 27 | 11 | 4 | 2026-10-19 12:43 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-out.mjs` | Lot OUT — profils d'outils, basculement et échelle 3D, édition de groupe (apps/web/e2e/st… | 14 | 5 | 1 | 2026-10-26 04:41 | 2026-10-26 04:41 |
| `apps/web/e2e/studio-persistance.mjs` | Recette Studio par l'API — étude, commandes, rejeu, conflits, droits, historique, puis ré… | 28 | 15 | 4 | 2026-10-18 21:30 | 2026-10-25 22:03 |
| `apps/web/e2e/studio-preuves-a.mjs` | Preuves Studio, groupe A — mise à jour du service worker pendant que des commandes attend… | 6 | 2 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-b.mjs` | Preuves Studio, groupe B — profils, catalogue et dépendances, service worker, accrochage … | 21 | 6 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-c.mjs` | Preuves Studio, groupe C — approbation et diffusion hors connexion jamais affichées acqui… | 6 | 1 | 1 | 2026-10-25 21:54 | 2026-10-25 21:54 |
| `apps/web/e2e/studio-preuves-d1.mjs` | Preuves Studio, groupe D1 — intégration Fadi / Studio, plein écran, parcours A, B, C, inv… | 72 | 10 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-d2.mjs` | Preuves Studio, groupe D2 — publication diffusée figée par la base, actions hors connexio… | 13 | 2 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-preuves-e.mjs` | Preuves Studio, groupe E — étapes intactes, publication figée, corps trop grand (413), ré… | 21 | 6 | 1 | 2026-10-25 21:55 | 2026-10-25 21:55 |
| `apps/web/e2e/studio-profils.mjs` | Recette des profils et favoris d'outils Studio — API (aller-retour, refus, droits) et éto… | 14 | 9 | 2 | 2026-10-19 06:50 | 2026-10-25 16:15 |
| `apps/web/e2e/studio-pub.mjs` | Lot PUB — observations, manifeste, dossier de conception, vues de coupe, quantités, BCF, … | 6 | 6 | 1 | 2026-10-26 04:39 | 2026-10-26 04:39 |
| `apps/web/e2e/studio-publication.mjs` | Recette des publications Studio — cycle, approbation liée, approbation périmée 409, paque… | 24 | 16 | 4 | 2026-10-19 06:50 | 2026-10-25 22:05 |
| `apps/web/e2e/studio-quantites.mjs` | Recette du métré Studio — ajustements enregistrés et versionnés, rechargement, « à revoir… | 4 | 1 | 1 | 2026-10-19 10:48 | 2026-10-19 10:48 |
| `apps/web/e2e/studio-rend.mjs` | Lot REND — graphismes, repères, provenance des sources, moteurs qualifiés, mesures (apps/… | 21 | 10 | 1 | 2026-10-26 04:40 | 2026-10-26 04:40 |
| `apps/web/e2e/studio-rendu.mjs` | Recette du rendu Studio — dégradation sûre de la vue 3D sous charge, types 3D avancés non… | 6 | 4 | 2 | 2026-10-25 20:25 | 2026-10-25 21:21 |
| `apps/web/e2e/studio-restauration.mjs` | Recette de restauration Studio — archive JSON vers une base neuve, comparaison avant / ap… | 6 | 7 | 3 | 2026-10-19 08:14 | 2026-10-25 13:26 |
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
| `apps/web/src/modules/studio/exact/booleen-session.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/exact/client-exact.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/exact/licence-occt.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `apps/web/src/modules/studio/exact/specification-redemarrage.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
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
| `apps/web/src/modules/studio/planche2d/ambiguites.preuves-g2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `apps/web/src/modules/studio/planche2d/architecture/architecture-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
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
| `apps/web/src/modules/studio/planche2d/regle-or.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 3 | 2 | 2026-10-18 22:56 | 2026-10-18 23:34 |
| `apps/web/src/modules/studio/planche2d/rendus/comparaison-moteurs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 2 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `apps/web/src/modules/studio/poc/poc-corpus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `apps/web/src/modules/studio/publication/approbation-commande.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `apps/web/src/modules/studio/publication/publication-ui.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 3 | 1 | 2026-10-19 08:07 | 2026-10-19 08:07 |
| `apps/web/src/modules/studio/routes-studio.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 2 | 2026-10-18 22:56 | 2026-10-19 14:33 |
| `apps/web/src/modules/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 5 | 2 | 2026-10-19 14:33 | 2026-10-25 13:26 |
| `apps/web/src/modules/studio/taches/etats-contenus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
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
| `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 2 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `apps/web/src/modules/studio/vue3d/cotes-faces.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
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
| `packages/atelier-model/src/studio/agents/agents.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 15 | 11 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/annotations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 06:45 | 2026-10-19 06:45 |
| `packages/atelier-model/src/studio/architecture/architecture.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 10 | 2 | 2026-10-19 06:45 | 2026-10-25 13:26 |
| `packages/atelier-model/src/studio/architecture/echelle.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 1 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/chaine-documentaire.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/cmd/cmd.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 14 | 7 | 2 | 2026-10-26 03:10 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/cmd/migration.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/compatibilite-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/composition/basculement.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 11 | 1 | 2026-10-25 19:50 | 2026-10-25 19:50 |
| `packages/atelier-model/src/studio/conclusions-controle.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/copie-independante.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 2 | 1 | 2026-10-26 03:10 | 2026-10-26 03:10 |
| `packages/atelier-model/src/studio/corpus/corpus.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 5 | 3 | 2026-10-19 14:33 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/couverture-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/document-2d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 4 | 2 | 2026-10-18 21:27 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/dossier-conception.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-19 12:39 | 2026-10-19 12:39 |
| `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/echanges/matrice-echanges.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 4 | 2 | 2026-10-19 14:33 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `packages/atelier-model/src/studio/echanges/rapport-fidelite.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/exigences/exigences.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 3 | 2 | 2026-10-19 08:07 | 2026-10-19 08:46 |
| `packages/atelier-model/src/studio/export-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/f2-booleen.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 4 | 1 | 2026-10-25 21:11 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/graphismes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/history.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 2 | 1 | 2026-10-18 22:56 | 2026-10-18 22:56 |
| `packages/atelier-model/src/studio/identite-bim.preuves-e.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 5 | 1 | 2026-10-25 20:16 | 2026-10-25 20:16 |
| `packages/atelier-model/src/studio/manifeste-outils.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 7 | 2 | 2026-10-19 12:39 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/mesh-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 1 | 2026-10-18 23:43 | 2026-10-18 23:43 |
| `packages/atelier-model/src/studio/mesures/mesures.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 16 | 5 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 8 | 1 | 1 | 2026-10-26 06:14 | 2026-10-26 06:14 |
| `packages/atelier-model/src/studio/objets-3d/objets-3d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 5 | 2 | 2026-10-19 06:45 | 2026-10-25 21:11 |
| `packages/atelier-model/src/studio/planche-2d.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 3 | 1 | 2026-10-18 22:56 | 2026-10-18 22:56 |
| `packages/atelier-model/src/studio/preuves-b.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 2 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/projections.preuves-a.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/projections.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 12 | 5 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `packages/atelier-model/src/studio/quantites-ajustements.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 1 | 1 | 2026-10-19 10:41 | 2026-10-19 10:41 |
| `packages/atelier-model/src/studio/reperes-echanges.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/reperes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 3 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/scenes/scenes.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 6 | 3 | 2026-10-19 08:07 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/sources/sources.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/atelier-model/src/studio/studio-invariants.preuves-d2.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 1 | 3 | 1 | 2026-10-25 21:49 | 2026-10-25 21:49 |
| `packages/atelier-model/src/studio/studio-invariants.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 18 | 23 | 3 | 2026-10-19 14:33 | 2026-10-25 16:08 |
| `packages/atelier-model/src/studio/vues-coupe.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-26 04:35 | 2026-10-26 04:35 |
| `packages/geometry-exact/src/index.test.ts` | suite Vitest / node --test du job validate ou du workflow cité | 3 | 2 | 2 | 2026-10-26 04:35 | 2026-10-26 06:14 |
| `scripts/check-frontieres.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 4 | 1 | 1 | 2026-10-19 08:05 | 2026-10-19 08:05 |
| `scripts/migration/migration-lib.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 5 | 5 | 2 | 2026-10-19 14:38 | 2026-10-25 21:52 |
| `scripts/migration/recette-simulation.mjs` | voir la preuve | 3 | 4 | 1 | 2026-10-19 14:38 | 2026-10-19 14:38 |
| `scripts/registre/controle-pr.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 7 | 7 | 1 | 2026-10-26 04:31 | 2026-10-26 04:31 |
| `scripts/registre/controle-preuves.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 5 | 1 | 2026-10-26 03:05 | 2026-10-26 03:05 |
| `scripts/registre/controles-suivi.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 10 | 11 | 2 | 2026-10-26 03:06 | 2026-10-26 06:09 |
| `scripts/securite/analyse-secrets.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 1 | 1 | 2026-10-26 03:05 | 2026-10-26 03:05 |
| `scripts/validation/porte-g4.test.mjs` | suite Vitest / node --test du job validate ou du workflow cité | 6 | 2 | 1 | 2026-10-26 03:06 | 2026-10-26 03:06 |

Total : 226 fichiers ou traces, 1554 libellés exécutés.

## 2. Scénarios absents ou incomplets

### 2.1 Obligations de recette ouvertes (7)

Obligations TEST, NAV, REC, TR et E2E qui ne sont ni « Vérifié » ni « Accepté » : leur scénario n’est pas (entièrement) couvert.

| ID | Statut | Tests | Ce qui manque (suite du registre) |
|---|---|---|---|
| REC-B-01 | À faire | Non exécuté | Toutes les obligations citées (TEST-016 à 021, TEST-036, TR-AC-002) sont Vérifiées avec preuve exécutée ; la comparaison requêtes / octets / chunks / mémoire, cache froid et chaud, se fait contre une référence versionnée (révision 1, lot G… |
| REC-C-02 | À faire | Non exécuté | Toutes les obligations citées ont des preuves exécutées au dépôt (TEST-022 à 025, TR-AC-004 : cas ambigus tracés et résolus, TR-AC-005 : comparaisons avant / après). Reste EXTERNE : l'évaluation des profils GPU sur appareil réel (aucun GPU… |
| REC-E-03 | À faire | Non exécuté | Scénario enchaîné vérifié (base simulée simplifiée : pas d'orderBy/limit ; cycle complet sur base réelle dans studio-pub.mjs). La recette d'usage des trois parcours par le maître d'ouvrage est EXTERNE (acte du maître d'ouvrage). |
| REC-I-01 | À faire | Non exécuté | Point 2 du 25 octobre 2026 (décision requise) : Aucune « maquette d'interaction » n'existe ni n'a été validée ; la validation relève d'une recette utilisateur / décision du maître d'ouvrage (R.3-01). Aucun test ne la remplace. |
| TR-AC-011 | En cours | Non exécuté | Préparé (fiches-outils.ts) : forme du build désigné (FORME_BUILD_DESIGNE : commit 40 hex + sha256 de l'artefact), profils de charge que le dépôt sait exécuter (PROFILS_CHARGE_CANDIDATS : profil de vingt outils sur Chromium bureau / télépho… |
| TR-EX-046 | Implémenté | Non exécuté | Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| TR-EX-059 | En cours | Non exécuté | Point (1) fait : booléen exact lourd (union de deux prismes en étoile de 320 sommets, 2,2–3,8 s dans le Worker OCCT) mesuré : trame max ≈ 50–67 ms, 14–20 interactions pendant le calcul, max 80–112 ms (< 200 ms) ; contre-épreuve « bloque » … |

### 2.2 Tests prescrits non exécutés (5)

| ID | Fichier | Libellés |
|---|---|---|
| E.5-04 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| F.2-02 | `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` | F.2-03 [+] trois types annoncés ; l'illustration contrainte est disponible avec son déclencheur (honnêtement décrite : locale sans IA par défaut, jamais de mutation) ; l'exploration libre reste indisponible sans bouton ; un seul bouton d'e… |
| TR-EX-046 | `apps/api/src/lib/studio-journal-acces.test.ts` | TR-EX-046 [+] conservation de 12 mois par défaut, paramétrable par STUDIO_ACCESS_RETENTION_MONTHS (1 à 120), limite en mois civils ; TR-EX-046 [+] purge datée : supprime seulement les événements antérieurs à la limite, puis date la purge (… |
| TR-EX-046 | `apps/api/src/routes/studio-journal-acces.test.ts` | TR-EX-046 [+] base réelle : un refus et un export Studio sont journalisés sans IP ni courriel ; la purge supprime au-delà de 12 mois, garde le reste et se date ; TR-EX-046 [−] base réelle : une ligne du journal d'accès n'est jamais modifié… |
| TR-EX-046 | `apps/web/e2e/studio-dec.mjs` | TR-EX-046 : le refus et l'export sont journalisés, route générique, statut et genre ; TR-EX-046 : minimisation — ni courriel, ni adresse IP, ni identifiant d'étude dans le journal |

### 2.3 Recettes Studio présentes mais non branchées en CI (0)

Aucune : chaque `apps/web/e2e/studio-*.mjs` est une étape nommée de la CI ou lancée par un script qu’elle exécute.
