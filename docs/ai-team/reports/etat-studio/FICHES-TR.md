# Fiches de traçabilité TR-* (annexe C) — preuve et contre-preuve individuelles

> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` depuis le registre et les fiches M004 ; la CI le
> recalcule à chaque commit. Registre SHA-256 `ad5fb84ab8cada885e05eb81074182ed09f38eb7289889418a2ce14d85716bee` ; fiches `docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json`.

Règle C (Checklist, annexe C) appliquée à chaque fiche : libellé exact, source, responsable, contrat, composant, tests
positifs et négatifs, preuves, décisions, état et verdict ; **une preuve absente reste « à produire »**. Preuve = contrôle
positif exécuté (« scénario exécuté », G2-04) ; contre-preuve = contrôle exécuté qui vérifie le refus, le rejet ou
l’échec attendu (titre marqué « [−] » ou qui le dit : refus, rejet, échec, interdit, jamais, aucun, conflit, code 4xx…).
Cette fiche ne déclare pas, à elle seule, l’exigence conforme ni la fonction livrée.

**Synthèse** : 141 fiches ; 129 avec preuve exécutée, 132 avec contre-preuve exécutée ;
12 preuves et 9 contre-preuves « à produire ».

### TR-AC-001

- **Libellé exact (REF-02, § w:p 419)** : AC-001. Le objectId du mur reste stable ; l’ouverture reste reliée au bon hôte ; les deux planches reflètent la même définition ; les métrés sont mis à jour ou marqués périmés ; undo/redo et réouverture retrouvent les valeurs ; un dossier publié conserve la version examinée.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 003,009,010,011,030
- **Test positif prescrit** : Mur6×3×0,2 avec ouverture1×2,1 : objectId/hôte stables, net3,180 ; largeur1,2 : net3,096 ; undo/redo/réouverture et publication vérifiés.
- **Test négatif prescrit** : Modifier depuis autre planche crée copie du mur ou perd hôte/cote/historique : échec critère, aucun succès partiel global.
- **Preuve (contrôles positifs exécutés)** : 15
  - TR-AC-001 — cote associative sur un mur (objet architectural) > [+] la cote se lie aux sommets du contour du mur ; le document relu la garde liée — `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-001 — cote associative sur un mur (objet architectural) > [+] le mur modifié (épaisseur 0,25 m depuis la vue 3D, puis déplacé sur la planche) : même cote, même identité du mur, la cote suit — `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - AC-001 : cote posée sur le mur à la souris — accrochée à ses sommets, valeur mesurée 6,000 m, résolue — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - AC-001 : enregistrée, la cote est liée au mur (objectId du mur aux deux extrémités), l'ouverture est hébergée par ce mur — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TEST-003 / A.4-03 : la Planche 3D porte les mêmes identifiants que la Planche 2D (mur, ouverture) — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TEST-010 : ouverture élargie à 1,20 m depuis la Planche 3D — déduction 0,504 m³, net 3,096 m³ — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - … et 9 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 9
  - TR-AC-001 — cote associative sur un mur (objet architectural) > [−] perte de cote : mur supprimé (cascade) — la cote n'est pas supprimée, elle passe « à résoudre », valeur non évaluée — `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-001 — cote associative sur un mur (objet architectural) > [−] contour changé (axe repris à trois points) : l'indice ne désigne plus le même sommet — lien rompu, « à résoudre », jamais rattachée… — `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-001 — cote associative sur un mur (objet architectural) > [−] liens refusés : sommet inexistant, ancre non indexée, extrémité différente du sommet, mur absent — rien n'est créé — `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-001 — cote associative sur un mur (objet architectural) > feuille composée : la vue documentaire garde la cote liée au mur qu'elle reprend (jamais détachée en silence) — `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-001 — cote associative sur un mur (objet architectural) > copie indépendante du mur : la cote reste sur la source ; modifier la copie ne la touche pas — `packages/atelier-model/src/studio/commandes/cotes-murs.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - A.4-01 / TR-EX-002 (dessin) : mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m dessinés sur la Planche 2D — brut 3,600, déduction 0,420, net 3,180 m³ — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - … et 3 autre(s) au registre
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-002

- **Libellé exact (REF-02, § w:p 526)** : AC-002. Une barre contenant environ vingt outils de dessin usuels peut être ouverte sans initialiser tous les modules spécialisés. Le test compare les requêtes réseau, la taille transférée, les chunks exécutés et l’empreinte mémoire à une référence, en distinguant cache froid et chaud. Aucun taux de réduction n’est présumé avant mesure.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 016
- **Test positif prescrit** : Profil environ20 outils : comparer requêtes/octets/chunks exécutés/mémoire à froid et chaud, sans tous noyaux initialisés.
- **Test négatif prescrit** : Barre réduite mais précache/init de tous moteurs rares : critère non acquis, aucun taux de réduction supposé.
- **Preuve (contrôles positifs exécutés)** : 6
  - AC-002 / TEST-016 — verdict contre une référence versionnée, cache froid et chaud — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - référence valide : schéma, révision, profil d'environ vingt outils, valeurs mesurées par cache, invariants — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - mesure dans les tolérances : verdict « conforme » par cache et par grandeur (requêtes, octets, chunks exécutés, tas) — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - régression : octets du cache chaud au-delà de la borne, chunk spécialisé exécuté, moteur rare initialisé, binaire exact demandé — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-002 : cache chaud réellement chaud — service worker actif et morceaux servis par lui à chaque répétition — `apps/web/e2e/studio-g4.mjs`, commit 2e1564d, 2026-10-26 06:23
  - TR-AC-002 : référence versionnée valide (schéma studio-reference-mesures/1, révision, appareil, profil de vingt outils, valeurs mesurées froid et chaud, tolérances, invariants) — `apps/web/e2e/studio-g4.mjs`, commit 2e1564d, 2026-10-26 06:23
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - aucun taux de réduction présumé : une baisse est constatée « amélioration », la référence est à rétablir, le verdict reste conforme — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - autre classe d'appareil, autre fenêtre ou grandeur non mesurée : « non évalué », jamais comparé — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-002 / TEST-016 : vingt outils ouverts — requêtes, octets transférés, octets du serveur, morceaux exécutés et tas comparés à la référence, cache froid et chaud : verdict « conforme » (aucun taux… — `apps/web/e2e/studio-g4.mjs`, commit 2e1564d, 2026-10-26 06:23
  - TR-AC-002 : modules spécialisés non initialisés — aucune famille three / studio-3d / atelier / maplibre / manifold exécutée, seuls les moteurs de la planche initialisés, aucun binaire du noyau exact … — `apps/web/e2e/studio-g4.mjs`, commit 2e1564d, 2026-10-26 06:23
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-003

- **Libellé exact (REF-02, § w:p 560)** : AC-003. Deux utilisateurs modifiant un mur de manière incompatible obtiennent un conflit traçable, une révision de référence préservée et aucune application implicite du dernier enregistrement. La restauration fonctionne après coupure simulée sans duplication de la commande.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 012,013
- **Test positif prescrit** : Deux utilisateurs modifient mur avec résolution de conflit puis coupure/rejeu sans duplication.
- **Test négatif prescrit** : Seconde sauvegarde écrase première implicitement ou rejoue commande deux fois : échec éliminatoire.
- **Preuve (contrôles positifs exécutés)** : 1
  - retour en ligne : enregistré une seule fois, avec le même requestId — `apps/web/e2e/studio-hors-ligne.mjs`, commit f59d66d, 2026-10-19 06:50
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - AC-003 [+] le second reçoit un conflit traçable (tête, base, élément commun), la révision de référence est préservée ; après coupure, le rejeu du même requestId ne duplique rien ; le report explicite… — `apps/api/src/routes/studio-invariants.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:58
  - AC-003 [−] la seconde sauvegarde n'écrase jamais la première en silence, et un rejeu n'applique pas deux fois : même base → 409, même requestId au contenu différent → 409 request_conflict — `apps/api/src/routes/studio-invariants.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:58
  - conflit : la tête de la seconde session n'est pas écrasée — `apps/web/e2e/studio-hors-ligne.mjs`, commit f59d66d, 2026-10-19 06:50
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-004

- **Libellé exact (REF-02, § w:p 613)** : AC-004. Sur un corpus comportant objets superposés, densités variables, intersections et références liées, l’index accéléré doit fournir les mêmes cibles et points d’accrochage (dans la tolérance déclarée) que l’algorithme de référence, avec traces des cas ambigus.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 022
- **Test positif prescrit** : Corpus superposé/densités/intersections/références : mêmes cibles/points que référence dans tolérance avec traces ambiguïtés.
- **Test négatif prescrit** : Index choisit cible différente après insertion/suppression : critère échoue malgré gain p95.
- **Preuve (contrôles positifs exécutés)** : 6
  - AC-004 [+] corpus superposé / densités variables / intersections / références liées : mêmes cibles et mêmes points que la référence, mêmes traces d'ambiguïté (grille, puis index incrémental après ins… — `apps/web/src/modules/studio/planche2d/ambiguites.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - AC-004 [+] cas ambigu tracé puis résolu explicitement : la candidate suivante devient le point posé ; la désignation passe à l'objet superposé suivant — `apps/web/src/modules/studio/planche2d/ambiguites.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-004 : extrémités confondues — cas ambigu tracé (« 1/n »), la règle retient l1 (ordre du document) — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-AC-004 : « Cible d'accrochage suivante » (Ctrl+Maj+F1) — la candidate suivante (l2) devient le point posé — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-AC-004 : la cote enregistrée est liée à l'objet choisi explicitement (début : l2) et à l1 par la règle (fin) — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-AC-004 : désignation ambiguë au clic (deux lignes confondues) — l'objet suivant sous le clic est désigné explicitement — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - AC-004 [−] un index qui choisit une autre cible après insertion / suppression fait échouer le critère, malgré un gain de p95 — `apps/web/src/modules/studio/planche2d/ambiguites.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:14
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-005

- **Libellé exact (REF-02, § w:p 633)** : AC-005. Les opérations sélection, orbite, zoom, poussé/tiré et changement de matériau passent les tests de fidélité géométrique avant et après toute optimisation. Les profils GPU sont évalués séparément de mesures faites sous SwiftShader.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A1 · **Lot** : X
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `docs/atelier/p0-mesures.md`, `docs/atelier/p2-mesures.md`, `apps/web/e2e`, `.github/workflows`
- **Décisions** : DEC-13 · **Scénarios** : 023,025,026
- **Test positif prescrit** : Comparer sélection/orbite/zoom/pousser-tirer/matériau avant/après optimisation et séparer GPU réel de SwiftShader.
- **Test négatif prescrit** : GPU CPU confondus ou géométrie modifiée pour gagner FPS : critère non vérifié/non conforme selon résultat.
- **Preuve (contrôles positifs exécutés)** : 8
  - AC-005 / MES-03 — avant / après optimisation de la vue 3D — `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - sélection, orbite, zoom, pousser / tirer et matériau : mêmes objets désignés, mêmes distances, mêmes aspects, mêmes triangles ; verdict « fidèle », GPU non évalué — `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - l'optimisation est réellement active : rien de reconstruit pour orbite et zoom, seul l'objet touché pour sélection, pousser / tirer et matériau ; la référence reconstruit tout — `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - contrôle par mutation : objet périmé après pousser / tirer, ou couleur d'aspect faussée après le matériau → « infidèle » — `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - AC-005 / MES-03 — verdict avant / après optimisation, postes mesurés séparément — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - cinq opérations fidèles et tous les postes mesurés : « fidèle », GPU « non évalué » — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - … et 2 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - cas négatif : temps GPU rapporté sous SwiftShader (GPU et CPU confondus) : rapport refusé — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-006

- **Libellé exact (REF-02, § w:p 670)** : AC-006. Échec forcé d’OCCT/WASM pendant une opération : aucune mutation partielle, retour d’erreur intelligible, tâches en attente résolues explicitement, possibilité de relance sans doublons et sans perte de la révision courante.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : D
- **Contrat** : IF-003,IF-007 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts`
- **Décisions** : DEC-11,DEC-13 · **Scénarios** : 015
- **Test positif prescrit** : Forcer échec OCCT pendant opération puis relancer : attente résolue, erreur lisible et révision intacte sans doublon.
- **Test négatif prescrit** : Crash laisse mutation partielle ou pending infini : échec critère.
- **Preuve (contrôles positifs exécutés)** : 1
  - TEST-015 : relance après retour au binaire distribué — prêt, une instance — `apps/web/e2e/studio-exact.mjs`, commit d87a82e, 2026-10-25 21:21
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - plantage pendant le calcul avec une seconde tâche en attente : les deux attentes résolues, erreur intelligible, aucune mutation ; relance : un seul solide exact, révision courante conservée — `apps/web/src/modules/studio/exact/ac006-echec-occt.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TEST-015 : pas de corruption — document identique (empreinte de contenu), aucune commande en attente — `apps/web/e2e/studio-exact.mjs`, commit d87a82e, 2026-10-25 21:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-007

- **Libellé exact (REF-02, § w:p 722)** : AC-007. Générer une illustration ne change ni les dimensions, ni les propriétés BIM, ni la révision du modèle source. La publication d’une illustration indique son statut de vérification et sa source.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/F option
- **Contrat** : IF-003,IF-009 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-15,DEC-17 · **Scénarios** : 032
- **Test positif prescrit** : Illustration optionnelle : hash/dimensions/propriétés/révision modèle restent identiques ; document indique source et statut vérification.
- **Test négatif prescrit** : Illustration modifie BIM ou paraît métrique sans contrôle : refus de conformité/publication.
- **Preuve (contrôles positifs exécutés)** : 1
  - illustration produite : « non vérifiée », modèle source inchangé — `apps/web/e2e/studio-lot-f.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-AC-007 [+] / [−] l'illustration atteste le modèle inchangé et se déclare « non vérifiée » ; un modèle modifié ou une autre révision refusent l'illustration — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
  - TEST-032 [+] un éditeur produit une illustration locale depuis le rendu de la vue : 201, aucune révision, tête inchangée, provenance complète dans la réponse et dans le PNG archivé — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-008

- **Libellé exact (REF-02, § w:p 732)** : AC-008. Dans le test de référence du mur, les objets et révisions permettent de retrouver exactement les déductions 0,420 m³ puis 0,504 m³ et les volumes nets 3,180 m³ puis 3,096 m³. Les résultats historiques conservent leur source initiale.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 009,010
- **Test positif prescrit** : Retrouver sources/révisions/déductions0,420 puis0,504 et nets3,180 puis3,096 avec historique initial intact.
- **Test négatif prescrit** : Arrondi/override efface déduction ou historique : échec, pas ajustement silencieux.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - AC-008 [−] un ajustement manuel arrondi du net ne touche ni la déduction ni l'historique : 0,420 / 3,180 sur R1, 0,504 / 3,096 sur R2, ajustement à revoir, journal intact — `packages/atelier-model/src/studio/studio-invariants.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:49
  - brut 3,600 m³, déduction 0,420 m³, net 3,180 m³ ; élargie à 1,20 m : déduction 0,504 m³, net 3,096 m³, mêmes identités — `packages/atelier-model/src/studio/architecture/architecture.test.ts`, commit f59d66d, 2026-10-19 06:45
  - TEST-010 : révision historique R1 ouverte en lecture seule — volume net toujours 3,180 m³ (déduction 0,420 m³) — `apps/web/e2e/studio-navigation.mjs`, commit 44c6ef4, 2026-10-25 16:14
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-009

- **Libellé exact (REF-02, § w:p 768)** : AC-009. Modifier un document après approbation puis tenter de publier sous l’ancienne décision provoque un blocage ou une demande de nouvel examen, avec comparaison explicite des empreintes concernées.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 030
- **Test positif prescrit** : Publier dossier inchangé approuvé avec comparaison des empreintes.
- **Test négatif prescrit** : Changer document après approbation : blocage/nouvel examen explicite, pas publication sous ancienne décision.
- **Preuve (contrôles positifs exécutés)** : 3
  - paquet diffusé = documents du manifeste approuvé — `apps/web/e2e/studio-publication.mjs`, commit 98748a0, 2026-10-19 08:13
  - paquet recalculé de façon déterministe : empreintes identiques — `apps/web/e2e/studio-publication.mjs`, commit f59d66d, 2026-10-19 06:50
  - INV-001 BLOC-05 [+] la diffusion est admise sous l'approbation exacte de son contenu ; le paquet porte ce manifeste — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - diffusion sous manifeste changé refusée (409 manifest_mismatch, deux révisions et deux empreintes) — `apps/web/e2e/studio-publication.mjs`, commit 98748a0, 2026-10-19 08:13
  - INV-001 BLOC-05 [−] la tête change après l'approbation : diffuser → 409 manifest_mismatch, aucun paquet — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - le refus d'une diffusion sous un manifeste différent cite les deux empreintes renvoyées par le serveur — `apps/web/src/modules/studio/publication/publication-ui.test.ts`, commit 98748a0, 2026-10-19 08:07
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-010

- **Libellé exact (REF-02, § w:p 817)** : AC-010. Un concepteur sans droit d’approbation peut afficher l’outil par recherche mais reçoit un refus d’exécution. La modification de son profil personnel n’influe pas sur le contrôle serveur.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/X
- **Contrat** : IF-009,IF-010 · **Composants candidats** : `apps/web/src/modules/collaboration`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-16 · **Scénarios** : 018
- **Test positif prescrit** : Concepteur découvre Approuver par recherche mais serveur refuse sans permission métier.
- **Test négatif prescrit** : Importer profil ou acquérir rôle admin technique : toujours refus si droit métier absent.
- **Preuve (contrôles positifs exécutés)** : 2
  - TR-AC-010 : le concepteur trouve « Approuver » par la recherche de la palette — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-AC-010 : le propriétaire, qui détient le droit, approuve par la même commande (Ctrl+Maj+F11) — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - AC-010 [+] le catalogue du serveur expose « Approuver » à tous (concepteur : non autorisé ; propriétaire : autorisé) ; le concepteur qui l'exécute reçoit 403, rien n'est écrit — `apps/api/src/routes/studio-g2.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - AC-010 [−] importer un profil qui place « Approuver », ou l'écrire dans ses préférences, ne confère rien : refus 403 (permission non conférée) et l'approbation reste refusée — `apps/api/src/routes/studio-g2.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - AC-010 [+] un concepteur découvre « Approuver » par recherche (nom, synonyme, raccourci) : commande de la barre Présentation, icône propre, Ctrl+Maj+F11, aucun droit présumé par l'interface — `apps/web/src/modules/studio/publication/approbation-commande.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - AC-010 [−] la boîte propose les publications en revue sans juger du droit ; un refus 403 du serveur est dit tel quel, profil et rôle technique compris — `apps/web/src/modules/studio/publication/approbation-commande.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-AC-010 : exécutée, l'approbation est refusée par le serveur (droit métier absent), rien n'est écrit — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-AC-011

- **Libellé exact (REF-02, § w:p 1122)** : AC-011. Un outil est déclaré prêt pour implémentation seulement lorsque ses entrées, sorties, préconditions, permissions, effets, risques, mesures et jeux d’essai sont explicités. Un outil est déclaré conforme seulement après preuve d’exécution sur version et profil de charge désignés.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 + A0 · **Lot** : X/pilotage
- **Contrat** : IF-001 à IF-011 selon fonction · **Composants candidats** : `docs/ai-team/missions.json`, `docs/workstreams/studio`, `docs/continuity/README.md`
- **Décisions** : DEC-01 à DEC-18 selon fonction · **Scénarios** : TEST spécifiques outil §19.3
- **Test positif prescrit** : Avant développement outil : vérifier entrées/sorties/préconditions/droits/effets/risques/mesures/jeux ; conformité après preuve sur version/profil identifié.
- **Test négatif prescrit** : Fiche sans tests négatifs ou résultat sans build/profil : ni prêt à développer ni conforme par seule présence.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : En cours · **Tests** : Non exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Préparé (fiches-outils.ts) : forme du build désigné (FORME_BUILD_DESIGNE : commit 40 hex + sha256 de l'artefact), profils de charge que le dépôt sait exécuter (PROFILS_CHARGE_CANDIDATS : profil de vingt outils sur Chromium bureau / téléphone de la CI, corpus S1 à S7 ; réseau « non évalué »), validerDesignation (build, profils candidats, décision D-xxx / ADR / #Issue datée) et preuveRecevable. Rie…

### TR-EX-001

- **Libellé exact (REF-02, § w:p 81)** : EX-001 — Autonomie native. Le Studio permet de créer, ouvrir, modifier, contrôler et documenter une étude rattachée à un projet Fadi sans suivre préalablement les 21 étapes du Parcours. Il réutilise les services généraux autorisés de Fadi plutôt que de créer une deuxième gestion d’utilisateurs, une deuxième base métier ou un deuxième annuaire de documents.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 001,002,003,NAV-002
- **Test positif prescrit** : Ouvrir /studio avec projet autorisé et créer une étude sans étape Parcours validée ; retrouver mêmes comptes et catalogue documentaire.
- **Test négatif prescrit** : Projet interdit ou contexte Parcours absent : refus du premier, aucune obligation de valider une étape pour le second.
- **Preuve (contrôles positifs exécutés)** : 4
  - EX-001 : le compte Fadi de la session (/auth/me) est l'auteur enregistré des révisions Studio — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - étude créée avec sa variante initiale et une révision vide — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - EX-001 [+] chaque colonne Studio qui désigne une personne est une clé étrangère vers users.id — `apps/api/src/testing/studio-comptes.preuves-a.test.ts`, commit bf775d9, 2026-10-25 21:58
  - E.3-06 : dossier rattaché au catalogue des Documents (empreinte courante, sources, liens PDF et JSON) — `apps/web/e2e/studio-dossier.mjs`, commit 4643cfa, 2026-10-19 12:44
- **Contre-preuve (contrôles négatifs exécutés)** : 6
  - EX-001 : la même session lit le projet Fadi et son catalogue des Documents (aucune connexion propre au Studio) — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - EX-001 : un membre invité dans le projet Fadi (rôle lecteur) lit l'étude sans écrire ; un compte hors projet est refusé — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - EX-001 [−] aucune table Studio de comptes, de sessions, de membres ou de rôles ; aucune colonne d'identifiant de connexion — `apps/api/src/testing/studio-comptes.preuves-a.test.ts`, commit bf775d9, 2026-10-25 21:58
  - NAV-002 : aucune lecture du Parcours, du programme ni de l'Atelier — `apps/web/e2e/studio-navigation.mjs`, commit 779e082, 2026-10-18 23:02
  - étude : aucune lecture du Parcours ni de l'Atelier — `apps/web/e2e/studio-navigation.mjs`, commit 779e082, 2026-10-18 23:02
  - NAV-004 : projet d'autrui refusé sans divulguer son code ni son nom — `apps/web/e2e/studio-navigation.mjs`, commit 779e082, 2026-10-18 23:02
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-002

- **Libellé exact (REF-02, § w:p 82)** : EX-002 — Périmètre. Les objets traités concernent la conception architecturale : dessin, modèles, BIM, rendu, métrés, coordination, observations, révisions et livrables. La comptabilité, la gestion RH, le commerce, la direction quotidienne des travaux, les réserves de chantier et l’exploitation restent hors responsabilité du Studio.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 001,002,003
- **Test positif prescrit** : Suivre une petite étude depuis dessin jusqu'au dossier de conception, avec quatre domaines.
- **Test négatif prescrit** : Demande de comptabilité ou gestion RH : périmètre explicitement exclu, aucun module métier concurrent créé.
- **Preuve (contrôles positifs exécutés)** : 6
  - TR-EX-002 (BIM) : propriété déclarée sur le mur, « non évaluée » sans valeur saisie — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-EX-002 (visualisation) : scène enregistrée ; la révision porte mur, ouverture, cote liée, propriété et scène — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-EX-002 (métré) : volume net du mur 3,096 m³ dans le métré de Documentation — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-EX-002 (documentation) : dossier de conception créé — la feuille F-01 et le métré de la révision R3 — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-EX-002 [+] : dossier de conception publié par l'interface (soumis, approuvé, diffusé) — PDF et JSON relus à leurs empreintes, révision R3 — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-EX-002 [+] : un parcours unique à travers les quatre domaines (Dessin et modélisation, BIM et coordination, Visualisation, Documentation), une même étude — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - A.4-01 / TR-EX-002 (dessin) : mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m dessinés sur la Planche 2D — brut 3,600, déduction 0,420, net 3,180 m³ — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-EX-002 — périmètre explicitement exclu > EX-002 [−] : demande de comptabilité ou de gestion RH refusée par un motif nommé « hors-perimetre » — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-003

- **Libellé exact (REF-02, § w:p 83)** : EX-003 — Contexte constant. Toute surface de travail ou action persistante porte les identifiants projectId, studyId, variantId et la version de base. Le projet et l’étude peuvent exister avant la première variante, mais aucune géométrie éditée ne doit être dépourvue de variante propriétaire.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 035,NAV-003
- **Test positif prescrit** : Créer étude puis variante V1 et enregistrer géométrie avec projectId/studyId/variantId/baseRevisionId cohérents.
- **Test négatif prescrit** : Soumettre objet sans variante ou variante d'une autre étude : rejet sans objet orphelin.
- **Preuve (contrôles positifs exécutés)** : 3
  - témoin : le propriétaire et l'éditeur écrivent ; l'auteur enregistré est l'acteur authentifié — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit bf775d9, 2026-10-25 21:58
  - variante créée (201) : nom épuré, document vide, sans parent, tête = révision initiale — `apps/web/e2e/studio-persistance.mjs`, commit 779e082, 2026-10-18 23:01
  - variante B : commande acceptée, variante initiale inchangée — `apps/web/e2e/studio-persistance.mjs`, commit 779e082, 2026-10-18 23:01
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-003 [−] contexte : un objet soumis sans variante (variantId absent ou vide) est rejeté (404), sans objet orphelin — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit bf775d9, 2026-10-25 21:58
  - contexte : une variante d'une autre étude, une étude d'un autre projet → 404 — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit bf775d9, 2026-10-25 21:58
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-004

- **Libellé exact (REF-02, § w:p 107)** : EX-004 — Planche 2D. Éditeur autonome de géométries planes, côtes, contraintes, calques et annotations. Aucun modèle 3D n’est requis pour produire et publier un dessin indépendant.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 001
- **Test positif prescrit** : Dessiner segment/arc, calque, cote et texte dans un document 2D puis publier sans modèle 3D.
- **Test négatif prescrit** : Fermer/réouvrir sans modèle 3D ; aucun volume de substitution ne doit être requis ou créé.
- **Preuve (contrôles positifs exécutés)** : 3
  - EX-004 : segment, arc, calque, cote et texte enregistrés dans un document 2D, sans extrusion, solide ni objet architectural — `apps/web/e2e/studio-dossier.mjs`, commit bf775d9, 2026-10-25 22:08
  - EX-004 : le dessin publié (SVG) porte le calque, le segment, l'arc, la cote et le texte — `apps/web/e2e/studio-dossier.mjs`, commit bf775d9, 2026-10-25 22:08
  - EX-004 : le dessin publié (DXF) porte le calque, le segment, l'arc, la cote éclatée et le texte — `apps/web/e2e/studio-dossier.mjs`, commit bf775d9, 2026-10-25 22:08
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-004 : publication « dessin-2d » de cette révision préparée, revue, approuvée et diffusée — SVG, DXF, PDF, aucun IFC — `apps/web/e2e/studio-dossier.mjs`, commit bf775d9, 2026-10-25 22:08
  - EX-004 : rouverte après publication, la variante n'a ni modèle 3D ni volume de substitution, et la publication n'a créé aucune révision — `apps/web/e2e/studio-dossier.mjs`, commit bf775d9, 2026-10-25 22:08
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-005

- **Libellé exact (REF-02, § w:p 108)** : EX-005 — Planche 3D. Éditeur autonome de géométries spatiales, faces, solides, groupes et objets architecturaux. Sa saisie n’exige pas d’esquisse 2D préalable ; ce n’est pas une simple visionneuse.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 002
- **Test positif prescrit** : Créer volume directement dans l'espace, éditer face et groupe, sauver et produire une coupe.
- **Test négatif prescrit** : Nouvelle étude sans dessin 2D : l'édition 3D reste possible ; une vue sans édition ne suffit pas.
- **Preuve (contrôles positifs exécutés)** : 2
  - pivoter le groupe autour d'un axe vertical, le mettre à l'échelle (volumes compris), puis le supprimer : chaque fois un lot, le reste intact — `apps/web/src/modules/studio/vue3d/groupe-3d.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-005 : déplacement du groupe = un seul lot (2 commandes) ; un seul Ctrl+Z le retire en entier, les deux solides reviennent — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - étude neuve sans dessin 2D : choisir A et C, les déplacer ensemble en un seul lot ; B ne bouge pas ; une annulation rend l'état initial — `apps/web/src/modules/studio/vue3d/groupe-3d.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - garde-fous : moins de deux membres, déplacement nul, facteur 1 → refus lisible, aucune commande ; un membre supprimé sort du groupe — `apps/web/src/modules/studio/vue3d/groupe-3d.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-005 : étude neuve — aucun objet 2D, deux solides libres — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
  - TR-EX-005 : relu par le serveur — A et B déplacés de (1, 2, 0), toujours aucun objet 2D — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-006

- **Libellé exact (REF-02, § w:p 109)** : EX-006 — Conception associée. Les deux planches peuvent agir sur une même définition architecturale au moyen de commandes validées. Les trois relations — associé, référence liée, copie indépendante — sont visibles et explicites.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 003,004,006
- **Test positif prescrit** : Modifier le même mur associé en 2D puis 3D et afficher clairement associé/référence/copie.
- **Test négatif prescrit** : Modifier copie indépendante : source inchangée ; une relation non définie ne propage pas.
- **Preuve (contrôles positifs exécutés)** : 1
  - TEST-006 : « Détacher » en fait une copie indépendante, volume de nouveau évalué (45 m³) — `apps/web/e2e/studio-faces.mjs`, commit 4377815, 2026-10-25 19:58
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - TEST-006 : relations affichées dans la désignation — « référence liée · à jour » (36 m³), « copie indépendante · aucune propagation » — `apps/web/e2e/studio-faces.mjs`, commit 4377815, 2026-10-25 19:58
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-007

- **Libellé exact (REF-02, § w:p 110)** : EX-007 — Workflow transversal. Le cycle Cadrer → Explorer → Concevoir → Contrôler → Coordonner et corriger → Approuver → Publier traverse les domaines sans devenir un cinquième module et sans remplacer le Parcours de Fadi.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 029,030,NAV-002
- **Test positif prescrit** : Parcourir Cadrer→Explorer→Concevoir→Contrôler→Coordonner→Approuver→Publier sur une révision.
- **Test négatif prescrit** : Créer une publication ne valide aucune des 21 étapes et ne crée pas de cinquième domaine.
- **Preuve (contrôles positifs exécutés)** : 2
  - workflow : menu des sept phases dans l'ordre de REF-01 §06 — `apps/web/e2e/studio-espace.mjs`, commit 2d4a7c6, 2026-10-19 20:47
  - identifiants d'adresse : seuls les quatre domaines et les deux planches sont reconnus — `apps/web/src/modules/studio/domaines/domaines.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-007 : les sept phases Cadrer → Explorer → Concevoir → Contrôler → Coordonner → Approuver → Publier déclarées dans l'ordre, chacune relue, sur la même révision (aucune révision créée) — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - EX-007 : publier (préparer, soumettre, approuver, diffuser) ne valide aucune des 21 étapes du Parcours — états des étapes identiques avant et après — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - EX-007 : la phase déclarée reste une déclaration — l'étude ne porte que sa phase, la publication ne la change pas — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-008

- **Libellé exact (REF-02, § w:p 196)** : EX-008 — Sens de dépendance. Les interfaces invoquent les capacités, les capacités produisent des intentions, les commandes autorisées modifient le modèle canonique, puis les projections dérivées se recalculent. Une modification de scène graphique ne crée pas un changement métier sans commande.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/C/X
- **Contrat** : IF-002,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-02,DEC-10,DEC-18 · **Scénarios** : 003,014
- **Test positif prescrit** : Geste confirmé produit intention, commande, mutation canonique puis scène invalidée dans cet ordre.
- **Test négatif prescrit** : Modifier directement une coordonnée GPU : aucune mutation métier/sauvegarde issue de cette seule scène.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-008 [+] : geste confirmé — intention, commande, mutation canonique puis scène invalidée, dans cet ordre — `apps/web/src/modules/studio/taches/trace-geste.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-008 : un seul geste horodaté — intention → commande → mutation canonique → scène invalidée, dans cet ordre — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-008 [−] : scène sans mutation canonique préalable, ou d'une autre révision — l'ordre n'est pas établi — `apps/web/src/modules/studio/taches/trace-geste.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-009

- **Libellé exact (REF-02, § w:p 197)** : EX-009 — Propriété des données. Pour chaque classe d’information, un service logique propriétaire est désigné ; les interfaces des autres domaines consomment des références et appels de commande. Un modèle ne doit pas exister en deux exemplaires autoritaires simplement parce que deux planches l’affichent.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/C/X
- **Contrat** : IF-002,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-02,DEC-10,DEC-18 · **Scénarios** : 003
- **Test positif prescrit** : Mur commun aux deux planches avec un seul propriétaire d'écriture défini ; changements observés des deux côtés.
- **Test négatif prescrit** : Deux copies autoritaires divergentes du même mur : détecter le défaut, interdire l'engagement ambigu.
- **Preuve (contrôles positifs exécutés)** : 3
  - INV-002 BLOC-01 [+] le plan 2D et le maillage 3D se dérivent du seul objet du document : une commande les change ensemble — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - architecture : la vue 3D porte les mêmes identifiants que la planche (mur, ouverture) — `apps/web/e2e/studio-navigation.mjs`, commit f59d66d, 2026-10-19 06:50
  - REC-A-03 : élargie à 1,20 m depuis la vue 3D — déduction 0,504 m³, net 3,096 m³ — `apps/web/e2e/studio-navigation.mjs`, commit f59d66d, 2026-10-19 06:50
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - INV-002 BLOC-01 [−] une seconde copie autoritaire est refusée : identifiant réemployé, projection stockée dans le document — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-010

- **Libellé exact (REF-02, § w:p 202)** : EX-010 — Événements d’effets. Chaque commande acceptée doit identifier autant que possible : objets créés, modifiés ou supprimés ; références/contraintes modifiées ; domaines dérivés invalidés ; révision de sortie et origine de la modification.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/C/X
- **Contrat** : IF-002,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-02,DEC-10,DEC-18 · **Scénarios** : 024
- **Test positif prescrit** : Créer/modifier/supprimer objets et examiner effets : IDs, relations, dérivés, révision et origine cohérents.
- **Test négatif prescrit** : Suppression d'hôte avec dépendants non décrits : pas d'acceptation silencieuse laissant des documents frais.
- **Preuve (contrôles positifs exécutés)** : 4
  - EX-010 [+] : créer, modifier, supprimer — identifiants, relations, domaines dérivés, révision et origine cohérents — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-010 [+] : références et contraintes modifiées — cote rendue « à résoudre » par la suppression de son objet lié — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
  - IF-011 [+] : après engagement durable, l'événement garde eventId, transaction, auteur, étude, variante, base, issue, effets, horodatage serveur — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - EX-010 : la réponse d'une commande acceptée porte ses effets (créés, références, domaines invalidés, révision, origine) — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-010 [−] : suppression d'hôte avec dépendants — chaque ouverture et chaque relation rompue décrites, publications invalidées — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-010 [−] : suppression d'un objet portant une cote liée — relation retirée et cote « à résoudre » décrites dans l'effet — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - EX-010 [−] : suppression de l'objet lié — relation retirée et cote « à résoudre » décrites, publications invalidées — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-011

- **Libellé exact (REF-02, § w:p 203)** : EX-011 — Actualisation. Les projections consomment ces effets pour régénérer la portée minimale correcte, avec possibilité de repli vers une reconstruction plus large si l’invalidation exacte n’est pas sûre. Une actualisation partielle erronée n’est jamais acceptée au nom des performances.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/C/X
- **Contrat** : IF-002,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-02,DEC-10,DEC-18 · **Scénarios** : 024
- **Test positif prescrit** : Déplacer porte et comparer scène incrémentale à reconstruction complète ; repli conservateur correct permis.
- **Test négatif prescrit** : Omettre invalidation du mur hôte : oracle révèle incohérence et bloque validation de l'optimisation.
- **Preuve (contrôles positifs exécutés)** : 3
  - EX-011 [+] porte déplacée : portée minimale (porte et mur hôte seulement), scène incrémentale identique à la reconstruction complète — `packages/atelier-model/src/studio/projections.preuves-a.test.ts`, commit bf775d9, 2026-10-25 21:49
  - EX-011 [+] repli conservateur : une reconstruction complète (premier calcul) donne le même résultat — `packages/atelier-model/src/studio/projections.preuves-a.test.ts`, commit bf775d9, 2026-10-25 21:49
  - INV-007 [+] le maillage incrémental (seuls les objets invalidés sont remaillés) est identique au maillage complet à chaque pas — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-011 [−] invalidation du mur hôte omise : l'oracle révèle l'incohérence (mur m1 périmé) et l'optimisation fautive est rejetée — `packages/atelier-model/src/studio/projections.preuves-a.test.ts`, commit bf775d9, 2026-10-25 21:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-012

- **Libellé exact (REF-02, § w:p 298)** : EX-012 — Immuabilité des révisions. Une révision de référence ne change pas rétroactivement lorsque la variante évolue. Une correction de contenu produit un nouvel état ; une annulation collaborative constitue elle-même une nouvelle opération vérifiée.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 010,011,030
- **Test positif prescrit** : Capturer R12, produire R13 puis relire R12 et comparer empreinte/contenu inchangés.
- **Test négatif prescrit** : Annulation ou nouvelle approbation tente de réécrire R12 : refuser ou créer nouvelle révision.
- **Preuve (contrôles positifs exécutés)** : 3
  - EX-012 : R12 capturée, R13 produite puis annulée — deux nouvelles révisions, chaîne R12 → R13 → R14 — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - EX-012 : R12 relue après R13 et l'annulation — empreinte et contenu complet (document et métadonnées) inchangés, lecture seule — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
  - EX-012 : l'annulation est une nouvelle opération — R14 a le contenu de R12 pour la ligne, mais pas son identité ni son rectangle supprimé — `apps/web/e2e/studio-persistance.mjs`, commit bf775d9, 2026-10-25 22:03
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - déclencheurs de init.sql : UPDATE d'une révision ou d'un journal refusé, DELETE d'un évènement de publication existante refusé — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-012 [−] une publication diffusée ne se réapprouve ni ne s'actualise ; retirée, son contenu reste lisible et journalisé — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-013

- **Libellé exact (REF-02, § w:p 299)** : EX-013 — Clonage. Lors du clonage d’une variante, les objets issus de la copie sont identifiés dans la nouvelle variante ; leur provenance peut pointer vers leurs sources, sans établir une propagation automatique. Les composants partagés explicitement versionnés font l’objet d’un contrat de mise à jour séparé.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 004
- **Test positif prescrit** : Cloner variante avec nouvelles identités et provenance, modifier clone puis relire source inchangée.
- **Test négatif prescrit** : Ancien identifiant réutilisé dans nouveau propriétaire ou propagation implicite : rejeter/détecter.
- **Preuve (contrôles positifs exécutés)** : 4
  - TR-EX-013 [+] mode copie : nouvelles identités et provenance par élément ; modifier la copie laisse la source inchangée, et réciproquement — `apps/api/src/routes/studio-derivation-copie.test.ts`, commit 4304050, 2026-10-26 03:21
  - TR-EX-013 [+] mode version (défaut) : la variante dérivée garde les identifiants d'objets, sans mode dans la provenance — `apps/api/src/routes/studio-derivation-copie.test.ts`, commit 4304050, 2026-10-26 03:21
  - TR-EX-013 : copie indépendante créée depuis l'interface — provenance « copie » vers la source et sa révision — `apps/web/e2e/studio-dec.mjs`, commit 4304050, 2026-10-26 03:17
  - TR-EX-013 : la liste des variantes nomme la provenance « Copie indépendante de » — `apps/web/e2e/studio-dec.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - TR-EX-013 [+] modifier la copie laisse la source inchangée, modifier la source laisse la copie inchangée (aucune propagation) — `packages/atelier-model/src/studio/copie-independante.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-014

- **Libellé exact (REF-02, § w:p 300)** : EX-014 — Provenance et unités. Chaque source externe porte auteur/fournisseur lorsqu’il est connu, format, horodatage, version, unités, repère, transformation, restrictions d’utilisation et empreinte du contenu si calculable.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 028
- **Test positif prescrit** : Importer source avec unité m, repère local, transformation et provenance, puis exporter métadonnées.
- **Test négatif prescrit** : Unité/repère inconnus : signaler inconnue et empêcher calcul silencieux en mètres supposés.
- **Preuve (contrôles positifs exécutés)** : 5
  - TR-EX-014 — provenance d'une source DXF importée > cas positif : import DXF en mm, repère et restrictions déclarés → source portée par le document, exportée avec toutes ses métadonnées — `packages/atelier-model/src/studio/sources/sources.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-014 — provenance d'un modèle externe reçu (IFC) > restrictions d'utilisation et repère source déclarés, unités déclarée et lue, transformation, empreinte et horodatage exportés — `packages/atelier-model/src/studio/sources/sources.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - Modèles externes (TR-EX-066) — réception relue par le serveur > TR-EX-014 : repère source et restrictions d'utilisation déclarés conservés (null s'ils sont absents), colonnes additives — `apps/api/src/lib/studio-modeles-externes.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - TR-EX-014 : import DXF — source enregistrée avec auteur, format et version lue (AC1015), horodatage, unité mm lue, repère, transformation, restrictions et SHA-256 du fichier — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
  - TR-EX-014 : modèle externe IFC — provenance exportée (auteur, version, schéma lu, unités déclarée et lue, repère source, transformation, restrictions, SHA-256, horodatage) — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - TR-EX-014 — provenance d'une source DXF importée > champs inconnus : auteur, repère source, restrictions et version absents → null (non déclarés), jamais inventés — `packages/atelier-model/src/studio/sources/sources.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-014 — provenance d'une source DXF importée > cas négatif : unité inconnue → aucune commande et aucune source (jamais des mètres supposés) ; unité choisie → lue null, retenue déclarée — `packages/atelier-model/src/studio/sources/sources.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - Import DXF : la source est déclarée avec le lot (fichier, empreinte SHA-256, unité mm lue, aucune transformation) — `apps/web/e2e/studio-navigation.mjs`, commit 085a8f3, 2026-10-26 04:40
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-015

- **Libellé exact (REF-02, § w:p 301)** : EX-015 — Références topologiques. Le système ne reconstitue jamais une relation entre une cote et une face découpée sur la seule proximité spatiale si plusieurs cibles plausibles existent. Il la conserve avec correspondance démontrée ou signale une rupture à résoudre.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 007
- **Test positif prescrit** : Diviser face portant cote : correspondance topologique démontrée ou cote conservée à résoudre.
- **Test négatif prescrit** : Deux faces voisines plausibles : aucun rattachement automatique par seule proximité.
- **Preuve (contrôles positifs exécutés)** : 3
  - prisme en référence liée : l'arête de la source est divisée ; cotes réattachées de façon prouvée, mid du segment divisé réattaché au nouveau sommet qui le recouvre exactement — `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts`, commit 4377815, 2026-10-25 19:50
  - division hors du milieu : la cote du milieu divisé passe « à résoudre » (valeur non évaluée), les autres restent prouvées — `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts`, commit 4377815, 2026-10-25 19:50
  - TEST-007 : arête source divisée, cotes réattachées de façon prouvée (sommets 2-3 → 3-4, milieu 1 → nouveau sommet 2), cote angulaire 2-3 → 3-4 — `apps/web/e2e/studio-faces.mjs`, commit 4377815, 2026-10-25 19:58
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TEST-007 : la cote angulaire du segment divisé passe « à résoudre » (lien rompu, jamais rattachée à une moitié) — `apps/web/e2e/studio-faces.mjs`, commit 4377815, 2026-10-25 19:58
  - INV-013 BLOC-01 [−] segment coté divisé (sommet inséré) : liens rompus, cotes « à résoudre », géométrie gardée, valeur non évaluée — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-016

- **Libellé exact (REF-02, § w:p 328)** : EX-016 — Fraîcheur. Les contenus dérivés doivent afficher à jour pour révision R, à recalculer, en calcul, échec ou non applicable, selon leur contrat. « Dernière image produite » ne signifie pas nécessairement « état courant ».
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 014,030
- **Test positif prescrit** : Changer source R12→R13 : vue devient à recalculer puis en calcul, à jour R13 ou échec explicite.
- **Test négatif prescrit** : Ancienne image R12 présentée à jour R13 après échec : oracle doit rejeter ce statut.
- **Preuve (contrôles positifs exécutés)** : 12
  - TR-EX-016 — états des contenus dérivés > EX-016 [+] : source R12 → R13 : à recalculer, en calcul, puis à jour R13 ou échec explicite — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — états des contenus dérivés > EX-016 : état d'un contenu affiché par un panneau — les cinq états, toujours cohérents avec la révision courante — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications > aperçu de la feuille : composition demandée comparée à l'aperçu affiché ; document vide non applicable — `apps/web/src/modules/studio/taches/etats-contenus.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications > feuille composée : épinglée sur la tête (à jour), plus ancienne (à recalculer), actualisation (en calcul), erreur serveur (… — `apps/web/src/modules/studio/taches/etats-contenus.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications > pastille : état, image et cohérence portés par l'élément affiché — `apps/web/src/modules/studio/taches/etats-contenus.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 : métré « À jour pour la révision R » (révision affichée, état dérivé cohérent) — `apps/web/e2e/studio-g1.mjs`, commit 2e1564d, 2026-10-26 06:24
  - … et 6 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 8
  - TR-EX-016 — états des contenus dérivés > EX-016 [−] : ancienne image R12 présentée « à jour R13 » après échec — l'oracle rejette ce statut — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — états des contenus dérivés > INV-006 : un résultat calculé sur R12 arrivé quand R13 est courante est ignoré, il n'écrase pas l'état courant — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — états des contenus dérivés > EX-051 : domaines périmés après une commande — seuls les domaines invalidés par l'effet passent « à recalculer » — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications > métré : à jour pour la révision affichée, à recalculer, en calcul, échec, non applicable (aucun objet) — `apps/web/src/modules/studio/taches/etats-contenus.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications > publication : manifeste à jour, variante avancée, actualisation, refus, retirée ou remplacée — jamais « à jour » sur une im… — `apps/web/src/modules/studio/taches/etats-contenus.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications > libellés traduits en anglais (D-163) : aucun texte des cinq états ne reste en français — `apps/web/src/modules/studio/taches/etats-contenus.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - … et 2 autre(s) au registre
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Métré, aperçu de la feuille, feuilles composées et publications affichent l'un des cinq états dérivés (pastille EtatContenu, data-studio-etat-contenu / data-etat), à côté de leurs statuts propres ; fonction pure studioEtatDeriveContenu (studio-cmd) et adaptateurs taches/etats-contenus.ts. « En calcul » et « Échec » contrôlés par tests unitaires ; la recette e2e contrôle « À jour pour R », « À rec…

### TR-EX-017

- **Libellé exact (REF-02, § w:p 331)** : EX-017 — Atomicité. Les modifications canoniques d’une même opération sont engagées ensemble ou pas du tout. Les rafraîchissements de cache peuvent être différés et signalés, mais ne constituent pas des modifications canoniques validées.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 008
- **Test positif prescrit** : Appliquer lot mur/ouverture valide et constater engagement groupé durable.
- **Test négatif prescrit** : Deuxième opération du lot invalide : aucune partie de la première ne persiste.
- **Preuve (contrôles positifs exécutés)** : 3
  - A.4 : mur et ouverture enregistrés (tableau architecture, objets 2D inchangés) — `apps/web/e2e/studio-persistance.mjs`, commit f59d66d, 2026-10-19 06:49
  - INV-005 [+] un lot valide est appliqué en entier : une révision, tête avancée — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-005 [+] un lot valide s'applique en entier, comme un seul pas d'historique — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - A.4 : mur abaissé sous son ouverture → 400, motif clair, lot entier refusé — `apps/web/e2e/studio-persistance.mjs`, commit f59d66d, 2026-10-19 06:49
  - INV-005 [−] refus au milieu du lot, ou panne après l'insertion de la révision : aucune ligne modifiée — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - une commande refusée au milieu du lot n'applique pas les précédentes — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit 4643cfa, 2026-10-19 12:39
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-018

- **Libellé exact (REF-02, § w:p 332)** : EX-018 — Idempotence. Une même commande répétée après une interruption, avec son requestId et le même périmètre, n’est pas appliquée deux fois. Une nouvelle commande distincte exige une nouvelle identité.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 013
- **Test positif prescrit** : Réémettre même requestId/périmètre après coupure : même résultat une seule révision/objet.
- **Test négatif prescrit** : Même requestId avec paramètres/périmètre incompatibles : refus explicite, pas deuxième application.
- **Preuve (contrôles positifs exécutés)** : 3
  - la répétition après coupure rend la réponse d'origine, sans seconde révision — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - coupure : même requestId renvoyé, rejeu reconnu, une seule révision — `apps/web/e2e/studio-conflits.mjs`, commit 4643cfa, 2026-10-19 12:43
  - rejeu du même requestId idempotent — `apps/web/e2e/studio-persistance.mjs`, commit ad8c7e3, 2026-10-18 21:30
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - même requestId avec un autre contenu ou par un autre auteur → 409 request_conflict, rien d'écrit — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - requestId réutilisé avec un autre contenu refusé (409) — `apps/web/e2e/studio-persistance.mjs`, commit ad8c7e3, 2026-10-18 21:30
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-019

- **Libellé exact (REF-02, § w:p 335)** : EX-019 — Évolutivité des schémas. Chaque document/commande persistant porte sa version de schéma. Toute migration doit fournir une transformation documentée, des tests aller-retour lorsque réalisables, une conservation des données inconnues ou un rapport des pertes, et un retour arrière ou une récupération explicitement prévue.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 034,036
- **Test positif prescrit** : Lire document schéma ancien, appliquer transformation documentée et comparer identités/propriétés.
- **Test négatif prescrit** : Champ inconnu ou migration impossible : conservation/rapport des pertes et récupération, jamais disparition muette.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-019 : la migration déclarée documente transformation, inverse, récupération et cas impossible — `packages/atelier-model/src/studio/cmd/migration.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-019 [+] : lire un document de schéma ancien, appliquer la transformation, identités et propriétés identiques (aller-retour) — `packages/atelier-model/src/studio/cmd/migration.test.ts`, commit 4304050, 2026-10-26 03:10
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-019 [−] : champ inconnu et élément refusé conservés et rapportés, retour arrière avec rapport des pertes, récupération exacte — `packages/atelier-model/src/studio/cmd/migration.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-019 [−] : migration impossible (unité inconnue) — refus explicite, source rendue intacte, rien ne disparaît — `packages/atelier-model/src/studio/cmd/migration.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-020

- **Libellé exact (REF-02, § w:p 363)** : EX-020 — Indépendance forte. Un dessin 2D doit pouvoir être sérialisé, restauré, édité et exporté sans reconstruction d’un modèle 3D « de substitution ». Les extrusions ou transferts créent un objet 3D nouveau ou une association déclarée.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 001,005
- **Test positif prescrit** : Sérialiser dessin 2D, restaurer et exporter sans charger ou reconstruire de modèle 3D.
- **Test négatif prescrit** : Transfert/extrusion non confirmé : aucune création 3D ni dépendance implicite.
- **Preuve (contrôles positifs exécutés)** : 2
  - crée, déplace, édite et rouvre sans niveau, maillage ou modèle 3D — `packages/atelier-model/src/studio/document-2d.test.ts`, commit ad8c7e3, 2026-10-18 21:27
  - TR-EX-020 : dessin 2D exporté en SVG (rectangle relu) sans charger three.js ni la vue 3D, rendu 3D non initialisé — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-EX-020 : extrusion saisie puis abandonnée — aucune commande en attente, rien envoyé, aucune révision, aucun objet extrudé, aucun moteur 3D — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - aucune valeur par défaut : base et hauteur vides bloquent l'extrusion — `apps/web/src/modules/studio/vue3d/extrusion.test.ts`, commit 3205a6e, 2026-10-18 23:43
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-021

- **Libellé exact (REF-02, § w:p 364)** : EX-021 — Correspondance explicite. Une commande sur un objet architectural depuis l’une des planches cible le même objectId et les mêmes relations. Les deux planches ne doivent pas maintenir leurs propres versions autoritaires du mur.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 003
- **Test positif prescrit** : Modifier mur en 2D puis en 3D et comparer objectId/relations/révision identiques.
- **Test négatif prescrit** : Deux identités concurrentes créées selon planche : défaut éliminatoire signalé.
- **Preuve (contrôles positifs exécutés)** : 3
  - TR-EX-021 : depuis la vue 3D, le mur choisi est le même objet que sur la planche (même identifiant, hauteur modifiée en 2D déjà lue) — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - TR-EX-021 : relu — un seul mur « mur-b » portant les deux modifications, l'ouverture toujours hébergée par lui (relation conservée) — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - TR-EX-021 : après enregistrement, planche et vue 3D portent toujours les mêmes identifiants — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - TR-EX-021 : une seule enveloppe, deux « modifier » sur le même objectId (2D puis 3D), aucune autre identité créée — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - TR-EX-021 : une seule révision pour les deux modifications, fille de la tête précédente (aucune version autoritaire propre à une planche) — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - INV-002 BLOC-01 [−] une seconde copie autoritaire est refusée : identifiant réemployé, projection stockée dans le document — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-022

- **Libellé exact (REF-02, § w:p 383)** : EX-022 — Propagation limitée. Toute propagation est définie par le type d’association et la dépendance. L’extraction d’une coupe ne confère pas à ses segments le pouvoir universel de modifier le volume ; une cote associée ne modifie pas automatiquement sa cible.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 004,006,007
- **Test positif prescrit** : Profil lié modifié recalcule extrusion selon relation ; copie indépendante reste inchangée.
- **Test négatif prescrit** : Éditer segment d'une coupe dérivée ou cote sans commande dédiée : ne modifie pas universellement le volume.
- **Preuve (contrôles positifs exécutés)** : 1
  - segments d'une coupe modifiés : document, prisme et volume inchangés ; recouper rend la coupe d'origine — `packages/atelier-model/src/studio/preuves-b.test.ts`, commit bf775d9, 2026-10-25 21:49
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - référence liée : modifier la polyligne recalcule le prisme dans le même lot (volume relu, jamais l'ancien) — `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts`, commit 4377815, 2026-10-25 19:50
  - copie indépendante : aucune propagation, la source n'est qu'une provenance — `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts`, commit 4377815, 2026-10-25 19:50
  - cote liée au profil source : décalage modifié sans toucher polyligne ni prisme ; point mesuré déplacé refusé ; volume inchangé — `packages/atelier-model/src/studio/preuves-b.test.ts`, commit bf775d9, 2026-10-25 21:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-023

- **Libellé exact (REF-02, § w:p 414)** : EX-023 — Repères et unités. Toute primitive possède un système de coordonnées identifiable : document 2D, local d’objet, système de projet et, le cas échéant, système géographique référencé. Les transformations sont versionnées et vérifiées, avec unités explicites ; la projection graphique en pixels ne constitue jamais l’unité de référence.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 001,002,028
- **Test positif prescrit** : Convertir coordonnées document/local/projet avec transformation versionnée et comparer valeurs/unité.
- **Test négatif prescrit** : Entrée pixels traitée comme mètres ou géographie mélangée au local : refus/erreur explicite.
- **Preuve (contrôles positifs exécutés)** : 6
  - TR-EX-023 — système de projet et transformations versionnées document / local / projet > cas positif : un point du document converti explicitement vers le système de projet (version 1, puis version 2… — `packages/atelier-model/src/studio/reperes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-023 — système de projet et transformations versionnées document / local / projet > local d'objet → document → projet : la pose d'un symbole (position, rotation, échelle) composée avec le systèm… — `packages/atelier-model/src/studio/reperes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - Graphismes et système de projet : saisie > système de projet : version suivante saisie, conversion du point avec la version employée ; sans déclaration, rien n'est converti — `apps/web/src/modules/studio/graphismes/graphismes-ui.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-023 : point (3 ; 1) du dessin converti vers le projet par la version 1 (rotation 90°) : (2 599 999 ; 1 200 003) m, trace de la version — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
  - TR-EX-023 : version 2 ajoutée (la version 1 reste) ; conversion par la version en vigueur et retour exact dans le dessin — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
  - TR-EX-023 : versions 1 et 2 enregistrées dans la révision (origine, rotation en radians) — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - TR-EX-023 — système de projet et transformations versionnées document / local / projet > transformations vérifiées : aller-retour exact, inverse, échelle et unités explicites ; une transformation inc… — `packages/atelier-model/src/studio/reperes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-023 — système de projet et transformations versionnées document / local / projet > cas négatifs : pixels, repère d'écran, repère géographique ou repère qui ne correspond pas à la transformation… — `packages/atelier-model/src/studio/reperes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-023 — système de projet et transformations versionnées document / local / projet > commande studio.repere.projet : version suivante exigée (jamais réécrite), versions sans trou à la validation — `packages/atelier-model/src/studio/reperes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-023 : sans déclaration, « Système de projet non déclaré : aucune conversion n’est supposée. » — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-024

- **Libellé exact (REF-02, § w:p 415)** : EX-024 — Gestes réversibles. Un geste peut afficher un aperçu approché sans écrire d’objet permanent. La confirmation produit une commande, soumise aux contrôles et à une restitution fidèle aux tolérances contractuelles ; annuler l’aperçu ne laisse aucune mutation canonique.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 005,008
- **Test positif prescrit** : Dessiner aperçu, confirmer et contrôler commande/valeur dans tolérance contractuelle.
- **Test négatif prescrit** : Échap sur aperçu puis relire modèle : aucune mutation canonique résiduelle.
- **Preuve (contrôles positifs exécutés)** : 3
  - saisie : polaire 45° et longueur 3 → extrémité exacte — `apps/web/e2e/studio-navigation.mjs`, commit f59d66d, 2026-10-19 06:50
  - accrochage : trois lignes enregistrées avec les coordonnées exactes — `apps/web/e2e/studio-navigation.mjs`, commit f59d66d, 2026-10-19 06:50
  - transformations : aperçu de la copie au survol, Échap l'annule sans rien appliquer — `apps/web/e2e/studio-navigation.mjs`, commit f59d66d, 2026-10-19 06:50
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - aperçu du tracé affiché, aucune commande en attente — `apps/web/e2e/studio-conflits.mjs`, commit 4643cfa, 2026-10-19 12:43
  - Échap : aperçu annulé, aucune commande, rien envoyé — `apps/web/e2e/studio-conflits.mjs`, commit 4643cfa, 2026-10-19 12:43
  - l'aperçu ne crée aucun pas, aucune commande en attente, et laisse le document intact — `apps/web/src/modules/studio/contrat-commandes.test.ts`, commit 4643cfa, 2026-10-19 12:39
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-025

- **Libellé exact (REF-02, § w:p 416)** : EX-025 — Accrochage stable. Les types d’accrochage, priorités, tolérances et règles de sélection sont définis par contexte. Une accélération spatiale ou une baisse des effets graphiques n’est pas autorisée à substituer silencieusement un point différent à celui du calcul de référence.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 022
- **Test positif prescrit** : Exécuter snapping avant/après index sur extrémité/intersection ambiguë et comparer point/cible/priorité.
- **Test négatif prescrit** : Réduire qualité graphique ou permuter candidats : aucun autre point choisi hors contrat.
- **Preuve (contrôles positifs exécutés)** : 4
  - TEST-022 — S1–S3 : même repère résolu (point, genre, objet, priorité) par l'index et le parcours linéaire — `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts`, commit 44c6ef4, 2026-10-25 16:08
  - extrémité et intersection confondues : même point, même cible, même priorité avant et après index (au-dessus du seuil) — `apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts`, commit bf775d9, 2026-10-25 21:49
  - ordre des objets inversé puis mélangé : même point et même genre ; à égalité exacte, l'un des candidats ex aequo de la référence — `apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts`, commit bf775d9, 2026-10-25 21:49
  - candidats, point accroché et tolérance rendus identiques avant, pendant et après la charge (paliers 0 à 4) — `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts`, commit 5edae3e, 2026-10-25 20:16
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-026

- **Libellé exact (REF-02, § w:p 422)** : EX-026 — Registre. Le Tool Registry décrit les capacités activables, leurs contextes, versions, contrats, permissions et dépendances. Il est consultable sans télécharger tous les moteurs ni instancier leurs machines. Son manifeste léger est utilisable pour la recherche hors ligne.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : B/X/F option
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/outils.ts`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-05,DEC-07,DEC-15,DEC-18 · **Scénarios** : 016,017
- **Test positif prescrit** : Rechercher toolId et dépendances depuis manifeste léger à cache froid puis hors ligne.
- **Test négatif prescrit** : Consulter registre sans activer outil : aucun chargement/initialisation obligatoire OCCT ou machines lourdes.
- **Preuve (contrôles positifs exécutés)** : 1
  - TR-EX-026 : hors connexion — même résultat depuis le manifeste léger (toolId, chargeur, prérequis), sans réseau — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - TR-EX-026 : cache froid (aucun service worker ni cache) — « studio.solide.deplacer » trouvé par son toolId, chargeur vue-3d et prérequis boîte / prisme lus dans le manifeste — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - TR-EX-026 / TR-EX-029 : la recherche ne charge ni n'initialise aucun moteur (three.js, vue 3D, noyau exact non demandés ; rendu 3D non initialisé) — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - TR-EX-026 : hors connexion, la recherche ne lance toujours aucun moteur lourd — `apps/web/e2e/studio-preuves-b.mjs`, commit bf775d9, 2026-10-25 21:54
  - est valide : aucune entrée manquante, en double ou hors registre ; chargeurs et prérequis sans cycle — `packages/atelier-model/src/studio/manifeste-outils.test.ts`, commit 4643cfa, 2026-10-19 12:39
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-027

- **Libellé exact (REF-02, § w:p 423)** : EX-027 — Identifiants uniques. Les capacités portent des identifiants globalement non ambigus (studio.draw.line2d, studio.transform.scale, studio.arch.ladder). Une collision de noms d’affichage n’autorise pas une collision d’identifiants. Les renommages gardent les alias de migration documentés.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : B/X/F option
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/outils.ts`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-05,DEC-07,DEC-15,DEC-18 · **Scénarios** : 017
- **Test positif prescrit** : Valider manifeste contenant studio.transform.scale et studio.arch.ladder distincts ; alias ancien résolu.
- **Test négatif prescrit** : Déclarer deux toolId identiques même si labels distincts : validation rejette sans écrasement de dictionnaire.
- **Preuve (contrôles positifs exécutés)** : 16
  - registre : mutation de la barre Architecture, Ctrl+Maj+F12, icône propre, acceptée par l'API et appliquée par le modèle ; distincte de la transformation Échelle — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - géométrie dérivée : deux montants de section carrée, échelons au pas hauteur / (n + 1), emprise ; orientation suivie — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - vue 3D : montants et échelons maillés sous le même identifiant, volume du maillage = volume de matière du métré — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - métré : longueur cumulée des montants et des échelons, hauteur, volume ; nombre et pas des échelons dans le métré architectural — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - propriétés : valeurs saisies modifiées par « Modifier l'élément architectural » (même identité), propriété BIM déclarée sur l'échelle — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - plan : SVG et DXF tracent les montants et le contour des échelons sur le calque de l'échelle — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - … et 10 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - aucune valeur par défaut : champ absent, nul, négatif ou non entier refusé ; section qui ne laisse aucun échelon ; échelons qui se touchent ; orientation hors [0 ; 2π[ — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - identifiant déjà pris, calque verrouillé, ouverture dans une échelle, changement de nature : refus, document inchangé — `packages/atelier-model/src/studio/architecture/echelle.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - « echelle » de l'Atelier (B.1-05) : transformation au commit courant ; avant 1a6f9b5, ambigu sans fiche, jamais choisi par défaut — `packages/atelier-model/src/studio/manifeste-outils.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-027 : formulaire de l'outil, aucune valeur proposée — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-EX-027 : enregistrée par le serveur avec les valeurs saisies (aucune ajoutée) — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-028

- **Libellé exact (REF-02, § w:p 424)** : EX-028 — Validation à deux niveaux. Les métadonnées et le schéma peuvent être contrôlés au build ; chaque invocation effective fait l’objet des contrôles d’exécution, notamment permission, contexte, paramètres, quotas et révision.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : B/X/F option
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/outils.ts`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-05,DEC-07,DEC-15,DEC-18 · **Scénarios** : 018,035
- **Test positif prescrit** : Manifeste valide au build, invocation autorisée avec paramètres/révision/quotas valides réussit.
- **Test négatif prescrit** : Modifier droits après build ou forger entrée/quota : contrôle runtime refuse malgré schéma statique valide.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - compteur glissant : refus au-delà de la limite de la période, délai avant nouvel essai, libéré quand la fenêtre passe — `apps/api/src/routes/studio-quotas.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - route réelle : deux lots admis, le troisième au schéma valide refusé à l'exécution (429, Retry-After), rien écrit ; un autre compte n'est pas touché — `apps/api/src/routes/studio-quotas.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - un lot refusé pour une autre raison (révision dépassée, droit retiré après coup) ne consomme pas le quota ; le contrôle de droit reste à l'exécution — `apps/api/src/routes/studio-quotas.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-029

- **Libellé exact (REF-02, § w:p 463)** : EX-029 — Recherche. Requête par nom, synonymes, famille, domaine, contexte et identifiant ; la recherche ne lance pas le moteur. Pour chaque outil, l’interface expose : découvert, non disponible, incompatible, interdit, non installé hors ligne, en chargement, prêt, erreur.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : B/X/F option
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/outils.ts`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-05,DEC-07,DEC-15,DEC-18 · **Scénarios** : 017,020
- **Test positif prescrit** : Chercher par nom, synonyme, famille, domaine, contexte et toolId et voir état fidèle.
- **Test négatif prescrit** : Échec loader/interdit/offline : résultat reste découvrable avec état exact, pas faux prêt ni moteur lancé par recherche.
- **Preuve (contrôles positifs exécutés)** : 2
  - synonyme : « miroir » trouve la Symétrie, « cloison » le Mur, « cube » la Boîte, « offset » le Décalage — `apps/web/src/modules/studio/planche2d/etats-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - famille (barre) et domaine : « architecture » et « bâtiment » trouvent les outils d'architecture ; « 3D » les volumes — `apps/web/src/modules/studio/planche2d/etats-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - la recherche ne lance aucun moteur : aucun chargeur appelé, aucun état de moteur changé — `apps/web/src/modules/studio/planche2d/etats-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - chaque état est atteint, avec son libellé ; un échec de chargeur, un refus ou le hors-ligne gardent l'outil découvrable avec son état exact — `apps/web/src/modules/studio/planche2d/etats-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-030

- **Libellé exact (REF-02, § w:p 464)** : EX-030 — Versions. Un changement majeur du contrat exige un plan de compatibilité avec profils enregistrés, commandes hors ligne en attente et documents réouvrables. Un module marqué « déprécié » reste résoluble tant que sa présence est nécessaire à la lecture d’un travail existant, ou fournit une migration sûre.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : B/X/F option
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/outils.ts`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-05,DEC-07,DEC-15,DEC-18 · **Scénarios** : 036
- **Test positif prescrit** : Réouvrir document/profil ancien avec compatibilité/alias ou migration explicitement fournie.
- **Test négatif prescrit** : Déprécier outil puis ouvrir un travail le nécessitant : pas d'objet perdu ou de commande locale effacée.
- **Preuve (contrôles positifs exécutés)** : 1
  - outil retiré (absent du registre) ou type d'objet inconnu : travail signalé non réouvrable, rien n'est réinterprété — `packages/atelier-model/src/studio/compatibilite-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - tables réelles : aucun outil ni module déprécié, déclarations valides ; un outil du registre est actif, un identifiant inconnu est inconnu — `packages/atelier-model/src/studio/compatibilite-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - cas négatif : déprécier l'outil Rectangle puis rouvrir un document qui l'emploie — le document se relit, aucun objet perdu, l'emploi est signalé — `packages/atelier-model/src/studio/compatibilite-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - commandes hors ligne en attente de l'outil déprécié : conservées et toujours applicables (aucune commande locale effacée) ; profil enregistré : suit le remplacement déclaré — `packages/atelier-model/src/studio/compatibilite-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - plan incomplet ou incohérent refusé : remplacement absent, remplacement lui-même déprécié, version invalide, doublon — `packages/atelier-model/src/studio/compatibilite-outils.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-031

- **Libellé exact (REF-02, § w:p 465)** : EX-031 — Extensibilité sûre. La déclaration d’extension indique provenance, version, signature ou mécanisme de confiance choisi, permissions demandées, dépendances, mises à jour et support. « Trouvé dans le Registry » ne signifie pas « autorisé à charger/écrire ». Les extensions tierces restent une décision ouverte.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : B/X/F option
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/outils.ts`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-05,DEC-07,DEC-15,DEC-18 · **Scénarios** : 033,035
- **Test positif prescrit** : Extension optionnelle inspectée avec provenance/version/confiance/permissions/mises à jour identifiées.
- **Test négatif prescrit** : Manifeste propose script arbitraire non fiable : aucun chargement/écriture sur simple découverte.
- **Preuve (contrôles positifs exécutés)** : 1
  - TR-EX-031 [+] extension signée par une clé de confiance : vérifiée, puis autorisée seulement pour cette version ; l'adaptateur MCP intégré est déclaré — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-EX-031 [−] trouvée dans le registre sans signature valide : découverte, non autorisée ; script arbitraire : refusée, rien chargé ; « intégré » usurpé : découverte — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
  - F.3-01 [−] adaptateur désactivé par l'administrateur : plus aucun outil n'agit ; déclaration avec script : refusée, rien n'est chargé ni écrit — `apps/api/src/routes/studio-agents.test.ts`, commit 4304050, 2026-10-26 03:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-032

- **Libellé exact (REF-02, § w:p 468)** : EX-032 — Manager. Le Tool Manager construit les barres, réconcilie les préférences et le contexte, résout les loaders, active/désactive les machines d’outil et expédie les événements. Il n’effectue pas lui-même de booléens, de tessellation ou de validation canonique.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : 016,017
- **Test positif prescrit** : Activer outil via Manager, loader et machine puis commande commune ; moteur appelé via frontière dédiée.
- **Test négatif prescrit** : Espionner Manager lors booléen : ne calcule pas lui-même géométrie ni ne contourne validation serveur.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - activer, désactiver, réactiver 50 fois le Booléen exact puis libérer le moteur : chargeur appelé une fois, aucun booléen, aucune tessellation, aucun Worker créé par le Manager — `apps/web/src/modules/studio/chargement/manager-exact.test.ts`, commit d87a82e, 2026-10-25 21:11
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-033

- **Libellé exact (REF-02, § w:p 487)** : EX-033 — Personnalisation sûre. Retirer un bouton ne désinstalle ni l’outil ni les objets créés avec lui. Importer un profil ne confère pas de permissions. Le passage d’un profil à l’autre ne produit pas de révision du bâtiment.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : 018,019
- **Test positif prescrit** : Changer standard→métier→personnel et masquer bouton : modèle/révision/droits inchangés et outil retrouvable.
- **Test négatif prescrit** : Importer profil avec Publier sans droit : exécution refusée ; masquer outil ne supprime pas ses objets.
- **Preuve (contrôles positifs exécutés)** : 1
  - TR-EX-033 : le propriétaire, qui publie, importe ce même profil — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - profil importé contenant « Publier » sans le droit de publier (éditeur, lecteur) : refusé 403, rien n'est écrit ; le propriétaire, qui publie, l'importe — `apps/api/src/routes/studio-profils-import.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - TR-EX-033 / TR-INV-009 : profil contenant « Publier » importé par un éditeur sans droit de publier → 403 permission_non_conferee, rien d'écrit — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-034

- **Libellé exact (REF-02, § w:p 488)** : EX-034 — Persistance des profils. Un profil possède profileId, propriétaire, version, ordre des capacités, raccourcis, visibilité, réglages et contexte. Les conflits de raccourcis sont détectés, explicités et résolus sans effacer la configuration source.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : 019
- **Test positif prescrit** : Enregistrer profil avec profileId/propriétaire/version/ordre/raccourcis puis rouvrir sur autre session.
- **Test négatif prescrit** : Importer deux raccourcis en conflit : conflit visible et configuration source préservée.
- **Preuve (contrôles positifs exécutés)** : 5
  - enregistrer un profil avec ordre et raccourcis puis le rouvrir dans une autre session : même profileId, propriétaire, version croissante — `apps/api/src/routes/studio-profils-import.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - import par un autre compte : le compte importateur devient propriétaire, la provenance est gardée, la version est la sienne — `apps/api/src/routes/studio-profils-import.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - conflits explicités : doublon, raccourci natif d'un autre outil, commande de l'éditeur, combinaison du navigateur — `apps/web/src/modules/studio/planche2d/profils-raccourcis.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-034 : profil enregistré en base — profileId, propriétaire, version 1, ordre et raccourci personnel — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
  - TR-EX-034 : export — format fadi-studio-profil/1, même profileId, version 2 — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - cas négatif : deux raccourcis en conflit (doublon, raccourci natif d'un autre outil) → 409, conflits explicités, rien d'écrit, fichier source intact ; « écarter » importe le reste — `apps/api/src/routes/studio-profils-import.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - fichier forgé : format inconnu ou capacité hors registre → refusé, rien n'est écrit — `apps/api/src/routes/studio-profils-import.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - table appliquée : seuls les raccourcis sans conflit, outils du registre seulement, jamais une combinaison native — `apps/web/src/modules/studio/planche2d/profils-raccourcis.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-034 : import en conflit avec un raccourci du registre → 409, conflit nommé (Ctrl+Maj+U, Pousser / tirer la face), rien d'écrit — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
  - TR-EX-034 : « écarter » — l'éditeur devient propriétaire de sa copie, provenance gardée, raccourci en conflit rendu — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-035

- **Libellé exact (REF-02, § w:p 489)** : EX-035 — Commande de recherche. Le catalogue complet reste accessible indépendamment de la barre active. Un outil interdit ou incompatible peut être recherché à des fins d’information, mais n’est pas offert comme action exécutable.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : 017,018
- **Test positif prescrit** : Masquer outil favori puis le retrouver dans catalogue autorisé.
- **Test négatif prescrit** : Chercher outil interdit/incompatible : descriptif consultable selon politique, pas d'action exécutable.
- **Preuve (contrôles positifs exécutés)** : 2
  - propriétaire : « studio.dessin.supprimer » trouvé par la recherche de la palette, non exécutable, raison « contexte » — `apps/web/e2e/studio-catalogue.mjs`, commit bf775d9, 2026-10-25 22:06
  - lecteur : « studio.dessin.ligne » trouvé par la recherche de la palette, non exécutable, raison « droit-role » — `apps/web/e2e/studio-catalogue.mjs`, commit bf775d9, 2026-10-25 22:06
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - propriétaire : Entrée puis clic sur « studio.dessin.supprimer » ne lancent rien (palette ouverte, Sélection toujours active, aucune commande envoyée) — `apps/web/e2e/studio-catalogue.mjs`, commit bf775d9, 2026-10-25 22:06
  - lecteur : Entrée puis clic sur « studio.dessin.ligne » ne lancent rien (palette ouverte, Sélection toujours active, aucune commande envoyée) — `apps/web/e2e/studio-catalogue.mjs`, commit bf775d9, 2026-10-25 22:06
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-036

- **Libellé exact (REF-02, § w:p 491)** : EX-036 — Accessibilité. Chaque commande affichée possède un nom compréhensible, un état actif/chargement/interdit, un parcours clavier et un retour d’erreur. Les gestes impossibles au seul clavier possèdent un chemin alternatif adapté au contexte, à définir dans les spécifications UX. Le changement de focus entre Planche 2D et 3D est visible.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : NAV-001,NAV-005
- **Test positif prescrit** : Au clavier activer commande, voir focus 2D/3D et lire nom/état/erreur accessible.
- **Test négatif prescrit** : Commande sans nom ou geste sans alternative prévue : échec recette, aucun succès déduit de l'icône.
- **Preuve (contrôles positifs exécutés)** : 7
  - TR-EX-036 [+] chaque outil du manifeste a exactement une alternative déclarée ; chaque geste au pointeur a son essai sans pointeur — `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-036 [+] chaque saisie numérique déclarée produit, sans pointeur, la commande de l'outil, acceptée par le modèle — `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-036 [+] la sélection a son chemin clavier (liste des éléments, Ctrl+A) ; ligne et polyligne acceptent la saisie directe de longueur et d'angle — `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-036 [+] chaque commande (non-geste) a un raccourci clavier ; chaque geste de vue a sa commande clavier ; les flèches déplacent la planche — `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-036 : Maj+D (2D → 3D) déplace le focus sur la vue 3D, avec un contour visible — `apps/web/e2e/studio-dec.mjs`, commit 4304050, 2026-10-26 03:17
  - TR-EX-036 : Maj+D (3D → 2D) ramène le focus sur la planche 2D, avec un contour visible — `apps/web/e2e/studio-dec.mjs`, commit 4304050, 2026-10-26 03:17
  - … et 1 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-EX-036 [+] la bascule Planche 2D ⇄ 3D déplace le focus vers la planche qui apparaît (aucun déplacement sans bascule) — `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-036 [−] garde construite : un outil sans alternative, une déclaration hors registre ou sans moyen est détecté ; un essai cassé échoue — `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-037

- **Libellé exact (REF-02, § w:p 492)** : EX-037 — Continuité des gestes. La palette contextuelle ne doit pas perturber les séquences de dessin, la saisie numérique ni les modificateurs de contraintes. Les préférences de présentation sont distinctes des paramètres de géométrie enregistrés.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : 019,NAV-007
- **Test positif prescrit** : Saisir longueur numérique avec modificateur de contrainte pendant ouverture palette : geste conservé.
- **Test négatif prescrit** : Changement palette/profil pendant geste : pas de perte silencieuse ni paramètre géométrique remplacé par préférence UI.
- **Preuve (contrôles positifs exécutés)** : 1
  - geste : palette ouverte puis fermée pendant la saisie — point posé, champ Mesures et saisie « 2 » conservés, polaire toujours actif — `apps/web/e2e/studio-navigation.mjs`, commit bf775d9, 2026-10-25 22:04
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - geste : après la palette, Entrée trace la ligne polaire 45° de longueur 2 depuis le point posé (aucun paramètre remplacé) — `apps/web/e2e/studio-navigation.mjs`, commit bf775d9, 2026-10-25 22:04
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-038

- **Libellé exact (REF-02, § w:p 497)** : EX-038 — Démarrage léger. À l’ouverture du Studio : interface minimale, identité/profil, contexte d’étude, métadonnées du registre et commandes essentielles. Aucune initialisation systématique de tous les outils spécialisés, d’OCCT, des moteurs 3D non sollicités ou de leurs workers.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 016
- **Test positif prescrit** : Ouvrir Studio à froid et relever shell/profil/contexte/catalogue avant première action.
- **Test négatif prescrit** : Espionner OCCT/renderer3D/worker rare sans planche ouverte : aucune initialisation systématique.
- **Preuve (contrôles positifs exécutés)** : 3
  - démarrage : ni planche, ni three.js, ni noyau exact, ni Atelier exécutés (B.3-02, EX-038) — `apps/web/e2e/studio-chargement.mjs`, commit bf775d9, 2026-10-25 22:06
  - démarrage (avant toute action) : coquille Studio, rôle de l'utilisateur et contexte d'étude (étude, variante, révision de tête) affichés (EX-038) — `apps/web/e2e/studio-chargement.mjs`, commit bf775d9, 2026-10-25 22:06
  - démarrage (avant toute action) : profil d'outils et catalogue autorisé lus du serveur, barres d'outils et commandes essentielles présentes (EX-038) — `apps/web/e2e/studio-chargement.mjs`, commit bf775d9, 2026-10-25 22:06
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-039

- **Libellé exact (REF-02, § w:p 498)** : EX-039 — Ouverture de planche. La première Planche 2D initialise uniquement les composants nécessaires à sa représentation et à ses commandes usuelles. La Planche 3D initialise son renderer et les machines utiles. Les deux peuvent cohabiter lorsque l’utilisateur les ouvre, sans forcer le téléchargement de tout le catalogue.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 016
- **Test positif prescrit** : Ouvrir seulement planche 2D puis 3D et attribuer chaque ressource à l'action nécessaire.
- **Test négatif prescrit** : 2D seule déclenche tous moteurs 3D spécialisés : tracer et refuser ce comportement non justifié.
- **Preuve (contrôles positifs exécutés)** : 6
  - planche : l'éditeur est chargé, three.js / vue 3D / noyau exact toujours pas (B.3-03, EX-039) — `apps/web/e2e/studio-chargement.mjs`, commit 4643cfa, 2026-10-19 12:43
  - planche : moteurs planche initialisés et actifs (outil Sélection), rendu 3D non initialisé (B.3-01) — `apps/web/e2e/studio-chargement.mjs`, commit 4643cfa, 2026-10-19 12:43
  - vue 3D : three.js chargé au premier usage, chaque morceau une seule fois (B.3-04) — `apps/web/e2e/studio-chargement.mjs`, commit 4643cfa, 2026-10-19 12:43
  - vue 3D : moteur initialisé une fois et actif — `apps/web/e2e/studio-chargement.mjs`, commit 4643cfa, 2026-10-19 12:43
  - planche importée statiquement par la coquille : violation ; noyau exact dans la 3D : violation — `apps/web/src/modules/studio/chargement/carte-morceaux.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - three.js importé statiquement par l'entrée : violation nommée — `apps/web/src/modules/studio/chargement/carte-morceaux.test.ts`, commit 4643cfa, 2026-10-19 12:39
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-040

- **Libellé exact (REF-02, § w:p 499)** : EX-040 — Activation rare. Une opération particulière déclenche le chargement de son module et de ses dépendances manquantes, puis conserve ou libère les ressources selon une politique documentée. Un moteur déjà initialisé et compatible ne doit pas être réinitialisé sans raison.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 015,016
- **Test positif prescrit** : Activer outil exact pour la première fois, puis seconde fois et comparer instance/dépendances mutualisées.
- **Test négatif prescrit** : Échec d'un module rare : état récupérable ; un autre outil compatible ne crée pas sans raison un second noyau.
- **Preuve (contrôles positifs exécutés)** : 1
  - cas négatif : échec du module rare — état récupérable ; la relance réussit avec un seul noyau vivant — `apps/web/src/modules/studio/chargement/cycle-activation.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - première activation : charge module et noyau ; seconde activation et autres outils entre-temps : même noyau, aucune réinitialisation — `apps/web/src/modules/studio/chargement/cycle-activation.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-041

- **Libellé exact (REF-02, § w:p 500)** : EX-041 — Partage de dépendances. Les modules d’outils mutualisent la géométrie fondamentale, les bibliothèques graphiques et les noyaux exacts. Un découpage en un fichier par bouton est interdit comme obligation universelle : la granularité est choisie à partir des coûts de chargement, des dépendances et du comportement réel de l’utilisateur.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 016
- **Test positif prescrit** : Activer deux outils partageant géométrie/noyau, mesurer un exemplaire compatible de dépendance.
- **Test négatif prescrit** : Un chunk par bouton duplique le même noyau : détecter octets/instances sans imposer découpage arbitraire.
- **Preuve (contrôles positifs exécutés)** : 2
  - Worker ↔ principal comparés ; même fichier émis deux fois compté une seule fois ; exception déclarée seulement pour ses fichiers — `apps/web/src/modules/studio/chargement/duplication.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - branché sur la construction : la configuration relève les modules des Workers et refuse le build sur violation — `apps/web/src/modules/studio/chargement/duplication.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - cas positif : deux outils partagent géométrie et noyau dans un même morceau — un seul exemplaire, aucune duplication — `apps/web/src/modules/studio/chargement/duplication.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - cas négatif : un morceau par bouton qui embarque chacun le noyau et three.js — duplication détectée en octets, build refusé — `apps/web/src/modules/studio/chargement/duplication.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-042

- **Libellé exact (REF-02, § w:p 521)** : EX-042 — Cache différencié. Le service worker gère séparément : (a) shell minimal, (b) ressources essentielles d’un profil, (c) modules facultatifs, (d) données métier et file de commandes. Le préchargement complet du build n’est pas considéré comme équivalent au chargement différé, même si le code n’est pas encore exécuté.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 016,036
- **Test positif prescrit** : Observer caches distincts shell/profil/modules/file et téléchargement facultatif au besoin.
- **Test négatif prescrit** : Service worker précache tout le build : ne déclarer ce fait équivalent au chargement différé.
- **Preuve (contrôles positifs exécutés)** : 13
  - installation : coquille et profil mis en cache avant les modules facultatifs, tous dans le cache du build — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - une liste simple (ancienne forme) reste acceptée — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - mise à jour avec une page ouverte : le dernier ancien cache est gardé, la page est prévenue, sans rechargement imposé — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - carte des morceaux : seule celle de CE build est enregistrée (installation et lecture réseau) — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - trois caches distincts par build ; un module lu plus tard rejoint le cache de sa classe ; hors ligne, chaque classe est servie depuis son cache — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - mise à jour avec une page ouverte : les trois caches du build précédent restent ensemble, les plus anciens sont purgés — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - … et 7 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 9
  - mise à jour sans page ouverte : tous les anciens caches purgés ; première installation : aucune « mise à jour » annoncée — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - la file locale (IndexedDB) n'est jamais lue ni modifiée par le service worker — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - carte des morceaux : réseau d'abord, copie de ce build hors ligne ; API jamais interceptée — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - le précache n'est pas un chargement : le binaire du noyau exact n'est jamais préchargé (téléchargement facultatif à la demande) ; les données et la file restent hors du service worker — `apps/web/src/modules/studio/chargement/service-worker.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - sans service worker, sans cache de ce build ou avec la carte d'un autre build : non évalué, jamais disponible — `apps/web/src/modules/studio/chargement/cache-hors-ligne.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - lot F2 : .wasm du noyau exact absent du cache (jamais préchargé) : le seul Booléen exact est indisponible hors connexion, véridiquement — `apps/web/src/modules/studio/chargement/cache-hors-ligne.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - … et 3 autre(s) au registre
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-043

- **Libellé exact (REF-02, § w:p 522)** : EX-043 — Offline véridique. Une capacité n’est annoncée utilisable hors réseau que si les modules, dépendances et données de référence indispensables sont présents et compatibles. Une action exigeant l’autorité centrale peut être préparée localement selon contrat, mais n’est jamais marquée « publiée/approuvée » avant validation centrale.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 020,021
- **Test positif prescrit** : Passer offline avec profil préparé et utiliser outil dont code/dépendances/données sont compatibles.
- **Test négatif prescrit** : Outil absent du cache : indisponible explicite ; commande centrale préparée ne devient pas publiée/approuvée.
- **Preuve (contrôles positifs exécutés)** : 2
  - hors connexion : approbation annoncée non confirmée — `apps/web/e2e/studio-preuves-c.mjs`, commit bf775d9, 2026-10-25 21:54
  - en ligne : approbation validée par le serveur, puis affichée « approuvée » — `apps/web/e2e/studio-preuves-c.mjs`, commit bf775d9, 2026-10-25 21:54
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - hors connexion : la carte n'est jamais affichée « approuvée » (état lu du serveur conservé) — `apps/web/e2e/studio-preuves-c.mjs`, commit bf775d9, 2026-10-25 21:54
  - de retour en ligne : le serveur n'a rien enregistré (toujours soumis, aucune approbation) — `apps/web/e2e/studio-preuves-c.mjs`, commit bf775d9, 2026-10-25 21:54
  - hors connexion : diffusion annoncée non confirmée, jamais affichée « diffusée » — `apps/web/e2e/studio-preuves-c.mjs`, commit bf775d9, 2026-10-25 21:54
  - de retour en ligne : aucune diffusion enregistrée par le serveur — `apps/web/e2e/studio-preuves-c.mjs`, commit bf775d9, 2026-10-25 21:54
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-044

- **Libellé exact (REF-02, § w:p 523)** : EX-044 — Versions du cache. Le système conserve la correspondance buildId ↔ toolContractVersion ↔ schemaVersion, protège les commandes en attente et évite qu’une mise à jour invalide une opération locale sans explication. Les politiques d’éviction doivent respecter les limites de quota et préserver prioritairement les données non synchronisées.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 036
- **Test positif prescrit** : Mettre à jour build avec file pendante et préserver relation build/contrat/schéma et données non synchronisées.
- **Test négatif prescrit** : Ancien contrat incompatible ou quota atteint : résolution/migration explicite, aucune purge de file silencieuse.
- **Preuve (contrôles positifs exécutés)** : 3
  - la file enregistre build, contrat des commandes, schéma du document et manifeste ; relue par le même build, rien n'est signalé — `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - mise à jour du build avec une file en attente : relue par le nouveau build, conservée intacte et rejouable, l'ancien build signalé — `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - quota atteint : les versions lues en cache (sauf celle de la variante ouverte) sont évincées, les plus anciennes d'abord, puis le brouillon est écrit — `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - cas négatif : ancien contrat incompatible (format futur, outil hors contrat) — résolution explicite, la ligne n'est jamais purgée — `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - quota toujours atteint après l'éviction : erreur « quota » rendue à l'interface, aucun brouillon effacé, rien d'autre que les versions lues touché — `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - politique : jamais la variante ouverte ; reconnaissance du dépassement enveloppé — `apps/web/src/modules/studio/hors-ligne/quota-build.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-045

- **Libellé exact (REF-02, § w:p 552)** : EX-045 — Prévisualisation distincte. Un appel d’essai ne produit pas de mutation permanente. La réponse peut fournir géométrie, contraintes et avertissements, avec portée de validité de révision. Un calcul prévisualisé et non confirmé est révoqué sans effets de référence.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 014
- **Test positif prescrit** : Exécuter preview de booléen liée à R12 puis confirmer sur base valide.
- **Test négatif prescrit** : Annuler preview ou recevoir calcul R12 après R13 : aucun engagement permanent non confirmé.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-045 [+] : prévisualisation sur R1 sans mutation permanente, puis confirmation sur base valide (journal relié au job) — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - EX-045 [+] : essai à portée de révision — résultat (géométrie, effets, validité) sans révision écrite — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-045 [−] : essai R1 confirmé après R2, essai abandonné, base périmée : refusés, aucun engagement — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - EX-045 [−] : résultat d'essai R12 reçu après R13, essai abandonné : refusés sans effet — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-045 [−] : essai calculé sur R12 confirmé quand R13 est la tête — refusé (essai_perime), rien d'engagé — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-046

- **Libellé exact (REF-02, § w:p 553)** : EX-046 — Journal d’audit. Les engagements persistants exposent qui a demandé, sur quoi, quand, à partir de quelle révision, avec quel résultat et quelles identités touchées. Les événements sensibles suivent une politique de minimisation et de conservation explicite.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 012,013
- **Test positif prescrit** : Accepter commande puis relire acteur cible horodatage base résultat et IDs touchés dans journal.
- **Test négatif prescrit** : Commande refusée ou trace sensible : aucun faux engagement, pas de secret/géométrie client inutile dans logs.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : Implémenté · **Tests** : Non exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-047

- **Libellé exact (REF-02, § w:p 555)** : EX-047 — Historique hybride. Le Studio conserve les mécanismes éprouvés de Fadi lorsque l’audit démontre leur adéquation : commandes métier, deltas de Planche, états immuables/instantanés locaux. Les inverses, deltas et snapshots sont choisis selon exactitude, volume mémoire et concurrence ; aucune promesse générale d’annulation en O(1) n’est émise.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 011,012
- **Test positif prescrit** : Choisir commande/inverse ou delta/snapshot justifié, annuler/rétablir et comparer état exact.
- **Test négatif prescrit** : Historique volumineux/concurrent incompatible : refus explicite, pas promesse O(1) ni perte masquée.
- **Preuve (contrôles positifs exécutés)** : 1
  - au-delà de ${STUDIO_HISTORY_LIMIT} lots : les plus anciens ne s'annulent plus, restent en attente, et la barre d'état le dit — `apps/web/src/modules/studio/planche2d/historique-borne.preuves-c.test.ts`, commit bf775d9, 2026-10-25 21:49
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - annuler / rétablir rend l'état exact ; sous la borne, aucun avertissement — `apps/web/src/modules/studio/planche2d/historique-borne.preuves-c.test.ts`, commit bf775d9, 2026-10-25 21:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-048

- **Libellé exact (REF-02, § w:p 556)** : EX-048 — Annulation collaborative. Annuler une commande acceptée peut nécessiter une nouvelle commande inverse sur la révision actuelle. Le serveur revalide les objets modifiés entre-temps ; l’historique ou la publication précédente n’est pas réécrit.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 012
- **Test positif prescrit** : Annuler commande C1 après C2 compatible via nouvelle inverse validée sur révision actuelle.
- **Test négatif prescrit** : C2 d'autre utilisateur incompatible : conflit, jamais suppression silencieuse du travail d'autrui.
- **Preuve (contrôles positifs exécutés)** : 1
  - INV-011 [+] le brouillon reporté sur la tête d'autrui s'annule sans retirer le changement d'autrui — `apps/web/src/modules/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - INV-011 [+] A annule son propre ajout (élément distinct) : refus 409 sans chevauchement, reporté sur la tête, le travail de B demeure — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-011 [−] l'annulation de A retirerait `a` modifié par B : conflit signalé (chevauchement objects:a), tête de B intacte — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - annulation concurrente : annuler après un report ne retire jamais un changement d'autrui — `apps/web/src/modules/studio/contrat-commandes.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - déclencheurs de init.sql : UPDATE d'une révision ou d'un journal refusé, DELETE d'un évènement de publication existante refusé — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-049

- **Libellé exact (REF-02, § w:p 557)** : EX-049 — Reprise de session. Au retour après interruption, l’interface distingue opérations confirmées, en attente de synchronisation, rejetées/conflictuelles, prévisualisations abandonnées. Les opérations locales possèdent une identité de déduplication et une version de contrat compatibles avec la file de synchronisation.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 013,021,036
- **Test positif prescrit** : Réouvrir après coupure et distinguer confirmée/pendante/rejetée/conflit/preview abandonnée.
- **Test négatif prescrit** : Réenvoyer file incompatible ou déjà confirmée : pas de doublon ni disparition sans état explicite.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-049 : un tracé commencé hors ligne est noté avec le brouillon conservé (prévisualisation en cours) — `apps/web/e2e/studio-hors-ligne.mjs`, commit 2e1564d, 2026-10-26 06:21
  - EX-049 : « Compris » retire l'état de reprise (rien d'autre ne change) — `apps/web/e2e/studio-hors-ligne.mjs`, commit 2e1564d, 2026-10-26 06:21
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - EX-049 : à la reprise, « Prévisualisation abandonnée » est nommée ; le tracé n'a eu aucun effet (brouillon : un seul pas, aucune ligne) — `apps/web/e2e/studio-hors-ligne.mjs`, commit 2e1564d, 2026-10-26 06:21
  - EX-049 : au retour du réseau, l'enveloppe refusée (B devenu lecteur) est « Rejetée », conservée avec son requestId et sa révision de base — `apps/web/e2e/studio-hors-ligne.mjs`, commit 2e1564d, 2026-10-26 06:21
  - EX-049 : rien n'est écrit au serveur pour l'enveloppe rejetée — `apps/web/e2e/studio-hors-ligne.mjs`, commit 2e1564d, 2026-10-26 06:21
  - EX-049 : après rechargement, l'enveloppe reste « Rejetée » avec le même requestId ; rien n'est renvoyé d'office — `apps/web/e2e/studio-hors-ligne.mjs`, commit 2e1564d, 2026-10-26 06:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-050

- **Libellé exact (REF-02, § w:p 563)** : EX-050 — Projection reconstructible. La scène de chaque planche contient uniquement des données dérivées : traces visibles, maillages, positions GPU, styles de sélection, poignées, boîtes englobantes et index. Les identités des objets canoniques sont conservées dans une table de correspondance stable, y compris lorsque plusieurs objets partagent un lot de rendu.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 023
- **Test positif prescrit** : Détruire cache scène/index puis reconstruire depuis modèle et vérifier table triangle→objectId.
- **Test négatif prescrit** : Batch de plusieurs objets ou objet supprimé : aucun triangle sélectionnable avec ID obsolète.
- **Preuve (contrôles positifs exécutés)** : 1
  - triangle du lot → identifiant Studio, objets sans triangle ignorés, bornes — `apps/web/src/modules/studio/vue3d/picking.test.ts`, commit 9143ae0, 2026-10-19 10:41
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - INV-008 [+] sans aucun cache, la projection se reconstruit entièrement depuis le document (premier calcul) — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-008 [−] des morceaux altérés (clé périmée, objet disparu) ne sont pas crus : ils sont remaillés depuis le document — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - C.2-02 / C.2-03 : un clic sur un mur fusionné rend son identifiant ; supprimé, jamais lui — `apps/web/src/modules/studio/vue3d/scene-rendu.test.ts`, commit 9143ae0, 2026-10-19 10:41
  - objet supprimé : jamais désigné ; l'objet derrière l'est, sinon rien — `apps/web/src/modules/studio/vue3d/picking.test.ts`, commit 9143ae0, 2026-10-19 10:41
  - désignation 3D : boîte supprimée, un clic à son endroit ne désigne jamais son identifiant (tout de suite et après remaillage) — `apps/web/e2e/studio-navigation.mjs`, commit 9143ae0, 2026-10-19 10:48
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-051

- **Libellé exact (REF-02, § w:p 564)** : EX-051 — Projection en état identifié. La projection affiche son sourceRevisionId et les domaines de données périmées. Une modification de géométrie acceptée invalide les dépendances graphiques correspondantes ; un résultat de worker calculé sur une autre révision ne peut la modifier comme s’il était courant.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 014
- **Test positif prescrit** : Après commande R13, scène affiche sourceRevisionId et données périmées puis se recalcule.
- **Test négatif prescrit** : Résultat worker R12 arrive : ne remplace pas projection courante comme si source R13.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-051 : la vue 3D affiche le sourceRevisionId serveur de son résultat (texte visible) — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
  - EX-051 : modification non enregistrée — la révision source est nommée « brouillon non enregistré » — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-051 [+] : après la commande R13, la scène affiche sa révision source et les données périmées, puis se recalcule — `apps/web/src/modules/studio/vue3d/etat-projection.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-051 : domaines périmés après une commande — seuls les domaines invalidés par l'effet passent « à recalculer » — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-052

- **Libellé exact (REF-02, § w:p 593)** : EX-052 — Broad phase. Les requêtes de sélection, accrochage et intersection filtrent les candidats par emprise spatiale à l’échelle de la vue avant de lancer les tests précis. Pour une petite scène, le balayage simple reste admissible lorsqu’il est plus efficace et correct.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 022
- **Test positif prescrit** : Sur S1 petite scène et S3 dense, mesurer filtrage emprise avant calcul précis et comparer cibles.
- **Test négatif prescrit** : Objet hors candidats mais intersectant la vue : oracle révèle omission ; balayage correct reste repli autorisé.
- **Preuve (contrôles positifs exécutés)** : 5
  - TR-EX-052 — recherches comparées à la cible DEC-13 (INP p75 ≤ 200 ms), chemin pris aujourd'hui > le p75 du chemin effectivement pris est comparé au budget ; au-delà, hors cible — `apps/web/src/modules/studio/planche2d/mesure-spatiale-analyse.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - Mesure des recherches spatiales : contrôle du script > mêmes sélections et mêmes candidats par l'index et par le parcours linéaire (S1, S2, S3, S4 à 100 et 1 000 primitives) — `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts`, commit 44c6ef4, 2026-10-25 16:08
  - Mesure des recherches spatiales : contrôle du script > TEST-022 — S1–S3 : même repère résolu (point, genre, objet, priorité) par l'index et le parcours linéaire — `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts`, commit 44c6ef4, 2026-10-25 16:08
  - TR-EX-052 : chaque recherche comparée à la cible DEC-13 par le chemin pris (p75) — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
  - C.1-01 : mesure complète dans le navigateur — 18 corpus (S1–S5, S7 × 100 / 10000 / 100000), 0 divergence index / linéaire, rapport archivé avec machine, navigateur et commit — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-053

- **Libellé exact (REF-02, § w:p 594)** : EX-053 — Narrow phase. Les primitives retenues sont testées avec les règles géométriques de référence : extrémité, milieu, intersection, centre, tangente, perpendiculaire, point proche, ortho, parallèle, priorités et tolérances. Une accélération ne change pas les règles de classement et de départage.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 022
- **Test positif prescrit** : Tester extrémité/milieu/intersection/centre/tangente/perpendiculaire/ortho/parallèle avec priorités.
- **Test négatif prescrit** : Permutation index ou égalité de distances : même règle de départage/tolérance qu'oracle.
- **Preuve (contrôles positifs exécutés)** : 3
  - depuis le dernier point, le pointeur proche de la parallèle à un segment éloigné s'accroche sur cette droite (point exact, ligne guide) — `apps/web/src/modules/studio/planche2d/accrochage/parallele.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - priorités : un point exact (extrémité) l'emporte sur la parallèle ; la parallèle (rang relatif) l'emporte sur le plus proche ; départage stable sous permutation — `apps/web/src/modules/studio/planche2d/accrochage/parallele.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - bascule propre (règle d'or) : commande « Accrocher en parallèle », Ctrl+Maj+F6, icône propre, barre Accrochage — `apps/web/src/modules/studio/planche2d/accrochage/parallele.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - tolérance : au-delà, aucune parallèle ; sans dernier point, aucune ; mode coupé, aucune — `apps/web/src/modules/studio/planche2d/accrochage/parallele.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-054

- **Libellé exact (REF-02, § w:p 595)** : EX-054 — Maintien. L’index est cohérent avec la révision source et les états de calques, références et sélections autorisées. Insert/remove/update ciblés sont privilégiés si prouvés efficaces ; reconstruction en worker possible pour grands changements. La requête temps réel peut rester sur le fil principal si elle respecte les mesures de latence.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 022,023
- **Test positif prescrit** : Insérer/modifier/supprimer objet et changer calque/référence puis comparer index à reconstruction.
- **Test négatif prescrit** : Objet caché/interdit/supprimé encore indexé ou résultat d'index ancienne révision : ne pas publier comme courant.
- **Preuve (contrôles positifs exécutés)** : 3
  - insertions, suppressions, mises à jour, remplacements et synchronisations (graines 1 à 6, 600 mutations chacune) — `apps/web/src/modules/studio/planche2d/index-incremental.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - sélection par rectangle (fenêtre et capture) sur 60 révisions : mêmes identifiants, index synchronisé sans reconstruction — `apps/web/src/modules/studio/planche2d/index-incremental.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - candidats d'accrochage sur 60 révisions : mêmes candidats que l'index linéaire, formes changées seules réindexées — `apps/web/src/modules/studio/planche2d/index-incremental.test.ts`, commit 5edae3e, 2026-10-25 20:16
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - sélection : index de la révision A interrogé sur B = reconstruction de B ; supprimé, masqué, verrouillé, déplacé jamais rendus — `apps/web/src/modules/studio/planche2d/index-maintien.preuves-c.test.ts`, commit bf775d9, 2026-10-25 21:49
  - accrochage : l'index suivi depuis A rend sur B les candidats de la reconstruction ; aucun point de l'objet supprimé ni de l'ancienne position — `apps/web/src/modules/studio/planche2d/index-maintien.preuves-c.test.ts`, commit bf775d9, 2026-10-25 21:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-055

- **Libellé exact (REF-02, § w:p 616)** : EX-055 — Fidélité. Le renderer 2D reproduit lignes, arcs, splines, cercles, contours, hachures, cotations, légendes, textes, symboles, calques, transparences, sélection et aperçu, avec un comportement identique des coordonnées et accrochages.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C/F option
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/rendu.tsx`, `apps/web/src/modules/atelier/nouveau/planche/vue-planche.ts`
- **Décisions** : DEC-08,DEC-10,DEC-17 · **Scénarios** : 025
- **Test positif prescrit** : Rendre scène avec ligne/arc/spline/hachure/cote/texte/calques puis comparer export et coordonnées.
- **Test négatif prescrit** : Renderer alternatif omet texte/hachure ou modifie accrochage : non-régression échoue même si plus rapide.
- **Preuve (contrôles positifs exécutés)** : 8
  - TR-EX-055 — graphismes du document 2D (spline, hachure, symbole, transparence) > création par commande, document relu à l'identique ; opacité 1 non stockée (opaque = absente) — `packages/atelier-model/src/studio/graphismes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-055 — graphismes du document 2D (spline, hachure, symbole, transparence) > géométrie : Bézier exacte aux extrémités, découpe déclarée ; traits de hachure dans le contour, ancrés sur l'origine, … — `packages/atelier-model/src/studio/graphismes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-055 — graphismes du document 2D (spline, hachure, symbole, transparence) > export SVG : courbe de Bézier `C` exacte, traits de hachure, symbole posé, opacité ; DXF : polyligne découpée, transpa… — `packages/atelier-model/src/studio/graphismes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-055 — splines, hachures, symboles et transparences : rendu SVG et comparaison Canvas / GPU > le contrôle porte : un moteur qui ignore la transparence, omet une spline ou un trait de hachure est… — `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-055 — splines, hachures, symboles et transparences : rendu SVG et comparaison Canvas / GPU > GPU : splines découpées au pas déclaré, opacité portée par segment, textes non tracés et comptés — `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - Graphismes et système de projet : saisie > spline, hachure et symbole saisis → commande studio.graphisme.creer appliquée par le brouillon ; opacité en pour cent — `apps/web/src/modules/studio/graphismes/graphismes-ui.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - … et 2 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - TR-EX-055 — graphismes du document 2D (spline, hachure, symbole, transparence) > refus explicites : spline sans 3n + 1 points, contour d'aire nulle, espacement nul ou trop fin, opacité hors ]0 ; 1], … — `packages/atelier-model/src/studio/graphismes.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-055 — splines, hachures, symboles et transparences : rendu SVG et comparaison Canvas / GPU > rendu SVG du modèle : chaque famille présente (Bézier `C`, traits de hachure, symboles, opacité), le… — `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-055 — splines, hachures, symboles et transparences : rendu SVG et comparaison Canvas / GPU > Canvas = SVG : mêmes primitives, mêmes positions, même opacité (aucun trait manquant ni en trop, éca… — `apps/web/src/modules/studio/planche2d/rendus/graphismes-rendu.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - Graphismes et système de projet : saisie > refus dits : points illisibles, champs vides, opacité hors bornes, géométrie refusée par le modèle — `apps/web/src/modules/studio/graphismes/graphismes-ui.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-055 : scène de fidélité dans le navigateur — Canvas = SVG (aucun trait manquant ni en trop, Bézier et opacités comprises), GPU découpé avec opacités 0,3 / 0,5 / 0,75 / 1 — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-056

- **Libellé exact (REF-02, § w:p 620)** : EX-056 — Réutilisation contrôlée. La cible conserve par défaut les capacités fonctionnelles utiles déjà observées (rendu à la demande, batching, WebGL2, WebGPU optionnel, machines de Planche), sous réserve d’audit de conformité. Aucun nouveau moteur 3D n’est présumé nécessaire.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C/F option
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/rendu.tsx`, `apps/web/src/modules/atelier/nouveau/planche/vue-planche.ts`
- **Décisions** : DEC-08,DEC-10,DEC-17 · **Scénarios** : 023,025
- **Test positif prescrit** : Qualifier rendu à la demande/batching/WebGL2/repli WebGPU existants sur corpus.
- **Test négatif prescrit** : Remplacer moteur sans gain/conformité prouvés : décision bloquée, pas réécriture automatique.
- **Preuve (contrôles positifs exécutés)** : 4
  - TR-EX-056 — moteur de la vue 3D : WebGL2 par défaut, repli WebGPU → WebGL2 déclaré > WebGPU demandé sans navigator.gpu, sans adaptateur ou en erreur : repli WebGL2 avec la raison — `apps/web/src/modules/studio/vue3d/moteur-3d.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-056 — moteur de la vue 3D : WebGL2 par défaut, repli WebGPU → WebGL2 déclaré > qualifié sur appareil réel : retenu seulement si la vue sait le rendre (la vue Studio rend en WebGL2 : repli décla… — `apps/web/src/modules/studio/vue3d/moteur-3d.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-056 / F.1-01 — blocage d'un remplacement de moteur sans preuve > moteur par défaut : SVG (planche, DEC-08) et WebGL2 (vue 3D) ; tout défaut différent de la référence sans rapport qualifiant fai… — `packages/atelier-model/src/studio/accelerations.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-056 : WebGPU demandé → repli WebGL2 déclaré, avec la raison constatée dans ce navigateur — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - TR-EX-056 — moteur de la vue 3D : WebGL2 par défaut, repli WebGPU → WebGL2 déclaré > WebGL2 demandé (défaut) : WebGL2, aucun repli — `apps/web/src/modules/studio/vue3d/moteur-3d.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-056 — moteur de la vue 3D : WebGL2 par défaut, repli WebGPU → WebGL2 déclaré > WebGPU disponible mais non qualifié (aucun rapport, ou mesure en rendu logiciel) : repli par la règle F.1-01 — `apps/web/src/modules/studio/vue3d/moteur-3d.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-056 / F.1-01 — blocage d'un remplacement de moteur sans preuve > le contrôle porte : un défaut Canvas ou WebGPU sans rapport (ou avec un rapport qui ne qualifie pas) est refusé ; avec un rappor… — `packages/atelier-model/src/studio/accelerations.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-056 : rendu à la demande sur S4 — aucune trame pendant 1,5 s de repos, des trames pendant l'orbite, aucune après — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-057

- **Libellé exact (REF-02, § w:p 631)** : EX-057 — Dégradation sûre. En cas de surcharge, réduire d’abord ombres, effets, anti-crénelage et résolution de présentation. Ne jamais désactiver silencieusement un accrochage indispensable, modifier l’objet enregistré ou assouplir une tolérance géométrique métier pour augmenter le FPS.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C/F option
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/rendu.tsx`, `apps/web/src/modules/atelier/nouveau/planche/vue-planche.ts`
- **Décisions** : DEC-08,DEC-10,DEC-17 · **Scénarios** : 022,025
- **Test positif prescrit** : Sous charge réduire ombres/résolution et comparer coordonnées/cotes/snapping inchangés.
- **Test négatif prescrit** : Dégradation désactive accrochage ou assouplit tolérance métier : défaut éliminatoire.
- **Preuve (contrôles positifs exécutés)** : 4
  - ombres d'abord, puis résolution (75 %, 50 %), puis anti-crénelage ; un palier par fenêtre — `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - candidats, point accroché et tolérance rendus identiques avant, pendant et après la charge (paliers 0 à 4) — `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - TR-EX-057 : sous charge simulée (40 ms par trame, budget 16,7 ms), résolution 75 %, puis 50 %, puis anti-crénelage coupé — un palier par fenêtre de 8 trames — `apps/web/e2e/studio-rendu.mjs`, commit 5edae3e, 2026-10-25 20:25
  - TR-EX-057 : charge ôtée, retour palier par palier (2, 1, 0) jusqu'à la qualité complète ; indicateur retiré — `apps/web/e2e/studio-rendu.mjs`, commit 5edae3e, 2026-10-25 20:25
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - chaque palier ne porte que ombres / résolution / anti-crénelage (aucun accrochage, aucune tolérance, aucun objet) — `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - TR-EX-057 : sous charge, même désignation au même point (même solide qu'au repos), mêmes solides et volumes, aucune commande, même révision serveur — `apps/web/e2e/studio-rendu.mjs`, commit 5edae3e, 2026-10-25 20:25
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-058

- **Libellé exact (REF-02, § w:p 632)** : EX-058 — Transparence des previews. Un aperçu approximatif (ex. offset ou booléen simplifié) doit rester identifié comme provisoire. La géométrie exacte est calculée et validée avant engagement ; le décalage entre preview et résultat final, s’il dépasse la tolérance, doit être expliqué ou la commande refusée.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C/F option
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/rendu.tsx`, `apps/web/src/modules/atelier/nouveau/planche/vue-planche.ts`
- **Décisions** : DEC-08,DEC-10,DEC-17 · **Scénarios** : 005,008
- **Test positif prescrit** : Afficher preview approximative explicitement puis résultat exact validé dans tolérance.
- **Test négatif prescrit** : Écart preview/exact supérieur au contrat : explication/refus, jamais sauvegarde approximative silencieuse.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-EX-058 : aperçu marqué « provisoire, jamais engagé », estimé 12 m³, confirmé par le résultat exact (12 m³) — `apps/web/e2e/studio-exact.mjs`, commit d87a82e, 2026-10-25 21:21
  - TR-EX-058 : boîte tournée de 45° — aperçu provisoire refusé (écart au-delà de la tolérance, expliqué), résultat exact seul engageable — `apps/web/e2e/studio-exact.mjs`, commit d87a82e, 2026-10-25 21:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-059

- **Libellé exact (REF-02, § w:p 636)** : EX-059 — Isolation du calcul lourd. Le fil principal assure événements, retours immédiats et rendu. Les opérations susceptibles de bloquer durablement l’interaction (géométrie exacte, reconstruction d’index volumineux, tessellation massive, export) sont candidates à un worker ou au serveur, à choisir sur mesure.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : D
- **Contrat** : IF-003,IF-007 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts`
- **Décisions** : DEC-11,DEC-13 · **Scénarios** : 015,037
- **Test positif prescrit** : Soumettre booléen lourd avec mesures et observer interaction disponible via worker/serveur retenu.
- **Test négatif prescrit** : Calcul coûteux bloque durablement UI : garder échec/performance visible et revoir placement après mesure.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : En cours · **Tests** : Non exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Point (1) fait : booléen exact lourd (union de deux prismes en étoile de 320 sommets, 2,2–3,8 s dans le Worker OCCT) mesuré : trame max ≈ 50–67 ms, 14–20 interactions pendant le calcul, max 80–112 ms (< 200 ms) ; contre-épreuve « bloque » (trame 3,3 s, interaction 3,2 s). Reste EXTERNE : la même mesure sur appareil réel (aucun appareil physique ; RECETTE-APPAREILS.md §5).

### TR-EX-060

- **Libellé exact (REF-02, § w:p 637)** : EX-060 — Ordonnanceur commun. Chaque tâche possède jobId, domaine, priorité, révision source, empreinte d’entrée, limite de concurrence, état, stratégie d’annulation, journal d’erreur et pointeur de résultat. L’ordonnanceur ne doit pas supposer qu’un worker par cœur logique est optimal.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : D
- **Contrat** : IF-003,IF-007 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts`
- **Décisions** : DEC-11,DEC-13 · **Scénarios** : 014,015,037
- **Test positif prescrit** : Soumettre deux jobs avec identités/priorités/empreintes/révisions/quota et suivre états.
- **Test négatif prescrit** : Saturation/concurrence excessive : quota/attente/erreur explicites, pas un worker par cœur imposé sans mesure.
- **Preuve (contrôles positifs exécutés)** : 2
  - l'interactive passe avant le fond en file ; un emplacement reste toujours libre pour l'interactive — `apps/web/src/modules/studio/taches/ordonnanceur.test.ts`, commit 98748a0, 2026-10-19 08:07
  - révision de session : stable pour un même document, croissante pour un nouveau ; hachage des paramètres stable — `apps/web/src/modules/studio/taches/ordonnanceur.test.ts`, commit 98748a0, 2026-10-19 08:07
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - même clé, même empreinte : la même poignée, aucun calcul en double — `apps/web/src/modules/studio/taches/ordonnanceur.test.ts`, commit 98748a0, 2026-10-19 08:07
  - concurrence bornée : jamais plus d'exécutions que d'emplacements ; emplacements réutilisés — `apps/web/src/modules/studio/taches/ordonnanceur.test.ts`, commit 98748a0, 2026-10-19 08:07
  - deux plantages : échec explicite (jamais en suspens), message en français ; les autres tâches continuent — `apps/web/src/modules/studio/taches/ordonnanceur.test.ts`, commit 98748a0, 2026-10-19 08:07
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-061

- **Libellé exact (REF-02, § w:p 665)** : EX-061 — Échec worker. L’échec rejette les tâches affectées, libère le worker défaillant, préserve le modèle et propose la relance sous contrôle. Un mécanisme de recréation du worker spécialisé doit être spécifié et testé ; les requêtes pending ne restent pas bloquées indéfiniment.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : D
- **Contrat** : IF-003,IF-007 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts`
- **Décisions** : DEC-11,DEC-13 · **Scénarios** : 015
- **Test positif prescrit** : Forcer crash worker puis résoudre pending, recréer et relancer sous contrôle sans doublons.
- **Test négatif prescrit** : Worker disparaît en calcul : pas de promesse pending indéfinie ni modèle partiellement muté.
- **Preuve (contrôles positifs exécutés)** : 3
  - EX-061 [+] relance sous contrôle (nouvelle soumission) : Worker recréé, un seul résultat remis, calculé sur le document intact — `apps/web/src/modules/studio/taches/pool-studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
  - plantage du Worker : Worker relancé, la tâche reprise une fois aboutit ; résultat remis une seule fois — `apps/web/src/modules/studio/taches/pool-studio.test.ts`, commit 98748a0, 2026-10-19 08:07
  - deux plantages : échec explicite ; la tâche suivante repart sur un Worker neuf — `apps/web/src/modules/studio/taches/pool-studio.test.ts`, commit 98748a0, 2026-10-19 08:07
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-061 [−] deux disparitions en plein calcul : issue « failed / plantage » résolue (jamais en suspens), aucun résultat remis, document canonique identique — `apps/web/src/modules/studio/taches/pool-studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-062

- **Libellé exact (REF-02, § w:p 666)** : EX-062 — Mémoire WASM. Suivre taille compressée transférée, instance compilée, allocations WASM et mémoire résidente après traitement ; conserver un noyau chargé tant que le coût de maintien est justifié. L’initialisation simultanée de plusieurs OCCT requiert une preuve de gain et de mémoire acceptable.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : D
- **Contrat** : IF-003,IF-007 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts`
- **Décisions** : DEC-11,DEC-13 · **Scénarios** : 037
- **Test positif prescrit** : Ouvrir/fermer outil exact 50 fois, suivre transfert/allocations/résiduel avec instance justifiée.
- **Test négatif prescrit** : Second OCCT simultané ou croissance mémoire : pas de conformité sans courbe/limite décidée.
- **Preuve (contrôles positifs exécutés)** : 2
  - TR-EX-062 : allocations WASM — mémoire linéaire du noyau (WebAssembly.Memory) relevée après le calcul, multiple de 64 Kio, enregistrée en PERF-07 — `apps/web/e2e/studio-exact.mjs`, commit 085a8f3, 2026-10-26 04:44
  - TR-EX-062 : après les cycles, le noyau calcule toujours (même instance) — `apps/web/e2e/studio-exact.mjs`, commit 085a8f3, 2026-10-26 04:44
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - TR-EX-062 : allocations WebAssembly mesurées — mémoire linéaire du noyau relevée après chaque calcul, croissante, jamais nulle — `packages/geometry-exact/src/index.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-063

- **Libellé exact (REF-02, § w:p 667)** : EX-063 — Transfert d’objets. Les grands tableaux typés peuvent être transférés sans copie seulement lorsque le protocole établit la propriété du tampon et sa durée de vie. Les messages applicatifs restent validés même s’ils proviennent d’un worker « interne ».
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : D
- **Contrat** : IF-003,IF-007 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts`
- **Décisions** : DEC-11,DEC-13 · **Scénarios** : 015
- **Test positif prescrit** : Transférer buffer selon contrat de propriété puis valider message reçu.
- **Test négatif prescrit** : Réutiliser tampon détaché ou message worker forgé : validation refuse, pas de corruption canonique.
- **Preuve (contrôles positifs exécutés)** : 1
  - cas positif : le vrai Worker rend le maillage 3D et le métré, acceptés par la validation et identiques au calcul direct — `apps/web/src/modules/studio/workers/validation-messages.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - chaque traitement du Worker de Studio a son validateur, et une nature sans validateur est refusée — `apps/web/src/modules/studio/workers/validation-messages.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - message bien formé mais forgé : maillage dont un triangle vise un sommet absent → demande rejetée « invalide », Worker arrêté, rien rendu — `apps/web/src/modules/studio/workers/validation-messages.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - lecture DXF forgée : une commande d'un outil hors registre (ou une commande sans paramètres) est refusée, jamais appliquée — `apps/web/src/modules/studio/workers/validation-messages.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - enveloppe forgée (deux réponses, identifiant non entier, progression hors forme) : refusée comme illisible, Worker arrêté — `apps/web/src/modules/studio/workers/validation-messages.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - tampon déjà transféré : sa réutilisation est refusée (propriété du tampon établie par le protocole) — `apps/web/src/modules/studio/workers/validation-messages.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-064

- **Libellé exact (REF-02, § w:p 673)** : EX-064 — Identité BIM. Un objet architectural possède type, paramètres, niveau, hôtes, relations, propriétés et provenance. Les paramètres de conception (épaisseur, implantation), les propriétés techniques (composition, performances) et les styles de représentation (couleur, texture) sont trois catégories indépendantes.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 026
- **Test positif prescrit** : Modifier couleur puis épaisseur et comparer catégories style/paramètre/composition séparées.
- **Test négatif prescrit** : Style matériau apparent tente de changer composition technique : pas d'effet implicite.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-064 [+] changer la couleur puis l'épaisseur : chaque changement ne touche que sa catégorie — `packages/atelier-model/src/studio/identite-bim.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-064 [−] une apparence « verre » ne change pas la composition technique déclarée, et retirer le style laisse paramètres et propriétés — `packages/atelier-model/src/studio/identite-bim.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-065

- **Libellé exact (REF-02, § w:p 674)** : EX-065 — Exigence vs mesure. Une exigence versionnée (ex. surface programmée de 28 m²) ne change pas lorsque la surface modélisée devient 26 m² ; l’interface présente explicitement l’écart. La modification d’exigence passe par sa propre commande, avec permission et provenance.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 027
- **Test positif prescrit** : Exigence 28m² et dessin 26m² : afficher écart -2m² et conserver exigence versionnée.
- **Test négatif prescrit** : Modifier surface dessinée : ne réécrit pas cible à 26 ; commande exigence sans droit refusée.
- **Preuve (contrôles positifs exécutés)** : 2
  - TEST-027 : exigence identique après la modification du dessin (même version, mêmes valeurs) — `apps/web/e2e/studio-exigences.mjs`, commit 085a8f3, 2026-10-26 04:38
  - TEST-027 : écart calculé et visible (mesure 11,6 m³ contre ≤ 10 m³, +1,6) — `apps/web/e2e/studio-exigences.mjs`, commit 085a8f3, 2026-10-26 04:38
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - TEST-027 [+] modifier le rectangle dessiné (2 × 1 → 3 × 1) fait passer l'écart signé de 0 à +1 m² ; l'exigence n'est pas réécrite — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit 44c6ef4, 2026-10-25 16:08
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-066

- **Libellé exact (REF-02, § w:p 676)** : EX-066 — Sources partenaires. Chaque modèle externe conserve auteur, discipline, format, version, unité, transformation et état d’acceptation. Le remplacement d’une référence suit réception → vérification → comparaison → acceptation/rejet, et n’efface pas la référence d’une publication passée.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 028,030
- **Test positif prescrit** : Recevoir modèle partenaire version2, comparer/acceptation explicite et conserver publication version1.
- **Test négatif prescrit** : Rafraîchissement externe non accepté : pas de remplacement silencieux d'une référence publiée.
- **Preuve (contrôles positifs exécutés)** : 3
  - accepter : rôle habilité, comparaison faite avec la révision courante, unité lue — `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - Modèle externe : reçu, relu et comparé par le serveur — identique à la révision qui l’a importé ; transformation non déclarée signalée — `apps/web/e2e/studio-echanges.mjs`, commit 5edae3e, 2026-10-25 20:26
  - Modèle externe : accepté par le propriétaire, passage journalisé (recevoir, accepter) — `apps/web/e2e/studio-echanges.mjs`, commit 5edae3e, 2026-10-25 20:26
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - métadonnées déclarées : auteur, discipline, format, version, unité, transformation ; champ inconnu refusé — `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - lecture dans un document à part : la variante n'est jamais modifiée ; unité déclarée comparée à l'unité lue — `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - Modèle externe : recevoir et accepter ne modifient pas la variante — `apps/web/e2e/studio-echanges.mjs`, commit 5edae3e, 2026-10-25 20:26
  - Modèle externe : refus explicite avec motif, journalisé — `apps/web/e2e/studio-echanges.mjs`, commit 5edae3e, 2026-10-25 20:26
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-067

- **Libellé exact (REF-02, § w:p 677)** : EX-067 — Éditabilité explicite. Un modèle consulté, fédéré ou utilisé comme référence n’est pas déclaré natif et paramétrique sans conversion validée. Les éléments ignorés, simplifiés ou non convertibles sont signalés.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 028
- **Test positif prescrit** : Importer IFC de consultation et afficher statut représentation/rapport des pertes.
- **Test négatif prescrit** : Proxy importé présenté paramétrique natif ou entité ignorée masquée : défaut de couverture déclaré.
- **Preuve (contrôles positifs exécutés)** : 6
  - état non natif : espace, poteau répété et porte isolée conservés (type, GlobalId, nom, raison, empreinte lue) — `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - non éditables comme un objet natif : déplacer, modifier, supprimer, extruder les refusent — `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - accepter : rôle habilité, comparaison faite avec la révision courante, unité lue — `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - Importer IFC : rapport de pertes et éléments non natifs à l’aperçu (unité lue, 5 objets natifs, 3 non natifs, pertes par type) — `apps/web/e2e/studio-echanges.mjs`, commit 5edae3e, 2026-10-25 20:26
  - Importer IFC : état « non natif » explicite dans « Éléments du dessin » (type, GlobalId, raison) — `apps/web/e2e/studio-echanges.mjs`, commit 5edae3e, 2026-10-25 20:26
  - élément non natif non éditable : le serveur refuse de le déplacer comme un objet natif — `apps/web/e2e/studio-echanges.mjs`, commit 5edae3e, 2026-10-25 20:26
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - rapport de pertes : jeux de propriétés, matériaux, site et bâtiment comptés par type, jamais écartés en silence — `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - lecture dans un document à part : la variante n'est jamais modifiée ; unité déclarée comparée à l'unité lue — `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts`, commit 5edae3e, 2026-10-25 20:16
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-068

- **Libellé exact (REF-02, § w:p 695)** : EX-068 — Conclusion normative. Les valeurs de contrôle sont conforme, non conforme, non testé, non applicable justifié. Le statut d’exécution (en attente, échec technique) ne doit jamais être interprété comme conforme.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 029
- **Test positif prescrit** : Contrôle exécuté donne conforme/non conforme/non testé/non applicable motivé.
- **Test négatif prescrit** : Timeout ou exécution en attente : ne devient jamais conforme.
- **Preuve (contrôles positifs exécutés)** : 4
  - EX-068 [+] un contrôle exécuté conclut conforme, non conforme, non testé ou non applicable justifié — `packages/atelier-model/src/studio/conclusions-controle.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-068 [+] la justification « non applicable » est vérifiable : exigence de la version examinée, motif, auteur, date — `packages/atelier-model/src/studio/conclusions-controle.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-068 : non applicable justifié enregistré (motif, auteur et version posés par le serveur), le reste conclu normalement — `apps/web/e2e/studio-exigences.mjs`, commit 085a8f3, 2026-10-26 04:38
  - EX-068 : conclusion normative et justification affichées — `apps/web/e2e/studio-exigences.mjs`, commit 085a8f3, 2026-10-26 04:38
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-068 [−] en attente, délai dépassé ou échec technique : jamais conforme, aucune conclusion — `packages/atelier-model/src/studio/conclusions-controle.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-068 [+] [−] API : contrôle conclu conforme / non conforme / non applicable justifié (justification vérifiée, auteur et version du serveur) ; justification invalide refusée — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - EX-068 : justification visant une exigence absente de la version refusée (400) — `apps/web/e2e/studio-exigences.mjs`, commit 085a8f3, 2026-10-26 04:38
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-069

- **Libellé exact (REF-02, § w:p 696)** : EX-069 — Observation unique. Une anomalie issue d’un contrôle possède un issueId réutilisé par le suivi documentaire. Le réexamen d’une même anomalie sur une nouvelle révision rapproche les observations existantes selon une règle explicite, pas par création systématique de doublons.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 029
- **Test positif prescrit** : Relancer contrôle même règle/objet sur nouvelle révision : observation rapprochée par identité.
- **Test négatif prescrit** : Deux domaines créent systématiquement deux observations pour même constat : détecter doublon.
- **Preuve (contrôles positifs exécutés)** : 3
  - EX-086 [+] le contrôle de R(n+1) rapproche chaque observation par identité, source et règle et consigne un statut de suivi — `apps/api/src/routes/studio-observations-rapprochement.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - E.2-01 une seule identité : l'observation est le commentaire d'origine de même identifiant — `apps/web/e2e/studio-observations.mjs`, commit bf775d9, 2026-10-25 22:05
  - E.2-01 recherche par domaine (lecteur) : la même identité, une seule — `apps/web/e2e/studio-observations.mjs`, commit bf775d9, 2026-10-25 22:05
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - E.2-01 un élément déjà suivi n'ouvre pas une seconde observation (409 deja_suivie, identifiant réemployé) — `apps/web/e2e/studio-observations.mjs`, commit bf775d9, 2026-10-25 22:05
  - EX-069 [−] même constat ouvert depuis un second domaine (objet) : doublon détecté (409 deja_suivie, identifiant de l'observation existante), aucune seconde observation — `apps/web/e2e/studio-observations.mjs`, commit bf775d9, 2026-10-25 22:05
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-070

- **Libellé exact (REF-02, § w:p 697)** : EX-070 — Clôture. La déclaration de correction par un concepteur ne clôt pas à elle seule une observation. Un recontrôle par le rôle autorisé produit une conclusion liée à une nouvelle révision. La suppression de l’objet problématique ne prouve pas à elle seule la résolution.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 029
- **Test positif prescrit** : Correction suivie d'un recontrôle autorisé sur R13 permet clôture documentée.
- **Test négatif prescrit** : Concepteur déclare corrigé ou supprime objet : pas de clôture automatique sans règle/contrôle.
- **Preuve (contrôles positifs exécutés)** : 3
  - E.2-04 le responsable déclare la correction contre r2 (≥ révision du contrôle) — `apps/web/e2e/studio-observations.mjs`, commit 4643cfa, 2026-10-19 12:43
  - E.2-04 l'auteur (propriétaire) recontrôle contre r3 — `apps/web/e2e/studio-observations.mjs`, commit 4643cfa, 2026-10-19 12:43
  - E.2-04 / E.2-05 le propriétaire clôt : décision de clôture consignée (motif, rôle, révision recontrôlée) — `apps/web/e2e/studio-observations.mjs`, commit 4643cfa, 2026-10-19 12:43
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-086 [−] objet disparu de la nouvelle révision : observation marquée « objet-disparu », jamais close ni modifiée — `apps/api/src/routes/studio-observations-rapprochement.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - E.2-04 clôturer une observation ouverte → 409 invalid_transition — `apps/web/e2e/studio-observations.mjs`, commit 4643cfa, 2026-10-19 12:43
  - E.2-04 le recontrôle porte sur la correction ou une révision postérieure (409 revision_anterieure) — `apps/web/e2e/studio-observations.mjs`, commit 4643cfa, 2026-10-19 12:43
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-071

- **Libellé exact (REF-02, § w:p 717)** : EX-071 — Provenance des médias. Les rendus conservent modèle/variante/révision source, caméra, paramètres, auteur, date et empreintes si disponibles. Les traitements IA ajoutent service/fournisseur, version si connue, sources envoyées, restrictions de droits, consentement ou autorisation de transfert lorsque requis, coûts/quotas et résultat.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/F option
- **Contrat** : IF-003,IF-009 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-15,DEC-17 · **Scénarios** : 032
- **Test positif prescrit** : Rendu conserve révision/caméra/auteur/date/provenance et IA optionnelle conserve fournisseur/sources/coûts.
- **Test négatif prescrit** : Appel IA sans autorisation de transfert ou version fournisseur inconnue : refus ou inconnue déclarée, pas provenance inventée.
- **Preuve (contrôles positifs exécutés)** : 3
  - TR-EX-071 [+] la provenance porte révision, caméra, paramètres, auteur, date, empreintes ; l'IA externe y ajoute fournisseur, version « inconnue », sources envoyées, consentement, coûts et quotas — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-094 [+] TR-EX-071 [+] politique, consentement au coût déclaré et clé fournie : un seul appel au double, provenance avec fournisseur, version « inconnue », source envoyée, consentement, coûts, q… — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
  - EX-071 [+] le rendu conserve son auteur, ses paramètres et l'empreinte du document quand elle est disponible — `packages/atelier-model/src/studio/scenes/scenes.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-EX-071 [−] appel externe sans autorisation de transfert ou sans coût : refusé, jamais une provenance complétée — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-071 [−] sans auteur, le rendu est refusé (jamais d'auteur inventé) ; empreinte ou paramètres illisibles refusés — `packages/atelier-model/src/studio/scenes/scenes.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-072

- **Libellé exact (REF-02, § w:p 718)** : EX-072 — Reproductibilité honnête. Conserver les paramètres et une image historique ne garantit pas la reproduction identique d’une génération IA. Les inconnues du fournisseur sont signalées comme telles.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/F option
- **Contrat** : IF-003,IF-009 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-15,DEC-17 · **Scénarios** : 032
- **Test positif prescrit** : Archiver image et paramètres en indiquant limites de reproductibilité fournisseur.
- **Test négatif prescrit** : Réexécuter IA stochastique : ne promettre identité pixel ni fidélité géométrique non prouvées.
- **Preuve (contrôles positifs exécutés)** : 1
  - TR-EX-072 [+] rejeu du même requestId : la même illustration (replayed) ; nouvelle génération locale avec les mêmes paramètres : mêmes pixels, déclarés reproductibles — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-EX-072 [+] / [−] paramètres archivés ; seule l'illustration locale promet les mêmes pixels, l'IA externe déclare ses inconnues et ne promet ni identité ni fidélité géométrique — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-072 [−] même requestId pour un autre contenu ou un autre auteur : 409 request_conflict, rien n'est réécrit — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-073

- **Libellé exact (REF-02, § w:p 719)** : EX-073 — Séparation visuel/technique. Les quantités, performances et règles métier se calculent sur les objets et données de référence, jamais sur les pixels d’une illustration. Un matériau apparent ne change pas automatiquement la composition constructive.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/F option
- **Contrat** : IF-003,IF-009 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`
- **Décisions** : DEC-15,DEC-17 · **Scénarios** : 026,032
- **Test positif prescrit** : Changer matériau visuel ou générer illustration puis recalculer métrés sur modèle source.
- **Test négatif prescrit** : Mesure de surface extraite des pixels remplace quantité canonique : interdire ce chemin.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-073 [−] garde construite : un module de rendu ou une lecture de pixels dans le graphe serait détecté — `apps/web/src/modules/studio/frontieres.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
  - EX-073 [−] dépôt réel : le graphe des quantités, des exigences et de leurs panneaux n'atteint ni rendu, ni scène, ni lecture de pixels — `apps/web/src/modules/studio/frontieres.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-074

- **Libellé exact (REF-02, § w:p 725)** : EX-074 — Chaîne documentaire. Vue → Feuille → Dossier → Publication constitue le cycle des livrables. Une Planche est un environnement de travail ; une feuille est un assemblage de représentations et annotations à une échelle et un format déclarés.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 001,038
- **Test positif prescrit** : Composer vue→feuille à échelle→dossier→publication en conservant rôles distincts.
- **Test négatif prescrit** : Planche d'édition seule présentée comme feuille publiée : recette refuse livraison.
- **Preuve (contrôles positifs exécutés)** : 3
  - EX-074 [+] un dossier assemblé de feuilles se publie : rôles distincts (vue, feuille à format et échelle déclarés, dossier), empreintes propres — `packages/atelier-model/src/studio/chaine-documentaire.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-074 [+] contenu « dossier-conception » : PDF et JSON du dossier, pièces ordonnées avec origine, présentation et sources distinctes — `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - EX-074 [+] API : un dossier de conception se publie (revue, approbation, diffusion) ; paquet PDF + JSON, manifeste avec dossier et pièces — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-074 [−] une planche d'édition présentée comme feuille publiée est refusée ; une feuille sans échelle aussi — `packages/atelier-model/src/studio/chaine-documentaire.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-074 [−] un dossier sans contenu « dossier-conception » (ou l'inverse) est refusé — `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-075

- **Libellé exact (REF-02, § w:p 726)** : EX-075 — Sources des vues. Chaque vue conserve les révisions sources, niveau/repère, cadrage, échelle de présentation, visibilité, styles et annotations propres. Une vue dérivée du 3D peut devenir périmée après modification du modèle ; ses annotations propres ne deviennent pas des paramètres de l’objet source.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 030
- **Test positif prescrit** : Créer coupe R12 avec cadrage/styles/annotations puis changer modèle R13 et marquer vue périmée.
- **Test négatif prescrit** : Annotation de coupe modifiée : ne devient pas paramètre autoritaire du mur.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-075 [+] conserve révision source, niveau et repère, cadrage, échelle, visibilité, styles et annotations propres — `packages/atelier-model/src/studio/vues-coupe.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-075 : vue rebasée explicitement (définition conservée) — `apps/web/e2e/studio-pub.mjs`, commit 085a8f3, 2026-10-26 04:39
- **Contre-preuve (contrôles négatifs exécutés)** : 6
  - EX-075 [+] R12 → R13 : la vue dérivée devient périmée ; rebasée, elle garde cadrage, styles et annotations — `packages/atelier-model/src/studio/vues-coupe.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-075 [−] annotation de coupe modifiée : ne devient pas un paramètre de l'objet source, le document et la section ne changent pas — `packages/atelier-model/src/studio/vues-coupe.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-075 [−] définition incomplète refusée : cadrage vide, échelle libre, repère non déclaré, style inconnu — `packages/atelier-model/src/studio/vues-coupe.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-075 [+] API : la vue enregistrée garde révision, niveau, cadrage, échelle, styles et annotations ; périmée après une nouvelle révision, rebasée explicitement — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - EX-075 [−] API : modifier une annotation de la vue n'écrit aucune révision ni aucun paramètre du solide ; la section ne change pas — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - EX-075 : vue dérivée périmée après modification du modèle — `apps/web/e2e/studio-pub.mjs`, commit 085a8f3, 2026-10-26 04:39
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-076

- **Libellé exact (REF-02, § w:p 727)** : EX-076 — Documents indépendants. Un dessin de détail créé directement en 2D peut être publié conjointement avec des documents dérivés d’une maquette sans être présenté comme un extrait automatiquement synchronisé.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 001,038
- **Test positif prescrit** : Publier détail 2D autonome et coupe de modèle ensemble avec sources distinctes.
- **Test négatif prescrit** : Détail indépendant annoncé synchronisé avec maquette sans association : présentation refusée.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-076 [+] détail 2D autonome et coupe de maquette publiés ensemble, chacun avec sa source distincte — `packages/atelier-model/src/studio/chaine-documentaire.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-076 [−] le détail indépendant annoncé « synchronisé » avec la maquette sans association : présentation refusée — `packages/atelier-model/src/studio/chaine-documentaire.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-076 [+] [−] API : détail 2D et coupe de maquette publiés ensemble avec sources distinctes ; le détail annoncé « synchronisé » sans association est refusé (409 piece_refusee) — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - EX-076 [−] : détail 2D annoncé synchronisé sans association refusé (409 piece_refusee) — `apps/web/e2e/studio-pub.mjs`, commit 085a8f3, 2026-10-26 04:39
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-077

- **Libellé exact (REF-02, § w:p 729)** : EX-077 — Traçabilité des calculs. Chaque quantité comprend identifiant du jeu de sources, révision, règle et sa version, unité, objets inclus, exclusions, déductions, précision interne, arrondi de présentation et date. Un override manuel constitue une donnée distincte motivée, jamais le remplacement silencieux d’un calcul.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 009,010
- **Test positif prescrit** : Retrouver règle/version/objets/unité/brut/déductions/date et ajustement attribué pour quantité mur.
- **Test négatif prescrit** : Override manuel écrase rawValue sans auteur/motif : refuser ou conserver comme ajustement distinct.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-077 [+] précision interne pleine, arrondi de présentation déclaré séparé ; exclusions (cote, grandeur non évaluée) listées avec motif ; identité stable — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-008 [+] API : chaque quantité porte quantityId, sourceRevisionSet, ruleId / ruleVersion, objets, unité, valeur brute, affichage et actualité — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - IF-008 [−] ajustement manuel sans motif, sans auteur ou d'une unité incohérente : refusé, rawValue conservée ; recevable, il reste distinct — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-078

- **Libellé exact (REF-02, § w:p 730)** : EX-078 — Cohérence des totaux. Une somme ne mélange pas sans signalement des quantités de règles incompatibles, d’unités différentes ou de révisions hétérogènes. Les totaux distinguent brut, net, déductions, quantités non testées et corrections manuelles.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 009,010
- **Test positif prescrit** : Sommer quantités homogènes en distinguant brut/net/déduction/non testé/ajustement.
- **Test négatif prescrit** : Mélanger m² et m³ ou règles/révisions incompatibles : signaler et ne produire aucun total trompeur.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-078 [+] quantités homogènes : brut, déductions, net, non testées et corrections manuelles distingués — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-078 [−] révisions hétérogènes (jeux de sources distincts) : signalé, aucun total produit — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-078 [−] règles incompatibles (autre version) ou unités différentes (m² et m³) : signalé, aucun total produit — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-079

- **Libellé exact (REF-02, § w:p 762)** : EX-079 — Capacité par sens d’échange. lecture, consultation, édition, export, aller-retour sont évalués séparément. Aucun simple export IFC ou DXF ne suffit à prouver un round-trip fidèle ; aucune certification n’est affirmée sans audit correspondant.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 028
- **Test positif prescrit** : Qualifier export IFC séparément de l'import/édition/round-trip dans matrice par entité/version.
- **Test négatif prescrit** : Export syntaxiquement valide utilisé pour affirmer round-trip/certification : conclusion rejetée faute preuve.
- **Preuve (contrôles positifs exécutés)** : 3
  - TR-EX-079 : lecture, consultation, édition, export et aller-retour évalués séparément pour chaque format ; chaque entrée rangée sous un format — `packages/atelier-model/src/studio/echanges/matrice-echanges.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - EX-079 aller-retour : profil exporté par un compte puis importé par un autre — ordre, raccourcis, favoris et liste personnelle relus à l'identique — `apps/api/src/routes/studio-profils-import.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - TR-EX-079 : capacités par sens affichées — IFC lu, consulté, édité, exporté, aller-retour ; STEP exporté seulement ; DWG rien — `apps/web/e2e/studio-echanges.mjs`, commit 2e1564d, 2026-10-26 06:25
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - TR-EX-079 [−] : un export syntaxiquement valide ne prouve pas un aller-retour — aller-retour déclaré sans lecture, sans export ou sans test refusé — `packages/atelier-model/src/studio/echanges/matrice-echanges.test.ts`, commit 2e1564d, 2026-10-26 06:14
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-080

- **Libellé exact (REF-02, § w:p 763)** : EX-080 — Rapport de transformation. Import et export signalent unités et repères, primitives non prises en charge, propriétés perdues, simplifications, conflits d’identifiants et éléments ignorés. Une source non prise en charge ne disparaît pas sans information.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 028
- **Test positif prescrit** : Importer entité inconnue et exporter sous-ensemble ; produire rapport unités/repères/pertes/IDs.
- **Test négatif prescrit** : Parser ignore entité sans rapport ou remplace unité inconnue : échec de couverture explicite.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-080 [+] import DXF en millimètres : repère WCS du fichier vers local-2d en mètres, facteur exact, sans translation ni rotation, Z ignoré — `packages/atelier-model/src/studio/reperes-echanges.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - EX-080 [+] chaque export déclare son repère source (local-2d, m) et son repère cible, sans géoréférencement — `packages/atelier-model/src/studio/reperes-echanges.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-080 [−] unité inconnue : le repère source garde une unité nulle, aucun facteur n'est substitué, aucune commande — `packages/atelier-model/src/studio/reperes-echanges.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-081

- **Libellé exact (REF-02, § w:p 766)** : EX-081 — Ensemble coordonné. Plusieurs disciplines peuvent avoir des numéros de révision différents ; l’ensemble doit être explicitement coordonné et figé. Une modification après approbation remet en question l’éligibilité du nouveau dossier, pas l’intégrité de la publication historique.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 030,038
- **Test positif prescrit** : Approuver manifeste coordonnant révisions différentes puis conserver contenu figé.
- **Test négatif prescrit** : Document change après approbation : nouveau dossier recontrôlé, ancienne publication intacte.
- **Preuve (contrôles positifs exécutés)** : 2
  - E.4 : manifeste multi-sources (variante principale et coordonnée, révisions et empreintes) — `apps/web/e2e/studio-publication.mjs`, commit bf775d9, 2026-10-25 22:05
  - E.4 : propriétaire approuve le manifeste examiné (son empreinte) — `apps/web/e2e/studio-publication.mjs`, commit bf775d9, 2026-10-25 22:05
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - E.4 : diffusion refusée sous l'ancienne approbation (409 manifest_mismatch, écart sur la variante) — `apps/web/e2e/studio-publication.mjs`, commit bf775d9, 2026-10-25 22:05
  - EX-081 [−] dossier E diffusé puis variante modifiée et dossier F diffusé : ses quatre fichiers ont les empreintes de sa diffusion, paquet, manifeste et révision inchangés — `apps/web/e2e/studio-publication.mjs`, commit bf775d9, 2026-10-25 22:05
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-082

- **Libellé exact (REF-02, § w:p 767)** : EX-082 — Publication non réécrite. Retrait, remplacement ou nouvelle diffusion sont de nouveaux événements journalisés ; la publication antérieure demeure identifiable.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 031
- **Test positif prescrit** : Retirer/remplacer publication par événement journalisé en gardant ancienne identité/contenu selon politique.
- **Test négatif prescrit** : Nouvelle diffusion écrase manifestes/fichiers historiques : refus et défaut éliminatoire.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-082 [+] retrait et remplacement restent de nouveaux évènements journalisés ; paquet et manifeste antérieurs identiques — `apps/api/src/routes/studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:58
  - EX-082 : le retrait reste un nouvel évènement journalisé ; paquet et manifeste identiques — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - EX-082 [−] réécrire le paquet, le manifeste, la révision ou la diffusion d'une publication diffusée : refusé par le déclencheur, rien ne change — `apps/api/src/routes/studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:58
  - EX-082 : UPDATE directe du paquet d'une publication diffusée refusée par la base (studio_publication_package_immutable) — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
  - EX-082 : UPDATE directe du contenu du paquet d'une publication diffusée refusée par la base (studio_publication_package_immutable) — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
  - EX-082 : UPDATE directe du manifeste d'une publication diffusée refusée par la base (studio_publication_package_immutable) — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
  - EX-082 : UPDATE directe du approbation d'une publication diffusée refusée par la base (studio_publication_package_immutable) — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-083

- **Libellé exact (REF-02, § w:p 814)** : EX-083 — Séparation des décisions. Approuver et publier sont deux permissions différentes. Un administrateur technique n’obtient pas automatiquement la fonction d’approbateur métier. Un cumul de rôles peut être autorisé selon taille d’équipe, mais un autocontrôle doit rester identifié comme tel.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/X
- **Contrat** : IF-009,IF-010 · **Composants candidats** : `apps/web/src/modules/collaboration`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-16 · **Scénarios** : 018,030
- **Test positif prescrit** : Utilisateur approbateur approuve puis publieur autorisé publie ; cumul éventuel identifié.
- **Test négatif prescrit** : Administrateur technique seul ou profil ajoutant Approuver : refus serveur si permission métier absente.
- **Preuve (contrôles positifs exécutés)** : 3
  - Eve : approbation de son dossier enregistrée et marquée auto-contrôle — `apps/web/e2e/auto-controle.mjs`, commit bf775d9, 2026-10-25 21:54
  - interface : marque « Auto-contrôle » visible sur la publication approuvée — `apps/web/e2e/auto-controle.mjs`, commit bf775d9, 2026-10-25 21:54
  - diffusion par le propriétaire : non concernée, paquet sous le manifeste approuvé — `apps/web/e2e/auto-controle.mjs`, commit bf775d9, 2026-10-25 21:54
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-083 [−] administrateur technique sans rôle dans le projet : approbation refusée par le serveur (404, rien révélé), dossier toujours en revue — `apps/web/e2e/auto-controle.mjs`, commit bf775d9, 2026-10-25 21:54
  - EX-083 [−] approuver et publier sont deux permissions : l'approbatrice (éditrice) ne diffuse pas (403), dossier non diffusé — `apps/web/e2e/auto-controle.mjs`, commit bf775d9, 2026-10-25 21:54
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-084

- **Libellé exact (REF-02, § w:p 815)** : EX-084 — Observations/tâches/décisions. Une annotation est une note ; une observation décrit un constat ; une tâche attribue une action à un responsable ; une décision enregistre un arbitrage. Ces objets sont reliables mais ne se substituent pas l’un à l’autre.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/X
- **Contrat** : IF-009,IF-010 · **Composants candidats** : `apps/web/src/modules/collaboration`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-16 · **Scénarios** : 029
- **Test positif prescrit** : Créer note/observation/tâche/décision avec identités/rôles distincts et liens.
- **Test négatif prescrit** : Commentaire présenté comme décision approuvée ou tâche clôturant observation : aucune transition implicite.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-084 [+] l'observation a sa propre identité (issueId) distincte de la note qui la porte (noteId), reliées — `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-084 [−] une proposition (même de clôture ou de dérogation), une tâche faite ou un commentaire ne résolvent pas l'observation ; seule une décision ou la clôture le font — `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-085

- **Libellé exact (REF-02, § w:p 816)** : EX-085 — Délégation contrôlée. L’absence d’un approbateur ne vaut pas accord. Une délégation, si permise, possède portée, période, délégant/délégué, justification et événement d’audit.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/X
- **Contrat** : IF-009,IF-010 · **Composants candidats** : `apps/web/src/modules/collaboration`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-16 · **Scénarios** : 018,030
- **Test positif prescrit** : Délégation valide portée/période/délégant/délégué/motif permet action et trace.
- **Test négatif prescrit** : Approbateur absent ou délégation expirée/hors portée : aucune approbation automatique.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-085 [+] une délégation valide (portée, période, délégant, délégué, motif) permet au délégué d'approuver ; l'emploi est audité — `apps/api/src/routes/studio-delegations.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-085 [−] l'absence de l'approbateur ne vaut pas accord : sans décision, la publication reste en revue, même longtemps après — `apps/api/src/routes/studio-delegations.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-085 [−] hors période (à venir, expirée) ou révoquée : refus nommé, rien n'est approuvé ; l'expiration n'approuve rien — `apps/api/src/routes/studio-delegations.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-085 [−] hors portée ou employée par un autre compte : refus nommé — `apps/api/src/routes/studio-delegations.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-086

- **Libellé exact (REF-02, § w:p 820)** : EX-086 — Réexamen. Un contrôle de nouvelle révision rapproche les observations antérieures par identité/source/règle et produit un statut de suivi ; la fermeture automatique sur simple disparition d’un objet est interdite.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E/X
- **Contrat** : IF-009,IF-010 · **Composants candidats** : `apps/web/src/modules/collaboration`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-16 · **Scénarios** : 029
- **Test positif prescrit** : Rapprocher constat de R12 avec contrôle de R13 par identité/source/règle et décider suivi.
- **Test négatif prescrit** : Objet disparaît de R13 : garder observation ouverte ou résolution explicite, pas fermeture automatique.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-086 [+] le contrôle de R(n+1) rapproche chaque observation par identité, source et règle et consigne un statut de suivi — `apps/api/src/routes/studio-observations-rapprochement.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-086 contrôle de r4 : l'observation est rapprochée, objet disparu marqué, statut inchangé (ouverte) — `apps/web/e2e/studio-observations.mjs`, commit 5edae3e, 2026-10-25 20:22
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-086 [−] objet disparu de la nouvelle révision : observation marquée « objet-disparu », jamais close ni modifiée — `apps/api/src/routes/studio-observations-rapprochement.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-086 aucune fermeture automatique : observation toujours ouverte, journal inchangé (ouvrir seul) — `apps/web/e2e/studio-observations.mjs`, commit 5edae3e, 2026-10-25 20:22
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-087

- **Libellé exact (REF-02, § w:p 864)** : EX-087 — Intégration contrôlée. Les modules Fadi existants restent responsables des données transverses qu’ils possèdent. Tout nouvel endpoint nécessite un contrôle de droit tenant/projet, de schéma, de révision, d’idempotence, de taille d’entrée et de journal.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : A/R/X
- **Contrat** : IF-001,IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src`, `docker-compose.yml`, `docs/deploiement.md`
- **Décisions** : DEC-03,DEC-18 · **Scénarios** : 035
- **Test positif prescrit** : Nouvel endpoint valide session/projet/schéma/révision/requestId/taille et journalise engagement.
- **Test négatif prescrit** : ID d'autre projet, payload trop grand ou mauvaise version : refus atomique sans fuite.
- **Preuve (contrôles positifs exécutés)** : 1
  - rejeu du même requestId idempotent — `apps/web/e2e/studio-persistance.mjs`, commit 779e082, 2026-10-18 23:01
- **Contre-preuve (contrôles négatifs exécutés)** : 6
  - EX-087 : commandes Studio, corps de 300 ko (> 256 ko) → 413, rien d'écrit — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
  - EX-087 : modèle externe Studio, corps de plus de 6 Mo → 413 — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
  - base périmée refusée sans écrasement (409 stale_revision) — `apps/web/e2e/studio-persistance.mjs`, commit 779e082, 2026-10-18 23:01
  - champ inconnu refusé (400, schéma strict) — `apps/web/e2e/studio-persistance.mjs`, commit 779e082, 2026-10-18 23:01
  - étude inconnue : 404 — `apps/web/e2e/studio-persistance.mjs`, commit 779e082, 2026-10-18 23:01
  - INV-005 [−] refus au milieu du lot, ou panne après l'insertion de la révision : aucune ligne modifiée — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-088

- **Libellé exact (REF-02, § w:p 865)** : EX-088 — Isolation multi-utilisateurs. Le système interdit l’accès aux documents, profils et variantes d’un autre périmètre sans autorisation. Les URL de blob, résultats de jobs et exports temporairement accessibles sont soumis à l’autorisation de l’objet source.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : A/R/X
- **Contrat** : IF-001,IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src`, `docker-compose.yml`, `docs/deploiement.md`
- **Décisions** : DEC-03,DEC-18 · **Scénarios** : 035
- **Test positif prescrit** : Lire document/profil/job/blob/export avec autorisation ressource cohérente.
- **Test négatif prescrit** : Copier URL temporaire d'un autre projet/utilisateur : accès refusé sans contenu/métadonnées sensibles.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-088 [+] / [−] : job lu avec l'autorisation de son étude ; copié vers un autre projet ou par un non-membre, refus sans métadonnée — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - EX-088 : résultat de job serveur traçable lu sous l'autorisation de l'étude ; autre compte refusé sans métadonnée — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-089

- **Libellé exact (REF-02, § w:p 866)** : EX-089 — Persistance et reprise. Une confirmation envoyée au navigateur doit correspondre à un engagement durable conforme au contrat de sauvegarde. Les sauvegardes, restaurations et récupérations d’incident sont testées sur un corpus contenant données de conception, associations et publications.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : A/R/X
- **Contrat** : IF-001,IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src`, `docker-compose.yml`, `docs/deploiement.md`
- **Décisions** : DEC-03,DEC-18 · **Scénarios** : 034
- **Test positif prescrit** : Sauvegarder avec confirmation durable, relancer service sur copie jetable et retrouver modèle/associations/publications.
- **Test négatif prescrit** : Échec DB avant commit : pas d'accusé de sauvegarde confirmé ; reprise n'invente pas opération.
- **Preuve (contrôles positifs exécutés)** : 3
  - EX-089 : publication diffusée confirmée (paquet figé) — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
  - J2 : réouverture — mêmes têtes, mêmes documents (empreintes) et mêmes révisions pour les deux variantes — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
  - EX-089 : réouverture — publication diffusée relue à l'identique (statut, paquet, manifeste, journal) et ses fichiers aux mêmes empreintes — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-089 : après la reprise, le rejeu du dernier requestId renvoie la révision confirmée, sans en créer (aucune opération inventée) — `apps/web/e2e/studio-preuves-e.mjs`, commit bf775d9, 2026-10-25 21:55
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-090

- **Libellé exact (REF-02, § w:p 869)** : EX-090 — Reconstruction. Une restauration doit permettre de retrouver le modèle canonique confirmé, les manifestes et leurs pièces, les références, les droits applicables et les identités des documents. Les caches GPU et index spatiaux sont reconstruits, non sauvegardés comme preuve faisant autorité.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : A/R/X
- **Contrat** : IF-001,IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src`, `docker-compose.yml`, `docs/deploiement.md`
- **Décisions** : DEC-03,DEC-18 · **Scénarios** : 034
- **Test positif prescrit** : Restaurer canonique+pièces+manifestes+droits puis reconstruire index/GPU et comparer identités.
- **Test négatif prescrit** : Backup n'inclut que caches ou manque pièce publiée : restauration déclarée incomplète, pas réussite globale.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-090 [+] sauvegarde complète (canonique, manifeste, pièce publiée, droits) : acceptée — `apps/api/src/routes/studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:58
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-090 [−] pièce publiée absente de la sauvegarde (manifeste recalculé, donc cohérent) : restauration refusée, pièce nommée — `apps/api/src/routes/studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:58
  - EX-090 [−] sauvegarde sans le modèle canonique (pièces seules, révisions absentes) : restauration refusée, jamais une réussite globale — `apps/api/src/routes/studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:58
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-091

- **Libellé exact (REF-02, § w:p 872)** : EX-091 — Migration non destructrice. Une étude existante ne doit pas perdre une propriété, une cote, une association, un identifiant documentaire, une révision ou un accès sans rapport explicite, procédure d’accord et solution de restauration. Toute bascule définit des jeux d’essai d’avant/après et un point de retour arrière.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : A/R/X
- **Contrat** : IF-001,IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src`, `docker-compose.yml`, `docs/deploiement.md`
- **Décisions** : DEC-03,DEC-18 · **Scénarios** : 034,036
- **Test positif prescrit** : Simulation migration compare propriétés/cotes/associations/historique et correspondances d'IDs.
- **Test négatif prescrit** : Objet non convertible : conserver+rapport+accord/récupération ; ne pas le supprimer pour améliorer taux.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-091 [+] : simulation (job) puis accord du propriétaire, application des copies /2 et point de retour arrière — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - EX-091 : simulation (comparaison identifiants, propriétés, cotes, associations, historique, accès), accord du propriétaire, application des copies /2, retour arrière — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - EX-091 [+] : simulation compare identifiants, propriétés, cotes, associations, historique et accès avant / après — sans perte — `packages/atelier-model/src/studio/cmd/migration.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-091 [−] : objet non convertible conservé et rapporté (jamais supprimé pour améliorer le taux) ; perte d'historique ou d'accès refusée — `packages/atelier-model/src/studio/cmd/migration.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-091 [−] : étude changée après la simulation, ou révision non migrable — application et accord refusés, rien n'est supprimé — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-092

- **Libellé exact (REF-02, § w:p 906)** : EX-092 — Protection par défaut. Chaque mutation et lecture sensible passe par identification de session, autorisation dans le contexte et validation des entrées. La sécurité client sert à guider l’UX, jamais à remplacer le serveur.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A6 + A2 · **Lot** : X
- **Contrat** : IF-001,IF-006,IF-007,IF-009 · **Composants candidats** : `apps/api/src/app.ts`, `.github/workflows`, `packages/geometry-exact`, `docs/atelier/decisions.md`
- **Décisions** : DEC-11,DEC-15,DEC-18 · **Scénarios** : 018,035
- **Test positif prescrit** : Lecture sensible/mutation passe session+autorisation+schéma côté serveur.
- **Test négatif prescrit** : Contourner bouton ou modifier payload depuis client : refus serveur, pas confiance UI.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 6
  - chaque cellule rend l'attendu ; aucun refus n'écrit quoi que ce soit — `apps/api/src/routes/studio-permissions.test.ts`, commit cf09271, 2026-10-19 14:33
  - sans session : 401 sur toute route Studio, avant tout accès — `apps/api/src/routes/studio-permissions.test.ts`, commit cf09271, 2026-10-19 14:33
  - phase déclarée du workflow : une phase inconnue, un champ en plus ou une valeur absente sont refusés (400) avant tout accès — `apps/api/src/routes/studio-permissions.test.ts`, commit 2d4a7c6, 2026-10-19 20:40
  - INV-009 [−] un profil qui affiche « Publier » ou se déclare des droits ne donne rien : champs refusés, commande du lecteur refusée par le serveur — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - identité : l'enveloppe ne porte aucun auteur (champ refusé par le schéma strict) — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - lecteur : un outil favori ne donne aucun droit (commande 403) — `apps/web/e2e/studio-profils.mjs`, commit f59d66d, 2026-10-19 06:50
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-093

- **Libellé exact (REF-02, § w:p 907)** : EX-093 — Intégrité des modèles. Les commandes et opérations de géométrie vérifient contraintes, types, unités et appartenance. Le serveur refuse les mutations qui violeraient les invariants, même si l’outil client les présente comme valides.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A6 + A2 · **Lot** : X
- **Contrat** : IF-001,IF-006,IF-007,IF-009 · **Composants candidats** : `apps/api/src/app.ts`, `.github/workflows`, `packages/geometry-exact`, `docs/atelier/decisions.md`
- **Décisions** : DEC-11,DEC-15,DEC-18 · **Scénarios** : 008,035
- **Test positif prescrit** : Commande avec unités/types/hôte valides produit état cohérent vérifié serveur.
- **Test négatif prescrit** : Coordonnée NaN, type invalide, hôte d'autrui ou épaisseur négative : zéro mutation canonique.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-093 [+] mur et ouverture valides (types, unités, hôte de la même variante) : état cohérent écrit par le serveur — `apps/api/src/routes/studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:58
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - EX-093 [−] hôte d'autrui (mur d'une autre variante), coordonnée non finie, type inconnu, épaisseur négative : 400, zéro mutation canonique — `apps/api/src/routes/studio.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:58
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-094

- **Libellé exact (REF-02, § w:p 908)** : EX-094 — Confidentialité des sources. Les rendus, fichiers importés, modèles de références et images adressés à un service externe ne le sont qu’au terme d’un contrôle de politique, avec conservation de la provenance et signalement des informations inconnues.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A6 + A2 · **Lot** : X
- **Contrat** : IF-001,IF-006,IF-007,IF-009 · **Composants candidats** : `apps/api/src/app.ts`, `.github/workflows`, `packages/geometry-exact`, `docs/atelier/decisions.md`
- **Décisions** : DEC-11,DEC-15,DEC-18 · **Scénarios** : 032
- **Test positif prescrit** : Avant transfert externe vérifier politique, droit, source et provenance connue.
- **Test négatif prescrit** : Source confidentielle envoyée sans contrat/consentement requis : blocage avant transmission.
- **Preuve (contrôles positifs exécutés)** : 2
  - TR-EX-094 [+] politique, fournisseur, source connue, droit d'export et consentement au coût déclaré : transfert autorisé, inconnues signalées — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-094 [+] TR-EX-071 [+] politique, consentement au coût déclaré et clé fournie : un seul appel au double, provenance avec fournisseur, version « inconnue », source envoyée, consentement, coûts, q… — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - TR-EX-094 [−] chaque manque bloque avant transmission : politique par défaut, source confidentielle sans contrat, classification ou provenance inconnue, consentement ou coût absents — `packages/atelier-model/src/studio/agents/agents.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-EX-094 [−] configuration par défaut : le service externe est indisponible et une demande est refusée avant toute transmission (le double n'est jamais appelé) — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
  - TR-EX-094 [−] service configuré mais sans consentement, sans coût accepté, classification inconnue ou confidentielle : bloqué avant transmission — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
  - TR-EX-094 [−] un lecteur, même consentant, ne fait rien sortir : 403 avant tout contrôle ou appel — `apps/api/src/routes/studio-illustrations.test.ts`, commit 4304050, 2026-10-26 03:21
  - TR-EX-094 [−] service externe : sans classification choisie → « inconnue » ; sans case cochée → aucun consentement ; le bouton reste indisponible avec sa raison — `apps/web/src/modules/studio/illustration/illustration.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-095

- **Libellé exact (REF-02, § w:p 911)** : EX-095 — Observabilité. Des mesures agrégées de latence, de mémoire, d’erreurs et de tâches doivent permettre de détecter une dégradation de service sans enregistrer inutilement les géométries confidentielles ou des secrets d’accès. Les traces sont corrélées par identifiants non sensibles de commande/job.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A6 + A2 · **Lot** : X
- **Contrat** : IF-001,IF-006,IF-007,IF-009 · **Composants candidats** : `apps/api/src/app.ts`, `.github/workflows`, `packages/geometry-exact`, `docs/atelier/decisions.md`
- **Décisions** : DEC-11,DEC-15,DEC-18 · **Scénarios** : 015,037
- **Test positif prescrit** : Corréler latence/mémoire/erreur par commandId/jobId non sensible.
- **Test négatif prescrit** : Log contient secret ou géométrie privée sans nécessité : contrôle échoue et empêche publication du log.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-095 [+] latence, mémoire et erreurs corrélées par commandId (lot) et jobId (tâche), sans contenu — `apps/web/src/modules/studio/taches/journal-correlation.test.ts`, commit 5edae3e, 2026-10-25 20:16
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-095 [−] le journal produit ne contient ni secret ni géométrie : contrôle vide, export admis — `apps/web/src/modules/studio/taches/journal-correlation.test.ts`, commit 5edae3e, 2026-10-25 20:16
  - EX-095 [−] un secret ou une géométrie dans le journal fait échouer le contrôle et empêche l'export — `apps/web/src/modules/studio/taches/journal-correlation.test.ts`, commit 5edae3e, 2026-10-25 20:16
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-096

- **Libellé exact (REF-02, § w:p 912)** : EX-096 — Licence et provenance. L’utilisation de WASM ou moteurs tiers s’accompagne de l’inventaire des versions, licences et obligations de redistribution/remplacement applicables, vérifiées pour l’artefact effectivement distribué.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A6 + A2 · **Lot** : X
- **Contrat** : IF-001,IF-006,IF-007,IF-009 · **Composants candidats** : `apps/api/src/app.ts`, `.github/workflows`, `packages/geometry-exact`, `docs/atelier/decisions.md`
- **Décisions** : DEC-11,DEC-15,DEC-18 · **Scénarios** : 016
- **Test positif prescrit** : Inventorier version/licence/source et obligation LGPL de l'artefact WASM réellement distribué.
- **Test négatif prescrit** : Licence package outillage utilisée pour déclarer WASM permissif : revue refuse et garde provenance correcte.
- **Preuve (contrôles positifs exécutés)** : 2
  - TR-EX-096 : notice servie (occt-wasm 5.6.1, LGPL-2.1-only, remplacement), texte LGPL 2.1 servi, binaire servi identique à la notice (SHA-256) et seul .wasm demandé — `apps/web/e2e/studio-exact.mjs`, commit d87a82e, 2026-10-25 21:21
  - TR-EX-096 — licence et provenance du noyau exact distribué — `apps/web/src/modules/studio/exact/licence-occt.test.ts`, commit d87a82e, 2026-10-25 21:11
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-097

- **Libellé exact (REF-02, § w:p 965)** : EX-097 — Mesure reproductible. Fixer matériel, navigateur/version, mémoire, GPU/driver, taille d’écran, statut des caches, réseau, build, commit, répétitions, opérations, outliers et méthode statistique ; conserver traces et scripts. Les mesures JavaScript renderer.render() ne sont pas assimilées automatiquement au coût GPU, et SwiftShader ne remplace pas un GPU physique.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A1 · **Lot** : X
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `docs/atelier/p0-mesures.md`, `docs/atelier/p2-mesures.md`, `apps/web/e2e`, `.github/workflows`
- **Décisions** : DEC-13 · **Scénarios** : 025,037
- **Test positif prescrit** : Mesure cache froid/chaud sur appareil identifié avec build/GPU/réseau/répétitions/distribution.
- **Test négatif prescrit** : Résultat SwiftShader ou renderer.render CPU annoncé GPU physique : conclusion refusée.
- **Preuve (contrôles positifs exécutés)** : 4
  - EX-097 — protocole de mesure reproductible — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - statistiques : quantile au rang le plus proche, distribution, aberrants de Tukey signalés et conservés — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - environnement complet : quatorze champs exigés, rendu logiciel SwiftShader reconnu, GPU « non évalué » — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-097 : protocole de mesure complet — matériel, navigateur et version, mémoire, GPU / pilote (moteur WebGL non masqué), écran, caches froid et chaud, réseau, build, commit, répétitions, opération… — `apps/web/e2e/studio-g4.mjs`, commit 2e1564d, 2026-10-26 06:23
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - champ manquant (GPU, caches, répétitions, commit) : protocole incomplet, toute conclusion refusée — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - cas négatif : un résultat SwiftShader ou une durée renderer.render() présentés comme coût GPU sont refusés — `packages/atelier-model/src/studio/mesures/mesures.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-EX-097 (cas négatif) : conclusion GPU tirée de renderer.render() refusée ; sous rendu logiciel, tout profil GPU refusé (« non évalué ») — `apps/web/e2e/studio-g4.mjs`, commit 2e1564d, 2026-10-26 06:23
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-098

- **Libellé exact (REF-02, § w:p 966)** : EX-098 — Double vérification. Tout gain de performance est accompagné d’une comparaison géométrique et fonctionnelle : mêmes cibles de snapping, même sélection, mêmes dimensions/quantités, mêmes objets exportés dans les tolérances, même comportement d’annulation et de conflits.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A1 · **Lot** : X
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `docs/atelier/p0-mesures.md`, `docs/atelier/p2-mesures.md`, `apps/web/e2e`, `.github/workflows`
- **Décisions** : DEC-13 · **Scénarios** : 022,023,025
- **Test positif prescrit** : Comparer performance ET cibles/quantités/historique/export avant/après optimisation.
- **Test négatif prescrit** : Gain p95 avec snapping ou volume différent hors tolérance : optimisation rejetée.
- **Preuve (contrôles positifs exécutés)** : 5
  - F.1-01 — une accélération n'est activée qu'après preuve du gain ET de la non-régression > rapport qualifiant (gain sur chaque scène, chaque critère exigé mesuré dans sa tolérance) : autorisée, gains … — `packages/atelier-model/src/studio/accelerations.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - REC-C-01 — chemins optimisés et chemin direct : mêmes cotes, mêmes exports SVG / DXF / IFC > brouillon incrémental (commande par commande) et frontière du Worker : exports identiques octet pour octet… — `apps/web/src/modules/studio/workers/chemins-optimises.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - REC-C-01 — chemins optimisés et chemin direct : mêmes cotes, mêmes exports SVG / DXF / IFC > maillage incrémental (cache de morceaux) = maillage direct : mêmes volumes, donc mêmes quantités et même I… — `apps/web/src/modules/studio/workers/chemins-optimises.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - TR-EX-098 : index spatial — gain p95 mesuré ET mêmes cibles d'accrochage / même sélection, jugé par la règle — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
  - F.1-01 / TR-EX-098 : rapport réel SVG / Canvas mesuré ici et jugé par la règle — verdict rendu avec ses motifs (gain ET non-régression exigés) — `apps/web/e2e/studio-rend.mjs`, commit 085a8f3, 2026-10-26 04:40
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - F.1-01 — une accélération n'est activée qu'après preuve du gain ET de la non-régression > EX-098 (cas négatif) : gain p95 avec accrochage ou sélection différents hors tolérance → accélération rejetée — `packages/atelier-model/src/studio/accelerations.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-099

- **Libellé exact (REF-02, § w:p 967)** : EX-099 — Adaptativité conditionnée. La dégradation graphique répond aux mesures et aux préférences ; aucune réduction d’effet ne peut affecter les invariants de conception. Le résultat demeure publiable sur données de référence, indépendamment de la qualité instantanée de la prévisualisation.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A1 · **Lot** : X
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `docs/atelier/p0-mesures.md`, `docs/atelier/p2-mesures.md`, `apps/web/e2e`, `.github/workflows`
- **Décisions** : DEC-13 · **Scénarios** : 025,026
- **Test positif prescrit** : Adapter effets graphiques sur mesures/préférences et publier mêmes données canoniques.
- **Test négatif prescrit** : Bas FPS conduit à dériver export simplifié non déclaré : échec invariants, pas concession admise.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-099 [+] trames mesurées au-delà du budget : la qualité d'affichage baisse (annoncée) ; revenues sous le seuil : elle remonte — `apps/web/src/modules/studio/frontieres.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
  - candidats, point accroché et tolérance rendus identiques avant, pendant et après la charge (paliers 0 à 4) — `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts`, commit 5edae3e, 2026-10-25 20:16
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-099 [−] dépôt réel : exports, feuilles, dossiers et paquets publiés ne lisent ni la qualité d'affichage, ni la vue 3D, ni les mesures de trame — `apps/web/src/modules/studio/frontieres.preuves-e.test.ts`, commit bf775d9, 2026-10-25 21:49
  - chaque palier ne porte que ombres / résolution / anti-crénelage (aucun accrochage, aucune tolérance, aucun objet) — `apps/web/src/modules/studio/vue3d/qualite-rendu.test.ts`, commit 5edae3e, 2026-10-25 20:16
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-100

- **Libellé exact (REF-02, § w:p 998)** : EX-100 — Critère de preuve. Une preuve est rattachée à build, commit, version du contrat, jeu de données/empreinte, environnement, auteur/exécutant, horodatage, verdict, logs utiles et référence stable. « La CI est verte » ne prouve pas qu’un scénario non présent dans la CI a été testé.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A1 · **Lot** : X
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `docs/atelier/p0-mesures.md`, `docs/atelier/p2-mesures.md`, `apps/web/e2e`, `.github/workflows`
- **Décisions** : DEC-13 · **Scénarios** : 034
- **Test positif prescrit** : Archiver résultat avec build/SHA/contrat/corpus empreinte/env/exécutant/date/verdict/log/lien.
- **Test négatif prescrit** : Lien CI verte sans scénario présent ou preuve sans SHA : ne pas attribuer conformité.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-100 [+] une preuve portant build, SHA, contrat, corpus, environnement, exécutant, date, verdict, log et référence permet d'attribuer la conformité — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-100 [−] preuve sans SHA, ou lien de CI « vert » sans scénario : conformité refusée, motif nommé — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-100 [−] registre réel : aucune conformité n'est attribuée sur une preuve refusée, aucun lien de CI sans scénario — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-101

- **Libellé exact (REF-02, § w:p 999)** : EX-101 — Gestion des régressions. Un correctif modifiant la géométrie, les projections, les workers ou le Registry déclenche les tests pertinents d’exactitude, d’historique, de permissions, de persistance et de compatibilité des profils.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A1 · **Lot** : X
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `docs/atelier/p0-mesures.md`, `docs/atelier/p2-mesures.md`, `apps/web/e2e`, `.github/workflows`
- **Décisions** : DEC-13 · **Scénarios** : 011,018,036,037
- **Test positif prescrit** : Changement worker/Registry déclenche tests exactitude/historique/droits/persistance/profils concernés.
- **Test négatif prescrit** : Skip des tests pertinents ou assertion affaiblie pour verdir CI : preuve insuffisante.
- **Preuve (contrôles positifs exécutés)** : 2
  - EX-101 — tests pertinents d'une modification de Worker ou du registre — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - cas positif : modifier un Worker ou le registre exige des tests d'exactitude, d'historique, de permissions, de persistance et de profils — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
- **Contre-preuve (contrôles négatifs exécutés)** : 6
  - table contre le dépôt : chaque test listé existe, n'est pas sauté et tourne en CI ; chaque Worker et chaque fichier du registre appartient à une zone — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - EX-101 — affaiblissement d'une assertion refusé — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - cas négatif : matcher strict remplacé par un plus faible sur le même sujet (toEqual → toBeDefined, toBe → toBeTruthy) : refusé — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - cas négatif : skip / only ajoutés, condition rendue toujours vraie, précision abaissée, test pertinent supprimé : refusés — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - assertions retirées d'un test : refusé, sauf dérogation écrite dans un commit (rapportée) ; un renforcement passe — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - diff réel de la branche courante (si la base main est connue) : aucun affaiblissement d'assertion — `apps/api/src/testing/regressions-pertinentes.test.ts`, commit 2e1564d, 2026-10-26 06:26
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-EX-102

- **Libellé exact (REF-02, § w:p 1125)** : EX-102 — Lien bidirectionnel. Toute exigence de niveau 2 dispose au minimum d’un identifiant, d’une source de niveau 1, d’un propriétaire métier, d’un contrat, d’un composant candidat, de tests, de preuves, d’un état et d’une décision si un arbitrage est requis. Les composants existants sont des candidats jusqu’à leur audit. Un test identifie l’exigence qu’il vérifie ; un composant identifie les exigences qu’il satisfait.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 + A0 · **Lot** : X/pilotage
- **Contrat** : IF-001 à IF-011 selon fonction · **Composants candidats** : `docs/ai-team/missions.json`, `docs/workstreams/studio`, `docs/continuity/README.md`
- **Décisions** : DEC-01 à DEC-18 selon fonction · **Scénarios** : 022
- **Test positif prescrit** : Depuis EX025 retrouver charte/contrat/composant/tests/preuve/DEC puis revenir depuis test vers exigence.
- **Test négatif prescrit** : Lien composant sans source ou test sans exigence : fiche incomplète signalée.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-102 [+] depuis une exigence on retrouve charte, contrat, composant, tests, preuve, décision ; depuis le test on revient à l'exigence — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-102 [−] composant sans source, test sans exigence ou contrôle introuvable : fiche incomplète signalée — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-102 [−] dépôt réel : aucun test ne cite une exigence inconnue des fiches ; les fiches citées sont celles de REF-02 — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-103

- **Libellé exact (REF-02, § w:p 1248)** : EX-103 — Couverture des preuves. Aucune exigence critique n’est marquée conforme si l’un des champs test, résultat, build, preuve ou décision applicable est absent. Les exceptions sont documentées comme non applicables avec justification vérifiable.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 + A0 · **Lot** : X/pilotage
- **Contrat** : IF-001 à IF-011 selon fonction · **Composants candidats** : `docs/ai-team/missions.json`, `docs/workstreams/studio`, `docs/continuity/README.md`
- **Décisions** : DEC-01 à DEC-18 selon fonction · **Scénarios** : 030
- **Test positif prescrit** : Contrôle de fiche critique exige test/résultat/build/preuve/décision ; non-applicabilité motivée.
- **Test négatif prescrit** : Champ preuve/décision applicable absent : ne jamais marquer conforme.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-103 [+] test, résultat, build, preuve et décision présents (ou non-applicabilité justifiée et vérifiable) : « conforme » admis — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-103 [−] un champ preuve ou décision absent, ou une non-applicabilité sans justification vérifiable : jamais « conforme » — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-103 [−] dépôt réel : aucune fiche critique n'est déclarée conforme avec un champ manquant — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-EX-104

- **Libellé exact (REF-02, § w:p 1251)** : EX-104 — Auditabilité. La matrice doit permettre de remonter d’un défaut observé au test, au composant, à l’exigence et au principe produit ; inversement, elle doit montrer pour chaque principe les composants candidats et preuves correspondants.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 + A0 · **Lot** : X/pilotage
- **Contrat** : IF-001 à IF-011 selon fonction · **Composants candidats** : `docs/ai-team/missions.json`, `docs/workstreams/studio`, `docs/continuity/README.md`
- **Décisions** : DEC-01 à DEC-18 selon fonction · **Scénarios** : 023
- **Test positif prescrit** : Partir défaut picking et remonter test→composant→EX→principe, puis couverture inverse.
- **Test négatif prescrit** : Principe sans composant candidat ou défaut sans lien source : auditabilité déclarée incomplète.
- **Preuve (contrôles positifs exécutés)** : 1
  - EX-104 [+] d'un défaut on remonte au test, à l'exigence, au composant et au principe ; chaque principe montre ses composants et preuves — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - EX-104 [−] défaut sans test, test sans exigence, exigence sans principe, principe sans composant : auditabilité incomplète, rupture nommée — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
  - EX-104 [−] dépôt réel : chaque défaut éliminatoire a un contrôle bloquant ; les huit principes de REF-01 sont relus ; les ruptures sont nommées — `apps/api/src/testing/studio-tracabilite-ex.test.ts`, commit 5edae3e, 2026-10-25 20:25
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md.

### TR-IF-001

- **Libellé exact (REF-02, § w:p 141)** : IF-001 — Interface de rattachement projet. Entrée : projet autorisé, site/sources/version, acteur ; sortie : contexte d’étude validé et identifiant stable. Échec : projet inaccessible, source non disponible, conflit de version, droits insuffisants. Le contrat physique demeure à choisir.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A4 · **Lot** : I/A/E
- **Contrat** : IF-001,IF-001,IF-006 · **Composants candidats** : `apps/web/src/App.tsx`, `apps/web/src/modules/module-registry.ts`, `apps/api/src/db/schema.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03 · **Scénarios** : 035,NAV-003
- **Test positif prescrit** : Rattacher étude à projet autorisé avec sources/version et obtenir identifiant stable.
- **Test négatif prescrit** : Projet inaccessible/source indisponible/conflit : erreur explicite sans création partielle.
- **Preuve (contrôles positifs exécutés)** : 1
  - IF-001 [+] : rattacher une étude à un projet autorisé avec site, sources et version — contexte validé, identifiant stable — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - IF-001 [−] : source indisponible, conflit de version, droits insuffisants — erreur explicite sans création partielle — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - IF-001 : étude rattachée avec ses sources et sa version — contexte validé et identifiant stable ; source indisponible refusée sans création partielle — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-002

- **Libellé exact (REF-02, § w:p 199)** : IF-002 — Geste rapide (exemple Ligne). ① réception pointeur/clavier ; ② lecture de la projection/index correspondant à la révision active ; ③ calcul de snapping ; ④ affichage d’aperçu transitoire ; ⑤ confirmation ; ⑥ intention géométrique validée ; ⑦ commande idempotente ; ⑧ réponse acceptation/conflit/refus ; ⑨ invalidation limitée des données dérivées.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 001,022 ; 005,008 secondaires seulement
- **Test positif prescrit** : Dessiner aperçu, confirmer et contrôler commande/valeur dans tolérance contractuelle.
- **Test négatif prescrit** : Échap sur aperçu puis relire modèle : aucune mutation canonique résiduelle.
- **Preuve (contrôles positifs exécutés)** : 3
  - TR-IF-002 [+] la tolérance est déclarée dans le contrat de commandes : saisie 0, pointé 1e-9 m — `apps/web/src/modules/studio/planche2d/outils/tolerance-ligne.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-IF-002 [+] valeur saisie : la ligne engagée porte exactement les coordonnées tapées (écart nul) — `apps/web/src/modules/studio/planche2d/outils/tolerance-ligne.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-IF-002 [+] valeur pointée : après accrochage (extrémité, intersection, milieu), la ligne engagée est à 1e-9 m au plus du point visé — `apps/web/src/modules/studio/planche2d/outils/tolerance-ligne.test.ts`, commit 4304050, 2026-10-26 03:10
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - TR-IF-002 [−] sans accrochage, un pointé à côté du point visé est hors tolérance (détecté), et un écart de 2e-9 m l'est aussi — `apps/web/src/modules/studio/planche2d/outils/tolerance-ligne.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-IF-002 [−] Ligne commencée puis Échap : aucune commande en attente, document du serveur inchangé — `apps/web/e2e/studio-dec.mjs`, commit 4304050, 2026-10-26 03:17
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-003

- **Libellé exact (REF-02, § w:p 200)** : IF-003 — Calcul lourd (exemple booléen). ① collecte des paramètres ; ② capture immuable de l’identifiant de révision ; ③ soumission au gestionnaire de tâches ; ④ worker/WASM ou service serveur ; ⑤ retour résultat + révision source + métriques ; ⑥ vérification du contexte et des droits ; ⑦ engagement transactionnel explicite ; ⑧ mise à jour des projections. Un résultat ancien peut être conservé à titre historique, pas appliqué à une révision plus récente.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-003,IF-004,IF-006,IF-011,IF-007 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 014,015
- **Test positif prescrit** : Capturer R12, calcul booléen en worker, vérifier droits/contexte puis confirmer transaction et invalider scène.
- **Test négatif prescrit** : Réponse calcul R12 après modification R13 ou droits révoqués : aucun engagement courant.
- **Preuve (contrôles positifs exécutés)** : 2
  - IF-003 [+] capture R12 → calcul (noyau exact) → engagement sur R12 : révision R13 engagée, maillage 3D et quantités invalidés, solide exact présent dans la scène — `apps/api/src/routes/studio-g2.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - de bout en bout : capture (révision 1) → tâche → résultat exact → aperçu confirmé → commande d'engagement → document avec le solide exact — `apps/web/src/modules/studio/exact/booleen-session.test.ts`, commit d87a82e, 2026-10-25 21:11
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - IF-003 [−] résultat calculé sur R12 rendu après une modification R13, ou après retrait des droits : aucun engagement courant, rien n'est écrit — `apps/api/src/routes/studio-g2.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - le brouillon change pendant le calcul : le résultat revient marqué périmé et n'est jamais engagé dans le modèle courant — `apps/web/src/modules/studio/exact/booleen-session.test.ts`, commit d87a82e, 2026-10-25 21:11
  - résultat prêt puis brouillon modifié avant l'engagement : affiché périmé, engagement refusé — `apps/web/src/modules/studio/exact/booleen-session.test.ts`, commit d87a82e, 2026-10-25 21:11
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-004

- **Libellé exact (REF-02, § w:p 330)** : IF-004 — Précondition de version. Toute intention qui modifie un objet en environnement collaboratif référence baseRevisionId et, lorsque nécessaire, les versions individuelles des objets et relations touchés. En cas de divergence incompatible : refus et proposition de résolution ou nouveau calcul sur la base courante.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 012
- **Test positif prescrit** : Commande base R12 avec objets/relations à jour est acceptée sur même contexte.
- **Test négatif prescrit** : Deux sessions divergent : commande seconde rejetée avec courant/conflit, pas last-write-wins.
- **Preuve (contrôles positifs exécutés)** : 1
  - INV-005 [+] un lot valide est appliqué en entier : une révision, tête avancée — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - INV-011 [+] A annule son propre ajout (élément distinct) : refus 409 sans chevauchement, reporté sur la tête, le travail de B demeure — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - BLOC-03 [−] même requestId rejoué : aucune seconde révision ; autre contenu : 409 request_conflict ; base périmée : 409 stale_revision — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - base périmée : 409 stale_revision avec la tête, les éléments changés et les chevauchements ; la tête est intacte — `apps/api/src/testing/studio-contrat-commandes.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - B sur l'ancienne tête : conflit signalé, tête de A intacte — `apps/web/e2e/studio-conflits.mjs`, commit 4643cfa, 2026-10-19 12:43
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-005

- **Libellé exact (REF-02, § w:p 469)** : IF-005 — Cycle d’activation. découvert → vérification de contexte/droits → résolution des dépendances → chargement du code → initialisation → prêt → actif → suspendu/désactivé ; erreurs incompatible, permission refusée, hors ligne, échec de chargement, échec du noyau. La transition ne doit pas perdre un geste inachevé sans retour visible.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 017,020,NAV-007
- **Test positif prescrit** : Tracer découverte→contrôle→dépendances→code→initialisation→prêt→actif→désactivation sans perte de geste.
- **Test négatif prescrit** : Hors ligne/permission/loader/noyau en erreur : état distinct et geste rendu ou protégé, pas attente infinie.
- **Preuve (contrôles positifs exécutés)** : 1
  - cas positif : découvert → vérification → résolution → chargement → initialisation → prêt → actif, puis suspendu, repris et désactivé — `apps/web/src/modules/studio/chargement/cycle-activation.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - cas négatifs : incompatible et permission refusée arrêtent à la vérification — rien n'est chargé, l'outil précédent reste actif, le geste est rendu — `apps/web/src/modules/studio/chargement/cycle-activation.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - erreurs distinctes : échec du noyau (initialisation), échec de chargement du code, hors ligne — jamais d'attente infinie, geste conservé et visible — `apps/web/src/modules/studio/chargement/cycle-activation.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-006

- **Libellé exact (REF-02, § w:p 529)** : IF-006 — Commande métier. Le contrat de transport doit exprimer les attributs logiques suivants ; l’objet est une proposition de schéma et non une API actuellement exposée.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : A/R/X
- **Contrat** : IF-006,IF-001,IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src`, `docker-compose.yml`, `docs/deploiement.md`
- **Décisions** : DEC-03,DEC-18 · **Scénarios** : 012,013,035
- **Test positif prescrit** : Enveloppe requestId/toolId/contractVersion/scope/baseRevision/targets/opération/paramètres/mode est validée avec identité de session serveur.
- **Test négatif prescrit** : actorId forgé, scope interprojet ou répétition incompatible : refus atomique, aucune permission créée.
- **Preuve (contrôles positifs exécutés)** : 6
  - IF-006 [+] enveloppe requestId / toolId / contractVersion / scope / baseRevision / targets / opération / paramètres / mode validée ; auteur = session ; essai sans écriture puis application — `apps/api/src/routes/studio-g2.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - A.5-01 — écritures du document Studio par le seul contrat de commandes — `apps/api/src/testing/studio-ecritures-architecture.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - révisions insérées seulement par l'orchestration des commandes (et la restauration signée, telle quelle) — `apps/api/src/testing/studio-ecritures-architecture.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - seule l'orchestration des commandes avance la tête d'une variante — `apps/api/src/testing/studio-ecritures-architecture.test.ts`, commit 4643cfa, 2026-10-19 12:39
  - TR-IF-006 : mode essai — enveloppe complète validée, effets calculés (l1 créée), rien n'est écrit (tête inchangée) — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-IF-006 : mode appliquer — révision écrite, auteur = la session — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - IF-006 [−] portée déclarée d'un autre projet, cible non touchée, opération fausse, actorId forgé, lecteur en essai : refus atomique, aucune écriture ni permission — `apps/api/src/routes/studio-g2.preuves-g2.test.ts`, commit 2e1564d, 2026-10-26 06:26
  - TR-IF-006 : portée déclarée différente de l'adresse : 400 scope_mismatch, rien n'est écrit — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-007

- **Libellé exact (REF-02, § w:p 664)** : IF-007 — Statuts des jobs. queued → loading → running → completed, avec branches cancel_requested, cancelled, failed, superseded, timed_out. Une demande d’annulation n’équivaut pas immédiatement à un arrêt matériel ; le résultat d’une tâche finalement terminée après annulation ne peut être engagé sans nouvelle vérification.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : D
- **Contrat** : IF-007,IF-003,IF-007 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts`, `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts`
- **Décisions** : DEC-11,DEC-13 · **Scénarios** : 014,015
- **Test positif prescrit** : Job parcourt queued/loading/running/completed avec source et suivi puis résultat validé.
- **Test négatif prescrit** : cancel_requested suivi completion ou timeout/crash : résultat non engagé sans nouvelle vérification et pending résolu.
- **Preuve (contrôles positifs exécutés)** : 4
  - cas positif : queued → loading → running → completed, chaque statut tracé avec sa révision source, résultat remis une fois — `apps/web/src/modules/studio/taches/statuts-if007.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - loading passe à running à la première progression ; sans chargement annoncé, la tâche démarre directement en running — `apps/web/src/modules/studio/taches/statuts-if007.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - demande d'annulation d'une tâche encore en file : annulée sans avoir tourné — `apps/web/src/modules/studio/taches/statuts-if007.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - première tâche : loading tant que le Worker n'a rien répondu, running à sa première progression ; tâche suivante sur le Worker vivant : running directement — `apps/web/src/modules/studio/taches/statuts-if007.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - cas négatif : cancel_requested n'arrête pas matériellement — emplacement gardé ; le calcul finit quand même : résultat NON engagé, puis seulement après vérification — `apps/web/src/modules/studio/taches/statuts-if007.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - cancel_requested puis échec ou délai : attente résolue « cancelled », jamais laissée en suspens — `apps/web/src/modules/studio/taches/statuts-if007.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - superseded : une tâche plus récente de la même clé remplace la précédente ; son résultat tardif est stale, jamais remis ; timed_out nommé — `apps/web/src/modules/studio/taches/statuts-if007.test.ts`, commit 085a8f3, 2026-10-26 04:35
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-008

- **Libellé exact (REF-02, § w:p 731)** : IF-008 — Résultat quantitatif. quantityId + sourceRevisionSet + ruleId + ruleVersion + sourceObjectIds + unit + rawValue + deductions + displayValue + freshnessStatus ; manualAdjustment est facultatif, distinct, motivé et attribué. La décision de structure physique reste ouverte.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 009,010
- **Test positif prescrit** : Quantité mur retrouve sourceRevisionSet/ruleVersion/sourceObjectIds/unité/raw/deductions/display/freshness.
- **Test négatif prescrit** : manualAdjustment sans motif/auteur ou unit incompatible : refus/signalement, rawValue conservé.
- **Preuve (contrôles positifs exécutés)** : 3
  - IF-008 [+] la quantité du mur porte quantityId, sourceRevisionSet, ruleId / ruleVersion, sourceObjectIds, unit, rawValue, deductions, displayValue, freshnessStatus — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-008 [+] l'ajustement en vigueur est porté à part (motif, auteur, date), rawValue intacte, freshnessStatus contre la tête — `apps/api/src/lib/studio-quantites.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - IF-008 [+] API : chaque quantité porte quantityId, sourceRevisionSet, ruleId / ruleVersion, objets, unité, valeur brute, affichage et actualité — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - IF-008 [+] freshnessStatus : à jour sur la tête, périmée après une nouvelle révision, source inconnue si la variante disparaît — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-008 [−] ajustement manuel sans motif, sans auteur ou d'une unité incohérente : refusé, rawValue conservée ; recevable, il reste distinct — `packages/atelier-model/src/studio/resultats-quantitatifs.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-008 [−] un ajustement dont la cible a changé (à revoir) n'est pas porté comme correction : la valeur calculée seule fait foi — `apps/api/src/lib/studio-quantites.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-009

- **Libellé exact (REF-02, § w:p 765)** : IF-009 — Publication. Le manifeste contient : identifiant, intention/usage, date, auteur, état d’approbation, liste ordonnée de documentId + version + empreinte, références de modèles et de règles, rapports de contrôle et observations bloquantes résolues ou dérogées, ainsi que la décision d’approbation sur cet ensemble exact.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-009,IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 030,038
- **Test positif prescrit** : Manifeste ordonné contient documentId/version/empreinte, modèles/règles/contrôles et décision de l’ensemble exact.
- **Test négatif prescrit** : Pièce changée/manquante ou observation bloquante sans résolution/dérogation : publication refusée.
- **Preuve (contrôles positifs exécutés)** : 2
  - IF-009 [+] le manifeste porte usage, documents ordonnés et empreintes, sources (modèles), règles, rapports de contrôle et observations bloquantes résolues — `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - IF-009 : publication dérogée approuvée puis diffusée — `apps/web/e2e/studio-pub.mjs`, commit 085a8f3, 2026-10-26 04:39
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - IF-009 [−] observation bloquante ni résolue ni dérogée : soumission, approbation et diffusion refusées (409 blocking_observation_open) — `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - IF-009 [−] contrôles changés depuis le manifeste (observation résolue, nouveau rapport) : écart « controles », l'approbation de l'ancien ensemble ne vaut plus — `apps/api/src/lib/studio-publication-manifeste.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - IF-009 [−] API : observation bloquante ouverte → soumission refusée (409 blocking_observation_open) ; dérogée par décision du propriétaire → manifeste à actualiser, puis soumission admise — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-010

- **Libellé exact (REF-02, § w:p 819)** : IF-010 — Observation. Champs : issueId, catégorie, source du contrôle, révisions examinées, objets/vues, auteur, gravité selon règles décidées, description et pièces justificatives, responsable éventuel, état, journal de décisions, références des recontrôles et condition de clôture. Les identifiants BCF éventuels sont conservés comme références, non assimilés automatiquement aux identifiants internes.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-010,IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 029
- **Test positif prescrit** : Observation garde issueId/catégorie/règle/révisions/objets/vue/auteur/gravité/pièces/responsable/journal/recontrôles/clôture.
- **Test négatif prescrit** : Même BCF-ID reçu dans autre contexte : ne pas écraser ID interne ni clore par disparition objet.
- **Preuve (contrôles positifs exécutés)** : 6
  - IF-010 [+] export BCF 2.1 relu à l'identique : Guid stable, catégorie, gravité, statut, objets, commentaires — `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-010 [+] import : sujets nouveaux créés, objets inconnus conservés comme références — `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-010 [+] l'observation garde issueId, catégorie, source du contrôle, révisions, objets, vue, auteur, gravité, description, pièces, responsable, état, décisions, recontrôles, clôture et références B… — `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - IF-010 [+] API : l'observation porte issueId distinct, catégorie, gravité et pièce justificative téléchargeable, vérifiée par empreinte — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - Lot PUB (IF-010) : exporter et importer en BCF — Ctrl+Alt+Maj+Y, I, dans la barre du panneau Observations — `apps/web/src/modules/collaboration/commandes-collaboration.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-010 : export BCF (.bcfzip) servi — `apps/web/e2e/studio-pub.mjs`, commit 085a8f3, 2026-10-26 04:39
- **Contre-preuve (contrôles négatifs exécutés)** : 5
  - IF-010 [−] même BCF-ID reçu dans un autre contexte : nouvelle observation distincte, l'identité interne n'est ni écrasée ni fusionnée ; un sujet absent ne clôt rien — `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-010 [−] sujet sans Guid valide : non repris, avertissement ; fichier sans sujet signalé — `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts`, commit 085a8f3, 2026-10-26 04:35
  - IF-010 [+] catégorie, gravité et pièces se saisissent à l'ouverture ; une gravité ou une pièce hors vocabulaire est refusée ; l'empreinte de rejeu cite les pièces par leur SHA-256 — `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - IF-010 [−] valeur absente : catégorie et gravité « non évaluées » (null), aucune pièce ni référence BCF inventée — `apps/api/src/lib/studio-observations-contrat.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - IF-010 [−] API : même BCF-ID reçu dans un autre contexte → observation distincte ; même contexte → reconnu sans réécriture ; l'export relu garde les Guid — `apps/api/src/routes/studio-pub.preuves-pub.test.ts`, commit 085a8f3, 2026-10-26 04:45
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-IF-011

- **Libellé exact (REF-02, § w:p 868)** : IF-011 — Journal de changement. Événement avec eventId, transaction, auteur, étude/variante, révision base/issue, effets, horodatage serveur et relation éventuelle à un job. La diffusion de notifications ne constitue pas une confirmation métier sans engagement préalable.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-011,IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 013
- **Test positif prescrit** : Après engagement durable, événement garde eventId/transaction/auteur/étude/variante/base/issue/effets/date/job éventuel.
- **Test négatif prescrit** : Notification reçue avant commit ou transaction échouée : aucune confirmation métier fausse.
- **Preuve (contrôles positifs exécutés)** : 3
  - IF-011 [+] : après engagement durable, l'événement garde eventId, transaction, auteur, étude, variante, base, issue, effets, horodatage serveur — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
  - IF-011 : un événement par révision engagée — eventId, transaction (applicative et PostgreSQL), auteur, étude, variante, base, issue, effets, horodatage serveur — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
  - EX-045 [+] / IF-011 : confirmation sur base valide — révision écrite, événement relié au job — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - IF-011 [−] : transaction échouée — aucun événement, aucune révision, aucune notification ; la notification suit l'engagement — `apps/api/src/routes/studio-cmd.test.ts`, commit 4304050, 2026-10-26 03:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-001

- **Libellé exact (REF-02, § w:p 207, 208)** : Une approbation référence exactement les éléments présentés à la décision.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 030,038
- **Test positif prescrit** : Approuver ensemble A/R12 et B/R7 puis relire décision avec empreintes exactes.
- **Test négatif prescrit** : Modifier B après décision : publication sous ancienne approbation bloquée.
- **Preuve (contrôles positifs exécutés)** : 2
  - INV-001 [+] A et B approuvées ensemble : la décision relue porte le manifeste dont les sources nomment A et B avec leurs révisions et empreintes exactes — `apps/api/src/routes/studio-invariants.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:58
  - INV-001 [+] l'approbation enregistre le manifeste, la révision et l'empreinte du document présentés — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - INV-001 [−] la variante coordonnée B modifiée entre l'approbation et la diffusion : diffusion refusée (409 manifest_mismatch, écart sur B), aucun paquet — `apps/api/src/routes/studio-invariants.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:58
  - INV-001 [−] un autre ensemble (manifeste, révision ou document) est refusé : 409 revision_mismatch, rien n'est approuvé — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-001 BLOC-05 [−] la tête change après l'approbation : diffuser → 409 manifest_mismatch, aucun paquet — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-002

- **Libellé exact (REF-02, § w:p 209, 210)** : Une définition architecturale associée possède une autorité unique.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A4 + A5 · **Lot** : A/C
- **Contrat** : IF-002,IF-004,IF-006 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/plan2d/Plan2D.tsx`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`, `packages/planche-model/src`
- **Décisions** : DEC-01,DEC-02,DEC-09 · **Scénarios** : 003
- **Test positif prescrit** : Modifier mur en 2D puis en 3D et comparer objectId/relations/révision identiques.
- **Test négatif prescrit** : Deux identités concurrentes créées selon planche : défaut éliminatoire signalé.
- **Preuve (contrôles positifs exécutés)** : 3
  - INV-002 : même révision serveur affichée par la planche 2D (barre d'état) et par la vue 3D — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
  - TEST-003 : dans la vue 3D, le même mur (même identifiant) porte déjà la hauteur 3,2 m saisie en 2D — `apps/web/e2e/studio-navigation.mjs`, commit 44c6ef4, 2026-10-25 16:14
  - TEST-003 : enregistré en deux studio.architecture.modifier sur le même objectId — `apps/web/e2e/studio-navigation.mjs`, commit 44c6ef4, 2026-10-25 16:14
- **Contre-preuve (contrôles négatifs exécutés)** : à produire
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-003

- **Libellé exact (REF-02, § w:p 211, 212)** : Une copie indépendante ne propage pas vers son origine.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 004
- **Test positif prescrit** : Cloner variante avec nouvelles identités et provenance, modifier clone puis relire source inchangée.
- **Test négatif prescrit** : Ancien identifiant réutilisé dans nouveau propriétaire ou propagation implicite : rejeter/détecter.
- **Preuve (contrôles positifs exécutés)** : 2
  - TR-INV-003 [+] copie indépendante : chaque élément reçoit une nouvelle identité, la provenance pointe vers sa source, les références internes suivent — `packages/atelier-model/src/studio/copie-independante.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-INV-003 : modifier la copie ne propage rien vers la source (révision et document inchangés) — `apps/web/e2e/studio-dec.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - TR-INV-003 [−] une copie qui réutilise un ancien identifiant dans le nouveau propriétaire est détectée ; un suffixe invalide est refusé — `packages/atelier-model/src/studio/copie-independante.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-INV-003 [+] une identité nouvelle ne heurte jamais une identité déjà prise (départage), et reste dans la limite de 128 caractères — `packages/atelier-model/src/studio/copie-independante.test.ts`, commit 4304050, 2026-10-26 03:10
  - TR-INV-003 [−] l'ancien identifiant est sans prise sur la copie ; un mode sans source ou inconnu est refusé ; un rejeu d'un autre mode est un conflit, sans écriture — `apps/api/src/routes/studio-derivation-copie.test.ts`, commit 4304050, 2026-10-26 03:21
  - TR-INV-003 : la copie porte de nouvelles identités (aucun identifiant de la source réutilisé), chacune reliée à sa source — `apps/web/e2e/studio-dec.mjs`, commit 4304050, 2026-10-26 03:17
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-004

- **Libellé exact (REF-02, § w:p 213, 214)** : Une exigence approuvée reste distincte du résultat de conception.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-010 · **Composants candidats** : `packages/atelier-model/src/coordination.ts`, `apps/web/src/modules/programmation`, `apps/web/src/modules/analyses`
- **Décisions** : DEC-02,DEC-16 · **Scénarios** : 027
- **Test positif prescrit** : Exigence 28m² et dessin 26m² : afficher écart -2m² et conserver exigence versionnée.
- **Test négatif prescrit** : Modifier surface dessinée : ne réécrit pas cible à 26 ; commande exigence sans droit refusée.
- **Preuve (contrôles positifs exécutés)** : 2
  - INV-004 [+] exigence 28 m², dessin 26 m² : le panneau affiche l'écart −2 m² et l'exigence versionnée v1 à 28 m² — `apps/web/src/modules/studio/exigences/exigences-ui.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:49
  - INV-004 [+] le contrôle mesure le document et rend un écart ; ni l'exigence ni le document ne sont réécrits — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit 44c6ef4, 2026-10-25 16:08
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - INV-004 [−] la surface dessinée modifiée (26 → 27 m²) ne réécrit pas la cible : exigence toujours 28 m² en v1, écart −1 m² recalculé — `apps/web/src/modules/studio/exigences/exigences-ui.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:49
  - INV-004 [−] une exigence ne s'écrit pas dans le document, et une acceptation ne vient jamais du client — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit 44c6ef4, 2026-10-25 16:08
  - TEST-027 [+] modifier le rectangle dessiné (2 × 1 → 3 × 1) fait passer l'écart signé de 0 à +1 m² ; l'exigence n'est pas réécrite — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit 44c6ef4, 2026-10-25 16:08
  - chaque cellule rend l'attendu ; aucun refus n'écrit quoi que ce soit — `apps/api/src/routes/studio-permissions.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-005

- **Libellé exact (REF-02, § w:p 215, 216)** : Une opération rejetée ne modifie pas partiellement les données canoniques.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 008
- **Test positif prescrit** : Appliquer lot mur/ouverture valide et constater engagement groupé durable.
- **Test négatif prescrit** : Deuxième opération du lot invalide : aucune partie de la première ne persiste.
- **Preuve (contrôles positifs exécutés)** : 3
  - architecture : une enveloppe (mur, ouverture, modifier), même identité de l'ouverture — `apps/web/e2e/studio-navigation.mjs`, commit f59d66d, 2026-10-19 06:50
  - architecture : l'actualisation restitue le même mur et la même ouverture — `apps/web/e2e/studio-navigation.mjs`, commit f59d66d, 2026-10-19 06:50
  - INV-005 [+] un lot valide est appliqué en entier : une révision, tête avancée — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - Ouverture incompatible avec son mur : refus atomique, motif clair, rien n'est rogné — `packages/atelier-model/src/studio/architecture/architecture.test.ts`, commit f59d66d, 2026-10-19 06:45
  - INV-005 [−] refus au milieu du lot, ou panne après l'insertion de la révision : aucune ligne modifiée — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - A.4 : aucun refus n'a créé de révision (tête = élargissement) — `apps/web/e2e/studio-persistance.mjs`, commit f59d66d, 2026-10-19 06:49
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-006

- **Libellé exact (REF-02, § w:p 217, 218)** : Un résultat dérivé ancien est identifiable et n’écrase pas le résultat courant.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 014
- **Test positif prescrit** : Après commande R13, scène affiche sourceRevisionId et données périmées puis se recalcule.
- **Test négatif prescrit** : Résultat worker R12 arrive : ne remplace pas projection courante comme si source R13.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - INV-006 : un résultat calculé sur R12 arrivé quand R13 est courante est ignoré, il n'écrase pas l'état courant — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
  - INV-006 [−] : un résultat calculé sur R12 n'est jamais présenté à jour pour R13 ; échec explicite avec l'ancienne image — `apps/web/src/modules/studio/vue3d/etat-projection.test.ts`, commit 4304050, 2026-10-26 03:10
  - EX-016 / INV-006 : après l'enregistrement, la vue 3D est « À jour pour la révision » de la nouvelle tête, sans données périmées — `apps/web/e2e/studio-cmd.mjs`, commit 4304050, 2026-10-26 03:17
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-007

- **Libellé exact (REF-02, § w:p 219, 220)** : Une optimisation préserve les résultats métier dans les tolérances déclarées.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A1 · **Lot** : X
- **Contrat** : IF-002,IF-003 · **Composants candidats** : `docs/atelier/p0-mesures.md`, `docs/atelier/p2-mesures.md`, `apps/web/e2e`, `.github/workflows`
- **Décisions** : DEC-13 · **Scénarios** : 022,023,025
- **Test positif prescrit** : Comparer performance ET cibles/quantités/historique/export avant/après optimisation.
- **Test négatif prescrit** : Gain p95 avec snapping ou volume différent hors tolérance : optimisation rejetée.
- **Preuve (contrôles positifs exécutés)** : 1
  - INV-007 [+] : optimisation (maillage incrémental) comparée en p95 ET en résultats métier — préservée dans la tolérance — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - INV-007 [−] : gain de p95 avec un résultat hors tolérance (volume différent) — optimisation rejetée — `packages/atelier-model/src/studio/cmd/cmd.test.ts`, commit 4304050, 2026-10-26 03:10
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-008

- **Libellé exact (REF-02, § w:p 221, 222)** : Un cache/index/projection est reconstruisible depuis la donnée de référence.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : C
- **Contrat** : IF-002,IF-003,IF-011 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/vue3d/scene3d.ts`, `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts`
- **Décisions** : DEC-09,DEC-10,DEC-13 · **Scénarios** : 023
- **Test positif prescrit** : Détruire cache scène/index puis reconstruire depuis modèle et vérifier table triangle→objectId.
- **Test négatif prescrit** : Batch de plusieurs objets ou objet supprimé : aucun triangle sélectionnable avec ID obsolète.
- **Preuve (contrôles positifs exécutés)** : 1
  - INV-008 [+] cache de maillage et scène (index de désignation) détruits puis reconstruits depuis le document : même maillage, même table triangle → objectId — `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:49
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - INV-008 [−] lot de plusieurs objets puis objet supprimé : aucun triangle de la scène ne désigne un identifiant obsolète — `apps/web/src/modules/studio/vue3d/scene-rendu.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:49
  - INV-008 [+] sans aucun cache, la projection se reconstruit entièrement depuis le document (premier calcul) — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-008 [−] des morceaux altérés (clé périmée, objet disparu) ne sont pas crus : ils sont remaillés depuis le document — `packages/atelier-model/src/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-009

- **Libellé exact (REF-02, § w:p 223, 224)** : Un profil personnalisé ne change ni données, ni droits, ni révision de conception.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : 018,019
- **Test positif prescrit** : Changer standard→métier→personnel et masquer bouton : modèle/révision/droits inchangés et outil retrouvable.
- **Test négatif prescrit** : Importer profil avec Publier sans droit : exécution refusée ; masquer outil ne supprime pas ses objets.
- **Preuve (contrôles positifs exécutés)** : à produire
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - INV-009 : un lecteur importe un profil qui montre la Ligne — préférences changées, mais ni données, ni droits, ni révision : ses commandes restent refusées — `apps/api/src/routes/studio-profils-import.test.ts`, commit 085a8f3, 2026-10-26 04:45
  - TR-INV-009 : le catalogue autorisé de l'éditeur est inchangé — Publier toujours refusé — `apps/web/e2e/studio-out.mjs`, commit 085a8f3, 2026-10-26 04:41
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-010

- **Libellé exact (REF-02, § w:p 225, 226)** : Une requête IA ou extension passe par les mêmes validations centrales qu’une action humaine.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A5 + A6 + A2 · **Lot** : X
- **Contrat** : IF-001,IF-006,IF-007,IF-009 · **Composants candidats** : `apps/api/src/app.ts`, `.github/workflows`, `packages/geometry-exact`, `docs/atelier/decisions.md`
- **Décisions** : DEC-11,DEC-15,DEC-18 · **Scénarios** : 033,035
- **Test positif prescrit** : Action humaine puis requête IA autorisée passent même schéma/droits/révision.
- **Test négatif prescrit** : Adaptateur IA forge actorId ou appelle stockage directement : refus ; aucune mutation.
- **Preuve (contrôles positifs exécutés)** : 3
  - TR-INV-010 [+] historique des révisions : source « agent-mcp » pour la proposition confirmée, « authenticated-session » pour l'enregistrement humain ; journal : appels de l'agent (jeton) et décisions… — `apps/api/src/routes/studio-agents.test.ts`, commit 4304050, 2026-10-26 03:21
  - TR-INV-010 : la révision confirmée porte la source « agent-mcp » ; l'enregistrement humain garde « authenticated-session » — `apps/web/e2e/studio-lot-f.mjs`, commit 4304050, 2026-10-26 03:17
  - TR-INV-010 : journal agent / humain — `apps/web/e2e/studio-lot-f.mjs`, commit 4304050, 2026-10-26 03:17
- **Contre-preuve (contrôles négatifs exécutés)** : 1
  - TR-INV-010 [−] un corps qui se déclare « agent » ou une source ne change rien : la route humaine écrit « authenticated-session », le journal reste en ajout seul — `apps/api/src/routes/studio-agents.test.ts`, commit 4304050, 2026-10-26 03:21
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-011

- **Libellé exact (REF-02, § w:p 227, 228)** : Les annulations concurrentes ne détruisent pas silencieusement le travail d’un autre acteur.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A5 · **Lot** : A/D/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `packages/atelier-model/src/commandes/base.ts`, `apps/web/src/modules/atelier/nouveau/planche/historique.ts`, `packages/planche-model/src/delta.ts`
- **Décisions** : DEC-12,DEC-11 · **Scénarios** : 012
- **Test positif prescrit** : Annuler commande C1 après C2 compatible via nouvelle inverse validée sur révision actuelle.
- **Test négatif prescrit** : C2 d'autre utilisateur incompatible : conflit, jamais suppression silencieuse du travail d'autrui.
- **Preuve (contrôles positifs exécutés)** : 2
  - INV-011 [+] le brouillon reporté sur la tête d'autrui s'annule sans retirer le changement d'autrui — `apps/web/src/modules/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - annuler chez A : rien n'est écrit, les changements de B restent dans la tête — `apps/web/e2e/studio-conflits.mjs`, commit 4643cfa, 2026-10-19 12:43
- **Contre-preuve (contrôles négatifs exécutés)** : 3
  - INV-011 [+] A annule son propre ajout (élément distinct) : refus 409 sans chevauchement, reporté sur la tête, le travail de B demeure — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-011 [−] l'annulation de A retirerait `a` modifié par B : conflit signalé (chevauchement objects:a), tête de B intacte — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - INV-011 [−] un pas local qui retire l'objet modifié par autrui est signalé au report (chevauchement), jamais appliqué en silence — `apps/web/src/modules/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-012

- **Libellé exact (REF-02, § w:p 229, 230)** : Une publication antérieure n’est pas réécrite par la création d’une nouvelle publication.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A1 + A2 + A5 · **Lot** : E
- **Contrat** : IF-008,IF-009 · **Composants candidats** : `packages/atelier-model/src/documents`, `apps/api/src/db/schema.ts`, `apps/web/src/modules/documents`
- **Décisions** : DEC-16 · **Scénarios** : 031
- **Test positif prescrit** : Retirer/remplacer publication par événement journalisé en gardant ancienne identité/contenu selon politique.
- **Test négatif prescrit** : Nouvelle diffusion écrase manifestes/fichiers historiques : refus et défaut éliminatoire.
- **Preuve (contrôles positifs exécutés)** : 3
  - INV-012 : publication relue identique (paquet, manifeste, révision, approbation) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-012 [+] une nouvelle diffusion marque l'ancienne « remplacée » par un évènement journalisé ; son identité, son paquet et son manifeste restent identiques — `apps/api/src/routes/studio-invariants.preuves-d2.test.ts`, commit bf775d9, 2026-10-25 21:58
  - INV-012 [+] une seconde diffusion remplace la première : statut « remplacé » journalisé, paquet et manifeste d'origine identiques — `apps/api/src/routes/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 9
  - INV-012 [−] : publication diffusée, réécriture directe refusée par la base (paquet, rôle fadi_app) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-012 [−] : publication diffusée, réécriture directe refusée par la base (empreinte du paquet, rôle fadi_app) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-012 [−] : publication diffusée, réécriture directe refusée par la base (manifeste, rôle fadi_app) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-012 [−] : publication diffusée, réécriture directe refusée par la base (empreinte du manifeste, rôle fadi_app) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-012 [−] : publication diffusée, réécriture directe refusée par la base (révision examinée, rôle fadi_app) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-012 [−] : publication diffusée, réécriture directe refusée par la base (empreinte du document, rôle fadi_app) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - … et 3 autre(s) au registre
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-013

- **Libellé exact (REF-02, § w:p 231, 232)** : Une annotation référencée à une face modifiée est conservée avec correspondance vérifiée ou marquée « à résoudre ».
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A1 + A6 · **Lot** : A/R
- **Contrat** : IF-004,IF-006,IF-011 · **Composants candidats** : `apps/api/src/db/schema.ts`, `packages/atelier-model/src/versions.ts`, `packages/atelier-model/src/commandes/base.ts`
- **Décisions** : DEC-01,DEC-02,DEC-03,DEC-12 · **Scénarios** : 007
- **Test positif prescrit** : Diviser face portant cote : correspondance topologique démontrée ou cote conservée à résoudre.
- **Test négatif prescrit** : Deux faces voisines plausibles : aucun rattachement automatique par seule proximité.
- **Preuve (contrôles positifs exécutés)** : 11
  - création : hauteur (base / sommet), largeur et profondeur (faces latérales opposées), valeurs dérivées ; document valide — `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - pousser / tirer la face référencée : même cote, même face, valeur suivie ; déplacer, pivoter (z et basculement) : inchangée — `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - diviser une autre face : les faces latérales suivantes sont renumérotées et la cote réattachée par preuve (même plan, même arête) — `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - résolution explicite : la même commande, sur la cote « à résoudre », la rattache aux faces choisies par la personne — `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - effets de la commande : la cote est une référence du solide ; la contrainte « à résoudre » apparaît quand la face divisée la portait ; copie indépendante : références reportées — `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - diviser la face qui porte la cote : deux faces voisines coplanaires plausibles — la cote est conservée, marquée « à résoudre », valeur non évaluée, faces inchangées — `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - … et 5 autre(s) au registre
- **Contre-preuve (contrôles négatifs exécutés)** : 4
  - création refusée : faces non parallèles, face inexistante, solide absent, état « à résoudre » saisi, faces identiques, champ inconnu — `packages/atelier-model/src/studio/objets-3d/cotes-faces.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - INV-013 : les cotes de face sont déclarées non couvertes par l'IFC, jamais exportées en silence — `packages/atelier-model/src/studio/echanges/rapport-fidelite.test.ts`, commit 2e1564d, 2026-10-26 06:14
  - TR-INV-013 (règle d'or) : Cote de face 3D (Maj+F12) active l'outil ; aucune face proposée — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
  - TR-INV-013 : face cotée divisée — deux moitiés plausibles, aucune choisie : cote conservée « à résoudre » — `apps/web/e2e/studio-g2.mjs`, commit 2e1564d, 2026-10-26 06:24
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-014

- **Libellé exact (REF-02, § w:p 233, 234)** : Le mode hors connexion différencie travail local, confirmation serveur et droits à reverifier.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A2 + A6 + A5 · **Lot** : B/R
- **Contrat** : IF-005,IF-006 · **Composants candidats** : `apps/web/vite.config.ts`, `apps/web/src/lib`, `packages/planche-model/src/outils/index.ts`
- **Décisions** : DEC-07,DEC-14 · **Scénarios** : 020,021
- **Test positif prescrit** : Passer offline avec profil préparé et utiliser outil dont code/dépendances/données sont compatibles.
- **Test négatif prescrit** : Outil absent du cache : indisponible explicite ; commande centrale préparée ne devient pas publiée/approuvée.
- **Preuve (contrôles positifs exécutés)** : 4
  - INV-014 : au retour du réseau, les cartes relues portent l'état serveur (en revue ; approuvé non diffusé) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - rechargement hors ligne : coquille et éditeur servis depuis le cache, brouillon restauré — `apps/web/e2e/studio-hors-ligne.mjs`, commit 44c6ef4, 2026-10-25 16:15
  - hors ligne, enveloppe en attente : le dessin reste permis — `apps/web/e2e/studio-hors-ligne.mjs`, commit 44c6ef4, 2026-10-25 16:15
  - INV-014 [+] trois états distincts : travail local conservé, enveloppes en attente de confirmation, confirmé en ligne — `apps/web/src/modules/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **Contre-preuve (contrôles négatifs exécutés)** : 8
  - INV-014 [−] : approbation tentée hors connexion — « Action non confirmée », la carte reste « en revue », non diffusée — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-014 [−] : le serveur garde le dossier en revue, sans approbation — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-014 [−] : diffusion tentée hors connexion — « Action non confirmée », la carte reste non diffusée, aucun paquet affiché — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - INV-014 [−] : le serveur n'a rien diffusé (aucun paquet) — `apps/web/e2e/studio-preuves-d2.mjs`, commit bf775d9, 2026-10-25 21:55
  - TEST-021 : aucune publication anticipée — aucun POST /publications, liste inchangée — `apps/web/e2e/studio-hors-ligne.mjs`, commit 44c6ef4, 2026-10-25 16:15
  - INV-014 [−] une enveloppe non accusée n'est jamais montrée confirmée ; un brouillon d'un autre compte n'est ni relu ni rejoué — `apps/web/src/modules/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - … et 2 autre(s) au registre
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

### TR-INV-015

- **Libellé exact (REF-02, § w:p 235, 236)** : Un outil masqué reste retrouvable s’il est autorisé, et n’est pas désinstallé implicitement.
- **Source** : `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx` (blob ce7cf463e34c) · **Responsable** : A4 + A2 + A1 · **Lot** : B/I
- **Contrat** : IF-005 · **Composants candidats** : `apps/web/src/modules/atelier/nouveau/planche`, `apps/web/src/lib/i18n`
- **Décisions** : DEC-04,DEC-06 · **Scénarios** : 017,018
- **Test positif prescrit** : Masquer outil favori puis le retrouver dans catalogue autorisé.
- **Test négatif prescrit** : Chercher outil interdit/incompatible : descriptif consultable selon politique, pas d'action exécutable.
- **Preuve (contrôles positifs exécutés)** : 4
  - INV-015 [+] chaque outil masqué par un profil métier reste au catalogue et se retrouve par son nom — `apps/web/src/modules/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
  - profil Cotation : Ligne masquée des barres, raccourci actif, toujours au catalogue — `apps/web/e2e/studio-profils.mjs`, commit f59d66d, 2026-10-19 06:50
  - lecteur : le gestionnaire dit pourquoi — `apps/web/e2e/studio-catalogue.mjs`, commit 4643cfa, 2026-10-19 12:43
  - lecteur : la palette dit pourquoi — `apps/web/e2e/studio-catalogue.mjs`, commit 4643cfa, 2026-10-19 12:43
- **Contre-preuve (contrôles négatifs exécutés)** : 2
  - lecteur : outil favori, dans son profil et son regroupement, toujours refusé (403) — `apps/web/e2e/studio-catalogue.mjs`, commit 4643cfa, 2026-10-19 12:43
  - INV-015 [−] changer de profil ne retire rien des listes ; hors connexion, un outil sans moteur est indiqué indisponible, jamais retiré — `apps/web/src/modules/studio/studio-invariants.test.ts`, commit cf09271, 2026-10-19 14:33
- **État** : Vérifié · **Tests** : Exécuté · **Verdict de conformité** : Non évaluée pour le produit Studio
- **Suite** : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée.

