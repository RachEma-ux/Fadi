#!/usr/bin/env python3
"""
Population légale RGPH 2024 du HCP rattachée aux contours de GeoData (D-GD-17, lot A) — script hors application :

    python3 scripts/geodata/preparer_hcp.py --excel <population-legale.xlsx> [--sortie docs/geodata/sources]

Source des valeurs : fichier Excel « Population légale du Royaume du Maroc selon les résultats du RGPH 2024 »
(https://www.hcp.ma/file/242341/), sous CC BY 4.0 (conditions générales d'utilisation du HCP, version 1.0, § 3).
Contours : geoBoundaries gbOpen MAR ADM1 / ADM2 (empreintes des fiches existantes) et communes OpenStreetMap
(`donnees/osm-mar-communes.geojson`). Les noms ne sont pas une clé sûre : chaque rattachement est contrôlé par la
géographie, et consigné dans une table de correspondance relisible (`correspondances/hcp-rgph2024-<niveau>.csv`).

  - Régions : code HCP n ↔ code ISO 3166-2 MA-nn (même ordre officiel), nom contrôlé.
  - Provinces et préfectures : nom normalisé (français, variantes anglaises de geoBoundaries) ; le point intérieur du
    contour doit tomber dans la région du code HCP (code province sans ses 3 derniers chiffres).
  - Communes : le point intérieur du contour OSM désigne sa province (contour ADM2 apparié) ; la commune HCP de cette
    province de même nom normalisé (français, sinon arabe) est retenue si elle est unique ; à défaut, un nom approché
    n'est retenu que s'il est seul au-dessus du seuil et nettement devant le suivant (méthode consignée).

Rien n'est inventé : une entité sans correspondance garde ses valeurs absentes (« non appariée ») ; une unité HCP sans
contour est listée dans la table avec le statut « sans contour ». Dépendances : `pip install openpyxl shapely`.
"""
import argparse
import csv
import difflib
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.request

import openpyxl
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from indicateurs_hcp import lire_indicateurs  # noqa: E402
from douars_hcp import ecrire_douars, lire_douars  # noqa: E402
from sources_hcp_communales import SIGNE_VIDE, lire_cee, lire_logement, lire_transport  # noqa: E402

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
URL_HCP = "https://www.hcp.ma/file/242341/"
URL_IND = "https://www.hcp.ma/file/242671/"
PAGE_HCP = "https://www.hcp.ma/Population-legale-du-Royaume-du-Maroc-repartie-par-regions-provinces-et-prefectures-et-communes-selon-les-resultats-du_a3974.html"
CGU_HCP = "https://www.hcp.ma/Conditions-generales-d-utilisation-Version-1-0_a2194.html"
UA = "Fadi-GeoData/1 (+https://www.fadimmo.com)"

# Variantes de noms de geoBoundaries (anglais, graphies) vers la graphie HCP normalisée ; contrôlées par la géographie.
ALIAS_PROVINCES = {
    "tangier assilah": "tanger assilah", "tetouan": "tetouan", "fez": "fes", "kenitra": "kenitra",
    "mohammedia": "mohammedia", "laayoune": "laayoune", "es semara": "es semara", "oued ed dahab": "oued ed dahab",
    "el kelaat es sraghna": "el kelaa des sraghna", "agadir ida outanane": "agadir ida ou tanane",
    "chtouka ait baha": "chtouka ait baha", "inezgane ait melloul": "inezgane ait melloul",
}


def normaliser(nom):
    """Nom comparable : sans préfixe administratif, sans accents ni ponctuation, minuscules."""
    n = nom or ""
    n = re.sub(r"[؀-ۿⴰ-⵿]+.*$", "", n)  # partie arabe ou tifinagh d'un nom bilingue
    n = re.sub(r"\((milieu|.*?)\)", "", n)
    n = re.sub(r"^dont le centre urbain", "centre", n.strip(), flags=re.I)
    n = re.sub(r"^(région|region|province|préfecture|prefecture|commune|arrondissement|cercle|centre)( of| de la\b| de l'| des\b| du\b| de\b| d'| d’)?\s*", "", n.strip(), flags=re.I)
    n = re.sub(r"\s+(province|prefecture|préfecture)$", "", n.strip(), flags=re.I)
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
    n = re.sub(r"[^a-z0-9]+", " ", n.lower()).strip()
    return n


def normaliser_ar(nom):
    n = nom or ""
    n = re.sub(r"\(.*?\)", "", n)
    n = re.sub(r"^(جهة|إقليم|اقليم|عمالة|جماعة|مقاطعة)\s+", "", n.strip())
    n = re.sub(r"[ً-ْـ]", "", n)  # voyelles et tatouil
    n = n.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"[\s\-–'’]+", "", n)


def lire_hcp(chemin):
    """Unités HCP : régions, provinces / préfectures (code de 4–5 chiffres), communes (7–9 chiffres)."""
    feuille = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    unites, milieux = {}, {}
    for r in feuille.iter_rows(min_row=8, values_only=True):
        nom, maroc, etr, pop, men, ar, code = (r + (None,) * 7)[:7]
        if not nom or code is None:
            continue
        nom, code = str(nom).strip(), str(code).strip()
        type_ = nom.split()[0]
        m = re.search(r"\(milieu (urbain|rural)\)", nom)
        if m:
            milieux.setdefault(code, {})[m.group(1)] = int(pop)
            continue
        if type_ == "Région":
            niveau = "region"
        elif type_ in ("Province", "Préfecture") and len(code) <= 5:
            niveau = "province"
        elif type_ == "Commune":
            niveau = "commune"
        elif type_ == "Arrondissement" and len(code) == 8:
            niveau = "arrondissement"
        elif nom.startswith("dont le centre urbain"):
            niveau = "centre"  # centre urbain d'une commune rurale (D-GD-18 : population des villes)
        else:
            continue
        unites.setdefault((niveau, code), {
            "niveau": niveau, "code": code, "nom": nom, "nom_ar": (ar or "").strip(),
            "marocains": int(maroc), "etrangers": int(etr), "population": int(pop), "menages": int(men),
        })
    for (niveau, code), u in unites.items():
        mi = milieux.get(code)
        if niveau != "commune" and mi:
            u["population_urbaine"] = mi.get("urbain", 0)
            u["population_rurale"] = mi.get("rural", 0)
    provinces = sorted((c for (n, c) in unites if n == "province"), key=len, reverse=True)
    for (niveau, code), u in unites.items():
        if niveau in ("commune", "arrondissement", "centre"):
            u["province"] = next((p for p in provinces if code.startswith(p)), None)
    toutes_communes = sorted((c for (n, c) in unites if n == "commune"), key=len, reverse=True)
    for (niveau, code), u in unites.items():
        if niveau == "centre":
            u["commune"] = next((c for c in toutes_communes if code.startswith(c) and c != code), None)
    communes_7 = [c for (n, c) in unites if n == "commune" and len(c) == 7]
    for (niveau, code), u in unites.items():
        if niveau == "arrondissement":
            # Code d'arrondissement (8 chiffres) = 6 premiers chiffres de sa commune (7 chiffres) + rang : rattachement
            # retenu seulement s'il est unique.
            parents = [c for c in communes_7 if c[:6] == code[:6]]
            u["commune"] = parents[0] if len(parents) == 1 else None
        if niveau == "province":
            u["region"] = code[:-3]
    return unites


def telecharger(url, empreinte):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
        octets = r.read()
    h = hashlib.sha256(octets).hexdigest()
    if h != empreinte:
        sys.exit(f"Empreinte inattendue pour {url} : {h}")
    return json.loads(octets)


def fiche(cle):
    with open(os.path.join(FICHES, f"{cle}.json"), encoding="utf-8") as f:
        return json.load(f)


def extrait_osm(cle):
    """Fiche d'un extrait OpenStreetMap livré sans couche propre (D-GD-18), avec son GeoJSON d'empreinte vérifiée."""
    with open(os.path.join(FICHES, "donnees", "osm-extraits.json"), encoding="utf-8") as f:
        fi = json.load(f)[cle]
    with open(os.path.join(FICHES, fi["version"]["fichier"]), "rb") as f:
        octets = f.read()
    if hashlib.sha256(octets).hexdigest() != fi["version"]["empreinte"]:
        sys.exit(f"Empreinte inattendue pour {cle}")
    return fi, json.loads(octets)


def charger_contours():
    adm = {}
    for n in (1, 2):
        fi = fiche(f"geoboundaries-mar-adm{n}")
        adm[n] = telecharger(fi["version"]["url"], fi["version"]["empreinte"])
    return adm[1], adm[2], extrait_osm("osm-mar-communes")[1]


def apparier(hcp, adm1, adm2, communes):
    regions = {c: u for (n, c), u in hcp.items() if n == "region"}
    provinces = {c: u for (n, c), u in hcp.items() if n == "province"}
    comm = {c: u for (n, c), u in hcp.items() if n == "commune"}
    lignes = {"regions": [], "provinces": [], "communes": []}

    # Régions : code HCP n ↔ ISO MA-nn.
    geo_reg = {}
    for f in adm1["features"]:
        iso = f["properties"]["shapeISO"]
        code = str(int(iso.split("-")[1]))
        u = regions.get(code)
        geo_reg[code] = shape(f["geometry"])
        lignes["regions"].append({"code_hcp": code, "nom_hcp": u["nom"] if u else "", "code_contour": iso, "nom_contour": f["properties"]["shapeName"],
                                  "methode": "code officiel (ordre ISO 3166-2:MA)", "statut": "apparie" if u else "sans valeur"})
        f["_code"], f["_methode"] = (code if u else None), "code officiel (ordre ISO 3166-2:MA)"

    # Provinces : nom normalisé + inclusion dans la région du code HCP.
    index_prov = {}
    for c, u in provinces.items():
        index_prov.setdefault(normaliser(u["nom"]), []).append(c)
    geo_prov = {}
    for f in adm2["features"]:
        nom = f["properties"]["shapeName"]
        cle = normaliser(nom)
        cle = ALIAS_PROVINCES.get(cle, cle)
        candidats = index_prov.get(cle, [])
        geom = shape(f["geometry"])
        pt = geom.representative_point()
        retenu, methode = None, ""
        bons = [c for c in candidats if geo_reg.get(provinces[c]["region"]) is not None and geo_reg[provinces[c]["region"]].contains(pt)]
        if len(bons) == 1:
            retenu, methode = bons[0], "nom normalisé + inclusion dans la région"
        else:
            # Nom approché parmi les provinces de la région qui contient le contour.
            reg = next((r for r, g in geo_reg.items() if g.contains(pt)), None)
            pool = {normaliser(provinces[c]["nom"]): c for c in provinces if provinces[c]["region"] == reg}
            proches = difflib.get_close_matches(cle, list(pool), n=2, cutoff=0.75)
            if proches and (len(proches) == 1 or difflib.SequenceMatcher(None, cle, proches[1]).ratio() < difflib.SequenceMatcher(None, cle, proches[0]).ratio() - 0.1):
                retenu, methode = pool[proches[0]], "nom approché + inclusion dans la région"
        f["_code"], f["_methode"] = retenu, methode
        if retenu:
            geo_prov[retenu] = geom
        lignes["provinces"].append({"code_hcp": retenu or "", "nom_hcp": provinces[retenu]["nom"] if retenu else "", "code_contour": f["properties"]["shapeID"],
                                    "nom_contour": nom, "methode": methode or "aucune", "statut": "apparie" if retenu else "non apparie"})
    pris = {f["_code"] for f in adm2["features"] if f["_code"]}
    for c, u in provinces.items():
        if c not in pris:
            lignes["provinces"].append({"code_hcp": c, "nom_hcp": u["nom"], "code_contour": "", "nom_contour": "", "methode": "", "statut": "sans contour"})
    if len(pris) != sum(1 for f in adm2["features"] if f["_code"]):
        sys.exit("Deux contours ADM2 rattachés à la même province HCP : vérifier la table.")

    # Communes : province par inclusion, puis nom (français, arabe), puis nom approché.
    par_prov = {}
    for c, u in comm.items():
        par_prov.setdefault(u["province"], []).append(c)
    utilises = {}
    # Rattachements relus à la main (`correspondances/hcp-rgph2024-communes-manuel.csv`, justification par ligne) :
    # appliqués d'abord, jamais remis en cause par les passages automatiques.
    manuels = {}
    chemin_manuel = os.path.join(FICHES, "correspondances", "hcp-rgph2024-communes-manuel.csv")
    if os.path.exists(chemin_manuel):
        with open(chemin_manuel, encoding="utf-8") as fm:
            for l in csv.DictReader(fm):
                if l["code_hcp"] not in comm:
                    sys.exit(f"Table manuelle : code HCP inconnu {l['code_hcp']}")
                manuels[l["code_contour"]] = l["code_hcp"]
    for f in communes["features"]:
        c = manuels.get(f["properties"]["code"])
        if c:
            f["_code"], f["_methode"], f["_province"] = c, "table relue à la main (justification consignée)", comm[c]["province"]
            utilises[c] = f
    for f in communes["features"]:
        p = f["properties"]
        if f.get("_code"):
            continue
        geom = shape(f["geometry"])
        pt = geom.representative_point()
        prov = next((c for c, g in geo_prov.items() if g.contains(pt)), None)
        retenu, methode = None, ""
        if prov:
            cands = par_prov.get(prov, [])
            fr = normaliser(p.get("name:fr") or p.get("nom") or "")
            ar = normaliser_ar(p.get("name:ar") or "")
            m_fr = [c for c in cands if normaliser(comm[c]["nom"]) == fr] if fr else []
            m_ar = [c for c in cands if ar and normaliser_ar(comm[c]["nom_ar"]) == ar]
            if len(m_fr) == 1:
                retenu, methode = m_fr[0], "nom français + inclusion dans la province"
            elif len(m_ar) == 1:
                retenu, methode = m_ar[0], "nom arabe + inclusion dans la province"
            elif fr:
                pool = {normaliser(comm[c]["nom"]): c for c in cands}
                proches = difflib.get_close_matches(fr, list(pool), n=2, cutoff=0.85)
                if proches:
                    r0 = difflib.SequenceMatcher(None, fr, proches[0]).ratio()
                    r1 = difflib.SequenceMatcher(None, fr, proches[1]).ratio() if len(proches) > 1 else 0
                    if r0 - r1 >= 0.1:
                        retenu, methode = pool[proches[0]], f"nom approché ({r0:.2f}) + inclusion dans la province"
        if retenu and retenu in utilises and utilises[retenu].get("_methode", "").startswith("table relue"):
            retenu, methode = None, "commune déjà rattachée par la table relue à la main"
        if retenu and retenu in utilises:
            # Deux contours pour une même commune HCP : aucun des deux n'est retenu (pas de choix arbitraire).
            autre = utilises[retenu]
            autre["_code"], autre["_methode"] = None, "conflit : deux contours pour une commune"
            retenu, methode = None, "conflit : deux contours pour une commune"
        f["_code"], f["_methode"] = retenu, methode
        if retenu:
            utilises[retenu] = f
        f["_province"] = prov
    # Second passage, sur les restes seulement : limites de province différentes entre geoBoundaries et OSM (commune
    # rattachée à une province voisine à moins de 10 km), graphies voisines ou nom inclus (« Azzinate » ⊂ « Sebt
    # Azzinate »). Retenu seulement si unique, nettement devant le suivant, et la commune HCP encore libre.
    libres = {c for c in comm if c not in utilises}
    for f in communes["features"]:
        if f["_code"] or f["_methode"].startswith("conflit") or f["_methode"].startswith("commune déjà"):
            continue
        p = f["properties"]
        fr = normaliser(p.get("name:fr") or p.get("nom") or "")
        ar = normaliser_ar(p.get("name:ar") or "")
        if not fr and not ar:
            continue
        pt = shape(f["geometry"]).representative_point()
        proches_prov = {c for c, g in geo_prov.items() if g.distance(pt) < 0.1}
        notes = []
        for c in libres:
            if comm[c]["province"] not in proches_prov:
                continue
            h_fr, h_ar = normaliser(comm[c]["nom"]), normaliser_ar(comm[c]["nom_ar"])
            r = difflib.SequenceMatcher(None, fr, h_fr).ratio() if fr else 0
            if ar and h_ar:
                r = max(r, difflib.SequenceMatcher(None, ar, h_ar).ratio())
            a_, b_ = set(fr.split()), set(h_fr.split())
            if fr and a_ and b_ and (a_ <= b_ or b_ <= a_) and sum(len(t) for t in (a_ & b_)) >= 5:
                r = max(r, 0.9)
            notes.append((r, c))
        notes.sort(reverse=True)
        if notes and notes[0][0] >= 0.85 and (len(notes) == 1 or notes[0][0] - notes[1][0] >= 0.1):
            r0, c = notes[0]
            f["_code"], f["_methode"] = c, f"nom ({r0:.2f}) + province voisine à moins de 10 km (limites différentes)"
            utilises[c] = f
            libres.discard(c)
    for f in communes["features"]:
        p = f["properties"]
        r = f["_code"]
        lignes["communes"].append({"code_hcp": r or "", "nom_hcp": comm[r]["nom"] if r else "", "code_contour": p["code"], "nom_contour": p.get("nom") or "",
                                   "methode": f["_methode"] or ("hors province appariée" if not f["_province"] else "aucune"), "statut": "apparie" if r else "non apparie"})
    pris = {f["_code"] for f in communes["features"] if f["_code"]}
    for c, u in comm.items():
        if c not in pris:
            lignes["communes"].append({"code_hcp": c, "nom_hcp": u["nom"], "code_contour": "", "nom_contour": "", "methode": "", "statut": "sans contour"})
    return lignes


# Noms d'arrondissements différents entre le HCP et OpenStreetMap, sans ressemblance de graphie : « Assoukhour
# Assawda » est la transcription de l'arabe « الصخور السوداء », c'est-à-dire « Roches noires » (Casablanca). Le
# rattachement reste contrôlé par l'inclusion dans la commune.
ALIAS_ARRONDISSEMENTS = {"roches noires": "asoukhour assawda"}


def charger_arrondissements():
    fi, geo = extrait_osm("osm-mar-arrondissements")
    return geo, fi["version"]["empreinte"]


def apparier_arrondissements(hcp, communes, adm2, arrondissements):
    """Arrondissements HCP (8 chiffres) ↔ contours OSM de niveau 10 : le point intérieur du contour doit tomber dans la
    commune mère (contour de commune rattaché), à défaut dans sa province ; puis nom normalisé, nom inclus ou nom
    approché, retenu seulement s'il est unique (et nettement devant le suivant)."""
    arr = {c: u for (n, c), u in hcp.items() if n == "arrondissement"}
    geo_comm = {f["_code"]: shape(f["geometry"]) for f in communes["features"] if f.get("_code")}
    geo_prov = {f["_code"]: shape(f["geometry"]) for f in adm2["features"] if f.get("_code")}
    lignes, utilises = [], {}
    for f in arrondissements["features"]:
        p = f["properties"]
        f["_code"], f["_methode"] = None, ""
        nom = p.get("name:fr") or p.get("nom") or ""
        fr = normaliser(nom)
        fr = ALIAS_ARRONDISSEMENTS.get(fr, fr)
        if not fr:
            continue
        pt = shape(f["geometry"]).representative_point()
        cands, controle = [], ""
        for c, u in arr.items():
            g = geo_comm.get(u.get("commune"))
            if g is not None and g.contains(pt):
                cands.append(c)
                controle = "inclusion dans la commune"
        if not cands:
            cands = [c for c, u in arr.items() if geo_prov.get(u["province"]) is not None and geo_prov[u["province"]].contains(pt)]
            controle = "inclusion dans la province"
        if not cands:
            continue
        retenu, methode = None, ""
        exacts = [c for c in cands if normaliser(arr[c]["nom"]) == fr]
        inclus = [c for c in cands if (lambda a, b: a and b and (a <= b or b <= a) and sum(len(t) for t in a & b) >= 5)(set(fr.split()), set(normaliser(arr[c]["nom"]).split()))]
        if len(exacts) == 1:
            retenu, methode = exacts[0], f"nom normalisé + {controle}"
        elif len(inclus) == 1:
            retenu, methode = inclus[0], f"nom inclus + {controle}"
        else:
            notes = sorted(((difflib.SequenceMatcher(None, fr, normaliser(arr[c]["nom"])).ratio(), c) for c in cands), reverse=True)
            if notes and notes[0][0] >= 0.85 and (len(notes) == 1 or notes[0][0] - notes[1][0] >= 0.1):
                retenu, methode = notes[0][1], f"nom approché ({notes[0][0]:.2f}) + {controle}"
        if retenu and retenu in utilises:
            autre = utilises[retenu]
            autre["_code"], autre["_methode"] = None, "conflit : deux contours pour un arrondissement"
            retenu, methode = None, "conflit : deux contours pour un arrondissement"
        f["_code"], f["_methode"] = retenu, methode
        if retenu:
            utilises[retenu] = f
    for f in arrondissements["features"]:
        p = f["properties"]
        if f["_code"] or f["_methode"].startswith("conflit"):
            r = f["_code"]
            lignes.append({"code_hcp": r or "", "nom_hcp": arr[r]["nom"] if r else "", "code_contour": p["code"], "nom_contour": p.get("name:fr") or p.get("nom") or "",
                           "methode": f["_methode"], "statut": "apparie" if r else "non apparie"})
    pris = {f["_code"] for f in arrondissements["features"] if f["_code"]}
    for c, u in arr.items():
        if c not in pris:
            lignes.append({"code_hcp": c, "nom_hcp": u["nom"], "code_contour": "", "nom_contour": "", "methode": "", "statut": "sans contour"})
    return lignes


def apparier_villes(hcp, communes, adm2, villes, urbaines):
    """Villes OSM (nœuds place=city / town) ↔ unités urbaines du HCP (D-GD-18, priorité HCP) : la commune qui contient le
    point (contour rattaché), sinon la province ; candidat = cette commune ou un de ses centres urbains (« dont le centre
    urbain de … ») ; nom normalisé égal, sinon nom approché unique et nettement devant. Deux points pour une même unité :
    aucun des deux n'est retenu."""
    comm = {c: u for (n, c), u in hcp.items() if n == "commune"}
    centres = {c: u for (n, c), u in hcp.items() if n == "centre"}
    geo_comm = {f["_code"]: shape(f["geometry"]) for f in communes["features"] if f.get("_code")}
    geo_prov = {f["_code"]: shape(f["geometry"]) for f in adm2["features"] if f.get("_code")}
    par_commune = {}
    for c, u in centres.items():
        par_commune.setdefault(u["commune"], []).append(c)
    # Une ville ne reçoit que l'effectif d'une unité urbaine : commune entièrement urbaine ou centre urbain d'une commune
    # rurale ; jamais celui d'une commune rurale (territoire et population plus larges que la ville).
    comm = {c: u for c, u in comm.items() if c in urbaines}
    unites = {**comm, **centres}
    lignes, utilises = [], {}
    for f in villes["features"]:
        p = f["properties"]
        f["_code"], f["_methode"] = None, ""
        nom = normaliser(p.get("name:fr") or p.get("nom") or "")
        if not nom:
            continue
        pt = shape(f["geometry"])
        mere = next((c for c, g in geo_comm.items() if g.contains(pt)), None)
        if mere:
            cands, controle = ([mere] if mere in comm else []) + par_commune.get(mere, []), "point dans la commune"
        else:
            prov = next((c for c, g in geo_prov.items() if g.contains(pt)), None)
            cands = [c for c, u in unites.items() if prov and u.get("province") == prov]
            controle = "point dans la province"
        exacts = [c for c in cands if normaliser(unites[c]["nom"]) == nom]
        inclus = [c for c in cands if (lambda a, b: a and b and (a <= b or b <= a) and sum(len(t) for t in a & b) >= 5)(set(nom.split()), set(normaliser(unites[c]["nom"]).split()))]
        retenu, methode = None, ""
        if len(exacts) == 1:
            retenu, methode = exacts[0], f"nom normalisé + {controle}"
        elif not exacts and mere and len(inclus) == 1:
            retenu, methode = inclus[0], f"nom inclus + {controle}"
        elif not exacts and mere:
            notes = sorted(((difflib.SequenceMatcher(None, nom, normaliser(unites[c]["nom"])).ratio(), c) for c in cands), reverse=True)
            if notes and notes[0][0] >= 0.85 and (len(notes) == 1 or notes[0][0] - notes[1][0] >= 0.1):
                retenu, methode = notes[0][1], f"nom approché ({notes[0][0]:.2f}) + {controle}"
        if retenu and retenu in utilises:
            autre = utilises[retenu]
            autre["_code"], autre["_methode"] = None, "conflit : deux points pour une unité"
            retenu, methode = None, "conflit : deux points pour une unité"
        f["_code"], f["_methode"] = retenu, methode
        if retenu:
            utilises[retenu] = f
    for f in villes["features"]:
        p, r = f["properties"], f["_code"]
        lignes.append({"code_hcp": r or "", "nom_hcp": unites[r]["nom"] if r else "", "code_contour": p["code"], "nom_contour": p.get("name:fr") or p.get("nom") or "",
                       "methode": f["_methode"] or "aucune", "statut": "apparie" if r else "non apparie"})
    return lignes, unites


def nom_lieu(nom_hcp):
    """Nom de lieu du HCP sans son préfixe administratif (« Commune de Fès » → « Fès », « dont le centre urbain d'Anjra » → « Anjra »)."""
    return re.sub(r"^(dont le centre urbain|commune)\s+(de la |de l'|des |du |de |d'|d’)?", "", nom_hcp, flags=re.I).strip()


VALEURS_VILLES = [
    ("population", "population", "Population légale", "personnes", "Population légale de la commune urbaine ou du centre urbain rattaché."),
    ("menages", "menages", "Ménages", "ménages", "Nombre de ménages de l'unité rattachée."),
    ("marocains", "marocains", "Population légale selon la nationalité — Marocains", "personnes", "Population légale de nationalité marocaine."),
    ("etrangers", "etrangers", "Population légale selon la nationalité — Étrangers", "personnes", "Population légale de nationalité étrangère."),
]


def ecrire_villes(sortie, villes, fi_villes, lignes, unites, sources):
    """Couche « villes » (D-GD-18) : points et noms OSM ; nom, code et effectifs du HCP quand la ville est rattachée (les
    attributs `population` d'OSM sont alors retirés) ; OSM seul sinon, valeurs HCP « non appariée »."""
    cle = "hcp-rgph2024-villes"
    entites, tab = [], ["code," + ",".join(k for k, *_ in VALEURS_VILLES)]
    for f in villes["features"]:
        p = dict(f["properties"])
        p.pop("name:ar", None)
        p.pop("name", None)  # nom multilingue (arabe, tifinagh) : non affiché (D-GD-17)
        u = unites.get(f["_code"]) if f.get("_code") else None
        if u:
            p.pop("population", None)
            p.pop("population:date", None)
            p.update({"nom": nom_lieu(u["nom"]), "nom_osm": f["properties"].get("name:fr") or f["properties"].get("nom"), "code_hcp": u["code"],
                      "unite_hcp": u["nom"], "source_population": "HCP, RGPH 2024", "appariement": f["_methode"]})
            tab.append(",".join([p["code"]] + [cellule(u.get(k)) for _, k, *_ in VALEURS_VILLES]))
        else:
            p.update({"appariement": "non apparié (aucune unité urbaine du HCP de même nom)"})
            if "population" in p:
                p["source_population"] = "OpenStreetMap (aucune donnée HCP rattachée)"
        entites.append({"type": "Feature", "properties": p, "geometry": f["geometry"]})
    fc = {"type": "FeatureCollection", "features": sorted(entites, key=lambda e: e["properties"]["code"])}
    octets = json.dumps(fc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    tab_octets = ("\n".join(tab) + "\n").encode()
    with open(os.path.join(sortie, "donnees", f"{cle}.geojson"), "wb") as f:
        f.write(octets)
    with open(os.path.join(sortie, "donnees", f"{cle}.csv"), "wb") as f:
        f.write(tab_octets)
    nom_csv = "correspondances/hcp-rgph2024-villes.csv"
    with open(os.path.join(sortie, nom_csv), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["code_hcp", "nom_hcp", "code_contour", "nom_contour", "methode", "statut"])
        w.writeheader()
        w.writerows(sorted(lignes, key=lambda l: (l["statut"], l["code_hcp"], l["code_contour"])))
    n_app = sum(1 for l in lignes if l["statut"] == "apparie")
    n_osm = sum(1 for e in entites if e["properties"].get("source_population", "").startswith("OpenStreetMap"))
    v = fi_villes["version"]
    fi = {
        "cle": cle,
        "titre": "Villes du Maroc — population RGPH 2024",
        "description": f"Villes OpenStreetMap (nœuds place=city ou town, {len(entites)} points) ; priorité au HCP (D-GD-18) : {n_app} villes rattachées à une commune "
                       f"urbaine ou à un centre urbain du HCP portent son nom, son code et ses effectifs RGPH 2024 (l'attribut « population » d'OSM est alors retiré) ; "
                       f"{len(entites) - n_app} villes sans unité HCP de même nom gardent leurs seules données OSM ({n_osm} avec un attribut « population » d'OSM, "
                       f"signalé par « source_population »). Table de correspondance relisible : `{nom_csv}`. Une valeur HCP absente reste « non appariée », jamais zéro.",
        "producteur": "Haut-Commissariat au Plan (HCP), RGPH 2024 ; points : contributeurs OpenStreetMap",
        "theme": "population",
        "couverture": fi_villes["couverture"],
        "version": {
            "libelle": "RGPH 2024 — population légale (fichier Excel HCP) ; points " + v["libelle"],
            "url": None,
            "fichier": f"donnees/{cle}.geojson",
            "empreinte": hashlib.sha256(octets).hexdigest(),
            "tableau": {"fichier": f"donnees/{cle}.csv", "empreinte": hashlib.sha256(tab_octets).hexdigest()},
            "periode": "Recensement de septembre 2024 ; " + v["periode"],
            "licence": "Valeurs : Creative Commons Attribution 4.0 (CC BY 4.0, CGU du HCP v1.0 § 3) ; points : " + v["licence"],
            "attribution": "HCP, RGPH 2024 (CC BY 4.0), données retraitées ; " + v["attribution"],
            "droits": v["droits"],
            "precision": "Effectifs officiels repris sans modification ; " + v["precision"],
            "synthetique": False,
            "conditions": f"Valeurs HCP sous CC BY 4.0 ({CGU_HCP}) : citer « HCP, RGPH 2024 », indiquer les modifications (rattachement aux points OSM). "
                          f"Source : {URL_HCP} (SHA-256 {sources['population']}). Points : {v['conditions']}",
        },
        "couche": {
            "titre": "Villes du Maroc — population RGPH 2024",
            "description": "Code = identifiant OSM du point ; code_hcp = code géographique HCP de l'unité rattachée.",
            "niveau": None, "champCode": "code", "champNom": "nom",
            "proprietesExposees": ["code", "osm", "nom", "nom_osm", "name:fr", "place", "code_hcp", "unite_hcp", "source_population", "population", "population:date", "appariement"],
            "styleDefaut": fi_villes["couche"]["styleDefaut"],
        },
        "indicateurs": [{"propriete": k, "titre": t, "unite": un, "periode": "RGPH 2024", "denominateur": None, "description": f"HCP, RGPH 2024 — {d}",
                         "motifSiAbsente": "non-appariee", "theme": "Démographie", "famille": t.split(" — ")[0], "modalite": (t.split(" — ") + [None])[1],
                         "milieu": "ensemble", "sexe": "ensemble", "ordre": i} for i, (k, _, t, un, d) in enumerate(VALEURS_VILLES)],
        "superficie": False,
    }
    with open(os.path.join(sortie, f"{cle}.json"), "w", encoding="utf-8") as f:
        json.dump(fi, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{cle} : {n_app}/{len(entites)} villes rattachées au HCP ; {n_osm} gardent la population OSM (aucune unité HCP)")


# Population légale selon la nationalité (fichier de population légale, lot A) : seule donnée de ce fichier absente du
# fichier d'indicateurs ; rangée avec les autres sous « Démographie ».
NATIONALITE = [
    ("pl_marocains", "marocains", "Marocains", "Population légale de nationalité marocaine."),
    ("pl_etrangers", "etrangers", "Étrangers", "Population légale de nationalité étrangère."),
]


def entite(f, u, code_contour, nom_contour, methode):
    # Pas de nom arabe dans les couches (D-GD-17 : aucun arabe affiché) ; il ne sert qu'au rattachement. Les valeurs
    # sont dans le tableau livré à côté (lot A2), jamais dans les propriétés des objets.
    props = {"code": u["code"] if u else f"contour:{code_contour}", "nom": u["nom"] if u else nom_contour,
             "contour": code_contour, "nom_contour": nom_contour, "appariement": methode if u else "non apparié"}
    return {"type": "Feature", "properties": props, "geometry": f["geometry"]}


def cellule(v):
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return repr(round(v, 6)) if isinstance(v, float) else str(v)


TITRES_SOURCES = {
    "logement": "« Indicateurs communaux du parc logement urbain au Maroc en 2024 » (HCP)",
    "transport": "« Indicateurs communaux : mode de transport domicile – lieu de travail des actifs occupés, RGPH 2024 » (HCP, juin 2026)",
    "cee": "« Cartographie des Établissements Économiques (CEE 2023/2024) : principaux résultats par commune » (HCP)",
}

NIVEAUX = {
    "regions": ("12 régions", "geoboundaries-mar-adm1"),
    "provinces": ("75 provinces et préfectures", "geoboundaries-mar-adm2"),
    "communes": ("communes", "osm-mar-communes"),
    "arrondissements": ("arrondissements des communes urbaines", "osm-mar-arrondissements"),
}


def ecrire(sortie, cle, couche_titre, niveau, entites, desc, sources, lignes, comptes, declarations, valeurs, hcp_par_code, contours_osm_arr):
    os.makedirs(os.path.join(sortie, "donnees"), exist_ok=True)
    os.makedirs(os.path.join(sortie, "correspondances"), exist_ok=True)
    fc = {"type": "FeatureCollection", "features": sorted(entites, key=lambda e: e["properties"]["code"])}
    octets = json.dumps(fc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    with open(os.path.join(sortie, "donnees", f"{cle}.geojson"), "wb") as f:
        f.write(octets)
    # Tableau de valeurs : une ligne par entité rattachée (code HCP), une colonne par indicateur.
    colonnes = [d["propriete"] for d in declarations] + [k for k, *_ in NATIONALITE]
    lignes_tab = [",".join(["code"] + colonnes)]
    for e in fc["features"]:
        code = e["properties"]["code"]
        if code.startswith("contour:"):
            continue
        v = valeurs.get(code, {})
        u = hcp_par_code.get(code, {})
        lignes_tab.append(",".join([code] + [cellule(v.get(c, SIGNE_VIDE)) for c in colonnes[:len(declarations)]] + [cellule(u.get(k)) for _, k, *_ in NATIONALITE]))
    tab = ("\n".join(lignes_tab) + "\n").encode()
    with open(os.path.join(sortie, "donnees", f"{cle}.csv"), "wb") as f:
        f.write(tab)
    nom_csv = f"correspondances/hcp-rgph2024-{niveau}.csv"
    with open(os.path.join(sortie, nom_csv), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["code_hcp", "nom_hcp", "code_contour", "nom_contour", "methode", "statut"])
        w.writeheader()
        w.writerows(sorted(lignes, key=lambda l: (l["statut"], l["code_hcp"], l["code_contour"])))
    couverture, base = NIVEAUX[niveau]
    contours = (extrait_osm(base)[0] if base.startswith("osm-") else fiche(base)) if base else None
    prod_contours = contours["producteur"] if contours else "Contributeurs OpenStreetMap"
    lic_contours = contours["version"]["licence"] if contours else "Open Data Commons Open Database License 1.0 (ODbL)"
    attr_contours = contours["version"]["attribution"] if contours else "© contributeurs OpenStreetMap (ODbL)"
    cond_contours = contours["version"]["conditions"] if contours else "ODbL 1.0 : attribution « © contributeurs OpenStreetMap » obligatoire ; une base dérivée redistribuée reste sous ODbL."
    lib_contours = contours["version"]["libelle"] if contours else f"OpenStreetMap niveau administratif 10, extraits du 2026-10-23 (fichier `donnees/osm-mar-arrondissements.geojson`, SHA-256 {contours_osm_arr})"
    niveau_couche = {"regions": "ADM1", "provinces": "ADM2", "communes": "OSM8", "arrondissements": "OSM10"}[niveau]
    nat = [{"propriete": k, "titre": f"Population légale selon la nationalité — {mod}", "unite": "personnes", "periode": "RGPH 2024", "denominateur": None,
            "description": f"HCP, RGPH 2024 — {d}", "motifSiAbsente": "non-appariee", "theme": "Démographie", "famille": "Population légale selon la nationalité",
            "modalite": mod, "milieu": "ensemble", "sexe": "ensemble", "ordre": len(declarations) + i} for i, (k, _, mod, d) in enumerate(NATIONALITE)]
    fi = {
        "cle": cle,
        "titre": couche_titre,
        "description": desc + f" Rattachement aux contours : {comptes}. Table de correspondance relisible : `{nom_csv}`. "
                       "Les noms ne sont pas une clé sûre : chaque rattachement est contrôlé par la géographie ; une entité non rattachée garde ses valeurs absentes (« non appariée »), jamais zéro. "
                       "Signes du HCP : « … » et « _ » = sans objet (n'a pas lieu de figurer), « . » = indisponible ; cellule vide ou unité absente d'un fichier = « vide » (non publiée) ; jamais zéro.",
        "producteur": "Haut-Commissariat au Plan (HCP), Recensement général de la population et de l'habitat 2024 ; contours : " + prod_contours,
        "theme": "population",
        "couverture": "Maroc — " + couverture,
        "version": {
            "libelle": "RGPH 2024 — population légale et indicateurs démographiques et socio-économiques (fichiers Excel HCP) ; contours " + lib_contours,
            "url": None,
            "fichier": f"donnees/{cle}.geojson",
            "empreinte": hashlib.sha256(octets).hexdigest(),
            "tableau": {"fichier": f"donnees/{cle}.csv", "empreinte": hashlib.sha256(tab).hexdigest(), "signes": {"…": "sans-objet", ".": "non-publiee", "_": "sans-objet", SIGNE_VIDE: "non-publiee"}},
            "periode": "Recensement de septembre 2024",
            "licence": "Valeurs : Creative Commons Attribution 4.0 (CC BY 4.0, CGU du HCP v1.0 § 3) ; contours : " + lic_contours,
            "attribution": "HCP, RGPH 2024 (CC BY 4.0), données retraitées ; " + attr_contours,
            "droits": {u: "autorise" for u in ["consultation", "stockage", "calcul", "tuiles", "commercial", "partage", "telechargement", "export"]},
            "precision": "Effectifs et taux officiels repris sans modification (taux arrondis au dixième par le HCP) ; géométries des contours d'origine reprises telles quelles",
            "synthetique": False,
            "conditions": f"Valeurs HCP sous CC BY 4.0 ({CGU_HCP}) : citer « HCP, RGPH 2024 », indiquer les modifications (rattachement aux contours, mise en tableau), "
                          "ne pas laisser entendre que le HCP soutient Fadi, respecter l'intégrité des données (valeurs reprises sans modification). "
                          f"Sources : {URL_HCP} (SHA-256 {sources['population']}) et {URL_IND} (SHA-256 {sources['indicateurs']})"
                          + "".join(f" ; {TITRES_SOURCES[k]} (SHA-256 {sources[k]})" for k in TITRES_SOURCES if k in sources)
                          + f". Contours : {cond_contours}",
        },
        "couche": {
            "titre": couche_titre,
            "description": "Valeurs RGPH 2024 rattachées aux contours ; code = code géographique HCP (code du contour d'origine pour une entité non rattachée).",
            # Rang administratif (D-GD-16) : ADM1, ADM2, communes OSM (niveau 8), arrondissements OSM (niveau 10).
            "niveau": niveau_couche,
            "champCode": "code",
            "champNom": "nom",
            "proprietesExposees": ["code", "nom", "contour", "nom_contour", "appariement"],
            "styleDefaut": {"mode": "simple", "couleur": "#2b8cbe"},
        },
        "indicateurs": declarations + nat,
        "superficie": True,
    }
    with open(os.path.join(sortie, f"{cle}.json"), "w", encoding="utf-8") as f:
        json.dump(fi, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", required=True, help="Population légale RGPH 2024 (https://www.hcp.ma/file/242341/)")
    ap.add_argument("--indicateurs", required=True, help="Indicateurs démographiques et socio-économiques RGPH 2024 (https://www.hcp.ma/file/242671/)")
    ap.add_argument("--logement", help="Indicateurs communaux du parc logement urbain 2024 (HCP)")
    ap.add_argument("--transport", help="Indicateurs communaux : mode de transport domicile – lieu de travail, RGPH 2024 (HCP)")
    ap.add_argument("--cee", help="Cartographie des établissements économiques 2023/2024, principaux résultats par commune (HCP)")
    ap.add_argument("--douars", help="Population et ménages par douars, RGPH 2024 (HCP, octobre 2025) : annexe de la fiche des communes")
    ap.add_argument("--sortie", default=FICHES)
    a = ap.parse_args()
    sources = {}
    for k, chemin in (("population", a.excel), ("indicateurs", a.indicateurs), ("logement", a.logement), ("transport", a.transport), ("cee", a.cee), ("douars", a.douars)):
        if not chemin:
            continue
        with open(chemin, "rb") as f:
            sources[k] = hashlib.sha256(f.read()).hexdigest()
    hcp = lire_hcp(a.excel)
    declarations, valeurs = lire_indicateurs(a.indicateurs)
    # Indicateurs communaux complémentaires (D-GD-20) : ajoutés après ceux du lot A2, rangés par thème.
    unites = {c for (_, c) in hcp}
    for k, lire in (("logement", lire_logement), ("transport", lire_transport), ("cee", lambda ch: lire_cee(ch, unites)[:2])):
        chemin = getattr(a, k)
        if not chemin:
            continue
        d, v = lire(chemin)
        for x in d:
            x["ordre"] = len(declarations)
            declarations.append(x)
        for code, cols in v.items():
            valeurs.setdefault(code, {}).update(cols)
    adm1, adm2, communes = charger_contours()
    arrondissements, empreinte_arr = charger_arrondissements()
    lignes = apparier(hcp, adm1, adm2, communes)
    lignes["arrondissements"] = apparier_arrondissements(hcp, communes, adm2, arrondissements)
    def compte(ls):
        n = lambda s: sum(1 for l in ls if l["statut"] == s)
        return f"{n('apparie')} rattachées, {n('non apparie') + n('sans valeur')} contours sans valeur, {n('sans contour')} unités HCP sans contour"
    par_code = {c: u for (n, c), u in hcp.items()}
    national = sum(u["population"] for (n, c), u in hcp.items() if n == "region")
    jeux = [
        ("hcp-rgph2024-population-regions", "RGPH 2024 — régions", "regions", adm1, lambda f: (f["properties"]["shapeISO"], f["properties"]["shapeName"]),
         "Population légale et indicateurs démographiques et socio-économiques des 12 régions selon le RGPH 2024 (HCP), par milieu (ensemble, urbain, rural) et par sexe, sur les contours geoBoundaries ADM1."),
        ("hcp-rgph2024-population-provinces", "RGPH 2024 — provinces et préfectures", "provinces", adm2, lambda f: (f["properties"]["shapeID"], f["properties"]["shapeName"]),
         "Population légale et indicateurs démographiques et socio-économiques des 75 provinces et préfectures selon le RGPH 2024 (HCP), par milieu et par sexe, sur les contours geoBoundaries ADM2."),
        ("hcp-rgph2024-population-communes", "RGPH 2024 — communes", "communes", communes, lambda f: (f["properties"]["code"], f["properties"].get("nom") or ""),
         "Population légale et indicateurs démographiques et socio-économiques des communes selon le RGPH 2024 (HCP), par milieu et par sexe, sur les contours des communes OpenStreetMap."),
        ("hcp-rgph2024-arrondissements", "RGPH 2024 — arrondissements", "arrondissements", arrondissements, lambda f: (f["properties"]["code"], f["properties"].get("nom") or ""),
         "Population légale et indicateurs démographiques et socio-économiques des arrondissements des grandes communes urbaines selon le RGPH 2024 (HCP), sur les contours OpenStreetMap de niveau administratif 10 (seuls les contours rattachés à un arrondissement du HCP sont livrés)."),
    ]
    for cle, titre, niveau, geo, ident, desc in jeux:
        entites = []
        for f in geo["features"]:
            if niveau == "arrondissements" and not f.get("_code"):
                continue  # subdivision OSM sans arrondissement HCP (quartier…) : non livrée
            code_contour, nom_contour = ident(f)
            u = par_code.get(f["_code"]) if f.get("_code") else None
            entites.append(entite(f, u, code_contour, nom_contour, f.get("_methode") or "nom normalisé + inclusion"))
        couverte = sum(par_code[e["properties"]["code"]]["population"] for e in entites if e["properties"]["code"] in par_code)
        pourcent = str(round(100 * couverte / national, 1)).replace(".", ",")
        part = f"{compte(lignes[niveau])} ; population rattachée : {couverte} habitants, soit {pourcent} % de la population légale nationale ({national})"
        ecrire(a.sortie, cle, titre, niveau, entites, desc, sources, lignes[niveau], part, declarations, valeurs, par_code, empreinte_arr)
        print(f"{cle} : {part}")
    if a.douars:
        # Annexe de la fiche des communes (lot E) : douars rattachés à leur commune rurale par le code (D-GD-20, D-GD-21).
        lignes_d, ecartes = lire_douars(a.douars, [c for (n, c) in hcp if n == "commune"])
        if ecartes:
            sys.exit(f"{len(ecartes)} douars sans commune unique du RGPH (ex. {ecartes[:3]}) : vérifier la lecture des codes.")
        octets_d = ecrire_douars(os.path.join(a.sortie, "donnees", "hcp-rgph2024-douars.tsv"), lignes_d)
        chemin_fiche = os.path.join(a.sortie, "hcp-rgph2024-population-communes.json")
        with open(chemin_fiche, encoding="utf-8") as f:
            fc = json.load(f)
        fc["version"]["annexes"] = {"douars": {
            "fichier": "donnees/hcp-rgph2024-douars.tsv", "empreinte": hashlib.sha256(octets_d).hexdigest(),
            "description": f"{len(lignes_d)} douars de {len({l['commune'] for l in lignes_d})} communes rurales : code, fraction et nom (publiés en arabe seulement, "
                           "D-GD-21), type (groupé, éclaté, dispersé), ménages, population, sexe et grands groupes d'âge (%) ; « X » = donnée supprimée par le HCP "
                           f"(secret statistique). Source : « Population et ménages par douars, RGPH 2024 » (HCP, octobre 2025, SHA-256 {sources['douars']}).",
        }}
        with open(chemin_fiche, "w", encoding="utf-8") as f:
            json.dump(fc, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"douars : {len(lignes_d)} douars rattachés à {len({l['commune'] for l in lignes_d})} communes rurales")
    fi_villes, villes = extrait_osm("osm-mar-villes")
    # Communes entièrement urbaines : population légale rurale « … » (sans objet) dans le fichier d'indicateurs.
    rural = next(d["propriete"] for d in declarations if d["famille"] == "Population légale" and d["milieu"] == "rural" and d["sexe"] == "ensemble")
    urbaines = {c for (n, c) in hcp if n == "commune" and valeurs.get(c, {}).get(rural) == "…"}
    l_villes, unites = apparier_villes(hcp, communes, adm2, villes, urbaines)
    ecrire_villes(a.sortie, villes, fi_villes, l_villes, unites, sources)


if __name__ == "__main__":
    main()
