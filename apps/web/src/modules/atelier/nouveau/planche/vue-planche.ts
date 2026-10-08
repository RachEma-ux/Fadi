/**
 * Vue three.js (WebGL2, R14) du mode Planche (cahier-planche §3.6, lot 2). Pur DOM / three.js, sans React : elle
 * dessine le maillage libre (faces recto gris clair / verso bleu-gris, arêtes noires), la sélection en bleu, l'aperçu
 * de l'outil, le marqueur d'inférence et son infobulle, les axes (pleins côté positif, pointillés côté négatif) et un
 * sol neutre ; elle traduit le pointeur en `EvenementOutil` (rayon caméra → curseur, tolérance d'accrochage de 10 px
 * convertie en mètres à la profondeur visée). La navigation suit les réglages D-157 (`navigation.ts`) : molette ou
 * trackpad, bouton du milieu = orbite (Maj = panoramique), deux doigts = pincement + orbite ou panoramique, et les
 * outils Orbite, Panoramique et Zoom au bouton gauche. Rendu à la demande ; rien n'est écrit dans le modèle (R10).
 */
import * as THREE from "three";
import { COULEURS, COULEUR_MATERIAU_DEFAUT, baseDuPlan, geometrieVisible, newell, type EvenementOutil, type FaceVisible, type GeometrieVisible, type Inference, type Modele, type Rayon, type Vec3, type VueOutil } from "@parcours/planche-model";
import type { ReglagesNavigation } from "../etat-ui";
import { borneSensibilite, facteurPan, interpreterMolette } from "../navigation";
import type { OutilCamera } from "./outils-planche";

/** Rayon d'accrochage à l'écran (px), converti en mètres à la profondeur visée (choix Fadi, cahier-planche §5.1). */
export const TOLERANCE_PX = 10;
/** Déplacement minimal (px) pour qu'un appui devienne un glisser. */
const SEUIL_GLISSER_PX = 4;
/** Double-clic : délai et écart maximaux entre deux clics. */
const DOUBLE_MS = 400;
const DOUBLE_PX = 6;
/** Champ de vision initial : valeur relevée du champ Mesures de l'outil Zoom (« 35.00 deg. »). */
export const CHAMP_DE_VISION_INITIAL = 35;

/** Couleurs d'affichage (choix Fadi d'après SketchUp : recto gris clair, verso bleu-gris). */
const COULEUR_RECTO = "#f0f0ee";
const COULEUR_VERSO = "#a7b4c6";
const COULEUR_ARETE = "#000000";
const COULEUR_SELECTION = "#1a5fd6";
const COULEUR_SURVOL = "#5b8fe8";
const COULEUR_FOND = "#f4f6f8";
const COULEUR_SOL = "#e4e3de";
/** Aperçu noir hors inférence ; couleur de l'axe ou de la direction quand une inférence linéaire est active (§5.1). */
const INFERENCES_LINEAIRES = new Set(["axe-x", "axe-y", "axe-z", "parallele", "perpendiculaire", "tangente"]);

export interface RappelsVuePlanche {
  /** Événement pointeur destiné à l'outil actif. */
  evenement(ev: EvenementOutil): void;
  /** Outil de caméra actif : le glisser gauche oriente la caméra au lieu d'aller à l'outil. */
  outilCamera(): OutilCamera | null;
  /** Réglages de navigation courants (D-157). */
  navigation(): ReglagesNavigation;
  /** Premier pointeur tactile rencontré (affichage de la barre de modificateurs). */
  tactile?(): void;
  /** Fin d'un outil de caméra temporaire (Zoom fenêtre, Positionner la caméra) : l'interface choisit l'outil suivant. */
  finOutilCamera?(id: OutilCamera): void;
  /** Hauteur d'œil demandée (m) pour Positionner la caméra. */
  hauteurOeil?(): number;
}

/** Étiquette de texte posée sur un point monde (ou fixée en pixels). */
interface Etiquette {
  readonly el: HTMLDivElement;
  readonly point?: Vec3;
  readonly ecran?: Point2;
}

/** Hauteur d'œil par défaut relevée (« Height Offset ~ 1,68 m »). */
export const HAUTEUR_OEIL_DEFAUT = 1.68;

type Point2 = { x: number; y: number };
type Geste =
  | { genre: "outil"; id: number; depart: Point2; dernier: Point2; glisse: boolean }
  | { genre: "fenetre"; id: number; depart: Point2; dernier: Point2 }
  | { genre: "positionner"; id: number; depart: Point2; dernier: Point2; glisse: boolean }
  | { genre: "regarder"; id: number; dernier: Point2 }
  | { genre: "marcher"; id: number; depart: Point2; dernier: Point2 }
  | { genre: "orbite" | "pan" | "zoom"; id: number; dernier: Point2 }
  | { genre: "deux"; distance: number; centre: Point2 };

const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const versVec3 = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Triangulation d'une face plane trouée, triangles orientés selon la normale de la face. */
export function trianglesFace(f: FaceVisible): Vec3[] {
  if (f.exterieur.length < 3) return [];
  const { u, w } = baseDuPlan(f.normale);
  const p2 = (p: Vec3) => new THREE.Vector2(p.x * u.x + p.y * u.y + p.z * u.z, p.x * w.x + p.y * w.y + p.z * w.z);
  const tous = [...f.exterieur, ...f.trous.flat()];
  const indices = THREE.ShapeUtils.triangulateShape(f.exterieur.map(p2), f.trous.map((t) => t.map(p2)));
  const sortie: Vec3[] = [];
  for (const [i, j, k] of indices) {
    const a = i === undefined ? undefined : tous[i];
    const b = j === undefined ? undefined : tous[j];
    const c = k === undefined ? undefined : tous[k];
    if (!a || !b || !c) continue;
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const n = f.normale;
    const sens = (ab.y * ac.z - ab.z * ac.y) * n.x + (ab.z * ac.x - ab.x * ac.z) * n.y + (ab.x * ac.y - ab.y * ac.x) * n.z;
    if (sens >= 0) sortie.push(a, b, c);
    else sortie.push(a, c, b);
  }
  return sortie;
}

function geometrieFaces(faces: readonly FaceVisible[], couleurDe?: (f: FaceVisible) => string): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const f of faces) {
    if (couleurDe) c.set(couleurDe(f));
    for (const p of trianglesFace(f)) {
      pos.push(p.x, p.y, p.z);
      nor.push(f.normale.x, f.normale.y, f.normale.z);
      if (couleurDe) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  if (couleurDe) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Rectangle d'un plan de coupe : contour, quatre languettes aux coins, petite flèche du côté coupé. */
function rectanglePlan(origine: Vec3, u: Vec3, w: Vec3, demiU: number, demiW: number, couleur: string, normale: THREE.Vector3, pas: number): THREE.Object3D[] {
  const O = v3(origine);
  const U = v3(u);
  const W = v3(w);
  const coin = (su: number, sw: number): THREE.Vector3 => O.clone().add(U.clone().multiplyScalar(su * demiU)).add(W.clone().multiplyScalar(sw * demiW));
  const mat = new THREE.LineBasicMaterial({ color: couleur, depthTest: false });
  const r: THREE.Object3D[] = [new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([coin(-1, -1), coin(1, -1), coin(1, 1), coin(-1, 1)]), mat)];
  const l = Math.min(demiU, demiW) * 0.25;
  for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const c = coin(su, sw);
    const a = c.clone().add(U.clone().multiplyScalar(-su * l));
    const b = c.clone().add(W.clone().multiplyScalar(-sw * l));
    r.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, c, b]), new THREE.LineBasicMaterial({ color: couleur, depthTest: false })));
  }
  const fl = pas * 25;
  r.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints([O, O.clone().add(normale.clone().normalize().multiplyScalar(fl))]), mat));
  return r;
}

function geometrieSegments(segments: readonly (readonly [Vec3, Vec3])[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const [a, b] of segments) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function vider(groupe: THREE.Group): void {
  for (const enfant of [...groupe.children]) {
    groupe.remove(enfant);
    const o = enfant as THREE.Mesh;
    o.geometry?.dispose();
    const m = o.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  }
}

/** Le segment [a, b] (écran) touche-t-il le rectangle ? (sélection croisée) */
function segmentTouche(a: Point2, b: Point2, r: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const dedans = (p: Point2) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
  if (dedans(a) || dedans(b)) return true;
  const coins: Point2[] = [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
  const cote = (p: Point2, q: Point2, s: Point2) => Math.sign((q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x));
  for (let i = 0; i < 4; i++) {
    const c = coins[i]!;
    const d = coins[(i + 1) % 4]!;
    if (cote(a, b, c) !== cote(a, b, d) && cote(c, d, a) !== cote(c, d, b)) return true;
  }
  return false;
}

export class VuePlanche {
  private readonly canvas: HTMLCanvasElement;
  private readonly surcouche: HTMLDivElement;
  private readonly marqueur: HTMLDivElement;
  private readonly infobulle: HTMLDivElement;
  private readonly cadre: HTMLDivElement;
  private readonly contourSvg: SVGSVGElement;
  private readonly contourLigne: SVGPolylineElement;
  private readonly contourDepart: SVGRectElement;
  private readonly moteur: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CHAMP_DE_VISION_INITIAL, 1, 0.02, 20000);
  private readonly cible = new THREE.Vector3(0, 0, 0);
  private readonly groupeModele = new THREE.Group();
  private readonly groupeSelection = new THREE.Group();
  private readonly groupeApercu = new THREE.Group();
  private readonly groupeAnnotations = new THREE.Group();
  private groupeAxes: THREE.Group;
  private readonly etiquettesDom: HTMLDivElement;
  private etiquettesFixes: Etiquette[] = [];
  private etiquettesApercu: Etiquette[] = [];
  private modele: Modele | null = null;
  private cleSelection = "";
  private readonly sol: THREE.Mesh;
  private readonly lanceur = new THREE.Raycaster();
  private readonly demiAxes: { ligne: THREE.Line; direction: THREE.Vector3 }[] = [];
  private facesRecto: THREE.Mesh | null = null;
  private facesVerso: THREE.Mesh | null = null;
  private geometrie: GeometrieVisible = { aretes: [], faces: [], centres: [] };
  private largeur = 1;
  private hauteur = 1;
  private demande = 0;
  private inference: Inference | null = null;
  private dernierEcran: Point2 | null = null;
  private pointeurs = new Map<number, Point2>();
  private geste: Geste | null = null;
  private dernierClic: { t: number; p: Point2; nombre: 1 | 2 | 3 } | null = null;
  private readonly observateur: ResizeObserver | null;

  constructor(private readonly hote: HTMLElement, private readonly rappels: RappelsVuePlanche) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "planche-canevas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.surcouche = document.createElement("div");
    this.surcouche.className = "planche-surcouche";
    this.surcouche.setAttribute("aria-hidden", "true");
    this.marqueur = document.createElement("div");
    this.marqueur.className = "planche-marqueur";
    this.infobulle = document.createElement("div");
    this.infobulle.className = "planche-infobulle";
    this.cadre = document.createElement("div");
    this.cadre.className = "planche-cadre";
    const SVG = "http://www.w3.org/2000/svg";
    this.contourSvg = document.createElementNS(SVG, "svg");
    this.contourSvg.setAttribute("class", "planche-contour");
    this.contourLigne = document.createElementNS(SVG, "polyline");
    this.contourDepart = document.createElementNS(SVG, "rect");
    this.contourDepart.setAttribute("width", "8");
    this.contourDepart.setAttribute("height", "8");
    this.contourSvg.append(this.contourLigne, this.contourDepart);
    this.etiquettesDom = document.createElement("div");
    this.etiquettesDom.className = "planche-etiquettes";
    this.surcouche.append(this.contourSvg, this.marqueur, this.infobulle, this.cadre, this.etiquettesDom);
    // WebGL2 (three.js ≥ r163 n'a plus de repli WebGL1) : une erreur ici est remontée à l'interface.
    this.moteur = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    hote.append(this.canvas, this.surcouche);
    this.moteur.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene.background = new THREE.Color(COULEUR_FOND);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#9aa0a8", 2.2));
    const soleil = new THREE.DirectionalLight("#ffffff", 1.2);
    soleil.position.set(-30, -50, 80);
    this.scene.add(soleil);
    // Sol neutre : sous les faces posées à z = 0 (dessiné d'abord, sans écrire la profondeur).
    this.sol = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: COULEUR_SOL, depthWrite: false }));
    this.sol.renderOrder = -1;
    this.groupeAxes = this.axes();
    this.scene.add(this.sol, this.groupeAxes, this.groupeModele, this.groupeAnnotations, this.groupeSelection, this.groupeApercu);

    this.camera.up.set(0, 0, 1);
    this.camera.position.set(9, -12, 7);
    this.camera.lookAt(this.cible);

    this.canvas.addEventListener("pointerdown", this.surAppui);
    this.canvas.addEventListener("pointermove", this.surMouvement);
    this.canvas.addEventListener("pointerup", this.surRelache);
    this.canvas.addEventListener("pointercancel", this.surAnnulation);
    this.canvas.addEventListener("pointerleave", this.surSortie);
    this.canvas.addEventListener("wheel", this.surMolette, { passive: false });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.observateur = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.redimensionner()) : null;
    this.observateur?.observe(hote);
    this.redimensionner();
  }

  detruire(): void {
    this.observateur?.disconnect();
    cancelAnimationFrame(this.demande);
    vider(this.groupeModele);
    vider(this.groupeSelection);
    vider(this.groupeApercu);
    this.moteur.dispose();
    this.canvas.remove();
    this.surcouche.remove();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Dessin

  private axes(): THREE.Group {
    const g = new THREE.Group();
    const axes: [Vec3, string][] = [
      [{ x: 1, y: 0, z: 0 }, COULEURS["axe-x"]],
      [{ x: 0, y: 1, z: 0 }, COULEURS["axe-y"]],
      [{ x: 0, y: 0, z: 1 }, COULEURS["axe-z"]],
    ];
    for (const [d, couleur] of axes) {
      for (const signe of [1, -1]) {
        const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), v3(d).multiplyScalar(signe)]), signe > 0 ? new THREE.LineBasicMaterial({ color: couleur }) : new THREE.LineDashedMaterial({ color: couleur, dashSize: 0.4, gapSize: 0.3 }));
        ligne.frustumCulled = false;
        this.demiAxes.push({ ligne, direction: v3(d).multiplyScalar(signe) });
        g.add(ligne);
      }
    }
    return g;
  }

  /**
   * Demi-axes bornés à la partie située devant la caméra : un segment qui passe derrière l'œil n'est pas dessiné par
   * tous les moteurs (relevé sous SwiftShader) ; les pointillés gardent un pas d'environ 8 px à l'origine.
   */
  private ajusterAxes(): void {
    const L = 1000;
    const avant = new THREE.Vector3();
    this.camera.getWorldDirection(avant);
    const marge = this.camera.near * 20;
    const profondeur0 = new THREE.Vector3().sub(this.camera.position).dot(avant);
    const pas = this.metresParPixel(new THREE.Vector3());
    for (const { ligne, direction } of this.demiAxes) {
      const k = direction.dot(avant);
      let t = profondeur0 <= marge ? 0 : k < 0 ? Math.min(L, (profondeur0 - marge) / -k) : L;
      if (!(t > 0)) t = 0;
      const pos = ligne.geometry.attributes["position"] as THREE.BufferAttribute;
      pos.setXYZ(1, direction.x * t, direction.y * t, direction.z * t);
      pos.needsUpdate = true;
      ligne.visible = t > 0;
      const m = ligne.material;
      if (m instanceof THREE.LineDashedMaterial) {
        m.dashSize = pas * 8;
        m.gapSize = pas * 5;
        ligne.computeLineDistances();
      }
    }
  }

  /** Remplace la géométrie affichée par celle du modèle (aplatie : racine et occurrences). */
  majModele(modele: Modele): void {
    vider(this.groupeModele);
    this.modele = modele;
    this.geometrie = geometrieVisible(modele);
    const materiaux = modele.annotations?.materiaux ?? {};
    const couleurDe = (f: FaceVisible): string => (f.materiau ? materiaux[f.materiau]?.couleur ?? COULEUR_MATERIAU_DEFAUT : COULEUR_RECTO);
    const g = geometrieFaces(this.geometrie.faces, couleurDe);
    const recto = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const verso = new THREE.MeshLambertMaterial({ color: COULEUR_VERSO, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.facesRecto = new THREE.Mesh(g, recto);
    this.facesVerso = new THREE.Mesh(g.clone(), verso);
    const aretes = new THREE.LineSegments(geometrieSegments(this.geometrie.aretes.map((a) => [a.a, a.b] as const)), new THREE.LineBasicMaterial({ color: COULEUR_ARETE }));
    this.groupeModele.add(this.facesRecto, this.facesVerso, aretes);
    this.majAxes(modele);
    this.majAnnotations(modele, this.cleSelection ? this.cleSelection.split("|") : []);
    this.majCoupe(modele);
    this.rendre();
  }

  /** Axes de dessin au repère de saisie (outil Axes) : origine et orientation du repère, ou repère du modèle. */
  private majAxes(modele: Modele): void {
    const r = modele.annotations?.repere;
    const o = r?.origine ?? { x: 0, y: 0, z: 0 };
    const x = r?.x ?? { x: 1, y: 0, z: 0 };
    const y = r?.y ?? { x: 0, y: 1, z: 0 };
    const z = r?.z ?? { x: 0, y: 0, z: 1 };
    this.groupeAxes.matrixAutoUpdate = false;
    this.groupeAxes.matrix.makeBasis(v3(x), v3(y), v3(z)).setPosition(v3(o));
    this.groupeAxes.matrixWorldNeedsUpdate = true;
  }

  /**
   * Plan de coupe rendu : une seule coupe à la fois (§4.32), le DERNIER plan actif (ordre de création) ; le côté de la
   * normale est caché, Inverser retourne le sens. Les autres plans actifs restent visibles sans couper.
   */
  private majCoupe(modele: Modele): void {
    const actifs = Object.values(modele.annotations?.plansDeCoupe ?? {}).filter((p) => p.actif);
    const p = actifs[actifs.length - 1];
    if (!p) {
      this.moteur.clippingPlanes = [];
      return;
    }
    const n = v3(p.normale).multiplyScalar(p.inverse ? 1 : -1);
    this.moteur.clippingPlanes = [new THREE.Plane(n, -n.dot(v3(p.origine)))];
  }

  /** Guides, cotes, textes, plans de coupe (lot 4) ; les annotations sélectionnées sont en couleur de sélection / orange. */
  private majAnnotations(modele: Modele, selection: readonly string[]): void {
    vider(this.groupeAnnotations);
    for (const e of this.etiquettesFixes) e.el.remove();
    this.etiquettesFixes = [];
    const a = modele.annotations;
    if (!a) return;
    const sel = new Set(selection);
    const pas = this.metresParPixel(this.cible);
    const tirets = (couleur: string, pts: Vec3[], taille = 8): THREE.Line => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(v3)), new THREE.LineDashedMaterial({ color: couleur, dashSize: pas * taille, gapSize: pas * (taille * 0.6) }));
      l.computeLineDistances();
      l.frustumCulled = false;
      return l;
    };
    const plein = (couleur: string, pts: Vec3[]): THREE.Line => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(v3)), new THREE.LineBasicMaterial({ color: couleur }));
    const etiquette = (texte: string, point: Vec3, classe: string): void => {
      const el = document.createElement("div");
      el.className = `planche-etiquette ${classe}`;
      el.textContent = texte;
      this.etiquettesDom.append(el);
      this.etiquettesFixes.push({ el, point });
    };
    const cs = (id: string, defaut: string): string => (sel.has(id) ? COULEUR_SELECTION : defaut);
    for (const g of Object.values(a.guides)) {
      const c = cs(g.id, "#222222");
      if (g.genre === "ligne") {
        const L = 1000;
        const d = v3(g.direction);
        this.groupeAnnotations.add(tirets(c, [{ x: g.origine.x - d.x * L, y: g.origine.y - d.y * L, z: g.origine.z - d.z * L }, { x: g.origine.x + d.x * L, y: g.origine.y + d.y * L, z: g.origine.z + d.z * L }]));
      } else if (g.genre === "segment") this.groupeAnnotations.add(tirets(c, [g.origine, g.fin]));
      else {
        const r = pas * 5;
        const o = g.origine;
        this.groupeAnnotations.add(plein(c, [{ x: o.x - r, y: o.y, z: o.z }, { x: o.x + r, y: o.y, z: o.z }]), plein(c, [{ x: o.x, y: o.y - r, z: o.z }, { x: o.x, y: o.y + r, z: o.z }]), plein(c, [{ x: o.x, y: o.y, z: o.z - r }, { x: o.x, y: o.y, z: o.z + r }]));
      }
    }
    const fmt = (v: number): string => `${v.toFixed(2).replace(".", ",")} m`;
    const sommetMonde = (id: string): Vec3 | null => {
      const s = modele.racine.sommets[id];
      return s ? s.position : null;
    };
    for (const c of Object.values(a.cotes)) {
      const couleur = cs(c.id, "#333333");
      if (c.genre === "lineaire") {
        const A = (c.sommets && sommetMonde(c.sommets[0])) ?? c.a;
        const B = (c.sommets && sommetMonde(c.sommets[1])) ?? c.b;
        const d = v3(B).sub(v3(A));
        const L = d.length();
        if (L < 1e-9) continue;
        d.normalize();
        const off = v3(c.position).sub(v3(A));
        off.sub(d.clone().multiplyScalar(off.dot(d)));
        const A2 = v3(A).add(off);
        const B2 = v3(B).add(off);
        this.groupeAnnotations.add(plein(couleur, [A, A2]), plein(couleur, [B, B2]), plein(couleur, [A2, B2]));
        etiquette(fmt(L), A2.clone().add(B2).multiplyScalar(0.5), "planche-etiquette-cote");
      } else {
        this.groupeAnnotations.add(plein(couleur, [c.centre, c.position]));
        etiquette(`⌀ ${fmt(2 * c.rayon)}`, c.position, "planche-etiquette-cote");
      }
    }
    for (const t of Object.values(a.textes)) {
      if (t.genre === "repere") {
        this.groupeAnnotations.add(plein(cs(t.id, "#333333"), [t.ancre, t.position]));
        etiquette(t.texte, t.position, `planche-etiquette-texte${sel.has(t.id) ? " est-selectionne" : ""}`);
      } else {
        const el = document.createElement("div");
        el.className = `planche-etiquette planche-etiquette-texte planche-etiquette-ecran${sel.has(t.id) ? " est-selectionne" : ""}`;
        el.textContent = t.texte;
        this.etiquettesDom.append(el);
        this.etiquettesFixes.push({ el, ecran: t.ecran });
      }
    }
    for (const p of Object.values(a.plansDeCoupe)) {
      const couleur = sel.has(p.id) ? "#e8891c" : "#8a8a8a";
      this.groupeAnnotations.add(...rectanglePlan(p.origine, p.u, p.w, p.demiU, p.demiW, couleur, p.inverse ? v3(p.normale).multiplyScalar(-1) : v3(p.normale), pas));
    }
  }

  /** Projection des étiquettes (appelée à chaque rendu). */
  private placerEtiquettes(): void {
    for (const e of [...this.etiquettesFixes, ...this.etiquettesApercu]) {
      const p = e.point ? this.versEcran(e.point) : e.ecran ?? null;
      if (!p || p.x < -200 || p.y < -200 || p.x > this.largeur + 200 || p.y > this.hauteur + 200) {
        e.el.style.display = "none";
        continue;
      }
      Object.assign(e.el.style, { display: "block", left: `${p.x}px`, top: `${p.y}px` });
    }
  }

  /** Emprise (monde) de la géométrie visible, ou null si la Planche est vide. */
  emprise(): { min: Vec3; max: Vec3 } | null {
    const pts: Vec3[] = [];
    for (const a of this.geometrie.aretes) pts.push(a.a, a.b);
    for (const f of this.geometrie.faces) pts.push(...f.exterieur);
    if (pts.length === 0) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of pts) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
    return { min, max };
  }

  /** Surcouches de l'outil : sélection et survol, aperçu, inférence, cadre de sélection. */
  majSurcouche(vue: VueOutil | null, selection: readonly string[]): void {
    vider(this.groupeSelection);
    vider(this.groupeApercu);
    for (const e of this.etiquettesApercu) e.el.remove();
    this.etiquettesApercu = [];
    const cle = [...(vue?.selection ?? selection)].join("|");
    if (cle !== this.cleSelection && this.modele) {
      this.cleSelection = cle;
      this.majAnnotations(this.modele, cle ? cle.split("|") : []);
    }
    const choisis = new Set(vue?.selection ?? selection);
    const survoles = new Set((vue?.survol ?? []).filter((id) => !choisis.has(id)));
    for (const [ids, couleur, opacite] of [
      [choisis, COULEUR_SELECTION, 0.35],
      [survoles, COULEUR_SURVOL, 0.18],
    ] as const) {
      if (ids.size === 0) continue;
      const faces = this.geometrie.faces.filter((f) => ids.has(f.id));
      const aretes = this.geometrie.aretes.filter((a) => ids.has(a.id));
      if (faces.length) this.groupeSelection.add(new THREE.Mesh(geometrieFaces(faces), new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: opacite, side: THREE.DoubleSide, depthWrite: false })));
      if (aretes.length) this.groupeSelection.add(new THREE.LineSegments(geometrieSegments(aretes.map((a) => [a.a, a.b] as const)), new THREE.LineBasicMaterial({ color: couleur, depthTest: false })));
    }
    this.inference = vue?.inference && vue.inference.type !== "aucune" ? vue.inference : null;
    if (vue) {
      const lineaire = vue.inference && INFERENCES_LINEAIRES.has(vue.inference.type);
      const direction = lineaire ? vue.inference!.direction : undefined;
      // Une ligne d'aperçu prend la couleur de l'inférence seulement si elle est elle-même parallèle à la direction
      // inférée (la ligne en cours de tracé l'est par construction ; une arête dont on glisse une extrémité, non).
      const parallele = (l: readonly Vec3[]): boolean => {
        if (!direction) return !!lineaire;
        const a = l[0] as Vec3;
        const b = l[l.length - 1] as Vec3;
        const u = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
        const n = u.length();
        if (n < 1e-9) return false;
        return Math.abs(u.dot(v3(direction).normalize())) / n > 0.9999;
      };
      for (const l of vue.apercu.lignes) {
        if (l.length < 2) continue;
        const couleur = (l.length === 2 ? parallele(l) : !!lineaire) ? vue.inference!.couleur : "#000000";
        this.groupeApercu.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(l.map(v3)), new THREE.LineBasicMaterial({ color: couleur, depthTest: false })));
      }
      // Trajet en pointillé (Sélection : de la position d'origine de l'extrémité glissée au curseur).
      for (const l of vue.apercu.pointilles ?? []) {
        if (l.length < 2) continue;
        const fin = l[l.length - 1] as Vec3;
        const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints(l.map(v3)), new THREE.LineDashedMaterial({ color: "#5b7468", dashSize: this.metresParPixel(fin) * 6, gapSize: this.metresParPixel(fin) * 4, depthTest: false }));
        ligne.computeLineDistances();
        this.groupeApercu.add(ligne);
      }
      // Poignées d'extrémité (Sélection) : carrés pleins, taille écran constante, toujours visibles.
      if (vue.apercu.points && vue.apercu.points.length) {
        const poignees = new THREE.Points(new THREE.BufferGeometry().setFromPoints(vue.apercu.points.map(v3)), new THREE.PointsMaterial({ color: COULEUR_SELECTION, size: 10, sizeAttenuation: false, depthTest: false }));
        poignees.renderOrder = 10;
        this.groupeApercu.add(poignees);
      }
      if (vue.apercu.faces.length) {
        const faces: FaceVisible[] = vue.apercu.faces.filter((f) => f.length >= 3).map((f, i) => ({ id: `apercu-${i}`, exterieur: f, trous: [], normale: normaleNewell(f) }));
        this.groupeApercu.add(new THREE.Mesh(geometrieFaces(faces), new THREE.MeshBasicMaterial({ color: "#7d98c4", transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })));
      }
      // Ligne d'inférence pointillée (depuis le point de départ ou un point de référence).
      const inf = this.inference;
      if (inf?.origineLigne) {
        const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(inf.origineLigne), v3(inf.point)]), new THREE.LineDashedMaterial({ color: inf.couleur, dashSize: this.metresParPixel(inf.point) * 6, gapSize: this.metresParPixel(inf.point) * 4, depthTest: false }));
        ligne.computeLineDistances();
        this.groupeApercu.add(ligne);
      }
      for (const e of vue.apercu.etiquettes ?? []) {
        const el = document.createElement("div");
        el.className = "planche-etiquette planche-etiquette-apercu";
        el.textContent = e.texte;
        this.etiquettesDom.append(el);
        this.etiquettesApercu.push({ el, point: e.point });
      }
      if (vue.apercu.plan) {
        const p = vue.apercu.plan;
        this.groupeApercu.add(...rectanglePlan(p.origine, p.u, p.w, p.demiU, p.demiW, p.couleur, v3(p.normale), this.metresParPixel(p.origine)));
      }
      if (vue.apercu.rapporteur) {
        const r = vue.apercu.rapporteur;
        const rayon = this.metresParPixel(r.centre) * 70;
        const n = v3(r.normale).normalize();
        const u = v3(r.depart).normalize();
        const w = new THREE.Vector3().crossVectors(n, u);
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          pts.push(v3(r.centre).add(u.clone().multiplyScalar(rayon * Math.cos(a))).add(w.clone().multiplyScalar(rayon * Math.sin(a))));
        }
        this.groupeApercu.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.couleur, depthTest: false })));
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const k = i % 6 === 0 ? 0.8 : 0.9;
          const p1 = v3(r.centre).add(u.clone().multiplyScalar(rayon * k * Math.cos(a))).add(w.clone().multiplyScalar(rayon * k * Math.sin(a)));
          const p2 = v3(r.centre).add(u.clone().multiplyScalar(rayon * Math.cos(a))).add(w.clone().multiplyScalar(rayon * Math.sin(a)));
          this.groupeApercu.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), new THREE.LineBasicMaterial({ color: r.couleur, depthTest: false })));
        }
      }
      this.majCadre(vue.apercu.cadre ?? null);
      this.majContour(vue.apercu.contour ?? null);
    } else {
      this.majCadre(null);
      this.majContour(null);
    }
    this.majInfobulle();
    this.rendre();
  }

  private majCadre(c: VueOutil["apercu"]["cadre"] | null): void {
    if (!c) {
      this.cadre.style.display = "none";
      return;
    }
    const x0 = Math.min(c.de.x, c.a.x);
    const y0 = Math.min(c.de.y, c.a.y);
    Object.assign(this.cadre.style, { display: "block", left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(c.a.x - c.de.x)}px`, height: `${Math.abs(c.a.y - c.de.y)}px` });
    this.cadre.dataset["genre"] = c.genre;
  }

  /** Contour du Lasso (écran) : trait plein en fenêtre, pointillé en croisée ; carré rouge au premier point (relevé). */
  private majContour(c: VueOutil["apercu"]["contour"] | null): void {
    const premier = c?.points[0];
    if (!c || !premier) {
      this.contourSvg.style.display = "none";
      return;
    }
    this.contourSvg.style.display = "block";
    this.contourSvg.dataset["genre"] = c.genre;
    this.contourLigne.setAttribute("points", c.points.map((p) => `${p.x},${p.y}`).join(" "));
    this.contourDepart.setAttribute("x", String(premier.x - 4));
    this.contourDepart.setAttribute("y", String(premier.y - 4));
  }

  private majInfobulle(): void {
    const inf = this.inference;
    if (!inf || !inf.libelle.fr || !this.dernierEcran) {
      this.infobulle.style.display = "none";
      return;
    }
    this.infobulle.textContent = inf.libelle.fr;
    Object.assign(this.infobulle.style, { display: "block", left: `${this.dernierEcran.x + 16}px`, top: `${this.dernierEcran.y + 18}px` });
  }

  private placerMarqueur(): void {
    const inf = this.inference;
    const e = inf ? this.versEcran(inf.point) : null;
    if (!inf || !e) {
      this.marqueur.style.display = "none";
      return;
    }
    this.marqueur.dataset["type"] = inf.type;
    Object.assign(this.marqueur.style, { display: "block", left: `${e.x}px`, top: `${e.y}px`, color: inf.couleur });
  }

  rendre(): void {
    if (this.demande) return;
    this.demande = requestAnimationFrame(() => {
      this.demande = 0;
      this.camera.updateMatrixWorld();
      this.ajusterAxes();
      this.moteur.render(this.scene, this.camera);
      this.placerMarqueur();
      this.placerEtiquettes();
    });
  }

  private redimensionner(): void {
    const r = this.hote.getBoundingClientRect();
    this.largeur = Math.max(1, Math.round(r.width));
    this.hauteur = Math.max(1, Math.round(r.height));
    this.moteur.setSize(this.largeur, this.hauteur, false);
    this.camera.aspect = this.largeur / this.hauteur;
    this.camera.updateProjectionMatrix();
    this.rendre();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Projection, rayon, tolérance, cadre

  /** Position écran (px, relative au canevas) d'un point, ou `null` s'il est derrière la caméra. */
  versEcran(p: Vec3): Point2 | null {
    const v = v3(p).project(this.camera);
    if (v.z < -1 || v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.largeur, y: ((1 - v.y) / 2) * this.hauteur };
  }

  /** Rayon caméra → curseur (repère local du projet, mètres). */
  rayon(ecran: Point2): Rayon {
    this.lanceur.setFromCamera(new THREE.Vector2((ecran.x / this.largeur) * 2 - 1, -(ecran.y / this.hauteur) * 2 + 1), this.camera);
    return { origine: versVec3(this.lanceur.ray.origin), direction: versVec3(this.lanceur.ray.direction.clone().normalize()) };
  }

  /** Point visé sous le curseur : faces du modèle, sinon sol (z = 0), sinon la cible de la caméra. */
  private pointVise(ecran: Point2): THREE.Vector3 {
    const r = this.rayon(ecran);
    const cibles = [this.facesRecto, this.facesVerso].filter((m): m is THREE.Mesh => m !== null);
    const touche = this.lanceur.intersectObjects(cibles, false)[0];
    if (touche) return touche.point;
    if (Math.abs(r.direction.z) > 1e-6) {
      const t = -r.origine.z / r.direction.z;
      if (t > 0 && t < 5000) return v3(r.origine).add(v3(r.direction).multiplyScalar(t));
    }
    return this.cible.clone();
  }

  private metresParPixel(p: Vec3 | THREE.Vector3): number {
    const d = Math.max(0.01, this.camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)));
    return (2 * d * Math.tan((this.camera.fov * Math.PI) / 360)) / this.hauteur;
  }

  /** Tolérance d'accrochage : TOLERANCE_PX convertis en mètres à la profondeur visée sous le curseur. */
  tolerance(ecran: Point2): number {
    return TOLERANCE_PX * this.metresParPixel(this.pointVise(ecran));
  }

  /** Entités dont la projection écran est dans le cadre (fenêtre) ou le touche (croisée). */
  entitesDansCadre(de: Point2, a: Point2, genre: "fenetre" | "croisee"): string[] {
    const r = { x0: Math.min(de.x, a.x), y0: Math.min(de.y, a.y), x1: Math.max(de.x, a.x), y1: Math.max(de.y, a.y) };
    const dedans = (p: Point2 | null) => !!p && p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
    const ids: string[] = [];
    const contour = (pts: readonly Vec3[]): boolean => {
      const e = pts.map((p) => this.versEcran(p));
      if (genre === "fenetre") return e.every(dedans);
      for (let i = 0; i < e.length; i++) {
        const p = e[i];
        const q = e[(i + 1) % e.length];
        if (p && q && segmentTouche(p, q, r)) return true;
      }
      return false;
    };
    for (const ar of this.geometrie.aretes) {
      const pa = this.versEcran(ar.a);
      const pb = this.versEcran(ar.b);
      if (genre === "fenetre" ? dedans(pa) && dedans(pb) : !!pa && !!pb && segmentTouche(pa, pb, r)) ids.push(ar.id);
    }
    for (const f of this.geometrie.faces) if (contour(f.exterieur)) ids.push(f.id);
    return ids;
  }

  /** Entités dont la projection écran est dans un contour polygonal (fenêtre) ou le touche (croisée) : Lasso. */
  entitesDansContour(contour: readonly Point2[], genre: "fenetre" | "croisee"): string[] {
    if (contour.length < 3) return [];
    const dedans = (p: Point2 | null): boolean => {
      if (!p) return false;
      let c = false;
      for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const a = contour[i]!;
        const b = contour[j]!;
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    const croise = (p: Point2, q: Point2): boolean => {
      if (dedans(p) || dedans(q)) return true;
      const cote = (a: Point2, b: Point2, c: Point2) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      for (let i = 0; i < contour.length; i++) {
        const c = contour[i]!;
        const d = contour[(i + 1) % contour.length]!;
        if (cote(p, q, c) !== cote(p, q, d) && cote(c, d, p) !== cote(c, d, q)) return true;
      }
      return false;
    };
    const retenu = (pts: readonly Vec3[], ferme: boolean): boolean => {
      const e = pts.map((p) => this.versEcran(p));
      if (genre === "fenetre") return e.every(dedans);
      const n = ferme ? e.length : e.length - 1;
      for (let i = 0; i < n; i++) {
        const p = e[i];
        const q = e[(i + 1) % e.length];
        if (p && q && croise(p, q)) return true;
      }
      return false;
    };
    const ids: string[] = [];
    for (const ar of this.geometrie.aretes) if (retenu([ar.a, ar.b], false)) ids.push(ar.id);
    for (const f of this.geometrie.faces) if (retenu(f.exterieur, true)) ids.push(f.id);
    return ids;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Caméra

  get champDeVision(): number {
    return this.camera.fov;
  }

  set champDeVision(degres: number) {
    this.camera.fov = Math.min(120, Math.max(1, degres));
    this.camera.updateProjectionMatrix();
    this.rendre();
  }

  /** Orbite autour de la cible (axe vertical Z), en pixels d'écran. */
  orbiter(dxPx: number, dyPx: number): void {
    const off = new THREE.Vector3().subVectors(this.camera.position, this.cible);
    const l = off.length();
    if (l < 1e-9) return;
    const theta = Math.atan2(off.y, off.x) - (2 * Math.PI * dxPx) / this.hauteur;
    const phi = Math.min(Math.PI - 0.01, Math.max(0.01, Math.acos(Math.max(-1, Math.min(1, off.z / l))) - (2 * Math.PI * dyPx) / this.hauteur));
    this.camera.position.set(this.cible.x + l * Math.sin(phi) * Math.cos(theta), this.cible.y + l * Math.sin(phi) * Math.sin(theta), this.cible.z + l * Math.cos(phi));
    this.camera.lookAt(this.cible);
    this.rendre();
  }

  /** Panoramique (pixels d'écran ; positif = le dessin suit le geste vers la droite et le bas). */
  panoramique(dxPx: number, dyPx: number): void {
    const parPixel = this.metresParPixel(this.cible);
    this.camera.updateMatrixWorld();
    const droite = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const haut = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const v = droite.multiplyScalar(-dxPx * parPixel).add(haut.multiplyScalar(dyPx * parPixel));
    this.camera.position.add(v);
    this.cible.add(v);
    this.camera.lookAt(this.cible);
    this.rendre();
  }

  /** Zoom ancré sur le point visé (facteur > 1 : rapprocher). */
  /** Zoom étendu : cadre l'emprise dans la zone libre du canevas (marges en px : rail à gauche, panneaux à droite). */
  cadrer(boite: { min: Vec3; max: Vec3 }, marges: { gauche: number; droite: number; haut: number; bas: number } = { gauche: 0, droite: 0, haut: 0, bas: 0 }): void {
    const centre = new THREE.Vector3((boite.min.x + boite.max.x) / 2, (boite.min.y + boite.max.y) / 2, (boite.min.z + boite.max.z) / 2);
    const rayon = Math.max(0.5, new THREE.Vector3(boite.max.x - boite.min.x, boite.max.y - boite.min.y, boite.max.z - boite.min.z).length() / 2);
    const libreL = Math.max(50, this.largeur - marges.gauche - marges.droite);
    const libreH = Math.max(50, this.hauteur - marges.haut - marges.bas);
    const fovV = (this.camera.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const fovLibreV = 2 * Math.atan(Math.tan(fovV / 2) * (libreH / this.hauteur));
    const fovLibreH = 2 * Math.atan(Math.tan(fovH / 2) * (libreL / this.largeur));
    const d = rayon / Math.sin(Math.min(fovLibreV, fovLibreH) / 2);
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.cible).normalize();
    if (dir.lengthSq() < 1e-9) dir.set(0.6, -0.7, 0.4).normalize();
    this.cible.copy(centre);
    this.camera.position.copy(centre.clone().add(dir.multiplyScalar(d)));
    this.camera.lookAt(this.cible);
    this.camera.updateMatrixWorld();
    this.panoramique((marges.gauche - marges.droite) / 2, (marges.haut - marges.bas) / 2);
    this.rendre();
  }

  /** Zoom fenêtre : la zone écran [de, a] remplit la vue. */
  zoomFenetre(de: Point2, a: Point2): void {
    const cx = (de.x + a.x) / 2;
    const cy = (de.y + a.y) / 2;
    const lx = Math.max(8, Math.abs(a.x - de.x));
    const ly = Math.max(8, Math.abs(a.y - de.y));
    const p = this.pointVise({ x: cx, y: cy });
    this.cible.copy(p);
    this.camera.lookAt(this.cible);
    this.zoomer(Math.min(this.largeur / lx, this.hauteur / ly));
    this.rendre();
  }

  /** Positionner la caméra : œil au-dessus du point, à `hauteur`, regard horizontal dans la direction courante (ou vers `vers`). */
  positionnerCamera(point: Vec3, hauteur: number, vers?: Vec3): void {
    const oeil = new THREE.Vector3(point.x, point.y, point.z + hauteur);
    let dir: THREE.Vector3;
    if (vers) dir = new THREE.Vector3(vers.x - point.x, vers.y - point.y, 0);
    else dir = new THREE.Vector3().subVectors(this.cible, this.camera.position).setZ(0);
    if (dir.lengthSq() < 1e-9) dir.set(0, 1, 0);
    dir.normalize();
    this.camera.position.copy(oeil);
    this.cible.copy(oeil.clone().add(dir.multiplyScalar(10)));
    this.camera.lookAt(this.cible);
    this.rendre();
  }

  /** Regarder autour : la caméra pivote sur place (lacet autour de la verticale, tangage borné). */
  regarder(dxPx: number, dyPx: number): void {
    const dir = new THREE.Vector3().subVectors(this.cible, this.camera.position);
    const l = dir.length() || 10;
    const yaw = Math.atan2(dir.y, dir.x) - dxPx * 0.004;
    const pitch = Math.max(-1.4, Math.min(1.4, Math.asin(Math.max(-1, Math.min(1, dir.z / l))) + dyPx * 0.004));
    const nd = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)).multiplyScalar(l);
    this.cible.copy(this.camera.position.clone().add(nd));
    this.camera.lookAt(this.cible);
    this.rendre();
  }

  /** Marcher : haut / bas = avancer / reculer, gauche / droite = tourner ; Maj = monter / descendre et latéral ; Ctrl = courir. */
  marcher(dxPx: number, dyPx: number, options: { courir?: boolean; vertical?: boolean }): void {
    const vitesse = (options.courir ? 3 : 1) * 0.0015;
    const avant = new THREE.Vector3().subVectors(this.cible, this.camera.position).setZ(0);
    if (avant.lengthSq() < 1e-9) avant.set(0, 1, 0);
    avant.normalize();
    const droite = new THREE.Vector3(avant.y, -avant.x, 0);
    const d = new THREE.Vector3();
    if (options.vertical) d.add(new THREE.Vector3(0, 0, -dyPx * vitesse)).add(droite.multiplyScalar(dxPx * vitesse));
    else {
      d.add(avant.clone().multiplyScalar(-dyPx * vitesse));
      this.regarder(dxPx * 0.25, 0);
    }
    this.camera.position.add(d);
    this.cible.add(d);
    this.camera.lookAt(this.cible);
    this.rendre();
  }

  /** Hauteur d'œil (m) : altitude de la caméra. */
  /** Position de la caméra et champ de vision (instrumentation de la recette). */
  etatCamera(): { position: Vec3; champDeVision: number } {
    const p = this.camera.position;
    return { position: { x: p.x, y: p.y, z: p.z }, champDeVision: this.champDeVision };
  }

  get hauteurOeil(): number {
    return this.camera.position.z;
  }
  set hauteurOeil(z: number) {
    const dz = z - this.camera.position.z;
    this.camera.position.z = z;
    this.cible.z += dz;
    this.camera.lookAt(this.cible);
    this.rendre();
  }

  zoomer(facteur: number, ecran?: Point2): void {
    if (!(facteur > 0) || !Number.isFinite(facteur)) return;
    const p = ecran ? this.pointVise(ecran) : this.cible.clone();
    const pos = p.clone().add(this.camera.position.clone().sub(p).divideScalar(facteur));
    if (pos.distanceTo(p) < 0.05) return;
    this.camera.position.copy(pos);
    this.cible.copy(p.clone().add(this.cible.clone().sub(p).divideScalar(facteur)));
    this.camera.lookAt(this.cible);
    this.rendre();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pointeur

  private ecran(e: PointerEvent | WheelEvent): Point2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /**
   * Protocole d'événements (comme le DOM) : appui au bouton enfoncé, glisser à chaque mouvement bouton tenu (les
   * machines appliquent leur propre seuil), relâché, puis clic — après un vrai glisser, la machine ignore ce clic.
   * Le clic porte `double` / `triple` quand il suit un ou deux clics rapprochés (temps et position).
   */
  private emettre(genre: "survol" | "clic" | "appui" | "glisser" | "relache", p: Point2, nombre: 1 | 2 | 3 = 1): void {
    const rayon = this.rayon(p);
    const tolerance = this.tolerance(p);
    const ecran = { x: p.x, y: p.y };
    if (genre === "survol") this.rappels.evenement({ genre, rayon, tolerance, ecran });
    else if (genre === "clic") this.rappels.evenement({ genre, rayon, tolerance, ecran, ...(nombre === 2 ? { double: true } : nombre === 3 ? { triple: true } : {}) });
    else this.rappels.evenement({ genre, rayon, tolerance, ecran });
  }

  private surAppui = (e: PointerEvent): void => {
    const p = this.ecran(e);
    if (e.pointerType === "touch") this.rappels.tactile?.();
    this.hote.focus({ preventScroll: true });
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointeurs.set(e.pointerId, p);
    if (this.pointeurs.size === 2) {
      // Deux doigts : navigation ; l'appui d'outil en cours est relâché là où il était, sans clic.
      if (this.geste?.genre === "outil") this.emettre("relache", this.geste.dernier);
      const [a, b] = [...this.pointeurs.values()] as [Point2, Point2];
      this.geste = { genre: "deux", distance: Math.hypot(b.x - a.x, b.y - a.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (this.pointeurs.size > 2) return;
    if (e.button === 1) {
      e.preventDefault();
      this.geste = { genre: e.shiftKey ? "pan" : "orbite", id: e.pointerId, dernier: p };
      return;
    }
    if (e.button !== 0) return;
    const camera = this.rappels.outilCamera();
    if (camera) {
      if (camera === "zoom-fenetre") this.geste = { genre: "fenetre", id: e.pointerId, depart: p, dernier: p };
      else if (camera === "positionner-camera") this.geste = { genre: "positionner", id: e.pointerId, depart: p, dernier: p, glisse: false };
      else if (camera === "regarder-autour") this.geste = { genre: "regarder", id: e.pointerId, dernier: p };
      else if (camera === "marcher") this.geste = { genre: "marcher", id: e.pointerId, depart: p, dernier: p };
      else if (camera === "zoom-etendu") return;
      else this.geste = { genre: camera === "panoramique" || (camera === "orbite" && e.shiftKey) ? "pan" : camera === "zoom" ? "zoom" : "orbite", id: e.pointerId, dernier: p };
      return;
    }
    // Au toucher, pas de survol : le point touché est d'abord survolé (inférence), puis appuyé.
    if (e.pointerType === "touch") {
      this.dernierEcran = p;
      this.emettre("survol", p);
    }
    this.geste = { genre: "outil", id: e.pointerId, depart: p, dernier: p, glisse: false };
    this.emettre("appui", p);
  };

  private surMouvement = (e: PointerEvent): void => {
    const p = this.ecran(e);
    this.dernierEcran = p;
    if (this.pointeurs.has(e.pointerId)) this.pointeurs.set(e.pointerId, p);
    const g = this.geste;
    const nav = this.rappels.navigation();
    if (g?.genre === "deux") {
      const [a, b] = [...this.pointeurs.values()] as [Point2, Point2];
      if (!a || !b) return;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (g.distance > 1 && distance > 1) this.zoomer(Math.pow(distance / g.distance, borneSensibilite(nav.sensibiliteZoom) * (nav.inverserZoom ? -1 : 1)), centre);
      const dx = centre.x - g.centre.x;
      const dy = centre.y - g.centre.y;
      if (nav.deuxDoigts === "orbite") this.orbiter(dx * borneSensibilite(nav.sensibiliteOrbite) * (nav.inverserOrbite ? -1 : 1), dy * borneSensibilite(nav.sensibiliteOrbite) * (nav.inverserOrbite ? -1 : 1));
      else this.panoramique(dx * facteurPan(nav), dy * facteurPan(nav));
      this.geste = { genre: "deux", distance, centre };
      return;
    }
    if (g && g.genre !== "outil") {
      if (g.id !== e.pointerId) return;
      const dx = p.x - g.dernier.x;
      const dy = p.y - g.dernier.y;
      g.dernier = p;
      if (g.genre === "fenetre") {
        this.majCadre({ de: g.depart, a: p, genre: "fenetre" });
        return;
      }
      if (g.genre === "positionner") {
        if (Math.hypot(p.x - g.depart.x, p.y - g.depart.y) >= SEUIL_GLISSER_PX) g.glisse = true;
        return;
      }
      if (g.genre === "regarder") {
        this.regarder(dx, dy);
        return;
      }
      if (g.genre === "marcher") {
        this.marcher((p.x - g.depart.x) * 0.2, (p.y - g.depart.y) * 0.2, { courir: e.ctrlKey, vertical: e.shiftKey });
        return;
      }
      if (g.genre === "orbite") {
        const s = borneSensibilite(nav.sensibiliteOrbite) * (nav.inverserOrbite ? -1 : 1);
        this.orbiter(dx * s, dy * s);
      } else if (g.genre === "pan") this.panoramique(dx * facteurPan(nav), dy * facteurPan(nav));
      else this.zoomer(Math.exp(-dy * 0.01 * borneSensibilite(nav.sensibiliteZoom) * (nav.inverserZoom ? -1 : 1)));
      return;
    }
    if (g?.genre === "outil") {
      if (g.id !== e.pointerId) return;
      g.dernier = p;
      if (!g.glisse && Math.hypot(p.x - g.depart.x, p.y - g.depart.y) >= SEUIL_GLISSER_PX) g.glisse = true;
      // Au doigt, le glisser tient lieu de survol : l'aperçu (ligne, rectangle, inférence) suit le doigt, et le
      // relâcher pose le point là où le doigt s'arrête — appuyer-glisser-lâcher, sans touche ni saisie.
      if (e.pointerType === "touch") this.emettre("survol", p);
      this.emettre("glisser", p);
      this.majInfobulle();
      return;
    }
    if (e.pointerType !== "touch") {
      this.emettre("survol", p);
      this.majInfobulle();
    }
  };

  private surRelache = (e: PointerEvent): void => {
    const p = this.ecran(e);
    this.pointeurs.delete(e.pointerId);
    const g = this.geste;
    if (g?.genre === "deux") {
      if (this.pointeurs.size === 0) this.geste = null;
      return;
    }
    if (g?.genre === "outil" && g.id === e.pointerId) {
      this.geste = null;
      this.emettre("relache", p);
      const maintenant = performance.now();
      const d = this.dernierClic;
      const proche = !g.glisse && !!d && maintenant - d.t < DOUBLE_MS && Math.hypot(p.x - d.p.x, p.y - d.p.y) < DOUBLE_PX;
      const nombre = (proche ? Math.min(3, d!.nombre + 1) : 1) as 1 | 2 | 3;
      this.dernierClic = g.glisse || nombre === 3 ? null : { t: maintenant, p, nombre };
      this.emettre("clic", p, nombre);
      this.majInfobulle();
      return;
    }
    if (g && g.genre !== "outil" && g.id === e.pointerId) {
      this.geste = null;
      if (g.genre === "fenetre") {
        this.majCadre(null);
        if (Math.hypot(p.x - g.depart.x, p.y - g.depart.y) >= SEUIL_GLISSER_PX) this.zoomFenetre(g.depart, p);
        this.rappels.finOutilCamera?.("zoom-fenetre");
      } else if (g.genre === "positionner") {
        const h = this.rappels.hauteurOeil?.() ?? HAUTEUR_OEIL_DEFAUT;
        const A = versVec3(this.pointVise(g.depart));
        if (g.glisse) this.positionnerCamera(A, h, versVec3(this.pointVise(p)));
        else this.positionnerCamera(A, h);
        this.rappels.finOutilCamera?.("positionner-camera");
      }
    }
  };

  private surAnnulation = (e: PointerEvent): void => {
    this.pointeurs.delete(e.pointerId);
    if (this.geste?.genre === "outil") this.emettre("relache", this.geste.dernier);
    if (this.pointeurs.size === 0) this.geste = null;
  };

  private surSortie = (): void => {
    if (this.geste) return;
    this.dernierEcran = null;
    this.infobulle.style.display = "none";
  };

  private surMolette = (e: WheelEvent): void => {
    e.preventDefault();
    const g = interpreterMolette(e, this.rappels.navigation(), true);
    if (g.type === "zoom") this.zoomer(g.facteur, this.ecran(e));
    else if (g.type === "pan") this.panoramique(g.dx, g.dy);
    else this.orbiter(g.dx, g.dy);
  };
}

/** Normale unitaire d'un contour d'aperçu (Newell) ; +Z pour un contour dégénéré. */
function normaleNewell(pts: readonly Vec3[]): Vec3 {
  const n = newell(pts);
  const l = Math.hypot(n.x, n.y, n.z);
  return l < 1e-12 ? { x: 0, y: 0, z: 1 } : { x: n.x / l, y: n.y / l, z: n.z / l };
}
