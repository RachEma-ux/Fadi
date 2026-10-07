# Lot Planche 6 — Solides par manifold-3d — compte rendu

**Statut : code livré sur la branche `planche/lots-4-6` avec les lots 4 et 5 ; recettes navigateur exécutées ici ; CI GitHub
et acceptation du maître d'ouvrage en attente** (7 octobre 2026). Cadre : `cahier-planche.md` §8 (lot 6), §4.22, §4.23,
MO-4 (« booléen de maillage »), D-013 (manifold-3d, Apache-2.0).

## Ce qui est livré

| Tâche | Contenu | Fichiers | Fiche |
| --- | --- | --- | --- |
| L6.1 | **Détection de solide** : `estSolide` (lot 1) + **motifs de refus nommés** (`motifNonSolide` : arête bordant une seule face, trois faces, géométrie vide…) ; `maillageDuSolide` (triangulation par oreilles avec ponts de trous, orientation vers l'extérieur, identifiants de face) ; `facesDuMaillage` (retour en faces planes polygonales : triangles coplanaires et connectés fusionnés, contours, trous, sommets colinéaires retirés) ; `volumeDuMaillage` | `maillage.ts` | PL-06-01 |
| L6.2 | **Enveloppe extérieure**, **Union**, **Soustraction**, **Ajuster** (Découpe), **Intersection**, **Scinder** : six machines d'états pures issues d'une fabrique (`creerMachineSolide`) ; clic 1ᵉʳ solide, clic 2ᵉ solide → `opererSolides` ; refus nommé si l'objet n'est pas un solide ; sans moteur, message « Moteur booléen non chargé » | `outils/solides.ts` | PL-06-01 |
| L6.3 | **Adaptateur manifold-3d** (`AdaptateurBooleens` : union, différence, intersection sur des `Maillage`), injecté par l'interface dans `ContexteOutil.booleens` — le noyau reste testable **sans WASM** (moteur factice dans `materiau.test.ts`) ; chargé **à la demande** au premier choix d'un outil de solides (`import("manifold-3d")`, morceau séparé, jamais au chemin d'ouverture), version **épinglée 3.5.4** | `apps/web/…/planche/booleens-manifold.ts`, `package.json` | PL-06-01 |
| L6.4 | Matières conservées : chaque face du résultat reçoit la matière de la face d'origine qui la contient (même plan) ; le groupe résultat n'a pas de matière d'objet (relevé) | `outils/solides.ts` | PL-06-01 |
| L6.5 | Mesure du **déterminisme** Node (deux exécutions → même modèle) et temps mesuré imprimé (`⏱`) dans `booleens-manifold.test.ts` (vrai moteur, Node) | `booleens-manifold.test.ts` | — |
| L6.6 | Recette `planche-lots-4-6.mjs` : deux boîtes groupées 2 × 2 × 1,5 chevauchées de 1 m, les six opérations puis Ctrl + Z (21 vérifications) | `apps/web/e2e/` | — |

**Non livré** (déclaré) : Info entité « Groupe solide » (panneau du lot 5) — le motif de refus est annoncé dans la barre d'état ;
présélection puis menu contextuel (doc) ; mesure du déterminisme **navigateur / Node** sur la même entrée (la mesure Node est faite,
la comparaison navigateur ↔ Node reste à faire avant de décider où la commande est recalculée, lot 7).

## Critères du cahier et preuves

| Critère | Preuve |
| --- | --- |
| CA-COQ-1 | `booleens-manifold.test.ts` (vrai moteur, Node) : coque de deux boîtes chevauchées de 1 m → un groupe **solide** de **9 m³** (6 + 6 − 3) ± 1e-9 ; `materiau.test.ts` (moteur factice) : même scénario sur des boîtes 2 × 2 × 2 |
| CA-COQ-2 | `materiau.test.ts` : géométrie libre non fermée → refus nommé, rien n'est modifié ; sans moteur → message |
| CA-BOO-1 à -5 | `booleens-manifold.test.ts` : union 9, soustraction 3 (A supprimé), ajuster 3 + 6, intersection 3, scission 3 + 3 + 3 = 9, tolérance 1e-9 ; e2e : les six opérations au navigateur, volumes recalculés depuis le modèle, Ctrl + Z |
| MO-4 | « Booléen de maillage » écrit dans l'adaptateur, la fiche PL-06-01 et ce compte rendu ; aucune exactitude B-Rep promise |
| Temps mesurés | `⏱ coque extérieure (manifold-3d, Node)` imprimé par le test (ordre de grandeur de quelques ms pour deux boîtes, conteneur sans carte graphique) |
| Déterminisme | Deux exécutions de la même coque → `JSON.stringify` identique (Node) |

## Écarts et choix Fadi déclarés

- **Booléen de maillage** (MO-4) : le résultat est un maillage triangulé de manifold-3d reconverti en faces planes ; les faces
  coplanaires connectées sont fusionnées, les arêtes du résultat sont celles du maillage ; aucune garantie d'exactitude B-Rep,
  tolérance de couture celle de manifold (float32 à l'échange).
- **Soustraction / Ajuster** : ordre relevé (le 1ᵉʳ cliqué est l'outil de coupe) ; **Scinder** produit trois groupes (A − B, A ∩ B,
  B − A) ; un morceau vide n'est pas créé.
- Consignes de barre d'état : celles de la Coque pour les cinq autres outils (non relevées, grisées dans SketchUp gratuit).
- Les solides doivent être des **groupes ou composants** à la racine du contexte ; la géométrie libre est refusée avec son motif.
- Le moteur est chargé au premier choix d'un outil de solides (message « Chargement du moteur booléen… » puis outils actifs) ;
  en cas d'échec, message nommé et outils inactifs.

## Ce que le maître d'ouvrage pourra vérifier lui-même

- Planche → `R`, clic, `2;2` Entrée, `P`, clic, `1,5` Entrée, triple-clic, **Ctrl + G** ; même chose décalée de 1 m ; « … » →
  Union (ou Coque, Soustraction, Ajuster, Intersection, Scinder), clic sur la 1ʳᵉ boîte puis la 2ᵉ ; Ctrl + Z ;
- `npm test --workspace=@fadi/web` (`booleens-manifold.test.ts`, temps `⏱`) ; `node apps/web/e2e/planche-lots-4-6.mjs`.
