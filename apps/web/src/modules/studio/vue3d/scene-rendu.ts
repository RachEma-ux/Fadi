/**
 * Scène de rendu incrémentale de la vue 3D (lot C.2) : un cache d'objets three.js par objet Studio, rangé sous une
 * **signature** (clé de projection du morceau de maillage, empreinte de contenu, plus l'aspect d'affichage). À chaque
 * mise à jour, seuls les objets dont la signature change sont reconstruits ; les objets remplacés ou retirés sont
 * libérés (géométries, matériaux, textures : `ressources-gpu.ts`, D.3-02).
 *
 * Lots (C.2-02) : les volumes opaques nombreux (murs, objets 2D extrudés) sont fusionnés par aspect en lots stables —
 * l'objet va au lot `empreinte(id) mod LOTS_PAR_ASPECT`, indépendamment des autres objets : un ajout, une suppression ou
 * une modification ne reconstruit que le lot de l'objet. Chaque lot porte sa table de désignation (`picking.ts`) :
 * triangle du lot → identifiant Studio ; un clic se résout donc toujours vers le bon objet.
 *
 * Ni React ni DOM : three.js seulement (aucun contexte WebGL requis pour construire ni libérer).
 */
import * as THREE from "three";
import type { StudioFinitionAffichage, StudioModeAffichage } from "@parcours/atelier-model";
import { libererObjet } from "./ressources-gpu";
import { tablePicking, type TablePicking } from "./picking";
import { parametresMateriau } from "./scenes/scenes-ui";

/** Lots par aspect d'affichage : borne de rendu choisie par Fadi (appels de dessin bornés), pas une mesure métier. */
export const LOTS_PAR_ASPECT = 64;

export interface GeometrieObjet {
  vertices: readonly { x: number; y: number; z: number }[];
  triangles: readonly (readonly [number, number, number])[];
  edges: readonly (readonly [number, number])[];
}

/** Aspect d'un volume : couleur, finition, mode d'affichage ; `apparence` : couleur venue d'une apparence déclarée. */
export interface AspectVolume { couleur: number; finition?: StudioFinitionAffichage; mode: StudioModeAffichage; apparence: boolean; double: boolean }

export const cleAspect = (a: AspectVolume): string => `${a.couleur.toString(16)}/${a.finition ?? ""}/${a.mode}/${a.apparence ? 1 : 0}/${a.double ? 1 : 0}`;

/** Tableaux prêts pour le GPU d'une géométrie de morceau (mémorisés : le morceau repris garde les siens). */
interface Prepare { positions: Float32Array; index: Uint32Array; aretes: Float32Array }
const PREPARES = new WeakMap<GeometrieObjet, Prepare>();
export function preparer(g: GeometrieObjet): Prepare {
  let p = PREPARES.get(g);
  if (p) return p;
  const positions = new Float32Array(g.vertices.length * 3);
  g.vertices.forEach((v, i) => { positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z; });
  const index = new Uint32Array(g.triangles.length * 3);
  g.triangles.forEach((t, i) => { index[i * 3] = t[0]; index[i * 3 + 1] = t[1]; index[i * 3 + 2] = t[2]; });
  const aretes = new Float32Array(g.edges.length * 6);
  g.edges.forEach(([a, b], i) => {
    const va = g.vertices[a]!, vb = g.vertices[b]!;
    aretes.set([va.x, va.y, va.z, vb.x, vb.y, vb.z], i * 6);
  });
  p = { positions, index, aretes };
  PREPARES.set(g, p);
  return p;
}

function materiauVolume(aspect: AspectVolume): THREE.MeshStandardMaterial {
  const p = parametresMateriau(aspect.finition);
  const m = new THREE.MeshStandardMaterial({ color: aspect.couleur, roughness: p.roughness, metalness: p.metalness, transparent: p.transparent, opacity: p.opacity, depthWrite: !p.transparent, flatShading: true, side: aspect.double || p.transparent ? THREE.DoubleSide : THREE.FrontSide });
  // Filaire : la surface reste désignable (clic) mais n'est pas dessinée.
  m.visible = aspect.mode !== "wireframe";
  return m;
}

/** Surface (et arêtes selon le mode) d'un ou de plusieurs morceaux fusionnés. */
export function objetsVolume(parts: readonly Prepare[], aspect: AspectVolume): { surface: THREE.Mesh; aretes: THREE.LineSegments | null } {
  let nv = 0, ni = 0, na = 0;
  for (const p of parts) { nv += p.positions.length; ni += p.index.length; na += p.aretes.length; }
  // Un morceau seul partage ses tableaux préparés (jamais modifiés) ; un lot les concatène.
  const positions = parts.length === 1 ? parts[0]!.positions : new Float32Array(nv);
  const index = parts.length === 1 ? parts[0]!.index : new Uint32Array(ni);
  if (parts.length !== 1) {
    let ov = 0, oi = 0;
    for (const p of parts) {
      positions.set(p.positions, ov);
      const base = ov / 3;
      for (let k = 0; k < p.index.length; k++) index[oi + k] = p.index[k]! + base;
      ov += p.positions.length; oi += p.index.length;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  const surface = new THREE.Mesh(g, materiauVolume(aspect));
  if (aspect.mode === "shaded") return { surface, aretes: null };
  const a = parts.length === 1 ? parts[0]!.aretes : new Float32Array(na);
  if (parts.length !== 1) { let oa = 0; for (const p of parts) { a.set(p.aretes, oa); oa += p.aretes.length; } }
  const ga = new THREE.BufferGeometry();
  ga.setAttribute("position", new THREE.BufferAttribute(a, 3));
  return { surface, aretes: new THREE.LineSegments(ga, new THREE.LineBasicMaterial({ color: aspect.mode === "wireframe" && aspect.apparence ? aspect.couleur : 0x234f5b })) };
}

/**
 * Entrée de la scène : un objet fusionnable dans un lot (`lot` : famille du lot, géométrie et aspect), ou un objet
 * construit seul (`construire`). La `signature` décide de la reconstruction.
 */
export type EntreeRendu =
  | { id: string; signature: string; lot: string; geometrie: GeometrieObjet; aspect: AspectVolume }
  | { id: string; signature: string; lot?: undefined; construire: () => THREE.Object3D[] };

export interface BilanRendu {
  /** Objets reconstruits seuls, lots reconstruits. */
  construits: number;
  lotsConstruits: number;
  /** Objets et lots conservés tels quels. */
  conserves: number;
  /** Objets et lots retirés et libérés. */
  liberes: number;
}

interface Tenu { signature: string; objets: THREE.Object3D[] }

function hacherId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/** Données de désignation portées par la surface d'un lot. */
export interface DonneesLot { table: TablePicking; famille: string }

export class SceneRendu {
  private readonly seuls = new Map<string, Tenu>();
  private readonly lots = new Map<string, Tenu & { table: TablePicking }>();

  constructor(private readonly groupe: THREE.Group, private readonly lotsParAspect = LOTS_PAR_ASPECT) {}

  /** Met la scène à `entrees` (ordre du document) ; `version` : version de la projection, portée par les tables. */
  mettreAJour(entrees: readonly EntreeRendu[], version: string): BilanRendu {
    const bilan: BilanRendu = { construits: 0, lotsConstruits: 0, conserves: 0, liberes: 0 };
    const vus = new Set<string>();
    const membres = new Map<string, Extract<EntreeRendu, { lot: string }>[]>();
    for (const e of entrees) {
      if (e.lot !== undefined) {
        const cle = `${e.lot}|${cleAspect(e.aspect)}#${hacherId(e.id) % this.lotsParAspect}`;
        (membres.get(cle) ?? membres.set(cle, []).get(cle)!).push(e);
        continue;
      }
      vus.add(e.id);
      const tenu = this.seuls.get(e.id);
      if (tenu?.signature === e.signature) { bilan.conserves++; continue; }
      if (tenu) this.retirer(tenu);
      const objets = e.construire();
      for (const o of objets) this.groupe.add(o);
      this.seuls.set(e.id, { signature: e.signature, objets });
      bilan.construits++;
    }
    for (const [id, tenu] of this.seuls) if (!vus.has(id)) { this.retirer(tenu); this.seuls.delete(id); bilan.liberes++; }
    for (const [cle, liste] of membres) {
      const signature = liste.map((e) => `${e.id}:${e.signature}`).join(",");
      const tenu = this.lots.get(cle);
      if (tenu?.signature === signature) { bilan.conserves++; continue; }
      if (tenu) this.retirer(tenu);
      const parts = liste.map((e) => preparer(e.geometrie));
      const table = tablePicking(version, liste.map((e, i) => ({ id: e.id, triangles: parts[i]!.index.length / 3 })));
      const { surface, aretes } = objetsVolume(parts, liste[0]!.aspect);
      const donnees: DonneesLot = { table, famille: liste[0]!.lot };
      surface.userData.lot = donnees;
      surface.name = `lot:${cle}`;
      const objets: THREE.Object3D[] = aretes ? [surface, aretes] : [surface];
      for (const o of objets) this.groupe.add(o);
      this.lots.set(cle, { signature, objets, table });
      bilan.lotsConstruits++;
    }
    for (const [cle, tenu] of this.lots) if (!membres.has(cle)) { this.retirer(tenu); this.lots.delete(cle); bilan.liberes++; }
    return bilan;
  }

  /** Nombre d'objets three.js tenus (seuls et lots), pour la recette. */
  get taille(): { seuls: number; lots: number } { return { seuls: this.seuls.size, lots: this.lots.size }; }

  /** Retire et libère tout. */
  vider(): void {
    for (const t of this.seuls.values()) this.retirer(t);
    for (const t of this.lots.values()) this.retirer(t);
    this.seuls.clear();
    this.lots.clear();
  }

  private retirer(t: Tenu): void {
    for (const o of t.objets) { this.groupe.remove(o); libererObjet(o); }
  }
}
