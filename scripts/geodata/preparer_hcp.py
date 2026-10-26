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

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
URL_HCP = "https://www.hcp.ma/file/242341/"
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
    n = re.sub(r"^(région|region|province|préfecture|prefecture|commune|arrondissement|cercle)( of| de la| de l'| des| du| de| d'| d’)?\s*", "", n.strip(), flags=re.I)
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
        if niveau == "commune":
            u["province"] = next((p for p in provinces if code.startswith(p)), None)
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


def charger_contours():
    adm = {}
    for n in (1, 2):
        fi = fiche(f"geoboundaries-mar-adm{n}")
        adm[n] = telecharger(fi["version"]["url"], fi["version"]["empreinte"])
    fi = fiche("osm-mar-communes")
    with open(os.path.join(FICHES, fi["version"]["fichier"]), "rb") as f:
        octets = f.read()
    if hashlib.sha256(octets).hexdigest() != fi["version"]["empreinte"]:
        sys.exit("Empreinte inattendue pour les communes OpenStreetMap")
    return adm[1], adm[2], json.loads(octets)


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


INDICATEURS_BASE = [
    ("population", "Population légale", "Population légale (Marocains et étrangers) au 1er septembre 2024."),
    ("marocains", "Population marocaine", "Population légale de nationalité marocaine."),
    ("etrangers", "Population étrangère", "Population légale de nationalité étrangère."),
    ("menages", "Ménages", "Nombre de ménages."),
]
INDICATEURS_MILIEU = [
    ("population_urbaine", "Population légale — milieu urbain", "Population légale résidant en milieu urbain."),
    ("population_rurale", "Population légale — milieu rural", "Population légale résidant en milieu rural."),
]


def entite(f, u, code_contour, nom_contour, methode):
    props = {"code": u["code"] if u else f"contour:{code_contour}", "nom": u["nom"] if u else nom_contour, "nom_ar": u["nom_ar"] if u else None,
             "contour": code_contour, "nom_contour": nom_contour, "appariement": methode if u else "non apparié"}
    for k, *_ in INDICATEURS_BASE + INDICATEURS_MILIEU:
        props[k] = u.get(k) if u else None
    return {"type": "Feature", "properties": props, "geometry": f["geometry"]}


def ecrire(sortie, cle, couche_titre, niveau, entites, base_fiche, desc, milieu, empreinte_excel, lignes, comptes):
    os.makedirs(os.path.join(sortie, "donnees"), exist_ok=True)
    os.makedirs(os.path.join(sortie, "correspondances"), exist_ok=True)
    fc = {"type": "FeatureCollection", "features": sorted(entites, key=lambda e: e["properties"]["code"])}
    octets = json.dumps(fc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    with open(os.path.join(sortie, "donnees", f"{cle}.geojson"), "wb") as f:
        f.write(octets)
    nom_csv = f"correspondances/hcp-rgph2024-{niveau}.csv"
    with open(os.path.join(sortie, nom_csv), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["code_hcp", "nom_hcp", "code_contour", "nom_contour", "methode", "statut"])
        w.writeheader()
        w.writerows(sorted(lignes, key=lambda l: (l["statut"], l["code_hcp"], l["code_contour"])))
    contours = fiche(base_fiche)
    indicateurs = INDICATEURS_BASE + (INDICATEURS_MILIEU if milieu else [])
    fi = {
        "cle": cle,
        "titre": couche_titre,
        "description": desc + f" Rattachement aux contours : {comptes}. Table de correspondance relisible : `{nom_csv}`. "
                       "Les noms ne sont pas une clé sûre : chaque rattachement est contrôlé par la géographie ; une entité non rattachée garde ses valeurs absentes (« non appariée »), jamais zéro.",
        "producteur": "Haut-Commissariat au Plan (HCP), Recensement général de la population et de l'habitat 2024 ; contours : " + contours["producteur"],
        "theme": "population",
        "couverture": "Maroc — " + {"regions": "12 régions", "provinces": "75 provinces et préfectures", "communes": "communes"}[niveau],
        "version": {
            "libelle": "RGPH 2024 — population légale (fichier Excel HCP) ; contours " + contours["version"]["libelle"],
            "url": None,
            "fichier": f"donnees/{cle}.geojson",
            "empreinte": hashlib.sha256(octets).hexdigest(),
            "periode": "Recensement de septembre 2024",
            "licence": "Valeurs : Creative Commons Attribution 4.0 (CC BY 4.0, CGU du HCP v1.0 § 3) ; contours : " + contours["version"]["licence"],
            "attribution": "HCP, RGPH 2024 (CC BY 4.0), données retraitées ; " + contours["version"]["attribution"],
            "droits": {u: "autorise" for u in ["consultation", "stockage", "calcul", "tuiles", "commercial", "partage", "telechargement", "export"]},
            "precision": "Effectifs officiels (aucun arrondi) ; géométries des contours d'origine reprises telles quelles",
            "synthetique": False,
            "conditions": f"Valeurs HCP sous CC BY 4.0 ({CGU_HCP}) : citer « HCP, RGPH 2024 », indiquer les modifications (rattachement aux contours), "
                          "ne pas laisser entendre que le HCP soutient Fadi, respecter l'intégrité des données (effectifs repris sans modification). "
                          f"Source : {URL_HCP} (page {PAGE_HCP}), fichier Excel SHA-256 {empreinte_excel}. Contours : {contours['version']['conditions']}",
        },
        "couche": {
            "titre": couche_titre,
            "description": f"Valeurs RGPH 2024 rattachées aux contours ; code = code géographique HCP (code du contour d'origine pour une entité non rattachée).",
            "niveau": contours["couche"]["niveau"],
            "champCode": "code",
            "champNom": "nom",
            "proprietesExposees": ["code", "nom", "nom_ar", "contour", "nom_contour", "appariement"] + [k for k, *_ in indicateurs],
            "styleDefaut": {"mode": "simple", "couleur": "#2b8cbe"},
        },
        "indicateurs": [{"propriete": k, "titre": t, "unite": "habitants" if k != "menages" else "ménages", "periode": "RGPH 2024", "denominateur": None,
                         "description": d, "motifSiAbsente": "non-appariee"} for k, t, d in indicateurs],
        "superficie": True,
    }
    with open(os.path.join(sortie, f"{cle}.json"), "w", encoding="utf-8") as f:
        json.dump(fi, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", required=True)
    ap.add_argument("--sortie", default=FICHES)
    a = ap.parse_args()
    with open(a.excel, "rb") as f:
        empreinte_excel = hashlib.sha256(f.read()).hexdigest()
    hcp = lire_hcp(a.excel)
    adm1, adm2, communes = charger_contours()
    lignes = apparier(hcp, adm1, adm2, communes)
    def compte(ls):
        n = lambda s: sum(1 for l in ls if l["statut"] == s)
        return f"{n('apparie')} rattachées, {n('non apparie') + n('sans valeur')} contours sans valeur, {n('sans contour')} unités HCP sans contour"
    par_code = {c: u for (n, c), u in hcp.items()}
    jeux = [
        ("hcp-rgph2024-population-regions", "Population légale RGPH 2024 — régions", "regions", adm1, "geoboundaries-mar-adm1", lambda f: (f["properties"]["shapeISO"], f["properties"]["shapeName"]), True,
         "Population légale des 12 régions selon le RGPH 2024 (HCP), avec ventilation urbain / rural, sur les contours geoBoundaries ADM1."),
        ("hcp-rgph2024-population-provinces", "Population légale RGPH 2024 — provinces et préfectures", "provinces", adm2, "geoboundaries-mar-adm2", lambda f: (f["properties"]["shapeID"], f["properties"]["shapeName"]), True,
         "Population légale des 75 provinces et préfectures selon le RGPH 2024 (HCP), avec ventilation urbain / rural, sur les contours geoBoundaries ADM2."),
        ("hcp-rgph2024-population-communes", "Population légale RGPH 2024 — communes", "communes", communes, "osm-mar-communes", lambda f: (f["properties"]["code"], f["properties"].get("nom") or ""), False,
         "Population légale des communes selon le RGPH 2024 (HCP), sur les contours des communes OpenStreetMap."),
    ]
    for cle, titre, niveau, geo, base, ident, milieu, desc in jeux:
        entites = []
        for f in geo["features"]:
            code_contour, nom_contour = ident(f)
            u = par_code.get(f["_code"]) if f.get("_code") else None
            entites.append(entite(f, u, code_contour, nom_contour, f.get("_methode") or ("code officiel" if niveau == "regions" else "nom normalisé + inclusion")))
        national = sum(u["population"] for (n, c), u in hcp.items() if n == "region")
        couverte = sum(e["properties"]["population"] or 0 for e in entites)
        pourcent = str(round(100 * couverte / national, 1)).replace(".", ",")
        part = f"{compte(lignes[niveau])} ; population rattachée : {couverte} habitants, soit {pourcent} % de la population légale nationale ({national})"
        ecrire(a.sortie, cle, titre, niveau, entites, base, desc, milieu, empreinte_excel, lignes[niveau], part)
        print(f"{cle} : {part}")


if __name__ == "__main__":
    main()
