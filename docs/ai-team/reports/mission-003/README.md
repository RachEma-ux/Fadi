# Mission 003 — checkpoint de coordination A0

18 octobre 2026, programme [#156](https://github.com/RachEma-ux/Fadi/issues/156), [PR #165](https://github.com/RachEma-ux/Fadi/pull/165), branche `docs/156-codex-missions-completes`. Ce dossier contient les **nouveaux travaux de Mission 003** ; les [originaux Mission 002](../mission-002-originals/README.md) restent distincts et immuables. Les dates et SHA des rapports désignent leurs observations, pas une CI transférable au commit porteur.

Référence applicative : `27c0c5a35e2f116752a83a9c66459484488a1975`. Reprise documentaire : `a09c11d397c8527987c3d1c4410ebb2eb240a819`, récupération publiée à `3f0dc63cd3a713417970d9c42cfc7ceee3d2a759`, instructions horaires intégrées par avance rapide jusqu’à `a3cc3c32cfcaa38d9d3117f63644499f9f061f4b`. Dépôt initial `work@aadd083…` laissé intact ; analyses dans une copie isolée. Aucune anomalie déduite du seul nom `work`.

## Avancement mesuré

| Indicateur | Valeur et limite |
|---|---|
| Missions | 31 suivies dans [missions.json](../../missions.json) : 18 En cours, 12 Bloqué, 1 À définir ; **aucune mission entière clôturée** |
| Registre Studio | [630 IDs exacts](../../../workstreams/studio/task-register.json), tous qualifiés initialement par groupe ; 141 fiches normatives détaillées, 18 dossiers DEC et 9 NAV prescrits |
| États des tâches | 258 À définir, 159 En cours, 207 Bloqué, 6 Vérifié documentaire ; 0 Implémenté/Accepté, 0 nouvelle case source cochée |
| P630 | 6/630 = **1,0 %** : SRC-01/02/03, REP-01, PROV-01/02, uniquement provenance/références vérifiées ; pas un pourcentage de code |
| PDEV | **N/D** : DEV_SCOPE du périmètre accepté et baseline fonctionnelle non établis ; aucun dénominateur inventé |
| Tests Studio | 38 oracles, 7 corpus décrits, 223 liens TEST et 8 liens NAV candidats ; aucune exécution métier Studio |
| Agents | A0 coordinateur et A1/A2/A4/A5/A6 réellement exécutés ; A3 inactif |

Les six contrôles documentaires ne valent ni six capacités logicielles ni une recette Studio. Une fiche préparée, un test présent ou un chemin existant ne prouve pas la conformité. Les états de décisions, tests et travail restent distincts.

## Livrables et preuves

- M00/M29 : [récupération et pièces indisponibles](../MISSION-003-RECUPERATION.md), [manifeste des contributions](manifest.json), [registre630](../../../workstreams/studio/task-register.json).
- A1/M11–M12–M14 : [cadrage et pilote](A1/M11-M12-M14-preparation.md), [141 fiches exactes](A1/studio-141-fiches.json), [18 dossiers DEC](A1/studio-18-decisions.json), [gates](A1/gates-et-pilote.json), [provenance](A1/sources-provenance.json).
- A2/M05–M07–M08 : [contrats et limites](A2/M05-M07-M08-CONTRATS.md), [imports](A2/module-edges.json), [inventaire lexical](A2/isolation-triage.json), [23 fichiers/90 occurrences relus](A2/isolation-nominal-review.json), [20 autres documents/43 occurrences](A2/isolation-extra-docs-review.json), [revue des DEC](A2/review-A1-DEC.json).
- A4/M13–M16–M21 : [navigation candidate](A4/CONTRAT-NAV-CANDIDAT.md), [9 NAV](A4/NAV-FICHES.md), [Registry/Manager](A4/M21-MANAGER-PREPARATION.md), [PR recouvrantes et propriétaires](A4/PR-COMPROMIS-ET-CHECKPOINT.md), [revue croisée](A4/REVUE-CROISEE-141-FICHES.md).
- A5/M02–M09–M15–M26 : [garde DB et lots A3 proposés](A5/A5-M02-M09-M15-M26.md), [38 oracles](A5/studio-38-oracles.csv), [7 corpus](A5/corpus-S1-S7.csv), [liens TEST](A5/liens-141-vers-38.csv), [liens NAV](A5/liens-141-vers-NAV.csv), [revue141](A5/revue-141-fiches-A1.json).
- A6/M01–M03–M04–M10 : [Cloud, CI, protection et exploitation](A6/RAPPORT-A6-M01-M03-M04-M10.md), [preuves bornées](A6/preuves-bornees.json), [extraits CI expurgés](A6/extraits-ci.txt).
- A0/M06 : [corrections documentaires effectivement réalisées](M06-DOCUMENTATION.md), [revue A2](A2/review-M06.json). [Décisions canoniques D01–D08](DECISIONS-M002-D01-D08.md).

L’extraction de 141 textes et des 18 DEC a été comparée aux paragraphes XML exacts des sources, indépendamment par A2/A5. Les rapprochements code→contrat→tests sont des **candidats** à instruire. Aucun original INV/IF/AC autonome de Mission 002 absent des espaces accessibles n’a été inventé.

## Dossiers de lots préparés

| Lot | Mission/propriétaire de réalisation | Entrées déterminantes |
|---|---|---|
| [I](A2/LOT-I.md) | M16/A4 | Navigation adoptée, contexte A.1, G3 et autorisation |
| [X](A2/LOT-X.md) | M15/A5 | Corpus synthétiques, instrumentation, cible sûre avant exécution |
| [A.1](A2/LOT-A.1.md) | M17/A2 | DEC-01/02/03/12/18 et autorités |
| [A.2](A2/LOT-A.2.md) | M18/A3 futur | Document 2D indépendant, G3 applicable |
| [A.3](A2/LOT-A.3.md) | M19/A3 futur | Modèle spatial indépendant, G3 applicable |
| [A.4/A.5](A2/LOT-A.4-A.5.md) | M20/A2 | Association, commandes/historique, A.2/A.3 selon contrat |
| [B](A2/LOT-B.md) | M21/A4 | Registry/Manager, profils, alias et chargement |
| [C](A2/LOT-C.md) | M22/A2 | Oracles index/rendu, DEC-08/09/10/13/17 |
| [D](A2/LOT-D.md) | M23/A6 | Jobs/révision, workers et mémoire, DEC-11/13 |
| [E](A2/LOT-E.md) | M24/A1 | Dossier métier, approbation/publication, DEC-16 |
| [F](A2/LOT-F.md) | M25/A2 | Options explicitement retenues, accords et preuves propres |
| [R](A2/LOT-R.md) | M27–M28/A6 | Simulation, restauration, G4, accords sensibles distincts |

Chaque dossier précise exigences exactes, composants présents/manquants, contrats, décisions, dépendances, tests, preuves, risques, retour arrière et autorisation. Ces douze dossiers sont préparés, **aucun lot de réalisation ouvert**. Séquence conservée : G0 → G1 → G2 → G3 → réalisation autorisée → G4. Les décisions facultatives ne bloquent que leurs dépendants.

## Réserves et prochaine action

P1 Cloud : statut runtime révision18 observé ; API/DB/web indisponibles aux ports attendus, PostgreSQL arrêté255, cause non démontrée. Scripts publiés non obtenus du seul statut, démarrage en nouvelle session non reproduit. P1 DB : garde non implémentée, tests destructifs non lancés. P1 GitHub : main non protégé, aucune activation administrative.

P2 : compatibilité Atelier v2/v3, alias `echelle`, frontières web, CSP et vulnérabilités restent ouverts ; documentation ciblée corrigée seulement. Inventaire lexical initial1283 fichiers,488 touchés/1887 lignes ;488 fichiers/1887 paires fichier-ligne de la référence a09 désormais couverts par cinq cohortes contextualisées assistées (pas preuve d’autonomie exhaustive). Ni présence lexicale ni contrôle nominal réussi ne suffit à une conclusion d’isolation exhaustive. P3 : Node24/22 et Chromium154/141 observés, mesures sur appareils réels absentes.

CI sur `a09c11d…` : run39114417812 réussi, journaux confirmant1757 tests/1 ignoré et3 IFC ; pas preuve de conservation paramétrique (0 IfcWall/1539 proxys au réimport cité). Les47 scénarios historiques ne sont pas certifiés par le seul succès d’un job E2E. Sur `3f0dc63…` : couverture39116784818, continuité39116784845, isolation39116784874 réussis ; CI39116784772 **annulée**. Ne pas transférer ces résultats au prochain commit.

Prochaine opération autorisée : lire les réponses [#166](https://github.com/RachEma-ux/Fadi/issues/166), vérifier HEAD et CI exacts, poursuivre les comparaisons de contrats et le tri documentaire restant ; maintenir les blocages. Soumettre les seuls choix/accords nouveaux D01–D07 ; D08 est déjà acquis. Aucun code A3/POC, restart, migration, règle GitHub, fusion ou déploiement depuis ce checkpoint.

## Propriété unique des fichiers partagés

A0 intègre seul les documents et STATUS/HANDOFF pendant cette vague. Pour la future réalisation : routes/navigation/traductions/styles à A4 en coordination avec #142 ; schémas/modèles/manifestes/commandes à A2 pour le contrat puis A3 désigné pour le lot ; setup/client DB à un seul A3 après accord, revue A5/A6 ; workflows à A6 avec revue A5. Les autres agents fournissent des rapports isolés et revues, sans écrire simultanément ces fichiers.

[Validation enrichie A0](validation-A0.json), [revue du registre A1](A1/review-register-M003.json) et [scan des contributions A5](A5/security-review-M003.json). Les contrôles locaux et GitHub sont consignés dans les checkpoints de [l’équipe](../../../workstreams/ai-team/STATUS.md) et [Studio](../../../workstreams/studio/STATUS.md). Le SHA porteur final et ses conclusions CI sont à relire dans la PR ; chaque observation précédente conserve son propre SHA.

## Tableau de coordination M00–M30

Ce tableau est une vue du registre missions.json, pas un programme supplémentaire. Les dépendances s’appliquent par livrable/contrat, sans attendre artificiellement la clôture de toute une mission.

| Mission / agent | Priorité | État | Dépendances / prochaine action | Preuve |
|---|---|---|---|---|
| M00 / A0 | P1 | En cours | Référence commune → Contrôler réponses #166, puis poursuivre les seules tâches autorisées. | [Dossier](README.md) |
| M01 / A6 | P1 | En cours | M00:référence et autorisations → Obtenir M002-D04 pour reprise bornée, sans migration implicite. | [Dossier](A6/RAPPORT-A6-M01-M03-M04-M10.md) |
| M02 / A5 | P1 | En cours | M01:cible jetable identifiée avant essais ; M00:autorisation du correctif avant code → Soumettre M002-D03 DB-1/DB-2 ; réserver DB-3 à une cible jetable attestée. | [Dossier](A5/A5-M02-M09-M15-M26.md) |
| M03 / A6 | P1 | Bloqué | M00:référence GitHub ; M04:noms réels des checks avant activation → Choisir politique de revue M002-D05, puis autorisation administrative explicite. | [Dossier](A6/RAPPORT-A6-M01-M03-M04-M10.md) |
| M04 / A5 | P1/P3 | En cours | M01:environnement ; M02:protection prouvée avant essais en base → Relever CI au SHA documentaire final ; séparer reproduction locale sûre de CI distante. | [Dossier](A6/RAPPORT-A6-M01-M03-M04-M10.md) |
| M05 / A2 | P2 | En cours | M00:SHA et périmètre → Arbitrer compatibilité/alias avant lot A3 ; conserver documents et historique. | [Dossier](A2/M05-M07-M08-CONTRATS.md) |
| M06 / A0 | P2 | En cours | M00:états GitHub ; M05:version contractuelle pour les textes concernés → Revoir ordre M002-D06 ; poursuivre inventaire documentaire sans réécrire décisions. | [Dossier](M06-DOCUMENTATION.md) |
| M07 / A2 | P2 | En cours | M00:relecture PR 152 avant modification → Revue de PR152 puis autorisation distincte pour nouveaux contrôles applicatifs. | [Dossier](A2/M05-M07-M08-CONTRATS.md) |
| M08 / A2 | P2 | En cours | M00:inventaire et décision de conservation → Rapprocher les125 chemins absents selon validation prévue/historique/courante ; conserver DA-09-09 prospectif sans inventer de fiche, puis qualifier hors scanner/licences selon périmètre. | [Dossier](A2/isolation-nominal-review.json) |
| M09 / A5 | P2 | En cours | M01:environnement pour essais ; M02:garde avant tests avec données → Valider périmètre CSP et protocole scan ; implémentation après accord. | [Dossier](A5/A5-M02-M09-M15-M26.md) |
| M10 / A6 | P1 | En cours | M08:preuves applicables de décontamination ; M04:preuves du candidat avant déploiement → Compléter seulement preuves manquantes de reprise ; ne pas répéter jalon déjà accepté. | [Dossier](A6/RAPPORT-A6-M01-M03-M04-M10.md) |
| M11 / A1 | P0 Studio | En cours | M00:références identifiées → M002-D01/D02 : ratifier périmètre/pilote et exclusions nouvelles, sans rouvrir D179. | [Dossier](A1/M11-M12-M14-preparation.md) |
| M12 / A1 | P0 Studio | En cours | M11:REF-01 et REF-02 accessibles → Instruire les contrats et preuves candidats après arbitrage du sous-ensemble. | [Dossier](A1/studio-141-fiches.json) |
| M13 / A2 | P0 Studio | En cours | M11:cadrage G0 ; M12:exigences pertinentes ; M07:carte actuelle des frontières → M002-D07 : décider contrat routes/contexte et responsabilités ; A2 reste responsable M13. | [Dossier](A4/CONTRAT-NAV-CANDIDAT.md) |
| M14 / A2 | P0 Studio | En cours | M13:contrats du sous-ensemble ; M15:corpus et protocole pour le POC ; M00:autorisation spécifique du POC → Prioriser DEC01/02/03/12/18 et autorisation POC distincte sur corpus sûr. | [Dossier](A1/studio-18-decisions.json) |
| M15 / A5 | P0 transversal | En cours | M11:sources pour préparation ; M02:cible sûre avant exécution en base → Définir périmètre de création de fixtures synthétiques et lot X autorisable. | [Dossier](A5/corpus-S1-S7.csv) |
| M16 / A4 | P0 Studio | Bloqué | M13:contrat navigation approuvé ; M14:G3 du lot I ; M17:contrat de contexte stable → Décider M002-D07 puis G3 du lot et autoriser A3 pour réalisation bornée. | [Dossier](A2/LOT-I.md) |
| M17 / A2 | P0 Studio | Bloqué | M14:DEC-01/02/03/12/18 applicables et G3 ; M13:autorités de données → Instruire DEC01/02/03/12/18 et valider autorités avant code/migration. | [Dossier](A2/LOT-A.1.md) |
| M18 / A3 | P0 Studio | Bloqué | M17:modèle document 2D ; M14:G3 du sous-lot ; M15:corpus 2D → Après A.1 et G3 applicables, autoriser un sous-ensemble 2D terminable. | [Dossier](A2/LOT-A.2.md) |
| M19 / A3 | P0 Studio | Bloqué | M17:modèle spatial ; M14:G3 du sous-lot ; M15:corpus 3D → Après A.1 et G3 applicables, autoriser un sous-ensemble 3D terminable. | [Dossier](A2/LOT-A.3.md) |
| M20 / A2 | P0 Studio | Bloqué | M17:contrats durables ; M18:édition 2D ; M19:édition 3D ; M14:G3 applicable ; M24/M27:preuves aval pour les seuls critères finaux concernés → Décider contrats puis réaliser après A.2/A.3 selon dépendances exactes. | [Dossier](A2/LOT-A.4-A.5.md) |
| M21 / A4 | P0 Studio | Bloqué | M17:contrats d’outils stables ; M14:DEC-04/05/06/07/14/18 applicables ; M15:protocole cache et mémoire → DEC04/05/06/07/14/18, alias echelle et autorisation du lot B. | [Dossier](A4/M21-MANAGER-PREPARATION.md) |
| M22 / A2 | P1 Studio | Bloqué | M17/M20:contrats géométrie et effets ; M15:oracle et mesures ; M14:DEC-08/09/10/13/17 applicables → Stabiliser contrats, DEC08/09/10/13/17 et mesures avant optimisation. | [Dossier](A2/LOT-C.md) |
| M23 / A6 | P1 Studio | Bloqué | M17/M20:job et révision ; M21:chargement ; M15:instrumentation ; M14:DEC-11/13 applicables → DEC11/13, contrats jobs/révision et instrumentation avant lot D. | [Dossier](A2/LOT-D.md) |
| M24 / A1 | P1 Studio | Bloqué | M17–M21:capacités A/B nécessaires ; M14:DEC-16 et contrats applicables ; M22/M23:sous-ensembles nécessaires à la charge → Compléter données/modèles/commandes ; DEC16 et tests du dossier approuvé. | [Dossier](A2/LOT-E.md) |
| M25 / A2 | P2 conditionnel | À définir | M11:périmètre d’option explicite ; M14:DEC et accord propres à chaque option ; M15:preuves propres → M002-D02 et décisions propres à chaque option ; ne pas bloquer artificiellement les études précoces. | [Dossier](A2/LOT-F.md) |
| M26 / A5 | P0/P1 Studio | En cours | M12:attendus pour préparer ; M15:corpus ; M02:base sûre ; M16–M25:capacités du scénario à exécuter → Construire corpus autorisés puis exécuter uniquement sur capacités/cibles autorisées. | [Dossier](A5/studio-38-oracles.csv) |
| M27 / A6 | P1 Studio | Bloqué | M17:schémas décidés ; M13:autorité pendant coexistence ; M02:environnement de simulation sûr ; M00:accord avant migration sensible → Schémas décidés puis simulation autorisée sur copie isolée ; accords sensibles séparés. | [Dossier](A2/LOT-R.md) |
| M28 / A6 | Livraison | Bloqué | M24:dossier métier candidat ; M26:recettes applicables ; M27:restauration prouvée ; M00:acceptation G4 et déploiement distinct → Obtenir preuves M24/M26/M27 puis décision G4 et déploiement distinct. | [Dossier](A2/LOT-R.md) |
| M29 / A0 | Transversal | En cours | M00:protocole commun ; M11:sources du chantier → Maintenir réponses, CI exacte et STATUS/HANDOFF ensemble à chaque reprise. | [Dossier](README.md) |
| M30 / A0 | Transversal | En cours | M11:pilote pour planifier ; M14:autorisations par sous-ensemble ; M16–M28:preuves du jalon concerné → Soumettre décisions nécessaires, maintenir missions bloquées et suivre preuves des jalons. | [Dossier](DECISIONS-M002-D01-D08.md) |

## M08 — poursuite après le checkpoint intermédiaire

Après dcf29af, A2 a effectivement poursuivi : [176 fichiers code/452 lignes](A2/isolation-code-review.json), [269 fiches/853 lignes](A2/isolation-fiches-review.json), [449 lignes supplémentaires dans les documents nominaux](A2/isolation-nominal-supplement.json). Avec90 lignes nominales et43 autres documents, l’union est exactement1887 paires fichier-ligne uniques des488 fichiers du scan initial : [réconciliation indépendante A0](validation-M08-A0.json), zéro manque/doublon. Qualification de références et de contexte, **pas validation technique complète des algorithmes/fiches ni preuve exhaustive d’autonomie**. Aucun import, URL ou appel opérationnel DrawAll identifié dans ces occurrences ; dépendances transitives, ressources sans marqueur, archives/binaires, licences et données persistées restent hors preuve exhaustive.

Réserves P2 de traçabilité :125 chemins littéraux absents dans69 fiches, à distinguer entre validation prévue/historique et preuve actuelle ; aucun chemin absent parmi les en-têtes « preuve liée » examinés. Un chemin abrégé non résolvable ; DA-09-09 est prospectif P3 sans fiche, explicitement différé par les décisions/cahier (ne pas supprimer ni inventer). Le contraste FR seul de C1 dans le cahier Planche est contextualisé par une note actuelle D-163 FR/EN, sans réécrire D-156. M08 et M06 restent En cours. Les états « reste445/269/449 » des rapports de cohortes sont des instantanés successifs, remplacés par cette réconciliation, sans effacer leurs preuves.

Le [scan plus récent](isolation-current-summary.json) de l’arbre dcf29af augmenté de rapports trouve1351 fichiers/505 touchés/4996 lignes, avec sorties volumineuses signalées comme ignorées. Les nouveaux rapports et archives augmentent les références documentaires ; ce compte ne remplace pas la cohorte sémantique a09 et ne vaut pas une nouvelle dépendance. Aucun fichier applicatif hors README modifié.

Pour un futur lot de code, les propriétaires A1/A2/A4/A5/A6 désignent le contrat et la revue. A0 affectera chaque fichier à un unique écrivain A3 explicitement autorisé ; aucun agent ne commence à coder du seul fait de son rôle dans ces tableaux. Le checkpoint STATUS/HANDOFF concerne tout travail autorisé du chantier, au-delà des seuls fichiers docs/workstreams.
