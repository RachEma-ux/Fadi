# Sources, instantané et limites du programme Codex

Date : 18 octobre 2026. Programme #156. Référence de création du plan : `27c0c5a35e2f116752a83a9c66459484488a1975` ; arbre `19464f22be58117db79aa49b8125a6a5c2ce6de8`. Revalider avant exécution.

## Sources canoniques

| Source | Rôle | Identifiant de version lu dans GitHub |
|---|---|---|
| `AGENTS.md` | Règles communes | blob `a32c1338874e7021b9bcb15476d34d40764ead58` avant ajout du point d’entrée |
| `docs/continuity/README.md`, scripts et modèles associés | Reprise et statut | Référence du dépôt ; ne pas remplacer sa hiérarchie |
| `docs/architecture.md`, cahiers et décisions Fadi | Architecture actuelle et autorité métier | À relire sur le SHA de travail |
| `docs/audits/2026-10-18-a0-codex-cloud.md` | Audit A0 archivé par PR #155 fusionnée | Archive datée, pas acceptation implicite ni nouvelle exécution |
| `Studio/Fadi_Studio_Checklist_Execution_V1_0.md` | 630 tâches, STUDIO-TASKS-001 | blob `24a5e04346ed7605b82b7079d6259b378ca6bf64` |
| `Studio/Fadi_Studio_Plan_Implementation_V1_0.md` | Plan STUDIO-PLAN-001 | blob `db5588eca8980efcd7276c1cc2182b9070c6eb38` |
| `Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx` | REF-01 | blob `e1d61ca38809e1faac6111c5ffb0881619b9a6dc` |
| `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` | REF-02, libellés normatifs exacts | blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32` |

Les missions constituent un découpage opérationnel de ces sources, pas une nouvelle définition du produit. Les références DOCX doivent être lues/extraites pendant M11/M12 ; aucun texte d’exigence absent de la checklist n’est inventé dans ce plan. Les cartes mentales HTML restent des aides documentaires, pas le module exécutable.

## État GitHub vérifié pour préparer ce programme

`main` a avancé au SHA ci-dessus par fusion documentaire #155. #152 est ouverte en brouillon (`f2777230e3e9c3bd6a2a5f61e2147acd1fba4b38`) ; elle traite déjà une partie des garde-fous et doit être examinée avant une correction concurrente. #154 est le relais séparé lié à #153 : revérifier sa tête et son état avant de l’utiliser comme fichier de main. #146, #147, #149 et #151 restent les suivis existants ; les missions y renvoient au lieu de les remplacer.

L’API de branche observée lors de cette préparation renvoie `protected: false`. Ce constat ne donne aucun droit de modifier les protections ; l’administration demeure dans #146. Aucune nouvelle CI applicative complète n’est attestée par la préparation du plan. Les 1 757 tests, les 47 scénarios et les 3 validations IFC appartiennent aux exécutions distinguées dans l’audit ; ne pas les transférer au SHA courant sans vérification.

## Autorisations

La demande actuelle autorise la création des missions, des instructions, des Issues et des documents de coordination sur une branche/PR. Le programme demande de poursuivre les analyses et préparations déjà autorisées. Il conserve les autorisations explicites nécessaires aux correctifs applicatifs, POC, G0–G4, administration, fusions et opérations sensibles. Il ne transforme pas une mission enregistrée en autorisation générale de production.

Toute autorisation utilisée doit préciser l’auteur habilité, la date, le lien de décision, la mission/sous-lot, les opérations admises, les exclusions et les conditions. Ne pas inférer une acceptation de l’audit ou une décision architecturale depuis la seule fusion de son archive.

## Suivis réutilisés

M03 → #146 ; M07 → #151 / PR #152 ; M08 → #147 / PR #148 ; M10 → #149 ; M06 → #153 / PR #154. Les Issues #157 à #164 regroupent les nouvelles missions de travail. Le programme #156 reste ouvert tant que son périmètre n’est pas justifié comme clos.
