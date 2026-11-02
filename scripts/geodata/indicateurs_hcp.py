"""
Lecture du fichier « Indicateurs démographiques et socio-économiques du Royaume du Maroc selon les résultats du RGPH
2024 » du HCP (https://www.hcp.ma/file/242671/, CC BY 4.0) — D-GD-17, lot A2. Module de `preparer_hcp.py`.

Structure lue telle que publiée :
  - feuilles « Population » / « Population_Urbaine » / « Population_Rurale » : ligne 1 = blocs de sexe (« Sexe :
    Ensemble / Masculin / Féminin », par plage de colonnes), ligne 2 = familles d'indicateurs (cellules fusionnées),
    ligne 3 = modalités (« 0-4 ans », « Célibataire »… ; vide = indicateur sans modalité) ;
  - feuilles « Ménages » / « Ménages_Urbains » / « Ménages_Ruraux » : ligne 1 = familles, ligne 2 = modalités ;
  - colonne A = code géographique HCP, colonne B = collectivité ; signes conventionnels « … » (n'ayant pas lieu de
    figurer) et « . » (indisponible) gardés tels quels (motif à l'import), jamais convertis en zéro.
Une colonne dont la famille, la modalité et le sexe répètent une colonne précédente de la même feuille (par exemple
« Population de 15 ans et plus », reprise devant chaque thème) n'est lue qu'une fois.
"""
import re

import openpyxl

FEUILLES = [
    ("Population", "pop", "ensemble"), ("Population_Urbaine", "pop", "urbain"), ("Population_Rurale", "pop", "rural"),
    ("Ménages", "men", "ensemble"), ("Ménages_Urbains", "men", "urbain"), ("Ménages_Ruraux", "men", "rural"),
]
SIGNES = {"…": "sans-objet", ".": "non-publiee"}

THEMES = [
    ("Démographie", ["Population légale", "Population municipale", "Sexe (%)", "Âge quinquennal (%)", "Population de 15 ans et plus",
                     "État matrimonial", "Âge moyen singulier au mariage", "Indicateur conjoncturel de fécondité", "Descendance finale des femmes"]),
    ("Santé", ["Taux de prévalence du handicap"]),
    ("Éducation et analphabétisme", ["Population de 7-12 ans", "Taux de scolarisation", "Population de 10 ans et plus", "Taux d'analphabétisme",
                                     "Population alphabète", "Langues lues et écrites", "Niveau d'études"]),
    ("Langues", ["Langues locales utilisées"]),
    ("Activité économique", ["Population active", "Population inactive", "Taux d'activité", "Taux de chômage", "Statut professionnel"]),
]


def theme_de(famille, feuille):
    if feuille == "men":
        return "Conditions d'habitat"
    for theme, prefixes in THEMES:
        if any(famille.startswith(p) for p in prefixes):
            return theme
    return "Autres indicateurs"


def unite_de(famille):
    f = famille.lower()
    if "(%)" in famille:
        return "%"
    if "(km)" in f:
        return "km"
    if f.startswith("âge moyen"):
        return "ans"
    if f.startswith("indicateur conjoncturel") or f.startswith("descendance finale"):
        return "enfants par femme"
    if f.startswith("taille moyenne"):
        return "personnes par ménage"
    if f.startswith("nombre moyen de personnes par pièce"):
        return "personnes par pièce"
    if f.startswith("ménages"):
        return "ménages"
    return "personnes"


def _texte(x):
    return " ".join(str(x).replace("\xa0", " ").split()) if x is not None else None


CODE_NATIONAL = "MA"
LIBELLE_NATIONAL = "Ensemble du territoire national"


def lire_indicateurs(chemin, national=False):
    """Renvoie (indicateurs, valeurs) : liste ordonnée de déclarations, et {code HCP: {colonne: valeur ou signe}}.

    `national` : la ligne « Ensemble du territoire national » (sans code HCP) est lue sous le code `MA` (D-GD-37) ;
    sinon elle est ignorée comme avant."""
    wb = openpyxl.load_workbook(chemin, read_only=True, data_only=True)
    declarations, valeurs, vus = [], {}, set()
    for nom_feuille, sorte, milieu in FEUILLES:
        ws = wb[nom_feuille]
        lignes = list(ws.iter_rows(values_only=True))
        if sorte == "pop":
            l_sexe, l_fam, l_mod, debut = lignes[0], lignes[1], lignes[2], 3
        else:
            l_sexe, l_fam, l_mod, debut = None, lignes[0], lignes[1], 2
        famille, sexe, colonnes = None, "ensemble", []
        deja = set()
        for j in range(2, len(l_fam)):
            if l_sexe is not None and l_sexe[j]:
                s = _texte(l_sexe[j]).lower()
                nouveau = "masculin" if "masculin" in s else "feminin" if "féminin" in s else "ensemble"
                if nouveau != sexe:
                    deja = set()  # le marqueur se répète dans un même bloc : on ne repart à zéro qu'au changement de sexe
                sexe = nouveau
            if l_fam[j]:
                famille = _texte(l_fam[j])
                modalite = _texte(l_mod[j]) if sorte == "pop" else None
                if sorte == "men":
                    # Ménages : la modalité est en ligne 2 seulement quand la famille couvre plusieurs colonnes.
                    suivante = l_fam[j + 1] if j + 1 < len(l_fam) else "x"
                    modalite = _texte(l_mod[j]) if suivante is None else None
            else:
                modalite = _texte(l_mod[j])
            if famille is None or (modalite is None and not l_fam[j]):
                continue  # colonne d'espacement
            if sorte == "men" and famille.startswith("Population municipale"):
                continue  # reprise de la feuille Population
            cle = (famille, modalite, sexe)
            if cle in deja:
                continue
            deja.add(cle)
            ident = f"{sorte}_{milieu[0]}_{sexe[0]}_{j:03d}"
            if ident in vus:
                continue
            vus.add(ident)
            colonnes.append((j, ident))
            # Titre : la famille sans son unité entre parenthèses (« Sexe (%) » → « Sexe »), l'unité étant affichée à part.
            titre = " ".join(re.sub(r"\((%|km)\)", "", famille, flags=re.I).split()) + (f" — {modalite}" if modalite else "") + ({"masculin": " — Masculin", "feminin": " — Féminin"}.get(sexe, "")) + ({"urbain": " — Urbain", "rural": " — Rural"}.get(milieu, ""))
            declarations.append({
                "propriete": ident, "titre": titre, "unite": unite_de(famille), "periode": "RGPH 2024", "denominateur": None,
                "description": f"HCP, RGPH 2024 — {famille}{f' : {modalite}' if modalite else ''} ; sexe : {sexe} ; milieu : {milieu}.",
                "motifSiAbsente": "non-appariee", "theme": theme_de(famille, sorte), "famille": famille, "modalite": modalite,
                "milieu": milieu, "sexe": sexe,
            })
        for r in lignes[debut:]:
            if not r:
                continue
            if r[0] is None:
                if not (national and len(r) > 1 and _texte(r[1]) == LIBELLE_NATIONAL):
                    continue
                code = CODE_NATIONAL
            else:
                code = str(r[0]).strip()
            d = valeurs.setdefault(code, {})
            for j, ident in colonnes:
                v = r[j] if j < len(r) else None
                if isinstance(v, (int, float)):
                    d[ident] = v
                elif isinstance(v, str) and v.strip() in SIGNES:
                    d[ident] = v.strip()
    # Ordre d'affichage : thème, puis ordre du fichier.
    ordre_themes = [t for t, _ in THEMES] + ["Conditions d'habitat", "Autres indicateurs"]
    declarations.sort(key=lambda d: ordre_themes.index(d["theme"]))
    for i, d in enumerate(declarations):
        d["ordre"] = i
    return declarations, valeurs
