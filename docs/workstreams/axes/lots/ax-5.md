# Lot AX-5 — phase D, associations, échanges et clôture

Mis à jour : 2026-10-25 (UTC). Issue #296. Décisions appliquées : AX-D7, AX-D10. Correspondance : AXE-09 à AXE-11.

## Livré

- `reperes-lies.ts` : repère enregistré lié à une face de la racine (identifiant + instantané de contrôle), santé
  explicite (instantané, à jour, face changée, face supprimée), « Mettre à jour depuis la face » (même face seulement),
  « Détacher du lien » ; aucune face devinée ; faces des groupes et composants refusées (identité dépendante du chemin).
- `echanges-coordonnees.ts` : exports OBJ / STL / IFC en coordonnées du modèle (défaut), du repère de travail ou
  d'origine ; `annotations.correspondances` consignées à l'import (format, fichier, mètres par unité) ; refus explicites
  (aucune correspondance, unités multiples, IFC en unité source) ; en-tête OBJ et message d'export annoncent les
  coordonnées utilisées.
- Interface : panneau « Repères » (enregistrer lié, santé, mise à jour, détacher, coordonnées des exports).
- `independance.test.ts` : frontières Axes (AX18, AX19).
- Recette `apps/web/e2e/sandbox-reperes-lies.mjs` (CI) ; dossier de recette `RECETTE.md` (AX01 à AX20).

## Preuves

- `axes-phase-d.test.ts` (5 tests) ; recette `sandbox-reperes-lies.mjs` **OK** ; les cinq recettes du Sandbox vertes.
