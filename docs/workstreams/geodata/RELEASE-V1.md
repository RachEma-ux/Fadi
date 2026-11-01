# GeoData V1 — dossier de Release et de mise en service

Mis à jour : 2026-10-25 (UTC). Reprend la préparation de Release du 25 octobre 2026 (document du maître d'ouvrage) et la
complète par les constats et corrections de la session.

## 1. État vérifié

| Élément | Constat |
| --- | --- |
| Code GeoData | `main` : PR #301 (`1d92920`) et checkpoint #304 (`b46303a`) fusionnés ; `main@3e992b6` inclut aussi Axes #303 |
| CI de `main@3e992b6` | Verte (run 40192137528), recette GeoData comprise |
| Releases GitHub | Aucune (liste vide) |
| Préproduction | Déploiement automatique de `main` vérifiée par la CI : `deploy/preprod/fadi-preprod-auto` (minuteur systemd). SHA réellement déployé non vérifiable depuis la session (`/version` et `/health` en 401) |
| Production | `/health` 200 ; `/version` renvoie le HTML de l'application → l'instance en ligne est antérieure à la route `/version` : GeoData n'y est pas |
| Mécanisme de production | **`fadi-prod-auto` n'existe pas dans le dépôt** (phase B de `docs/deploiement-automatique.md`, non réalisée). Une Release GitHub **ne déploie donc rien** tant que ce service n'est pas livré et installé, ou que la production n'est pas mise à jour par la procédure manuelle de l'exploitant |
| Outils GeoData dans l'image | Absents jusqu'ici (sources TypeScript et `tsx` hors de l'image) → **corrigé** : `apps/api/dist/geodata-role.js`, `apps/api/dist/geodata-reference.js` et les fiches `dist/geodata-sources/`, contrôlés par le job CI `image` |
| Reprise import en deux temps | La relance avec `--publier-par` ne publiait pas une version déjà préparée → **corrigé** : elle publie la version restée en préparation, aux mêmes conditions |

## 2. Ordre de mise en service

1. **Préproduction** : relever sur le VPS `fadi-preprod show` / `/opt/fadi-preprod/etat.json` ; le SHA déployé doit être
   le candidat (dernier `main` vert contenant ce dossier). Vérifier `/version` authentifiée.
2. **Données en préproduction** (base synthétique, sans risque) : rôles puis import geoBoundaries avec les commandes de
   `docs/geodata/README.md` (`sudo docker exec fadi-preprod-app-1 node apps/api/dist/…`).
3. **Recette d'usage en préproduction** (section 5) ; conserver la preuve.
4. **Production** — deux voies, au choix du maître d'ouvrage :
   - livrer d'abord la phase B (`fadi-prod-auto`, sa recette d'échec et de retour arrière en préproduction, règle de
     protection des étiquettes), puis publier la Release sur le SHA exact validé en préproduction ;
   - ou mettre à jour la production par la procédure manuelle de l'exploitant (sauvegarde préalable, image du SHA validé,
     migration à usage unique, `up`, `smoke`), la Release servant alors de trace du SHA autorisé.
5. **Données en production** : mêmes commandes de rôles et d'import que l'étape 2 sur le conteneur de production
   (`docker compose --env-file .env.deploy exec app node apps/api/dist/…`), comptes désignés par le maître d'ouvrage.
6. **Vérification après mise en production** (section 4), puis point de sauvegarde après validation.

## 3. Notes de Release proposées

- Étiquette : `fadi-2026.10.25-geodata-v1` (à ajuster au SHA réellement validé) ; titre : `Fadi — GeoData V1 et évolutions Axes`.
- Contenu : GeoData V1, espace cartographique autonome `/geodata` sans projet — catalogue versionné, couches et légende,
  recherche locale et coordonnées étiquetées, fiches et table, cartes privées avec gestion des conflits, import GeoJSON,
  zones et annotations, analyse de superficie et d'intersection, export PNG et fiche de sources. Le candidat inclut aussi
  les phases B, C et D des outils Axes (PR #303).
- Données pilote : limites geoBoundaries du Maroc ADM1 (12) et ADM2 (75), ODbL, année représentée 2017 — pas un
  découpage officiel ; mises à disposition par la chaîne d'import contrôlée.
- Limites : fond neutre ; aucun fond ni géocodeur externe ; indicateurs HCP non publiés (droits non qualifiés) ;
  superficie calculée, non officielle ; recette sur appareils physiques à compléter.
- Retour arrière : `GEODATA_ENABLED=false` (tables et cartes conservées) ; image précédente selon la procédure
  opératoire. Une restauration de base n'est pas un retour arrière automatique.

## 4. Vérification après mise en production

`/health` (API et base) ; `/version` = SHA attendu (JSON, plus le repli HTML) ; API protégées refusées sans session ;
compte sans projet : `/geodata`, deux couches et leurs sources ; carte enregistrée retrouvée après reconnexion ; zone et
analyse portant leurs versions ; export PNG et fiche de sources cohérents ; journal GeoData sans secret ; **aucun jeu
synthétique** au catalogue. Ne jamais lancer la suite e2e de CI sur la production.

## 5. Recette sur appareils physiques (non exécutée)

| Scénario | Attendu |
| --- | --- |
| Téléphone Android, navigation tactile | Un panneau principal, aucun débordement bloquant |
| Ordinateur, souris et clavier | Recherche, catalogue, fiche, focus et fermeture des panneaux |
| Sauvegarde, fermeture, reconnexion | Carte et versions conservées |
| Deux onglets sur la même carte | Conflit explicite, aucune perte |
| Zoom, couches, légende | Valeurs absentes distinctes de zéro |
| Export sur l'appareil | Fichier lisible et attribué |
| Réseau coupé ou moteur graphique absent | Erreur explicite, données disponibles accessibles |

Relever appareil, navigateur, version, résultat et décision. Ajouter iOS/Safari si ces appareils sont dans le périmètre.

## 6. Ce que la session ne peut pas faire

Aucun accès au VPS ni outil de création de Release depuis la session cloud ; la production reste hors délégation
(ADR-GEODATA-02). Les étapes 1 à 6 sont celles du maître d'ouvrage ou de l'exploitant.
