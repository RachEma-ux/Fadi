# Fadi — Première mission Codex Cloud : audit A0

**Date :** 18 octobre 2026 (Europe/Zurich).  
**Rôle :** A0 — Coordinateur technique.  
**Dépôt :** RachEma-ux/Fadi.  
**Statut :** audit initial réalisé, soumis à validation ; aucune correction engagée.  
**Suivi :** [#149](https://github.com/RachEma-ux/Fadi/issues/149), [#147](https://github.com/RachEma-ux/Fadi/issues/147), [#146](https://github.com/RachEma-ux/Fadi/issues/146), [PR #154](https://github.com/RachEma-ux/Fadi/pull/154).

> Archive du rapport présenté dans la conversation. Sa sauvegarde documentaire a été demandée ensuite par l’utilisateur ; elle ne vaut ni acceptation du rapport ni autorisation de correction, fusion ou déploiement. Les observations ci-dessous sont datées de l’audit, pas automatiquement actualisées par la création de cette archive.

## 1. Verdict et périmètre

Audit terminé avec réserves sur le démarrage applicatif et la publication Cloud. Le dépôt local est resté inchangé pendant l’audit. Aucun agent de correction, commit, PR, fusion ou déploiement n’a été lancé pendant cette phase.

L’architecture observée conserve le monolithe modulaire, les sept modules métier, les 21 étapes et Planche dans Atelier. Les fonctions industrielles disposent de modèles, routes et recettes Fadi. Aucun couplage nominal exécutable vers DrawAll n’est détecté dans les 761 fichiers contrôlés ; l’autonomie exhaustive ne peut pas être déduite de ce seul scanner.

Aucun P0 démontré dans le périmètre inspecté. Aucun verdict général de sécurité, certification réglementaire ou parité intégrale au prototype n’est émis.

### Sources et méthode

Documents consultés : AGENTS.md, docs/architecture.md, docs/continuity/README.md, index des chantiers, puis HANDOFF → STATUS → TASKS → CONTEXT pour purge-drawall et architecture-webapp ; README des sept modules, registre, manifestes, contrats de commandes, routage, authentification, droits, workflows et recettes Atelier/P2/Planche.

Décisions pertinentes : D-163 (langues), D-174 (acceptation Atelier/Planche), D-177 (licence OCCT), D-182 (contrat v3), D-193 (acceptation P2), D-194 (référence protégée), D-202 et suites (outillage Planche), décision du 17 octobre dans le chantier #147 (conservation des fonctions industrielles et règles normatives).

Le relais docs/ai-team/CHATGPT-CODEX-HANDOFF.md a été lu sur docs/153-chatgpt-codex-handoff, tête be0ac4c5e79e5a314f545117819188d69d9124e1. La PR #154 était ouverte, non fusionnée. Les Issues #146, #147, #149 et la PR #148 ont été consultées sur GitHub.

La présente mission autorisait un diagnostic initial en lecture seule. Elle ne prouve pas la réalisation des jalons production/sauvegarde de #149 et n’autorise aucune opération de production. Le plan Studio V1.0 et le cadrage de sa checklist ont été consultés ; leurs contrats détaillés n’ont pas fait l’objet d’un audit complet.

## 2. Environnement, HEAD et intégrité

| Point | Constat vérifié |
|---|---|
| Runtime Cloud | running, connecté, aucune erreur déclarée ; observations actuelles. |
| Version publiée | Révision active observée 2. Publication du brouillon révision 3 décrit précédemment non établie. |
| Branche locale | work, contrairement à la cible main. |
| HEAD audité | aadd083ca282ed7db8af31f0fb3724c861b5107f |
| main distant | 38c71f144c6718404c27f9cf7292740c159ff7d1, confirmé par GitHub. |
| Diff HEAD → main | Ajout de Studio/Fadi_Studio_Checklist_Execution_V1_0.md et .docx ; aucune différence applicative observée entre ces arbres. |
| Intégrité | git status --porcelain=v1 --untracked-files=all vide avant/après ; index et fichiers suivis inchangés. |
| Dépendances | Node 24.19.0, npm 11.9.0, Python 3.12.14, Chromium 154.0.8037.57 et IfcOpenShell 0.9.0 accessibles. Node satisfait l’exigence ≥22.12. |
| Services | Connexions impossibles aux ports locaux 3001, 3002 et 5173. Santé applicative non confirmée depuis cette session. |
| Réseau Git | Proxy inaccessible depuis le shell ; lectures GitHub possibles par le connecteur. État plateforme de la politique réseau : unknown. |

Le runtime fonctionne ; cela ne suffit pas à confirmer que l’application publiée démarre correctement. L’impossibilité de joindre un port depuis cette session ne prouve pas un arrêt global du service.

Aucun checkout, installation, migration, démarrage de service ou changement de configuration effectué pendant l’audit. Aucune valeur sensible n’a été lue ou publiée.

## 3. Vérifications et comparaison aux résultats précédents

| Vérification | Résultat et portée |
|---|---|
| npm run typecheck | Relancé : réussi, exit 0. |
| node scripts/check-module-deps.mjs | Relancé : réussi. |
| node scripts/check-fadi-isolation.mjs | Relancé : réussi, 761 fichiers contrôlés. |
| node scripts/check-continuity.mjs | Relancé : réussi. Vérifie la structure, pas la véracité des statuts. |
| node --test scripts/check-continuity.test.mjs | Relancé : réussi, 1 test rapporté par Node. |
| Trois validations IFC | Relancées sur les fichiers existants petit, p118 et p118-reimporte : zéro erreur chacune, IFC4X3_ADD2. Aucune nouvelle génération revendiquée. |
| 1 757 tests réussis, 1 ignoré | Confirmés dans les journaux antérieurs ; suite complète non relancée. |
| 47 scénarios navigateur | Registre antérieur contrôlé : 47 résultats avec exit 0 ; scénarios non rejoués. |
| Build | Réussite antérieure documentée, exit 0 ; non relancé. |

Répartition des 1 757 tests : core-geometry 47 ; domain-model 95 ; atelier-model 468 ; planche-model 744 (+1 ignoré) ; geometry-exact 22 ; API 108 ; web 273. Le test ignoré est un banc optionnel L19, pas un échec masqué.

Les tests API comportent des TRUNCATE … CASCADE et les scénarios navigateur écrivent en base. Ils n’ont pas été relancés sous le mandat strictement en lecture seule.

Les preuves antérieures étaient disponibles dans /workspace/fadi-acceptance-results/ : revalidation/{typecheck,tests,build}.log et .exit, browser-results.json, journaux des scénarios, ifc/*-validation.log. Ces chemins sont des localisations dans l’environnement de l’audit, pas des artefacts téléversés par cette sauvegarde GitHub. Les journaux locaux ne sont ni signés ni assimilables à une nouvelle exécution.

La copie utilisée pour les recettes correspond aux 1 442 fichiers suivis examinés, sauf 44 captures générées sous docs/migration/captures/webapp/. Aucun autre fichier suivi différent.

### Preuves GitHub

[Run CI 39060316405](https://github.com/RachEma-ux/Fadi/actions/runs/39060316405), tête de PR a135a80dc607f6f9bbad7e20984c471003355ade : validate, e2e et image réussis, dont corpus IFC, recettes industrielles et sauvegarde/restauration.

Autres workflows réussis sur cette tête :
- [Isolation 39060316406](https://github.com/RachEma-ux/Fadi/actions/runs/39060316406).
- [Continuité 39060316417](https://github.com/RachEma-ux/Fadi/actions/runs/39060316417).
- [Inventaire 39060316435](https://github.com/RachEma-ux/Fadi/actions/runs/39060316435).

Ce SHA de PR ne doit pas être confondu avec HEAD local ou main actuel. Le verdict CI du main actuel reste non établi : l’outil de récupération des runs par commit filtre les événements pull_request, et une liste vide ne prouve pas une absence ou un échec de CI.

## 4. Architecture et fonctionnalités

| Domaine | Conclusion |
|---|---|
| Architecture | Monolithe modulaire : web React/Vite, API Express, PostgreSQL/Drizzle et cinq packages partagés. |
| Projets et sources | Module raccordé : parcelles, sources, archives et copies ; routes projets/parcelles/sources. |
| Parcours | 21 étapes ordonnées, six phases ; registre, formulaires, Harmonie, transmissions et 21 fiches de migration. |
| Programmation | Répartition, liaisons programme/modèle et hypothèses ; espaces programmés distincts des locaux dessinés. |
| Atelier architectural | Modèle typé, commandes réversibles, révisions, conflits, versions, exports et état d’affichage séparé. |
| Analyses métier | Quantités et contrôles sourcés ; aucune certification structurelle ou réglementaire déduite. |
| Documents | Catalogue par révision, vues/feuilles/tableaux et échanges ; import IFC en représentations. |
| Collaboration | Membres, rôles, commentaires, verrous, conflits et hors-ligne ; textes de statut parfois périmés. |
| Planche | Mode de l’Atelier ; noyau séparé de React, registre des outils, barres, raccourcis et recettes dédiées. |
| DrawAll | Aucun couplage nominal exécutable détecté dans le périmètre scanné ; autonomie exhaustive indirecte/documentaire non établie. |
| Continuité | Protocole structuré et contrôlé en CI ; plusieurs points de reprise factuellement périmés. |

Le code examiné comporte notamment modules/module-registry.ts, routes/ProjectShell.tsx, packages/*/manifest.json, atelier-model/src/commandes/base.ts, routes/atelier-commands.ts, lib/owned-project.ts et les recettes E2E correspondantes.

### Les 21 étapes présentes

| Phase | Étapes dans l’ordre |
|---|---|
| Comprendre le site | 01 Parcelle / Site existant ; 02 Réglementation & constructibilité ; 03 Marché & demande |
| Programmer | 04 Idée & stratégie ; 05 Besoins & concertation ; 06 PMO — Programme du maître d’ouvrage ; 07 Préprogramme fonctionnel ; 08 Exigences techniques & environnementales |
| Concevoir / Tester | 09 Compatibilité Parcelle ↔ Programme ; 10 Étude de capacité architecturale ; 11 Esquisse architecturale — Esquisser ; 12 Scénarios de développement |
| Prouver la faisabilité | 13 Faisabilité technique ; 14 Faisabilité économique & financière ; 15 Coût global & sensibilités ; 16 Vérifications / Due diligence |
| Arbitrer | 17 Évaluation multicritère ; 18 Bilan du potentiel de la parcelle ; 19 Décision — GO / GO sous conditions / À reprendre / NO GO |
| Engager | 20 Organisation des études — uniquement si GO ; 21 Transfert vers développement / conception |

Source du registre : apps/api/src/data/parcours-steps.json. Les 21 fiches docs/migration/etapes/01.md à 21.md existent. L’original HTML de référence n’étant pas disponible dans le dépôt, aucune attestation de parité historique absolue n’est émise.

### Fonctions industrielles natives

| Famille | Tests / recette Fadi |
|---|---|
| Mécanique et assemblages | atelier-mecanique.test.ts ; porte-p1-p2.mjs |
| Noyau exact et STEP | packages/geometry-exact ; p2-noyau-exact.mjs |
| Structure | atelier-structure.test.ts ; p2-structure.mjs |
| Bois et tôlerie | atelier-bois-tolerie.test.ts ; p2-bois-tolerie.mjs |
| Réseaux / MEP | atelier-reseaux.test.ts ; p2-reseaux.mjs |
| Coordination | Tests coordination ; p2-coordination.mjs |
| Documentation et automatisation | p2-documentation.mjs ; p2-automatisation.mjs |

La conservation de ces fonctions et des règles normatives de dessin est une décision acquise. Les identifiants historiques DA-… ne justifient aucune suppression.

L’IFC réimporté validé contient 1 539 IfcBuildingElementProxy et aucun IfcWall, contre 220 murs dans l’export initial. C’est cohérent avec l’import en représentations documenté : zéro erreur de schéma ne signifie pas conservation paramétrique intégrale ou certification BIM.

## 5. Sécurité et limites

Garde-fous observés : sessions serveur, Argon2, cookie HttpOnly/SameSite=Lax et Secure conditionné à NODE_ENV=production, validation Zod, limites de taille/débit, Helmet, droits relus serveur, référence P.118 protégée, conflits de révision et journal de commandes.

La CSP est désactivée dans apps/api/src/app.ts:27. Aucun scan dédié de vulnérabilités n’a été identifié dans les workflows examinés ; les installations CI utilisent npm ci --no-audit. Aucun audit en ligne de dépendances ou test d’intrusion n’a été effectué.

La présence éventuelle d’une CSP au reverse proxy de production et l’état actuel des protections administratives GitHub n’ont pas été directement contrôlés.

La qualification exhaustive des 494 fichiers de l’inventaire historique DrawAll reste à terminer. Les citations historiques, normes officielles, licences et capacités Fadi ne doivent pas être supprimées indistinctement.

## 6. Anomalies priorisées

P0 : critique démontré ; P1 : risque important à lever avant l’exécution concernée ; P2 : défaut borné ou contrôle incomplet à planifier ; P3 : amélioration de qualité. Les réserves ne sont pas des pannes applicatives avérées.

| ID / priorité | Constat et preuve | Critère d’acceptation proposé |
|---|---|---|
| E01 — P1, réserve | Branche work, SHA différent de main, publication du dernier brouillon non prouvée, sondes locales sans réponse. | Nouvelle session depuis une version publiée identifiée, SHA attendu et santé API/DB/HTML vérifiés. |
| S01 — P1, risque des tests | apps/api/vitest.setup.ts conserve DATABASE_URL héritée ; db/client.ts:5 l’utilise ; app.test.ts:29 et routes/atelier-commands.test.ts:20 font TRUNCATE CASCADE. Aucune garde de cible observée dans ce chemin. | Refuser une base non explicitement autorisée avant toute opération destructive ; tester ce refus sans toucher une base réelle. |
| G01 — P1, réserve gouvernance | Issue #146 ouverte : protection absente rapportée le 17 octobre ; état administratif actuel non vérifié. | Preuve actuelle des protections, checks requis et interdictions force-push/suppression. |
| C01 — P2 | packages/atelier-model/manifest.json:6 annonce v2 ; src/commandes/base.ts:9 définit v3 avec compatibilité v1/v2. | Manifeste aligné et contrôle de cohérence. |
| D01 — P2 | modules/README.md:18 décrit des placeholders ; code raccordé. module-registry.ts:56 annonce les droits indisponibles malgré routes membres et contrôles. | Statuts cohérents avec code, limites et preuves explicites. |
| D02 — P2 | docs/atelier/recette.md:108 dit OCCT absent/licence ouverte, contrairement à D-177/D-182 ; README Planche laisse des acceptations ouvertes malgré D-174. | Actualiser les points d’entrée sans effacer l’historique. |
| D03 — P2 | HANDOFF/STATUS purge décrivent #148 comme brouillon ; GitHub confirme sa fusion le 17 octobre à 20:20:11Z, merge 5cf61d1fed9ed523b331228af20bce93a4f2bf63. #147 reste ouverte. | Actualiser ensemble STATUS/HANDOFF ; distinguer fusion du lot et clôture de l’inventaire. |
| D04 — P2 | PR #154 : ordre de lecture inversé et cycle abrégé ; deux remarques de revue existantes. | HANDOFF → STATUS → TASKS → CONTEXT ; checkpoint STATUS/HANDOFF avant revue. |
| A01 — P2 | scripts/check-module-deps.mjs:78 contrôle web/API, pas les sept frontières web ; imports réciproques observés entre certains modules. | Carte des dépendances autorisées approuvée puis contrôle adapté, sans refonte présumée. |
| I01 — P2 | docs/atelier/README.md:1 conserve « DrawAll V4.1 » ; scanner limité aux sources sélectionnées ; inventaire incomplet. | Justifier les éléments maintenus et éliminer les dépendances opérationnelles, en conservant normes, provenance et compatibilité. |
| S02 — P2 | CSP désactivée dans apps/api/src/app.ts:27 ; aucun scan dédié de vulnérabilités identifié. | CSP compatible Workers/WASM testée ; scan des dépendances avec triage documenté. |
| P01 — P2, cadrage | Documents Studio : module autonome cible ; architecture actuelle : sept modules et Planche dans Atelier. | Formaliser la coexistence avant code, sans supprimer Atelier ni modifier les 21 étapes. |
| Q01 — P3 | Node local 24 contre CI 22 ; Chromium système différent du navigateur Playwright ; mesures réelles encore ouvertes. | Versions et bancs explicités, mesures traçables sur appareils/utilisateurs réels. |

Aucun P0 démontré ; cela ne garantit pas l’absence de défauts dans les zones non exécutées. Ces constats ne constituent pas une démonstration de faille exploitable ou de panne en production.

## 7. Organisation A0–A6 proposée

Toutes les tâches restent proposées. Aucun agent de correction n’est activé.

| Agent | Travail proposé | Priorité / dépendances | Acceptation |
|---|---|---|---|
| A0 Coordinateur | Registre des preuves, périmètres, arbitrages et checkpoints. | P1 ; validation de l’audit. | Résultats reliés à un SHA ; implémenté/vérifié/accepté distincts. |
| A1 Produit | Réconcilier capacités, 21 étapes, limites et cible Studio. | P2 ; cadrage A0. | Matrice exigence → implémentation → preuve ; conservations respectées. |
| A2 Architecture | Contrats, graphe des dépendances et autonomie DrawAll. | P2 ; rapprochement A1. | Interfaces explicites, compatibilité documentée, frontières approuvées. |
| A3 Développement | Garde de base des tests puis corrections bornées approuvées. | P1/P2 ; accord utilisateur, critères A2/A5. | Refus sûr des mauvaises cibles et non-régression sur base jetable. |
| A4 UX/UI | Statuts, FR/EN, clavier, icônes/barres et mobile. | P2 ; A1 et environnement A6 pour essais. | États exacts, parcours accessibles et preuves desktop/mobile. |
| A5 Qualité | Cas négatifs, traçabilité des recettes et non-régression. | P1/P2 ; base jetable vérifiée A6. | Résultats par SHA ; ignorés/non exécutés explicites ; aucun accès de test à la production. |
| A6 DevOps | Publication Cloud, démarrage, réseau et protections GitHub. | P1 ; accès nécessaires et périmètre validé. | Nouvelle session reproductible, santé vérifiée et protections attestées. |

Après accord : A1, A2, A4 et A6 peuvent avancer en parallèle sur des périmètres séparés. A5 prépare les cas puis exécute sur une base dédiée validée. A3 intervient après autorisation du lot concerné. A0 coordonne les fichiers communs et consolide les preuves.

Ordre proposé : environnement/gouvernance → sécurisation des tests → contrats/frontières/autonomie → cohérence documentaire et UX → non-régression/revue. Les investigations indépendantes peuvent avancer en parallèle.

Cycle applicable aux futurs lots autorisés : Issue → branche courte → PR → preuves → STATUS/HANDOFF → revue. Fusion, déploiement, migrations sensibles et sauvegardes restent des décisions distinctes.

## 8. Point de reprise

- Audit : présenté, en attente de validation utilisateur.
- Sauvegarde documentaire : seule action autorisée par la demande ultérieure « Sauvegarde cet audit dans github ».
- Corrections : non autorisées, non engagées.
- Prochaine action : obtenir validation de l’audit et sélection des premiers lots.
- Les HANDOFF/STATUS des chantiers existants restent canoniques ; cette archive ne les remplace pas et ne corrige pas leurs états.
- Aucun journal brut, secret, dump ou capture privée joint à cette archive.
