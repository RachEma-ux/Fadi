/**
 * Corpus IFC fixé (cahier §5.10, lot 6) : produit les fichiers à valider avec IfcOpenShell en CI.
 *
 * - `petit.ifc` : un modèle construit ici par commandes, couvrant le sous-ensemble de l'annexe C (niveaux, murs,
 *   portes, fenêtres, dalle, toiture en pente, escalier, poteau, pièces, zone, garde-corps, texte, cote), comparé
 *   octet pour octet au fichier de référence commité (`petit.attendu.ifc`) : toute évolution de l'écriture IFC se voit ;
 * - `p118.ifc` : l'exemple complet P.118 (modèle typé importé du jeu natif) ;
 * - `p118-reimporte.ifc` : `p118.ifc` relu par web-ifc, importé en représentations dans un modèle vide (rapport
 *   `p118-import.rapport.json`), puis réexporté — le chemin aller-retour complet ;
 * - `*.attendus.json` : effectifs attendus par classe IFC, relus par `valider.py`.
 *
 *   npx tsx apps/api/test-corpus/ifc/generer.ts <dossier de sortie> [--mettre-a-jour]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lireIfc } from "../../src/lib/atelier-ifc.js";
import { CONTRAT_COMMANDES, appliquerLot, commandesImportIfc, exporterIfc, importerModeleNatif, modeleVide, objetsDeClasse, type Commande, type JeuNatif, type ModeleAtelier } from "@parcours/atelier-model";

const ici = dirname(fileURLToPath(import.meta.url));
const sortie = process.argv[2] ?? join(ici, "sortie");
const mettreAJour = process.argv.includes("--mettre-a-jour");
mkdirSync(sortie, { recursive: true });

const m = (value: number) => ({ value, unit: "m" });
const deg = (value: number) => ({ value, unit: "deg" });
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });
const appliquer = (etat: ModeleAtelier, commands: Commande[]) => appliquerLot(etat, { requestId: "corpus", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "corpus", commands }).etat;

function petit(): ModeleAtelier {
  const base = appliquer(modeleVide(), [
    { type: "niveau.creer", params: { id: "rdc", nom: "Rez-de-chaussée", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "r1", nom: "Étage", elevation: 3, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "toit", nom: "Toiture", elevation: 6 } },
    { type: "mur.tracer", params: { id: "m1", niveauId: "rdc", a: pt(0, 0), b: pt(8, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "m2", niveauId: "rdc", a: pt(8, 0), b: pt(8, 6), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "m3", niveauId: "rdc", a: pt(8, 6), b: pt(0, 6), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "m4", niveauId: "rdc", a: pt(0, 6), b: pt(0, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "p1", classe: "porte", murHoteId: "m1", position: 0.25, largeur: m(0.9), hauteur: m(2.1) } },
    { type: "ouverture.poser", params: { id: "f1", classe: "fenetre", murHoteId: "m2", position: 0.5, largeur: m(1.2), hauteur: m(1.25), allege: m(0.95) } },
    { type: "dalle.creer", params: { id: "d1", niveauId: "r1", contour: [pt(0, 0), pt(8, 0), pt(8, 6), pt(0, 6)], trous: [[pt(1, 1), pt(2, 1), pt(2, 4), pt(1, 4)]], epaisseur: m(0.2) } },
    { type: "toiture.creer", params: { id: "t1", niveauId: "toit", contour: [pt(0, 0), pt(8, 0), pt(8, 6), pt(0, 6)], type: "bipente", pente: deg(30), epaisseur: m(0.25) } },
    { type: "escalier.creer", params: { id: "e1", niveauId: "rdc", niveauDepartId: "rdc", niveauArriveeId: "r1", a: pt(1.5, 1), b: pt(1.5, 4), largeur: m(0.9), hauteurAFranchir: m(3), contremarches: 17, marches: 16 } },
    { type: "poteau.creer", params: { id: "c1", niveauId: "rdc", point: pt(4, 3), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
    { type: "piece.creer", params: { id: "s1", niveauId: "rdc", contour: [pt(2.1, 0.1), pt(7.9, 0.1), pt(7.9, 5.9), pt(2.1, 5.9)], trous: [], code: "R01", nom: "Séjour" } },
    { type: "piece.creer", params: { id: "s2", niveauId: "r1", contour: [pt(2.1, 0.1), pt(7.9, 0.1), pt(7.9, 5.9), pt(2.1, 5.9)], trous: [], code: "R11", nom: "Chambre" } },
    { type: "gardeCorps.creer", params: { id: "g1", niveauId: "r1", points: [pt(0.9, 0.9), pt(2.1, 0.9), pt(2.1, 4.1)], hauteur: m(1), epaisseur: m(0.05), remplissage: "barreaudage" } },
    { type: "texte.creer", params: { id: "x1", niveauId: "rdc", position: pt(4, 2), texte: "Séjour — 34 m²" } },
    { type: "cotation.creer", params: { id: "k1", niveauId: "rdc", a: pt(0, -1), b: pt(8, -1) } },
  ]);
  return appliquer(base, [{ type: "zone.creer", params: { id: "z1", niveauId: "rdc", contour: [pt(0, 0), pt(8, 0), pt(8, 6), pt(0, 6)], trous: [], nom: "Logement" } }]);
}

const options = (code: string) => ({ projet: { id: `corpus-${code}`, nom: `Corpus ${code}`, code }, revision: 1, horodatage: "2026-10-04T00:00:00" });
let ecarts = 0;

{
  const etat = petit();
  const { contenu, rapport } = exporterIfc(etat, options("PETIT"));
  writeFileSync(join(sortie, "petit.ifc"), contenu);
  writeFileSync(join(sortie, "petit.attendus.json"), JSON.stringify({ IfcBuildingStorey: 3, IfcWall: 4, IfcDoor: 1, IfcWindow: 1, IfcOpeningElement: 2, IfcSlab: 2, IfcRoof: 1, IfcStair: 1, IfcColumn: 1, IfcSpace: 2, IfcZone: 1, IfcRailing: 1, IfcAnnotation: 2, IfcMapConversion: 0 }));
  writeFileSync(join(sortie, "petit.rapport.json"), JSON.stringify(rapport, null, 1));
  const reference = join(ici, "petit.attendu.ifc");
  if (mettreAJour) writeFileSync(reference, contenu);
  else if (readFileSync(reference, "utf8") !== contenu) {
    console.error("✗ petit.ifc diffère de la référence commitée (apps/api/test-corpus/ifc/petit.attendu.ifc) : relancer avec --mettre-a-jour si l'évolution est voulue.");
    ecarts++;
  } else console.log("✓ petit.ifc identique à la référence");
}
{
  const jeu = JSON.parse(readFileSync(join(ici, "../../src/data/examples/p118-native-model.json"), "utf8")) as JeuNatif;
  const etat = importerModeleNatif(jeu).modele;
  const t0 = performance.now();
  const { contenu } = exporterIfc(etat, options("P118"));
  console.log(`P.118 : ${Math.round(performance.now() - t0)} ms, ${(contenu.length / 1e6).toFixed(2)} Mo`);
  writeFileSync(join(sortie, "p118.ifc"), contenu);
  // Aller-retour : relecture par web-ifc, import en représentations, réexport.
  const t1 = performance.now();
  const lecture = await lireIfc(new Uint8Array(Buffer.from(contenu)));
  const { lots, rapport } = commandesImportIfc(modeleVide(), lecture, { source: "p118.ifc" });
  let reimporte = modeleVide();
  for (const l of lots) reimporte = appliquer(reimporte, l.commands);
  console.log(`P.118 réimporté : ${Math.round(performance.now() - t1)} ms, ${objetsDeClasse(reimporte, "objet-importe").length} représentations, ${lots.length} lots`);
  const murs = rapport.classes.find((l) => l.classe === "IfcWall");
  if (!murs || murs.cible !== objetsDeClasse(etat, "mur").length) {
    console.error(`✗ réimport : ${murs?.cible ?? 0} IfcWall importés, ${objetsDeClasse(etat, "mur").length} attendus`);
    ecarts++;
  }
  writeFileSync(join(sortie, "p118-import.rapport.json"), JSON.stringify(rapport, null, 1));
  writeFileSync(join(sortie, "p118-reimporte.ifc"), exporterIfc(reimporte, options("P118R")).contenu);
  writeFileSync(join(sortie, "p118-reimporte.attendus.json"), JSON.stringify({ IfcBuildingStorey: Object.keys(etat.niveaux).length, IfcBuildingElementProxy: objetsDeClasse(reimporte, "objet-importe").length, IfcMapConversion: 0 }));
  writeFileSync(join(sortie, "p118.attendus.json"), JSON.stringify({ IfcBuildingStorey: Object.keys(etat.niveaux).length, IfcWall: objetsDeClasse(etat, "mur").length, IfcDoor: objetsDeClasse(etat, "porte").length, IfcWindow: objetsDeClasse(etat, "fenetre").length }));
}
process.exit(ecarts ? 1 : 0);
