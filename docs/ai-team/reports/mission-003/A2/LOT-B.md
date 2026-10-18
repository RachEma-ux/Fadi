# Dossier de préparation — lot B

Mission(s) du programme #156 : M21. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-026–044, EX-049 ; INV-009/010/014/015 ; IF-005/006 ; AC-002**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Catalogues/machines/préférences et service worker existent, collision echelle et imports statiques ; manque Registry/Manager Studio qualifié.

**Contrat candidat à ratifier :** C-REGISTRY : toolId,contractVersion,ownerDomain,contexts,inputSchemaRef,permission,loaderId,dependencies,preview,resultCommand,offline,quality,lifecycle ; aucun code arbitraire manifeste. C-MANAGER activation découvert→droits/contexte→deps→load→init→ready→actif→suspendu/error ; profileId/version propriétaire, aliases migrés et conflits raccourcis explicites. Cache buildId/toolContract/schema, pending queue protégée, rôle non modifié par profil.

**Décisions :** DEC-04/05/06/07/14/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** A.1/contexte/commandes stables, I ; X réseau/mémoire. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A4 frontend, A2 contrats, A3 après accord, A5/A6. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-016–021/036. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Masquer≠décharger, profile import≠droit ; limiter précache sans perdre données offline. Rollback profils/caches versionnés avec queue conservée, alias ambigus en résolution, pas effacement.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-026 — source word/document.xml w:p 422 :**

> EX-026 — Registre. Le Tool Registry décrit les capacités activables, leurs contextes, versions, contrats, permissions et dépendances. Il est consultable sans télécharger tous les moteurs ni instancier leurs machines. Son manifeste léger est utilisable pour la recherche hors ligne.

**EX-027 — source word/document.xml w:p 423 :**

> EX-027 — Identifiants uniques. Les capacités portent des identifiants globalement non ambigus (studio.draw.line2d, studio.transform.scale, studio.arch.ladder). Une collision de noms d’affichage n’autorise pas une collision d’identifiants. Les renommages gardent les alias de migration documentés.

**EX-028 — source word/document.xml w:p 424 :**

> EX-028 — Validation à deux niveaux. Les métadonnées et le schéma peuvent être contrôlés au build ; chaque invocation effective fait l’objet des contrôles d’exécution, notamment permission, contexte, paramètres, quotas et révision.

**EX-029 — source word/document.xml w:p 463 :**

> EX-029 — Recherche. Requête par nom, synonymes, famille, domaine, contexte et identifiant ; la recherche ne lance pas le moteur. Pour chaque outil, l’interface expose : découvert, non disponible, incompatible, interdit, non installé hors ligne, en chargement, prêt, erreur.

**EX-030 — source word/document.xml w:p 464 :**

> EX-030 — Versions. Un changement majeur du contrat exige un plan de compatibilité avec profils enregistrés, commandes hors ligne en attente et documents réouvrables. Un module marqué « déprécié » reste résoluble tant que sa présence est nécessaire à la lecture d’un travail existant, ou fournit une migration sûre.

**EX-031 — source word/document.xml w:p 465 :**

> EX-031 — Extensibilité sûre. La déclaration d’extension indique provenance, version, signature ou mécanisme de confiance choisi, permissions demandées, dépendances, mises à jour et support. « Trouvé dans le Registry » ne signifie pas « autorisé à charger/écrire ». Les extensions tierces restent une décision ouverte.

**EX-032 — source word/document.xml w:p 468 :**

> EX-032 — Manager. Le Tool Manager construit les barres, réconcilie les préférences et le contexte, résout les loaders, active/désactive les machines d’outil et expédie les événements. Il n’effectue pas lui-même de booléens, de tessellation ou de validation canonique.

**EX-033 — source word/document.xml w:p 487 :**

> EX-033 — Personnalisation sûre. Retirer un bouton ne désinstalle ni l’outil ni les objets créés avec lui. Importer un profil ne confère pas de permissions. Le passage d’un profil à l’autre ne produit pas de révision du bâtiment.

**EX-034 — source word/document.xml w:p 488 :**

> EX-034 — Persistance des profils. Un profil possède profileId, propriétaire, version, ordre des capacités, raccourcis, visibilité, réglages et contexte. Les conflits de raccourcis sont détectés, explicités et résolus sans effacer la configuration source.

**EX-035 — source word/document.xml w:p 489 :**

> EX-035 — Commande de recherche. Le catalogue complet reste accessible indépendamment de la barre active. Un outil interdit ou incompatible peut être recherché à des fins d’information, mais n’est pas offert comme action exécutable.

**EX-036 — source word/document.xml w:p 491 :**

> EX-036 — Accessibilité. Chaque commande affichée possède un nom compréhensible, un état actif/chargement/interdit, un parcours clavier et un retour d’erreur. Les gestes impossibles au seul clavier possèdent un chemin alternatif adapté au contexte, à définir dans les spécifications UX. Le changement de focus entre Planche 2D et 3D est visible.

**EX-037 — source word/document.xml w:p 492 :**

> EX-037 — Continuité des gestes. La palette contextuelle ne doit pas perturber les séquences de dessin, la saisie numérique ni les modificateurs de contraintes. Les préférences de présentation sont distinctes des paramètres de géométrie enregistrés.

**EX-038 — source word/document.xml w:p 497 :**

> EX-038 — Démarrage léger. À l’ouverture du Studio : interface minimale, identité/profil, contexte d’étude, métadonnées du registre et commandes essentielles. Aucune initialisation systématique de tous les outils spécialisés, d’OCCT, des moteurs 3D non sollicités ou de leurs workers.

**EX-039 — source word/document.xml w:p 498 :**

> EX-039 — Ouverture de planche. La première Planche 2D initialise uniquement les composants nécessaires à sa représentation et à ses commandes usuelles. La Planche 3D initialise son renderer et les machines utiles. Les deux peuvent cohabiter lorsque l’utilisateur les ouvre, sans forcer le téléchargement de tout le catalogue.

**EX-040 — source word/document.xml w:p 499 :**

> EX-040 — Activation rare. Une opération particulière déclenche le chargement de son module et de ses dépendances manquantes, puis conserve ou libère les ressources selon une politique documentée. Un moteur déjà initialisé et compatible ne doit pas être réinitialisé sans raison.

**EX-041 — source word/document.xml w:p 500 :**

> EX-041 — Partage de dépendances. Les modules d’outils mutualisent la géométrie fondamentale, les bibliothèques graphiques et les noyaux exacts. Un découpage en un fichier par bouton est interdit comme obligation universelle : la granularité est choisie à partir des coûts de chargement, des dépendances et du comportement réel de l’utilisateur.

**EX-042 — source word/document.xml w:p 521 :**

> EX-042 — Cache différencié. Le service worker gère séparément : (a) shell minimal, (b) ressources essentielles d’un profil, (c) modules facultatifs, (d) données métier et file de commandes. Le préchargement complet du build n’est pas considéré comme équivalent au chargement différé, même si le code n’est pas encore exécuté.

**EX-043 — source word/document.xml w:p 522 :**

> EX-043 — Offline véridique. Une capacité n’est annoncée utilisable hors réseau que si les modules, dépendances et données de référence indispensables sont présents et compatibles. Une action exigeant l’autorité centrale peut être préparée localement selon contrat, mais n’est jamais marquée « publiée/approuvée » avant validation centrale.

**EX-044 — source word/document.xml w:p 523 :**

> EX-044 — Versions du cache. Le système conserve la correspondance buildId ↔ toolContractVersion ↔ schemaVersion, protège les commandes en attente et évite qu’une mise à jour invalide une opération locale sans explication. Les politiques d’éviction doivent respecter les limites de quota et préserver prioritairement les données non synchronisées.

**EX-049 — source word/document.xml w:p 557 :**

> EX-049 — Reprise de session. Au retour après interruption, l’interface distingue opérations confirmées, en attente de synchronisation, rejetées/conflictuelles, prévisualisations abandonnées. Les opérations locales possèdent une identité de déduplication et une version de contrat compatibles avec la file de synchronisation.

**INV-009 — source word/document.xml w:p 223, 224 :**

> Un profil personnalisé ne change ni données, ni droits, ni révision de conception.

**INV-010 — source word/document.xml w:p 225, 226 :**

> Une requête IA ou extension passe par les mêmes validations centrales qu’une action humaine.

**INV-014 — source word/document.xml w:p 233, 234 :**

> Le mode hors connexion différencie travail local, confirmation serveur et droits à reverifier.

**INV-015 — source word/document.xml w:p 235, 236 :**

> Un outil masqué reste retrouvable s’il est autorisé, et n’est pas désinstallé implicitement.

**IF-005 — source word/document.xml w:p 469 :**

> IF-005 — Cycle d’activation. découvert → vérification de contexte/droits → résolution des dépendances → chargement du code → initialisation → prêt → actif → suspendu/désactivé ; erreurs incompatible, permission refusée, hors ligne, échec de chargement, échec du noyau. La transition ne doit pas perdre un geste inachevé sans retour visible.

**IF-006 — source word/document.xml w:p 529 :**

> IF-006 — Commande métier. Le contrat de transport doit exprimer les attributs logiques suivants ; l’objet est une proposition de schéma et non une API actuellement exposée.

Complément exact : {'paragraph': 530, 'texte_exact': '{  "requestId": "idempotency-uuid",  "toolId": "studio.arch.wall",  "contractVersion": "1.0.0",  "actorId": "actor-ref",  "scope": {    "projectId": "p", "studyId": "s", "variantId": "v",    "baseRevisionId": "R12"  },  "targetIds": ["wall-42"],  "operation": "architecture.updateWall",  "parameters": {"height": 3.0, "unit": "m"},  "mode": "commit"}'}

Complément exact : {'paragraph': 531, 'texte_exact': 'Le serveur établit lui-même l’identité authentifiée et vérifie sa concordance avec l’enveloppe ; un actorId fourni par le navigateur ne crée aucun droit. Les identifiants de contexte doivent être autorisés et la version de base vérifiée. Les coordonnées, tolérances et unités appartiennent au contrat de chaque opération.'}

**AC-002 — source word/document.xml w:p 526 :**

> AC-002. Une barre contenant environ vingt outils de dessin usuels peut être ouverte sans initialiser tous les modules spécialisés. Le test compare les requêtes réseau, la taille transférée, les chunks exécutés et l’empreinte mémoire à une référence, en distinguant cache froid et chaud. Aucun taux de réduction n’est présumé avant mesure.
