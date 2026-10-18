# Dossier de préparation — lot A.4-A.5

Mission(s) du programme #156 : M20. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-006, EX-010–018, EX-021–024, EX-045–049 ; INV-001–006/011–013 ; IF-003/004/006/011 ; AC-001/003**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Commandes /3, journaux, inverses et outbox existants ; association Studio/historique hybride à spécifier et prouver.

**Contrat candidat à ratifier :** C-ASSOCIATION : associationId, kind=associated|linked-reference|independent-copy, sourceRef,targetRef,propagation,state,provenance. associated même objectId ; copy nouvelles identités sans propagation ; linked pin version et acceptation explicite. C-COMMAND : requestId,contractVersion,toolId,scope C-STUDIO-CONTEXT,targetIds,operation,parameters ; acteur serveur. accepted/rejected/conflict/pending/duplicate avec révisions/effets et aucun succès anticipé. Undo nouveau command revalidé, jamais rewind historique.

**Décisions :** DEC-02/03/12/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** A.1, interfaces A.2/A.3 stables ; X sécurité ; D jobs exposés. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A2 contrats ; A3 après accord ; A5 concurrence. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-003–014/027/035. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Double écriture, undo écrasant autrui, rejouage : transaction atomique, dédup scope, préconditions et mapping topo démontré sinon à résoudre. Rollback opération inverse nouvelle révision, publications historiques inchangées.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-006 — source word/document.xml w:p 109 :**

> EX-006 — Conception associée. Les deux planches peuvent agir sur une même définition architecturale au moyen de commandes validées. Les trois relations — associé, référence liée, copie indépendante — sont visibles et explicites.

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

**EX-021 — source word/document.xml w:p 364 :**

> EX-021 — Correspondance explicite. Une commande sur un objet architectural depuis l’une des planches cible le même objectId et les mêmes relations. Les deux planches ne doivent pas maintenir leurs propres versions autoritaires du mur.

**EX-022 — source word/document.xml w:p 383 :**

> EX-022 — Propagation limitée. Toute propagation est définie par le type d’association et la dépendance. L’extraction d’une coupe ne confère pas à ses segments le pouvoir universel de modifier le volume ; une cote associée ne modifie pas automatiquement sa cible.

**EX-023 — source word/document.xml w:p 414 :**

> EX-023 — Repères et unités. Toute primitive possède un système de coordonnées identifiable : document 2D, local d’objet, système de projet et, le cas échéant, système géographique référencé. Les transformations sont versionnées et vérifiées, avec unités explicites ; la projection graphique en pixels ne constitue jamais l’unité de référence.

**EX-024 — source word/document.xml w:p 415 :**

> EX-024 — Gestes réversibles. Un geste peut afficher un aperçu approché sans écrire d’objet permanent. La confirmation produit une commande, soumise aux contrôles et à une restitution fidèle aux tolérances contractuelles ; annuler l’aperçu ne laisse aucune mutation canonique.

**EX-045 — source word/document.xml w:p 552 :**

> EX-045 — Prévisualisation distincte. Un appel d’essai ne produit pas de mutation permanente. La réponse peut fournir géométrie, contraintes et avertissements, avec portée de validité de révision. Un calcul prévisualisé et non confirmé est révoqué sans effets de référence.

**EX-046 — source word/document.xml w:p 553 :**

> EX-046 — Journal d’audit. Les engagements persistants exposent qui a demandé, sur quoi, quand, à partir de quelle révision, avec quel résultat et quelles identités touchées. Les événements sensibles suivent une politique de minimisation et de conservation explicite.

**EX-047 — source word/document.xml w:p 555 :**

> EX-047 — Historique hybride. Le Studio conserve les mécanismes éprouvés de Fadi lorsque l’audit démontre leur adéquation : commandes métier, deltas de Planche, états immuables/instantanés locaux. Les inverses, deltas et snapshots sont choisis selon exactitude, volume mémoire et concurrence ; aucune promesse générale d’annulation en O(1) n’est émise.

**EX-048 — source word/document.xml w:p 556 :**

> EX-048 — Annulation collaborative. Annuler une commande acceptée peut nécessiter une nouvelle commande inverse sur la révision actuelle. Le serveur revalide les objets modifiés entre-temps ; l’historique ou la publication précédente n’est pas réécrit.

**EX-049 — source word/document.xml w:p 557 :**

> EX-049 — Reprise de session. Au retour après interruption, l’interface distingue opérations confirmées, en attente de synchronisation, rejetées/conflictuelles, prévisualisations abandonnées. Les opérations locales possèdent une identité de déduplication et une version de contrat compatibles avec la file de synchronisation.

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

**INV-011 — source word/document.xml w:p 227, 228 :**

> Les annulations concurrentes ne détruisent pas silencieusement le travail d’un autre acteur.

**INV-012 — source word/document.xml w:p 229, 230 :**

> Une publication antérieure n’est pas réécrite par la création d’une nouvelle publication.

**INV-013 — source word/document.xml w:p 231, 232 :**

> Une annotation référencée à une face modifiée est conservée avec correspondance vérifiée ou marquée « à résoudre ».

**IF-003 — source word/document.xml w:p 200 :**

> IF-003 — Calcul lourd (exemple booléen). ① collecte des paramètres ; ② capture immuable de l’identifiant de révision ; ③ soumission au gestionnaire de tâches ; ④ worker/WASM ou service serveur ; ⑤ retour résultat + révision source + métriques ; ⑥ vérification du contexte et des droits ; ⑦ engagement transactionnel explicite ; ⑧ mise à jour des projections. Un résultat ancien peut être conservé à titre historique, pas appliqué à une révision plus récente.

**IF-004 — source word/document.xml w:p 330 :**

> IF-004 — Précondition de version. Toute intention qui modifie un objet en environnement collaboratif référence baseRevisionId et, lorsque nécessaire, les versions individuelles des objets et relations touchés. En cas de divergence incompatible : refus et proposition de résolution ou nouveau calcul sur la base courante.

**IF-006 — source word/document.xml w:p 529 :**

> IF-006 — Commande métier. Le contrat de transport doit exprimer les attributs logiques suivants ; l’objet est une proposition de schéma et non une API actuellement exposée.

Complément exact : {'paragraph': 530, 'texte_exact': '{  "requestId": "idempotency-uuid",  "toolId": "studio.arch.wall",  "contractVersion": "1.0.0",  "actorId": "actor-ref",  "scope": {    "projectId": "p", "studyId": "s", "variantId": "v",    "baseRevisionId": "R12"  },  "targetIds": ["wall-42"],  "operation": "architecture.updateWall",  "parameters": {"height": 3.0, "unit": "m"},  "mode": "commit"}'}

Complément exact : {'paragraph': 531, 'texte_exact': 'Le serveur établit lui-même l’identité authentifiée et vérifie sa concordance avec l’enveloppe ; un actorId fourni par le navigateur ne crée aucun droit. Les identifiants de contexte doivent être autorisés et la version de base vérifiée. Les coordonnées, tolérances et unités appartiennent au contrat de chaque opération.'}

**IF-011 — source word/document.xml w:p 868 :**

> IF-011 — Journal de changement. Événement avec eventId, transaction, auteur, étude/variante, révision base/issue, effets, horodatage serveur et relation éventuelle à un job. La diffusion de notifications ne constitue pas une confirmation métier sans engagement préalable.

**AC-001 — source word/document.xml w:p 419 :**

> AC-001. Le objectId du mur reste stable ; l’ouverture reste reliée au bon hôte ; les deux planches reflètent la même définition ; les métrés sont mis à jour ou marqués périmés ; undo/redo et réouverture retrouvent les valeurs ; un dossier publié conserve la version examinée.

**AC-003 — source word/document.xml w:p 560 :**

> AC-003. Deux utilisateurs modifiant un mur de manière incompatible obtiennent un conflit traçable, une révision de référence préservée et aucune application implicite du dernier enregistrement. La restauration fonctionne après coupure simulée sans duplication de la commande.
