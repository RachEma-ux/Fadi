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
| `PATCH /studies/:studyId/workflow` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 | phase déclarée du workflow (REF-01 §06) : propriétaire ou éditeur ; aucune donnée de conception modifiée |
| `POST /exemple` | proprietaire | 404 | 403 | 403 | 403 | admis | admis | admis | 409 exemple_indisponible | étude exemple P.118 : écriture système du propriétaire, admise dans la référence protégée ; projet hors exemple → 409 exemple_indisponible avant tout verrou ; le verrou d'édition d'un autre compte (423) ne s'oppose qu'à une installation qui écrit, jamais à la lecture d'une étude exemple complète (lib/studio-exemple.test.ts) |
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
| `PATCH /studies/:studyId/variants/:variantId/comments/:commentId` | acteur | 404 | 403 | admis | 403 | admis | admis | admis | 200 | audience du fil (écart E1) : son auteur (c1 : éditeur) ou le propriétaire, tous deux de l'équipe ; le verrou d'édition ne s'y applique pas |
| `POST /studies/:studyId/variants/:variantId/comments/:commentId/observation` | acteur | 404 | 403 | admis | 403 | admis | admis | admis | 201 | auteur du commentaire (c1 : éditeur) ou propriétaire |
| `POST /studies/:studyId/variants/:variantId/comments/:commentId/observation/transitions` | acteur | 404 | 403 | admis | 403 | 403 | 403 | 403 | 403 forbidden | corriger : le responsable (éditeur) avec le droit d'écrire, seul |
| `GET /studies/:studyId/steps` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `PUT /studies/:studyId/steps` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `GET /steps/:stepNumber/studies` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /preferences/outils` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | préférences du compte : aucune écriture du projet |
| `PUT /preferences/outils` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | préférences du compte (INV-009) : lecture du projet suffit |
| `GET /preferences/catalogue` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /publications` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /delegations` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | délégations d'approbation (EX-085) : toutes pour le propriétaire, sinon celles dont on est délégant ou délégué |
| `POST /delegations` | proprietaire | 404 | 403 | 403 | 403 | admis | admis | admis | 201 | délégation d'approbation (EX-085) : qui détient le droit d'approuver sur la portée ; elle ne modifie aucun contenu, la réservation d'édition ne s'y oppose pas (elle s'oppose à son emploi) |
| `POST /delegations/:delegationId/revoquer` | acteur | 404 | 403 | 403 | 403 | admis | admis | admis | 200 | révocation motivée : le délégant (propriétaire) ou le propriétaire du projet ; le délégué ne révoque pas |
| `GET /studies/:studyId/publications` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/publications` | ecriture | 404 | 403 | admis | 423 | admis | 423 | admis | 201 |  |
| `GET /studies/:studyId/publications/:publicationId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/publications/:publicationId/verification` | lecture | 404 | admis | admis | admis | admis | admis | admis | 404 not_found |  |
| `GET /studies/:studyId/publications/:publicationId/files/:format` | lecture | 404 | admis | admis | admis | admis | admis | admis | 404 not_found |  |
| `GET /studies/:studyId/publications/:publicationId/controle-approbation` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 200 | aperçu de l'auto-contrôle (OP-6) : même accès que l'approbation (rôle, puis réservation d'édition d'un autre compte) ; lecture seule |
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
| `POST /studies/:studyId/exigences/acceptations` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | 403 réf. | 409 version_perimee | X.2-02 (ADR-STUDIO-PILOTE-01 P-12) : propriétaire seul ; refusée sous le verrou d'édition d'un autre compte (423) et sur le projet de référence protégé (403 réf.) |
| `GET /studies/:studyId/variants/:variantId/controles` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/controles/:checkId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/controles` | ecriture | 404 | 403 | admis | 423 | admis | 423 | admis | 201 |  |
| `GET /studies/:studyId/variants/:variantId/ajustements-quantites` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/ajustements-quantites` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 |  |
| `GET /studies/:studyId/variants/:variantId/observations` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/observations` | commentaire | 404 | admis | admis | admis | admis | admis | admis | 201 |  |
| `GET /studies/:studyId/variants/:variantId/observations/:observationId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/observations/rapprochements` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | rapprochements consignés (EX-086), audience du fil respectée |
| `POST /studies/:studyId/variants/:variantId/observations/rapprochements` | ecriture | 404 | 403 | admis | 423 | admis | 423 | admis | 200 | rapprochement sur demande avec la tête (EX-086) : propriétaire ou éditeur ; aucun statut d'observation modifié |
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
| `GET /studies/:studyId/variants/:variantId/modeles-externes` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/modeles-externes` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 | fichier relu et comparé par le serveur ; la variante n'est pas modifiée |
| `GET /studies/:studyId/variants/:variantId/modeles-externes/:modelId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/modeles-externes/:modelId/contenu` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | fichier reçu tel quel : droit export (lecteur compris, jamais l'accès support) |
| `POST /studies/:studyId/variants/:variantId/modeles-externes/:modelId/:action` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 | action comparer |
| `POST /studies/:studyId/variants/:variantId/modeles-externes/:modelId/:action` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 200 | action accepter |
| `POST /studies/:studyId/variants/:variantId/modeles-externes/:modelId/:action` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 200 | action refuser |
| `GET /studies/:studyId/variants/:variantId/illustrations/fournisseurs` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/variants/:variantId/illustrations` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/illustrations` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 | image séparée tirée du rendu ; aucune révision écrite, le modèle n'est pas modifié |
| `GET /studies/:studyId/variants/:variantId/illustrations/:illustrationId/image` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | téléchargement : droit d'export exigé (lecteur sans export et accès support refusés) |
| `GET /agents/jetons` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | jetons du compte seulement |
| `POST /agents/jetons` | lecture | 404 | admis | admis | admis | admis | admis | admis | 201 | tout membre : l'agent n'a que les droits de son titulaire, revérifiés à chaque appel |
| `POST /agents/jetons/:tokenId/revoquer` | acteur | 404 | admis | admis | admis | admis | admis | admis | 200 | titulaire du jeton seulement ; un autre compte : 404 |
| `GET /agents/propositions` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | propositions du compte seulement |
| `POST /agents/propositions/:proposalId/confirmer` | acteur | 404 | admis | admis | admis | admis | admis | admis | 200 | titulaire seulement (un autre compte : 404) ; l'écriture passe par le point d'entrée commun (droits, verrou, référence) |
| `POST /agents/propositions/:proposalId/refuser` | acteur | 404 | admis | admis | admis | admis | admis | admis | 200 | titulaire seulement ; un autre compte : 404 |
| `GET /agents/journal` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | journal du compte seulement |
| `GET /extensions` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /extensions/evaluer` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | évaluation sans écriture ni chargement |
| `GET /studies/:studyId/contexte` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/variants/:variantId/essais` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 | essai à portée de révision : aucune révision écrite |
| `POST /studies/:studyId/variants/:variantId/essais/:jobId/abandon` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 |  |
| `POST /studies/:studyId/variants/:variantId/essais/:jobId/confirmer` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 200 | l'enveloppe de l'essai passe par le point d'entrée des écritures |
| `GET /jobs/:jobId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 | résultat de job sous l'autorisation de l'étude source |
| `GET /studies/:studyId/variants/:variantId/journal` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/migrations` | modification | 404 | 403 | admis | 423 | admis | 423 | 403 réf. | 201 | simulation : rien n'est écrit dans les révisions |
| `GET /studies/:studyId/migrations` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /studies/:studyId/migrations/:migrationId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /studies/:studyId/migrations/:migrationId/accorder` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 200 | procédure d’accord : propriétaire seul, la réservation d’édition d’un autre compte s’y oppose |
| `POST /studies/:studyId/migrations/:migrationId/appliquer` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 migration_etat |  |
| `POST /studies/:studyId/migrations/:migrationId/retour-arriere` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 migration_etat |  |
| `GET /studies/:studyId/migrations/:migrationId/documents/:revisionId` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `GET /bascule` | lecture | 404 | admis | admis | admis | admis | admis | admis | 200 |  |
| `POST /bascule/preparer` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 200 | bascule Atelier → Studio : une seule chaîne d'écriture |
| `POST /bascule/basculer` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 bascule_absente |  |
| `POST /bascule/retour-arriere` | proprietaire | 404 | 403 | 403 | 403 | admis | 423 | admis | 409 bascule_absente |  |

Aucune cellule « à arbitrer » : la dernière (acceptation des exigences) est tranchée par X.2-02, ADR-STUDIO-PILOTE-01 P-12.

## Routes hors Studio touchant des données Studio — non couvertes par la matrice (suites DB-3)

Leurs droits sont ceux de leur routeur (propriétaire ou membre du projet), contrôlés par leurs propres suites sur base
réelle ; la liste des fichiers est vérifiée par ce test (tout nouveau fichier de `routes/` citant Studio la fait échouer).

| Fichier | Routes | Données Studio |
|---|---|---|
| `routes/auth.ts` | GET /auth/me/export | commentaires Studio rédigés par le compte, dans l'export de ses données personnelles (D-5, gestion des comptes) — lecture de ses propres lignes seulement |
| `routes/examples.ts` | POST /examples/:exampleId/import | étude exemple Studio du P.118 installée après l'import validé (`lib/studio-exemple.ts`, contrat de commandes ; un échec n'annule pas l'import) |
| `routes/com.ts` | POST /projects/:projectId/com/messages/:messageId/actions (type observation-studio) ; GET /projects/:projectId/com/plan ; POST …/com/conversations/:conversationId/messages (épingle) ; GET …/com/activite, …/com/revues | observation Studio ouverte depuis un message par `openStudioObservation` (mêmes droits et refus que la route Studio d'ouverture directe, révision et objets de l'épingle repris) ; plan SVG et validation d'une épingle par `readStudioContext` (droit `read` de Studio) ; activité et revues relues sans écriture. La Communication ne garde que des liens (COM-R7, Issue #280, lot COM-13) |
| `routes/documents.ts` | GET /projects/:projectId/documents | `studioPackages` (paquets diffusés ou retirés), `studioDossiers` (dossiers de conception) |
| `routes/notifications.ts` | GET /notifications | commentaires Studio des projets du compte, passages des observations, tâches et décisions |
| `routes/reviews.ts` | /reviews/* (destinataire), /projects/:projectId/reviews/* (équipe) | revue externe (phase 4) : publication Studio candidate figée dans un paquet, constats = observations Studio d'audience `revue`, approbation par un approbateur nommé via les transitions Studio — garde `loadReviewAccess` (destinataire) ou droits de l'équipe, jamais la matrice des rôles Studio |
| `routes/mcp-studio.ts` | POST /mcp/studio (serveur MCP, lot F) | lectures de Studio et propositions d'agent par jeton d'agent (jamais la session) : mêmes droits du compte titulaire (`readStudioContext`, `modify`), aucune écriture de révision avant la confirmation humaine par `POST /agents/propositions/:proposalId/confirmer` (matrice ci-dessus) ; `routes/studio-agents.test.ts` |
| `routes/projects.ts` | GET /projects/:projectId/archive, POST /projects/import, POST /projects/:projectId/copies, DELETE /projects/:projectId | section Studio de l'archive (export, import validé), copie sans Studio, suppression refusée si une publication est diffusée ou retirée |
