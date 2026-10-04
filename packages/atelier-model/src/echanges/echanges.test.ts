import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { importerModeleNatif, type JeuNatif } from "../import/natif.js";
import { modeleVide, objetsDeClasse, type ModeleAtelier, type Occurrence } from "../modele.js";
import { maillageObjet } from "../projection/maillage.js";
import { genererVue } from "../documents/vues.js";
import { chaineStep, exporterIfc, guidIfc, reelStep } from "./ifc.js";
import { commandesImportIfc, compacterMaillage, enveloppeConvexe, type LectureIfc, type ProduitIfcLu } from "./import-ifc.js";
import { commandesImportDxf } from "./import-dxf.js";

const JEU = JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif;
const P118 = importerModeleNatif(JEU).modele;
const OPTIONS = { projet: { id: "p-118", nom: "P.118 — Escalier B et mezzanine", code: "P118" }, revision: 1, horodatage: "2026-10-04T08:00:00" };

const appliquer = (etat: ModeleAtelier, lots: { label: string; commands: Commande[] }[]) =>
  lots.reduce((e, l, i) => appliquerLot(e, { requestId: `r${i}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label: l.label, commands: l.commands }).etat, etat);

/** Cube unité posé à (x, y, z) dans le repère du fichier. */
function cube(globalId: string, x: number, y: number, z: number, etage: string | null, classe = "IfcWall"): ProduitIfcLu {
  const p = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1].map((v, i) => v + [x, y, z][i % 3]!);
  const q = (a: number, b: number, c: number, d: number) => [a, b, c, a, c, d];
  return { globalId, classe, nom: `Cube ${globalId}`, type: null, etageGlobalId: etage, maillage: { positions: p, indices: [...q(0, 3, 2, 1), ...q(4, 5, 6, 7), ...q(0, 1, 5, 4), ...q(1, 2, 6, 5), ...q(2, 3, 7, 6), ...q(3, 0, 4, 7)] } };
}

describe("écriture STEP", () => {
  it("chaînes : apostrophes et barres obliques doublées, hors ASCII en \\X2\\ ; réels avec point décimal", () => {
    expect(chaineStep("l'étage \\ R+1")).toBe("'l''\\X2\\00E9\\X0\\tage \\\\ R+1'");
    expect(chaineStep("😀")).toBe("'\\X2\\D83DDE00\\X0\\'");
    expect(reelStep(3)).toBe("3.");
    expect(reelStep(-0)).toBe("0.");
    expect(reelStep(0.1 + 0.2)).toBe("0.3");
    expect(reelStep(1e-7)).toBe("1.E-7");
  });

  it("GlobalId : 22 caractères de l'alphabet IFC, premier caractère 0–3, déterministe et distinct", () => {
    const a = guidIfc("p|mur-1");
    expect(a).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(guidIfc("p|mur-1")).toBe(a);
    expect(guidIfc("p|mur-2")).not.toBe(a);
  });
});

describe("export IFC 4.3 du P.118", () => {
  const { contenu, rapport } = exporterIfc(P118, OPTIONS);

  it("en-tête IFC4X3_ADD2, projet, site, bâtiment, un étage par niveau, conversion cartographique depuis le CRS de la parcelle", () => {
    expect(contenu.startsWith("ISO-10303-21;\nHEADER;")).toBe(true);
    expect(contenu).toContain("FILE_SCHEMA(('IFC4X3_ADD2'));");
    expect(contenu.endsWith("END-ISO-10303-21;\n")).toBe(true);
    expect(contenu.match(/=IFCBUILDINGSTOREY\(/g)?.length).toBe(Object.keys(P118.niveaux).length);
    const parcelle = P118.site.parcelle!;
    expect(contenu).toContain(`IFCPROJECTEDCRS('${parcelle.crs}'`);
    expect(contenu).toMatch(new RegExp(`IFCMAPCONVERSION\\(#\\d+,#\\d+,${reelStep(parcelle.origineLocale.x).replace(".", "\\.")},${reelStep(parcelle.origineLocale.y).replace(".", "\\.")},0\\.,1\\.,0\\.,1\\.\\)`));
    expect(rapport.remarques.some((r) => r.includes("hauteur orthogonale 0"))).toBe(true);
  });

  it("rapport : chaque mur, porte, fenêtre, dalle et pièce exporté ; références de plan omises et déclarées", () => {
    const ligne = (c: string) => rapport.classes.find((l) => l.classe === c);
    for (const c of ["mur", "porte", "fenetre", "dalle", "piece"] as const) {
      const n = objetsDeClasse(P118, c).length;
      if (!n) continue;
      expect(ligne(c)).toMatchObject({ source: n, cible: n });
    }
    expect(contenu.match(/=IFCWALL\(/g)?.length).toBe(objetsDeClasse(P118, "mur").length);
    expect(contenu.match(/=IFCSPACE\(/g)?.length).toBe(objetsDeClasse(P118, "piece").length + objetsDeClasse(P118, "espace").length);
    const refs = objetsDeClasse(P118, "reference-plan").length;
    if (refs) expect(ligne("reference-plan")).toMatchObject({ source: refs, cible: 0 });
  });

  it("reproductible : mêmes octets à la même révision ; seul l'en-tête change avec l'horodatage ; GlobalId stables", () => {
    expect(exporterIfc(P118, OPTIONS).contenu).toBe(contenu);
    const autre = exporterIfc(P118, { ...OPTIONS, horodatage: "2026-10-05T08:00:00" }).contenu;
    const corps = (t: string) => t.slice(t.indexOf("DATA;"));
    expect(corps(autre)).toBe(corps(contenu));
    expect(autre).not.toBe(contenu);
    const gids = [...contenu.matchAll(/=IFC[A-Z]+\('([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
    expect(new Set(gids).size).toBe(gids.length);
  });
});

describe("import IFC (représentations importées)", () => {
  const base = (): ModeleAtelier => appliquerLot(modeleVide(), { requestId: "n", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "n", commands: [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } }] }).etat;
  const lecture = (produits: ProduitIfcLu[], conversion: LectureIfc["conversion"] = null): LectureIfc => ({
    schema: "IFC4X3_ADD2",
    application: "Test",
    etages: [
      { globalId: "E0", nom: "Rez", elevation: 0.004 },
      { globalId: "E1", nom: "Étage", elevation: 3 },
    ],
    produits,
    conversion,
    ignores: [{ classe: "IfcOpeningElement", nombre: 2, raison: "vides" }],
  });

  it("étage à ± 5 mm = niveau existant ; sinon niveau « IFC · nom » ; z relatif au niveau ; emprise convexe ; classe et GlobalId conservés", () => {
    const r = commandesImportIfc(base(), lecture([cube("A", 1, 1, 0, "E0"), cube("B", 2, 2, 3, "E1", "IfcColumn")]), { source: "test.ifc" });
    const e = appliquer(base(), r.lots);
    const niveaux = Object.values(e.niveaux).map((n) => [n.nom, n.elevation]);
    expect(niveaux).toEqual([["RDC", 0], ["IFC · Étage", 3]]);
    const a = e.objets["ifc-A"] as Occurrence<"objet-importe">;
    const b = e.objets["ifc-B"] as Occurrence<"objet-importe">;
    expect(a).toMatchObject({ classe: "objet-importe", niveauId: "rdc", params: { ifcClasse: "IfcWall", globalId: "A", source: "test.ifc" } });
    expect(b.params.ifcClasse).toBe("IfcColumn");
    expect(Math.min(...b.params.maillage.positions.filter((_, i) => i % 3 === 2))).toBe(0);
    expect(b.params.maillage.positions.length).toBe(24);
    expect(b.params.empreinte).toHaveLength(4);
    // 3D : remis à l'altitude du niveau.
    const mm = maillageObjet(e, b)!;
    expect(Math.min(...mm.positions.filter((_, i) => i % 3 === 2))).toBe(3);
    expect(a.groupeId).toBe(b.groupeId ?? a.groupeId);
    expect(r.rapport).toMatchObject({ sens: "import", format: "IFC4X3_ADD2" });
    expect(r.rapport.classes.find((l) => l.classe === "IfcOpeningElement")).toMatchObject({ source: 2, cible: 0 });
    // Un second import du même fichier : rien n'est dupliqué.
    const r2 = commandesImportIfc(e, lecture([cube("A", 1, 1, 0, "E0")]), { source: "test.ifc" });
    expect(r2.lots.flatMap((l) => l.commands).filter((c) => c.type === "objetImporte.creer")).toHaveLength(0);
    expect(r2.rapport.classes.find((l) => l.classe === "IfcWall")!.remarques[0]).toMatch(/déjà présent/);
  });

  it("repère : même CRS → translation explicite vers le repère local ; CRS différent → gardé tel quel et déclaré", () => {
    const etat = { ...base(), site: { ...P118.site } };
    const o = P118.site.parcelle!.origineLocale;
    const conv = { crs: P118.site.parcelle!.crs, est: o.x + 10, nord: o.y - 5, hauteur: 0, axeX: [1, 0] as [number, number], echelle: 1 };
    const r = commandesImportIfc(etat, lecture([cube("A", 0, 0, 0, "E0")], conv), { source: "t.ifc" });
    const e = appliquer(etat, r.lots);
    const a = e.objets["ifc-A"] as Occurrence<"objet-importe">;
    expect(a.params.maillage.positions.slice(0, 3)).toEqual([10, -5, 0]);
    expect(r.rapport.remarques.some((t) => t.includes("conversion explicite"))).toBe(true);
    const r2 = commandesImportIfc(etat, lecture([cube("A", 0, 0, 0, "E0")], { ...conv, crs: "EPSG:2154" }), { source: "t.ifc" });
    const e2 = appliquer(etat, r2.lots);
    expect((e2.objets["ifc-A"] as Occurrence<"objet-importe">).params.maillage.positions.slice(0, 3)).toEqual([0, 0, 0]);
    expect(r2.rapport.remarques.some((t) => t.includes("différent") && t.includes("à recaler"))).toBe(true);
  });

  it("lots bornés (≤ 500 commandes) ; un espace importé n'est pas de la matière dans les vues ; réexport avec le GlobalId d'origine", () => {
    const produits = Array.from({ length: 30 }, (_, i) => cube(`G${String(i).padStart(2, "0")}`, i * 2, 0, 0, "E0"));
    produits.push(cube("S", 0, 5, 0, "E0", "IfcSpace"));
    const r = commandesImportIfc(base(), lecture(produits), { source: "x.ifc", tailleLot: 7 });
    expect(r.lots.every((l) => l.commands.length <= 7)).toBe(true);
    const e = appliquer(base(), r.lots);
    expect(objetsDeClasse(e, "objet-importe")).toHaveLength(31);
    const v = genererVue(e, { type: "plan", titre: "P", echelle: 100, niveauId: "rdc", hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null });
    expect(v.primitives.some((p) => p.objetId === "ifc-G00")).toBe(true);
    expect(v.primitives.some((p) => p.objetId === "ifc-S")).toBe(false);
    const { contenu, rapport } = exporterIfc(e, OPTIONS);
    expect(contenu).toContain("IFCBUILDINGELEMENTPROXY('G00',");
    expect(contenu).toContain("'IfcSpace'");
    expect(rapport.classes.find((l) => l.classe === "objet-importe")).toMatchObject({ source: 31, cible: 31 });
    // R16 : paramètres d'une représentation importée non modifiables.
    expect(() => appliquerLot(e, { requestId: "m", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "m", commands: [{ type: "objet.modifier", params: { id: "ifc-G00", params: { nom: "x" } } }] })).toThrow(/représentation importée/);
    // Déplacer un objet importé déplace son maillage et son emprise.
    const d = appliquerLot(e, { requestId: "d", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "d", commands: [{ type: "transformer.deplacer", params: { cibles: ["ifc-G00"], dx: 1, dy: 1 } }] }).etat;
    expect((d.objets["ifc-G00"] as Occurrence<"objet-importe">).params.maillage.positions.slice(0, 2)).toEqual([1, 1]);
  });

  it("outils : enveloppe convexe, compactage des sommets confondus et des triangles dégénérés", () => {
    expect(enveloppeConvexe([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]);
    const c = compacterMaillage([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0], [0, 1, 2, 3, 4, 5, 0, 3, 1]);
    expect(c.positions).toHaveLength(12);
    expect(c.indices).toEqual([0, 1, 2, 0, 2, 3]);
  });
});

describe("import DXF 2D", () => {
  const dxf = (insunits: number | null, entites: string) =>
    ["0", "SECTION", "2", "HEADER", ...(insunits === null ? [] : ["9", "$INSUNITS", "70", String(insunits)]), "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", entites, "0", "ENDSEC", "0", "EOF"].join("\n");
  const ENTITES = [
    "0\nLINE\n8\nMurs\n10\n0\n20\n0\n11\n4000\n21\n0",
    "0\nLWPOLYLINE\n8\nMurs\n90\n4\n70\n1\n10\n0\n20\n0\n10\n1000\n20\n0\n42\n1\n10\n1000\n20\n1000\n10\n0\n20\n1000",
    "0\nCIRCLE\n8\nMobilier\n10\n500\n20\n500\n40\n250",
    "0\nARC\n8\nMobilier\n10\n0\n20\n0\n40\n1000\n50\n0\n51\n90",
    "0\nTEXT\n8\nTextes\n10\n100\n20\n200\n40\n250\n1\nSéjour %%c 30",
    "0\nINSERT\n8\n0\n2\nBLOC\n10\n0\n20\n0",
  ].join("\n");
  const base = (): ModeleAtelier => ({ ...appliquerLot(modeleVide(), { requestId: "n", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "n", commands: [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } }] }).etat, site: { ...P118.site } });

  it("blocs (INSERT) décomposés : point de base, rotation, échelle, réseau, imbrication, calque 0 ; XREF signalé ; hachures et cotes", () => {
    const blocs = [
      "0\nSECTION\n2\nBLOCKS",
      // Bloc « TABLE » : base (1 ; 1), un carré 2 × 2 sur le calque 0 et un cercle de rayon 0,5.
      "0\nBLOCK\n8\n0\n2\nTABLE\n70\n0\n10\n1\n20\n1",
      "0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1\n10\n1\n20\n1\n10\n3\n20\n1\n10\n3\n20\n3\n10\n1\n20\n3",
      "0\nCIRCLE\n8\nMobilier\n10\n2\n20\n2\n40\n0.5",
      "0\nENDBLK\n8\n0",
      // Bloc « SALLE » : deux TABLE, la seconde décalée de 5.
      "0\nBLOCK\n8\n0\n2\nSALLE\n70\n0\n10\n0\n20\n0",
      "0\nINSERT\n8\n0\n2\nTABLE\n10\n0\n20\n0",
      "0\nINSERT\n8\n0\n2\nTABLE\n10\n5\n20\n0",
      "0\nENDBLK\n8\n0",
      "0\nBLOCK\n8\n0\n2\nVOISIN\n70\n4\n1\nvoisin.dwg\n10\n0\n20\n0",
      "0\nENDBLK\n8\n0",
      "0\nENDSEC",
    ].join("\n");
    const entites = [
      // TABLE en (10 ; 10), tournée de 90°, échelle 2 : le carré 4 × 4 de (6 ; 10) à (10 ; 14).
      "0\nINSERT\n8\nMobilier\n2\nTABLE\n10\n10\n20\n10\n41\n2\n42\n2\n50\n90",
      // Réseau 3 colonnes au pas 4 de TABLE, en (0 ; 20).
      "0\nINSERT\n8\nMobilier\n2\nTABLE\n10\n0\n20\n20\n70\n3\n44\n4",
      // SALLE (imbriquée) en miroir (échelle x −1) : les cercles deviennent des polygones.
      "0\nINSERT\n8\nSalle\n2\nSALLE\n10\n0\n20\n40\n41\n-1",
      "0\nINSERT\n8\n0\n2\nVOISIN\n10\n0\n20\n0",
      "0\nATTRIB\n8\nTextes\n10\n10\n20\n9\n1\nT-01",
      // Hachure : contour polyligne 10 × 10 avec un îlot 2 × 2.
      "0\nHATCH\n8\nSols\n2\nANSI31\n70\n0\n91\n2\n92\n2\n72\n0\n73\n1\n93\n4\n10\n50\n20\n0\n10\n60\n20\n0\n10\n60\n20\n10\n10\n50\n20\n10\n92\n2\n72\n0\n73\n1\n93\n4\n10\n54\n20\n4\n10\n56\n20\n4\n10\n56\n20\n6\n10\n54\n20\n6",
      // Hachure pleine par arêtes (segments).
      "0\nHATCH\n8\nSols\n2\nSOLID\n70\n1\n91\n1\n92\n1\n93\n3\n72\n1\n10\n70\n20\n0\n11\n74\n21\n0\n72\n1\n10\n74\n20\n0\n11\n74\n21\n3\n72\n1\n10\n74\n20\n3\n11\n70\n21\n0",
      // Cote alignée de (0 ; -5) à (4 ; -5), ligne de cote en y = -6 ; cote orientée horizontale de (0 ; -8) à (3 ; -12).
      "0\nDIMENSION\n8\nCotes\n70\n33\n10\n0\n20\n-6\n13\n0\n23\n-5\n14\n4\n24\n-5",
      "0\nDIMENSION\n8\nCotes\n70\n32\n50\n0\n10\n0\n20\n-14\n13\n0\n23\n-8\n14\n3\n24\n-12\n1\n3 m",
      "0\nDIMENSION\n8\nCotes\n70\n34\n10\n0\n20\n0",
    ].join("\n");
    const texte = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", blocs, "0", "SECTION", "2", "ENTITIES", entites, "0", "ENDSEC", "0", "EOF"].join("\n");
    const r = commandesImportDxf(base(), texte, { source: "blocs.dxf", niveauId: "rdc", repere: "local", uniteSiAbsente: "m" });
    const e = appliquer(base(), r.lots);
    const esq = objetsDeClasse(e, "esquisse");
    // Carré tourné et agrandi : sommets (10 ; 10), (10 ; 14), (6 ; 14), (6 ; 10) au calque de l'insertion.
    const carre = esq.find((o) => o.params.forme === "polygone" && o.params.points.some((p) => Math.abs(p.x - 6) < 1e-6 && Math.abs(p.y - 14) < 1e-6))!;
    expect(carre).toBeTruthy();
    expect(e.calques[carre.calqueId!]!.nom).toBe("DXF · Mobilier");
    const cercles = esq.filter((o) => o.params.forme === "cercle");
    expect(cercles.some((c) => Math.abs(c.params.centre!.x - 8) < 1e-6 && Math.abs(c.params.centre!.y - 12) < 1e-6 && c.params.rayon!.value === 1)).toBe(true);
    // Réseau : trois carrés en y = 20, aux x 0, 4, 8.
    expect(esq.filter((o) => o.params.forme === "polygone" && o.params.points.some((p) => Math.abs(p.y - 20) < 1e-6) && o.params.points.length === 4)).toHaveLength(3);
    // Miroir imbriqué : deux tables, cercles discrétisés, carrés en x négatifs.
    expect(esq.filter((o) => o.params.points.some((p) => p.y > 39 && p.x < -4.9)).length).toBeGreaterThan(0);
    expect(r.rapport.entites.find((x) => x.type === "CIRCLE")?.remarque).toMatch(/miroir/);
    expect(r.rapport.entites.find((x) => x.type === "INSERT")).toMatchObject({ lues: 6, importees: 5 }); // dont les deux tables imbriquées dans SALLE
    expect(r.rapport.entites.find((x) => x.type === "INSERT")?.remarque).toMatch(/décomposé/);
    expect(r.rapport.remarques.some((x) => /XREF « voisin\.dwg »/.test(x))).toBe(true);
    expect(objetsDeClasse(e, "texte").map((t) => t.params.texte)).toContain("T-01");
    const hachures = esq.filter((o) => o.params.forme === "hachure");
    expect(hachures).toHaveLength(2);
    expect(hachures.map((h) => h.params.motif).sort()).toEqual(["ANSI31", "plein"]);
    expect(r.rapport.entites.find((x) => x.type === "HATCH")?.remarque).toMatch(/1 îlot/);
    const cotes = objetsDeClasse(e, "cotation");
    expect(cotes).toHaveLength(2);
    const alignee = cotes.find((c) => c.params.a.y === -5)!;
    expect(alignee.params.b).toMatchObject({ x: 4, y: -5 });
    expect(Math.abs(alignee.params.decalage.value)).toBeCloseTo(1, 6);
    const orientee = cotes.find((c) => c.params.a.y === -8)!;
    expect(orientee.params.b).toMatchObject({ x: 3, y: -8 });
    expect(r.rapport.entites.find((x) => x.type === "DIMENSION")).toMatchObject({ lues: 3, importees: 2 });
    expect(r.rapport.remarques.some((x) => /4 insertion/.test(x) || /insertion\(s\) de bloc/.test(x))).toBe(true);
  });

  it("unités du fichier ($INSUNITS 4 = mm), un calque par calque DXF, groupe ; INSERT signalé, jamais deviné", () => {
    const r = commandesImportDxf(base(), dxf(4, ENTITES), { source: "plan.dxf", niveauId: "rdc", repere: "local", uniteSiAbsente: "m" });
    const e = appliquer(base(), r.lots);
    const esq = objetsDeClasse(e, "esquisse");
    expect(esq.map((o) => o.params.forme).sort()).toEqual(["arc", "cercle", "ligne", "polygone"]);
    const ligne = esq.find((o) => o.params.forme === "ligne")!;
    expect(ligne.params.points[1]).toMatchObject({ x: 4, y: 0 });
    const poly = esq.find((o) => o.params.forme === "polygone")!;
    expect(poly.params.points.length).toBeGreaterThan(4); // arrondi discrétisé
    expect(Math.max(...poly.params.points.map((p) => p.x))).toBeCloseTo(1.5, 6); // demi-cercle de rayon 0,5 m
    expect(esq.find((o) => o.params.forme === "cercle")!.params.rayon).toEqual({ value: 0.25, unit: "m" });
    expect(objetsDeClasse(e, "texte")[0]!.params.texte).toBe("Séjour ⌀ 30");
    expect(Object.values(e.calques).map((c) => c.nom).sort()).toEqual(["DXF · Mobilier", "DXF · Murs", "DXF · Textes", "Référence DXF"]);
    expect(Object.values(e.groupes)).toHaveLength(1);
    // Fond de plan : cadre englobant du dessin (calque « Référence DXF »), dans le groupe.
    const cadre = objetsDeClasse(e, "reference-plan")[0]!;
    expect(cadre.params).toMatchObject({ source: "plan.dxf", nom: "Fond DXF · plan.dxf" });
    expect(cadre.params.contour.map((p) => [p.x, p.y])).toEqual([[-1, -1], [4, -1], [4, 1], [-1, 1]]); // arc compté par son cercle : cadre englobant prudent
    expect(cadre.groupeId).toBe(Object.values(e.groupes)[0]!.id);
    expect(r.rapport.unite).toEqual({ valeur: "mm", origine: "fichier" });
    expect(r.rapport.entites.find((x) => x.type === "INSERT")).toMatchObject({ lues: 1, importees: 0 });
    expect(() => commandesImportDxf(e, dxf(4, ENTITES), { source: "plan.dxf", niveauId: "rdc", repere: "local", uniteSiAbsente: "m" })).toThrow(/déjà importé/);
  });

  it("unité absente : choix de l'utilisateur, écrit comme hypothèse ; repère cadastral converti explicitement", () => {
    const o = P118.site.parcelle!.origineLocale;
    const texte = dxf(null, `0\nLINE\n8\n0\n10\n${o.x + 1}\n20\n${o.y + 2}\n11\n${o.x + 3}\n21\n${o.y + 2}`);
    const r = commandesImportDxf(base(), texte, { source: "cad.dxf", niveauId: "rdc", repere: "cadastral", uniteSiAbsente: "m" });
    expect(r.rapport.unite).toEqual({ valeur: "m", origine: "choix" });
    expect(r.rapport.remarques[0]).toMatch(/hypothèse/);
    const e = appliquer(base(), r.lots);
    const l = objetsDeClasse(e, "esquisse")[0]!;
    expect(l.params.points[0]!.x).toBeCloseTo(1, 6);
    expect(l.params.points[0]!.y).toBeCloseTo(2, 6);
    expect(() => commandesImportDxf(appliquer(modeleVide(), [{ label: "n", commands: [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } }] }]), texte, { source: "c.dxf", niveauId: "rdc", repere: "cadastral", uniteSiAbsente: "m" })).toThrow(/pas de parcelle/);
  });
});
