# Collaboration en temps réel — Plan d'implémentation pour Claude Code

> Source normative : `Fadi Concept/Fadi Concept - Real-time Collaboration.md` (v1.2), avec
> `Collaboration Common Rules` (v1.0) et `Collaboration Concept Map` (v1.0).
> Base examinée : `main@9d466f8` (22 octobre 2026). Ce plan est une **proposition** : il ne vaut ni décision
> d'architecture, ni autorisation de fusion ou de déploiement.

---

## 0. Mode d'emploi pour Claude Code

1. Avant toute action, lire dans l'ordre : `AGENTS.md`, `CLAUDE.md`, `docs/continuity/README.md`, puis ce fichier et
   `HANDOFF.md` / `STATUS.md` de ce chantier s'ils existent.
2. Vérifier en direct : branche, HEAD, Issues et PR ouvertes, CI. La mémoire d'une session précédente n'est pas une preuve.
3. **Un lot par branche et par PR.** Ne jamais commencer le lot N+1 sans acceptation explicite du lot N par le
   maître d'ouvrage (sauf délégation écrite).
4. Chaque lot suit le même cycle : Issue → branche `feat/<issue>-rtc-<n>-<sujet>` → code + tests → vérifications →
   `TASKS.md`, `STATUS.md`, `HANDOFF.md` mis à jour dans la même PR → PR avec preuves.
5. **Points d'arrêt** : toute question marquée `DÉCISION` ci-dessous non tranchée → s'arrêter, la consigner
   `Bloqué` dans `STATUS.md`, poser la question, continuer seulement les tâches indépendantes.
6. Vérifications avant chaque commit : `npm run typecheck`, `npm test`, `npm run build` ; scénario e2e avant toute
   demande d'acceptation. Respecter les restrictions de tests en vigueur (registre DB, `test:db-guard`) décrites dans
   le dernier `HANDOFF.md` du chantier `studio` ; un contrôle qui n'a pas pu tourner est **déclaré**, jamais tu.

---

## 1. Invariants non négociables

| # | Règle | Origine |
| --- | --- | --- |
| I1 | Le canal temps réel ne transporte **que des signaux** (identifiants, révisions, présence, pointeurs). Aucun contenu protégé, aucune écriture. | Concept §Session authorization |
| I2 | Toute écriture reste une commande REST transactionnelle (`requestId`, `baseRevision`, journal, 409). | `docs/architecture.md` |
| I3 | Pas de CRDT sur la géométrie ; pas de Yjs ; les annotations restent des commandes. | D-005, R17, D-013 |
| I4 | Une session n'est ni une révision, ni une adoption, ni une approbation. L'hôte n'obtient aucun droit. | Concept §2 |
| I5 | Droits revérifiés côté serveur à l'abonnement, à chaque action protégée et à la reconnexion. | Concept §Session authorization |
| I6 | Pas de nouveau système de commentaires, d'observations ou d'approbation : on étend Studio. | Common Rules, E.2-01 |
| I7 | Texte d'interface écrit en français, traduit dans `apps/web/src/lib/i18n/en.json`. | D-163 |
| I8 | Tout nouvel outil ou commande d'interface a icône propre, barre et raccourci, contrôlés par test. | D-202 |
| I9 | Les 21 étapes du Parcours ne sont pas touchées. | `AGENTS.md` |

---

## 2. Points d'ancrage dans le code (vérifiés au commit de base)

| Sujet | Fichier |
| --- | --- |
| Démarrage HTTP (`app.listen` → `server`) | `apps/api/src/server.ts` |
| Cookie et session (`SESSION_COOKIE = "fadi_session"`, `resolveSession`) | `apps/api/src/lib/auth.ts` |
| Droits (`loadProjectAccess`, `projectAccessRefusal`, `ProjectNeed`) | `apps/api/src/lib/owned-project.ts` |
| Outbox (`enregistrerEvenement`, `surEvenement`, `traiterEvenements`) | `apps/api/src/lib/atelier-events.ts`, table `atelier_outbox` |
| Appels `traiterEvenements` après commit | `apps/api/src/routes/atelier-commands.ts`, `atelier-versions.ts`, `atelier-automatisation.ts` |
| Annulation / rétablissement (`cibleAnnulation`, l. ~470) | `apps/api/src/routes/atelier-commands.ts` |
| Membres et rôles | `apps/api/src/routes/members.ts`, table `project_members` |
| Réservation projet / verrous fins | `apps/api/src/routes/lock.ts`, `atelier_locks` (`routes/atelier-versions.ts`) |
| Commentaires Studio | table `studio_comments` (`apps/api/src/db/schema.ts`), `lib/studio-commentaires.ts` |
| Schéma SQL idempotent | `apps/api/src/db/init.sql` + `schema.ts` (Drizzle) |
| Relectures périodiques à remplacer | `routes/ProjectShell.tsx`, `components/NotificationBell.tsx`, `modules/atelier/bus/atelier-client.ts`, `modules/atelier/bus/etat-projet.ts`, `modules/atelier/nouveau/panneaux/Versions.tsx`, `modules/studio/variante/AvisRevision.tsx` |
| File hors ligne et conflits | `apps/web/src/lib/local-store.ts`, `lib/mutations.ts`, `components/ConflictPanel.tsx` |
| Proxy de déploiement | `deploy/preprod/proxy/Caddyfile.template` (`reverse_proxy app:3001`) |

Constat : l'outbox ne reçoit aujourd'hui que des événements Atelier ; membres, réservation, commentaires et Studio
n'y écrivent rien.

---

## 3. Lots

### RTC-0 — Cadrage (documentation seulement, aucun code applicatif)

**Tâches**
- [ ] Créer `docs/workstreams/collaboration-temps-reel/` : `CONTEXT.md`, `TASKS.md`, `STATUS.md`, `HANDOFF.md`.
- [ ] Rédiger l'ADR « Canal temps réel » (invariants I1–I5, choix du transport, mono-instance) dans le journal de
      décisions existant le plus proche, ou une ADR nouvelle si aucun ne couvre le sujet.
- [ ] Ajouter le chantier dans `docs/workstreams/README.md`.
- [ ] Corriger le statut obsolète de Collaboration dans `apps/web/src/modules/module-registry.ts` (REP-06).
- [ ] Lister les `DÉCISION` ci-dessous dans `STATUS.md` avec l'état `À définir`.

**DÉCISION (bloquantes pour RTC-1)**
- D1 Transport : WebSocket via `ws` (recommandé) ou SSE + REST.
- D2 Déploiement : une instance (hub en mémoire) ou plusieurs (`LISTEN/NOTIFY`).
- D3 Seuils : participants max par session ; délai cible d'affichage d'une révision (proposition : 2 s, à mesurer).
- D4 Correction de l'annulation par auteur : dans RTC-1 ou en correctif séparé avant.

**Terminé quand** : ADR acceptée, D1–D4 tranchées, PR documentaire fusionnée.

---

### RTC-1 — Canal de signaux, révocation, annulation par auteur

**Serveur**
- [ ] Dépendance `ws` dans `apps/api` (version épinglée, lockfile commité, aucun script d'installation).
- [ ] `apps/api/src/realtime/hub.ts` : abonnements `Map<projectId, Set<Connexion>>`, diffusion, fermeture ciblée
      `fermerPour(userId, projectId?)`.
- [ ] `apps/api/src/realtime/serveur.ts` : `attacherTempsReel(server)` appelé dans `server.ts` après `app.listen`.
      Montée de protocole sur `/realtime` uniquement ; contrôle de l'en-tête `Origin` contre la liste autorisée ;
      cookie `fadi_session` lu puis `resolveSession` ; refus 401 sinon.
- [ ] `apps/api/src/realtime/messages.ts` : schémas Zod des messages client (`abonner`, `desabonner`, `ping`) et
      serveur ; taille max (ex. 16 Kio) ; débit limité par connexion.
- [ ] `abonner { projectId }` → `loadProjectAccess` + `projectAccessRefusal(…, "read")` ; refus = message d'erreur
      sans détail sur l'existence du projet.
- [ ] Signaux émis après commit via `surEvenement` : `revision.disponible { projectId, revision, auteurId }`.
- [ ] Ajouter `enregistrerEvenement` (même transaction) + `traiterEvenements` (après commit) dans :
      `members.ts` (ajout, changement de rôle, retrait, départ, transfert), `lock.ts`, création / suppression de
      commentaire, commandes Studio. Types : `acces.change`, `reservation.change`, `commentaire.change`,
      `studio.revision.disponible`.
- [ ] Révocation : sur `acces.change` qui retire ou abaisse un droit, et sur `destroySession`, appeler
      `fermerPour` **immédiatement** (pas d'attente de l'outbox).
- [ ] Reprise : chaque signal porte l'identifiant d'outbox ; à la reconnexion le client envoie le dernier reçu ;
      si l'écart n'est plus disponible → signal `resynchroniser`.

**Annulation par auteur**
- [ ] `cibleAnnulation(projectId, auteurId, journalId?)` : par défaut, dernière commande non annulée **de l'auteur**.
- [ ] Avant d'appliquer l'inverse : si une commande ultérieure d'un autre auteur touche un des `objetIds` de la
      cible → 409 `{ erreur: "conflit", motif: "dependance", commandes: [...] }`, rien n'est appliqué.
- [ ] Même logique pour `cibleRetablissement`. Adapter le client Atelier (bouton Annuler / Rétablir) et le message.

**Client**
- [ ] `apps/web/src/lib/temps-reel/canal.ts` : connexion, reconnexion avec délai croissant, état exposé
      (`connecte | reconnexion | indisponible`).
- [ ] `apps/web/src/lib/temps-reel/useSignauxProjet.ts` : abonnement au projet ouvert ; chaque signal →
      `queryClient.invalidateQueries` sur les clés concernées ; `acces.change` → relecture des droits ;
      `resynchroniser` → invalidation du projet entier.
- [ ] Garder les `refetchInterval` existants en secours, allongés (ex. ×5) quand le canal est `connecte`.
- [ ] Le service worker (`public/sw.js`) ne doit pas intercepter `/realtime`.

**Tests**
- [ ] API : abonnement refusé sans droit ; signal reçu après commande ; membre retiré → connexion fermée et plus
      aucun signal ; origine interdite refusée ; message invalide ou trop gros refusé.
- [ ] API : annulation multi-auteur — A crée un mur, B modifie un autre objet, A annule → seul le mur d'A disparaît ;
      B modifie le mur d'A, A annule → 409 `dependance`.
- [ ] Playwright : deux contextes, B voit la révision de A sans recharger, sous le seuil D3.

**Terminé quand** : tests d'acceptation A5, A6, E2, E6 verts ; CI verte ; aucun contenu protégé dans un message
(test qui inspecte les charges émises).

---

### RTC-2 — Sessions et présence

**Serveur**
- [ ] Tables (`init.sql` idempotent + `schema.ts`) :
  - `collab_sessions` : id, project_id, study_id?, variant_id?, revision_affichee, audience (`interne`), hote_id,
    etat (`ouverte | close | expiree`), expire_le, cree_le.
  - `collab_session_participants` : session_id, user_id, role_session (`hote | presentateur | participant`),
    rejoint_le, parti_le.
  - `collab_session_events` : append-only (trigger refusant UPDATE/DELETE, comme `studio_publication_events`) —
    ouverture, entrée, sortie, transfert d'hôte, changement de présentateur, clôture, refus d'accès.
- [ ] Routes REST `apps/api/src/routes/collab-sessions.ts` : créer, lire, rejoindre, quitter, transférer l'hôte,
      désigner le présentateur, clore. Chaque route : `projectOr404(..., "read")` ; jamais de droit dérivé du rôle de session.
- [ ] Messages canal : `presence`, `pointeur { vue, x, y, objetId? }`, `suivre { presentateurId }`. En mémoire,
      jamais persistés, débit limité.
- [ ] **Filtrage par destinataire** : un `objetId` que le destinataire ne peut pas lire est retiré du message.
- [ ] Expiration : session sans hôte connecté pendant N minutes → `expiree` (N = `DÉCISION`).

**Client**
- [ ] Barre de présence dans l'en-tête projet ; panneau « Session » (Atelier, Studio) : participants, rôle,
      suivre / naviguer librement, transférer l'hôte, clore.
- [ ] Pointeurs affichés en surimpression, distincts visuellement des annotations ; ne modifient jamais la
      sélection ni le contexte d'édition locaux.
- [ ] Icône, barre et raccourci propres pour chaque commande (règle d'or, test existant étendu) ; traductions `en.json`.

**Tests**
- [ ] A2 / E10 : l'hôte lecteur tente une publication Studio → 403.
- [ ] E5 : pointeur sur un objet hors audience non relayé.
- [ ] Journal : chaque transition produit un événement ; UPDATE refusé.
- [ ] axe-core sans violation critique sur les nouveaux panneaux (bureau et téléphone).

**Terminé quand** : A2, E5, E10 verts ; recette e2e « deux personnes dans une session » verte.

---

### RTC-3 — Annotations enregistrées

- [ ] Étendre `studio_comments` (colonnes nullables, migration idempotente) : `vue_ref`, `point_de_vue` (jsonb :
      caméra 3D ou cadrage 2D, repère tagué), `audience` (`interne` par défaut), `session_id`.
- [ ] Commande « Enregistrer comme annotation » depuis un pointeur : création idempotente (`requestId`),
      `revision_id` = révision affichée dans la session.
- [ ] Ouvrir une annotation restaure son point de vue **en lecture**, sans changer la révision de travail.
- [ ] Promotion en observation via le chemin existant `studio_observations` (aucune table nouvelle).
- [ ] Tests : annotation sur R03 reste liée à R03 après création de R04 ; audience `interne` jamais servie à un
      lecteur hors audience (prépare RTC-4).

**Terminé quand** : tests verts, CI verte.

---

### RTC-4 — Revue externe sur paquet figé · **BLOQUÉ par Users Management**

Préconditions : invité externe, droit limité à une ressource, autorité Approbateur / Publicateur distincte
(concept Users Management v2.2). `DÉCISION` : propriétaire de la table « paquet de revue » (Studio ou Users Management).

- [ ] Paquet de revue : manifeste exact des révisions (réutiliser manifeste + empreintes de `studio_publications`),
      objet, audience, échéance, actions permises, coordinateur.
- [ ] Espace de revue restreint : l'invité ne lit que le paquet ; discussions internes invisibles.
- [ ] Faits distincts : présence, lecture, accusé de réception, revue terminée ; approbation affichée depuis Studio.
- [ ] Tests A1, A3, E4.

### RTC-5 — Paquets de coordination et adoption · partiellement bloqué (partenaires externes)

- [ ] Manifeste sur les références externes de l'Atelier : organisation source, auteur, objet, unités, repère
      tagué (`cadastral | geographic | local`), limites connues, remplacement.
- [ ] États : `recu → compare → adopte | refuse | clarification`. Un dossier approuvé conserve sa référence.
- [ ] Tests A4, E3 ; une observation liée à l'ancien modèle garde sa preuve.

### RTC-6 — Concurrence et reprise renforcées

- [ ] Cinquième état visible « calcul dépendant en attente », alimenté par l'outbox.
- [ ] Réservations et verrous affichés en direct (propriétaire, portée, échéance, libération).
- [ ] Rebasage de la file Dexie déclenché par `revision.disponible` plutôt que par minuterie.
- [ ] Résultat de calcul tardif toujours rattaché à sa révision.
- [ ] Recette deux sessions, même mur + baie hébergée (TEST-012 du plan Studio).
- [ ] Tests E1, E7, E9.

### RTC-7 — Continuité d'organisation · **BLOQUÉ par Users Management (organisations)**

- [ ] Au départ d'un membre : inventaire des sessions hébergées, réservations, revues ; réaffectation autorisée
      et journalisée ; auteur historique inchangé ; accès dépendants retirés immédiatement.
- [ ] Test E8.

### Hors périmètre de cette version

Co-édition 2D/3D au-delà des commandes actuelles, BCF, connecteurs CAO, courriel et réunion, assistance IA :
uniquement sur besoin démontré et décision du maître d'ouvrage.

---

## 4. Traçabilité des tests du concept

| Test | Lot | Test | Lot |
| --- | --- | --- | --- |
| A1 invité restreint | RTC-4 | E1 géométrie dépendante | RTC-6 |
| A2 hôte sans approbation | RTC-2 | E2 annuler préserve autrui | RTC-1 |
| A3 R03 figée | RTC-4 | E3 modèle reçu non adopté | RTC-5 |
| A4 paquet non adopté | RTC-5 | E4 pas de bascule R03 → R04 | RTC-4 |
| A5 révocation en session | RTC-1 | E5 présentateur sans fuite | RTC-2 |
| A6 ni écrasement ni doublon | RTC-1, RTC-6 | E6 révoqué sans édition | RTC-1 |
| | | E7 reconnexion sans doublon | RTC-6 |
| | | E8 départ de l'hôte | RTC-7 |
| | | E9 calcul tardif | RTC-6 |
| | | E10 hôte ne publie pas | RTC-2 |

---

## 5. Sécurité (à vérifier dans chaque PR des lots 1 à 3)

- [ ] Origine contrôlée à la montée WebSocket ; cookie `httpOnly` et `SameSite` inchangés.
- [ ] Aucun message ne contient de contenu de projet (test d'inspection des charges).
- [ ] Taille, débit et nombre de connexions par compte limités ; fermeture propre à l'arrêt du serveur.
- [ ] Aucune trace d'erreur interne envoyée au client ; journaux structurés côté serveur.
- [ ] Dépendance ajoutée auditée, lockfile commité.

---

## 6. Prompts prêts à coller dans Claude Code

**Lot RTC-0**
```
Lis AGENTS.md, CLAUDE.md, docs/continuity/README.md puis
docs/workstreams/collaboration-temps-reel/PLAN-CLAUDE-CODE.md. Exécute uniquement le lot RTC-0 (documentation,
aucun code applicatif). Ouvre l'Issue, crée la branche, produis les fichiers du chantier et l'ADR, corrige le
statut de module-registry.ts, consigne D1–D4 en « À définir ». Ouvre la PR sans la fusionner et arrête-toi.
```

**Lot RTC-1** (après acceptation de RTC-0 et décisions D1–D4)
```
Lis AGENTS.md, CLAUDE.md, puis HANDOFF.md, STATUS.md et PLAN-CLAUDE-CODE.md du chantier
collaboration-temps-reel. Vérifie branche, HEAD, PR et CI. Exécute uniquement le lot RTC-1 en respectant les
invariants I1–I9 et les décisions consignées. Écris d'abord les tests listés, puis le code. Lance typecheck,
test, build et le scénario e2e ; déclare tout contrôle qui n'a pas pu tourner. Mets à jour TASKS, STATUS,
HANDOFF dans la même PR, ouvre la PR sans la fusionner et arrête-toi.
```

**Lots suivants** : même prompt en remplaçant le numéro de lot ; pour RTC-4, RTC-5 (partenaires) et RTC-7,
vérifier d'abord que les préconditions Users Management sont livrées, sinon consigner `Bloqué` et s'arrêter.
