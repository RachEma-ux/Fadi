#!/usr/bin/env python3
"""
Contours des niveaux administratifs construits à partir des communes (D-GD-33) — script hors application :

    python3 scripts/geodata/construire_niveaux.py [--sortie docs/geodata/sources] [--intervalle 20]
                                                 [--mapshaper "npx --yes -p mapshaper@0.7.98 mapshaper"]

Les régions et les provinces / préfectures ne sont plus des contours indépendants (geoBoundaries) : elles sont **construites
par union des communes** qui portent le même code géographique HCP (province = union des communes de son code, région =
union des provinces de son code), sur une **topologie partagée simplifiée une seule fois** (mapshaper : accrochage des
sommets, simplification Visvalingam avec conservation des petites formes, nettoyage des chevauchements et des
interstices). Une frontière commune à plusieurs entités n'existe qu'en un seul exemplaire, repris tel quel par les trois
niveaux : à tout zoom, une limite de région ou de province se superpose exactement aux limites des communes.

Entrées : l'extrait OpenStreetMap des communes (`donnees/osm-mar-communes.geojson`, empreinte vérifiée) et la table de
correspondance relue (`correspondances/hcp-rgph2024-communes.csv`) ; les noms des provinces et des régions viennent des
tables de correspondance des niveaux. Rien n'est deviné : une commune HCP sans contour est listée dans le rapport (le
niveau supérieur a alors une lacune, signalée, jamais comblée) ; un contour OSM sans unité HCP n'entre dans aucune union
et n'est pas livré. Sorties : les trois GeoJSON `hcp-rgph2024-population-{communes,provinces,regions}.geojson`, leurs
fiches (empreintes, contours, précision), les tables de correspondance des provinces et des régions, et le rapport
`docs/workstreams/geodata/CONTOURS-NIVEAUX.md` (source, méthode, comptes, contrôles). Le fichier des communes peut être
remplacé par un fichier officiel du HCP sans changer la logique. Dépendances : `pip install shapely` ; mapshaper (npm).
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
CLES = {"communes": "hcp-rgph2024-population-communes", "provinces": "hcp-rgph2024-population-provinces", "regions": "hcp-rgph2024-population-regions"}
DECISION = "D-GD-33"
# Mention de provenance des contours (D-GD-43) : ce ne sont pas des contours officiels du HCP.
PROVENANCE = ("géométries dérivées des contours communaux OpenStreetMap, agrégées selon les rattachements territoriaux HCP ; "
              "ce ne sont pas des contours officiels du HCP")


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


def preparer_entree(sortie):
    """Communes OSM rattachées à leur code HCP (table relue), avec le code de leur province et de leur région."""
    provinces = {r["code_hcp"]: r["nom_hcp"] for r in lire_csv(os.path.join(sortie, "correspondances", "hcp-rgph2024-provinces.csv")) if r["code_hcp"]}
    regions = {r["code_hcp"]: r["nom_hcp"] for r in lire_csv(os.path.join(sortie, "correspondances", "hcp-rgph2024-regions.csv")) if r["code_hcp"]}
    codes_provinces = sorted(provinces, key=len, reverse=True)
    lignes = lire_csv(os.path.join(sortie, "correspondances", "hcp-rgph2024-communes.csv"))
    par_contour = {l["code_contour"]: l for l in lignes if l["statut"] == "apparie"}
    sans_contour = [l for l in lignes if l["statut"] == "sans contour"]
    fi_osm, osm = extrait_osm(sortie, "osm-mar-communes")
    features, ecartes, ambigus = [], [], []
    for f in osm["features"]:
        code_contour = f["properties"]["code"]
        l = par_contour.get(code_contour)
        if not l:
            ecartes.append({"contour": code_contour, "nom": f["properties"].get("nom") or ""})
            continue
        province = next((p for p in codes_provinces if l["code_hcp"].startswith(p)), None)
        if not province:
            ambigus.append(l)
            continue
        region = province[:-3]
        if region not in regions:
            ambigus.append(l)
            continue
        features.append({"type": "Feature", "properties": {
            "code": l["code_hcp"], "nom": l["nom_hcp"], "contour": code_contour, "nom_contour": l["nom_contour"], "appariement": l["methode"],
            "province": province, "province_nom": provinces[province], "region": region, "region_nom": regions[region],
        }, "geometry": f["geometry"]})
    return features, {"provinces": provinces, "regions": regions, "sans_contour": sans_contour, "ecartes": ecartes, "ambigus": ambigus, "osm": fi_osm, "n_osm": len(osm["features"])}


def lancer_mapshaper(commande, entree, dossier, intervalle):
    sorties = {n: os.path.join(dossier, f"{n}.json") for n in ("communes", "provinces", "regions")}
    args = shlex.split(commande) + [
        "-i", entree, "snap",
        "-simplify", f"interval={intervalle}", "keep-shapes",
        "-clean",
        "-o", sorties["communes"], "format=geojson", "precision=0.000001",
        "-filter", "province != null", "+", "name=rattachees",
        "-dissolve2", "province", "copy-fields=region,province_nom,region_nom", "+", "name=provinces",
        "-o", sorties["provinces"], "format=geojson", "precision=0.000001",
        "-dissolve2", "region", "copy-fields=region_nom", "+", "name=regions",
        "-o", sorties["regions"], "format=geojson", "precision=0.000001",
    ]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"mapshaper a échoué :\n{r.stdout}\n{r.stderr}")
    return sorties, (r.stdout + r.stderr).strip()


def collection(features):
    return {"type": "FeatureCollection", "features": sorted(features, key=lambda e: e["properties"]["code"])}


def octets_geojson(fc):
    return json.dumps(fc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()


def controler(niveaux):
    """Contrôles géométriques : comptes, chevauchements entre voisines, lacunes (anneaux intérieurs), frontières partagées."""
    res = {}
    geoms = {}
    for n, fc in niveaux.items():
        gs = [(f["properties"]["code"], shape(f["geometry"])) for f in fc["features"]]
        geoms[n] = gs
        tree = STRtree([g for _, g in gs])
        chev = []
        for i, (c, g) in enumerate(gs):
            for j in tree.query(g, predicate="overlaps"):
                if j > i:
                    a = g.intersection(gs[j][1]).area
                    if a > 1e-9:
                        chev.append((c, gs[j][0], a))
        trous = []
        for c, g in gs:
            polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
            for p in polys:
                for anneau in p.interiors:
                    trous.append((c, abs(shape({"type": "Polygon", "coordinates": [list(anneau.coords)]}).area)))
        invalides = [c for c, g in gs if not g.is_valid]
        res[n] = {"entites": len(gs), "sommets": sum(nombre_sommets(f["geometry"]) for f in fc["features"]), "chevauchements": chev, "lacunes": trous, "invalides": invalides}
    # Frontières partagées : la limite de chaque niveau supérieur doit être incluse dans les limites des communes.
    lim_communes = unary_union([g.boundary for _, g in geoms["communes"]])
    for n in ("provinces", "regions"):
        lim = unary_union([g.boundary for _, g in geoms[n]])
        hors = lim.difference(lim_communes.buffer(1e-9))
        res[n]["frontiere_hors_communes_m"] = round(hors.length * 111_000, 1)
    # Union des provinces = union des régions (même emprise).
    u_prov = unary_union([g for _, g in geoms["provinces"]])
    u_reg = unary_union([g for _, g in geoms["regions"]])
    res["ecart_emprise_provinces_regions_km2"] = round(u_prov.symmetric_difference(u_reg).area * 12_300, 3)
    return res


def mettre_a_jour_fiche(sortie, niveau, octets, fi_osm, intervalle, info, comptes):
    chemin = os.path.join(sortie, f"{CLES[niveau]}.json")
    fi = lire_json(chemin)
    lib_osm = fi_osm["version"]["libelle"]
    methode = ("contours des communes OpenStreetMap (" + lib_osm + "), topologie partagée accrochée, simplifiée une seule fois "
               f"(mapshaper, intervalle {intervalle} m, petites formes conservées) et nettoyée")
    if niveau == "communes":
        fi["version"]["libelle"] = "RGPH 2024 — population légale et indicateurs démographiques et socio-économiques (fichiers Excel HCP) ; " + methode
        fi["version"]["precision"] = ("Effectifs et taux officiels repris sans modification (taux arrondis au dixième par le HCP) ; " + PROVENANCE
                                      + f" ; contours OpenStreetMap simplifiés une seule fois sur la topologie partagée des trois niveaux ({DECISION}, intervalle {intervalle} m)")
    else:
        unite = "provinces / préfectures" if niveau == "provinces" else "régions"
        base = "des communes de même code HCP" if niveau == "provinces" else "des provinces et préfectures de même code HCP (elles-mêmes union des communes)"
        fi["version"]["libelle"] = ("RGPH 2024 — population légale et indicateurs démographiques et socio-économiques (fichiers Excel HCP) ; "
                                    f"contours des {unite} construits par union {base}, sur " + methode)
        fi["version"]["precision"] = ("Effectifs et taux officiels repris sans modification (taux arrondis au dixième par le HCP) ; " + PROVENANCE
                                      + f" ; contours construits par union {base} ({DECISION}) : une frontière est la même à tous les niveaux ; une commune HCP "
                                      "sans contour laisse une lacune signalée, jamais comblée, et son contour parent est marqué partiel "
                                      "(propriétés contour_complet et communes_sans_contour)")
        fi["version"]["licence"] = "Valeurs : Creative Commons Attribution 4.0 (CC BY 4.0, CGU du HCP v1.0 § 3) ; contours : " + fi_osm["version"]["licence"]
        fi["version"]["attribution"] = "HCP, RGPH 2024 (CC BY 4.0), données retraitées ; " + fi_osm["version"]["attribution"]
        cond = fi["version"]["conditions"]
        fi["version"]["conditions"] = cond[:cond.index(". Contours : ")] + ". Contours : " + fi_osm["version"]["conditions"] if ". Contours : " in cond else cond
        fi["producteur"] = "Haut-Commissariat au Plan (HCP), Recensement général de la population et de l'habitat 2024 ; contours : " + fi_osm["producteur"]
        desc = fi["description"]
        for ancien in ("sur les contours geoBoundaries ADM1.", "sur les contours geoBoundaries ADM2."):
            desc = desc.replace(ancien, f"sur des contours construits par union {base} (OpenStreetMap, {DECISION}).")
        fi["description"] = desc
        fi["couche"]["description"] = f"Valeurs RGPH 2024 sur des contours construits par union {base} ; code = code géographique HCP."
        fi["couche"]["proprietesExposees"] = ["code", "nom", "contour", "appariement"] + (["region"] if niveau == "provinces" else []) + ["contour_complet", "communes_sans_contour"]
    if niveau == "communes":
        fi["couche"]["proprietesExposees"] = ["code", "nom", "contour", "nom_contour", "appariement", "province", "region"]
    fi["version"]["empreinte"] = hashlib.sha256(octets).hexdigest()
    fi["construction"] = {
        "decision": DECISION, "methode": "union des communes par code HCP, topologie partagée simplifiée une seule fois", "outil": "mapshaper 0.7.98",
        "intervalle_m": intervalle, "script": "scripts/geodata/construire_niveaux.py", "comptes": comptes, "rapport": "docs/workstreams/geodata/CONTOURS-NIVEAUX.md",
    }
    ecrire_json(chemin, fi)


def ecrire_correspondance(sortie, niveau, fc, info):
    chemin = os.path.join(sortie, "correspondances", f"hcp-rgph2024-{niveau}.csv")
    noms = info["provinces"] if niveau == "provinces" else info["regions"]
    construites = {f["properties"]["code"]: f["properties"] for f in fc["features"]}
    lignes = []
    for code, nom in sorted(noms.items()):
        p = construites.get(code)
        if p:
            lignes.append({"code_hcp": code, "nom_hcp": nom, "code_contour": p["contour"], "nom_contour": "", "methode": p["appariement"], "statut": "apparie"})
        else:
            lignes.append({"code_hcp": code, "nom_hcp": nom, "code_contour": "", "nom_contour": "", "methode": "", "statut": "sans contour"})
    with open(chemin, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["code_hcp", "nom_hcp", "code_contour", "nom_contour", "methode", "statut"])
        w.writeheader()
        w.writerows(sorted(lignes, key=lambda l: (l["statut"], l["code_hcp"])))


def construire(sortie=FICHES, intervalle=20, commande=MAPSHAPER, rapport=RAPPORT):
    features, info = preparer_entree(sortie)
    if info["ambigus"]:
        sys.exit(f"{len(info['ambigus'])} communes au rattachement ambigu (aucune province de leur code) : {info['ambigus'][:3]}")
    sommets_avant = sum(nombre_sommets(f["geometry"]) for f in features)
    with tempfile.TemporaryDirectory() as d:
        entree = os.path.join(d, "entree.json")
        with open(entree, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False)
        sorties, journal = lancer_mapshaper(commande, entree, d, intervalle)
        brut = {n: lire_json(c) for n, c in sorties.items()}
    # Communes : propriétés reprises telles quelles ; niveaux supérieurs : code HCP, nom HCP, contour « union ».
    communes = [{"type": "Feature", "properties": {k: f["properties"][k] for k in ("code", "nom", "contour", "nom_contour", "appariement", "province", "region")}, "geometry": f["geometry"]}
                for f in brut["communes"]["features"] if f.get("geometry")]
    par_province = {}
    for f in communes:
        par_province.setdefault(f["properties"]["province"], []).append(f["properties"]["code"])
    # Communes HCP sans contour, par province : un niveau supérieur construit sans elles est **partiel** (contour_complet
    # faux, nombre de communes manquantes) ; il n'est jamais présenté comme un contour complet.
    manquantes_par_province = {}
    for l in info["sans_contour"]:
        p = next((p for p in sorted(info["provinces"], key=len, reverse=True) if l["code_hcp"].startswith(p)), "?")
        manquantes_par_province.setdefault(p, []).append(l)
    provinces = [{"type": "Feature", "properties": {
        "code": f["properties"]["province"], "nom": f["properties"]["province_nom"], "contour": f"union:{len(par_province[f['properties']['province']])} communes",
        "appariement": "union des communes de même code HCP (" + DECISION + ")", "region": f["properties"]["region"],
        "communes_sans_contour": len(manquantes_par_province.get(f["properties"]["province"], [])),
        "contour_complet": not manquantes_par_province.get(f["properties"]["province"]),
    }, "geometry": f["geometry"]} for f in brut["provinces"]["features"] if f.get("geometry")]
    manquantes_par_region = {}
    for p in provinces:
        r = p["properties"]["region"]
        manquantes_par_region[r] = manquantes_par_region.get(r, 0) + p["properties"]["communes_sans_contour"]
    regions = [{"type": "Feature", "properties": {
        "code": f["properties"]["region"], "nom": f["properties"]["region_nom"],
        "contour": f"union:{sum(1 for p in provinces if p['properties']['region'] == f['properties']['region'])} provinces",
        "appariement": "union des provinces et préfectures de même code HCP (" + DECISION + ")",
        "communes_sans_contour": manquantes_par_region.get(f["properties"]["region"], 0),
        "contour_complet": manquantes_par_region.get(f["properties"]["region"], 0) == 0,
    }, "geometry": f["geometry"]} for f in brut["regions"]["features"] if f.get("geometry")]
    niveaux = {"communes": collection(communes), "provinces": collection(provinces), "regions": collection(regions)}
    controles = controler(niveaux)
    fi_osm = info["osm"]
    for n, fc in niveaux.items():
        octets = octets_geojson(fc)
        with open(os.path.join(sortie, "donnees", f"{CLES[n]}.geojson"), "wb") as f:
            f.write(octets)
        comptes = {"entites": controles[n]["entites"], "sommets": controles[n]["sommets"], "communes_hcp_sans_contour": len(info["sans_contour"]), "contours_osm_ecartes": len(info["ecartes"])}
        mettre_a_jour_fiche(sortie, n, octets, fi_osm, intervalle, info, comptes)
        if n != "communes":
            ecrire_correspondance(sortie, n, fc, info)
    ecrire_rapport(rapport, info, controles, sommets_avant, intervalle, journal, manquantes_par_province)
    return controles


def ecrire_rapport(chemin, info, c, sommets_avant, intervalle, journal, manquantes):
    L = []
    L.append(f"# Contours des niveaux administratifs construits à partir des communes ({DECISION})\n")
    L.append(f"Généré par `scripts/geodata/construire_niveaux.py` le {date.today().isoformat()} ; relancer le script régénère ce rapport.\n")
    L.append("## Source\n")
    L.append(f"- Communes : extrait OpenStreetMap `donnees/osm-mar-communes.geojson` ({info['osm']['version']['libelle']}, {info['n_osm']} contours, "
             "licence ODbL), rattachées à leur code géographique HCP par la table relue `correspondances/hcp-rgph2024-communes.csv` "
             "(`preparer_hcp.py`, D-GD-17). Ce fichier peut être remplacé par un fichier officiel du HCP sans changer la logique : les "
             "provinces et les régions sont recalculées.")
    L.append("- Codes HCP : province = plus long code de province dont le code de la commune est le préfixe ; région = code de province sans ses "
             "trois derniers chiffres. Les noms viennent des tables `correspondances/hcp-rgph2024-{provinces,regions}.csv`.")
    L.append("- geoBoundaries (ADM1 / ADM2) n'est plus utilisé pour aucun contour livré ; ses fiches de référence ne servent plus qu'au "
             "rattachement des communes par la géographie dans `preparer_hcp.py`.\n")
    L.append("## Méthode\n")
    L.append(f"1. Rattachement de chaque contour OSM apparié à son code HCP de commune, de province et de région ({len(info['sans_contour'])} communes HCP sans contour, "
             f"{len(info['ecartes'])} contours OSM sans unité HCP, {len(info['ambigus'])} rattachement ambigu).")
    L.append(f"2. mapshaper 0.7.98 : `snap` (accrochage des sommets voisins), `-simplify interval={intervalle} keep-shapes` (Visvalingam, petites formes conservées), "
             "`-clean` (chevauchements et interstices résiduels), **une seule fois, sur la topologie partagée** : une frontière commune n'existe qu'en un exemplaire.")
    L.append("3. Provinces / préfectures : `-dissolve2 province` (union des communes de même code) ; régions : `-dissolve2 region` sur les provinces.")
    L.append(f"4. Sommets : {sommets_avant} avant, {c['communes']['sommets']} après pour les communes ; {c['provinces']['sommets']} provinces ; {c['regions']['sommets']} régions.")
    L.append("5. Les tuiles de l'API ne simplifient plus séparément ces contours (quantification MVT seule) : les limites se superposent à tous les zooms.\n")
    L.append("## Comptes\n")
    L.append(f"- Régions construites : {c['regions']['entites']} / {len(info['regions'])} ; provinces et préfectures : {c['provinces']['entites']} / {len(info['provinces'])} ; "
             f"communes livrées : {c['communes']['entites']} (rattachées à un code HCP).")
    L.append(f"- Communes HCP sans contour (lacune du niveau supérieur, signalée, jamais comblée ; le parent est marqué partiel : `contour_complet` faux, `communes_sans_contour` > 0) : {len(info['sans_contour'])}.")
    L.append(f"- Contours partiels : {len(manquantes)} provinces / préfectures, "
             f"{len({p[:-3] for p in manquantes})} régions ; tous les autres sont complets (`contour_complet` vrai).")
    for p, ls in sorted(manquantes.items()):
        L.append(f"  - {info['provinces'].get(p, p)} ({p}) : " + ", ".join(f"{l['nom_hcp']} ({l['code_hcp']})" for l in ls))
    L.append(f"- Contours OSM sans unité HCP, écartés (entièrement inclus dans une commune rattachée, aucune valeur) : {len(info['ecartes'])} — "
             + ", ".join(e["contour"] + (f" ({e['nom']})" if e["nom"] else "") for e in info["ecartes"]) + ".\n")
    L.append("## Contrôles\n")
    for n in ("communes", "provinces", "regions"):
        r = c[n]
        L.append(f"- {n} : {r['entites']} entités, {r['sommets']} sommets, {len(r['chevauchements'])} chevauchement(s) entre voisines, {len(r['lacunes'])} lacune(s) intérieure(s), "
                 f"{len(r['invalides'])} géométrie(s) invalide(s)" + (f" ; frontière hors des limites de communes : {r['frontiere_hors_communes_m']} m" if "frontiere_hors_communes_m" in r else "") + ".")
        for a, b, s in r["chevauchements"][:20]:
            L.append(f"  - chevauchement {a} / {b} : {s * 12_300:.4f} km²")
        for code, s in r["lacunes"][:40]:
            L.append(f"  - lacune dans {code} : {s * 12_300:.3f} km²")
    L.append(f"- Écart d'emprise entre l'union des provinces et l'union des régions : {c['ecart_emprise_provinces_regions_km2']} km².")
    L.append("- Les indicateurs RGPH 2024 restent reliés par le code HCP (`code`) à chaque niveau : tableaux de valeurs inchangés.\n")
    L.append("## Journal mapshaper\n")
    L.append("```\n" + journal + "\n```\n")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sortie", default=FICHES)
    ap.add_argument("--intervalle", type=float, default=20, help="intervalle de simplification en mètres (une seule fois, topologie partagée)")
    ap.add_argument("--mapshaper", default=MAPSHAPER, help="commande mapshaper")
    ap.add_argument("--rapport", default=RAPPORT)
    a = ap.parse_args()
    c = construire(a.sortie, a.intervalle, a.mapshaper, a.rapport)
    for n in ("communes", "provinces", "regions"):
        r = c[n]
        print(f"{n} : {r['entites']} entités, {r['sommets']} sommets, {len(r['chevauchements'])} chevauchements, {len(r['lacunes'])} lacunes, {len(r['invalides'])} invalides"
              + (f", frontière hors communes {r['frontiere_hors_communes_m']} m" if "frontiere_hors_communes_m" in r else ""))
    print(f"rapport : {a.rapport}")


if __name__ == "__main__":
    main()
