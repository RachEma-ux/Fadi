# M09 — revue indépendante des usages CSP par A4

Lecture statique au SHA `7b0cca44fa44449cae80785dea078a857be4180c`. Aucun script/application/DB/réseau/scan externe exécuté. Dossier A5 correctement borné pour préparation ; **aucune compatibilité CSP réelle ni passage à enforcement démontré**. Les14 oracles sont10CSP+4SCAN prescrits, pas14tests réussis.

Compléments requis avant enforcement :

- **Icônes KML/KMZ HTTPS** : Parcelle accepte des icônes externes et les affecte à `img.src` (`index.html:1648`,1650,2103,2121). L’allowlist candidate self/blob/data/api.maptiler les bloquerait ; tester origine approuvée/relocalisation et avertissement de perte, sans wildcard ni suppression silencieuse.
- **Styles dynamiques** : rotation des annotations, marqueurs, dimensions, filtreSVG et progression (`index.html:1958`,2054,2109,2118,3340). Les3attributs statiques ne décrivent pas ces états ; compléter CSP05/09 par CSScalculé, cible clavier/tactile et visibilité, pas seulement console sans violation. Compatibilité CSSOM/attributs à vérifier par navigateur.
- **Policy worker/WASM** : `worker-src self` dans la page ne démontre pas fetch/compilation dans le worker ; tester ses headers/effectivepolicy et WASM séparé/remplaçable D177 (`moteur-exact.ts:22/29`, `exact.worker.ts:9/18`). Sourceapprouvée/redirectrefusé et erreurs récupérables ; pas retraitoverride ou unsafe-evalglobal.

À préciser également : bridge Parcelle mêmeorigine/capture/API mockée distinct du simple iframeprêt ; langue FR/EN recharge (`i18n/index.ts:40`) avec pending conservé ; Parcelleprototype et documents produits restent langue propre selonAGENTS ; repli génération documentaire filprincipal n’est pas preuve workercompatible. Les téléchargements Blob/ancre et hrefdownload Documents ne justifient pas scriptblob/objectplugin ; aucun viewerPDFiframe découvert dans ce périmètre.

Transition ReportOnly→enforcement A/B/C cohérente **comme plan** : canari RO exécuté avec violation, ENF bloqué, mêmebuild/policy/banc isolé autorisé, preuves expurgées ; ROvert n’est pas sécuritéeffective ni recette métier. Production/proxy, fusion, vraisAPI et DBrestent séparément autorisés.

Provenance détaillée/hashes/verdicts : REVUE-M09-CSP-USAGES.json. Sur17empreintesA5,16correspondent ; seul `.github/workflows/ci.yml` diffère entre référenceA5PR169 `a15d650…` et checkout documentaireA4 `7b0cca4…`. Ne pas transférer preuve/absenceDB d’unworkflow à l’autre. Aucunworkflow modifié ici, aucune désactivationgate/cochenative.

Prochaine action : A5 complète ses oracles avec ces usages ; A2/A6 revoient worker/build/cache/licence. Publication documentaire possible ; aucun en-tête à appliquer depuis cette revue et aucun nouveau lotcode autorisé.


## Actualisation après complément A5 — historique conservé

L’appendice§8 et le tableauimg-src du dossierA5 ont été relus dans les sortiesagents, avec empreintes enregistrées dans `followup_review` du JSON. Les cinq manques documentaires de la revue initiale sont désormais explicitement traités : icônesHTTPS/optionsfinies et refusrapporté ; CSSOM/stylescalculés/accessibilité ; bridgecapture/persistance ; policyworker/WASMoverrideD177 etfallback ; FR/ENreloadpending et languepropreParcelle/livrables.

**Verdict actualisé : documentation complétée ; décision icônes et enforcement encore bloqués pour leur opération seule.** Aucune optionallowlist/proxy/perte n’est choisie par cette revue. La voieproxy éventuelle garde son propre sous-lot/contrôlesSSRF, pas une permission implicite ; aucune suppression native ou wildcard. Les14oracles restent prescritsnonexécutés. L’ancienne revue/hashes/checkouts et leurs limites restent dans le JSON ; cette actualisation ne transforme aucun manque de preuve runtime en succès. Publication documentaire peut continuer sans autoriserCSP-A/B/C ni passer unegate.
