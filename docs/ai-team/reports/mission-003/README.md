# Mission 003 — checkpoint de coordination A0

18 octobre 2026, programme [#156](https://github.com/RachEma-ux/Fadi/issues/156), [PR #165](https://github.com/RachEma-ux/Fadi/pull/165), branche `docs/156-codex-missions-completes`. Ce dossier contient les **nouveaux travaux de Mission 003** ; les [originaux Mission 002](../mission-002-originals/README.md) restent distincts et immuables. Les dates et SHA des rapports désignent leurs observations, pas une CI transférable au commit porteur.

Référence applicative : `27c0c5a35e2f116752a83a9c66459484488a1975`. Reprise documentaire : `a09c11d397c8527987c3d1c4410ebb2eb240a819`, récupération publiée à `3f0dc63cd3a713417970d9c42cfc7ceee3d2a759`, instructions horaires intégrées par avance rapide jusqu’à `a3cc3c32cfcaa38d9d3117f63644499f9f061f4b`. Dépôt initial `work@aadd083…` laissé intact ; analyses dans une copie isolée. Aucune anomalie déduite du seul nom `work`.

## Avancement mesuré

| Indicateur | Valeur et limite |
|---|---|
| Missions | 31 suivies dans [missions.json](../../missions.json) : 18 En cours, 12 Bloqué, 1 À définir ; **aucune mission entière clôturée** |
| Registre Studio | [630 IDs exacts](../../../workstreams/studio/task-register.json), tous qualifiés initialement par groupe ; 141 fiches normatives détaillées, 18 dossiers DEC et 9 NAV prescrits |
| États des tâches | 258 À définir, 159 En cours, 207 Bloqué, 6 Vérifié documentaire ; 0 Implémenté/Accepté, 0 nouvelle case source cochée |
| P630 | 6/630 = **1,0 %** : SRC-01/02/03, REP-01, PROV-01/02, uniquement provenance/références vérifiées ; pas un pourcentage de code |
| PDEV | **N/D** : DEV_SCOPE du périmètre accepté et baseline fonctionnelle non établis ; aucun dénominateur inventé |
| Tests Studio | 38 oracles, 7 corpus décrits, 223 liens TEST et 8 liens NAV candidats ; aucune exécution métier Studio |
| Agents | A0 coordinateur et A1/A2/A4/A5/A6 réellement exécutés ; A3 inactif |

Les six contrôles documentaires ne valent ni six capacités logicielles ni une recette Studio. Une fiche préparée, un test présent ou un chemin existant ne prouve pas la conformité. Les états de décisions, tests et travail restent distincts.

## Livrables et preuves

- M00/M29 : [récupération et pièces indisponibles](../MISSION-003-RECUPERATION.md), [manifeste des contributions](manifest.json), [registre630](../../../workstreams/studio/task-register.json).
- A1/M11–M12–M14 : [cadrage et pilote](A1/M11-M12-M14-preparation.md), [141 fiches exactes](A1/studio-141-fiches.json), [18 dossiers DEC](A1/studio-18-decisions.json), [gates](A1/gates-et-pilote.json), [provenance](A1/sources-provenance.json).
- A2/M05–M07–M08 : [contrats et limites](A2/M05-M07-M08-CONTRATS.md), [imports](A2/module-edges.json), [inventaire lexical](A2/isolation-triage.json), [23 fichiers/90 occurrences relus](A2/isolation-nominal-review.json), [20 autres documents/43 occurrences](A2/isolation-extra-docs-review.json), [revue des DEC](A2/review-A1-DEC.json).
- A4/M13–M16–M21 : [navigation candidate](A4/CONTRAT-NAV-CANDIDAT.md), [9 NAV](A4/NAV-FICHES.md), [Registry/Manager](A4/M21-MANAGER-PREPARATION.md), [PR recouvrantes et propriétaires](A4/PR-COMPROMIS-ET-CHECKPOINT.md), [revue croisée](A4/REVUE-CROISEE-141-FICHES.md).
- A5/M02–M09–M15–M26 : [garde DB et lots A3 proposés](A5/A5-M02-M09-M15-M26.md), [38 oracles](A5/studio-38-oracles.csv), [7 corpus](A5/corpus-S1-S7.csv), [liens TEST](A5/liens-141-vers-38.csv), [liens NAV](A5/liens-141-vers-NAV.csv), [revue141](A5/revue-141-fiches-A1.json).
- A6/M01–M03–M04–M10 : [Cloud, CI, protection et exploitation](A6/RAPPORT-A6-M01-M03-M04-M10.md), [preuves bornées](A6/preuves-bornees.json), [extraits CI expurgés](A6/extraits-ci.txt).
- A0/M06 : [corrections documentaires effectivement réalisées](M06-DOCUMENTATION.md), [revue A2](A2/review-M06.json). [Décisions canoniques D01–D08](DECISIONS-M002-D01-D08.md).

L’extraction de 141 textes et des 18 DEC a été comparée aux paragraphes XML exacts des sources, indépendamment par A2/A5. Les rapprochements code→contrat→tests sont des **candidats** à instruire. Aucun original INV/IF/AC autonome de Mission 002 absent des espaces accessibles n’a été inventé.

## Dossiers de lots préparés

| Lot | Mission/propriétaire de réalisation | Entrées déterminantes |
|---|---|---|
| [I](A2/LOT-I.md) | M16/A4 | Navigation adoptée, contexte A.1, G3 et autorisation |
| [X](A2/LOT-X.md) | M15/A5 | Corpus synthétiques, instrumentation, cible sûre avant exécution |
| [A.1](A2/LOT-A.1.md) | M17/A2 | DEC-01/02/03/12/18 et autorités |
| [A.2](A2/LOT-A.2.md) | M18/A3 futur | Document 2D indépendant, G3 applicable |
| [A.3](A2/LOT-A.3.md) | M19/A3 futur | Modèle spatial indépendant, G3 applicable |
| [A.4/A.5](A2/LOT-A.4-A.5.md) | M20/A2 | Association, commandes/historique, A.2/A.3 selon contrat |
| [B](A2/LOT-B.md) | M21/A4 | Registry/Manager, profils, alias et chargement |
| [C](A2/LOT-C.md) | M22/A2 | Oracles index/rendu, DEC-08/09/10/13/17 |
| [D](A2/LOT-D.md) | M23/A6 | Jobs/révision, workers et mémoire, DEC-11/13 |
| [E](A2/LOT-E.md) | M24/A1 | Dossier métier, approbation/publication, DEC-16 |
| [F](A2/LOT-F.md) | M25/A2 | Options explicitement retenues, accords et preuves propres |
| [R](A2/LOT-R.md) | M27–M28/A6 | Simulation, restauration, G4, accords sensibles distincts |

Chaque dossier précise exigences exactes, composants présents/manquants, contrats, décisions, dépendances, tests, preuves, risques, retour arrière et autorisation. Ces douze dossiers sont préparés, **aucun lot de réalisation ouvert**. Séquence conservée : G0 → G1 → G2 → G3 → réalisation autorisée → G4. Les décisions facultatives ne bloquent que leurs dépendants.

## Réserves et prochaine action

P1 Cloud : statut runtime révision18 observé ; API/DB/web indisponibles aux ports attendus, PostgreSQL arrêté255, cause non démontrée. Scripts publiés non obtenus du seul statut, démarrage en nouvelle session non reproduit. P1 DB : garde non implémentée, tests destructifs non lancés. P1 GitHub : main non protégé, aucune activation administrative.

P2 : compatibilité Atelier v2/v3, alias `echelle`, frontières web, CSP et vulnérabilités restent ouverts ; documentation ciblée corrigée seulement. Inventaire lexical actuel1283 fichiers,488 touchés/1887 lignes ;43 fichiers/133 occurrences relus (23 nominaux+20 documents/méta),445 autres fichiers non relus sémantiquement. Ni présence lexicale ni contrôle nominal réussi ne suffit à une conclusion d’isolation exhaustive. P3 : Node24/22 et Chromium154/141 observés, mesures sur appareils réels absentes.

CI sur `a09c11d…` : run39114417812 réussi, journaux confirmant1757 tests/1 ignoré et3 IFC ; pas preuve de conservation paramétrique (0 IfcWall/1539 proxys au réimport cité). Les47 scénarios historiques ne sont pas certifiés par le seul succès d’un job E2E. Sur `3f0dc63…` : couverture39116784818, continuité39116784845, isolation39116784874 réussis ; CI39116784772 **annulée**. Ne pas transférer ces résultats au prochain commit.

Prochaine opération autorisée : lire les réponses [#166](https://github.com/RachEma-ux/Fadi/issues/166), vérifier HEAD et CI exacts, poursuivre les comparaisons de contrats et le tri documentaire restant ; maintenir les blocages. Soumettre les seuls choix/accords nouveaux D01–D07 ; D08 est déjà acquis. Aucun code A3/POC, restart, migration, règle GitHub, fusion ou déploiement depuis ce checkpoint.

## Propriété unique des fichiers partagés

A0 intègre seul les documents et STATUS/HANDOFF pendant cette vague. Pour la future réalisation : routes/navigation/traductions/styles à A4 en coordination avec #142 ; schémas/modèles/manifestes/commandes à A2 pour le contrat puis A3 désigné pour le lot ; setup/client DB à un seul A3 après accord, revue A5/A6 ; workflows à A6 avec revue A5. Les autres agents fournissent des rapports isolés et revues, sans écrire simultanément ces fichiers.

[Validation enrichie A0](validation-A0.json), [revue du registre A1](A1/review-register-M003.json) et [scan des contributions A5](A5/security-review-M003.json). Les contrôles locaux et GitHub sont consignés dans les checkpoints de [l’équipe](../../../workstreams/ai-team/STATUS.md) et [Studio](../../../workstreams/studio/STATUS.md). Le SHA porteur final et ses conclusions CI sont à relire dans la PR ; chaque observation précédente conserve son propre SHA.
