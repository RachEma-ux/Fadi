import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StudioDocument } from "../document-2d.js";
import { exportStudioIfc } from "../ifc.js";
import { lireDxfStudio, STUDIO_DXF_UNITES } from "../import-dxf.js";
import { dxf, ligne, lwpolyligne } from "../import-dxf.fixtures.js";
import { exactSynthetique } from "../exacts.fixtures.js";
import {
  controlerMatriceEchanges, STUDIO_COUVERTURE_EXPORT, STUDIO_DECISIONS_RENONCEMENT, STUDIO_MATRICE_ECHANGES, STUDIO_STATUT_DE_RAISON, studioCouvertureFormat,
  studioDeclareConformite, studioMatriceEchangesMarkdown, studioTextesEntree,
  type StudioEntreeEchange, type StudioPreuveEchange,
} from "./matrice-echanges.js";
import { STUDIO_CAPACITES_EXPORT, STUDIO_FORMATS_ECHANGE, STUDIO_RAISONS_FIDELITE, studioRapportFidelite } from "./rapport-fidelite.js";

/**
 * Matrice d'échanges (E.6-01 à E.6-05) : cohérence interne, recoupement avec le rapport de fidélité et la sortie IFC
 * réelle, empreinte épinglée par révision, et relecture du dépôt — chaque preuve citée existe et est discriminante,
 * chaque écrivain, route de fichier et téléchargement Studio a son entrée.
 * Document généré : `STUDIO_MATRICE_ECRIRE=1 npx vitest run matrice-echanges` le réécrit (changement délibéré).
 */

const RACINE = fileURLToPath(new URL("../../../../../", import.meta.url));
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");
const DOC_MD = "docs/ai-team/reports/claude-v9-e6/MATRICE-ECHANGES.md";
const livrees = STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "livre");
const preuves = (e: StudioEntreeEchange) => [...(e.preuves?.code ?? []), ...(e.preuves?.tests ?? []), ...(e.preuves?.routes ?? []), ...(e.preuves?.interfaces ?? [])];
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const entree = (id: string) => STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.id === id)!;

function fichiers(dossier: string, filtre: (f: string) => boolean): string[] {
  const out: string[] = [];
  const parcourir = (rel: string) => {
    for (const nom of readdirSync(join(RACINE, rel))) {
      const r = `${rel}/${nom}`;
      if (statSync(join(RACINE, r)).isDirectory()) parcourir(r);
      else if (filtre(r)) out.push(r);
    }
  };
  parcourir(dossier);
  return out.sort();
}
const sourcesNonTest = (f: string) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !/\.fixtures\.ts$/.test(f);
const fonctionsExportees = (texte: string) => [...texte.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]!);
const cites = (type: "code" | "routes" | "interfaces") => livrees.flatMap((e) => e.preuves?.[type] ?? []);

describe("Matrice d'échanges : donnée versionnée et cohérente", () => {
  it("contrôle interne sans problème ; gelée ; schéma et révision", () => {
    expect(controlerMatriceEchanges()).toEqual([]);
    expect(Object.isFrozen(STUDIO_MATRICE_ECHANGES) && Object.isFrozen(STUDIO_MATRICE_ECHANGES.entrees) && Object.isFrozen(STUDIO_MATRICE_ECHANGES.entrees[0])).toBe(true);
    expect(STUDIO_MATRICE_ECHANGES).toMatchObject({ schema: "studio-matrice-echanges/1", conformite: "non-evaluee" });
    expect(STUDIO_MATRICE_ECHANGES.revision).toBeGreaterThanOrEqual(1);
  });

  it("le contrôle relève une conformité déclarée, un livré sans test, un report sans raison, un renoncé sans décision Studio", () => {
    const base = livrees[0]!;
    const m = (entrees: StudioEntreeEchange[]) => ({ ...STUDIO_MATRICE_ECHANGES, entrees: [...STUDIO_MATRICE_ECHANGES.entrees, ...entrees] });
    expect(controlerMatriceEchanges(m([{ ...base, id: "x1", limite: "Fichier conforme à la norme." }]))).toContain("x1 : conformité déclarée");
    expect(controlerMatriceEchanges(m([{ ...base, id: "x2", preuves: { code: base.preuves!.code, tests: [] } }]))).toContain("x2 : entrée livrée sans code ou sans test");
    const report = STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.statut === "non-livre")!;
    expect(controlerMatriceEchanges(m([{ ...report, id: "x3", raison: "" }]))).toContain("x3 : report sans raison");
    // D-179 (Atelier P2) citée en source ou en décision ne vaut pas : seule une décision Studio admise vaut.
    expect(STUDIO_DECISIONS_RENONCEMENT).toEqual([]);
    expect(controlerMatriceEchanges(m([{ ...report, id: "x4", statut: "renonce", sources: [{ reference: "docs/atelier/decisions.md, D-179" }] }]))).toContain("x4 : renoncé sans décision Studio admise");
    expect(controlerMatriceEchanges(m([{ ...report, id: "x5", statut: "renonce", decision: "D-179" }]))).toContain("x5 : renoncé sans décision Studio admise");
  });

  it("conformité déclarée : tous les champs texte relus, proposition par proposition, négation tolérée seulement juste avant le mot", () => {
    for (const piege of ["Conformité IFC4X3 garantie.", "Fichier conforme à IFC4X3 ; jamais certifié.", "Export défini conforme à ISO 10303-21", "Compliant",
      "Certifié IFC", "Homologué par le bureau", "Testé, jamais une fois non audité, mais conforme", "non évalué, conforme à R12", "Conformité non évaluée"]) {
      expect(studioDeclareConformite(piege), piege).toBe(true);
    }
    for (const sain of ["Aucune conformité PDF/A déclarée.", "testé, jamais certifié", "Décrit le fichier (jamais certifié) : exact", "ni conforme ni certifié", "Non conforme", "no compliance claimed", "Plan 2D seulement"]) {
      expect(studioDeclareConformite(sain), sain).toBe(false);
    }
    const base = livrees[0]!;
    const m = (e: StudioEntreeEchange) => controlerMatriceEchanges({ ...STUDIO_MATRICE_ECHANGES, entrees: [...STUDIO_MATRICE_ECHANGES.entrees, e] });
    expect(m({ ...base, id: "y1", versionFormat: "Conformité IFC4X3 garantie." })).toContain("y1 : conformité déclarée");
    expect(m({ ...base, id: "y2", objet: "Export défini conforme à ISO 10303-21" })).toContain("y2 : conformité déclarée");
    expect(m({ ...base, id: "y3", entites: [{ entite: "LINE", couverture: "portee", detail: "Compliant" }] })).toContain("y3 : conformité déclarée");
    expect(m({ ...base, id: "y4", controle: "Fichier conforme à IFC4X3 ; jamais certifié." })).toContain("y4 : conformité déclarée");
    const report = STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.statut === "non-livre")!;
    expect(m({ ...report, id: "y5", raison: "Reporté ; format homologué." })).toContain("y5 : conformité déclarée");
    expect(m({ ...report, id: "y6", sources: [{ reference: "Plan", commentaire: "Conformité garantie" }] })).toContain("y6 : conformité déclarée");
    // Chaque entrée réelle : aucun texte ne déclare de conformité.
    for (const e of STUDIO_MATRICE_ECHANGES.entrees) expect(studioTextesEntree(e).filter(studioDeclareConformite), e.id).toEqual([]);
  });

  it("révision : l'empreinte des entrées est épinglée par révision (modifier une entrée sans incrémenter la révision échoue)", () => {
    /** Empreinte SHA-256 des entrées et de la couverture de chaque révision (ajouter la ligne de la nouvelle révision). */
    const EMPREINTES: Readonly<Record<number, string>> = {
      2: "2be9a875025eda0b2b9a28f5365c2c466d95f0943a2ce7d878499d380c568c92",
      // Lot F3 (2026-10-25) : import IFC et modèle externe livrés, « ifc-lecture » retiré des reports, éléments non natifs à l'import DXF.
      3: "8f2308d0949b5465baeb43d256547d3153874825149e6d9b3e82f0c2b704b7b8",
      // Lot F2 : catégorie « exacts » (solides exacts, non couverts par SVG / DXF / IFC).
      4: "46bee5f95b4b04bd2cd1e24a1b2c7ae00a5cbdcde8d7a687722778d43479f373",
    };
    const empreinte = createHash("sha256").update(JSON.stringify({ entrees: STUDIO_MATRICE_ECHANGES.entrees, couverture: STUDIO_COUVERTURE_EXPORT, statuts: STUDIO_STATUT_DE_RAISON })).digest("hex");
    expect(empreinte, `révision ${STUDIO_MATRICE_ECHANGES.revision} : entrées modifiées sans nouvelle révision ? (empreinte calculée ${empreinte})`).toBe(EMPREINTES[STUDIO_MATRICE_ECHANGES.revision]);
    expect(Math.max(...Object.keys(EMPREINTES).map(Number)), "la révision courante est la dernière épinglée").toBe(STUDIO_MATRICE_ECHANGES.revision);
  });

  it("E.6-04 / E.6-05 : DWG, DGN, BCF, STEP, OBJ, STL inscrits dans les deux sens, glTF en export, jamais livrés ni conformes", () => {
    for (const id of ["dwg", "dgn", "bcf", "step", "obj", "stl"]) for (const sens of ["import", "export"]) {
      const e = STUDIO_MATRICE_ECHANGES.entrees.find((x) => x.id === `${id}-${sens}`);
      expect(e?.statut, `${id}-${sens}`).toBe("non-livre");
      expect(e?.raison).toBeTruthy();
      expect(e?.preuves).toBeUndefined();
    }
    expect(entree("gltf-export").statut).toBe("non-livre");
    // D-179 (Atelier) est citée, jamais prise pour une renonciation Studio.
    const dwg = entree("dwg-export");
    expect(dwg.sources.some((s) => s.reference.includes("D-179"))).toBe(true);
    expect(dwg.raison).toMatch(/ne vaut pas pour Studio/);
    expect(STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "renonce")).toEqual([]);
  });

  it("E.6-02 : natif, vues / feuilles, tableaux, rendus et paquets présents et livrés", () => {
    const familles = new Set(livrees.map((e) => e.famille));
    for (const f of ["natif", "dessin", "maquette", "feuille", "dossier", "tableau", "rendu", "paquet"]) expect(familles.has(f as never), f).toBe(true);
  });

  it("sources : référence (chemin du dépôt existant) séparée du commentaire en prose", () => {
    for (const e of STUDIO_MATRICE_ECHANGES.entrees) for (const s of e.sources) {
      const chemin = s.reference.split(",")[0]!.trim();
      expect(existsSync(join(RACINE, chemin)), `${e.id} : ${s.reference}`).toBe(true);
      expect(s.reference, `${e.id} : la référence ne porte pas de prose entre parenthèses`).not.toMatch(/[()]/);
    }
  });

  it("limites DXF : $INSUNITS hors R12, 16 codes reconnus à l'import, calque verrouillé bloquant", () => {
    expect(entree("dessin-dxf").limite).toMatch(/\$INSUNITS n’appartient pas à R12 \(variable introduite avec AC1015\) : l’unité n’est pas garantie chez un lecteur R12 strict/);
    expect(Object.keys(STUDIO_DXF_UNITES)).toHaveLength(16);
    const imp = entree("dessin-dxf-import").limite;
    expect(imp).toContain("16 codes reconnus ; tout autre code, 0 ou absent : unité inconnue");
    expect(imp).toContain("un calque déjà verrouillé dans le document");
    expect(imp).toContain("fait échouer l’import");
  });
});

/** Document qui fait rendre au juge chaque raison déclarée et écrire chaque entité IFC déclarée. */
const complet = (): StudioDocument => ({
  id: "doc-matrice", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  layers: [{ id: "murs", name: "Murs", visible: true, locked: false }],
  objects: [
    { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
    { id: "l2", type: "line", start: { x: 0, y: 1 }, end: { x: 4, y: 1 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } },
    { id: "l3", type: "line", start: { x: 0, y: 3 }, end: { x: 4, y: 3 }, extrusion: { base: 0, height: 2.5 } },
    { id: "r1", type: "rectangle", origin: { x: 1, y: 1 }, width: 2, height: 1 },
    { id: "r2", type: "rectangle", origin: { x: 5, y: 1 }, width: 2, height: 1, extrusion: { base: 0, height: 3 } },
    { id: "c1", type: "circle", center: { x: 8, y: 8 }, radius: 1, extrusion: { base: 0, height: 1 } },
    { id: "c2", type: "circle", center: { x: 12, y: 8 }, radius: 1 },
    { id: "a1", type: "arc", center: { x: 0, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5, extrusion: { base: 0, height: 2, thickness: 0.2 } },
    { id: "a2", type: "arc", center: { x: 5, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5 },
    { id: "a3", type: "arc", center: { x: 10, y: 14 }, radius: 2, startAngle: 0, endAngle: 1.5, extrusion: { base: 0, height: 2 } },
    { id: "p1", type: "polyline", points: [{ x: 20, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 3 }], closed: true, extrusion: { base: 0, height: 1 } },
    { id: "p2", type: "polyline", points: [{ x: 30, y: 0 }, { x: 34, y: 0 }, { x: 34, y: 3 }], closed: false, bulges: [0.5, 0], extrusion: { base: 0, height: 1 } },
    { id: "p3", type: "polyline", points: [{ x: 40, y: 0 }, { x: 44, y: 0 }], closed: false, bulges: [0.3] },
    { id: "p4", type: "polyline", points: [{ x: 50, y: 0 }, { x: 54, y: 0 }], closed: false },
    { id: "p5", type: "polyline", points: [{ x: 70, y: 0 }, { x: 74, y: 0 }, { x: 74, y: 2 }], closed: false, extrusion: { base: 0, height: 1 } },
  ],
  dimensions: [{ id: "d1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: -0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false }],
  annotations: [
    { id: "g1", type: "angular-dimension", vertex: { x: 0, y: 0 }, first: { x: 3, y: 0 }, second: { x: 0, y: 3 }, radius: 1, links: { first: null, second: null }, toResolve: false },
    { id: "t1", type: "text", position: { x: 1, y: 5 }, height: 0.3, rotation: 0, content: "Plan RDC", justification: "left" },
    { id: "t2", type: "text", position: { x: 1, y: 6 }, height: 0.3, rotation: 0, content: "Séjour", justification: "center" },
    { id: "t3", type: "text", position: { x: 1, y: 7 }, height: 0.3, rotation: 0, content: "é".repeat(40), justification: "right" },
    { id: "t4", type: "text", position: { x: 1, y: 8 }, height: 0.3, rotation: 0, content: "Escalier 🪜", justification: "left" },
  ],
  solides: [
    { id: "s1", type: "box", placement: { origin: { x: 50, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 },
    { id: "s2", type: "prism", placement: { origin: { x: 60, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 2 },
  ],
  // Lot F2 : un solide exact (résultat SYNTHÉTIQUE, forme seulement) et ses deux opérandes conservés.
  exacts: [exactSynthetique("e1", [
    { id: "e1a", type: "box", placement: { origin: { x: 80, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 },
    { id: "e1b", type: "box", placement: { origin: { x: 80.5, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 },
  ])],
  architecture: [
    { id: "m1", type: "wall", layerId: "murs", axis: [{ x: 0, y: 20 }, { x: 12, y: 20 }], thickness: 0.2, height: 3, base: 0, justification: "center" },
    { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0, kind: "porte" },
    { id: "o2", type: "opening", hostId: "m1", position: 6, width: 1, height: 1, sill: 1, kind: "fenetre" },
    { id: "o3", type: "opening", hostId: "m1", position: 9.5, width: 1, height: 1, sill: 1 },
  ],
  proprietes: [
    { cibleId: "m1", nom: "Résistance au feu", valeur: "REI 60", source: "Fiche de recette (synthétique)" },
    { cibleId: "m1", nom: "Isolation" },
  ],
  scenes: [
    { id: "sc1", type: "scene", frame: "local-3d", name: "Vue", camera: { projection: "perspective", position: { x: 10, y: -12, z: 8 }, target: { x: 3, y: 1, z: 1.5 }, fov: 45 }, visibleLayers: ["default"], displayMode: "shaded" },
    { id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#c0392b" },
  ],
  nonNatifs: [{ id: "nn1", type: "non-native", origine: { format: "ifc", entite: "IfcColumn" }, raison: "type-sans-equivalent" }],
} as StudioDocument);

describe("E.6-03 : sous-ensemble SVG / DXF / IFC = rapport de fidélité", () => {
  it("mêmes catégories et mêmes types que la table des capacités, pour chaque format", () => {
    for (const f of STUDIO_FORMATS_ECHANGE) {
      const cov = STUDIO_COUVERTURE_EXPORT[f] as unknown as Record<string, Record<string, unknown>>;
      const cap = STUDIO_CAPACITES_EXPORT as unknown as Record<string, Record<string, unknown>>;
      expect(Object.keys(cov).sort(), f).toEqual(Object.keys(cap).sort());
      for (const c of Object.keys(cap)) expect(Object.keys(cov[c]!).sort(), `${f}.${c}`).toEqual(Object.keys(cap[c]!).sort());
    }
  });
  it("chaque raison rendue par le juge est déclarée, chaque raison déclarée est rendue, avec son statut", () => {
    const doc = complet();
    for (const f of STUDIO_FORMATS_ECHANGE) {
      const declare = new Set(studioCouvertureFormat(f).flatMap((c) => c.raisons.map((r) => `${c.categorie}.${c.type}:${r.raison}`)));
      const rapport = studioRapportFidelite(doc, f);
      const observe = new Set(rapport.lignes.map((l) => `${l.categorie}.${l.type}:${l.raison}`));
      for (const l of rapport.lignes) expect(STUDIO_STATUT_DE_RAISON[l.raison], `${f} ${l.raison}`).toBe(l.statut);
      expect([...observe].filter((x) => !declare.has(x)), `${f} : raisons non déclarées`).toEqual([]);
      expect([...declare].filter((x) => !observe.has(x)), `${f} : raisons déclarées jamais rendues`).toEqual([]);
    }
  });
  it("toutes les raisons du rapport ont un statut ; seule « type-sans-capacite » n'est déclarée pour aucun type", () => {
    expect(Object.keys(STUDIO_STATUT_DE_RAISON).sort()).toEqual([...STUDIO_RAISONS_FIDELITE].sort());
    const declarees = new Set(STUDIO_FORMATS_ECHANGE.flatMap((f) => studioCouvertureFormat(f).flatMap((c) => c.raisons.map((r) => r.raison))));
    expect(STUDIO_RAISONS_FIDELITE.filter((r) => !declarees.has(r))).toEqual(["type-sans-capacite"]);
  });
  it("IFC : ligne sans épaisseur et polyligne ouverte droite jugées « surface exacte », pas « extrusion exacte »", () => {
    const r = studioRapportFidelite(complet(), "ifc");
    const ids = (type: string, raison: string) => r.lignes.find((l) => l.type === type && l.raison === raison)?.ids;
    expect(ids("line", "extrusion-exacte")).toEqual(["l2"]);
    expect(ids("line", "surface-exacte")).toEqual(["l3"]);
    expect(ids("polyline", "extrusion-exacte")).toEqual(["p1"]);
    expect(ids("polyline", "surface-exacte")).toEqual(["p5"]);
  });

  it("IFC : les entités et jeux de propriétés déclarés sont exactement ceux que exportStudioIfc écrit", () => {
    const sortie = exportStudioIfc(complet(), { studyName: "Étude", variantName: "Variante", timestamp: "2026-10-19T00:00:00" });
    const lignes = new Map([...sortie.matchAll(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/gm)].map((m) => [m[1]!, { type: m[2]!, args: m[3]! }]));
    const ecritureIfc = entree("maquette-ifc").ecritureIfc!;
    const ecrites = new Set([...lignes.values()].map((l) => l.type));
    const declarees = new Set(ecritureIfc.elements.flatMap((x) => x.entites).map((n) => n.toUpperCase()));
    expect([...ecrites].filter((t) => !declarees.has(t)).sort(), "entités écrites absentes de la matrice").toEqual([]);
    expect([...declarees].filter((t) => !ecrites.has(t)).sort(), "entités déclarées jamais écrites").toEqual([]);
    const jeux = new Set([...lignes.values()].filter((l) => l.type === "IFCPROPERTYSET").map((l) => /^'[^']*',\$,'([^']+)'/.exec(l.args)![1]!));
    expect([...jeux].sort()).toEqual(ecritureIfc.jeuxDeProprietes.map((j) => j.nom).sort());

    // Correspondances déclarées : élément écrit par identifiant Studio, représentation et éléments géométriques.
    const element = (id: string) => [...lignes.values()].find((l) => l.args.startsWith("'") && new RegExp(`^'[^']*',\\$,'${id}',`).test(l.args));
    const representation = (id: string) => {
      const e = element(id)!;
      const forme = /,#(\d+),'[^']*',\.[A-Z]+\.$/.exec(e.args)?.[1];
      if (!forme) return { type: e.type, rep: null as string | null, items: [] as string[] };
      const reps = /\(([^)]*)\)$/.exec(lignes.get(forme)!.args)![1]!.split(",").map((r) => lignes.get(r.slice(1))!);
      const corps = reps.find((r) => r.args.includes("'Body'"))!;
      return { type: e.type, rep: /'Body','(\w+)'/.exec(corps.args)![1]!, items: /\(([^)]*)\)$/.exec(corps.args)![1]!.split(",").map((r) => lignes.get(r.slice(1))!.type) };
    };
    expect(representation("m1")).toEqual({ type: "IFCWALL", rep: "SweptSolid", items: ["IFCEXTRUDEDAREASOLID"] });
    expect(representation("l2")).toEqual({ type: "IFCWALL", rep: "SweptSolid", items: ["IFCEXTRUDEDAREASOLID"] });
    expect(representation("a1")).toMatchObject({ type: "IFCWALL", rep: "SweptSolid" });
    for (const id of ["l3", "a3", "p5"]) expect(representation(id), id).toEqual({ type: "IFCBUILDINGELEMENTPROXY", rep: "Tessellation", items: ["IFCTRIANGULATEDFACESET"] });
    for (const id of ["r2", "c1", "p1", "s1", "s2"]) expect(representation(id), id).toEqual({ type: "IFCBUILDINGELEMENTPROXY", rep: "SweptSolid", items: ["IFCEXTRUDEDAREASOLID"] });
    for (const l of lignes.values()) if (l.type === "IFCBUILDINGELEMENTPROXY" || l.type === "IFCWALL") expect(l.args.endsWith(".NOTDEFINED.")).toBe(true);
    // Porte et fenêtre déclarées : sans représentation propre ; baie sans type : ouverture seule.
    expect(element("o1")!.type).toBe("IFCOPENINGELEMENT");
    for (const [type, id] of [["IFCDOOR", "o1"], ["IFCWINDOW", "o2"]] as const) {
      const r = [...lignes.values()].find((l) => l.type === type && new RegExp(`^'[^']*',\\$,'${id}',\\$,\\$,#\\d+,\\$,`).test(l.args));
      expect(r, `${type} ${id} sans représentation`).toBeTruthy();
    }
    expect([...lignes.values()].filter((l) => l.type === "IFCOPENINGELEMENT")).toHaveLength(3);
    expect([...lignes.values()].filter((l) => l.type === "IFCRELVOIDSELEMENT")).toHaveLength(3);
    expect([...lignes.values()].filter((l) => l.type === "IFCRELFILLSELEMENT")).toHaveLength(2);
    // Les entités nommées dans la limite et les détails sont bien déclarées.
    const textes = [entree("maquette-ifc").limite, ...ecritureIfc.elements.map((x) => x.detail)].join(" ");
    for (const n of textes.match(/\bIfc[A-Z]\w+/g) ?? []) expect(declarees.has(n.toUpperCase()), n).toBe(true);
  });

  it("import DXF : entités déclarées portées, les autres comptées par type", () => {
    const texte = dxf({ insunits: 6, entites: [
      ligne(0, 0, 1, 0),
      "0\r\nCIRCLE\r\n8\r\n0\r\n10\r\n5\r\n20\r\n5\r\n40\r\n1",
      "0\r\nARC\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n40\r\n2\r\n50\r\n0\r\n51\r\n90",
      lwpolyligne([[0, 0], [2, 0], [2, 1], [0, 1]], { ferme: true }),
      lwpolyligne([[10, 0], [12, 0], [12, 2]], { bulges: [0.5, 0] }),
      "0\r\nTEXT\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n40\r\n1\r\n1\r\nA",
      "0\r\nINSERT\r\n8\r\n0\r\n2\r\nB\r\n10\r\n0\r\n20\r\n0",
    ] });
    const r = lireDxfStudio(texte);
    expect(r.statut).toBe("pret");
    const types = new Set(r.commandes.filter((c) => c.toolId !== "studio.calque.creer").map((c) => (c.params as { type?: string }).type));
    for (const t of ["line", "circle", "arc", "rectangle", "polyline"]) expect(types.has(t), t).toBe(true);
    expect(r.rapport.nonPris.map((n) => n.type)).toEqual(["INSERT", "TEXT"]);
    const e = entree("dessin-dxf-import");
    for (const nom of ["LINE", "CIRCLE", "ARC", "LWPOLYLINE / POLYLINE 2D"]) expect(e.entites.find((x) => x.entite === nom)?.couverture).not.toBe("absente");
    expect(e.entites.some((x) => x.couverture === "absente" && x.entite.includes("TEXT") && x.entite.includes("INSERT"))).toBe(true);
    expect(() => lireDxfStudio("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(/binaire/);
  });
});

/** Mots-clés JavaScript et mots trop généraux pour prouver une étape : jamais admis comme motif de preuve. */
const MOTS_CLES_JS = new Set("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of".split(" "));
const MOTS_FAIBLES = new Set(["archive", "png", "csv", "dossiers", "rapport", "releve", "files/", "download", "download=", "commands", "/commands"]);
/** Identifiants importés par un fichier (`import { a, b as c } from`). */
const importes = (contenu: string) => new Set([...contenu.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)].flatMap((m) => m[1]!.split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())).filter(Boolean));
/**
 * Motif discriminant d'une preuve de test ou d'interface : au moins 12 caractères, ni mot-clé JS ni mot générique, et
 * soit unique dans le fichier (il ne désigne qu'une étape), soit identifiant importé par le fichier (le test exerce ce
 * symbole). Rend la raison du refus, ou null.
 */
function nonDiscriminant(x: StudioPreuveEchange, contenu: string): string | null {
  const m = x.motif.trim();
  if (m.length < 12) return "trop court";
  if (MOTS_CLES_JS.has(m) || MOTS_FAIBLES.has(m.toLowerCase())) return "mot générique";
  const n = contenu.split(x.motif).length - 1;
  if (n === 1) return null;
  if (/^\w+$/.test(m) && importes(contenu).has(m)) return null;
  return `${n} occurrence(s) : ni unique, ni identifiant importé`;
}

describe("Matrice et code réel : relecture du dépôt", () => {
  it("chaque preuve citée existe : symbole exporté (code), motif présent (test, route, interface)", () => {
    for (const e of livrees) {
      for (const x of preuves(e)) expect(existsSync(join(RACINE, x.fichier)), `${e.id} : ${x.fichier}`).toBe(true);
      for (const x of e.preuves!.code) {
        const motif = new RegExp(`^export (?:async )?(?:function|const|class) ${echapper(x.motif)}\\b`, "m");
        expect(motif.test(lire(x.fichier)), `${e.id} : ${x.motif} exporté par ${x.fichier}`).toBe(true);
      }
      for (const x of [...e.preuves!.tests, ...(e.preuves!.routes ?? []), ...(e.preuves!.interfaces ?? [])]) {
        expect(lire(x.fichier).includes(x.motif), `${e.id} : « ${x.motif} » dans ${x.fichier}`).toBe(true);
      }
      for (const t of e.preuves!.tests) expect(/\.test\.tsx?$|e2e\/.*\.mjs$|test-corpus\/|\.github\/workflows\//.test(t.fichier), `${e.id} : ${t.fichier} n'est pas un test`).toBe(true);
    }
  });

  it("preuves de test et d'interface discriminantes (ni triviales, ni ambiguës) ; routes ni triviales ni génériques", () => {
    const refus: string[] = [];
    for (const e of livrees) {
      for (const x of [...e.preuves!.tests, ...(e.preuves!.interfaces ?? [])]) {
        const r = nonDiscriminant(x, lire(x.fichier));
        if (r) refus.push(`${e.id} : « ${x.motif} » dans ${x.fichier} — ${r}`);
      }
      for (const x of e.preuves!.routes ?? []) if (x.motif.trim().length < 8 || MOTS_FAIBLES.has(x.motif.toLowerCase())) refus.push(`${e.id} : route « ${x.motif} »`);
    }
    expect(refus).toEqual([]);
    // Les motifs faibles relevés en revue sont refusés.
    const studioDossier = lire("apps/web/e2e/studio-dossier.mjs");
    for (const motif of ["import", "archive", "png", "CSV", "dossiers", "rapport", "releve", "files/", "files/pdf"]) {
      expect(nonDiscriminant({ fichier: "", motif }, studioDossier), motif).not.toBeNull();
    }
  });

  it("aucun écrivain ni lecteur du modèle Studio sans entrée (façades de studio/)", () => {
    const facades = ["export.ts", "ifc.ts", "feuille.ts", "dossier-conception.ts", "import-dxf.ts", "mesh-3d.ts"].map((f) => `packages/atelier-model/src/studio/${f}`);
    const ecrivains = facades.flatMap((f) => fonctionsExportees(lire(f)).filter((n) => /^(export\w+|lire\w+|pdf\w+|\w+(Svg|Pdf|Dxf|Ifc|Csv|Png|Step|Obj|Stl|Gltf))$/.test(n)).map((n) => `${f}#${n}`));
    expect(ecrivains.length).toBeGreaterThan(5);
    const connus = new Set(cites("code").map((x) => `${x.fichier}#${x.motif}`));
    expect(ecrivains.filter((x) => !connus.has(x))).toEqual([]);
  });

  it("aucun fichier servi par l'API Studio sans entrée (bibliothèques et routes)", () => {
    const libs = fichiers("apps/api/src/lib", (f) => /\/studio-[^/]*\.ts$/.test(f) && sourcesNonTest(f));
    const ecrivains = libs.flatMap((f) => fonctionsExportees(lire(f)).filter((n) => /^(export\w+|import\w+Archive|read\w+File|\w+PackageFiles)$/.test(n)).map((n) => `${f}#${n}`));
    const connus = new Set(cites("code").map((x) => `${x.fichier}#${x.motif}`));
    expect(ecrivains.filter((x) => !connus.has(x))).toEqual([]);
    // Routes : toute route Studio qui sert un fichier ou un export (chemin contenant « export » ou « /files/ »).
    const routes = fichiers("apps/api/src/routes", (f) => /\/studio[^/]*\.ts$/.test(f) && sourcesNonTest(f));
    const servies = routes.flatMap((f) => [...lire(f).matchAll(/Router\.(?:get|post)\(\s*(["`])([^"`]+)\1/g)].map((m) => ({ fichier: f, chemin: m[2]! })))
      .filter((r) => /export|\/files\//.test(r.chemin));
    expect(servies.length).toBeGreaterThanOrEqual(5);
    const routesCitees = cites("routes");
    for (const r of servies) expect(routesCitees.some((x) => x.fichier === r.fichier && x.motif === r.chemin), `${r.fichier} ${r.chemin}`).toBe(true);
    // Formats d'export des variantes : exactement les entrées liées au rapport de fidélité.
    const formats = /STUDIO_EXPORT_FORMATS = \[([^\]]+)\]/.exec(lire("apps/api/src/lib/studio-commands.ts"))![1]!.match(/"(\w+)"/g)!.map((s) => s.slice(1, -1));
    expect(formats.sort()).toEqual(livrees.filter((e) => e.fidelite && e.sens === "export").map((e) => e.fidelite).sort());
  });

  it("aucun téléchargement de l'interface Studio sans entrée (attribut JSX `download` nu ou valué, propriété `.download`)", () => {
    /** Attribut JSX `download` (nu, `download=`, en fin de balise) ou affectation `x.download = …`. */
    const TELECHARGEMENT = /\sdownload(?=[\s=>/])|\.download\s*=/;
    expect(TELECHARGEMENT.test('<a href={u} download data-x>')).toBe(true);
    expect(TELECHARGEMENT.test('<a href={u}\n  download\n>')).toBe(true);
    expect(TELECHARGEMENT.test('<a download={nom}>')).toBe(true);
    expect(TELECHARGEMENT.test('link.hasAttribute("download")')).toBe(false);
    expect(TELECHARGEMENT.test('<a data-download-x>')).toBe(false);
    // La Planche de Sandbox est un module à part (apps/web/src/modules/sandbox, lot 1) : hors du dossier lu ici.
    const pages = fichiers("apps/web/src/modules/studio", (f) => sourcesNonTest(f)).filter((f) => TELECHARGEMENT.test(lire(f)));
    expect(pages).toContain("apps/web/src/modules/studio/dossier/PanneauDossier.tsx");
    expect(pages.length).toBeGreaterThanOrEqual(7);
    const citees = new Set(cites("interfaces").map((x) => x.fichier));
    expect(pages.filter((f) => !citees.has(f))).toEqual([]);
    // Feuilles composées et dossier : téléchargés depuis le panneau du dossier.
    for (const id of ["feuille-composee-svg", "feuille-composee-pdf", "dossier-pdf", "dossier-json"]) {
      expect(entree(id).preuves!.interfaces?.some((x) => x.fichier.endsWith("dossier/PanneauDossier.tsx")), id).toBe(true);
    }
  });

  it(`document généré à jour (${DOC_MD})`, () => {
    const attendu = studioMatriceEchangesMarkdown();
    if (process.env.STUDIO_MATRICE_ECRIRE === "1") {
      mkdirSync(dirname(join(RACINE, DOC_MD)), { recursive: true });
      writeFileSync(join(RACINE, DOC_MD), attendu);
    }
    expect(lire(DOC_MD), "document périmé : STUDIO_MATRICE_ECRIRE=1 npx vitest run matrice-echanges").toBe(attendu);
  });
});
