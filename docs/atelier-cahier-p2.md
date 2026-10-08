# Cahier des charges P2 — DrawAll universel : ontologies métier au-delà de l'architecture

**Version 0.1 — 8 octobre 2026 — proposition du chef de projet, à valider par le maître d'ouvrage.**
**Statut : proposition (D-175). Aucun code P2 n'est écrit avant la validation de ce cahier et l'arbitrage de la
licence OCCT (Exigences V4, annexe D.3). Le cahier Atelier (`docs/atelier-cahier-des-charges.md`) et le cahier
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

| Ontologie (nouvelle ou étendue) | Module | Entrées DA | Lot P2 |
| --- | --- | --- | --- |
| **Solides exacts** (B-rep) | M02 | DA-03-01 (-d, multicorps), DA-03-12, DA-04-02 révolution, 03 balayage, 04 lissage, 08 suivez-moi exact, 09 trous, 10 coques, 11 booléens exacts | P2-1 |
| **`building.structure` complète** | M06 | DA-08-01 à 05 (P1), DA-08-06 à 19 (P2), DA-03-14 | P2-2 |
| **`mechanical.part` et `mechanical.assembly`** | M02, M04 | DA-10-01 à 09, 13 à 16 ; DA-05-08, 16, 17, 18 ; DA-06-03 à 06, 09, 10 (configurations, expressions) | P2-3 |
| **`timber`** et **`sheetmetal`** | M06, M07 | DA-09-01 à 08 ; DA-11-01 à 05 ; DA-10-10 | P2-4 |
| **`mep`** (réseaux et procédés) | M08 | DA-12-01 à 14, 16 à 21 ; DA-03-16 | P2-5 |
| **Surfaces et formes libres** | M02 | DA-03-02 à 08, 11 ; DA-04-05, 06 | P2-6 |
| **Coordination inter-ontologies** | M12 | DA-17-04, 05, 06, 10, 11, 13 (collisions entre ontologies), 14, 15 ; DA-07-08, 09, 11, 13, 14, 18 à 21, 23 (bâtiment P2) | P2-6 |
| **Documentation et quantités P2** | M11 | DA-14-11, 13, 14, 15 ; DA-15-03, 08 à 16, 18 ; DA-16-09, 16 | P2-7 |
| **Échanges P2** | M17, M14 | DA-22-02 DGN, 03 DWG, 07 à 10 (relevé, nuages de points) ; STEP AP242 Éd.3 (D5) | P2-7 |
| **Collaboration et automatisation P2** | M16, M15 | DA-21-08 ; DA-19-01 à 06 ; DA-18-01, 02 | P2-8 |

### 3.2 Dehors (ne pas commencer, ne pas « préparer »)

Tout ce dont l'étape cible est **P3** : électricité et automatismes (M09, DA-13 sauf schémas de principe),
électronique et PCB (M10), simulation physique et calcul (DA-17-01 à 03, 07 à 09, 12), FAO et fabrication (M13,
DA-20), outillage et moules (DA-10-11, 12), optimisation de panneaux (DA-09-09). Également dehors, inchangés :
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
| **P2-0 — Cadrage P2** | Fiches manquantes des entrées P1 livrées (§2) ; fiches « spécifiée » des entrées des lots P2-1 à P2-3 ; maquette d'activation d'une ontologie (palette, inspecteur, niveaux) ; banc de mesure : OCCT WASM (démarrage, mémoire, booléens sur corpus), solveur de contraintes comparatif, scène mixte bâtiment + machine (budget de trame) ; `docs/atelier/p2-mesures.md` | lire les mesures ; ouvrir la maquette ; compter les fiches | 3 |
| **P2-1 — Noyau exact** (lot optionnel du cahier Atelier, inchangé) | `geometry-exact`, OCCT en Web Worker, `brep`, révolution, balayage, lissage, trous, coques, booléens exacts ; Planche : opérations exactes en option à côté de manifold-3d (déclarées « exactes » ou « maillage ») ; STEP AP242 Éd.3 export / import de solides | créer un solide par révolution, le soustraire d'un mur, l'exporter en STEP et en IFC | 3 |
| **P2-2 — Structure** | ontologie `building.structure` : poutres, poteaux, éléments, trames, plaques, assemblages paramétriques (géométrie seulement), armatures comme objets, coulages ; profils fournis par le projet avec source ; IFC structure ; nomenclatures | poser une trame de poteaux et de poutres sur P.118, obtenir la nomenclature, exporter en IFC et l'ouvrir dans un visualiseur tiers | 3,5 |
| **P2-3 — Mécanique et assemblages** | `mechanical.part` (pièce = solide exact ou paramétrique, features), `mechanical.assembly` (occurrences, liaisons, solveur retenu en P2-0, numérotation, nomenclature, éclatés), configurations et expressions (DA-06) | assembler trois pièces avec deux liaisons, déplacer l'une, les autres suivent ; nomenclature ; éclaté sur feuille | 4 |
| **P2-4 — Bois et tôlerie** | `timber` : éléments, ossature, CLT, assemblages bois–bois et bois–métal comme objets, outils automatiques de mur et de toit (génération contrôlée, aperçu, accord) ; `sheetmetal` : plis, développé, table de pliage **à valeurs fournies** | dessiner un mur à ossature, obtenir la liste des pièces ; plier une tôle, lire le développé | 3,5 |
| **P2-5 — Réseaux** | `mep` : gaines, tuyaux, chemins de câbles, conduits, raccords, vannes, équipements, supports ; routage le long de polylignes 3D ; spécifications et catalogues **vides à la livraison** (structure, import CSV sourcé) ; P&ID comme vue dérivée ; IFC MEP | tracer un réseau de deux tuyaux et un raccord, la connectivité est vérifiée ; P&ID dérivé ; IFC | 4 |
| **P2-6 — Surfaces et coordination** | surfaces NURBS et SubD par OCCT (si P2-1) ou maillage déclaré ; collisions entre ontologies ; réservations ; **parcours mixte bâtiment–mécanique–réseaux** (condition de passage P1 → P2) rejoué par la recette | un projet qui contient un bâtiment, une machine et un réseau ; une collision signalée ; aucun changement d'édition | 3 |
| **P2-7 — Documentation et échanges P2** | nomenclatures et plans propres aux ontologies ; annotations P2 (DA-15) ; DGN / DWG selon décision 10.1 ; nuages de points (DA-22-08, 09) en lecture, format ouvert (E57 ou LAS) sous licence admise | feuille de ferraillage, feuille de pliage, nuage affiché derrière le modèle | 2,5 |
| **P2-8 — Collaboration, automatisation, recette P2** | comparaison de modèles entre révisions (DA-21-08) ; scripts et génération contrôlée par ontologie (DA-19) ; rendu simple et animation de caméra (DA-18-01, 02) ; recette P2 complète, T01 à T20 rejouées, protocole T17 / T18 | dossier de recette P2 ; CI verte ; matrice | 2 |

**Total : 28,5 journées, soit 25 à 32 avec la marge.** Les lots P2-2 à P2-5 sont indépendants entre eux après
P2-0 et P2-1 ; P2-3 dépend de P2-1 (solides exacts) ; P2-6 dépend de tout ce qui précède. Sans arbitrage OCCT,
P2-1 n'existe pas, P2-3 se limite aux pièces paramétriques et aux maillages, et P2-6 aux surfaces maillées.

## 6. Décisions réservées au maître d'ouvrage avant de commencer (10.1)

| Décision | Pourquoi elle bloque | Lot |
| --- | --- | --- |
| **Validation de ce cahier** (écart au périmètre, 10.1-8) | Chaque lot ajoute des entrées DA hors du cahier Atelier | P2-0 |
| **Licence OCCT** : LGPL avec WASM chargé séparément, licence commerciale, ou renoncer au noyau exact | D.3 « bloquante » ; conditionne P2-1, P2-3, P2-6, STEP | P2-1 |
| **Solveur de contraintes** : solveur écrit et borné, bibliothèque sous licence admise, ou D-Cubed (commercial) | D.3 « à évaluer » ; mesure comparative en P2-0, choix à prendre ensuite | P2-3 |
| **DWG / DGN** : renoncer (déclaré), SDK commercial, ou bibliothèque GPL isolée dans un service séparé | aucune bibliothèque libre sous licence admise | P2-7 |
| **Sources des valeurs de catalogue** (profils, diamètres, pliage, assemblages) | R3 : rien n'est inventé ; sans source, les catalogues sont livrés vides | P2-2 à P2-5 |
| **Fournisseur de modèle de langage** | inchangé depuis P1 : sans lui, génération déterministe seulement | P2-8 |
| **Corpus de preuve P2** : un projet mixte de référence (bâtiment + machine + réseau) fourni ou construit | la condition de passage P1 → P2 se prouve sur un cas, pas sur P.118 seul | P2-0 |

## 7. Risques et parades

| Risque | Parade |
| --- | --- |
| OCCT WASM : démarrage, mémoire 32 bits, taille (D6) | jamais sur le chemin d'ouverture ; Web Worker ; mesures P2-0 avant tout engagement ; repli maillage déclaré |
| Valeurs normatives absorbées « par commodité » | catalogues vides à la livraison ; import sourcé ; contrôle en recette (`grep` des constantes numériques dans les ontologies) |
| Ontologies qui deviennent des éditions | une seule palette, un seul inspecteur ; recette T01 : ouvrir un outil de chaque ontologie dans le même projet sans changer d'écran |
| Solveur instable (sur- / sous-contraint) | diagnostics nommés avant résolution ; refus explicite ; cas de référence sous test |
| Dérive de calendrier sur P2-3 et P2-5 | lots indépendants, réordonnables ; marge haute sur ces deux lots |

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
