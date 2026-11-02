# Studio — demande unique d'interventions externes (26 octobre 2026)

Établie par le chef de projet à la fin de l'achèvement délégué (ADR-STUDIO-PILOTE-01, P-12), sur `main@02c0dc2b`
(CI verte : <https://github.com/RachEma-ux/Fadi/actions/runs/40300604328>, 26 octobre 2026, 10:58 heure suisse).

Le dépôt ne peut plus avancer sans les actes ci-dessous : chacun relève d'une personne, d'un accès, d'un appareil ou
d'une donnée que la délégation n'autorise pas ou qu'une session cloud n'a pas. Rien n'a été simulé ni présumé à leur place.
Les 45 obligations encore ouvertes du registre (`task-register.json` : 29 « À faire », 7 « En cours », 9 « Bloqué »)
dépendent toutes de l'un de ces actes ; chaque ligne nomme celles qu'elle débloque.

## A. Maître d'ouvrage — décisions et actes qui lui appartiennent

| # | Acte demandé | Ce que je fournis / ce qu'il faut me rendre | Débloque |
|---|---|---|---|
| A1 | **Désigner le build candidat et le profil de charge de référence** (DEC-13). Candidat proposé : `main@02c0dc2b` (porte G4 automatisée admise, BLOC-01 à 07 vérifiés), après son passage en préproduction (B2). Profils exécutables par le dépôt : `PROFILS_CHARGE_CANDIDATS` (profil de vingt outils sur Chromium bureau / téléphone, corpus S1 à S7 ; réseau « non évalué »). | Une décision datée (D-xxx, ADR ou commentaire d'Issue) donnant : le commit (40 hex), la sha256 de l'artefact construit en préproduction, le profil retenu. Elle est contrôlée par `validerDesignation`. | R.1-01, TR-AC-011, REC-B-01, R.3-02 (NAV rejouées sur le build), G4-01, G4-02 (critères rejoués sur le build désigné) |
| A2 | **Recette utilisateur des trois parcours A, B, C**, en personne, en préproduction, sur un appareil réel (guide : `recettes/RECETTE-UTILISATEUR-PILOTE.md`) ; validation de l'interaction (maquette) à cette occasion. | Le guide rempli (constats, réserves, appareil, date). La recette déléguée du 25 octobre (`RECETTE-DELEGUEE-2026-10-25.md`) ne remplace pas ce constat. | R.3-01, REC-E-03, REC-I-01, J7, PASS-06, FIN-01 |
| A3 | **Mesures sur appareils réels et GPU physique** (protocole : `recettes/RECETTE-APPAREILS.md`) : chargement, budgets CWV, booléen exact lourd, profils GPU. | Les relevés produits par les recettes (`studio-g4.mjs`, `studio-rend.mjs`, `studio-mesures-chargement.mjs`) lancées depuis l'appareil, ou l'accès à un tel appareil. | TR-EX-059, REC-C-02, J5 |
| A4 | **Décisions de cadrage restantes** : suffisance des preuves par risque et priorités ADR-05 (G2-05, PASS-03 : requalification COEX-01 proposée « 0 retrait, 0 remplacement ») ; constat historique de l'ordre « sources fixées avant le premier engagement » (PASS-01). | Une décision par point (accepter, refuser, amender). | G2-05, PASS-03, PASS-01 |
| A5 | **Estimations et disponibilités réelles** : disponibilité de l'équipe, cadence de recette, chiffrage par sous-lot. Aucune valeur n'est inventée au dépôt. | Les réponses des personnes concernées (ou la décision de ne pas chiffrer le pilote). | EST-01, EST-02, G3-03 |
| A6 | **Accord sur les données réelles** : autoriser une **copie déclarée et marquée** de la base de production, isolée, pour le recensement et la migration simulée (`simuler-migration.mjs`, lecture seule). Aucune restauration de la base de production n'est faite sans votre accord explicite, et celui-ci n'est pas demandé ici. | L'accord écrit et la copie (ou l'accès en lecture à cette copie). | MIG-01 à MIG-04, MIG-06, MIG-COEX-01, R.1-02, R.1-03 |
| A7 | **Acceptation du périmètre livré (G4)**, puis **décision distincte de déploiement : la Release GitHub**. Elles viennent après A1, A2 et B1. | Les deux actes, dans cet ordre. | G4-03, R.4-01, R.4-03, R.5-01, R.5-04, J8 |
| A8 | **Après la Release** : autoriser la restauration de la sauvegarde de référence réelle **sur une cible isolée** (jamais sur la production), puis la sauvegarde du nouvel état accepté. | Les deux autorisations, au moment voulu. | R.2-01, R.2-02, OPS-06, R.5-02, OPS-01 |

## B. Administrateur (VPS, préproduction, dépôt GitHub)

| # | Acte demandé | Débloque |
|---|---|---|
| B1 | **Installer `fadi-prod-auto`** sur le VPS (`deploy/prod/`, installateur à empreintes) et jouer sur place la recette d'échec simulé et de retour arrière (`docs/deploiement-automatique-recette-phase-b.md`). | R.4-02, OPS-01, J8 |
| B2 | **Déployer le candidat `main@02c0dc2b` en préproduction** (`deploy/preprod/fadi-preprod`) et transmettre `fadi-preprod show` / `etat.json` avec la sha256 de l'artefact ; ou donner à la session un accès autorisé à la préproduction pour le faire et y rejouer NAV-001 à 009 et les recettes `E2E_DEFAUT`. | R.1-01, R.3-02, A1 |
| B3 | **Dépôt GitHub** : activer « Allow GitHub Actions to create and approve pull requests » (le workflow `studio-checklist-daily.yml` échoue chaque jour à cette étape depuis le 21 octobre) et supprimer la branche orpheline `automation/studio-checklist-daily` (ou laisser la prochaine exécution du workflow corrigé la retirer). | SUIVI-01 |
| B4 | **Après le déploiement** : un compte administrateur sur le site pour vérifier accès, trois parcours, publications, alertes de jobs / workers et consommation des noyaux (`docs/studio/SURVEILLANCE-EXPLOITATION.md`) ; les seuils encore « non évalués » sont à fixer par le maître d'ouvrage. | OPS-07, OPS-08, R.5-03 |

## C. Pour information (hors Studio, non traité)

- GitHub signale 42 vulnérabilités de dépendances sur `main` (12 élevées, 27 modérées, 3 faibles ; Dependabot). Leur
  traitement est un lot distinct, à autoriser : il touche les dépendances de tout le monorepo.

## Ordre conseillé

B2 → A1 → A2 et A3 (en préproduction) → B1 → A7 (acceptation, puis Release) → A8 et B4. A4, A5, A6 et B3 sont
indépendants et peuvent être faits à tout moment.
