# Fadi AI Team — contrôle horaire, instructions Codex et questions GitHub

**Programme :** [#156](https://github.com/RachEma-ux/Fadi/issues/156) ; [PR de préparation #165](https://github.com/RachEma-ux/Fadi/pull/165) ; **questions :** [#166](https://github.com/RachEma-ux/Fadi/issues/166).
**Périmètre :** 31 missions M00–M30 ; 630 identifiants Studio, définis par la checklist source. Ce document complète [CODEX-START-HERE.md](CODEX-START-HERE.md), `AGENTS.md` et le protocole de continuité : il n'en change pas la préséance.

## 1. Exécution obligatoire pour toute session Codex effectivement lancée

1. Lire d'abord `AGENTS.md`, `docs/continuity/README.md`, `docs/workstreams/ai-team/HANDOFF.md` → `STATUS.md` → `TASKS.md` → `CONTEXT.md`, puis `docs/ai-team/CODEX-START-HERE.md`, `MISSIONS.md`, `missions.json` et ce protocole. Pour Studio, lire son HANDOFF/STATUS/TASKS/CONTEXT sur la branche #165 tant que non fusionnée.
2. Vérifier HEAD/branche, les différences avec `main`, les Issues/PR et la CI au SHA exact. **Ne pas supposer une fusion de #165 ou #154.**
3. Accuser réception par **un commentaire** `[CODEX-ACK]` dans [#166](https://github.com/RachEma-ux/Fadi/issues/166) comportant date, SHA, branche, documents lus, mission active, tâches indépendantes prêtes et prochaine opération autorisée. L'accusé est une **preuve de lecture**, pas une preuve d'exécution complète.
4. Récupérer les pièces originales Mission 002 (rapports A1/A2/A4/A5/A6, registre enrichi des 630 IDs, extraction des 104 EX et autres preuves) si elles sont accessibles ; ne pas relancer l'audit complet ni inventer les pièces absentes. Poursuivre M00/M29, puis toutes les préparations indépendantes autorisées décrites dans le HANDOFF.
5. Pour chaque sous-tâche, enregistrer statut, preuve datée, référence de commit, agent réel, dépendance et **action suivante**. Publier dans l'Issue/PR correspondante avec `[CODEX-PROGRESS]` pour toute avancée significative ; actualiser STATUS et HANDOFF ensemble avant revue/interruption.
6. Ne pas arrêter globalement le programme après une PR ou un blocage ; continuer les sous-tâches autorisées et indépendantes. En cas de permission manquante, suspendre seulement l'opération concernée. Ne pas simuler une présence continue, une session active ou un agent non lancé.
7. Les **corrections applicatives/POC/tests destructifs** requièrent l'autorisation du lot et une cible de test explicitement jetable ; les changements de règles GitHub, la fusion, le déploiement, la migration sensible et les sauvegardes exigent les validations distinctes prévues. A3 ne code pas sans ces autorisations.

**Précision importante :** ni ce document, ni un commentaire GitHub, ni un contrôle horaire ne démarrent automatiquement une nouvelle session Codex. Il faut **une tâche Cloud active** ou une intégration d'exécution séparément configurée. Une automatisation qui vérifie GitHub doit donc signaler `EXÉCUTION CODEX NON CONFIRMÉE` s'il manque l'ACK ou les nouvelles preuves.

## 2. Canal obligatoire des questions

**Issue unique : [#166 — Questions Codex ↔ ChatGPT](https://github.com/RachEma-ux/Fadi/issues/166).** Éviter des questions dans de nombreux fils non repérés, sans interdire les commentaires de revue de code des PR.

Toute question de Codex prend la forme suivante, avec identifiant stable :

```text
[CODEX-QUESTION][Q-<ID>][OPEN]
Mission Mxx / tâche :
Agent et preuve d'exécution :
Branche/HEAD/PR :
Question précise et pourquoi elle bloque :
Sources vérifiées, alternatives et recommandation :
Type : clarification technique | arbitrage produit | autorisation sensible
Prochaine tâche indépendante poursuivie :
```

**Réponses :** les contrôles horaires liront l'Issue #166 et répondront dans le même fil sous `[CHATGPT-ANSWER][Q-<ID>]`, avec preuves et incertitudes. En cas de décision réservée au propriétaire (pilotage du produit, fusion, changements administratifs, production, tests destructifs), une réponse informative devra être libellée `[NEEDS-USER-DECISION][Q-<ID>]` et NE constituera PAS l'autorisation. Codex cite la réponse, vérifie sa portée, journalise la résolution ; une réponse ne clôt pas une tâche sans exécution/recette.

Ne jamais publier dans l'Issue publique de secrets, informations clients, identifiants de services, URL de monitoring privées ou données de base de production.

## 3. Suivi horaire externe et limites

La tâche ChatGPT horaire est distincte de Codex. À chaque cycle, elle doit tenter de :
- Lire `main`, la PR #165 et les PR/Issues liées au programme, les commits, commentaires `CODEX-ACK`/`CODEX-PROGRESS`, runs CI et fichiers STATUS/HANDOFF réellement disponibles sur leur branche.
- Lire les nouvelles questions de #166, répondre aux points **factuels/techniques** documentés dans GitHub, et transmettre les arbitrages ou permissions nécessaires à l'utilisateur sans les approuver elle-même.
- Comparer au contrôle précédent **uniquement lorsque la preuve du précédent contrôle est disponible** ; sinon écrire « tendance non établie ».
- Publier un rapport horaire dans ChatGPT, sans supposer que GitHub, Codex ou des sources non connectées sont accessibles ; indiquer explicitement les contrôles impossibles.
- Ne jamais déduire « Codex exécute » de la seule présence de la PR, des instructions ou d'une exécution CI. Chercher ACK daté ET modification/checkpoint/rapport du travail effectué avec preuve.

Ce suivi horaire **ne lance pas, ne relance pas et ne garantit pas** l'exécution Cloud de Codex. Il peut relancer le suivi documentaire et mettre en évidence toute absence d'activité, mais la création d'une tâche Codex ou l'intégration d'exécution est une étape indépendante.

## 4. Pourcentage — ne pas confondre couverture et réalisation

Deux indicateurs sont publiés, avec sources et dénominateurs.

**A — Avancement du programme Studio** (`P630`) : 
- Dénominateur **630** IDs de STUDIO-TASKS-001.
- Numérateur `V630` : nombre d'IDs uniques **terminés ET vérifiés/acceptés selon la nature de la tâche**, avec preuve GitHub datée et identifiant exact ; aucun doublon. Une tâche « préparée », « proposée », « en cours », « bloquée », « non applicable » sans décision, ou une affectation M00–M30 ne compte PAS.
- `P630 = 100 × V630 / 630`, affiché à une décimale. Si le registre vérifiable est absent ou inaccessible, **ne pas fabriquer V630 : indiquer « N/D »**.
- Il s'agit de l'avancement vérifiable des **630 tâches hétérogènes** (docs, décisions, tests, développement, livraison). Cet indicateur **n'est PAS le pourcentage du code Fadi déjà construit**.

**B — Développement fonctionnel total** (`PDEV`), indicateur demandé pour le TITRE :
- Dès que le registre est qualifié, déterminer et versionner dans le suivi l'ensemble explicite `DEV_SCOPE` des **tâches de réalisation logicielle** de Studio/Fadi du périmètre accepté, avec leurs IDs et exclusions décidées. Conserver les autres tâches de cadrage, décision et tests dans P630.
- `D = |DEV_SCOPE|` ; `V =` IDs de `DEV_SCOPE` dont l'implémentation est **vérifiée sur commit et tests pertinents**, éventuellement acceptée quand la validation métier est requise.
- `PDEV = 100 × V / D` à une décimale, avec les valeurs `V/D` et le SHA. En absence de périmètre exact et de preuves de baseline, écrire **« N/D % — Développement total Fadi/Studio (baseline à établir) »** plutôt qu'un 0 % fictif ou un pourcentage estimé.
- Ne pas inclure arbitrairement les fonctions Fadi anciennes dans le dénominateur Studio sans les inventorier. Ne pas changer D silencieusement : toute évolution cite sa décision et présente ancien/nouveau périmètre.

**Format de rapport horaire obligatoire :**

```text
# [PDEV% ou N/D %] — Avancement du développement total Fadi / Studio
Heure suisse (Europe/Zurich) : ...
Source : dépôt RachEma-ux/Fadi ; main SHA ... ; PR #165 head SHA ...
PDEV : V/D (ou N/D, avec raison) ; P630 : V630/630 = X % (ou N/D).
Depuis le rapport précédent : faits nouveaux avec preuves et liens.
Codex : [ACK confirmé et activité prouvée / aucune activité prouvée / inaccessible].
Missions M00–M30 : nouveaux statuts, blocages et agents réellement actifs.
CI : check, commit exact, date, état ; aucun vert transféré d'un autre SHA.
Questions GitHub #166 : nouvelles, répondues, en attente d'accord utilisateur, non lisibles.
Sécurité : base de tests, main protected, droits ; changements uniquement autorisés.
Actions réalisées lors du contrôle : ...
Prochaine opération Codex autorisée : ...
```

Si aucun progrès vérifiable : **indiquer « aucun progrès nouveau attesté »**, conserver le dernier indicateur connu avec sa date ; ne pas prétendre à une progression horaire artificielle.

## 5. Sécurité et gouvernance

- Dépôt Fadi uniquement ; DrawAll reste complètement indépendant ; préserver les normes, moteurs et fonctions industrielles comme capacités natives.
- Conserver les 21 étapes Parcours et l'architecture modulaire ; Studio ne doit ni écraser Atelier ni créer une seconde autorité de données.
- Jamais de secrets dans le dépôt public ; pas de fusion de #165, ni d'activation de règle GitHub, ni de déploiement sur fadimmo.com par ce protocole.
- Au moindre conflit documentaire, consigner les deux sources, leur statut et la décision requise. Les réussites de 1 757 tests, 47 scénarios et 3 IFC de Mission 001/002 sont **historiques** tant qu'elles ne sont pas reproduites au SHA retenu.
