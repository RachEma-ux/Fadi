# M23/M27 — Complément de durabilité et reprise, A6

Préparation documentaire Mission004 uniquement. Réutilise M003/A2 LOT-D et LOT-R, A2 M05-M17-CONTRATS-DURABLES et A1 M24-CONTRAT-PUBLICATION-REOUVERTURE ; ne les remplace pas et ne crée aucune nouvelle exigence source. Identifiants EX/INV/IF/AC/TEST inchangés. Empreintes des cinq fichiers lus dans SOURCES.json. Exemples non exécutables, aucun worker, DB, service, restauration, provisionnement, CI ou code applicatif ajouté.

## 1. Contrats repris, point de précision

IF-003¶200 capture immuable de révision → job → résultat sourcé/métriques → contrôle contexte/droits → engagement transactionnel explicite → projections. IF-007¶664 prescrit **queued → loading → running → completed**, avec cancel_requested/cancelled/failed/superseded/timed_out. La proposition M003 C-JOB employait aussi succeeded/stale : ce complément privilégie les termes source pour l’exécution et sépare l’éligibilité du résultat et sa fraîcheur. Il ne fait pas passer une DEC ni ne modifie une API.

IF-010¶819 conserve issueId, contrôle/source/révisions/objets, auteur, gravité décidée, pièces, responsable/état, journal et recontrôles/condition de clôture. Une erreur de job peut produire un diagnostic technique ; elle ne clôt pas une observation métier ni ne constitue un contrôle conforme. IF-011¶868 lie eventId, transaction, auteur, étude/variante, révision base/issue, effets, date serveur et job éventuel. Notification ≠ confirmation avant commit durable.

C-STUDY/C-COMMAND de M17 conservent leur enveloppe IF-006 ; les champs additionnels décrits ici sont des préconditions documentaires, pas un nouveau wire format. C-PUBLICATION de M24 reste le contrat d’approbation/publication distinctes. C-MIGRATION de LOT-R reste le cadre de mapping/accord/retour arrière ; ce dossier précise uniquement les informations de reprise nécessaires.

## 2. Trois dimensions du job

| Dimension | Contenu candidat | Règle |
|---|---|---|
| Exécution | États IF-007, jobId, attemptId, génération worker, erreur et métriques | Une annulation demandée n’est pas un arrêt matériel ; chaque attente est résolue ou rejetée explicitement |
| Validité du résultat | Contexte complet, authorityEpoch, sourceRevisionSet, inputFingerprint, versions de schéma/contrat/moteur et droits revalidés | Résultat terminé n’est ni applicable ni engagé par sa seule présence |
| Engagement métier | intention/requestId, résultat durable/indéterminé/rejeté, transaction/event/révision de sortie | Seul le writer autoritaire engage ; le worker, le tampon et la notification ne deviennent jamais écrivains canoniques |

Le périmètre Projet→Étude→Variante est immuable pour un job soumis. A peut avoir seulement drawing2d, B seulement model3d, C associated et ses projections. Ne pas créer une autorité absente pour satisfaire un modèle commun. Les versions de disciplines peuvent différer dans sourceRevisionSet si l’ensemble est coordonné explicitement, conformément à M24.

Le résultat conserve jobId/attemptId/generation, sourceRevisionSet et empreinte d’entrée exacts. Un input identique ne dispense ni de revalider droits/contexte/authorityEpoch ni de refuser une ancienne génération. Les empreintes de JSON des exemples servent la cohérence documentaire seulement ; canonicalisation et stockage production demeurent DEC applicables.

## 3. Transitions et protections concrètes proposées

| Situation | État / garde | Propriété exigée |
|---|---|---|
| Soumission | queued ; source et paramètres capturés sans référence mutable | Changer la sélection UI ne redirige pas le job |
| Chargement | loading ; ressources/versions vérifiées et ownership buffers explicite | Chargement échoué ne crée pas un second moteur par outil |
| Calcul | running ; progression/erreur corrélées par IDs non sensibles | Pas de géométrie confidentielle ni secret dans les traces |
| Résultat courant | completed ; source, droits, tentative, writer et intention recontrôlés | Engagement distinct, atomique selon C-COMMAND |
| Résultat ancien | completed avec fraîcheur superseded, ou branche source IF-007 applicable | Historique possible, aucun écrasement de la tête courante |
| Annulation demandée | cancel_requested ; signal au moteur, capacité d’engager révoquée jusqu’à nouvelle intention contrôlée | Le calcul peut finir, mais pas d’auto-commit tardif |
| Annulation confirmée | cancelled ; attentes terminées, buffers libérés selon ownership | Pas de succès métier anticipé ; canonique intact |
| Crash | failed ; toutes attentes de cette génération explicitement terminées | Modèle confirmé intact ; aucune promesse pending éternelle |
| Reprise | Nouvelle tentative/génération liée à l’ancienne, source et droits revalidés | Ne pas reprendre aveuglément pile/WASM ; rejeu logique idempotent |
| Timeout | timed_out ; résultat tardif non engageable automatiquement | Aucun seuil chiffré inventé ; budget/timeout à mesurer et décider |
| Commit dont ACK perdu | Client indéterminé ; interrogation/rejeu même requestId+portée+payload | Même résultat durable, pas seconde mutation ni annulation supposée |

Si une annulation arrive **après engagement durable**, elle ne supprime ni événement ni publication. Toute compensation est une nouvelle commande contrôlée à la tête courante, avec son propre requestId et son journal ; conflits/refus préservent l’original. Une action d’édition distante peut rendre invalide même un résultat géométriquement identique : état source et autorisation font partie du contrat.

Ownership buffer : producteur/receiver/consommateurs et durée de vie connus ; après transfert détachant le tampon, le producteur ne le lit plus comme copie valide. Le résultat est validé à la réception, même worker interne. Cache/index/preview sont reconstruisibles et non preuve de sauvegarde. Mémoire WASM/transfert/résidente et latences sont des mesures distinctes ; aucun nombre de workers, quota ou budget mémoire arbitraire fixé ici.

## 4. Reprise et outbox avec plusieurs autorités

1. Reprendre le contexte exact et l’autorité de chaque donnée ; authentifier et autoriser avant lecture des résultats/pièces. Pas de redirection de queue vers l’utilisateur ou variante nouvellement affichés.
2. Interroger les résultats des requestId connus avant tout rejeu. Même requestId avec nouveau payload/contexte est refusé ; nouveau travail exige nouvelle identité.
3. Charger une **coupe logique cohérente** des documents canoniques, révisions, journal/request-results et outbox. Le mécanisme transaction/isolement/version-set est à ratifier/éprouver ; une série de GET indépendants ne prouve pas cette coupe.
4. Reconstituer séparément intentions locales pendantes, commits centraux confirmés, conflits/rejets et previews abandonnées. Si durable inconnu, afficher indéterminé et garder la demande ; ne pas la purger pour afficher « enregistré ».
5. Consommer la notification par eventId ; une livraison répétée ne crée pas une nouvelle commande/publication. Une notification perdue ne déconfirme pas le commit durable ; elle impose resynchronisation depuis le journal.
6. Publication historique conserve manifeste/pièces/approbation/événement exacts. Le statut de livraison ou diffusion externe ne se confond pas avec l’engagement métier ; aucun nouveau droit n’est inféré d’un événement reçu.
7. Observation IF-010 : conserver révisions examinées, pièces et recontrôle ; un job recalculé ou un événement redélivré ne clôt pas automatiquement l’issue.

## 5. Manifeste candidat de restauration cohérente

Complète C-MIGRATION sans imposer format physique. Le manifeste de récupération doit identifier :

- build/commit et lecteurs, versions schéma/contrat, corpus/empreintes et cutId/transaction de coupe ; unité/repère/provenance de chaque source ; authorityEpoch et writer unique par objet/variante ;
- autorités présentes et documents/révisions exacts, parents, références/associations/topologie et données inconnues préservées ou rapport explicite ; pas d’invention de modèle3D pour A ni d’esquisse2D pour B ;
- frontière de journal, résultats de commandes/requestId et outbox pour reprendre sans doubler ni oublier un effet ; intentions locales non confirmées identifiées séparément avec leur version/contexte ;
- manifestes historiques, pièces exactes avec versions/empreintes/disponibilité, approbations et publications distinctes ; observations IF-010, rapports de contrôle et restrictions de diffusion ;
- droits applicables/version de politique et condition de réautorisation actuelle ; les droits historiques prouvent ce qui fut permis, pas automatiquement les droits futurs ;
- inventaire des ressources externes nécessaires et état complet/incomplet ; caches/index/GPU et buffers de preview restent reconstruisibles, non autorités.

Une empreinte valide ou un dump présent ne prouve pas que toutes les pièces/associations/droits existent. Si contenu absent, référence ambiguë, lecteur incompatible ou droits inconnus : récupération déclarée incomplète, rapport et action précise, jamais substitution silencieuse par latest. Les queues et événements ne sont pas jetés comme des caches.

**Restauration avec nouvelles écritures** : figer la preuve du backup et l’inventaire courant, préserver écritures confirmées depuis la coupe et commandes pendantes. Préparer la récupération dans une copie isolée, comparer puis proposer un mapping/rejeu/résolution ou rapport de pertes explicite. Aucune bascule écrasant R12/R13 par R10 par défaut. Une bascule future exige son accord et une nouvelle authorityEpoch empêchant vieux workers/clients de réengager sur l’ancienne identité. La coexistence garde un writer unique ; ancien client non compatible explicitement bloqué ou read-only selon décision, jamais double écriture Studio/Atelier.

Ni fréquence, durée de rétention, timer, lieu de stockage, RPO/RTO ni nombre de snapshots n’est modifié/décidé ici. Les jalons #149 déjà rapportés restent leur propre preuve d’exploitation ; ils ne démontrent aucune restauration Studio ni autorisation de nouvelle opération.

## 6. Matrice exigences → protections → preuve future

| Exigence source | État / garde | Propriété | Source précise réutilisée | Oracle futur / exemple | Risque si absent |
|---|---|---|---|---|---|
| IF-003, INV-006, EX-016 | Révision/source/droits revalidés avant commit | Résultat périmé historique, pas courant | RT001¶200,217–218,328 ; LOT-D/M17 | DOC-STALE ; TEST014/037 à qualifier A5 | Écrasement récent |
| IF-007, EX-061, AC-006 | failed/génération rejetée, nouvelle tentative | Attentes terminées sans mutation partielle | RT001¶664/665/670 ; LOT-D | DOC-CRASH ; crash forcé après accord | Pending infini/doublon |
| IF-007, INV-005 | cancel_requested distinct completed/commit | Calcul tardif ne crée pas effet automatique | RT001¶664/215–216 | DOC-CANCEL-CURRENT | Annulation mensongère |
| EX-018/049/089, IF-011 | Durable avant ACK, dédup requestId | Même effet/révision au rejeu identique | RT001¶332/557/866/868 ; M17 | DOC-LOST-ACK ; TEST013 | Doublons/perte queue |
| IF-010, IF-011, EX-081/082 | Event dédupliqué, manifeste immuable et recontrôle | Diffusion/approbation/contrôle distincts | RT001¶819/868/766–767 ; M24 | DOC-OUTBOX-PUBLICATION | Fausse approbation/publication |
| EX-063, INV-008 | Ownership/détachement et reconstruction | Aucun tampon/cache traité comme autorité | RT001¶667/221–222 ; LOT-D | Validation messages/buffers après accord | Buffer obsolète/fuite |
| EX-089/090 | Coupe et toutes pièces/droits vérifiés | Récupération fidèle multiautorité | RT001¶866/869 ; LOT-R/M24 | Manifest documentaire ; TEST034 | JSON seul déclaré restauré |
| EX-091, INV-005 | Copy isolée et nouvelles écritures conservées | Pas de rollback destructif implicite | RT001¶872/215–216 ; LOT-R/M17 | DOC-RESTORE-NEW-WRITES ; TEST034/036 | Perte R12/queue/historique |
| EX-062/095/097 | Mesures sourcées, budgets à décider | Mémoire/latence réelles distinguées | RT001¶666/911/965 ; LOT-D | Banc environnement déclaré, non exécuté | Quota inventé/fausse performance |

Ces exemples sont des descriptions et invariants vérifiés **entre fichiers JSON**, jamais des scénarios runtime passés. Les IDs DOC-* sont des repères d’exemples, pas de nouvelles tâches Studio ou exigences renumérotées.

## 7. Livrables, décisions et prochaine action

EXEMPLES-JOBS-REPRISE-RESTAURATION.json : six cas demandés et un manifeste incomplet illustratif. Preuve JSON : syntaxe, IDs uniques, références EX/IF/INV connues, concordance scope et références, zéro effet attendu des refus, conserve nouvelles écritures/queue, empreintes démonstratives vérifiables. Aucune restauration réelle ni preuve complète MVP.

Décisions techniques à instruire sans rouvrir cadrage D01/D02/D07 : DEC-07/11/13/18 pour exécution/resources/reprise ; DEC-03/12/16/18 pour coupe, journal et migration ; ratifier mécanisme multiautorité, identité/epoch et oracles avec A2/A5, puis autorisation bornée G2/G3 applicable. A6 garde la préparation, A2 les contrats, A1 les exigences et M24, A5 les preuves, A0 réserve les fichiers partagés. A3 ne réalise pas ce lot depuis la présente préparation.

Prochaine tâche autorisée : revue croisée de ces précisions avec M17/M24 et transcription éventuelle dans leurs dossiers canoniques par propriétaires ; pas duplication de LOT-D/R, pas case source cochée ni mission M23/M27 close. Toute expérience worker/DB/restauration, changement rétention, migration, CI, administration, fusion ou production requiert son périmètre/accord distinct.
