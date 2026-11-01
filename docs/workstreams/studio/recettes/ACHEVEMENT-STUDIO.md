# Achèvement de Studio — réconciliation et suivi — 25 octobre 2026

Mandat du maître d'ouvrage du 25 octobre 2026 : achever Studio jusqu'à une livraison vérifiée, sous la délégation consignée en [ADR-STUDIO-PILOTE-01](../../../continuity/decisions/ADR-STUDIO-PILOTE-01.md) P-12.

## Réconciliation des chiffres

Le bilan précédent annonçait **425 obligations closes sur 630**, soit **205 restantes**. Ses catégories n'en détaillaient que 120 : les restes du point 2. Les 86 autres venaient du rapprochement du 25 octobre et n'étaient pas reprises dans ce compte rendu.

| Origine | Nombre |
|---|---:|
| Point 2 : fonctions absentes | 49 |
| Point 2 : décisions | 35 |
| Point 2 : partielles | 24 |
| Point 2 : mesures | 9 |
| Point 2 : preuves documentaires non retenues | 2 |
| Point 2 : sous-total | 119 |
| Rapprochement : mesures (migration, estimation, risques, jalons) | 29 |
| Rapprochement : suivi continu (SUIVI, PR, ARC-08, BLOC-07) | 16 |
| Rapprochement : production (R.*, J7, J8, OPS) | 16 |
| Rapprochement : non couvert (lot F, extensions) | 7 |
| Rapprochement : hors pilote (lot F) | 5 |
| Rapprochement : décisions (G2-05, G4-03, PASS-03, PASS-04) | 4 |
| Rapprochement : partiel (TEST-033) | 1 |
| Restes des lots F1 et F2 et de G4 | 8 |
| **Total** | **205** |

Le sous-total du point 2 est de 119 et non de 120 : l'une des 50 « fonctions absentes » a été vérifiée depuis, par un lot suivant (G1, BLOC-02).

## Plan d'exécution

Les obligations sont reprises par lots cohérents. Un lot est inscrit au registre seulement après sa fusion, CI verte, avec ses preuves :

| Lot | Contenu |
|---|---|
| PUB | publications, dossiers, coupes, quantités, observations, manifeste |
| CMD | commandes, révisions, états dérivés, migration du schéma, tâches serveur, bascule |
| OUT | outils, profils, chargement, Workers, caches, quotas, instanciation |
| REND | repères, rendu 2D avancé, renderer alternatif sous garde, mesures |
| F | illustration (fournisseur local, fournisseur externe sous politique), adaptateur MCP, extensions |
| API | contrats versionnés des 48 routes |
| REG | contrôles du registre et du suivi, analyse de secrets, corpus S1 à S7 |
| Décisions courantes | P-12 |

## État au moment de ce document

193 obligations ouvertes après la requalification par dépendances et les décisions P-12. Elles sont suivies au registre. Leur état exact est recalculé à chaque lot dans les checkpoints `STATUS.md` et `HANDOFF.md`.

## Lot API — contrats versionnés (réserve G1 levée)

Les 79 routes de l'API Studio portent chacune un contrat versionné `studio-api-<nom>/<n>` (77 contrats).

**Mécanisme**
- La version est renvoyée dans l'en-tête `X-Studio-Contrat`, en succès comme en refus.
- Le schéma zod de réponse est strict et vérifié par test.
- Une version demandée incompatible est refusée (400 `contrat_incompatible`), sans écriture.
- Une route sans contrat fait échouer les tests.

**Preuves**
- `apps/api/src/routes/studio-contrats.test.ts` (89 tests) ;
- `apps/api/src/testing/studio-contrats.test.ts` ;
- recette `studio-contrats-api` (CI) ;
- `docs/studio/CONTRATS-API.md`, généré.

Le relevé de performance porte le schéma `studio-releve-perf/1`. La revue G1-03 compte 79/79 routes et 21/21 formats à
contrat versionné : la réserve « 48 routes non versionnées » de P-11 est levée.

**Décisions du lot**
- Un identifiant par route, pour l'entrée et la réponse.
- La version passe par un en-tête, sur le modèle de `X-Studio-Revision`.
- Règle d'évolution : un champ facultatif ajouté garde la version ; retirer, renommer ou changer un type impose `/2`.

## Lot REG — outillage du registre et protocole de PR

**Ce qui est livré**
- Règles de preuve `docs/ai-team/controle_preuves.py` (X.5-02, G2-04, PR-07, PR-08, BLOC-07), en CI (`continuity.yml`) :
  un « Vérifié » ou « Accepté » exige une preuve étiquetée (`etiquette`), datée, versionnée (`commit`) et, pour un
  scénario exécuté, l'exécution GitHub Actions où l'étape qui joue le fichier a réussi.
- État « Implémenté » (code produit, preuve de succès pas encore suffisante), jamais compté dans P630.
- Outil `scripts/registre/completer_preuves.py` : 3 416 preuves complétées par des données réelles (exécutions de CI et
  commits retrouvés), aucune inventée ; REC-C-03 et PIL-01 passent en tests « Non applicable » (aucun test cité).
- Contrôles du suivi `scripts/registre/controles-suivi.mjs` (ARC-08, SUIVI-01/02/07/08/09, X.3-02 : 141 chaînes
  complètes) et documents d'état générés `docs/ai-team/reports/etat-studio/` (X.3-03, X.4-03, X.5-01).
- Analyse de secrets `scripts/securite/analyse-secrets.mjs` et workflow `securite-secrets.yml` (SUIVI-10).
- Protocole de PR `pr-protocole.yml` et `scripts/registre/controle-pr.mjs` (PR-01 à PR-06, PR-09), section
  « Unité de travail » du modèle de PR.
- POC G2 joués sur les corpus S1–S7 (G2-03, rapport `etat-studio/POC-CORPUS.md`) ; licence du corpus établie
  (`packages/atelier-model/src/studio/corpus/LICENCE.md`, X.1-03).

**Restent ouverts (verdict partiel)** : X.1-01/02/04/05/06/07 (éléments absents du corpus qui dépendent de fonctions du
modèle), X.1-08 (captures raster / 3D de référence sur banc autorisé), SUIVI-01 (branche orpheline
`automation/studio-checklist-daily` à supprimer par la première exécution du workflow corrigé ou par un détenteur du
droit de push ; le réglage « Allow GitHub Actions to create pull requests » est un acte d'administration).

**Décision P-13 (déléguée, réversible)** — nommage des branches de PR. Le protocole
(`docs/continuity/README.md`) dit « Nommage **conseillé** : `feat|fix|chore|docs/<issue>-<sujet>` » et « ne pas renommer
une branche historique ». Le contrôle PR-05 le traite donc en avertissement, jamais en refus : une branche imposée par
l'environnement d'exécution (session de travail) ou historique est signalée ; l'Issue propre liée (PR-01) reste exigée
dans tous les cas, et une branche qui suit le modèle doit lier son Issue. Conséquence : le contrôle reste bloquant sur le
fond (Issue, champs, preuves, revalidation) sans contredire le protocole. Réversible : passer l'avertissement en écart
dans `controlerPr`.

**Démarche de preuve à deux temps** : les obligations du lot sont d'abord inscrites « Implémenté » avec des preuves
« test prescrit » ; elles ne passent « Vérifié » qu'une fois l'exécution CI verte de la PR retrouvée par
`completer_preuves.py --reference HEAD --branche <branche>`.

## Lot DEC — décisions P-12 implémentées

**Ce qui est livré**
- **CAD-07** : inventaire COEX-01 contrôlé (22 composants, aucun « Retirer » ni « Remplacer », chemins existants).
- **ARC-03** : façade de contexte `modules/studio/contexte/facade-contexte.ts`, seule voie de `StudioShell` vers le compte
  et le projet ; règle de frontière dans `scripts/frontieres.json`.
- **ARC-05** : pureté du modèle Studio contrôlée (ni React, ni DOM, ni globaux du navigateur).
- **TR-EX-013 / TR-INV-003** : dérivation « copie indépendante » (`mode: "copie"`, identités réémises
  `<id>~<8 derniers caractères de la variante>`), en plus du mode « version », qui reste le défaut ; contrat
  `studio-api-variante-creer/1` étendu par un champ facultatif.
- **TR-IF-002** : tolérances des gestes déclarées (`STUDIO_TOLERANCES_GESTES` : ligne en saisie exacte, pointé 1e-9 m).
- **TR-EX-036** : une alternative sans pointeur par outil, panoramique au clavier, focus visible à la bascule 2D ⇄ 3D.
- **TR-EX-046** : journal d'accès minimisé `studio_access_events` (refus et exports, ajout seul), conservation 12 mois
  (`STUDIO_ACCESS_RETENTION_MONTHS`), purges datées ; le journal de publication n'est jamais purgé.
- **X.2-02** : acceptation d'exigence et invitations refusées sous le verrou d'un autre compte (423) et sur le projet de
  référence (403). Conséquence : le projet de référence (P.118 importé) ne se partage plus ; la recette `comptes-securite`
  travaille sur une copie.
- **MIG-COEX-04** : les montées de version locales v6 / v7 déplacent les données dans une `quarantaine` IndexedDB,
  consultable et exportable (Paramètres → « Données conservées par ce navigateur »).
- **X.2-04 / BLOC-06** : porte G4 automatisée `scripts/validation/porte-g4.mjs` (signalement à chaque commit, mode
  strict à la Release par `porte-g4-release.yml`) — voir [DOSSIER-G4](../DOSSIER-G4.md).

**Reste ouvert** : TR-INV-010 (dépend du lot F, non encore intégré).

Recette `apps/web/e2e/studio-dec.mjs` (27 contrôles) branchée en CI (lot « complements »). Les 12 obligations du lot sont
inscrites « Implémenté » jusqu'à l'exécution CI verte de la PR (démarche à deux temps du lot REG).

## Lot F — illustrations, agents MCP, extensions

**Ce qui est livré**
- Modèle pur `@parcours/atelier-model/studio-agents` : contrôle de politique avant tout transfert, fournisseur local
  déterministe « Illustration dérivée du rendu (locale, sans IA) », provenance et statut « non vérifiée » des
  illustrations, déclaration et évaluation d'extensions (signature Ed25519, aucun code chargé), protocole du serveur MCP.
- API : illustrations (image séparée, empreinte du document comparée avant et après : modèle inchangé), fournisseur externe
  désactivé par défaut (politique, coût déclaré, clé et consentement exigés ; aucun service payant appelé, aucune clé
  dans le dépôt), jetons et propositions d'agent, confirmation humaine seule écrivante (source `agent-mcp`), serveur MCP
  `POST /mcp/studio` et relais stdio ; 13 routes à contrat versionné.
- Interface : « Illustration depuis la vue » (Ctrl+Maj+F4) et « Agents (MCP) » (Ctrl+Maj+F9), chacune avec son icône.

**Restent partiels** : REC-E-01, REC-E-02, F.3-04 (volets d'autres lots). Réserves : TR-EX-071 (auteur absent de la
provenance du rendu exporté par le navigateur), F.3-03 (session en direct hors mesure).

## Lot CMD — commandes, révisions, migrations, bascule

**Ce qui est livré**
- Modèle pur `@parcours/atelier-model/studio-cmd` : effets d'une commande, états dérivés, migration
  `studio-document/1` → `/2` (liste `conserves` des données inconnues), simulation, essai, périmètre.
- API : effets consignés dans la transaction de la révision et notification après engagement ; essais à portée de
  révision (job serveur, confirmation distincte, 409 `essai_perime`) ; journal ; migrations accordées par le propriétaire
  avec retour arrière ; bascule Atelier → Studio (une chaîne d'écriture, 423 sous verrou) ; contexte d'étude
  `studio-contexte-etude/1` ; 17 routes à contrat versionné.
- Livrable REC-A-01 `docs/studio/LIVRABLES-LOT-A.md` (72 documents, 72 allers-retours exacts ; 215 données inconnues
  conservées et rapportées).
- **A.1-07** : la recette `studio-persistance.mjs` joue désormais en CI la phase initiale, l'arrêt de l'API, le
  **redémarrage du service PostgreSQL**, la relance de l'API puis la phase de réouverture.

**Restent partiels** : TR-EX-016 (cinq états affichés dans la vue 3D seulement), TR-EX-049 (reprise après coupure sans
recette navigateur), TR-EX-002 (parcours positif « du dessin au dossier »), TR-EX-014 et TR-INV-013 (modèles externes),
REC-A-02. Limite connue : les écritures Atelier hors commandes (import d'archive, remplacement à l'import d'exemple) ne
passent pas par l'orchestrateur et ne sont pas bloquées par la bascule (MIG-COEX-06, mécanisme prouvé sur données
synthétiques ; la bascule d'un projet réel reste un acte de production).

**Intégration** : signature du point d'entrée des écritures unifiée (`options.source` porte `agent-mcp`, `options.jobId`
le job d'essai) ; recettes `studio-lot-f` et `studio-cmd` branchées en CI et en préproduction.

## Lot PUB — publications, observations, quantités, BCF

**Ce qui est livré**
- Observations à vocabulaire fermé (catégorie, gravité ; absente = « non évaluée »), identité propre (`issueId`), pièces
  justificatives ; une observation bloquante ouverte refuse soumission, approbation et diffusion (409
  `blocking_observation_open`) jusqu'à une dérogation ou sa clôture.
- Manifeste de publication : `usage`, `dossier` et bloc `controles` (seulement s'il n'est pas vide : empreintes des
  publications existantes inchangées) ; type « dossier-conception » (PDF et JSON).
- Vues de coupe (`studio_section_views`), rebasées explicitement, protégées tant qu'un dossier les cite.
- Résultats quantitatifs à identité stable (`studio.metre.<grandeur>/1`), aucun total sur révisions, règles ou unités
  mélangées, ajustement motivé et signé.
- BCF 2.1 minimal livré dans les deux sens (Ctrl+Alt+Maj+Y / I) ; repères source et cible des rapports DXF.
- Conclusions de contrôle (EX-068) : conforme, non conforme, non testé, non applicable justifié (justification relue
  contre la version d'exigence, auteur et date fixés par le serveur, 400 `justification_invalide`).
- Provenance des rendus : auteur exigé. **Intégration avec le lot F** : la provenance relue d'un rendu exige aussi son
  auteur et la vue 3D le transmet à l'illustration (réserve TR-EX-071 du lot F levée).

**Restent partiels** : REC-E-03 (acceptation des trois parcours par le maître d'ouvrage), TR-EX-027 (cas positif : outil
« échelle » du lot OUT), E.6-04 (DWG, STEP, OBJ, STL sans contrat, motivés). Limites : l'archive de projet n'emporte
pas encore les vues de coupe ni les pièces des observations ; les `issueId` des observations d'équipe figurent au manifeste.

## Lot REND — graphismes, repères, moteurs qualifiés, provenance des sources

**Ce qui est livré**
- Système de projet versionné et repères local-objet / local-2d / projet (transformations vérifiées, traces) ; le repère
  géographique est refusé (aucune projection dans Studio).
- Graphismes : Bézier cubique, hachure, symbole, opacité (outils `studio.graphisme.creer` Maj+F6,
  `studio.graphisme.retirer` Maj+F7, `studio.repere.projet` Ctrl+Maj+F2, `studio.source.declarer` Ctrl+Maj+F3, chacun
  avec icône, barre et raccourci ; alternatives clavier déclarées).
- Règle des accélérations (gain p95 strict par scène, équivalence dans la tolérance, appareil réel pour le GPU) : index
  spatial autorisé, moteur Canvas refusé (mesuré en CI), repli WebGPU → WebGL2 déclaré.
- Provenance des imports DXF / IFC et des modèles externes (`studio-provenance/1`, route
  `…/modeles-externes/:modelId/provenance` à contrat `studio-api-modele-externe-provenance/1`, droit d'export).
- Mesures S1–S5 et S7 à 100 / 10 000 / 100 000 primitives dans Chromium (DEC-09, DEC-13) ; chemins optimisés
  équivalents au chemin direct (REC-C-01).

**Restent ouverts** : TR-EX-059 (mesure pendant un booléen exact lourd ; appareil réel), REC-C-02 (GPU et téléphone
réels : recette `RECETTE-APPAREILS.md`, `HEADED=1` ou `CDP_URL`).

**Intégration** : matrice d'échanges en révision 6 (illustration PNG, BCF, dossier de conception, graphismes,
provenances) ; contrat des modèles externes étendu par deux champs (repère source, restrictions : règle d'évolution,
même version) ; recettes `studio-pub` et `studio-rend` branchées en CI, `studio-rend` en préproduction.

## Lot OUT — outils, chargement, profils

**Ce qui est livré**
- Contrat d'exécution des outils (EX-028) et fiches d'outils (risques, cas positifs et négatifs, mesures par barre) ;
  quota d'invocation par compte (600 lots / minute, 20 000 / heure, réglable ; rejeux et installation d'exemple
  exemptés ; 429 avec `Retry-After`) — limite : compteur propre à chaque processus API.
- États des tâches IF-007 (`superseded` au remplacement, annulation coopérative) ; messages des Workers validés
  (« illisible » / « invalide » arrête le Worker) ; noyau exact libéré après 5 minutes d'inactivité.
- Profils d'outils `fadi-studio-profil/1` (export, import en copie, 409 sur conflit de raccourci avec résolution
  « écarter », 403 si le profil contient « Publier » sans le droit) ; mécanisme de dépréciation prouvé sur tables d'essai.
- Caches par build (EX-042), refus de duplication au build pour three / occt / manifold (EX-041), instanciation à partir
  de 3 exemplaires (C.2-02), basculement canonique (A.3-03), accrochage parallèle (EX-053).

**Reste partiel** : TR-AC-011 (aucune fiche « conforme » tant qu'un build et un profil de charge de référence ne sont pas
désignés par le maître d'ouvrage : `DESIGNATION_CONFORMITE = null`).

**Intégration** : l'accrochage parallèle prend **Ctrl+Maj+F6** (Maj+F6 est « Créer un graphisme » du lot REND, règle
d'or : un raccourci par commande) ; fiches d'outils complétées des quatre outils du lot REND ; matrice d'échanges en
révision 7 ; recette `studio-out` branchée en CI.

## Promotion après la CI verte de main (PR #328 fusionnée, main@4304050)

Les preuves « test prescrit » des lots REG, DEC, F et CMD ont été rattachées par `scripts/registre/completer_preuves.py`
à l'exécution verte de `main` sur le commit de fusion (libellés présents au commit, étape nommée réussie) : 115 preuves
complétées, **56 obligations passées « Vérifié »**. Restent « Implémenté » : les obligations des lots PUB, REND et OUT
(leurs fichiers ne sont pas encore sur `main`), PR-01 à PR-06 et PR-09 (les tests du contrôle de PR tournent sur `main`
à partir de la prochaine fusion) et TR-EX-046 (suite DB-3 du journal d'accès à rattacher).

## Promotion après la CI verte de main (PR #330 fusionnée, main@085a8f3)

Les preuves des lots PUB, REND et OUT, et celles du contrôle de PR (PR-01 à PR-06, PR-09), ont été rattachées à
l'exécution verte de `main` sur le commit de fusion : 100 preuves complétées, **55 obligations passées « Vérifié »**.
Reste « Implémenté » TR-EX-046 : sa suite DB-3 (`routes/studio-journal-acces.test.ts`) figure dans la liste des suites
DB-3, que l'outil de complétion n'attribue jamais à une exécution sans base attestée.

## Vague 2 — lots G1, G3, G4 et G5

- **G1 (parcours et association)** : parcours d'une petite étude du dessin au dossier publié à travers quatre domaines
  (TR-EX-002), cinq états dérivés affichés dans le métré, les feuilles et les publications (TR-EX-016), reprise après
  coupure (« Rejetée », « Prévisualisation abandonnée », TR-EX-049), cote associative sur un mur qui suit le mur et passe
  « à résoudre » s'il disparaît (TR-AC-001), association et copie indépendante recettées (J4, PASS-05). Recette
  `studio-g1`.
- **G3 (échanges et corpus)** : exports OBJ, STL (maillage) et STEP (noyau exact, un produit par élément, millimètres
  déclarés, AP214) avec leurs contrats ; DWG non livré (D-179) ; capacités par sens (lecture, consultation, édition,
  export, aller-retour) dans la matrice d'échanges (révision 8) ; corpus S1, S2, S5, S7 complétés ; références visuelles
  S1–S7 versionnées avec empreintes (recette `studio-corpus-references`). Restent partiels X.1-01/04/05/06 : blocs
  utilisateur, contraintes, niveaux objets, NURBS et fusion de variantes n'existent pas encore dans le modèle (déclarés
  absents, jamais simulés).
- **G4 (mesures et qualité)** : protocole EX-097, vingt outils à froid / chaud comparés à une référence versionnée avec
  verdict, comparaisons avant / après optimisation de la vue 3D, mesures séparées (MES-03), réactivité pendant un booléen
  exact lourd, contrôle EX-101 des régressions pertinentes (en CI sur chaque PR). Restent externes : appareil physique et
  GPU réel (TR-EX-059, J5).
- **G5 (suivi et exploitation)** : 11 règles d'alerte (4 à seuil fondé sur une règle écrite, 7 « non évaluées »),
  mesure de la consommation des noyaux, route `GET /admin/surveillance` et procédure post-déploiement
  (`docs/studio/SURVEILLANCE-EXPLOITATION.md`) ; spécification du redémarrage du noyau exact (D.2-04) ; rattachement
  des 141 fiches aux sous-lots et rapport d'agrégats de recette générés et contrôlés. L'observation en production réelle
  (R.5-03, OPS-08) attend un déploiement.

Les obligations de la vague 2 sont inscrites « Implémenté » jusqu'à la CI verte de `main` après fusion. Le lot G2
(outils et BIM) suivra dans une PR distincte.

## Vague 3 — fonctions de modèle absentes (26 octobre 2026)

Quatre lots livrent les fonctions que le corpus et la couverture 3D déclaraient absentes de `studio-document/1` (champs facultatifs, documents existants relus à l’identique). Inscrits **Implémenté** (preuves « test prescrit ») ; promotion après la CI verte de `main`. Recettes `studio-w3a`, `studio-w3b`, `studio-w3c`, `studio-w3d` branchées en CI (lot `complements` ; `studio-w3d` lit les courriels : hors `E2E_DEFAUT`). Matrice d’échanges : révisions 10 (W3-A), 11 (W3-B), 12 (W3-C). Décision d’orchestration : X.1-05 n’a pas été clos sur les seules NURBS (« NURBS / subdivision ») ; la subdivision de Loop a été livrée avant clôture, Catmull-Clark restant déclaré absent.

### Lot W3-A — blocs définis par l’utilisateur et contraintes géométriques (X.1-01)

- **X.1-01** : VERIFIE.
  - Décision : Modèle : trois listes facultatives additives de studio-document/1 — `blocs` (définition : id, type « bloc », nom unique sans casse, point de base, formes sans calque ni extrusion), `insertions` (id, type « insertion », bloc, calque, position, rotation [0 ; 2π[, échelle > 0, symétrie facultative) et `contraintes` (id, type, cibles, valeur, tangence, aResoudre) ; documents existants valides et relus à l'identique ; caractérisation mise à jour (extension consignée).
  - Décision : La géométrie d'une insertion n'est jamais stockée : dérivée de la définition à chaque lecture (p ↦ position + R(rotation)·échelle·S·(p − base), S = symétrie x ↦ −x, convention de l'INSERT DXF) ; une redéfinition (`redefinir: true`, jamais implicite) se répercute donc sur toutes les insertions. Refusée si une insertion est sur un calque verrouillé.
  - Décision : Les commandes générales (Déplacer, Copier, Rotation, Symétrie, Échelle, Placer sur le calque, Supprimer) agissent aussi sur les insertions (pose composée exacte : une symétrie bascule `symetrie` et ajoute π) ; Supprimer retire aussi une définition qui n'est plus insérée (refus sinon) et une contrainte.
  - Décision : Éclater : l'insertion devient les formes posées (identifiants `insertion.élément`) ; un rectangle tourné d'un angle quelconque devient une polyligne fermée, règle de Rotation existante.
  - Décision : Contraintes : huit types (horizontal, vertical, parallèle, perpendiculaire, tangence, coïncidence, égalité de longueur ou de rayon, distance fixée) sur lignes, segments droits de polyligne, cercles, arcs et leurs points nommés ; rectangle refusé (côtés déjà liés aux axes). Résolution Gauss-Newton à pas de norme minimale, dérivées exactes (différentiation automatique), déterministe ; composante connexe du système résolue ; objet sur calque verrouillé = référence fixe. Tolérances déclarées : 1e-9 m × max(1, étendue) et 1e-9 rad.
  - Décision : Refus, jamais de résolution en silence : insatisfaisable (non-convergence ou solution qui écraserait un segment / un rayon sous 1e-6 de l'étendue), sur-contrainte (équation dépendante à la solution, Gram-Schmidt, la nouvelle contrainte nommée). Après chaque lot, une contrainte non satisfaite (ou dont la cible a disparu) passe « à résoudre » avec sa géométrie gardée ; résolue seulement par `studio.contrainte.poser { resoudre }` ; poser une contrainte liée à une contrainte rompue est refusé (« résolvez-les ensemble »).
  - Décision : Raccourcis : Maj+F1, Maj+F3, Ctrl+F1 (réserve W3-A) ; Maj+F2 de la réserve étant déjà pris par « Modèles externes » (raccourcis.ts), « Éclater l’insertion » prend Ctrl+F12, libre, hors des réserves W3-B/C/D et non réservé par le navigateur. À réconcilier à l'intégration si un autre lot l'a pris.
  - Décision : Quatre outils seulement (le registre impose un raccourci unique par outil) : la résolution des contraintes « à résoudre » passe par le même outil Contraindre (`resoudre`), et le retrait des contraintes et définitions par Supprimer.
  - Décision : Familles de la barre compacte : blocs avec Dessin, contraintes avec Modification ; domaine Dessin et modélisation ; moteur planche-2d ; alternative clavier « bouton-raccourci » (boîtes Blocs et Contraintes, désignation des insertions au clavier par Entrée).
  - Décision : Échanges (matrice révision 9 → 10, empreinte épinglée, MATRICE-ECHANGES.md régénéré) : DXF écrit une section BLOCKS (un BLOCK par définition, nom ASCII de 31 caractères dérivé, éléments sur « 0 ») et un INSERT par insertion (41 négatif pour la symétrie) ; DXF lu : INSERT d'un bloc entièrement représentable → insertion (définition créée une fois ou reprise si identique), INSERT à attributs, en réseau, à échelle non uniforme ou d'un bloc non représentable → compté « INSERT » (et non natif sur option), comme avant ; SVG : insertions développées (`data-insertion`, `data-bloc`), définition « approchée » ; IFC : hors IFC ; contraintes écrites dans aucun format (commentaire 999 en DXF). Rapport de fidélité : catégories blocs, insertions, contraintes et six raisons nouvelles. L'orchestrateur réconciliera la révision de la matrice avec les autres lots.
  - Décision : Corpus S1 : motif porté de 16 à 19 (insertion du bloc partagé `s1-bloc`, contrainte horizontale, contrainte de distance) ; définitions non comptées comme primitives (support partagé, comme un calque), insertions et contraintes comptées ; empreintes S1 100 / 10 000 / 100 000 (lourd) réécrites, S1-100.svg, fixture references-100.json, captures S1 (planche, vue 3D) réécrites par la recette studio-corpus-references (autres scènes identiques à l'octet) ; décompte des primitives de cette recette étendu aux insertions et contraintes.
  - Décision : Interface : refus du modèle sur les blocs et contraintes montré tel quel par messageRefus (motif nommant les éléments en cause) ; `refusBrouillon` ajouté au brouillon pour essayer une saisie sans l'appliquer (contrat A.5-01 : applyStudioCommands reste confiné à brouillon.ts).

### Lot W3-B — niveaux, composants 3D et éléments structurels (X.1-04)

- **X.1-04** : VERIFIE.
  - Décision : Rattachement par niveauId facultatif sur mur, échelle, poteau, poutre, dalle et occurrence ; une ouverture suit son mur ; les cotes restent absolues et changer la cote d'un niveau translate ses objets dans la même commande (refus si l'un est sur un calque verrouillé). Justification : aucun lecteur existant (maillage, IFC, métré) n'a besoin du niveau pour placer un objet ; rétrocompatible.
  - Décision : La géométrie libre (formes 2D, solides libres) n'est jamais rattachée à un niveau (A.3-09) ; la vue par niveau la garde par défaut ou la masque sur demande.
  - Décision : Supprimer un niveau (commande Supprimer) détache ses objets sans rien supprimer ; supprimer une définition encore désignée par une occurrence non supprimée est refusé.
  - Décision : Poteau, poutre et dalle rangés dans StudioDocument.architecture (comme l'échelle d'accès G2) : modifier, supprimer, déplacer, copier, tourner, symétrie, échelle et calque par les commandes existantes. Sections rectangulaires saisies seulement (aucun catalogue, aucune valeur par défaut), poutre horizontale, base = cote de la sous-face, aucune vérification structurelle.
  - Décision : Composants 3D : définition = solides libres (boîtes, prismes) sans calque, source ni basculement, dans le repère du composant ; occurrence = composantId + placement (origine, rotation z) ; géométrie dérivée à chaque lecture ; « Rendre unique » = lot de deux commandes (définition copiée, occurrence replacée). Nommage studio.composant.* distinct des blocs 2D du lot W3-A.
  - Décision : Budget de raccourcis (4) : quatre commandes upsert — studio.niveau.definir (Ctrl+F2), studio.composant.definir (Ctrl+F3), studio.composant.placer (Ctrl+F6), studio.structure.element (Ctrl+F7) ; suppressions par Supprimer (studio.dessin.supprimer étendu), modifications de structure par studio.architecture.modifier ; barre « Bâtiment » rangée dans la famille Architecture, domaine Dessin.
  - Décision : IFC : un IfcBuildingStorey réel par niveau (Elevation = cote) agrégé au bâtiment avec le niveau de référence (conservé, export sans niveau inchangé à l'octet) ; placements gardés relatifs au niveau de référence (z absolu) ; IfcColumn / IfcBeam / IfcSlab .NOTDEFINED. ; composant = IfcBuildingElementProxyType (pset en HasPropertySets) + IfcRepresentationMap, occurrences IfcBuildingElementProxy + IfcMappedItem, IfcRelDefinesByType.
  - Décision : Exports 3D (OBJ, STL, STEP) : échelles d'accès (auparavant omises), poteaux, poutres, dalles et occurrences écrits ; niveaux et définitions comptés « non écrits ».
  - Décision : Panneau Bâtiment : saisies au clavier ; cote saisie relative au niveau choisi (cote absolue écrite) ; rattachement d'un objet existant par « Niveau de rattachement » du panneau Architecture.
  - Décision : Corpus S4 : motif porté à 12 primitives (ajout de poteau, poutre, dalle typés et de l'occurrence de gaine, ligne et cercle extrudé conservés pour les recettes qui les lisent) ; niveaux et définition sont des éléments communs du feuillet, pas des primitives ; les occurrences sont des primitives.

### Lot W3-C — surfaces libres NURBS et de subdivision (X.1-05)

- **X.1-05** : VERIFIE.
  - Décision : Représentation retenue : surface NURBS par pôles (grille lignes × colonnes), degrés 1 à 9 (≤ pôles − 1) et poids facultatifs ; nœuds uniformes bornés (clamped) dérivés, jamais stockés. Justification : DA-03-02 « degré et nœuds réglables » et critère S5 « surfaces complexes » ; le noyau sait épaissir une B-spline ; poids → arcs exacts (oracle de forme close). Conséquence : nœuds non uniformes non saisissables (extension réversible : champ facultatif).
  - Décision : L'opération existante `surface` du noyau INTERPOLE ses points (constat : le centre d'une grille 3 × 3 passe par le point relevé) : elle n'est pas une surface par pôles. Nouvelle opération `nurbs` dans @parcours/geometry-exact : face NURBS écrite en BREP texte OCCT (surface rationnelle type 9, bords iso exacts, courbes paramétriques), relue par fromBREP, épaissie par thicken (tolérance 1e-6). Aucune nouvelle dépendance ; même code navigateur (Worker) et serveur.
  - Décision : Première livraison : subdivision non livrée ; remplacé par la décision suivante (couverture 3D « surface-complexe », libellé « Subdivision (maillage de contrôle) », corpus S5 absent « surfaces de subdivision ») : une surface de subdivision n'a pas d'équivalent exact dans le noyau OCCT ; la surface-libre de l'Atelier (Loop) n'est pas réutilisée (Studio n'importe pas l'Atelier, check-module-deps). Le type 3D « surface-nurbs » est ajouté, disponible, avec ses tests.
  - Décision : Extension additive de studio-document/1 : tableau facultatif `surfaces` ; solide exact épaissi = variante additive de `exacts` (`operation: "epaississement"`, `surface` conservée, `epaisseur` > 0, `sens` normale/inverse) ; documents existants relus à l'identique (caractérisation inchangée). R15 : la commande `studio.surface.epaissir` retire la surface de `surfaces` et la conserve intacte dans le solide exact (comme les opérandes du booléen) ; l'identifiant de la surface reste réservé.
  - Décision : Côté de l'épaisseur saisi (`normale` = ∂S/∂u × ∂S/∂v, ou `inverse`), jamais deviné ; épaisseur 1e-6 à 1e6 m (bornes des dimensions des solides). Bornes techniques : 64 × 64 pôles, degré 9, coordonnées ±1e9 m, maillage d'affichage 16 échantillons par travée et 64 par sens ; résultat du noyau borné par STUDIO_LIMITES_EXACTS.
  - Décision : Serveur (R9) : `revaliderBooleensStudio` recalcule aussi chaque `studio.surface.epaissir` depuis la surface de SON document (capture `studioCaptureEpaississement`, opération `nurbs`), compare l'empreinte (400 exact-mismatch sinon) et écrit son résultat. Nom de la fonction gardé (appelants inchangés).
  - Décision : Outils : groupe « volume-libre » (famille Volume de la barre, vue 3D) ; Surface NURBS Ctrl+F8, Modifier la surface Ctrl+F9, Épaissir la surface Maj+F11 (correction de la coordination : Maj+F9 déjà pris par « Importer IFC ») ; icônes studio-surface-nurbs / -edit / -thicken ; alternatives : saisie numérique (panneau-volume-3d) pour créer et modifier, commande pour épaissir ; seul Épaissir charge le moteur noyau-exact (MOTEURS_PAR_OUTIL). Suppression d'une surface : commande existante `studio.solide.supprimer` étendue (aucun nouvel outil).
  - Décision : Édition des points de contrôle : `studio.surface.modifier` remplace la définition entière (même identité) ; l'interface en déduit un pôle modifié (position, poids) ; le pôle se choisit dans une liste (clavier) ou par clic sur son repère dans la vue 3D (surface sélectionnée).
  - Décision : Échanges : OBJ écrit la nappe (maillage d'affichage) ; STL et STEP comptent une surface non épaissie « surface-libre-non-epaissie », jamais écrite ; épaissie, c'est un solide exact (STEP : faces RATIONAL_B_SPLINE_SURFACE) ; IFC : compte FreeSurfacesNotExported ; rapport de fidélité : catégorie « surfaces », raison « surface-libre-hors-export ». Matrice d'échanges : voir la fusion d'int-w3 (révision 12).
  - Décision : Corpus S5 : dans les motifs 3 et 4 (après les booléens), la boîte devient la surface libre puis la surface épaissie, posées hors grille en (−20 (j + 1) ; −20) pour un résultat exact indépendant de la taille ; nombre de primitives inchangé. Tolérances déclarées de l'oracle (TOLERANCE_ORACLE_SURFACES) : aire par maillage 1e-3, volume du noyau 1e-6. Empreintes des corpus S5 (100, 10 000, 100 000), fixture references-100.json, référence SVG S5 et capture 3D S5 (seule) régénérées.
  - Décision : Surfaces de subdivision (demande de la coordination) : schéma de Loop sur un maillage de contrôle triangulaire, variété orientée, niveau 0 à 4 (16 384 triangles subdivisés au plus) ; Catmull-Clark non livré, déclaré absent (un quadrilatère se saisit en deux triangles). Tableau facultatif `subdivisions` de studio-document/1 (extension additive).
  - Décision : Géométrie de Loop de l'Atelier (P2-6) déplacée telle quelle dans le module neutre `packages/atelier-model/src/subdivision-loop.ts` (aucun import), réexportée par `geometrie-3d.ts` (Atelier inchangé, tests P2-6 verts) et importée par Studio ; check-module-deps vert.
  - Décision : Conversion explicite en solide : seulement pour un maillage FERMÉ et orienté vers l'extérieur ; le maillage subdivisé au niveau de la surface est cousu par le noyau (`polyedre` : faces planes, sewAndSolidify) en solide exact polyédrique — représentation exacte du polyèdre, jamais présentée comme la surface limite. Un maillage ouvert est refusé avec sa raison : essai de l'épaississement d'une coque polyédrique ouverte par le noyau → solide invalide (constat du lot), aucune épaisseur n'est inventée. Solide = variante additive `operation: "solidification"` de `exacts`, surface conservée (R15) ; serveur faisant autorité (recalcul et empreinte).
  - Décision : Édition des sommets de contrôle : par « Modifier la surface » (Ctrl+F9), qui accepte aussi une surface de subdivision (reconnue par son type) — liste au clavier ou clic sur le repère du sommet dans la vue 3D ; pas d'outil supplémentaire.
  - Décision : Raccourcis : Ctrl+Maj+F4 et Ctrl+Maj+F9 proposés sont déjà pris (« Illustration depuis la vue », « Agents (MCP) ») ; retenus : Surface de subdivision Ctrl+Maj+Début (Ctrl+F12, d'abord retenu, est « Éclater l'insertion » de W3-A dans int-w3) et Solidifier la subdivision Ctrl+Maj+Fin (libre, non réservé par le navigateur).
  - Décision : Échanges : OBJ écrit toutes les subdivisions ; STL écrit les fermées (étanches) et compte les ouvertes « surface-subdivision-ouverte » ; STEP compte « surface-subdivision-non-solidifiee » (aucun équivalent exact) et écrit le solide polyédrique ; IFC : SubdivisionSurfacesNotExported ; rapport de fidélité : catégorie « subdivisions », raison « surface-subdivision-hors-export ». Matrice d'échanges : voir la fusion d'int-w3 (révision 12).
  - Décision : Corpus S5 : motifs 5 et 6 (après les surfaces NURBS) : tétraèdre de subdivision posé hors grille, puis sa version solidifiée (résultat du noyau dans fixtures/s5-exacts.ts) ; oracle de forme close dérivé des poids de Loop (valence 3, β = 3/16), indépendant du code. Empreintes S5 (dont lourdes), references-100.json et capture 3D S5 régénérées.
  - Décision : Registre : le libellé du test A.3-08 « types avancés du référentiel … » est renommé (surface complexe devenue disponible) ; le registre (interdit d'écriture ici) doit recevoir le nouveau libellé — copie corrigée fournie et validée par registre-libelles (STUDIO_REGISTRE_LIBELLES).
  - Décision : Fusion d'int-w3 (ccefc43c : W3-A, W3-B, W3-D) dans w3-c par commit de fusion, les deux côtés gardés : matrice d'échanges révision 12 (au-dessus de W3-A r10 et W3-B r11 ; empreinte cc5c28cb…), MATRICE-ECHANGES.md régénéré ; `sortie` du document reçoit les surfaces après le bâtiment (paramètre `libres`) ; vue par niveau : surfaces libres et de subdivision traitées en géométrie libre (masquées avec elle) ; compatibilité des outils : `surfaces` → Surface NURBS, `subdivisions` → Surface de subdivision ; libellé A.3-08 de couverture-3d.test.ts fusionné (composant 3D de W3-B et surfaces de X.1-05 disponibles).

### Lot W3-D — fusion de variantes à trois voies (X.1-06)

- **X.1-06** : VERIFIE.
  - Décision : D1 — Granularité : élément = membre identifié d'une famille du document (famille:id, comme concurrence.ts), propriété = champ de premier niveau ; points/renflements/fermeture d'une polyligne fusionnés ensemble ; solides exacts, non natifs, sources et système de projet atomiques (résultat du noyau lié aux opérandes). Justification : cohérent avec studioElementsModifies / studioChevauchements existants. Conséquence : une combinaison de propriétés invalide devient un conflit « combinaison-invalide ».
  - Décision : D2 — Ancêtre commun : plus proche ancêtre commun du graphe des révisions de l'étude (parent, révision de dérivation en mode version, révision source d'une fusion ; une annulation pointe vers la révision rendue). Aucun ancêtre (variantes créées vides, copie indépendante, TR-INV-003) → 409 fusion_sans_ancetre ; plusieurs (fusions croisées) → 409 fusion_ancetre_ambigu, jamais choisi au hasard.
  - Décision : D3 — Conflits jamais tranchés en silence : document provisoire = version de la cible, application refusée (409 conflits_non_resolus) tant qu'un conflit n'a pas de résolution source|cible ; résolution inconnue → 400 ; l'application exige l'empreinte SHA-256 du résultat de l'aperçu accepté (409 apercu_perime) et les têtes cible/source vues (409 stale_revision / source_changee).
  - Décision : D4 — Références cassées détectées sur le document fusionné (cote liée, hôte d'ouverture, profil de prisme, cote de face, propriété, apparence, calque, opérande conservé d'un exact revivant) ; la résolution fixe les deux éléments du côté choisi ; boucle jusqu'à stabilité (8 tours au plus). Un document final invalide n'est jamais écrit (422 fusion_invalide).
  - Décision : D5 — Écriture : une révision source `variant-merge` de la cible (envelope nulle, provenance dans la nouvelle colonne nullable additive studio_revisions.fusion jsonb, archivée et restaurée telle quelle, NULL pour les archives antérieures), écrite par lib/studio-commands.ts sous la même orchestration que les lots (verrous, droit modify sur la cible, verrou d'édition 423, rejeu requestId, chemin d'écriture, cible archivée 409, quota, journal IF-011 avec effets, temps réel). Le test d'architecture A.5-01 est complété en conséquence (deux avancées de tête, même module).
  - Décision : D6 — « Variante publiée/verrouillée » : Studio ne verrouille pas une variante publiée (une publication fige une révision immuable). Refus retenus : cible archivée (409), verrou d'édition d'un autre compte (423), référence protégée (403), étude sans autorité d'écriture (409 chemin_ecriture). Une publication existante devient « périmée » par le mécanisme d'actualité existant ; aucune révision publiée n'est modifiée. Une source archivée reste lisible et fusionnable (seule la cible est écrite).
  - Décision : D7 — Annulable : « Annuler la dernière fusion » crée une révision `variant-merge-undo` au document d'avant, seulement tant que la fusion est la tête (EX-012 : une annulation est une nouvelle opération) ; la fusion annulée sort de l'histoire suivie (la même fusion se repropose).
  - Décision : D8 — Interface : deux commandes de l'éditeur (pas des outils du registre, ce ne sont pas des commandes de document) : « Fusionner une variante » Ctrl+F10 et « Annuler la dernière fusion » Ctrl+F11 (réserve W3-D, libres), icônes studio-merge-variants / studio-merge-undo, barre Édition, ecrit: true ; domaine « à définir » (REF-01 §02 ne range pas la gestion des variantes) consigné dans ADR-STUDIO-NAV-01. Shift+F11 non utilisé. Pas d'entrée dans alternatives-gestes.ts ni fiches-outils.ts (réservés aux outils du registre) : l'alternative clavier est le raccourci + bouton nommé + choix des conflits au clavier (recette).
  - Décision : D9 — Corpus S6 : étape C2 (ligne s6-b-ligne, autre tracé) et fusion F1 B → C avec résolution « source » ; oracles C (3 lignes, 2 révisions) et F1 ; empreinte du plan, fixture s6-plan.json, references-100.json, S6-C-100.svg et S6-100.json régénérés ; captures PNG (tête de A) inchangées.

## Bilan consolidé de l'achèvement délégué (26 octobre 2026)

**Livré et fusionné dans `main`** (CI verte à chaque fusion) : PR #326 et #328 (lots d'achèvement API, REG, DEC, F, CMD,
PUB, REND, OUT), #330 (corrections de revue), #332 (vague 2 : G1–G5), #334 (promotion de la vague 2 et agrégats de
recette), #336 (vague 3 : blocs et contraintes, niveaux / composants / structure, surfaces NURBS et de subdivision, fusion de
variantes), puis la PR de ce bilan (promotion de la vague 3, TR-EX-046, SUIVI-06).

**Testé** : chaque obligation promue Vérifié porte une preuve rattachée à une exécution verte de `main` (commit, URL du
job, date, environnement), après la contre-vérification des libellés cités (`completer_preuves.py`). Les suites API à base
attestée (DB-3) tournent sur `main` ; `completer_preuves.py` les reconnaît désormais au verdict « DB-3 actif » du journal
du job (test `scripts/registre/test_completer_preuves.py`).

**Registre** : 585 / 630 (526 Vérifié, 59 Accepté), aucune obligation « Implémenté » en attente. Porte G4 automatisée :
livraison admise (BLOC-01 à BLOC-07 vérifiés). Des 85 fonctions absentes du point 2, 81 sont livrées ; des 35 décisions, 31
sont prises ou prouvées. Aucune exigence n'a été déclarée hors périmètre, hors pilote ou close par simple décision.

**Déployé** : rien. La production et la préproduction ne sont pas accessibles à la session ; la Release reste l'acte du
maître d'ouvrage.

**Obligations restantes** : 45 (29 À faire, 7 En cours, 9 Bloqué), toutes suspendues à un acte externe recensé dans
[`DEMANDE-INTERVENTIONS.md`](../DEMANDE-INTERVENTIONS.md) : désignation du build et du profil de référence, recette
utilisateur et mesures sur appareil réel, décisions de cadrage et estimations, accord sur une copie des données réelles,
installation de la phase B, déploiement en préproduction, acceptation G4 puis Release, restauration et surveillance après
déploiement.
