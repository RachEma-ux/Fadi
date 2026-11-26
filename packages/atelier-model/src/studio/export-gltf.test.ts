/**
 * Export vers Blender (glTF 2.0 et script Blender) : glTF relu et comparé au modèle — nœuds par calque et par élément,
 * repère converti (et retrouvé par la conversion inverse), volumes égaux au modèle, matériaux tirés des apparences
 * d'affichage, caméras des scènes, bilan ; script Blender qui embarque exactement le même glTF.
 */
import { describe, expect, it } from "vitest";
import { validateStudioDocument, type StudioDocument } from "./document-2d.js";
import { exportStudioObj } from "./export-3d.js";
import {
  exportStudioBlender, exportStudioGltf, STUDIO_FINITIONS_GLTF, studioBase64, studioBilanExportGltf, studioCouleurLineaire, studioGltfVersLocal3d,
  studioGltfRotationCamera, studioGltfDepuisLocal3d,
} from "./export-gltf.js";
import { studioQuantitesSolides } from "./solides-libres.js";

type P3 = { x: number; y: number; z: number };
type Gltf = {
  asset: { version: string; extras: { contrat: string; bilan: { ecrits: number; masques: number; nonEcrits: Record<string, number> } } };
  extensionsUsed?: string[];
  scenes: { nodes: number[] }[];
  nodes: { name: string; children?: number[]; mesh?: number; camera?: number; translation?: number[]; rotation?: number[]; extras?: Record<string, string> }[];
  meshes: { name: string; primitives: { attributes: { POSITION: number }; indices?: number; material: number; mode: number }[] }[];
  materials: { name: string; pbrMetallicRoughness: { baseColorFactor?: number[]; metallicFactor: number; roughnessFactor: number }; alphaMode?: string; extensions?: Record<string, unknown>; extras: Record<string, string> }[];
  cameras?: { name: string; type: string; perspective?: { yfov: number }; orthographic?: { xmag: number; ymag: number } }[];
  accessors: { bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }[];
  bufferViews: { byteOffset: number; byteLength: number }[];
  buffers: { byteLength: number; uri: string }[];
};

const doc: StudioDocument = validateStudioDocument({
  id: "doc-blender", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  layers: [{ id: "visible", name: "Façades", visible: true, locked: false }, { id: "cache", name: "Caché", visible: false, locked: false }],
  objects: [
    { id: "dalle", type: "rectangle", layerId: "visible", origin: { x: 0, y: 0 }, width: 4, height: 3, extrusion: { base: 0, height: 0.2 } },
    { id: "poteau", type: "circle", layerId: "cache", center: { x: 10, y: 0 }, radius: 0.5, extrusion: { base: 0, height: 3 } },
    { id: "trait", type: "line", layerId: "visible", start: { x: 0, y: 5 }, end: { x: 2, y: 5 } },
  ],
  solides: [
    { id: "boite", type: "box", layerId: "visible", placement: { origin: { x: 20, y: 7, z: 1 }, rotation: 0.3 }, width: 2, depth: 1, height: 1.5 },
    { id: "vitre", type: "box", placement: { origin: { x: 30, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 0.1, height: 2 },
  ],
  dimensions: [{ id: "c1", type: "dimension", layerId: "visible", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 0.5, links: { start: null, end: null }, toResolve: false }],
  scenes: [
    { id: "a1", type: "appearance", target: { kind: "layer", id: "visible" }, color: "#ff8000", finish: "satin" },
    { id: "a2", type: "appearance", target: { kind: "object", id: "vitre" }, color: "#80c0ff", finish: "glass" },
    { id: "s1", type: "scene", frame: "local-3d", name: "Vue d’approche", camera: { projection: "perspective", position: { x: 10, y: -10, z: 5 }, target: { x: 0, y: 0, z: 0 }, fov: 50 }, visibleLayers: ["visible"], displayMode: "shaded" },
    { id: "s2", type: "scene", frame: "local-3d", name: "Plan", camera: { projection: "orthographic", position: { x: 0, y: 0, z: 30 }, target: { x: 0, y: 0, z: 0 }, height: 20 }, visibleLayers: ["visible"], displayMode: "shaded" },
  ],
});

function decoder(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Relecture : triangles de chaque nœud d'élément, ramenés au repère `local-3d` par la conversion inverse. */
function relire(g: Gltf) {
  const octets = decoder(g.buffers[0]!.uri.split(",")[1]!);
  expect(octets.byteLength).toBe(g.buffers[0]!.byteLength);
  const vue = (k: number) => g.bufferViews[g.accessors[k]!.bufferView]!;
  const flottants = (k: number) => new Float32Array(octets.buffer.slice(vue(k).byteOffset, vue(k).byteOffset + vue(k).byteLength));
  const entiers = (k: number) => new Uint32Array(octets.buffer.slice(vue(k).byteOffset, vue(k).byteOffset + vue(k).byteLength));
  const elements = new Map<string, { calque: string; categorie: string; triangles: [P3, P3, P3][]; materiau: number; mode: number }>();
  for (const n of g.nodes) {
    if (n.mesh === undefined) continue;
    const prim = g.meshes[n.mesh]!.primitives[0]!;
    const pos = flottants(prim.attributes.POSITION);
    const a = g.accessors[prim.attributes.POSITION]!;
    // min / max de l'accesseur exacts (exigence glTF).
    for (let k = 0; k < 3; k++) {
      const vals = Array.from({ length: a.count }, (_, i) => pos[3 * i + k]!);
      expect(a.min![k]).toBe(Math.min(...vals));
      expect(a.max![k]).toBe(Math.max(...vals));
    }
    const t = n.translation ?? [0, 0, 0];
    const point = (i: number) => studioGltfVersLocal3d([pos[3 * i]! + t[0]!, pos[3 * i + 1]! + t[1]!, pos[3 * i + 2]! + t[2]!]);
    const triangles: [P3, P3, P3][] = [];
    if (prim.indices !== undefined) { const idx = entiers(prim.indices); for (let i = 0; i < idx.length; i += 3) triangles.push([point(idx[i]!), point(idx[i + 1]!), point(idx[i + 2]!)]); }
    elements.set(n.name, { calque: n.extras!.calque!, categorie: n.extras!.categorie!, triangles, materiau: prim.material, mode: prim.mode });
  }
  return elements;
}
const volumeSigne = (tri: [P3, P3, P3][]) => tri.reduce((s, [a, b, c]) => s + (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6, 0);

describe("Export Blender — glTF 2.0 (studio-export-gltf/1)", () => {
  const texte = exportStudioGltf(doc);
  const g = JSON.parse(texte) as Gltf;

  it("glTF 2.0 déterministe : un nœud par calque, un nœud par élément nommé par son identifiant, calque masqué écrit et signalé", () => {
    expect(texte).toBe(exportStudioGltf(doc));
    expect(g.asset.version).toBe("2.0");
    expect(g.asset.extras.contrat).toBe("studio-export-gltf/1");
    const racine = g.nodes[g.scenes[0]!.nodes[0]!]!;
    const enfants = racine.children!.map((i) => g.nodes[i]!);
    expect(enfants.filter((n) => n.extras?.studioCalque).map((n) => n.name).sort()).toEqual(["Caché", "Calque implicite", "Façades"]);
    expect(enfants.find((n) => n.name === "Caché")!.extras!.masqueDansStudio).toBe("oui");
    const elements = relire(g);
    expect([...elements.keys()].sort()).toEqual(["boite", "dalle", "poteau", "trait", "vitre"]);
    expect(elements.get("poteau")!.calque).toBe("cache");
    // Chaque nœud a au plus un parent et n'est pas son propre enfant (exigence glTF, relevée par l'importeur de Blender).
    const parents = new Map<number, number>();
    g.nodes.forEach((n, i) => { for (const c of n.children ?? []) { expect(parents.has(c), `nœud ${c}`).toBe(false); expect(c).not.toBe(i); parents.set(c, i); } });
    expect(g.nodes.filter((n) => n.mesh !== undefined).every((n) => g.nodes[parents.get(g.nodes.indexOf(n))!]!.extras?.studioCalque === n.extras!.calque)).toBe(true);
    expect(elements.get("trait")!.mode).toBe(3); // contour ouvert : LINE_STRIP
    expect(elements.get("boite")!.mode).toBe(4);
  });

  it("repère converti explicitement (x, y, z) → (x, z, −y) et retrouvé tel quel ; volumes relus égaux au modèle", () => {
    expect(studioGltfDepuisLocal3d({ x: 1, y: 2, z: 3 })).toEqual([1, 3, -2]);
    expect(studioGltfVersLocal3d(studioGltfDepuisLocal3d({ x: 1, y: 2, z: 3 }))).toEqual({ x: 1, y: 2, z: 3 });
    const elements = relire(g);
    const solides = studioQuantitesSolides(doc).items;
    for (const id of ["boite", "vitre"]) expect(volumeSigne(elements.get(id)!.triangles), id).toBeCloseTo(solides.find((s) => s.id === id)!.volume!, 4);
    expect(volumeSigne(elements.get("dalle")!.triangles)).toBeCloseTo(4 * 3 * 0.2, 4);
    // La boîte reste à sa cote : son point le plus bas est à z = 1 dans Studio comme dans le glTF relu.
    expect(Math.min(...elements.get("boite")!.triangles.flat().map((p) => p.z))).toBeCloseTo(1, 5);
  });

  it("matériaux : apparences d'affichage (couleur linéaire, finition de la vue 3D, verre transmissif), calque sans apparence sans couleur déclarée", () => {
    const elements = relire(g);
    const m = (id: string) => g.materials[elements.get(id)!.materiau]!;
    expect(m("dalle").name).toBe("Apparence Façades");
    expect(m("dalle").pbrMetallicRoughness).toEqual({ baseColorFactor: [...studioCouleurLineaire("#ff8000"), 1], metallicFactor: 0, roughnessFactor: STUDIO_FINITIONS_GLTF.satin.roughness });
    expect(m("boite")).toBe(m("dalle")); // même calque, même apparence : un seul matériau
    expect(m("vitre").alphaMode).toBe("BLEND");
    expect(m("vitre").extensions).toEqual({ KHR_materials_transmission: { transmissionFactor: 1 } });
    expect(g.extensionsUsed).toEqual(["KHR_materials_transmission"]);
    expect(m("poteau").name).toBe("Calque Caché");
    expect(m("poteau").pbrMetallicRoughness.baseColorFactor).toBeUndefined();
    expect(studioCouleurLineaire("#ffffff")).toEqual([1, 1, 1]);
    expect(studioCouleurLineaire("#000000")).toEqual([0, 0, 0]);
  });

  it("caméras : une par scène, perspective (champ vertical en radians) ou orthographique (demi-hauteur), visant la cible", () => {
    expect(g.cameras!.map((c) => [c.name, c.type])).toEqual([["Vue d’approche", "perspective"], ["Plan", "orthographic"]]);
    expect(g.cameras![0]!.perspective!.yfov).toBeCloseTo((50 * Math.PI) / 180, 6);
    expect(g.cameras![1]!.orthographic).toMatchObject({ xmag: 10, ymag: 10 });
    // Le regard (−Z local tourné par le quaternion) pointe vers la cible.
    for (const [de, vers] of [[{ x: 10, y: -10, z: 5 }, { x: 0, y: 0, z: 0 }], [{ x: 0, y: 0, z: 30 }, { x: 0, y: 0, z: 0 }]] as const) {
      const [x, y, z, w] = studioGltfRotationCamera(de, vers);
      const regard = [-(2 * (x * z + w * y)), -(2 * (y * z - w * x)), -(1 - 2 * (x * x + y * y))];
      const p = studioGltfDepuisLocal3d(de), c = studioGltfDepuisLocal3d(vers), d = [c[0] - p[0], c[1] - p[1], c[2] - p[2]], l = Math.hypot(...d);
      for (let k = 0; k < 3; k++) expect(regard[k]!).toBeCloseTo(d[k]! / l, 5);
    }
  });

  it("bilan : cotes comptées, scènes et apparences écrites (caméras, matériaux) ; même maillage que l'OBJ", () => {
    expect(studioBilanExportGltf(doc)).toEqual({ format: "gltf", ecrits: 5, masques: 1, nonEcrits: { cote: 1 } });
    expect(g.asset.extras.bilan).toEqual({ format: "gltf", ecrits: 5, masques: 1, nonEcrits: { cote: 1 } });
    expect((exportStudioObj(doc).match(/^o /gm) ?? []).length).toBe(5);
  });

  it("document vide : glTF valide sans tampon ni maillage", () => {
    const vide = JSON.parse(exportStudioGltf(validateStudioDocument({ id: "v", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] }))) as Partial<Gltf>;
    expect(vide.buffers).toBeUndefined();
    expect(vide.meshes).toBeUndefined();
    expect(vide.nodes).toHaveLength(1);
  });

  it("base64 conforme à la RFC 4648 (sans dépendance au moteur)", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255, 256]) {
      const o = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(studioBase64(o)).toBe(Buffer.from(o).toString("base64"));
    }
  });
});

describe("Export Blender — script Python (studio-export-blender/1)", () => {
  it("le script embarque exactement le glTF, importe, active la première caméra, enregistre le .blend sur demande, en ASCII", () => {
    const py = exportStudioBlender(doc, "etude-variante");
    expect(py).toBe(exportStudioBlender(doc, "etude-variante"));
    expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(py)).toBe(true);
    expect(py).toMatch(/^# Fadi Studio - export Blender, studio-export-blender\/1/m);
    const b64 = [...py.matchAll(/^ {4}"([A-Za-z0-9+/=]+)"$/gm)].map((m) => m[1]).join("");
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe(exportStudioGltf(doc));
    expect(py).toContain("bpy.ops.import_scene.gltf(filepath=chemin)");
    expect(py).toContain("scene.camera = cameras[0]");
    expect(py).toContain("bpy.ops.wm.save_as_mainfile");
    expect(py).toContain('NOM = "etude-variante"');
    expect(py).toContain("# non ecrits, cote : 1");
    // Un fichier de l'utilisateur n'est jamais vidé : seuls les objets d'usine d'un fichier neuf sont retirés.
    expect(py).not.toContain("read_factory_settings");
  });
});
