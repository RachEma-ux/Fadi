#!/usr/bin/env python3
"""
Relecture, avec IfcOpenShell, des propriétés déclarées (E.1-01) d'un IFC exporté par Studio : pour chaque élément
attendu (Tag = identifiant Studio), le jeu de projet `Fadi_ProprietesDeclarees` est relié à l'entité de la classe
attendue par IfcRelDefinesByProperties, et chacune de ses IfcPropertySingleValue a le nom, le type de valeur, la
valeur et la description attendus ; aucun autre élément ne porte ce jeu ; les effectifs de `Fadi_StudioExport` sont
ceux attendus. Conformité testée, jamais « certifiée ».

  python3 apps/api/test-corpus/ifc/valider-proprietes.py fichier.ifc proprietes.json
"""
import json
import math
import sys

import ifcopenshell

chemin = sys.argv[1]
attendus = json.load(open(sys.argv[2], encoding="utf-8"))
f = ifcopenshell.open(chemin)
nom_pset = attendus["pset"]
echecs = []


def jeux(entite):
    """Jeux de propriétés reliés à l'entité (IfcRelDefinesByProperties), par nom."""
    out = {}
    for rel in getattr(entite, "IsDefinedBy", None) or []:
        if rel.is_a("IfcRelDefinesByProperties") and rel.RelatingPropertyDefinition.is_a("IfcPropertySet"):
            out.setdefault(rel.RelatingPropertyDefinition.Name, []).append(rel.RelatingPropertyDefinition)
    return out


porteurs = set()
for rel in f.by_type("IfcRelDefinesByProperties"):
    d = rel.RelatingPropertyDefinition
    if d.is_a("IfcPropertySet") and d.Name == nom_pset:
        for o in rel.RelatedObjects:
            porteurs.add(o.id())

lus = 0
for tag, attendu in attendus["elements"].items():
    candidats = [e for e in f.by_type(attendu["classe"], include_subtypes=False) if e.Tag == tag]
    if len(candidats) != 1:
        echecs.append(f"{tag} : {len(candidats)} {attendu['classe']} trouvé(s), 1 attendu")
        continue
    e = candidats[0]
    porteurs.discard(e.id())
    sets = jeux(e).get(nom_pset, [])
    if len(sets) != 1:
        echecs.append(f"{tag} : {len(sets)} jeu(x) {nom_pset}, 1 attendu")
        continue
    props = {p.Name: p for p in sets[0].HasProperties}
    if set(props) != set(attendu["proprietes"]):
        echecs.append(f"{tag} : propriétés {sorted(props)}, attendues {sorted(attendu['proprietes'])}")
    for nom, (type_valeur, valeur, description) in attendu["proprietes"].items():
        p = props.get(nom)
        if p is None:
            continue
        lus += 1
        if not p.is_a("IfcPropertySingleValue"):
            echecs.append(f"{tag}.{nom} : {p.is_a()}, IfcPropertySingleValue attendu")
            continue
        v = p.NominalValue
        if v is None or v.is_a() != type_valeur:
            echecs.append(f"{tag}.{nom} : type {v.is_a() if v else None}, {type_valeur} attendu")
        elif isinstance(valeur, (int, float)) and not isinstance(valeur, bool):
            if not math.isclose(float(v.wrappedValue), float(valeur), rel_tol=0, abs_tol=1e-9):
                echecs.append(f"{tag}.{nom} : valeur {v.wrappedValue}, {valeur} attendue")
        elif v.wrappedValue != valeur:
            echecs.append(f"{tag}.{nom} : valeur {v.wrappedValue!r}, {valeur!r} attendue")
        if p.Specification != description:
            echecs.append(f"{tag}.{nom} : description {p.Specification!r}, {description!r} attendue")
        if p.Unit is not None:
            echecs.append(f"{tag}.{nom} : unité IFC explicite inattendue (unités du projet)")

if porteurs:
    echecs.append(f"{len(porteurs)} élément(s) inattendu(s) portent {nom_pset}")

export = {}
for projet in f.by_type("IfcProject"):
    for s in jeux(projet).get("Fadi_StudioExport", []):
        export.update({p.Name: p.NominalValue.wrappedValue for p in s.HasProperties})
for cle, n in attendus.get("export", {}).items():
    if export.get(cle) != n:
        echecs.append(f"Fadi_StudioExport.{cle} : {export.get(cle)}, {n} attendu")

print(json.dumps({"fichier": chemin, "pset": nom_pset, "elements": len(attendus["elements"]), "proprietes": lus, "erreurs": len(echecs)}, ensure_ascii=False))
for e in echecs:
    print("✗", e)
if echecs:
    sys.exit(1)
print("✓ propriétés déclarées relues (IfcOpenShell", ifcopenshell.version + ")")
