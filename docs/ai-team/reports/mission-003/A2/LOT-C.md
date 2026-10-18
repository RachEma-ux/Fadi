# Dossier de préparation — lot C

Mission(s) du programme #156 : M22. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-010/011, EX-025, EX-050–058, EX-097–099 ; INV-007/008 ; AC-004/005**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** SVG/snapping et Three batching/rendu à demande existent ; index et invalidation incrémentale Studio non qualifiés.

**Contrat candidat à ratifier :** C-PROJECTION : sourceRevisionId,objectId→drawId/triangle/instance,dirtyObjects/layers,indexVersion. insert/update/delete cohérents calques/droits ; broad phase candidate, narrow phase référence inchangée avec tolérances et départages. Repli reconstruction complète si invalidation douteuse.

**Décisions :** DEC-08/09/10/13/17/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** X oracle/baseline ; A effets/picking ; B activation. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A2 géométrie/rendu ; A3 après accord ; A5. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-022–026. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Pick/snapping différent éliminatoire ; gain sur mesure appareil réel p50/p95/p99, pas SwiftShader assimilé GPU. Rollback chemin référence/rebuild complet, aucun changement canonique.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-010 — source word/document.xml w:p 202 :**

> EX-010 — Événements d’effets. Chaque commande acceptée doit identifier autant que possible : objets créés, modifiés ou supprimés ; références/contraintes modifiées ; domaines dérivés invalidés ; révision de sortie et origine de la modification.

**EX-011 — source word/document.xml w:p 203 :**

> EX-011 — Actualisation. Les projections consomment ces effets pour régénérer la portée minimale correcte, avec possibilité de repli vers une reconstruction plus large si l’invalidation exacte n’est pas sûre. Une actualisation partielle erronée n’est jamais acceptée au nom des performances.

**EX-025 — source word/document.xml w:p 416 :**

> EX-025 — Accrochage stable. Les types d’accrochage, priorités, tolérances et règles de sélection sont définis par contexte. Une accélération spatiale ou une baisse des effets graphiques n’est pas autorisée à substituer silencieusement un point différent à celui du calcul de référence.

**EX-050 — source word/document.xml w:p 563 :**

> EX-050 — Projection reconstructible. La scène de chaque planche contient uniquement des données dérivées : traces visibles, maillages, positions GPU, styles de sélection, poignées, boîtes englobantes et index. Les identités des objets canoniques sont conservées dans une table de correspondance stable, y compris lorsque plusieurs objets partagent un lot de rendu.

**EX-051 — source word/document.xml w:p 564 :**

> EX-051 — Projection en état identifié. La projection affiche son sourceRevisionId et les domaines de données périmées. Une modification de géométrie acceptée invalide les dépendances graphiques correspondantes ; un résultat de worker calculé sur une autre révision ne peut la modifier comme s’il était courant.

**EX-052 — source word/document.xml w:p 593 :**

> EX-052 — Broad phase. Les requêtes de sélection, accrochage et intersection filtrent les candidats par emprise spatiale à l’échelle de la vue avant de lancer les tests précis. Pour une petite scène, le balayage simple reste admissible lorsqu’il est plus efficace et correct.

**EX-053 — source word/document.xml w:p 594 :**

> EX-053 — Narrow phase. Les primitives retenues sont testées avec les règles géométriques de référence : extrémité, milieu, intersection, centre, tangente, perpendiculaire, point proche, ortho, parallèle, priorités et tolérances. Une accélération ne change pas les règles de classement et de départage.

**EX-054 — source word/document.xml w:p 595 :**

> EX-054 — Maintien. L’index est cohérent avec la révision source et les états de calques, références et sélections autorisées. Insert/remove/update ciblés sont privilégiés si prouvés efficaces ; reconstruction en worker possible pour grands changements. La requête temps réel peut rester sur le fil principal si elle respecte les mesures de latence.

**EX-055 — source word/document.xml w:p 616 :**

> EX-055 — Fidélité. Le renderer 2D reproduit lignes, arcs, splines, cercles, contours, hachures, cotations, légendes, textes, symboles, calques, transparences, sélection et aperçu, avec un comportement identique des coordonnées et accrochages.

**EX-056 — source word/document.xml w:p 620 :**

> EX-056 — Réutilisation contrôlée. La cible conserve par défaut les capacités fonctionnelles utiles déjà observées (rendu à la demande, batching, WebGL2, WebGPU optionnel, machines de Planche), sous réserve d’audit de conformité. Aucun nouveau moteur 3D n’est présumé nécessaire.

**EX-057 — source word/document.xml w:p 631 :**

> EX-057 — Dégradation sûre. En cas de surcharge, réduire d’abord ombres, effets, anti-crénelage et résolution de présentation. Ne jamais désactiver silencieusement un accrochage indispensable, modifier l’objet enregistré ou assouplir une tolérance géométrique métier pour augmenter le FPS.

**EX-058 — source word/document.xml w:p 632 :**

> EX-058 — Transparence des previews. Un aperçu approximatif (ex. offset ou booléen simplifié) doit rester identifié comme provisoire. La géométrie exacte est calculée et validée avant engagement ; le décalage entre preview et résultat final, s’il dépasse la tolérance, doit être expliqué ou la commande refusée.

**EX-097 — source word/document.xml w:p 965 :**

> EX-097 — Mesure reproductible. Fixer matériel, navigateur/version, mémoire, GPU/driver, taille d’écran, statut des caches, réseau, build, commit, répétitions, opérations, outliers et méthode statistique ; conserver traces et scripts. Les mesures JavaScript renderer.render() ne sont pas assimilées automatiquement au coût GPU, et SwiftShader ne remplace pas un GPU physique.

**EX-098 — source word/document.xml w:p 966 :**

> EX-098 — Double vérification. Tout gain de performance est accompagné d’une comparaison géométrique et fonctionnelle : mêmes cibles de snapping, même sélection, mêmes dimensions/quantités, mêmes objets exportés dans les tolérances, même comportement d’annulation et de conflits.

**EX-099 — source word/document.xml w:p 967 :**

> EX-099 — Adaptativité conditionnée. La dégradation graphique répond aux mesures et aux préférences ; aucune réduction d’effet ne peut affecter les invariants de conception. Le résultat demeure publiable sur données de référence, indépendamment de la qualité instantanée de la prévisualisation.

**INV-007 — source word/document.xml w:p 219, 220 :**

> Une optimisation préserve les résultats métier dans les tolérances déclarées.

**INV-008 — source word/document.xml w:p 221, 222 :**

> Un cache/index/projection est reconstruisible depuis la donnée de référence.

**AC-004 — source word/document.xml w:p 613 :**

> AC-004. Sur un corpus comportant objets superposés, densités variables, intersections et références liées, l’index accéléré doit fournir les mêmes cibles et points d’accrochage (dans la tolérance déclarée) que l’algorithme de référence, avec traces des cas ambigus.

**AC-005 — source word/document.xml w:p 633 :**

> AC-005. Les opérations sélection, orbite, zoom, poussé/tiré et changement de matériau passent les tests de fidélité géométrique avant et après toute optimisation. Les profils GPU sont évalués séparément de mesures faites sous SwiftShader.
