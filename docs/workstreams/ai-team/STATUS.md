# Statut — équipe Codex Fadi

Mis à jour : 2026-10-18 (UTC).

## État

Référence applicative/main : `27c0c5a35e2f116752a83a9c66459484488a1975`. Reprise programme : `a09c11d397c8527987c3d1c4410ebb2eb240a819` ; récupération publiée : `3f0dc63cd3a713417970d9c42cfc7ceee3d2a759` ; nouveaux commits d’instructions intégrés jusqu’à `a3cc3c32cfcaa38d9d3117f63644499f9f061f4b`. PR #165 ouverte/non fusionnée. Le commit porteur de ce checkpoint se lit dans l’historique de ce fichier ; les anciens SHA ne sont pas présentés comme sa tête.

[Rapport A0 et index des pièces](../../ai-team/reports/mission-003/README.md) ; [récupération](../../ai-team/reports/MISSION-003-RECUPERATION.md) ; [manifeste des originaux](../../ai-team/reports/mission-002-originals/manifest.json). 19 pièces réellement inventoriées,14 originaux non redondants archivés à octets identiques ; aucun original autonome INV/IF/AC introuvable inventé. Les 141 fiches complètes et les dossiers DEC ajoutés sont explicitement de nouvelles préparations Mission003.

[missions.json](../../ai-team/missions.json) conserve31 missions, propriétaires/plages/inputs inchangés :18 En cours,12 Bloqué,1 À définir ; **zéro mission entière clôturée**. [Registre630](../studio/task-register.json) :258 À définir,159 En cours,207 Bloqué,6 Vérifié documentaire ;141 TR en préparation et18 tâches DEC instruites mais décisions À définir. Neuf NAV et38 TEST prescrits, non exécutés. Zéro case source cochée, zéro acceptation métier Studio. P630=6/630=1,0 %, uniquement références/provenance ; PDEV=N/D (DEV_SCOPE et baseline du périmètre accepté absents).

A0 a réellement coordonné A1/A2/A4/A5/A6. Livrables :141 fiches EX/INV/IF/AC avec ancres XML exactes et cas individuels,18 dossiers DEC,9 fiches NAV,38 oracles,7 corpus décrits,223 liens TEST/8 NAV candidats et12 dossiers de sous-lots. Revues A2/A5 :141 textes exacts ; A2 :18 DEC exactes. A3 inactif. Fiches/contrats/tests proposés ne sont pas une preuve de réalisation/conformité.

## Faits vérifiés

- Local : les trois contrôles documentaires obligatoires sont exécutés à chaque publication (14 tests unitaires du validateur,630/630 affectations, continuité). La validation enrichie compare source630/fiches141/DEC18/oracles38/manifestes ; voir rapport A0 et preuve de validation. Aucun test API/E2E/destructif local lancé.
- `a09c11d…` : CI39114417812 réussie ; les journaux consultés confirment1757 tests/1 ignoré et3 validations IFC. Le réimport cité reste à0 IfcWall/1539 proxys ; ni conservation paramétrique ni certification BIM. Le seul succès E2E ne revalide pas le nombre historique47.
- `3f0dc63…` : couverture39116784818, continuité39116784845, isolation39116784874 réussies ; **CI39116784772 annulée**. Ces résultats ne sont pas transférés au commit suivant.
- PR154 : correction documentaire du relais au commit `76e43d19645dc8a8ffd91282177e6a31d123f73a` ; continuité39117137780/isolation39117137776 réussies, CI39117137782 encore en cours au relevé. Aucune fusion.
- PR142 : la CI applicative relue échoue à `planche-boutons` (layout réussi) ; PR152 : proposition de gardes/ruleset relue sans activation. Vérifier toute nouvelle tête avant intégration.

## Points ouverts

| Mission / décision | Cause | Responsable | Essais/preuves | Action exacte |
|---|---|---|---|---|
| M01 / M002-D04 | API/DB/web indisponibles ; DB arrêtée255, cause non démontrée ; scripts publiés non exposés par statut | A6 | Runtime18, ports/logs expurgés relus sans restart | Accord reprise bornée sur cible attestée, `MIGRATE_ON_START=0` ; provision/init séparés |
| M02 / M002-D03 | Garde DB non implémentée, code non autorisé | A5 puis A3 désigné |16 refus/2 positifs prescrits, aucune connexion/destruction | Accord DB-1/2 garde+tests purs d’abord ; DB-3 jetable après preuve de protection |
| M03 / M002-D05 | main protected=false ; activation administrative non autorisée | A6/utilisateur | Noms réels de checks et candidat désactivé PR152 relus | Choix solo/équipe et autorisation administrative distincte |
| M05/M21 | Versions v2/v3, alias `echelle`, contrats non résolus | A2/A4 | Lecture statique/25 arêtes web, contrat candidat | Décider compatibilité/alias et revue frontières avant correction autorisée |
| M08 | Inventaire lexical incomplet sémantiquement | A2 |488 fichiers/1887 paires fichier-ligne couverts dans les cinq cohortes ;125 chemins absents/69 fiches à rapprocher et hors scanner ouverts | Rapprocher125 chemins selon leur rôle historique/prévu/courant ; DA-09-09 reste prospectif ; ne pas conclure hors scanner |
| M09 | CSP/scan vulnérabilités non réalisés | A5 | Spécification et protocole de triage, pas scan effectif | Valider périmètre, puis lot de code/essais autorisé |
| M11/M14 / D01/D02 | Référence technique/pilote/options nouvelles non ratifiés | A1/utilisateur | Sources/141fiches/18DEC/pilote proposés | Décider nouveaux choix sans rouvrir invariants ni D179 |
| M13/M16 / D06/D07 | Navigation candidate et ordre PR non acceptés | A0/A2/A4/utilisateur | PR142/152/154 relues ; neuf NAV prescrits | Choisir contrat et ordre ; aucune fusion impliquée |
| M17–M28 | DEC/portes/corpus/réalisation/recette/restauration manquants selon sous-lot | Propriétaires missions.json | Douze dossiers préparés, zéro lot de réalisation ouvert | G0→G1→G2→G3→réalisation autorisée→G4 ; accords sensibles distincts |

[Dossiers canoniques M002-D01 à D08](../../ai-team/reports/mission-003/DECISIONS-M002-D01-D08.md). D08 est déjà autorisé pour la seule documentation, pas à redemander. M10 : preuves #149/sauvegarde d2107ead relues, ne pas refaire un jalon de production accepté. Anciennes mesures Cloud/CI conservées dans leurs rapports datés ; révision18 actuelle ne prouve pas une session neuve ni la santé applicative.

## Liens de suivi

1. Lire AGENTS, continuité puis ce HANDOFF→STATUS→TASKS→CONTEXT ; CODEX-START-HERE, missions.json, rapports Mission003 et CODEX-HOURLY-OPERATIONS. Vérifier main/HEAD/diff/PR/CI exacts avant nouvelle action.
2. Lire [#166](https://github.com/RachEma-ux/Fadi/issues/166). ACK authentique déjà publié le18/10/2026 : [6248489826](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6248489826). Questions stables Q-M003-D01 à Q-M003-D07 correspondent aux dossiers existants, sans registre concurrent. Consigner les réponses attribuées ; une réponse informative ne donne pas une autorisation sensible.
3. Vérifier la publication et les liens des rapports/registres ; relever CI du SHA exact. Poursuivre les lectures/qualifications indépendantes, notamment contrats et inventaire sémantique restant. Propriétaire unique A0 des documents communs ; rapports agents isolés, pas d’écriture concurrente.
4. Sur accord explicite, ouvrir uniquement le sous-lot autorisé et ses préconditions : A3 reste inactif tant que l’accord code manque. Services, base réelle, migrations, administration, fusion et production conservent leurs autorisations séparées.

Ni l’Issue ni le protocole horaire ne lancent une session Cloud. Aucun processus de relance autonome n’est configuré par ce checkpoint ; produire ACK/progrès réels lors d’une session active, pas une promesse d’exécution en arrière-plan.

## Historique préservé

Les états antérieurs « originaux à récupérer » et «141 fiches à compléter » décrivent la réception initiale, conservée dans le Git du checkpoint3f0dc63 et dans MISSION-002-RECEPTION. Ils sont remplacés par les faits de récupération/préparation ci-dessus ; aucune décision historique réécrite. La checklist630 et ses cases restent inchangées.

## Préconditions de clôture

Preuves propres à la nature de chaque ID, décision applicable et acceptation quand nécessaire. Aucun lot ou mission clos par la seule préparation. Les autorisations de code, POC, services, base réelle, administration, fusion et production restent distinctes.

## Publication et contrôles du checkpoint intermédiaire

Spécifications intégrées au commit `dcf29af87e9a3673c062cc95d44cec32fa8e2902` dans PR165 : couverture39117840428, continuité39117840416, isolation39117840432 et audit isolation39117840420 réussis ; CI39117840425 en cours au relevé10:08UTC. [Progrès authentique](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6248587777). Les questions D01–D07 sont réellement publiées et liées dans le dossier de décisions ; aucun accord reçu à ce relevé. Aucun résultat transféré au commit porteur suivant.

## Poursuite M08 après dcf29af

Cohortes code176/fiches269/supplément449 effectivement reçues ; réconciliation1887/1887 paires uniques sur488 fichiers, zéro doublon/manque du scan initial (preuve validation-M08-A0.json dans index A0). Qualification contextualisée assistée, aucune validation technique globale.125 chemins littéraux absents/69 fiches, un abrégé et DA-09-09 prospectif sont conservés ouverts. M06 ajoute note C1 FR/EN selon D-163, sans réécrire D-156. Les autres limites hors scanner/licences restent ouvertes ; aucun lot de code ni opération sensible engagé.

## Dernier contrôle GitHub — réserve CI154

PR165 publiée au commit `da7f3d2ef8974040641bd2566a0d6466d9961eb1`, main inchangé27c0c5a, dépôts locaux propres après publication. Sur da7f3d2 : couverture39118392102, continuité39118392083, isolation39118392055 et inventaire39118392067 réussis ; CI39118392070 en attente au relevé. Aucun résultat global vert déduit ni transféré au commit porteur suivant.

PR154 tête76e43d1 : CI39117137782 maintenant **échec**, validate/image réussis, e2e117645106144 échoue dans atelier-complements (raccord multiple : quatre arcs créés, révision90 relue au lieu de91). [Diagnostic A6 et preuve expurgée](../../ai-team/reports/mission-003/A6/CI-PR154-76e43d1.md). Cause racine non démontrée ; possibilité de lecture modèle/révision non atomique à instruire, pas résultat d’un test de concurrence. Aucun rerun, délai augmenté ou assertion affaiblie. Responsable A5/A2, suivi M04/M05 et D06 ; code/scénario mutateur restent soumis à M02 et autorisation. Le relevé antérieur « en cours » reste son instant historique, pas la conclusion actuelle.

Questions Q-M003-D01..D07 toujours ouvertes sans réponse au dernier relevé. Prochaine reprise : lire #166/HEAD/CI puis contrats et125 références à rapprocher ; sur accord explicite seulement, engager le sous-lot borné. Aucun déploiement, migration, service, règle administrative ou fusion exécuté.

Le suivi de cette réserve a été poursuivi : [contrat A2](../../ai-team/reports/mission-003/A2/CI154-SNAPSHOT-CONTRAT.md) et [protocole A5](../../ai-team/reports/mission-003/A5/CI154-NON-REGRESSION.md) effectivement livrés. Lecture non atomique possible statiquement, cause runtime non démontrée. Aucun scénario/simulation exécuté ; prochaine étape mutatrice uniquement après accord de lot/M02, sans modifier l’oracle+1.
