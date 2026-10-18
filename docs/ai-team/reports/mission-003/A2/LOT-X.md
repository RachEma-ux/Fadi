# Dossier de préparation — lot X

Mission(s) du programme #156 : M15. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-092–104 ; INV-001–015 ; IF-001–011 ; AC-001–011**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Tests géométrie/API/E2E et scripts existent ; pas preuve Studio, corpus S1–S7 et budgets non ratifiés.

**Contrat candidat à ratifier :** C-EVIDENCE : requirementIds, commit/build, contractVersion, corpusHash/licence, device/browser/GPU/cache, command, timestamp, executor, verdict, artifactHash/link. États exécution, conformité, acceptation séparés. Oracle reconstruction complète et géométrie de référence ; aucune moyenne ne masque cas éliminatoire.

**Décisions :** DEC-13 et décisions propres au risque. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** G0 pour périmètre ; préparation dès maintenant, preuves au fil des lots. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A5 qualité, A6 instrumentation, A2 oracle ; A1 budgets. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-001–038 et NAV-001–009. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Données sensibles et faux succès : corpus synthétique/licencié ; aucune DB inconnue ni télémétrie géométrie privée. Rollback instrumentation désactivable sans changer modèle, preuves conservées.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-092 — source word/document.xml w:p 906 :**

> EX-092 — Protection par défaut. Chaque mutation et lecture sensible passe par identification de session, autorisation dans le contexte et validation des entrées. La sécurité client sert à guider l’UX, jamais à remplacer le serveur.

**EX-093 — source word/document.xml w:p 907 :**

> EX-093 — Intégrité des modèles. Les commandes et opérations de géométrie vérifient contraintes, types, unités et appartenance. Le serveur refuse les mutations qui violeraient les invariants, même si l’outil client les présente comme valides.

**EX-094 — source word/document.xml w:p 908 :**

> EX-094 — Confidentialité des sources. Les rendus, fichiers importés, modèles de références et images adressés à un service externe ne le sont qu’au terme d’un contrôle de politique, avec conservation de la provenance et signalement des informations inconnues.

**EX-095 — source word/document.xml w:p 911 :**

> EX-095 — Observabilité. Des mesures agrégées de latence, de mémoire, d’erreurs et de tâches doivent permettre de détecter une dégradation de service sans enregistrer inutilement les géométries confidentielles ou des secrets d’accès. Les traces sont corrélées par identifiants non sensibles de commande/job.

**EX-096 — source word/document.xml w:p 912 :**

> EX-096 — Licence et provenance. L’utilisation de WASM ou moteurs tiers s’accompagne de l’inventaire des versions, licences et obligations de redistribution/remplacement applicables, vérifiées pour l’artefact effectivement distribué.

**EX-097 — source word/document.xml w:p 965 :**

> EX-097 — Mesure reproductible. Fixer matériel, navigateur/version, mémoire, GPU/driver, taille d’écran, statut des caches, réseau, build, commit, répétitions, opérations, outliers et méthode statistique ; conserver traces et scripts. Les mesures JavaScript renderer.render() ne sont pas assimilées automatiquement au coût GPU, et SwiftShader ne remplace pas un GPU physique.

**EX-098 — source word/document.xml w:p 966 :**

> EX-098 — Double vérification. Tout gain de performance est accompagné d’une comparaison géométrique et fonctionnelle : mêmes cibles de snapping, même sélection, mêmes dimensions/quantités, mêmes objets exportés dans les tolérances, même comportement d’annulation et de conflits.

**EX-099 — source word/document.xml w:p 967 :**

> EX-099 — Adaptativité conditionnée. La dégradation graphique répond aux mesures et aux préférences ; aucune réduction d’effet ne peut affecter les invariants de conception. Le résultat demeure publiable sur données de référence, indépendamment de la qualité instantanée de la prévisualisation.

**EX-100 — source word/document.xml w:p 998 :**

> EX-100 — Critère de preuve. Une preuve est rattachée à build, commit, version du contrat, jeu de données/empreinte, environnement, auteur/exécutant, horodatage, verdict, logs utiles et référence stable. « La CI est verte » ne prouve pas qu’un scénario non présent dans la CI a été testé.

**EX-101 — source word/document.xml w:p 999 :**

> EX-101 — Gestion des régressions. Un correctif modifiant la géométrie, les projections, les workers ou le Registry déclenche les tests pertinents d’exactitude, d’historique, de permissions, de persistance et de compatibilité des profils.

**EX-102 — source word/document.xml w:p 1125 :**

> EX-102 — Lien bidirectionnel. Toute exigence de niveau 2 dispose au minimum d’un identifiant, d’une source de niveau 1, d’un propriétaire métier, d’un contrat, d’un composant candidat, de tests, de preuves, d’un état et d’une décision si un arbitrage est requis. Les composants existants sont des candidats jusqu’à leur audit. Un test identifie l’exigence qu’il vérifie ; un composant identifie les exigences qu’il satisfait.

**EX-103 — source word/document.xml w:p 1248 :**

> EX-103 — Couverture des preuves. Aucune exigence critique n’est marquée conforme si l’un des champs test, résultat, build, preuve ou décision applicable est absent. Les exceptions sont documentées comme non applicables avec justification vérifiable.

**EX-104 — source word/document.xml w:p 1251 :**

> EX-104 — Auditabilité. La matrice doit permettre de remonter d’un défaut observé au test, au composant, à l’exigence et au principe produit ; inversement, elle doit montrer pour chaque principe les composants candidats et preuves correspondants.

**INV-001 — source word/document.xml w:p 207, 208 :**

> Une approbation référence exactement les éléments présentés à la décision.

**INV-002 — source word/document.xml w:p 209, 210 :**

> Une définition architecturale associée possède une autorité unique.

**INV-003 — source word/document.xml w:p 211, 212 :**

> Une copie indépendante ne propage pas vers son origine.

**INV-004 — source word/document.xml w:p 213, 214 :**

> Une exigence approuvée reste distincte du résultat de conception.

**INV-005 — source word/document.xml w:p 215, 216 :**

> Une opération rejetée ne modifie pas partiellement les données canoniques.

**INV-006 — source word/document.xml w:p 217, 218 :**

> Un résultat dérivé ancien est identifiable et n’écrase pas le résultat courant.

**INV-007 — source word/document.xml w:p 219, 220 :**

> Une optimisation préserve les résultats métier dans les tolérances déclarées.

**INV-008 — source word/document.xml w:p 221, 222 :**

> Un cache/index/projection est reconstruisible depuis la donnée de référence.

**INV-009 — source word/document.xml w:p 223, 224 :**

> Un profil personnalisé ne change ni données, ni droits, ni révision de conception.

**INV-010 — source word/document.xml w:p 225, 226 :**

> Une requête IA ou extension passe par les mêmes validations centrales qu’une action humaine.

**INV-011 — source word/document.xml w:p 227, 228 :**

> Les annulations concurrentes ne détruisent pas silencieusement le travail d’un autre acteur.

**INV-012 — source word/document.xml w:p 229, 230 :**

> Une publication antérieure n’est pas réécrite par la création d’une nouvelle publication.

**INV-013 — source word/document.xml w:p 231, 232 :**

> Une annotation référencée à une face modifiée est conservée avec correspondance vérifiée ou marquée « à résoudre ».

**INV-014 — source word/document.xml w:p 233, 234 :**

> Le mode hors connexion différencie travail local, confirmation serveur et droits à reverifier.

**INV-015 — source word/document.xml w:p 235, 236 :**

> Un outil masqué reste retrouvable s’il est autorisé, et n’est pas désinstallé implicitement.

**IF-001 — source word/document.xml w:p 141 :**

> IF-001 — Interface de rattachement projet. Entrée : projet autorisé, site/sources/version, acteur ; sortie : contexte d’étude validé et identifiant stable. Échec : projet inaccessible, source non disponible, conflit de version, droits insuffisants. Le contrat physique demeure à choisir.

**IF-002 — source word/document.xml w:p 199 :**

> IF-002 — Geste rapide (exemple Ligne). ① réception pointeur/clavier ; ② lecture de la projection/index correspondant à la révision active ; ③ calcul de snapping ; ④ affichage d’aperçu transitoire ; ⑤ confirmation ; ⑥ intention géométrique validée ; ⑦ commande idempotente ; ⑧ réponse acceptation/conflit/refus ; ⑨ invalidation limitée des données dérivées.

**IF-003 — source word/document.xml w:p 200 :**

> IF-003 — Calcul lourd (exemple booléen). ① collecte des paramètres ; ② capture immuable de l’identifiant de révision ; ③ soumission au gestionnaire de tâches ; ④ worker/WASM ou service serveur ; ⑤ retour résultat + révision source + métriques ; ⑥ vérification du contexte et des droits ; ⑦ engagement transactionnel explicite ; ⑧ mise à jour des projections. Un résultat ancien peut être conservé à titre historique, pas appliqué à une révision plus récente.

**IF-004 — source word/document.xml w:p 330 :**

> IF-004 — Précondition de version. Toute intention qui modifie un objet en environnement collaboratif référence baseRevisionId et, lorsque nécessaire, les versions individuelles des objets et relations touchés. En cas de divergence incompatible : refus et proposition de résolution ou nouveau calcul sur la base courante.

**IF-005 — source word/document.xml w:p 469 :**

> IF-005 — Cycle d’activation. découvert → vérification de contexte/droits → résolution des dépendances → chargement du code → initialisation → prêt → actif → suspendu/désactivé ; erreurs incompatible, permission refusée, hors ligne, échec de chargement, échec du noyau. La transition ne doit pas perdre un geste inachevé sans retour visible.

**IF-006 — source word/document.xml w:p 529 :**

> IF-006 — Commande métier. Le contrat de transport doit exprimer les attributs logiques suivants ; l’objet est une proposition de schéma et non une API actuellement exposée.

Complément exact : {'paragraph': 530, 'texte_exact': '{  "requestId": "idempotency-uuid",  "toolId": "studio.arch.wall",  "contractVersion": "1.0.0",  "actorId": "actor-ref",  "scope": {    "projectId": "p", "studyId": "s", "variantId": "v",    "baseRevisionId": "R12"  },  "targetIds": ["wall-42"],  "operation": "architecture.updateWall",  "parameters": {"height": 3.0, "unit": "m"},  "mode": "commit"}'}

Complément exact : {'paragraph': 531, 'texte_exact': 'Le serveur établit lui-même l’identité authentifiée et vérifie sa concordance avec l’enveloppe ; un actorId fourni par le navigateur ne crée aucun droit. Les identifiants de contexte doivent être autorisés et la version de base vérifiée. Les coordonnées, tolérances et unités appartiennent au contrat de chaque opération.'}

**IF-007 — source word/document.xml w:p 664 :**

> IF-007 — Statuts des jobs. queued → loading → running → completed, avec branches cancel_requested, cancelled, failed, superseded, timed_out. Une demande d’annulation n’équivaut pas immédiatement à un arrêt matériel ; le résultat d’une tâche finalement terminée après annulation ne peut être engagé sans nouvelle vérification.

**IF-008 — source word/document.xml w:p 731 :**

> IF-008 — Résultat quantitatif. quantityId + sourceRevisionSet + ruleId + ruleVersion + sourceObjectIds + unit + rawValue + deductions + displayValue + freshnessStatus ; manualAdjustment est facultatif, distinct, motivé et attribué. La décision de structure physique reste ouverte.

**IF-009 — source word/document.xml w:p 765 :**

> IF-009 — Publication. Le manifeste contient : identifiant, intention/usage, date, auteur, état d’approbation, liste ordonnée de documentId + version + empreinte, références de modèles et de règles, rapports de contrôle et observations bloquantes résolues ou dérogées, ainsi que la décision d’approbation sur cet ensemble exact.

**IF-010 — source word/document.xml w:p 819 :**

> IF-010 — Observation. Champs : issueId, catégorie, source du contrôle, révisions examinées, objets/vues, auteur, gravité selon règles décidées, description et pièces justificatives, responsable éventuel, état, journal de décisions, références des recontrôles et condition de clôture. Les identifiants BCF éventuels sont conservés comme références, non assimilés automatiquement aux identifiants internes.

**IF-011 — source word/document.xml w:p 868 :**

> IF-011 — Journal de changement. Événement avec eventId, transaction, auteur, étude/variante, révision base/issue, effets, horodatage serveur et relation éventuelle à un job. La diffusion de notifications ne constitue pas une confirmation métier sans engagement préalable.

**AC-001 — source word/document.xml w:p 419 :**

> AC-001. Le objectId du mur reste stable ; l’ouverture reste reliée au bon hôte ; les deux planches reflètent la même définition ; les métrés sont mis à jour ou marqués périmés ; undo/redo et réouverture retrouvent les valeurs ; un dossier publié conserve la version examinée.

**AC-002 — source word/document.xml w:p 526 :**

> AC-002. Une barre contenant environ vingt outils de dessin usuels peut être ouverte sans initialiser tous les modules spécialisés. Le test compare les requêtes réseau, la taille transférée, les chunks exécutés et l’empreinte mémoire à une référence, en distinguant cache froid et chaud. Aucun taux de réduction n’est présumé avant mesure.

**AC-003 — source word/document.xml w:p 560 :**

> AC-003. Deux utilisateurs modifiant un mur de manière incompatible obtiennent un conflit traçable, une révision de référence préservée et aucune application implicite du dernier enregistrement. La restauration fonctionne après coupure simulée sans duplication de la commande.

**AC-004 — source word/document.xml w:p 613 :**

> AC-004. Sur un corpus comportant objets superposés, densités variables, intersections et références liées, l’index accéléré doit fournir les mêmes cibles et points d’accrochage (dans la tolérance déclarée) que l’algorithme de référence, avec traces des cas ambigus.

**AC-005 — source word/document.xml w:p 633 :**

> AC-005. Les opérations sélection, orbite, zoom, poussé/tiré et changement de matériau passent les tests de fidélité géométrique avant et après toute optimisation. Les profils GPU sont évalués séparément de mesures faites sous SwiftShader.

**AC-006 — source word/document.xml w:p 670 :**

> AC-006. Échec forcé d’OCCT/WASM pendant une opération : aucune mutation partielle, retour d’erreur intelligible, tâches en attente résolues explicitement, possibilité de relance sans doublons et sans perte de la révision courante.

**AC-007 — source word/document.xml w:p 722 :**

> AC-007. Générer une illustration ne change ni les dimensions, ni les propriétés BIM, ni la révision du modèle source. La publication d’une illustration indique son statut de vérification et sa source.

**AC-008 — source word/document.xml w:p 732 :**

> AC-008. Dans le test de référence du mur, les objets et révisions permettent de retrouver exactement les déductions 0,420 m³ puis 0,504 m³ et les volumes nets 3,180 m³ puis 3,096 m³. Les résultats historiques conservent leur source initiale.

**AC-009 — source word/document.xml w:p 768 :**

> AC-009. Modifier un document après approbation puis tenter de publier sous l’ancienne décision provoque un blocage ou une demande de nouvel examen, avec comparaison explicite des empreintes concernées.

**AC-010 — source word/document.xml w:p 817 :**

> AC-010. Un concepteur sans droit d’approbation peut afficher l’outil par recherche mais reçoit un refus d’exécution. La modification de son profil personnel n’influe pas sur le contrôle serveur.

**AC-011 — source word/document.xml w:p 1122 :**

> AC-011. Un outil est déclaré prêt pour implémentation seulement lorsque ses entrées, sorties, préconditions, permissions, effets, risques, mesures et jeux d’essai sont explicités. Un outil est déclaré conforme seulement après preuve d’exécution sur version et profil de charge désignés.
