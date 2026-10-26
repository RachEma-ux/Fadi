import { validateStudioDocument, type StudioDocument } from "./document-2d.js";
import { studioMesh3d, type StudioMesh3d, type StudioPoint3 } from "./mesh-3d.js";
import { nb } from "./exporteurs/texte.js";
import { typeObjet } from "./objets/index.js";
import { studioCotesExtrusion } from "./noyau/types.js";
import { cotesSolide, empriseSolide, estBascule, estDroit } from "./objets-3d/solides.js";
import { studioMaillageSolide } from "./objets-3d/maillage.js";
import { lireArchitecture } from "./architecture/validation.js";
import { morceauxVolume } from "./architecture/geometrie.js";

/**
 * Exports 3D d'un document Studio (`studio-document/1`) — E.6-04, chacun avec son contrat :
 *
 * - **OBJ** (Wavefront, texte, `exportStudioObj`) : maillage triangulé de la vue 3D (`studioMesh3d`), repère `local-3d`
 *   (z vers le haut), **mètres** (déclarés en commentaire : OBJ ne porte aucune unité) ; un objet `o` par élément
 *   (identifiant Studio, échappé `~XXXX~` hors ASCII imprimable, réversible), un groupe `g` par calque ; les contours
 *   des objets non extrudés sont des lignes `l` à z = 0 ; aucun matériau (`mtllib` absent). Les ouvertures ne sont pas
 *   écrites : leur vide est déjà dans le maillage du mur.
 * - **STL** (ASCII, `exportStudioStl`) : une seule pièce `solid`, facettes triangulées des **solides** seulement (objets
 *   extrudés, solides libres, solides exacts, murs) avec leur normale calculée ; STL ne porte ni unité, ni identité, ni
 *   calque : ils sont perdus (déclaré). Les surfaces verticales sans épaisseur, les surfaces libres NURBS non épaissies
 *   (X.1-05 : nappes ouvertes, écrites en OBJ seulement), les surfaces de subdivision ouvertes et les contours plats ne
 *   sont pas écrits ; une surface de subdivision fermée (maillage étanche) est écrite.
 * - **STEP** (`studioPiecesStep`) : ce module ne calcule aucune géométrie exacte ; il décrit, pour le noyau exact
 *   (`@parcours/geometry-exact`, `exporterStepPieces`, côté serveur), une **pièce nommée** par élément solide : extrusion
 *   de l'emprise (objet extrudé, solide droit, morceaux pleins d'un mur), lissage réglé entre les deux faces (solide
 *   oblique ou basculé) ou brep du noyau (solide exact, dont une surface libre épaissie). Une surface libre non épaissie
 *   n'est pas un solide : comptée « surface-libre-non-epaissie », jamais écrite. Le document n'est jamais modifié : un objet paramétrique reste
 *   canonique, son extrusion n'est qu'une entrée de l'écriture (R15).
 *
 * Tous les calques sont écrits (un calque masqué l'est aussi, ses éléments sont comptés « masqués » dans l'en-tête), pour
 * qu'aucune géométrie ne disparaisse en silence ; cotes, annotations, graphismes, propriétés, scènes et éléments non
 * natifs ne sont pas des géométries 3D : ils sont comptés, jamais écrits. Purs et déterministes : même document, même
 * texte octet pour octet. Ni React, ni DOM, ni WebAssembly.
 */

export const STUDIO_FORMATS_3D = Object.freeze(["obj", "stl", "step"] as const);
export type StudioFormat3d = (typeof STUDIO_FORMATS_3D)[number];

/** Échappement réversible d'un identifiant pour OBJ et STEP : ASCII imprimable gardé (sauf espace, `~`, `'`, `\`). */
export function studioNomEchange3d(id: string): string {
  let out = "";
  for (const ch of id) {
    const c = ch.codePointAt(0)!;
    out += c > 0x20 && c < 0x7f && ch !== "~" && ch !== "'" && ch !== "\\" ? ch : `~${c.toString(16).toUpperCase().padStart(4, "0")}~`;
  }
  return out;
}

/** Inverse de `studioNomEchange3d`. */
export function studioIdDepuisNom3d(nom: string): string {
  return nom.replace(/~([0-9A-F]{4,6})~/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}

/** Document dont tous les calques sont visibles : les exports 3D n'écartent aucun calque masqué. */
function toutVisible(doc: StudioDocument): { doc: StudioDocument; masques: Set<string> } {
  const masques = new Set((doc.layers ?? []).filter((l) => !l.visible).map((l) => l.id));
  return { doc: masques.size ? { ...doc, layers: doc.layers!.map((l) => (l.visible ? l : { ...l, visible: true })) } : doc, masques };
}

/** Bilan d'un export 3D : ce qui est écrit et ce qui ne l'est pas, par raison (jamais écarté en silence). */
export interface StudioBilanExport3d {
  format: StudioFormat3d;
  /** Éléments écrits comme solides ou surfaces (pièces STEP, objets OBJ, solides STL). */
  ecrits: number;
  /** Éléments écrits dont le calque est masqué. */
  masques: number;
  /** Comptes des éléments non écrits, par raison. */
  nonEcrits: Readonly<Record<string, number>>;
}

interface Element3d { id: string; layerId?: string; categorie: "objet" | "solide" | "exact" | "mur" | "surface" | "surface-libre" | "subdivision-fermee" | "subdivision-ouverte"; vertices: StudioPoint3[]; triangles: [number, number, number][] }

function elements3d(mesh: StudioMesh3d): Element3d[] {
  const out: Element3d[] = [];
  const lay = (l: string | undefined) => (l !== undefined ? { layerId: l } : {});
  for (const s of mesh.solids) out.push({ id: s.id, ...lay(s.layerId), categorie: s.kind === "prism" ? "objet" : "surface", vertices: s.vertices, triangles: s.triangles });
  for (const s of mesh.freeSolids ?? []) out.push({ id: s.id, ...lay(s.layerId), categorie: "solide", vertices: s.vertices, triangles: s.triangles });
  for (const s of mesh.exacts ?? []) out.push({ id: s.id, ...lay(s.layerId), categorie: "exact", vertices: s.vertices, triangles: s.triangles });
  for (const s of mesh.surfaces ?? []) out.push({ id: s.id, ...lay(s.layerId), categorie: "surface-libre", vertices: s.vertices, triangles: s.triangles });
  for (const s of mesh.subdivisions ?? []) out.push({ id: s.id, ...lay(s.layerId), categorie: s.fermee ? "subdivision-fermee" : "subdivision-ouverte", vertices: s.vertices, triangles: s.triangles });
  for (const s of mesh.architecture ?? []) if (s.type === "wall") out.push({ id: s.id, ...lay(s.layerId), categorie: "mur", vertices: s.vertices, triangles: s.triangles });
  return out;
}

/** Éléments du document qui ne sont pas des géométries 3D (comptés, jamais écrits). */
function horsGeometrie(doc: StudioDocument): Record<string, number> {
  const c: Record<string, number> = {};
  const n = (k: string, v: number) => { if (v > 0) c[k] = (c[k] ?? 0) + v; };
  n("cote", doc.dimensions?.length ?? 0);
  n("annotation", doc.annotations?.length ?? 0);
  n("graphisme", doc.graphismes?.length ?? 0);
  n("ouverture-vide-du-mur", (doc.architecture ?? []).filter((a) => a.type === "opening").length);
  n("propriete", doc.proprietes?.length ?? 0);
  n("visualisation", doc.scenes?.length ?? 0);
  n("non-natif", doc.nonNatifs?.length ?? 0);
  return c;
}

const bilanEntete = (b: StudioBilanExport3d): string[] => [
  `ecrits : ${b.ecrits} (dont ${b.masques} sur un calque masque)`,
  ...Object.entries(b.nonEcrits).sort(([a], [z]) => a.localeCompare(z)).map(([k, v]) => `non ecrits, ${k} : ${v}`),
];

/** Bilan seul (sans écrire le fichier) ; mêmes comptes que l'en-tête du fichier. */
export function studioBilanExport3d(document: StudioDocument, format: StudioFormat3d): StudioBilanExport3d {
  const doc = validateStudioDocument(document);
  if (format === "step") return studioPiecesStep(doc).bilan;
  const { doc: d, masques } = toutVisible(doc);
  const mesh = studioMesh3d(d);
  const els = elements3d(mesh);
  const nonEcrits = horsGeometrie(doc);
  const ajouter = (k: string, v: number) => { if (v > 0) nonEcrits[k] = (nonEcrits[k] ?? 0) + v; };
  let ecrits: Element3d[];
  if (format === "obj") {
    ecrits = els;
  } else {
    ecrits = els.filter((e) => e.categorie !== "surface" && e.categorie !== "surface-libre" && e.categorie !== "subdivision-ouverte");
    ajouter("surface-sans-epaisseur", els.filter((e) => e.categorie === "surface").length);
    ajouter("surface-libre-non-epaissie", els.filter((e) => e.categorie === "surface-libre").length);
    ajouter("surface-subdivision-ouverte", els.filter((e) => e.categorie === "subdivision-ouverte").length);
    ajouter("contour-non-extrude", mesh.outlines.length);
  }
  const lignes = format === "obj" ? mesh.outlines.length : 0;
  return { format, ecrits: ecrits.length + lignes, masques: [...ecrits, ...(format === "obj" ? mesh.outlines : [])].filter((e) => e.layerId !== undefined && masques.has(e.layerId)).length, nonEcrits };
}

/**
 * OBJ (Wavefront) du document : sommets `v x y z` (mètres, repère `local-3d`), un objet `o` par élément, faces `f`
 * triangulaires (indices globaux à partir de 1, sens direct vers l'extérieur), contours non extrudés en lignes `l`.
 */
export function exportStudioObj(document: StudioDocument): string {
  const doc0 = validateStudioDocument(document);
  const { doc, masques } = toutVisible(doc0);
  const mesh = studioMesh3d(doc);
  const bilan = studioBilanExport3d(doc0, "obj");
  const l: string[] = [
    "# Fadi Studio - export OBJ (Wavefront), studio-export-obj/1",
    `# document : ${studioNomEchange3d(doc0.id)}`,
    "# repere local-3d (z vers le haut), unite : metre (OBJ ne porte aucune unite)",
    "# aucun materiau ; identifiants Studio echappes ~XXXX~ hors ASCII imprimable",
    ...bilanEntete(bilan).map((s) => `# ${s}`),
  ];
  let base = 1;
  let groupe: string | undefined;
  const ouvrir = (id: string, layerId: string | undefined) => {
    const g = layerId === undefined ? "studio-calque-implicite" : studioNomEchange3d(layerId);
    if (g !== groupe) { l.push(`g ${g}`); groupe = g; }
    l.push(`o ${studioNomEchange3d(id)}`);
    if (layerId !== undefined && masques.has(layerId)) l.push("# calque masque dans Studio");
  };
  for (const e of elements3d(mesh)) {
    ouvrir(e.id, e.layerId);
    for (const v of e.vertices) l.push(`v ${nb(v.x)} ${nb(v.y)} ${nb(v.z)}`);
    for (const [a, b, c] of e.triangles) l.push(`f ${a + base} ${b + base} ${c + base}`);
    base += e.vertices.length;
  }
  for (const o of mesh.outlines) {
    ouvrir(o.id, o.layerId);
    for (const v of o.points) l.push(`v ${nb(v.x)} ${nb(v.y)} ${nb(v.z)}`);
    const idx = o.points.map((_, i) => i + base);
    if (o.closed) idx.push(base);
    l.push(`l ${idx.join(" ")}`);
    base += o.points.length;
  }
  l.push("");
  return l.join("\n");
}

const sous = (a: StudioPoint3, b: StudioPoint3): StudioPoint3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
function normale(a: StudioPoint3, b: StudioPoint3, c: StudioPoint3): StudioPoint3 {
  const u = sous(b, a), v = sous(c, a);
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const L = Math.hypot(n.x, n.y, n.z);
  return L > 0 ? { x: n.x / L, y: n.y / L, z: n.z / L } : { x: 0, y: 0, z: 0 };
}

/**
 * STL ASCII du document : une pièce `solid`, une facette par triangle des solides (normale unitaire calculée, sommets
 * dans le sens direct), mètres. Surfaces sans épaisseur et contours plats non écrits (comptés dans l'en-tête).
 */
export function exportStudioStl(document: StudioDocument): string {
  const doc0 = validateStudioDocument(document);
  const { doc } = toutVisible(doc0);
  const mesh = studioMesh3d(doc);
  // STL n'a pas de commentaire : le bilan (`studioBilanExport3d`) est servi à part, jamais mêlé aux facettes.
  const nom = `fadi-studio ${studioNomEchange3d(doc0.id)}`;
  const l: string[] = [`solid ${nom}`];
  const p = (v: StudioPoint3) => `${nb(v.x)} ${nb(v.y)} ${nb(v.z)}`;
  for (const e of elements3d(mesh)) {
    if (e.categorie === "surface" || e.categorie === "surface-libre" || e.categorie === "subdivision-ouverte") continue;
    for (const [a, b, c] of e.triangles) {
      const A = e.vertices[a]!, B = e.vertices[b]!, C = e.vertices[c]!;
      const n = normale(A, B, C);
      l.push(`  facet normal ${nb(n.x)} ${nb(n.y)} ${nb(n.z)}`, "    outer loop", `      vertex ${p(A)}`, `      vertex ${p(B)}`, `      vertex ${p(C)}`, "    endloop", "  endfacet");
    }
  }
  l.push(`endsolid ${nom}`, "");
  return l.join("\n");
}

// ——— STEP : pièces décrites pour le noyau exact ———

export interface StudioPoint2Step { x: number; y: number }
export type StudioSolideStep =
  | { extrusion: { profil: StudioPoint2Step[]; z0: number; hauteur: number } }
  | { lissage: [StudioPoint3[], StudioPoint3[]] }
  | { brep: string };

export interface StudioPieceStep {
  /** Identifiant Studio échappé (`studioNomEchange3d`) : nom du produit STEP. */
  nom: string;
  categorie: "objet" | "solide" | "exact" | "mur";
  solides: StudioSolideStep[];
}

/**
 * Pièces STEP du document : une par objet extrudé fermé (ou ligne / arc avec épaisseur), solide libre, solide exact et
 * mur (morceaux pleins juxtaposés, vides des ouvertures déduits, jamais fusionnés) ; les courbes des emprises sont celles
 * de la vue 3D (cercles et arcs discrétisés) ; les surfaces sans épaisseur ne sont pas des solides : comptées.
 */
export function studioPiecesStep(document: StudioDocument): { pieces: StudioPieceStep[]; bilan: StudioBilanExport3d } {
  const doc = validateStudioDocument(document);
  const masques = new Set((doc.layers ?? []).filter((l) => !l.visible).map((l) => l.id));
  const pieces: StudioPieceStep[] = [];
  const nonEcrits = horsGeometrie(doc);
  const ajouter = (k: string) => { nonEcrits[k] = (nonEcrits[k] ?? 0) + 1; };
  let nMasques = 0;
  const poser = (p: StudioPieceStep, layerId: string | undefined) => { pieces.push(p); if (layerId !== undefined && masques.has(layerId)) nMasques++; };
  const plan = (pts: readonly StudioPoint3[]) => pts.map((v) => ({ x: v.x, y: v.y }));
  for (const o of doc.objects) {
    if (!o.extrusion) { ajouter("contour-non-extrude"); continue; }
    const { zMin, zMax } = studioCotesExtrusion(o.extrusion);
    const v = typeObjet(o).volume(o, zMin, zMax);
    if (!v || v.kind !== "prism") { ajouter("surface-sans-epaisseur"); continue; }
    const n = v.geometry.vertices.length / 2;
    poser({ nom: studioNomEchange3d(o.id), categorie: "objet", solides: [{ extrusion: { profil: plan(v.geometry.vertices.slice(0, n)), z0: zMin, hauteur: zMax - zMin } }] }, o.layerId);
  }
  for (const s of doc.solides ?? []) {
    let solide: StudioSolideStep;
    if (estDroit(s) && !estBascule(s)) {
      const { zMin, zMax } = cotesSolide(s);
      solide = { extrusion: { profil: empriseSolide(s).map((p) => ({ x: p.x, y: p.y })), z0: zMin, hauteur: zMax - zMin } };
    } else {
      // Oblique ou basculé : lissage réglé entre la face de départ et la face d'arrivée (faces latérales planes, exact).
      const m = studioMaillageSolide(s);
      const n = m.vertices.length / 2;
      solide = { lissage: [m.vertices.slice(0, n), m.vertices.slice(n)] };
    }
    poser({ nom: studioNomEchange3d(s.id), categorie: "solide", solides: [solide] }, s.layerId);
  }
  for (const s of doc.exacts ?? []) poser({ nom: studioNomEchange3d(s.id), categorie: "exact", solides: [{ brep: s.resultat.brep }] }, s.layerId);
  for (const _ of doc.surfaces ?? []) ajouter("surface-libre-non-epaissie");
  // Surface de subdivision : aucun équivalent exact (maillage) ; solidifiée, c'est un solide exact (écrit ci-dessus).
  for (const _ of doc.subdivisions ?? []) ajouter("surface-subdivision-non-solidifiee");
  if (doc.architecture?.length) {
    const lue = lireArchitecture(doc.architecture);
    for (const { mur, geometrie, ouvertures } of lue.murs.values()) {
      const morceaux = morceauxVolume(mur, geometrie, ouvertures);
      poser({ nom: studioNomEchange3d(mur.id), categorie: "mur", solides: morceaux.map((m) => ({ extrusion: { profil: m.plan.map((p) => ({ x: p.x, y: p.y })), z0: m.zMin, hauteur: m.zMax - m.zMin } })) }, mur.layerId);
    }
  }
  return { pieces, bilan: { format: "step", ecrits: pieces.length, masques: nMasques, nonEcrits } };
}
