# Communication (COM) — décisions

Les décisions ci-dessous sont des **choix du chef de projet** pris pour exécuter la demande du 2026-10-24 (Issue #280) ;
elles sont **acceptées** par le maître d'ouvrage (COM-R2 ci-dessous). Aucune ne modifie une décision existante, sauf COM-D1 qui
consigne une dérogation demandée.

| N° | Décision | Motif |
| --- | --- | --- |
| COM-D1 | COM est ouvert avant les phases 2 à 4 d'Organisations, par dérogation à l'ordre CR-D9 (a), sur demande explicite du maître d'ouvrage. COM s'appuie sur l'accès actuel (propriétaire, éditeur, lecteur, support) ; il passera aux affectations à la bascule de `loadProjectAccess` (Organisations phase 2) sans changer son modèle. | Demande du 2026-10-24 ; l'accès étant relu à chaque requête, la bascule n'exige aucune reprise de données. |
| COM-D2 | Toute conversation appartient à un projet. La communication interne d'organisation attend l'espace d'organisation (Organisations phase 5). | Aucun enregistrement d'organisation exploitable aujourd'hui ; ne pas inventer de frontière d'organisation. |
| COM-D3 | Trois audiences : `participants` (personnes nommées, membres du projet), `equipe` (propriétaire et éditeurs, comme E1), `projet` (tous les membres ; l'accès support lit sans écrire). Les modes direct et groupe sont toujours `participants` ; un fil contextuel choisit l'une des trois. | Concept « Visible audiences » ; réemploi des audiences E1 (CR-D3 (a) : audiences fines à COM). |
| COM-D4 | Ajouter un participant demande de choisir l'historique reçu : tout l'historique, ou à partir de l'ajout ; le choix est affiché avant confirmation et journalisé. | Concept : « Adding a person to a group explains what history they will receive. » |
| COM-D5 | Changer l'audience est refusé (409) si un auteur de la conversation perdait la lecture de son propre message ; une conversation directe ne change pas d'audience (créer un groupe, ou partager un extrait). | Même règle que le changement d'audience E1 ; une conversation directe reste limitée à ses deux participants. |
| COM-D6 | Messages ordinaires : l'auteur les modifie ou les retire ; la version remplacée est conservée (`com_message_versions`), l'indication « modifié » ou « retiré par son auteur » est visible. Les messages de partage et d'action ne se modifient pas. Durées de conservation : non définies (décision ouverte du concept). | Concept « History corrections and retention ». |
| COM-D7 | Une mention d'un membre qui ne lit pas la conversation est acceptée mais signalée à l'auteur et jamais notifiée ; une mention hors projet est refusée (422). | COM-R3 ; aucune donnée n'atteint une personne hors audience. |
| COM-D8 | Une référence est stockée par type et identifiant seulement ; son libellé est résolu à chaque lecture selon l'accès du lecteur, « élément non accessible » sinon. | COM-R2 : aucun titre, vignette ni extrait ne fuit par un lien. |
| COM-D9 | Partage d'extraits et action liée : aperçu (destinataires réels, contenu exact) puis confirmation avec une empreinte ; si l'audience ou le contenu a changé entre-temps, 409. La source d'un partage n'est jamais nommée dans la cible. | COM-R4 ; concept « From conversation to action ». |
| COM-D10 | Demande de précision = enregistrement de la Collaboration partagée (CR-D1 (a) étendue) : `ouverte` → `repondue` → `close`, `rouvrir`, `reattribuer` ; réponse par le répondant tenu seul ; clôture par le demandeur ou le propriétaire, motif exigé sans réponse ; audience `equipe` ou `projet` (E1). | Concept : « structured Clarification Request with a question, references, requester, accountable responder, due date, response and closure history ». |
| COM-D11 | Actions liées livrées : demande de précision et observation Studio (variante choisie). Une tâche se crée depuis l'observation, dans Studio. | Une tâche Studio dépend d'une observation (E.2-03) ; aucun état de tâche dans COM. |
| COM-D12 | Accusé de réception et urgence : marqués par l'auteur, états distincts (accepté, ouvert, accusé) ; aucun seuil de réponse ni escalade automatique (non définis par le concept, à décider par projet). | Concept « Urgent communication » ; ne pas inventer de seuil. |
| COM-D13 | Notifications : types `message` (participants d'une conversation `participants`, animateur, personnes ayant écrit dans la conversation, mentions lisibles) et `demande` (demandeur et répondant) ; extraits filtrés par l'audience courante. | COM-R5 ; éviter qu'un fil `projet` notifie tout le projet. |
| COM-D14 | Règle d'or étendue aux commandes COM : Alt+Maj+4 à Alt+Maj+0 pour les commandes principales, Alt+Maj+ponctuation (touche physique) pour les commandes de demande, de participant et de message. Aucune collision (test). | Extension CR-C1 § 6 ; Alt+Maj+lettre est pris par la Planche et l'administration. |

## Réponses du maître d'ouvrage

- **COM-R1 (2026-10-24)** — « Fusionne 285 » : fusion de la PR #285 demandée et réalisée (`173b9f1`). Les décisions
  COM-D1 à COM-D14 n'ont pas été acceptées une à une à cette date. Aucun déploiement demandé.
- **COM-R2 (2026-10-24)** — Au point « Décisions COM-D1 à COM-D14 : elles n'ont pas été validées une à une. La plus
  importante est COM-D1 … », le maître d'ouvrage répond « Fix ». Interprétation consignée : **COM-D1 à COM-D14 sont
  acceptées telles que proposées**, y compris la dérogation COM-D1 à l'ordre CR-D9 (COM ouvert avant les phases 2 à 4
  d'Organisations), reportée dans le journal des règles communes (CR-R3). Si cette lecture ne correspond pas à
  l'intention, une nouvelle réponse la remplace. Aucun déploiement demandé.

## Questions ouvertes (non bloquantes)

- Durées de conservation par catégorie, visibilité de l'historique des groupes par défaut, appareils de terrain pris en
  charge (photos), seuils d'accusé et d'escalade, propriété du cycle RFI formel et des ordres de modification, premier
  connecteur externe : décisions listées par le concept (« Next concept milestone »), à prendre par le maître d'ouvrage.
