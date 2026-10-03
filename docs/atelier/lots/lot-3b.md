# Lot 3b — Nouvel Atelier : 3D WebGL2, pousser / tirer, toucher, vues techniques — compte rendu

Exécuté le 3 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010).

Ouvrir : `?module=atelier&version=nouveau`, bouton « 3D » de la barre (three.js n'est chargé qu'à ce moment).

## Fait

| Tâche | Résultat |
| --- | --- |
| L3b.1 | `packages/atelier-model/src/projection/maillage.ts` (pur, sans three.js) : maillage de chaque classe depuis ses paramètres canoniques — murs creusés par leurs ouvertures hébergées (vides par intervalle le long de l'axe), portes et fenêtres (vitrage translucide), dalles et toitures (prisme du contour avec trous, triangulation par oreilles et ponts), escaliers (une marche par contremarche, rampe seule si le nombre n'est pas renseigné), poteaux orientés, solides fermés ou chemins épaissis, pièces et espaces en surfaces teintées. Conventions verticales du moteur V14 reprises (niveau haut prioritaire, `decalageBase`) ; **hauteur non évaluée = aucun volume** (R2). Coupe plan ∩ maillage (`couper`). `apps/web/src/modules/atelier/nouveau/vue3d/` : scène three.js 0.186.1 (WebGL2 par défaut ; WebGPU en option par `three/webgpu` avec repli), tampons groupés par niveau et matériau avec table triangle → objet pour la sélection, cache par objet (un objet inchangé n'est pas remaillé), rendu à la demande, orbite / panoramique / zoom (OrbitControls), présentations bâtiment / niveau actif / éclaté, coupe horizontale réglable, sélection au clic synchronisée avec le plan et l'inspecteur (Maj pour ajouter). |
| L3b.2 | Outil « Pousser / tirer » (U) : clic sur un mur, poteau, solide, dalle ou toiture, glisser vertical ; aperçu orange recalculé par le même maillage pur, valeur affichée, une seule commande `objet.modifier` au relâchement (arrondi au centimètre, D-012 ; un mur poussé quitte son niveau haut pour prendre la hauteur saisie). Outil « Extruder l'esquisse » : rectangle, cercle, polygone ou polyligne fermée → `solide.extruder` de la hauteur de l'outil. Manipulation directe en plan (DA-02-17) : glisser un objet déjà sélectionné le déplace, saisi par un point remarquable et posé avec les accrochages, aperçu transparent et distance, une commande `transformer.deplacer`. |
| L3b.3 | Toucher : un doigt tourne, deux doigts zooment / déplacent, toucher sélectionne (contrôlé au téléphone par événements tactiles réels) ; réglages 3D sur une ligne défilante à 390 px, cibles de 40–44 px. Mesures `⏱` imprimées par la recette (ci-dessous) ; budget de trame publié par `window.fadiMesures3D` (temps CPU de chaque rendu, appels de dessin, triangles, moteur). |
| L3b.4 | Vues techniques de travail : plan (dessus, coupe à 1,20 m réglable, niveau actif et inférieurs), coupes nord–sud et est–ouest à position réglable, façades nord / sud / est / ouest — caméra orthographique et plans de coupe sur les maillages de `atelier-model`, arêtes vives ; sans export (lot 5). |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 93, **atelier-model 42** dont 9 nouveaux — triangulation concave / à trous, volume exact d'un mur creusé par une porte et une fenêtre, niveau haut, hauteur absente sans volume, marches d'escalier, coupe verticale, P.118 complet — API 65, **web 20**) · `npm run build` ✅.
- Recette `apps/web/e2e/atelier-nouveau.mjs` (36 contrôles, verte trois fois de suite) — ajouts du lot : passage en 3D, image non vide en WebGL2, rendu groupé, **7 niveaux × 3 présentations sans vue vide**, plan / 2 coupes / 4 façades rendus, orbite (≥ 30 images, p95 < 16 ms), pousser / tirer d'un mur (hauteur > 3 m enregistrée), manipulation directe en plan enregistrée, sélection au toucher et orbite / pincement au téléphone, aucune erreur JavaScript.
- `⏱` (Chromium headless, rendu logiciel SwiftShader de cette machine — un vrai GPU fait mieux) :
  - passage en 3D (chargement de three.js, maillage des 1 753 objets du P.118) → première image : 1,7 à 2,0 s ;
  - orbite sur le P.118 complet : temps CPU de rendu par image médiane 2,8–3,2 ms, **p95 4,5–6,5 ms** ; moins de 400 appels de dessin ;
  - sélection d'un mur au clic → inspecteur : 43–62 ms ; glisser un mur d'un mètre → enregistré : 340–390 ms ;
  - pousser / tirer → hauteur enregistrée (geste compris) : 1,8–2,0 s.
- Captures : `docs/atelier/captures/3b-*.png` (bâtiment, coupe nord–sud, façade sud, pousser / tirer, téléphone).

## Défaut corrigé pendant la recette

- Le niveau actif de la vue 3D était recopié dans un état local : un changement de niveau suivi aussitôt d'un changement de présentation pouvait afficher l'ancien niveau. Le niveau actif est désormais lu directement dans l'état d'affichage partagé, et la vue se recadre quand il change en présentation « niveau actif ».

## Non fait / reporté

- **WebGPU** : branché (option « WebGPU », repli WebGL2) mais **non testé** : aucun adaptateur WebGPU dans le Chromium du bac à sable (même constat qu'en P0). Aucun chiffre annoncé.
- Coupes : les volumes coupés ne sont pas « bouchés » (on voit l'intérieur des murs coupés) ; le remplissage de coupe et les hachures arrivent avec les documents (lot 5).
- Jonctions de murs (L / T / X) : chaque mur reste une boîte ; les recouvrements aux angles sont visibles en 3D comme en plan. À traiter avec les représentations du lot 5.
- Manipulateur 3D à poignées (déplacer / tourner un objet dans la vue 3D) : seul pousser / tirer existe en 3D ; le déplacement se fait en plan.
- Toitures monopente / bipente : dessinées plates (le type et la pente sont conservés dans le modèle).
- Bundle : la vue 3D est un fragment chargé à la demande de 0,79 Mo (three.js compris), le moteur WebGPU un autre fragment de 0,72 Mo chargé seulement si l'option est cochée.
