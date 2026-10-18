# L1 — Reprise de session

Mis à jour : 2026-10-18 (UTC).

## Point de reprise

Issue #151, branche `fix/151-native-architecture-guards`, base `5cf61d1fed9ed523b331228af20bce93a4f2bf63`. Lire STATUS et la PR rattachée avant toute suite ; ne pas utiliser les résultats de l’ancienne PR #148 comme CI de L1.

## Dernier état vérifié

Garde-fous et 49 tests locaux sur fixtures implémentés et passés. main reste non protégée selon l’API ; l’administration renvoie 403. Le workflow dédié doit maintenant vérifier le dépôt réel.

## Prochaine action

Lire les résultats des nouveaux workflows sur le HEAD exact, analyser leurs éventuels échecs et compléter le checkpoint dans la PR. Demander la revue avant fusion ; aucune opération sur Fadi-Serv. La protection administrative est séparée (#146).

## Tests et preuves

`node --check` sur les scripts ; `node --test scripts/architecture-guards.test.mjs` : 49/49 localement, Node 22.16.0 et TypeScript 5.8.3. Pas de npm test/build/typecheck complet local : clone complet indisponible ; ces contrôles doivent être prouvés par GitHub Actions sur le HEAD.

## Risques et blocages

Une analyse statique bornée ne certifie ni tous les actifs/transitifs ni l’indépendance universelle. Le ruleset proposé est désactivé et non appliqué ; pas de clôture fictive de #146 ou #147. Ne pas modifier les noms DA pour faire passer un scanner.

## Arrêt sûr

Pousser la branche et sa PR avec ces deux checkpoints, sans toucher main ni la production. Le canal SSH permanent reste différé. Aucun détail privé ni sauvegarde utilisateur à publier.
