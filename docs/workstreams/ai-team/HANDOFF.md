# Reprise — équipe Codex Fadi

Mis à jour : 2026-10-18 (UTC).

## Point de reprise

Lire AGENTS.md, le protocole de continuité, ce HANDOFF puis STATUS, TASKS et CONTEXT. Lire docs/ai-team/CODEX-START-HERE.md et le catalogue des 31 missions ; retrouver #156 et la branche docs/156-codex-missions-completes avant de supposer les fichiers sur main.

## Dernier état vérifié

Programme et Issues #156–#164 préparés à partir du SHA 27c0c5a35e2f116752a83a9c66459484488a1975. Aucun correctif métier, fusion ou déploiement réalisé par cette préparation. Quatorze tests du contrôle documentaire réussis sur fixtures locales, pas une preuve de santé applicative.

## Prochaine action

Vérifier la PR et ses contrôles ; exécuter le validateur de couverture sur la source. Puis M00 revalide HEAD/CI/autorisations et le registre, affecte les sous-tâches d'analyse prêtes et poursuit les missions autorisées. M02 doit sécuriser les conditions de tout test destructif avant leur lancement. Ne pas prétendre qu'un sous-agent est actif sans exécution constatée.

## Tests et preuves

Commandes : python3 -m unittest discover -s docs/ai-team -p 'test_check_missions.py' -v ; python3 docs/ai-team/check_missions.py --check ; node scripts/check-continuity.mjs. Consulter les artefacts du workflow Codex — couverture des missions pour les 630 affectations exactes. Les anciennes preuves applicatives restent dans l'audit daté.

## Risques et blocages

Permissions administratives, révision Cloud, données jetables et autorisations de lots à vérifier. #152 et #154 peuvent contenir du travail à réutiliser, pas à dupliquer. Les blocages sont individuels et doivent garder une prochaine action ; continuer les tâches indépendantes.

## Arrêt sûr

Avant interruption : enregistrer état, diff, SHA, tests, erreurs, responsables et prochaine action exacte dans STATUS/HANDOFF ensemble. Si GitHub est inaccessible, conserver le checkpoint local et dire qu'il n'est pas enregistré à distance. Aucune promesse de poursuite en arrière-plan sans exécution réelle.
