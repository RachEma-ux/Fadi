# Plan d'implémentation — Organisations, participation et revue externe

> Chantier ouvert par le maître d'ouvrage le 2026-10-23 (suite de UM-1, [Issue #262](https://github.com/RachEma-ux/Fadi/issues/262)).
> Priorité demandée : **participants**, **invitations acceptées**, **revue externe** ; ajout du maître d'ouvrage le même
> jour : **journal d'activité et historique** (phase 3 bis).
> **Statut du plan : validé le 2026-10-23** (🛑 0 franchi, décisions OP-1 dans [DECISIONS.md](DECISIONS.md)). Phase 1 livrée
> sur branche, en attente de la revue 🛑 1.

Source normative : [`docs/workstreams/users-management/concept.md`](../users-management/concept.md) (concept Users
Management v2.2, parties 1 à 6 et section v2.2) — il prime sur ce plan. Décisions héritées : D-1 à D-7 et UM-1 à UM-24
([journal de la gestion des comptes](../users-management/DECISIONS.md)).

---

## 0. Règles d'exécution

1. **Ordre** : 0 → 1 → 2 → 3 → 3 bis → 4 → (5) → 6. Une phase ne commence qu'avec les critères de la précédente verts et, aux 🛑, la
   validation du maître d'ouvrage.
2. **Le concept prime.** Une tâche qui le contredit est adaptée et l'écart consigné dans `STATUS.md`.
3. **Rien n'est inventé.** Les listes métier (rôles de participation, types d'organisation, champs de contact) viennent du
   maître d'ouvrage (annexe A) ; à défaut, saisie libre déclarée comme telle. Une capacité absente est une limite affichée,
   jamais simulée.
4. **Migrations additives et idempotentes** (`apps/api/src/db/init.sql` + `schema.ts`), schémas D-7 respectés : les tables de
   personnes et d'organisations hors `auth` (données métier du projet, en `public`), droits `fadi_app` accordés par le bloc
   final d'`init.sql`. Aucune donnée existante perdue : `project_members` et `invitations` restent lues tant que le
   remplacement n'est pas validé.
5. **Autorisation serveur à chaque requête, échec fermé** ; les règles de la gestion des comptes s'appliquent (assurance de
   session UM-18, capacité `export` UM-20, accès support D-2).
6. **Accès externe borné** : un participant externe ne voit que ce qui lui est explicitement partagé (concept 2 « Visibility »,
   4 « Time limits and external visibility »), y compris par liens, aperçus, notifications et exports.
7. **i18n** (texte français + `en.json`), **accessibilité** WCAG 2.2 AA (axe-core bureau et téléphone), **21 étapes intactes**.
8. **Tests** : purs (Vitest hors base) ; base réelle par la suite DB-3 attestée (`app.test.ts` ou nouvelles suites — une
   nouvelle suite DB-3 exige la révision relue de `DB3_PENDING_SUITES`) ; recettes HTTP et navigateur en CI. Distinguer
   « réussi » et « non exécuté ».
9. **Aucun déploiement**, aucune production, aucun secret. Checkpoint `TASKS`/`STATUS`/`HANDOFF` à chaque phase.
10. `npm run typecheck`, `npm test`, `npm run build` avant chaque PR ; CI verte avant toute demande d'acceptation.

---

## Phase 0 — Cadrage (ce lot)

**Livré** : `CONTEXT.md`, ce plan, la traçabilité des exigences (§ 7), l'audit de l'existant (§ 1), les décisions à prendre
(annexe A), le journal `DECISIONS.md` du chantier.

**Consolidation du 2026-10-23** : un second cadrage, rédigé par la session d'exploitation (branche
`docs/organisations-participation-cadrage`, commit `fa98da4`, non ouvert en PR pour éviter un doublon), est fondu dans ce
plan sur décision du maître d'ouvrage. Il apporte la phase 3 bis (journal d'activité et historique), l'option (c) de
OP-D3 (six rôles métier), les précisions de OP-D8 et OP-D9, et les décisions OP-D12 (courriels) et OP-D13 (lecteurs du
journal). Ses décisions D-OP-1 à D-OP-7 correspondent à : D-OP-1 → OP-D3 (c) ; D-OP-2 → phase 1, tâche 2 et OP-D1 ;
D-OP-3 → OP-D9 ; D-OP-4 → OP-D8 ; D-OP-5 → OP-D6 ; D-OP-6 → OP-D12 ; D-OP-7 → OP-D13.

### 🛑 Point d'arrêt 0
Validation (ou amendement) du plan et réponses aux décisions de l'annexe A. Sans elles, les phases 1 à 4 ne commencent pas.

---

## 1. Audit de l'existant (2026-10-23, `main` = `516e2f7`)

| Sujet | Existant | Écart avec le concept |
| --- | --- | --- |
| Membres d'un projet | `public.project_members` (`lecteur` / `editeur`), propriétaire = `projects.owner_id` ; routes `apps/api/src/routes/members.ts` ; écran Collaboration (`apps/web/src/modules/collaboration/`) | Pas de fiche personne ni de contact sans compte, pas de partie représentée, de rôle métier, de période ni de statut de participation (C1-03, C1-05, C1-06). |
| Ajout d'un compte existant | Ajout direct sans acceptation (UM-8) | Le concept : « An invitation is a proposal, not a grant » ; activation après acceptation (v2.2). |
| Invitations | `auth.invitations` : finalités `platform_account`, `project_participation` ; rôle `lecteur`/`editeur` ; expiration de l'invitation et colonne `access_expires_at` ; revalidation de l'invitant (`lib/invitations.ts`), activation idempotente, lien transféré refusé | 2 finalités sur 5 ; aucune participation ni portée exacte rattachée ; aucun aperçu de l'accès résultant. |
| Organisations | Colonnes `organization_id` réservées, sans logique, sur `users` et `projects` (D-3) | Aucun enregistrement d'organisation, d'adhésion, de groupe (parties 1 et 5). |
| Rôles métier Studio | Capacités de publication `lecture` / `revue` / `approbation` / `publication` déduites des rôles de projet (`lib/studio-publication-statuts.ts` : approbation et publication réservées au propriétaire) | Pas d'affectation Relecteur / Coordinateur / Approbateur / Diffuseur par portée (concept 2 « Action and scope assignments »). |
| Dossier candidat | Publications Studio avec manifeste figé multi-sources (`studio_publications.manifest`, empreinte), statuts de travail `brouillon` → `en-revue` → `approuve` / `refuse`, diffusion séparée, remplacement tracé | Base possible du « paquet de revue » (concept 4) ; aucun destinataire externe. |
| Constats et corrections | Observations Studio (`ouverte` → `corrigee` → `recontrolee` → `cloturee` / `rouverte`), tâches, décisions, liens vers objets et révisions | Aucune audience « revue externe » ; pas de rattachement à un paquet. |
| Accès support | D-2, UM-4, UM-20 : lecture seule bornée, export refusé | Modèle de référence pour un accès limité et journalisé. |
| Journal | `admin.audit_log` append-only, sans adresse en clair : inscriptions, connexions, sécurité, invitations, administration, accès support | **Aucun écran de consultation** ; aucun historique personnel ni de projet (phase 3 bis). |

---

## Phase 1 — Enregistrements partagés : personnes, organisations, participations

**But** : un annuaire du projet qui contient aussi des contacts sans compte, sans changer les droits existants.

**Réalisation (OP-D3 c)** : tables `people`, `organizations`, `project_participations` et `project_role_assignments`
(rôle métier × portée `projet` / `etude` / `variante` / `revision` / `documents`, origine `acces` ou `attribution`). Tant
que la phase 2 n'a pas basculé l'accès, `projects.owner_id` et `project_members` restent la source des droits : la
fonction SQL `op_sync_access` et deux déclencheurs en tiennent le miroir (participation active, rôle `acces` lecteur ou
concepteur) quel que soit le chemin d'écriture (partage, invitation acceptée, transfert, anonymisation). Règles pures :
`apps/api/src/lib/participations.ts` ; contrôle sur base réelle : `scripts/validation/participations-migration-check.mjs`
(CI `validate`).

### Tâches
1. **Personnes** (`public.people`) : fiche de personne ou de contact — nom affiché, coordonnées professionnelles selon
   OP-D9, `user_id` facultatif et **unique** (liaison vérifiée seulement, jamais par ressemblance de nom ou d'adresse non
   vérifiée — concept 1 « Shared records »), créateur, dates.
2. **Organisations** (`public.organizations`) minimal : nom, type déclaré (OP-D4), statut (`active` / `suspendue` / `close`),
   créateur. Sert de partie représentée et, selon OP-D1, de partie propriétaire. L'espace d'organisation (partie 5) n'est
   **pas** livré ici.
3. **Participations** (`public.project_participations`) : projet ; personne **ou** organisation ; partie représentée ;
   rôle métier (OP-D4) ; statut `contact` / `active` / `suspendue` / `terminee` ; période ; responsabilités d'équipe
   (concept : diriger, produire, coordonner, vérifier, approuver, diffuser) ; créateur. L'« équipe » est une **vue** des
   participations portant des responsabilités, jamais un second annuaire.
4. **Reprise de l'existant** (additive, idempotente) : le propriétaire et chaque `project_members` reçoivent une personne
   liée à leur compte et une participation `active` ; les droits restent portés par `project_members` (OP-D3).
5. **Journal** (`admin.audit_log`) : création, modification, changement de statut de participation ; aucune adresse en
   clair dans les métadonnées (règle existante). *Reporté en phase 2* : en phase 1, seules les écritures d'accès déjà
   existantes modifient les participations (miroir) ; les écritures propres aux participations naissent avec l'API de la
   phase 2, qui les journalise.

### Tests
Purs : machine d'états de participation, règle « personne ou organisation », liaison de compte refusée sans vérification.
DB-3 : reprise idempotente (deux migrations), unicité `user_id`, une personne dans deux projets avec deux rôles.

### Acceptation (concept 1)
Contacts et organisations présents sans accès ; une même identité vérifiée dans plusieurs projets ; responsabilité,
travail et permission inspectables séparément ; aucun droit modifié pour les membres existants.

### 🛑 Point d'arrêt 1 — revue du modèle et de la migration.

---

## Phase 2 — Participants et équipe (écran Collaboration)

**But** : « Collaboration > Équipe et participants » (concept 1 « Interface placement »).

### Tâches
1. API : lister, rechercher (existant avant création), créer un contact (personne ou organisation), modifier rôle métier,
   partie représentée, responsabilités, période ; suspendre / terminer une participation (affichage des droits, travaux et
   invitations affectés — concept 3 « Delegate responsibility and end participation »).
2. Droits : gestion des participants réservée au propriétaire (règle actuelle) tant que l'administration de projet
   déléguée n'est pas décidée ; lecture de l'annuaire selon OP-D9 (coordonnées par audience).
3. Interface : onglets **Participants** (annuaire complet, contacts compris) et **Équipe** (vue des responsabilités),
   états distincts affichés (compte, participation, invitation), aucune fusion automatique, renvoi à la fiche existante.
4. Retour d'un participant : identité réutilisée, nouvelle période, anciens droits réévalués (jamais restaurés d'office).
5. **Bascule de l'accès vers les rôles métier (OP-D3 c)** : `loadProjectAccess` dérive les droits des rôles par portée
   (Lecteur : lire, commenter ; Concepteur : modifier ; Relecteur : constats ; Approbateur et Diffuseur : approbation et
   diffusion Studio, aujourd'hui réservées au propriétaire), sans perte d'accès pour un membre existant ; le miroir
   `acces` est alors retiré. Journal des écritures de participation (tâche 5 de la phase 1).

### Tests
DB-3 : contact sans accès invisible des droits ; terminer une participation retire l'accès dérivé à la requête suivante.
Recettes navigateur avec axe-core (bureau et téléphone), passe anglaise.

---

## Phase 3 — Invitations acceptées liées à une participation

**But** : toute participation active naît d'une invitation **acceptée** par l'identité visée (concept 3 et v2.2).

### Tâches
1. `auth.invitations` : colonne additive `participation_id` ; une invitation propose une participation existante
   (contact) ou en crée la fiche, avec rôle, portée exacte, expiration d'invitation et d'accès indépendantes.
2. **Aperçu** de l'accès résultant avant envoi ; affichage des participations et invitations en attente avant d'en créer une
   (règle de renvoi existante conservée).
3. **Acceptation** : liaison du compte vérifié à la fiche personne visée ; refus si la fiche est déjà liée à un autre
   compte (mauvaise identité) ; revalidation de l'autorité de l'invitant, de l'éligibilité, de la portée et des
   restrictions ; activation idempotente (participation `active` + droit) ; refus documentés pour invitation
   transférée, expirée, annulée, déclinée ; reprise sans doublon après interruption.
4. **Comptes existants** selon OP-D2 (recommandé : invitation acceptée aussi, fin de l'ajout direct UM-8 ; notification dans
   l'application en plus du courriel).
5. Entrée dans le bon espace après acceptation : le projet (ou le paquet de revue en phase 4), avec le travail en attente.

### Tests
v2.2 : utilisateur existant et nouveau, mauvais compte, lien transféré ou expiré, invitant révoqué entre envoi et
acceptation, double soumission, refus. DB-3 + recettes HTTP (`comptes-api`, nouvelle recette participants).

### 🛑 Point d'arrêt 3 — revue des invitations et de la fin de l'ajout direct.

---

## Phase 3 bis — Journal d'activité et historique (ajout du maître d'ouvrage, 2026-10-23)

**But** : rendre consultable, par audience, ce que `admin.audit_log` enregistre déjà, et les événements de participation
des phases 1 à 3. Dépend de la phase 1 ; peut être livrée avant la phase 4.

### Tâches
1. **Administrateur de la plateforme** : écran de consultation en lecture seule (filtres personne, action, cible, période),
   sous l'assurance de session UM-18 ; aucun export sans la capacité `export` (UM-20).
2. **Utilisateur** : « Mon compte » affiche son propre historique (connexions, changements de sécurité, invitations, accès
   support accordés ou utilisés).
3. **Projet** : historique de la participation (arrivées, changements de rôle, invitations, fins de participation),
   visible des responsables du projet (OP-D13).
4. Le journal reste append-only et sans adresse en clair ; chaque vue filtre côté serveur selon son audience ; un invité
   externe (phase 4) n'y voit rien d'autre que ses propres actions.

### Tests
Purs : filtre d'audience. DB-3 : chaque rôle ne voit que son périmètre ; `fadi_app` n'obtient ni UPDATE ni DELETE sur le
journal. Recette navigateur avec axe-core (bureau et téléphone), passe anglaise.

---

## Phase 4 — Revue externe (premier scénario opérationnel complet, concept 4)

**But** : un client, un consultant ou un spécialiste nommé examine un paquet identifié et répond, sans rejoindre
l'organisation hôte ni voir le reste du projet.

### Tâches
1. **Audit préalable** (4.0) : ce que la publication Studio fige déjà (manifeste, empreintes, fichiers) pour une revue
   **avant** approbation ; ce qui manque pour servir les fichiers figés d'un paquet non diffusé.
2. **Paquet de revue** (`review_packages`) : projet, source (publication Studio candidate selon OP-D5), manifeste des versions
   exactes et empreinte, motif, réponse attendue et questions, coordinateur, responsable interne des corrections,
   date de réponse, statut (`brouillon` / `partage` / `clos` / `remplace`), paquet remplacé.
3. **Destinataires** (`review_assignments`) : participation, responsabilité (relecture / approbation selon OP-D7),
   permissions (consulter, commenter, pièces jointes, télécharger, exporter — défauts selon OP-D8), expiration d'accès,
   invitation (finalité `review_package`), statut (`en-attente`, `en-cours`, `terminee`, `annulee`, `remplacee`), résultat
   (constats / revue satisfaisante pour la portée).
4. **Accès borné** : droit limité au paquet (nouvelle portée), évalué par les seules routes de revue — jamais un rôle de
   projet ; refus partout ailleurs (routes projet, Studio, documents, recherche, aperçus, notifications, exports).
5. **Espace de revue externe** : identité, objet, échéance, actions permises, statut ; consultation des documents figés ;
   **constats** rattachés au document, à l'objet et à la révision (OP-D6 : observations Studio avec audience « revue
   externe ») ; notes internes jamais visibles.
6. **Boucle de correction** : affectation des constats, réponses, nouvelle version de paquet qui en remplace une autre,
   recontrôle, décision d'approbation selon les transitions Studio existantes (aucun statut d'approbation concurrent),
   diffusion séparée.
7. **Côté équipe interne** : destinataires, réponses reçues, constats ouverts, décisions bloquées, retards ; une échéance
   dépassée n'est jamais un accord.

### Tests
Scénario d'acceptation du concept 4 et v2.2 (« revue R03 restreinte pendant que R04 avance ») : revue sans adhésion à
l'organisation ; invitation transférée inopérante ; notes internes et éléments sans rapport inaccessibles, liens et exports
compris ; accès expiré ou révoqué refusé ; constat lié à la version exacte ; relecteur sans droit d'approuver ni de
diffuser ; paquet modifié = nouveaux contrôles ; dossier diffusé conforme aux versions approuvées.

### 🛑 Point d'arrêt 4 — démonstration du scénario complet au maître d'ouvrage.

---

## Phase 5 — Organisations (partie 5) — **après** la revue externe (OP-D10)

Espace d'organisation, adhésions (rôle, période, statut), groupes sans droit implicite, administration déléguée, gabarits
versionnés, annuaire interne distinct de l'annuaire du projet, départ et remplacement de représentant par mandat explicite.
Cadrage détaillé repris au 🛑 4, selon le retour d'usage des phases 1 à 4.

---

## Phase 6 — Recette et préparation

Scénario final du concept (« an organization forms a project team, an external participant reviews identified material… »)
pour le périmètre livré ; runbook de déploiement additif (migration, reprise, retour arrière) ; aucun déploiement sans
accord explicite. 🛑 Point d'arrêt final.

---

## 7. Traçabilité des exigences (MATRICE de la gestion des comptes, lignes « hors périmètre »)

| Exigence | Phase |
| --- | --- |
| C1-03 enregistrements personne, organisation, participation | 1 |
| C1-05 participants et équipe = vues des mêmes enregistrements | 1, 2 |
| C1-06 responsabilité, travail, permission séparés | 1, 2 (le travail affecté général reste hors priorité) |
| C2-01 partie propriétaire / gardien | 1 (selon OP-D1) |
| C2-06 transfert accepté par le successeur | après 🛑 4 (non prioritaire) |
| C3-01 invitation : aperçu, portée, expirations | 3 |
| C3-08 affectations de travail, délégation, fin de participation | 2 (fin de participation) ; affectations générales hors priorité |
| C4-01 paquet de revue, invitation nominative, espace externe, corrections | 4 |
| C4-02 trois échéances indépendantes | 3, 4 |
| C5-01 espace d'organisation | 5 |
| C6-01 notifications sans droit implicite | 4 (revue) ; extension partie 6 sur besoin observé |
| Journal d'activité et historique (ajout du maître d'ouvrage, 2026-10-23) | 3 bis |
| V22-02 cinq finalités d'invitation | 3 et 4 : `project_participation`, `review_package` ; `organization_membership` en 5 ; `restricted_resource` et `live_session` hors périmètre (OP-D11) |

---

## Annexe A — Décisions à prendre par le maître d'ouvrage (🛑 0)

Réponses du maître d'ouvrage du 2026-10-23 : [DECISIONS.md](DECISIONS.md), OP-1 (OP-D3 c, OP-D7 a ; les autres selon la
recommandation ; durée de conservation d'OP-D9 encore à fixer).

| N° | Question | Options | Recommandation |
| --- | --- | --- | --- |
| OP-D1 | La partie propriétaire du projet doit-elle être une organisation dès la phase 1 ? | (a) facultative : à défaut, la personne propriétaire actuelle ; (b) obligatoire | (a) — aucun projet existant à reprendre de force |
| OP-D2 | Ajout d'un compte existant | (a) invitation acceptée pour tous, fin de l'ajout direct (UM-8) ; (b) ajout direct conservé | (a) — conforme au concept v2.2 |
| OP-D3 | Modèle d'accès | (a) conserver `lecteur` / `editeur` pour l'accès au projet et ajouter un droit limité au paquet pour la revue ; moteur général actions × portées (partie 2) plus tard ; (b) moteur général dès la phase 1 ; (c) six rôles métier du concept (Lecteur, Concepteur, Relecteur, Coordinateur, Approbateur, Diffuseur) attribués par portée, `lecteur` → Lecteur et `editeur` → Concepteur sans perte d'accès | (a) — risque maîtrisé, aucun droit existant modifié |
| OP-D4 | Listes métier : rôles de participation, types d'organisation | (a) listes fournies par le maître d'ouvrage ; (b) saisie libre en attendant | (a) si disponibles, sinon (b) déclarée |
| OP-D5 | Socle du paquet de revue (première livraison) | (a) publication Studio candidate (manifeste figé) ; (b) avec documents Parcours / Documents | (a), (b) ensuite |
| OP-D6 | Constats externes | (a) observations Studio avec une audience « revue externe » ; (b) table distincte | (a) — une seule boucle de correction |
| OP-D7 | Un participant externe peut-il **approuver** ? | (a) oui, par une affectation d'approbation explicite et nominative ; (b) non, approbation réservée au propriétaire (règle actuelle) | décision métier : pas de recommandation |
| OP-D8 | Accès et permissions par défaut d'un relecteur externe | (a) compte identifié obligatoire (double authentification facultative) ; consulter et commenter ; télécharger, exporter et joindre seulement si accordé ; (b) autre | (a) — droits explicites (concept 2) |
| OP-D9 | Contacts sans compte : champs, visibilité, durée de conservation (RGPD) | proposition : autorisés ; coordonnées visibles des seuls responsables du projet ; aucune invitation implicite ; conservation à définir | décision métier et juridique |
| OP-D10 | Partie 5 (organisations) après la revue externe | (a) oui (séquence du concept) ; (b) avant | (a) |
| OP-D11 | 5e finalité « session temps réel » et « ressource restreinte » | (a) hors périmètre de ce chantier ; (b) incluses | (a) — aucun module temps réel |
| OP-D12 | Courriels | (a) la préproduction n'envoie rien (liens affichés) ; l'ouverture de la revue externe en production exige un envoi de courriels configuré ; (b) autre | (a) |
| OP-D13 | Lecteurs du journal (phase 3 bis) | (a) administrateur de la plateforme : tout ; responsable de projet : l'activité de son projet ; utilisateur : son propre historique ; (b) autre | (a) |

## Annexe B — Hors périmètre

Paie, gestion d'emploi, discussion générale, planification d'entreprise, décisions automatiques (concept 6) ; tout
déploiement ; toute modification de la garde DB-3 ou de ses clés.
