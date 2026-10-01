# Référence : `Parcours_V8_19_Escalier_B_Mezzanine.html`

Ce document identifie la référence fonctionnelle du prototype et inventorie
ce qu'elle contient réellement — pas seulement ses titres ou son premier
script. Il fait autorité pour juger si une étape de la webApp a ou non
« repris » le comportement du prototype (voir `docs/migration/matrix.md`).

## Identité du fichier

| Champ | Valeur |
|---|---|
| Nom | `Parcours_V8_19_Escalier_B_Mezzanine.html` |
| Taille | 18 138 479 octets (≈ 17,3 Mio) |
| SHA-256 | `e91492a0b382dd4ca11c20abe70f11ebe44d3bb48d2951b0b9eba9451171f0b9` |

Le fichier n'est pas commité dans ce dépôt (18 Mio, et ce n'est pas du code
source du produit — voir AGENTS.md, « Never commit... build outputs »). Il
reste disponible comme pièce jointe de la conversation ; son empreinte
ci-dessus permet de vérifier à tout moment qu'une copie ultérieure est bien
identique à celle analysée ici.

## Inventaire des blocs `<script>`

Dix-neuf blocs, dans l'ordre du document. « Classification » distingue ce
qui est actif (exécuté et non remplacé), superseded (remplacé par un script
plus récent), librairie (code tiers), ou donnée (JSON).

| id | type | octets | Classification | Rôle observé |
|---|---|---:|---|---|
| *(anonyme #0)* | js | 397 788 | actif — infrastructure | Pont de stockage partagé (`V14Bridge` / cache mémoire + repli si le stockage local est refusé, ex. Android) |
| *(anonyme #1)* | js | 324 555 | librairie | `proj4` — bibliothèque de projection cartographique (conversions de repère de coordonnées) |
| *(anonyme #2)* | js | 94 587 | actif — géométrie | Géométrie partagée de l'atelier architectural existant, construite sur `V14Bridge` |
| *(anonyme #3)* | js | 13 223 873 | actif — cœur legacy | Le script monolithique d'origine : tableaux `ST`/`PH` (titres et phases V5), et très probablement le moteur canvas de l'Atelier (murs, escaliers, cotations...) et la fonction `study()` de navigation étape par étape. **Non entièrement audité** (13 Mio) — voir « Limites » plus bas |
| `harmony-engine-v6` | js | 32 351 | actif | Moteur Harmony V6 — règles d'évaluation pures, versionnées (`RULE_VERSION='H-2026.09.28-1'`), sans mutation de géométrie |
| `harmony-app-v6` | js | 91 724 | actif | Intégration de `harmony-engine-v6` dans le parcours ; conserve délibérément les anciens identifiants d'étape |
| `building-library-data` | json | 1 249 002 | donnée — **non importée** | `Parcours.BuildingLibrary` v6.1.0 : profils de programme (tertiaire...), références, cas-types. Rattachée au module Programmation, pas encore portée |
| `building-library-app` | js | 62 105 | actif | V6.1 — bibliothèque de programme ; "cas sources et géométrie native immuables, applications créent des cibles de programme versionnées" |
| `p118-dossier-v62` | json | 44 418 | donnée — **importée** | Dossier antérieur V6.2 (zone, business légataire) → `apps/api/src/data/examples/p118-dossier-anterieur.json` |
| `flow-v62` | js | 79 602 | actif | V6.2 — dossier P.118, transmissions explicites, métrés dérivés du modèle natif (jamais une valeur saisie à la main) |
| *(anonyme #10)* | js | 9 162 | actif — infrastructure | Stockage scopé par iframe (`ParcoursFlowV62.frameStorage`) pour les sous-outils embarqués (parcelle, esquisse...) |
| `h7-stage-data` | json | 27 237 | donnée — **importée** | Registre des 21 étapes (V7) → `apps/api/src/data/parcours-steps.json` |
| `sections-v82` | js | 4 861 | actif — UI seule | V8.2 — placement/état de l'accordéon uniquement ; « Project data and geometry stay untouched » |
| `h7-app` | js | 77 961 | actif | V7 — Harmonie par étape, propositions scoped (jamais mobilier/pièces), source des `harmonieOptions` déjà importées |
| `p118-resolved-data` | json | 471 364 | donnée — **importée** | Contenu des 21 étapes de l'EXEMPLE COMPLET → `apps/api/src/data/examples/p118-exemple-complet.json` |
| `p118-resolved-template` | json | 1 545 993 | donnée — **partiellement importée** | `project.data` (architecture/structure/parcel888/circulation/harmony) + `native` (registre, niveaux, empreinte, **plan complet par niveau**). Le plan complet (`native.domains.floorDesign`) vient d'être extrait → `apps/api/src/data/examples/p118-native-architecture.json` ; `project.data.architecture.structure` (système porteur, charges) et `circulation` restent non importés |
| `p118-resolved-app` | js | 45 761 | actif | V8.1 — rend l'exemple P.118 complet et isolé, lit `p118-resolved-data` + `p118-resolved-template` par id |
| `sections-v82-lifecycle` | js | 439 | actif — très court | Enveloppe `study()` (définie dans l'anonyme #3) pour déclencher `ParcoursSectionsV82.enterStage()` à chaque changement d'étape — **confirme que `study()` est la fonction réelle de navigation étape par étape** |
| `atelier-harmonie-page-app` | js | 10 289 | actif | V8.4 — déplace (ne copie pas) les nœuds DOM : la page Harmony de l'étape 10 est une sous-page de l'Atelier existant, pas une étape autonome |

## Constats clés pour la suite de la migration

1. **`study()` est la fonction de référence du « passage d'étape en étape »**,
   patchée en V8.2 (`sections-v82-lifecycle`) mais définie dans le script
   monolithique (13 Mio, anonyme #3). La vue `StepDetail` ajoutée dans
   `ProjectShell.tsx` (commit `2a79eb7`) en reproduit le comportement observé
   depuis l'extérieur (une étape à la fois, précédent/suivant, barre de
   progression) mais n'a pas été comparée code à code avec `study()` —
   seulement avec ce que l'utilisateur en perçoit.
2. **`building-library-data`/`building-library-app`** (bibliothèque de
   programme, module Programmation) ne sont pas encore portés — aucune trace
   dans la webApp actuelle.
3. **Le plan complet de P.118** (murs, poteaux, portes, fenêtres, escaliers,
   dalles/zones, cotations, repères, locaux — 1 753 objets sur 6 niveaux) est
   maintenant extrait et importé en base (voir `matrix.md`, module Atelier),
   mais l'Atelier actuel ne sait afficher/éditer que des murs : les 1 533
   objets restants sont persistés, consultables par l'API, mais invisibles à
   l'écran.
4. **`proj4`** est embarqué précisément parce que le prototype convertit
   entre repères (cadastral EPSG:26191 ↔ géographique WGS84). La webApp n'a
   pas encore cette conversion : `projects.parcel_footprint` (WGS84) reste
   `null` pour P.118 plutôt que de contenir une position approximée sans
   vérification des paramètres géodésiques — voir « Limites ».
5. **13 Mio de script monolithique non audité** (anonyme #3) : le présent
   inventaire classe ce bloc par ce qu'on observe de son usage externe (il
   définit `study`, `ST`, `PH`, et très probablement tout le moteur canvas de
   l'Atelier) mais n'a pas été lu intégralement. C'est la prochaine étape
   d'audit avant toute tentative de migration fidèle de l'Atelier (section 8
   de la mission).

## Limites explicites de cet audit

- Le bloc anonyme #3 (13,2 Mio) n'a été inspecté que par ses 260 premiers
  caractères et par déduction à partir des scripts qui le patchent
  (`sections-v82-lifecycle` le confirme comme porteur de `study`). Une lecture
  structurée (extraction des définitions de fonctions, pas juste du texte)
  est nécessaire avant de porter l'Atelier complet.
- Aucune conversion EPSG:26191 → WGS84 n'a été tentée : les paramètres
  géodésiques exacts du système « Merchich / Nord Maroc » n'ont pas été
  vérifiés dans cet environnement (pas d'accès réseau de confiance pour
  valider une définition proj4 tierce). Inventer une transformation
  approximative risquerait de mal positionner la parcelle — interdit par
  AGENTS.md (« Do not invent... »). Le polygone cadastral natif
  (`EPSG:26191`, 4 sommets, aire 1 345,55 m²) reste disponible tel quel dans
  `p118-native-architecture.json` → `nativeParcel` *(note : ce fichier ne
  contient aujourd'hui que `floorDesign` ; `nativeParcel` est encore dans
  `p118-resolved-template.json` brut, pas re-publié séparément — à faire
  avec la conversion elle-même pour ne pas publier une donnée à moitié
  exploitable)*.
