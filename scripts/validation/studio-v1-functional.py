#!/usr/bin/env python3
"""CI/local disposable-only Studio browser recipe; never runs historical migrations/API suites."""
import json,os,subprocess,sys,time,signal,socket,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ENV={k:v for k,v in os.environ.items() if not k.startswith(('PG','DOCKER_')) and k not in ['DATABASE_URL','TEST_DATABASE_URL','NODE_ENV','VITEST']}
D=['docker','--host=unix:///var/run/docker.sock']
def checked(args,**kw):
 r=subprocess.run(args,env=ENV,text=True,capture_output=True,timeout=180,**kw)
 if r.returncode:raise RuntimeError('Validation command failed; raw output retained privately, not published')
 return r.stdout.strip()
def main():
 for port in [3001,5173]:
  with socket.socket() as s:s.bind(('127.0.0.1',port))
 path=Path(checked([sys.executable,str(ROOT/'scripts/validation/studio-v1-profile.py')]))
 m=json.loads(path.read_text());run=m['runId'];assert m['container']=='fadi-studio-v1-'+run and m['database']=='fadi_studio_v1_'+run and m['host']=='127.0.0.1'
 def docker(*args,input=None):return checked(D+list(args),input=input)
 def sql(text):return docker('exec','-i',m['container'],'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',m['database'],'-At',input=text)
 assert sql('SELECT run_id FROM studio_validation.identity;')==run
 schema=ROOT/'apps/api/src/db/studio-v1.sql'
 checked([sys.executable,str(ROOT/'scripts/validation/studio-v1-apply.py'),str(path),str(schema)])
 env=dict(ENV)
 for line in Path(m['runtimeEnvFile']).read_text().splitlines():
  key,value=line.split('=',1);env[key]=value
 env['HOST']='127.0.0.1'
 env['STUDIO_TEST_PROFILE']=str(path.parent/'test-profile.json');env['STUDIO_PROOF_DIR']=str(ROOT/'work/studio-v1-proof');Path(env['STUDIO_PROOF_DIR']).mkdir(parents=True,exist_ok=True,mode=0o700)
 if Path('/usr/bin/chromium').exists() and os.environ.get('CI')!='true':env['CHROMIUM_PATH']='/usr/bin/chromium'
 processes=[];logs=[]
 def start_api():
  log=(path.parent/'api.log').open('a');logs.append(log);p=subprocess.Popen(['node','apps/api/dist/server.js'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True);processes.append(p);return p
 def ready(url):
  for _ in range(60):
   try:
    with urllib.request.urlopen(url,timeout=2) as r:
     if r.status==200:return
   except Exception:time.sleep(1)
  raise RuntimeError('Local service not ready')
 def stop(p):
  if p.poll() is None:os.killpg(p.pid,signal.SIGTERM);p.wait(timeout=15)
 try:
  api=start_api();log=(path.parent/'vite.log').open('a');logs.append(log);web=subprocess.Popen(['npm','run','dev','--workspace=@fadi/web','--','--host','127.0.0.1','--port','5173','--strictPort'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True);processes.append(web)
  ready('http://127.0.0.1:3001/health');ready('http://127.0.0.1:5173/')
  for phase in ['initial','reopen']:
   if phase=='reopen':
    stop(api)
    info=json.loads(docker('inspect',m['container']))[0];assert info['Config']['Labels']['fadi.run']==run and any(x.get('Name')==m['volume'] for x in info['Mounts'])
    docker('restart',m['container'])
    for _ in range(45):
     try:docker('exec',m['container'],'pg_isready','-U','postgres','-d',m['database']);break
     except RuntimeError:time.sleep(1)
    assert sql('SELECT run_id FROM studio_validation.identity;')==run
    api=start_api();ready('http://127.0.0.1:3001/health')
   recipe=subprocess.run(['node','apps/web/e2e/studio-v1.mjs'],cwd=ROOT,env={**env,'PHASE':phase},text=True,capture_output=True,timeout=240)
   (path.parent/(phase+'.log')).write_text(recipe.stdout+recipe.stderr);os.chmod(path.parent/(phase+'.log'),0o600)
   if recipe.returncode:raise RuntimeError('Studio '+phase+' recipe failed; private log retained')
 finally:
  for p in processes:
   try:stop(p)
   except Exception:pass
  for log in logs:log.close()
 # Keep only this run's labelled database for inspection; no automatic resource deletion.
 print('Studio initial/reopen recipes completed; disposable resources retained for inspection.')
if __name__=='__main__':main()
