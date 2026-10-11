# Lot Planche 9 — Registre unique des commandes, frappes seules, barres au clavier — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-209 ; programme `docs/planche/analyses/programme-lots.md`
(L9) ; cahier « Extrusion Implementation Specification V1 », B1.1 et B1.2 (EX-CMD-01 à 06 ; cas A-02 à A-08).

## Livré

- **Frappes seules des modificateurs** (EX-CMD-04, `outils/modificateurs.ts`, pur). L'appui sur Maj, Ctrl ou Alt ouvre une
  frappe en attente, et le relâchement la déclenche seulement si rien ne s'en est servi entre-temps.
  - Ce qui consomme la frappe : toute autre touche (lettre, chiffre, Tab, second modificateur, donc Ctrl + Z, Maj + Tab,
    Maj + chiffre et AltGr), un geste du pointeur, un changement d'outil, Échap ou la perte de focus.
  - La répétition automatique est ignorée, et aucun seuil de durée n'est utilisé.
  - Les outils déclarent `MachineOutil.modificateurSeul`. Pousser/Tirer ne lit plus l'appui de Ctrl, Alt ou Maj :
    - **Maj seul** rétablit **« Surface ouverte »** ;
    - Ctrl seul bascule « Conserver la face de départ » ;
    - Alt seul bascule Étirement, ou « Des deux côtés » sur une arête.
    - Ctrl ou Maj seul sur une arête : refus nommé, état inchangé.
  - Les autres outils gardent leurs modificateurs maintenus (Sélection, Gomme, Peinture, Ligne…).
  - Les boutons Ctrl, Alt et Maj (appui bref) du toucher valent une frappe seule.
  - Rien ne se déclenche depuis un champ, une frappe de valeur ou une barre.
- **Barres au clavier** (EX-CMD-06, motif W3C APG « Toolbar », `navigation-barre.ts`). Chaque barre a une seule halte de
  tabulation (tabindex itinérant). Les flèches passent d'un bouton à l'autre, avec retour au début ; Origine et Fin vont
  au premier et au dernier. Ces flèches ne vont jamais au dessin.
  - Barres concernées : barre d'actions, barre d'outils flottante, rail d'outils (vertical), modificateurs, plan de
    coupe, barre d'options (devenue `role="toolbar"`).
  - La poignée reste une halte à part : Maj + flèche déplace la barre sans changer de mode (A-08).
- **Registre unique des commandes** (EX-CMD-01, `registre-commandes.ts`). Les commandes livrées (objets, contexte, lien,
  Navigateur, vue) forment une seule liste : identifiant, icône, libellé, raccourci, famille.
  - Une seule résolution du clavier, `commandeDuClavier`, relit la touche physique sous Alt (macOS) et gère les touches
    de fonction.
  - Elle remplace les branches codées en dur de la Planche. L'exécution et la disponibilité restent celles de chaque
    famille.
- **Action d'extrusion typée** (EX-CMD-02) : `ActionExtrusion` (`set-operation`, `set-option`, `cancel`) avec des unions
  finies, validée par la machine.
  - A-02 : « Conserver la face » est refusé après Étirement ou Surface ouverte, sans drapeau périmé.
  - A-03 : action, bouton et frappe seule donnent le même état.
- La barre d'options affiche le raccourci de chaque mode : Surface ouverte (Maj), traduit en anglais (Shift).

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `modificateurs.test.ts` (A-04, A-05, A-06, geste, focus), `pousser-tirer.test.ts` (frappes seules, A-02, A-03), `registre-commandes.test.ts`, `navigation-barre.test.ts` | verts |
| Recette `planche-clavier.mjs` (nouvelle, ajoutée à la CI) | verte — Maj, Ctrl et Alt seuls ; A-04 (Maj + F) ; A-06 (Ctrl + Z, Maj + Tab, AltGr) ; clic pendant l'appui ; A-07 ; A-08 |
| Recettes Planche existantes (objets, lot 5, lots 4-6, lot 7, modification, outils, boutons, détachée, pousser-arêtes, pousser-modes, barre d'outils), `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- Le registre ne couvre pas encore les commandes du menu contextuel restées « en attente » au test de la règle d'or
  (Modifier, Coller, Masquer, Info…). Elles y entreront une à une, avec leur icône et leur raccourci.
- Les raccourcis des outils (catalogue et couche Fadi) gardent leur résolution propre (`outilDuClavier`). Le registre
  vérifie seulement qu'aucune commande n'en reprend un.
- EX-CMD-07 (glisser pour valider, marge de toucher) relève du lot 10, avec le pipeline d'aperçu.
