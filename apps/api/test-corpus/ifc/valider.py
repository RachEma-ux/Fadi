#!/usr/bin/env python3
"""
Validation d'un fichier IFC exporté par Fadi avec IfcOpenShell (cahier §5.10, D-006 : conformité testée, jamais
« certifiée »). Contrôles : schéma IFC4X3_ADD2 (types, cardinalités, règles WHERE évaluables par IfcOpenShell),
effectifs attendus par classe (fichier JSON facultatif), IfcMapConversion présent et cohérent, géométrie des murs,
dalles et espaces interprétable par le noyau d'IfcOpenShell sur un échantillon.

  python3 apps/api/test-corpus/ifc/valider.py fichier.ifc [attendus.json]
"""
import json
import sys

import ifcopenshell
import ifcopenshell.validate

chemin = sys.argv[1]
attendus = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
f = ifcopenshell.open(chemin)
echecs = []

if f.schema_identifier != "IFC4X3_ADD2" and f.schema != "IFC4X3":
    echecs.append(f"schéma inattendu : {f.schema_identifier}")

journal = ifcopenshell.validate.json_logger()
ifcopenshell.validate.validate(f, journal, express_rules=True)
erreurs = [s for s in journal.statements if s.get("level", "").lower() in ("error",)]
# Erreurs regroupées par règle (premier exemple cité) : lisible en CI.
par_regle = {}
for e in erreurs:
    message = str(e.get("message", e))
    regle = message.split("Violated by")[0].strip()[:240]
    par_regle.setdefault(regle, [0, message])[0] += 1
for regle, (n, exemple) in sorted(par_regle.items(), key=lambda kv: -kv[1][0]):
    instance = exemple.split("where () = ")[-1][:120] if "where" in exemple else ""
    echecs.append(f"schéma ({n}×) : {regle} {instance}"[:500])

for classe, n in attendus.items():
    trouve = len(f.by_type(classe, include_subtypes=False))
    if trouve != n:
        echecs.append(f"{classe} : {trouve} trouvé(s), {n} attendu(s)")

conversions = f.by_type("IfcMapConversion")
if attendus.get("IfcMapConversion", 1) and not conversions:
    echecs.append("IfcMapConversion absent")
for c in conversions:
    if not c.TargetCRS or not c.TargetCRS.Name.startswith("EPSG:"):
        echecs.append("IfcMapConversion : CRS cible sans code EPSG")

# Géométrie : le noyau d'IfcOpenShell doit savoir construire un échantillon de formes.
try:
    import ifcopenshell.geom

    reglages = ifcopenshell.geom.settings()
    for classe in ("IfcWall", "IfcSlab", "IfcSpace", "IfcColumn", "IfcDoor", "IfcStair", "IfcBuildingElementProxy"):
        for p in f.by_type(classe)[:15]:
            # Seuls les produits qui ont un corps (« Body ») ont une forme 3D à construire.
            if not p.Representation or not any(r.RepresentationIdentifier == "Body" for r in p.Representation.Representations):
                continue
            try:
                forme = ifcopenshell.geom.create_shape(reglages, p)
                if len(forme.geometry.verts) == 0:
                    echecs.append(f"{classe} {p.GlobalId} : forme vide")
            except Exception as err:  # noqa: BLE001
                echecs.append(f"{classe} {p.GlobalId} : géométrie non construite ({err})"[:300])
except ImportError:
    print("ifcopenshell.geom indisponible : contrôle géométrique sauté")

resume = {t: len(f.by_type(t, include_subtypes=False)) for t in ("IfcBuildingStorey", "IfcWall", "IfcDoor", "IfcWindow", "IfcOpeningElement", "IfcSlab", "IfcRoof", "IfcStair", "IfcColumn", "IfcSpace", "IfcZone", "IfcBuildingElementProxy", "IfcRailing", "IfcAnnotation")}
print(json.dumps({"fichier": chemin, "schema": f.schema_identifier, "effectifs": resume, "erreurs": len(echecs)}, ensure_ascii=False))
for e in echecs:
    print("✗", e)
if echecs:
    sys.exit(1)
print("✓ IFC valide (IfcOpenShell", ifcopenshell.version + ")")
