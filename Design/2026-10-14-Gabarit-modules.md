# Gabarit commun des pages du projet

Date : 14 octobre 2026.
Demande : appliquer aux pages des modules le gabarit de « Feuille de route » validé par le propriétaire, sans grandes bandes latérales vides et avec la même barre des modules sous l'en-tête principal.
Base de réalisation : `3bcda9296eaa0a0376ca5d2279dd71f52a75184b`.

## Périmètre

Accueil du projet, Projets et sources, Parcours, Programmation, Atelier architectural, Analyses métier, Documents, Collaboration. « Feuille de route » reste la référence et partage les marges et la navigation. L'accueil général `/accueil` conserve son gabarit de lecture.

## Réalisation

`ProjectShell` rend une seule enveloppe et une seule `ProjectModuleNav`, y compris pour l'accueil, le chargement et l'erreur. La navigation précède les métadonnées, les alertes et les contenus de module. Le cockpit utilise déjà ce même composant avant son contenu.

`project-layout.css` supprime les plafonds extérieurs de 1 200 et 1 440 px dans le périmètre du projet. Les marges communes sont de 30 px sur ordinateur et 14 px à 700 px et moins. Les cartes et grilles se développent dans l'espace disponible ; les proportions des aperçus et les largeurs de lecture des formulaires ne sont pas supprimées globalement.

Sur téléphone, seule la barre de modules défile horizontalement. L'onglet actif est révélé sans faire défiler verticalement la page ; les neuf entrées restent accessibles au clavier.

L'ouverture de l'Atelier, directement ou par les étapes 10 / 11, n'active plus la classe `atelier-immersive` qui masquait Fadi. Le nom historique du hook est conservé pour ses appelants ; le marqueur est désormais `atelier-workspace`. Un ResizeObserver ajuste la hauteur de l'éditeur à l'espace réellement restant sous les en-têtes, avec un minimum utilisable sur petit écran. Aucun outil de dessin, modèle, calcul métier, permission ou mécanisme de sauvegarde n'est changé.

## Vérification

- Tests unitaires : ordre des neuf entrées, destination de la feuille de route, unicité de l'onglet actif et absence de l'ancien marqueur de masquage automatique.
- Recette Chromium `apps/web/e2e/project-layout.mjs` : exemple P.118 importé dans un compte de test isolé, neuf pages, largeurs 1 920 / 1 440 / 1 024 / 768 / 390 px, barre latérale repliée et déployée sur ordinateur, mesures DOM, captures, étapes 10 / 11, clavier, liens directs, historique, rechargement et non-régression de `/accueil`.
- La recette vérifie également l'absence de débordement horizontal global et la conservation des 21 étapes et de leurs statuts.
- Workflow dédié `Project layout` : résultats JSON et captures conservés sept jours. Le workflow CI existant reste responsable du typage, des tests généraux, du build et des autres recettes.

## État de livraison

Implémentation préparée pour une branche dédiée. Ce document décrit les modifications et les contrôles à exécuter ; il ne déclare pas les résultats de CI par anticipation. Les résultats font autorité dans les exécutions GitHub Actions liées au commit. Aucun déploiement du site de démonstration n'est déclenché par ce document.
