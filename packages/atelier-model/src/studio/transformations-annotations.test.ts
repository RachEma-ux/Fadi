import { describe, expect, it } from "vitest";
import { applyStudioCommands, measureStudioAngularDimension, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { STUDIO_LIMITS } from "./noyau/limites.js";

/**
 * Transformations (revue) : volume des copies contrôlé avant copie, cotes angulaires liées sur calque verrouillé,
 * cotes qui suivent deux formes transformées (décalage, rayon), annotations (textes, cotes angulaires) et solides libres
 * dans la sélection ; Placer sur un calque pour les solides.
 */

const run = (doc: StudioDocument, ...c: unknown[]) => applyStudioCommands(doc, c as StudioCommand[]);
const refus = (doc: StudioDocument, ...c: unknown[]) => () => run(doc, ...c);
const base = (): StudioDocument => run(newStudioDocument("doc"),
  { toolId: "studio.calque.creer", params: { id: "notes", name: "Notes", visible: true, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 3 } } },
  { toolId: "studio.dessin.cote-angulaire", params: { id: "ang", type: "angular-dimension", layerId: "notes", vertex: { x: 0, y: 0 }, first: { x: 4, y: 0 }, second: { x: 0, y: 3 }, radius: 1, links: { first: { objectId: "l1", segment: 0 }, second: { objectId: "l2", segment: 0 } }, toResolve: false } },
  { toolId: "studio.dessin.cote-angulaire", params: { id: "libre", type: "angular-dimension", vertex: { x: 10, y: 0 }, first: { x: 12, y: 0 }, second: { x: 10, y: 2 }, radius: 1, links: { first: null, second: null }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.dessin.texte", params: { id: "t", type: "text", position: { x: 1, y: 2 }, height: 0.5, rotation: 0, content: "Séjour", justification: "left" } },
  { toolId: "studio.solide.boite", params: { id: "b", type: "box", placement: { origin: { x: 1, y: 1, z: 0.5 }, rotation: 0 }, width: 2, depth: 1, height: 3 } },
  { toolId: "studio.solide.prisme", params: { id: "pr", type: "prism", placement: { origin: { x: 5, y: 0, z: 0 }, rotation: 0 }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], height: 2 } },
);
const ann = (d: StudioDocument, id: string) => d.annotations!.find((a) => a.id === id)!;
const sol = (d: StudioDocument, id: string) => d.solides!.find((s) => s.id === id)!;

describe("Copier : volume contrôlé avant toute copie", () => {
  it("copies × sélection au-delà de la limite du document : refus immédiat", () => {
    // 30 lignes en plus des 8 éléments de base : 1000 copies de 30 lignes (30 000) dépassent 20 000.
    const lignes = Array.from({ length: 30 }, (_, i) => ({ toolId: "studio.dessin.ligne", params: { id: `m${i}`, type: "line", start: { x: 0, y: i + 10 }, end: { x: 1, y: i + 10 } } }));
    const d = run(base(), ...lignes);
    const ids = lignes.map((l) => l.params.id);
    const debut = Date.now();
    expect(refus(d, { toolId: "studio.dessin.copier", params: { ids, dx: 1, dy: 0, copies: 1000, prefix: "k" } })).toThrow(`${STUDIO_LIMITS.objects} objets au plus, copies comprises (38 + 30000)`);
    // Refus immédiat : aucune copie construite.
    expect(Date.now() - debut).toBeLessThan(1000);
  });
  it("la limite compte solides et annotations : juste à la limite accepté, un de plus refusé", () => {
    // 8 éléments de base (2 lignes, 1 cote, 3 annotations, 2 solides) + 12 lignes = 20 ; 20 + 999 × 20 = 20 000.
    const lignes = Array.from({ length: 12 }, (_, i) => ({ toolId: "studio.dessin.ligne", params: { id: `m${i}`, type: "line", start: { x: 0, y: i + 10 }, end: { x: 1, y: i + 10 } } }));
    const d = run(base(), ...lignes);
    const ids = ["l1", "l2", "d1", "ang", "libre", "t", "b", "pr", ...lignes.map((l) => l.params.id)];
    const copier = (copies: number) => ({ toolId: "studio.dessin.copier", params: { ids, dx: 0, dy: 100, copies, prefix: "k" } });
    expect(refus(d, copier(1000))).toThrow(/copies comprises \(20 \+ 20000\)/);
    const plein = run(d, copier(999));
    expect(plein.objects.length + plein.dimensions!.length + plein.annotations!.length + plein.solides!.length).toBe(STUDIO_LIMITS.objects);
  });
});

describe("Cotes angulaires liées et symétrie", () => {
  it("les deux segments réfléchis : rayons échangés, même angle mesuré", () => {
    const d = run(base(), { toolId: "studio.dessin.symetrie", params: { ids: ["l1", "l2"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 1 }, keepSource: false } });
    const a = ann(d, "ang");
    expect(a).toMatchObject({ vertex: { x: 0, y: 0 }, first: { x: 0, y: 3 }, second: { x: -4, y: 0 }, links: { first: { objectId: "l2" }, second: { objectId: "l1" } } });
    expect(measureStudioAngularDimension(d, "ang")!.value).toBeCloseTo(measureStudioAngularDimension(base(), "ang")!.value!, 12);
  });
  it("cote angulaire sur calque verrouillé : la symétrie de ses segments refuse le lot", () => {
    const d = run(base(), { toolId: "studio.calque.modifier", params: { id: "notes", name: "Notes", visible: true, locked: true } });
    expect(refus(d, { toolId: "studio.dessin.symetrie", params: { ids: ["l1", "l2"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 1 }, keepSource: false } })).toThrow(/cote angulaire liée ang.*calque verrouillé/);
  });
});

describe("Cotes qui suivent deux formes transformées", () => {
  it("symétrie : la cote linéaire non choisie garde son côté (décalage opposé)", () => {
    const d = run(base(), { toolId: "studio.dessin.symetrie", params: { ids: ["l1"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 }, keepSource: false } });
    expect(d.dimensions![0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: -0.5 });
  });
  it("échelle : décalage de la cote linéaire et rayon de la cote angulaire liées multipliés", () => {
    const d = run(base(), { toolId: "studio.dessin.echelle", params: { ids: ["l1", "l2"], center: { x: 0, y: 0 }, factor: 2, includeVolumes: false } });
    expect(d.dimensions![0]).toMatchObject({ end: { x: 8, y: 0 }, offset: 1 });
    expect(ann(d, "ang")).toMatchObject({ first: { x: 8, y: 0 }, second: { x: 0, y: 6 }, radius: 2 });
  });
});

describe("Annotations et solides dans la sélection", () => {
  const tout = ["l1", "l2", "ang", "libre", "d1", "t", "b", "pr"];
  it("rotation 90° : texte tourné, cote angulaire libre tournée, solides replacés", () => {
    const d = run(base(), { toolId: "studio.dessin.rotation", params: { ids: tout, center: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    expect(ann(d, "t")).toMatchObject({ position: { x: -2, y: 1 }, rotation: Math.PI / 2, height: 0.5 });
    expect(ann(d, "libre")).toMatchObject({ vertex: { x: 0, y: 10 }, first: { x: 0, y: 12 }, second: { x: -2, y: 10 }, radius: 1 });
    expect(ann(d, "ang")).toMatchObject({ first: { x: 0, y: 4 }, second: { x: -3, y: 0 } });
    expect(sol(d, "b")).toEqual({ id: "b", type: "box", placement: { origin: { x: -1, y: 1, z: 0.5 }, rotation: Math.PI / 2 }, width: 2, depth: 1, height: 3 });
    expect(sol(d, "pr")).toMatchObject({ placement: { origin: { x: 0, y: 5, z: 0 }, rotation: Math.PI / 2 } });
  });
  it("échelle 2 : hauteur du texte et rayon multipliés ; solides : origine seule, puis dimensions avec « volumes aussi »", () => {
    const d = run(base(), { toolId: "studio.dessin.echelle", params: { ids: tout, center: { x: 0, y: 0 }, factor: 2, includeVolumes: false } });
    expect(ann(d, "t")).toMatchObject({ position: { x: 2, y: 4 }, height: 1, rotation: 0 });
    expect(ann(d, "libre")).toMatchObject({ vertex: { x: 20, y: 0 }, radius: 2 });
    expect(sol(d, "b")).toMatchObject({ placement: { origin: { x: 2, y: 2, z: 0.5 } }, width: 2, depth: 1, height: 3 });
    const v = run(base(), { toolId: "studio.dessin.echelle", params: { ids: ["b", "pr"], center: { x: 0, y: 0 }, factor: 2, includeVolumes: true } });
    expect(sol(v, "b")).toMatchObject({ placement: { origin: { x: 2, y: 2, z: 1 } }, width: 4, depth: 2, height: 6 });
    expect(sol(v, "pr")).toMatchObject({ profile: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }], height: 4 });
  });
  it("symétrie : texte lisible (rotation gardée), boîte restée boîte sur la même emprise réfléchie, profil retourné", () => {
    const d = run(base(), { toolId: "studio.dessin.symetrie", params: { ids: ["t", "b", "pr", "libre"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 }, keepSource: false } });
    expect(ann(d, "t")).toMatchObject({ position: { x: 1, y: -2 }, rotation: 0 });
    // Boîte (1..3) × (1..2) réfléchie sur y = 0 : (1..3) × (−2..−1) → origine (1, −2), rotation 0.
    expect(sol(d, "b")).toMatchObject({ placement: { origin: { x: 1, y: -2, z: 0.5 }, rotation: 0 }, width: 2, depth: 1 });
    expect(sol(d, "pr")).toMatchObject({ placement: { origin: { x: 5, y: 0 } }, profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }] });
    expect(ann(d, "libre")).toMatchObject({ vertex: { x: 10, y: 0 }, first: { x: 10, y: -2 }, second: { x: 12, y: 0 } });
    expect(measureStudioAngularDimension(d, "libre")!.value).toBeCloseTo(90, 9);
  });
  it("copier : annotations et solides copiés ; cote angulaire copiée liée aux copies de ses segments", () => {
    const d = run(base(), { toolId: "studio.dessin.copier", params: { ids: tout, dx: 0, dy: 10, copies: 1, prefix: "c" } });
    expect(ann(d, "c-1-2")).toMatchObject({ vertex: { x: 0, y: 10 }, links: { first: { objectId: "c-1-0", segment: 0 }, second: { objectId: "c-1-1", segment: 0 } } });
    expect(ann(d, "c-1-5")).toMatchObject({ type: "text", position: { x: 1, y: 12 } });
    expect(sol(d, "c-1-6")).toMatchObject({ type: "box", placement: { origin: { x: 1, y: 11, z: 0.5 } } });
    expect(sol(d, "c-1-7")).toMatchObject({ type: "prism" });
    // Copiée seule (segments non copiés) : cote angulaire libre.
    const seule = run(base(), { toolId: "studio.dessin.copier", params: { ids: ["ang"], dx: 1, dy: 0, copies: 1, prefix: "s" } });
    expect(ann(seule, "s-1-0")).toMatchObject({ vertex: { x: 1, y: 0 }, links: { first: null, second: null }, toResolve: false });
  });
  it("calque verrouillé : un texte ou un solide sélectionné refuse la transformation", () => {
    const d = run(base(),
      { toolId: "studio.objet.calque", params: { ids: ["t", "b"], layerId: "notes" } },
      { toolId: "studio.calque.modifier", params: { id: "notes", name: "Notes", visible: true, locked: true } });
    expect(refus(d, { toolId: "studio.dessin.rotation", params: { ids: ["b"], center: { x: 0, y: 0 }, angle: 1 } })).toThrow(/calque verrouillé/);
    expect(refus(d, { toolId: "studio.dessin.copier", params: { ids: ["t"], dx: 1, dy: 0, copies: 1, prefix: "x" } })).toThrow(/calque verrouillé/);
  });
});

describe("Placer sur un calque : solides libres", () => {
  it("un solide change de calque ; calque implicite rendu sans layerId", () => {
    const d = run(base(), { toolId: "studio.objet.calque", params: { ids: ["b", "l1"], layerId: "notes" } });
    expect(sol(d, "b").layerId).toBe("notes");
    expect(d.objects[0]!.layerId).toBe("notes");
    expect(sol(run(d, { toolId: "studio.objet.calque", params: { ids: ["b"], layerId: "default" } }), "b").layerId).toBeUndefined();
  });
});
