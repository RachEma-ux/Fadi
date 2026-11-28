import { describe, expect, it } from "vitest";
import { modeleVide as creerModele } from "./geometrie-libre.js";
import { ErreurImport } from "./echanges-import.js";
import { construireScene, decoderBase64, estFormatRefuse, estRigide, formatDuFichier, inverserAffine, lire3ds, lire3mf, lireDae, lireGlb, lireGltf, lirePly, lireScene, maillagesDeScene, multiplier, poserScene, resumerScene, type LectureScene } from "./formats-3d.js";
import { ecrireZip } from "./zip.js";
import { descendants, lireXml } from "./xml-mini.js";

// Cube unité (8 sommets, 12 triangles), réutilisé par plusieurs formats.
const CUBE_P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const CUBE_T = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];

const base64 = (o: Uint8Array): string => Buffer.from(o).toString("base64");

function tamponCube(): Uint8Array {
  const b = new ArrayBuffer(CUBE_P.length * 4 + CUBE_T.length * 2);
  const f = new Float32Array(b, 0, CUBE_P.length);
  f.set(CUBE_P);
  new Uint16Array(b, CUBE_P.length * 4, CUBE_T.length).set(CUBE_T);
  return new Uint8Array(b);
}

function gltfCube(uri: string | undefined, longueur: number) {
  return {
    asset: { version: "2.0" },
    buffers: [{ byteLength: longueur, ...(uri !== undefined ? { uri } : {}) }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: CUBE_P.length * 4 },
      { buffer: 0, byteOffset: CUBE_P.length * 4, byteLength: CUBE_T.length * 2 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
    ],
    materials: [{ name: "Chêne", pbrMetallicRoughness: { baseColorFactor: [1, 0.2140411, 0, 1] } }],
    meshes: [{ name: "Tabouret", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [
      { name: "Salle", children: [1, 2] },
      { name: "Tabouret A", mesh: 0, translation: [0, 0, 0] },
      { name: "Tabouret B", mesh: 0, translation: [3, 0, 0], rotation: [0, 0.7071068, 0, 0.7071068] },
      { name: "Tabouret étiré", mesh: 0, scale: [2, 1, 1], translation: [0, 0, 5] },
    ],
    scenes: [{ nodes: [0, 3] }],
    scene: 0,
  };
}

describe("xml-mini", () => {
  it("lit éléments, attributs, texte, entités et préfixes, sans résoudre de DTD", () => {
    const x = lireXml(`<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "piège">]><kml:a b='1 &amp; 2'><!-- c --><c>t&lt;&#65;<![CDATA[<z>]]></c><d/></kml:a>`);
    expect(x.nom).toBe("a");
    expect(x.attributs["b"]).toBe("1 & 2");
    expect(x.enfants.map((e) => e.nom)).toEqual(["c", "d"]);
    expect(x.enfants[0]?.texte).toBe("t<A<z>");
    expect(descendants(x, "d")).toHaveLength(1);
    expect(() => lireXml("<a><b></a>")).toThrow();
  });
});

describe("glTF et GLB", () => {
  const t = tamponCube();
  const json = gltfCube(`data:application/octet-stream;base64,${base64(t)}`, t.length);

  it("lit la hiérarchie, les poses, la matière (sRGB) ; Y vertical et mètre portés par le format", () => {
    const l = lireGltf(JSON.stringify(json));
    expect(l.axeFichier).toBe("y");
    expect(l.uniteFichier).toBe(1);
    expect(l.objets.map((o) => o.nom)).toEqual(["Tabouret A", "Tabouret B", "Tabouret étiré"]);
    expect(new Set(l.objets.map((o) => o.cle)).size).toBe(1);
    expect(l.matieres["g0"]).toEqual({ nom: "Chêne", couleur: "#ff7f00" });
    expect(l.objets[1]?.pose[3]).toBeCloseTo(3);
  });

  it("GLB : même lecture depuis le bloc binaire", () => {
    const j = new TextEncoder().encode(JSON.stringify(gltfCube(undefined, t.length)));
    const jp = new Uint8Array(Math.ceil(j.length / 4) * 4).fill(0x20);
    jp.set(j);
    const bp = new Uint8Array(Math.ceil(t.length / 4) * 4);
    bp.set(t);
    const total = 12 + 8 + jp.length + 8 + bp.length;
    const o = new Uint8Array(total);
    const v = new DataView(o.buffer);
    v.setUint32(0, 0x46546c67, true);
    v.setUint32(4, 2, true);
    v.setUint32(8, total, true);
    v.setUint32(12, jp.length, true);
    v.setUint32(16, 0x4e4f534a, true);
    o.set(jp, 20);
    v.setUint32(20 + jp.length, bp.length, true);
    v.setUint32(24 + jp.length, 0x004e4942, true);
    o.set(bp, 28 + jp.length);
    expect(formatDuFichier("x.glb", o)).toBe("glb");
    const l = lireGlb(o);
    expect(l.objets).toHaveLength(3);
    expect(l.objets[0]?.triangles).toEqual(CUBE_T);
  });

  it("une ressource externe ou une compression Draco est refusée avec son motif", () => {
    expect(() => lireGltf(JSON.stringify({ ...json, buffers: [{ uri: "cube.bin", byteLength: 1 }] }))).toThrow(/Ressource externe/);
    expect(() => lireGltf(JSON.stringify({ ...json, extensionsRequired: ["KHR_draco_mesh_compression"] }))).toThrow(/Draco/);
    expect(() => lireGltf(JSON.stringify({ asset: { version: "1.0" } }))).toThrow(/2\.0/);
  });

  it("pose : Y vertical ramené à Z, maillage répété rigide → composant, pose non rigide → groupe à part", () => {
    const l = lireGltf(JSON.stringify(json));
    const r = resumerScene(l, 1, "y");
    expect(r.objets).toBe(3);
    expect(r.repetes).toBe(1);
    const s = construireScene(l, 1, "y");
    expect(s.composants).toBe(1);
    expect(s.objets.map((o) => [o.genre, o.poses.length])).toEqual([
      ["composant", 2],
      ["groupe", 1],
    ]);
    const p = poserScene(creerModele(), s, 1, { format: "gltf", fichier: "salle.gltf" });
    expect(p.occurrences).toHaveLength(3);
    expect(p.matieresCreees).toBe(1);
    const mats = Object.values(p.modele.annotations?.materiaux ?? {});
    expect(mats).toEqual([expect.objectContaining({ nom: "Chêne", couleur: "#ff7f00" })]);
    const occs = Object.values(p.modele.racine.occurrences);
    expect(occs.every((o) => o.materiau === mats[0]?.id)).toBe(true);
    const defs = Object.values(p.modele.definitions);
    expect(defs.map((d) => d.genre).sort()).toEqual(["composant", "groupe"]);
    expect(Object.values(p.modele.annotations?.correspondances ?? {})[0]).toMatchObject({ format: "gltf", metresParUnite: 1 });
    // Y vertical : la hauteur du cube (y du fichier) devient z ; le tabouret étiré (z = 5 du fichier) part vers −y.
    const plats = maillagesDeScene(l, "y");
    const zs = (plats[0]?.positions ?? []).filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(1);
    const ys = (plats[2]?.positions ?? []).filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-6);
    // Une seconde pose reprend la matière de même nom et couleur.
    const p2 = poserScene(p.modele, construireScene(l, 1, "y"), 1);
    expect(p2.matieresCreees).toBe(0);
  });
});

describe("PLY", () => {
  it("texte : faces en éventail, ordre des propriétés respecté", () => {
    const t = `ply\nformat ascii 1.0\nelement vertex 4\nproperty float z\nproperty float x\nproperty float y\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n0 1 0\n0 1 1\n0 0 1\n4 0 1 2 3\n`;
    const l = lirePly(new TextEncoder().encode(t));
    expect(l.uniteFichier).toBeNull();
    expect(l.axeFichier).toBeNull();
    expect(l.objets[0]?.positions.slice(3, 6)).toEqual([1, 0, 0]);
    expect(l.objets[0]?.triangles).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("binaire petit-boutiste ; sans faces = nuage de points refusé avec motif", () => {
    const tete = new TextEncoder().encode("ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar uint vertex_indices\nend_header\n");
    const corps = new ArrayBuffer(36 + 1 + 12);
    const v = new DataView(corps);
    [0, 0, 0, 2, 0, 0, 0, 2, 0].forEach((x, i) => v.setFloat32(i * 4, x, true));
    v.setUint8(36, 3);
    [0, 1, 2].forEach((x, i) => v.setUint32(37 + i * 4, x, true));
    const o = new Uint8Array(tete.length + corps.byteLength);
    o.set(tete);
    o.set(new Uint8Array(corps), tete.length);
    expect(lirePly(o).objets[0]?.positions).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const nuage = new TextEncoder().encode("ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 1 1\n");
    expect(() => lirePly(nuage)).toThrow(/nuage de points/);
  });
});

describe("3MF", () => {
  it("unité, matières de base, composants transformés", () => {
    const modele = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="centimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <basematerials id="5"><base name="Laiton" displaycolor="#C8A040FF"/></basematerials>
  <object id="1" type="model" name="Pied" pid="5" pindex="0"><mesh><vertices>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<vertex x="${CUBE_P[i * 3]}" y="${CUBE_P[i * 3 + 1]}" z="${CUBE_P[i * 3 + 2]}"/>`).join("")}</vertices>
   <triangles>${[...Array(12).keys()].map((k) => `<triangle v1="${CUBE_T[k * 3]}" v2="${CUBE_T[k * 3 + 1]}" v3="${CUBE_T[k * 3 + 2]}"/>`).join("")}</triangles></mesh></object>
  <object id="2" type="model" name="Table"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 50 0 0"/></components></object>
 </resources>
 <build><item objectid="2"/></build>
</model>`;
    const zip = ecrireZip([{ nom: "3D/3dmodel.model", donnees: new TextEncoder().encode(modele) }], new Date(Date.UTC(2026, 10, 27)));
    const l = lire3mf(zip);
    expect(l.uniteFichier).toBe(0.01);
    expect(l.axeFichier).toBe("z");
    expect(l.objets).toHaveLength(2);
    expect(l.objets[1]?.pose[3]).toBe(50);
    expect(l.matieres[l.objets[0]?.matiere ?? ""]).toEqual({ nom: "Laiton", couleur: "#c8a040" });
    const s = construireScene(l, 0.01, "z");
    expect(s.objets[0]?.poses).toHaveLength(2);
    expect(s.objets[0]?.poses[1]?.[3]).toBeCloseTo(0.5);
  });
});

describe("COLLADA", () => {
  const dae = `<?xml version="1.0"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
 <asset><unit meter="0.001" name="millimeter"/><up_axis>Z_UP</up_axis></asset>
 <library_effects><effect id="e1"><profile_COMMON><technique sid="c"><lambert><diffuse><color>0 0 1 1</color></diffuse></lambert></technique></profile_COMMON></effect></library_effects>
 <library_materials><material id="bleu" name="Bleu"><instance_effect url="#e1"/></material></library_materials>
 <library_geometries><geometry id="g" name="Bloc"><mesh>
  <source id="g-p"><float_array id="g-a" count="24">${CUBE_P.join(" ")}</float_array><technique_common><accessor source="#g-a" count="8" stride="3"/></technique_common></source>
  <vertices id="g-v"><input semantic="POSITION" source="#g-p"/></vertices>
  <polylist count="6" material="M"><input semantic="VERTEX" source="#g-v" offset="0"/><vcount>4 4 4 4 4 4</vcount><p>0 3 2 1 4 5 6 7 0 1 5 4 1 2 6 5 2 3 7 6 3 0 4 7</p></polylist>
  <lines count="1"><input semantic="VERTEX" source="#g-v" offset="0"/><p>0 1</p></lines>
 </mesh></geometry></library_geometries>
 <library_visual_scenes><visual_scene id="s">
  <node name="Bloc 1"><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="M" target="#bleu"/></technique_common></bind_material></instance_geometry></node>
  <node name="Bloc 2"><translate>1000 0 0</translate><rotate>0 0 1 90</rotate><instance_geometry url="#g"/></node>
 </visual_scene></library_visual_scenes>
 <scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`;
  it("unité, axe, polygones, matière liée, transformations ; lignes déclarées omises", () => {
    const l = lireDae(dae);
    expect(l.uniteFichier).toBe(0.001);
    expect(l.axeFichier).toBe("z");
    expect(l.objets).toHaveLength(2);
    expect(l.objets[0]?.triangles).toHaveLength(36);
    expect(l.matieres[l.objets[0]?.matiere ?? ""]).toEqual({ nom: "Bleu", couleur: "#0000ff" });
    expect(l.objets[1]?.matiere).toBeUndefined();
    expect(l.omis).toContain("primitives-non-triangulees");
    expect(l.objets[1]?.pose[1]).toBeCloseTo(-1);
    expect(() => lireDae(dae.replace("Z_UP", "X_UP"))).toThrow(ErreurImport);
  });
  it("même maillage lié à deux matières : chaque occurrence garde la sienne", () => {
    const deux = dae
      .replace('<library_materials><material id="bleu" name="Bleu"><instance_effect url="#e1"/></material>', '<library_materials><material id="bleu" name="Bleu"><instance_effect url="#e1"/></material><material id="bleu2" name="Bleu 2"><instance_effect url="#e1"/></material>')
      .replace('<translate>1000 0 0</translate><rotate>0 0 1 90</rotate><instance_geometry url="#g"/>', '<translate>1000 0 0</translate><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="M" target="#bleu2"/></technique_common></bind_material></instance_geometry>');
    const l = lireDae(deux);
    const s = construireScene(l, 0.001, "z");
    expect(new Set(s.objets.map((o) => o.matiere))).toEqual(new Set([l.objets[0]?.matiere, l.objets[1]?.matiere]));
    expect(l.objets[0]?.matiere).not.toBe(l.objets[1]?.matiere);
  });
  it("une grande source de positions est lue sans dépasser la limite d'arguments", () => {
    const n = 100_000;
    const flottants = Array.from({ length: n * 3 }, (_v, i) => String(i % 7)).join(" ");
    const grand = dae.replace(/<float_array id="g-a" count="24">[^<]*<\/float_array><technique_common><accessor source="#g-a" count="8"/, `<float_array id="g-a" count="${n * 3}">${flottants}</float_array><technique_common><accessor source="#g-a" count="${n}"`);
    expect(() => lireDae(grand)).not.toThrow();
  });
});

describe("3DS", () => {
  const bloc = (id: number, contenu: Uint8Array[]): Uint8Array => {
    const lg = 6 + contenu.reduce((n, c) => n + c.length, 0);
    const o = new Uint8Array(lg);
    const v = new DataView(o.buffer);
    v.setUint16(0, id, true);
    v.setUint32(2, lg, true);
    let p = 6;
    for (const c of contenu) {
      o.set(c, p);
      p += c.length;
    }
    return o;
  };
  const cstr = (s: string) => new Uint8Array([...new TextEncoder().encode(s), 0]);
  const u16 = (...x: number[]) => new Uint8Array(new Uint16Array(x).buffer);
  it("objets, sommets, faces, matière par groupe de faces", () => {
    const pts = new Uint8Array(2 + 8 * 12);
    const dv = new DataView(pts.buffer);
    dv.setUint16(0, 8, true);
    CUBE_P.forEach((x, i) => dv.setFloat32(2 + i * 4, x, true));
    const faces = new Uint8Array(2 + 12 * 8);
    const fv = new DataView(faces.buffer);
    fv.setUint16(0, 12, true);
    for (let k = 0; k < 12; k++) for (let c = 0; c < 3; c++) fv.setUint16(2 + k * 8 + c * 2, CUBE_T[k * 3 + c] as number, true);
    const groupe = bloc(0x4130, [cstr("Rouge"), u16(6, 0, 1, 2, 3, 4, 5)]);
    const mat = bloc(0xafff, [bloc(0xa000, [cstr("Rouge")]), bloc(0xa020, [bloc(0x0011, [new Uint8Array([255, 0, 0])])])]);
    const obj = bloc(0x4000, [cstr("Boite"), bloc(0x4100, [bloc(0x4110, [pts]), bloc(0x4120, [faces, groupe])])]);
    const fichier = bloc(0x4d4d, [bloc(0x3d3d, [mat, obj])]);
    expect(formatDuFichier("boite.3ds", fichier)).toBe("3ds");
    const l = lire3ds(fichier);
    expect(l.uniteFichier).toBeNull();
    expect(l.objets.map((o) => [o.nom, o.triangles.length / 3, o.matiere])).toEqual([
      ["Boite / Rouge", 6, "tRouge"],
      ["Boite", 6, undefined],
    ]);
    expect(l.matieres["tRouge"]?.couleur).toBe("#ff0000");
  });
});

describe("reconnaissance, refus et outils", () => {
  it("FBX, 3DM et USD reconnus et refusés", () => {
    expect(formatDuFichier("a.fbx", new TextEncoder().encode("Kaydara FBX Binary  \0"))).toBe("fbx");
    expect(formatDuFichier("a.bin", new TextEncoder().encode("Kaydara FBX Binary  \0"))).toBe("fbx");
    expect(formatDuFichier("piece.usdz", new Uint8Array([0x50, 0x4b, 3, 4]))).toBe("usd");
    expect(formatDuFichier("a.3dm", new Uint8Array(4))).toBe("3dm");
    expect(estFormatRefuse("fbx")).toBe(true);
    expect(estFormatRefuse("glb")).toBe(false);
    expect(formatDuFichier("a.txt", new Uint8Array(4))).toBeNull();
  });
  it("lireScene refuse une scène vide ; base64, inverse affine et rigidité", () => {
    expect(() => lireScene("gltf", new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" } })))).toThrow(/Aucun maillage/);
    expect([...decoderBase64("QUJD")]).toEqual([65, 66, 67]);
    const m = [0, -1, 0, 2, 1, 0, 0, 3, 0, 0, 1, 4, 0, 0, 0, 1];
    const i = inverserAffine(m);
    expect(i).not.toBeNull();
    const id = multiplier(m, i as number[]);
    expect(id.map((x) => Math.round(x * 1e9) / 1e9)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(estRigide(m)).toBe(true);
    expect(estRigide([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(false);
    expect(estRigide([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(false);
  });
  it("une scène construite avec une unité choisie met les poses à l'échelle", () => {
    const l: LectureScene = { format: "ply", objets: [{ nom: "A", positions: CUBE_P, triangles: CUBE_T, pose: [1, 0, 0, 100, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], cle: "a" }], matieres: {}, uniteFichier: null, axeFichier: null, omis: [] };
    for (const d of resumerScene(l, 0.001, "z").dimensions) expect(d).toBeCloseTo(0.001, 12);
  });
});

describe("relevé au capteur posé en référence", () => {
  it("la fiche garde le format et l'axe Y ; la relecture ramène Z vertical ; un axe inconnu est refusé", async () => {
    const { ajouterReference, estReference, rechargerReference } = await import("./references.js");
    const { maillagesReference } = await import("./formats-3d.js");
    const fichier = { id: "sbxref_00000000-0000-4000-8000-000000000001", empreinte: "a".repeat(64), taille: 10 };
    const r = ajouterReference(creerModele(), { nom: "salon.ply", format: "ply", fichier, echelle: 1, triangles: 2, date: "2026-11-27", axe: "y" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ref = r.modele.annotations?.references?.[r.id];
    expect(ref).toMatchObject({ format: "ply", axe: "y" });
    expect(estReference(r.id, ref)).toBe(true);
    expect(estReference(r.id, { ...ref, axe: "x" })).toBe(false);
    const r2 = rechargerReference(r.modele, r.id, { nom: "salon-2.glb", format: "glb", fichier: { ...fichier, empreinte: "b".repeat(64) }, echelle: 1, triangles: 2, date: "2026-11-28", axe: "z" });
    expect(r2.ok && r2.modele.annotations?.references?.[r2.id]?.axe).toBeUndefined();
    const ply = new TextEncoder().encode("ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 2 0\n3 0 1 2\n");
    const lu = maillagesReference("ply", ply, "y");
    expect(lu.maillages[0]?.positions.slice(6, 9)).toEqual([0, 0, 2]);
    expect(maillagesReference("stl", new TextEncoder().encode("solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid a\n")).maillages).toHaveLength(1);
  });
});
