/**
 * AC-005 / MES-03 — comparaison avant / après optimisation de la vue 3D, sur les opérations sélection, orbite, zoom,
 * pousser / tirer et changement de matériau.
 *
 * - **Après optimisation** (chemin servi par `Vue3DStudio`) : `projectionsAInvalider` désigne les objets à remailler,
 *   `studioMaillerObjets` ne maille qu'eux, `studioFusionnerMorceaux` reprend les autres du cache, `studioAssemblerMaillage`
 *   assemble ; la scène incrémentale (`SceneRendu`) ne reconstruit que les signatures changées, fusionne murs et volumes
 *   en lots et instancie les formes répétées. Mêmes entrées de scène que la vue (`entrees-scene.ts`).
 * - **Avant optimisation** (chemin de référence) : à chaque état, maillage complet `studioMesh3d`, un objet three.js par
 *   objet Studio (ni cache, ni lots, ni instanciation), même aspect.
 *
 * Fidélité : les deux scènes sont lancées sur la même grille de rayons depuis la même caméra ; on compare, rayon par
 * rayon, les objets touchés au plus près (égalité d'ensemble, ex æquo compris), la distance d'impact et la couleur de
 * l'aspect touché ; puis le nombre total de triangles. Postes mesurés séparément (MES-03) : transfert (clonage
 * structuré aller et retour, comme la frontière du Worker de maillage), activation, calcul, rendu CPU (durée JavaScript
 * de `renderer.render()` ou du substitut fourni), invalidation, mémoire résiduelle ; le rendu GPU n'est jamais mesuré
 * ici (`null` : « non évalué »).
 *
 * Ni React ni DOM : three.js seulement ; horloge, rendu et lecture du tas sont injectés (navigateur ou Node).
 */
import * as THREE from "three";
import {
  projectionsAInvalider, studioAssemblerMaillage, studioFusionnerMorceaux, studioMaillerObjets, studioMesh3d, validateStudioDocument,
  type StudioCacheMaillage, type StudioCommand, type StudioDocument, type StudioMesh3d, type StudioModeAffichage, type StudioMorceauMaillage,
} from "@parcours/atelier-model";
import {
  STUDIO_OPERATIONS_FIDELITE, STUDIO_RAPPORT_OPTIMISATION_SCHEMA,
  type StudioComparaisonOperation, type StudioFideliteOperation, type StudioMesuresSeparees, type StudioOperationFidelite, type StudioRapportOptimisation,
} from "@parcours/atelier-model/studio-mesures";
import { appliquerBrouillon, creerBrouillon, documentBrouillon } from "../planche2d/brouillon";
import { entreesArchitecture, entreesContenu, entreesLibres, volumeSeul, type Lecture } from "./entrees-scene";

/** Commandes appliquées par le brouillon, comme pendant une session d'édition (contrat de commandes, A.5-01). */
const commander = (doc: StudioDocument, cs: readonly StudioCommand[]): StudioDocument => documentBrouillon(appliquerBrouillon(creerBrouillon(doc), [...cs]));
import { idImpact } from "./picking";
import { libererObjet, vider } from "./ressources-gpu";
import { impactDe, SceneRendu, type EntreeRendu } from "./scene-rendu";

export interface CameraEtat { position: THREE.Vector3Like; cible: THREE.Vector3Like; fov: number; aspect: number }

/** État affiché : document, sélection, mode et caméra (ce que la vue lit). */
export interface EtatVue {
  doc: StudioDocument;
  selection: string | null;
  selectionArchitecture: string | null;
  mode: StudioModeAffichage;
  camera: CameraEtat;
}

export interface Instruments {
  maintenant: () => number;
  /** Rendu d'une scène (navigateur : `renderer.render`) ; sa durée est le rendu CPU. */
  rendre: (scene: THREE.Scene, camera: THREE.Camera) => void;
  /** Tas JavaScript (octets) après ramasse-miettes si possible ; `null` si illisible. */
  memoire: () => number | null;
  /** Mise en route du moteur de rendu (navigateur : création du WebGLRenderer) ; mesurée dans l'activation. */
  activer?: () => void;
}

/** Opérations du scénario, appliquées dans l'ordre à l'état précédent. */
export interface ScenarioOperations {
  selection: string;
  orbite: { azimut: number; elevation: number };
  zoom: number;
  pousserTirer: StudioCommand;
  materiau: StudioCommand;
}

const ids = (d: StudioDocument) => new Set([...d.objects.map((o) => o.id), ...(d.solides ?? []).map((o) => o.id), ...(d.exacts ?? []).map((o) => o.id), ...(d.architecture ?? []).map((o) => o.id)]);

function entreesDe(e: EtatVue, mesh: StudioMesh3d, cle: (id: string) => string): EntreeRendu[][] {
  const presents = ids(e.doc);
  const l: Lecture = { mesh, doc: e.doc, mode: e.mode, selection: e.selection, selectionArchitecture: e.selectionArchitecture, present: (id) => presents.has(id), cle };
  return [entreesContenu(l), entreesLibres(l), entreesArchitecture(l)];
}

const octets = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Caméra three.js d'un état (perspective, z vers le haut comme la vue). */
export function cameraThree(c: CameraEtat): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(c.fov, c.aspect, 0.01, 10_000);
  cam.up.set(0, 0, 1);
  cam.position.set(c.position.x, c.position.y, c.position.z);
  cam.lookAt(c.cible.x, c.cible.y, c.cible.z);
  cam.updateMatrixWorld(true);
  return cam;
}

/** Orbite autour de la cible (angles en radians), comme `OrbitControls` (azimut autour de z, élévation bornée). */
export function orbiter(c: CameraEtat, azimut: number, elevation: number): CameraEtat {
  const v = new THREE.Vector3(c.position.x - c.cible.x, c.position.y - c.cible.y, c.position.z - c.cible.z);
  const r = v.length();
  const theta = Math.atan2(v.y, v.x) + azimut;
  const phi = Math.min(Math.PI / 2 - 1e-3, Math.max(-Math.PI / 2 + 1e-3, Math.asin(v.z / r) + elevation));
  return { ...c, position: { x: c.cible.x + r * Math.cos(phi) * Math.cos(theta), y: c.cible.y + r * Math.cos(phi) * Math.sin(theta), z: c.cible.z + r * Math.sin(phi) } };
}

/** Zoom (rapprochement) : distance à la cible multipliée par `facteur`. */
export function zoomer(c: CameraEtat, facteur: number): CameraEtat {
  return { ...c, position: { x: c.cible.x + (c.position.x - c.cible.x) * facteur, y: c.cible.y + (c.position.y - c.cible.y) * facteur, z: c.cible.z + (c.position.z - c.cible.z) * facteur } };
}

/** États successifs du scénario (état initial puis un par opération, dans l'ordre d'AC-005). */
export function etatsDuScenario(initial: EtatVue, s: ScenarioOperations): { operation: StudioOperationFidelite; etat: EtatVue }[] {
  const out: { operation: StudioOperationFidelite; etat: EtatVue }[] = [];
  let e = initial;
  for (const op of STUDIO_OPERATIONS_FIDELITE) {
    if (op === "selection") e = { ...e, selection: s.selection };
    else if (op === "orbite") e = { ...e, camera: orbiter(e.camera, s.orbite.azimut, s.orbite.elevation) };
    else if (op === "zoom") e = { ...e, camera: zoomer(e.camera, s.zoom) };
    else if (op === "pousser-tirer") e = { ...e, doc: commander(e.doc, [s.pousserTirer]) };
    else e = { ...e, doc: commander(e.doc, [s.materiau]) };
    out.push({ operation: op, etat: e });
  }
  return out;
}

interface Passe { scene: THREE.Scene; mesures: StudioMesuresSeparees }

/** Chemin servi (après optimisation) : cache de maillage et scène incrémentale tenus d'un état à l'autre. */
export class CheminOptimise {
  readonly scene = new THREE.Scene();
  private readonly rendus: SceneRendu[];
  private cache: StudioCacheMaillage | null = null;
  private version = 0;
  readonly activationMs: number;
  constructor(private readonly ins: Instruments) {
    const t0 = ins.maintenant();
    ins.activer?.();
    const groupes = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    for (const g of groupes) this.scene.add(g);
    this.rendus = groupes.map((g) => new SceneRendu(g));
    this.activationMs = ins.maintenant() - t0;
  }

  appliquer(e: EtatVue): Passe {
    const { maintenant } = this.ins;
    const tas0 = this.ins.memoire();
    const ti = maintenant();
    const invalidation = projectionsAInvalider(this.cache?.doc ?? null, e.doc);
    const invalidationMs = maintenant() - ti;
    const charge = { document: e.doc, ids: invalidation.complet ? null : invalidation.ids };
    // Rien à remailler (navigation, sélection) : aucun message vers le Worker.
    const aMailler = invalidation.complet || invalidation.ids.length > 0;
    let transfertMs = 0, transfertOctets = 0;
    const tc = maintenant();
    let morceaux: StudioMorceauMaillage[] = [];
    if (aMailler) {
      const t1 = maintenant();
      const recu = structuredClone(charge);
      transfertMs += maintenant() - t1;
      transfertOctets += octets(charge);
      const m = studioMaillerObjets(recu.document, recu.ids);
      const t2 = maintenant();
      morceaux = structuredClone(m);
      transfertMs += maintenant() - t2;
      transfertOctets += octets(m);
    }
    const suivant = studioFusionnerMorceaux(this.cache, e.doc, invalidation, morceaux);
    const mesh = studioAssemblerMaillage(e.doc, suivant.morceaux);
    this.cache = suivant;
    const v = String(++this.version);
    const listes = entreesDe(e, mesh, (id) => suivant.morceaux.get(id)?.cle ?? `?${id}`);
    const bilans = listes.map((l, i) => this.rendus[i]!.mettreAJour(l, v));
    const calculMs = maintenant() - tc - transfertMs;
    const cam = cameraThree(e.camera);
    const tr = maintenant();
    this.ins.rendre(this.scene, cam);
    const renduCpuMs = maintenant() - tr;
    const tas1 = this.ins.memoire();
    return {
      scene: this.scene,
      mesures: {
        transfertMs, transfertOctets, activationMs: this.activationMs, calculMs, renduCpuMs, renduGpuMs: null,
        invalidation: { objets: invalidation.complet ? ids(e.doc).size : invalidation.ids.length, complet: invalidation.complet, reconstruits: bilans.reduce((n, b) => n + b.construits + b.lotsConstruits + b.instancesConstruites, 0), ms: invalidationMs },
        memoireResiduelleOctets: tas0 === null || tas1 === null ? null : tas1 - tas0,
      },
    };
  }

  liberer(): void { for (const r of this.rendus) r.vider(); }
}

/** Chemin de référence (avant optimisation) : tout est remaillé et reconstruit, un objet three.js par objet Studio. */
export class CheminReference {
  readonly scene = new THREE.Scene();
  private readonly groupe = new THREE.Group();
  readonly activationMs: number;
  constructor(private readonly ins: Instruments) {
    const t0 = ins.maintenant();
    ins.activer?.();
    this.scene.add(this.groupe);
    this.activationMs = ins.maintenant() - t0;
  }

  appliquer(e: EtatVue): Passe {
    const { maintenant } = this.ins;
    const tas0 = this.ins.memoire();
    const ti = maintenant();
    const tous = [...ids(e.doc)];
    const invalidationMs = maintenant() - ti;
    const t1 = maintenant();
    const recu = structuredClone(e.doc);
    const aller = maintenant() - t1;
    const tc = maintenant();
    const m = studioMesh3d(recu);
    const t2 = maintenant();
    const mesh = structuredClone(m);
    const retour = maintenant() - t2;
    const transfertMs = aller + retour;
    const transfertOctets = octets(e.doc) + octets(m);
    vider(this.groupe);
    let unique = 0;
    let reconstruits = 0;
    for (const liste of entreesDe(e, mesh, () => `ref${++unique}`)) {
      for (const x of liste) {
        const objets = x.lot !== undefined ? volumeSeul(x.geometrie, x.aspect, x.id, { architecture: x.id }) : x.construire();
        for (const o of objets) this.groupe.add(o);
        reconstruits++;
      }
    }
    const calculMs = maintenant() - tc - retour;
    const cam = cameraThree(e.camera);
    const tr = maintenant();
    this.ins.rendre(this.scene, cam);
    const renduCpuMs = maintenant() - tr;
    const tas1 = this.ins.memoire();
    return {
      scene: this.scene,
      mesures: {
        transfertMs, transfertOctets, activationMs: this.activationMs, calculMs, renduCpuMs, renduGpuMs: null,
        invalidation: { objets: tous.length, complet: true, reconstruits, ms: invalidationMs },
        memoireResiduelleOctets: tas0 === null || tas1 === null ? null : tas1 - tas0,
      },
    };
  }

  liberer(): void { for (const o of [...this.groupe.children]) { this.groupe.remove(o); libererObjet(o); } }
}

/** Triangles dessinés (surfaces seulement ; un groupe instancié compte chaque exemplaire). */
export function trianglesDe(scene: THREE.Object3D): number {
  let n = 0;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    const t = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    n += o instanceof THREE.InstancedMesh ? t * o.count : t;
  });
  return n;
}

interface Touche { ids: string[]; distance: number | null; couleur: string | null }

function toucher(scene: THREE.Scene, cam: THREE.Camera, x: number, y: number): Touche {
  const r = new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2(x, y), cam);
  const h = r.intersectObjects(scene.children, true).filter((i) => i.object instanceof THREE.Mesh);
  if (h.length === 0) return { ids: [], distance: null, couleur: null };
  const d = h[0]!.distance;
  const proches = h.filter((i) => i.distance - d <= 1e-9);
  const couleur = (i: THREE.Intersection) => {
    const m = (i.object as THREE.Mesh).material as THREE.Material & { color?: THREE.Color; opacity: number };
    return `${m.color?.getHexString() ?? "?"}/${m.opacity}`;
  };
  return {
    ids: [...new Set(proches.map((i) => idImpact(impactDe(i)) ?? "?"))].sort(),
    distance: d,
    couleur: [...new Set(proches.map(couleur))].sort().join(","),
  };
}

/** Fidélité d'un état : même grille de rayons (`colonnes` × `lignes`) dans les deux scènes, depuis la même caméra. */
export function comparerScenes(reference: THREE.Scene, optimise: THREE.Scene, camera: CameraEtat, colonnes = 40, lignes = 30): StudioFideliteOperation {
  reference.updateMatrixWorld(true);
  optimise.updateMatrixWorld(true);
  const cam = cameraThree(camera);
  let divergences = 0, aspects = 0, ecart = 0;
  for (let j = 0; j < lignes; j++) {
    for (let i = 0; i < colonnes; i++) {
      const x = ((i + 0.5) / colonnes) * 2 - 1, y = ((j + 0.5) / lignes) * 2 - 1;
      const a = toucher(reference, cam, x, y), b = toucher(optimise, cam, x, y);
      if (a.ids.join("|") !== b.ids.join("|")) { divergences++; continue; }
      if (a.distance !== null && b.distance !== null) ecart = Math.max(ecart, Math.abs(a.distance - b.distance));
      if (a.couleur !== b.couleur) aspects++;
    }
  }
  return { rayons: colonnes * lignes, divergences, ecartDistanceMax: ecart, aspectsDivergents: aspects, trianglesReference: trianglesDe(reference), trianglesOptimise: trianglesDe(optimise) };
}

/**
 * Rejoue le scénario sur les deux chemins et rend le rapport `studio-rapport-optimisation-3d/1` (verdict :
 * `studioJugerOptimisation`). `fabrique` : instruments du chemin (un rendu par chemin dans le navigateur).
 */
export function comparerOptimisation(
  initial: EtatVue, scenario: ScenarioOperations, fabrique: () => Instruments,
  environnement: StudioRapportOptimisation["environnement"], options: { colonnes?: number; lignes?: number; alterer?: (op: StudioOperationFidelite, scene: THREE.Scene) => void } = {},
): StudioRapportOptimisation {
  const avant = new CheminReference(fabrique());
  const apres = new CheminOptimise(fabrique());
  // État initial établi sur les deux chemins (premier maillage complet), non compté.
  avant.appliquer(initial);
  apres.appliquer(initial);
  const operations: StudioComparaisonOperation[] = [];
  for (const { operation, etat } of etatsDuScenario(initial, scenario)) {
    const r = avant.appliquer(etat);
    const o = apres.appliquer(etat);
    options.alterer?.(operation, o.scene);
    operations.push({ operation, reference: r.mesures, optimise: o.mesures, fidelite: comparerScenes(r.scene, o.scene, etat.camera, options.colonnes, options.lignes) });
  }
  avant.liberer();
  apres.liberer();
  return { schema: STUDIO_RAPPORT_OPTIMISATION_SCHEMA, environnement, operations };
}

// ——— Scène de la comparaison ———

const mur = (i: number, x: number, y: number, longueur: number) => ({ id: `mur-${i}`, type: "wall" as const, axis: [{ x, y }, { x: x + longueur, y }], thickness: 0.2, height: 2.8, base: 0, justification: "center" as const });

/**
 * Scène de la comparaison : quatre murs séparés (lots), une ouverture, quatre volumes extrudés identiques (instanciés)
 * et un différent, trois solides libres (pousser / tirer et sélection sur `boite-1`). `n` répète la rangée de murs et de
 * volumes (charge), sans jamais faire se toucher deux objets (aucune face confondue).
 */
export function sceneComparaison(n = 1): { initial: EtatVue; scenario: ScenarioOperations } {
  const architecture: unknown[] = [];
  const objects: unknown[] = [];
  for (let k = 0; k < n; k++) {
    const y0 = k * 12;
    for (let i = 0; i < 4; i++) architecture.push(mur(k * 4 + i, i * 7, y0, 5));
    for (let i = 0; i < 4; i++) objects.push({ id: `volume-${k}-${i}`, type: "rectangle", origin: { x: i * 3, y: y0 + 4 }, width: 1.5, height: 1, extrusion: { base: 0, height: 2 } });
    objects.push({ id: `volume-${k}-autre`, type: "rectangle", origin: { x: 14, y: y0 + 4 }, width: 2.5, height: 1.5, extrusion: { base: 0, height: 1.2 } });
  }
  let doc = validateStudioDocument({ id: "comparaison-ac005", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects, architecture });
  doc = commander(doc, [
    { toolId: "studio.architecture.ouverture", params: { id: "ouverture-0", type: "opening", hostId: "mur-0", position: 2.5, width: 1, height: 2.1, sill: 0 } },
    ...[0, 1, 2].map((i): StudioCommand => ({ toolId: "studio.solide.boite", params: { id: `boite-${i}`, type: "box", placement: { origin: { x: i * 4, y: -6, z: 0 }, rotation: i * 0.3 }, width: 2, depth: 2, height: 2 } })),
  ]);
  const largeur = 28, profondeur = Math.max(12 * n, 12);
  return {
    initial: { doc, selection: null, selectionArchitecture: null, mode: "shaded-edges", camera: { position: { x: largeur / 2 - 18, y: -30, z: 22 }, cible: { x: largeur / 2, y: profondeur / 2 - 6, z: 0 }, fov: 50, aspect: 4 / 3 } },
    scenario: {
      selection: "boite-1",
      orbite: { azimut: Math.PI / 5, elevation: -0.15 },
      zoom: 0.7,
      pousserTirer: { toolId: "studio.solide.face-decaler", params: { id: "boite-1", face: "sommet", distance: 1.5 } },
      materiau: { toolId: "studio.apparence.definir", params: { id: "apparence-murs", type: "appearance", target: { kind: "object", id: "mur-1" }, color: "#2e86c1", finish: "glass" } },
    },
  };
}

export { STUDIO_OPERATIONS_FIDELITE };
