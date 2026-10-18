# Qualification opérationnelle — 203 tâches Studio « À définir »

Source immuable : registre `docs/workstreams/studio/task-register.json` **blob `a460fb315f6c74f6c60797fc2d5e9d7b2d1fbcae`**, `main@817bd36e7d4b1ab60ab9c00309509c7cdfed0798`, 18 octobre 2026. La PR #165 est maintenant fusionnée ; le **nouveau dossier n'est pas dans main tant que sa PR n'est pas fusionnée**.

**203/203 IDs identifiés et qualifiés individuellement**, sans modifier leur statut d'exécution dans le registre canonique. Le terme « défini » désigne ici un **contrat de travail proposé pour instruction**, pas une validation de réalisation, de décision humaine, ni de gate G1–G4. Chaque fiche contient le libellé exact de la checklist, l'agent A0–A6, la dépendance source, le livrable, la méthode, les critères de preuve, le gate et la prochaine action.

## Répartition des files
- **READY_DOCUMENTATION** : 104 tâches
- **HABILITATION_HUMAINE** : 6 tâches
- **DECISION_BORNEE** : 3 tâches
- **FUTUR_GATE** : 43 tâches
- **PREPARATION_CONTRAT** : 36 tâches
- **EXECUTION_CONDITIONNELLE** : 2 tâches
- **MESURES_A_CADRER** : 9 tâches

## Exécution Codex (obligatoire)
1. Reprendre [programme #156](https://github.com/RachEma-ux/Fadi/issues/156), [questions #166](https://github.com/RachEma-ux/Fadi/issues/166), `AGENTS.md`, les deux HANDOFF puis `docs/ai-team/CODEX-START-HERE.md`. **Ne pas recommencer l'audit général** ; vérifier l'état actuel des 203 IDs par différence avec le blob source, car d'autres agents ont pu avancer après ce snapshot.
2. Charger [definitions-203.json](definitions-203.json) ; **apparier par ID exact**, refuser suppression, doublon, renumérotation, changement silencieux de source et collision avec une nouvelle version du registre. Ne pas recopier les 203 fiches en remplaçant les preuves plus récentes.
3. A0 affecte les `READY_DOCUMENTATION` immédiatement et répartit les tâches entre agents par fichier/propriétaire ; avancer aussi les spécifications `PREPARATION_CONTRAT`, `MESURES_A_CADRER`. Les tâches `FUTUR_GATE` ont leur dossier de prérequis/critères à préparer, **pas leur exécution autorisée**. Les habilitations humaines requièrent de vraies personnes, pas un agent fictif.
4. Pour chaque fiche, confirmer les sources exactes, compléter la preuve ciblée et le critère : si la définition est suffisamment précise mais la réalisation non faite, Codex peut proposer `À faire`, mais **ne change pas à Vérifié/Accepté** sans preuve/autorité. Pour les contrats contenant un choix ouvert, conserver le statut `À définir` ou `Bloqué` tant que ce choix n'est pas réel ; ne pas simuler les disponibilités, métriques, budgets ou gates.
5. Pour les décisions techniques ordinaires, appliquer la délégation `CODEX-DELEGATED-DECISIONS.md` et poser `[CODEX-QUESTION]` dans #166 si nécessaire. Après question, continuer la prochaine tâche READY. Les opérations à effets externes/irréversibles gardent leur accord distinct ; aucune DB réelle, migration, fusion/production depuis cette seule qualification.
6. A0 met à jour ensemble STATUS/HANDOFF, rapports par ID et le registre **sur une branche/PR compatible avec les contrôles CI purs**, puis réexécute couverture des 630 IDs et contrôles de continuité avant revue. Le nouveau programme ne remplace pas les 31 missions existantes.

## Limites et interprétation
- **Aucune des 203 fiches n'est automatiquement cochée** dans la checklist source ou le HTML ; les trois validations Code/Review ChatGPT/Review Admin sont indépendantes.
- Les six contrôles de provenance de Mission 003 et le 34/630 de Mission 004 demeurent historiques au SHA lié. Le pourcentage fonctionnel reste **PDEV=N/D** sans DEV_SCOPE et baseline ; une documentation produite ne mesure pas le code.
- `main` est dépourvue de protection au dernier contrôle : aucune modification de règles administratives, fusion ni déploiement par ce dossier.
- Le chantier de développement continue après la qualification ; ne jamais considérer les 203 contrats proposés comme 203 tâches terminées.

## Preuve de cohérence
`definitions-203.json` contient exactement 203 fiches de référence. Vérifier que leurs IDs = les IDs « À définir » du blob cité ; toute divergence bloque la synchronisation. Les livrables sont proposés et doivent être revus par A1/A2/A4/A5/A6 selon les domaines. Après un nouveau checkpoint, Codex met à jour la qualification uniquement par diff ciblé et inscrit les décisions/prochaines actions.
