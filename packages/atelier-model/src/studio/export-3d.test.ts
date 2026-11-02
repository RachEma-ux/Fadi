/**
 * Exports 3D de Studio (E.6-04) : OBJ, STL et pièces STEP, chacun relu et comparé au modèle (volumes, identités,
 * calques, ce qui n'est pas écrit). La relecture du STEP par le noyau exact est contrôlée dans
 * `packages/geometry-exact` (STEP nommé) et `apps/api/src/lib/studio-export-3d.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { validateStudioDocument, type StudioDocument } from "./document-2d.js";
import { exportStudioObj, exportStudioStl, studioBilanExport3d, studioIdDepuisNom3d, studioNomEchange3d, studioPiecesStep } from "./export-3d.js";
import { quantitesStudio } from "./quantites.js";
import { studioQuantitesSolides } from "./solides-libres.js";
import { studioQuantitesArchitecture } from "./architecture/index.js";
import { exactSynthetique } from "./exacts.fixtures.js";

type P3 = { x: number; y: number; z: number };
const volumeSigne = (tri: [P3, P3, P3][]) => tri.reduce((s, [a, b, c]) => s + (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6, 0);

/** Relecture d'un OBJ : par objet `o`, son groupe, ses triangles et ses lignes (indices globaux). */
function lireObj(texte: string) {
  const v: P3[] = [];
  const objets = new Map<string, { groupe: string; triangles: [P3, P3, P3][]; lignes: number }>();
  let groupe = "", courant: { groupe: string; triangles: [P3, P3, P3][]; lignes: number } | null = null;
  for (const ligne of texte.split("\n")) {
    const [k, ...r] = ligne.split(" ");
    if (k === "g") groupe = r.join(" ");
    else if (k === "o") { courant = { groupe, triangles: [], lignes: 0 }; objets.set(studioIdDepuisNom3d(r.join(" ")), courant); }
    else if (k === "v") v.push({ x: Number(r[0]), y: Number(r[1]), z: Number(r[2]) });
    else if (k === "f") courant!.triangles.push(r.map((i) => v[Number(i) - 1]!) as [P3, P3, P3]);
    else if (k === "l") courant!.lignes++;
  }
  return objets;
}

/** Relecture d'un STL ASCII : facettes (normale déclarée et sommets). */
function lireStl(texte: string) {
  const facettes: { n: P3; t: [P3, P3, P3] }[] = [];
  const lignes = texte.split("\n").map((l) => l.trim());
  for (let i = 0; i < lignes.length; i++) {
    if (!lignes[i]!.startsWith("facet normal")) continue;
    const num = (s: string) => s.split(/\s+/).slice(-3).map(Number);
    const [nx, ny, nz] = num(lignes[i]!);
    const pts = [lignes[i + 2]!, lignes[i + 3]!, lignes[i + 4]!].map((l) => { const [x, y, z] = num(l); return { x: x!, y: y!, z: z! }; });
    facettes.push({ n: { x: nx!, y: ny!, z: nz! }, t: pts as [P3, P3, P3] });
  }
  return { entete: lignes[0]!, fin: lignes.filter(Boolean).at(-1)!, facettes };
}

const doc: StudioDocument = validateStudioDocument({
  id: "doc-3d", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  layers: [{ id: "visible", name: "Visible", visible: true, locked: false }, { id: "cache", name: "Caché", visible: false, locked: false }],
  objects: [
    { id: "dalle é", type: "rectangle", layerId: "visible", origin: { x: 0, y: 0 }, width: 4, height: 3, extrusion: { base: 0, height: 0.2 } },
    { id: "poteau", type: "circle", layerId: "cache", center: { x: 10, y: 0 }, radius: 0.5, extrusion: { base: 0, height: 3 } },
    { id: "trait", type: "line", layerId: "visible", start: { x: 0, y: 5 }, end: { x: 2, y: 5 } },
    { id: "ecran", type: "line", layerId: "visible", start: { x: 0, y: 8 }, end: { x: 2, y: 8 }, extrusion: { base: 0, height: 2 } },
  ],
  solides: [
    { id: "boite", type: "box", layerId: "visible", placement: { origin: { x: 20, y: 0, z: 0 }, rotation: 0.3 }, width: 2, depth: 1, height: 1.5 },
    { id: "oblique", type: "prism", layerId: "visible", placement: { origin: { x: 30, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], height: 2, direction: { x: 0.5, y: 0, z: 1 } },
    { id: "bascule", type: "box", layerId: "visible", placement: { origin: { x: 40, y: 0, z: 1 }, rotation: 0, basculement: { x: 0.4, y: 0 } }, width: 1, depth: 1, height: 1 },
  ],
  architecture: [
    { id: "mur", type: "wall", layerId: "visible", axis: [{ x: 0, y: -5 }, { x: 6, y: -5 }], thickness: 0.2, height: 3, base: 0, justification: "center" },
    { id: "porte", type: "opening", hostId: "mur", position: 2, width: 1, height: 2.1, sill: 0, kind: "porte" },
  ],
  dimensions: [{ id: "c1", type: "dimension", layerId: "visible", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 0.5, links: { start: null, end: null }, toResolve: false }],
  annotations: [{ id: "t1", type: "text", layerId: "visible", position: { x: 0, y: 0 }, height: 0.2, rotation: 0, content: "Texte", justification: "left" }],
});

const volumeObjet = (id: string) => quantitesStudio(doc).objets.find((o) => o.objetId === id)?.valeurs.find((v) => v.grandeur === "volume")?.valeur ?? undefined;

describe("E.6-04 — export OBJ (studio-export-obj/1)", () => {
  it("E.6-04 OBJ : un objet par élément (identifiant échappé réversible), groupe par calque, volumes relus égaux au modèle, calque masqué écrit", () => {
    const texte = exportStudioObj(doc);
    expect(texte).toBe(exportStudioObj(doc));
    // ASCII strict : aucun lecteur ne doit deviner un encodage.
    expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(texte)).toBe(true);
    expect(texte).toMatch(/^# Fadi Studio - export OBJ \(Wavefront\), studio-export-obj\/1$/m);
    expect(texte).toMatch(/unite : metre/);
    const o = lireObj(texte);
    expect([...o.keys()].sort()).toEqual(["bascule", "boite", "dalle é", "ecran", "mur", "oblique", "poteau", "trait"]);
    expect(texte).toContain("o dalle~0020~~00E9~");
    expect(o.get("poteau")!.groupe).toBe("cache");
    expect(o.get("dalle é")!.groupe).toBe("visible");
    // Volumes relus des faces (théorème de la divergence) = volumes du modèle.
    expect(volumeSigne(o.get("dalle é")!.triangles)).toBeCloseTo(4 * 3 * 0.2, 6);
    const solides = studioQuantitesSolides(doc).items;
    for (const id of ["boite", "oblique", "bascule"]) expect(volumeSigne(o.get(id)!.triangles), id).toBeCloseTo(solides.find((s) => s.id === id)!.volume!, 6);
    const mur = studioQuantitesArchitecture(doc.architecture!).find((m) => m.id === "mur")!;
    if (mur.type !== "wall") throw new Error("mur attendu");
    expect(volumeSigne(o.get("mur")!.triangles)).toBeCloseTo(mur.volumeNet, 6);
    // Le contour non extrudé est une ligne `l`, la surface sans épaisseur des triangles (volume nul).
    expect(o.get("trait")!.lignes).toBe(1);
    expect(o.get("trait")!.triangles).toHaveLength(0);
    expect(o.get("ecran")!.triangles.length).toBeGreaterThan(0);
    expect(texte).not.toMatch(/^o (c1|t1|porte)$/m);
  });

  it("E.6-04 OBJ : bilan dans l'en-tête — écrits, masqués, cotes, annotations et ouvertures comptés, jamais écartés en silence", () => {
    const b = studioBilanExport3d(doc, "obj");
    expect(b).toEqual({ format: "obj", ecrits: 8, masques: 1, nonEcrits: { cote: 1, annotation: 1, "ouverture-vide-du-mur": 1 } });
    const texte = exportStudioObj(doc);
    expect(texte).toContain("# ecrits : 8 (dont 1 sur un calque masque)");
    expect(texte).toContain("# non ecrits, ouverture-vide-du-mur : 1");
  });

  it("échappement des identifiants : réversible pour tout identifiant valide", () => {
    for (const id of ["a b", "é~'\\", "porte-1.2_x", "日本"]) {
      const n = studioNomEchange3d(id);
      expect(/^[\x21-\x7E]+$/.test(n)).toBe(true);
      expect(n).not.toMatch(/['\\]/);
      expect(studioIdDepuisNom3d(n)).toBe(id);
    }
  });
});

describe("E.6-04 — export STL ASCII", () => {
  it("E.6-04 STL : une pièce solid, facettes des solides seulement, normales unitaires sortantes, volume total égal au modèle", () => {
    const texte = exportStudioStl(doc);
    expect(texte).toBe(exportStudioStl(doc));
    expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(texte)).toBe(true);
    const s = lireStl(texte);
    expect(s.entete).toBe("solid fadi-studio doc-3d");
    expect(s.fin).toBe("endsolid fadi-studio doc-3d");
    for (const f of s.facettes) {
      expect(Math.hypot(f.n.x, f.n.y, f.n.z)).toBeCloseTo(1, 5);
      // Normale déclarée dans le sens des sommets (règle de la main droite).
      const [a, b, c] = f.t, u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, w = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      expect(f.n.x * (u.y * w.z - u.z * w.y) + f.n.y * (u.z * w.x - u.x * w.z) + f.n.z * (u.x * w.y - u.y * w.x)).toBeGreaterThan(0);
    }
    const mur = studioQuantitesArchitecture(doc.architecture!).find((m) => m.id === "mur")!;
    if (mur.type !== "wall") throw new Error("mur attendu");
    const attendu = volumeObjet("dalle é")! + volumeObjet("poteau")! + studioQuantitesSolides(doc).totalVolume! + mur.volumeNet;
    // Poteau : cercle discrétisé (mêmes facettes que la vue 3D) : le volume relu est celui du maillage, pas du cercle.
    const volumeMaillagePoteau = volumeSigne(lireObj(exportStudioObj(doc)).get("poteau")!.triangles);
    expect(volumeSigne(s.facettes.map((f) => f.t))).toBeCloseTo(attendu - volumeObjet("poteau")! + volumeMaillagePoteau, 5);
    expect(studioBilanExport3d(doc, "stl")).toEqual({ format: "stl", ecrits: 6, masques: 1, nonEcrits: { cote: 1, annotation: 1, "ouverture-vide-du-mur": 1, "surface-sans-epaisseur": 1, "contour-non-extrude": 1 } });
  });
});

describe("E.6-04 — pièces STEP décrites pour le noyau exact", () => {
  it("E.6-04 STEP : une pièce nommée par élément solide — extrusion, lissage réglé (oblique, basculé), brep, morceaux pleins du mur", () => {
    const d = validateStudioDocument({ ...doc, exacts: [exactSynthetique("ex", [{ ...doc.solides![0]!, id: "op-a" }, { ...doc.solides![0]!, id: "op-b" }], "visible")], solides: doc.solides });
    const { pieces, bilan } = studioPiecesStep(d);
    expect(pieces.map((p) => [p.nom, p.categorie])).toEqual([
      ["dalle~0020~~00E9~", "objet"], ["poteau", "objet"], ["boite", "solide"], ["oblique", "solide"], ["bascule", "solide"], ["ex", "exact"], ["mur", "mur"],
    ]);
    expect(pieces.find((p) => p.nom === "boite")!.solides[0]).toHaveProperty("extrusion");
    expect(pieces.find((p) => p.nom === "oblique")!.solides[0]).toHaveProperty("lissage");
    expect(pieces.find((p) => p.nom === "bascule")!.solides[0]).toHaveProperty("lissage");
    expect(pieces.find((p) => p.nom === "ex")!.solides[0]).toEqual({ brep: d.exacts![0]!.resultat.brep });
    // Mur : morceaux pleins dont la somme des volumes est le volume net du modèle (vide de la porte déduit).
    const aire = (pts: { x: number; y: number }[]) => Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]!; return s + a.x * b.y - b.x * a.y; }, 0) / 2);
    const murStep = pieces.find((p) => p.nom === "mur")!.solides.reduce((s, x) => s + ("extrusion" in x ? aire(x.extrusion.profil) * x.extrusion.hauteur : Number.NaN), 0);
    const mur = studioQuantitesArchitecture(d.architecture!).find((m) => m.id === "mur")!;
    if (mur.type !== "wall") throw new Error("mur attendu");
    expect(murStep).toBeCloseTo(mur.volumeNet, 9);
    expect(bilan).toEqual({ format: "step", ecrits: 7, masques: 1, nonEcrits: { cote: 1, annotation: 1, "ouverture-vide-du-mur": 1, "contour-non-extrude": 1, "surface-sans-epaisseur": 1 } });
    // Le document n'est jamais modifié par l'export (R15).
    expect(JSON.stringify(validateStudioDocument(d))).toBe(JSON.stringify(d));
  });

  it("document sans solide : aucune pièce (l'API refuse au lieu d'écrire un STEP vide)", () => {
    const vide = validateStudioDocument({ id: "v", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [{ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }] });
    expect(studioPiecesStep(vide).pieces).toEqual([]);
  });
});
