# A2 — Contrat du snapshot GET/model, CI #154

18 octobre 2026. Lecture seule, aucun test, DB, service, rerun ou modification du dépôt. Sources : diagnostic A6 `CI-PR154-76e43d1.md`, run [39117137782](https://github.com/RachEma-ux/Fadi/actions/runs/39117137782) au HEAD `76e43d19645dc8a8ffd91282177e6a31d123f73a`. Analyse de code dans la copie de référence Mission003 (sources applicatives du baseline `a09c11d397c8527987c3d1c4410ebb2eb240a819`) ; A6 a également contrôlé l’assertion à distance au SHA du run. A2 ne revendique pas une nouvelle reproduction de ce SHA.

## Contrat attendu

Une réponse `GET /projects/:projectId/atelier/model` contient `{ revision, nativeId, modele }`. L’usage dans le client et la recette suppose que **le modèle et sa révision décrivent le même état de référence**. Une commande acceptée produit une nouvelle révision et son état ; le client utilise cette révision comme prochaine `baseRevision`. `?revision=n` revendique en outre un état historique exact. Ce contrat découle du commentaire « instantané » de la route (`atelier-commands.ts:5`), de l’architecture (modèle versionné, cohérence des documents, révisions historiques) et de l’assertion de recette. Il ne suffit pas que chaque champ ait été vrai à un instant différent.

## Ordre statique réellement observé

1. `routes/atelier-commands.ts:108–111` attend `projectOr404(..., "read")`, puis appelle `chargerModele(db, project.id)`.
2. `lib/owned-project.ts:76–87,109–111` lit projet/rôle via `loadProjectAccess` ; `projectOr404` rend cet objet déjà chargé. Aucun verrou/snapshot de lecture commun n’est installé par cette aide.
3. `lib/atelier-modele.ts:29–45` lit d’abord `atelier_site`, puis lance huit lectures de tables par `Promise.all`. L’argument de cette route est **db**, non une transaction fournie par l’appelant. La méthode accepte aussi un objet transactionnel pour d’autres usages ; sa signature générique ne donne pas à cet appel GET une transaction.
4. `routes/atelier-commands.ts:136` répond avec `project.modelRevision` du premier objet et `charge.etat` assemblé par les lectures suivantes. Aucune liaison de révision de snapshot n’est retournée par `ModeleCharge` (`atelier-modele.ts:16–19`). La révision par objet persistée n’est pas utilisée par cette réponse pour prouver l’identité de snapshot.
5. Côté écriture, `validerLotTx` (`atelier-commands.ts:92–96`) ouvre une transaction et verrouille le projet ; `atelier-validation.ts:99–101` persiste le différentiel et avance `projects.model_revision` dans cette transaction. **L’atomicité du writer n’établit pas celle de cette lecture composée.**

## Interleaving possible, non observé dans le run

Ordre compatible avec le code : GET lit projet à r90 → commande se termine et engage ensemble objets/révision r91 → les lectures modèle du GET voient les nouveaux arcs → GET renvoie les arcs nouveaux avec la valeur r90 déjà mémorisée. Cela ne suppose pas une écriture partiellement engagée : chaque lecture peut voir un état commis différent. Les lectures multiples de `chargerModele` peuvent aussi, statiquement, assembler des tables lues de part et d’autre d’un engagement ; le run ne démontre pas un tel mélange de tables.

L’absence de transaction/snapshot commun dans le chemin inspecté est un **constat statique vérifiable**. Cet interleaving est une **explication possible** de l’observation, pas une cause racine démontrée. Aucun identifiant de requête, horodatage de chaque SELECT, instant de commit ou trace du statut de la commande palette n’est disponible dans les preuves consultées. Les trois éléments « arcs présents », « révision affichée » et « HTTP200 » ne suffisent donc pas à reconstituer l’ordre réel des transactions. Le HTTP imprimé provient du lot préparatoire, comme A6 l’a établi.

## Portée de l’assertion et réserves

`atelier-complements.mjs:1666–1672` arrête sa boucle dès que le nombre d’arcs change, puis exige `rev === avant.revision + 1`. Si une réponse composée incohérente est reçue à cet instant, ce contrôle échoue sans attendre une lecture ultérieure. C’est compatible avec la sortie `arcs 0 → 4 · r90 → r90`. Cela ne prouve ni que les arcs n’ont pas été journalisés ni qu’une simple attente supplémentaire corrigerait le contrat serveur. Ne pas affaiblir l’attente +1 ou convertir l’échec en skip.

Le chemin historique `?revision=n` relit aussi le journal après le modèle (`atelier-commands.ts:125`) ; l’absence d’état commun mérite qualification dans le même périmètre transactionnel, sans affirmer qu’un historique incorrect a été constaté ici. Les autres routes de lecture et les autres causes éventuelles restent hors de cette courte analyse.

## Suite à soumettre, sans solution de code

Rattacher cette réserve au suivi transactionnel existant, sans correctif concurrent. Définir après autorisation et garde M02 un scénario déterministe contrôlant la frontière entre lecture du projet, lectures du modèle et engagement d’une commande ; oracle : révision, géométrie et journal d’un même état commis. Tester aussi absence de mutation/lecture obsolète cachée et historique identifié. La preuve doit corréler requestId, résultat de commande et réponse GET, sans exposer connexion ou données privées. Aucun changement d’implémentation ni choix technique de snapshot n’est décidé par ce rapport.

**Verdict : risque de violation du contrat de snapshot étayé par la structure de lecture ; cause immédiate de l’assertion confirmée par A6 ; interleaving et cause racine runtime toujours non prouvés. Le run #154 reste en échec.**
