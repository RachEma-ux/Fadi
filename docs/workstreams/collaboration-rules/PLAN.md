# Règles communes de collaboration — plan

> Demande du maître d'ouvrage du 2026-10-24 (« Oui lance le cadrage »), [Issue #272](https://github.com/RachEma-ux/Fadi/issues/272).
> **Statut : proposé, à valider.** Lot de cadrage documentaire : aucun code, aucune migration, aucun déploiement.
> Constat de départ : [MATRICE.md](MATRICE.md) (audit de `main` = `034dbfb`). Décisions ouvertes : [DECISIONS.md](DECISIONS.md).

## 0. Principe : aucun module, aucun moteur

Le concept est explicite : « No new module or universal workflow engine is required ». Ce chantier ne livre donc **ni
module, ni table, ni moteur d'états partagé**. Les cinq règles deviennent des **critères d'acceptation** inscrits dans les
plans des chantiers qui possèdent les enregistrements concernés (concept, « Module ownership ») :

| Propriétaire | Chantier | Ce qu'il porte pour les règles communes |
| --- | --- | --- |
| Users Management | [`users-management`](../users-management/CONTEXT.md) (fusionné), suite [`organisations-participation`](../organisations-participation/CONTEXT.md) | identité, participation, grants, portées, expirations, journal des changements d'accès, revue externe |
| COM | à ouvrir | conversations, audiences, notifications, aperçus, recherche |
| Temps réel | à ouvrir | sessions, présence, hôte, reconnexion |
| Collaboration partagée | à confirmer (CR-D1) | observations, tâches, liens de coordination |
| Studio | [`studio`](../studio/CONTEXT.md) | révisions, approbations, diffusion, paquets |
| Documents | module existant | versions de documents, aucune décision concurrente |
| Parcours | module existant | étapes, aucun système de droits propre |

Chaque enregistrement garde ses propres états (concept Map § 4) : invitations, messages, tâches, sessions et dossiers ne
partagent pas un cycle de vie commun. Ce chantier tient la traçabilité (matrice ↔ critères ↔ recette) et rien d'autre.

---

## 1. (a) Critères d'acceptation à inscrire chez les propriétaires

### 1.1 Organisations, participation et revue externe — **en premier**

La [PR #265](https://github.com/RachEma-ux/Fadi/pull/265) (phase 1) est **ouverte** au moment de ce cadrage et modifie
`organisations-participation/PLAN.md`. Ce plan **ne le modifie pas** : les ajouts exacts sont proposés en
[annexe A](#annexe-a--ajouts-proposés-au-plan-dorganisations) ; ils seront reportés dans ce PLAN par une PR distincte après
la fusion de la #265 et l'accord du maître d'ouvrage (CR-D10).

Synthèse des ajouts : journal des changements d'accès (phase 2) ; fin de participation qui libère réservations et verrous
et signale les responsabilités (phase 2) ; Approbateur et Diffuseur affectations distinctes avec base d'autorité
enregistrée (phase 2) ; expiration d'accès appliquée (phase 3) ; audience fermée du participant à portée « paquet » pour
commentaires, notifications, journal et exports (phase 4) ; recette des scénarios S1 à S5 et S8 (phase 6).

### 1.2 COM — à son ouverture

À inscrire dans le plan du chantier COM dès son ouverture (concept Communication, « Visible audiences », et Map § 5) :

1. **COM-R1** — Toute conversation a une audience identifiée, affichée en clair avant l'envoi ; changer d'audience est une
   action distincte et journalisée.
2. **COM-R2** — Notifications, aperçus, pièces jointes, recherche, exports et résumés IA sont filtrés **à l'envoi et à
   l'ouverture** par l'accès à la source et à la destination ; un titre, une vignette ou un extrait d'élément restreint ne
   fuit jamais par un lien posté dans une conversation plus large.
3. **COM-R3** — Une mention, un abonnement ou un lien n'ouvre aucun accès (recette : mention d'un non-membre → aucune
   donnée de projet reçue).
4. **COM-R4** — Les voies interne et externe d'une revue restent séparées ; une discussion interne ne devient visible que
   par un partage explicite d'éléments choisis.
5. **COM-R5** — La reprise des notifications existantes (`apps/api/src/routes/notifications.ts`) se fait sans régression :
   recalcul depuis l'accès courant (aujourd'hui l. 75-79, 119) et extraits soumis à l'audience (écart E1).
6. **COM-R6** — Une notification est un événement intermédiaire : ni accusé de réception, ni revue, ni approbation.
7. **COM-R7** — Transformer un message en observation ou en tâche crée l'enregistrement de la Collaboration partagée,
   sans état concurrent dans COM.

### 1.3 Temps réel — à son ouverture

À inscrire dans le plan du chantier Temps réel (concept Real-time v1.2, « Session authorization », « Concurrency and
recovery ») :

1. **RT-R1** — Les grants sont revérifiés à l'entrée, à l'ouverture de toute ressource protégée, à chaque envoi
   d'édition et à la reconnexion ; une révocation arrête toute diffusion protégée suivante (S6).
2. **RT-R2** — L'hôte, le présentateur ou un participant n'obtient aucun droit d'édition, d'approbation ou de diffusion
   du seul fait de la session (S9 : test « hôte sans affectation d'Approbateur → refus »).
3. **RT-R3** — Une session n'enregistre aucune révision et n'approuve rien ; les annotations enregistrées gardent auteur,
   référence exacte, point de vue, révision source et audience.
4. **RT-R4** — Un paquet de coordination reçu n'est jamais adopté sans action explicite (S7).
5. **RT-R5** — Reconnexion : état autorisé courant relu, identités d'opérations rapprochées, aucun doublon (S8).
6. **RT-R6** — Une réservation a un titulaire, une portée, une échéance et une voie de reprise ; le départ de l'hôte ou du
   titulaire déclenche une réattribution autorisée, sans changer l'auteur historique.
7. **RT-R7** — Un présentateur restreint ne diffuse ni propriété, ni vignette, ni référence de modèle masquée.

### 1.4 Studio, Documents, Parcours — non-régression

Ces modules satisfont déjà une partie des règles (MATRICE M05–M08, V06, V08, A06, S8). Critère à conserver dans chaque
lot qui les touche : la matrice des permissions Studio reste complète (`studio-permissions.test.ts`) ; Documents ne
crée aucune décision concurrente des paquets Studio ; Parcours n'introduit aucun système de droits propre ; aucune
approbation n'est ajoutée à l'Atelier.

---

## 2. (b) Recette de bout en bout des 9 scénarios

La recette est **une** suite de scénarios jouée sur une base jetable de CI, pas un moteur. Elle s'ajoute aux recettes
existantes (`comptes-api.mjs`, `studio-observations.mjs`, `studio-hors-ligne.mjs`, `studio-publication.mjs`) quand le
chantier qui la rend exécutable est livré. Nom proposé : `apps/web/e2e/collaboration-regles.mjs` (non créé ici).

### Ordre d'activation

| Vague | Condition | Scénarios exécutables en entier |
| --- | --- | --- |
| 1 | Organisations phases 1 à 3 fusionnées | S1, S2, S8 (invitation idempotente et reprise) |
| 2 | Organisations phase 4 fusionnée | S3 (avec audience), S4, S5 |
| 3 | COM ouvert et livré (CR-D9) | S3 et S4 vérifiés aussi sur les notifications et la recherche ; S6 côté diffusion |
| 4 | Temps réel ouvert et livré | S6 (en cours de session), S7 (paquet de coordination), S9 |

### Scénarios

| ID | Étapes de la recette | Résultat attendu | Rendu exécutable par | Réutilise |
| --- | --- | --- | --- | --- |
| S1 | L'architecte constitue l'équipe à partir de comptes vérifiés et de contacts ; affecte un travail à un membre sans changer son rôle | Affectation et accès inspectables séparément ; un contact sans compte n'a aucun accès | Organisations, phases 1–2 | PR #265 (`participations.test.ts`) |
| S2 | Invitation d'un ingénieur externe sur une portée ; tentative par un lien transféré ; invitation expirée ; acceptation ; échéance d'accès | Seule la portée affectée est ouverte ; transféré / expiré inopérants ; accès refusé après échéance | Organisations, phase 3 | e2e:comptes-api.mjs (refus d'invitation) |
| S3 | L'ingénieur commente R03 ; l'architecte promeut en observation et produit R04 | R03, son commentaire, son auteur et son audience inchangés ; R04 révision distincte | Studio (en place) + Organisations phase 4 (audience) | e2e:studio-observations.mjs |
| S4 | Le client reçoit un paquet de revue figé ; tente routes projet, Studio, Documents, notifications, journal, export | Seul le paquet est visible ; notes internes et éléments sans rapport inaccessibles, liens et exports compris | Organisations, phase 4 | recette d'accès de la phase 4 (modèle UM-20) |
| S5 | Un Relecteur tente d'approuver ; l'Approbateur approuve ; le Diffuseur diffuse ; on modifie une source puis on rediffuse | Relecteur refusé ; diffusion des seules versions approuvées ; source changée → nouvelle approbation exigée | Organisations phase 2 (rôles) + Studio | api:lib/studio-publication-statuts.test.ts:217, :226 |
| S6 | Révocation de l'ingénieur pendant qu'il travaille (puis, vague 4, pendant une session) | Actions protégées et diffusion arrêtées à la requête suivante ; ses autres grants valides restent | Users Management (en place), COM, Temps réel | api:app.test.ts:1970-1973 ; e2e:comptes-api.mjs:149, :287 |
| S7 | L'ingénieur partage un modèle révisé ; l'équipe le reçoit, le compare, ne l'adopte pas | L'ancienne référence reste en usage jusqu'à adoption explicite | Temps réel (paquet de coordination) ; Atelier déjà en place | e2e:atelier-complements.mjs:2663 |
| S8 | Hors ligne, une correction et une acceptation d'invitation sont envoyées deux fois ; conflit concurrent | Aucun écrasement silencieux ni doublon ; brouillon récupérable visible | Studio et UM (en place) ; Temps réel pour l'édition simultanée | e2e:studio-hors-ligne.mjs:3-17 |
| S9 | L'hôte d'une session, sans affectation d'Approbateur, tente d'approuver | Refus, même s'il contrôle la session | Temps réel (+ rôles d'Organisations phase 2) | api:lib/studio-publication-statuts.test.ts:73 |

---

## 3. (c) Écarts constatés dans les modules existants

Gravité : **Haute** = fuite d'information ou action formelle non tracée, à corriger avant toute ouverture à un
participant externe ; **Moyenne** = règle incomplète, sans fuite actuelle constatée ; **Basse** = clarté, vocabulaire,
dette déjà décidée.

| N° | Gravité | Écart (preuve) | Règle | Propriétaire | Traitement proposé |
| --- | --- | --- | --- | --- | --- |
| E1 | Haute | Aucune audience à l'intérieur d'un projet : tout membre lit tous les commentaires et observations et en reçoit les extraits en notification (api:routes/collaboration.ts:270 ; api:routes/notifications.ts:121-139). Un client invité en `lecteur` verrait les notes internes. | R3, A02, S4 | Organisations (phase 4), puis COM | Phase 4 : participant à portée « paquet » exclu de toute route projet, y compris notifications et journal ; audiences fines à COM (CR-D3). |
| E2 | Haute | Export ouvert au `lecteur` (api:lib/owned-project.ts:43 ; e2e:comptes-securite.mjs:343) : tout participant en lecture sort le contenu du projet. | R3, A02 | Organisations (phases 2 et 4) | Export accordé explicitement aux externes (OP-D8 a, déjà décidé) ; défaut du Lecteur interne : CR-D4. |
| E3 | Haute | Ajout direct, changement de rôle, retrait d'un membre et transfert de propriété non journalisés (api:routes/members.ts:145, 152, 174, 196). | R5 | Organisations (phase 2) | Journaliser dans `admin.audit_log` dans la même transaction (déjà prévu pour les participations, tâche 5 reportée en phase 2) ; y inclure le transfert de propriété. |
| E4 | Moyenne | `access_expires_at` présent (api:db/schema.ts:118) mais jamais renseigné ni appliqué (api:lib/invitations.ts:75-85 ; api:lib/owned-project.ts:92-105). | S2, C4-02 | Organisations (phase 3) | Échéance d'accès portée par la participation et vérifiée par `loadProjectAccess`. Aucun écran ne promet aujourd'hui cette échéance (aucune fuite). |
| E5 | Moyenne | Approbation et diffusion réservées au propriétaire : Approbateur et Diffuseur ne peuvent être distincts ; la base d'autorité n'est pas enregistrée (api:lib/studio-publication-statuts.ts:43-49). | R2, R5, S5 | Studio, avec la bascule d'Organisations phase 2 | Affectations distinctes (OP-D3 c) ; enregistrer l'affectation utilisée dans le journal de publication (CR-D2, CR-D6). |
| E6 | Moyenne | Le retrait d'un membre ne libère ni sa réservation d'édition ni ses verrous fins (api:routes/members.ts:174-188), contrairement à la suspension (api:routes/admin/index.ts:151) ; ses observations et tâches ne sont pas signalées. | A05 | Organisations (phase 2, fin de participation) ; Studio | Libération dans la même transaction ; liste des responsabilités à réattribuer, sans réattribution automatique (CR-D7). |
| E7 | Moyenne | Après retrait d'un projet, son cache local reste sur l'appareil jusqu'à la déconnexion (purge à la déconnexion ou au 401 seulement : web:lib/auth-context.tsx:57, 142). | S6, Map § 5 | Collaboration (client hors ligne), Users Management | Politique hors ligne à décider (CR-D5). |
| E8 | Basse | Grant hors invitation par l'ajout direct d'un compte existant (api:routes/members.ts:109-149, UM-8). | M01 | Organisations (phase 3) | Déjà décidé : OP-D2 (a). |
| E9 | Basse | « Publication » désigne un instantané partagé dans l'Atelier (api:db/schema.ts:672) et un dossier soumis à approbation dans Studio. | V07 | Studio / Atelier (documentation) | Glossaire français du vocabulaire commun, identifiants de code inchangés (CR-D8). |
| E10 | Basse | Gardien du contenu non modélisé ; seule la propriété du projet existe (api:routes/members.ts:196-219). | A03 | Organisations (responsabilités d'équipe) | Responsabilité d'équipe déclarée, sans droit implicite ; à préciser au 🛑 1 d'Organisations. |

Aucun écart n'a été corrigé par ce lot.

---

## Annexe A — Ajouts proposés au PLAN d'Organisations

Texte à insérer dans `docs/workstreams/organisations-participation/PLAN.md` **après la fusion de la PR #265**, sous
réserve de l'accord du maître d'ouvrage. Les identifiants `CR-O*` renvoient à cette matrice.

**Phase 2 — Tâches, ajouter :**

> 6. **Journal des changements d'accès (CR-O2-1, E3)** : ajout, changement de rôle, retrait, fin de participation et
>    transfert de propriété écrits dans `admin.audit_log` dans la transaction de l'action : acteur, projet, participation,
>    rôle avant / après, base d'autorité de l'acteur ; aucune adresse en clair.
> 7. **Fin de participation (CR-O2-2, E6)** : libère dans la même transaction la réservation d'édition et les verrous fins
>    du participant ; affiche les observations, tâches et invitations dont il est responsable pour une réattribution
>    explicite ; l'auteur historique n'est jamais réécrit.
> 8. **Approbateur et Diffuseur (CR-O2-3, E5)** : la bascule de `loadProjectAccess` rend l'approbation et la diffusion
>    Studio à des affectations distinctes ; chaque transition de publication enregistre l'affectation qui l'a permise.

**Phase 2 — Tests, ajouter :** « Retirer une participation laisse intacts les grants du même compte sur un autre projet
(A04) ; le journal contient l'entrée de chaque changement d'accès ; un Relecteur n'approuve pas, un Approbateur sans
affectation de Diffuseur ne diffuse pas. »

**Phase 3 — Tâches, ajouter :**

> 6. **Échéance d'accès appliquée (CR-O3-1, E4)** : l'expiration d'accès de l'invitation est reportée sur la participation ;
>    `loadProjectAccess` refuse après l'échéance (404 à la requête suivante).

**Phase 3 bis — Tâches, ajouter :** « Chaque entrée affichée expose acteur, portée, révision source s'il y en a une, base
d'autorité et résultat (règle 5) ; l'audience de la vue est filtrée côté serveur. »

**Phase 4 — Tâches, ajouter :**

> 8. **Audience fermée (CR-O4-1, E1, E2)** : un participant à portée « paquet » ne reçoit aucune notification de
>    commentaire, d'observation, de tâche, de verrou ou de modification du projet, aucune ligne du journal du projet et
>    aucun export hors des droits accordés ; la recette parcourt chaque famille de routes (projet, Parcours, Studio,
>    Documents, Collaboration, notifications).
> 9. **Distinctions de la revue (CR-O4-2)** : réception, ouverture, accusé de réception, constats, réponse, revue terminée,
>    approbation et diffusion sont des états ou événements distincts ; une revue terminée n'est pas une approbation.
> 10. **Révision figée (CR-O4-3)** : un relecteur de R03 reste sur R03 pendant que R04 avance ; un nouveau paquet exige un
>     partage explicite.

**Phase 6 — Recette, ajouter :** « Scénarios S1 à S5 et S8 de
[`collaboration-rules/PLAN.md`](../collaboration-rules/PLAN.md) § 2 joués en CI ; S6, S7 et S9 déclarés partiels jusqu'aux
chantiers COM et Temps réel. »

**§ 7 Traçabilité, ajouter :** une ligne « Règles communes de collaboration (CR-O2-1 à CR-O4-3) → phases 2, 3, 3 bis, 4, 6 ».
