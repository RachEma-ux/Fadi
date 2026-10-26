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
