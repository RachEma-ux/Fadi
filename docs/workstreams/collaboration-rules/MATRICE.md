# Règles communes de collaboration — matrice

Sources : [`Fadi Concept - Collaboration Common Rules.md`](../../../Fadi%20Concept/Fadi%20Concept%20-%20Collaboration%20Common%20Rules.md)
(v1.0) et [`Fadi Concept - Collaboration Concept Map.md`](../../../Fadi%20Concept/Fadi%20Concept%20-%20Collaboration%20Concept%20Map.md)
(v1.0). Une ligne par énoncé vérifiable. Audit du 2026-10-24 sur `main` = `034dbfb` (lecture du code, aucun test exécuté
pour cette matrice ; les tests cités sont ceux du dépôt, qui tournent en CI).

**Aucun module nouveau** : la colonne « Propriétaire » nomme le module qui doit porter la contrainte (concept, « Module
ownership »). Les chantiers propriétaires sont Users Management (`users-management`, fusionné) et sa suite Organisations
(`organisations-participation`, PR #265 ouverte), COM et Temps réel (non ouverts), Studio, Documents, Parcours.

**États** : `en place` = satisfait dans `main`, avec preuve ; `partiel` = une partie est satisfaite, le reste est nommé ;
`manquant` = rien dans `main` ; `hors périmètre` = relève d'un chantier propriétaire non encore ouvert ou d'un
mécanisme absent de `main` (aucune exigence n'est perdue : renvoi au [PLAN](PLAN.md)). « non vérifié » = la preuve n'a
pas été trouvée ou n'a pas pu être établie par lecture.

Légende : `api:` = `apps/api/src/…`, `web:` = `apps/web/src/…`, `e2e:` = `apps/web/e2e/…`, `sql:` =
`apps/api/src/db/init.sql`.

## 1. Les cinq règles

| ID | Énoncé | Propriétaire | État | Preuve / écart |
|---|---|---|---|---|
| R1 | Une identité vérifiée et un seul système d'accès | Users Management | en place | Identité unique et vérifiée : MATRICE UM C1-04 (e2e:comptes-api.mjs, lien transféré refusé). Un seul chargeur d'accès projet pour tous les modules : api:lib/owned-project.ts:92-105 (`loadProjectAccess`), appelé par Parcours (api:routes/parcours-steps.ts, 10 appels), Documents (api:routes/documents.ts:46,65), Collaboration (api:routes/collaboration.ts:296), Studio (inventaire complet : api:routes/studio-permissions.test.ts:303). Contacts sans compte : voir V01. |
| R2 | Toute action formelle exige une autorité explicite | Users Management (grants) · Studio (approbation) | partiel | Approbation et diffusion Studio réservées au propriétaire, revérifiées serveur : api:lib/studio-publication-statuts.ts:43-49 ; test api:lib/studio-publication-statuts.test.ts:73. Écart : l'autorité est **déduite de la propriété**, pas d'une affectation explicite (Approbateur / Diffuseur), et la base d'autorité n'est pas enregistrée (voir R5). Rôles par portée : PR #265 (OP-D3 c), bascule en phase 2. |
| R3 | L'information n'est partagée qu'avec son audience autorisée | Users Management · COM · Documents | partiel | Frontière projet en place (404 sans accès : api:lib/owned-project.ts:92-105 ; e2e:comptes-api.mjs:287). Écart : **aucune audience à l'intérieur d'un projet** — tout membre lit tous les commentaires (api:routes/collaboration.ts:270), reçoit leurs extraits en notification (api:routes/notifications.ts:121-139) et un `lecteur` exporte (api:lib/owned-project.ts:43 ; e2e:comptes-securite.mjs:343). Pas de distinction interne / externe. |
| R4 | Travailler, enregistrer, partager, adopter, relire, approuver et publier sont des actions séparées | Studio · Users Management · Temps réel | partiel | Séparées dans Studio : brouillon et file hors ligne (e2e:studio-hors-ligne.mjs:3-17), révision immuable (sql:570-576), soumission / approbation / diffusion distinctes (api:lib/studio-publication-statuts.ts:4-6, 59-66), adoption d'une référence externe épinglée (api:lib/atelier-refexterne.ts:106,132). Écart : pas d'action distincte « partager un paquet de coordination » ni « partager un paquet de revue figé » à une audience (une publication `en-revue` sert aux deux, sans destinataire). |
| R5 | Les actions importantes conservent acteur, portée, révision source, autorité et résultat | Tous (chacun ses enregistrements) | partiel | En place : journal des publications Studio (auteur, commentaire, révision, empreinte du manifeste ; api:lib/studio-publications.ts:338, immuable sql:862-868), passages d'observations (sql:654-660), `admin.audit_log` append-only des comptes, invitations et accès support (api:lib/audit.ts:13-48, sql:1352-1363). Écarts : ajout direct, changement de rôle, retrait d'un membre et transfert de propriété **non journalisés** (api:routes/members.ts:145, 152, 174, 196 : aucun appel `audit`) ; base d'autorité et partie représentée jamais enregistrées. |

## 2. Vocabulaire

| ID | Énoncé | Propriétaire | État | Preuve / écart |
|---|---|---|---|---|
| V01 | Un contact peut ne pas avoir de compte | Users Management (Organisations) | manquant | Aucun enregistrement de personne hors `users` dans `main`. Table `people` proposée par la PR #265 (phase 1), non fusionnée. |
| V02 | L'appartenance à une organisation ne donne pas accès aux projets | Users Management (Organisations) | hors périmètre | Aucune organisation dans `main` (colonnes `organization_id` réservées sans logique, D-3) : rien ne peut violer la règle aujourd'hui. Phase 5 d'Organisations. |
| V03 | La participation à un projet n'implique pas des permissions illimitées | Users Management | partiel | Deux rôles (`lecteur`, `editeur`) et le propriétaire, vérifiés à chaque route (api:lib/owned-project.ts:37-44). Écart : la plus petite portée est le **projet entier** (un `lecteur` lit et exporte tout) ; rôles par portée dans la PR #265. |
| V04 | Affectation ≠ autorité ≠ permission ≠ accès | Users Management · Collaboration partagée | partiel | Affectation distincte du droit : un responsable d'observation doit encore avoir `write` pour corriger (api:lib/studio-observations.ts:11-12) ; accès effectif calculé à chaque requête (api:lib/owned-project.ts:92-105). Écart : l'autorité n'est pas un enregistrement distinct ; pas d'affectation de travail hors Studio. |
| V05 | Une session est temporaire | Temps réel | hors périmètre | Aucune session de coordination dans `main` (aucun WebSocket ni flux SSE trouvé dans api/ et web/). Seule notion voisine : la réservation d'édition de 30 min (api:lib/owned-project.ts, `EDITING_LOCK_MINUTES`). |
| V06 | Une révision est un état enregistré, pas une approbation | Studio | en place | Révisions immuables (sql:570-576, `studio_revision_immutable`) ; l'approbation porte l'empreinte exacte et vit sur la publication (api:lib/studio-publications.ts:471 ; test api:lib/studio-publication-statuts.test.ts:217). |
| V07 | Paquet de coordination, référence adoptée, paquet de revue figé, dossier approuvé et paquet diffusé ont des buts différents | Studio · Documents · Temps réel | partiel | Dossier approuvé et paquet diffusé distincts (dimensions travail / diffusion : api:lib/studio-publication-statuts.ts:4-6 ; test :19). Référence adoptée ≈ référence externe épinglée de l'Atelier (api:lib/atelier-refexterne.ts:106,132). Écart : paquet de coordination et paquet de revue figé ne sont pas des objets distincts ; le mot « publication » désigne dans l'Atelier un instantané partagé sans approbation (api:db/schema.ts:672) et dans Studio un dossier soumis à approbation (CR-D8). |
| V08 | Commentaires, observations, tâches, revues et décisions ne sont pas interchangeables | Collaboration partagée · Studio · COM | en place | Tables et états propres : commentaires Studio (api:db/schema.ts:823), observations promues explicitement (api:db/schema.ts:850, `ouverte` → `cloturee`), tâches (`a-faire` / `faite` / `annulee`), propositions et décisions (`StudioObservationDecisionNature`) ; tests api:lib/studio-observations.test.ts, e2e:studio-observations.mjs. Commentaires du Parcours séparés (api:db/schema.ts:393). |

## 3. Propriété des modules

| ID | Énoncé | Propriétaire | État | Preuve / écart |
|---|---|---|---|---|
| M01 | Users Management possède identités, invitations et grants | Users Management | partiel | Comptes, invitations, accès support : api:lib/invitations.ts, api:routes/support-grants.ts, MATRICE UM V22-01. Écart : l'ajout direct d'un compte existant crée un grant **hors invitation** dans la route Collaboration (api:routes/members.ts:109-149, UM-8) ; fin décidée (OP-D2 a), livrée en phase 3 d'Organisations. |
| M02 | COM possède conversations et notifications | COM | partiel | Notifications dans l'application, dérivées des données, sans table (api:routes/notifications.ts:1-33) ; courriels de compte seulement (api:lib/mailer/templates.ts:1-13). Pas de conversation ni de module COM ; les commentaires vivent dans Collaboration et Studio. |
| M03 | Temps réel possède sessions et présence | Temps réel | hors périmètre | Aucun mécanisme de session ni de présence dans `main` (voir V05). |
| M04 | Collaboration partagée possède observations et tâches | Collaboration partagée | partiel | Boucle observations / tâches / décisions dans Studio (api:lib/studio-observations.ts, api:lib/studio-observations-suivi.ts), seule boucle de correction (OP-D6 a). Écart : aucune observation hors Studio (Documents, Parcours) ; propriétaire à confirmer (CR-D1). |
| M05 | Studio possède conception, révisions et approbations applicables | Studio | en place | api:lib/studio-publication-statuts.ts:1-26 ; matrice des permissions api:routes/studio-permissions.test.ts:303-355. |
| M06 | Documents possède les versions de documents et ses flux propres | Documents | partiel | Productions tracées par révision du modèle et empreinte des entrées (api:routes/documents.ts:1-16) ; paquets Studio affichés en lecture seule, sans décision concurrente (api:routes/documents.ts:3-4). Écart : pas de version de document déposé ni de flux propre — non requis tant qu'aucun besoin n'est décidé. |
| M07 | Parcours possède les étapes | Parcours | en place | Routes d'étapes sous l'accès commun (api:routes/parcours-steps.ts, 10 appels `projectOr404` / `loadProjectAccess`) ; aucun système d'utilisateurs ou de droits propre (grep). |
| M08 | Aucun module ne crée de système concurrent d'approbation ou de comptes | Tous | en place | Une seule approbation (publications Studio) ; les publications de l'Atelier n'ont aucun statut d'approbation (api:db/schema.ts:672-684) ; Documents relit les paquets Studio (api:routes/documents.ts:3-4) ; une seule table de comptes. |

## 4. Audience et continuité

| ID | Énoncé | Propriétaire | État | Preuve / écart |
|---|---|---|---|---|
| A01 | Mentions, liens, invitations et présence en session n'élargissent pas l'accès | Users Management · COM · Temps réel | partiel | Invitations : aucun accès avant acceptation par l'identité visée (api:lib/security/security.test.ts:163-175 ; e2e:comptes-api.mjs:245). Liens : chaque route revérifie l'accès (api:routes/studio-permissions.test.ts:320-339). Mentions et sessions : absentes de `main`, à garantir à leur création (COM, Temps réel). |
| A02 | Aperçus, exports, notifications et résumés IA suivent la même audience | Users Management · COM · Documents | partiel | Notifications recalculées depuis l'accès courant à chaque lecture (api:routes/notifications.ts:75-79, 119) ; support sans export (api:lib/owned-project.ts:43 ; MATRICE UM C2-09). Écarts : extraits de commentaires envoyés à tous les membres (api:routes/notifications.ts:129-138) ; export ouvert au `lecteur` (api:lib/owned-project.ts:43). Résumés IA : aucun dans `main` (non vérifié au-delà d'une recherche textuelle). |
| A03 | Gardien du projet, gardien du contenu et hôte de session ont des responsabilités différentes | Users Management · Studio · Temps réel | partiel | Gardien du projet = `projects.owner_id`, transfert (api:routes/members.ts:196-219). Gardien du contenu : non modélisé ; hôte de session : absent. |
| A04 | Les grants indépendants survivent au retrait d'un grant sans rapport | Users Management | en place | Un membre retiré d'un projet garde son autre projet : api:app.test.ts:1971-1973 ; accès support dans une table distincte (api:lib/owned-project.ts:103). |
| A05 | Le départ retire l'accès dépendant et préserve l'historique | Users Management · Studio · Temps réel | partiel | Retrait → 404 à la requête suivante, journal conservé (api:app.test.ts:1970, 1972, 1976-1979) ; suspension libère la réservation d'édition (api:routes/admin/index.ts:151). Écarts : le retrait d'un membre ne libère ni sa réservation ni ses verrous fins (api:routes/members.ts:174-188 ; échéance ≤ 30 min, libération par le propriétaire api:routes/lock.ts:83) ; observations et tâches dont il est responsable ne sont pas signalées à réattribuer. |
| A06 | La reprise d'un conflit n'écrase pas en silence un travail accepté | Studio · Collaboration · Temps réel | en place | Refus 409 et panneau de conflit sans fusion automatique (web:modules/collaboration/README.md, « Conflits ») ; Studio : `stale_revision`, tête non écrasée, brouillon conservé (e2e:studio-hors-ligne.mjs:8-12 ; e2e:studio-conflits.mjs). |

## 5. Scénarios d'acceptation (Common Rules, « Acceptance », 9 scénarios)

| ID | Scénario | Propriétaire | État | Preuve / écart |
|---|---|---|---|---|
| S1 | Affectation de l'équipe interne : identités vérifiées existantes ; affectation de travail distincte de l'accès | Users Management (Organisations) | partiel | Partage aux comptes existants (api:routes/members.ts:109-149) ; affectation de travail seulement par observation / tâche Studio. Manquent l'équipe et les responsabilités (PR #265 phases 1–2). |
| S2 | Ingénieur externe invité, accès borné | Users Management (Organisations) | partiel | Invitation nominative, lien transféré, expiré, invitant révoqué refusés (api:lib/security/security.test.ts:165-174 ; e2e:comptes-api.mjs:245). Écarts : la portée est le projet entier ; `access_expires_at` existe (api:db/schema.ts:118) mais n'est **ni renseigné ni appliqué** (api:lib/invitations.ts:75-85, api:lib/owned-project.ts:92-105). |
| S3 | Commentaire de l'ingénieur sur R03, correction en R04 | Studio · Collaboration partagée | partiel | Commentaire lié à la révision et à l'auteur (api:db/schema.ts:823-826), révisions immuables (sql:570-576), révision de correction distincte (`correctionRevisionId`, api:db/schema.ts:850) ; e2e:studio-observations.mjs. Écart : audience non retenue (tous les membres, R3). |
| S4 | Revue d'un paquet figé par le client | Users Management (Organisations, phase 4) | manquant | Aucun paquet de revue ni accès limité à un paquet ; un client invité `lecteur` verrait tout le projet, notes comprises (api:lib/owned-project.ts:37-44). |
| S5 | Approbation autorisée suivie d'une publication séparée | Studio | partiel | Transitions séparées, approbation liée à l'empreinte, diffusion refusée si le manifeste diffère (api:lib/studio-publication-statuts.ts:22-24 ; tests :217, :226). Écarts : Approbateur et Diffuseur ne peuvent être des personnes distinctes (propriétaire seul) ; pas de destinataires autorisés du paquet diffusé (tous les membres). |
| S6 | Révocation en cours de session | Users Management · Temps réel | partiel | Action suivante refusée : session révoquée (e2e:comptes-api.mjs:149), membre retiré (api:app.test.ts:1972), accès support révoqué (e2e:comptes-api.mjs:287) ; grants indépendants conservés (api:app.test.ts:1973). Écarts : pas de session en direct ; les données en cache local du projet retiré restent sur l'appareil jusqu'à la déconnexion (purge seulement à la déconnexion ou au 401 : web:lib/auth-context.tsx:57, 142) — politique hors ligne à définir (CR-D5). |
| S7 | Paquet reçu mais non adopté | Studio · Temps réel | partiel | Référence externe de l'Atelier épinglée (publication, révision, empreinte) ; une source plus récente est signalée `plus-recente`, jamais substituée (api:lib/atelier-refexterne.ts:106, 117-132 ; e2e:atelier-complements.mjs:2663). Écart : aucun paquet de coordination Studio. |
| S8 | Conflit ou nouvel essai hors ligne | Studio · Collaboration · Users Management | en place | Même `requestId` → enregistré une fois, conflit montré, brouillon conservé (e2e:studio-hors-ligne.mjs:3-17) ; acceptation d'invitation idempotente (api:lib/invitations.ts:80-84) ; mutations à clé rejouées sans écrasement (web:modules/collaboration/README.md, « Hors-ligne »). |
| S9 | Hôte privé d'une approbation non autorisée | Temps réel · Studio | partiel | La garde sous-jacente existe : approuver exige le droit `owner` quel que soit le contexte (api:lib/studio-publication-statuts.ts:43-45 ; test :73). Le scénario n'est pas exécutable : aucun hôte de session dans `main`. |

## 6. Synthèse

| État | R | V | M | A | S | Total |
|---|---|---|---|---|---|---|
| en place | 1 | 2 | 3 | 2 | 1 | **9** |
| partiel | 4 | 3 | 4 | 4 | 7 | **22** |
| manquant | 0 | 1 | 0 | 0 | 1 | **2** |
| hors périmètre | 0 | 2 | 1 | 0 | 0 | **3** |
| **Total** | 5 | 8 | 8 | 6 | 9 | **36** |

Aucune ligne n'est « en place » sans fichier, test ou route cités. Les écarts sont repris, classés et rattachés dans le
[PLAN](PLAN.md), § 3.
