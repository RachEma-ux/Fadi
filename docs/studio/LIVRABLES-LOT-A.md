# Livrables du lot A — Studio

> Fichier calculé par `apps/api/src/testing/livrables-lot-a.test.ts` (REC-A-01) ; ne pas l'éditer à la main.
> `STUDIO_LIVRABLES_ECRIRE=1` le régénère. Chaque preuve est un libellé de test présent mot pour mot dans son fichier.

## Schémas versionnés

- `studio-document/1` : document persistant de chaque révision (validateur `validateStudioDocument`, contrainte `studio_revisions.document` de `init.sql`).
- `studio-document/2` : version suivante déclarée (`packages/atelier-model/src/studio/cmd/migration-document.ts`), contenu /1 plus données conservées (`conserves`) ; migrations déclarées : studio-document/1 → studio-document/2.
- `studio-effets/1` : événement d'effets d'une commande acceptée (EX-010) ; domaines dérivés : `plan-2d`, `maillage-3d`, `quantites`, `exports`, `publications`.
- États des contenus dérivés (EX-016) : `a-jour`, `a-recalculer`, `en-calcul`, `echec`, `non-applicable`.
- `studio-essai/1` (essai à portée de révision), `studio-simulation-migration/1` (rapport de migration), `studio-contexte-etude/1` (contrat d'étude, IF-001).
- Brouillon hors ligne : version 1, contrat des enveloppes enregistré avec la file (EX-049).

Preuves :

- `packages/atelier-model/src/studio/cmd/migration.test.ts` — « EX-019 : la migration déclarée documente transformation, inverse, récupération et cas impossible »
- `packages/atelier-model/src/studio/cmd/cmd.test.ts` — « EX-010 [+] : créer, modifier, supprimer — identifiants, relations, domaines dérivés, révision et origine cohérents »
- `packages/atelier-model/src/studio/cmd/cmd.test.ts` — « EX-016 [−] : ancienne image R12 présentée « à jour R13 » après échec — l'oracle rejette ce statut »
- `apps/web/src/modules/studio/hors-ligne/reprise.test.ts` — « EX-049 [−] : file d'un contrat incompatible jamais rejouée ; une enveloppe rejetée ne disparaît pas sans état explicite »

## Contrats versionnés

- Enveloppe de commandes `studio-commands/1` (contrat de l'orchestrateur commun).
- 103 contrats de route `studio-api-<nom>/<n>` (`apps/api/src/lib/studio-contrats-routes.ts`, en-tête `X-Studio-Contrat`), catalogue `docs/studio/CONTRATS-API.md`.

Preuves :

- `apps/api/src/routes/studio-contrats.test.ts` — « chaque contrat déclaré a au moins un cas ; chaque route qu'il sert a son cas »
- `apps/api/src/routes/studio-contrats.test.ts` — « studio-api-journal-revisions/1 — GET …/journal : réponse conforme, en-tête X-Studio-Contrat »

## API et adaptateurs

- 109 routes Studio sous `/projects/:projectId/studio`, chacune sous contrat ; matrice des droits `docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`.
- Essais et jobs serveur (EX-045, EX-088), contrat d'étude (IF-001), migrations de schéma (EX-091), bascule Atelier → Studio à chemin d'écriture unique (MIG-COEX-06).
- Adaptateurs d'échange : exports SVG, DXF, IFC ; imports DXF, IFC (matrice d'échanges `packages/atelier-model/src/studio/echanges/matrice-echanges.ts`).

Preuves :

- `apps/api/src/routes/studio-permissions.test.ts` — « chaque route déclarée par les routeurs Studio figure dans la matrice, et réciproquement »
- `apps/api/src/routes/studio-cmd.test.ts` — « EX-045 [+] : prévisualisation sur R1 sans mutation permanente, puis confirmation sur base valide (journal relié au job) »
- `apps/api/src/routes/studio-cmd.test.ts` — « MIG-COEX-06 : préparée, l'étude n'écrit pas ; basculée, elle écrit ; retour arrière, elle n'écrit plus — lecture toujours ouverte »
- `apps/web/e2e/studio-cmd.mjs` — « MIG-COEX-06 : basculé — l'Atelier refuse toute écriture (chemin_ecriture) mais reste consultable ; Studio écrit ; point de retour figé »

## Éditeurs

- Planche 2D et vue 3D d'une même variante : la vue 3D affiche sa révision source serveur, son état dérivé et les données périmées (EX-051, INV-006) ; même révision dans les deux planches (INV-002).
- Trace horodatée d'un geste : intention → commande → mutation canonique → scène invalidée (EX-008).

Preuves :

- `apps/web/src/modules/studio/vue3d/etat-projection.test.ts` — « EX-051 [+] : après la commande R13, la scène affiche sa révision source et les données périmées, puis se recalcule »
- `apps/web/e2e/studio-cmd.mjs` — « INV-002 : même révision serveur affichée par la planche 2D (barre d'état) et par la vue 3D »
- `apps/web/e2e/studio-cmd.mjs` — « EX-008 : un seul geste horodaté — intention → commande → mutation canonique → scène invalidée, dans cet ordre »

## Journal

- `studio_revision_events` : un événement par révision engagée, écrit dans la même transaction (eventId, transaction applicative et PostgreSQL, auteur, étude, variante, révisions de base et d'issue, effets, horodatage du serveur, job éventuel) ; notification temps réel après l'engagement seulement (IF-011).

Preuves :

- `apps/api/src/routes/studio-cmd.test.ts` — « IF-011 [+] : après engagement durable, l'événement garde eventId, transaction, auteur, étude, variante, base, issue, effets, horodatage serveur »
- `apps/api/src/routes/studio-cmd.test.ts` — « IF-011 [−] : transaction échouée — aucun événement, aucune révision, aucune notification ; la notification suit l'engagement »

## Corpus de migration (P-12)

- 72 documents `studio-document/1` du dépôt : corpus S1 1, corpus S2 1, corpus S3 1, corpus S4 1, corpus S5 1, corpus S7 1, exemple P.118 6, fixtures 60.
- Migrés vers `studio-document/2` : 72 ; refusés explicitement (source rendue intacte) : 0 ; aller-retour exact : 72.
- Avec données inconnues ajoutées : 72 documents, 215 données conservées, 215 rapportées au retour arrière, 72 récupérations exactes.

Preuves :

- `packages/atelier-model/src/studio/cmd/migration.test.ts` — « REC-A-01 : tout le corpus studio-document/1 du dépôt migré vers /2, aller-retour exact, données inconnues conservées et rapportées »
- `packages/atelier-model/src/studio/cmd/migration.test.ts` — « EX-091 [+] : simulation compare identifiants, propriétés, cotes, associations, historique et accès avant / après — sans perte »
