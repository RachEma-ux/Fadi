# @parcours/atelier-model

Modèle typé de l'Atelier (cahier des charges §5.1–5.3, lot 1). Paquet pur : ni React, ni DOM, ni API Node (R6).

## Dépendances

`@parcours/core-geometry` et `@parcours/domain-model` uniquement (§5.1, `manifest.json`, contrôlé par
`scripts/check-module-deps.mjs`).

## Contenu

- `src/ontologie/` — classes du §5.2 (`CLASSES_OBJET`, `ONTOLOGIE`, `ObjetDe<C>`, `ParamsParClasse`), unités
  typées (`Grandeur<U>`, `longueur`, `aire`, `angle`, `volume`), repères tagués `cadastral` / `geographic` /
  `local` jamais mélangés (`exigerRepereUnique`), provenance (`import`, `prototype`, `calcul`, `saisie`) et statut
  (`déclarée`, `à vérifier`, `à confirmer`, `non évaluée`) obligatoires (`Tracabilite`), relations
  (`TYPES_RELATION`, `RELATIONS_ADMISES`), caractéristiques nommées, classes IFC (annexe C), définitions de types
  et catalogue versionné (`VERSION_ONTOLOGIE`), validation (`validerObjet`). Exigences de D-021 incluses.
- `src/contrats/` — interfaces figées pour la phase 2, en types seulement :
  - enveloppe `atelier-commands/1` (`EnveloppeCommandes` : `requestId`, `baseRevision`, `label`, `commands`) ;
  - `Commande`, union discriminée par famille de l'annexe B (`TYPES_COMMANDE`, `CommandeDeType<T>`) ;
  - réducteurs `Reducteur<C>` : `(etat, commande) → { etat, inverse, effets }` ou erreur ; `TableReducteurs`,
    `AppliquerLot` ;
  - `Effets` (vues, documents, problèmes), `Probleme`, `CODES_PROBLEME` ;
  - `ReferenceTopologique` `{ objetId, caracteristique }`, `ETATS_RESOLUTION`, `ResoudreReference` ;
  - `Quantite` (valeur, unité, règle `quantites/1`, révision, empreinte), `CalculerQuantites` ;
  - `ImporterP118` : `(dataset) → { modele, rapport }`, `RapportImport` ;
  - `EtatModele` (objets par id, relations, révision, empreinte `atelier-empreinte/1`) ;
  - `TOLERANCES` (D-012).

## Versions des contrats

| Contrat | Version |
| --- | --- |
| `atelier-commands` | 1 |
| `quantites` | 1 |

Toute modification incompatible d'un contrat change sa version et passe par une décision `D-0xx`.

## Contrôles

```sh
npm run typecheck -w @parcours/atelier-model
npm test -w @parcours/atelier-model
```
