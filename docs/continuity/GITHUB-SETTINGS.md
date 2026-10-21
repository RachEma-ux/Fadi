# Protéger le dépôt et les checkpoints Fadi (configuration GitHub)

## Constat vérifié

Au **17 octobre 2026**, la réponse GitHub pour la branche `main` indiquait `protected: false` dans le dépôt **public** `RachEma-ux/Fadi`. Ce constat est daté : revérifier dans `Settings` avant d'agir.

**Les fichiers `AGENTS.md` et les workflows CI ne bloquent pas un `git push` direct sur une branche non protégée.** Pour rendre la procédure réellement obligatoire, il faut une règle de branche ou un ruleset GitHub.

La connexion GitHub utilisée pour cette mise en place permet de créer les fichiers et les PR, **mais n'a pas accès à l'API d'administration des protections de branches** (lecture du point d'API refusée). Il faut donc régler ce point dans l'interface administrateur de GitHub. Ne pas prétendre qu'il est configuré.

## Recommandation à appliquer après fusion du cadre de continuité

1. Sur GitHub : **Repository → Settings → Rules → Rulesets** (ou `Settings → Branches`, selon l'interface).
2. Créer une règle active ciblant **`main`**.
3. Exiger une **pull request avant fusion** et empêcher les suppressions/force-push.
4. Exiger les contrôles CI actuels, sélectionnés **par leur nom exact dans l'interface des checks**. Le job `Continuité — docs, checkpoints et tests` s'exécute sur toutes les PR ; les jobs applicatifs `CI` sont également disponibles.
5. Évaluer l'exigence d'une revue supplémentaire en fonction du nombre réel de réviseurs : **un compte GitHub seul peut être bloqué** par une règle « 1 approbation externe ». Mettre en place une revue appropriée plutôt qu'une exception implicite.
6. Conserver les droits d'administration minimaux et éviter les bypass permanents ; une exception d'urgence doit laisser une preuve écrite dans une Issue/PR.
7. Tester une PR de documentation : CI puis fusion ; tenter un push direct uniquement depuis un environnement autorisé et sans modification de données sensibles.
8. Vérifier que les déclencheurs GitHub Actions et les contrôles requis ne restent pas indéfiniment en `Pending`. **Ne pas rendre obligatoire un workflow filtré par chemins**.

## Limites

- La protection de branche et les règles de fusion sont des réglages administrateur ; leur état n'est pas enregistré automatiquement dans les commits.
- Le validateur `scripts/check-continuity.mjs` contrôle les dossiers de chantier et impose `STATUS.md` + `HANDOFF.md` **quand un dossier de chantier est modifié**. Il ne peut déduire de manière fiable à lui seul quel dossier doit correspondre à chaque changement arbitraire de code : la PR et sa revue doivent faire ce rapprochement.
- Le système ne sauvegarde pas automatiquement la conversation ou le raisonnement caché des agents. L'agent doit **pousser des checkpoints réels sur GitHub** avant de terminer sa session.

Voir [le protocole central](README.md) pour les conventions et [l'index des chantiers](../workstreams/README.md).

## Mission 004 — profil solo retenu, activation toujours distincte

Relevé du 18 octobre 2026 à 12:14 UTC : main `a4caaab0e6665480f09febe3914c960b424b6b47` reste `protected=false`. D05 du mandat `docs/ai-team/CODEX-DELEGATED-DECISIONS.md` retient le **profil solo pour la conception**, sans autoriser d’activation administrative. Ne pas rouvrir ce choix sans nouveau réviseur indépendant réellement identifié.

Réutiliser la proposition de la PR #152 (`docs/continuity/main-ruleset.proposed.json` et `L1-MAIN-PROTECTION.md`), encore sur sa branche au relevé ; ne pas créer de second ruleset concurrent. Son enforcement disabled est une proposition inactive. Ajuster après revue de la tête finale et accord administratif spécifique : main seulement, PR obligatoire, conversations résolues, branches à jour, interdiction force-push/suppression et aucun bypass permanent proposé. Profil solo : **0 approbation GitHub supplémentaire**, sans supprimer l’acceptation humaine explicite tracée dans la PR/Issue. Avec un second mainteneur habilité, réexaminer séparément le seuil 1 et la revue des workflows.

### Checks existants à sélectionner par nom exact

App GitHub Actions observée : ID15368. Présents sur main a4caaab : `validate`, `e2e`, `image`, `Continuité — docs, checkpoints et tests`, `no-foreign-app-reference`. Réutiliser cette base du candidat #152. Ne jamais sélectionner un nom de workflow à la place du nom de check.

`Architecture — frontières et isolation` existe sur la PR #152 mais n’est pas encore intégré à main ; `Codex — 31 missions et 630 tâches` existe sur #165, également non fusionnée. Leur ajout aux checks requis attend intégration autorisée, déclenchement garanti et contrôle au SHA final. `inventory` est filtré par chemins : ne pas l’exiger globalement. `DB1/2 — tests simulés sans base (DB3 non validée)` appartient au lot #169, pas à une recette d’intégration générale.

### Exceptions de CI et absence de validation DB-3

PR #169 a une CI pure, avec validate/e2e/image intentionnellement skipped ; son succès ne vaut ni recette DB-3 ni autorisation de fusion. Une protection « check requis » ne constitue pas une preuve métier et un check skipped peut satisfaire la mécanique GitHub : l’administrateur/relecteur doit inspecter conclusions et périmètre exacts, pas le seul indicateur vert. Aucune réduction des contrôles requis ne doit servir à autoriser implicitement ce lot.

Une proposition d’exception documentaire pour #165 est en attente de décision dans #166 (Q-M004-CI-DOC-PURE). Elle contient un contrôle préalable strict du diff et ne doit pas être présentée comme active. Les deux modifications de ci.yml (#165 et #169) devront être réconciliées avant toute fusion autorisée. Avant généralisation, soumettre si nécessaire un contrôle requis de disponibilité d’intégration échouant explicitement lorsque DB-3 manque ; ne pas inventer ce check dans le ruleset tant qu’il n’existe pas.

### Recette administrative future — non exécutée

1. Relever main, les PR, les checks au SHA exact et la politique solo déjà retenue ; sauvegarder la référence du candidat #152 sans secret.
2. Après autorisation administrative distincte, examiner/importer le candidat, vérifier cible main et absence de bypass permanent, puis activer et relire les paramètres effectifs. L’import d’un fichier disabled ne suffit pas.
3. Préparer une PR documentaire de contrôle explicitement autorisée ; vérifier passage par PR, résolution des discussions et blocage tant qu’un check réellement requis manque/échoue. Ne pas déclencher pour ce test les services DB interdits par le lot courant.
4. Contrôler dans l’interface les interdictions de suppression/force-push sans tenter de force-push ni suppression sur main. Documenter les refus et la règle effective, avec SHA/runs et limites.
5. Fermer #146 uniquement avec activation attestée et recette des règles ; ni AGENTS, ni JSON, ni CI verte ne remplace cette preuve. Fusion et activation sont deux accords distincts.

## Correctif du 21 octobre 2026 — configuration prête, activation non attestée

Le ruleset 25417703 est actif pour les PR et l'interdiction de suppression/force-push, mais ne requiert pas encore les checks. La proposition existante a été actualisée avec les noms des checks réellement présents sur main. Garder le profil solo à zéro approbation GitHub supplémentaire ; le défaut constaté est l'absence de checks requis.

Prévisualisation sans réseau : `python3 scripts/apply-main-ruleset.py`. Application, uniquement dans une session administrateur déjà authentifiée : `python3 scripts/apply-main-ruleset.py --apply` (jeton administrateur dans `GH_TOKEN`, jamais dans le dépôt, une commande ou le chat). Le script modifie le ruleset existant et le relit. La connexion GitHub de cette session ne propose aucune action d'écriture administrative : ne pas déclarer la protection renforcée active avant cette étape.
