# Reprise #156 depuis496dcfc — consolidation A0

Les six décisions déléguées et la directiveM08 sont appliquées dans leur portée. [Décisions originales](decisions-166.json), [ACK](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250149589), [progrès](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250524386). Les 31 missions restent ouvertes ;25 En cours et6 Bloquées. Aucun résultat préparatoire n'est présenté comme une réalisation Studio.

## Résultats réellement vérifiés

- **M08 :125 analyses et125 revues documentaires**, dont 8 historiques réutilisées. [Synthèse](M08-SYNTHESE-A0.md), [index individuel](M08-INDEX-A0.json), [contrôle A0](M08-CONSOLIDATION-A0.json). Première priorité001–007 traitée A2/A5/A0 ; deltas et grains de comparaison conservés. Aucun scénario exécuté ni équivalence complète déduite. Les trois fiches portent désormais une annotation de lecture ; [revue A5](A5/M08-REVUE-ANNOTATIONS-A5.json), corps/D174 inchangés, trois écarts encore ouverts.
- **CLASSIF-1 : PR171 draft à5e0285d37f23c7c539502664036f0a2ff0986409**, [rapport A3](A3/CLASSIF1-RAPPORT-A3.md), [24 cas A5](A5/CLASSIF1-TESTS-ET-REVUE-A5.json), [revue A2](A2/REVUE-CLASSIF1-FINALE-A2.json), [empreintes A0](CLASSIF1-REVUE-A0.json).492 tests purs/107 fichiers, types/build réussis ; [CI39130408506](A6/CI-171-observation.json) au même SHA. Trois jobs intégration skipped avant services. Aucune réparation de données anciennes, aucun moteurIFC/UI/API/schéma modifié, main non corrigé par une PR ouverte.
- **CI documentaire :** cinq contrôles réussis à fa9f0db232f49007c5a8bebded4ffce530a5bf8f, [preuve distante](CI-165-fa9-observation.json). Les succèsb102 sont [leur snapshot](CI-165-b102-observation.json), pas une preuve sur un SHA futur. Les 129 tests DB1/2 dePR169/a15 restent historiques, sans rerun ou base réelle.
- **G0 et630 :** [acte](A1/G0-ACTE-ACCEPTATION-DOCUMENTAIRE.json) et delta4IDs uniquement.203 À définir/186 En cours/207 Bloqué/32 Vérifié documentaire/2 Accepté cadrage documentaire. **P630=34/630=5,4% ; PDEV=N/D**. Zéro case source/HTML et aucun statut supplémentaire changé dans630.

## Préparations terminées, pas de gate ou code implicite

[Dossier G1 à arbitrer](G1-DOSSIER-ARBITRAGE-A0.md), [modèles logiquesv2](A1/G1-COMPLEMENTS-M17-M24-DEC01-DEC03-v2.md), [traçabilité11fonctionsv2](A1/G1-ONZE-FONCTIONS-TRACABILITE-A1-v2.json), [delta A1](A1/G1-ONZE-FONCTIONS-TRACABILITE-A1-v2-DELTA.json).53 exigences sélectionnées,88 conservées hors sélection ; catalogue de 38 oracles dont 27 liés comme candidats. La v1 et la revue initiale restent des preuves datées, pas les compteurs actifs. [Index G1 revu A4](A4/G1-INDEX-REVUE-CIBLEE-A4.json), [NAVdelta](A4/NAV-DELTA-G1-v2.json), [dix choix M05/M17](A2/M05-M17-CHOIX-RESIDUELS-A2.json). Aucun DEV_SCOPE défini par cette sélection ; DEC01/03/D07 acquis non remis au vote, décisions physiques et G1–G4 ouvertes.

[Proposition G2A0](G2-PERIMETRE-A0-PROPOSE.md), [graphe public A2](A2/G2-GRAPHE-IMPORT-PUBLIC-A2.json), [étude harness A3](A3/G2-FAISABILITE-HARNESS-A3.json), [revue finale A6](A6/REVUE-G2-FINALE-A6.json). Six sources proposées dont supervisor.py, binaire esbuild existant→stdout borné→artefact inédit→Node direct. A0 intègre la réserveA6 sur le typecheck : quatre invocations, pas trois avec un lancement caché. Bornes30s/16 fichiers/8Mio proposées, pas mesures ni budgets produit acceptés. Aucun code/harness/bundle/import/POC créé ou exécuté. Confinement réel et accord restent requis.

[DEC18,12 familles A3](A3/DEC18-MOTEURS-PUBLICS-CANDIDATS.json), [revue licences/frontières A6](A6/REVUE-DEC18-A6.json) : API publiques et modules internes distingués, wrapperOCCT et WASM distincts ; droits propres/distribution/transitifs non certifiés. Une frontière statique sans initialisation n'affirme pas que toutes les fonctions d'un package sont pures.

[R4 CSP/observabilité](A5/R4-M09-RAPPROCHEMENT-A5.json), [R5 lacunes S1–S7](A5/R5-M15-M26-LACUNES-CORPUS-A5.json) : neuf casKML reliés aux oracles existants, sept fixtures toujours partielles, pas TEST039. Aucune origineKML réelle approuvée par inférence depuis MapTiler. Alertes inconnues, refus400duconnecteur distinct d'un403GitHub, pas zéro vulnérabilité. Aucun scan, header ou chargement réseau.

[M03,delta aux dossiers146/152](A6/M03-DELTA-CHECKS-PURS-AVANT-FUSION.json), [réconciliation165/169/171 proposée](A6/CI-RECONCILIATION-165-169-171-PROPOSEE.json). Conditions partagées à combiner explicitement ;169 ne teste pasgithub.repository. Les trois jobs purs ne doivent pas être requis globalement sur les autres PR. Le pushmain rendraitDB/migrations éligibles : aucune fusion ou administration implicite. D05solo et ordre de revue154→152→142 conservés.

## Provenance et rectification

[Manifeste des copies](manifest.json), octets et versions conservés. A1v2 unités094–124 : utiliser annexe_resolution/QA13/28/94 ; le champ contrôle initial14/26/95 reste historique. A1READY cite un commit local77e4644 remplacé avant publication parfa9 pour identitépublique : même arbre49711d433e47cfc7bc546879d33c97b7dadb23b9, aucune présence distante77 inférée.

[Rectification explicite M002](RECTIFICATION-ARCHIVES-M002-A0.json) :19 fichiers inventoriés,14 archives non redondantes ; cinq éléments référencés sans duplication, **pas cinq originaux perdus**. Anciens fichiers autonomesINV/IF/AC/DEC non retrouvés, informations intégrées/extractions ultérieures de provenances distinctes. Les premières synthèsesA0 qui affirmaient cette perte sont erronées, pas le manifeste de récupération.

## Suite exacte

Le [parcours31 missions](A1/M00-READY-M00-M30-A1.json) est réconcilié dans missions.json ; les six actions proposées sont remises, avec complémentsG2/CI/traçabilité et annotations. Les questions nouvelles Q-P156-G1-EXPERIMENTAL, Q-P156-G2-HARNESS, Q-P156-M08-DOC-SCOPE passent dans166 après publication de ces pièces. Aucune réponse n'est présumée. Reprendre ensuite la première sous-tâche devenue READY dans sa portée ; ne pas refaire les préparations déjà prouvées.

DB3, services, migrations, sauvegardes, admin, fusion et production restent soumis aux accords spécifiques ; codeStudio/POC aux portes et autorisation bornée. Environnement43 running ne prouve pas la santé API/DB. Les succès1757/47/3 restent historiques. A0 et A1/A2/A3/A4/A5/A6 ont réellement exécuté les travaux cités ; aucun agent seulement planifié n'est compté. Le dernier SHA/CI se lit dans166 après push, sans promesse d'exécution en arrière-plan.
