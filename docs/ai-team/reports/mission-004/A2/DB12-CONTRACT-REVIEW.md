# Mission 004 — revue A2 du contrat A3-DB-1/2

Référence de code : branche `fix/157-test-database-guard`, base `a4caaab0e6665480f09febe3914c960b424b6b47`. Autorisation : prompt Mission004 et délégation D03 (documents au checkpoint `301a4fa` de #165), code/tests totalement simulés uniquement ; A3 seul écrivain code. Cette revue de contrat ne vaut ni approbation du diff final, ni permission DB-3, ni fusion. A2 n’a ouvert aucune connexion, exécuté aucun test API/E2E ni modifié le dépôt.

## Contrat retenu pour la préparation de DB-1/2

| Interface / autorité | Contrat et refus |
|---|---|
| Source cible | TEST_DATABASE_URL obligatoire, aucun fallback DATABASE_URL ni variables libpq PG*. Tous champs transport explicites ; erreurs codifiées sans URL/credential. |
| Parseur | PostgreSQL strict, IP littérale/port/base/rôle exacts, décodage unique contrôlé. Refus protocoles inattendus, multi-host/service/socket, query/options et fragments, ambiguïtés, caractères de contrôle, encodages invalides. Normaliser sans perdre TLS ou réintroduire une valeur du driver. |
| Descripteur signé | schemaVersion, ephemeral/disposable, runId/commitSha, issuedAt/expiresAt, tuple transport et tuple identité serveur distincts, markerId/version, TLS et CA contenus dans le payload signé ; borne de durée et unités de temps documentées. |
| Ancre indépendante | Ed25519, domaine FADI-TEST-DATABASE/v1 + séparateur, payload JSON strict signé. keyId résolu uniquement dans registre de confiance fixe du dépôt. **Registre vide par défaut dans DB-1/2**, aucune clé réelle ni fixture enrôlée par env/descriptor. Le propriétaire/provisioner futur doit faire approuver issuer et cible dans DB-3. Mode0600/owner d’un fichier public fourni par l’appelant ne suffit pas. |
| Capacité opaque | Token runtime créé seulement après validation et lié par WeakMap aux valeurs capturées ; clone d’objet ou token forgeable refusé. Environnement ultérieurement modifié ne change pas la cible. Geler options, TLS, descripteur et **wrapper de capture**, pas seulement ses enfants. |
| Connexion / session | Factory injectée uniquement dans tests purs. Driver livré utilise toujours le registre fixe. Avant toute opération mutatrice, attester la connexion exacte via liste fermée de SELECT : base/rôle, adresse/port/version serveur, PostGIS, privilèges, marqueur et version/run/expiration. Privilèges élevés ou identité divergente => refus et fermeture sans mutation. Aucun marqueur créé pour réussir. |
| Transport et TLS | Boucle locale seule admise sans TLS dans la proposition A3 ; ailleurs verify-full, CA signée capturée en contenu, pas chemin remplaçable. NAT port/adresse transport peuvent différer de l’identité interne : correspondance explicitement signée, pas supposition ni simple résolution DNS. Cela reste à éprouver après accord DB-3. |
| Pool / reconnexion | Composition, pas rawPool/rawClient/options de connexion mutables exposés. Une nouvelle connexion, substitution de client ou session, erreur/reconnexion, changement de run ou expiration invalide l’autorisation de mutation ; nouvelle attestation sur même connexion avant reset. Aucun retry aveugle ni connectionString par défaut. |
| Reset | Entrée exige session vérifiée non forgeable, même run/contexte, tables statiques qualifiées autorisées. Un reset ne décide pas lui-même sa cible. Refuser table inconnue/concurrence de run avant SQL destructif ; CASCADE peut dépasser liste, donc DB entière et rôle doivent être réellement jetables et bornés avant DB-3. |
| Production | Chemin normal du client applicatif conservé ; pas validation test imposée globalement à production, pas changement DATABASE_URL productive. Tests API capturent configuration test avant import du driver, aucun bootstrap .env applicatif tardif susceptible de rediriger. |

**Conséquence volontaire :** avec le registre de confiance vide, DB-1/2 livré est non activable contre une base réelle. Les tests injectent des clés éphémères, faux connecteurs et faux résultats SELECT uniquement. Ce verrou n’est pas une panne à contourner par une variable ; DB-3 doit apporter la cible et l’autorité de provisioning effectivement autorisées. La réussite de tests simulés ne prouve pas le marquage d’une base réelle ni son isolement.

## Premiers constats sur le code en cours (pas revue finale)

Lecture de `src/testing/test-target.ts` pendant création A3 : imports crypto/net.isIP, pas de pg/socket/SQL ; IP exacte, options explicites et TLS signé, schéma fermé, JSON.stringify égal au payload pour rejeter doublons/encodages alternatifs, signature sur payload séparé par domaine ; expiration relue au déballage du token. Ces mécanismes concordent avec le contrat, sous réserve des tests.

Point transmis à A3 : `capturedTestTarget` exposait un wrapper mutable bien que ses objets enfants fussent gelés. Réaffecter wrapper.options/descriptor/now restait possible. **Critère avant revue finale : geler aussi la capture externe et tester cette substitution**, ainsi que l’immutabilité TLS. Ce constat porte sur l’état intermédiaire lu, pas sur le futur diff final.

Driver/session non encore relus au présent checkpoint. La signature seule ne vérifie pas la cible connectée ; aucun verdict « garde complète » avant inventaire des points d’entrée, implémentation de l’attestation de session et revue des douze suites/lanceurs.

## Preuves exigées avant réception

DB-N01..N16 et P01/P02 du dossier A5 doivent tracer factory/read/mutation/close ; refus avant transport => zéro factory, refus d’identité après faux SELECT => zéro mutation et fermeture ; succès reset seulement sur même faux client attesté. Cas supplémentaires : clé attaquante refusée, registre vide, JSON dupliqué/extra fields, encodages et URL avec overrides, expiry/recul d’horloge, mutation env/options/capture, clone token, rawPool/connect/query/release/reconnect et identité remplacée, erreur expurgée. Vérifier que les tests d’intégration de la garde ne mockent pas la garde elle-même.

N13/N14 (API cible, migration/restauration) doivent annoncer leur portée réelle : une interdiction ou un test de garde pure ne constitue pas branchement de tous les lanceurs E2E/restauration. Relever séparément les chemins hors Vitest et les réserver à DB-3 ou au lot explicitement autorisé ; aucun prétendu test réel d’un refus production.

Critère de revue A2 final : diff précis, aucune connexion DB, production intacte, ancre vide effective, accès session non contournable dans le chemin livré, toutes mutations des douze suites passent la garde, résultats simulés et réserves honnêtes. A5/A6 relisent sécurité et tests indépendamment. A0 arbitre la réception et les communications GitHub.

### Revue intermédiaire du wrapper après création (points transmis à A3)

- Geler aussi la capture WeakMap a été pris en compte dans le fichier relu ; le test A5 indépendant vérifie les réaffectations wrapper et enfants. Exécution de ce test attribuable à A5/A3 seulement, pas revendiquée par A2.
- **TOCTOU liste de reset** : la version intermédiaire valide `tables.some(...)` puis attend checkout/attestation et réutilise ensuite le tableau d’appelant pour composer SQL. Capturer une copie immuable avant le premier await et la revalider, avec faux SELECT suspendu permettant de muter le tableau original dans un test déterministe.
- **TOCTOU QueryConfig** : `sqlText(args)` vérifie un texte avant attestation asynchrone, mais `raw.query(...args)` reçoit les objets originaux après l’attente. La requête/configuration doit être capturée et ne plus pouvoir changer après le contrôle (tests avec texte substitué pendant faux SELECT). Ne pas casser rowMode/types nécessaires à Drizzle en sérialisant aveuglément des fonctions.
- **Session observée** : le tuple cible/marker ne distingue pas à lui seul une nouvelle session au même endpoint. A0 a demandé nonce/backend PID et preuve de substitution ; cela doit être spécifié et testé avec reconnexion/expiration avant réception du wrapper. Aucun interleaving réel n’est allégué.
- La compatibilité de détection transactionnelle a été lue dans Drizzle installé : `NodePgSession.transaction` reconnaît `instanceof Pool` ou nom de constructeur contenant `Pool` ; le wrapper nommé GuardedTestPool conserve ce mécanisme. Cela ne constitue pas un test d’intégration ou une preuve de commit SQL réel.

Ces remarques portent sur le code en cours ; A3 demeure seul responsable des changements et tests. Le rapport ne remplace pas la revue du SHA final.
