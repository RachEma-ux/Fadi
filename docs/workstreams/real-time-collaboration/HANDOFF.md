# Temps réel (Real-time Collaboration) — Reprise de session

Mis à jour : 2026-10-25 (UTC).

## Point de reprise

- Chantier : real-time-collaboration
- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Branche / PR actives : `ccr-93a486a1-cbijf8`, PR du lot RTC-3 (vérifier son état et sa CI sur GitHub). RTC-1 : PR #288 ; RTC-2 : PR #289.
- Dernier commit vérifié : relever le HEAD de la branche avant toute reprise ; base `main@2577e25`.

## Dernier état vérifié

- RTC-1 (PR #288) et RTC-2 (PR #289) fusionnés. RTC-3 implémenté (`lots/rtc-3.md`) : annotation = commentaire Studio
  ancré à la révision de la session + point de vue (`rt_annotations`), audience E1 projetée, rejeu sans doublon ;
  recette `temps-reel-annotations.mjs` en CI.

## Prochaine action

- RTC-3 : CI verte puis fusion ; RTC-4 (revue en direct sur paquet figé : portée `paquet-revue`) ; RTC-5 (RT-D4).
- CR-3 (#272) est satisfaite par `PLAN.md` § 5 : la cocher dans `collaboration-rules/TASKS.md` après fusion de la
  PR #282, qui modifie les mêmes lignes (évite un conflit).

## Tests et preuves

- Tests unitaires API temps réel 27 ; suite web 991 ; recettes `temps-reel-sessions.mjs` 44 / 44,
  `temps-reel-studio.mjs` 25 / 25, `temps-reel-annotations.mjs` 29 / 29 (base jetable locale, Chromium local).

## Risques et blocages

- Fichiers partagés de droits et de schéma modifiés en parallèle par Organisations, #282 et COM : RTC-1 ne commence
  qu'après leur fusion, avec un seul propriétaire de ces fichiers.
- Raccourcis : Alt+Maj+chiffres et ponctuation déjà pris (collaboration, COM-D14, #282) ; plan à concerter.
- Branche `docs/collaboration-temps-reel-plan` : ancien plan remplacé par ce chantier ; ne pas le reprendre en parallèle.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise. Drapeau
  `FADI_TEMPS_REEL` absent : routes et canal répondent 404 (aucun effet en production tant qu'il n'est pas posé).
