#!/usr/bin/env python3
"""
Extraction des couches GeoData du Maroc depuis leurs sources d'origine ouvertes (D-GD-12) — script de préparation,
hors application :

    python3 scripts/geodata/extraire_sources.py --pbf maroc.osm.pbf [--pbf sahara.osm.pbf] [--sortie <dossier>]
        [--seulement cle,cle]

Sources :
- OpenStreetMap (ODbL) : extraits PBF régionaux (ex. https://download.openstreetmap.fr/extracts/africa/), lus avec
  pyosmium ; l'empreinte SHA-256 et la date de chaque extrait sont consignées dans la fiche.
- OurAirports (domaine public) : https://davidmegginson.github.io/ourairports-data/airports.csv.
- USGS MRDS (domaine public) : https://mrdata.usgs.gov/mrds/mrds-csv.zip.

Chaque couche est restreinte au territoire couvert par geoBoundaries MAR ADM1 (commit 9469f09, empreinte vérifiée),
écrite en GeoJSON déterministe (codes triés, coordonnées à 7 décimales) dans `<sortie>/donnees/<cle>.geojson`, avec
sa fiche qualifiée `<sortie>/<cle>.json`. Une couche de plus de 5 000 objets (borne d'une couche V1) n'est pas écrite :
elle est signalée, jamais tronquée. Rien n'est inventé : seuls les objets et attributs présents dans la source sont
repris. Dépendance : `pip install osmium`.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

import osmium

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
MAX_OBJETS = 5000
# Couleur par défaut d'une couche selon son thème (ColorBrewer « Paired » / « Set1 ») : les couches se distinguent sur la carte.
COULEURS_THEME = {"hydrologie": "#1f78b4", "infrastructures": "#6a3d9a", "energie": "#ff7f00", "tourisme": "#e31a1c",
                  "patrimoine": "#b15928", "equipements": "#33a02c", "population": "#984ea3", "agriculture": "#4daf4a",
                  "limites-administratives": "#2b8cbe", "geologie": "#a65628"}
DROITS_OUVERTS = {u: "autorise" for u in ["consultation", "stockage", "calcul", "tuiles", "commercial", "partage", "telechargement", "export"]}


def egal(cle, *valeurs):
    return lambda t: t.get(cle) in valeurs


def et(*fs):
    return lambda t: all(f(t) for f in fs)


def ou(*fs):
    return lambda t: any(f(t) for f in fs)


# Couches OpenStreetMap : clé, titre, thème, filtre des étiquettes (texte consigné + fonction), géométrie, attributs.
COUCHES_OSM = [
    ("osm-mar-barrages", "Barrages du Maroc (OpenStreetMap)", "hydrologie", "waterway=dam", egal("waterway", "dam"), "surface", ["name", "name:fr", "name:ar", "operator", "start_date"]),
    ("osm-mar-ports", "Ports du Maroc (OpenStreetMap)", "infrastructures", "landuse=port ou harbour=yes", ou(egal("landuse", "port"), egal("harbour", "yes")), "point", ["name", "name:fr", "name:ar", "operator", "harbour", "landuse"]),
    ("osm-mar-marinas", "Ports de plaisance du Maroc (OpenStreetMap)", "tourisme", "leisure=marina", egal("leisure", "marina"), "point", ["name", "name:fr", "name:ar", "operator"]),
    ("osm-mar-gares", "Gares ferroviaires du Maroc (OpenStreetMap)", "infrastructures", "railway=station", egal("railway", "station"), "point", ["name", "name:fr", "name:ar", "operator", "station"]),
    ("osm-mar-centrales-electriques", "Centrales électriques du Maroc (OpenStreetMap)", "energie", "power=plant", egal("power", "plant"), "point", ["name", "name:fr", "name:ar", "operator", "plant:source", "plant:method", "plant:output:electricity", "start_date"]),
    ("osm-mar-postes-electriques", "Postes électriques du Maroc (OpenStreetMap)", "energie", "power=substation", egal("power", "substation"), "point", ["name", "name:fr", "name:ar", "operator", "voltage", "substation"]),
    ("osm-mar-eoliennes", "Éoliennes du Maroc (OpenStreetMap)", "energie", "power=generator et generator:source=wind", et(egal("power", "generator"), egal("generator:source", "wind")), "point", ["name", "operator", "generator:output:electricity", "manufacturer", "model"]),
    ("osm-mar-musees", "Musées du Maroc (OpenStreetMap)", "tourisme", "tourism=museum", egal("tourism", "museum"), "point", ["name", "name:fr", "name:ar", "operator", "website", "opening_hours"]),
    ("osm-mar-attractions-touristiques", "Attractions touristiques du Maroc (OpenStreetMap)", "tourisme", "tourism=attraction", egal("tourism", "attraction"), "point", ["name", "name:fr", "name:ar", "historic", "website"]),
    ("osm-mar-campings", "Campings et aires de caravanes du Maroc (OpenStreetMap)", "tourisme", "tourism=camp_site ou caravan_site", egal("tourism", "camp_site", "caravan_site"), "point", ["name", "name:fr", "name:ar", "tourism", "website"]),
    ("osm-mar-hotels", "Hôtels du Maroc (OpenStreetMap)", "tourisme", "tourism=hotel", egal("tourism", "hotel"), "point", ["name", "name:fr", "name:ar", "stars", "operator", "website"]),
    ("osm-mar-information-touristique", "Information touristique du Maroc (OpenStreetMap)", "tourisme", "tourism=information", egal("tourism", "information"), "point", ["name", "name:fr", "name:ar", "information"]),
    ("osm-mar-plages", "Plages du Maroc (OpenStreetMap)", "tourisme", "natural=beach", egal("natural", "beach"), "surface", ["name", "name:fr", "name:ar", "surface"]),
    ("osm-mar-sites-patrimoniaux", "Sites patrimoniaux et historiques du Maroc (OpenStreetMap)", "patrimoine", "historic=archaeological_site|castle|fort|monument|ruins|city_gate|citywalls|memorial", egal("historic", "archaeological_site", "castle", "fort", "monument", "ruins", "city_gate", "citywalls", "memorial"), "point", ["name", "name:fr", "name:ar", "historic", "heritage"]),
    ("osm-mar-agences-de-voyages", "Agences de voyages du Maroc (OpenStreetMap)", "tourisme", "shop=travel_agency ou office=travel_agent", ou(egal("shop", "travel_agency"), egal("office", "travel_agent")), "point", ["name", "name:fr", "name:ar"]),
    ("osm-mar-etablissements-sante", "Hôpitaux et cliniques du Maroc (OpenStreetMap)", "equipements", "amenity=hospital ou clinic", egal("amenity", "hospital", "clinic"), "point", ["name", "name:fr", "name:ar", "amenity", "healthcare", "operator", "operator:type"]),
    ("osm-mar-administrations", "Administrations publiques du Maroc (OpenStreetMap)", "equipements", "amenity=townhall|courthouse ou office=government", ou(egal("amenity", "townhall", "courthouse"), egal("office", "government")), "point", ["name", "name:fr", "name:ar", "amenity", "office", "government"]),
    ("osm-mar-villes", "Villes du Maroc (OpenStreetMap)", "population", "nœuds place=city ou town", egal("place", "city", "town"), "noeud", ["name", "name:fr", "name:ar", "place", "population", "population:date"]),
    ("osm-mar-silos-agricoles", "Silos agricoles du Maroc (OpenStreetMap)", "agriculture", "man_made=silo", egal("man_made", "silo"), "point", ["name", "operator", "content"]),
    ("osm-mar-puits", "Puits d'eau du Maroc (OpenStreetMap)", "agriculture", "man_made=water_well", egal("man_made", "water_well"), "point", ["name", "name:fr", "name:ar", "pump", "drinking_water"]),
    ("osm-mar-reservoirs-eau", "Réservoirs et châteaux d'eau du Maroc (OpenStreetMap)", "agriculture", "man_made=water_tower ou reservoir_covered", egal("man_made", "water_tower", "reservoir_covered"), "point", ["name", "man_made", "operator"]),
    ("osm-mar-stations-pompage", "Stations de pompage d'eau du Maroc (OpenStreetMap)", "agriculture", "man_made=pumping_station", egal("man_made", "pumping_station"), "point", ["name", "operator", "substance"]),
    ("osm-mar-pepinieres", "Pépinières agricoles du Maroc (OpenStreetMap)", "agriculture", "landuse=plant_nursery", egal("landuse", "plant_nursery"), "surface", ["name", "operator"]),
    ("osm-mar-fournitures-agricoles", "Commerces de fournitures agricoles du Maroc (OpenStreetMap)", "agriculture", "shop=agrarian", egal("shop", "agrarian"), "point", ["name", "name:fr", "name:ar", "agrarian"]),
    ("osm-mar-apiculture", "Sites apicoles du Maroc (OpenStreetMap)", "agriculture", "man_made=beehive ou craft=beekeeper", ou(egal("man_made", "beehive"), egal("craft", "beekeeper")), "point", ["name", "operator"]),
    ("osm-mar-vignobles", "Vignobles du Maroc (OpenStreetMap)", "agriculture", "landuse=vineyard", egal("landuse", "vineyard"), "surface", ["name", "crop"]),
    ("osm-mar-serres-horticoles", "Zones horticoles sous serre du Maroc (OpenStreetMap)", "agriculture", "landuse=greenhouse_horticulture", egal("landuse", "greenhouse_horticulture"), "surface", ["name", "operator"]),
    ("osm-mar-communes", "Communes du Maroc (OpenStreetMap, niveau administratif 8)", "limites-administratives", "relations boundary=administrative et admin_level=8", et(egal("boundary", "administrative"), egal("admin_level", "8")), "aire", ["name", "name:fr", "name:ar", "ref", "admin_level", "wikidata"]),
    ("osm-mar-arrondissements", "Arrondissements et subdivisions des communes du Maroc (OpenStreetMap, niveau administratif 10)", "limites-administratives", "relations boundary=administrative et admin_level=10", et(egal("boundary", "administrative"), egal("admin_level", "10")), "aire", ["name", "name:fr", "name:ar", "ref", "admin_level", "wikidata"]),
    ("osm-mar-canaux", "Canaux d'eau du Maroc (OpenStreetMap)", "hydrologie", "voies waterway=canal", egal("waterway", "canal"), "ligne", ["name", "name:fr", "name:ar", "usage"]),
]


def telecharger(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Fadi-GeoData/1 (+https://www.fadimmo.com)"})
    return urllib.request.urlopen(req, timeout=600).read()


def r7(x):
    return round(x * 1e7) / 1e7


def sha256(octets):
    return hashlib.sha256(octets).hexdigest()


# --- Territoire : geoBoundaries MAR ADM1 (empreinte vérifiée) ---
def territoire():
    fiche = json.load(open(os.path.join(FICHES, "references", "geoboundaries-mar-adm1.json"), encoding="utf-8"))  # fiche de référence, non importée (D-GD-30)
    brut = telecharger(fiche["version"]["url"])
    if sha256(brut) != fiche["version"]["empreinte"]:
        sys.exit("Empreinte geoBoundaries ADM1 non conforme")
    polys = []
    for f in json.loads(brut)["features"]:
        g = f["geometry"]
        polys += [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    boites = [(min(c[0] for c in p[0]), min(c[1] for c in p[0]), max(c[0] for c in p[0]), max(c[1] for c in p[0])) for p in polys]

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

    def au_maroc(x, y):
        for p, b in zip(polys, boites):
            if b[0] <= x <= b[2] and b[1] <= y <= b[3] and dans_anneau(x, y, p[0]) and not any(dans_anneau(x, y, t) for t in p[1:]):
                return True
        return False

    return au_maroc


def centre(coords):
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    return [sum(xs) / len(xs), sum(ys) / len(ys)]


class Lecteur(osmium.SimpleHandler):
    """Un seul passage : chaque objet est confronté à toutes les couches."""

    def __init__(self, couches):
        super().__init__()
        self.couches = couches
        self.objets = {c[0]: {} for c in couches}

    def _tags(self, o):
        return {t.k: t.v for t in o.tags}

    def _garder(self, cle, code, tags, geom, repere):
        self.objets[cle][code] = (tags, geom, repere)

    def node(self, n):
        if not len(n.tags):
            return
        t = self._tags(n)
        for cle, _, _, _, f, g, _ in self.couches:
            if f(t) and n.location.valid():
                p = [r7(n.location.lon), r7(n.location.lat)]
                self._garder(cle, f"n{n.id}", t, {"type": "Point", "coordinates": p}, p)

    def way(self, w):
        if not len(w.tags):
            return
        t = self._tags(w)
        for cle, _, _, _, f, g, _ in self.couches:
            if not f(t) or g in ("noeud", "aire"):
                continue
            try:
                coords = [[r7(nd.lon), r7(nd.lat)] for nd in w.nodes]
            except osmium.InvalidLocationError:
                continue
            if len(coords) < 2:
                continue
            ferme = coords[0] == coords[-1] and len(coords) >= 4
            if g == "surface" and ferme:
                continue  # surface fermée : assemblée par area()
            if g in ("ligne", "surface"):
                # Couche de surfaces : une voie ouverte (ex. barrage tracé en ligne) est reprise comme ligne.
                self._garder(cle, f"w{w.id}", t, {"type": "LineString", "coordinates": coords}, coords[0])
            else:
                c = centre(coords[:-1] if coords[0] == coords[-1] and len(coords) > 2 else coords)
                p = [r7(c[0]), r7(c[1])]
                self._garder(cle, f"w{w.id}", t, {"type": "Point", "coordinates": p}, p)

    def area(self, a):
        t = self._tags(a)
        code = f"w{a.orig_id()}" if a.from_way() else f"r{a.orig_id()}"
        for cle, _, _, _, f, g, _ in self.couches:
            if not f(t):
                continue
            # Points : les voies sont déjà traitées par way() ; seules les relations passent ici (point central).
            if g == "point" and a.from_way():
                continue
            if g not in ("point", "surface", "aire"):
                continue
            polys = []
            for ext in a.outer_rings():
                anneaux = [[[r7(n.lon), r7(n.lat)] for n in ext]]
                for inn in a.inner_rings(ext):
                    anneaux.append([[r7(n.lon), r7(n.lat)] for n in inn])
                polys.append(anneaux)
            if not polys:
                continue
            exterieur = polys[0][0]
            c = centre(exterieur[:-1])
            if g == "point":
                p = [r7(c[0]), r7(c[1])]
                self._garder(cle, code, t, {"type": "Point", "coordinates": p}, p)
            else:
                geom = {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {"type": "MultiPolygon", "coordinates": polys}
                self._garder(cle, code, t, geom, c)


# Extraits livrés sans fiche propre (D-GD-17, D-GD-18 « priorité HCP ») : ils servent de contours ou de points aux couches
# du HCP (`preparer_hcp.py`), qui portent les noms et les valeurs du HCP ; leur fiche est consignée dans
# `donnees/osm-extraits.json` (licence, empreinte), lue par `preparer_hcp.py`, jamais importée comme couche.
SANS_FICHE = {"osm-mar-arrondissements", "osm-mar-communes", "osm-mar-villes"}
# Couches remplacées par une source officielle (D-GD-44 : administrations et services publics du MTNRA, aucun doublon
# entre couches) : plus extraites ni livrées ; leurs versions sont retirées par `donnees/retraits-sources.json`.
REMPLACEES = {"osm-mar-administrations", "osm-mar-etablissements-sante", "osm-mar-gares"}


def ecrire(sortie, cle, titre, theme, features, meta, resultat):
    ligne = {"cle": cle, "titre": titre, "objets": len(features)}
    if cle in REMPLACEES:
        ligne["ecartee"] = "remplacée par une source officielle (D-GD-44)"
        resultat.append(ligne)
        return
    if not features or len(features) > MAX_OBJETS:
        ligne["ecartee"] = "aucun objet" if not features else f"{len(features)} objets > {MAX_OBJETS} (borne d'une couche V1)"
        resultat.append(ligne)
        print(f"  {cle} écartée : {ligne['ecartee']}", file=sys.stderr)
        return
    texte = json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":"))
    octets = texte.encode("utf-8")
    empreinte = sha256(octets)
    os.makedirs(os.path.join(sortie, "donnees"), exist_ok=True)
    with open(os.path.join(sortie, "donnees", f"{cle}.geojson"), "wb") as fh:
        fh.write(octets)
    types = sorted({f["geometry"]["type"] for f in features})
    base = ["code"] + (["osm"] if any("osm" in f["properties"] for f in features) else []) + ["nom"]
    exposees = base + [a for a in meta["attrs"] if any(a in f["properties"] for f in features)]
    fiche = {
        "cle": cle,
        "titre": titre,
        "description": meta["description"],
        "producteur": meta["producteur"],
        "theme": theme,
        "couverture": "Maroc (territoire de geoBoundaries gbOpen MAR ADM1)",
        "version": {
            "libelle": meta["libelle"],
            "url": None,
            "fichier": f"donnees/{cle}.geojson",
            "empreinte": empreinte,
            "periode": meta["periode"],
            "licence": meta["licence"],
            "attribution": meta["attribution"],
            "droits": DROITS_OUVERTS,
            "precision": meta["precision"],
            "synthetique": False,
            "conditions": meta["conditions"],
        },
        "couche": {"titre": titre, "description": f"{len(features)} objets ; {meta['codes']}.", "niveau": None, "champCode": "code", "champNom": "nom",
                   "proprietesExposees": exposees, "styleDefaut": {"mode": "simple", "couleur": COULEURS_THEME.get(theme, "#2b8cbe")}},
        "indicateurs": [],
        "superficie": all(t in ("Polygon", "MultiPolygon") for t in types),
    }
    if cle in SANS_FICHE:
        ligne["sansFiche"] = True
        chemin = os.path.join(sortie, "donnees", "osm-extraits.json")
        extraits = json.load(open(chemin, encoding="utf-8")) if os.path.exists(chemin) else {}
        extraits[cle] = fiche
        with open(chemin, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(dict(sorted(extraits.items())), ensure_ascii=False, indent=2) + "\n")
        ancienne = os.path.join(sortie, f"{cle}.json")
        if os.path.exists(ancienne):
            os.remove(ancienne)
    else:
        with open(os.path.join(sortie, f"{cle}.json"), "w", encoding="utf-8") as fh:
            fh.write(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n")
    ligne.update({"types": types, "octets": len(octets), "empreinte": empreinte})
    resultat.append(ligne)
    print(f"  {cle} : {len(features)} objets ({', '.join(types)}), {len(octets) // 1024} Kio", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", action="append", default=[])
    ap.add_argument("--sortie", default=FICHES)
    ap.add_argument("--seulement")
    a = ap.parse_args()
    seulement = set(a.seulement.split(",")) if a.seulement else None
    au_maroc = territoire()
    resultat = []

    couches = [c for c in COUCHES_OSM if not seulement or c[0] in seulement]
    if couches and a.pbf:
        extraits = []
        lecteur = Lecteur(couches)
        for chemin in a.pbf:
            date = datetime.fromtimestamp(os.path.getmtime(chemin), tz=timezone.utc).strftime("%Y-%m-%d")
            with open(chemin, "rb") as fh:
                empreinte = hashlib.sha256()
                for bloc in iter(lambda: fh.read(1 << 20), b""):
                    empreinte.update(bloc)
            extraits.append(f"{os.path.basename(chemin)} du {date} (SHA-256 {empreinte.hexdigest()})")
            print(f"lecture {chemin}…", file=sys.stderr)
            lecteur.apply_file(chemin, locations=True)
        for cle, titre, theme, filtre, _, g, attrs in couches:
            features = []
            for code in sorted(lecteur.objets[cle]):
                tags, geom, repere = lecteur.objets[cle][code]
                if not au_maroc(repere[0], repere[1]):
                    continue
                props = {"code": code, "osm": {"n": "node", "w": "way", "r": "relation"}[code[0]] + "/" + code[1:], "nom": tags.get("name:fr") or tags.get("name") or tags.get("name:ar")}
                for at in attrs:
                    if at in tags:
                        props[at] = tags[at][:500]
                features.append({"type": "Feature", "properties": props, "geometry": geom})
            point = g in ("point", "noeud")
            ecrire(a.sortie, cle, titre, theme, features, {
                "attrs": attrs,
                "description": f"Objets OpenStreetMap « {filtre} », restreints au territoire couvert par geoBoundaries MAR ADM1. Extraits : {' ; '.join(extraits)}. Données collaboratives : exhaustivité et exactitude non garanties ; ce n'est pas un inventaire officiel.",
                "producteur": "Contributeurs OpenStreetMap",
                "libelle": f"OpenStreetMap — extraits du {extraits[0].split(' du ')[1].split(' ')[0]}",
                "periode": f"Base OpenStreetMap des extraits du {extraits[0].split(' du ')[1].split(' ')[0]}",
                "licence": "Open Data Commons Open Database License 1.0 (ODbL)",
                "attribution": "© contributeurs OpenStreetMap (ODbL)",
                "precision": ("Positions saisies par les contributeurs OSM ; voies et surfaces représentées par leur point central (moyenne des sommets)" if point else "Géométries des contributeurs OSM reprises telles quelles (surfaces assemblées par osmium ; voies ouvertes en lignes, nœuds en points)") + " ; coordonnées arrondies à 10⁻⁷ degré",
                "conditions": "ODbL 1.0 : attribution « © contributeurs OpenStreetMap » obligatoire ; une base dérivée redistribuée reste sous ODbL (partage à l'identique) ; une œuvre produite (carte, image) peut être diffusée avec l'attribution.",
                "codes": "code = type et identifiant OSM (n = nœud, w = voie, r = relation)",
            }, resultat)

    cle_oa = "ourairports-mar-aerodromes"
    if not seulement or cle_oa in seulement:
        url = "https://davidmegginson.github.io/ourairports-data/airports.csv"
        brut = telecharger(url).decode("utf-8")
        attrs = ["type", "ident", "icao_code", "iata_code", "municipality", "elevation_ft", "scheduled_service"]
        features = []
        for r in csv.DictReader(io.StringIO(brut)):
            if r["type"] == "closed":
                continue
            try:
                p = [r7(float(r["longitude_deg"])), r7(float(r["latitude_deg"]))]
            except ValueError:
                continue
            if not au_maroc(p[0], p[1]):
                continue
            props = {"code": f"oa{r['id']}", "nom": r["name"] or None}
            for at in attrs:
                if r.get(at):
                    props[at] = r[at][:500]
            features.append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": p}})
        features.sort(key=lambda f: f["properties"]["code"])
        jour = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ecrire(a.sortie, cle_oa, "Aéroports, aérodromes et héliports du Maroc (OurAirports)", "infrastructures", features, {
            "attrs": attrs,
            "description": f"Aérodromes, aéroports, héliports et hydrobases en service (type ≠ closed) d'OurAirports ({url}, fichier SHA-256 {sha256(brut.encode('utf-8'))}), restreints au territoire couvert par geoBoundaries MAR ADM1. Base collaborative : ce n'est pas la liste officielle de l'aviation civile.",
            "producteur": "OurAirports (David Megginson et contributeurs)",
            "libelle": f"OurAirports — airports.csv du {jour}",
            "periode": f"Fichier téléchargé le {jour}",
            "licence": "Domaine public (OurAirports : « released to the Public Domain »)",
            "attribution": "Données OurAirports (domaine public)",
            "precision": "Position de référence de chaque aérodrome telle que publiée par OurAirports ; altitude en pieds (elevation_ft) telle que publiée",
            "conditions": "Domaine public : réutilisation libre ; la source est citée par courtoisie et traçabilité.",
            "codes": "code = « oa » + identifiant OurAirports",
        }, resultat)

    cle_mrds = "usgs-mar-sites-mineraux"
    if not seulement or cle_mrds in seulement:
        import zipfile
        url = "https://mrdata.usgs.gov/mrds/mrds-csv.zip"
        brut = telecharger(url)
        texte = zipfile.ZipFile(io.BytesIO(brut)).read("mrds.csv").decode("latin-1")
        attrs = ["site_name", "dev_stat", "commod1", "commod2", "commod3", "ore", "dep_type", "oper_type", "prod_size", "url"]
        features = []
        for r in csv.DictReader(io.StringIO(texte)):
            try:
                p = [r7(float(r["longitude"])), r7(float(r["latitude"]))]
            except ValueError:
                continue
            if not (-17.3 <= p[0] <= -0.9 and 20.6 <= p[1] <= 36.0) or not au_maroc(p[0], p[1]):
                continue
            props = {"code": f"mrds{r['dep_id']}", "nom": r["site_name"] or None}
            for at in attrs:
                if r.get(at):
                    props[at] = r[at][:500]
            features.append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": p}})
        features.sort(key=lambda f: f["properties"]["code"])
        jour = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ecrire(a.sortie, cle_mrds, "Sites minéraux historiques du Maroc (USGS MRDS)", "geologie", features, {
            "attrs": attrs,
            "description": f"Gisements, indices et sites miniers de la Mineral Resources Data System de l'USGS ({url}, archive SHA-256 {sha256(brut)}), restreints au territoire couvert par geoBoundaries MAR ADM1. Base historique (gelée par l'USGS en 2011) : ni exhaustive ni à jour.",
            "producteur": "U.S. Geological Survey (USGS), Mineral Resources Data System",
            "libelle": f"USGS MRDS — mrds-csv.zip téléchargé le {jour}",
            "periode": "Base MRDS figée en 2011 ; fichier téléchargé le " + jour,
            "licence": "Domaine public (données produites par l'USGS)",
            "attribution": "U.S. Geological Survey, Mineral Resources Data System (domaine public)",
            "precision": "Positions telles que publiées par l'USGS ; précision variable selon la fiche (score de qualité MRDS)",
            "conditions": "Domaine public : réutilisation libre ; la source est citée par courtoisie et traçabilité.",
            "codes": "code = « mrds » + identifiant de dépôt USGS (dep_id)",
        }, resultat)

    print(json.dumps(resultat, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
