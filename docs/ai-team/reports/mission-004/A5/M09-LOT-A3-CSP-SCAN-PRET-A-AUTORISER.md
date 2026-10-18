# M09 — lot A3 CSP / dépendances prêt à autoriser

18 octobre2026, A5, programme#156/#157. **Préparation uniquement** : aucun codeapplicatif/workflow modifié, scannerexterne, requête réseau, connexionDB ou testCSP effectué. Référence applicative relue : checkout PR169 `a15d65044ca4454bf3159f4155e51465b2a70a2c` ; les fichiersCSP/web sont inchangés dans ce correctifDB par rapport àmaina4caaab. Les empreintes sources sont dans `M09-INVENTAIRE-POINTS.json` ; revalider la tête avant intervention.

Réutilisation : spécification M003A5 sectionM09 et dossiersM004DB3. Le présent lot apporte l’inventaire concret, la politique parusage et les oracles manquants ; il ne remplace ni le programme31missions, ni les sources/licences ni les garde-fous PR152.

## 1. Constat actuel et rapprochement PR152

- `apps/api/src/app.ts:27` : Helmet avec `contentSecurityPolicy:false`. L’API sert HTML/SPA et assets si WEB_DIST est configuré, index/SW no-cache et assets hashés immuables. **Aucun en-tête de production/reverseproxy n’a été sondé** ; désactivationdans ce code ne prouve pas absence de touteCSP en production ni exploitation.
- `.github/workflows/ci.yml` : npmci --no-audit ; validations applicatives/IFC/images mais aucun contrôle dédié CVE/GHSA/SBOM identifié dans les workflows lus. Aucun scanvulnérabilité n’a été lancé. PR169 réserve saCI à la garde pure sansDB : ne pas réactiver ses jobs mutateurs pour ce chantier.
- SnapshotPR152 relu : HEADf2777230e3e9c3bd6a2a5f61e2147acd1fba4b38 dans `github-pr-152.json`, complété par relevéA6M004 : architecture AST/imports/frontières, isolationnominale étendue, tests synthétiques, workflowleastprivilege et rulesetcandidat désactivé. **Ce périmètre n’implémente ni CSP, ni scannerCVE/licences exhaustif.** Ne pas dupliquer ses scripts, interpréter « isolation » comme scanner vulnérabilités, ni activer le ruleset. Son état courant doit être revalidé A0 avant un conflitfichier.
- Dockerfile : Node22bookworm-slim et PostGIS16-3.4 en CI par tags ; composantAPI natifargon2 et WASMOCCT séparé. PythonIFC0.9.0 épinglé mais pytest nonépingle dans le workflowobservé. Ces éléments sont inventoriés, **pas déclarés vulnérables** faute d’avis actualisé.

## 2. Inventaire usages et surfaces réelles

| Usage/source | Besoin constaté | Conséquence politique et limite |
|---|---|---|
| HTMLapp `apps/web/index.html`, bundleVite |Scriptmodule/JS/CSS same-origin ; aucun inline dans indexsource observé |Scriptself ; hashes/nonces uniquement si buildintroduit inline. Pas de CDNscript requis par ce constat. |
| APIauth/projets/documents |Fetchrelatif mêmeorigine dansViteproxy et WEB_DISTprod ; cookieshttpOnly |connectself, formactionself ; CSP ne remplace ni auth, CORS, CSRF ni droitsserveur. |
| `exact/moteur-exact.ts:29`, `exact.worker.ts:9/18` |WorkermoduleVite à lademande ; OCCT `.wasm?url` séparé ; overridevia localStorage `fadi.occt.wasm` |workerself ; fetchWASMself et autorisation compilationWASM ciblée ; override doit rester remplaçableD177/D182, pas silencieusement supprimé. |
| `documents/generation-client.ts:17` |Workermodule génération ; repli filprincipal si indisponible |workerself ; prouver compatibilité réellement, le repli ne doit pas masquer un blocageCSP inattendu. |
| `exports.ts`, Echanges/SolideExact/Planche |BlobURL téléchargement SVG/DXF/CSV/IFC/STEP/JSON/ZIP ; URL révoquées |Téléchargements≠scripts/blobautorisé partout. imgblob/data seulement pour usages rendus nécessaires ; vérifier exports et'ouverture documentaire sans autoriser scriptsblobglobal. |
| `ParcelleTool.tsx:257–261` |Iframe same-origin `/parcelle/index.html`, sandbox scripts/sameorigin/forms/downloads/popups/modals |frameself maintenu ; politique distincte du documentParcelle nécessaire. Sandbox existante n’est pas une isolation absolue ; ne pas la supprimer ni l’élargir dans ce lot. |
| `public/parcelle/index.html`, généré par extract-parcelle |26tagsScript :23exécutablesinline,1bridgeJSlocal,2plaintext ;9styleblocks,3styleattrs,0handlersHTMLon* statiques |Un scriptself seul casse ce document ; hashes de ses scripts exécutables/stylessource au build, pas éditionmanuelle du grosHTMLgénéré. Les2plaintext ne sont pas des scriptsàautoriser. |
| Parcelle vendors incorporés |Leaflet/proj4/JSZip etc intégrés dans HTML ; un `new Function` statique ligne1165 dans polyfillsetImmediate |Existence de ce code ne prouve pas appel dynamique à un string ; tester parcoursKMZ/KML/annotations et refuser unsafe-evalglobal par facilité. Décider adaptationbornée si réellement nécessaire, avecprovenance/licence. |
| `lib/maptiler.ts` et Parcelle |FetchJSON/tiles uniquementapi.maptiler.com, au choixutilisateur, credentialsomit/noreferrer ; cléfacultative locale/session |connect/img api.maptiler.com uniquement là où l’usage l’exige ; pas wildcard*.maptiler.com ; rapports expurgés : aucunequerykey/coordonnéeclient. LeslienswwwMapTiler/epsg ne justifient pas uneoriginescript. |
| SW `public/sw.js`, pluginVite |Cacheshellbuildsameorigin ; API jamaiscacheSW ; suppressionancienscaches àactivation |workerself ; préserverréponsesCSP danscaches et séquenceupgrade, paspurgerfileIndexedDB. WASM exclu de regexprécacheobservée : ne pas promettre OCCT offline sanspreuve. |
| Dexie/localstore/brouillon/clipboard/préférences |IndexedDB/localStorage et étatsutilisateur/fileoffline ; dernieruser nonjetonauth |Aucune directiveCSP ne protège l’accèsJS légitime àstorage ; pasnouveau tokenlocal ni effacementdonnées pourfairepasserCSP. Droit révoqué/cache restecontratserveur/UX distinct. |
| Reactstylesdynamiques/canvas/SVG |Stylesattributs/positionnement, générationgraphique, objetsrenderer |Inventorier traces et navigateurs ; nonce surstyleelement ne rend pas automatiquement tousstyleattrs compatibles. Exceptionstyleattr éventuelle explicitementbornée, jamais scriptsunsafe-inline. |

Les origines trouvées dans commentaires/licences/namespacesSVG/KML et liensdocumentaires **ne sont pas des requêtes observées** et ne sont pas ajoutées automatiquement à la politique. Aucun traficMapTiler réel ni clé n’a été utilisé.

## 3. Politique candidate par document, à tester avant enforcement

Ce tableau est une **spécificationproposée**, pas un en-tête livré ni preuve de compatibilité.

| Directive | App/SPA et workers mêmesressources | DocumentParcelle | Décision à valider |
|---|---|---|---|
| default-src |'none' |'none' |Tout besoin explicite, pas fallback* |
| base-uri |'none' |'none' |AucunbaseHTMLnécessaire observé ; retester |
| object-src |'none' |'none' |Paspluginobject démontré ; downloads restentindépendants |
| script-src |'self' ; `wasm-unsafe-eval` uniquement contextecompilantWASM |'self' +hashesSHA256 des23scriptsinlineexécutables exacts |Aucun unsafe-eval/global, aucunblob/data/script sanspreuve ; supportbrowserWASM à vérifier |
| script-src-attr |'none' |'none' |0handlersHTMLobservés ne couvre pas toutcodegénéré, testsrequis |
| worker-src |'self' |'self' si usageattesté |N’ajouter blob que si unworker réel en dépend et mesure/risquejustifiés ; pasdéduitdeBlobdownload |
| connect-src |'self' +https://api.maptiler.com lorsque fonctionexterne activée |'self' +https://api.maptiler.com |SourcenoyauOCCTremplacé : sourceexplicitementapprouvée/documentée, paswildcard ; arrêt/erreurnommée si interdite |
| style-src / style-src-elem |'self' +nonces/hashes desélémentsinline réellement présents |'self' +hashes des9styleblocks générés |React/dynamiquetraces ; pas générernonce réutilisé par défaut ni hash d’unétatincomplet |
| style-src-attr |Exception temporaire'unsafe-inline' seulement si besoinréel confirmé, isolée/traçable ; sinon'none' |Idem3attrsstatics et dynamiquesvendors àtester |CompatibilitéSafari/Firefox/Chrome ; unfallbackstyle-src large n’est pas acquis ni transposéauxscripts |
| img-src |'self',blob:,data: seulement fonctionnalités mesurées +api.maptiler.com pourtiles |Idem |SVG/data nonréputés sûrs par leurMIME ; imports/sanitisation distincts |
| font-src |'self' ; data: seulement s’il existe unfontload effectif |Idem |Policesincorporées/annotations à inventorier, pasdeCDNfontprésumé |
| frame-src |'self' pourParcelle |'none' saufusageultérieurprouvé |PasiframeStudio/raccourciAtelier introduit |
| frame-ancestors |'none' pourapplicationtoplevel, sousréserveproduit |'self' pourParcelle |En-têteHTTP, pasmeta ; besoinembeddingexterne nonprésumé |
| form-action |'self' |'self' |Exports/downloads ne nécessitent pas formsexternes |
| report-to/report-uri |Collectelocaleautorisée/expurgée seulement si demandée |Mêmecontrat |Aucun endpointtiers ni URLclé/donnéeclient publié ; rapportCSP peut fuirchemins/queries |

La contrainte de remplacement du WASM est une décisionhistorique D177/D182 : CSPselfstrict peut restreindre l’URLexterne actuellement configurable. Le lot doit proposer un chemin same-origin remplaçable ou des sources explicites approuvées, conserver le binaire séparé/licences/provenance et présenter les effets de compatibilité ; **ne pas décider silencieusement de supprimer l’override**. Un allowlist de codeWASM externe n’est pas autorisé automatiquement parce que l’utilisateur peut saisir uneURL.

HashesParcelle : générer au build depuis lesoctets finaux (pasTexteDOMnormalisé), séparer exécutables/texteplain et lier lemanifeste de policy au mêmebuild. Ne pas toucher manuellementpublic/parcelle/index.html, fichiergénéré ; regarder `apps/web/scripts/extract-parcelle.mjs`. Nonces si choisis exigent générationcryptographique parréponse et aucun partagé danscache/index ; leshashesstaticfacilitent cachingoffline mais doivent évoluer avecvendor/code. Ne pas mélanger plusieurs en-têtesenforcement incongrus proxy/API : leurs politiques se cumulent en restrictions et ne s’élargissent pas mutuellement.

## 4. Sous-lots A3 concrets et séparés

**CSP-A — préparation et constructeurpur de politique (autorisationcode requise).** A3fichiercandidat `apps/api/src/security/csp-policy.ts` +testpurs ; politiqueparroute/scope/build, représentationversheaders et validationdeny-by-default. Pointd’intégrationborné `apps/api/src/app.ts` et éventuelmanifesteVite. Testsintégration desheaders avec doublecompletdb/driver/auth, jamaisimportclientproductif nonmocké. A5fichieradversarialdistinct. Pasréécritureauth ni sandbox/licences/vendors.

**CSP-B — report-only et compatibilitéisolée (autorisationbornée requise).** Serveurstatique/localisolé sansDB/identifiantsprod, browserfixtures/sourcesynthétiques et interceptsréseaux. Rapportsreport-only surlesdeuxdocuments et workers, coucheapiquimocke droits/sauvegardes ; vérifierpointservant réellementHTML et assets. Ce banc peut démontrer compatibilitéressources, **pas intégrationAPI/DB, recette métier complète ni sécuritéproduction**. Toute recetteAPI/E2E réelle attend DB3+accordcorrespondant ; aucun service DBstarted pourCSP.

**CSP-C — enforcement sur banc puis préparationactivation (autorisationcode+validationrequis).** Aprèsabsenceviolationsinattendues et oraclesnégatifs discriminants, appliquer enenforcement surmêmebanc/build ; conserverdiagnostics. RégressionParcelle/OCCT/exports/offline éliminatoire, aucune suppressionnative. Production/en-têteproxy/activationruntime nécessitent accorddistinct et planretour ; pasfusiondepuisunreportonlyvert.

**SCAN-A — inventaire/SBOM/licences horsréseau (autorisationcodeCI requise).** Construire inventaire depuislocknpm, manifests, Dockerfile/images et workflowPython ; traiter séparémentvendors/policesincorporés/WASM. Aucun avisCVEactuel obtenu sansbased’avis ; résultat doit explicitement être `NOT_SCANNED` ou `INCOMPLETE`. Pasnpmci/lifecycle ni npm audit réseau dans cettepréparationpure. Ne pas dupliquer architecture/isolationPR152.

**SCAN-B — advisories et triage (permissionréseau/outillage/sourceactualisée à approuver).** Choixscanner/version/base/empreinte/horodatage fixés, modeoffline avecsnapshotpréalablementapprouvé sipossible ; imagearchive construite sansrun et SBOMruntime/build distincts. Aucun uploadducode ou artefact àuntiersnonapprouvé, achat ou abonnement tacite. RésultatsCVE et licences sont deux analyses distinctes. AutorisationSCAN-A ne couvre pasdownloadbase/scanexterneSCAN-B.

**SCAN-C — remèdes minimaux ciblés (autorisationsupplémentaire).** Uneissue/remède borné parrisque, compatibilité/API/licence/lockdiff/tests ; pas updateglobal, exclusion ou suppressionfonctionnative fondée surscanner seulement. Lesnormes/fonctionsindustrielles et moteurs restentsauvegardés dans leurprovenance.

A0réserve lesfichierscommuns app.ts/viteconfig/lock/workflows ; ordreRevuesD06#154/#152/#142 à respecter sansbarrièreglobale. Ces lots ne sont **pas commencés** ; PR169 restegardeDBdistincte.

## 5. Oracles de réception prescrits

Chaque ligneexige SHA/build/policyhash/navigateur/env/fixturehash/verdict/logsexpurgés. Aucun cas ci-dessous exécuté.

| Cas | Positif | Négatif et conditionéliminatoire |
|---|---|---|
| CSP01 headers |AppHTML/SPAdeep-link/Parcelle/worker reçoivent scopesattendus enRO puisENF |Headerabsent/doublecontradictoire, meta seulframeancestors, nonceconstantcache : refusdevalidation |
| CSP02 injection |Scriptmodule/bridge/autorisés exécutés, scriptinjecté canarilocal enRO visible commeviolation |ENF : canarinonautorisé ne s’exécute pas et violationattendue ; si exécution ou simplefalsegreen =échec |
| CSP03 workers |Exact/documentsmodules démarrent àlademande, aucunchargementOCCTàouverture |Workerorigineinconnue/blobnonapprouvébloqué ; pasrepli masquantdéfautCSP annoncécommeok |
| CSP04 WASM |WASMbundlésame-origin et remplacementapprouvé fonctionnent ; source/provenance conservées |URLnonapprouvée/redirecthorsorigine refusé sansoutildétruitni origine* ; pasunsafe-evalglobal pourcontourner |
| CSP05 Parcelle |KML/KMZ/coordonnées/annotations/bridge/exports synthétiques fonctionnent sansscriptCDN |Scriptinlinehashaltéré/injecté bloqué ; politiqueapp ne cassepasParcelle, pasde modificationsmanuellesHTMLgénéré |
| CSP06 MapTiler |Réponsessimuléesapi.maptiler.com admissibles, absenceclé étatfidèle |Autrehost/mixedcontent refusés ; aucunevraieclé/requêtepayante ; querykey/coordonnées jamaisdansartifacts |
| CSP07 exports |BlobSVG/DXF/IFC/STEP/CSV/ZIPdownload etouverturedocattendues, URLrévoquée |Fichierimporté ne devient pascodescriptautorisé ; aucununsafeinlineglobal auprétexteexport |
| CSP08 offline/SW |Cachebuild portepolicycourante, accèscachedoutilsautorisés, fileconservée lorsupgrade |VieuxCSPcache/capacitéfausse oufileeffacée =échec ; paspurgeIndexedDBpourréparer |
| CSP09 FR/EN/mobile |Messageserreur/action/sortie/focus etbarres utilisables dans2langues+desktop/mobile |Textebrutconsole/clé, focusperdu,sortieplein écran inaccessible, différencepermission selonlocale =échec |
| CSP10 cookies/droits |Authmockée+permissions serveur inchangées ; approvals/publicationdistinctes |CSPn’estpastraitéecommepreuveauth/CSRF ; aucunepermissionajoutée, aucuneAPIréellecontactée |
| SCAN01 provenance |lock/versions/hashimage/digests/advisorysnapshot etoutils identifiés |Sourceflottante/nonattribuée ou résultatsauSHAancien promus : INCOMPLETE |
| SCAN02 fauxavisfixture |Scanneursimulé signale dépendancetransitivefixture et règletriage laconserve |Suppressionfinding/unknownbase classé0vulnérabilité =échec ; fixturesnevalidentpasvraiesCVE |
| SCAN03 exceptions |Exceptionjustifiée/exposition/owner/échéance/décision explicites |Exceptionexpirée/nonapprouvée ne donnepasvert ; pasd’ignorepermanentglobal |
| SCAN04 licences |Expressionslock+composants/WASM/vendors/polices/source/obligations rapprochés |LicencewrappernpmOCCT présentéecommelicencenoyau, noticesretirées oufonctionnative supprimée =échec |

## 6. Dépendances et licences : ne pas confondre déclarations et conformité

`M09-INVENTAIRE-POINTS.json` extrait14lignespackages sélectionnées du lock exact (versions/licencedéclarée/path), sansinstaller ni consulteradvisories. Domainesàcouvrir : Express/Helmet/authcookie/argon2 et transitifsAPI ; React/Vite/bundles/three/manifold/Dexie ; WASMweb-ifc/OCCT ; devtooling/Playwright ; PythonIFC/pytest et imageNode/PostGIS ; actionsCI ; JSZip/Leaflet/proj4 et policesincorporéesParcelle horsinventairenpm.

OCCT : D177/D182 portent l’arbitrageLGPL/binaireseparé/remplaçable ; `occt-wasm` déclare une expressionwrapper dansnpm, elle ne suffitpas pourlesdroitsnoyau/binaire. web-ifc et autreslicences exactes sont àrelire danslivrables distribués, notices/fontsidem ; ne pasinférer unecompatibilitéjuridiqueglobale depuis le champlicense. Aucun avisjuridique ni certification obtenu ici. Toutealerte incompatibilité doit préserver lacapacité pendantl’étude d’uneadaptationcompatible, pasla supprimerautomatiquement.

## 7. Triage vulnérabilités sans suppression

Fichedéfinie : findingID/CVE/GHSA/sourceURLpublicue, package/version/chemintransitif, outil/version/advisoryhashdate, SHA/artefact, runtime/build/test, impact/sourceCVSS **distinct** de prioritéFadi, atteignabilité/données/permissions/expositionréelle etpréconditions, remèdeminimal/risquescompatibilité, propriétaire/échéance, preuve, décisionexception/expiration. Statuts : Nouveau→Àqualifier→Confirmé/Nonatteignableavecpreuve/Fauxpositifjustifié→Correctionproposée→Vérifiée→Acceptéavecautorité ; ne jamaisfaire disparaître unfinding sanshistorique.

Unealertebuild/test nonatteignable runtime peut être prioriséedifféremment maisrestevisible ; absencebaseadvisory, scanneréchoué ouincomplet n’est pasabsencevulnérabilité. Seuilsd’échecCI/SLAréponse/coûtoutillage àarbitrer, pasinventés. Unsecretréelconfirmé ouexpositioncritique prouvée exigerait traitementimmédiat borné avecpreuveexpurgée ; aucunealerteexploitableréellen’aétédémontrée par cettelecture.

## 8. Coûts, risques et retourarrière

Coûtexécutéici : lecturelocale seulement, aucunserviceexterne/DB/achat. Estimationdepréparation, **nonengagement** :CSP-A0,5–1jour, CSP-B/C1–3jours selonParcelle/worker/offline etnavigateurs ;SCAN-A0,5–1jour, SCAN-B/C selonvolumeavis etaccordoutillage. Baseadvisories/browserspeuventconsommerstockage/téléchargementCI ; chiffrerquandoutilchoisi, pasabonnementtacite.

Risquesprincipaux : CSSinline/Parcellehashes cassés, polyfillJSZipstringevalréellementappelé, wasmunsafe-eval/workerpolicy différencesbrowser, suppressionoverrideLGPL, cacheSW deheaders, cléMapTiler dansrapport, fauxconfortreport-only/SBOMzéroavis, rollupmetadonnéeslicencesincomplètes, modificationworkflowqui démarreAPI/DB. A0/A2/A4/A6 revoient cesrisques avantlot.

Retourarrière : surbancisolé, revenir à lapolicyRO précédente signée/hashée toutenconservant lespreuves d’échec ; nepasélargir* ouunsafe-eval pour produire unvert. Suspendreenforcementd’unlot défaillant, préserver modèle/file/cacheutile, pasclearstorage global. Enproduction, modificationen-têtes/reverseproxy est opérationréservée : décisionowner, étatavant/version et retouràconfigurationantérieure documentés ; pasdéploiement/fusionautomatique. Scanner : conserver anciensrésultats/avis/exception, nepasfaireverterunealerteparretirejob oubasevide.

## 9. Accord précis à soumettre et prochaine action READY

« Autoriser le sous-lot CSP-A (constructeur/headerpolicy et tests entièrement simulés sansDB) et SCAN-A (inventaire/SBOM/licences locaux, sansscanexterne ni lifecycle), surbranchecourte/PRdistincte ; aucunefusion. CSP-B/C, téléchargementadvisories, vraisAPI/E2E, modificationsprod et remèdesdépendances seront soumis avecpérimètrepreuvescorrespondants. »

Le canevasCI pur est dans `M09-WORKFLOW-PUR-PROPOSE.md`, **texte nonappliqué**. A0 doit confirmerpérimètre, propriétaireetconflitsapp.ts/vite/workflow avecPR152/169 avantouverture. Tantque cetaccord manque : dossierterminé pourrevue, codeCSP/SCAN `AUTORISATION_REQUISE`, continuerautres tâchesREADY.
