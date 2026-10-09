# Lot P2-8 — Automatisation P2 et recette P2 — compte rendu

Exécuté le 9 octobre 2026 (chef de projet, exécution continue avec décisions déléguées, D-183 ; décisions prises
consignées en D-190). Cadre : `docs/atelier-cahier-p2.md` §5 (lot P2-8), §8 ; T19 (scripts et IA contrôlés) ; R3 (rien
d'inventé). Fiches : DA-19-03 (Dynamo), DA-19-04 (Grasshopper), DA-19-05 (Knowledgeware) — à l'état **prototype** ;
DA-19-01 et DA-19-02 : extensions mises à jour. Dossier de recette P2 : `docs/atelier/recette-p2.md`.

Critère du cahier : « graphes visuels de génération contrôlée et règles par ontologie, même boucle que le lot 8 ;
recette P2 complète, T01 à T20 rejouées, protocole T17 / T18 » — joué par la recette `apps/web/e2e/p2-automatisation.mjs`
sur P.118-A : graphe intégré « Trame de poteaux contrôlée » dessiné (17 nœuds, 22 liens) ; règle du graphe non tenue →
proposition échouée nommée, rien d'écrit ; paramètres corrigés → proposition par la même boucle que l'assistant (essai à
blanc, hypothèses, aperçu) → accord → 4 poteaux ; graphe composé dans l'éditeur visuel, déposé dans le projet, proposé ;
règle par ontologie sur les murs : problèmes rattachés aux murs minces, levés dès qu'un mur change, rien corrigé.

## Fait

| Tâche | Résultat |
| --- | --- |
| Graphes de génération (DA-19-03, 04) | `src/automatisation/graphes.ts` : `GrapheGeneration` (nœuds `parametre`, `calcul`, `serie`, `niveaux`, `regle`, `commande` ; liens = qui lit quoi), `validerGraphe` (identifiants, liens, **aucun cycle**, chaque variable lue reliée à un ancêtre, 3 séries au plus, au moins une commande, `interne.*` refusées), `ordonner` (Kahn), `ancetres`, `compilerGraphe` → `ScriptAtelier` du lot 8 (calculs inlinés, séries et commandes en ordre topologique), `controlerReglesGraphe`, `generateurGraphe` (aucune correction automatique : un refus est nommé), `proposerGraphe` (règles d'abord, puis `boucleControlee`) ; deux graphes intégrés (`trame-poteaux-controlee` avec règles géométriques section < pas et 400 poteaux au plus ; `ossature-de-mur` : `ossature.creer` puis `ossature.generer`, ontologie bois). `src/commandes/graphes.ts` : définitions `graphe` du projet (`graphe.definir`, `graphe.supprimer`, versionnées avec le modèle, archive vérifiée). |
| Règles par ontologie (DA-19-05) | `ParamsRegle.classe` ; `regle.definir { classe }` (classe du socle ou d'une ontologie **active**, famille et classe exclusives) ; `src/automatisation/regles-classes.ts` : `valeursObjet` (nombres, grandeurs, un niveau d'imbrication, niveau porteur), `controlesClasses`, `controlerReglesClasses` branché après chaque commande dans `appliquerCommande` — problème `regle` par objet non tenu (`pb-regle-<regle>-<objet>`), objets « non évalués » dits une fois sans valeur inventée, rien corrigé. |
| Interface (`apps/web`) | `panneaux/Graphes.tsx` : choix du graphe (intégrés + projet lus dans le modèle local), **vue SVG** du graphe (nœuds colorés par type, liens fléchés, nœud choisi détaillé, clavier), paramètres, « Proposer (aperçu à blanc) » → proposition affichée dans le bloc de l'assistant (« graphe de génération »), accord par le même bouton ; `EditeurGraphe` : ajout de nœuds par type, formulaire du nœud choisi, déplacement au pointeur, liens origine → arrivée, verdict à mesure par le même code que le serveur, nœud fautif surligné, « Enregistrer dans le projet » (`graphe.definir`). `panneaux/Regles.tsx` : liste des règles avec bilan (objets, non tenus, non évalués), formulaire (nom et source, classe parmi les ontologies actives, comparaison avec variables lisibles proposées, message). 61 clés `en.json`. |
| API (`apps/api`) | `GET /atelier/graphes` (intégrés + projet), `POST /atelier/graphes/:id/proposer` (proposition enregistrée dans `atelier_propositions`, `generateur: graphes-fadi/1`, acceptée / refusée par les routes de l'assistant) ; `atelier-automatisation-p2.test.ts` : liste, échec nommé (409 à l'accord), proposition puis accord (journal « Assistant : Graphe « … » v1 »), graphe du projet mal câblé refusé 400, droits 403 ; règles par ontologie : problèmes rattachés servis par `/problemes`, rien corrigé, ontologie inactive 409. |
| **Recette** (`apps/web/e2e/p2-automatisation.mjs`, en CI) | 23 contrôles verts (détail ci-dessus) ; un seul écran, un seul journal ; téléphone 390 px ; axe-core sans violation. |
| Recette P2 complète | `docs/atelier/recette-p2.md` : ce qui est livré (P2-0 à P2-8), contrôles automatiques, **T01 à T20 rejouées** avec les preuves P2, essais §12, parcours guidé, décisions ouvertes, limites déclarées ; T17 / T18 : protocole `protocole-mesures.md` inchangé, mesures à faire par le maître d'ouvrage. |
| Correction P2-6 (relecture CI) | Le corps de coordination d'un terrain épais est un prisme par triangle du semis (plus l'enveloppe entre ses z extrêmes qui faisait « contenir » la gaine passant au-dessus du terrain) ; terrain d'épaisseur nulle : aucun corps. Poussé sur la PR #99 (fb29cd1). |

## Contrôles

- `npm run typecheck` ✅ · tests `atelier-model` 467 (dont 9 `p2-8-automatisation.test.ts`), `geometry-exact` 22, web 106,
  API 97 (dont 2 `atelier-automatisation-p2.test.ts`) ✅ · `npm run build` ✅ · recettes `p2-automatisation.mjs`,
  `atelier-automatisation.mjs` (lot 8, non régressée) et `interface-anglais.mjs` vertes ici ; les autres recettes P2
  tournent en CI (`.github/workflows/ci.yml`, job `e2e`).
- Definition of Done P2 §8 : (1) aucune ontologie nouvelle (graphes et règles au socle de l'automatisation) ✅ ;
  (2) aucune ontologie n'en importe une autre (inchangé ; `regles-classes.ts` lit `CLASSES` du socle) ✅ ; (3) aucune
  constante normative : les règles intégrées sont géométriques, toute règle métier vient du projet avec sa source (R3) ✅ ;
  (4) matrice : définitions `graphe` et `regle` déclarées hors IFC ✅ ; (5) fiches prototype.

## Non fait (déclaré)

- **Graphes** : import de graphes Dynamo (`.dyn`) ou Grasshopper (`.gh` / `.ghx`) — équivalent fonctionnel seulement ;
  nœuds de lecture du modèle (sélections, mesures), nœuds de documents, sous-graphes, câblage par glisser-déposer entre
  ports, aperçu 3D avant proposition.
- **Règles** : règles entre objets (distances, comptes), règles sur des quantités dérivées, bibliothèque de règles sourcées
  importable, rapport de conformité, correction proposée (toujours sous accord).
- **Fournisseur de modèle de langage** : décision §10.1 inchangée ; la génération reste déterministe (règles de Fadi,
  scripts, graphes).
- **T17 / T18** : protocole fourni, mesures sur utilisateurs et appareils réels à faire par le maître d'ouvrage.
