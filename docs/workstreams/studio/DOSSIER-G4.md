# Studio — dossier de livraison du pilote (porte G4)

Instruit le 25 octobre 2026 par le chef de projet, sous délégation du maître d'ouvrage
([ADR-STUDIO-PILOTE-01](../../continuity/decisions/ADR-STUDIO-PILOTE-01.md)).

**Verdict au 25 octobre 2026 : G4 n'est pas franchie.** G1 est franchie. Les éliminatoires BLOC-01, 03 et 04 sont
vérifiés. Restent :
- la recette utilisateur réelle (R.3-01) ;
- un build candidat figé et vérifié en préproduction (R.1-01) ;
- BLOC-02, partiel ;
- l'installation de la phase B sur le VPS (§4) ;
- les actes du maître d'ouvrage (G4-03).

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

## 3. Critères (G4-02) — instruction du 25 octobre 2026, après les lots F1 à F5, le point 2 et G1

- **Défauts éliminatoires** :
  - BLOC-01 (double autorité 2D/3D), BLOC-03 (double application, écrasement) et BLOC-04 (résultat périmé engagé)
    sont **vérifiés** par les scénarios TEST-003, 006, 007, 012, 013 et 014, et par A.4-05, joués en CI.
  - BLOC-02 (accès entre projets par une tâche) reste **partiel** : les refus par URL, par export et par composition
    sont prouvés (TEST-035). Le cas « job serveur » n'a pas de recette dédiée, alors que le serveur recalcule désormais
    les booléens exacts (lot F2).
- **Fonctions** : les fonctions que le dossier relevait comme absentes sont livrées et recettées :
  - lot F1 : édition de faces, profil source lié, direction d'extrusion, division de face cotée ;
  - lot F2 : noyau exact et booléens ;
  - lot F3 : import IFC et état « non natif » ;
  - lot F4 : délégation d'approbation et appariement des observations ;
  - lot F5 : rendu sous charge, index et comparaison des moteurs.

  Restent 50 fonctions absentes et 35 décisions, recensées par le point 2
  ([PREUVES-POINT2](recettes/PREUVES-POINT2-2026-10-25.md)). Aucune ne relève d'un défaut éliminatoire, mais chacune
  doit être livrée ou déclarée hors pilote par une décision qui la nomme.
- **Mesures** : appareils physiques et GPU réel non évalués (DEC-13). La comparaison SVG / Canvas / GPU est faite
  (TEST-025), mais sur un rendu logiciel.
- **Porte G1** : **franchie avec réserves** (ADR-STUDIO-PILOTE-01 P-11, [REVUE-G1-03](REVUE-G1-03.md)).

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

| Étape | Par qui | État |
|---|---|---|
| G1 | chef de projet (délégation) | franchie avec réserves (P-11) |
| BLOC-02 : recette d'un accès refusé par une tâche serveur | session cloud | à faire |
| Fonctions absentes et décisions du point 2 : livrées, ou déclarées hors pilote par une décision qui les nomme | chef de projet ou maître d'ouvrage | à faire |
| `fadi-prod-auto` installé sur le VPS, recette d'échec simulé et de retour arrière jouée | administrateur | à faire |
| Build candidat figé, déployé en préproduction, NAV-001 à 009 rejouées dessus (R.1-01, R.3-02) | session cloud, après installation | à faire |
| Recette utilisateur sur appareil réel (R.3-01, DEC-13) | maître d'ouvrage | à faire |
| Acceptation du périmètre, puis décision distincte de déploiement : la Release (G4-03) | maître d'ouvrage | à faire |
