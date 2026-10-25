# Axes et repères — état

Mis à jour : 2026-10-25 (UTC).

## État

Phase A (#298) fusionnée ; phases B, C et D et recette finale en PR #303. Clôture de la délégation consignée
(AX-D11), effective à la fusion de la dernière PR.

## Faits vérifiés

- Concept 1.0 lu en entier ; les trois risques qu'il relève sont confirmés dans le code (`EVALUATION.md` § 1).
- Toutes les combinaisons Alt + Maj + lettre du registre du Sandbox sont prises (relevé du registre, AX-D6).
- AX-1 : 848 tests du modèle verts (26 nouveaux) ; AX-2 : recette `sandbox-axes.mjs` OK et `sandbox-module.mjs` OK en local.
- Le plan documentaire AXE-00 à AXE-11 (PR #295) concorde avec AX-D2 à AX-D10 ; correspondance dans `PLAN.md`.
- PR #298 : 17 contrôles verts sur `d89a4b0` ; trois constats Codex (P2) corrigés dans `e32f6eb`, fils résolus.
- AX-3 : `sandbox-reperes.mjs` OK en local ; modèle 859 tests, web du Sandbox 124 tests.
- AX-4 : `origine-composant.test.ts` (12 tests, dont 3 de la revue Codex de #303) ; `sandbox-origine.mjs` OK.
- AX-5 : `axes-phase-d.test.ts` (5 tests) ; `sandbox-reperes-lies.mjs` OK ; `RECETTE.md` : 18 scénarios vérifiés (dont
  2 avec partie déclarée), AX09 vérifié au modèle, AX15 sans objet.

## Points ouverts

Aucun point de décision ouvert (AX-D2 à AX-D10).

## Liens de suivi

- Issue : https://github.com/RachEma-ux/Fadi/issues/296 ; concept : Issue #260.

## Préconditions de clôture

Critères de sortie de `TASKS.md`.
