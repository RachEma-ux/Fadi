#!/usr/bin/env python3
"""
Royaume du Maroc : ligne nationale du RGPH 2024, concepts et tableau de bord (D-GD-37) — script hors application :

    python3 scripts/geodata/preparer_hcp_royaume.py --indicateurs <indicateurs.xlsx> [--sortie docs/geodata/sources]

Produit la fiche qualifiée `hcp-rgph2024-royaume.json` et ses fichiers :
  - `donnees/hcp-rgph2024-royaume.geojson` : une seule entité (code `MA`, « Royaume du Maroc »), contour = union des
    contours des 12 régions déjà livrés (`hcp-rgph2024-population-regions.geojson`, D-GD-33) : même topologie ;
  - `donnees/hcp-rgph2024-royaume.csv` : la ligne « Ensemble du territoire national » du fichier « Indicateurs
    démographiques et socio-économiques du Royaume du Maroc selon les résultats du RGPH 2024 » (HCP,
    https://www.hcp.ma/file/242671/, CC BY 4.0), valeurs reprises sans modification ; et les totaux nationaux de la
    CEE 2023/2024 (effectifs seulement), **calculés** par somme des 12 régions — déclarés « calculé » (nature
    `calcule`, méthode écrite), jamais présentés comme publiés ; un total dont une région manque reste absent ;
  - annexe `concepts` (`donnees/hcp-rgph2024-concepts.json`) : la feuille « Définitions_des_Concepts » du même fichier,
    une entrée par concept et par langue (français seulement : le HCP ne publie pas cette feuille en arabe dans ce
    fichier ; l'arabe reste « Donnée non disponible ») ;
  - annexe `tableau` (`donnees/hcp-rgph2024-tableau-de-bord.json`) : la définition des blocs des onglets (mise en page,
    `tableau_de_bord_hcp.py`) — pas une donnée du HCP.
Dépendances : `pip install openpyxl shapely`.
"""
import argparse
import csv
import hashlib
import json
import os
import sys

import openpyxl
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from indicateurs_hcp import CODE_NATIONAL, lire_indicateurs  # noqa: E402
from tableau_de_bord_hcp import definition  # noqa: E402

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
URL_IND = "https://www.hcp.ma/file/242671/"
CGU_HCP = "https://www.hcp.ma/Conditions-generales-d-utilisation-Version-1-0_a2194.html"
CLE = "hcp-rgph2024-royaume"
NOM = "Royaume du Maroc"
SIGNE_VIDE = "vide"
# Indicateurs de la CEE dont le total national est une somme de comptes (établissements, emplois, souks).
UNITES_ADDITIVES = {"établissements", "emplois", "souks"}


def cellule(v):
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return repr(round(v, 6)) if isinstance(v, float) else str(v)


def lire_concepts(chemin):
    """Feuille « Définitions_des_Concepts » : blocs séparés par une ligne vide ; 1re ligne « Titre : », puis le texte."""
    ws = openpyxl.load_workbook(chemin, read_only=True, data_only=True)["Définitions_des_Concepts"]
    blocs, courant = [], []
    for r in list(ws.iter_rows(values_only=True))[1:]:
        t = (r[0] if r else None)
        t = str(t).replace("\xa0", " ").strip() if t is not None else ""
        if not t:
            if courant:
                blocs.append(courant)
            courant = []
            continue
        courant.append(t)
    if courant:
        blocs.append(courant)
    concepts = []
    for b in blocs:
        titre = b[0]
        if not titre.endswith(":") or len(b) < 2:
            sys.exit(f"Bloc de concept inattendu (titre « … : » puis texte) : {b[:2]}")
        concepts.append({"langue": "fr", "ordre": len(concepts), "titre": titre[:-1].strip(), "texte": "\n".join(b[1:])})
    return concepts


def ecrire_octets(chemin, octets):
    with open(chemin, "wb") as f:
        f.write(octets)
    return hashlib.sha256(octets).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indicateurs", required=True, help="Indicateurs démographiques et socio-économiques RGPH 2024 (https://www.hcp.ma/file/242671/)")
    ap.add_argument("--sortie", default=FICHES)
    a = ap.parse_args()
    with open(a.indicateurs, "rb") as f:
        empreinte_source = hashlib.sha256(f.read()).hexdigest()
    declarations, valeurs = lire_indicateurs(a.indicateurs, national=True)
    nat = valeurs.get(CODE_NATIONAL)
    if not nat:
        sys.exit("Ligne « Ensemble du territoire national » introuvable dans le fichier d'indicateurs.")

    # Totaux nationaux de la CEE : somme des 12 régions (fiche des régions déjà livrée), effectifs seulement.
    fiche_regions = json.load(open(os.path.join(a.sortie, "hcp-rgph2024-population-regions.json"), encoding="utf-8"))
    regions = list(csv.DictReader(open(os.path.join(a.sortie, fiche_regions["version"]["tableau"]["fichier"]), encoding="utf-8")))
    if len(regions) != 12:
        sys.exit(f"12 régions attendues dans le tableau des régions, {len(regions)} lues.")
    cee = [d for d in fiche_regions["indicateurs"] if d["propriete"].startswith("cee_") and d["unite"] in UNITES_ADDITIVES]
    for d in cee:
        brutes = [r.get(d["propriete"], "") for r in regions]
        nombres = [float(x) for x in brutes if x not in ("", None) and x.replace(".", "", 1).isdigit()]
        nat[d["propriete"]] = sum(nombres) if len(nombres) == 12 else SIGNE_VIDE
        declarations.append({
            **d, "ordre": len(declarations),
            "description": d["description"] + " Total national calculé par GeoData : somme des valeurs des 12 régions (non publié tel quel par le HCP).",
            "calcul": "Somme des valeurs des 12 régions de la même source (HCP, CEE 2023/2024) — résultat calculé, non une valeur publiée",
        })

    # Contour : union des 12 régions (topologie partagée D-GD-33).
    regions_geo = json.load(open(os.path.join(a.sortie, fiche_regions["version"]["fichier"]), encoding="utf-8"))
    union = unary_union([shape(f["geometry"]) for f in regions_geo["features"]]).buffer(0)
    fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"code": CODE_NATIONAL, "nom": NOM}, "geometry": mapping(union)}]}
    dossier = os.path.join(a.sortie, "donnees")
    os.makedirs(dossier, exist_ok=True)
    octets_geo = json.dumps(fc, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    empreinte_geo = ecrire_octets(os.path.join(dossier, f"{CLE}.geojson"), octets_geo)

    colonnes = [d["propriete"] for d in declarations]
    tab = ("\n".join([",".join(["code"] + colonnes), ",".join([CODE_NATIONAL] + [cellule(nat.get(c, SIGNE_VIDE)) for c in colonnes])]) + "\n").encode()
    empreinte_tab = ecrire_octets(os.path.join(dossier, f"{CLE}.csv"), tab)

    concepts = lire_concepts(a.indicateurs)
    octets_c = (json.dumps({"source": f"HCP, RGPH 2024 — « Indicateurs démographiques et socio-économiques du Royaume du Maroc selon les résultats du RGPH 2024 », feuille « Définitions_des_Concepts » ({URL_IND}, CC BY 4.0)",
                            "concepts": concepts}, ensure_ascii=False, indent=1) + "\n").encode()
    empreinte_c = ecrire_octets(os.path.join(dossier, "hcp-rgph2024-concepts.json"), octets_c)

    octets_t = (json.dumps(definition("MA", CODE_NATIONAL, NOM), ensure_ascii=False, indent=1) + "\n").encode()
    empreinte_t = ecrire_octets(os.path.join(dossier, "hcp-rgph2024-tableau-de-bord.json"), octets_t)

    fiche = {
        "cle": CLE,
        "titre": "Royaume du Maroc — ensemble du territoire national (RGPH 2024)",
        "description": "Ligne « Ensemble du territoire national » des indicateurs démographiques et socio-économiques du RGPH 2024 (HCP), par milieu et par sexe ; "
                       "totaux nationaux de la CEE 2023/2024 calculés par somme des 12 régions (marqués « calculé »). Contour = union des contours des 12 régions "
                       "(OpenStreetMap, D-GD-33). Annexes : concepts et définitions du HCP (français), définition du tableau de bord (D-GD-37, mise en page, non une donnée du HCP). "
                       "Signes du HCP : « … » = sans objet, « . » = indisponible ; cellule vide = non publiée ; jamais zéro.",
        "producteur": "Haut-Commissariat au Plan (HCP), Recensement général de la population et de l'habitat 2024 ; contours : Contributeurs OpenStreetMap",
        "theme": "population",
        "couverture": "Maroc — ensemble du territoire national",
        "version": {
            "libelle": "RGPH 2024 — ligne nationale des indicateurs démographiques et socio-économiques (fichier Excel HCP) ; contour : union des 12 régions",
            "url": None,
            "fichier": f"donnees/{CLE}.geojson",
            "empreinte": empreinte_geo,
            "tableau": {"fichier": f"donnees/{CLE}.csv", "empreinte": empreinte_tab, "signes": {"…": "sans-objet", ".": "non-publiee", "_": "sans-objet", SIGNE_VIDE: "non-publiee"}},
            "annexes": {
                "concepts": {"fichier": "donnees/hcp-rgph2024-concepts.json", "empreinte": empreinte_c,
                             "description": f"{len(concepts)} concepts et définitions du RGPH 2024 publiés par le HCP (français) ; arabe non publié dans ce fichier."},
                "tableau": {"fichier": "donnees/hcp-rgph2024-tableau-de-bord.json", "empreinte": empreinte_t,
                            "description": "Définition des blocs des onglets « Chiffres clés 2024 » et « CEE 2024 » (D-GD-37) : familles d'indicateurs désignées, sommes et rapports déclarés ; aucune valeur."},
            },
            "periode": "Recensement de septembre 2024",
            "licence": "Valeurs : Creative Commons Attribution 4.0 (CC BY 4.0, CGU du HCP v1.0 § 3) ; contour : Open Data Commons Open Database License 1.0 (ODbL)",
            "attribution": "HCP, RGPH 2024 (CC BY 4.0), données retraitées ; © contributeurs OpenStreetMap (ODbL)",
            "droits": {u: "autorise" for u in ["consultation", "stockage", "calcul", "tuiles", "commercial", "partage", "telechargement", "export"]},
            "precision": "Effectifs et taux officiels repris sans modification (taux arrondis au dixième par le HCP) ; totaux CEE calculés (somme des régions)",
            "synthetique": False,
            "conditions": f"Valeurs HCP sous CC BY 4.0 ({CGU_HCP}) : citer « HCP, RGPH 2024 », indiquer les modifications (mise en tableau, totaux CEE calculés), "
                          "ne pas laisser entendre que le HCP soutient Fadi, respecter l'intégrité des données. "
                          f"Source : {URL_IND} (SHA-256 {empreinte_source}). Contour : ODbL 1.0, attribution « © contributeurs OpenStreetMap » obligatoire.",
        },
        "couche": {
            "titre": "RGPH 2024 — Royaume du Maroc",
            "description": "Ensemble du territoire national ; code = MA.",
            "niveau": "ADM0",
            "champCode": "code",
            "champNom": "nom",
            "proprietesExposees": ["code", "nom"],
            "styleDefaut": {"mode": "simple", "couleur": "#2b8cbe"},
        },
        "indicateurs": declarations,
        "superficie": True,
    }
    with open(os.path.join(a.sortie, f"{CLE}.json"), "w", encoding="utf-8") as f:
        json.dump(fiche, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{CLE} : {len(declarations)} indicateurs ({len(cee)} totaux CEE calculés), {len(concepts)} concepts, contour {len(octets_geo)} octets")


if __name__ == "__main__":
    main()
