# GeoData — Prix immobiliers : inventaire d'intégration (lot P0)

Relevé du 31 octobre 2026 (heure suisse), branche `claude/prix-immobiliers-geodata`. Spécification : `Fadi Concept/Fadi
Concept - Prix.md` et `Fadi Concept - Prix Plan.md` (v1.1). Ce document liste les points d'extension **réellement**
utilisés ; il ne décide rien (décisions : journal du chantier).

## Base de données

| Point d'extension | Chemin | Usage pour les prix |
| --- | --- | --- |
| Schéma additif et rejouable | `apps/api/src/db/init.sql` (bloc « GeoData — Prix immobiliers », avant le bloc D-7) | Tables `geodata_prix_*` ; droits `fadi_app` par la reprise globale D-7 (aucune clause propre) |
| Archive des fichiers | `geodata_fichiers`, `apps/api/src/lib/geodata/archive-fichiers.ts` | Rôles `prix` (registre livré, `prix/`) et `import-prix` (fichier d'observations reçu, jamais marqué retiré) ; l'annexe FeenWay est archivée avec sa fiche (rôle `donnees`) |
| Versions et immuabilité | `geodata_versions`, déclencheur `geodata_version_immuable` | Une édition d'agrégats publiés = une version ; lignes figées par `geodata_prix_agregats_figes` |
| Hiérarchie administrative | `geodata_entites_administratives`, `geodata_niveaux_administratifs`, `geodata_decoupage_imports` (D-GD-42) | Candidats et rangs du rattachement ; édition du découpage consignée dans chaque rattachement |
| Journal | `geodata_journal` | Statuts des sources, imports, constructions, publications, refus, retraits, exports |
| Réglages | `geodata_reglages` | Repère `categorie-prix-semee` (semis unique de la catégorie sur une base en service) |

## Chaîne d'import

| Point d'extension | Chemin | Usage |
| --- | --- | --- |
| Import des fiches livrées | `apps/api/src/db/geodata-reference.ts` | Annexe `version.annexes.prixPublies` (lecture, empreinte, contrôles, rattachement) ; `--archiver` et `--prix-sources` chargent le registre |
| Import automatique au démarrage | `apps/api/src/lib/geodata/import-auto.ts` | Inchangé : `--archiver --fiche toutes --livraison` couvre registre et annexe |
| Empreinte attendue d'une fiche | `apps/api/src/lib/geodata/empreinte-fiche.ts` | `prixPublies` ajoutée à la suite des annexes (après douars, concepts, tableau de bord) |
| Écriture d'une version | `apps/api/src/lib/geodata/versions.ts` (`ecrireVersion`) | Champ `prixPublies` → `geodata_prix_agregats_publies` |
| Découverte des fiches | `fichesLivrees()` : fichiers `.json` du **premier niveau** du dossier des sources | `prix/prix-sources.json` est dans un sous-dossier : jamais pris pour une fiche |
| Lecture CSV | `lireCsv` (`packages/geodata-model/src/decoupage.ts`, RFC 4180, BOM, guillemets) | Réutilisée pour l'annexe et les fichiers d'observations |
| Logique pure des prix | `packages/geodata-model/src/prix/` | Validation, quarantaine, rattachement, dédoublonnage, cellules (type 7), états, comparaison, agrégats publiés |
| Services de l'API | `apps/api/src/lib/geodata/prix/` (`agregats.ts`, `registre.ts`, `pipeline.ts`, `droits.ts`) | Annexe, registre, chaîne des observations, capacités |

## API, rôles et catalogue

| Point d'extension | Chemin | Usage |
| --- | --- | --- |
| Routeur GeoData | `apps/api/src/routes/geodata/index.ts` | `prixRouter` monté (compte connecté, `Cache-Control: private, no-store`) |
| Routes des prix | `apps/api/src/routes/geodata/prix.ts` | `/geodata/api/prix/…` (voir `docs/geodata/README.md`) |
| Corps de requête | `apps/api/src/app.ts` | `/geodata/api/prix/imports` lit son propre corps (10 Mo) |
| Fiche d'objet | `apps/api/src/routes/geodata/consultation.ts` | Champ `prixPublies` (champs existants inchangés) |
| Rôles GeoData | `geodata_roles`, `packages/geodata-model/src/droits.ts` | Capacités des prix portées sur les rôles existants (`lib/geodata/prix/droits.ts`), aucun rôle nouveau |
| Catégories du catalogue | `packages/geodata-model/src/catalogue.ts`, `apps/api/src/routes/geodata/categories.ts` | Catégorie `prix-immobiliers` (thème `prix-immobiliers`) au modèle et semée une fois sur les bases en service |
| Interface | `apps/web/src/modules/geodata/` | Panneau et section de fiche (lot P7, agent d'interface) |

## Essais

| Contrôle | Chemin |
| --- | --- |
| Sans base | `apps/api/src/lib/geodata/prix/prix.test.ts`, `apps/api/src/db/geodata-sources.test.ts`, `apps/api/src/lib/geodata/archive-fichiers.test.ts`, `packages/geodata-model/src/prix/*.test.ts` |
| Base attestée (DB-3) | `apps/api/src/routes/geodata-prix.test.ts` + `geodata-prix.scenarios.ts` ; suite ajoutée à `scripts/check-api-tests-db3.mjs` |
