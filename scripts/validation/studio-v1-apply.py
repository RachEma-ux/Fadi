#!/usr/bin/env python3
"""Preflight existing own disposable profile; optional additive Studio schema only."""
import json,os,stat,subprocess,sys,re,hashlib
from pathlib import Path
def main():
 reattest='--reattest-own-restart' in sys.argv; args=[a for a in sys.argv[1:] if a!='--reattest-own-restart']; manifest=Path(args[0]);assert stat.S_IMODE(manifest.stat().st_mode)==0o600
 m=json.loads(manifest.read_text());run=m['runId'];assert re.fullmatch('[a-f0-9]{12}',run)
 assert m['container']=='fadi-studio-v1-'+run and m['database']=='fadi_studio_v1_'+run and m['volume']==m['container']+'-data' and m['host']=='127.0.0.1' and m['role']=='studio_app'
 env={k:v for k,v in os.environ.items() if not k.startswith(('DOCKER_','PG'))}
 def docker(*a,input=None):
  r=subprocess.run(['docker','--host=unix:///var/run/docker.sock',*a],env=env,input=input,text=True,capture_output=True,timeout=30)
  if r.returncode:raise RuntimeError('Disposable profile operation refused; sensitive output suppressed')
  return r.stdout.strip()
 info=json.loads(docker('inspect',m['container']))[0];labels=info['Config']['Labels'];assert labels['fadi.run']==run and labels['fadi.validation']=='studio-v1' and labels['fadi.programme']=='156';assert info['Image']==m['imageId'];bindings=info['NetworkSettings']['Ports']['5432/tcp']; assert len(bindings)==1 and bindings[0]['HostIp']=='127.0.0.1'; actual_port=int(bindings[0]['HostPort']); assert reattest or actual_port==m['port'];assert any(x.get('Name')==m['volume'] for x in info['Mounts'])
 def sql(s):return docker('exec','-i',m['container'],'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',m['database'],'-At',input=s)
 assert sql('SELECT current_database();')==m['database'];assert sql('SELECT run_id FROM studio_validation.identity;')==run;assert sql("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication FROM pg_roles WHERE rolname='studio_app';")=='f'
 if reattest:
  # Only caller's just-restarted, otherwise-identical resource may update its NAT endpoint.
  from urllib.parse import urlsplit, urlunsplit
  envpath=Path(m['runtimeEnvFile']); assert stat.S_IMODE(envpath.stat().st_mode)==0o600
  lines=[]
  for line in envpath.read_text().splitlines():
   key,value=line.split('=',1)
   if key=='DATABASE_URL':
    target=urlsplit(value); assert target.hostname=='127.0.0.1' and target.port==m['port'] and target.path=='/'+m['database'] and target.username==m['role'] and not target.query and not target.fragment
    value=urlunsplit((target.scheme,target.netloc.rsplit(':',1)[0]+':'+str(actual_port),target.path,'',''))
   lines.append(key+'='+value)
  envpath.write_text('\n'.join(lines)+'\n'); os.chmod(envpath,0o600)
  m['port']=actual_port; manifest.write_text(json.dumps(m,indent=2)+'\n')
 if len(args)>1:
  schema=Path(args[1]);text=schema.read_text();assert hashlib.sha256(schema.read_bytes()).hexdigest()=='67653e6b33a2b4312bd1a4d4f658105a46601ff26f5b70f0a30eabe5094717e0', 'Unreviewed Studio SQL refused'
  digest=hashlib.sha256(text.encode()).hexdigest()
  if m.get('studioSchemaApplied'):
   assert m.get('studioSchemaSha256')==digest, 'Applied Studio schema hash mismatch'
   assert sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('studio_studies','studio_variants','studio_revisions');")=='3'
  else:
   sql('SET ROLE studio_owner; '+text+' RESET ROLE; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO studio_app;');m['studioSchemaApplied']=True;m['studioSchemaSha256']=digest;manifest.write_text(json.dumps(m,indent=2)+'\n')
 print('Disposable identity, labels, loopback, marker and non-superuser role verified; '+('Studio schema pinned hash verified (applied only if absent).' if len(args)>1 else 'no schema mutation.'))
if __name__=='__main__':main()
