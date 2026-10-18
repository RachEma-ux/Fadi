# Dossier de préparation — lot F

Mission(s) du programme #156 : M25. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-031, EX-056–058, EX-071–073, EX-092–099 ; INV-007/009/010 ; AC-007**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Renderer/WebGPU optionnel et assistant contrôlé présents ; extensions/MCP/immersion avancée ne sont pas réputés Studio disponibles.

**Contrat candidat à ratifier :** C-EXTENSION : provider/version/provenance/trust,permissions/deps,contract compatibility,update/support. C-MCP intentions mêmes schémas/droits/idempotence/confirmations/journal, aucun réseau par pointeur. IA media provenance/service/consentement/coût, source révision et statut vérification ; jamais pixels→métrés.

**Décisions :** DEC-08/15/17/18. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** Option explicitement retenue ; X risques/coûts/licences ; contrats B/A/D/E concernés. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A2/A1/A4/A5 ; A3/A6 seulement option autorisée. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-025/026/032/033 et tests option retenue. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Exfiltration, droits contournés, coût : option exclue/reportée visible non livrée. Rollback désactivation adaptateur sans perte de modèle/profils, retrait version d’extension avec compatibilité lecture.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-031 — source word/document.xml w:p 465 :**

> EX-031 — Extensibilité sûre. La déclaration d’extension indique provenance, version, signature ou mécanisme de confiance choisi, permissions demandées, dépendances, mises à jour et support. « Trouvé dans le Registry » ne signifie pas « autorisé à charger/écrire ». Les extensions tierces restent une décision ouverte.

**EX-056 — source word/document.xml w:p 620 :**

> EX-056 — Réutilisation contrôlée. La cible conserve par défaut les capacités fonctionnelles utiles déjà observées (rendu à la demande, batching, WebGL2, WebGPU optionnel, machines de Planche), sous réserve d’audit de conformité. Aucun nouveau moteur 3D n’est présumé nécessaire.

**EX-057 — source word/document.xml w:p 631 :**

> EX-057 — Dégradation sûre. En cas de surcharge, réduire d’abord ombres, effets, anti-crénelage et résolution de présentation. Ne jamais désactiver silencieusement un accrochage indispensable, modifier l’objet enregistré ou assouplir une tolérance géométrique métier pour augmenter le FPS.

**EX-058 — source word/document.xml w:p 632 :**

> EX-058 — Transparence des previews. Un aperçu approximatif (ex. offset ou booléen simplifié) doit rester identifié comme provisoire. La géométrie exacte est calculée et validée avant engagement ; le décalage entre preview et résultat final, s’il dépasse la tolérance, doit être expliqué ou la commande refusée.

**EX-071 — source word/document.xml w:p 717 :**

> EX-071 — Provenance des médias. Les rendus conservent modèle/variante/révision source, caméra, paramètres, auteur, date et empreintes si disponibles. Les traitements IA ajoutent service/fournisseur, version si connue, sources envoyées, restrictions de droits, consentement ou autorisation de transfert lorsque requis, coûts/quotas et résultat.

**EX-072 — source word/document.xml w:p 718 :**

> EX-072 — Reproductibilité honnête. Conserver les paramètres et une image historique ne garantit pas la reproduction identique d’une génération IA. Les inconnues du fournisseur sont signalées comme telles.

**EX-073 — source word/document.xml w:p 719 :**

> EX-073 — Séparation visuel/technique. Les quantités, performances et règles métier se calculent sur les objets et données de référence, jamais sur les pixels d’une illustration. Un matériau apparent ne change pas automatiquement la composition constructive.

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

**INV-007 — source word/document.xml w:p 219, 220 :**

> Une optimisation préserve les résultats métier dans les tolérances déclarées.

**INV-009 — source word/document.xml w:p 223, 224 :**

> Un profil personnalisé ne change ni données, ni droits, ni révision de conception.

**INV-010 — source word/document.xml w:p 225, 226 :**

> Une requête IA ou extension passe par les mêmes validations centrales qu’une action humaine.

**AC-007 — source word/document.xml w:p 722 :**

> AC-007. Générer une illustration ne change ni les dimensions, ni les propriétés BIM, ni la révision du modèle source. La publication d’une illustration indique son statut de vérification et sa source.
