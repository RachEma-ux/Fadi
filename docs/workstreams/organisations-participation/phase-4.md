# Phase 4 — Revue externe : compte rendu

> Issue #262, [PLAN.md](PLAN.md) phase 4 (tâches 1 à 7) ; concept normatif `docs/workstreams/users-management/concept.md`,
> partie 4 et v2.2. Décisions appliquées : OP-D5 (a), OP-D6 (a), OP-D7 (a), OP-D8 (a), OP-D12 (révisée OP-2).
> Audit préalable 4.0 : suivi (scratchpad du chef de projet, `audit-4-0.md`). État : **Implémenté**, vérifié localement
> (preuves ci-dessous) ; **non accepté** (point d'arrêt 4 : démonstration au maître d'ouvrage). Aucun déploiement.

## 1. Livré

| Tâche | Réalisation |
| --- | --- |
| 1. Audit 4.0 | Suivi : la publication Studio ne fige des octets qu'à la diffusion et `actualiser` réécrit son manifeste sur place → le paquet **copie** au partage le manifeste, son empreinte, la révision, l'empreinte du document et **régénère les fichiers** depuis la révision immuable, vérifiés empreinte par empreinte contre le manifeste (`frozenPublicationFiles`), rangés dans `volumes`. Constats sur un lien propre (`review_findings`), pas sur `studio_observation_links` (unicité `revue` par variante). |
| 2. Paquet | Table `review_packages` : projet, publication candidate (OP-D5 a), étude, variante, lignée + version + paquet remplacé, titre, motif, réponse attendue, questions, coordinateur, responsable interne des corrections, échéance, statut `brouillon → partage → clos / remplace`, copie figée (révision, empreinte, manifeste, empreinte du manifeste, fichiers), clôture, remplacement. Déclencheurs : **gel** d'un paquet partagé (seuls statut, clôture, remplacement, échéance, coordinateur et responsable changent), **transitions** contrôlées, **anti-suppression** (un paquet partagé ne s'efface pas ; la route de suppression du projet le refuse, 409 `revues_partagees`). |
| 3. Destinataires | Table `review_assignments` : participation (fiche contact créée pour l'adresse, ou participation existante), personne, compte (connu à l'acceptation), responsabilité `relecture` / `approbation` (OP-D7 a), permissions `can_view` (toujours), `can_comment` (défaut oui), `can_attach` / `can_download` / `can_export` (défaut non, OP-D8 a), expiration d'accès (30 jours par défaut, ≤ 365), invitation, statut `en-attente / en-cours / terminee / annulee / remplacee`, résultat `constats / satisfaisante` (relecture seule), révocation. Finalité d'invitation `review_package` (colonne `auth.invitations.review_assignment_id`, règle `invitations_review_check`) ajoutée **dans le bloc unique des finalités** de la phase 5 (détection étendue, index d'unicité en attente étendu à l'affectation). |
| 4. Accès borné | Garde unique `loadReviewAccess(packageId, userId)` (`lib/reviews-core.ts`), revérifiée à chaque requête : affectation acceptée par CE compte, ni révoquée, ni annulée, ni expirée ; participation active ; compte actif ; paquet partagé (clos ou remplacé : consultation de l'historique seulement). Jamais `loadProjectAccess`, jamais un rôle de projet : la participation d'un destinataire externe ne porte **aucun** rôle → `project_effective_access` (phase 2) ne lui ouvre rien. Refus = 404 sans rien révéler. |
| 5. Espace de revue | Page `/revues` et `/revues/:id` (hors module projet, entrée « Revues externes » de la barre latérale) : identité, objet, échéance (retard affiché, « une échéance dépassée ne vaut pas accord »), actions permises, statut du paquet, **statut enregistré par Studio**, révision et manifeste examinés, documents figés (empreintes ; SVG/PDF consultables en ligne, téléchargement si accordé), constats (document, repère, objets, révision exacte, pièces jointes si accordées), fils de réponses, recontrôle, réponse de relecture, décision de l'approbateur nommé, rapport exporté si accordé. Notes internes jamais servies. |
| 6. Boucle de correction | Constat = observation Studio d'audience **`revue`** (OP-D6 a) rattachée au paquet (`studio_comments.review_package_id`), responsable = responsable interne des corrections ; l'équipe corrige par les transitions Studio existantes (corriger sur une révision), répond dans le fil (réponse lue par les destinataires) ; **nouvelle version** de paquet (brouillon puis partage) qui exige un manifeste différent, remplace l'ancienne (affectations `remplacee` puis reconduites, identités vérifiées sans nouvelle invitation) ; **recontrôle** par l'auteur du constat sur la version qui contient la correction (`recontroler` Studio ; sinon 409 `correction_not_in_package`) ou maintien (`rouvrir`) ; **approbation** par un approbateur nommé via `decideStudioPublicationByReview` → mêmes `appliquerTransition` / `controlerTransition` / `controlerEnsembleExamine` / journal que Studio (aucun statut concurrent) ; **diffusion** séparée, jamais ouverte à la revue. |
| 7. Côté équipe | Panneau « Revues externes » (`modules/collaboration/RevuesExternes.tsx`, Collaboration) : préparation depuis une publication candidate, **aperçu de l'accès résultant** avant l'invitation, partage, liens à transmettre quand le courriel ne part pas, suivi par paquet (destinataires, réponses reçues, constats ouverts, décision bloquée et son motif, retards, « Approuvé (Studio) » seulement si Studio l'a enregistré), destinataires (coordonnées aux seuls responsables, OP-D9), révocation, constats et réponses, notes internes, versions. |

Autres : source **« revue »** dans `GET /notifications` (paquets partagés, réponses des autres dans les fils de vos constats,
passages de vos constats, réponses reçues par le coordinateur ; aucun extrait de l'équipe) ; journal **`review.*`** (15
actions, cible = projet, `metadata.projectId`, aucune adresse) visible dans l'historique du projet par préfixe, libellés
et traductions ; gabarit de courriel d'invitation de revue (FR/EN) ; références `review_packages.files` et
`review_findings.attachments` déclarées au ramasse-miettes des volumes ; les fils `revue` sortent toujours de l'archive
d'un projet ; l'audience d'un fil `revue` ne change pas (409 `audience_revue`) ; une réponse de l'équipe à un constat par
Studio suit le paquet.

## 2. Contrats publics

### Routes

Équipe (`/projects/:projectId/reviews`, suivre : propriétaire, éditeur ou responsable ; expédier : propriétaire ou responsable) :
`GET /` · `POST /` · `GET|PATCH|DELETE /:packageId` · `POST /:packageId/assignments/preview` · `POST /:packageId/assignments` ·
`POST /:packageId/assignments/:id/revoke|resend` · `POST /:packageId/share|versions|close|notes` ·
`POST /:packageId/findings/:id/replies` · `GET /:packageId/findings/:id/attachments/:sha256`.

Destinataire (`/reviews`, garde `loadReviewAccess`) : `GET /` · `GET /:packageId` · `GET /:packageId/files/:format[?download=1]`
(en-têtes : `nosniff`, CSP `sandbox`, `no-store`, `X-Content-SHA256`, `X-Review-Purpose`, `X-Review-Package-Status|Version`) ·
`GET /:packageId/report` · `POST /:packageId/findings` (corps ≤ 16 Mo pour les pièces jointes) ·
`POST /:packageId/findings/:id/replies|recheck` · `GET /:packageId/findings/:id/attachments/:sha256` ·
`POST /:packageId/response` · `POST /:packageId/approve|refuse`.

Invitations : `POST /auth/invitations/accept` et `POST /auth/activate` renvoient `reviewPackageId` ; `lookup` décrit
`invitation.reviewPackage` ; nouveau refus `identity_conflict` (fiche déjà liée à un autre compte).

### Tables

`review_packages`, `review_assignments`, `review_findings`, `review_package_notes` ; colonnes `studio_comments.review_package_id`
(audience `revue`), `auth.invitations.review_assignment_id`.

### Fonctions exportées

- `lib/review-rules.ts` (pur) : `PACKAGE_TRANSITIONS`, `ASSIGNMENT_TRANSITIONS`, `DEFAULT_REVIEW_PERMISSIONS`, `permissionsOf`,
  `reviewAccessRefusal`, `reviewActions`, `decisionBlock`, `followUp`, `isOverdue`, `previewAccess`, `responseRefusal`,
  `fileDelivery`, `attachmentProblem`, `safeFileName`, `reviewMailGate`.
- `lib/reviews-core.ts` : `loadReviewAccess`, `accessiblePackageIds`, `senderAuthorized`, `createOrRenewReviewInvitation`,
  `reviewInviterStillAuthorized`, `activateReviewAssignment`, `ReviewActivationRefused`, `reviewInvitationContext`,
  `projectHasSharedReviewPackages`.
- `lib/studio-publications.ts` : `publicationReviewState`, `frozenPublicationFiles`, `decideStudioPublicationByReview`
  (le corps des transitions est extrait dans `appliquerTransition`, partagé avec la route Studio).
- `lib/reviews-recipient.ts` : `reviewNotifications` (source « revue »).

## 3. Décisions d'implémentation (au plus prudent, à relire)

1. **Partage depuis une publication « en revue » seulement** (soumise dans Studio) ; le paquet peut être partagé même si
   la tête a avancé (R03 pendant que R04 avance), mais l'approbation suit alors la règle Studio existante : refusée tant
   que le manifeste de la publication n'est pas à jour (`manifest_outdated`) — d'où la nouvelle version.
2. **Expéditeur** = propriétaire ou responsable du projet (`isProjectResponsible`) ; un éditeur sans responsabilité suit
   les revues mais n'expédie rien hors de l'équipe. Responsable des corrections = désignable comme responsable
   d'observation Studio (propriétaire ou éditeur).
3. **Invitation toujours nominative**, même pour un compte existant (l'identité visée accepte) ; fiche contact créée pour
   l'adresse (jamais de liaison par ressemblance) ; à l'acceptation, la fiche est liée au compte ; si le compte a déjà sa
   fiche, l'affectation passe sur la participation de cette fiche (créée sans rôle au besoin) ; fiche liée à un autre
   compte → `identity_conflict`, rien n'est activé (transaction annulée, refus journalisé).
4. **Visibilité des constats** : tous les destinataires valides d'une **lignée** de paquets voient ses constats (original
   et recontrôle distingués par la version). Une relecture « satisfaisante » est refusée tant que ses propres constats
   restent ouverts.
5. **Consulter / télécharger** : SVG et PDF consultables en ligne ; DXF, IFC et tout téléchargement exigent la permission.
6. **OP-D12** : en production (`NODE_ENV=production`) sans transport SMTP, toute invitation de revue est refusée (503
   `mail_required`) ; hors production, un courriel non parti (domaine réservé, transport absent) rend le lien à transmettre.
7. **Archive** : les fils `revue` et les tables de revue ne sont pas archivés (le paquet n'existerait pas dans le projet
   restauré) — limite déclarée.
8. **Raccourcis** (règle d'or) : Ctrl+Alt+Maj+1 à 5 (équipe : Préparer, Inviter, Partager, Nouvelle version, Révoquer) et
   Ctrl+Alt+Maj+, . / ; (destinataire : Nouveau constat, Envoyer, Répondre, Décider) — uniques (test).
9. Le panneau `RevuesPanel` de Communication (« Revues liées (Studio) », états Studio en lecture) est distinct du panneau
   « Revues externes » (paquets de revue) : sélecteurs et titres différents, aucun recouvrement fonctionnel.

## 4. Écarts au plan / au concept

- Délégation / réaffectation d'un destinataire absent : couverte par révocation + nouvelle affectation (les constats
  restent attribués) ; pas d'écran de « délégation » dédié.
- Exception autorisée (concept « Any authorized exception records its reason… ») : non livrée ; aucune exception possible.
- Durée d'accès par défaut 30 jours : valeur déclarée (modifiable par invitation), non fixée par le maître d'ouvrage.

## 5. Preuves (locales, base `fadi_p4`, API construite sur le port 3041)

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` ×2 (fadi_p4 et base neuve fadi_p4v) | appliqué, idempotent |
| `scripts/validation/users-…`, `participations-…`, `organisations-…`, `revues-migration-check.mjs` (base neuve) | ✅ les quatre ; revues : 38 contrôles (D-7 compris) |
| `npm run typecheck` | 0 erreur |
| `npm test` | vert hors suites DB-3 ; `node scripts/check-api-tests-db3.mjs` sur le rapport JSON : ✓ seules les suites DB-3 (dont `src/routes/reviews.test.ts`) sont refusées par la garde ; 566 tests API passés |
| `npm run build` | vert |
| `apps/web/e2e/revue-externe.mjs` | **132 contrôles, tout est vert** (API, non-fuite, navigateur, axe-core bureau et téléphone, passe anglaise) |
| `studio-publication.mjs`, `collaboration-audience.mjs`, `organisations.mjs`, `journal-activite.mjs`, `interface-anglais.mjs` | verts (régression) |

## 6. Ce qui n'a pas tourné

- Suite DB-3 `src/routes/reviews.test.ts` : jamais localement (garde DB-3, clé en CI seulement) — elle reprend le
  scénario de la recette HTTP, verte localement.
- `comptes-api.mjs` : échecs locaux sur la lecture des liens de courriel (recette conçue pour Mailpit ; ici transport
  console, renvoi lu avant d'être journalisé) — aucun changement de cette phase dans ces parcours hors branche
  `review_package` ; à confirmer en CI.
- Recette dans un vrai envoi SMTP (Mailpit) : en CI seulement.
