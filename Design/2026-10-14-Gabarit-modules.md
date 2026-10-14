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

## Diagnostic des tests spécialisés avant fusion

La recette de mise en page sur `a383fa4555725b8643ffe8ea6ed91c8b65fd9fff` a réussi ses 593 contrôles : [exécution 38537550502](https://github.com/RachEma-ux/Fadi/actions/runs/38537550502). La CI générale a ensuite relevé quatre échecs dans `atelier-complements.mjs`.

Le [diagnostic instrumenté 38541564868](https://github.com/RachEma-ux/Fadi/actions/runs/38541564868), sans modification du code applicatif ni des assertions, a établi les causes suivantes :

- Mur courbe : le point de flèche était repris par l'accrochage polaire sur la corde. Le refus « Point aligné avec les extrémités » était cohérent ; la fenêtre suivante échouait parce que son mur n'avait pas été créé.
- Escalier hélicoïdal : le deuxième clic atteignait `div.barre-actions`, pas le dessin.
- Mesure 3D : le premier clic atteignait le bouton « Visite à hauteur d'œil », ce qui changeait effectivement le mode au lieu de mesurer le coin du poteau.

La recette est adaptée au gabarit intégré : utilisation de l'aide existante `ecarterBarreActions`, accrochage polaire désactivé puis restauré explicitement pour la courbure libre, panoramique réel au bouton droit pour dégager les points 3D et vérification de la cible DOM avant les clics. Les assertions de création du mur, de fenêtre à mi-arc, des quinze marches et de diagonale exacte de √2 m sont conservées. Aucune modification des outils ou du moteur géométrique n'en découle.

## Livraison

PR : [#142](https://github.com/RachEma-ux/Fadi/pull/142). Le propriétaire a demandé la fusion et le déploiement le 14 octobre 2026. Les résultats complets de CI rattachés au dernier commit doivent être vérifiés avant fusion ; ce document ne les déclare pas par anticipation.

L'URL `condo-discovered-status-horse.trycloudflare.com` provenait du [Builder Deploy 38529381813](https://github.com/RachEma-ux/Fadi/actions/runs/38529381813), dont l'artefact `app_url.txt` porte cette adresse. Cette démonstration a été arrêtée le 14 octobre 2026 à 08:11 UTC. Relancer ce mécanisme produit une nouvelle URL et une nouvelle base temporaire, pas une mise à jour durable ni une restauration des dossiers de l'ancienne session. L'hébergement permanent relève de `docs/deploiement.md`.
