# Lot P2-4 — Bois et tôlerie — compte rendu

Exécuté le 8 octobre 2026 (chef de projet, exécution continue avec décisions déléguées, D-183 ; décisions prises
consignées en D-186). Cadre : `docs/atelier-cahier-p2.md` §3.1 (`timber`, `sheetmetal`), §4, §5 (lot P2-4), §8 ; D-180
(catalogues sourcés). Fiches : DA-09-01 à 08, DA-11-01 à 05 — à l'état **prototype**.

Critère du cahier : « dessiner un mur à ossature, obtenir la liste des pièces ; plier une tôle, lire le développé » —
joué par la recette `apps/web/e2e/p2-bois-tolerie.mjs` (21 contrôles verts) sur P.118-B : ossature créée depuis
l'inspecteur sur une façade de P.118 (avec ses baies), aperçu puis accord, liste des pièces ; tôle pliée depuis
l'inspecteur, développé lu dans la fiche et dans la table de pliage.

## Fait

| Tâche | Résultat |
| --- | --- |
| Ontologies `timber` et `sheetmetal` activables (T01) | `ONTOLOGIES_ACTIVABLES` = [mechanical, structure, timber, sheetmetal] ; classes refusées tant que l'ontologie n'est pas active ; désactivation refusée tant qu'un objet existe. Géométrie 3D commune sortie de l'ontologie structure vers `src/geometrie-3d.ts` (balayage, boîtes, cylindres, fusion, volume, emprise) : aucune ontologie n'en importe une autre (tests de source pour chaque ontologie). |
| Modèle bois `ontologies/timber/` | `sections.ts` (rectangle saisi ou catalogue `sections-bois.csv` sourcé : largeur, hauteur, essence, classe, source), `ossature.ts` (`planOssatureMur` : lisse, sablière, montants à l'entraxe avec rives affleurantes, montants de rive, linteau, appui ; `planCharpente` : sablières d'égout, faîtière, chevrons de l'égout au faîtage sur chaque pan), `geometrie.ts`, `index.ts` (réducteurs `elementBois.*`, `ossature.*` + `generer` après aperçu, `panneauClt.*`, `assemblageBois.*` ; cascade ; `controlerBois`). Classes `element-bois` (15 rôles, section, repère de débit), `ossature` (hôte mur ou toiture, entraxe, sections, mémoire de génération), `panneau-clt` (vertical ou plancher, couches), `assemblage-bois` (11 types, nature déduite, platine pour le bois–métal, quincaillerie déclarée avec source). |
| Modèle tôlerie `ontologies/sheetmetal/` | `pliage.ts` : `parametresPli` (table sourcée : ligne de l'angle exact avec déduction, sinon ligne générique avec K ; ou facteur K déclaré avec sa source ; sinon non évalué), `developpe` (contour en croix, lignes de pli, encombrement, aire), `tablePliage` ; `geometrie.ts` : face, zones pliées (arcs intérieur / extérieur), ailes, emprise ; `index.ts` : `tole.creer / modifier / plier / deplier / supprimer`, `developpeTole`. Classe `tole` (face, épaisseur, rayon, matériau, un pli par bord, paramètres de pliage). |
| Documents, IFC | Tableaux **« Liste des pièces de bois »** (pièces, panneaux CLT, quincaillerie ; essence, classe, source, longueur, volume, masse non évaluée) et **« Table de pliage et développés »** (un pli par ligne : K, allongement, source ; développé L × l, aire) → documents CSV. IFC : `IfcMember` typé par rôle (STUD, PLATE, POST, PURLIN, RAFTER, BRACE, STRUT) ou `IfcBeam` (.BEAM. / .JOIST.), essence en `IfcMaterial`, `IfcElementAssembly` par ossature, `IfcWall` .SOLIDWALL. / `IfcSlab` .FLOOR. (CLT), `IfcFastener` / `IfcDiscreteAccessory` (assemblages), `IfcPlate` .SHEET. (tôle) ; psets `Fadi_Bois`, `Fadi_Ossature`, `Fadi_CLT`, `Fadi_AssemblageBois`, `Fadi_Tole` ; matrice complétée. |
| Interface (`apps/web`) | `panneaux/Bois.tsx` : outils **Élément bois**, **Ossature bois** (mur ou toiture sélectionné ; fiche : aperçu par rôle, hauteur si le mur n'en a pas, « Générer (accord) »), **Panneau CLT**, **Assemblage bois** (quincaillerie article par article) ; `panneaux/Tolerie.tsx` : outil **Tôle pliée** (plis, table ou K déclaré), fiche avec développé dessiné (contour, lignes de pli) et dimensions, boutons « Retirer le pli ». Correction transverse : le panneau d'un outil d'ontologie reste visible au-dessus de la sélection (les outils « sur sélection » de P2-2 et P2-3 en bénéficient) ; l'outil de trame structurale est renommé `trame-structure` (il masquait la trame d'axes du socle). Rendu plan, accrochage, sélection ; 150 clés anglaises. |
| API (`apps/api`) | `atelier-bois-tolerie.test.ts` : activation, ossature générée par le serveur sur un mur avec fenêtre, catalogue bois, CLT, assemblage, table de pliage et tôles, deux CSV, IFC réimporté ; comptes de documents (+2). |
| **Recette** (`apps/web/e2e/p2-bois-tolerie.mjs`, en CI) | 21 contrôles verts : activation ; ossature MOB-1 créée depuis l'inspecteur sur une façade de P.118 (section du catalogue sourcé) ; aperçu puis accord → 39 pièces (lisses, sablière, montants, linteaux) dessinées en plan ; CLT et équerre ; fiche d'un montant (section, essence, source, masse non évaluée) ; tôle Capot créée depuis l'inspecteur, développé 454,5 × 332,2 mm lu dans la fiche avec 4 lignes de pli ; table de pliage sourcée (K 0,44), tôle sans paramètre « non évaluée » ; deux CSV ; IFC et réimport ; un seul écran, un seul journal, bâtiment inchangé, 390 px, axe-core. |

## Contrôles

- `npm run typecheck` ✅ · tests `atelier-model` 414 (dont 7 `timber.test.ts`, 4 `sheetmetal.test.ts`), API 92 (dont
  `atelier-bois-tolerie.test.ts`), web tsc ✅ · `npm run build` ✅ · recettes `p2-bois-tolerie.mjs` 21 / 21,
  `p2-structure.mjs` (rejouée après le renommage de l'outil) et `interface-anglais.mjs` ✅ ici.
- Definition of Done P2 §8 : (1) activation / désactivation par projet ✅ ; (2) aucune ontologie n'en importe une autre
  (tests) ✅ ; (3) aucune constante normative (classes de bois, densités, facteurs K, rayons : tests) ✅ ; (4) matrice IFC
  complétée ✅ ; (5) fiches prototype.

## Non fait (déclaré)

- **Montants courts** (allèges, impostes), entretoises, doublage des rives ; **fermes et arbalétriers**, pannes
  intermédiaires, débords, noues : reportés (D-186 h).
- **Plis en chaîne** (pli sur une aile), découpes et trous, grugeages ; **patron sur feuille et DXF du développé** : P2-7.
- **Masse** : non évaluée (aucune densité de bois ni d'acier n'est connue du code) ; **résistance** : jamais évaluée.
- Mur courbe : ossature non traitée (axe droit) ; toiture plate : charpente refusée (déclaré).

## Décisions prises (déléguées, D-183)

D-186 (a) à (h) : deux ontologies, géométrie partagée, plan d'ossature de mur, charpente, sections sourcées,
assemblages et quincaillerie, correspondances IFC, paramètres de pliage fournis, reports.

## Ce que le maître d'ouvrage peut vérifier et ce qui lui revient

- Rejouer `p2-bois-tolerie.mjs` ; dans P.118, sélectionner un mur, outil « Ossature bois », lire l'aperçu, accorder,
  ouvrir le CSV « Liste des pièces de bois ».
- Fournir la table de pliage de l'atelier (gabarit `table-pliage.csv`) et un catalogue de sections bois sourcé : sans
  eux, le développé est « non évalué » et les sections se saisissent une à une.
- Accepter le lot (fiches → « disponible ») ou demander des reprises ; lot suivant de l'exécution continue : P2-5
  (réseaux).
