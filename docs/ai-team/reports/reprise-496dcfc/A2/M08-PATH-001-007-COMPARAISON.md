# M08-PATH-001 à M08-PATH-007 — comparaison statique A2

Référence documentaire `496dcfc7bf80868ef21216d667187087db32a738` ; code candidat exact `a15d65044ca4454bf3159f4155e51465b2a70a2c` (PR169, aucune fusion main déduite). Six décisions et directive #166/6250119063 lues ; G0 de cadrage désormais accepté dans son périmètre, orientations DEC01/03 acquises sans clôture physique. Elles ne constituent pas des preuves métier des anciennes recettes.

**Aucune équivalence complète des sept oracles historiques démontrée.** Les clauses des sept lignes sont décomposées en **49 sous-attendus : un présent, 24 partiels, 24 absents** dans leurs candidats. Le présent est uniquement la préparation de copie P.118 de l'entrée002, pas un scénario réussi. Les cinq fiches complètes sont conservées dans le JSON, avec 39 lignes complémentaires de contrôles/cycle/géométrie/concurrence/droits classées **non conclu**, sans les compter comme49 nouveaux résultats ou obligations réalisées.

| Identifiant exact | Comparaison des assertions candidates |
|---|---|
| M08-PATH-001 | Refus repère non local absent ; unités, longueur, calque verrouillé, IDs et inverse testés surtout pour murs, pas esquisse. Le titre du test « état intact » ne remplace pas une comparaison explicite après refus. |
| M08-PATH-002 | Copie P.118 préparée, mais gestes sur niveau Essai lot3a à20m, tracé de murs. Pas ligne d'esquisse mezzanine, coordonnées inspecteur exactes, +1 par geste ou révision inchangée après zoom/pan/mode. Second navigateur vérifie murs/pièce, pas cette recette. |
| M08-PATH-003 | Pas refus a=b/largeur0 ni coins rectangle90° ou aire longueur×largeur dans les candidats. Un rectangle valide sert à d'autres tests ; l'inverse exact concerne un lot mur/porte/niveau. |
| M08-PATH-004 | Aucun scénario navigateur de rectangle esquisse par coins/grille0,50 ou dimensions, inspecteur et poignée de coin. Undo/redo/navigateur2 existent pour d'autres objets. |
| M08-PATH-005 | Aucune spline cinq points et poignée de point dans le candidat navigateur ; tests de murs/pièce ne démontrent pas le scénario spline. |
| M08-PATH-006 | Émulation tactile du candidat teste sélection/orbite/pincement3D. Pas main levée2D/tolérance/+1 ; pincement ne compare pas révision ou absence de commande. |
| M08-PATH-007 | Polyligne contrainte horizontal/angle, pas quatre lignes en rectangle. Libellé degrés de liberté vérifié sans valeur4. Cote à réparer après scission de mur ≠ contrainte d'esquisse à réparer dans panneau des problèmes ; pas undo ni deuxième navigateur correspondant. |

Neuf sources complètes empreintées (cinq fiches, quatre candidats). **204 occurrences de citations exactes, 128 citations uniques** selon fichier/ligne/SHA/texte, incluant sources historiques, invariants contextuels et preuves d'assertions. JSON donne le prédicat brut, son niveau et sa limite ; aucune ligne stripée. Mapping125 identique au checkpoint496 et laissé intact ; acceptation historique D-174 et suivis ultérieurs inchangés.

Ce rapport distingue trois niveaux : unité pure web/modèle, intégration API non substituée, navigateur. Il ne déduit ni absence de fonctionnalité du dépôt entier, ni succès courant, ni conformité de toute fiche. Les 39 lignes de contexte non conclues signalent la couverture supplémentaire à décomposer avant toute affirmation globale. Aucun test, import de code applicatif, DB, navigateur, service ou réseau lancé. Python standard sert uniquement à lire les sources Git et produire le rapport.

A5 relit indépendamment les verdicts et les refus/inverses/invariants. A0 seul intègre les preuves et met les checkpoints à jour. Ensuite inventaire CLASSIF1 sous autorisation6250110849, conjoint A2/A5 avant tout code A3 ; aucune correction de code ou de données par cette comparaison.
