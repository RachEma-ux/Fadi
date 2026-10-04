/**
 * Rendu three.js de la scène 3D (L3b.1, R14, D-004) : WebGL2 par défaut ; WebGPU (`three/webgpu`) seulement sur
 * réglage, avec repli automatique sur WebGL2 (motif conservé dans `repli`). Le code est écrit une fois contre un
 * « espace three » (`Trois`) : le module `three` ou `three/webgpu`, jamais les deux à la fois, et sans les
 * extensions `three/addons` (elles importeraient une seconde copie de three) — caméra orbitale et fusion des
 * géométries sont donc faites ici.
 *
 * Une géométrie fusionnée par famille de matériau (murs, dalles, baies…) : peu d'appels de dessin, sélection par
 * l'indice du triangle touché (`plages`). Les objets sélectionnés sont redessinés par-dessus en surbrillance ; le
 * manipulateur décale cette surbrillance (`decalerSelection`) avant la validation des commandes.
 * Repère : x, y du repère local du projet, z vers le haut (altitude), en mètres.
 */
import type * as THREE from "three";
import type { IdObjet } from "@parcours/atelier-model";
import type { Prisme3d, Scene3d, Surface3d } from "./scene";

export type Trois = typeof THREE;
export type Moteur = "webgl2" | "webgpu";

export interface InfoRendu {
  readonly moteur: Moteur;
  readonly triangles: number;
  readonly appels: number;
  /** Objets du modèle présents dans la scène (prismes et baies, identifiants distincts). */
  readonly objets: number;
}

/** Couleurs simples par famille (matériaux de travail, pas de rendu réaliste). */
export const COULEURS: Readonly<Record<string, number>> = {
  mur: 0xdcd6cc,
  dalle: 0xb9c0c5,
  toiture: 0xa99a8a,
  escalier: 0xc8b597,
  poteau: 0x98a2a8,
  solide: 0xc9d6cf,
  autre: 0xcccccc,
};
const COULEUR_SELECTION = 0xe8833a;
const COULEUR_ARETES = 0x4a4f55;
const famille = (classe: string) => (classe in COULEURS ? classe : "autre");

interface Plage {
  readonly id: IdObjet;
  readonly debut: number;
  readonly fin: number;
}

/** Caméra orbitale : cible, azimut (rad, depuis +x), élévation (rad), distance (m). */
export interface Orbite {
  cible: [number, number, number];
  azimut: number;
  elevation: number;
  distance: number;
}

export interface Rendu3d {
  readonly moteur: Moteur;
  /** Motif du repli WebGPU → WebGL2, `null` sans repli. */
  readonly repli: string | null;
  dimensionner(largeur: number, hauteur: number, ratio: number): void;
  afficher(scene: Scene3d, options: { readonly selection: ReadonlySet<IdObjet>; readonly coupe: number | null }): void;
  /** Change la surbrillance sans reconstruire la scène. */
  selectionner(selection: ReadonlySet<IdObjet>): void;
  /** Cadre la caméra sur des bornes (vue axonométrique par défaut). */
  cadrer(bornes: Scene3d["bornes"]): void;
  orbiter(dxPx: number, dyPx: number): void;
  panoramique(dxPx: number, dyPx: number): void;
  zoomer(facteur: number): void;
  lireOrbite(): Orbite;
  /** Objet sous le pixel (coordonnées dans le canevas), ou `null`. */
  viser(x: number, y: number): IdObjet | null;
  /** Point du plan horizontal d'altitude `z` sous le pixel, ou `null` (rayon parallèle). */
  pointPlan(x: number, y: number, z: number): [number, number] | null;
  /** Décalage horizontal de la surbrillance (aperçu du manipulateur), en m. */
  decalerSelection(dx: number, dy: number): void;
  rendre(): InfoRendu;
  liberer(): void;
}

/** WebGL2 disponible dans ce navigateur ? */
export function webgl2Disponible(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

/** Crée le rendu : WebGPU si demandé et possible, sinon WebGL2 ; lève si WebGL2 manque aussi. */
export async function creerRendu(canevas: HTMLCanvasElement, voulu: Moteur): Promise<Rendu3d> {
  let repli: string | null = null;
  if (voulu === "webgpu") {
    const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    if (!gpu) repli = "WebGPU absent de ce navigateur";
    else {
      try {
        const T = (await import("three/webgpu")) as unknown as Trois & { WebGPURenderer: new (o: object) => THREE.WebGLRenderer & { init(): Promise<unknown> } };
        const r = new T.WebGPURenderer({ canvas: canevas, antialias: true });
        await r.init();
        return construire(T, r, "webgpu", null);
      } catch (e) {
        repli = `WebGPU indisponible (${e instanceof Error ? e.message : String(e)})`;
      }
    }
  }
  const contexte = canevas.getContext("webgl2", { antialias: true });
  if (!contexte) throw new Error("WebGL2 indisponible : la vue 3D exige WebGL2 (le plan 2D reste utilisable)");
  const T = (await import("three")) as Trois;
  const r = new T.WebGLRenderer({ canvas: canevas, context: contexte, antialias: true });
  r.localClippingEnabled = true;
  return construire(T, r, "webgl2", repli);
}

/** Géométrie d'un prisme (extrusion verticale du contour, trous compris), en coordonnées du projet. */
function geometriePrisme(T: Trois, p: Prisme3d, dx = 0, dy = 0): THREE.BufferGeometry {
  const forme = new T.Shape(p.contour.map(([x, y]) => new T.Vector2(x + dx, y + dy)));
  for (const t of p.trous) if (t.length >= 3) forme.holes.push(new T.Path(t.map(([x, y]) => new T.Vector2(x + dx, y + dy))));
  const g = new T.ExtrudeGeometry(forme, { depth: p.z1 - p.z0, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, p.z0);
  return g.index ? g.toNonIndexed() : g;
}

function geometrieSurface(T: Trois, s: Surface3d, dx = 0, dy = 0): THREE.BufferGeometry {
  const [a, b, c, d] = s.points;
  const g = new T.BufferGeometry();
  if (!a || !b || !c || !d) return g;
  const q = (p: readonly [number, number, number]) => [p[0] + dx, p[1] + dy, p[2]];
  g.setAttribute("position", new T.Float32BufferAttribute([...q(a), ...q(b), ...q(c), ...q(a), ...q(c), ...q(d)], 3));
  g.computeVertexNormals();
  return g;
}

/** Fusion de géométries non indexées (positions et normales) ; plages de triangles par objet. */
function fusionner(T: Trois, parties: readonly { id: IdObjet; g: THREE.BufferGeometry }[]): { g: THREE.BufferGeometry; plages: Plage[] } {
  let n = 0;
  for (const p of parties) n += p.g.getAttribute("position").count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const plages: Plage[] = [];
  let k = 0;
  for (const p of parties) {
    const a = p.g.getAttribute("position");
    if (!p.g.getAttribute("normal")) p.g.computeVertexNormals();
    const b = p.g.getAttribute("normal");
    pos.set(a.array as Float32Array, k * 3);
    nor.set(b.array as Float32Array, k * 3);
    plages.push({ id: p.id, debut: k / 3, fin: (k + a.count) / 3 });
    k += a.count;
    p.g.dispose();
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return { g, plages };
}

function idDuTriangle(plages: readonly Plage[], f: number): IdObjet | null {
  let lo = 0;
  let hi = plages.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    const p = plages[m] as Plage;
    if (f < p.debut) hi = m - 1;
    else if (f >= p.fin) lo = m + 1;
    else return p.id;
  }
  return null;
}

function construire(T: Trois, renderer: THREE.WebGLRenderer, moteur: Moteur, repli: string | null): Rendu3d {
  const scene = new T.Scene();
  scene.background = new T.Color(0xeef1f3);
  scene.add(new T.HemisphereLight(0xffffff, 0x8a8f94, 1.6));
  const soleil = new T.DirectionalLight(0xffffff, 1.4);
  soleil.position.set(-40, -60, 90);
  scene.add(soleil);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  const orbite: Orbite = { cible: [0, 0, 0], azimut: -Math.PI / 4, elevation: Math.PI / 5, distance: 60 };
  let hauteurPx = 1;

  const modele = new T.Group();
  const surbrillance = new T.Group();
  scene.add(modele, surbrillance);
  const plan = new T.Plane(new T.Vector3(0, 0, -1), 0);
  const materiaux = new Map<string, THREE.Material>();
  const materiau = (cle: string, fabrique: () => THREE.Material) => {
    let m = materiaux.get(cle);
    if (!m) materiaux.set(cle, (m = fabrique()));
    return m;
  };
  const pleins = (f: string) => materiau(`plein:${f}`, () => new T.MeshStandardMaterial({ color: COULEURS[f] ?? COULEURS.autre, roughness: 0.9, metalness: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  const vitre = (classe: string) => materiau(`baie:${classe}`, () => new T.MeshStandardMaterial({ color: classe === "fenetre" ? 0x7fb3bd : 0xb59a5b, transparent: true, opacity: classe === "fenetre" ? 0.4 : 0.5, side: T.DoubleSide, depthWrite: false }));
  const aretes = materiau("aretes", () => new T.LineBasicMaterial({ color: COULEUR_ARETES }));
  const selection = materiau("selection", () => new T.MeshStandardMaterial({ color: COULEUR_SELECTION, emissive: COULEUR_SELECTION, emissiveIntensity: 0.25, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  let pickables: { mesh: THREE.Mesh; plages: Plage[] }[] = [];
  let derniere: { scene: Scene3d; selection: ReadonlySet<IdObjet> } | null = null;
  let nbObjets = 0;

  const vider = (g: THREE.Group) => {
    for (const o of [...g.children]) {
      g.remove(o);
      (o as THREE.Mesh).geometry?.dispose();
    }
  };
  const placerCamera = () => {
    const [cx, cy, cz] = orbite.cible;
    const ce = Math.cos(orbite.elevation);
    camera.position.set(cx + orbite.distance * ce * Math.cos(orbite.azimut), cy + orbite.distance * ce * Math.sin(orbite.azimut), cz + orbite.distance * Math.sin(orbite.elevation));
    camera.lookAt(cx, cy, cz);
    camera.near = Math.max(0.05, orbite.distance / 1000);
    camera.far = orbite.distance * 50 + 1000;
    camera.updateProjectionMatrix();
  };
  let coupeCourante: number | null = null;
  const appliquerCoupe = (coupe: number | null) => {
    coupeCourante = coupe;
    plan.constant = coupe ?? 0;
    for (const m of materiaux.values()) {
      m.clippingPlanes = coupe === null ? null : [plan];
      m.needsUpdate = true;
    }
  };
  const dessinerSelection = (dx: number, dy: number) => {
    vider(surbrillance);
    if (!derniere || derniere.selection.size === 0) return;
    const parties: { id: IdObjet; g: THREE.BufferGeometry }[] = [];
    for (const p of derniere.scene.prismes) if (derniere.selection.has(p.objetId)) parties.push({ id: p.objetId, g: geometriePrisme(T, p, dx, dy) });
    for (const s of derniere.scene.surfaces) if (derniere.selection.has(s.objetId)) parties.push({ id: s.objetId, g: geometrieSurface(T, s, dx, dy) });
    if (parties.length === 0) return;
    surbrillance.add(new T.Mesh(fusionner(T, parties).g, selection));
  };
  const rayon = new T.Raycaster();
  const ndc = (x: number, y: number) => {
    const el = renderer.domElement;
    const l = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    return new T.Vector2((x / l) * 2 - 1, -(y / h) * 2 + 1);
  };

  const r: Rendu3d = {
    moteur,
    repli,
    dimensionner(largeur, hauteur, ratio) {
      hauteurPx = Math.max(1, hauteur);
      renderer.setPixelRatio(ratio);
      renderer.setSize(Math.max(1, largeur), hauteurPx, false);
      camera.aspect = Math.max(1, largeur) / hauteurPx;
      camera.updateProjectionMatrix();
    },
    afficher(sc, options) {
      vider(modele);
      pickables = [];
      const parFamille = new Map<string, { id: IdObjet; g: THREE.BufferGeometry }[]>();
      for (const p of sc.prismes) {
        const f = famille(p.classe);
        parFamille.set(f, [...(parFamille.get(f) ?? []), { id: p.objetId, g: geometriePrisme(T, p) }]);
      }
      for (const [f, parties] of parFamille) {
        const { g, plages } = fusionner(T, parties);
        const mesh = new T.Mesh(g, pleins(f));
        modele.add(mesh);
        modele.add(new T.LineSegments(new T.EdgesGeometry(g, 25), aretes));
        pickables.push({ mesh, plages });
      }
      const parBaie = new Map<string, { id: IdObjet; g: THREE.BufferGeometry }[]>();
      for (const s of sc.surfaces) parBaie.set(s.classe, [...(parBaie.get(s.classe) ?? []), { id: s.objetId, g: geometrieSurface(T, s) }]);
      for (const [classe, parties] of parBaie) {
        const { g, plages } = fusionner(T, parties);
        const mesh = new T.Mesh(g, vitre(classe));
        mesh.renderOrder = 1;
        modele.add(mesh);
        pickables.push({ mesh, plages });
      }
      nbObjets = new Set([...sc.prismes.map((p) => p.objetId), ...sc.surfaces.map((s) => s.objetId)]).size;
      derniere = { scene: sc, selection: options.selection };
      dessinerSelection(0, 0);
      appliquerCoupe(options.coupe);
    },
    selectionner(sel) {
      if (!derniere) return;
      derniere = { ...derniere, selection: sel };
      dessinerSelection(0, 0);
      appliquerCoupe(coupeCourante);
    },
    cadrer(bornes) {
      if (!bornes) return;
      const [x0, y0, z0] = bornes.min;
      const [x1, y1, z1] = bornes.max;
      orbite.cible = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      const rayonScene = Math.max(1, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2);
      orbite.distance = rayonScene / Math.sin((camera.fov * Math.PI) / 360) * 1.1;
      orbite.azimut = -Math.PI / 4;
      orbite.elevation = Math.PI / 5;
    },
    orbiter(dx, dy) {
      orbite.azimut -= (dx / hauteurPx) * Math.PI;
      orbite.elevation = Math.min(Math.PI / 2 - 0.01, Math.max(-Math.PI / 2 + 0.01, orbite.elevation + (dy / hauteurPx) * Math.PI));
    },
    panoramique(dx, dy) {
      // Un pixel vaut (2 d tan(fov/2)) / hauteur mètres au niveau de la cible.
      const m = (2 * orbite.distance * Math.tan((camera.fov * Math.PI) / 360)) / hauteurPx;
      placerCamera();
      const droite = new T.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-dx * m);
      const haut = new T.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(dy * m);
      const [cx, cy, cz] = orbite.cible;
      orbite.cible = [cx + droite.x + haut.x, cy + droite.y + haut.y, cz + droite.z + haut.z];
    },
    zoomer(facteur) {
      orbite.distance = Math.min(5000, Math.max(0.5, orbite.distance / facteur));
    },
    lireOrbite: () => ({ ...orbite, cible: [...orbite.cible] as [number, number, number] }),
    viser(x, y) {
      placerCamera();
      rayon.setFromCamera(ndc(x, y), camera);
      const meshes = pickables.map((p) => p.mesh);
      for (const hit of rayon.intersectObjects(meshes, false)) {
        if (hit.faceIndex == null) continue;
        // Ce qui est au-dessus du plan de coupe n'est pas dessiné : il ne se sélectionne pas non plus.
        if (coupeCourante !== null && hit.point.z > coupeCourante) continue;
        const p = pickables.find((q) => q.mesh === hit.object);
        const id = p ? idDuTriangle(p.plages, hit.faceIndex) : null;
        if (id) return id;
      }
      return null;
    },
    pointPlan(x, y, z) {
      placerCamera();
      rayon.setFromCamera(ndc(x, y), camera);
      const p = new T.Vector3();
      return rayon.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), -z), p) ? [p.x, p.y] : null;
    },
    decalerSelection(dx, dy) {
      dessinerSelection(dx, dy);
    },
    rendre() {
      placerCamera();
      renderer.render(scene, camera);
      const info = renderer.info.render;
      return { moteur, triangles: info.triangles, appels: info.calls, objets: nbObjets };
    },
    liberer() {
      vider(modele);
      vider(surbrillance);
      for (const m of materiaux.values()) m.dispose();
      renderer.dispose();
    },
  };
  return r;
}
