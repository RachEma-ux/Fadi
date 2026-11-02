#!/bin/bash
# Tests de fadi-preprod sans root ni démon Docker : dispositions jetables, doubles de docker / curl (doubles/), rôles
# simulés par SUDO_USER. Couvre la garde d'isolation (cas normaux + 10 configurations dangereuses), la propagation des
# échecs (build, check, smoke, backup, restore-check, migrate, e2e), la séparation D-7 (service migrate, app en fadi_app), l'extraction des rapports (liens, chemins),
# les droits des résultats, la séparation administrateur / opérateur et l'intégrité du code approuvé ; puis lance
# run-auto.sh (déploiement automatique, fadi-preprod-auto).
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
  printf 'PREPROD_POSTGRES_PASSWORD=test-a\nPREPROD_ARCHIVE_SIGNING_KEY=test-b\nPREPROD_FADI_APP_DB_PASSWORD=test-c\n' > "$B/env/.env.preprod"
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
  "migration au démarrage|MIGRATE_ON_START: \"0\"|MIGRATE_ON_START: \"1\""
  "app en superutilisateur (D-7)|postgresql://fadi_app:|postgresql://fadi:"
  "identifiant de migration donné à app|      APP_PUBLIC_URL:|      DATABASE_MIGRATION_URL: postgresql://fadi:x@db:5432/fadi${NL}      APP_PUBLIC_URL:"
  "mode migration dans app|      APP_PUBLIC_URL:|      MIGRATE_ONLY: \"1\"${NL}      APP_PUBLIC_URL:"
  "app sans attendre la migration|condition: service_completed_successfully|condition: service_started"
  "migrate relancé en boucle|    restart: \"no\"|    restart: unless-stopped"
  "migrate avec un port|    restart: \"no\"|    restart: \"no\"${NL}    ports:${NL}      - \"127.0.0.1:3102:3001\""
  "migrate sur le réseau front|      - internal${NL}    mem_limit: 1g|      - internal${NL}      - front${NL}    mem_limit: 1g"
  "migrate sans MIGRATE_ONLY|      MIGRATE_ONLY: \"1\"${NL}      NODE_ENV|      NODE_ENV"
  "base de production|@db:5432/fadi${NL}      WEB_ORIGIN: \${PREPROD|@172.18.0.2:5432/fadi${NL}      WEB_ORIGIN: \${PREPROD"
  "réseau de production externe|    name: fadi-preprod-front|    name: app_default${NL}    external: true"
  "image non autorisée|image: postgis/postgis:16-3.4${NL}    restart|image: postgres:16${NL}    restart"
  "SMTP_PASS donné à la recette (UM-28)|      ARCHIVE_SIGNING_KEY: \${PREPROD_ARCHIVE_SIGNING_KEY}${NL}|      ARCHIVE_SIGNING_KEY: \${PREPROD_ARCHIVE_SIGNING_KEY}${NL}      SMTP_PASS: \${PREPROD_SMTP_PASS:-}${NL}"
  "recette sur une image de base étrangère|APP_IMAGE: fadi-preprod-app:|APP_IMAGE: node:22-"
  "contexte de build supplémentaire|        APP_IMAGE: fadi-preprod-app:|        APP_IMAGE: fadi-preprod-app:\${FADI_COMMIT}${NL}      additional_contexts:${NL}        hote: /etc${NL}#"
  "volume de production externe|  fadi-preprod-db:${NL}    name: fadi-preprod-db|  fadi-preprod-db:${NL}    name: app_fadi-db${NL}    external: true"
)
# D-7 : refus attendus de la garde elle-même (motif exact), pas d'une configuration invalide.
declare -A MOTIF=(
  ["migration au démarrage"]="MIGRATE_ON_START=1 (attendu 0)"
  ["app en superutilisateur (D-7)"]="DATABASE_URL doit utiliser le rôle fadi_app"
  ["identifiant de migration donné à app"]="DATABASE_MIGRATION_URL réservé au service migrate"
  ["mode migration dans app"]="MIGRATE_ONLY réservé au service migrate"
  ["app sans attendre la migration"]="doit dépendre de migrate"
  ["migrate relancé en boucle"]="service migrate : restart"
  ["migrate avec un port"]="service migrate : aucun port publié"
  ["migrate sur le réseau front"]="attendu internal seul"
  ["migrate sans MIGRATE_ONLY"]="MIGRATE_ONLY=1 exigé"
  ["SMTP_PASS donné à la recette (UM-28)"]="SMTP_PASS réservé au service app"
  ["recette sur une image de base étrangère"]="APP_IMAGE"
  ["contexte de build supplémentaire"]="additional_contexts interdit"
)
for m in "${MUT[@]}"; do
  # Découpage sans `read` : les motifs contiennent des sauts de ligne (${NL}), que `read` tronquerait.
  lib=${m%%|*}; reste=${m#*|}; a=${reste%%|*}; b=${reste#*|}
  B=$(dispo "mut-$RANDOM$RANDOM")
  if muter "$a" "$b"; then attendu nz "garde refuse : $lib" "${MOTIF[$lib]:-}" -- fp garde
  else ko=$((ko + 1)); echo "✗ mutation non appliquée : $lib"; fi
done

echo "== Propagation des échecs"
B=$(dispo codes)
attendu 0  "build réussi" -- fp build
SHA_CODES=$(git -C "$B/src" rev-parse HEAD); : > "$T/trace-build"
attendu 0  "build avec version de l'image" -- fpe MOCK_TRACE="$T/trace-build" build
grep ' build app$' "$T/trace-build" | grep -Eq "FADI_BUILD_COMMIT=$SHA_CODES FADI_BUILD_DATE=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z " \
  && { ok=$((ok + 1)); echo "✓ build : commit complet et date UTC fournis à l'image (GET /version)"; } \
  || { ko=$((ko + 1)); echo "✗ arguments de version absents : $(grep ' build ' "$T/trace-build")"; }
# La recette reprend les builds de l'image applicative : construite après elle, jamais en parallèle.
grep -n ' build ' "$T/trace-build" | sed -E 's/^([0-9]+):.* build (.*)$/\1 \2/' | tr '\n' ';' | grep -Eq '^[0-9]+ app;[0-9]+ recette;$' \
  && { ok=$((ok + 1)); echo "✓ build : app d'abord, puis la recette (builds copiés de l'image applicative)"; } \
  || { ko=$((ko + 1)); echo "✗ ordre des constructions : $(grep ' build ' "$T/trace-build")"; }
FADI_SRC=$B/src FADI_COMMIT=0123456789ab PREPROD_POSTGRES_PASSWORD=x PREPROD_ARCHIVE_SIGNING_KEY=x PREPROD_FADI_APP_DB_PASSWORD=x \
  docker compose -f "$B/src/deploy/preprod/compose.yml" --profile recette config --format json 2>/dev/null \
  | python3 -I -c 'import json, sys; b = json.load(sys.stdin)["services"]["recette"]["build"]; sys.exit(0 if b["args"] == {"APP_IMAGE": "fadi-preprod-app:0123456789ab"} and not b.get("additional_contexts") else 1)' \
  && { ok=$((ok + 1)); echo "✓ compose : la recette part de l'image applicative du même commit (APP_IMAGE), sans additional_contexts"; } \
  || { ko=$((ko + 1)); echo "✗ compose : APP_IMAGE de la recette absent ou faux"; }
FADI_SRC=$B/src FADI_COMMIT=x FADI_BUILD_COMMIT=$SHA_CODES FADI_BUILD_DATE=2026-10-20T00:00:00Z PREPROD_POSTGRES_PASSWORD=x PREPROD_ARCHIVE_SIGNING_KEY=x PREPROD_FADI_APP_DB_PASSWORD=x \
  docker compose -f "$B/src/deploy/preprod/compose.yml" config --format json 2>/dev/null \
  | python3 -I -c 'import json, sys; a = json.load(sys.stdin)["services"]["app"]["build"]["args"]; sys.exit(0 if a == {"FADI_COMMIT": sys.argv[1], "FADI_BUILD_DATE": "2026-10-20T00:00:00Z"} else 1)' "$SHA_CODES" \
  && { ok=$((ok + 1)); echo "✓ compose : arguments FADI_COMMIT / FADI_BUILD_DATE transmis au Dockerfile"; } \
  || { ko=$((ko + 1)); echo "✗ compose : arguments de build de l'image absents ou faux"; }
attendu nz "build en échec → code non nul" "échec simulé (build)" -- fpe MOCK_FAIL=build build

echo "== Nettoyage des images"
C12=$(git -C "$B/src" rev-parse HEAD | cut -c1-12)
PREC=1111111111111111111111111111111111111111
: > "$T/trace-net"
attendu 0 "nettoyer : anciens commits supprimés" "nettoyage : 4 image(s) supprimée(s)" -- \
  fpe "MOCK_IMAGES=$C12 111111111111 222222222222 333333333333 latest" MOCK_TRACE="$T/trace-net" nettoyer $PREC
python3 -I - "$T/trace-net" "$C12" <<'PY' && { ok=$((ok + 1)); echo "✓ nettoyer : commit approuvé et retour arrière gardés, dépôts fadi-preprod seuls, étiquette non-commit ignorée"; } || { ko=$((ko + 1)); echo "✗ nettoyer : suppressions inattendues"; cat "$T/trace-net"; }
import sys
rm = sorted(l.split()[-1] for l in open(sys.argv[1]) if " image rm " in l)
att = sorted(f"{d}:{t}" for d in ("fadi-preprod-app", "fadi-preprod-recette") for t in ("222222222222", "333333333333"))
sys.exit(0 if rm == att else 1)
PY
attendu nz "nettoyer : sha à garder invalide refusé" "sha complet" -- fp nettoyer 1234
attendu 0 "nettoyer : image en usage conservée sans échec" "conservée (en usage ?)" -- fpe "MOCK_IMAGES=222222222222" MOCK_FAIL=image-rm nettoyer
attendu 0  "check réussi" -- fp check
attendu nz "check en échec → code non nul, journal nommé" "journal : check.log" -- fpe MOCK_FAIL=run-check check
attendu 0  "backup réussi" -- fp backup
attendu nz "backup en échec → code non nul" "échec simulé (backup)" -- fpe MOCK_FAIL=run-backup backup
attendu 0  "restore-check réussi" -- fp restore-check
attendu nz "restore-check en échec → code non nul" "échec simulé (restore)" -- fpe MOCK_FAIL=run-restore restore-check
attendu 0  "migrate réussi (service migrate, puis app en fadi_app)" "fadi_app peut créer : false" -- fp migrate
attendu nz "migrate sans « Migration terminée » → code non nul" "Migration terminée" -- fpe 'MOCK_MIGRATE_LOG=Schema applied (init.sql).' migrate
attendu nz "migrate sans « Schema applied » → code non nul" "Schema applied" -- fpe 'MOCK_MIGRATE_LOG=Migration terminée (MIGRATE_ONLY) : arrêt sans écouter.' migrate
attendu nz "migration réussie mais fadi_app peut créer dans public → code non nul" "fadi_app peut créer dans public" -- fpe MOCK_FADI_APP_CREATE=true migrate
: > "$T/trace-ko"
attendu nz "service migrate en échec : supprimé, application non redémarrée" "application non redémarrée" -- fpe MOCK_FAIL=run-migrate MOCK_TRACE="$T/trace-ko" migrate
tail -1 "$T/trace-ko" | grep -q ' rm -f -s migrate$' && ! grep -q 'force-recreate app' "$T/trace-ko" \
  && { ok=$((ok + 1)); echo "✓ échec de la migration : dernier appel Docker = suppression du service migrate, app jamais recréée"; } \
  || { ko=$((ko + 1)); echo "✗ rétablissement absent :"; tail -3 "$T/trace-ko" | sed 's/^/    /'; }
: > "$T/trace-ok"
attendu 0 "migrate réussi : ordre migrate puis app" -- fpe MOCK_TRACE="$T/trace-ok" migrate
python3 -I - "$T/trace-ok" <<'PY' && { ok=$((ok + 1)); echo "✓ migration réussie : run migrate avant app, app sans dépendances, aucun rétablissement"; } || { ko=$((ko + 1)); echo "✗ ordre migrate / app"; cat "$T/trace-ok" | sed 's/^/    /'; }
import sys
l = open(sys.argv[1]).read().splitlines()
i = next(i for i, x in enumerate(l) if x.endswith("run --rm --no-deps -T migrate"))
j = next(j for j, x in enumerate(l) if x.endswith("up -d --no-deps --force-recreate app"))
sys.exit(0 if i < j and not any(x.endswith("rm -f -s migrate") for x in l) else 1)
PY
attendu nz "up en échec → code non nul" -- fpe MOCK_FAIL=up up
attendu 0  "e2e réussi (2 scénarios)" "2 réussi(s)" -- fp e2e accueils-design studio-domaines
attendu nz "e2e avec un scénario en échec → code non nul" "échecs : studio-domaines" -- fpe MOCK_FAIL=e2e-studio-domaines e2e accueils-design studio-domaines
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
printf '{"commit":"%s","resultat":"succes"}\n' "$(git -C "$B/src" rev-parse HEAD)" > "$B/etat.json"
attendu 0  "status : état du déploiement automatique affiché" '"resultat":"succes"' -- fp status
attendu 0  "show : état du déploiement automatique affiché" '"resultat":"succes"' -- fp show

echo "== Rôles et intégrité du code approuvé"
B=$(dispo roles)
attendu nz "opérateur : sync refusé" "réservée à l'administrateur" -- fp sync 0123456789abcdef0123456789abcdef01234567
attendu nz "opérateur : init-env refusé" "réservée à l'administrateur" -- fp init-env
attendu nz "opérateur : edge refusé" "réservée à l'administrateur" -- fp edge on
attendu nz "commande inconnue refusée" "commande inconnue" -- fp rm -rf
rm "$B/env/.env.preprod"
attendu 0 "administrateur : init-env crée les secrets" "0600" -- fpa init-env
[ "$(stat -c %a "$B/env/.env.preprod")" = 600 ] && ! grep -q 'test-a' "$B/env/.env.preprod" \
  && grep -Eq '^PREPROD_FADI_APP_DB_PASSWORD=[0-9a-f]{64}$' "$B/env/.env.preprod" \
  && grep -Eq '^PREPROD_FADI_ENCRYPTION_KEY=[A-Za-z0-9+/]{43}=$' "$B/env/.env.preprod" \
  && { ok=$((ok + 1)); echo "✓ secrets générés en 0600, dont fadi_app et la clé de chiffrement"; } || { ko=$((ko + 1)); echo "✗ secrets générés"; }
empreinte=$(sha256sum "$B/env/.env.preprod")
attendu 0 "init-env sur des secrets complets : rien n'est écrasé" "rien n'est écrasé" -- fpa init-env
[ "$(sha256sum "$B/env/.env.preprod")" = "$empreinte" ] \
  && { ok=$((ok + 1)); echo "✓ secrets complets inchangés octet pour octet"; } || { ko=$((ko + 1)); echo "✗ secrets modifiés"; }
B=$(dispo ancien)
printf 'PREPROD_POSTGRES_PASSWORD=ancien-a\nPREPROD_ARCHIVE_SIGNING_KEY=ancien-b\nPREPROD_WEB_ORIGIN=https://preprod.example.invalid' > "$B/env/.env.preprod"
cp "$B/env/.env.preprod" "$T/ancien.env"
sortie=$(fpa init-env 2>&1); rc=$?
python3 -I - "$B/env/.env.preprod" "$T/ancien.env" "$rc" "$sortie" <<'PY' && { ok=$((ok + 1)); echo "✓ init-env sur d'anciens secrets : clés manquantes ajoutées, existantes intactes, valeurs jamais affichées"; } || { ko=$((ko + 1)); echo "✗ init-env sur d'anciens secrets :"; echo "$sortie" | sed 's/^/    /'; }
import os, re, stat, sys
nouveau, ancien, rc, sortie = open(sys.argv[1]).read(), open(sys.argv[2]).read(), sys.argv[3], sys.argv[4]
lignes = nouveau.splitlines()
ajout = dict(l.split("=", 1) for l in lignes[3:])
ok = (rc == "0" and lignes[:3] == ancien.splitlines() and len(lignes) == 5
      and re.fullmatch(r"[0-9a-f]{64}", ajout.get("PREPROD_FADI_APP_DB_PASSWORD", ""))
      and re.fullmatch(r"[A-Za-z0-9+/]{43}=", ajout.get("PREPROD_FADI_ENCRYPTION_KEY", ""))
      and stat.S_IMODE(os.stat(sys.argv[1]).st_mode) == 0o600
      and not any(v in sortie for v in list(ajout.values()) + ["ancien-a", "ancien-b"])
      and "PREPROD_FADI_APP_DB_PASSWORD" in sortie)
sys.exit(0 if ok else 1)
PY
B=$(dispo vides)
printf 'PREPROD_POSTGRES_PASSWORD=ancien-a\nPREPROD_FADI_APP_DB_PASSWORD=\nPREPROD_FADI_ENCRYPTION_KEY=\n' > "$B/env/.env.preprod"
attendu 0 "init-env sur des clés vides (gabarit env.example) : régénérées" "PREPROD_FADI_APP_DB_PASSWORD" -- fpa init-env
python3 -I - "$B/env/.env.preprod" <<'PY' && { ok=$((ok + 1)); echo "✓ clés vides remplacées une seule fois, autres lignes intactes"; } || { ko=$((ko + 1)); echo "✗ clés vides : $(cut -d= -f1 "$B/env/.env.preprod" | tr '\n' ' ')"; }
import re, sys
l = open(sys.argv[1]).read().splitlines(); d = dict(x.split("=", 1) for x in l)
sys.exit(0 if (len(l) == 3 and l[0] == "PREPROD_POSTGRES_PASSWORD=ancien-a"
               and re.fullmatch(r"[0-9a-f]{64}", d["PREPROD_FADI_APP_DB_PASSWORD"])
               and re.fullmatch(r"[A-Za-z0-9+/]{43}=", d["PREPROD_FADI_ENCRYPTION_KEY"])) else 1)
PY
B=$(dispo initenv644)
chmod 0644 "$B/env/.env.preprod"; cp "$B/env/.env.preprod" "$T/644.env"
attendu nz "init-env refuse des secrets lisibles par d'autres, sans rien modifier" "0600" -- fpa init-env
cmp -s "$B/env/.env.preprod" "$T/644.env" && [ ! -e "$B/env/.env.preprod.tmp" ] \
  && { ok=$((ok + 1)); echo "✓ secrets 0644 non modifiés, aucun fichier temporaire laissé"; } || { ko=$((ko + 1)); echo "✗ secrets 0644 modifiés"; }
B=$(dispo sansfadiapp)
sed -i '/^PREPROD_FADI_APP_DB_PASSWORD=/d' "$B/env/.env.preprod"
attendu nz "secrets sans PREPROD_FADI_APP_DB_PASSWORD : refus, init-env indiqué" "fadi-preprod init-env" -- fp up
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
attendu 0 "MIGRATE_ON_START=1 dans les secrets : sans effet (valeur fixe de compose.yml, contrôlée par la garde)" -- fpe MOCK_TRACE="$T/trace-env" up
grep -q 'up -d --no-deps app$' "$T/trace-env" && ! grep -q ' migrate$' "$T/trace-env" \
  && { ok=$((ok + 1)); echo "✓ up démarre l'application sans dépendances et ne lance jamais la migration"; } \
  || { ko=$((ko + 1)); echo "✗ up : $(grep -E 'up -d|migrate' "$T/trace-env")"; }
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
printf 'PREPROD_POSTGRES_PASSWORD=test-a\nPREPROD_ARCHIVE_SIGNING_KEY=test-b\nPREPROD_FADI_APP_DB_PASSWORD=test-c\n' > "$B/env/.env.preprod"; chmod 0600 "$B/env/.env.preprod"
attendu 0 "sync d'un commit (dépôt local de test)" "commit approuvé et figé" -- env FADI_PREPROD_REPO="$T/depot.git" FADI_PREPROD_BASE="$B" FADI_PREPROD_TEST_BIN="$ICI/doubles" SUDO_USER= "$SCRIPT" sync "$SHA"
[ "$(stat -c %a "$B/src/deploy/preprod/compose.yml")" = 644 ] && [ "$(stat -c %a "$B/src/deploy/preprod/fadi-preprod")" = 755 ] \
  && [ "$(stat -c %a "$B")" = 700 ] && [ "$(cat "$B/approved-commit")" = "$SHA" ] \
  && { ok=$((ok + 1)); echo "✓ après sync : code en 0644 / 0755, BASE en 0700, commit approuvé enregistré"; } \
  || { ko=$((ko + 1)); echo "✗ droits après sync : $(stat -c '%a %n' "$B/src/deploy/preprod/compose.yml" "$B")"; }
attendu 0 "build sur le code synchronisé" -- fp build
attendu nz "sync d'un commit inexistant refusé" "introuvable" -- env FADI_PREPROD_REPO="$T/depot.git" FADI_PREPROD_BASE="$B" FADI_PREPROD_TEST_BIN="$ICI/doubles" SUDO_USER= "$SCRIPT" sync 0123456789abcdef0123456789abcdef01234567

echo "== Courriel de la préproduction (UM-28)"
# compose.yml résolu : sans PREPROD_MAIL_TRANSPORT, aucun envoi et quota prudent ; avec les variables, tout est transmis
# à app ; SMTP_PASS jamais à la recette ni à la migration.
courriel() {  # $1 = libellé, $2 = attendu (python), reste = variables PREPROD_* supplémentaires
  local lib=$1 att=$2; shift 2
  env FADI_SRC="$REPO" FADI_COMMIT=x PREPROD_POSTGRES_PASSWORD=x PREPROD_ARCHIVE_SIGNING_KEY=x PREPROD_FADI_APP_DB_PASSWORD=x "$@" \
    docker compose -f "$REPO/deploy/preprod/compose.yml" --profile recette config --format json 2>/dev/null \
    | python3 -I -c "import json, sys; s = json.load(sys.stdin)['services']; a = s['app']['environment']; r = s['recette']['environment']; m = s['migrate']['environment']; sys.exit(0 if ($att) and 'SMTP_PASS' not in r and 'SMTP_PASS' not in m else 1)" \
    && { ok=$((ok + 1)); echo "✓ $lib"; } || { ko=$((ko + 1)); echo "✗ $lib"; }
}
courriel "sans PREPROD_MAIL_TRANSPORT : aucun envoi, quota 50 / 24 h, 5 / h / destinataire" \
  "a['MAIL_TRANSPORT'] == '' and a['MAIL_DAILY_LIMIT'] == '50' and a['MAIL_RECIPIENT_HOURLY_LIMIT'] == '5' and a['SMTP_SECURE'] == 'true' and a['SMTP_PASS'] == ''"
courriel "avec les variables PREPROD_* : SMTP transmis à app seul, SMTP_PASS jamais à la recette" \
  "a['MAIL_TRANSPORT'] == 'smtp' and a['SMTP_HOST'] == 'mail.infomaniak.com' and a['SMTP_PORT'] == '465' and a['SMTP_USER'] == 'noreply@fadimmo.com' and a['SMTP_PASS'] == 'secret-test' and a['MAIL_FROM'] == 'Fadi <noreply@fadimmo.com>' and a['MAIL_DAILY_LIMIT'] == '20'" \
  PREPROD_MAIL_TRANSPORT=smtp PREPROD_SMTP_USER=noreply@fadimmo.com PREPROD_SMTP_PASS=secret-test "PREPROD_MAIL_FROM=Fadi <noreply@fadimmo.com>" PREPROD_MAIL_DAILY_LIMIT=20

echo "== Liste e2e identique à la CI"
python3 -I - "$REPO/.github/workflows/ci.yml" "$SCRIPT" <<'PY' && { ok=$((ok + 1)); echo "✓ E2E_DEFAUT = scénarios de la CI, même ordre, sans comptes-* ni geodata (base jetable) ni lecture de courriel"; } || { ko=$((ko + 1)); echo "✗ E2E_DEFAUT ≠ CI"; }
import re, sys
ci = open(sys.argv[1]).read(); order = []
for m in re.finditer(r'^\s+(?:[A-Z_]+=\S+ )*node apps/web/e2e/([a-z0-9-]+)\.mjs', ci, re.M):
    if m.group(1) not in order: order.append(m.group(1))
hors = {"comptes-api", "comptes-securite", "comptes-admin", "geodata", "studio-preuves-e"}  # base jetable exigée (studio-preuves-e : écritures SQL directes et seconde API) : jamais en préproduction
assert hors <= set(order), "scénarios exclus absents de la CI"
# Recettes qui lisent les courriels envoyés : impossibles en préproduction (aucun envoi aux domaines réservés, pas de Mailpit).
racine = sys.argv[1].rsplit("/.github/", 1)[0]
courriel = lambda s: re.search(r"lib-invitations|MAILPIT|API_LOG", open(f"{racine}/apps/web/e2e/{s}.mjs").read())
order = [s for s in order if s not in hors and not courriel(s)]
lst = re.search(r'E2E_DEFAUT="([^"]+)"', open(sys.argv[2]).read()).group(1).split()
print(f"   CI {len(order)}, préproduction {len(lst)}")
sys.exit(0 if order == lst else 1)
PY

echo
echo "Résultat : $ok réussi(s), $ko échec(s)"
echo
echo "== fadi-preprod-auto (tests/run-auto.sh)"
bash "$ICI/run-auto.sh"; auto=$?
[ "$ko" -eq 0 ] && [ "$auto" -eq 0 ]
