#!/usr/bin/env python3
"""Run the authorized Studio recipe against an attested disposable profile only."""
import argparse
import json
import os
import signal
import socket
import stat
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from studio_profile_guard import validate_database_url

ROOT = Path(__file__).resolve().parents[2]
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
SAFE_ENV = {
    key: value for key, value in os.environ.items()
    if not key.startswith(('PG', 'DOCKER_'))
    and key not in {'DATABASE_URL', 'TEST_DATABASE_URL', 'NODE_ENV', 'VITEST'}
}


def checked(args, *, input=None, label='validation command'):
    result = subprocess.run(
        args, env=SAFE_ENV, input=input, text=True,
        capture_output=True, timeout=180,
    )
    if result.returncode:
        raise RuntimeError(f'{label} failed (exit {result.returncode}); sensitive output suppressed')
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', type=Path, help='Existing protected manifest; never creates another database')
    parser.add_argument('--keep-running', action='store_true', help='Keep only this recipe API/Vite alive after success for a local demo')
    args = parser.parse_args()
    for port in (3001, 5173):
        with socket.socket() as sock:
            # Match Node's listener semantics: closed connections in TIME_WAIT
            # are safe to reuse, while an actual listener still refuses the bind.
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('127.0.0.1', port))

    path = args.profile.resolve() if args.profile else Path(checked(
        [sys.executable, str(ROOT / 'scripts/validation/studio-v1-profile.py')],
        label='new disposable profile provisioning',
    ))
    apply_script = ROOT / 'scripts/validation/studio-v1-apply.py'

    def preflight():
        checked([sys.executable, str(apply_script), str(path)], label='disposable identity preflight')

    preflight()
    manifest = json.loads(path.read_text())
    checked([
        sys.executable, str(apply_script), str(path),
        str(ROOT / 'apps/api/src/db/studio-v1.sql'),
    ], label='pinned additive Studio schema verification/application')
    manifest = json.loads(path.read_text())
    run = manifest['runId']
    env = dict(SAFE_ENV)
    allowed = {'DATABASE_URL', 'NODE_ENV', 'MIGRATE_ON_START', 'PORT', 'WEB_ORIGIN', 'HOST'}
    for line in Path(manifest['runtimeEnvFile']).read_text().splitlines():
        key, value = line.split('=', 1)
        if key in allowed:
            env[key] = value
    env.update(NODE_ENV='development', MIGRATE_ON_START='0', HOST='127.0.0.1')
    env['STUDIO_TEST_PROFILE'] = str(path.parent / 'test-profile.json')
    env['STUDIO_PROOF_DIR'] = str(ROOT / 'work/studio-v1-proof')
    Path(env['STUDIO_PROOF_DIR']).mkdir(parents=True, exist_ok=True, mode=0o700)
    if Path('/usr/bin/chromium').exists() and os.environ.get('CI') != 'true':
        env['CHROMIUM_PATH'] = '/usr/bin/chromium'

    processes = []
    logs = []
    success = False

    def launch(command, log_name):
        log = (path.parent / log_name).open('a')
        os.chmod(path.parent / log_name, 0o600)
        logs.append(log)
        process = subprocess.Popen(
            command, cwd=ROOT, env=env, stdout=log, stderr=log,
            start_new_session=True,
        )
        processes.append(process)
        return process

    def start_api():
        current_manifest = json.loads(path.read_text())
        runtime_file = Path(current_manifest['runtimeEnvFile'])
        if runtime_file.is_symlink() or stat.S_IMODE(runtime_file.stat().st_mode) != 0o600:
            raise RuntimeError('Disposable runtime file permissions refused')
        values = {}
        for line in runtime_file.read_text().splitlines():
            key, value = line.split('=', 1)
            if key in values:
                raise RuntimeError('Duplicate runtime setting refused')
            values[key] = value
        env['DATABASE_URL'] = validate_database_url(values.get('DATABASE_URL'), current_manifest)
        preflight()  # Recheck labels, image, volume, marker and role before EVERY launch.
        return launch(['node', 'apps/api/dist/server.js'], 'api.log')

    def ready(url, label):
        for _ in range(60):
            try:
                with urllib.request.urlopen(url, timeout=2) as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(1)
        raise RuntimeError(f'{label} did not become healthy; inspect protected local log')

    def stop(process):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=15)

    try:
        api = start_api()
        web = launch([
            'npm', 'run', 'dev', '--workspace=@fadi/web', '--',
            '--host', '127.0.0.1', '--port', '5173', '--strictPort',
        ], 'vite.log')
        ready('http://127.0.0.1:3001/health', 'API')
        ready('http://127.0.0.1:5173/', 'Vite')
        for phase in ('initial', 'reopen'):
            if phase == 'reopen':
                stop(api)
                preflight()
                checked(DOCKER + ['restart', manifest['container']], label='own disposable database restart')
                for attempt in range(45):
                    try:
                        checked(DOCKER + [
                            'exec', manifest['container'], 'pg_isready',
                            '-U', 'postgres', '-d', manifest['database'],
                        ], label='own database readiness')
                        break
                    except RuntimeError:
                        if attempt == 44:
                            raise
                        time.sleep(1)
                checked([
                    sys.executable, str(apply_script), str(path), '--reattest-own-restart',
                ], label='same-resource post-restart endpoint attestation')
                manifest = json.loads(path.read_text())
                for line in Path(manifest['runtimeEnvFile']).read_text().splitlines():
                    key, value = line.split('=', 1)
                    if key in allowed:
                        env[key] = value
                api = start_api()
                ready('http://127.0.0.1:3001/health', 'restarted API')
            recipe = subprocess.run(
                ['node', 'apps/web/e2e/studio-v1.mjs'], cwd=ROOT,
                env={**env, 'PHASE': phase}, text=True,
                capture_output=True, timeout=240,
            )
            private_log = path.parent / f'{phase}.log'
            private_log.write_text(recipe.stdout + recipe.stderr)
            os.chmod(private_log, 0o600)
            if recipe.returncode:
                raise RuntimeError(f'Studio {phase} recipe failed (exit {recipe.returncode}); inspect protected {private_log.name}')
        seam = subprocess.run(
            ['node', 'apps/web/e2e/studio-v1-smoke.mjs'], cwd=ROOT,
            env=env, text=True, capture_output=True, timeout=180,
        )
        seam_log = path.parent / 'seam.log'
        seam_log.write_text(seam.stdout + seam.stderr)
        os.chmod(seam_log, 0o600)
        if seam.returncode:
            raise RuntimeError('Existing Parcours/Atelier navigation failed; inspect protected seam.log')
        success = True
        if args.keep_running:
            private_pids = path.parent / 'demo-processes.json'
            private_pids.write_text(json.dumps({'runId': run, 'apiPid': api.pid, 'vitePid': web.pid}) + '\n')
            os.chmod(private_pids, 0o600)
    finally:
        if not (success and args.keep_running):
            for process in processes:
                try:
                    stop(process)
                except Exception:
                    pass
        for log in logs:
            log.close()
    print('Studio initial/reopen completed; own disposable database retained.' +
          (' Local API/Vite retained for demo.' if args.keep_running else ' API/Vite stopped.'))


if __name__ == '__main__':
    main()
