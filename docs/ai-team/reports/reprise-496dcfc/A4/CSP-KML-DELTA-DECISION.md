# CSP/KML — delta de spécification après décision6250111226

18 octobre2026 ; référence de reprise `496dcfc7bf80868ef21216d667187087db32a738`. LectureAGENTS et export décisions166 fourniA0. Ce fichier **ne refait pas M09** : il remplace seulement le choix encore ouvert entre optionsA/B par l’orientation nouvellement retenue et précise son critère d’emploi. Les14oracles et les inventaires/revues M004 restent sources reprises.

## Acte, portée et décisions non acquises

[Décision6250111226](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250111226), auteurexporté `RachEma-ux`, marqueur `[CHATGPT-DECISION][Q-M004-CSP-KML]` : **optionA retenue pour préparation du pilote**. Allowlist d’originesHTTPS effectivement identifiées, justifiées et approuvées, sans wildcard ; assetrefusé/indisponible avec étatUI/journal et fallbackneutre sans perte silencieuse ni mutationgéométrie. Aucune origine n’est approuvée par cet acte à partir de sa présence dans le code. OptionB proxy/relocalisation devient étude séparée seulement si besoin, pas implémentation acquise. Aucun header/scanréseau/runtime/enforcement/codeCSP ni déploiement autorisé. Si fournisseur non ratifié : rester spécification/reporting.

## Origines réellement observées statiquement et limites

Au checkout496dcfc, `apps/web/public/parcelle/index.html:1083` définit `https://api.maptiler.com` et `:3337` construit géocodage ; `apps/web/src/lib/maptiler.ts:20` fixe le mêmehost. C’est une **origine technique identifiée**, pas une preuve de requête émise, licence, contratfournisseur, consentement ou approbation d’icônes KML. Lien `www.maptiler.com` à923 est navigationcopyright avec logodata, pas une origineimage distante observée.

`imageHref` à1646–1650 admet data raster borné ou URLHTTPS sanscredentials et ≤2048caractères ; `img.src` à2121 reçoit la référence importée. **Aucun fournisseur HTTPS fixe d’icônes KML n’est identifié par ce chemin dynamique.** Impossible d’établir une liste approuvée depuis l’acceptation syntaxiqueHTTPS. SVG/KML namespaces, notices et lienshypertexte ne sont pas ajoutés. L’allowlistdécidée reste donc **vide d’origines approuvées d’icônesKML** dans ce livrable ; ne pas présenter api.maptiler.com comme nouvelle permission d’assetsKML.

Pour proposer ultérieurement une origine : source exacte, usage/image et provenance/licence, propriétaire, approbateur habilité/date/portée/policyversion, droits/confidentialité/absencecredentials, redirections et impacts cache. Une mention dans KML nonfiable ne confère pas approbation. Transporter seulement référenceexpurgée dansjournalUI ; ne pas exposerURLquery/clés/coordonnéesclient.

## États UI/contrat supplémentaires

1. **Autorisé par configuration explicite** et asset reçu : afficher image et sa provenance ; géométrie/ID/stylecontractuel inchangés. Le caspositif utilise une approbation de fixture locale, pas un fournisseur réel approuvé.
2. **Origine non approuvée** : aucun chargement autorisé dans futur banc, état «Icône externe non autorisée» / «External icon not authorised», fallbackneutre visible et avertissement parobjet. Conserverhref/provenance sous droits dansdonnée, pas danstracepublique ; pas remplacementgéométrie.
3. **Origine approuvée mais indisponible** (404/timeout/décodage/blockedredirect) : état distinct «Icône indisponible» / «Icon unavailable», retryborné si permis, mêmefallback et conservationréférence. Ne pas le classer comme absence dedroit.
4. **Données interdites/parentéoupermissionperdue** : refusserveur/liste nondivulgatrice ; CSP ne donne ni accès àobjet ni source. Ne pas confondre assetautorisé et objetéditable.
5. Fallbackneutre signifie substitution de présentation explicitementsignalée, **jamais fidélitéd’import déclarée** ; objetreste sélectionnable, annotable, éditable/sauvegardable selon droits. Historique/source et publicationexacte conservés, paschangementdu modèle ou dequantité.

Les chaînes FR/EN ci-dessus sont textes de spécification seulement, pas dictionnaire modifié. Parcelleprototype/livrables gardentlanguepropre selonD163 ; interfaceFadi d’alerte/cadre est bilingue. Focus/aria-status/alert, icônealternative compréhensible, zone44pxproposée et erreurs accessibles à tester ; fallbackcouleur seule insuffisante.

## Oracles conservés, pas nouveau compte de tests

Les scénarios dans CSP-KML-CORPUS-DOCUMENTAIRE.json complètent CSP05/07/09 ; CSP01/03/04 gardent policyworker/WASMoverrideD177 et compilation séparée, fallbackdocumentthread≠workerOK ; CSP08 garde stockage/pending/SW ; stylesCSSOM/rotation/ancrage/filtre sont inspectés visuellement et parstylescalculés. CSP02 canari RO signale mais n’empêche pas exécution ; ENF bloquerait après autorisation/buildidentique. Aucun succèsRO ne donne droitENF.

Pour tout casasset : comparer avant/après **géométrie canonique, IDs, unités/repères, quantités, relations et sourceversion** ; seul étatprésentation peut changer. Capture requestcounters surintercepts synthétiques sans réseau réel ; hashducorpus/policy/navigateur/SHA, verdictsprescrits nonexécutés. Les4oraclesSCAN restent NOT_SCANNED : aucune baseadvisory téléchargée.

ProchaineactionREADY : A5 relie ces cas aux14oraclesexistants ; A2/A6 préparent mécanismeconfiguration/source/WASM sansheader ; A0 consigne décision et approbations manquantes. La seule opération dépendante bloquée est code/enforcement/assetsréels, pas la préparationindépendante.
