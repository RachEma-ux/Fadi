# A6 — Revue indépendante DEC18, licences et frontières publiques

Référence Git de chaque source suivie : **5e0285d37f23c7c539502664036f0a2ff0986409**, PR171. Inventaire A3 DEC18-MOTEURS-PUBLICS-CANDIDATS.json/.md lus ; contrôle indépendant des70sources SHA256/blobs, quatrepackage.json, lock et99citations (98lignes complètes,1extrait partiel verbatim du READMEcore ligne7). **Zéro discordance**. Le JSON de revue cite le commit et le blob de chaque source suivie ; les artefacts npm non suivis ont explicitement commitnull et SHA256 distinct, sans leur inventer un SHA Git.

Lecture seule : aucun module importé/exécuté, aucun moteur/Worker/DB/service/scan/POC/code source modifié ; aucun accès réseau nécessaire à cette revue. Les492tests CLASSIF1 demeurent leur preuve séparée, pas une exécutionDEC18. **Aucune clôture DEC18, G1 ou G2.**

## Frontières des douze groupes

| Groupe | Conclusion statique de revue | Limite conservée |
|---|---|---|
| MTR01 coregeometry | Entréepackage et exportsgeometry/parcel/site-zoning présents | Extractionprototype documentée, pas preuve de droits ni d’exactitude générale |
| MTR02 primitivesAtelier | Exportsgéométrie et géométrie3Dnommés présents | FormatsVec/unités distincts, pas document2Dcanonique livré |
| MTR03 topologiePlanche | géométrielibre/représentation exposées au package | PasBRep ni rendererpublic ni deuxdocumentsStudio |
| MTR04 inférence/snapping | inférencePlanche publique ; accrochageplan2d demeure fichierinterneappweb | Pur≠public, typeetatUI et dépendances àadapter |
| MTR05 contraintes | contraintesAtelier et solveurmécanique exportnommé présents | Deuxdomaines, pas solveuruniversel accepté |
| MTR06 exactOCCT | FaçadeMoteurExact publique via geometry-exact | Entréeimporteocct-wasm statiquement ; effets/coûts chargement et adaptationWorker non certifiés |
| MTR07 Manifold | InterfaceAdaptateurBooleens/opererSolides accessibleviaPlanche | ImplémentationchargerBooleens interneweb, pas APIpubliqueStudio |
| MTR08 commandes | Enveloppe/réducteurs/types exposés | ContratAtelier≠stockage/permissions/durabilitéStudiophysiques |
| MTR09 historique | Fonctionsversions/sync/reprise/archive etdelta publiquementexposées | HistoriqueUI/APIinternes et queuecourante ne deviennent pas journalStudio canonique |
| MTR10 documents | Dessin/vues/feuilles/rendus etexportsDXF exposés | Rendu/documentproduit distinctcanonique2D ; fontes etressources àqualifier |
| MTR11 IFC | Exporttexte et traductionlecture→commandes publiques | Parseurbinaireweb-ifc interneAPI ; représentations/proxys≠natifparamétrique/certifié |
| MTR12 catalogue/machines | OUTILS/MACHINES/typesmachines exposés | Catalogueactuel≠Registry/ManagerStudioversionné ni preuvepermissions |

Les chaînes d’entrée et preuves fichier/ligne de chaque groupe sont reportées dans REVUE-DEC18-A6.json, avec le SHA5e0285… ci-dessus pour chaque citation. Les conclusionsA3 sur les frontières sont cohérentes avec ces éléments. Aucun export interneappweb ouAPI n’est promu en APIpartagée par cette revue. La lecture des exports ne prouve pas les effets d’import transitifs, latence, mémoire, fidélité, isolationruntime ou stabilité future des API : inventaire/mesures bornées restent nécessaires avantPOCautorisé.

## Paquets locaux : ce qui est prouvé et ce qui ne l’est pas

Les quatrepaquets core-geometry, atelier-model, planche-model et geometry-exact sont version0.1.0, private:true, exports[.]=./src/index.ts, **sans champlicense** dans leurpackage.json au SHA5e0285…. Ces faits ne prouvent ni absence de droit, ni propriété complète, ni permission générale de redistribution. private est une métadonnée de publication npm, pas une licence. Ne pas déclarer automatiquement MIT ouApache le codeFadi ou une extraction du prototype à partir de ces champs.

CoreREADME traceexplicitement EMB.designer/Parcours_V8_19_Escalier_B_Mezzanine.html (ligne7). Une provenance nommée est une piste documentaire, pas une preuve de titularité ou de droits de toutes les ressources. Fichiers/icônes/fontes et contenus importés conservent leur propre origine et conditions. RéférenceergonomiqueSketchUp ne donne pas de droit à copier des ressources et ne prouve pas une dépendanceopérationnelle. Aucune fonction/native/norme n’est supprimée ou proposée à suppression par cette réserve.

## OCCT : wrapper et binaire séparés

Au **lock5e0285…**, occt-wasm5.6.1 porte `MIT OR Apache-2.0` et son integrity. L’artefact READMEinstallé vérifié par SHA256bba3d542763184c3d58dd62060b9ac107d5d2df96c60ea5962cb99093eb822cc distingue explicitement :

- ligne491 : buildtooling/scripts/TypeScriptwrapper **MIT OR Apache-2.0** ;
- ligne493 : compiledWASMoutput **LGPL-2.1-only** ;
- ligne495 : possibilité de remplacement du composant par URL selon le mécanisme décrit en amont.

Le seul champlicense du lock ne permet donc pas de qualifier le WASM de permissif. Le chargement `.wasm` séparé/remplaçable, déjà décrit par geometry-exact et décisionsD177/D182/D183, reste à préserver. **L’affirmation du README sur le mécanisme de remplacement n’est pas une preuve de conformité de la distributionFadi effectivement produite** : notices, sources pertinentes/possibilités de remplacement et correspondance binaire/versions restent à établir sur l’artefact distribué. Cette revue ne rouvre pas le choixOCCT et ne réexécute pas le moteur.

Le README est un artefact npm, pas un fichierGitFadi : commitnull dans la preuve. Sa versiondéclarée et le lock sont rapprochés ; l’intégrité du tarball, la correspondance exacte de l’arbre installé au tarball et celle du binaire distribué n’ont pas été reconstruites indépendamment. Ne pas transformer le hashREADME en preuve exhaustive supplychain.

## Autres tiers

Manifold3.5.4 : lockApache-2.0 rapproché du fichierLICENSE installé dont l’en-têteApache2 est lu et hashé. web-ifc0.0.78 : lockMPL-2.0 rapproché du fichierLICENSE.md installé dont l’en-têteMozillaPublicLicense2 est lu et hashé. Versions/integrity/expressionslicense correspondent à l’inventaireA3 et au lock5e0285… ; les preuves installées supplémentaires, leurs SHA256 et leur absence de commitGit figurent dans le JSON.

Cela n’établit pas la conformité de toutes les dépendances transitives, noticesembarquées, modificationséventuelles, fontes/ressources ni contenus tiers chargés/importés. Les parseurs/bindingsWASM et les générateursFadi ont des provenance/obligations distinctes ; autonomieopérationnelleDrawAll et propriétéintellectuelle ne sont pas la même vérification.

## Réserves et prochaine action

1. A2 conserve le contrôle descontrats/adaptateurs ; A6/A5 préparent une nomenclature de provenance/distribution des artefacts exacts sans inventer de licence locale ou lancer un scan.
2. Avant toute distributionnouvelle ouPOC, préciser imports publics autorisés et leurs effets transitifs ; l’entréeOCCT statique et lesadaptateursinternes demandent une qualification dédiée, pas un importprofond opportuniste.
3. Poursuivre les preuveslicences/sources/notices/ressources selon le lot autorisé, en conservant les décisions et capacitésnatives. Pas d’activationdePG, réseauadvisory, publicationbinaire ou modificationdeconditions depuis cette revue.
4. A0 intègre ce dossier de revue encomplémentdeceluiA3, sans dupliquerregistreDEC18 ni présenter l’inventaire comme acceptationG1/G2 ou permissiondecodeStudio.
