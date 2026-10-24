# Temps réel (Real-time Collaboration) — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : real-time-collaboration
- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Branche / PR actives : `ccr-93a486a1-cbijf8`, PR de cadrage RTC-0 (vérifier son état sur GitHub).
- Dernier commit vérifié : base `main@2577e25` ; relever le HEAD de la branche avant toute reprise.

## Dernier état vérifié

- Évaluation du plan fourni rédigée ; plan amendé (`PLAN.md`), décisions (`DECISIONS.md` : RT-D1, RT-Q1 à RT-Q7) et
  traçabilité RT-R1 à RT-R7 écrits. Aucun code.

## Prochaine action

- Obtenir les réponses à RT-Q1 à RT-Q7 ; puis RTC-0.3 (essai de transport hors `main`) et RTC-0.4 (budgets).
- CR-3 (#272) est satisfaite par `PLAN.md` § 5 : la cocher dans `collaboration-rules/TASKS.md` après fusion de la
  PR #282, qui modifie les mêmes lignes (évite un conflit).
- Surveiller la fusion de #281, #282 et du socle COM (#280) : c'est la porte de RTC-1.

## Tests et preuves

- `node scripts/check-continuity.mjs` vert en local. Aucun test d'application exécuté (changement documentaire).

## Risques et blocages

- Fichiers partagés de droits et de schéma modifiés en parallèle par Organisations, #282 et COM : RTC-1 ne commence
  qu'après leur fusion, avec un seul propriétaire de ces fichiers.
- Raccourcis : Alt+Maj+chiffres et ponctuation déjà pris (collaboration, COM-D14, #282) ; plan à concerter.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise. Aucun code
  temps réel avant décision explicite d'engager RTC-1.
