"""Combine les exceptions de branche « job pur sans base » de plusieurs versions de ci.yml.

Usage : python3 ci_merge.py BASE.yml PR1.yml [PR2.yml ...] > resultat.yml
Chaque fichier ajoute un job pur (entre `jobs:` et `  validate:`) et la même condition de branche sur
validate / e2e / image. Le résultat garde tous les jobs purs et exclut les jobs à services pour toutes ces
branches exactes, et seulement pour elles.
"""
import re
import sys

COND = re.compile(r"^    if: \$\{\{ !\((.+)\) \}\}$")
SKIPPED = ("validate", "e2e", "image")


def analyse(texte):
    lignes = texte.split("\n")
    debut = lignes.index("jobs:") + 1
    fin = lignes.index("  validate:")
    pur = lignes[debut:fin]
    conds = {}
    job = None
    for i, l in enumerate(lignes):
        m = re.match(r"^  ([a-z][a-z0-9-]*):$", l)
        if m:
            job = m.group(1)
        c = COND.match(l)
        if c and job in SKIPPED:
            conds[job] = (i, c.group(1))
    if sorted(conds) != sorted(SKIPPED):
        raise SystemExit(f"conditions attendues sur {SKIPPED}, trouvées {sorted(conds)}")
    if len({c for _, c in conds.values()}) != 1:
        raise SystemExit("conditions différentes entre validate/e2e/image")
    return lignes, pur, next(iter(conds.values()))[1]


def main():
    base_l, base_pur, base_c = analyse(open(sys.argv[1], encoding="utf-8").read())
    purs, conds = [base_pur], [base_c]
    for f in sys.argv[2:]:
        _, pur, c = analyse(open(f, encoding="utf-8").read())
        if c not in conds:
            purs.append(pur)
            conds.append(c)
    out = []
    job = None
    i = 0
    while i < len(base_l):
        l = base_l[i]
        if l == "jobs:":
            out.append(l)
            for p in purs:
                bloc = list(p)
                while bloc and bloc[-1] == "":
                    bloc.pop()
                out.extend(bloc + [""])
            i = base_l.index("  validate:")
            continue
        m = re.match(r"^  ([a-z][a-z0-9-]*):$", l)
        if m:
            job = m.group(1)
        if job in SKIPPED and COND.match(l):
            if out and out[-1].lstrip().startswith("#"):
                out[-1] = "    # Exceptions bornées sans base réelle : branches exactes listées ; condition avant création des services."
            out.append("    if: ${{ !(" + " || ".join(f"({c})" for c in conds) + ") }}")
        else:
            out.append(l)
        i += 1
    sys.stdout.write("\n".join(out))


main()
