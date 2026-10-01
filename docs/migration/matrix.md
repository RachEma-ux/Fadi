# Matrice de conformité — migration du prototype Parcours V8.19

Document vivant (à tenir à jour à chaque session de migration — voir mission
du 2026-10-01, section 15). Relie chaque fonction du HTML de référence
(voir `reference.md`) à son emplacement dans la webApp Fadi et à sa preuve
de validation. Remplace l'affirmation « c'est migré » par un état vérifiable.

Légende statut : ✅ validé (test automatisé + vérification visuelle) ·
🟡 partiel (donnée réelle persistée, UI incomplète) · ⛔ non commencé.

## 1. Les 21 étapes du Parcours (module Parcours)

| Fonction (HTML) | Décision | Emplacement webApp | Statut | Preuve |
|---|---|---|---|---|
| Registre des 21 étapes, numérotation 01–21, phases | Extraire | `apps/api/src/data/parcours-steps.json` → `GET /projects/:id/steps` | ✅ | `app.test.ts` — « seeds the 21 real steps » |
| Grille de cartes mobile (présentation d'origine) | Conserver | `ProjectShell.tsx` → `StepCard` / `.cards` | ✅ | Capture `02-step-grid.png` (session du 2026-10-01) |
| `study()` — vue étape par étape, précédent/suivant | Adapter | `ProjectShell.tsx` → `StepDetail`, `?etape=N` | ✅ | Captures `03`–`08`, scénario Playwright (ouverture, suivant×2, retour, limites 1/21, rechargement) |
| Propositions Harmonie par étape (`h7-app`) | Extraire | `harmonieOptions` par étape, section dépliable dans `StepDetail` | ✅ | Capture `08-harmonie-expanded.png` |
| Harmony comme sous-page de l'Atelier (étape 10), pas une étape autonome | Conserver (contrainte respectée) | Aucune étape « Bilan Harmony » créée | ✅ | Revue du registre — 21 étapes, aucune ajoutée |
| Donnée vs hypothèse vs recommandation, par étape | Conserver | `ParcoursStepContent.result.{donnee,hypothese}` | ✅ | Capture `03` : blocs visuellement distincts |
| Import de l'EXEMPLE COMPLET et du dossier antérieur | Extraire | `GET /examples`, `POST /examples/:id/import` | ✅ | `app.test.ts` — « imports an example... » |

## 2. Projets et sources / Accueil

| Fonction | Décision | Emplacement | Statut | Preuve |
|---|---|---|---|---|
| Accueil : projet actif, progression réelle | Adapter | `AccueilPage.tsx`, progression dérivée de `project_steps.status` | 🟡 | Non revérifié dans cette session — hérité d'une session antérieure, pas re-testé ici |
| Bibliothèque d'exemples accessible depuis l'accueil | Extraire | `ExamplesSection` (`ProjectsPage.tsx`), lien `/projets#examples-heading` | ✅ | Capture `01-examples-list.png` |

## 3. Atelier architectural

| Fonction (HTML) | Décision | Emplacement | Statut | Preuve |
|---|---|---|---|---|
| Niveaux, élévations réelles (décimales) | Adapter | `levels` (schéma corrigé `integer`→`double precision`, commit de cette session) | ✅ | `app.test.ts` — élévation mezzanine 3.2 exacte (`toBeCloseTo`, 10 décimales) |
| Modèle natif complet de P.118 : 220 murs, 120 poteaux, 84 portes, 126 fenêtres, 32 volées d'escalier, 967 tracés, 64 cotes, 95 repères, 45 locaux, sur 6 niveaux | Extraire | `p118-native-architecture.json` → `architectural_objects`, importé à la création du projet exemple | 🟡 | Persisté et interrogeable (`app.test.ts` — « imports P.118's complete native architecture »load) ; **non visualisé** |
| Relations porte/fenêtre → mur hôte | Extraire | `relations: [{kind:"hosted-by", targetId}]`, remappé vers les ids préfixés projet | ✅ | Même test — vérifie la relation et résout la cible |
| Dessin d'un mur (outil minimal) | Conserver | `AtelierPanel.tsx` — formulaire longueur/épaisseur, SVG par mur | 🟡 | Hérité, pas revalidé cette session |
| Portes, fenêtres, poteaux, escaliers, dalles/mezzanine, cotations, repères, locaux — **affichage et édition** | — | — | ⛔ | Aucun ; voir « Prochaine action » |
| Pencil, Pousser/Tirer, Grouper/Éclater, grille/axes/accrochages/boussole | — | — | ⛔ | Aucun |
| Vues Plan/Coupe/Façade/Volume/Éclaté | — | — | ⛔ | Aucun |
| Moteur canvas réel (le bloc 13,2 Mio non audité, `reference.md`) | — | — | ⛔ | Nécessite l'audit complet avant toute tentative de portage |

## 4. Programmation (bibliothèque de bâtiments)

| Fonction | Décision | Emplacement | Statut |
|---|---|---|---|
| `building-library-data`/`building-library-app` (profils, cas-types, cibles de programme versionnées) | — | — | ⛔ non commencé |

## 5. Analyses métier, Documents, Collaboration

Non auditées dans cette session — `reference.md` ne couvre que les scripts
identifiés à la racine du document ; ces modules restent des stubs côté
webApp (`descriptor.status` générique dans `ProjectShell.tsx`).

## 6. Repères de coordonnées (transversal)

| Fonction | Décision | Emplacement | Statut |
|---|---|---|---|
| Distinction cadastral/géographique/local, jamais mélangés | Conserver (déjà conçu ainsi) | `Coordinate` + gardes de type (`packages/domain-model/src/entities.ts`) | ✅ conception ; 🟡 usage réel limité (le modèle importé de P.118 est entièrement en repère local, tagué `"frame":"local"` dans `properties`) |
| Conversion cadastral EPSG:26191 ↔ géographique WGS84 (`proj4` embarqué) | — | — | ⛔ bloqué — voir `reference.md`, « Limites » |

## Décisions techniques prises cette session

- **`levels.elevation` : `integer` → `double precision`.** Le modèle natif
  porte des altitudes décimales (-3,2 m, 3,2 m...) ; les arrondir était une
  perte de donnée interdite par AGENTS.md. Migration en place incluse dans
  `init.sql` (`ALTER TABLE levels ALTER COLUMN elevation TYPE double
  precision`), sûre à rejouer sur une base existante.
- **Identifiants natifs préfixés par projet** (`${projectId}_${nativeId}`)
  pour `levels.id` et `architectural_objects.id`, qui sont des clés
  primaires globales côté serveur. Un deuxième import de P.118 collisionnerait
  sinon avec le premier. Les relations (`hosted-by`) sont remappées vers les
  mêmes ids — correspondance explicite, pas de perte de référence.
- **Import en lots de 300 lignes** (`insertInChunks`) pour les ~1 750 objets
  architecturaux — une seule requête aurait inutilement dépassé une taille
  raisonnable sans bénéfice.
- **`project.modelRevision = 1`** après l'import du modèle natif (au lieu de
  1 753 révisions, une par objet) : le chargement initial d'un exemple n'est
  pas une suite de commandes utilisateur annulables (AGENTS.md /
  `docs/architecture.md`), donc une seule révision « modèle chargé ».
- **Pas de conversion géodésique inventée** : `projects.parcel_footprint`
  reste `null` pour l'import P.118 plutôt que de contenir une position
  approximée avec des paramètres EPSG:26191 non vérifiés dans cet
  environnement.

## Limites restantes (état réel, pas une liste de vœux)

1. L'Atelier ne rend que des murs. 1 533 objets du modèle P.118 (87 % du
   total) sont en base mais invisibles à l'écran.
2. Le moteur canvas d'origine (bloc de 13,2 Mio) n'a pas été audité ligne à
   ligne — condition préalable à tout portage fidèle de l'Atelier (section 8
   de la mission : pencil, pousser/tirer, grouper/éclater, vues, cotations,
   accrochages...).
3. Aucune conversion de repère cadastral→géographique n'existe : la parcelle
   P.118 n'a pas de position WGS84 dans la webApp.
4. Programmation (bibliothèque de bâtiments), Analyses métier, Documents,
   Collaboration : non audités, non portés.
5. Persistance locale / synchronisation hors-ligne (section 11 de la
   mission) : non commencée.
6. Export/réimport d'archive complète (section 11) : non commencé.
7. Comparaison systématique par scénarios de caractérisation (section 13) :
   faite ponctuellement (captures Playwright) pour la navigation du Parcours
   uniquement, pas selon la méthode complète demandée (scénarios
   HTML-vs-webApp appariés, conditions comparables, captures ordinateur ET
   mobile).

## Prochaine action

Auditer le bloc monolithique de 13,2 Mio (`reference.md`, anonyme #3) pour
en extraire : la définition de `study()` (comparaison avec `StepDetail`),
et la structure du moteur canvas de l'Atelier (quelles primitives, quel
modèle d'édition) — préalable nécessaire avant de commencer le portage des
portes/fenêtres/poteaux/escaliers dans l'Atelier (section 8 de la mission),
qui est le plus gros écart restant avec la référence.
