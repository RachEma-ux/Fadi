# Fadi — Studio
## Plan d’implémentation du module indépendant

**Version 1.0 · 18 octobre 2026 · STUDIO-PLAN-001**

**Entrée produit imposée : « Studio » dans la barre latérale verticale de Fadi.**

**Statut : plan proposé à validation.** Ce document organise le travail ; il ne constitue ni une preuve de conformité ni une autorisation de modifier ou de déployer l’application. Les documents de référence restent inchangés. Les états initiaux de réalisation et de recette sont « à instruire » ou « à réaliser », jamais « terminé » par défaut.

## 1. Sources, portée et décisions de cadrage

### 1.1. Références et préséance

| Référence | Document ou décision | Utilisation dans ce plan |
|---|---|---|
| REF-01 | Définition officielle de référence du Studio V2.1, 17/10/2026. | Finalité, autonomie, quatre domaines, deux planches et invariants. |
| REF-02 | Référentiel technique détaillé V1.0, STUDIO-RT-001, 17/10/2026. | Exigences EX-001 à EX-104 ; invariants INV-001 à INV-015 ; contrats IF-001 à IF-011 ; critères AC-001 à AC-011 ; tests TEST-001 à TEST-038 ; décisions DEC-01 à DEC-18. |
| DEM-01 | Demande actuelle de l’utilisateur. | Studio est un module indépendant, disponible dans la barre latérale verticale sous le titre exact « Studio ». |
| REP-01 | Lecture ciblée du dépôt au commit 5cf61d1fed9ed523b331228af20bce93a4f2bf63. | Points d’intégration du routage, de la navigation, de la modularité et du suivi. Ce n’est pas un nouvel audit exhaustif des moteurs. |
| PLAN | Propositions opérationnelles du présent document. | Routes, lot d’intégration I, sous-lots, organisation des livraisons et critères de navigation complémentaires ; à arbitrer lorsque non fixés par DEM-01. |

La charte reste l’autorité sur les principes du produit. Le référentiel technique organise les contrats et preuves. Les observations du code ne réduisent pas la cible. Une incompatibilité doit être portée dans une décision explicite, et non résolue en recopiant le fonctionnement actuel. Les cartes mentales sont des supports de consultation, pas une troisième autorité normative.

### 1.2. Résultat attendu

L’utilisateur entre dans Studio depuis la navigation principale, choisit un projet autorisé et une étude, puis conçoit en 2D indépendante, en 3D indépendante ou sur des objets architecturaux associés. Il retrouve ses outils personnels, ses révisions et ses contenus après réouverture. Il peut contrôler, documenter, faire approuver puis publier un ensemble identifié de versions. Ce parcours ne dépend d’aucune étape préalable du Parcours.

**Indépendant signifie autonome dans la navigation, ses écrans, ses responsabilités, son cycle de vie et ses tests. Cela ne signifie pas une deuxième application, un second système de comptes ou une base métier concurrente.** Les services partagés de Fadi conservent leurs responsabilités. La géométrie libre ne devient pas BIM sans opération explicite.

### 1.3. Ce qui est fixé et ce qui ne l’est pas

L’intitulé « Studio », sa présence dans la barre verticale et son autonomie sont imposés par DEM-01. Les quatre domaines, les deux planches et les garanties proviennent de REF-01/REF-02. Le nom exact des routes, l’emplacement du bouton entre les autres entrées, la structure physique des paquets, le périmètre du premier usage métier et les budgets restent des propositions à valider.

Le plan n’autorise pas la suppression de l’Atelier, la modification des 21 étapes, le remplacement systématique des moteurs ni un déploiement automatique. Les fonctions industrielles utiles doivent être qualifiées dans les catalogues Fadi, non supprimées au seul motif qu’elles sont spécialisées.

## 2. Insertion de Studio dans l’application

### 2.1. Points vérifiés dans le dépôt

Lecture ciblée du 18/10/2026, sur REP-01 ; aucun test d’exécution de l’application n’a été relancé pour ce plan.

| Élément lu | Constat limité au fichier | Travail à prévoir |
|---|---|---|
| `apps/web/src/App.tsx` | Routes globales sous AppShell ; ProjectShell est chargé à la demande. Aucune route Studio n’est déclarée dans ce fichier. | Ajouter les routes Studio propres, protégées et chargées à la demande. |
| `apps/web/src/routes/AppShell.tsx` | La navigation principale contient Accueil, Projets et Collaboration. Le contexte projet est déduit de deux formes de routes `/projets/...`. | Ajouter « Studio » ; adapter la résolution du projet pour les routes Studio et le bandeau commun. |
| `apps/web/src/routes/ProjectShell.tsx` | Les modules projet passent par `?module=` ; des données d’étapes sont demandées ; l’Atelier est placé dans cette enveloppe. | Ne pas faire de ProjectShell le prérequis de Studio ; extraire les services de contexte nécessaires. |
| `apps/web/src/lib/use-immersive.ts` | Le mode Atelier applique `atelier-immersive`, conçu pour effacer l’enveloppe, dont la barre latérale. | Ne pas activer ce comportement automatiquement dans Studio. |
| `apps/web/src/modules/module-registry.ts` | Sept descripteurs de modules projet, dont `atelier` ; aucun descripteur `studio`. | Décider comment déclarer les entrées globales et les raccourcis projet sans dupliquer les descripteurs. |
| `scripts/check-module-deps.mjs` | Vérifie les dépendances des paquets purs et interdit les imports croisés web/API ; ne garantit pas à lui seul toutes les frontières entre modules web. | Ajouter les règles de dépendance propres à Studio et leurs tests. |
| `docs/continuity/README.md` | Chantier durable, Issues, branches courtes, PR et fichiers de reprise sont déjà définis. | Utiliser cette continuité plutôt qu’inventer une branche permanente Studio. |

Les deux Word de REF-01 et REF-02 présents dans `Studio/` ont les mêmes empreintes Git que les copies lues. L’annexe A de REF-02 reste, elle, un audit historique au commit `3bcda929…` : ses constats sur les moteurs doivent être requalifiés, pas assimilés à des tests actuels.

### 2.2. Comportement de navigation proposé

L’entrée « Studio » appartient à la navigation principale de la barre verticale, au même niveau qu’Accueil et Projets. Un placement après Projets est proposé, sans déplacer les autres fonctions inutilement. Elle reste identifiée lorsque l’utilisateur navigue entre les quatre domaines ou les deux planches.

La barre dépliée affiche le texte « Studio ». En mode replié, l’icône conserve le nom accessible et l’infobulle « Studio ». Sur mobile, le menu vertical adaptatif donne accès à la même entrée. Un plein écran peut être proposé comme action explicite, avec sortie visible ; l’éditeur ne masque pas la navigation générale de lui-même.

À l’ouverture, Studio présente les projets/études accessibles et l’action de créer une étude. Si un contexte projet valide est transmis, il est repris. Sinon l’utilisateur choisit le projet ; aucune géométrie n’est créée dans un projet fictif. Le dernier contexte personnel sert de suggestion, jamais de permission ni de substitution à l’URL demandée.

### 2.3. Routes candidates et contexte

Les chemins ci-dessous sont une proposition du plan, pas des routes déjà implantées ni des prescriptions textuelles de REF-02.

| Route candidate | Écran et règle |
|---|---|
| `/studio` | Accueil Studio ; études et projets autorisés ; sélection ou création d’étude. |
| `/studio/projets/:projectId` | Liste des études du projet autorisé. |
| `/studio/projets/:projectId/etudes/:studyId` | Cadrage de l’étude ; sources et variantes, même avant création de géométrie. |
| `/studio/projets/:projectId/etudes/:studyId/variantes/:variantId` | Espace de conception ; domaine et planche conservés dans un état d’URL défini par contrat. |
| `/studio/.../revisions/:revisionId` | Consultation identifiée d’une révision ; historique non réécrit. |

La forme abrégée de la dernière ligne désigne la même hiérarchie projet/étude/variante ; elle n’est pas un motif littéral à coder. Le schéma définitif doit couvrir ouverture directe, actualisation, partage du lien, retour/précédent et refus d’accès. Toute relation entre les identifiants est vérifiée côté serveur.

### 2.4. Critères complémentaires de navigation

| ID du plan | Critère d’acceptation |
|---|---|
| NAV-001 | « Studio » est présent dans la barre verticale ; nom accessible, clavier et état actif sont corrects. |
| NAV-002 | Studio s’ouvre sans passer par Parcours ni par l’Atelier actuel ; aucune étape n’est créée ou validée implicitement. |
| NAV-003 | L’absence de projet/étude conduit à un choix explicite, sans erreur ni objet métier orphelin. |
| NAV-004 | L’URL, la réouverture et précédent/suivant restituent le contexte autorisé ; un lien interdit ne divulgue pas le contenu. |
| NAV-005 | Les quatre domaines sont accessibles dans Studio ; les deux planches existent uniquement dans Dessin et modélisation. |
| NAV-006 | Le bandeau affiche le bon projet, l’étude, la variante et la révision ; l’entrée Projets n’est pas faussement active. |
| NAV-007 | Changer d’espace n’abandonne pas silencieusement un geste, une commande locale ou une sauvegarde en attente. |
| NAV-008 | Une erreur de chargement ou de moteur reste récupérable sans bloquer la navigation Fadi ; la barre n’est pas masquée par le mode Atelier. |
| NAV-009 | Accueil, Projets, Parcours, Atelier et Collaboration conservent leurs parcours testés pendant la coexistence. |

Ces identifiants complètent le référentiel sans renuméroter TEST-001 à TEST-038. Les modalités de test mobile et plein écran sont fixées dans la recette UX.

## 3. Architecture de réalisation proposée

### 3.1. Enveloppe autonome, services partagés

**Proposition : AppShell Fadi → StudioShell → accueil/contexte Studio → quatre domaines → outils → commandes → modèles canoniques → projections et services.** Le Tool Registry alimente le Manager ; il n’est pas une étape d’exécution réseau entre chaque geste et le moteur.

StudioShell ne dépend pas de ProjectShell pour fonctionner. Il réutilise l’authentification, la résolution de projet et les services autorisés au travers d’interfaces publiques. Il ne réembarque ni une page HTML de carte mentale, ni l’Atelier complet dans une iframe. Les HTML de `Studio/` restent documentaires.

| Zone candidate | Responsabilité | Limite |
|---|---|---|
| `apps/web/src/modules/studio/` | StudioShell, accueil, domaines, planches, panneaux, état UI, adaptateurs web. | Pas d’écriture directe dans PostgreSQL ; pas de dépendance à l’enveloppe Parcours. |
| Paquets purs existants, puis extraction justifiée | Modèles canoniques, commandes, géométrie, schémas et contrats. | Aucun React, DOM ou état de scène graphique dans les contrats purs. |
| Services techniques partagés côté web | Loaders, projections, index, rendu, workers et ordonnanceur. | Les maillages/caches ne deviennent pas la source de vérité. |
| `apps/api/src/` | Autorisations, études, révisions, transactions, jobs, publications, reprise. | Pas de nouvelle identité utilisateur ou de seconde autorité métier. |
| `Studio/` | Documents directeurs, plans et cartes mentales. | Ce dossier documentaire n’est pas le module exécutable. |
| `docs/workstreams/studio/` | Contexte, tâches, statut et transfert de session proposés. | Références aux sources, sans seconde copie normative des contrats. |

Les noms de nouveaux paquets seront décidés après l’audit. Créer un paquet pour chaque bouton est exclu comme règle universelle. Les services partagés entre Atelier et Studio doivent avoir une frontière publique et une direction de dépendance contrôlée.

### 3.2. Trois autorités de données à conserver

Le dessin 2D indépendant possède ses primitives et son document. La géométrie 3D libre possède sa définition spatiale. L’objet architectural associé possède une définition sémantique commune, référencée par les deux planches. Les projections, cotes dérivées, scènes et index conservent leur provenance et leur révision, sans créer une autorité concurrente.

Les commandes suivent les contrats de REF-02 : contexte, requestId, version de contrat, baseRevisionId, cibles et paramètres. Le serveur rétablit l’identité authentifiée, valide l’appartenance, les droits et la version, puis accepte, refuse, signale un conflit, un traitement différé ou un doublon. L’invalidation dérivée suit l’engagement canonique ; les résultats anciens restent attachés à leur source.

### 3.3. Coexistence avec l’Atelier

La première intégration ajoute Studio sans supprimer les accès historiques. Chaque composant de l’Atelier est classé : conserver, compléter, corriger, isoler, remplacer ou retirer, avec preuve et décision. La réutilisation d’une fonction ne signifie pas recopier l’ensemble du module.

La bascule des données définit un seul propriétaire d’écriture par jeu de données. Pour une étude migrée, l’ancien accès peut devenir une redirection contrôlée ou une consultation en lecture seule ; le choix est à valider. Aucune synchronisation bidirectionnelle artisanale entre deux bases concurrentes n’est introduite. Aucun retrait définitif n’intervient avant comparaison avant/après, restauration testée et acceptation.

## 4. Préparation et portes de décision

REF-02 §0.3 et §21.1 imposent de distinguer cible, preuves et autorisation. Le plan conserve les portes G0 à G4 et les lots A à F du §21.2. Le lot I, le transversal X et le lot de livraison R sont des compléments opérationnels, non des domaines supplémentaires.

| Porte | Travail et livrables | Sortie observable |
|---|---|---|
| G0 — Cadrage | Fixer DEM-01, le premier usage métier, le périmètre pilote, les responsables et la référence documentaire. | Cible et critères du premier usage acceptés ; pas de calendrier imposant de fermer une inconnue. |
| G1 — Spécification | Décrire navigation, contrats des outils retenus, données, droits, historique, migrations et risques. Relever toutes les exigences de REF-02. | Un contrat vérifiable et une source de vérité pour chaque fonction du lot. |
| G2 — Preuves | POC limités et autorisés séparément : autonomie 2D/3D, association, chargement réel, conflits, reprise, publication ; corpus S1–S7. | Résultats datés et reproductibles pour les risques qui conditionnent la décision. |
| G3 — Architecture | Arbitrer DEC-01 à DEC-18 selon les lots engagés ; décider composants, interfaces, migration, retour arrière et lots de code. | Autorisation explicite du sous-ensemble ; décisions critiques du sous-ensemble résolues. |
| G4 — Livraison | Vérifier le build, les scénarios, les preuves, la recette utilisateur et la procédure d’exploitation. | Acceptation du périmètre livré et décision distincte de déploiement. |

La préparation utilise les documents existants au lieu de recommencer la rédaction du concept. L’audit est borné par commit et par exigence. Une revue statique est notée comme telle ; un scénario non exécuté reste à réaliser. La fermeture d’une décision facultative n’est pas exigée pour livrer un périmètre qui n’en dépend pas, mais ce périmètre doit l’exclure explicitement.

## 5. Lots de réalisation et acceptation

### 5.1. Lot I — Intégration native et navigation « Studio » · P0

**Dépendances :** cadrage de DEM-01, contrats de contexte et décisions de navigation. **Responsables :** architecture et frontend, avec recette produit.

I.1 : ajouter le descripteur Studio et l’entrée verticale ; trancher la relation entre descripteurs globaux et modules projet. I.2 : ajouter StudioShell et ses routes sous l’authentification Fadi ; prévoir erreurs de chargement et accès refusés. I.3 : adapter le bandeau commun, les liens de retour et la résolution du projet aux routes Studio. I.4 : afficher les quatre domaines, le contexte actif et le point d’entrée des deux planches. I.5 : préserver la barre latérale, le focus et les états de travail lors des transitions.

**Livrables :** intégration routage/navigation, maquette d’interaction validée, tests NAV-001 à NAV-009, matrice de non-régression des anciens accès. **Acceptation :** accès direct autonome et contexte correct, sans chargement préalable du Parcours. Une enveloppe navigable sans édition ni sauvegarde reste une intégration technique, pas le Studio livré.

### 5.2. Lot A — Modèles, planches, associations et transactions · P0

**Références :** REF-02 §2–4, §8, §16 ; EX-003–025, EX-045–049, EX-087–091. **Décisions :** DEC-01/02/03/12/18. **Responsables :** modèle métier, backend et CAO.

A.1 : mettre en place Projet → Étude → Variante → Révision ; isoler les documents 2D, modèles 3D libres, objets associés et préférences. Définir schémas, migrations, identités, provenance et empreintes pertinentes. Rendre durables sauvegarde et réouverture avant d’étendre le catalogue.

A.2 : produire un parcours 2D indépendant complet sur un sous-ensemble contractuel : création, sélection, édition, précision, annotation, calques, annulation, sauvegarde et reprise. Une publication du dessin est nécessaire à la validation finale de TEST-001 ; elle dépend du lot E.

A.3 : produire un parcours 3D indépendant : géométrie libre, édition de faces, transformations, extrusion, navigation et vue plane dérivée. L’accès à ce parcours ne requiert pas de dessin 2D préalable. Les types avancés restent dans l’inventaire de couverture, non annoncés disponibles avant test.

A.4 : introduire les objets architecturaux associés et les trois relations explicites ; conserver objectId, hôtes, contraintes et références topologiques. Modifier le même mur depuis les deux planches. Une ambiguïté de face/cote devient « à résoudre » ; une copie indépendante ne propage pas.

A.5 : faire converger les gestes vers le contrat de commandes et l’historique hybride ; traiter prévisualisation, refus atomique, idempotence, conflits, annulation concurrente et reprise après coupure. Aucun résultat d’une révision dépassée ne remplace l’état courant.

**Livrables :** schémas et contrats versionnés ; API/adaptateurs ; éditeurs utilisables ; journal et corpus de migration. **Acceptation :** TEST-001 à TEST-014, TEST-027, TEST-034/035, selon leurs dépendances documentaires, avec les valeurs 3,180 m³ puis 3,096 m³ du cas mur/ouverture. Les preuves intermédiaires ne clôturent pas un test de bout en bout encore incomplet.

### 5.3. Lot B — Registry, Manager, profils et chargement réel · P0

**Références :** REF-01 §03 ; REF-02 §5–7. **Décisions :** DEC-04/05/06/07/14, et DEC-18 pour les outils réutilisés. **Responsables :** frontend, architecture des outils et persistance des préférences.

B.1 : inventorier et réconcilier les catalogues existants ; fixer toolId, propriétaire, contrat, contextes, permissions, loaders et dépendances. Conserver les alias de migration nécessaires. Requalifier la collision historique « echelle » entre objet d’accès et transformation, sans présumer qu’elle subsiste au commit de réalisation.

B.2 : réaliser recherche, filtres, favoris, regroupements, raccourcis et profils standard/métier/personnel. Séparer visibilité, disponibilité et droit d’exécution. Un changement de profil ne modifie pas la géométrie ni sa révision. Le profil d’équipe reste optionnel tant que son contrat n’est pas retenu.

B.3 : implémenter le cycle d’activation et de désactivation, le chargement en trois temps, la mutualisation des moteurs et un cache différencié. Distinguer téléchargé, initialisé, actif et disponible hors connexion. Protéger les commandes non synchronisées lors d’une mise à jour du service worker.

**Livrables :** manifeste versionné, registre de loaders, Manager, profils persistants, politique de cache et rapport réseau/mémoire. **Acceptation :** TEST-016 à TEST-021 et TEST-036 ; AC-002. Le profil de vingt outils ne force pas les noyaux spécialisés inutiles ; le gain est mesuré à froid et à chaud, sans pourcentage arbitraire annoncé.

### 5.4. Transversal X — Intégrité, sécurité, preuves et suivi · P0

**Références :** REF-02 §17–20 et INV-001 à INV-015. **Responsables :** qualité, sécurité, architecture et responsables métier.

X.1 : créer les corpus autorisés S1 à S7, les oracles numériques et les références visuelles ; instrumenter PERF-01 à PERF-10 avant optimisation. X.2 : construire une couverture positive/négative des invariants, des permissions et des erreurs. X.3 : relier EX/INV/IF/AC aux sous-lots, composants, tests et preuves ; conserver les identifiants existants. X.4 : intégrer les contrôles de frontières et les tests pertinents dans la CI. X.5 : maintenir les dossiers de continuité et les décisions avec le code testé.

**Acceptation :** aucun « vérifié conforme » sans résultat, version et preuve ; une CI verte ne couvre pas les tests absents. Les validations centrales restent actives même lorsque le Registry et les types sont contrôlés au build. Ce transversal accompagne tous les lots, pas seulement la recette finale.

### 5.5. Lot C — Index spatial et projection incrémentale · P1

**Références :** REF-02 §9–10, §18. **Décisions :** DEC-08/09/10/13/17. **Dépendances :** géométrie, effets de commandes, corpus X et versionnement A.

C.1 : mesurer les recherches actuelles ; choisir la structure spatiale adaptée ; filtrer les candidats puis appliquer les règles géométriques de référence. Tester insertions, suppressions, objets superposés, calques et transformations. Une petite scène peut conserver un balayage simple lorsque plus approprié.

C.2 : produire des projections reconstructibles et versionnées, conserver les tables de picking après batching/instances, invalider la portée minimale correcte et prévoir un recalcul plus large lorsqu’il est nécessaire à l’exactitude. Une porte modifiée invalide ses dépendances, pas seulement son maillage.

**Acceptation :** TEST-022 à TEST-025, AC-004/005 ; comparaison de la cible sélectionnée, du point, des dimensions et des exports avant/après. Le choix d’un renderer alternatif relève de DEC-08 ; il n’est pas imposé pour livrer l’autonomie de Studio.

### 5.6. Lot D — Workers, WASM et résilience · P1

**Références :** REF-02 §11 et §18 ; DEC-11/13. **Dépendances :** contrat de job, révisions et commandes A, chargement B, instrumentation X.

D.1 : mettre en place les classes de tâches, priorités, quotas de concurrence, empreintes d’entrée et états de job. D.2 : assurer annulation, temporisation, résultat périmé et reprise d’erreur ; spécifier le redémarrage du worker exact et la résolution des tâches en attente. D.3 : contrôler la propriété des buffers transférés, les ressources GPU/WASM et la mémoire résiduelle lors de sessions longues.

**Acceptation :** TEST-014/015/037, AC-006 ; aucun engagement partiel lors d’un crash et relance sans doublon. Un noyau par outil ou un worker par cœur logique ne constitue pas la stratégie par défaut. La protection minimale d’une opération lourde est requise dès qu’elle est exposée, même si l’ordonnanceur complet est livré ensuite.

### 5.7. Lot E — Quatre domaines utiles et dossier publiable · P1

**Références :** REF-02 §12–16. **Décisions :** DEC-16, contrats d’échanges et de gouvernance applicables. **Responsables :** BIM, documentation, frontend, backend et approbateur produit.

E.1 — BIM et coordination : propriétés, exigences versionnées, écarts calculés, références partenaires acceptées, règles et conclusions distinctes de l’état d’exécution. E.2 — Suivi : observations uniques entre domaines, tâches attribuées, décisions, recontrôle et clôture par rôle autorisé. E.3 — Documents et métrés : vues, feuilles, dossiers, calculs bruts/nets, déductions, ajustements manuels attribués et catalogue Fadi partagé.

E.4 — Approbation/publication : trois dimensions de statut, permissions distinctes, manifeste multi-sources figé et contrôle de l’ensemble effectivement examiné. Une version modifiée après approbation n’est pas publiée sous l’ancienne décision. E.5 — Visualisation : scènes, caméras, apparence et rendus issus du modèle, avec révisions et provenance. Le domaine Visualisation ne disparaît pas du pilote au motif que les fonctions IA sont plus tardives.

E.6 — Interopérabilité : publier une matrice par format, sens, entité/version et limite. Prévoir le natif, les vues/feuilles, les tableaux et le sous-ensemble DXF/IFC retenu pour le pilote ; DWG, BCF, STEP/OBJ/STL et autres capacités suivent leurs propres contrats et preuves. Un report doit être inscrit au périmètre de livraison et non transformé en conformité fictive.

**Acceptation :** fin de TEST-001 ; TEST-009/010/026 à TEST-032/038, TEST-018/035 et AC-007 à AC-010 selon les capacités engagées. Les trois parcours aboutissent à un résultat utile ; au moins une étude associée peut être contrôlée, corrigée, approuvée et publiée. Les illustrations IA contrainte et libre restent distinctes du rendu du modèle et ne mutent jamais automatiquement le BIM.

### 5.8. Lot F — Capacités avancées conditionnelles · P2

**Références :** REF-02 §10, §13, §17, §21.2 et annexe C.6. **Décisions :** DEC-08/15/17 et évaluations de fournisseurs applicables.

F.1 : accélérations et renderer alternatif seulement après gains démontrés. F.2 : immersion, rendus avancés et modes IA si leur contrat, droits, coût, confidentialité et provenance sont validés. F.3 : extensions et adaptateur MCP facultatif, utilisant le même bus de commandes, les mêmes permissions et confirmations ; aucun appel distant à chaque mouvement du pointeur.

**Acceptation :** TEST-025/026/032/033/035 et corpus propre à chaque capacité. Ces options n’empêchent pas une première version explicitement limitée, mais ne sont jamais marquées livrées tant que leurs preuves n’existent pas.

### 5.9. Lot R — Migration, recette et mise en service

**Références :** REF-02 §16.3, §17.2, §19 et §21. **Dépendances :** périmètre A/B/E prêt, exigences C/D nécessaires à la charge cible, sécurité X et décisions G3.

R.1 : figer un build candidat ; comparer données historiques et données migrées en environnement de validation. R.2 : restaurer une sauvegarde complète comprenant géométries, documents, références, droits, historiques et manifestes. R.3 : effectuer la recette utilisateur depuis l’entrée verticale Studio, sur les trois parcours. R.4 : autoriser puis effectuer une bascule progressive sur projets pilotes ; journaliser les versions et la décision. R.5 : vérifier le site déployé avec l’utilisateur, conserver une sauvegarde du nouvel état accepté et surveiller les erreurs et consommations.

La séquence avant/après déploiement est une proposition opérationnelle de ce plan : sauvegarde restaurable avant toute migration, vérification utilisateur après mise en production, puis sauvegarde de l’état accepté. Le retour arrière doit traiter les écritures effectuées après la bascule ; remettre seulement l’ancien bundle n’est pas une récupération des données.

**Acceptation :** TEST-034/035/036, NAV-001 à NAV-009, scénarios du périmètre complet et G4. Déployé n’équivaut pas à accepté ; un document déposé dans `Studio/` n’équivaut pas à un module installé.

## 6. Enchaînement, jalons et périmètre de première version

### 6.1. Ordre recommandé

La préparation G0 → G1 → G2 → G3 précède l’engagement des lots dépendants. Après décision, I et X commencent l’intégration et les preuves ; A.1 établit les données et commandes. B peut avancer en parallèle sur des contrats stables. A.2/A.3 rendent les deux planches utilisables, puis A.4/A.5 démontrent l’association et la concurrence. C et D sont intégrés sur mesures, avant exposition des traitements ou charges qui les exigent. E apporte les autres domaines et le dossier publiable. R vérifie la migration et la livraison G4. F reste conditionné à ses propres arbitrages.

| Jalon proposé | Résultat exigé | Ne suffit pas à prouver |
|---|---|---|
| J0 — Cible et décisions | Périmètre, traçabilité et décisions nécessaires au premier lot. | La faisabilité des moteurs. |
| J1 — Accès autonome | Studio dans la barre, routes et contexte corrects, NAV de base. | Un éditeur utilisable ou une version métier livrée. |
| J2 — Données durables | Étude/variante, commandes, sauvegarde et réouverture. | La bidirectionnalité ou la publication. |
| J3 — Deux planches | Création/modification indépendantes en 2D et 3D ; profils utilisables. | TEST-001 complet tant que la publication manque. |
| J4 — Association fiable | Mur/ouverture, hôtes, copie indépendante, conflits et historique. | Le fonctionnement de tous les outils du catalogue. |
| J5 — Exécution qualifiée | Chargement sélectif, offline préparé, index/rendu et workers selon budgets. | Une performance universelle sur tout appareil. |
| J6 — Dossier métier | BIM, visualisation de base, métrés, observations, revue et publication cohérents. | La couverture de tous les formats et extensions. |
| J7 — Pilote accepté | Migration/restauration et recette des trois parcours sur le build candidat. | L’autorisation automatique de généralisation. |
| J8 — Mise en service | Déploiement autorisé, vérification utilisateur et exploitation documentée. | La livraison des options P2 non retenues. |

Le chemin critique passe par les données/commandes, les deux autonomies, l’association et la publication. Le travail parallèle sur B, les contrats documentaires et les corpus ne doit pas inventer des interfaces incompatibles. Les premières preuves peuvent utiliser les fiches Ligne, Mur et Pousser/Tirer de l’annexe C de REF-02, sans les confondre avec le catalogue complet.

### 6.2. Première version utilisable, à ratifier au G0

Le périmètre proposé est une petite étude de conception terminable, et non une démonstration de boutons. Elle doit comporter l’entrée Studio, les quatre domaines, les trois parcours de référence, la sauvegarde/reprise, les outils usuels choisis, le contrôle d’une exigence, le suivi d’une observation et une publication à manifeste. Le jeu mur/ouverture est un test d’intégrité, pas à lui seul un cas métier suffisant.

Une vingtaine d’outils constitue un profil d’usage de test, pas une liste définitive ni un maximum architectural. Les outils prioritaires seront sélectionnés à partir du travail métier retenu et de leurs contrats : dessin, édition, précision, annotation, objets architecturaux et modélisation. Les outils non inclus restent identifiés comme futurs, expérimentaux ou indisponibles selon décision.

### 6.3. Charges et calendrier

Les deux références ne fixent ni équipe disponible, ni charge de migration, ni volume de projets, ni cadence de recette. Aucune date de livraison fiable ne peut être déduite de ces documents seuls. À G3, chiffrer chaque sous-lot après audit : composants réutilisables, écarts, nouveaux contrats, tests, migration, revue et marge liée aux risques. Distinguer charge de travail et délai calendaire ; une dépendance critique non résolue reste bloquante même si du temps est disponible.

## 7. Validation et critères de livraison

### 7.1. Trois parcours de bout en bout

**Parcours A — 2D indépendante.** Entrer par Studio, sélectionner un projet, créer une étude et un dessin ; tracer, modifier, coter, annoter ; enregistrer, fermer, rouvrir, composer une feuille et publier. Vérifier qu’aucun modèle 3D de substitution n’est nécessaire ou créé implicitement.

**Parcours B — 3D indépendante.** Entrer par Studio, créer une géométrie directement dans l’espace, modifier faces et volume, enregistrer et rouvrir, puis produire une vue ou coupe plane. Une esquisse 2D préalable n’est pas imposée ; la géométrie libre n’acquiert pas automatiquement des propriétés BIM.

**Parcours C — Associée.** Créer un mur et une ouverture, agir sur le même objet depuis 2D puis 3D, vérifier quantités/hôtes/contraintes, annuler et rétablir, provoquer un conflit contrôlé, traiter une observation, faire approuver et publier l’ensemble identifié. La copie indépendante conserve son autonomie et la source n’est pas réécrite.

Pour le cas simplifié du référentiel : mur 6,00 × 3,00 × 0,20 m ; ouverture 1,00 × 2,10 m ; brut 3,600 m³, déduction 0,420 m³, net 3,180 m³. Une ouverture élargie à 1,20 m donne une déduction de 0,504 m³ et un net de 3,096 m³. Ce test exclut les autres déductions/jonctions ; il ne définit pas une règle universelle de métré.

### 7.2. Mesures et non-régression

Reprendre PERF-01 à PERF-10 et les scènes S1–S7 de REF-02 §18 : détail 2D, plan de niveau, plan dense, immeuble multi-niveaux, géométrie libre complexe, étude à variantes/révisions et session hors réseau. Les tailles illustratives 100/10 000/100 000 primitives ne sont pas des engagements de capacité.

Chaque mesure conserve appareil, navigateur, GPU, réseau, état des caches, build, commit, jeu de données, répétitions, distribution et seuil accepté. Mesurer séparément transfert, activation, calcul, rendu CPU/GPU, invalidation et mémoire résiduelle. Les seuils sont décidés dans DEC-13, pas empruntés à une limite arbitraire par outil. Comparer en même temps cibles de snapping/picking, dimensions, quantités, historique et exports.

### 7.3. Conditions éliminatoires

La livraison est bloquée par une double autorité 2D/3D, une corruption de référence, un accès inter-projets non autorisé, une commande appliquée deux fois, un écrasement de conflit, un résultat ancien engagé comme courant ou une publication sous une approbation ne couvrant pas le contenu. Un gain de FPS ou une moyenne favorable ne compense aucun de ces défauts.

Une fonction hors périmètre est déclarée telle quelle. Une non-applicabilité est motivée et validée ; elle ne sert pas à éviter une exigence essentielle du périmètre. Aucun test prescrit n’est réputé réussi du fait de sa seule inscription dans la CI.

## 8. Migration et exploitation sans perte

### 8.1. Inventaire avant bascule

Recenser les projets et objets existants, les formes de dessin, unités, niveaux, associations, cotes, composants, historiques, profils, commandes offline, références externes et publications. Identifier ce qui est compatible, convertible, ambigu ou non convertible. Les quantités et propriétés avant migration deviennent un corpus de comparaison, avec données privées protégées.

Le rapport de simulation de migration doit identifier chaque objet transformé, son ancienne et sa nouvelle identité, sa filiation, les pertes ou ambiguïtés éventuelles et leur traitement. Une erreur partielle n’est pas masquée dans un taux global de réussite. Les objets non convertibles restent conservés et explicitement signalés.

### 8.2. Politique de coexistence proposée

En préproduction, réaliser d’abord la migration sur copie isolée. Pour les projets pilotes, choisir entre continuité des identifiants et mécanisme explicite de correspondance, selon DEC-01/02/03/18. Une publication historique reste liée à ses pièces originales. Les commandes locales en attente doivent être synchronisées, migrées sous contrat ou mises en attente de résolution avant bascule ; jamais supprimées.

Le transfert d’autorité d’écriture d’Atelier vers Studio est une décision par périmètre. Ne pas autoriser deux chaînes d’écriture incompatibles sur la même étude. Conserver l’accès de consultation historique nécessaire. La suppression d’anciens écrans, routes ou stockages est un lot ultérieur explicitement autorisé, pas un effet secondaire du lot I.

### 8.3. Retour arrière et contrôles de production

Conserver le build, les migrations, les versions de schéma et la sauvegarde de référence. Définir les déclencheurs de retour arrière, le responsable et le traitement des nouvelles écritures. Prévoir le refus des anciennes versions clientes incompatibles et la protection des files locales lors du changement de service worker.

Avant ouverture, tester une restauration de données et pièces documentaires ; après déploiement, vérifier les accès, les trois parcours du pilote, les publications, les alertes jobs/workers et la consommation des noyaux. Les objectifs de reprise, conservation et coûts sont à fixer, faute de valeurs imposées dans les sources.

## 9. Pilotage dans GitHub et continuité

### 9.1. Organisation proposée

Le dépôt possède déjà un protocole de continuité (REP-01, `docs/continuity/README.md`). Le plan propose un chantier `studio`, des Issues par unité de travail et des branches courtes conformes aux conventions existantes, puis des PR avec preuves. Aucune branche permanente par module n’est nécessaire.

| Emplacement proposé | Contenu à maintenir |
|---|---|
| `Studio/` | Charte V2.1, référentiel V1.0, présent plan versionné et cartes mentales. |
| `docs/workstreams/studio/CONTEXT.md` | But, sources, DEM-01, périmètre accepté, responsabilités et limites. |
| `docs/workstreams/studio/TASKS.md` | Sous-lots, dépendances, Issues, PR, états et critères. |
| `docs/workstreams/studio/STATUS.md` | Faits datés, commit, vérifications réalisées, risques et blocages. |
| `docs/workstreams/studio/HANDOFF.md` | Dernier état vérifié, décisions, prochaine action autorisée et reprise. |
| Registre de traçabilité du chantier | Liens EX/INV/IF/AC ↔ composants ↔ TEST/NAV ↔ preuves ↔ DEC/ADR. |

Les noms des fichiers de matrice/ADR suivent le protocole adopté et ne dupliquent pas les registres existants. Les rapports lourds peuvent être conservés en artefacts identifiés ; le dépôt conserve références stables, empreintes et verdicts. Aucun secret, géométrie privée de client ou URL sensible ne doit être inscrit dans le suivi public.

### 9.2. Contenu minimal d’une tâche ou PR

Décrire le besoin, les sources et identifiants d’exigences, le périmètre inclus/exclu, le composant concerné, les contrats et décisions nécessaires, les migrations, les scénarios positifs/négatifs, les preuves attendues et le retour arrière. La PR indique précisément ce qui a été codé, testé, déployé et accepté. Une capture de bouton ne démontre pas le comportement métier.

Utiliser les états du protocole de continuité : À définir, À faire, En cours, Implémenté, Vérifié, Bloqué, Accepté. Conserver à côté le verdict de conformité des exigences et l’état d’exécution des tests ; ces dimensions ne se remplacent pas. Revalider HEAD, CI et faits après chaque reprise de session.

### 9.3. Responsabilités

Le responsable produit valide le périmètre métier, la navigation et la recette. Le responsable architecture instruit les DEC et les frontières. Les responsables CAO, backend, frontend et BIM/documentation produisent les sous-ensembles correspondants. Qualité/sécurité assurent tests adverses, corpus et preuves ; exploitation prépare migration, sauvegarde et retour arrière. Les noms des personnes, leur disponibilité et les règles de cumul restent à affecter.

## 10. Décisions et risques à traiter avant engagement

Les DEC-01 à DEC-18 de REF-02 restent inchangées ; leur affectation aux lots figure en annexe B. Pour l’entrée verticale, ouvrir une décision d’intégration distincte, par exemple ADR-STUDIO-NAV-01. Elle décrit les routes, le contexte, les droits, le comportement mobile/plein écran, la coexistence Atelier et les tests NAV. Ce nouvel identifiant du plan ne remplace aucune DEC existante.

| Risque prioritaire | Mesure dans le plan |
|---|---|
| Studio réduit à un raccourci vers l’Atelier | Lot I, routes propres, absence de prérequis Parcours et NAV-002. |
| Barre latérale supprimée par un ancien mode immersif | Ne pas réutiliser cet effet automatiquement ; NAV-008 et recette mobile. |
| Mauvais projet dans le bandeau ou la commande | Résolution de contexte partagée ; URL et appartenance vérifiées côté serveur. |
| Données ou historique dupliqués entre Atelier et Studio | A.1/A.5 et transfert explicite d’autorité lors de R. |
| Tous les moteurs téléchargés malgré une barre réduite | B.3, vérification imports/bundles/précache et TEST-016. |
| Snapping ou picking altéré par optimisation | Corpus X et TEST-022/023, comparaison avec oracle. |
| Worker en échec ou résultat périmé | Lot D, TEST-014/015/037, pas d’engagement anticipé. |
| Dossier publié différent du contenu approuvé | E.4, manifeste immuable, TEST-030/038. |
| Format promis au-delà de la couverture | E.6, matrice par sens/version/entité et rapport de pertes. |
| Perte lors de migration ou changement de cache | R, simulation, TEST-034/036, restauration et gestion des files. |

La priorité d’un risque est confirmée au cadrage du pilote. Les risques RISK-01 à RISK-10 du référentiel restent le registre source ; le tableau ci-dessus les traduit pour l’intégration et y ajoute les risques de navigation.

## 11. Première séquence de travail à engager

Le premier engagement recommandé est le cadrage et la spécification de l’intégration, pas une refonte générale des moteurs. Fixer DEM-01, relever les sources exactes et créer la traçabilité ; instruire ADR-STUDIO-NAV-01 ; définir le modèle d’étude et les trois parcours ; requalifier les composants candidats ; préparer les preuves des risques critiques ; obtenir G3 pour le premier sous-ensemble.

Ensuite, livrer I avec X et A.1, puis A.2/A.3 et B sur des contrats stabilisés. Démontrer A.4/A.5 avant de déclarer la conception associée. Achever E et les critères de bout en bout avant de présenter le pilote comme version métier utilisable. Réaliser R avant toute généralisation ; étendre par F sur preuves.

**Critère final : Studio est un espace de conception autonome, réellement utilisé depuis la barre verticale, et non un bouton supplémentaire posé sur une architecture inchangée. Son autonomie s’accompagne de données durables, d’outils activés selon le besoin et d’un dossier de conception traçable, approuvé et publiable.**


## Annexe A. Affectation des 38 scénarios du référentiel

Les intitulés et attendus sont repris de REF-02 §19.2. L’affectation aux lots est proposée ici. **Tous les résultats restent à produire** ; la présence dans cette matrice n’est ni une exécution ni une acceptation. Les neuf contrôles NAV du §2.4 s’ajoutent à cette liste. Une option F non engagée est exclue explicitement du périmètre, sans être déclarée conforme.

| Test | Situation et attendu du référentiel | Lot proposé |
|---|---|---|
| TEST-001 | **Nouvelle étude, Planche 2D seule.** Dessiner, coter, enregistrer, fermer, rouvrir et publier sans modèle 3D. | A + E |
| TEST-002 | **Nouvelle étude, Planche 3D seule.** Construire volume, éditer faces, sauvegarder et dériver une vue plane. | A |
| TEST-003 | **Modifier un mur associé depuis 2D puis 3D.** Même objectId, paramètres et hôtes cohérents dans les deux planches. | A |
| TEST-004 | **Copie indépendante d’un profil et d’un objet.** Nouvelles identités ; aucune propagation vers la source d’origine. | A |
| TEST-005 | **Extruder un profil 2D.** Demande explicite de hauteur/direction et relation de suivi. | A |
| TEST-006 | **Modifier profil source lié.** Volume dépendant recalculé ou invalidé sans réponse ancienne. | A |
| TEST-007 | **Diviser une face cotée en deux.** Rattachement prouvé ou statut « à résoudre » ; aucune approximation silencieuse. | A |
| TEST-008 | **Porte déplacée hors du mur hôte.** Refus atomique ou résolution explicite, sans géométrie partielle. | A |
| TEST-009 | **Mur 6 × 3 × 0,2 et ouverture 1 × 2,1.** 3,600 m³ brut, 0,420 m³ déduit, 3,180 m³ net. | A + E |
| TEST-010 | **Agrandir l’ouverture à 1,2 m depuis l’autre planche.** Nouveau volume net 3,096 m³ ; révision historique inchangée. | A + E |
| TEST-011 | **Annuler/rétablir l’opération associée.** Références stables, métrés/affichage corrects, aucune perte de publication. | A |
| TEST-012 | **Modifier simultanément même mur sur deux sessions.** Conflit revalidé, pas d’écrasement last-write-wins. | A + X |
| TEST-013 | **Répéter une commande après coupure.** Même résultat, aucune deuxième application du requestId. | A + R |
| TEST-014 | **Tâche exacte renvoie une ancienne révision.** Résultat périmé marqué et non engagé dans le modèle courant. | A + D |
| TEST-015 | **Échec/coupure du worker OCCT.** Pas de corruption, erreur, relance contrôlée et attente résolue. | D |
| TEST-016 | **Ouvrir Studio avec profil de 20 outils.** Pas d’initialisation obligatoire des moteurs rares ; mesure de ressources. | B |
| TEST-017 | **Chercher un outil hors de la barre.** Trouvable dans catalogue, état permission/contexte fidèle. | B |
| TEST-018 | **Importer un profil contenant « Publier » sans droit.** Barre éventuellement visible ; appel refusé par serveur. | B + E + X |
| TEST-019 | **Changer standard → métier → personnel.** Aucune modification de géométrie, révision ni droits. | B |
| TEST-020 | **Offline avec profil préparé.** Outils présents utilisables ; non présents indiqués indisponibles. | B |
| TEST-021 | **Préparer une commande offline puis reconnecter.** Validation et conflits serveur, pas de publication anticipée. | A + B |
| TEST-022 | **Snapping de scènes S1, S2, S3 accéléré.** Même point/cible/priorité dans la tolérance que l’algorithme référence. | C |
| TEST-023 | **Picking 3D après batching/invalidation.** Identifiant correct pour chaque triangle/instance, même après suppression. | C |
| TEST-024 | **Déplacer une porte en vue 3D.** Seuls lots/projections nécessaires recalculés si optimisation retenue. | C |
| TEST-025 | **Comparer SVG / Canvas / GPU sur scènes S1–S3.** Rapports fidélité, accessibilité et latence ; moteur choisi sur preuve. | C / F |
| TEST-026 | **Changer matériau apparent d’un mur.** Aucun changement de composition technique ou de volume net. | E / F |
| TEST-027 | **Modifier surface dessinée vs surface programmée.** Exigence identique ; écart calculé et visible. | A + E |
| TEST-028 | **Import IFC/DXF contenant entité inconnue.** Rapport de pertes et état non natif explicite. | E |
| TEST-029 | **Observation issue d’un contrôle, correction/recontrôle.** Même identité de suivi, responsable, contexte et décision de clôture. | E |
| TEST-030 | **Approbation puis modification d’un document.** Publication sous l’ancien manifeste refusée ou soumise à nouveau contrôle. | E |
| TEST-031 | **Retirer une publication historique.** Action journalisée, contenu historique récupérable selon politique. | E |
| TEST-032 | **Illustration IA depuis une vue.** Aucune mutation du modèle, provenance et permissions conservées. | E / F |
| TEST-033 | **Appel MCP simulé sur commande protégée.** Même schéma, droits, confirmation et idempotence que l’interface humaine. | F |
| TEST-034 | **Restaurer une sauvegarde après incident.** Révisions, identités, associations, publications et manifestes retrouvés. | R |
| TEST-035 | **Objets d’un autre projet via URL/job/export.** Accès refusé côté serveur, sans fuite de données. | A + E + X |
| TEST-036 | **Actualiser service worker avec commandes locales pendantes.** Contrats compatibles ou migration, aucune file perdue. | B + R |
| TEST-037 | **Fermer/réouvrir 50 fois outil exact (jeu d’essai).** Courbe mémoire analysée ; absence de fuite démontrée selon seuil retenu. | D |
| TEST-038 | **Publier dossier composé de plusieurs modèles/révisions.** Manifeste coordonné, empreintes et approbation portant sur cet ensemble. | E |

## Annexe B. Décisions ouvertes et lots dépendants

Questions et preuves : REF-02, annexe B. Les lots et responsables ci-dessous sont proposés par le plan. Les 18 décisions restent à instruire ou à documenter sur preuves ; aucune clôture n’est présumée. Les choix bloquants doivent être résolus au G3 du lot concerné, non nécessairement tous au démarrage de Studio.

| Décision | Question et preuve à réunir | Lots / responsable proposé |
|---|---|---|
| DEC-01 | **Modèle physique du dessin 2D autonome et son stockage.** Preuve : Schéma, création sans 3D, sauvegarde/reprise, migration. | A · Modèle/backend |
| DEC-02 | **Sémantique des associations et références topologiques 2D/3D.** Preuve : Identités, propagation, ambiguïtés, conflits et tests. | A · CAO/modèle |
| DEC-03 | **Définition Étude / Variante / Révision et migration des projets.** Preuve : Entités, isolation, historique, restauration. | A + R · Architecture/backend |
| DEC-04 | **Profils standard, métier, personnels et partage d’équipe.** Preuve : UX, permissions, export/import, synchronisation. | B · Produit/UX |
| DEC-05 | **Support et gouvernance des manifests Registry.** Preuve : Validation au build, offline, compatibilité et confiance. | B · Architecture/sécurité |
| DEC-06 | **API et limites du Tool Manager.** Preuve : Séquence activation/désactivation, événements, tests. | B · Frontend |
| DEC-07 | **Granularité des chunks, préchargement et cache.** Preuve : Bundle analysis, première action, réseau et mémoire. | B · Frontend/performance |
| DEC-08 | **Renderer 2D cible et seuil d’optimisation/bascule.** Preuve : Fidélité SVG/Canvas/GPU, GPU réel et accessibilité. | A/C/F · CAO/rendu |
| DEC-09 | **Structure de l’index spatial et algorithme de snapping.** Preuve : Résultats exacts, densités, insertion/suppression et p95. | C · Géométrie |
| DEC-10 | **Invalidation partielle de la scène 3D.** Preuve : Tables de picking, cas hôtes/dépendances, benchmarks. | C · Rendu |
| DEC-11 | **Gestion des workers, mémoire et OCCT.** Preuve : Crash, temps, instances, quotas, reprise. | D · Calcul/exploitation |
| DEC-12 | **Historique et undo/redo entre sous-modèles.** Preuve : Deltas, commandes, révisions et conflits réels. | A · Modèle/backend |
| DEC-13 | **Appareils, profils de charge et budgets de performance.** Preuve : Jeux S1–S7 et limites d’acceptation validées. | X · Qualité/produit |
| DEC-14 | **Profil et stratégie des outils utilisables hors ligne.** Preuve : Disponibilité, quota/cache, contrat versionné, reconnection. | B + R · Frontend/backend |
| DEC-15 | **Extensions et adaptateur MCP, si retenus.** Preuve : Risques, consentement, droits, schémas et confirmations. | F · Sécurité/architecture |
| DEC-16 | **Manifeste de publication multi-sources.** Preuve : Empreintes, versions coordonnées, statut des approbations. | E · Documentation/backend |
| DEC-17 | **Qualité adaptative et concessions graphiques admises.** Preuve : Comparaison visuelle et non-régression géométrique. | C/F · Rendu/produit |
| DEC-18 | **Réutilisation effective des moteurs et services Fadi.** Preuve : Audit sur commit de livraison, tests, coûts, licences. | A–F + R · Architecture |

## Annexe C. Couverture documentaire du plan

Cette affectation couvre les 104 identifiants EX de REF-02 sans en modifier le texte. Elle prépare la traçabilité ; les tests positifs/négatifs, composants précis, preuves et décisions de chaque exigence restent à compléter. Les 15 INV, 11 IF et 11 AC doivent également être liés aux tests, et non réputés couverts par simple voisinage de chapitre.

| Exigences de REF-02 | Objet | Lots d’affectation |
|---|---|---|
| EX-001 à EX-007 | Autonomie, contexte, domaines et planches | I + A + E |
| EX-008 à EX-011 | Dépendances, propriété et effets | A + C + X |
| EX-012 à EX-019 | Révisions, provenance, transactions et schémas | A + R |
| EX-020 à EX-025 | Planches, associations et précision | A + C |
| EX-026 à EX-031 | Registry et gouvernance des capacités | B + X ; F pour extensions |
| EX-032 à EX-037 | Manager, profils et ergonomie | B + I |
| EX-038 à EX-044 | Chargement, cache et hors connexion | B + R |
| EX-045 à EX-049 | Preview, journal, historique et reprise | A + D + R |
| EX-050 à EX-054 | Scène, invalidation et index | C |
| EX-055 à EX-058 | Fidélité de rendu et qualité | A + C ; F selon décision |
| EX-059 à EX-063 | Workers, tâches, mémoire et transfert | D |
| EX-064 à EX-070 | BIM, exigences, coordination et clôture | E |
| EX-071 à EX-073 | Visualisation et provenance des médias | E ; F pour capacités avancées |
| EX-074 à EX-082 | Documents, métrés, formats et publication | E |
| EX-083 à EX-086 | Workflow, permissions et observations | E + X |
| EX-087 à EX-091 | API, isolation, persistance et migration | A + R + X |
| EX-092 à EX-096 | Sécurité, confidentialité, observabilité et licences | X sur tous les lots |
| EX-097 à EX-101 | Performance, tests et preuves | X sur tous les lots |
| EX-102 à EX-104 | Traçabilité et auditabilité | X + pilotage |

### Correspondance des chapitres

| Référentiel technique V1.0 | Partie du plan |
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

## Annexe D. Sources et contrôle de provenance

### Documents directeurs lus

REF-01 : `Fadi_Studio_Definition_Officielle_Reference_V2_1.docx`. Git blob : `e1d61ca38809e1faac6111c5ffb0881619b9a6dc`. Texte complet lu, huit sections ; référence de portée et de principes.

REF-02 : `Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`. Git blob : `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`. Texte et tableaux extraits du Word ; 22 chapitres numérotés 0 à 21, quatre annexes. Les identifiants repris ont été contrôlés contre le document.

Ces empreintes correspondent aux fichiers du dossier `Studio/` au commit REP-01. La présence des fichiers dans le dépôt ne constitue pas une validation technique du produit.

### Lecture ciblée du dépôt

REP-01 : `RachEma-ux/Fadi`, branche `main`, commit `5cf61d1fed9ed523b331228af20bce93a4f2bf63`, relevé le 18 octobre 2026. Les fichiers ci-dessous ont été lus pour les constats du §2 et l’organisation de suivi du §9. Les références portent sur cette révision, pas sur un HEAD futur.

**apps/web/src/App.tsx**

https://github.com/RachEma-ux/Fadi/blob/5cf61d1fed9ed523b331228af20bce93a4f2bf63/apps/web/src/App.tsx

**apps/web/src/routes/AppShell.tsx**

https://github.com/RachEma-ux/Fadi/blob/5cf61d1fed9ed523b331228af20bce93a4f2bf63/apps/web/src/routes/AppShell.tsx

**apps/web/src/routes/ProjectShell.tsx**

https://github.com/RachEma-ux/Fadi/blob/5cf61d1fed9ed523b331228af20bce93a4f2bf63/apps/web/src/routes/ProjectShell.tsx

**apps/web/src/modules/module-registry.ts**

https://github.com/RachEma-ux/Fadi/blob/5cf61d1fed9ed523b331228af20bce93a4f2bf63/apps/web/src/modules/module-registry.ts

**apps/web/src/lib/use-immersive.ts**

https://github.com/RachEma-ux/Fadi/blob/5cf61d1fed9ed523b331228af20bce93a4f2bf63/apps/web/src/lib/use-immersive.ts

**scripts/check-module-deps.mjs**

https://github.com/RachEma-ux/Fadi/blob/5cf61d1fed9ed523b331228af20bce93a4f2bf63/scripts/check-module-deps.mjs

**docs/continuity/README.md**

https://github.com/RachEma-ux/Fadi/blob/5cf61d1fed9ed523b331228af20bce93a4f2bf63/docs/continuity/README.md

### Limites de la préparation

Le présent travail est une lecture des deux sources et une planification, complétée par les points d’intégration ci-dessus. Il ne comporte ni nouvelle exécution des 38 tests, ni audit exhaustif des paquets, ni mesure du serveur de production. Les constats historiques de REF-02 restent historiques. Les routes, sous-lots et critères NAV sont des propositions d’exécution du plan, à valider dans leur périmètre.

**Aucune modification du dépôt, aucun lancement de migration et aucun déploiement n’ont été effectués pour produire ce plan.**
