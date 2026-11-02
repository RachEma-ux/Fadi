# Lot OP-AUTOCONTROLE — séparation des responsabilités : compte rendu

> Issue #262. Décision du maître d'ouvrage du 2026-10-25, consignée en **OP-6** ([DECISIONS.md](DECISIONS.md)). Base :
> `main` à `a37bc69` (lot OP-PONT fusionné). Branche `lot-autocontrole`.
> État : **Implémenté**, vérifié localement (preuves § 5) ; suites DB-3 et CI **non exécutées** ici (§ 6) ; non accepté.
> Aucun déploiement.

## 1. Livré

| Livrable | Réalisation |
| --- | --- |
| Schéma | `init.sql`, bloc « Lot OP-AUTOCONTROLE » (ALTER additifs et idempotents) : `users.self_control_allowed boolean NOT NULL DEFAULT true`, `studio_publications.approved_self_control boolean` (NULL = approuvée avant le lot ou non approuvée), et `studio_publication_events.self_control boolean` (marque figée de l'évènement `approuver`, § 2.5). `schema.ts` à jour. Droits D-7 inchangés (droits par table). |
| Règle pure | `apps/api/src/lib/auto-controle.ts` (+ `auto-controle.test.ts`, 10 tests) : `perimetreRevisions`, `evaluerAutoControle` → `{ autoControle, revisionsAuteur, soumisParLui, decision: autorise \| refuse }`, `messageRefusAutoControle`. Lectures en base : `lib/auto-controle-db.ts` (`controleApprobation`, `autresApprobateurs`, `autoControleAutorise`). |
| Approbation | Un seul point d'application : `appliquerTransition` (`lib/studio-publications.ts`), commun à la route Studio et à la revue externe (`decideReview` → `decideStudioPublicationByReview`). Contrôle placé après tous les autres (statut, manifeste, ensemble examiné) : le 422 ne masque aucun autre motif. `actualiser` et la restauration d'archive non vérifiée remettent la marque à NULL avec l'approbation. |
| Administration | `PATCH /admin/users/:userId/self-control { allowed }` (admin, `refuseSelf`, compte fermé → 404, audit `admin.user.self_control_changed` `{ from, to }`) ; `userView.selfControlAllowed`. |
| Aperçu | `GET /projects/:p/studio/studies/:s/publications/:id/controle-approbation` (droit `approve` sur le dossier, portées et réservation d'édition comprises) ; `GET /reviews/:packageId/controle-approbation` (affectation d'approbation ouverte seulement ; aucun e-mail). |
| Journal | Approbation Studio : nouvelle entrée d'audit `review.approval.recorded` (`via: "studio"`, `selfControl`, `revisionsAuteur`, `soumisParLui`, `projectId`, `publicationId`) — visible dans l'historique du projet (famille `review.`). Revue externe : `review.decision.recorded` porte les mêmes clés. `SHARED_DETAIL_KEYS` : `selfControl`, `revisionsAuteur`, `soumisParLui`. Libellés « Approbation enregistrée (auto-contrôle) », « Décision d'approbation enregistrée par la revue (auto-contrôle) » (`entryActionLabel`). |
| Vues | `approvedSelfControl` sur la vue de publication, sur l'état lu par la revue (`publication.approvedSelfControl` de l'espace du destinataire) et sur le suivi d'équipe (`publication.approvedSelfControl` des paquets) ; `selfControl` sur chaque évènement du journal de publication. |
| Interface | Administration : groupe « Autorisations » de la fiche, interrupteur `role="switch"` « Auto-contrôle » (icône `auto-controle` propre, raccourci **Alt+Maj+A**, confirmation, explication) — règle d'or contrôlée par `icones-admin.test.ts`. Approbation (Studio et revue externe) : avertissement « Vous avez produit N révision(s) de ce dossier / Vous l'avez soumis : cette approbation sera marquée auto-contrôle » et **case de confirmation** exigée ; refusée : bouton « Approuver » désactivé, explication et approbateurs possibles. Marque « Auto-contrôle » sur la publication approuvée, sur l'espace de revue et dans le suivi des revues de l'équipe ; évènement « Approbation (auto-contrôle) ». Composants `components/AutoControle.tsx`, libellés purs `lib/auto-controle.ts` (+ test et traductions), 35 entrées ajoutées à `en.json`. |
| Recette | `apps/web/e2e/auto-controle.mjs` (53 contrôles), ajoutée à `ci.yml` (tranche `complements`, après `revue-externe.mjs`) et à `E2E_DEFAUT` de `deploy/preprod/fadi-preprod` au même rang. |

## 2. Choix (à relire)

1. **Périmètre des révisions.** Pour chaque source du manifeste (variante principale **et** variantes coordonnées : elles
   font partie du dossier approuvé), remontée par `parent_revision_id` depuis la révision figée jusqu'à une révision déjà
   approuvée (exclue) ou jusqu'à la racine. « Déjà approuvée » : révision de tout évènement `approuver` d'une
   publication de l'étude (une approbation passée, même actualisée depuis, a eu lieu), révision approuvée en vigueur et
   sources du manifeste approuvé en vigueur des **autres** dossiers de l'étude. Une révision introuvable arrête la
   branche ; une boucle est coupée. La dérivation d'une variante n'est pas suivie vers sa variante d'origine (le dossier
   porte sur les révisions de ses variantes).
2. **Révisions d'initialisation exclues du décompte, dérivation comptée.** Le code crée `study-initialization` et
   `variant-initialization` avec un document **vide** (`newStudioDocument`, `lib/studio-commands.ts`) : leur auteur n'a
   rien produit, les compter signalerait tout propriétaire qui crée une étude. `variant-derivation` recopie un contenu
   dans le dossier par un geste de son auteur : comptée (prudent : signale plus).
3. **Soumission** : auteur du **dernier** évènement `soumettre` du journal de la publication (y compris l'évènement
   technique écrit à la restauration d'une archive non vérifiée, attribué au compte qui restaure — il a remis le dossier
   en revue).
4. **Échec fermé** : un compte introuvable est traité comme option désactivée. L'option est lue `FOR SHARE` dans la
   transaction d'approbation : un changement simultané par l'administration (`FOR UPDATE`) se sérialise avec elle.
5. **Marque de l'évènement** (`studio_publication_events.self_control`, colonne ajoutée au-delà du minimum demandé) : la
   marque de la publication (`approved_self_control`) est remise à NULL par `actualiser` ; sans marque sur l'évènement
   append-only, l'historique d'une approbation passée perdrait son libellé « auto-contrôle ». NULL pour les autres actions
   et les évènements antérieurs.
6. **Autres approbateurs** (`approvers` du 422 et de l'aperçu refusé) : propriétaire et Approbateurs de portée projet
   (`project_effective_access`), puis destinataires d'une affectation d'approbation ouverte, acceptée et non échue sur
   un paquet de revue de cette publication ; comptes actifs seulement, sans le demandeur. Nom affiché, sinon l'adresse
   pour un membre interne ; **jamais d'adresse** dans l'espace de revue externe ni pour un destinataire de revue
   (`name: null` : le rôle seul est affiché).
7. **Aperçu sous la même garde que l'approbation** : `approve` sur le dossier, donc 423 si un autre compte tient la
   réservation d'édition (comme l'approbation elle-même) ; lecture seule, aucune écriture.
8. **Interface** : la confirmation explicite (case « Je confirme approuver en auto-contrôle ») s'ajoute au bouton
   « Confirmer » existant ; le serveur ne l'exige pas (OP-6 : signaler sans bloquer) — c'est une aide, pas une règle.
9. **Raccourci Alt+Maj+A** sur la page d'administration (libre : R, L, T y sont pris) ; il ouvre la même confirmation
   que l'interrupteur, sur la fiche ouverte, jamais sur son propre compte.
10. **Fiche d'administration au téléphone** : la recette a relevé un débordement horizontal préexistant (adresse longue
    sans césure dans le titre de la fiche) ; corrigé (`comptes.css` : piste `minmax(0, 1fr)`, `overflow-wrap: anywhere`).

## 3. Contrats publics

- `lib/auto-controle.ts` (pur) : `SourceRevision`, `RevisionAuteur`, `SOURCES_TECHNIQUES`, `estProduction`,
  `perimetreRevisions(revisions, departs, approuvees)`, `evaluerAutoControle({ approbateurId, perimetre,
  dernierSoumetteurId, autoControleAutorise })` → `ResultatAutoControle`, `messageRefusAutoControle`.
- `lib/auto-controle-db.ts` : `controleApprobation(q, row, approverId)`, `autresApprobateurs(q, projectId, publicationId,
  approverId, externe)` → `ApprobateurPossible[]` (`{ name: string | null; role: "proprietaire" | "approbateur" |
  "approbateur-revue" }`), `autoControleAutorise(q, userId)`.
- `lib/studio-publications.ts` : `VoieApprobation`, `ApercuControleApprobation`, `apercuControleApprobation`,
  `controleApprobationStudio` ; `decideStudioPublicationByReview` rend `{ row, controle }` ; `transitionStudioPublication(…, ip?)`.
- `lib/reviews-recipient.ts` : `reviewApprovalCheck` ; `decideReview` rend `{ decision, selfControl? }`.
- HTTP : `PATCH /admin/users/:userId/self-control`, `GET …/publications/:id/controle-approbation`,
  `GET /reviews/:packageId/controle-approbation` → `{ autoControle, revisionsAuteur, soumisParLui, autorise, approvers }` ;
  refus `422 { error: "self_approval_forbidden", message, autoControle, revisionsAuteur, soumisParLui, approvers }`.
- Audit : `admin.user.self_control_changed`, `review.approval.recorded` (nouvelles), métadonnées OP-6 sur
  `review.decision.recorded`.
- Interface : `lib/auto-controle.ts`, `components/AutoControle.tsx` (`AvisAutoControle`, `MarqueAutoControle`,
  `ApprobateursPossibles`), `accountApi.adminSetSelfControl`, `api.studioApprovalCheck`, `revuesApi.approvalCheck`,
  `entryActionLabel` ; requêtes `controle-approbation` jamais conservées hors ligne (`NON_PERSISTED_QUERIES`).

**Empreintes inchangées** : la marque n'entre ni dans le manifeste, ni dans le paquet, ni dans aucun calcul d'empreinte ;
`manifest_hash`, `approved_manifest_hash` et `package_hash` sont identiques avec ou sans auto-contrôle (vérifié par la
recette et par les cas DB-3). Les archives Studio exportent la nouvelle colonne avec la ligne (`to_jsonb`) ; une archive
antérieure se restaure avec NULL.

## 4. Écarts

- Aucun seuil, aucun blocage par défaut, aucune correction automatique (OP-6). Le diffuseur n'est pas contrôlé.
- `deploy/preprod/fadi-preprod` : `sandbox-axes` (recette du lot Axes, PR #298) manquait déjà à `E2E_DEFAUT` sur `main`
  (contrôle « E2E_DEFAUT = CI » rouge) : ajouté au même rang que la CI en même temps que `auto-controle`.

## 5. Preuves (2026-10-25, PostgreSQL 16 + PostGIS locaux, API construite sur le port 3071, `MAIL_TRANSPORT=console`)

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` | vert (tous les espaces de travail, suites de test comprises) |
| `npm test` | tout vert hors les **15 suites DB-3 refusées par la garde** (attendu) : API 47 fichiers / 652 tests, web 130 / 1006, paquets verts |
| `npm run build` | vert |
| `npm run test:db-guard`, `npm run test:scripts` | 178 tests verts ; 18 verts |
| `npm run db:migrate` ×2, base neuve `fadi_autoctl` | « Schema applied » deux fois ; colonnes présentes (défaut `true`, NULL) |
| `npm run db:migrate` ×2, copie d'une base existante (`fadi_pont`, 103 comptes, 13 approbations) | 103/103 comptes activés ; 13/13 approbations antérieures restées NULL (rien de rétroactif) |
| Instructions de premier niveau d'`init.sql` (règle de `studio-v1-profile.py`) | 433 instructions, seulement CREATE / ALTER / DO |
| Matrice des permissions Studio (`studio-permissions.test.ts`) | route d'aperçu ajoutée, `docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md` régénéré |
| `auto-controle.mjs` | **53 / 53** |
| `studio-publication.mjs` | 129 / 129 |
| `comptes-admin.mjs` | 82 / 82 |
| `revue-externe.mjs` | 132 / 132 (un premier passage 131/132 : contrôle « panneau Revues externes » lu avant le chargement de la liste, vert au second passage sans changement — instabilité de temps préexistante) |
| `interface-anglais.mjs` | vert, 0,28 % de textes restés en français (seuil 2 %) |
| `deploy/preprod/tests/run.sh` — « Liste e2e identique à la CI » | ✓ (87 = 87) |

## 6. Non exécuté ici

- **Suites DB-3** (`app.test.ts` § 8 « séparation des responsabilités », `reviews.test.ts` « auto-contrôle de
  l'approbatrice nommée » et l'assertion ajoutée au scénario d'approbation) : refusées par la garde hors CI (aucune
  base attestée) ; elles tournent en CI. La garde n'est pas modifiée.
- CI complète (tranche `complements` comprise) : à faire passer sur la PR.
- `deploy/preprod/tests/run.sh` : ses contrôles de garde échouent localement faute de `/opt/fadi-preprod/src`
  (environnement), sans rapport avec ce lot.
- Aucun déploiement (accord explicite requis).
