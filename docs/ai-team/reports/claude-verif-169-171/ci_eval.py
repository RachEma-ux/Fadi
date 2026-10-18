"""Évalue quels jobs de ci.yml tournent pour un contexte GitHub donné (sous-ensemble des expressions utilisées)."""
import re
import sys
import yaml


def evaluer(expr, ctx):
    e = expr.strip()
    if e.startswith("${{") and e.endswith("}}"):
        e = e[3:-2]
    for k, v in ctx.items():
        e = e.replace(k, repr(v))
    e = e.replace("&&", " and ").replace("||", " or ")
    e = re.sub(r"!(?!=)", " not ", e)
    e = e.replace("'", '"')
    return bool(eval(e, {"__builtins__": {}}, {}))


def jobs_actifs(doc, ctx):
    actifs = []
    for nom, job in doc["jobs"].items():
        cond = job.get("if")
        if cond is None or evaluer(str(cond), ctx):
            actifs.append(nom)
    return actifs


def contexte(event, head="", base="main", repo="RachEma-ux/Fadi", head_repo="RachEma-ux/Fadi"):
    return {"github.event_name": event, "github.repository": repo, "github.event.pull_request.head.repo.full_name": head_repo,
            "github.head_ref": head, "github.base_ref": base}


if __name__ == "__main__":
    doc = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
    cas = {
        "PR docs/156-codex-missions-completes": contexte("pull_request", "docs/156-codex-missions-completes"),
        "PR fix/156-classification-no-ifc-inference": contexte("pull_request", "fix/156-classification-no-ifc-inference"),
        "PR fix/157-test-database-guard": contexte("pull_request", "fix/157-test-database-guard"),
        "PR autre branche": contexte("pull_request", "feat/autre"),
        "PR fork même nom (classif)": contexte("pull_request", "fix/156-classification-no-ifc-inference", head_repo="tiers/Fadi"),
        "PR classif vers autre base": contexte("pull_request", "fix/156-classification-no-ifc-inference", base="dev"),
        "push main": contexte("push", ""),
    }
    for nom, ctx in cas.items():
        print(f"{nom:45s} -> {', '.join(jobs_actifs(doc, ctx))}")
