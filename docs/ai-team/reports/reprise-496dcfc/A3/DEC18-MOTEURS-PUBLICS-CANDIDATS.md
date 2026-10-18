# DEC18/M17 — moteurs Fadi candidats par interfaces publiques

A3, lecture seule au SHA `5e0285d37f23c7c539502664036f0a2ff0986409` (PR171). **12 groupes candidats**, aucune intégration Studio ni fermeture DEC18/G1. Aucun moteur importé/exécuté, aucun test/POC/DB/service/source applicative modifié pour cet inventaire.

Les lots M003 A.1/A.2/A.3/B/C et les compléments G1 A1v2 sont réutilisés ; leurs empreintes et celles des sources figurent dans le JSON. Les tests cités sont des fichiers présents, pas des réussites nouvelles. La suite CLASSIF1 déjà exécutée conserve sa preuve datée distincte.

| ID | Moteur / chemins | Interface publique effective | Réserve principale |
|---|---|---|---|
| MTR-01 | Géométrie de parcelle et extraction du prototype Fadi — A,B,C | `@parcours/core-geometry@0.1.0` : Point2=readonly[number,number], BuildingModel, ModelGeometryResult, ColumnShapeResolver | Exports publics existants, à qualifier par primitive ; ne pas rétablir le magasin ou moteur monolithique historique. |
| MTR-02 | Primitives 2D et maillages 3D paramétriques Atelier — A,B,C | `@parcours/atelier-model@0.1.0` : Vec, aireNette, intersectionSegments, projectionSurSegment | Surface publique pour algorithmes, pas document2D canonique autonome déjà livré. |
| MTR-03 | Topologie libre 3D Planche et représentation dérivée — B,C | `@parcours/planche-model@0.1.0` : Modele, Vec3, Resultat, modeleVide | Noyau public sans React/three/DOM ; ne pas l’assimiler aux deux documents Studio ni à un renderer public. |
| MTR-04 | Inférences/snapping Planche et couture 2D non publique — A,B,C | `@parcours/planche-model@0.1.0` : EntreeInference, Inference, GeometrieVisible, Verrou | Inférence Planche publique ; snapping plan2D seulement export de fichier interne, pas API de package. |
| MTR-05 | Contraintes 2D Atelier et solveur mécanique3D — A,B,C | `@parcours/atelier-model@0.1.0` : ParamsContrainte, Systeme, ResultatResolution, systeme | Exports publics existants, deux domaines de résolution distincts ; pas solveur universel Studio validé. |
| MTR-06 | Noyau B-Rep exact OCCT via façade Fadi — B,C | `@parcours/geometry-exact@0.1.0` : OperationExacte, OptionsMoteur, SolideExact, CONTRAT_SOLIDE_EXACT=solide-exact/1 | Façade Fadi publique, noyau5.6.1 verrouillé ; client Worker actuel interne, non réutilisable comme API UI profonde. |
| MTR-07 | Booléens de maillage Manifold et interface injectée — B,C | `@parcours/planche-model@0.1.0` : AdaptateurBooleens.union/difference/intersection, Maillage, ContexteOutil, opererSolides | Interface Fadi publique et injection prévues ; implémentation chargerBooleens demeure interne apps/web. |
| MTR-08 | Commandes réversibles et modèle Atelier natif — A,B,C | `@parcours/atelier-model@0.1.0` : Commande, Enveloppe, Effets, ResultatLot | Contrat public pur de commandes Atelier, pas contrat physique C-COMMAND Studio déjà implémenté. |
| MTR-09 | Historique, versions, archives et synchronisation — A,B,C | `@parcours/atelier-model@0.1.0` : Dessin, etatARevision, comparerModeles, comparerDessins | Algorithmes publics utiles ; historique local Planche interne et service journal API non API de paquet partagée. |
| MTR-10 | Documents, vues, feuilles et rendus SVG/PDF/DXF — A,B,C | `@parcours/atelier-model@0.1.0` : Primitive, Bornes, VueGeneree, FeuilleComposee | Primitives/rendus publics réutilisables ; vues/feuilles actuellement alimentées par ModeleAtelier. |
| MTR-11 | Échanges IFC : export pur et adaptateur de lecture — B,C | `@parcours/atelier-model@0.1.0` : exporterIfc, OptionsExportIfc, RapportEchange, LectureIfc | Écriture texte et traduction lecture→commandes publiques/pures ; parseur binaire web-ifc actuellement dans API interne. |
| MTR-12 | Catalogue, machines outils et contrat Registry/Manager — A,B,C | `@parcours/planche-model@0.1.0` : Outil, OUTILS, outilParId, outilParRaccourci | Machines et catalogue publics ; ni ToolRegistry Studio versionné ni Manager de chargement complet constatés. |

## Contrats et preuves par candidat

### MTR-01 — Géométrie de parcelle et extraction du prototype Fadi

Chaîne : @parcours/core-geometry → src/index.ts export * geometry/parcel-geometry/site-zoning. APIs/types : Point2=readonly[number,number], BuildingModel, ModelGeometryResult, ColumnShapeResolver, buildModelGeometry, inwardOffset, buildingFootprint.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : README documente une extraction tracée du prototype Parcours, pas preuve de correction ni de droits externes. ColumnShapeResolver est un contrat explicite ; warnings de formes non prises en charge à conserver. Recul/offset et tolérances historiques ne deviennent pas normes Studio par supposition.

Adaptateurs à spécifier : Conversion explicite tuples/local/cadastral/unités vers document2D et contexte Projet ; aucune unité déduite de pixels. Choisir entre primitive réutilisable et contrat historique BuildingModel, sans créer un modèle3D obligatoire pour A.

Coûts à mesurer (aucun budget inventé) : Nombre de sommets, contours concaves/trous, précision/écart et coût des conversions ; Chargement/tree-shaking de l’entrée publique et coût mémoire par primitive.

Licence/provenance : README trace EMB.designer/Parcours_V8_19_Escalier_B_Mezzanine.html. Aucun champ license dans package ; droits propres à confirmer, autonomie opérationnelle distincte de propriété intellectuelle.

Preuves sources : `packages/core-geometry/src/index.ts:1` ; `packages/core-geometry/src/geometry.ts:123` ; `packages/core-geometry/README.md:7` ; `packages/core-geometry/src/parcel-geometry.ts:67`.

Tests présents seulement : `packages/core-geometry/src/geometry.test.ts`, `packages/core-geometry/src/parcel-geometry.test.ts`, `packages/core-geometry/src/site-zoning.test.ts`. Aucun nouveau test exécuté.

### MTR-02 — Primitives 2D et maillages 3D paramétriques Atelier

Chaîne : @parcours/atelier-model → index export * geometrie.js et exports nommés geometrie-3d.js. APIs/types : Vec, aireNette, intersectionSegments, projectionSurSegment, balayerSection, cylindre, fusionnerMaillages, MaillageBrut.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Vec objet différent du tuple core et du Vec3 Planche ; conversions typées explicites. TOLERANCE_REDUCTEUR=0.001m n’est pas le budget de fidélité Studio ; tolérances doivent être nommées par usage. Projection/tessellation est dérivée ; ne pas remplacer paramètres et relations canoniques.

Adaptateurs à spécifier : Document2D indépendant et interfaces primitives/IDs/repères à compléter selon G1 v2. Contrat d’extraction coupe/copie/association pour B/C ; aucun import profond de l’UI.

Coûts à mesurer (aucun budget inventé) : Erreurs numériques avant/après conversion et comportements dégénérés ; Temps/allocations pour tailles des corpus, coût d’import de l’entrée Atelier complète.

Licence/provenance : Code suivi natif Fadi, paquets workspace liés par lock ; licence propre non déclarée dans package.

Preuves sources : `packages/atelier-model/src/index.ts:4` ; `packages/atelier-model/src/index.ts:95` ; `packages/atelier-model/src/geometrie.ts:86` ; `packages/atelier-model/src/unites.ts:44`.

Tests présents seulement : `packages/atelier-model/src/geometrie-outils.test.ts`, `packages/atelier-model/src/projection/maillage.test.ts`. Aucun nouveau test exécuté.

### MTR-03 — Topologie libre 3D Planche et représentation dérivée

Chaîne : @parcours/planche-model → index export * geometrie-libre.js et representation.js. APIs/types : Modele, Vec3, Resultat, modeleVide, ajouterSegment, ajouterRectangle, maillagesPlanche, MaillagePlanche.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Topologie 3D et représentation de maillage, pas B-Rep exact. Une Planche aplatie z=0 ne satisfait pas à elle seule l’autonomie du documentA. Renderer/caméra/selection UI app/web ne sont pas publiés comme paquet partagé ; aucune extraction implicite.

Adaptateurs à spécifier : Identité document3D, versions, commandes/validation/durabilité et rendu via contrat public. Association 2D↔3D versionnée DEC02, IDs topologiques et remontée des ambiguïtés à concevoir.

Coûts à mesurer (aucun budget inventé) : Fidélité topologique/IDs faces après éditions ; Tessellation, mémoire et latence rendu séparées CPU/GPU/appareil réel.

Licence/provenance : Implémentation Fadi suivie ; README revendique aucune dépendance runtime et package le confirme. Licence propre non déclarée.

Preuves sources : `packages/planche-model/src/index.ts:3` ; `packages/planche-model/src/geometrie-libre.ts:186` ; `packages/planche-model/src/representation.ts:49` ; `packages/planche-model/src/vecteur.ts:10`.

Tests présents seulement : `packages/planche-model/src/geometrie-libre.test.ts`, `packages/planche-model/src/echanges.test.ts`. Aucun nouveau test exécuté.

### MTR-04 — Inférences/snapping Planche et couture 2D non publique

Chaîne : @parcours/planche-model → index export * inference.js. APIs/types : EntreeInference, Inference, GeometrieVisible, Verrou, ModeAlt, inferer, geometrieVisible.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : accrochage.ts est pur mais dépend du type etat-ui et de segmentsDuNiveau/ModeleAtelier. Pur ne signifie pas public. Aucun accélérateur spatial Studio prouvé par cette lecture ; sémantique de priorité/ambiguïté à conserver.

Adaptateurs à spécifier : Adaptateur document2D→géométrie visible sans niveau/modèle3D imposé. Référence de snapping et futur index C doivent produire mêmes cibles/ambiguïtés dans tolérance déclarée ; ne pas importer UI en profondeur.

Coûts à mesurer (aucun budget inventé) : Algorithme référence vs index : cibles équivalentes, cas superposés/trous/tangences ; Temps par requête et reconstruction du cache, tolérance écran→mètres explicitée.

Licence/provenance : Code natif Fadi, aucun tiers déclaré pour ce noyau. Licence propre à confirmer.

Preuves sources : `packages/planche-model/src/index.ts:10` ; `packages/planche-model/src/inference.ts:436` ; `packages/planche-model/src/inference.ts:576` ; `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts:255` ; `apps/web/src/modules/atelier/nouveau/plan2d/accrochage.ts:8`.

Tests présents seulement : `packages/planche-model/src/inference.test.ts`. Aucun nouveau test exécuté.

### MTR-05 — Contraintes 2D Atelier et solveur mécanique3D

Chaîne : @parcours/atelier-model → index export * contraintes.js ; export nomme resoudreContraintes depuis solveur mécanique. APIs/types : ParamsContrainte, Systeme, ResultatResolution, systeme, resoudreSysteme, appliquerSolution, diagnosticContraintes, resoudreContraintes, ContrainteSolveur, ResultatSolveur.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Solveur2D lié à ModeleAtelier/relations/esquisses ; MAX_VARIABLES200 et TOLERANCE_CONTRAINTE5e-6 sont des bornes sources, pas capacité garantie. Solveur mécanique poses rigides/liaisons ≠ contraintes topologiques d’un document2D ou conservation d’identité après B-Rep. Sur-contrainte, non convergence et références supprimées doivent rester des refus/diagnostics explicites.

Adaptateurs à spécifier : Projection contrôlée du document2D autonome vers le système de contraintes et restitution par commande de son écrivain. Contrat d’associations C, refus atomique et diagnostic stable selon DEC02/DEC06/DEC18.

Coûts à mesurer (aucun budget inventé) : Convergence/rang/résidu, singularités/redondances, limite nombre variables et temps ; Effet des tolérances physiques/unités et latence de résolution incrémentale.

Licence/provenance : Solveurs locaux Fadi, package sans tierce dépendance spécifique de solveur ; licence propre non déclarée.

Preuves sources : `packages/atelier-model/src/index.ts:38` ; `packages/atelier-model/src/index.ts:82` ; `packages/atelier-model/src/contraintes.ts:88` ; `packages/atelier-model/src/contraintes.ts:156` ; `packages/atelier-model/src/ontologies/mechanical/solveur.ts:42`.

Tests présents seulement : `packages/atelier-model/src/commandes/contrainte.test.ts`, `packages/atelier-model/src/contraintes-cercles.test.ts`, `packages/atelier-model/src/ontologies/mechanical/mechanical.test.ts`. Aucun nouveau test exécuté.

### MTR-06 — Noyau B-Rep exact OCCT via façade Fadi

Chaîne : @parcours/geometry-exact → exports ./src/index.ts ; classe MoteurExact publique. APIs/types : OperationExacte, OptionsMoteur, SolideExact, CONTRAT_SOLIDE_EXACT=solide-exact/1, MoteurExact.charger, executer, exporterStep, mailler, validerOperation, memeResultat.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Brep canonique/maillage dérivé distincts ; Planche demeure maillage selon D177/182/183, aucune conversion paramétrique silencieuse. Remplacement binaireWASM existant doit conserver licence/versions/empreinte ; reproductibilité et coût non remesurés ici. Client Worker interne état global/localStorage et messages ; pas isolation contextuelle Studio, annulation/timeout/worker pool prouvés.

Adaptateurs à spécifier : Contrat public d’exécution Worker/serveur, résultats liés document/revision/opération et refus résultat périmé. Publication du client derrière adaptateur indépendant UI/stockage, source confiance/version/URLWASM validée ; aucun code à ce stade.

Coûts à mesurer (aucun budget inventé) : Chargement froid/chaud, bytesWASM/mémoire, handles/libération et annulation ; Déflexion/volume/aire/faces avant-après et comparaison empreinte par version serveur/client.

Licence/provenance : occt-wasm5.6.1 : lock MIT OR Apache-2.0 pour wrapper/outillage ; README installé491–495 précise WASM LGPL-2.1-only. Règles D177/182/183 de binaire séparé remplaçable conservées ; conformité distribution à revoir A6, aucune nouvelle ratification des décisions déjà actées.

Preuves sources : `packages/geometry-exact/src/index.ts:20` ; `packages/geometry-exact/src/index.ts:248` ; `packages/geometry-exact/src/index.ts:252` ; `apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts:75` ; `apps/web/src/modules/atelier/nouveau/exact/exact.worker.ts:9`.

Tests présents seulement : `packages/geometry-exact/src/index.test.ts`, `apps/web/src/modules/atelier/nouveau/exact/operations.test.ts`. Aucun nouveau test exécuté.

### MTR-07 — Booléens de maillage Manifold et interface injectée

Chaîne : @parcours/planche-model → index→outils/index export * machine.js et export nommé opererSolides. APIs/types : AdaptateurBooleens.union/difference/intersection, Maillage, ContexteOutil, opererSolides.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Apache-2.0 manifold3.5.4 n’est pas DrawAll ; booléen de maillage jamais présenté comme B-Rep exact. Conversion Float32 et faceID conditionnel : fidélité/topologie et identités à qualifier, pas association stable supposée. Initialisation WASM et cancellation/timeouts/mémoire pas validés Studio.

Adaptateurs à spécifier : Adaptateur public au contrat existant sans import profond apps/web, cycle de vie et journal des pertes topologiques. Validation résultat et remontée erreur par commande native, pas écriture directe du modèle.

Coûts à mesurer (aucun budget inventé) : Coût conversion Float32 et pertes précision/faceID ; Temps booléen et fuite mémoire selon nombre faces ; chargement paresseux réel.

Licence/provenance : manifold-3d3.5.4 épinglé apps/web et lock intégrité, licence Apache-2.0 déclarée ; adapter Fadi suivi, dépendances transitives listées lock mais aucun audit complet SBOM effectué.

Preuves sources : `packages/planche-model/src/index.ts:13` ; `packages/planche-model/src/outils/machine.ts:153` ; `packages/planche-model/src/outils/index.ts:19` ; `apps/web/src/modules/atelier/nouveau/planche/booleens-manifold.ts:38`.

Tests présents seulement : `apps/web/src/modules/atelier/nouveau/planche/booleens-manifold.test.ts`. Aucun nouveau test exécuté.

### MTR-08 — Commandes réversibles et modèle Atelier natif

Chaîne : @parcours/atelier-model → index export * commandes/index.js ; types réexportés depuis base.js. APIs/types : Commande, Enveloppe, Effets, ResultatLot, appliquerCommande, appliquerLot, differentiel, appliquerDifferentiel, commandeInverse, CONTRAT_COMMANDES=atelier-commands/3, CONTRATS_ACCEPTES=1/2/3.

Réducteurs purs ne persistent rien. Écriture Atelier actuelle via API de commandes transactionnelle ; écrivains Studio uniques par autorité à établir M17/DEC03/DEC12. A3 ne crée aucun handler Studio sous cette analyse.

Limites : Ne pas renuméroter/downgrader les contrats pour aligner ancien README/manifest. L’enveloppe ne garantit pas seule tenant/projet/étude/variante/doc/revision/permissions, requestId et durabilité serveur Studio. Commandes et ontologies industrielles natives conservées ; aucun outil supprimé pour simplifier Studio.

Adaptateurs à spécifier : Relier C-COMMAND logique G1 à autorités séparées2D/3D/associé, baseRevision et versions de contrat distinctes. Adaptateur/handlers versionnés, atomicité complète et inverse exact, refus de résultat sans auteur autorisé.

Coûts à mesurer (aucun budget inventé) : Coût clone/diff/contrôles postcommande, taille du journal et rejouabilité ; Cas négatifs contexte/version/droit/second objet invalide sans effet partiel.

Licence/provenance : Modèle et réducteurs Fadi suivis ; package version0.1.0 distinct des contrats1/2/3 ; licence propre non déclarée.

Preuves sources : `packages/atelier-model/src/index.ts:21` ; `packages/atelier-model/src/commandes/index.ts:410` ; `packages/atelier-model/src/commandes/index.ts:452` ; `packages/atelier-model/src/commandes/base.ts:9`.

Tests présents seulement : `packages/atelier-model/src/commandes/commandes.test.ts`, `packages/atelier-model/src/commandes/classification-conservation.test.ts`, `packages/atelier-model/src/commandes/verrous.test.ts`. Aucun nouveau test exécuté.

### MTR-09 — Historique, versions, archives et synchronisation

Chaîne : @parcours/atelier-model → index export * versions.js/sync.js/reprise.js/archive.js ; Planche delta.js public séparé. APIs/types : Dessin, etatARevision, comparerModeles, comparerDessins, analyserFusion, cibleAnnulation, cibleRetablissement, rejouerLots, verifierModele, differencePlanche, appliquerDeltaPlanche, empreintePlanche.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Versions Atelier courantes et archives ≠ identité logique Projet→Étude→Variante→Révision. Historique local Planche pur limité200pas n’est ni journal serveur ni preuve de sauvegarde durable. Empreinte n’est ni autorisation, signature de publication ni preuve de restauration.

Adaptateurs à spécifier : Révisions immuables/contexte/auteur/parentage et writerAuthority M17G1v2, stockage/IDs physiques DEC03 ouverts. Frontière journal durable/rejeu local/publication ; formats anciens préservés sans migration supposée.

Coûts à mesurer (aucun budget inventé) : Taille/temps snapshot/diff/rejeu, reconstruction N révisions et conflits ; Durabilité/reprise après coupure et limites de rétention à spécifier sans toucher sauvegardes.

Licence/provenance : Code Fadi suivi, aucun moteur distant déclaré ; licence propre à confirmer. Le service API et le stockage réel ne sont pas éprouvés par cet inventaire.

Preuves sources : `packages/atelier-model/src/index.ts:44` ; `packages/atelier-model/src/versions.ts:53` ; `packages/atelier-model/src/sync.ts:61` ; `packages/planche-model/src/index.ts:14` ; `apps/web/src/modules/atelier/nouveau/planche/historique.ts:23`.

Tests présents seulement : `packages/atelier-model/src/versions.test.ts`, `packages/atelier-model/src/sync.test.ts`, `packages/atelier-model/src/reprise.test.ts`, `packages/atelier-model/src/archive.test.ts`, `packages/planche-model/src/delta.test.ts`. Aucun nouveau test exécuté.

### MTR-10 — Documents, vues, feuilles et rendus SVG/PDF/DXF

Chaîne : @parcours/atelier-model → index→documents/dessin,vues,feuilles,rendu-svg,rendu-pdf ; dxfVue/dxfFeuille nommés. APIs/types : Primitive, Bornes, VueGeneree, FeuilleComposee, genererVue, composerFeuille, elementsSvg, pdfPage, svgVue, pdfFeuille, dxfVue, dxfFeuille.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Primitive de rendu/document ≠ contenu canonique2D ni documentId/version de pièce/revisionId. PDF utilise WinAnsi : police/Unicode/FR-EN et normes dessin à qualifier par corpus, pas conformité présumée. Moteur ne fournit pas seul contrôle/approbation/publication exacte de l’ensemble M24.

Adaptateurs à spécifier : Projection du canoniqueA autonome vers primitives sans modèle3D fictif. Manifestes C-PUBLICATION versions/empreintes/droits et restitution des ressources/styles/annotations, refus état périmé.

Coûts à mesurer (aucun budget inventé) : Fidélité cotations/styles/polices/échelle/repères sur différentsformats ; Temps génération/bytes et mémoire, génération Worker/annulation/rendu navigateur distincts.

Licence/provenance : Générateurs locaux Fadi sans bibliothèque PDF déclarée par ce paquet. Licence propre et provenance des fontes/ressources finales restent à vérifier A6.

Preuves sources : `packages/atelier-model/src/index.ts:29` ; `packages/atelier-model/src/index.ts:36` ; `packages/atelier-model/src/documents/rendu-svg.ts:32` ; `packages/atelier-model/src/documents/rendu-pdf.ts:116` ; `packages/atelier-model/src/documents/vues.ts:861`.

Tests présents seulement : `packages/atelier-model/src/documents/documents.test.ts`, `packages/atelier-model/src/documents/historique-feuille.test.ts`, `packages/atelier-model/src/documents/axonometrie.test.ts`. Aucun nouveau test exécuté.

### MTR-11 — Échanges IFC : export pur et adaptateur de lecture

Chaîne : @parcours/atelier-model → index export * echanges/ifc.js/import-ifc.js. APIs/types : exporterIfc, OptionsExportIfc, RapportEchange, LectureIfc, ProduitIfcLu, OptionsImportIfc, commandesImportIfc, ResultatImportIfc.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : Import crée objet-importe/représentations/proxys ; pas conservation paramétrique intégrale ni certification BIM. Conversion Y/Z du lecteur et MapConversion explicites ; rotation/échelle/CRS non supportés rapportés, jamais devinés. Trois validations IFC historiques n’acceptent pas Studio et ne valent pas test nouveau.

Adaptateurs à spécifier : Contrat lecteur isolé/contextuel/limitesfichiers et ressourcesWASM ; traductions d’unités/repères/import partiel avec rapport. Publication M24 exactensemble et droits serveur ; pas exposition du parser interne par importprofond.

Coûts à mesurer (aucun budget inventé) : Types/entités/champs conservés vs pertes explicites, fidélité géométrique et quantités ; Taille mémoire parseur/fichier, temps import/export, isolation et interruption sûre.

Licence/provenance : web-ifc0.0.78 MPL-2.0 dans apps/api/lock ; export Fadi local distinct du parseurtiers. Licences distribution/provenance et contenus importés àqualifier, sanstest externe ici.

Preuves sources : `packages/atelier-model/src/index.ts:40` ; `packages/atelier-model/src/index.ts:41` ; `packages/atelier-model/src/echanges/ifc.ts:150` ; `packages/atelier-model/src/echanges/import-ifc.ts:133` ; `apps/api/src/lib/atelier-ifc.ts:12`.

Tests présents seulement : `packages/atelier-model/src/echanges/echanges.test.ts`, `packages/atelier-model/src/commandes/referentiels.test.ts`, `packages/atelier-model/src/annexe-c.test.ts`. Aucun nouveau test exécuté.

### MTR-12 — Catalogue, machines outils et contrat Registry/Manager

Chaîne : @parcours/planche-model → index export * catalogue-outils.js et outils/index.js→machine.js. APIs/types : Outil, OUTILS, outilParId, outilParRaccourci, rechercherOutil, MACHINES, machineParId, MachineOutil, ContexteOutil, EvenementOutil, Transition.

Fonctions pures : retour de données, aucune persistance. A2 fixe le contrat adaptateur, A3 implémente seulement après autorisation ; autorité serveur Studio et writer unique restent à décider physiquement en M17/DEC03/DEC12.

Limites : statutReleve observe/instructor/non-verifie/fadi est provenance de relevé UX, pas statut implémenté/vérifié/disponible. Map MACHINES ReadonlyMap côté type n’est pas preuve de scellement runtime ni de permissions. Icône/barre/raccourci et tactile de la règleD202 restent obligatoires ; ne pas transformer métadonnées en capacité active.

Adaptateurs à spécifier : Contrat Registry B : identity/version/domains/document/capabilities/deps/permissions, chargement et indisponibilité explicites. Manager lifecycle mount/unmount/cancel/error/worker, FR-EN/clavier/accessibilité, mêmescommandes sanswriterconcurrent.

Coûts à mesurer (aucun budget inventé) : Charge initiale/àla demande, mémoire/tempsactivation et récupération erreur ; Résolution identifiants/collisions raccourcis, couverture états/outils et intégrité des dépendances.

Licence/provenance : Implémentation Fadi ; catalogue cite observation/documentation SketchUp comme référence d’ergonomie, pas dépendance opérationnelle ni preuve de droit à copier des ressources. Licence propre et ressources icônes àqualifier.

Preuves sources : `packages/planche-model/src/index.ts:12` ; `packages/planche-model/src/outils/index.ts:24` ; `packages/planche-model/src/outils/index.ts:28` ; `packages/planche-model/src/outils/machine.ts:188` ; `packages/planche-model/src/catalogue-outils.ts:9`.

Tests présents seulement : `packages/planche-model/src/catalogue-outils.test.ts`, `packages/planche-model/src/outils/registre-formes.test.ts`. Aucun nouveau test exécuté.

## Limites transverses et suite autorisée

- Entrée package publique par exports ne signifie pas API Studio stable ou coût de chargement garanti. Une fonction exportée d’un fichier interne apps/web n’est pas une entrée publique partagée.
- Document2D A autonome : ne pas sérialiser une feuille/unSVG ou un modèle3D aplati à sa place. Réemplois algorithmiques ≠ nouveau canonique accepté.
- Écrivains uniques et contrôles serveur restent contrats physiques ouverts ; aucun moteur ne persiste directement dans une seconde base métier.
- Toutes les mesures de coût/performances/durabilité restent à faire sous autorisations G2/lot appropriées ; aucun chiffre de capacité inventé.
- D177/182/183 acceptées restent la référence : ne pas rouvrir le choix OCCT ou ajouter OCCT à Planche par simple réemploi.
- Aucune fermeture DEC18 ou lot, création de paquet, extraction d’UI, remplacement moteur ou codeStudio autorisée.

Le scan statique des imports directs des quatre noyaux (hors tests) ne trouve aucun import React ou DrawAll selon motifs déclarés. Il ne prouve pas une absence exhaustive des chemins dynamiques/transitifs ni la propriété intellectuelle de chaque source ; aucun dépôt DrawAll consulté ou modifié. Les paquets workspace n’ont pas de champ licence : àqualifier, sans inventer une licence.

Point OCCT : wrapper/outillage `MIT OR Apache-2.0` dans lock ; le README de l’artefact installé distingue le binaireWASM `LGPL-2.1-only`. Ne pas utiliser le seul champ lock pour prétendre le WASM permissif. Manifold3.5.4 Apache-2.0, web-ifc0.0.78 MPL-2.0 sont des tiers versionnés distincts de DrawAll, pas une preuve de distribution conforme.

- A2 relit les chaînes exports/APIs/types, limites et priorités des adaptateurs.
- A6 confirme licences propres/tiers/artefactsWASM et contraintes distribution/isolation.
- A1 rapproche les douze candidats des exigences et exemples G1v2 ; coût/tolérances/seuils restent DEC13 et dossierG2.
- A0 intègre au suivi canonique après revue, puis prépare seulement les demandes bornées requises pour futur code/POC.

Aucune mesure/runtime nouveau, aucune commande de test relancée pour ce document. Aucune proposition n’est présentée comme décision physique acceptée.
