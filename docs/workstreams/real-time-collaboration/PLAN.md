# Temps réel (Real-time Collaboration) — plan d'implémentation

> Statut : **proposé, en cadrage (RTC-0)** ; Issue [#283](https://github.com/RachEma-ux/Fadi/issues/283) ; ouverture
> RTC-0 décidée (RT-D1) ; questions RT-Q1 à RT-Q7 répondues (RT-D2, précisée par RT-D3 : Studio seul, canal propre
> au Temps réel ; `DECISIONS.md`). Ce plan reprend le plan fourni le 2026-10-24 (base `main@2577e25`) **amendé** par l'évaluation
> [`EVALUATION-PLAN-TEMPS-REEL-2026-10-24.md`](../../continuity/EVALUATION-PLAN-TEMPS-REEL-2026-10-24.md) (écarts P1
> à P10, repérés `[Pn]` ci-dessous). Rien n'est implémenté ; aucune capacité n'est mesurée ; les budgets sont des cibles.

## 0. Règles d'exécution

- Le temps réel est une **sous-capacité de la Collaboration** dans le monolithe modulaire : ni microservice, ni module de
  premier niveau, ni second moteur métier (« No new module », règles communes).
- Écritures durables : **uniquement** par les commandes existantes — Studio (`submitStudioCommands` : `requestId`,
  `baseRevisionId`, verrou de projet) et Atelier (`/projects/:id/atelier/commands`, microversions, idempotence par
  `requestId`). Le canal en direct ne transporte jamais une écriture de modèle.
- Accès : le point unique `loadProjectAccess` (`lib/owned-project.ts`), qui passera aux affectations de rôles
  d'Organisations (phase 2) ; aucun droit propre au temps réel.
- Messages et notifications : COM (#280). Annotations, observations, tâches : la boucle Studio (CR-D1 (a)).
- Interface : libellés source français, traduction `en.json`, règle d'or (icône, barre, raccourci, test de
  non-collision avec la Planche, l'administration, COM-D14 et les commandes de collaboration Alt+Maj+chiffre) `[P8]`.
- Une valeur non mesurée reste « non mesurée » ; un contrôle qui n'a pas pu tourner est déclaré.

## 1. Constats de départ (vérifiés sur `main@2577e25`)

| Domaine | Existant | Usage par le temps réel |
| --- | --- | --- |
| Transport | Aucun WebSocket / SSE ; relectures périodiques (projet, notifications, journal et verrous de l'Atelier : 60 s). | Tout à construire (RTC-1). |
| Studio | Commandes versionnées, révisions, observations avec contexte de vue (`plan`, `3d`, `feuille`…), publications. | Adaptateur de vue partagée (RTC-2), annotations (RTC-3). |
| Atelier | Journal `GET /projects/:id/atelier/journal?apres=n` (curseur par révision), `atelier_outbox` transactionnelle (drapeau `processed_at`, pas un curseur client), versions nommées, verrous fins `atelier_locks` (clé, motif, échéance, auteur). | Source de rejeu et de notification de révision **déjà disponible** `[P2]` ; base de RT-R6 `[P6]`. |
| Réservation projet | `routes/lock.ts` : un éditeur actif, 30 min, 423. | Réservation visible en session (RT-R6). |
| Audience | `lib/audience.ts` : `equipe` / `projet` (E1) ; COM ajoute `participants` (COM-D3). | Projection par destinataire ; audience « paquet » attendue d'Organisations phase 4. |
| Autorité | Approbation / diffusion Studio au propriétaire ; PR #282 (E5) : Approbateur et Diffuseur désignables. | RT-R2 testé contre ces affectations `[P4]`. |
| Départ d'un membre | PR #282 (E6) : réservations et verrous libérés au retrait. | Reprise de réservation de session (RT-R6) `[P4]`. |
| Hors ligne | Dexie, files de lots, cache de modèle, `project-cache-guard`, oubli de la copie locale (E7). | Reprise de session branchée dessus, pas de seconde file. |
| Serveur | `app.listen` (`server.ts`), `helmet` sans CSP, garde CSRF des écritures par cookie, `trust proxy`. | Garde propre à l'upgrade `[P7]`. |
| Proxy | Caddy `reverse_proxy` ; préproduction derrière `basic_auth`. | Upgrade et cookies à vérifier sur le chemin réel. |

## 2. Périmètre

### Première version

- Créer, rejoindre, quitter, clore une session sur une **portée typée** : variante / révision Studio, ou paquet de revue
  figé Studio autorisé (RT-D3 : **Studio seul** ; ni Documents ni l'Atelier dans la première version).
- Participants permis, état de connexion, présentateur ; suivre / cesser de suivre, explicitement.
- Caméra, mode de vue, niveau, pointeur, sélection — seulement si le destinataire peut voir l'élément référencé.
- Annotation enregistrée délibérément : point de vue, repère et unités, révision source, références d'objets, auteur,
  audience ; reliée à une observation / tâche Studio ; conversation par COM.
- Changement de révision annoncé, jamais appliqué en silence ; revue figée épinglée.
- Reconnexion sûre, expiration de présence, reprise de l'hôte, retrait d'accès rapide.
- Revue asynchrone des annotations après la session.

### Reporté

Coédition simultanée 2D/3D, annulation collaborative dépendante, adoption avancée de paquets de coordination, BCF,
modèles fédérés, connecteurs CAO, audio / vidéo, enregistrement d'écran, annuaires d'entreprise, IA. Aucune approbation,
diffusion, adoption de référence ou résolution de conflit automatique. Sandbox exclu.

### Placement

Projet > Collaboration > **Sessions en direct** (libellé source français) `[P8]`, entrée contextuelle depuis Studio seul
(RT-D3). Bandeau de session compact et panneau repliable participants / annotations ;
pas de nouvelle coque pleine largeur. Toujours visibles : portée, révision ou paquet affiché, audience, suivi / navigation
libre, état de connexion. Présence non signalée par la seule couleur ; annonces d'accessibilité non intrusives.

## 3. Conception technique

### Frontières

| Propriétaire | Possède | Intégration |
| --- | --- | --- |
| Users Management / Organisations | identité, invitations, affectations, échéance, révocation | adaptateur d'autorisation unique à l'entrée, à la diffusion, à l'opération, à la reconnexion |
| COM | conversations, audiences de messages, notifications et leur remise | lien session ↔ conversation ; aucune messagerie locale ; **canal propre au Temps réel**, qui ne transporte pas COM (RT-D3) `[P5]` |
| Temps réel | cycle de vie des sessions, présence, présentateur, vue partagée éphémère, **canal** | orchestration mince |
| Studio | objets, commandes, révisions, observations, décisions formelles | API existantes, autorité |
| Atelier | modèle typé, commandes, journal, verrous, versions | **hors première version** (RT-D2, RT-D3) ; son journal à curseur reste l'option d'une version ultérieure, à décider à part `[P2]` |
| Documents | fichiers versionnés | **hors première version** (RT-D3) ; aucune session sur un document |
| Revue (Organisations phase 4, Studio) | paquets de revue figés | versions Studio exactes autorisées seulement |
| Parcours | contexte d'étape | liens seulement ; 21 étapes préservées |

### Transport et livraison

- WebSocket authentifié sur le serveur HTTP Express existant (RT-D2) ; bibliothèque proposée : `ws` 8.x (essai RTC-0.3,
  [`ESSAI-TRANSPORT.md`](ESSAI-TRANSPORT.md)). **Gestionnaire d'erreur sur chaque connexion** (sans lui, un message trop
  gros arrête tout le processus) ; cookie de session lu par la fonction de l'API (`__Host-fadi_sid` / `fadi_sid`), jamais
  par un nom codé en dur.
- **Garde de l'upgrade** `[P7]` : origine exacte (`WEB_ORIGIN`), cookie de session valide, compte actif, refus par défaut ;
  revalidation de la session de compte à intervalle borné et à chaque opération protégée ; `connect-src` si une CSP est
  introduite ; la garde CSRF HTTP n'est pas supposée couvrir l'upgrade.
- Deux classes :
  - **éphémère** (pointeur, caméra, sélection, battement) : limitée en débit, fusionnée, abandonnée si périmée, jamais
    persistée par défaut ;
  - **durable** (cycle de vie de session, changements métier acceptés) : enregistrement métier et événement dans la même
    transaction, diffusion après validation, identité stable, consommateurs sans doublon. Un accusé de socket ne prouve
    aucune sauvegarde.
- Sources d'événements durables : Atelier → hors première version (RT-D2) ; Studio → **pont explicite** à
  construire : la liste des révisions d'une variante et leurs changements (`…/variants/:id/revisions`,
  `…/revisions/:id/changes`) existent, mais aucun flux d'événements à curseur couvrant le projet n'a été constaté ; COM → ses propres tables et sa propre remise (RT-D2).
- Projection **par destinataire** : le serveur valide un message typé, résout la portée faisant autorité, construit ce que
  chaque destinataire peut recevoir ; sinon état « contenu non disponible » sans métadonnée cachée (RT-R7). Réutiliser la
  résolution de référence par lecteur de COM (COM-D8) plutôt qu'une seconde règle `[P5]`.
- Une instance d'abord, si les mesures le permettent ; avant plusieurs instances : diffusion et révocation partagées, test
  à deux instances. Une table d'appartenance en mémoire n'est pas une autorisation.

### Enregistrements proposés (noms à affiner)

| Enregistrement | Contenu minimal | Durée |
| --- | --- | --- |
| Session | id, portée discriminée (`studio-revision` · `paquet-revue`), ressource ou paquet épinglé, hôte, statut, dates, référence de politique d'audience | durable ; conservation RT-Q5 |
| Participant de session | session, compte, rôle hôte / présentateur / participant, entrée / sortie | assiduité si justifiée ; **jamais** un droit |
| Présence | connexion, vue permise courante, battement, échéance | éphémère |
| Annotation | identité d'observation / commentaire existante + point de vue, ancre objet / page, repère et unités, révision source, référence de session | celle du propriétaire, indépendante de la session |
| Événement de diffusion | id, version de schéma, portée, catégorie autorisée, curseur, révision source, référence de contenu | rejeu borné, distinct de l'audit |

Portée discriminée : une session projet et une session « paquet seul » ne sont pas interchangeables ; un `projectId`
deviné ne transforme pas un accès paquet en appartenance au projet. Une jonction « paquet seul » passe par l'autorisation
de revue, jamais par une route qui exige ou accorde l'appartenance au projet.

Enveloppe de message : version de protocole, session, type, id client, référence de contexte / révision, séquence
éphémère ou curseur durable, contenu validé. Le serveur fournit acteur et heure et vérifie chaque identifiant. Écriture
durable : clé d'idempotence par acteur et ressource, réutilisation avec un contenu différent refusée ; contrats
`requestId` / `baseRevisionId` / `baseRevision` existants conservés.

### Réservations `[P6]`

RT-R6 part de l'existant : la réservation projet (`routes/lock.ts`) pour la première version, et `atelier_locks`
(titulaire, clé de portée, motif, échéance) lorsque l'Atelier entrera dans le périmètre. Ajouts seulement : affichage en session, reprise autorisée à l'expiration ou au départ (avec E6,
PR #282), auteur historique jamais réécrit. Aucun nouveau système de verrous.

### Révocation et reprise

- Autorisation couvrant : état du compte, expiration de session, affectations actives, portée, audience, action ; relue à
  chaque opération protégée et avant chaque diffusion protégée, invalidation des abonnements longs ; échec fermé.
- Retrait sérialisé avec les écritures protégées ; après la révocation validée, **aucun** contenu protégé nouvellement
  mis en file ; ce qui est déjà transmis ne peut être rappelé (limite déclarée). Échéance et rétrécissement d'audience
  testés comme le retrait ; les droits indépendants valides sont préservés.
- Reconnexion : ré-authentifier → réévaluer la portée → rapprocher les `requestId` acceptés → instantané permis + curseur
  → reprendre. Curseur expiré → resynchronisation. Pointeurs et caméras anciens abandonnés. Réponse HTTP perdue après
  validation : pas de seconde révision au rejeu.
- Nettoyage de cache réutilisé (`project-cache-guard`, E7) ; un compte révoqué ne regagne rien par une requête en cache ni
  une mutation en file.

## 4. Lots et portes

| Lot | Travail et livrables | Dépendances | Preuve de sortie |
| --- | --- | --- | --- |
| **RTC-0 — contrats** | Ce dossier ; traçabilité RT-R1…R7 (§ 5) ; décisions RT-D1, RT-D2 ; essai de transport (Express 5 + Caddy + `basic_auth`) **hors `main`** ; budgets de référence | RT-D1 | Plan revu, chaque critère relié à un lot et un test ; questions répondues |
| **Porte des prérequis** `[P1]` | Fusion dans `main` : Organisations phases 2–4 (OP-3, #262), PR #282 (E5, E6), socle COM (#280) ; vagues 1–3 de la recette commune jouables | chantiers concernés | S1–S5 et S8 verts ; S3, S4 sur notifications ; invitation → revue figée → correction → approbation autorisée → diffusion séparée démontrée |
| RTC-1 — socle de session | Tables de session (migration additive), cycle HTTP, garde de l'upgrade, battement, limites, clôture, reprise d'hôte, **drapeau serveur désactivé par défaut** | RTC-0 + porte | Deux comptes autorisés rejoignent ; tiers et support refusés selon le cas ; échéance et redémarrage sans présence fantôme ; un compte retiré est déconnecté sans attendre |
| RTC-2 — vue partagée | Adaptateur Studio seul (RT-D3) ; présentateur / suivi ; caméra, pointeur, sélection selon les repères ; changement de révision explicite | RTC-1 | Deux clients partagent une vue permise ; aucune révision créée par la navigation ; le suivi n'écrase jamais le contexte d'édition |
| RTC-3 — annotations | Extension des observations et points de vue ; liens tâches ; COM ; pont d'événements Studio après validation | RTC-2, COM fusionné | L'annotation survit à la clôture ; source exacte gardée ; rejeu = un seul enregistrement ; note interne jamais reçue par un invité restreint |
| RTC-4 — revue externe en direct | Session sur paquet figé, avis d'invitation ciblé, actions permises, continuité de revue, révocation | RTC-3 + Organisations phase 4 | Client reste sur R03 pendant R04 ; aucune métadonnée cachée ; aucune route projet ; aucun export implicite ; hôte sans approbation |
| RTC-5 — robustesse et mise en service | Rejeu / instantané, bornes de files, proxy et redémarrage, supervision, navigateurs et appareils, retour arrière, recette de préproduction | RTC-1–4 | Tests § 6 des lots RTC-1 à RTC-5 verts (TR-T01 à TR-T10, TR-T15 à TR-T17 ; TR-T11 à TR-T14 restent aux lots RTC-6 et RTC-7) ; budgets mesurés ; retour arrière répété ; préproduction validée par le maître d'ouvrage |
| RTC-6 — coédition contrôlée | ADR distincte ; opérations dépendantes, réservations fines, conflits, annulation validée, calculs liés à la révision | Première version acceptée + besoin démontré | Mur / baie, annulation dépendante, rejeu hors ligne : aucun travail accepté effacé |
| RTC-7 — coordination | Paquet reçu / comparé / adopté explicitement ; organisation source, unités, repères, remplacement ; BCF / connecteurs optionnels | Socle prouvé ; décision de périmètre | Réception ≠ adoption ; dossiers antérieurs reproductibles |

Chaque lot : Issue → branche courte → PR → preuves → STATUS / HANDOFF → revue. Un seul propriétaire des fichiers partagés
de droits et de schéma, coordonné avec #262, #281, #282, #280.

## 5. Traçabilité RT-R1 à RT-R7 `[P3]`

| Critère (`collaboration-rules/PLAN.md` § 1.3) | Lots | Tests (§ 6) | Scénario commun |
| --- | --- | --- | --- |
| RT-R1 — droits revérifiés à l'entrée, à l'ouverture, à chaque envoi, à la reconnexion ; révocation coupe la diffusion | RTC-1, RTC-4, RTC-5 | TR-T01, TR-T07, TR-T15, TR-T17 | S6 |
| RT-R2 — aucun droit par l'hôte, le présentateur, la présence | RTC-1, RTC-4 | TR-T06 | S9 |
| RT-R3 — la session n'enregistre ni révision ni approbation ; annotations complètes | RTC-2, RTC-3 | TR-T03, TR-T04 | S3 |
| RT-R4 — paquet de coordination jamais adopté sans action | RTC-7 | TR-T14 | S7 |
| RT-R5 — reconnexion : état relu, opérations rapprochées, aucun doublon | RTC-3, RTC-5 | TR-T08, TR-T09 | S8 |
| RT-R6 — réservation : titulaire, portée, échéance, reprise ; départ → réattribution autorisée | RTC-1, RTC-5, RTC-6 | TR-T10 | — |
| RT-R7 — présentateur restreint ne diffuse rien de masqué | RTC-2, RTC-4 | TR-T02, TR-T05 | S4 |

## 6. Matrice de tests (à exécuter dans les lots ; aucun résultat ici)

Identifiants `TR-Txx` (distincts des critères `RT-Rx`) `[P3]`.

| ID | Parcours / condition injectée | Résultat exigé | Couche ; lot |
| --- | --- | --- | --- |
| TR-T01 | Concepteur rejoint la bonne session ; un tiers devine l'adresse | Portée correcte ; rien ne fuit vers le tiers | API + deux navigateurs ; RTC-1 |
| TR-T02 | Présentateur pointe un objet restreint ou forge des métadonnées | Aucun id, propriété, titre, vignette ni sélection non autorisés reçus | Protocole ; RTC-2/4 |
| TR-T03 | Suivre puis naviguer librement | Suivi explicite ; aucune écriture ; contexte d'édition conservé | Navigateur ; RTC-2 |
| TR-T04 | Annoter R03, créer R04, clore / rouvrir | Auteur, audience, point de vue, preuve R03 conservés | Base + navigateur ; RTC-3 |
| TR-T05 | Client sur R03 figée pendant R04 | Revue figée ; aucune note interne ; aucun accès projet | Trois navigateurs ; RTC-4 |
| TR-T06 | Hôte sans affectation Approbateur / Diffuseur appelle approuver / diffuser | Refus | API + navigateur ; RTC-4 |
| TR-T07 | Révocation, suspension, échéance, rétrécissement d'audience en pleine diffusion | Aucune diffusion protégée après la validation du retrait ; droits indépendants préservés | Concurrence déterministe ; RTC-4/5 |
| TR-T08 | Validation réussie, réponse perdue, reconnexion et rejeu | Un seul enregistrement / révision ; aucune notification en double | Base + injection réseau ; RTC-5 |
| TR-T09 | Curseur expiré, événement périmé, redémarrage, consommateur lent | Réinstantané autorisé ; mémoire bornée ; état de reconnexion visible | Intégration / charge ; RTC-5 |
| TR-T10 | Hôte part avec une réservation d'édition du projet (`routes/lock.ts`) | Reprise autorisée, échéance visible, auteur inchangé | Intégration + navigateur ; RTC-5 |
| TR-T11 | Deux concepteurs modifient un mur et sa baie de façon incompatible | Refus atomique / conflit, brouillon récupérable | Base réelle + modèle pur ; RTC-6 |
| TR-T12 | Annuler une action antérieure après une action dépendante d'un collègue | Refus ou compensation explicite | Domaine + intégration ; RTC-6 |
| TR-T13 | Calcul tardif pour une ancienne révision | Marqué périmé | Domaine / interface ; RTC-6 |
| TR-T14 | Paquet de coordination révisé reçu sans adoption | Référence existante conservée | Domaine / navigateur ; RTC-7 |
| TR-T15 | Invité restreint demande un export ou restaure un ancien cache | Droit courant appliqué ; règles lecteur (CR-D4) conservées | API / cache ; RTC-4/5 |
| TR-T16 | Clavier, tactile, écran étroit, FR / EN, mouvement réduit | Commandes utilisables, focus correct, aucune traduction manquante, raccourcis sans collision | Navigateur ; RTC-5 |
| TR-T17 | Upgrade WebSocket : origine étrangère, cookie expiré, compte suspendu, préproduction `basic_auth` | Refus avant toute diffusion `[P7]` | Intégration + proxy réel ; RTC-1/5 |

Recettes réutilisées : `collaboration-audience.mjs`, `comptes-securite.mjs`, `studio-persistance.mjs`,
`studio-observations.mjs`, `studio-hors-ligne.mjs`, `studio-conflits.mjs`, `atelier-versions.mjs`, `project-layout.mjs`,
`interface-anglais.mjs`, `communication.mjs` (après fusion de COM). Nouvelles suites sur base réelle : règles DB-3.
Chromium, Firefox, WebKit si possible, Android Chrome réel.

### Budgets proposés (cibles, à confirmer en RTC-0 sur P.118 et l'appareil de recette) `[P9]`

- 10 sessions × 10 participants par instance ; essai soutenu 60 min et rafale de reconnexions.
- Réseau déclaré 100 ms aller-retour : p95 vue distante ≤ 300 ms ; p95 annotation visible ≤ 1 s après validation ;
  p95 reconnexion ≤ 5 s.
- Battement ≈ 10 s ; présence périmée retirée sous 30 s (à revoir sur mobile en arrière-plan).
- ≤ 10 mises à jour pointeur / vue par seconde et par connexion ; 16 Kio / message, 256 Kio / connexion (candidats).
- Portes de sécurité et d'exactitude : zéro diffusion non autorisée, zéro effet durable en double, zéro écrasement
  silencieux de travail accepté.

Supervision : sessions, connexions, reconnexions, échéances de battement, refus d'autorisation, révocations, retard
d'événements, pression des files, rejets de validation, conflits de révision. Jamais de contenu, de jeton ni de
coordonnées personnelles dans les journaux.

## 7. Déploiement et retour arrière

1. Migrations par `init.sql` / Drizzle, additives, compatibles avec l'image précédente ; rôle de migration distinct.
2. Drapeau serveur désactivé par défaut ; désactivé, il refuse les nouvelles sessions et clôt proprement les actives ;
   édition et annotations enregistrées continuent.
3. Tests temps réel dans la CI requise ; recette courte de préproduction étendue (jonction, mise à jour à deux, refus d'un
   révoqué, reconnexion).
4. Vérifier upgrade, cookies, origine, `basic_auth`, délai d'inactivité du proxy, arrière-plan navigateur et vidange des
   connexions au déploiement sur le chemin Caddy réel.
5. Vérifier `/version` contre le SHA attendu.
6. Production : après validation de la préproduction par le maître d'ouvrage, preuve de sauvegarde / restauration,
   fenêtre convenue.
7. Retour arrière : couper le drapeau, puis image précédente si nécessaire ; ne supprimer aucune table ni restaurer une
   base automatiquement.

## 8. Estimation (indicative, après prérequis)

RTC-0 3–5 j·h ; RTC-1 5–8 ; RTC-2 5–8 (adaptateur Studio) ; RTC-3 5–8 (+2–5 pour l'intégration COM) ;
RTC-4 5–8 ; RTC-5 6–10. **Total 31–52 j·h (inchangé : l'adaptateur Documents retiré était compris dans la fourchette de RTC-2)** `[P10]`, hors prérequis et RTC-6/7. À réestimer après
l'essai de transport et l'intégration de la revue figée.

## 9. Écarts de l'évaluation → traitement

| Écart | Traitement dans ce plan |
| --- | --- |
| P1 séquence obsolète | § 4 « Porte des prérequis » ; RT-D1 |
| P2 Atelier absent | Tranché par RT-D2 : hors première version, déclaré explicitement (§ 2, § 3) |
| P3 RT-R1…R7 non repris | § 5 ; tests renommés `TR-Txx` |
| P4 PR #282 ignorée | § 1, § 3 « Réservations », TR-T06, TR-T10 |
| P5 frontière COM | § 3, RT-D2 |
| P6 verrous existants | § 3 « Réservations » |
| P7 sécurité de l'upgrade | § 3 « Transport », TR-T17 |
| P8 libellés et raccourcis | § 0, § 2 « Placement » |
| P9 budgets sans référence | § 6, RT-D2, RTC-0.4 |
| P10 estimation | § 8 |

## 10. Reprise du plan du 22 octobre (`docs/collaboration-temps-reel-plan`)

Ce plan remplace `collaboration-temps-reel/PLAN-CLAUDE-CODE.md` (branche non fusionnée). Ses apports encore valables :

| Apport | Vérification sur `main@2577e25` | Place ici |
| --- | --- | --- |
| Révocation : un retrait de droit ou une fin de session ferme **immédiatement** la connexion, sans attendre une boîte d'envoi | — (rien n'existe) | RTC-1, TR-T07 |
| Contenus durables : le canal annonce « révision disponible » (identifiants, révision) ; le contenu se relit par HTTP avec le droit courant | — | § 3 « Transport », classe durable |
| Annulation par auteur : `cibleAnnulation` prend aujourd'hui la **dernière commande du projet**, quel qu'en soit l'auteur (`routes/atelier-commands.ts:470`) ; en multi-utilisateur, A peut annuler le travail de B | constaté | Atelier hors première version (RT-D2) : à corriger avant que l'Atelier entre dans une session ; décision D4 de l'ancien plan **encore ouverte** (correctif séparé ou lot RTC-6) |
| Statut de Collaboration dans `apps/web/src/modules/module-registry.ts` : « partage multi-utilisateur et droits non disponibles (Lot 4) » est périmé (membres, rôles, audiences existent) — REP-06 | constaté | tâche RTC-0.6 (texte d'interface, traduction `en.json`) |
| Relectures périodiques à alléger quand le canal est connecté (projet, cloche de notifications, avis de révision Studio), gardées en secours | 60 s constatés | RTC-2 |
| Le service worker n'intercepte pas l'adresse du canal | — | RTC-1 |
| Test qui inspecte les charges émises : aucun contenu protégé dans un message | — | TR-T02 |
