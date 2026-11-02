# Lot AX-2 — phase A, interface « Axes et repères »

Mis à jour : 2026-10-25 (UTC). Issue #296. Décisions appliquées : AX-D3 (contexte personnel), AX-D6 (raccourcis).
Correspondance : AXE-03 (interface) et AXE-04 du plan #295.

## Livré

- Registre : famille `repere`, emplacement `barre-reperes`, 9 commandes hors des 86 entrées du catalogue, chacune avec
  son dessin sur mesure (trièdre étiqueté par ses flèches, style Tabler, 9 fichiers `pictogrammes/sur-mesure/`) et son
  raccourci : Repère actif `Alt+Maj+1`, Aligner `Alt+Maj+2`, Pivoter `Alt+Maj+3`, Plan de travail `Alt+Maj+4`,
  Verrouiller le plan `Alt+Maj+5`, Vue normale `Alt+Maj+6`, Repère précédent `Alt+Maj+7`, Repère du modèle `Alt+Maj+8`,
  Affichage des axes `F4` ; Placer reste l'outil Axes (`Maj+Y`). Chiffres lus sur la touche physique (`Digit1`…).
- `planche/commandes-reperes.ts` (pur) : liste, disponibilité expliquée (face à sélectionner, aucun précédent, modèle
  déjà actif), cycle des plans, outils concernés par le verrou.
- `planche/BarreReperes.tsx` : barre compacte flottante (poignée, flèches au clavier, position mémorisée, ramenée dans
  l'écran ; au téléphone rangée en bas, sélecteur et Placer visibles, le reste dans « Plus »), liste des repères,
  menu « Plus », inspecteur (origine numérique, orientation en coordonnées du modèle, rotation par axe nommé local ou du
  modèle et angle signé, plan, verrou ; refus explicite d'une valeur non numérique). Échap ferme le menu et rend le focus.
- Planche : exécution des commandes (clavier, barre, « Outils ▾ »), Vue normale au plan (caméra seule, cible ramenée
  sur le plan), ligne d'état persistante « Repère : … · Plan : … · Portée : … · Unité : m » (annoncée, hors de la
  consigne), avertissement quand le plan verrouillé ne s'applique pas à l'outil actif ; Placer les axes ouvre la barre.
- Préférence de l'appareil `barreReperes` (affichée, position).
- Recette `apps/web/e2e/sandbox-axes.mjs` (CI, tranche `planche`).

## Preuves

- Recette `sandbox-axes.mjs` locale : **RECETTE AXES : OK** (AX01, AX02, AX03, AX05, AX06, AX07, inspecteur, AX17 :
  noms accessibles, Échap, raccourci ignoré dans un champ, téléphone sans débordement ; mémoire par Planche ; aucune
  erreur JavaScript). `sandbox-module.mjs` relancée : 79 contrôles, réussie.
- Tests : registre (16), interface du Sandbox (registre, pictogrammes régénérés : 126), typecheck, build.

## Écarts déclarés

- Au téléphone, la ligne d'état du pied est masquée faute de place ; le sélecteur de la barre porte le nom du repère.
- La liste « Repère actif » ne propose que le modèle et le repère temporaire courant ; les repères enregistrés arrivent
  en AX-3.
