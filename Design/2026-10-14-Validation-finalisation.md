# Finalisation de la correction du gabarit projet

Date : 14 octobre 2026.
PR : #142 — `fix/project-layout-full-width`.
Reprise après interruption, à partir du code `89212b5de333c39ca37e01f2bffe260ca37c15e6`.

## Exigences conservées

Les huit pages du projet reprennent la largeur utile de Feuille de route. Les neuf entrées de navigation restent dans le même ordre, immédiatement sous l'en-tête principal. L'accueil général conserve son gabarit. Les 21 étapes, leurs titres, les données métier, les permissions et les mécanismes de sauvegarde ne sont pas modifiés par cette correction.

## Contrôles de livraison

La vérification doit couvrir la recette Project layout, le typage, les tests unitaires et API, la compilation, le corpus IFC, le conteneur de production et tous les scripts de recette du workflow CI, y compris les gestes 2D/3D, les menus mobiles et les barres flottantes de l'Atelier et de la Planche. Les assertions métier ne doivent pas être retirées pour obtenir un résultat vert.

Les anciens résultats ne valident pas automatiquement une nouvelle révision. Les liens des exécutions et le SHA effectivement fusionné seront consignés dans la PR. À la création de ce document, la reprise de la validation est en cours : aucune fusion ni aucun déploiement n'est déclaré effectué.

## Déploiement

L'ancienne démonstration Cloudflare était temporaire. Une nouvelle démonstration éventuelle doit être identifiée comme telle, avec sa durée, sa nouvelle URL et l'absence de restauration implicite de l'ancienne base. Elle ne constitue pas un hébergement permanent. Aucune base de travail existante ne doit être effacée ou remplacée pour cette vérification.

## Relance contrôlée des validations — 14 octobre 2026

Les workflows du commit `fcd7203dfd9082af9d0f240b50a996c50ec2b763` ont été marqués `action_required` car le commit provenait de `github-actions[bot]` ; aucun de ces deux runs n'a exécuté de job. Leur relance directe via GitHub Actions a renvoyé `403: This workflow run cannot be retried`.

Ce commit de documentation déclenche de nouveaux contrôles sur **la même version du code applicatif**. La mise en page sera fusionnée dans `main` seulement après validation du commit courant par les workflows `CI` et `Project layout`. La dernière révision de code n'est pas considérée comme testée au seul motif qu'une version antérieure a passé sa recette.
