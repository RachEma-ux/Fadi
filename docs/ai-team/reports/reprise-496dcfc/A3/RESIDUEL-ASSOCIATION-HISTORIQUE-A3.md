# Association, historique et reprise — delta documentaire A3

Référence des contrats : `2076e18ed6b5bf7d48e95bbee6bf389a32ff3bde`. Tâches exactes : **A.4-03, A.4-04, A.4-07, A.5-09**, propriétaire A2 conservé. A3 prépare seulement ce complément demandé par A0. Aucun code, test, import de moteur, harness, API, DB, réseau ou service exécuté. Aucun statut canonique, gate, coche ou acceptation modifié.

Les contrats LOT-A.4-A.5, M17/C-COMMAND, M23/M27 et NAV restent les sources uniques. Les20 sous-cas ci-dessous sont des déclinaisons/liaisons candidates au catalogue38 TEST, pas20 tests exécutés ni nouveaux identifiants normatifs. Les prescriptions directes et extensions candidates sont distinguées dansJSON.

## Règle commune de comparaison

Comparer contenu canonique et versions, identités/provenance, hôtes/relations/contraintes/cotes, journal des engagements, résultats requestId/outbox, sources de projection et fraîcheur ; publication historique quand applicable. Les diagnostics/trace de refus expurgée sont distincts d’un nouveau commit métier.

Corpus synthétiques S1/S2/S5/S6/S7 existants à compléter par A5 pour le sous-lot seulement ; un paramètre fautif par variante négative, unités/repères et versions explicites. Aucun fichier de corpus créé ici.

Code/buildSHA, version contrat/moteur/corpus et empreintes, environnement sûr et autorisé, exécutant/date/commande/résultat, instant avant/après, critère ciblé, revue et limites ; présence d’un test ou arithmétique seule insuffisantes.

## A.4-03 — Conserver le même objectId pour un objet architectural modifié depuis les deux planches.

Décompose AC001 en identité, fraîcheur, undo/reprise et publication ; distingue les preuves moteur, canonique, projection et historique.

Source checklist blob `24a5e04346ed7605b82b7079d6259b378ca6bf64`, ligne 363. Préparation à revue, pas réalisation ou condition vérifiée.

### A.4-03/edition-croisee — Éditer depuis 2D puis 3D sans deuxième mur

**Propriété et autorité :** L’autorité associée porte le mur et ses relations ; les surfaces 2D/3D portent des projections et intentions de commande.

**Entrée :** Même contexte synthétique P/S/V ; mur W, ouverture O hôte W, révision R0. Deux intentions séquentielles, la seconde capturant la révision acceptée de la première. Reprendre le cas RT 6×3×0,2 m et largeur d’ouverture 1→1,2 m seulement pour les métrés.

**Sortie candidate :** Même objectId W, O reliée au même hôte ; une nouvelle révision par commande acceptée, effets et projections corrélés à leurs sources. Le geste 3D ne crée pas Wbis.

**Oracle candidat :** Comparer les identités W/O/hôte et les paramètres canoniques après chaque étape, pas seulement l’image. Pour cet unique cas RT sans autres déductions : net 3,180 puis 3,096 m³ ; sinon métrés explicitement périmés jusqu’au recalcul. Vérifier qu’aucun second writer n’a accepté une copie divergente.

**Réemploi :** TEST-003, TEST-009, TEST-010. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Les valeurs RT sont un oracle synthétique limité, pas une règle générale de métrés. Les identités/transactions sont logiques ; aucun stockage, endpoint ou objectId physique choisi.

**Trigger :** Après revue A2/A1/A5 du contrat associé et preuve de capacité autorisée : fixer corpus S2/S6 et appliquer l’oracle au SHA réel ; aucun essai maintenant.

### A.4-03/projections-fraicheur — Séparer source courante et projection ancienne

**Propriété et autorité :** Le contenu associé est canonique ; projection, vue et cache sont reconstruisibles et portent leur sourceRevision.

**Entrée :** Une commande acceptée passe R0→R1 ; une projection 2D ou 3D reste sur R0 ou un calcul R0 revient ensuite.

**Sortie candidate :** La définition W/R1 reste unique ; état courant/périmé/recalcul en cours explicite. Aucun affichage ancien ne devient source d’un nouveau commit ou métrage annoncé actuel.

**Oracle candidat :** Vérifier correspondance objectId/sourceRevision des deux surfaces et invalidations ; si les métrés ne sont pas recalculés, leur état périmé est visible. Le résultat R0 arrivé tard produit zéro nouvel effet canonique sur R1.

**Réemploi :** TEST-003, TEST-014. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Aucun délai de rafraîchissement ou budget FPS fixé ; le cas ne prouve ni renderer ni worker réels.

**Trigger :** Lorsque le mécanisme de projection/invalidation et son protocole de révision sont définis pour le lot autorisé, joindre preuve avant/après et résultat périmé.

### A.4-03/historique-reouverture — Undo/redo et réouverture retrouvent l’objet associé

**Propriété et autorité :** Historique immuable et C-COMMAND : annuler est une nouvelle opération contrôlée, pas une mutation de R0.

**Entrée :** État associé avant/après une édition ; annulation puis rétablissement sur une tête autorisée, fermeture puis réouverture du contexte/révision exacts. Variante séparée : autre édition intervenue avant l’annulation.

**Sortie candidate :** Valeurs, hôtes, références et métrés retrouvent l’état attendu ; les révisions historiques restent identifiables. En concurrence incompatible : conflit explicite et travail d’autrui conservé.

**Oracle candidat :** Comparer états canoniques et relations complets, historique accepté et identités de commande, puis la source réellement rouverte. Une capture identique ou un inverse mémoire seul ne prouve pas la durabilité.

**Réemploi :** TEST-011, TEST-012. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Le mécanisme hybride et la persistance ne sont pas sélectionnés ici ; aucun appel DB, coupure ou restauration exécuté.

**Trigger :** Après décision DEC12 utile au périmètre, capacité de reprise livrée et accord d’essai sûr : associer corpus S2/S6 et preuve de fermeture/réouverture.

### A.4-03/publication-historique — La publication conserve la version examinée

**Propriété et autorité :** L’approbation/publication vise un ensemble figé ; le travail associé courant peut évoluer sans réécrire les pièces historiques.

**Entrée :** Dossier publié sur R0/W et ses pièces ; nouvelle édition depuis l’autre planche produit R1. Tentative de publier R1 sous l’approbation R0.

**Sortie candidate :** Ancien manifeste, sources, pièces et empreintes restent ceux de R0 ; R1 nécessite l’approbation/acte adéquat. Aucune substitution latest.

**Oracle candidat :** Comparer manifeste, versions et empreintes avant/après la nouvelle édition ; le refus de nouvelle publication n’efface ni n’annule l’ancienne. Conserver les permissions séparées approbation/publication.

**Réemploi :** TEST-010, TEST-018, TEST-038. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Critère final dépendant d’E/M24, pas précondition artificielle pour commencer la spécification A.4. Aucun dossier réellement publié.

**Trigger :** Quand la capacité de publication du pilote et ses droits seront autorisés/disponibles, rattacher la preuve à ce critère AC001 sans déclarer M20 complet avant elle.

## A.4-04 — Conserver les hôtes et contraintes lors des modifications associées.

Isole mouvement, suppression, fractionnement et références invalides avec sorties conditionnelles DEC02 ; n’invente ni cascade ni politique d’ID.

Source checklist blob `24a5e04346ed7605b82b7079d6259b378ca6bf64`, ligne 364. Préparation à revue, pas réalisation ou condition vérifiée.

### A.4-04/deplacement — Déplacement avec hôte et contraintes valides

**Propriété et autorité :** La commande associée possède ensemble canonique mur/ouverture/contraintes ; la projection n’actualise pas séparément un hostId.

**Entrée :** Ouverture O dans W avec contraintes explicites. Une variante de cas déplace O à l’intérieur ; une autre tente une position hors hôte. Changer un seul paramètre fautif par variante.

**Sortie candidate :** Hôte, position et quantités restent cohérents dans une même opération ; hors hôte : refus atomique ou état de résolution explicitement décidé, sans détachement silencieux.

**Oracle candidat :** Avant/après : hostId, paramètres de position, contraintes, cotes, état des métrés et révision. En refus, zéro modification canonique et aucune révision acceptée supplémentaire ; une trace de refus expurgée est permise.

**Réemploi :** TEST-008. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** La politique de résolution n’est pas choisie ici ; ne pas considérer toute position hors hôte automatiquement réparable.

**Trigger :** DEC02 doit préciser limites/contraintes et politique de résolution du cas ; A5 isole les fautes dans le corpus avant tout essai.

### A.4-04/suppression-hote — Suppression de l’hôte sans perte cachée des enfants

**Propriété et autorité :** L’identité et le cycle de vie de W, O et leurs relations appartiennent au contrat associé, pas à une règle de cascade déduite du moteur.

**Entrée :** Intention explicite de supprimer W alors que O, une cote et une contrainte le référencent. Révision/source et portée de suppression déclarées.

**Sortie candidate :** Aucune disparition implicite d’O/cote/contrainte ni réaffectation par proximité. Selon politique DEC02 ratifiée : commande refusée sans effet, ou changement de relations/statut de rupture explicitement pris dans la même opération et conservant la provenance.

**Oracle candidat :** Inventaire avant/après de chaque entité et relation ; objet supprimé, référence conservée à résoudre ou refus sont distingués. Le contrat doit rendre chaque perte/rupture visible et réversible selon l’historique, pas seulement enlever la géométrie de la scène.

**Réemploi :** TEST-007, TEST-008, TEST-011. Rattachement candidat à TEST007/008/011 ; suppression d’hôte est une déclinaison documentaire nouvelle, pas un test déjà prescrit/exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Extension proposée des oracles de référence/hôte : le catalogue ne prescrit pas à lui seul une politique de cascade ou de tombstone. Aucun choix physique fait.

**Trigger :** Attendre le choix précis DEC02 de cycle de vie/suppression et ses effets ; ensuite compléter seulement les assertions liées à cette décision.

### A.4-04/fractionnement — Fractionner sans choisir une référence par proximité

**Propriété et autorité :** La topologie exige une correspondance démontrée ou un état à résoudre ; la politique d’identité des nouvelles parties reste DEC02.

**Entrée :** W ou une face référencée est fractionné ; O/cote pointe sur la zone concernée. Construire deux variantes : correspondance univoque démontrable et plusieurs cibles plausibles.

**Sortie candidate :** Références suivent le mapping démontré ou sont conservées en rupture explicite ; aucune sélection arbitraire de la partie la plus proche. Identités nouvelles/maintenues et provenance ne sont déclarées que suivant la politique de fractionnement décidée.

**Oracle candidat :** Comparer table de correspondance et source exacte de chaque relation, pas la seule distance. Pour l’ambiguïté : aucun commit d’une association choisie au hasard, pas de métrage courant trompeur ; historique préservé.

**Réemploi :** TEST-007, TEST-011. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** TEST007 concerne une face cotée ; son extension au fractionnement d’un hôte architectural est proposée et reste à revoir. AC001 ne décide pas quel ID survivra à une création de plusieurs objets.

**Trigger :** Après décision DEC02 sur identité/mapping et corpus de correspondance ciblé, soumettre le cas précis à revue A2/A5 ; pas de nouveau solveur.

### A.4-04/reference-invalide — Référence invalide ou périmée ne devient pas relation valide

**Propriété et autorité :** Préconditions d’objet/relation et parenté sont vérifiées par le writer ; les références inconnues restent explicites.

**Entrée :** Variantes indépendantes : hôte inexistant ; hôte d’un autre projet ; version de relation obsolète ; cible disparue après capture de la commande.

**Sortie candidate :** Refus de contexte/version/ambiguïté avant effet, ou rupture à résoudre conformément au contrat ; aucune fuite interprojet ni rattachement implicite.

**Oracle candidat :** Comparer objet, hostId, références, révision et journal accepté avant/après chaque refus. Une mise en cache ou un libellé UI « réparé » ne fait pas preuve de réparation canonique.

**Réemploi :** TEST-007, TEST-012, TEST-035. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Les codes d’erreur de M17 sont candidats ; aucun mapping HTTP ni politique de réparation nouvelle n’est annoncé.

**Trigger :** Fixer les versions de référence et le verdict attendu de chaque variante lors du contrat DEC02/12, puis preuve ciblée sur capacité autorisée.

## A.4-07 — Prévoir l’extrusion d’un profil 2D avec hauteur, direction et relation de suivi explicites.

Sépare paramètres d’extrusion, mode de relation et preuve native/Studio ; garde EX020/023 et hypothèses analytiques explicites.

Source checklist blob `24a5e04346ed7605b82b7079d6259b378ca6bf64`, ligne 367. Préparation à revue, pas réalisation ou condition vérifiée.

### A.4-07/independant — Extrusion indépendante explicite et dessin toujours autonome

**Propriété et autorité :** Le dessin 2D conserve sa propre autorité ; la création 3D indépendante a sa propre identité/provenance, sans propagation cachée.

**Entrée :** Profil fermé synthétique, unité m et repère identifiés ; hauteur 3 m, direction normale explicite. Exemple analytique limité : rectangle 6×2 m, aire 12 m². Mode indépendant demandé, pas déduit.

**Sortie candidate :** Cible 3D nouvelle et source 2D identifiable ; le dessin peut encore être sérialisé/rouvert/édité sans objet 3D substitut. Modifier ensuite une copie indépendante ne modifie pas la source, et réciproquement selon le contrat de copie.

**Oracle candidat :** Pour ce prisme normal sans trou ni autre opération : volume candidat 12×3=36 m³ et direction déclarée. Comparer identités/provenance et conservation du dessin ; cet oracle ne démontre ni forme générale, ni topologie, ni durabilité.

**Réemploi :** TEST-004, TEST-005. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** 36 m³ est une valeur analytique synthétique nouvelle, pas un résultat moteur obtenu ni une règle normative. Les primitives géométriques et leur adaptateur restent à qualifier.

**Trigger :** Après accord sur la sémantique de conversion/copie et le contrat d’extrusion DEC18, isoler le cas dans S1/S5 ; pas de chargement moteur maintenant.

### A.4-07/suivi-explicite — Suivi versionné du profil, distinct d’une extrusion réussie

**Propriété et autorité :** Le lien et la règle de propagation sont explicites ; profil source, cible 3D et même objet architectural vu dans deux planches ne sont pas des identités interchangeables.

**Entrée :** Mode de relation déclaré et source de profil versionnée ; modifier le profil après la première extrusion, puis faire revenir un calcul ancien.

**Sortie candidate :** Suivant relation DEC02 approuvée : recalcul correct ou invalidation explicite de la cible. Source et cible restent traçables ; résultat ancien non engagé. L’édition d’une projection ne confère aucun pouvoir inverse universel sur le profil. Pour une référence liée, la version épinglée reste applicable jusqu’à acceptation explicite de sa mise à jour ; une source plus récente n’autorise pas à elle seule une propagation. Le mode associé suit uniquement sa règle de propagation déclarée.

**Oracle candidat :** Comparer sourceRevision/profil, référence de relation, paramètres hauteur/direction et fraîcheur de la cible ; vérifier qu’aucun suivi n’existe si le lien a été rompu. Distinguer même objectId de l’objet associé et identités de ses primitives sources.

**Réemploi :** TEST-005, TEST-006, TEST-007. Extension candidate des TEST005/006 et du mapping TEST007 ; aucune équivalence entre preuve moteur et suivi métier. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Ni conservation d’un maillage ni fonction d’extrusion native ne prouvent cette relation Studio. Politique de propagation/réparation toujours ouverte.

**Trigger :** DEC02 définit relation, versions et sens autorisés ; DEC18 qualifie l’opération publique ; ensuite seulement formaliser la preuve de suivi.

### A.4-07/entrees-refusees — Paramètres d’extrusion incomplets ou incompatibles

**Propriété et autorité :** Le writer valide source/version, unités et repères avant effet ; aucun défaut de hauteur ou de direction inventé.

**Entrée :** Une faute par variante : hauteur absente/non finie ; direction absente/non finie/nulle ; repère inconnu ; unité incompatible ; transformation sans version ; source périmée.

**Sortie candidate :** Refus ciblé ou conflit avant création d’un solide partiel et avant modification du dessin. Aucune normalisation, conversion de repère ou hauteur par défaut silencieuse.

**Oracle candidat :** Ancien profil, identités, relations et état canonique restent identiques ; aucun objet partiel ou journal accepté. Les règles sur hauteur nulle/signée et vecteur non unitaire restent à décider explicitement, sans imposer ici une convention physique.

**Réemploi :** TEST-005, TEST-012. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** TEST005 prescrit hauteur/direction absente ou non finie ; autres variantes sont rattachements candidats issus EX023/M17, pas déjà démontrées.

**Trigger :** Préciser conventions d’unité/repère et validation de direction dans le sous-lot choisi ; A5 peut alors produire les variantes exactes sans faute supplémentaire.

### A.4-07/preuve-native-vs-studio — Séparer preuves du noyau et preuve du contrat Studio

**Propriété et autorité :** Un export public et un test existant sont des candidats de réemploi ; ils ne deviennent ni autorité Studio ni preuve de suivi.

**Entrée :** Réemployer inventaire DEC18 au code 5e0285 : MTR03 topologie/maillage Planche ; MTR06 façade MoteurExact/OperationExacte ; MTR08 commandes ; MTR09 versions/reprise. Distinguer sources de tests présentes et exécutions historiques exactes.

**Sortie candidate :** Conserver deux colonnes : preuve native bornée au SHA/fichier/opération/oracle ; preuve Studio future portant profil/hauteur/direction/relation/contexte/versions/durabilité. Une colonne ne remplit pas l’autre.

**Oracle candidat :** Vérifier que le dossier cite API publique, version, limites de mesh/BRep et provenance ; les tests « présents » restent non exécutés dans cette étude. Les 492 tests CLASSIF historiques ne démontrent pas TEST005/006 Studio ni un moteur complet.

**Réemploi :** TEST-005, TEST-006. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** L’inventaire DEC18 est statique et daté ; aucun nouvel import de moteur, relecture source applicative, benchmark ou opération d’extrusion exécutée.

**Trigger :** Au choix précis d’adaptateur/opération DEC18 : requalifier le delta de SHA et rattacher une preuve native ciblée, puis la preuve Studio distincte après autorisation.

## A.5-09 — Prévoir la reprise des commandes après interruption et la revalidation lors de la reconnexion.

Distingue duplicata déjà engagé et nouvelle commande sur base ancienne ; ajoute les refus ciblés de reprise en conservant états et historique.

Source checklist blob `24a5e04346ed7605b82b7079d6259b378ca6bf64`, ligne 384. Préparation à revue, pas réalisation ou condition vérifiée.

### A.5-09/ack-perdu — Accusé perdu : résultat indéterminé, pas seconde application

**Propriété et autorité :** Le serveur conserve résultat durable/requestId dans son périmètre ; le client n’invente ni commit ni annulation.

**Entrée :** Commande C acceptée sur R0→R1 mais réponse perdue ; la tête avance ensuite R2. Même acteur autorisé, même portée, requestId et contenu lors de la reprise documentaire.

**Sortie candidate :** Avant confirmation retrouvée : état indéterminé et intention conservée. Après revalidation et recherche du résultat : même résultat historique R1, zéro nouvelle mutation ; R2 ne devient pas une deuxième exécution de C.

**Oracle candidat :** Comparer au canonique capturé AVANT le rejeu, pas à l’état antérieur au premier commit. Le résultat durable, eventId/transaction/révision de C sont identiques ; compteur d’engagements de C reste un. Ne pas refuser à tort ce rejeu seulement parce que la tête a avancé.

**Réemploi :** TEST-013. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Aucun paquet réseau envoyé, aucune panne simulée. Le stockage de résultats et sa rétention restent à choisir ; le cas ne garantit pas la disponibilité après expiration.

**Trigger :** Fixer déduplication/rétention et protocole de lookup dans DEC12/M17 ; future preuve sur capacité/cible autorisées, pas sur un modèle mémoire présenté serveur.

### A.5-09/requestId-divergent — Même identité de demande avec contenu divergent

**Propriété et autorité :** Une identité de demande n’est réutilisable que pour la même intention sémantique dans la même portée autorisée.

**Entrée :** Conserver requestId de C et modifier un seul paramètre, ou transformer preview en commit sous cette même clé. Comparaison au résultat déjà existant.

**Sortie candidate :** Refus de réutilisation divergente ; ancien résultat/historique conservé, aucune seconde mutation. Une intention réellement nouvelle doit être identifiée séparément.

**Oracle candidat :** Zéro nouvel engagement canonique/outbox accepté ; empreinte et résultat de C inchangés. REQUEST_ID_REUSED est seulement le libellé candidat M17, pas un endpoint/code implémenté.

**Réemploi :** TEST-013. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** La canonicalisation/empreinte physique n’est pas définie ici ; aucune règle arbitraire de hash remplace l’équivalence sémantique à ratifier.

**Trigger :** DEC12/16 et choix résiduel de canonicalisation précis ; reprendre uniquement cette variante après décision, sans refaire la méthode d’idempotence.

### A.5-09/autre-compte — La file d’un autre compte/contexte n’est pas réadressée

**Propriété et autorité :** Une intention conserve son propriétaire et son contexte complet ; authentification et parenté précèdent toute lecture ou mutation.

**Entrée :** File locale préparée pour compte A/projet P/variante V ; reconnexion de B ou navigation vers autre projet. Une variante de faute par test futur.

**Sortie candidate :** File A isolée/verrouillée selon politique approuvée ; aucune transmission au nom de B ni fuite du résultat/pièce d’A. Aucun réadressage à la variante visible.

**Oracle candidat :** Comparer propriétaire et scope de chaque intention ; requête/résultat ne divulguent pas les données interdites et zéro effet canonique dans le nouveau contexte. Conserver la demande d’origine au lieu de l’effacer pour afficher enregistré.

**Réemploi :** TEST-035. Rattachement candidat du TEST035 de contexte/projet au cas de compte changé, appuyé directement par NAV. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Le stockage local et son chiffrement/isolement restent des choix ouverts ; le scénario documentaire ne prouve pas leur réalisation.

**Trigger :** Définir les droits de lecture/reprise et le stockage de queue du sous-lot ; A4/A5 vérifient cas NAV liés avant tout essai.

### A.5-09/droit-revoque — Droit révoqué pendant interruption

**Propriété et autorité :** Les droits effectifs sont révalidés serveur ; un bouton ou une permission mise en cache ne fait pas autorité.

**Entrée :** Même compte et contexte, intention pending ; droit de mutation/lecture du résultat retiré avant reprise. Le commit antérieur éventuellement réussi est traité séparément.

**Sortie candidate :** Refus d’envoi ou de lecture non autorisés, état local explicite et brouillon conservé seulement selon politique autorisée. Aucun retour de données interdites ; aucun faux succès.

**Oracle candidat :** Zéro nouveau commit et aucune fuite. Ne pas annuler rétrospectivement un commit déjà durable ; le refus porte sur la nouvelle action ou la lecture actuelle. Les publications antérieures restent identifiables.

**Réemploi :** TEST-018, TEST-035. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** TEST018 porte directement publication ; extension à l’édition/reprise est candidate via M17/NAV. Aucun rôle réel ni permission physique attribué.

**Trigger :** Matrice de permissions approuvée et mécanisme de revalidation exposé par le futur lot ; preuve distincte de simple visibilité UI.

### A.5-09/nouvelle-demande-base-perimee — Nouvelle demande sur base ancienne, distincte d’un duplicata

**Propriété et autorité :** Une nouvelle intention doit satisfaire baseRevision/versions d’objets et de relations ; l’historique est immuable.

**Entrée :** Nouveau requestId après interruption avec base R0 alors que W/relations ont évolué ; variante alternative visant une révision historique en consultation.

**Sortie candidate :** Conflit/refus explicite ou recalcul/résolution autorisée ; aucun last-write-wins ni mutation de la révision historique.

**Oracle candidat :** Comparer canonique, références/hôtes, journal accepté et publication avant/après refus. Ne pas appliquer à ce cas la règle de restitution d’un ancien résultat déjà durable du cas ACK perdu.

**Réemploi :** TEST-012, TEST-011. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** La stratégie de fusion/rebase physique n’est pas choisie ; absence de conflit dans un exemple JSON ne la démontre pas.

**Trigger :** Après choix de versions/contrat et politique de rebase DEC12 : construire corpus avec mutation concurrente ciblée et revue A2/A5.

### A.5-09/contrat-queue-incompatible — Queue ou document d’une version non supportée

**Propriété et autorité :** Compatibilité du contrat/schema/lecteur est explicite ; une intention ancienne n’est pas rejouée avec des paramètres réinterprétés.

**Entrée :** Commande persistée avec contractVersion/schemaVersion non supporté, ou résultat dont le lecteur ne comprend pas les champs requis ; une faute ciblée par variante.

**Sortie candidate :** Refus/incompatibilité signalée, demande et provenance conservées pour résolution ; pas downgrade silencieux, purge de queue ou migration non autorisée.

**Oracle candidat :** Zéro engagement nouveau ; versions et intention d’origine encore traçables. Ne pas prétendre conservation universelle des champs inconnus par les lecteurs Atelier actuels : leur adéquation est un manque M05 documenté.

**Réemploi :** TEST-013. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Extension proposée au TEST013 ; formats et politique de compatibilité sont des choix M05/M17/DEC12, pas un nouveau schéma dans ce delta.

**Trigger :** Quand les choix résiduels catalogue de versions/clients offline sont tranchés, ajouter uniquement la table lecteurs/commandes touchée.

### A.5-09/fermeture-annulation — Fermeture UI ou annulation après commit ne réécrit pas l’histoire

**Propriété et autorité :** La navigation et l’annulation d’affichage ne commandent pas implicitement l’annulation métier ; une compensation est une nouvelle commande.

**Entrée :** Commande envoyée/commit confirmé ou indéterminé ; quitter la planche, fermer la fenêtre ou demander annulation. Cas distinct : résultat d’une ancienne génération arrive après capacité d’engager révoquée.

**Sortie candidate :** État pending/indéterminé/conflit conservé dans son contexte ; aucun effacement d’événement/publication. Si compensation autorisée, nouvelle intention avec révalidation. Résultat tardif non auto-engagé.

**Oracle candidat :** Comparer journal accepté et publication immuables ; garder les intentions et statuts de la file, pas de « sauvegardé » sans durabilité. En refus de compensation, le commit d’origine reste ; un cache abandonné n’est pas preuve d’annulation serveur.

**Réemploi :** TEST-011, TEST-014. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Aucune fermeture forcée, worker ou interruption réseau exécuté. Les timeouts et stratégies d’arrêt ne sont pas fixés par ce document.

**Trigger :** Réemployer les états M23 et NAV une fois la file durable/capacité d’annulation du lot est autorisée ; pas de nouveau gestionnaire de tâches.

### A.5-09/coupe-notification — Reprise incohérente ou notification dupliquée

**Propriété et autorité :** Une coupe cohérente de documents/révisions/journal/request-results/outbox fait autorité ; la notification n’est pas un second engagement.

**Entrée :** Combinaison documentaire volontairement incohérente de révision et résultats/journal/outbox, ou redélivrance du même eventId ; variantes séparées.

**Sortie candidate :** Incohérence signalée et pas de promotion/rejeu aveugle ; notification répétée n’ajoute ni commande ni publication. Resynchronisation depuis source autoritaire selon contrat à ratifier.

**Oracle candidat :** Comparer les liens de révision et identités de demande/événement ; aucun nouvel effet du doublon, aucune révision plus récente écrasée par un résultat ancien. Une série de GET ou un JSON parseable ne prouve pas la coupe.

**Réemploi :** TEST-013, TEST-014, TEST-038. Déclinaison candidate du catalogue existant ; aucun résultat exécuté. Sources exactes par identifiant/ligne dansJSON.

**Limite :** Extension candidate de ces oracles et de M23/M27 ; aucune restauration réelle ou transaction multi-autorité démontrée, mécanisme physique encore ouvert.

**Trigger :** Après décision sur coupe/epoch/commit et autorisation bornée de récupération, compléter le manifeste existant et fournir preuve de cohérence, sans second mécanisme de restauration.

## Preuve native actuelle et suivi Studio futur

L’inventaire DEC18 réemployé est daté au code `5e0285d37f23c7c539502664036f0a2ff0986409`. Sa présence dans un dossier duSHA2076 ne requalifie pas automatiquement l’exécution du code courant.

| Groupe natif | Preuve disponible | Ce qu’elle ne démontre pas |
|---|---|---|
| MTR-03 | API publiques rapportées : Modele, Vec3, Resultat, modeleVide, ajouterSegment, ajouterRectangle, maillagesPlanche, MaillagePlanche. Lecture statique, fichiers de tests présents. | Contexte/autorité/versions/profil/hauteur/direction/relation/historique/persistance et refus ciblés du lot Studio ; non déduit de ces API |
| MTR-06 | API publiques rapportées : OperationExacte, OptionsMoteur, SolideExact, CONTRAT_SOLIDE_EXACT=solide-exact/1, MoteurExact.charger, executer, exporterStep, mailler, validerOperation, memeResultat. Lecture statique, fichiers de tests présents. | Contexte/autorité/versions/profil/hauteur/direction/relation/historique/persistance et refus ciblés du lot Studio ; non déduit de ces API |
| MTR-08 | API publiques rapportées : Commande, Enveloppe, Effets, ResultatLot, appliquerCommande, appliquerLot, differentiel, appliquerDifferentiel, commandeInverse, CONTRAT_COMMANDES=atelier-commands/3, CONTRATS_ACCEPTES=1/2/3. Lecture statique, fichiers de tests présents. | Contexte/autorité/versions/profil/hauteur/direction/relation/historique/persistance et refus ciblés du lot Studio ; non déduit de ces API |
| MTR-09 | API publiques rapportées : Dessin, etatARevision, comparerModeles, comparerDessins, analyserFusion, cibleAnnulation, cibleRetablissement, rejouerLots, verifierModele, differencePlanche, appliquerDeltaPlanche, empreintePlanche. Lecture statique, fichiers de tests présents. | Contexte/autorité/versions/profil/hauteur/direction/relation/historique/persistance et refus ciblés du lot Studio ; non déduit de ces API |

Une extrusion géométrique native, un maillage conservé ou un inverse pur ne prouvent pas la relation de suivi Studio. Mesh/BRep et autorité canonique restent distincts ; aucun import UI profond ni moteur nouveau proposé. La déduction d’une sémantique BIM depuis une forme reste interdite.

## Décisions et reprise

- DEC02 : relation, cycle de vie, référence topologique et politique de rupture/fractionnement ; aucune cascade/attribution d’ID choisie dans ce delta.
- DEC12/M05/M17 : historique, déduplication et rétention, compatibilité des intentions offline ; distinguer restitution d’un résultat durable et nouvelle commande sur base périmée.
- DEC18 : opération/adaptateur public précis, version/provenance/licence et preuve native ciblée ; pas de remplacement de moteur décidé.
- EX020 et EX023 : autonomie du dessin et transformations/unités/repères explicites préservés. L’exemple36m³ est un prisme analytique synthétique, pas un résultat exécuté ni une tolérance universelle.
- G0 demeure accepté pour cadrage ; aucun G1/G2/G3/G4 accepté par ces scénarios. Toute réalisation ou POC exige son périmètre autorisé et les préconditions réelles.

A0 fait relire ce delta par A2/A5, référence ses seules preuves nouvelles aux quatre IDs et conserve les blocages physiques/autorisation ; aucune écriture canonique par A3.

**Condition de fin de cette préparation :** quatre tâches documentées, remises pour revue ; ne pas ouvrir d’autre copie ou étude spéculative. Attendre uniquement un retour ou un trigger précis pour les approfondir. Le JSON conserve sources Git/empreintes, citations exactes, distinction de preuve native et détails des20 sous-cas.
