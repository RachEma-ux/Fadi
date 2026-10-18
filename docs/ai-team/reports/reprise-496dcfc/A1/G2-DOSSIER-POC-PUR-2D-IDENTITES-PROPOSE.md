# G2 — Proposition bornée de POC canonique2D et identités, fichiersJSON locaux

Programme#156, A1 préparation. **POC non autorisé et non exécuté par ce dossier.** A0 peut soumettre cette portée à l'autorité déléguée dans#166 ; une décision doit citer les opérations permises, fichiers, critères et exclusions. G0 accepté et orientations DEC01/03 ne suffisent pas à lancer ce code. Aucun fichier d'implémentation, paquet, SQL, DB, API ou UI n'est créé ici.

## Question de faisabilité et limite de preuve

Peut-on représenter un document2D canonique autonome avec identitésProjet/Étude/Variante/Révision, réutiliser une primitive géométrique pure Fadi par interface publique et démontrer sauvegarde/réouverture **dans un fichierJSON local synthétique**, sans modèle3D de substitution et sans réécrire une révision historique ?

Ce POC peut renseigner une partie de DEC01/03/G2 : contraintes du modèlelogique, fidélité de sérialisation, identité et refus purs. Il **ne prouvera pas** choixphysique PostgreSQL, transactionserveur, isolationmulti-utilisateur réelle, sécuritéAPI, UI/mobile, éditioncomplèteA/B/C, publicationmétier, cacheSW/offlineproduction, restaurationdesauvegarde ou résistance matérielle àcoupure. Il ne ferme ni DEC01/03 physiques ni G1/G2/G3 automatiquement.

## Portée future proposée

| Inclus, seulement après accord | Exclus |
|---|---|
| Schémaillustratif de travail dans harnessjetable, Projet→Étude→Variante→Révision, document2D/IDs/calques/cote/annotation et contenuversionné | Nouveau formatnatifStudio ratifié, tables/migrations/paquets/dependances ou modifications application |
| Segment et contour2D synthétiques à coordonnées explicites, lecture/écriture de copies dans répertoire inédit dédié | Modèle3D fictif, moteurs3D/WASM/Workers/UI, navigateurs, serveurs/API |
| Calcul d'aire par exportpublic pur Fadi identifié et vérifié parA2 avant import | Réimplémenter un moteur ou importer moduleUIAtelier/DrawAll |
| Préconditions de révision et parenté en mémoire, refus sans effet dans harness | Authentification/droits réels, preuve d'isolationserveur ou base réelle |
| PersistanceJSONlocale exclusivement sur fichiers nouveaux, relecture et comparaison sans écraser origine | Réseau, DBdriver, PostgreSQL, API/E2E, init/restart, secrets, donnéesclients, production, restauration/rétention/migration |
| Mesures réelles éventuelles du harness et rapport explicite de ses limites | Seuils de perf/coût arbitraires, déduction capacitéproduit depuis un petitfixture |

### Réemploi Fadi candidat, constaté en lecture seule

`packages/core-geometry/src/index.ts` réexporte `parcel-geometry.ts`, qui expose `polygonArea(poly: readonly Point2[])` et `signedArea`, avec `Point2` venant de `geometry.ts`. Ce sont des calculs purs candidats pour le contour2D. **Aucun de ces exports n'a été exécuté par A1 dans cette préparation.** A2 doit confirmer frontière publique/absence effetderéseau/UI/initialisationlourde du chemin d'import retenu sur le SHA du futurPOC. Si un import public n'est pas utilisable sans élargissement, arrêter ce sous-point et documenter un adaptateur futur ; ne pas créer de package ni recopier silencieusement le moteur.

Fixture proposé : rectangle plan6×2m, aire attendue12m² par calculanalytique déclaré ; modification synthétique6→7m donne14m², mêmesidentitéspropriétaires, nouvelle révision, anciencontenu conservé. Segment/cote/annotation et calque source présents avec IDs stables ; géométrie3D absente. Ce sont des **données d'essai** et un oracle élémentaire, pas programmebâtiment ni norme/règlede métré générale. Tolérances géométriques et classes de primitives plus complexes restent à qualifier ; les chiffres entiers de ce test ne définissent aucun budgetprécision universel.

## Fichiers futurs à autoriser, sans création ici

Sous-répertoire neuf exclusif de `work/poc-g2-2d-<identifiantUnique>/` (cheminproposé, à borner par l'accord) :

- harness et caspurs versionnés sur branchecourte dédiée pour revue, hors application ; A0 décide le lieu exact des sources avant accord ; aucun nouveau workspace/package ;
- fixtures d'entrée synthétiques immuables avec manifestes/hash et mentions `illustrative-not-runtime` ;
- fichiersJSON de sortie nouveaux parrévision, journal local de simulation et rapport de comparaison ;
- rapport JSON/Markdown, versionNode/SHA/corpus/commande et logs expurgés.

Toute lecture doit être limitée aux exports publics purs explicitement inventoriés et aux fixtures. Toute écriture doit rester dans ce répertoire inédit ; refuser un chemin absolu horspérimètre, traversal, lien symbolique conduisant ailleurs ou cible existante. Pas d'écrasement d'un fichier utilisateur, de création de service ou de nettoyage destructif automatique. Pas de commit d'outputs volumineux/binaries. Le fait de préparer ces noms ne crée aucun fichierPOC ni autorisation d'écrire du code.

## Plan de vérification proposé, cas positifs et refus

| Cas | Résultat attendu à prouver dans futur harness | Ce que la preuve ne dira pas |
|---|---|---|
| Étude sansvariante | Cadrage/sources possibles, aucune géométrie produite | Pas serviceEtude réellement implémenté |
| Document2D sans3D | Segment/contour/calque/cote/annotation sérialisables et réouvrables sans donnée/chargement3D | Pas éditeur2D complet ni exportPDF |
| Réemploi aire | polygonArea sur rectangle synthétique donne12 puis14, oracleanalytique et provenance export/SHA tracés | Pas benchmark scènesdenses ni précision générale |
| Sauvegarder/fermer/rouvrir | Nouveau fichierJSON relu dans processus distinct si autorisé, mêmesIDs/valeurs/unités/calques/cotes/annotations et sourceRevision | Pas garantieDB/serveur ni crashmachine réel |
| Nouvelle révision | Ancienne révision/contenu inchangés, nouvelleversioncanonique référencée, hashdepiècepubliée non confondu | Pas formatphysique définitivement retenu |
| Mauvaiseparenté / varianteabsente | Refus, comparaison étatavant/après et absence fichiervalidé nouveau | Pas isolationtenant/authserveur |
| Mauvaisebase / mutationhistorique | Refus atomique ; ancienne révision récupérable inchangée | Pas concurrence serveur réelle |
| Deuxprimitives mêmeID / référencecoteinconnue | Refus explicite ou étatambigu selon contrat du cas, aucune réparation silencieuse | Pas topologiecomplexe associéeC |
| Unitéabsente / coordonnéenonfinie / schémainconnu | Refus ou lecturebornée explicitement définie, aucun défautmètre ni disparition de champ | Pas supportde tousformats historiques |
| Writer3Dpourdocument2D | Refus de contradiction d'autorité dans simulation | Pas moteur3D/BIM |
| JSON tronqué / octetsdivergents | Étatd'erreur, origine inchangée, aucune substitutionlatest ni déclaration de réouverturefidèle | Pas transactionFS matérielle/coupureélectrique certifiée |
| Destinationexistante/horspérimètre | Refus avant touteécriture, anciennesdonnées inchangées | Pas permissionglobale filesystem |

Le futur harness doit isoler la faute ciblée : réparer les empreintes auxiliaires lorsque le cas vise une faute sémantique, ou annoncer explicitement plusieursanomalies. Les dix exemplesdocumentairesG1v2 fournissent un pointdedépart, pas des testsproduit déjàpassés. Aucun affaiblissement/skip d'assertion pour obtenir un résultat vert.

## Persistance locale et rollback proposés

Le document de référence et les anciennesrévisions restent en lectureseule. Écrire seulement des nouveaux fichiers candidats, vérifier parsing/empreinte et n'annoncer «fichierlocalconfirmé» qu'après les opérations de fin d'écriture définies dans le contrat du harness. En cas d'erreurintermédiaire, garder le candidat comme invalide/nonengagé avec diagnostic ; ne pas écraser dernierétatvalide. Les garanties exactes du filesystem et d'une éventuelle promotion de nom doivent être décrites, pas assimilées à une transactionDB.

Retourarrière du POC : cesser d'utiliser ses sorties/branche et reprendre les originaux conservés ; aucune restaurationproduction ni migration. Les objetsnouveaux sont marqués expérimentaux, jamais chargés par l'application. Pas suppression d'un répertoire ou de données non bornées ; si nettoyage futur souhaité, il doit rester une opération explicitement admise sur propresartifactsjetables, pas effet implicite.

## Coûts et risques, sans chiffres inventés

Charge/délai, tailles, répétitions, temps et mémoire restent **à mesurer/chiffrer après accord** et revue de l'import. Collecter environnement/SHA/corpus, durée de calcul séparée de sérialisation/écriture/relecture et distribution seulement si protocole accepté. Les comptes minimes de la fixture ne promettent ni capacité100000primitives ni budgetmobile. Aucune dépense ou servicepayant.

Risques : import public entraînant effets inattendus ; illusion defidélité sur fixturetropétroite ; représentationcandidate prise pour formatnatif ; confusionversioncontenu/pièce ; fausseatomicitéFS ; fichiers horspérimètre ; empreinteJSONdémonstration prise pourcanonicalisationproduction. Mitigations : inventaireimportsA2, fixtureexplicitementbornée, labelsnonruntime, contrôledecheminetcréationexclusive, comparaisonavant/après, logs et limites écrites. Si l'une des préconditions ne peut être démontrée, arrêter uniquement ce sous-ensemble, conserver preuve et poursuivreautreREADY.

## Demande d'accord bornée à préparer dans#166

« Autoriser ou non un POC **harnesslocalJSON synthétique** sur branchecourte/sourcepérimètre fixé, réemploi d'exportsgéométriquesFadi purs inventoriés, nouveauxfichiersjetables dédiés, caspurs et rapports ci-dessus, sans DB/API/UI/réseau/production/migration ni modificationdesmoteurs. A2/A5 relisent portée/fixtures/imports et A0 réserve les fichiers. Aucun passageG1/G2/G3 automatique ni intégrationlogicielle autorisée. »

La demande reste proposée ; **aucun accord de code/POC n'est enregistré par ce dossier**. Les conditionspersonnes/disponibilités CAD-DEC-03 restent ouvertes. A0 doit citer la réponseeffective et le SHA du contrat avant activation d'un agent de code sur ce lot.
