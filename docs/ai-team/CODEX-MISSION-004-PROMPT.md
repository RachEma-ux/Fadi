# FADI — MISSION 004 · Exécution coordonnée après délégation

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
