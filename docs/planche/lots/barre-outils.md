# Planche — bouton « Outils ▾ », barres d'opérations, raccourcis Fadi — compte rendu

**Statut : code livré sur la branche `ccr-3e5cc0f1-rs46ph-outils` (10 octobre 2026) ; tests unitaires, API (base
PostgreSQL locale) et recettes navigateur exécutés ici ; CI GitHub et acceptation du maître d'ouvrage en attente.**
Décision : **D-198** (demande du maître d'ouvrage du 10 octobre 2026, design convenu avec lui). Cadre : cahier-planche §3
(anatomie de l'écran), D-195 (barre de l'Atelier, barre d'actions flottante), D-192 (téléphone).

## Ce qui est livré

```
Outils ▾                                   bouton de la barre du haut de la Planche, comme « Plan » (D-195)
 ├─ ⌕ Rechercher un outil…                 Entrée active le premier outil retenu
 ├─ ▾ Sélection / Dessin / Modification…   un groupe par famille du catalogue, même structure : flèche + nom
 │   ├─ ╱ Ligne · L ▸          ☐ afficher  le NOM déplie la barre d'opérations ; la case la pose sur le dessin
 │   │    [① Créer] │ [② Modifier] │ [③ Mesurer / annoter]
 │   └─ …
 └─ ⚙ Barres d'outils                      barres affichées (décocher pour masquer) + « Réinitialiser la disposition »
```

| Sujet | Résultat | Fichiers |
| --- | --- | --- |
| Bouton « Outils ▾ » | Dans la barre du haut de la Planche, après le menu ☰ et la pastille du brouillon (la rangée de l'Atelier de D-195 reste **Fichier · Plan · 3D · Documents · Planche · ⚙ · état**). Un clic ouvre la liste sous le bouton ; Échap (sans atteindre la Planche : ni fin de tracé ni outil précédent), un clic ailleurs, un nouveau clic ou le choix d'une icône la referment. `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`. | `planche/BoutonOutils.tsx`, `Planche.tsx` |
| Liste | Champ « Rechercher un outil… » (libellé français ou de référence, identifiant, raccourci ; Entrée active le meilleur résultat : exact, puis début de libellé, puis ordre de la liste) ; un groupe par famille, dans l'ordre de `FamilleOutil` du catalogue (Sélection, Dessin, Modification, Mesure, Annotation, Caméra, Solides, Matière), la famille de l'outil actif dépliée à l'ouverture ; une ligne par outil : pictogramme, nom, `· raccourci`, flèche ▸ / ▾ (déplie / replie la barre dans la liste) et case « afficher » (`menuitemcheckbox`). L'outil actif est surligné (liseré bleu, `aria-current`) dans les lignes et dans les barres. Rôle `menu` ; flèches haut / bas, Début, Fin d'un élément à l'autre (champ compris), flèche droite / gauche pour déplier / replier, Entrée, Échap ; focus visible (contour bleu). Au téléphone, surcouche fixe posée sous le bouton. | `BoutonOutils.tsx`, `planche.css` |
| Barre d'opérations | Trois sections, toujours dans le même ordre : **① Créer** (façons de créer ce genre de géométrie, variantes), **② Modifier** (opérations applicables), **③ Mesurer / annoter**. Chaque opération est un outil existant du catalogue ; l'icône appelle `choisirOutil`, exactement comme le rail de gauche (outil grisé : même message « prévu au lot … »). Correspondance pure et testée. | `planche/barres-outils.ts` (+ test) |
| Homogénéité | Chaque opération montre **son** pictogramme (table de `outils-planche.ts`, aucun pictogramme partagé — test) et « Nom — raccourci » en infobulle et en nom accessible (« Ligne — L ») ; même pictogramme, même raccourci dans toutes les barres. | `outils-planche.ts`, `barres-outils.ts` |
| Raccourcis | Chaque outil a désormais un raccourci : relevé SketchUp inchangé (catalogue), **couche Fadi** pour les 26 outils sans raccourci relevé (table ci-dessous), lue par le clavier de la Planche (`outilDuClavier` : catalogue d'abord, puis couche Fadi) ; titres du rail « Nom (raccourci) » et liste de la recherche (Maj + -) affichent le raccourci effectif. | `outils-planche.ts`, `Planche.tsx` |
| Barres flottantes | Case « afficher » : la barre de l'outil flotte sur le dessin (`position: fixed`, z-index 5 comme la barre d'actions : au-dessus du dessin, sous les menus, la grille et les panneaux qu'on ouvre ; le dessin garde ses dimensions). Poignée ⠿ : souris et doigt (capture du pointeur), flèches (16 px, 64 px avec Maj) ; toujours entière dans la zone visible (bornage pur repris de `barre-actions-position.ts` : au relâchement, au redimensionnement, à la rotation, sous le clavier virtuel). Position par défaut : empilées sous la barre du haut, à droite du rail d'outils. ✕ masque (décoche « afficher »). Outil actif surligné (`aria-pressed`). Elles vivent dans la racine de la Planche : elles suivent la Planche détachée. | `planche/BarreOutilsFlottante.tsx`, `planche/barres-outils-disposition.ts` (+ test) |
| Mémoire | `etat-ui.ts` : `barresOutils` (`visibles` dans l'ordre d'affichage, `positions` par outil) dans les préférences de l'appareil (`fadi.atelier.prefs`, même mécanisme que la barre d'actions, relecture défensive `lireBarresOutils`). « Réinitialiser la disposition » efface les positions, garde l'affichage. | `etat-ui.ts` |
| Téléphone (≤ 760 px) | Une seule barre rendue — la dernière affichée —, rangée en bas, juste au-dessus du volet, sur toute la largeur (défilement horizontal dans la barre), cibles de 44 px, poignée retirée. La barre d'actions (position par défaut) s'écarte au-dessus d'elle. | `barres-outils-disposition.ts`, `BarreOutilsFlottante.tsx`, `Planche.tsx` |
| Existant | Rail d'outils de gauche, grille « ⋯ », recherche, barre des touches modificatrices, barre d'actions et tous les attributs `data-*` inchangés ; nouveaux attributs : `data-planche-outils-bouton`, `data-planche-outils-liste`, `data-outils-recherche`, `-famille`, `-outil`, `-afficher`, `-barre`, `-section`, `-operation`, `-barre-visible`, `-reinitialiser` ; `data-barre-outils`, `data-barre-outils-poignee`, `-operation`, `-fermer`, `data-barre-outils-docquee`. | — |
| Bilingue | Textes en français dans le code ; anglais en tête de `apps/web/src/lib/i18n/en.json` (35 entrées, dont les motifs `Maj+{0}` → `Shift+{0}` et `Alt+Maj+{0}` → `Alt+Shift+{0}`, et dix libellés d'outils du catalogue qui n'avaient pas de traduction : Rectangle pivoté, Arc 2 points, Arc 3 points, Secteur, Pousser/Tirer, Faire pivoter, Décalage, Suivez-moi, Retourner). | `en.json` |

## Correspondance outil → barre

Chaque outil est rattaché à un **objet** ; les outils d'un même objet partagent la même barre (homogénéité). Tous les
outils du catalogue (45, tous présents dans la Planche : rail, grille, Diviser offert dans la grille) sont couverts.

| Objet | Outils | ① Créer | ② Modifier | ③ Mesurer / annoter |
| --- | --- | --- | --- | --- |
| Arêtes | Ligne, Main levée, Arc, Arc 2 points, Arc 3 points, Diviser, Gomme | Ligne, Main levée, Arc 2 points, Arc, Arc 3 points | Déplacer, Pousser/Tirer, Décalage, Diviser, Faire pivoter, Échelle, Retourner, Suivez-moi, Gomme | Mètre, Cotation, Rapporteur, Texte |
| Surfaces | Rectangle, Rectangle pivoté, Cercle, Polygone, Secteur, Décalage | Rectangle, Rectangle pivoté, Cercle, Polygone, Secteur | Pousser/Tirer, Suivez-moi, Décalage, Déplacer, Faire pivoter, Échelle, Retourner, Pot de peinture, Gomme | Mètre, Cotation, Rapporteur, Texte |
| Volumes | Pousser/Tirer, Suivez-moi, Texte 3D | Pousser/Tirer, Suivez-moi, Texte 3D | Déplacer, Faire pivoter, Échelle, Retourner, Décalage, Pot de peinture, Gomme | Mètre, Cotation, Plan de coupe, Texte |
| Sélection | Sélectionner, Lasso, Déplacer, Faire pivoter, Échelle, Retourner | Sélectionner, Lasso | Déplacer, Faire pivoter, Échelle, Retourner, Pot de peinture, Gomme | Mètre, Rapporteur, Cotation, Texte, Balise |
| Solides | Enveloppe extérieure, Intersection, Union, Soustraction, Ajuster, Scinder | Union, Soustraction, Intersection, Enveloppe extérieure | Ajuster, Scinder, Pousser/Tirer, Déplacer, Faire pivoter, Échelle, Retourner | Mètre, Cotation, Plan de coupe, Texte |
| Matière | Pot de peinture, Prélever la matière | Pot de peinture, Prélever la matière | Sélectionner, Lasso | Mètre, Texte, Balise |
| Guides de mesure | Mètre, Rapporteur, Axes | Mètre, Rapporteur, Axes | Déplacer, Faire pivoter, Gomme | Cotation, Texte, Plan de coupe, Balise |
| Annotations | Cotation, Texte, Plan de coupe, Balise | Cotation, Texte, Plan de coupe, Balise | Déplacer, Faire pivoter, Gomme | Mètre, Rapporteur, Axes |
| Caméra | Orbite, Panoramique, Zoom, Zoom étendu, Zoom fenêtre, Positionner la caméra, Regarder autour, Marcher | Positionner la caméra, Regarder autour, Marcher | Orbite, Panoramique, Zoom, Zoom fenêtre, Zoom étendu | Mètre, Plan de coupe |

## Raccourcis

Relevé SketchUp (catalogue, **inchangé**) : Sélectionner Espace · Lasso Maj+Espace · Gomme E · Ligne L · Rectangle R ·
Cercle C · Arc 2 points A · Pousser/Tirer P · Déplacer M · Faire pivoter Q · Échelle S · Décalage F · Pot de peinture B ·
Mètre T · Orbite O · Panoramique H · Zoom Z · Zoom étendu Ctrl+Maj+E · Zoom fenêtre Maj+W.

**Couche Fadi (écart Fadi déclaré, D-198)** — `RACCOURCIS_FADI`, `outils-planche.ts` :

| Raccourci | Outil | | Raccourci | Outil |
| --- | --- | --- | --- | --- |
| Maj+A | Arc | | Maj+O | Rapporteur |
| Maj+B | Balise | | Maj+P | Polygone |
| Maj+C | Cotation | | Maj+R | Rectangle pivoté |
| Maj+D | Diviser | | Maj+S | Soustraction |
| Maj+E | Enveloppe extérieure | | Maj+T | Texte |
| Maj+F | Suivez-moi | | Maj+U | Union |
| Maj+G | Scinder | | Maj+V | Retourner |
| Maj+H | Arc 3 points | | Maj+Y | Axes |
| Maj+I | Intersection | | Maj+Z | Texte 3D |
| Maj+J | Ajuster | | Alt+Maj+P | Positionner la caméra |
| Maj+K | Plan de coupe | | Alt+Maj+L | Regarder autour |
| Maj+L | Main levée | | Alt+Maj+M | Marcher |
| Maj+M | Prélever la matière | | | |
| Maj+N | Secteur | | | |

Règles tenues (test `barres-outils.test.ts`) : la couche ne vise que les outils dont le raccourci relevé vaut `null`, et
tous ; aucun raccourci partagé entre deux outils ; aucun ne reprend une touche propre à la Planche (G composant, K arêtes
arrière, Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y, Ctrl+G, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+S, Ctrl+K, Ctrl+Maj+I, Maj+- recherche) ; aucun ne commence une saisie au
champ Mesures (`commenceSaisie` accepte X majuscule : **Maj+X est exclu**, Maj+W est déjà Zoom fenêtre ; Maj+Q reste
libre) ; chaque raccourci active son outil par `outilDuClavier`. Alt + lettre est relu sur la touche physique (`code`)
quand Option de macOS change le caractère (Alt+Maj+P donne « ∏ ») ; une lettre lisible dans `key` reste prioritaire
(AZERTY). Pendant une saisie au champ Mesures, les lettres continuent d'aller au champ (inchangé).

## Contrôles

- `npm run typecheck` ✅ · `npm test` : planche-model 47 ✅, web 125 ✅ (dont 13 nouveaux : `barres-outils.test.ts` 8,
  `barres-outils-disposition.test.ts` 5), core-geometry, domain-model, geometry-exact ✅, atelier-model 468 ✅ (un test
  documents a dépassé son délai une fois sous charge, vert relancé seul), API 98 ✅ avec une base PostgreSQL + PostGIS
  locale et les limites de débit de la CI (`AUTH_RATE_LIMIT=500`, `API_RATE_LIMIT=5000`) · `npm run build` ✅.
- Recette `apps/web/e2e/planche-barre-outils.mjs` (ordinateur 1536 × 864, téléphone 390 × 844 tactile, anglais) : 53 ✅,
  dont axe-core sans violation critique ou sérieuse (liste ouverte, barre affichée / rangée). Ajoutée à la CI.
- Non-régression rejouée en local sur la version livrée : `planche-boutons` 62 ✅, `planche` 54 ✅, `atelier-barre` 56 ✅,
  `planche-detachee-documents` 23 ✅, `interface-anglais` 7 ✅.

## Limites (déclarées)

- Correspondance outil → barre : choix du chef de projet sur la demande (exemple de Ligne donné par le maître d'ouvrage) ;
  pour les outils qui ne créent pas de géométrie (transformations, caméra, matière), « ① Créer » range les variantes de
  l'objet sur lequel ils agissent (Sélectionner / Lasso, points de vue, application de matière). À relire par le maître
  d'ouvrage.
- Raccourcis Fadi : Maj + lettre envoie d'abord Maj enfoncée à l'outil actif (touche d'état relevée, §5.5), puis change
  d'outil — sans effet durable ; Alt + Maj peut, sous Windows, basculer la disposition du clavier si le système est
  configuré ainsi (combinaison du système, hors de portée de la page). Ils ne sont pas personnalisables (la personnalisation
  D-158 concerne les outils du plan 2D de l'Atelier).
- Les barres flottantes sont propres à la Planche (pas aux modes Plan / 3D de l'Atelier) ; une barre par outil, même si
  deux outils du même objet ont le même contenu.
- Téléphone : barre rangée non déplaçable (rangement imposé par la demande) ; clavier virtuel couvert par le bornage
  (zone visuelle) mais pas éprouvé sur appareil réel.
