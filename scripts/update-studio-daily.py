#!/usr/bin/env python3
"""Génère quotidiennement le bandeau GitHub dans la checklist HTML Studio.

Le rapport GitHub et les marqueurs facultatifs sont informatifs. Jamais de coche automatique
des étapes Code / Review ChatGPT / Review Admin, conservées dans localStorage.
Bibliothèque standard uniquement. Run: python3 scripts/update-studio-daily.py --offline --dry-run
"""
import argparse
import datetime as dt
import html
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "Studio/Fadi_Studio_Checklist_Interactive_V1_1.html"
JSON_PATH = ROOT / "Studio/Fadi_Studio_Daily_Status.json"
START = "<!-- FADI-STUDIO-DAILY-BEGIN -->"
END = "<!-- FADI-STUDIO-DAILY-END -->"
ISSUE = "https://github.com/RachEma-ux/Fadi/issues/166"
REPO = "RachEma-ux/Fadi"
STAGES = {"code": "Code", "chatgpt-review": "Review ChatGPT", "admin-review": "Review Admin"}

def get_json(path, token):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "fadi-studio-daily/1.0",
               "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request("https://api.github.com" + path, headers=headers)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)

def task_ids(source):
    m = re.search(r'<script id="seed" type="application/json">(.*?)</script>', source, flags=re.S)
    if not m:
        raise ValueError("Impossible de trouver les tâches de la checklist HTML")
    seed = json.loads(m.group(1))
    ids = []
    def walk(data):
        if isinstance(data, dict):
            if "id" in data and "text" in data and "part" in data:
                ids.append(data["id"])
            for value in data.values():
                walk(value)
        elif isinstance(data, list):
            for value in data:
                walk(value)
    walk(seed)
    if len(ids) != 630 or len(set(ids)) != 630:
        raise ValueError("STOP : la checklist HTML ne contient pas 630 IDs uniques : %s" % len(ids))
    for required in ("codeDone", "chatgptReviewed", "adminReviewed", "localStorage"):
        if required not in source:
            raise ValueError("STOP : étape ou conservation locale introuvable : " + required)
    return set(ids)

def collect(offline=False, token=None):
    if offline:
        return {"comments": [], "main_sha": None, "pr_sha": None, "github_status": "hors ligne : aucun contrôle distant"}
    try:
        comments = []
        for page in range(1, 12):
            batch = get_json(f"/repos/{REPO}/issues/166/comments?per_page=100&page={page}", token)
            comments.extend(batch)
            if len(batch) < 100:
                break
        branch = get_json(f"/repos/{REPO}/branches/main", token)
        pr = get_json(f"/repos/{REPO}/pulls/165", token)
        return {"comments": comments,
                "main_sha": branch.get("commit", {}).get("sha"),
                "pr_sha": pr.get("head", {}).get("sha"),
                "github_status": "consultation API réussie"}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as ex:
        # Fail-closed : ne jamais prétendre que des données périmées sont une vérification actuelle.
        raise RuntimeError("Contrôle GitHub impossible : " + type(ex).__name__) from ex

def parse_data(payload, ids, now):
    comments = payload["comments"]
    latest = None
    reports = []
    hourly = []
    questions = {}
    answers = {}
    delegated = {}
    owner_pending = {}
    acknowledgements = 0
    signals = {}
    for comment in comments:
        body = comment.get("body") or ""
        url = comment.get("html_url") or ISSUE
        created = comment.get("created_at") or ""
        if "[CODEX-ACK]" in body:
            acknowledgements += 1
        if "[CODEX-PROGRESS]" in body:
            reports.append((created, body, url))
        if "[CHATGPT-HOURLY]" in body:
            hourly.append((created, body, url))
        for qid in re.findall(r"\[CODEX-QUESTION\]\[(Q-[a-zA-Z0-9_-]+)\]\[OPEN\]", body):
            questions[qid] = {"url": url, "created_at": created}
        answered_ids = re.findall(r"\[(?:CHATGPT-ANSWER|CHATGPT-DECISION)\]\[(Q-[a-zA-Z0-9_-]+)\]", body)
        for qid in re.findall(r"\[CHATGPT-DECISION\]\[(Q-[a-zA-Z0-9_-]+)\]", body):
            delegated[qid] = url
        for qid in answered_ids:
            answers[qid] = url
        for qid in re.findall(r"\[NEEDS-USER-DECISION\]\[(Q-[a-zA-Z0-9_-]+)\]", body):
            owner_pending[qid] = url
        if "[NEEDS-USER-DECISION]" in body:
            for qid in answered_ids:
                owner_pending[qid] = url
        # Marqueurs structurés facultatifs publiés par Codex ; ils restent NON VALIDANTS.
        for line in body.splitlines():
            if not line.startswith("[STUDIO-TASK-STATUS] "):
                continue
            try:
                record = json.loads(line[len("[STUDIO-TASK-STATUS] "):])
            except json.JSONDecodeError:
                continue
            id_ = record.get("id")
            stage = record.get("stage")
            proof = record.get("proof_url", "")
            if (id_ not in ids or stage not in STAGES or
                not isinstance(proof, str) or not proof.startswith("https://github.com/RachEma-ux/Fadi/")):
                continue
            signals[(id_, stage)] = {"id": id_, "stage": stage, "proof_url": proof,
                                     "at": created, "source": url,
                                     "state": "signalé — vérification indépendante requise"}
    if reports:
        latest = sorted(reports, key=lambda p:p[0])[-1]
    latest_hourly = sorted(hourly, key=lambda p:p[0])[-1] if hourly else None
    p630 = None
    pdev = "N/D"
    if latest:
        match = re.search(r"P630\s*:\s*(\d+)\s*/\s*630", latest[1], flags=re.I)
        if match and 0 <= int(match.group(1)) <= 630:
            p630 = int(match.group(1))
        match = re.search(r"PDEV\s*:\s*(\d+)\s*/\s*(\d+)", latest[1], flags=re.I)
        if match and int(match.group(2)) > 0 and int(match.group(1)) <= int(match.group(2)):
            # Pas de baseline auditée ici ; ne pas convertir un chiffre rapporté en verdict.
            pdev = "N/D (valeur publiée non homologuée)"
    unanswered = sorted(q for q in questions if q not in answers)
    return {
        "schema": "FADI-STUDIO-DAILY-1.0",
        "generated_at_utc": now,
        "sources": {"questions": ISSUE, "programme": f"https://github.com/{REPO}/issues/156",
                    "checklist": f"https://github.com/{REPO}/blob/main/Studio/Fadi_Studio_Checklist_Execution_V1_0.md"},
        "main_sha": payload["main_sha"], "pr165_head_sha": payload["pr_sha"],
        "api": payload["github_status"],
        "progress": {"pdev_verified": None, "p630_verified": None,
                     "p630_reported_by_codex": p630, "mapping": 630, "total": 630,
                     "note": "Une affectation 630/630 et un pourcentage rapporté ne prouvent pas une réalisation vérifiée."},
        "codex": {"ack_count": acknowledgements, "progress_count": len(reports),
                  "last_progress_at": latest[0] if latest else None,
                  "last_progress_url": latest[2] if latest else None,
                  "execution_confirmed": bool(acknowledgements and reports)},
        "hourly": {"chatgpt_report_count": len(hourly),
                   "last_at": latest_hourly[0] if latest_hourly else None,
                   "last_url": latest_hourly[2] if latest_hourly else None},
        "questions": {"total": len(questions), "unanswered": unanswered,
                      "unanswered_count": len(unanswered),
                      "answered_count": len([q for q in questions if q in answers]),
                      "delegated_decision_count": len([q for q in questions if q in delegated]),
                      "delegated_decision_ids": sorted(q for q in questions if q in delegated),
                      "owner_decision_pending": sorted(q for q in owner_pending if q in questions),
                      "owner_decision_pending_count": len([q for q in owner_pending if q in questions])},
        "task_signals": sorted(signals.values(), key=lambda v:(v["id"],v["stage"])),
        "task_signal_warning": "Statut signalé : ne coche aucune des validations locales Code, Review ChatGPT ou Review Admin."
    }

def e(value):
    return html.escape(str(value if value is not None else "non confirmé"), quote=True)

def client_js():
    return r"""(function(){
'use strict';
const raw=document.getElementById('fadi-daily-data');
if(!raw)return;
let data;try{data=JSON.parse(raw.textContent)}catch{return}
const signals=data.task_signals||[];
if(!signals.length)return;
const grouped={};
for(const row of signals)(grouped[row.id]??=[]).push(row);
function annotate(){
 for(const [id,items] of Object.entries(grouped)){
  const card=document.getElementById('t-'+id);
  if(!card||card.querySelector('.fadi-daily-task-signals'))continue;
  const el=document.createElement('div');
  el.className='fadi-daily-task-signals';
  const heading=document.createElement('strong');
  heading.textContent='Signaux GitHub (non validants) : ';
  el.append(heading);
  for(const item of items){
   const a=document.createElement('a');
   a.href=item.proof_url;
   a.target='_blank';
   a.rel='noopener noreferrer';
   a.textContent=({'code':'Code','chatgpt-review':'Review ChatGPT','admin-review':'Review Admin'})[item.stage]||'Source';
   el.append(a,' · ');
  }
  card.append(el);
 }
}
const area=document.getElementById('mainArea')||document.body;
new MutationObserver(annotate).observe(area,{childList:true,subtree:true});
annotate();
})();"""

def build_block(data):
    p=data["progress"]
    questions=data["questions"]
    codex=data["codex"]
    code_state = "Accusé + activité GitHub observés" if codex["execution_confirmed"] else "Exécution non confirmée"
    reported = (f'{p["p630_reported_by_codex"]}/630 — rapporté, non homologué'
                if p["p630_reported_by_codex"] is not None else "N/D — pas de bilan attesté")
    links = [
        f'<a href="{e(data["sources"]["questions"])}" target="_blank" rel="noopener noreferrer">Questions GitHub #166</a>',
        f'<a href="{e(data["sources"]["programme"])}" target="_blank" rel="noopener noreferrer">Programme #156</a>'
    ]
    if codex["last_progress_url"]:
        links.append(f'<a href="{e(codex["last_progress_url"])}" target="_blank" rel="noopener noreferrer">Dernier rapport Codex</a>')
    if data["hourly"]["last_url"]:
        links.append(f'<a href="{e(data["hourly"]["last_url"])}" target="_blank" rel="noopener noreferrer">Dernier contrôle ChatGPT</a>')
    info = [
        ("Développement total vérifié", "N/D % — périmètre et baseline à valider"),
        ("Tâches Studio vérifiées", "N/D / 630 — preuves individuelles à rapprocher"),
        ("Avancement déclaré par Codex", reported),
        ("Accusés / rapports Codex", f'{codex["ack_count"]} / {codex["progress_count"]} — {code_state}'),
        ("Questions sans réponse technique", questions["unanswered_count"]),
        ("Décisions utilisateur encore nécessaires", questions.get("owner_decision_pending_count", 0)),
        ("Dernier contrôle Codex", codex["last_progress_at"] or "Non disponible"),
        ("Dernier contrôle horaire ChatGPT", data["hourly"]["last_at"] or "Non disponible"),
        ("GitHub main / PR #165", (data["main_sha"] or "N/D")[:12]+" / "+(data["pr165_head_sha"] or "N/D")[:12])
    ]
    rows = "".join(f'<tr><th scope="row">{e(k)}</th><td>{e(v)}</td></tr>' for k,v in info)
    payload = json.dumps(data, ensure_ascii=False, separators=(",",":")).replace("<","\\u003c").replace(">","\\u003e").replace("&","\\u0026")
    style = """
<style id="fadi-daily-style">
#fadi-daily-panel{margin:10px 14px;padding:14px;border:1px solid #c5d5eb;border-radius:12px;background:#eef4fc;color:#21354e;font:13px/1.5 system-ui,sans-serif}
#fadi-daily-panel h2{margin:0 0 6px;font-size:17px}#fadi-daily-panel p{margin:5px 0}
#fadi-daily-panel table{width:100%;border-collapse:collapse;margin:8px 0}
#fadi-daily-panel th,#fadi-daily-panel td{text-align:left;vertical-align:top;border-bottom:1px solid #d6e1ef;padding:4px 8px 4px 0}
#fadi-daily-panel .links{display:flex;gap:12px;flex-wrap:wrap}
.fadi-daily-task-signals{margin:8px 0;color:#30577f;font-size:12px}
.fadi-daily-task-signals a{margin:0 5px}
</style>
"""
    panel=(f'<aside id="fadi-daily-panel" aria-label="Synthèse quotidienne des contrôles horaires">'
           f'<h2>Suivi GitHub quotidien · {e(data["generated_at_utc"])}</h2>'
           f'<p><strong>Snapshot informatif.</strong> Les trois cases Code, Review ChatGPT et Review Admin restent sous contrôle manuel ; '
           f'aucun signal horaire ne les coche.</p><table>{rows}</table>'
           f'<p class="links">{" · ".join(links)}</p>'
           f'<p><small>Source : Issue #166. Les pourcentages déclarés ne remplacent ni vérification par ID ni validation utilisateur. '
           f'Échec réseau = génération interrompue, dernier snapshot conservé.</small></p></aside>')
    return START+"\n"+style+panel+"\n"+'<script type="application/json" id="fadi-daily-data">'+payload+'</script>\n'+'<script id="fadi-daily-client">'+client_js()+'</script>\n'+END

def update_html(source, snapshot):
    task_ids(source)
    if source.count(START) != source.count(END):
        raise ValueError("STOP : marqueurs incohérents, aucune modification")
    if source.count(START) > 1:
        raise ValueError("STOP : plusieurs bandeaux quotidiens détectés")
    if START in source:
        source = source[:source.index(START)]+source[source.index(END)+len(END):]
    if "</body>" not in source:
        raise ValueError("STOP : HTML invalide (body)")
    return source.replace("</body>",build_block(snapshot)+"\n</body>",1)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true", help="Tests locaux sans requête API")
    parser.add_argument("--dry-run", action="store_true", help="Contrôle sans écriture")
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN", ""))
    parser.add_argument("--html", type=pathlib.Path, default=HTML_PATH)
    parser.add_argument("--out-json", type=pathlib.Path, default=JSON_PATH)
    parser.add_argument("--at", help="Horodatage ISO UTC pour tests stables")
    args=parser.parse_args()
    source=args.html.read_text(encoding="utf-8")
    ids=task_ids(source)
    now=args.at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    snap=parse_data(collect(args.offline,args.token),ids,now)
    output=update_html(source,snap)
    # Aucune écriture si indisponibilité réseau, parsing non conforme, ou données dangereuses.
    if args.dry_run:
        assert len(task_ids(output)) == 630
        assert output.count(START) == 1 and output.count(END) == 1
        assert source.count("const STORE=") == output.count("const STORE=")
        print("STUDIO_DAILY_DRY_RUN_OK", snap["generated_at_utc"],len(ids))
        return
    args.out_json.write_text(json.dumps(snap,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    args.html.write_text(output,encoding="utf-8")
    print("STUDIO_DAILY_UPDATED", now, "questions",snap["questions"]["unanswered_count"],
          "P630_reported",snap["progress"]["p630_reported_by_codex"])

if __name__=="__main__":
    main()
