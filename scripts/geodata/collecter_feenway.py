#!/usr/bin/env python3
"""
Relevé **provisoire** des prix de quartier affichés par FeenWay (décision du maître d'ouvrage du 31 octobre 2026,
D-GD-54) — script de préparation GeoData, hors application :

    python3 -I scripts/geodata/collecter_feenway.py [--sortie docs/geodata/sources/provisoires/donnees/feenway-prix-quartiers-origine.json]

FeenWay sert, pour l'emprise de sa carte, les polygones de ses quartiers et leur « Prix Quartier » (moyenne, minimum et
maximum en DH/m², indice de confiance de 0 à 5) par `GET https://www.feenway.com/api/neighborhoods?north&south&east&west`
(au plus 500 quartiers par réponse). Le relevé couvre le Maroc par emprises successives : une emprise qui atteint la
borne de 500 est découpée en quatre, jusqu'à ce que chaque réponse soit complète ; chaque quartier est gardé une fois
(par son identifiant FeenWay). Le fichier écrit est la réponse **telle quelle** (propriétés et géométries non modifiées),
quartiers triés par identifiant : c'est le fichier d'origine archivé, que `preparer_prix_quartiers.py` met au schéma
commun des prix de quartier.

**Statut** : source provisoire, droits de FeenWay non établis (ni licence, ni conditions de réutilisation publiées ;
prix sans source, date, nombre d'annonces ni méthode déclarés par FeenWay). Usage limité à l'étape de développement
(préproduction, développement) ; jamais importée ni servie en production (`GEODATA_SOURCES_PROVISOIRES`). Une requête
toutes les 0,5 seconde au plus.
"""
import argparse
import json
import sys
import time
import urllib.request

URL = "https://www.feenway.com/api/neighborhoods?north={n}&south={s}&east={e}&west={w}"
BORNE = 500
# Emprise de départ : le Maroc (territoire de geoBoundaries MAR ADM1) avec une marge.
MAROC = (36.0, 20.5, -0.9, -17.2)


def lire(n, s, e, w):
    req = urllib.request.Request(URL.format(n=n, s=s, e=e, w=w), headers={"User-Agent": "Fadi-GeoData (releve provisoire D-GD-54)"})
    for essai in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)["features"]
        except Exception as x:  # réseau : nouvel essai, puis abandon explicite
            if essai == 3:
                sys.exit(f"Relevé interrompu ({n}, {s}, {e}, {w}) : {x}")
            time.sleep(2 ** essai)


def releve(n, s, e, w, quartiers, profondeur=0):
    objets = lire(n, s, e, w)
    time.sleep(0.5)
    if len(objets) >= BORNE:
        if profondeur >= 8:
            sys.exit(f"Emprise encore saturée après 8 découpages : {n}, {s}, {e}, {w}.")
        mn, me = (n + s) / 2, (e + w) / 2
        for q in ((n, mn, e, me), (n, mn, me, w), (mn, s, e, me), (mn, s, me, w)):
            releve(*q, quartiers, profondeur + 1)
        return
    for o in objets:
        quartiers[o["properties"]["id"]] = o


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--sortie", default="docs/geodata/sources/provisoires/donnees/feenway-prix-quartiers-origine.json")
    a = p.parse_args()
    quartiers = {}
    releve(*MAROC, quartiers)
    collection = {"type": "FeatureCollection", "features": [quartiers[k] for k in sorted(quartiers)]}
    with open(a.sortie, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(collection, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({"quartiers": len(quartiers), "sortie": a.sortie}, ensure_ascii=False))


if __name__ == "__main__":
    main()
