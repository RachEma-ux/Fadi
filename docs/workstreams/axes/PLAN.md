# Axes et repères — plan de mise en œuvre (AX-0 à AX-5)

Mis à jour : 2026-10-25 (UTC). Plan propre au chantier, établi après l'évaluation (`EVALUATION.md`) sous délégation
AX-D1. Un lot = une PR fusionnée CI verte + un compte rendu `lots/ax-N.md`. Les lots s'enchaînent sans acceptation
intermédiaire.

## AX-0 — Cadrage (documentaire, avec AX-1)

Chantier `docs/workstreams/axes/`, Issue #296, décisions AX-D1 à AX-D10, évaluation, plan.

## AX-1 — Phase A, modèle pur (`packages/sandbox-planche-model`)

1. `src/reperes.ts` : `TOLERANCES_REPERE`, `validerRepere` (fini, unitaire, orthogonal, main droite), construction
   stricte depuis trois points (`repereDepuisPoints` → erreur nommée, jamais de repli), depuis une face (normale + X
   choisi, inversion), depuis une arête et un plan, déplacement de l'origine seule, rotation d'un angle signé autour d'un
   axe **nommé** local ou du modèle, conversions modèle ↔ local.
2. Contexte de travail : `ContexteTravail` (repère ou modèle, source, plan XY / XZ / YZ, verrou), plan de travail dérivé,
   historique de contextes (`pousserContexte`, `contextePrecedent`, au plus 20, aucune entrée pour une annulation).
3. Outils : `Transition.repereTravail` (l'outil Axes ne modifie plus le document, AX-D3) ; `repereDepuis` strict
   (AX02) ; saisie numérique de l'origine `[x;y;z]` / `<dx;dy;dz>` dans l'outil Axes (AX03) ; `ContexteOutil.planDeTravail`
   consommé par `viserLibre` (normale du plan, plus de Z du monde, AX05), par `axesDuPlan` et par l'inférence brute ;
   verrou du plan pour les outils de forme et la Ligne, liste des outils concernés.
4. Repères enregistrés (structure seulement) : `annotations.reperes` (identifiant, nom, base, révision, version de
   schéma, source instantanée), sérialisation, delta, mise à l'échelle globale, `migrerRepere` (AX09).
5. Tests : AX01–AX05, AX07 (historique pur), AX09 (migration), AX20 (1e-6 m à 1e7 m).

## AX-2 — Phase A, interface (`apps/web/src/modules/sandbox`)

1. Registre : famille `repere`, 12 commandes nouvelles + l'outil Axes, pictogrammes propres, raccourcis AX-D6,
   emplacement `barre-reperes`.
2. Barre compacte « Axes et repères » (flottante, déplaçable, position mémorisée, jamais pleine largeur) : sélecteur
   du repère actif, Placer, Aligner, Plan, Précédent, Modèle, Plus (Pivoter, Verrouiller, Vue normale, Enregistrer, Gérer,
   Origine du composant, Affichage).
3. Ligne d'état persistante « Repère : … · Plan : … · Portée : Travail · Unité : m ».
4. Inspecteur : origine numérique, orientation (axes en coordonnées du modèle), rotation par axe nommé et angle signé,
   plan de travail, verrou.
5. Vue normale au plan (caméra seule), Repère précédent, Repère du modèle, Aligner (face sélectionnée, X inversable).
6. Accessibilité : noms accessibles, `aria-live` des étapes et des refus, clavier, débordement nommé en écran étroit.
7. Recette e2e `apps/web/e2e/sandbox-axes.mjs` (AX01, AX03, AX05–AX07, AX17) ; i18n.

## AX-3 — Phase B, réutilisation et visibilité

Gestionnaire (panneau « Repères » : rechercher, enregistrer, renommer, dupliquer, supprimer, inspecter les références),
indicateur « Modifié » avec « Enregistrer les modifications » / « Enregistrer comme nouveau », suppression d'un repère
cité par une scène soumise à résolution explicite, option de scène « Rappeler le repère » (instantané), triade d'orientation
étiquetée dans un coin (préférence), exclue du PNG par défaut. Scénarios AX08, AX09 (e2e), AX14 ; AX15 sans objet (AX-D9).

## AX-4 — Phase C, origine de composant

Panneau « Origine du composant » (commande et menu « Changer les axes ») : objet, définition, nombre d'occurrences,
portée (cette occurrence → rendre unique puis éditer ; toutes les occurrences), 27 ancrages de la boîte locale + point
libre + orientation du repère de travail, aperçu, transformation compensée atomique (géométrie de la définition et
transformations des occurrences ; aucun sommet monde ne bouge), refus AX-D8, lot de composants avec aperçu des
éligibles / écartés et un seul Annuler. Scénarios AX10–AX12.

## AX-5 — Phase D, associations et échanges, clôture

Repères liés à une face (santé sain / périmé / manquant, « Mettre à jour depuis la source », aucune réparation devinée),
exports OBJ / STL / IFC en coordonnées du modèle ou du repère de travail, coordonnées d'origine si l'import les a
consignées (AX-D10), test d'indépendance du dessin 2D du Studio (AX19). Recette finale `RECETTE.md` (AX01–AX20, chacun
avec sa preuve ou son motif « sans objet »).
