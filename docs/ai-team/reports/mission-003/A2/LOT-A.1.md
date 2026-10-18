# Dossier de préparation — lot A.1

Mission(s) du programme #156 : M17. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-003, EX-008–019, EX-087–091 ; INV-002–006, INV-012, INV-014 ; IF-001/004/006/011**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** projects.model_revision, versions/variants/publications existent ; variante actuelle projet forké, absence étude. Manquent ownership étude/variante pour 2D/3D autonome et migration prouvée.

**Contrat candidat à ratifier :** C-STUDY : Study{id,projectId,sourceRefs,hypotheses}; Variant{id,studyId,lineage,status}; Revision{id,variantId,parentIds,contentRefs,hashes,author,serverTime}. IDs non réutilisés. Documents2D et Models3D portent variantId/schemaVersion ; objets associés propriétaire unique. Profil/caméra hors révision. API logique create/read/fork/readRevision utilise identité serveur et idempotence ; aucun schéma SQL imposé ici.

**Décisions :** DEC-01/02/03/12/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** M11/G0, contrats G1, preuves G2 ciblées, M02 cible. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A2 modèle/backend ; A3 uniquement après accord ; A5. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-011–014/034–036. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Perte filiation ou doublon de base : migration dry-run objet→mapping, journal durable et refus contrat ancien incompatible. Rollback copie source/build/schéma compatibles, nouvelles écritures traitées explicitement.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-003 — source word/document.xml w:p 83 :**

> EX-003 — Contexte constant. Toute surface de travail ou action persistante porte les identifiants projectId, studyId, variantId et la version de base. Le projet et l’étude peuvent exister avant la première variante, mais aucune géométrie éditée ne doit être dépourvue de variante propriétaire.

**EX-008 — source word/document.xml w:p 196 :**

> EX-008 — Sens de dépendance. Les interfaces invoquent les capacités, les capacités produisent des intentions, les commandes autorisées modifient le modèle canonique, puis les projections dérivées se recalculent. Une modification de scène graphique ne crée pas un changement métier sans commande.

**EX-009 — source word/document.xml w:p 197 :**

> EX-009 — Propriété des données. Pour chaque classe d’information, un service logique propriétaire est désigné ; les interfaces des autres domaines consomment des références et appels de commande. Un modèle ne doit pas exister en deux exemplaires autoritaires simplement parce que deux planches l’affichent.

**EX-010 — source word/document.xml w:p 202 :**

> EX-010 — Événements d’effets. Chaque commande acceptée doit identifier autant que possible : objets créés, modifiés ou supprimés ; références/contraintes modifiées ; domaines dérivés invalidés ; révision de sortie et origine de la modification.

**EX-011 — source word/document.xml w:p 203 :**

> EX-011 — Actualisation. Les projections consomment ces effets pour régénérer la portée minimale correcte, avec possibilité de repli vers une reconstruction plus large si l’invalidation exacte n’est pas sûre. Une actualisation partielle erronée n’est jamais acceptée au nom des performances.

**EX-012 — source word/document.xml w:p 298 :**

> EX-012 — Immuabilité des révisions. Une révision de référence ne change pas rétroactivement lorsque la variante évolue. Une correction de contenu produit un nouvel état ; une annulation collaborative constitue elle-même une nouvelle opération vérifiée.

**EX-013 — source word/document.xml w:p 299 :**

> EX-013 — Clonage. Lors du clonage d’une variante, les objets issus de la copie sont identifiés dans la nouvelle variante ; leur provenance peut pointer vers leurs sources, sans établir une propagation automatique. Les composants partagés explicitement versionnés font l’objet d’un contrat de mise à jour séparé.

**EX-014 — source word/document.xml w:p 300 :**

> EX-014 — Provenance et unités. Chaque source externe porte auteur/fournisseur lorsqu’il est connu, format, horodatage, version, unités, repère, transformation, restrictions d’utilisation et empreinte du contenu si calculable.

**EX-015 — source word/document.xml w:p 301 :**

> EX-015 — Références topologiques. Le système ne reconstitue jamais une relation entre une cote et une face découpée sur la seule proximité spatiale si plusieurs cibles plausibles existent. Il la conserve avec correspondance démontrée ou signale une rupture à résoudre.

**EX-016 — source word/document.xml w:p 328 :**

> EX-016 — Fraîcheur. Les contenus dérivés doivent afficher à jour pour révision R, à recalculer, en calcul, échec ou non applicable, selon leur contrat. « Dernière image produite » ne signifie pas nécessairement « état courant ».

**EX-017 — source word/document.xml w:p 331 :**

> EX-017 — Atomicité. Les modifications canoniques d’une même opération sont engagées ensemble ou pas du tout. Les rafraîchissements de cache peuvent être différés et signalés, mais ne constituent pas des modifications canoniques validées.

**EX-018 — source word/document.xml w:p 332 :**

> EX-018 — Idempotence. Une même commande répétée après une interruption, avec son requestId et le même périmètre, n’est pas appliquée deux fois. Une nouvelle commande distincte exige une nouvelle identité.

**EX-019 — source word/document.xml w:p 335 :**

> EX-019 — Évolutivité des schémas. Chaque document/commande persistant porte sa version de schéma. Toute migration doit fournir une transformation documentée, des tests aller-retour lorsque réalisables, une conservation des données inconnues ou un rapport des pertes, et un retour arrière ou une récupération explicitement prévue.

**EX-087 — source word/document.xml w:p 864 :**

> EX-087 — Intégration contrôlée. Les modules Fadi existants restent responsables des données transverses qu’ils possèdent. Tout nouvel endpoint nécessite un contrôle de droit tenant/projet, de schéma, de révision, d’idempotence, de taille d’entrée et de journal.

**EX-088 — source word/document.xml w:p 865 :**

> EX-088 — Isolation multi-utilisateurs. Le système interdit l’accès aux documents, profils et variantes d’un autre périmètre sans autorisation. Les URL de blob, résultats de jobs et exports temporairement accessibles sont soumis à l’autorisation de l’objet source.

**EX-089 — source word/document.xml w:p 866 :**

> EX-089 — Persistance et reprise. Une confirmation envoyée au navigateur doit correspondre à un engagement durable conforme au contrat de sauvegarde. Les sauvegardes, restaurations et récupérations d’incident sont testées sur un corpus contenant données de conception, associations et publications.

**EX-090 — source word/document.xml w:p 869 :**

> EX-090 — Reconstruction. Une restauration doit permettre de retrouver le modèle canonique confirmé, les manifestes et leurs pièces, les références, les droits applicables et les identités des documents. Les caches GPU et index spatiaux sont reconstruits, non sauvegardés comme preuve faisant autorité.

**EX-091 — source word/document.xml w:p 872 :**

> EX-091 — Migration non destructrice. Une étude existante ne doit pas perdre une propriété, une cote, une association, un identifiant documentaire, une révision ou un accès sans rapport explicite, procédure d’accord et solution de restauration. Toute bascule définit des jeux d’essai d’avant/après et un point de retour arrière.

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

**INV-012 — source word/document.xml w:p 229, 230 :**

> Une publication antérieure n’est pas réécrite par la création d’une nouvelle publication.

**INV-014 — source word/document.xml w:p 233, 234 :**

> Le mode hors connexion différencie travail local, confirmation serveur et droits à reverifier.

**IF-001 — source word/document.xml w:p 141 :**

> IF-001 — Interface de rattachement projet. Entrée : projet autorisé, site/sources/version, acteur ; sortie : contexte d’étude validé et identifiant stable. Échec : projet inaccessible, source non disponible, conflit de version, droits insuffisants. Le contrat physique demeure à choisir.

**IF-004 — source word/document.xml w:p 330 :**

> IF-004 — Précondition de version. Toute intention qui modifie un objet en environnement collaboratif référence baseRevisionId et, lorsque nécessaire, les versions individuelles des objets et relations touchés. En cas de divergence incompatible : refus et proposition de résolution ou nouveau calcul sur la base courante.

**IF-006 — source word/document.xml w:p 529 :**

> IF-006 — Commande métier. Le contrat de transport doit exprimer les attributs logiques suivants ; l’objet est une proposition de schéma et non une API actuellement exposée.

Complément exact : {'paragraph': 530, 'texte_exact': '{  "requestId": "idempotency-uuid",  "toolId": "studio.arch.wall",  "contractVersion": "1.0.0",  "actorId": "actor-ref",  "scope": {    "projectId": "p", "studyId": "s", "variantId": "v",    "baseRevisionId": "R12"  },  "targetIds": ["wall-42"],  "operation": "architecture.updateWall",  "parameters": {"height": 3.0, "unit": "m"},  "mode": "commit"}'}

Complément exact : {'paragraph': 531, 'texte_exact': 'Le serveur établit lui-même l’identité authentifiée et vérifie sa concordance avec l’enveloppe ; un actorId fourni par le navigateur ne crée aucun droit. Les identifiants de contexte doivent être autorisés et la version de base vérifiée. Les coordonnées, tolérances et unités appartiennent au contrat de chaque opération.'}

**IF-011 — source word/document.xml w:p 868 :**

> IF-011 — Journal de changement. Événement avec eventId, transaction, auteur, étude/variante, révision base/issue, effets, horodatage serveur et relation éventuelle à un job. La diffusion de notifications ne constitue pas une confirmation métier sans engagement préalable.
