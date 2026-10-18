# A2 — Revue statique finale DB1/DB2

Réception du périmètre purement simulé : aucun défaut bloquant restant identifié dans les sources relues. Ce verdict n'autorise ni connexion PostgreSQL réelle, ni DB3, ni fusion. A2 n'a lancé aucun test, socket, migration ou SQL réel. Les résultats de tests sont à rattacher séparément aux journaux A3/A5 et au commit final.

## Contrat et corrections vérifiées

- Registre d'autorités fixe et vide par défaut : aucune clé de confiance fournie par environnement/descripteur ; signature Ed25519 séparée, portée run/commit/endpoint/base/rôle/marker/version/expiration. En l'état, aucune base réelle ne peut être autorisée.
- URL PostgreSQL restrictive, IP littérale, port explicite, absence de query/options/multihôte et refus des variables PG* implicites ; recontrôle PG* immédiatement avant connexion du transport runtime. Options, descripteur et capture externe figés, capacité WeakMap non forgeable.
- Transport brut encapsulé. Attestation de l'identité et du marker avant chaque opération, sur la même connexion ; PID de session observé conservé et substitution refusée. Toute erreur détruit la connexion avec message expurgé.
- Catalogues et fonctions intégrées d'IDENTITY_SQL qualifiés pg_catalog ; PostGIS explicitement public.postgis_lib_version(), conformément au schéma d'initialisation existant. current_user/session_user restent des mots-clés SQL.
- Liste fermée de tables qualifiées public, copie figée avant toute attente. QueryConfig.text copié avant attente. Les changements ultérieurs du tableau de tables ou de l'objet QueryConfig ne substituent plus le SQL validé.
- Façades figées ; release ou end pendant l'attestation empêche l'exécution de la requête applicative après cette attente ; concurrence sur une même façade refusée. Les tests adversariaux source couvrent ces cas et la substitution PID.
- Configuration Vitest dédiée limitée à src/testing/**/*.test.ts ; setup dédié bloque les entrées sockets, TLS et DNS avant tout réseau. Le remplacement de TRUNCATE dans les douze suites conserve leurs scénarios ; leur exécution sur base réelle reste fermée.
- Chemin client de production conservé hors VITEST/NODE_ENV=test. Cette conservation est une observation statique et un scénario mocké, pas une recette de production.

## Réserves DB3 obligatoires

L'identité signée est une précondition, non un provisionnement. L'autorisation DB3 devra fournir et approuver l'émetteur indépendant, la cible jetable, le rôle non privilégié, les ACL du marker non modifiable par ce rôle, le schéma PostGIS public ou une nouvelle décision explicite, ainsi que la correspondance transport/identité serveur en présence de NAT. Aucune de ces propriétés n'est démontrée par les doubles de test.

La compatibilité réelle pg/Drizzle, notamment transactions et échec SQL conduisant à une transaction avortée, les timeouts, le TLS réel et les refus sur serveur devront être éprouvés sous autorisation DB3. Une attestation SELECT échouant en transaction avortée conduit à la fermeture : cela protège le refus mais ne prouve pas la compatibilité des scénarios d'intégration. Les lanceurs externes E2E/HTTP/IFC/migration/restauration restent hors de ce correctif ; ne pas présenter DB1/DB2 comme leur sécurisation. Le CASCADE implique l'examen ultérieur des dépendances et privilèges réels de la base jetable.

Aucune validation d'algorithmes métier, de vulnérabilités générales ni de SQL arbitraire applicatif n'est déduite. Le filtre TRUNCATE n'est pas une politique générale de SQL en lecture seule ; les scénarios autorisés utilisent des écritures sur la future cible jetable.

## Empreinte de la copie relue, avant commit A3

| Fichier apps/api/src/testing/ | SHA256 |
|---|---|
| test-target.ts | b8ca60d71e48e80f75c66f4d0bf22edeb60ebc5adf6a4a9e960b7af1ced309ec |
| guarded-test-pool.ts | d0ac9e095a83ff16cde7c3132fa900ca634c27d49309e97b518de305ab390f5b |
| test-database.ts | 696e998d8985d64549bff184d30b8ef40c2f6dd6238d20d64c3af64ca3ebee36 |
| approved-test-authorities.ts | 8e277b41e222d4bd0fbaa8431a6b99923367dc44f946dfbd571a00822fe92cf9 |

Un changement après cette empreinte exige de rattacher ou actualiser la revue. Workflow CI : revue A0/A6 distincte, aucun verdict global CI donné ici.

## Actualisation finale avant commit A3

Delta guarded-test-pool.ts relu : helper destroy() commun capture les erreurs de release(true) et les remplace par SESSION_NOT_VERIFIED ; tous les chemins de fermeture utilisent ce helper. Erreurs connect expurgées par safeFailure, sans divulgation du transport ; end reste fermé et expurge son erreur. Les contrôles released/ended après attente, captures des tables/QueryConfig et PID observé sont conservés. Trois autres fichiers centraux ont une empreinte inchangée. Aucun blocage supplémentaire identifié en lecture statique DB1/DB2 ; aucune nouvelle preuve runtime déduite. Résultats 129 tests/3 fichiers et 83 tests A5 rapportés par leurs auteurs, non exécutés par A2 et à rattacher aux journaux finaux A0.
