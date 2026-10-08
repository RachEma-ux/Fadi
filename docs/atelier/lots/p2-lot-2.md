# Lot P2-2 — Mécanique et assemblages, porte P1 → P2 — compte rendu

Exécuté le 8 octobre 2026 (chef de projet, exécution continue avec décisions déléguées, D-183 ; décisions prises
consignées en D-184). Cadre : `docs/atelier-cahier-p2.md` §1 (porte), §4, §5 (lot P2-2), §8 ; D-178 (solveur écrit),
D-180 (catalogues sourcés), D-181 (projet mixte P.118-M). Fiches : DA-10-01 à 09, 13 à 16 ; DA-05-17, 18 ; DA-06-03 à
06, 09, 10 — à l'état **prototype** ; DA-05-08, 10, 13, 16 **reportées** (déclarées).

## Fait

| Tâche | Résultat |
| --- | --- |
| Ontologie activable par projet (cahier P2 §4, T01) | `Ontologie` étendue à `mechanical` ; `ONTOLOGIES_ACTIVABLES`, `ontologiesActives(etat)` ; `etat.ontologies` (modèle, persisté en `atelier_site.ontologies`, archivé, différentiel d'annulation) ; commandes `ontologie.activer` / `ontologie.desactiver` (refusée tant qu'un objet de l'ontologie existe) ; **toute création d'une classe d'une ontologie inactive est refusée** (précondition nommée) ; navigateur : section « Ontologies » (case à cocher = commande du journal) ; palette et barre : les outils d'une ontologie n'apparaissent qu'activée, à leur famille (maquette P2-0 respectée : aucun écran, aucun ruban). |
| Modèle `packages/atelier-model/src/ontologies/mechanical/` | `solveur.ts` : code produit du banc P2-0 (Levenberg-Marquardt, jacobienne par différences finies, rang, diagnostics ; 100 itérations, 5 µm) ; une pièce qu'aucune contrainte ne touche garde sa pose ; redondance comptée au rang indépendant des liaisons (un parallélisme en produit vectoriel n'est pas « redondant »). `liaisons.ts` : encastrement, pivot, glissière, rotule, coïncidence, concentricité, parallélisme, angle, distance, plan → contraintes élémentaires, ddl déclarés, pilotage (angle, course). `geometrie.ts` : pose rigide, repère d'assemblage, maillage posé, emprise convexe. `familles.ts` : familles paramétriques (expressions `evaluer`, cycles et divisions par zéro refusés), configurations, règles (comparaisons). `index.ts` : réducteurs `pieceMecanique.*`, `assemblage.*` (créer, modifier, supprimer, rattacher, numéroter), `liaison.*` (créer, modifier, piloter, supprimer), `famille.definir` / `configurer`, `regle.definir`, `regles.controler`, `catalogue.importer` ; contrôle après commande (assemblage déplacé → pièces reposées ; liaison orpheline → problème). |
| Classes | `piece-mecanique` (géométrie **copiée** de sa source — brep et maillage d'un solide exact, maillage dérivé d'un solide ou d'un poteau —, matériau déclaré, référence, numéro, pose rigide dans l'assemblage, emprise dérivée ; géométrie non modifiable par paramètre), `assemblage` (repère : position, angle, z ; numéro ; diagnostic du solveur), `liaison` (type, deux pièces du même assemblage, références locales, valeur pilotée, état, ddl). Maillage 3D, plan (emprise, repère de l'assemblage), accrochage et sélection sur l'emprise, transformations (assemblage déplacé / tourné ; pièce d'assemblage : refus nommé « déplacer l'assemblage ou piloter une liaison » ; miroir et échelle refusés), références (centre), reprise (famille `mecanique`), annexe C. |
| Documents, IFC, coordination | Tableau **« Nomenclature des assemblages »** (DA-10-14 / 15 : assemblage, n°, référence, pièce, matériau, volume, quantité, niveau, liaisons ; masse « non évaluée » sans densité sourcée) → document CSV du catalogue. Vue axonométrique **éclatée** (`eclate` : assemblage, distance) avec bulles numérotées (DA-10-16), posable sur une feuille. IFC : `IfcElementAssembly` (Tag = numéro, `Fadi_Assemblage` : repère, liaisons, diagnostic) agrégeant ses pièces (`IfcRelAggregates`) ; pièce = proxy tessellé posé (`Fadi_Piece`) ; matrice d'échanges complétée. Interférences : une pièce est un corps (prisme de son emprise convexe, déclaré comme enveloppe) contrôlé contre tout corps du bâtiment ; **collision « piece-batiment »** listée avec les collisions d'architecture (panneau des modifications, `/problemes`), jamais corrigée. |
| Interface (`apps/web`) | `panneaux/Mecanique.tsx` : outils **Pièce mécanique** (sources sélectionnées, assemblage, matériau, fixe), **Assemblage** (nom, numéro, pièces sélectionnées, centre de la sélection), **Liaison** (deux pièces, type, références, valeur) ; fiches pièce (référence, assemblage, matériau, volume, masse non évaluée, pose, source, liaisons), assemblage (pièces, liaisons, diagnostic, repère, **pilotage de chaque liaison**, numérotation), liaison (type, état, pilotage) ; problèmes « collision pièce / bâtiment » et « règle » ; 54 clés anglaises (recette anglaise 0,07 % de résidus). |
| API (`apps/api`) | Colonne `atelier_site.ontologies` (init.sql, idempotent) ; lecture / écriture dans `atelier-modele.ts` ; `atelier-mecanique.test.ts` : activation persistée, solides exacts du serveur → pièces, assemblage, encastrement + pivot piloté, numérotation, version et comparaison nommant la pièce, nomenclature CSV, IFC, collision, catalogue, famille et règle, désactivation refusée. |
| **Porte P1 → P2** (`apps/web/e2e/porte-p1-p2.mjs`, en CI) | Sur **P.118-M** (copie de P.118) : **26 contrôles verts** — (1) ouverture dans l'Atelier, local hôte « Local technique » trouvé ; (2) activation de la mécanique dans le navigateur, outils dans la palette et la barre, aucune navigation ; (3) CTA : 4 solides exacts calculés par le serveur, assemblage de 4 pièces et 2 liaisons (encastrement, pivot 45°, glissière), « bien contraint », numérotée CTA-01…04, dessinée dans le même plan que le bâtiment ; (4) un mur dessiné dans le local, ventilateur piloté de 45° à 90° depuis la fiche de l'assemblage, Ctrl Z / Ctrl Maj Z sur le même journal ; (5) version « Avant modification », course du panneau 0 → 0,3 m, comparaison nommant la pièce ; (6) feuille A1 plan + éclaté (bulles 1 à 4) + nomenclature, périmée après modification, régénérée (T07) ; (7) un seul IFC avec `IfcWall` et `IfcElementAssembly`, réimport en représentations importées (R16) ; (8) collision gaine provisoire × mur signalée dans `/problemes` et le panneau ; (9) un seul écran, un seul journal, bâtiment inchangé, 390 px, axe-core. Captures `p2-porte-machine.png`, `p2-porte-p1-p2-mobile.png`. |

## Contrôles

- `npm run typecheck` ✅ (dont `check-module-deps` : aucune ontologie n'importe une autre ontologie ; `grep` des
  constantes normatives dans `ontologies/mechanical/` : aucune valeur de catalogue, de densité ni de couple) ·
  tests `atelier-model` 389 (dont 10 `mechanical.test.ts`), API 90 (dont `atelier-mecanique.test.ts`), web ✅ ·
  `npm run build` ✅ · recettes `porte-p1-p2.mjs` 26 / 26 et `interface-anglais.mjs` ✅ ici ; `p2-noyau-exact.mjs`
  inchangée.
- Solveur : cas de référence du banc (pivot 30°, distance seule, deux distances incompatibles) rejoués dans
  `mechanical.test.ts` ; sur la CTA, 2 à 9 itérations, résidu < 5 µm.

## Relecture de la PR #95 (Codex, 8 octobre 2026)

Cinq constats, tous corrigés et couverts par des tests : (1) `init.sql` ajoutait la colonne `ontologies` avant la
création de `atelier_site` sur une base neuve — déplacé après ; (2) une pièce libre rattachée à un assemblage posé
(position, angle, z) sautait du transform de l'assemblage — sa pose est réexprimée dans le nouveau repère
(`changerRepere`, composition des rotations), l'emprise dans le niveau ne bouge pas ; (3) les définitions `famille`,
`regle`, `catalogue` manquaient au schéma d'archive (`ClasseDefinition`, `verifierModele`) — ajoutées, plus de cast ;
(4) une pièce créée depuis un solide exact déplacé ou tourné naissait à l'emplacement canonique — la pose en plan du
solide est cuite dans le maillage copié ; (5) le problème « à réparer » d'une liaison redevenue valide restait affiché —
effacé par le contrôle après commande. Le nom d'étape de la CI contenait « : » non cité (YAML invalide) — cité.

## Non fait (déclaré)

- **Flexiblocs (DA-05-08), cellules (DA-05-10), studios de pièces (DA-05-13), bibliothèques intelligentes
  (DA-05-16)** : reportés (D-184 f) — hors du chemin de la porte ; repris en P2-6 ou P2-8.
- Features mécaniques : limitées aux opérations exactes de P2-1 faites **avant** la pièce (la pièce copie le résultat) ;
  pas d'arbre rejouable sur la pièce elle-même (DA-10-03 prototype partiel, déclaré dans la fiche).
- Composants mécaniques : plusieurs pièces depuis la même source, mais pas de « version suivante qui redéfinit les
  occurrences » (la source est un solide exact, pas une définition) — déclaré dans DA-10-02.
- Liaisons : angle pilotable ambigu au signe (cosinus) ; pas de butées ; une pièce libre sans liaison se déplace comme
  un objet du dessin, une pièce d'assemblage seulement par son assemblage ou une liaison.
- Masse et inerties : « non évaluées » tant qu'aucune densité sourcée n'est fournie (R3) ; cinématique animée : P2-6.
- Réseau (gaines) : P2-5 ; dans la porte, la gaine G1 est une pièce provisoire ; la porte est passée sur le périmètre
  bâtiment + mécanique et sera complétée au lot P2-5.
- Les recettes T01 à T20 ne sont pas rejouées une à une sur P.118-M (la porte en rejoue T01, T02, T05, T06, T07, T13,
  T16) ; le dossier de recette P2 complet est l'objet de P2-8.

## Décisions prises (déléguées, D-183)

Consignées en **D-184** (`decisions.md`) : activation par projet, copie de la géométrie à la création d'une pièce,
solveur dans le réducteur, collision pièce × bâtiment, local hôte au R+1, reports, porte déclarée passée sur le
périmètre bâtiment + mécanique.

## Ce que le maître d'ouvrage peut vérifier et ce qui lui revient

1. Rejouer `porte-p1-p2.mjs` ou, à la main : activer « Mécanique et assemblages » dans le navigateur, créer un solide
   exact, l'outil Pièce mécanique, un Assemblage, une Liaison ; piloter l'angle dans la fiche de l'assemblage.
2. Lire D-184 (reports et correction du local hôte) et, s'il le souhaite, révoquer l'une des décisions déléguées.
3. Le lot suivant (ordre du cahier : P2-3 structure, P2-4 bois et tôlerie, P2-5 réseaux, réordonnables) s'enchaîne en
   exécution continue ; P2-5 complétera la porte avec les gaines.
