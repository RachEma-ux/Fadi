#!/usr/bin/env python3
"""
Base des services publics du Maroc : MTNRA (maps.service-public.ma, data.gov.ma, mai 2022, ODbL) **fusionné** avec
OpenStreetMap (administrations, hôpitaux et cliniques, gares ; ODbL) — script de préparation GeoData (D-GD-42, D-GD-44),
hors application :

    python3 -I scripts/geodata/preparer_services_publics.py --excel donnees-geoportail-open-data-2022.xlsx [--sortie <dossier>]

Fusion sans doublon (D-GD-44) : chaque objet n'existe qu'une fois. Un objet OSM est **apparié** à un point du MTNRA quand,
à moins de 150 m, ce point est de la même famille (gare, santé, administration, reconnue par des mots du nom du MTNRA), du
même échelon (régional, provincial, central, quand les deux noms le disent) et que les deux noms partagent au moins la
moitié de leurs mots distinctifs (Jaccard ≥ 0,5, hors mots vides, noms de lieux et mots génériques comme « clinique »,
« gare », « direction » ; les numéros ne comptent pas), sans natures de service incompatibles (école et tribunal, stade
et palais, chambre et direction…), ou que leurs noms français (à accents, casse et ponctuation près) ou arabes sont
identiques ; avec un seul candidat, l'objet OSM est
fusionné dans le point du MTNRA (attributs du MTNRA gardés, référence OSM ajoutée : `source` = `mtnra+osm`, `osm`) ; avec
plusieurs candidats, il est gardé et cite les candidats (`doublon_probable`) ; sans candidat, il est ajouté (`source` =
`osm`). Le rattachement régional d'un objet OSM se fait par le contour, sinon par le contour régional le plus proche
(lacunes des communes sans contour), distance consignée.

Source : « Coordonnées alphanumériques des administrations disponibles sur le portail maps.service-public.ma »,
Ministère de la Transition numérique et de la Réforme de l'Administration (MTNRA), data.gov.ma, fichier
`donnees-geoportail-open-data-2022.xlsx` (empreinte contrôlée ci-dessous ; une autre empreinte est refusée, par exemple
une copie réenregistrée par un tableur, qui change les caractères des adresses).

La source compte plus de 5 000 points (borne d'une couche V1) et n'a pas de colonne de type : elle est répartie en une
couche par région du RGPH 2024, par l'appartenance du point au contour de la région livré
(`donnees/hcp-rgph2024-population-regions.geojson`) — aucun classement deviné. Ces contours ont des lacunes (communes du
HCP sans contour OSM, D-GD-33 : Agadir, Al Hoceima…) : un point hors de tout contour est rattaché par la « Province (fr) »
publiée par la source — d'abord la province du RGPH de même nom (`donnees/hcp-rgph2024-population-provinces.geojson`,
nom comparé sans « Province / Préfecture de », accents, casse ni ponctuation), sinon la région où tombent tous les points
de la même province de la source situés dans un contour (propriété `rattachement` : contour, province-hcp,
province-source) ; sinon il est écarté et compté dans la fiche. Rapprochement avec le découpage du RGPH (D-GD-42),
consigné sur chaque objet sans rien corriger : `province_hcp` (code de la province du RGPH de même nom que la province
publiée, absent si aucune) et `concordance` (`concorde` : cette province est dans la région de la couche ; `discorde` :
elle est dans une autre région ; `non-appariee` : aucune province du RGPH de ce nom). Le rapprochement par commune
attend des contours communaux complets (D-GD-33). Doublons de la source : une ligne strictement identique à une ligne
précédente n'est pas reprise une seconde fois (écartée, listée dans la fiche) ; deux lignes de même nom au même point
mais aux autres champs différents sont gardées (aucun choix entre elles) et se citent l'une l'autre
(`doublon_probable`). Le fichier d'origine est archivé tel quel
(`donnees/mtnra-services-publics-2022-origine.xlsx`, D-GD-29). Aucun point n'est déplacé. Chaque ligne garde son numéro de
ligne dans la source (code `l<ligne>`) et ses champs tels que publiés (vides omis, aucun champ corrigé ; code postal lu
en nombre écrit sans « .0 »).
"""
import argparse
import hashlib
import math
import json
import os
import re
import sys
import unicodedata

import openpyxl

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
MAX_OBJETS = 5000
EMPREINTE_SOURCE = "7d1a4d308bd89089e18fff9639a2ab90e976d7efd1bfa13c1a28524c64a6f920"
URL_JEU = "https://data.gov.ma/data/fr/dataset/coordonnees-alphanumeriques-des-administrations-disponibles-sur-le-portail-maps-service-public-ma"
URL_FICHIER = ("https://data.gov.ma/data/fr/dataset/ae610ab4-9300-41cd-876b-f66ff60cc05e/resource/"
               "6898670a-b11f-416a-8aa3-30692b2841a7/download/donnees-geoportail-open-data-2022.xlsx")
ORIGINE = "donnees/mtnra-services-publics-2022-origine.xlsx"
REGIONS = "donnees/hcp-rgph2024-population-regions.geojson"
PROVINCES = "donnees/hcp-rgph2024-population-provinces.geojson"
# Entrées OpenStreetMap (extraits sans couche propre, fiches dans `donnees/osm-extraits.json`) et famille de chacune.
OSM = {"osm-mar-administrations": "administration", "osm-mar-etablissements-sante": "sante", "osm-mar-gares": "gare"}
TAGS_OSM = ["name", "name:fr", "name:ar", "amenity", "office", "government", "healthcare", "operator", "operator:type", "railway", "station"]
RAYON_M = 150
FAMILLES = [("gare", re.compile(r"\bgares?\b|ferrovi|oncf", re.I)),
            ("sante", re.compile(r"h[oô]pital|clinique|sant[ée]|dispensaire|hospitalier|\bchu\b|m[ée]dical|maternit|urgence", re.I))]
VIDES = {"de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux", "en", "al", "el", "sur", "pour"}
GENERIQUES = {"gare", "gares", "ferroviaire", "ferroviare", "oncf", "station", "hopital", "clinique", "polyclinique", "centre", "sante",
              "medical", "hospitalier", "dispensaire", "chu", "universitaire", "provincial", "regional", "regionale", "provinciale",
              "direction", "delegation", "agence", "annexe", "service", "services", "bureau", "siege", "commune", "rurale", "urbaine",
              "prefecture", "province", "region", "tribunal", "instance", "premiere", "1ere", "cour", "ministere", "national", "nationale",
              "administration", "administrative", "caidat", "pachalik", "cercle", "arrondissement", "maroc", "royaume", "public", "publique",
              "ecole", "auto", "autos", "police", "siege", "office", "ministry", "of", "ministere"}
DROITS_OUVERTS = {u: "autorise" for u in ["consultation", "stockage", "calcul", "tuiles", "commercial", "partage", "telechargement", "export"]}
# Colonnes de la source (ligne d'en-tête, dans l'ordre) → propriété de l'objet.
COLONNES = [
    ("Nom français", "nom"), ("Nom arabe", "nom_ar"), ("Adresse (fr)", "adresse"), ("Telephone", "telephone"),
    ("Autre telephone", "autre_telephone"), ("Fax", "fax"), ("Site web", "site_web"), ("Email", "email"), ("WKT", None),
    ("Numéro (fr)", "numero"), ("Nom de rue (fr)", "rue"), ("Quartier (fr)", "quartier"), ("Boite postale (fr)", "boite_postale"),
    ("Code postal (fr)", "code_postal"), ("Ville ou Commune (fr)", "ville"), ("Commune (fr)", "commune"), ("Province (fr)", "province"),
    ("Adresse (ar)", "adresse_ar"), ("Numéro (ar)", "numero_ar"), ("Nom de rue (ar)", "rue_ar"), ("Quartier (ar)", "quartier_ar"),
    ("Ville ou Commune (ar)", "ville_ar"), ("Commune (ar)", "commune_ar"), ("Province (ar)", "province_ar"),
]
POINT = re.compile(r"^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$")


def sha256(octets):
    return hashlib.sha256(octets).hexdigest()


def texte(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def dans_anneau(x, y, anneau):
    dedans = False
    j = len(anneau) - 1
    for i in range(len(anneau)):
        xi, yi = anneau[i][0], anneau[i][1]
        xj, yj = anneau[j][0], anneau[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dedans = not dedans
        j = i
    return dedans


def polygones(geometrie):
    return [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]


def dans_geometrie(x, y, polys):
    return any(dans_anneau(x, y, p[0]) and not any(dans_anneau(x, y, t) for t in p[1:]) for p in polys)


def boite(polys):
    xs = [c[0] for p in polys for c in p[0]]
    ys = [c[1] for p in polys for c in p[0]]
    return min(xs), min(ys), max(xs), max(ys)


def nom_compare(nom):
    s = unicodedata.normalize("NFKD", nom.casefold())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"^(province|prefecture)( d'| de | des | du )", "", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def slug(nom):
    s = nom.lower()
    for prefixe in ("région de l'", "région de ", "préfecture de ", "préfecture d'", "province de ", "province d'"):
        s = s.replace(prefixe, "")
    for a, b in (("â", "a"), ("é", "e"), ("è", "e"), ("ê", "e"), ("ô", "o"), ("î", "i"), ("'", "-")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def sans_accents(s):
    s = unicodedata.normalize("NFKD", (s or "").casefold())
    return "".join(c for c in s if not unicodedata.combining(c))


def mots(s):
    return {t for t in re.findall(r"\w+", sans_accents(s)) if t not in VIDES and len(t) > 1 and not any(ch.isdigit() for ch in t)}


def semblables(a, b):
    """Au moins la moitié des mots distinctifs de chaque nom en commun (indice de Jaccard ≥ 0,5)."""
    return bool(a and b) and len(a & b) / len(a | b) >= 0.5


NIVEAUX = [("regional", re.compile(r"r[ée]gional", re.I)), ("provincial", re.compile(r"provincial|pr[ée]fectoral|d[ée]l[ée]gation", re.I)),
           ("central", re.compile(r"minist[eè]re|ministry|central", re.I))]


def meme_niveau(a, b):
    """Deux services d'échelons différents (régional, provincial, central) ne sont jamais le même objet."""
    na = {k for k, m in NIVEAUX if m.search(a or "")}
    nb = {k for k, m in NIVEAUX if m.search(b or "")}
    return not na or not nb or na == nb


# Natures de service : deux noms qui en nomment chacun une, sans nature commune, désignent deux services différents.
NATURES = {
    "clinique": {"clinique", "polyclinique"}, "hopital": {"hopital", "hospital", "chu", "hospitalier"}, "radiologie": {"radiologie"},
    "laboratoire": {"laboratoire"}, "arrondissement": {"arrondissement"}, "annexe": {"annexe"},
    "commune": {"commune", "municipalite", "mairie", "cummune", "baladia"}, "direction": {"direction"}, "delegation": {"delegation"},
    "chambre": {"chambre"}, "ministere": {"ministere", "ministry"}, "ecole": {"ecole"}, "lycee": {"lycee"}, "college": {"college"},
    "tribunal": {"tribunal"}, "cour": {"cour"}, "stade": {"stade"}, "palais": {"palais"}, "gendarmerie": {"gendarmerie"},
    "police": {"police", "commissariat", "surete"}, "office": {"office"}, "agence": {"agence"}, "perception": {"perception"},
    "tresorerie": {"tresorerie"}, "regie": {"regie", "distribution"}, "siege": {"siege"}, "consulat": {"consulat"},
}


def natures(nom):
    m = set(re.findall(r"\w+", sans_accents(nom)))
    return {k for k, v in NATURES.items() if m & v}


def natures_compatibles(a, b):
    na, nb = natures(a), natures(b)
    return not na or not nb or bool(na & nb)


def famille(nom):
    return next((f for f, motif in FAMILLES if motif.search(nom or "")), "administration")


def distance_m(a, b):
    return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 110540)


def distance_contour_m(x, y, polys):
    """Distance d'un point au bord d'un contour (approximation plane locale, suffisante pour départager des régions)."""
    best = float("inf")
    for p in polys:
        for anneau in p:
            for (x1, y1), (x2, y2) in zip(anneau, anneau[1:]):
                dx, dy = x2 - x1, y2 - y1
                t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) if dx or dy else 0.0
                best = min(best, distance_m((x, y), (x1 + t * dx, y1 + t * dy)))
    return best


def lire_source(chemin):
    ws = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    lignes = ws.iter_rows(values_only=True)
    entete = [texte(v) for v in next(lignes)]
    if entete[: len(COLONNES)] != [c for c, _ in COLONNES]:
        sys.exit(f"En-tête inattendu : {entete}")
    for n, r in enumerate(lignes, start=2):
        yield n, [texte(v) for v in r]


def fusionner_osm(regions):
    """Ajoute aux régions les objets OSM non appariés et rattache les appariés à leur point du MTNRA (D-GD-44)."""
    extraits = json.load(open(os.path.join(FICHES, "donnees", "osm-extraits.json"), encoding="utf-8"))
    # Noms de lieux (villes, communes, provinces du MTNRA ; communes, provinces, régions du RGPH) : jamais une preuve
    # d'identité entre deux services d'une même ville.
    lieux = set()
    for r in regions:
        for o in r["objets"]:
            for k in ("ville", "commune", "province", "quartier"):
                lieux |= mots(o["properties"].get(k))
    for n in ("communes", "provinces", "regions"):
        for f in json.load(open(os.path.join(FICHES, "donnees", f"hcp-rgph2024-population-{n}.geojson"), encoding="utf-8"))["features"]:
            lieux |= mots(f["properties"].get("nom"))
    distinctifs = lambda nom: mots(nom) - lieux - GENERIQUES
    grille = {}
    for r in regions:
        for o in r["objets"]:
            x, y = o["geometry"]["coordinates"]
            o["_famille"] = famille(o["properties"].get("nom"))
            grille.setdefault((round(x, 2), round(y, 2)), []).append(o)
    bilan = {"empreintes": {}, "apparies": 0, "multiples": 0, "ajoutes": 0, "par_plus_proche": 0}
    for cle_osm, fam in OSM.items():
        fiche = extraits[cle_osm]
        octets = open(os.path.join(FICHES, fiche["version"]["fichier"]), "rb").read()
        if sha256(octets) != fiche["version"]["empreinte"]:
            sys.exit(f"{cle_osm} : empreinte différente de celle de osm-extraits.json.")
        bilan["empreintes"][cle_osm] = fiche["version"]["empreinte"]
        for f in json.loads(octets)["features"]:
            p, c = f["properties"], f["geometry"]["coordinates"]
            noms = [p.get(k) for k in ("nom", "name", "name:fr") if p.get(k)]
            candidats = []
            for dx in (-0.01, 0, 0.01):
                for dy in (-0.01, 0, 0.01):
                    for o in grille.get((round(c[0] + dx, 2), round(c[1] + dy, 2)), []):
                        if o["_famille"] != fam or distance_m(c, o["geometry"]["coordinates"]) > RAYON_M:
                            continue
                        mo = distinctifs(o["properties"].get("nom"))
                        commun = any(semblables(distinctifs(n), mo) and meme_niveau(n, o["properties"].get("nom"))
                                     and natures_compatibles(n, o["properties"].get("nom")) for n in noms)
                        arabe = bool(p.get("name:ar")) and p.get("name:ar") == o["properties"].get("nom_ar")
                        identique = any(nom_compare(n) == nom_compare(o["properties"].get("nom", "")) for n in noms)
                        if commun or arabe or identique:
                            candidats.append(o)
            if len(candidats) == 1:
                o = candidats[0]
                o["properties"]["source"] = "mtnra+osm"
                o["properties"]["osm"] = ", ".join(filter(None, [o["properties"].get("osm"), p["osm"]]))
                bilan["apparies"] += 1
                continue
            x, y = c
            region = next((r for r in regions if r["boite"][0] <= x <= r["boite"][2] and r["boite"][1] <= y <= r["boite"][3] and dans_geometrie(x, y, r["polys"])), None)
            props = {"code": p["code"], "source": "osm", "osm": p["osm"], "categorie": fam, "rattachement": "contour"}
            if region is None:
                d, i = min((distance_contour_m(x, y, r["polys"]), i) for i, r in enumerate(regions))
                region = regions[i]
                props["rattachement"] = "plus-proche-contour"
                props["distance_contour_m"] = round(d)
                bilan["par_plus_proche"] += 1
            if p.get("nom"):
                props["nom"] = p["nom"]
            if p.get("name:ar"):
                props["nom_ar"] = p["name:ar"]
            props.update({k: p[k] for k in TAGS_OSM if p.get(k) and k not in ("name:ar",)})
            if len(candidats) > 1:
                props["doublon_probable"] = ", ".join(o["properties"]["code"] for o in candidats)
                bilan["multiples"] += 1
            region["objets"].append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": c}})
            bilan["ajoutes"] += 1
    for r in regions:
        for o in r["objets"]:
            o.pop("_famille", None)
            o["properties"].setdefault("source", "mtnra")
    return bilan


def decouper(regions):
    """
    Une région de plus de MAX_OBJETS objets est découpée par province / préfecture du RGPH (contour livré ; un point dans
    une lacune va au contour provincial le plus proche de la région) : ses provinces les plus fournies forment chacune
    une couche, tant que le reste dépasse la borne ; le reste forme une dernière couche « autres provinces ».
    """
    provinces = [f for f in json.load(open(os.path.join(FICHES, PROVINCES), encoding="utf-8"))["features"]]
    for r in regions:
        r["slug"] = slug(r["nom"])
        if len(r["objets"]) <= MAX_OBJETS:
            yield r
            continue
        siennes = [{"code": f["properties"]["code"], "nom": f["properties"]["nom"], "polys": polygones(f["geometry"])}
                   for f in provinces if f["properties"]["region"] == r["code"]]
        par_province = {p["code"]: [] for p in siennes}
        for o in r["objets"]:
            x, y = o["geometry"]["coordinates"]
            p = next((p for p in siennes if dans_geometrie(x, y, p["polys"])), None)
            if p is None:
                p = min(siennes, key=lambda q: distance_contour_m(x, y, q["polys"]))
            par_province[p["code"]].append(o)
        reste = dict(par_province)
        for p in sorted(siennes, key=lambda q: -len(par_province[q["code"]])):
            if sum(len(v) for v in reste.values()) <= MAX_OBJETS:
                break
            del reste[p["code"]]
            yield {"nom": f"{r['nom']}, {p['nom']}", "slug": f"{r['slug']}-{slug(p['nom'])}", "objets": par_province[p["code"]],
                   "couverture": f"{p['nom']} ({r['nom']}, contour RGPH 2024 livré)"}
        noms = ", ".join(p["nom"] for p in siennes if p["code"] in reste)
        yield {"nom": f"{r['nom']}, autres provinces", "slug": f"{r['slug']}-autres-provinces", "objets": [o for v in reste.values() for o in v],
               "couverture": f"{r['nom']} hors province(s) découpée(s) : {noms} (contours RGPH 2024 livrés)"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--excel", required=True, help="donnees-geoportail-open-data-2022.xlsx (data.gov.ma)")
    ap.add_argument("--sortie", default=FICHES)
    a = ap.parse_args()

    octets_source = open(a.excel, "rb").read()
    if sha256(octets_source) != EMPREINTE_SOURCE:
        sys.exit(f"Empreinte {sha256(octets_source)} ≠ {EMPREINTE_SOURCE} : ce n'est pas le fichier publié sur data.gov.ma.")
    regions = []
    for f in json.load(open(os.path.join(FICHES, REGIONS), encoding="utf-8"))["features"]:
        polys = polygones(f["geometry"])
        regions.append({"code": f["properties"]["code"], "nom": f["properties"]["nom"], "polys": polys, "boite": boite(polys), "objets": []})
    empreinte_regions = sha256(open(os.path.join(FICHES, REGIONS), "rb").read())
    region_de_province_hcp, code_de_province_hcp = {}, {}
    for f in json.load(open(os.path.join(FICHES, PROVINCES), encoding="utf-8"))["features"]:
        region_de_province_hcp.setdefault(nom_compare(f["properties"]["nom"]), set()).add(f["properties"]["region"])
        code_de_province_hcp.setdefault(nom_compare(f["properties"]["nom"]), set()).add(f["properties"]["code"])
    empreinte_provinces = sha256(open(os.path.join(FICHES, PROVINCES), "rb").read())

    total, sans_point, hors_contour, points, doublons = 0, [], [], [], []
    regions_de_province, deja, meme_lieu = {}, {}, {}
    for n, v in lire_source(a.excel):
        if not any(v):
            continue
        total += 1
        if tuple(v) in deja:
            doublons.append((n, deja[tuple(v)]))
            continue
        deja[tuple(v)] = n
        meme_lieu.setdefault((v[0].casefold(), v[8]), []).append(n)
        m = POINT.match(v[8])
        if not m:
            sans_point.append(n)
            continue
        x, y = float(m.group(1)), float(m.group(2))
        region = next((r for r in regions if r["boite"][0] <= x <= r["boite"][2] and r["boite"][1] <= y <= r["boite"][3] and dans_geometrie(x, y, r["polys"])), None)
        province = nom_compare(v[16])
        if region is not None and province:
            regions_de_province.setdefault(province, set()).add(region["code"])
        points.append((n, v, x, y, region, province))
    par_code = {r["code"]: r for r in regions}
    for n, v, x, y, region, province in points:
        rattachement = "contour"
        if region is None:
            hcp, source = region_de_province_hcp.get(province, set()), regions_de_province.get(province, set())
            if len(hcp) == 1:
                region, rattachement = par_code[next(iter(hcp))], "province-hcp"
            elif len(source) == 1:
                region, rattachement = par_code[next(iter(source))], "province-source"
            else:
                hors_contour.append(n)
                continue
        props = {"code": f"l{n:05d}", "ligne": n, "rattachement": rattachement}
        autres = [m for m in meme_lieu.get((v[0].casefold(), v[8]), []) if m != n] if v[0] else []
        if autres:
            props["doublon_probable"] = ", ".join(f"l{m:05d}" for m in autres)
        codes_hcp = code_de_province_hcp.get(province, set())
        if len(codes_hcp) == 1:
            props["province_hcp"] = next(iter(codes_hcp))
            props["concordance"] = "concorde" if region_de_province_hcp[province] == {region["code"]} else "discorde"
        else:
            props["concordance"] = "non-appariee"
        props.update({cle: v[i] for i, (_, cle) in enumerate(COLONNES) if cle and i < len(v) and v[i]})
        region["objets"].append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [x, y]}})

    fusion = fusionner_osm(regions)

    os.makedirs(os.path.join(a.sortie, "donnees"), exist_ok=True)
    with open(os.path.join(a.sortie, ORIGINE), "wb") as fh:
        fh.write(octets_source)
    bilan = {"lignes": total, "doublons": doublons, "sansPoint": sans_point, "horsContour": hors_contour, "couches": []}
    par_hcp = sum(1 for r in regions for o in r["objets"] if o["properties"]["rattachement"] == "province-hcp")
    par_source = sum(1 for r in regions for o in r["objets"] if o["properties"]["rattachement"] == "province-source")
    concordance = {k: sum(1 for r in regions for o in r["objets"] if o["properties"].get("concordance") == k) for k in ("concorde", "discorde", "non-appariee")}
    ecartes = (f"{par_hcp + par_source} points situés dans une lacune des contours rattachés par leur province publiée (propriété « rattachement » : "
               f"{par_hcp} « province-hcp » par le nom d'une province du RGPH, {PROVINCES}, SHA-256 {empreinte_provinces} ; "
               f"{par_source} « province-source ») ; "
               f"{len(doublons)} lignes strictement identiques à une ligne précédente non reprises ("
               + ", ".join(f"ligne {n} = ligne {m}" for n, m in doublons) + ") ; "
               f"{sum(1 for r in regions for o in r['objets'] if 'doublon_probable' in o['properties'] and o['properties']['source'] != 'osm')} objets de même nom au même point qu'un autre, "
               "aux autres champs différents, gardés et marqués (propriété « doublon_probable ») ; "
               f"{len(sans_point)} lignes sans point lisible (lignes {', '.join(map(str, sans_point))}) et {len(hors_contour)} points hors des "
               f"contours sans province rattachable (lignes {', '.join(map(str, hors_contour)) or 'aucune'}) écartés, jamais déplacés ; "
               f"rapprochement avec les provinces du RGPH (propriété « concordance », toutes régions) : {concordance['concorde']} concordent, "
               f"{concordance['discorde']} discordent, {concordance['non-appariee']} sans province du RGPH de même nom")
    osm_txt = ("Fusion avec OpenStreetMap (D-GD-44, aucun objet en double) : extraits « administrations », « hôpitaux et cliniques » et "
               "« gares » (" + ", ".join(f"{k} SHA-256 {e}" for k, e in fusion["empreintes"].items()) + ", fiches dans donnees/osm-extraits.json) ; "
               f"{fusion['apparies']} objets OSM appariés à un point du MTNRA (moins de {RAYON_M} m, même famille, même échelon, natures de service "
               "compatibles, au moins la moitié des mots distinctifs en commun, ou nom français ou arabe identique) et fusionnés dans ce point (source « mtnra+osm », référence « osm ») ; "
               f"{fusion['multiples']} objets OSM à plusieurs candidats gardés et marqués « doublon_probable » ; "
               f"{fusion['ajoutes']} objets OSM ajoutés (source « osm »), dont {fusion['par_plus_proche']} rattachés au contour régional le plus proche "
               "(lacunes des communes sans contour, distance consignée)")
    bilan["fusion"] = fusion
    for r in decouper(sorted(regions, key=lambda r: int(r["code"]))):
        if len(r["objets"]) > MAX_OBJETS:
            sys.exit(f"{r['nom']} : {len(r['objets'])} objets > {MAX_OBJETS} (borne d'une couche V1).")
        cle = f"services-publics-{r['slug']}"
        octets = json.dumps({"type": "FeatureCollection", "features": r["objets"]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with open(os.path.join(a.sortie, "donnees", f"{cle}.geojson"), "wb") as fh:
            fh.write(octets)
        titre = f"Services publics — {r['nom']} (MTNRA 2022 et OpenStreetMap)"
        fiche = {
            "cle": cle,
            "titre": titre,
            "description": (
                "Administrations et services publics recensés sur le portail maps.service-public.ma (Ministère de la Transition numérique et de "
                "la Réforme de l'Administration), données à jour en mai 2022, publiées sur data.gov.ma : « Coordonnées alphanumériques des "
                f"administrations disponibles sur le portail maps.service-public.ma » ({URL_JEU}), fichier donnees-geoportail-open-data-2022.xlsx "
                f"(SHA-256 {EMPREINTE_SOURCE}, {total} lignes). Points retenus : ceux de la couverture ci-dessous ({r['nom']}) "
                f"({REGIONS}, SHA-256 {empreinte_regions}) ; la source n'ayant ni colonne de région ni colonne de type, elle est "
                f"répartie par région (borne de {MAX_OBJETS} objets par couche) ; {ecartes}. {osm_txt}. Champs tels que publiés (MTNRA : "
                "colonnes du fichier ; OSM : étiquettes de l'extrait), en français et en arabe ; coordonnées, téléphones et adresses non vérifiés "
                "par Fadi ; données OSM collaboratives, ni exhaustives ni officielles."
            ),
            "producteur": "Ministère de la Transition numérique et de la Réforme de l'Administration (MTNRA) ; contributeurs OpenStreetMap",
            "theme": "equipements",
            "couverture": r.get("couverture", f"{r['nom']} (contour RGPH 2024 livré)"),
            "version": {
                "libelle": "MTNRA, data.gov.ma — mai 2022 (jeu modifié le 17 juin 2022) ; OpenStreetMap — extraits du 2026-10-23",
                "url": None,
                "fichier": f"donnees/{cle}.geojson",
                "empreinte": sha256(octets),
                "periode": "MTNRA : données à jour en mai 2022 ; OpenStreetMap : base des extraits du 2026-10-23",
                "licence": "Open Data Commons Open Database License 1.0 (ODbL)",
                "attribution": "© MTNRA — maps.service-public.ma, via data.gov.ma (ODbL) ; © contributeurs OpenStreetMap (ODbL)",
                "droits": DROITS_OUVERTS,
                "precision": ("Points WKT publiés par le MTNRA (degrés, WGS 84) repris sans arrondi ; points OSM à 10⁻⁷ degré (voies et surfaces "
                              "par leur point central) ; un objet fusionné garde la position du MTNRA ; positions et adresses non vérifiées"),
                "synthetique": False,
                "conditions": (f"ODbL 1.0 : attribution obligatoire ; une base dérivée redistribuée reste sous ODbL (partage à l'identique). "
                               f"Fichier d'origine : {URL_FICHIER}."),
                "origine": {"fichier": ORIGINE, "empreinte": EMPREINTE_SOURCE, "url": URL_FICHIER},
            },
            "couche": {
                "titre": titre,
                "description": (f"{len(r['objets'])} objets ({sum(1 for o in r['objets'] if o['properties']['source'] == 'mtnra')} MTNRA, "
                                f"{sum(1 for o in r['objets'] if o['properties']['source'] == 'mtnra+osm')} MTNRA et OSM, "
                                f"{sum(1 for o in r['objets'] if o['properties']['source'] == 'osm')} OSM) ; code = « l » + numéro de ligne du "
                                "fichier du MTNRA, ou type et identifiant OSM (n = nœud, w = voie, r = relation)."),
                "niveau": None,
                "champCode": "code",
                "champNom": "nom",
                "proprietesExposees": [k for k in ["code", "source", "osm", "ligne", "categorie", "rattachement", "distance_contour_m", "province_hcp", "concordance", "doublon_probable"]
                                       + [c for _, c in COLONNES if c] + [t for t in TAGS_OSM if t != "name:ar"] if any(k in o["properties"] for o in r["objets"])],
                "styleDefaut": {"mode": "simple", "couleur": "#1b9e77"},
            },
            "indicateurs": [],
            "superficie": False,
        }
        with open(os.path.join(a.sortie, f"{cle}.json"), "w", encoding="utf-8") as fh:
            fh.write(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n")
        bilan["couches"].append({"cle": cle, "objets": len(r["objets"]), "octets": len(octets)})
    print(json.dumps(bilan, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
