/**
 * Scène 3D du nouvel Atelier (lot 3b, D-004) : three.js WebGL2 par défaut, WebGPU en option avec repli. La scène
 * ne fait que copier les maillages purs de `@parcours/atelier-model` (`maillageObjet`) dans des tampons groupés
 * par niveau et par matériau (peu d'appels de dessin, cf. p0-mesures : 1 199 → 24) ; une table triangle → objet
 * sert à la sélection. Rendu à la demande (pas de boucle continue). Aucune donnée n'est écrite dans le modèle.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { chapeauxDeCoupe, englobant, maillageObjet, niveauxOrdonnes, raccordMur, type Maillage, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { CHAMP_DE_VISION_DEG } from "./camera";

export type VueTechnique = "perspective" | "dessus" | "coupe-ns" | "coupe-eo" | "facade-sud" | "facade-nord" | "facade-est" | "facade-ouest";
export type Presentation = "batiment" | "niveau" | "eclate" | "eclate-horizontal" | "eclate-classes" | "eclate-groupes";
const estEclate = (p: Presentation | undefined) => p === "eclate" || p === "eclate-horizontal" || p === "eclate-classes" || p === "eclate-groupes";

/**
 * Éclaté par classe (D-075, DA-18-03) : chaque classe soulevée d'un écart, dans cet ordre (les ouvertures restent
 * avec leurs murs) ; les classes absentes ne laissent pas de vide.
 */
const ORDRE_ECLATE_CLASSES = ["dalle", "mur", "poteau", "escalier", "garde-corps", "piece", "espace", "zone", "solide", "bloc-occurrence", "objet-importe", "toiture"];
const classeEclate = (c: string) => (c === "porte" || c === "fenetre" || c === "ouverture" ? "mur" : c);

export interface OptionsScene {
  vue: VueTechnique;
  presentation: Presentation;
  niveauActif: string | null;
  /** Coupe horizontale (perspective) : hauteur au-dessus du niveau actif, ou null. */
  coupeHorizontale: number | null;
  /** Position de la coupe verticale, 0–1 sur l'étendue du bâtiment. */
  positionCoupe: number;
  aretes: boolean;
  /** Écart entre niveaux en présentation éclatée, en mètres (DA-18-03) ; 4 m par défaut. */
  ecartEclate?: number;
  /** Boîte de coupe (D-090) : bornes en fraction de l'étendue du bâtiment (x0 < x1, y0 < y1), ou absente. */
  boiteCoupe?: { x0: number; x1: number; y0: number; y1: number } | null;
}

interface Lot {
  maillage: THREE.Mesh;
  aretes: THREE.LineSegments | null;
  /** Premier triangle de chaque objet (croissant) et son identifiant. */
  debuts: number[];
  ids: string[];
  /** Classe des objets du lot (éclaté par classe). */
  classe: string;
  /** Groupe des objets du lot (éclaté par groupe, D-087) ; vide : sans groupe. */
  groupe: string;
}

export interface MesuresRendu {
  /** Mesure 3D en cours (D-048) : distance entre les deux points relevés, en mètres. */
  mesure3d?: number | null;
  rendus: number[];
  appels: number;
  triangles: number;
  moteur: "webgl2" | "webgpu";
  /** Position à l'écran (px, relative au canevas) du haut d'un objet : instrumentation de la recette. */
  localiser?: (objetId: string) => { x: number; y: number } | null;
  /** Objet sous un point écran (instrumentation de la recette). */
  sonder?: (x: number, y: number) => string | null;
  /** Nombre d'objets dont la section est remplie (coupe en 3D) : instrumentation de la recette. */
  chapeaux?: number;
  /** Nombre de références externes dessinées en 3D. */
  externes?: number;
  /** Poignées du manipulateur affichées (0 ou 2) et position écran d'une flèche (instrumentation de la recette). */
  poignees?: number;
  localiserPoignee?: (axe: "x" | "y" | "z" | "r" | "c") => { x: number; y: number } | null;
  /** Point de vue courant (recette : visite à hauteur d'œil). */
  pointDeVue?: () => { position: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } };
  /** Position écran d'un point du modèle (recette : face latérale poussée, D-125). */
  versEcran?: (p: { x: number; y: number; z: number }) => { x: number; y: number } | null;
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
  private perspective = new THREE.PerspectiveCamera(CHAMP_DE_VISION_DEG, 1, 0.1, 5000);
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
  /** Maillages du modèle courant (sources des chapeaux de coupe). */
  private maillagesCourants: Maillage[] = [];
  private chapeaux: THREE.Mesh[] = [];
  /** Références externes (DA-05-11) : traits gris au niveau de rattachement, ni sélectionnables ni accrochables en 3D. */
  private externes: readonly { niveauId: string; traits: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[] }[] = [];
  private lignesExternes: THREE.LineSegments[] = [];
  private matExternes = new THREE.LineBasicMaterial({ color: "#8a8f98", transparent: true, opacity: 0.9 });
  private cleChapeaux = "";
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
    this.controles.addEventListener("change", () => {
      this.ajusterPoignees();
      this.rendre();
    });
    sceneActive = this;
    this.mesures.localiser = (id) => this.ecranDe(id);
    this.mesures.sonder = (x, y) => this.pointer(x, y)?.objetId ?? null;
    this.mesures.pointDeVue = () => this.pointDeVue();
    this.mesures.versEcran = (p) => this.versEcran(p);
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
      const r = raccordMur(etat, o as Occurrence<"mur">);
      if (r) cle += `|r:${r.gauche.join(",")};${r.droite.join(",")}`;
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
      const cle = `${m.niveauId ?? "-"}|${m.couleur}|${m.opacite}|${classeEclate(o.classe)}|${o.groupeId ?? ""}`;
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
      this.lots.push({ maillage: mesh, aretes, debuts, ids, classe: cle.split("|")[3]!, groupe: cle.split("|")[4] ?? "" });
    }
    this.maillagesCourants = tous;
    this.cleChapeaux = "";
    this.poserExternes();
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
      // Éclaté horizontal (D-053) : les niveaux posés côte à côte au même sol (altitude ramenée à 0), de gauche à
      // droite dans l'ordre des niveaux, séparés d'un écart fixe.
      const ecart = o.ecartEclate ?? ECART_ECLATE;
      g.position.z = o.presentation === "eclate" ? rang * ecart : o.presentation === "eclate-horizontal" && n ? -n.elevation : 0;
      g.position.x = o.presentation === "eclate-horizontal" ? rang * (this.boite.isEmpty() ? 0 : this.boite.max.x - this.boite.min.x + ecart) : 0;
      // Coupe horizontale en perspective : les niveaux au-dessus du niveau actif sont masqués.
      if (o.vue === "perspective" && o.coupeHorizontale !== null && actif && n && n.ordre > actif.ordre && !estEclate(o.presentation)) g.visible = false;
    }
    for (const l of this.lots) if (l.aretes) l.aretes.visible = o.aretes || o.vue !== "perspective";
    // Éclaté par classe : chaque lot soulevé selon le rang de sa classe ; sinon, à sa place.
    for (const l of this.lots) {
      const z = o.presentation === "eclate-classes" ? this.decalageClasse(l.classe, o) : o.presentation === "eclate-groupes" ? this.decalageGroupe(l.groupe, o) : 0;
      l.maillage.position.z = z;
      if (l.aretes) l.aretes.position.z = z;
    }
    // Plans de coupe (partagés par tous les matériaux).
    this.plans.length = 0;
    const b = this.boite;
    if (o.vue === "perspective" && o.coupeHorizontale !== null && actif && !estEclate(o.presentation)) this.plans.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), actif.elevation + o.coupeHorizontale));
    if (o.vue === "dessus" && actif) this.plans.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), actif.elevation + (o.coupeHorizontale ?? 1.2)));
    if (o.vue === "perspective" && o.boiteCoupe && !estEclate(o.presentation)) {
      const bc = o.boiteCoupe;
      const X = (f: number) => b.min.x + (b.max.x - b.min.x) * f;
      const Y = (f: number) => b.min.y + (b.max.y - b.min.y) * f;
      // Plans dont le demi-espace gardé est l'intérieur de la boîte (normale · p + constante ≥ 0).
      this.plans.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -X(bc.x0)), new THREE.Plane(new THREE.Vector3(-1, 0, 0), X(bc.x1)), new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y(bc.y0)), new THREE.Plane(new THREE.Vector3(0, -1, 0), Y(bc.y1)));
    }
    if (o.vue === "coupe-ns") this.plans.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -(b.min.x + (b.max.x - b.min.x) * o.positionCoupe)));
    if (o.vue === "coupe-eo") this.plans.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(b.min.y + (b.max.y - b.min.y) * o.positionCoupe)));
    for (const m of this.materiaux.values()) m.needsUpdate = true;
    if (o.vue === "dessus" && actif) for (const [id, g] of this.groupes) g.visible = id === o.niveauActif || (etat.niveaux[id]?.ordre ?? 99) < actif.ordre;
    this.majChapeaux();
    if (recadrer || !avant || avant.vue !== o.vue || avant.presentation !== o.presentation || (o.presentation === "niveau" && avant.niveauActif !== o.niveauActif)) this.cadrer();
    this.rendre();
  }

  private classesPresentes(): string[] {
    const presentes = new Set(this.lots.map((l) => l.classe));
    return [...ORDRE_ECLATE_CLASSES.filter((c) => presentes.has(c)), ...[...presentes].filter((c) => !ORDRE_ECLATE_CLASSES.includes(c)).sort()];
  }

  /** Éclaté par groupe (D-087) : chaque groupe soulevé d'un écart (ordre des identifiants) ; sans groupe : en place. */
  private groupesPresents(): string[] {
    return [...new Set(this.lots.map((l) => l.groupe).filter(Boolean))].sort();
  }

  private decalageGroupe(groupe: string, o: OptionsScene | null = this.options): number {
    if (o?.presentation !== "eclate-groupes" || !groupe) return 0;
    return (this.groupesPresents().indexOf(groupe) + 1) * (o.ecartEclate ?? ECART_ECLATE);
  }

  private decalageClasse(classe: string, o: OptionsScene | null = this.options): number {
    if (o?.presentation !== "eclate-classes") return 0;
    return Math.max(0, this.classesPresentes().indexOf(classeEclate(classe))) * (o.ecartEclate ?? ECART_ECLATE);
  }

  /** Décalage d'affichage d'un objet : celui de son niveau (éclaté par niveau) et de sa classe (éclaté par classe). */
  private decalageObjet(niveauId: string | null, classe: string | undefined, groupe?: string | null): THREE.Vector3 {
    const v = new THREE.Vector3();
    const g = niveauId ? this.groupes.get(niveauId) : null;
    if (g) v.copy(g.position);
    if (classe) v.z += this.decalageClasse(classe);
    if (groupe) v.z += this.decalageGroupe(groupe);
    return v;
  }

  /** Place la caméra pour la vue courante. */
  cadrer(): void {
    if (this.visite) return; // en visite, la caméra reste à hauteur d'œil
    const o = this.options;
    const b = this.boite.clone();
    if (o?.presentation === "eclate" && this.etat) b.max.z += niveauxOrdonnes(this.etat).length * (o.ecartEclate ?? ECART_ECLATE);
    if (o?.presentation === "eclate-classes") b.max.z += this.classesPresentes().length * (o.ecartEclate ?? ECART_ECLATE);
    if (o?.presentation === "eclate-groupes") b.max.z += this.groupesPresents().length * (o.ecartEclate ?? ECART_ECLATE);
    if (o?.presentation === "eclate-horizontal") {
      // Emprise réelle des niveaux déplacés.
      const u = new THREE.Box3();
      for (const g of this.groupes.values()) if (g.visible) u.union(new THREE.Box3().setFromObject(g));
      if (!u.isEmpty()) b.copy(u);
    }
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
      // Éclaté horizontal : la rangée de niveaux vue de face (depuis le sud, en plongée).
      if (o?.presentation === "eclate-horizontal") this.perspective.position.set(c.x, c.y - r * 1.15, c.z + r * 0.65);
      else this.perspective.position.set(c.x - r * 0.9, c.y - r * 1.3, c.z + r * 0.9);
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

  /** Caméra courante (vue enregistrée, D-053) : position et point visé, repère local en mètres. */
  pointDeVue(): { position: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } } {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const p = this.camera.position;
    const c = this.controles.target;
    return { position: { x: r(p.x), y: r(p.y), z: r(p.z) }, cible: { x: r(c.x), y: r(c.y), z: r(c.z) } };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Visite à hauteur d'œil (D-075, DA-17-16) : l'œil posé à l'altitude du niveau + hauteur saisie, au centre de la
  // vue courante, regard horizontal ; on regarde autour en glissant, on avance et on tourne au clavier ou aux boutons.
  // ---------------------------------------------------------------------------------------------------------------

  private visite: { z: number } | null = null;

  get enVisite(): boolean {
    return this.visite !== null;
  }

  commencerVisite(altitudeOeil: number): void {
    if (this.camera !== this.perspective) return;
    const cible = this.controles.target.clone();
    const dir = new THREE.Vector3().subVectors(cible, this.perspective.position);
    dir.z = 0;
    if (dir.lengthSq() < 1e-9) dir.set(0, 1, 0);
    dir.normalize();
    this.visite = { z: altitudeOeil };
    this.perspective.position.set(cible.x, cible.y, altitudeOeil);
    this.controles.enableZoom = false;
    this.controles.enablePan = false;
    this.controles.target.set(cible.x + dir.x * 0.01, cible.y + dir.y * 0.01, altitudeOeil);
    this.controles.update();
    this.rendre();
  }

  /** Avance (m, négatif : recule) dans la direction du regard, à hauteur constante. */
  avancerVisite(d: number): void {
    if (!this.visite) return;
    const dir = new THREE.Vector3().subVectors(this.controles.target, this.perspective.position);
    dir.z = 0;
    if (dir.lengthSq() < 1e-12) return;
    dir.normalize().multiplyScalar(d);
    this.perspective.position.add(dir);
    this.controles.target.add(dir);
    this.perspective.position.z = this.visite.z;
    this.controles.update();
    this.rendre();
  }

  /** Tourne le regard (degrés, positif : vers la gauche). */
  tournerVisite(deg: number): void {
    if (!this.visite) return;
    const p = this.perspective.position;
    const t = this.controles.target;
    const a = (deg * Math.PI) / 180;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    t.set(p.x + dx * Math.cos(a) - dy * Math.sin(a), p.y + dx * Math.sin(a) + dy * Math.cos(a), t.z);
    this.controles.update();
    this.rendre();
  }

  quitterVisite(): void {
    if (!this.visite) return;
    this.visite = null;
    this.controles.enableZoom = true;
    this.controles.enablePan = true;
    this.cadrer();
  }

  /** Position à l'écran (px) d'un point du modèle, ou null s'il est derrière la caméra (annotations 3D, D-090). */
  versEcran(p: { x: number; y: number; z: number }): { x: number; y: number } | null {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: ((v.x + 1) / 2) * this.largeur, y: ((1 - v.y) / 2) * this.hauteur };
  }

  /** Replace la caméra perspective sur un point de vue enregistré (après `appliquerOptions`). */
  placerPointDeVue(v: { position: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } }): void {
    if (this.camera !== this.perspective) return;
    this.perspective.position.set(v.position.x, v.position.y, v.position.z);
    this.controles.target.set(v.cible.x, v.cible.y, v.cible.z);
    this.controles.update();
    this.rendre();
  }

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
    this.selection.position.set(0, 0, 0);
    this.selection.rotation.z = 0;
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
      mesh.position.copy(this.decalageObjet(m.niveauId, o.classe, o.groupeId));
      if (g) mesh.visible = g.visible;
      this.selection.add(mesh);
    }
    this.rendre();
  }

  /** Aperçu d'une modification (pousser / tirer) avant validation. */
  private mesureGroupe = new THREE.Group();
  /** Mesure 3D (D-048) : points relevés sur les surfaces, segment et pastilles au-dessus de tout. */
  majMesure(points: readonly THREE.Vector3[]): void {
    for (const c of [...this.mesureGroupe.children]) {
      c.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
      this.mesureGroupe.remove(c);
    }
    if (!this.mesureGroupe.parent) this.scene.add(this.mesureGroupe);
    const mat = new THREE.MeshBasicMaterial({ color: "#c0392b", depthTest: false });
    const k = Math.max(0.03, this.echellePoignees() * 0.04);
    for (const p of points) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(k, 12, 8), mat);
      s.position.copy(p);
      s.renderOrder = 11;
      this.mesureGroupe.add(s);
    }
    if (points.length === 2) {
      const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...points]), new THREE.LineBasicMaterial({ color: "#c0392b", depthTest: false }));
      ligne.renderOrder = 11;
      this.mesureGroupe.add(ligne);
      this.mesures.mesure3d = points[0]!.distanceTo(points[1]!);
    } else this.mesures.mesure3d = null;
    this.rendre();
  }

  majApercu(m: Maillage | null): void {
    for (const c of [...this.apercu.children]) {
      (c as THREE.Mesh).geometry.dispose();
      this.apercu.remove(c);
    }
    if (m) {
      const mesh = this.versMesh(m, this.matApercu);
      mesh.position.copy(this.decalageObjet(m.niveauId, m.classe));
      this.apercu.add(mesh);
    }
    this.rendre();
  }

  /** Traits des références externes, posés dans le groupe de leur niveau (éclaté et masquage suivent). */
  majExternes(liste: readonly { niveauId: string; traits: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[] }[]): void {
    this.externes = liste;
    this.poserExternes();
    this.rendre();
  }

  private poserExternes(): void {
    for (const l of this.lignesExternes) {
      l.parent?.remove(l);
      l.geometry.dispose();
    }
    this.lignesExternes = [];
    const etat = this.etat;
    if (!etat) return;
    this.matExternes.clippingPlanes = this.plans;
    for (const x of this.externes) {
      const n = etat.niveaux[x.niveauId];
      const g = this.groupes.get(x.niveauId);
      if (!n || !g || !x.traits.length) continue;
      const z = n.elevation + 0.02;
      const pos = new Float32Array(Math.min(x.traits.length, 20000) * 6);
      x.traits.slice(0, 20000).forEach((t, i) => pos.set([t.a.x, t.a.y, z, t.b.x, t.b.y, z], i * 6));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const lignes = new THREE.LineSegments(geo, this.matExternes);
      lignes.userData["referenceExterne"] = true;
      g.add(lignes);
      this.lignesExternes.push(lignes);
    }
    this.mesures.externes = this.lignesExternes.length;
  }

  /** Remplit la section là où l'unique plan de coupe traverse la matière (chapeaux purs, `chapeauxDeCoupe`). */
  private majChapeaux(): void {
    const plan = this.plans.length === 1 ? this.plans[0]! : null;
    const visibles = [...this.groupes].filter(([, g]) => g.visible).map(([id]) => id);
    const cle = plan ? `${plan.normal.toArray().join(",")}|${plan.constant}|${visibles.join(",")}|${this.maillagesCourants.length}` : "";
    if (cle === this.cleChapeaux) return;
    this.cleChapeaux = cle;
    for (const c of this.chapeaux) {
      c.parent?.remove(c);
      c.geometry.dispose();
    }
    this.chapeaux = [];
    this.mesures.chapeaux = 0;
    if (!plan) return;
    const point = plan.normal.clone().multiplyScalar(-plan.constant);
    const sources = this.maillagesCourants.filter((m) => visibles.includes(m.niveauId ?? "-"));
    for (const c of chapeauxDeCoupe(sources, { point: [point.x, point.y, point.z], normale: [plan.normal.x, plan.normal.y, plan.normal.z] })) {
      const mesh = this.versMesh(c, this.materiauChapeau(c.couleur));
      mesh.userData["chapeau"] = c.objetId;
      this.groupes.get(c.niveauId ?? "-")?.add(mesh);
      this.chapeaux.push(mesh);
    }
    this.mesures.chapeaux = this.chapeaux.length;
  }

  private materiauxChapeau = new Map<string, THREE.MeshBasicMaterial>();
  private materiauChapeau(couleur: string): THREE.MeshBasicMaterial {
    let m = this.materiauxChapeau.get(couleur);
    if (!m) {
      // Sans plans de coupe (le chapeau est dans le plan) ; aplat, comme un poché.
      m = new THREE.MeshBasicMaterial({ color: couleur, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      this.materiauxChapeau.set(couleur, m);
    }
    return m;
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
      if (h.object.parent) point.sub(h.object.parent.position);
      point.sub(h.object.position); // éclaté par classe ou par groupe : décalage propre au lot
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
    const d = this.decalageObjet(m.niveauId, o.classe, o.groupeId);
    const p = new THREE.Vector3((e.min[0] + e.max[0]) / 2 + (d?.x ?? 0), (e.min[1] + e.max[1]) / 2 + (d?.y ?? 0), e.max[2] - 0.05 + (d?.z ?? 0)).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.largeur, y: ((1 - p.y) / 2) * this.hauteur };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Manipulateur à poignées : deux flèches (X rouge, Y verte) au-dessus de la sélection ; glisser une flèche déplace
  // la sélection le long de cet axe (aperçu), le relâcher produit un lot `transformer.deplacer`. Flèche Z (violette)
  // quand la sélection a un décalage de base : `objet.modifier` du décalage ; anneau bleu : rotation.
  // ---------------------------------------------------------------------------------------------------------------
  private poignees = new THREE.Group();
  private centrePoignees: THREE.Vector3 | null = null;
  private matPoignee = { x: new THREE.MeshBasicMaterial({ color: "#c0392b", depthTest: false }), y: new THREE.MeshBasicMaterial({ color: "#2e8b57", depthTest: false }), r: new THREE.MeshBasicMaterial({ color: "#2f6fb3", depthTest: false }), z: new THREE.MeshBasicMaterial({ color: "#7a4fa3", depthTest: false }) };

  /**
   * Place les poignées au-dessus du centre de la sélection (null : les retirer). `avecZ` : flèche verticale, offerte
   * seulement quand tous les objets sélectionnés portent un décalage de base (dalles, toitures, escaliers, solides,
   * garde-corps) — un mur ou un poteau suit son niveau et n'a pas de translation verticale.
   */
  majPoignees(actif: boolean, avecZ = false): void {
    for (const c of [...this.poignees.children]) {
      c.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
      this.poignees.remove(c);
    }
    if (!this.poignees.parent) this.scene.add(this.poignees);
    this.centrePoignees = null;
    this.poignees.position.set(0, 0, 0);
    if (!actif || !this.selection.children.length) {
      this.mesures.poignees = 0;
      this.rendre();
      return;
    }
    const b = new THREE.Box3().setFromObject(this.selection);
    if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3());
    c.z = b.max.z + 0.1;
    this.centrePoignees = c;
    // Flèches de longueur unité, mises à l'échelle de l'écran (taille constante quel que soit le zoom).
    const longueur = 1;
    for (const axe of avecZ ? (["x", "y", "z"] as const) : (["x", "y"] as const)) {
      const fleche = new THREE.Group();
      const tige = new THREE.Mesh(new THREE.CylinderGeometry(longueur * 0.025, longueur * 0.025, longueur, 10), this.matPoignee[axe]);
      tige.position.y = longueur / 2;
      const pointe = new THREE.Mesh(new THREE.ConeGeometry(longueur * 0.08, longueur * 0.22, 14), this.matPoignee[axe]);
      pointe.position.y = longueur + longueur * 0.11;
      fleche.add(tige, pointe);
      // Le cylindre de three.js suit Y : la flèche X est tournée de −90° autour de Z.
      if (axe === "x") fleche.rotation.z = -Math.PI / 2;
      if (axe === "z") fleche.rotation.x = Math.PI / 2;
      fleche.position.copy(c);
      fleche.userData["axe"] = axe;
      fleche.renderOrder = 10;
      for (const m of [tige, pointe]) {
        m.userData["axe"] = axe;
        m.renderOrder = 10;
      }
      this.poignees.add(fleche);
    }
    // Anneau de rotation (autour de la verticale passant par le centre), bleu.
    const anneau = new THREE.Group();
    const tore = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 48), this.matPoignee.r);
    tore.userData["axe"] = "r";
    tore.renderOrder = 10;
    anneau.add(tore);
    anneau.position.copy(c);
    anneau.userData["axe"] = "r";
    this.poignees.add(anneau);
    this.mesures.poignees = avecZ ? 4 : 3;
    this.mesures.localiserPoignee = (axe) => {
      if (!this.centrePoignees) return null;
      const k = this.echellePoignees();
      const d = axe === "x" ? new THREE.Vector3(k * 0.8, 0, 0) : axe === "y" ? new THREE.Vector3(0, k * 0.8, 0) : axe === "z" ? new THREE.Vector3(0, 0, k * 0.8) : axe === "r" ? new THREE.Vector3(-k * 0.55 * Math.SQRT1_2, -k * 0.55 * Math.SQRT1_2, 0) : new THREE.Vector3(0, 0, 0);
      const p = this.centrePoignees.clone().add(this.poignees.position).add(d).project(this.camera);
      return { x: ((p.x + 1) / 2) * this.largeur, y: ((1 - p.y) / 2) * this.hauteur };
    };
    this.ajusterPoignees();
    this.rendre();
  }

  /** Longueur (m) qui donne aux flèches environ un huitième de la hauteur de la vue. */
  private echellePoignees(): number {
    const c = this.centrePoignees;
    if (!c) return 1;
    if (this.camera === this.perspective) {
      const d = this.perspective.position.distanceTo(c);
      return Math.max(0.05, 2 * d * Math.tan((this.perspective.fov * Math.PI) / 360) * 0.12);
    }
    return Math.max(0.05, ((this.ortho.top - this.ortho.bottom) / this.ortho.zoom) * 0.12);
  }

  private ajusterPoignees(): void {
    if (!this.centrePoignees) return;
    const k = this.echellePoignees();
    for (const f of this.poignees.children) f.scale.setScalar(k);
  }

  /** Poignée sous le pointeur (coordonnées relatives au canevas). */
  poigneeSous(x: number, y: number): "x" | "y" | "z" | "r" | null {
    if (!this.poignees.children.length) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x / this.largeur) * 2 - 1, -(y / this.hauteur) * 2 + 1), this.camera);
    const h = rc.intersectObjects(this.poignees.children, true)[0];
    return (h?.object.userData["axe"] as "x" | "y" | "z" | "r" | undefined) ?? null;
  }

  /** Abscisse, le long de l'axe passant par le centre des poignées, du point de l'axe le plus proche du rayon du pointeur. */
  abscisseSurAxe(axe: "x" | "y" | "z", x: number, y: number): number | null {
    const c = this.centrePoignees;
    if (!c) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x / this.largeur) * 2 - 1, -(y / this.hauteur) * 2 + 1), this.camera);
    const d1 = axe === "x" ? new THREE.Vector3(1, 0, 0) : axe === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const d2 = rc.ray.direction;
    const w = c.clone().sub(rc.ray.origin);
    const b = d1.dot(d2);
    const den = 1 - b * b;
    if (den < 1e-6) return null; // rayon parallèle à l'axe
    return (b * w.dot(d2) - w.dot(d1)) / den;
  }

  /** Angle (degrés) du pointeur autour du centre des poignées, dans le plan horizontal qui les porte. */
  angleAutourDuCentre(x: number, y: number): number | null {
    const c = this.centrePoignees;
    if (!c) return null;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x / this.largeur) * 2 - 1, -(y / this.hauteur) * 2 + 1), this.camera);
    const plan = new THREE.Plane(new THREE.Vector3(0, 0, 1), -c.z);
    const p = rc.ray.intersectPlane(plan, new THREE.Vector3());
    if (!p) return null;
    return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
  }

  /** Centre des poignées en plan (centre de rotation proposé). */
  centreEnPlan(): { x: number; y: number } | null {
    return this.centrePoignees ? { x: this.centrePoignees.x, y: this.centrePoignees.y } : null;
  }

  /** Aperçu de la rotation : la sélection tourne autour de la verticale du centre. */
  apercuRotation(angleDeg: number): void {
    const c = this.centrePoignees;
    if (!c) return;
    const a = (angleDeg * Math.PI) / 180;
    this.selection.rotation.z = a;
    // Rotation autour de (cx, cy) : position = c − R·c.
    this.selection.position.set(c.x - (Math.cos(a) * c.x - Math.sin(a) * c.y), c.y - (Math.sin(a) * c.x + Math.cos(a) * c.y), 0);
    this.rendre();
  }

  /** Aperçu du déplacement : la sélection et les poignées suivent le décalage. */
  apercuDeplacement(dx: number, dy: number, dz = 0): void {
    this.selection.rotation.z = 0;
    this.selection.position.set(dx, dy, dz);
    this.poignees.position.set(dx, dy, dz);
    this.rendre();
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
