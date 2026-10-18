/**
 * Vue 3D de Studio (chargée à la demande) : rendu three.js de la géométrie dérivée `studioMesh3d` du brouillon courant
 * (non enregistré compris), dans le repère `local-3d` (z vers le haut, mètres). Orbite, panoramique et zoom
 * (OrbitControls) ; aucun geste ne modifie le document. Les objets non extrudés sont dessinés à plat (z = 0) et
 * comptés. Sans WebGL, la vue l'annonce et garde le décompte. Studio n'importe aucun module de l'Atelier.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { studioMesh3d, type StudioDocument, type StudioMesh3d } from "@parcours/atelier-model";
import "./vue3d.css";

interface Moteur {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  contenu: THREE.Group;
  rendre: () => void;
}

function vider(groupe: THREE.Group) {
  for (const enfant of [...groupe.children]) {
    groupe.remove(enfant);
    const o = enfant as THREE.Mesh;
    o.geometry?.dispose();
    const m = o.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m?.dispose();
  }
}

function construire(groupe: THREE.Group, mesh: StudioMesh3d) {
  vider(groupe);
  for (const s of mesh.solids) {
    const positions = new Float32Array(s.vertices.flatMap((v) => [v.x, v.y, v.z]));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(s.triangles.flat());
    g.computeVertexNormals();
    const surface = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: s.type === "line" ? 0xd9d2c3 : 0xb9d3cf, roughness: 0.85, side: s.kind === "wall-surface" ? THREE.DoubleSide : THREE.FrontSide }));
    surface.name = s.id;
    groupe.add(surface);
    const a = new THREE.BufferGeometry();
    a.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s.edges.flatMap(([i, j]) => [i, j].flatMap((k) => [s.vertices[k]!.x, s.vertices[k]!.y, s.vertices[k]!.z]))), 3));
    groupe.add(new THREE.LineSegments(a, new THREE.LineBasicMaterial({ color: 0x234f5b })));
  }
  for (const o of mesh.outlines) {
    const g = new THREE.BufferGeometry().setFromPoints(o.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    const m = new THREE.LineDashedMaterial({ color: 0x8a6a3a, dashSize: 0.15, gapSize: 0.1 });
    const l = o.closed ? new THREE.LineLoop(g, m) : new THREE.Line(g, m);
    l.computeLineDistances();
    groupe.add(l);
  }
}

function cadrer(m: Moteur, mesh: StudioMesh3d) {
  const b = mesh.bounds ?? { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 0 } };
  const centre = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  const taille = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1);
  m.controls.target.copy(centre);
  m.camera.position.set(centre.x + taille * 1.2, centre.y - taille * 1.6, centre.z + taille * 1.1);
  m.camera.near = taille / 1000; m.camera.far = taille * 100;
  m.camera.updateProjectionMatrix();
  m.controls.update();
  m.rendre();
}

export function Vue3DStudio({ doc }: { doc: StudioDocument }) {
  const hote = useRef<HTMLDivElement>(null);
  const moteur = useRef<Moteur | null>(null);
  const cadre = useRef(false);
  const [indisponible, setIndisponible] = useState(false);
  const mesh = useMemo(() => studioMesh3d(doc), [doc]);

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
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.up.set(0, 0, 1); // repère local-3d : z vers le haut
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb0bcc0, 1.6));
    const soleil = new THREE.DirectionalLight(0xffffff, 1.4);
    soleil.position.set(4, -6, 10);
    scene.add(soleil);
    const grille = new THREE.GridHelper(40, 40, 0xbfcfd3, 0xdde6e8);
    grille.rotation.x = Math.PI / 2; // plan XY du repère local-3d
    scene.add(grille);
    const contenu = new THREE.Group();
    scene.add(contenu);
    const controls = new OrbitControls(camera, renderer.domElement);
    const rendre = () => renderer.render(scene, camera);
    controls.addEventListener("change", rendre);
    const m: Moteur = { renderer, scene, camera, controls, contenu, rendre };
    moteur.current = m;
    const taille = () => {
      const w = Math.max(el.clientWidth, 1), h = Math.max(Math.round(w * 0.62), 240);
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      rendre();
    };
    const obs = typeof ResizeObserver === "function" ? new ResizeObserver(taille) : null;
    obs?.observe(el);
    taille();
    return () => {
      obs?.disconnect();
      controls.removeEventListener("change", rendre);
      controls.dispose();
      vider(contenu);
      grille.geometry.dispose();
      (grille.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      moteur.current = null;
      cadre.current = false;
    };
  }, []);

  useEffect(() => {
    const m = moteur.current; if (!m) return;
    construire(m.contenu, mesh);
    if (!cadre.current) { cadrer(m, mesh); cadre.current = true; }
    else m.rendre();
  }, [mesh, indisponible]);

  return (
    <section className="studio-vue3d" aria-label="Vue 3D" data-studio-vue3d data-studio-volumes={mesh.solids.length} data-studio-non-extrudes={mesh.nonExtruded}>
      <div className="studio-vue3d-bandeau">
        <span role="status" data-studio-vue3d-decompte><span>{`${mesh.solids.length} volume(s)`}</span>{" · "}<span>{`${mesh.nonExtruded} objet(s) non extrudé(s), dessinés à plat`}</span></span>
        <button type="button" onClick={() => { const m = moteur.current; if (m) cadrer(m, mesh); }} disabled={indisponible}>Recadrer la vue 3D</button>
      </div>
      {indisponible && <p className="studio-alert" role="alert" data-studio-vue3d-indisponible>Vue 3D indisponible : WebGL n’est pas pris en charge par ce navigateur.</p>}
      <div ref={hote} className="studio-vue3d-hote" />
      <p className="studio-hint">Repère local 3D : z vers le haut, en mètres. Glisser : orbite ; clic droit ou Maj + glisser : déplacer ; molette : zoom.</p>
    </section>
  );
}
