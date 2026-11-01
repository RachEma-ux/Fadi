# Communication (COM) — plan d'implémentation

> Demande du maître d'ouvrage du 2026-10-24 : « Exécute entièrement l'implémentation du module Communication (COM) selon
> le plan d'implémentation du module Communication (COM) », [Issue #280](https://github.com/RachEma-ux/Fadi/issues/280).
> Aucun plan COM n'existait : celui-ci est établi à partir du concept
> [`Fadi Concept - Communication.md`](../../../Fadi%20Concept/Fadi%20Concept%20-%20Communication.md) (v1.2), des critères
> **COM-R1 à COM-R7** inscrits par le cadrage des règles communes
> ([`collaboration-rules/PLAN.md`](../collaboration-rules/PLAN.md) § 1.2) et des décisions CR-D1, CR-D3, CR-D5, CR-D9.
> Source relue le 2026-10-24 dans sa forme `.docx` sur `main` (`Fadi Concept - Communication.docx`) : contenu identique au
> `.md` (seul l'encodage des signes `>` diffère). La relecture a fait ajouter la phase COM-5 bis.
> **Statut : exécuté dans la même demande** (phases COM-1 à COM-8) ; les choix du chef de projet sont consignés
> [DECISIONS.md](DECISIONS.md) (COM-D1 à COM-D14) et restent soumis à l'acceptation du maître d'ouvrage.

## 0. Règles d'exécution

- COM possède : conversations, messages, audiences, acheminement, états de remise, accusés de réception et vues
  d'attention (concept, « Responsibility for shared records »). Il **ne possède pas** les tâches, observations, demandes
  de précision, approbations ni diffusions : il les crée par leur propriétaire et en **affiche** l'état (COM-R7).
- L'accès est recalculé **à chaque requête** depuis l'accès courant au projet (`loadProjectAccess`) : aucune donnée de
  conversation n'est conservée pour quelqu'un qui n'y a plus droit (OWASP, refus par défaut ; COM-R2, COM-R5).
- Tout texte d'interface en français, traduit dans `en.json` (D-163) ; règle d'or appliquée aux commandes COM comme aux
  commandes de collaboration (CR-C1 § 6) : icône propre, barre, raccourci, contrôlés par test.
- Aucune donnée inventée : un seuil d'urgence, une durée de conservation ou un délai d'escalade que le concept laisse
  ouverts restent **non définis** et affichés comme tels.

## 1. Périmètre retenu

| Étape du concept | Retenu ici | Reporté (motif) |
| --- | --- | --- |
| 1 Fondation | deux modes (contextuel ; direct / groupe), règles d'audience, propriété des enregistrements, liens de contexte, politique d'historique, placement | espace d'**organisation** (Organisations phase 5, OP-D10) |
| 2 Première boucle | fils contextuels, conversations directes et de groupe, références (étape, document, fichier, variante, observation, message, demande, révision de l'Atelier), réponses tenues, notifications, file hors ligne idempotente ; **photos et épingles** (lot COM-13, COM-A3) | **espace de revue externe** et audience « paquet » (Organisations phase 4) |
| 3 Organisations et échanges | outil de reprise au départ d'un participant (responsabilités, réattribution, animation) | modèles d'organisation, vues de portefeuille, BCF, SCIM, Procore (décisions « first external connector ») |
| 4 Assistance | — | connecteurs natifs, courriel entrant, réunions, résumés IA (après le socle, concept § 6) |
| v1.2 Invitations | — | événements de remise des courriels d'invitation : relèvent de UM-28 (envoi), affichage à reprendre ensuite |

## 2. Modèle (schéma additif, `apps/api/src/db/init.sql`)

| Table | Rôle |
| --- | --- |
| `com_conversations` | projet, mode (`contexte` · `groupe` · `direct`), titre, **audience** (`participants` · `equipe` · `projet`), contexte (type, référence, révision exacte), animateur, auteur, dates |
| `com_participants` | personnes nommées d'une audience `participants` ; `history_from` (historique reçu à l'ajout), retrait daté |
| `com_messages` | auteur, corps, nature (`message` · `partage` · `action`), réponse à, références, mentions, accusé demandé, urgent, heure de capture distincte de la réception, `client_request_id` idempotent, provenance d'un partage (serveur seul), modification et retrait datés |
| `com_message_versions` | textes remplacés (historique d'une modification ou d'un retrait) |
| `com_receipts` | ouverture et accusé de réception par personne |
| `com_reads` | dernière lecture d'une conversation par personne |
| `com_events` | journal de la conversation (création, audience, participants, animation, modification et retrait de message, partage reçu, action liée) : ajout seulement |
| `com_links` | lien message → enregistrement de référence (demande de précision, observation Studio) ; l'état est relu à la source |
| `collab_demandes`, `collab_demande_events` | **Collaboration partagée** (pas COM) : demande de précision — question, références, demandeur, répondant tenu, échéance, audience (E1), réponse et journal de clôture |

## 3. Phases

### COM-1 — Socle : conversations, audiences, messages (API)

1. `lib/com-audience.ts` (pur) : lisibilité (`peutLire`), écriture (`peutEcrire`), gestion (`peutGerer`), libellé clair
   de l'audience (`libelleAudience`), contrôle d'un changement d'audience (aucun auteur ne perd la lecture de son propre
   message), historique reçu par un participant ajouté.
2. Routes `/projects/:projectId/com/conversations` : liste (filtres « à traiter », « non lues », contexte), création,
   lecture (messages lisibles seulement, à partir de l'historique reçu), changement d'audience **action distincte et
   journalisée** (COM-R1), ajout / retrait de participants avec choix de l'historique, animation transférée.
3. Messages : envoi idempotent (`clientRequestId`, même auteur et même contenu = rejeu, sinon 409), heure de capture,
   réponse, références validées dans le projet, mentions de membres ; modification (ancienne version conservée) et retrait
   (texte retiré de l'affichage, indication visible) par l'auteur.
4. **COM-R2 / COM-R3** : chaque référence est résolue **pour le lecteur** (titre seulement si l'élément lui est
   accessible, sinon « élément non accessible ») ; une mention d'une personne qui ne lit pas la conversation est
   signalée à l'auteur et **ne notifie pas** ; une mention hors projet est refusée (422) ; aucune mention n'ouvre d'accès.

### COM-2 — Partage d'extraits et actions liées

1. Partage d'extraits choisis vers une autre conversation : **aperçu** (destinataires réels de la cible, contenu exact,
   empreinte), puis confirmation avec l'empreinte — une audience changée entre-temps rend 409 (COM-R4).
2. Le message partagé porte « partagé par … depuis une conversation » sans titre ni métadonnée de la source.
3. Action liée (COM-R7) : depuis un message, **demande de précision** ou **observation Studio** (`openStudioObservation`)
   créées par leur propriétaire, avec le même aperçu d'audience ; COM n'enregistre que le lien et un message « action »,
   l'état affiché est relu à la source.

### COM-3 — Demandes de précision (Collaboration partagée)

Routes `/projects/:projectId/collaboration/demandes` : liste filtrée par audience, création, détail avec journal,
passages `repondre` (répondant seul), `cloturer` (demandeur ou propriétaire ; sans réponse, motif exigé), `rouvrir`,
`reattribuer` (le nouveau répondant doit lire la demande). Réponse et question jamais réécrites : une correction passe par
une réouverture et une nouvelle réponse. Une échéance dépassée laisse la demande ouverte, signalée « en retard ».

### COM-4 — Remise, accusés, boîte personnelle, notifications

1. États distincts : accepté par Fadi, ouvert, accusé de réception (COM-R6 : aucun n'est une revue ni une approbation) ;
   « accusé demandé » et « urgent » sur un message ; compteurs et personnes en attente visibles de l'auteur.
2. `GET /com/boite` : messages directs et de groupe non lus, mentions, accusés attendus, demandes à répondre (en retard
   signalées), demandes répondues à clore — tous projets accessibles, recalculés à la lecture.
3. Notifications (COM-R5) : types `message` et `demande` ajoutés à `GET /notifications`, mêmes préférences (types
   masqués, projets muets) ; extraits soumis à l'audience courante ; aucune régression des types existants.

### COM-5 — Interface

| Lieu (concept) | Livraison |
| --- | --- |
| Global > Ma boîte | page `/boite` et lien de l'en-tête |
| Projet > Collaboration > Communication | section « Communication » : conversations, fil, rédaction avec « Visible par : … » avant l'envoi |
| Projet > Collaboration > Demandes et revues | section « Demandes de précision » |
| Projet > Collaboration > Communication (activité) | section « Activité du projet », filtrable (COM-5 bis) |
| Projet > Collaboration > Requests and reviews | section « Demandes et revues » : demandes de précision et revues Studio liées |
| Studio, Parcours, Documents > panneau contextuel | pli d'étape du Parcours, conversations de la variante Studio, conversations sur les documents |

Règle d'or : commandes COM dans `commandes-collaboration.ts` (icône propre, barre, raccourci Alt+Maj+chiffre ou
ponctuation), test étendu.

### COM-5 bis — Activité du projet, revues liées, panneaux contextuels Studio et Documents

1. `GET /projects/:projectId/com/activite` (concept « Project activity and personal inbox ») : messages, demandes de
   précision, observations, tâches et décisions Studio, revues et diffusions Studio, filtrés par les droits de chacun ;
   libellés distincts (commentaire, tâche terminée, approbation) ; filtres « à traiter par moi », « questions non
   résolues », famille, auteur, date, étape ; heure de capture montrée à côté de la réception.
2. `GET /projects/:projectId/com/revues` (« Requests and reviews ») : dossiers Studio soumis, approuvés, refusés, diffusés
   ou retirés, état relu à Studio sans duplication.
3. Panneaux contextuels : « Conversations sur la variante » (Studio, panneau des commentaires) et « Conversations sur les
   documents » (module Documents), en plus du pli d'étape du Parcours.

### COM-6 — Hors ligne

File d'envoi rejouable (mutation persistée, `clientRequestId`, heure de capture) ; états montrés : enregistré sur cet
appareil, en attente d'envoi, envoi, accepté par Fadi, bloqué (brouillon récupérable). À la reconnexion le serveur
revérifie l'accès : une personne révoquée ne publie rien (404), le brouillon reste. Message urgent sans réseau :
« Non envoyé — pas de connexion. Utilisez la procédure de contact immédiat du projet si une réponse est nécessaire maintenant. »

### COM-7 — Continuité au départ d'un participant

`GET /projects/:projectId/com/responsabilites` (propriétaire) : demandes à répondre ou ouvertes, conversations animées et
accusés attendus de chaque personne, y compris celles qui n'ont plus accès ; réattribution d'une demande et transfert de
l'animation, l'auteur historique jamais réécrit. Retirer quelqu'un d'une conversation et transférer sa responsabilité
restent deux opérations distinctes.

### COM-8 — Recette et documentation

Recette `apps/web/e2e/communication.mjs` (API et interface réelles, CI tranche `parcours`) couvrant les scénarios
d'acceptation du concept : conversation privée qui mentionne un projet ; mention d'un non-membre ; lecteur exclu d'un
fil d'équipe sur toutes les routes (liste, détail, boîte, notifications, références) ; partage interne → partagé avec
aperçu et empreinte ; révocation avant synchronisation (envoi refusé, aucune publication) ; rejeu sans doublon ; demande de
précision complète ; départ d'un participant ; interface, clavier et traduction anglaise.

### COM-13 — Photos et épingles (COM-A3, COM-D15 à COM-D19)

1. Photos : compressées sur l'appareil (JPEG, 2 560 px et 2 Mo au plus), gardées dans IndexedDB (`comPhotos`) jusqu'à
   l'acceptation du message ; `POST …/com/conversations/:id/pieces` (corps brut, rejeu par `X-Client-Request-Id`) :
   type par signature, dimensions lues, métadonnées EXIF / XMP / texte retirées par le serveur (`lib/com-images.ts`) ;
   jointes par `pieces` à l'envoi du message ; `GET …/com/pieces/:id` à qui lit le message (l'auteur seul avant de
   joindre ; jamais l'accès support ; rien pour un message retiré) ; recopiées au partage d'un extrait.
2. Épingle : point sur le plan d'une révision exacte d'une variante Studio (repère local, mètres), validé par
   `readStudioContext` ; plan servi par `GET …/com/plan` (export SVG Studio) ; une observation Studio créée depuis le
   message reprend la révision et les objets.
3. Position : seulement si l'auteur coche « Joindre ma position », repère geographic (WGS84), précision déclarée.
4. Interface : « Joindre une photo » (Alt+Maj+.) et « Épingler sur un plan » (Alt+Maj+`), aperçus, plan cliquable ;
   recette `communication.mjs` § 13 et § 11.

## 4. Traçabilité COM-R1 à COM-R7

| Critère | Phase | Preuve |
| --- | --- | --- |
| COM-R1 audience affichée, changement distinct et journalisé | COM-1, COM-5 | `com-audience.test.ts` ; recette § audience |
| COM-R2 filtrage à l'envoi et à l'ouverture | COM-1, COM-4 | références résolues par lecteur ; recette lecteur |
| COM-R3 mention, lien sans accès | COM-1 | recette « mention d'un non-membre » |
| COM-R4 voies interne / partagée séparées | COM-2 | recette partage avec empreinte |
| COM-R5 notifications sans régression | COM-4 | recette notifications ; types existants inchangés |
| COM-R6 notification ≠ accusé ≠ approbation | COM-4 | états distincts, recette accusé |
| COM-R7 action liée sans état concurrent | COM-2, COM-3 | `com_links` ; état relu à la source |

## 5. Scénarios S3, S4, S6 des règles communes

COM rend vérifiables, sur les notifications et la boîte, S3 (commentaire de R03 conservé) et S4 (lecteur sans notes
internes) et, côté diffusion, S6 (révocation : la requête suivante ne rend plus rien). La vague 3 du plan des règles
communes peut être jouée avec `communication.mjs`.
