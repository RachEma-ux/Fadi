# Lot AX-3 — phase B, réutilisation et visibilité

Mis à jour : 2026-10-25 (UTC). Issue #296. Correspondance : AXE-05 et AXE-06 du plan #295.

## Livré

- `reperes-enregistres.ts` (pur) : enregistrer, mettre à jour (révision suivante), renommer (le nom est une étiquette :
  révision inchangée), dupliquer (nouvel identifiant), supprimer — refusé pour un repère cité par une scène sans
  résolution explicite ; « détacher » garde l'instantané de la scène, dans le même pas ; état du repère actif
  (modèle, temporaire, enregistré, **modifié**, périmé, absent) ; capture et rappel par scène (révision capturée,
  sinon instantané de la scène signalé, jamais une définition plus récente substituée).
- Contexte de travail : une modification d'un repère enregistré garde son origine (`depuis`) → « Modifié »,
  « Enregistrer les modifications » ou « Enregistrer comme nouveau » ; rien n'est écrasé en silence.
- Scènes : option visible « Rappeler le repère de travail avec la scène » (décochée par défaut, préférence de
  l'appareil) ; les scènes antérieures ne rappellent que la caméra.
- Mise à l'échelle du modèle : origines des repères enregistrés et des captures de scène suivent la géométrie.
- Interface : panneau « Repères » (colonne de droite, hors catalogue) — repère actif et état, enregistrement, recherche,
  activer, renommer, dupliquer, supprimer avec confirmation, portée « cette Planche, dans ce navigateur » ; commandes
  « Enregistrer le repère » (`Alt+Maj+9`) et « Gérer les repères » (`Alt+Maj+0`, pictogramme partagé avec le panneau,
  partage déclaré) ; repères enregistrés dans la liste « Repère actif » de la barre.
- Triade d'orientation (`planche/triade.ts`, pure ; surcouche SVG de la vue) : lettres X / Y / Z, demi-axe négatif en
  pointillé, coin au choix, repère de travail ou du modèle, ne capte pas le pointeur, indépendante des axes de dessin ;
  **exclue de l'image PNG par défaut**, incluse sur option (même dessin).
- Recette `apps/web/e2e/sandbox-reperes.mjs` (CI, tranche `planche`).

## Preuves

- Modèle : `reperes-enregistres.test.ts` (8 tests : AX08, AX09 relecture, AX14, suppression, « Modifié », mise à
  l'échelle) ; web : `triade.test.ts` (3 tests).
- Recettes locales : `sandbox-reperes.mjs` **OK** ; `sandbox-axes.mjs` OK ; `sandbox-module.mjs` OK.

## Écarts déclarés

- AX15 (deux utilisateurs, rejeu hors ligne) : sans objet pour le Sandbox, local et mono-utilisateur (AX-D9).
- AX09 de bout en bout (document ancien injecté dans le navigateur) : couvert par les tests du modèle
  (`contexteDepuisDocument`, `lireModelePlanche`), pas par une recette navigateur.
