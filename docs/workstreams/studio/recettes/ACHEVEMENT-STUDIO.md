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
