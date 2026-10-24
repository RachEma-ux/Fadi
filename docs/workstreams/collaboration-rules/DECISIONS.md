# Règles communes de collaboration — décisions

Journal du chantier. Les décisions des chantiers propriétaires restent dans leurs journaux :
[gestion des comptes](../users-management/DECISIONS.md) (D-1 à D-7, UM-*),
[organisations](../organisations-participation/DECISIONS.md) (OP-0, OP-1 sur la PR #265, OP-D*). Aucune n'est recopiée ici.

## Décisions du maître d'ouvrage

- **CR-0 — Ouverture du cadrage (2026-10-24).** Le maître d'ouvrage demande le cadrage documentaire des règles communes
  de collaboration (« Oui lance le cadrage ») : aucun code, aucune migration, aucun déploiement ; une PR vers `main`, sans
  fusion. Principe du concept : aucun nouveau module ni moteur de workflow universel.
- **CR-R1 — Réponses aux décisions CR-D1 à CR-D10 (2026-10-24).** Réponse du maître d'ouvrage « OK CR-D1 à CR-D10 »,
  **relayée par la session d'exploitation** (session VPS) et non reçue directement dans la session de cadrage :
  - recommandations adoptées : CR-D1 (a), CR-D2 (a), CR-D3 (a), CR-D5 (a), CR-D6 (a), CR-D7 (a), CR-D8 (a), CR-D9 (a),
    CR-D10 (a) ;
  - **CR-D4 : en attente de précision.** Le maître d'ouvrage a aussi demandé de corriger l'écart E2. Une PR séparée
    (session « corriger les écarts E1 E2 E3 ») retire l'export par défaut aux **nouveaux** lecteurs, avec un droit que le
    propriétaire peut accorder, et laisse l'export aux lecteurs existants. Cette correction contredit l'option (a)
    recommandée (« le Lecteur interne garde l'export par défaut »). Rien n'est tranché ici : la réponse à CR-D4 doit dire
    laquelle des deux règles s'applique aux nouveaux lecteurs internes.

- **CR-R2 — Précision sur CR-D4 (2026-10-24).** Réponse « A » du maître d'ouvrage, **relayée par la session
  d'exploitation** : CR-D4 est tranchée en **(b) modifiée**. Aucun **nouveau** lecteur, interne ou externe, n'exporte
  sans un droit accordé explicitement par le propriétaire du projet. Les lecteurs existants gardent l'export (aucune
  régression). Le propriétaire et l'éditeur gardent l'export ; l'accès support ne l'a jamais. Motif : Fadi ne distingue
  pas encore lecteur interne et lecteur externe. La mise en œuvre relève de la PR séparée de correction des écarts E1,
  E2 et E3, pas de cette PR. La recommandation (a) n'est pas retenue.

- **CR-C1 — Correction des écarts graves E1, E2, E3 (2026-10-24).** Demande du maître d'ouvrage (« Corrige » les
  trois écarts graves de [PLAN.md](PLAN.md) § 3), relayée par la session d'exploitation du VPS. Une PR vers `main`
  ([#274](https://github.com/RachEma-ux/Fadi/pull/274), fusionnée par le maître d'ouvrage le 2026-10-24 : `2577e25`) ; migration strictement additive.
  Le code relève de la gestion des comptes (accès projet) et des modules Collaboration et Studio : ce journal consigne
  la correction parce que la PR #273 est fusionnée ; [UM-29](../users-management/DECISIONS.md) y renvoie.
  1. **E3 — journal des changements d'accès.** Ajout d'un compte existant, changement de rôle (partage ou PATCH),
     export accordé / retiré, retrait par le propriétaire, départ du membre et transfert de propriété écrivent chacun
     une entrée `admin.audit_log` **dans la transaction de l'action** (`project.member.added`, `.role_changed`,
     `.export_changed`, `.removed`, `.left`, `project.ownership.transferred`) : acteur, projet (cible), membre visé
     (`memberId`), rôle et export avant → après ; aucune adresse ; rien n'est écrit quand rien ne change ou que l'action
     est refusée. La ligne du membre est verrouillée (`FOR UPDATE`) pour que deux changements concurrents ne journalisent
     pas le même « avant ». L'acceptation d'une invitation reste tracée par `invitation.accepted` (inchangé, phase 2
     d'Organisations).
  2. **E2 — export du lecteur, selon la décision CR-D4 (CR-R2)** : **aucun nouveau lecteur, interne ou externe,
     n'exporte sans droit accordé explicitement par le propriétaire ; les lecteurs existants le conservent ;
     propriétaire et éditeur gardent l'export ; l'accès support jamais** (la recommandation (a) du cadrage gardait
     l'export à tout lecteur interne ; elle n'est pas retenue). `project_members.can_export` : migration additive — `ADD COLUMN … DEFAULT true` (chaque
     ligne existante reçoit TRUE : aucun lecteur actuel ne perd l'export) puis `SET DEFAULT false` (nouvelles lignes,
     invitations acceptées comprises). Propriétaire et éditeur exportent toujours, l'accès support jamais
     (`accessAllows`, `lib/owned-project.ts`, vérifié par chaque route `export` : documents, archive, téléchargements,
     copies, sources de référence externe, exports Studio). Le propriétaire accorde / retire l'export d'un lecteur dans
     l'écran des membres (case « Export », journalisée). Choix du chef de projet, justifiés : un éditeur rétrogradé
     lecteur redevient un nouveau lecteur (sans export) ; un droit d'export ne se règle pas sur un éditeur (422) ; NULL
     (ligne restaurée d'une archive antérieure à la colonne) vaut TRUE, comme les lignes migrées.
  3. **E1 — audience à l'intérieur d'un projet** (correction minimale, sans construire COM ; CR-D3 (a) : audiences fines
     à COM). Colonne `audience` (`equipe` | `projet`) sur `project_comments` et `studio_comments` ;
     migration additive : existants = `projet` (aucun changement silencieux), défaut `equipe` ensuite. `equipe` =
     propriétaire et éditeurs ; `projet` = tous les membres, lecteurs compris ; l'accès support (lecture seule, hors
     équipe) ne lit que `projet`. Une observation Studio est un commentaire d'origine (même identifiant) : son audience,
     celle de ses passages, liens, tâches et décisions est celle du commentaire ; une réponse suit son fil. Filtrage
     **serveur** sur toutes les lectures : listes et fils (étape, révision de l'Atelier), vue Collaboration, journal des
     révisions et `GET /projects/:id/history`, recherche d'observation par domaine, détail, notifications et leurs
     extraits, archive exportée par un lecteur (fils de l'équipe retirés avec tout ce qui les suit) ; toute action par
     identifiant sur un fil de l'équipe rend 404 au lecteur (réponse, changement d'audience, suppression, passages,
     liens, tâches, décisions). Les caches hors ligne ne reçoivent que ces réponses filtrées. Rédaction : case
     « Visible par les lecteurs » (Collaboration, plis d'étape, journal de l'Atelier, commentaires et observations
     Studio). Un lecteur écrit toujours pour tout le projet (une demande `equipe` de sa part : 422). L'audience d'un fil
     change par son auteur ou le propriétaire (tous deux de l'équipe), journalisée (`comment.audience_changed`) ;
     refusée vers `equipe` tant qu'un lecteur actuel a écrit dans le fil (409 : son texte lui serait retiré).
  4. **Limites déclarées au premier passage, levées au § 6** (demande du maître d'ouvrage : « Règle ces problèmes ») :
     cache local après changement d'audience ou de rôle (E7 / CR-D5), règle d'or des nouvelles commandes, conflit avec
     la PR #265.
  5. **Revue Codex de `b619ebb` (P1, retenue).** Une réponse lisait l'audience de son fil hors transaction : un
     changement d'audience concurrent pouvait laisser une réponse « projet » dans un fil devenu « équipe ». La racine
     du fil est désormais relue sous verrou partagé (`FOR SHARE`) dans la transaction de l'insertion, et le changement
     d'audience la verrouille en écriture (`FOR UPDATE`) : les deux se sérialisent (Collaboration et Studio).
  6. **Limites du § 4 levées (2026-10-24).**
     - **E7 — copie locale, selon CR-D5 (a).** `lib/project-cache-guard.ts`, branché sur le cache des requêtes
       (`main.tsx`) : au premier refus **404** du projet en ligne (le serveur répond 404 à qui n'en est plus membre),
       ou quand la liste relue des projets ne le contient plus, l'appareil **oublie le projet** — ses requêtes du cache
       persistant (fils, observations, journal, documents…), son modèle de l'Atelier, ses lots, brouillons et contextes
       Studio (`localStore.oublierProjet`), et relit les notifications ; les autres projets ne sont pas touchés. Un
       refus 404 d'une lecture à audience (fil devenu « équipe ») retire la copie de cette lecture. Un rôle hors de
       l'équipe (lecteur, support) relit les éléments à audience à sa première lecture du projet dans la session et à
       chaque changement de rôle : le fil réservé entre-temps disparaît de la copie. Choix du chef de projet : un 403
       (rôle insuffisant pour une action, accès conservé) ne purge pas ; une panne réseau non plus (la copie reste
       lisible hors ligne). Limite qui demeure, déclarée par CR-D5 : un appareil resté **hors ligne** garde sa copie
       jusqu'à sa prochaine lecture en ligne, et les fichiers déjà téléchargés restent hors de portée.
     - **Règle d'or étendue aux commandes de collaboration (choix du chef de projet).** `AGENTS.md` la pose pour la
       Planche ; elle est appliquée ici aussi, sans modifier `AGENTS.md` : `modules/collaboration/commandes-collaboration.ts`
       donne à chaque commande son icône propre et un raccourci affiché (`<kbd>`) et déclaré (`aria-keyshortcuts`) —
       Alt+Maj+1 « Visible par les lecteurs » (formulaire de rédaction : Collaboration, journal de l'Atelier,
       commentaires et observations Studio), Alt+Maj+2 « Rendre visible aux lecteurs » / « Réserver à l'équipe » (fil ;
       les deux sens d'une même bascule), Alt+Maj+3 « Export accordé » (ligne du membre). Alt+Maj+chiffre : aucun autre
       raccourci de Fadi ne l'emploie (les Alt+Maj+lettre sont pris par la Planche et l'administration). Contrôlé par
       `commandes-collaboration.test.ts` (icônes uniques, raccourcis sans collision, chaque écran porte icône,
       raccourci et gestionnaire) et exercé au clavier par `collaboration-audience.mjs`.
     - **PR #265.** Le transfert de propriété suit l'ordre d'écriture de #265 (ancien propriétaire ajouté éditeur, puis
       `owner_id`, puis retrait du nouveau propriétaire des membres : la participation tenue par déclencheurs ne
       s'interrompt pas), le journal à la suite dans la même transaction. #265 est fusionnée (`f59641c`) ; `main` est
       fusionné dans la branche, conflit de `members.ts` résolu ainsi, `app.test.ts` et tests `lib` verts (356) sur la
       combinaison.

## Décisions en attente

- Aucune : CR-D1 à CR-D10 sont répondues (CR-R1, CR-R2).

## Questions soumises (2026-10-24)

Questions et recommandations telles que soumises. Réponses : CR-R1 et CR-R2 ci-dessus.

| N° | Question | Options | Recommandation | Justification |
| --- | --- | --- | --- | --- |
| CR-D1 | Qui porte la « Collaboration partagée » (observations et tâches) ? | (a) la boucle observations / tâches / décisions de Studio en tient lieu, étendue plus tard par référence à Documents et Parcours ; (b) chantier distinct à ouvrir | (a) | Une seule boucle de correction existe déjà et OP-D6 (a) la réutilise pour la revue externe ; un second système contredirait « No module creates a competing… » (MATRICE M04). |
| CR-D2 | Une même personne peut-elle approuver **et** diffuser le même paquet ? | (a) oui, si elle détient explicitement les deux affectations ; (b) non, quatre yeux obligatoires | (a) | Le concept : « One person may hold several where explicitly authorized » ; (b) ajouterait une règle absente du concept et bloquerait les petites équipes. |
| CR-D3 | Audience à l'intérieur d'un projet avant l'ouverture de COM | (a) garantie minimale par Organisations phase 4 : un participant à portée « paquet » est exclu de toute route projet, notifications et journal compris ; audiences fines à COM ; (b) attendre COM ; (c) audiences fines dès la phase 4 | (a) | Ferme la fuite E1 avant toute revue externe sans construire COM dans Organisations ; (b) retarderait la revue externe, (c) dupliquerait COM. |
| CR-D4 | Le Lecteur **interne** garde-t-il l'export par défaut ? | (a) oui (comportement actuel, aucune régression) ; (b) non, export accordé explicitement à tous | (a) pour les membres internes ; les externes suivent OP-D8 (a) | Retirer l'export aux lecteurs actuels est une régression visible ; le risque vient des externes, déjà couverts par OP-D8 (a). |
| CR-D5 | Politique hors ligne après révocation ou retrait d'un projet | (a) purge du cache local de ce projet au premier refus 404 / 403 reçu en ligne ; les fichiers déjà téléchargés restent hors de portée, limite déclarée ; (b) conservation jusqu'à la déconnexion (actuel) | (a) | Le concept exige une politique « définie » ; (a) est le plus strict réalisable sans effacement à distance, et réutilise la purge existante (`auth-context.tsx`). |
| CR-D6 | Enregistrer la base d'autorité des actions formelles | (a) l'affectation (rôle × portée) utilisée, dans le journal de chaque transition de publication et de chaque changement d'accès, à partir de la bascule de la phase 2 ; aucune reprise rétroactive ; (b) ne rien ajouter | (a) | Règle 5 (« authority ») ; aujourd'hui seule la propriété est implicite (MATRICE R5). |
| CR-D7 | Départ d'un participant : réservations et responsabilités | (a) libération immédiate des réservations et verrous fins ; liste des observations, tâches et invitations à réattribuer, sans réattribution automatique ; (b) attendre l'échéance des verrous (actuel) | (a) | Aligne le retrait sur la suspension déjà en place (`admin/index.ts:157`) ; le concept interdit de bloquer le projet et de réécrire l'auteur. |
| CR-D8 | Vocabulaire commun en français | (a) glossaire fixé dans ce chantier : paquet de coordination, référence adoptée, paquet de revue figé, dossier approuvé, paquet diffusé ; la « publication » de l'Atelier = paquet de coordination ; identifiants de code inchangés ; (b) renommer aussi le code | (a) | L'interface est en français (D-163) et le mot « publication » est ambigu (E9) ; renommer le code n'apporte rien à l'usager. |
| CR-D9 | Ordre d'ouverture de COM et du Temps réel | (a) Organisations phases 1–4, puis COM, puis Temps réel ; (b) Temps réel avant COM | (a) | Le concept Map : « Validate the complete invitation-to-publication scenario first » ; COM rend S3, S4, S6 vérifiables sur les notifications, le Temps réel n'est requis que pour S6 en session, S7 et S9. |
| CR-D10 | Report des critères dans le PLAN d'Organisations | (a) PR distincte après la fusion de la #265, texte de l'annexe A du PLAN ; (b) amendement dans la #265 ; (c) critères tenus seulement ici | (a) | La #265 est en revue 🛑 1 : ne pas élargir son diff ; (c) disperserait les critères hors du plan qui les exécute. |
