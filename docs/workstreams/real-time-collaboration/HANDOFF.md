# Temps réel (Real-time Collaboration) — Reprise de session

Mis à jour : 2026-10-25 (UTC).

## Point de reprise

- Chantier : real-time-collaboration
- Issue : https://github.com/RachEma-ux/Fadi/issues/283
- Branche / PR actives : `ccr-93a486a1-cbijf8`, PR de RTC-3 à RTC-5 (vérifier son état et sa CI sur GitHub). RTC-1 : PR #288 ; RTC-2 : PR #289.
- Dernier commit vérifié : relever le HEAD de la branche avant toute reprise ; base `main@2577e25`.

## Dernier état vérifié

- RTC-1 (PR #288) et RTC-2 (PR #289) fusionnés. RTC-3 (annotations), RTC-4 (revue sur publication figée), RTC-5
  (robustesse : pointeur 3D, réservation visible, supervision, charge, redémarrage, retour arrière) implémentés, relus
  par trois relecteurs indépendants (RT-D7), constats corrigés ; ECC Tools traité (`PREUVES-SECURITE-ET-CI.md`).

## Prochaine action

- PR de RTC-3 à RTC-5 : CI verte puis fusion. Ensuite : préproduction par le maître d'ouvrage (hors délégation), puis
  décision d'activer `FADI_TEMPS_REEL` en production.
- CR-3 (#272) est satisfaite par `PLAN.md` § 5 : la cocher dans `collaboration-rules/TASKS.md` après fusion de la
  PR #282, qui modifie les mêmes lignes (évite un conflit).

## Tests et preuves

- Unitaires API temps réel 29, suite web complète verte ; recettes : sessions 44, vue partagée 26, annotations 32,
  revue 26, robustesse 21, charge 12 (CI, tranche p2) ; redémarrage 8 et retour arrière 9 (locales).

## Risques et blocages

- Fichiers partagés de droits et de schéma modifiés en parallèle par Organisations, #282 et COM : RTC-1 ne commence
  qu'après leur fusion, avec un seul propriétaire de ces fichiers.
- Raccourcis : Alt+Maj+chiffres et ponctuation déjà pris (collaboration, COM-D14, #282) ; plan à concerter.
- Branche `docs/collaboration-temps-reel-plan` : ancien plan remplacé par ce chantier ; ne pas le reprendre en parallèle.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise. Drapeau
  `FADI_TEMPS_REEL` absent : routes et canal répondent 404 (aucun effet en production tant qu'il n'est pas posé).
