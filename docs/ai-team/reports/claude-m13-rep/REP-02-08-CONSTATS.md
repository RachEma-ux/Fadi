# REP-02 à REP-08 — requalification ciblée des points d'intégration Studio

**Tâches :** REP-02 à REP-08 (checklist `Studio/Fadi_Studio_Checklist_Execution_V1_0.md`, lignes 98–104 ; Plan §2.1 et annexe D).
**Mission / propriétaire registre :** M13 / A2. **Exécutant :** Claude Code, session distincte de l'équipe Codex, annoncée dans [#166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250697907).
**Date :** 18 octobre 2026 (UTC). **Commit lu :** `main` = `817bd36e7d4b1ab60ab9c00309509c7cdfed0798`.
**Nature :** lecture statique du code, plus deux contrôles exécutés et non destructifs (REP-07, REP-08). Aucun code applicatif modifié, aucune base, API, service ou E2E lancé.

## 0. Le constat de REP-01 est-il encore valable ?

Les sept fichiers examinés ont **le même blob Git** au commit REP-01 `5cf61d1…` et au `main` actuel `817bd36…` (34 commits plus tard) :

| Fichier | Blob (identique aux deux commits) |
|---|---|
| `apps/web/src/App.tsx` | `1098848dbf84d54189307e0ba0afad9d0f2b82f5` |
| `apps/web/src/routes/AppShell.tsx` | `1e784b7686ed10f60ab944cde660354a2bbac7c9` |
| `apps/web/src/routes/ProjectShell.tsx` | `a1d0584ace1b7c7b62c0c56ac77c0075b46c5844` |
| `apps/web/src/lib/use-immersive.ts` | `ab382d7456d15a7fe32009818cd9d27c6ff19ba3` |
| `apps/web/src/modules/module-registry.ts` | `ddd5fd90086076095e0b2eb552fcc0b46559ba01` |
| `scripts/check-module-deps.mjs` | `f3207476e238adb8e0c472c9561c3969a6879da1` |
| `docs/continuity/README.md` | `dae46c4fd63a675da18e3573aadfc9f39ca24c5a` |

Commande : `git rev-parse <commit>:<chemin>` pour chaque fichier aux deux commits. Entre ces commits, le seul fichier modifié sous `apps/`, `packages/` et `scripts/` est `apps/web/src/modules/README.md`, un texte (`git diff --stat 5cf61d1 817bd36 -- apps/ packages/ scripts/`). Les constats du Plan §2.1 portent donc **sur le même code** qu'aujourd'hui. Ils restent à relire sur le futur commit de réalisation du lot I.

Liens : `P` = `https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798`.

## REP-02 — `apps/web/src/App.tsx` : routes, authentification, chargement différé

Constats :

1. **Authentification.** Seules `/connexion` et `/inscription` sont publiques ([P/apps/web/src/App.tsx#L44-L45](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L44-L45)). Toutes les autres routes sont des enfants d'une route sans chemin qui enveloppe `AppShell` dans `RequireAuth` ([#L47-L53](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L47-L53)). `RequireAuth` est **un garde côté client seulement** : il redirige vers `/connexion` sans utilisateur ([P/apps/web/src/routes/RequireAuth.tsx#L14-L16](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/RequireAuth.tsx#L14-L16)). Il ne contrôle aucun droit sur un projet. Pour Studio, les relations projet / étude / variante / révision devront être contrôlées par le serveur (Plan §2.3), pas par ce garde.
2. **Routes déclarées.** `/accueil`, `/projets`, `/collaboration`, `/projets/:projectId`, `/projets/:projectId/pilotage`, `/harmonie`, `/bibliotheque/batiments`, `/bibliotheque/batiments/:id` et `/parametres` ([#L54-L83](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L54-L83)). **Il n'y a aucune route `/studio`.**
3. **Chemins inconnus.** `/` et `*` redirigent vers `/accueil` avec `replace` ([#L86-L87](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L86-L87)). Conséquence pour NAV-004 : avant le lot I, un lien `/studio/...` partagé arrive **sans message** sur l'Accueil. Après le lot I, un lien Studio refusé ou invalide ne devra pas retomber silencieusement dans ce `*`.
4. **Chargement différé.** Quatre écrans sont chargés à la demande avec `lazy` : `ProjectShell`, `ProjectCockpitPage`, `BuildingLibraryPage` et `BuildingCasePage` ([#L17-L20](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L17-L20)). Chacun a son `Suspense` avec le même repli `Loading`. L'Atelier est un second niveau de découpage, à l'intérieur de `ProjectShell` ([P/apps/web/src/routes/ProjectShell.tsx#L30](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L30)). Une entrée Studio peut suivre exactement ce motif. Aucune limite d'erreur (`ErrorBoundary`) n'apparaît dans ce fichier : un échec de chargement d'un morceau n'y est pas rattrapé. C'est à couvrir pour NAV-008.
5. **Attente de session.** Tant que `useAuth().loading` est vrai, l'application entière affiche « Chargement… » ([#L29-L37](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L29-L37)).

Ce qui est établi : le constat du Plan §2.1 est confirmé, avec les points 3 et 4 en plus. Ce qui reste ouvert : le contrat final des routes (ROUTE-09, ADR-01).

## REP-03 — `apps/web/src/routes/AppShell.tsx` : entrée verticale et contexte projet

1. **Navigation principale.** `<nav aria-label="Navigation principale">` ([P/apps/web/src/routes/AppShell.tsx#L88](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L88)) contient trois entrées : Accueil (`NavLink`), Projets (un bouton qui ouvre un menu `role="menu"`) et Collaboration (`Link`), aux [#L89-L94](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L89-L94). Bibliothèque et Paramètres sont dans un bloc secondaire. Chaque entrée porte `title` et `aria-label` ; le libellé visible `sidebar-label` dépend de l'état replié ou déplié. C'est le modèle à reprendre pour NAV-001 (nom accessible, infobulle, texte déplié).
2. **Contexte projet.** Il n'est déduit que de deux motifs, `useMatch("/projets/:projectId")` et `useMatch("/projets/:projectId/pilotage")` ([#L19-L21](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L19-L21)), puis il est transmis au bandeau `HomeTopbar` ([#L112](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L112)). Sur une route candidate `/studio/projets/:projectId/...`, `projectId` serait donc `undefined` et le bandeau afficherait l'état « plateforme ». La résolution du contexte devra être étendue (NAV-006). Le Plan §2.1 le prévoit.
3. **État actif de Projets.** Il est calculé par `location.pathname.startsWith("/projets")` ([#L90](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L90)). Une route sous `/studio/...` n'allumerait donc pas Projets, ce qui va dans le sens de NAV-006 (« Projets pas faussement actif »). En revanche, une route Studio placée sous `/projets/...` l'allumerait à tort.
4. **Collaboration.** Le lien utilise le dernier dossier personnel (`useLastDossier`) quand aucun projet n'est ouvert ([#L22](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L22), [#L79](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L79)). C'est un précédent de « dernier contexte comme suggestion ». Le Plan §2.2 exige que ce contexte ne vaille jamais permission : ce lien n'en accorde pas, puisque le serveur reste juge.
5. **Mobile.** Sous 700 px, ouvrir Projets ou le compte replie la barre (`matchMedia("(max-width: 700px)")`, [#L35](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L35)). Il n'y a pas de menu mobile séparé : une entrée Studio ajoutée dans ce `<nav>` y serait automatiquement accessible.

Établi : constat confirmé, avec les points 2 à 5 en précision. Ouvert : la place de l'entrée (CAD-DEC-04, « après Projets » reste une proposition) et la forme du contexte (ROUTE-09).

## REP-04 — `apps/web/src/routes/ProjectShell.tsx` : services utiles, sans faire de cette enveloppe un prérequis

1. **Requêtes lancées par l'enveloppe.** À chaque ouverture, quel que soit le module, l'enveloppe interroge le projet (relu toutes les 60 s pour les réservations d'édition, [#L37](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L37)), **la liste des étapes du Parcours** ([#L39](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L39)) et l'aperçu conceptuel ([#L41](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L41)). Les étapes ne servent qu'aux titres de « Sources des étapes » ([#L165](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L165)). Faire passer Studio par `ProjectShell` le rendrait donc dépendant d'une lecture du Parcours, ce que NAV-002 interdit.
2. **Sélection du module.** Le module vient de `?module=`, validé contre `MODULES` ; sinon `?etape=` donne `parcours`, sinon `accueil` ([#L52-L54](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L52-L54)). Le module `accueil` court-circuite le contrôle d'accès de l'enveloppe et rend `DossierDashboard` ([#L74-L76](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L74-L76)).
3. **Services réutilisables sans l'enveloppe.** Ils sont déjà hors de `ProjectShell`, dans `lib/` ou `components/` :
   - `useProjectAccess`, `lockedHint` et `READ_ONLY_HINT` (`lib/access`, [#L5](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L5), [#L43](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L43)) ;
   - `SyncIndicator` et `useOnline`, `EditingLockControl` et `ConflictPanel` (`components/`, [#L6-L8](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L6-L8)) ;
   - `rememberDossier` (`lib/last-dossier`, [#L62](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L62)) et `denied` (`modules/accueil/dossier-data`).

   Le seul « service » propre à l'enveloppe est **l'assemblage** : bandeau de révision, rôle, synchronisation et réservation ([#L95-L111](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L95-L111)), bannières lecture seule et hors-ligne, `ConflictPanel`. Une enveloppe Studio peut composer les mêmes éléments, sans importer `ProjectShell`.
4. **Atelier actuel.** Il est placé dans cette enveloppe, chargé à la demande ([#L30](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L30), [#L150-L158](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L150-L158)), et l'ouvrir active le mode immersif ([#L66](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L66)) (voir REP-05).
5. **Repli générique.** Tout identifiant de `MODULES` qui n'a pas d'écran dédié affiche son libellé et son texte de statut ([#L206-L211](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L206-L211)). Voir la conséquence pour REP-06.

Établi : constat confirmé ; la liste des services utilisables directement est dressée. Ouvert : le découpage d'un éventuel contexte projet commun (contrat du lot I).

## REP-05 — `apps/web/src/lib/use-immersive.ts` : masquage de l'enveloppe à ne pas activer dans Studio

1. **Mécanisme.** `useImmersive(active)` ajoute la classe `atelier-immersive` sur `document.body` et la retire au démontage ([P/apps/web/src/lib/use-immersive.ts#L10-L18](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/lib/use-immersive.ts#L10-L17)). Il y a **deux appelants** : `ProjectShell` pour le module Atelier ([#L66](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L66)) et `ParcoursModule` aux étapes 10 et 11 ([P/apps/web/src/modules/parcours/ParcoursModule.tsx#L234](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/parcours/ParcoursModule.tsx#L234)).
2. **Effet visuel.** La classe masque `.app-sidebar`, `.app-topbar`, `.project-header` et `.module-nav` (`display: none`, [P/apps/web/src/style.css#L1716-L1725](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/style.css#L1716-L1725)) et réduit la grille de l'enveloppe à une colonne ([P/apps/web/src/modules/accueil/accueil.css#L224-L225](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/accueil/accueil.css#L224-L225)). C'est l'inverse exact de NAV-008 (« la barre n'est pas masquée par le mode Atelier ») et du Plan §2.2 (plein écran seulement sur action explicite, avec sortie visible).
3. **Le drapeau est global et sans compteur.** Le premier appelant qui se démonte retire la classe, même si un autre la demande encore. Aujourd'hui, les deux appelants ne sont pas montés en même temps (le module Atelier et le module Parcours s'excluent dans `ProjectShell`), donc le défaut ne se manifeste pas. Une future vue Studio ne doit **ni réutiliser `atelier-immersive`** pour son plein écran, ni dépendre d'un nettoyage par démontage d'un autre écran.
4. **Couverture par les tests.** Il n'y a aucun test unitaire de ce hook. Le comportement est vérifié par la recette E2E `apps/web/e2e/parcours-scenario.mjs` ([#L699](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/e2e/parcours-scenario.mjs#L699), [#L714](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/e2e/parcours-scenario.mjs#L714), [#L1749](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/e2e/parcours-scenario.mjs#L1749)). Cette recette demande API et base : **elle n'a pas été exécutée ici.**

Établi : constat confirmé ; le défaut du point 3 est relevé statiquement, sans effet observé. Ouvert : la forme d'un plein écran Studio explicite (recette UX).

## REP-06 — `apps/web/src/modules/module-registry.ts` : descripteurs globaux et raccourcis projet

1. **Contenu.** `MODULES` contient 7 descripteurs `{ id, label, implemented, status }` ([P/apps/web/src/modules/module-registry.ts#L15-L58](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/module-registry.ts#L8-L58)). Aucun n'est `studio`.
2. **Trois consommateurs.**
   - `ProjectShell` valide `?module=` contre `MODULES` ([#L54](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L54)).
   - `ProjectModuleNav` crée un bouton par descripteur ([P/apps/web/src/routes/ProjectModuleNav.tsx#L25](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectModuleNav.tsx#L25)).
   - `SearchDialog` crée une entrée de recherche `/projets/:id?module=<id>` par descripteur ([P/apps/web/src/modules/accueil/SearchDialog.tsx#L21](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/accueil/SearchDialog.tsx#L21)).
3. **Conséquence.** Ajouter `{ id: "studio" }` à `MODULES` rendrait automatiquement `?module=studio` valide **dans `ProjectShell`**. Cette page tomberait dans le repli générique de REP-04, point 5. Le descripteur ajouterait aussi un bouton dans la barre des modules du projet et une entrée de recherche vers `ProjectShell`. Studio passerait alors par l'enveloppe projet, ce qui contredit le Plan §2.1 et NAV-002. Le registre actuel sert donc aux **modules projet**. Une entrée globale de la barre verticale relève d'un autre mécanisme.
4. **Options pour la décision ROUTE-09 / ADR-01** (non tranchées ici) :
   - (a) un descripteur d'entrée globale distinct de `MODULES`, consommé par `AppShell` ;
   - (b) un champ discriminant (`portee: "projet" | "global"`), filtré par chacun des trois consommateurs ;
   - (c) un raccourci projet sous forme de lien vers `/studio/projets/:projectId`, sans nouvel identifiant de module.

   Chaque option doit garder « un seul endroit » pour le statut réel, comme le prévoit l'en-tête du fichier ([#L1-L6](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/module-registry.ts#L1-L6)).
5. **Écart de texte connu.** Le statut `collaboration` annonce « partage multi-utilisateur et droits non disponibles (Lot 4) » ([#L56](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/module-registry.ts#L56)). Le README des modules, requalifié par M06, constate au contraire des membres et des rôles contrôlés côté serveur, et prévoit la correction du texte dans un lot applicatif autorisé ([P/apps/web/src/modules/README.md](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/README.md)). L'écart est conservé, **pas corrigé ici**.

Établi : la structure et les consommateurs sont identifiés ; la conséquence d'un ajout naïf est démontrée par lecture. Ouvert : le choix entre (a), (b) et (c), qui appartient à la décision.

## REP-07 — `scripts/check-module-deps.mjs` : frontières existantes et frontières à ajouter

Frontières existantes (lecture) :

1. **Paquets purs.** Chaque `packages/*` doit avoir un `manifest.json` et n'importer que ses `allowedDependencies`, hors tests. Les API navigateur (`document`, `window`, `navigator`, `localStorage`, `HTMLElement`) y sont interdites ([P/scripts/check-module-deps.mjs#L47-L76](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/scripts/check-module-deps.mjs#L47-L76)). Il y a 5 manifestes : `atelier-model`, `core-geometry`, `domain-model`, `geometry-exact`, `planche-model`.
2. **Applications.** Les imports croisés `apps/web` ↔ `apps/api` sont interdits par une **recherche de sous-chaîne** `spec.includes("apps/api")` ([#L78-L88](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/scripts/check-module-deps.mjs#L78-L88)).
3. **Lancement.** Le script est exécuté par `npm run typecheck` (`package.json`, script `typecheck`) et par `npm run check:deps`.

Contrôles exécutés (non destructifs ; détail dans [`REP-07-ESSAIS.json`](REP-07-ESSAIS.json)) :

| Essai | Cible | Résultat |
|---|---|---|
| E0 | dépôt réel au `817bd36` : `node scripts/check-module-deps.mjs` | code 0, « dépendances conformes aux manifestes » |
| E1 | copie isolée : `apps/web/src/temoin.ts` importe `../../../apps/api/src/interne` | code 1, violation détectée (témoin) |
| E2 | copie isolée : `apps/web/src/relatif.ts` importe `../../api/src/interne` (même cible, résolue dans `apps/api`) | **code 0, non détecté** |
| E3 | copie isolée : `apps/web/src/modules/studio/a.ts` importe `../atelier/nouveau/interne` | code 0 (aucune règle de frontière entre modules web) |
| E4 | copie isolée : import dynamique par gabarit vers `../../api/src/${…}` | code 0, non détecté |
| E5 | dépôt réel : chaque import relatif de `apps/web/src` et `apps/api/src` résolu par `path.resolve` | 877 analysés, **0** franchissement : le faux négatif E2 n'est exploité aujourd'hui par aucun import |

Constats :

- **E2 est un faux négatif réel du garde existant.** Un chemin relatif qui ne contient pas la chaîne `apps/api` échappe au contrôle, même s'il se résout dans `apps/api`. Correctif proposé pour un lot autorisé (A3/A6), **non appliqué** : résoudre le chemin relatif par rapport au fichier (`path.resolve(dirname(file), spec)`), puis comparer au dossier interdit.
- **E3.** Il n'existe aucune frontière entre modules de `apps/web`. Le Plan §2.1 le dit (« ne garantit pas à lui seul toutes les frontières »). Règles candidates pour Studio, à décider : `modules/studio/**` n'importe pas les internes de `modules/atelier/nouveau/**` ni de `modules/parcours/**`, seulement des contrats publics déclarés ; tout nouveau paquet `packages/studio-*` a un manifeste ; les moteurs passent par leurs interfaces publiques (orientation DEC-18). Chaque règle doit être accompagnée de son test.
- **Tests.** `scripts/` n'a aucun test propre à ce script ; seul `check-continuity` en a un.

## REP-08 — `docs/continuity/README.md` : appliquer le protocole existant

1. **Le protocole est en place pour Studio.** Le chantier `docs/workstreams/studio/` existe avec `CONTEXT`, `TASKS`, `STATUS`, `HANDOFF` et un `task-register.json`. Le cycle prescrit est Issue → branche courte → PR → preuves → STATUS/HANDOFF → revue, sans branche permanente par module ([P/docs/continuity/README.md](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/docs/continuity/README.md), sections « Objets de travail » et « Workflow obligatoire »). Le Plan §2.1 demande d'utiliser cette continuité plutôt qu'une branche Studio permanente. Cela est conforme à l'état observé.
2. **Contrôles exécutés au `817bd36`.**
   - `node scripts/check-continuity.mjs` : code 0, `CONTINUITY_CHECK_OK : structure et checkpoints contrôlés.`
   - `node --test scripts/check-continuity.test.mjs` : 8 tests, 8 réussis, 0 échec.

   Ces contrôles prouvent la **forme** des dossiers, pas la véracité de leur contenu ; le README le dit lui-même.
3. **Application concrète dans cette tâche.** Le travail a été annoncé dans #166 avant exécution. Il est livré sur une branche courte et dans un dossier séparé, sans écrire `STATUS`, `HANDOFF` ni le registre, dont A0 est propriétaire unique. Un delta de registre est proposé à A0 ([`DELTA-REGISTRE-PROPOSE.json`](DELTA-REGISTRE-PROPOSE.json)). Les trois états « Implémenté / Vérifié / Accepté » restent distincts : rien n'est « Accepté ».
4. **Limite rappelée par le README.** `main` n'était pas protégé lors de l'audit. Le ruleset relève d'une décision administrative (Q-M003-D05) et n'est pas traité ici.

## Ce que ces sept tâches ne prouvent pas

- Elles ne prouvent aucune conformité d'une fonctionnalité Studio, aucune recette NAV et aucun parcours exécuté dans un navigateur.
- Les E2E citées n'ont pas été relancées.
- Les numéros de ligne valent pour `817bd36` et sont à relire au commit de réalisation du lot I.
- Les options de REP-06 et les règles candidates de REP-07 sont des **entrées de décision**, pas des décisions.
