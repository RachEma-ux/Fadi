#!/usr/bin/env python3
"""
Captures de contrôle des contours (D-GD-44) — script hors application : trace en SVG les communes (gris), provinces
(bleu) et régions (rouge) de trois GeoJSON `<dossier>/<etat>-{communes,provinces,regions}.geojson` sur l'emprise de
Tétouan, pour comparer deux états aux mêmes emprise et échelle :

    python3 -I scripts/geodata/rendre_contours.py <dossier> <avant|apres> "<titre>"

Les captures illustrent ; les contrôles géométriques sont dans `apps/api/src/db/geodata-sources.test.ts`.
"""
import json, sys
dossier, etat, titre = sys.argv[1], sys.argv[2], sys.argv[3]
O, Sd, E, N = -5.80, 35.30, -5.00, 35.95
L, H = 1000, int(1000 * (N - Sd) / (E - O) * 1.22)
def xy(c):
    return (c[0] - O) / (E - O) * L, (N - c[1]) / (N - Sd) * H
def chemins(g):
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    out = []
    for p in polys:
        for a in p:
            if all(not (O - .3 < c[0] < E + .3 and Sd - .3 < c[1] < N + .3) for c in a):
                continue
            out.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in map(xy, a)) + "Z")
    return " ".join(out)
styles = {"communes": ("#9aa0a6", 0.8), "provinces": ("#1f6fd1", 2.2), "regions": ("#d1341f", 4.0)}
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{L}" height="{H+60}" viewBox="0 0 {L} {H+60}"><rect width="100%" height="100%" fill="#fff"/>',
       f'<text x="12" y="28" font-family="sans-serif" font-size="20" font-weight="bold">{titre}</text>',
       f'<g transform="translate(0,40)"><clipPath id="c"><rect width="{L}" height="{H}"/></clipPath><g clip-path="url(#c)" fill="none" stroke-linejoin="round">']
for k in ("regions", "provinces", "communes"):
    couleur, ep = styles[k]
    d = " ".join(chemins(f["geometry"]) for f in json.load(open(f"{dossier}/{etat}-{k}.geojson"))["features"] if f.get("geometry"))
    svg.append(f'<path d="{d}" stroke="{couleur}" stroke-width="{ep}" stroke-opacity="{0.55 if k == "regions" else 0.8}"/>')
svg.append(f'</g></g><g font-family="sans-serif" font-size="14"><text x="12" y="{H+30}">— régions (rouge)   — provinces / préfectures (bleu)   — communes (gris)   emprise : lon {O} à {E}, lat {Sd} à {N}</text></g></svg>')
open(f"{dossier}/{etat}.svg", "w").write("".join(svg))
