# Référence : `Parcours_V8_19_Escalier_B_Mezzanine.html`

Ce document identifie la référence fonctionnelle du prototype et inventorie
ce qu'elle contient **réellement** — pas ses titres, pas son premier script.
Il fait autorité pour juger si une étape de la webApp a ou non repris le
comportement du prototype (voir `docs/migration/matrix.md`).

État : audit complet des blocs de script, du code hôte (`study()`,
`content()`, formulaires, KPI, stockage), des trois sous-applications
embarquées et du moteur de l'Atelier natif. Exécution réelle dans Chromium
(Playwright) avec captures des 21 étapes en 1280 px et 390 px, exemple
résolu **et** projet vierge — voir `captures/reference/` et
`captures/reference/inventory*.json` (inventaire DOM par étape : titres,
champs, boutons, tableaux, sections repliables, iframes).

## Identité du fichier

| Champ | Valeur |
|---|---|
| Nom | `Parcours_V8_19_Escalier_B_Mezzanine.html` |
| Taille | 18 138 479 octets (≈ 17,3 Mio) |
| SHA-256 | `e91492a0b382dd4ca11c20abe70f11ebe44d3bb48d2951b0b9eba9451171f0b9` |

Le fichier n'est pas commité (18 Mio, ce n'est pas du code source du
produit). Il reste disponible comme pièce jointe de la conversation ; son
empreinte permet de vérifier qu'une copie ultérieure est identique à celle
analysée ici.

## Architecture réelle du prototype

Un seul document HTML, en couches successives : chaque script plus récent
**enveloppe** les fonctions des précédents (`const old=financeKPIs;
financeKPIs=function(){…old()}`) au lieu de les remplacer. Le comportement
final est la composition, et c'est lui qui est capturé dans
`captures/reference/`.

```
corps HTML (268 Ko, dont 246 Ko de CSS)   ← markup + styles de l'Atelier natif (design.v13 / V14)
anonyme #0 (398 Ko)  stockage partagé + données natives P.118 pré-chargées (design.v13.*)
anonyme #1 (325 Ko)  proj4 (minifié) + VIEWER de l'Atelier natif : registre projets, import KML/KMZ,
                     rendu 3D canvas, plan/coupe/façade SVG, vues enregistrées, exports PNG/SVG,
                     études solaires, toit, « Éclaté », menus
anonyme #2 ( 95 Ko)  géométrie partagée (poteaux, murs, escaliers, prismes, découpes) +
                     OUTILS DE DESSIN natifs (fd*) : tracés, guides, accrochage, ouvertures
                     sur mur hôte, extrusion, pousser/tirer, dupliquer, décaler, annuler/rétablir,
                     palette d'outils, export plan SVG/DXF
anonyme #3 (13,2 Mo) = 1,2 Ko d'en-tête (ST, PH, MOD) + 8,3 Mo de blobs EMB (3 documents HTML
                     base64) + 4,9 Mo d'app hôte, dont SEED888 (402 Ko JSON) et SEED888_FILES
                     (KMZ 881 Ko + PDF 2,27 Mo en base64) ; code hôte réel ≈ 310 Ko
harmony-engine-v6 / harmony-app-v6, building-library-*, p118-dossier-v62, flow-v62,
anonyme #10, h7-stage-data, sections-v82, h7-app, p118-resolved-data, p118-resolved-template,
p118-resolved-app, sections-v82-lifecycle, atelier-harmonie-page-app  ← couches métier successives
```

## Inventaire des blocs `<script>`

| id | type | octets | Classification | Rôle vérifié |
|---|---|---:|---|---|
| *(anonyme #0)* | js | 397 788 | actif — infrastructure + données | Pont de stockage (cache mémoire, repli si le stockage local est refusé) et **données natives P.118 pré-chargées** sous les clés `design.v13.project.<id>.{levels,floorDesign,nativeParcel,buildingFootprint,ui}`, `design.v13.registry`, `design.v13.activeProject` |
| *(anonyme #1)* | js | 324 555 | librairie + actif | `proj4` puis le **viewer de l'Atelier natif** (341 fonctions : `parseKML`, `unzipKml`, `render3D`, `renderPlanView`, `renderSection`, `renderElevation`, `renderTechnical`, `exportPNG`, `exportSVG`, `saveView`, `explodeLift`, `roofScene`, `createSolar*`, `renderLevelManager`, `openImport`…) |
| *(anonyme #2)* | js | 94 587 | actif — géométrie + dessin | « Shared model geometry » (`wallPoly`, `stairFoot`, `cutPrism`, `prismFaces`…) et « Native workshop drawing tools » (`fdEdit`, `fdGuides`, `snap`, `addOpening`/`nearestWall`, `fdExtrude`, `fdSetPushAxis`/`applyPushValue`, `fdDuplicate`, `fdOffsetSelected`, `undoRedo`, `toolPaletteHTML`, `buildPlanSVG`, `exportFile` SVG/DXF) |
| *(anonyme #3)* | js | 13 223 873 | mixte — voir détail ci-dessous | En-tête `ST`/`PH`/`MOD` ; `EMB` (3 HTML base64) ; app hôte : `home()`, `overview()`, `study()`, `content()`, `BIZ_SCHEMAS`, `BIZ_INTRO`, `financeKPIs`, `scoreKPIs`, `decisionPanel`, `PROGRAMME_TYPES`, `programme*`, `SOURCE_EXAMPLES` (235 Ko, 10 cas), `EXAMPLE_STAGE_MAP`, bibliothèque d'exemples, `FILE_DB` (IndexedDB : pièces par étape), barre d'outils/menus de l'Atelier, `mountNativeDesigner` |
| `harmony-engine-v6` | js | 32 351 | actif | Règles d'évaluation Harmony V6, pures et versionnées (`H-2026.09.28-1`), sans mutation de géométrie |
| `harmony-app-v6` | js | 91 724 | actif | Intégration Harmony V6 (bilan du bâtiment), identifiants d'étape conservés |
| `building-library-data` | json | 1 249 002 | donnée — **non importée** | `Parcours.BuildingLibrary` 6.1.0 : `profiles` (10 types), `references`, `cases` (21 cas), `surfaceConvention` |
| `building-library-app` | js | 62 105 | actif | Bibliothèque de programme : « cas sources et géométrie native immuables, applications créent des cibles de programme versionnées » ; blocs « Programme lié », « Répartition / fiches espaces », « Comparer au modèle », « Bibliothèque par types » |
| `p118-dossier-v62` | json | 44 418 | donnée — importée | Dossier antérieur → `apps/api/src/data/examples/p118-dossier-anterieur.json` |
| `flow-v62` | js | 79 602 | actif | Transmissions explicites entre étapes, métrés dérivés du modèle natif, règle « chiffrage incomplet » du KPI finance (une valeur inconnue n'est pas zéro), bilan Harmony du bâtiment |
| *(anonyme #10)* | js | 9 162 | actif — infrastructure | `localStorage` scopé par iframe (`ParcoursFlowV62.frameStorage`) pour le sous-outil parcelle |
| `h7-stage-data` | json | 27 237 | donnée — importée | Registre des 21 étapes → `apps/api/src/data/parcours-steps.json` (titres, phases, périmètre, objectif, entrées, livrable, méthode, 3 propositions Harmonie/étape) |
| `sections-v82` | js | 4 861 | actif — UI | Placement/état des accordéons uniquement |
| `h7-app` | js | 77 961 | actif | **Harmonie par étape** : propositions A/B/C, actions Retenir / Adapter-motiver / Écarter avec motif / Consigner une vérification, arbitrage (adaptation, responsable, référence d'objet, preuve), compteur « N choix retenu(s) », onglets Proposer / Comparer / Choix & transmission, rapport d'étape |
| `p118-resolved-data` | json | 471 364 | donnée — **partiellement importée** | `steps` (récit Harmonie, 21) ✔ importé ; `business` (réponses des 17 formulaires + synthèses 1/10/11/21, chaque valeur préfixée `[DONNÉE / CALCUL DU FICHIER SOURCE]` ou `[HYPOTHÈSE RETENUE POUR L'EXEMPLE]`) ✘ ; `roomResponses` (74 fiches d'espaces : niveau, surface, capacité, usage, décision) ✘ ; `programme` (cas `Parcours.ProgrammeCase` lié à la bibliothèque) ✘ ; `facts`, `assumptions`, `criteria` ✔ |
| `p118-resolved-template` | json | 1 545 993 | donnée — partiellement importée | `native.domains.floorDesign` (plan complet, 6 niveaux, 1 753 objets) ✔ → `p118-native-architecture.json` ; `native.domains.nativeParcel` (4 bornes EPSG:26191) ✘ ; `project.data.{architecture,structure,circulation,harmony,webSources}` ✘ |
| `p118-resolved-app` | js | 45 761 | actif | Rend l'exemple résolu : « Réponses renseignées · NN » (lecture seule), « Répartition renseignée et liée au modèle », bouton « Créer une copie pour essayer » (copie éditable, ids `P118-ESSAI-…`) |
| `sections-v82-lifecycle` | js | 439 | actif | Enveloppe `study()` pour `ParcoursSectionsV82.enterStage()` |
| `atelier-harmonie-page-app` | js | 10 289 | actif | Page Harmony de l'étape 10 = sous-page de l'Atelier (nœuds DOM déplacés, jamais copiés) |

### Détail du bloc anonyme #3 (le « monolithe »)

| Partie | Octets | Contenu | État |
|---|---:|---|---|
| En-tête | 1 184 | `ST` (21 titres), `PH` (21 phases), `MOD={"1":"parcel","10":"designer","11":"esquisser"}` | actif |
| `EMB.parcel` | 1 294 552 (b64) → 969 220 | **« Parcelle — Atelier satellite »** : Leaflet, proj4, décompression KMZ, MapTiler optionnel, canvas 2D, export SVG. Panneaux : Mes parcelles, Données du fichier, Parcelle, Construction, Voirie, Distances réglementaires, Système de coordonnées, Bornes, Export « Design Parcel 2.0 » | **actif** — chargé dans l'iframe de l'étape 01 |
| `EMB.designer` | 944 848 → 706 840 | « Design Atelier V14.3 — Schema 2.0 · Atelier vierge » : ancien atelier autonome (Volume/Éclaté/Plan/Coupe/Façade, solaire, DXF/SVG/JSON) | **superseded** — l'étape 10 monte l'atelier natif du document, pas cette iframe (inventaire DOM : 0 iframe à l'étape 10) |
| `EMB.esquisser` | 6 072 380 → 4 551 832 | « Parcours du projet — V14.3 » : une version antérieure **complète** du Parcours (17 scripts), imbriquée | **superseded** — l'étape 11 affiche « plans, coupes et façades du même modèle que l'Atelier 10 » via l'atelier natif (0 iframe) |
| `SEED888` | 402 254 | Projet exemple V6 « P.118 — Formation & bureaux » (business, parcel888, circulation, architecture, structure…) | actif (semence initiale, migrée vers l'exemple résolu V8.19 au chargement) |
| `SEED888_FILES` | 4 203 948 (b64) | `118_officiel.kmz` (881 Ko : `doc.kml`, `donnees/Bornes_Lambert_S01.csv`, `donnees/Traces_interieurs_Lambert.csv`, `donnees/Notice.txt`, `source/Document_cadastral_original.pdf`, pages PNG) et `ZONE-I-5.pdf` (2,27 Mo) | actif — « Documents de base intégrés », téléchargeables |
| Code hôte | ≈ 310 000 | Voir « Écran d'étape réel » ci-dessous | actif |

## Écran d'étape réel (`study()` + couches) — ce que l'utilisateur peut faire

Vérifié par exécution (projet vierge « Étude test migration », inventaire
DOM dans `captures/reference/inventory-2.json`) :

1. **En-tête** : « Parcours du projet », « ÉTAPE NN / 21 · phase », bouton
   « ◈ Harmonie de l'étape », retour (`#workflowBack`), accueil.
2. **Titre + phrase d'introduction** (étape 01 : « Point de départ autonome… »,
   autres : « Cette étape poursuit le dossier maître créé à partir de la parcelle. »).
3. **Harmonie · ‹périmètre› · N choix retenu(s)** (accordéon) : « Propositions
   pour cette étape », « Actualiser les propositions », « Rapport de cette
   étape », « Données mobilisées et intentions reçues (n) » (Objet, Type,
   intentions transmises par l'étape précédente), onglets Proposer /
   Comparer / Choix & transmission, **3 cartes A/B/C** (titre, proposition,
   « Pourquoi ici », Intérêt, Compromis, Conditions) avec **Retenir**,
   **Adapter / motiver**, pli « Arbitrage, responsable et preuve »
   (Adaptation proposée ou motif, Responsable, Référence d'objet / fiche,
   Preuve / référence de revue, **Retenir l'adaptation**, **Écarter avec
   motif**, **Consigner une vérification**, et à partir de l'étape 06
   **Traduite au programme**, étapes ≥ 10 **Dessinée — référence requise**),
   « Cadre de lecture et éléments antérieurs conservés », ligne de révision.
4. **Formulaire métier** (`BIZ_SCHEMAS`, 17 étapes : 02–09, 12–20) :
   champs `f1…fN` (text / textarea / number / date), grille 2 colonnes,
   placeholder « À documenter… », sauvegarde à `change` dans
   `p.data.business[étape][clé]`. Compléments : **14** KPI Investissement /
   Financement / Solde — ou « Chiffrage incomplet » tant que f1–f6, f9, f10
   ne sont pas tous des nombres finis ; **17** KPI « Note provisoire x / 5 ·
   n/8 critères », « Due diligence » (réserves si 16.f10 rempli),
   « Décision » (19) ; **19** boutons GO / GO sous conditions / À reprendre /
   NO GO ; **21** « Synthèse / livrable » (textarea `summary`).
5. **Répartition programmatique par type de bâtiment** (06 et 07) :
   `PROGRAMME_TYPES` (tertiaire, résidentiel, commercial, industriel,
   public : fourchettes min/cible/max pour circulations, locaux techniques,
   sanitaires, accueil/convivialité), surface de référence (673 m² par
   défaut), position dans la fourchette, ratios éditables, KPI (surface
   référence, fonctions support %, support calculé, solde programmable),
   tableau Famille / Fourchette / Ratio projet / Surface, matrice
   d'adjacence (6 relations), bloc « Programme transmis à l'Atelier ».
6. **Étapes 01 / 10 / 11** : outil Parcelle (iframe) ; Atelier natif
   (barre Modèle/Design/Concevoir/Analyser/Documenter/⋯, menus Niveau/Vue/
   Mode/Dessins techniques, annuler/rétablir, plein écran, niveau actif,
   Créateur de vue (Est/Ouest, Nord/Sud, Roll, N/S/E/O/Dessus/Dessous,
   Représentation, Enregistrer la vue), Affichage (niveaux sous 0, objets/
   annotations, cotes et repères), couches Parcelle/Recul/Emprise/Voirie,
   Exporter PNG, Plan SVG, EPSG:26191 · surface · périmètre · emprise) ;
   l'étape 11 = même modèle en plan orienté nord, Voir A–A / B–B.
7. **Bibliothèque d'exemples par type de bâtiment** (accordéon, « Ouvrir la
   bibliothèque »), et sur l'exemple résolu « Exemples issus des fichiers
   sources » (10 cas, « Utiliser comme aide au remplissage »).
8. **Sources de l'étape** : « + Importer des fichiers », zone de dépôt
   (PDF, DOCX, XLSX, images, KML/KMZ, JSON), liste des pièces, téléchargement,
   suppression — stockage IndexedDB `FILE_DB`.
9. **Navigation** : « ← Précédente », **« Marquer terminée » / « Terminée ✓ »**
   (bascule `p.done[étape]`, qui alimente la progression « n / 21 étapes
   terminées »), « Suivante → ». Sur l'exemple résolu : « Étape illustrée ✓ »
   désactivé.

## Format de stockage du prototype

`localStorage["potentiel-v3"] = {projects:[{id, name, data, done}]}` avec
`data` = `{business:{[étape]:{f1…, decision, summary}}, programmeRepartition:
{type, baseArea, mode, custom}, harmonieEtapesV7, harmony, transmissionV62,
decision, exampleSelection, exampleUsed, nativeProjectId, architecture, …}`
et `done` = `{[étape]: boolean}`. Modèle natif de l'Atelier :
`design.v13.*`. Pièces jointes : IndexedDB. Vérifié : saisie à l'étape 14
(f1=1000, f9=400) conservée après rechargement (`inventory-2.json`,
`storageSnapshot`).

## Géoréférencement — ce que la source dit elle-même

`118_officiel.kmz/donnees/Notice.txt` : « Conversion de localisation :
Merchich / Nord Maroc (EPSG:26191), hypothèse cohérente avec Parcelle ; la
feuille source indique LAMBERT sans numéro EPSG. Transformation Merchich vers
WGS84 (1), translations +31 / +146 / +47 m, précision annoncée de 7 m dans la
base EPSG. » Le CSV `Bornes_Lambert_S01.csv` fournit, **pour chaque borne**,
X/Y Lambert **et** longitude/latitude WGS84 calculées par la source. Il n'y a
donc rien à inventer : la webApp peut porter la parcelle en WGS84 comme
*donnée source* accompagnée de son *hypothèse* (EPSG:26191, ±7 m), tagguée
comme telle — jamais comme une mesure.

| Borne | X Lambert (m) | Y Lambert (m) | Longitude WGS84 | Latitude WGS84 |
|---|---:|---:|---:|---:|
| B.266 | 321 946,82 | 347 183,88 | -7,3199224531640 | 33,7081855041431 |
| B.267 | 321 954,11 | 347 215,38 | -7,3198500513508 | 33,7084707585474 |
| B.268 | 321 995,84 | 347 186,25 | -7,3193940264975 | 33,7082150069432 |
| B.265 | 321 978,68 | 347 161,67 | -7,3195742942528 | 33,7079905153165 |

Longueurs Lambert 32,33 / 50,89 / 29,98 / 38,84 m ; périmètre 152,04 m ;
surface Lambert 1 345,54755 m² ; contenance adoptée 1 346 m².

## Captures de référence

`captures/reference/` : `00-home-desktop.png`, `00-overview-{desktop,mobile}.png`,
`00-overview-tools-open-desktop.png`, `NN-{desktop,mobile}.png` (21 étapes de
l'exemple résolu), `02|14|19-desktop-expanded.png` (accordéons ouverts),
`new-00-overview-{desktop,mobile}.png`, `new-NN-desktop.png` (projet vierge :
01, 02, 06, 07, 10, 14, 17, 19, 21), `new-02|06|19-desktop-expanded.png`,
`new-06-mobile.png`, `new-14-desktop-after-input.png` (KPI après saisie).
Conditions : Chromium headless, 1280×900 (desktop) et 390×844 @2x (mobile),
`file://`, stockage vierge, navigation depuis la vue d'ensemble pour chaque
étape, délais 0,9 s (4 s étape 01, 2,5 s étape 10). Images quantifiées en
palette 256 couleurs pour tenir dans le dépôt (lisibilité vérifiée).
