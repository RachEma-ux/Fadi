# Autres workflows des index réconciliés — A6

PASS statique borné : [(169, 1771), (171, 1762)]. Cinq autres workflows et sept scripts transitifs par arbre, tous identiques à main817 ; blobs des anciens HEAD également inventoriés.

- codex-missions : Tests Python documentaires stdlib/tempfile ; export RUNNER_TEMP/upload artifact. Aucun npm/application/DB.
- continuity : node:test avec fixtures temporaires supprimées, validation docs ; import continuity.mjs ne lance pas CLI init. git fetch origin BASE_REF entre guillemets = réseau GitHub ; execFileSync git diff sans shell.
- fadi-isolation : node --check et lecture fs/path/url ; aucun import applicatif/driver.
- audit-drawall : Inventaire local Fadi, écriture rapport JSON et upload ; aucun changement DrawAll. Filtre chemins vérifié sur diff actuel.
- builder-deploy : Dispatch manuel SEULEMENT, non éligible à mise à jour PR/push branche. Contient réellement PostgreSQL/migration/npm test/TRUNCATE/API/tunnel public/permission deployments write : aucune exécution autorisée.

Actions checkout/setup/upload et git fetch impliquent réseau GitHub ; tests documentaires modifient leurs fixtures temporaires, export écrit RUNNER_TEMP. Pas zéro IO/réseau mais aucun DB/API/migration dans autres workflows éligibles. Aucun workflow_run/repository_dispatch/pull_request_target. A3 a déjà committé localement : HEAD et parents actuels enregistrés ; index lu sans supposer MERGE_HEAD présent. CI ci.yml revue séparément ; aucune preuve CI futur SHA ni accord fusion main/admin.

Lecture des index : git ls-files/show :path/rev-parse/diff --cached ; aucun script importé/exécuté, aucun réseau/service/DB.
