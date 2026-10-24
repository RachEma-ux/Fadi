# Temps réel (Real-time Collaboration) — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : real-time-collaboration
- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Branche / PR actives : `ccr-93a486a1-cbijf8`, PR #284 (vérifier son état et sa CI sur GitHub).
- Dernier commit vérifié : relever le HEAD de la branche avant toute reprise ; base `main@2577e25`.

## Dernier état vérifié

- Évaluation, plan amendé, RT-D1, RT-D2 (réponses RT-Q1 à RT-Q7), RT-D3 (Studio seul, canal propre au Temps réel), traçabilité RT-R1 à RT-R7, essai de transport
  (`ESSAI-TRANSPORT.md`), reprise du plan du 22 octobre (`PLAN.md` § 10). Aucun code applicatif.

## Prochaine action

- RTC-0.4 : profil de référence des budgets (P.118, appareil Android, réseau déclaré).
- CR-3 (#272) est satisfaite par `PLAN.md` § 5 : la cocher dans `collaboration-rules/TASKS.md` après fusion de la
  PR #282, qui modifie les mêmes lignes (évite un conflit).
- COM est fusionné (PR #285). Surveiller la fusion de #281 et #282 : c'est la porte de RTC-1, puis RTC-0.5.

## Tests et preuves

- `node scripts/check-continuity.mjs` vert en local. Essai RTC-0.3 : 13 / 13 et 5 / 5 (scripts jetables, non commités ;
  montage décrit dans `ESSAI-TRANSPORT.md`). Aucun test de l'application exécuté (changement documentaire ; CI de la PR).

## Risques et blocages

- Fichiers partagés de droits et de schéma modifiés en parallèle par Organisations, #282 et COM : RTC-1 ne commence
  qu'après leur fusion, avec un seul propriétaire de ces fichiers.
- Raccourcis : Alt+Maj+chiffres et ponctuation déjà pris (collaboration, COM-D14, #282) ; plan à concerter.
- Branche `docs/collaboration-temps-reel-plan` : ancien plan remplacé par ce chantier ; ne pas le reprendre en parallèle.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise. Aucun code
  temps réel avant décision explicite d'engager RTC-1.
