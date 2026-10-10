# Lot Planche 8 — Pousser/Tirer : modes explicites et vrai Étirement — compte rendu

**Statut : livré le 10 octobre 2026, en attente d'acceptation du maître d'ouvrage.** Décision D-201 ; programme
`docs/planche/analyses/programme-lots.md` (L8) ; fiche `docs/planche/fiches/PL-08-01.md`.

## Livré

- **Contrat d'outil** (`packages/planche-model/src/outils/machine.ts`) : `OptionOutil` (identifiant, valeur, valeurs avec
  disponibilité et raccourci affiché), `VueOutil.options`, méthode facultative `MachineOutil.configurer`. Aucune autre
  machine n'est modifiée.
- **Pousser/Tirer** : options `face` (Normal, Nouvelle face, Étirement, Tube sans fond) et `arete` (Normal, Des deux côtés,
  Allonger) ; Ctrl, Alt et ↓ passent par `configurer`, comme les boutons ; modes exclusifs ; disponibilité selon la cible.
- **Étirement réel** : noyau `etirerFace` (les sommets de la face avancent, les voisines suivent ; refus nommé si une
  voisine deviendrait non plane, se retournerait ou s'annulerait) ; aperçu dédié (la face à sa place, trajets des sommets).
- **Barre d'options** de la Planche (`Planche.tsx`, `planche.css`) : groupes nommés, `aria-pressed`, boutons grisés avec
  motif, raccourci dans l'infobulle ; libellés au catalogue `messages.ts` (français et anglais, Planche détachée comprise).
- **Tube sans fond** : la touche Maj ne le bascule plus (conflit avec les raccourcis `Maj+lettre`, D-198) ; bouton de la
  barre d'options. Consignes et catalogue mis à jour.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` | vert |
| `npm test` (planche-model) | 503 tests verts (8 ajoutés) |
| Tests web | verts |
| `npm run build` | vert |
| Recette `planche-pousser-modes.mjs` (nouvelle) | verte — desktop et téléphone 390 px |
| Recettes `planche-pousser-aretes`, `planche-barre-outils`, `planche`, `planche-boutons`, `planche-outils`, `planche-modification`, `planche-detachee-documents`, `interface-anglais` | vertes |

## Limites déclarées

- L'Étirement refuse une voisine qui deviendrait gauche (SketchUp la plierait) ; à spécifier si le maître d'ouvrage veut
  le pli automatique.
- Le tube sans fond n'a plus de touche : elle sera attribuée par le registre unique des commandes (lot 9).
- Les barres d'opérations flottantes n'ont pas encore de section « Options » (lot 9).

## Suite du lot 8 (D-202, 10 octobre 2026)

Décidée par le maître d'ouvrage après l'analyse du cahier « Extrusion Implementation Specification V1 » et la recherche
Grouper / Éclater.

- **Étirement d'une face isolée refusé** (EX-PT-03, EX-UI-05) : `faceAVoisines(m, face, dans)` au noyau ; `etirerFace`
  refuse avec `ERREUR_ETIRER_ISOLEE` (« aucune face voisine dans ce contexte — utilisez Déplacer ») ; la machine refuse dès
  le clic en mode Étirement ; l'option Étirement est grisée quand la face survolée ou cliquée n'a pas de voisine. Les
  voisines sont cherchées **dans le contexte courant** : une face isolée dans un groupe est refusée même si elle touche
  visuellement une face extérieure.
- **Barre d'options superposée au dessin** (EX-UI-04) : au téléphone (≤ 760 px), elle flotte au-dessus du volet, à droite
  du rail d'outils ; elle ne prend plus de place dans le flux, la zone de dessin garde sa taille quand on choisit l'outil
  ou que la cible passe d'une face à une arête (le point visé reste sous le doigt). Au bureau, elle était déjà en
  surcouche ; elle prend l'aspect des autres barres flottantes (bord, rayon, ombre).
- **« Tube sans fond » renommé « Surface ouverte »** (EX-PT-04), français et anglais (« Open surface ») ; la consigne
  rappelle qu'un cercle donne un tube sans fond et qu'aucune face n'est ajoutée aux extrémités.
- **Règle d'or** : `AGENTS.md`, cahier C28, test « Règle d'or » (`barres-outils.test.ts`).
- **Fixtures de régression** (B0.2) : `fixtures-extrusion.test.ts` épingle P-01, P-02, P-03, P-10, P-11, P-12, P-14,
  P-15 et L-06 aux cotes de la V1 ; F-01 est couvert par « CA-SUI-1 » (`modification-noyau.test.ts`).

Limite déclarée maintenue : l'Étirement refuse une voisine qui deviendrait gauche ; l'Étirement à plis est programmé au
lot 20 (D-202).
