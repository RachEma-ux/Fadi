import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StudioDocument } from "../document-2d.js";
import { lireDxfStudio } from "../import-dxf.js";
import { dxf, ligne, lwpolyligne } from "../import-dxf.fixtures.js";
import {
  controlerMatriceEchanges, STUDIO_COUVERTURE_EXPORT, STUDIO_MATRICE_ECHANGES, STUDIO_STATUT_DE_RAISON, studioCouvertureFormat, studioMatriceEchangesMarkdown,
  type StudioEntreeEchange,
} from "./matrice-echanges.js";
import { STUDIO_CAPACITES_EXPORT, STUDIO_FORMATS_ECHANGE, STUDIO_RAISONS_FIDELITE, studioRapportFidelite } from "./rapport-fidelite.js";

/**
 * Matrice d'échanges (E.6-01 à E.6-05) : cohérence interne, recoupement avec le rapport de fidélité, et relecture du
 * dépôt — chaque preuve citée existe, chaque écrivain, route de fichier et téléchargement Studio a son entrée.
 * Document généré : `STUDIO_MATRICE_ECRIRE=1 npx vitest run matrice-echanges` le réécrit (changement délibéré).
 */

const RACINE = fileURLToPath(new URL("../../../../../", import.meta.url));
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");
const DOC_MD = "docs/ai-team/reports/claude-v9-e6/MATRICE-ECHANGES.md";
const livrees = STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "livre");
const preuves = (e: StudioEntreeEchange) => [...(e.preuves?.code ?? []), ...(e.preuves?.tests ?? []), ...(e.preuves?.routes ?? []), ...(e.preuves?.interfaces ?? [])];
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  it("le contrôle relève une conformité déclarée, un livré sans test, un report sans raison, un renoncé sans décision", () => {
    const base = livrees[0]!;
    const m = (entrees: StudioEntreeEchange[]) => ({ ...STUDIO_MATRICE_ECHANGES, entrees: [...STUDIO_MATRICE_ECHANGES.entrees, ...entrees] });
    expect(controlerMatriceEchanges(m([{ ...base, id: "x1", limite: "Fichier conforme à la norme." }]))).toContain("x1 : conformité déclarée");
    expect(controlerMatriceEchanges(m([{ ...base, id: "x2", preuves: { code: base.preuves!.code, tests: [] } }]))).toContain("x2 : entrée livrée sans code ou sans test");
    const report = STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.statut === "non-livre")!;
    expect(controlerMatriceEchanges(m([{ ...report, id: "x3", raison: "" }]))).toContain("x3 : report sans raison");
    expect(controlerMatriceEchanges(m([{ ...report, id: "x4", statut: "renonce", sources: ["Plan"] }]))).toContain("x4 : renoncé sans décision citée");
  });

  it("E.6-04 / E.6-05 : DWG, DGN, BCF, STEP, OBJ, STL inscrits dans les deux sens, glTF en export, jamais livrés ni conformes", () => {
    for (const id of ["dwg", "dgn", "bcf", "step", "obj", "stl"]) for (const sens of ["import", "export"]) {
      const e = STUDIO_MATRICE_ECHANGES.entrees.find((x) => x.id === `${id}-${sens}`);
      expect(e?.statut, `${id}-${sens}`).toBe("non-livre");
      expect(e?.raison).toBeTruthy();
      expect(e?.preuves).toBeUndefined();
    }
    expect(STUDIO_MATRICE_ECHANGES.entrees.find((x) => x.id === "gltf-export")?.statut).toBe("non-livre");
    // D-179 (Atelier) est citée, jamais prise pour une renonciation Studio.
    const dwg = STUDIO_MATRICE_ECHANGES.entrees.find((x) => x.id === "dwg-export")!;
    expect(dwg.sources.some((s) => s.includes("D-179"))).toBe(true);
    expect(dwg.raison).toMatch(/ne vaut pas pour Studio/);
    expect(STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "renonce")).toEqual([]);
  });

  it("E.6-02 : natif, vues / feuilles, tableaux, rendus et paquets présents et livrés", () => {
    const familles = new Set(livrees.map((e) => e.famille));
    for (const f of ["natif", "dessin", "maquette", "feuille", "dossier", "tableau", "rendu", "paquet"]) expect(familles.has(f as never), f).toBe(true);
  });
});

/** Document qui fait rendre au juge chaque raison déclarée (formes extrudées ou non, textes, propriétés, scènes). */
const complet = (): StudioDocument => ({
  id: "doc-matrice", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  layers: [{ id: "murs", name: "Murs", visible: true, locked: false }],
  objects: [
    { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
    { id: "l2", type: "line", start: { x: 0, y: 1 }, end: { x: 4, y: 1 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } },
    { id: "r1", type: "rectangle", origin: { x: 1, y: 1 }, width: 2, height: 1 },
    { id: "r2", type: "rectangle", origin: { x: 5, y: 1 }, width: 2, height: 1, extrusion: { base: 0, height: 3 } },
    { id: "c1", type: "circle", center: { x: 8, y: 8 }, radius: 1, extrusion: { base: 0, height: 1 } },
    { id: "c2", type: "circle", center: { x: 12, y: 8 }, radius: 1 },
    { id: "a1", type: "arc", center: { x: 0, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5, extrusion: { base: 0, height: 2, thickness: 0.2 } },
    { id: "a2", type: "arc", center: { x: 5, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5 },
    { id: "p1", type: "polyline", points: [{ x: 20, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 3 }], closed: true, extrusion: { base: 0, height: 1 } },
    { id: "p2", type: "polyline", points: [{ x: 30, y: 0 }, { x: 34, y: 0 }, { x: 34, y: 3 }], closed: false, bulges: [0.5, 0], extrusion: { base: 0, height: 1 } },
    { id: "p3", type: "polyline", points: [{ x: 40, y: 0 }, { x: 44, y: 0 }], closed: false, bulges: [0.3] },
    { id: "p4", type: "polyline", points: [{ x: 50, y: 0 }, { x: 54, y: 0 }], closed: false },
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
  architecture: [
    { id: "m1", type: "wall", layerId: "murs", axis: [{ x: 0, y: 20 }, { x: 6, y: 20 }], thickness: 0.2, height: 3, base: 0, justification: "center" },
    { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0, kind: "porte" },
  ],
  proprietes: [
    { cibleId: "m1", nom: "Résistance au feu", valeur: "REI 60", source: "Fiche de recette (synthétique)" },
    { cibleId: "m1", nom: "Isolation" },
  ],
  scenes: [
    { id: "sc1", type: "scene", frame: "local-3d", name: "Vue", camera: { projection: "perspective", position: { x: 10, y: -12, z: 8 }, target: { x: 3, y: 1, z: 1.5 }, fov: 45 }, visibleLayers: ["default"], displayMode: "shaded" },
    { id: "ap1", type: "appearance", target: { kind: "object", id: "m1" }, color: "#c0392b" },
  ],
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
    const entree = STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.id === "dessin-dxf-import")!;
    for (const nom of ["LINE", "CIRCLE", "ARC", "LWPOLYLINE / POLYLINE 2D"]) expect(entree.entites.find((x) => x.entite === nom)?.couverture).not.toBe("absente");
    expect(entree.entites.some((x) => x.couverture === "absente" && x.entite.includes("TEXT") && x.entite.includes("INSERT"))).toBe(true);
    expect(() => lireDxfStudio("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(/binaire/);
  });
});

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

  it("aucun téléchargement de l'interface Studio sans entrée", () => {
    const pages = fichiers("apps/web/src/modules/studio", sourcesNonTest).filter((f) => /\bdownload\s*=|\.download\s*=/.test(lire(f)));
    expect(pages.length).toBeGreaterThanOrEqual(5);
    const citees = new Set(cites("interfaces").map((x) => x.fichier));
    expect(pages.filter((f) => !citees.has(f))).toEqual([]);
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
