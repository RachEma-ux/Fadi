# Lot Planche L11 — Noyau « pièce de profilé » — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-214 ; fiche `docs/planche/fiches/PL-11-01.md` ;
programme `docs/planche/analyses/programme-lots.md` (L11, chaîne des profilés).

## Livré (noyau seulement, sans interface)

- **`profiles.ts`**, géométrie pure qui ne dépend que de `vecteur.ts`. Il contient :
  - la section (contour 2D et trous), sa validation et son aire ;
  - la section posée : rotation de 90°, puis un des cinq points de placement, ou le côté d'une boucle ;
  - le repère d'une pièce et sa matrice ;
  - le prisme d'une pièce, à bouts droits (décalages) ou en onglet (plan de coupe en local, chaque sommet de la section
    coupé), orienté sur la coque extérieure comme Suivez-moi.
- **`poserPiece`** pose une pièce sur une arête (liée à la racine) ou entre deux points. La pièce est un composant dont
  la définition porte `piece` : désignation, section, source, placement, longueur et côté.
- **`poserPiecesSurAretes`** pose une pièce par arête d'une chaîne, avec onglets aux sommets partagés (option). Sur une
  boucle plane, la position peut être centre, extérieur ou intérieur ; une boucle non plane refuse extérieur et
  intérieur.
- **Liens `annotations.pieces`**, indexés par l'occurrence : arête, sommets A et B, voisines d'onglet, instantané de la
  pièce (définition, transformation, empreinte du contenu). `actualiserPieces` s'exécute après chaque opération, à la
  suite des liens d'extrusion :
  - quand l'arête bouge, la pièce est recalculée ;
  - si la forme change sur une définition partagée, l'occurrence est d'abord rendue unique ;
  - une pièce modifiée elle-même, une arête disparue ou redécoupée rompent le lien ;
  - un recalcul impossible refuse la modification.
- **Lecture validée** : `estLienPiece` et `estMetadonneesPiece` (dans `estDefinition`) ; la table `pieces` est ajoutée
  aux deltas.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `profiles-l11.test.ts` (14), qui couvre : volume 0,015 m³ ; 5 points de placement ; rotation 90° ; décalages ± 0,05 ; refus ; boucle extérieur / intérieur / centre ; chaîne sans onglet ; arête allongée → pièce allongée ; lien rompu à l'édition ; copie non liée inchangée (rendue unique) ; coin de boucle déplacé ; sérialisation ; delta ; aucune donnée de profilé (texte) ; mesure | verts |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Mesure (⏱)

Sur 200 arêtes en chaîne (poste de développement, Node, vitest) :
- pose de 200 pièces liées avec onglets : **≈ 150 ms** ;
- un déplacement d'arête qui recalcule deux pièces et vérifie les 200 liens : **≈ 40 ms**.

Le volume du modèle est d'un composant par arête, comme prévu au programme.

## Limites déclarées

- **Pas d'interface à ce lot** (programme) : les outils « Profilé » et « Profilés depuis arêtes » arrivent au lot L12,
  avec la règle d'or (icône, barre, raccourci).
- **Liens à la racine seulement** : une pièce posée dans un groupe ouvert n'est pas liée (même règle que les liens
  d'extrusion, L-02).
- **Chaîne non plane avec onglets** : le repère de chaque pièce prend +Z pour la hauteur, et les coupes de deux pièces
  voisines d'une chaîne gauche peuvent ne pas coïncider exactement. Sur une chaîne plane ou une boucle plane, elles
  coïncident (test).
- **Régénération sur commande explicite** (C8), à partir des métadonnées, après modification de la section : elle est
  prévue avec l'édition d'une pièce (L17). À ce lot, la régénération ne suit que l'arête.
