# Licence d'utilisation du corpus de qualification Studio S1–S7

REF-02 §18.2 (`Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`) : « Chaque scène a une licence d'utilisation
autorisée et une empreinte de corpus conservée. » Ce document établit la licence des scènes S1 à S7 (X.1-01 à X.1-07) et
de leurs oracles et références visuelles (X.1-08).

## Faits établis (25 octobre 2026, contrôlés par `corpus.test.ts`)

1. **Origine** : chaque scène est **générée par le code de ce dossier** (`s1-detail.ts` … `s7-hors-reseau.ts`, graines
   fixes `GRAINES_CORPUS`), de façon déterministe. Aucune donnée n'est importée d'une source tierce, d'un client ou d'un
   projet réel : géométrie synthétique seulement, sans matériau, valeur réglementaire ni valeur structurelle. Les
   oracles (`oracles.ts`) et références visuelles (`references/`, `empreintes.json`) sont calculés par le même code.
2. **Licence du dépôt** : le dépôt `RachEma-ux/Fadi` ne déclare **aucune licence ouverte** — aucun fichier `LICENSE`,
   `LICENCE` ou `COPYING` à la racine, aucun champ `license` dans les manifestes, paquets `"private": true`. Le code et
   ce qu'il génère restent donc sous les **droits réservés du titulaire du dépôt** (le maître d'ouvrage), régime par
   défaut d'une œuvre publiée sans licence.
3. **Licence d'utilisation du corpus** : celle du dépôt. Le corpus est **autorisé** pour l'usage qu'en fait le dépôt
   lui-même — tests, recettes, mesures et porte G2 du projet Fadi —, par le titulaire qui en est l'auteur. Toute
   réutilisation hors de ce dépôt suit les droits réservés du titulaire.

## Ce que cette licence ne change pas

- Le contenu des scènes et leur couverture déclarée (`couverture.absents`) : les éléments que le modèle
  `studio-document/1` ne représente pas restent déclarés absents, jamais simulés.
- Les tailles 100 / 10 000 / 100 000 primitives restent **illustratives** (X.1-10), jamais des engagements de capacité.
- Si une licence ouverte est un jour adoptée pour le dépôt (fichier `LICENSE`), ce document et la constante
  `LICENCE_CORPUS` (`types.ts`) doivent être mis à jour : le test « licence du corpus établie » échoue tant qu'ils
  divergent du dépôt.
