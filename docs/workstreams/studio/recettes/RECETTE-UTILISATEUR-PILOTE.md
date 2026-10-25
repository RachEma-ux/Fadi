# Recette utilisateur du pilote Studio — guide

Ce guide sert à **R.3-01** : la recette des trois parcours par le maître d'ouvrage, depuis l'entrée « Studio » de la barre
verticale. Elle ne peut pas être automatisée ni faite à sa place ([ADR-STUDIO-PILOTE-01](../../../continuity/decisions/ADR-STUDIO-PILOTE-01.md), P-07).
Les mêmes gestes passent déjà en recette automatisée ([rapport](RECETTE-PILOTE-2026-10-25.md)) : il s'agit ici de
constater l'utilité métier sur un vrai poste.

**Où :** la préproduction (`preprod.fadimmo.com`), sur le dernier commit de `main` vert en CI. Si la préproduction
automatique n'est pas encore installée sur le VPS, le chef de projet la prépare à la demande. **Avec quoi :** un
ordinateur et, si possible, un téléphone réel. Les données sont synthétiques : un petit local ou pavillon, sans donnée
de projet réelle.

## Parcours A — dessin 2D seul, jusqu'à la publication

1. Studio → choisir un projet → **Nouvelle étude**. Aucune planche n'est imposée.
2. Domaine « Dessin et modélisation », Planche 2D : tracer une ligne, puis une cote accrochée à ses extrémités.
3. Enregistrer (Ctrl+S), fermer l'onglet, rouvrir l'adresse : la ligne et la cote reviennent.
4. Panneau Publications : cocher « Dessin 2D indépendant », soumettre, approuver, diffuser. Le paquet contient SVG, DXF et
   feuille PDF, sans IFC.

**À constater :** rien n'exige de modèle 3D ; la réouverture rend exactement le dessin ; le paquet diffusé s'ouvre.

## Parcours B — 3D directe, jusqu'à la vue et la coupe

1. Nouvelle variante → Planche 3D → poser un volume libre (boîte).
2. Enregistrer, puis demander une coupe horizontale : les contours dérivés s'affichent.

**À constater :** le volume se construit sans dessin 2D préalable ; la coupe correspond au volume.

## Parcours C — objets associés, jusqu'à la revue et la publication

1. Poser un mur de 6 × 3 × 0,2 m et une ouverture de 1 × 2,1 m. Le métré indique 3,600 m³ brut, 0,420 m³ déduits et
   **3,180 m³ net**.
2. Depuis la vue 3D, élargir l'ouverture à 1,20 m : le net devient **3,096 m³** ; la révision précédente reste lisible et
   inchangée.
3. Publier un dossier qui réunit deux variantes : le manifeste cite leurs révisions et leurs empreintes, et l'approbation
   porte sur cet ensemble.

**À constater :** le même mur est le même objet en 2D et en 3D ; les quantités suivent ; rien n'est réécrit dans
l'historique.

## Consigner le résultat

Dire au chef de projet, ou écrire dans l'Issue #166, pour chaque parcours : **conforme** ou **non conforme**, avec ce qui
gêne. Les défauts éliminatoires bloquent G4 et sont corrigés d'abord. Sur un résultat conforme des trois parcours, le chef
de projet constitue le dossier G4 (G4-01, G4-02) et le soumet.

## Après G4 : la mise en production (geste du maître d'ouvrage)

1. Vérifier la préproduction sur le commit candidat (`/version` quand elle existera, sinon l'état de `fadi-preprod`).
2. Publier une **Release GitHub** sur ce commit exact (`docs/deploiement-automatique.md`, phase B). Le service de
   production prend une sauvegarde vérifiée, redéploie, puis lance ses sondes, avec retour arrière automatique.
3. Vérifier `www.fadimmo.com` : le chef de projet consigne alors R.4-03 (versions de build et de schéma) et R.5-01 (ta
   validation du site déployé).
