# M08-PATH-001..007 — revue indépendante et confrontation A5

Référence code : `a15d65044ca4454bf3159f4155e51465b2a70a2c`, checkpoint `496dcfc`. Lecture seule : zéro test, application, API, DB, service ou réseau exécuté. Cinq fiches complètes distinctes pour sept entrées, neuf fichiers source. Le mapping125 reste inchangé.

Deux lectures originales conservées : A5 décompose48 sous-attendus (5 préparations présentes,17 analogies partielles,26 absences bornées) ; A2 décompose49 (1présent,24partiels,24absents), plus39 lignes contextuelles non conclues. **Ces compteurs ne doivent ni être égalisés ni additionnés.** A5 sépare copie/mezzanine dans chaque E2E ; A2 regroupe cette condition pour004–007 mais sépare davantage gestes/invariants (zoom/pan/mode, undo/redo, tolérance/validation et suppression/panneau). Les cinq «présents» A5 sont uniquement la préparation de copies, jamais cinq comportements métier couverts.

Confrontation du JSON A2 `7374fb3b4ff38899f4690971333ed1598920502af3fc387a41e4c29765598902` :49 qualifications bornées acceptables,0 rejet,0 erreur parmi204 occurrences/128citations uniques et9 empreintes sources. Chaque attendu, justification et extrait Git exact relu est enregistré dans `M08-001-007-CONFRONTATION-A2-A5.json`. «Partiel» qualifie souvent un analogue sur un autre objet : **aucune preuve complète du prédicat historique**. Aucun faux succès applicatif n’est déclaré.

Écarts de grain explicites :

- PATH002 révision : A5 absent pour +1 par ligne ; A2 partiel via attente > après undo mur. Les deux constatent que l’égalité exacte +1 par geste de ligne manque ; conserver l’oracle, ne pas l’affaiblir.
- PATH007 quatre lignes : A5 analogue partiel par polyligne horizontale ; A2 absent pour quatre lignes jointives. La qualification A2 est plus précise sur ce prédicat historique. Le code testé n’est pas un rectangle de quatre lignes/coïncidences.
- PATH007 à réparer : A5 groupe suppression/panneau absent ; A2 isole cotation de mur scindé comme analogue partiel. Ni une cotation ni sa couleur ne prouvent l’état d’une contrainte et son panneau après suppression de ligne.

## Refus, inverse et invariants

`commandes.test.ts:192` annonce atomicité mais le refus aux lignes194–197 n’est pas suivi d’une comparaison intégrale de l’état d’entrée. L’inverse est réellement comparé JSON ligne205, mais pour un lot murs/porte/niveau. Ne pas transférer cette preuve à une esquisse/rectangle. `atelier-nouveau.mjs:150–155` annule/rétablit un renommage de pièce ; le second contexte353 compare murs/pièce/barre. Ni la relecture spline ni la révision+1 d’un tracé n’en découlent. `atelier-documents.mjs:186` teste le libellé degré(s) de liberté sans chiffre4 ;142 concerne une cotation après scission de mur. Un test présent et une attente «Enregistré» ne sont pas une validation métier.

Les39 lignes contextuelles (cycle, contrôle, géométrie, verrou, concurrence, droits/offline) restent non conclues dans A2. R10, refus atomiques avec entrée profonde inchangée, références, identité, inverse exact par objet, prévisualisation vs persistance et droits exigent leurs preuves spécifiques. Aucun remplacement de chemin historique, réécriture D174, test DB/E2E, acceptation gate ou case P630 effectué.

## Verdict par attendu A2

| Attendu | Classe A2 revue | Avis A5 / justification indépendante bornée |
|---|---|---|
| M08-PATH-001-A01 — repère non local refusé | absent | Acceptable : Aucun appel d’esquisse invalide en frame non local dans les deux candidats. La projection écran/local n’est pas ce refus. |
| M08-PATH-001-A02 — unité incompatible refusée | partiel | Acceptable : Refus sans unité/cm explicite, mais sur mur.tracer et son épaisseur ; pas sur esquisse/points. |
| M08-PATH-001-A03 — longueur sous tolérance refusée | partiel | Acceptable : Longueur de mur nulle refusée ; aucun segment d’esquisse non nul sous le seuil déclaré. |
| M08-PATH-001-A04 — calque verrouillé refusé | partiel | Acceptable : Le refus porte sur mur.tracer, pas esquisse ; test de gomme conserve objet verrouillé mais autre commande. |
| M08-PATH-001-A05 — même enveloppe → mêmes identifiants | partiel | Acceptable : Identité déterministe testée pour mur ; aucun double rejeu de la même enveloppe d’esquisse. |
| M08-PATH-001-A06 — inverse ∘ commande = état initial identique | partiel | Acceptable : Inverse exact pour lot mur/porte/niveau, pas lot esquisse. |
| M08-PATH-002-A01 — copie de travail de P.118 | présent | Acceptable : Préparation par import exemple, copie modifiable vérifiée ; pas scénario exécuté. |
| M08-PATH-002-A02 — mezzanine | absent | Acceptable : Gestes sur niveau Essai lot3a créé à20m ; le niveau importé secondaire seulement visité sans tracé de ligne. |
| M08-PATH-002-A03 — ligne tracée au clavier puis au pointeur | partiel | Acceptable : Murs tracés avec souris et saisie4;0 ; aucune esquisse.ligne testée au navigateur. |
| M08-PATH-002-A04 — coordonnées de l'inspecteur égales aux valeurs saisies | absent | Acceptable : Inspecteur vérifie nom de pièce/hauteur mur et déplacement, pas coordonnées égales à la ligne saisie. |
| M08-PATH-002-A05 — révision +1 par geste | partiel | Acceptable : Attend enregistré ou >ancienne révision après undo déplacement, sans égalité+1 à chaque tracé de ligne. |
| M08-PATH-002-A06 — relecture au second navigateur | partiel | Acceptable : Second navigateur compare murs/pièce/barre-sync d’un autre scénario, pas ligne précision. |
| M08-PATH-002-A07 — zoom | absent | Acceptable : Des interactions de vue existent, mais aucune assertion révision avant/après ce changement ; pas preuve de R10. |
| M08-PATH-002-A08 — panoramique | absent | Acceptable : Des interactions de vue existent, mais aucune assertion révision avant/après ce changement ; pas preuve de R10. |
| M08-PATH-002-A09 — changement de mode | absent | Acceptable : Des interactions de vue existent, mais aucune assertion révision avant/après ce changement ; pas preuve de R10. |
| M08-PATH-003-A01 — a = b refusé | absent | Acceptable : Aucun refus de rectangle à coins confondus ; un mur de longueur nulle est un autre objet. |
| M08-PATH-003-A02 — largeur nulle refusée | absent | Acceptable : Aucun test négatif rectangle de largeur nulle dans les candidats. |
| M08-PATH-003-A03 — angle 0° : coins aux positions attendues | partiel | Acceptable : Rectangle valide sert au bloc/extrusion, positions placées après transformation testées, pas oracle des quatre coins natifs à0°. |
| M08-PATH-003-A04 — angle 90° : mêmes dimensions, coins recalculés à la tolérance près | absent | Acceptable : Angle90 dans repère de saisie, référence ou escalier ne vérifie pas rotation rectangle et dimensions. |
| M08-PATH-003-A05 — aire = longueur × largeur | absent | Acceptable : Pièce16m² déduite de murs ne constitue pas aire d’une esquisse rectangle. |
| M08-PATH-003-A06 — inverse restitue l'état | partiel | Acceptable : Inverse exact générique mur/porte/niveau, aucun rectangle dans lot inverse. |
| M08-PATH-004-A01 — rectangle par deux coins accrochés à la grille 0,50 m | absent | Acceptable : Scénario E2E ne trace pas de rectangle esquisse ni ne valide cette grille. |
| M08-PATH-004-A02 — puis par dimensions saisies | absent | Acceptable : 4;0 et0;4 dessinent des murs, pas un rectangle paramétré. |
| M08-PATH-004-A03 — mezzanine de la copie de travail P.118 | partiel | Acceptable : CopieP118 oui, niveau Essai lot3a à20m pour les gestes ; aucune recette mezzanine rectangle. |
| M08-PATH-004-A04 — dimensions relues dans l'inspecteur | absent | Acceptable : Aucun rectangle ni comparaison de ses dimensions inspecteur. |
| M08-PATH-004-A05 — poignée de coin | absent | Acceptable : Le glisser testé concerne un mur, aucune poignée coin rectangle. |
| M08-PATH-004-A06 — annuler | partiel | Acceptable : Undo renommage pièce et déplacement mur, pas rectangle. |
| M08-PATH-004-A07 — rétablir | partiel | Acceptable : Redo du renommage pièce uniquement. |
| M08-PATH-004-A08 — second navigateur | partiel | Acceptable : Second navigateur confirme murs/pièce et barre-sync, pas rectangle. |
| M08-PATH-005-A01 — spline de cinq points | absent | Acceptable : Aucune création spline navigateur dans candidat. |
| M08-PATH-005-A02 — mezzanine de la copie de travail P.118 | partiel | Acceptable : CopieP118 vérifiée, gestes sur niveauEssai20m ; spline absente. |
| M08-PATH-005-A03 — un point de passage déplacé par poignée | absent | Acceptable : Déplacement mur ne démontre pas poignée de point spline. |
| M08-PATH-005-A04 — annuler | partiel | Acceptable : Undo présent mais sur nom de pièce/déplacement mur. |
| M08-PATH-005-A05 — rétablir | partiel | Acceptable : Redo du renommage de pièce, pas spline. |
| M08-PATH-005-A06 — second navigateur | partiel | Acceptable : État murs/pièce partagé, pas spline ni points. |
| M08-PATH-006-A01 — tracé au pointeur (émulation tactile Chromium) | absent | Acceptable : Émulation tactile teste sélection/orbite/pincement3D, pas mainlevée dessin2D. |
| M08-PATH-006-A02 — mezzanine de la copie de travail P.118 | partiel | Acceptable : CopieP118 présente, mais aucun geste mainlevée mezzanine. |
| M08-PATH-006-A03 — tolérance réglée | absent | Acceptable : Aucun réglage de tolérance mainlevée dans candidat. |
| M08-PATH-006-A04 — validation : révision +1 | absent | Acceptable : Aucune validation mainlevée ni assertion+1 correspondante. |
| M08-PATH-006-A05 — geste à deux doigts : aucune révision | absent | Acceptable : Pincement3D testé en nombreimages ; aucune vérification de révision inchangée ni absencecommande2D. |
| M08-PATH-006-A06 — annuler | partiel | Acceptable : Undo existe pour autres gestes, pas mainlevée. |
| M08-PATH-006-A07 — second navigateur | partiel | Acceptable : Comparaison murs/pièce, pas tracé mainlevée. |
| M08-PATH-007-A01 — mezzanine de la copie de travail P.118 | partiel | Acceptable : Copie exemple créée mais niveauEssai lot5 à30m, pas mezzanine. |
| M08-PATH-007-A02 — quatre lignes contraintes en rectangle | absent | Acceptable : Polyligne de trois points reçoit horizontal puis angle ; pas quatre lignes jointives. |
| M08-PATH-007-A03 — indicateur « 4 degrés de liberté » | partiel | Acceptable : Prédicat teste seulement présence texte degré(s) de liberté, pas nombre4. |
| M08-PATH-007-A04 — suppression d'une des lignes | absent | Acceptable : Scission mur existe ; aucune suppression ligne contrainte correspondante. |
| M08-PATH-007-A05 — contrainte « à réparer » dans le panneau des problèmes | partiel | Acceptable : Cote associative après scission devient àréparer dans dessin ; pas contrainte d’esquisse ni panneau des problèmes. |
| M08-PATH-007-A06 — annuler la ramène | absent | Acceptable : Aucun undo de suppression ligne contrainte dans ce script. |
| M08-PATH-007-A07 — second navigateur | absent | Acceptable : Un contexte/page unique, aucun second navigateur. |

Suite : A0 peut publier les deux lectures et leur confrontation, sans déclarer équivalence des sept entrées. Inventaire CLASSIF1 indépendant produit séparément ; attente de revue A2 avant nouvelle écriture A3.
