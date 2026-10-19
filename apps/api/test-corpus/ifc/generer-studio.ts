/**
 * Corpus IFC de Studio : un document `studio-document/1` construit par commandes (mur diagonal avec épaisseur, ligne
 * extrudée sans épaisseur, rectangle extrudé, ligne plate, cote, calque masqué et calque verrouillé ; mur architectural
 * coudé avec une porte déclarée et une ouverture sans type, A.4 ; propriétés déclarées E.1-01, dont une non évaluée),
 * exporté par
 * `exportStudioIfc` et comparé octet pour octet à la référence commitée (`studio.attendu.ifc`) ; effectifs attendus
 * dans `studio.attendus.json`, relus par `valider.py` (conformité testée avec IfcOpenShell, jamais « certifiée »).
 *
 *   npx tsx apps/api/test-corpus/ifc/generer-studio.ts <dossier de sortie> [--mettre-a-jour]
 *   python3 apps/api/test-corpus/ifc/valider.py <dossier>/studio.ifc <dossier>/studio.attendus.json
 *   python3 apps/api/test-corpus/ifc/valider-proprietes.py <dossier>/studio.ifc <dossier>/studio.proprietes.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyStudioCommands, exportStudioIfc, newStudioDocument } from "@parcours/atelier-model";

const ici = dirname(fileURLToPath(import.meta.url));
const sortie = process.argv[2] ?? join(ici, "sortie");
const mettreAJour = process.argv.includes("--mettre-a-jour");
mkdirSync(sortie, { recursive: true });

const PROPRIETES = [
  { cibleId: "m1", nom: "Repère", valeur: "M-01", source: "Corpus de test Studio" },
  { cibleId: "m1", nom: "Longueur relevée", valeur: 6, unite: "m", source: "Relevé de corpus" },
  { cibleId: "s1", nom: "Surface déclarée", valeur: 6, unite: "m2" },
  { cibleId: "r1", nom: "Volume déclaré", valeur: 2.7, unite: "m³" },
  { cibleId: "r1", nom: "Masse déclarée", valeur: 120.5, unite: "kg", source: "Fiche de corpus" },
  { cibleId: "ma", nom: "Résistance au feu", valeur: "Valeur de corpus", source: "Corpus de test Studio" },
  { cibleId: "ma", nom: "Matériau" },
  { cibleId: "oa", nom: "Repère", valeur: "P-01" },
  { cibleId: "ob", nom: "Repère", valeur: "B-01" },
];
const doc = applyStudioCommands(newStudioDocument("corpus-studio"), [
  { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "masque", name: "Calque masqué", visible: false, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "m1", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } } },
  { toolId: "studio.dessin.ligne", params: { id: "m2", type: "line", layerId: "murs", start: { x: 6, y: 0 }, end: { x: 9, y: 4 } } },
  { toolId: "studio.dessin.ligne", params: { id: "s1", type: "line", start: { x: 0, y: 2 }, end: { x: 0, y: 5 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 2, y: 1 }, width: 2, height: 1.5 } },
  { toolId: "studio.dessin.rectangle", params: { id: "r2", type: "rectangle", layerId: "masque", origin: { x: 7, y: 5 }, width: 1, height: 1 } },
  { toolId: "studio.dessin.ligne", params: { id: "plat", type: "line", start: { x: 0, y: -1 }, end: { x: 6, y: -1 } } },
  { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, offset: -1.5, links: { start: { objectId: "m1", anchor: "start" }, end: { objectId: "m1", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.objet.extruder", params: { ids: ["m1", "m2"], base: 0, height: 2.7, thickness: 0.2 } },
  { toolId: "studio.objet.extruder", params: { ids: ["s1"], base: 0.5, height: 2 } },
  { toolId: "studio.objet.extruder", params: { ids: ["r1"], base: 0, height: 0.9 } },
  { toolId: "studio.objet.extruder", params: { ids: ["r2"], base: -0.3, height: 0.3 } },
  // Architecture (A.4) : mur créé comme mur (axe coudé, justification gauche), une porte déclarée et une ouverture sans type.
  { toolId: "studio.architecture.mur", params: { id: "ma", type: "wall", axis: [{ x: 0, y: 8 }, { x: 6, y: 8 }, { x: 6, y: 12 }], thickness: 0.2, height: 3, base: 0, justification: "left" } },
  { toolId: "studio.architecture.ouverture", params: { id: "oa", type: "opening", hostId: "ma", position: 2.5, width: 1, height: 2.1, sill: 0, kind: "porte" } },
  { toolId: "studio.architecture.ouverture", params: { id: "ob", type: "opening", hostId: "ma", position: 7, width: 1.2, height: 1, sill: 1 } },
  // Propriétés déclarées (E.1-01) : jeu de projet `Fadi_ProprietesDeclarees` ; valeurs de corpus saisies pour le test,
  // pas des données de projet. Une propriété sans valeur (non évaluée) n'est pas écrite.
  ...PROPRIETES.map((params) => ({ toolId: "studio.propriete.definir", params })),
  { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: true, locked: true } },
]);
const contenu = exportStudioIfc(doc, { studyName: "Corpus Studio", variantName: "Variante A", revisionId: "corpus-1", timestamp: "2026-10-18T00:00:00" });
writeFileSync(join(sortie, "studio.ifc"), contenu);
writeFileSync(join(sortie, "studio.attendus.json"), JSON.stringify({ IfcBuildingStorey: 1, IfcWall: 3, IfcOpeningElement: 2, IfcDoor: 1, IfcWindow: 0, IfcBuildingElementProxy: 3, IfcSlab: 0, IfcColumn: 0, IfcMapConversion: 0, IfcPropertySet: 15, IfcRelDefinesByProperties: 15, IfcPropertySingleValue: 60 }));
// Propriétés attendues par élément (Tag = identifiant Studio) : relues par `valider-proprietes.py`.
writeFileSync(join(sortie, "studio.proprietes.json"), JSON.stringify({
  pset: "Fadi_ProprietesDeclarees",
  elements: {
    m1: { classe: "IfcWall", proprietes: { "Repère": ["IfcLabel", "M-01", "Source déclarée : Corpus de test Studio"], "Longueur relevée": ["IfcLengthMeasure", 6, "Source déclarée : Relevé de corpus"] } },
    s1: { classe: "IfcBuildingElementProxy", proprietes: { "Surface déclarée": ["IfcAreaMeasure", 6, null] } },
    r1: { classe: "IfcBuildingElementProxy", proprietes: { "Volume déclaré": ["IfcVolumeMeasure", 2.7, null], "Masse déclarée": ["IfcReal", 120.5, "Unité déclarée : kg ; Source déclarée : Fiche de corpus"] } },
    ma: { classe: "IfcWall", proprietes: { "Résistance au feu": ["IfcLabel", "Valeur de corpus", "Source déclarée : Corpus de test Studio"] } },
    oa: { classe: "IfcDoor", proprietes: { "Repère": ["IfcLabel", "P-01", null] } },
    ob: { classe: "IfcOpeningElement", proprietes: { "Repère": ["IfcLabel", "B-01", null] } },
  },
  export: { DeclaredPropertiesExported: 8, DeclaredPropertiesNotEvaluated: 1 },
}, null, 2));
const reference = join(ici, "studio.attendu.ifc");
if (mettreAJour) writeFileSync(reference, contenu);
else if (readFileSync(reference, "utf8") !== contenu) {
  console.error("✗ studio.ifc diffère de la référence commitée (apps/api/test-corpus/ifc/studio.attendu.ifc) : relancer avec --mettre-a-jour si l'évolution est voulue.");
  process.exit(1);
}
console.log("✓ studio.ifc écrit et identique à la référence");
