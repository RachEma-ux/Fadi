# Fadi — Studio de conception architecturale

## Liste exhaustive des tâches à exécuter

**Version 1.0 · 18 octobre 2026 · STUDIO-TASKS-001**

**Objectif imposé : « Studio » dans la barre latérale verticale de Fadi, comme module autonome.**

**Base et portée.** Transformation du plan joint « Fadi_Studio_Plan_Implementation_V1_0.md » (STUDIO-PLAN-001, V1.0, 18 octobre 2026). Les 11 chapitres et 4 annexes sont conservés. L’exhaustivité porte sur les actions, contrôles et registres décrits dans ce plan ; les contrats restant à définir ne sont pas complétés par des fonctionnalités inventées.

**État initial.** 630 cases à cocher, toutes décochées. Aucune réalisation ni conformité actuelle n’est présumée. Ce document organise le travail ; il ne vaut ni autorisation de code ou de déploiement, ni preuve d’exécution.

**Clôture d’une tâche.** Cocher uniquement lorsque son résultat attendu est obtenu et la preuve ou décision pertinente enregistrée. Une tâche d’instruction ou de traçabilité achevée ne signifie pas que la fonction correspondante est implémentée. Les tests non conformes restent décochés.

**Options et récurrence.** Les routes candidates et les options P2 restent soumises à arbitrage. Une option exclue ou reportée est indiquée comme telle, sans cocher sa réalisation. Les contrôles de PR, de reprise et de livraison sont à répéter à chaque occurrence concernée.

**Suivi associé.** Pour chaque identifiant, conserver dans le registre du chantier : responsable, état, dépendances, Issue/PR, composant, test, preuve et décision applicables. Les états de travail restent distincts du verdict de conformité et de l’état d’exécution d’un test.

## Vue d’ensemble du suivi

| Partie | Cases à cocher |
|---|---:|
| 1. Sources, portée et décisions de cadrage | 18 |
| 2. Insertion de Studio dans l’application | 36 |
| 3. Architecture de réalisation proposée | 24 |
| 4. Préparation et portes de décision | 19 |
| 5. Lots de réalisation et acceptation | 214 |
| 6. Enchaînement, jalons et première version | 25 |
| 7. Validation et critères de livraison | 19 |
| 8. Migration et exploitation sans perte | 26 |
| 9. Pilotage dans GitHub et continuité | 24 |
| 10. Décisions et risques avant engagement | 15 |
| 11. Vérification de la première séquence et clôture | 8 |
| Annexe A. Exécution des 38 scénarios du référentiel | 38 |
| Annexe B. Instruction des 18 décisions ouvertes | 18 |
| Annexe C. Qualification individuelle de la couverture | 141 |
| Annexe D. Provenance et contrôle de la transformation | 5 |
| **Total** | **630** |

Les identifiants `TEST`, `NAV` et `DEC` du plan sont conservés. Les identifiants de tâche `TR-EX`, `TR-INV`, `TR-IF` et `TR-AC` désignent la qualification de leur fiche source, sans renumérotation du référentiel. Les autres identifiants servent au découpage de cette checklist.

Les tâches de réalisation, les recettes et les jalons ont des finalités différentes. Une référence à un même test dans un lot et dans une annexe ne crée pas deux scénarios distincts.

---

## 1. Sources, portée et décisions de cadrage

Fixer le périmètre de travail avant les choix d’implémentation. Les décisions déjà imposées par la demande restent distinctes des propositions à arbitrer.

**18 cases à cocher.**

### 1.1 Références et préséance

**Source :** Plan §1.1 et annexe D.

- [ ] **SRC-01** — Identifier la copie de référence de la Définition officielle V2.1 (REF-01), avec sa version et son empreinte.
- [ ] **SRC-02** — Identifier la copie de référence du Référentiel technique V1.0, STUDIO-RT-001 (REF-02), avec sa version et son empreinte.
- [ ] **SRC-03** — Enregistrer le plan V1.0, STUDIO-PLAN-001, comme source du découpage opérationnel.
- [ ] **SRC-04** — Consigner DEM-01 : un module autonome intitulé exactement « Studio », accessible dans la barre latérale verticale de Fadi.
- [ ] **SRC-05** — Distinguer dans le dossier les principes de la charte, les contrats du référentiel, les propositions du plan et les observations historiques du dépôt.
- [ ] **SRC-06** — Consigner et faire arbitrer toute contradiction entre sources, sans réduire silencieusement la cible au fonctionnement existant.

### 1.2 Résultat attendu et limites

**Source :** Plan §1.2–1.3 et §6.2.

- [ ] **CAD-01** — Décrire le premier usage métier : petite étude réellement terminable, de l’entrée dans Studio à la publication.
- [ ] **CAD-02** — Délimiter le périmètre pilote, ses utilisateurs, ses données et les capacités incluses ou exclues.
- [ ] **CAD-03** — Inscrire les quatre domaines, les deux planches autonomes et le parcours associé dans les critères du pilote.
- [ ] **CAD-04** — Confirmer que l’accès à Studio ne requiert aucune étape du Parcours et ne crée ni ne valide d’étape implicitement.
- [ ] **CAD-05** — Conserver les services généraux de Fadi : pas de seconde application, de second système de comptes ou de base métier concurrente.
- [ ] **CAD-06** — Inscrire explicitement l’absence d’autorisation de suppression de l’Atelier, de modification des 21 étapes et de remplacement systématique des moteurs.
- [ ] **CAD-07** — Maintenir les fonctions industrielles utiles dans l’inventaire à qualifier, sans suppression automatique liée à leur spécialisation.

### 1.3 Arbitrages de cadrage

**Source :** Plan §1.3, §6.2–6.3 et §9.3.

- [ ] **CAD-DEC-01** — Faire ratifier le premier usage métier et ses critères à G0.
- [ ] **CAD-DEC-02** — Affecter les responsables produit, architecture, CAO, backend, frontend, BIM/documentation, qualité/sécurité et exploitation.
- [ ] **CAD-DEC-03** — Préciser les personnes, leur disponibilité et les règles de cumul des responsabilités.
- [ ] **CAD-DEC-04** — Soumettre le placement du bouton « Studio » à décision ; conserver « après Projets » comme proposition, non comme choix déjà adopté.
- [ ] **CAD-DEC-05** — Soumettre les routes, les nouveaux paquets, les budgets et le stockage aux décisions prévues, sans les présenter comme arrêtés.

---

## 2. Insertion de Studio dans l’application

Cette partie prépare et vérifie le contrat d’intégration. La réalisation correspondante figure dans le lot I. Les observations de REP-01 sont à relire sur le commit de réalisation, pas à considérer comme un audit actuel.

**36 cases à cocher.**

### 2.1 Requalification ciblée des points d’intégration

**Source :** Plan §2.1 et annexe D.

- [ ] **REP-01** — Relever le commit de travail et le distinguer de REP-01 : 5cf61d1fed9ed523b331228af20bce93a4f2bf63.
- [ ] **REP-02** — Examiner apps/web/src/App.tsx pour les routes, l’authentification et le chargement différé.
- [ ] **REP-03** — Examiner apps/web/src/routes/AppShell.tsx pour l’entrée verticale et la résolution du contexte projet.
- [ ] **REP-04** — Examiner apps/web/src/routes/ProjectShell.tsx pour isoler les services utiles sans rendre les étapes ou cette enveloppe préalables à Studio.
- [ ] **REP-05** — Examiner apps/web/src/lib/use-immersive.ts pour identifier l’effet de masquage de l’enveloppe Atelier à ne pas activer automatiquement dans Studio.
- [ ] **REP-06** — Examiner apps/web/src/modules/module-registry.ts pour décider l’articulation des descripteurs globaux et des raccourcis projet.
- [ ] **REP-07** — Examiner scripts/check-module-deps.mjs pour les frontières existantes et celles à ajouter pour Studio.
- [ ] **REP-08** — Examiner docs/continuity/README.md pour appliquer le protocole de suivi et de reprise existant.
- [ ] **REP-09** — Requalifier les observations historiques de l’annexe A de REF-02 sur les moteurs, en distinguant lecture statique et tests exécutés.

### 2.2 Contrat de navigation

**Source :** Plan §2.2.

- [ ] **UX-01** — Spécifier l’entrée « Studio » au même niveau de navigation qu’Accueil et Projets.
- [ ] **UX-02** — Spécifier le texte « Studio » dans la barre dépliée et son maintien dans l’état actif du module.
- [ ] **UX-03** — Spécifier le nom accessible et l’infobulle « Studio » pour l’icône en barre repliée.
- [ ] **UX-04** — Spécifier l’accès à la même entrée depuis le menu vertical adaptatif sur mobile.
- [ ] **UX-05** — Spécifier le plein écran comme action explicite, avec sortie visible, sans masquage automatique de la navigation.
- [ ] **UX-06** — Spécifier l’accueil : projets et études accessibles, sélection et création d’une étude.
- [ ] **UX-07** — Spécifier la reprise d’un contexte projet transmis uniquement lorsqu’il est valide et autorisé.
- [ ] **UX-08** — Spécifier le choix explicite du projet en l’absence de contexte, sans projet fictif ni géométrie orpheline.
- [ ] **UX-09** — Limiter le dernier contexte personnel à une suggestion : il ne remplace ni une permission ni le contexte demandé dans l’URL.

### 2.3 Routes candidates et contexte

**Source :** Plan §2.3 et §10.

Les chemins sont les candidats du plan. Leur transcription dans cette checklist ne vaut pas adoption.

- [ ] **ROUTE-01** — Décrire dans la décision d’intégration l’option /studio pour l’accueil Studio.
- [ ] **ROUTE-02** — Décrire l’option /studio/projets/:projectId pour les études du projet autorisé.
- [ ] **ROUTE-03** — Décrire l’option /studio/projets/:projectId/etudes/:studyId pour le cadrage, les sources et les variantes.
- [ ] **ROUTE-04** — Décrire l’option /studio/projets/:projectId/etudes/:studyId/variantes/:variantId pour l’espace de conception.
- [ ] **ROUTE-05** — Définir la route complète d’une révision dans la hiérarchie projet/étude/variante ; ne pas coder littéralement l’abréviation /studio/.../revisions/:revisionId.
- [ ] **ROUTE-06** — Définir la représentation du domaine et de la planche actifs dans le contrat d’URL.
- [ ] **ROUTE-07** — Définir le comportement à l’ouverture directe, à l’actualisation, au partage du lien et avec précédent/suivant.
- [ ] **ROUTE-08** — Définir les refus d’accès et la vérification serveur de l’appartenance projet/étude/variante/révision.
- [ ] **ROUTE-09** — Faire arbitrer le contrat final des routes avant leur implémentation.

### 2.4 Recette de navigation — NAV-001 à NAV-009

**Source :** Plan §2.4.

Fixer les modalités mobile et plein écran dans la recette UX. Cocher seulement après résultat conforme et preuve jointe.

- [ ] **NAV-001** — Tester et conserver la preuve : « Studio » est présent dans la barre verticale ; nom accessible, clavier et état actif sont corrects.
- [ ] **NAV-002** — Tester et conserver la preuve : Studio s’ouvre sans passer par Parcours ni par l’Atelier actuel ; aucune étape n’est créée ou validée implicitement.
- [ ] **NAV-003** — Tester et conserver la preuve : L’absence de projet/étude conduit à un choix explicite, sans erreur ni objet métier orphelin.
- [ ] **NAV-004** — Tester et conserver la preuve : L’URL, la réouverture et précédent/suivant restituent le contexte autorisé ; un lien interdit ne divulgue pas le contenu.
- [ ] **NAV-005** — Tester et conserver la preuve : Les quatre domaines sont accessibles dans Studio ; les deux planches existent uniquement dans Dessin et modélisation.
- [ ] **NAV-006** — Tester et conserver la preuve : Le bandeau affiche le bon projet, l’étude, la variante et la révision ; l’entrée Projets n’est pas faussement active.
- [ ] **NAV-007** — Tester et conserver la preuve : Changer d’espace n’abandonne pas silencieusement un geste, une commande locale ou une sauvegarde en attente.
- [ ] **NAV-008** — Tester et conserver la preuve : Une erreur de chargement ou de moteur reste récupérable sans bloquer la navigation Fadi ; la barre n’est pas masquée par le mode Atelier.
- [ ] **NAV-009** — Tester et conserver la preuve : Accueil, Projets, Parcours, Atelier et Collaboration conservent leurs parcours testés pendant la coexistence.

---

## 3. Architecture de réalisation proposée

Qualifier les responsabilités et les frontières avant de retenir les composants physiques. Les zones et noms proposés ne sont pas des créations autorisées par la seule existence du plan.

**24 cases à cocher.**

### 3.1 Enveloppe autonome et services partagés

**Source :** Plan §3.1.

- [ ] **ARC-01** — Définir l’enchaînement AppShell → StudioShell → accueil/contexte → quatre domaines → outils → commandes → modèles → projections/services.
- [ ] **ARC-02** — Définir le Registry comme fournisseur de métadonnées du Manager, sans appel réseau de résolution à chaque geste.
- [ ] **ARC-03** — Définir l’interface publique d’authentification et de résolution du projet utilisée par StudioShell, sans dépendance à ProjectShell.
- [ ] **ARC-04** — Définir la frontière du module web candidat apps/web/src/modules/studio/ : écrans, planches, panneaux, état UI et adaptateurs.
- [ ] **ARC-05** — Définir les contrats et modèles purs réutilisables, sans React, DOM ni état graphique ; décider les extractions et noms de paquets après audit.
- [ ] **ARC-06** — Définir la responsabilité des loaders, projections, index, rendu, workers et ordonnanceur partagés côté web.
- [ ] **ARC-07** — Définir les services API pour droits, études, révisions, transactions, jobs, publications et reprise, sans seconde autorité métier.
- [ ] **ARC-08** — Maintenir Studio/ comme dossier documentaire, distinct du module exécutable.
- [ ] **ARC-09** — Définir les interfaces publiques et la direction des dépendances partagées entre Atelier et Studio ; ne pas imposer un paquet par bouton.
- [ ] **ARC-10** — Exclure l’intégration par iframe de l’Atelier complet et l’utilisation des cartes mentales HTML comme module applicatif.

### 3.2 Autorités de données et contrat de commandes

**Source :** Plan §3.2.

- [ ] **ARC-DATA-01** — Définir l’autorité du document 2D indépendant sur ses primitives.
- [ ] **ARC-DATA-02** — Définir l’autorité propre de la géométrie 3D libre sur sa définition spatiale.
- [ ] **ARC-DATA-03** — Définir l’autorité sémantique commune des objets architecturaux associés aux deux planches.
- [ ] **ARC-DATA-04** — Rattacher projections, cotes dérivées, scènes et index à leur provenance et à leur révision, sans autorité concurrente.
- [ ] **ARC-DATA-05** — Spécifier contexte, requestId, version de contrat, baseRevisionId, cibles et paramètres dans les commandes.
- [ ] **ARC-DATA-06** — Spécifier la restauration serveur de l’identité authentifiée et les contrôles d’appartenance, de droits et de version.
- [ ] **ARC-DATA-07** — Spécifier les issues de commande : acceptation, refus, conflit, traitement différé ou doublon.
- [ ] **ARC-DATA-08** — Définir l’invalidation après engagement canonique et le rattachement des résultats anciens à leur source.

### 3.3 Coexistence avec l’Atelier

**Source :** Plan §3.3 et §8.2.

- [ ] **COEX-01** — Qualifier chaque composant Atelier : conserver, compléter, corriger, isoler, remplacer ou retirer, avec preuve et décision.
- [ ] **COEX-02** — Prévoir l’ajout de Studio sans suppression immédiate des accès historiques.
- [ ] **COEX-03** — Choisir un propriétaire d’écriture unique pour chaque jeu de données pendant la coexistence.
- [ ] **COEX-04** — Décider, pour les études migrées, une redirection contrôlée ou un accès historique en lecture seule.
- [ ] **COEX-05** — Interdire une synchronisation artisanale entre deux bases métier concurrentes.
- [ ] **COEX-06** — Conditionner tout retrait définitif à la comparaison avant/après, à une restauration testée et à l’acceptation explicite.

---

## 4. Préparation et portes de décision

G0 à G3 précèdent les travaux qui en dépendent. Une preuve de faisabilité isolée n’autorise pas une implémentation générale. G4 est la porte de livraison, non une étape à exécuter au démarrage.

**19 cases à cocher.**

### G0 — Cadrage

**Source :** Plan §4.

- [ ] **G0-01** — Constituer le dossier de cadrage avec DEM-01, les sources, le premier usage, le pilote et ses responsables.
- [ ] **G0-02** — Vérifier que les critères du premier usage sont explicites et que les options exclues sont nommées.
- [ ] **G0-03** — Obtenir et enregistrer l’acceptation de la cible et des critères de G0, sans fermer une inconnue pour tenir une échéance.

### G1 — Spécification

**Source :** Plan §4.

- [ ] **G1-01** — Rassembler les contrats de navigation et des outils retenus, les modèles de données, les droits, l’historique, les migrations et les risques.
- [ ] **G1-02** — Relever toutes les exigences du référentiel dans le registre de traçabilité.
- [ ] **G1-03** — Vérifier qu’une source de vérité et un contrat vérifiable existent pour chaque fonction du lot à engager.
- [ ] **G1-04** — Enregistrer le résultat de G1 et les points restant ouverts.

### G2 — Preuves

**Source :** Plan §4, §7.2 et §11.

- [ ] **G2-01** — Définir les POC ciblés nécessaires aux décisions : autonomies 2D/3D, association, chargement réel, conflits, reprise et publication.
- [ ] **G2-02** — Faire autoriser séparément le périmètre limité des POC avant leur exécution.
- [ ] **G2-03** — Exécuter les POC autorisés sur les corpus S1–S7 pertinents et consigner les résultats datés et reproductibles.
- [ ] **G2-04** — Distinguer lecture statique, test prescrit et scénario réellement exécuté dans chaque preuve.
- [ ] **G2-05** — Vérifier que les risques conditionnant la décision disposent de preuves suffisantes pour G2.

### G3 — Architecture et autorisation du sous-ensemble

**Source :** Plan §4 et §6.3.

- [ ] **G3-01** — Arbitrer les DEC de l’annexe B nécessaires au sous-ensemble ; documenter explicitement les options exclues qui n’en conditionnent pas la livraison.
- [ ] **G3-02** — Décider les composants retenus, leurs interfaces, les migrations et la stratégie de retour arrière.
- [ ] **G3-03** — Définir les sous-lots de code, leurs dépendances et leur chiffrage après audit.
- [ ] **G3-04** — Obtenir l’autorisation explicite du sous-ensemble une fois ses décisions critiques résolues.

### G4 — Livraison

**Source :** Plan §4 et §5.9.

- [ ] **G4-01** — Constituer le dossier de livraison : build identifié, scénarios, preuves, recette utilisateur et procédure d’exploitation.
- [ ] **G4-02** — Vérifier les critères applicables et l’absence de défaut éliminatoire.
- [ ] **G4-03** — Obtenir l’acceptation du périmètre livré et une décision distincte autorisant son déploiement.

---

## 5. Lots de réalisation et acceptation

Les sous-lots I, A, B, X, C, D, E, F et R sont ceux du plan. Les tâches décomposent les actions décrites, sans imposer de nouveau moteur, format ou service. Les scénarios TEST restent cochables individuellement en annexe A.

**214 cases à cocher.**

### 5.1 Lot I — Intégration native et navigation « Studio »

**Source :** Plan §5.1 ; §2.1–2.4.
**Priorité :** P0
**Dépendances :** G0–G3 applicables ; DEM-01 ; contrats de contexte et décision de navigation.
**Responsable(s) :** Architecture et frontend ; recette produit.

- [ ] **I.1-01** — Ajouter le descripteur Studio selon la relation validée entre entrées globales et modules projet, sans duplication des descripteurs.
- [ ] **I.1-02** — Ajouter l’entrée verticale intitulée exactement « Studio » à l’emplacement arbitré.

### I.2 — Enveloppe et routes

**Source :** Plan §5.1 ; §2.3.

- [ ] **I.2-01** — Créer StudioShell sous l’authentification Fadi, indépendamment de ProjectShell et du Parcours.
- [ ] **I.2-02** — Implémenter les routes Studio propres selon le contrat adopté, avec chargement à la demande.
- [ ] **I.2-03** — Implémenter l’accueil des projets/études accessibles et la création d’une étude dans le contexte autorisé.
- [ ] **I.2-04** — Traiter le contexte absent par une sélection explicite, sans donnée métier orpheline.
- [ ] **I.2-05** — Traiter les erreurs de chargement par un état récupérable et les accès refusés sans divulgation de contenu.

### I.3 — Contexte et bandeau commun

**Source :** Plan §5.1 ; §2.2–2.4.

- [ ] **I.3-01** — Adapter la résolution du projet aux routes Studio et aux liens entrants autorisés.
- [ ] **I.3-02** — Afficher dans le bandeau le bon projet, l’étude, la variante et la révision.
- [ ] **I.3-03** — Adapter les liens de retour et les états actifs de navigation, sans activation erronée de « Projets ».

### I.4 — Navigation interne

**Source :** Plan §5.1 ; §2.4.

- [ ] **I.4-01** — Afficher les quatre domaines fonctionnels du Studio.
- [ ] **I.4-02** — Placer les deux planches uniquement dans « Dessin et modélisation ».
- [ ] **I.4-03** — Conserver le domaine, la planche et le contexte actifs selon le contrat d’URL validé.

### I.5 — Transitions et protections d’interface

**Source :** Plan §5.1 ; §2.2–2.4.

- [ ] **I.5-01** — Préserver la barre latérale sans appliquer automatiquement le mode immersif Atelier.
- [ ] **I.5-02** — Implémenter l’accès clavier, la gestion du focus et les libellés accessibles de l’entrée Studio.
- [ ] **I.5-03** — Implémenter les comportements validés de barre repliée, de menu mobile et de plein écran avec sortie visible.
- [ ] **I.5-04** — Protéger les gestes, commandes locales et sauvegardes en attente lors des changements d’espace.

### Acceptation du lot I

**Source :** Plan §5.1.

- [ ] **REC-I-01** — Faire valider la maquette d’interaction et conserver la décision produit.
- [ ] **REC-I-02** — Joindre les résultats NAV-001 à NAV-009 et la matrice de non-régression des anciens accès.
- [ ] **REC-I-03** — Accepter le lot uniquement comme intégration technique tant que l’édition et la sauvegarde métier ne sont pas livrées.

### 5.2 Lot A — A.1 Données durables et versionnement

**Source :** Plan §5.2 ; §3.2.
**Priorité :** P0
**Dépendances :** G3 applicable ; DEC-01/02/03/12/18 ; contrats §2–4, §8 et §16 de REF-02.
**Responsable(s) :** Modèle métier, backend et CAO.

- [ ] **A.1-01** — Mettre en place la hiérarchie Projet → Étude → Variante → Révision selon DEC-03.
- [ ] **A.1-02** — Isoler les documents 2D indépendants, les modèles 3D libres et les objets architecturaux associés.
- [ ] **A.1-03** — Isoler les préférences d’interface des données de conception.
- [ ] **A.1-04** — Définir et versionner les schémas de données.
- [ ] **A.1-05** — Préparer les migrations associées aux schémas retenus.
- [ ] **A.1-06** — Implémenter les identités, la provenance et les empreintes pertinentes des contenus.
- [ ] **A.1-07** — Rendre la sauvegarde et la réouverture durables avant l’extension du catalogue d’outils.
- [ ] **A.1-08** — Produire les API/adaptateurs nécessaires, dans les responsabilités des services Fadi.

### A.2 — Planche 2D indépendante

**Source :** Plan §5.2 ; §7.1.

- [ ] **A.2-01** — Délimiter le sous-ensemble d’outils 2D retenu et ses contrats de fonctionnement.
- [ ] **A.2-02** — Permettre la création de primitives dans un document 2D indépendant, sans modèle 3D de substitution.
- [ ] **A.2-03** — Implémenter la sélection et l’édition du sous-ensemble 2D retenu.
- [ ] **A.2-04** — Implémenter la précision et les règles d’accrochage prévues par les contrats.
- [ ] **A.2-05** — Implémenter la cotation et les annotations du dessin.
- [ ] **A.2-06** — Implémenter les calques nécessaires au parcours contractuel.
- [ ] **A.2-07** — Raccorder l’annulation, la sauvegarde et la reprise du dessin à l’historique prévu.
- [ ] **A.2-08** — Vérifier le parcours intermédiaire de création, modification, enregistrement, fermeture et réouverture.
- [ ] **A.2-09** — Maintenir TEST-001 ouvert jusqu’à la composition et à la publication du dessin par le lot E.

### A.3 — Planche 3D indépendante

**Source :** Plan §5.2 ; §7.1.

- [ ] **A.3-01** — Délimiter le sous-ensemble contractuel de géométrie 3D libre retenu pour le pilote.
- [ ] **A.3-02** — Permettre la création directe dans l’espace, sans dessin 2D préalable.
- [ ] **A.3-03** — Implémenter l’édition des faces et les transformations du sous-ensemble retenu.
- [ ] **A.3-04** — Implémenter l’extrusion selon le contrat de l’outil.
- [ ] **A.3-05** — Implémenter la navigation 3D nécessaire au parcours autonome.
- [ ] **A.3-06** — Permettre la sauvegarde et la réouverture de la géométrie 3D.
- [ ] **A.3-07** — Produire une vue ou coupe plane dérivée, avec sa provenance.
- [ ] **A.3-08** — Maintenir les types avancés dans l’inventaire de couverture sans les annoncer disponibles avant test.
- [ ] **A.3-09** — Vérifier l’absence d’acquisition automatique de signification BIM par la géométrie libre.

### A.4 — Objets associés et propagation

**Source :** Plan §5.2 ; §3.2 ; §7.1.

- [ ] **A.4-01** — Introduire les objets architecturaux associés nécessaires au pilote.
- [ ] **A.4-02** — Rendre explicites les relations « associé », « référence liée » et « copie indépendante ».
- [ ] **A.4-03** — Conserver le même objectId pour un objet architectural modifié depuis les deux planches.
- [ ] **A.4-04** — Conserver les hôtes et contraintes lors des modifications associées.
- [ ] **A.4-05** — Gérer les références topologiques et signaler « à résoudre » les ambiguïtés de face/cote.
- [ ] **A.4-06** — Créer les nouvelles identités d’une copie indépendante et empêcher sa propagation vers la source.
- [ ] **A.4-07** — Prévoir l’extrusion d’un profil 2D avec hauteur, direction et relation de suivi explicites.
- [ ] **A.4-08** — Recalculer ou invalider les constructions dépendantes après modification d’un profil lié, sans utiliser une réponse ancienne.
- [ ] **A.4-09** — Permettre la modification du même mur et de son ouverture depuis la 2D puis la 3D.
- [ ] **A.4-10** — Refuser atomiquement ou résoudre explicitement une ouverture devenue incompatible avec son mur hôte.

### A.5 — Commandes, historique et concurrence

**Source :** Plan §5.2 ; §3.2.

- [ ] **A.5-01** — Faire converger les gestes vers le contrat de commandes commun, sans écriture directe contournant les validations.
- [ ] **A.5-02** — Valider côté serveur identité authentifiée, contexte, appartenance, droits, paramètres et révision de base.
- [ ] **A.5-03** — Séparer prévisualisation et modification confirmée ; annuler les états provisoires conformément au contrat.
- [ ] **A.5-04** — Garantir qu’une opération refusée ne laisse aucune modification partielle des données de référence.
- [ ] **A.5-05** — Implémenter l’idempotence par requestId pour les répétitions après coupure.
- [ ] **A.5-06** — Signaler et revalider les conflits sans écrasement automatique de la dernière écriture.
- [ ] **A.5-07** — Raccorder commandes, deltas et historique local dans l’historique hybride retenu, sans réécriture injustifiée.
- [ ] **A.5-08** — Traiter l’annulation concurrente sans effacer silencieusement les changements d’autrui.
- [ ] **A.5-09** — Prévoir la reprise des commandes après interruption et la revalidation lors de la reconnexion.
- [ ] **A.5-10** — Empêcher un résultat calculé sur une ancienne révision de remplacer l’état courant.
- [ ] **A.5-11** — Produire les invalidations dérivées seulement après engagement des données canoniques.

### Acceptation du lot A

**Source :** Plan §5.2.

- [ ] **REC-A-01** — Livrer les schémas, contrats versionnés, API/adaptateurs, éditeurs, journal et corpus de migration.
- [ ] **REC-A-02** — Joindre les preuves des scénarios TEST-001 à TEST-014, TEST-027 et TEST-034/035 applicables, selon leurs dépendances.
- [ ] **REC-A-03** — Vérifier le cas mur/ouverture à 3,180 m³ puis 3,096 m³, sans clôturer un scénario de bout en bout encore incomplet.

### 5.3 Lot B — B.1 Catalogue et Registry

**Source :** Plan §5.3.
**Priorité :** P0
**Dépendances :** G3 applicable ; contrats stables ; DEC-04/05/06/07/14 et DEC-18 pour les outils réutilisés.
**Responsable(s) :** Frontend, architecture des outils et persistance des préférences.

- [ ] **B.1-01** — Inventorier les catalogues d’outils existants et réconcilier leurs entrées.
- [ ] **B.1-02** — Fixer toolId, propriétaire et contrat pour chaque capacité retenue.
- [ ] **B.1-03** — Déclarer les contextes, permissions, loaders et dépendances des capacités.
- [ ] **B.1-04** — Conserver les alias nécessaires à la migration des identifiants.
- [ ] **B.1-05** — Requalifier au commit de réalisation la collision historique « echelle » entre l’objet d’accès et la transformation ; ne pas supposer qu’elle subsiste.
- [ ] **B.1-06** — Produire le manifeste versionné et le registre des loaders selon les décisions adoptées.

### B.2 — Manager et personnalisation

**Source :** Plan §5.3.

- [ ] **B.2-01** — Implémenter la recherche et les filtres du catalogue autorisé.
- [ ] **B.2-02** — Implémenter les favoris et les regroupements personnels d’outils.
- [ ] **B.2-03** — Implémenter les raccourcis selon le contrat d’ergonomie retenu.
- [ ] **B.2-04** — Implémenter les profils standard, métier et personnel.
- [ ] **B.2-05** — Persister les profils et préférences selon la stratégie décidée.
- [ ] **B.2-06** — Séparer visibilité dans la barre, disponibilité dans le contexte et droit réel d’exécution.
- [ ] **B.2-07** — Garantir qu’un changement de profil ne modifie ni géométrie, ni révision, ni droits.
- [ ] **B.2-08** — Conserver le profil d’équipe comme option tant que son contrat n’est pas retenu.

### B.3 — Chargement, cache et hors connexion

**Source :** Plan §5.3 ; §2.1 ; §6.2.

- [ ] **B.3-01** — Implémenter le cycle d’activation et de désactivation des outils selon DEC-06.
- [ ] **B.3-02** — Charger au démarrage le catalogue léger et le profil utilisateur.
- [ ] **B.3-03** — Charger à l’ouverture d’une planche le moteur et les outils courants nécessaires.
- [ ] **B.3-04** — Charger au premier usage les dépendances spécialisées requises par l’outil.
- [ ] **B.3-05** — Mutualiser les moteurs et leurs dépendances entre outils.
- [ ] **B.3-06** — Vérifier les imports et le découpage des bundles pour éviter le chargement obligatoire des familles inutilisées.
- [ ] **B.3-07** — Adapter le précache du service worker à la politique de chargement retenue.
- [ ] **B.3-08** — Distinguer dans les états techniques « téléchargé », « initialisé », « actif » et « disponible hors connexion ».
- [ ] **B.3-09** — Permettre la préparation du profil hors ligne et afficher l’indisponibilité des outils absents du cache.
- [ ] **B.3-10** — Protéger les commandes locales non synchronisées lors d’une mise à jour du service worker.
- [ ] **B.3-11** — Traiter les contrats incompatibles par migration ou résolution explicite, sans perte de file locale.
- [ ] **B.3-12** — Mesurer transferts et mémoire pour un profil de vingt outils à cache froid et chaud, sans gain arbitraire annoncé.

### Acceptation du lot B

**Source :** Plan §5.3.

- [ ] **REC-B-01** — Livrer manifeste, loaders, Manager, profils persistants, politique de cache et rapport réseau/mémoire.
- [ ] **REC-B-02** — Joindre les résultats TEST-016 à TEST-021 et TEST-036 ainsi que la preuve d’AC-002 applicable.

### 5.4 Transversal X — X.1 Corpus et instrumentation

**Source :** Plan §5.4 et §7.2.
**Priorité :** P0 transversal
**Dépendances :** Dès le début ; accompagne tous les lots.
**Responsable(s) :** Qualité, sécurité, architecture et responsables métier.

- [ ] **X.1-01** — Constituer le corpus autorisé S1 : détail 2D.
- [ ] **X.1-02** — Constituer le corpus autorisé S2 : plan de niveau.
- [ ] **X.1-03** — Constituer le corpus autorisé S3 : plan dense.
- [ ] **X.1-04** — Constituer le corpus autorisé S4 : immeuble multi-niveaux.
- [ ] **X.1-05** — Constituer le corpus autorisé S5 : géométrie libre complexe.
- [ ] **X.1-06** — Constituer le corpus autorisé S6 : étude à variantes et révisions.
- [ ] **X.1-07** — Constituer le corpus autorisé S7 : session hors réseau.
- [ ] **X.1-08** — Préparer les oracles numériques et références visuelles des corpus.
- [ ] **X.1-09** — Instrumenter PERF-01 à PERF-10 avant optimisation ; relever leurs définitions exactes dans REF-02 §18.
- [ ] **X.1-10** — Conserver 100, 10 000 et 100 000 primitives comme tailles illustratives de test, non comme engagements de capacité.

### X.2 — Intégrité et sécurité

**Source :** Plan §5.4 ; §7.3.

- [ ] **X.2-01** — Construire les scénarios positifs et négatifs des quinze invariants du référentiel.
- [ ] **X.2-02** — Construire les scénarios positifs et négatifs des permissions et des erreurs.
- [ ] **X.2-03** — Maintenir les validations centrales à l’exécution, même lorsque types et Registry sont contrôlés au build.
- [ ] **X.2-04** — Traiter chaque défaut éliminatoire du §7.3 comme blocage de livraison, indépendamment d’un gain de performance.

### X.3 — Traçabilité

**Source :** Plan §5.4 ; §9.1 ; annexe C.

- [ ] **X.3-01** — Relier EX, INV, IF et AC aux sous-lots et aux composants candidats sans changer leurs identifiants.
- [ ] **X.3-02** — Relier chaque obligation à ses scénarios TEST/NAV, preuves et décisions DEC/ADR.
- [ ] **X.3-03** — Compléter individuellement les fiches de traçabilité listées en annexe C de cette checklist.

### X.4 — CI et frontières

**Source :** Plan §5.4 ; §2.1.

- [ ] **X.4-01** — Ajouter les règles de dépendance propres à Studio et leurs tests.
- [ ] **X.4-02** — Intégrer les contrôles de frontières et les tests pertinents dans la CI.
- [ ] **X.4-03** — Distinguer les contrôles effectivement exécutés des scénarios absents ; ne pas assimiler « CI verte » à couverture exhaustive.

### X.5 — Continuité et preuves

**Source :** Plan §5.4 et §9.

- [ ] **X.5-01** — Maintenir le contexte, les tâches, le statut, le point de reprise et les décisions avec le code testé.
- [ ] **X.5-02** — N’attribuer « vérifié conforme » qu’à un résultat daté, versionné et accompagné d’une preuve.

### 5.5 Lot C — C.1 Indexation et accrochage

**Source :** Plan §5.5.
**Priorité :** P1
**Dépendances :** A : géométrie, effets de commandes et versionnement ; corpus X ; DEC-08/09/10/13/17.
**Responsable(s) :** Géométrie et rendu ; recette qualité/produit selon décisions du plan.

- [ ] **C.1-01** — Mesurer les recherches spatiales actuelles sur le corpus avant optimisation.
- [ ] **C.1-02** — Choisir l’index et l’algorithme selon DEC-09, sur la base de mesures et de résultats exacts.
- [ ] **C.1-03** — Filtrer les candidats spatiaux avant d’appliquer les règles géométriques de référence.
- [ ] **C.1-04** — Préserver cible, point, priorité et tolérance d’accrochage lors de l’optimisation.
- [ ] **C.1-05** — Tester les insertions et suppressions dans l’index.
- [ ] **C.1-06** — Tester les objets superposés, les calques et les transformations.
- [ ] **C.1-07** — Conserver la possibilité d’un balayage simple sur petite scène lorsqu’il est plus approprié.

### C.2 — Projection de scène incrémentale

**Source :** Plan §5.5.

- [ ] **C.2-01** — Produire des projections reconstructibles et versionnées à partir des données de référence.
- [ ] **C.2-02** — Conserver les tables de picking après batching et instanciation.
- [ ] **C.2-03** — Conserver le bon identifiant de sélection après suppression ou modification d’objet.
- [ ] **C.2-04** — Invalider la portée minimale correcte des projections selon les effets de commandes.
- [ ] **C.2-05** — Prévoir un recalcul plus large lorsque l’exactitude l’exige.
- [ ] **C.2-06** — Invalider les hôtes et dépendances d’une porte modifiée, pas seulement son maillage.

### Acceptation du lot C

**Source :** Plan §5.5.

- [ ] **REC-C-01** — Comparer avant/après les cibles sélectionnées, points, dimensions et géométries exportées.
- [ ] **REC-C-02** — Joindre TEST-022 à TEST-025 et AC-004/005 selon le périmètre retenu.
- [ ] **REC-C-03** — Soumettre tout renderer alternatif à DEC-08, sans l’imposer comme condition de l’autonomie de Studio.

### 5.6 Lot D — D.1 Tâches et ordonnanceur

**Source :** Plan §5.6.
**Priorité :** P1
**Dépendances :** Contrat de job, révisions et commandes A ; chargement B ; instrumentation X ; DEC-11/13.
**Responsable(s) :** Calcul et exploitation.

- [ ] **D.1-01** — Définir les classes de tâches et leurs priorités.
- [ ] **D.1-02** — Fixer les quotas de concurrence selon les décisions et budgets retenus, sans imposer un worker par cœur logique.
- [ ] **D.1-03** — Associer aux tâches leurs empreintes d’entrée, révisions et états de job.
- [ ] **D.1-04** — Raccorder l’ordonnancement aux commandes A, au chargement B et à l’instrumentation X.

### D.2 — Annulation et reprise

**Source :** Plan §5.6.

- [ ] **D.2-01** — Implémenter l’annulation des tâches conformément au contrat de job.
- [ ] **D.2-02** — Implémenter la temporisation et le traitement explicite des échecs.
- [ ] **D.2-03** — Marquer et écarter les résultats périmés de l’engagement courant.
- [ ] **D.2-04** — Spécifier puis implémenter le redémarrage du worker exact après erreur.
- [ ] **D.2-05** — Résoudre explicitement les tâches en attente affectées par un crash.
- [ ] **D.2-06** — Garantir une relance sans doublon et sans engagement partiel.
- [ ] **D.2-07** — Livrer les protections minimales dès l’exposition d’une opération lourde, avant l’ordonnanceur complet si nécessaire.

### D.3 — Buffers et mémoire

**Source :** Plan §5.6.

- [ ] **D.3-01** — Contrôler la propriété des buffers transférés entre les environnements d’exécution.
- [ ] **D.3-02** — Contrôler le cycle de vie des ressources GPU et WASM.
- [ ] **D.3-03** — Mesurer la mémoire résiduelle pendant les sessions longues.
- [ ] **D.3-04** — Évaluer la réutilisation des instances sans créer par défaut un noyau distinct pour chaque outil.

### Acceptation du lot D

**Source :** Plan §5.6.

- [ ] **REC-D-01** — Joindre les résultats TEST-014/015/037 et AC-006 applicables.
- [ ] **REC-D-02** — Vérifier sur les preuves l’absence de corruption, la résolution de l’attente et la relance sans doublon.

### 5.7 Lot E — E.1 BIM et coordination

**Source :** Plan §5.7.
**Priorité :** P1
**Dépendances :** A/B et contrats applicables ; DEC-16 pour publication ; choix de formats/gouvernance du périmètre.
**Responsable(s) :** BIM, documentation, frontend, backend et approbateur produit.

- [ ] **E.1-01** — Implémenter les propriétés BIM du périmètre pilote.
- [ ] **E.1-02** — Conserver les exigences versionnées séparément des résultats dessinés.
- [ ] **E.1-03** — Calculer et afficher les écarts sans réécriture automatique de l’exigence.
- [ ] **E.1-04** — Gérer les références partenaires et leur acceptation avant utilisation.
- [ ] **E.1-05** — Associer les règles de contrôle aux contenus et révisions examinés.
- [ ] **E.1-06** — Distinguer les conclusions de conformité de l’état d’exécution du contrôle.

### E.2 — Observations, tâches et décisions

**Source :** Plan §5.7.

- [ ] **E.2-01** — Conserver une identité unique d’observation lorsqu’elle est utilisée dans plusieurs domaines.
- [ ] **E.2-02** — Relier l’observation à son contexte et à son responsable.
- [ ] **E.2-03** — Permettre l’attribution des tâches et l’enregistrement des décisions distinctes.
- [ ] **E.2-04** — Raccorder correction, recontrôle et décision de clôture.
- [ ] **E.2-05** — Réserver la clôture aux rôles autorisés selon le contrat de workflow.

### E.3 — Documents et métrés

**Source :** Plan §5.7.

- [ ] **E.3-01** — Produire les vues documentaires à partir de sources identifiées.
- [ ] **E.3-02** — Composer les feuilles sans les confondre avec les planches de travail.
- [ ] **E.3-03** — Assembler les dossiers de conception du pilote.
- [ ] **E.3-04** — Calculer séparément quantités brutes, déductions et quantités nettes.
- [ ] **E.3-05** — Tracer les ajustements manuels et leur auteur sans effacer le résultat calculé.
- [ ] **E.3-06** — Rattacher les livrables au catalogue documentaire partagé de Fadi.
- [ ] **E.3-07** — Permettre la publication d’un dessin 2D indépendant afin d’achever TEST-001.

### E.4 — Approbation et publication

**Source :** Plan §5.7 ; §7.1–7.3.

- [ ] **E.4-01** — Implémenter les dimensions distinctes de statut : travail, diffusion et actualité des contenus dérivés.
- [ ] **E.4-02** — Implémenter les permissions distinctes de revue, d’approbation et de publication.
- [ ] **E.4-03** — Figer un manifeste multi-sources des versions coordonnées.
- [ ] **E.4-04** — Faire porter l’approbation sur l’ensemble effectivement examiné.
- [ ] **E.4-05** — Refuser la publication sous une ancienne approbation lorsqu’une version du dossier a changé, ou imposer le nouveau contrôle prévu.
- [ ] **E.4-06** — Journaliser le retrait ou le remplacement d’une publication sans effacer le contenu historique selon la politique retenue.

### E.5 — Visualisation de base

**Source :** Plan §5.7.

- [ ] **E.5-01** — Implémenter les scènes et caméras du périmètre pilote.
- [ ] **E.5-02** — Distinguer apparence visuelle et propriétés constructives.
- [ ] **E.5-03** — Produire les rendus issus du modèle avec révisions et provenance.
- [ ] **E.5-04** — Maintenir le domaine Visualisation dans le pilote, même si l’IA et l’immersion avancée sont reportées.
- [ ] **E.5-05** — Conserver distincts rendu du modèle, illustration IA contrainte et exploration libre ; ne pas modifier automatiquement le BIM à partir d’une image.

### E.6 — Interopérabilité

**Source :** Plan §5.7.

- [ ] **E.6-01** — Établir la matrice d’échanges par format, sens, entité, version et limite de couverture.
- [ ] **E.6-02** — Définir et livrer les données natives, les vues/feuilles et les tableaux du pilote selon leurs contrats.
- [ ] **E.6-03** — Définir le sous-ensemble DXF/IFC retenu et produire ses rapports de fidélité/pertes.
- [ ] **E.6-04** — Qualifier DWG, BCF, STEP/OBJ/STL et les autres capacités séparément, selon leurs propres contrats et preuves.
- [ ] **E.6-05** — Inscrire chaque report de format au périmètre de livraison sans le déclarer conforme ni livré.

### Acceptation du lot E

**Source :** Plan §5.7.

- [ ] **REC-E-01** — Achever TEST-001 et joindre TEST-009/010, TEST-026 à TEST-032, TEST-038 et TEST-018/035 selon le périmètre.
- [ ] **REC-E-02** — Joindre les preuves AC-007 à AC-010 applicables.
- [ ] **REC-E-03** — Démontrer une étude associée contrôlée, corrigée, approuvée et publiée, ainsi que le résultat utile des trois parcours.

### 5.8 Lot F — Capacités avancées conditionnelles

**Source :** Plan §5.8.
**Priorité :** P2 conditionnel
**Dépendances :** Contrat, preuves et autorisation propres à chaque option ; DEC-08/15/17 ; évaluations de fournisseurs applicables.

Une option non engagée reste « hors périmètre » ou « reportée » dans le suivi ; sa case de réalisation n’est pas cochée.

- [ ] **F.1-01** — Autoriser les accélérations supplémentaires seulement après preuve du gain et de la non-régression.
- [ ] **F.1-02** — Implémenter un renderer alternatif uniquement si la décision correspondante est retenue.

### F.2 — Immersion, rendu avancé et IA

**Source :** Plan §5.8.

- [ ] **F.2-01** — Faire valider pour chaque capacité retenue son contrat, ses droits, ses coûts, sa confidentialité et sa provenance.
- [ ] **F.2-02** — Implémenter l’immersion et les rendus avancés uniquement dans le périmètre autorisé.
- [ ] **F.2-03** — Implémenter les modes IA retenus en conservant leur distinction et l’absence de mutation automatique du modèle.
- [ ] **F.2-04** — Constituer le corpus et les preuves propres à chaque capacité engagée.

### F.3 — Extensions et MCP

**Source :** Plan §5.8.

- [ ] **F.3-01** — Faire instruire les extensions et l’adaptateur MCP facultatif selon DEC-15 avant engagement.
- [ ] **F.3-02** — Utiliser les mêmes commandes, permissions et confirmations que l’interface humaine.
- [ ] **F.3-03** — Éviter tout appel distant à chaque mouvement du pointeur.
- [ ] **F.3-04** — Joindre TEST-025/026/032/033/035 applicables ; ne déclarer livrées que les options disposant de preuves.

### 5.9 Lot R — R.1 Build candidat et comparaison

**Source :** Plan §5.9 ; §8.
**Dépendances :** A/B/E prêts ; C/D nécessaires à la charge ; sécurité X ; décisions G3.
**Responsable(s) :** Exploitation, responsables techniques et recette utilisateur.

- [ ] **R.1-01** — Figer le build candidat et son périmètre de livraison.
- [ ] **R.1-02** — Comparer les données historiques aux données migrées en environnement de validation.
- [ ] **R.1-03** — Conserver le rapport avant/après et les anomalies à résoudre avant bascule.

### R.2 — Restauration

**Source :** Plan §5.9 ; §8.3.

- [ ] **R.2-01** — Restaurer une sauvegarde complète incluant géométries, documents, références, droits, historiques et manifestes.
- [ ] **R.2-02** — Conserver la preuve de restauration avant toute ouverture du périmètre migré.

### R.3 — Recette utilisateur

**Source :** Plan §5.9 ; §7.1.

- [ ] **R.3-01** — Réaliser la recette utilisateur des trois parcours depuis l’entrée verticale Studio.
- [ ] **R.3-02** — Joindre NAV-001 à NAV-009 et les scénarios de bout en bout du périmètre candidat.

### R.4 — Bascule progressive

**Source :** Plan §5.9 ; §8.2–8.3.

- [ ] **R.4-01** — Obtenir l’autorisation de bascule sur les projets pilotes après la porte G4 applicable.
- [ ] **R.4-02** — Effectuer la bascule progressive autorisée, avec sauvegarde restaurable préalable.
- [ ] **R.4-03** — Journaliser les versions de build/schéma et la décision de bascule.

### R.5 — Contrôle du site et sauvegarde de l’état accepté

**Source :** Plan §5.9 ; §8.3.

- [ ] **R.5-01** — Vérifier le site déployé avec l’utilisateur et enregistrer sa validation du périmètre.
- [ ] **R.5-02** — Conserver une sauvegarde du nouvel état accepté.
- [ ] **R.5-03** — Surveiller les erreurs applicatives, les alertes de jobs/workers et la consommation des noyaux.
- [ ] **R.5-04** — Joindre TEST-034/035/036 applicables et distinguer formellement les états « déployé » et « accepté ».

---

## 6. Enchaînement, jalons et première version

Les jalons sont des contrôles de résultat : ils ne remplacent pas les tâches de réalisation. Les branches parallèles ne démarrent que sur des contrats stabilisés.

**25 cases à cocher.**

### 6.1 Dépendances et jalons

**Source :** Plan §6.1.

- [ ] **SEQ-01** — Enregistrer G0 → G1 → G2 → G3 comme prérequis des lots dépendants.
- [ ] **SEQ-02** — Planifier I et X avec les fondations A.1 après les décisions applicables.
- [ ] **SEQ-03** — Planifier B en parallèle uniquement sur des contrats stables et compatibles avec A.
- [ ] **SEQ-04** — Planifier A.2/A.3 avant la démonstration associée A.4/A.5.
- [ ] **SEQ-05** — Positionner C et D avant l’exposition des charges ou traitements qui les exigent.
- [ ] **SEQ-06** — Positionner E avant la déclaration d’un pilote métier complet, puis R avant généralisation.
- [ ] **SEQ-07** — Maintenir F sous ses arbitrages propres, sans l’imposer au périmètre pilote qui l’exclut.

### Contrôle des jalons J0 à J8

**Source :** Plan §6.1.

- [ ] **J0** — Vérifier « Cible et décisions » : Périmètre, traçabilité et décisions nécessaires au premier lot. Ce jalon ne prouve pas : La faisabilité des moteurs.
- [ ] **J1** — Vérifier « Accès autonome » : Studio dans la barre, routes et contexte corrects, NAV de base. Ce jalon ne prouve pas : Un éditeur utilisable ou une version métier livrée.
- [ ] **J2** — Vérifier « Données durables » : Étude/variante, commandes, sauvegarde et réouverture. Ce jalon ne prouve pas : La bidirectionnalité ou la publication.
- [ ] **J3** — Vérifier « Deux planches » : Création/modification indépendantes en 2D et 3D ; profils utilisables. Ce jalon ne prouve pas : TEST-001 complet tant que la publication manque.
- [ ] **J4** — Vérifier « Association fiable » : Mur/ouverture, hôtes, copie indépendante, conflits et historique. Ce jalon ne prouve pas : Le fonctionnement de tous les outils du catalogue.
- [ ] **J5** — Vérifier « Exécution qualifiée » : Chargement sélectif, offline préparé, index/rendu et workers selon budgets. Ce jalon ne prouve pas : Une performance universelle sur tout appareil.
- [ ] **J6** — Vérifier « Dossier métier » : BIM, visualisation de base, métrés, observations, revue et publication cohérents. Ce jalon ne prouve pas : La couverture de tous les formats et extensions.
- [ ] **J7** — Vérifier « Pilote accepté » : Migration/restauration et recette des trois parcours sur le build candidat. Ce jalon ne prouve pas : L’autorisation automatique de généralisation.
- [ ] **J8** — Vérifier « Mise en service » : Déploiement autorisé, vérification utilisateur et exploitation documentée. Ce jalon ne prouve pas : La livraison des options P2 non retenues.

### 6.2 Périmètre de la première version

**Source :** Plan §6.2.

- [ ] **PIL-01** — Vérifier que le périmètre ratifié inclut les quatre domaines, les trois parcours, sauvegarde/reprise, outils usuels, contrôle d’exigence, observation et publication à manifeste.
- [ ] **PIL-02** — Choisir les outils usuels selon le travail métier et leurs contrats de dessin, édition, précision, annotation, architecture et modélisation.
- [ ] **PIL-03** — Distinguer le profil d’essai de vingt outils du catalogue complet et d’un éventuel maximum du produit.
- [ ] **PIL-04** — Qualifier les outils non retenus comme futurs, expérimentaux ou indisponibles selon décision.
- [ ] **PIL-05** — Vérifier que le cas mur/ouverture n’est pas utilisé seul comme démonstration de l’utilité métier du pilote.

### 6.3 Charges et calendrier

**Source :** Plan §6.3.

- [ ] **EST-01** — Recueillir la disponibilité de l’équipe, le volume des projets, la charge de migration et la cadence de recette.
- [ ] **EST-02** — Chiffrer chaque sous-lot après audit : réutilisation, écarts, nouveaux contrats, tests, migration, revue et marge de risque.
- [ ] **EST-03** — Distinguer charge de travail et délai calendaire lors de l’établissement du calendrier à G3.
- [ ] **EST-04** — Conserver une dépendance critique non résolue comme blocage, même si du temps est disponible.

---

## 7. Validation et critères de livraison

Les procédures ci-dessous assemblent les scénarios pour la recette du pilote. Les cases individuelles TEST-001 à TEST-038 sont regroupées en annexe A ; aucune n’est réputée réussie par sa seule présence dans cette liste.

**19 cases à cocher.**

### 7.1 Recette des trois parcours

**Source :** Plan §7.1.

- [ ] **E2E-01** — Préparer puis exécuter le parcours A complet : Studio → projet/étude/dessin → tracé/modification/cotation/annotation → sauvegarde/fermeture/réouverture → feuille → publication, sans modèle 3D.
- [ ] **E2E-02** — Préparer puis exécuter le parcours B complet : création spatiale directe → édition faces/volume → sauvegarde/réouverture → vue ou coupe plane, sans esquisse 2D préalable ni BIM implicite.
- [ ] **E2E-03** — Préparer puis exécuter le parcours C complet : mur/ouverture communs → modifications 2D/3D → métrés/hôtes/contraintes → annulation/rétablissement → conflit → observation → approbation/publication.
- [ ] **E2E-04** — Vérifier dans le parcours associé que la copie indépendante ne réécrit pas sa source.
- [ ] **E2E-05** — Appliquer le cas quantifié avec ses seules hypothèses : mur 6,00 × 3,00 × 0,20 m et ouverture traversante, sans autres déductions/jonctions.
- [ ] **E2E-06** — Consigner le brut 3,600 m³, la déduction 0,420 m³ et le net 3,180 m³, puis la déduction 0,504 m³ et le net 3,096 m³ après élargissement à 1,20 m.

### 7.2 Protocole de mesure et non-régression

**Source :** Plan §7.2.

- [ ] **MES-01** — Identifier pour chaque mesure appareil, navigateur, GPU, réseau et état des caches.
- [ ] **MES-02** — Identifier pour chaque mesure build, commit, jeu de données, répétitions, distribution et seuil accepté.
- [ ] **MES-03** — Mesurer séparément transfert, activation, calcul, rendu CPU/GPU, invalidation et mémoire résiduelle.
- [ ] **MES-04** — Faire valider les seuils dans DEC-13, sans emprunter de valeur arbitraire par outil.
- [ ] **MES-05** — Comparer simultanément cibles de snapping/picking, dimensions, quantités, historique et exports.

### 7.3 Conditions éliminatoires

**Source :** Plan §7.3.

- [ ] **BLOC-01** — Contrôler l’absence de double autorité 2D/3D et de corruption de référence.
- [ ] **BLOC-02** — Contrôler l’absence d’accès inter-projets non autorisé.
- [ ] **BLOC-03** — Contrôler l’absence de commande appliquée deux fois et d’écrasement de conflit.
- [ ] **BLOC-04** — Contrôler qu’aucun résultat ancien n’est engagé comme résultat courant.
- [ ] **BLOC-05** — Contrôler qu’aucune publication ne s’appuie sur une approbation ne couvrant pas son contenu.
- [ ] **BLOC-06** — Bloquer la livraison si un défaut éliminatoire subsiste, indépendamment des gains de FPS ou des moyennes favorables.
- [ ] **BLOC-07** — Faire motiver et valider les non-applicabilités sans soustraire une exigence essentielle du périmètre.
- [ ] **BLOC-08** — Déclarer explicitement les fonctions hors périmètre et ne pas qualifier un test de réussi par sa seule inscription dans la CI.

---

## 8. Migration et exploitation sans perte

Les préparatifs de cette section alimentent le lot R. La migration et le déploiement restent soumis à une autorisation distincte.

**26 cases à cocher.**

### 8.1 Inventaire et simulation

**Source :** Plan §8.1.

- [ ] **MIG-01** — Recenser projets, objets existants, formes de dessin, unités et niveaux.
- [ ] **MIG-02** — Recenser associations, cotes et composants.
- [ ] **MIG-03** — Recenser historiques, profils et commandes hors ligne en attente.
- [ ] **MIG-04** — Recenser références externes et publications.
- [ ] **MIG-05** — Classer les éléments comme compatibles, convertibles, ambigus ou non convertibles.
- [ ] **MIG-06** — Constituer le corpus avant migration des quantités et propriétés, en protégeant les données privées.
- [ ] **MIG-07** — Produire pour chaque transformation le lien entre ancienne identité, nouvelle identité et filiation.
- [ ] **MIG-08** — Identifier les pertes et ambiguïtés éventuelles et leur traitement dans le rapport de simulation.
- [ ] **MIG-09** — Conserver et signaler les objets non convertibles au lieu de les supprimer.
- [ ] **MIG-10** — Rendre visibles les erreurs partielles sans les masquer dans un taux global de réussite.

### 8.2 Coexistence et transfert d’autorité

**Source :** Plan §8.2.

- [ ] **MIG-COEX-01** — Réaliser la première migration en préproduction sur copie isolée.
- [ ] **MIG-COEX-02** — Décider pour les pilotes la continuité d’identifiants ou leur correspondance explicite selon DEC-01/02/03/18.
- [ ] **MIG-COEX-03** — Préserver le lien entre chaque publication historique et ses pièces originales.
- [ ] **MIG-COEX-04** — Synchroniser, migrer sous contrat ou mettre en résolution les commandes locales pendantes avant bascule ; ne jamais les supprimer.
- [ ] **MIG-COEX-05** — Décider le transfert de propriété d’écriture Atelier → Studio par périmètre.
- [ ] **MIG-COEX-06** — Empêcher deux chaînes d’écriture incompatibles sur la même étude et maintenir la consultation historique nécessaire.
- [ ] **MIG-COEX-07** — Traiter la suppression d’anciens écrans, routes ou stockages comme un lot ultérieur explicitement autorisé, distinct du lot I.

### 8.3 Retour arrière et exploitation

**Source :** Plan §8.3 ; §5.9.

- [ ] **OPS-01** — Conserver le build, les migrations, les versions de schéma et la sauvegarde de référence de chaque bascule.
- [ ] **OPS-02** — Définir les déclencheurs de retour arrière et le responsable de la décision.
- [ ] **OPS-03** — Définir le traitement des écritures créées après bascule ; ne pas réduire le retour arrière au rétablissement de l’ancien bundle.
- [ ] **OPS-04** — Prévoir le refus des clients anciens incompatibles.
- [ ] **OPS-05** — Protéger les files locales lors du changement de service worker.
- [ ] **OPS-06** — Tester avant ouverture une restauration portant sur données et pièces documentaires.
- [ ] **OPS-07** — Après déploiement, vérifier accès, trois parcours du pilote et publications.
- [ ] **OPS-08** — Après déploiement, vérifier alertes de jobs/workers et consommation des noyaux.
- [ ] **OPS-09** — Faire fixer les objectifs de reprise, de conservation et de coûts, sans inventer de valeurs absentes du plan.

---

## 9. Pilotage dans GitHub et continuité

Ces tâches sont à exécuter dans le chantier autorisé. Produire la présente checklist ne crée aucune Issue, branche, PR ou modification du dépôt. Les contrôles de reprise et de PR se répètent à chaque unité de travail concernée.

**24 cases à cocher.**

### 9.1 Organisation du chantier

**Source :** Plan §9.1.

- [ ] **SUIVI-01** — Créer ou compléter le chantier studio selon le protocole de continuité existant, sans branche permanente par module.
- [ ] **SUIVI-02** — Maintenir dans Studio/ les documents directeurs et plans versionnés, sans créer une seconde autorité normative.
- [ ] **SUIVI-03** — Créer ou compléter docs/workstreams/studio/CONTEXT.md : but, sources, DEM-01, périmètre accepté, responsabilités et limites.
- [ ] **SUIVI-04** — Créer ou compléter docs/workstreams/studio/TASKS.md : sous-lots, dépendances, Issues, PR, états et critères.
- [ ] **SUIVI-05** — Créer ou compléter docs/workstreams/studio/STATUS.md : faits datés, commit, vérifications, risques et blocages.
- [ ] **SUIVI-06** — Créer ou compléter docs/workstreams/studio/HANDOFF.md : dernier état vérifié, décisions, prochaine action autorisée et reprise.
- [ ] **SUIVI-07** — Maintenir le registre EX/INV/IF/AC ↔ composants ↔ TEST/NAV ↔ preuves ↔ DEC/ADR.
- [ ] **SUIVI-08** — Adopter pour matrices et ADR les noms du protocole sans dupliquer les registres existants.
- [ ] **SUIVI-09** — Conserver les rapports lourds dans des artefacts identifiés et leurs références stables, empreintes et verdicts dans le suivi.
- [ ] **SUIVI-10** — Protéger le suivi public contre secrets, géométries privées de clients et URL sensibles.

### 9.2 À répéter pour chaque tâche, branche et PR

**Source :** Plan §9.2 ; §9.1.

Liste de contrôle récurrente : une exécution ne dispense pas de la répéter pour les PR et reprises suivantes.

- [ ] **PR-01** — Ouvrir ou relier une Issue par unité de travail autorisée.
- [ ] **PR-02** — Décrire besoin, sources, identifiants d’exigences et périmètre inclus/exclu.
- [ ] **PR-03** — Identifier le composant, les contrats, décisions et migrations concernés.
- [ ] **PR-04** — Définir les scénarios positifs/négatifs, preuves attendues et conditions de retour arrière.
- [ ] **PR-05** — Utiliser une branche courte conforme au protocole, puis une PR assortie des preuves.
- [ ] **PR-06** — Distinguer dans la PR ce qui est codé, testé, déployé et accepté ; ne pas utiliser une capture de bouton comme preuve métier.
- [ ] **PR-07** — Maintenir les états À définir, À faire, En cours, Implémenté, Vérifié, Bloqué et Accepté.
- [ ] **PR-08** — Conserver séparément verdict de conformité, état d’exécution des tests et avancement du travail.
- [ ] **PR-09** — Revalider HEAD, CI et faits après chaque reprise de session avant la prochaine action autorisée.

### 9.3 Répartition des validations

**Source :** Plan §9.3.

- [ ] **RESP-01** — Attribuer au produit la validation du périmètre métier, de la navigation et de la recette.
- [ ] **RESP-02** — Attribuer à l’architecture l’instruction des DEC et des frontières de composants.
- [ ] **RESP-03** — Attribuer les sous-lots aux responsables CAO, backend, frontend et BIM/documentation.
- [ ] **RESP-04** — Attribuer à qualité/sécurité les tests adverses, corpus et preuves.
- [ ] **RESP-05** — Attribuer à exploitation migration, sauvegarde et retour arrière.

---

## 10. Décisions et risques avant engagement

Les décisions techniques gardent les identifiants DEC-01 à DEC-18 et sont cochables en annexe B. Une décision bloquante est à résoudre au G3 du lot concerné, pas nécessairement toutes au démarrage.

**15 cases à cocher.**

### 10.1 Décision d’intégration et registre source

**Source :** Plan §10.

- [ ] **ADR-01** — Ouvrir la décision d’intégration distincte proposée, par exemple ADR-STUDIO-NAV-01, sans remplacer une DEC existante.
- [ ] **ADR-02** — Y documenter routes, contexte, droits, comportements mobile/plein écran, coexistence Atelier et tests NAV.
- [ ] **ADR-03** — Faire arbitrer et enregistrer la décision d’intégration avant engagement du lot dépendant.
- [ ] **ADR-04** — Conserver RISK-01 à RISK-10 du référentiel comme registre source et rattacher les risques de navigation supplémentaires.
- [ ] **ADR-05** — Confirmer les priorités des risques au cadrage du pilote.

### 10.2 Contrôle des mesures de risque

**Source :** Plan §10.

- [ ] **RISQ-01** — Vérifier le traitement du risque « Studio réduit à un raccourci vers l’Atelier » : Lot I, routes propres, absence de prérequis Parcours et NAV-002.
- [ ] **RISQ-02** — Vérifier le traitement du risque « Barre latérale supprimée par un ancien mode immersif » : Ne pas réutiliser cet effet automatiquement ; NAV-008 et recette mobile.
- [ ] **RISQ-03** — Vérifier le traitement du risque « Mauvais projet dans le bandeau ou la commande » : Résolution de contexte partagée ; URL et appartenance vérifiées côté serveur.
- [ ] **RISQ-04** — Vérifier le traitement du risque « Données ou historique dupliqués entre Atelier et Studio » : A.1/A.5 et transfert explicite d’autorité lors de R.
- [ ] **RISQ-05** — Vérifier le traitement du risque « Tous les moteurs téléchargés malgré une barre réduite » : B.3, vérification imports/bundles/précache et TEST-016.
- [ ] **RISQ-06** — Vérifier le traitement du risque « Snapping ou picking altéré par optimisation » : Corpus X et TEST-022/023, comparaison avec oracle.
- [ ] **RISQ-07** — Vérifier le traitement du risque « Worker en échec ou résultat périmé » : Lot D, TEST-014/015/037, pas d’engagement anticipé.
- [ ] **RISQ-08** — Vérifier le traitement du risque « Dossier publié différent du contenu approuvé » : E.4, manifeste immuable, TEST-030/038.
- [ ] **RISQ-09** — Vérifier le traitement du risque « Format promis au-delà de la couverture » : E.6, matrice par sens/version/entité et rapport de pertes.
- [ ] **RISQ-10** — Vérifier le traitement du risque « Perte lors de migration ou changement de cache » : R, simulation, TEST-034/036, restauration et gestion des files.

---

## 11. Vérification de la première séquence et clôture

Cette section contrôle l’enchaînement autorisé. Elle renvoie aux tâches précédentes : elle ne lance ni refonte générale des moteurs ni seconde exécution des lots.

**8 cases à cocher.**

### 11.1 Contrôle de passage à la réalisation

**Source :** Plan §11.

- [ ] **PASS-01** — Vérifier que DEM-01, les sources exactes et la traçabilité sont fixés avant le premier engagement.
- [ ] **PASS-02** — Vérifier que la décision de navigation, le modèle d’étude et les trois parcours sont spécifiés.
- [ ] **PASS-03** — Vérifier la requalification des composants, les preuves des risques critiques et l’autorisation G3 du premier sous-ensemble.
- [ ] **PASS-04** — Vérifier la cohérence des livraisons I/X/A.1, puis A.2/A.3/B sur des contrats stabilisés.
- [ ] **PASS-05** — Exiger la démonstration A.4/A.5 avant toute déclaration de conception associée.
- [ ] **PASS-06** — Exiger l’achèvement de E et des parcours de bout en bout avant de présenter le pilote comme version métier utilisable.
- [ ] **PASS-07** — Exiger R avant généralisation et les preuves propres à F avant ses extensions.

### 11.2 Critère final

**Source :** Plan §11.

- [ ] **FIN-01** — Vérifier que Studio est un espace autonome réellement utilisé depuis la barre verticale, avec données durables, outils activés selon le besoin et dossier de conception traçable, approuvé et publiable.

---

## Annexe A. Exécution des 38 scénarios du référentiel

Reprise des intitulés et attendus de l’annexe A du plan. Pour chaque case : préparer les données, exécuter le scénario sur le build identifié, comparer à l’attendu et joindre la preuve. Un échec reste décoché et tracé ; une capacité conditionnelle non engagée est signalée hors périmètre, pas déclarée conforme.

**38 cases à cocher.**

### A.1 Scénarios TEST-001 à TEST-038

**Source :** Plan annexe A ; REF-02 §19.2 cité par le plan.

- [ ] **TEST-001** — Nouvelle étude, Planche 2D seule. Dessiner, coter, enregistrer, fermer, rouvrir et publier sans modèle 3D. [Lot proposé : A + E.]
- [ ] **TEST-002** — Nouvelle étude, Planche 3D seule. Construire volume, éditer faces, sauvegarder et dériver une vue plane. [Lot proposé : A.]
- [ ] **TEST-003** — Modifier un mur associé depuis 2D puis 3D. Même objectId, paramètres et hôtes cohérents dans les deux planches. [Lot proposé : A.]
- [ ] **TEST-004** — Copie indépendante d’un profil et d’un objet. Nouvelles identités ; aucune propagation vers la source d’origine. [Lot proposé : A.]
- [ ] **TEST-005** — Extruder un profil 2D. Demande explicite de hauteur/direction et relation de suivi. [Lot proposé : A.]
- [ ] **TEST-006** — Modifier profil source lié. Volume dépendant recalculé ou invalidé sans réponse ancienne. [Lot proposé : A.]
- [ ] **TEST-007** — Diviser une face cotée en deux. Rattachement prouvé ou statut « à résoudre » ; aucune approximation silencieuse. [Lot proposé : A.]
- [ ] **TEST-008** — Porte déplacée hors du mur hôte. Refus atomique ou résolution explicite, sans géométrie partielle. [Lot proposé : A.]
- [ ] **TEST-009** — Mur 6 × 3 × 0,2 et ouverture 1 × 2,1. 3,600 m³ brut, 0,420 m³ déduit, 3,180 m³ net. [Lot proposé : A + E.]
- [ ] **TEST-010** — Agrandir l’ouverture à 1,2 m depuis l’autre planche. Nouveau volume net 3,096 m³ ; révision historique inchangée. [Lot proposé : A + E.]
- [ ] **TEST-011** — Annuler/rétablir l’opération associée. Références stables, métrés/affichage corrects, aucune perte de publication. [Lot proposé : A.]
- [ ] **TEST-012** — Modifier simultanément même mur sur deux sessions. Conflit revalidé, pas d’écrasement last-write-wins. [Lot proposé : A + X.]
- [ ] **TEST-013** — Répéter une commande après coupure. Même résultat, aucune deuxième application du requestId. [Lot proposé : A + R.]
- [ ] **TEST-014** — Tâche exacte renvoie une ancienne révision. Résultat périmé marqué et non engagé dans le modèle courant. [Lot proposé : A + D.]
- [ ] **TEST-015** — Échec/coupure du worker OCCT. Pas de corruption, erreur, relance contrôlée et attente résolue. [Lot proposé : D.]
- [ ] **TEST-016** — Ouvrir Studio avec profil de 20 outils. Pas d’initialisation obligatoire des moteurs rares ; mesure de ressources. [Lot proposé : B.]
- [ ] **TEST-017** — Chercher un outil hors de la barre. Trouvable dans catalogue, état permission/contexte fidèle. [Lot proposé : B.]
- [ ] **TEST-018** — Importer un profil contenant « Publier » sans droit. Barre éventuellement visible ; appel refusé par serveur. [Lot proposé : B + E + X.]
- [ ] **TEST-019** — Changer standard → métier → personnel. Aucune modification de géométrie, révision ni droits. [Lot proposé : B.]
- [ ] **TEST-020** — Offline avec profil préparé. Outils présents utilisables ; non présents indiqués indisponibles. [Lot proposé : B.]
- [ ] **TEST-021** — Préparer une commande offline puis reconnecter. Validation et conflits serveur, pas de publication anticipée. [Lot proposé : A + B.]
- [ ] **TEST-022** — Snapping de scènes S1, S2, S3 accéléré. Même point/cible/priorité dans la tolérance que l’algorithme référence. [Lot proposé : C.]
- [ ] **TEST-023** — Picking 3D après batching/invalidation. Identifiant correct pour chaque triangle/instance, même après suppression. [Lot proposé : C.]
- [ ] **TEST-024** — Déplacer une porte en vue 3D. Seuls lots/projections nécessaires recalculés si optimisation retenue. [Lot proposé : C.]
- [ ] **TEST-025** — Comparer SVG / Canvas / GPU sur scènes S1–S3. Rapports fidélité, accessibilité et latence ; moteur choisi sur preuve. [Lot proposé : C / F.]
- [ ] **TEST-026** — Changer matériau apparent d’un mur. Aucun changement de composition technique ou de volume net. [Lot proposé : E / F.]
- [ ] **TEST-027** — Modifier surface dessinée vs surface programmée. Exigence identique ; écart calculé et visible. [Lot proposé : A + E.]
- [ ] **TEST-028** — Import IFC/DXF contenant entité inconnue. Rapport de pertes et état non natif explicite. [Lot proposé : E.]
- [ ] **TEST-029** — Observation issue d’un contrôle, correction/recontrôle. Même identité de suivi, responsable, contexte et décision de clôture. [Lot proposé : E.]
- [ ] **TEST-030** — Approbation puis modification d’un document. Publication sous l’ancien manifeste refusée ou soumise à nouveau contrôle. [Lot proposé : E.]
- [ ] **TEST-031** — Retirer une publication historique. Action journalisée, contenu historique récupérable selon politique. [Lot proposé : E.]
- [ ] **TEST-032** — Illustration IA depuis une vue. Aucune mutation du modèle, provenance et permissions conservées. [Lot proposé : E / F.]
- [ ] **TEST-033** — Appel MCP simulé sur commande protégée. Même schéma, droits, confirmation et idempotence que l’interface humaine. [Lot proposé : F.]
- [ ] **TEST-034** — Restaurer une sauvegarde après incident. Révisions, identités, associations, publications et manifestes retrouvés. [Lot proposé : R.]
- [ ] **TEST-035** — Objets d’un autre projet via URL/job/export. Accès refusé côté serveur, sans fuite de données. [Lot proposé : A + E + X.]
- [ ] **TEST-036** — Actualiser service worker avec commandes locales pendantes. Contrats compatibles ou migration, aucune file perdue. [Lot proposé : B + R.]
- [ ] **TEST-037** — Fermer/réouvrir 50 fois outil exact (jeu d’essai). Courbe mémoire analysée ; absence de fuite démontrée selon seuil retenu. [Lot proposé : D.]
- [ ] **TEST-038** — Publier dossier composé de plusieurs modèles/révisions. Manifeste coordonné, empreintes et approbation portant sur cet ensemble. [Lot proposé : E.]

---

## Annexe B. Instruction des 18 décisions ouvertes

Reprise des questions et preuves de l’annexe B du plan. Pour chaque décision : réunir la preuve indiquée, instruire les options, faire arbitrer par le responsable compétent et consigner le résultat. La case n’est cochée qu’une fois la décision documentée, pas après une simple collecte de pièces. Une option non retenue exige une exclusion explicite du périmètre.

**18 cases à cocher.**

### B.1 Décisions DEC-01 à DEC-18

**Source :** Plan annexe B.

- [ ] **DEC-01** — Instruire et faire arbitrer : Modèle physique du dessin 2D autonome et son stockage. Preuve : Schéma, création sans 3D, sauvegarde/reprise, migration. [Lots / responsable proposé : A · Modèle/backend.]
- [ ] **DEC-02** — Instruire et faire arbitrer : Sémantique des associations et références topologiques 2D/3D. Preuve : Identités, propagation, ambiguïtés, conflits et tests. [Lots / responsable proposé : A · CAO/modèle.]
- [ ] **DEC-03** — Instruire et faire arbitrer : Définition Étude / Variante / Révision et migration des projets. Preuve : Entités, isolation, historique, restauration. [Lots / responsable proposé : A + R · Architecture/backend.]
- [ ] **DEC-04** — Instruire et faire arbitrer : Profils standard, métier, personnels et partage d’équipe. Preuve : UX, permissions, export/import, synchronisation. [Lots / responsable proposé : B · Produit/UX.]
- [ ] **DEC-05** — Instruire et faire arbitrer : Support et gouvernance des manifests Registry. Preuve : Validation au build, offline, compatibilité et confiance. [Lots / responsable proposé : B · Architecture/sécurité.]
- [ ] **DEC-06** — Instruire et faire arbitrer : API et limites du Tool Manager. Preuve : Séquence activation/désactivation, événements, tests. [Lots / responsable proposé : B · Frontend.]
- [ ] **DEC-07** — Instruire et faire arbitrer : Granularité des chunks, préchargement et cache. Preuve : Bundle analysis, première action, réseau et mémoire. [Lots / responsable proposé : B · Frontend/performance.]
- [ ] **DEC-08** — Instruire et faire arbitrer : Renderer 2D cible et seuil d’optimisation/bascule. Preuve : Fidélité SVG/Canvas/GPU, GPU réel et accessibilité. [Lots / responsable proposé : A/C/F · CAO/rendu.]
- [ ] **DEC-09** — Instruire et faire arbitrer : Structure de l’index spatial et algorithme de snapping. Preuve : Résultats exacts, densités, insertion/suppression et p95. [Lots / responsable proposé : C · Géométrie.]
- [ ] **DEC-10** — Instruire et faire arbitrer : Invalidation partielle de la scène 3D. Preuve : Tables de picking, cas hôtes/dépendances, benchmarks. [Lots / responsable proposé : C · Rendu.]
- [ ] **DEC-11** — Instruire et faire arbitrer : Gestion des workers, mémoire et OCCT. Preuve : Crash, temps, instances, quotas, reprise. [Lots / responsable proposé : D · Calcul/exploitation.]
- [ ] **DEC-12** — Instruire et faire arbitrer : Historique et undo/redo entre sous-modèles. Preuve : Deltas, commandes, révisions et conflits réels. [Lots / responsable proposé : A · Modèle/backend.]
- [ ] **DEC-13** — Instruire et faire arbitrer : Appareils, profils de charge et budgets de performance. Preuve : Jeux S1–S7 et limites d’acceptation validées. [Lots / responsable proposé : X · Qualité/produit.]
- [ ] **DEC-14** — Instruire et faire arbitrer : Profil et stratégie des outils utilisables hors ligne. Preuve : Disponibilité, quota/cache, contrat versionné, reconnection. [Lots / responsable proposé : B + R · Frontend/backend.]
- [ ] **DEC-15** — Instruire et faire arbitrer : Extensions et adaptateur MCP, si retenus. Preuve : Risques, consentement, droits, schémas et confirmations. [Lots / responsable proposé : F · Sécurité/architecture.]
- [ ] **DEC-16** — Instruire et faire arbitrer : Manifeste de publication multi-sources. Preuve : Empreintes, versions coordonnées, statut des approbations. [Lots / responsable proposé : E · Documentation/backend.]
- [ ] **DEC-17** — Instruire et faire arbitrer : Qualité adaptative et concessions graphiques admises. Preuve : Comparaison visuelle et non-régression géométrique. [Lots / responsable proposé : C/F · Rendu/produit.]
- [ ] **DEC-18** — Instruire et faire arbitrer : Réutilisation effective des moteurs et services Fadi. Preuve : Audit sur commit de livraison, tests, coûts, licences. [Lots / responsable proposé : A–F + R · Architecture.]

---

## Annexe C. Qualification individuelle de la couverture

L’annexe C du plan fournit les groupes et les lots des 104 exigences, mais pas leur libellé individuel. Les cases ci-dessous sont donc des tâches de qualification/traçabilité, pas une réécriture inventée des exigences. Relever le texte exact dans REF-02 avant de compléter chaque fiche. Même règle pour les 15 invariants, 11 interfaces et 11 critères d’acceptation mentionnés dans le plan.

**141 cases à cocher.**

Règle C — Pour chaque fiche : relever le libellé exact dans REF-02 ; indiquer sa source, son responsable, le contrat et le composant candidat ; définir les tests positifs/négatifs ; rattacher les preuves disponibles et les décisions nécessaires ; consigner l’état et le verdict. Une preuve absente reste « à produire ». Cocher la tâche lorsque la fiche est complète et son état est fidèlement qualifié : cette case ne déclare pas, à elle seule, l’exigence conforme ou la fonction livrée.

### EX-001 à EX-007 — Autonomie, contexte, domaines et planches

**Source :** Plan annexe C.

- [ ] **TR-EX-001** — Compléter et qualifier la fiche EX-001 selon la règle C. Lots du plan : I + A + E.
- [ ] **TR-EX-002** — Compléter et qualifier la fiche EX-002 selon la règle C. Lots du plan : I + A + E.
- [ ] **TR-EX-003** — Compléter et qualifier la fiche EX-003 selon la règle C. Lots du plan : I + A + E.
- [ ] **TR-EX-004** — Compléter et qualifier la fiche EX-004 selon la règle C. Lots du plan : I + A + E.
- [ ] **TR-EX-005** — Compléter et qualifier la fiche EX-005 selon la règle C. Lots du plan : I + A + E.
- [ ] **TR-EX-006** — Compléter et qualifier la fiche EX-006 selon la règle C. Lots du plan : I + A + E.
- [ ] **TR-EX-007** — Compléter et qualifier la fiche EX-007 selon la règle C. Lots du plan : I + A + E.

### EX-008 à EX-011 — Dépendances, propriété et effets

**Source :** Plan annexe C.

- [ ] **TR-EX-008** — Compléter et qualifier la fiche EX-008 selon la règle C. Lots du plan : A + C + X.
- [ ] **TR-EX-009** — Compléter et qualifier la fiche EX-009 selon la règle C. Lots du plan : A + C + X.
- [ ] **TR-EX-010** — Compléter et qualifier la fiche EX-010 selon la règle C. Lots du plan : A + C + X.
- [ ] **TR-EX-011** — Compléter et qualifier la fiche EX-011 selon la règle C. Lots du plan : A + C + X.

### EX-012 à EX-019 — Révisions, provenance, transactions et schémas

**Source :** Plan annexe C.

- [ ] **TR-EX-012** — Compléter et qualifier la fiche EX-012 selon la règle C. Lots du plan : A + R.
- [ ] **TR-EX-013** — Compléter et qualifier la fiche EX-013 selon la règle C. Lots du plan : A + R.
- [ ] **TR-EX-014** — Compléter et qualifier la fiche EX-014 selon la règle C. Lots du plan : A + R.
- [ ] **TR-EX-015** — Compléter et qualifier la fiche EX-015 selon la règle C. Lots du plan : A + R.
- [ ] **TR-EX-016** — Compléter et qualifier la fiche EX-016 selon la règle C. Lots du plan : A + R.
- [ ] **TR-EX-017** — Compléter et qualifier la fiche EX-017 selon la règle C. Lots du plan : A + R.
- [ ] **TR-EX-018** — Compléter et qualifier la fiche EX-018 selon la règle C. Lots du plan : A + R.
- [ ] **TR-EX-019** — Compléter et qualifier la fiche EX-019 selon la règle C. Lots du plan : A + R.

### EX-020 à EX-025 — Planches, associations et précision

**Source :** Plan annexe C.

- [ ] **TR-EX-020** — Compléter et qualifier la fiche EX-020 selon la règle C. Lots du plan : A + C.
- [ ] **TR-EX-021** — Compléter et qualifier la fiche EX-021 selon la règle C. Lots du plan : A + C.
- [ ] **TR-EX-022** — Compléter et qualifier la fiche EX-022 selon la règle C. Lots du plan : A + C.
- [ ] **TR-EX-023** — Compléter et qualifier la fiche EX-023 selon la règle C. Lots du plan : A + C.
- [ ] **TR-EX-024** — Compléter et qualifier la fiche EX-024 selon la règle C. Lots du plan : A + C.
- [ ] **TR-EX-025** — Compléter et qualifier la fiche EX-025 selon la règle C. Lots du plan : A + C.

### EX-026 à EX-031 — Registry et gouvernance des capacités

**Source :** Plan annexe C.

- [ ] **TR-EX-026** — Compléter et qualifier la fiche EX-026 selon la règle C. Lots du plan : B + X ; F pour extensions.
- [ ] **TR-EX-027** — Compléter et qualifier la fiche EX-027 selon la règle C. Lots du plan : B + X ; F pour extensions.
- [ ] **TR-EX-028** — Compléter et qualifier la fiche EX-028 selon la règle C. Lots du plan : B + X ; F pour extensions.
- [ ] **TR-EX-029** — Compléter et qualifier la fiche EX-029 selon la règle C. Lots du plan : B + X ; F pour extensions.
- [ ] **TR-EX-030** — Compléter et qualifier la fiche EX-030 selon la règle C. Lots du plan : B + X ; F pour extensions.
- [ ] **TR-EX-031** — Compléter et qualifier la fiche EX-031 selon la règle C. Lots du plan : B + X ; F pour extensions.

### EX-032 à EX-037 — Manager, profils et ergonomie

**Source :** Plan annexe C.

- [ ] **TR-EX-032** — Compléter et qualifier la fiche EX-032 selon la règle C. Lots du plan : B + I.
- [ ] **TR-EX-033** — Compléter et qualifier la fiche EX-033 selon la règle C. Lots du plan : B + I.
- [ ] **TR-EX-034** — Compléter et qualifier la fiche EX-034 selon la règle C. Lots du plan : B + I.
- [ ] **TR-EX-035** — Compléter et qualifier la fiche EX-035 selon la règle C. Lots du plan : B + I.
- [ ] **TR-EX-036** — Compléter et qualifier la fiche EX-036 selon la règle C. Lots du plan : B + I.
- [ ] **TR-EX-037** — Compléter et qualifier la fiche EX-037 selon la règle C. Lots du plan : B + I.

### EX-038 à EX-044 — Chargement, cache et hors connexion

**Source :** Plan annexe C.

- [ ] **TR-EX-038** — Compléter et qualifier la fiche EX-038 selon la règle C. Lots du plan : B + R.
- [ ] **TR-EX-039** — Compléter et qualifier la fiche EX-039 selon la règle C. Lots du plan : B + R.
- [ ] **TR-EX-040** — Compléter et qualifier la fiche EX-040 selon la règle C. Lots du plan : B + R.
- [ ] **TR-EX-041** — Compléter et qualifier la fiche EX-041 selon la règle C. Lots du plan : B + R.
- [ ] **TR-EX-042** — Compléter et qualifier la fiche EX-042 selon la règle C. Lots du plan : B + R.
- [ ] **TR-EX-043** — Compléter et qualifier la fiche EX-043 selon la règle C. Lots du plan : B + R.
- [ ] **TR-EX-044** — Compléter et qualifier la fiche EX-044 selon la règle C. Lots du plan : B + R.

### EX-045 à EX-049 — Preview, journal, historique et reprise

**Source :** Plan annexe C.

- [ ] **TR-EX-045** — Compléter et qualifier la fiche EX-045 selon la règle C. Lots du plan : A + D + R.
- [ ] **TR-EX-046** — Compléter et qualifier la fiche EX-046 selon la règle C. Lots du plan : A + D + R.
- [ ] **TR-EX-047** — Compléter et qualifier la fiche EX-047 selon la règle C. Lots du plan : A + D + R.
- [ ] **TR-EX-048** — Compléter et qualifier la fiche EX-048 selon la règle C. Lots du plan : A + D + R.
- [ ] **TR-EX-049** — Compléter et qualifier la fiche EX-049 selon la règle C. Lots du plan : A + D + R.

### EX-050 à EX-054 — Scène, invalidation et index

**Source :** Plan annexe C.

- [ ] **TR-EX-050** — Compléter et qualifier la fiche EX-050 selon la règle C. Lots du plan : C.
- [ ] **TR-EX-051** — Compléter et qualifier la fiche EX-051 selon la règle C. Lots du plan : C.
- [ ] **TR-EX-052** — Compléter et qualifier la fiche EX-052 selon la règle C. Lots du plan : C.
- [ ] **TR-EX-053** — Compléter et qualifier la fiche EX-053 selon la règle C. Lots du plan : C.
- [ ] **TR-EX-054** — Compléter et qualifier la fiche EX-054 selon la règle C. Lots du plan : C.

### EX-055 à EX-058 — Fidélité de rendu et qualité

**Source :** Plan annexe C.

- [ ] **TR-EX-055** — Compléter et qualifier la fiche EX-055 selon la règle C. Lots du plan : A + C ; F selon décision.
- [ ] **TR-EX-056** — Compléter et qualifier la fiche EX-056 selon la règle C. Lots du plan : A + C ; F selon décision.
- [ ] **TR-EX-057** — Compléter et qualifier la fiche EX-057 selon la règle C. Lots du plan : A + C ; F selon décision.
- [ ] **TR-EX-058** — Compléter et qualifier la fiche EX-058 selon la règle C. Lots du plan : A + C ; F selon décision.

### EX-059 à EX-063 — Workers, tâches, mémoire et transfert

**Source :** Plan annexe C.

- [ ] **TR-EX-059** — Compléter et qualifier la fiche EX-059 selon la règle C. Lots du plan : D.
- [ ] **TR-EX-060** — Compléter et qualifier la fiche EX-060 selon la règle C. Lots du plan : D.
- [ ] **TR-EX-061** — Compléter et qualifier la fiche EX-061 selon la règle C. Lots du plan : D.
- [ ] **TR-EX-062** — Compléter et qualifier la fiche EX-062 selon la règle C. Lots du plan : D.
- [ ] **TR-EX-063** — Compléter et qualifier la fiche EX-063 selon la règle C. Lots du plan : D.

### EX-064 à EX-070 — BIM, exigences, coordination et clôture

**Source :** Plan annexe C.

- [ ] **TR-EX-064** — Compléter et qualifier la fiche EX-064 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-065** — Compléter et qualifier la fiche EX-065 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-066** — Compléter et qualifier la fiche EX-066 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-067** — Compléter et qualifier la fiche EX-067 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-068** — Compléter et qualifier la fiche EX-068 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-069** — Compléter et qualifier la fiche EX-069 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-070** — Compléter et qualifier la fiche EX-070 selon la règle C. Lots du plan : E.

### EX-071 à EX-073 — Visualisation et provenance des médias

**Source :** Plan annexe C.

- [ ] **TR-EX-071** — Compléter et qualifier la fiche EX-071 selon la règle C. Lots du plan : E ; F pour capacités avancées.
- [ ] **TR-EX-072** — Compléter et qualifier la fiche EX-072 selon la règle C. Lots du plan : E ; F pour capacités avancées.
- [ ] **TR-EX-073** — Compléter et qualifier la fiche EX-073 selon la règle C. Lots du plan : E ; F pour capacités avancées.

### EX-074 à EX-082 — Documents, métrés, formats et publication

**Source :** Plan annexe C.

- [ ] **TR-EX-074** — Compléter et qualifier la fiche EX-074 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-075** — Compléter et qualifier la fiche EX-075 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-076** — Compléter et qualifier la fiche EX-076 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-077** — Compléter et qualifier la fiche EX-077 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-078** — Compléter et qualifier la fiche EX-078 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-079** — Compléter et qualifier la fiche EX-079 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-080** — Compléter et qualifier la fiche EX-080 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-081** — Compléter et qualifier la fiche EX-081 selon la règle C. Lots du plan : E.
- [ ] **TR-EX-082** — Compléter et qualifier la fiche EX-082 selon la règle C. Lots du plan : E.

### EX-083 à EX-086 — Workflow, permissions et observations

**Source :** Plan annexe C.

- [ ] **TR-EX-083** — Compléter et qualifier la fiche EX-083 selon la règle C. Lots du plan : E + X.
- [ ] **TR-EX-084** — Compléter et qualifier la fiche EX-084 selon la règle C. Lots du plan : E + X.
- [ ] **TR-EX-085** — Compléter et qualifier la fiche EX-085 selon la règle C. Lots du plan : E + X.
- [ ] **TR-EX-086** — Compléter et qualifier la fiche EX-086 selon la règle C. Lots du plan : E + X.

### EX-087 à EX-091 — API, isolation, persistance et migration

**Source :** Plan annexe C.

- [ ] **TR-EX-087** — Compléter et qualifier la fiche EX-087 selon la règle C. Lots du plan : A + R + X.
- [ ] **TR-EX-088** — Compléter et qualifier la fiche EX-088 selon la règle C. Lots du plan : A + R + X.
- [ ] **TR-EX-089** — Compléter et qualifier la fiche EX-089 selon la règle C. Lots du plan : A + R + X.
- [ ] **TR-EX-090** — Compléter et qualifier la fiche EX-090 selon la règle C. Lots du plan : A + R + X.
- [ ] **TR-EX-091** — Compléter et qualifier la fiche EX-091 selon la règle C. Lots du plan : A + R + X.

### EX-092 à EX-096 — Sécurité, confidentialité, observabilité et licences

**Source :** Plan annexe C.

- [ ] **TR-EX-092** — Compléter et qualifier la fiche EX-092 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-093** — Compléter et qualifier la fiche EX-093 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-094** — Compléter et qualifier la fiche EX-094 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-095** — Compléter et qualifier la fiche EX-095 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-096** — Compléter et qualifier la fiche EX-096 selon la règle C. Lots du plan : X sur tous les lots.

### EX-097 à EX-101 — Performance, tests et preuves

**Source :** Plan annexe C.

- [ ] **TR-EX-097** — Compléter et qualifier la fiche EX-097 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-098** — Compléter et qualifier la fiche EX-098 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-099** — Compléter et qualifier la fiche EX-099 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-100** — Compléter et qualifier la fiche EX-100 selon la règle C. Lots du plan : X sur tous les lots.
- [ ] **TR-EX-101** — Compléter et qualifier la fiche EX-101 selon la règle C. Lots du plan : X sur tous les lots.

### EX-102 à EX-104 — Traçabilité et auditabilité

**Source :** Plan annexe C.

- [ ] **TR-EX-102** — Compléter et qualifier la fiche EX-102 selon la règle C. Lots du plan : X + pilotage.
- [ ] **TR-EX-103** — Compléter et qualifier la fiche EX-103 selon la règle C. Lots du plan : X + pilotage.
- [ ] **TR-EX-104** — Compléter et qualifier la fiche EX-104 selon la règle C. Lots du plan : X + pilotage.

### Invariants INV-001 à INV-015

**Source :** Plan §5.4 et annexe C.

- [ ] **TR-INV-001** — Compléter et qualifier la fiche INV-001 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-002** — Compléter et qualifier la fiche INV-002 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-003** — Compléter et qualifier la fiche INV-003 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-004** — Compléter et qualifier la fiche INV-004 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-005** — Compléter et qualifier la fiche INV-005 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-006** — Compléter et qualifier la fiche INV-006 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-007** — Compléter et qualifier la fiche INV-007 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-008** — Compléter et qualifier la fiche INV-008 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-009** — Compléter et qualifier la fiche INV-009 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-010** — Compléter et qualifier la fiche INV-010 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-011** — Compléter et qualifier la fiche INV-011 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-012** — Compléter et qualifier la fiche INV-012 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-013** — Compléter et qualifier la fiche INV-013 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-014** — Compléter et qualifier la fiche INV-014 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.
- [ ] **TR-INV-015** — Compléter et qualifier la fiche INV-015 selon la règle C ; relever le libellé exact et les tests d’invariant dans REF-02.

### Contrats IF-001 à IF-011

**Source :** Plan §1.1, §5.4 et annexe C.

- [ ] **TR-IF-001** — Compléter et qualifier la fiche IF-001 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-002** — Compléter et qualifier la fiche IF-002 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-003** — Compléter et qualifier la fiche IF-003 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-004** — Compléter et qualifier la fiche IF-004 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-005** — Compléter et qualifier la fiche IF-005 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-006** — Compléter et qualifier la fiche IF-006 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-007** — Compléter et qualifier la fiche IF-007 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-008** — Compléter et qualifier la fiche IF-008 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-009** — Compléter et qualifier la fiche IF-009 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-010** — Compléter et qualifier la fiche IF-010 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.
- [ ] **TR-IF-011** — Compléter et qualifier la fiche IF-011 selon la règle C ; relever le contrat exact et ses preuves attendues dans REF-02.

### Critères AC-001 à AC-011

**Source :** Plan §1.1, §5.4 et annexe C.

- [ ] **TR-AC-001** — Compléter et qualifier la fiche AC-001 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-002** — Compléter et qualifier la fiche AC-002 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-003** — Compléter et qualifier la fiche AC-003 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-004** — Compléter et qualifier la fiche AC-004 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-005** — Compléter et qualifier la fiche AC-005 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-006** — Compléter et qualifier la fiche AC-006 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-007** — Compléter et qualifier la fiche AC-007 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-008** — Compléter et qualifier la fiche AC-008 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-009** — Compléter et qualifier la fiche AC-009 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-010** — Compléter et qualifier la fiche AC-010 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.
- [ ] **TR-AC-011** — Compléter et qualifier la fiche AC-011 selon la règle C ; relever le critère exact et son scénario d’acceptation dans REF-02.

---

## Annexe D. Provenance et contrôle de la transformation

Checklist dérivée uniquement du plan joint V1.0. Les citations de la charte, du référentiel et du dépôt qui y figurent restent des références à consulter lors de l’exécution ; elles ne sont pas une nouvelle vérification du code ou de la production.

**5 cases à cocher.**

### D.1 Sources et périmètre à conserver au suivi

**Source :** Plan annexe D.

- [ ] **PROV-01** — Conserver la référence de REF-01 et l’empreinte Git déclarée dans le plan : e1d61ca38809e1faac6111c5ffb0881619b9a6dc.
- [ ] **PROV-02** — Conserver la référence de REF-02 et l’empreinte Git déclarée dans le plan : ce7cf463e34c92c0178fa0c0b495569a13c7fe32.
- [ ] **PROV-03** — Conserver REP-01 comme observation du 18/10/2026 au commit 5cf61d1fed9ed523b331228af20bce93a4f2bf63, sans l’assimiler à un HEAD futur.
- [ ] **PROV-04** — Conserver les chemins de sources du plan et distinguer les résultats futurs de l’audit historique 3bcda929….
- [ ] **PROV-05** — Documenter à chaque révision de la checklist les modifications du découpage, sans renuméroter EX, INV, IF, AC, TEST, NAV ou DEC.

### Correspondance avec le référentiel — reprise du plan

| Référentiel V1.0 | Localisation dans le plan source |
|---|---|
| §0–1 · Statut, portée et domaines | §1–2 et §4 : préséance, DEM-01, accès indépendant et portes G0–G4. |
| §2–4 · Architecture, données et associations | §3 et lot A ; migration au §8. |
| §5–7 · Registry, Manager, chargement et offline | Lot B, critères NAV et TEST-016 à TEST-021/036. |
| §8 · Commandes et historique | Lot A.5, transversal X et reprise R. |
| §9–11 · Scène, rendu, workers | Lots C/D ; options F ; protocole de mesure X. |
| §12–15 · BIM, visualisation, documents et workflow | Lot E ; options F pour les capacités avancées non retenues au pilote. |
| §16–17 · Services, persistance et sécurité | Architecture §3 ; A/R/X ; migration §8. |
| §18–20 · Mesures, tests et traçabilité | Transversal X, §7/9 et annexes A/C. |
| §21 · Analyse, migration et lots conditionnels | §4–6 et §8–11 ; conservation des lots A à F. |
| Annexe A · Observations historiques | Point de départ à requalifier ; aucune conformité actuelle présumée. |
| Annexe B · DEC-01 à DEC-18 | Annexe B du plan ; mêmes identifiants. |
| Annexe C · Fiches outils exemplaires | Premiers contrats candidats pour A/B/E/F, sans prétendre couvrir tout le catalogue. |
| Annexe D · Sources et glossaire | Références de base ; sources directement utilisées ci-après. |

Cette correspondance reste un index documentaire. Les cases de l’annexe C servent à qualifier les obligations une par une, sans présumer leur validation.

---

## Limites et statut de la liste

Le plan joint reste la source du découpage. Les textes complets des 104 exigences, 15 invariants, 11 interfaces et 11 critères ne figurent pas individuellement dans le plan : ils doivent être relevés dans le référentiel technique pour exécuter les tâches de qualification. Les valeurs de calendrier, les seuils de performance et les choix techniques ouverts restent à fixer aux portes prévues.

Toutes les cases décrivent des tâches futures ou des vérifications à documenter. Aucune action de cette checklist n’a été exécutée pour produire la liste.
