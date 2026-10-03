# Lot 2 — API transactionnelle et synchronisation — compte rendu

Exécuté le 3 octobre 2026 (chef de projet, session unique).

## Fait

| Tâche | Résultat |
| --- | --- |
| L2.1 | Tables `atelier_niveaux`, `atelier_objets` (révision par objet), `atelier_relations`, `atelier_definitions`, `atelier_calques`, `atelier_groupes`, `atelier_references`, `atelier_problemes`, `atelier_site` (présence = modèle typé), `atelier_commands` (journal append-only, `request_id` unique par projet), `atelier_outbox` — `schema.ts` + `init.sql` idempotent. Persistance par différentiel (`lib/atelier-modele.ts`) : seules les entrées changées sont réécrites (le même instantané différentiel sert d'inverse) ; `scripts/verify-restore.sh` étendu aux 11 tables et aux empreintes `atelier_objets` / `atelier_commands` (vérifié localement sur la base de test). |
| L2.2 | `routes/atelier-commands.ts` : `GET /model`, `GET /model/niveaux/:id`, `POST /commands` (droits relus, 423 si réservation d'autrui, verrou de ligne, `baseRevision` = révision courante sinon **409 détaillé** avec les objets touchés entre-temps et leur état serveur, mêmes réducteurs que le navigateur, transaction différentiel + journal + boîte de sortie + `model_revision + 1`, **idempotence** : une requête répétée renvoie la réponse enregistrée sans réappliquer, lot refusé = transaction annulée), `POST /commands/essai` (exécution à blanc), `POST /commands/annuler` / `retablir` (cibles calculées sur le journal, inverse appliqué comme nouvelle microversion, pile de rétablissement vidée par une nouvelle commande), `GET /journal?apres=n` (avec inverses), `GET /problemes` (références à réparer, problèmes, documents périmés, état du bilan), `POST /model/importer-natif` (transition). L'import de l'exemple P.118, les copies et les archives créent le modèle typé (même importeur) avec une entrée de journal portant le rapport d'import. |
| L2.3 | Boîte de sortie (`lib/atelier-events.ts`) : événement `atelier.commande.validee` enregistré dans la transaction, traité après validation de façon idempotente ; la fraîcheur des documents, du bilan Harmonie et de l'aperçu conceptuel découle de `projects.model_revision` (vérifié : un tableau des surfaces produit avant une commande est « périmé » après). |
| L2.4 | Client : `packages/atelier-model/src/sync.ts` (cibles d'annulation / rétablissement, rejeu des lots sur un état serveur plus récent — pur, testé), `apps/web/src/modules/atelier/bus/atelier-client.ts` (aperçu immédiat par le même réducteur, file Dexie `lots` une entrée par `requestId`, états local → synchronisation → synchronisé / conflit / refusé, envoi séquentiel dès que le serveur est joignable, 409 révision → relecture + rebase + renvoi, précondition → brouillon « conflit » à décider (`decider` : rejouer / abandonner), annuler local sans réseau, annuler / rétablir serveur par le journal, relecture périodique du journal pour les changements d'autrui), fonctions API typées (`lib/api.ts`). |
| L2.5 | 9 tests API (`routes/atelier-commands.test.ts`) : T03 (grandeur sans unité refusée, révision intacte), T06 (requête répétée = une seule révision), T07 (document périmé après commande, différentiel : un seul objet réécrit), T08 (409 détaillé entre deux comptes, rebase explicite, objet supprimé par autrui), T10 (403 lecteur, 404 étranger, 423 réservation), annuler / rétablir (9 microversions, état exact), essai, import typé de P.118 (1 753 objets, 37 problèmes), import natif à la demande. 3 tests du rejeu (`sync.test.ts`). |

## Non fait / reporté

- Le bandeau de synchronisation du projet (`SyncIndicator`) compte encore la file du moteur extrait ; l'état des lots typés sera affiché dans le panneau des problèmes du nouvel Atelier (lot 3a) et unifié à la bascule (lot 4).
- Pas de cache local du modèle typé hors ligne au premier chargement (la file locale est rejouée sur un état vide tant que le serveur ne répond pas) : prévu avec le service worker au lot 3b.
- `atelier_representations` et `volumes` : non créées (aucun volume dérivé à stocker avant les vues du lot 5).

## Ce que vous pouvez vérifier

- `npm test --workspace=@fadi/api` (65 tests, dont 9 nouveaux) ; `npm test --workspace=@parcours/atelier-model` (33).
- Sur l'instance : importer l'exemple, puis `GET /projects/<id>/atelier/model` et `GET /projects/<id>/atelier/journal?apres=0` (une entrée « Import de l'exemple P.118 »).
