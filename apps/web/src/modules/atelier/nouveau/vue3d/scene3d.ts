/**
 * Scène 3D du nouvel Atelier (lot 3b, D-004) : three.js WebGL2 par défaut, WebGPU en option avec repli. La scène
 * ne fait que copier les maillages purs de `@parcours/atelier-model` (`maillageObjet`) dans des tampons groupés
 * par niveau et par matériau (peu d'appels de dessin, cf. p0-mesures : 1 199 → 24) ; une table triangle → objet
 * sert à la sélection. Rendu à la demande (pas de boucle continue). Aucune donnée n'est écrite dans le modèle.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { englobant, maillageObjet, niveauxOrdonnes, type Maillage, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";

export type VueTechnique = "perspective" | "dessus" | "coupe-ns" | "coupe-eo" | "facade-sud" | "facade-nord" | "facade-est" | "facade-ouest";
export type Presentation = "batiment" | "niveau" | "eclate";

export interface OptionsScene {
  vue: VueTechnique;
  presentation: Presentation;
  niveauActif: string | null;
  /** Coupe horizontale (perspective) : hauteur au-dessus du niveau actif, ou null. */
  coupeHorizontale: number | null;
  /** Position de la coupe verticale, 0–1 sur l'étendue du bâtiment. */
  positionCoupe: number;
  aretes: boolean;
}

interface Lot {
  maillage: THREE.Mesh;
  aretes: THREE.LineSegments | null;
  /** Premier triangle de chaque objet (croissant) et son identifiant. */
  debuts: number[];
  ids: string[];
}

export interface MesuresRendu {
  rendus: number[];
  appels: number;
  triangles: number;
  moteur: "webgl2" | "webgpu";
  /** Position à l'écran (px, relative au canevas) du haut d'un objet : instrumentation de la recette. */
  localiser?: (objetId: string) => { x: number; y: number } | null;
  /** Objet sous un point écran (instrumentation de la recette). */
  sonder?: (x: number, y: number) => string | null;
}

const ECART_ECLATE = 4;

declare global {
  interface Window {
    fadiMesures3D?: MesuresRendu;
  }
}

/** Renderer commun aux deux moteurs (sous-ensemble utilisé). */
interface Moteur {
  setPixelRatio(r: number): void;
  setSize(w: number, h: number, styles?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
  localClippingEnabled: boolean;
  setClearColor(c: THREE.ColorRepresentation, a?: number): void;
  info: { render: { calls: number; triangles: number } };
}

let sceneActive: Scene3D | null = null;

/** Image PNG de la vue 3D affichée (export « vue »), ou null sans vue 3D ouverte. */
export function captureVue3D(): Promise<Blob | null> {
  return sceneActive ? sceneActive.capturer() : Promise.resolve(null);
}

export class Scene3D {
  private moteur!: Moteur;
  readonly scene = new THREE.Scene();
  private perspective = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  private ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -5000, 5000);
  private camera: THREE.Camera = this.perspective;
  private controles!: OrbitControls;
  private groupes = new Map<string, THREE.Group>();
  private lots: Lot[] = [];
  private selection = new THREE.Group();
  private apercu = new THREE.Group();
  private materiaux = new Map<string, THREE.MeshStandardMaterial>();
  private matSelection = new THREE.MeshStandardMaterial({ color: "#b3872f", emissive: "#5a3f0c", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, flatShading: true });
  private matApercu = new THREE.MeshStandardMaterial({ color: "#b3521f", transparent: true, opacity: 0.55, side: THREE.DoubleSide, flatShading: true, depthWrite: false });
  private matAretes = new THREE.LineBasicMaterial({ color: "#2d4a40", transparent: true, opacity: 0.35 });
  private plans: THREE.Plane[] = [];
  private cache = new WeakMap<object, { cle: string; m: Maillage | null }>();
  private etat: ModeleAtelier | null = null;
  private options: OptionsScene | null = null;
  private boite = new THREE.Box3();
  private demande = 0;
  private largeur = 1;
  private hauteur = 1;
  readonly mesures: MesuresRendu = { rendus: [], appels: 0, triangles: 0, moteur: "webgl2" };
  onRendu: (() => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color("#eef2ee");
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#b9c2bb", 1.6));
    const soleil = new THREE.DirectionalLight("#ffffff", 1.4);
    soleil.position.set(-40, -60, 90);
    this.scene.add(soleil);
    this.scene.add(this.selection, this.apercu);
    this.perspective.up.set(0, 0, 1);
    this.ortho.up.set(0, 0, 1);
  }

  /** Crée le moteur : WebGPU si demandé et disponible, sinon WebGL2. Renvoie le moteur effectif. */
  async initialiser(webgpu: boolean): Promise<"webgl2" | "webgpu"> {
    let moteur: Moteur | null = null;
    if (webgpu && typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        const module = await import("three/webgpu");
        const r = new module.WebGPURenderer({ canvas: this.canvas, antialias: true });
        await r.init();
        moteur = r as unknown as Moteur;
        this.mesures.moteur = "webgpu";
      } catch {
        moteur = null;
      }
    }
    if (!moteur) {
      moteur = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" }) as unknown as Moteur;
      this.mesures.moteur = "webgl2";
    }
    this.moteur = moteur;
    this.moteur.localClippingEnabled = true;
    this.moteur.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.controles = new OrbitControls(this.perspective, this.canvas);
    this.controles.enableDamping = false;
    this.controles.addEventListener("change", () => this.rendre());
    sceneActive = this;
    this.mesures.localiser = (id) => this.ecranDe(id);
    this.mesures.sonder = (x, y) => this.pointer(x, y)?.objetId ?? null;
    window.fadiMesures3D = this.mesures;
    return this.mesures.moteur;
  }

  redimensionner(w: number, h: number): void {
    this.largeur = Math.max(1, w);
    this.hauteur = Math.max(1, h);
    this.moteur.setSize(this.largeur, this.hauteur, false);
    this.perspective.aspect = this.largeur / this.hauteur;
    this.perspective.updateProjectionMatrix();
    this.ajusterOrtho();
    this.rendre();
  }

  /** Maillage d'un objet, recalculé seulement si l'objet (ou ce dont il dépend) a changé. */
  private maillage(etat: ModeleAtelier, o: OccurrenceQuelconque, cleNiveaux: string): Maillage | null {
    let cle = cleNiveaux;
    if (o.classe === "mur") {
      for (const x of Object.values(etat.objets)) if ((x.classe === "porte" || x.classe === "fenetre" || x.classe === "ouverture") && x.params.murHoteId === o.id) cle += `|${x.id}:${x.params.position}:${x.params.largeur.value}:${x.params.hauteur.value}:${x.params.allege?.value ?? ""}`;
    } else if (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") {
      const h = etat.objets[o.params.murHoteId];
      if (h) cle += `|${JSON.stringify(h.params)}`;
    }
    const c = this.cache.get(o);
    if (c && c.cle === cle) return c.m;
    const m = maillageObjet(etat, o);
    this.cache.set(o, { cle, m });
    return m;
  }

  private materiau(couleur: string, opacite: number): THREE.MeshStandardMaterial {
    const cle = `${couleur}|${opacite}`;
    let m = this.materiaux.get(cle);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide, transparent: opacite < 1, opacity: opacite, depthWrite: opacite >= 1, clippingPlanes: this.plans });
      this.materiaux.set(cle, m);
    }
    return m;
  }

  /** Reconstruit les tampons groupés à partir du modèle. */
  majModele(etat: ModeleAtelier): void {
    if (etat === this.etat) return;
    this.etat = etat;
    for (const l of this.lots) {
      l.maillage.geometry.dispose();
      l.aretes?.geometry.dispose();
    }
    for (const g of this.groupes.values()) this.scene.remove(g);
    this.groupes.clear();
    this.lots = [];
    const cleNiveaux = JSON.stringify(etat.niveaux);
    const parLot = new Map<string, Maillage[]>();
    const tous: Maillage[] = [];
    for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
      const m = this.maillage(etat, o, cleNiveaux);
      if (!m) continue;
      tous.push(m);
      const cle = `${m.niveauId ?? "-"}|${m.couleur}|${m.opacite}`;
      const l = parLot.get(cle) ?? [];
      l.push(m);
      parLot.set(cle, l);
    }
    for (const [cle, liste] of parLot) {
      const niveauId = cle.split("|")[0]!;
      let groupe = this.groupes.get(niveauId);
      if (!groupe) {
        groupe = new THREE.Group();
        groupe.name = niveauId;
        this.groupes.set(niveauId, groupe);
        this.scene.add(groupe);
      }
      let nbSommets = 0;
      let nbIndices = 0;
      for (const m of liste) {
        nbSommets += m.positions.length / 3;
        nbIndices += m.indices.length;
      }
      const positions = new Float32Array(nbSommets * 3);
      const indices = nbSommets > 65535 ? new Uint32Array(nbIndices) : new Uint16Array(nbIndices);
      const debuts: number[] = [];
      const ids: string[] = [];
      let s = 0;
      let i = 0;
      for (const m of liste) {
        debuts.push(i / 3);
        ids.push(m.objetId);
        positions.set(m.positions, s * 3);
        for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k]! + s;
        s += m.positions.length / 3;
        i += m.indices.length;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const premier = liste[0]!;
      const mesh = new THREE.Mesh(geo, this.materiau(premier.couleur, premier.opacite));
      if (premier.opacite < 1) mesh.renderOrder = 2;
      groupe.add(mesh);
      let aretes: THREE.LineSegments | null = null;
      if (premier.opacite >= 0.5) {
        aretes = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), this.matAretes);
        groupe.add(aretes);
      }
      this.lots.push({ maillage: mesh, aretes, debuts, ids });
    }
    const e = englobant(tous);
    if (e) this.boite.set(new THREE.Vector3(...e.min), new THREE.Vector3(...e.max));
    else this.boite.set(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 3));
    if (this.options) this.appliquerOptions(this.options, false);
    this.rendre();
  }

  /** Niveaux visibles, éclaté, coupes et caméra. `recadrer` replace la caméra (changement de vue). */
  appliquerOptions(o: OptionsScene, recadrer: boolean): void {
    const avant = this.options;
    this.options = o;
    const etat = this.etat;
    if (!etat) return;
    const ordonnes = niveauxOrdonnes(etat);
    const actif = o.niveauActif ? etat.niveaux[o.niveauActif] : undefined;
    for (const [id, g] of this.groupes) {
      const n = etat.niveaux[id];
      const rang = n ? ordonnes.findIndex((x) => x.id === id) : 0;
      g.visible = o.presentation !== "niveau" || id === o.niveauActif || id === "-";
      g.position.z = o.presentation === "eclate" ? rang * ECART_ECLATE : 0;
      // Coupe horizontale en perspective : les niveaux au-dessus du niveau actif sont masqués.
      if (o.vue === "perspective" && o.coupeHorizontale !== null && actif && n && n.ordre > actif.ordre && o.presentation !== "eclate") g.visible = false;
    }
    for (const l of this.lots) if (l.aretes) l.aretes.visible = o.aretes || o.vue !== "perspective";
    // Plans de coupe (partagés par tous les matériaux).
    this.plans.length = 0;
    const b = this.boite;
    if (o.vue === "perspective" && o.coupeHorizontale !== null && actif && o.presentation !== "eclate") this.plans.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), actif.elevation + o.coupeHorizontale));
    if (o.vue === "dessus" && actif) this.plans.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), actif.elevation + (o.coupeHorizontale ?? 1.2)));
    if (o.vue === "coupe-ns") this.plans.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -(b.min.x + (b.max.x - b.min.x) * o.positionCoupe)));
    if (o.vue === "coupe-eo") this.plans.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(b.min.y + (b.max.y - b.min.y) * o.positionCoupe)));
    for (const m of this.materiaux.values()) m.needsUpdate = true;
    if (o.vue === "dessus" && actif) for (const [id, g] of this.groupes) g.visible = id === o.niveauActif || (etat.niveaux[id]?.ordre ?? 99) < actif.ordre;
    if (recadrer || !avant || avant.vue !== o.vue || avant.presentation !== o.presentation || (o.presentation === "niveau" && avant.niveauActif !== o.niveauActif)) this.cadrer();
    this.rendre();
  }

  /** Place la caméra pour la vue courante. */
  cadrer(): void {
    const o = this.options;
    const b = this.boite.clone();
    if (o?.presentation === "eclate" && this.etat) b.max.z += niveauxOrdonnes(this.etat).length * ECART_ECLATE;
    if (o?.presentation === "niveau" && o.niveauActif && this.etat) {
      const g = this.groupes.get(o.niveauActif);
      if (g) {
        const bg = new THREE.Box3().setFromObject(g);
        if (!bg.isEmpty()) b.copy(bg);
      }
    }
    const c = b.getCenter(new THREE.Vector3());
    const t = b.getSize(new THREE.Vector3());
    const r = Math.max(t.x, t.y, t.z, 4);
    const vue = o?.vue ?? "perspective";
    if (vue === "perspective") {
      this.camera = this.perspective;
      this.controles.object = this.perspective;
      this.controles.enableRotate = true;
      this.perspective.position.set(c.x - r * 0.9, c.y - r * 1.3, c.z + r * 0.9);
      this.controles.target.copy(c);
    } else {
      this.camera = this.ortho;
      this.controles.object = this.ortho;
      this.controles.enableRotate = false;
      const d = r * 3;
      const dir: Record<Exclude<VueTechnique, "perspective">, [number, number, number]> = {
        dessus: [0, 0, 1],
        "coupe-ns": [-1, 0, 0],
        "coupe-eo": [0, -1, 0],
        "facade-sud": [0, -1, 0],
        "facade-nord": [0, 1, 0],
        "facade-est": [1, 0, 0],
        "facade-ouest": [-1, 0, 0],
      };
      const [dx, dy, dz] = dir[vue];
      this.ortho.up.set(0, vue === "dessus" ? 1 : 0, vue === "dessus" ? 0 : 1);
      this.ortho.position.set(c.x + dx * d, c.y + dy * d, c.z + dz * d);
      this.controles.target.copy(c);
      const largeurVue = vue === "dessus" ? Math.max(t.x, t.y * (this.largeur / this.hauteur)) : Math.max(vue.includes("ns") || vue.endsWith("est") || vue.endsWith("ouest") ? t.y : t.x, t.z * (this.largeur / this.hauteur));
      this.ortho.zoom = 1;
      this.echelleOrtho = (largeurVue * 1.15) / 2;
      this.ajusterOrtho();
    }
    this.controles.update();
    this.rendre();
  }

  private echelleOrtho = 20;

  private ajusterOrtho(): void {
    const a = this.largeur / this.hauteur;
    const e = this.echelleOrtho;
    this.ortho.left = -e;
    this.ortho.right = e;
    this.ortho.top = e / a;
    this.ortho.bottom = -e / a;
    this.ortho.updateProjectionMatrix();
  }

  /** Mise en évidence de la sélection (maillages superposés). */
  majSelection(ids: readonly string[]): void {
    for (const c of [...this.selection.children]) {
      (c as THREE.Mesh).geometry.dispose();
      this.selection.remove(c);
    }
    const etat = this.etat;
    if (!etat) return;
    for (const id of ids) {
      const o = etat.objets[id];
      if (!o) continue;
      const m = this.maillage(etat, o, JSON.stringify(etat.niveaux));
      if (!m) continue;
      const mesh = this.versMesh(m, this.matSelection);
      const g = m.niveauId ? this.groupes.get(m.niveauId) : null;
      if (g) {
        mesh.position.z = g.position.z;
        mesh.visible = g.visible;
      }
      this.selection.add(mesh);
    }
    this.rendre();
  }

  /** Aperçu d'une modification (pousser / tirer) avant validation. */
  majApercu(m: Maillage | null): void {
    for (const c of [...this.apercu.children]) {
      (c as THREE.Mesh).geometry.dispose();
      this.apercu.remove(c);
    }
    if (m) {
      const mesh = this.versMesh(m, this.matApercu);
      const g = m.niveauId ? this.groupes.get(m.niveauId) : null;
      if (g) mesh.position.z = g.position.z;
      this.apercu.add(mesh);
    }
    this.rendre();
  }

  private versMesh(m: Maillage, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.positions), 3));
    geo.setIndex(m.indices);
    return new THREE.Mesh(geo, mat);
  }

  /** Objet sous le pointeur (coordonnées relatives au canevas), avec le point touché en repère local. */
  pointer(x: number, y: number): { objetId: string; point: THREE.Vector3 } | null {
    const ndc = new THREE.Vector2((x / this.largeur) * 2 - 1, -(y / this.hauteur) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const cibles = this.lots.filter((l) => l.maillage.parent?.visible !== false).map((l) => l.maillage);
    const hits = rc.intersectObjects(cibles, false).filter((h) => this.plans.every((p) => p.distanceToPoint(h.point) >= -1e-6));
    for (const h of hits) {
      const lot = this.lots.find((l) => l.maillage === h.object);
      if (!lot || h.faceIndex === undefined || h.faceIndex === null) continue;
      let lo = 0;
      let hi = lot.debuts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lot.debuts[mid]! <= h.faceIndex) lo = mid;
        else hi = mid - 1;
      }
      const point = h.point.clone();
      point.z -= (h.object.parent?.position.z ?? 0);
      return { objetId: lot.ids[lo]!, point };
    }
    return null;
  }

  /** Point écran du milieu de la face supérieure d'un objet visible. */
  ecranDe(objetId: string): { x: number; y: number } | null {
    const etat = this.etat;
    const o = etat?.objets[objetId];
    if (!etat || !o) return null;
    const m = this.maillage(etat, o, JSON.stringify(etat.niveaux));
    const e = m ? englobant([m]) : null;
    if (!e || !m) return null;
    const dz = m.niveauId ? (this.groupes.get(m.niveauId)?.position.z ?? 0) : 0;
    const p = new THREE.Vector3((e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, e.max[2] - 0.05 + dz).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.largeur, y: ((1 - p.y) / 2) * this.hauteur };
  }

  /** Pixels écran par mètre vertical au point donné (pousser / tirer). */
  pixelsParMetreVertical(p: THREE.Vector3): number {
    const a = p.clone().project(this.camera);
    const b = p.clone().add(new THREE.Vector3(0, 0, 1)).project(this.camera);
    return Math.abs(((b.y - a.y) * this.hauteur) / 2) || 1;
  }

  activerControles(actif: boolean): void {
    this.controles.enabled = actif;
  }

  /** Rendu groupé sur la prochaine trame. */
  rendre(): void {
    if (this.demande || !this.moteur) return;
    this.demande = requestAnimationFrame(() => {
      this.demande = 0;
      const t = performance.now();
      this.moteur.render(this.scene, this.camera);
      const ms = performance.now() - t;
      this.mesures.rendus.push(ms);
      if (this.mesures.rendus.length > 600) this.mesures.rendus.shift();
      this.mesures.appels = this.moteur.info.render.calls;
      this.mesures.triangles = this.moteur.info.render.triangles;
      this.onRendu?.();
    });
  }

  /** Rendu immédiat puis lecture du canevas dans la même tâche (le tampon WebGL n'est pas conservé au-delà). */
  capturer(): Promise<Blob | null> {
    if (!this.moteur) return Promise.resolve(null);
    this.moteur.render(this.scene, this.camera);
    return new Promise((resolve) => this.canvas.toBlob((b) => resolve(b), "image/png"));
  }

  liberer(): void {
    if (sceneActive === this) sceneActive = null;
    if (this.demande) cancelAnimationFrame(this.demande);
    this.controles?.dispose();
    for (const l of this.lots) {
      l.maillage.geometry.dispose();
      l.aretes?.geometry.dispose();
    }
    for (const m of this.materiaux.values()) m.dispose();
    this.matSelection.dispose();
    this.matApercu.dispose();
    this.matAretes.dispose();
    this.moteur?.dispose();
    if (window.fadiMesures3D === this.mesures) delete window.fadiMesures3D;
  }
}
