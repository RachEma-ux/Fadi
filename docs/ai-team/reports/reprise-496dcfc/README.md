# Reprise du programme #156 depuis496dcfc

Les sept entrées M08-PATH-001 à007 sont analysées en lecture seule, revues indépendamment et rapprochées par A0. Le programme M00–M30/630IDs continue. Aucun audit global ou test DB-1/2 déjà prouvé n’a été recommencé.

## Décisions reçues et portée

[Export des six décisions et de la directive](decisions-166.json) ; auteur GitHub réel et marqueurs ChatGPT sont conservés, sans inférer une identité différente. CI documentaire6250109536 autorisée ; G0 de cadrage6250109830 accepté sur dossier7b0cca4, réserves maintenues ; DEC01/03 optionsA6250110124/0501 retenues pour spécification ; CLASSIF1 pur6250110849 autorisé après inventaire ; CSP/KML6250111226 optionA préparatoire sans header ni domaine approuvé par inférence. ACK6250149589 effectivement publié.

## M08 — analyse et revue réellement exécutées

- [A2, sept entrées et sources exactes](A2/M08-PATH-001-007-COMPARAISON.json) ; [rapport lisible](A2/M08-PATH-001-007-COMPARAISON.md).
- [Lecture indépendante A5](A5/M08-001-007-REVUE-INDEPENDANTE.json), puis [confrontation de chaque verdict A2](A5/M08-001-007-CONFRONTATION-A2-A5.json) et [synthèse](A5/M08-001-007-REVUE-INDEPENDANTE.md).
- 49sous-attendus A2 : une préparation présente,24partiels,24absents ;39lignes de contexte restent non conclues. A5 a découpé48atomes indépendamment : les deux lectures et leurs différences de grain sont conservées, pas artificiellement égalisées.
- 9 sources àa15d650,204citations/128uniques exactes contrôlées A0. Aucune équivalence complète d’un oracle historique n’est démontrée. Une recette de murs/pièce n’est pas une recette de lignes/rectangles/splines/mainlevée ; une regex de degrés de liberté sans chiffre4 ne prouve pas cet attendu.
- Aucun test, DB, service ou code applicatif exécuté pour cette analyse ; aucune acceptation historique ou fiche/mapping125 modifiée.

## G0 et registre630

[Acte d’acceptation G0](A1/G0-ACTE-ACCEPTATION-DOCUMENTAIRE.json), [delta individuel de quatre IDs](A1/G0-DELTA-4-IDS-PROPOSE.json), [revue A4](A4/REVUE-G0-ACTE-DELTA4.json). La décision accepte le cadrage du dossier exact, pas la faisabilité ou le produit. G0-01/02 sont Vérifié documentaires, G0-03/CAD-DEC-01 Accepté cadrage documentaire. Personnes et disponibilités CAD-DEC-03 restent à définir ; G1–G4 non acceptés.

Compteurs du registre unique :203Àdéfinir/186Encours/207Bloqué/32Vérifié/2Acceptédocumentaires. **P630=34/630≈5,4% documentaire/cadrage, PDEV=N/D.** Zéro case source/HTML cochée ; aucune fonctionnalité Studio acceptée,31missions encore ouvertes. Les141fiches et18DEC physiques restent des préparations, pas des capacités validées.

## CI documentaire sans base

[Implémentation A6](A6/CI-DOC-IMPLEMENTATION.md), [11contextes/6diffs/5bases invalides](A6/CI-DOC-CONTEXT-PROOFS.json), [revue A0 de conservation des anciens jobs](CI-REVUE-A0.json). Le tuple exact event/repo/headrepo/head/base seul sélectionne le job documentaire. Diff hors allowlist : jobpur échoue avant contrôles, jobsDB restent skipped. Sur les autres contextes, les trois définitions applicatives restent inchangées. Aucun service, installationnpm ou lancement API/E2E/migration dans le jobpur ; pas de skipCI générique.

La présence surGitHub et les conclusions des nouveaux jobs seront relevées au SHA exact après push. Les skips validate/e2e/image ne sont jamais des réussites d’intégration ; aucune fusion autorisée.

## Travaux indépendants suivants

[CSP/KML après décision](A4/CSP-KML-DELTA-DECISION.md) et [neuf cas documentaires](A4/CSP-KML-CORPUS-DOCUMENTAIRE.json) : sources HTTPS identifiées distinctes des origines effectivement approuvées, fallback neutre et refus visibles sans géométrie modifiée. Aucun réseau/header/enforcement exécuté.

CLASSIF1 : [inventaire A2](A2/CLASSIF1-INVENTAIRE-A2.md) et [revue conjointe A5](A5/CLASSIF1-REVUE-CONJOINTE-A5.json) satisfaits :42sources,216citations, aucun effet exigeant une extension de code identifié dans le périmètre statique. A3 est activé dans la branche dédiée indépendante `fix/156-classification-no-ifc-inference`, A5 réserve ses tests indépendants et A6 son workflow pur. Aucun résultat de code ou test n’est anticipé. Les schémas G1 sous orientations retenues sont préparés séparément sans code/SQL/POC. A0 intègre ces livrables successifs et poursuit une cohorte M08 non déjà analysée ; une PR en attente ne bloque pas les tâches indépendantes.

[Manifeste de provenance](manifest.json) : pièces agents copiées à octets identiques, pas auxiliaires de génération ou journaux bruts. Les contrôles source/citations sont documentaires et ne prouvent aucune recette produit.
