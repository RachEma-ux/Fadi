"""
Base des douars du RGPH 2024 du HCP (« Population et ménages par douars », octobre 2025, CC BY 4.0) — D-GD-20, D-GD-21,
lot E. Module de `preparer_hcp.py`.

Le douar n'a pas de contour : la base n'est pas une couche, elle est livrée en annexe de la fiche des communes
(`donnees/hcp-rgph2024-douars.tsv`) et affichée dans la fiche de la commune rurale. Le code du douar (13 chiffres, zéros
initiaux parfois perdus dans le fichier) se lit : province (3) + cercle (2) + commune (2) + fraction (3) + douar (3) ; la
commune du RGPH est celle dont le code finit par province + cercle + commune (unique, sinon le douar est écarté et
compté). Les noms ne sont publiés qu'en arabe : ils sont gardés tels quels (D-GD-21). « X » = donnée supprimée par le
HCP (moins de 30 ménages ou faible taux de déclaration) : secret statistique, jamais zéro.

Deux feuilles, jointes par le code du douar (D-GD-42) : « caractéristiques de la population » (nationalité, sexe, âge,
état civil, état matrimonial) et « caractéristiques des ménages » (type de logement, distances moyennes aux équipements).
Les colonnes répétées dans la seconde feuille (lieux, type, ménages, population) ne sont pas reprises une seconde fois :
elles doivent être identiques à celles de la première, sinon la préparation s'arrête. Le fichier d'origine est archivé
tel quel à côté de l'annexe (`donnees/hcp-rgph2024-douars-origine.xlsx`, D-GD-29).

Seul (sans les autres fichiers du HCP) : `python3 -I scripts/geodata/douars_hcp.py --douars <fichier.xlsx>` réécrit
l'annexe, archive l'original et met à jour la fiche des communes.
"""
import argparse
import csv
import hashlib
import json
import os
import shutil
import sys

import openpyxl

TYPES = {"دوار مجمع": "groupé", "دوار مجزأ": "éclaté", "دوار مشتت": "dispersé"}
# Colonnes gardées (feuille « caractéristiques de la population ») : indice → nom de colonne.
COLONNES = [(8, "menages"), (9, "population"), (12, "masculin"), (13, "feminin"), (14, "moins_15"), (15, "de_15_a_59"), (16, "plus_60")]
# Compléments (D-GD-42), ajoutés après les colonnes du lot E : population (feuille 1), puis ménages (feuille 2).
COMPLEMENTS_POPULATION = [(10, "marocaine"), (11, "etrangere"), (17, "etat_civil"), (18, "pop_15_plus"), (19, "celibataire"),
                          (20, "marie"), (21, "divorce"), (22, "veuf")]
COMPLEMENTS_MENAGES = [(10, "log_villa"), (11, "log_appartement"), (12, "log_traditionnelle"), (13, "log_moderne"), (14, "log_sommaire"),
                       (15, "log_dur_rural"), (16, "log_pise_rural"), (17, "log_autre"), (18, "dist_route_goudronnee"),
                       (19, "dist_route_carrossable"), (20, "dist_ecole"), (21, "dist_college"), (22, "dist_lycee"), (23, "dist_sante")]
ENTETE = ["code", "commune", "fraction", "nom", "type"] + [n for _, n in COLONNES + COMPLEMENTS_POPULATION + COMPLEMENTS_MENAGES]
ORIGINE = "donnees/hcp-rgph2024-douars-origine.xlsx"


def _t(x):
    return " ".join(str(x).split()) if x is not None else ""


def _valeur(x):
    if isinstance(x, (int, float)):
        return x
    s = _t(x)
    if s == "X":
        return "X"
    try:
        v = float(s)
        return int(v) if v.is_integer() and "." not in s else round(v, 4)
    except ValueError:
        return ""


def _feuille(ws):
    """Lignes de données d'une feuille, par code de douar (13 chiffres) ; les lignes de note sont ignorées."""
    lignes = {}
    for r in ws.iter_rows(min_row=5, values_only=True):
        brut = _t(r[0])
        if brut.isdigit() and len(brut) <= 13:
            lignes[brut.zfill(13)] = r
    return lignes


def _ecrire_valeurs(ligne, r, colonnes):
    for j, n in colonnes:
        v = _valeur(r[j] if j < len(r) else None)
        ligne[n] = "" if v == "" else (v if isinstance(v, str) else repr(v) if isinstance(v, float) else str(v))


def lire_douars(chemin, communes_hcp):
    """Renvoie (lignes, écartés) : lignes = dicts selon ENTETE ; communes_hcp = codes des communes du RGPH."""
    par_fin = {}
    for c in communes_hcp:
        par_fin.setdefault(c[-7:], []).append(c)
    classeur = openpyxl.load_workbook(chemin, read_only=True, data_only=True)
    population, menages = _feuille(classeur.worksheets[0]), _feuille(classeur.worksheets[1])
    if set(population) != set(menages):
        sys.exit(f"Feuilles des douars non appariées : {len(set(population) ^ set(menages))} codes dans une seule feuille.")
    lignes, ecartes = [], []
    for code, r in sorted(population.items()):
        m = menages[code]
        if [_t(x) for x in r[1:10]] != [_t(x) for x in m[1:10]]:
            sys.exit(f"Douar {code} : lieux, type, ménages ou population différents d'une feuille à l'autre.")
        communes = par_fin.get(code[:7], [])
        if len(communes) != 1:
            ecartes.append(code)
            continue
        ligne = {"code": code, "commune": communes[0], "fraction": _t(r[5]), "nom": _t(r[6]), "type": TYPES.get(_t(r[7]), "")}
        _ecrire_valeurs(ligne, r, COLONNES + COMPLEMENTS_POPULATION)
        _ecrire_valeurs(ligne, m, COMPLEMENTS_MENAGES)
        lignes.append(ligne)
    lignes.sort(key=lambda l: l["code"])
    return lignes, ecartes


def ecrire_douars(chemin, lignes):
    """TSV (aucune tabulation dans les noms) : octets écrits, pour l'empreinte de la fiche."""
    texte = "\t".join(ENTETE) + "\n" + "".join("\t".join(str(l[k]).replace("\t", " ") for k in ENTETE) + "\n" for l in lignes)
    octets = texte.encode("utf-8")
    with open(chemin, "wb") as f:
        f.write(octets)
    return octets


def annexer(sortie, chemin_excel, communes_hcp):
    """Écrit l'annexe des douars et l'original archivé, et les déclare dans la fiche des communes."""
    lignes_d, ecartes = lire_douars(chemin_excel, communes_hcp)
    if ecartes:
        sys.exit(f"{len(ecartes)} douars sans commune unique du RGPH (ex. {ecartes[:3]}) : vérifier la lecture des codes.")
    octets_d = ecrire_douars(os.path.join(sortie, "donnees", "hcp-rgph2024-douars.tsv"), lignes_d)
    shutil.copyfile(chemin_excel, os.path.join(sortie, ORIGINE))
    empreinte_source = hashlib.sha256(open(chemin_excel, "rb").read()).hexdigest()
    chemin_fiche = os.path.join(sortie, "hcp-rgph2024-population-communes.json")
    with open(chemin_fiche, encoding="utf-8") as f:
        fc = json.load(f)
    communes = len({l["commune"] for l in lignes_d})
    fc["version"].setdefault("annexes", {})["douars"] = {
        "fichier": "donnees/hcp-rgph2024-douars.tsv", "empreinte": hashlib.sha256(octets_d).hexdigest(),
        "description": f"{len(lignes_d)} douars de {communes} communes rurales : code, fraction et nom (publiés en arabe seulement, "
                       "D-GD-21), type (groupé, éclaté, dispersé), ménages, population, sexe et grands groupes d'âge (%) ; compléments (D-GD-42) : "
                       "nationalité, inscription à l'état civil, population de 15 ans et plus et son état matrimonial (%), type de logement des "
                       "ménages (%), distances moyennes des logements à la route goudronnée, à la route carrossable, à l'école primaire, au collège, "
                       "au lycée et au centre de santé / hôpital (km) ; les deux feuilles sont jointes par le code (colonnes répétées identiques, "
                       "reprises une fois) ; « X » = donnée supprimée par le HCP (secret statistique). Source : « Population et ménages par "
                       f"douars, RGPH 2024 » (HCP, octobre 2025, SHA-256 {empreinte_source}), archivée telle quelle ({ORIGINE}).",
        "origine": {"fichier": ORIGINE, "empreinte": empreinte_source},
    }
    with open(chemin_fiche, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"douars : {len(lignes_d)} douars rattachés à {communes} communes rurales")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--douars", required=True, help="Population et ménages par douars, RGPH 2024 (HCP, octobre 2025)")
    ap.add_argument("--sortie", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "geodata", "sources"))
    a = ap.parse_args()
    # Communes du RGPH : celles de la couche, plus celles déjà rattachées dans l'annexe livrée (les communes du HCP sans
    # contour n'ont pas de ligne dans la couche, mais leurs douars restent rangés sous leur code, D-GD-33).
    codes = set()
    with open(os.path.join(a.sortie, "donnees", "hcp-rgph2024-population-communes.csv"), encoding="utf-8") as f:
        codes.update(r["code"] for r in csv.DictReader(f))
    annexe = os.path.join(a.sortie, "donnees", "hcp-rgph2024-douars.tsv")
    if os.path.exists(annexe):
        with open(annexe, encoding="utf-8") as f:
            codes.update(r["commune"] for r in csv.DictReader(f, delimiter="\t"))
    annexer(a.sortie, a.douars, sorted(codes))
