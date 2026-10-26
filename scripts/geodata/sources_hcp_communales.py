"""
Indicateurs communaux complémentaires du HCP (D-GD-20), lus tels que publiés et rangés comme ceux du lot A2 (thème,
famille, modalité, milieu, sexe). Module de `preparer_hcp.py`. Trois fichiers Excel du HCP (CC BY 4.0) :

  - « Indicateurs communaux du parc logement urbain au Maroc en 2024 » : logement URBAIN par région, province et
    commune ; « _ » = pas de logement urbain (sans objet) ;
  - « Indicateurs communaux : mode de transport domicile – lieu de travail des actifs occupés » (RGPH 2024) : feuilles
    Ensemble / Urbain / Rural, blocs de sexe ; cellule vide = non publiée ;
  - « Cartographie des Établissements Économiques (CEE 2023/2024) — principaux résultats par commune » : code en colonnes
    (région, province, cercle, commune) recomposé en code du RGPH (« 01.511.01.03 » → « 15110103 ») et contrôlé : une
    ligne dont le code n'est pas une unité du RGPH est écartée (consignée). Les grandes communes n'y ont que leurs
    arrondissements : la commune reste « non publiée » (aucune somme calculée).

Chaque lecteur renvoie (déclarations, valeurs {code HCP : {colonne : nombre ou signe}}). Aucune valeur n'est convertie
ni recalculée ; un signe reste un signe, jamais zéro.
"""
import re

import openpyxl

SIGNE_VIDE = "vide"  # cellule vide d'une unité présente dans le fichier : « non publiée »


def _t(x):
    return " ".join(str(x).replace("\xa0", " ").split()) if x is not None else None


def _nombre(x):
    if isinstance(x, (int, float)):
        return x
    if isinstance(x, str) and re.fullmatch(r"-?\d+(\.\d+)?", x.strip()):
        v = float(x.strip())
        return int(v) if v.is_integer() and "." not in x else v
    return None


def _cellule(x, signes):
    n = _nombre(x)
    if n is not None:
        return n
    s = _t(x)
    if s in signes:
        return s
    return SIGNE_VIDE


def _declaration(ident, theme, famille, modalite, unite, milieu, sexe, periode, description):
    titre = famille + (f" — {modalite}" if modalite else "") + {"masculin": " — Masculin", "feminin": " — Féminin"}.get(sexe, "") + {"urbain": " — Urbain", "rural": " — Rural"}.get(milieu, "")
    return {"propriete": ident, "titre": titre, "unite": unite, "periode": periode, "denominateur": None, "description": description,
            "motifSiAbsente": "non-appariee", "theme": theme, "famille": famille, "modalite": modalite, "milieu": milieu, "sexe": sexe}


def _remplir(ligne, j, groupe_debut):
    """Valeur d'en-tête de la colonne j, reprise de la gauche dans le groupe (cellules fusionnées ; « 2 », « 3 » = suite)."""
    for k in range(j, groupe_debut - 1, -1):
        v = _t(ligne[k]) if k < len(ligne) else None
        if v and not re.fullmatch(r"\d", v):
            return v
    return None


def lire_logement(chemin):
    ws = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    lignes = list(ws.iter_rows(values_only=True))
    h1, h2, h3, h4 = lignes[1], lignes[2], lignes[3], lignes[4]
    declarations, colonnes, debut = [], [], 2
    for j in range(2, len(h1)):
        if _t(h1[j]):
            debut = j
        famille_brute = _remplir(h1, j, 2)
        if not famille_brute:
            continue
        sous = [x for x in (_remplir(h2, j, debut), _remplir(h3, j, debut), _t(h4[j]) if j < len(h4) else None) if x]
        modalite = " — ".join(dict.fromkeys(sous)) or None
        pourcent = "%" in famille_brute
        famille = " ".join(famille_brute.replace("%", "").replace("()", "").replace(" Type", "").split())
        famille = {"Age de logement": "Âge du logement", "Age du logement selon le type": "Âge du logement selon le type"}.get(famille, famille)
        # Seul le total est un effectif ; toutes les autres colonnes sont des pourcentages (sommes à 100 par groupe).
        unite = "logements" if famille.startswith("Total des logements") else "%"
        ident = f"log_{j:03d}"
        colonnes.append((j, ident))
        declarations.append(_declaration(ident, "Logement urbain", famille, modalite, unite, "urbain", "ensemble", "RGPH 2024",
                                         f"HCP, parc de logement urbain 2024 — {famille}{f' : {modalite}' if modalite else ''}."))
    valeurs = {}
    for r in lignes[5:]:
        if not r or r[0] is None:
            continue
        d = valeurs.setdefault(str(r[0]).strip(), {})
        for j, ident in colonnes:
            d[ident] = _cellule(r[j] if j < len(r) else None, {"_"})
    return declarations, valeurs


FEUILLES_TRANSPORT = [("Ensemble", "ensemble"), ("Urbain", "urbain"), ("Rural", "rural")]


def lire_transport(chemin):
    wb = openpyxl.load_workbook(chemin, read_only=True, data_only=True)
    declarations, valeurs = [], {}
    for nom, milieu in FEUILLES_TRANSPORT:
        lignes = list(wb[nom].iter_rows(values_only=True))
        debut = next(i for i, r in enumerate(lignes) if _t(r[1]) == "Ensemble du territoire national")
        entetes = lignes[:debut]
        sexe, colonnes = "ensemble", []
        for j in range(2, max(len(r) for r in entetes)):
            marque = next((_t(r[j]) for r in entetes if j < len(r) and _t(r[j]) and _t(r[j]).startswith("Sexe")), None)
            if marque:
                sexe = "masculin" if "Masculin" in marque else "feminin" if "Féminin" in marque else "ensemble"
            mode = _t(entetes[-1][j]) if j < len(entetes[-1]) else None
            # Colonne d'effectif : sans modalité, sous l'en-tête « Population sédentaire… » (hors titre de la feuille).
            pop = not mode and any(j < len(r) and (_t(r[j]) or "").startswith("Population sédentaire") for r in entetes[1:])
            if mode == "Total" or (not mode and not pop):
                continue  # total à 100 % ou colonne d'espacement
            if pop:
                famille, modalite, unite = "Actifs occupés sédentaires de 15 ans et plus", None, "personnes"
            else:
                famille, modalite, unite = "Mode de transport domicile – lieu de travail", mode, "%"
            ident = f"trp_{milieu[0]}_{sexe[0]}_{j:03d}"
            colonnes.append((j, ident))
            declarations.append(_declaration(ident, "Mobilité domicile – travail", famille, modalite, unite, milieu, sexe, "RGPH 2024",
                                             f"HCP, RGPH 2024 — {famille}{f' : {modalite}' if modalite else ''} ; sexe : {sexe} ; milieu : {milieu}."))
        for r in lignes[debut:]:
            if not r or r[0] is None:
                continue
            d = valeurs.setdefault(str(r[0]).strip(), {})
            for j, ident in colonnes:
                d[ident] = _cellule(r[j] if j < len(r) else None, set())
    return declarations, valeurs


def code_cee(region, province, cercle, commune):
    """Code du RGPH d'une ligne CEE : région sans zéro initial + province + cercle + commune ; None si incomplet."""
    if not region:
        return None
    r = str(int(region))
    if not province:
        return r
    if not cercle or not commune:
        return r + province if not cercle else None
    return r + province + cercle + commune


def lire_cee(chemin, unites_hcp):
    ws = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    lignes = list(ws.iter_rows(values_only=True))
    h1, h2 = lignes[5], lignes[6]
    declarations, colonnes, famille = [], [], None
    for j in range(7, len(h1)):
        if _t(h1[j]):
            famille = _t(h1[j]).replace("hebodomadaires", "hebdomadaires")
        modalite = _t(h2[j]) if j < len(h2) else None
        if not famille:
            continue
        f = famille
        if modalite in ("Nombre d'établissements", "Emplois permanents occupés par ces établissements"):
            f, modalite = (modalite if modalite.startswith("Emplois") else famille), None
        unite = "emplois" if f.startswith("Emplois") else "souks" if "Souks" in f else "établissements"
        ident = f"cee_{j:03d}"
        colonnes.append((j, ident))
        declarations.append(_declaration(ident, "Établissements économiques", f, modalite, unite, "ensemble", "ensemble", "CEE 2023/2024",
                                         f"HCP, Cartographie des établissements économiques 2023/2024 — {f}{f' : {modalite}' if modalite else ''}."))
    valeurs, ecartees = {}, []
    for r in lignes[7:]:
        if not r or not _t(r[6]):
            continue
        code = code_cee(*(_t(x) for x in r[:3]), _t(r[4]))
        if code is None or code not in unites_hcp:
            ecartees.append((code, _t(r[6])))
            continue
        d = valeurs.setdefault(code, {})
        for j, ident in colonnes:
            d[ident] = _cellule(r[j] if j < len(r) else None, set())
    return declarations, valeurs, ecartees
