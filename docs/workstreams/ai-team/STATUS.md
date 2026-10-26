# État — équipe Codex Fadi

## Studio — rapprochement complet — 25 octobre 2026

Registre Studio : **0 À définir / 56 À faire / 104 En cours / 24 Implémenté / 11 Bloqué / 376 Vérifié / 59 Accepté** ; **P630=435/630**. Détail : `docs/workstreams/studio/STATUS.md`.

## Studio — 25 octobre 2026

Registre Studio après les décisions déléguées ADR-STUDIO-PILOTE-01 et la recette du pilote : compteurs de ce point d'étape (historique) : 16 à définir, 205 à faire, 291 en cours, 11 bloquées, 74 vérifiées, 33 acceptées ; P630 valait alors 107 sur 630. Le détail est dans `docs/workstreams/studio/STATUS.md`.

## Checkpoint courant — 21 octobre 2026

Référence examinée : `main@78e9f4a89e9634189c3bd4fb9ed82576eafe2a64` (#222), après consolidation #209. Le code porte les quatre domaines Studio et les lots Sandbox 1–6 ; les anciennes instructions de fusion #181 ci-dessous sont historiques, plus une action à exécuter. La branche corrective de cet audit traite sauvegarde locale, cohérence des compteurs et nettoyage de la branche d'exploitation.

Compteurs du registre au 21 octobre (historique, remplacés le 25 octobre) : 22 à définir, 58 à faire, 292 en cours, 209 bloquées, 47 vérifiées, 2 acceptées ; P630 valait alors 49 sur 630 ; ce compteur documentaire/cadrage n'est pas un pourcentage du logiciel livré. PDEV reste non défini. Aucune tâche du registre n'a été promue à partir de la seule présence de code.

Preuves actuelles : sources au SHA ci-dessus ; vérification locale de l'audit : types, frontières, isolation, structure de continuité et affectation 630/630 réussis. Le contrôle `tableau_registre.py --controle` est réparé et ajouté à la CI par ce correctif. Résultats finaux de la branche et liens vers les exécutions : PR du correctif, à vérifier au SHA exact.

Prochaine action : terminer la CI du correctif, contrôler les trois parcours de Studio selon `docs/continuity/AUDIT-REMEDIATION-2026-10-21.md`, puis valider les scénarios métier. L'activation des checks requis nécessite une connexion administrateur ; ni une proposition JSON ni une CI verte ne prouvent son activation. L'installation du minuteur VPS, la version réellement servie et une restauration réelle ne sont pas attestées par cet audit GitHub. Les fonctions IA annoncées indisponibles restent indisponibles ; aucune conformité complète G1–G4 n'est déduite.

## Archive — checkpoint du 18 octobre 2026

Les faits et restrictions ci-dessous sont conservés pour traçabilité de cette ancienne mission. Ils ne décrivent pas l'état courant de main et ne constituent pas une nouvelle instruction de fusion ou de déploiement.


Mis à jour : 2026-10-18 (UTC).

## État

Autorisation du propriétaire : fusionner #181. Le candidat reprend `main@050e1d46` (#172 documentaire fusionnée pendant les contrôles), conserve les registres et intègre les commits de garde DB déjà présents dans la tranche testée. Les PR #178–#180 ne sont pas fusionnées cumulativement ; leurs apports restent à raccorder à un seul socle. Aucune opération de production autorisée.

**STUDIO-V1 : Vérifié par recette automatique, acceptation utilisateur à obtenir.** [PR #181](https://github.com/RachEma-ux/Fadi/pull/181), `feat/156-studio-v1`, contenant les commits déjà testés de la garde DB [#169](https://github.com/RachEma-ux/Fadi/pull/169) / `9b34dca`. Le propriétaire a autorisé le code et le profil neuf/jetable ([ACK #166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6251787753)). Le propriétaire a autorisé la fusion en chat (« Vas y fusionne »). La production reste exclue.

La priorité est fonctionnelle : Fadi → Studio → projet autorisé → étude/variante → dessin 2D → modification → sauvegarde → fermeture/réouverture. Les préparations historiques restent dans [#172 / 149709e](https://github.com/RachEma-ux/Fadi/pull/172), sans nouvelle campagne documentaire ni clôture globale des missions/630 obligations.

## Faits vérifiés

- Recette réelle au [code 3b7fb25](https://github.com/RachEma-ux/Fadi/commit/3b7fb25d2ae8f78682c09cad5b935f0937dae4a5) : **44 contrôles initiaux + 5 après redémarrage API/PostgreSQL + 3 de non-régression réussis**. Même document et même révision après redémarrage sur le même volume ; refus 401/403/404/409/400, concurrence, rejeu idempotent et instantané historique vérifiés. Ce sont des contrôles de recette, pas 52 fonctionnalités acceptées.
- UI réellement exercée : tracé à deux clics, rectangle numérique, sélection clavier, édition/déplacement, confirmation serveur, nouvelle session, mobile FR/EN. Le niveau Atelier est réellement persisté et son interface synchronisée ; Parcours conserve ses 21 étapes. Revues indépendantes A2/A5 favorables, captures inspectées par A5.
- TypeScript et builds réussis ; suites pures/web **1 691 tests réussis, un ignoré**, garde DB/orchestrateur **138 tests simulés réussis**. La suite API historique avec remise à zéro de base n'a pas été exécutée ; DB3 reste distinct.
- Profil local : PostgreSQL16/PostGIS3.4 neuf, rôle applicatif non administrateur, Node24/Chromium154. Identité/labels/volume/repère/endpoint vérifiés avant connexion ; reprise après changement de port Docker contrôlée. Secrets et état des comptes de recette hors Git. Les artifacts CI sont limités aux rapports expurgés et captures synthétiques.
- Main revalidée `050e1d46` après fusion externe de #172 ; les ajouts documentaires et registres de #172 sont conservés. #169 est incluse comme dépendance de code de #181, pas comme nouvelle portée fonctionnelle. La CI du HEAD publié est à consulter dans [les contrôles #181](https://github.com/RachEma-ux/Fadi/pull/181/checks) ; une preuve locale ne vaut pas conclusion CI.

## Points ouverts

**Coordination d’intégration nouvelle :** #178/#179/#180 ont été créées en parallèle après le démarrage autorisé de ce lot. Elles proposent navigation/études/variantes avec tables et routes différentes de #181. Ne pas fusionner cumulativement deux hiérarchies Studio. A2 qualifie seulement le raccord de code ; [arbitrage Q-STUDIO-SINGLE-SOURCE-01](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6252110312), sans bloquer la CI ni les preuves #181.

La validation personnelle et l'accès distant à la démo ne sont pas acquis. L'application locale est conservée sur la boucle locale du Cloud ; aucun tunnel public n'a été ouvert. Le périmètre suivant (2D pilote complet, 3D, association, Tool Manager, approbation/publication) n'est pas livré par cette tranche. Les preuves de ce lot ne ratifient pas les portes globales G1–G4 ni le MVP complet.

## Liens de suivi

[Programme #156](https://github.com/RachEma-ux/Fadi/issues/156) · [Canal #166](https://github.com/RachEma-ux/Fadi/issues/166) · [PR de code #181](https://github.com/RachEma-ux/Fadi/pull/181). A0 intègre ; A2 modèle/contrats, A3 API, A4 interface, A5 recette indépendante, A6 profil/CI ont réellement travaillé. A1 n'a pas été mobilisé pour ce lot de code.

## Préconditions de clôture

Vérifier la CI au SHA exact, faire constater le parcours au propriétaire et recueillir son acceptation. Fusion de #181 autorisée explicitement par le propriétaire après vérification du candidat réconcilié ; cette autorisation ne vaut pas constat d’une recette personnelle ni clôture du MVP. Le SQL Studio est appliqué uniquement à la base neuve attestée ; aucun migrateur, schéma existant, sauvegarde, réglage GitHub ou déploiement de production n'est autorisé implicitement.
