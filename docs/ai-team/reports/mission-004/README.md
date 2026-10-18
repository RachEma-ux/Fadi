# Mission 004 — consolidation A0

Le lot DB-1/2 est implémenté et vérifié en simulation dans la [PR #169](https://github.com/RachEma-ux/Fadi/pull/169), laissée en brouillon sans fusion. Les autres missions ont produit les contrats et preuves documentaires ci-dessous. Aucune connexion à une base réelle, migration, reprise de service, opération administrative ou mise en production n’a été effectuée par cette mission.

## Références et publication

- Instructions documentaires reprises au commit `63e804be7b8e8935913514bd57937053c7402474`, PR #165 ouverte ; main observée `a4caaab0e6665480f09febe3914c960b424b6b47`.
- Code DB : branche `fix/157-test-database-guard`, PR #169, commit `a15d65044ca4454bf3159f4155e51465b2a70a2c`.
- Le présent checkpoint est préparé sur `docs/156-m004-checkpoint-sans-db`, branche courte sans PR. Les six workflows inspectés ne sont pas éligibles sur ce push non-main sans PR. [Avis A6 et limites](A6/AVIS-CHECKPOINT-BRANCHE-SANS-PR.md). Aucune CI n’est annoncée réussie sur ce checkpoint en l’absence d’exécution.
- La synchronisation de #165 reste en attente de Q-M004-CI-DOC-PURE dans [#166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249783428) : son workflow actuel provisionnerait PostgreSQL. Le patch proposé n’est pas appliqué. La sauvegarde temporaire conserve les mêmes fichiers, IDs et programme ; elle ne crée pas de suivi concurrent. Le SHA porteur se lit dans l’historique de ce rapport et dans le commentaire de publication.

## Résultats réellement vérifiés

DB-1/2 : **129 tests simulés réussis**, dont 83 tests adversariaux indépendants A5 ; typecheck et build racine réussis. La CI [39125959694](https://github.com/RachEma-ux/Fadi/actions/runs/39125959694), job 117671022920, réussit au commit `a15d650…`. Les jobs validate, e2e et image sont **skipped, sans étape**, et ne prouvent aucune intégration DB-3. Continuité 39125959712 et isolation 39125959914 réussissent au même SHA. Le registre de confiance runtime est volontairement vide : DB-1/2 ne permet aucune cible réelle. Les lanceurs API/E2E et migrations restent hors DB-3, sans être déclarés sécurisés ou testés par ce lot.

Les douze suites API modifiées conservent leurs scénarios et assertions ; seuls les resets et imports de garde changent. Aucun test d’intégration/destructif n’a été lancé. Les erreurs et chemins de refus sont vérifiés sur des transports simulés, y compris erreurs driver, identité/expiration, mutation pendant attente, transactions et fermeture du pool. [Rapport A3](A3/RAPPORT-A3-DB-1-2.md), [revue A2](A2/DB12-FINAL-STATIC-REVIEW.md), [preuves A5](A5/DB12-PREUVES-A5.json), [CI exacte A6](A6/CI-169-observation.json).

M08 : **125 occurrences dans 69 fiches, représentant 33 chemins**, rapprochées avec 185 relations candidates et 305 citations exactes contrôlées. Une correspondance partielle ou déclarée ne prouve pas l’équivalence d’un oracle. L’abrégé, DA-09-09 prospectif et les limites hors scanner/licences restent ouverts. [Mapping](A2/M08-125-PATH-MAPPING.json), [contrôle A0](validation-M08-A0.json), [revue A5](A5/M08-REVUE-ORACLES-A5.json).

Les **24 nouvelles conditions documentaires individuelles** sont revues par A5 et recontrôlées par A0 : libellés exacts, empreintes et 47 ancres de contenu sans erreur. ROUTE-03 avait une lacune Sources ; elle a été corrigée puis les références actualisées avant l’avis final. [Propositions et conditions](A1/proposition-24-IDs-documentaires-verifies.json), [revue indépendante](A5/REVUE-24-IDS-DOCUMENTAIRES-A5.json), [contrôle A0](validation-24-A0.json).

## Livrables et agents réellement mobilisés

| Agent | Livrables principaux | Portée |
|---|---|---|
| A0 | Consolidation, registre unique, checkpoints, preuves et coordination GitHub | Aucun lot global clos |
| A1 | [G0 complet](A1/G0-DOSSIER-FINALISE-M004.md), [141 fiches v2](A1/studio-141-fiches-v2.json), [18 DEC](A1/studio-18-decisions-v2.json), [publication/réouverture M24](A1/M24-CONTRAT-PUBLICATION-REOUVERTURE.md) | 104 EX, 15 INV, 11 IF, 11 AC exacts ; trois exemples A/B/C et quinze refus documentaires, pas tests produit |
| A2 | Revue DB, mapping M08, [contrats durables M17 et compatibilité Atelier](A2/M05-M17-CONTRATS-DURABLES.md) | 21 exemples non exécutables ; choix physiques et portes ouverts |
| A3 | Code de garde DB et tests purs | Uniquement DB-1/2 explicitement autorisé, PR distincte sans fusion |
| A4 | [Contrat NAV](A4/CONTRAT-NAV-M004.md), [maquettes](A4/MAQUETTES-DOCUMENTAIRES.md), [Registry/Manager M21](A4/M21-CONTRAT-MINIMAL.md), revues #142/#168 | Huit exemples de catalogue ; aucun composant Studio implémenté |
| A5 | Revue des 24 conditions, [conditions DB-3](A5/DB3-CONDITIONS-DE-RECEPTION.md), [38 oracles](A5/studio-38-oracles-M004.csv), [sept fixtures partielles](A5/fixtures-manifest.json) | Huit cohérences documentaires calculées, aucun TEST/NAV Studio exécuté ni corpus complet accepté |
| A6 | CI sans base pour #169, [versions et profil solo](A6/M03-M04-PROFIL-SOLO-VERSIONS.md), avis de sauvegarde sans PR | Runtime 40 observé après 32 ; aucune santé applicative attestée, aucun paramètre GitHub activé |

La [revue finale A5](A5/REVUE-M17-M21-M24.md) confirme la cohérence documentaire et signale la limite du négatif ORDER : ce cas ajoute une pièce, il ne remplace pas un futur oracle de permutation pure de plusieurs pièces. Aucun test produit n’en est déduit.

Les [revues croisées A2](A2/REVUE-M21-M24.json) et [A4](A4/REVUE-M17-M24.json) distinguent cohérence documentaire et recette. Deux réserves M21/M24 ont été corrigées puis revérifiées : catégories de résultats séparées des trois autorités d’écriture et sept empreintes de réouverture recalculées sans supprimer les fautes intentionnelles.

Les pièces agents sont conservées à octets identiques. Le [manifeste](manifest.json) relie leur provenance de session à leur copie publiable et son empreinte. Les scripts auxiliaires, journaux bruts, builds, dépendances et doublons delta141 ne sont pas versés. Les originaux Mission 002 déjà récupérés restent dans leur archive canonique ; les préparations Mission 003 restent historiques. Le registre actif reste `docs/workstreams/studio/task-register.json`, avec les pointeurs M004 explicites.

[Dossier M09 prêt à autoriser](A5/M09-LOT-A3-CSP-SCAN-PRET-A-AUTORISER.md) : inventaire CSP par usage, 14 oracles et proposition de scan/triage. Parcelle contient 23 scripts inline exécutables ; une politique self globale casserait cet outil. Le remplacement du WASM OCCT doit rester possible. Aucun scan externe ni changement de code/workflow n’a été effectué.

## Avancement réel du programme

Le registre contient **203 À définir, 188 En cours, 209 Bloqué et 30 Vérifié documentaire** : 630 IDs uniques. P630 = 30/630 ≈ **4,8 %**, exclusivement selon des conditions documentaires. **PDEV = N/D**, faute de DEV_SCOPE et baseline acceptés. Zéro case source ou HTML modifiée ; zéro acceptation métier Studio ; aucune porte G0–G4 acceptée. Les 141 fiches restent En cours et les 31 missions restent ouvertes, dont 25 En cours et six Bloqué. DB-1/2 ne ferme pas M02 entière.

## Décisions retenues et prochaines décisions

La [délégation #166/6249520098](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249520098) fixe déjà D01 (référence RT/pilote A/B/C), D02 (reports avancés), D03 (lot DB-1/2), D05 (profil solo), D06 (ordre des PR sous préconditions) et D07 (entrée Studio après Projets pour les spécifications). Ces choix ne sont pas reposés. L’interdiction explicite de toute connexion DB dans Mission 004 prime une lecture plus large de D04.

Les décisions nouvelles portent sur le patch CI documentaire concret, la revue du dossier de passage G0 complet et les contrats physiques DEC-01/03/18 puis 02/12. Aucune proposition ni revue d’agent ne vaut passage de porte. G1, G2, G3, réalisation autorisée et G4 restent distincts. Administration, DB-3/provisionnement, reprise locale de services, migration, fusion et production gardent leurs accords spécifiques.

## Blocages conservés et file suivante

| Sous-tâche | Responsable / état | Essai et prochaine action exacte |
|---|---|---|
| Synchronisation #165 | A0/A6 — WAITING_FOR_DECISION | Patch CI pur complet soumis dans #166 ; checkpoint sans PR inspecté comme sauvegarde sûre. Intégrer les mêmes commits à la branche canonique après décision applicable |
| DB-3 et reprise Cloud | A5/A6 — WAITING_FOR_OWNER | Conditions écrites ; aucune cible réelle autorisée. Préparer dossier d’identité et recette avant demande séparée, sans connexion |
| Protection main | A6 — WAITING_FOR_OWNER | main reste protected=false ; profil solo retenu, candidat #152 réutilisé. Activation et recette administrative après accord spécifique |
| G0 et contrats M17/M21/M24 | A1/A2/A4/A5 — READY pour revue documentaire | Recueillir revues croisées, publier leurs empreintes, soumettre seulement les décisions bornées restantes |
| M08 et M09 | A2/A5 — READY pour préparation | Compléter comparaison des attendus et dossier CSP/scan ; ne pas transformer les tests candidats en résultats |
| Code Studio I/A/B/X/C/D/E/F/R | Propriétaires de missions.json — WAITING_FOR_DEPENDENCY | Préparations indépendantes poursuivies ; portes et autorisations de réalisation absentes, aucune implémentation ouverte |

Les anciens échecs CI154/76e43d1 (quatre arcs, révision 90 attendue 91) et PR142 restent attribués à leurs SHA ; aucun rerun ou affaiblissement d’oracle. Les résultats historiques 1 757 tests, 47 scénarios et trois IFC ne deviennent pas une preuve du code courant, de round-trip paramétrique ou de certification BIM.

Avant interruption technique : STATUS et HANDOFF des deux chantiers mis à jour ensemble, commentaire `[CODEX-HANDOFF][NEXT-READY]` avec SHA exact et prochaine opération. Le programme continue lors d’une session active ; aucun travail en arrière-plan ou relancement automatique n’est prétendu.

## Poursuite effective après le premier checkpoint

Les 32 [qualifications individuelles supplémentaires](A1/delta-32-CAD-ARC-G0-G1-qualification.json) sont intégrées après [revue A4](A4/REVUE-32-QUALIFICATIONS.json) et contrôle A0 : 29 En cours, deux Bloqué sur la décision de passage G0, une À définir sur personnes/disponibilités humaines. Elles ajoutent conditions mesurables, existant, manques, décisions, 79 ancres de contenu et prochaines actions ; aucune clôture ni progression P630. Qualité et exploitation restent des responsabilités distinctes.

M08 : [huit oracles rapprochés](A2/M08-8-ORACLES-COMPARAISON.md) et [revus indépendamment A5](A5/M08-8-REVUE-INDEPENDANTE-A5.md). 52 sous-attendus : sept présents dans des préparations, 27 partiels et 18 absents dans les candidats examinés. 183 occurrences de preuve correspondent à131citations uniques ; toutes exactes au contrôle A0. Aucune équivalence E2E complète ; l’écart de classification IFC est conservé pour instruction sans réécrire les décisions.

M23/M27 : [contrat jobs/reprise/restauration](A6/M23-M27/CONTRAT-JOBS-REPRISE-RESTAURATION.md), six exemples et manifeste illustratif volontairement incomplet ; [revue A2](A2/REVUE-M23-M27.json). Aucune restauration ou simulation de moteur effectuée ; calcul, fraîcheur et engagement restent distincts, les écritures nouvelles et queues doivent être préservées, aucun budget ni rétention décidé.

M09 : [revue des usages CSP A4](A4/REVUE-M09-CSP-USAGES.md) et dossier A5 actualisé. Les cinq compléments documentaires sont traités, dont icônes KML HTTPS, styles dynamiques, worker/WASM et FR/EN/pending. Le choix de politique pour les images distantes reste à décider, sans wildcard ou suppression silencieuse. Aucun enforcement n’est prêt à être déclaré conforme sans recette.

Prochaine READY : comparaison en lecture seule des attendus M08-PATH-001..007, candidats versionnés, rapport A2 et revue A5, puis intégration A0. Les questions techniques G0/DEC01/DEC03/CI sont déjà publiées avec leurs dossiers ; aucune réponse reçue n’est présumée.

## Constat P2 supplémentaire — classification canonique

[Constat statique et lot proposé](A2/M08-CLASSIFICATION-CONFLIT-STATIQUE.md), [sources exactes](A2/M08-CLASSIFICATION-CONFLIT-STATIQUE.json) : l’affectation ou le retrait d’un code externe écrit systématiquement la correspondance de classe Fadi dans `classeIfc`, provenance règle/statut vérifiée. La fiche et les décisions D-065/D-111/D-112 relues ne prescrivent pas cette substitution ; D-174 conserve l’acceptation historique sans amender ces textes. A0 a lu le réducteur puis A2 a confirmé indépendamment ; sept sources et96lignes sont vérifiées, aucune reproduction runtime. Le test actuel attend cette écriture ; sa présence ne démontre pas le respect du contrat.

Un correctif pur borné est préparé, sans l’engager : préserver l’absence ou la déclaration saisie/importée, code/retrait/lots/inverses et contrôle/export distincts. Aucune réécriture de décision, nettoyage des données ou migration ; les écritures historiques ne peuvent pas être corrigées par supposition. Seule une autorisation de ce nouveau lot permettrait son code, jamais l’autorisation DB-1/2 par extension.
