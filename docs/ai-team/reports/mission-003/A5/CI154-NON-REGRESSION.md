# A5 — protocole proposé pour l’échec CI #154

Lecture seule, 18 octobre2026. Source de diagnostic : `A6/CI-PR154-76e43d1.md`, run39117137782, HEAD76e43d19645dc8a8ffd91282177e6a31d123f73a. A5 a rapproché en lecture seule le script `apps/web/e2e/atelier-complements.mjs:1639–1673` et GET/model `apps/api/src/routes/atelier-commands.ts:108–136` de la copiea09c11d ; l’identité de l’assertion au SHA76e43d1 est attribuée à la lecture distanteA6. Aucun correctif, test, simulation exécutable, relanceCI ou connexionDB effectué ici.

## Faits et inconnue

Arcs0→4, révision90→90 au lieu91 : échec réel de l’oracle composite. Le statut200 affiché appartient au lot préparatoirer0, pas nécessairement à la commandeUI Raccorder. La boucle arrête sa lecture dès que le nombre d’arcs change ; le chemin GET/model lit les informationsprojet et le modèle séparément. Une intercalation de commit peut donc expliquer un couple nouveau-modèle/ancienne-révision, mais n’a pas été observée : **cause racine inconnue**. Ni « simple flake », ni « serveur corrompu », ni « mauvais test » ne sont établis.

## Oracle à conserver

Pour un raccordmultiple accepté, quatre arcs sont ajoutés et la révision avance **exactement de1** dans **un seul lot**. Le lot, sa révision, les identités des arcs, le journal et les donnéespersistées doivent s’accorder. Une lecture contractuelle modèle/révision doit restituer un snapshot cohérent : avant=(arcs0,r90), après=(arcs4,r91). Les couples hybrides(arcs4,r90) ou(arcs0,r91) sont éliminatoires si le contratGET est bien celui d’un snapshot modèle/révision. Ce contrat doit être confirmé A2, sans présumer qu’un filtrage côtétest corrige le produit.

Refus/conflit/erreur en cours de lot : aucun arc partiel, aucune mutationjournal/outbox validée, aucune incrémentationrévision. Rejeu du même requestId : même résultat, aucun deuxième lot ni +2. Le lot préparatoire n’entre pas dans le +1 du raccord ; fixer l’étatavant après son ack effectif.

## Phase1 — préparation puis simulationpure, après accord du périmètre de test

Définir un ordonnanceur déterministe à doubles (aucun pg/HTTP réel) : lectureprojet, lecturemodèle, transactioncommande, journal/outbox, réponsesréseau et horloge contrôlés par barrières explicites. Ne pas utiliser sleep ou augmenter les délais pour obtenir le résultat voulu. A5 propose les cas ; A3 n’ajoute pas de code sans accord.

| Ordonnancement à simuler | Oracle et diagnostic possible |
|---|---|
| Lireprojet90, liremodèle0 avant commit ; commit ensuite | Snapshotavant(0,90), puis après(4,91), valides. |
| Commitcomplet avant les deuxlectures | Snapshotaprès(4,91), journalunlot, valide. |
| Lireprojet90 ; barrière ; commit(4,91) ; liremodèle4 | Doit prouver ou rejeter l’hybrideGET(4,90). S’il apparaît avec persistancecohérente, candidat défautsnapshot serveur. |
| Échec entre calcularc2 et persistence finale | Rollbacktotal :0arc,+0révision, aucun eventcommitted. |
| Ackcommande perdu puis rejeu requestId |1lot,4arcs,+1révision ; même résultat. |
| RéponsesGET arrivant horsordre, deux sessions, cache navigateur | Une réponseancienne ne remplace pas l’étatnouveau ; distinguer payloadGET brut et étatUI. |
| Test litpremierGET avec4arcs avant ack réel | Journaliser le calendrier ; ne pas effacer la preuve d’un payloadhybride en attendant un secondGET. |

Ces doubles testent le contrat/l’orchestration et ne prouvent pas à eux seuls l’isolationtransactionnellePostgres. Conserver les plansintercalés comme fixtures de diagnostic. Une simulation qui fabrique un hybriden’autorise pas à déclarer qu’il s’est produit dans le runéchoué.

## Phase2 — basejetable et reproductionintégration, seulement après accord/M02

Prérequis : autorisationcode/tests ciblés, protectionsM02 vérifiées, provisioningA6 et attestationDB du run, données synthétiques nonproduction, copieisolée, SHAcible exact (76e43d1 pour diagnostic ou futurcorrectif clairement distingué), instrumentation nonpublique approuvée. Aucun contactproduction. Ne pas réutiliser une baseinconnue ni une URLhéritée.

1. Construire la fixture quatresegments jointifs déterministe, IDs uniquesrun, même niveau/unitésrepères ; attendre l’ackpréparatoire et relever un étatavant cohérent. Aucun autre écrivain non contrôlé.
2. Capturer le **POST de Raccorder lui-même** : requestId, baseRevision, commandscount, statut, réponse/révision ; ne pas utiliser seulementr0.status. Corréler le lotpersisté et les quatrearcs à ce requestId.
3. À l’aide de barrières d’intégration spécifiques, imposer les trois ordres avant/pendant/après lectureprojet et lecturemodèle. Ne pas ajouter de pointd’attente public ni instrumentationproduction. Les lectures d’oracleDB doivent elles-mêmes prendre un snapshotcohérent, sinon elles répètent le défaut supposé.
4. Relire atomicitépersistée (révisionprojet, objets, journal, outbox) dans un snapshotDB unique, et comparer aux payloadsGET bruts avec leurs temps/IDs ; comparer séparément étatUI et observationsdu test. Répéter les **ordonnancements définis**, pas des relancesaveugles jusqu’à vert.
5. Injecter un refus/conflit/rollback et un rejeuidempotent sur cette basejetable ; vérifier tous les critères ci-dessus. Les essais défaillants conservent tracescomplètes expurgées et verdict.

## Classification par preuve

- **Défautécriture serveur** : snapshotpersisté prouve arcs4/r90 ou lots/révisions incohérents après ack ; garder hypothèse avant preuve.
- **DéfautsnapshotGET** : DB cohérente(4,91), mais GET retourne(4,90) sous intercalation contrôlée ; l’attente dans le test ne supprime pas ce défautAPI.
- **Défautcache/étatUI** : payloadsGET/DB cohérents, UI/test compose des réponses de générations différentes ; prouver l’ordre et la provenance.
- **Synchronisation/instrumentation de recette** : payloads et états cohérents, mais le test compare un avant qui n’appartient pas au lot ou un statut/révision d’une autre opération ; corriger la corrélation seulement avec preuve et garder +1.
- **Nonreproduit** : ordres exercés et limites documentés, cause nonfermée. Un nouveauvert ne clôt pas le défaut historique ni ne prouve sa réparation.

Preuve attendue : SHA/run/contrat, fixture/hash et IDs non sensibles, calendrierbarrières, requestIdlot, statuts/réponsesexpurgés, snapshotscohérents avant/après, verdictparcas, logs ciblés, décisionA2/A5 et éventuellePR. Pas de secret/URLDB ni donnéesclient publiés.

**Interdits** : affaiblir/supprimer +1, accepter90 avec4arcs, skip, augmenter arbitrairement le polling/timeout, attribuer causalité à la documentationPR sans preuve, relancer pourchercher unvert. Prochaineaction A0 : réserver l’enquête ciblée dans #157/#153 et soumettre le lotA3 de simulation/instrumentation ; poursuivre les préparations indépendantes. Aucun accordapplicatif n’est créé par ce protocole.
