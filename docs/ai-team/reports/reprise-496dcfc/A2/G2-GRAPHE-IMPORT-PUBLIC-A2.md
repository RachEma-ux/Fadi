# G2 — graphe statique de l’import public polygonArea

**Conclusion : point d’entrée public viable statiquement sous conditions.** Code étudié au SHA `5e0285d37f23c7c539502664036f0a2ff0986409` (référence DEC18), annexe G2 lue comme artefact de travail A0 non commité (baseline de travail `b1023605b965b27ff56fabf179756592673c98d4`, empreinte de l’artefact distincte dans JSON). Aucune affirmation de HEAD distant courant. Le diff du package entre a4caaab et cette référence est vide.

`@parcours/core-geometry` expose uniquement `./src/index.ts`. Son graphe runtime comporte quatre modules :

- index → geometry, parcel-geometry, site-zoning, par réexportations statiques ;
- site-zoning → parcel-geometry, import de polygonArea/signedArea ;
- deux imports **type-only** Point2 vers geometry sont effacés, distincts des quatre arêtes runtime.

Les quatre sources sont intégralement lues. Aucune dépendance runtime externe, aucun import dynamique, cycle, top-level await ou appel applicatif à l’import identifié. Les seules initialisations sont fonctions/fermetures, table de couleurs et table littérale de taux de zonage. L’import nommé est analysé sans supposer un tree shaking des autres réexportations.

Aucun React, accès DOM global, WASM, worker, DB, réseau ou IO dans ce graphe d’import. `window.V14Geometry` figure dans les commentaires de provenance. La lib TypeScript DOM et l’interface FaceCanvas n’activent pas le DOM. **drawFaces a des effets de rendu et trie son argument si appelée**, mais elle n’est pas appelée à l’import. Le package entier ne doit donc pas être déclaré pur pour tout usage.

Le futur runner doit résoudre l’entrée TypeScript ESM et ses chemins relatifs `.js` vers les sources `.ts`. Le mode TypeScript `Bundler` n’est pas un chargeur runtime. Ni un appel plain Node, ni la présence de dist, ni les hooks du runner ne sont vérifiés ici. Si cette résolution publique n’est pas disponible dans le périmètre autorisé, le sous-point reste bloqué : aucun import profond ni copie du moteur.

polygonArea appelle seulement signedArea puis Math.abs ; le POC doit lui fournir des tableaux synthétiques ordinaires de points finis, avec unités et repère contrôlés explicitement. Cette fonction ne valide pas les identités, droits, versions, simplicité du polygone, trous ou conformité normative. Les rectangles 6×2 et 7×2 restent des cas analytiques futurs, pas des tests exécutés.

Les conclusions MTR01 A3/A6 sont confirmées pour cette frontière ; la réserve transitive est instruite pour ces quatre modules seulement. Provenance de l’extraction et absence de licence locale explicite restent les réserves documentaires A6, sans consultation DrawAll. Les onze autres moteurs ne sont pas revus par cette pièce.

Avant exécution : autorisation G2 applicable, SHA final vérifié, commande/runner et confinement revus A5/A6, réseau effectivement refusé constaté par A6. Cette revue ne ferme aucune porte et n’autorise aucun POC. Aucun code applicatif importé, construit ou exécuté ; aucune DB ou service lancé. Le JSON fournit les fichiers, blobs, empreintes et citations brutes.
