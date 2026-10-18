# Statut — Studio

Mis à jour : 2026-10-18 (UTC).

## État

Référence main observée : `a4caaab0e6665480f09febe3914c960b424b6b47` ; instructions documentaires reprises à `63e804be7b8e8935913514bd57937053c7402474` (PR #165 ouverte/non fusionnée). DB-1/2 : branche `fix/157-test-database-guard`, PR **#169 draft**, commit `a15d65044ca4454bf3159f4155e51465b2a70a2c`. Le SHA porteur du présent checkpoint se lit dans son historique ; aucun résultat CI antérieur ne lui est transféré.

[Rapport A0 et pièces Mission 004](../../ai-team/reports/mission-004/README.md). Original Mission 002 :14 pièces/19 inventoriées déjà archivées ; Mission 003 reste historique immuable. **A0/A1/A2/A3/A4/A5/A6 ont réellement exécuté** leurs périmètres, un seul écrivain par fichier partagé.

[Registre unique630](../studio/task-register.json) : **234 À définir,159 En cours,207 Bloqué,30 Vérifié documentaire**. P630=30/630≈4,8%, pas un pourcentage du code ; PDEV=N/D sansDEV_SCOPE et baseline acceptés.24 nouveaux IDs ont leur condition documentaire individuelle, contenu, empreinte, revue indépendante A5 et47 ancres contrôlées A0. Zéro case source cochée ; zéro acceptation métier/fonctionnalité Studio ; G0–G4 non acceptés.141 fiches restent En cours,18 décisions techniques à instruire,9 NAV /38 TEST non exécutés. Les 31 missions restent ouvertes.

## Faits vérifiés

- PR #169/a15d650 :129tests simulés réussis (83adversariaux A5), typecheck/build racine réussis ; CI39125959694/job117671022920 réussi au même SHA. validate/e2e/image sont **skipped avec zéro étape**, pas réussis. Continuité39125959712 et isolation39125959914 réussies. Aucun constructeur réel de pool/connexionDB, migration ou scénario API/E2E lancé par ce lot.
- Gardes : TEST_DATABASE_URL obligatoire, pas de fallback DATABASE_URL, attestation signée/identité/role/endpoint/expiry, capacité fermée pour reset ; registre de confiance runtime volontairement vide. Toute DB réelle reste impossible sous DB1/2. Contrat et limites relus A2/A5/A6 ; DB-3 séparé.
- M08 :125occurrences/69fiches/33chemins rapprochés,185liens candidats et305citations exactes contrôlées. Ce n’est pas125équivalences d’oracles ; abrégé, DA09prospectif et horsscanner/licences restent ouverts.
- Runtime 40 courant/running relevé A6 après32 ; versions locales Node 24.19/npm 11.9/Chromium 154 contre CI #169 Node 22.23.3/npm 10.9.9 et navigateur main 141/build 1194. Aucune santé applicative prouvée, aucun service redémarré.
- CI #154/76e43d1 reste échec39117137782 : quatre arcs mais révision90 attendue91. Cause runtime non démontrée ; oracles non affaiblis, aucun rerun. PR142/152/154/168 relues selon rapports, sans fusion.1757tests/47scénarios/3IFC restent preuves historiques liées à leurs SHA, pas résultat courant ni conservation paramétrique BIM.

## Points ouverts

| Sous-tâche | État / responsable | Preuve et prochaine action |
|---|---|---|
| Synchronisation165 | WAITING_FOR_DECISION, A0/A6 | Q-M004-CI-DOC-PURE : ne pas déclencher PostgreSQL par synchronize ; conserver checkpoint court sans PR si nécessaire, puis intégrer après décision technique sur patch concret |
| DB-3 / repriseCloud | WAITING_FOR_OWNER, A5/A6 | ConditionsDB-3 publiées ; aucun accèsDB réelle, service, provision ou migration autorisé par Mission 004. Pas de nouvelle demande DB1/2 |
| Protectionsmain | WAITING_FOR_OWNER, A6/utilisateur | Profil solo D05 retenu, candidat152 réutilisé ; mainprotected=false, activation administrative distincte |
| Contrats durables / Registry / publication | READY préparation, A1/A2/A4/A5 | Contrats et exemples documentaires produits ; DEC01/03/18 puis02/12 etG1 restent à décider sur dossier concret |
| Dossier G0 | WAITING_FOR_DECISION après remise, A1/A0 | D01/D02 déjà retenus ; dossier complet et revues A2/A4/A5 disponibles. Revue du passage de gate distincte, sans reprendre vote du pilote |
| Studio I/A/B/X/C/D/E/F/R | WAITING_FOR_DEPENDENCY pour code, propriétaires missions.json | Préparations indépendantes autorisées ; G0→G1→G2→G3→réalisation autorisée→G4 et accords sensibles séparés |

## Liens de suivi

1. Lire AGENTS/continuité puis HANDOFF→STATUS→TASKS→CONTEXT des deux chantiers et instructions Mission 004 ; vérifier HEAD/main/PR #165/169 et CI à chaque SHA.
2. Lire les réponses récentes de [#166](https://github.com/RachEma-ux/Fadi/issues/166). D01–D07 sont décisions déléguées acquises dans leur portée ; aucune nouvelle question identique. Q-M004-CI-DOC-PURE ne bloque que synchronisation #165.
3. Poursuivre la prochaine préparation READY : suite des contrats M17/M21/M24 après revues croisées réussies, décision du lot CSP-scan M09 préparé, comparaison des oracles candidats M08 ; A0 intègre seul les documents communs. Aucun nouveau code Studio/POC n’est autorisé.
4. Après décision technique CI, intégrer ce checkpoint dans #165 sans déclencher de DB et vérifier au SHA exact ; proposer G0/DEC sur dossiers complets. Fusion, administration, DB-3, reprise de service, migration et production exigent accords distincts.

## Préconditions de clôture

Preuves correspondant à la nature de chaque tâche, décisions et acceptations explicites requises. Aucun lot/mission fermé par une préparation, une CI verte ou un skip. Le présent état remplace le checkpoint Mission 003 conservé dans Git à63e804b ; aucune décision historique effacée.

## Sauvegarde documentaire sans déclencher de base

Le présent état est porté par la branche courte `docs/156-m004-checkpoint-sans-db`, sans PR. A6 a inspecté les six workflows : aucun ne devient éligible sur ce push non-main sans PR. Aucune CI exécutée ne sera inventée. L’intégration des mêmes fichiers et IDs à la branche canonique de #165 attend la décision technique sur le patch CI pur ; le programme et ses deux chantiers restent uniques. Le SHA publié et les vérifications sont consignés dans #166.
