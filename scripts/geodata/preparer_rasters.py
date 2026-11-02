#!/usr/bin/env python3
"""
Préparation des couches raster GeoData du Maroc depuis leurs sources d'origine ouvertes (D-GD-13) — script hors
application :

    python3 scripts/geodata/preparer_rasters.py [--sortie <dossier>] [--seulement cle,cle]

Grille commune : emprise [-17,2 ; 20,7 ; -0,95 ; 35,95] en WGS 84, pas de 0,01° (≈ 1,1 km), 1 625 × 1 525 cellules ;
cellules hors du territoire de geoBoundaries MAR ADM1 (empreinte vérifiée) mises à « sans donnée ». Chaque source est
rééchantillonnée vers cette grille (méthode déclarée dans la fiche : moyenne pour les grandeurs continues, mode ou plus
proche voisin pour les classes) ; aucune valeur n'est inventée. Sortie : `<sortie>/donnees/<cle>.tif` (GeoTIFF
EPSG:4326 compressé) et fiche qualifiée `<sortie>/<cle>.json` avec la déclaration `couche.raster`.
Dépendances : `pip install rasterio numpy`.
"""
import argparse
import hashlib
import io
import json
import os
import sys
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from rasterio.warp import reproject

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
OUEST, SUD, EST, NORD = -17.2, 20.7, -0.95, 35.95
PAS = 0.01
LARGEUR, HAUTEUR = round((EST - OUEST) / PAS), round((NORD - SUD) / PAS)
TRANSFORM = from_bounds(OUEST, SUD, EST, NORD, LARGEUR, HAUTEUR)
NODATA = -9999.0
DROITS_OUVERTS = {u: "autorise" for u in ["consultation", "stockage", "calcul", "tuiles", "commercial", "partage", "telechargement", "export"]}
os.environ.setdefault("GDAL_HTTP_USERAGENT", "Fadi-GeoData/1 (+https://www.fadimmo.com)")
UA = {"User-Agent": "Fadi-GeoData/1 (+https://www.fadimmo.com)"}


def telecharger(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=900).read()


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def masque_territoire():
    fiche = json.load(open(os.path.join(FICHES, "references", "geoboundaries-mar-adm1.json"), encoding="utf-8"))  # fiche de référence, non importée (D-GD-30)
    brut = telecharger(fiche["version"]["url"])
    if sha256(brut) != fiche["version"]["empreinte"]:
        sys.exit("Empreinte geoBoundaries ADM1 non conforme")
    formes = [(f["geometry"], 1) for f in json.loads(brut)["features"]]
    return rasterize(formes, out_shape=(HAUTEUR, LARGEUR), transform=TRANSFORM, fill=0, all_touched=True, dtype="uint8").astype(bool)


def vers_grille(sources, resampling, nodata_source=None, facteur=1.0):
    """Rééchantillonne une ou plusieurs images (chemins GDAL) vers la grille commune ; la première valeur valide gagne."""
    sortie = np.full((HAUTEUR, LARGEUR), np.nan, dtype="float64")
    for chemin, kwargs in sources:
        try:
            src = rasterio.open(chemin, **kwargs)
        except Exception as e:
            print(f"    ignoré {chemin[-80:]} : {str(e)[:80]}", file=sys.stderr)
            continue
        with src:
            dest = np.full((HAUTEUR, LARGEUR), np.nan, dtype="float64")
            nd = src.nodata if src.nodata is not None else nodata_source
            reproject(source=rasterio.band(src, 1), destination=dest, src_transform=src.transform, src_crs=src.crs, src_nodata=nd,
                      dst_transform=TRANSFORM, dst_crs="EPSG:4326", dst_nodata=np.nan, resampling=resampling)
            libre = np.isnan(sortie) & ~np.isnan(dest)
            sortie[libre] = dest[libre]
    return sortie * facteur


def tuiles_dem():
    out = []
    for lat in range(20, 36):
        for lon in range(-18, -0):
            ns = f"N{lat:02d}" if lat >= 0 else f"S{-lat:02d}"
            ew = f"W{-lon:03d}" if lon < 0 else f"E{lon:03d}"
            nom = f"Copernicus_DSM_COG_30_{ns}_00_{ew}_00_DEM"
            out.append((f"/vsicurl/https://copernicus-dem-90m.s3.amazonaws.com/{nom}/{nom}.tif", {"overview_level": 1}))
    return out


def tuiles_worldcover():
    out = []
    for lat in range(18, 36, 3):
        for lon in range(-18, 0, 3):
            ns = f"N{lat:02d}"
            ew = f"W{-lon:03d}"
            out.append((f"/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{ns}{ew}_Map.tif", {"overview_level": 4}))
    return out


CLASSES_WORLDCOVER = [
    (10, "Couvert arboré", "#006400"), (20, "Arbustes", "#ffbb22"), (30, "Prairies", "#ffff4c"), (40, "Cultures", "#f096ff"),
    (50, "Bâti", "#fa0000"), (60, "Sol nu ou végétation clairsemée", "#b4b4b4"), (70, "Neige et glace", "#f0f0f0"),
    (80, "Eaux permanentes", "#0064c8"), (90, "Zones humides herbacées", "#0096a0"), (95, "Mangroves", "#00cf75"), (100, "Mousses et lichens", "#fae6a0"),
]

SOILGRIDS = [
    ("phh2o", "pH du sol dans l'eau (0–5 cm)", "pH", 0.1, "sols"),
    ("clay", "Argile (0–5 cm)", "%", 0.1, "sols"),
    ("sand", "Sable (0–5 cm)", "%", 0.1, "sols"),
    ("silt", "Limon (0–5 cm)", "%", 0.1, "sols"),
    ("soc", "Carbone organique du sol (0–5 cm)", "g/kg", 0.1, "vegetation"),
    ("nitrogen", "Azote total (0–5 cm)", "g/kg", 0.01, "vegetation"),
    ("cec", "Capacité d'échange cationique à pH 7 (0–5 cm)", "cmol(c)/kg", 0.1, "sols"),
    ("bdod", "Densité apparente de la terre fine (0–5 cm)", "kg/dm³", 0.01, "sols"),
    ("cfvo", "Fragments grossiers (0–5 cm)", "% volume", 0.1, "sols"),
    ("ocd", "Densité de carbone organique (0–5 cm)", "kg/m³", 0.1, "vegetation"),
]


def soilgrids(prop):
    url = (f"https://maps.isric.org/mapserv?map=/map/{prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID={prop}_0-5cm_mean"
           f"&FORMAT=image/tiff&SUBSET=long({OUEST},{EST})&SUBSET=lat({SUD},{NORD})&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326"
           f"&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326&SCALESIZE=long({LARGEUR}),lat({HAUTEUR})")
    return url


def fichier_temp(octets, suffixe=".tif"):
    f = tempfile.NamedTemporaryFile(delete=False, suffix=suffixe)
    f.write(octets)
    f.close()
    return f.name


def ecrire(sortie, cle, titre, theme, grille, masque, meta, resultat, entier=False):
    g = np.where(masque & ~np.isnan(grille), grille, np.nan)
    valides = int((~np.isnan(g)).sum())
    if not valides:
        print(f"  {cle} écartée : aucune cellule valide", file=sys.stderr)
        resultat.append({"cle": cle, "ecartee": "aucune cellule valide"})
        return
    donnees = np.where(np.isnan(g), NODATA, np.round(g) if entier else g).astype("float32")
    os.makedirs(os.path.join(sortie, "donnees"), exist_ok=True)
    chemin = os.path.join(sortie, "donnees", f"{cle}.tif")
    with rasterio.open(chemin, "w", driver="GTiff", width=LARGEUR, height=HAUTEUR, count=1, dtype="float32", crs="EPSG:4326", transform=TRANSFORM,
                       nodata=NODATA, compress="deflate", predictor=3, tiled=True, blockxsize=256, blockysize=256) as d:
        d.write(donnees, 1)
    octets = open(chemin, "rb").read()
    raster = {"unite": meta["unite"], "grandeur": meta["grandeur"], "palette": meta.get("palette", "viridis")}
    if meta.get("classes"):
        raster["classes"] = [{"valeur": v, "libelle": l, "couleur": c} for v, l, c in meta["classes"]]
    fiche = {
        "cle": cle, "titre": titre, "description": meta["description"], "producteur": meta["producteur"], "theme": theme,
        "couverture": "Maroc (territoire de geoBoundaries gbOpen MAR ADM1)",
        "version": {
            "libelle": meta["libelle"], "url": None, "fichier": f"donnees/{cle}.tif", "empreinte": sha256(octets), "periode": meta["periode"],
            "licence": meta["licence"], "attribution": meta["attribution"], "droits": DROITS_OUVERTS,
            "precision": f"{meta['precision']} ; grille Fadi de 0,01° (≈ 1,1 km), {LARGEUR} × {HAUTEUR} cellules, rééchantillonnage {meta['methode']} ; hors territoire geoBoundaries MAR ADM1 : sans donnée",
            "synthetique": False, "conditions": meta["conditions"],
        },
        "couche": {"titre": titre, "description": meta["grandeur"], "niveau": None, "champCode": "code", "champNom": None, "proprietesExposees": [],
                   "styleDefaut": {"mode": "raster"}, "raster": raster},
        "indicateurs": [], "superficie": False,
    }
    with open(os.path.join(sortie, f"{cle}.json"), "w", encoding="utf-8") as fh:
        fh.write(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n")
    vmin, vmax = float(np.nanmin(g)), float(np.nanmax(g))
    resultat.append({"cle": cle, "cellules": valides, "min": vmin, "max": vmax, "octets": len(octets)})
    print(f"  {cle} : {valides} cellules, {vmin:.3g}–{vmax:.3g}, {len(octets) // 1024} Kio", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sortie", default=FICHES)
    ap.add_argument("--seulement")
    a = ap.parse_args()
    seul = set(a.seulement.split(",")) if a.seulement else None
    veut = lambda c: not seul or c in seul
    masque = masque_territoire()
    jour = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = []
    CC_BY = "Creative Commons Attribution 4.0 International (CC BY 4.0)"
    cond_ccby = "CC BY 4.0 : réutilisation libre, y compris commerciale, avec attribution de la source."

    if veut("copernicus-dem-mar-altitude") or veut("copernicus-dem-mar-pente"):
        print("Copernicus DEM GLO-90…", file=sys.stderr)
        alt = vers_grille(tuiles_dem(), Resampling.average)
        meta = {"producteur": "Agence spatiale européenne (ESA), programme Copernicus", "licence": "Licence Copernicus DEM GLO-90 : libre et gratuite, attribution obligatoire",
                "attribution": "Copernicus DEM GLO-90 © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni par l'ESA (programme Copernicus)",
                "conditions": "Réutilisation libre et gratuite ; mention de la source obligatoire.", "periode": "Acquisitions TanDEM-X 2011–2015",
                "libelle": f"Copernicus DEM GLO-90 (COG AWS Open Data), lu le {jour}"}
        if veut("copernicus-dem-mar-altitude"):
            ecrire(a.sortie, "copernicus-dem-mar-altitude", "Altitude du Maroc (Copernicus DEM)", "relief", alt, masque, {**meta,
                   "description": "Modèle numérique de surface Copernicus GLO-90 (tuiles COG publiques AWS, aperçus au 1/2), moyenné sur la grille Fadi. Surface (bâti, végétation compris), pas le terrain nu.",
                   "unite": "m", "grandeur": "Altitude de la surface", "palette": "relief", "precision": "Modèle de surface à 90 m d'origine", "methode": "moyenne"}, res, entier=True)
        if veut("copernicus-dem-mar-pente"):
            dy = PAS * 111_320.0
            lat = NORD - (np.arange(HAUTEUR) + 0.5) * PAS
            dx = (PAS * 111_320.0 * np.cos(np.radians(lat)))[:, None]
            gy, gx = np.gradient(alt)
            pente = np.degrees(np.arctan(np.hypot(gx / dx, gy / dy)))
            ecrire(a.sortie, "copernicus-dem-mar-pente", "Pente moyenne du Maroc (calculée, Copernicus DEM)", "relief", pente, masque, {**meta,
                   "description": "Pente calculée par Fadi (différences centrées) sur l'altitude Copernicus moyennée à ≈ 1,1 km : résultat calculé, lissé par la grille, non une pente locale mesurée.",
                   "unite": "°", "grandeur": "Pente moyenne calculée", "palette": "sols", "precision": "Pente dérivée de la grille d'altitude Fadi", "methode": "dérivation sur la grille"}, res)

    if veut("esa-worldcover-mar-occupation-sol"):
        print("ESA WorldCover…", file=sys.stderr)
        g = vers_grille(tuiles_worldcover(), Resampling.mode, nodata_source=0)
        ecrire(a.sortie, "esa-worldcover-mar-occupation-sol", "Occupation du sol du Maroc (ESA WorldCover 2021)", "occupation-sol", g, masque, {
            "description": "ESA WorldCover 10 m v200 (2021), tuiles COG publiques, aperçus réduits puis classe majoritaire par cellule de la grille Fadi.",
            "producteur": "Agence spatiale européenne (ESA), consortium WorldCover", "licence": CC_BY, "attribution": "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
            "conditions": cond_ccby, "periode": "2021", "libelle": f"ESA WorldCover 10 m 2021 v200, lu le {jour}", "unite": None, "grandeur": "Classe d'occupation du sol",
            "palette": "viridis", "classes": CLASSES_WORLDCOVER, "precision": "Carte à 10 m d'origine (exactitude globale déclarée ≈ 77 %)", "methode": "classe majoritaire (mode)"}, res, entier=True)

    for prop, titre, unite, facteur, palette in SOILGRIDS:
        cle = f"soilgrids-mar-{prop}"
        if not veut(cle):
            continue
        print(f"SoilGrids {prop}…", file=sys.stderr)
        chemin = fichier_temp(telecharger(soilgrids(prop)))
        with rasterio.open(chemin) as d:
            brut = d.read(1).astype("float64")
        # Sans donnée : valeurs négatives (remplissage du WCS) ; 0 aussi, sauf pour les fragments grossiers où 0 % est une valeur.
        brut[(brut < 0) | ((brut == 0) & (prop != "cfvo"))] = np.nan
        ecrire(a.sortie, cle, f"{titre} — SoilGrids", "sols", brut * facteur, masque, {
            "description": f"SoilGrids 2.0 (ISRIC), propriété « {prop} », moyenne prédite 0–5 cm, servie par le WCS d'ISRIC directement sur la grille Fadi (valeur stockée × {facteur} pour l'unité affichée).",
            "producteur": "ISRIC — World Soil Information (SoilGrids 2.0)", "licence": CC_BY, "attribution": "SoilGrids 2.0 © ISRIC — World Soil Information (CC BY 4.0)",
            "conditions": cond_ccby, "periode": "Modèle SoilGrids 2.0 (2020)", "libelle": f"SoilGrids 2.0 {prop}_0-5cm_mean, WCS lu le {jour}", "unite": unite,
            "grandeur": titre, "palette": palette, "precision": "Prédiction statistique à 250 m (incertitude non représentée)", "methode": "WCS ISRIC (plus proche voisin)"}, res)
        os.unlink(chemin)

    if veut("chirps-mar-precipitations-2024"):
        print("CHIRPS…", file=sys.stderr)
        chemin = fichier_temp(telecharger("https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_annual/tifs/chirps-v2.0.2024.tif"))
        g = vers_grille([(chemin, {})], Resampling.bilinear, nodata_source=-9999)
        ecrire(a.sortie, "chirps-mar-precipitations-2024", "Précipitations annuelles 2024 au Maroc (CHIRPS)", "climat", g, masque, {
            "description": "Cumul annuel 2024 de CHIRPS v2.0 (Climate Hazards Group, UC Santa Barbara), grille 0,05°, interpolé sur la grille Fadi.",
            "producteur": "Climate Hazards Center, University of California Santa Barbara (CHIRPS v2.0)", "licence": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
            "attribution": "CHIRPS v2.0 — Funk et al. (2015), Climate Hazards Center, UC Santa Barbara", "conditions": cond_ccby, "periode": "Année 2024",
            "libelle": "CHIRPS v2.0 global_annual 2024", "unite": "mm", "grandeur": "Cumul de précipitations 2024", "palette": "precipitations",
            "precision": "Estimation satellite et stations à 0,05° (≈ 5,5 km)", "methode": "bilinéaire"}, res)
        os.unlink(chemin)

    if veut("gwa-mar-vent-100m"):
        print("Global Wind Atlas…", file=sys.stderr)
        chemins = [fichier_temp(telecharger(f"https://globalwindatlas.info/api/gis/country/{p}/wind-speed/100")) for p in ("MAR", "ESH")]
        g = vers_grille([(c, {}) for c in chemins], Resampling.average)
        ecrire(a.sortie, "gwa-mar-vent-100m", "Vitesse moyenne du vent à 100 m au Maroc (Global Wind Atlas)", "energie", g, masque, {
            "description": "Global Wind Atlas 4.0 (DTU, Banque mondiale), vitesse moyenne du vent à 100 m, rasters pays MAR et ESH moyennés sur la grille Fadi.",
            "producteur": "Université technique du Danemark (DTU) et Banque mondiale (ESMAP) — Global Wind Atlas 4.0", "licence": CC_BY,
            "attribution": "Global Wind Atlas 4.0, a free, web-based application developed, owned and operated by DTU in partnership with the World Bank Group (ESMAP)",
            "conditions": cond_ccby, "periode": "Climatologie 2008–2017 (modèle)", "libelle": f"Global Wind Atlas 4.0 wind-speed 100 m (MAR, ESH), lu le {jour}",
            "unite": "m/s", "grandeur": "Vitesse moyenne du vent à 100 m", "palette": "eau", "precision": "Modélisation à 250 m d'origine", "methode": "moyenne"}, res)
        for c in chemins:
            os.unlink(c)

    if veut("gsa-mar-productible-pv"):
        print("Global Solar Atlas…", file=sys.stderr)
        z = zipfile.ZipFile(io.BytesIO(telecharger("https://api.globalsolaratlas.info/download/Morocco/Morocco_GISdata_LTAym_YearlyMonthlyTotals_GlobalSolarAtlas-v2_GEOTIFF.zip")))
        nom = [n for n in z.namelist() if n.endswith("/PVOUT.tif")][0]
        chemin = fichier_temp(z.read(nom))
        g = vers_grille([(chemin, {})], Resampling.average)
        ecrire(a.sortie, "gsa-mar-productible-pv", "Productible photovoltaïque spécifique au Maroc (Global Solar Atlas)", "energie", g, masque, {
            "description": "Global Solar Atlas 2.0 (Solargis, Banque mondiale), PVOUT : énergie annuelle produite par kWc installé, moyenne de long terme, moyennée sur la grille Fadi.",
            "producteur": "Solargis et Banque mondiale (ESMAP) — Global Solar Atlas 2.0", "licence": CC_BY,
            "attribution": "Global Solar Atlas 2.0, Solargis s.r.o. on behalf of the World Bank Group, funded by ESMAP", "conditions": cond_ccby,
            "periode": "Moyenne de long terme 1994/1999/2007–2018", "libelle": "Global Solar Atlas 2.0 Morocco PVOUT (LTAy)", "unite": "kWh/kWc/an",
            "grandeur": "Productible PV spécifique annuel", "palette": "energie", "precision": "Modélisation à 9 arcsec (≈ 250 m) d'origine ; territoire couvert par le fichier pays", "methode": "moyenne"}, res)
        os.unlink(chemin)

    if veut("worldpop-mar-population-2020"):
        print("WorldPop…", file=sys.stderr)
        chemins = [fichier_temp(telecharger(f"https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/{p}/{p.lower()}_ppp_2020_1km_Aggregated.tif")) for p in ("MAR", "ESH")]
        g = vers_grille([(c, {}) for c in chemins], Resampling.nearest)
        ecrire(a.sortie, "worldpop-mar-population-2020", "Population estimée 2020 au Maroc (WorldPop, 1 km)", "population", g, masque, {
            "description": "WorldPop, population estimée par cellule de 30 arcsec (≈ 1 km), 2020, non contrainte, rasters pays MAR et ESH. Estimation modélisée : ce n'est pas un recensement.",
            "producteur": "WorldPop (Université de Southampton)", "licence": CC_BY, "attribution": "WorldPop (www.worldpop.org — School of Geography and Environmental Science, University of Southampton) ; doi:10.5258/SOTON/WP00671",
            "conditions": cond_ccby, "periode": "2020", "libelle": "WorldPop Global 2000–2020 1 km, 2020, MAR et ESH (agrégé)", "unite": "habitants/cellule",
            "grandeur": "Population estimée par cellule", "palette": "population", "precision": "Modèle à 30 arcsec ; cellule source ≈ cellule Fadi (plus proche voisin, pas de redistribution)", "methode": "plus proche voisin"}, res)
        for c in chemins:
            os.unlink(c)

    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
