# REP-09 — requalification de l'annexe A de REF-02 (moteurs) : lecture statique et tests exécutés

**Tâche :** REP-09 (checklist, ligne 105). **Source :** REF-02 `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`, blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, « Annexe A. État observé de Fadi — non normatif ».
**Audit historique :** `3bcda9296eaa0a0376ca5d2279dd71f52a75184b` (14 octobre 2026). **Requalification :** `817bd36e7d4b1ab60ab9c00309509c7cdfed0798` (18 octobre 2026).
**Détail par observation** (chemins, blobs aux deux commits, citations fichier:ligne, écarts, limites) : [`REP-09-REQUALIFICATION.json`](REP-09-REQUALIFICATION.json).

## Méthode

1. **Lecture statique.** Chemins résolus par `git ls-tree` aux deux commits ; blobs comparés par `git rev-parse <sha>:<chemin>`. Chaque constat cite des lignes au `817bd36`, vérifiées par échantillon. Une ligne a été corrigée (`scene3d.ts:298` → `:301`).
2. **Tests exécutés.** Seuls des tests unitaires purs ont été lancés (vitest), sans base, API, navigateur ni réseau. Ils portent sur des fonctions pures voisines des composants. Ils ne prouvent ni le rendu GPU, ni le service worker, ni les performances.

Constat global : **aucun fichier source des 14 observations n'a changé entre l'audit et `817bd36`.** Sous `apps/` et `packages/`, six fichiers ont changé entre les deux commits, et uniquement dans des commentaires ou des README ; le seul qui concerne une observation est `apps/api/src/db/schema.ts` (OBS-13, ligne 301 de commentaire).

## Verdicts

| OBS | Composant | Verdict statique | Écart principal | Tests unitaires exécutés ici |
|---|---|---|---|---|
| 01 | Plan2D.tsx, rendu.tsx | confirmé | un élément SVG mémoïsé par objet ; pas de canvas | oui (`nouveau.test.ts`) |
| 02 | accrochage.ts | confirmé | balayage linéaire, aucun index spatial ; références externes tronquées à 20 000 traits | oui (`nouveau.test.ts`) |
| 03 | scene3d.ts | confirmé | le « batching » est une fusion manuelle de tampons (clé niveau, couleur, opacité, classe, groupe ; `scene3d.ts:301`), pas `BatchedMesh` ni `InstancedMesh` | **aucun test n'existe** |
| 04 | scene3d.ts | confirmé | `majModele()` reconstruit tous les lots et toutes les arêtes à chaque état ; `majStyles` aussi | **aucun test n'existe** |
| 05 | vue-planche.ts | confirmé | WebGL2 seul (pas de WebGPU) ; surcouche DOM | oui (`planche.test.ts`, fonctions pures) |
| 06 | planche-model outils/index.ts | confirmé | import statique interne au paquet ; la Planche elle-même est chargée à la demande | oui (registres, sélection) |
| 07 | moteur-exact.ts + worker | confirmé | après une erreur fatale, le worker n'est jamais recréé dans la session ; aucun délai d'attente | oui (`geometry-exact`, pas le worker) |
| 08 | generation-client.ts | confirmé | repli sur le fil principal ; modèle entier copié à chaque demande | oui (`documents.test.ts`, pas le worker) |
| 09 | historique.ts, delta.ts | confirmé | chaque pas est aussi une commande `planche.operation` ; l'en-tête de `historique.ts:4` est périmé | oui (`delta`, `planches`, `planche`) |
| 10 | vite.config.ts, sw.js | confirmé | le précache inclut les morceaux paresseux ; ni `.wasm` OCCT ni WebGPU | **aucun test n'existe** |
| 11 | catalogues | **partiellement confirmé** | Atelier : 111 entrées et 110 identifiants, collision `echelle` (lignes 84 et 120 de `outils.ts`), confirmés. **Planche : 52 entrées** (47 littérales et 5 outils solides générés, lignes 1273–1297), et non 47. | oui (`catalogue-outils`, `barres-outils`) |
| 12 | p0/p2-mesures.md | confirmé (documenté) | 1 199 → 24 appels mesurés sur une scène de banc en `InstancedMesh`, pas sur le code actuel de `scene3d.ts` ; rendu logiciel SwiftShader | non reproductible ici (mesure GPU) |
| 13 | monorepo | confirmé | `schema.ts` : commentaire seul | sans objet |
| 14 | commandes / documents | confirmé | révision de base, 409 si elle n'est pas à jour, journal annuler / rétablir, versions, imports / exports | oui (`versions`, `planches` purs) ; **tests API non lancés** |

## Tests réellement exécutés (`817bd36`, 18 octobre 2026)

| Espace | Fichiers | Résultat |
|---|---|---|
| `apps/web` | `nouveau.test.ts`, `planche/planche.test.ts`, `planche/barres-outils.test.ts`, `planche/registre-commandes.test.ts` | 106/106 réussis |
| `packages/planche-model` | `catalogue-outils`, `outils/registre-formes`, `outils/selection`, `delta` | 48/48 réussis |
| `packages/atelier-model` | `documents/documents`, `versions`, `commandes/planches` | 22/22 réussis |
| `packages/geometry-exact` | `index` | 22/22 réussis |

**Non exécutés :**

- `apps/api/src/routes/*.test.ts` : ils exigent PostgreSQL, et M02 interdit la suite destructive sans cible jetable attestée ;
- `apps/web/e2e/*.mjs` : ils demandent API, base et navigateur ;
- `scene3d.ts`, `moteur-exact.ts`, `exact.worker.ts`, `generation-client.ts` et `vite.config.ts` n'ont aucun test.

## Conséquences pour les décisions et les lots

- **DEC-09** (index spatial) et lot C : OBS-02 est confirmé, et un grep ne trouve aucune grille ni quadtree. La non-régression devra s'appuyer sur les tests d'accrochage existants (`nouveau.test.ts`).
- **DEC-10** (invalidation 3D) et lot C : OBS-04 montre une reconstruction complète, et **aucun test** ne couvre `scene3d.ts`. C'est un manque à combler avant toute optimisation.
- **DEC-07** (morceaux et cache) : OBS-10 et OBS-06 ; le contenu réel des morceaux n'a pas été mesuré (aucun build analysé ici).
- **Lot D** (Workers, WASM, résilience) : OBS-07 et OBS-08 donnent des critères précis : redémarrage du worker, délai d'attente, annulation, coût de la copie du modèle.
- **Registre des outils (lot B)** : le compte Planche historique (47) est à corriger à 52 dans toute reprise. La collision `echelle` de l'Atelier demeure ; `OUTILS_PAR_ID` ne retient que la seconde entrée.

## Limites

- Ce travail n'évalue ni performance, ni GPU, ni WebGPU, ni taille des morceaux, ni le comportement réel du service worker.
- Les tests unitaires cités vérifient des fonctions pures. Ils ne valent pas recette des moteurs.
- Les comptes d'OBS-11 sont **statiques** : ils comptent des déclarations, pas des outils utilisables de bout en bout.
- L'observation OBS-12 reste un résultat historique documenté.
