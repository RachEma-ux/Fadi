# Temps réel (Real-time Collaboration) — Reprise de session

Mis à jour : 2026-10-25 (UTC).

## Point de reprise

- Chantier : real-time-collaboration
- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Branche / PR actives : `ccr-93a486a1-cbijf8`, PR du lot RTC-2 (vérifier son état et sa CI sur GitHub). RTC-1 : PR #288.
- Dernier commit vérifié : relever le HEAD de la branche avant toute reprise ; base `main@2577e25`.

## Dernier état vérifié

- RTC-1 fusionné (PR #288). RTC-2 implémenté (`lots/rtc-2.md`) : bandeau, suivi du présentateur (cadre plan, caméra 3D),
  pointeurs et sélections distants, révision annoncée, règle d'or, traductions ; recette `temps-reel-studio.mjs` en CI.

## Prochaine action

- RTC-2 : CI verte puis fusion ; RTC-3 (annotations enregistrées : point de vue, session, révision source, idempotence,
  diffusion `annotation` projetée par audience) ; RTC-4 ; RTC-5 (RT-D4).
- CR-3 (#272) est satisfaite par `PLAN.md` § 5 : la cocher dans `collaboration-rules/TASKS.md` après fusion de la
  PR #282, qui modifie les mêmes lignes (évite un conflit).

## Tests et preuves

- RTC-1 : 25 tests unitaires API, recette `temps-reel-sessions.mjs` 44 / 44. RTC-2 : suite web 991 tests verts,
  recette `temps-reel-studio.mjs` 25 / 25 (base jetable locale, Chromium local).

## Risques et blocages

- Fichiers partagés de droits et de schéma modifiés en parallèle par Organisations, #282 et COM : RTC-1 ne commence
  qu'après leur fusion, avec un seul propriétaire de ces fichiers.
- Raccourcis : Alt+Maj+chiffres et ponctuation déjà pris (collaboration, COM-D14, #282) ; plan à concerter.
- Branche `docs/collaboration-temps-reel-plan` : ancien plan remplacé par ce chantier ; ne pas le reprendre en parallèle.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise. Drapeau
  `FADI_TEMPS_REEL` absent : routes et canal répondent 404 (aucun effet en production tant qu'il n'est pas posé).
