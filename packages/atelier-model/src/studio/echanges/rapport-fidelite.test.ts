import { describe, expect, it } from "vitest";
import type { StudioDocument } from "../document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "../export.js";
import { exportStudioIfc, studioIfcSummary } from "../ifc.js";
import { STUDIO_TYPES_ANNOTATIONS } from "../objets/annotation.js";
import { STUDIO_TYPES_OBJETS } from "../objets/index.js";
import { STUDIO_DOCUMENT_SCHEMA } from "../registry.js";
import {
  STUDIO_CAPACITES_EXPORT, STUDIO_FORMATS_ECHANGE, STUDIO_LISTES_ECHANGE, STUDIO_RAISONS_FIDELITE, studioRapportFidelite, type StudioLigneFidelite,
} from "./rapport-fidelite.js";

/** Types déclarés par le schéma d'une liste du document (un `oneOf` de types, ou un type seul). */
function typesDuSchema(items: unknown): string[] {
  const it = items as { oneOf?: { properties: { type: { const: string } } }[]; properties?: { type: { const: string } } };
  return it.oneOf ? it.oneOf.map((s) => s.properties.type.const) : [it.properties!.type.const];
}

/** Document qui contient chaque type d'élément, extrudé ou non, sur des calques visibles, masqués et réécrits. */
const complet = (): StudioDocument => ({
  id: "doc-fidelite", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  layers: [
    { id: "murs", name: "Murs extérieurs", visible: true, locked: true },
    { id: "cache", name: "Caché", visible: false, locked: false },
    { id: "brut", name: "BRUT", visible: true, locked: false },
  ],
  objects: [
    { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
    { id: "l2", type: "line", layerId: "murs", start: { x: 0, y: 1 }, end: { x: 4, y: 1 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } },
    { id: "r1", type: "rectangle", layerId: "cache", origin: { x: 1, y: 1 }, width: 2, height: 1, extrusion: { base: 0, height: 3 } },
    { id: "c1", type: "circle", center: { x: 8, y: 8 }, radius: 1, extrusion: { base: 0, height: 1 } },
    { id: "c2", type: "circle", center: { x: 12, y: 8 }, radius: 1 },
    { id: "a1", type: "arc", center: { x: 0, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5, extrusion: { base: 0, height: 2, thickness: 0.2 } },
    { id: "a2", type: "arc", center: { x: 5, y: 10 }, radius: 2, startAngle: 0, endAngle: 1.5 },
    { id: "p1", type: "polyline", points: [{ x: 20, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 3 }], closed: true, extrusion: { base: 0, height: 1 } },
    { id: "p2", type: "polyline", points: [{ x: 30, y: 0 }, { x: 34, y: 0 }, { x: 34, y: 3 }], closed: false, bulges: [0.5, 0], extrusion: { base: 0, height: 1 } },
    { id: "p3", type: "polyline", points: [{ x: 40, y: 0 }, { x: 44, y: 0 }], closed: false, bulges: [0.3] },
  ],
  dimensions: [{ id: "d1", type: "dimension", layerId: "cache", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: -0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false }],
  annotations: [
    { id: "g1", type: "angular-dimension", vertex: { x: 0, y: 0 }, first: { x: 3, y: 0 }, second: { x: 0, y: 3 }, radius: 1, links: { first: null, second: null }, toResolve: false },
    { id: "t1", type: "text", position: { x: 1, y: 5 }, height: 0.3, rotation: 0, content: "Plan RDC", justification: "left" },
    { id: "t2", type: "text", layerId: "brut", position: { x: 1, y: 6 }, height: 0.3, rotation: 0, content: "Séjour", justification: "center" },
    { id: "t3", type: "text", position: { x: 1, y: 7 }, height: 0.3, rotation: 0, content: "é".repeat(40), justification: "right" },
    { id: "t4", type: "text", position: { x: 1, y: 8 }, height: 0.3, rotation: 0, content: "Escalier 🪜", justification: "left" },
  ],
  solides: [
    { id: "s1", type: "box", placement: { origin: { x: 50, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 },
    { id: "s2", type: "prism", layerId: "cache", placement: { origin: { x: 60, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 2 },
  ],
});

const ligne = (lignes: StudioLigneFidelite[], type: string, raison: string) => lignes.find((l) => l.type === type && l.raison === raison);

describe("Table des capacités : source unique, couvre chaque type du modèle", () => {
  it("chaque liste du schéma du document a sa catégorie, chaque type de chaque liste son entrée pour chaque format", () => {
    const listes = Object.entries(STUDIO_DOCUMENT_SCHEMA.properties).filter(([cle, v]) => cle !== "layers" && (v as { type?: string }).type === "array");
    const parListe = Object.fromEntries(Object.entries(STUDIO_LISTES_ECHANGE).map(([cat, cle]) => [cle, cat]));
    expect(listes.map(([cle]) => cle).sort()).toEqual(Object.values(STUDIO_LISTES_ECHANGE).sort());
    for (const [cle, schema] of listes) {
      const categorie = parListe[cle] as keyof typeof STUDIO_CAPACITES_EXPORT;
      const table = STUDIO_CAPACITES_EXPORT[categorie] as Record<string, Record<string, unknown>>;
      const types = typesDuSchema((schema as { items: unknown }).items);
      expect(Object.keys(table).sort(), cle).toEqual([...types].sort());
      for (const t of types) for (const f of STUDIO_FORMATS_ECHANGE) expect(typeof table[t]![f], `${cle}.${t}.${f}`).toBe("function");
    }
  });
  it("registres des types : formes (STUDIO_TYPES_OBJETS) et annotations (STUDIO_TYPES_ANNOTATIONS)", () => {
    expect(Object.keys(STUDIO_CAPACITES_EXPORT.objets).sort()).toEqual(Object.keys(STUDIO_TYPES_OBJETS).sort());
    expect(Object.keys(STUDIO_CAPACITES_EXPORT.annotations).sort()).toEqual([...STUDIO_TYPES_ANNOTATIONS].sort());
  });
});

describe("Rapport de fidélité par format", () => {
  it("totaux : chaque élément du document compté une fois, dans une seule ligne, pour chaque format", () => {
    const doc = complet();
    const n = doc.objects.length + doc.dimensions!.length + doc.annotations!.length + doc.solides!.length;
    for (const f of STUDIO_FORMATS_ECHANGE) {
      const r = studioRapportFidelite(doc, f);
      expect(r.schema).toBe("studio-rapport-fidelite/1");
      expect(r.totaux.elements).toBe(n);
      expect(r.totaux.exact + r.totaux.approche + r.totaux.nonCouvert).toBe(n);
      const ids = r.lignes.flatMap((l) => l.ids);
      expect(new Set(ids).size).toBe(n);
      for (const l of r.lignes) {
        expect(l.nombre).toBe(l.ids.length);
        expect(STUDIO_RAISONS_FIDELITE).toContain(l.raison);
      }
      expect(r.calques).toMatchObject({ total: 3, masques: 1, verrouilles: 1, elementsSurCalquesMasques: 3 });
    }
  });

  it("SVG : arcs et renflements exacts, extrusion non portée, texte en police générique, solides absents", () => {
    const doc = complet();
    const r = studioRapportFidelite(doc, "svg");
    expect(ligne(r.lignes, "arc", "arcs-exacts")?.ids).toEqual(["a2"]);
    expect(ligne(r.lignes, "polyline", "arcs-exacts")?.ids).toEqual(["p3"]);
    expect(ligne(r.lignes, "polyline", "extrusion-non-portee")?.ids).toEqual(["p1", "p2"]);
    expect(ligne(r.lignes, "text", "texte-police-generique")?.nombre).toBe(4);
    expect(ligne(r.lignes, "box", "solide-hors-2d")?.statut).toBe("non-couvert");
    expect(r.calques.traitementMasques).toBe("contenu-masque");
    expect(r.calques.renommes).toEqual([]);
    // Le rapport dit vrai : aucun solide dans le SVG, le calque masqué y est conservé masqué.
    const svg = exportStudioSvg(doc);
    expect(svg).not.toMatch(/s1|s2/);
    expect(svg).toContain('data-layer="cache" data-name="Caché" display="none"');
  });

  it("DXF : cotes éclatées, texte échappé, remplacé ou tronqué, noms de calque réécrits, solides absents", () => {
    const doc = complet();
    const r = studioRapportFidelite(doc, "dxf");
    expect(ligne(r.lignes, "dimension", "cote-eclatee")).toMatchObject({ statut: "approche", ids: ["d1"] });
    expect(ligne(r.lignes, "angular-dimension", "cote-eclatee")?.ids).toEqual(["g1"]);
    expect(ligne(r.lignes, "text", "texte-exact")?.ids).toEqual(["t1"]);
    expect(ligne(r.lignes, "text", "texte-ascii-echappe")?.ids).toEqual(["t2"]);
    expect(ligne(r.lignes, "text", "texte-tronque")?.ids).toEqual(["t3"]);
    expect(ligne(r.lignes, "text", "texte-remplace")?.ids).toEqual(["t4"]);
    expect(ligne(r.lignes, "polyline", "renflements-exacts")?.ids).toEqual(["p3"]);
    expect(ligne(r.lignes, "line", "extrusion-non-portee")?.ids).toEqual(["l2"]);
    expect(r.calques.traitementMasques).toBe("calque-eteint");
    expect(r.calques.renommes).toEqual([{ id: "murs", nom: "Murs extérieurs", nomExporte: "MURS_EXTERIEURS" }, { id: "cache", nom: "Caché", nomExporte: "CACHE" }]);
    // Le rapport dit vrai : texte tronqué à 250 caractères, « ? » hors plan de base, aucun solide.
    const dxf = exportStudioDxf(doc);
    expect(dxf).toContain("\\U+00E9".repeat(35) + "\\U+0");
    expect(dxf).toContain("Escalier ?");
    expect(dxf).not.toMatch(/\bs1\b|\bs2\b/);
  });

  it("IFC : non extrudés, cotes et annotations non couverts ; arcs discrétisés ; concordance avec Fadi_StudioExport", () => {
    const doc = complet();
    const r = studioRapportFidelite(doc, "ifc");
    const s = studioIfcSummary(doc);
    const nb = (raison: string) => r.lignes.filter((l) => l.raison === raison).reduce((t, l) => t + l.nombre, 0);
    expect(nb("non-extrude")).toBe(s.nonExtruded);
    expect(nb("cote-hors-ifc")).toBe(s.dimensions);
    expect(nb("annotation-hors-ifc")).toBe(s.annotations);
    expect(r.totaux.exact + r.totaux.approche).toBe(s.walls + s.surfaces + s.prisms);
    expect(ligne(r.lignes, "arc", "arcs-discretises")?.ids).toEqual(["a1"]);
    expect(ligne(r.lignes, "polyline", "arcs-discretises")?.ids).toEqual(["p2"]);
    expect(ligne(r.lignes, "polyline", "extrusion-exacte")?.ids).toEqual(["p1"]);
    expect(ligne(r.lignes, "circle", "profil-exact")?.ids).toEqual(["c1"]);
    expect(ligne(r.lignes, "circle", "non-extrude")?.ids).toEqual(["c2"]);
    expect(r.calques.traitementMasques).toBe("calque-eteint");
    const ifc = exportStudioIfc(doc, { studyName: "Étude", variantName: "V1", timestamp: "2026-10-19T00:00:00" });
    expect(ifc).toContain("IFCCIRCLEPROFILEDEF");
    expect(ifc).not.toContain("IFCANNOTATION");
  });

  it("document vide : aucun élément ; format inconnu et document invalide refusés", () => {
    const vide: StudioDocument = { id: "v", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] };
    expect(studioRapportFidelite(vide, "ifc")).toMatchObject({ totaux: { elements: 0, exact: 0, approche: 0, nonCouvert: 0 }, lignes: [] });
    expect(() => studioRapportFidelite(vide, "pdf" as never)).toThrow(RangeError);
    expect(() => studioRapportFidelite({ ...vide, units: "mm" } as never, "svg")).toThrow();
  });
});

describe("Architecture (A.4) : murs et ouvertures", () => {
  const doc = (): StudioDocument => ({
    id: "doc-archi", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
    layers: [{ id: "cache", name: "Caché", visible: false, locked: false }],
    objects: [],
    architecture: [
      { id: "m1", type: "wall", layerId: "cache", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" },
      { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0, kind: "porte" },
    ],
  });
  it("mur approché en 2D (hauteur non portée), exact en IFC ; ouverture en lacune (approchée) en 2D, évidée (exacte) en IFC ; l'ouverture suit le calque de son mur", () => {
    for (const f of ["svg", "dxf"] as const) {
      const r = studioRapportFidelite(doc(), f);
      expect(ligne(r.lignes, "wall", "extrusion-non-portee")).toMatchObject({ categorie: "architecture", statut: "approche", ids: ["m1"] });
      expect(ligne(r.lignes, "opening", "ouverture-en-lacune")).toMatchObject({ statut: "approche", ids: ["o1"] });
      expect(r.calques.elementsSurCalquesMasques).toBe(2);
    }
    const ifc = studioRapportFidelite(doc(), "ifc");
    expect(ligne(ifc.lignes, "wall", "extrusion-exacte")?.statut).toBe("exact");
    expect(ligne(ifc.lignes, "opening", "ouverture-evidee")?.statut).toBe("exact");
    expect(ifc.lignes.some((l) => l.raison === "type-sans-capacite")).toBe(false);
  });
});
