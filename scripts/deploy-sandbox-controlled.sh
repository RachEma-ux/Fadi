#!/usr/bin/env bash
# Fadi — deploiement borne au SHA de main qui livre le Sandbox (lots 1 a 6, PR #213 a #222), avec une seule
# migration autorisee : la table additive sandbox_tool_preferences (lot 5). Variante de deploy-pr148-controlled.sh.
# Usage : sudo bash deploy-sandbox-controlled.sh --deploy --depuis <SHA actuellement en production>
# Secrets/journaux/configurations restent sur le serveur dans un dossier root 0700.
#
# Difference avec deploy-pr148-controlled.sh :
#  - la version de depart n'est pas figee : elle est donnee par --depuis, doit etre le HEAD du depot local et un
#    ancetre de la cible ;
#  - le schema de la cible doit etre celui de l'image active plus le bloc MIGRATION_SANDBOX ci-dessous, mot pour mot,
#    et rien d'autre ; toute autre difference arrete le script avant la bascule ;
#  - ce bloc (CREATE TABLE IF NOT EXISTS + contraintes NOT VALID, idempotent) est applique seul, apres le point de
#    sauvegarde et avant la bascule ; l'application demarre ensuite avec MIGRATE_ON_START=0. L'ancienne image ignore la
#    table : le retour a l'image precedente reste compatible, sans restaurer la base ;
#  - controles apres bascule : /sandbox repond 200 et /sandbox/preferences 401 (route livree, reservee au compte).
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export GIT_TERMINAL_PROMPT=0
TARGET=78e9f4a89e9634189c3bd4fb9ed82576eafe2a64
APP=/mnt/data/fadi/app
BASE=/mnt/data/fadi/deployments
URL=https://www.fadimmo.com
SWITCHED=0
RUN=''
# Seule migration autorisee : copie exacte de apps/api/src/db/init.sql (lot 5). Le test
# scripts/deploy-sandbox-controlled.test.mjs verifie qu'elle y figure mot pour mot.
read -r -d '' MIGRATION_SANDBOX <<'SQL' || true
CREATE TABLE IF NOT EXISTS sandbox_tool_preferences (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile text NOT NULL DEFAULT 'standard',
  left_bar jsonb NOT NULL DEFAULT '[]'::jsonb,
  favorites jsonb NOT NULL DEFAULT '[]'::jsonb,
  groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  format text NOT NULL DEFAULT 'sandbox-preferences/1',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sandbox_tool_preferences DROP CONSTRAINT IF EXISTS sandbox_tool_preferences_profile_check,
  ADD CONSTRAINT sandbox_tool_preferences_profile_check
  CHECK (profile ~ '^(standard|personnel|metier:[a-z0-9-]{1,40})$') NOT VALID;
ALTER TABLE sandbox_tool_preferences DROP CONSTRAINT IF EXISTS sandbox_tool_preferences_lists_check,
  ADD CONSTRAINT sandbox_tool_preferences_lists_check
  CHECK (jsonb_typeof(left_bar) = 'array' AND jsonb_typeof(favorites) = 'array' AND jsonb_typeof(groups) = 'array'
    AND jsonb_array_length(groups) <= 20) NOT VALID;
SQL
[[ ${1:-} == --deploy && ${2:-} == --depuis && ${3:-} =~ ^[0-9a-f]{40}$ && $EUID == 0 ]] || { echo 'Utilisation : sudo bash ce-script.sh --deploy --depuis <SHA complet en production>'; exit 2; }
EXPECTED=$3
[[ -d /run/systemd/system && -d "$APP/.git" ]] || { echo 'ARRET : executer sur Fadi-Serv, pas dans Termux local.'; exit 2; }
for cmd in docker git curl python3 flock runuser sha256sum tar timeout cmp; do command -v "$cmd" >/dev/null || { echo "Commande absente : $cmd"; exit 2; }; done
mkdir -p "$BASE"
chmod 700 "$BASE"
exec 9>"$BASE/deploiement.lock"
flock -n 9 || { echo 'ARRET : un deploiement est deja en cours.'; exit 2; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
RUN="$BASE/$STAMP"
mkdir -m 700 "$RUN" "$RUN/source"
REPORT="$BASE/sandbox-resultat.txt"
printf 'EN_COURS\nCible=%s\nDossier=%s\n' "$TARGET" "$RUN" > "$REPORT"
printf '%s\n' "$MIGRATION_SANDBOX" > "$RUN/migration-sandbox.sql"
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
      log 'Controle en echec : tentative de retour a l image precedente, sans restaurer la base (table sandbox additive conservee).'
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
log '1/8 Verification de la configuration existante et des tests GitHub.'
[[ -r "$APP/.env.deploy" ]] || stop '.env.deploy absent.'
[[ -z $(g status --porcelain) ]] || stop 'Le depot local contient des modifications ; aucun ecrasement.'
OLD_GIT=$(g rev-parse HEAD)
[[ $OLD_GIT == "$EXPECTED" ]] || stop "Version locale $OLD_GIT differente de --depuis $EXPECTED."
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
curl -fsS --connect-timeout 10 --max-time 40 "https://api.github.com/repos/RachEma-ux/Fadi/actions/runs?head_sha=$TARGET&per_page=100" > "$RUN/ci.json"
python3 - "$RUN/ci.json" "$TARGET" <<'PY'
import json, sys
j=json.load(open(sys.argv[1])); runs=j.get('workflow_runs',[])
need={'CI','Continuité de développement','Fadi — isolation des autres applications'}
assert runs and j['total_count']==len(runs), 'Liste CI incomplete'
assert need <= {r['name'] for r in runs}, 'Workflow attendu absent'
assert all(r['head_sha']==sys.argv[2] and r['status']=='completed' and r['conclusion']=='success' for r in runs), 'CI non verte'
PY
log '2/8 Extraction du SHA approuve et controle du schema : seule la table sandbox_tool_preferences est admise.'
g fetch --no-tags https://github.com/RachEma-ux/Fadi.git main > "$RUN/git.log" 2>&1
g cat-file -e "$TARGET^{commit}"
g merge-base --is-ancestor "$TARGET" FETCH_HEAD || stop 'La cible ne fait plus partie de main.'
g merge-base --is-ancestor "$OLD_GIT" "$TARGET" || stop 'La version en production n est pas un ancetre de la cible.'
g archive "$TARGET" | tar -xf - -C "$RUN/source"
docker cp app-app-1:/app/apps/api/dist/db/init.sql "$RUN/schema-actif.sql" > /dev/null 2>&1
python3 - "$RUN/schema-actif.sql" "$RUN/source/apps/api/src/db/init.sql" "$RUN/migration-sandbox.sql" > "$RUN/schema-controle.txt" <<'PY'
import pathlib, sys
def normalized(p):
    return [s.rstrip() for s in pathlib.Path(p).read_text().splitlines() if s.strip() and not s.lstrip().startswith('--')]
actif, cible, bloc = (normalized(p) for p in sys.argv[1:4])
assert bloc, 'Bloc de migration vide'
debuts = [i for i in range(len(cible) - len(bloc) + 1) if cible[i:i + len(bloc)] == bloc]
assert len(debuts) == 1, 'Bloc sandbox_tool_preferences absent ou en double dans le schema cible'
reste = cible[:debuts[0]] + cible[debuts[0] + len(bloc):]
if actif == cible:
    print('SCHEMA_DEJA_A_JOUR')
else:
    assert reste == actif, 'Schema different au-dela de la table sandbox_tool_preferences : migration non autorisee par ce script'
    print('SCHEMA_PLUS_TABLE_SANDBOX')
PY
# La procedure ne met a jour aucun script monte dans backup, ni la configuration du proxy.
g diff --quiet "$OLD_GIT" "$TARGET" -- Dockerfile docker-compose.yml scripts/backup.sh scripts/restore.sh apps/api/src/server.ts apps/api/src/db/bascule.ts || stop 'Evolution d exploitation non prevue.'
log '3/8 Conservation de l image de retour et construction sans arret de Fadi.'
OLD_TAG="fadi-app:retour-$STAMP"
NEW_TAG="fadi-app:sandbox-$STAMP"
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
log '4/8 Point de sauvegarde local complementaire, sans rotation ni suppression.'
docker exec app-db-1 pg_dump -U fadi -d fadi --format=custom --lock-wait-timeout=10000 > "$RUN/avant-deploiement.dump.part" 2> "$RUN/dump.log"
mv "$RUN/avant-deploiement.dump.part" "$RUN/avant-deploiement.dump"
docker exec -i app-backup-1 pg_restore --list < "$RUN/avant-deploiement.dump" > "$RUN/dump-catalogue.txt"
sha256sum "$RUN/avant-deploiement.dump" "$RUN/image-retour.tar" "$RUN/migration-sandbox.sql" > "$RUN/empreintes.sha256"
printf 'AncienGit=%s\nAncienneImage=%s\nCibleGit=%s\nNouvelleImage=%s\n' "$OLD_GIT" "$OLD_IMAGE" "$TARGET" "$NEW_IMAGE" > "$RUN/versions.txt"
[[ $(docker inspect -f '{{.Image}}' app-app-1) == "$OLD_IMAGE" ]] || stop 'Le conteneur a change pendant la preparation.'
[[ -z $(g status --porcelain) && $(g rev-parse HEAD) == "$OLD_GIT" ]] || stop 'Le depot local a change pendant la preparation.'
log '5/8 Migration autorisee seule : table sandbox_tool_preferences (additive, idempotente), dans une transaction.'
docker exec -i app-db-1 psql -U fadi -d fadi -v ON_ERROR_STOP=1 --single-transaction < "$RUN/migration-sandbox.sql" > "$RUN/migration.log" 2>&1 || stop 'Migration sandbox_tool_preferences en echec (transaction annulee, application inchangee).'
docker exec app-db-1 psql -U fadi -d fadi -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_name = 'sandbox_tool_preferences'" > "$RUN/migration-controle.txt"
[[ $(tr -d '[:space:]' < "$RUN/migration-controle.txt") == 1 ]] || stop 'Table sandbox_tool_preferences introuvable apres la migration.'
healthy "$OLD_IMAGE" || stop 'La production de depart ne passe plus les controles de sante apres la migration.'
log '6/8 Bascule de app uniquement ; migrations au demarrage desactivees.'
SWITCHED=1
dc "$RUN/production.json" up -d --no-deps --no-build --pull never --wait --wait-timeout 180 app > "$RUN/bascule.log" 2>&1
for attempt in 1 2 3 4 5 6; do if healthy "$NEW_IMAGE"; then break; fi; sleep 5; done
healthy "$NEW_IMAGE" || stop 'Sonde de la nouvelle application en echec.'
log '7/8 Verification HTTPS, accueil, Sandbox et maintien des autres conteneurs.'
for path in / /accueil /sandbox; do
  CODE=$(curl -sS --connect-timeout 5 --max-time 20 -o /dev/null -w '%{http_code}' "$URL$path")
  [[ $CODE == 200 ]] || stop "Reponse HTTP inattendue sur $path : $CODE"
done
for path in /projects /sandbox/preferences; do
  CODE=$(curl -sS --connect-timeout 5 --max-time 20 -H 'Accept: application/json' -o /dev/null -w '%{http_code}' "$URL$path")
  [[ $CODE == 401 ]] || stop "La verification du controle d acces $path a echoue : $CODE"
done
for name in app-db-1 app-proxy-1 app-backup-1; do docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}}' "$name"; done > "$RUN/services-apres.txt"
cmp "$RUN/services-avant.txt" "$RUN/services-apres.txt" || stop 'Un autre service a change pendant la bascule.'
log '8/8 Enregistrement de la version et synchronisation du depot local.'
# Le tag historique est maintenu pour les commandes Compose habituelles, l image de retour reste distincte.
docker tag "$NEW_IMAGE" app-app:latest
if g merge --ff-only "$TARGET" > "$RUN/git-synchronisation.log" 2>&1; then GIT_STATUS=synchronise; else GIT_STATUS=a_verifier; fi
SWITCHED=0
printf 'FADI_DEPLOIEMENT_OK_TECHNIQUE\nSHA=%s\nImage=%s\nSchema=%s\nDepotLocal=%s\nDossier=%s\nRetourCompose=%s/retour.json\nRecette utilisateur et sauvegarde post-validation : en attente.\n' "$TARGET" "$NEW_IMAGE" "$(cat "$RUN/schema-controle.txt")" "$GIT_STATUS" "$RUN" "$RUN" > "$REPORT"
cat "$REPORT"
