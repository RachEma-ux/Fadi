#!/bin/bash
# Tests de fadi-preprod-auto sans root, sans réseau ni démon : dispositions jetables, doubles de curl (API GitHub,
# /version, Healthchecks) et de fadi-preprod (doubles-auto/). Couvre le déploiement nominal, l'absence de nouveauté,
# les refus (CI rouge, en cours, absente ou imitée par une autre application, commit hors de main), l'API injoignable
# ou limitée, le budget d'appels, les échecs de construction et de démarrage avec retour à l'image précédente, l'échec
# du retour, le verrou, l'état JSON, la notification (adresse lue dans un fichier 0600, jamais en argument) et les
# unités systemd.
# Usage : deploy/preprod/tests/run-auto.sh   (requiert bash, python3, flock)
set -uo pipefail
umask 077
ICI=$(cd "$(dirname "$0")" && pwd)
PREPROD=$(dirname "$ICI")
SCRIPT=$PREPROD/fadi-preprod-auto
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
ok=0; ko=0
S=$(printf 'a%.0s' {1..40})   # nouveau commit de main
P=$(printf 'b%.0s' {1..40})   # commit en ligne
HC=https://hc.example.invalid/ping/0000-test

if [ "$(id -u)" -eq 0 ]; then echo "run-auto.sh : à lancer hors root (sous root, le script ignore les doubles)" >&2; exit 2; fi

reussi() { ok=$((ok + 1)); echo "✓ $1"; }
rate() { ko=$((ko + 1)); echo "✗ $1"; [ -n "${2:-}" ] && sed 's/^/    /' <<< "$2"; }
verifie() { local lib=$1; shift; if "$@"; then reussi "$lib"; else rate "$lib" "$(tail -15 "$C/sortie" 2>/dev/null)"; fi; }

# Contrôles GitHub : « nom:statut:conclusion[:application] » …
controles() {
  python3 -I - "$@" <<'PY'
import json, sys
runs = []
for i, a in enumerate(sys.argv[1:]):
    p = a.split(":") + [""] * 4
    runs.append({"id": 100 + i, "name": p[0], "status": p[1], "conclusion": p[2] or None, "app": {"slug": p[3] or "github-actions"}})
print(json.dumps({"total_count": len(runs), "check_runs": runs}))
PY
}
VERTS=(validate:completed:success e2e:completed:success image:completed:success "e2e (parcours):completed:success")

# Nouvelle disposition $C : base (0700), conf (adresse Healthchecks 0600), mock ; contrôles verts par défaut.
cas() {
  C=$T/$1; mkdir -m 0700 "$C" "$C/base" "$C/conf" "$C/mock"
  printf '%s\n' "$HC" > "$C/conf/healthchecks-url"; chmod 0600 "$C/conf/healthchecks-url"
  controles "${VERTS[@]}" > "$C/checks.json"
  : > "$C/mock/fp.trace"; : > "$C/mock/curl.trace"; : > "$C/mock/notifications"
}
en_ligne() {  # commit $1 en ligne : état et double
  python3 -I -c 'import json, sys; json.dump({"en_ligne": sys.argv[2], "dernier_essai": sys.argv[2], "resultat": "succes"}, open(sys.argv[1], "w"))' "$C/base/etat.json" "$1"
  chmod 0600 "$C/base/etat.json"; echo "$1" > "$C/mock/en-ligne"; echo "$1" > "$C/mock/src"
}
# Lance le script sur $C ; variables MOCK_… en tête ; code dans $RC, sortie dans $C/sortie.
auto() {
  local vars=(); while [[ ${1:-} =~ ^[A-Z_]+= ]]; do vars+=("$1"); shift; done
  env -i HOME="$C" PATH=/usr/bin:/bin FADI_PREPROD_BASE="$C/base" FADI_PREPROD_AUTO_CONF="$C/conf" \
    FADI_PREPROD_TEST_BIN="$ICI/doubles-auto" MOCK_DIR="$C/mock" MOCK_MAIN_SHA="$S" MOCK_CHECKS="$C/checks.json" \
    SUDO_USER=claude-fadi "${vars[@]}" "$SCRIPT" "$@" > "$C/sortie" 2>&1
  RC=$?
}
etat() { python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))' "$C/base/etat.json" "$1"; }
appels_api() { grep -c '^https://api.github.com/' "$C/mock/curl.trace"; }
trace() { sed 's/ (SUDO_USER=.*)$//' "$C/mock/fp.trace" | paste -sd ';' -; }
pas_de_deploiement() { [ ! -s "$C/mock/fp.trace" ]; }

echo "== Déploiement nominal"
cas nominal; en_ligne "$P"; auto
verifie "nouveau commit à CI verte : déployé (code 0)" test "$RC" = 0
verifie "séquence sync, build, migrate, up, smoke, e2e court" \
  test "$(trace)" = "sync $S;build;migrate;up;smoke;e2e sandbox-module parcours-scenario"
verifie "fadi-preprod appelé en administrateur (sans SUDO_USER)" bash -c "! grep -v 'SUDO_USER=absent' '$C/mock/fp.trace'"
verifie "état : succès, commit en ligne et dernier essai = $S" \
  test "$(etat resultat):$(etat en_ligne):$(etat dernier_essai):$(etat etape)" = "succes:$S:$S:fin"
verifie "état JSON en 0600" test "$(stat -c %a "$C/base/etat.json")" = 600
verifie "3 appels à l'API GitHub (main, contrôles, comparaison)" test "$(appels_api)" = 3
verifie "/version contrôlé après le démarrage" grep -q "GET /version → commit $S (attendu $S)" "$C/sortie"
verifie "notification de succès (ping, pas /fail) avec le commit" grep -qx "$HC | fadi-preprod-auto : $S déployé.*" "$C/mock/notifications"
J=$(ls -d "$C"/base/out/*-auto 2>/dev/null | head -1)
verifie "journal du déploiement en 0700 / 0600, nommé pour fadi-preprod show" \
  bash -c "[[ \$(basename '$J') =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+-auto\$ ]] && [ \$(stat -c %a '$J') = 700 ] && [ \$(stat -c %a '$J/journal.log') = 600 ] && grep -q 'fadi-preprod e2e' '$J/journal.log'"
verifie "adresse de notification jamais en argument de curl" bash -c "! grep -q 'hc.example' '$C/mock/curl.args'"

echo "== Passage suivant sans nouveauté"
: > "$C/mock/fp.trace"; : > "$C/mock/curl.trace"; : > "$C/mock/notifications"; auto
verifie "même commit : rien à faire (code 0)" test "$RC" = 0
verifie "un seul appel à l'API, aucun appel à fadi-preprod, aucune notification" \
  bash -c "[ $(appels_api) = 1 ] && [ ! -s '$C/mock/fp.trace' ] && [ ! -s '$C/mock/notifications' ]"
auto relancer
: > "$C/mock/fp.trace"; auto
verifie "relancer : le même commit est de nouveau déployé" bash -c "[ $RC = 0 ] && grep -q '^sync $S' '$C/mock/fp.trace'"

echo "== Refus et attentes (rien n'est déployé)"
cas encours; en_ligne "$P"
controles validate:completed:success e2e:in_progress: image:completed:success > "$C/checks.json"; auto
verifie "CI en cours : attente (code 0), rien déployé" bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/fp.trace' ]"
verifie "CI en cours : état attente, commit en ligne inchangé, pas marqué essayé" \
  test "$(etat resultat):$(etat en_ligne):$(etat dernier_essai)" = "attente:$P:$P"
controles "${VERTS[@]}" > "$C/checks.json"; auto
verifie "CI devenue verte : déployé au passage suivant" bash -c "[ $RC = 0 ] && grep -q '^sync $S' '$C/mock/fp.trace'"

cas rouge; en_ligne "$P"
controles validate:completed:success e2e:completed:success image:completed:failure > "$C/checks.json"; auto
verifie "CI rouge (image) : refus (code 0), rien déployé" bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/fp.trace' ]"
verifie "CI rouge : état refus nommant le contrôle" bash -c "[ '$(etat resultat)' = refus ] && grep -q 'image=failure' '$C/base/etat.json'"
verifie "CI rouge : aucune comparaison demandée (2 appels)" test "$(appels_api)" = 2

cas annule; en_ligne "$P"
controles validate:completed:success e2e:completed:cancelled image:completed:success > "$C/checks.json"; auto
verifie "contrôle annulé : refus, rien déployé" bash -c "[ '$(etat resultat)' = refus ] && [ ! -s '$C/mock/fp.trace' ]"

cas absent; en_ligne "$P"
controles validate:completed:success e2e:completed:success > "$C/checks.json"; auto
verifie "contrôle image absent : attente, rien déployé" bash -c "[ '$(etat resultat)' = attente ] && [ ! -s '$C/mock/fp.trace' ]"

cas imite; en_ligne "$P"
controles validate:completed:success e2e:completed:success image:completed:failure image:completed:success:autre-application > "$C/checks.json"; auto
verifie "contrôle imité par une autre application ignoré : refus" bash -c "[ '$(etat resultat)' = refus ] && [ ! -s '$C/mock/fp.trace' ]"
controles validate:completed:success:intrus e2e:completed:success:intrus image:completed:success:intrus > "$C/checks.json"; auto
verifie "contrôles d'une autre application seulement : rien déployé" bash -c "[ '$(etat resultat)' = attente ] && [ ! -s '$C/mock/fp.trace' ]"

cas relance; en_ligne "$P"
controles validate:completed:success e2e:completed:failure image:completed:success e2e:completed:success > "$C/checks.json"; auto
verifie "contrôle relancé : la dernière exécution fait foi (verte) → déployé" grep -q "^sync $S" "$C/mock/fp.trace"

cas tronque; en_ligne "$P"
python3 -I -c 'import json, sys; d = json.load(open(sys.argv[1])); d["total_count"] = 250; json.dump(d, open(sys.argv[1], "w"))' "$C/checks.json"; auto
verifie "liste de contrôles tronquée : refus" bash -c "[ '$(etat resultat)' = refus ] && [ ! -s '$C/mock/fp.trace' ]"

for st in behind diverged ""; do
  cas "hors-main-${st:-vide}"; en_ligne "$P"; auto MOCK_COMPARE="$st"
  verifie "commit hors de l'historique de main (${st:-statut illisible}) : code 4, rien déployé" \
    bash -c "[ $RC = 4 ] && [ ! -s '$C/mock/fp.trace' ] && [ '$(etat resultat)' = refus ] && [ '$(etat en_ligne)' = $P ]"
done

echo "== API GitHub"
cas injoignable; en_ligne "$P"; auto MOCK_API_DOWN=1
verifie "API injoignable : code 3, rien déployé, état erreur, en ligne inchangé" \
  bash -c "[ $RC = 3 ] && [ ! -s '$C/mock/fp.trace' ] && [ '$(etat resultat)' = erreur ] && [ '$(etat en_ligne)' = $P ]"
cas limitee; en_ligne "$P"; auto MOCK_API_CODE=403
verifie "API en 403 (limite) : code 3, rien déployé" bash -c "[ $RC = 3 ] && [ ! -s '$C/mock/fp.trace' ]"
cas illisible; en_ligne "$P"; auto MOCK_MAIN_SHA='<html>'
verifie "commit de main illisible : code 3, rien déployé" bash -c "[ $RC = 3 ] && [ ! -s '$C/mock/fp.trace' ]"
cas budget; en_ligne "$P"; auto MOCK_RESERVE=5
verifie "réserve d'appels sous le seuil : arrêt après 1 appel, rien déployé" \
  bash -c "[ $RC = 0 ] && [ $(appels_api) = 1 ] && [ ! -s '$C/mock/fp.trace' ] && [ '$(etat resultat)' = attente ]"

echo "== Échecs de construction et de démarrage"
cas build; en_ligne "$P"; auto MOCK_FP_FAIL=build
verifie "construction en échec : code 1" test "$RC" = 1
verifie "construction en échec : rien redémarré, code approuvé rendu à $P" test "$(trace)" = "sync $S;build;sync $P"
verifie "construction en échec : état échec, en ligne = $P, essai consigné" \
  test "$(etat resultat):$(etat etape):$(etat en_ligne):$(etat dernier_essai)" = "echec:build:$P:$S"
verifie "construction en échec : notification /fail" grep -q "^$HC/fail | .*étape build" "$C/mock/notifications"
: > "$C/mock/fp.trace"; auto
verifie "commit en échec non réessayé au passage suivant" bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/fp.trace' ]"

cas sync; en_ligne "$P"; auto MOCK_FP_FAIL='sync#1'
verifie "copie du code en échec : code 1, ni construction ni démarrage" \
  bash -c "[ $RC = 1 ] && [ '$(trace)' = 'sync $S;sync $P' ] && [ '$(etat etape)' = sync ]"

for e in migrate up smoke e2e; do
  cas "demarrage-$e"; en_ligne "$P"; auto MOCK_FP_FAIL="$e#1"
  attendu="sync $S;build;migrate"
  case $e in up) attendu="$attendu;up" ;; smoke) attendu="$attendu;up;smoke" ;; e2e) attendu="$attendu;up;smoke;e2e sandbox-module parcours-scenario" ;; esac
  verifie "échec à l'étape $e : code 1, retour à l'image précédente (sync $P, up, smoke, /version)" \
    bash -c "[ $RC = 1 ] && [ '$(trace)' = '$attendu;sync $P;up;smoke' ] && [ \"\$(cat '$C/mock/en-ligne')\" = $P ]"
  verifie "échec à l'étape $e : état échec, en ligne = $P, notification /fail" \
    bash -c "[ '$(etat resultat):$(etat etape):$(etat en_ligne)' = 'echec:$e:$P' ] && grep -q '^$HC/fail | .*$P rétablie' '$C/mock/notifications'"
done

cas version; en_ligne "$P"; auto MOCK_FP_NOVERSION=1
verifie "/version n'annonce pas le commit déployé : échec et retour" \
  bash -c "[ $RC = 1 ] && [ '$(etat etape):$(etat resultat):$(etat en_ligne)' = 'version:echec:$P' ] && grep -q '^sync $P' '$C/mock/fp.trace'"

cas retour-ko; en_ligne "$P"; auto MOCK_FP_FAIL="migrate up"
verifie "échec du retour : code 1, état echec-retour, plus aucun commit déclaré en ligne" \
  bash -c "[ $RC = 1 ] && [ '$(etat resultat)' = echec-retour ] && [ -z '$(etat en_ligne)' ]"
verifie "échec du retour : notification /fail « intervention requise »" grep -q "^$HC/fail | .*intervention requise" "$C/mock/notifications"

cas premier; auto MOCK_FP_FAIL=migrate
verifie "premier déploiement en échec sans version précédente : code 1, aucun retour tenté" \
  bash -c "[ $RC = 1 ] && [ '$(trace)' = 'sync $S;build;migrate' ] && grep -q 'aucune version précédente' '$C/base/etat.json'"
cas premier-ok; auto
verifie "premier déploiement (aucun état) : déployé" bash -c "[ $RC = 0 ] && [ '$(etat en_ligne)' = $S ]"
cas approuve; echo "$P" > "$C/base/approved-commit"; echo "$P" > "$C/mock/src"; echo "$P" > "$C/mock/en-ligne"
auto MOCK_FP_FAIL='smoke#1'
verifie "sans état, le commit approuvé sert de version précédente" bash -c "[ $RC = 1 ] && grep -q '^sync $P' '$C/mock/fp.trace' && [ '$(etat en_ligne)' = $P ]"

echo "== Verrou, disposition et notification"
cas verrou; en_ligne "$P"
flock "$C/base/.auto.verrou" bash -c "$(declare -f auto); C='$C'; ICI='$ICI'; SCRIPT='$SCRIPT'; S='$S'; auto; echo \$RC > '$C/rc'"
verifie "verrou tenu : passage abandonné sans appel ni déploiement" \
  bash -c "[ \$(cat '$C/rc') = 0 ] && grep -q 'un autre passage est en cours' '$C/sortie' && [ $(appels_api) = 0 ] && [ ! -s '$C/mock/fp.trace' ]"
cas base-groupe; chmod 0770 "$C/base"; auto
verifie "base modifiable par le groupe : refus, rien appelé" bash -c "[ $RC != 0 ] && [ $(appels_api) = 0 ]"
cas etat-lien; ln -s /etc/passwd "$C/base/etat.json"; auto
verifie "état en lien symbolique : refusé, rien déployé" bash -c "[ $RC != 0 ] && [ ! -s '$C/mock/fp.trace' ]"
cas sans-hc; rm "$C/conf/healthchecks-url"; auto
verifie "adresse Healthchecks absente : déployé, notification non envoyée et journalisée" \
  bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/notifications' ] && grep -q 'notification non configurée' '$C/sortie'"
cas hc-644; chmod 0644 "$C/conf/healthchecks-url"; auto
verifie "adresse Healthchecks lisible par d'autres (0644) : non utilisée" \
  bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/notifications' ] && grep -q 'notification refusée' '$C/sortie'"
cas hc-lien; mv "$C/conf/healthchecks-url" "$C/conf/vrai"; ln -s vrai "$C/conf/healthchecks-url"; auto
verifie "adresse Healthchecks en lien symbolique : non utilisée" bash -c "[ ! -s '$C/mock/notifications' ]"
cas hc-invalide; printf 'http://hc.example.invalid/x"\n-o /etc/x\n' > "$C/conf/healthchecks-url"; auto
verifie "adresse Healthchecks invalide : non utilisée, non affichée" \
  bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/notifications' ] && ! grep -q 'hc.example' '$C/sortie'"
cas hc-ko; auto MOCK_HC_DOWN=1
verifie "Healthchecks injoignable : le déploiement reste un succès" bash -c "[ $RC = 0 ] && [ '$(etat resultat)' = succes ]"
cas usage; auto inconnu
verifie "argument inconnu refusé" bash -c "[ $RC != 0 ] && [ $(appels_api) = 0 ]"

echo "== Sources : syntaxe, secrets, unités systemd"
verifie "bash -n fadi-preprod-auto" bash -n "$SCRIPT"
verifie "aucune adresse Healthchecks ni jeton dans les sources" \
  bash -c "! grep -rEn 'hc-ping\\.com|healthchecks\\.io/ping|gh[pousr]_[A-Za-z0-9]{20,}|Authorization:' '$SCRIPT' '$PREPROD/systemd'"
verifie "API GitHub publique seulement (aucun jeton, aucune écriture)" \
  bash -c "! grep -nE -- '-X (POST|PUT|PATCH|DELETE)|GITHUB_TOKEN|GH_TOKEN' '$SCRIPT'"
U=$PREPROD/systemd
verifie "service : oneshot, script installé, délai borné" \
  bash -c "grep -qx 'Type=oneshot' '$U/fadi-preprod-auto.service' && grep -qx 'ExecStart=/usr/local/sbin/fadi-preprod-auto' '$U/fadi-preprod-auto.service' && grep -q '^TimeoutStartSec=' '$U/fadi-preprod-auto.service'"
verifie "minuteur : toutes les 5 minutes, sur ce service" \
  bash -c "grep -qx 'OnCalendar=\*:0/5' '$U/fadi-preprod-auto.timer' && grep -qx 'Unit=fadi-preprod-auto.service' '$U/fadi-preprod-auto.timer' && grep -qx 'WantedBy=timers.target' '$U/fadi-preprod-auto.timer'"
if command -v systemd-analyze > /dev/null; then
  verifie "systemd-analyze : calendrier *:0/5 valide" bash -c "systemd-analyze calendar '*:0/5' > /dev/null"
fi

echo
echo "fadi-preprod-auto : $ok réussi(s), $ko échec(s)"
[ "$ko" -eq 0 ]
