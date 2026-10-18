# Missions Codex — programme complet Fadi / Studio

**31 missions, M00–M30.** Programme #156. Chaque mission s’exécute avec le [contrat commun](CODEX-START-HERE.md), les [sources et autorisations](SOURCES-AND-AUTHORIZATIONS.md) et le registre [missions.json](missions.json). Le contrat commun est une partie obligatoire de chaque prompt ci-dessous.

Les affectations Studio référencent **toutes les cases** des plages sources verrouillées : générer leur détail avec `check_missions.py --export` avant exécution. Les résumés suivants n’en remplacent ni le texte ni les critères. Un intitulé P0 Studio indique une priorité de fondation du plan, pas un défaut critique démontré de Fadi. La réutilisation d’une capacité demande des preuves, pas une recopie aveugle.

Pour chaque mission : identifier le responsable réel, les opérations autorisées, les entrées, les sous-tâches et les fichiers concernés ; renseigner dans la PR les livrables, tests par SHA, limites, retour arrière et prochaine action. Les correctifs et POC décrits ci-dessous restent à engager après l’autorisation applicable. A0 ne peut pas donner lui-même une validation utilisateur.

## M00 — Coordination et registre complet

**Agent :** A0. **Suivi :** #156. **Entrée :** demande utilisateur, audit archivé, Issues, règles de continuité.

Revalide HEAD et main, la branche du plan, #146/#147/#149/#151–#155 et les autorisations. Exécute le contrôle de couverture et attribue les 630 IDs à leurs missions. Réconcilie ce qui existe déjà, sans déclarer une réalisation depuis une case ou un ancien journal. Organise les missions par livrables prêts, réserve les fichiers partagés et supervise uniquement les agents réellement lancés. Maintiens le registre des blocages, décisions et preuves ; prépare les demandes d’autorisation par lot.

**Livrable / acceptation :** aucune mission ou tâche source orpheline ; périmètres et validations distincts ; tableau consolidé et checkpoint reprenable. Préparation enregistrée ne signifie pas programme exécuté. M00 reste transversal jusqu’à la clôture acceptée.

## M01 — Cloud, SHA et démarrage reproductible

**Agent :** A6, revue A5. **Suivi :** #157. **Entrées :** E01 de l’audit et configuration accessible.

Identifie la révision publiée réellement active, le brouillon éventuel, les scripts sauvegardés, les versions d’outils, le SHA de travail et son diff applicatif. Vérifie depuis une nouvelle session les services/API/DB/HTML avec une configuration locale non productive autorisée. Distingue moteur Cloud vivant, serveur démarré et sondes accessibles. Diagnostique ports et proxy sans contourner les permissions. Ne demande pas un changement de branche uniquement parce qu’elle s’appelle `work`.

**Livrable / acceptation :** fiche de reproduction, preuves de santé et limites ; toute publication inaccessible reste une action d’interface explicitement attribuée. Aucun secret ni VPS. La vérification du dernier brouillon ne réutilise pas la preuve d’une autre révision.

## M02 — Sécurisation des bases de tests

**Agent :** A5 spécifie, A2 revoit, A3 code seulement après accord, A6 isole. **Suivi :** #157.

Requalifie `apps/api/vitest.setup.ts`, `src/db/client.ts`, les `TRUNCATE CASCADE` et tous les points d’entrée API/E2E/migration. Définis une politique de refus fermé avant connexion et avant nettoyage : cible explicitement provisionnée pour ce run, rôle limité, provenance/configuration explicites et impossibilité de retomber sur une DATABASE_URL héritée inconnue. Un nom, localhost ou un simple drapeau ne suffisent pas seuls. Prépare tests négatifs avec doubles de connexion pour prouver qu’aucune connexion/destruction n’a lieu sur cible interdite, puis, après accord, implémente la garde et vérifie sur une base jetable.

**Acceptation :** cible absente, malformée, ambiguë ou non autorisée refusée sans accès destructif ; cible jetable autorisée fonctionne ; suites branchées au même contrôle. Pas de données de production, pas de test du refus sur une vraie base sensible.

## M03 — Protections administratives de main

**Agent :** A6, validation administrateur. **Suivi existant :** #146, #151/PR #152.

Relis les réglages déjà préparés et vérifie l’état administratif actuel, les bypass, les checks réellement disponibles et la politique de revue possible avec les personnes habilitées. Propose PR obligatoire, interdiction force-push/suppression et contrôles requis sans créer une approbation impossible. Applique uniquement si l’accord et l’outil administratif existent ; sinon donne les manipulations exactes et maintiens le blocage. Aucun contournement ni collecte de secret admin.

**Acceptation :** preuve d’activation et essai d’application des règles sur PR de test autorisée ; une proposition JSON ou un fichier AGENTS ne protège pas une branche. Séparer préparation terminée et activation bloquée.

## M04 — CI, reproductibilité et preuves courantes

**Agent :** A5/A6. **Suivi :** #157. **Entrées :** M01 et protections M02 avant essais écrivant en base.

Reconstitue la matrice des commandes et conditions : dépendances, typecheck, tests, build, E2E, IFC, image Docker, restauration et banc optionnel L19. Compare Node/npm/Python/Chromium/Playwright/IfcOpenShell et les versions CI ; ne force pas une mise à jour globale sans décision. Exécute les contrôles autorisés sur le SHA identifié et un environnement jetable. Prépare les mesures sur appareils réels sans prétendre les avoir effectuées. Ne convertis pas les 1 757/47/3 résultats historiques en résultats courants.

**Acceptation :** chaque ligne a SHA, environnement, commande, résultat, preuve et limite ; tests ignorés/non exécutés visibles, réimport IFC qualifié par fidélité/entités, état CI de la tête courante vérifié. Aucun faux « tout vert » si preuve manquante.

## M05 — Contrats Atelier et compatibilité

**Agent :** A2 ; A3 après accord ; A5 teste. **Suivi :** #158.

Vérifie la divergence du manifeste Atelier et du contrat de commandes v3, les consommateurs API/web et la compatibilité v1/v2. Prépare l’alignement minimal sans casser de données ni inventer une version. Après autorisation, applique le correctif borné avec test automatique de cohérence et cas de compatibilité/rejet de version.

**Acceptation :** manifeste, code, documentation et tests cohérents sur le même SHA ; compatibilité explicitée, périmètre de migration s’il existe soumis séparément. Aucun couplage React dans les modèles purs.

## M06 — Documents, statuts et relais cohérents

**Agent :** A0/A1, revue A2/A5. **Suivi :** #158 et #153/PR #154.

Requalifie README des modules, statuts de droits/membres, décisions OCCT et acceptations Atelier/Planche. Actualise les points d’entrée avec références aux décisions existantes sans effacer leur histoire. Réconcilie les STATUS/HANDOFF de purge avec fusion réelle #148 et inventaire restant #147. Traite les remarques de #154 dans son suivi, avec ordre HANDOFF → STATUS → TASKS → CONTEXT et checkpoint avant revue ; ne recrée pas le fichier dans une branche concurrente sans coordination.

**Acceptation :** documents cohérents avec preuves datées, limites explicites, chaque chantier modifié comporte STATUS/HANDOFF ensemble. Ni fusion de PR ni clôture automatique d’une Issue dont les réserves persistent.

## M07 — Frontières et dépendances natives

**Agent :** A2, A3 pour changements autorisés, A5. **Suivi :** #151/PR #152.

Commence par lire le diff, les tests et les limites de #152 : ne pas reproduire son travail. Cartographie les imports/extractions/contrats et les frontières des sept modules, des applications et des paquets ; distingue cycle de paquets, imports réciproques entre modules et dépendance permise. Fais approuver la carte autorisée avant d’étendre le contrôle. Prépare ou complète le correctif borné dans le suivi approprié après accord, avec cas négatifs et témoins positifs.

**Acceptation :** périmètre exact du scanner, graphe et exceptions justifiées, contrôles vérifiant le dépôt réel ; aucune refonte générale présumée ni affaiblissement des tests pour passer la CI.

## M08 — Isolation technique et documentaire

**Agent :** A2/A1/A5. **Suivi existant :** #147 ; #148 et #152 comme preuves à requalifier.

Termine la qualification de l’inventaire : dépendances actives directes/indirectes, imports, lockfiles, configurations, ressources et documentation opérationnelle. Distingue historique, identifiant de compatibilité, norme officielle/licence et référence contractuelle à l’autre produit. Vérifie les titres et points d’entrée résiduels. Prépare puis applique seulement les corrections autorisées en conservant les capacités industrielles et règles de dessin natives Fadi.

**Acceptation :** chaque élément maintenu/retiré est justifié ; aucun lien opérationnel non traité dans le périmètre qualifié ; limites du scanner exposées ; aucun changement dans DrawAll. Ne pas clôturer sur la seule réussite d’une recherche nominale.

## M09 — CSP et vulnérabilités des dépendances

**Agent :** A5, A2, A3 après accord, A6. **Suivi :** #157.

Requalifie CSP/Helmet et la couverture des scans. Prépare une CSP compatible avec Workers/WASM, rendu, authentification et navigation ; définir une introduction progressive et sa preuve sans ajouter des domaines arbitraires. Prépare le scan des dépendances et son triage : impact, exposition, remède, faux positifs justifiés, exceptions datées. Après autorisation, livrer le durcissement borné et les tests adaptés, sans mise à jour massive injustifiée.

**Acceptation :** restrictions et compatibilité testées ; résultats sourcés/versions précises, risques résiduels explicites. Absence d’un scan ou CSP désactivée ne vaut pas preuve d’exploitation ; aucun test d’intrusion non autorisé.

## M10 — Jalons Fadi production et sauvegardes

**Agent :** A6/A0, validation utilisateur. **Suivi existant :** #149 et exploitation.

Reconstitue les preuves des jalons décontamination → production autorisée et vérifiée par l’utilisateur → sauvegarde post-validation → audit → lots. Ne présume pas qu’un jalon n’a pas eu lieu parce que sa case est vide, et ne le répète pas depuis un journal ancien. En cas de preuve manquante, enregistrer ce manque et l’action nécessaire. Toute nouvelle opération réelle requiert son accord, le SHA/version, la santé et un retour arrière ; la sauvegarde préalable n’est pas la sauvegarde post-acceptation.

**Acceptation :** PV, validation, snapshot et contrôle de restauration identifiés dans le suivi d’exploitation, sans secret. Cette mission ne remplace pas la future livraison Studio M28. Les diagnostics préparatoires ne lèvent pas les gates de #149.

## M11 — Studio sources, périmètre et G0

**Agent :** A1/A0, contributions A2/A4/A6. **Suivi :** #159. **Source affectée :** chapitre 1, G0 et annexe D.

Identifie les versions exactes REF-01/REF-02/plan/checklist et leurs empreintes ; lis les documents originaux. Fixe DEM-01 et distingue obligation, proposition, observation historique et arbitrage ouvert. Prépare le petit usage métier terminable, utilisateurs, corpus, responsabilités, options incluses/exclues et critères. Conserve les quatre domaines et les trois parcours, sans inventer leurs contrats absents. Fais ratifier G0 et les critères ; ne traite ni placement « après Projets », ni routes, paquets ou budgets comme décidés.

**Acceptation :** sources/provenance enregistrées, cadrage explicite et décision G0. Pas de suppression d’Atelier, modification des 21 étapes ou seconde application/base concurrente.

## M12 — Studio qualification des 141 fiches

**Agent :** A1/A2/A5. **Suivi :** #159. **Source affectée :** annexe C, TR-EX/TR-INV/TR-IF/TR-AC.

Extrais le texte exact des 104 exigences, 15 invariants, 11 interfaces et 11 critères dans REF-02. Pour chaque fiche, relie source/version, responsable, contrat, composant existant/candidat, tests positifs/négatifs, preuves et DEC applicables. Distingue capacité présente, couverture partielle et inconnue ; pas de faux taux d’avancement. Ne remplace pas les libellés par des connaissances générales.

**Acceptation :** 141 fiches qualifiées individuellement avec limites ; une fiche complète peut constater une non-conformité. Sa clôture n’accepte pas la fonction. Ne pas cocher les recettes ou livraisons par dérivation.

## M13 — Studio navigation, architecture et G1

**Agent :** A2/A4, A1 valide le métier, A5 prépare NAV. **Suivi :** #159. **Source :** chapitres 2/3, G1, décision d’intégration du chapitre 10.

Requalifie App/AppShell/ProjectShell, mode immersif, registre et contrôles sur le SHA réel. Spécifie Studio dans la barre verticale, contexte projet autorisé, URL directe/retour/reprise, mobile, clavier, plein écran explicite et états d’erreur. Définis les autorités séparées 2D/3D libre et commune des objets associés, commandes/permissions/versionnement, APIs partagées et coexistence Atelier sans double écriture. Formalise les arbitrages, puis G1, avant implémentation.

**Acceptation :** contrat d’intégration et critères NAV-001–009, sources d’autorité et interfaces vérifiables ; recettes NAV exécutées seulement une fois les capacités disponibles en M16. Pas d’iframe, pas d’usage des mindmaps HTML comme application, pas de renommage automatique de l’architecture cible.

## M14 — Studio décisions, POC G2 et G3

**Agent :** A2/A0, responsables métier/qualité/DevOps concernés. **Suivi :** #159. **Source :** G2/G3 et DEC-01–18.

Instruis chacune des 18 décisions avec options, preuves nécessaires, effets, responsabilité et statut. Priorise celles du sous-lot à engager ; ne bloque pas tout le pilote sur une option indépendante. Définis les POC ciblés (autonomies, associations, conflits, chargement, reprise, publication), fais autoriser leur périmètre, exécute les seuls POC autorisés sur corpus sûr et publie les preuves. Arbitre composants, interfaces, migration/retour arrière et chiffrage avant G3 du sous-ensemble.

**Acceptation :** aucune inconnue clôturée artificiellement ; DEC et G2/G3 appuyés sur preuves/validation explicites. Une preuve isolée n’autorise pas l’implémentation générale. Les 18 décisions peuvent se résoudre au fil des lots concernés.

## M15 — Studio X, mesures et risques transversaux

**Agent :** A5/A2/A6, A1 pour budgets d’usage. **Suivi :** #160. **Source :** lot X, protocole de mesure, mesures de risque RISQ.

Prépare dès le début S1 détail 2D, S2 plan, S3 dense, S4 multi-niveaux, S5 libre complexe, S6 variantes/révisions, S7 hors réseau, avec données autorisées. Définis l’oracle, l’instrumentation, les preuves, la sécurité et le registre EX/INV/IF/AC↔composants↔TEST/NAV↔DEC. Mesure séparément réseau, activation, calcul, CPU/GPU, invalidation et mémoire ; identifie appareil, navigateur, cache, build et distribution. Traite les dix risques sans perte fonctionnelle.

**Acceptation :** corpus/versionnement et contrôles utilisés dans les lots ; budgets DEC-13 décidés, pas de seuil inventé. Mission transversale : préparer tôt, compléter les preuves au fil des livraisons, pas attendre sa clôture totale pour avancer.

## M16 — Studio lot I intégration native

**Agent :** A4/A3 après accord, A2/A5. **Suivi :** #160. **Source :** lot I.

Après contrats et G3 applicables, ajouter descripteur/entrée Studio à l’emplacement décidé, StudioShell authentifié indépendant du Parcours, routes et chargement à la demande, sélection explicite du projet/étude, bandeau et retour cohérents. Maintenir quatre domaines et deux planches uniquement dans Dessin et modélisation. Protéger gestes et sauvegardes en attente, navigation verticale, accessibilité, menu mobile et sortie plein écran.

**Acceptation :** maquette validée, NAV-001–009 et non-régression des accès existants ; un accès Studio seul est une intégration technique, pas un éditeur ou pilote métier livré. Partager la résolution de contexte sans dépendance cachée à ProjectShell.

## M17 — Studio A.1 données durables

**Agent :** A2 modèle/backend, A3 après accord, A5. **Suivi :** #160. **Source :** A.1.

Après DEC/G3 applicables, définir puis livrer Projet→Étude→Variante→Révision, documents 2D libres, modèles 3D libres, objets associés et préférences UI distincts. Versionner schémas, identités/provenance et préparer les migrations autorisées. Fournir API/adaptateurs avec permissions et appartenance serveur, puis sauvegarde/fermeture/réouverture durable avant d’étendre le catalogue d’outils.

**Acceptation :** entités et contexte restitués sans double autorité, migration qualifiée, contrats stables pour M18/M19/M21. Une démonstration en stockage local n’est pas une persistance partagée validée.

## M18 — Studio A.2 planche 2D autonome

**Agent :** A3/CAO après accord ; A2/A4/A5. **Suivi :** #160. **Source :** A.2.

Exécute toutes les tâches A.2 avec le modèle de document M17 : création indépendante, outils usuels retenus, tracés/édition, précision, cotation/annotation et sauvegarde/reprise, sans 3D obligatoire. Sépare données canoniques, affichage et vues dérivées ; respecte les contrats et la règle d’outillage Fadi. Qualifie les fonctions existantes avant réutilisation.

**Acceptation :** parcours 2D utilisable et tests du sous-lot, sans fausse clôture de TEST-001 tant que feuille/publication dépendant d’E ne sont pas prouvées. Compatibilité documentaire liée à M24/M26.

## M19 — Studio A.3 planche 3D autonome

**Agent :** A3/CAO après accord ; A2/A4/A5. **Suivi :** #160. **Source :** A.3.

Livrer le sous-ensemble spatial indépendant décidé : création directe, édition de faces/volumes et transformations, sauvegarde/réouverture et vue/coupe plane. Aucune esquisse 2D préalable imposée et aucune sémantique BIM automatiquement attribuée à la géométrie libre. Isoler préférences/caméra, définition géométrique et rendu.

**Acceptation :** parcours 3D autonome vérifié, erreurs explicites, fidélité et limites du moteur établies. Les opérations lourdes exposées possèdent déjà les protections minimales de reprise nécessaires ; pas de remplacement de noyau sans décision.

## M20 — Studio A.4/A.5 association et commandes

**Agent :** A2, A3 après accord, A5. **Suivi :** #160. **Source :** A.4/A.5 et acceptation A.

À partir des contrats stables et des planches autonomes, livrer les objets associés, hôtes/références, propagation contrôlée, copie indépendante, journal/historique et commandes transactionnelles. Tester refus atomique, idempotence, conflits, undo/redo concurrent, perte réseau et résultat périmé ; invalider les dérivés après engagement canonique seulement.

**Acceptation :** preuves des scénarios A applicables ; cas mur/ouverture avec hypothèses sources, brut 3,600 m³ puis nets 3,180 et 3,096 m³, sans déductions ajoutées arbitrairement. La copie indépendante ne réécrit pas sa source. Les critères finaux de migration/publication attendent leurs preuves aval, pas une validation anticipée.

## M21 — Studio B Registry, Manager et chargement

**Agent :** A4/frontend, A2, A3 après accord, A5. **Suivi :** #160. **Source :** lot B.

Réconcilie les catalogues, toolId, alias, propriétaire, permissions, loaders et dépendances. Livre Registry/Manager et profils standard/métier/personnels, favoris/recherche/raccourcis selon décisions. Sépare visibilité, disponibilité et droit d’exécution. Implémente activation/désactivation, chargement sélectif réel, mutualisation, précache, préparation hors-ligne, conflits de version et protection des commandes locales.

**Acceptation :** profils persistants sans changement de géométrie/révision/droits ; preuves réseau/mémoire à froid/chaud et TEST applicables. Le profil d’essai de vingt outils n’est ni catalogue complet ni plafond du produit ; une barre masquée n’est pas un bundle non téléchargé.

## M22 — Studio C indexation et rendu incrémental

**Agent :** A2 géométrie/rendu, A3 après accord, A5. **Suivi :** #161. **Source :** lot C.

Mesure d’abord les recherches et projections actuelles ; instruis les DEC index/snapping, rendu/invalidation et qualité. Implémente le sous-ensemble accepté en comparant les résultats à l’oracle, les hôtes et dépendances, les tables de picking et les reconstructions partielles. Exposer les concessions visuelles décidées sans altérer mesures ou exports.

**Acceptation :** mesures par corpus et appareil, exactitude conservée, tests d’insertion/suppression/invalidation et non-régression ; pas de gain annoncé sans données, ni remplacement global du renderer par défaut.

## M23 — Studio D workers, mémoire et reprise

**Agent :** A6/calcul, A2, A3 après accord, A5. **Suivi :** #161. **Source :** lot D.

Définis classes/priorités/quota de jobs et leurs empreintes/révisions ; raccorde commandes, chargement et instrumentation. Livrer annulation, temporisation, erreurs, redémarrage du worker exact, résolution des tâches en attente et exclusion des résultats périmés. Maîtriser transferts de buffers, ressources GPU/WASM et mémoire résiduelle.

**Acceptation :** crash/reprise sans doublon ni engagement partiel ; TEST-014/015/037 et AC-006 applicables. Pas de worker par cœur ou noyau par outil imposé ; protections minimales avant exposition d’une opération lourde, même si l’ordonnanceur complet est ultérieur.

## M24 — Studio E dossier métier et publication

**Agent :** A1/BIM-documentation, A2/A4, A3 après accord, A5. **Suivi :** #162. **Source :** lot E entier.

Livrer propriétés BIM du pilote, exigences distinctes/versionnées, écarts, références partenaires, observations uniques, tâches, recontrôle et clôture par droits. Produire vues, feuilles, dossiers, métrés bruts/déductions/nets et ajustements tracés dans le catalogue partagé. Fournir visualisation de base et provenance ; distinguer rendu modèle, IA contrainte et exploration libre. Construire revue/approbation/publication avec manifeste figé multi-sources, statuts séparés et rejet des approbations périmées. Qualifier formats par sens/version/entité et pertes, sans promesse de couverture universelle.

**Acceptation :** trois parcours utiles, étude associée contrôlée/corrigée/approuvée/publiée et dessin 2D publiable ; tests et AC du périmètre. IA ou immersion reportées ne suppriment pas le domaine Visualisation du pilote.

## M25 — Studio F capacités avancées conditionnelles

**Agent :** A2/A1/A4/A5, A3/A6 selon option autorisée. **Suivi :** #163. **Source :** lot F.

Instruire chaque accélération/renderer alternatif, immersion/rendu avancé, mode IA, extension et MCP facultatif avec contrat, risque, licence, coût, droits, confidentialité et provenance. Obtenir une décision explicite par option. Exécuter toutes les capacités retenues après leurs preuves/accords ; maintenir les options reportées/exclues dans le suivi, sans les déclarer livrées.

**Acceptation :** preuve propre à chaque option, mêmes commandes/permissions/confirmations que l’humain ; aucun appel distant à chaque mouvement ni mutation BIM implicite. Le pilote ne dépend pas des options officiellement exclues. Aucun achat/transfert privé non autorisé.

## M26 — Studio scénarios et critères éliminatoires

**Agent :** A5, recette utilisateur A1/A4. **Suivi :** #162. **Source :** trois parcours, conditions éliminatoires et 38 TEST de l’annexe A.

Prépare tôt les scénarios et leurs données, puis exécute ceux dont les capacités et cibles jetables sont prêtes. Relie NAV sans doubler les scénarios. Vérifie 2D indépendante jusqu’à publication, 3D directe et parcours associé incluant conflits, métrés, observations et approbation. Recueille les retours utilisateurs réels. Bloque la livraison pour double autorité, perte/corruption, accès inter-projets, commande doublée, résultat périmé ou publication non couverte par l’approbation.

**Acceptation :** attendus/commandes/résultats/preuves par SHA, causes d’échec et tests non exécutés visibles. Un défaut éliminatoire ne disparaît pas devant une bonne moyenne de performance. Aucun « non applicable » sans motif et validation du périmètre.

## M27 — Studio migration et exploitation sans perte

**Agent :** A6/A2/A5, A3 pour migration autorisée. **Suivi :** #164. **Source :** chapitre 8.

Inventorie les données et dépendances historiques, simule la migration sur copies autorisées, compare avant/après, traite les références et l’historique. Définis un propriétaire d’écriture unique pendant coexistence, redirection ou lecture seule des accès historiques, conditions d’un éventuel retrait et procédure de retour arrière. Qualifie sauvegarde/restauration des géométries, documents, droits, historiques et manifestes.

**Acceptation :** simulation et comparaison reproductibles, restauration prouvée et pertes/réserves traitées. Ne pas mélanger sauvegarde de production et jeux jetables, ne pas synchroniser artisanalement deux bases métier, ni retirer Atelier sans décision.

## M28 — Studio R, G4 et mise en service

**Agent :** A6/A0/A5, acceptation utilisateur. **Suivi :** #164. **Source :** lot R et G4.

Prépare le build candidat et ses versions, les preuves des parcours, les résultats de migration/restauration et la procédure d’exploitation. Obtiens l’acceptation G4 du périmètre et une décision distincte de déploiement. Si autorisée et accessible, effectue la bascule progressive avec sauvegarde restaurable préalable, journal des versions, contrôle du site par l’utilisateur puis sauvegarde du nouvel état accepté ; surveille les erreurs et ressources.

**Acceptation :** preuves de recette, restauration, mise en service et validation utilisateur, états déployé/accepté distincts. Sans accord/capacité de production, livrer le dossier et maintenir l’étape réelle bloquée, pas « terminée ». Ne pas changer rétention/timer par opportunité.

## M29 — Studio pilotage GitHub et checkpoints

**Agent :** A0, chaque responsable pour ses preuves. **Suivi :** #156. **Source :** chapitre 9.

Maintiens les documents directeurs dans Studio/ et le chantier opérationnel dans docs/workstreams/studio/ sans seconde autorité normative. Complète responsables, contrats, registre EX/INV/IF/AC↔composants↔TEST/NAV↔preuves↔DEC et suivi par tâche ; artefacts lourds identifiés par lien/empreinte. Une Issue par unité cohérente, branches courtes et PR avec périmètre/risque/tests ; actualise STATUS/HANDOFF ensemble et conserve la prochaine action exacte.

**Acceptation :** reprise fiable, distinction implémenté/vérifié/accepté et états de test/conformité séparés. Les contrôles récurrents PR/reprise sont réexécutés à chaque occurrence, pas cochés une fois pour toute la vie du projet.

## M30 — Studio séquence, jalons et clôture

**Agent :** A0/A1/A5. **Suivi :** #156. **Source :** chapitres 6 et 11.

Planifie selon G0–G3 applicables puis I/X/A.1, A.2/A.3 et B sur contrats stables, association/commandes, C/D selon charge, E et R ; F reste conditionnel. Qualifie J0–J8 et leurs limites, choisis le pilote réellement terminable et chiffre après audit/disponibilités, sans calendrier arbitraire. Vérifie PASS-01–07 puis FIN-01 avec preuves et acceptation.

**Acceptation :** aucune étape sautée ni mission abandonnée ; tous les éléments du périmètre accepté prouvés, options et blocages explicitement distingués. La clôture de couverture 630/630 n’est pas une clôture métier. Ne pas fermer #156 ou les groupes sur la seule création de ce catalogue.
