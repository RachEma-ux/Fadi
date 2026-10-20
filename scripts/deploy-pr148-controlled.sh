#!/usr/bin/env bash
# Fadi PR148 — deploiement borne a un SHA, sans migration de production.
# Usage : sudo bash fadi_deploiement_pr148.sh --deploy
# Secrets/journaux/configurations restent sur le serveur dans un dossier root 0700.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export GIT_TERMINAL_PROMPT=0
TARGET=5cf61d1fed9ed523b331228af20bce93a4f2bf63
EXPECTED=3bcda9296eaa0a0376ca5d2279dd71f52a75184b
APP=/mnt/data/fadi/app
BASE=/mnt/data/fadi/deployments
URL=https://www.fadimmo.com
SWITCHED=0
RUN=''
[[ ${1:-} == --deploy && $EUID == 0 ]] || { echo 'Utilisation : sudo bash ce-script.sh --deploy'; exit 2; }
[[ -d /run/systemd/system && -d "$APP/.git" ]] || { echo 'ARRET : executer sur Fadi-Serv, pas dans Termux local.'; exit 2; }
for cmd in docker git curl python3 flock runuser sha256sum tar timeout cmp; do command -v "$cmd" >/dev/null || { echo "Commande absente : $cmd"; exit 2; }; done
mkdir -p "$BASE"
chmod 700 "$BASE"
exec 9>"$BASE/deploiement.lock"
flock -n 9 || { echo 'ARRET : un deploiement est deja en cours.'; exit 2; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
RUN="$BASE/$STAMP"
mkdir -m 700 "$RUN" "$RUN/source"
REPORT="$BASE/pr148-resultat.txt"
printf 'EN_COURS\nCible=%s\nDossier=%s\n' "$TARGET" "$RUN" > "$REPORT"
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$RUN/etapes.log"; }
stop() { log "ARRET : $*"; exit 1; }
g() { runuser -u ubuntu -- git -c core.hooksPath=/dev/null -C "$APP" "$@"; }
dc() { docker compose --ansi never -p app --project-directory "$APP" -f "$1" "${@:2}"; }
healthy() {
  local image=$1
  [[ $(docker inspect -f '{{.Image}}' app-app-1 2>/dev/null) == "$image" ]] || return 1
  [[ $(docker inspect -f '{{.State.Health.Status}}' app-app-1 2>/dev/null) == healthy ]] || return 1
  curl -fsS --connect-timeout 5 --max-time 15 "$URL/health?verification=$STAMP" > "$RUN/health.json" || return 1
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d.get("status")=="ok" and d.get("db")=="ok" else 1)' "$RUN/health.json" || return 1
}
finish() {
  local rc=$?
  trap - EXIT INT TERM
  if (( rc != 0 )); then
    set +e
    if (( SWITCHED )); then
      log 'Controle en echec : tentative de retour a l image precedente, sans restaurer la base.'
      if dc "$RUN/retour.json" up -d --no-deps --no-build --pull never --wait --wait-timeout 180 app > "$RUN/retour.log" 2>&1 && healthy "$OLD_IMAGE"; then
        printf 'FADI_DEPLOIEMENT_ECHOUE_RETOUR_ARRIERE_OK\n' > "$REPORT"
      else
        printf 'FADI_DEPLOIEMENT_ECHOUE_INTERVENTION_REQUISE\n' > "$REPORT"
      fi
    else
      printf 'FADI_ARRET_AVANT_BASCULE\n' > "$REPORT"
    fi
    printf 'Code=%s\nDossier=%s\n' "$rc" "$RUN" >> "$REPORT"
    tail -n 6 "$RUN/etapes.log" >> "$REPORT"
    cat "$REPORT"
  fi
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
log '1/7 Verification de la configuration existante et des tests GitHub.'
[[ -r "$APP/.env.deploy" ]] || stop '.env.deploy absent.'
[[ -z $(g status --porcelain) ]] || stop 'Le depot local contient des modifications ; aucun ecrasement.'
OLD_GIT=$(g rev-parse HEAD)
[[ $OLD_GIT == "$EXPECTED" || $OLD_GIT == "$TARGET" ]] || stop 'Version locale differente du perimetre revu.'
OLD_IMAGE=$(docker inspect -f '{{.Image}}' app-app-1)
healthy "$OLD_IMAGE" || stop 'La production de depart ne passe pas les controles de sante.'
docker inspect app-app-1 > "$RUN/app-avant.json"
for name in app-db-1 app-proxy-1 app-backup-1; do docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}}' "$name"; done > "$RUN/services-avant.txt"
[[ $(docker inspect -f '{{.State.Health.Status}}' app-db-1) == healthy ]] || stop 'PostgreSQL non sain.'
PROJECT=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' app-app-1)
WD=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' app-app-1)
[[ $PROJECT == app && $WD == "$APP" ]] || stop 'Projet/repertoire Compose inattendu.'
FILES=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' app-app-1)
IFS=',' read -r -a FILE_ARRAY <<< "$FILES"
C=(docker compose --ansi never -p app --project-directory "$APP" --env-file "$APP/.env.deploy")
for f in "${FILE_ARRAY[@]}"; do [[ $f == "$APP/"* && -f $f ]] || stop 'Fichier Compose inattendu.'; C+=(-f "$f"); done
"${C[@]}" config --format json > "$RUN/compose-resolu.json" 2> "$RUN/compose-validation.log"
curl -fsS --connect-timeout 10 --max-time 40 'https://api.github.com/repos/RachEma-ux/Fadi/actions/runs?head_sha=5cf61d1fed9ed523b331228af20bce93a4f2bf63&per_page=100' > "$RUN/ci.json"
python3 - "$RUN/ci.json" "$TARGET" <<'PY'
import json, sys
j=json.load(open(sys.argv[1])); runs=j.get('workflow_runs',[])
need={'CI','Continuité de développement','Fadi — isolation des autres applications'}
assert runs and j['total_count']==len(runs), 'Liste CI incomplete'
assert need <= {r['name'] for r in runs}, 'Workflow attendu absent'
assert all(r['head_sha']==sys.argv[2] and r['status']=='completed' and r['conclusion']=='success' for r in runs), 'CI non verte'
PY
log '2/7 Extraction du SHA approuve et controle du schema de l image active.'
g fetch --no-tags https://github.com/RachEma-ux/Fadi.git main > "$RUN/git.log" 2>&1
g cat-file -e "$TARGET^{commit}"
g merge-base --is-ancestor "$TARGET" FETCH_HEAD || stop 'La cible ne fait plus partie de main.'
g archive "$TARGET" | tar -xf - -C "$RUN/source"
docker cp app-app-1:/app/apps/api/dist/db/init.sql "$RUN/schema-actif.sql" > /dev/null 2>&1
python3 - "$RUN/schema-actif.sql" "$RUN/source/apps/api/src/db/init.sql" <<'PY'
import pathlib, sys
def normalized(p):
    return [s.rstrip() for s in pathlib.Path(p).read_text().splitlines() if s.strip() and not s.lstrip().startswith('--')]
assert normalized(sys.argv[1])==normalized(sys.argv[2]), 'Schema different : migration non autorisee par ce script'
PY
# La procedure ne met a jour aucun script monte dans backup, ni la configuration du proxy.
g diff --quiet "$OLD_GIT" "$TARGET" -- Dockerfile docker-compose.yml scripts/backup.sh scripts/restore.sh apps/api/src/server.ts apps/api/src/db/bascule.ts || stop 'Evolution d exploitation non prevue.'
log '3/7 Conservation de l image de retour et construction sans arret de Fadi.'
OLD_TAG="fadi-app:retour-$STAMP"
NEW_TAG="fadi-app:pr148-$STAMP"
docker tag "$OLD_IMAGE" "$OLD_TAG"
FREE_KB=$(df -Pk "$BASE" | awk 'END {print $4}')
(( FREE_KB >= 6291456 )) || stop 'Moins de 6 Gio libres dans /mnt/data.'
docker image save -o "$RUN/image-retour.tar" "$OLD_TAG" > "$RUN/image-retour.log" 2>&1
timeout 1800 docker build --label "org.opencontainers.image.revision=$TARGET" -t "$NEW_TAG" "$RUN/source" > "$RUN/construction.log" 2>&1
NEW_IMAGE=$(docker image inspect -f '{{.Id}}' "$NEW_TAG")
python3 - "$RUN" "$OLD_IMAGE" "$NEW_IMAGE" <<'PY'
import copy, json, pathlib, sys
p=pathlib.Path(sys.argv[1]); cfg=json.loads((p/'compose-resolu.json').read_text()); old=json.loads((p/'app-avant.json').read_text())[0]
s=cfg['services']['app']; env=dict(x.split('=',1) for x in old['Config']['Env'])
assert cfg.get('name')=='app', 'Nom du projet incoherent'
assert not old.get('Mounts') and not s.get('volumes'), 'Montage applicatif a examiner'
assert not any(s.get(k) for k in ('post_start','pre_stop','entrypoint','command')), 'Commande ou hook non prevu'
assert all(str(v)==env.get(k) for k,v in s.get('environment',{}).items()), 'Configuration differente du conteneur actif'
assert env.get('WEB_ORIGIN','').rstrip('/') in ('https://www.fadimmo.com','https://fadimmo.com'), 'Origine applicative inattendue'
# JSON est aussi un document YAML. Echapper $ pour ne pas reinterpoler les secrets.
def escape(x):
    if isinstance(x,str): return x.replace('$','$$')
    if isinstance(x,list): return [escape(v) for v in x]
    if isinstance(x,dict): return {k:escape(v) for k,v in x.items()}
    return x
for filename,image in [('retour.json',sys.argv[2]),('production.json',sys.argv[3])]:
    c=copy.deepcopy(cfg); a=c['services']['app']; a.pop('build',None); a['image']=image
    a.setdefault('environment',{})['MIGRATE_ON_START']='0'
    (p/filename).write_text(json.dumps(escape(c),indent=2)+'\n')
PY
# Verifier les deux configurations avant toute bascule. Elles restent privees.
dc "$RUN/production.json" config --quiet > "$RUN/production-config.log" 2>&1
dc "$RUN/retour.json" config --quiet > "$RUN/retour-config.log" 2>&1
log '4/7 Point de sauvegarde local complementaire, sans rotation ni suppression.'
docker exec app-db-1 pg_dump -U fadi -d fadi --format=custom --lock-wait-timeout=10000 > "$RUN/avant-deploiement.dump.part" 2> "$RUN/dump.log"
mv "$RUN/avant-deploiement.dump.part" "$RUN/avant-deploiement.dump"
docker exec -i app-backup-1 pg_restore --list < "$RUN/avant-deploiement.dump" > "$RUN/dump-catalogue.txt"
sha256sum "$RUN/avant-deploiement.dump" "$RUN/image-retour.tar" > "$RUN/empreintes.sha256"
printf 'AncienGit=%s\nAncienneImage=%s\nCibleGit=%s\nNouvelleImage=%s\n' "$OLD_GIT" "$OLD_IMAGE" "$TARGET" "$NEW_IMAGE" > "$RUN/versions.txt"
[[ $(docker inspect -f '{{.Image}}' app-app-1) == "$OLD_IMAGE" ]] || stop 'Le conteneur a change pendant la preparation.'
[[ -z $(g status --porcelain) && $(g rev-parse HEAD) == "$OLD_GIT" ]] || stop 'Le depot local a change pendant la preparation.'
log '5/7 Bascule de app uniquement ; migrations desactivees pour cette version.'
SWITCHED=1
dc "$RUN/production.json" up -d --no-deps --no-build --pull never --wait --wait-timeout 180 app > "$RUN/bascule.log" 2>&1
for attempt in 1 2 3 4 5 6; do if healthy "$NEW_IMAGE"; then break; fi; sleep 5; done
healthy "$NEW_IMAGE" || stop 'Sonde de la nouvelle application en echec.'
log '6/7 Verification HTTPS, accueil et maintien des autres conteneurs.'
for path in / /accueil; do
  CODE=$(curl -sS --connect-timeout 5 --max-time 20 -o /dev/null -w '%{http_code}' "$URL$path")
  [[ $CODE == 200 ]] || stop "Reponse HTTP inattendue sur $path : $CODE"
done
CODE=$(curl -sS --connect-timeout 5 --max-time 20 -H 'Accept: application/json' -o /dev/null -w '%{http_code}' "$URL/projects")
[[ $CODE == 401 ]] || stop 'La verification du controle d acces /projects a echoue.'
for name in app-db-1 app-proxy-1 app-backup-1; do docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}}' "$name"; done > "$RUN/services-apres.txt"
cmp "$RUN/services-avant.txt" "$RUN/services-apres.txt" || stop 'Un autre service a change pendant la bascule.'
log '7/7 Enregistrement de la version et synchronisation du depot local.'
# Le tag historique est maintenu pour les commandes Compose habituelles, l image de retour reste distincte.
docker tag "$NEW_IMAGE" app-app:latest
if g merge --ff-only "$TARGET" > "$RUN/git-synchronisation.log" 2>&1; then GIT_STATUS=synchronise; else GIT_STATUS=a_verifier; fi
SWITCHED=0
printf 'FADI_DEPLOIEMENT_OK_TECHNIQUE\nSHA=%s\nImage=%s\nDepotLocal=%s\nDossier=%s\nRetourCompose=%s/retour.json\nRecette utilisateur et sauvegarde post-validation : en attente.\n' "$TARGET" "$NEW_IMAGE" "$GIT_STATUS" "$RUN" "$RUN" > "$REPORT"
cat "$REPORT"
