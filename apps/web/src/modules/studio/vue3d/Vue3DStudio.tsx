/**
 * Vue 3D de Studio (chargée à la demande) : rendu three.js de la géométrie dérivée `studioMesh3d` du brouillon courant
 * (non enregistré compris), dans le repère `local-3d` (z vers le haut, mètres). Deux navigations : orbite (orbite,
 * panoramique, zoom) ou plan (vue de dessus orthographique, panoramique et zoom) — bascule « Vue en plan (3D) », Maj+G.
 * Les objets non extrudés sont dessinés à plat (z = 0) et comptés. Sans WebGL, la vue l'annonce et garde le décompte.
 *
 * Volume libre (A.3-02) : avec l'outil Boîte, un clic sur la grille (z = 0) donne l'origine, puis les dimensions sont
 * saisies ; Prisme sur profil copie le contour d'une polyligne fermée, posé à la cote saisie ; un clic sur un solide
 * libre (ou la liste des solides) le sélectionne pour le déplacer (dx, dy, dz) ou le supprimer. Chaque geste passe par
 * les commandes `studio.solide.*` du brouillon ; aucun geste de navigation ne modifie le document.
 * Coupe horizontale (A.3-07, Maj+K) : `couperStudio` à la cote saisie, dessinée en surimpression dérivée, non
 * modifiable, chaque contour rattaché à son solide. Studio n'importe aucun module de l'Atelier.
 * Maillage en tâche de fond (D.1/D.2, `taches/`) : le maillage tourne dans le groupe de Workers ; le maillage
 * précédent reste affiché jusqu'au suivant et un maillage remplacé n'est jamais affiché. Ressources GPU libérées à
 * chaque reconstruction et au démontage (`ressources-gpu.ts`, D.3-02) ; compteurs exposés sur le canevas.
 *
 * Projections versionnées et invalidation minimale (lot C.2, `projections.ts` du modèle) : entre le document du cache
 * et le document courant, `projectionsAInvalider` désigne les seuls objets à remailler (et leurs dépendants : hôte et
 * ouvertures d'un mur, cotes liées, objets visés par une apparence) ; le Worker ne maille qu'eux
 * (`maillage.3d.objets`), les autres morceaux sont repris du cache, et l'assemblage rend exactement `studioMesh3d`.
 * Reconstruction complète quand l'exactitude l'exige (calques modifiés, ampleur). Côté GPU (`scene-rendu.ts`), chaque
 * objet three.js est rangé sous la clé de contenu de son morceau et son aspect : seuls les objets dont la signature
 * change sont reconstruits (et les remplacés libérés) ; murs et volumes extrudés sont fusionnés en lots stables dont la
 * table de désignation (`picking.ts`) résout un clic vers le bon identifiant, jamais vers un objet supprimé.
 *
 * Visualisation (lot E.5, `scenes/`) : scènes enregistrées (caméra relevée de la vue, calques montrés, mode
 * d'affichage), rappelées sans modifier le modèle ; apparence d'affichage (couleur, finition) d'un calque ou d'un
 * objet, appliquée au rendu seulement ; « Exporter le rendu PNG » : image du canevas WebGL avec sa provenance (bloc
 * `iTXt` : étude, variante, révision affichée, scène, date, « rendu du modèle »). La barre transmet ses outils
 * `studio.scene.*` / `studio.apparence.*` et la commande `exporter-png` par `demande`.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mesurerRendu3d } from "../chargement/mesures-studio";
import {
  couperStudio, projectionsAInvalider, studioApparenceResolue, studioAssemblerMaillage, studioDocumentToutVisible, studioFiltrerMaillageScene, studioFusionnerMorceaux, studioMaillerObjets,
  studioNomFichierRendu, studioProvenanceRendu, studioScenes, studioVersionProjection, studioVolumeSolide,
  type StudioCacheMaillage, type StudioCameraScene, type StudioCommand, type StudioCoupe, type StudioDocument, type StudioFinitionAffichage, type StudioInvalidation, type StudioMesh3d,
  type StudioModeAffichage, type StudioMorceauMaillage, type StudioScene,
} from "@parcours/atelier-model";
import { empreinteDe } from "../taches/empreinte";
import { useTache } from "../taches/useTache";
import { MESSAGES_TACHE } from "../taches/messages";
import { compteGpu, libererObjet, vider } from "./ressources-gpu";
import { cleAspect, objetsVolume, preparer, SceneRendu, type AspectVolume, type DonneesLot, type EntreeRendu, type GeometrieObjet } from "./scene-rendu";
import { designer, type Impact } from "./picking";
import { architectureDesignable, estOuverture, solidesDesignables } from "./designation";
import { Icon } from "../../../components/Icon";
import { estSelectionnable } from "../planche2d/calques";
import { LOCALE } from "../../../lib/i18n";
import {
  auCentimetre, BOITE_VIDE, commandeBoite, commandeDeplacementSolide, commandePrisme, DEPLACEMENT_VIDE, descriptionSolide, PRISME_VIDE, profilsFermes,
  type ValeursBoite, type ValeursDeplacement, type ValeursPrisme,
} from "./volume-libre";
import { CLE_PROVENANCE_PNG, insererTextePng } from "./scenes/png";
import { PanneauVisualisation } from "./scenes/PanneauVisualisation";
import {
  calquesVisualisation, cameraScene, commandeApparence, commandeMiseAJourScene, commandeNouvelleScene, commandeRetraitApparence, commandeSuppressionScene,
  apparenceDe, couleurEntiere, hautCamera, MODE_INITIAL, prochainNomScene, type DemandeVue3d,
} from "./scenes/scenes-ui";
import "./vue3d.css";

export type Navigation3d = "orbite" | "plan";

export interface Vue3DStudioProps {
  doc: StudioDocument;
  /** Outil actif de la barre (les outils `studio.solide.*` agissent ici). */
  outil?: string;
  modifiable?: boolean;
  navigation?: Navigation3d;
  /** Coupe horizontale affichée. */
  coupe?: boolean;
  /** Solide libre sélectionné. */
  selection?: string | null;
  /** Calque des solides créés (absent : calque implicite). */
  layerId?: string;
  surSelection?: (id: string | null) => void;
  /** Applique un lot au brouillon ; faux si le modèle le refuse (l'éditeur affiche le refus). */
  surCommandes?: (cs: StudioCommand[]) => boolean;
  /** Mur ou ouverture sélectionné(e) (A.4) : même identifiant que sur la planche 2D. */
  selectionArchitecture?: string | null;
  surSelectionArchitecture?: (id: string | null) => void;
  /** Outil de visualisation ou commande `exporter-png` transmis par la barre ; `surDemandeTraitee` le consomme. */
  demande?: DemandeVue3d | null;
  surDemandeTraitee?: () => void;
  /** Passage orbite / plan demandé par le rappel d'une scène (perspective / orthographique). */
  surNavigation?: (n: Navigation3d) => void;
  /** Provenance du rendu : étude, variante, révision affichée ; `nonEnregistre` : le brouillon diffère de la révision. */
  provenance?: { etude: { id: string; nom: string }; variante: { id: string; nom: string }; revisionId: string; nonEnregistre: boolean };
}

interface Moteur {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  perspective: THREE.PerspectiveCamera;
  plan: THREE.OrthographicCamera;
  camera: THREE.Camera;
  controls: OrbitControls | null;
  contenu: THREE.Group;
  libres: THREE.Group;
  /** Murs (vides compris) et ouvertures (A.4), désignables. */
  architecture: THREE.Group;
  surimpression: THREE.Group;
  /** Scènes de rendu incrémentales (C.2) des trois groupes. */
  rendus: { contenu: SceneRendu; libres: SceneRendu; architecture: SceneRendu };
  rendre: () => void;
  /** Caméra déplacée (navigation, rappel) : la scène active est réévaluée. */
  surCamera: () => void;
}

const nombre = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 3 });

/** Maillage affiché tant que le premier calcul n'est pas rendu (rien n'est cadré dessus). */
const MAILLAGE_VIDE: StudioMesh3d = Object.freeze({
  frame: "local-3d", units: "m", source: { frame: "local-2d", conversion: "(x, y) → (x, y, z)" }, solids: [], outlines: [], nonExtruded: 0, hidden: 0, bounds: null,
}) as StudioMesh3d;

/** Aspect d'un volume : la sélection l'emporte, puis l'apparence d'affichage (objet, sinon calque), puis le défaut. */
function aspectDe(doc: StudioDocument, mode: StudioModeAffichage, o: { id: string; layerId?: string }, defaut: number, choisi: boolean, double = false): AspectVolume {
  const a = studioApparenceResolue(doc, o.id, o.layerId);
  if (choisi) return { couleur: 0xf0b44c, mode, apparence: false, double };
  return a ? { couleur: couleurEntiere(a.color), ...(a.finish ? { finition: a.finish } : {}), mode, apparence: true, double } : { couleur: defaut, mode, apparence: false, double };
}

/** Volume construit seul : surface (nommée, données de désignation) et arêtes selon le mode. */
function volumeSeul(g: GeometrieObjet, aspect: AspectVolume, nom: string, donnees: Record<string, string>): THREE.Object3D[] {
  const { surface, aretes } = objetsVolume([preparer(g)], aspect);
  surface.name = nom;
  const objets: THREE.Object3D[] = aretes ? [surface, aretes] : [surface];
  for (const o of objets) Object.assign(o.userData, donnees);
  return objets;
}

/** Ce que la scène de rendu lit : maillage affiché, clés de contenu de ses morceaux, document et réglages courants. */
interface Lecture {
  mesh: StudioMesh3d;
  /** Clé de projection de chaque morceau affiché (signature de son objet three.js). */
  cle: (id: string) => string;
  doc: StudioDocument;
  mode: StudioModeAffichage;
  selection: string | null;
  selectionArchitecture: string | null;
  /** Objet encore présent dans le document courant (un objet supprimé disparaît sans attendre le maillage suivant). */
  present: (id: string) => boolean;
}

/** Volumes des objets 2D extrudés (en lots) et contours plats (seuls). */
function entreesContenu(l: Lecture): EntreeRendu[] {
  const out: EntreeRendu[] = [];
  for (const s of l.mesh.solids) {
    if (!l.present(s.id)) continue;
    out.push({ id: s.id, signature: l.cle(s.id), lot: "contenu", geometrie: s, aspect: aspectDe(l.doc, l.mode, s, s.type === "line" ? 0xd9d2c3 : 0xb9d3cf, false, s.kind === "wall-surface") });
  }
  for (const o of l.mesh.outlines) {
    if (!l.present(o.id)) continue;
    out.push({
      id: o.id, signature: l.cle(o.id), construire: () => {
        const g = new THREE.BufferGeometry().setFromPoints(o.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
        const mat = new THREE.LineDashedMaterial({ color: 0x8a6a3a, dashSize: 0.15, gapSize: 0.1 });
        const ligne = o.closed ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
        ligne.computeLineDistances();
        return [ligne];
      },
    });
  }
  return out;
}

/** Solides libres, construits seuls et désignables. */
function entreesLibres(l: Lecture): EntreeRendu[] {
  return (l.mesh.freeSolids ?? []).filter((s) => l.present(s.id)).map((s) => {
    const aspect = aspectDe(l.doc, l.mode, s, 0xc9bde3, s.id === l.selection);
    return { id: s.id, signature: `${l.cle(s.id)}|${cleAspect(aspect)}`, construire: () => volumeSeul(s, aspect, s.id, { solide: s.id }) };
  });
}

/**
 * Murs opaques (en lots, sauf le mur sélectionné, construit seul à sa couleur de sélection) et ouvertures (boîte du
 * vide, translucide, seule) ; chaque objet seul porte l'identifiant de son objet, chaque lot sa table de désignation.
 */
function entreesArchitecture(l: Lecture): EntreeRendu[] {
  const out: EntreeRendu[] = [];
  for (const a of l.mesh.architecture ?? []) {
    if (!l.present(a.id)) continue;
    const choisi = a.id === l.selectionArchitecture;
    if (a.type === "wall") {
      const aspect = aspectDe(l.doc, l.mode, a, 0xd8d2c4, choisi);
      out.push(choisi
        ? { id: a.id, signature: `${l.cle(a.id)}|${cleAspect(aspect)}`, construire: () => volumeSeul(a, aspect, a.id, { architecture: a.id }) }
        : { id: a.id, signature: l.cle(a.id), lot: "mur", geometrie: a, aspect });
      continue;
    }
    // Le vide d'une ouverture ne prend que l'apparence de l'ouverture elle-même (pas celle du calque de son mur).
    const propre = studioApparenceResolue(l.doc, a.id, undefined);
    const teinte = choisi ? 0xf0b44c : propre?.source === "object" ? couleurEntiere(propre.color) : 0x7fb2d6;
    out.push({
      id: a.id, signature: `${l.cle(a.id)}|${teinte.toString(16)}|${choisi ? 1 : 0}`, construire: () => {
        const g = new THREE.BufferGeometry();
        const p = preparer(a);
        g.setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
        g.setIndex(new THREE.BufferAttribute(p.index, 1));
        const vide = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: teinte, transparent: true, opacity: choisi ? 0.45 : 0.2, depthWrite: false }));
        vide.name = a.id;
        vide.userData.architecture = a.id;
        return [vide];
      },
    });
  }
  return out;
}

/** Caméra relevée de la vue (repère de rendu = `local-3d`, conversion `cameraScene`). */
function cameraCourante(m: Moteur): StudioCameraScene {
  const t = m.controls?.target ?? new THREE.Vector3();
  if (m.camera === m.plan) return cameraScene("orthographic", m.plan.position, t, (m.plan.top - m.plan.bottom) / m.plan.zoom);
  return cameraScene("perspective", m.perspective.position, t, m.perspective.fov);
}

/** Pose une caméra enregistrée sur la caméra active (la navigation correspondante est déjà posée). */
function poserCamera(m: Moteur, c: StudioCameraScene) {
  const distance = Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);
  if (c.projection === "orthographic") {
    const el = m.renderer.domElement, aspect = Math.max(el.width, 1) / Math.max(el.height, 1), demi = c.height / 2;
    Object.assign(m.plan, { left: -demi * aspect, right: demi * aspect, top: demi, bottom: -demi, zoom: 1, near: 0.01, far: Math.max(distance * 10, 1000) });
    const haut = hautCamera(c.position, c.target);
    m.plan.position.set(c.position.x, c.position.y, c.position.z);
    m.plan.up.set(haut.x, haut.y, haut.z);
    m.plan.lookAt(c.target.x, c.target.y, c.target.z);
    m.plan.updateProjectionMatrix();
  } else {
    m.perspective.fov = c.fov;
    m.perspective.position.set(c.position.x, c.position.y, c.position.z);
    m.perspective.near = Math.max(distance / 1000, 0.001); m.perspective.far = Math.max(distance * 100, 1000);
    m.perspective.updateProjectionMatrix();
  }
  m.controls?.target.set(c.target.x, c.target.y, c.target.z);
  m.controls?.update();
  m.rendre();
}

/** Surimpression dérivée de la coupe : segments à la cote du plan, toujours visibles, jamais sélectionnables. */
function construireCoupe(m: Moteur, coupe: StudioCoupe | null) {
  vider(m.surimpression);
  if (!coupe || !coupe.segments.length) return;
  const z = coupe.source.plan.z;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(coupe.segments.flatMap((s) => [s.start.x, s.start.y, z, s.end.x, s.end.y, z])), 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc0392b, depthTest: false }));
  l.renderOrder = 10;
  m.surimpression.add(l);
}

function emprise(mesh: StudioMesh3d) {
  const b = mesh.bounds ?? { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 0 } };
  const centre = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  return { b, centre, taille: Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1) };
}

function cadrer(m: Moteur, mesh: StudioMesh3d) {
  const { b, centre, taille } = emprise(mesh);
  if (m.camera === m.plan) {
    const el = m.renderer.domElement, aspect = Math.max(el.width, 1) / Math.max(el.height, 1);
    const demi = Math.max(b.max.y - b.min.y, (b.max.x - b.min.x) / aspect, 2) * 0.6;
    Object.assign(m.plan, { left: -demi * aspect, right: demi * aspect, top: demi, bottom: -demi, zoom: 1, near: 0.01, far: taille * 100 + 1000 });
    m.plan.position.set(centre.x, centre.y, b.max.z + taille * 10 + 10);
    m.plan.up.set(0, 1, 0);
    m.plan.lookAt(centre.x, centre.y, 0);
    m.plan.updateProjectionMatrix();
    m.controls?.target.set(centre.x, centre.y, 0);
  } else {
    m.controls?.target.copy(centre);
    m.perspective.position.set(centre.x + taille * 1.2, centre.y - taille * 1.6, centre.z + taille * 1.1);
    m.perspective.near = taille / 1000; m.perspective.far = taille * 100;
    m.perspective.updateProjectionMatrix();
  }
  m.controls?.update();
  m.rendre();
}

/** Contrôles de la caméra active : orbite complète, ou plan (rotation coupée, glisser = panoramique). */
function poserControles(m: Moteur, navigation: Navigation3d) {
  m.controls?.dispose();
  m.camera = navigation === "plan" ? m.plan : m.perspective;
  const c = new OrbitControls(m.camera, m.renderer.domElement);
  if (navigation === "plan") {
    c.enableRotate = false;
    c.screenSpacePanning = true;
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  }
  c.addEventListener("change", m.rendre);
  c.addEventListener("change", m.surCamera);
  m.controls = c;
}

/** Plan de maillage d'un document : cache de départ, invalidation, objets à mailler (null : tous). */
interface PlanMaillage { doc: StudioDocument; base: StudioCacheMaillage | null; invalidation: StudioInvalidation; ids: string[] | null }
/** Maillage assemblé : cache par objet, maillage complet, révision d'entrée et bilan du remaillage. */
interface Assemble { cache: StudioCacheMaillage; mesh: StudioMesh3d; revision: string; remailles: number; invalidation: StudioInvalidation }
/** Plans gardés en attente de leur résultat (une rafale de commandes en périme la plupart). */
const PLANS_GARDES = 16;
let sansCle = 0;

/** Impact d'un rayon three.js : identifiant porté par l'objet seul, ou triangle d'un lot et sa table. */
function impact(h: THREE.Intersection): Impact {
  const lot = h.object.userData.lot as DonneesLot | undefined;
  if (lot) return { distance: h.distance, table: lot.table, triangle: h.faceIndex ?? null };
  const id = (h.object.userData.solide ?? h.object.userData.architecture) as string | undefined;
  return id === undefined ? { distance: h.distance } : { distance: h.distance, id };
}

/** Centre à l'écran (coordonnées client) de l'objet `id` du maillage affiché ; null s'il n'est pas affiché. */
function centreEcran(m: Moteur, mesh: StudioMesh3d, id: string): { x: number; y: number } | null {
  const e = [...mesh.solids, ...(mesh.freeSolids ?? []), ...(mesh.architecture ?? [])].find((x) => x.id === id);
  if (!e || !e.vertices.length) return null;
  const b = new THREE.Box3().setFromPoints(e.vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z)));
  const c = b.getCenter(new THREE.Vector3()).project(m.camera);
  const r = m.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
}

function Champ({ nom, libelle, valeur, surValeur, requis = true }: { nom: string; libelle: string; valeur: number; surValeur: (v: number) => void; requis?: boolean }) {
  return <label>{libelle}
    <input type="number" step="any" required={requis} name={nom} value={Number.isFinite(valeur) ? valeur : ""} onChange={(e) => surValeur(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)} />
  </label>;
}

export function Vue3DStudio({ doc, outil, modifiable = false, navigation = "orbite", coupe = false, selection = null, layerId, surSelection, surCommandes, selectionArchitecture = null, surSelectionArchitecture, demande = null, surDemandeTraitee, surNavigation, provenance }: Vue3DStudioProps) {
  const hote = useRef<HTMLDivElement>(null);
  const moteur = useRef<Moteur | null>(null);
  const cadre = useRef(false);
  const [indisponible, setIndisponible] = useState(false);
  const [boite, setBoite] = useState<ValeursBoite>(BOITE_VIDE);
  const [prisme, setPrisme] = useState<ValeursPrisme>(PRISME_VIDE);
  const [deplacement, setDeplacement] = useState<ValeursDeplacement>(DEPLACEMENT_VIDE);
  const [coteCoupe, setCoteCoupe] = useState(Number.NaN);
  const [erreur, setErreur] = useState("");
  // Visualisation (lot E.5) : scène choisie, calques montrés par la vue (null : visibilité du dessin), mode, apparence.
  const [sceneChoisie, setSceneChoisie] = useState<string | null>(null);
  const [calquesMontres, setCalquesMontres] = useState<string[] | null>(null);
  const [mode, setMode] = useState<StudioModeAffichage>(MODE_INITIAL);
  const [nomScene, setNomScene] = useState("");
  const [cibleApparence, setCibleApparence] = useState("");
  const [couleur, setCouleur] = useState("#888888");
  const [finition, setFinition] = useState<StudioFinitionAffichage | "">("");
  const [statut, setStatut] = useState("");
  const [cameraVersion, setCameraVersion] = useState(0);
  const enAttente = useRef<StudioScene | null>(null);
  // La scène active ne se réévalue au fil de la navigation que lorsqu'une scène est choisie et montrée.
  const suiviCamera = useRef(false);
  // Maillage en tâche de fond (D.2) : avec une scène montrée, le Worker maille le document « tous calques affichés »
  // (copie de vue, mémorisée pour garder la même empreinte), puis la scène ne garde que ses calques (`studioFiltrerMaillageScene`).
  const montreScene = calquesMontres !== null;
  const docMaillage = useMemo(() => (montreScene ? studioDocumentToutVisible(doc) : doc), [doc, montreScene]);
  const empreinte = empreinteDe(docMaillage);
  // Invalidation minimale (C.2) : plan de maillage du document courant, relatif au dernier cache assemblé ; le Worker ne
  // maille que les objets invalidés (tous pour une reconstruction complète). Plans gardés par révision, le temps que leur
  // résultat arrive.
  const base = useRef<Assemble | null>(null);
  const plans = useRef(new Map<string, PlanMaillage>());
  const plan = useMemo<PlanMaillage>(() => {
    const b = base.current;
    const invalidation = projectionsAInvalider(b?.cache.doc ?? null, docMaillage);
    return { doc: docMaillage, base: b?.cache ?? null, invalidation, ids: invalidation.complet ? null : invalidation.ids };
  }, [docMaillage]);
  if (!plans.current.has(empreinte.revision)) {
    plans.current.set(empreinte.revision, plan);
    for (const k of plans.current.keys()) if (plans.current.size > PLANS_GARDES) plans.current.delete(k);
  }
  const maillage = useTache<{ document: StudioDocument; ids: string[] | null }, StudioMorceauMaillage[]>(
    { cle: "studio.maillage-3d", classe: "fond", nature: "maillage.3d.objets", charge: { document: docMaillage, ids: plan.ids }, empreinte },
    { initial: () => studioMaillerObjets(docMaillage, plan.ids) },
  );
  const dernier = useRef<Assemble | null>(null);
  const assemble = useMemo<Assemble | null>(() => {
    const p = maillage.revision === null ? undefined : plans.current.get(maillage.revision);
    if (!maillage.valeur || !p || maillage.revision === null) return dernier.current;
    const cache = studioFusionnerMorceaux(p.base, p.doc, p.invalidation, maillage.valeur);
    return { cache, mesh: studioAssemblerMaillage(p.doc, cache.morceaux), revision: maillage.revision, remailles: maillage.valeur.length, invalidation: p.invalidation };
  }, [maillage.valeur, maillage.revision]);
  dernier.current = assemble;
  useEffect(() => { if (assemble) base.current = assemble; }, [assemble]);
  const brut = assemble?.mesh ?? MAILLAGE_VIDE;
  const version = useMemo(() => (assemble ? studioVersionProjection(assemble.cache.doc, "maillage-3d", assemble.revision) : null), [assemble]);
  const mesh = useMemo(() => (calquesMontres && brut !== MAILLAGE_VIDE ? studioFiltrerMaillageScene(brut, calquesMontres) : brut), [brut, calquesMontres]);
  /** Le maillage affiché est celui du document courant (pas un maillage antérieur encore affiché pendant le calcul). */
  const maillageAJour = maillage.valeur !== undefined && maillage.revision === empreinte.revision;
  const scenes = studioScenes(doc);
  const calquesVue = calquesMontres ?? calquesVisualisation(doc).filter((c) => c.visible).map((c) => c.id);
  suiviCamera.current = sceneChoisie !== null && calquesMontres !== null;
  const solides = doc.solides ?? [];
  const choisi = solides.find((s) => s.id === selection) ?? null;
  const resultatCoupe = useMemo(() => (coupe && Number.isFinite(coteCoupe) ? couperStudio(doc, { z: coteCoupe }) : null), [doc, coupe, coteCoupe]);
  const profils = profilsFermes(doc);
  // Le clic sur la planche lit l'état courant (outil, droits) sans réinstaller les écouteurs.
  const clic = useRef<(e: PointerEvent) => void>(() => {});
  clic.current = (e: PointerEvent) => {
    const m = moteur.current; if (!m) return;
    const r = m.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rayon = new THREE.Raycaster();
    rayon.setFromCamera(ndc, m.camera);
    if (outil === "studio.solide.boite" && modifiable) {
      const p = rayon.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
      if (p) { setBoite((v) => ({ ...v, x: auCentimetre(p.x), y: auCentimetre(p.y), z: 0 })); setErreur(""); }
      return;
    }
    // Désignation (C.2-02, C.2-03) : objet seul par son identifiant, lot par sa table (triangle → identifiant) ; un
    // identifiant absent du document courant (objet supprimé, maillage affiché encore antérieur) laisse passer l'objet
    // derrière, jamais un identifiant périmé. Seuls les objets d'un calque affiché et déverrouillé se désignent
    // (`designation.ts`, comme sur la planche 2D) : solides libres, murs, ouvertures (calque de leur mur).
    const touche = designer(rayon.intersectObjects(m.libres.children, false).filter((h) => h.object instanceof THREE.Mesh).map(impact), solidesDesignables(doc));
    // Mur ou ouverture (A.4) : l'ouverture, boîte du vide, l'emporte sur le mur qu'elle traverse.
    const designable = architectureDesignable(doc, new Set((mesh.architecture ?? []).map((a) => a.id)));
    const ouverture = estOuverture(doc);
    const impacts = rayon.intersectObjects(m.architecture.children, false).filter((h) => h.object instanceof THREE.Mesh).map(impact);
    const archi = designer(impacts, (id) => designable(id) && ouverture(id)) ?? designer(impacts, designable);
    if (archi && (!touche || archi.distance <= touche.distance)) { surSelectionArchitecture?.(archi.id); return; }
    surSelection?.(touche?.id ?? null);
  };

  useEffect(() => {
    const el = hote.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { setIndisponible(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("data-studio-vue3d-canvas", "");
    renderer.domElement.setAttribute("aria-label", "Vue 3D du dessin");
    renderer.domElement.setAttribute("role", "img");
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f9f9);
    const perspective = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    perspective.up.set(0, 0, 1); // repère local-3d : z vers le haut
    const plan = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 1000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb0bcc0, 1.6));
    const soleil = new THREE.DirectionalLight(0xffffff, 1.4);
    soleil.position.set(4, -6, 10);
    scene.add(soleil);
    const grille = new THREE.GridHelper(40, 40, 0xbfcfd3, 0xdde6e8);
    grille.rotation.x = Math.PI / 2; // plan XY du repère local-3d
    scene.add(grille);
    const contenu = new THREE.Group(), libres = new THREE.Group(), architecture = new THREE.Group(), surimpression = new THREE.Group();
    scene.add(contenu, libres, architecture, surimpression);
    const m: Moteur = {
      renderer, scene, perspective, plan, camera: perspective, controls: null, contenu, libres, architecture, surimpression,
      rendus: { contenu: new SceneRendu(contenu), libres: new SceneRendu(libres), architecture: new SceneRendu(architecture) },
      rendre: () => {
        mesurerRendu3d(() => renderer.render(scene, m.camera));
        // Compteurs GPU (recette D.3-02) : ils reviennent à leur ligne de base après chaque reconstruction.
        const c = compteGpu(renderer);
        renderer.domElement.dataset.studioGpuGeometries = String(c.geometries);
        renderer.domElement.dataset.studioGpuTextures = String(c.textures);
      },
      surCamera: () => { if (suiviCamera.current) setCameraVersion((v) => v + 1); },
    };
    moteur.current = m;
    poserControles(m, navigation);
    const taille = () => {
      const w = Math.max(el.clientWidth, 1), h = Math.max(Math.round(w * 0.62), 240);
      renderer.setSize(w, h);
      perspective.aspect = w / h; perspective.updateProjectionMatrix();
      const demi = (plan.top - plan.bottom) / 2;
      plan.left = -demi * (w / h); plan.right = demi * (w / h); plan.updateProjectionMatrix();
      m.rendre();
    };
    // Un clic (sans glisser) pose ou sélectionne ; un glisser reste un geste de navigation.
    let bas: { x: number; y: number } | null = null;
    const pointeurBas = (e: PointerEvent) => { bas = { x: e.clientX, y: e.clientY }; };
    const pointeurHaut = (e: PointerEvent) => {
      if (bas && e.button === 0 && Math.hypot(e.clientX - bas.x, e.clientY - bas.y) < 5) clic.current(e);
      bas = null;
    };
    renderer.domElement.addEventListener("pointerdown", pointeurBas);
    renderer.domElement.addEventListener("pointerup", pointeurHaut);
    const obs = typeof ResizeObserver === "function" ? new ResizeObserver(taille) : null;
    obs?.observe(el);
    taille();
    return () => {
      obs?.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointeurBas);
      renderer.domElement.removeEventListener("pointerup", pointeurHaut);
      m.controls?.removeEventListener("change", m.rendre);
      m.controls?.removeEventListener("change", m.surCamera);
      m.controls?.dispose();
      m.rendus.contenu.vider(); m.rendus.libres.vider(); m.rendus.architecture.vider();
      vider(contenu); vider(libres); vider(architecture); vider(surimpression);
      libererObjet(grille);
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
      moteur.current = null;
      cadre.current = false;
    };
    // La navigation initiale est posée ici ; ses changements par l'effet suivant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = moteur.current; if (!m) return;
    if ((navigation === "plan") === (m.camera === m.plan) && m.controls) return;
    m.controls?.removeEventListener("change", m.surCamera);
    poserControles(m, navigation);
    // Scène rappelée qui a demandé ce changement de navigation : sa caméra, sinon le cadrage.
    if (enAttente.current) { poserCamera(m, enAttente.current.camera); enAttente.current = null; cadre.current = true; }
    else cadrer(m, mesh);
    setCameraVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  useEffect(() => {
    const m = moteur.current; if (!m) return;
    const morceaux = assemble?.cache.morceaux;
    const presents = new Set([...doc.objects.map((o) => o.id), ...(doc.solides ?? []).map((o) => o.id), ...(doc.architecture ?? []).map((o) => o.id)]);
    const l: Lecture = {
      mesh, doc, mode, selection, selectionArchitecture, present: (id) => presents.has(id),
      // Clé de contenu du morceau ; à défaut (jamais pour un maillage assemblé), une clé unique force la reconstruction.
      cle: (id) => morceaux?.get(id)?.cle ?? `?${++sansCle}`,
    };
    const v = version ? `${version.revision}:${version.contenu}` : "";
    const bilans = [m.rendus.contenu.mettreAJour(entreesContenu(l), v), m.rendus.libres.mettreAJour(entreesLibres(l), v), m.rendus.architecture.mettreAJour(entreesArchitecture(l), v)];
    const el = m.renderer.domElement;
    el.dataset.studioRenduReconstruits = String(bilans.reduce((n, b) => n + b.construits + b.lotsConstruits, 0));
    el.dataset.studioRenduConserves = String(bilans.reduce((n, b) => n + b.conserves, 0));
    el.dataset.studioRenduLots = String(m.rendus.contenu.taille.lots + m.rendus.architecture.taille.lots);
    if (!cadre.current && mesh !== MAILLAGE_VIDE) { cadrer(m, mesh); cadre.current = true; }
    else m.rendre();
  }, [mesh, assemble, version, selection, selectionArchitecture, indisponible, doc, mode]);

  // Recette (C.2-03) : position à l'écran du centre d'un objet affiché, pour cliquer là où il est (ou était).
  useEffect(() => {
    const crochet = { ecran: (id: string) => { const m = moteur.current; return m ? centreEcran(m, mesh, id) : null; } };
    (globalThis as { __fadiVue3d?: unknown }).__fadiVue3d = crochet;
    return () => { if ((globalThis as { __fadiVue3d?: unknown }).__fadiVue3d === crochet) delete (globalThis as { __fadiVue3d?: unknown }).__fadiVue3d; };
  }, [mesh]);

  useEffect(() => {
    const m = moteur.current; if (!m) return;
    construireCoupe(m, resultatCoupe);
    m.rendre();
  }, [resultatCoupe]);

  // ——— Visualisation (lot E.5) ———
  /** Scène dont la vue courante est exactement le réglage (caméra, calques montrés, mode) ; null sinon. */
  const sceneActive = (() => {
    void cameraVersion;
    const m = moteur.current;
    if (!m || calquesMontres === null) return null;
    const cam = JSON.stringify(cameraCourante(m));
    return scenes.find((s) => s.id === sceneChoisie && s.displayMode === mode && JSON.stringify(s.camera) === cam
      && JSON.stringify([...s.visibleLayers].sort()) === JSON.stringify([...calquesMontres].sort()))?.id ?? null;
  })();
  function choisirScene(id: string) {
    const s = scenes.find((x) => x.id === id);
    setSceneChoisie(id);
    if (s) setNomScene(s.name);
  }
  function rappeler(s: StudioScene) {
    setSceneChoisie(s.id); setNomScene(s.name); setCalquesMontres([...s.visibleLayers]); setMode(s.displayMode); setErreur("");
    const voulue: Navigation3d = s.camera.projection === "orthographic" ? "plan" : "orbite";
    const m = moteur.current;
    if (voulue !== navigation) {
      if (!surNavigation) { setErreur("Cette scène demande une autre navigation : basculez la vue en plan (Maj+G), puis rappelez-la."); return; }
      enAttente.current = s;
      surNavigation(voulue);
    } else if (m) { poserCamera(m, s.camera); cadre.current = true; setCameraVersion((v) => v + 1); }
    setStatut("Scène rappelée : la vue suit son réglage, le modèle n’est pas modifié.");
  }
  function reglages() { return { nom: nomScene.trim() || prochainNomScene(doc), calques: calquesVue, mode }; }
  function visualisation(action: string) {
    const m = moteur.current;
    const mutation = action !== "studio.scene.rappeler" && action !== "exporter-png";
    if (mutation && !modifiable) { setErreur("Lecture seule : les scènes et les apparences ne se modifient pas ici."); return; }
    switch (action) {
      case "studio.scene.creer": {
        if (!m) { setErreur("Vue 3D indisponible : la caméra ne peut pas être relevée."); return; }
        const id = crypto.randomUUID();
        const r = reglages();
        envoyer(commandeNouvelleScene(id, r, cameraCourante(m)), () => { setSceneChoisie(id); setNomScene(r.nom); setCalquesMontres([...r.calques]); setStatut("Scène ajoutée au brouillon. Enregistrez pour la conserver."); });
        return;
      }
      case "studio.scene.modifier":
        if (!m) { setErreur("Vue 3D indisponible : la caméra ne peut pas être relevée."); return; }
        envoyer(commandeMiseAJourScene(doc, sceneChoisie, reglages(), cameraCourante(m)), () => { setCalquesMontres([...calquesVue]); setStatut("Scène mise à jour dans le brouillon."); });
        return;
      case "studio.scene.rappeler": {
        const s = scenes.find((x) => x.id === sceneChoisie) ?? (scenes.length === 1 ? scenes[0] : undefined);
        if (!s) { setErreur("Choisissez d’abord la scène à rappeler."); return; }
        rappeler(s);
        return;
      }
      case "studio.scene.supprimer":
        envoyer(commandeSuppressionScene(doc, sceneChoisie), () => { setSceneChoisie(null); setStatut("Scène supprimée du brouillon."); });
        return;
      case "studio.apparence.definir":
        envoyer(commandeApparence(doc, cibleApparence, couleur, finition, () => crypto.randomUUID()), () => setStatut("Apparence d’affichage appliquée : la géométrie n’a pas changé."));
        return;
      case "studio.apparence.retirer":
        envoyer(commandeRetraitApparence(doc, cibleApparence), () => setStatut("Apparence d’affichage retirée."));
        return;
      case "exporter-png": void exporterPng(); return;
    }
  }
  const raisonRendu = indisponible ? "Vue 3D indisponible : aucun rendu ne peut être tiré du canevas."
    : !provenance ? "Provenance inconnue : le rendu n’est pas exporté."
    : provenance.nonEnregistre ? "Enregistrez d’abord : le rendu porte sur une révision enregistrée, pas sur les modifications non enregistrées."
    : !maillageAJour ? "Maillage en cours de calcul : le rendu attend la géométrie du document affiché." : null;
  async function exporterPng() {
    const m = moteur.current;
    if (!m || !provenance || raisonRendu) { setErreur(raisonRendu ?? "Vue 3D indisponible."); return; }
    try {
      const actif = scenes.find((s) => s.id === sceneActive) ?? null;
      const p = studioProvenanceRendu({
        etude: provenance.etude, variante: provenance.variante, revisionId: provenance.revisionId,
        scene: actif ? { id: actif.id, nom: actif.name } : null, date: new Date(), camera: cameraCourante(m),
      });
      m.rendre();
      const blob = await new Promise<Blob | null>((ok) => m.renderer.domElement.toBlob(ok, "image/png"));
      if (!blob) throw new Error("canevas vide");
      const octets = insererTextePng(new Uint8Array(await blob.arrayBuffer()), CLE_PROVENANCE_PNG, JSON.stringify(p));
      const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "image/png" }));
      const lien = document.createElement("a");
      lien.href = url; lien.download = studioNomFichierRendu(p); lien.hidden = true;
      document.body.append(lien); lien.click(); lien.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setErreur("");
      setStatut(actif ? "Rendu du modèle exporté (PNG), provenance incluse : scène rappelée." : "Rendu du modèle exporté (PNG), provenance incluse : vue courante, sans scène.");
    } catch { setErreur("Export du rendu impossible : le canevas n’a pas pu être lu."); }
  }
  // Demande de la barre (outil ou commande), traitée une fois puis rendue.
  useEffect(() => {
    if (!demande) return;
    visualisation(demande.action);
    surDemandeTraitee?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande?.n]);

  function envoyer(r: ReturnType<typeof commandeBoite>, apres: () => void) {
    if ("erreur" in r) { setErreur(r.erreur); return; }
    setErreur("");
    if (surCommandes?.(r.commandes)) apres();
  }
  function poserBoite(e: FormEvent) {
    e.preventDefault();
    const id = crypto.randomUUID();
    envoyer(commandeBoite(boite, id, layerId), () => { surSelection?.(id); setBoite((v) => ({ ...BOITE_VIDE, rotation: v.rotation })); });
  }
  function poserPrisme(e: FormEvent) {
    e.preventDefault();
    const id = crypto.randomUUID();
    envoyer(commandePrisme(doc, prisme, id, layerId), () => surSelection?.(id));
  }
  function deplacer(e: FormEvent) {
    e.preventDefault();
    envoyer(commandeDeplacementSolide(choisi?.id ?? null, deplacement), () => setDeplacement(DEPLACEMENT_VIDE));
  }
  function supprimer() {
    if (!choisi) return;
    envoyer({ commandes: [{ toolId: "studio.solide.supprimer", params: { ids: [choisi.id] } }] }, () => surSelection?.(null));
  }

  const libres = mesh.freeSolids?.length ?? 0;
  const architecture = mesh.architecture ?? [];
  return (
    <section className="studio-vue3d" aria-label="Vue 3D" data-studio-vue3d data-studio-maillage={maillage.etat} data-studio-maillage-revision={maillage.revision ?? ""} data-studio-revision-courante={empreinte.revision}
      data-studio-projection-version={version ? `${version.revision}:${version.contenu}` : ""} data-studio-remailles={assemble?.remailles ?? ""} data-studio-invalidation={assemble ? (assemble.invalidation.complet ? `complet:${assemble.invalidation.raison}` : "partiel") : ""} data-studio-volumes={mesh.solids.length} data-studio-non-extrudes={mesh.nonExtruded} data-studio-solides-libres={libres} data-studio-architecture-3d={architecture.length} data-studio-navigation={navigation}
      data-studio-affichage={mode} data-studio-scene-active={sceneActive ?? ""} data-studio-calques-montres={calquesMontres?.join(" ") ?? ""}>
      <div className="studio-vue3d-bandeau">
        <span role="status" data-studio-vue3d-decompte><span>{`${mesh.solids.length} volume(s)`}</span>{" · "}<span>{`${mesh.nonExtruded} objet(s) non extrudé(s), dessinés à plat`}</span>{libres > 0 && <>{" · "}<span>{`${libres} solide(s) libre(s)`}</span></>}</span>
        <button type="button" onClick={() => { const m = moteur.current; if (m) cadrer(m, mesh); }} disabled={indisponible}>Recadrer la vue 3D</button>
      </div>
      {maillage.message && <p className="studio-alert" role="alert" data-studio-maillage-erreur>{maillage.message}</p>}
      {maillage.valeur === undefined && !maillage.message && <p className="studio-hint" role="status">{MESSAGES_TACHE.enCours}</p>}
      {indisponible && <p className="studio-alert" role="alert" data-studio-vue3d-indisponible>Vue 3D indisponible : WebGL n’est pas pris en charge par ce navigateur.</p>}
      <div ref={hote} className="studio-vue3d-hote" data-studio-vue3d-outil={outil} />
      <p className="studio-hint">{navigation === "plan"
        ? "Repère local 3D : z vers le haut, en mètres. Vue en plan : glisser : déplacer ; molette : zoom."
        : "Repère local 3D : z vers le haut, en mètres. Glisser : orbite ; clic droit ou Maj + glisser : déplacer ; molette : zoom."}</p>
      {erreur && <p className="studio-alert" role="alert" data-studio-volume-erreur>{erreur}</p>}
      {statut && <p className="studio-info" role="status" data-studio-visualisation-statut>{statut}</p>}

      {outil === "studio.solide.boite" && <form className="studio-vue3d-formulaire" onSubmit={poserBoite} data-studio-boite aria-labelledby="studio-boite-titre">
        <h3 id="studio-boite-titre"><Icon name="studio-solid-box" size={18} /> Boîte</h3>
        <p className="studio-hint">Cliquez sur la grille pour placer l’origine (coin inférieur), puis saisissez les dimensions. Aucune dimension n’est proposée.</p>
        <fieldset disabled={!modifiable}>
          <legend>Placement et dimensions, en mètres</legend>
          <Champ nom="boite-x" libelle="Origine x (m)" valeur={boite.x} surValeur={(x) => setBoite({ ...boite, x })} />
          <Champ nom="boite-y" libelle="Origine y (m)" valeur={boite.y} surValeur={(y) => setBoite({ ...boite, y })} />
          <Champ nom="boite-z" libelle="Origine z (m)" valeur={boite.z} surValeur={(z) => setBoite({ ...boite, z })} />
          <Champ nom="boite-rotation" libelle="Rotation autour de z (°)" valeur={boite.rotation} surValeur={(rotation) => setBoite({ ...boite, rotation })} />
          <Champ nom="boite-largeur" libelle="Largeur selon x (m)" valeur={boite.largeur} surValeur={(largeur) => setBoite({ ...boite, largeur })} />
          <Champ nom="boite-profondeur" libelle="Profondeur selon y (m)" valeur={boite.profondeur} surValeur={(profondeur) => setBoite({ ...boite, profondeur })} />
          <Champ nom="boite-hauteur" libelle="Hauteur selon z (m)" valeur={boite.hauteur} surValeur={(hauteur) => setBoite({ ...boite, hauteur })} />
          <button type="submit" data-studio-poser-boite>Poser la boîte</button>
        </fieldset>
      </form>}

      {outil === "studio.solide.prisme" && <form className="studio-vue3d-formulaire" onSubmit={poserPrisme} data-studio-prisme aria-labelledby="studio-prisme-titre">
        <h3 id="studio-prisme-titre"><Icon name="studio-solid-prism" size={18} /> Prisme sur profil</h3>
        <p className="studio-hint">Le contour d’une polyligne fermée est copié comme profil ; le solide ne reste pas lié à la polyligne.</p>
        <fieldset disabled={!modifiable}>
          <legend>Profil, cote et hauteur, en mètres</legend>
          <label>Profil (polyligne fermée)
            <select name="prisme-profil" value={prisme.profil} onChange={(e) => setPrisme({ ...prisme, profil: e.target.value })} data-studio-prisme-profil>
              <option value="">Choisir un profil…</option>
              {profils.map((p, i) => <option key={p.id} value={p.id}>{`Polyligne fermée ${i + 1} (${p.points.length} sommets)`}</option>)}
            </select>
          </label>
          {profils.length === 0 && <p className="studio-hint">Aucune polyligne fermée dans le dessin.</p>}
          <Champ nom="prisme-cote" libelle="Cote de base z (m)" valeur={prisme.cote} surValeur={(cote) => setPrisme({ ...prisme, cote })} />
          <Champ nom="prisme-hauteur" libelle="Hauteur (m)" valeur={prisme.hauteur} surValeur={(hauteur) => setPrisme({ ...prisme, hauteur })} />
          <Champ nom="prisme-rotation" libelle="Rotation autour de z (°)" valeur={prisme.rotation} surValeur={(rotation) => setPrisme({ ...prisme, rotation })} />
          <button type="submit" data-studio-poser-prisme>Poser le prisme</button>
        </fieldset>
      </form>}

      {solides.length > 0 && <div className="studio-vue3d-solides" data-studio-solides>
        <h3>Solides libres</h3>
        <ul>
          {solides.map((s) => (
            <li key={s.id}>
              <button type="button" aria-pressed={s.id === selection} onClick={() => surSelection?.(s.id === selection ? null : s.id)} data-studio-solide={s.id} data-studio-solide-type={s.type}>
                {`${descriptionSolide(s, nombre)} · ${nombre(studioVolumeSolide(s))} m³`}
              </button>
            </li>
          ))}
        </ul>
        {choisi && <form onSubmit={deplacer} data-studio-solide-choisi={choisi.id} aria-label="Solide sélectionné">
          <p>{`Sélection : ${descriptionSolide(choisi, nombre)}, origine (${nombre(choisi.placement.origin.x)} ; ${nombre(choisi.placement.origin.y)} ; ${nombre(choisi.placement.origin.z)}) m, volume ${nombre(studioVolumeSolide(choisi))} m³`}</p>
          <fieldset disabled={!modifiable}>
            <legend>Déplacer le solide, en mètres</legend>
            <Champ nom="solide-dx" libelle="dx (m)" valeur={deplacement.dx} surValeur={(dx) => setDeplacement({ ...deplacement, dx })} />
            <Champ nom="solide-dy" libelle="dy (m)" valeur={deplacement.dy} surValeur={(dy) => setDeplacement({ ...deplacement, dy })} />
            <Champ nom="solide-dz" libelle="dz (m)" valeur={deplacement.dz} surValeur={(dz) => setDeplacement({ ...deplacement, dz })} />
            <button type="submit" data-studio-deplacer-solide><Icon name="studio-solid-move" size={18} /> Déplacer le solide</button>
            <button type="button" onClick={supprimer} data-studio-supprimer-solide><Icon name="studio-solid-delete" size={18} /> Supprimer le solide</button>
          </fieldset>
        </form>}
      </div>}

      {architecture.length > 0 && <div className="studio-vue3d-solides" data-studio-architecture-vue3d="">
        <h3><Icon name="studio-wall" size={18} /> Murs et ouvertures</h3>
        <p className="studio-hint">Cliquez un mur ou une ouverture (ou choisissez-le ici) : il se modifie dans le panneau Architecture, comme depuis la planche 2D.</p>
        <ul>
          {architecture.map((a) => (
            <li key={a.id}>
              <button type="button" aria-pressed={a.id === selectionArchitecture} disabled={!estSelectionnable(doc, a.layerId)} onClick={() => surSelectionArchitecture?.(a.id === selectionArchitecture ? null : a.id)} data-studio-architecture-3d-objet={a.id} data-studio-type={a.type}>
                <Icon name={a.type === "wall" ? "studio-wall" : "studio-opening"} size={16} /> {a.type === "wall" ? "Mur" : "Ouverture"} <span translate="no">{a.id.slice(0, 8)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>}

      <PanneauVisualisation doc={doc} modifiable={modifiable} sceneChoisie={sceneChoisie} sceneActive={sceneActive} nom={nomScene} calques={calquesVue} mode={mode}
        cible={cibleApparence} couleur={couleur} finition={finition} rendu={{ possible: !raisonRendu, raison: raisonRendu }}
        surChoix={choisirScene} surNom={setNomScene} surCalques={(ids) => setCalquesMontres(ids)} surMode={setMode} surVueDessin={() => { setCalquesMontres(null); setMode(MODE_INITIAL); setSceneChoisie(null); setStatut(""); }}
        surCible={(c) => { setCibleApparence(c); const a = apparenceDe(doc, c); if (a) { setCouleur(a.color); setFinition(a.finish ?? ""); } }} surCouleur={setCouleur} surFinition={setFinition} surAction={visualisation} />

      {coupe && <div className="studio-vue3d-coupe" data-studio-coupe data-studio-coupe-z={Number.isFinite(coteCoupe) ? coteCoupe : ""} data-studio-coupe-segments={resultatCoupe?.segments.length ?? 0}
        data-studio-coupe-sources={resultatCoupe?.sources.map((s) => s.id).join(" ") ?? ""}>
        <h3><Icon name="studio-section-plane" size={18} /> Coupe horizontale</h3>
        <Champ nom="coupe-z" libelle="Cote de coupe z (m)" valeur={coteCoupe} surValeur={setCoteCoupe} />
        <p role="status">{resultatCoupe
          ? `Coupe dérivée à z = ${nombre(resultatCoupe.source.plan.z)} m : ${resultatCoupe.segments.length} segment(s) issus de ${resultatCoupe.sources.length} solide(s), non modifiable.`
          : "Saisissez la cote du plan de coupe : aucune cote n’est proposée."}</p>
        {resultatCoupe && resultatCoupe.sources.length > 0 && <ul data-studio-coupe-provenance>
          {resultatCoupe.sources.map((s) => <li key={s.id} data-studio-coupe-source={s.id}>{`Contour de ${s.segments} segment(s), provenance : solide ${s.id}`}</li>)}
        </ul>}
      </div>}
    </section>
  );
}
