# Studio — dossier de livraison du pilote (porte G4)

Instruit le 25 octobre 2026 par le chef de projet, sous délégation du maître d'ouvrage
([ADR-STUDIO-PILOTE-01](../../continuity/decisions/ADR-STUDIO-PILOTE-01.md)).

**Verdict au 26 octobre 2026 : G4 n'est pas franchie, la porte automatisée l'admet.** G1 est franchie. Les huit
défauts éliminatoires BLOC-01 à BLOC-08 sont vérifiés et `scripts/validation/porte-g4.mjs` admet la livraison sur `main`.
Restent, tous hors de portée d'une session cloud (détail et ordre : [DEMANDE-INTERVENTIONS.md](DEMANDE-INTERVENTIONS.md)) :
- le build candidat déployé en préproduction puis désigné (R.1-01, DEC-13) — candidat proposé : `main@02c0dc2b` ;
- la recette utilisateur réelle (R.3-01) et les mesures sur appareil réel (DEC-13) ;
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
  - BLOC-02 (accès entre projets par une tâche) est **vérifié** : refus par URL, export et composition (TEST-035), et
    refus par chaque tâche serveur (`studio-taches-projets.preuves-bloc02.test.ts`). Sont couverts le recalcul des
    booléens exacts, le contrôle d'exigences, le rapprochement des observations, la relecture des modèles externes et
    la composition des feuilles et dossiers. Le noyau exact n'est plus chargé avant que les opérandes aient été relus.
- **Fonctions** : les fonctions que le dossier relevait comme absentes sont livrées et recettées :
  - lot F1 : édition de faces, profil source lié, direction d'extrusion, division de face cotée ;
  - lot F2 : noyau exact et booléens ;
  - lot F3 : import IFC et état « non natif » ;
  - lot F4 : délégation d'approbation et appariement des observations ;
  - lot F5 : rendu sous charge, index et comparaison des moteurs.

  Vagues d'achèvement du 26 octobre 2026 (`recettes/ACHEVEMENT-STUDIO.md`) : des 85 fonctions absentes recensées par
  le point 2 ([PREUVES-POINT2](recettes/PREUVES-POINT2-2026-10-25.md)), **81 sont livrées et vérifiées** ; les 4 qui restent
  (TR-AC-011, REC-B-01 : désignation DEC-13 ; REC-C-02, TR-EX-059 : appareil réel) attendent un acte externe. Des 35
  décisions, restent PASS-01, REC-E-03, REC-I-01 et SUIVI-01 (actes du maître d'ouvrage ou de l'administrateur). Aucune
  n'est déclarée hors pilote.
- **Mesures** : appareils physiques et GPU réel non évalués (DEC-13). La comparaison SVG / Canvas / GPU est faite
  (TEST-025), mais sur un rendu logiciel.
- **Porte G1** : **franchie avec réserves** (ADR-STUDIO-PILOTE-01 P-11, [REVUE-G1-03](REVUE-G1-03.md)).

### Porte G4 automatisée (X.2-04 / BLOC-06, lot DEC)

`scripts/validation/porte-g4.mjs` refuse la livraison tant qu'un défaut éliminatoire BLOC-01 à BLOC-07 n'est pas
« Vérifié » ou « Accepté » au registre avec une preuve qui tient (fichier existant, libellé écrit). Chaque refus nomme le
défaut, la preuve et le propriétaire ; aucune mesure de performance n'entre dans la décision.

- À chaque commit : jouée en signalement (`--avertir`) par `continuity.yml`, rapport dans le résumé de l'exécution.
- À la publication d'une Release : jouée en mode strict par `porte-g4-release.yml` sur le commit de la Release ; un
  échec signifie que la Release ne satisfait pas G4 et doit être retirée avant son traitement par `fadi-prod-auto`.
- État au 26 octobre 2026 (`main@02c0dc2b`) : livraison **admise** (BLOC-01 à BLOC-07 vérifiés).

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
| BLOC-02 : recette d'un accès refusé par une tâche serveur | session cloud | fait |
| Fonctions absentes et décisions du point 2 : livrées, ou déclarées hors pilote par une décision qui les nomme | chef de projet ou maître d'ouvrage | fait au dépôt (81 / 85 fonctions, 31 / 35 décisions) ; le reste attend les actes externes |
| `fadi-prod-auto` installé sur le VPS, recette d'échec simulé et de retour arrière jouée | administrateur | à faire |
| Build candidat figé, déployé en préproduction, NAV-001 à 009 rejouées dessus (R.1-01, R.3-02) | session cloud, après installation | à faire |
| Recette utilisateur sur appareil réel (R.3-01, DEC-13) | maître d'ouvrage | à faire |
| Acceptation du périmètre, puis décision distincte de déploiement : la Release (G4-03) | maître d'ouvrage | à faire |
