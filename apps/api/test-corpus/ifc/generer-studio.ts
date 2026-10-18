/**
 * Corpus IFC de Studio : un document `studio-document/1` construit par commandes (mur diagonal avec épaisseur, ligne
 * extrudée sans épaisseur, rectangle extrudé, ligne plate, cote, calque masqué et calque verrouillé), exporté par
 * `exportStudioIfc` et comparé octet pour octet à la référence commitée (`studio.attendu.ifc`) ; effectifs attendus
 * dans `studio.attendus.json`, relus par `valider.py` (conformité testée avec IfcOpenShell, jamais « certifiée »).
 *
 *   npx tsx apps/api/test-corpus/ifc/generer-studio.ts <dossier de sortie> [--mettre-a-jour]
 *   python3 apps/api/test-corpus/ifc/valider.py <dossier>/studio.ifc <dossier>/studio.attendus.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyStudioCommands, exportStudioIfc, newStudioDocument } from "@parcours/atelier-model";

const ici = dirname(fileURLToPath(import.meta.url));
const sortie = process.argv[2] ?? join(ici, "sortie");
const mettreAJour = process.argv.includes("--mettre-a-jour");
mkdirSync(sortie, { recursive: true });

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
  { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: true, locked: true } },
]);
const contenu = exportStudioIfc(doc, { studyName: "Corpus Studio", variantName: "Variante A", revisionId: "corpus-1", timestamp: "2026-10-18T00:00:00" });
writeFileSync(join(sortie, "studio.ifc"), contenu);
writeFileSync(join(sortie, "studio.attendus.json"), JSON.stringify({ IfcBuildingStorey: 1, IfcWall: 2, IfcBuildingElementProxy: 3, IfcSlab: 0, IfcColumn: 0, IfcMapConversion: 0 }));
const reference = join(ici, "studio.attendu.ifc");
if (mettreAJour) writeFileSync(reference, contenu);
else if (readFileSync(reference, "utf8") !== contenu) {
  console.error("✗ studio.ifc diffère de la référence commitée (apps/api/test-corpus/ifc/studio.attendu.ifc) : relancer avec --mettre-a-jour si l'évolution est voulue.");
  process.exit(1);
}
console.log("✓ studio.ifc écrit et identique à la référence");
