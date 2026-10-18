# G1 — dossier borné à instruire, sans acceptation

Les orientations DEC01/DEC03 et D07 sont acquises. Le dossier ne les remet pas au vote. G0 est accepté pour le cadrage documentaire ; G1–G4 restent non acceptés jusqu'à une décision effective citant son périmètre.

## Pièces réutilisées et apports nouveaux

[Index des onze fonctions I/A.1](A1/G1-INDEX-PREMIER-SOUS-ENSEMBLE-I-A1.md), [compléments logiques v2](A1/G1-COMPLEMENTS-M17-M24-DEC01-DEC03-v2.md), [schémas](A1/G1-SCHEMAS-LOGIQUES-DOCUMENTAIRES-v2.json), [exemples documentaires](A1/G1-EXEMPLES-DOCUMENTAIRES-2D-IDENTITES-v2.json). [Revues A2](A2/REVUE-G1-DEC01-DEC03-V2-A2.json) et [A4](A4/REVUE-G1-COMPLEMENTS-v2.json) ; [revue ciblée des quatre conditions officielles](A4/G1-INDEX-REVUE-CIBLEE-A4.json).

[Traçabilité proposée des onze fonctions](A1/G1-ONZE-FONCTIONS-TRACABILITE-A1-v2.json) :53 exigences sélectionnées et88 conservées hors sélection, soit les 141 sources existantes sans suppression ni nouvel identifiant. Liens explicites et rapprochements proposés sont distingués. Le catalogue de38 oracles (dont 27 liés comme candidats), les exemples G1v2 et fixtures S1/S6 sont réutilisés, sans clone ni test exécuté. Une sélection de traçabilité n'est ni DEV_SCOPE ni preuve de couverture.

[Dix choix résiduels de compatibilité M05/M17](A2/M05-M17-CHOIX-RESIDUELS-A2.json) : catalogue des versions, adaptation des commandes, archives/champs inconnus, publications héritées, IDs/anciens forks, déduplication, snapshot cohérent, canonicalisation, loader public et clients offline. La provenance des observations Atelier est datée, pas présentée comme nouveau test du code courant.

[Delta NAV](A4/NAV-DELTA-G1-v2.json) : neuf critères existants, seize cas futurs proposés, aucune route/UI réalisée. [Lacunes S1–S7 et liens aux 38 oracles](A5/R5-M15-M26-LACUNES-CORPUS-A5.json) : scènes partielles, choix de seuils DEC13 localisés, pas budget inventé ni corpus complet déduit de fixtures.

## Qualification proposée des conditions

| Condition source | Constat documentaire | Décision attendue |
|---|---|---|
| G1-01, contrats/navigation/outils/modèles/droits/historique/migrations/risques | Pièces rassemblées et revues, candidatures physiques signalées | Figer versions utiles au périmètre engagé et distinguer choix préalables de ceux réellement différables |
| G1-02, toutes les exigences dans la traçabilité |141 textes normatifs exacts déjà conservés et validés ; nouveau rapprochement53/88 proposé | Recevoir les preuves existantes et qualifier les nouveaux liens, sans refaire l'extraction ni déduire conformité du nombre |
| G1-03, une source et un contrat vérifiable par fonction |Onze fonctions indexées, liens et lacunes par fonction ; certains contrats restent candidats | Arbitrer les points indispensables au sous-ensemble exact, pas exiger une implémentation produit ou mesures G2 comme condition artificielle de spécification |
| G1-04, résultat et points ouverts enregistrés |Présent dossier en instruction seulement | Publier une décision explicite, périmètre/versions/revues/réserves, puis checkpoint A0 ; aucune acceptation par le seul dépôt des fichiers |

La preuve normative141 se trouve dans [validation v2](../mission-004/A1/validation-141-v2.json). Les textes, identifiants, blobDOCX et paragraphes sont inchangés ; les sélections nouvelles doivent garder leur propre revue. Les résultats d'implémentation, de tests et d'acceptation restent des champs distincts.

## Proposition d'arbitrage

Option recommandée à examiner : qualifier G1 pour le **seul périmètre expérimental logique** document2D autonome + identités + sauvegarde/réouvertureJSON synthétique, si l'autorité estime ses contrats vérifiables et ses réserves admissibles. Cette décision éventuelle ne vaut pas G1 accepté pour la réalisation générale I/A.1 ou Studio. Elle doit citer les conditions satisfaites et celles restant insuffisantes, sans créer de nouvelle porte ou escamoter G1-01..04.

Alternative : maintenir G1 en instruction pour ce périmètre également et désigner les contrats/propositions précis à compléter avant tout POC. Le seul nombre de fichiers ou une lecture statique favorable ne constitue pas un motif d'acceptation.

Dans les deux options, le POC exige encore son autorisation bornée propre et ses préconditions d'exécution ; G2 sera décidé sur des preuves réellement obtenues et G3 sur le sous-ensemble de réalisation. Aucun code Studio, migration, donnée réelle, service, administration, fusion ou production n'est autorisé par ce dossier. Personnes/disponibilités CAD-DEC-03, coûts mesurés et choix physiques non arrêtés restent explicitement inconnus.

[Revue finale A2 du delta de traçabilité](A2/G1-ONZE-FONCTIONS-REVUE-A2-v2.json) : six liaisons corrigées, partition53/88 et27 TEST candidats distincts dans un catalogue38 ; les trois réserves initiales sont levées dans cette seule portée documentaire.
