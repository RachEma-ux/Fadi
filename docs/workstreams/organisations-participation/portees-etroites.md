# Portées étroites des rôles — évaluation route par route et compte rendu

> Issue #262, reliquat de la phase 2 ([phase-2.md](phase-2.md) § 2.3 et § 6 : « évaluer les portées étroites route par
> route avant de leur donner un droit »). Concept normatif : `docs/workstreams/users-management/concept.md`, partie 2
> (« Action and scope assignments », « Effective access rules »). État : **Implémenté**, vérifié localement (preuves
> § 6) ; **non accepté**. Aucun déploiement.

## 1. Règle directrice (appliquée et testée)

1. Une portée étroite (`etude`, `variante`, `revision`, `documents`) **n'ouvre jamais le projet**. La décision d'accès
   reste la seule vue `project_effective_access` (inchangée) : sans rôle de portée `projet` porté par une participation
   active et commencée, le compte reste en **404 partout** (projet, liste des projets, Studio, Documents, participants).
2. Pour un participant qui **lit déjà** le projet, une portée étroite **ajoute** la capacité de son rôle, **sur la seule
   ressource visée**, relue en base par la route avant le contrôle (jamais lue du corps de la requête).
3. Tout le reste de la garde s'applique à la capacité ajoutée : réservation d'édition d'un autre compte (423), référence
   protégée de l'exemple (403 `reference-protegee`), archive (409). L'accès support n'en reçoit jamais.
4. Sans `cible` (routes non retenues), rien ne change : les rôles de portée projet gardent exactement leurs droits.

## 2. Capacités ajoutées (choix déclarés, au plus prudent)

Matrice pure `CAPACITES_PORTEE` (`packages/domain-model/src/portees.ts`), partagée par le serveur et l'interface.

| Rôle \ portée | `etude:X` | `variante:V` | `revision:R` | `documents:D` |
| --- | --- | --- | --- | --- |
| Lecteur | — | — | — | télécharger D |
| Concepteur | modifier dans X | modifier V (contenu seul) | — (révision immuable) | télécharger D |
| Relecteur | constater dans X | constater dans V | constater (observations ancrées sur R) | télécharger D |
| Coordinateur | — | — | — | télécharger D |
| Approbateur | approuver / refuser les dossiers de X | … de V seule | … du dossier de R seul | télécharger D |
| Diffuseur | diffuser / retirer les dossiers de X | … de V seule | … du dossier de R seul | télécharger D |

- **modifier** = besoins `write` / `modify` ; **approuver** = `approve` ; **diffuser** = `publish` ; **télécharger** =
  `export` ; **constater** = recontrôler et rouvrir une observation Studio (un lecteur du projet ouvre déjà des
  observations : il commente). Lire, commenter et posséder ne sont **jamais** ouverts par une portée étroite.
- **Périmètres** (`couvre`) : `etude:X` couvre tout ce qui appartient à X ; `variante:V` ne couvre que ce qui porte sur V
  **seule** (un dossier coordonné V + W, un dossier d'étude multi-variantes, une nouvelle variante n'en sont pas) ;
  `revision:R` ne couvre qu'un dossier de R sans variante coordonnée, ou une observation ancrée sur R ; `documents:D` :
  D = une **famille** du catalogue Documents (`tableaux`, `atelier`, `dessins`, `studio`, `studio-dossier`, `harmonie`,
  `bilan`, `exemple`) ou un **document** identifié par son `kind` (`tableau-surfaces`, `atelier-ifc`, `dessin:<id>`,
  `studio:<publication>`, `studio-dossier:<dossier>`…). L'archive du projet entier n'est jamais désignable.
- **Coordinateur étroit** : aucune capacité ; « responsable du projet » (`isProjectResponsible`) reste de portée projet.
- **Lecteur étroit** hors documents : aucune capacité (il lit déjà tout le projet).
- **Concepteur de l'étude** : écrit le contenu de X (commandes, métré, feuilles, dossiers de conception, préparation et
  soumission des dossiers de publication, nouvelles variantes et dérivations dans X, renommage de X et de ses variantes,
  phase déclarée du workflow) ; **n'archive ni ne désarchive** X ni ses variantes (`canManage` reste au rôle de projet),
  ne crée pas d'étude, ne rattache pas d'étapes du Parcours, n'édite pas les exigences, n'exporte pas.
- **Concepteur de la variante** : commandes et métré de V, dossier de publication de V seule ; ni renommage, ni
  dérivation (nouvelle variante hors périmètre), ni feuilles et dossiers d'étude.

## 3. Évaluation route par route

Légende : **retenue** = la garde passe une `cible` et la capacité de portée s'applique ; **non applicable** = motif.

### Studio (`/projects/:id/studio`, `routes/studio*.ts`, `lib/studio-*.ts`)

| Route | Besoin actuel | Portée applicable | Décision |
| --- | --- | --- | --- |
| `GET /studies`, `GET /studies/:s`, `…/variants`, `…/revisions`, `…/compare`, contextes et changements | read | — | Non applicable : lecture déjà ouverte à tout lecteur ; `canWrite` de l'étude et de la variante tient compte de la portée (interface). |
| `POST /studies` | modify | — | Non applicable : une étude nouvelle n'appartient à aucune portée existante. |
| `PATCH /studies/:s`, `PATCH /studies/:s/workflow` | modify | etude | **Retenue** (contenu de l'étude). |
| `POST /studies/:s/archive\|unarchive`, `…/variants/:v/archive\|unarchive` | modify | — | Non retenue : administration de l'étude, rôle de projet (`canManage`). |
| `PATCH /studies/:s/variants/:v` | modify | etude | **Retenue** (Concepteur de l'étude) ; non pour la portée variante (gestion). |
| `POST /studies/:s/variants` (nouvelle, dérivée) | modify | etude | **Retenue** ; la portée variante ne couvre pas une variante nouvelle. |
| `POST …/variants/:v/commands` | modify | etude, variante | **Retenue.** |
| `GET …/variants/:v/export`, `…/export/rapport` | export / read | — | Non retenue : export de travail d'une variante, hors catalogue Documents ; droit `export` du projet. |
| `GET\|POST\|PATCH\|DELETE …/comments` | read / comment / auteur | — | Non applicable : tout lecteur commente déjà ; l'audience `equipe` n'est jamais levée par une portée. |
| `POST …/comments/:c/observation` | comment | — | Non applicable : déjà ouvert à tout lecteur (auteur ou propriétaire). |
| `POST …/observation/transitions`, `…/observations/:o/transitions` | comment + acteur | etude, variante, revision (Relecteur) | **Retenue** pour `recontroler` et `rouvrir` (capacité `constater`) ; `corriger` (responsable éditeur), `cloturer` et `reattribuer` (propriétaire) inchangés. Passages proposés (`possibles`) calculés de même. |
| `GET\|POST …/observations`, liens, tâches, décisions | read / comment / write / owner | — | Non retenue : liens, tâches et décisions suivent les rôles de projet (éditeur propose, propriétaire décide). |
| `GET /publications`, `GET /studies/:s/publications`, détail, vérification | read | — | Non applicable (lecture) ; `allowed` (transitions permises) tient compte de la portée. |
| `POST …/variants/:v/publications` | write | etude, variante | **Retenue** ; variantes coordonnées demandées comprises dans la cible (elles ne font que restreindre). |
| `POST …/publications/:p/soumettre\|actualiser` | write | etude, variante | **Retenue** (Concepteur). |
| `POST …/publications/:p/approuver\|refuser` | approve | etude, variante, revision | **Retenue** (Approbateur). |
| `POST …/publications/:p/diffuser\|retirer` | publish | etude, variante, revision | **Retenue** (Diffuseur). |
| `GET …/publications/:p/files/:format` | export | documents (`studio`, `studio:<p>`) | **Retenue.** |
| Exigences (`…/exigences`, acceptations, contrôles) | modify / owner / write | — | Non retenue : cahier de l'étude, non un contenu de conception ; rôle de projet. |
| Métré (`…/quantites` GET / POST) | read / modify | etude, variante | **Retenue** (écriture des ajustements ; `peutAjuster`). |
| Feuilles (`…/variants/:v/sheets`, `sheets/:id` PATCH / DELETE) | modify | etude | **Retenue** pour la portée étude (une feuille entre dans un dossier d'étude). |
| Dossiers de conception (`…/dossiers` POST / PATCH) | modify | etude | **Retenue.** |
| `GET …/sheets/:id/files/:f` | export | — | Non retenue : fichier de travail, hors catalogue Documents. |
| `GET …/dossiers/:d/files/:f` | export | documents (`studio-dossier`, `studio-dossier:<d>`) | **Retenue.** |
| `POST /exemple`, `PUT /studies/:s/steps`, préférences | owner / modify / compte | — | Non applicable : installation par le propriétaire, lien inter-modules, préférences personnelles. |

### Documents (`/projects/:id/documents`, rapports produits ailleurs)

| Route | Besoin actuel | Portée applicable | Décision |
| --- | --- | --- | --- |
| `GET /documents` (catalogue) | read | — | Non applicable (lecture). |
| `GET /plan/:niveau`, `/surfaces`, `/programme`, `/fiches`, `/dossier-exemple` | export | documents (famille ou `kind`) | **Retenue.** |
| `GET /atelier/modele.ifc`, `/atelier/quantites.html`, `/atelier/pid.svg`, `/atelier/:dossier/:fichier` | export | documents (`atelier`, `atelier-…`) | **Retenue.** |
| `GET /dessins/:id` | export | documents (`dessins`, `dessin:<id>`) | **Retenue.** |
| `POST /dessins`, `DELETE /dessins/:id` | write | — | Non retenue : écriture du catalogue, rôle de projet. |
| `GET /steps/harmonie/rapport`, `/steps/:n/harmonie/rapport` | export | documents (`harmonie`, `harmonie-…`) | **Retenue.** |
| `GET /design-review/rapport` | export | documents (`bilan`, `bilan-batiment`) | **Retenue.** |
| `GET /archive` | export | — | Non retenue : export du projet entier ; une portée documents ne l'ouvre jamais (refusé à l'attribution). |

### Atelier (`/projects/:id/atelier`, `routes/atelier-*.ts`)

| Routeur | Besoin actuel | Décision |
| --- | --- | --- |
| `atelier-commands.ts` (modèle, commandes, annuler / rétablir, essais, imports IFC / STEP / nuages) | read / modify | Non applicable : le modèle Atelier est **un modèle unique du projet**, sans étude ni variante Studio ; une écriture partielle d'un périmètre n'existe pas (une commande peut toucher tout le modèle). |
| `atelier-commands.ts` exports (`planches/:id/export.ifc`, `solides-exacts/:id/export.step`, `journal.csv`) | export | Non retenue : exports de travail hors catalogue Documents ; les documents Atelier du catalogue sont couverts par la famille `atelier` (Documents). |
| `atelier-versions.ts` (versions nommées, variantes Atelier, fusion, publications Atelier, verrous, reprise, références externes) | read / write / modify | Non applicable : les « variantes » de l'Atelier sont des branches du modèle unique, distinctes des variantes Studio (identifiants différents, la portée `variante` désigne une variante Studio) ; leur fusion écrit le modèle partagé ; les publications Atelier n'ont pas de cycle d'approbation. |
| `atelier-automatisation.ts` (scripts, graphes, assistant) | read / write / modify | Non applicable : agit sur le modèle unique ; accord par les rôles de projet. |

## 4. Livré

| Livrable | Réalisation |
| --- | --- |
| Règle pure | `packages/domain-model/src/portees.ts` : `capaciteDansPortee`, `couvre`, `capacitesDePortee`, `CAPACITES_PORTEE`, `CAPACITE_DU_BESOIN`, `familleDocument`, `cibleDocument`, `problemeIdentifiantPortee`, `FAMILLES_DOCUMENTS` (exportés par `@parcours/domain-model`) ; tests `portees.test.ts` (8). |
| Garde serveur | `lib/owned-project.ts` : `AccessibleProject.portees` (attributions étroites de la participation active et commencée, lues dans la même requête que la vue, seulement retenues quand la vue ouvre le projet) ; `porteeAllows` ; `projectAccessRefusal(…, cible?)`, `projectOr404(…, cible?)` ; `lib/studio-commands.ts` `assertAccess(…, cible?)`. Tests purs `lib/portees-acces.test.ts` (8). |
| Routes retenues | Studio : `studio-commands.ts` (commandes, nouvelles variantes, `canWrite`), `studio-variantes.ts` (renommages, workflow), `studio-publications.ts` (création, transitions, `allowed`, fichiers des paquets), `studio-commentaires.ts` + `studio-observations(.ts, -suivi.ts)` (Relecteur : `estRelecteur`, `constaterDans`), `studio-dossiers.ts` (feuilles, dossiers, fichiers de dossier), `routes/studio-quantites.ts`. Documents : `routes/documents.ts`, `routes/parcours-steps.ts` (rapports Harmonie), `routes/design-review.ts` (bilan). |
| Attribution contrôlée | `POST /projects/:id/participants/:pid/roles` : l'élément désigné doit exister dans **ce** projet (`lib/portees-db.ts`, `porteeInconnue`) → 422 `scope_rule` sinon ; la réponse porte `capacites`. |
| Interface | `modules/collaboration/PorteeElement.tsx` : sélecteur de l'élément (études ; variantes « étude — variante » ; révision = variante puis révision ; documents = familles et documents identifiés du catalogue, archive exclue), **capacité résultante** avant attribution (et « sans effet » / « cette personne ne lit pas le projet »), libellé de l'élément et capacité de chaque attribution existante ; branché dans `Participants.tsx` (formulaire des rôles et tableau). Le champ libre « Identifiant de la portée » est remplacé. Correctif CSS : un long libellé d'option n'élargit plus le formulaire sur téléphone. |
| DB-3 | Nouvelle suite `apps/api/src/routes/portees-etroites.test.ts` (5 cas) ajoutée à `DB3_PENDING_SUITES` ; cas de phase 2 de `app.test.ts` adapté (une étude inconnue est désormais refusée, 422). |
| Recette | `apps/web/e2e/portees-etroites.mjs` (nouvelle), ajoutée à `ci.yml` (tranche `complements`, après `participants.mjs`). |
| i18n | Bloc ajouté en fin de `apps/web/src/lib/i18n/en.json` (libellés, capacités, familles, refus serveur) ; deux refus d'observation mis à jour (Relecteur de portée). |
| Règle d'or | Aucune commande nouvelle : le sélecteur est un champ du formulaire « Attribuer un rôle » (commande existante, icône, barre et raccourci inchangés) ; `commandes-collaboration.test.ts` vert. |

## 5. Écarts et décisions à relire

- Concept « Downloading and exporting rights are explicit » : tout rôle à la portée `documents` donne le téléchargement
  de ces documents (y compris Lecteur) ; un Concepteur d'étude **n'exporte pas** (prudent ; à la portée projet, le
  Concepteur exporte).
- Séparation des responsabilités (« self-checking must be identified ») : non modélisée — un Relecteur de portée qui est
  aussi l'auteur recontrôle comme avant (auteur).
- Restrictions explicites et délégation : toujours hors périmètre (phase 2 § 3).
- Messages de refus 403 génériques (`FORBIDDEN_MESSAGE`) inchangés : ils citent les rôles de projet, pas la portée
  manquante (aucune fuite ; à préciser si le maître d'ouvrage le souhaite).
- Les attributions étroites enregistrées avant ce lot avec un identifiant arbitraire restent en base sans effet (aucune
  ne correspond à une ressource) ; seules les nouvelles sont contrôlées.
- Numérotation « Rnn » du sélecteur de révision : rang dans l'historique de la variante (affichage seulement).
- Pont `op_sync_access` et `routes/members.ts` (phase 3, en parallèle) : non touchés ; changements d'accès additifs
  (paramètre `cible` facultatif, champ `portees` facultatif).

## 6. Livré, preuves, limites

Exécuté le 2026-10-24, base jetable `fadi_scopes`, API construite sur le port 3061 (connexion `fadi_app`).

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` ×2 | « Schema applied » deux fois (aucun changement de schéma dans ce lot) |
| `npx vitest run src/portees.test.ts` (domain-model) | 8/8 |
| `npx vitest run src/lib/portees-acces.test.ts` (api) | 8/8 |
| `apps/web/e2e/portees-etroites.mjs` | **87 ✓, 0 ✗** (API, portée seule = 404 partout avec `DATABASE_URL`, périmètres, interface, axe-core bureau et téléphone, passe anglaise) |
| `participants.mjs`, `studio-publication.mjs`, `collaboration-audience.mjs`, `revue-externe.mjs` | 92 ✓, 129 ✓, 45 ✓, 132 ✓ — aucune régression |
| `interface-anglais.mjs`, `npm run typecheck`, `npm test`, `npm run build`, `check-api-tests-db3` | voir le compte rendu final ci-dessous |

Ce qui n'a pas tourné localement : la suite DB-3 `routes/portees-etroites.test.ts` et le cas adapté d'`app.test.ts`
(garde DB-3, en CI seulement — ils reprennent le scénario de la recette HTTP, verte localement) ; la CI GitHub (aucun push).

Limites : l'écran Studio de publication (`PanneauPublications`) reçoit le `canWrite` de l'étude — un Concepteur de la
seule **variante** prépare un dossier par l'API, pas encore par ce panneau ; les écrans Documents gardent leurs liens de
téléchargement (le serveur refuse ou sert selon la portée, comme avant pour l'export accordé).
