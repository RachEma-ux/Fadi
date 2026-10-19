# Matrice rôle × route Studio × attendu (X.2-02)

Fichier **généré et vérifié** par `apps/api/src/routes/studio-permissions.test.ts` (ne pas éditer à la main : le test
échoue si ce fichier diffère de la matrice qu'il exécute ; `STUDIO_TRACABILITE_ECRIRE=1` le régénère). Chaque cellule
est exécutée sur le routeur Express réel, base simulée en mémoire (garde DB fermée, aucune base ni serveur).

Attendus : `404` non-membre, aucune fuite (même réponse qu'une ressource absente) ; `403` rôle insuffisant ;
`403 réf.` projet de référence protégé (`motif: reference-protegee`) ; `423` édition réservée par un autre compte ;
`admis` aucun refus de droit (le traitement suit : 2xx ou refus métier 400 / 404 / 409). Chaque refus est vérifié sans
aucune écriture. Sans session : 401 sur toute route, avant tout accès.

Besoins : `lecture` (tout membre), `commentaire` (tout membre, verrou sans effet), `ecriture` (propriétaire, éditeur ;
verrou → 423 ; la référence protégée ne s'applique qu'à `modification`), `modification` (propriétaire, éditeur ;
verrou → 423 ; référence → 403), `proprietaire` (propriétaire seul), `acteur` (règle d'acteur : auteur, responsable,
chargé de tâche — rôle vérifié ensuite par `lib/studio-observations.ts`, testé par `studio-observations.test.ts`).

| Route | Besoin | non-membre | lecteur | éditeur | éditeur (verrou d'un autre) | propriétaire | propriétaire (verrou d'un autre) | propriétaire (projet de référence) | Réponse du propriétaire | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| `GET /studies` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 |  |
| `GET /studies/:studyId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `PATCH /studies/:studyId` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `POST /exemple` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 exemple_indisponible | étude exemple P.118 : écriture système du propriétaire, admise dans la référence protégée ; projet hors exemple → 409 exemple_indisponible |
| `POST /studies/:studyId/archive` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `POST /studies/:studyId/unarchive` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `GET /studies/:studyId/compare` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 |  |
| `PATCH /studies/:studyId/variants/:variantId` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `POST /studies/:studyId/variants/:variantId/archive` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 400 initial_variant | variante initiale : 400 initial_variant après le contrôle de droit |
| `POST /studies/:studyId/variants/:variantId/unarchive` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `GET /studies/:studyId/variants/:variantId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/revisions` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/revisions/:revisionId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/revisions/:revisionId/changes` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/export` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/export/rapport` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/commands` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `GET /studies/:studyId/variants/:variantId/comments` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/comments` | commentaire | 404 | admis | admis | admis | admis | admis | admis | 201 |  |
| `DELETE /studies/:studyId/variants/:variantId/comments/:commentId` | acteur | 404 | 403 | admis | 403 | 403 | 403 | 403 | 403 forbidden | auteur seul (c1 : éditeur) |
| `POST /studies/:studyId/variants/:variantId/comments/:commentId/observation` | acteur | 404 | 403 | admis | 403 | admis | admis | admis | 201 | auteur du commentaire (c1 : éditeur) ou propriétaire |
| `POST /studies/:studyId/variants/:variantId/comments/:commentId/observation/transitions` | acteur | 404 | 403 | admis | 403 | 403 | 403 | 403 | 403 forbidden | corriger : le responsable (éditeur) avec le droit d'écrire, seul |
| `GET /studies/:studyId/steps` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `PUT /studies/:studyId/steps` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `GET /steps/:stepNumber/studies` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /preferences/outils` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | préférences du compte : aucune écriture du projet |
| `PUT /preferences/outils` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | préférences du compte (INV-009) : lecture du projet suffit |
| `GET /preferences/catalogue` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /publications` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/publications` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/publications` | ecriture | 404 | 403 | admis | 423 | admis | 423 | admis | 201 |  |
| `GET /studies/:studyId/publications/:publicationId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/publications/:publicationId/verification` | lecture | 404 | admis | admis | admis | admis | admis | admis | 404 not_found |  |
| `GET /studies/:studyId/publications/:publicationId/files/:format` | lecture | 404 | admis | admis | admis | admis | admis | admis | 404 not_found |  |
| `POST /studies/:studyId/publications/:publicationId/:action` | ecriture | 404 | 403 | admis | 423 | admis | 423 | admis | 200 | action soumettre |
| `POST /studies/:studyId/publications/:publicationId/:action` | ecriture | 404 | 403 | admis | 423 | admis | 423 | admis | 409 manifest_current | action actualiser |
| `POST /studies/:studyId/publications/:publicationId/:action` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 invalid_transition | action approuver |
| `POST /studies/:studyId/publications/:publicationId/:action` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 invalid_transition | action refuser |
| `POST /studies/:studyId/publications/:publicationId/:action` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 invalid_transition | action diffuser |
| `POST /studies/:studyId/publications/:publicationId/:action` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 200 | action retirer |
| `POST /studies/:studyId/publications/:publicationId/:action` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 200 | action approuver (publication soumise) |
| `GET /studies/:studyId/exigences` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/exigences/versions/:version` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/exigences` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 |  |
| `POST /studies/:studyId/exigences/acceptations` | proprietaire | 404 | 403 | 403 | 403 | admis | admis (à arbitrer) | admis (à arbitrer) | 409 version_perimee | à arbitrer (maître d'ouvrage) : l'acceptation n'est refusée ni par le verrou d'édition d'un autre compte ni par la référence protégée (comportement actuel épinglé, non changé) |
| `GET /studies/:studyId/variants/:variantId/controles` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/controles/:checkId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/controles` | ecriture | 404 | 403 | admis | 423 | admis | 423 | admis | 201 |  |
| `GET /studies/:studyId/variants/:variantId/ajustements-quantites` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/ajustements-quantites` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 |  |
| `GET /studies/:studyId/variants/:variantId/observations` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/observations` | commentaire | 404 | admis | admis | admis | admis | admis | admis | 201 |  |
| `GET /studies/:studyId/variants/:variantId/observations/:observationId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/observations/:observationId/transitions` | acteur | 404 | 403 | admis | 403 | 403 | 403 | 403 | 403 forbidden | corriger : le responsable (éditeur) avec le droit d'écrire, seul |
| `POST /studies/:studyId/variants/:variantId/observations/:observationId/liens` | acteur | 404 | 403 | admis | 403 | admis | admis | admis | 201 | droit d'écrire et auteur (propriétaire), responsable (éditeur) ou propriétaire |
| `POST /studies/:studyId/variants/:variantId/observations/:observationId/taches` | acteur | 404 | 403 | admis | 403 | admis | admis | admis | 201 | propriétaire, ou responsable (éditeur) avec le droit d'écrire |
| `POST /studies/:studyId/variants/:variantId/observations/:observationId/taches/:taskId/transitions` | acteur | 404 | 403 | admis | 403 | admis | admis | admis | 200 | terminer : personne chargée (éditeur) avec le droit d'écrire, ou propriétaire |
| `POST /studies/:studyId/variants/:variantId/observations/:observationId/decisions` | acteur | 404 | 403 | admis | admis | admis | admis | admis | 201 | proposition : droit d'écrire (rôle ; le verrou d'édition ne s'y applique pas) |
| `GET /dossiers` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/sheets` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/sheets` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 |  |
| `PATCH /studies/:studyId/sheets/:sheetId` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `DELETE /studies/:studyId/sheets/:sheetId` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `GET /studies/:studyId/sheets/:sheetId/files/:format` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/dossiers` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/dossiers` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 |  |
| `GET /studies/:studyId/dossiers/:dossierId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `PATCH /studies/:studyId/dossiers/:dossierId` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `GET /studies/:studyId/dossiers/:dossierId/files/:format` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |

« (à arbitrer) » : cellule exécutée et épinglée telle que le serveur répond aujourd'hui, sans changement de
comportement ; la règle attend une décision du maître d'ouvrage.

## Routes hors Studio touchant des données Studio — non couvertes par la matrice (suites DB-3)

Leurs droits sont ceux de leur routeur (propriétaire ou membre du projet), contrôlés par leurs propres suites sur base
réelle ; la liste des fichiers est vérifiée par ce test (tout nouveau fichier de `routes/` citant Studio la fait échouer).

| Fichier | Routes | Données Studio |
|---|---|---|
| `routes/examples.ts` | POST /examples/:exampleId/import | étude exemple Studio du P.118 installée après l'import validé (`lib/studio-exemple.ts`, contrat de commandes ; un échec n'annule pas l'import) |
| `routes/documents.ts` | GET /projects/:projectId/documents | `studioPackages` (paquets diffusés ou retirés), `studioDossiers` (dossiers de conception) |
| `routes/notifications.ts` | GET /notifications | commentaires Studio des projets du compte, passages des observations, tâches et décisions |
| `routes/projects.ts` | GET /projects/:projectId/archive, POST /projects/import, POST /projects/:projectId/copies, DELETE /projects/:projectId | section Studio de l'archive (export, import validé), copie sans Studio, suppression refusée si une publication est diffusée ou retirée |
