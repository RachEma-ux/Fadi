"""
Base des douars du RGPH 2024 du HCP (« Population et ménages par douars », octobre 2025, CC BY 4.0) — D-GD-20, D-GD-21,
lot E. Module de `preparer_hcp.py`.

Le douar n'a pas de contour : la base n'est pas une couche, elle est livrée en annexe de la fiche des communes
(`donnees/hcp-rgph2024-douars.tsv`) et affichée dans la fiche de la commune rurale. Le code du douar (13 chiffres, zéros
initiaux parfois perdus dans le fichier) se lit : province (3) + cercle (2) + commune (2) + fraction (3) + douar (3) ; la
commune du RGPH est celle dont le code finit par province + cercle + commune (unique, sinon le douar est écarté et
compté). Les noms ne sont publiés qu'en arabe : ils sont gardés tels quels (D-GD-21). « X » = donnée supprimée par le
HCP (moins de 30 ménages ou faible taux de déclaration) : secret statistique, jamais zéro.
"""
import openpyxl

TYPES = {"دوار مجمع": "groupé", "دوار مجزأ": "éclaté", "دوار مشتت": "dispersé"}
# Colonnes gardées (feuille « caractéristiques de la population ») : indice → nom de colonne.
COLONNES = [(8, "menages"), (9, "population"), (12, "masculin"), (13, "feminin"), (14, "moins_15"), (15, "de_15_a_59"), (16, "plus_60")]
ENTETE = ["code", "commune", "fraction", "nom", "type"] + [n for _, n in COLONNES]


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


def lire_douars(chemin, communes_hcp):
    """Renvoie (lignes, écartés) : lignes = dicts selon ENTETE ; communes_hcp = codes des communes du RGPH."""
    par_fin = {}
    for c in communes_hcp:
        par_fin.setdefault(c[-7:], []).append(c)
    ws = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    lignes, ecartes = [], []
    for r in ws.iter_rows(min_row=5, values_only=True):
        brut = _t(r[0])
        if not brut.isdigit() or len(brut) > 13:
            continue  # ligne de note (« Donnée supprimée… »)
        code = brut.zfill(13)
        communes = par_fin.get(code[:7], [])
        if len(communes) != 1:
            ecartes.append(code)
            continue
        ligne = {"code": code, "commune": communes[0], "fraction": _t(r[5]), "nom": _t(r[6]), "type": TYPES.get(_t(r[7]), "")}
        for j, n in COLONNES:
            v = _valeur(r[j] if j < len(r) else None)
            ligne[n] = "" if v == "" else (v if isinstance(v, str) else repr(v) if isinstance(v, float) else str(v))
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
