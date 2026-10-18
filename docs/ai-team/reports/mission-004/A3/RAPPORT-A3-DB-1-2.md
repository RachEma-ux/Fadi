# A3 — Mission 004 / lot DB-1/2

Baseline : main `a4caaab0e6665480f09febe3914c960b424b6b47`, branche courte `fix/157-test-database-guard`, Issue #157. Le commit et la PR sont réservés à A0.

## Réalisation bornée

- Cible TEST_DATABASE_URL explicite, aucun fallback DATABASE_URL ; séparation client de production inchangé par défaut, client de test forcé sous Vitest ou NODE_ENV=test.
- Parseur fermé PostgreSQL : IP littérale/port/base/rôle/password explicites, refus options URL, fragment/socket/encodage invalide et variables PG* implicites ; pas de résolution DNS.
- Descripteur versionné signé Ed25519 avec domaine séparé, run/SHA/tuple/identité/CA TLS/marqueur/expiry ; champs inconnus et JSON non canonique refusés. Capacité opaque WeakMap, options/descripteur/wrapper gelés, horloge monotone et expiration revérifiées.
- Ancre de confiance FIXE : registre approuvé volontairement vide dans le runtime DB-1/2. Aucune clé de fixture ou clé fournie par env/descripteur n'est enrôlée. En conséquence toute tentative DB réelle reste fermée avant construction d'un pool. Enrôlement et provisionnement appartiennent à DB-3 après accord distinct.
- Pool par composition, aucun pool/client/config bruts exposés. Chaque checkout et opération lit identité/marqueur sur la même connexion ; privilèges excessifs refusés, backend PID observé lie la session, libération/fin du pool/substitution/expiry invalidantes. SQL d'identité qualifié pg_catalog/public ; marqueur préexistant, jamais créé par la garde.
- Reset à capacité privée, liste fermée de 25 tables qualifiées public, mêmes listes qu'avant dans les 12 suites. Copie du scope et QueryConfig AVANT tout await : substitution pendant attestation refusée ou capture conservée. Aucun scénario historique supprimé, skippé ou affaibli.
- Erreurs/verdicts expurgés, y compris factory/connect/query/release/end ; aucun SQL, URL ou credential du driver recopié.
- Lanceur pur npm run test:db-guard séparé du setup d'intégration, sentinelles net.Socket.connect/net.createConnection/tls.connect/dns.lookup/dns.resolve et factories injectées. Les doubles comptent connexions/lectures/mutations/libérations ; aucune DB réelle, même SELECT, et aucun HTTP/E2E.

## Revue de sécurité et corrections effectives

A2 a demandé puis vérifié le gel du wrapper externe, les copies TOCTOU tables/QueryConfig, la liaison PID, le SQL qualifié et l'invalidation de fin du pool. A5 a produit des tests adversariaux indépendants qui ont d'abord révélé des erreurs brutes de factory, une mutation après release pendant une attestation et une mutation après end. Ces défauts ont été corrigés avant le checkpoint ; les assertions n'ont pas été affaiblies.

## Matrice des cas préparés

| Cas | Couverture DB-1/2 réelle |
|---|---|
| N01 | Refus TEST_DATABASE_URL absente/DATABASE_URL seule ; intégration client avec constructeur pg simulé non appelé |
| N02 | Parseur URL malformée/protocole/champs/encodage ; factory et mutation jamais appelées |
| N03/N04 | Tuple endpoint/port/base/rôle divergent malgré signature/drapeaux ; zéro connexion |
| N05 | Signature/clé non approuvée/descripteur/temps/run/version invalides ; zéro connexion |
| N06 | Options host/service/SSL et doublons, fragment/socket, PG* implicites ; zéro connexion |
| N07 | Identité DB/session_role/user/serveur/versions divergente ; SELECT simulé uniquement, zéro mutation |
| N08 | Marqueur absent/incorrect/autre run ou rôle privilégié ; zéro mutation |
| N09 | Erreurs de connexion/SELECT/factory simulées et expurgées ; zéro retry/mutation |
| N10 | Capture immuable après mutation de l'env/descriptor/options ; TLS capturé |
| N11 | Reconnexion, PID différent, release/end pendant SELECT, expiration/horloge ; zéro mutation après refus |
| N12 | Douze suites recâblées et inspectées sans les importer ; raw pool forgé/helper et TRUNCATE direct refusés |
| N13 | Client de test non autorisé par BASE_URL héritée ; vraie intégration lanceurs API/E2E hors DB-1/2, DB-3 ouverte |
| N14 | Client de test non autorisé par MIGRATE_ON_START ; lanceurs migration/restauration non exécutés et non sécurisés par ce seul lot, DB-3 ouverte |
| N15 | Messages driver/parseur/factory/session expurgés avec sentinelles synthétiques |
| N16 | Run différent et scope vide/dupliqué/hors allowlist refusés ; zéro mutation |
| P01 | Cible signée valide autorisée avec clé générée en mémoire dans les tests uniquement ; zéro réseau |
| P02 | Reset simulé strictement après attestations sur une seule fausse connexion ; aucun TRUNCATE réel |

## Limites conservées

Aucune attestation de provisionnement réelle n'est disponible, aucune autorité n'est enrôlée et aucun schéma de marqueur n'a été créé. Les droits (base isolée, rôle non privilégié sans membership dangereux, absence d'accès à d'autres bases, marqueur et fonctions non modifiables, dépendances CASCADE) restent un contrat DB-3 à vérifier sur cible jetable approuvée. Les suites API d'intégration demeurent fermées ; elles ne sont pas déclarées passées. Compatibilité réelle PostgreSQL/Drizzle/transactions après erreur SQL, TLS et délais du driver reste à valider DB-3. Les doubles testent le contrôle de flux et l'adaptateur, pas le serveur Postgres.

Lanceurs hors Vitest (API/E2E, IFC, migration/restauration, builder-deploy) restent à inventorier/intégrer dans DB-3. Le lot n'autorise aucun démarrage de service, vraie connexion, initialisation, migration, déploiement, modification administrative, fusion, donnée de production ni modification DrawAll. Pas de revendication «16/16 lanceurs sécurisés».

Retour arrière : bloquer les suites mutatrices et conserver le refus sûr ; ne jamais désactiver la garde pour faire passer la CI. Les modifications restent sur branche courte sans fusion.

## Vérifications

Voir `validation.json` au gel final de l'arbre. Les tests ciblés purs, typecheck API et build API ont été réellement exécutés ; aucun test API contre DB ni npm test global n'a été exécuté.

Résultat final réellement exécuté : **129 tests purs réussis, trois fichiers** (dont 83 cas adversariaux A5), zéro appel aux sentinelles réseau ; typecheck API, build API et diff whitespace réussis. Les tests utilisent également le vrai adaptateur Drizzle avec transport entièrement simulé pour BEGIN/COMMIT/ROLLBACK et rowMode array sur une connexion unique. Ces essais ne démontrent pas une transaction réelle PostgreSQL.
