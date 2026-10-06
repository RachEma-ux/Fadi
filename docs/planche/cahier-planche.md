# Cahier des charges — mode « Planche » de l'Atelier

**Version 1 — 6 octobre 2026.** Maître d'ouvrage : le propriétaire du dépôt. Rédigé par le chef de projet à partir
des décisions du maître d'ouvrage du 6 octobre 2026 et des relevés en direct de SketchUp pour le Web du même jour.

Ordre d'autorité (inchangé) : `AGENTS.md` → `docs/atelier-cahier-des-charges.md` (règles R1–R20, §10) → ce cahier →
`docs/atelier/ergonomie/*` → relevés de `docs/planche/reference/`. Une contradiction non résolue par cet ordre est une
décision du maître d'ouvrage (§10) : on s'arrête et on demande.

### Légende des statuts de relevé

| Marque | Sens | Conséquence pour le code |
| --- | --- | --- |
| **obs** | Observé en direct le 06/10/2026 (geste réel, texte lu dans le DOM). | Comportement de référence ; reproduit tel quel sauf écart déclaré. |
| **instr** | Texte de l'Instructor de SketchUp relevé, effet non constaté. | Reproduit seulement après relevé, ou comme « choix Fadi » déclaré. |
| **doc** | Documentation officielle sourcée (`doc-officielle.md`, [S#] / [F#]), non constatée en direct. | Idem **instr**. |
| **nv** | Non vérifié : rien n'a été constaté (lacune listée en §9). | Jamais codé comme un fait ; l'outil le déclare absent ou le traite comme « choix Fadi ». |
| **fadi** | Choix ou écart propre à Fadi, imposé par une règle ou proposé (§2, §10). | Déclaré dans la fiche et dans l'aide de l'outil. |

Renvois aux relevés : **[OD]** `reference/outils-dessin.md`, **[OM]** `reference/outils-modification.md`, **[CM]**
`reference/complements-modification.md`, **[MCP]** `reference/mesure-camera-panneaux.md`, **[CP]**
`reference/complements-panneaux.md`, **[DOC]** `reference/doc-officielle.md`. Exemple : [OD §4] = section 4 de
`outils-dessin.md`.

Les textes de barre d'état et les libellés du champ Mesures sont **traduits** des textes anglais relevés ; le texte
relevé est cité entre accents graves pour la traçabilité. La traduction est un choix Fadi (R1), pas un relevé.

---

## 1. Objectif et décisions

### 1.1 Objectif

Offrir dans l'Atelier **exactement les mêmes outils que SketchUp pour le Web** — géométrie libre (arêtes et faces
collantes), groupes, composants, outils de dessin, de modification, de mesure, d'annotation et de caméra, panneaux —
avec des **écarts déclarés** là où les règles de Fadi l'imposent (§2). « Les mêmes » s'entend : mêmes étapes, mêmes
consignes (traduites), mêmes saisies au champ Mesures, mêmes modificateurs (bascule ou maintenu), mêmes inférences et
couleurs, même granularité d'annulation, tels que relevés.

### 1.2 Décisions du maître d'ouvrage (06/10/2026)

| # | Décision | Conséquence dans ce cahier |
| --- | --- | --- |
| MO-1 | La Planche est un **nouveau mode de travail de l'Atelier**, à côté de Plan / 3D / Documents — **pas un 8ᵉ module**. Les 7 modules de `docs/architecture.md` restent inchangés. | `ModeTravail` de l'Atelier (`"2d" \| "3d" \| "documents"`) reçoit une 4ᵉ valeur `"planche"` (lot 2). Le paquet pur `packages/planche-model` est un paquet de calcul, pas un module produit. |
| MO-2 | La Planche **réutilise** le bus de commandes, les révisions, le hors-ligne, annuler / rétablir, la disposition Canevas (D-156), la navigation configurable (D-157) et le partage. | Aucun second journal, aucune seconde file locale, aucun second système de droits. Lot 7 : commandes Planche dans le contrat de l'Atelier. |
| MO-3 | Objectif : **exactement les mêmes outils que SketchUp pour le Web**, écarts déclarés là où les règles Fadi l'imposent. | §2 (tableau de compatibilité), §4 (outil par outil). |
| MO-4 | Booléens (Coque extérieure, Intersection, Union, Soustraction, Découpe, Scission) par **manifold-3d** (Apache-2.0, admis par D-013) ; booléens de **maillage**, déclarés comme tels ; **OCCT non ouvert**. | Lot 6. Aucun résultat n'est présenté comme exact au sens B-Rep. |
| MO-5 | Méthode : **un lot à la fois** ; lot 1 = noyau pur `packages/planche-model` (géométrie libre, grammaire du champ Mesures, inférences, catalogue déclaratif des outils), **sans interface**. | §8 ; `lots/lot-1.md` ; fiches PL-01-01 à PL-01-04. |

Ces décisions sont à consigner dans `docs/atelier/decisions.md` (prochain numéro libre) par le chef de projet ; ce
cahier ne modifie pas ce journal.

### 1.3 Ce qui ne bouge pas

Les 21 étapes du Parcours, Harmonie, les 7 modules, le modèle typé de l'Atelier et ses commandes existantes, les modes
Plan / 3D / Documents et leurs recettes, la disposition classique (D-156 la garde par défaut), les préférences de
navigation (D-157). La Planche est **additive** : aucune fonction existante n'est retirée ni renommée.

---

## 2. Compatibilité avec les règles de Fadi

| # | Exigence « comme SketchUp » | Règle Fadi | Verdict | Traitement retenu |
| --- | --- | --- | --- | --- |
| C1 | Interface, consignes, libellés et alertes en anglais ; 12 langues (Settings > Language) [MCP §7.1]. | **R1** (application en français), `AGENTS.md`. | Conflit | Tout texte affiché est en français (traduction fidèle, §1). Le nom anglais de chaque outil est gardé dans le catalogue (`nomReference`) comme **synonyme de recherche** (la palette accepte déjà des synonymes, DA-02-15), jamais comme libellé. Pas de sélecteur de langue actif ; le globe de la barre du bas affiche « Français » (comme D-156). |
| C2 | Valeurs par défaut des outils (24 côtés, 12 segments, 6 côtés, hauteur d'œil, champ de vision, pas d'accrochage…) [OD §7–12, MCP §2, CP Model Info]. | **R3** (rien d'inventé). | Compatible | Ce sont des **paramètres de saisie d'outil**, pas des données de projet : reproduits aux valeurs **relevées** et affichés comme tels. Une valeur non relevée (nv) n'est pas reproduite : l'outil demande la valeur ou déclare l'absence. |
| C3 | Comportements décrits seulement par l'Instructor ou la documentation. | **R3**. | Compatible sous condition | Marqués **instr** / **doc** / **nv** (§4) ; non codés comme faits tant qu'un relevé ne les confirme pas (§9), ou livrés comme « choix Fadi » déclaré dans l'aide de l'outil. |
| C4 | Géométrie libre calculée dans l'application. | **R6** (pureté), `AGENTS.md` (géométrie indépendante de React). | Compatible | `packages/planche-model` : aucun import de `react`, `three`, `dexie`, `express` ni d'API navigateur ; `manifest.json` `allowedDependencies: []` au lot 1 (contrôlé par `scripts/check-module-deps.mjs`). Les inférences reçoivent la caméra sous forme de nombres (matrices, fenêtre), jamais un objet three.js. |
| C5 | Outils livrés sans spécification écrite. | **R8** (fiche « spécifiée » avant code). | Compatible | Fiches `docs/planche/fiches/PL-NN-MM.md` au gabarit des fiches DA ; PL-01-01 à PL-01-04 au lot 1 ; chaque lot suivant rédige les siennes avant le code. |
| C6 | Toute opération s'annule en un pas (observé : une opération = un pas ; Tampon : un pas par copie ; masquer et réafficher : un pas chacun) [OM §0.4, CM §9]. | **R9** (commande typée, idempotente, validée par le serveur, journalisée, inversible). | Compatible | Chaque opération du noyau rend le nouvel état **et** une différence exacte (instantané différentiel, même principe que `interne.restaurer`, D-014) ; au lot 7, une opération = une commande de l'Atelier (un `requestId`, une entrée de journal, un pas d'annulation). Jusqu'au lot 7, la Planche est un **brouillon local** affiché comme tel (« Brouillon local — non enregistré dans le projet ») : rien n'est présenté comme enregistré (R20). |
| C7 | Caméra, sélection, contexte d'édition, outil actif, état des inférences, panneaux, bascules d'affichage (X-ray, arêtes, axes visibles, ombres affichées…). | **R10** (l'affichage ne touche pas la révision). | Compatible | Préférences ou état d'interface, jamais une révision. **Données de la Planche** (commandes) : géométrie, attributs d'arête et de face (adoucie, lissée, masquée), matériaux, balises, guides, cotes, textes, plans de coupe et leur état actif, axes de dessin, scènes enregistrées (comme les vues 3D, D-053). SketchUp les enregistre dans le fichier et les annule (masquer : observé [CM §9]). |
| C8 | Formes libres sans paramètres d'objet de bâtiment. | **R15** (géométrie canonique paramétrique pour le bâtiment ; **aucun objet n'a deux géométries canoniques**). | Compatible avec déclaration | Une forme de la Planche a **sa propre géométrie canonique « maillage libre »** (sommets, arêtes, faces planes, PL-01-01) — c'est une classe nouvelle, pas un objet de bâtiment. **Pas de double représentation** : les métadonnées de courbe (centre, rayon, nombre de segments d'un arc) sont des attributs subordonnés qui servent à **régénérer** les sommets sur commande explicite (`8s`, rayon dans Info entité) ; elles ne sont jamais une seconde source de vérité. Une forme libre n'est jamais convertie en mur, dalle, etc. en silence ; une conversion éventuelle est une décision (§10, P-10). |
| C9 | Co-édition d'un même modèle (partage SketchUp). | **R17** (pas de CRDT sur la géométrie). | Compatible | Commandes avec `baseRevision` (409 si périmée), réservations fines existantes (D-020, D-143) appliquées aux objets de la Planche. Aucun CRDT. |
| C10 | Livraison par lots. | **R19** (typecheck, test, build avant commit ; e2e et CI verts avant acceptation). | Compatible | Chaque lot (§8) liste ses contrôles ; un contrôle qui n'a pas pu tourner est déclaré. |
| C11 | Outils grisés (booléens de l'offre gratuite), fonctions non relevées. | **R20** (pas de fonction factice). | Compatible | Un outil non livré n'apparaît pas actif : il est absent ou désactivé avec motif (« Disponible au lot N »). Pas de bouton sans effet. |
| C12 | Axes de dessin déplaçables (outil Axes) ; positions affichées en coordonnées. | **R5** (repères tagués, conversions explicites). | Compatible | Toute coordonnée stockée de la Planche est dans le repère **`local`** du projet (mètres). Les « axes de dessin » de l'outil Axes sont un **repère de saisie** (origine + orientation) qui ne change jamais le repère des valeurs stockées ; une saisie `[x;y;z]` est convertie explicitement du repère de saisie vers `local`. |
| C13 | Ombres géolocalisées (Add Location, fuseau, lever / coucher), Nord géographique (Display > True North) [CP]. | **R3**, **R5**, D-016, D-017. | Conflit partiel | La position du soleil exige une position géographique **déclarée** : la parcelle du projet si elle porte des coordonnées géographiques, sinon ombres solaires « non évaluées » (affichage d'éclairage neutre seulement). Nord : nord du quadrillage cadastral (D-017) ; « Nord géographique » non évalué tant que le modèle n'en porte pas la donnée. « Add location » de SketchUp n'est pas reproduit (la parcelle est la source). |
| C14 | Export de la géométrie libre (IFC). | **R16** (IFC testé, jamais « certifié »), annexe C, D-019. | Compatible | Lot 7 : chaque forme de premier niveau (géométrie libre racine connexe, groupe, occurrence de composant) → **`IfcBuildingElementProxy`**, corps en tessellation (`IfcPolygonalFaceSet`), GlobalId stable ; validation IfcOpenShell en CI comme le corpus existant. Correspondance détaillée (couleurs de faces, imbrication des groupes) à spécifier dans la fiche du lot 7. |
| C15 | Pot de peinture : matériau par face (recto / verso), par groupe, héritage [CM §1]. | **R3** ; état antérieur : matériaux en lecture seule, « pas de matériau peint sur une face (nouvelle donnée de modèle à spécifier) » (`etape-0-audit-ecart-plan.md` §1). | Nouvelle donnée déclarée | **Matériau d'apparence de la Planche** : nom + couleur (+ texture importée plus tard), **attribut de face** (recto, verso) et de groupe / composant, avec la règle d'héritage observée (la face sans matériau prend celui de son conteneur ; le matériau de la face l'emporte). C'est une donnée **d'apparence** : aucune propriété physique, thermique ou réglementaire n'y est attachée ni supposée ; distincte des matériaux des compositions de murs (D-026). |
| C16 | Booléens, Outliner, Solid Inspector, matériaux et styles personnalisés réservés aux offres payantes [DOC §11]. | — | Non pertinent | Les restrictions commerciales de SketchUp ne sont pas reproduites : la Planche offre tous les outils. Bannière « Upgrade », bouton « Upgrade Now » : non reproduits. |
| C17 | Services externes : 3D Warehouse, Trimble Connect, AI Assistant, AI Render, Photoreal Materials, Environments, compte et avatar SketchUp. | Périmètre (cahier Atelier §10.1-8). | Hors périmètre proposé | Non reproduits ; l'emplacement est absent (pas grisé). À confirmer par le maître d'ouvrage (§10, P-2). |
| C18 | Modificateurs Ctrl / Alt / Maj et flèches indispensables à de nombreux outils ; SketchUp lit l'**état du clavier** (keydown / keyup sur le canevas), pas `event.ctrlKey` du clic [OD note, OM §0.5, CM §0]. | Exigence mobile (cahier Atelier §5.8, `cahier-sketchup-web.md` T1.8 : utilisable au toucher, cibles ≥ 44 px). | Écart déclaré | Clavier : même lecture d'état (keydown / keyup), même nature bascule ou maintenu par outil (§4, §5.5). Toucher : **barre de modificateurs** à l'écran (Ctrl, Alt, Maj, verrouillage d'axe rouge / vert / bleu / parallèle) dont chaque bouton reproduit la nature de la touche (bascule : un appui ; maintenu : tant que le bouton est enfoncé, ou appui long verrouillé). Choix Fadi (fadi). |
| C19 | Saisie au champ Mesures **sans cliquer dedans** [OD §0]. | Accessibilité WCAG 2.2 AA (cahier Atelier §8, axe-core). | Compatible avec garde | La frappe est captée quand le focus est sur le canevas ou le champ Mesures, **jamais** quand il est dans un autre champ de saisie (inspecteur, recherche, boîte de dialogue). Le champ Mesures est un `input` étiqueté ; la barre d'état est une région `aria-live="polite"`. |
| C20 | Consignes, infobulles d'inférence et couleurs. | Accessibilité (pas d'information par la couleur seule). | Compatible | Chaque inférence a un **libellé** (infobulle relevée, traduite) en plus de sa couleur ; couleurs réglables comme dans Settings > Accessibility [MCP §7.2]. |
| C21 | Unités anglo-saxonnes (`'`, `"`) et gabarits « Feet & Inches » [MCP §7.1, DOC §6]. | Application métrique (France / Maroc). | À décider | Proposition : unité du modèle = mètre ; `mm`, `cm`, `m` acceptés ; `'` et `"` acceptés avec conversion exacte (0,3048 m, 0,0254 m, valeurs de définition) — à confirmer (§10, P-4). |
| C22 | Séparateurs du champ Mesures : virgule de liste et point décimal en anglais [OD §15.2] ; point-virgule de liste si la locale a la virgule décimale [DOC §6.1, F1 — forum, doc]. | R1 (français) ; conventions déjà livrées : `fx;fy` (D-145), `s ; z` (D-154). | À décider | Proposition : locale française — **virgule décimale, point-virgule de liste** (`4;3`, `2,5;90`), point décimal aussi admis ; grammaire paramétrée par la locale (PL-01-02). À confirmer (§10, P-3). |
| C23 | Échap : un outil de dessin revient à son étape 1 et **reste actif** ; les outils de caméra temporaires rendent l'outil précédent [OD §15.1, MCP §0]. | D-156 : en Canevas, Échap sans tracé en cours revient à l'outil précédent. | Écart avec D-156 | En mode Planche, le comportement **relevé** s'applique (Échap → étape 1, outil gardé ; caméra → outil précédent ; Sélection en édition de groupe → sortie du contexte). D-156 reste inchangé pour Plan / 3D. À confirmer (§10, P-5). |
| C24 | Rien n'est omis en silence. | `AGENTS.md` (« Do not silently omit unsupported model elements »), R7. | Compatible | Toute entité non prise en charge (import, export, commande) est nommée dans un rapport. Coordonnées stockées en double précision, sans arrondi ; l'arrondi d'affichage (0,00 m relevé) n'est qu'affichage. |
| C25 | Droits et partage SketchUp. | R13. | Compatible | Lecteur : navigation, mesure sans guide, Info entité en lecture ; aucune commande. Partage : celui de Fadi (D-156 / tranche 5). |
| C26 | Rendu 3D. | R14 (WebGL2 three.js par défaut). | Compatible | Lot 2 : three.js dans `apps/web` seulement ; aucun chiffre de performance sans mesure (`⏱`). |
| C27 | Place dans le produit. | R2 (21 étapes intouchables), MO-1. | Compatible | Mode « Planche » de l'Atelier, aux mêmes endroits que l'Atelier (module `atelier`, étapes 10 et 11 en mode immersif) ; aucune étape modifiée. |

---

## 3. Anatomie de l'écran

Relevé : [MCP §9], [OD §0], [OM §0], [CM], [CP]. La Planche s'affiche **en disposition Canevas** (D-156) : dessin
plein écran, surcouches flottantes. Correspondance avec l'existant entre crochets ; « nouveau » = à construire.

### 3.1 Barre du haut (carte blanche, à gauche) — obs [MCP §9]

| Élément relevé | Planche | Statut |
| --- | --- | --- |
| ☰ `Open Model/Preferences` (devient × ouvert) | Menu principal (§7.1) | obs ; [menu Canevas, tranche 5 de l'étape 0] |
| Nom du fichier « Untitled » | Nom du projet et de la Planche | fadi |
| ✦ SketchUp AI | Non reproduit (C17) | — |
| Annuler ↶ / Rétablir ↷, grisés sans pas ; grisé seulement visuel dans SketchUp | Boutons de l'Atelier (journal) ; **état désactivé réel** (`disabled`, `aria-disabled`) — écart d'accessibilité | obs [CM §9] ; fadi |
| Icône ⚠ orange (sauvegarde automatique en échec) | État d'enregistrement de l'Atelier (file locale, erreurs) | obs ; [existant] |
| « Saved » / « Save » (`Save all changes`) | « Enregistré » / « Enregistrer » ; jusqu'au lot 7 : « Brouillon local » (C6) | obs ; fadi |
| À droite : avatar, icône commentaire, bouton bleu **Share** | Partage Fadi (confirmation d'enregistrement préalable) ; commentaires de l'Atelier | obs ; [existant] |
| Bannière « Upgrade… Subscribe » × | Non reproduite (C16) | — |

### 3.2 Barre d'outils de gauche (verticale, flottante) — obs [OD §0, MCP §9]

Ordre relevé : Recherche (`Shift+-`) · chevron ^ (défilement) · Sélection (Espace) · Gomme (E) · Ligne (L) ·
Rectangle (R) · Pousser/tirer (P) · Déplacer (M) · Rotation (Q) · Échelle (S) · Peinture (B) · Orbite (O) ·
Panoramique (H) · Mètre (T) · séparateur · **emplacements « récents »** (dernier outil pris dans la grille) · « ⋯ »
(grille étendue) · chevron ˅. Outil actif : **liseré bleu à gauche**. Titre de bouton : « Nom (raccourci) ».

### 3.3 Grille d'outils étendue « ⋯ » — obs [OD §0, MCP §9]

Panneau flottant blanc, par sections, bouton « Edit » en bas (personnaliser), poignée ⋮ :

| Section | Outils (ordre relevé) |
| --- | --- |
| Sélection | Lasso (Shift+Espace), Prélever le matériau |
| Dessin | Cercle (C), Arc 2 points (A), Arc, Polygone, Arc 3 points, Secteur, Main levée, Rectangle tourné, Texte 3D |
| Modification | Décalage (F), Suivez-moi, Retourner, Coque extérieure, Intersection, Union, Soustraction, Découpe, Scission |
| Construction | Cotes, Rapporteur, Axes, Texte, Plan de coupe, Balise |
| Caméra | Zoom (Z), Zoom étendu (Ctrl+Maj+E), Zoom fenêtre (Maj+W), Positionner la caméra, Regarder autour, Marcher |
| IA | AI Assistant, AI Render — non reproduits (C17) |

Personnalisation (« Edit » : réordonner, ajouter à la barre principale, emplacements récents, séparateurs) : doc
[DOC §0, S45], non relevée en direct (nv) — §9.

### 3.4 Colonne des panneaux (droite) — obs [MCP §4, CP]

Ordre relevé : Info entité, Composants, Instructeur, 3D Warehouse, Matériaux, Styles, Balises, Ombres, Scènes,
Affichage, Adoucir / lisser, Info modèle. Libellé en pastille au survol (ou permanent au début). Carte d'environ
300 px, en-tête titre + icône ; recliquer l'icône ferme ; poignée `Resize panel`, bouton `»` (`Hide panels`), bouton
« Close ». Absents de l'offre gratuite : Outliner, Solid Inspector, Comments.

**Contradiction relevée** : [MCP §4] « plusieurs panneaux peuvent s'empiler » ; [CP, relevé DOM] « un panneau ouvert
remplace la colonne d'icônes (un seul à la fois observé) ». D-156 a retenu des panneaux exclusifs. Tant que le relevé
n'est pas tranché (§9, L-13), la Planche garde le comportement exclusif de D-156.

Planche : Info entité, Composants, Instructeur, Matériaux, Styles (contenu nv), Balises, Ombres, Scènes, Affichage,
Adoucir / lisser, Info modèle (§6) ; **Outliner** = Navigateur de l'Atelier (arbre des contextes de la Planche,
lot 5) ; 3D Warehouse non reproduit (C17).

### 3.5 Barre du bas — obs [MCP §9, OD §0]

À gauche : Aide `?` (« Need Help? » : centre d'aide, forums, recherche — Planche : aide de Fadi et recherche d'outils),
globe (langue : « Français », C1), Périphérique d'entrée (souris → fenêtre « Choose your input device » : tuiles
Souris / Trackpad, lien « More settings » [MCP §3] — existant D-157), puis **barre d'état** (consigne de l'outil,
segments séparés par « | »). À droite : **libellé du champ Mesures + champ** (`#measurements-box-label`,
`#measurements-box`), logo (non reproduit).

### 3.6 Surcouches du dessin — obs

Axes rouge (X), vert (Y), bleu (Z), **pleins côté positif, pointillés côté négatif** [OD §0] ; personnage d'échelle
« Ty » (composant présent dans un modèle neuf, avec ses matériaux `Ty_*` [CM §1]) — **non reproduit** (donnée de
modèle étrangère, R3 ; aucun matériau `Ty_*` créé d'office) ; infobulles d'inférence (cartouche blanc, bordure grise,
texte noir, à droite et sous le curseur) ; curseur propre à chaque outil et à chaque mode (images SVG relevées par nom,
ex. `tape_measure_guides_c.svg` [MCP §0]) — dessins propres à Fadi (fadi).

### 3.7 Menu contextuel (clic droit) — obs [OM §10, CM §2–3, §8, MCP §1.6]

Barre d'icônes en tête : Couper, Copier, Coller, Coller sur place, Supprimer (icônes sans `title` dans SketchUp :
Planche les étiquette, accessibilité). Contenu selon la cible : §5.8.

---
## 4. Spécification outil par outil

**Lecture.** Chaque outil donne : nom français / anglais (référence), raccourci, accès, lot de livraison (§8), statut et
renvoi ; les **étapes** (consigne de barre d'état traduite, texte relevé, libellé et valeur du champ Mesures, saisies) ;
les **modificateurs** avec leur nature — **bascule** (un appui change le mode, un autre le rétablit ou passe au
suivant) ou **maintenu** (actif tant que la touche est enfoncée) ; les **inférences** ; la **fin** et **Échap** ; des
**critères d'acceptation** numérotés `CA-<OUTIL>-n`, vérifiables par un test unitaire (machine d'états pure) ou par la
recette Playwright du lot. Les conventions communes (§5) ne sont pas répétées.

Valeurs du champ Mesures : affichées en français (`1,93 m`) ; « ~ » préfixe une valeur approchée (non accrochée) ;
après validation le champ garde **le texte tapé** [OM §0.2]. Les saisies suivent la grammaire §5.3 (séparateurs
proposés : virgule décimale, point-virgule de liste — décision P-3).

### 4.1 Sélection — *Select* · `Espace` · lot 2 · obs [OD §1, OM §0.7, CM §3.2]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| Repos | « Cliquez ou faites glisser pour sélectionner des objets. Maj = Ajouter / Retirer. Ctrl = Ajouter. Maj + Ctrl = Retirer. » (`Click or drag to select objects. Shift = Add/Subtract. Ctrl = Add. Shift + Ctrl = Subtract.`) | Mesures · vide |

- **Clic** : remplace la sélection par l'entité visée (face seule — trame de points bleus, arêtes non prises ; arête ;
  **courbe entière** pour un arc, un cercle, un polygone ; groupe ou composant entier) ; clic dans le vide : tout
  désélectionner. obs.
- **Double-clic** sur une face : face + arêtes bordantes. obs. Sur une arête : arête + faces qui la partagent. instr.
  Sur un groupe ou un composant : **entrer dans son contexte d'édition** (§5.6). obs [CM §3.2].
- **Triple-clic** : tout le connecté. obs.
- **Rectangle de gauche à droite (fenêtre)** : seulement ce qui est **entièrement** contenu ; **de droite à gauche
  (croisée)** : tout ce qui est touché. obs. Aspect du rectangle (plein / pointillé) : doc, nv.
- Aucune pré-surbrillance au survol. obs.

| Modificateur | Effet | Nature | Statut |
| --- | --- | --- | --- |
| Maj | Basculer (ajoute si absent, retire si présent) | maintenu | obs |
| Ctrl | Ajouter seulement (un second Ctrl + clic laisse sélectionné) | maintenu | obs |
| Maj + Ctrl | Retirer seulement | maintenu | obs |
| Ctrl+A / Ctrl+T | Tout sélectionner / tout désélectionner | raccourci | instr / doc |

- Fin / Échap : Échap vide la sélection ; **en contexte d'édition, Échap sort du contexte** (obs [CM §3.2]) ; un clic
  dans le vide hors du groupe sort aussi (obs indirect).
- CA-SEL-1 : clic sur une face → la sélection contient cette face et aucune arête. CA-SEL-2 : double-clic → la face et
  ses n arêtes bordantes. CA-SEL-3 : triple-clic sur une boîte libre → 6 faces et 12 arêtes. CA-SEL-4 : clic sur un
  segment d'un polygone à 6 côtés → les 6 arêtes de la courbe. CA-SEL-5 : fenêtre gauche → droite qui coupe une face →
  la face n'est pas prise ; croisée droite → gauche → elle l'est. CA-SEL-6 : Maj + clic deux fois sur la même arête →
  absente ; Ctrl + clic deux fois → présente ; Maj + Ctrl + clic → absente. CA-SEL-7 : la sélection ne change pas la
  révision (R10).

### 4.2 Lasso — *Lasso* · `Maj+Espace` · grille · lot 2 · obs [OD §2]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez, ou cliquez et faites glisser, pour tracer le contour de sélection. \| Maj = Ajouter / Retirer. \| Ctrl = Ajouter. \| Maj + Ctrl = Retirer. » (`Click or click and drag to draw selection bounds. \| …`) | Mesures · vide |
| 2 (après le 1er clic) | « Double-cliquez pour fermer le contour de sélection. » (`Double click to close selection bounds.`) | — |

- **Polygonal** : clics successifs = sommets ; **double-clic ferme** et applique. Trait gris fin, **petit carré rouge**
  au point de départ (cible de fermeture). obs. Contour libre par cliquer-glisser : instr.
- **Sens horaire à l'écran = fenêtre** (entièrement inclus) ; **anti-horaire = croisée** (touché). obs.
  **Contradiction** : [DOC §1.2] dit l'inverse ; le relevé fait foi. Inversion du sens dans les préférences : instr.
- Clic simple sur un objet : comme Sélection. obs.
- Modificateurs : comme Sélection (barre d'état relevée : Ctrl = Ajouter) ; [DOC §1.2] donne Alt = ajouter : écarté,
  le texte relevé fait foi.
- CA-LAS-1 : contour horaire autour d'un cercle entier → la courbe sélectionnée ; contour anti-horaire qui ne traverse
  qu'un segment → la courbe entière, un segment séparé non touché non pris. CA-LAS-2 : Échap avant fermeture → aucun
  changement de sélection.

### 4.3 Gomme — *Eraser* · `E` · lot 2 · obs [OD §3, CM §4]

| État | Consigne | Mesures |
| --- | --- | --- |
| Repos | « Cliquez ou faites glisser pour effacer des éléments. \| Ctrl = Adoucir / lisser. \| Alt = Annuler le lissage / réafficher. \| Maj = Masquer. » (`Click or drag to erase items. \| Ctrl = Toggle Soften/Smooth. \| Alt = Toggle Unsmooth/Unhide. \| Shift = Toggle Hide.`) | Mesures · vide |
| Ctrl enfoncé | « Cliquez ou faites glisser pour adoucir / lisser des arêtes. \| … » | — |
| Maj enfoncé | « Cliquez ou faites glisser pour masquer des éléments. \| … » | — |
| Alt enfoncé | « Cliquez ou faites glisser pour annuler le lissage / réafficher des éléments. \| … » | — |

- **Clic sur une arête** : l'arête est effacée **avec toute face qui en dépend**. obs. **Clic sur un segment d'une
  courbe** (polygone, arc) : **toute la courbe** et ses faces dépendantes. obs. Clic dans le vide : rien.
- **Glisser** : les entités survolées sont marquées puis effacées **au relâchement**. obs (surbrillance pendant le
  glisser : nv).
- La gomme n'efface pas une face directement (une face disparaît avec ses arêtes) : doc [S23] ; effacer une face seule
  = menu contextuel « Effacer ».
- Effacer une arête entre deux faces coplanaires les fusionne : doc, nv (§9).

| Modificateur | Effet | Nature | Statut |
| --- | --- | --- | --- |
| Ctrl | Adoucir l'arête (invisible, non effacée ; pointillés bleus en sélection ; nombre d'entités inchangé) | **maintenu** (malgré « Toggle ») | obs [CM §4, §0] |
| Maj | Masquer l'élément | maintenu | obs |
| Alt | Réafficher / annuler le lissage (clic au même endroit sur l'élément invisible) | maintenu | obs |
| Ctrl + Maj | Retirer de la liste en cours de gommage | — | instr, nv |

- Masquer et réafficher sont **chacun un pas d'annulation**. obs [CM §9].
- CA-GOM-1 : effacer une arête d'un rectangle à face → 3 arêtes, 0 face. CA-GOM-2 : un clic sur un côté d'un polygone
  à face → 0 arête, 0 face. CA-GOM-3 : Ctrl + clic sur l'arête entre deux faces → l'arête porte `adoucie`, le nombre
  d'entités ne change pas, les deux faces restent distinctes. CA-GOM-4 : Maj + clic puis Alt + clic au même endroit →
  masquée puis visible ; deux pas d'annulation. CA-GOM-5 : glisser sur 3 arêtes → rien n'est effacé avant le
  relâchement ; 3 effacées en **un** pas.

### 4.4 Ligne — *Line* · `L` · lot 2 · obs [OD §4, CM §7]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez pour placer la première extrémité. \| Flèches = Verrouiller la direction d'inférence. » (`Click to set first endpoint. \| Arrow Keys = Toggle Lock Inference Direction.`) | Longueur · vide |
| 2 | « Cliquez pour placer la seconde extrémité ou saisissez la longueur. \| Alt = Inférences linéaires (toutes actives). \| Flèches = … » (`Click to set second endpoint or enter length. \| Alt = Toggle Linear Inferences (All On). \| …`) | Longueur · `2,64 m` ; `~ 8,25 m` si verrouillé |

- Clic 1, segment élastique, clic 2 = segment créé ; **enchaînement** : le point 2 est le départ du suivant. obs.
- **Saisie** : `3` ou `3m` puis Entrée → segment de 3 m exactement dans la direction du curseur, chaîne continuée.
  obs. Coordonnées absolues `[x;y;z]` et relatives `<dx;dy;dz>` : doc [S7], **non confirmé** (§9, L-3).
- **Fermeture** : clic sur le point de départ (« Extrémité ») → **face créée** si la boucle est plane, **chaîne
  terminée**, retour à l'étape 1. obs. La chaîne s'arrête aussi quand la ligne aboutit sur une arête et ferme une face.
  obs.
- Une ligne d'un milieu d'arête à l'autre **à travers une face la coupe en deux faces**. obs.
- Segment élastique **noir et fin** hors inférence d'axe ; couleur de l'axe sur un axe. obs.

| Modificateur | Effet | Nature | Statut |
| --- | --- | --- | --- |
| → / ← / ↑ | Verrouiller la direction sur rouge / vert / bleu (une 2ᵉ pression sur la même flèche déverrouille) | bascule | obs |
| ↓ | Verrouiller parallèle / perpendiculaire à la **dernière arête survolée** (magenta) ; sans arête de référence : longueur bloquée à 0,00 m | bascule | obs |
| Maj | Verrouiller l'inférence courante (segment épais coloré, carré rouge au point projeté, pointillés vers le curseur, Mesures en `~`) ; le segment « Alt = … » disparaît pendant le verrouillage | maintenu | obs [CM §7] |
| Alt | Cycle des inférences linéaires : toutes actives → toutes inactives → parallèle / perpendiculaire seulement → toutes actives ; **appliqué au relâchement** | bascule (cycle, keyup) | obs [CM §7] |

- Inférences (§5.1) : Origine, Extrémité, Milieu, Sur arête, Sur face, Sur axe rouge / vert / bleu, Depuis un point,
  Contraint sur une ligne. obs.
- Échap : annule le segment en cours, vide Mesures, outil gardé. obs.
- CA-LIG-1 : clic (0;0;0), curseur vers +x, `3` Entrée → arête (0;0;0)–(3;0;0) exacte, l'étape 2 continue depuis
  (3;0;0). CA-LIG-2 : quatre segments fermant un carré plan → 4 arêtes, **1 face**, retour à l'étape 1. CA-LIG-3 :
  ligne d'un milieu à l'autre d'une face rectangulaire → 2 faces. CA-LIG-4 : → puis curseur hors axe → point projeté
  sur l'axe rouge, Mesures préfixé `~` ; seconde pression sur → → déverrouillé. CA-LIG-5 : trois relâchements d'Alt →
  retour à « toutes actives » ; en « toutes inactives » aucune inférence d'axe. CA-LIG-6 : Échap à l'étape 2 → aucune
  entité créée.

### 4.5 Main levée — *Freehand* · sans raccourci · grille · lot 2 · obs [OD §13]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez et faites glisser pour tracer une courbe à main levée. \| Flèches = Verrouiller le plan de dessin. » (`Click and drag to draw a freehand curve. \| Arrow Keys = Toggle Lock Drawing Plane.`) | Mesures · vide |
| Juste après un tracé | ajout de « Ctrl − / Ctrl + = Diminuer / augmenter les segments. » | — |

- Appuyer, glisser, relâcher → **courbe** (une entité : suite d'arêtes) le long du trajet ; outil gardé. obs.
- Ctrl − / Ctrl + sur la **dernière** courbe juste après sa création : instr / doc, effet nv. Boucle fermée → face :
  doc [S12], nv. Longueur modifiable seulement si la courbe ne borde pas de face : doc.
- Échantillonnage du trajet (distance minimale entre points) : non relevé — choix Fadi déclaré (fiche du lot 2).
- CA-MLV-1 : glisser de A à B → une courbe d'au moins 2 arêtes, sélectionnée en entier par un clic. CA-MLV-2 : flèche
  ↑ avant le tracé → tous les points dans un plan vertical.

### 4.6 Rectangle — *Rectangle* · `R` · lot 2 · obs [OD §5, OM §12]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez pour placer le premier coin. \| Ctrl = Choisir le centre. \| Flèches = Verrouiller le plan de dessin. » (`Click to set first corner. \| Ctrl = Toggle Select Center. \| Arrow Keys = Toggle Lock Drawing Plane.`) ; en mode centre : « Cliquez pour placer le centre. » | Dimensions · vide |
| 2 | « Cliquez pour placer le coin opposé ou saisissez longueur ; largeur. \| Ctrl = Dessiner depuis le centre. \| … » (`Click to set opposite corner or enter length, width. \| Ctrl = Toggle Draw From Center. \| …`) ; mode centre : « Cliquez pour placer un coin ou saisissez longueur ; largeur. » | Dimensions · `1,93 m ; 0,59 m` (ou `~ …`) |

- Deux clics → rectangle et **face créée** ; aperçu **bleu** sur le sol, curseur à icône de rectangle bleu à plat ;
  outil gardé. obs.
- Saisie `4;3` (relevé : `4m,3m`) → 4 × 3 m, **sens donné par le quadrant du curseur** (1ʳᵉ valeur sur rouge, 2ᵉ sur
  vert) ; Mesures garde le texte tapé. obs. Ordre selon le plan (R puis V, R puis B, V puis B) : instr. Valeurs
  négatives, longueur seule `3;`, largeur seule `;3` : doc [S10], nv.

| Modificateur | Effet | Nature | Statut |
| --- | --- | --- | --- |
| Ctrl | Depuis le centre : diagonale pointillée centre → coin, Mesures = dimensions **totales** ; reste actif pour les rectangles suivants | bascule | obs |
| → / ← / ↑ (avant le 1ᵉʳ clic) | Plan verrouillé perpendiculaire à l'axe (→ : plan vert-bleu, curseur rouge vertical, arêtes rouges épaisses, « Contraint sur un plan ») | bascule | obs (→) ; ←, ↑, ↓ : instr |
| Maj | Verrouiller le plan inféré courant | maintenu | instr |

- Inférences : « Parallèle à l'arête », **« Carré »** (diagonale pointillée). obs. « Section dorée » : doc, nv.
- Échap : annule. obs. Modification des dimensions après coup tant qu'aucun autre outil n'est choisi : observé pour la
  saisie qui suit la création (le VCB garde `4m,3m`) ; [DOC §2.3] : pas après changement d'outil.
- CA-REC-1 : clic (0;0;0), curseur dans le quadrant (+x;+y), `4;3` → sommets (0;0;0), (4;0;0), (4;3;0), (0;3;0), une
  face. CA-REC-2 : même saisie curseur en (−x;+y) → x ∈ [−4;0]. CA-REC-3 : Ctrl puis clic en (0;0;0) et `2;2` → carré
  centré, côtés 2 m ; le mode centre persiste au rectangle suivant. CA-REC-4 : → avant le 1ᵉʳ clic → rectangle dans un
  plan x = constante.

### 4.7 Rectangle tourné — *Rotated Rectangle* · sans raccourci · grille · lot 2 · obs [OD §6]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Choisissez le premier coin. » (`Select first corner.`) — curseur rapporteur bleu, infobulle « Plan libre » (`Unlocked plane`) | — |
| 2 | « Choisissez le deuxième coin ou saisissez une valeur. Alt = verrouiller le plan du rapporteur. » (`Select second corner or enter value. Alt = lock protractor plane.`) | Longueur ; angle · `1,27 m ; 0,0` |
| 3 | « Choisissez le troisième coin ou saisissez une ou deux valeurs. Alt = définir la ligne de base du rapporteur. » (`Select third corner or enter value(s). Alt = set protractor baseline.`) | Largeur ; angle · `~ 4,94 m ; 0,0` |
| Après | — | Dimensions · `3,00 m ; 2,00 m` |

- Trois clics : coin 1 ; coin 2 (direction et longueur du 1ᵉʳ côté, rapporteur autour du point 1) ; coin 3 (largeur,
  angle du 2ᵉ côté) ; **face créée**. Saisie `3` (longueur seule acceptée) puis `2;90` → 3 × 2 m posé au sol. obs.
- Infobulle combinée à l'étape 3 : « Sur la ligne — Longueur : 3,00 m Largeur : … ». obs. Rapporteur : cercle gradué
  bleu au sol, noir vertical. obs.
- Modificateurs : Alt après le 1ᵉʳ clic = verrouiller le plan du 1ᵉʳ côté ; Alt après le 2ᵉ = ligne de base du
  rapporteur (textes obs, effet nv) ; Maj = verrouiller l'inférence ; flèches avant le 1ᵉʳ clic = axe du rapporteur,
  après = direction (instr). Cliquer-glisser le 1ᵉʳ point pour choisir le plan : instr.
- CA-RTO-1 : clic (0;0;0), direction +x, `3`, puis `2;90` → rectangle (0;0;0)–(3;0;0)–(3;2;0)–(0;2;0), une face.

### 4.8 Cercle — *Circle* · `C` · grille · lot 2 · obs [OD §7]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Choisissez le centre. Ctrl « + » ou Ctrl « − » pour changer le nombre de segments. » (`Select center point. Use Ctrl '+' or Ctrl '-' to change the number of segments.`) | Côtés · `24` (défaut relevé) |
| 2 | « Choisissez un point du bord. Ctrl « + » ou Ctrl « − » … » (`Select point on edge. …`) | Rayon · `1,29 m` |

- Deux clics : centre, point du bord ; **le 1ᵉʳ sommet du polygone est dans la direction du curseur** ; rayon tracé en
  noir ; aperçu bleu au sol ; **face créée**. obs.
- Côtés : `12` Entrée **avant** le 1ᵉʳ clic ; `8s` Entrée **après** la création (reconstruit le dernier cercle) ;
  Ctrl + / Ctrl − **pendant** le tracé (±1, infobulle « 3 côtés ») ; **bornes 3 à 999**, sinon alerte modale « Le
  nombre de segments d'une courbe doit être compris entre 3 et 999 » (`Curve segments must be in the range from 3 to
  999`) [OK] ; **mémorisé** pour le cercle suivant. obs.
- Rayon : `1` Entrée après la création redimensionne le dernier cercle. obs.
- Flèche ← avant le 1ᵉʳ clic : normale verrouillée sur l'axe vert (cercle vertical, curseur et aperçu verts). obs ; →,
  ↑, ↓ : instr. Maj : verrouiller l'inférence (instr). Flèches après le clic : direction (instr).
- La courbe reste « lisse » après Pousser / tirer (arêtes adoucies) : doc [S10], nv.
- Échap : annule ; avec une alerte ouverte, le 1ᵉʳ Échap ferme l'alerte. obs.
- CA-CER-1 : clic (0;0;0), curseur vers (+x), `1` → 24 sommets à 1 m du centre, le 1ᵉʳ en (1;0;0), une face. CA-CER-2 :
  `8s` après création → la même courbe a 8 sommets, rayon inchangé, **un** pas d'annulation pour la correction.
  CA-CER-3 : `1000` → alerte, état inchangé. CA-CER-4 : six Ctrl − depuis 10 → 4. CA-CER-5 : le cercle suivant part de
  la dernière valeur de côtés.

### 4.9 Polygone — *Polygon* · sans raccourci · grille · lot 2 · obs [OD §8]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Choisissez le centre. Ctrl « + » ou Ctrl « − » … » | Côtés · `6` (défaut relevé) |
| 2 | « Choisissez un point du bord. Ctrl = circonscrit. … » puis, après Ctrl, « … Ctrl = inscrit. … » | Rayon inscrit (défaut) / Rayon circonscrit |

- Deux clics, **face créée** ; `1` Entrée fixe le rayon. obs.
- **Rayon inscrit** (défaut) : rayon jusqu'à un **sommet** (cercle pointillé passant par les sommets). **Ctrl
  (bascule)** → **rayon circonscrit** : rayon jusqu'au **milieu d'un côté** (cercle pointillé tangent aux côtés). obs.
- Le polygone est **une seule courbe** (gomme sur un côté : tout le polygone et sa face). obs.
- Côtés : mêmes saisies et bornes que le cercle (`Ns` : doc ; Ctrl ± : instr).
- CA-POL-1 : 6 côtés, rayon inscrit 1 → sommets à 1 m du centre. CA-POL-2 : Ctrl puis rayon 1 → apothème 1 m (sommets à
  1/cos(30°) m). CA-POL-3 : gomme sur un côté → 0 entité restante.

### 4.10 Arc (par le centre) — *Arc* · sans raccourci · grille · lot 2 · obs [OD §9]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Choisissez le centre. Ctrl « + » ou « − » … » — curseur rapporteur bleu, « Plan libre » | Côtés · `12` |
| 2 | « Choisissez le premier point de l'arc ou saisissez le rayon. … » (`Select first arc point or enter radius.`) | Longueur · `0,78 m` |
| 3 | « Choisissez le second point de l'arc ou saisissez l'angle. … » (`Select second arc point or enter angle.`) | Angle · `95,6` (degrés) |

- Trois clics (centre, départ, fin) ; `1` puis `90` → arc de 90° de rayon 1 m. Rayon de départ en pointillé de la
  couleur de l'axe s'il est sur un axe ; point vert à l'extrémité. **Courbe seule, sans face ni rayons.** obs.
- Cliquer-glisser le 1ᵉʳ point pour choisir le plan ; flèches avant le clic = axe du rapporteur ; pas angulaire réglé
  dans Info modèle : instr. Segments après coup `10s` : doc.
- CA-ARC-1 : centre (0;0;0), départ sur +x, `1`, `90` → courbe de 12 arêtes de (1;0;0) à (0;1;0), aucune face.

### 4.11 Arc 2 points — *2 Point Arc* · `A` · grille · lot 2 · obs [OD §10, CM §8]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez pour placer le point de départ. \| Ctrl « + » ou « − » … \| Alt = Verrouiller la tangence. \| Flèches = … » (`Click to set start point. \| …`) | Côtés · `12` (puis garde la dernière flèche, ex. `Flèche · 1,66 m`) |
| 2 | « Cliquez pour placer le point d'arrivée ou saisissez la longueur. \| … » (+ « Alt = Verrouiller la tangence » depuis une extrémité existante) | Longueur (corde) |
| 3 | « Cliquez pour placer la flèche ou saisissez la distance. \| … » (`Click to set bulge or enter distance.`) | Flèche · `~ 0,86 m` |

- Trois clics (départ, fin, flèche) ; `2` puis `0,5` ; segment vert perpendiculaire à la corde à l'étape 3. obs.
  `6s` après création → 6 segments (« 6 côtés dans l'arc »). obs. Rayon `24r` : doc, nv.
- **Arc tangent** depuis l'extrémité d'un arc : aperçu **cyan**, « Tangent au sommet » ; si le curseur s'éloigne de la
  solution tangente, retour au mode à 3 clics. obs. Au survol de l'extrémité : point vert et pointillés vers le
  centre (point bleu). obs.
- **Double-clic au point final** : crée directement l'arc tangent, sans étape de flèche, puis étape 1 (pas
  d'enchaînement). obs [CM §8].
- **Alt (bascule « Verrouiller la tangence »)** : 2 clics suffisent et l'outil **enchaîne** des arcs tangents depuis la
  dernière extrémité ; Échap termine la chaîne. obs [OD §10].
- Inférence « Demi-cercle » (flèche = demi-corde) : doc, nv. Double-clic sur un coin = congé avec les mêmes paramètres :
  doc, nv.
- CA-A2P-1 : (0;0;0) → (2;0;0), flèche 0,5 → courbe dont le milieu est à 0,5 m de la corde. CA-A2P-2 : double-clic au
  point final depuis l'extrémité d'un arc → nouvel arc tangent (tangentes égales à 1e-9 près), retour à l'étape 1.
  CA-A2P-3 : Alt puis deux points → arc tangent, l'outil reste à l'étape 2 depuis la nouvelle extrémité.

### 4.12 Arc 3 points — *3 Point Arc* · sans raccourci · grille · lot 2 · obs [OD §11]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez pour placer le point de départ. \| … » | Côtés · `12` |
| 2 | « Cliquez pour placer le deuxième point ou saisissez la longueur. \| … » | Longueur · `1,55 m` |
| 3 | « Cliquez pour placer le point d'arrivée ou saisissez l'angle. \| … » | Angle · `~ 232,4` |

- L'arc **passe toujours** par le 2ᵉ point ; fin par clic ou angle balayé (`120`). Courbe sans face. obs.
- Alt = verrouiller la tangence ; Maj et flèches comme les autres arcs : instr.
- CA-A3P-1 : (1;0;0), (0;1;0), (−1;0;0) → courbe sur le cercle unité centré en (0;0;0).

### 4.13 Secteur — *Pie* · sans raccourci · grille · lot 2 · obs [OD §12]

- Étapes, consignes et Mesures identiques à Arc (§4.10) ; côtés 12 par défaut. obs.
- Résultat : **secteur fermé (arc + 2 rayons) avec face**. Rapporteur bleu au centre à l'étape 3. obs.
- CA-SEC-1 : centre (0;0;0), `2`, `45` → 12 arêtes d'arc + 2 rayons, une face dont l'aire est celle du secteur
  discrétisé, ½ · r² · n · sin(θ / n) avec r = 2, n = 12, θ = 45° (vérifiable à la main).

### 4.14 Texte 3D — *3D Text* · sans raccourci · grille · lot 2 (ou 5, décision P-7) · obs [OD §14]

- Boîte « Créer un texte 3D » (`CREATE 3D TEXT`, croix de fermeture) : zone multiligne « Saisissez le texte 3D »
  (redimensionnable, rendue dans la police) ; **Police** (liste personnalisée, 16 polices relevées, défaut Architects
  Daughter) ; **Style** (Regular seul pour la police par défaut) ; **Hauteur** `~ 0,30 m` ; case **Texte plein**
  (cochée) ; case **Extrusion** (cochée) + valeur `~ 0,15 m` ; décocher « plein » ne grise pas l'extrusion ;
  **Annuler** / **OK** (OK grisé tant que le texte est vide) ; Échap ferme (annule). obs. Alignement (gauche / centre /
  droite) : doc, non relevé.
- Après OK : « Placez le texte 3D. » (`Place 3D text 3D Text.`) ; le texte (un **composant**) suit le curseur selon les
  inférences ; un clic le pose (couché au sol). **Juste après, il est sélectionné et l'outil passe à Déplacer**
  (Mesures « Distance »). obs.
- Polices : licence (OFL pour la plupart des polices Google) hors de la liste admise (MIT, Apache-2.0, BSD, MPL-2.0) →
  décision P-7 ; aucune police n'est intégrée avant cette décision.
- CA-T3D-1 : OK désactivé avec texte vide. CA-T3D-2 : « Fadi », hauteur 0,30, extrusion 0,15 → un composant dont
  l'emprise verticale est 0,15 m, posé au clic ; outil actif = Déplacer, composant sélectionné.

### 4.15 Pousser / tirer — *Push/Pull* · `P` · lot 3 · obs [OM §1]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez sur la face à pousser ou à tirer. \| Ctrl = Créer une nouvelle face de départ. \| Alt = Mode étirement. » (`Click to select the face that you want to push or pull. \| Ctrl = Toggle Create New Starting Face. \| Alt = Toggle Stretch Mode.`) | Distance · `0,00 m` |
| 2 (après le clic, sans glisser) | « Cliquez pour placer la face ou saisissez la distance. \| … » (`Click to set face or enter distance. \| …`) | Distance · valeur en direct (`2,26 m`) |

- La face suit le curseur **selon sa normale** ; 2ᵉ clic ou distance + Entrée ; un clic puis `2,7` Entrée
  **redimensionne l'extrusion qui vient d'être faite**. obs.
- **Signe** : positif = sens de la normale (tirer), négatif = sens inverse (pousser) ; Mesures affiche ensuite la valeur
  absolue. obs.
- **Percement** : pousser jusqu'à une face opposée **parallèle** atteinte exactement → trou traversant (la face opposée
  est percée). obs. Lignes de division sur la face opposée à effacer d'abord : doc.
- **Double-clic** sur une autre face = répéter la dernière distance ; Mesures revient à `0,00 m`. obs.
- Inférence pendant le tirage : « Extrémité » sur un sommet existant (la distance prend sa hauteur). obs. Alignement sur
  une autre face survolée : doc.
- Après : outil gardé à l'étape 1 ; la face extrudée reste sélectionnée et un clic n'importe où la reprend (instr).

| Modificateur | Effet | Nature | Statut |
| --- | --- | --- | --- |
| Ctrl | Nouvelle face de départ : une arête intermédiaire reste à l'ancien niveau sur les faces latérales | bascule | obs |
| Alt | Mode étirement (étire les faces voisines au lieu d'en créer) ; message « Adjacent face has holes » possible | bascule | texte obs ; effet nv (identique sur une boîte orthogonale) |

- Échap pendant le tirage : face remise en place, étape 1, sélection vidée. obs.
- CA-PPT-1 : rectangle 4 × 3 au sol, `2,7` → boîte fermée de 6 faces, 12 arêtes, volume 32,4 m³. CA-PPT-2 : `-3` sur une
  face de normale +y → déplacement de 3 m vers −y. CA-PPT-3 : rectangle 1 × 1 dessiné sur la face avant d'une boîte de
  3 m de profondeur, `-3` → trou traversant (la face arrière porte un trou ; genre du solide = 1). CA-PPT-4 : Ctrl puis
  `1` sur le dessus → une arête horizontale par face latérale à l'ancienne hauteur. CA-PPT-5 : double-clic sur une face
  latérale après un tirage de 0,5 → tirage de 0,5 de cette face. CA-PPT-6 : tirage puis `2,7` → une seule opération
  dans l'historique (un pas d'annulation).

### 4.16 Déplacer — *Move* · `M` · lot 3 · obs [OM §2]

| État | Consigne | Mesures |
| --- | --- | --- |
| Rien de sélectionné | « Cliquez sur un élément pour commencer à le déplacer. \| Ctrl = Copier / Tampon / Déplacer. \| Alt = Pliage automatique. \| Flèches = Verrouiller la direction d'inférence. » (`Click something to begin moving it. \| Ctrl = Cycle Copy/Stamp/Move. \| Alt = Toggle Autofold. \| Arrow Keys = …`) | Distance |
| Sélection préalable | « Cliquez pour commencer à déplacer les éléments présélectionnés. \| … » | Distance |
| Pendant le déplacement | « Cliquez pour placer les éléments déplacés ou saisissez une distance. \| Ctrl = Copier. \| … » | Distance (direct) |
| Pendant une copie | « Cliquez pour placer les éléments copiés ou saisissez une distance. \| Ctrl = Déplacer. \| … » | Distance |
| Copie armée avant le clic | « Cliquez pour commencer à copier les éléments présélectionnés. \| … » | Distance |
| Tampon | « Cliquez pour faire plusieurs copies. \| … » (`Ctrl = Déplacer.` pendant la pose) | Distance |
| Déplacement d'un sommet | « Cliquez pour placer les éléments déplacés ou saisissez une distance. \| Alt = … \| Flèches = … » (**pas de Ctrl** : un sommet ne se copie pas) | Distance |

- **Clic-clic, pas de glisser** : point de base (accroché de préférence), la sélection suit, clic de destination ou
  distance + Entrée. obs. `[x;y;z]` / `<dx;dy;dz>` : doc, nv.
- **Verrouillage d'axe** pendant le déplacement : → rouge, ↑ bleu (obs), ← vert, ↓ parallèle (instr) ; mouvement =
  projection du curseur ; une distance tapée s'applique dans la direction de la projection. obs.
- **Ctrl = cycle Copier → Tampon → Déplacer** (3 appuis = retour) ; un appui pendant le déplacement bascule en copie.
  obs.
- **Réseau linéaire** après une copie : `x3` ou `3x` → 3 copies au même pas (4 objets avec l'original) ; `/3` → 3
  intervalles entre l'original et la copie (4 objets, la dernière copie à sa place) ; retaper une distance (`2`) juste
  après **ré-espace tout le réseau** ; après le réseau, sélection vidée, retour à l'état « rien de sélectionné ». obs.
  `*3`, `3/` : doc, nv.
- **Tampon** : chaque clic pose une copie, un fantôme reste au curseur ; Échap retire le fantôme ; la dernière copie
  reste sélectionnée ; **chaque copie = un pas d'annulation**. obs.
- **Arête ou sommet sans sélection = étirement** : survol d'une arête (« Milieu ») puis clic, ↑ et `1` → l'arête monte
  de 1 m, faces voisines déformées (le dessus devient incliné, les côtés des trapèzes) ; un sommet monté de 0,8 m :
  faces adjacentes déformées, une face restée plane reste une face. obs. Les faces devant rester planes, des plis sont
  ajoutés (pliage automatique) ou l'opération est bloquée : doc [S15] ; Alt force le pliage : instr, nv.
- Les géométries libres qui se touchent après un déplacement **fusionnent** (collage, §5.4). obs.
- Après un déplacement simple : sélection gardée, état « présélection », Mesures garde `5m`. obs.
- Poignées de rotation sur la boîte d'un objet (réglage « Show Move tool rotation grips », activé par défaut [MCP §7.1]) ;
  Alt fait défiler les poignées : instr, nv.
- CA-DEP-1 : boîte sélectionnée, base (0;0;0), → , `5` → translation (5;0;0) exacte. CA-DEP-2 : Ctrl, copie de 5 sur
  rouge, `x3` → 4 boîtes aux abscisses 0, 5, 10, 15 ; puis `2` → 0, 2, 4, 6 ; **un seul** pas d'annulation pour copie +
  réseau + ré-espacement. CA-DEP-3 : copie à 15 puis `/3` → 0, 5, 10, 15. CA-DEP-4 : trois Ctrl → retour à
  « Déplacer » (texte de barre d'état). CA-DEP-5 : Tampon, 3 clics → 3 copies, 3 pas d'annulation. CA-DEP-6 : arête du
  haut d'une boîte montée de 1 → 2 faces latérales trapézoïdales, dessus plan incliné ; toutes les faces restent planes
  (contrôle de planarité à 1e-9 près).

### 4.17 Rotation — *Rotate* · `Q` · lot 3 · obs [OM §3]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | Sans sélection : « Cliquez sur un élément pour le sélectionner et placer le centre de rotation. \| Ctrl = Copie. \| Flèches = Verrouiller le plan de rotation. » ; avec sélection : « Cliquez pour placer le centre de rotation. \| … » | Angle |
| 2 | « Déplacez le curseur jusqu'au point de départ de la rotation et cliquez pour commencer à tourner. \| Ctrl = Copie. » (variante copie : « … pour commencer à tourner une copie. ») | Angle |
| 3 | « Cliquez pour fixer la rotation ou saisissez l'angle. \| Ctrl = Copie. » (copie : « Cliquez pour placer la copie tournée ou saisissez l'angle. ») | Angle · `~ 26,6`, `90,0` (accroché, sans ~) |
| Après | Retour à l'étape 1, sélection gardée | `30,0` |

- **Rapporteur** : cercle gradué qui suit le curseur ; **couleur = plan** (bleu : horizontal ; vert : face de normale
  verte) ; « Plan libre » au sol ; s'aligne sur une face survolée. obs. Graduations de 15°, accrochage fin loin du
  centre : doc.
- Verrouillage du plan : ← avant le 1ᵉʳ clic → rapporteur vert partout (obs) ; →, ↑, ↓ : instr. Après le 1ᵉʳ clic, les
  flèches verrouillent la direction d'inférence (instr). Maj : verrouiller l'inférence du rapporteur (instr).
- Point de départ : inférences sur axe ; pendant la rotation, accrochage aux axes (angle affiché sans ~). obs.
- **Saisie** : `30` → 30° ; **pente** `1:2` → atan(1/2) = 26,57° ; sens = côté du curseur. obs. Négatif = sens
  antihoraire : doc.
- **Réseau polaire** : centre à l'origine, Ctrl, départ sur rouge, `60` puis `x5` → 6 objets à 60° ; dernière copie
  sélectionnée ; **un seul** pas d'annulation. obs.
- Sans sélection, cliquer une face **ne sélectionne que cette face** : la tourner dans son plan déforme le solide
  (arêtes connectées étirées). obs.
- Axe quelconque en cliquant-glissant le rapporteur le long d'une arête : instr, nv.
- CA-ROT-1 : boîte, centre (0;0;0), départ +x, `30` → rotation de 30° autour de z (matrice vérifiable). CA-ROT-2 : `1:2`
  → atan(0,5) à 1e-12 rad. CA-ROT-3 : réseau `60` puis `x5` → 6 objets, un pas d'annulation. CA-ROT-4 : ← avant le clic
  → axe de rotation = y.

### 4.18 Échelle — *Scale* · `S` · lot 3 · obs [OM §4]

| État | Consigne | Mesures |
| --- | --- | --- |
| Sans sélection | « Cliquez sur l'élément ou l'objet à mettre à l'échelle. \| Ctrl = Depuis le centre. \| Maj = Uniforme. » | — |
| Avec sélection | « Cliquez sur une poignée pour commencer. \| … » ; survol d'un coin : « … pour commencer une mise à l'échelle uniforme. » | — |
| Coin (uniforme) | « Cliquez pour terminer la mise à l'échelle uniforme, ou saisissez un facteur ou une dimension. \| … » | Échelle · `1,48` |
| Centre de face | « Cliquez pour terminer la mise à l'échelle, ou saisissez un facteur ou une dimension. » | Échelle bleue (rouge, verte selon l'axe) |
| Après Ctrl | « Cliquez pour terminer la mise à l'échelle depuis le centre, ou … » | — |

- **Boîte englobante jaune, 26 poignées vertes** (8 coins, 12 milieux d'arêtes, 6 centres de faces) ; poignée survolée
  **rouge**, ancrage opposé rouge pâle, pointillés entre les deux ; infobulle « Échelle bleue autour du point opposé ».
  obs.
- **Saisie** : `2` par un coin = facteur 2 uniforme ancré au coin opposé (4 × 3 × 2,7 → 8 × 6 × 5,4) ; `3m` sur la
  poignée bleue du dessus = **hauteur cible exacte 3 m** (nombre seul = facteur ; longueur avec unité = dimension).
  obs. Facteurs multiples `2;3;4`, négatif = miroir : doc, nv.
- Coin = 3 axes uniforme ; milieu d'arête = 2 axes, face = 1 axe, non uniformes par défaut ; **Maj inverse** le mode de
  la poignée (obs sur une poignée de face ; le reste instr). Ctrl = ancrage au centre (obs).

| Modificateur | Effet | Nature | Statut |
| --- | --- | --- | --- |
| Ctrl | Échelle depuis le centre | bascule | obs |
| Maj | Inverse uniforme / non uniforme de la poignée | maintenu | obs |

- Après : retour à « Cliquez sur une poignée… », sélection et poignées gardées. Échap au repos avec sélection : vide la
  sélection. obs. Composant à contour rouge verrouillé dans l'outil : instr.
- CA-ECH-1 : boîte 4 × 3 × 2,7, coin, `2` → 8 × 6 × 5,4, coin opposé fixe. CA-ECH-2 : poignée bleue du dessus, `3m` →
  hauteur 3, base fixe. CA-ECH-3 : Ctrl, poignée bleue, `2` → hauteur doublée, centre fixe. CA-ECH-4 : 26 poignées
  exactement.

### 4.19 Décalage — *Offset* · `F` · grille · lot 3 · obs [OM §5]

| État | Consigne | Mesures |
| --- | --- | --- |
| Sans sélection | « Choisissez une face ou des arêtes à décaler. Alt = Autoriser le chevauchement. » (`Select face or edges to offset. Alt = Allow overlap.`) | Distance |
| Arêtes présélectionnées | « Choisissez le point depuis lequel le décalage sera mesuré. Alt = … » | Distance |
| Après le clic sur la face | « Choisissez le point qui définit le décalage ou saisissez une valeur. Alt = … » | Distance · `~ 0,90 m` |

- `0,3` Entrée → contour intérieur à 0,3 m, la face **divisée** en un anneau et une face intérieure. **Double-clic** sur
  une autre face = même distance. obs. Sens = côté du curseur lors de la saisie. obs.
- Arêtes : deux arêtes contiguës présélectionnées, `0,5` → **polyligne ouverte** parallèle, prolongée jusqu'à
  l'intersection, **aucune face**. obs.
- Après : étape 1. obs. Alt = garder les chevauchements : instr / doc, nv. Arcs décalés restant des arcs : doc.
- CA-DEC-1 : face 4 × 3, `0,3` vers l'intérieur → 2 faces : 3,4 × 2,4 et l'anneau (aire 12 − 8,16). CA-DEC-2 :
  double-clic sur la face intérieure → second anneau de 0,3. CA-DEC-3 : deux arêtes en L, `0,5` → 2 arêtes nouvelles,
  0 face nouvelle.

### 4.20 Suivez-moi — *Follow Me* · sans raccourci · grille · lot 3 · obs [OM §6]

- Avec une face présélectionnée (chemin = son périmètre) : « Cliquez sur le profil à extruder. » (`Click the profile
  that you want to extrude.`), Mesures vide ; clic sur le profil → extrusion **sur tout le périmètre**, coins à onglet,
  face du chemin en partie consommée ; outil gardé. obs.
- Sans présélection : cliquer le profil, suivre les arêtes du chemin au curseur, cliquer pour finir (instr, nv) ;
  présélection d'arêtes continues (instr) ; Alt = périmètre de la face comme chemin (doc) ; chemin et profil dans le
  même contexte (doc) ; révolution autour d'un cercle (doc).
- CA-SUI-1 : face 4 × 3 au sol présélectionnée, profil 0,4 × 0,6 vertical à un coin → muret fermé de 4 tronçons à
  onglet, toutes faces planes, solide étanche.

### 4.21 Retourner — *Flip* · sans raccourci · grille · lot 3 · obs [OM §7]

- Avec une sélection : **trois plans semi-transparents** rouge, vert, bleu par le centre de la boîte englobante ; le plan
  survolé devient plus opaque. « Cliquez ou faites glisser un plan pour retourner la sélection. \| Ctrl = Retourner /
  Copier. \| Flèches = Retourner selon un plan. » ; Mesures « Distance ». obs.
- Ctrl (bascule) → « … pour retourner et copier la sélection. » ; **glisser un plan** en mode copie → copie miroir de
  l'autre côté d'un plan décalé ; Mesures = décalage (`2,36 m`) et « Saisissez une distance pour ajuster le décalage du
  plan de symétrie. » ; `1` → décalage 1 m. obs.
- Clic simple sur un plan = miroir en place autour du centre (non mis en évidence : objet symétrique, nv). Flèches ← / →
  / ↑ : plan vert / rouge / bleu (doc). Alt = axes de l'objet ou du contexte (doc). Plan magenta d'une face survolée
  (doc). Pas de fiche Instructor pour Flip (obs) : la Planche en écrit une (fadi).
- CA-RET-1 : objet asymétrique, clic sur le plan rouge → image par la symétrie x ↦ 2c − x (c = centre). CA-RET-2 : Ctrl,
  glisser le plan vert, `1` → original inchangé + copie miroir par un plan à 1 m.

### 4.22 Coque extérieure — *Outer Shell* · sans raccourci · grille et menu contextuel · lot 6 · obs [CM §2], résultat géométrique déclaré « maillage » (MO-4)

- Outil : « Choisissez le premier solide. » → « Choisissez le second solide. » (`Select first solid.` / `Select second
  solid.`), Mesures vide ; une géométrie libre non solide ne change pas la consigne ; Échap → « premier solide ». obs.
  3ᵉ solide ou Échap pour terminer : instr.
- Menu contextuel de 2 solides sélectionnés : « Coque extérieure ». obs.
- Résultat relevé : **un seul groupe** (« Groupe solide (1 dans le modèle) »), **volume exact** 9 m³ (6 + 6 − 3),
  nom d'occurrence `OuterShell` (Planche : « Coque extérieure »), matériau du groupe remis par défaut, matériaux des
  faces conservés ; une couture reste au milieu (ligne grise non surlignée en édition) — nature exacte (adoucie,
  masquée) nv. obs.
- **Solide** : groupe ou composant fermé, chaque arête bordant exactement 2 faces (doc [S21]) ; Info entité l'indique
  (« Groupe solide »). obs.
- Moteur : manifold-3d (Apache-2.0, D-013) ; le résultat est reconverti en faces planes polygonales (triangles
  coplanaires fusionnés) ; tolérance et couture déclarées (fiche du lot 6).
- CA-COQ-1 : deux boîtes 2 × 2 × 1,5 chevauchées de 1 m → un groupe, volume 9 m³ ± 1e-9, étanche. CA-COQ-2 : une
  géométrie libre non fermée → refus nommé (« n'est pas un solide »), rien n'est modifié.

### 4.23 Intersection, Union, Soustraction, Découpe, Scission — *Intersect, Union, Subtract, Trim, Split* · sans raccourci · grille · lot 6 · doc [DOC §3.8] ; dans SketchUp grisés en offre gratuite (obs) — **non observés**

| Outil | Effet (doc [S21]) |
| --- | --- |
| Intersection | Ne garde que le volume commun. |
| Union | Fusionne en un solide (peut garder des vides intérieurs, contrairement à la coque). |
| Soustraction | **Ordre important** : le 1ᵉʳ solide cliqué est l'outil de coupe et disparaît ; le 2ᵉ garde le creux. |
| Découpe | Comme Soustraction, mais le 1ᵉʳ solide est conservé. |
| Scission | Découpe selon les intersections en plusieurs groupes. |

- Usage : choisir l'outil puis cliquer les solides, ou présélectionner puis menu contextuel (doc). Consignes de barre
  d'état : **non relevées** (outils grisés) — la Planche reprend la forme relevée de la Coque (« Choisissez le premier
  solide. » / « … le second … ») comme choix Fadi déclaré.
- CA-BOO-1 : Union de deux boîtes chevauchées → volume = somme − intersection. CA-BOO-2 : Soustraction A puis B → B − A,
  A supprimé. CA-BOO-3 : Découpe → B − A et A conservé. CA-BOO-4 : Intersection → volume commun. CA-BOO-5 : Scission →
  3 groupes (A − B, A ∩ B, B − A) dont la somme des volumes = volume de l'union. Tolérance de volume 1e-9 m³ pour des
  boîtes alignées sur les axes.

### 4.24 Peinture — *Paint Bucket* · `B` · lot 5 · obs [CM §1]

| État | Consigne | Mesures |
| --- | --- | --- |
| Repos | « Cliquez pour peindre un élément ou un objet. \| Alt = Prélever le matériau. \| Maj = Peindre tout l'identique. \| Ctrl = Peindre tout le connecté. \| Maj + Ctrl = Peindre tout sur le même objet. » (`Click to paint an item or object. \| Alt = Sample Material. \| Shift = Paint All Matching. \| Ctrl = Paint All Connected. \| Shift + Ctrl = Paint All on Same Object.`) | Mesures · vide (inutilisé) |
| Ctrl enfoncé | « Cliquez pour peindre les faces connectées de même matériau. \| … » | — |
| Maj enfoncé | « Cliquez pour peindre les faces identiques. \| … » | — |
| Maj + Ctrl | « Cliquez pour peindre les faces identiques du même objet. \| … » | — |
| Alt enfoncé | « Cliquez sur une face pour charger son matériau dans le pot de peinture. » (seul segment) | — |

- Modificateurs **maintenus** (obs, malgré « Toggle »). Effets obs : clic = **cette face seule** ; Ctrl = faces
  **connectées de même matériau** ; Alt = **prélever** (outil gardé) ; Maj = **toutes les faces de ce matériau dans le
  modèle**, connectées ou non ; Maj + Ctrl = toutes les faces de ce matériau **du même objet** (géométrie connectée ; un
  composant voisin n'est pas touché).
- **Groupes** : peindre un groupe de l'extérieur pose le matériau **sur le groupe** ; il s'affiche sur ses faces sans
  matériau ; une face déjà peinte garde le sien (Info entité du groupe : « Recto : … »). En édition du groupe, peindre
  une face : le matériau de la face l'emporte. obs.
- Choisir une vignette du panneau Matériaux **active la Peinture**. obs. Présélection puis clic (toute la sélection) :
  doc, nv. Peindre une arête : doc, nv. Recto / verso d'une face : Info entité montre Recto et Verso (obs) ; peindre le
  verso : nv.
- CA-PEI-1 : clic sur une face → seule cette face change. CA-PEI-2 : Ctrl + clic sur le dessus d'une boîte dont l'avant
  est brun → 5 faces peintes, l'avant inchangé. CA-PEI-3 : Maj + clic → toutes les faces du matériau visé dans la
  Planche, y compris d'une autre boîte non connectée. CA-PEI-4 : Maj + Ctrl → seulement l'objet visé. CA-PEI-5 : groupe
  peint en vert : faces sans matériau rendues vertes, face rouge rendue rouge ; aucune face ne reçoit d'attribut.
  CA-PEI-6 : chaque clic = un pas d'annulation.

### 4.25 Prélever le matériau — *Sample Material* · sans raccourci · grille · lot 5 · obs [CM §1]

- « Cliquez sur une face pour charger son matériau dans le pot de peinture. », Mesures vide ; un clic charge le matériau
  et **bascule aussitôt vers la Peinture** (barre d'état de repos de la Peinture). obs.
- CA-PRE-1 : clic sur une face rouge → matériau courant = rouge, outil actif = Peinture.

### 4.26 Diviser — *Divide* · menu contextuel d'une arête ou d'une courbe · lot 3 · obs [OM §10.2]

- « Choisissez ou saisissez le nombre de segments. » (`Select or enter number of segments.`), libellé **Segments**,
  valeur par défaut `5` ; survol : points rouges et infobulle « 5 segments Longueur … » ; `3` Entrée valide, puis
  l'outil Sélection revient. obs.
- CA-DIV-1 : arête de 3 m, `3` → 3 arêtes de 1 m colinéaires, faces bordantes conservées (leur contour gagne 2
  sommets).

### 4.27 Mètre — *Tape Measure* · `T` · lot 4 · obs [MCP §1.1]

**Modes** (Ctrl, cycle **Lignes de guide → Points de guide → Mesure → Lignes de guide**, appui + relâchement de Ctrl
seul) :

| Mode | Consigne avant le 1ᵉʳ clic | Statut |
| --- | --- | --- |
| Lignes de guide (défaut) | « Cliquez pour créer un guide. \| Ctrl = Lignes de guide / Points de guide / Mesure. \| Flèches = Verrouiller la direction d'inférence. » (`Click to create a guide. \| …`) | obs |
| Points de guide | « Double-cliquez, ou cliquez et mesurez, pour créer un point de guide \| … » | obs |
| Mesure seule | « Cliquez sur un élément depuis lequel mesurer. \| … » (`Click an item to measure from.`) | obs |

| Étape (mode Lignes de guide) | Consigne | Mesures |
| --- | --- | --- |
| Survol d'une face | infobulle « Sur la face 10,8 m² » | **Aire** · `10,8 m²` (avant tout clic) |
| Après le 1ᵉʳ clic | « Cliquez pour placer le guide ou saisissez la distance. » (`Click to place guide or enter distance.`) | Longueur · `4,00 m` ; ligne pointillée de la couleur de l'axe et étiquette près du curseur |
| Après un 2ᵉ clic de point à point | « Cliquez pour créer un guide ou saisissez une distance pour redimensionner le modèle. » | Longueur · `4,00 m` (aucun guide créé) |

- Depuis une **arête** : déplacement, `1` Entrée → **ligne de guide infinie** (tirets noirs) parallèle à l'arête à 1 m ;
  retour à « Cliquez pour créer un guide. », Mesures garde `1m`. obs. Depuis un point : guide fini (instr).
- **Redimensionner le modèle** (distance saisie après une mesure point à point) : boîte de confirmation non relevée
  (saisie bloquée exprès, nv). Planche : redimensionne **la géométrie de la Planche seulement** (jamais le modèle du
  bâtiment ni la parcelle), après confirmation, en une commande (fadi).
- Maj = verrouiller la direction (instr) ; flèches (instr, cf. Ligne) ; Échap annule (instr).
- CA-MET-1 : survol d'une face 4 × 2,7 → Mesures « Aire · 10,8 m² ». CA-MET-2 : depuis une arête, `1` → une ligne de
  guide parallèle à 1 m, donnée de la Planche (annulable). CA-MET-3 : en mode Mesure, aucun guide n'est créé. CA-MET-4 :
  un lecteur (droit `read`) mesure sans créer de guide.

### 4.28 Cotes — *Dimensions* · sans raccourci · grille · lot 4 · obs [MCP §1.2]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| Repos | « Choisissez une arête, une courbe ou deux points à coter, ou faites glisser une cote pour la déplacer. » | Mesures · vide |
| Après le 1ᵉʳ point | « Choisissez le second point de la cote linéaire. » | — |
| Après le 2ᵉ point | « Placez la cote. » | — |

- Clic de placement : cote créée, retour au repos. Lignes d'attache, ligne de cote parallèle, petites flèches, texte
  « 4,00 m » **centré sur la ligne**, coupée autour du texte. Une arête survolée se surligne en bleu et peut être
  cliquée directement. obs.
- **Cercle** : clic sur la courbe → « Placez la cote. » → cote de **diamètre** « DIA 1,20 m » (Planche : « ⌀ 1,20 m »,
  fadi) ; curseur hors du cercle : ligne de rappel et texte au bout d'un trait horizontal ; dans le cercle : texte sur le
  diamètre. obs. Viser près d'un sommet accroche Extrémité ou Centre (cote linéaire). obs. Rayon d'un arc (« R ») : nv.
  Type changé par clic droit > Type : doc.
- La cote reste dans le plan où elle a été tirée ; texte édité = association rompue (doc).
- Info entité d'une cote (§6.1) : police, style, taille (9 à 32, défaut 12), aligner (sur la ligne / à l'écran),
  extrémités (aucune, barre oblique, flèche ouverte, flèche fermée, point), matériau, balise. obs.
- CA-COT-1 : deux sommets à 4 m → cote « 4,00 m » ; la valeur suit si un sommet est déplacé (association), à 1e-9 m.
  CA-COT-2 : clic sur un cercle de rayon 0,6 → « ⌀ 1,20 m ».

### 4.29 Rapporteur — *Protractor* · sans raccourci · grille · lot 4 · obs [MCP §1.3]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez pour placer le centre du rapporteur. \| Ctrl = Créer des guides. \| Flèches = Verrouiller le plan de rotation. » | Angle |
| 3 (après centre et début) | « Cliquez pour placer le guide ou saisissez l'angle. \| Ctrl = Créer des guides. » | Angle · `0,0` → `86,9` (une décimale) |

- Rapporteur vert sur une face verticale de normale verte, bleu au sol, « Plan libre » sans verrou. obs. Saisie `30` →
  retour à l'étape 1, Mesures `30` ; **création du guide à 30° non confirmée visuellement** (nv). Pente `4:12` : instr.
- Ctrl (création de guides) : texte obs, effet nv ; Maj et flèches avant le 1ᵉʳ clic : instr.
- CA-RAP-1 : centre (0;0;0), début sur +x, `30` → une ligne de guide de direction (cos 30°; sin 30°; 0) quand la
  création de guides est active, aucune sinon.

### 4.30 Axes — *Axes* · sans raccourci · grille · lot 4 · obs [MCP §1.4]

| Étape | Consigne | Mesures |
| --- | --- | --- |
| 1 | « Cliquez pour définir la nouvelle origine ou double-cliquez pour placer les axes tels qu'ils sont orientés. » | Mesures · vide |
| 2 | « Cliquez pour fixer l'axe rouge ou double-cliquez pour fixer les axes tels qu'orientés. Alt = Autre orientation des axes. » | — |
| 3 | « Cliquez pour fixer l'axe vert. Alt = Autre orientation des axes (axe rouge verrouillé). » ; trièdre provisoire | — |

- Après le 3ᵉ clic, les axes sont déplacés (origine, rouge le long de l'arête) et **l'outil précédent revient** ;
  annulable. obs. Alt, double-clic : instr. Menu contextuel des axes (Aligner, Déplacer, Réinitialiser, Masquer) : doc.
- R5 (C12) : change le **repère de saisie** de la Planche, jamais le repère des coordonnées stockées.
- CA-AXE-1 : origine (1;2;0), rouge vers +y → une saisie `[1;0;0]` dans le repère de saisie donne le point local
  (1;3;0). CA-AXE-2 : Annuler rétablit les axes précédents.

### 4.31 Texte — *Text* · sans raccourci · grille · lot 4 · obs [MCP §1.5]

- Repos : « Choisissez un objet auquel attacher le texte ou une position à l'écran. » obs.
- **Texte avec repère** : clic sur une entité → « Placez le texte. » (ligne de rappel élastique, texte par défaut =
  **aire** pour une face, « 9,68 m² ») → clic → « Saisissez le texte. » (zone de saisie préremplie) → clic dehors
  valide. obs. Longueur pour une arête, coordonnées pour un sommet : nv. Double-clic sur une face = étiquette d'aire :
  doc.
- **Texte écran** : clic dans le vide → zone préremplie « Saisissez le texte » ; fixé à l'écran (ne suit pas la
  caméra). obs.
- Info entité : texte avec repère — police, style, taille, extrémités (défaut **flèche fermée**), aligner (à l'écran /
  **à l'épingle**, défaut épingle), matériau, balise ; texte écran — police, style, taille, matériau, balise. obs.
- CA-TXT-1 : texte avec repère sur une face de 9,68 m² → texte par défaut « 9,68 m² » ; l'aire suit-elle la face
  modifiée ? nv (le texte est figé à la création, choix Fadi déclaré tant que non relevé).

### 4.32 Plan de coupe — *Section Plane* · sans raccourci · grille · lot 4 · obs [MCP §1.6]

- « Placez le plan de coupe sur une face. Maj = Verrouiller sur le plan. » ; aperçu : rectangle à 4 languettes qui
  épouse la face survolée, couleur de l'axe de la normale. obs.
- Le clic pose le plan, **la coupe est active aussitôt**, **l'outil passe à Sélection** avec le plan sélectionné
  (orange, symboles cercle + flèche aux coins ; gris non sélectionné ; bleu au survol). obs.
- Menu contextuel : Info entité, Effacer, Masquer, Inverser la sélection, **Inverser** (sens), **Coupe active**,
  Aligner la vue, Créer un groupe depuis la tranche (grisé si inactive), Dépanner le remplissage. obs. Info entité :
  nom d'occurrence, symbole, balise ; pas de case « actif ». obs.
- Une seule coupe active par contexte (doc) ; flèches d'orientation (instr) ; boîte nom + symbole à la pose (doc ; pas
  vue en direct).
- CA-CPE-1 : pose sur une face de normale +y → plan actif, outil Sélection, plan sélectionné. CA-CPE-2 : Inverser →
  côté coupé inversé ; décocher Coupe active → modèle entier, plan visible.

### 4.33 Balise — *Tag* · sans raccourci · grille · lot 5 · obs [MCP §1.7]

- Sans balise choisie : « Choisissez ou prélevez une balise pour commencer. \| Alt = Prélever la balise. » (infobulle
  « Choisissez une seule balise à appliquer »). Avec une balise choisie dans le panneau : « Cliquez sur un objet pour
  appliquer une balise. \| Alt = Prélever la balise. \| Maj = Remplacer l'identique. \| Ctrl = Baliser toutes les
  occurrences. » obs (textes) ; effets instr / doc.
- Choisir une balise dans le panneau active l'outil. obs.
- Correspondance Fadi : une balise de la Planche est un **calque** de l'Atelier (calques imbriqués, visibles /
  verrouillés dans le modèle, D-012) — proposition P-9.
- CA-BAL-1 : balise choisie, clic sur un groupe → le groupe porte la balise ; masquer la balise masque le groupe.

### 4.34 Outils de caméra — lot 4 (Orbite, Panoramique, Zoom : lot 2) · obs [MCP §2, OM §12]

| Outil (FR / EN) | Raccourci | Consigne | Mesures | Comportement relevé |
| --- | --- | --- | --- | --- |
| Orbite / *Orbit* | `O` | « Faites glisser pour tourner autour. Maj = Panoramique, Ctrl = suspendre la gravité. » | — | Glisser à droite : la caméra tourne autour du modèle, verticales gardées (obs). Maj maintenu = panoramique, Ctrl = sans gravité, Échap = outil précédent (instr). Contradiction QRC (Alt) [DOC §12-4] : le texte relevé (Ctrl) fait foi. |
| Panoramique / *Pan* | `H` | « Faites glisser dans la direction du panoramique » | — | Échap rend l'outil précédent (obs). |
| Zoom / *Zoom* | `Z` (annoncé ; la touche n'a pas activé l'outil dans l'essai, nv) | « Faites glisser pour zoomer. Vers le haut : avant, vers le bas : arrière. Maj pour changer le champ de vision. » | **Champ de vision** · `35,00°` | `60` Entrée → 60° (grand angle), `35` pour revenir ; glisser vers le haut zoome (obs). Focale en mm : doc. |
| Zoom étendu / *Zoom Extents* | `Ctrl+Maj+E` | (action immédiate) | — | Cadre tout le modèle ; **ne tient pas compte des panneaux** qui le recouvrent (obs) — Planche : cadre dans la zone libre (fadi, écart). |
| Zoom fenêtre / *Zoom Window* | `Maj+W` | « Faites glisser la zone à agrandir » | — | Rectangle → zoom, puis outil précédent (obs). |
| Positionner la caméra / *Position Camera* | — | « Choisissez la position de la caméra. » | **Décalage de hauteur** · `~ 1,68 m` | Clic au sol : œil au-dessus du point, puis **Regarder autour s'active** (Mesures « Hauteur d'œil ») (obs). Cliquer-glisser A → B : œil en A regardant B (instr). |
| Regarder autour / *Look Around* | — | « Faites glisser dans la direction où tourner la caméra » | **Hauteur d'œil** · `~ 2,80 m` (variable) | Pivote sur place (obs) ; Échap = outil précédent (instr). |
| Marcher / *Walk* | — | « Cliquez et faites glisser pour marcher. Ctrl = courir, Maj = vertical ou latéral, Alt = sans détection de collision » | **Hauteur d'œil** · `~ 2,34 m` | Textes obs ; marche non testée longuement (nv). Haut / bas / gauche / droite, vitesse selon la distance à la croix de départ (instr). |

- La molette zoome **autour du curseur** (obs) — existant D-157. Bouton du milieu (orbite), Maj + milieu (panoramique),
  double-clic molette (recentrer) : **non testés** (§9, L-9) ; la Planche reprend D-157 (molette maintenue = orbite en
  3D, Maj = panoramique), déclaré comme convention de la documentation [DOC §5].
- Outils de caméra **temporaires** : rendent l'outil précédent après l'action (obs : après Zoom fenêtre, Balise est
  revenu ; après Axes, Rapporteur) [MCP §0].
- R10 : aucun outil de caméra ne modifie la révision ; le champ de vision et la hauteur d'œil sont de l'état de vue.
- CA-CAM-1 : Orbite puis Échap → outil précédent actif. CA-CAM-2 : Zoom `60` → champ de vision 60° ; aucune requête de
  commande. CA-CAM-3 : Zoom étendu → l'emprise de la Planche entre dans la zone non couverte par les panneaux.
  CA-CAM-4 : Positionner la caméra au sol en P → œil en P + (0;0;1,68), outil actif = Regarder autour.

### 4.35 Recherche — *Search SketchUp* · `Maj+-` · lot 2 · obs [MCP §8.1]

- Barre « Rechercher… » ; résultats : icône, nom en gras et description, **interrupteur** pour les commandes à bascule,
  case « Attribuer un raccourci à cette commande » ; 5 résultats puis « Voir plus de résultats » (20 au plus) ;
  commande « Réinitialiser les raccourcis ». obs. Modificateurs admis pour un raccourci : Maj, Alt (Ctrl interdit) ;
  modificateur obligatoire avec un chiffre (doc).
- Planche : palette existante de l'Atelier (`Ctrl K`) **et** `Maj+-` ; noms français, synonymes anglais (C1).
- CA-RCH-1 : « pousser » et « push » trouvent Pousser / tirer. CA-RCH-2 : un raccourci attribué est une préférence
  locale (jamais une donnée de projet) et survit au rechargement.

---

## 5. Conventions transversales

### 5.1 Inférences et couleurs

| Inférence (infobulle FR / relevée) | Rendu | Statut |
| --- | --- | --- |
| Origine / `Origin` | cercle noir avec croix | obs |
| Extrémité / `Endpoint` | **point vert** | obs (doc : cercle vert) |
| Milieu / `Midpoint` | **point cyan** | obs (doc : bleu, « teal ») |
| Sur l'arête / `On Edge` | **carré rouge** | obs |
| Sur la face / `On Face` | **losange bleu foncé** | obs ; sur le mètre : « Sur la face 10,8 m² » (aire) |
| Sur l'axe rouge / vert / bleu / `On Red Axis`… | élastique de la couleur de l'axe | obs |
| Depuis un point / `From Point` | **pointillés de la couleur de l'axe** issus d'un point existant marqué d'un petit cercle | obs |
| Parallèle à l'arête / `Parallel to Edge`, perpendiculaire | **magenta** | obs (rectangle, ↓) |
| Tangent au sommet / `Tangent at Vertex` | **cyan** | obs (arc 2 points) |
| Carré / `Square` (rectangle) | diagonale pointillée | obs |
| Contraint sur une ligne / un plan / `Constrained on Line / Plane` | trait épais coloré, pointillés de projection, carré rouge au point contraint | obs |
| Plan libre / `Unlocked plane` | infobulle du rapporteur ou du curseur avant le 1ᵉʳ clic | obs |
| Dans un composant : « Extrémité dans Ty ~ −0,54 m −0,47 m ~ 1,73 m » | infobulle avec nom et coordonnées | obs [MCP §0] |
| Intersection | **X rouge** | doc, nv |
| Centre (cercle, arc, polygone) | — | doc ; couleur nv. Relevé indirect : la cote d'un cercle accroche « Center » (obs [MCP §1.2]) |
| Inférence dans un groupe / composant | magenta | doc, nv |
| Prolongement d'arête, « Par un point », demi / quart de cercle, section dorée | — | doc, nv |

- Infobulles : cartouche blanc à bordure grise, texte noir, à droite et sous le curseur. obs. Aperçu **noir** hors
  inférence, **bleu** pour une forme posée sur le sol, couleur de l'axe ou du plan quand il est verrouillé. obs.
- Couleurs réglables (Settings > Accessibility, défauts relevés) : axe rouge `rgb(255,0,0)`, vert `rgb(0,255,0)`, bleu
  `rgb(0,0,255)`, parallèle / perpendiculaire `rgb(255,0,255)`, tangente `rgb(0,255,255)` ; « Réinitialiser tout ».
  obs [MCP §7.2]. Fadi : préférence locale (R10) ; l'information n'est jamais portée par la couleur seule (C20).
- **Ordre de priorité** entre candidats proches : non documenté ni relevé — **choix Fadi** déclaré (PL-01-03) :
  points (extrémité, intersection, milieu, centre, origine, point de guide) avant linéaires (axes, parallèle,
  perpendiculaire, depuis un point, tangente) avant surfaces (sur l'arête, sur la face) ; à égalité, distance écran
  puis identifiant (ordre déterministe, comme DA-02-15).
- **Pas d'accrochage de longueur** 0,01 m et **d'angle** 15° actifs par défaut (Info modèle relevé [CP]) ; « inférence
  encouragée » (pause du curseur sur un point) : doc, nv.

### 5.2 Verrouillages

- **Flèches** (bascule ; seconde pression sur la même flèche = déverrouiller) : → rouge, ← vert, ↑ bleu, ↓ parallèle /
  perpendiculaire à la **dernière arête survolée**. Outils linéaires (Ligne, arcs, et les outils après leur 1ᵉʳ clic) :
  verrou de **direction** ; formes (Rectangle, Cercle, Polygone, Main levée, rapporteur avant le 1ᵉʳ clic) : verrou de
  **plan / normale**. obs [OD §15.4].
- **Maj maintenu** : verrouille l'inférence courante (obs pour Ligne) ; ajoute / retire (Sélection, Lasso) ; masque
  (Gomme) ; inverse le mode d'une poignée (Échelle).
- **Alt** (Ligne, après le 1ᵉʳ clic) : cycle « toutes actives → toutes inactives → parallèle / perpendiculaire
  seulement », au relâchement. obs. Maj + Alt = verrouiller sur le plan d'une face : doc, nv.

### 5.3 Champ Mesures — grammaire complète

**Fonctionnement** (obs [OD §0, §15.2], [OM §0.2]) : on tape **sans cliquer dans le champ** (focus sur le canevas ou le
champ, C19) ; les caractères s'affichent dans le champ ; Retour arrière efface ; Entrée valide ; la valeur s'applique à
**l'opération en cours, ou à la dernière opération terminée** tant qu'aucune autre action n'a eu lieu (correction après
coup : rayon, `8s`, dimensions, distance, réseau) ; après validation le champ garde **le texte tapé** ; pendant le
mouvement il affiche la valeur courante, préfixée de « ~ » si elle est approchée (non accrochée).

**Grammaire** (locale française proposée, P-3 ; `SEP_LISTE` = `;`, `SEP_DEC` = `,` ou `.` ; en locale anglaise de
référence : `SEP_LISTE` = `,`, `SEP_DEC` = `.`) :

```
saisie        := vide | liste | coord_abs | coord_rel | reseau | segments | rayon | pente | ajustement
liste         := element? ( SEP_LISTE element? )*          ; éléments vides admis : « 3; » « ;3 » (doc, nv)
element       := nombre unite?                             ; longueur, facteur, angle ou nombre selon l'outil
nombre        := signe? chiffres ( SEP_DEC chiffres )? | signe? SEP_DEC chiffres
signe         := "-" | "+"
unite         := "mm" | "cm" | "m" | "'" | "\""             ; « ' » et « " » : décision P-4
coord_abs     := "[" element SEP_LISTE element SEP_LISTE element "]"   ; repère de saisie (axes), doc, nv
coord_rel     := "<" element SEP_LISTE element SEP_LISTE element ">"   ; depuis le point de départ, doc, nv
segments      := entier ( "s" | "S" )                      ; 3 ≤ n ≤ 999 (obs)
rayon         := nombre unite? ( "r" | "R" )               ; arc 2 points (doc, nv)
pente         := nombre ":" nombre                         ; montée:course → degrés = atan(montée / course) (obs)
reseau        := entier ( "x" | "X" ) | ( "x" | "X" | "*" ) entier | "/" entier | entier "/"
                                                           ; obs : « x3 », « 3x », « /3 » ; doc : « *3 », « 3/ »
ajustement    := (réservé : aucune autre forme n'est admise ; toute autre saisie est refusée)
espaces       := admis autour des séparateurs et entre nombre et unité (« 4 m ; 3 m »)
```

**Sémantique** (par outil, valeurs relevées sauf mention) :

| Contexte | Saisie | Effet |
| --- | --- | --- |
| Longueur (Ligne, Arc 2 points corde, Pousser / tirer, Déplacer, Décalage, Mètre) | `3`, `3m`, `2,7 m`, `-3` | Valeur en mètres ; unité absente = unité du modèle (m) ; une unité tapée prime ; négatif = sens inverse (Pousser / tirer : obs ; Déplacer : doc). |
| Dimensions (Rectangle) | `4;3` | 1ʳᵉ valeur sur le 1ᵉʳ axe du plan, 2ᵉ sur le 2ᵉ ; signe = quadrant du curseur (obs) ; négatif explicite = sens inverse (doc). |
| Longueur ; angle / Largeur ; angle (Rectangle tourné) | `3` puis `2;90` | Longueur seule acceptée (obs). |
| Côtés (Cercle, Polygone, arcs, Secteur) | `12` avant le 1ᵉʳ clic ; `8s` après | Nombre de segments ; hors [3 ; 999] : alerte, rien n'est modifié (obs). |
| Rayon (Cercle, Polygone, Arc) | `1` | Rayon ; après création : redimensionne la dernière courbe (obs). |
| Angle (Arc, Rotation, Rapporteur) | `90`, `30`, `1:2` | Degrés décimaux ; pente convertie (obs) ; négatif = antihoraire (doc). |
| Flèche (Arc 2 points) | `0,5` | Distance de la corde au milieu de l'arc (obs). |
| Échelle | `2` ; `3m` ; `2;3;4` ; `-1` | Nombre = facteur ; longueur avec unité = dimension cible (obs) ; plusieurs facteurs et miroir : doc, nv. |
| Réseau (après une copie de Déplacer ou de Rotation) | `x3`, `3x`, `/3` | `xN` : N copies au pas de la 1ʳᵉ ; `/N` : N intervalles entre l'original et la copie (obs). |
| Segments (Diviser) | `3` | Nombre de parties (obs). |
| Champ de vision (Zoom) | `60` | Degrés (obs) ; `50mm` focale : doc, nv. |
| Hauteur d'œil (Positionner la caméra, Regarder autour) | `1,68` | Mètres (obs : valeur affichée). |
| Décalage du plan (Retourner, copie) | `1` | Mètres (obs). |

**Affichage** : longueurs avec la précision d'Info modèle (défaut `0,00 m`, zéros gardés : `4,00 m`), aires et
volumes à 2 décimales **sans zéros finaux** (relevés `10.8 m²`, `9.68 m²`, `9 m³`), angles `0,0` (obs [CP]) ; l'affichage n'arrondit jamais la valeur stockée (R7). **Erreur** : saisie non reconnue —
comportement de SketchUp non relevé (nv) ; Planche : refus annoncé dans la barre d'état (« Saisie non reconnue : … »),
rien n'est modifié, le champ garde le texte (fadi). Hors bornes : alerte modale relevée pour les segments ; même forme
pour les autres bornes (fadi).

**Libellés du champ** (FR ← relevé) : Mesures ← Measurements ; Longueur ← Length ; Dimensions ← Dimensions ; Côtés ←
Sides ; Rayon ← Radius ; Rayon inscrit ← Inscribed Radius ; Rayon circonscrit ← Circumscribed Radius ; Angle ← Angle ;
Flèche ← Bulge ; « Longueur ; angle » ← Length, Angle ; « Largeur ; angle » ← Width, Angle ; Distance ← Distance ;
Échelle ← Scale ; Échelle rouge / verte / bleue ← Red / Green / Blue Scale ; Segments ← Segments ; Aire ← Area ; Champ
de vision ← Field of View ; Décalage de hauteur ← Height Offset ; Hauteur d'œil ← Eye Height.

### 5.4 Géométrie libre : faces automatiques et collage

Relevés : [OD §15.5], [CM §5], [DOC §8].

- **Arête** = segment droit entre deux sommets ; **face** = polygone **plan**, éventuellement troué, bordé d'arêtes ;
  pas de vraie courbe : arcs, cercles, polygones et main levée sont des **courbes** (suites d'arêtes qui se
  sélectionnent et s'effacent comme une seule entité). obs.
- **Face automatique** : une boucle fermée d'arêtes **coplanaires** (au moins 3) crée une face (Ligne, Rectangle,
  Rectangle tourné, Cercle, Polygone, Secteur) ; Arc, Arc 2 points, Arc 3 points et Main levée n'en créent pas par
  eux-mêmes. obs.
- **Une arête tracée sur une face la divise.** obs.
- **Collage** : deux boîtes libres collées face contre face fusionnent — 31 entités = 18 + 18 − 1 face commune −
  4 arêtes communes ; la face de contact devient **une face intérieure partagée** ; les arêtes coïncidentes sont
  fusionnées. Une copie libre qui chevauche (montée de 1 m sur une boîte de 1,5 m) donne 75 entités connectées : les
  faces coplanaires qui se recouvrent se **découpent** automatiquement (arêtes horizontales à 1 m et 1,5 m). obs.
- **Les groupes et composants ne collent pas** (deux groupes qui se chevauchent restent distincts). obs.
- **Adoucie / lissée / masquée** : attributs d'arête (adoucie = invisible, faces regroupées en surface ; lissée =
  ombrage continu ; masquée = invisible sans surface) [DOC §8] ; adoucir une arête entre faces coplanaires ne crée pas
  de surface commune pour la sélection (obs [CM §4]).
- **Planarité** : une face reste plane ; un étirement qui la rendrait non plane ajoute des plis ou est bloqué (doc) ;
  relevé : un sommet déplacé déforme les faces adjacentes et une face restée plane reste une seule face (obs).
- **Tolérance de fusion** des sommets : non relevée ; **choix Fadi** (PL-01-01, cahier Atelier §10.2).

### 5.5 Nature des modificateurs (synthèse)

| Outil | Ctrl | Alt | Maj | Flèches |
| --- | --- | --- | --- | --- |
| Sélection, Lasso | ajouter — maintenu (obs) | — | basculer — maintenu (obs) | — |
| Gomme | adoucir — maintenu (obs) | réafficher — maintenu (obs) | masquer — maintenu (obs) | — |
| Ligne | — | cycle des inférences — bascule au relâchement (obs) | verrou d'inférence — maintenu (obs) | verrou de direction — bascule (obs) |
| Rectangle | depuis le centre — bascule persistante (obs) | — | verrou de plan — maintenu (instr) | verrou de plan — bascule (obs) |
| Cercle, Polygone, arcs | Ctrl + / Ctrl − : ±1 segment (obs) ; Polygone : inscrit / circonscrit — bascule (obs) | Arc 2 points : verrou de tangence — bascule (obs) | verrou — maintenu (instr) | normale ou direction — bascule (obs pour ←) |
| Pousser / tirer | nouvelle face de départ — bascule (obs) | étirement — bascule (texte obs) | — | — |
| Déplacer | cycle Copier / Tampon / Déplacer — bascule (obs) | pliage automatique (texte obs) | verrou (instr) | verrou d'axe — bascule (obs) |
| Rotation | copie — bascule (obs) | — | verrou du rapporteur (instr) | plan / direction — bascule (obs pour ←) |
| Échelle | depuis le centre — bascule (obs) | — | inverse uniforme — maintenu (obs) | — |
| Retourner | copie — bascule (obs) | axes objet / contexte (doc) | — | plan (doc) |
| Peinture | connecté — maintenu (obs) | prélever — maintenu (obs) | tout l'identique — maintenu (obs) | — |
| Mètre | cycle des modes — appui + relâchement (obs) | — | verrou (instr) | verrou (instr) |
| Orbite | sans gravité (texte obs) | — | panoramique — maintenu (instr) | — |

**Lecture de l'état du clavier** : SketchUp suit keydown / keyup sur le canevas, pas `MouseEvent.ctrlKey` (obs). Un
Ctrl enfoncé sans relâchement bloque les raccourcis d'une lettre (lus comme Ctrl + touche) (obs) : la Planche remet
l'état des modificateurs à zéro à la perte de focus de la fenêtre (fadi). Mac : Ctrl ⇔ Option, Alt ⇔ Commande (doc).

### 5.6 Groupes et composants

Relevés : [OM §10–11], [CM §2–3, §6], [DOC §8].

- **Créer un groupe** : sélection (triple-clic), clic droit > « Créer un groupe ». Ensuite **un clic simple sélectionne
  le groupe entier** (contour bleu de boîte englobante). obs.
- **Édition** (double-clic avec Sélection) : reste du modèle **délavé** (pâle, semi-transparent), **boîte englobante en
  pointillés noirs**, **axes déplacés à l'origine locale** du groupe ; la barre d'état ne signale rien (obs) — Planche :
  ajoute « Édition : *nom du groupe* » dans la barre d'état (fadi, accessibilité). **Sortie** : Échap avec Sélection
  (Échap avec Peinture ne sort pas), clic dans le vide hors du groupe. obs.
- **Copie d'un groupe** : partage la définition (« Groupe solide (2 dans le modèle) ») ; un groupe modifié devient
  unique (doc) ; après Coque extérieure, définitions séparées. obs.
- **Créer un composant** (`G`, doc ; menu contextuel « Créer un composant… », obs) : boîte « Créer un composant » —
  **Nom de la définition** prérempli et sélectionné (`Component`, puis `Component#2`… → Planche : « Composant »,
  « Composant 2 », fadi), croix d'effacement, chevron d'options : **Description**, **Coller à** (Aucun — défaut, Tout,
  Horizontal, Vertical, Incliné), interrupteurs **Découper l'ouverture** (off), **Toujours face à la caméra** (off),
  **Ombres face au soleil** (off, grisé) ; **Annuler** / **Créer**. Pendant la boîte : modèle assombri, petit trièdre
  des axes du futur composant. obs. Effets de « Coller à », « Découper l'ouverture », « Toujours face à la caméra » : nv
  (§9). Défaut de piège relevé : un clic sur le chevron a fermé la boîte en créant le composant — **non reproduit**
  (fadi).
- **Occurrences liées** : éditer une occurrence modifie **toutes** les occurrences (Pousser / tirer de 1 m dans l'une :
  l'autre grandit) ; **Rendre unique** (≥ 2 occurrences) → nouvelle définition `Component#1` (1 dans le modèle) ; seule
  elle change ensuite. obs.
- **Éclater** : la géométrie reste sélectionnée (18 entités pour une boîte, « Recto : Multiple ») ; elle redevient libre
  (un clic sélectionne une face). obs. Éclater une géométrie libre : grisé. obs.
- **Intersection des faces > Avec le modèle** (seule option Web) : un composant qui pénètre une géométrie libre ajoute
  des arêtes sur la géométrie libre le long de la pénétration (75 → 103 entités) ; deux groupes de même définition :
  rien. obs. Arêtes ajoutées dans le composant : nv.
- Info entité d'un composant : « Composant solide (1 dans le modèle) », Volume, Occurrence, Définition, Matériau, Balise,
  Ombres (projette / reçoit), Verrouillé. obs.

### 5.7 Annuler / rétablir

- **Une opération complète = un pas** : copie + réseau + ré-espacement d'un Déplacer = 1 pas ; réseau polaire = 1 pas ;
  **Tampon : un pas par copie** ; masquer et réafficher : un pas chacun ; une correction au champ Mesures après coup
  remplace l'opération (un seul pas). obs [OM §0.4, CM §9]. Raccourcis `Ctrl+Z` / `Ctrl+Y` (relevés dans la recherche,
  effet clavier non constaté par l'automatisation).
- Planche : Annuler / Rétablir de l'Atelier (journal) ; une opération = une commande (C6) ; une correction après coup
  est un **remplacement** de la dernière commande (même opération, nouveau `requestId`, l'inverse de la précédente
  appliqué dans le même lot), jamais deux pas. Choix de mécanisme : fadi (lot 7).

### 5.8 Menu contextuel (outil Sélection)

| Cible | Entrées relevées (FR) | Statut |
| --- | --- | --- |
| Face | Info entité · Effacer · Masquer · — · Sélectionner ▸ (arêtes bordantes, faces connectées, tout le connecté, tout de même balise, tout de même matériau, désélectionner les faces, inverser la sélection) · Créer un composant… · Créer un groupe · Aire ▸ (sélection, balise, matériau) · Intersection des faces ▸ (avec le modèle) · Aligner la vue · Aligner les axes · Inverser les faces · Orienter les faces · Zoom sur la sélection · — · Texture unique (grisé) | obs [OM §10.1] |
| Arête | Info entité · Effacer · Masquer · — · Sélectionner ▸ · Créer un composant… · Créer un groupe · Adoucir · Diviser · Zoom sur la sélection | obs |
| Courbe (arc) | Info entité · Effacer · Masquer · — · Sélectionner ▸ · Créer un composant… · Créer un groupe · Adoucir · Diviser · Éclater la courbe · Convertir en polygone · Trouver le centre · Zoom sur la sélection | obs [CM §8] |
| Sélection multiple libre | Info entité · Effacer · Masquer · — · Éclater (grisé) · Sélectionner ▸ · Aire ▸ · Créer un composant… · Créer un groupe · Intersection des faces ▸ · Aligner la vue · Inverser les faces · Souder les arêtes · Adoucir / lisser les arêtes · Zoom sur la sélection | obs |
| Groupe | Info entité · Effacer · Masquer · Verrouiller · — · Modifier le groupe · Éclater · Créer un composant… · — · Sélectionner ▸ · Décoller (grisé) · Réinitialiser l'échelle (grisé) · Réinitialiser l'inclinaison (grisé) · — · Intersection des faces ▸ · Adoucir / lisser les arêtes · Zoom sur la sélection | obs |
| Composant | … · Modifier le composant · Rendre unique (grisé avec 1 occurrence) · Éclater · — · Sélectionner ▸ · Décoller (grisé) · Changer les axes · Réinitialiser l'échelle / l'inclinaison / Mettre la définition à l'échelle (grisés) · … | obs [CM §3.3] |
| Deux solides | … · Éclater · Sélectionner ▸ · Aire ▸ · Créer un composant… · Créer un groupe · Intersection des faces ▸ · **Coque extérieure** · Adoucir / lisser · Zoom sur la sélection | obs [CM §2] |
| Plan de coupe | voir §4.32 | obs |

Effets non constatés (nv) : Orienter les faces, Inverser les faces, Souder, Trouver le centre, Convertir en polygone,
Aligner la vue, Aligner les axes, Aire ▸ — spécifiés au lot qui les livre, d'après la documentation, et déclarés.

### 5.9 Cycle de vie d'un outil

- Un seul outil actif, liseré bleu ; chaque outil est une **machine à états** (consigne et libellé de Mesures changent à
  chaque étape) ; **l'outil reste actif** après une création — exceptions relevées : Texte 3D → Déplacer ; Plan de coupe
  → Sélection ; Prélever → Peinture ; Positionner la caméra → Regarder autour ; Axes et caméras temporaires → outil
  précédent ; Diviser → Sélection. obs.
- Ligne et arc tangent verrouillé **enchaînent** ; les autres reviennent à l'étape 1. obs.
- Un outil pris dans la grille entre dans l'emplacement « récents » de la barre. obs.
- La sélection persiste d'un outil à l'autre (doc) ; un outil qui en a besoin (Échelle, Retourner, Décalage…) part de
  la présélection. obs.

### 5.10 Raccourcis par défaut (relevés)

| Commande | Touche | Commande | Touche |
| --- | --- | --- | --- |
| Sélection | Espace | Mètre | T |
| Lasso | Maj+Espace | Orbite | O |
| Gomme | E | Panoramique | H |
| Ligne | L | Zoom | Z |
| Rectangle | R | Zoom fenêtre | Maj+W |
| Cercle | C | Zoom étendu | Ctrl+Maj+E |
| Arc 2 points | A | Créer un composant | G |
| Pousser / tirer | P | Arêtes arrière | K |
| Décalage | F | Annuler / Rétablir | Ctrl+Z / Ctrl+Y |
| Déplacer | M | Couper / Copier / Coller | Ctrl+X / Ctrl+C / Ctrl+V |
| Rotation | Q | Supprimer | Retour arrière |
| Échelle | S | Tout sélectionner / Inverser la sélection | Ctrl+A / Ctrl+Maj+I |
| Peinture | B | Imprimer / Recherche | Ctrl+P / Maj+- |

Source : [MCP §8.2] (obs, titres de boutons et champs de la recherche). Sans raccourci : tous les autres outils. Les
raccourcis sont lus sur le **caractère** de la touche (`KeyboardEvent.key`) — comportement de SketchUp sur un clavier
AZERTY non relevé (nv) ; choix Fadi déclaré. En mode Planche, ces raccourcis remplacent ceux de l'Atelier (Plan / 3D
inchangés) ; un conflit (même touche) est résolu en faveur de la Planche dans son mode seulement.

---

## 6. Panneaux

Relevés : [MCP §4], [CP]. Planche : panneaux de la colonne Canevas (D-156). Les valeurs ci-dessous sont **relevées** ;
une valeur absente est nv.

### 6.1 Info entité — *Entity Info*

| Sélection | Champs relevés |
| --- | --- |
| Rien | « Aucune sélection » |
| Face | « Face » ; Aire (calculée, ex. 9,68 m²) ; Matériaux : Recto, Verso (liste + vignette) ; Balise (« Sans balise ») ; Ombres : Projette, Reçoit (activés) |
| Arc | Longueur d'arc (lecture, « ~ 7,91 m ») ; Rayon (modifiable) ; Segments (modifiable, 12) ; Matériau recto ; Balise ; Projette des ombres |
| Groupe / composant | « Groupe solide (n dans le modèle) » / « Composant solide … » ; Volume ; Occurrence ; Définition ; Matériau ; Balise ; Ombres ; Verrouillé |
| N entités | « N entités » ; Recto : Multiple |
| Cote | Police (15 polices, défaut Architects Daughter) ; Style ; Taille 9, 10, 11, 12 (défaut), 14, 18, 20, 24, 32 ; Aligner (centré sur la ligne / à l'écran) ; Extrémités (aucune, barre, flèche ouverte, flèche fermée, point) ; Matériau ; Balise |
| Texte | voir §4.31 |
| Plan de coupe | Nom d'occurrence ; Symbole ; Balise |

Polices : décision P-7 (licence). Rayon et segments modifiables = commandes de régénération de la courbe (C8).

### 6.2 Composants — *Components*

« Modifier les détails du composant » (grisé sans sélection), « Ouvrir 3D Warehouse » (non reproduit, C17) ; liste des
composants du modèle (vignette, nom, auteur, menu ⋮ : modifier les détails, envoyer vers 3D Warehouse — non
reproduit). obs.

### 6.3 Instructeur — *Instructor*

Animation de l'outil, titre, résumé, « Fonctionnement de l'outil » (liste numérotée), « Touches de modification »,
« Astuces », lien vers plus d'opérations ; mis à jour à chaque changement d'outil. obs. Planche : textes **propres à
Fadi**, rédigés en français à partir de ce cahier (pas de reprise du contenu de SketchUp, protégé) ; le catalogue
(PL-01-04) porte étapes, modificateurs et astuces de chaque outil. L'existant Canevas (D-156) affiche déjà
« opération en étapes, exemple, raccourci, saisie exacte ».

### 6.4 Matériaux — *Materials*

Onglets Dans le modèle / Parcourir / 3D Warehouse ; vignette et nom du matériau courant ; Supprimer les matériaux,
Importer un matériau ; « Matériaux utilisés » (grille 4 colonnes, cadre bleu sur l'actif). Parcourir : catégories
(Asphalte et béton, Brique, Tissu, Verre, Sol, Métal, Motifs, Plâtre, Plastique, Couverture, Couleurs unies, Pierre,
Carrelage, Bois). Choisir une vignette active la Peinture ; cliquer l'aperçu n'ouvre pas d'éditeur. obs. Planche :
« Dans le modèle » et création d'un matériau d'apparence (nom, couleur) (C15) ; la bibliothèque « Parcourir » de
SketchUp (textures `*_1K`) n'est pas reprise — une bibliothèque Fadi demande des fichiers sous licence admise
(décision P-8). Matériau par défaut présent ; aucun matériau `Ty_*` (C3, §3.6).

### 6.5 Styles — *Styles* — **non relevé** (chargement sans fin, contenu vide dans le DOM)

Commandes vues dans la recherche (obs) : arêtes visibles {on}, arêtes arrière {off, K}, profils {on}, profondeur {off},
prolongements {off}, extrémités {off}, tremblé {off}, couleur des arêtes (identique, par axe, par matériau), ciel {on},
sol {off}, filigranes {on}, X-ray {off}, modes de face (filaire, lignes cachées, ombré, ombré texturé, monochrome).
Planche : ces bascules comme options d'affichage (R10) ; composition du panneau à relever (§9, L-1).

### 6.6 Balises — *Tags*

Barre : Visibilité générale (œil), Créer une balise (+), Créer un dossier (grisé), Trier (A↓Z), Couleur par balise,
Purger ; recherche « Rechercher des balises… » ; liste vide au départ (« Sans balise » non listée). « Créer une
balise » : nom prérempli « Tag1 » (Planche : « Balise 1 »), couleur (grille ~ 9 par ligne), motif de trait (une
douzaine : plein, tirets, pointillés, tiret-point…), Annuler / OK. Ligne : bande de couleur, œil, nom, menu ⋮
(Appliquer, Modifier, Supprimer). Choisir une balise active l'outil Balise. obs. Correspondance calques : P-9.

### 6.7 Ombres — *Shadows*

Bascule Ombres (off) ; Sur les faces (on), Au sol (on), Depuis les arêtes (off), Utiliser le soleil pour l'ombrage
(off) ; fuseau (libellé « UTC-7:00 », réglé par Add Location) ; Heure : curseur 0–600 (406 ≈ 13 h 30), bornes affichées
6:44 – 16:44 ; Date : curseur 1–365 (312 = 8 novembre), échelle des mois ; Lumière 0–100 (80) ; Ombre 0–100 (45) ;
Brouillard : afficher (off), couleur du fond (on), distance (curseur double) ; Add Location. obs [CP]. Interprétation du
curseur horaire (minutes depuis le lever, 600 = coucher) : déduite des bornes, nv. Planche : position et fuseau =
parcelle déclarée, sinon soleil « non évalué » (C13) ; ombres = option d'affichage (R10) sauf si enregistrées dans une
scène.

### 6.8 Scènes — *Scenes*

Barre : Ajouter une scène, Mettre à jour la scène active, Lire l'animation, Réglages d'animation. Caméra : Perspective /
Projection parallèle / Perspective à deux points (exclusifs) ; Champ de vision 0–120, **défaut 30** ; Vues standard :
Plan (dessus), Élévation sud (avant), est (droite), nord (arrière), ouest (gauche), Dessous, Iso ; Mes scènes (liste +
Ajouter). Réglages d'animation : transitions (on), durée 0–100 s (2), délai 0–100 s (1), OK. obs [CP].
**Contradiction** : champ de vision par défaut 30 (Scènes) contre 35,00° (outil Zoom, [MCP §2]) — §9, L-12. Planche :
une scène = définition enregistrée par commande, comme les vues 3D (D-053) ; « sud / nord » = nord du quadrillage
cadastral (D-017), dit dans le panneau.

### 6.9 Affichage — *Display*

Réafficher : Tout / Sélection / Dernier ; Voir : objets masqués (off), géométrie masquée (off), couleur par balise
(off), plans de coupe (off), coupes (on, + nombre 1–20, défaut 3), remplissage de coupe (on), axes (on), nord
géographique (off), guides (on) + « Supprimer tous les guides » ; Édition de composant : masquer le reste du modèle
(off), masquer les composants similaires (off). obs [CP]. **Contradiction** : la recherche donnait « View Section
Planes {on} » ([MCP §8.3]) — §9, L-12. Sens exact du nombre 1–20 attaché à « coupes » : nv. Nord géographique : C13.

### 6.10 Adoucir / lisser — *Soften / Smooth*

Adoucir les arêtes coplanaires (off) ; Lisser les arêtes (off) ; messages « Aucune arête adoucie » / « Aucune arête
lissée » ; Angle : curseur 0–180, **défaut 30** (la documentation donne 20 pour la version bureau : la valeur relevée
fait foi). obs [CP].

### 6.11 Info modèle — *Model Info*

Unités de longueur : format Mètre, précision `0,00 m`, accrochage de longueur (on, 0,01 m) ; aire : m², `0,00 m²` ;
volume : m³, `0,00 m³` ; angles : précision `0,0`, accrochage d'angle (on, 15°) ; Texte écran : Architects Daughter
Regular 9, « Mettre à jour tous les textes écran » ; Texte avec repère : Architects Daughter Regular 9, extrémités
(aucune, barre, flèche ouverte, flèche fermée, point), aligner (écran / épingle), « Mettre à jour… » ; Cotes :
Architects Daughter Regular 12, aligner (au-dessus / centré / à l'extérieur / écran), extrémités, « Mettre à jour
toutes les cotes ». obs [CP]. Géolocalisation, statistiques, crédits : nv. Planche : ces réglages sont des données de la
Planche (commandes), sauf la précision d'affichage (préférence, R10).

### 6.12 Outliner — *Outliner* (absent de l'offre gratuite) et Solid Inspector

Outliner : arbre des groupes, composants et plans de coupe (doc). Planche : le **Navigateur** de l'Atelier (D-156)
affiche l'arbre des contextes de la Planche (recherche, visibilité, déplier, cibler, supprimer, comme
`cahier-sketchup-web.md` §1.2-6) — lot 5. Solid Inspector (détection d'erreurs de solide, doc) : la Planche dit pourquoi
un groupe n'est pas un solide (arêtes bordant ≠ 2 faces, nommées) dans Info entité — lot 6.

---

## 7. Menu principal, réglages, barres

### 7.1 Menu principal ☰ (relevé, survol seulement) — obs [MCP §6]

| Entrée relevée | Planche |
| --- | --- |
| Accueil | Retour au projet (Fadi) |
| Nouveau | Nouvelle Planche dans le projet (lot 7 ; P-1) |
| Ouvrir ▸ Trimble Connect, Mon appareil | Ouvrir une Planche du projet ; Trimble Connect non reproduit (C17) |
| Enregistrer sous | Copie de la Planche (lot 7) |
| Partager | Partage Fadi (existant) |
| Importer ▸ Trimble Connect, Mon appareil ; Status dashboard | Import : formats à décider (P-6) |
| Exporter ▸ 3DS, Collada, DWG ▸ (3D, 2D, Section Slice), DXF ▸ (idem), FBX, KMZ, OBJ | Export : IFC (lot 7) ; autres formats à décider (P-6) |
| Télécharger ▸ SKP, PNG, STL | PNG de la vue (lot 7) ; SKP non (format propriétaire) ; STL : P-6 |
| Réglages de l'application | §7.2 |
| Ajouter un emplacement | Non reproduit : la parcelle du projet fait foi (C13) |
| Imprimer | Impression de la vue (Documents de l'Atelier pour les feuilles) |

### 7.2 Réglages (fenêtre « Settings », onglets) — obs [MCP §7]

| Onglet | Réglages relevés (défauts) | Planche |
| --- | --- | --- |
| Général | Sauvegarde automatique (on), minutes entre deux sauvegardes (5), purger les inutilisés (Toujours / **Demander** / Jamais) ; poignées de rotation de Déplacer (on) ; Langue (English, 12 langues) ; Gabarit par défaut (**Decimal - Meters** ; 7 gabarits) ; Réinitialiser tout | Enregistrement : celui de l'Atelier (chaque lot validé est enregistré, R9) — pas de minuterie ; poignées de rotation : préférence locale ; langue : C1 ; gabarit : mètre (P-4) |
| Accessibilité | 5 couleurs d'axes et d'inférences (§5.1) ; Réinitialiser tout | Préférence locale |
| Navigation | Périphérique Souris / Trackpad ; deux doigts = Orbite (grisé en souris) ; prise en charge 3Dconnexion (off) ; inversion Zoom (off), Orbite et Panoramique (grisés en souris) ; sensibilité −3 à 3 (0) ; Réinitialiser tout | Existant D-157 (sensibilité 0,25 à 4) ; correspondance d'échelle : P-11 ; 3Dconnexion : non reproduit (nv) |
| Graphismes | moteur classique (off), amélioration automatique des matériaux (off), métallicité 0,1, rugosité 0,5 (grisés), réinitialiser les messages | Non reproduit (rendu three.js de Fadi, R14) |
| Mémoire | usage (« 0,7 % de 4 Go »), alerte à 75 %, effacer l'historique d'annulation (off), purger (grisé), Optimiser (grisé) | Non reproduit (fadi) ; l'historique est le journal de l'Atelier |

Pas d'onglet Raccourcis : les raccourcis se règlent dans la recherche (§4.35). obs.

### 7.3 Barres

Barre du haut : §3.1. Barre du bas : §3.5. Barre de gauche et grille : §3.2–3.3. Aide « Need Help? » : Centre d'aide,
Forums, Rechercher → aide de Fadi, recherche d'outils (fadi). Fenêtre « Choisissez votre périphérique » : existante
(D-157).

---
## 8. Plan par lots

Un lot à la fois ; acceptation du maître d'ouvrage entre deux lots (MO-5). Chaque lot : fiches « spécifiée » avant le
code (R8) ; à la fin, fiches à l'état « prototype » ou « vérifiée », compte rendu `docs/planche/lots/lot-N.md`,
`npm run typecheck`, `npm test`, `npm run build` verts, scénario de bout en bout et CI verts avant la demande
d'acceptation (R19) ; recettes existantes de l'Atelier toujours vertes (rien de cassé). Numérotation propre à la
Planche (« lot Planche N ») ; elle ne remplace pas celle des lots de l'Atelier.

### Lot 1 — Noyau pur `packages/planche-model` (sans interface)

| Tâche | Livrable | Fiche |
| --- | --- | --- |
| L1.1 | `vecteur.ts` : vecteurs, plans, tolérances, transformations (existant à compléter et tester) | PL-01-01 |
| L1.2 | `geometrie-libre.ts` : sommets, arêtes, faces planes trouées, courbes, contextes (racine, groupes) ; ajout d'arêtes avec fusion, découpe et faces automatiques ; effacement ; différences exactes (inverse) ; contrôle d'invariants ; sérialisation canonique | PL-01-01 |
| L1.3 | `saisie-vcb.ts` : analyse de la grammaire §5.3, paramétrée par la locale ; formatage d'affichage | PL-01-02 |
| L1.4 | `inference.ts` : candidats d'inférence (points, linéaires, surfaces), verrous (flèches, Maj, cycle Alt), priorité déterministe | PL-01-03 |
| L1.5 | `catalogue-outils.ts` : catalogue déclaratif des 45 outils du §4 (les 44 de la liste du maître d'ouvrage et Diviser ; la Recherche, commande d'interface, n'y est pas) avec étapes, consignes, libellés, saisies, modificateurs, inférences, statut, renvoi | PL-01-04 |
| L1.6 | `index.ts`, `README.md`, tests vitest ; paquet inscrit au script `test` racine | — |

Critères d'acceptation du lot : CA-L1-1 aucun import hors `allowedDependencies: []` (contrôle de modularité vert) ;
CA-L1-2 tests des quatre fiches verts (cas chiffrés vérifiables à la main) ; CA-L1-3 sérialisation canonique stable
(deux sérialisations d'un même état = mêmes octets) ; CA-L1-4 toute opération suivie de son inverse rend l'état
initial (égalité de sérialisation) ; CA-L1-5 le catalogue couvre chaque outil du §4 et chaque entrée a un statut et un
renvoi ; CA-L1-6 typecheck, test, build et scénario de bout en bout verts, aucune interface modifiée.
Détail : `docs/planche/lots/lot-1.md`.

### Lot 2 — Rendu three.js, outils de dessin et champ Mesures dans le mode Planche

- **Livrables** : `ModeTravail` « planche » dans l'Atelier (bouton à côté de Plan / 3D / Documents), disposition
  Canevas (D-156) ; vue three.js WebGL2 (R14) qui dessine le maillage libre (faces, arêtes, sélection, aperçus,
  inférences, axes pleins / pointillés) ; machines d'états **pures** des outils dans `packages/planche-model/outils/`
  (le rendu ne fait que les afficher) ; barre d'état `aria-live`, champ Mesures (§5.3) ; outils §4.1–4.14 et §4.35 ;
  Orbite, Panoramique, Zoom (navigation D-157) ; barre de modificateurs au toucher (C18, P-12) ; brouillon local
  déclaré (C6).
- **Fiches** : PL-02-xx (une par outil ou famille), dont la machine d'états de chaque outil.
- **Critères** : CA-SEL, CA-LAS, CA-GOM, CA-LIG, CA-MLV, CA-REC, CA-RTO, CA-CER, CA-POL, CA-ARC, CA-A2P, CA-A3P,
  CA-SEC, CA-T3D (si P-7 tranchée), CA-RCH, CA-CAM-1/2 ; recette Playwright desktop et émulation mobile : ouvrir la
  Planche, choisir Ligne au clavier (L), tracer un carré avec `4` Entrée ×4 → une face ; au toucher, le même avec la
  barre de modificateurs ; aucun `POST /commands` émis (brouillon) ; axe-core sans violation critique ou sérieuse ;
  modes Plan / 3D / Documents inchangés (recettes existantes vertes).

### Lot 3 — Outils de modification

- **Livrables** : Pousser / tirer, Déplacer (copie, tampon, réseau, étirement d'arête et de sommet, pliage), Rotation
  (réseau polaire, pente), Échelle (26 poignées), Décalage, Suivez-moi, Retourner, Diviser ; collage complet après
  transformation (fusion, découpe des faces coplanaires, §5.4).
- **Critères** : CA-PPT, CA-DEP, CA-ROT, CA-ECH, CA-DEC, CA-SUI, CA-RET, CA-DIV ; invariants (planarité, étanchéité
  quand elle existait) contrôlés après chaque opération ; correction au champ Mesures après coup = un seul pas.

### Lot 4 — Mesure, annotation, caméra

- **Livrables** : Mètre (guides, points de guide, mesure, redimensionnement de la Planche confirmé), Cotes (linéaires,
  diamètre), Rapporteur, Axes (repère de saisie, R5), Texte (repère, écran), Plan de coupe (actif, inverser),
  Zoom étendu, Zoom fenêtre, Positionner la caméra, Regarder autour, Marcher.
- **Critères** : CA-MET, CA-COT, CA-RAP, CA-AXE, CA-TXT, CA-CPE, CA-CAM-3/4 ; aucun outil de caméra ne change la
  révision (R10) ; un lecteur mesure sans écrire (R13).

### Lot 5 — Groupes, composants, matériaux, balises, panneaux

- **Livrables** : Créer un groupe / un composant (boîte relevée), édition en contexte (délavé, axes locaux, Échap),
  occurrences liées, Rendre unique, Éclater, Intersection des faces avec le modèle ; Peinture, Prélever, Balise ;
  matériaux d'apparence (C15) ; panneaux §6 (Info entité, Composants, Instructeur, Matériaux, Styles — bascules
  relevées, Balises, Ombres, Scènes, Affichage, Adoucir / lisser, Info modèle, Navigateur en arbre) ; menu contextuel
  §5.8.
- **Critères** : CA-PEI, CA-PRE, CA-BAL ; Pousser / tirer dans une occurrence → l'autre occurrence suit ; Rendre unique
  → seule elle change ; Éclater d'une boîte → 18 entités libres ; deux groupes chevauchés ne collent pas ; matériau du
  groupe affiché sur les faces sans matériau seulement.

### Lot 6 — Solides par manifold-3d

- **Livrables** : détection de solide (Info entité « Groupe solide », motifs de refus nommés) ; Coque extérieure,
  Intersection, Union, Soustraction, Découpe, Scission ; conversion maillage libre ↔ maillage triangulé
  (`MeshGL` de manifold-3d) et retour en faces planes polygonales ; manifold-3d chargé à la demande (jamais au chemin
  d'ouverture, D-013), version épinglée ; adaptateur injecté dans `planche-model` (le noyau reste testable sans WASM) ;
  mesure du déterminisme navigateur / Node (même entrée → même résultat) avant de décider où la commande est recalculée
  (cahier Atelier §10.2).
- **Critères** : CA-COQ, CA-BOO ; « booléen de maillage » écrit dans la fiche et l'aide (MO-4) ; temps mesurés
  imprimés (`⏱`), aucun chiffre promis avant mesure.

### Lot 7 — Persistance par commandes, IFC, recette

- **Livrables** : commandes Planche dans le contrat de l'Atelier (version de contrat incrémentée), validées par le
  serveur avec les mêmes réducteurs purs, idempotentes, journalisées, inversibles (R9) ; file hors ligne, annuler /
  rétablir et réservations existants (MO-2) ; migration du brouillon local vers le projet (proposée, jamais imposée) ;
  archive de projet (classe nouvelle revalidée à l'import) ; export IFC (`IfcBuildingElementProxy`, C14) validé par
  IfcOpenShell en CI ; menu principal (§7.1) ; recette Playwright desktop + émulation mobile du parcours complet ;
  axe-core.
- **Critères** : une opération = une entrée de journal ; rejouer un `requestId` ne l'applique pas deux fois ;
  `baseRevision` périmée → 409 ; hors ligne → file, reprise à la reconnexion ; IFC relu par web-ifc : nombre de proxies
  et volumes égaux à ceux de la Planche ; recette verte ; décision P-1 appliquée.

---

## 9. Lacunes du relevé à combler

Chaque lacune est à relever en direct avant que le comportement soit codé comme un fait ; sinon le lot livre un choix
Fadi déclaré. Lot concerné entre parenthèses.

| # | Lacune | Source | Lot |
| --- | --- | --- | --- |
| L-1 | Panneau **Styles** : contenu non relevé (chargement sans fin, vide dans le DOM). | [MCP §4.6], [CP §1] | 5 |
| L-2 | Ombres : sens du curseur horaire 0–600, effet d'« Ajouter un emplacement », fuseau. | [CP] | 5 |
| L-3 | Coordonnées absolues `[x,y,z]` et relatives `<x,y,z>` au champ Mesures : non confirmées (les crochets ne sont pas passés). | [OD §4] | 2 |
| L-4 | Effets d'**Alt** : étirement de Pousser / tirer, pliage automatique de Déplacer, chevauchement du Décalage, périmètre de Suivez-moi. | [OM Lacunes 4] | 3 |
| L-5 | **Maj** avec Déplacer et Rotation ; Maj de Rectangle, Cercle, Mètre, Rapporteur. | [OM], [OD] | 2–4 |
| L-6 | Retourner : clic simple (miroir en place) non mis en évidence (objet symétrique). | [OM §7] | 3 |
| L-7 | Rotation autour d'un axe quelconque (cliquer-glisser du rapporteur). | [OM §3] | 3 |
| L-8 | Coque extérieure : nombre exact d'entités du résultat, nature de la couture (adoucie ou masquée). | [CM §2] | 6 |
| L-9 | **Bouton du milieu** (orbite), Maj + milieu (panoramique), double-clic molette (recentrer) : non testables par l'automatisation. | [MCP §3] | 2 |
| L-10 | Touche **Z** sans effet dans l'essai (outil lancé depuis la grille). | [MCP §2] | 2 |
| L-11 | Mètre : boîte de **redimensionnement du modèle** non affichée. | [MCP §1.1] | 4 |
| L-12 | Contradictions : champ de vision par défaut 30 (Scènes) / 35,00° (Zoom) ; plans de coupe visibles off (Affichage) / on (recherche). | [CP], [MCP §2, §8.3] | 4–5 |
| L-13 | Gestion des panneaux : empilement de plusieurs panneaux [MCP §4] ou un seul à la fois [CP] ; largeurs min / max de `Resize panel` ; état après `Hide panels`. | [MCP §4], [CP §0] | 5 |
| L-14 | Rapporteur : création du guide angulaire non confirmée à l'écran. | [MCP §1.3] | 4 |
| L-15 | Cote de **rayon** d'un arc non testée ; changement de type (rayon / diamètre). | [MCP §1.2] | 4 |
| L-16 | Peinture d'une **présélection**, d'une arête, du verso ; onglet Parcourir ; arêtes ajoutées **dans** le composant par Intersection des faces. | [CM §1, §6] | 5 |
| L-17 | Composant : effets de « Coller à », « Découper l'ouverture », « Toujours face à la caméra », « Définir les axes du composant ». | [CM §3.3] | 5 |
| L-18 | Gomme : Ctrl + Maj ; effacement par glisser avec modificateur ; surbrillance pendant le glisser. | [CM §4] | 2 |
| L-19 | Main levée : Ctrl ± sur la courbe, face sur boucle fermée, pas d'échantillonnage. | [OD §13] | 2 |
| L-20 | Inférences « Demi-cercle », « Section dorée », « Intersection », « Centre » (couleur), « Prolongement d'arête », inférences dans un groupe (magenta) ; valeurs négatives du Rectangle ; `3;` / `;3`. | [OD], [DOC §7] | 2 |
| L-21 | Aspect du rectangle de sélection (plein / pointillé) et curseurs selon le modificateur. | [OD §1] | 2 |
| L-22 | **Intersection, Union, Soustraction, Découpe, Scission** : jamais observés (grisés en offre gratuite) — consignes et résultats à relever sur une offre qui les active, ou spécifiés d'après la documentation et déclarés. | [OD §15.6], [DOC §3.8] | 6 |
| L-23 | Texte avec repère : texte par défaut sur une arête (longueur ?) et un sommet (coordonnées ?) ; le texte d'aire suit-il la face ? | [MCP §1.5] | 4 |
| L-24 | Marcher : déplacement, vitesse, collisions. | [MCP §2] | 4 |
| L-25 | Effacer l'arête commune de deux faces coplanaires : fusion en une face ? | [DOC §8] | 2 |
| L-26 | Saisie non reconnue au champ Mesures (ex. `abc`) : réaction de SketchUp. | — | 1–2 |
| L-27 | Texte 3D : alignement, styles autres que Regular. | [OD §14], [DOC §2.8] | 2 / 5 |
| L-28 | Info modèle : géolocalisation, statistiques, crédits ; ordre des onglets. | [CP] | 5 |
| L-29 | Raccourcis sur clavier AZERTY (touche `Maj+-`, `Q`, `A`, `Z`, `W`). | — | 2 |
| L-30 | Bouton « Edit » de la grille (personnalisation, emplacements récents). | [OD §0], [DOC §0] | 2 |
| L-31 | Tolérance de fusion des sommets et des faces coplanaires de SketchUp. | — | 1 |
| L-32 | Plan de coupe : boîte nom + symbole à la pose (doc) non vue ; plusieurs coupes actives selon le contexte. | [MCP §1.6], [DOC §4.6] | 4 |
| L-33 | Cercle « lisse » après Pousser / tirer (arêtes latérales adoucies ?). | [DOC §2.5] | 3 |
| L-34 | Polygone : saisie `Ns` ; Arc 2 points : saisie `Nr` (rayon). | [DOC §2.6–2.7] | 2 |
| L-35 | Lasso : contour libre par cliquer-glisser ; inversion du sens dans les préférences. | [OD §2] | 2 |
| L-36 | Menu contextuel : effets d'Orienter les faces, Inverser les faces, Souder, Trouver le centre, Convertir en polygone, Aligner la vue / les axes, Aire ▸. | [OM §10], [CM §8] | 3–5 |
| L-37 | Orientation (recto / verso) d'une face créée sur le sol ou dans un plan quelconque. | — | 1–2 |

Les relevés de `docs/planche/reference/` ne sont pas modifiés par ce cahier ; un nouveau relevé s'ajoute en nouveau
fichier daté dans ce dossier.

---

## 10. Décisions restant au maître d'ouvrage

Aucune ne bloque le lot 1 (noyau pur) : le noyau est paramétré là où une décision manque. Chaque décision tranchée est
consignée dans `docs/atelier/decisions.md`.

| # | Question | Proposition du chef de projet | Lot qui en dépend |
| --- | --- | --- | --- |
| P-1 | **Rattachement de la Planche au projet** : une ou plusieurs Planches par projet ? rattachées à un niveau ? visibles dans les modes 3D et Documents ? | Plusieurs Planches nommées par projet ; chacune a un contexte racine en repère `local` et, facultativement, un niveau de référence (origine en altitude) ; affichées en 3D comme des représentations en lecture seule ; aucune présence dans les métrés. | 7 (2 pour le libellé) |
| P-2 | **Services externes** non reproduits (3D Warehouse, Trimble Connect, AI Assistant, AI Render, Photoreal, Environments). | Hors périmètre (cahier Atelier §10.1-8). | 2 |
| P-3 | **Séparateurs du champ Mesures** (C22). | Locale française : virgule décimale, point-virgule de liste ; point décimal admis. | 2 (grammaire paramétrée dès le lot 1) |
| P-4 | **Unités anglo-saxonnes** `'` et `"` (C21). | Acceptées en saisie avec conversion exacte ; affichage toujours métrique. | 2 |
| P-5 | **Échap** en mode Planche (C23) : comportement relevé de SketchUp, différent de D-156. | Comportement relevé (étape 1, outil gardé ; caméra → outil précédent). | 2 |
| P-6 | **Formats d'échange** autres qu'IFC (SketchUp : 3DS, Collada, DWG, DXF, FBX, KMZ, OBJ, STL, PNG ; import SKP, JPG, PNG). | Lot 7 : IFC et PNG seulement ; OBJ / STL (simples, sans dépendance) à décider ; DWG et SKP exclus (formats propriétaires). | 7 |
| P-7 | **Polices** du Texte 3D, des cotes et des textes (Architects Daughter et 14 autres, licence OFL hors liste admise). | Ouvrir la licence OFL pour des **fichiers de police** (non liés au code) ou ne livrer qu'une police sous licence admise ; Texte 3D reporté au lot 5 tant que ce n'est pas tranché. | 2 / 5 |
| P-8 | **Bibliothèque de matériaux** (« Parcourir ») : textures fournies ? | Pas de bibliothèque au lot 5 (couleurs unies créées par l'utilisateur) ; une bibliothèque demande des fichiers sous licence admise et sourcés. | 5 |
| P-9 | **Balises = calques** de l'Atelier ? | Oui : une balise de la Planche est un calque existant (visibilité, verrou, dossiers = calques imbriqués) ; pas de second système. | 5 |
| P-10 | **Conversion** d'une forme libre en objet de bâtiment (mur, dalle, solide de l'Atelier). | Hors périmètre des lots 1–7 ; si ouverte, ce sera une commande explicite qui crée un objet paramétrique et retire la forme (jamais deux géométries canoniques, R15). | — |
| P-11 | **Sensibilité de navigation** : échelle −3…3 de SketchUp contre 0,25…4 de D-157. | Garder D-157 (existant) ; afficher la correspondance (−3 ↔ 0,25, 0 ↔ 1, 3 ↔ 4, interpolation géométrique déclarée). | 2 |
| P-12 | **Barre de modificateurs au toucher** (C18), écart propre à Fadi. | La livrer au lot 2 (sans elle, la moitié des outils est inutilisable au doigt). | 2 |
