# Dossier de préparation — lot A.2

Mission(s) du programme #156 : M18. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-004, EX-020, EX-023–025, EX-045–049, EX-055 ; INV-003/005/007/008/013 ; IF-002/004/006**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Plan2D SVG, snapping, contraintes/cotes candidats ; autonomie sans modèle bâtiment/3D non prouvée.

**Contrat candidat à ratifier :** C-DRAWING2D : documentId/variantId/revision/schemaVersion, frame+unit, primitiveIds, layers/constraints/annotations. create/edit/delete via commande, preview sans write ; coordonnées finies et calque autorisé. Aucun 3D substitut. Vue et feuille dérivées référencent la révision ; publication dépend E.

**Décisions :** DEC-01/02/08/12/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** A.1 contrat document ; I entrée ; X corpus S1/S2/S3 ; E publication finale. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A3 CAO après accord ; A2 contrats, A4 interactions, A5. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-001/004–007/011/022/027. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Conversion implicite en mur/3D interdite ; annotations/topologie ambiguës conservées à résoudre. Rollback document source sérialisé + version schema et journal, ni suppression inconnus ni perte de cotes.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-004 — source word/document.xml w:p 107 :**

> EX-004 — Planche 2D. Éditeur autonome de géométries planes, côtes, contraintes, calques et annotations. Aucun modèle 3D n’est requis pour produire et publier un dessin indépendant.

**EX-020 — source word/document.xml w:p 363 :**

> EX-020 — Indépendance forte. Un dessin 2D doit pouvoir être sérialisé, restauré, édité et exporté sans reconstruction d’un modèle 3D « de substitution ». Les extrusions ou transferts créent un objet 3D nouveau ou une association déclarée.

**EX-023 — source word/document.xml w:p 414 :**

> EX-023 — Repères et unités. Toute primitive possède un système de coordonnées identifiable : document 2D, local d’objet, système de projet et, le cas échéant, système géographique référencé. Les transformations sont versionnées et vérifiées, avec unités explicites ; la projection graphique en pixels ne constitue jamais l’unité de référence.

**EX-024 — source word/document.xml w:p 415 :**

> EX-024 — Gestes réversibles. Un geste peut afficher un aperçu approché sans écrire d’objet permanent. La confirmation produit une commande, soumise aux contrôles et à une restitution fidèle aux tolérances contractuelles ; annuler l’aperçu ne laisse aucune mutation canonique.

**EX-025 — source word/document.xml w:p 416 :**

> EX-025 — Accrochage stable. Les types d’accrochage, priorités, tolérances et règles de sélection sont définis par contexte. Une accélération spatiale ou une baisse des effets graphiques n’est pas autorisée à substituer silencieusement un point différent à celui du calcul de référence.

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

**EX-055 — source word/document.xml w:p 616 :**

> EX-055 — Fidélité. Le renderer 2D reproduit lignes, arcs, splines, cercles, contours, hachures, cotations, légendes, textes, symboles, calques, transparences, sélection et aperçu, avec un comportement identique des coordonnées et accrochages.

**INV-003 — source word/document.xml w:p 211, 212 :**

> Une copie indépendante ne propage pas vers son origine.

**INV-005 — source word/document.xml w:p 215, 216 :**

> Une opération rejetée ne modifie pas partiellement les données canoniques.

**INV-007 — source word/document.xml w:p 219, 220 :**

> Une optimisation préserve les résultats métier dans les tolérances déclarées.

**INV-008 — source word/document.xml w:p 221, 222 :**

> Un cache/index/projection est reconstruisible depuis la donnée de référence.

**INV-013 — source word/document.xml w:p 231, 232 :**

> Une annotation référencée à une face modifiée est conservée avec correspondance vérifiée ou marquée « à résoudre ».

**IF-002 — source word/document.xml w:p 199 :**

> IF-002 — Geste rapide (exemple Ligne). ① réception pointeur/clavier ; ② lecture de la projection/index correspondant à la révision active ; ③ calcul de snapping ; ④ affichage d’aperçu transitoire ; ⑤ confirmation ; ⑥ intention géométrique validée ; ⑦ commande idempotente ; ⑧ réponse acceptation/conflit/refus ; ⑨ invalidation limitée des données dérivées.

**IF-004 — source word/document.xml w:p 330 :**

> IF-004 — Précondition de version. Toute intention qui modifie un objet en environnement collaboratif référence baseRevisionId et, lorsque nécessaire, les versions individuelles des objets et relations touchés. En cas de divergence incompatible : refus et proposition de résolution ou nouveau calcul sur la base courante.

**IF-006 — source word/document.xml w:p 529 :**

> IF-006 — Commande métier. Le contrat de transport doit exprimer les attributs logiques suivants ; l’objet est une proposition de schéma et non une API actuellement exposée.

Complément exact : {'paragraph': 530, 'texte_exact': '{  "requestId": "idempotency-uuid",  "toolId": "studio.arch.wall",  "contractVersion": "1.0.0",  "actorId": "actor-ref",  "scope": {    "projectId": "p", "studyId": "s", "variantId": "v",    "baseRevisionId": "R12"  },  "targetIds": ["wall-42"],  "operation": "architecture.updateWall",  "parameters": {"height": 3.0, "unit": "m"},  "mode": "commit"}'}

Complément exact : {'paragraph': 531, 'texte_exact': 'Le serveur établit lui-même l’identité authentifiée et vérifie sa concordance avec l’enveloppe ; un actorId fourni par le navigateur ne crée aucun droit. Les identifiants de contexte doivent être autorisés et la version de base vérifiée. Les coordonnées, tolérances et unités appartiennent au contrat de chaque opération.'}
