# Module : Projets et sources

Responsabilité : projets, parcelles, fichiers, versions et provenance.

Gère la liste des projets (dont P.118, l'exemple pilote entièrement renseigné et duplicable), leurs parcelles,
les documents sources attachés (avec origine, date, unité et statut de vérification — voir `Donnée source`
dans `docs/architecture.md`), et l'historique de versions du projet.

## Statut

Pas encore implémenté. Dépend du modèle de domaine versionné (`packages/domain-model`, en cours) et du
`ProjectRepository` côté backend (`packages/core-geometry/src/project-repository.ts` documente le contrat
attendu côté Atelier ; ce module aura son propre besoin de persistance pour les métadonnées de projet et les
pièces jointes, stockées séparément de la base selon le choix technique retenu).
