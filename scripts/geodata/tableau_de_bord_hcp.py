"""
Définition du tableau de bord RGPH 2024 (D-GD-37) — module de `preparer_hcp_royaume.py`.

Ce n'est pas une donnée du HCP : c'est la **mise en page** des onglets « Chiffres clés 2024 » et « CEE 2024 » (quelle
famille d'indicateurs va dans quelle carte ou quel tableau), écrite ici, livrée en annexe de la fiche nationale et
chargée en base (`geodata_tableaux_bord`) : l'application n'en contient aucune copie (D-GD-29). Les familles, modalités,
milieux et sexes sont ceux du fichier « Indicateurs démographiques et socio-économiques » du HCP et de la CEE
2023/2024, tels qu'importés ; une série qui n'est pas en base (recensements 1960–2014) est déclarée indisponible avec
son motif, jamais remplie.
"""

RGPH = "HCP, RGPH 2024 (CC BY 4.0)"
CEE = "HCP, CEE 2024"
SERIE_ABSENTE = "Série des recensements 1960–2014 non chargée en base"
MILIEUX = [("urbain", "Urbain"), ("rural", "Rural"), ("ensemble", "Ensemble")]
ANNEES = ["1960", "1971", "1982", "1994", "2004", "2014"]


def ind(famille, modalite=None, milieu="ensemble", sexe="ensemble"):
    s = {"famille": famille, "milieu": milieu, "sexe": sexe}
    if modalite is not None:
        s["modalite"] = modalite
    return {"indicateur": s}


def somme(famille, modalites, milieu="ensemble", sexe="ensemble"):
    return {"somme": [{"famille": famille, "modalite": m, "milieu": milieu, "sexe": sexe} for m in modalites]}


def taux_urbanisation():
    return {"ratio": [ind("Population légale", milieu="urbain"), ind("Population légale")], "facteur": 100}


def par_milieu(famille, modalites, enTete):
    return {
        "type": "tableau", "enTeteLignes": enTete, "colonnes": [l for _, l in MILIEUX],
        "lignes": [{"libelle": m, "cellules": [ind(famille, m, milieu=k) for k, _ in MILIEUX]} for m in modalites],
    }


AGES = {
    "Moins de 15 ans": ["0-4 ans", "5-9 ans", "10-14 ans"],
    "15 à 59 ans": ["15-19 ans", "20-24 ans", "25-29 ans", "30-34 ans", "35-39 ans", "40-44 ans", "45-49 ans", "50-54 ans", "55-59 ans"],
    "60 ans et plus": ["60-64 ans", "65-69 ans", "70-74 ans", "75 ans ou plus"],
}


def definition(pays, code, nom):
    chiffres = [
        ("population-legale", "Population légale", ind("Population légale"), "personnes", 0, None),
        ("menages", "Nombre de ménages", ind("Ménages"), "ménages", 0, None),
        ("taux-urbanisation", "Taux d'urbanisation", taux_urbanisation(), "%", 1,
         "Calculé : population légale urbaine ÷ population légale × 100."),
        ("taux-analphabetisme", "Taux d'analphabétisme", ind("Taux d'analphabétisme des 10 ans et plus (%)"), "%", 1, "Population de 10 ans et plus."),
        ("taux-activite", "Taux net d'activité", ind("Taux d'activité des 15 ans et plus (%)"), "%", 1, "Population de 15 ans et plus."),
        ("prevalence-handicap", "Prévalence du handicap", ind("Taux de prévalence du handicap (%)"), "%", 1, None),
    ]
    blocs = [{"cle": c, "onglet": "chiffres-cles", "type": "chiffre", "titre": t, "valeur": v, "unite": u, "decimales": d, "source": RGPH,
              **({"note": n} if n else {})} for c, t, v, u, d, n in chiffres]
    blocs += [
        {"cle": "population-evolution", "onglet": "chiffres-cles", "titre": "Population légale et accroissement, 1960–2024", "type": "tableau",
         "enTeteLignes": "Recensement", "colonnes": ["Population légale", "Taux d'accroissement annuel moyen (%)"],
         "lignes": [{"libelle": a, "cellules": [{"indisponible": SERIE_ABSENTE}, {"indisponible": SERIE_ABSENTE}]} for a in ANNEES]
         + [{"libelle": "2024", "cellules": [ind("Population légale"), {"indisponible": "Taux 2014–2024 : population 2014 non chargée en base"}]}],
         "unite": None, "decimales": None, "graphique": "courbe", "source": RGPH},
        {"cle": "grands-groupes-ages", "onglet": "chiffres-cles", "titre": "Population par grands groupes d'âges (%)", "type": "tableau",
         "enTeteLignes": "Groupe d'âges", "colonnes": [l for _, l in MILIEUX],
         "lignes": [{"libelle": g, "cellules": [somme("Âge quinquennal (%)", m, milieu=k) for k, _ in MILIEUX]} for g, m in AGES.items()],
         "unite": "%", "decimales": 1, "graphique": "barres", "source": RGPH,
         "note": "Calculé : somme des parts par âge quinquennal publiées par le HCP."},
        {"cle": "fecondite", "onglet": "chiffres-cles", "titre": "Indice synthétique de fécondité", "type": "tableau",
         "enTeteLignes": "Milieu", "colonnes": ["Enfants par femme"],
         "lignes": [{"libelle": l, "cellules": [ind("Indicateur conjoncturel de fécondité", milieu=k, sexe="feminin")]} for k, l in MILIEUX],
         "unite": "enfants par femme", "decimales": 2, "graphique": "barres", "source": RGPH},
        {"cle": "chomage", "onglet": "chiffres-cles", "titre": "Taux de chômage par milieu et sexe (%)", "type": "tableau",
         "enTeteLignes": "Sexe", "colonnes": [l for _, l in MILIEUX],
         "lignes": [{"libelle": l, "cellules": [ind("Taux de chômage (%)", milieu=k, sexe=s) for k, _ in MILIEUX]} for s, l in [("masculin", "Masculin"), ("feminin", "Féminin"), ("ensemble", "Ensemble")]],
         "unite": "%", "decimales": 1, "graphique": "barres", "source": RGPH},
        {"cle": "statut-occupation", "onglet": "chiffres-cles", "titre": "Statut d'occupation du logement (%)", **par_milieu("Statut d'occupation du logement (%)", ["Propriétaire", "Locataire", "Autre"], "Statut"),
         "unite": "%", "decimales": 1, "graphique": "barres", "source": RGPH},
        {"cle": "raccordement", "onglet": "chiffres-cles", "titre": "Raccordement aux réseaux publics (%)", "type": "tableau",
         "enTeteLignes": "Réseau", "colonnes": [l for _, l in MILIEUX],
         "lignes": [
             {"libelle": "Eau courante", "cellules": [ind("Disponibilité des éléments essentiels de confort (%)", "Eau courante", milieu=k) for k, _ in MILIEUX]},
             {"libelle": "Électricité", "cellules": [ind("Disponibilité des éléments essentiels de confort (%)", "Électricité", milieu=k) for k, _ in MILIEUX]},
             {"libelle": "Réseau public d'assainissement", "cellules": [ind("Mode d’évacuation des eaux usées (%)", "Réseau public d'assainissement", milieu=k) for k, _ in MILIEUX]},
         ], "unite": "%", "decimales": 1, "graphique": "barres-horizontales", "source": RGPH},
        {"cle": "taille-menages", "onglet": "chiffres-cles", "titre": "Taille moyenne des ménages, 2004–2024", "type": "tableau",
         "enTeteLignes": "Recensement", "colonnes": [l for _, l in MILIEUX],
         "lignes": [{"libelle": a, "cellules": [{"indisponible": SERIE_ABSENTE}] * 3} for a in ("2004", "2014")]
         + [{"libelle": "2024", "cellules": [ind("Taille moyenne des ménages", milieu=k) for k, _ in MILIEUX]}],
         "unite": "personnes par ménage", "decimales": 1, "graphique": "barres", "source": RGPH},
        {"cle": "urbanisation-evolution", "onglet": "chiffres-cles", "titre": "Taux d'urbanisation, 1960–2024 (%)", "type": "tableau",
         "enTeteLignes": "Recensement", "colonnes": ["Taux d'urbanisation"],
         "lignes": [{"libelle": a, "cellules": [{"indisponible": SERIE_ABSENTE}]} for a in ANNEES] + [{"libelle": "2024", "cellules": [taux_urbanisation()]}],
         "unite": "%", "decimales": 1, "graphique": "courbe", "source": RGPH, "note": "2024 calculé : population légale urbaine ÷ population légale × 100."},
        {"cle": "niveau-etudes", "onglet": "chiffres-cles", "titre": "Niveau d'études dans l'enseignement général (%)",
         **par_milieu("Niveau d'études dans l'enseignement général (%)", ["Aucun niveau d'études", "Préscolaire", "Primaire", "Secondaire collégial", "Secondaire qualifiant", "Supérieur"], "Niveau"),
         "unite": "%", "decimales": 1, "graphique": "barres-horizontales", "source": RGPH},
    ]
    secteur = "Nombre d'établissements à but lucratif : par secteur d'activité"
    classe = "Nombre d'établissements à but lucratif : par classe d'emploi"
    blocs += [
        {"cle": "cee-secteur", "onglet": "cee", "type": "tableau", "titre": "Établissements à but lucratif par secteur d'activité",
         "enTeteLignes": "Secteur d'activité", "colonnes": ["Établissements", "Emplois"],
         "lignes": [{"libelle": m, "cellules": [ind(secteur, m), {"indisponible": "Emplois par secteur non publiés dans le fichier CEE chargé"}]} for m in ["Industrie", "Construction", "Commerce", "Services"]],
         "unite": "établissements", "decimales": 0, "graphique": "barres-horizontales", "source": CEE},
        {"cle": "cee-type", "onglet": "cee", "type": "tableau", "titre": "Établissements par type",
         "enTeteLignes": "Type d'établissement", "colonnes": ["Établissements"],
         "lignes": [
             {"libelle": "À but lucratif (hors agriculture)", "cellules": [ind("Nombre d'établissements à but lucratif (entreprises et leurs établissements hors secteur de l'agriculture)")]},
             {"libelle": "Services publics", "cellules": [ind("Nombre d'établissements de services publics")]},
             {"libelle": "À but non lucratif (associations)", "cellules": [ind("Nombre d'établissements à but non lucratif (Associations opérant dans des locaux indépendants)")]},
             {"libelle": "Total des établissements géoréférencés", "cellules": [ind("Nombre total des établissements géoréférencés")]},
         ], "unite": "établissements", "decimales": 0, "graphique": "barres-horizontales", "source": CEE},
        {"cle": "cee-classe-emploi", "onglet": "cee", "type": "tableau", "titre": "Établissements à but lucratif par classe d'emploi",
         "enTeteLignes": "Classe d'emploi", "colonnes": ["Établissements"],
         "lignes": [{"libelle": l, "cellules": [ind(classe, m)]} for m, l in [("un seul employé", "Un seul employé"), ("2 à 3", "2 à 3 employés"), ("4 à 9", "4 à 9 employés"), ("10 à 49", "10 à 49 employés"), ("50 & +", "50 employés et plus")]],
         "unite": "établissements", "decimales": 0, "graphique": "barres", "source": CEE,
         "note": "Emplois permanents occupés par les établissements à but lucratif : voir l'onglet Tableaux (total seulement)."},
    ]
    return {"pays": pays, "zone": {"code": code, "nom": nom}, "blocs": blocs}
