# A6 — CI bornée A3-DB-1/2

Mission004, code baseline main a4caaab0e6665480f09febe3914c960b424b6b47 ; branche courte fix/157-test-database-guard. Autorisation A3-DB-1/2 et coordination A0 lues ; aucun DB-3, service, migration, accès production ou administration engagé.

## Changement proposé, soumis à revue concrète A0

Seul fichier écrit par A6 dans le checkout code : `.github/workflows/ci.yml`. Les jobs validate/e2e/image reçoivent une condition de job **avant services**. Ils sont non exécutés uniquement si les quatre conditions coïncident : événement pull_request, dépôt source RachEma-ux/Fadi, head fix/157-test-database-guard, base main. Les push main, forks, autres branches et bases gardent le comportement existant. Aucun test, assertion ou étape de recette n’est supprimé ou affaibli.

La même condition active un job explicite `DB1/2 — tests simulés sans base (DB3 non validée)` : installation sans lifecycle, typecheck, `npm run test:db-guard` fourni par A3, build sans exécution du bundle. Aucun service ni migration. Résumé always explicite : les jobs DB/API/E2E/image sont skipped et ne prouvent aucun succès d’intégration, DB-3 et fusion restent non autorisées. Aucun continue-on-error ni filtre de logs masquant un échec.

Une fois ce lot clos, retirer cette exception bornée lors d’un lot autorisé dédié ; elle ne doit pas devenir un mécanisme général d’exclusion. Tant qu’elle existe, le nom exact de branche reste réservé à ce seul lot. Aucun push ou PR avant revue A0 du diff et vérification commande ciblée.

## Installation et build audités

Lecture des manifestes racine/apps/packages : aucun preinstall/install/postinstall/prepare racine ou workspace. Lockfile hasInstallScript : esbuild0.25.12 et fsevents2.3.3/nested2.3.2 optionnels macOS. `npm ci --ignore-scripts --no-audit --no-fund` empêche ces lifecycle ; le binaire optionnel @esbuild/linux-x64 est verrouillé à0.25.12. Aucune reconstruction postinstall manuelle implicite. Si binaire absent, laisser échouer le build et diagnostiquer ; ne pas relancer les scripts sans revue.

Build web : tsc et Vite, plugin local de génération serviceworker lisant assets et Git ; pas lancement API. Build API esbuild bundle et copie schema/data, n’exécute pas server.ts. Copier SQL n’applique pas SQL. Ne pas utiliser `npm test` global ou config API standard qui pointe vitest.setup.ts et suites intégration. Commande convenue A3 : racine test:db-guard → workspace API test:db-guard → vitest --config vitest.guard.config.ts ciblant src/testing/**/*.test.ts, sans setup API partagé.

## Contrôles réellement réalisés

YAML parsé avec PyYAML ; quatre jobs attendus. Matrice locale des cinq événements : seule PR même dépôt/branche/base active le job pur et exclut les trois jobs avec services ; pushmain/fork/autrehead/autrebase n’activent pas l’exception. Position if avant runs-on/services vérifiée dans le texte. Ce contrôle local ne prétend pas exécuter GitHub Actions.

Aucun npm ci/build/test lancé par A6 avant livraison des commandes et tests A3/A5. A0 coordonne leur exécution et preuve au SHA final ; ce document ne transfère aucun résultat historique au nouveau code. La configuration ciblée doit encore être relue après écriture A3 et les sentinelles de transport vérifiées par A5/A6 avant PR.

## Cloud et D04

Statut runtime relu Mission004 : wanted/observed32, observations courantes, running, politique enforced. Les révisions18 et10 demeurent historiques. Aucun port DB sondé ni connexion DB ouverte par A6 pendant cette mission. Cible jetable non attestée : D04a ne permet pas démarrer ; D04b non autorisée. Aucun service, volume, snapshot ou permission changé.

## Revue sécurité provisoire

test-target.ts lu : crypto et net.isIP sans sockets ; endpoint IP exact sans résolutionDNS, attestationEd25519, run/SHA/expiry, TLS explicite et loopback seul si désactivé, options gelées et jeton WeakMap. L’autorité runtime doit être une registry publique fixe revue, jamais une clé choisie par le descripteur ou une variable utilisateur. Fixtures de signature injectées en tests ne constituent pas une autorité réelle de provisionnement. Registre runtime vide prévu : fermeture attendue de DB-3, pas capacité réelle prétendue.

Driver/session non encore livrés lors de ce premier relevé : revue finale à compléter. Les scénarios positifs sont autorisés uniquement avec doubles, sans import instanciant pg ou transport réel. Un succès des tests simulés ne vaut ni connexion réelle sûre, ni validation fonctionnelle, ni fusion autorisée.

## Complément de revue après livraison du driver

`guarded-test-pool.ts`, `test-database.ts`, `approved-test-authorities.ts`, client et config Vitest dédiée désormais lus. Le module de garde importe pg uniquement comme type ; le module runtime importe pg, mais le registre d’autorités vide refuse avant toute instanciation Pool et avant lecture d’attestation. Aucun chemin environnement ne permet d’enrôler une autorité. Les fixtures signées des tests ne sont pas ajoutées au registre réel.

Le transport privé est obtenu après validation de capacité ; checkout vérifie identité SELECT sur même client, rôle/session_role, adresse/port internes, versions, privilèges et marqueur. Expiration réévaluée avant mutation ; façade cache le client brut, les reconnexions repassent l’attestation. Le reset n’accepte que la liste fermée et qualifie public ; erreurs driver non propagées. La config pure ne charge pas vitest.setup.ts, ne cible que src/testing/**/*.test.ts et les premiers tests A5 lus n’importent pas pg/transport.

Réserves DB-3 explicites : provisionneur indépendant à créer/valider séparément, droits du rôle sur le marqueur à rendre non falsifiables, identité/volumes/schéma attestés, vraie validation transports/TLS/NAT et transactions Drizzle non exécutée ici. Le registre runtime vide bloque volontairement toute suite DB réelle ; il ne doit pas être rempli de clés fixtures pour faire passer une CI. Les tests purs ne certifient pas l’ensemble des chemins runtime/API/E2E. Revue de toutes les suites et preuves simulées demeure partagée avec A2/A5.
