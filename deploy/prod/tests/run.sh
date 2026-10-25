#!/bin/bash
# Tests de fadi-prod-auto sans root, sans réseau ni démon : dispositions jetables (dépôt d'origine et copie de production
# git réels, état de la préproduction, dossier des déploiements), doubles de curl (API GitHub, sondes de
# www.fadimmo.com, Healthchecks), docker, systemctl (sauvegarde hors VPS) et une enveloppe de git (doubles/).
# Couvre : Release absente, brouillon, prérelease ; commit de Release ≠ dernier commit passé en préproduction ;
# préproduction en échec ou en cours ; commit hors de main ; déploiement nominal (ordre sauvegarde → copie → image →
# migrate → redémarrage de app seul → sondes) ; échec simulé de chaque sonde → retour à l'image précédente, base
# jamais restaurée ; échec du retour ; sauvegarde non vérifiée → aucun redémarrage ; échecs de construction et de
# migration ; verrou ; déjà déployé ; reprise d'un passage interrompu ; budget de l'API ; notification ; unités systemd.
# Usage : deploy/prod/tests/run.sh   (requiert bash, git, python3, flock ; hors root)
set -uo pipefail
umask 077
ICI=$(cd "$(dirname "$0")" && pwd)
PROD=$(dirname "$ICI")
DEPOT=$(cd "$PROD/../.." && pwd)
SCRIPT=$PROD/fadi-prod-auto
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
ok=0; ko=0
HC=https://hc.example.invalid/ping/0000-test

if [ "$(id -u)" -eq 0 ]; then echo "run.sh : à lancer hors root (sous root, le script ignore les doubles)" >&2; exit 2; fi

reussi() { ok=$((ok + 1)); echo "✓ $1"; }
rate() { ko=$((ko + 1)); echo "✗ $1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/    /'; }
verifie() { local lib=$1; shift; if "$@"; then reussi "$lib"; else rate "$lib" "$(tail -15 "$C/sortie" 2>/dev/null)"; fi; }

# ── dépôt d'origine : P (en production) → S (Release) sur main ; X sur une autre branche ──────────────────────────────
G=(git -c user.name=test -c user.email=test@invalid -c init.defaultBranch=main -c commit.gpgsign=false)
"${G[@]}" init -q "$T/travail"
mkdir -p "$T/travail/deploy/preprod/proxy"
printf 'services:\n  app:\n    build: .\n' > "$T/travail/docker-compose.yml"
printf 'services:\n  proxy:\n    command: caddy run\n' > "$T/travail/deploy/preprod/proxy/proxy-preprod.override.yml"
printf '.env\n.env.*\n' > "$T/travail/.gitignore"
echo "version P" > "$T/travail/README.md"
"${G[@]}" -C "$T/travail" add -A; "${G[@]}" -C "$T/travail" commit -qm P
P=$(git -C "$T/travail" rev-parse HEAD)
echo "version S" > "$T/travail/README.md"; "${G[@]}" -C "$T/travail" commit -qam S
S=$(git -C "$T/travail" rev-parse HEAD)
"${G[@]}" -C "$T/travail" checkout -q -b autre "$P"; echo "version X" > "$T/travail/README.md"; "${G[@]}" -C "$T/travail" commit -qam X
X=$(git -C "$T/travail" rev-parse HEAD)
"${G[@]}" -C "$T/travail" checkout -q main
git clone -q --bare "$T/travail" "$T/origine.git"

# Disposition $C : déploiements (0700), configuration (adresse Healthchecks 0600), copie de production au commit P
# (avec .env.deploy non suivi), préproduction ayant passé $1 (défaut S) sans échec, production servant P.
cas() {
  C=$T/$1; mkdir -m 0700 "$C" "$C/base" "$C/conf" "$C/mock" "$C/preprod"
  printf '%s\n' "$HC" > "$C/conf/healthchecks-url"; chmod 0600 "$C/conf/healthchecks-url"
  git clone -q "$T/origine.git" "$C/app"; git -C "$C/app" reset -q --hard "$P"
  echo 'POSTGRES_PASSWORD=factice' > "$C/app/.env.deploy"
  preprod "${2:-$S}" succes
  echo "$P" > "$C/mock/en-ligne"
  : > "$C/mock/ordre"; : > "$C/mock/curl.trace"; : > "$C/mock/notifications"
}
preprod() {  # $1 = commit essayé et en ligne, $2 = résultat, $3 = commit en ligne (défaut $1), $4 = commit approuvé
  python3 -I -c 'import json, sys; json.dump({"commit": sys.argv[2], "dernier_essai": sys.argv[2], "en_ligne": sys.argv[4], "resultat": sys.argv[3], "etape": "fin"}, open(sys.argv[1], "w"))' \
    "$C/preprod/etat.json" "$1" "$2" "${3:-$1}"
  echo "${4:-$1}" > "$C/preprod/approved-commit"; chmod 0600 "$C/preprod/etat.json" "$C/preprod/approved-commit"
}
# Lance le script sur $C ; variables MOCK_… en tête ; code dans $RC, sortie dans $C/sortie.
auto() {
  local vars=(); while [[ ${1:-} =~ ^[A-Z_]+= ]]; do vars+=("$1"); shift; done
  env -i HOME="$C" PATH=/usr/bin:/bin FADI_PROD_BASE="$C/base" FADI_PROD_AUTO_CONF="$C/conf" FADI_PROD_APP="$C/app" \
    FADI_PROD_PREPROD_BASE="$C/preprod" FADI_PROD_REPO="$T/origine.git" FADI_PROD_TEST_BIN="$ICI/doubles" FADI_PROD_PAUSE=0 \
    MOCK_DIR="$C/mock" MOCK_RELEASE_SHA="$S" "${vars[@]}" "$SCRIPT" "$@" > "$C/sortie" 2>&1
  RC=$?
}
etat() { python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))' "$C/base/etat.json" "$1"; }
appels_api() { grep -c '^https://api.github.com/' "$C/mock/curl.trace"; }
ordre() { paste -sd ';' "$C/mock/ordre"; }
rien_modifie() {  # aucune sauvegarde, copie, image ni redémarrage ; copie et production toujours au commit P
  [ ! -s "$C/mock/ordre" ] && [ "$(git -C "$C/app" rev-parse HEAD)" = "$P" ] && [ "$(cat "$C/mock/en-ligne")" = "$P" ]
}
aucun_redemarrage() { ! grep -q '^up ' "$C/mock/ordre" && [ "$(cat "$C/mock/en-ligne")" = "$P" ]; }
base_jamais_restauree() {  # seul pg_restore --list (lecture du catalogue) ; aucune restauration ni psql
  ! grep -Ev '^pg_restore --list$' "$C/mock/ordre" | grep -q '^pg_restore' \
    && ! grep -Eq 'pg_restore (-d|--dbname)|psql|restore\.sh|verify-restore|DROP DATABASE' "$C/mock/docker.args"
}
S12=${S:0:12}
NOMINAL="pg_dump;pg_restore --list;systemctl-start fadi-backup-offsite.service;git-reset $S;tag img-$P fadi-prod-app:retour;build fadi-prod-app:$S12;config fadi-prod-app:$S12;config fadi-prod-app:retour;migrate fadi-prod-app:$S12;up app fadi-prod-app:$S12"

echo "== Pas de Release utilisable : rien"
cas absente; auto MOCK_RELEASE_ID=absent
verifie "aucune Release publiée (404) : code 0, rien modifié, 1 appel API, état « aucune »" \
  bash -c "[ $RC = 0 ] && [ $(appels_api) = 1 ] && [ '$(etat sondage)' = aucune ] && [ ! -s '$C/mock/notifications' ]"
verifie "aucune Release : rien modifié" rien_modifie
cas brouillon; auto MOCK_DRAFT=true
verifie "Release brouillon : code 0, refus, rien modifié" bash -c "[ $RC = 0 ] && [ '$(etat sondage)' = refus ] && [ -z '$(etat resultat)' ]"
verifie "Release brouillon : rien modifié" rien_modifie
cas prerelease; auto MOCK_PRERELEASE=true
verifie "Release prérelease : code 0, refus, rien modifié" bash -c "[ $RC = 0 ] && [ '$(etat sondage)' = refus ] && [ $(appels_api) = 1 ]"
verifie "Release prérelease : rien modifié" rien_modifie
auto
verifie "la même Release publiée ensuite (même id, ni brouillon ni prérelease) : déployée" bash -c "[ $RC = 0 ] && [ '$(etat resultat)' = succes ]"

echo "== Commit de Release ≠ dernier commit passé en préproduction : refus"
cas autre-commit "$P"; auto MOCK_RELEASE_SHA="$X"
verifie "Release sur un commit que la préproduction n'a pas passé : code 0, refus, rien modifié" \
  bash -c "[ $RC = 0 ] && [ '$(etat resultat):$(etat etape)' = refus:preprod ] && grep -q '$X' '$C/base/etat.json'"
verifie "refus : rien modifié" rien_modifie
verifie "refus : notification /fail (une fois)" bash -c "[ \$(grep -c '^$HC/fail | .*refusée' '$C/mock/notifications') = 1 ]"
cas preprod-avancee; preprod "$X" succes; auto
verifie "préproduction passée depuis sur un autre commit : refus, rien modifié" \
  bash -c "[ $RC = 0 ] && [ '$(etat resultat):$(etat etape)' = refus:preprod ] && [ ! -s '$C/mock/ordre' ]"
: > "$C/mock/curl.trace"; : > "$C/mock/notifications"; auto
verifie "refus revu au passage suivant : 1 seul appel API, aucune nouvelle notification" \
  bash -c "[ $RC = 0 ] && [ $(appels_api) = 1 ] && [ ! -s '$C/mock/notifications' ] && [ '$(etat resultat)' = refus ]"
preprod "$S" succes; auto
verifie "la préproduction a passé le commit de la Release : déployée au passage suivant" \
  bash -c "[ $RC = 0 ] && [ '$(etat resultat):$(etat en_ligne)' = succes:$S ]"
cas approuve-ecart; preprod "$S" succes "$S" "$X"; auto
verifie "commit approuvé de la préproduction ≠ Release : refus" bash -c "[ '$(etat resultat):$(etat etape)' = refus:preprod ] && [ ! -s '$C/mock/ordre' ]"
cas en-ligne-ecart; preprod "$S" succes "$P"; auto
verifie "commit en ligne en préproduction ≠ Release : refus" bash -c "[ '$(etat resultat):$(etat etape)' = refus:preprod ] && [ ! -s '$C/mock/ordre' ]"
cas preprod-absente; rm "$C/preprod/etat.json"; auto
verifie "état de la préproduction absent : refus, rien modifié" bash -c "[ '$(etat resultat):$(etat etape)' = refus:preprod ] && [ ! -s '$C/mock/ordre' ]"
cas preprod-groupe; chmod 0664 "$C/preprod/etat.json"; auto
verifie "état de la préproduction modifiable par le groupe : refus" bash -c "[ '$(etat resultat)' = refus ] && [ ! -s '$C/mock/ordre' ]"

echo "== Préproduction en échec ou en cours : refus"
for r in echec echec-retour en-cours; do
  cas "preprod-$r"; preprod "$S" "$r" "$P"; auto
  verifie "préproduction « $r » sur le commit de la Release : refus, rien modifié" \
    bash -c "[ $RC = 0 ] && [ '$(etat resultat):$(etat etape)' = refus:preprod ] && [ ! -s '$C/mock/ordre' ]"
done
cas preprod-echec-suivant; python3 -I -c 'import json, sys; json.dump({"commit": sys.argv[2], "dernier_essai": sys.argv[2], "en_ligne": sys.argv[3], "resultat": "echec", "etape": "smoke"}, open(sys.argv[1], "w"))' "$C/preprod/etat.json" "$X" "$S"; auto
verifie "commit suivant en échec en préproduction (retour à la Release) : refus" bash -c "[ '$(etat resultat)' = refus ] && grep -q 'préproduction en échec' '$C/base/etat.json'"

echo "== Commit hors de main : refus"
for st in behind diverged ""; do
  cas "hors-main-${st:-vide}"; auto MOCK_COMPARE="$st"
  verifie "comparaison GitHub « ${st:-illisible} » : code 4, rien modifié, refus définitif" \
    bash -c "[ $RC = 4 ] && [ '$(etat resultat):$(etat etape)' = refus:historique ] && [ ! -s '$C/mock/ordre' ]"
done
cas hors-main-local; preprod "$X" succes; auto MOCK_RELEASE_SHA="$X"
verifie "commit d'une autre branche (contrôle git local) : refus au départ, rien modifié" \
  bash -c "[ $RC = 0 ] && [ '$(etat resultat):$(etat etape)' = refus:depart ] && grep -q \"n'appartient pas à main\" '$C/base/etat.json' && [ ! -s '$C/mock/ordre' ]"

echo "== Déploiement nominal"
cas nominal; auto
verifie "Release validée en préproduction : déployée (code 0)" test "$RC" = 0
verifie "ordre : dump local vérifié → sauvegarde hors VPS → copie → image → migrate → redémarrage de app seul → étiquette habituelle" \
  test "$(ordre)" = "$NOMINAL;tag fadi-prod-app:$S12 app-app:latest"
verifie "copie de production au commit de la Release, propre, .env.deploy conservé" \
  bash -c "[ \$(git -C '$C/app' rev-parse HEAD) = $S ] && [ -z \"\$(git -C '$C/app' status --porcelain)\" ] && [ -f '$C/app/.env.deploy' ]"
verifie "production servant le commit de la Release" test "$(cat "$C/mock/en-ligne")" = "$S"
verifie "état : succès, en ligne = Release, précédent = $P, étape fin" \
  test "$(etat resultat):$(etat en_ligne):$(etat precedent):$(etat etape):$(etat release_tag)" = "succes:$S:$P:fin:v2026.10.25"
verifie "état JSON en 0600" test "$(stat -c %a "$C/base/etat.json")" = 600
verifie "3 appels à l'API GitHub (Release, étiquette, comparaison)" test "$(appels_api)" = 3
verifie "image construite depuis git archive : ni .env.deploy ni .git dans le contexte" \
  bash -c "grep -qx './docker-compose.yml' '$C/mock/build-contexte' && ! grep -qE 'env.deploy|/\\.git/' '$C/mock/build-contexte'"
verifie "commandes Compose : projet app, docker-compose.yml + surcharge du proxy toujours incluse" \
  bash -c "! grep '^compose' '$C/mock/docker.args' | grep -v -- '-p app ' | grep -q . && ! grep '^compose' '$C/mock/docker.args' | grep -v 'proxy-preprod.override.yml' | grep -q ."
verifie "redémarrage : --no-deps --no-build --pull never du seul service app ; base et proxy jamais recréés" \
  bash -c "grep -E '^compose .* up ' '$C/mock/docker.args' | grep -q -- '--no-deps --no-build --pull never' && ! grep -E '^compose .* up .*(db|proxy|backup)\$|force-recreate' '$C/mock/docker.args' && ! grep -E '^compose .* (down|rm|stop|restart)' '$C/mock/docker.args'"
verifie "migration par le service migrate (D-7) sans relancer la base (--no-deps), MIGRATE_ON_START jamais forcé" \
  bash -c "grep -E '^compose .* run --rm --no-deps -T migrate\$' '$C/mock/docker.args' >/dev/null && ! grep -q MIGRATE_ON_START '$C/mock/docker.args' && ! grep -q 'MIGRATE_ON_START' '$C/base/'*-auto/image.yml"
verifie "sondes : /health, accueil, /projects, /version sur www.fadimmo.com" \
  bash -c "for p in health '' projects version; do grep -qx \"https://www.fadimmo.com/\$p\" '$C/mock/curl.trace' || exit 1; done"
verifie "sauvegarde consignée (dump vérifié, empreinte, instantané restic)" \
  bash -c "grep -q 'avant-deploiement.dump (sha256 ' '$C/base/etat.json' && grep -q 'restic' '$C/base/etat.json'"
J=$(find "$C/base" -maxdepth 1 -name '*-auto' -type d | head -1)
verifie "journal du déploiement en 0700 / 0600" \
  bash -c "[[ \$(basename '$J') =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+-auto\$ ]] && [ \$(stat -c %a '$J') = 700 ] && [ \$(stat -c %a '$J/journal.log') = 600 ] && [ -s '$J/avant-deploiement.dump' ]"
verifie "étiquette app-app:latest posée sur la nouvelle image" test "$(cat "$C/mock/images/app-app:latest" 2>/dev/null)" = "$S"
verifie "notification de succès (ping, pas /fail) avec la Release" grep -qx "$HC | fadi-prod-auto : Release v2026.10.25 : $S en production.*" "$C/mock/notifications"
verifie "adresse de notification jamais en argument de curl" bash -c "! grep -q 'hc.example' '$C/mock/curl.args'"
verifie "base jamais restaurée" base_jamais_restauree

cas nettoyage; mkdir -p "$C/mock/images"; for t in 111111111111 "${P:0:12}"; do echo x > "$C/mock/images/fadi-prod-app:$t"; done; auto
verifie "après succès : anciennes images fadi-prod-app retirées ; en ligne, précédente et retour gardées" \
  bash -c "[ $RC = 0 ] && grep -qx 'image-rm fadi-prod-app:111111111111' '$C/mock/ordre' && ! grep -qE 'image-rm fadi-prod-app:(${P:0:12}|$S12|retour)' '$C/mock/ordre'"

echo "== Déjà déployé : rien"
: > "$C/mock/ordre"; : > "$C/mock/curl.trace"; : > "$C/mock/notifications"; auto
verifie "même Release au passage suivant : code 0, 1 appel API, rien fait, aucune notification" \
  bash -c "[ $RC = 0 ] && [ $(appels_api) = 1 ] && [ ! -s '$C/mock/ordre' ] && [ ! -s '$C/mock/notifications' ]"
auto MOCK_RELEASE_ID=42
verifie "nouvelle Release sur le commit déjà en production : rien fait" bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/ordre' ] && [ '$(etat release_id)' = 42 ]"
cas deja-servi; echo "$S" > "$C/mock/en-ligne"; auto
verifie "production servant déjà le commit (état vide) : rien modifié" \
  bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/ordre' ] && [ '$(etat resultat):$(etat en_ligne)' = succes:$S ]"
cas annotee; auto MOCK_ANNOTEE=1
verifie "étiquette annotée : suivie jusqu'au commit, déployée (4 appels API)" bash -c "[ $RC = 0 ] && [ '$(etat en_ligne)' = $S ] && [ $(appels_api) = 4 ]"

echo "== Échec simulé d'une sonde : retour à l'image précédente, base non restaurée"
for s in health accueil projects version; do
  cas "sonde-$s"; auto MOCK_KO_COMMIT="$S" MOCK_SONDE_KO="$s"
  verifie "sonde $s en échec : code 1, retour à fadi-prod-app:retour ($P), production rétablie" \
    bash -c "[ $RC = 1 ] && [ '$(ordre)' = '$NOMINAL;git-reset $P;up app fadi-prod-app:retour' ] && [ \"\$(cat '$C/mock/en-ligne')\" = $P ]"
  verifie "sonde $s en échec : copie rendue à $P, état échec (en ligne = $P), sondes relancées" \
    bash -c "[ \$(git -C '$C/app' rev-parse HEAD) = $P ] && [ '$(etat resultat):$(etat etape):$(etat en_ligne)' = 'echec:sondes:$P' ] && grep -q 'image précédente rétablie' '$C/base/etat.json'"
  verifie "sonde $s en échec : base jamais restaurée (seul pg_restore --list a lu le dump)" base_jamais_restauree
  verifie "sonde $s en échec : message nommant la sauvegarde de l'étape 1 et l'accord du maître d'ouvrage" \
    bash -c "grep -q 'base NON restaurée' '$C/base/etat.json' && grep -q 'avant-deploiement.dump' '$C/base/etat.json' && grep -q \"accord du maître d'ouvrage\" '$C/base/etat.json'"
  verifie "sonde $s en échec : notification /fail" grep -q "^$HC/fail | .*base NON restaurée" "$C/mock/notifications"
done
: > "$C/mock/ordre"; auto
verifie "Release en échec non rejouée au passage suivant" bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/ordre' ]"
auto MOCK_API_DOWN=1
verifie "panne de l'API après un échec : code 3, l'échec de la Release reste consigné (resultat echec, même release_id)" \
  bash -c "[ $RC = 3 ] && [ '$(etat resultat):$(etat sondage)' = echec:erreur ] && [ -n '$(etat release_id)' ]"
auto
verifie "API revenue après la panne : Release en échec toujours non rejouée sans relancer" \
  bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/ordre' ] && [ '$(etat resultat):$(etat sondage)' = echec:ok ]"
auto relancer; auto
verifie "relancer : la Release est de nouveau essayée (et déployée, sonde réparée)" bash -c "[ $RC = 0 ] && [ '$(etat resultat):$(etat en_ligne)' = succes:$S ]"

cas up-ko; auto MOCK_FAIL='up#1'
verifie "redémarrage en échec (compose up) : retour à l'image précédente" \
  bash -c "[ $RC = 1 ] && [ '$(etat resultat):$(etat etape):$(etat en_ligne)' = 'echec:redemarrage:$P' ] && grep -q 'up app fadi-prod-app:retour' '$C/mock/ordre'"
cas db-recree; auto MOCK_DB_RECREE=1
verifie "conteneur db changé pendant le redémarrage : retour à l'image précédente" \
  bash -c "[ $RC = 1 ] && [ '$(etat resultat)' = echec ] && grep -q 'base, proxy ou sauvegarde modifiés' '$C/base/etat.json'"
cas retour-ko; auto MOCK_KO_COMMIT="$S" MOCK_FAIL='up#2'
verifie "échec du retour : code 1, état echec-retour, plus aucun commit déclaré en ligne, intervention requise" \
  bash -c "[ $RC = 1 ] && [ '$(etat resultat)' = echec-retour ] && [ -z '$(etat en_ligne)' ] && grep -q '^$HC/fail | .*intervention requise' '$C/mock/notifications'"
verifie "échec du retour : base toujours non restaurée" base_jamais_restauree

echo "== Sauvegarde non vérifiée : aucun redémarrage"
for v in MOCK_SAUVEGARDE=echec MOCK_SAUVEGARDE=condition MOCK_SAUVEGARDE=muet MOCK_CATALOGUE_VIDE=1 MOCK_DUMP_VIDE=1 MOCK_FAIL=pg_dump MOCK_FAIL=pg_restore; do
  cas "sauvegarde-${v,,}"; auto "$v"
  verifie "sauvegarde non vérifiée ($v) : code 1, copie, image et application inchangées" \
    bash -c "[ $RC = 1 ] && [ '$(etat resultat):$(etat etape)' = echec:sauvegarde ] && ! grep -qE '^(git-reset|build|migrate|up|tag) ' '$C/mock/ordre' && [ \$(git -C '$C/app' rev-parse HEAD) = $P ] && [ \"\$(cat '$C/mock/en-ligne')\" = $P ]"
done
verifie "sauvegarde non vérifiée : notification /fail" grep -q "^$HC/fail | .*sauvegarde" "$C/mock/notifications"

echo "== Échecs avant le redémarrage"
cas build-ko; auto MOCK_FAIL=build
verifie "construction en échec : code 1, copie rendue à $P, aucun redémarrage" \
  bash -c "[ $RC = 1 ] && [ '$(etat resultat):$(etat etape)' = echec:build ] && [ \$(git -C '$C/app' rev-parse HEAD) = $P ] && ! grep -q '^up ' '$C/mock/ordre'"
cas migrate-ko; auto MOCK_FAIL=migrate
verifie "migration en échec : code 1, aucun redémarrage, copie rendue, message base non restaurée + sauvegarde" \
  bash -c "[ $RC = 1 ] && [ '$(etat resultat):$(etat etape)' = echec:migrate ] && ! grep -q '^up ' '$C/mock/ordre' && [ \$(git -C '$C/app' rev-parse HEAD) = $P ] && grep -q 'base NON restaurée' '$C/base/etat.json'"
cas migrate-muet; auto MOCK_MIGRATE_LOG='Schema applied (init.sql).'
verifie "migration sans « Migration terminée » : échec, aucun redémarrage" bash -c "[ $RC = 1 ] && [ '$(etat etape)' = migrate ] && ! grep -q '^up ' '$C/mock/ordre'"
cas sync-ko; auto MOCK_GIT_FAIL=reset
verifie "mise à jour de la copie en échec : code 1, ni image ni redémarrage" \
  bash -c "[ $RC = 1 ] && [ '$(etat etape)' = sync ] && ! grep -qE '^(build|up) ' '$C/mock/ordre'"

echo "== Refus au départ (rien n'est modifié)"
cas copie-modifiee; echo modif >> "$C/app/README.md"; auto
verifie "copie de production modifiée : refus, aucun écrasement" \
  bash -c "[ $RC = 0 ] && [ '$(etat resultat):$(etat etape)' = refus:depart ] && [ ! -s '$C/mock/ordre' ] && grep -q modif '$C/app/README.md'"
cas version-ecart; echo "$X" > "$C/mock/en-ligne"; auto
verifie "version servie ≠ commit de la copie : refus" bash -c "[ '$(etat resultat):$(etat etape)' = refus:depart ] && [ ! -s '$C/mock/ordre' ]"
cas depart-ko; auto MOCK_KO_COMMIT="$P"
verifie "production de départ en échec aux sondes : refus, rien modifié" bash -c "[ '$(etat resultat):$(etat etape)' = refus:depart ] && [ ! -s '$C/mock/ordre' ]"
: > "$C/mock/curl.trace"; auto
verifie "refus au départ définitif pour cette Release (1 appel API, relancer pour réessayer)" bash -c "[ $RC = 0 ] && [ $(appels_api) = 1 ] && [ ! -s '$C/mock/ordre' ]"

echo "== Passage interrompu"
interrompu() {  # $1 = étape : état « en-cours » laissé par un passage arrêté après cette étape
  auto MOCK_KO_COMMIT="$S" MOCK_SONDE_KO=health MOCK_FAIL='up#2' > /dev/null   # dossier du déploiement préparé
  python3 -I -c 'import json, sys; e = json.load(open(sys.argv[1])); e.update(resultat="en-cours", etape=sys.argv[2]); json.dump(e, open(sys.argv[1], "w"))' "$C/base/etat.json" "$1"
  git -C "$C/app" reset -q --keep "$S"; echo "$S" > "$C/mock/en-ligne"; [ "$1" = sauvegarde ] && { git -C "$C/app" reset -q --keep "$P"; echo "$P" > "$C/mock/en-ligne"; }
  : > "$C/mock/ordre"; : > "$C/mock/curl.trace"; : > "$C/mock/notifications"
}
cas interrompu-sondes; interrompu sondes; auto
verifie "interrompu après le redémarrage : retour à l'image précédente, copie rendue, sans appel API" \
  bash -c "[ $RC = 1 ] && [ '$(ordre)' = 'git-reset $P;up app fadi-prod-app:retour' ] && [ \"\$(cat '$C/mock/en-ligne')\" = $P ] && [ $(appels_api) = 0 ] && [ '$(etat resultat):$(etat en_ligne)' = echec:$P ]"
cas interrompu-build; interrompu build; echo "$P" > "$C/mock/en-ligne"; auto
verifie "interrompu pendant la construction : copie rendue, aucun redémarrage" \
  bash -c "[ $RC = 1 ] && [ '$(ordre)' = 'git-reset $P' ] && [ '$(etat resultat):$(etat etape)' = echec:interrompu-build ]"
cas interrompu-sauvegarde; interrompu sauvegarde; auto
verifie "interrompu pendant la sauvegarde : rien à rétablir, échec consigné" \
  bash -c "[ $RC = 1 ] && [ ! -s '$C/mock/ordre' ] && [ '$(etat resultat):$(etat etape)' = echec:interrompu-sauvegarde ]"
: > "$C/mock/ordre"; auto
verifie "après reprise : Release non rejouée" bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/ordre' ]"

echo "== Verrou, API, disposition et notification"
cas verrou
flock "$C/base/deploiement.lock" bash -c "$(declare -f auto); C='$C'; T='$T'; ICI='$ICI'; SCRIPT='$SCRIPT'; S='$S'; auto; echo \$RC > '$C/rc'"
verifie "verrou tenu (autre déploiement de production) : passage abandonné sans appel ni action" \
  bash -c "[ \$(cat '$C/rc') = 0 ] && grep -q 'un autre déploiement de production est en cours' '$C/sortie' && [ $(appels_api) = 0 ] && [ ! -s '$C/mock/ordre' ]"
cas injoignable; auto MOCK_API_DOWN=1
verifie "API injoignable : code 3, rien modifié, sondage en erreur" bash -c "[ $RC = 3 ] && [ ! -s '$C/mock/ordre' ] && [ '$(etat sondage)' = erreur ]"
auto
verifie "après une erreur d'API, la Release est évaluée normalement" bash -c "[ $RC = 0 ] && [ '$(etat resultat)' = succes ]"
cas limitee; auto MOCK_API_CODE=403
verifie "API en 403 (limite) : code 3, rien modifié" bash -c "[ $RC = 3 ] && [ ! -s '$C/mock/ordre' ]"
cas budget; auto MOCK_RESERVE=15
verifie "réserve d'appels sous 20 (laissés à la préproduction) : arrêt après 1 appel" \
  bash -c "[ $RC = 0 ] && [ $(appels_api) = 1 ] && [ ! -s '$C/mock/ordre' ] && [ '$(etat sondage)' = attente ]"
cas base-groupe; chmod 0770 "$C/base"; auto
verifie "dossier des déploiements modifiable par le groupe : refus, rien appelé" bash -c "[ $RC != 0 ] && [ $(appels_api) = 0 ]"
cas etat-lien; ln -s /etc/passwd "$C/base/etat.json"; auto
verifie "état en lien symbolique : refusé" bash -c "[ $RC != 0 ] && [ ! -s '$C/mock/ordre' ]"
cas sans-hc; rm "$C/conf/healthchecks-url"; auto
verifie "adresse Healthchecks absente : déployé, notification non envoyée et journalisée" \
  bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/notifications' ] && grep -q 'notification non configurée' '$C/sortie'"
cas hc-644; chmod 0644 "$C/conf/healthchecks-url"; auto
verifie "adresse Healthchecks lisible par d'autres : non utilisée" bash -c "[ $RC = 0 ] && [ ! -s '$C/mock/notifications' ]"
cas config; printf 'UNITE_SAUVEGARDE=fadi-sauvegarde-test.service\n' > "$C/conf/config"; chmod 0600 "$C/conf/config"; auto
verifie "réglage UNITE_SAUVEGARDE : unité de sauvegarde désignée par /etc/fadi-prod-auto/config" \
  bash -c "[ $RC = 0 ] && grep -qx 'systemctl-start fadi-sauvegarde-test.service' '$C/mock/ordre'"
cas config-ko; printf 'UNITE_SAUVEGARDE=x; rm -rf /\n' > "$C/conf/config"; chmod 0600 "$C/conf/config"; auto
verifie "réglage invalide : refusé, rien appelé" bash -c "[ $RC != 0 ] && [ $(appels_api) = 0 ]"
cas config-cle; printf 'AUTRE=1\n' > "$C/conf/config"; chmod 0600 "$C/conf/config"; auto
verifie "clé de réglage inconnue : refusée" bash -c "[ $RC != 0 ] && [ $(appels_api) = 0 ]"
cas usage; auto inconnu
verifie "argument inconnu refusé" bash -c "[ $RC != 0 ] && [ $(appels_api) = 0 ]"

echo "== Sources : syntaxe, secrets, unités systemd"
verifie "bash -n fadi-prod-auto" bash -n "$SCRIPT"
verifie "aucune adresse Healthchecks ni jeton dans les sources" \
  bash -c "! grep -rEn 'hc-ping\\.com/[0-9a-f]|healthchecks\\.io/ping|gh[pousr]_[A-Za-z0-9]{20,}|Authorization:' '$SCRIPT' '$PROD/systemd'"
verifie "API GitHub publique en lecture seule (aucun jeton, aucune écriture)" \
  bash -c "! grep -nE -- '-X (POST|PUT|PATCH|DELETE)|GITHUB_TOKEN|GH_TOKEN' '$SCRIPT'"
verifie "aucune restauration de la base dans le script (ni pg_restore -d, ni psql, ni restore.sh)" \
  bash -c "! grep -nE 'pg_restore +(-d|--dbname)|psql|restore\\.sh|verify-restore' '$SCRIPT'"
verifie "MIGRATE_ON_START jamais forcé par le script (valeur de docker-compose.yml, migration par le service migrate)" \
  bash -c "! grep -nE 'MIGRATE_ON_START[=:]' '$SCRIPT' | grep -v '^[0-9]*:#'"
verifie "docker-compose.yml du dépôt : service migrate (MIGRATE_ONLY=1), app dépend de sa réussite" \
  python3 -I -c 'import re, sys; s = open(sys.argv[1]).read(); assert re.search(r"migrate:\n(?:.*\n)*?\s+MIGRATE_ONLY: \"1\"", s) and "condition: service_completed_successfully" in s' "$DEPOT/docker-compose.yml"
verifie "surcharge du proxy présente au chemin attendu" test -f "$DEPOT/deploy/preprod/proxy/proxy-preprod.override.yml"
verifie "unité de sauvegarde par défaut = celle d'ops/systemd" \
  bash -c "grep -q '^UNITE_SAUVEGARDE=fadi-backup-offsite.service$' '$SCRIPT' && [ -f '$DEPOT/ops/systemd/fadi-backup-offsite.service' ]"
I=$PROD/installation/installer-prod-auto.sh
verifie "bash -n installer-prod-auto.sh" bash -n "$I"
verifie "installateur : empreintes SHA-256 = fichiers du dépôt (script, service, minuteur)" \
  python3 -I - "$I" "$DEPOT" <<'PY'
import hashlib, re, sys
lignes = re.findall(r'^  "([^|"]+)\|([^|]+)\|(\d{4})\|([0-9a-f]{64})"$', open(sys.argv[1]).read(), re.M)
attendus = {"deploy/prod/fadi-prod-auto", "deploy/prod/systemd/fadi-prod-auto.service", "deploy/prod/systemd/fadi-prod-auto.timer"}
assert {l[0] for l in lignes} == attendus, lignes
for src, dst, mode, h in lignes:
    reel = hashlib.sha256(open(f"{sys.argv[2]}/{src}", "rb").read()).hexdigest()
    assert reel == h, f"{src} : {reel} ≠ {h} (mettre à jour l'installateur)"
PY
U=$PROD/systemd
verifie "service : oneshot, script installé, délai borné, /mnt/data requis" \
  bash -c "grep -qx 'Type=oneshot' '$U/fadi-prod-auto.service' && grep -qx 'ExecStart=/usr/local/sbin/fadi-prod-auto' '$U/fadi-prod-auto.service' && grep -q '^TimeoutStartSec=' '$U/fadi-prod-auto.service' && grep -qx 'RequiresMountsFor=/mnt/data' '$U/fadi-prod-auto.service'"
verifie "service : /root en lecture seule sauf l'état du client Docker" \
  bash -c "grep -qx 'ProtectHome=read-only' '$U/fadi-prod-auto.service' && grep -qx 'ReadWritePaths=-/root/.docker' '$U/fadi-prod-auto.service' && grep -qx 'NoNewPrivileges=yes' '$U/fadi-prod-auto.service'"
verifie "minuteur : toutes les 10 minutes, sur ce service" \
  bash -c "grep -qx 'OnCalendar=\*:0/10' '$U/fadi-prod-auto.timer' && grep -qx 'Unit=fadi-prod-auto.service' '$U/fadi-prod-auto.timer' && grep -qx 'WantedBy=timers.target' '$U/fadi-prod-auto.timer'"
if command -v systemd-analyze > /dev/null; then
  verifie "systemd-analyze : calendrier *:0/10 valide" bash -c "systemd-analyze calendar '*:0/10' > /dev/null"
fi

echo
echo "fadi-prod-auto : $ok réussi(s), $ko échec(s)"
[ "$ko" -eq 0 ]
