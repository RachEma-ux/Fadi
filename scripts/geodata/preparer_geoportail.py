#!/usr/bin/env python3
"""
Administrations et services publics du portail maps.service-public.ma (MTNRA, data.gov.ma, mai 2022, ODbL) — script de
préparation GeoData (D-GD-42), hors application :

    python3 -I scripts/geodata/preparer_geoportail.py --excel donnees-geoportail-open-data-2022.xlsx [--sortie <dossier>]

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
    s = nom.lower().replace("région de l'", "").replace("région de ", "")
    for a, b in (("â", "a"), ("é", "e"), ("è", "e"), ("ê", "e"), ("ô", "o"), ("î", "i"), ("'", "-")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def lire_source(chemin):
    ws = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    lignes = ws.iter_rows(values_only=True)
    entete = [texte(v) for v in next(lignes)]
    if entete[: len(COLONNES)] != [c for c, _ in COLONNES]:
        sys.exit(f"En-tête inattendu : {entete}")
    for n, r in enumerate(lignes, start=2):
        yield n, [texte(v) for v in r]


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

    os.makedirs(os.path.join(a.sortie, "donnees"), exist_ok=True)
    with open(os.path.join(a.sortie, ORIGINE), "wb") as fh:
        fh.write(octets_source)
    bilan = {"lignes": total, "doublons": doublons, "sansPoint": sans_point, "horsContour": hors_contour, "couches": []}
    par_hcp = sum(1 for r in regions for o in r["objets"] if o["properties"]["rattachement"] == "province-hcp")
    par_source = sum(1 for r in regions for o in r["objets"] if o["properties"]["rattachement"] == "province-source")
    concordance = {k: sum(1 for r in regions for o in r["objets"] if o["properties"]["concordance"] == k) for k in ("concorde", "discorde", "non-appariee")}
    ecartes = (f"{par_hcp + par_source} points situés dans une lacune des contours rattachés par leur province publiée (propriété « rattachement » : "
               f"{par_hcp} « province-hcp » par le nom d'une province du RGPH, {PROVINCES}, SHA-256 {empreinte_provinces} ; "
               f"{par_source} « province-source ») ; "
               f"{len(doublons)} lignes strictement identiques à une ligne précédente non reprises ("
               + ", ".join(f"ligne {n} = ligne {m}" for n, m in doublons) + ") ; "
               f"{sum(1 for r in regions for o in r['objets'] if 'doublon_probable' in o['properties'])} objets de même nom au même point qu'un autre, "
               "aux autres champs différents, gardés et marqués (propriété « doublon_probable ») ; "
               f"{len(sans_point)} lignes sans point lisible (lignes {', '.join(map(str, sans_point))}) et {len(hors_contour)} points hors des "
               f"contours sans province rattachable (lignes {', '.join(map(str, hors_contour)) or 'aucune'}) écartés, jamais déplacés ; "
               f"rapprochement avec les provinces du RGPH (propriété « concordance », toutes régions) : {concordance['concorde']} concordent, "
               f"{concordance['discorde']} discordent, {concordance['non-appariee']} sans province du RGPH de même nom")
    for r in sorted(regions, key=lambda r: int(r["code"])):
        if len(r["objets"]) > MAX_OBJETS:
            sys.exit(f"{r['nom']} : {len(r['objets'])} objets > {MAX_OBJETS} (borne d'une couche V1).")
        cle = f"mtnra-services-publics-2022-{slug(r['nom'])}"
        octets = json.dumps({"type": "FeatureCollection", "features": r["objets"]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with open(os.path.join(a.sortie, "donnees", f"{cle}.geojson"), "wb") as fh:
            fh.write(octets)
        titre = f"Administrations et services publics — {r['nom']} (MTNRA, 2022)"
        fiche = {
            "cle": cle,
            "titre": titre,
            "description": (
                "Administrations et services publics recensés sur le portail maps.service-public.ma (Ministère de la Transition numérique et de "
                "la Réforme de l'Administration), données à jour en mai 2022, publiées sur data.gov.ma : « Coordonnées alphanumériques des "
                f"administrations disponibles sur le portail maps.service-public.ma » ({URL_JEU}), fichier donnees-geoportail-open-data-2022.xlsx "
                f"(SHA-256 {EMPREINTE_SOURCE}, {total} lignes). Points retenus : ceux situés dans le contour de la {r['nom']} "
                f"({REGIONS}, SHA-256 {empreinte_regions}) ; la source n'ayant ni colonne de région ni colonne de type, elle est "
                f"répartie par région (borne de {MAX_OBJETS} objets par couche) ; {ecartes}. Champs tels que publiés, en français et "
                "en arabe ; coordonnées, téléphones et adresses non vérifiés par Fadi."
            ),
            "producteur": "Ministère de la Transition numérique et de la Réforme de l'Administration (MTNRA)",
            "theme": "equipements",
            "couverture": f"{r['nom']} (contour RGPH 2024 livré)",
            "version": {
                "libelle": "data.gov.ma — mai 2022 (jeu modifié le 17 juin 2022)",
                "url": None,
                "fichier": f"donnees/{cle}.geojson",
                "empreinte": sha256(octets),
                "periode": "Données à jour en mai 2022",
                "licence": "Open Data Commons Open Database License 1.0 (ODbL)",
                "attribution": "© MTNRA — maps.service-public.ma, via data.gov.ma (ODbL)",
                "droits": DROITS_OUVERTS,
                "precision": "Points WKT publiés par le MTNRA (degrés, WGS 84) repris sans arrondi ; positions et adresses non vérifiées",
                "synthetique": False,
                "conditions": (f"ODbL 1.0 : attribution obligatoire ; une base dérivée redistribuée reste sous ODbL (partage à l'identique). "
                               f"Fichier d'origine : {URL_FICHIER}."),
                "origine": {"fichier": ORIGINE, "empreinte": EMPREINTE_SOURCE, "url": URL_FICHIER},
            },
            "couche": {
                "titre": titre,
                "description": f"{len(r['objets'])} objets ; code = « l » + numéro de ligne dans le fichier d'origine.",
                "niveau": None,
                "champCode": "code",
                "champNom": "nom",
                "proprietesExposees": ["code", "ligne", "rattachement", "province_hcp", "concordance", "doublon_probable"] + [c for _, c in COLONNES if c and any(c in o["properties"] for o in r["objets"])],
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
