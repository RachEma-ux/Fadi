# Reprise du programme #156 depuis496dcfc

Checkpoint de travail du18 octobre2026. Les six décisions et la directive ont été appliquées dans leur portée ; [export daté](decisions-166.json). [ACK de reprise](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250149589), [premier progrès](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250266800). Les anciens rapports sont des snapshots conservés : leur « à faire » n'annule pas les preuves plus récentes ci-dessous.

## M08 : analyse et revue des sources, sans exécution

[Index individuel125](M08-INDEX-A0.json), rattaché au mapping canonique inchangé. À ce checkpoint : **125 analyses dont8 historiques ;87 avec revue ou preuve historique ;0 encore à analyser**. Les cohortes sont toutes remises ; les revues encore absentes de cet index restent en cours.

| Entrées | Analyse | Revue indépendante | État documentaire |
|---|---|---|---|
|001–007|[A2](A2/M08-PATH-001-007-COMPARAISON.json)|[A5](A5/M08-001-007-CONFRONTATION-A2-A5.json)|Produite et revue,49 attendus,204 citations/128uniques ; aucune équivalence complète|
|009–015|[A2](A2/M08-PATH-009-015-COMPARAISON.json)|[A5](A5/M08-009-015-CONFRONTATION-A5.json)|47 attendus A2 ;454 citations/299uniques, différence de grain A5 conservée|
|016/018/020/022|[A4](A4/M08-016-018-020-022-UX.json)|[A5](A5/M08-016-018-020-022-CONFRONTATION-A5.json)|25 clauses A4 dont4 contextes, pas équivalence d'un cycle E2E|
|024..045,12E2E|[A4](A4/M08-E2E-024-045.json)|[A5](A5/M08-E2E-024-045-CONFRONTATION-A5.json)|86 clauses A4,90 atomes indépendants A5 ; écarts de grain expliqués|
|017..039,12unités|[A2](A2/M08-UNITE-017-039.json)|[A3](A3/M08-UNITE-017-039-REVUE-A3.json) ; [réserves qualité A5](A5/M08-UNITE-017-039-RESERVES-QUALITE-A5.json)|109 attendus, quatre supersessions bornées ; contexte générique distinct d'oracle ciblé|
|041..064,12unités|[A2](A2/M08-UNITE-041-064.json)|[A1](A1/M08-UNITE-041-064-REVUE-A1.json)|112 attendus dont9 doublons049/050 signalés, pas double preuve indépendante|
|046..072,12E2E|[A4](A4/M08-E2E-046-072.json)|[A5](A5/M08-E2E-046-072-CONFRONTATION-A5.json)|72 clauses ; lecture documentaire uniquement|

|065..092,13 unités|[A2](A2/M08-UNITE-065-092.json)|A3 en cours|132 attendus, supports génériques ne comptent pas comme oracles ciblés|
|094..124,13 unités|[A2](A2/M08-UNITE-094-124.json)|[A1 avec deux réserves](A1/M08-UNITE-094-124-REVUE-A1.json)|135 attendus ; site/parcelle et inverse de pose porte à préciser par delta|
|074..103,13 E2E|[A4](A4/M08-E2E-074-103.json)|A5 en cours|74 clauses, aucune équivalence complète annoncée|
|105..125,12 E2E|[A4](A4/M08-E2E-105-125.json)|A5 en cours|73 clauses, aucune exécution|

Les huit entrées antérieures008/053/079/080/089/091/122/123 gardent leurs preuves Mission004, sans nouvel audit. Tous les nouveaux candidats sont lus au SHA immuable `a15d65044ca4454bf3159f4155e51465b2a70a2c` ; la correction5e0285d de PR171 ne modifie pas rétroactivement ces verdicts. Pas de test/browser/API/DB lancé pour M08, pas de fiche ou ancien oracle réécrit. Une assertion indirecte/inverse générique n'est pas une couverture fonctionnelle ciblée. D ultérieure ne prouve pas l'exécution ni n'efface l'historique.

## CLASSIF-1 : code et preuves dans PR171

Autorisation6250110849 ; [inventaire A2](A2/CLASSIF1-INVENTAIRE-A2.json) et [revue conjointe A5](A5/CLASSIF1-REVUE-CONJOINTE-A5.json) préalables :42 sources,216 citations/202uniques.41 sources identiques sur maina4 ; le seul diff de la route testAPI est le recâblage DB1/2, assertions classification inchangées. Cette route n'est pas exécutée ici.

[Issue170](https://github.com/RachEma-ux/Fadi/issues/170), [PR171 draft](https://github.com/RachEma-ux/Fadi/pull/171), commit **5e0285d37f23c7c539502664036f0a2ff0986409**, branche courte indépendante de169 issue de maina4. La commande n'invente plus de classeIFC ; absence et métadonnées existantes conservées. Pas de réparation des anciennes données, modification UI/API/schéma/norme ou moteurIFC.

[Validation A3](A3/CLASSIF1-VALIDATION-A3.json), [24 cas indépendants A5](A5/CLASSIF1-TESTS-ET-REVUE-A5.json), [revue A2](A2/REVUE-CLASSIF1-FINALE-A2.json), [contrôle A0 des quatre fichiers](CLASSIF1-REVUE-A0.json). **492 tests purs Atelier /107 fichiers réussis**, types et build réussis. La validationA3 précède le commit ; son champ « SHA à renseigner » est résolu ici par5e0285d et les quatre empreintes exactes, sans réécrire son original.

[Observation CI distante](A6/CI-171-observation.json), [contexte strict A6](A6/CI-CLASSIF-CONTEXT-PROOFS.json) : CI39130408506 success au SHA5e, job pur117684235447 success. Les trois jobs validate/e2e/image sont **skipped avant services**, pas des réussites d'intégration. Node distant22.23.3/npm10.9.9 ; aucune base réelle, migration ou service. Aucun rerun DB1/2. PR prête à revue, non fusionnée/non acceptée métier. Les workflows165/169/171 devront être réconciliés avant toute fusion séparément autorisée.

## G0, G1 et G2

[Acte G0](A1/G0-ACTE-ACCEPTATION-DOCUMENTAIRE.json), [delta4 IDs](A1/G0-DELTA-4-IDS-PROPOSE.json), [revue A4](A4/REVUE-G0-ACTE-DELTA4.json) : G0 accepté uniquement pour cadrage documentaire sur6250109830/dossier7b0cca4. Registre canonique630 :203Àdéfinir/186Encours/207Bloqué/32Vérifié documentaire/2Accepté cadrage documentaire. **P630=34/630=5,4%, PDEV=N/D** ; zéro case source/HTML,31 missions ouvertes, pas de capacitéStudio acceptée.

[Compléments G1 actifs v2](A1/G1-COMPLEMENTS-M17-M24-DEC01-DEC03-v2.md), [schémas logiques](A1/G1-SCHEMAS-LOGIQUES-DOCUMENTAIRES-v2.json), [exemples](A1/G1-EXEMPLES-DOCUMENTAIRES-2D-IDENTITES-v2.json), [revue A2v2](A2/REVUE-G1-DEC01-DEC03-V2-A2.json), [revue A4v2](A4/REVUE-G1-COMPLEMENTS-v2.json). Versions initiales conservées pour provenance, v2 remplace leur contenu actif. Hash de contenu et pièce publiée distingués ; ces vérifications documentaires ne sont pas des tests produit.

[Index G1-01..04 / premier sous-ensemble](A1/G1-INDEX-PREMIER-SOUS-ENSEMBLE-I-A1.md), [proposition G2A1](A1/G2-DOSSIER-POC-PUR-2D-IDENTITES-PROPOSE.md), [annexe concrète A0](G2-PERIMETRE-A0-PROPOSE.md), [revue sécurité préparatoire](A6/REVUE-G2-SECURITE.json). Aucun POC/codeStudio exécuté/autorisé, G1–G4 non acceptés, décisions physiques DEC01/03 ouvertes et CAD-DEC-03 personnes/disponibilités inconnues. Les bornes proposées ne sont ni budgets produit acceptés ni performances mesurées.

[DEC18 moteurs candidats A3](A3/DEC18-MOTEURS-PUBLICS-CANDIDATS.json) :12 groupes, interfaces des quatre noyaux publiques distinguées des modules internes Atelier/UI. Licences locales absentes ne signifient pas droits prouvés ; wrapper OCCT et WASM doivent rester distingués. [Revue A6](A6/REVUE-DEC18-A6.json) reçue, pas de POC/import exécuté ni contrat physique clos.

## CI documentaire et sécurité

[Preuve distante b102](CI-165-b102-observation.json) : CI39129967610 et quatre contrôles documentaires success au seul SHAb1023605b965b27ff56fabf179756592673c98d4. [Implémentation A6](A6/CI-DOC-IMPLEMENTATION.md) et [revue A0](CI-REVUE-A0.json) : tuple exact repo/headrepo/event/head/base, allowlist vérifiée avant contrôles, hors périmètre refusé sans DB. Les anciens jobs restent inchangés sur les autres contextes. Le prochain SHA doit être observé séparément, pas de vert transféré.

[M09 état GitHub](A6/M09-ETAT-CONTROLES-GITHUB.json) :5workflowsmain lus, aucun scanCVE dédié identifié. Métadonnée absente et endpoints d'alertes refusés par le connecteur400 INVALID_ARGUMENT : état/comptes inconnus, aucun scan tenté ni contournement. Main non protégé au dernier contrôle ; aucune administration modifiée.

[CSP/KML](A4/CSP-KML-DELTA-DECISION.md), [neuf cas documentaires](A4/CSP-KML-CORPUS-DOCUMENTAIRE.json) : HTTPS exact approuvé doit être distingué d'un domaine seulement identifié ; aucun header/enforcement/chargement réseau autorisé.

[Réconciliation future des workflows](A6/CI-RECONCILIATION-165-169-171-PROPOSEE.md) : comparaison immuable, aucun assemblage effectué. Trois conditions partagées doivent être combinées ;169 ne teste pas explicitement github.repository. Un pushmain rendrait les jobsDB éligibles : aucune fusion sans accord et préconditions.

## Suite autorisée et blocages locaux

Terminer les revues des125 analyses M08 ; A0 intègre chaque remise vérifiable, checkpoints des deux chantiers ensemble et publication165. Poursuivre les contrats/corpus/oracles et préparer la décisionG1/POC avec périmètre concret ; aucune attente globale. DB3, service/reprise, admin, migration, fusion, production et codeStudio sans décision restent exclus. Cinq originauxMission002 non accessibles restent explicitement manquants.

[Manifeste](manifest.json) : copies à octets identiques, provenance et hash. Les copies datées ne sont pas réécrites pour leur faire annoncer les étapes ultérieures. Les contrôles14 tests documentaires/couverture630/continuité/diff sont consignés dans le checkpointA0 après exécution ; ils ne prouvent aucune conformité métier.
