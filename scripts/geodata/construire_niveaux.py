#!/usr/bin/env python3
"""
Contours de tous les niveaux administratifs construits par union, de bas en haut, en suivant les liens du découpage
(D-GD-33, D-GD-42) — script hors application :

    python3 scripts/geodata/construire_niveaux.py [--pays MA] [--sortie docs/geodata/sources] [--intervalle 20]
                                                 [--mapshaper "npx --yes -p mapshaper@0.7.98 mapshaper"]

Aucun niveau n'est écrit dans ce script : les niveaux viennent de la table de données `decoupage/<pays>-niveaux.csv`
(rang, fiche de la couche, extrait des contours d'origine, table de correspondance), les entités et leurs parents de
`decoupage/hcp-rgph2024-entites.csv` (lus dans le fichier du HCP par `decoupage_hcp.py`). La hiérarchie se lit par le
lien parent → enfant ; sa profondeur varie selon l'endroit (arrondissement → préfecture d'arrondissements → commune →
province → région à Casablanca, arrondissement → commune → … dans les autres communes à arrondissements, commune → …
ailleurs).

1. Entités élémentaires (sans enfant) : leur contour d'origine est lu dans l'extrait de leur niveau (colonne `contours`,
   empreinte vérifiée) par la table de correspondance relue (colonne `correspondance`). Une entité élémentaire sans
   contour est listée (lacune signalée, jamais comblée) ; un contour sans entité n'est pas livré.
2. Une seule simplification, sur la topologie partagée (mapshaper : `snap`, `-simplify interval=… keep-shapes`,
   `-clean`) : une frontière commune à plusieurs entités n'existe qu'en un exemplaire.
3. Chaque entité qui a des enfants = union (`-dissolve2`) des entités élémentaires de sa descendance, niveau par niveau ;
   le contour d'origine d'une commune à arrondissements n'est donc pas repris : elle est l'union de ses arrondissements.
4. Sorties, pour chaque niveau qui a une fiche : le GeoJSON (`donnees/<fiche>.geojson`), l'empreinte et la déclaration
   `territoire` de la fiche, la table de correspondance des niveaux construits, et le rapport
   `docs/workstreams/geodata/CONTOURS-NIVEAUX.md` (comptes, chevauchements, lacunes, frontières partagées).

Dépendances : `pip install shapely` ; mapshaper (npm).
"""
import argparse
import csv
import hashlib
import json
import os
import shlex
import subprocess
import sys
import tempfile
from datetime import date

from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
RAPPORT = os.path.join(RACINE, "docs", "workstreams", "geodata", "CONTOURS-NIVEAUX.md")
MAPSHAPER = "npx --yes -p mapshaper@0.7.98 mapshaper"
ENTITES = "decoupage/hcp-rgph2024-entites.csv"
DECISION = "D-GD-42"
KM2 = 12_300  # degré² → km² approché à la latitude du Maroc (contrôles seulement)


def lire_json(chemin):
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def ecrire_json(chemin, x):
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(x, f, ensure_ascii=False, indent=2)
        f.write("\n")


def lire_csv(chemin):
    with open(chemin, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def extrait_osm(sortie, cle):
    """Extrait OpenStreetMap livré sans couche propre (D-GD-18), empreinte vérifiée avant toute lecture."""
    fi = lire_json(os.path.join(sortie, "donnees", "osm-extraits.json"))[cle]
    with open(os.path.join(sortie, fi["version"]["fichier"]), "rb") as f:
        octets = f.read()
    if hashlib.sha256(octets).hexdigest() != fi["version"]["empreinte"]:
        sys.exit(f"Empreinte inattendue pour {cle}")
    return fi, json.loads(octets)


def nombre_sommets(g):
    if g["type"] == "Polygon":
        return sum(len(a) for a in g["coordinates"])
    if g["type"] == "MultiPolygon":
        return sum(len(a) for p in g["coordinates"] for a in p)
    return 0


def lire_decoupage(sortie, pays):
    niveaux = lire_csv(os.path.join(sortie, "decoupage", f"{pays.lower()}-niveaux.csv"))
    for n in niveaux:
        n["rang"] = int(n["rang"])
    niveaux.sort(key=lambda n: n["rang"])
    entites = {e["code"]: e for e in lire_csv(os.path.join(sortie, ENTITES)) if e["pays"] == pays}
    enfants = {}
    for e in entites.values():
        if e["parent"]:
            enfants.setdefault(e["parent"], []).append(e["code"])
    return niveaux, entites, enfants


def ancetres(code, entites):
    """Codes de l'entité et de ses ancêtres, par niveau : {niveau: code}."""
    out = {}
    c = code
    while c:
        e = entites[c]
        out[e["niveau"]] = c
        c = e["parent"]
    return out


def preparer_entree(sortie, niveaux, entites, enfants):
    """Entités élémentaires avec leur contour d'origine et le code de chacun de leurs ancêtres (propriété = code du niveau)."""
    par_niveau = {n["code"]: n for n in niveaux}
    contours, extraits = {}, {}
    for n in niveaux:
        if not n["contours"]:
            continue
        fi, geo = extrait_osm(sortie, n["contours"])
        extraits[n["code"]] = (fi, len(geo["features"]))
        corr = {l["code_hcp"]: l for l in lire_csv(os.path.join(sortie, n["correspondance"])) if l["statut"] == "apparie" and l["code_hcp"]}
        par_contour = {f["properties"]["code"]: f for f in geo["features"]}
        for code, l in corr.items():
            f = par_contour.get(l["code_contour"])
            if f is not None:
                contours[code] = (f, l)
    feuilles, sans_contour = [], []
    for code, e in sorted(entites.items()):
        if code in enfants:
            continue
        if code not in contours:
            sans_contour.append(e)
            continue
        f, l = contours[code]
        props = {"code": code, "nom": e["nom"], "contour": l["code_contour"], "nom_contour": l["nom_contour"], "appariement": l["methode"], "niveau": e["niveau"]}
        props.update(ancetres(code, entites))
        feuilles.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
    # Contours rattachés à une entité qui a des enfants (commune à arrondissements) : remplacés par l'union de ses enfants.
    remplaces = sorted(c for c in contours if c in enfants)
    return feuilles, {"sans_contour": sans_contour, "remplaces": remplaces, "extraits": extraits, "par_niveau": par_niveau}


def lancer_mapshaper(commande, entree, dossier, intervalle, niveaux):
    sorties = {n["code"]: os.path.join(dossier, f"{n['code']}.json") for n in niveaux}
    args = shlex.split(commande) + ["-i", entree, "name=feuilles", "snap", "-simplify", f"interval={intervalle}", "keep-shapes", "-clean"]
    for n in niveaux:
        c = n["code"]
        args += ["-filter", f"this.properties[{json.dumps(c)}] != null", "target=feuilles", "+", f"name=f_{c}",
                 "-dissolve2", c, f"target=f_{c}", "+", f"name=n_{c}",
                 "-o", sorties[c], f"target=n_{c}", "format=geojson", "precision=0.000001"]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"mapshaper a échoué :\n{r.stdout}\n{r.stderr}")
    return sorties, (r.stdout + r.stderr).strip()


def collection(features):
    return {"type": "FeatureCollection", "features": sorted(features, key=lambda e: e["properties"]["code"])}


def octets_geojson(fc):
    return json.dumps(fc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()


def controler(couches, niveaux, plus_fin):
    """Contrôles géométriques par niveau : chevauchements entre voisines, lacunes (anneaux intérieurs), validité, et
    frontières : la limite de chaque niveau doit être incluse dans les limites des entités élémentaires."""
    res, geoms = {}, {}
    for n in niveaux:
        fc = couches[n["code"]]
        gs = [(f["properties"]["code"], shape(f["geometry"])) for f in fc["features"]]
        geoms[n["code"]] = gs
        tree = STRtree([g for _, g in gs]) if gs else None
        chev = []
        for i, (c, g) in enumerate(gs):
            for j in tree.query(g, predicate="overlaps"):
                if j > i:
                    a = g.intersection(gs[j][1]).area
                    if a > 1e-9:
                        chev.append((c, gs[j][0], a))
        trous = []
        for c, g in gs:
            for p in (list(g.geoms) if g.geom_type == "MultiPolygon" else [g]):
                for anneau in p.interiors:
                    trous.append((c, abs(shape({"type": "Polygon", "coordinates": [list(anneau.coords)]}).area)))
        res[n["code"]] = {"entites": len(gs), "sommets": sum(nombre_sommets(f["geometry"]) for f in fc["features"]), "chevauchements": chev,
                          "lacunes": trous, "invalides": [c for c, g in gs if not g.is_valid]}
    lim_feuilles = unary_union([g.boundary for _, g in plus_fin])
    for n in niveaux:
        lim = unary_union([g.boundary for _, g in geoms[n["code"]]])
        res[n["code"]]["frontiere_hors_feuilles_m"] = round(lim.difference(lim_feuilles.buffer(1e-9)).length * 111_000, 1)
    # Emprise : chaque niveau couvre la même surface que les niveaux au-dessus (là où il a des entités).
    u = {n["code"]: unary_union([g for _, g in geoms[n["code"]]]) for n in niveaux}
    res["ecarts_emprise_km2"] = {f"{a['code']}/{b['code']}": round(u[a["code"]].symmetric_difference(u[b["code"]]).area * KM2, 3)
                                 for a, b in zip(niveaux, niveaux[1:]) if a["contours"] == "" and b["contours"] == ""}
    return res


def mettre_a_jour_fiche(sortie, n, octets, info, intervalle, comptes, nom_pays, pays):
    chemin = os.path.join(sortie, f"{n['fiche']}.json")
    fi = lire_json(chemin)
    extraits = "; ".join(f"{info['par_niveau'][c]['pluriel'].lower()} : OpenStreetMap ({x[0]['version']['libelle']})" for c, x in info["extraits"].items())
    methode = (f"contours d'origine des entités élémentaires ({extraits}), topologie partagée accrochée, simplifiée une seule fois "
               f"(mapshaper, intervalle {intervalle} m, petites formes conservées) et nettoyée ; toute entité qui a des enfants dans le découpage en base "
               "est l'union de sa descendance")
    fi["version"]["libelle"] = "RGPH 2024 — population légale et indicateurs démographiques et socio-économiques (fichiers Excel HCP) ; " + methode
    fi["version"]["precision"] = ("Effectifs et taux officiels repris sans modification (taux arrondis au dixième par le HCP) ; contours construits par union de bas en haut "
                                  f"en suivant les liens parent → enfant du découpage HCP ({DECISION}) : une frontière est la même à tous les niveaux ; "
                                  "une entité élémentaire sans contour laisse une lacune signalée, jamais comblée")
    fi["version"]["empreinte"] = hashlib.sha256(octets).hexdigest()
    fi["couche"]["niveau"] = n["code"]
    fi["couche"]["proprietesExposees"] = ["code", "nom", "contour", "nom_contour", "appariement"] + [m["code"] for m in info["niveaux"] if m["rang"] < n["rang"]]
    fi["theme"] = "limites-administratives"
    fi["territoire"] = {"pays": pays, "nomPays": nom_pays, "niveau": n["code"]}
    fi["construction"] = {
        "decision": DECISION, "methode": "union de bas en haut suivant les liens parent → enfant du découpage en base, topologie partagée simplifiée une seule fois",
        "outil": "mapshaper 0.7.98", "intervalle_m": intervalle, "script": "scripts/geodata/construire_niveaux.py", "decoupage": ENTITES,
        "comptes": comptes, "rapport": "docs/workstreams/geodata/CONTOURS-NIVEAUX.md",
    }
    ecrire_json(chemin, fi)


def ecrire_correspondance(sortie, n, fc, entites):
    construites = {f["properties"]["code"]: f["properties"] for f in fc["features"]}
    lignes = []
    for code, e in sorted(entites.items()):
        if e["niveau"] != n["code"]:
            continue
        p = construites.get(code)
        lignes.append({"code_hcp": code, "nom_hcp": e["nom"], "code_contour": p["contour"] if p else "", "nom_contour": "",
                       "methode": p["appariement"] if p else "", "statut": "apparie" if p else "sans contour"})
    with open(os.path.join(sortie, n["correspondance"]), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["code_hcp", "nom_hcp", "code_contour", "nom_contour", "methode", "statut"])
        w.writeheader()
        w.writerows(sorted(lignes, key=lambda l: (l["statut"], l["code_hcp"])))


def construire(sortie=FICHES, intervalle=20, commande=MAPSHAPER, rapport=RAPPORT, pays="MA"):
    niveaux, entites, enfants = lire_decoupage(sortie, pays)
    feuilles, info = preparer_entree(sortie, niveaux, entites, enfants)
    info["niveaux"] = niveaux
    sommets_avant = sum(nombre_sommets(f["geometry"]) for f in feuilles)
    with tempfile.TemporaryDirectory() as d:
        entree = os.path.join(d, "entree.json")
        with open(entree, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": feuilles}, f, ensure_ascii=False)
        sorties, journal = lancer_mapshaper(commande, entree, d, intervalle, niveaux)
        brut = {c: lire_json(p) for c, p in sorties.items()}
    nb_feuilles = {}
    for f in feuilles:
        for c in f["properties"]:
            if c in info["par_niveau"]:
                nb_feuilles[(c, f["properties"][c])] = nb_feuilles.get((c, f["properties"][c]), 0) + 1
    par_code = {f["properties"]["code"]: f for f in feuilles}
    couches = {}
    for n in niveaux:
        c = n["code"]
        sup = [m["code"] for m in niveaux if m["rang"] < n["rang"]]
        out = []
        for f in brut[c]["features"]:
            if not f.get("geometry"):
                continue
            code = f["properties"][c]
            e = entites[code]
            elem = code not in enfants
            src = par_code.get(code) if elem else None
            props = {"code": code, "nom": e["nom"],
                     "contour": src["properties"]["contour"] if src else f"union:{nb_feuilles[(c, code)]} entités élémentaires",
                     "nom_contour": src["properties"]["nom_contour"] if src else "",
                     "appariement": src["properties"]["appariement"] if src else f"union de la descendance dans le découpage HCP ({DECISION})"}
            for s in sup:
                a = ancetres(code, entites).get(s)
                if a:
                    props[s] = a
            out.append({"type": "Feature", "properties": props, "geometry": f["geometry"]})
        couches[c] = collection(out)
    plus_fin = [(f["properties"]["code"], shape(f["geometry"])) for c in couches for f in couches[c]["features"] if f["properties"]["code"] not in enfants]
    controles = controler(couches, niveaux, plus_fin)
    declaration = lire_json(os.path.join(sortie, "decoupage", f"{pays.lower()}.json"))
    for n in niveaux:
        fc = couches[n["code"]]
        if not n["fiche"]:
            continue
        octets = octets_geojson(fc)
        with open(os.path.join(sortie, "donnees", f"{n['fiche']}.geojson"), "wb") as f:
            f.write(octets)
        r = controles[n["code"]]
        comptes = {"entites": r["entites"], "sommets": r["sommets"], "entites_elementaires_sans_contour": len(info["sans_contour"])}
        mettre_a_jour_fiche(sortie, n, octets, info, intervalle, comptes, declaration["nomPays"], pays)
        if not n["contours"]:
            ecrire_correspondance(sortie, n, fc, entites)
    ecrire_rapport(rapport, niveaux, entites, info, controles, sommets_avant, intervalle, journal, len(feuilles))
    return controles


def ecrire_rapport(chemin, niveaux, entites, info, c, sommets_avant, intervalle, journal, n_feuilles):
    L = [f"# Contours des niveaux administratifs construits par union, de bas en haut ({DECISION}, après D-GD-33)\n",
         f"Généré par `scripts/geodata/construire_niveaux.py` le {date.today().isoformat()} ; relancer le script régénère ce rapport.\n",
         "## Source\n",
         f"- Découpage : `{ENTITES}` (entités, niveaux et parents lus dans le fichier HCP par `decoupage_hcp.py`) et table des niveaux "
         "`decoupage/ma-niveaux.csv` ; aucun niveau n'est écrit dans le script."]
    for code, (fi, n) in info["extraits"].items():
        L.append(f"- Contours d'origine des {info['par_niveau'][code]['pluriel'].lower()} : extrait OpenStreetMap `{fi['version']['fichier']}` "
                 f"({fi['version']['libelle']}, {n} contours, licence ODbL), rattachés par `{info['par_niveau'][code]['correspondance']}`.")
    L.append("\n## Méthode\n")
    L.append(f"1. Entités élémentaires (sans enfant dans le découpage) : {n_feuilles} contours d'origine ; {len(info['sans_contour'])} sans contour (lacune signalée).")
    L.append(f"2. mapshaper 0.7.98 : `snap`, `-simplify interval={intervalle} keep-shapes`, `-clean`, **une seule fois, sur la topologie partagée**.")
    L.append("3. Chaque niveau : `-dissolve2` des entités élémentaires par le code de leur ancêtre à ce niveau (union de bas en haut).")
    L.append(f"4. Contours d'origine remplacés par l'union de leurs enfants (entités qui ont des enfants) : {len(info['remplaces'])} — "
             + ", ".join(f"{entites[x]['nom']} ({x})" for x in info["remplaces"]) + ".")
    L.append(f"5. Sommets des entités élémentaires : {sommets_avant} avant simplification.\n")
    L.append("## Comptes et contrôles par niveau\n")
    L.append("| Rang | Niveau | Entités en base | Contours livrés | Sommets | Chevauchements | Lacunes intérieures | Invalides | Frontière hors des limites élémentaires |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for n in niveaux:
        r = c[n["code"]]
        en_base = sum(1 for e in entites.values() if e["niveau"] == n["code"])
        L.append(f"| {n['rang']} | {n['pluriel']} | {en_base} | {r['entites']} | {r['sommets']} | {len(r['chevauchements'])} | {len(r['lacunes'])} | {len(r['invalides'])} | {r['frontiere_hors_feuilles_m']} m |")
    L.append("")
    L.append("- Écarts d'emprise entre niveaux construits successifs : " + ", ".join(f"{k} {v} km²" for k, v in c["ecarts_emprise_km2"].items()) + ".")
    L.append(f"- Entités élémentaires sans contour (lacune du niveau supérieur, signalée, jamais comblée) : {len(info['sans_contour'])}.")
    for e in info["sans_contour"]:
        chaine = []
        p = e["parent"]
        while p:
            chaine.append(entites[p]["nom"])
            p = entites[p]["parent"]
        L.append(f"  - {e['nom']} ({e['code']}) — {' › '.join(reversed(chaine))}")
    for n in niveaux:
        r = c[n["code"]]
        for a, b, s in r["chevauchements"][:20]:
            L.append(f"- chevauchement {n['code']} {a} / {b} : {s * KM2:.4f} km²")
        for code, s in r["lacunes"][:60]:
            L.append(f"- lacune intérieure {n['code']} {code} ({entites[code]['nom']}) : {s * KM2:.3f} km²")
    L.append("- Les lacunes intérieures des communes sont des enclaves d'autres communes ; celles des niveaux supérieurs viennent des communes sans contour.")
    L.append("- Les indicateurs RGPH 2024 restent reliés par le code HCP (`code`) à chaque niveau.\n")
    L.append("## Journal mapshaper\n")
    L.append("```\n" + journal + "\n```\n")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pays", default="MA")
    ap.add_argument("--sortie", default=FICHES)
    ap.add_argument("--intervalle", type=float, default=20, help="intervalle de simplification en mètres (une seule fois, topologie partagée)")
    ap.add_argument("--mapshaper", default=MAPSHAPER, help="commande mapshaper")
    ap.add_argument("--rapport", default=RAPPORT)
    a = ap.parse_args()
    c = construire(a.sortie, a.intervalle, a.mapshaper, a.rapport, a.pays)
    for k, r in c.items():
        if k == "ecarts_emprise_km2":
            print(f"écarts d'emprise : {r}")
            continue
        print(f"{k} : {r['entites']} entités, {r['sommets']} sommets, {len(r['chevauchements'])} chevauchements, {len(r['lacunes'])} lacunes, "
              f"{len(r['invalides'])} invalides, frontière hors limites élémentaires {r['frontiere_hors_feuilles_m']} m")
    print(f"rapport : {a.rapport}")


if __name__ == "__main__":
    main()
