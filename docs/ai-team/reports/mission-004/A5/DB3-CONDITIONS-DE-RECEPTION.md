# DB3 — conditions de réception après PR169, préparation seulement

18octobre2026, A5. Suite à PR169/a15d650… et ses tests purs, cette note ajoute une **matrice de preuves réelles** à la spécification DB déjà écrite, sans la remplacer. Aucun code, cléopérationnelle, SQLréel, service, migration ou reset exécuté. DB3 non autorisée par D03. Réutiliser `MISSION003/A5/A5-M02-M09-M15-M26.md` pour interfaces/refus/SQL et les décisionsD03/D04 pour limites ; ne pas créer une seconde garde.

## Autorisation à demander avant toute action

Autorisationowner bornée : identitéhôte/runtime isolé, SHAcodeexact, source et licence des données synthétiques, nomsbase/rôle/run/volume et propriétaires, opérationsadmises, durée, artefacts/preuves, destructionéventuelle et retourarrière. Distinguer créationDB/schéma/extension/marker, migrations, reset effectif, lancementAPI/E2E et destructionfinale. Un accord sur un de ces actes ne couvre pas les autres. Le refus d’une vraie production reste démontré par doubles ; **aucun essai du refus sur une cible sensible**.

D04a ne suffit pas si la base n’est pas déjà provisionnée/attestée ; pas d’initialisationimplicite. La CI pure PR169 ne constitue ni autorisation ni preuveDB3. Garder le job sansservice tant que ces conditions sont ouvertes ; ne pas fusionner le chemin nonopérationnel runtime par simple succès129tests.

## Dossier minimal et preuves de sortie

| Étape | Condition/préparation | Preuve attendue après autorisation | Refus/arrêt |
|---|---|---|---|
| B3-01 référence | PR169 et dépendances relues à SHA exact, garde et tests sansaffaiblissement | Hashescode/contrat et CI ; hypothèses de compatibilité explicites | SHA inconnu/contratdivergent |
| B3-02 ciblejetable | Endpoint/base/rôle/volume uniques au run, pascredentialprod ni route productive | AttestationprovisioningA6 indépendante, réseau/volumes/versions et identité locale | Basepréexistante nonattribuée ou volumepartagé inconnu |
| B3-03 autorité | Registryruntime volontairement vide aujourd’hui ; enrôlementpublickey = changement distinct revu/autorisé | Émetteur/keyId/publickeyfingerprint approuvés, provenance et révocation ; privatekey horsGitHub/tests/artifacts | Enrôlement d’une clé defixture ou cléfournie arbitrairement par envdescriptor |
| B3-04 descriptor | Réutiliser schéma exactPR169 : signatureEd25519/domain, run/commit, fenêtre≤1h, transportIP/port/base/rôle, TLS, identitéserveur/versionPostGIS/marker | Descriptor signé expurgé et empreinte ; clé vérifiée contreanchor indépendant | Descriptorautovalidant, signature inconnue, ambiguïté/expiry ou simple localhost/testflag |
| B3-05 droits | Rôle applicatiftest nonprivilégié, sanssuperuser/CREATEDB/CREATEROLE/replication/bypassRLS, sansaccèsautresbasesmétier | Requêtelecturedroits et test de privilèges sur seconde cibleégalementjetable siautorisé ; session_user/current_user exacts | Droit horspérimètre, rôlesadministrateurs réutilisés |
| B3-06 marker | Provisioning crée marker avant lancement ; rôlemutateur ne peut pas le forger/modifier | ACLschema/table, SELECTmarqueur, schéma/version/run/expirationmatch ; propriétaires distincts | Marker créépargarde ou rôle pouvant réécrire sa proprepreuve |
| B3-07 extensions | Vérifier schémaexactPostGIS attendu parSQLidentityPR169 et versionnumserveur | LecturesPostgres/PostGIS, schemaextension, timezone/encodage utiles | Mauvaisschema/version ou fonctionpublique remplacée ; pas de fallback silencieux |
| B3-08 CASCADE | Réutiliser RESET_TABLES et schémaqualifiépublic ; inventorier clôture FK/triggers dépendants | Inventairelectureseule tables/relations/schémas/cascades ; aucune dépendancemeta/autreprojet/basepartagée | CASCADE horsensembleautorisé, besoinGRANTglobal pour fairepasser |
| B3-09 positif | Réinitialisation explicite de fixturesnonproductives sur sessionattestée, mêmes identités avant/après | Identitéconnection/backend,1reset attendu, effets exacts, journalexpurgé, pasmutationautrebase | Identitédifférente/reconnexion nonattestée, effetinattendu |
| B3-10 négatifsréels sûrs | Attestation/marker/rôle divergents uniquement sur autresciblesjetables approuvées ; casproduction restent simulés | Refus et0SQLdestructif mesurés par instrumentation côtébanc, étatcanariintact | Testnégatif visant vraiecibleproduction/inconnue |
| B3-11 sessions | Reconnexion/backend/substitution/expiry de capacités attestées | Contrôle effectif temps/poolend/rolerevocation, aucunSQLaprèsrefus ; erreurs expurgées | Désactivation temporaire de la garde ou retryaveugle |
| B3-12 ORM/intégration | Drizzle réel déjà exercé avecmocks ; vérificationDBtransaction réelle sur basejetable relève accordDB3 | BEGIN/body/COMMIT etROLLBACK atomiques, uneconnexion ; rowModearray/paramètres ;12suitesAPI réellementexecutées seulementsiaccordexplicite | Présenter testsmockés comme transactionPostgresréelle |
| B3-13 lanceurs | N13 E2E, N14 migration/restauration/image restent nonprotégésglobalement parDB1/2 | Contrats/endpoints/identités/guardesciblés, autorisation de code et essais correspondants | Activer ceslanceurs surpreuvehelperseulement |
| B3-14 clôture | Archiverpreuve à SHA, risques et prochaineaction ; nettoyage distinct | AvisA2/A5/A6 + décisionowner ; destruction/sauvegarde seulement siincluse | CIverte assimilée acceptation métier/fusion/production |

Les détailsSQL etcasDBN01..16/P01..02 restent canoniques dans M003/M004, pas recopiés comme nouveaux identifiants de mission. LesIDs B3ci-dessus sont des sections de réception locale, **pas IDs630 ni obligationssupplémentaires acceptées**.

## Critères quantitatifs et limites

- Zéroconnexion à une cible interdite/production lors des essais de refus ; zéroDML/DDL/reset avantattestationvalide.
- Exactement unreset demandé et unensemblefermé de tables, aucunmarqueur/provenance réécrit par lerôleapplicatif.
- Toutes lesidentités descriptor/signature/run/commit/versions/temps doivent correspondre ; aucune tolérance de sécurité.
- N13/N14 restent « préparation/nonintégrés » jusqu’auxpreuves correspondantes. Nombre de tests purs et couvertureparfamille n’est pas un taux de sécurisationdel’ensemble des lanceurs.
- Pasde SLAperformance ni de délai réseau universel inventé ; timeoutsgarde existants à observer, sanslesaugmenter pourcacher unrefus. Touteadaptationcontrat future doit être justifiée/revue.

## Demande d’accord future prête

« Autoriser DB3 sur une base entièrement synthétiquejetable identifiée, avec provisioning/extension/schéma/marker et enrôlement d’une autorité dédiée explicitement décrits, puis essaispositifs et négatifs sûrs de la garde au SHA retenu ; sansproduction, sansdonnéesclient et sansE2Eglobal/migrationproduction/fusion/déploiement. La destructionfinale et les tests E2E/migration/restauration sont autorisations séparées s’ils ne sont pas nommément inclus. »

A0 doit compléter identitécible/émetteur/SHA/opérations et soumettre ce dossier concret. En attendant : continuerlespréparationsdocumentaires, ne pas générer de cléopérationnelle, provisionner ou se connecter pour remplir des cases.
