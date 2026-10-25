# Studio — dossier de livraison du pilote (porte G4)

Instruit le 25 octobre 2026 par le chef de projet, sous délégation du maître d'ouvrage
([ADR-STUDIO-PILOTE-01](../../continuity/decisions/ADR-STUDIO-PILOTE-01.md)).

**Verdict : G4 n'est pas franchie.** Le dossier est constitué, mais plusieurs critères ne sont pas prouvés (§3), et la
procédure de mise en production n'existe pas encore (§4). Ce dossier sert à reprendre la porte dès que ces points seront
levés.

## 1. Build identifié

- Build candidat : le commit de fusion de la PR qui livre ce dossier, sur `main`. Sa CI verte, toutes tranches, est la
  condition d'entrée.
- Périmètre : pilote ratifié à G0 (CAD-DEC-01 : étude local/pavillon, parcours A, B et C). Lots autorisés par P-05 : A, B,
  C, D, E, I, R et X, plus F hors DEC-15.

## 2. Scénarios, preuves et recette

| Pièce | Où |
|---|---|
| Recette automatisée : 21 recettes de la CI, puis `studio-memoire` | [RECETTE-PILOTE-2026-10-25.md](recettes/RECETTE-PILOTE-2026-10-25.md) |
| Recette des trois parcours, jouée par délégation | [RECETTE-DELEGUEE-2026-10-25.md](recettes/RECETTE-DELEGUEE-2026-10-25.md) : A conforme ; B et C conformes au guide, avec réserves |
| Navigation NAV-001 à NAV-009 | Vérifiées (registre) |
| Contrats, décisions, coexistence | [DOSSIER-PILOTE.md](DOSSIER-PILOTE.md), ADR-STUDIO-NAV-01, ADR-STUDIO-PILOTE-01 |
| État obligation par obligation | `task-register.json` ; synthèse dans `STATUS.md` |

## 3. Critères non prouvés (G4-02)

- **Défauts éliminatoires** : leur absence n'est pas démontrée par des contrôles complets. Restent partiels :
  - BLOC-01 : double autorité 2D/3D (TEST-003, TEST-007) ;
  - BLOC-02 : accès entre projets par une tâche (TEST-035) ;
  - BLOC-04 : résultat périmé engagé (TEST-006, TEST-014).
- **Fonctions absentes** que des scénarios du référentiel supposent :
  - édition de faces 3D (TEST-002, A.3-03) ;
  - profil source lié et référence liée (TEST-006, A.4-02) ;
  - direction d'extrusion (TEST-005) ;
  - division de face cotée (TEST-007) ;
  - noyau exact dans Studio (TEST-014, TEST-015) ;
  - import IFC et état « non natif » (TEST-028) ;
  - opérations booléennes (IF-003) ;
  - délégation, appariement automatique d'observations, contrôle de politique avant transfert externe (fiches TR non
    couvertes).
- **Mesures** :
  - appareils physiques et GPU réel non évalués (DEC-13) ;
  - comparaison SVG / Canvas / GPU non faite (TEST-025) ;
  - corpus S1 à S5 et POC de G2 partiels (G2-03).
- **Porte G1** non prononcée : la revue fonction par fonction de G1-03 reste à faire.

## 4. Procédure d'exploitation et mise en production

- Préproduction : `deploy/preprod/` existe (sync, build, migrate, up, smoke, backup, restore-check).
- **Production** : la phase B de [`docs/deploiement-automatique.md`](../../deploiement-automatique.md) est livrée côté
  dépôt : `deploy/prod/fadi-prod-auto`, ses unités systemd, son installateur à empreintes et ses tests à doubles
  (`deploy/prod/tests/run.sh`, joués en CI par `consolidation-validation.yml`). Le service n'est **pas encore installé**
  sur le VPS ; la recette d'échec simulé et de retour arrière en préproduction
  ([recette phase B](../../deploiement-automatique-recette-phase-b.md)) reste à jouer sur place par l'administrateur.
- Retour arrière et écritures postérieures : P-09 (OPS-03). Objectifs de perte et de conservation : P-08 (OPS-09).
- La Release reste le geste du maître d'ouvrage ; aucun outil de cette session ne peut la publier.

## 5. Pour franchir G4

1. Lever les critères du §3, ou accepter explicitement les réserves par une décision qui nomme chaque fonction absente
   comme hors pilote.
2. Installer `fadi-prod-auto` sur le VPS et jouer sa recette d'échec simulé et de retour arrière (administrateur).
3. Prononcer G1, puis G4 (G4-03) ; ensuite seulement vient la Release.
