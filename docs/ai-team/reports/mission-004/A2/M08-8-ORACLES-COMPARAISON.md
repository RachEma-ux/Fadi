# M08 — Comparaison bornée de huit oracles historiques

**Aucune des huit équivalences E2E n'est démontrée.** Les huit lignes historiques de validation navigateur sont décomposées en **52 sous-attendus : 7 présents, 27 partiels, 18 absents dans les candidats examinés**. Les sept présents correspondent seulement aux préparations de copies de travail P.118 ; pas sept scénarios réussis. Trois compléments export/import bibliothèque, CSV propriétés et CSV journal sont classés non applicables à l'oracle précis qu'ils ne remplacent pas.

Référence du mapping conservé : `a4caaab0e6665480f09febe3914c960b424b6b47`. Comparaison sources actuelle : branche PR169 `a15d65044ca4454bf3159f4155e51465b2a70a2c`, sans prétendre sa fusion sur main. Quinze fichiers sources complets acquis et empreintés ; huit fiches intégrales contextualisées, recherches sur les candidats complets, prédicats pertinents et leur préparation relus. Les seules différences depuis la référence du mapping concernent le câblage du reset protégé dans le test API ; ses assertions sont inchangées. Chaque citation du JSON donne ligne historique et ligne courante exacte, SHA256 et SHA Git ; aucune ligne stripée.

| Entrée / fiche | Ce qui reste non démontré au niveau navigateur historique |
|---|---|
| 008 / DA-01-08 | Longueur pilotante d'un rectangle modifiée dans inspecteur, exactement +1 révision, annulation de cette valeur, comparaison second navigateur. Unité distance et E2E horizontal/angle ne suffisent pas. |
| 053 / DA-03-09 | Épaisseur du mur P.118 exact et porte cible gardant t=0,5, undo des mêmes valeurs. Comparaison second navigateur existe dans un scénario différent, donc partielle. |
| 079 / DA-05-07 | État bibliothèque vide, deux blocs même bibliothèque, recherche/placement, liste identique après recharge et révision partagée. Export/import est une extension distincte. |
| 080 / DA-05-09 | Composant, trois occurrences, surcharge et comptage3 dans navigateur, undo et synchronisation. Unité compte2 composants ; E2E compte2 blocs simples. |
| 089 / DA-06-07 | Propriété du mur exact, héritage et surcharge d'un type de mur, retrait/undo et recharge identiques avec provenance/statut, deuxième navigateur. CSV objet n'est pas cette recette. |
| 091 / DA-06-08 | Tous non classés initialement, IfcWall affecté à un type/hérité, undo/recharge/synchronisation. Code CFC mur dynamique constitue une couverture partielle seulement. |
| 122 / DA-21-06 | Trois modifications par deux navigateurs, panneaux identiques, ordre sur mur P.118 exact et historique conservé après undo. API ordonnée et inspecteur unique donnent preuves partielles à autre niveau. |
| 123 / DA-21-07 | Bilan Harmonie périmé restant consultable avec source, révision/empreinte après recalcul demandé et synchronisation navigateur. Tableau périmé et journal CSV ne démontrent pas le bilan. |

Une divergence d'oracle apparente est conservée pour arbitrage : DA-06-08 lignes11/19 dit ne pas déduire la classe IFC de la classe Fadi, alors que `commandes.test.ts:279–281` (numéros identiques aux deux références) attend `classeIfc=IfcWall`, provenance `regle`, statut `verifiee` après affectation d'un code Uniclass. Il faut rapprocher les décisions applicables, notamment D-111 et les évolutions, avant de remplacer la référence historique. Cette observation statique ne désigne pas le comportement technique correct et ne réécrit aucune décision.

Les assertions présentes sont des sources lues, jamais des résultats exécutés. Les absences sont bornées aux candidats de chaque entrée, pas au dépôt entier ni aux capacités du produit. L'héritage de composant dans `bloc.test.ts`, cité ailleurs par la fiche propriétés, n'est pas importé silencieusement dans l'entrée089 dont le mapping ne le contient pas. L'acceptation historique D-174 reste intacte ; mapping125, fiches et tests inchangés. Aucun test, DB, navigateur ou réseau lancé.

A5 doit relire les52 propositions et préciser les oracles manquants ; A0 intègre les preuves sans substituer automatiquement les anciens chemins. Les réalisations ou recettes mutatrices nécessitent leurs autorisations propres ; cette comparaison ne clôt pas M08.

Décompte précis des preuves : **183 occurrences de citations exactes, 131 citations uniques** (clé fichier/ligne/SHA/texte). Le compteur178 initial couvrait seulement les52 sous-attendus ; s’y ajoutent3 preuves des suppléments non équivalents et2 du constat classification. Ces décomptes ne sont ni des tests ni des obligations réalisées.
