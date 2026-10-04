# Lot 3a — Nouvel Atelier : socle d'interface, dessin 2D, objets d'architecture : compte rendu

Branche du lot : `lot/3a-atelier`, partie de `atelier/principal` après le lot 2 (PR #50), retour vers
`atelier/principal` (D-020). Cahier : §5.7, §5.8, §7 (lot 3a), maquette validée (D-022).
**État : accepté avec réserves** (2026-10-04, chef de projet par délégation du maître d'ouvrage, D-028 ; D-044).

## Organisation

Phase 0 — interfaces figées par le chef de projet, commitées sur `lot/3a-atelier` avant toute distribution (§9) :
`apps/web/src/modules/atelier/socle/` (`contrats.ts` : outil, session, évènement de plan, aperçu, sélection,
contexte, inspecteur, état de vue, pilote, dessinateurs de plan, `InstallationModule` ; implémentations
`selection.ts`, `interface.ts`, `registre.ts`, `dessin.ts`, `pilote.ts`, `contexte.ts`, testées). Un manque se signale au chef de projet, qui
étend le contrat (ajout seulement) et le consigne.

Vague A, en parallèle : L3a.1 « interface » et L3a.2 « 2D ». Vague B, en parallèle : L3a.3 « architecture » et
L3a.5 « documents simples », qui enregistrent leurs outils dans le registre et dessinent leur aperçu par le
contrat. L3a.4 (intégration) : chef de projet, en continu. Deux équipiers au plus à la fois (mémoire du poste) ;
les contrôles lourds (typecheck d'`apps/web`, build, e2e, axe-core) tournent dans la CI.

## Matrice de propriété

| Zone | Propriétaire |
| --- | --- |
| `apps/web/src/modules/atelier/socle/**` | chef de projet (interfaces figées) |
| `apps/web/src/modules/atelier/ui/**` | équipier « interface » (L3a.1) |
| `apps/web/src/modules/atelier/plan2d/**` | équipier « 2D » (L3a.2) |
| `apps/web/src/modules/atelier/objets/**` | équipier « architecture » (L3a.3) |
| `apps/web/src/modules/atelier/documents/**` | équipier « documents simples » (L3a.5) |
| `apps/web/src/modules/atelier/NouvelAtelier.tsx`, montage dans `routes/ProjectShell.tsx`, `module-registry.ts`, import de P.118 dans le nouveau modèle | chef de projet (L3a.4) |
| `apps/web/e2e/scenarios/14-nouvel-atelier.mjs`, `PLAN` de `e2e/run.mjs`, `e2e/attendu.json` | chef de projet (L3a.4) : les équipiers livrent des tests vitest, le scénario de bout en bout est écrit à l'intégration |
| `docs/atelier/lots/lot-3a.md`, `docs/atelier/decisions.md`, `docs/migration/matrix.md` | chef de projet |

`packages/atelier-model`, `packages/core-geometry`, `apps/api` et `modules/atelier/bus/**` sont figés pour ce
lot : un manque (commande, calcul géométrique) se signale au chef de projet. L'ancien Atelier
(`NativeAtelier.tsx`, `native/**`) reste intact jusqu'au lot 4.

## Avancement

| Tâche | Issue | État |
| --- | --- | --- |
| Phase 0 — socle et contrats figés | — | sur `lot/3a-atelier` (D-033, D-034) ; `socle/socle.test.ts` vert |
| L3a.1 socle d'interface | #51 | fait : PR #56, `ui/ui.test.ts` (D-035, D-037) |
| L3a.2 éditeur de plan 2D | #52 | fait : PR #57, 21 outils, `plan2d/*.test.ts` (D-036, D-037) ; ajuster / prolonger déjà présents, L3a.2b sans objet (D-040) |
| L3a.3 objets d'architecture | #53 | fait : PR #60, `objets/*.test.ts` (D-038, D-039, D-041) |
| L3a.4 intégration | #54 | fait : PR #58 (montage, `?module=atelier&version=nouveau`), PR #61 (modules branchés, D-042 ; scénario 14), PR #62 (captures) |
| L3a.5 continuité des outils (documents simples) | #55 | fait : PR #59, `documents/*.test.ts` |
| L3a.6 clôture | — | fiches du lot (états et preuves liées), matrice, captures, ce compte rendu (D-044) |

Hook `TaskCompleted` retiré à la demande du propriétaire (D-043) : les contrôles lourds font foi en CI.

## Acceptation (cahier §7, lot 3a)

Preuve : scénario `apps/web/e2e/scenarios/14-nouvel-atelier.mjs`, 25 contrôles sur 25, CI de la PR #62
([run 37194672934](https://github.com/RachEma-ux/Fadi/actions/runs/37194672934), jobs validate, e2e, image verts) ; total e2e 352 contrôles, conforme à `e2e/attendu.json`.

| Critère | Preuve (libellé du contrôle) |
| --- | --- |
| Sur P.118 importé | « copie de travail de P.118 importée dans le modèle typé (6 niveaux), niveau actif « Sous-sol technique » » |
| Dessiner un mur | « raccourci M → outil Mur actif » ; « quatre murs chaînés et fermés enregistrés sur le serveur (axes exacts, épaisseur 0,20 m, hauteur 2,50 m) » — révision 12 → 16 |
| Y poser une porte | « raccourci P → porte posée sur le mur dessiné (hôte, largeur 0,90 m, hauteur 2,10 m) et enregistrée » |
| Obtenir la pièce | « outil Pièce, curseur au clavier dans le carré → pièce proposée » ; « pièce créée sur les axes des quatre murs » |
| Modifier le type | « type du mur modifié dans l'inspecteur (« Sans type » → « cloison »), enregistré, révision persistée en hausse » |
| Annuler et rétablir avec révisions persistées | « Annuler → type revenu à « Sans type » sur le serveur » (19 → 20) ; « Rétablir → type « cloison » de nouveau » (20 → 21) ; idem sur téléphone (21 → 22 → 23) |
| Relire depuis un second navigateur | « second navigateur — même révision persistée, murs, porte, pièce et type « cloison » relus » ; le mur s'ouvre dans l'inspecteur |
| Téléphone 390 px | « téléphone 390 px — disposition téléphone (onglets du bas, sélection), sans défilement horizontal » ; feuille Inspecteur |
| Clavier | tous les points posés par saisie de précision et flèches, pointeur hors de la zone de plan ; « clavier — Entrée sur la zone de plan sélectionne la pièce » |
| Aucune violation axe critique ou sérieuse | « accessibilité · nouvel atelier (ordinateur) » et « (téléphone) : aucune violation critique ou sérieuse » |
| Pas de régression | « aucune erreur JavaScript pendant les gestes (deux navigateurs) » ; « l'ancien Atelier n'est pas monté » ; scénarios 00 à 12 de l'ancien Atelier verts |

Mesures indicatives (Chromium headless de la CI) : ouverture du nouvel Atelier sur P.118 2 886 ms, sur la copie
de travail 2 041 ms (ancien Atelier : 3 103 ms). Captures : `docs/migration/captures/webapp/nouvel-atelier-{ouverture,gestes}-{desktop,mobile}.png`.

Definition of Done (§11) : tâches faites, fiches du périmètre à « prototype » ou « vérifiée » (sauf celles listées
en réserve), CI verte (typecheck, tests, build, e2e, image), `docs/migration/matrix.md`, `decisions.md`, mesures et
captures à jour.

## Fiches du lot

<!-- FICHES -->

## Réserves et reports

- Téléphone 390 px : le dernier onglet du bas (« Affichage ») est rogné au bord droit (capture
  `nouvel-atelier-gestes-mobile.png`) ; le contrôle « sans défilement horizontal » passe. À corriger avec le toucher (L3b.3).
- Dalle : le type est en lecture seule dans l'inspecteur, faute de commande dans le contrat figé (D-038) ; à ouvrir
  au lot suivant qui étend `packages/atelier-model`.
- Escalier : 2h + g calculé et affiché « indicatif », sans bornes (D-039, R3) : aucune borne sans source.
- Les étapes de validation des fiches qui citent `05-atelier.mjs` / `11-accessibilite.mjs` visent l'ancien Atelier ;
  au lot 3a, seuls les gestes d'acceptation sont exercés de bout en bout (scénario 14), les autres outils par vitest.
  Les scénarios de l'ancien Atelier seront repris sur le nouveau à la bascule (lot 4).
- 3D (onglet « 3D lot 3b »), pousser / tirer, toucher et mesures `⏱` détaillées : lot 3b.
- D-031 : le panneau des problèmes du nouvel Atelier affiche les conflits (bus) et les réserves Harmonie (bilan) ;
  la route `/problemes` de l'API ne produit toujours rien pour `conflit` ni `harmonie`.

## Ce que le maître d'ouvrage peut vérifier

Sur l'instance, ouvrir la copie de travail de P.118, module Atelier avec `?module=atelier&version=nouveau` :
dessiner quatre murs (M, saisie de longueur au clavier), poser une porte (P), créer la pièce (outil Pièce), changer
le type d'un mur dans l'inspecteur, annuler / rétablir, recharger depuis un autre navigateur, puis refaire au
téléphone. L'Atelier par défaut (sans `version=nouveau`) reste l'ancien jusqu'au lot 4.

## Ce qu'il doit décider

- Rien ne bloque le lot 3b.
- Bornes de l'escalier (Blondel, hauteur et giron) : à fournir avec leur source si elles doivent devenir des contrôles (R3, D-039).
- La validation du lot (§10.1-1) est prononcée par délégation (D-028) ; le maître d'ouvrage peut la reprendre après
  avoir fait les gestes ci-dessus.
