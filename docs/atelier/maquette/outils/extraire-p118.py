#!/usr/bin/env python3
"""Maquette de l'Atelier (L0.3) — contenus tirés des données réelles de P.118.

Lit `apps/api/src/data/examples/p118-native-model.json` (aucune valeur inventée, R3) et réécrit, dans
`index.html`, `ordinateur.html` et `telephone.html`, le contenu situé entre les marqueurs `<!-- P118:CLE -->` et
`<!-- /P118:CLE -->` :

- PLAN-RDC : plan du niveau RDC (murs, cloisons, noyaux avec leur épaisseur, poteaux, escaliers, portes et
  fenêtres à leur position `t` sur le mur hôte, espaces du calque « Espaces ») ;
- VUE3D : volume axonométrique des murs extérieurs des six niveaux, aux altitudes et hauteurs déclarées ;
- NIVEAUX, CALQUES, CLASSES : listes du navigateur du projet (effectifs comptés dans la source) ;
- INSP-MUR, INSP-PORTE : propriétés de la façade EX118-rdc-EXT-1 et de la porte EX118-rdc-V819-P-X-HALL ;
- PORTES-PASSAGE : portes dont la source déclare `clearWidthVerified: false` ;
- EFFECTIFS : effectifs par famille (contrôle R7).

Une grandeur dérivée (longueur, aire calculée, distance le long du mur) n'est pas calculée ici : elle est
affichée « non évaluée », car c'est le modèle typé (lot 1) qui la dérivera.

Le plan est tourné pour mettre la façade EX118-rdc-EXT-1 à l'horizontale (présentation seulement : aucune
coordonnée du modèle n'est modifiée et la maquette n'affiche pas de coordonnées ; le nord n'est pas dessiné,
il n'est pas confirmé par la source, H11).

Usage, depuis la racine du dépôt : `python3 docs/atelier/maquette/outils/extraire-p118.py`
Option `--verifier` : n'écrit rien, sort en erreur si une page n'est pas à jour avec la source.
Aucune dépendance hors bibliothèque standard ; sortie déterministe.
"""
import json
import math
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parents[4]
MAQUETTE = pathlib.Path(__file__).resolve().parents[1]
SOURCE = RACINE / "apps/api/src/data/examples/p118-native-model.json"
PAGES = ["index.html", "ordinateur.html", "telephone.html"]

modele = json.loads(SOURCE.read_text(encoding="utf-8"))
domaines = modele["domains"]
niveaux = domaines["floorDesign"]["levels"]
ORDRE = [n["id"] for n in domaines["levels"]]
rdc = niveaux["rdc"]
murs_rdc = {m["id"]: m for m in rdc["walls"]}
MUR_SEL = "EX118-rdc-EXT-1"
PORTE_SEL = "EX118-rdc-V819-P-X-HALL"

# Rotation de présentation : façade EXT-1 horizontale.
f = murs_rdc[MUR_SEL]
angle = math.atan2(f["b"][1] - f["a"][1], f["b"][0] - f["a"][0])
COS, SIN = math.cos(-angle), math.sin(-angle)


def tourner(p):
    x, y = p
    return (x * COS - y * SIN, x * SIN + y * COS)


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def nombre(v):
    """Valeur telle que dans la source, virgule décimale, signe moins typographique ; jamais arrondie."""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).replace(".", ",").replace("-", "−")


def pts(q):
    return " ".join("%.1f,%.1f" % p for p in q)


# --- Plan du RDC -------------------------------------------------------------------------------------------
ECHELLE = 22
tous_pts = [tourner(m[k]) for m in rdc["walls"] for k in ("a", "b")]
minx = min(p[0] for p in tous_pts) - 1.5
maxx = max(p[0] for p in tous_pts) + 1.5
maxy = max(p[1] for p in tous_pts) + 1.5
miny = min(p[1] for p in tous_pts) - 1.5


def plan(p):
    x, y = tourner(p)
    return ((x - minx) * ECHELLE, (maxy - y) * ECHELLE)


L, H = (maxx - minx) * ECHELLE, (maxy - miny) * ECHELLE
svg = [
    f'<svg class="plan" viewBox="0 0 {L:.0f} {H:.0f}" preserveAspectRatio="xMidYMid meet" role="img" '
    'aria-labelledby="plan-titre">'
    '<title id="plan-titre">Plan du niveau RDC de P.118 : murs, cloisons, noyaux, poteaux, escaliers, '
    "ouvertures et espaces (données de p118-native-model.json)</title>",
    '<g class="espaces">',
]
codes = set()
for chemin in rdc["paths"]:
    if chemin.get("layer") != "Espaces":
        continue
    q = [plan(p) for p in chemin["points"]]
    nom = chemin["name"]
    classe = "espace circ" if ("Desserte" in nom or "Dégagement" in nom) else "espace"
    code = nom.split(" · ")[0]
    premier = code.startswith("R0") and code not in codes
    ident = f' id="esp-{code}"' if premier else ""
    svg.append(f'<polygon{ident} class="{classe}" points="{pts(q)}"><title>{esc(nom)}</title></polygon>')
    if premier:
        codes.add(code)
        cx = sum(p[0] for p in q) / len(q)
        cy = sum(p[1] for p in q) / len(q)
        svg.append(f'<text class="lbl" x="{cx:.0f}" y="{cy:.0f}">{code}</text>')
svg.append('</g><g class="escaliers">')
for s in rdc["stairs"]:
    a, b = plan(s["a"]), plan(s["b"])
    svg.append(
        f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke-width="{s["width"] * ECHELLE:.1f}">'
        f'<title>{esc(s["name"])} · {s["risers"]} contremarches · largeur {nombre(s["width"])} m</title></line>'
    )
svg.append('</g><g class="murs">')
for m in rdc["walls"]:
    a, b = plan(m["a"]), plan(m["b"])
    classe = {"Murs": "mur", "Noyaux": "noyau"}.get(m.get("layer"), "cloison")
    ident = ' id="mur-selection"' if m["id"] == MUR_SEL else ""
    svg.append(
        f'<line{ident} class="{classe}" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" '
        f'stroke-width="{max(m["thickness"] * ECHELLE, 1.5):.1f}"><title>{esc(m["name"])} · épaisseur '
        f'{nombre(m["thickness"])} m · calque {esc(m.get("layer", ""))}</title></line>'
    )
svg.append('</g><g class="ouvertures">')
for o in rdc["doors"] + rdc["windows"]:
    hote = murs_rdc.get(o["hostWallId"])
    if hote is None:  # jamais omis en silence : listé dans le titre du plan
        svg.append(f'<!-- hôte introuvable : {esc(o["id"])} -->')
        continue
    ax, ay = hote["a"]
    bx, by = hote["b"]
    lg = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / lg, (by - ay) / lg
    cx, cy = ax + (bx - ax) * o["t"], ay + (by - ay) * o["t"]
    d = o["width"] / 2
    p1, p2 = plan((cx - ux * d, cy - uy * d)), plan((cx + ux * d, cy + uy * d))
    classe = "porte" if o["kind"] == "door" else "fenetre"
    ident = ' id="porte-selection"' if o["id"] == PORTE_SEL else ""
    etiquette = o.get("name") or o.get("mark") or o["id"]
    svg.append(
        f'<line{ident} class="{classe}" x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" '
        f'stroke-width="{max(hote["thickness"] * ECHELLE + 2, 4):.1f}"><title>{esc(etiquette)} · largeur '
        f'{nombre(o["width"])} m</title></line>'
    )
svg.append('</g><g class="poteaux">')
for c in rdc["columns"]:
    x, y = plan(c["p"])
    d = c["width"] * ECHELLE / 2
    svg.append(f'<rect x="{x - d:.1f}" y="{y - d:.1f}" width="{2 * d:.1f}" height="{2 * d:.1f}"><title>{esc(c["name"])}</title></rect>')
svg.append("</g></svg>")
PLAN = "\n".join(svg)

# --- Volume axonométrique ----------------------------------------------------------------------------------
K = 13
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))


def iso(p, z):
    x, y = tourner(p)
    return ((x + y) * C30 * K, (-x + y) * S30 * K - z * K)


faces = []
for nid in ORDRE:
    n = niveaux[nid]
    z0, z1 = n["elevation"], n["elevation"] + n["height"]
    ext = set(n["exteriorWallIds"])
    murs = [m for m in n["walls"] if m["id"] in ext]
    faces.append((nid, "dalle", [iso(m["a"], z0) for m in murs], -1e9))
    for m in murs:
        (xa, ya), (xb, yb) = tourner(m["a"]), tourner(m["b"])
        faces.append((nid, "paroi", [iso(m["a"], z0), iso(m["b"], z0), iso(m["b"], z1), iso(m["a"], z1)], (ya - xa + yb - xb) / 2))
tous = [p for f in faces for p in f[2]]
ox, oy = min(p[0] for p in tous) - 12, min(p[1] for p in tous) - 12
lx = max(p[0] for p in tous) - ox + 190
ly = max(p[1] for p in tous) - oy + 12
v = [f'<svg class="vue3d" viewBox="0 0 {lx:.0f} {ly:.0f}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="v3-titre">'
     '<title id="v3-titre">Volume de P.118 : murs extérieurs des six niveaux aux altitudes déclarées, RDC actif</title>']
for nid in ORDRE:
    actif = " actif" if nid == "rdc" else ""
    for f in sorted((f for f in faces if f[0] == nid), key=lambda f: f[3]):
        v.append(f'<polygon class="{f[1]}{actif}" points="{" ".join("%.1f,%.1f" % (p[0] - ox, p[1] - oy) for p in f[2])}"/>')
for nid in ORDRE:
    n = niveaux[nid]
    ext = set(n["exteriorWallIds"])
    p = max((iso(m[k], n["elevation"] + n["height"] / 2) for m in n["walls"] if m["id"] in ext for k in ("a", "b")), key=lambda q: q[0])
    actif = " actif" if nid == "rdc" else ""
    v.append(f'<text class="niv{actif}" x="{p[0] - ox + 10:.0f}" y="{p[1] - oy + 4:.0f}">{esc(n["name"])} · {nombre(n["elevation"])} m</text>')
v.append("</svg>")
VUE3D = "\n".join(v)

# --- Navigateur du projet ----------------------------------------------------------------------------------
FAMILLES = [("walls", "Murs"), ("doors", "Portes"), ("windows", "Fenêtres"), ("columns", "Poteaux"),
            ("stairs", "Escaliers"), ("rooms", "Pièces"), ("paths", "Tracés et solides"), ("dims", "Cotations"),
            ("texts", "Textes")]
li = []
for n in domaines["levels"]:
    courant = ' aria-current="true"' if n["id"] == "rdc" else ""
    nb = sum(len(niveaux[n["id"]][k]) for k, _ in FAMILLES if k != "rooms")
    li.append(
        f'<li><button type="button" class="ligne"{courant}><span>{esc(n["name"])}</span>'
        f'<span class="fin muet">{nombre(n["elevation"])} m · h {nombre(n["height"])} m</span></button>'
        f'<span class="sr-only">{nb} objets</span></li>'
    )
NIVEAUX = '<ul class="liste">' + "".join(li) + "</ul>"

compte_calque = {}
for k, _ in FAMILLES:
    for o in rdc[k]:
        c = o.get("layer")
        if c:
            compte_calque[c] = compte_calque.get(c, 0) + 1
CALQUES = '<ul class="liste">' + "".join(
    f'<li><button type="button" class="ligne" aria-pressed="true"><span class="oeil" aria-hidden="true">●</span>'
    f'<span>{esc(c)}</span><span class="fin muet">{compte_calque.get(c, 0)}</span></button></li>'
    for c in rdc["layers"]
) + "</ul>"

total = {k: sum(len(niveaux[n][k]) for n in ORDRE) for k, _ in FAMILLES}
CLASSES = '<ul class="liste">' + "".join(
    f'<li><button type="button" class="ligne"><span>{lib}</span><span class="fin"><b>{len(rdc[k])}</b>'
    f'<span class="muet"> / {total[k]}</span></span></button></li>'
    for k, lib in FAMILLES
) + "</ul>"
EFFECTIFS = (
    f"{total['walls']} murs, {total['columns']} poteaux, {total['doors']} portes, {total['windows']} fenêtres, "
    f"{total['stairs']} escaliers, {total['paths']} tracés, {total['dims']} cotations, {total['texts']} textes, "
    f"{total['rooms']} pièces, {len(ORDRE)} niveaux, {len(rdc['layers'])} calques au RDC"
)

# --- Inspecteur --------------------------------------------------------------------------------------------
NON_EVAL = '<span class="nonev">non évaluée</span>'


def prop(cle, val, unite=None, statut=None, provenance=None, editable=False, seul_complet=False):
    classe = "prop seul-complet" if seul_complet else "prop"
    if editable:
        champ = (f'<span class="val"><input value="{esc(val)}" aria-label="{esc(cle)}">'
                 + (f'<span class="unite">{unite}</span>' if unite else "") + "</span>")
    else:
        champ = f'<span class="lu">{val}{" " + unite if unite else ""}</span>'
    meta = ""
    if provenance or statut:
        meta = (f'<span class="lien seul-complet">provenance <b>{provenance or "—"}</b> · statut '
                f'<b>{statut or "—"}</b></span>')
    return f'<div class="{classe}"><span class="cle">{cle}</span>{champ}{meta}</div>'


m = murs_rdc[MUR_SEL]
heberges = [o for o in rdc["doors"] + rdc["windows"] if o["hostWallId"] == MUR_SEL]
nb_portes = sum(1 for o in heberges if o["kind"] == "door")
INSP_MUR = "\n".join([
    f'<p class="objet-titre"><b>{esc(m["name"])}</b> <span class="muet">· mur · niveau RDC</span></p>',
    prop("Identifiant", f'<code>{esc(m["id"])}</code>', seul_complet=True),
    prop("Épaisseur", nombre(m["thickness"]), "m", "déclarée", "import", editable=True),
    prop("Hauteur", nombre(m["height"]), "m", "déclarée", "import", editable=True),
    prop("Type", "non typé <span class=\"muet\">(source sans type)</span>", provenance="import", statut="déclarée"),
    prop("Calque", esc(m["layer"])),
    prop("Extérieur", "oui <span class=\"muet\">(exteriorWallIds)</span>", provenance="import", statut="déclarée"),
    prop("Longueur", NON_EVAL, provenance="calcul (lot 1)", statut="—"),
    prop("Ouvertures hébergées", f"{len(heberges)} <span class=\"muet\">({nb_portes} porte, {len(heberges) - nb_portes} fenêtres)</span>"),
    prop("Alignement", NON_EVAL + ' <span class="muet">(source : lineRef absent)</span>' if "lineRef" not in m else esc(m["lineRef"]), seul_complet=True),
    prop("Couleur (provenance)", f'<code>{esc(m["color"])}</code>', provenance="import", statut="déclarée", seul_complet=True),
    prop("Classe IFC", "<code>IfcWall</code> <span class=\"muet\">(annexe C, lot 6)</span>", seul_complet=True),
])

portes = {o["id"]: o for o in rdc["doors"]}
p = portes[PORTE_SEL]
INSP_PORTE = "\n".join([
    f'<p class="objet-titre"><b>{esc(p["name"])}</b> <span class="muet">· porte · repère {esc(p["mark"])}</span></p>',
    prop("Mur hôte", f'{esc(murs_rdc[p["hostWallId"]]["name"])} <span class="muet">({esc(p["hostWallId"])})</span>'),
    prop("Largeur", nombre(p["width"]), "m", "déclarée", "import", editable=True),
    prop("Hauteur", nombre(p["height"]), "m", "déclarée", "import", editable=True),
    prop("Allège", nombre(p["sill"]), "m", "déclarée", "import", editable=True),
    prop("Position t", nombre(p["t"]), seul_complet=True, provenance="import", statut="déclarée"),
    prop("Distance le long du mur", NON_EVAL, provenance="calcul (lot 1)", statut="—"),
    prop("Ouverture", "battante <span class=\"muet\">(hinged)</span>" if p.get("openingType") == "hinged" else esc(p.get("openingType", "—"))),
    prop("Révision de conception", esc(p.get("designRevision", "—")), seul_complet=True),
    prop("Repère source", esc(p.get("sourceMarker", "—")), seul_complet=True),
])

# --- Problèmes ---------------------------------------------------------------------------------------------
passage = [(n, d) for n in ORDRE for d in niveaux[n]["doors"] if d.get("clearWidthVerified") is False]
rdc_passage = [d for n, d in passage if n == "rdc"]
PORTES_PASSAGE = (
    f'<span class="titre">Passage utile non vérifié · {len(passage)} portes '
    f'<span class="muet">(dont {len(rdc_passage)} au RDC)</span></span>'
    '<span class="det">Objet : ' + ", ".join(esc(d.get("mark") or d["id"].replace("EX118-rdc-", "")) for d in rdc_passage)
    + ' (RDC). Cause : la source déclare <code>clearWidthVerified: false</code>. Action : renseigner le passage '
    "utile mesuré ou laisser « à vérifier ».</span>"
)

# --- Hypothèses, sources, structure déclarée (R4 : jamais des exigences) -----------------------------------
meta = domaines["floorDesign"]["meta"]
HYPOTHESES = '<ul class="liste">' + "".join(
    f'<li><button type="button" class="ligne"><span><b>{esc(h[0])}</b> · {esc(h[1])}</span>'
    f'<span class="fin etiq-statut">hypothèse</span></button></li>'
    for h in meta["assumptions"]
) + "</ul>"


def source(s):
    if isinstance(s, dict):
        return s.get("id", "—"), s.get("title") or s.get("file", "—")
    return s[0], s[1]  # forme courte de la source : [id, fichier, usage]


SOURCES = '<ul class="liste">' + "".join(
    f'<li><span class="ligne"><b>{esc(i)}</b><span class="muet">{esc(t)}</span></span></li>'
    for i, t in map(source, meta["sources"])
) + "</ul>"
st = meta["structure"]
STRUCTURE = (
    f'<p><b>{esc(st["system"])}</b></p><ul class="controles">'
    f'<li class="attente">{esc(st["loadNature"])}</li>'
    f'<li class="attente">{esc(st["thicknessStatus"])}</li>'
    f'<li class="attente">{esc(st["designStatus"])}</li></ul>'
)
mc = rdc["meta"]["freightLift"]
MONTE_CHARGE = (
    f'<span class="titre">Monte-charge {esc(mc["shaftId"])} · capacité non évaluée</span>'
    f'<span class="det">Objet : gaine {esc(mc["shaftId"])}, {len(mc["stops"])} arrêts. Cause : la source déclare '
    f'la capacité absente (<code>capacityKg: null</code>) — « {esc(mc["status"])} » Action : renseigner avec '
    "le fournisseur, valeur sourcée.</span>"
)

BLOCS = {
    "PLAN-RDC": PLAN, "VUE3D": VUE3D, "NIVEAUX": NIVEAUX, "CALQUES": CALQUES, "CLASSES": CLASSES,
    "HYPOTHESES": HYPOTHESES, "SOURCES": SOURCES, "STRUCTURE": STRUCTURE, "MONTE-CHARGE": MONTE_CHARGE,
    "NB-HYP": str(len(meta["assumptions"])), "NB-SOURCES": str(len(meta["sources"])),
    "NB-PASSAGE": str(len(passage)), "NB-COTES": str(total["dims"]), "NB-PIECES": str(total["rooms"]),
    "INSP-MUR": INSP_MUR, "INSP-PORTE": INSP_PORTE, "PORTES-PASSAGE": PORTES_PASSAGE, "EFFECTIFS": EFFECTIFS,
}

# --- Injection ---------------------------------------------------------------------------------------------
verifier = "--verifier" in sys.argv
perime = []
for page in PAGES:
    chemin = MAQUETTE / page
    texte = chemin.read_text(encoding="utf-8")
    neuf = texte
    for cle, contenu in BLOCS.items():
        motif = re.compile(rf"(<!-- P118:{cle} -->).*?(<!-- /P118:{cle} -->)", re.S)
        neuf = motif.sub(lambda mm: mm.group(1) + contenu + mm.group(2), neuf)
    if neuf != texte:
        perime.append(page)
        if not verifier:
            chemin.write_text(neuf, encoding="utf-8")
    print(f"{page} : plan {L:.0f}×{H:.0f}, volume {lx:.0f}×{ly:.0f}", file=sys.stderr)
print("Effectifs P.118 : " + EFFECTIFS, file=sys.stderr)
if verifier and perime:
    print("Pages à régénérer : " + ", ".join(perime), file=sys.stderr)
    sys.exit(1)
