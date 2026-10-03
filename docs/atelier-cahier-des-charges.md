# Cahier des charges — Atelier Architecture selon DrawAll V4.1

**Document d'exécution pour Claude Code (chef de projet et équipiers).** Version 1.0 — 3 octobre 2026.
Maître d'ouvrage : le propriétaire du dépôt. Il valide chaque lot ; rien n'est « disponible » sans sa validation.

Il concrétise la proposition acceptée `docs/atelier-drawall.md` (ligne « reconstruction complète, sans pont ») et
la rend exécutable : règles, contrats techniques, lots, tâches, critères d'acceptation, organisation du travail.
En cas de contradiction entre documents, l'ordre d'autorité est :

1. `AGENTS.md` (règles du dépôt — jamais négociables) ;
2. ce cahier des charges ;
3. `docs/atelier-drawall.md` (proposition : architecture cible, périmètre, couverture DA / T) ;
4. `docs/drawall/DrawAll_v4.1_Architecture.md`, `docs/drawall/DrawAll_v4.1_Concept.md`,
   `docs/drawall/DrawAll_v4.1_Exigences_Sources.md` (le référentiel DrawAll ; l'annexe D de l'Exigences est
   normative : décisions D1–D6) ;
5. `docs/architecture.md` (plan du dépôt, amendé par le lot 0) et `docs/migration/matrix.md` (état de
   l'existant).

Une contradiction non résolue par cet ordre est une **décision du maître d'ouvrage** (section 10) : on s'arrête
et on demande ; on n'invente pas.

---

## 0. Mode d'emploi

**Ordre de lecture avant la première action :** `CLAUDE.md` → `AGENTS.md` → ce document → `docs/atelier-drawall.md`
→ `docs/drawall/*.md` → `docs/architecture.md` → `docs/migration/matrix.md` (section 3, l'Atelier actuel) →
`apps/web/src/modules/atelier/README.md`.

**Unité de travail : le lot.** Les lots s'exécutent dans l'ordre 0 → 1 → 2 → 3a → 3b → 4, puis 5 → 6 → 7 → 8
(réordonnables), puis 9. Un lot n'est commencé que lorsque le précédent est **accepté par le maître d'ouvrage**,
sauf instruction explicite de sa part. À l'intérieur d'un lot, les tâches sont parallélisables selon la matrice
de propriété des fichiers (section 9).

**Cycle d'un lot :**

1. Le chef de projet crée les tâches du lot (une par tâche `Lx.y` ci-dessous, avec dépendances), rédige ou
   complète les fiches de capacité concernées (`docs/atelier/fiches/`), et assigne.
2. Les équipiers réalisent, testent, documentent, livrent sur leur branche ; le chef de projet relit, intègre,
   fait passer la CI.
3. Le chef de projet vérifie la *Definition of Done* du lot (section 11), rédige le compte rendu
   `docs/atelier/lots/lot-N.md` (fait, non fait, mesures, décisions prises, décisions à prendre), met à jour
   `docs/migration/matrix.md` et `docs/atelier/decisions.md`.
4. Il demande l'acceptation au maître d'ouvrage en indiquant **ce qu'il peut vérifier lui-même** (section 7,
   colonne « vérifiable »).

**Prompt de lancement** (à coller dans Claude Code à la racine du dépôt) :

> Lis `docs/atelier-cahier-des-charges.md` et exécute le lot 0 selon sa section 7. Tu es le chef de projet :
> crée les tâches, distribue-les à des équipiers selon la section 9, intègre, et arrête-toi à la fin du lot
> avec le compte rendu `docs/atelier/lots/lot-0.md` et la liste des décisions qui m'appartiennent.

Prompts par lot et prompts d'équipiers : annexe E.

---

## 1. Objet

Reconstruire l'Atelier Architectural de Fadi comme la *lecture bâtiment* de DrawAll : l'ontologie
`building.architecture` portée par les contrats de l'Architecture V4 (identités définition / occurrence /
représentation, commandes typées transactionnelles et idempotentes, références topologiques « à réparer »,
documents dérivés rattachés à une révision, versions nommées et variantes, travail local explicite) et par les
décisions normatives D1–D6, à l'intérieur du monolithe modulaire existant.

**Résultat attendu à la fin du lot 4 :** un seul Atelier dans le produit, neuf, utilisable au clavier, à la
souris et au toucher, sur ordinateur et téléphone, dans lequel l'exemple complet P.118 est importé sans perte,
et qui passe le scénario d'acceptation. Le moteur extrait du prototype a été supprimé du dépôt.

**Résultat attendu à la fin du lot 9 :** les documents dérivés (plans, coupes, façades, feuilles, tableaux,
quantités, PDF), les échanges IFC 4.3 / DXF, les versions nommées, variantes et publications, l'API de script et
l'assistant à boucle contrôlée — chacun avec sa fiche de capacité, sa preuve et son état.

---

## 2. Périmètre

### 2.1 Dedans

- **Ontologie `building.architecture`** : niveau (étage), mur, porte, fenêtre, ouverture, dalle, toiture,
  escalier, pièce, espace, zone. **`building.structure`** réduit à une classe : poteau (le prototype en a 120).
  **`drawing`** (M01 / M02) : esquisse (ligne, polyligne, arc, cercle, rectangle, polygone, spline, ligne de
  construction, hachure), solide générique (extrusion d'un contour), référence de plan. **`annotation`** (M11) :
  cotation, texte, étiquette. **Projet** : parcelle, emprise, calques, hypothèses, sources, structure déclarée.
- Les entrées DA retenues (138 sur 324) et les exigences T01–T20 selon `docs/atelier-drawall.md` §5, avec leur
  lot cible.
- Les modules DrawAll M01–M05 → module Fadi *Atelier* ; M11 → *Documents* (et vues dans l'Atelier) ; M12 →
  *Analyses métier* ; M16 → *Collaboration* ; M17 → *Projets et sources* / *Documents*.

### 2.2 Dehors (ne pas commencer, ne pas « préparer »)

Structure complète (M06), bois, tôlerie, mécanique, réseaux, électricité, électronique, FAO, simulation
physique, DWG / DGN natifs, solveur de contraintes général, rendu photoréaliste, noyau B-Rep OCCT (lot
optionnel distinct, soumis à l'arbitrage de licence du maître d'ouvrage), CRDT sur la géométrie, WebGPU par
défaut, « certification » IFC, STEP.

### 2.3 Ce qui ne bouge pas

Les 21 étapes du Parcours (numérotation 01–21, phases, libellés, cartes mobiles), Harmonie dans chaque étape
concernée (dont la sous-page « Harmonie du bâtiment » de l'étape 10 et le bilan du bâtiment conçu des étapes
10 / 11), l'outil Parcelle (étape 01) et sa transmission au modèle, la Programmation et ses liaisons au modèle
dessiné, le catalogue de documents et sa fraîcheur, le partage et les rôles, la file hors ligne, la
sauvegarde / restauration, l'hébergement (`docs/deploiement.md`).

---

## 3. Règles non négociables

Chaque équipier les applique ; le chef de projet les vérifie à chaque intégration. Référencer par numéro dans
les comptes rendus.

| Nº | Règle | Origine |
| --- | --- | --- |
| R1 | Application en français ; code, identifiants et commits lisibles ; commentaires en français ou en anglais, pas de mélange dans un même fichier. | AGENTS.md |
| R2 | Les 21 étapes, phases, libellés et cartes mobiles sont intouchables. Le nouvel Atelier s'insère aux mêmes endroits que l'ancien (module `atelier`, étapes 10 et 11 en mode immersif). | AGENTS.md |
| R3 | Aucune donnée réglementaire, structurelle ou de projet inventée. Une valeur absente est « non évaluée », jamais devinée. P.118 est une donnée de projet, jamais une valeur par défaut d'un autre bâtiment. | AGENTS.md |
| R4 | `Exigence`, `Hypothèse`, `Recommandation` sont trois choses distinctes. Les champs `meta.structure`, `meta.assumptions`, `meta.sources` de P.118 sont importés comme hypothèses, sources et valeurs déclarées « à confirmer » — jamais comme exigences. | AGENTS.md |
| R5 | Trois repères (`cadastral`, `geographic`, `local`), toute coordonnée taguée, toute conversion explicite (`packages/domain-model`, `Coordinate`). L'export IFC porte `IfcMapConversion` depuis le CRS de la parcelle. | AGENTS.md, T04 |
| R6 | Géométrie indépendante de React et du DOM : `packages/atelier-model` et `packages/core-geometry` n'importent ni `react`, ni `three`, ni une API navigateur. | AGENTS.md, §3 Architecture V4 |
| R7 | Rien n'est omis silencieusement : chaque élément de P.118 (220 murs, 120 poteaux, 84 portes, 126 fenêtres, 32 escaliers, 967 tracés, 64 cotations, 95 textes, 45 pièces, 6 niveaux, parcelle, emprise, 20 calques, hypothèses, sources, structure) a une destination dans le modèle typé, et l'import produit un rapport nominatif de ce qui a été transformé. Aucun arrondi (altitudes décimales, aires, coordonnées). | AGENTS.md |
| R8 | Une **fiche de capacité** (`docs/atelier/fiches/DA-XX-YY.md`, gabarit `_gabarit.md`) existe et est à l'état « spécifiée » avant le code d'une fonction ; l'état « disponible » n'est posé qu'avec la preuve liée (test, scénario, capture) et l'acceptation du maître d'ouvrage. | Exigences V4, méthode |
| R9 | Toute modification du modèle passe par une commande typée, idempotente (`requestId`), validée par le serveur, journalisée, inversible. Pas d'écriture directe en base depuis une route hors du service de commandes. Les scripts et l'assistant utilisent les mêmes commandes. | §6 Architecture V4, T06, T19 |
| R10 | Les paramètres d'affichage (caméra, sélection, niveau visible, mode) ne touchent jamais la révision du modèle. | `docs/architecture.md` |
| R11 | Un document dérivé (vue, feuille, tableau, export) porte la révision et l'empreinte dont il est issu ; périmé, il reste consultable mais ne peut pas être présenté comme actuel. | T07 |
| R12 | Une référence (cotation, ouverture, contrainte) rendue incertaine passe « à réparer » avec des propositions ; jamais de rattachement silencieux. | §5.2 Architecture V4, T05 |
| R13 | Droits relus par le serveur à chaque requête (`read` / `comment` / `write` / `owner`), 404 sans accès, 403 motivé, 423 pendant une réservation d'édition d'autrui. Les équipiers ne contournent jamais un refus. | T10 |
| R14 | Rendu 3D : WebGL2 (three.js) par défaut ; WebGPU uniquement derrière un réglage avec repli automatique. Aucun chiffre de performance annoncé avant mesure ; les mesures sont imprimées par le scénario (`⏱`). | D2, Concept §11 |
| R15 | Géométrie canonique **paramétrique** pour les objets du bâtiment ; solides, symboles et maillages dérivés par un moteur identifié et versionné. Aucun objet n'a deux géométries canoniques. OCCT absent du dépôt tant que le maître d'ouvrage n'a pas tranché la licence. | D1 |
| R16 | IFC 4.3 : conformité **testée** (corpus, validation en CI), jamais le mot « certifié ». Un objet importé d'IFC n'a pas d'historique paramétrique inventé. | D5 |
| R17 | Pas de CRDT sur la géométrie ; réservation, variantes et fusion par rejeu validé. Yjs au plus pour le texte d'annotation, et seulement si le lot 0 l'a retenu. | D3 |
| R18 | Jamais de secret, de `node_modules`, de build (`dist/`), ni du HTML de référence `Parcours_V8_19_Escalier_B_Mezzanine.html` dans un commit. Les clés MapTiler des utilisateurs ne transitent jamais par l'API ni dans un rapport. | AGENTS.md |
| R19 | Avant tout commit : `npm run typecheck`, `npm test`, `npm run build` ; avant toute demande d'acceptation : scénario Playwright complet et CI verte. Un contrôle qui n'a pas pu tourner est déclaré, jamais tu. | AGENTS.md |
| R20 | Le code est livré typé (`strict`), avec gestion d'erreurs, états vide / chargement / erreur dans l'interface, sans `TODO` sur une partie critique, sans fonction factice présentée comme réelle. | Definition of Done |

---

## 4. Environnement, outillage, commandes

- **Prérequis :** Node.js ≥ 22.12, npm, PostgreSQL 16+ avec PostGIS, Chromium Playwright (`npx playwright
  install chromium` si absent), Python 3 + `ifcopenshell` (pip) pour la validation IFC en CI (lot 6).
- **Installation :** `npm ci` ; `cp apps/api/.env.example apps/api/.env` ; créer rôle et bases (voir
  `apps/api/README.md`) ; `npm run db:migrate` (idempotent, `apps/api/src/db/init.sql`).
- **Développement :** `npm run dev:api` (API :3001) et `npm run dev` (Vite :5173, proxy vers l'API).
- **Contrôles :** `npm run typecheck`, `npm test` (vitest : `core-geometry`, `domain-model`, `api` contre une
  vraie base `fadi_test`), `npm run build`.
- **Scénario de bout en bout :** API construite servant le build (`WEB_DIST=apps/web/dist node
  apps/api/dist/server.js`, variables `DATABASE_URL`, `WEB_ORIGIN=http://localhost:3001`, `PORT=3001`,
  `MIGRATE_ON_START=1`, `AUTH_RATE_LIMIT=500`, `API_RATE_LIMIT=5000`), puis `BASE_URL=http://localhost:3001
  node apps/web/e2e/parcours-scenario.mjs` (après le lot 0 : `node apps/web/e2e/run.mjs` qui enchaîne les
  scénarios par module, annexe D).
- **CI :** `.github/workflows/ci.yml` (jobs `validate`, `e2e` en mode production avec restauration vérifiée,
  `image`). La CI doit rester verte sur `main` à chaque intégration. `builder-deploy.yml` (instance de
  démonstration temporaire) n'est pas modifié par ce chantier.
- **Bases par équipier :** chaque équipier travaille dans son worktree Git avec sa propre base
  (`fadi_<equipier>` et `fadi_<equipier>_test`) et son propre port ; jamais deux équipiers sur la même base.
- **Journal des décisions :** `docs/atelier/decisions.md` (date, décision, motif, auteur, lot).
- **Mesures :** `docs/atelier/p0-mesures.md` puis une section par lot ; banc déclaré (machine, navigateur,
  GPU, taille du modèle, triangles, état du cache).

---

## 5. Architecture et contrats techniques

### 5.1 Paquets, modules et dépendances

```
packages/domain-model      (existant) repères, exigences / hypothèses / recommandations, documents, CommandHistory
packages/core-geometry     (existant) géométrie pure : solides par extrusion, projections, coupes — relu au lot 1
packages/atelier-model     (nouveau)  ontologie, modèle typé, commandes et réducteurs, références, quantités,
                                      importeur P.118, projection vers l'entrée d'analyse, mappage IFC
apps/api                   (existant) service de commandes, journal, boîte de sortie, documents dérivés, échanges
apps/web/src/modules/atelier (réécrit) interface UX1–UX4, éditeur 2D, rendu 3D, bus local
```

Dépendances autorisées : `atelier-model` → `domain-model`, `core-geometry` ; `api` → les trois paquets ; `web`
→ les trois paquets. Interdit : un paquet pur qui importe `react`, `three`, `express`, `drizzle-orm`, une API
navigateur ou un autre module de `apps/web`. Manifeste `packages/atelier-model/manifest.json` (`name`,
`version`, `contracts: { "atelier-commands": 1 }`, `allowedDependencies`) et script `scripts/check-module-deps.mjs`
exécuté par `npm run typecheck` (échec = import interdit), T14.

### 5.2 Modèle d'information

Entités (Architecture V4 §4) et classes de l'ontologie. Toute grandeur est `{ value, unit }` ; toute
coordonnée est `{ x, y, frame: "local", unit: "m" }` (ou `cadastral` / `geographic` pour la parcelle).

| Classe | Ontologie | Paramètres canoniques (unités) | Relations |
| --- | --- | --- | --- |
| `niveau` | building.architecture | `nom`, `elevation` (m, décimal), `hauteur` (m), `ordre` | contient les objets du niveau |
| `mur` | building.architecture | `axe` (a, b, local m), `epaisseur` (m), `hauteur` (m) ou `niveauHaut`, `alignement` (gauche / axe / droite), `typeId` (définition : `cloison`, `mur`, `non-type`), `exterieur` (bool, d'après `exteriorWallIds`), `calqueId`, `nom` | `heberge` → ouvertures ; `delimite` → pièces (dérivée) ; `joint-a` → murs (dérivée) |
| `porte`, `fenetre`, `ouverture` | building.architecture | `murHoteId`, `position` (t ∈ [0,1] le long de l'axe, et `distance` m dérivée), `largeur`, `hauteur`, `allege` (m), `repere` (mark), `typeId` | `heberge-par` → mur |
| `dalle` | building.architecture | `contour` (polygone local), `trous`, `epaisseur` (m), `decalageBase` (m), `niveauId` | `porte` → objets posés (dérivée) |
| `toiture` | building.architecture | `contour`, `type` (plate / monopente / bipente), `epaisseur`, `pente` (°), `niveauId` | — |
| `escalier` | building.architecture | `axe` (a, b), `largeur`, `hauteurAFranchir`, `marches`, `contremarches`, `epaisseurPaillasse`, `decalageBase`, `niveauDepartId`, `niveauArriveeId`, `groupe`, `referencePlanSeulement` (bool) | `relie` → deux niveaux |
| `piece` | building.architecture | `polygones`, `code`, `nom`, `categorie`, `aireDeclaree` (m², provenance `prototype`), `aireCalculee` (dérivée), `notes`, `etiquette` | `delimitee-par` → murs (dérivée) ; `programme` → espace programmé (liaison existante) |
| `espace`, `zone` | building.architecture | `polygones`, `nom`, `categorie` ; une zone `contient` des pièces / espaces | `contient` |
| `poteau` | building.structure | `point`, `formeId` (`basic-square`), `largeur`, `profondeur`, `hauteur`, `angle`, `nom`, `statutConception` | — |
| `solide` | drawing | `contour`, `trous`, `ferme`, `hauteur`, `decalageBase`, `epaisseur`, `role` (conservé tel quel : `solid`, `clearance`, `core-zone`, `ramp-*`, …), `calqueId`, `nom`, `couleur` | — |
| `esquisse.*` | drawing | ligne, polyligne, arc, cercle, rectangle, polygone, spline, construction, hachure : géométrie 2D locale + `calqueId` | contraintes (lot 5) |
| `reference-plan` | drawing | contour ou image de fond, `source`, `echelle` | — |
| `cotation`, `texte`, `etiquette` | annotation | `a`, `b`, `decalage` / `position`, `texte`, `calqueId`, **références** vers des caractéristiques d'objets | `reference` → `{objetId, caracteristique}` |
| `calque` | projet | `nom`, `couleur`, `remplissage`, `visible`, `verrouille`, `ordre` | — |
| `parcelle`, `emprise` | projet (site) | sommets tagués (cadastral EPSG + local), `crs`, `aire`, `aireOfficielle`, `recul`, `enveloppeRecul` | — |
| `hypothese`, `source`, `structureDeclaree` | projet | H01…, CAD-S01…, système, portée, charge « à confirmer » — statut explicite | — |

- **Identités :** `definition` (type réutilisable, catalogue versionné), `occurrence` (objet placé),
  `representation` (`plan-2d`, `solide-3d`, `symbole`, `brep` plus tard) avec `autorite`
  (`parametrique` / `derivee` / `importee`), `moteur`, `versionMoteur`, `empreinteEntrees`. Identifiants stables
  `${projectId}_${id}` (règle existante).
- **Propriétés typées :** `{ nom, valeur, unite, provenance (saisie / import / calcul / regle), statut
  (declaree / verifiee / a-verifier) }` ; propriétés BIM et classification (classe IFC, code de classification
  optionnel).
- **Caractéristiques nommées** (pour les références) : `mur:face-gauche`, `mur:face-droite`, `mur:arete-debut`,
  `mur:arete-fin`, `mur:axe`, `dalle:contour[i]`, `ouverture:centre`, `escalier:depart`, `escalier:arrivee`,
  `poteau:centre`. Stables tant que l'objet existe ; une scission crée de nouveaux objets → références à réparer.

### 5.3 Commandes

Enveloppe (contrat `atelier-commands/1`) :

```json
{
  "requestId": "f3c1…-uuid",
  "baseRevision": 42,
  "contract": "atelier-commands/1",
  "label": "Tracer un mur",
  "commands": [
    {
      "type": "mur.tracer",
      "params": {
        "niveauId": "rdc",
        "a": { "x": 0, "y": 0, "frame": "local", "unit": "m" },
        "b": { "x": 4.5, "y": 0, "frame": "local", "unit": "m" },
        "epaisseur": { "value": 0.2, "unit": "m" },
        "hauteur": { "value": 3.2, "unit": "m" },
        "typeId": "cloison",
        "calqueId": "Cloisons"
      },
      "cibles": []
    }
  ]
}
```

Règles : un lot de commandes est atomique (tout ou rien) ; chaque commande déclare ses préconditions (objets
existants, niveau existant, unités compatibles, droits), ses effets (objets créés / modifiés / supprimés,
relations, références touchées) et son inverse ; les réducteurs sont des fonctions pures
`(etat, commande) → { etat, inverse, effets }` dans `packages/atelier-model`, exécutées **à l'identique** dans le
navigateur (aperçu) et sur le serveur (validation). Les paramètres d'affichage ne sont pas des commandes (R10).
Catalogue initial : annexe B.

### 5.4 API (apps/api, préfixe `/projects/:projectId/atelier`)

| Méthode et route | Rôle | Réponses |
| --- | --- | --- |
| `GET /model?revision=n` | Instantané typé complet (niveaux, objets, relations, définitions, calques, site, hypothèses, sources) à la révision courante ou demandée | 200 ; 404 |
| `GET /model/niveaux/:niveauId` | Instantané d'un niveau (chargement par niveau) | 200 |
| `POST /commands` | Lot de commandes (enveloppe 5.3) | 200 `{ revision, applique: [{type, objetIds}], effets: { vues, documents, problemes }, journalId }` ; 400 `{ erreur: "invalide", details: [{chemin, message}] }` ; 403 ; 404 ; 409 `{ erreur: "conflit", baseRevision, revisionCourante, conflits: [{objetId, motif, etatServeur}] }` ; 423 réservation d'autrui |
| `POST /commands/annuler`, `POST /commands/retablir` | Inverse d'une entrée du journal (nouvelle microversion, `inverseDe`) | comme `/commands` |
| `GET /journal?apres=n` | Entrées du journal depuis une révision (synchronisation incrémentale) | 200 |
| `GET /problemes` | Références à réparer, conflits en attente, documents périmés, réserves Harmonie | 200 |
| `POST /commands/essai` | Exécution à blanc (validation sans transaction) — aperçu des effets, utilisée par les scripts et l'assistant | 200 / 400 / 409 |

Idempotence : index unique `(project_id, request_id)` ; une requête déjà validée renvoie la réponse enregistrée
sans réappliquer. Transaction : `SELECT … FOR UPDATE` sur la ligne du projet (règle existante), vérification de
`baseRevision` = révision courante (sinon 409 détaillé), application, écriture du journal et de la boîte de
sortie dans la même transaction, puis `projects.model_revision + 1`.

Événements (boîte de sortie, traités dans le processus de l'API après validation, idempotents par identifiant) :
`atelier.commande.validee { projectId, revision, objetIds, types, auteur }` → marquage des vues et documents
périmés, péremption du bilan Harmonie, invalidation de l'aperçu conceptuel, notifications.

### 5.5 Stockage

Tables (propriété du module Atelier, `init.sql` idempotent, préfixe `atelier_`) : `atelier_definitions`,
`atelier_objects` (`ontology`, `class`, `level_id`, `definition_id`, `params jsonb`, `layer_id`, `group_id`,
`phase`, `model_revision`, `deleted_at`), `atelier_properties`, `atelier_relations`, `atelier_representations`,
`atelier_layers`, `atelier_site` (parcelle, emprise, hypothèses, sources, structure déclarée),
`atelier_commands` (journal : `request_id` unique par projet, `contract`, `label`, `base_revision`,
`result_revision`, `commands`, `inverse`, `effets`, `author_id`, `created_at`, `inverse_of`), `atelier_outbox`.
Lot 5 : `atelier_views`, `atelier_sheets`. Lot 7 : `atelier_versions`, `atelier_variants`,
`atelier_publications`, `atelier_locks`. Volumes immuables : table `volumes` (`id` = SHA-256, `mime`, `size`,
`content bytea`) derrière l'interface `VolumeStore` (implémentation base aujourd'hui ; stockage objet plus tard,
hors dépôt).

**À supprimer au lot 4 (bascule)** : `atelier_store`, `levels`, `architectural_objects` ;
`apps/api/src/routes/atelier.ts`, `apps/api/src/lib/atelier-store.ts`, `apps/api/src/lib/native-projection.ts` ;
les routes `/projects/:id/levels` et `/levels/:id/objects` (aucun écran ne les utilise) ;
`apps/web/public/atelier-native/`, `apps/web/src/modules/atelier/native/`, `NativeAtelier.tsx`,
`apps/web/scripts/extract-native-atelier.mjs` ; `packages/core-geometry/src/project-repository.ts` ; les
tests et les blocs du scénario qui les exerçaient. Les données de l'exemple (`p118-native-model.json`) **restent**
(source de l'importeur). Migration idempotente ; `scripts/verify-restore.sh` adapté.

### 5.6 Consommateurs du modèle à rebrancher (lot 4)

Aujourd'hui, l'analyse du modèle (`apps/api/src/lib/model-context.ts`, `loadNativeDomains` →
`analyseNativeDomains` → `ModelAnalysis` de `packages/domain-model/src/model-analysis.ts`) alimente : le bilan
du bâtiment conçu (`design-context.ts`, `routes/design-review.ts`), les étapes et Harmonie (`step-context.ts`),
le contexte de site (`site-context.ts`), l'aperçu conceptuel de l'accueil (`concept-preview.ts`), les documents
(plan de lecture SVG, tableau des surfaces), les contrôles métier, la transmission de la parcelle
(`parcel-transmission.ts`, `routes/parcels.ts` écrit `nativeParcel` / `buildingFootprint`), l'archive
(`project-archive.ts`, `packages/domain-model/src/archive.ts`), l'import de l'exemple (`routes/examples.ts`).

Règle : `packages/atelier-model` fournit **une projection pure `modeleType → entrée d'analyse`** (même forme que
les domaines natifs consommés aujourd'hui, ou nouvelle forme avec adaptation de `model-analysis.ts`), de sorte
que chaque consommateur change une seule ligne (sa source) et que ses tests existants continuent de passer. La
transmission de la parcelle devient deux commandes (`site.parcelle.definir`, `site.emprise.definir`). L'archive
exporte le modèle typé (version d'archive incrémentée) et importe les archives antérieures et les exports du
prototype par l'importeur du lot 1.

### 5.7 Client (apps/web)

- **Bus local** : même réducteur que le serveur ; application optimiste ; état par objet et par commande
  `local` → `synchronise` | `conflit` ; `a-recalculer` sur les documents ; `publie` (lot 7).
- **File hors ligne** : Dexie, une entrée par lot de commandes (`requestId`, `baseRevision`, enveloppe), rejouée
  à la reconnexion dans l'ordre ; 409 → résolution explicite (garder le serveur / réappliquer sur l'état courant
  / garder en variante au lot 7) ; jamais de fusion automatique. Joignabilité (`lib/reachability.ts`) et sonde
  `/health` conservées.
- **Périmètre local** affiché : commandes exécutables hors ligne (toutes celles du réducteur) ; opérations
  serveur (IFC, PDF, variantes, contrôles lourds) annoncées indisponibles avec le motif. Quota
  (`navigator.storage.estimate()`) affiché dans Paramètres.
- **Rendu** : three.js `WebGLRenderer` (WebGL2) ; scène par niveau, instanciation des ouvertures et poteaux,
  sélection par lancer de rayon, plans de coupe, modes volume / éclaté / coupe ; `WebGPURenderer` derrière
  `parametres.rendu = "webgpu"` avec repli ; budget de trame mesuré (`⏱`). Plan 2D et vues techniques : SVG /
  Canvas 2D en TypeScript, rendus depuis `core-geometry`.
- **Chargement** : module `atelier` chargé à la demande (`lazy`), mis en cache par le service worker (règle
  existante : ouverture hors ligne).

### 5.8 Interface (UX1–UX4)

- Cinq repères permanents : **navigateur du projet** (niveaux, calques, objets par classe, documents),
  **zone de travail** (2D / 3D, bascule, niveau actif), **commandes** (barre contextuelle + palette `Ctrl/⌘ K`),
  **inspecteur** (propriétés typées avec unités, erreurs « objet, cause, action »), **panneau des modifications et
  problèmes** (journal, états de synchronisation, références à réparer, conflits, documents périmés, réserves
  Harmonie).
- Niveaux d'affichage **Essentiel / Contextuel / Complet**, favoris épinglés, raccourcis conservés.
- Palette : outils, objets, paramètres, aides ; synonymes français et termes d'autres logiciels
  (« push/pull », « offset », « trim », « décaler », « ajuster ») ; chaque résultat dit l'action, les conditions
  d'activation et un exemple court.
- Cycle de chaque geste : sélection → paramètres → **aperçu** → contrôle → validation. Accrochages visibles
  (extrémité, milieu, perpendiculaire, intersection, orthogonal, grille 0,50 m conservée), saisie de précision
  (longueur, angle) pendant le tracé.
- Aide située par commande (exemple court, paramètre expliqué) ; familles Créer / Modifier / Connecter /
  Analyser / Documenter / Partager.
- Téléphone et tablette : pointeur et toucher unifiés (`pointer events`), cartes et mode immersif des étapes
  10 / 11 conservés (`lib/use-immersive.ts`), puce d'outil actif conservée.
- Accessibilité : WCAG 2.2 AA ; tâches définies réalisables au clavier (tracer un mur, poser une porte, modifier
  une propriété, annuler, changer de niveau, exporter) ; axe-core en CI sans violation critique ou sérieuse.
- Points d'insertion : `apps/web/src/routes/ProjectShell.tsx` (module `atelier`), `modules/parcours/
  ParcoursModule.tsx` (étapes 10 / 11, `StageStrip`, sous-page Harmonie `AtelierHarmonyPage.tsx` et
  `DesignReview.tsx` conservées), `modules/documents` (catalogue), `module-registry.ts` (statut du module).

### 5.9 Documents dérivés (lot 5)

Vues générées depuis le modèle typé à une révision : plans par niveau (hauteur de coupe réglable, 1,00 m par
défaut à confirmer dans la fiche), coupes (plan vertical quelconque), façades (projection avec visibilité par tri
de faces ; équivalent borné de DA-01-12 / DA-14-19), plan de masse avec parcelle (conversion de repères
explicite), détails et fenêtres à l'échelle. Chaque vue : objets référencés, révision, empreinte, fraîcheur
visible. Annotations attachées par références ; cadres et cartouches ; feuilles et jeux ; tableaux (pièces,
portes, fenêtres, murs), quantités et rapports reproductibles depuis une révision ; exports SVG, DXF, PDF, CSV
enregistrés au catalogue (`drawing_exports` / `produced_documents`, mécanisme existant) avec révision et
empreinte.

### 5.10 Échanges (lot 6)

IFC 4.3 (ISO 16739-1:2024) export et import du sous-ensemble (annexe C) ; `IfcMapConversion` depuis le CRS de
la parcelle ; rapport par échange (conservé / transformé / omis / à réparer) ; validation en CI avec IfcOpenShell
sur un corpus fixé (`apps/api/test-corpus/ifc/`) ; bibliothèque : web-ifc (MPL-2.0) si le lot 0 confirme la
prise en charge du schéma 4.3 en écriture, sinon écriture directe du fichier depuis `atelier-model`. DXF :
export des vues (existant à reprendre), import 2D de base en `reference-plan`. PDF : feuilles (pdf-lib ou jsPDF,
MIT). Paquet natif : archive JSON existante + manifeste versionné (schémas, unités, repères, identités, versions
de catalogues). Matrice d'échanges `docs/atelier/matrice-echanges.md`.

### 5.11 Automatisation et assistant (lot 8)

API de script = `POST /commands` et `POST /commands/essai` avec les droits de l'utilisateur ; bibliothèque de
scripts versionnée ; boucle contrôlée : séquence inspectable → essai → aperçu (objets affectés, documents à
recalculer) → accord explicite → exécution ; auto-correction bornée à trois itérations ; journal des hypothèses
attaché à la proposition ; cache des séquences validées. Générateur derrière un adaptateur : règles
déterministes de Fadi (Harmonie, contrôles) par défaut ; modèle de langage uniquement si le maître d'ouvrage
fournit un fournisseur et une clé (variable d'environnement, jamais commitée).

---

## 6. Importeur P.118 (lot 1) — règles de transformation

Source : `apps/api/src/data/examples/p118-native-model.json` (`registry`, `domains.nativeParcel`, `levels`,
`buildingFootprint`, `floorDesign.levels[*]`, `floorDesign.meta`, `floorDesign.layers`, `ui`). Fonction pure
`importerP118(dataset) → { modele, rapport }` dans `packages/atelier-model`. Rien n'est omis (R7) ; le rapport
liste chaque famille avec effectif source, effectif cible et transformations.

| Source | Destination | Règle |
| --- | --- | --- |
| `levels[]` (`id`, `name`, `elevation`, `height`) | `niveau` | Altitudes décimales conservées (ex. −3,2) ; ordre = ordre source |
| `walls[]` (`a`, `b`, `thickness`, `height`, `type` ∈ {`cloison`, `mur`, absent}, `layer`, `name`, `lineRef`, `color`) | `mur` + définitions `cloison`, `mur`, `non-type` | `exteriorWallIds` → `exterieur = true` ; `lineRef`, `color` conservés en propriétés de provenance `import` |
| `doors[]`, `windows[]` (`hostWallId`, `t`, `width`, `height`, `sill`, `mark`) | `porte`, `fenetre` + relation `heberge-par` | `t` conservé ; `distance` dérivée ; hôte absent → objet créé **et** problème « hôte introuvable » (jamais supprimé) |
| `stairs[]` (`a`, `b`, `width`, `height`, `baseOffset`, `steps`, `risers`, `waistThickness`, `stairGroup`, `sourceLevel`, `targetLevel`, `planReferenceOnly`, `designRevision`) | `escalier` + relation `relie` | Les 32 occurrences sont des vues par niveau d'escaliers physiques : conserver chaque occurrence avec `referencePlanSeulement` ; regrouper par `stairGroup` en propriété, sans fusion silencieuse |
| `columns[]` (`p`, `shapeId`, `width`, `depth`, `height`, `angle`, `designStatus`) | `poteau` (building.structure) | — |
| `rooms[]` (`polygons`, `code`, `name`, `area`, `category`, `notes`, `label`) | `piece` | `area` → `aireDeclaree` (provenance `prototype`) ; aire calculée dérivée ; écart > tolérance → problème listé |
| `paths[]` `role = floor-slab` | `dalle` | `thickness`, `baseOffset`, `holes` conservés |
| `paths[]` `role = roof-slab` | `toiture` type `plate` | — |
| `paths[]` `role = room` | relation `piece.polygones` si le code correspond, sinon `espace` | Jamais une pièce créée en double |
| `paths[]` `role = core-zone` | `zone` | — |
| `paths[]` `role = plan-reference` | `reference-plan` | — |
| `paths[]` `role ∈ {solid, clearance, ramp-retaining-wall, ramp-guard, basement-ramp, ramp-direction, ramp-drain}` et tout rôle inconnu | `solide` avec `role` conservé | Calques `Mobilier`, `Escaliers`, `Noyaux`, `Réseaux sanitaires`, `Gabarits accès`, `Rampe sous-sol` conservés ; un rôle inconnu est listé dans le rapport |
| `dims[]` (`a`, `b`, `offset`) | `cotation` **sans référence** (état « libre », pas « à réparer ») | Une cote du prototype n'est pas rattachée : la fiche DA-15-02 décrit le rattachement à la demande |
| `texts[]` | `texte` | — |
| `floorDesign.layers` (20 calques : couleur, remplissage, visible, verrouillé) | `calque` | Ordre conservé |
| `nativeParcel` (sommets, `vertexIds`, `crs` EPSG:26191, `sourceCrs`, aires) | `parcelle` | Sommets tagués `cadastral` + `local` ; `officialArea`, `correctedAreaPrinted`, `area` conservés séparément |
| `buildingFootprint` (`vertices`, `architectureRevision`) | `emprise` | — |
| `meta.structure` | `structureDeclaree` + hypothèses | `loadNature: "supposée, à confirmer"` → hypothèse, statut « à confirmer » (R4) |
| `meta.assumptions` (H01…) | `hypothese` | Identifiants conservés |
| `meta.sources` (CAD-S01…) | `source` | Identifiants et champs conservés |
| `meta.*` restants (`architectureRevision`, `rampRevision`, `basementAccess`, `servicesV815`, `sanitaryV817`, `stairAV818`, `layoutV819`, `exampleId`) | propriétés de projet, provenance `import` | Rien n'est jeté |
| `ui` (`activeLevel`, `showLegends`) | état d'affichage local | **Pas** dans le modèle (R10) |

Tests obligatoires : effectifs par famille et par niveau égaux aux chiffres de la section R7 ; coordonnées et
altitudes identiques bit à bit ; relations hôte complètes (84 portes + 126 fenêtres hébergées) ; rapport sans
rôle inconnu non listé ; import idempotent (deux imports → même modèle, même empreinte).

---

## 7. Lots, tâches, critères d'acceptation

Estimations en journées de travail (une journée = session continue livrée verte). La colonne « vérifiable »
dit ce que le maître d'ouvrage peut constater lui-même sur l'instance de démonstration.

### Lot 0 — Cadrage, maquette, faisabilité (2,5 j)

| Tâche | Contenu | Propriétaire |
| --- | --- | --- |
| L0.1 | `CLAUDE.md` à jour (déjà créé), `docs/atelier/README.md`, `decisions.md`, gabarit de fiche ; amendements de `docs/architecture.md` listés dans `docs/atelier-drawall.md` §10 reportés | chef de projet |
| L0.2 | Fiches de capacité des entrées des lots 1 à 3 (DA-01, DA-02, DA-03 retenues, DA-04-01 / 07, DA-05 retenues, DA-06-07 / 08, DA-07 du lot 3, DA-17-16, DA-18-03 / 04, DA-21-01 / 02 / 04 / 05 / 06 / 07) — état « spécifiée » | équipiers « fiches » (par catégorie) |
| L0.3 | Maquette de l'Atelier (cinq repères, ordinateur 1536 px et téléphone 390 px, niveaux Essentiel et Complet, palette, inspecteur, panneau problèmes), en HTML statique sous `docs/atelier/maquette/` avec captures ; **soumise au maître d'ouvrage** | équipier « maquette » |
| L0.4 | Banc de mesures : three.js WebGL2 sur une scène équivalente à P.118 (≈ 220 murs, 210 ouvertures, 120 poteaux, 967 solides, 6 niveaux) — temps d'ouverture, budget de trame p95 en orbite, sélection ; taille et temps d'initialisation des WASM candidats (OCCT, web-ifc) ; booléens de maillage manifold-3d ; Yjs (mémoire, granularité) ; quotas navigateur. Résultats dans `docs/atelier/p0-mesures.md` avec le banc déclaré | équipier « mesures » |
| L0.5 | Préparation du travail en équipe : scénario e2e découpé par module (annexe D), migrations par module dans `init.sql` (sections délimitées), client API par module (`apps/web/src/lib/api/*.ts`), hooks de qualité (`TaskCompleted` → typecheck + tests), bases par équipier | chef de projet + équipier « outillage » |
| L0.6 | Compte rendu `lots/lot-0.md`, décisions à prendre (section 10) | chef de projet |

**Acceptation :** fiches à l'état « spécifiée » pour tout le périmètre du lot 3 ; maquette validée par le maître
d'ouvrage ; mesures publiées avec banc déclaré ; scénario découpé passe à l'identique (même nombre de contrôles,
CI verte) ; `check-module-deps` en place. **Vérifiable :** ouvrir la maquette ; lire les mesures.

### Lot 1 — Modèle typé `packages/atelier-model` (1,5 j)

| Tâche | Contenu | Propriétaire |
| --- | --- | --- |
| L1.1 | Ontologie (5.2) : classes, paramètres, unités, relations, caractéristiques nommées, classes IFC ; définitions et catalogue de types versionné | équipier « modèle » |
| L1.2 | Commandes et réducteurs purs (annexe B, contrat 1), inverses, effets, validation des unités et préconditions ; `CommandHistory` réutilisé ; projection d'un lot de commandes → effets (vues, documents, problèmes) | équipier « commandes » |
| L1.3 | Références topologiques : résolveur, état « à réparer », propositions ; quantités (surfaces par pièce et par niveau, longueurs et aires de murs, effectifs d'ouvertures) reproductibles | équipier « références » |
| L1.4 | Importeur P.118 (section 6) + importeur des exports du prototype (archive) ; projection `modèle typé → entrée d'analyse` (5.6) | équipier « import » |
| L1.5 | Relecture de `core-geometry` fonction par fonction (garder / adapter / typer), tests conservés | équipier « modèle » |
| L1.6 | Manifeste, `check-module-deps`, documentation du paquet (`README.md` : contrats, versions) | chef de projet |

**Acceptation :** tests vitest du paquet (import P.118 : effectifs, coordonnées, altitudes, relations ; réducteurs
idempotents et inversibles ; références réparées ou signalées ; quantités reproductibles) ; aucune dépendance
interdite ; l'application visible n'a pas changé. **Vérifiable :** CI verte, rapport d'import lisible dans
`docs/atelier/lots/lot-1.md`.

### Lot 2 — API transactionnelle et synchronisation (2 j)

| Tâche | Contenu | Propriétaire |
| --- | --- | --- |
| L2.1 | Tables 5.5, `VolumeStore`, migration idempotente, `verify-restore.sh` étendu | équipier « base » |
| L2.2 | Service de commandes (5.4) : droits, verrou, `baseRevision`, idempotence, journal, boîte de sortie, annuler / rétablir, essai à blanc, `GET /model`, `/model/niveaux/:id`, `/journal`, `/problemes` | équipier « API » |
| L2.3 | Traitement des événements : fraîcheur des documents, péremption du bilan Harmonie, aperçu conceptuel, notifications | équipier « API » |
| L2.4 | Client : bus local, file Dexie de commandes, états, périmètre local, résolution de conflits (réutiliser `ConflictPanel`, `SyncIndicator`), joignabilité | équipier « client » |
| L2.5 | Tests API (T03 unité refusée, T06 idempotence, T07 documents périmés, T08 conflit entre deux comptes, T10 droits et réservation) ; scénario hors ligne sur l'API | équipier « API » + chef de projet |

**Acceptation :** tests API verts ; une même enveloppe envoyée deux fois → une seule révision ; conflit détaillé ;
documents marqués périmés après une commande ; file rejouée après coupure ; l'Atelier visible est encore
l'ancien. **Vérifiable :** CI verte ; démonstration en ligne de commande dans le compte rendu.

### Lot 3a — Nouvel Atelier : socle d'interface, dessin 2D, objets d'architecture (3 j)

| Tâche | Contenu | Propriétaire |
| --- | --- | --- |
| L3a.1 | Socle selon la maquette validée : cinq repères, niveaux d'affichage, favoris, palette avec synonymes, inspecteur typé, panneau des problèmes intégrant les réserves Harmonie | équipier « interface » |
| L3a.2 | Éditeur de plan 2D (SVG / Canvas, pointer events) : accrochages, saisie de précision, grille, calques, sélection (clic, lasso, filtre par classe), primitives d'esquisse (DA-01-01…06, 09, 10, 11), transformations (DA-02-01…15, 17) comme commandes avec aperçu | équipier « 2D » |
| L3a.3 | Objets d'architecture : murs (types, jonctions, scission, alignement), portes / fenêtres / ouvertures hébergées (déplacement le long du mur, contrôle d'emprise), dalles, escalier droit paramétrique (fiche DA-07-10), pièces détectées depuis les murs fermés (proposition → commande), espaces, zones, étages, propriétés BIM et classification, catalogue de types | équipier « architecture » |
| L3a.4 | Intégration : route `?module=atelier` à côté de l'ancien (`?module=atelier&version=nouveau` jusqu'à la bascule), P.118 importé dans le nouveau modèle à l'import de l'exemple, mode immersif, puce d'outil actif, clavier, axe-core | chef de projet |
| L3a.5 | Continuité des outils du prototype (décision D-018) : cotation et texte **libres** (`cotation.creer`, `texte.creer`, sans référence persistante), mètre (mesure sans création d'objet), métré du niveau actif (quantités dérivées, marquées de leur révision), export PNG / SVG / DXF du plan et impression de la vue courante côté client (D-019) — fiches DA-15-01 / 02 / 04, DA-16-10, DA-14-01 (part lot 3a) | équipier « documents simples » |

**Acceptation :** sur P.118 importé, dessiner un mur, y poser une porte, obtenir la pièce, modifier le type, annuler
et rétablir avec révisions persistées, relire depuis un second navigateur ; téléphone 390 px et clavier ; aucune
violation axe critique ou sérieuse. **Vérifiable :** faire ces gestes sur l'instance.

### Lot 3b — Nouvel Atelier : 3D WebGL2, pousser / tirer, mobile, accessibilité (2,5 j)

| Tâche | Contenu | Propriétaire |
| --- | --- | --- |
| L3b.1 | Rendu three.js : scène par niveau, instanciation, matériaux simples, modes volume / éclaté / coupe (plan de coupe réglable), orbite / pan / zoom, sélection, manipulateur (DA-02-17), WebGPU en option avec repli | équipier « 3D » |
| L3b.2 | Pousser / tirer sur hauteurs et épaisseurs (DA-04-07), extrusion d'esquisse en solide (DA-04-01), aperçu avant validation | équipier « 3D » |
| L3b.3 | Toucher (pincer, deux doigts), tailles de cibles, mode immersif ; mesures `⏱` (ouverture, sélection, déplacement, orbite p95, enregistrement) imprimées par le scénario | équipier « interface » |
| L3b.4 | Vues techniques de travail (plan, coupe N–S / E–O et plan quelconque, façades) en 2D depuis `core-geometry`, sans export (les documents viennent au lot 5) | équipier « 2D » |

**Acceptation :** chaque niveau × chaque mode rendu sans vue vide ni erreur JavaScript (contrôle existant repris) ;
hauteur d'un mur modifiée par pousser / tirer et persistée ; budget de trame mesuré et publié ; 3D utilisable au
toucher. **Vérifiable :** naviguer en 3D sur téléphone et ordinateur.

### Lot 4 — Bascule (1,5 j)

| Tâche | Contenu | Propriétaire |
| --- | --- | --- |
| L4.1 | Rebranchement des consommateurs (5.6) sur la projection du modèle typé ; transmission de la parcelle en commandes ; archive en version typée + import des anciennes archives ; import de l'exemple directement dans le nouveau modèle | équipier « API » |
| L4.2 | Le nouvel Atelier devient le module `atelier` et l'Atelier des étapes 10 / 11 ; suppression de tout ce qui est listé en 5.5 ; `module-registry.ts`, README du module, `docs/migration/matrix.md` §3 réécrits | chef de projet |
| L4.3 | Scénario d'acceptation réécrit pour le nouvel Atelier (annexe D) : parcours complet P.118, dessin / annuler / rétablir persistés (révisions), second navigateur à la même révision, plan de lecture et surfaces à la révision courante, niveaux × modes, pousser / tirer, exports au catalogue ; captures `docs/migration/captures/webapp/` | équipier « e2e » |
| L4.4 | Restauration vérifiée sur la nouvelle base, image Docker sondée, `docs/architecture.md` « Where this repository stands » mis à jour | équipier « base » |

**Acceptation :** un seul Atelier dans le produit ; `git grep` ne trouve plus `V14Bridge`, `design.v13`,
`atelier_store`, `atelier-native` ; CI verte (validate, e2e, image) ; P.118 importé et exercé de bout en bout ;
tous les contrôles existants hors Atelier passent à l'identique. **Vérifiable :** ouvrir P.118, étapes 10 et 11,
le bilan Harmonie, l'accueil (aperçu conceptuel), les documents.

### Lot 5 — Documents dérivés, quantités, objets reportés (3,5 j)

Tâches (en complément de la version simple livrée en L3a.5, D-018) : vues (plans, coupes, façades, plan de masse, détails) avec fraîcheur ; annotations attachées par
références (cotations, textes, étiquettes), cadres, feuilles et jeux ; tableaux, quantités, rapports ; exports
SVG / DXF / PDF / CSV au catalogue ; esquisse contrainte bornée (DA-01-07 / 08, DA-06-01 / 02), blocs et composants
(DA-05-06 / 07 / 09), toitures simples, garde-corps simple, phases. Propriétaires : « vues », « annotations »,
« feuilles et quantités », « objets reportés ». **Acceptation :** plan et tableau des surfaces reproduits à la
révision courante et périmés après une commande ; cotation « à réparer » après scission d'un mur ; PDF d'une
feuille au catalogue ; quantités identiques entre deux générations à la même révision.

### Lot 6 — Échanges (2,5 j)

Tâches : export IFC 4.3 (annexe C) avec `IfcMapConversion` ; import du même sous-ensemble en objets
« représentation importée » ; rapport de fidélité ; corpus et validation IfcOpenShell en CI ; DXF import 2D ;
manifeste du paquet natif ; `docs/atelier/matrice-echanges.md`. Propriétaires : « IFC export », « IFC import »,
« DXF / paquet ». **Acceptation :** P.118 exporté, validé en CI, réimporté avec rapport ; fichier ouvert dans un
visualiseur IFC tiers choisi par le maître d'ouvrage (constat de sa part).

### Lot 7 — Versions, variantes, publication, collaboration (2 j)

Tâches : versions nommées immuables ; variantes (fork du journal) et fusion par rejeu validé avec liste des
objets affectés et mise en évidence 3D ; publication figée (révision, versions de catalogues, documents) ;
verrous logiques fins ; comparaison de vues entre révisions ; collisions d'architecture (ouverture hors mur,
escalier contre dalle) ; Yjs pour le texte d'annotation **si** retenu au lot 0. **Acceptation :** variante créée,
modifiée, fusionnée ; conflit explicite entre deux comptes ; publication restaurable avec ses dépendances (T11,
T12).

### Lot 8 — Automatisation et assistant à boucle contrôlée (1,5 j)

Tâches : bibliothèque de scripts versionnée sur `POST /commands` et `/commands/essai` ; boucle contrôlée ;
journal des hypothèses ; cache ; adaptateur de modèle de langage (sans fournisseur : règles déterministes).
**Acceptation :** un script qui pose une trame de poteaux passe par les mêmes commandes et les mêmes refus
qu'un utilisateur ; une proposition de l'assistant n'écrit rien sans accord ; trois itérations maximum.

### Lot 9 — Recette finale (1 j)

Scénario complet (tous les contrôles, tous les essais de l'Architecture V4 §12 — tableau en
`docs/atelier-drawall.md` §5.3), captures, matrice, protocole de mesures T17 / T18 à l'usage du maître d'ouvrage,
aide située relue, `docs/architecture.md` et `README.md` à jour, dossier de recette `docs/atelier/recette.md`.

### Lot optionnel — Noyau exact OCCT (2 à 3 j, après arbitrage de licence)

Interface de moteur, OCCT WASM en Web Worker, représentation `brep`, DA-04 restantes, DA-03-01 / 12 ; fiches
avant code ; aucune dépendance OCCT ajoutée au dépôt avant la décision écrite du maître d'ouvrage.

---

## 8. Exigences non fonctionnelles

- **Performance (T18) :** mesurée, jamais annoncée. Lignes `⏱` du scénario sur le banc déclaré ; objectifs de
  travail (non contractuels) : retour simple p95 < 100 ms, trame p95 ≤ 16,7 ms sur le banc, ouverture de
  l'Atelier P.118 comparable à l'existant (≈ 3,2 s dans le bac à sable actuel). Chargement par niveau,
  instanciation, niveaux de détail.
- **Accessibilité (T16) :** WCAG 2.2 AA ; clavier pour les tâches définies ; focus visible ; contraste 4,5:1 ;
  `prefers-reduced-motion` respecté ; axe-core en CI sur chaque écran à 1536 px et 390 px.
- **Sécurité (T10) :** validation par schéma (zod) de toute enveloppe, autorisation par ressource côté serveur,
  limites de taille (enveloppe ≤ 1 Mo, volumes ≤ 25 Mo), journaux structurés sans données de projet, aucune
  trace de pile renvoyée au client.
- **Hors ligne (T09) :** états visibles, reprise contrôlée, quotas surveillés, aucune perte silencieuse.
- **Mobile :** 390 px et 980 px (mode « site ordinateur » d'un téléphone) sans défilement horizontal ; cibles
  tactiles ≥ 44 px.
- **Observabilité :** `/health` conservé ; compteurs de commandes, conflits, événements en attente exposés dans
  les journaux serveur.
- **Compatibilité :** Chromium, Firefox, Safari (dernières versions) ; WebGL2 obligatoire pour la 3D, message
  explicite sinon ; le 2D fonctionne sans WebGL.

---

## 9. Organisation du travail en équipe

- **Chef de projet (lead)** : crée les tâches, fige les interfaces avant distribution (types, contrats de
  commandes, routes), relit, intègre, fait passer la CI, rédige comptes rendus et décisions. Il n'implémente
  pas en parallèle des équipiers sur les mêmes fichiers.
- **Équipiers** : 3 à 5 par lot, chacun propriétaire d'un ensemble de fichiers, dans son worktree Git et sa base.
  Un équipier ne modifie pas un fichier qu'il ne possède pas : il demande au chef de projet ou au propriétaire.
- **Matrice de propriété (à instancier à chaque lot dans le compte rendu) :**

| Zone | Propriétaire type |
| --- | --- |
| `packages/atelier-model/src/ontologie/**`, `importeur/**` | modèle / import |
| `packages/atelier-model/src/commandes/**`, `references/**`, `quantites/**` | commandes / références |
| `apps/api/src/db/init.sql` (section `atelier`), `schema.ts` (bloc `atelier`), `lib/volume-store.ts` | base |
| `apps/api/src/routes/atelier-commands.ts`, `lib/atelier-commands.ts`, `lib/atelier-events.ts` | API |
| `apps/web/src/modules/atelier/ui/**` | interface |
| `apps/web/src/modules/atelier/plan2d/**` | 2D |
| `apps/web/src/modules/atelier/objets/**` | architecture |
| `apps/web/src/modules/atelier/rendu3d/**` | 3D |
| `apps/web/src/modules/atelier/bus/**`, `lib/api/atelier.ts` | client |
| `apps/web/e2e/scenarios/*.mjs` (un fichier par propriétaire) | chacun, le sien |
| `docs/atelier/fiches/**` | fiches (par catégorie) |

- **Branches :** `main` toujours verte ; une branche par lot (`lot/N-…`), une branche par équipier par tâche,
  intégrées par le chef de projet (rebase ou merge sans fast-forward, CI obligatoire). Pas de force-push sur
  `main`.
- **Commits :** en français, un commit par tâche, préfixe `[Lx.y]`, référence aux fiches touchées.
- **Hooks de qualité :** `TaskCompleted` refuse la clôture si `npm run typecheck` ou `npm test` échouent dans le
  worktree ; `TeammateIdle` renvoie l'équipier au compte rendu de sa tâche s'il manque.
- **Taille des tâches :** 2 à 6 heures ; une tâche = un livrable vérifiable (un réducteur et ses tests, une
  route et ses tests, un panneau et son contrôle e2e).
- **Communication :** chaque équipier termine sa tâche par un message au chef de projet : fait, non fait, tests,
  fichiers, questions. Les questions au maître d'ouvrage passent par le chef de projet et sont regroupées dans
  le compte rendu du lot (sauf blocage immédiat).
- **Activation d'une équipe** : `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` dans `~/.claude/settings.json` (fonction
  expérimentale de Claude Code, session interactive requise ; les équipiers chargent `CLAUDE.md` mais pas la
  conversation du chef de projet — d'où les prompts complets de l'annexe E). Sans équipe, Claude Code utilise des
  sous-agents ou travaille seul selon la même matrice.
- **Sans équipe (session unique)** : les mêmes tâches, dans l'ordre des dépendances ; la matrice sert de plan.

---

## 10. Décisions

### 10.1 Réservées au maître d'ouvrage (s'arrêter et demander)

1. Validation de la maquette (fin du lot 0) et de chaque lot.
2. Licence OCCT et ouverture du lot optionnel.
3. Fournisseur de modèle de langage et clé (lot 8).
4. Stockage objet et hébergement (hors dépôt).
5. Compte au service de validation IFC de buildingSMART (lot 6, optionnel).
6. Toute suppression de fonction visible qui n'est pas listée en 5.5.
7. Toute règle réglementaire ou valeur structurelle à introduire (R3 : jamais inventée — fournie avec sa source).
8. Tout écart au périmètre (ajout ou retrait d'une entrée DA).

### 10.2 Déléguées au chef de projet (décider, consigner dans `decisions.md`)

Bibliothèques (dans la liste des licences admises : MIT, Apache-2.0, BSD, MPL-2.0 ; LGPL seulement pour un outil
de test non lié au produit), structure interne des paquets, nommage, ordre des tâches à l'intérieur d'un lot,
tolérances par défaut des opérations (documentées dans les fiches), choix web-ifc ou écriture directe (sur la
base des mesures du lot 0), Yjs retenu ou non pour les annotations (lot 0).

---

## 11. Definition of Done

**Une tâche est finie quand :** le code est typé `strict`, testé (unité ou API, et e2e si une interface est
touchée), documenté là où il faut (fiche à jour, README du paquet), relu par le chef de projet, intégré, CI verte ;
le compte rendu de tâche est envoyé.

**Un lot est fini quand :** toutes ses tâches le sont ; les fiches de son périmètre sont à l'état « prototype »
(code présent) ou « vérifiée » (preuve liée) ; `npm run typecheck`, `npm test`, `npm run build`, scénario
complet et CI sont verts ; `docs/migration/matrix.md`, `docs/atelier/decisions.md`, les mesures et les captures
sont à jour ; le compte rendu `docs/atelier/lots/lot-N.md` dit ce qui est fait, ce qui ne l'est pas, ce que le
maître d'ouvrage peut vérifier, et ce qu'il doit décider.

**La bascule (lot 4) est finie quand**, en plus : un seul Atelier existe dans le produit, les suppressions de 5.5
sont effectives, la restauration vérifiée passe sur la nouvelle base, l'image Docker est sondée, et le maître
d'ouvrage a constaté lui-même les points « vérifiables » du lot.

---

## 12. Livrables documentaires

`docs/atelier/README.md` (plan du dossier), `fiches/DA-XX-YY.md`, `decisions.md`, `p0-mesures.md` (puis
sections par lot), `maquette/`, `lots/lot-N.md`, `matrice-echanges.md` (lot 6), `recette.md` (lot 9) ;
`docs/migration/matrix.md` §3 réécrit à la bascule ; `docs/architecture.md`, `README.md`,
`apps/web/src/modules/atelier/README.md` tenus à jour ; captures `docs/migration/captures/webapp/`.

---

## Annexe A — Fiche de capacité

Gabarit : `docs/atelier/fiches/_gabarit.md` (champs de la méthode de l'Exigences V4 : identité, situation,
entrées et unités, comportement, données et dépendances, résultats, cas limites, compatibilité, validation,
état). Exemple rédigé : `docs/atelier-drawall.md`, annexe A (DA-07-01 Murs). États : à spécifier → spécifiée →
prototype → vérifiée → disponible (ce dernier par le maître d'ouvrage).

## Annexe B — Catalogue initial des commandes (contrat `atelier-commands/1`)

| Famille | Commandes | Notes |
| --- | --- | --- |
| Niveaux | `niveau.creer`, `niveau.modifier`, `niveau.supprimer` | supprimer = verrou logique (lot 7) ; refus si des objets existent sans destination |
| Murs | `mur.tracer`, `mur.modifier`, `mur.scinder`, `mur.joindre`, `mur.supprimer` | scinder réaffecte les ouvertures et met les cotations « à réparer » |
| Ouvertures | `ouverture.poser` (porte / fenêtre / ouverture), `ouverture.modifier`, `ouverture.deplacer`, `ouverture.supprimer` | contrôle d'emprise dans le mur hôte |
| Dalles, toitures | `dalle.creer`, `dalle.modifier`, `dalle.supprimer`, `toiture.creer`, `toiture.modifier`, `toiture.supprimer` | toitures : lot 5 |
| Escaliers | `escalier.creer`, `escalier.modifier`, `escalier.supprimer` | fiche DA-07-10 : valeurs retenues et contradictions affichées |
| Pièces, espaces, zones | `piece.detecter` (proposition), `piece.creer`, `piece.modifier`, `piece.supprimer`, `espace.*`, `zone.*` | détection jamais imposée |
| Poteaux, solides | `poteau.*`, `solide.extruder`, `solide.modifier`, `solide.supprimer` | — |
| Esquisse | `esquisse.ligne`, `.polyligne`, `.arc`, `.cercle`, `.rectangle`, `.polygone`, `.spline`, `.construction`, `.hachure`, `esquisse.modifier`, `esquisse.supprimer` | contraintes : lot 5 (`contrainte.*`) |
| Transformations | `transformer.deplacer`, `.copier`, `.tourner`, `.miroir`, `.echelle`, `.etirer`, `.ajuster`, `.prolonger`, `.decaler`, `.repeter`, `.decomposer`, `.pointsDeControle` | sur une sélection typée ; chaque commande déclare les classes admises |
| Annotations | `cotation.creer`, `.modifier`, `.rattacher`, `.supprimer`, `texte.*`, `etiquette.*` | rattacher = références à des caractéristiques |
| Organisation | `calque.*`, `groupe.creer`, `groupe.dissoudre`, `bloc.definir`, `bloc.placer` (lot 5), `type.definir`, `type.modifier`, `propriete.definir`, `classification.affecter` | — |
| Références | `reference.reparer` | choisit une proposition ou détache |
| Site | `site.parcelle.definir`, `site.emprise.definir` | émises par la transmission de l'outil Parcelle |

## Annexe C — Correspondance IFC 4.3 (lot 6)

| Fadi | IFC 4.3 | Remarques |
| --- | --- | --- |
| projet, site, bâtiment | `IfcProject`, `IfcSite`, `IfcBuilding`, `IfcMapConversion` + `IfcProjectedCRS` | CRS de la parcelle (EPSG) ; unités SI |
| niveau | `IfcBuildingStorey` (`Elevation`) | — |
| mur | `IfcWall` (+ `IfcWallType`), `IfcExtrudedAreaSolid`, `IfcMaterialLayerSet` si connu | — |
| porte, fenêtre, ouverture | `IfcDoor`, `IfcWindow`, `IfcOpeningElement`, `IfcRelVoidsElement`, `IfcRelFillsElement` | — |
| dalle, toiture | `IfcSlab` (`FLOOR` / `ROOF`), `IfcRoof` | — |
| escalier | `IfcStair` (+ `IfcStairFlight` si décomposé) | paramètres en `Pset_StairCommon` |
| pièce, espace, zone | `IfcSpace`, `IfcZone`, `IfcRelAggregates` | aires en `Qto_SpaceBaseQuantities` |
| poteau | `IfcColumn` | — |
| solide générique | `IfcBuildingElementProxy` avec `role` en propriété | jamais reclassé silencieusement |
| cotation, texte | `IfcAnnotation` | export seulement |
| hypothèses, sources | `IfcPropertySet` dédiés (`Fadi_Hypotheses`, `Fadi_Sources`) | statut explicite |

Rapport d'échange : par classe, effectifs source / cible, propriétés transformées, pertes, références à réparer.

## Annexe D — Découpage du scénario de bout en bout (lot 0, puis lot 4)

`apps/web/e2e/run.mjs` enchaîne, dans l'ordre et avec la même base : `scenarios/00-compte.mjs`,
`01-import-exemple.mjs`, `02-parcours-etapes.mjs`, `03-parcelle.mjs`, `04-programmation.mjs`,
`05-atelier.mjs` (lot 4 : réécrit pour le nouvel Atelier — dessin, annuler / rétablir, second navigateur,
niveaux × modes, pousser / tirer, exports), `06-harmonie.mjs`, `07-documents.mjs`, `08-collaboration.mjs`,
`09-hors-ligne.mjs`, `10-accueil-parametres.mjs`, `11-accessibilite.mjs`, `12-mesures.mjs`. Chaque fichier a un
propriétaire ; le total des contrôles est imprimé et comparé à la référence (`e2e/attendu.json`) : une baisse
non justifiée échoue. La CI appelle `run.mjs`.

## Annexe E — Prompts prêts à coller

**Lancement du lot N (chef de projet) :**

> Lis `docs/atelier-cahier-des-charges.md`, `docs/atelier/lots/lot-(N−1).md` et `docs/atelier/decisions.md`.
> Exécute le lot N (section 7) : crée les tâches avec leurs dépendances, instancie la matrice de propriété
> (section 9) dans `docs/atelier/lots/lot-N.md`, lance les équipiers avec les prompts de l'annexe E, relis et
> intègre, et arrête-toi avec le compte rendu, la Definition of Done cochée et mes décisions à prendre.

**Équipier (modèle de prompt) :**

> Tu es l'équipier « {rôle} » du lot {N} de Fadi. Lis `CLAUDE.md`, `AGENTS.md` et les sections 3, 5 et 7 (lot
> {N}) de `docs/atelier-cahier-des-charges.md`, puis les fiches `docs/atelier/fiches/{DA-…}`. Tu possèdes
> uniquement les fichiers : {liste}. Réalise la tâche {Lx.y} : {contenu}. Travaille dans ton worktree avec la
> base `fadi_{rôle}` (`DATABASE_URL`) et le port {port}. Avant de rendre : `npm run typecheck`, `npm test`,
> et le scénario de ta zone (`node apps/web/e2e/run.mjs --only {fichier}`). Termine par un message au chef de
> projet : fait, non fait, tests, fichiers touchés, questions. Ne modifie aucun fichier hors de ta liste ; si
> tu en as besoin, demande.

**Relecture croisée (fin de lot) :**

> Lance trois équipiers relecteurs sur la branche `lot/{N}` : « conformité DrawAll » (règles R1–R20, fiches,
> décisions D1–D6), « sécurité et droits » (validation des entrées, autorisation par ressource, secrets, limites),
> « accessibilité et mobile » (clavier, axe-core, 390 px et 980 px). Chacun livre ses constats classés 🔴 / 🟠 / 🟡
> avec fichier, ligne, motif et correctif. Corrige les 🔴 et 🟠 avant de demander l'acceptation.
