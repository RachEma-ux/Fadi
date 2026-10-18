# Codex — exécuter le programme Fadi et Studio sans omission

Programme : [Issue #156](https://github.com/RachEma-ux/Fadi/issues/156). Création : 18 octobre 2026. Branche de préparation : `docs/156-codex-missions-completes` ; ne pas supposer cette branche fusionnée.

## 1. Mandat

L’utilisateur demande de préparer toutes les missions, de les enregistrer dans GitHub et d’y donner les instructions pour les exécuter toutes sans en abandonner aucune. Le programme comprend **31 missions M00–M30**, les réserves de l’audit A0 et **les 630 tâches de STUDIO-TASKS-001**. Le [catalogue](MISSIONS.md) est à exécuter, pas seulement à résumer.

**Ne pas s’arrêter après le plan, la première mission ou la première PR.** Poursuivre chaque action autorisée dont les préconditions sont satisfaites. Une limite d’outil, de session ou de permission impose un checkpoint et une reprise explicite, jamais une réussite fictive ou un abandon silencieux. Ces fichiers sont des instructions : leur présence ne lance pas automatiquement Codex et ne constitue pas un service permanent.

## 2. Lire avant toute action

Lire `AGENTS.md`, `docs/continuity/README.md`, puis, pour chaque chantier concerné, **HANDOFF → STATUS → TASKS → CONTEXT**, l’Issue et la PR. Vérifier ensuite HEAD, base distante, diff, CI et autorisations actuelles. Le nom local `work` n’est pas une anomalie par lui-même ; la référence vérifiable est le SHA.

Consulter [les sources et permissions](SOURCES-AND-AUTHORIZATIONS.md), [missions.json](missions.json) et les cahiers exacts du dossier `Studio/`. L’audit A0 est une archive datée dans `docs/audits/2026-10-18-a0-codex-cloud.md`, pas un verdict éternel. Le relais ChatGPT–Codex de #153/PR #154 doit être lu sur sa branche tant que sa fusion n’est pas confirmée ; ne pas créer un second relais concurrent.

Pour ce programme, reprendre `docs/workstreams/ai-team/`. Pour Studio, reprendre `docs/workstreams/studio/`. Les journaux de `architecture-webapp`, `purge-drawall`, Atelier, Planche et exploitation restent canoniques pour leurs propres décisions et faits.

## 3. Autorisations et portes obligatoires

La préparation, les diagnostics en lecture seule, les spécifications, le registre des missions et leurs mises à jour documentaires sur branche/PR sont à poursuivre sans demander une confirmation à chaque tâche. **La demande de tout traiter ne ratifie pas l’audit, les DEC, les G0–G4 ni une refonte implicite.**

Avant un correctif applicatif, un POC, une migration de schéma ou un sous-lot Studio, retrouver l’autorisation explicite qui couvre ce travail et les portes applicables. À défaut, terminer sa préparation, inscrire le blocage `AUTORISATION_REQUISE` et soumettre le lot précis ; continuer les autres tâches prêtes. A3 ne code pas un lot non autorisé. Une autorisation déjà donnée et toujours applicable ne doit pas être redemandée inutilement : la citer avec son périmètre.

Fusion, modifications administratives GitHub, permissions, achat/service payant, production/VPS, migration sensible et changement de sauvegardes nécessitent leur accord distinct. Une publication de configuration Cloud n’est pas un déploiement de Fadi. Ne pas modifier `main` directement, activer un contournement ou fusionner pour « débloquer » une mission. Respecter #149 ; vérifier les jalons déjà réalisés au lieu de répéter un déploiement ou une sauvegarde par hypothèse.

## 4. Affecter les agents réellement disponibles

A0 coordonne ; A1 produit/méthodologie ; A2 architecture/CAO et isolation ; A3 développement autorisé ; A4 UX/UI ; A5 qualité/sécurité ; A6 DevOps. Les rôles BIM, documentation et calcul du référentiel doivent avoir un responsable explicite dans cette équipe, avec validation humaine compétente lorsque nécessaire.

N’activer que les rôles utiles. Si les outils permettent réellement des sous-agents, déléguer les analyses indépendantes avec contrat, contexte et retour structurés. Sinon, exécuter séquentiellement les mêmes missions ou préparer les tâches Codex distinctes réellement lançables. Ne jamais simuler une délégation ni inventer des comptes rendus d’agents.

Deux agents d’écriture n’interviennent pas dans la même copie de travail. Utiliser branches/copies isolées, un lot borné par branche, pas une branche permanente par module ou agent. A0 réserve les fichiers partagés (registre, navigation, schémas, contrats, lockfile, workflows) et organise leur intégration. Aucun montage partagé d’une base de production.

## 5. Couvrir chaque tâche, sans masquer les doublons de finalité

Exécuter `python3 docs/ai-team/check_missions.py --check`, puis `--export /tmp/fadi-mission-map-<identifiant-unique>` pour obtenir la liste explicite des **630 identifiants, textes sources, propriétaires de mission et lignes**. L’export refuse d’écraser un fichier existant. Le registre associe chaque case source exactement une fois, sans renuméroter EX/INV/IF/AC/TEST/NAV/DEC.

Les plages de lignes de `missions.json` sont verrouillées sur le blob source identifié. Un changement autre que l’état d’une case bloque la validation : migrer le registre après revue, sans faire disparaître une tâche. Les tâches de qualification TR ne sont pas des exigences réécrites ; relever leur libellé exact dans REF-02. Compléter une fiche ne prouve pas la conformité de sa fonction. Une recette citée dans plusieurs lots reste le même scénario, pas plusieurs tests différents.

Au premier checkpoint autorisé, conserver dans le chantier Studio le registre détaillé issu de l’export, enrichi pour chaque ID : état de travail, verdict de conformité, état du test, responsable, dépendances, Issue/PR, composant, preuve, décision et prochaine action. Ne jamais réinitialiser un registre déjà enrichi. La checklist et ce registre doivent rester cohérents ; aucun résultat n’est déduit de la seule présence d’un fichier ou d’un bouton.

## 6. Boucle d’exécution obligatoire

1. Actualiser les faits et sélectionner la prochaine **sous-tâche** autorisée avec entrées disponibles. Les dépendances portent sur des contrats/livrables précis, pas automatiquement sur la clôture d’une mission entière : X est transversal, des critères finaux A/B attendent E/R et des DEC ne concernent que certains lots.
2. Identifier source, résultat attendu, périmètre, fichiers, tests, risques, validation et droits avant l’action. Réutiliser les Issues/PR existantes avant d’en créer une autre. Un groupe de missions n’impose pas une PR géante : découper les changements cohérents.
3. Exécuter dans ce périmètre. Réparer les échecs reproductibles lorsqu’ils sont couverts par l’autorisation ; ne pas élargir silencieusement le lot. Ne pas remplacer un test en échec par une assertion plus faible, un skip ou une suppression de fonctionnalité.
4. Vérifier les résultats sur le SHA exact et la base de référence. Distinguer tests prescrits, lus dans un ancien journal, relancés et acceptés. Un contrôle IFC de schéma ne prouve pas une conservation paramétrique intégrale.
5. Publier le diff autorisé et les preuves non sensibles dans la PR/les artefacts ; enregistrer **STATUS et HANDOFF dans le même checkpoint avant revue**. Cycle canonique : **Issue → branche courte → PR → preuves → STATUS/HANDOFF → revue**. Une mise à jour de code après un résultat exige la requalification des tests pertinents.
6. Passer à la prochaine tâche prête. Ne pas attendre une revue ou un accord de production pour poursuivre une mission documentaire indépendante. A0 consolide les résultats sans les présenter comme ses propres exécutions.

## 7. Échecs, blocages et fin de session

Un blocage conserve : ID, cause, source de l’erreur, essais effectués, responsable, capacité/permission/décision manquante, action de déblocage, dépendances affectées et prochaine vérification. Après trois tentatives documentées fondées sur des hypothèses différentes, ou avant si risque/permission, suspendre la sous-tâche concernée et escalader. Ce seuil évite une boucle aveugle, **pas** le suivi de la tâche. Ne pas répéter indéfiniment un appel 403, augmenter des permissions, consommer sans borne ou détruire des données pour progresser.

Une option F est à instruire, puis à exécuter si retenue. Report ou exclusion nécessitent une décision explicite, restent visibles et ne cochent jamais la réalisation. Le pilote n’attend pas une option officiellement exclue, mais le programme ne la fait pas disparaître.

Avant toute interruption, même imposée : enregistrer les faits disponibles, l’état du diff, les tests réellement terminés et la **prochaine action exacte**. Si l’écriture GitHub est indisponible, fournir le checkpoint local et signaler clairement qu’il n’est pas encore enregistré à distance. Ne pas prétendre poursuivre en arrière-plan sans processus réel. À la session suivante, relire le checkpoint puis revalider l’état actuel.

## 8. Invariants de sécurité et de produit

Fadi seul ; ne jamais agir sur le dépôt DrawAll. Préserver les fonctions industrielles, les normes et leur provenance/licence légitime ; aucun retrait fondé sur un préfixe `DA-`. Conserver les 21 étapes, Harmonie intégrée, modèles géométriques hors React, commandes/révisions et droits serveur. Studio autonome dans Fadi ne signifie ni iframe Atelier, ni seconde application, ni seconde autorité métier.

Ne jamais lancer la suite API/E2E destructrice avant vérification de la cible jetable et des protections de M02. Une variable `TEST=true`, un nom de base ou `localhost` seuls ne prouvent pas une cible sûre. Aucune valeur secrète, donnée client, dump ou URL privée dans ce dépôt public. Ne pas modifier les données de production, les timers ni la rétention.

## 9. Première séquence concrète

M00 : revalider état et couverture ; M01 : qualifier Cloud ; M02 : préparer la protection des tests ; M03 : préparer/vérifier #146 ; M05–M09 : réconcilier les constats sans dupliquer #152/#154. En parallèle : M11/M12 cadrage et qualification, M13 navigation/architecture, préparation M15 et M26, M29 suivi.

M10 vérifie les jalons #149 sans les présumer ni les répéter. M14 instruit G2/G3 avec autorisations par POC/sous-ensemble. Puis I/X/A.1 ; A.2/A.3 et B sur contrats stables ; association A.4/A.5 ; C/D selon charge ; E et recettes ; migration/R/G4 ; F selon ses arbitrages. M30 contrôle J0–J8 et la clôture réelle. Cette séquence est détaillée par mission, et doit être ajustée aux preuves/contrats, pas transformée en barrière globale circulaire.

## 10. Sortie attendue et instruction de reprise

Rapporter : travaux terminés avec preuves, tâches en cours, blocages, décisions requises, agents réellement exécutés, couverture du registre et prochaine action. Ne dire « tout terminé » que lorsque toutes les obligations du périmètre accepté disposent de leur preuve et acceptation ; publier séparément les options reportées/exclues et les blocages résiduels. Une couverture **630/630** prouve l’affectation documentaire, jamais 630 réalisations.

**Instruction courte :** « Reprends #156 dans RachEma-ux/Fadi. Lis AGENTS.md, docs/ai-team/CODEX-START-HERE.md et le HANDOFF du chantier. Vérifie la branche du plan, le HEAD réel, les permissions et le registre. Exécute toutes les sous-tâches autorisées prêtes, sans abandon, avec preuves et checkpoints. Préserve les tâches bloquées et continue les indépendantes ; soumets uniquement les décisions effectivement nécessaires. »

## 11. Contrôle horaire, questions et accusé de lecture

L'utilisateur demande une vérification et un rapport **chaque heure**, ainsi que des questions Codex **directement dans GitHub**. Lire et appliquer [CODEX-HOURLY-OPERATIONS.md](CODEX-HOURLY-OPERATIONS.md) avant la prochaine sous-tâche.

- Canal obligatoire : [Issue #166](https://github.com/RachEma-ux/Fadi/issues/166). Poster `[CODEX-ACK]` avec SHA/branche/documents lus et la sous-tâche active **dès lecture**, puis `[CODEX-PROGRESS]` avec preuves lorsque le travail avance ; poser les questions sous `[CODEX-QUESTION][Q-ID][OPEN]` dans la même Issue.
- Les réponses techniques et les décisions en attente seront contrôlées à cadence horaire par ChatGPT, **si l'accès GitHub est disponible**. Ne pas supposer une réponse ou un accord tant qu'ils ne sont pas visibles et attribués.
- Chaque rapport distingue **PDEV (développement fonctionnel, calculable uniquement après baseline vérifiée)** et **P630 (IDs de checklist réellement terminés sur 630)** ; jamais 630/630 d'affectation présentés comme 100 % d'exécution.
- Une tâche active Codex ou un mécanisme d'exécution réellement configuré est nécessaire : GitHub et l'automatisation de contrôle n'exécutent pas le code par eux-mêmes. Si aucun `CODEX-ACK` n'apparaît, la mise en route doit être considérée **non confirmée** et non réussie.
