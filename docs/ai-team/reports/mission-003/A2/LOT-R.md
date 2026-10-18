# Dossier de préparation — lot R

Mission(s) du programme #156 : M27/M28. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-012–019, EX-042–044/049, EX-081/082, EX-087–091, EX-096–104 ; INV-001/005/006/011/012/014 ; AC-001–011 selon périmètre**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Sauvegarde/restauration et archives présentes ; migration Studio, transfert d’autorité et recette finale non exécutés.

**Contrat candidat à ratifier :** C-MIGRATION : sourceBuild/schema/corpusHash,objectMapping,transforms,unknowns/losses,identities/history/docs/access checks,rollback target,owner/action/approval. Copie isolée seulement ; writerOwner unique par étude et version, ancienne UI read-only/redirect décision explicite. Pending queue synchronisée/migrée/résolue sans effacement. Build candidat/manifeste/preuves figés, contrôles après déploiement seulement autorisé, backup post-acceptation distinct du préalable.

**Décisions :** DEC-01/02/03/12/14/16/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** Build périmètre A/B/E accepté, C/D nécessaires, X preuves ; G4 et déploiement distincts. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A6 exploitation, A2 mapping, A5 recette, A0 coordination ; utilisateur accepte. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-013/034–036, trois parcours, NAV-001–009. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Perte données/commandes, double writer, rollback aveugle : simulation avant/après et restauration dédiée ; anciennes versions incompatibles refusées. Rollback préserve nouvelles écritures ou résolution explicite, rétention/timers inchangés sans accord.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

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

**EX-042 — source word/document.xml w:p 521 :**

> EX-042 — Cache différencié. Le service worker gère séparément : (a) shell minimal, (b) ressources essentielles d’un profil, (c) modules facultatifs, (d) données métier et file de commandes. Le préchargement complet du build n’est pas considéré comme équivalent au chargement différé, même si le code n’est pas encore exécuté.

**EX-043 — source word/document.xml w:p 522 :**

> EX-043 — Offline véridique. Une capacité n’est annoncée utilisable hors réseau que si les modules, dépendances et données de référence indispensables sont présents et compatibles. Une action exigeant l’autorité centrale peut être préparée localement selon contrat, mais n’est jamais marquée « publiée/approuvée » avant validation centrale.

**EX-044 — source word/document.xml w:p 523 :**

> EX-044 — Versions du cache. Le système conserve la correspondance buildId ↔ toolContractVersion ↔ schemaVersion, protège les commandes en attente et évite qu’une mise à jour invalide une opération locale sans explication. Les politiques d’éviction doivent respecter les limites de quota et préserver prioritairement les données non synchronisées.

**EX-049 — source word/document.xml w:p 557 :**

> EX-049 — Reprise de session. Au retour après interruption, l’interface distingue opérations confirmées, en attente de synchronisation, rejetées/conflictuelles, prévisualisations abandonnées. Les opérations locales possèdent une identité de déduplication et une version de contrat compatibles avec la file de synchronisation.

**EX-081 — source word/document.xml w:p 766 :**

> EX-081 — Ensemble coordonné. Plusieurs disciplines peuvent avoir des numéros de révision différents ; l’ensemble doit être explicitement coordonné et figé. Une modification après approbation remet en question l’éligibilité du nouveau dossier, pas l’intégrité de la publication historique.

**EX-082 — source word/document.xml w:p 767 :**

> EX-082 — Publication non réécrite. Retrait, remplacement ou nouvelle diffusion sont de nouveaux événements journalisés ; la publication antérieure demeure identifiable.

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

**INV-005 — source word/document.xml w:p 215, 216 :**

> Une opération rejetée ne modifie pas partiellement les données canoniques.

**INV-006 — source word/document.xml w:p 217, 218 :**

> Un résultat dérivé ancien est identifiable et n’écrase pas le résultat courant.

**INV-011 — source word/document.xml w:p 227, 228 :**

> Les annulations concurrentes ne détruisent pas silencieusement le travail d’un autre acteur.

**INV-012 — source word/document.xml w:p 229, 230 :**

> Une publication antérieure n’est pas réécrite par la création d’une nouvelle publication.

**INV-014 — source word/document.xml w:p 233, 234 :**

> Le mode hors connexion différencie travail local, confirmation serveur et droits à reverifier.

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
