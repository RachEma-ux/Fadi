#!/usr/bin/env python3
"""
Couche « Prix des quartiers » au **schéma commun** GeoData (D-GD-54) — script de préparation, hors application :

    python3 -I scripts/geodata/preparer_prix_quartiers.py --declaration scripts/geodata/sources-prix/<source>.json

Une déclaration de source (JSON, voir `scripts/geodata/sources-prix/`) dit d'où viennent les prix (producteur, fichier
d'origine, licence, droits, période, qualification) et comment lire ses champs (`champs` : code, nom, ville, prix moyen,
minimum, maximum, indice de confiance). Le script lit le fichier d'origine (GeoJSON de polygones, WGS 84), écrit la couche
au schéma commun et sa fiche :

- `<dossier>/donnees/<cle>.geojson` : un objet par quartier, propriétés du schéma commun seulement —
  `code` (préfixe de la source + identifiant d'origine), `nom`, `ville`, `prix_m2`, `prix_min_m2`, `prix_max_m2`,
  `indice_confiance` ; géométrie d'origine, coordonnées arrondies à 10⁻⁶ degré (≈ 0,1 m) ;
- `<dossier>/<cle>.json` : fiche de la source (empreintes calculées, indicateurs du schéma commun, qualification).

Toute source future de prix (qualifiée : ANCFCC, DGI, Bank Al-Maghrib… ; ou une autre source provisoire) passe par la même
déclaration et produit les **mêmes indicateurs** (thème « Immobilier », mêmes familles, même unité) : l'interface les
reconnaît par leur clé, sans aucun changement de code ; la source remplacée se retire par `donnees/retraits-sources.json`.

Rien n'est inventé : une valeur absente ou non numérique de l'origine reste absente (« non publiée »), jamais zéro ; aucun
prix n'est recalculé, lissé ni corrigé ; un minimum supérieur au moyen ou un moyen supérieur au maximum est signalé dans
le bilan et gardé tel quel (jamais corrigé). Un code en double arrête la préparation.
"""
import argparse
import hashlib
import json
import os
import sys

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SOURCES = os.path.join(RACINE, "docs", "geodata", "sources")

# Schéma commun des prix de quartier (D-GD-54) : propriété → (titre, famille, ordre). Unité commune, thème commun.
INDICATEURS = [
    ("prix_m2", "Prix moyen au m²", 0),
    ("prix_min_m2", "Prix minimal au m²", 1),
    ("prix_max_m2", "Prix maximal au m²", 2),
]
THEME_INDICATEURS = "Immobilier"
CHAMPS = ("code", "nom", "ville", "prix", "min", "max", "confiance")
OBLIGATOIRES = ("cle", "titre", "producteur", "couverture", "description", "origine", "unite", "version", "champs", "prefixeCode")


def sha256(octets):
    return hashlib.sha256(octets).hexdigest()


def arrondir(c):
    if isinstance(c, (int, float)):
        return round(c, 6)
    return [arrondir(x) for x in c]


def nombre(x):
    """Valeur numérique de l'origine, sinon None (absente) ; un booléen n'est pas un nombre."""
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        return x
    if isinstance(x, str):
        try:
            return float(x.replace(",", ".")) if x.strip() else None
        except ValueError:
            return None
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--declaration", required=True)
    p.add_argument("--sources", default=SOURCES, help="dossier des fiches (défaut : docs/geodata/sources)")
    a = p.parse_args()
    d = json.load(open(a.declaration, encoding="utf-8"))
    manquants = [k for k in OBLIGATOIRES if k not in d] + [f"champs.{k}" for k in CHAMPS if k not in d.get("champs", {})]
    if manquants:
        sys.exit(f"Déclaration incomplète : {', '.join(manquants)}.")
    dossier = os.path.join(a.sources, d.get("dossier", ""))
    origine = os.path.join(dossier, d["origine"]["fichier"])
    octets_origine = open(origine, "rb").read()
    champs = d["champs"]
    objets, codes, bilan = [], set(), {"quartiers": 0, "absentes": {k: 0 for k, _, _ in INDICATEURS}, "incoherents": [], "geometries": {}}
    for f in json.loads(octets_origine)["features"]:
        pr = f.get("properties") or {}
        brut = pr.get(champs["code"])
        if brut is None or str(brut) == "":
            sys.exit("Quartier sans identifiant d'origine : préparation arrêtée.")
        code = f"{d['prefixeCode']}{brut}"
        if code in codes:
            sys.exit(f"Code en double : {code}.")
        codes.add(code)
        g = f.get("geometry") or {}
        if g.get("type") not in ("Polygon", "MultiPolygon"):
            sys.exit(f"{code} : géométrie {g.get('type')} (polygone attendu).")
        bilan["geometries"][g["type"]] = bilan["geometries"].get(g["type"], 0) + 1
        valeurs = {"prix_m2": nombre(pr.get(champs["prix"])), "prix_min_m2": nombre(pr.get(champs["min"])), "prix_max_m2": nombre(pr.get(champs["max"]))}
        for k, v in valeurs.items():
            if v is None:
                bilan["absentes"][k] += 1
        mn, moy, mx = valeurs["prix_min_m2"], valeurs["prix_m2"], valeurs["prix_max_m2"]
        if None not in (mn, moy, mx) and not (mn <= moy <= mx):
            bilan["incoherents"].append(code)
        proprietes = {"code": code, "nom": pr.get(champs["nom"]), "ville": pr.get(champs["ville"]), **valeurs, "indice_confiance": nombre(pr.get(champs["confiance"]))}
        objets.append({"type": "Feature", "properties": proprietes, "geometry": {"type": g["type"], "coordinates": arrondir(g["coordinates"])}})
    objets.sort(key=lambda o: o["properties"]["code"])
    bilan["quartiers"] = len(objets)
    if len(objets) > 5000:
        sys.exit(f"{len(objets)} quartiers : au-delà de la borne de 5 000 objets d'une couche.")
    octets = json.dumps({"type": "FeatureCollection", "features": objets}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    os.makedirs(os.path.join(dossier, "donnees"), exist_ok=True)
    chemin_donnees = os.path.join(dossier, "donnees", f"{d['cle']}.geojson")
    with open(chemin_donnees, "wb") as fh:
        fh.write(octets)
    villes = sorted({o["properties"]["ville"] for o in objets if o["properties"]["ville"]})
    v = d["version"]
    periode = v.get("periode")
    description_indicateur = d.get("descriptionIndicateurs", f"{d['producteur']} — valeur déclarée par la source, reprise sans recalcul.")
    fiche = {
        "cle": d["cle"],
        "titre": d["titre"],
        "description": f"{d['description']} {len(objets)} quartiers dans {len(villes)} villes.",
        "producteur": d["producteur"],
        "theme": "immobilier",
        "couverture": d["couverture"],
        "version": {
            "libelle": v["libelle"],
            "url": v.get("url"),
            "fichier": f"donnees/{d['cle']}.geojson",
            "empreinte": sha256(octets),
            "periode": periode,
            "licence": v["licence"],
            "attribution": v["attribution"],
            "droits": v["droits"],
            "precision": v["precision"],
            "synthetique": False,
            "conditions": v["conditions"],
            "origine": {"fichier": d["origine"]["fichier"], "empreinte": sha256(octets_origine), "url": d["origine"].get("url")},
            **({"qualification": d["qualification"]} if d.get("qualification") else {}),
        },
        "couche": {
            "titre": d["titre"],
            "description": (f"{len(objets)} quartiers ; code = « {d['prefixeCode']} » + identifiant de la source ; schéma commun des prix "
                            f"de quartier (D-GD-54) ; indice de confiance : {d.get('echelleConfiance', 'tel que déclaré par la source')}."),
            "niveau": None,
            "champCode": "code",
            "champNom": "nom",
            "proprietesExposees": ["code", "nom", "ville", "prix_m2", "prix_min_m2", "prix_max_m2", "indice_confiance"],
            "styleDefaut": {"mode": "simple", "couleur": "#b15928"},
        },
        "indicateurs": [
            {
                "propriete": k, "titre": t, "unite": d["unite"], "periode": periode, "denominateur": None,
                "description": f"{description_indicateur} {t} du quartier.",
                "motifSiAbsente": "non-publiee", "theme": THEME_INDICATEURS, "famille": t, "modalite": None,
                "milieu": "ensemble", "sexe": "ensemble", "ordre": o,
            }
            for k, t, o in INDICATEURS
        ],
        "superficie": True,
    }
    with open(os.path.join(dossier, f"{d['cle']}.json"), "w", encoding="utf-8") as fh:
        fh.write(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({**bilan, "villes": len(villes), "empreinte": fiche["version"]["empreinte"], "octets": len(octets)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
