# Architecture native Fadi — L1

## Objectif

Renforcer les garde-fous d’architecture existants après l’audit de `5cf61d1fed9ed523b331228af20bce93a4f2bf63`. L’utilisateur a demandé l’étape suivante ; l’intervention est bornée au lot L1, sans refonte métier.

## Périmètre

Issue #151 : modularité, isolation nominale, tests et préparation des protections GitHub. Les modifications transactionnelles et les autres lots sont séparés.

## Sources canoniques

`AGENTS.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/continuity/README.md`, `docs/architecture-guards.md`, Issues #146, #147, #149 et #151. Les cahiers Atelier/Planche conservent leur autorité métier.

## Contraintes

Conserver les 21 étapes, les identifiants DA, les fonctions industrielles, les données et les règles de dessin. Aucune modification de DrawAll, de Fadi-Serv, des sauvegardes ou du canal SSH différé. Ne pas fusionner automatiquement.

## Hypothèses et questions ouvertes

L’activation de la protection de main nécessite l’administration GitHub non accessible à l’intégration. Les tests synthétiques doivent être complétés par la CI du dépôt réel ; aucune absence universelle de dépendances indirectes n’est affirmée.
