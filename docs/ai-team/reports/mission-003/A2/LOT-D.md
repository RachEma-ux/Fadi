# Dossier de préparation — lot D

Mission(s) du programme #156 : M23. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-059–063, EX-016/045/049/095/097 ; INV-005/006/008 ; IF-003 ; AC-006**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Worker exact différé existant ; erreur rejette pending puis fil=null sans recréation. Manquent lifecycle complet, timeout/quota/reprise et preuve stale.

**Contrat candidat à ratifier :** C-JOB : jobId,kind,scope,inputHash,sourceRevision,priority,quota,state,resultRef,metrics,error ; états queued/running/cancelRequested/cancelled/succeeded/failed/timedOut/stale. Résultat vérifie source/droits avant commit. Ownership buffers transférés explicite, worker crash rejette tous pending puis nouvelle instance contrôlée ; pas OCCT par outil.

**Décisions :** DEC-07/11/13/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** A commande/sourceRevision ; B loader ; X mesures ; M02 pour intégration. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A6 calcul, A2 protocole, A3 après accord, A5. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-014/015/037. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Résultat ancien, attente éternelle, fuite : timeout et cancellation sans succès précoce, budgets DEC13. Rollback service lourd indisponible explicite + modèle intact ; préserver job historique pour diagnostic sans données privées.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-059 — source word/document.xml w:p 636 :**

> EX-059 — Isolation du calcul lourd. Le fil principal assure événements, retours immédiats et rendu. Les opérations susceptibles de bloquer durablement l’interaction (géométrie exacte, reconstruction d’index volumineux, tessellation massive, export) sont candidates à un worker ou au serveur, à choisir sur mesure.

**EX-060 — source word/document.xml w:p 637 :**

> EX-060 — Ordonnanceur commun. Chaque tâche possède jobId, domaine, priorité, révision source, empreinte d’entrée, limite de concurrence, état, stratégie d’annulation, journal d’erreur et pointeur de résultat. L’ordonnanceur ne doit pas supposer qu’un worker par cœur logique est optimal.

**EX-061 — source word/document.xml w:p 665 :**

> EX-061 — Échec worker. L’échec rejette les tâches affectées, libère le worker défaillant, préserve le modèle et propose la relance sous contrôle. Un mécanisme de recréation du worker spécialisé doit être spécifié et testé ; les requêtes pending ne restent pas bloquées indéfiniment.

**EX-062 — source word/document.xml w:p 666 :**

> EX-062 — Mémoire WASM. Suivre taille compressée transférée, instance compilée, allocations WASM et mémoire résidente après traitement ; conserver un noyau chargé tant que le coût de maintien est justifié. L’initialisation simultanée de plusieurs OCCT requiert une preuve de gain et de mémoire acceptable.

**EX-063 — source word/document.xml w:p 667 :**

> EX-063 — Transfert d’objets. Les grands tableaux typés peuvent être transférés sans copie seulement lorsque le protocole établit la propriété du tampon et sa durée de vie. Les messages applicatifs restent validés même s’ils proviennent d’un worker « interne ».

**EX-016 — source word/document.xml w:p 328 :**

> EX-016 — Fraîcheur. Les contenus dérivés doivent afficher à jour pour révision R, à recalculer, en calcul, échec ou non applicable, selon leur contrat. « Dernière image produite » ne signifie pas nécessairement « état courant ».

**EX-045 — source word/document.xml w:p 552 :**

> EX-045 — Prévisualisation distincte. Un appel d’essai ne produit pas de mutation permanente. La réponse peut fournir géométrie, contraintes et avertissements, avec portée de validité de révision. Un calcul prévisualisé et non confirmé est révoqué sans effets de référence.

**EX-049 — source word/document.xml w:p 557 :**

> EX-049 — Reprise de session. Au retour après interruption, l’interface distingue opérations confirmées, en attente de synchronisation, rejetées/conflictuelles, prévisualisations abandonnées. Les opérations locales possèdent une identité de déduplication et une version de contrat compatibles avec la file de synchronisation.

**EX-095 — source word/document.xml w:p 911 :**

> EX-095 — Observabilité. Des mesures agrégées de latence, de mémoire, d’erreurs et de tâches doivent permettre de détecter une dégradation de service sans enregistrer inutilement les géométries confidentielles ou des secrets d’accès. Les traces sont corrélées par identifiants non sensibles de commande/job.

**EX-097 — source word/document.xml w:p 965 :**

> EX-097 — Mesure reproductible. Fixer matériel, navigateur/version, mémoire, GPU/driver, taille d’écran, statut des caches, réseau, build, commit, répétitions, opérations, outliers et méthode statistique ; conserver traces et scripts. Les mesures JavaScript renderer.render() ne sont pas assimilées automatiquement au coût GPU, et SwiftShader ne remplace pas un GPU physique.

**INV-005 — source word/document.xml w:p 215, 216 :**

> Une opération rejetée ne modifie pas partiellement les données canoniques.

**INV-006 — source word/document.xml w:p 217, 218 :**

> Un résultat dérivé ancien est identifiable et n’écrase pas le résultat courant.

**INV-008 — source word/document.xml w:p 221, 222 :**

> Un cache/index/projection est reconstruisible depuis la donnée de référence.

**IF-003 — source word/document.xml w:p 200 :**

> IF-003 — Calcul lourd (exemple booléen). ① collecte des paramètres ; ② capture immuable de l’identifiant de révision ; ③ soumission au gestionnaire de tâches ; ④ worker/WASM ou service serveur ; ⑤ retour résultat + révision source + métriques ; ⑥ vérification du contexte et des droits ; ⑦ engagement transactionnel explicite ; ⑧ mise à jour des projections. Un résultat ancien peut être conservé à titre historique, pas appliqué à une révision plus récente.

**IF-007 — source word/document.xml w:p 664 :**

> IF-007 — Statuts des jobs. queued → loading → running → completed, avec branches cancel_requested, cancelled, failed, superseded, timed_out. Une demande d’annulation n’équivaut pas immédiatement à un arrêt matériel ; le résultat d’une tâche finalement terminée après annulation ne peut être engagé sans nouvelle vérification.

**AC-006 — source word/document.xml w:p 670 :**

> AC-006. Échec forcé d’OCCT/WASM pendant une opération : aucune mutation partielle, retour d’erreur intelligible, tâches en attente résolues explicitement, possibilité de relance sans doublons et sans perte de la révision courante.
