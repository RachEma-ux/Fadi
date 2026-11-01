# Organisations, participation et revue externe — dossier de recette finale

Chantier [Issue #262](https://github.com/RachEma-ux/Fadi/issues/262), phase 6 du [PLAN](PLAN.md). Ce dossier relie chaque
exigence de la traçabilité du plan (§ 7) à sa phase, à ses preuves et à leur **statut constaté**. Il prépare le
**🛑 point d'arrêt final**, qui appartient au maître d'ouvrage. État : **non accepté** ; aucun déploiement.

## 0. Légende des statuts (aucun statut n'est présumé)

| Statut | Signification |
| --- | --- |
| **Vérifié en CI** | Constaté par la phase 6 dans un run GitHub Actions vert : run [40141370503](https://github.com/RachEma-ux/Fadi/actions/runs/40141370503), poussée sur `main` de la fusion de la PR #281 (`0d5bb9b`, 2026-10-24) — jobs `validate` (suites DB-3 **actives** : « ✓ DB-3 actif : toutes les suites API tournent sur la base attestée, aucune n'est refusée ») et `e2e (complements)` verts. Ce run porte sur `0d5bb9b` : le code a évolué depuis (phases 3, 4, portées étroites, reliquats de la phase 5, phase 6) **sans nouveau run CI** sur la branche. |
| **Vérifié en local** | Exécuté et vert sur ce poste, au commit de la phase 6 (base jetable `fadi_p6`, PostgreSQL 16 + PostGIS, API construite sur le port 3091, connectée en `fadi_app`, courriels en transport console) — voir [phase-6.md](phase-6.md) § 4. |
| **Non exécuté** | Preuve écrite mais jamais exécutée dans un environnement constaté (suites DB-3 hors CI : garde fermée localement ; CI non relancée). |
| **Non livré** | Hors périmètre décidé, ou reporté par le plan. |

Recette finale de bout en bout : [`apps/web/e2e/organisations-participation-final.mjs`](../../../apps/web/e2e/organisations-participation-final.mjs)
(« RF » ci-dessous) — **Vérifié en local** (155 contrôles, 0 échec) ; ajoutée à la tranche `complements` de la CI,
**Non exécuté en CI**.

## 1. Matrice de traçabilité (PLAN § 7)

| Exigence | Phase | Preuves | Statut |
| --- | --- | --- | --- |
| **C1-03** enregistrements personne, organisation, participation | 1 | Pur : `apps/api/src/lib/participations.test.ts`. Validation : `scripts/validation/participations-migration-check.mjs` (job `validate`). DB-3 : `apps/api/src/app.test.ts` (reprise, unicité, une personne dans deux projets). RF § 1–3 (organisation, contact sans compte, fiches). | Vérifié en CI (`0d5bb9b`) ; Vérifié en local (validation, RF) |
| **C1-05** participants et équipe = vues des mêmes enregistrements | 1, 2 | Pur : `participants.test.ts`. Recette : `apps/web/e2e/participants.mjs`. DB-3 : `app.test.ts` (bloc « Équipe et participants »). RF § 3 (annuaire, vue Équipe, responsabilités). | Vérifié en CI (`0d5bb9b`) ; Vérifié en local (`participants.mjs` 92 ✓, RF) |
| **C1-06** responsabilité, travail, permission séparés | 1, 2 | `participants.test.ts`, `participants.mjs` (rôles ≠ responsabilités ≠ accès, aperçu d'impact listant travaux Studio ouverts) ; RF § 3 et § 7. Le travail affecté général reste hors priorité (écart). | Vérifié en CI (`0d5bb9b`) ; Vérifié en local ; affectations générales : Non livré |
| **C2-01** partie propriétaire / gardien | 1 (OP-D1 a), 5 | `organisations.mjs` (déclaration sans droit), `organizations.test.ts` (DB-3) ; côté projet (reliquat) : `project-organizations-view.test.ts`, section « Côté projet » d'`organisations.mjs` ; RF § 2 (`owningOrganization`, `accessChanged: false`, membre toujours 404). | Espace d'organisation : Vérifié en CI (`0d5bb9b`). Côté projet (postérieur) : Vérifié en local ; cas DB-3 ajouté : Non exécuté |
| **C2-06** transfert accepté par le successeur | après 🛑 4 | — (non prioritaire selon le plan) | Non livré |
| **C3-01** invitation : aperçu, portée, expirations | 3 | Pur : `project-invitations.test.ts`. Recette : `apps/web/e2e/invitations-participation.mjs` (aperçu, renvoi sans doublon, refus v2.2, double soumission, horloge simulée). DB-3 : `app.test.ts` (cas de la phase 3). Validation : `participations-migration-check.mjs` § 7. RF § 3 (aperçu de l'accès résultant sans écriture, aperçu côté destinataire, portée étroite, échéance d'accès recopiée puis expirée). | Vérifié en local ; DB-3 et CI : Non exécuté |
| **C3-08** affectations de travail, délégation, fin de participation | 2 | Fin de participation : `participants.mjs`, `app.test.ts` (DB-3, « terminer retire l'accès à la requête suivante ») ; RF § 7 (aperçu des conséquences, 404 à la requête suivante, adhésion intacte). Affectations générales et délégation : hors priorité. | Fin de participation : Vérifié en CI (`0d5bb9b`) et en local ; affectations / délégation : Non livré |
| **C4-01** paquet de revue, invitation nominative, espace externe, corrections | 4 | Pur : `review-rules.test.ts`, `commandes-revue.test.ts`. Validation : `scripts/validation/revues-migration-check.mjs`. DB-3 : `apps/api/src/routes/reviews.test.ts`. Recette : `apps/web/e2e/revue-externe.mjs` (132 contrôles). RF § 4–6 (paquet figé, lien transféré, 404 sur 13 routes, constat sur R03, nouvelle version, recontrôle, approbatrice nommée, diffusion par l'équipe). | Vérifié en local (`revue-externe.mjs` tout vert, RF) ; DB-3 et CI : Non exécuté |
| **C4-02** trois échéances indépendantes | 3, 4 | Invitation ≠ accès : `invitations-participation.mjs`, RF § 3 (`invitationExpiresAt` 10 j ≠ `accessExpiresAt` 60 j ; accès expiré = 404). Échéance de réponse ≠ accès : `revue-externe.mjs` (échéance passée = retard, jamais accord ; accès expiré = 404) ; RF § 4 (`dueOn`). | Vérifié en local ; CI : Non exécuté |
| **C5-01** espace d'organisation | 5 | Pur : `organizations-rules.test.ts`. DB-3 : `organizations.test.ts`. Validation : `organisations-migration-check.mjs`. Recette : `organisations.mjs`. RF § 1 (création rejouable, adhésions acceptées, annuaire, externe 404). | Vérifié en CI (`0d5bb9b`) ; Vérifié en local (`organisations.mjs` 139 ✓, RF) |
| **C6-01** notifications sans droit implicite | 4 | `revue-externe.mjs` (notifications du destinataire : source « revue » seule, sans extrait de l'équipe) ; `notifications-preferences.mjs` (dix types) ; `communication.mjs`. | Vérifié en local (comptes rendus des phases 3 et 4 ; `revue-externe.mjs` rejouée en phase 6) ; CI : Non exécuté pour la source « revue » |
| **Journal d'activité et historique** (ajout du maître d'ouvrage) | 3 bis | Purs : `journal-audience.test.ts`, `apps/web/src/lib/journal-activite.test.ts`. DB-3 : `app.test.ts` (bloc « 7. journal d'activité »). Validation : `users-migration-check.mjs` (journal append-only, `fadi_app` sans UPDATE / DELETE). Recette : `journal-activite.mjs`. RF § 8 (administrateur : toutes les étapes ; utilisateur externe : ses actes seuls ; Coordinateur : historique du projet ; Concepteur 403 ; externe et participante terminée 404 ; aucune adresse en base). | Vérifié en CI (`0d5bb9b`) ; Vérifié en local (`journal-activite.mjs` 50 ✓, RF) ; familles `review.*` (postérieures) : Vérifié en local |
| **V22-02** cinq finalités d'invitation | 3, 4, 5 | `project_participation` : `invitations-participation.mjs`, RF § 3 ; `review_package` : `revue-externe.mjs`, `revues-migration-check.mjs`, RF § 4 ; `organization_membership` : `organisations.mjs`, `organizations.test.ts`, RF § 1 ; `restricted_resource`, `live_session` : hors périmètre (OP-D11 a). | `organization_membership` : Vérifié en CI (`0d5bb9b`) ; `project_participation` (phase 3), `review_package` : Vérifié en local, CI Non exécuté ; deux finalités : Non livré (OP-D11) |

### Exigences transverses vérifiées par la recette finale

| Exigence (concept, v2.2) | Preuve RF | Statut |
| --- | --- | --- |
| Une adhésion n'ouvre aucun projet ; membership ≠ participation | § 1–2 (membre 404 avant invitation) ; § 7 (fin de participation, adhésion intacte) | Vérifié en local |
| Lien transféré inopérant (adhésion, projet, revue) | § 1, § 3, § 4 | Vérifié en local |
| Portée étroite : capacité sur l'élément désigné seulement | § 3 (Concepteur de S1 modifie S1, 403 sur S2) ; `portees-etroites.mjs`, `portees.test.ts`, `portees-acces.test.ts`, DB-3 `portees-etroites.test.ts` | Vérifié en local ; DB-3 : Non exécuté |
| Externe : aucun accès hors du paquet | § 4 (13 routes du projet → 404, aucun projet listé, aucune adhésion) | Vérifié en local |
| Relecteur sans approbation ; approbatrice nommée par la transition Studio | § 5 | Vérifié en local |
| Paquet modifié = nouvelle version et nouveaux contrôles | § 5 (approbation de R03 refusée, v2, recontrôle) | Vérifié en local |
| Diffusion séparée, réservée à l'équipe ; dossier diffusé = versions approuvées | § 6 (externe 404, Concepteur 403, propriétaire 200, empreintes) | Vérifié en local |
| Journal sans adresse en clair | § 8 (relecture en base des entrées du projet et de l'organisation) ; script post-déploiement § 6 | Vérifié en local |
| Accessibilité WCAG 2.2 AA (axe-core) bureau et téléphone ; passe anglaise | § 9 (organisation, Collaboration, espace de revue, Mon historique, journal d'administration) | Vérifié en local |
| Contrôle après déploiement en lecture seule | `scripts/validation/organisations-participation-post-deploiement.mjs` (job `validate`) | Vérifié en local ; CI : Non exécuté |

## 2. Contrôles de schéma et d'exploitation

| Contrôle | Statut |
| --- | --- |
| `npm run db:migrate` deux fois (idempotence) | Vérifié en local (phase 6) ; Vérifié en CI (`0d5bb9b`, job `validate`) |
| `users-`, `participations-`, `organisations-migration-check.mjs` | Vérifié en CI (`0d5bb9b`) ; à revérifier en CI après les phases 3 et 4 |
| `revues-migration-check.mjs` | Vérifié en local (compte rendu de la phase 4) ; CI : Non exécuté |
| `organisations-participation-post-deploiement.mjs` (instantané avant / après, lecture seule prouvée, détection d'une perte d'accès et d'une adresse dans le journal sur une base dégradée exprès) | Vérifié en local ; CI : Non exécuté |
| Runbook ([RUNBOOK-deploiement.md](RUNBOOK-deploiement.md)) : requêtes SQL du § 5.2 et du § 6.1 exécutées en lecture seule | Vérifié en local |
| Déploiement en préproduction ou en production | **Non exécuté** (interdit sans accord du maître d'ouvrage) |

## 3. Écarts déclarés dans les comptes rendus

| Source | Écart |
| --- | --- |
| [phase-2.md](phase-2.md), [phase-3.md](phase-3.md) | Pont `op_sync_access` **conservé** (plan, phase 2 tâche 5 : « le miroir `acces` est alors retiré ») : les écritures historiques et une quinzaine de suites DB-3 passent par `project_members` ; la décision d'accès n'a qu'une source (la vue). Retrait : lot dédié, vérifié en CI. |
| phase-2.md | Restrictions explicites et délégation (concept partie 2) non modélisées ; affectations de travail générales absentes (l'aperçu d'impact ne recense que les observations et tâches Studio). |
| phase-2.md | Administration déléguée de projet non décidée : écritures de participation au propriétaire seul. |
| [phase-3.md](phase-3.md) | Acceptation depuis la notification : adresse vérifiée exigée (`email_unverified`). Raccourcis Ctrl+Alt+Maj+' \ ` (chiffres pris). Revalidation des « restrictions » limitée au statut, à l'échéance et aux rôles. |
| [phase-3bis.md](phase-3bis.md) | Route `GET /auth/me/history` (au lieu de `/account/history`) ; aucun export du journal (UM-20 ne le définit pas) ; « Mon historique » d'un invité externe montre aussi les actions visant son compte (à confirmer). |
| [phase-4.md](phase-4.md) | Délégation d'un destinataire absent = révocation + nouvelle affectation ; exception autorisée non livrée ; durée d'accès de revue par défaut 14 jours (OP-4) ; fils `revue` et tables de revue non archivés (archive de projet). |
| [phase-5.md](phase-5.md), [phase-5-reliquats.md](phase-5-reliquats.md) | Mandat sans droit de projet ; gabarit = fiches contact, rôles jamais accordés ; droits par groupe et administration déléguée fine non livrés ; aucun raccourci propre aux actions de l'écran Organisations ; pas de bouton « déclarer » côté projet ; invitation de projet du représentant mandaté depuis l'annuaire : raccordée en parallèle par un autre lot (hors phase 6). |
| [portees-etroites.md](portees-etroites.md) | Tout rôle de portée `documents` télécharge ces documents (Lecteur compris) ; Concepteur d'étude sans export ; auto-contrôle non identifié ; messages 403 génériques ; Atelier sans portée étroite (modèle unique). |
| phase 6 (ce lot) | Interrupteur propre à la tâche de conservation des contacts : `CONTACT_RETENTION_ENABLED` (OP-4, désactivée par défaut) ; les scripts `*-migration-check.mjs` ne se lancent pas en production (ils écrivent dans des transactions annulées et refusent une base non locale) : le contrôle de production est le script en lecture seule. |

## 4. Décisions encore à prendre par le maître d'ouvrage

1. **🛑 Point d'arrêt final — franchi (OP-5, 2026-10-25)** : acceptation du périmètre livré (phases 1 à 6), après une CI complète verte sur le commit
   final de la branche (aujourd'hui non relancée depuis `0d5bb9b`) ; puis, séparément, autorisation (ou non) d'un
   déploiement en préproduction, puis en production, selon le [runbook](RUNBOOK-deploiement.md).
2. **Réserve juridique d'OP-2** : avis du conseil juridique sur les obligations de conservation (garantie décennale…)
   avant que l'effacement automatique des contacts (2 ans après la clôture) puisse jouer. **OP-4** : interrupteur propre
   livré, effacement automatique désactivé par défaut. **OP-5 : réserve levée par le maître d'ouvrage** — activation au déploiement.
3. **Listes métier OP-D4 — décidé (OP-5) : saisie libre définitive** : rôles de participation (rôle métier), types d'organisation, fonctions — aujourd'hui en saisie
   libre déclarée.
4. **Durée d'accès de revue par défaut** : **décidée (OP-4)** — 14 jours, prolongeables (≤ 365).
5. **Portées étroites** ([portees-etroites.md](portees-etroites.md) § 5) : **décidé (OP-4)** — téléchargement par tout rôle
   de portée `documents` conservé, pas d'export pour un Concepteur d'étude ; restent ouverts : auto-contrôle (séparation
   des responsabilités, lot ultérieur), messages de refus nommant la portée.
6. **Retrait du pont `op_sync_access`** : **lancé (OP-4)**, lot OP-PONT ([lot-pont.md](lot-pont.md) à son terme), vérifié en CI.
7. **Décidé (OP-4)** : un invité externe voit dans « Mon historique » ses actions et celles qui visent son compte (administrateur anonyme).
8. Hors priorité, sur besoin : transfert accepté par le successeur (C2-06), affectations de travail et délégation
   (C3-08), finalités `restricted_resource` et `live_session` (OP-D11).
