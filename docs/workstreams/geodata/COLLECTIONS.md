# Collections de cartes (D-GD-36)

28 octobre 2026 · spécification du maître d'ouvrage « mini-barre (Enregistrer, Fond), menu ☰ « Cartes » et nouveau
concept « Collection » » · réalisation : PR « GeoData : collections de cartes, menu Cartes et mini-barre ».

## Concept

Une **collection** est un **ensemble nommé et ordonné de cartes enregistrées** (un atlas, un dossier de cartes) qui
regroupe les cartes d'un même projet ou d'un même territoire.

- Elle contient des **références** vers des cartes de *Mes cartes*, jamais des copies : modifier une carte la modifie dans
  toutes les collections qui la contiennent.
- Une même carte peut appartenir à **plusieurs** collections.
- **Supprimer** une collection ne supprime aucune carte : seules ses références disparaissent.
- Une carte archivée reste référencée ; elle est signalée « (archivée) » dans la liste.
- Hors périmètre : partage, export et impression d'une collection.

## Modèle de données (base, `apps/api/src/db/init.sql`)

L'interface ne contient aucune collection : tout vit en base, lu par l'API.

| Table | Colonnes | Rôle |
| --- | --- | --- |
| `geodata_collections` | `id`, `espace_id`, `nom` (titre, 1 à 120 caractères), `description` (≤ 2000), `proprietaire_id`, `etat` (`active` / `archivee`), `revision` (≥ 1), `cree_le`, `modifie_le` | la collection |
| `geodata_collection_cartes` | `collection_id`, `carte_id`, `espace_id`, `rang` (≥ 1) ; clé (`collection_id`, `carte_id`) | liaison collection ↔ cartes, ordonnée |

- Clés étrangères composites avec l'espace (`(collection_id, espace_id)`, `(carte_id, espace_id)`) : une collection ne
  référence que des cartes de son propre espace. `ON DELETE CASCADE` des deux côtés : supprimer une collection retire ses
  références, jamais ses cartes.
- **Reprise de l'existant.** Avant D-GD-36, une carte se rangeait dans *une* collection (`geodata_cartes.collection_id`).
  La migration (idempotente) recopie ces rattachements dans la liaison ordonnée (rang selon le nom), complète
  `proprietaire_id` depuis l'espace, puis vide `collection_id`, qui n'est plus écrit : la liaison est la seule source.
  Vérifié en base locale : deux cartes rattachées à l'ancienne manière sont reprises aux rangs 1 et 2, colonne vidée,
  second passage sans effet.

## API (`/geodata/api`, `apps/api/src/routes/geodata/cartes.ts`)

| Route | Effet |
| --- | --- |
| `GET /collections` | collections de l'espace : titre, description, état, dates, nombre de cartes actives |
| `GET /collections/:id` | détail : titre, description, cartes dans leur ordre (`id`, `nom`, `etat`) |
| `POST /collections` `{ nom, description?, cartes? }` | Nouveau ; Enregistrer sous (avec la liste de la collection copiée : mêmes références) |
| `PUT /collections/:id` `{ revisionAttendue, nom?, description?, etat?, cartes? }` | Enregistrer : la liste ordonnée est remplacée en entier (transaction) ; révision périmée → 409 avec l'état courant |
| `DELETE /collections/:id` | Supprimer : la collection et ses références ; les cartes restent |

**Révision.** Comme une carte, une collection porte une révision, augmentée à chaque enregistrement et à chaque ajout
d'une carte depuis *Mes cartes* (`POST /cartes { collectionId }`). Un enregistrement périmé (autre onglet, carte ajoutée
entre-temps) est refusé (409, état courant joint) : jamais de remplacement silencieux. Côté interface, la collection
ouverte et non modifiée est relue après un tel ajout ; modifiée, le conflit est affiché avec « Recharger la collection ».

Refus : carte d'un autre espace, carte en double, plus de 500 cartes, titre vide ou trop long (400) ; collection d'un
autre compte (404). Une carte expose `collections` (celles, actives, qui la référencent) à la place de l'ancien
`collectionId` ; `POST /cartes { collectionId }` ajoute la nouvelle carte en dernière position ; `PUT /cartes` refuse
`collectionId` (une carte se range par la collection). Une copie de carte (Dupliquer) n'entre dans aucune collection.

## Interface (`apps/web/src/modules/geodata/`)

- Menu ☰ › **Cartes** › **Collection** : *Nouveau* (titre, description facultative ; la collection devient ouverte),
  *Ouvrir* (liste des collections), *Enregistrer* et *Enregistrer sous* (désactivés sans collection ouverte).
- Panneau **Collection** (`panneaux/collection.tsx`) : titre, description, liste ordonnée ; un clic sur une carte l'ouvre ;
  **Ajouter la carte affichée** (la carte doit d'abord être enregistrée), **Retirer**, **Monter / Descendre** ;
  Enregistrer, Enregistrer sous, Supprimer (avec confirmation). État « modifiée, non enregistrée » affiché.
- Opérations sur la liste, pures et testées : `packages/geodata-model/src/collections.ts`.
- *Mes cartes* affiche « Dans les collections : … » ; le choix « Ajouter à la collection » reste possible à
  l'enregistrement d'une nouvelle carte.
