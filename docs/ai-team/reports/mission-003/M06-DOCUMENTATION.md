# M06 — changements documentaires réalisés

Mission003, A0 propriétaire, référence applicative `27c0c5a35e2f116752a83a9c66459484488a1975`, programme #156. Autorisation : écritures documentaires Mission003, sans code ni fusion. **M06 En cours**, pas clôturée par ces corrections.

| Fichier/périmètre | Correction effectivement réalisée | Preuve/limite |
|---|---|---|
| `apps/web/src/modules/README.md` | Retire l’affirmation obsolète que seuls Accueil/Projets sont branchés ; décrit les sept modules et la limite du registre | Routes/composants relus statiquement ; aucune métadonnée TypeScript modifiée |
| `docs/architecture.md` | Répercute OCCT déjà décidé et ses limites | D-177/D-182/D-183 ; aucune nouvelle décision de noyau |
| `docs/atelier/README.md` | Titre actif natif Fadi | Historique conservé, aucune purge du journal des décisions |
| `docs/atelier/recette.md` | Remplace la question de principe OCCT périmée par les décisions et limites applicables | Pas de recette exacte annoncée réussie |
| `docs/planche/README.md` | Distingue maillage Planche et noyau exact séparé ; recontextualise la table historique d’acceptation | D-174/D-177/D-182/D-183 conservées |
| `docs/workstreams/purge-drawall/` | STATUS/HANDOFF actualisés ensemble, TASKS rapproché de #148 fusionnée/#147 ouverte et du tri actuel | Historique daté conservé ;23 fichiers relus ne valent pas488 acceptés |
| PR #154, `CHATGPT-CODEX-HANDOFF.md` | Ordre HANDOFF→STATUS→TASKS→CONTEXT ; cycle complet ; checkpoint obligatoire avant revue pour un chantier modifié | Commit documentaire `76e43d19645dc8a8ffd91282177e6a31d123f73a`, branche existante `docs/153-chatgpt-codex-handoff`, sans fusion |

La [revue indépendante A2](A2/review-M06.json) ne relève pas d’erreur bloquante sur le diff documentaire Fadi. Elle ne constitue pas une validation métier ni une autorisation de fusion. La correction du relais est faite sur sa PR existante afin d’éviter un fichier concurrent dans #165.

Au relevé GitHub après correction : PR154 ouverte/mergeable, tête76e43d1 ; continuité39117137780 et isolation39117137776 réussies ; CI39117137782 en cours. Le succès CI antérieur sur l’ancienne tête n’est pas attribué à celle-ci. PR142 reste à diagnostiquer sur son échec `planche-boutons` avant tout travail recouvrant l’interface. PR152 est réutilisée pour les frontières/ruleset candidat ; aucune règle n’a été activée.

Restent ouverts : documentation exhaustive des488 fichiers touchés, qualifications de capacités réellement implémentées, métadonnées applicatives du registre, contrats v2/v3, alias `echelle`, intégration et ordre des PR. La cohorte suivante a été effectivement relue par A2 : [20 autres documents/méta](A2/isolation-extra-docs-review.json),43 occurrences,19 à conserver et une réserve de recette OCCT déjà corrigée ici. Restent176 fichiers code et269 fiches historiques non qualifiés sémantiquement. Les269 fiches historiques restent archivées avec leur rôle ; leur texte n’est pas une dépendance opérationnelle démontrée.

Retour arrière documentaire : rétablir les versions antérieures par commit ciblé sur branche après revue si un fait est inexact ; ne pas réécrire les décisions. Aucun fichier source applicatif, workflow, SQL, lockfile ou secret modifié par M06.

## Complément après revue M08

`docs/planche/cahier-planche.md` reçoit une note applicable FR/EN (D-163/AGENTS) au-dessus de C1 ; traitement D-156 historique conservé. Aucun changement de traduction/interface, aucun test bilingue exécuté. Les20 documents,176 fichiers code,269 fiches et449 lignes restantes sont désormais contextualisés dans les rapports A2, avec les limites/125 chemins à rapprocher conservés ; voir index A0.

## Conclusion CI154 actualisée

Le relevé initial «CI en cours» est désormais remplacé par l’échec39117137782 sur76e43d1 : voir [diagnostic A6](A6/CI-PR154-76e43d1.md). Correction documentaire enregistrée ne signifie pas PR prête à fusionner ; aucun résultat antérieur ni causalité de l’échec transférés.
