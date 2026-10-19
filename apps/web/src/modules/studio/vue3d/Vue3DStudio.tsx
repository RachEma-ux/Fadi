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
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { couperStudio, studioMesh3d, studioVolumeSolide, type StudioCommand, type StudioCoupe, type StudioDocument, type StudioMesh3d } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import {
  auCentimetre, BOITE_VIDE, commandeBoite, commandeDeplacementSolide, commandePrisme, DEPLACEMENT_VIDE, descriptionSolide, PRISME_VIDE, profilsFermes,
  type ValeursBoite, type ValeursDeplacement, type ValeursPrisme,
} from "./volume-libre";
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
  rendre: () => void;
}

const nombre = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 3 });

function vider(groupe: THREE.Group) {
  for (const enfant of [...groupe.children]) {
    groupe.remove(enfant);
    const o = enfant as THREE.Mesh;
    o.geometry?.dispose();
    const m = o.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m?.dispose();
  }
}

function solide(groupe: THREE.Group, s: { id: string; vertices: { x: number; y: number; z: number }[]; triangles: [number, number, number][]; edges: [number, number][] }, couleur: number, double: boolean, libre: boolean) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s.vertices.flatMap((v) => [v.x, v.y, v.z])), 3));
  g.setIndex(s.triangles.flat());
  g.computeVertexNormals();
  const surface = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.85, flatShading: true, side: double ? THREE.DoubleSide : THREE.FrontSide }));
  surface.name = s.id;
  if (libre) surface.userData.solide = s.id;
  groupe.add(surface);
  const a = new THREE.BufferGeometry();
  a.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s.edges.flatMap(([i, j]) => [i, j].flatMap((k) => [s.vertices[k]!.x, s.vertices[k]!.y, s.vertices[k]!.z]))), 3));
  groupe.add(new THREE.LineSegments(a, new THREE.LineBasicMaterial({ color: 0x234f5b })));
}

/** Murs opaques et ouvertures (boîte du vide, translucide) ; chaque maillage porte l'identifiant de son objet. */
function construireArchitecture(m: Moteur, mesh: StudioMesh3d, selection: string | null) {
  vider(m.architecture);
  for (const a of mesh.architecture ?? []) {
    const choisi = a.id === selection;
    const avant = m.architecture.children.length;
    if (a.type === "wall") solide(m.architecture, a, choisi ? 0xf0b44c : 0xd8d2c4, false, false);
    else {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(a.vertices.flatMap((v) => [v.x, v.y, v.z])), 3));
      g.setIndex(a.triangles.flat());
      const vide = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: choisi ? 0xf0b44c : 0x7fb2d6, transparent: true, opacity: choisi ? 0.45 : 0.2, depthWrite: false }));
      vide.name = a.id;
      m.architecture.add(vide);
    }
    for (const enfant of m.architecture.children.slice(avant)) enfant.userData.architecture = a.id;
  }
}

function construire(m: Moteur, mesh: StudioMesh3d, selection: string | null) {
  vider(m.contenu);
  vider(m.libres);
  for (const s of mesh.solids) solide(m.contenu, s, s.type === "line" ? 0xd9d2c3 : 0xb9d3cf, s.kind === "wall-surface", false);
  for (const o of mesh.outlines) {
    const g = new THREE.BufferGeometry().setFromPoints(o.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    const mat = new THREE.LineDashedMaterial({ color: 0x8a6a3a, dashSize: 0.15, gapSize: 0.1 });
    const l = o.closed ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
    l.computeLineDistances();
    m.contenu.add(l);
  }
  for (const s of mesh.freeSolids ?? []) solide(m.libres, s, s.id === selection ? 0xf0b44c : 0xc9bde3, false, true);
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
  m.controls = c;
}

function Champ({ nom, libelle, valeur, surValeur, requis = true }: { nom: string; libelle: string; valeur: number; surValeur: (v: number) => void; requis?: boolean }) {
  return <label>{libelle}
    <input type="number" step="any" required={requis} name={nom} value={Number.isFinite(valeur) ? valeur : ""} onChange={(e) => surValeur(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)} />
  </label>;
}

export function Vue3DStudio({ doc, outil, modifiable = false, navigation = "orbite", coupe = false, selection = null, layerId, surSelection, surCommandes, selectionArchitecture = null, surSelectionArchitecture }: Vue3DStudioProps) {
  const hote = useRef<HTMLDivElement>(null);
  const moteur = useRef<Moteur | null>(null);
  const cadre = useRef(false);
  const [indisponible, setIndisponible] = useState(false);
  const [boite, setBoite] = useState<ValeursBoite>(BOITE_VIDE);
  const [prisme, setPrisme] = useState<ValeursPrisme>(PRISME_VIDE);
  const [deplacement, setDeplacement] = useState<ValeursDeplacement>(DEPLACEMENT_VIDE);
  const [coteCoupe, setCoteCoupe] = useState(Number.NaN);
  const [erreur, setErreur] = useState("");
  const mesh = useMemo(() => studioMesh3d(doc), [doc]);
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
    const touche = rayon.intersectObjects(m.libres.children, false).find((h) => typeof h.object.userData.solide === "string");
    // Mur ou ouverture (A.4) : l'ouverture, boîte du vide, l'emporte sur le mur qu'elle traverse.
    const touches = rayon.intersectObjects(m.architecture.children, false).filter((h) => h.object instanceof THREE.Mesh && typeof h.object.userData.architecture === "string");
    const archi = touches.find((h) => mesh.architecture?.some((a) => a.id === h.object.userData.architecture && a.type === "opening")) ?? touches[0];
    if (archi && (!touche || archi.distance <= touche.distance)) { surSelectionArchitecture?.(archi.object.userData.architecture as string); return; }
    surSelection?.((touche?.object.userData.solide as string | undefined) ?? null);
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
    const m: Moteur = { renderer, scene, perspective, plan, camera: perspective, controls: null, contenu, libres, architecture, surimpression, rendre: () => renderer.render(scene, m.camera) };
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
      m.controls?.dispose();
      vider(contenu); vider(libres); vider(architecture); vider(surimpression);
      grille.geometry.dispose();
      (grille.material as THREE.Material).dispose();
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
    poserControles(m, navigation);
    cadrer(m, mesh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  useEffect(() => {
    const m = moteur.current; if (!m) return;
    construire(m, mesh, selection);
    construireArchitecture(m, mesh, selectionArchitecture);
    if (!cadre.current) { cadrer(m, mesh); cadre.current = true; }
    else m.rendre();
  }, [mesh, selection, selectionArchitecture, indisponible]);

  useEffect(() => {
    const m = moteur.current; if (!m) return;
    construireCoupe(m, resultatCoupe);
    m.rendre();
  }, [resultatCoupe]);

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
    <section className="studio-vue3d" aria-label="Vue 3D" data-studio-vue3d data-studio-volumes={mesh.solids.length} data-studio-non-extrudes={mesh.nonExtruded} data-studio-solides-libres={libres} data-studio-architecture-3d={architecture.length} data-studio-navigation={navigation}>
      <div className="studio-vue3d-bandeau">
        <span role="status" data-studio-vue3d-decompte><span>{`${mesh.solids.length} volume(s)`}</span>{" · "}<span>{`${mesh.nonExtruded} objet(s) non extrudé(s), dessinés à plat`}</span>{libres > 0 && <>{" · "}<span>{`${libres} solide(s) libre(s)`}</span></>}</span>
        <button type="button" onClick={() => { const m = moteur.current; if (m) cadrer(m, mesh); }} disabled={indisponible}>Recadrer la vue 3D</button>
      </div>
      {indisponible && <p className="studio-alert" role="alert" data-studio-vue3d-indisponible>Vue 3D indisponible : WebGL n’est pas pris en charge par ce navigateur.</p>}
      <div ref={hote} className="studio-vue3d-hote" data-studio-vue3d-outil={outil} />
      <p className="studio-hint">{navigation === "plan"
        ? "Repère local 3D : z vers le haut, en mètres. Vue en plan : glisser : déplacer ; molette : zoom."
        : "Repère local 3D : z vers le haut, en mètres. Glisser : orbite ; clic droit ou Maj + glisser : déplacer ; molette : zoom."}</p>
      {erreur && <p className="studio-alert" role="alert" data-studio-volume-erreur>{erreur}</p>}

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
              <button type="button" aria-pressed={a.id === selectionArchitecture} onClick={() => surSelectionArchitecture?.(a.id === selectionArchitecture ? null : a.id)} data-studio-architecture-3d-objet={a.id} data-studio-type={a.type}>
                <Icon name={a.type === "wall" ? "studio-wall" : "studio-opening"} size={16} /> {a.type === "wall" ? "Mur" : "Ouverture"} <span translate="no">{a.id.slice(0, 8)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>}

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
