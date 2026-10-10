# Lot Planche 10c — Suivez-moi complet — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-212 ; programme `docs/planche/analyses/programme-lots.md`
(L10, découpage D-211) ; cahier V1, B3 (EX-FM-01, EX-FM-04 à 07, EX-PREV-01 ; cas F-04 à F-08).

## Livré

- **Profils troués (EX-FM-04, F-04, F-08).**
  - `suivezMoi` balaie chaque boucle du profil, extérieure et trous. Chaque trou donne sa paroi intérieure, et les
    capuchons portent les trous.
  - L'orientation de la coque se décide sur la boucle extérieure, puis les parois intérieures suivent.
  - Exemple F-04 : un tube carré de 40 × 40 mm, paroi de 2 mm, sur un chemin droit de 1 000 mm, donne un volume de
    matière de 304 000 mm³. Ce volume est mesuré par le test.
- **Chemins en L et fermés (EX-FM-05, F-05, F-07).**
  - Sur un chemin en L, l'onglet est valide et la cavité reste continue.
  - Sur un chemin fermé, la couture est soudée, sans capuchon ni face en double.
- **Capuchons (EX-FM-06, F-06).**
  - Le noyau reçoit l'option `bouchons`. L'outil propose « Capuchons » avec deux valeurs : Avec (par défaut) ou Sans.
  - Sans capuchons, sur un chemin ouvert, on obtient une surface ouverte et aucun solide n'est affirmé.
- **Refus atomiques (EX-FM-07, F-08).** Trois cas sont refusés, et le modèle reste inchangé :
  - trous jointifs (`ERREUR_TROUS_JOINTIFS`) ;
  - chemin qui se recoupe à moins de deux fois le rayon du profil (`ERREUR_CHEMIN_RECOUPE`) ;
  - onglet singulier, au-dessous de 12° (`ERREUR_ONGLET_SINGULIER`).
- **Aperçu par modèle candidat (EX-FM-01, EX-PREV-01).**
  - Au survol d'une face candidate, le noyau calcule le balayage sur une copie immuable du modèle, puis l'outil montre
    les faces créées, trous compris. Rien n'est écrit.
  - Un profil refusé l'est dès le survol, avec son motif.
  - Le clic valide le même calcul que l'aperçu : aperçu et validation passent par un seul chemin.
- **Règle d'or.** Les trois exigences étaient déjà remplies au lot 4 :
  - l'outil a son icône ↬ ;
  - il figure dans les barres Modifier et Créer ;
  - son raccourci est Maj+F.

  L'option nouvelle passe par la barre d'options standard (`data-planche-option-valeur="bouchons:…"`), en français et en
  anglais.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `suivez-moi-l10c.test.ts` (6) : F-04 à F-08 | verts |
| `outils/suivez-moi.test.ts` (7) : aperçu au survol, Échap, Capuchons Avec / Sans, refus dès le survol | verts |
| Recette `planche-suivez-moi.mjs` (nouvelle, ajoutée à la CI) : profil percé, Maj+F, Capuchons, aperçu (36 faces), balayage en un pas | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- **Éditeur interactif du chemin (F-02, EX-FM-02).** Non livré. Le chemin reste présélectionné (une face ou des arêtes
  continues), comme au lot 4. La sélection du chemin « au curseur » de SketchUp n'est pas reprise.
- **Ordre « profil puis chemin » (F-03, EX-FM-03).** Non livré. L'outil garde l'ordre « chemin présélectionné, puis
  profil ».
- **F-01** est la capacité de base du lot 4. Elle est vérifiée de nouveau, sans changement.
- L'aperçu est recalculé à chaque nouvelle face survolée. Il est mis en cache par profil, mais pas entre deux survols
  d'un profil refusé.
