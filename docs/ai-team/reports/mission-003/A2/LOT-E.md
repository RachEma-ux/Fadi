# Dossier de préparation — lot E

Mission(s) du programme #156 : M24. Référence PR #165 `a09c11d397c8527987c3d1c4410ebb2eb240a819`. Statut : spécifié proposé, non implémenté/non vérifié/non accepté par ce dossier.

**Sources exactes :** RT001 DOCX blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, fiches exactes A1 (word/document.xml paragraphes/cellules), plan STUDIO-PLAN-001/checklist STUDIO-TASKS-001 verrouillés. Identifiants applicables : **EX-064–088, EX-090–094 ; INV-001/004/006/010/012 ; IF-008/009/010 ; AC-007–010**. Ces plages désignent chaque ID inclus, ne réécrivent pas leur texte ; consulter les fiches A1 pour le libellé canonique et son contrat de preuve. Obligations transverses X continuent à s'appliquer.

**Existant / manquant :** Quantités/documents/IFC import représentations, versions et publications Atelier existent ; observation/review multi-sources Studio et séparation approbation/publication non prouvées.

**Contrat candidat à ratifier :** C-QUANTITY=IF008 sources/ruleVersion/unit/raw/deductions/display/freshness, override séparé. C-OBSERVATION=IF010 issueId unique,source/rule/revisions/objects/owner/status/recheck, clôture par rôle habilité. C-PUBLICATION=IF009 ensemble documents/version/hash + sources/règles + décision portant exact manifeste, approve≠publish. EX079 matrice format/version/entité/sens, rapport pertes EX080 ; IFC proxy≠BIM paramétrique/certifié.

**Décisions :** DEC-02/03/16/18 ; DEC15/17 seulement options. Alternatives/options/preuves dans registre A1, aucune DEC fermée ici.

**Dépendances par livrable :** A modèles révisés, B permissions, X corpus ; I quatre domaines. Préparation indépendante autorisée ; pas besoin de clôturer une mission transversale entière pour recevoir son contrat.

**Propriétaire :** A1 métier/BIM-documentation, A2 contrats, A4 UX ; A3 après accord ; A5. A0 réserve fichiers partagés avant édition ; un éditeur de App/AppShell/schema/catalogue/queue à la fois. A2 ne modifie pas dossiers A1/A4/A5/A6.

**Tests / critères :** TEST-009/010/018/026–032/035/038. Chaque attendu canonique exige positif, refus/échec, limites/permissions/unités/concurrence applicables ; rapport par build/commit, corpus/version/empreinte, environnement, commande, résultat et lien stable. Les scénarios non disponibles restent non exécutés ; présence d'un test ou contrat n'est pas conformité. Couverture A1 exigences et A5 preuves se croisent, sans nouvelle numérotation des 630 tâches.

**Risques / retour arrière :** Publication périmée, contrôle non exécuté confondu conforme : état travail/diffusion/fraîcheur distinct. Rollback retrait/remplacement journalisé sans effacer ancien manifeste, médias IA sans mutation technique.

**Autorisation :** préparation documentaire exécutée seulement. Réalisation bloquée `AUTORISATION_REQUISE` pour sous-lot borné après G0→G1→preuves G2→G3 applicable. Aucun POC/code/DB/admin/fusion/déploiement autorisé par ce dossier. Migrations/opérations destructives/déploiement/administration requièrent autorisations distinctes. A3 reste inactif. Avant essai API/E2E, cible et garde M02 vérifiées. Atelier actuel, 21 étapes et fonctions industrielles conservés.

**Prochaine action exacte :** A0 confronte ce dossier aux fiches exactes A1, aux contrats NAV A4 et aux tests A5, fait arbitrer les DEC du périmètre puis soumet l'autorisation précise. Ne pas cocher la checklist source.

## Renvois exacts au corpus normatif (pas une nouvelle norme)

Les citations suivantes sont celles des fiches A1 extraites du blob RT001 indiqué. Une obligation peut concerner plusieurs lots ; la répétition ne compte pas comme réalisation supplémentaire. Leur statut reste celui du document source, proposé à validation.

**EX-064 — source word/document.xml w:p 673 :**

> EX-064 — Identité BIM. Un objet architectural possède type, paramètres, niveau, hôtes, relations, propriétés et provenance. Les paramètres de conception (épaisseur, implantation), les propriétés techniques (composition, performances) et les styles de représentation (couleur, texture) sont trois catégories indépendantes.

**EX-065 — source word/document.xml w:p 674 :**

> EX-065 — Exigence vs mesure. Une exigence versionnée (ex. surface programmée de 28 m²) ne change pas lorsque la surface modélisée devient 26 m² ; l’interface présente explicitement l’écart. La modification d’exigence passe par sa propre commande, avec permission et provenance.

**EX-066 — source word/document.xml w:p 676 :**

> EX-066 — Sources partenaires. Chaque modèle externe conserve auteur, discipline, format, version, unité, transformation et état d’acceptation. Le remplacement d’une référence suit réception → vérification → comparaison → acceptation/rejet, et n’efface pas la référence d’une publication passée.

**EX-067 — source word/document.xml w:p 677 :**

> EX-067 — Éditabilité explicite. Un modèle consulté, fédéré ou utilisé comme référence n’est pas déclaré natif et paramétrique sans conversion validée. Les éléments ignorés, simplifiés ou non convertibles sont signalés.

**EX-068 — source word/document.xml w:p 695 :**

> EX-068 — Conclusion normative. Les valeurs de contrôle sont conforme, non conforme, non testé, non applicable justifié. Le statut d’exécution (en attente, échec technique) ne doit jamais être interprété comme conforme.

**EX-069 — source word/document.xml w:p 696 :**

> EX-069 — Observation unique. Une anomalie issue d’un contrôle possède un issueId réutilisé par le suivi documentaire. Le réexamen d’une même anomalie sur une nouvelle révision rapproche les observations existantes selon une règle explicite, pas par création systématique de doublons.

**EX-070 — source word/document.xml w:p 697 :**

> EX-070 — Clôture. La déclaration de correction par un concepteur ne clôt pas à elle seule une observation. Un recontrôle par le rôle autorisé produit une conclusion liée à une nouvelle révision. La suppression de l’objet problématique ne prouve pas à elle seule la résolution.

**EX-071 — source word/document.xml w:p 717 :**

> EX-071 — Provenance des médias. Les rendus conservent modèle/variante/révision source, caméra, paramètres, auteur, date et empreintes si disponibles. Les traitements IA ajoutent service/fournisseur, version si connue, sources envoyées, restrictions de droits, consentement ou autorisation de transfert lorsque requis, coûts/quotas et résultat.

**EX-072 — source word/document.xml w:p 718 :**

> EX-072 — Reproductibilité honnête. Conserver les paramètres et une image historique ne garantit pas la reproduction identique d’une génération IA. Les inconnues du fournisseur sont signalées comme telles.

**EX-073 — source word/document.xml w:p 719 :**

> EX-073 — Séparation visuel/technique. Les quantités, performances et règles métier se calculent sur les objets et données de référence, jamais sur les pixels d’une illustration. Un matériau apparent ne change pas automatiquement la composition constructive.

**EX-074 — source word/document.xml w:p 725 :**

> EX-074 — Chaîne documentaire. Vue → Feuille → Dossier → Publication constitue le cycle des livrables. Une Planche est un environnement de travail ; une feuille est un assemblage de représentations et annotations à une échelle et un format déclarés.

**EX-075 — source word/document.xml w:p 726 :**

> EX-075 — Sources des vues. Chaque vue conserve les révisions sources, niveau/repère, cadrage, échelle de présentation, visibilité, styles et annotations propres. Une vue dérivée du 3D peut devenir périmée après modification du modèle ; ses annotations propres ne deviennent pas des paramètres de l’objet source.

**EX-076 — source word/document.xml w:p 727 :**

> EX-076 — Documents indépendants. Un dessin de détail créé directement en 2D peut être publié conjointement avec des documents dérivés d’une maquette sans être présenté comme un extrait automatiquement synchronisé.

**EX-077 — source word/document.xml w:p 729 :**

> EX-077 — Traçabilité des calculs. Chaque quantité comprend identifiant du jeu de sources, révision, règle et sa version, unité, objets inclus, exclusions, déductions, précision interne, arrondi de présentation et date. Un override manuel constitue une donnée distincte motivée, jamais le remplacement silencieux d’un calcul.

**EX-078 — source word/document.xml w:p 730 :**

> EX-078 — Cohérence des totaux. Une somme ne mélange pas sans signalement des quantités de règles incompatibles, d’unités différentes ou de révisions hétérogènes. Les totaux distinguent brut, net, déductions, quantités non testées et corrections manuelles.

**EX-079 — source word/document.xml w:p 762 :**

> EX-079 — Capacité par sens d’échange. lecture, consultation, édition, export, aller-retour sont évalués séparément. Aucun simple export IFC ou DXF ne suffit à prouver un round-trip fidèle ; aucune certification n’est affirmée sans audit correspondant.

**EX-080 — source word/document.xml w:p 763 :**

> EX-080 — Rapport de transformation. Import et export signalent unités et repères, primitives non prises en charge, propriétés perdues, simplifications, conflits d’identifiants et éléments ignorés. Une source non prise en charge ne disparaît pas sans information.

**EX-081 — source word/document.xml w:p 766 :**

> EX-081 — Ensemble coordonné. Plusieurs disciplines peuvent avoir des numéros de révision différents ; l’ensemble doit être explicitement coordonné et figé. Une modification après approbation remet en question l’éligibilité du nouveau dossier, pas l’intégrité de la publication historique.

**EX-082 — source word/document.xml w:p 767 :**

> EX-082 — Publication non réécrite. Retrait, remplacement ou nouvelle diffusion sont de nouveaux événements journalisés ; la publication antérieure demeure identifiable.

**EX-083 — source word/document.xml w:p 814 :**

> EX-083 — Séparation des décisions. Approuver et publier sont deux permissions différentes. Un administrateur technique n’obtient pas automatiquement la fonction d’approbateur métier. Un cumul de rôles peut être autorisé selon taille d’équipe, mais un autocontrôle doit rester identifié comme tel.

**EX-084 — source word/document.xml w:p 815 :**

> EX-084 — Observations/tâches/décisions. Une annotation est une note ; une observation décrit un constat ; une tâche attribue une action à un responsable ; une décision enregistre un arbitrage. Ces objets sont reliables mais ne se substituent pas l’un à l’autre.

**EX-085 — source word/document.xml w:p 816 :**

> EX-085 — Délégation contrôlée. L’absence d’un approbateur ne vaut pas accord. Une délégation, si permise, possède portée, période, délégant/délégué, justification et événement d’audit.

**EX-086 — source word/document.xml w:p 820 :**

> EX-086 — Réexamen. Un contrôle de nouvelle révision rapproche les observations antérieures par identité/source/règle et produit un statut de suivi ; la fermeture automatique sur simple disparition d’un objet est interdite.

**EX-087 — source word/document.xml w:p 864 :**

> EX-087 — Intégration contrôlée. Les modules Fadi existants restent responsables des données transverses qu’ils possèdent. Tout nouvel endpoint nécessite un contrôle de droit tenant/projet, de schéma, de révision, d’idempotence, de taille d’entrée et de journal.

**EX-088 — source word/document.xml w:p 865 :**

> EX-088 — Isolation multi-utilisateurs. Le système interdit l’accès aux documents, profils et variantes d’un autre périmètre sans autorisation. Les URL de blob, résultats de jobs et exports temporairement accessibles sont soumis à l’autorisation de l’objet source.

**EX-090 — source word/document.xml w:p 869 :**

> EX-090 — Reconstruction. Une restauration doit permettre de retrouver le modèle canonique confirmé, les manifestes et leurs pièces, les références, les droits applicables et les identités des documents. Les caches GPU et index spatiaux sont reconstruits, non sauvegardés comme preuve faisant autorité.

**EX-091 — source word/document.xml w:p 872 :**

> EX-091 — Migration non destructrice. Une étude existante ne doit pas perdre une propriété, une cote, une association, un identifiant documentaire, une révision ou un accès sans rapport explicite, procédure d’accord et solution de restauration. Toute bascule définit des jeux d’essai d’avant/après et un point de retour arrière.

**EX-092 — source word/document.xml w:p 906 :**

> EX-092 — Protection par défaut. Chaque mutation et lecture sensible passe par identification de session, autorisation dans le contexte et validation des entrées. La sécurité client sert à guider l’UX, jamais à remplacer le serveur.

**EX-093 — source word/document.xml w:p 907 :**

> EX-093 — Intégrité des modèles. Les commandes et opérations de géométrie vérifient contraintes, types, unités et appartenance. Le serveur refuse les mutations qui violeraient les invariants, même si l’outil client les présente comme valides.

**EX-094 — source word/document.xml w:p 908 :**

> EX-094 — Confidentialité des sources. Les rendus, fichiers importés, modèles de références et images adressés à un service externe ne le sont qu’au terme d’un contrôle de politique, avec conservation de la provenance et signalement des informations inconnues.

**INV-001 — source word/document.xml w:p 207, 208 :**

> Une approbation référence exactement les éléments présentés à la décision.

**INV-004 — source word/document.xml w:p 213, 214 :**

> Une exigence approuvée reste distincte du résultat de conception.

**INV-006 — source word/document.xml w:p 217, 218 :**

> Un résultat dérivé ancien est identifiable et n’écrase pas le résultat courant.

**INV-010 — source word/document.xml w:p 225, 226 :**

> Une requête IA ou extension passe par les mêmes validations centrales qu’une action humaine.

**INV-012 — source word/document.xml w:p 229, 230 :**

> Une publication antérieure n’est pas réécrite par la création d’une nouvelle publication.

**IF-008 — source word/document.xml w:p 731 :**

> IF-008 — Résultat quantitatif. quantityId + sourceRevisionSet + ruleId + ruleVersion + sourceObjectIds + unit + rawValue + deductions + displayValue + freshnessStatus ; manualAdjustment est facultatif, distinct, motivé et attribué. La décision de structure physique reste ouverte.

**IF-009 — source word/document.xml w:p 765 :**

> IF-009 — Publication. Le manifeste contient : identifiant, intention/usage, date, auteur, état d’approbation, liste ordonnée de documentId + version + empreinte, références de modèles et de règles, rapports de contrôle et observations bloquantes résolues ou dérogées, ainsi que la décision d’approbation sur cet ensemble exact.

**IF-010 — source word/document.xml w:p 819 :**

> IF-010 — Observation. Champs : issueId, catégorie, source du contrôle, révisions examinées, objets/vues, auteur, gravité selon règles décidées, description et pièces justificatives, responsable éventuel, état, journal de décisions, références des recontrôles et condition de clôture. Les identifiants BCF éventuels sont conservés comme références, non assimilés automatiquement aux identifiants internes.

**AC-007 — source word/document.xml w:p 722 :**

> AC-007. Générer une illustration ne change ni les dimensions, ni les propriétés BIM, ni la révision du modèle source. La publication d’une illustration indique son statut de vérification et sa source.

**AC-008 — source word/document.xml w:p 732 :**

> AC-008. Dans le test de référence du mur, les objets et révisions permettent de retrouver exactement les déductions 0,420 m³ puis 0,504 m³ et les volumes nets 3,180 m³ puis 3,096 m³. Les résultats historiques conservent leur source initiale.

**AC-009 — source word/document.xml w:p 768 :**

> AC-009. Modifier un document après approbation puis tenter de publier sous l’ancienne décision provoque un blocage ou une demande de nouvel examen, avec comparaison explicite des empreintes concernées.

**AC-010 — source word/document.xml w:p 817 :**

> AC-010. Un concepteur sans droit d’approbation peut afficher l’outil par recherche mais reçoit un refus d’exécution. La modification de son profil personnel n’influe pas sur le contrôle serveur.
