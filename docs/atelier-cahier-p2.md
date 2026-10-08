# Cahier des charges P2 — DrawAll universel : ontologies métier au-delà de l'architecture

**Version 1.3 — 8 octobre 2026 — validé par le maître d'ouvrage (D-176) ; lots P2-0 et P2-1 livrés et acceptés (D-182, D-183) ; lot P2-2 livré et porte P1 → P2 passée sur le périmètre bâtiment + mécanique (D-184) ; exécution continue, décisions 10.1 déléguées (D-183).**
**Statut : validé (D-176), décisions de la section 6 prises (D-177 à D-181) ; seul le lot P2-0 est engagé, les lots
suivants sont acceptés un à un. Le cahier Atelier (`docs/atelier-cahier-des-charges.md`) et le cahier
Planche (`docs/planche/cahier-planche.md`) restent inchangés : ce document s'y ajoute, il ne les modifie pas.**

Documents de référence : Concept V4 (`docs/drawall/DrawAll_v4.1_Concept.md`, §2 universalité, §6 modules, §12
étapes), Architecture V4, Exigences et sources V4 (annexe B pour les 324 entrées, annexe D pour les décisions
D1–D6), proposition acceptée `docs/atelier-drawall.md`, dossier de recette P1 `docs/atelier/recette.md`,
journal des décisions `docs/atelier/decisions.md` (D-174 : acceptation de P1).

## 0. Mode d'emploi

Même mode d'emploi que le cahier Atelier §0 : un lot à la fois, acceptation du maître d'ouvrage entre deux lots
(sauf instruction explicite d'exécution continue, comme D-010), fiche de capacité avant code pour chaque entrée
DA (gabarit `docs/atelier/fiches/_gabarit.md`, états « à spécifier → spécifiée → prototype → vérifiée →
disponible »), compte rendu `docs/atelier/lots/p2-lot-N.md`, décisions consignées dans `decisions.md`.

Les règles non négociables du cahier Atelier §3 (R1–R20) et d'AGENTS.md s'appliquent telles quelles. Trois
rappels qui pèsent particulièrement en P2 :

- **R3 / AGENTS.md — rien d'inventé.** Les ontologies structure, bois, réseaux et mécanique touchent des valeurs
  normatives (sections d'acier, classes de béton, diamètres normalisés, couples de serrage, facteurs de pliage).
  Aucune de ces valeurs n'entre dans le produit sans sa source fournie par le maître d'ouvrage (10.1-7). Le
  cahier ne propose que des **structures de données et des règles de cohérence géométrique**, jamais des
  valeurs réglementaires ou de catalogue.
- **D1 — une seule géométrie canonique par objet.** Un objet paramétrique (poutre, tuyau, pli) a une géométrie
  canonique paramétrique ; ses solides, maillages et symboles sont dérivés. Un solide libre (OCCT) a une géométrie
  canonique B-rep. Jamais deux géométries canoniques pour le même objet (R15).
- **T01 — produit unique.** Chaque ontologie s'active par projet ; l'activation ne crée ni édition, ni module
  visible distinct, ni restriction des autres ontologies.

## 1. Objet

Passer de l'étape **P1** du Concept V4 §12 (socle universel : dessin, pièces simples, bâtiment essentiel,
documents, versions — livré et accepté, D-174) à l'étape **P2** (approfondissement : structure, bois, tôlerie,
réseaux, surfaces, coordination), avec la condition de passage P1 → P2 que le concept fixe et qui n'a pas encore
été jouée : **un premier parcours bâtiment–mécanique complet et cohérent dans un même projet**.

Cette condition ne peut pas être satisfaite par P1 tel que livré : le cahier Atelier a retenu le bâtiment et le
dessin, pas la mécanique (§2.2 « Dehors »). Le présent cahier la traite donc comme une **porte**, pas comme un lot
tardif : (1) une **porte P1 réduite** à la fin de P2-0, jouée avec les ontologies existantes (bâtiment, dessin,
Planche, documents dans un même projet, T01), déclarée partielle ; (2) la **porte P1 → P2 complète** (bâtiment +
mécanique) à la fin de P2-2, premier lot qui introduit la mécanique, **bloquante pour P2-3 et les suivants**.
Aucun lot d'approfondissement (structure, bois, réseaux, surfaces) ne commence tant que cette porte n'est pas passée
et acceptée.

## 2. Point de départ mesuré (8 octobre 2026)

| Mesure | Valeur | Source |
| --- | --- | --- |
| Entrées DA du référentiel | 324 | Exigences V4, annexe B |
| Entrées à l'étape cible P1 / P2 / P3 | 146 / 124 / 54 | annexe B (colonne « Étape cible ») |
| Entrées retenues par le cahier Atelier (P1 Fadi) | 138 | `atelier-drawall.md` §5.1 |
| Fiches DA à l'état « disponible » | 71 | `docs/atelier/fiches/`, D-174 |
| Fiches Planche à l'état « disponible » | 35 | `docs/planche/fiches/`, D-174 |
| Modules DrawAll touchés | M01–M05, M11, M12 (partiel), M16, M17 (partiel) | `atelier-drawall.md` §2.1 |
| Modules non ouverts | M06, M07, M08, M09, M10, M13, M14, M15 | cahier Atelier §2.2 |
| Ontologies activables par projet | `building.architecture`, `drawing`, `annotation`, `planche` ; `building.structure` réduite au poteau | cahier Atelier §2.1, D-172 |

Les 138 entrées retenues n'ont pas toutes une fiche : les 71 fiches couvrent les entrées livrées avec preuve ; les
autres entrées retenues (DA-14, DA-15, DA-16 du lot 5, par exemple) sont prouvées par les comptes rendus de lot et
la recette sans fiche propre. **Première tâche de P2-0 : établir la fiche manquante de chaque entrée retenue et
livrée, pour que le compte « disponible » soit exact entrée par entrée.**

## 3. Périmètre P2 proposé

### 3.1 Dedans

Les entrées de l'annexe B dont l'étape cible est **P1 ou P2** et qui ne sont pas retenues par le cahier Atelier,
regroupées par ontologie activable. Les identifiants cités sont ceux de l'annexe B ; chaque entrée reçoit sa fiche
avant tout code.

| Ontologie (nouvelle ou étendue) | Module(s) selon l'annexe B | Entrées DA | Lot P2 |
| --- | --- | --- | --- |
| **Solides exacts** (B-rep) | M02 | DA-03-01 (-d, partie exacte), DA-03-12 (multicorps exact), DA-04-02 révolution, 03 balayage, 04 lissage, 08 suivez-moi exact, 09 trous, 10 coques, 11 booléens exacts — toutes retenues en P1 « lot optionnel OCCT », jamais livrées | P2-1 |
| **`mechanical.part`** | M02 | DA-10-01, 03, 04 | P2-2 |
| **`mechanical.assembly`** et contenu réutilisable | M04 | DA-10-02, 05 à 09, 13 à 16 ; DA-05-08 flexiblocs, 10 cellules, 13 studios de pièces, 16, 17, 18 bibliothèques | P2-2 |
| Paramètres et configurations | M03 ; M15 ; M12 | DA-06-03, 04, 05, 06 (M03) ; DA-06-09 règles de connaissance (M15) ; DA-06-10 règles de conception (M12) | P2-2 |
| **`building.structure` complète** | M06 | DA-08-01 à 19 ; DA-03-14 ; DA-10-10 assemblages soudés | P2-3 |
| **`timber`** | M06 | DA-09-01 à 08 | P2-4 |
| **`sheetmetal`** | M07 | DA-11-01 à 05 | P2-4 |
| **`mep`** (réseaux et procédés) | M08 | DA-12-01 à 14, 16 à 21 ; DA-03-16 | P2-5 |
| **Surfaces et formes libres** | M02 | DA-03-02 à 08, 11 ; DA-04-05, 06 ; DA-07-20 morphing | P2-6 |
| Bâtiment P2 | M05 | DA-07-08, 09, 11, 13, 14, 18, 19, 21, 23 | P2-6 |
| **Coordination et analyse P2** | M12 | DA-17-04, 05, 06 cinématique, 10 inerties, 11 analyse 2D, 14 contrôles de spécification | P2-6 |
| **Documentation et annotation P2** | M11 | DA-14-11, 13, 14, 15 ; DA-15-03, 08 à 16, 18 ; DA-16-09, 16 | P2-7 |
| **Échanges et relevé P2** | M17 ; M14 | DA-22-02 DGN (M17) ; DA-22-07 à 10 relevé et nuages de points (M14) ; STEP AP242 Éd.3 (D5, sans entrée DA propre) ; DA-22-03 DWG : retenue en P1, déclarée « non faite » (décision §6) | P2-7 |
| **Automatisation P2** | M15 | DA-19-03, 04, 05 (graphes visuels, règles) | P2-8 |

Contrôle de couverture (annexe B de ce cahier) : les **270** entrées P1 et P2 de l'annexe B sont chacune soit
retenues en P1 (138), soit affectées à un lot P2 (140, dont 9 retenues en P1 au lot optionnel OCCT et 1 jamais
livrée, DA-22-03), soit explicitement différées à P3 (1 : DA-20-08). Les entrées déjà retenues et livrées en P1
qui semblent proches de P2 ne sont pas reprises : DA-18-01 rendu simple et DA-18-02 étude solaire (lot 5), DA-19-01,
02, 06 scripts et génération de rapports (lots 5 et 8), DA-21-08 comparaison de vues entre révisions (lot 7).

### 3.2 Dehors (ne pas commencer, ne pas « préparer »)

Tout ce dont l'étape cible est **P3** : électricité et automatismes (M09, DA-13 sauf schémas de principe),
électronique et PCB (M10), simulation physique et calcul (DA-17-01 à 03, 07 à 09, 12), FAO et fabrication (M13,
DA-20), outillage et moules (DA-10-11, 12), optimisation de panneaux (DA-09-09). **Différée explicitement à P3 avec le
reste de la fabrication : DA-20-08 exports de fabrication (étape cible P2, module M13)** — sans FAO ni postprocesseurs
(P3), un export de fabrication n'aurait pas de consommateur vérifiable. Également dehors, inchangés :
rendu photoréaliste, CRDT sur la géométrie (D3), WebGPU par défaut (D2), « certification » IFC (D5), services
externes (P-2), valeurs réglementaires sans source (R3).

### 3.3 Ce qui ne bouge pas

Les 21 étapes du Parcours, Harmonie, l'outil Parcelle, la Programmation, le catalogue de documents, le partage et
les rôles, la file hors ligne, la sauvegarde et la restauration, les 7 modules de `docs/architecture.md` (une
ontologie n'est pas un module), le bus de commandes et ses contrats (`atelier-commands/N` : chaque ontologie ajoute
des commandes au contrat suivant, les contrats précédents restent acceptés comme en D-172).

## 4. Architecture P2 : ce qui s'ajoute, ce qui est réutilisé

| Besoin P2 | Réutilisé tel quel | Ajouté |
| --- | --- | --- |
| Ontologie activable par projet | mécanisme d'activation du cahier Atelier §2.3 (`building.structure` réduite en est la preuve) | registre d'ontologies (`packages/atelier-model/src/ontologies/<nom>/`), chacune avec classes, paramètres typés, relations, classes IFC, commandes, réducteurs, quantités, manifeste de dépendances (T14) |
| Géométrie paramétrique | `packages/core-geometry`, `packages/planche-model` (maillage, booléens manifold-3d) | profils normalisés **sans valeurs** (le profil est une donnée du projet avec sa source), balayage le long d'une polyligne 3D, raccords |
| Géométrie exacte | interface de moteur prévue par le lot optionnel OCCT | `packages/geometry-exact` : OCCT WASM en Web Worker derrière l'interface ; représentation `brep` ; jamais sur le chemin d'ouverture (D-013) |
| Contraintes | jeu borné 2D du lot 5 (coïncidence, parallélisme, perpendicularité, distance, horizontal / vertical) | solveur de contraintes d'assemblage (liaisons DA-10-08, 09) : décision D.3 « à évaluer » — prototype comparatif en P2-0 entre un solveur écrit (Newton sur contraintes géométriques, borné et documenté) et une bibliothèque sous licence admise ; **aucun engagement D-Cubed** sans arbitrage |
| Connectivité de réseau | relations porteuses de sens du modèle typé (Architecture V4 §4) | graphe de connexions `mep` (port, raccord, spécification) avec validation de compatibilité (diamètre, fluide, sens) **sans table de valeurs** |
| Coordination | collisions d'architecture du lot 7 (D-020) | collisions entre ontologies (poutre × gaine, tuyau × mur sans réservation) signalées, jamais corrigées ; réservations comme objets explicites |
| Échanges | IFC 4.3 export / import, rapport de fidélité, matrice (`docs/atelier/matrice-echanges.md`) | classes IFC structure (`IfcBeam`, `IfcColumn`, `IfcPlate`, `IfcReinforcingBar`…), MEP (`IfcPipeSegment`, `IfcDuctSegment`, `IfcFlowFitting`…) ; STEP AP242 Éd.3 par OCCT (si ouvert) ; DWG / DGN : **aucune bibliothèque libre sous licence admise n'est connue** (libredwg est GPL) — rester en « non fait, déclaré » ou décision 10.1 |
| Documents | vues, feuilles, nomenclatures, quantités du lot 5 | nomenclatures de structure, d'assemblage (éclatés DA-10-16), de réseau ; plans de ferraillage et de pliage (DA-11-04, 05) |
| Interface | cinq repères UX1, palette UX2, inspecteur typé, niveaux d'affichage | une ontologie activée ajoute ses outils à la palette et ses classes à l'inspecteur ; aucun ruban métier ; le niveau d'affichage « Essentiel » ne change pas |

## 5. Lots P2, livrables, estimation

Estimation calibrée comme `atelier-drawall.md` §6.2 : une journée = session continue livrée verte (typecheck,
tests, build, scénario e2e, CI). P1 a coûté 23,5 jours estimés pour 138 entrées à densité « formulaires + géométrie
paramétrique » ; P2 ajoute des domaines à densité plus forte (noyau exact, solveur, connectivité), d'où une
productivité comptée aux deux tiers de P1. **Aucune journée n'est engagée avant la validation du cahier.**

| Lot | Contenu | Vérifiable par le maître d'ouvrage | Journées |
| --- | --- | --- | --- |
| **P2-0 — Cadrage P2 et porte P1 réduite** | Fiches manquantes des entrées P1 livrées (§2) ; fiches « spécifiée » des entrées de P2-1 et P2-2 ; maquette d'activation d'une ontologie (palette, inspecteur, niveaux) ; banc de mesure : OCCT WASM (démarrage, mémoire, booléens sur corpus), solveur de contraintes comparatif, scène mixte bâtiment + machine (budget de trame) ; `docs/atelier/p2-mesures.md` ; **porte P1 réduite** : recette qui, dans un seul projet, dessine un mur, un solide de Planche, une esquisse, produit une feuille et une version, sans changer d'écran ni d'édition (T01 avec les ontologies existantes), résultat déclaré « porte partielle : mécanique absente » | lire les mesures ; ouvrir la maquette ; rejouer la porte réduite | 3 |
| **P2-1 — Noyau exact** (lot optionnel du cahier Atelier, inchangé) | `geometry-exact`, OCCT en Web Worker, `brep`, révolution, balayage, lissage, trous, coques, booléens exacts ; Planche : opérations exactes en option à côté de manifold-3d (déclarées « exactes » ou « maillage ») ; STEP AP242 Éd.3 export / import de solides | créer un solide par révolution, le soustraire d'un mur, l'exporter en STEP et en IFC | 3 |
| **P2-2 — Mécanique et assemblages** | `mechanical.part` (pièce = solide exact ou paramétrique, features), `mechanical.assembly` (occurrences, liaisons, solveur retenu en P2-0, numérotation, nomenclature, éclatés), cellules, studios de pièces, flexiblocs, bibliothèques (structures, vides de valeurs), configurations, expressions et règles (DA-06) | assembler trois pièces avec deux liaisons, déplacer l'une, les autres suivent ; nomenclature ; éclaté sur feuille | 4 |
| **Porte P1 → P2** (pas un lot : critère d'acceptation de P2-2) | **Parcours bâtiment–mécanique complet** dans un même projet, rejoué par la recette : un bâtiment de P.118, une machine assemblée posée dans une pièce, les deux dans la même version, la même feuille et le même IFC ; collision bâtiment × machine signalée ; T01 à T20 rejouées sur ce projet ; constat du maître d'ouvrage | ouvrir le projet mixte, modifier la machine, retrouver la feuille périmée puis régénérée | — |
| **P2-3 — Structure** | ontologie `building.structure` : poutres, poteaux, éléments, trames, plaques, assemblages paramétriques (géométrie seulement), armatures comme objets, coulages, assemblages soudés ; profils fournis par le projet avec source ; IFC structure ; nomenclatures | poser une trame de poteaux et de poutres sur P.118, obtenir la nomenclature, exporter en IFC et l'ouvrir dans un visualiseur tiers | 3,5 |
| **P2-4 — Bois et tôlerie** | `timber` : éléments, ossature, CLT, assemblages bois–bois et bois–métal comme objets, outils automatiques de mur et de toit (génération contrôlée, aperçu, accord) ; `sheetmetal` : plis, développé, table de pliage **à valeurs fournies** | dessiner un mur à ossature, obtenir la liste des pièces ; plier une tôle, lire le développé | 3,5 |
| **P2-5 — Réseaux** | `mep` : gaines, tuyaux, chemins de câbles, conduits, raccords, vannes, équipements, supports ; routage le long de polylignes 3D ; spécifications et catalogues **vides à la livraison** (structure, import CSV sourcé) ; P&ID comme vue dérivée ; IFC MEP | tracer un réseau de deux tuyaux et un raccord, la connectivité est vérifiée ; P&ID dérivé ; IFC | 4 |
| **P2-6 — Surfaces, bâtiment P2, coordination** | surfaces NURBS et SubD par OCCT (si P2-1) ou maillage déclaré ; morphing ; plafonds, coques, rampes, échelles, murs-rideaux, terrain, rénovation, planification de chantier ; cinématique et inerties des assemblages ; collisions entre ontologies et réservations ; contrôles de spécification | un projet qui contient un bâtiment, une machine et un réseau ; une collision signalée ; un mécanisme animé | 3,5 |
| **P2-7 — Documentation et échanges P2** | isométriques de tuyauterie, plans d'atelier et de production ; annotations mécaniques et de fabrication (tolérances, symboles de soudure et d'état de surface, tableaux de perçage) ; nomenclatures de pliage et de débit ; DGN et DWG selon décision §6 ; nuages de points (lecture, format ouvert E57 ou LAS sous licence admise), rétro-conception limitée au relevé de plans | feuille de ferraillage, feuille de pliage, nuage affiché derrière le modèle | 3 |
| **P2-8 — Automatisation et recette P2** | graphes visuels de génération contrôlée et règles par ontologie (DA-19-03 à 05, même boucle que le lot 8) ; recette P2 complète, T01 à T20 rejouées, protocole T17 / T18 | dossier de recette P2 ; CI verte ; matrice | 2 |

**Total : 29,5 journées, soit 26 à 33 avec la marge.** Ordre imposé : P2-0 → P2-1 → P2-2 → porte P1 → P2 ; ensuite
P2-3, P2-4 et P2-5 sont indépendants et réordonnables ; P2-6 dépend de tout ce qui précède ; P2-7 et P2-8 ferment.
Sans arbitrage OCCT, P2-1 n'existe pas, P2-2 se limite aux pièces paramétriques et aux maillages, et P2-6 aux
surfaces maillées ; la porte P1 → P2 se joue alors avec des pièces paramétriques, ce qui est déclaré.

## 6. Décisions réservées au maître d'ouvrage avant de commencer (10.1)

| Décision | Pourquoi elle bloque | Lot |
| --- | --- | --- |
| **Validation de ce cahier** (écart au périmètre, 10.1-8) | Chaque lot ajoute des entrées DA hors du cahier Atelier — **prise le 8 octobre 2026 (D-176) : cahier validé, seul P2-0 engagé** | P2-0 |
| **Licence OCCT** : LGPL avec WASM chargé séparément, licence commerciale, ou renoncer au noyau exact | D.3 « bloquante » ; conditionne P2-1, P2-2, P2-6, STEP — **prise (D-177) : composant LGPL chargé séparément, liste des licences amendée** | P2-1 |
| **Solveur de contraintes** : solveur écrit et borné, bibliothèque sous licence admise, ou D-Cubed (commercial) | D.3 « à évaluer » ; mesure comparative en P2-0 — **prise (D-178) : solveur écrit et borné, critères de banc fixés** | P2-2 |
| **DWG / DGN** : renoncer (déclaré), SDK commercial, ou bibliothèque GPL isolée dans un service séparé | aucune bibliothèque libre sous licence admise — **prise (D-179) : renoncés en P2, déclarés** | P2-7 |
| **Sources des valeurs de catalogue** (profils, diamètres, pliage, assemblages) | R3 : rien n'est inventé ; sans source, les catalogues sont livrés vides — **prise (D-180) : gabarits CSV sourcés, trois fichiers de départ à fournir** | P2-2 à P2-5 |
| **Fournisseur de modèle de langage** | inchangé depuis P1 : sans lui, génération déterministe seulement — reste ouverte | P2-8 |
| **Corpus de preuve P2** : un projet mixte de référence (bâtiment + machine + réseau) fourni ou construit | la porte P1 → P2 se prouve sur un cas mixte, pas sur P.118 seul — **prise (D-181) : « P.118-M » construit par le chef de projet, scénario à valider** | P2-0, porte |

## 7. Risques et parades

| Risque | Parade |
| --- | --- |
| OCCT WASM : démarrage, mémoire 32 bits, taille (D6) | jamais sur le chemin d'ouverture ; Web Worker ; mesures P2-0 avant tout engagement ; repli maillage déclaré |
| Valeurs normatives absorbées « par commodité » | catalogues vides à la livraison ; import sourcé ; contrôle en recette (`grep` des constantes numériques dans les ontologies) |
| Ontologies qui deviennent des éditions | une seule palette, un seul inspecteur ; recette T01 : ouvrir un outil de chaque ontologie dans le même projet sans changer d'écran |
| Solveur instable (sur- / sous-contraint) | diagnostics nommés avant résolution ; refus explicite ; cas de référence sous test |
| Dérive de calendrier sur P2-2 et P2-5 | marge haute sur ces deux lots ; P2-3 à P2-5 réordonnables |
| Entrer en P2 sans avoir satisfait la condition de passage du Concept | porte P1 → P2 bloquante après P2-2 ; aucun lot d'approfondissement avant son acceptation |

## 8. Definition of Done d'un lot P2

Celle du cahier Atelier §11, plus : (1) l'ontologie du lot s'active et se désactive par projet sans effet sur les
autres ; (2) `check-module-deps` vérifie qu'aucune ontologie n'importe une autre ontologie directement (passage par
le modèle typé) ; (3) aucune constante normative dans le code de l'ontologie (contrôle automatique) ; (4) matrice
IFC de l'ontologie dans `matrice-echanges.md` avec rapport de fidélité sur corpus ; (5) fiches du lot à l'état
« vérifiée », « disponible » après acceptation.

## Annexe A — Prompt de lancement (après validation)

> Lis `docs/atelier-cahier-p2.md` et exécute le lot P2-0 selon sa section 5. Tu es le chef de projet : crée les
> fiches, la maquette d'activation et le banc de mesures, et arrête-toi à la fin du lot avec le compte rendu
> `docs/atelier/lots/p2-lot-0.md` et la liste des décisions de la section 6 qui m'appartiennent.

## Annexe B — Contrôle de couverture des 270 entrées P1 et P2

Générée depuis l'annexe B des Exigences V4 (colonne « Étape cible ») et `atelier-drawall.md` §5.1 (entrées retenues).
Chaque entrée P1 ou P2 a une destination ; les 54 entrées P3 ne figurent pas ici (§3.2).

| ID | Libellé | Module | Étape | Destination |
| --- | --- | --- | --- | --- |
| DA-01-01 | Precision 2D drawing and drafting | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-02 | Lines and polylines | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-03 | Arcs and circles | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-04 | Rectangles | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-05 | Curves and splines | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-06 | Freehand drawing | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-07 | Sketches and constrained sketches | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-08 | Parametric sketching | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-09 | Sketcher | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-10 | Centerlines | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-11 | Hatching | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-01-12 | Hidden-line management | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-01 | Move | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-02 | Copy | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-03 | Rotate | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-04 | Mirror | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-05 | Scale | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-06 | Stretch | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-07 | Trim | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-08 | Extend | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-09 | Offset | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-10 | Fillet | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-11 | Chamfer | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-12 | Arrays and patterns | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-13 | Explode | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-14 | Control-point editing | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-15 | Snapping | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-16 | AccuDraw | M01 | P1 | P1 (retenue, cahier Atelier) |
| DA-02-17 | Gumball manipulation | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-03-01 | Solid modeling | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-03-02 | Surface modeling | M02 | P2 | P2-6 |
| DA-03-03 | Mesh modeling | M02 | P2 | P2-6 |
| DA-03-04 | NURBS surfaces | M02 | P2 | P2-6 |
| DA-03-05 | SubD / subdivision modeling | M02 | P2 | P2-6 |
| DA-03-06 | Freeform modeling | M02 | P2 | P2-6 |
| DA-03-07 | Shape design | M02 | P2 | P2-6 |
| DA-03-08 | Advanced surfacing | M02 | P2 | P2-6 |
| DA-03-09 | Parametric modeling | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-03-10 | Direct modeling and editing | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-03-11 | Synchronous modeling | M02 | P2 | P2-6 |
| DA-03-12 | Multibody modeling | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-03-13 | Architectural modeling | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-03-14 | Structural BIM modeling | M06 | P2 | P2-3 |
| DA-03-15 | Construction modeling | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-03-16 | Multidisciplinary plant modeling | M08 | P2 | P2-5 |
| DA-04-01 | Extrusion | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-04-02 | Revolution | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-04-03 | Sweep | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-04-04 | Loft | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-04-05 | Patch | M02 | P2 | P2-6 |
| DA-04-06 | Blend | M02 | P2 | P2-6 |
| DA-04-07 | Push/Pull | M02 | P1 | P1 (retenue, cahier Atelier) |
| DA-04-08 | Follow Me | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-04-09 | Holes | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-04-10 | Shells for mechanical parts | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-04-11 | Boolean / solid operations | M02 | P1 | P2-1 (retenue en P1 au lot optionnel OCCT ; partie exacte restante) |
| DA-05-01 | Layers | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-02 | Classes | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-03 | Levels | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-04 | Stories | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-05 | Groups | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-06 | Blocks | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-07 | Block libraries | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-08 | Flexiblocks | M04 | P2 | P2-2 |
| DA-05-09 | Components | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-10 | Cells | M04 | P1 | P2-2 |
| DA-05-11 | External references | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-12 | Objects | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-13 | Part Studios | M04 | P1 | P2-2 |
| DA-05-14 | Standard-part libraries | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-15 | Standard-component libraries | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-05-16 | Intelligent component libraries | M04 | P2 | P2-2 |
| DA-05-17 | Hardware libraries | M04 | P2 | P2-2 |
| DA-05-18 | Component catalogs | M04 | P2 | P2-2 |
| DA-06-01 | Constraints | M03 | P1 | P1 (retenue, cahier Atelier) |
| DA-06-02 | Parametric constraints | M03 | P1 | P1 (retenue, cahier Atelier) |
| DA-06-03 | Parametric families | M03 | P2 | P2-2 |
| DA-06-04 | Family tables | M03 | P2 | P2-2 |
| DA-06-05 | Configurations | M03 | P2 | P2-2 |
| DA-06-06 | Model states | M03 | P2 | P2-2 |
| DA-06-07 | BIM properties | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-06-08 | Building-element classification | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-06-09 | Knowledgeware rules | M15 | P2 | P2-2 |
| DA-06-10 | Design rules | M12 | P2 | P2-2 |
| DA-07-01 | Walls | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-02 | Doors | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-03 | Windows | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-04 | Openings | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-05 | Floors | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-06 | Slabs | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-07 | Roofs | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-08 | Ceilings | M05 | P2 | P2-6 |
| DA-07-09 | Architectural shells | M05 | P2 | P2-6 |
| DA-07-10 | Stairs | M05 | P2 | P1 (retenue, cahier Atelier) |
| DA-07-11 | Ramps | M05 | P2 | P2-6 |
| DA-07-12 | Railings | M05 | P2 | P1 (retenue, cahier Atelier) |
| DA-07-13 | Ladders | M05 | P2 | P2-6 |
| DA-07-14 | Curtain walls | M05 | P2 | P2-6 |
| DA-07-15 | Rooms | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-16 | Spaces | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-17 | Zones | M05 | P1 | P1 (retenue, cahier Atelier) |
| DA-07-18 | Terrain modeling | M05 | P2 | P2-6 |
| DA-07-19 | Terrain meshes | M05 | P2 | P2-6 |
| DA-07-20 | Morph modeling | M02 | P2 | P2-6 |
| DA-07-21 | Renovation tools | M05 | P2 | P2-6 |
| DA-07-22 | Project phases | M05 | P2 | P1 (retenue, cahier Atelier) |
| DA-07-23 | Construction-site planning | M05 | P2 | P2-6 |
| DA-08-01 | Beams | M06 | P1 | P2-3 |
| DA-08-02 | Columns | M06 | P1 | P2-3 |
| DA-08-03 | Structural members | M06 | P1 | P2-3 |
| DA-08-04 | Structural framing | M06 | P1 | P2-3 |
| DA-08-05 | Frame design | M06 | P1 | P2-3 |
| DA-08-06 | Steel members | M06 | P2 | P2-3 |
| DA-08-07 | Steel modeling | M06 | P2 | P2-3 |
| DA-08-08 | Concrete modeling | M06 | P2 | P2-3 |
| DA-08-09 | Plates | M06 | P2 | P2-3 |
| DA-08-10 | Bolts and fasteners | M06 | P2 | P2-3 |
| DA-08-11 | Welds and weld design | M06 | P2 | P2-3 |
| DA-08-12 | Connections | M06 | P2 | P2-3 |
| DA-08-13 | Parametric steel connections | M06 | P2 | P2-3 |
| DA-08-14 | Reinforcement modeling | M06 | P2 | P2-3 |
| DA-08-15 | Precast units and detailing | M06 | P2 | P2-3 |
| DA-08-16 | Concrete pours | M06 | P2 | P2-3 |
| DA-08-17 | Steel detailing | M06 | P2 | P2-3 |
| DA-08-18 | Concrete detailing | M06 | P2 | P2-3 |
| DA-08-19 | Full fabrication detailing | M06 | P2 | P2-3 |
| DA-09-01 | Timber members | M06 | P2 | P2-4 |
| DA-09-02 | Timber-frame elements | M06 | P2 | P2-4 |
| DA-09-03 | CLT elements | M06 | P2 | P2-4 |
| DA-09-04 | Wood-to-wood connections | M06 | P2 | P2-4 |
| DA-09-05 | Wood-to-metal connections | M06 | P2 | P2-4 |
| DA-09-06 | Connection hardware | M06 | P2 | P2-4 |
| DA-09-07 | Automatic wall tools | M06 | P2 | P2-4 |
| DA-09-08 | Automatic roof tools | M06 | P2 | P2-4 |
| DA-10-01 | Part modeling / Part Design | M02 | P1 | P2-2 |
| DA-10-02 | Mechanical components | M04 | P1 | P2-2 |
| DA-10-03 | Mechanical features | M02 | P1 | P2-2 |
| DA-10-04 | Shafts | M02 | P2 | P2-2 |
| DA-10-05 | Standard mechanical parts | M04 | P1 | P2-2 |
| DA-10-06 | Assemblies / Assembly Design | M04 | P1 | P2-2 |
| DA-10-07 | Assembly modeling | M04 | P1 | P2-2 |
| DA-10-08 | Mates | M04 | P1 | P2-2 |
| DA-10-09 | Mechanical joints | M04 | P1 | P2-2 |
| DA-10-10 | Weldments | M06 | P2 | P2-3 |
| DA-10-13 | Part references | M04 | P1 | P2-2 |
| DA-10-14 | Part numbering | M04 | P1 | P2-2 |
| DA-10-15 | Assembly numbering | M04 | P1 | P2-2 |
| DA-10-16 | Exploded views, representations and presentations | M04 | P1 | P2-2 |
| DA-11-01 | Sheet-metal design and modeling | M07 | P2 | P2-4 |
| DA-11-02 | Folded plates | M07 | P2 | P2-4 |
| DA-11-03 | Unfolding | M07 | P2 | P2-4 |
| DA-11-04 | Flat patterns | M07 | P2 | P2-4 |
| DA-11-05 | Bend tables | M07 | P2 | P2-4 |
| DA-12-01 | MEP tools | M08 | P2 | P2-5 |
| DA-12-02 | Mechanical ducts | M08 | P2 | P2-5 |
| DA-12-03 | HVAC modeling | M08 | P2 | P2-5 |
| DA-12-04 | Pipe modeling | M08 | P2 | P2-5 |
| DA-12-05 | Pipe and tube design | M08 | P2 | P2-5 |
| DA-12-06 | Piping routing | M08 | P2 | P2-5 |
| DA-12-07 | Specification-driven piping | M08 | P2 | P2-5 |
| DA-12-08 | Fittings | M08 | P2 | P2-5 |
| DA-12-09 | Valves | M08 | P2 | P2-5 |
| DA-12-10 | Equipment modeling | M08 | P2 | P2-5 |
| DA-12-11 | Equipment placement | M08 | P2 | P2-5 |
| DA-12-12 | Supports | M08 | P2 | P2-5 |
| DA-12-13 | Cable trays | M08 | P2 | P2-5 |
| DA-12-14 | Conduits | M08 | P2 | P2-5 |
| DA-12-16 | Piping and instrumentation diagrams — P&IDs | M08 | P2 | P2-5 |
| DA-12-17 | Piping specifications | M08 | P2 | P2-5 |
| DA-12-18 | Component specifications | M08 | P2 | P2-5 |
| DA-12-19 | Catalogs | M08 | P2 | P2-5 |
| DA-12-20 | Specification editing | M08 | P2 | P2-5 |
| DA-12-21 | Catalog editing | M08 | P2 | P2-5 |
| DA-14-01 | Drawing views | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-02 | Plans | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-03 | Sections | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-04 | Section planes | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-05 | Elevations | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-06 | Details | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-07 | Assembly details | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-08 | Detail viewports | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-09 | Scaled viewports | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-10 | Orthographic drawings | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-11 | Piping isometric drawings | M11 | P2 | P2-7 |
| DA-14-12 | General-arrangement drawings | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-13 | Shop drawings | M11 | P2 | P2-7 |
| DA-14-14 | Steel production drawings | M11 | P2 | P2-7 |
| DA-14-15 | Concrete production drawings | M11 | P2 | P2-7 |
| DA-14-16 | Associative drawings and drawing views | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-17 | Associative drafting | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-18 | Drafting | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-19 | Make2D | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-20 | Building documentation | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-21 | Coordinated drawings | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-14-22 | Synchronized model documentation | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-01 | Measurements | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-02 | Dimensions | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-03 | Mechanical dimensions | M11 | P2 | P2-7 |
| DA-15-04 | Text | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-05 | Labels | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-06 | Tags | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-07 | General annotations | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-08 | Intelligent annotations | M11 | P2 | P2-7 |
| DA-15-09 | Mechanical annotations | M11 | P2 | P2-7 |
| DA-15-10 | Manufacturing annotations | M11 | P2 | P2-7 |
| DA-15-11 | 3D manufacturing annotations | M11 | P2 | P2-7 |
| DA-15-12 | Tolerances | M11 | P2 | P2-7 |
| DA-15-13 | Geometric tolerances | M11 | P2 | P2-7 |
| DA-15-14 | Welding symbols | M11 | P2 | P2-7 |
| DA-15-15 | Surface-finish symbols | M11 | P2 | P2-7 |
| DA-15-16 | Specialist symbols | M11 | P2 | P2-7 |
| DA-15-17 | Balloons | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-15-18 | Hole charts | M11 | P2 | P2-7 |
| DA-15-19 | Drawing frames | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-01 | Layouts | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-02 | Drawing sheets | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-03 | Sheet layouts | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-04 | Sheet organization | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-05 | Sheet-set management | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-06 | Tables | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-07 | Worksheets | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-08 | Schedules | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-09 | Bending schedules | M11 | P2 | P2-7 |
| DA-16-10 | Quantities | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-11 | Reports | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-12 | Automatic reports | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-13 | Material reports | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-14 | Material lists | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-15 | Parts lists | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-16-16 | Cut lists | M11 | P2 | P2-7 |
| DA-16-17 | Bills of materials — BOMs | M11 | P1 | P1 (retenue, cahier Atelier) |
| DA-17-04 | Motion analysis | M12 | P2 | P2-6 |
| DA-17-05 | Kinematics | M12 | P2 | P2-6 |
| DA-17-06 | Kinematic simulation | M12 | P2 | P2-6 |
| DA-17-10 | Inertia calculations | M12 | P2 | P2-6 |
| DA-17-11 | Basic 2D analysis | M12 | P2 | P2-6 |
| DA-17-13 | Clash detection | M12 | P2 | P1 (retenue, cahier Atelier) |
| DA-17-14 | Specification checks | M12 | P2 | P2-6 |
| DA-17-15 | Design-rule checks | M12 | P2 | P1 (retenue, cahier Atelier) |
| DA-17-16 | Digital mock-up review | M12 | P1 | P1 (retenue, cahier Atelier) |
| DA-18-01 | Rendering | M14 | P2 | P1 (retenue, cahier Atelier) |
| DA-18-02 | Model animation | M14 | P2 | P1 (retenue, cahier Atelier) |
| DA-18-03 | Exploded presentations | M14 | P1 | P1 (retenue, cahier Atelier) |
| DA-18-04 | Digital mock-up visualization and review | M14 | P1 | P1 (retenue, cahier Atelier) |
| DA-19-01 | Design automation | M15 | P2 | P1 (retenue, cahier Atelier) |
| DA-19-02 | Computational design | M15 | P2 | P1 (retenue, cahier Atelier) |
| DA-19-03 | Dynamo | M15 | P2 | P2-8 |
| DA-19-04 | Grasshopper | M15 | P2 | P2-8 |
| DA-19-05 | Knowledgeware | M15 | P2 | P2-8 |
| DA-19-06 | Automatic drawing/report generation | M11 | P2 | P1 (retenue, cahier Atelier) |
| DA-20-08 | Fabrication exports | M13 | P2 | différée à P3 (§3.2) |
| DA-21-01 | Worksharing | M16 | P1 | P1 (retenue, cahier Atelier) |
| DA-21-02 | Collaborative editing | M16 | P1 | P1 (retenue, cahier Atelier) |
| DA-21-03 | Multidisciplinary coordination | M16 | P1 | P1 (retenue, cahier Atelier) |
| DA-21-04 | Version management | M16 | P1 | P1 (retenue, cahier Atelier) |
| DA-21-05 | Integrated data management | M16 | P1 | P1 (retenue, cahier Atelier) |
| DA-21-06 | Change tracking | M16 | P1 | P1 (retenue, cahier Atelier) |
| DA-21-07 | Revision tracking | M16 | P1 | P1 (retenue, cahier Atelier) |
| DA-21-08 | Drawing comparison | M11 | P2 | P1 (retenue, cahier Atelier) |
| DA-21-09 | Model reuse | M04 | P1 | P1 (retenue, cahier Atelier) |
| DA-22-01 | IFC exchange | M17 | P1 | P1 (retenue, cahier Atelier) |
| DA-22-02 | DGN interoperability | M17 | P2 | P2-7 |
| DA-22-03 | DWG interoperability | M17 | P1 | P1 (retenue, cahier Atelier) |
| DA-22-04 | PDF tools | M17 | P1 | P1 (retenue, cahier Atelier) |
| DA-22-05 | PDF output | M17 | P1 | P1 (retenue, cahier Atelier) |
| DA-22-06 | Georeferencing | M17 | P1 | P1 (retenue, cahier Atelier) |
| DA-22-07 | Reverse engineering | M14 | P2 | P2-7 |
| DA-22-08 | Laser-scan integration | M14 | P2 | P2-7 |
| DA-22-09 | Point-cloud tools | M14 | P2 | P2-7 |
| DA-22-10 | CloudWorx integration | M14 | P2 | P2-7 |
