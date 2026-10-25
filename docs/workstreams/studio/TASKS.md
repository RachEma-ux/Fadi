# Tâches — Studio, programme156

## Dépôt du plan Axes — 25 octobre 2026

Tâche documentaire [#294](https://github.com/RachEma-ux/Fadi/issues/294), branche `docs/294-axes-implementation-plan`, base `0ff0638c3f6781bb94fce9b22c82c69c7ed7083e`. Le [plan d’implémentation Axes v1.0](Fadi-Concept-Axes%20Pan.md) est ajouté avec le nom demandé et le contenu du fichier remis à l’utilisateur : 12 lots AXE-00 à AXE-11, quatre phases et 20 scénarios AX01–AX20. Il complète la paire de concepts sans la remplacer.

- Vérifié documentairement : plan complet et liens de reprise ; contenu source conservé.
- À faire : revue du plan et, lorsque demandé, cadrage AXE-00.
- Lots AXE-00 à AXE-11 : planifiés, non exécutés par cette publication. Aucun état des 630 obligations n’est modifié.

## Complément documentaire Axes — 23 octobre 2026

Tâche bornée [#260](https://github.com/RachEma-ux/Fadi/issues/260), branche `docs/260-axes-concept`, base vérifiée `516e2f747c15d84f8c589e5271c015e929dc37e4`. Le concept Axes v1.0 est proposé pour validation dans [la paire MD/DOCX](../../../Fadi%20Concept/README.md). Il formalise la barre d’outils, les repères et plans de travail, les origines de composants, la persistance, les limites de recherche et 20 scénarios de recette futurs.

Vérification documentaire : mêmes 356 blocs de contenu et 25 liens dans les deux formats ; titre et version concordants ; rendu Word de 13 pages contrôlé visuellement ; trois empreintes d’archives sources vérifiées. Ce contrôle ne constitue pas une recette de Fadi. L’accès navigateur au Sandbox a échoué ; les constats applicatifs reposent sur le code épinglé. Aucun test applicatif, changement de code, migration, déploiement ou modification du registre des 630 obligations dans ce lot.

- Vérifié documentairement : paire Axes v1.0, parité, rendu Word et index.
- À faire : revue métier et technique du concept, puis éventuel cadrage de la phase A.
- Aucun état du programme #156 ou des obligations Studio n’est promu par cette tâche.

> Mise à jour du 21 octobre 2026 : pour l’état courant, lire STATUS.md et HANDOFF.md. Les références et instructions datées de Mission 004 ci-dessous sont historiques ; la consolidation #209 et les lots ultérieurs sont déjà dans main. Aucun changement des 630 obligations ou de leur acceptation n’est inféré.

## En cours

- STUDIO-V1 — [PR #181](https://github.com/RachEma-ux/Fadi/pull/181) : parcours 2D persistant vérifié (52 contrôles réels), fusion autorisée par le propriétaire ; conserver les registres #172 et raccorder les apports concurrents #178–#180 à un seul socle. Recette personnelle et MVP complet non déduits de la fusion.

Branche documentaire canonique `docs/156-codex-missions-completes`, continuation [PR #172](https://github.com/RachEma-ux/Fadi/pull/172) en brouillon. Dernier checkpoint publié et vérifié avant cette mise à jour : `0e0b386b4ac2711ee394d9907da943f050600b42`. Main observée `817bd36e7d4b1ab60ab9c00309509c7cdfed0798`, non protégée. Une autre session a fusionné #165 le 18 octobre à13:41:12 UTC (head fa9f0db, merge817bd36) ; A0 n’a effectué aucune fusion. PR #169 draft à `9b34dca9de8c3d1432d6f19315e4f0049d8bfd01` et #171 draft à `25bca793c483bcb99c5254a86efabbd1f8b29015` restent distinctes et non fusionnées.

**31 missions ouvertes :25 En cours,6 Bloquées** (M03/M18/M19/M20/M22/M28). Les dépendances sont locales aux opérations. Registre unique : **22 À définir /58 À faire /292 En cours /209 Bloqué /47 Vérifié documentaire /2 Accepté cadrage G0 =630**. Les 203 définitions ont été revues individuellement ; leur qualification ne clôt pas les obligations. Quinze obligations documentaires REP-02..09, ADR-04, COEX-02, ADR-01/02 et PROV-03..05 ont une preuve et deux revues indépendantes selon leur nature. **P630=49/630=7,8% documentaire/cadrage ; PDEV=N/D**, faute de DEV_SCOPE et baseline acceptés. Aucune case source/HTML cochée ni fonctionnalité Studio acceptée.

G0 demeure accepté pour cadrage documentaire uniquement (décision6250109830, dossier7b0cca4). G1–G4 ne sont pas acceptés. DEC01/03 et D07 sont exploités dans la portée déjà acquise ; décisions physiques, personnes/disponibilités et preuves aval restent distinctes. A0 et les six sous-agents A1/A2/A3/A4/A5/A6 ont réellement exécuté les travaux référencés.

## À faire

1. Revalider main/#172/#169/#171 et lire les nouveaux commentaires #166 ; ne pas relancer l’audit125 ou l’extraction141 déjà prouvés.
2. Les questions A0 sont **déjà publiées** : [G1-EXPERIMENTAL](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250904693), [G2-HARNESS](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250905795), [M08-DOC-SCOPE](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250906743). Lire leurs réponses, ne pas les dupliquer. ADR03-NAV est également publié dans166 sous6251292271, avec les cinq réserves de portée. Les questions Claude COEX01/03/04/05-06 sont6250995231/6250996328/6250997313/6250998834 ; réserves A2/A5 à rapprocher avant toute adoption.
3. Compléments documentaires exécutés et liés aux20 IDs : COEX03,10PERF, association/historique, spatial/rendu, navigation/ADR, cadrage I/A.1, plus M05/M07. Aucun état/gate/P630 changé. A0 publie les pièces et checkpoints ensemble sur172 ; les deux revues finales A2/A5 de l’association sont favorables pour préparation seulement,20sous-cas et46citations vérifiés sans écart.
4. Les matrices NEXT-READY-POST203 des six agents et RESIDUELS-CONSOLIDATION-A0 donnent les déclencheurs par ID. Les suites documentaires précisément identifiées ont leurs remises ; recevoir une réponse ou pièce nouvelle avant approfondissement non redondant. La remise Claude6251213726/b6794c6 est reçue et revue : cinq obligations PROV/ADR vérifiées documentairement, ADR Proposé. La questionADR03 est publiée6251292271. Réconciliation CI169/171 revue A5/A6 et poussée sur les branches existantes (9b34dca/25bca79), fichiers des lots conservés, gardes avant services contrôlées. Leurs nouvelles CI ont réussi, avec129/492 tests purs et types/build ; logs et skips au SHA exact consignés dans CI-169-171-RECONCILIEES-A0.json. Aucune acceptation métier/DB3/fusion déduite. Continuer toute autre action nouvelle autorisée indépendante. Un gate futur assez défini reste À faire tant que ses conditions manquent ; aucune recette, personne ou mesure inventée.
5. Après chaque checkpoint : contrôles documentaires, diff/liens/empreintes/publicabilité, commit avec identité publique, push normal de la branche existante, CI au SHA exact, CODEX-PROGRESS dans166. Aucun helper amont --ecrire utilisé ; réserves P1/P2/P3 de sa revue conservées.

## Bloqué

| Opération | Responsable | Condition et prochaine action |
|---|---|---|
| G1/contrats physiques/pilote | A0/A1/A2 | Réponse au dossier exact, preuves manquantes par condition ; orientations déjà acquises non remises au vote |
| G2/harness et Studio I/A/B/X… | A0/A2/A3/A5/A6 | Autorisation bornée, portes applicables, confinement attesté avant exécution ; aucun code commencé |
| COEX01/03/04/05/06 | A2/A0 | Questions déjà ouvertes ; autorité serveur≠clientUI, readOnlyUI≠refusserveur, portée des transferts encore proposée |
| Mesures/corpus/DEV_SCOPE/personnes | A1/A4/A5/A6/A0 | Données/contrats/budgets/décideurs réels à fournir ; protocoles restent préparations |
| Protection main / revue146-152 | A6 | Accord administratif distinct ; politique D05solo et ordre D06 conservés |
| DB3/services/migration/sauvegarde/production/fusion | Responsables missions.json | Cible attestée et autorisation applicable à chaque opération ; aucune extrapolation depuis CI ou décision technique |

## Critères de sortie

Un ID n’est clôturé que selon son obligation source et sa preuve exacte. La qualification203 est préparation ; quinze obligations documentaires supplémentaires sont vérifiées.31 missions restent ouvertes. Source/HTML inchangées ; conformité, tests, acceptation métier et statut sont distincts.

## Terminé

Sous-tâches documentaires et correctifs autorisés vérifiés sur leurs branches seulement. Aucune des31 missions ni fonctionnalitéStudio déclarée terminée.

