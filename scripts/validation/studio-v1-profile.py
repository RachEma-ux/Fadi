#!/usr/bin/env python3
"""Provision only a NEW, labelled, local Studio validation database. Never touches existing resources."""
import json,os,secrets,subprocess,time,hashlib,socket
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ENV={k:v for k,v in os.environ.items() if not k.startswith(('DOCKER_','PG'))}
D=['docker','--host=unix:///var/run/docker.sock']
def docker(*args,input=None):
 r=subprocess.run(D+list(args),env=ENV,input=input,text=True,capture_output=True,timeout=120)
 if r.returncode:raise RuntimeError('Docker operation refused/failed; sensitive output suppressed')
 return r.stdout.strip()
def main():
 run=secrets.token_hex(6);name='fadi-studio-v1-'+run;db='fadi_studio_v1_'+run;role='studio_app';state=Path(os.environ.get('STUDIO_PROFILE_ROOT',str(ROOT.parent/'studio-v1-private')))/run;state.mkdir(parents=True,mode=0o700);os.chmod(state,0o700)
 secret=secrets.token_hex(24);appsecret=secrets.token_hex(24);envfile=state/'bootstrap.env';envfile.write_text('POSTGRES_PASSWORD='+secret+'\nPOSTGRES_DB='+db+'\n');os.chmod(envfile,0o600)
 image='postgis/postgis:16-3.4';vol=name+'-data'
 # Random, exclusive resource identifiers; refuse collision before creation.
 if docker('ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}'):raise RuntimeError('Resource exists')
 if docker('volume','ls','--filter','name=^'+vol+'$','--format','{{.Name}}'):raise RuntimeError('Volume exists')
 docker('volume','create','--label','fadi.programme=156','--label','fadi.validation=studio-v1','--label','fadi.run='+run,vol)
 with socket.socket() as reservation:
  reservation.bind(('127.0.0.1',0)); fixed_port=reservation.getsockname()[1]
 docker('run','-d','--name',name,'--label','fadi.programme=156','--label','fadi.validation=studio-v1','--label','fadi.run='+run,'--env-file',str(envfile),'-p','127.0.0.1:'+str(fixed_port)+':5432','-v',vol+':/var/lib/postgresql/data',image)
 for _ in range(45):
  try:docker('exec',name,'pg_isready','-U','postgres','-d',db);break
  except RuntimeError:time.sleep(1)
 else:raise RuntimeError('New database did not become ready')
 info=json.loads(docker('inspect',name))[0];binding=info['NetworkSettings']['Ports']['5432/tcp'];assert len(binding)==1 and binding[0]['HostIp']=='127.0.0.1';port=int(binding[0]['HostPort']);assert info['Config']['Labels']['fadi.run']==run and info['Config']['Labels']['fadi.programme']=='156' and info['Config']['Labels']['fadi.validation']=='studio-v1'; assert any(m.get('Name')==vol and m['Destination']=='/var/lib/postgresql/data' for m in info['Mounts'])
 def sql(text):return docker('exec','-i',name,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-At',input=text)
 assert sql("SELECT current_database();")==db
 assert sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';")=='0'
 # Owner is distinct from runtime app role; bootstrap superuser remains container-local.
 sql("CREATE ROLE studio_owner NOLOGIN; CREATE ROLE studio_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+appsecret+"';")
 init=(ROOT/'apps/api/src/db/init.sql').read_text()
 # No legacy migration/bascule code is called. SQL statement starts reviewed and constrained.
 import re
 init=re.sub(r"^UPDATE projects SET example_mode = 'reference' WHERE source_example_id IS NOT NULL AND example_mode IS NULL;\n",'',init,flags=re.M)
 sqltext=re.sub(r'--[^\n]*','',init)
 starts=[z.strip().split(None,1)[0].upper() for z in sqltext.split(';') if z.strip()]
 assert set(starts)<= {'CREATE','ALTER'},set(starts)
 sql("CREATE SCHEMA studio_validation AUTHORIZATION studio_owner; CREATE TABLE studio_validation.identity(run_id text PRIMARY KEY); INSERT INTO studio_validation.identity VALUES ('"+run+"');")
 assert sql('SELECT run_id FROM studio_validation.identity;')==run
 sql('CREATE EXTENSION IF NOT EXISTS postgis; GRANT USAGE,CREATE ON SCHEMA public TO studio_owner; SET ROLE studio_owner; '+init+' RESET ROLE;')
 sql('GRANT USAGE ON SCHEMA public TO studio_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO studio_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO studio_app; ALTER DEFAULT PRIVILEGES FOR ROLE studio_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO studio_app;')
 identity=sql("SELECT current_database(),current_setting('server_version_num'),postgis_lib_version(),(SELECT rolsuper FROM pg_roles WHERE rolname='studio_app');");assert identity.split('|')[-1]=='f'
 dsn='postgresql://'+role+':'+appsecret+'@127.0.0.1:'+str(port)+'/'+db
 runtime=state/'runtime.env';runtime.write_text('DATABASE_URL='+dsn+'\nNODE_ENV=development\nMIGRATE_ON_START=0\nPORT=3001\nWEB_ORIGIN=http://127.0.0.1:5173\n');os.chmod(runtime,0o600)
 manifest={'runId':run,'container':name,'volume':vol,'database':db,'role':role,'host':'127.0.0.1','port':port,'image':image,'imageId':info['Image'],'commitSha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'identity':identity,'runtimeEnvFile':str(runtime),'bootstrapInitSha256':hashlib.sha256(init.encode()).hexdigest(),'studioSchemaApplied':False,'guardStatus':'DB1/2 trust registry empty: Vitest real DB intentionally refused; profile provisioner independently checks new container/base/role. Not DB3.','retainedForDemo':True}
 profile={'kind':'fadi-studio-v1-disposable','runId':run,'expiresAt':int(time.time()*1000)+24*3600*1000,'uiBaseUrl':'http://127.0.0.1:5173','apiBaseUrl':'http://127.0.0.1:3001','disposable':True,'production':False,'testDatabaseSafe':True,'databaseName':db,'attestedBy':'A6','evidencePath':str(state/'manifest.json')}; (state/'test-profile.json').write_text(json.dumps(profile,indent=2)+'\n'); os.chmod(state/'test-profile.json',0o600)
 (state/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');os.chmod(state/'manifest.json',0o600);print(str(state/'manifest.json'))
if __name__=='__main__':main()
