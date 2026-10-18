# Fadi AI Team — protocole de progression sans attente et relais ChatGPT ↔ Codex

**Programme :** [Issue #156](https://github.com/RachEma-ux/Fadi/issues/156), [PR #165](https://github.com/RachEma-ux/Fadi/pull/165). **Questions et réponses :** [Issue #166](https://github.com/RachEma-ux/Fadi/issues/166). **Date :** 18 octobre 2026.

> Ce protocole complète `AGENTS.md`, `CODEX-START-HERE.md`, `CODEX-HOURLY-OPERATIONS.md` et `docs/continuity/README.md`. Il ne remplace aucune décision canonique ni autorisation utilisateur.

## 1. Règle centrale — ne jamais bloquer toute l'équipe pour une seule question

À chaque cycle de travail réel, A0 doit :
1. Relire **HANDOFF → STATUS → TASKS → CONTEXT**, puis le programme M00–M30, le registre des 630 identifiants, les nouveaux commentaires dans #166 et l'état GitHub/CI par SHA.
2. Regrouper les sous-tâches en `READY` (entrées et autorisations présentes), `WAITING_FOR_INPUT` (source ou compétence manquante), `WAITING_FOR_OWNER` (décision/autorisation propriétaire), `IN_PROGRESS` et `DONE_WITH_EVIDENCE`. Ces catégories d'ordonnancement ne remplacent pas les statuts canoniques du chantier.
3. **Exécuter immédiatement la prochaine sous-tâche READY**, en privilégiant P1 sécurité, qualification Studio, contrats, oracles et revues non destructives. Décomposer les missions longues par sous-tâche ; ne pas attendre une décision qui ne conditionne pas ces sous-tâches.
4. En cas de question, publier dans #166 le formulaire `[CODEX-QUESTION][Q-ID][OPEN]` avec source, alternatives et **liste des tâches indépendantes poursuivies** ; **revenir aussitôt** à la file READY sans attendre la réponse.
5. Lire les `[CHATGPT-ANSWER][Q-ID]` au prochain contrôle et classer chaque réponse : `TECHNICAL_GUIDANCE`, `PROVISIONAL_PRODUCT_DIRECTION` ou `OWNER_APPROVAL_REQUIRED`. Une réponse ChatGPT n'est pas une autorisation propriétaire pour les changements sensibles.
6. Si la file READY est vide, vérifier les contrats, oracles et documents préparatoires encore incomplets, préparer les décisions pour limiter les allers-retours, mettre à jour les blocages et produire un checkpoint. Ne pas relancer indéfiniment une tâche ou une permission refusée.
7. Publier `[CODEX-PROGRESS]` quand une avancée est vérifiée, **sans annoncer un agent inactif comme actif**. Avant toute interruption de session, conserver SHA, résultats, branches, blocages, décisions, fichiers restants et **prochain geste exact** dans STATUS/HANDOFF. Un checkpoint permet une reprise mais ne crée pas un processus Codex permanent.

## 2. Ce que ChatGPT peut résoudre, et ce qui reste réservé à l'utilisateur

| Catégorie | Traitement | Autorité |
| --- | --- | --- |
| Question de syntaxe, lecture de preuve, contradiction technique, méthode de test non destructive | ChatGPT répond dans #166, références et limites à l'appui ; Codex réévalue avant application | Analyse et recommandation |
| Choix de préparation réversible, ordre de revue documentaire, maquette candidate, options de pilotes à comparer | ChatGPT propose une direction pour poursuivre les **livrables préparatoires** | Orientation provisoire, pas décision finale G0/G1/G3 |
| Code applicatif, POC, essais sur base réelle, migrations, changement d'autorisations, ruleset GitHub, fusion PR, sauvegardes, prod | ChatGPT peut fournir cahier, critères et risques ; **pause de cette opération seule** jusqu'à autorisation explicite du responsable | `OWNER_APPROVAL_REQUIRED` |
| Décision métier et acceptation des gates Studio | Préparer options/proofs puis demander décision ciblée ; continuer les lots sans dépendance | Responsable produit |

Aucun `[CHATGPT-ANSWER]` ne ferme un `[NEEDS-USER-DECISION]`. Pour une réponse technique, Codex doit citer le lien, son applicabilité, le commit et l'opération effectuée. Le cas échéant, clôturer seulement la **question technique**, et non le travail non terminé.

## 3. Sept réponses opérationnelles déjà présentes dans #166

| Question | Direction utilisable dès maintenant | Autorisation restant à obtenir |
| --- | --- | --- |
| [Q-M003-D01](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249413038) | STUDIO-RT-001 V1.0 comme référence candidate ; petit pilote synthétique A/B/C ; poursuivre G0/G1 documentaire | Ratifier G0/pilote |
| [Q-M003-D02](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249413310) | Reporter en option candidate IA externe/MCP/extensions/rendu avancé ; conserver Visualisation et capacités natives ; poursuivre socle | Décision définitive sur le périmètre |
| [Q-M003-D03](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249413603) | Préparer spécification de garde DB et tests négatifs simulés ; zéro SQL destructif | Implémentation A3-DB-1/2, puis essais DB-3 distincts |
| [Q-M003-D04](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249413851) | D04a comme méthode candidate, lectures/diagnostics sûrs | Démarrage local ou création/destruction de base/conteneur |
| [Q-M003-D05](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249414188) | Préparer ruleset solo sauf revue indépendante réellement disponible ; vérifier noms des checks | Activer/modifier ruleset et arbitrer politique finale |
| [Q-M003-D06](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249414507) | Ordre de **revue documentaire** #154, #152, #142 ; continuer hors conflit | Chaque fusion et toute correction CI |
| [Q-M003-D07](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249414822) | Navigation Studio après Projets comme contrat candidat ; permissions approbation et publication distinctes à spécifier | Ratification finale navigation, rôles et G1 |

**A0 ne doit pas reposer ces questions sous une nouvelle forme sans donnée significativement nouvelle.** Leur traitement provisoire réduit l'attente ; seule l'opération explicitement sensible reste bloquée. D08 (enregistrement documentaire) est déjà autorisée par #156.

## 4. File READY prioritaire, tant que les accords sensibles manquent

Ces unités ne présupposent **aucune réalisation métier ni recette destructive** :
- **M00/M29** : rapprocher le registre 630 IDs, les 14 originaux archivés, les preuves des 141 fiches, STATUS/HANDOFF et la tête courante des PR.
- **M08** : terminer le rapprochement documentaire des **125 chemins** signalés, préserver fonctions industrielles, normes et provenance ; aucun retrait implicite.
- **M11/M12/M13/M14** : améliorer les 141 fiches individuelles, l'index DEC, le cadrage G0/G1 **candidat**, les contrats NAV/données et le pilote sans déclarer un gate accepté.
- **M15/M26** : relier les 38 oracles, les cas négatifs, le corpus S1–S7, les 9 NAV aux exigences et aux limites des bancs de test, sans lancer les tests API/E2E destructifs.
- **M02/M01/M03/M04/M05–M09** : terminer les cahiers de garde DB, procédure Cloud, matrice CI/SHA, diagnostic PR154, graphe de dépendances et politique de revue **en lecture seule**.
- **M16–M30** : rédiger les entrées manquantes de lots encore conditionnés, critères G2/G3/G4 et risques pour que les futurs accords soient précis et bornés.

Si un élément est réellement complet, le vérifier avec sa preuve avant de chercher le suivant. **Ne pas considérer les 630 affectations comme 630 réalisations.**

## 5. Rythme, échanges et reprise

- **Dans une session Codex active :** alterner exécution et consultation #166 aux checkpoints naturels ; aucune pause globale d'une heure en attente de ChatGPT.
- **ChatGPT :** le contrôle automatique horaire peut lire et répondre aux questions GitHub si l'accès aux connecteurs fonctionne ; cela ne garantit pas un temps de réponse instantané. Les questions urgentes peuvent être fournies directement dans une conversation ChatGPT par l'utilisateur.
- **Issue #166 :** `[CODEX-ACK]` confirme la lecture ; `[CODEX-QUESTION]` demande ; `[CHATGPT-ANSWER]` répond ; `[NEEDS-USER-DECISION]` escalade ; `[CODEX-PROGRESS]` apporte la preuve d'avancement.
- **Aucun déclenchement automatique de Codex n'est installé par le seul présent document ou par le monitoring horaire.** À expiration/arrêt de la session Codex, une nouvelle tâche explicite ou une intégration d'exécution autorisée sera nécessaire. Ne jamais promettre une exécution invisible.
- **Concurrence :** les agents n'écrivent pas simultanément les mêmes fichiers. A0 conserve un seul propriétaire des checkpoints partagés.
- **Sécurité :** aucune action sur DrawAll, aucun push direct main, aucun contournement CI, fusion, administration, tests destructifs, redémarrage/migration ou déploiement sans accord approprié.

## 6. Critère d'une communication réussie

Une question est **traitée par le relais** quand son identifiant est cité dans une réponse GitHub accessible. Elle est **résolue opérationnellement** uniquement si Codex a vérifié la réponse et exécuté la prochaine action autorisée avec preuve, ou si le responsable a donné la décision requise. Les contrôles horaires distinguent ces deux états. Le suivi quotidien HTML affiche les constats sans cocher automatiquement Code, Review ChatGPT ou Review Admin.
