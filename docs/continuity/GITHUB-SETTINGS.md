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
