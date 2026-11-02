#!/usr/bin/env python3
"""
Découpage administratif du Maroc lu dans le fichier du HCP (D-GD-42) — script d'import hors application :

    python3 scripts/geodata/decoupage_hcp.py --excel <population-legale.xlsx> [--indicateurs <indicateurs.xlsx>]
                                             [--sortie docs/geodata/sources] [--rapport docs/workstreams/geodata/INVENTAIRE-DECOUPAGE.md]

Source : « Population légale du Royaume du Maroc répartie par régions, provinces et préfectures et communes selon les
résultats du RGPH 2024 » (https://www.hcp.ma/file/242341/, CC BY 4.0). Le fichier est livré tel quel
(`decoupage/originaux/hcp-rgph2024-population-legale.xlsx`, archivé en base comme tous les fichiers livrés).

Rien n'est écrit de mémoire : **les niveaux** viennent de la table de données `decoupage/<pays>-niveaux.csv` (code, rang
du plus global au plus fin, noms, libellés du fichier source, fiche de la couche) ; **les entités et leurs parents**
viennent du fichier HCP lui-même :
  - une ligne est une entité d'un niveau si son libellé commence par un libellé source de ce niveau (le plus long qui
    convient : « Préfecture d'arrondissements de … » est une préfecture d'arrondissements, pas une préfecture) ;
    les autres lignes (cercles, « dont le centre urbain », lignes « (milieu urbain / rural) », totaux) ne sont pas des
    entités et sont comptées dans le rapport ;
  - le parent d'une entité est la dernière entité d'un rang plus global qui la précède dans le fichier (le fichier est
    rangé par emboîtement : région, province, commune, préfecture d'arrondissements, arrondissement) ; une même entité
    répétée dans les tableaux de synthèse doit avoir le même parent, sinon le script s'arrête ;
  - type : le libellé source trouvé (« Province », « Préfecture », « Arrondissement »…) ; pour une commune, « Commune
    rattachée à un cercle » si un cercle du fichier préfixe son code, sinon « Commune hors cercle ». Le statut urbain ou
    rural n'est pas publié comme tel par ce fichier : il n'est pas déduit (« non évalué ») ; le rapport confronte seulement
    le rattachement à un cercle à la population rurale « … » (sans objet) du fichier d'indicateurs quand il est donné.

Sorties : `decoupage/<cle>-entites.csv` (pays, code, niveau, parent, nom, nom_ar, type, population, menages — population
et ménages servent aux contrôles), la déclaration `decoupage/<pays>.json` (source, empreintes, fichiers) et le rapport
d'inventaire (entités ajoutées, modifiées, retirées par rapport à la livraison précédente, entités sans parent, communes
à arrondissements, contrôles de population). Relancé sur le même fichier, le script réécrit les mêmes octets ; relancé sur
une nouvelle version, le rapport liste les différences. La base est chargée par l'API au démarrage (chargeur
`apps/api/src/lib/geodata/decoupage.ts`, upsert sans doublon). Avec `--indicateurs`, crée la fiche et le tableau de
valeurs des niveaux dont la fiche n'existe pas encore (indicateurs RGPH 2024 du HCP au niveau le plus fin publié).
Dépendance : `pip install openpyxl`.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
from datetime import date

import openpyxl

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FICHES = os.path.join(RACINE, "docs", "geodata", "sources")
RAPPORT = os.path.join(RACINE, "docs", "workstreams", "geodata", "INVENTAIRE-DECOUPAGE.md")
URL_HCP = "https://www.hcp.ma/file/242341/"
ORIGINAL = "decoupage/originaux/hcp-rgph2024-population-legale.xlsx"
CLE = "hcp-rgph2024"
DECISION = "D-GD-42"
COLONNES = ["pays", "code", "niveau", "parent", "nom", "nom_ar", "type", "population", "menages"]


def lire_niveaux(chemin):
    with open(chemin, encoding="utf-8", newline="") as f:
        niveaux = list(csv.DictReader(f))
    for n in niveaux:
        n["rang"] = int(n["rang"])
        n["libelles"] = [x.strip() for x in n["libelles_source"].split("|") if x.strip()]
    rangs = [n["rang"] for n in niveaux]
    if len(set(rangs)) != len(rangs) or len({n["code"] for n in niveaux}) != len(niveaux):
        sys.exit(f"{chemin} : rangs ou codes de niveau en double")
    return sorted(niveaux, key=lambda n: n["rang"])


def niveau_de(libelle, niveaux):
    """Niveau dont un libellé source commence le libellé de la ligne (le plus long gagne), et ce libellé ; sinon None."""
    meilleur = None
    for n in niveaux:
        for l in n["libelles"]:
            if re.match(re.escape(l) + r"(\s|$|')", libelle) and (not meilleur or len(l) > len(meilleur[1])):
                meilleur = (n, l)
    return meilleur


def lire_fichier(chemin, niveaux, pays):
    feuille = openpyxl.load_workbook(chemin, read_only=True, data_only=True).worksheets[0]
    entites, hors, pile, cercles = {}, {}, [], set()
    for r in feuille.iter_rows(min_row=8, values_only=True):
        nom, maroc, etr, pop, men, ar, code = (tuple(r) + (None,) * 7)[:7]
        if not nom:
            continue
        nom = str(nom).strip()
        code = str(code).strip() if code is not None else ""
        if re.search(r"\(milieu (urbain|rural)\)", nom) or not code:
            cle = "ligne par milieu (urbain / rural)" if code else "total ou ligne sans code"
            hors[cle] = hors.get(cle, 0) + 1
            continue
        trouve = niveau_de(nom, niveaux)
        if not trouve:
            cle = "dont le centre urbain" if nom.startswith("dont le centre urbain") else nom.split()[0]
            hors[cle] = hors.get(cle, 0) + 1
            if cle == "Cercle":
                cercles.add(code)
            continue
        n, libelle = trouve
        while pile and pile[-1][0] >= n["rang"]:
            pile.pop()
        parent = pile[-1][1] if pile else ""
        pile.append((n["rang"], code))
        e = {"pays": pays, "code": code, "niveau": n["code"], "parent": parent, "nom": nom, "nom_ar": (ar or "").strip(),
             "type": libelle, "population": int(pop), "menages": int(men), "marocains": int(maroc), "etrangers": int(etr)}
        deja = entites.get(code)
        if deja:
            if (deja["niveau"], deja["parent"], deja["nom"], deja["population"]) != (e["niveau"], e["parent"], e["nom"], e["population"]):
                sys.exit(f"Code {code} lu deux fois avec des valeurs différentes : {deja} / {e}")
            continue
        entites[code] = e
    for e in entites.values():
        if e["type"] == "Commune":
            e["type"] = "Commune rattachée à un cercle" if any(e["code"].startswith(c) for c in cercles) else "Commune hors cercle"
    return entites, hors, cercles


def octets_csv(entites):
    tampon = io.StringIO()
    w = csv.DictWriter(tampon, fieldnames=COLONNES, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    for e in sorted(entites.values(), key=lambda e: e["code"]):
        w.writerow(e)
    return tampon.getvalue().encode("utf-8")


def lire_precedent(chemin):
    if not os.path.exists(chemin):
        return {}
    with open(chemin, encoding="utf-8", newline="") as f:
        return {l["code"]: l for l in csv.DictReader(f)}


def comparer(avant, apres):
    ajoutees = sorted(c for c in apres if c not in avant)
    retirees = sorted(c for c in avant if c not in apres)
    modifiees = []
    for c in sorted(set(avant) & set(apres)):
        champs = [k for k in COLONNES if str(avant[c].get(k, "")) != str(apres[c][k])]
        if champs:
            modifiees.append((c, champs))
    return ajoutees, modifiees, retirees


def controles(entites, niveaux):
    rang = {n["code"]: n["rang"] for n in niveaux}
    plus_global = min(rang.values())
    sans_parent = [e for e in entites.values() if not e["parent"] and rang[e["niveau"]] != plus_global]
    parent_inconnu = [e for e in entites.values() if e["parent"] and e["parent"] not in entites]
    rang_incoherent = [e for e in entites.values() if e["parent"] in entites and rang[entites[e["parent"]]["niveau"]] >= rang[e["niveau"]]]
    enfants = {}
    for e in entites.values():
        if e["parent"]:
            enfants.setdefault(e["parent"], []).append(e)
    ecarts = []
    for p, es in enfants.items():
        s = sum(x["population"] for x in es)
        if s != entites[p]["population"]:
            ecarts.append((p, entites[p]["population"], s))
    return {"sans_parent": sans_parent, "parent_inconnu": parent_inconnu, "rang_incoherent": rang_incoherent, "ecarts_population": ecarts, "enfants": enfants}


def chaine(e, entites):
    out = [e]
    while out[-1]["parent"] and out[-1]["parent"] in entites:
        out.append(entites[out[-1]["parent"]])
    return out


def ecrire_rapport(chemin, entites, niveaux, hors, comp, ctl, empreinte, controle_milieu):
    rang = {n["code"]: n["rang"] for n in niveaux}
    plus_fin = max(rang.values())
    par_niveau = {n["code"]: [e for e in entites.values() if e["niveau"] == n["code"]] for n in niveaux}
    noms = {n["code"]: n for n in niveaux}
    feuilles = [e for e in entites.values() if e["code"] not in ctl["enfants"]]
    profondeurs = {}
    for e in feuilles:
        profondeurs.setdefault(len(chaine(e, entites)), []).append(e)
    # Communes à arrondissements : communes dont un descendant est au niveau le plus fin.
    a_arr = sorted({x["code"] for e in par_niveau[[n["code"] for n in niveaux if n["rang"] == plus_fin][0]] for x in chaine(e, entites) if x["niveau"] == "commune"})
    L = [f"# Inventaire du découpage administratif du Maroc ({DECISION})\n",
         f"Généré par `scripts/geodata/decoupage_hcp.py` le {date.today().isoformat()} ; relancer le script régénère ce rapport.\n",
         "## Source\n",
         f"- Fichier HCP « Population légale du Royaume du Maroc … selon les résultats du RGPH 2024 » ({URL_HCP}), SHA-256 `{empreinte}`, "
         f"livré tel quel : `{ORIGINAL}`.",
         "- Niveaux : table de données `decoupage/ma-niveaux.csv` (aucun niveau dans le code) ; entités et parents : lus dans le fichier "
         "(libellé de la ligne, emboîtement des lignes). Données : `decoupage/hcp-rgph2024-entites.csv`.\n",
         "## Comptes par niveau (du plus global au plus fin)\n",
         "| Rang | Niveau | Entités | Types |", "| --- | --- | --- | --- |"]
    for n in niveaux:
        es = par_niveau[n["code"]]
        types = {}
        for e in es:
            types[e["type"]] = types.get(e["type"], 0) + 1
        L.append(f"| {n['rang']} | {n['pluriel']} | {len(es)} | " + ", ".join(f"{t} : {k}" for t, k in sorted(types.items())) + " |")
    L.append(f"\nTotal : {len(entites)} entités. Lignes du fichier qui ne sont pas des entités d'un niveau : "
             + ", ".join(f"{k} ({v})" for k, v in sorted(hors.items())) + ".\n")
    L.append("## Profondeur de la hiérarchie (lue par les liens parent → enfant)\n")
    for p, es in sorted(profondeurs.items()):
        chemins = {}
        for e in es:
            k = " → ".join(noms[x["niveau"]]["singulier"].lower() for x in chaine(e, entites))
            chemins[k] = chemins.get(k, 0) + 1
        for k, v in sorted(chemins.items()):
            L.append(f"- {p} niveaux : {k} — {v} entité(s) élémentaire(s)")
    L.append("")
    L.append(f"## Communes à arrondissements ({len(a_arr)})\n")
    for c in a_arr:
        e = entites[c]
        L.append(f"- **{e['nom']}** ({c}, {e['population']} hab.) — {' › '.join(x['nom'] for x in reversed(chaine(e, entites)[1:]))}")
        for enf in sorted(ctl["enfants"].get(c, []), key=lambda x: x["code"]):
            if enf["niveau"] == "arrondissement":
                L.append(f"  - {enf['nom']} ({enf['code']}, {enf['population']} hab.)")
            else:
                arr = sorted(ctl["enfants"].get(enf["code"], []), key=lambda x: x["code"])
                L.append(f"  - {enf['nom']} ({enf['code']}, {enf['population']} hab.) : " + ", ".join(f"{a['nom']} ({a['code']}, {a['population']})" for a in arr))
        s = sum(x["population"] for x in entites.values() if x["niveau"] == "arrondissement" and c in [y["code"] for y in chaine(x, entites)])
        L.append(f"  - somme des arrondissements : {s} ; population de la commune : {e['population']} — {'égales' if s == e['population'] else 'ÉCART'}")
    L.append("")
    L.append("## Contrôles\n")
    L.append(f"- Entités sans parent hors du niveau le plus global : {len(ctl['sans_parent'])}" + "".join(f"\n  - {e['code']} {e['nom']}" for e in ctl["sans_parent"]))
    L.append(f"- Parents absents du fichier : {len(ctl['parent_inconnu'])} ; parent d'un rang qui n'est pas plus global : {len(ctl['rang_incoherent'])}.")
    L.append(f"- Somme des populations des enfants = population du parent, pour chaque entité qui a des enfants : {len(ctl['enfants']) - len(ctl['ecarts_population'])} / {len(ctl['enfants'])}"
             + "".join(f"\n  - ÉCART {p} : {a} contre {b}" for p, a, b in ctl["ecarts_population"]))
    if controle_milieu is not None:
        L.append(f"- Rattachement des communes à un cercle confronté à leur population rurale (« … » = entièrement urbaine) dans le fichier d'indicateurs ; "
                 "le statut urbain / rural n'est pas déduit (non évalué) : "
                 f"{controle_milieu['accord']} accord(s), {len(controle_milieu['desaccords'])} désaccord(s)" + "".join(f"\n  - {c}" for c in controle_milieu["desaccords"]))
    ajoutees, modifiees, retirees = comp
    L.append("\n## Différences avec la livraison précédente\n")
    L.append(f"- Ajoutées : {len(ajoutees)} ; modifiées : {len(modifiees)} ; retirées : {len(retirees)}.")
    for titre, liste in (("Ajoutées", ajoutees), ("Retirées", retirees)):
        if liste and len(liste) <= 200:
            L.append(f"- {titre} : " + ", ".join(liste))
    for c, champs in modifiees[:200]:
        L.append(f"  - {c} : {', '.join(champs)}")
    L.append("")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def controler_milieu(entites, indicateurs):
    """Commune urbaine ⇔ population légale rurale « … » (sans objet) dans le fichier d'indicateurs."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from indicateurs_hcp import lire_indicateurs  # noqa: E402
    declarations, valeurs = lire_indicateurs(indicateurs)
    rural = next(d["propriete"] for d in declarations if d["famille"] == "Population légale" and d["milieu"] == "rural" and d["sexe"] == "ensemble")
    accord, desaccords = 0, []
    for e in entites.values():
        if not e["type"].startswith("Commune "):
            continue
        v = valeurs.get(e["code"], {}).get(rural)
        if v is None:
            continue
        urbaine_ind = v == "…"
        if urbaine_ind == (e["type"] == "Commune hors cercle"):
            accord += 1
        else:
            desaccords.append(f"{e['code']} {e['nom']} : {e['type']}, population rurale {v} (commune hors cercle qui compte une population rurale)")
    return {"accord": accord, "desaccords": desaccords}, declarations, valeurs


def creer_fiches_manquantes(sortie, niveaux, entites, declarations, valeurs, empreintes):
    """Fiche et tableau des niveaux sans fiche : modèle = fiche d'un niveau voisin (mêmes indicateurs déclarés, mêmes
    droits) ; valeurs lues dans le fichier d'indicateurs pour les codes du niveau (celles qui n'y sont pas restent vides,
    « non publiée », jamais zéro). La géométrie et son empreinte sont écrites par `construire_niveaux.py`."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from sources_hcp_communales import SIGNE_VIDE  # noqa: E402
    creees = []
    for n in niveaux:
        chemin = os.path.join(sortie, f"{n['fiche']}.json")
        if not n["fiche"] or os.path.exists(chemin):
            continue
        voisins = sorted((m for m in niveaux if m is not n and os.path.exists(os.path.join(sortie, f"{m['fiche']}.json"))), key=lambda m: abs(m["rang"] - n["rang"]))
        with open(os.path.join(sortie, f"{voisins[0]['fiche']}.json"), encoding="utf-8") as f:
            modele = json.load(f)
        codes = sorted(e["code"] for e in entites.values() if e["niveau"] == n["code"])
        colonnes = [d["propriete"] for d in modele["indicateurs"]]
        lignes = [",".join(["code"] + colonnes)]
        lus = {d["propriete"] for d in declarations}
        nat = {"pl_marocains": "marocains", "pl_etrangers": "etrangers"}
        for c in codes:
            v = valeurs.get(c, {})
            cel = []
            for p in colonnes:
                if p in lus:
                    x = v.get(p, SIGNE_VIDE)
                elif p in nat:
                    x = entites[c][nat[p]]
                else:
                    x = SIGNE_VIDE
                cel.append("" if x is None else (str(int(x)) if isinstance(x, float) and x.is_integer() else str(x)))
            lignes.append(",".join([c] + cel))
        tab = ("\n".join(lignes) + "\n").encode()
        with open(os.path.join(sortie, "donnees", f"{n['fiche']}.csv"), "wb") as f:
            f.write(tab)
        fi = json.loads(json.dumps(modele))
        fi["cle"] = n["fiche"]
        fi["titre"] = f"Limites administratives — {n['pluriel'].lower()} (RGPH 2024)"
        fi["couverture"] = f"Maroc — {n['pluriel'].lower()}"
        fi["description"] = (f"Population légale et indicateurs démographiques et socio-économiques des {n['pluriel'].lower()} selon le RGPH 2024 (HCP) ; "
                             f"{len(codes)} entités lues dans le fichier du HCP ({DECISION}). Contours construits par union de leurs enfants dans le découpage en base "
                             "(`construire_niveaux.py`). Signes du HCP : « … » et « _ » = sans objet, « . » = indisponible ; cellule vide = non publiée ; jamais zéro.")
        fi["couche"]["titre"] = f"RGPH 2024 — {n['pluriel'].lower()}"
        fi["couche"]["niveau"] = None
        fi["couche"]["proprietesExposees"] = ["code", "nom", "contour", "appariement"]
        fi["version"]["fichier"] = f"donnees/{n['fiche']}.geojson"
        fi["version"]["empreinte"] = "0" * 64
        fi["version"]["tableau"]["fichier"] = f"donnees/{n['fiche']}.csv"
        fi["version"]["tableau"]["empreinte"] = hashlib.sha256(tab).hexdigest()
        fi["version"].pop("annexes", None)
        fi["territoire"] = {"pays": entites[codes[0]]["pays"], "nomPays": modele.get("territoire", {}).get("nomPays", ""), "niveau": n["code"]}
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump(fi, f, ensure_ascii=False, indent=2)
            f.write("\n")
        creees.append(n["fiche"])
    return creees


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", default=os.path.join(FICHES, ORIGINAL), help="Population légale RGPH 2024 (https://www.hcp.ma/file/242341/)")
    ap.add_argument("--indicateurs", help="Indicateurs démographiques et socio-économiques RGPH 2024 (https://www.hcp.ma/file/242671/)")
    ap.add_argument("--pays", default="MA")
    ap.add_argument("--sortie", default=FICHES)
    ap.add_argument("--rapport", default=RAPPORT)
    a = ap.parse_args()
    with open(a.excel, "rb") as f:
        brut = f.read()
    empreinte = hashlib.sha256(brut).hexdigest()
    original = os.path.join(a.sortie, ORIGINAL)
    if os.path.abspath(a.excel) != os.path.abspath(original):
        os.makedirs(os.path.dirname(original), exist_ok=True)
        with open(original, "wb") as f:
            f.write(brut)
    niveaux = lire_niveaux(os.path.join(a.sortie, "decoupage", f"{a.pays.lower()}-niveaux.csv"))
    entites, hors, _ = lire_fichier(original, niveaux, a.pays)
    ctl = controles(entites, niveaux)
    if ctl["parent_inconnu"] or ctl["rang_incoherent"]:
        sys.exit(f"Hiérarchie incohérente : {len(ctl['parent_inconnu'])} parent(s) inconnu(s), {len(ctl['rang_incoherent'])} rang(s) incohérent(s)")
    chemin_csv = os.path.join(a.sortie, "decoupage", f"{CLE}-entites.csv")
    comp = comparer(lire_precedent(chemin_csv), {c: {k: str(e[k]) for k in COLONNES} for c, e in entites.items()})
    octets = octets_csv(entites)
    with open(chemin_csv, "wb") as f:
        f.write(octets)
    controle_milieu, creees = None, []
    if a.indicateurs:
        controle_milieu, declarations, valeurs = controler_milieu(entites, a.indicateurs)
        creees = creer_fiches_manquantes(a.sortie, niveaux, entites, declarations, valeurs, {})
    with open(os.path.join(a.sortie, "decoupage", f"{a.pays.lower()}-niveaux.csv"), "rb") as f:
        empreinte_niveaux = hashlib.sha256(f.read()).hexdigest()
    declaration = {
        "pays": a.pays,
        "nomPays": "Maroc" if a.pays == "MA" else a.pays,
        "source": "Haut-Commissariat au Plan (HCP), « Population légale du Royaume du Maroc répartie par régions, provinces et préfectures et communes "
                  "selon les résultats du RGPH 2024 »",
        "url": URL_HCP,
        "periode": "RGPH 2024 (septembre 2024)",
        "licence": "Creative Commons Attribution 4.0 (CC BY 4.0, CGU du HCP v1.0 § 3)",
        "decision": DECISION,
        "original": {"fichier": ORIGINAL, "empreinte": empreinte},
        "niveaux": {"fichier": f"decoupage/{a.pays.lower()}-niveaux.csv", "empreinte": empreinte_niveaux},
        "entites": {"fichier": f"decoupage/{CLE}-entites.csv", "empreinte": hashlib.sha256(octets).hexdigest()},
        "script": "scripts/geodata/decoupage_hcp.py",
    }
    with open(os.path.join(a.sortie, "decoupage", f"{a.pays.lower()}.json"), "w", encoding="utf-8") as f:
        json.dump(declaration, f, ensure_ascii=False, indent=2)
        f.write("\n")
    ecrire_rapport(a.rapport, entites, niveaux, hors, comp, ctl, empreinte, controle_milieu)
    par = {}
    for e in entites.values():
        par[e["niveau"]] = par.get(e["niveau"], 0) + 1
    print(f"{len(entites)} entités : " + ", ".join(f"{n['code']} {par.get(n['code'], 0)}" for n in niveaux))
    print(f"ajoutées {len(comp[0])}, modifiées {len(comp[1])}, retirées {len(comp[2])}, sans parent {len(ctl['sans_parent'])}, écarts de population {len(ctl['ecarts_population'])}")
    if creees:
        print("fiches créées : " + ", ".join(creees))
    print(f"rapport : {a.rapport}")


if __name__ == "__main__":
    main()
