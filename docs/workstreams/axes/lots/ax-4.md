# Lot AX-4 — phase C, origine et axes de composant

Mis à jour : 2026-10-25 (UTC). Issue #296. Décision appliquée : AX-D8. Correspondance : AXE-07 et AXE-08 du plan #295.

## Livré

- `geometrie-libre.ts` : `redefinirReperesDefinitions` — redéfinition atomique du repère local de définitions : le
  contenu reçoit F⁻¹ (sommets, normales, courbes, objets imbriqués), chaque occurrence de la définition, où qu'elle soit,
  reçoit M · F ; « rendre unique » d'abord si demandé ; un seul pas d'historique.
- `origine-composant.ts` (pur) : 27 ancrages de la boîte LOCALE (préréglages centre de la base, centre de la boîte —
  jamais « centre de masse » —, coin), point libre local, point du monde (origine du repère de travail) ; orientation
  gardée ou alignée sur le repère de travail (choix séparé) ; portée « cette occurrence » (rendue unique si partagée) ou
  « toutes » (compte hors sélection) ; refus explicites et atomiques : miroir, biais / échelle non uniforme, verrou,
  pièce de profilé, définition vide ; aperçu ; lot avec éligibles, écartés et motifs, un seul pas.
- Interface : commande « Origine du composant » (`Maj+F4`, dessin sur mesure, menu « Plus » de la barre), menu
  contextuel « Changer les axes » (jusqu'ici grisé) et « Aligner les axes » livrés comme commandes de repère ; panneau
  `planche/PanneauOrigineComposant.tsx` (objet, définition, nombre d'occurrences avant l'aperçu, aperçu 3D de la nouvelle
  origine et des nouveaux axes dans la vue).
- Recette `apps/web/e2e/sandbox-origine.mjs` (CI, tranche `planche`).

## Preuves

- `origine-composant.test.ts` (9 tests) : les 27 ancrages laissent tous les sommets monde immobiles (3 occurrences dont
  une tournée), origine annoncée = translation, portée « cette occurrence » (sœur inchangée), orientation sur un repère
  pivoté, composant imbriqué dans un groupe tourné, échelle uniforme acceptée, miroir / biais / étirement refusés,
  verrou, lot avec écarté et définition traitée une fois.
- Recette `sandbox-origine.mjs` **OK** ; `sandbox-axes.mjs`, `sandbox-reperes.mjs`, `sandbox-module.mjs` OK.

## Écarts déclarés

- Dans un lot en portée « toutes », une occurrence réfléchie d'une définition éditée par une autre occurrence est
  compensée (le monde reste immobile) mais n'est jamais prise comme base de l'édition (elle figure dans les écartés).
- « Réinitialiser l'échelle » et « Réinitialiser l'inclinaison » restent grisés (hors du concept Axes).
