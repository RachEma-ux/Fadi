# TER-02 — Catalogue et import contrôlé (compte rendu de lot)

Date : 2 novembre 2026 (heure suisse). Issue : https://github.com/RachEma-ux/Fadi/issues/381. Branche :
`feat/381-ter-02-catalogue-import`, partie de `main@0810325`. Décisions appliquées : toutes les recommandations TER-Dx
retenues par le maître d'ouvrage le 2 novembre 2026 ([`DECISIONS.md`](DECISIONS.md)).

État : **implémenté et vérifié** (contrôles ci-dessous) ; **non accepté** ; aucun déploiement.

## Livré

| Élément | Fichier | Rôle |
| --- | --- | --- |
| Modèle pur | `packages/geodata-model/src/terrain/catalogue.ts` | Fiche d'un jeu d'altitudes, cycle de vie (TER-D12), contrôle en-tête ↔ fiche (rejet / quarantaine / prêt), levée de quarantaine (TER-D13), clé d'idempotence, quota (TER-D7), limites (TER-D14) |
| Schéma | `apps/api/src/db/init.sql` (`geodata_terrain_versions`, `_evenements`, `_fichiers`, `_traitements`) | Versions au contenu figé, transitions du plan imposées par déclencheur, une seule publiée par jeu, événements et fichiers en ajout seul, traitements idempotents ; aucune FK vers les projets (TER-D9) |
| Stockage | `apps/api/src/lib/geodata/terrain/stockage.ts` | Volume nommé (TER-D5) : `depot/`, `travail/`, `originaux/<sha256>` en lecture seule, `derives/` ; empreinte relue à chaque archivage ; aucune traversée de chemin |
| En-tête | `…/terrain/entete.ts` | Signature TIFF, dimensions, clés de géoréférence (horizontale et verticale), pas, emprise, NoData, type des valeurs — sans lire la grille |
| Import | `…/terrain/import.ts` | Empreinte en flux, traitement idempotent et reprenable, quota et taille avant écriture, événements, archivage, journal ; levée de quarantaine |
| Acquisition | `…/terrain/acquisition.ts` | Téléchargement depuis la seule adresse d'une fiche livrée (empreinte comparée), ou extrait de fenêtre d'un COG sans rééchantillonnage (TER-D10) |
| Commande | `apps/api/src/db/geodata-terrain.ts` (`npm run geodata:terrain`, `dist/geodata-terrain.js`) | `--telecharger`, `--importer`, `--lever`, `--etat` ; rôles GeoData vérifiés |
| Fiches | `docs/geodata/terrain/*.json` | Lucerne MNT et MNS 2024 à 0,25 m (feuille 1150337, démonstration), GEDTM30 v1.2 (extrait Benslimane), Copernicus GLO-30 (tuile N33 W008) |
| Déploiement | `Dockerfile`, `deploy/preprod/compose.yml` | Volume `fadi-preprod-terrain` (lecture seule pour l'API), service `terrain-import` (profil `terrain`) ; garde de préproduction conforme |
| Exploitation | `docs/geodata/README.md` § Terrain | Procédure |

Hors de ce lot (déclaré) : nuages de points LAS / LAZ (refusés : GeoTIFF seulement) ; emprise exacte en WGS 84 et
reprojection (TER-03, travailleur GDAL, TER-D6) ; routes de l'API, droits d'accès servis et tuiles (TER-04) ; interface
(TER-05).

## Vérifications (2 novembre 2026)

| Contrôle | Résultat |
| --- | --- |
| `packages/geodata-model` : `npx vitest run` | 31 fichiers, 229 tests réussis, dont 18 du terrain |
| `apps/api` : `src/lib/geodata/terrain/terrain-fichiers.test.ts` (sans base) | 7 tests réussis |
| Suite DB-3 `src/routes/geodata-terrain.test.ts` (13 tests) | Inscrite dans `scripts/check-api-tests-db3.mjs` ; exécutée en CI sur base attestée. **Exécutée aussi localement** sur PostGIS 16 jetable par une copie qui remplace seulement la connexion gardée par une connexion directe : 13/13 (cas concurrents relancés 5 fois) |
| `node scripts/check-api-tests-db3.mjs` (sans clé DB-3, local) | Seules les suites de la liste sont refusées, par la garde seule |
| `npm run db:migrate` sur PostGIS 16 local | Schéma appliqué |
| `bash deploy/preprod/tests/run.sh` (compte non privilégié) | 107 réussis, 0 échec |
| Garde de préproduction sur la configuration résolue (profils `terrain` et `recette`) | Conforme : 5 services, 4 volumes nommés `fadi-preprod-*` |
| typecheck, test, build du dépôt | Voir la PR |

Tests imposés par le plan couverts par ce lot : datum incompatible (quarantaine, aucune conversion), NoData distinct de
zéro, import raté préservant la version publiée (et seconde publiée impossible), fichier mal formé rejeté ; en plus :
idempotence, quota, contenu figé, levée de quarantaine ; et, après la revue Codex de la PR #383 : fiche corrigée sur le même
fichier (nouvelle version, identité = empreinte + fiche), imports simultanés sérialisés par verrou consultatif PostgreSQL
(une seule version, un seul traitement), reprise d'une version enregistrée dont le traitement a échoué. Les autres tests du plan (plan incliné, AOI trouée, couture,
accès non autorisé, exports) relèvent de TER-03 / TER-04.

## Données réelles importées (base locale jetable, volume local)

Licences relues avant téléchargement ([`TER-00-AUDIT.md`](TER-00-AUDIT.md) § 3, [`MODELES-REGIONAUX.md`](MODELES-REGIONAUX.md)).
Commande réelle `geodata:terrain --telecharger / --importer`, comptes de rôle de test.

| Fiche | Original (SHA-256) | Résultat | Motif |
| --- | --- | --- | --- |
| `lucerne-dtm2024-mnt-1150337` | `5fa5604f…67ad` (60,0 Mo ; EPSG:2056, 5000 × 3000, pas 0,25 m, NoData −9999) | **Quarantaine** | Référence verticale non déclarée : aucune clé verticale dans le fichier ; le producteur écrit « Höhe über Meer » sans nommer la référence |
| `lucerne-dom2024-mns-1150337` | `27eb24a1…55f0` (60,1 Mo) | **Quarantaine** | Même motif |
| `gedtm30-v1-2-benslimane` | `c4f27af3…5180` (extrait 397 × 361, 0,57 Mo ; deux extractions identiques ; centre 220,1 m comme la source) | **Quarantaine** | Référence verticale non déclarée (seul le nom de fichier porte « 4326.3855 ») |
| `copernicus-glo30-n33-w008` | `ad851fa4…e65f` (28,5 Mo ; 3600 × 3600) | **Quarantaine** | Aucune valeur NoData déclarée ; la tuile compte 4 337 602 cellules exactement à 0 (océan) et 855 négatives : 0 y est ambigu |

Relance de l'import : « déjà importée », aucune seconde version. Ces quarantaines sont le comportement voulu par le plan
(« quarantine unknown vertical datums instead of guessing ») : **aucune ne sera levée par la session** ; elles attendent
une décision consignée d'un responsable de publication avec sa source (questions Q-TER-02-1 à 3 de `DECISIONS.md`).

## Suite

TER-03 (traitement et porte qualité) après réponse aux questions de levée, ou en parallèle sur les jeux synthétiques ; un
lot à la fois.
