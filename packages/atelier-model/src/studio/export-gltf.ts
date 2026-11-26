import { validateStudioDocument, type StudioDocument } from "./document-2d.js";
import { studioMesh3d } from "./mesh-3d.js";
import type { StudioPoint3 } from "./exporteurs/maillage.js";
import { nb } from "./exporteurs/texte.js";
import { studioApparenceResolue, studioScenes } from "./composition/affichage-scenes.js";
import { STUDIO_DEFAULT_LAYER_ID } from "./noyau/limites.js";
import type { StudioFinitionAffichage, StudioScene } from "./scenes/scenes.js";
import { studioBilanExport3d, studioElementsExport3d, studioToutVisibleExport3d, type StudioBilanExport3d } from "./export-3d.js";

/**
 * Export vers Blender (rendu) : glTF 2.0 et script Blender d'une révision Studio.
 *
 * - **glTF 2.0** (`exportStudioGltf`, texte JSON `.gltf`, tampon binaire intégré en base64) : le maillage de la vue 3D
 *   (`studioMesh3d`, tous calques écrits comme en OBJ), un nœud par calque et, dessous, un nœud par élément nommé par son
 *   identifiant Studio (identité, catégorie et calque relus dans `extras`). Repère **converti explicitement** : glTF est
 *   en mètres, y vers le haut ; le repère `local-3d` de Studio (z vers le haut) est écrit par (x, y, z) → (x, z, −y), la
 *   conversion inverse de celle que fait l'importeur glTF de Blender : l'élément retrouve dans Blender les coordonnées
 *   (x, y, z) de Studio. Chaque élément est translaté au coin minimal de sa boîte (précision des flottants 32 bits).
 * - **Matériaux** : un matériau par apparence d'affichage (lot E.5 : couleur `#rrggbb` → facteur linéaire, finition →
 *   rugosité, métal, opacité, **mêmes réglages que la vue 3D**, `STUDIO_FINITIONS_GLTF`) ; sans apparence, un matériau
 *   par calque, nommé d'après lui, avec les réglages par défaut de la vue et **aucune couleur déclarée** : il sert
 *   d'emplacement pour habiller le calque dans Blender. Ce sont des matériaux d'affichage, jamais des matériaux
 *   constructifs ; la finition « verre » ajoute `KHR_materials_transmission`.
 * - **Caméras** : une par scène enregistrée (position, cible, perspective avec son champ de vision vertical ou
 *   orthographique avec sa hauteur vue), avec les bornes de découpe de la vue 3D (0,01 m – 1 000 m).
 * - **Contours non extrudés** : lignes (`LINE_LOOP` fermé, `LINE_STRIP` ouvert) à z = 0, comme en OBJ.
 * - Ce qui n'est pas une géométrie (cotes, annotations, graphismes, propriétés…) est compté dans `asset.extras.bilan`.
 *
 * - **Script Blender** (`exportStudioBlender`, `.py`) : le même glTF, embarqué, avec le script qui l'importe dans
 *   Blender (3.6 et suivants), règle les unités en mètres, active la première caméra de scène (sinon pose une caméra
 *   cadrant le modèle, déclarée « caméra de cadrage »), choisit Cycles et, sur demande (`-- --blend chemin.blend`),
 *   enregistre le fichier `.blend`. Aucune lumière, aucun matériau ni aucune valeur de projet n'est inventé : le script
 *   n'ajoute qu'un ciel neutre d'éclairage d'appoint déclaré (monde gris uniforme) si la scène n'en a pas.
 *
 * Purs et déterministes : même document, même texte octet pour octet. Ni React, ni DOM, ni WebAssembly.
 */

export const STUDIO_CONTRAT_GLTF = "studio-export-gltf/1" as const;
export const STUDIO_CONTRAT_BLENDER = "studio-export-blender/1" as const;

/** Bornes de découpe des caméras (celles de la vue 3D de Studio), en mètres. */
export const STUDIO_DECOUPE_CAMERAS_GLTF = Object.freeze({ znear: 0.01, zfar: 1000 } as const);

/** Réglages glTF des finitions d'affichage : mêmes valeurs que les matériaux de la vue 3D (`parametresMateriau`). */
export const STUDIO_FINITIONS_GLTF: Readonly<Record<StudioFinitionAffichage | "aucune", { roughness: number; metalness: number; opacity: number }>> = Object.freeze({
  aucune: Object.freeze({ roughness: 0.85, metalness: 0, opacity: 1 }),
  matte: Object.freeze({ roughness: 0.95, metalness: 0, opacity: 1 }),
  satin: Object.freeze({ roughness: 0.55, metalness: 0, opacity: 1 }),
  gloss: Object.freeze({ roughness: 0.2, metalness: 0.1, opacity: 1 }),
  glass: Object.freeze({ roughness: 0.1, metalness: 0, opacity: 0.35 }),
});

/** Conversion explicite `local-3d` (z vers le haut) → glTF (y vers le haut) : (x, y, z) → (x, z, −y). */
export const studioGltfDepuisLocal3d = (p: StudioPoint3): [number, number, number] => [p.x, p.z, p.y === 0 ? 0 : -p.y];
/** Conversion inverse glTF → `local-3d` : (x, y, z) → (x, −z, y). */
export const studioGltfVersLocal3d = (p: readonly [number, number, number]): StudioPoint3 => ({ x: p[0], y: p[2] === 0 ? 0 : -p[2], z: p[1] });

/** Couleur sRGB `#rrggbb` → facteur linéaire (glTF déclare `baseColorFactor` en linéaire). */
export function studioCouleurLineaire(hex: string): [number, number, number] {
  const c = (i: number) => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    const l = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    return Math.round(l * 1e6) / 1e6;
  };
  return [c(0), c(1), c(2)];
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Base64 (RFC 4648) d'octets, sans dépendance au moteur (navigateur et serveur). */
export function studioBase64(octets: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < octets.length; i += 3) {
    const n = (octets[i]! << 16) | (octets[i + 1]! << 8) | octets[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const reste = octets.length - i;
  if (reste === 1) { const n = octets[i]! << 16; out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + "=="; }
  else if (reste === 2) { const n = (octets[i]! << 16) | (octets[i + 1]! << 8); out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + "="; }
  return out;
}

// ——— Écriture glTF ———

interface Accesseur { bufferView: number; componentType: number; count: number; type: "VEC3" | "SCALAR"; min?: number[]; max?: number[] }
interface Materiau { name: string; pbrMetallicRoughness: { baseColorFactor?: [number, number, number, number]; metallicFactor: number; roughnessFactor: number }; alphaMode?: "BLEND"; doubleSided: true; extensions?: { KHR_materials_transmission: { transmissionFactor: number } }; extras: Record<string, string> }
interface Noeud { name: string; children?: number[]; mesh?: number; camera?: number; translation?: [number, number, number]; rotation?: [number, number, number, number]; extras?: Record<string, string> }

/** Tampon binaire en construction : vues alignées sur 4 octets. */
class Tampon {
  private morceaux: Uint8Array[] = [];
  private longueur = 0;
  readonly vues: { buffer: 0; byteOffset: number; byteLength: number; target: number }[] = [];
  ajouter(octets: Uint8Array, target: number): number {
    this.vues.push({ buffer: 0, byteOffset: this.longueur, byteLength: octets.byteLength, target });
    this.morceaux.push(octets);
    this.longueur += octets.byteLength;
    const bourrage = (4 - (this.longueur % 4)) % 4;
    if (bourrage) { this.morceaux.push(new Uint8Array(bourrage)); this.longueur += bourrage; }
    return this.vues.length - 1;
  }
  octets(): Uint8Array {
    const out = new Uint8Array(this.longueur);
    let o = 0;
    for (const m of this.morceaux) { out.set(m, o); o += m.byteLength; }
    return out;
  }
}

/** Positions relatives au coin minimal (glTF), arrondies en flottants 32 bits ; min / max exacts de l'accesseur. */
function positions(points: readonly StudioPoint3[]): { origine: [number, number, number]; valeurs: Float32Array; min: number[]; max: number[] } {
  const g = points.map(studioGltfDepuisLocal3d);
  const origine = [0, 1, 2].map((k) => Number(nb(Math.min(...g.map((p) => p[k]!))))) as [number, number, number];
  const valeurs = new Float32Array(g.length * 3);
  g.forEach((p, i) => { for (let k = 0; k < 3; k++) valeurs[3 * i + k] = p[k]! - origine[k]!; });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < valeurs.length; i++) { const k = i % 3, v = valeurs[i]!; if (v < min[k]!) min[k] = v; if (v > max[k]!) max[k] = v; }
  return { origine, valeurs, min, max };
}

/** Rotation (quaternion x, y, z, w) d'une caméra glTF (regard vers −Z, haut +Y) placée en `de`, visant `vers`. */
export function studioGltfRotationCamera(de: StudioPoint3, vers: StudioPoint3): [number, number, number, number] {
  const p = studioGltfDepuisLocal3d(de), c = studioGltfDepuisLocal3d(vers);
  const f = norm([c[0] - p[0], c[1] - p[1], c[2] - p[2]]);
  // Haut du monde : +Y glTF (z de Studio) ; vue verticale (plan) : le nord de Studio (+y, soit −Z glTF) en haut de l'image.
  const haut: [number, number, number] = Math.abs(f[1]) > 0.999999 ? [0, 0, -1] : [0, 1, 0];
  const droite = norm(croix(f, haut));
  const vrai = croix(droite, f);
  const z: [number, number, number] = [-f[0], -f[1], -f[2]];
  // Matrice de colonnes (droite, vrai haut, −regard) → quaternion.
  const m00 = droite[0], m01 = vrai[0], m02 = z[0], m10 = droite[1], m11 = vrai[1], m12 = z[1], m20 = droite[2], m21 = vrai[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q: [number, number, number, number];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  return q.map((v) => Number(nb(v))) as [number, number, number, number];
}
const croix = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
function norm(v: readonly number[]): [number, number, number] {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return l > 0 ? [v[0]! / l, v[1]! / l, v[2]! / l] : [0, 0, -1];
}

/** Bilan de l'export glTF (et du script Blender, qui porte le même glTF). */
export function studioBilanExportGltf(document: StudioDocument, format: "gltf" | "blender" = "gltf"): StudioBilanExport3d {
  return studioBilanExport3d(document, format);
}

/** Objet glTF 2.0 du document (avant sérialisation). */
export function studioDocumentGltf(document: StudioDocument): Record<string, unknown> {
  const doc0 = validateStudioDocument(document);
  const { doc, masques } = studioToutVisibleExport3d(doc0);
  const mesh = studioMesh3d(doc);
  const bilan = studioBilanExport3d(doc0, "gltf");
  const nomsCalques = new Map((doc0.layers ?? []).map((l) => [l.id, l.name]));
  const tampon = new Tampon();
  const accesseurs: Accesseur[] = [];
  const maillages: { name: string; primitives: Record<string, unknown>[] }[] = [];
  const noeuds: Noeud[] = [{ name: "Fadi Studio", children: [], extras: { studioDocument: doc0.id, repere: "local-3d (z vers le haut) converti : (x, y, z) -> (x, z, -y)", unite: "m" } }];
  const materiaux: Materiau[] = [];
  const indexMateriau = new Map<string, number>();
  let transmission = false;
  const calques = new Map<string, number>();

  const materiauDe = (id: string, layerId: string | undefined): number => {
    const calque = layerId ?? STUDIO_DEFAULT_LAYER_ID;
    const a = studioApparenceResolue(doc0, id, layerId);
    const cle = a ? `apparence:${a.apparenceId}` : `calque:${calque}`;
    const deja = indexMateriau.get(cle);
    if (deja !== undefined) return deja;
    const r = STUDIO_FINITIONS_GLTF[a?.finish ?? "aucune"];
    const nomCalque = nomsCalques.get(calque) ?? (calque === STUDIO_DEFAULT_LAYER_ID ? "Calque implicite" : calque);
    const m: Materiau = a
      ? {
          name: a.source === "object" ? `Apparence ${id}` : `Apparence ${nomCalque}`,
          pbrMetallicRoughness: { baseColorFactor: [...studioCouleurLineaire(a.color), r.opacity], metallicFactor: r.metalness, roughnessFactor: r.roughness },
          ...(r.opacity < 1 ? { alphaMode: "BLEND" as const } : {}),
          doubleSided: true,
          ...(a.finish === "glass" ? { extensions: { KHR_materials_transmission: { transmissionFactor: 1 } } } : {}),
          extras: { studioApparence: a.apparenceId, couleur: a.color, finition: a.finish ?? "aucune", source: a.source === "object" ? "objet" : "calque" },
        }
      : { name: `Calque ${nomCalque}`, pbrMetallicRoughness: { metallicFactor: r.metalness, roughnessFactor: r.roughness }, doubleSided: true, extras: { studioCalque: calque, apparence: "aucune (couleur non déclarée)" } };
    if (a?.finish === "glass") transmission = true;
    materiaux.push(m);
    indexMateriau.set(cle, materiaux.length - 1);
    return materiaux.length - 1;
  };
  const noeudCalque = (layerId: string | undefined): number => {
    const calque = layerId ?? STUDIO_DEFAULT_LAYER_ID;
    const deja = calques.get(calque);
    if (deja !== undefined) return deja;
    const nom = nomsCalques.get(calque) ?? (calque === STUDIO_DEFAULT_LAYER_ID ? "Calque implicite" : calque);
    noeuds.push({ name: nom, children: [], extras: { studioCalque: calque, ...(masques.has(calque) ? { masqueDansStudio: "oui" } : {}) } });
    noeuds[0]!.children!.push(noeuds.length - 1);
    calques.set(calque, noeuds.length - 1);
    return noeuds.length - 1;
  };
  const accesseurPositions = (pts: readonly StudioPoint3[]) => {
    const p = positions(pts);
    const vue = tampon.ajouter(new Uint8Array(p.valeurs.buffer), 34962);
    accesseurs.push({ bufferView: vue, componentType: 5126, count: pts.length, type: "VEC3", min: p.min, max: p.max });
    return { accesseur: accesseurs.length - 1, origine: p.origine };
  };
  const poserNoeud = (id: string, layerId: string | undefined, categorie: string, primitive: Record<string, unknown>, origine: [number, number, number]) => {
    // Nœud du calque d'abord (créé au besoin), puis l'élément : chaque nœud n'a qu'un parent (exigence glTF).
    const parent = noeudCalque(layerId);
    maillages.push({ name: id, primitives: [primitive] });
    noeuds.push({ name: id, mesh: maillages.length - 1, translation: origine, extras: { studioId: id, categorie, calque: layerId ?? STUDIO_DEFAULT_LAYER_ID } });
    noeuds[parent]!.children!.push(noeuds.length - 1);
  };

  for (const e of studioElementsExport3d(mesh)) {
    if (!e.vertices.length || !e.triangles.length) continue;
    const { accesseur, origine } = accesseurPositions(e.vertices);
    const idx = new Uint32Array(e.triangles.flat());
    const vue = tampon.ajouter(new Uint8Array(idx.buffer), 34963);
    accesseurs.push({ bufferView: vue, componentType: 5125, count: idx.length, type: "SCALAR" });
    poserNoeud(e.id, e.layerId, e.categorie, { attributes: { POSITION: accesseur }, indices: accesseurs.length - 1, material: materiauDe(e.id, e.layerId), mode: 4 }, origine);
  }
  for (const o of mesh.outlines) {
    if (o.points.length < 2) continue;
    const { accesseur, origine } = accesseurPositions(o.points);
    poserNoeud(o.id, o.layerId, "contour-non-extrude", { attributes: { POSITION: accesseur }, material: materiauDe(o.id, o.layerId), mode: o.closed ? 2 : 3 }, origine);
  }

  // Caméras des scènes enregistrées (repère `local-3d` converti comme le maillage).
  const cameras: Record<string, unknown>[] = [];
  for (const s of studioScenes(doc0)) {
    cameras.push(cameraGltf(s));
    noeuds.push({ name: s.name, camera: cameras.length - 1, translation: studioGltfDepuisLocal3d(s.camera.position).map((v) => Number(nb(v))) as [number, number, number], rotation: studioGltfRotationCamera(s.camera.position, s.camera.target), extras: { studioScene: s.id } });
    noeuds[0]!.children!.push(noeuds.length - 1);
  }

  const octets = tampon.octets();
  const gltf: Record<string, unknown> = {
    asset: {
      version: "2.0", generator: `Fadi Studio (${STUDIO_CONTRAT_GLTF})`,
      extras: { contrat: STUDIO_CONTRAT_GLTF, document: doc0.id, unite: "m", repere: "glTF y vers le haut ; local-3d de Studio (z vers le haut) converti par (x, y, z) -> (x, z, -y)", bilan },
    },
    ...(transmission ? { extensionsUsed: ["KHR_materials_transmission"] } : {}),
    scene: 0,
    scenes: [{ name: doc0.id, nodes: [0] }],
    nodes: noeuds,
    ...(maillages.length ? { meshes: maillages } : {}),
    ...(materiaux.length ? { materials: materiaux } : {}),
    ...(cameras.length ? { cameras } : {}),
    ...(accesseurs.length ? { accessors: accesseurs } : {}),
    ...(tampon.vues.length ? { bufferViews: tampon.vues } : {}),
    ...(octets.byteLength ? { buffers: [{ byteLength: octets.byteLength, uri: `data:application/octet-stream;base64,${studioBase64(octets)}` }] } : {}),
  };
  return gltf;
}

function cameraGltf(s: StudioScene): Record<string, unknown> {
  const { znear, zfar } = STUDIO_DECOUPE_CAMERAS_GLTF;
  if (s.camera.projection === "perspective") return { name: s.name, type: "perspective", perspective: { yfov: Number(nb((s.camera.fov * Math.PI) / 180)), znear, zfar } };
  const demi = Number(nb(s.camera.height / 2));
  return { name: s.name, type: "orthographic", orthographic: { xmag: demi, ymag: demi, znear, zfar } };
}

/** glTF 2.0 (JSON, tampon intégré) du document ; texte terminé par une fin de ligne. */
export function exportStudioGltf(document: StudioDocument): string {
  return `${JSON.stringify(studioDocumentGltf(document))}\n`;
}

/** Littéral Python sûr (ASCII) d'une chaîne. */
const python = (s: string): string => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/**
 * Script Blender (Python, `bpy`) qui importe le glTF embarqué et prépare le rendu. Usage : ouvrir dans Blender
 * (Scripting → Ouvrir → Exécuter), ou `blender --python fichier.py`, ou en arrière-plan
 * `blender -b --python fichier.py -- --blend sortie.blend` pour enregistrer le `.blend`. Un fichier neuf ne garde pas
 * les objets d'usine (cube, lumière, caméra) ; un fichier de l'utilisateur n'est jamais vidé.
 */
export function exportStudioBlender(document: StudioDocument, nom = "fadi-studio"): string {
  const doc = validateStudioDocument(document);
  const gltf = exportStudioGltf(doc);
  const bilan = studioBilanExport3d(doc, "blender");
  const octets = new TextEncoder().encode(gltf);
  const b64 = studioBase64(octets);
  const lignes: string[] = [];
  for (let i = 0; i < b64.length; i += 100) lignes.push(`    "${b64.slice(i, i + 100)}"`);
  return [
    "# -*- coding: utf-8 -*-",
    `# Fadi Studio - export Blender, ${STUDIO_CONTRAT_BLENDER} (glTF 2.0 embarque, ${STUDIO_CONTRAT_GLTF})`,
    `# document : ${python(doc.id)}`,
    "# Usage : Blender > Scripting > Ouvrir ce fichier > Executer ;",
    "#         ou : blender --python ce-fichier.py",
    "#         ou, sans interface : blender -b --python ce-fichier.py -- --blend sortie.blend",
    "# Unite : metre. Repere Studio local-3d (z vers le haut) retrouve tel quel dans Blender.",
    "# Materiaux : apparences d'affichage de Studio (jamais des materiaux constructifs).",
    `# ecrits : ${bilan.ecrits} (dont ${bilan.masques} sur un calque masque)`,
    ...Object.entries(bilan.nonEcrits).sort(([a], [z]) => a.localeCompare(z)).map(([k, v]) => `# non ecrits, ${k} : ${v}`),
    "import base64, os, sys, tempfile",
    "import bpy",
    "",
    `NOM = ${python(nom)}`,
    "GLTF_BASE64 = (",
    ...lignes,
    ")",
    "",
    "def arguments():",
    "    args = sys.argv[sys.argv.index(\"--\") + 1:] if \"--\" in sys.argv else []",
    "    blend = None",
    "    if \"--blend\" in args and args.index(\"--blend\") + 1 < len(args):",
    "        blend = args[args.index(\"--blend\") + 1]",
    "    return {\"blend\": blend}",
    "",
    "def retirer_scene_usine():",
    "    # Fichier neuf, jamais enregistre ni modifie, avec les seuls objets d'usine (Cube, Light, Camera) : ils sont",
    "    # retires. Un fichier de l'utilisateur (enregistre, ou modifie meme sans etre enregistre) n'est jamais touche.",
    "    if bpy.data.filepath or bpy.data.is_dirty or sorted(o.name for o in bpy.data.objects) != [\"Camera\", \"Cube\", \"Light\"]:",
    "        return",
    "    cube = bpy.data.objects[\"Cube\"]",
    "    if cube.type != \"MESH\" or len(cube.data.vertices) != 8 or cube.modifiers or cube.location.length > 1e-6 or any(abs(v - 1.0) > 1e-6 for v in cube.scale):",
    "        return",
    "    for o in list(bpy.data.objects):",
    "        bpy.data.objects.remove(o, do_unlink=True)",
    "",
    "def importer():",
    "    retirer_scene_usine()",
    "    chemin = os.path.join(tempfile.mkdtemp(prefix=\"fadi-studio-\"), NOM + \".gltf\")",
    "    with open(chemin, \"wb\") as f:",
    "        f.write(base64.b64decode(\"\".join(GLTF_BASE64)))",
    "    avant = set(bpy.data.objects)",
    "    bpy.ops.import_scene.gltf(filepath=chemin)",
    "    return [o for o in bpy.data.objects if o not in avant]",
    "",
    "def preparer(objets):",
    "    scene = bpy.context.scene",
    "    scene.unit_settings.system = \"METRIC\"",
    "    scene.unit_settings.scale_length = 1.0",
    "    scene.unit_settings.length_unit = \"METERS\"",
    "    scene.render.engine = \"CYCLES\"",
    "    if scene.world is None:",
    "        # Eclairage d'appoint declare : monde gris uniforme, aucune lumiere inventee.",
    "        scene.world = bpy.data.worlds.new(\"Fadi Studio - monde neutre\")",
    "        scene.world.color = (0.8, 0.8, 0.8)",
    "    cameras = sorted([o for o in objets if o.type == \"CAMERA\"], key=lambda o: o.name)",
    "    if cameras:",
    "        scene.camera = cameras[0]",
    "        return",
    "    maillages = [o for o in objets if o.type == \"MESH\"]",
    "    if not maillages:",
    "        return",
    "    import mathutils",
    "    coins = [o.matrix_world @ mathutils.Vector(c) for o in maillages for c in o.bound_box]",
    "    mini = mathutils.Vector((min(c.x for c in coins), min(c.y for c in coins), min(c.z for c in coins)))",
    "    maxi = mathutils.Vector((max(c.x for c in coins), max(c.y for c in coins), max(c.z for c in coins)))",
    "    centre = (mini + maxi) / 2",
    "    rayon = max((maxi - mini).length / 2, 0.5)",
    "    donnees = bpy.data.cameras.new(\"Camera de cadrage\")",
    "    donnees.clip_start, donnees.clip_end = 0.01, 1000.0",
    "    camera = bpy.data.objects.new(\"Camera de cadrage\", donnees)",
    "    scene.collection.objects.link(camera)",
    "    camera.location = centre + mathutils.Vector((1.0, -1.0, 0.8)).normalized() * rayon * 3.0",
    "    camera.rotation_euler = (centre - camera.location).to_track_quat(\"-Z\", \"Y\").to_euler()",
    "    scene.camera = camera",
    "",
    "def principal():",
    "    a = arguments()",
    "    objets = importer()",
    "    preparer(objets)",
    "    if a[\"blend\"]:",
    "        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a[\"blend\"]))",
    "    print(\"Fadi Studio : %d objet(s) importe(s)\" % len(objets))",
    "",
    "principal()",
    "",
  ].join("\n");
}
