# Lot 7 — Versions, variantes, publication, collaboration — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010). Décision : D-020.

Ouvrir : un projet, `?module=atelier`, panneau de droite sous « Modifications » : **Versions**, **Variantes**,
**Publications**, **Verrous** (sur téléphone : onglet des modifications). Comparaison d'une vue : mode Documents, une
vue, « Comparer avec une version ». Collisions : panneau des modifications.

## Fait

| Sujet | Résultat |
| --- | --- |
| Révisions | `GET /projects/:id/atelier/model?revision=n` : état exact d'une révision passée, reconstitué par les inverses du journal (`etatARevision`, `packages/atelier-model/src/versions.ts`) ; lecture seule ; future ou antérieure à un import : 404 motivé. |
| Versions nommées | `atelier_versions` (instantané complet + empreinte, nom unique) ; `GET/POST /atelier/versions`, `GET /versions/:id`, `POST /versions/:id/restaurer` (lot `interne.restaurer` vers l'instantané : nouvelle révision, historique conservé, « inchangé » si rien à faire). Comparaison `GET /atelier/comparer?de=&a=` (`courante`, `r:<n>`, `v:<id>`) : ajoutés, supprimés, modifiés avec leurs champs, niveaux, définitions, site. Interface : créer, comparer, **mettre en évidence en 3D**, restaurer. |
| Variantes | `POST /atelier/variantes` : projet bifurqué (copie intégrale) relié au tronc (`atelier_variants` : révision de bifurcation, empreinte). `GET /variantes/:id/fusion` : essai — lots à rejouer, objets créés / modifiés / supprimés, **conflits** (objet touché par le tronc depuis la bifurcation et par la variante, avec les deux lots), rejeu à blanc avec les mêmes réducteurs. `POST /variantes/:id/fusion` : rejeu validé lot par lot (mêmes `requestId`, mêmes refus que tout lot), une transaction ; conflits refusés (409, liste) sauf « la variante prévaut » choisi explicitement ; statut « fusionnée ». Interface : bandeau de la variante, comparer au tronc, préparer la fusion, mise en évidence 3D, fusionner. |
| Publications | `POST /atelier/publications` : version (créée si besoin), versions des catalogues (contrat de commandes, schéma IFC, modèle, contrôles métier, documents, revue de conception, application), documents produits à la révision publiée (PDF des vues et feuilles, CSV, quantités, maquette IFC) rangés en **volumes immuables** adressés par SHA-256 (`volumes`). `GET /publications/:id` (écarts de catalogues), `GET …/fichiers/:volume` (octets d'origine), `POST …/restaurer` (modèle publié, écarts signalés). |
| Verrous fins | `atelier_locks` : objet ou `niveau:<id>`, 30 min par défaut ; `GET/POST /atelier/verrous`, `DELETE /verrous/:cle` (auteur, propriétaire, ou échéance) ; tout lot qui touche un objet ou un niveau verrouillé par autrui est refusé en entier (423, auteur, motif, échéance) — y compris une fusion ou un import. Interface : verrouiller la sélection ou le niveau, lever. |
| Collisions | `collisions(etat)` : ouverture hors du mur hôte, ouverture plus haute que le mur, ouvertures qui se chevauchent, escalier traversé par la dalle de son niveau d'arrivée ; `GET /atelier/collisions` et `GET /problemes` ; panneau des modifications (mène à l'objet). P.118 : aucune. |
| Comparaison de vues | `comparerDessins` + `svgComparaisonVues` : dessin courant grisé, traits retirés en rouge, ajoutés en vert, bornes réunies. |
| Sauvegarde (T11) | `scripts/verify-restore.sh` : tables `atelier_versions`, `atelier_variants`, `atelier_publications`, `atelier_locks`, `volumes` comptées ; empreintes des versions, des publications et des volumes comparées avant / après restauration. |
| Yjs | Non retenu (D-013) : les annotations restent des commandes. |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 95, **atelier-model 90** dont 6 nouveaux —
  révision reconstituée exactement à chaque révision, frontière d'import, restauration exacte, comparaison de modèles
  et de dessins, analyse de fusion, collisions — **API 72** dont 4 nouveaux : révisions et versions, variante
  modifiée puis fusionnée avec conflit entre deux comptes, publication T12 (fichiers à l'octet, CSV identique au
  catalogue, restauration), verrous ; web 20) · `npm run build` ✅.
- Recette `apps/web/e2e/atelier-versions.mjs` (nouvelle, en CI) : **24 contrôles verts** — version créée, comparée,
  mise en évidence en 3D, restaurée ; variante créée, modifiée, conflit explicite avec un second compte, fusion
  « la variante prévaut » ; publication (documents, octets SHA-256), restauration après modifications ; verrou refusant
  l'autre compte (423) puis levé ; collision signalée ; vue comparée entre versions ; 390 px ; axe-core ; aucune
  erreur JavaScript.
- Recettes `atelier-echanges.mjs` (17 ✓), `atelier-documents.mjs` (18 ✓), `atelier-nouveau.mjs` (41 ✓) ; scénario complet
  `parcours-scenario.mjs` : 326 contrôles verts, « Scénario conforme. » ; `scripts/verify-restore.sh` sur la base de
  développement : restauration vérifiée, empreintes des versions, publications et volumes identiques.
- `⏱` : créer une variante du P.118 1,2 s ; publier (8 documents dont l'IFC) 3,1 s.
- Acceptation du cahier : variante créée, modifiée, fusionnée ✅ ; conflit explicite entre deux comptes ✅ ;
  publication restaurable avec ses dépendances ✅ (T12 : révision et versions de catalogues retrouvées exactement ;
  T11 : restauration de la base vérifiée avec les nouvelles tables).

## Non fait / reporté

- Consultation d'une révision passée **dans l'Atelier** (navigation en lecture seule) : l'API la sert, l'interface
  compare et met en évidence ; l'ouverture d'un ancien état en plein écran n'est pas faite.
- Fusion d'une variante déjà fusionnée (seconde vague de modifications) : refusée ; créer une nouvelle variante.
- Réutilisation sélective d'un modèle (DA-21-09 : familles cochées, identifiants remappés) : non faite — la variante
  reprend tout le projet.
- Verrous visibles sur le plan (icône) : la liste est dans le panneau, le refus est explicite.
- Collisions : seulement les quatre contrôles listés (pas de détection générale de volumes qui s'interpénètrent).
