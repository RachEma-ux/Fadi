# Dossier de préparation — lot A.3

Mission(s) du programme #156 : M19. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-005, EX-021–025, EX-045–051, EX-056–058 ; INV-002/003/005–008/013 ; IF-002/003/006**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** planche-model, machines faces/solides, vue Three candidats ; sauvegarde/reprise et coupe indépendante Studio à prouver.

**Contrat candidat à ratifier :** C-MODEL3D : modelId/variantId/schemaVersion, repère/unité, vertex/edge/face/objectIds, provenance. Saisie spatiale directe sans esquisse ; BIM seulement conversion explicite. Sélection rendue→objet stable, commande validée, vue/coupe dérivée révision source.

**Décisions :** DEC-02/08/10/11/12/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** A.1 contrat modèle ; I ; X S5 ; protections D minimales avant outil lourd. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A3 CAO après accord ; A2/A4/A5. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-002/004/007/011/014/023–026. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Faces perdues, noyau en échec, sémantique inventée : refus atomique, dirty refs explicites. Rollback commande inverse validée ou snapshot compatible ; résultat worker ancien jamais engagé.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-005 — source word/document.xml w:p 108 :**

> EX-005 — Planche 3D. Éditeur autonome de géométries spatiales, faces, solides, groupes et objets architecturaux. Sa saisie n’exige pas d’esquisse 2D préalable ; ce n’est pas une simple visionneuse.

**EX-021 — source word/document.xml w:p 364 :**

> EX-021 — Correspondance explicite. Une commande sur un objet architectural depuis l’une des planches cible le même objectId et les mêmes relations. Les deux planches ne doivent pas maintenir leurs propres versions autoritaires du mur.

**EX-022 — source word/document.xml w:p 383 :**

> EX-022 — Propagation limitée. Toute propagation est définie par le type d’association et la dépendance. L’extraction d’une coupe ne confère pas à ses segments le pouvoir universel de modifier le volume ; une cote associée ne modifie pas automatiquement sa cible.

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

**EX-050 — source word/document.xml w:p 563 :**

> EX-050 — Projection reconstructible. La scène de chaque planche contient uniquement des données dérivées : traces visibles, maillages, positions GPU, styles de sélection, poignées, boîtes englobantes et index. Les identités des objets canoniques sont conservées dans une table de correspondance stable, y compris lorsque plusieurs objets partagent un lot de rendu.

**EX-051 — source word/document.xml w:p 564 :**

> EX-051 — Projection en état identifié. La projection affiche son sourceRevisionId et les domaines de données périmées. Une modification de géométrie acceptée invalide les dépendances graphiques correspondantes ; un résultat de worker calculé sur une autre révision ne peut la modifier comme s’il était courant.

**EX-056 — source word/document.xml w:p 620 :**

> EX-056 — Réutilisation contrôlée. La cible conserve par défaut les capacités fonctionnelles utiles déjà observées (rendu à la demande, batching, WebGL2, WebGPU optionnel, machines de Planche), sous réserve d’audit de conformité. Aucun nouveau moteur 3D n’est présumé nécessaire.

**EX-057 — source word/document.xml w:p 631 :**

> EX-057 — Dégradation sûre. En cas de surcharge, réduire d’abord ombres, effets, anti-crénelage et résolution de présentation. Ne jamais désactiver silencieusement un accrochage indispensable, modifier l’objet enregistré ou assouplir une tolérance géométrique métier pour augmenter le FPS.

**EX-058 — source word/document.xml w:p 632 :**

> EX-058 — Transparence des previews. Un aperçu approximatif (ex. offset ou booléen simplifié) doit rester identifié comme provisoire. La géométrie exacte est calculée et validée avant engagement ; le décalage entre preview et résultat final, s’il dépasse la tolérance, doit être expliqué ou la commande refusée.

**INV-002 — source word/document.xml w:p 209, 210 :**

> Une définition architecturale associée possède une autorité unique.

**INV-003 — source word/document.xml w:p 211, 212 :**

> Une copie indépendante ne propage pas vers son origine.

**INV-005 — source word/document.xml w:p 215, 216 :**

> Une opération rejetée ne modifie pas partiellement les données canoniques.

**INV-006 — source word/document.xml w:p 217, 218 :**

> Un résultat dérivé ancien est identifiable et n’écrase pas le résultat courant.

**INV-007 — source word/document.xml w:p 219, 220 :**

> Une optimisation préserve les résultats métier dans les tolérances déclarées.

**INV-008 — source word/document.xml w:p 221, 222 :**

> Un cache/index/projection est reconstruisible depuis la donnée de référence.

**INV-013 — source word/document.xml w:p 231, 232 :**

> Une annotation référencée à une face modifiée est conservée avec correspondance vérifiée ou marquée « à résoudre ».

**IF-002 — source word/document.xml w:p 199 :**

> IF-002 — Geste rapide (exemple Ligne). ① réception pointeur/clavier ; ② lecture de la projection/index correspondant à la révision active ; ③ calcul de snapping ; ④ affichage d’aperçu transitoire ; ⑤ confirmation ; ⑥ intention géométrique validée ; ⑦ commande idempotente ; ⑧ réponse acceptation/conflit/refus ; ⑨ invalidation limitée des données dérivées.

**IF-003 — source word/document.xml w:p 200 :**

> IF-003 — Calcul lourd (exemple booléen). ① collecte des paramètres ; ② capture immuable de l’identifiant de révision ; ③ soumission au gestionnaire de tâches ; ④ worker/WASM ou service serveur ; ⑤ retour résultat + révision source + métriques ; ⑥ vérification du contexte et des droits ; ⑦ engagement transactionnel explicite ; ⑧ mise à jour des projections. Un résultat ancien peut être conservé à titre historique, pas appliqué à une révision plus récente.

**IF-006 — source word/document.xml w:p 529 :**

> IF-006 — Commande métier. Le contrat de transport doit exprimer les attributs logiques suivants ; l’objet est une proposition de schéma et non une API actuellement exposée.

Complément exact : {'paragraph': 530, 'texte_exact': '{  "requestId": "idempotency-uuid",  "toolId": "studio.arch.wall",  "contractVersion": "1.0.0",  "actorId": "actor-ref",  "scope": {    "projectId": "p", "studyId": "s", "variantId": "v",    "baseRevisionId": "R12"  },  "targetIds": ["wall-42"],  "operation": "architecture.updateWall",  "parameters": {"height": 3.0, "unit": "m"},  "mode": "commit"}'}

Complément exact : {'paragraph': 531, 'texte_exact': 'Le serveur établit lui-même l’identité authentifiée et vérifie sa concordance avec l’enveloppe ; un actorId fourni par le navigateur ne crée aucun droit. Les identifiants de contexte doivent être autorisés et la version de base vérifiée. Les coordonnées, tolérances et unités appartiennent au contrat de chaque opération.'}
