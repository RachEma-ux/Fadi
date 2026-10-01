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
| Propositions de site A/B/C de l'étape 01 (zonage sur la parcelle, mini-plan, recommandation par priorité déclarée) | — | — | ⛔ | Nécessite le contexte de site (parcelle + observations) : à faire avec l'outil Parcelle |
| Propositions LOCALES par local (étapes 10/11, analyse du modèle natif), péremption « À réexaminer » par empreinte des données amont, « Actualiser les propositions », « Rapport de cette étape » | — | — | ⛔ | Dépend de l'analyse du modèle (flow-v62) et de l'Atelier |
| Exemple P.118 résolu : récit du choix (« Pourquoi ce choix »), réponses renseignées (12 rubriques nommant donnée / hypothèse), choix retenu avec responsable et preuve, 21/21 illustrées | Extraire | `p118-exemple-complet.json` (+ `business`) ; import `POST /examples/:id/import` | ✅ | `app.test.ts` « imports an example… » ; e2e ; `captures/webapp/02-desktop.png` |
| « Créer une copie pour essayer » | Adapter | l'import crée toujours une copie éditable appartenant à l'utilisateur | ✅ | `app.test.ts` |
| Bibliothèque d'exemples (SOURCE_EXAMPLES, 10 cas ; « Utiliser comme aide au remplissage ») et bibliothèque des bâtiments (21 cas) | — | — | ⛔ | `SOURCE_EXAMPLES`, `building-library-data` non extraits |
| Sources de l'étape (dépôt de fichiers, liste, téléchargement, suppression — IndexedDB) | — | — | ⛔ | Stockage serveur de fichiers à concevoir (module Projets et sources) |
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
| Niveaux, élévations réelles (décimales) | Adapter | `levels` (`double precision`) | ✅ | `app.test.ts` (élévation −3,2 / 3,2 exactes) |
| Modèle natif complet de P.118 : 220 murs, 120 poteaux, 84 portes, 126 fenêtres, 32 volées, 967 tracés, 64 cotes, 95 repères, 45 locaux, 6 niveaux ; relations porte/fenêtre → mur hôte | Extraire | `p118-native-architecture.json` → `architectural_objects` ; ids préfixés projet, relations remappées | 🟡 | Persisté et interrogeable (`app.test.ts`) ; **non visualisé** hors murs |
| Dessin d'un mur (outil minimal actuel) | Conserver | `AtelierPanel.tsx` | 🟡 | Hérité, SVG par mur ; pas de plan |
| Moteur natif : viewer 3D canvas, plan / coupe / façade SVG, dessins techniques, vues enregistrées, créateur de vue, couches parcelle / recul / emprise / voirie, exports PNG / SVG / DXF, études solaires, toit, « Éclaté » ; outils de dessin (tracés, guides, accrochage, ouvertures sur mur hôte, extrusion, pousser / tirer, dupliquer, décaler, annuler / rétablir) | Extraire (encapsuler, ne pas réécrire) | — | ⛔ | Localisé précisément (`reference.md` : scripts anonymes #1 et #2 + 246 Ko de CSS + markup) ; prochaine tranche |
| Parcelle (01) : import KML/KMZ, carte, bornes, cotes, EPSG:26191 → WGS84 | — | bornes et WGS84 fournis par la source conservés (`p118-parcel.json`, pièce jointe du projet) | 🟡 | Outil Leaflet à porter ; `projects.parcel_footprint` reste null |

## 4. Analyses métier, Documents, Collaboration

Non portés : écrans de statut. L'audit (`reference.md`) situe leurs sources :
métrés dérivés du modèle (flow-v62), bilan Harmony du bâtiment
(harmony-engine-v6 / harmony-app-v6), dessins techniques et exports
(viewer natif), fichiers par étape (FILE_DB), export / import de projet JSON.

## 5. Repères de coordonnées (transversal)

| Fonction | Décision | Emplacement | État |
|---|---|---|---|
| Distinction cadastral / géographique / local, jamais mélangés | Conserver | `Coordinate` + gardes (`packages/domain-model/src/entities.ts`) ; objets importés tagués `frame: "local"` ; bornes `frame: "cadastral"` + `frame: "geographic"` séparées | ✅ |
| Conversion EPSG:26191 ↔ WGS84 | Reporter | la source fournit déjà les deux jeux de coordonnées et son hypothèse (±7 m) ; aucune conversion calculée par Fadi | 🟡 |

## Décisions techniques (cumulées)

- **Extraction reproductible** : `apps/api/scripts/extract-prototype-data.mjs <html>` régénère toutes les données (vérifie le SHA-256 du fichier source ; régénération byte-identique du modèle natif constatée).
- **Bundle esbuild pour l'API** (`apps/api/scripts/build.mjs`) : le moteur Harmonie, les KPI et la répartition vivent dans `@parcours/domain-model` (sources TypeScript) et s'exécutent côté serveur — `node dist/server.js` ne pouvait pas les charger sans bundle. `tsc --noEmit` reste la vérification de types ; données et SQL copiés à côté du bundle (`src/runtime-paths.ts`).
- **Serveur autoritaire** : les règles Harmonie (motif ≥ 8 caractères, responsable + preuve, « dessinée » ≥ étape 10, remplacement de variante, effets aval) et la validation des champs par type s'exécutent dans l'API ; le client affiche les refus tels quels (422, message en français du prototype).
- **Profil « Type à préciser »** tant que la répartition n'a pas été réglée : le prototype ne crée `programmeRepartition` qu'au premier passage par l'étape 06 (ordre-dépendant) ; Fadi fixe la règle : le type pilote le profil dès qu'il est déclaré.
- **Statuts d'étape** : `a-faire` → `en-cours` à la première saisie ou au premier arbitrage ; `termine` seulement par « Marquer terminée » (ou import d'un exemple illustré) ; une intention amont retenue ramène une cible terminée à `en-cours`.
- **`levels.elevation` en `double precision`**, identifiants natifs préfixés par projet, import par lots, `modelRevision = 1` après import : voir sessions précédentes.

## Limites restantes

1. Atelier : moteur natif non porté ; 87 % des objets P.118 persistés mais invisibles.
2. Étape 01 : pas d'outil Parcelle ; propositions de site A/B/C absentes.
3. Étapes 10/11 : pas de propositions locales, pas d'analyse du modèle.
4. Péremption des propositions (« À réexaminer »), « Actualiser les propositions », rapport d'étape : non portés.
5. Bibliothèques (exemples sources, bâtiments) et fiches d'espaces : données partiellement importées, aucun écran.
6. Sources de l'étape (fichiers), documents de base (PDF), export / import de projet JSON, synthèse des choix Harmonie : non portés.
7. Persistance locale / synchronisation hors-ligne, export d'archive complète : non commencés.
8. Analyses métier, Documents, Collaboration : non portés.
9. E2E : scénario Playwright exécuté localement (`apps/web/e2e/parcours-scenario.mjs`) ; pas encore dans la CI (navigateur à installer sur le runner).

## Prochaine action

Porter l'Atelier natif en module encapsulé : extraire le markup, le CSS et
les scripts anonymes #1/#2 du prototype dans `apps/web/src/modules/atelier/native/`,
les monter derrière une interface stable (chargement / sauvegarde du modèle
par l'API Fadi au lieu de `localStorage design.v13.*`), puis comparer
l'affichage du modèle P.118 avec `captures/reference/10-desktop.png` et
`11-desktop.png`.
