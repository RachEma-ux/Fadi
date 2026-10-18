# Dossier de préparation — lot I

Mission(s) du programme #156 : M13/M16. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-001–007, EX-036–039, EX-087–088 ; IF-001 ; INV-014–015**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** AppShell/routes/auth existent ; aucune route Studio. Manquent shell autonome, entrée verticale, restauration contexte et quatre domaines.

**Contrat candidat à ratifier :** C-STUDIO-CONTEXT : projectId, studyId, variantId, baseRevisionId ; domaine et planche validés. URL candidat A4 /studio/projets/:projectId/etudes/:studyId/variantes/:variantId, domaine query ; planche=2d|3d seulement dessin. /revisions/:revisionId consultation immuable. Serveur vérifie relation hiérarchique et droits, erreurs 401/403/404 sans fuite. Départ sans projet => choix explicite, aucun objet fictif.

**Décisions :** NAV, DEC-03/04/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** G0, contexte M17 stable, maquette A4. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A4 frontend, A2 architecture ; A1 valide métier. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** NAV-001–009. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Mauvais projet, perte du geste, navigation cachée : garder barre verticale, retour contextuel et garde des opérations pending. Rollback UI vers anciens accès conservés, aucune suppression modèle.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-001 — source word/document.xml w:p 81 :**

> EX-001 — Autonomie native. Le Studio permet de créer, ouvrir, modifier, contrôler et documenter une étude rattachée à un projet Fadi sans suivre préalablement les 21 étapes du Parcours. Il réutilise les services généraux autorisés de Fadi plutôt que de créer une deuxième gestion d’utilisateurs, une deuxième base métier ou un deuxième annuaire de documents.

**EX-002 — source word/document.xml w:p 82 :**

> EX-002 — Périmètre. Les objets traités concernent la conception architecturale : dessin, modèles, BIM, rendu, métrés, coordination, observations, révisions et livrables. La comptabilité, la gestion RH, le commerce, la direction quotidienne des travaux, les réserves de chantier et l’exploitation restent hors responsabilité du Studio.

**EX-003 — source word/document.xml w:p 83 :**

> EX-003 — Contexte constant. Toute surface de travail ou action persistante porte les identifiants projectId, studyId, variantId et la version de base. Le projet et l’étude peuvent exister avant la première variante, mais aucune géométrie éditée ne doit être dépourvue de variante propriétaire.

**EX-004 — source word/document.xml w:p 107 :**

> EX-004 — Planche 2D. Éditeur autonome de géométries planes, côtes, contraintes, calques et annotations. Aucun modèle 3D n’est requis pour produire et publier un dessin indépendant.

**EX-005 — source word/document.xml w:p 108 :**

> EX-005 — Planche 3D. Éditeur autonome de géométries spatiales, faces, solides, groupes et objets architecturaux. Sa saisie n’exige pas d’esquisse 2D préalable ; ce n’est pas une simple visionneuse.

**EX-006 — source word/document.xml w:p 109 :**

> EX-006 — Conception associée. Les deux planches peuvent agir sur une même définition architecturale au moyen de commandes validées. Les trois relations — associé, référence liée, copie indépendante — sont visibles et explicites.

**EX-007 — source word/document.xml w:p 110 :**

> EX-007 — Workflow transversal. Le cycle Cadrer → Explorer → Concevoir → Contrôler → Coordonner et corriger → Approuver → Publier traverse les domaines sans devenir un cinquième module et sans remplacer le Parcours de Fadi.

**EX-036 — source word/document.xml w:p 491 :**

> EX-036 — Accessibilité. Chaque commande affichée possède un nom compréhensible, un état actif/chargement/interdit, un parcours clavier et un retour d’erreur. Les gestes impossibles au seul clavier possèdent un chemin alternatif adapté au contexte, à définir dans les spécifications UX. Le changement de focus entre Planche 2D et 3D est visible.

**EX-037 — source word/document.xml w:p 492 :**

> EX-037 — Continuité des gestes. La palette contextuelle ne doit pas perturber les séquences de dessin, la saisie numérique ni les modificateurs de contraintes. Les préférences de présentation sont distinctes des paramètres de géométrie enregistrés.

**EX-038 — source word/document.xml w:p 497 :**

> EX-038 — Démarrage léger. À l’ouverture du Studio : interface minimale, identité/profil, contexte d’étude, métadonnées du registre et commandes essentielles. Aucune initialisation systématique de tous les outils spécialisés, d’OCCT, des moteurs 3D non sollicités ou de leurs workers.

**EX-039 — source word/document.xml w:p 498 :**

> EX-039 — Ouverture de planche. La première Planche 2D initialise uniquement les composants nécessaires à sa représentation et à ses commandes usuelles. La Planche 3D initialise son renderer et les machines utiles. Les deux peuvent cohabiter lorsque l’utilisateur les ouvre, sans forcer le téléchargement de tout le catalogue.

**EX-087 — source word/document.xml w:p 864 :**

> EX-087 — Intégration contrôlée. Les modules Fadi existants restent responsables des données transverses qu’ils possèdent. Tout nouvel endpoint nécessite un contrôle de droit tenant/projet, de schéma, de révision, d’idempotence, de taille d’entrée et de journal.

**EX-088 — source word/document.xml w:p 865 :**

> EX-088 — Isolation multi-utilisateurs. Le système interdit l’accès aux documents, profils et variantes d’un autre périmètre sans autorisation. Les URL de blob, résultats de jobs et exports temporairement accessibles sont soumis à l’autorisation de l’objet source.

**IF-001 — source word/document.xml w:p 141 :**

> IF-001 — Interface de rattachement projet. Entrée : projet autorisé, site/sources/version, acteur ; sortie : contexte d’étude validé et identifiant stable. Échec : projet inaccessible, source non disponible, conflit de version, droits insuffisants. Le contrat physique demeure à choisir.

**INV-014 — source word/document.xml w:p 233, 234 :**

> Le mode hors connexion différencie travail local, confirmation serveur et droits à reverifier.

**INV-015 — source word/document.xml w:p 235, 236 :**

> Un outil masqué reste retrouvable s’il est autorisé, et n’est pas désinstallé implicitement.
