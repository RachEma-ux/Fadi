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
