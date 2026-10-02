# Matrice de conformité — migration du prototype Parcours V8.19

Document vivant (tenu à jour à chaque tranche migrée — mission du
2026-10-01, section 15). Relie chaque fonction du HTML de référence (voir
`reference.md`, inventaire vérifié par exécution) à son emplacement dans la
webApp Fadi et à sa preuve de validation. Les fiches par étape sont dans
`etapes/NN.md` (générées par `apps/api/scripts/generate-step-sheets.mjs`).

Légende : ✅ validé (test automatisé + vérification visuelle) · 🟡 partiel
(donnée réelle persistée ou fonction réduite, écart documenté) · ⛔ non
commencé.

## 1. Parcours — les 21 étapes

| Fonction (HTML) | Décision | Emplacement Fadi | État | Preuve |
|---|---|---|---|---|
| Registre des 21 étapes, numérotation 01–21, phases, cibles de transmission | Extraire | `apps/api/src/data/parcours-steps.json` (avec `transmitsTo`) → `GET /projects/:id/steps` | ✅ | `app.test.ts` « seeds the 21 real steps », « serves each step with the prototype's real form, transmission targets… » |
| Vue d'ensemble : grille de cartes, progression « n / 21 étapes terminées », phases | Conserver | `modules/parcours/ParcoursModule.tsx` | ✅ | e2e `apps/web/e2e/parcours-scenario.mjs` ; `captures/webapp/new-00-overview-{desktop,mobile}.png` |
| `study()` : une étape à la fois, Précédente / Suivante, retour vue d'ensemble, URL `?etape=N` | Adapter | `ParcoursModule.tsx` → `StepDetail` | ✅ | e2e ; rechargement conservant l'étape |
| « Marquer terminée » / « Terminée ✓ » ; progression issue de l'état des étapes uniquement | Conserver | `PATCH /projects/:id/steps/:n {status}` ; `AccueilPage.tsx` (phases et prochaine étape depuis `listSteps`) | ✅ | e2e « 1 / 21 étapes terminées » ; `captures/webapp/00-accueil-desktop.png` |
| Formulaires métier `BIZ_SCHEMAS` (17 étapes : 02–09, 12–20), intros, types text / textarea / number / date, sauvegarde | Extraire | `apps/api/src/data/parcours-forms.json` ; `StepForm.tsx` ; `PATCH …/steps/:n {fields}` validé par type | ✅ | `app.test.ts` « stores form answers… » ; e2e étapes 02, 14, 17, 19 ; rechargement |
| Synthèse / livrable (21) et synthèses des étapes outillées (01, 10, 11) | Extraire | champ `summary` (`parcours-forms.json`) | ✅ (21) / 🟡 (01, 10, 11 : affiché comme texte, pas d'outil) | `app.test.ts` « serves each step… » |
| KPI finance (14) avec « Chiffrage incomplet » (flow-v62) | Extraire | `packages/domain-model/src/kpis.ts` ; `StepForm.tsx` | ✅ | `kpis.test.ts` ; e2e « f1 + f9 seuls → Chiffrage incomplet », « 24 000 000 / 24 000 000 / 0 » |
| KPI score (17) : note provisoire, due diligence, décision | Extraire | idem | ✅ | `kpis.test.ts` ; e2e « 2.88 / 5 · 8/8 critères » |
| Décision (19) GO / GO sous conditions / À reprendre / NO GO | Extraire | `StepForm.tsx` ; validation serveur | ✅ | e2e ; `app.test.ts` |
| Harmonie par étape (h7-app) : propositions A/B/C, « Pourquoi ici » selon le profil, Retenir / Adapter-motiver / Écarter avec motif / Traduite au programme (≥ 06) / Dessinée (≥ 10) / Consigner une vérification, arbitrage (motif, responsable, référence, preuve), historique, versions, remplacement de variante, compteur « N choix retenu(s) », onglets Proposer / Comparer / Choix & transmission, intentions reçues, cadre de lecture | Extraire + Adapter | moteur pur `packages/domain-model/src/harmonie.ts` ; autorité serveur `apps/api/src/routes/parcours-steps.ts` (`POST …/harmonie/:proposalId`, 422 avec le message du prototype) ; `modules/parcours/HarmoniePanel.tsx` | ✅ | `harmonie.test.ts` (11 tests) ; `app.test.ts` « applies the Harmonie rules server-side… » ; e2e (retenir, remplacer, motif trop court, adaptation) ; `captures/webapp/new-02-desktop-harmonie.png` |
| Effets amont/aval d'une intention retenue : étapes cibles remises à faire, GO rétrogradé en « À reprendre » | Conserver | `parcours-steps.ts` | ✅ | `app.test.ts` ; e2e « étape 12 retenue → étape 19 À reprendre » |
| Profil Harmonie par type de bâtiment (PROFILES, alias, « Formation & bureaux » pour mixte formation + bureaux) | Extraire | `harmonie-profiles.json` ; `harmonieProfile()` ; type déclaré via la répartition programmatique | ✅ | `harmonie.test.ts` ; e2e « profil suit le type (Habitation) », exemple « Formation & bureaux » |
| Propositions de site A/B/C de l'étape 01 (`siteOptions`, zonage calculé sur le contour réel aux taux 15/50/25/10 · 10/45/35/10 · 12/43/20/25 %, schéma SVG `svgSite` + légende + export, « Pourquoi ici » selon côté d'approche, contexte arrière, altimétrie ; proposition de départ `recommended(1)` par priorité / façade exposée ; « Voir le schéma ») | Extraire | géométrie `packages/core-geometry/src/site-zoning.ts` (triangulate, cutArea, zoning) ; domaine `packages/domain-model/src/site.ts` (siteContext, siteOptions, recommandation, validation, SVG) ; API `GET …/steps/1` (`site`, propositions avec `zoning`) ; `modules/parcours/SiteHarmonie.tsx` dans `HarmoniePanel.tsx` | ✅ | `site-zoning.test.ts` (6), `site.test.ts` (7), `app.test.ts` « Étape 01 — propositions de site… » ; e2e (schéma, légende 15/50/25/10 %, « Pourquoi ici » B.265 → B.266, Voir le schéma) ; `captures/webapp/01-desktop.png`, `new-01-desktop.png` |
| Données du site (étape 01) : côté d'approche, nature de l'approche, priorité, contextes avant / arrière, source, note, repère WGS84 saisi ; règle « approche documentée ⇒ côté + source » ; faits (parcelle, contour calculé, contenance source, géolocalisation) | Extraire | `projects.site_observations` ; `PUT …/steps/1/site` (422 avec le message du prototype) ; conversion explicite EPSG:26191 / 2154 → WGS84 (`lib/site-context.ts`, proj4, définitions du prototype) ; `SiteDataFold` | ✅ | `app.test.ts` ; e2e « priorité Séparation des mouvements → C », « approche documentée sans source → refus » ; données du site de l'exemple P.118 importées (`siteObservations` extrait de p118-resolved-app) |
| Fond MapTiler et altimétrie (« Afficher le fond MapTiler », « Collecter centre + sommets », « Connexion MapTiler ») dans le panneau Harmonie de l'étape 01 | Reporter | la connexion MapTiler reste disponible dans l'outil Parcelle lui-même (bouton « Configurer ») ; les boutons du panneau Harmonie ne sont pas repris | 🟡 | — |
| Propositions LOCALES par local (étapes 10/11, analyse du modèle natif), péremption « À réexaminer » par empreinte des données amont, « Actualiser les propositions », « Rapport de cette étape » | — | — | ⛔ | Dépend de l'analyse du modèle (flow-v62) et de l'Atelier |
| Exemple P.118 résolu : récit du choix (« Pourquoi ce choix »), réponses renseignées (12 rubriques nommant donnée / hypothèse), choix retenu avec responsable et preuve, 21/21 illustrées | Extraire | `p118-exemple-complet.json` (+ `business`) ; import `POST /examples/:id/import` | ✅ | `app.test.ts` « imports an example… » ; e2e ; `captures/webapp/02-desktop.png` |
| « Créer une copie pour essayer » | Adapter | l'import crée toujours une copie éditable appartenant à l'utilisateur | ✅ | `app.test.ts` |
| Bibliothèque d'exemples (SOURCE_EXAMPLES, 10 cas ; « Utiliser comme aide au remplissage ») et bibliothèque des bâtiments (21 cas) | — | — | ⛔ | `SOURCE_EXAMPLES`, `building-library-data` non extraits |
| Sources de l'étape (« + Importer des fichiers », zone de dépôt, liste nom · taille · type · date, Télécharger, Supprimer avec confirmation — `FILE_DB` IndexedDB) | Adapter (stockage serveur, propriété du projet) | table `step_files` (contenu bytea, 25 Mo max) ; `routes/step-files.ts` (`GET/POST …/steps/:n/files`, `GET/DELETE …/files/:id`, toujours servi en pièce jointe `nosniff` ; `GET /projects/:id/files` pour le module) ; `modules/projets-sources/StepSources.tsx` (pli dans chaque étape) et `ProjectSources` (onglet Projets et sources) | ✅ | `app.test.ts` « uploads, lists, downloads as attachment and deletes… » (isolation par propriétaire, HTML jamais servi comme page) ; e2e « sources : … » ; `captures/webapp/03-desktop-sources.png` |
| Documents de base intégrés (118_officiel.kmz, ZONE-I-5.pdf) | 🟡 | KMZ décodé : bornes, CSV, notice → `p118-parcel.json` ; PDF non repris | 🟡 | `reference.md` |

## 2. Programmation

| Fonction | Décision | Emplacement | État | Preuve |
|---|---|---|---|---|
| Répartition programmatique par type (06/07) : types, fourchettes, position, ratios forcés, KPI, tableau, matrice d'adjacence, note de statut, transmission à l'Atelier (10) | Extraire | `programme-repartition.json` ; `packages/domain-model/src/programme.ts` ; `GET/PUT /projects/:id/programme` (table `programme_repartitions`) ; `modules/programmation/ProgrammeRepartition.tsx` (aussi l'onglet Programmation du projet) | ✅ | `programme.test.ts` ; `app.test.ts` « exposes the programme repartition… » ; e2e « 28,0 % → 35,0 % → 27,0 % » ; `captures/webapp/new-06-{desktop,mobile}.png` |
| « Répartition renseignée et liée au modèle » (cas P.118 : sommes par famille calculées depuis les 74 fiches d'espaces) | Extraire | `p118-programme-case.json` ; `programmeCaseSums()` | ✅ | `app.test.ts` (1 366,02 / 567,49 / 2 932,26 m²) ; e2e ; `captures/webapp/06-desktop.png` |
| 74 fiches d'espaces (capacités, dimensions, ambiances), export CSV, « Essayer une autre répartition en copie », bibliothèque par types, « Comparer au modèle » | — | données importées en pièce jointe du projet (`roomResponses`) | 🟡 | Affichage et outils à porter |

## 3. Atelier architectural

| Fonction (HTML) | Décision | Emplacement | État | Preuve |
|---|---|---|---|---|
| Moteur natif complet (Design Atelier V14-3) : viewer 3D canvas, Volume / Éclaté / Plan / Coupe N–S / E–O / façades, dessins techniques, vues enregistrées, créateur de vue (orientation, roll, N/S/E/O/Dessus/Dessous, représentation), couches Parcelle / Recul / Emprise / Voirie, exports PNG / SVG / DXF, études solaires, légende, niveau actif, barre d'outils V8 (Modèle / Design / Concevoir / Analyser / Documenter, menus Niveau / Vue / Mode / Dessins techniques, annuler / rétablir, plein écran) | **Extraire tel quel, encapsuler** (jamais réécrit) | `apps/web/scripts/extract-native-atelier.mjs` → `src/modules/atelier/native/{root.html,native.css}`, `public/atelier-native/{v14-viewer,v14-tools,v8-toolbar}.js` ; hôte `src/modules/atelier/native/engine.ts` (couture `window.ParcoursSession.storage`, montage / garage du sous-arbre comme `mountNativeDesigner()` / `parkNativeDesigner()`) ; `NativeAtelier.tsx` dans l'onglet Atelier et les étapes 10 / 11 | ✅ | e2e (géométrie EPSG:26191 · 1345.55 m², 6 niveaux, barre prête, étape 10) ; `captures/webapp/10-desktop.png`, `atelier-concevoir-wall-desktop.png` vs `captures/reference/10-desktop.png` |
| Outils de dessin : sélection, effacer, rectangle, ligne, mur, porte, fenêtre, pousser, extruder, déplacer, rotation, pan, mètre, cotation, texte, copier, décalage, polygone, cercle, poteau, escalier, tourner, échelle, miroir, calques, métré, exporter ; accrochage 0,50 m ; grille ; autres étages | Extraire tel quel | idem (v14-tools.js) | ✅ | e2e : mur dessiné en Concevoir → persisté |
| Persistance du modèle : chaque écriture du moteur (clé `design.v13.*`) enregistrée par l'API avec **révision par clé**, refus 409 si la révision lue n'est plus la courante, copie de secours `…backup.conflit-<date>` du travail en conflit, états « Enregistré localement / Synchronisation / Enregistré sur le serveur / Conflit / Échec » affichés | Adapter | table `atelier_store`, `routes/atelier.ts` (GET/PUT/DELETE), `engine.ts` (file d'écriture par clé, 350 ms) | ✅ | `app.test.ts` « magasin du moteur natif » (409 sur révision périmée, projection) ; e2e statut « Enregistré sur le serveur » |
| Annuler / rétablir qui modifient l'état persistant | Conserver (moteur) + Adapter (persistance) | moteur `undoRedo` → écriture floorDesign → API | ✅ | e2e : 39 → 40 → 39 murs, révision 1 → 2 → 3 |
| Révision contrôlée du modèle (`projects.modelRevision`) et projection dérivée `levels` / `architectural_objects` (identifiants préfixés projet, relations hôte remappées, tous les types d'objets) | Adapter | `lib/native-projection.ts`, régénérée à chaque écriture `levels` / `floorDesign` du projet natif actif | ✅ | `app.test.ts` ; e2e |
| Modèle natif de P.118 verbatim (registre, 5 domaines : nativeParcel, levels, buildingFootprint, floorDesign avec méta / calques / surfaces, ui) | Extraire | `p118-native-model.json` → `atelier_store` à l'import | ✅ | `app.test.ts` (meta.architectureRevision, calques, aires) |
| Niveaux, élévations réelles (décimales) | Adapter | `levels.elevation` double precision | ✅ | `app.test.ts` |
| Page Harmony de l'Atelier (étape 10, V8.4) ; propositions LOCALES par local ; analyse du modèle (flow-v62 : locaux, densités) | — | — | ⛔ | atelier-harmonie-page-app, flow-v62 non portés |
| Outil Parcelle (01) « Parcelle — Atelier satellite » : Leaflet, proj4, import JSON / KML / KMZ, bornes (saisie, ajout, ordre, suppression), validation du contour, cotes et surface Lambert, fond MapTiler optionnel (clé de l'utilisateur), voirie, dossier (parcelle, construction, sources, contraintes), Design Parcel 2.0, export, « Mes parcelles » | **Extraire tel quel, encapsuler** (iframe, comme dans le prototype) | `apps/web/scripts/extract-parcelle.mjs` → `public/parcelle/index.html` (document verbatim, `local-files.js` remplacé par `parcelle-bridge.js`) ; fichiers servis par Fadi au **contrat natif de l'outil** (`GET/PUT/DELETE /projects/:id/parcels[/:id]`, révision par fichier, 409) : `routes/parcels.ts`, table `parcels` ; hôte `modules/projets-sources/ParcelleTool.tsx` | ✅ | `app.test.ts` « serves the tool's /api/parcels contract… » ; e2e (fichier P.118 ouvert, « Mes parcelles » 1 345,55 m², borne modifiée) ; `captures/webapp/01-{desktop,mobile}.png` vs `captures/reference/01-{desktop,mobile}.png` |
| Transmission parcelle → modèle (`acceptParcel` de flow-v62) : lié / incomplet / invalide / conflit (bâtiment déjà dessiné) / conflit d'emprise / recul à recalculer, enveloppe de recul uniforme, contenance déclarée, emprise proposée ; relecture périodique de la capture (`frameReady`) et transmission avant de quitter l'étape (`flushParcel`) | Extraire + Adapter | `lib/parcel-transmission.ts` ; `POST …/parcels/:id/transmit` (capture dans le corps, idempotent sur signature) → `nativeParcel` / `buildingFootprint` du magasin de l'Atelier, `projects.parcel_transmission` ; sondage 1,5 s + clic hôte + page cachée dans `ParcelleTool.tsx` | ✅ | `app.test.ts` « transmits a parcel… like acceptParcel » (enveloppe 689,23 m², conflit, idempotence) ; e2e « borne déplacée → Conflit avec le bâtiment dessiné », « modèle non déplacé », « borne rétablie → liée » |
| Parcelle de l'exemple P.118 ouverte dans l'outil (fichier `parcelSnapshot()` dérivé du modèle natif, déjà liée) | Extraire | import `routes/examples.ts` (`parcelSnapshotFromNative`) | ✅ | `app.test.ts` « gives the imported P.118 project its parcel file in the tool » |

## 4. Analyses métier, Documents, Collaboration

Non portés : écrans de statut. L'audit (`reference.md`) situe leurs sources :
métrés dérivés du modèle (flow-v62), bilan Harmony du bâtiment
(harmony-engine-v6 / harmony-app-v6), dessins techniques et exports
(viewer natif), fichiers par étape (FILE_DB), export / import de projet JSON.

## 5. Repères de coordonnées (transversal)

| Fonction | Décision | Emplacement | État |
|---|---|---|---|
| Distinction cadastral / géographique / local, jamais mélangés | Conserver | `Coordinate` + gardes (`packages/domain-model/src/entities.ts`) ; objets importés tagués `frame: "local"` ; bornes `frame: "cadastral"` + `frame: "geographic"` séparées | ✅ |
| Conversion EPSG:26191 / EPSG:2154 → WGS84 | Extraire | définitions proj4 du prototype (`SITE_CRS_DEFINITIONS`) dans `apps/api/src/lib/site-context.ts` ; conversion explicite, taguée `frame: "geographic"`, uniquement pour l'affichage de la géolocalisation (étape 01) ; un CRS inconnu ne donne aucun centre | ✅ (B.266 : −7,3199225 / 33,7081855, identique au KMZ source) |
| Repère local du zonage (origine au centroïde des sommets) | Conserver | `siteContext()` : conversion explicite cadastral → local, le SVG et les zones restent en local, la transmission au modèle reste en cadastral | ✅ |

## Décisions techniques (cumulées)

- **Extraction reproductible** : `apps/api/scripts/extract-prototype-data.mjs <html>` régénère toutes les données (vérifie le SHA-256 du fichier source ; régénération byte-identique du modèle natif constatée).
- **Bundle esbuild pour l'API** (`apps/api/scripts/build.mjs`) : le moteur Harmonie, les KPI et la répartition vivent dans `@parcours/domain-model` (sources TypeScript) et s'exécutent côté serveur — `node dist/server.js` ne pouvait pas les charger sans bundle. `tsc --noEmit` reste la vérification de types ; données et SQL copiés à côté du bundle (`src/runtime-paths.ts`).
- **Serveur autoritaire** : les règles Harmonie (motif ≥ 8 caractères, responsable + preuve, « dessinée » ≥ étape 10, remplacement de variante, effets aval) et la validation des champs par type s'exécutent dans l'API ; le client affiche les refus tels quels (422, message en français du prototype).
- **Profil « Type à préciser »** tant que la répartition n'a pas été réglée : le prototype ne crée `programmeRepartition` qu'au premier passage par l'étape 06 (ordre-dépendant) ; Fadi fixe la règle : le type pilote le profil dès qu'il est déclaré.
- **Statuts d'étape** : `a-faire` → `en-cours` à la première saisie ou au premier arbitrage ; `termine` seulement par « Marquer terminée » (ou import d'un exemple illustré) ; une intention amont retenue ramène une cible terminée à `en-cours`.
- **Atelier = moteur du prototype, non réécrit** : extrait par script (`apps/web/scripts/extract-native-atelier.mjs`, SHA-256 vérifié), servi en scripts classiques, monté sur un sous-arbre DOM persistant déplacé / garé comme dans le prototype ; la seule couture est `window.ParcoursSession.storage`, prévue par le moteur. Le magasin `atelier_store` conserve ses clés verbatim ; `levels` / `architectural_objects` en sont une projection dérivée.
- **`levels.elevation` en `double precision`**, identifiants natifs préfixés par projet, import par lots, `modelRevision = 1` après import : voir sessions précédentes.
- **Outil Parcelle = document du prototype, non réécrit** : extrait par script (SHA-256 vérifié), chargé dans une iframe de même origine comme le prototype le faisait ; sa persistance `local-files.js` (localStorage) est remplacée par le contrat `/api/parcels` que l'outil parle nativement (`project-files.js`), servi par Fadi par projet avec révision par fichier. La transmission au modèle reprend `acceptParcel` à l'identique (statuts et motifs), s'exécute côté serveur sur la **capture** de l'outil (comme `frameReady` / `flushParcel`), et n'écrit rien quand la signature est déjà transmise.
- **Propositions de site calculées, pas figées** : le zonage (`triangulate` / `cutArea`), les textes « Pourquoi ici » et la proposition de départ sont recalculés à chaque lecture sur la parcelle courante et les données du site ; le domaine (`site.ts`) et la géométrie (`site-zoning.ts`) sont purs, l'API les exécute (autorité), le client ne fait que dessiner le SVG avec la même fonction.
- **Pièces jointes servies uniquement en pièce jointe** : un fichier déposé (y compris HTML / SVG) est renvoyé `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`, en `application/octet-stream` sauf images, audio, vidéo, PDF et texte brut — jamais rendu dans l'origine de Fadi. Les octets sont transmis bruts (`application/octet-stream`, nom et type dans des en-têtes) : le serveur n'interprète aucun fichier.
- **Panneau Harmonie de l'étape 01 placé sous l'outil Parcelle** (le prototype l'insérait dans la colonne gauche du document Parcelle via `ParcoursSectionsV82.place`) : même contenu, même ordre module → Harmonie, emplacement visuel différent ; documenté comme écart de présentation.

## Limites restantes

1. Atelier : le moteur est encapsulé tel quel (scripts classiques, non typés) ; sa page Harmony (V8.4), les propositions locales par local et l'analyse du modèle (flow-v62) ne sont pas portées ; le moteur n'est pas encore chargé paresseusement (≈ 440 Ko de scripts servis à la première ouverture seulement, mais toujours présents dans `public/`).
2. Étape 01 : fond MapTiler et altimétrie du panneau Harmonie non repris (la connexion MapTiler reste possible dans l'outil Parcelle) ; panneau Harmonie sous l'outil plutôt que dans sa colonne gauche ; pli « Exemples · qualités du site par type de bâtiment » (bibliothèque) absent.
3. Étapes 10/11 : pas de propositions locales, pas d'analyse du modèle.
4. Péremption des propositions (« À réexaminer »), « Actualiser les propositions », rapport d'étape : non portés.
5. Bibliothèques (exemples sources, bâtiments) et fiches d'espaces : données partiellement importées, aucun écran.
6. Documents de base (PDF), export / import de projet JSON, synthèse des choix Harmonie : non portés (les sources de l'étape le sont désormais).
7. Persistance locale / synchronisation hors-ligne, export d'archive complète : non commencés.
8. Analyses métier, Documents, Collaboration : non portés.
9. E2E : scénario Playwright exécuté localement (`apps/web/e2e/parcours-scenario.mjs`) ; pas encore dans la CI (navigateur à installer sur le runner).

## Prochaine action

Bibliothèques : exemples sources `SOURCE_EXAMPLES` (10 cas, « Utiliser
comme aide au remplissage ») et bibliothèque des bâtiments (21 cas), avec le
pli « Exemples · qualités du site par type de bâtiment » de l'étape 01.
Ensuite : propositions locales des étapes 10/11 et analyse du modèle
(flow-v62), puis export / import de projet (archive).
