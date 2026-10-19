#!/bin/bash
# Tests de fadi-preprod sans root ni démon Docker : dispositions jetables, doubles de docker / curl (doubles/), rôles
# simulés par SUDO_USER. Couvre la garde d'isolation (cas normaux + 10 configurations dangereuses), la propagation des
# échecs (build, check, smoke, backup, restore-check, migrate, e2e), l'extraction des rapports (liens, chemins),
# les droits des résultats, la séparation administrateur / opérateur et l'intégrité du code approuvé.
# Usage : deploy/preprod/tests/run.sh   (requiert bash, git, python3, le client docker compose)
set -uo pipefail
umask 077
ICI=$(cd "$(dirname "$0")" && pwd)
PREPROD=$(dirname "$ICI")
REPO=$(cd "$PREPROD/../.." && pwd)
SCRIPT=$PREPROD/fadi-preprod
T=$(mktemp -d)
trap 'chmod -R u+rwX "$T" 2>/dev/null; rm -rf "$T"' EXIT
ok=0; ko=0

liste_e2e() { sed -n '/^E2E_DEFAUT="/,/"$/p' "$SCRIPT" | tr -d '"' | sed 's/^E2E_DEFAUT=//'; }

# Disposition jetable : src = dépôt git (deploy/preprod + scénarios vides), commit approuvé, secrets factices 0600.
dispo() {
  local B=$T/$1
  mkdir -m 0700 "$B" "$B/env" "$B/src"
  mkdir -p "$B/src/deploy" "$B/src/apps/web/e2e"
  cp -r "$PREPROD" "$B/src/deploy/"; rm -rf "$B/src/deploy/preprod/tests"
  for s in $(liste_e2e); do : > "$B/src/apps/web/e2e/$s.mjs"; done
  git -C "$B/src" init -q
  git -C "$B/src" add -A
  git -C "$B/src" -c user.name=test -c user.email=test@invalid commit -qm dispo
  git -C "$B/src" rev-parse HEAD > "$B/approved-commit"
  chmod -R u=rwX,go=rX "$B/src"   # comme `sync` : code lisible par l'image, BASE reste en 0700
  printf 'PREPROD_POSTGRES_PASSWORD=test-a\nPREPROD_ARCHIVE_SIGNING_KEY=test-b\n' > "$B/env/.env.preprod"
  chmod 0600 "$B/env/.env.preprod"
  echo "$B"
}
# Lance fadi-preprod sur la disposition $B en opérateur.
fp() { env FADI_PREPROD_BASE="$B" FADI_PREPROD_TEST_BIN="$ICI/doubles" SUDO_USER=claude-fadi "$SCRIPT" "$@"; }
# Idem avec une variable de double (MOCK_…=valeur) ; fpa : administrateur (SUDO_USER vide).
fpe() { local vars=(); while [[ ${1:-} =~ ^[A-Z_]+= ]]; do vars+=("$1"); shift; done
  env "${vars[@]}" FADI_PREPROD_BASE="$B" FADI_PREPROD_TEST_BIN="$ICI/doubles" SUDO_USER=claude-fadi "$SCRIPT" "$@"; }
fpa() { env FADI_PREPROD_BASE="$B" FADI_PREPROD_TEST_BIN="$ICI/doubles" SUDO_USER= "$SCRIPT" "$@"; }

# attendu <0|nz> <libellé> [motif attendu dans la sortie] -- commande…
attendu() {
  local exp=$1 lib=$2 motif="" out rc; shift 2
  if [ "$1" != -- ]; then motif=$1; shift; fi; shift
  out=$("$@" 2>&1); rc=$?
  local bon=0
  if [ "$exp" = 0 ]; then [ $rc -eq 0 ] && bon=1; else [ $rc -ne 0 ] && bon=1; fi
  if [ $bon -eq 1 ] && [ -n "$motif" ] && ! grep -qF -- "$motif" <<< "$out"; then bon=0; fi
  if [ $bon -eq 1 ]; then ok=$((ok + 1)); echo "✓ $lib (code $rc)"
  else ko=$((ko + 1)); echo "✗ $lib (code $rc, attendu $exp${motif:+, motif « $motif »})"; tail -8 <<< "$out" | sed 's/^/    /'; fi
}
# Modifie compose.yml de la disposition (remplacement unique), commit et approbation du nouveau commit.
muter() {
  python3 -I - "$B/src/deploy/preprod/compose.yml" "$1" "$2" <<'PY' || return 1
import sys
p, a, b = sys.argv[1:4]
t = open(p).read()
if a not in t: sys.exit(f"motif absent : {a!r}")
open(p, "w").write(t.replace(a, b, 1))
PY
  git -C "$B/src" -c user.name=test -c user.email=test@invalid commit -qam mutation
  git -C "$B/src" rev-parse HEAD > "$B/approved-commit"
}

echo "== Garde d'isolation"
B=$(dispo garde)
attendu 0 "garde : configuration normale" "✓ garde" -- fp garde
: > "$B/edge.on"
attendu 0 "garde : configuration phase 4 (edge)" "fadi-preprod-edge" -- fp garde
rm -f "$B/edge.on"
NL=$'\n'
MUT=(
  "port public|\"127.0.0.1:3101:3001\"|\"3101:3001\""
  "conteneur privilégié|    restart: unless-stopped|    privileged: true${NL}    restart: unless-stopped"
  "volume de production|fadi-preprod-db:/var/lib|fadi-db:/var/lib"
  "montage de l'hôte|      - fadi-preprod-out:/out|      - /:/host${NL}      - fadi-preprod-out:/out"
  "réseau de l'hôte|    network_mode: \"service:app\"|    network_mode: host"
  "migration au démarrage|MIGRATE_ON_START: \${MIGRATE_ON_START:-0}|MIGRATE_ON_START: \"1\""
  "base de production|@db:5432/fadi${NL}      WEB_ORIGIN: \${PREPROD|@172.18.0.2:5432/fadi${NL}      WEB_ORIGIN: \${PREPROD"
  "réseau de production externe|    name: fadi-preprod-front|    name: app_default${NL}    external: true"
  "image non autorisée|image: postgis/postgis:16-3.4${NL}    restart|image: postgres:16${NL}    restart"
  "volume de production externe|  fadi-preprod-db:${NL}    name: fadi-preprod-db|  fadi-preprod-db:${NL}    name: app_fadi-db${NL}    external: true"
)
for m in "${MUT[@]}"; do
  IFS='|' read -r lib a b <<< "$m"
  B=$(dispo "mut-$RANDOM$RANDOM")
  if muter "$a" "$b"; then attendu nz "garde refuse : $lib" -- fp garde
  else ko=$((ko + 1)); echo "✗ mutation non appliquée : $lib"; fi
done

echo "== Propagation des échecs"
B=$(dispo codes)
attendu 0  "build réussi" -- fp build
attendu nz "build en échec → code non nul" "échec simulé (build)" -- fpe MOCK_FAIL=build build
attendu 0  "check réussi" -- fp check
attendu nz "check en échec → code non nul" "échec simulé (check)" -- fpe MOCK_FAIL=run-check check
attendu 0  "backup réussi" -- fp backup
attendu nz "backup en échec → code non nul" "échec simulé (backup)" -- fpe MOCK_FAIL=run-backup backup
attendu 0  "restore-check réussi" -- fp restore-check
attendu nz "restore-check en échec → code non nul" "échec simulé (restore)" -- fpe MOCK_FAIL=run-restore restore-check
attendu 0  "migrate réussi" "tables publiques" -- fp migrate
attendu nz "migrate sans « Schema applied » → code non nul" "Schema applied" -- fpe MOCK_LOGS= migrate
: > "$T/trace-ko"
attendu nz "migrate en échec : application rétablie en MIGRATE_ON_START=0" "laissée arrêtée" -- fpe MOCK_LOGS= MOCK_TRACE="$T/trace-ko" migrate
tail -1 "$T/trace-ko" | grep -q '^MIGRATE_ON_START=0 .* up --no-start --no-deps --force-recreate app$' \
  && { ok=$((ok + 1)); echo "✓ dernier appel Docker : recréation de app en MIGRATE_ON_START=0, sans démarrage"; } \
  || { ko=$((ko + 1)); echo "✗ rétablissement absent :"; tail -3 "$T/trace-ko" | sed 's/^/    /'; }
: > "$T/trace-ok"
attendu 0 "migrate réussi : retour à MIGRATE_ON_START=0" -- fpe MOCK_TRACE="$T/trace-ok" migrate
grep -q -- '--no-start' "$T/trace-ok" && { ko=$((ko + 1)); echo "✗ rétablissement déclenché sur un succès"; } \
  || { grep 'force-recreate app' "$T/trace-ok" | tail -1 | grep -q '^MIGRATE_ON_START=0 ' \
       && { ok=$((ok + 1)); echo "✓ migration réussie : application finale en MIGRATE_ON_START=0, aucun rétablissement"; } \
       || { ko=$((ko + 1)); echo "✗ application finale pas en MIGRATE_ON_START=0"; }; }
attendu nz "up en échec → code non nul" -- fpe MOCK_FAIL=up up
attendu 0  "e2e réussi (2 scénarios)" "2 réussi(s)" -- fp e2e accueils-design parcours-scenario
attendu nz "e2e avec un scénario en échec → code non nul" "échecs : parcours-scenario" -- fpe MOCK_FAIL=e2e-parcours-scenario e2e accueils-design parcours-scenario
attendu nz "e2e : scénario inconnu refusé" "scénario inconnu" -- fp e2e inexistant
attendu nz "e2e : nom de scénario invalide refusé" "scénario invalide" -- fp e2e '../x'

echo "== Contrôles HTTP (smoke)"
attendu 0  "smoke conforme" "✓ smoke" -- fp smoke
attendu nz "smoke : /health en 503" "/health : code 503" -- fpe MOCK_HEALTH_CODE=503 smoke
attendu nz "smoke : base indisponible" '"db":"ok"' -- fpe 'MOCK_HEALTH_BODY={"status":"degraded","db":"unavailable"}' smoke
attendu nz "smoke : application absente de /accueil" '<div id="root"' -- fpe 'MOCK_ACCUEIL_BODY=<html></html>' smoke
attendu nz "smoke : /projects sans authentification en 200" "code 200 au lieu de 401" -- fpe MOCK_PROJECTS_CODE=200 smoke
attendu nz "smoke : en-tête nosniff absent" "x-content-type-options" -- fpe MOCK_NO_NOSNIFF=1 smoke
attendu nz "smoke : en-tête X-Powered-By présent" "x-powered-by" -- fpe MOCK_POWERED=1 smoke
attendu nz "smoke : application injoignable" "code 000" -- fpe MOCK_DOWN=1 smoke

echo "== Extraction des rapports et droits des résultats"
mk_tar() {  # $1 = fichier, $2 = cas
  python3 -I - "$1" "$2" <<'PY'
import io, sys, tarfile
dest, cas = sys.argv[1:3]
with tarfile.open(dest, "w") as tf:
    def fichier(nom, data=b"x"):
        ti = tarfile.TarInfo(nom); ti.size = len(data); tf.addfile(ti, io.BytesIO(data))
    if cas == "bon": fichier("./parcours-scenario/rapport.txt", b"ok"); fichier("./a/b/capture.png", b"png")
    elif cas == "lien":
        ti = tarfile.TarInfo("./piege"); ti.type = tarfile.SYMTYPE; ti.linkname = "/etc"; tf.addfile(ti)
        fichier("./piege/passwd", b"pwned")
    elif cas == "dur":
        ti = tarfile.TarInfo("./dur"); ti.type = tarfile.LNKTYPE; ti.linkname = "/etc/passwd"; tf.addfile(ti)
    elif cas == "absolu": fichier("/tmp/fadi-preprod-test-absolu")
    elif cas == "remonte": fichier("./../../../evade")
    elif cas == "doublon": fichier("./x"); fichier("./x")
PY
}
for cas in lien dur absolu remonte doublon; do
  mk_tar "$T/$cas.tar" "$cas"
  attendu nz "extraction refusée : $cas" "extraction des rapports refusée" -- fpe "MOCK_TAR=$T/$cas.tar" e2e accueils-design
done
[ ! -e /tmp/fadi-preprod-test-absolu ] && [ ! -e "$T/evade" ] && [ ! -e "$B/evade" ] && [ ! -e "$B/out/evade" ] \
  && { ok=$((ok + 1)); echo "✓ aucune écriture hors du dossier de l'exécution"; } \
  || { ko=$((ko + 1)); echo "✗ écriture hors du dossier de l'exécution"; }
mk_tar "$T/bon.tar" bon
attendu 0 "extraction de rapports ordinaires" "rapports extraits : 2" -- fpe "MOCK_TAR=$T/bon.tar" e2e accueils-design
larges=$(find "$B/out" \( -type d -perm /077 \) -o \( -type f -perm /177 \) | head -5)
[ -z "$larges" ] && { ok=$((ok + 1)); echo "✓ résultats en 0700 / 0600 seulement"; } \
  || { ko=$((ko + 1)); echo "✗ droits trop larges :"; echo "$larges"; }
grep -nE '0?777|a\+[rwx]|o\+[rwx]|go\+' "$SCRIPT" "$PREPROD"/*.yml "$PREPROD"/recette.Dockerfile > "$T/larges" \
  && { ko=$((ko + 1)); echo "✗ droits globaux dans les fichiers :"; cat "$T/larges"; } \
  || { ok=$((ok + 1)); echo "✓ aucun 0777 ni droit global dans les fichiers de la préproduction"; }
RUNID=$(ls "$B/out" | grep -- '-e2e$' | tail -1)
attendu 0  "show : liste des fichiers d'une exécution" "rapport.txt" -- fp show "$RUNID"
attendu 0  "show : lecture d'un rapport" "ok" -- fp show "$RUNID" out/parcours-scenario/rapport.txt
attendu nz "show : remontée de dossier refusée" "fichier invalide" -- fp show "$RUNID" ../../env/.env.preprod
attendu nz "show : exécution invalide refusée" "exécution invalide" -- fp show ../env
ln -s "$B/env/.env.preprod" "$B/out/$RUNID/lien"
attendu nz "show : lien symbolique refusé" "chemin refusé" -- fp show "$RUNID" lien

echo "== Rôles et intégrité du code approuvé"
B=$(dispo roles)
attendu nz "opérateur : sync refusé" "réservée à l'administrateur" -- fp sync 0123456789abcdef0123456789abcdef01234567
attendu nz "opérateur : init-env refusé" "réservée à l'administrateur" -- fp init-env
attendu nz "opérateur : edge refusé" "réservée à l'administrateur" -- fp edge on
attendu nz "commande inconnue refusée" "commande inconnue" -- fp rm -rf
rm "$B/env/.env.preprod"
attendu 0 "administrateur : init-env crée les secrets" "0600" -- fpa init-env
[ "$(stat -c %a "$B/env/.env.preprod")" = 600 ] && ! grep -q 'test-a' "$B/env/.env.preprod" \
  && { ok=$((ok + 1)); echo "✓ secrets générés en 0600"; } || { ko=$((ko + 1)); echo "✗ secrets générés"; }
attendu nz "init-env n'écrase pas des secrets existants" "rien n'est écrasé" -- fpa init-env
B=$(dispo approuve)
echo 0123456789abcdef0123456789abcdef01234567 > "$B/approved-commit"
attendu nz "code différent du commit approuvé refusé" "n'est pas le commit approuvé" -- fp build
B=$(dispo sale)
: > "$B/src/deploy/preprod/.env"
attendu nz "src modifiée (fichier ajouté) refusée" "src modifiée" -- fp build
B=$(dispo env644)
chmod 0644 "$B/env/.env.preprod"
attendu nz "secrets lisibles par d'autres refusés" "0600" -- fp up
B=$(dispo envlien)
mv "$B/env/.env.preprod" "$B/env/vrai"; ln -s vrai "$B/env/.env.preprod"
attendu nz "secrets en lien symbolique refusés" "lien symbolique" -- fp up
B=$(dispo srcg)
chmod g+w "$B/src"
attendu nz "src modifiable par le groupe refusée" "modifiable par le groupe" -- fp build
B=$(dispo envmigrate)
echo 'MIGRATE_ON_START=1' >> "$B/env/.env.preprod"; : > "$T/trace-env"
attendu 0 "MIGRATE_ON_START=1 dans les secrets : sans effet" -- fpe MOCK_TRACE="$T/trace-env" up
grep 'up -d db app' "$T/trace-env" | grep -q '^MIGRATE_ON_START=0 ' \
  && { ok=$((ok + 1)); echo "✓ up impose MIGRATE_ON_START=0 malgré le fichier d'environnement"; } \
  || { ko=$((ko + 1)); echo "✗ MIGRATE_ON_START non imposé : $(grep 'up -d' "$T/trace-env")"; }
B=$(dispo illisible)
chmod 0600 "$B/src/deploy/preprod/compose.edge.yml"
attendu nz "code illisible par l'image (EACCES) refusé" "code illisible par l'image" -- fp build
B=$(dispo sansapprob)
rm "$B/approved-commit"
attendu nz "sans commit approuvé : refus" "approved-commit absent" -- fp build

echo "== sync (administrateur) : code approuvé lisible par l'image"
B=$(dispo source)
git clone -q --bare "$B/src" "$T/depot.git"
SHA=$(git -C "$B/src" rev-parse HEAD)
B=$T/sync; mkdir -m 0700 "$B" "$B/env"
printf 'PREPROD_POSTGRES_PASSWORD=test-a\nPREPROD_ARCHIVE_SIGNING_KEY=test-b\n' > "$B/env/.env.preprod"; chmod 0600 "$B/env/.env.preprod"
attendu 0 "sync d'un commit (dépôt local de test)" "commit approuvé et figé" -- env FADI_PREPROD_REPO="$T/depot.git" FADI_PREPROD_BASE="$B" FADI_PREPROD_TEST_BIN="$ICI/doubles" SUDO_USER= "$SCRIPT" sync "$SHA"
[ "$(stat -c %a "$B/src/deploy/preprod/compose.yml")" = 644 ] && [ "$(stat -c %a "$B/src/deploy/preprod/fadi-preprod")" = 755 ] \
  && [ "$(stat -c %a "$B")" = 700 ] && [ "$(cat "$B/approved-commit")" = "$SHA" ] \
  && { ok=$((ok + 1)); echo "✓ après sync : code en 0644 / 0755, BASE en 0700, commit approuvé enregistré"; } \
  || { ko=$((ko + 1)); echo "✗ droits après sync : $(stat -c '%a %n' "$B/src/deploy/preprod/compose.yml" "$B")"; }
attendu 0 "build sur le code synchronisé" -- fp build
attendu nz "sync d'un commit inexistant refusé" "introuvable" -- env FADI_PREPROD_REPO="$T/depot.git" FADI_PREPROD_BASE="$B" FADI_PREPROD_TEST_BIN="$ICI/doubles" SUDO_USER= "$SCRIPT" sync 0123456789abcdef0123456789abcdef01234567

echo "== Liste e2e identique à la CI"
python3 -I - "$REPO/.github/workflows/ci.yml" "$SCRIPT" <<'PY' && { ok=$((ok + 1)); echo "✓ E2E_DEFAUT = scénarios de la CI, même ordre"; } || { ko=$((ko + 1)); echo "✗ E2E_DEFAUT ≠ CI"; }
import re, sys
ci = open(sys.argv[1]).read(); order = []
for m in re.finditer(r'^\s+(?:[A-Z_]+=\S+ )*node apps/web/e2e/([a-z0-9-]+)\.mjs', ci, re.M):
    if m.group(1) not in order: order.append(m.group(1))
lst = re.search(r'E2E_DEFAUT="([^"]+)"', open(sys.argv[2]).read()).group(1).split()
print(f"   CI {len(order)}, préproduction {len(lst)}")
sys.exit(0 if order == lst else 1)
PY

echo
echo "Résultat : $ok réussi(s), $ko échec(s)"
[ "$ko" -eq 0 ]
