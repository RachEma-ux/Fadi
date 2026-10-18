# N/D % — Avancement du développement total Fadi / Studio

## M21 — contrat documentaire minimal Registry/Manager, M004 A4

18 octobre2026 ; référence d’instructions `301a4fa8f2594fa1c8f0317c18085b5ae22ac7a3`. Reprise de M003 `M21-MANAGER-PREPARATION.md`, lotB A2, NAV et fiches normatives141, sans modifier les originaux ni les sources. **Préparation documentaire non exécutable**, aucune application/POC/loader/moteur/API/DB créé. Catalogue JSON de huit exemples, pas un catalogue industriel exhaustif ni un profil pilote accepté. PDEV N/D, G1/G3 non passés par cet artefact.

### 1. Sources et limites de décision

EX-026..031 catalogue/gouvernance ; EX-032..037 Manager/préférences/recherche/accessibilité/gestes ; EX-038..044 chargement/cache/offline ; IF-005 activation ; IF-004/006/011 commandes/révisions/journal ; INV-009/014/015 profil/offline/découverte. D07 retient placement/navigation/droits pour spécifications, pas la forme physique du Registry. DEC-04 profils, DEC-05 manifests, DEC-06 Manager, DEC-07 chunks, DEC-14 offline et DEC-18 réutilisation restent à instruire au périmètre concerné. Les choix d’IDs, touches, modules et télémétrie ci-dessous ne sont pas approuvés par leur présence dans JSON.

Données normatives exactes restent dans141sources A1 et DOCX ; le validateur documentaire vérifie des relations JSON, pas conformité des moteurs. D-202 icône propre/barre/raccourci conservée : les icônes/touches des exemples sont des **tokens candidats**, pas ressources graphiques ou raccourcis livrés. Aucune suppression de capacité Fadi, dont échelle d’accès, ni dépendance DrawAll.

### 2. Responsabilités et identité

- Registry : métadonnées et contrats de capacités légers, indépendants des modèles/objets de scène. Domaines stables dessin/bim/visualisation/documentation. Planche2D/3D existe en dessin seulement ; une capacité peut agir dans plusieurs contextes via adaptateurs explicités.
- ToolId canonique stable distinct du label FR/EN, du raccourci, du commandType et de l’objectId métier. `example.*` signale un exemple non réservé ; sa publication ne migre aucun identifiant actuel.
- CapabilityId exprime l’intention logique. Même libellé ne signifie pas même capacité ; une vue dérivée ne devient pas un éditeur indépendant.
- Manager : découvre/recherche, réconcilie profil/contexte, résout chargement/activation et cycle des machines. N’effectue pas calcul géométrique autoritaire, ne valide pas les droits centraux et n’écrit pas directement les données.
- Les intentions vont vers contrats commande serveur ; la scène reste reconstruisible. Objet associé a un propriétaire d’écriture unique ; pas un exemplaire2D et un exemplaire3D concurrents.

Les deux `echelle` de la palette Atelier n’ont pas le même sens. Exemple alias scoping catalogue+version+fiche distingue DA-07-13 objet et DA-02-05 homothétie ; historique version «à qualifier». Sans discriminateur, résultat **ambigu** : aucune activation/migration automatique, présenter choix nommé. Table proposée ne renomme pas commandes, favoris ni historique persistés. A2 doit identifier stockage et compatibilité avant tout sous-lot de correction autorisé.

### 3. Contextes indépendants et façade

Chaque activation garde projectId/studyId/variantId/baseRevisionId, utilisateur/permissions effectives, writerAuthority/schemaVersion et propriétaire de document/modèle. Contexte résolu serveur, jamais seulement URL/dernier projet. Domaines peuvent être ouverts sans initialiser les moteurs des autres domaines.

| Parcours | Activation | Aucun prérequis parasite |
|---|---|---|
| 2D indépendante | Document2D propriétaire, unité/repère/calque et droit dessin valides ; ligne/cote/annotation selon contrats retenus. | Pas de modèle3D fictif, pas de moteur3D obligatoire. |
| 3D indépendante | Modèle spatial propriétaire, face/repère/commande et droit modèle valides. | Aucune esquisse2D obligatoire ; géométrie libre sans sémantiqueBIM implicite. |
| Associé | Référence au même objectId canonique, hôte/relations/topologie et droits architecture. | Une planche peut ouvrir sans charger l’autre ; propagation via effets validés, pas deuxième autorité. |

Les commandes de revue/publication ne requièrent aucune planche active. Approbation et publication sont deux permissions distinctes ; cumul explicitement configuré et tracé seulement. L’administrateur technique ne reçoit pas ces droits implicitement. Offline : une décision centrale peut être préparée selon contrat, jamais confirmée approuvée/publiée hors serveur.

### 4. Dimensions d’état et transitions

Ne pas coder un seul booléen «disponible» :

| Dimension | Valeurs logiques proposées | Effet utilisateur |
|---|---|---|
| Profil | visible/masqué/favori | Outil masqué retrouvable ; pas supprimé ni interdit. |
| Contexte | compatible/incompatible/à résoudre | Motif exact sans divulgation sensible ; pas activation hors propriétaire. |
| Permission | autorisé/refusé/à revalider | Refus client guide, serveur décide ; importer un profil n’élève rien. |
| Ressources | non chargées/chargement/prêtes/échec ; cache compatible/incomplet | Progression/retry ; catalogue seul ≠ outiloffline utilisable. |
| Exécution | inactive/active/preview/pending/confirmée/refusée/conflit/périmée | Preview ≠ mutation ; pending ≠ engagement durable central. |

Cycle IF-005 : découvert → contexte/droits → dépendances → code chargé → initialisé/prêt → actif → suspendu/désactivé, avec branches de refus/incompatibilité/horsligne/chargement/noyau. Les valeurs JSON ne contiennent aucun code de machine ni module importable.

Activation1 demande contexte et ressources manquantes ; activation2 sur même ressource mutualise sans doubler noyau/worker. Si utilisateur change projet pendant chargement, annuler l’activation UI et ne jamais réadresser l’intention ; résultat tardif ne s’applique pas au nouveau contexte. Fermer outil après commande envoyée ne prouve pas annulation serveur : suivre requestId et résultat dans contexte d’origine. Désactivation ne détruit pas une ressource partagée encore utilisée.

Échec charge : état accessible, Réessayer/Retour, aucune mutation canonique ni spinner permanent. Échec noyau : refus/erreur lié à tâche, pending résolus, reprise contrôlée idempotente ; ne pas engager un ancien résultat. Erreur localStorage/quota : ne pas promettre reprise sans durabilité. Expiration auth : suspendre envoi et revalider identité/droits ; queue A jamais envoyée sous utilisateurB. NAV-007/008 précisent garde et récupération.

### 5. Chargement et offline : contrat vérifiable futur

Catalogue/profil léger au démarrage, ressources courantes à ouverture planche, noyau rare au premier usage. `resource` dans JSON est une classe descriptive et `loader=null` : aucun chemin/URL script exécutable. Un futur Registry validé doit employer loaders autorisés/littéraux et manifests versionnés revus A2/sécurité ; aucune URL libre importée d’un profil.

Mesurer transfert, initialisation, worker/WASM, mémoire froide/chaude et précache réel. Cacher un bouton ne prouve pas un chunk non téléchargé ; l’existence lazy ne prouve pas l’absence précache. Préparer profil offline par action explicite avec versions/dépendances/données/quota, vérifier cache compatible. Reconnexion revalide droits/contexte/version/commandes. SW incompatible ne vide pas file ; profils et géométrie restent séparés. Budgets et appareils attendent DEC-13, pas de seuil de performance inventé.

### 6. Clavier, langue et accessibilité

Label compréhensible FRsource + EN pour nom/aide/état/erreur, sans traduire données de projet ou livrables. Rechercher «échelle» propose accès et homothétie distincts avec descriptions/contextes ; afficher motif refus/incompatibilité. Icône propre et barre appropriée par outil/commande livrée ; touches candidates testées collision contexte/OS/navigateur/disposition physique avant acceptation, ne pas remplacer les raccourcis Fadi relevés sans décision.

Focus visible entre planches, recherche et panneau ; Tab/ShiftTab, flèches menu, Entrée activation, Échap selon geste/menu. Un champ texte/saisie numérique garde ses touches ; alternative clavier aux gestes et bouton tactile nommé ; cible proposée44px, zoom200%, reducedmotion, rotation/claviervirtuel testés. Recherche/palette ne rompt pas geste/modificateurs ; changement de langue recharge actuel donc garde pending. Fullscreen explicite réversible, sortie visible même si Échap annule le geste d’abord. Profil change présentation seulement, pas modèle/révision/droits.

### 7. Télémétrie minimale sans contenu métier — proposition non instrumentée

Événements candidats : discovery/activation/load/retry/failure/deactivation, resource_class, durée en intervalle agrégé, outcome_code stable, mode et build/contract_version. Aucun nom/ID privé de projet/étude/variante/document, géométrie, coordonnées, texte saisi, chemin/URL complète, email, token ou contenu de source. Identifiants de corrélation éphémères seulement si nécessité et politique de confidentialité démontrées ; la liste JSON n’en prévoit aucun par défaut.

Journal métier et télémétrie sont séparés : l’audit autoritaire peut avoir IDs nécessaires à la traçabilité selon droits/rétention approuvés ; ils ne sont pas copiés dans métriques publiques. Quotas/rétention/destination/consentement/échantillonnage et accès restent à décider (EX-095), aucune collecte envoyée par ce document. Ne pas logger une exception brute contenant URL/paramètres ; classifier l’erreur et expurger avant stockage.

### 8. Vérifications et limites

`verify-m21-documentary.py` : Pythonstandard, lit uniquement catalogueJSON local, vérifie huit IDs uniques/icônes, quatre domaines, compatibilité des modes/planches/autorités, permissionsdistinctes, aliases scopés/deux sens échelle, absence loader/implémentation, ressources référencées, touches distinctes dans les contextes d’exemples et trois validations indépendantes. **Exécuté réellement sans réseau/DB/application**, résultat M21-VERIFICATION-JSON.json PASS documentaire. Ne vérifie pas collision OS/accessibilité/performance, licence, pertinence métier exhaustive ou implémentation.

Scénarios futurs : TEST-016 ressources réelles,017 recherche,018 profilPublier sans droit,019 profil sans effet géométrie/droits,020offline,021reconnexion,036SW ; NAV001/004/007/008/009. Cas propres : alias ambigu refuse, activationdouble mutualisée, permissionretirée, authA→B, résultat ancien, échec initialisation, aucun contenu métier en télémétrie. Validation de ces scénarios nécessite capacités et autorisations/cible sûre ; ils restent prescrits, non exécutés ici.

### 9. Prochaine action READY et responsabilité

A2 relit frontières/contrats M17/DEC-04/05/06/07/14/18 ; A5 lie exemples aux oracles et affine les négatifs ; A1 vérifie opérations utiles au pilote ; A0 seul intègre la contribution et traite les décisions nouvelles réellement nécessaires. Code Registry/Manager/alias, POC, migrations de profils, testsmutateurs, fusions et télémétrie effective ne sont pas autorisés par ce contrat. Aucun statut de capacité «Implémenté/Vérifié/Accepté» ni coche des trois validations déduit du PASSJSON.


### Précision de revue croisée A2 — résultat ≠ écrivain

Le catalogue distingue désormais `result_category` (drawing2d/free3d/architectural-object/derived-check-result/review-decision/immutable-publication) et `writer_authority_candidate`. Mapping documentaire géométrique : drawing2d→drawing2d, free3d→model3d, architectural-object→associated, selon noms candidats C-STUDY A2/M24 A1. Les autres catégories ont writer_authority_candidate=null : contrôle/approbation/publication ne créent pas une quatrième autorité géométrique ; leur service propriétaire métier reste à définir. Ces valeurs ne renomment aucune classe persistée ni n’autorisent un client à choisir son écrivain ; le serveur établit writerAuthority. Le validateur JSON contrôle ce mapping candidat, sans prouver son implémentation.
