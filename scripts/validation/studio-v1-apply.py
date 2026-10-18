#!/usr/bin/env python3
"""Preflight existing own disposable profile; optional additive Studio schema only."""
import json,os,stat,subprocess,sys,re,hashlib
from pathlib import Path
def main():
 manifest=Path(sys.argv[1]);assert stat.S_IMODE(manifest.stat().st_mode)==0o600
 m=json.loads(manifest.read_text());run=m['runId'];assert re.fullmatch('[a-f0-9]{12}',run)
 assert m['container']=='fadi-studio-v1-'+run and m['database']=='fadi_studio_v1_'+run and m['volume']==m['container']+'-data' and m['host']=='127.0.0.1' and m['role']=='studio_app'
 env={k:v for k,v in os.environ.items() if not k.startswith(('DOCKER_','PG'))}
 def docker(*a,input=None):
  r=subprocess.run(['docker','--host=unix:///var/run/docker.sock',*a],env=env,input=input,text=True,capture_output=True,timeout=30)
  if r.returncode:raise RuntimeError('Disposable profile operation refused; sensitive output suppressed')
  return r.stdout.strip()
 info=json.loads(docker('inspect',m['container']))[0];labels=info['Config']['Labels'];assert labels['fadi.run']==run and labels['fadi.validation']=='studio-v1' and labels['fadi.programme']=='156';assert info['Image']==m['imageId'];assert info['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':str(m['port'])}];assert any(x.get('Name')==m['volume'] for x in info['Mounts'])
 def sql(s):return docker('exec','-i',m['container'],'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',m['database'],'-At',input=s)
 assert sql('SELECT current_database();')==m['database'];assert sql('SELECT run_id FROM studio_validation.identity;')==run;assert sql("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication FROM pg_roles WHERE rolname='studio_app';")=='f'
 if len(sys.argv)>2:
  schema=Path(sys.argv[2]);text=schema.read_text();assert hashlib.sha256(schema.read_bytes()).hexdigest()=='c891f5de78ba75e0f1609636862e06fc46d6271ca685f88fd103edb15d3d8fae', 'Unreviewed Studio SQL refused'
  sql('SET ROLE studio_owner; '+text+' RESET ROLE; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO studio_app;');m['studioSchemaApplied']=True;m['studioSchemaSha256']=hashlib.sha256(text.encode()).hexdigest();manifest.write_text(json.dumps(m,indent=2)+'\n')
 print('Disposable identity, labels, loopback, marker and non-superuser role verified; '+('Studio additive schema applied.' if len(sys.argv)>2 else 'no schema mutation.'))
if __name__=='__main__':main()
