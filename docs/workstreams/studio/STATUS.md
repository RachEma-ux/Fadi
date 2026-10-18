# État — Studio

Mis à jour : 2026-10-18 (UTC).

## État

**STUDIO-V1 : Vérifié par recette automatique, acceptation utilisateur à obtenir.** [PR #181](https://github.com/RachEma-ux/Fadi/pull/181), `feat/156-studio-v1`, empilée sur la garde DB [#169](https://github.com/RachEma-ux/Fadi/pull/169) / `9b34dca`. Le propriétaire a autorisé le code et le profil neuf/jetable ([ACK #166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6251787753)). Aucune fusion ni production.

La priorité est fonctionnelle : Fadi → Studio → projet autorisé → étude/variante → dessin 2D → modification → sauvegarde → fermeture/réouverture. Les préparations historiques restent dans [#172 / 149709e](https://github.com/RachEma-ux/Fadi/pull/172), sans nouvelle campagne documentaire ni clôture globale des missions/630 obligations.

## Faits vérifiés

- Recette réelle au [code 754382d](https://github.com/RachEma-ux/Fadi/commit/754382d97107e5a60cb4376050f45dfbf52ee72c) : **44 contrôles initiaux + 5 après redémarrage API/PostgreSQL + 3 de non-régression réussis**. Même document et même révision après redémarrage sur le même volume ; refus 401/403/404/409/400, concurrence, rejeu idempotent et instantané historique vérifiés. Ce sont des contrôles de recette, pas 52 fonctionnalités acceptées.
- UI réellement exercée : tracé à deux clics, rectangle numérique, sélection clavier, édition/déplacement, confirmation serveur, nouvelle session, mobile FR/EN. Le niveau Atelier est réellement persisté et son interface synchronisée ; Parcours conserve ses 21 étapes. Revues indépendantes A2/A5 favorables, captures inspectées par A5.
- TypeScript et builds réussis ; suites pures/web **1 691 tests réussis, un ignoré**, garde DB/orchestrateur **138 tests simulés réussis**. La suite API historique avec remise à zéro de base n'a pas été exécutée ; DB3 reste distinct.
- Profil local : PostgreSQL16/PostGIS3.4 neuf, rôle applicatif non administrateur, Node24/Chromium154. Identité/labels/volume/repère/endpoint vérifiés avant connexion ; reprise après changement de port Docker contrôlée. Secrets et état des comptes de recette hors Git. Les artifacts CI sont limités aux rapports expurgés et captures synthétiques.
- Main observée `817bd36`, inchangée ; #169 et #172 non fusionnées. La CI du HEAD publié est à consulter dans [les contrôles #181](https://github.com/RachEma-ux/Fadi/pull/181/checks) ; une preuve locale ne vaut pas conclusion CI.

## Points ouverts

**Coordination d’intégration nouvelle :** #178/#179/#180 ont été créées en parallèle après le démarrage autorisé de ce lot. Elles proposent navigation/études/variantes avec tables et routes différentes de #181. Ne pas fusionner cumulativement deux hiérarchies Studio. A2 qualifie seulement le raccord de code ; arbitrage de socle dans #166, sans bloquer la CI ni les preuves #181.

La validation personnelle et l'accès distant à la démo ne sont pas acquis. L'application locale est conservée sur la boucle locale du Cloud ; aucun tunnel public n'a été ouvert. Le périmètre suivant (2D pilote complet, 3D, association, Tool Manager, approbation/publication) n'est pas livré par cette tranche. Les preuves de ce lot ne ratifient pas les portes globales G1–G4 ni le MVP complet.

## Liens de suivi

[Programme #156](https://github.com/RachEma-ux/Fadi/issues/156) · [Canal #166](https://github.com/RachEma-ux/Fadi/issues/166) · [PR de code #181](https://github.com/RachEma-ux/Fadi/pull/181). A0 intègre ; A2 modèle/contrats, A3 API, A4 interface, A5 recette indépendante, A6 profil/CI ont réellement travaillé. A1 n'a pas été mobilisé pour ce lot de code.

## Préconditions de clôture

Vérifier la CI au SHA exact, faire constater le parcours au propriétaire et recueillir son acceptation. Pas de fusion automatique. Le SQL Studio est appliqué uniquement à la base neuve attestée ; aucun migrateur, schéma existant, sauvegarde, réglage GitHub ou déploiement de production n'est autorisé implicitement.
