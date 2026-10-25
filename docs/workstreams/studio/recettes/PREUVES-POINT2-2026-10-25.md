# Point 2 — tests des preuves partielles ou réfutées — 25 octobre 2026

Six groupes ont repris les 196 obligations dont la preuve était partielle ou avait été réfutée au rapprochement du 25 octobre. Ils travaillaient en parallèle, sous délégation du maître d'ouvrage ([ADR-STUDIO-PILOTE-01](../../../continuity/decisions/ADR-STUDIO-PILOTE-01.md)).

Pour chaque obligation, le groupe a lu son critère exact. Si la fonction existe, il a écrit le test, vérifié qu'il échoue quand on casse le comportement visé, puis consigné le libellé exact. Sinon, il a classé l'obligation.

Chaque libellé cité a été relu mot pour mot, dans son fichier ou dans le journal de la recette. Les 22 recettes concernées passent sur une base neuve, avec 1 642 contrôles et aucun échec ; elles sont branchées en CI.

| Verdict | Nombre |
|---|---:|
| VERIFIE | 76 |
| PARTIEL | 24 |
| DECISION | 35 |
| ABSENT | 50 |
| MESURE | 9 |
| DOCUMENT | 2 |

Les 76 obligations VERIFIE passent à « Vérifié ». Les deux DOCUMENT ne sont pas retenues (A.2-09 renvoie au registre lui-même, D.2-04 à une issue hors dépôt). Les autres gardent leur statut, et leur `suite` porte le manque exact.

## Défauts trouvés et corrigés

Une publication diffusée n'était protégée par la base que contre la suppression (EX-082, INV-012) : la réécrire restait possible. Le déclencheur `studio_publications_package_frozen` refuse désormais toute réécriture directe du paquet, du manifeste, de la révision, des empreintes, de l'approbation et de la diffusion. Une publication restaurée et remise « non diffusée » reste actualisable.

Les autres défauts :

- **EX-087** : un corps de requête trop volumineux renvoyait 500. Il renvoie maintenant 413 `payload_too_large`.
- **EX-078** : une quantité exprimée dans une autre unité que sa grandeur était additionnée. Elle est maintenant « non évaluée », et le total est partiel.
- **EX-047** : l'historique local tronquait sans le dire au-delà de 200 états. La borne est maintenant affichée dans la barre d'état.
- **I.5-03** : en plein écran, aucune sortie n'était visible. Le bouton « Quitter le plein écran » est ajouté.
- **Écriture de commandes sans variante** : elle n'était pas refusée explicitement. Une garde renvoie maintenant 404 avant toute lecture.
- **Schéma Drizzle** : il est aligné sur `init.sql`, qui déclarait deux clés étrangères absentes du schéma.

## Écarts du registre relevés (à traiter avant G1)

- **Libellés introuvables** : 57 des 738 libellés de contrôle cités par le registre n'apparaissent pas mot pour mot dans leur fichier. Ils concernent 41 obligations, dont NAV-002 à 008, REC-I-02, A.1-06, REC-A-03, X.4-01 et E.1-04 (groupe D1).
- **Preuves incomplètes** : 92 des obligations « Vérifié » n'ont aucune preuve par test ou recette, et 577 preuves n'ont ni commit, ni URL d'exécution, ni date, ni environnement (X.5-02).
- **Suites périmées** : plusieurs `suite` datent d'avant les lots F1 à F5, par exemple TR-EX-015, A.4-05, TR-EX-054, TR-EX-067, TR-EX-083 et TR-EX-099.

## Décisions requises (maître d'ouvrage ou délégation)

| ID | Motif |
|---|---|
| A.1-08 | Critère sans liste close : « les API/adaptateurs nécessaires » doivent être énumérés par le maître d'ouvrage (ou le chef de projet) pour être confrontés aux routes testées ; les routes étude / variante / révision / commandes / publications / dossiers / modèles… |
| ARC-03 | Aucune interface publique d'authentification / résolution du projet n'est définie (l'ADR-STUDIO-NAV-01 ne cite que la façade proposée par A4) ; la définir est un choix d'architecture cible (CLAUDE.md : ne pas l'inventer). |
| ARC-05 | Le critère exige de décider extractions et noms de paquets après l'audit COEX-01, toujours « En cours » : décision humaine. |
| BLOC-06 | Le blocage effectif d'une livraison à la porte G4 (G4-02 « À faire ») est une décision de livraison du maître d'ouvrage, non automatisable. |
| CAD-07 | Le maintien de chaque fonction industrielle utile suppose un inventaire qualifié rapproché (COEX-01 reste une proposition sur 22 composants) : décision du maître d'ouvrage sur cet inventaire, aucun test ne peut le remplacer. |
| E.6-04 | Le critère « selon leurs propres contrats et preuves » demande un contrat par format (DWG, BCF, STEP/OBJ/STL…). Aucun n'existe ; les tests montrent seulement des entrées « non livré » avec raison et source. Écrire ces contrats (ou y renoncer, comme D-179 pour … |
| F.1-01 | Il faut une règle générale (gain ET non-régression pour toute accélération supplémentaire) ; DEC-08 / DEC-09 sont partielles : décision du maître d'ouvrage. |
| F.3-04 | TEST-025 non écrit, TEST-032/033 bloqués, TEST-035 partiel : les options du lot F attendent leurs décisions propres (M002-D02) avant tout dossier de tests F. |
| G2-04 | Appliquer l'étiquette lecture statique / test prescrit / scénario exécuté à CHAQUE preuve du dossier G2 est un travail sur le registre (docs/workstreams/, hors de ce groupe) et une revue humaine ; aucun test de ce groupe ne le prouve. |
| MIG-COEX-04 | « Ne jamais supprimer » est contredit par des vidages déjà livrés et admis par local-store-migration.test.ts (v6 studioBrouillons / studioContextes sans propriétaire, v7 lots sans propriétaire) et par l'oubli d'un projet devenu inaccessible : le maître d'ouvra… |
| MIG-COEX-07 | La règle COEX-06 est « accueillie sous réserve de ratification » dans ADR-STUDIO-NAV-01 : ratification du maître d'ouvrage. |
| PASS-01 | La traçabilité est maintenant vérifiée (G1-02), mais l'ordre « avant le premier engagement » est un constat historique que seul le maître d'ouvrage peut acter. |
| PIL-01 | Les outils usuels du périmètre ratifié reposent sur P-08 (PIL-02), non consigné : ratification du maître d'ouvrage. |
| REC-A-01 | Schémas (studio-document/1), contrat versionné (studio-commands/1), API, éditeurs 2D/3D et journal sont livrés et testés. Le « corpus de migration » n'existe pas : DEC-03 exclut la migration des projets existants et il n'y a qu'un format Studio ; décider s'il … |
| REC-C-01 | Cibles, points (mode, priorité) et géométrie 3D sont comparés avant / après optimisation. Les cotes (measureStudioDimension) et les exports SVG / DXF / IFC sont calculés sur le serveur directement depuis le document, sans index ni cache de maillage : il n'exis… |
| REC-E-03 | Le « résultat utile des trois parcours » attend la recette utilisateur du maître d'ouvrage. Le scénario chaîné sur une même étude (contrôle, écart, correction, nouveau contrôle satisfait, approbation, diffusion) n'est pas écrit. |
| REC-I-01 | Aucune « maquette d'interaction » n'existe ni n'a été validée ; la validation relève d'une recette utilisateur / décision du maître d'ouvrage (R.3-01). Aucun test ne la remplace. |
| REC-I-03 | Acte d'acceptation du lot I (restreinte « intégration technique » ou pleine) absent ; décision humaine. Les conditions techniques sont désormais aussi couvertes par studio-preuves-d1.mjs (I.1-01, I.2-01, I.3-02, I.5-02 à I.5-04). |
| SUIVI-01 | La branche distante automation/studio-checklist-daily reste à qualifier (permanente ou non) par le maître d'ouvrage. |
| SUIVI-06 | HANDOFF.md est périmé (base main@3e992b6, sans P-08/P-09) : sa mise à jour relève de l'orchestrateur (docs/workstreams hors de ce groupe) ; aucun test ne le couvre. |
| TR-EX-013 | Provenance et absence de propagation implicite (dans les deux sens) sont prouvées. Le cas prescrit « nouvelles identités » contredit la conception livrée : la dérivation garde les identifiants d'objets, l'identité étant portée par la paire (variante, objet) — … |
| TR-EX-036 | Le critère renvoie lui-même aux « spécifications UX » pour les chemins alternatifs aux gestes : aucune spécification n'existe, donc aucun contrôle ne peut échouer sur un geste sans alternative. En plus, la bascule Planche 2D ⇄ 3D ne déplace pas le focus (Varia… |
| TR-EX-046 | Aucune politique explicite de conservation des événements sensibles (durées, purge) côté serveur : à décider (maître d'ouvrage, DPO). La minimisation côté client existe et est testée (journal-correlation : controlerJournal refuse secrets, courriels et géométri… |
| TR-IF-002 | Négatif couvert (Échap sans mutation). Le positif exige de contrôler la valeur engagée « dans la tolérance contractuelle » : aucune tolérance contractuelle n'est déclarée pour le geste Ligne (ni dans le registre, ni dans le contrat studio-commands/1). Fixer ce… |
| TR-INV-003 | Le cas positif prescrit (« cloner une variante avec de nouvelles identités ») contredit le modèle actuel : la dérivation de variante (POST /studies/:s/variants { fromVariantId }) garde volontairement les identifiants d'objets (comparaison entre variantes, prov… |
| TR-INV-010 | Aucun chemin de requête IA ou d'extension n'existe (agentExposure: none sur tout le registre) : par décision (F.2-03 « aucun mode IA retenu », acceptée par P-06, RECETTE-PILOTE-2026-10-25.md), il n'y a rien à distinguer d'une action humaine. Le critère ne devi… |
| X.1-01 | Corpus constitué, déterministe et contrôlé contre son oracle en CI, mais non « autorisé » : sa licence reste « à valider par le maître d'ouvrage » (corpus.test.ts l'impose) et aucun contrat données / commandes n'est adopté pour l'adapter. Couverture incomplète… |
| X.1-02 | Corpus constitué, déterministe et contrôlé contre son oracle en CI, mais non « autorisé » : sa licence reste « à valider par le maître d'ouvrage » (corpus.test.ts l'impose) et aucun contrat données / commandes n'est adopté pour l'adapter. Couverture incomplète… |
| X.1-03 | Corpus constitué, déterministe et contrôlé contre son oracle en CI, mais non « autorisé » : sa licence reste « à valider par le maître d'ouvrage » (corpus.test.ts l'impose) et aucun contrat données / commandes n'est adopté pour l'adapter. Couverture incomplète… |
| X.1-04 | Corpus constitué, déterministe et contrôlé contre son oracle en CI, mais non « autorisé » : sa licence reste « à valider par le maître d'ouvrage » (corpus.test.ts l'impose) et aucun contrat données / commandes n'est adopté pour l'adapter. Couverture incomplète… |
| X.1-05 | Corpus constitué, déterministe et contrôlé contre son oracle en CI, mais non « autorisé » : sa licence reste « à valider par le maître d'ouvrage » (corpus.test.ts l'impose) et aucun contrat données / commandes n'est adopté pour l'adapter. Couverture incomplète… |
| X.1-06 | Corpus constitué, déterministe et contrôlé contre son oracle en CI, mais non « autorisé » : sa licence reste « à valider par le maître d'ouvrage » (corpus.test.ts l'impose) et aucun contrat données / commandes n'est adopté pour l'adapter. Couverture incomplète… |
| X.1-07 | Corpus constitué, déterministe et contrôlé contre son oracle en CI, mais non « autorisé » : sa licence reste « à valider par le maître d'ouvrage » (corpus.test.ts l'impose) et aucun contrat données / commandes n'est adopté pour l'adapter. Couverture incomplète… |
| X.2-02 | Le double « invitation en attente » est couvert en bout en bout sur la vraie base (lectures et écritures 404 sans écriture, interface refusée). Reste une décision du maître d'ouvrage sur les cellules « à arbitrer » (acceptation non refusée sous le verrou ni su… |
| X.2-04 | Refus de livraison (porte G4) tracé avec l'ID du défaut, la preuve et le propriétaire : décision de livraison distincte, non automatisée (BLOC-06). |

## Fonctions absentes

| ID | Fonction |
|---|---|
| C.2-02 | Batching couvert ; l'instanciation n'existe pas dans la vue 3D Studio (aucun InstancedMesh dans apps/web/src/modules/studio) : rien à tester tant qu'elle n'est pas introduite. |
| D.3-02 | Libération d'une instance WASM : aucune fonction ne la libère. Studio ne charge aucun WASM (carte des morceaux) ; le noyau exact de l'Atelier (moteur-exact.ts) ne termine son Worker qu'après un échec, jamais par politique de libération. Cycle GPU et Workers dé… |
| MIG-COEX-06 | Fonction absente : aucune bascule réelle Atelier → Studio n'existe ; l'empêchement de deux chaînes d'écriture n'existe que dans planEcriture (simulation). À prouver dans le lot de bascule, distinct et à autoriser (MIG-COEX-07). |
| REC-D-01 | TEST-014, TEST-015, TEST-037 et AC-006 portent sur une tâche exacte / un Worker OCCT : Studio n'en a aucun (OCCT interdit par la carte des morceaux, PERF-07 non applicable). Seul l'analogue du groupe de Workers Studio est prouvé (voir REC-D-02). Dépend du lot … |
| REC-E-01 | TEST-032 (illustration IA depuis une vue) reste bloqué : fonction absente (« Illustration IA contrainte » annoncée non disponible). TEST-010, 018, 027, 028 et 035 restent partiels comme au registre ; TEST-018 suppose l'import de profil, absent (voir TR-EX-033)… |
| REC-E-02 | AC-007 impossible : l'illustration est absente (P-06). AC-008 et AC-010 restent partiels (révisions enregistrées non comparées, outil d'approbation absent de la palette, profil personnel modifié non testé) ; AC-009 couvert (studio-publication.mjs). |
| TR-AC-006 | Fonction absente dans Studio : aucune opération Studio n'exécute OCCT/WASM (le lot F2 « noyau exact » est en cours ailleurs) ; l'échec forcé d'OCCT pendant une opération, la résolution des attentes et la relance sans doublon ne sont donc pas testables. Seuls l… |
| TR-AC-011 | Fonction absente : le manifeste d'outils (manifeste-outils.ts) vérifie propriétaire, contrat, contexte, droit et chargeur, mais ne porte ni risques, ni mesures, ni jeux d'essai, ni la règle « prêt à développer / conforme seulement après preuve sur build et pro… |
| TR-EX-010 | Fonction absente : aucun « événement d'effets » d'une commande acceptée ne liste les références/contraintes modifiées ni les domaines dérivés invalidés (readStudioRevisionChanges rend commandes, éléments changés, révision et auteur ; projectionsAInvalider calc… |
| TR-EX-016 | Fonction absente : aucun contenu dérivé n'expose la suite d'états « à jour pour révision R / à recalculer / en calcul / échec / non applicable » (seuls « à jour » / « périmée » des publications et feuilles, et « en cours » du rapport DXF). Sans ces états, ni l… |
| TR-EX-019 | Aucune migration de schéma du document persistant (studio-document/1 seul, MIGRATIONS_BROUILLON vide) : ni transformation documentée, ni aller-retour, ni conservation ou rapport des données inconnues (un champ inconnu est refusé), ni retour arrière. Fonction a… |
| TR-EX-023 | Le refus des pixels et du repère d'écran est testé ; le système de projet et les transformations versionnées document / local / projet n'existent pas (cas positif impossible à tester). |
| TR-EX-028 | Permission, contexte, paramètres et révision sont contrôlés à l'exécution ; aucun quota d'invocation (par compte ou par période) n'existe, seulement des bornes de schéma et de document. |
| TR-EX-030 | Aucun statut « déprécié » d'outil ou de module dans le manifeste, ni plan de compatibilité associé : le cas « déprécier un outil puis rouvrir un document qui l'emploie » n'est pas réalisable. Les alias de renommage et la file locale incompatible existent. |
| TR-EX-033 | Cas négatif prescrit impossible : aucun import de profil, aucun outil « Publier » au registre. Retrait d'un bouton et changement de profil sans révision déjà couverts. |
| TR-EX-034 | Le profil n'a ni profileId, ni version, ni raccourcis personnels ; aucun import, donc aucun conflit de raccourcis à détecter (vérifié dans planche2d/profils.ts). |
| TR-EX-040 | Studio n'a aucun outil exact (OCCT interdit par la carte des morceaux) : les cas « outil exact, première puis seconde activation » et « un autre outil ne crée pas un second noyau » ne peuvent pas être exercés. Le mécanisme générique est prouvé sur rendu-3d, pl… |
| TR-EX-041 | Aucun détecteur de duplication en octets : la carte des morceaux (chargement.json) ne relève que des familles par fichier, pas les modules par morceau, et les bundles séparés des Workers n'y sont pas comparés au bundle principal. Il faudrait relever moduleIds … |
| TR-EX-042 | Un seul cache par build, et tout le build est précaché à l'installation : ni caches distincts (coquille, profil, modules, données/file), ni téléchargement facultatif à la demande. |
| TR-EX-044 | Le buildId n'est pas enregistré dans la file locale (persistance.ts / contrats.ts : brouillon ↔ commandes ↔ schéma seulement), et rien ne gère le quota (aucune éviction, aucune erreur de quota traitée). Le scénario « mise à jour du build avec file pendante » n… |
| TR-EX-045 | Aucun appel d'essai serveur à portée de révision (supportsDryRun n'est qu'une métadonnée du registre) : les cas « preview R12 puis confirmation » et « résultat R12 reçu après R13 » sont sans objet tant que la fonction manque. |
| TR-EX-049 | Les états « rejetée » et « prévisualisation abandonnée » n'existent pas à la reprise (hors-ligne/etat.ts : en-ligne, hors-ligne, en-attente, conflit). Une enveloppe refusée hors stale_revision n'est pas conservée avec un état explicite. |
| TR-EX-051 | La vue 3D n'affiche ni son sourceRevisionId ni les domaines de données périmées : seuls des attributs data-studio-maillage-revision / revision-courante existent, sans texte visible ni liste de domaines. Le refus d'un résultat de Worker R12 sur R13 est déjà pro… |
| TR-EX-055 | Splines, hachures, symboles et transparences n'existent pas dans le modèle 2D de Studio : impossible de comparer leur rendu. Il n'y a qu'un renderer dans l'application (SVG, DEC-08) ; Canvas et GPU ne sont comparés qu'en preuve (comparaison-moteurs). Texte et … |
| TR-EX-056 | Aucun repli WebGPU dans Studio, et le rendu à la demande n'est pas qualifié sur corpus (seul le batching l'est). Le blocage d'un remplacement de moteur sans preuve n'est pas un mécanisme : il relève de la décision (DEC-08 retient SVG pour la 2D). |
| TR-EX-063 | Fonction absente : HoteWorker accepte toute « valeur » rattachée à un identifiant connu ; aucune validation applicative de la forme du message reçu d'un Worker interne (message bien formé mais forgé) n'existe. |
| TR-EX-068 | Fonction absente : la valeur « non applicable justifié » n'existe pas dans les conclusions de contrôle ; aucun état « en attente / délai dépassé » d'un contrôle n'existe à tester. |
| TR-EX-071 | Fonctions absentes : l'auteur n'est pas porté par la provenance du rendu (scenes/provenance.ts) et aucun traitement IA n'existe (fournisseur, sources, autorisation, coûts). |
| TR-EX-074 | Fonction absente : un dossier de conception ne se publie pas (contenu de publication limité à « complet » et « dessin-2d ») ; le refus d'une planche présentée comme feuille publiée n'a pas d'objet à tester. |
| TR-EX-075 | Fonction absente : aucune vue de coupe enregistrée avec cadrage, styles et annotations propres. |
| TR-EX-076 | Fonction absente : aucune publication ne réunit un détail 2D autonome et une coupe de modèle ; aucune présentation « synchronisée » à refuser. |
| TR-EX-077 | Fonction absente : la quantité ne porte ni identifiant / version de règle de calcul, ni précision interne, ni liste d'exclusions. |
| TR-EX-079 | Fonction absente : la matrice d'échanges ne connaît que les sens import / export (StudioSensEchange) ; lecture, consultation, édition et aller-retour ne sont pas évalués séparément. |
| TR-EX-080 | Fonction absente : le repère source / cible n'est pas un champ des rapports d'import DXF et d'export (seule la transformation déclarée de l'import IFC est rapportée). |
| TR-EX-088 | Fonction absente : aucun résultat de job côté serveur n'existe pour Studio (tâches exécutées dans le navigateur) ; le volet « job » ne peut pas être prouvé. |
| TR-EX-091 | Fonction absente : la simulation ne compare pas avant / après propriétés, cotes, associations et historique ; aucune procédure d'accord ni point de retour arrière. |
| TR-IF-001 | Fonction absente : le contrat d'étude (POST /projects/:p/studio/studies { name }) ne porte ni site, ni sources, ni version ; « source indisponible » et « conflit de version » n'existent donc pas. Le contrat physique reste « à choisir » selon la fiche (décision… |
| TR-IF-005 | Fonction absente : le cycle d'activation ne connaît pas les états « vérification de contexte/droits », « résolution des dépendances », « suspendu », ni les erreurs « incompatible », « permission refusée », « échec du noyau » ; aucune préservation d'un geste in… |
| TR-IF-007 | Fonction absente : l'ordonnanceur connaît queued / running / done / failed / cancelled / timed-out / stale, sans loading, cancel_requested ni superseded nommés, et sans révision source tracée par statut ; l'annulation est immédiate (aucun état « annulation dem… |
| TR-IF-008 | Fonction absente : le résultat quantitatif ne porte ni quantityId, ni sourceRevisionSet, ni ruleId / ruleVersion, ni freshnessStatus (aucun de ces champs dans quantites.ts ni bilan-quantites.ts). Le négatif (ajustement sans motif ni auteur, unité incohérente, … |
| TR-IF-009 | Fonction absente : le manifeste (studio-publication-statuts.ts) ne porte ni références de règles, ni rapports de contrôle, ni observations bloquantes ; la publication n'est jamais refusée pour une observation bloquante non résolue ou non dérogée. Pièce changée… |
| TR-IF-010 | Fonction absente : une observation (table studio_observations, lib/studio-observations.ts) ne porte ni catégorie, ni gravité, ni pièces justificatives ; BCF n'est pas livré (matrice des échanges, « jamais livrés »), donc le négatif « même BCF-ID dans un autre … |
| TR-IF-011 | Fonction absente : aucun journal de changement des révisions avec eventId, transaction, horodatage serveur et relation à un job ; aucune garantie testable qu'aucune notification n'est émise avant commit (le canal temps réel n'est pas lié à un engagement transa… |
| TR-INV-007 | Fonction absente : aucun mécanisme n'évalue une optimisation conjointement en performance (p95) et en résultats métier (cibles, quantités, historique, export) avant/après, ni ne la rejette quand le résultat sort d'une tolérance déclarée ; aucune tolérance n'es… |
| TR-INV-009 | Fonction absente : aucun import de profil d'outils (ni route ni interface) et aucun outil « Publier » au catalogue Studio ; le cas négatif prescrit (« importer un profil avec Publier sans droit ») ne peut être exécuté que par substitut (profil personnel écrit … |
| X.3-02 | Aucun contrôle automatique des chaînes obligation → lot → TEST/NAV → DEC/ADR ni des libellés cités. Relevé (script hors dépôt, /tmp/claude-0/-home-user-Fadi/3e3e4ed3-e169-5044-801d-ea3082e15f4d/scratchpad/p2/d1-libelles-introuvables.json) : 57 des 738 libellés… |
| X.3-03 | Preuve et contre-preuve individuelles des 141 fiches TR-* non complétées ; travail du registre (docs/workstreams/, hors périmètre du groupe). Le test X.3-01 fournit l'ossature contrôlée (identifiants, paragraphes, lots, composants). |
| X.4-03 | La séparation contrôles exécutés / scénarios absents n'est écrite que pour 3e992b6 ; aucun document ne la tient au HEAD courant (5edae3e). À produire par l'orchestrateur avec les checkpoints. |
| X.5-01 | HANDOFF cite main@4377815 (dernier point) alors que main est 5edae3e : documents de continuité non tenus au commit testé courant. Relève de l'orchestrateur (docs/workstreams/). |
| X.5-02 | Aucun contrôle automatique n'empêche un « Vérifié » sans preuve conforme. Sur 279 tâches « Vérifié », 92 n'ont aucune preuve test_automatise / recette_e2e et 577 preuves n'ont ni commit, ni url d'exécution, ni date, ni environnement (seulement fichier / contrô… |

## Partielles et mesures

| ID | Manque |
|---|---|
| A.1-07 | Joué le 25 octobre 2026 hors CI avec un vrai redémarrage : PHASE=initial STUDIO_STATE=… (contrôles tous verts), arrêt de l'API, redémarrage d'un cluster PostgreSQL 16 dédié (pg_ctl restart), relance de l'API, PHASE=reopen : 11/11. Reste à brancher en CI (ci.ym… |
| A.2-09 | Obligation de pilotage : l'historique du registre montre TEST-001 non clos (Bloqué) jusqu'à la preuve exécutée de la composition et de la publication du dessin par le lot E, puis Vérifié sur cette preuve. Aucun test ne peut contrôler un état passé du registre. |
| C.1-01 | Mesure complète derrière STUDIO_MESURE_SPATIALE=1, hors CI ; aucun rapport mesures.json / rapport.md versionné avec sa référence de machine et de commit. |
| C.1-02 | Choix DEC-09 et exactitude indexé = linéaire testés ; la mesure qui fonde le seuil de 1 000 n'est pas archivée (même manque que C.1-01). |
| D.2-04 | La spécification existe avant l'implémentation : Issue #173 C06 (autorisation du 18 octobre 2026) puis en-tête de moteur-exact.ts ; l'implémentation est testée. Aucun document de docs/ ne la reprend : à citer dans le registre (aucun code modifié, le lot F2 « n… |
| OPS-05 | Aucun scénario navigateur exécuté de remplacement réel du service worker avec des commandes en attente (TEST-036) ; preuves statiques seulement. |
| REC-A-02 | Obligation d'agrégation : elle suit les fiches TEST-002 à TEST-014, TEST-027, TEST-034/035 (hors liste du groupe A). Le lot F1 a ajouté des preuves pour TEST-002, 005, 006 et 007 (studio-faces, f1-geometrie.test.ts) : à requalifier par leurs propres fiches, pu… |
| REC-B-01 | Manifeste, chargeurs, gestionnaire, profils persistants et politique de cache sont contrôlés en CI. Le rapport réseau / mémoire est produit en CI (étape continue-on-error, artefact atelier-captures) mais sans référence versionnée ni verdict : il faut un relevé… |
| REC-B-02 | TEST-036 est maintenant couvert (studio-preuves-b, partie 4) et TEST-019 sur document non vide. Restent TEST-016 et AC-002 : relevés à cache froid / chaud sans référence de comparaison ni verdict (mesure, DEC-13). |
| REC-C-02 | TEST-022 à TEST-025 ont leurs tests ; AC-004 a maintenant sa trace des cas ambigus ; AC-005 est couvert pour la fidélité géométrique (poussé / tiré, matériau). Reste l'évaluation des profils GPU séparée des mesures SwiftShader (CI sans GPU) : mesure sur appare… |
| REC-D-02 | Absence de corruption désormais vérifiée sur le groupe Studio : le vrai code du Worker, derrière une copie structurée, altère sa copie puis plante ; document, brouillon (tête, lots, enveloppe) inchangés, reprise sur charge intacte, un seul résultat. Reste : pl… |
| TR-AC-001 | Ajoutés : annuler / rétablir la modification du mur (identités, hôte, métré, plan, 3D) et dossier publié conservant la version examinée sur le cas du mur. Reste : le négatif « perte de cote » est intestable — aucune cote ne peut être liée à un mur (les cotes s… |
| TR-AC-002 | La comparaison requêtes / octets / chunks exécutés / mémoire à une référence, cache froid et chaud, n'existe que dans studio-mesures-chargement.mjs (mesure sans verdict, hors CI) ; elle demande un profil de charge et un appareil désignés, sans taux présumé : m… |
| TR-AC-004 | Depuis F5, l'index réutilisé est éprouvé sur des suites d'insertions et de suppressions contre le parcours linéaire. Fonction absente : aucune trace des cas ambigus (plusieurs cibles à égalité) n'est produite ; le corpus ne comporte pas de références liées (co… |
| TR-AC-005 | Orbite, zoom, pousser / tirer et changement de matériau ne sont pas comparés avant / après optimisation (seules la sélection et l'égalité du maillage incrémental le sont) ; la séparation GPU réel / SwiftShader exige un appareil à GPU réel (DEC-13 : « non évalu… |
| TR-AC-010 | Refus serveur de l'approbation au concepteur et au rôle d'administration technique (accès support) désormais testés. Fonction absente : « Approuver » n'est pas un outil du catalogue (aucune découverte par recherche possible) et aucun import de profil n'existe. |
| TR-EX-002 | Cas négatif couvert pour « aucun module concurrent » ; aucune fonction n'« exclut explicitement » une demande de comptabilité/RH (pas de message ni de refus nommé : fonction absente). Cas positif : aucun parcours unique ne traverse les quatre domaines du dessi… |
| TR-EX-008 | Cas négatif (coordonnée GPU) couvert, et l'ordre commande → accusé serveur → relecture dérivée est observé. Manque : l'ordre complet intention → commande → mutation canonique → scène 3D invalidée n'est pas observé dans un seul geste (aucune trace horodatée de … |
| TR-EX-014 | Depuis le lot F3, un modèle externe porte auteur, format, version, unité (déclarée et lue), transformation, horodatage de réception et empreinte SHA-256 ; unité inconnue → « non évaluée », acceptation bloquée ; transformation absente signalée. Absents : « rest… |
| TR-EX-027 | Cas négatif couvert (doublon à libellés distincts rejeté sans écrasement). Cas positif impossible : aucune capacité d'objet d'accès (studio.arch.ladder) n'existe pour vérifier sa distinction avec la transformation d'échelle. |
| TR-EX-029 | Recherche par nom, identifiant, contexte (filtre) et barre couverte, sans lancement de moteur. Absents : recherche par synonyme et par domaine (pertinence ne lit que nom, raccourci et identifiant) et l'affichage par outil des huit états prescrits (découvert, n… |
| TR-EX-052 | La mesure S1/S3 complète tourne derrière STUDIO_MESURE_SPATIALE=1 (hors CI) et son rapport est « sans seuil ni verdict ». Comparer aux cibles demande des cibles décidées (DEC-13) et une mesure sur appareil désigné. L'oracle index = linéaire est déjà couvert. |
| TR-EX-053 | Départage sous permutation de l'index désormais prouvé : 720 ordres d'insertion, égalités de distance réelles. Mutation tuée : tri par rang de l'index retiré. Reste absent : le mode d'accrochage « parallèle » n'existe pas (MODES_ACCROCHAGE). |
| TR-EX-059 | Mesurer que le fil principal reste disponible pendant un calcul lourd demande une mesure sur appareil réel (hors CI) ; aucun booléen n'existe dans Studio (cas positif prescrit sans objet). |
| TR-EX-065 | L'affichage explicite de l'écart n'est vérifié que par studio-exigences.mjs, hors CI : à brancher en CI (orchestrateur). |
| TR-EX-078 | Défaut corrigé (totaliserQuantites additionnait une valeur d'une autre unité que sa grandeur). Reste : aucune somme de quantités de révisions ou de règles hétérogènes n'existe à signaler (métré d'un seul document). |
| TR-EX-084 | L'observation partage par conception l'identité du commentaire promu (E.2-01) : identités distinctes note / observation non réalisées — lecture du critère à trancher. |
| TR-EX-098 | Comparer un gain de performance (p95) couplé à l'équivalence fonctionnelle demande des mesures sur appareil réel ; aucune règle de rejet automatique d'un gain hors tolérance n'existe. |
| TR-EX-101 | Skip / only / todo refusés dans les suites tracées (registre) ; aucun mécanisme ne relie une modification de Worker / Registry à ses tests pertinents et l'affaiblissement d'une assertion n'est pas détecté. |
| TR-IF-006 | Négatif désormais complet (actorId forgé refusé 400, portée d'un autre projet 404, même requestId au contenu différent 409, aucune écriture, membres inchangés, lecteur toujours refusé). Positif : fonction absente pour les attributs prescrits targetIds, operati… |
| TR-INV-002 | Le mur est désormais modifié en 2D puis en 3D (TEST-003 : même objectId, hostId gardé, une seule révision), mais la révision affichée n'est pas comparée entre les deux planches : la vue 3D n'expose que la révision de session de son maillage (data-studio-mailla… |
| TR-INV-006 | La scène 3D ne montre pas l'identifiant de révision serveur (sourceRevisionId) de son résultat : elle porte la révision de session du document (data-studio-maillage-revision / data-studio-revision-courante) et un message « Maillage en cours de calcul » tant qu… |
| TR-INV-013 | Depuis le lot F1, diviser la face latérale d'un prisme lié divise l'arête de sa polyligne source : les cotes de cette arête sont réattachées quand c'est prouvé, sinon « à résoudre », jamais rattachées à une moitié par proximité. Mais aucune annotation ne référ… |
| X.1-08 | S6 a maintenant ses références visuelles (SVG S6-A/B/C-100.svg, empreintes SVG et maillage, S6-100.json ; mutation d'un octet → échec). Reste MESURE : aucune capture rendue (raster, vue 3D) de référence sur un banc autorisé ; références à 10 000 primitives seu… |
| X.3-01 | Identifiants inchangés et couverture complète prouvés contre REF-02 (mutation EX-050 → EX-950 : échec). Reste : les fiches portent des lots (I, A/R…) et non des SOUS-lots (A.1, A.2…) ; le rattachement au sous-lot n'existe pas dans les fiches. |
