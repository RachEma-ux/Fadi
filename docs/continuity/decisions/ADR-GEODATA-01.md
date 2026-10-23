# ADR-GEODATA-01 — GeoData autonome des projets

Statut : **Accepté** pour le périmètre fonctionnel explicitement demandé ; orientations techniques à confirmer.
Date : 2026-10-22.
Chantier : geodata.
Issue : https://github.com/RachEma-ux/Fadi/issues/243.

## Contexte

Une première recherche envisageait une géolocalisation rattachée aux projets. Le responsable a corrigé ce périmètre : « On veut un module totalement indépendant des projets », nommé GeoData, avec une page d’accès ressemblant à la carte de Kharita. Il a précisé « Ne code rien encore », puis demandé la création des versions MD et DOCX et leur dépôt dans GitHub selon la procédure.

## Options examinées

- Géolocalisation dépendante d’un projet : écartée par le responsable.
- Module GeoData autonome avec accès direct à la carte : retenu pour le concept.
- Application ou infrastructure physique entièrement séparée : non demandée et non décidée.

## Décision et responsable

Décision du responsable Fadi dans la demande du 22 octobre 2026, retranscrite dans l’Issue #243 : GeoData est indépendant des projets et dispose d’un accès cartographique propre. Sa consultation, ses cartes et ses données ne nécessitent aucun projet. La demande actuelle autorise les documents et leur dépôt, pas l’implémentation.

## Justification

L’exploration et l’organisation des données territoriales doivent être possibles sans créer un dossier de projet. Le module possède donc ses propres objets, espaces et autorisations. La carte sert de page d’entrée.

## Conséquences et limites

- Le concept exclut les références aux projets dans le noyau GeoData et les transferts vers les parcelles du premier périmètre.
- Les services génériques de Fadi peuvent être réutilisés sans introduire de dépendance métier aux projets.
- `/geodata`, PostgreSQL/PostGIS, MapLibre, les entités et les contrats d’API restent des propositions de conception, pas une description de fonctions livrées.
- `docs/architecture.md` conserve son état de référence existant. L’intégration de GeoData à l’architecture réalisée devra être documentée dans un lot ultérieur autorisé.
- Cette décision ne vaut ni acceptation détaillée du concept, ni autorisation de fusion, de migration ou de déploiement.

## Vérifications et références

- [Concept GeoData](../../../Fadi%20Concept/Fadi%20Concept%20-%20GeoData.md), version 1.0, et son document Word associé.
- [Issue #243](https://github.com/RachEma-ux/Fadi/issues/243).
- [Procédure des concepts](../../../Fadi%20Concept/README.md).
- [Point de reprise](../../workstreams/geodata/HANDOFF.md).
