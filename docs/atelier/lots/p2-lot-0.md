# Lot P2-0 — Cadrage P2 et porte P1 réduite — compte rendu

Exécuté le 8 octobre 2026 (chef de projet, session unique ; cahier P2 validé et P2-0 seul engagé par D-176 ; décisions
D-177 à D-181 prises sur recommandation). Cadre : `docs/atelier-cahier-p2.md` §5 (lot P2-0), §6 ; `docs/atelier/decisions.md`.

## Fait

| Tâche | Résultat |
| --- | --- |
| Décisions | D-176 (cahier validé, P2-0 seul engagé), D-177 (OCCT : composant LGPL chargé séparément ; liste des licences amendée, cahier Atelier §10.2 et R15), D-178 (solveur écrit, critères de banc), D-179 (DWG / DGN renoncés, déclarés), D-180 (catalogues vides, CSV sourcé), D-181 (projet mixte « P.118-M ») — `decisions.md`, cahier P2 §6 mis à jour (statuts « prise »). |
| Fiches manquantes des entrées P1 livrées | **67 fiches** établies à l'état « disponible (…) — fiche établie en P2-0 » avec preuve liée (tests, recettes, comptes rendus) : DA-06-01 / 02, DA-07-07 / 12 / 22, DA-14 (18), DA-15 (8), DA-16 (15), DA-17-13 / 15, DA-18-01 / 02, DA-19-01 / 02 / 06, DA-21-03 / 08, DA-22-01 / 04 / 05 / 06 ; **DA-22-03 (DWG)** à l'état « spécifiée — renoncée (D-179) » ; les 7 entrées DA-04 retenues au lot optionnel OCCT et jamais livrées (02, 03, 04, 08, 09, 10, 11) sont spécifiées pour **P2-1**. Le compte « disponible » est désormais exact entrée par entrée : 137 fiches disponibles (71 + 66), 1 renoncée. |
| Fiches « spécifiée » des lots P2-1 et P2-2 | P2-1 : les 7 DA-04 ci-dessus + suivi P2-1 sur DA-03-01 (-d) et DA-03-12 ; P2-2 : **25 fiches** (DA-10-01 à 09, 13 à 16 ; DA-05-08, 10, 13, 16, 17, 18 ; DA-06-03 à 06, 09, 10) — `docs/atelier/fiches/`. Total : 164 fichiers dans le dossier (163 fiches + gabarit). |
| Gabarits CSV sourcés et validateur | `docs/atelier/catalogues/` (README + 4 gabarits : profilés acier, tubes et raccords, sections bois, table de pliage ; colonnes `source`, `edition`, `page` obligatoires) ; `packages/atelier-model/src/catalogues/csv-source.ts` (`validerCatalogueCsv`, refus nominatif, fichier non importable dès une ligne refusée, cellule vide = « non évaluée ») ; 6 tests verts, dont la lecture des gabarits du dépôt. |
| Maquette d'activation d'une ontologie | `docs/atelier/maquette/activation-ontologie.html` (statique) ; captures `captures/maquette-activation-ontologie-desktop.png` (1536 px) et `-mobile.png` (390 px) : ontologie mécanique activée → outils dans la palette et la barre à leur famille, classes dans le navigateur et l'inspecteur, problèmes dans le panneau ; outils des ontologies non activées grisés ; aucun écran ni ruban nouveau. **Soumise au maître d'ouvrage.** |
| Banc OCCT dans le navigateur et chaîne de licence | `scripts/bench/occt-browser-bench.mjs` + `occt-browser.html` ; `docs/atelier/p2-mesures.md` §2–3 : le `.wasm` est LGPL-2.1 (README du paquet, chaînes « Open CASCADE » dans le binaire), l'outillage MIT OR Apache-2.0 ; init **111 ms** dans le fil principal, **126 ms** dans un Worker (0,45 s pour spawn + fetch + init + 5 booléens + transfert du maillage) ; **20 / 20 cas difficiles valides** (coplanaires, tangents, minces, 25 trous, révolution, balayage, lissage, congés, coque, fuseAll de 50, résultat vide, compound, tore, section à 45° jugée sur sa topologie : 4 arêtes, périmètre 2 (1 + √2)) ; trois constats pour P2-1 (compound après `fuse`, signatures `Vec3`, point d'entrée Worker du paquet non chargeable hors bundler). |
| Banc du solveur écrit | `scripts/bench/solveur-bench.mjs` ; `p2-mesures.md` §4 : Gauss-Newton amorti (Levenberg-Marquardt), rang de la jacobienne ; **12 / 12 cas de référence résolus en moins de 100 ms** (46 à 78 ms au plus selon l'exécution ; la limite fait partie du verdict du banc, qui sort en échec sinon), **7 / 7 diagnostics** dégénérés corrects ; leçon : angle 0° / 180° à écrire en parallélisme. Critère D-178 satisfait sur le banc déclaré. |
| Banc de la scène mixte | `three-scene.html` variante M (+ `three-bench.mjs --variants`) ; `p2-mesures.md` §5 : bâtiment + CTA (231 maillages) + 2 gaines : triangles × 2,2, draw calls 24 → 255, trame p50 161 → 187 ms en rendu logiciel (p95 dans le bruit), sélection p95 1,0 → 1,6 ms (scène remesurée après correction du raccord des gaines à la relecture de la PR #93) ; conclusion : instancier les pièces répétées par définition. |
| Projet mixte de référence | `docs/atelier/projet-mixte-reference.md` : scénario « P.118-M » (bâtiment inchangé + CTA 4 pièces / 2 liaisons + 2 gaines dont une collision attendue), neuf points de la porte P1 → P2, ce que le maître d'ouvrage valide. **Soumis au maître d'ouvrage.** |
| Porte P1 réduite | `apps/web/e2e/porte-p1-reduite.mjs` (en CI) : **10 contrôles verts** — dans un seul projet et un seul écran : mur au clavier, ligne d'esquisse depuis la palette, Planche nommée avec une face, feuille, version nommée ; aucune navigation hors de l'Atelier ; même journal (révisions successives) ; aucune erreur JavaScript ; 390 px sans défilement horizontal ; axe-core sans violation critique ou sérieuse. Captures `captures/p2-porte-planche.png`, `p2-porte-mobile.png`. **Résultat déclaré : porte partielle, mécanique absente** (la porte complète se joue sur P.118-M à la fin de P2-2). |

## Contrôles

- `npm run typecheck` ✅ · tests `packages/atelier-model` ✅ (dont 6 nouveaux `csv-source.test.ts`) · `npm run build` ✅ ·
  recette `porte-p1-reduite.mjs` ✅ (10 / 10, ici) · bancs reproduits selon `p2-mesures.md` §7.
- Aucune dépendance ajoutée au dépôt : occt-wasm et three sont installés hors dépôt pour les bancs (`BENCH_DIR`).

## Non fait (déclaré)

- Mesures sur GPU réel, appareil de référence et téléphone (comme au lot 0) ; corpus de pièces réelles pour OCCT ;
  solveur au-delà de 20 pièces (`p2-mesures.md` §6).
- Les 25 fiches P2-2 et les 9 fiches P2-1 sont « spécifiée » : aucune ligne de code d'ontologie n'est écrite (P2-0).
- Les trois fichiers de catalogue de départ (D-180) ne sont pas dans le dépôt : ils viennent du maître d'ouvrage avec
  leur source ; les gabarits sont vides.

## Décisions prises (déléguées, 10.2)

Aucune nouvelle : D-176 à D-181 sont du maître d'ouvrage (sur recommandation) ; le chef de projet a consigné en
`p2-mesures.md` les constats techniques (compound après `fuse`, Worker du paquet, angle 0° en parallélisme).

## Ce que le maître d'ouvrage peut vérifier et ce qui lui revient

1. Ouvrir `docs/atelier/maquette/activation-ontologie.html` (et les deux captures) : valider la maquette avant tout code
   d'interface de P2-2.
2. Lire `docs/atelier/projet-mixte-reference.md` : valider le scénario P.118-M (machine, réseau, local hôte).
3. Lire `docs/atelier/p2-mesures.md` : les trois critères (OCCT chargé à la demande, solveur < 100 ms, scène mixte)
   sont tenus sur le banc déclaré.
4. Fournir les trois fichiers de catalogue avec leur source (D-180) avant P2-3 / P2-4 / P2-5.
5. **Décider l'engagement de P2-1** (noyau exact, 3 j) puis de P2-2 (mécanique, 4 j) : un lot à la fois (D-176).
