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
    modification `Modification<P>` : un paramètre facultatif se retire par `null`, un paramètre obligatoire
    jamais (D-024) ;
  - réducteurs `Reducteur<C>` : `(etat, commande) → { etat, inverse, effets }` ou erreur ; `TableReducteurs`,
    `AppliquerLot` ; un lot qui ne change pas le modèle (`piece.detecter` seul) garde révision et empreinte et
    rend un inverse vide (D-024) ;
  - `ErreurCommande` : `code`, `chemin`, `objet`, `cause`, `action` séparés, `message` composé
    « objet : cause. Action : action. » pour l'affichage (`composerMessageErreur`, D-024) ;
  - `Restauration` (D-024) : champ officiel `restauration` d'une commande inverse (état avant de chaque objet
    touché, empreinte attendue après, relations, traces de suppression, catalogue). Vérifiée avant application ;
    une double restauration, une restauration vide ou imbriquée est refusée. **Au lot 2, le serveur n'accepte
    une commande portant une restauration que pour un inverse qu'il a lui-même produit et journalisé** (une
    restauration fabriquée par un client est refusée) ;
  - `Effets` (vues, documents, problèmes, `propositions` : contours de pièces détectés, jamais appliqués
    d'office, D-024), `Probleme`, `CODES_PROBLEME` (dont `doublon` : code répété, copie superposée, D-024) ;
  - `ReferenceTopologique` `{ objetId, caracteristique }`, `ETATS_RESOLUTION`, `ResoudreReference` ;
  - `Quantite` (valeur, unité, règle `quantites/1`, révision, empreinte), `CalculerQuantites` ;
  - `ImporterP118` : `(dataset) → { modele, rapport }`, `RapportImport` ;
  - `EtatModele` (objets par id, relations, révision, empreinte `atelier-empreinte/1`) ;
  - `TOLERANCES` (D-012).

- `src/commandes/` — réducteurs purs de l'annexe B (`REDUCTEURS`, `appliquerLot`), restauration exacte,
  empreinte `atelier-empreinte/1` (`calculerEmpreinte`), historique local (`HistoriqueAtelier`).
- `src/importeur/` — `importerP118` (rapport : `docs/atelier/lots/lot-1-rapport-import.md`, régénéré par
  `ECRIRE_RAPPORT=1 npx vitest run src/importeur`).
- `src/projection/` — projection sans perte du modèle typé vers les domaines natifs et l'entrée d'analyse.

## Valeurs « non évaluée »

Un paramètre canonique absent de la source est « non évaluée » (`NonEvaluee`, R3), jamais deviné. Les
paramètres qui l'admettent sont déclarés `evaluable` (ou de nature `evaluable-*`) dans les descripteurs ; depuis
D-024 : `mur.alignement` et `escalier.referencePlanSeulement`. À l'import de P.118, les 8 volées sans
`planReferenceOnly` ont `referencePlanSeulement` « non évaluée » (D-025) et la projection n'écrit pas le drapeau
(sans perte) ; les 24 murs sans `lineRef` gardent `alignement: "axe"` « à vérifier » (D-025).

Convention d'alignement (DA-02-07) : « gauche » = l'axe tracé a→b est la face gauche du mur, qui s'étend du côté
de la normale (−dy, dx) ; « droite » à l'opposé ; « axe » centré.

## Versions des contrats

| Contrat | Version |
| --- | --- |
| `atelier-commands` | 1 |
| `quantites` | 1 |

Toute modification incompatible d'un contrat change sa version et passe par une décision `D-0xx`. Exception :
l'amendement D-024 (lot 1, contrat encore non publié hors du lot) complète `atelier-commands/1` sans changer sa
version.

## Contrôles

```sh
cd packages/atelier-model && npx tsc --noEmit && npx vitest run
node scripts/check-module-deps.mjs   # depuis la racine
```
