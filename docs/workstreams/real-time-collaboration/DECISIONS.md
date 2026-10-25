# Temps réel — décisions

## Décisions prises

- **RT-D1 — Ouverture de RTC-0 en parallèle (2026-10-24).** Le maître d'ouvrage, à la question « ouvrir RTC-0 maintenant
  (documentaire, en parallèle des chantiers en cours) ou attendre la fusion d'Organisations 2–4 et de COM (CR-D9 (a)) »,
  répond « 1 » (ouvrir maintenant). Portée : cadrage documentaire seulement (Issue #283). Elle ne vaut **ni** engagement
  de RTC-1, **ni** dérogation à CR-D9 pour l'implémentation : RTC-1 attend la porte des prérequis (`PLAN.md` § 4) et une
  décision explicite.

- **RT-D2 — Réponses à RT-Q1 à RT-Q7 (2026-10-24).** Le maître d'ouvrage indique que ces réponses « ont déjà été
  fournies » : ce sont les positions du tableau « Decisions » (§ 9) du plan d'implémentation qu'il a remis le
  2026-10-24 (base `main@2577e25`), complétées par ses § 4 et § 5. Elles sont reprises telles quelles ; là où elles
  diffèrent de la recommandation de l'évaluation, **la position du maître d'ouvrage prévaut**.

  | N° | Question | Réponse retenue | Source (plan remis) | Conséquence |
  | --- | --- | --- | --- | --- |
  | RT-Q1 | Périmètre de la vue partagée | ~~Studio et Documents~~ → **remplacée par RT-D3 : Studio seul** ; (adaptateurs) ; l'Atelier n'entre pas dans la première version | § 9 « Packaging », § 5 « Boundaries » | L'écart P2 est clos par décision : l'Atelier reste hors première version, son journal à curseur reste une option pour une version ultérieure, à décider à part. |
  | RT-Q2 | Canal serveur → client | **Précisée par RT-D3 : canal propre au Temps réel.** Le canal du Temps réel sert **les sessions** ; COM garde conversations, audiences, notifications et leur remise ; le Temps réel s'y **relie** sans messagerie locale | § 4 « Placement », § 5 « Boundaries » (« COM … Link session notice/conversation ; no local chat subsystem ») | Aucun transport commun imposé à COM ; la mise en commun du canal n'est pas engagée. |
  | RT-Q3 | Transport | **WebSocket** pour le direct et l'éphémère ; HTTP et commandes existantes pour les écritures durables ; bibliothèque choisie en RTC-0 après un essai de compatibilité | § 9 « Transport », § 5 « Transport and persistence » | Essai RTC-0.3. |
  | RT-Q4 | Capacité | **Une instance** au départ, acceptée seulement après l'essai de charge annoncé ; plusieurs instances = porte distincte ; budgets du plan = cibles de départ | § 9 « Capacity », § 7 « Proposed measurable budgets » | Budgets à mesurer (RTC-0.4, RTC-5). |
  | RT-Q5 | Conservation | Présence et rejeu **de courte durée** ; annotations selon la politique de leur module propriétaire ; besoin et durée de l'assiduité **à définir explicitement** avant la mise en service | § 9 « Retention » | Les durées chiffrées restent « non définies » (rien n'est inventé) ; à fixer avant RTC-5. |
  | RT-Q6 | Reprise de l'hôte | **Expiration visible, remplacement explicite autorisé**, aucune promotion automatique vers une autorité métier | § 9 « Host continuity » | RT-R2, RT-R6. |
  | RT-Q7 | Coédition | **Reportée** ; ni « dernier qui écrit gagne » ni CRDT géométrique sans preuve des dépendances et de l'annulation | § 9 « Co-authoring » | RTC-6, ADR distincte. |

- **RT-D3 — Périmètre et canal précisés (2026-10-24).** Réponse du maître d'ouvrage : « Studio seul » et « un canal
  propre au temps réel ». Elle **remplace** RT-D2 sur ces deux points :
  - RT-Q1 : la première version porte sur le **Studio seul** (variante, révision, paquet de revue figé Studio) ; ni
    Documents ni l'Atelier. Aucune session ne s'ouvre sur un document ; un document peut seulement être cité par lien.
  - RT-Q2 : le Temps réel a **son propre canal**, dont il est seul propriétaire ; COM n'y passe pas et garde sa propre
    remise (relecture actuelle ou transport qu'il choisira lui-même). Aucun canal commun n'est à prévoir.

- **RT-D4 — Exécution de RTC-1 à RTC-5 et délégation (2026-10-24).** Demande du maître d'ouvrage : « Exécute no-stop
  les lots RTC-1 à RTC-5. Gère avec l'avancement des autres sessions. Je te délègue la prise de décisions nécessaires à
  ma part. » Même forme que D-203 (Planche) et OP-3 (Organisations) : les lots s'enchaînent un à un sans acceptation
  intermédiaire, chacun par sa PR, **fusionné CI verte** et consigné (décision, statut, reprise). Les choix qui
  revenaient au maître d'ouvrage sont pris par le chef de projet et consignés ici (RT-D5 et suivantes) ; ils restent
  révisables. La délégation ne vaut **ni** déploiement en production, **ni** fusion sans CI verte, **ni** modification
  d'un autre chantier au-delà du strict raccordement. Porte des prérequis (`PLAN.md` § 4) : COM et la phase 2
  d'Organisations (droits, Approbateur / Diffuseur) sont fusionnés, ce qui suffit à RTC-1, RTC-2 et RTC-3 ; la phase 4
  d'Organisations (paquet de revue à accès limité) est **reportée** par son chantier : RTC-4 se construit sur la
  publication Studio figée existante et les rôles de projet actuels (RT-D5 § 8), l'accès « paquet seul » viendra par un
  adaptateur quand la phase 4 sera livrée.

- **RT-D5 — Choix techniques et produit de la première version (2026-10-24, délégation RT-D4).**
  1. **Transport** : `ws` 8.18.3, porté à **8.22.0** le 2026-10-25 (avis GHSA-58qx-3vcg-4xpx et GHSA-96hv-2xvq-fx4p, `PREUVES-SECURITE-ET-CI.md`) (version exacte, aucune dépendance native), montée de protocole sur le seul chemin
     `/temps-reel` du serveur HTTP de l'API ; HTTP pour tout ce qui est durable (`/projects/:id/temps-reel/sessions`).
  2. **Drapeau** `FADI_TEMPS_REEL=1` côté serveur : absent, routes et canal répondent 404 et l'interface n'affiche
     aucune entrée ; activé en CI ; production inchangée tant que le drapeau n'y est pas posé.
  3. **Qui** : créer, animer et rejoindre une session demande le droit `comment` (propriétaire, éditeurs, lecteurs, rôles
     de participation) ; l'accès support (lecture seule) n'entre jamais en session. L'hôte et le présentateur n'en
     tirent aucun droit (RT-R2) : toute écriture passe par les routes existantes et leurs droits.
  4. **Portée** : `studio-revision` (étude, variante, révision épinglée à l'ouverture ; une session de travail propose
     explicitement de passer à la nouvelle tête, jamais en silence) et `paquet-revue` (publication Studio figée, RTC-4).
  5. **Hôte** : présentateur par défaut ; il transmet l'animation et le rôle de présentateur. Hôte absent plus de
     2 minutes : le propriétaire ou un responsable du projet (`isProjectResponsible`) peut reprendre l'animation,
     journalisé ; aucun participant n'est promu automatiquement. Session sans aucune connexion pendant 30 minutes :
     expirée ; durée maximale 12 heures.
  6. **Bornes** : 16 Kio par message, 10 messages éphémères par seconde et par connexion (au-delà, abandonnés), file
     d'envoi de 256 Kio (au-delà, l'éphémère est abandonné, puis la connexion est fermée et le client se resynchronise),
     battement de 10 s (présence périmée retirée sous 30 s), 50 participants par session, 20 connexions par compte.
  7. **Revalidation** : droits relus à l'entrée, avant chaque relais protégé (cache de 2 s au plus), toutes les 5 s pour
     chaque connexion, et immédiatement sur les gestes connus (retrait ou changement de rôle d'un membre, déconnexion,
     révocation de session) par un appel direct au canal ; échec de lecture = refus.
  8. **Revue externe (RTC-4)** : sur une publication Studio dont le manifeste est figé ; le relecteur est un membre du
     projet (Lecteur, Relecteur) tant que la phase 4 d'Organisations n'existe pas ; la session reste épinglée sur la
     révision publiée ; notes `equipe` jamais servies à un lecteur ; aucun export ni approbation par la session.
  9. **Conservation (RT-Q5)** : présence, pointeurs et caméra jamais enregistrés ; rejeu en mémoire, 5 minutes ou
     500 événements par session ; journal de session (ouverture, entrées, sorties, transferts, clôture) en ajout seul,
     conservé avec le projet ; annotations : politique des commentaires Studio.
  10. **Raccourcis** : Ctrl+Alt+Maj+lettre (les Alt+Maj+lettre sont à la Planche, les Alt+Maj+chiffre ou ponctuation à
      la collaboration et à COM, les Ctrl+Alt+Maj+chiffre ou ponctuation aux Participants) ; commandes enregistrées dans
      le registre commun `commandes-collaboration.ts`, test de non-collision.

## Points restant ouverts (non bloquants pour RTC-0)

- Durées chiffrées de conservation (présence, rejeu, assiduité) : à fixer avant RTC-5 (RT-Q5).
- Profil de référence des budgets (modèle, appareil, réseau) : RTC-0.4.
- L'Atelier et Documents dans une version ultérieure : décision à part, après la première version.

## Travail antérieur relié

- Branche `docs/collaboration-temps-reel-plan` (2026-10-22, non fusionnée, sans PR) :
  `docs/workstreams/collaboration-temps-reel/PLAN-CLAUDE-CODE.md`, premier plan pour Claude Code (base `main@9d466f8`).
  Ce chantier le **remplace** (un seul chantier Temps réel) ; ses apports encore valables sont repris dans `PLAN.md`
  § 10 : canal limité aux signaux pour les contenus durables, révocation qui ferme immédiatement la connexion,
  annulation par auteur avec refus en cas de dépendance, statut de Collaboration dans `module-registry.ts` (REP-06), liste
  des relectures périodiques à alléger, service worker hors du canal. Ses décisions D1 à D4 y étaient « À définir » ;
  D1 (transport) et D2 (instance) sont couvertes par RT-D2 ; D3 (seuils) par RT-Q4 ; D4 (annulation par auteur) reste
  à placer (`PLAN.md` § 10).
