#!/usr/bin/env python3
"""Complète les preuves du registre Studio avec des données d'exécution RÉELLES, jamais inventées (X.5-02, G2-04).

Pour chaque preuve du registre `docs/workstreams/studio/task-register.json`, l'outil établit :

- son étiquette G2-04 (`etiquette`) : « lecture statique », « test prescrit » ou « scénario exécuté » (règle de
  `docs/ai-team/controle_preuves.py`, `etiquette_attendue`) ;
- pour un test ou une recette : la PREMIÈRE exécution verte de `main` (push, workflow GitHub Actions) où le fichier cité,
  dans sa version de ce commit, contient tous les libellés cités (règle exacte de `libelles-sources.ts`, via
  `scripts/registre/presence-libelles.ts`) ET dont l'étape qui exécute ce fichier a réussi (API GitHub : jobs et étapes
  de l'exécution). Rien n'est retenu sur la foi de la seule conclusion de l'exécution : l'étape doit être nommée et verte ;
- pour une lecture documentaire : le commit de la version lue (référence de code de la preuve, empreinte SHA-256
  retrouvée dans l'historique, extrait cité retrouvé, sinon version courante déclarée comme telle) et sa date.

Une preuve qui ne peut pas être complétée n'est pas complétée : l'outil le dit (`non_completees`), et toute tâche
« Vérifié » qui reste sans preuve conforme est proposée en descente (« Implémenté » si un test est prescrit,
« En cours » sinon), avec la raison exacte. Sortie : un fichier `corrections-registre-v1`, appliqué par
`python3 docs/ai-team/tableau_registre.py --corrections FICHIER [--ecrire]`.

Réseau : API GitHub publique (lecture seule, par `gh api`), résultats mis en cache dans `--cache`. Git : historique
complet de `origin/main` (dépôt non superficiel). N'écrit jamais le registre.

  python3 scripts/registre/completer_preuves.py --sortie corrections.json --cache cache.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

RACINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RACINE / 'docs' / 'ai-team'))
import controle_preuves as cp  # noqa: E402

DEPOT = 'RachEma-ux/Fadi'
WORKFLOWS = {'ci': '.github/workflows/ci.yml', 'architecture': '.github/workflows/architecture-guards.yml',
             'continuity': '.github/workflows/continuity.yml', 'securite': '.github/workflows/securite-secrets.yml'}
ZURICH = ZoneInfo('Europe/Zurich')


def git(*args: str, ok_echec: bool = False) -> str:
    r = subprocess.run(['git', '-C', str(RACINE), *args], capture_output=True, text=True)
    if r.returncode and not ok_echec:
        raise RuntimeError(f'git {" ".join(args)} : {r.stderr.strip()}')
    return r.stdout if r.returncode == 0 else ''


def git_octets(*args: str) -> bytes | None:
    r = subprocess.run(['git', '-C', str(RACINE), *args], capture_output=True)
    return r.stdout if r.returncode == 0 else None


class Cache:
    def __init__(self, chemin: Path | None):
        self.chemin = chemin
        self.d = json.loads(chemin.read_text(encoding='utf-8')) if chemin and chemin.exists() else {}

    def api(self, chemin: str):
        if chemin not in self.d:
            r = subprocess.run(['gh', 'api', chemin], capture_output=True, text=True)
            if r.returncode:
                raise RuntimeError(f'gh api {chemin} : {r.stderr.strip()}')
            self.d[chemin] = json.loads(r.stdout)
            self.sauver()
        return self.d[chemin]

    def sauver(self):
        if self.chemin:
            self.chemin.write_text(json.dumps(self.d, ensure_ascii=False), encoding='utf-8')


def zurich(iso_utc: str) -> str:
    """Horodatage ISO 8601 en heure suisse (Europe/Zurich), à partir d'un horodatage UTC de l'API GitHub."""
    return dt.datetime.fromisoformat(iso_utc.replace('Z', '+00:00')).astimezone(ZURICH).isoformat()


def date_commit(sha: str) -> str | None:
    s = git('show', '-s', '--format=%cI', sha, ok_echec=True).strip()
    return dt.datetime.fromisoformat(s).astimezone(ZURICH).isoformat() if s else None


class Historique:
    """Premier parent de origin/main, versions des fichiers, exécutions CI de main par commit."""

    def __init__(self, cache: Cache, reference: str, branche: str | None = None):
        self.branche = branche
        self.reference = reference
        lignes = git('log', '--first-parent', '--format=%H', reference).split()
        self.commits = list(reversed(lignes))  # du plus ancien au plus récent
        self.rang = {c: i for i, c in enumerate(self.commits)}
        self.cache = cache
        self._versions: dict[str, list[tuple[str, str | None]]] = {}
        self._runs: dict[str, dict[str, list[dict]]] = {}

    def versions(self, fichier: str) -> list[tuple[str, str | None]]:
        """(commit qui touche le fichier, contenu à ce commit ou None s'il est absent), du plus ancien au plus récent."""
        if fichier not in self._versions:
            touches = list(reversed(git('log', '--first-parent', '--format=%H', self.reference, '--', fichier).split()))
            out = []
            for c in touches:
                b = git_octets('show', f'{c}:{fichier}')
                out.append((c, b.decode('utf-8', 'replace') if b is not None else None))
            self._versions[fichier] = out
        return self._versions[fichier]

    def runs(self, workflow: str) -> dict[str, list[dict]]:
        if workflow not in self._runs:
            par_sha: dict[str, list[dict]] = {}
            # Exécutions de main (push) ; avec --branche, aussi celles de la PR de cette branche (pull_request).
            filtres = [('main', 'push')] + ([(self.branche, 'pull_request')] if self.branche else [])
            for branche, evenement in filtres:
                page = 1
                while True:
                    d = self.cache.api(f'repos/{DEPOT}/actions/workflows/{Path(WORKFLOWS[workflow]).name}/runs?branch={branche}&event={evenement}&per_page=100&page={page}')
                    for r in d['workflow_runs']:
                        par_sha.setdefault(r['head_sha'], []).append(r)
                    if len(d['workflow_runs']) < 100:
                        break
                    page += 1
            self._runs[workflow] = par_sha
        return self._runs[workflow]

    def jobs(self, run_id: int) -> list[dict]:
        d = self.cache.api(f'repos/{DEPOT}/actions/runs/{run_id}/jobs?per_page=100')
        jobs = list(d['jobs'])
        page = 2
        while len(jobs) < d.get('total_count', 0):
            jobs += self.cache.api(f'repos/{DEPOT}/actions/runs/{run_id}/jobs?per_page=100&page={page}')['jobs']
            page += 1
        return jobs


def presence(items: list[dict]) -> dict[str, list[bool]]:
    """Présence des libellés (règle de libelles-sources.ts) : un appel tsx pour tout le lot."""
    if not items:
        return {}
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump({'items': items}, f, ensure_ascii=False)
        nom = f.name
    r = subprocess.run(['npx', 'tsx', 'scripts/registre/presence-libelles.ts', nom], cwd=RACINE, capture_output=True, text=True)
    Path(nom).unlink(missing_ok=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


def etape_executante(fichier: str) -> tuple[str, re.Pattern] | None:
    """Workflow et motif du nom de l'étape qui exécute ce fichier en CI (None : aucune étape connue)."""
    if fichier.startswith('apps/web/e2e/'):
        return 'ci', re.compile(re.escape(f'({fichier})') + '|' + re.escape(fichier))
    if fichier.startswith('scripts/migration/'):
        return 'ci', re.compile(r'\(scripts/migration/\)')
    # Outillage du registre, porte G4 et analyse de secrets : étapes nommées de continuity.yml et securite-secrets.yml
    # (exécutées sur main à chaque fusion).
    if fichier == 'scripts/registre/controle-preuves.test.mjs':
        return 'continuity', re.compile(r'^Règles de preuve du registre Studio')
    if fichier == 'scripts/registre/controles-suivi.test.mjs':
        return 'continuity', re.compile(r'^Cohérence du suivi Studio')
    if fichier == 'scripts/registre/controle-pr.test.mjs':
        return 'continuity', re.compile(r'^Tests du contrôle de PR')
    if fichier == 'scripts/validation/porte-g4.test.mjs':
        return 'continuity', re.compile(r'^Porte G4 Studio')
    if fichier == 'scripts/securite/analyse-secrets.test.mjs':
        return 'securite', re.compile(r"^Tests de l'analyse$")
    if fichier == 'scripts/check-frontieres.test.mjs':
        return 'architecture', re.compile(r'^Table des frontières Studio')
    if fichier.startswith('apps/api/src/') and re.search(r'\.test\.tsx?$', fichier):
        return 'ci', re.compile(r'^Tests API')
    if (fichier.startswith('packages/') or fichier.startswith('apps/web/src/')) and re.search(r'\.test\.tsx?$', fichier):
        return 'ci', re.compile(r'^Tests des paquets purs et du web$')
    return None


def suite_db3_en_attente(contenu_garde: str | None, fichier: str) -> bool:
    rel = fichier.removeprefix('apps/api/')
    return bool(contenu_garde) and f"'{rel}'" in contenu_garde


def desactive(contenu: str, libelles: list[str]) -> bool:
    """Un libellé cité se trouve-t-il dans un test désactivé ou conditionnel (skip, skipIf, runIf, todo) ?"""
    lignes = contenu.split('\n')
    blocs: list[tuple[int, int]] = []
    for i, l in enumerate(lignes):
        # Appel en tête d'instruction seulement (un littéral qui contient « it.skip( » n'est pas un test désactivé).
        if re.match(r'\s*(?:(?:describe|it|test)\.(?:skip|skipIf|runIf|todo)\b|x(?:it|describe)\()', l):
            # Bloc : de cette ligne jusqu'à la fermeture de la première accolade ouverte après elle.
            prof, fin, ouvert = 0, i, False
            for j in range(i, len(lignes)):
                for ch in lignes[j]:
                    if ch == '{':
                        prof += 1; ouvert = True
                    elif ch == '}':
                        prof -= 1
                if ouvert and prof <= 0:
                    fin = j
                    break
            else:
                fin = len(lignes) - 1
            blocs.append((i, fin))
    if not blocs:
        return False
    for lib in libelles:
        for m in lib.split(' > '):
            for i, l in enumerate(lignes):
                if m and m in l.replace("\\'", "'") and any(a <= i <= b for a, b in blocs):
                    return True
    return False


def completer_execution(h: Historique, fichier: str, libelles: list[str], presences: dict[str, list[bool]]) -> tuple[dict | None, str]:
    etape = etape_executante(fichier)
    if etape is None:
        return None, f'aucune étape de CI connue n’exécute {fichier}'
    workflow, motif = etape
    versions = h.versions(fichier)
    if not versions:
        return None, f'{fichier} : aucune version sur le premier parent de main'
    # Sans libellé cité, la preuve vise le fichier entier : il suffit qu'il existe dans la version.
    ok = [(all(presences.get(f'{fichier}@{c}', [False])) if libelles else True) if contenu is not None else False
          for c, contenu in versions]
    if not any(ok):
        return None, f'{fichier} : aucune version de main ne contient tous les libellés cités'
    if ok[-1] and versions[-1][1] is not None and desactive(versions[-1][1], libelles):
        return None, f'{fichier} : libellé cité dans un test désactivé ou conditionnel (skip / skipIf / runIf) : non exécuté en CI'
    garde = {}
    runs = h.runs(workflow)
    for k, (c, contenu) in enumerate(versions):
        if not ok[k]:
            continue
        debut = h.rang.get(c)
        if debut is None:
            continue
        fin = h.rang[versions[k + 1][0]] if k + 1 < len(versions) and versions[k + 1][0] in h.rang else len(h.commits)
        for sha in h.commits[debut:fin]:
            for run in sorted(runs.get(sha, []), key=lambda r: r['run_started_at']):
                if run.get('status') != 'completed' or run.get('conclusion') != 'success':
                    continue
                if fichier.startswith('apps/api/'):
                    if sha not in garde:
                        b = git_octets('show', f'{sha}:scripts/check-api-tests-db3.mjs')
                        garde[sha] = b.decode() if b else None
                    if suite_db3_en_attente(garde[sha], fichier):
                        continue  # suite refusée par la garde DB-3 à ce commit : pas exécutée sans base attestée
                for job in h.jobs(run['id']):
                    for st in job.get('steps', []):
                        if motif.search(st['name']) and st.get('conclusion') == 'success':
                            return {
                                'commit': sha,
                                'url_execution': job['html_url'],
                                'date': zurich(st['completed_at']),
                                'environnement': (f"GitHub Actions, workflow {WORKFLOWS[workflow]} ({run['event']} sur {run['head_branch']}), job « {job['name']} » "
                                                  f"({', '.join(job.get('labels') or []) or 'libellés inconnus'}), étape « {st['name']} » : success ; "
                                                  f"exécution {run['id']}, tentative {run.get('run_attempt', 1)}"),
                                'methode': (f"Libellés cités relus (règle de libelles-sources.ts) dans {fichier} au commit {c[:12]} ; première "
                                            "exécution de main dont l'étape qui exécute ce fichier a réussi, trouvée par l'API GitHub (jobs et étapes)."),
                            }, ''
    return None, f'{fichier} : aucune exécution verte de main avec une étape « {motif.pattern} » réussie depuis l’apparition des libellés'


def verifier_execution_existante(h: Historique, p: dict) -> tuple[dict | None, str]:
    """Preuve qui cite déjà une exécution (url …/actions/runs/N[/job/M]) : la relit, ne la croit pas sur parole."""
    m = re.search(r'/actions/runs/(\d+)(?:/job/(\d+))?', p.get('url', '') or p.get('url_execution', ''))
    if not m:
        return None, 'aucune exécution citée'
    run = h.cache.api(f'repos/{DEPOT}/actions/runs/{m.group(1)}')
    if run.get('conclusion') != 'success':
        return None, f"exécution {m.group(1)} : conclusion {run.get('conclusion')}"
    if p.get('commit') and p['commit'] != run['head_sha']:
        return None, f"exécution {m.group(1)} : commit {run['head_sha'][:12]} ≠ commit cité {p['commit'][:12]}"
    jobs = h.jobs(int(m.group(1)))
    job = next((j for j in jobs if m.group(2) and str(j['id']) == m.group(2)), None)
    if m.group(2) and (job is None or job.get('conclusion') != 'success'):
        return None, f'job {m.group(2)} absent ou non réussi'
    fin = (job or run).get('completed_at') or run['updated_at']
    env = (f"GitHub Actions, workflow {run['path']} ({run['event']} sur {run['head_branch']}), "
           + (f"job « {job['name']} » ({', '.join(job.get('labels') or [])}) : success" if job else 'exécution : success')
           + f" ; exécution {run['id']}, tentative {run.get('run_attempt', 1)}")
    ajouts = {'date': zurich(fin), 'environnement': env,
              'methode': "Exécution déjà citée par la preuve, relue par l'API GitHub (conclusion, commit, job)."}
    if not p.get('commit'):
        ajouts['commit'] = run['head_sha']
    return ajouts, ''


def completer_trace(h: Historique, p: dict) -> tuple[dict | None, str]:
    """Essais exécutés hors CI dont la trace est un fichier versionné : commit essayé, trace, date d'enregistrement."""
    fichier, ref = p.get('fichier'), p.get('reference_code')
    if not fichier or not (ref and re.fullmatch(r'[0-9a-f]{40}', ref) and date_commit(ref)):
        return None, 'essais sans trace versionnée ni commit essayé'
    versions = [(c, t) for c, t in h.versions(fichier) if t is not None]
    if not versions:
        return None, f'{fichier} : trace absente de main'
    c0, texte = versions[0]
    try:
        trace = json.loads(texte)
    except ValueError:
        trace = {}
    jour = trace.get('date_utc') if isinstance(trace, dict) else None
    methode = trace.get('methode') if isinstance(trace, dict) else None
    return {'commit': ref, 'trace': fichier, 'date': date_commit(c0),
            'environnement': f"Essais hors CI, trace versionnée {fichier}" + (f" : {methode}" if methode else ''),
            'methode': (f"Commit essayé = référence de code de la preuve ; date = enregistrement de la trace sur main (commit {c0[:12]})"
                        + (f", essais datés du {jour} (UTC) par la trace" if jour else '') + '.')}, ''


def completer_lecture(h: Historique, p: dict) -> tuple[dict | None, str]:
    """Commit, date et environnement d'une lecture documentaire."""
    env = f'Lecture du dépôt Git {DEPOT} (fichier versionné), sans exécution'
    ref = p.get('reference_code')
    if not ref and p.get('type') == 'source':
        m = re.search(r'/blob/([0-9a-f]{40})/', p.get('url', ''))
        ref = m.group(1) if m else None
    fichier = p.get('fichier')
    # La référence de code ne date la lecture que si la preuve n'épingle pas une empreinte et que le fichier lu existe
    # à ce commit (sinon c'est le commit du code examiné, pas la version du document).
    if (ref and re.fullmatch(r'[0-9a-f]{40}', ref) and date_commit(ref) and not p.get('sha256')
            and (not fichier or git_octets('show', f'{ref}:{fichier}') is not None)):
        return {'commit': ref, 'date': date_commit(ref), 'environnement': env,
                'methode': 'Commit de la référence de code citée par la preuve (le fichier lu y existe) ; date du commit.'}, ''
    if not fichier:
        return None, 'lecture sans fichier ni référence de code'
    versions = [(c, t) for c, t in h.versions(fichier) if t is not None]
    if not versions:
        return None, f'{fichier} : absent de l’historique de main'
    if p.get('sha256'):
        for c, t in versions:
            if hashlib.sha256(t.encode('utf-8')).hexdigest() == p['sha256']:
                return {'commit': c, 'date': date_commit(c), 'environnement': env,
                        'methode': 'Version du fichier dont le SHA-256 est celui cité, retrouvée dans l’historique de main ; date du commit.'}, ''
        # Fichier binaire ou fins de ligne : comparer les octets exacts.
        for c, _ in versions:
            b = git_octets('show', f'{c}:{fichier}')
            if b is not None and hashlib.sha256(b).hexdigest() == p['sha256']:
                return {'commit': c, 'date': date_commit(c), 'environnement': env,
                        'methode': 'Version du fichier dont le SHA-256 est celui cité, retrouvée dans l’historique de main ; date du commit.'}, ''
        return None, f'{fichier} : SHA-256 cité introuvable dans l’historique de main (empreinte périmée)'
    extrait = p.get('controle') if isinstance(p.get('controle'), str) else None
    if extrait:
        for c, t in versions:
            if extrait in t:
                return {'commit': c, 'date': date_commit(c), 'environnement': env,
                        'methode': 'Première version de main dont le fichier contient l’extrait cité ; date du commit.'}, ''
    c = versions[-1][0]
    return {'commit': c, 'date': date_commit(c), 'environnement': env,
            'methode': 'Version courante du fichier sur main (dernier commit qui le touche) ; aucune empreinte ni extrait cité ne date la lecture plus tôt.'}, ''


def empreinte_preuve(p: dict) -> str:
    return hashlib.sha256(json.dumps(p, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()


def main() -> int:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('--registre', type=Path, default=RACINE / cp.REGISTRE)
    a.add_argument('--reference', default='origin/main', help='commit dont on suit le premier parent (HEAD d’une branche de PR avec --branche)')
    a.add_argument('--branche', help='branche de PR dont les exécutions pull_request comptent aussi (preuves ajoutées par la PR)')
    a.add_argument('--cache', type=Path)
    a.add_argument('--sortie', type=Path, required=True)
    args = a.parse_args()
    contenu = args.registre.read_bytes()
    registre = json.loads(contenu)
    cache = Cache(args.cache)
    h = Historique(cache, args.reference, args.branche)

    # 1. Présence des libellés dans toutes les versions des fichiers cités (un seul appel tsx, une entrée par version).
    par_fichier: dict[str, list[str]] = {}
    for t in registre['tasks']:
        for p in t.get('preuves', []):
            f = p.get('fichier')
            if f and cp.libelles(p) and cp.est_test_ou_recette(f):
                libs = par_fichier.setdefault(f, [])
                libs += [x for x in cp.libelles(p) if x not in libs]
    items = []
    for f, libs in par_fichier.items():
        for c, texte in h.versions(f):
            if texte is not None:
                items.append({'cle': f'{f}@{c}', 'fichier': f, 'contenu': texte, 'libelles': libs})
    brut = presence(items)
    # Présence d'un libellé donné dans la version (fichier, commit).
    trouve = {(i['fichier'], i['cle']): dict(zip(i['libelles'], brut[i['cle']])) for i in items}

    corrections, non_completees = [], []
    for t in registre['tasks']:
        for idx, p in enumerate(t.get('preuves', [])):
            ajouts: dict = {}
            et = cp.etiquette_attendue(p)
            raison = ''
            if et == 'scénario exécuté' or cp.cite_un_test(p):
                libs = cp.libelles(p)
                exec_ = None
                if re.search(r'/actions/runs/\d+', p.get('url', '') or ''):
                    exec_, raison = verifier_execution_existante(h, p)
                elif p.get('type') in cp.TYPES_EXECUTION:
                    exec_, raison = completer_trace(h, p)
                if exec_ is None and cp.cite_un_test(p):
                    pres = {cle: [v[x] for x in libs] for (f, cle), v in trouve.items() if f == p['fichier']}
                    exec_, raison = completer_execution(h, p['fichier'], libs, pres)
                if exec_:
                    ajouts.update(exec_)
                    et = 'scénario exécuté'
                else:
                    et = 'test prescrit' if p.get('fichier') and cp.est_test_ou_recette(p['fichier']) else et
            else:
                lec, raison = completer_lecture(h, p)
                if lec:
                    ajouts.update(lec)
            ajouts['etiquette'] = et
            # N'ajoute que ce qui manque ; ne remplace jamais une valeur existante.
            ajouts = {k: v for k, v in ajouts.items() if k not in p}
            if ajouts:
                corrections.append({'id': t['id'], 'index': idx, 'empreinte_preuve': empreinte_preuve(p), 'ajouts': ajouts})
            if raison and not (set(ajouts) & {'commit', 'date'}) and not (p.get('commit') and p.get('date')):
                non_completees.append({'id': t['id'], 'index': idx, 'type': p.get('type'), 'fichier': p.get('fichier'), 'raison': raison})

    # 2. Tâches « Vérifié » encore sans preuve conforme une fois les ajouts appliqués : descente proposée.
    copie = json.loads(contenu)
    par_id = {t['id']: t for t in copie['tasks']}
    for c in corrections:
        par_id[c['id']]['preuves'][c['index']].update(c['ajouts'])
    statuts, tests = [], []
    jour = dt.date.today().isoformat()
    for t in copie['tasks']:
        etat = (t.get('tests') or {}).get('etat')
        executes = [p for p in t.get('preuves', []) if p.get('etiquette') == 'scénario exécuté']
        cite_test = any(cp.cite_un_test(p) for p in t.get('preuves', []))
        nouveau, raison = None, ''
        # PR-08 : « Exécuté » sans aucun test cité, alors que le critère est porté par une lecture justifiée (décision,
        # document) : l'état devient « Non applicable », motivé ; le statut ne change pas.
        if (t['statut'] == 'Vérifié' and etat == 'Exécuté' and not executes and not cite_test
                and any(cp.preuve_conforme(p) for p in t.get('preuves', []))):
            nouveau = {'etat': 'Non applicable',
                       'portee': (f"Contrôle PR-08 du {jour} : aucun test ni recette n'est cité ; le critère est porté par une lecture "
                                  f"justifiée (décision ou document daté et versionné). État antérieur « Exécuté » : {t['tests'].get('portee', '')}")}
            raison = 'PR-08 : « Exécuté » sans test exécuté cité'
        # PR-08 : des tests cités ont été exécutés en CI sur main alors que l'état dit « Non exécuté ». Obligation encore
        # ouverte : « Partiel » (exécution réelle, couverture du critère non établie) ; sinon « Exécuté ».
        elif etat == 'Non exécuté' and executes:
            ouverte = t['statut'] not in ('Vérifié', 'Accepté')
            nouveau = {'etat': 'Partiel' if ouverte else 'Exécuté',
                       'portee': (f"Contrôle PR-08 du {jour} : {len(executes)} preuve(s) citée(s) exécutée(s) en CI sur main "
                                  "(champs commit / url_execution / date)"
                                  + (" ; l'obligation reste ouverte, la couverture de son critère n'est pas établie" if ouverte else '')
                                  + f". État antérieur : {t['tests'].get('portee', '')}")}
            raison = 'PR-08 : tests cités exécutés, état « Non exécuté » périmé'
        if nouveau:
            tests.append({'id': t['id'], 'tests_avant': t['tests'], 'tests': nouveau, 'raison': raison})
            t['tests'] = nouveau
        if t['statut'] != 'Vérifié':
            continue
        manques = cp.manques_verifie(t)
        if manques:
            prescrit = any(p.get('etiquette') == 'test prescrit' for p in t.get('preuves', []))
            cible = 'Implémenté' if prescrit else 'En cours'
            statuts.append({'id': t['id'], 'statut_avant': 'Vérifié', 'statut': cible,
                            'raison': '; '.join(manques),
                            'suite': (f"Contrôle X.5-02 du {jour} : « Vérifié » retiré, aucune preuve conforme "
                                      f"(daté, versionné, exécution ou lecture justifiée) — {'; '.join(manques)}. "
                                      + ('Test prescrit présent : exécuter ce test en CI sur main et citer l’exécution.' if prescrit
                                         else 'Produire une preuve datée et versionnée.'))})
    sortie = {
        'schema': 'corrections-registre-v1',
        'base_register_sha256': hashlib.sha256(contenu).hexdigest(),
        'origine': 'X.5-02 / G2-04 — preuves complétées par scripts/registre/completer_preuves.py',
        'reference': git('rev-parse', args.reference).strip(),
        'genere_le': dt.datetime.now(ZURICH).isoformat(timespec='seconds'),
        'preuves': corrections,
        'statuts': statuts,
        'tests': tests,
        'non_completees': non_completees,
    }
    args.sortie.write_text(json.dumps(sortie, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(corrections)} preuve(s) complétée(s), {len(non_completees)} non complétée(s), {len(statuts)} descente(s) proposée(s), '
          f'{len(tests)} état(s) de tests corrigé(s).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
