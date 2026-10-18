# FADI — MISSION 004 · Exécution coordonnée après délégation

> **ATTENTION — NE PAS ARRÊTER LE PROGRAMME À LA FIN DE LA MISSION 004.** Le terme « Mission 004 » identifie **le point de reprise et le premier sous-lot de code autorisé**, et non une mission autonome dont la livraison termine le mandat. Le véritable mandat est le **programme continu #156 : M00 à M30 et les 630 tâches Studio**, jusqu'à leur réalisation vérifiée, leur décision explicite de report/exclusion ou un blocage qui nécessite une autorisation. Après la PR A3-DB-1/2, **enchaîner immédiatement sur la prochaine sous-tâche READY autorisée, même si la PR attend sa revue**. Ne pas écrire « mission terminée, j'attends » s'il reste des travaux indépendants prêts.

**Dépôt :** RachEma-ux/Fadi
**Environnement :** Fadi Codex Cloud
**Programme GitHub :** #156 · **Questions/décisions :** #166
**Branche de documents :** docs/156-codex-missions-completes (PR #165 tant qu'elle n'est pas fusionnée)
**Objectif :** agir maintenant sur les lots autorisés, résoudre les questions via ChatGPT dans GitHub et ne perdre aucune tâche.

## 1. Lire le contrat complet avant toute écriture

Revalide le HEAD réel, la branche, `main`, les PR et la CI sur les SHA exacts. Ne suppose aucune fusion de #165/#168.

Lis dans cet ordre :
1. `AGENTS.md`, `docs/continuity/README.md`.
2. `docs/workstreams/ai-team/HANDOFF.md` → `STATUS.md` → `TASKS.md` → `CONTEXT.md`. Même chose pour Studio.
3. `docs/ai-team/CODEX-START-HERE.md`, `MISSIONS.md`, `missions.json`, `CODEX-HOURLY-OPERATIONS.md`, `CODEX-NONBLOCKING-EXECUTION.md`.
4. **`docs/ai-team/CODEX-DELEGATED-DECISIONS.md`**, mandat reçu du propriétaire et sept choix D01–D07.
5. [Commentaire officiel de délégation #166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249520098) et [autorisation A3-DB-1/2 sur #157](https://github.com/RachEma-ux/Fadi/issues/157#issuecomment-6249524044).

Ne recrée pas le programme ou les dossiers existants. Conserve les décisions historiques, les 21 étapes, les fonctions industrielles natives Fadi et l'indépendance de DrawAll.

## 2. Accuser réception du mandat

Dans [l'Issue #166](https://github.com/RachEma-ux/Fadi/issues/166), poste :
`[CODEX-ACK][DELEGATED-WORKFLOW]`

Indique l'horodatage, HEAD, les documents réellement lus, les arbitrages reconnus, le responsable A3 du lot code et les sous-tâches READY parallèles. Une lecture prouvée n'est pas une tâche terminée.

## 3. Engager immédiatement A3-DB-1/2 (AUTORISÉ)

A3 travaille dans une branche courte de **code séparée**, Issue #157, PR distincte de #165, sans fusion.

Implémenter, de manière fail-closed :
- `TEST_DATABASE_URL` explicitement obligatoire pour les tests mutateurs ; aucun fallback sur `DATABASE_URL` applicative.
- Un descripteur de cible jetable et une attestation indépendante portant sur endpoint/base/rôle/marqueur/version/expiration ; ne pas accepter `localhost`, `NODE_ENV=test`, `test` dans le nom ou un booléen comme preuve suffisante.
- Vérification avant toute connexion mutatrice, réévaluation lors d'une substitution/reconnexion, et refus avant tout reset destructif sur cible absente, ambiguë ou divergente.
- Le branchement de toutes les suites et lanceurs identifiés (12 fichiers de tests API selon audit, à requalifier sur HEAD), sans casser les chemins normaux de production.
- Les tests unitaires **entièrement simulés**, notamment les seize refus et deux cas positifs du dossier, avec démonstration de **zéro SQL destructif** pour chaque refus. Ne jamais connecter une DB réelle même pour tester le refus.
- Messages d'erreur expurgés, aucun identifiant secret/URL complète publiée, pas d'affaiblissement ou skip de test.

A2 valide les contrats ; A5 et A6 relisent la sécurité et les tests. Un seul propriétaire de code A3 pour setup/client/tests. Fournir preuves sur SHA précis, revue, PR non fusionnée, STATUS/HANDOFF à jour.

**Interdits dans A3-DB-1/2 :** vraie DB, `TRUNCATE` réel, API/E2E mutateurs, migration, init, restart, données production, modification permissions GitHub, fusion/deploy. La phase DB-3 sur base jetable réelle est distincte.

## 4. Continuer les missions indépendantes en parallèle

A0 organise les files `READY`, `IN_PROGRESS`, `WAITING_FOR_OWNER` et `DONE_WITH_EVIDENCE`, tout en conservant les états canoniques du registre :
- M08 : rapprochement de 125 chemins documentaires ; aucune suppression native Fadi.
- M11/M12/M13/M14 : contrats et G0/G1 candidat, 141 fiches EX/INV/IF/AC, 18 décisions ; portes non acquises sans critères/preuves.
- M15/M26 : 38 oracles, NAV-001..009, corpus S1–S7, liens exigences/preuves sans tests destructifs.
- M01/M03/M04/M05–M09 : Cloud (D04a bornée uniquement si base déjà attestée), CI exactes, règles GitHub à préparer sans activer, PR #154 → #152 → #142 en **ordre de revue** seulement.
- M29 : registre 630 IDs, STATUS/HANDOFF, vérification des rapports et des prochaines tâches ; ne pas présenter 630/630 d'affectation comme réalisation.

Choix délégués D01–D07 : les lire dans le contrat officiel. Le pilote A/B/C, la navigation après Projets, les reports F et le profil de revue solo sont **actés pour préparer la réalisation** dans les limites explicites ; ne pas rouvrir les mêmes questions sans faits nouveaux. L'accord pour le code Studio hors A3-DB-1/2 n'est pas donné par ce seul prompt.

## 5. Communiquer via GitHub, sans attente globale

Pour chaque nouvelle question :
`[CODEX-QUESTION][Q-ID][OPEN]` dans **#166**, avec preuve SHA, décision concrète, options, recommandation, type de risque et prochaine tâche indépendante à poursuivre.

ChatGPT répondra avec `[CHATGPT-ANSWER]` ou, pour une décision déléguée, `[CHATGPT-DECISION][Q-ID]`. Distinguer explicitement une recommandation technique d'un accord sur une opération sensible. **Ne pas considérer une simple réponse comme un consentement à modifier la production ou des données.**

Après avoir posé une question, **enchaîner immédiatement sur la prochaine tâche READY**. Ne pas suspendre A0–A6 pour une seule réponse ; seul le sous-lot dépendant reste bloqué. Lire les réponses aux checkpoints naturels et reprendre sans recommencer les audits.

## 6. Preuves et réception

Après chaque lot : fichiers, tests vraiment exécutés, SHA, CI, réserves, nouveaux statuts, différences avec la baseline, blocages, next action. Publier `[CODEX-PROGRESS]` dans #166, puis STATUS/HANDOFF ensemble avant revue ou arrêt de session.

Le suivi ChatGPT horaire et la checklist quotidienne #167/#168 surveillent les faits, mais ne démarrent ni ne relancent automatiquement Codex. Si une session finit, préserver un HANDOFF exécutable.

Rapport obligatoire avec titre **« [PDEV vérifié % ou N/D %] — Avancement du développement total Fadi / Studio »**. PDEV N/D tant que `DEV_SCOPE` et preuves ne sont pas validés ; P630 vérifié calculé uniquement depuis IDs réellement achevés et documentés, sans mélange avec les affectations ou les rapports non validés.

## 7. Autorisations réservées

Le mandat délégué règle les questions d'architecture, produit, priorisation et méthodes documentées. Il n'autorise **pas** : fusionner une PR, pousser sur `main`, changer les règles/permissions GitHub, accéder à une base réelle ou la détruire, modifier les sauvegardes/rétention, migrer/déployer en production, acheter des services ou exposer des secrets. Préparer le dossier précis de ces opérations pour validation séparée sans bloquer les autres tâches.

**Commence maintenant : ACK dans #166 → A3-DB-1/2 sur branche/PR code → analyses documentaires en parallèle → revues/tests sûrs → checkpoints GitHub. Ne t'arrête pas au plan ou à la première PR ; aucune tâche orpheline, aucune réussite inventée.**

## 8. Contrat de continuation du programme COMPLET #156 — après chaque lot

**Cette section est prioritaire sur toute interprétation de « Mission 004 » comme point final.** Le calendrier et les documents sources de toutes les missions restent `docs/ai-team/MISSIONS.md`, `missions.json` et la checklist des 630 IDs, pas ce seul sous-lot de code.

A0 doit effectuer cette **boucle obligatoire dans la session Codex réellement active** :

1. **Recenser** en permanence toutes les missions **M00 à M30** et chacune des **630 tâches** selon le registre canonique. Contrôler couverture, statuts séparés (réalisation/conformité/test/acceptation), preuves et priorités ; ne jamais omettre ou fermer artificiellement.
2. **Sélectionner** les sous-tâches prêtes parmi TOUTES les missions (`READY` = entrées disponibles ET autorisation applicable). Distinguer `IN_PROGRESS`, `WAITING_FOR_OWNER`, `WAITING_FOR_DEPENDENCY`, `VERIFIED`. Ne pas attendre qu'une mission entière se ferme pour démarrer une autre aux entrées disponibles.
3. **Exécuter** le travail autorisé, enregistrer preuves/CI/commit, mettre STATUS/HANDOFF à jour ; **puis revenir à l'étape 1 et engager la tâche suivante**. Une PR ouverte ou des tests en attente n'est jamais une raison d'immobiliser les autres agents et lots autonomes.
4. **Questions** : déposer `[CODEX-QUESTION][Q-ID][OPEN]` dans #166, consulter les décisions `[CHATGPT-DECISION]` disponibles, appliquer uniquement leur périmètre et **poursuivre immédiatement ailleurs**. Ne pas solliciter de nouveau une décision déjà consignée. Si la question touche fusion, production, sécurité/DB réelle, migrations, suppression ou administration, suspendre uniquement cette opération non autorisée.
5. **Gestion des blocages** : consigner ID, raison, données manquantes, responsable, action de déblocage et prochaine vérification. Faire progresser les autres `READY` sans perdre les tâches bloquées. Ne pas masquer un défaut par un test désactivé, un refus ignoré ou une suppression de fonctionnalité.
6. **Poursuite après A3-DB-1/2** : ne pas clôturer l'exécution au dépôt de sa PR. Enchaîner sur M08/M11/M12/M13/M15/M26/M29 et toutes les autres sous-tâches prêtes ; les travaux de développement suivants sont préparés et décidés via #166 dans leur propre périmètre avant code.
7. **Arrêt d'une session** : lorsqu'il n'existe réellement plus de travail READY, ou qu'un outil/une session impose l'arrêt, publier `[CODEX-HANDOFF][NEXT-READY]` dans #166 et STATUS/HANDOFF avec le SHA courant, tâches réalisées, PDEV/P630 vérifiables, toutes les sous-tâches ouvertes/bloquées et **la commande ou le prompt exact de reprise**. Ce n'est **pas** la fin du programme. Une nouvelle session reprendra la file après revalidation GitHub.
8. **Clôture globale** : seul A0 peut proposer `PROGRAM_COMPLETE` si toutes les obligations du périmètre **approuvé** disposent d'une preuve de réalisation et d'acceptation, toutes les exclusions sont décidées explicitement, tous les blockers sont levés/résolus et les critères M30 sont satisfaits. Ne pas déclarer 100 % sur la base de 630/630 affectations, d'une seule PR, de G0–G3 préparés ou de réussites CI non pertinentes.

**Limite technique réelle :** aucun fichier GitHub, commentaire, monitoring ChatGPT ni cron du suivi HTML ne peut maintenir Codex Cloud actif indéfiniment ou lancer automatiquement sa prochaine session. A0 doit travailler tant que la session est active ; un arrêt technique donne lieu à HANDOFF, puis relance effective via une tâche Codex Cloud ou une orchestration d'exécution distincte autorisée. Ne jamais prétendre continuer en arrière-plan sans processus réel.

### Question de reprise pour toute nouvelle session

> « Continue le programme Fadi #156 **dans son ensemble**, depuis le dernier HANDOFF. Mission 004/A3-DB-1/2 est le **premier lot** et non la limite. Revalide HEAD, lis les décisions #166, prends chaque prochaine sous-tâche READY parmi M00–M30, exécute et vérifie, ouvre des PR autorisées séparées, consigne les questions et continue jusqu'à épuisement réel de la file READY ; conserve une reprise exacte si la session doit finir. »
