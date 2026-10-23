# Chantiers Fadi — index de reprise

Chaque **chantier** dispose d'un dossier de contexte et d'un point de reprise ; un module existant ne doit pas automatiquement donner lieu à une branche permanente. Lire [le protocole de continuité](../continuity/README.md) avant d'ouvrir une tâche.

## Chantiers documentés

| Chantier | État constaté | Dossier | Suivi |
| --- | --- | --- | --- |
| Garde-fous architecture native — L1 | Implémentation sur branche ; CI et revue à confirmer ; administration main séparée | [architecture-guards/](architecture-guards/CONTEXT.md) | [Issue #151](https://github.com/RachEma-ux/Fadi/issues/151) · [Protections #146](https://github.com/RachEma-ux/Fadi/issues/146) |
| Purge DrawAll hors Fadi | **Audit et arbitrage en cours** ; aucun changement au dépôt DrawAll | [purge-drawall/](purge-drawall/CONTEXT.md) | [Issue #147](https://github.com/RachEma-ux/Fadi/issues/147) |
| Architecture WebApp | **À définir** : périmètre futur non décidé | [architecture-webapp/](architecture-webapp/CONTEXT.md) | Nouveau suivi métier à ouvrir après le cadrage ; la présente structure est créée par [Issue #144](https://github.com/RachEma-ux/Fadi/issues/144) |
| Exploitation / sauvegarde Fadi-Serv | Travaux d'exploitation déjà suivis ailleurs, sans duplication | [Déploiement](../deploiement.md) | [PR #143](https://github.com/RachEma-ux/Fadi/pull/143) (état à revérifier) |
| Interface gabarits pleine largeur | PR existante indépendante | Aucune nouvelle fiche avant décision | [PR #142](https://github.com/RachEma-ux/Fadi/pull/142) (état à revérifier) |
| Atelier et Planche | Cahiers, lots et décisions préexistants ; ne pas recréer leur suivi | [Atelier](../atelier/README.md) · [Planche](../planche/README.md) | Les nouveaux chantiers ne sont ouverts qu'en cas de changement cadré |
| Équipe Codex Fadi | Programme documentaire M00–M30 ; aucune correction réalisée par sa création | [ai-team/](ai-team/CONTEXT.md) | [Issue #156](https://github.com/RachEma-ux/Fadi/issues/156) |
| Studio | Cadrage et missions définis ; cases et conformité à qualifier | [studio/](studio/CONTEXT.md) | [Programme #156](https://github.com/RachEma-ux/Fadi/issues/156), Issues #159–#164 |
| Gestion des comptes (Users Management) | **Fusionnée** dans `main` (PR #255, 2026-10-23), non déployée ; déploiement sur accord explicite | [users-management/](users-management/CONTEXT.md) | [Issue #253](https://github.com/RachEma-ux/Fadi/issues/253) |
| Organisations, participation et revue externe | **En cours** : plan validé (OP-1) ; phase 1 sur branche, revue 🛑 1 attendue | [organisations-participation/](organisations-participation/CONTEXT.md) | [Issue #262](https://github.com/RachEma-ux/Fadi/issues/262) |

## Ouvrir un chantier

1. Vérifier qu'il n'existe pas de dossier ou journal métier équivalent.
2. Créer une Issue à l'aide du modèle « Tâche Fadi / reprise » ; préciser résultat attendu et tests.
3. Exécuter `node scripts/continuity.mjs init <slug> <numéro-issue>` pour créer les quatre fichiers à partir des modèles. Les créations restent locales tant qu'elles ne sont pas commitées.
4. Mettre à jour les points d'entrée de cet index et l'Issue.
5. Créer la branche GitHub **pour la tâche**, pas pour la vie entière du chantier ; ouvrir une PR.
6. Après chaque checkpoint, pousser `STATUS.md` et `HANDOFF.md` avec les modifications concernées.

Les documents hérités restent les sources canoniques de leur sujet. Cet index sert au **routage** de la reprise, et non à recopier les décisions des cahiers.
