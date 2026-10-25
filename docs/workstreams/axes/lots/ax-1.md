# Lot AX-1 — phase A, modèle pur (avec le cadrage AX-0)

Mis à jour : 2026-10-25 (UTC). Issue #296. Décisions appliquées : AX-D3 (contexte hors historique), AX-D4 (migration),
AX-D5 (tolérances), AX-D7 (instantané).

## Livré

- `packages/sandbox-planche-model/src/reperes.ts` : `TOLERANCES_REPERE`, `validerRepere` (fini, unitaire, orthogonal,
  direct), constructions strictes `repereDepuisDirections` / `repereDepuisPoints` / `repereDepuisFace` /
  `repereDepuisArete` (erreur nommée + explication, jamais de repli), `deplacerOrigine`, `pivoterRepere` (axe nommé,
  local ou du modèle, angle signé), conversions `versRepereLocal` / `depuisRepereLocal`, plans XY / XZ / YZ
  (`planDuRepere`), contexte de travail (`ContexteTravail`, `CONTEXTE_MODELE`, `contexteTemporaire`) et son historique
  (`pousserContexte`, `contextePrecedent`, 20 entrées), repères enregistrés (`RepereEnregistre`, `repereEnregistreValide`),
  migration `contexteDepuisDocument`.
- Outil Axes : plus aucune écriture dans le document — `Transition.repereTravail` ; points confondus ou alignés
  refusés (l'étape reste ouverte) ; champ Mesures « Origine » : `[x;y;z]` / `<dx;dy;dz>` déplacent l'origine seule
  (étape 1) ou donnent les points d'axe (étapes 2 et 3) ; nouvelle attente de saisie `point`.
- Plan de travail des outils : `ContexteOutil.planDeTravail` ; `axesDeSaisie` (un seul endroit pour axes et sol de
  l'inférence, 22 appels remplacés) ; `viserLibre` prend la normale du plan de travail hors face (fin du Z du monde,
  risque 2 du concept) ; `axesDuPlan` suit le repère (risque 3) ; verrou du plan (`contraindreAuPlan`) pour les formes
  planes, la Ligne et la Main levée (`OUTILS_PLAN_VERROUILLABLE`).
- `annotations.reperes` : copie du chantier, gel, empreinte, delta, lecture contrôlée d'un document, mise à l'échelle.
- Interface (minimum pour garder le comportement) : contexte de travail tenu par la Planche, mémorisé par Planche dans
  ce navigateur (`planche/contexte-travail.ts`), migré depuis l'ancien repère du document ; la vue dessine les axes
  au repère de travail ; « Aligner les axes » (menu contextuel) passe par `repereDepuisFace` et ne crée plus de pas de
  géométrie ; crochet de recette `fadiPlanche.contexteTravail()`.

## Preuves

- `src/reperes.test.ts` (26 tests) : AX01, AX02 (modèle et outil), AX03, AX04, AX05, AX06 (modèle : plans, verrou,
  Ligne), AX07 (historique, aucun pas de géométrie), AX09 (migration, delta, lecture), AX20 (1e-6 m à 1e7 m).
- Tests existants de l'outil Axes adaptés (`mesure.test.ts` : repère de travail, aucune opération d'historique).
- Paquet : 848 tests verts ; `npm run typecheck`, tests web du Sandbox, `npm run build` : voir la PR.

## Écarts déclarés

- Relevé SketchUp « l'action se défait avec Undo » : remplacé par « Repère précédent » (AX-D3) ; le texte du
  catalogue relevé reste celui de l'observation.
- Les commandes et la barre (Précédent, Modèle, plans XZ / YZ, verrou) arrivent en AX-2 : en AX-1, le contexte se
  change par l'outil Axes et « Aligner les axes ».
