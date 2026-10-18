# Garde des bases de tests — DB-1/2

Commande sans réseau ni base : depuis la racine, `npm run test:db-guard`.
La configuration dédiée charge exclusivement les tests de ce dossier et des
sentinelles réseau ; elle ne charge pas `vitest.setup.ts` ni les suites API.
Le pilote et les SELECT/reset sont des doubles. Les clés de signature des
fixtures sont générées en mémoire et ne sont jamais des autorités du runtime.

Les douze suites API conservent tous leurs scénarios. Leurs resets passent
par `resetTestDatabase`, qui exige le pool attesté et une liste fermée de
tables qualifiées dans `public`. Toutes les requêtes et acquisitions de
session utilisent la même garde ; les connexions brutes ne sont pas exposées.

Le runtime exige `TEST_DATABASE_URL`, `TEST_DATABASE_RUN_ID`,
`TEST_DATABASE_COMMIT_SHA` et une attestation signée dans
`TEST_DATABASE_ATTESTATION_FILE`. Il ne reprend jamais `DATABASE_URL`.
Les URL doivent fournir une IP littérale, un port, une base, un rôle et un
mot de passe explicites ; les paramètres libpq, fragments, sockets et valeurs
implicites `PG*` sont refusés. Le TLS est prescrit par le descripteur signé :
désactivé uniquement en boucle locale ou `verify-full` avec CA capturée.

La signature Ed25519 porte sur `FADI-TEST-DATABASE/v1\0` suivi des octets
JSON canoniques du payload. Les champs du schéma sont fermés ; la durée
maximale est une heure. Le transport et l'identité PostgreSQL (éventuellement
différents derrière un NAT) sont explicites. Chaque acquisition/opération
vérifie base, rôle de session, serveur, versions PostgreSQL/PostGIS, privilèges,
marqueur préexistant du run et expiration. Le backend PID observé lie la
connexion, et une substitution ou expiration entraîne un refus expurgé.
Le marqueur ne doit pas être modifiable par le rôle de test ; la preuve des
permissions et de l'isolement appartient au provisionnement DB-3.

**Le registre d'autorités livré est volontairement vide.** Aucun fichier ou
variable d'environnement ne peut auto-enrôler une clé. Les essais réels sont
donc fermés par défaut, même si une URL et une signature de fixture existent.
L'enrôlement d'une autorité indépendante, le schéma `fadi_test_meta.provisioning`
et les droits de la base nécessitent le lot DB-3 et son accord distinct.
Le présent lot ne provisionne rien, ne contacte aucune base et ne migre rien.

La compatibilité des vraies transactions et des reprises après erreurs SQL
reste à éprouver sur base jetable autorisée. Un échec de garde détruit la
connexion ; aucun retry ni désactivation de garde n'est un retour arrière.
Les lanceurs E2E/HTTP, IFC, migration et restauration extérieurs à Vitest ne
sont pas sécurisés par ce seul correctif : leur intégration reste DB-3.
Les chemins normaux de production conservent `DATABASE_URL`, vérifié ici avec
un constructeur de pool simulé, sans connexion à une production.
