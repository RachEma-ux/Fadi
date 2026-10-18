# A4 — PR recouvrantes, propriété future et checkpoint Mission 003

18 octobre 2026. Sources de faits machine : GITHUB-PREUVES.json (lectures API, aucune mutation). Référence locale de préparation `a09c11d397c8527987c3d1c4410ebb2eb240a819`, PR165. Cette contribution complète Mission002, sans refaire l'audit ni modifier les originaux. Rendu à A0 pour intégration documentaire autorisée ; aucun fichier du dépôt écrit par A4.

## Revalidation ciblée des trois PR

| PR | État observé / SHA tête | Preuve propre à la tête et limite |
|---|---|---|
| #142 | Ouverte, non fusionnée, mergeable=true ; `0d9606059f383e993b4bc69d57700ff411856919` | CI [38766145763](https://github.com/RachEma-ux/Fadi/actions/runs/38766145763) failure ; Project layout [38766145731](https://github.com/RachEma-ux/Fadi/actions/runs/38766145731) success. Jobs validate/image success ; e2e échoue étape53 planche-boutons ; étapes54–57 skipped, dont restauration. Pas de nouvelle analyse de cause racine ni relance. |
| #152 | Ouverte brouillon, non fusionnée, mergeable=true ; `f2777230e3e9c3bd6a2a5f61e2147acd1fba4b38` | CI [39083291384](https://github.com/RachEma-ux/Fadi/actions/runs/39083291384), garde-fous [39083291440](https://github.com/RachEma-ux/Fadi/actions/runs/39083291440), continuité/isolation success. Ne prouve pas frontières Studio futures ni application administrative des règles. |
| #154 | Ouverte, non fusionnée, mergeable=true ; `be0ac4c5e79e5a314f545117819188d69d9124e1` | CI [39092806498](https://github.com/RachEma-ux/Fadi/actions/runs/39092806498), continuité/isolation success. Deux remarques de revue sur ordre de reprise et checkpoint toujours dans le diff lu ; CI n'en vaut pas résolution. |

L'état mergeable est une observation transitoire de l'API, pas une autorisation ni validation métier ; le rapport Mission002 indiquait false pour #142, fait ancien désormais différent. Les wrappers de runs listent les workflows déclenchés par PR sur première page : ce relevé n'est pas un inventaire administratif exhaustif. Les 593/593 d'a383fa… restent historiques et ne remplacent pas les runs de tête ci-dessus. Aucun run n'a été déclenché.

Diff #142 lu par patches paginés complets : 29 fichiers, dont ProjectShell/ProjectModuleNav/use-immersive/project-layout.css, Plan2D/BarreActions, styles et menus flottants Planche, Collaboration et nombreuses recettes. Retire l'immersion automatique et réorganise largeur/navigation. **Recouvrement UX réel**, pas prétexte pour copier silencieusement sa solution. Son échec courant est désormais planche-boutons, pas les quatre anciens échecs atelier-complements cités sur a383fa… ; la cause de l'échec courant n'est pas attribuée sans logs.

Diff #152 lu par patches complets : 13 fichiers, scripts frontières/isolation, workflow architecture-guards, propositions ruleset et reprise architecture-guards ; **pas de modification navigation applicative directe**. Le futur namespace Studio et ses façades devront satisfaire un garde-fou approuvé, pas échapper aux imports littéraux ou introduire un cycle. A2/M07 possède l'intégration technique.

Diff #154 lu : nouveau relais `docs/ai-team/CHATGPT-CODEX-HANDOFF.md`. La reprise doit conserver l'ordre canonique HANDOFF→STATUS→TASKS→CONTEXT et checkpoint STATUS/HANDOFF avant revue. Deux remarques de revue lisibles : [ordre](https://github.com/RachEma-ux/Fadi/pull/154#discussion_r4305532044), [cycle](https://github.com/RachEma-ux/Fadi/pull/154#discussion_r4305532045). A0/M06 propose correction documentaire de cette PR sous autorisation applicable, sans créer un deuxième relais.

## Compromis proposés pour M002-D06

1. Poursuivre M13/M21 spécification et M15/M26 oracles sans attendre une fusion : aucune dépendance documentaire circulaire.
2. Traiter #152 avec A2 avant évolution des frontières Studio ; #154 en parallèle pour continuité, sans fusion automatique ni suppression de réserves.
3. Isoler revue/résolution autorisée du problème #142 et revalider sa tête/CI avant sa fusion éventuelle. Le lot Studio I peut être préparé sans la fusion, mais ne doit pas toucher concurremment ses fichiers. Si décision est de différer #142, consigner explicitement la base et ne porter que les adaptations Studio autorisées sans refaire son correctif général.
4. Après décision #142, recalculer diff et adapter maquette/NAV sur la base retenue. Les trois PR ne sont pas un lot unique obligatoire ; aucun ordre de fusion prétendument acquis.

## Un propriétaire d'écriture par fichier, affectation future candidate

| Fichiers / surface | Propriétaire futur unique du lot | Consultations / conflit |
|---|---|---|
| App.tsx, AppShell.tsx, HomeTopbar.tsx, façade contexte publique à définir | A3 intégré par A0, contrat A2 ; A4 spécifie | I.1–I.3, bandeau et droits ; pas un second writer A4. |
| ProjectShell.tsx, ProjectModuleNav.tsx, use-immersive.ts, project-layout.css, styles globaux | Responsable #142 jusqu'à fin de son lot ; A0 réattribue ensuite à A3 lot I | Base/recette avant modifications ; pas de changement Atelier présumé par Studio. |
| outils.ts, catalogue-outils.ts, machines, alias/commandTypes | A3 du sous-lot M05/M21 après contrat A2 | A4 profils/labels ; collisions echelle et persistance, aucun rename silencieux. |
| Barres/icônes/menus Planche et messages.ts/en.json | A3 du lot borné, affectation exclusive A0 | A4 fournit FR/EN + accessibilité ; conflits #142 et règle D-202. |
| scripts/check-module-deps.mjs, check-fadi-isolation.mjs, architecture-guards workflow | Propriétaire #152 / A2 contrat, A3 autorisé pour code | Garder garde-fous publics, imports explicites ; aucun désarmement pour Studio. |
| Recettes partagées + futurs NAV | A5 propriétaire assertions, A3 implémente harness seulement dans lot convenu | Ne pas faire deux versions d'un même test ni réduire assertions métier. |
| Relais ChatGPT-Codex et STATUS/HANDOFF ai-team/studio/registre | A0/M06/M29 exclusivement | A4 produit ces contributions externes, A0 intègre ensemble ; #154 source séparée tant que non fusionnée. |

## État des missions et blocages ciblés

| Tâche | Mission/agent | Statut de travail | Preuve réelle | Prochaine action |
|---|---|---|---|---|
| Routes/contexte/états détaillés | M13 A4→A2 | Préparation livrée, contrat à arbitrer | CONTRAT-NAV-CANDIDAT.md | A2 rapproche autorités/façades, A0 soumet M002-D07. |
| Neuf fiches NAV | M13/M16/M26 A4+A5 | Préparées, non exécutées | NAV-FICHES.md | A5 lie aux EX/INV/IF/AC et corpus ; aucune recette sans capacités/cible sûre. |
| Profils/Manager/alias | M21 A4+A2 | Préparation livrée, choix ouverts | M21-MANAGER-PREPARATION.md | M05/M17 identifient IDs persistés ; arbitrer DEC-04/05/06/07/14/18. |
| #142 revalidation | M00/M13 A4 | Faits API vérifiés | GITHUB-PREUVES.json | Propriétaire diagnostique échec53 après autorisation adaptée ; aucune fusion ici. |
| Implémenter I/B | M16/M21 futur A3 | Bloqué AUTORISATION_REQUISE | Gates/permissions non démontrés | Utilisateur autorise le sous-lot après G3, contexte approuvé. |

Blocages : M002-D07 (produit/utilisateur, maquette/routes/transitions/rôles/appareils) ; M002-D06 (A0 prépare/utilisateur arbitre PR) ; M17 (A2 modèle contexte/permissions/commandes) ; DEC propres à B ; G3/accord code. Aucun de ces blocages n'empêche l'achèvement documentaire livré ici. Aucun essai mutateur tenté ; aucune limite contournée.

## Livrables et arrêt sûr

- CONTRAT-NAV-CANDIDAT.md : route complète et états/permissions/FR-EN/plein écran/pending, séparation imposé/proposé, préparation M16.
- NAV-FICHES.md : neuf scénarios positifs/négatifs/oracles/environnements/preuves ; résultats non exécutés.
- M21-MANAGER-PREPARATION.md : identités/alias, collision echelle requalifiée statiquement, profils/lifecycle et critères.
- GITHUB-PREUVES.json : metadata, workflows et jobs #142, fichiers patch #142/#152.
- Présent checkpoint : limites/propriétés/compromis et action suivante.

Originaux Mission002 préservés. Aucun commit, PR, fusion, administration, base, navigateur mutateur, déploiement ou modification du dépôt. Agent A4 réellement exécuté en lecture/spécification ; coordination A2/A5 par messages. Action de reprise : lire le checkpoint A0 et vérifier la base courante ; A0 intègre ces documents non sensibles dans sa branche autorisée avec STATUS/HANDOFF ; A2/A5 valident les interfaces/oracles, puis soumettre décisions précises restantes. Préparation ne signifie pas G1 accepté ou M16/M21 implémentés.
