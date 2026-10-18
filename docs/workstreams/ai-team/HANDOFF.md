# Reprise — équipe Codex Fadi

Mis à jour : 2026-10-18 (UTC).

## Point de reprise

Programme #156 entier, pas arrêt à Mission004. La prochaine opération est la lecture des décisions nouvelles puis la première READY autorisée.

## Dernier état vérifié

Reprise du checkpoint `496dcfc7bf80868ef21216d667187087db32a738`, programme #156 entier. Branche documentaire canonique `docs/156-codex-missions-completes`, PR #165 ouverte. Dernier checkpoint publié avant cette consolidation : `fa9f0db232f49007c5a8bebded4ffce530a5bf8f`. Main observée `a4caaab0e6665480f09febe3914c960b424b6b47`, non protégé. PR #169 draft à `a15d65044ca4454bf3159f4155e51465b2a70a2c` ; PR #171 draft à `5e0285d37f23c7c539502664036f0a2ff0986409`. Aucune fusion.

Les six décisions ChatGPT et la directive6250119063 ont été lues et appliquées dans leur portée. ACK6250149589 et progrès6250266800/6250524386 publiés dans [#166](https://github.com/RachEma-ux/Fadi/issues/166). [Rapport courant](../../ai-team/reports/reprise-496dcfc/README.md) et [parcours des 31 missions](../../ai-team/reports/reprise-496dcfc/A1/M00-READY-M00-M30-A1.json). Les snapshots précédents sont conservés, pas réécrits comme des résultats actuels.

**25 missions En cours,6 Bloquées,31 ouvertes.** Les états globaux ne ferment pas les sous-tâches indépendantes : M03/M18/M19/M20/M22/M28 gardent leurs dépendances propres. Registre630 :203 À définir /186 En cours /207 Bloqué /32 Vérifié documentaire /2 Accepté cadrage documentaire. **P630=34/630=5,4% documentaire/cadrage ; PDEV=N/D**, pas de DEV_SCOPE/baseline accepté. Zéro case source/HTML cochée. Seules les métadonnées de préparation sont enrichies à ce checkpoint, pas les 630 statuts ou textes.

G0 est **Accepté pour cadrage documentaire uniquement** sur décision6250109830/dossier7b0cca4. G0-01/02 Vérifié documentaire ; G0-03/CAD-DEC-01 Accepté cadrage. G1–G4 non acceptés ; décisions physiques DEC01/03, personnes/disponibilités CAD-DEC-03 et preuves aval restent ouvertes. Aucune fonctionnalité Studio acceptée.

## Prochaine action

1. Revalider les têtes #165/#169/#171/main et lire les nouveaux commentaires #166, sans transférer un vert d'un SHA à un autre.
2. Retrouver les questions Q-P156-G1-EXPERIMENTAL, Q-P156-G2-HARNESS et Q-P156-M08-DOC-SCOPE dans166 ; les publier si non encore publiées, puis enregistrer leurs liens/réponses. Aucune décision n'est présumée par leur préparation ou le temps écoulé.
3. Traiter seulement les sous-tâches devenues READY dans la portée d'une réponse. G1, G2, codeStudio, DB3, services, admin, fusion et production restent distincts. Une question ouverte ne bloque pas les autres travaux.
4. La file de préparation recensée (R1–R9 et annotations) a ses remises ; ne pas refaire G0/141extractions/125 comparaisons/NAV/contrats existants. Recevoir les pièces/décisions nouvelles, poursuivre la première action réellement exécutable ; les 31 missions demeurent ouvertes.
5. À chaque reprise effective : A0 seul checkpoints et intégration, A3 seul code autorisé, A6 workflows autorisés, agents dans fichiers séparés. Contrôles documentaires/diff/liens/empreintes, push165, CI au SHA exact et CODEX-PROGRESS.

## Tests et preuves

- **M08 :125/125 analyses et revues documentaires disponibles**, dont 117 nouvelles et8 historiques conservées sans réaudit. Index individuel, preuve de33 chemins littéraux absents/69 fiches et synthèse A0 ; aucun oracle complet ou scénario runtime validé. A2/A4 auteurs, A1/A3/A5 revues avec attribution, A6 empreintes/citations. Deltas de cinq qualifications et doublons049/050,064/065 conservés. Trois écarts documentairesP2 signalés par annotations dans les fiches, corps historiques/D174 conservés ; écarts toujours ouverts, pas nouvelle norme ni extension fonctionnelle.
- **CLASSIF-1 : PR171/5e0285d vérifiée dans sa branche**, inventaire conjoint préalable,492 tests purs Atelier/107 fichiers dont 24 cas A5, types et build réussis localement et en CI39130408506. Les trois jobs validate/e2e/image sont skipped avant services, pas des réussites d'intégration. Main et anciennes données restent inchangés ; aucune recette BIM ou conservation paramétrique intégrale déduite.
- **CI165 au seul SHA fa9 : cinq contrôles réussis**, CI39131918789, couverture39131919052, continuité39131919001, isolation39131918896 et inventaire39131919051. Job documentaire117688658959 réussi ; trois jobs intégration skipped avant services. Chaque nouveau SHA est vérifié séparément. DB1/2 PR169 conserve ses129 tests simulés historiques et CI propres, sans rerun.
- **G1 et traçabilité :** onze fonctions,53 exigences sélectionnées/88 conservées hors sélection dans v2, après réserves A2 ; catalogue de 38 oracles dont 27 liés comme candidats. Liens proposés distincts des sources explicites, pas preuve de couverture. Schémas/exemples logiquesv2, index G1-01..04, neuf NAV/seize cas futurs, dix choix de compatibilité et lacunes S1–S7 préparés, pas gates ou codeStudio réalisés.
- **G2 : proposition seulement.** Six sources expérimentales futures dont supervisor.py, option esbuild natif→artefact inédit→Node direct ; quatre invocations séquentielles proposées (typecheck/compilation/producteur/relecture),30s globales. Graphe public A2 et étude A3/A6 statiques ; FS/réseau/exclusivité/arbre de processus non attestés. Aucun runner/import/bundle/harness/POC exécuté ou code expérimental créé. Accord et conditions G1/applicables requis, exécution bloquée si garanties non démontrées.
- **M03/M09 :** annexe de checks exacts aux dossiers146/152 et réconciliation165/169/171 préparées, aucun ruleset appliqué. Les jobs conditionnels ne deviennent pas tous requis globalement et un skip peut compter passé pour GitHub sans être exécuté. Mainpush rendrait des jobsDB/migrations éligibles : accord distinct avant fusion. Aucun scanner dédié identifié dans cinq workflowsmain ; métadonnées/alertes inconnues, endpoints refusés par connecteur400, pas zéro vulnérabilité. Aucun scan ou contournement.
- **Environnement :** dernière observation runtime43 courant/running/enforced, pas preuve de santé API/DB. Aucune connexion réelle, reprise de service, migration, opération destructive, modification de sauvegarde ou production. Les succès historiques1757/47/3 ne sont pas transférés au code courant.
- **Rectification archivesM002 :**19 fichiers inventoriés,14 archivés non redondants ; cinq éléments référencés sans duplication. La mention antérieure de cinq originaux perdus était fausse et corrigée explicitement. Fichiers autonomes historiquesINV/IF/AC/DEC non retrouvés, distincts des informations intégrées et des 141 fiches ultérieures. Aucun original inventé.

## Risques et blocages

| Sous-tâche | Propriétaire / état | Déblocage ou suite |
|---|---|---|
| Consolidation M08,125 entrées | A0/A1/A2/A3/A4/A5/A6 — Vérifié documentaire | Sous-tâche achevée ; trois clarifications et autres écarts restent ouverts, sans réaudit125 |
| CLASSIF1/#171 et DB1/2/#169 | A3/A2/A5/A6 — Vérifié dans branches | Revues/acceptations et réconciliationCI ; aucune fusion ni essaisDB3 implicites |
| G1 / onze fonctions / M05-M17 | A1/A2/A4/A5/A0 — préparation revue | Décision bornée selon dossier exact et réserves par condition, pas réouvrir DEC01/03/D07 |
| POC G2 | A0/A2/A3/A5/A6 — proposé, non autorisé | Accord explicite + G1 applicable + confinement effectif avant toute exécution ; pas élargissement silencieux |
| Corpus/oracles et CSP | A5/A4 — préparation | Données synthétiques complètes/contrats/seuils nécessaires, fournisseur/origines approuvés à fournir ; aucun scan/enforcement |
| GitHub protection/main | A6 — Bloqué pour activation | Accord administratif et réglages finaux ; D05solo/D06ordre acquis, pas autorisation de fusion |
| Services/DB3/migrations/sauvegardes/production | Responsables missions.json — accords distincts | Cible explicitement attestée et autorisation applicable, aucun contournement ; poursuivre autre READY |

## Arrêt sûr

Checkpoint GitHub avant interruption, avec SHA réel et CODEX-HANDOFF/NEXT-READY. Aucun travail en arrière-plan, relancement automatique ou agent encore actif n’est prétendu ; vérifier leur état réel à la reprise. Les restrictions sensibles restent applicables même si une CI est verte.
