// Page du banc L0.4 : rendu three.js WebGL2 de la scène P.118, sélection par lancer de rayon,
// initialisation des WASM candidats dans le navigateur, quotas de stockage. Pilotée par run.mjs.
// La scène est dérivée de P.118 (scene/p118-scene.json, écrit par scene.mjs) ; repère local, m, Z vers le haut.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const canvas = document.getElementById("vue");
const etat = document.getElementById("etat");
const maintenant = () => performance.now();
const attendreTrame = () => new Promise((ok) => requestAnimationFrame(ok));

function stats(v) {
  if (!v.length) return { n: 0 };
  const t = [...v].sort((a, b) => a - b);
  const p = (q) => t[Math.min(t.length - 1, Math.max(0, Math.ceil((q / 100) * t.length) - 1))];
  const r = (x) => Number(x.toFixed(3));
  return { n: t.length, min: r(t[0]), p50: r(p(50)), p95: r(p(95)), max: r(t[t.length - 1]), moyenne: r(t.reduce((s, x) => s + x, 0) / t.length) };
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function alea(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- informations navigateur / GPU
export function infosNavigateur() {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2");
  let gpu = { webgl2: !!gl };
  if (gl) {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = {
      webgl2: true,
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
      version: gl.getParameter(gl.VERSION),
      glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { largeur: innerWidth, hauteur: innerHeight },
    crossOriginIsolated: self.crossOriginIsolated,
    webgpu: "gpu" in navigator,
    gpu,
  };
}

// ---------------------------------------------------------------- construction de la scène
const materiaux = new Map();
function materiau(couleur) {
  const cle = couleur ?? "#c8c4bb";
  if (!materiaux.has(cle)) materiaux.set(cle, new THREE.MeshLambertMaterial({ color: new THREE.Color(cle) }));
  return materiaux.get(cle);
}

/** Géométrie d'un mur percé de ses ouvertures : profil en élévation (x le long de l'axe, y vertical) extrudé sur l'épaisseur. */
function geometrieMur(mur, ouvertures, elevation, compteurs) {
  const dx = mur.b[0] - mur.a[0], dy = mur.b[1] - mur.a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) { compteurs.mursDegeneres++; return null; }
  const h = mur.hauteur;
  const rects = ouvertures.map((o) => {
    const c = o.t * L;
    return { x0: Math.max(0.001, c - o.largeur / 2), x1: Math.min(L - 0.001, c + o.largeur / 2), z0: Math.max(0, o.allege), z1: Math.min(h - 0.001, o.allege + o.hauteur) };
  }).filter((r) => r.x1 > r.x0 && r.z1 > r.z0);
  const encoches = rects.filter((r) => r.z0 <= 1e-6).sort((a, b) => a.x0 - b.x0);
  const trous = rects.filter((r) => r.z0 > 1e-6);
  const forme = new THREE.Shape();
  forme.moveTo(0, 0);
  let xCourant = 0;
  for (const r of encoches) {
    if (r.x0 < xCourant) { compteurs.ouverturesChevauchantes++; continue; }
    forme.lineTo(r.x0, 0); forme.lineTo(r.x0, r.z1); forme.lineTo(r.x1, r.z1); forme.lineTo(r.x1, 0);
    xCourant = r.x1;
  }
  forme.lineTo(L, 0); forme.lineTo(L, h); forme.lineTo(0, h); forme.closePath();
  for (const r of trous) {
    const t = new THREE.Path();
    t.moveTo(r.x0, r.z0); t.lineTo(r.x1, r.z0); t.lineTo(r.x1, r.z1); t.lineTo(r.x0, r.z1); t.closePath();
    forme.holes.push(t);
  }
  const g = new THREE.ExtrudeGeometry(forme, { depth: mur.epaisseur, bevelEnabled: false });
  g.translate(0, 0, -mur.epaisseur / 2);
  const ux = dx / L, uy = dy / L;
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, uy, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(uy, -ux, 0));
  m.setPosition(mur.a[0], mur.a[1], elevation);
  g.applyMatrix4(m);
  return g;
}

function geometrieTrace(tr, elevation, compteurs) {
  if (!tr.ferme || !tr.solide || !(tr.hauteur > 0) || tr.points.length < 3) { compteurs.tracesSansVolume++; return null; }
  const forme = new THREE.Shape(tr.points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const trou of tr.trous) if (trou.length >= 3) forme.holes.push(new THREE.Path(trou.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(forme, { depth: tr.hauteur, bevelEnabled: false });
  if (!g.attributes.position || g.attributes.position.count === 0) { compteurs.tracesDegeneres++; g.dispose(); return null; }
  g.translate(0, 0, elevation + (tr.decalageBase ?? 0));
  return g;
}

function geometrieEscalier(es, elevation) {
  const dx = es.b[0] - es.a[0], dy = es.b[1] - es.a[1];
  const L = Math.hypot(dx, dy) || 0.01;
  const g = new THREE.BoxGeometry(L, es.largeur, 0.18);
  g.rotateY(-Math.atan2(es.hauteur, L));
  g.rotateZ(Math.atan2(dy, dx));
  g.translate((es.a[0] + es.b[0]) / 2, (es.a[1] + es.b[1]) / 2, elevation + es.decalageBase + es.hauteur / 2);
  return g;
}

/** Construit la scène. variante = "objets" (un maillage par objet, poteaux et remplissages instanciés)
 *  ou "fusionne" (géométries fusionnées par niveau et par matériau). */
export function construireScene(donnees, variante) {
  const racine = new THREE.Group();
  racine.rotation.x = -Math.PI / 2; // Z vers le haut (modèle) → Y vers le haut (three.js)
  const compteurs = { mursDegeneres: 0, ouverturesChevauchantes: 0, tracesSansVolume: 0, tracesDegeneres: 0, maillages: 0, instances: 0 };
  const boite = new THREE.BoxGeometry(1, 1, 1);
  const matPoteau = materiau("#8f8a80"), matPorte = materiau("#9c6b3c"), matVitre = new THREE.MeshLambertMaterial({ color: 0x9fc3d6, transparent: true, opacity: 0.5 });
  const matMur = materiau("#e5e0d5"), matEsc = materiau("#b9b2a5");
  const poteaux = [], portes = [], fenetres = [];
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), axeZ = new THREE.Vector3(0, 0, 1);
  for (const n of donnees.niveaux) {
    const parMat = new Map(); // variante fusionnée : matériau → géométries
    const ajouter = (g, mat, id) => {
      if (!g) return;
      if (variante === "objets") { const me = new THREE.Mesh(g, mat); me.userData.id = id; racine.add(me); compteurs.maillages++; }
      else { if (!parMat.has(mat)) parMat.set(mat, []); parMat.get(mat).push(g); }
    };
    const murs = new Map(n.murs.map((m) => [m.id, m]));
    for (const mur of n.murs) ajouter(geometrieMur(mur, n.ouvertures.filter((o) => o.murHoteId === mur.id), n.elevation, compteurs), matMur, mur.id);
    for (const tr of n.traces) ajouter(geometrieTrace(tr, n.elevation, compteurs), materiau(tr.couleur), tr.id);
    for (const es of n.escaliers) ajouter(geometrieEscalier(es, n.elevation), matEsc, es.id);
    if (variante === "fusionne") for (const [mat, gs] of parMat) { const g = mergeGeometries(gs, false); gs.forEach((x) => x.dispose()); racine.add(new THREE.Mesh(g, mat)); compteurs.maillages++; }
    for (const c of n.poteaux) {
      q.setFromAxisAngle(axeZ, (c.angle * Math.PI) / 180);
      poteaux.push({ id: c.id, m: new THREE.Matrix4().compose(p.set(c.p[0], c.p[1], n.elevation + c.hauteur / 2), q, s.set(c.largeur, c.profondeur, c.hauteur)) });
    }
    for (const o of n.ouvertures) {
      const mur = murs.get(o.murHoteId);
      if (!mur) continue;
      const dx = mur.b[0] - mur.a[0], dy = mur.b[1] - mur.a[1];
      q.setFromAxisAngle(axeZ, Math.atan2(dy, dx));
      const ep = o.genre === "porte" ? 0.04 : 0.02;
      const mat = new THREE.Matrix4().compose(p.set(mur.a[0] + dx * o.t, mur.a[1] + dy * o.t, n.elevation + o.allege + o.hauteur / 2), q, s.set(o.largeur, ep, o.hauteur));
      (o.genre === "porte" ? portes : fenetres).push({ id: o.id, m: mat });
    }
  }
  for (const [liste, mat] of [[poteaux, matPoteau], [portes, matPorte], [fenetres, matVitre]]) {
    if (!liste.length) continue;
    const im = new THREE.InstancedMesh(boite, mat, liste.length);
    liste.forEach((x, i) => im.setMatrixAt(i, x.m));
    im.userData.ids = liste.map((x) => x.id);
    im.computeBoundingSphere();
    racine.add(im);
    compteurs.maillages++;
    compteurs.instances += liste.length;
  }
  return { racine, compteurs };
}

// ---------------------------------------------------------------- rendu et mesures
let renderer = null;
function rendu() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(0xf4f2ee);
  }
  return renderer;
}

function synchroniser(r) {
  // readPixels d'un pixel : force la fin du travail GPU en attente (mesure du coût réel de la trame).
  const gl = r.getContext();
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
}

function poserCamera(camera, centre, rayon, angle, hauteur = 0.6) {
  const d = rayon * 2.2;
  camera.position.set(centre.x + d * Math.cos(angle), centre.y + d * hauteur, centre.z + d * Math.sin(angle));
  camera.lookAt(centre);
  camera.updateMatrixWorld();
}

/** Ouvre la scène et mesure : ouverture, trame en orbite (rAF et coût synchronisé), sélection. */
export async function mesurerRendu({ variante = "objets", tramesOrbite = 300, rayons = 200 } = {}) {
  etat.textContent = `Rendu : ${variante}…`;
  const r = rendu();
  const t0 = maintenant();
  const reponse = await fetch("/scene/p118-scene.json", { cache: "no-store" });
  const texte = await reponse.text();
  const t1 = maintenant();
  const donnees = JSON.parse(texte);
  const t2 = maintenant();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8577, 1.2));
  const soleil = new THREE.DirectionalLight(0xffffff, 1.5);
  soleil.position.set(30, 60, 20);
  scene.add(soleil);
  const { racine, compteurs } = construireScene(donnees, variante);
  scene.add(racine);
  scene.updateMatrixWorld(true);
  const t3 = maintenant();
  const bb = new THREE.Box3().setFromObject(racine);
  const centre = bb.getCenter(new THREE.Vector3());
  const rayon = bb.getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, rayon * 20);
  poserCamera(camera, centre, rayon, 0.8);
  r.info.reset();
  r.render(scene, camera);
  synchroniser(r);
  const t4 = maintenant();
  const info = { appelsDessin: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, programmes: r.info.programs?.length ?? null };

  // Orbite 1 : intervalles entre trames requestAnimationFrame (plafonnés par la cadence d'affichage).
  const intervalles = [];
  let precedent = null;
  for (let i = 0; i < tramesOrbite; i++) {
    const ts = await attendreTrame();
    poserCamera(camera, centre, rayon, 0.8 + (i / tramesOrbite) * Math.PI * 2);
    r.render(scene, camera);
    if (precedent != null) intervalles.push(ts - precedent);
    precedent = ts;
  }
  // Orbite 2 : coût synchronisé de chaque trame (render + readPixels), indépendant de la cadence d'affichage.
  const couts = [];
  for (let i = 0; i < tramesOrbite; i++) {
    await attendreTrame();
    const a = maintenant();
    poserCamera(camera, centre, rayon, 0.8 + (i / tramesOrbite) * Math.PI * 2);
    r.render(scene, camera);
    synchroniser(r);
    couts.push(maintenant() - a);
  }

  // Sélection : lancers de rayon depuis des points écran pseudo-aléatoires déterministes.
  poserCamera(camera, centre, rayon, 0.8);
  const ray = new THREE.Raycaster();
  const hasard = alea(118);
  const tempsRayon = [];
  let touches = 0;
  const cibles = racine.children;
  for (let i = 0; i < rayons; i++) {
    const ndc = new THREE.Vector2(hasard() * 2 - 1, hasard() * 2 - 1);
    const a = maintenant();
    ray.setFromCamera(ndc, camera);
    const res = ray.intersectObjects(cibles, false);
    // Identification de l'objet touché (variante objets : userData.id ; instancié : ids[instanceId]).
    const premier = res[0];
    const id = premier ? (premier.object.userData.id ?? premier.object.userData.ids?.[premier.instanceId] ?? null) : null;
    tempsRayon.push(maintenant() - a);
    if (premier) touches++;
    void id;
  }

  // Nettoyage pour la mesure suivante.
  racine.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  r.renderLists.dispose();

  etat.textContent = `Rendu ${variante} terminé.`;
  return {
    variante,
    canevas: { largeur: r.domElement.width, hauteur: r.domElement.height, dpr: r.getPixelRatio(), antialias: true },
    sceneOctets: texte.length,
    ouvertureMs: {
      telechargement: Number((t1 - t0).toFixed(2)), analyseJson: Number((t2 - t1).toFixed(2)), construction: Number((t3 - t2).toFixed(2)),
      premiereTrameSynchronisee: Number((t4 - t3).toFixed(2)), total: Number((t4 - t0).toFixed(2)),
    },
    info,
    compteurs,
    tramesOrbite: { intervallesRafMs: stats(intervalles), coutSynchroniseMs: stats(couts) },
    selection: { rayons, touches, msParRayon: stats(tempsRayon), methode: "THREE.Raycaster.intersectObjects, sans BVH" },
  };
}

// ---------------------------------------------------------------- WASM dans le navigateur
export async function initWasmNavigateur(id) {
  const t0 = maintenant();
  let verification = null;
  if (id === "web-ifc") {
    const W = await import("/node_modules/web-ifc/web-ifc-api.js");
    const api = new W.IfcAPI();
    api.SetWasmPath("/node_modules/web-ifc/", true);
    await api.Init(undefined, true);
    verification = { modeleCree: api.CreateModel({ schema: "IFC4X3_ADD2" }) >= 0 };
  } else if (id === "manifold-3d") {
    const Module = (await import("/node_modules/manifold-3d/manifold.js")).default;
    const m = await Module();
    m.setup();
    const c = m.Manifold.cube([1, 2, 3]);
    verification = { volumeCube123: c.volume() };
    c.delete();
  } else if (id === "occt-wasm") {
    const { OcctKernel } = await import("/node_modules/occt-wasm/dist/index.js");
    const k = await OcctKernel.init({ wasm: "/node_modules/occt-wasm/dist/occt-wasm.wasm" });
    verification = { volumeBoite123: k.getVolume(k.makeBox(1, 2, 3)) };
  } else if (id === "opencascade.js") {
    const fabrique = (await import("/node_modules/opencascade.js/dist/opencascade.wasm.js")).default;
    const oc = await new Promise((ok, ko) => {
      const m = fabrique({ locateFile: (p) => (p.endsWith(".wasm") ? "/node_modules/opencascade.js/dist/opencascade.wasm.wasm" : p), onAbort: ko });
      if (m && m.ready) m.ready.then(ok, ko); else ok(m);
    });
    const p = new oc.gp_Pnt_3(1, 2, 3);
    verification = { pointGpPnt: [p.X(), p.Y(), p.Z()] };
  } else throw new Error(`Candidat inconnu : ${id}`);
  const initMs = maintenant() - t0;
  const ressources = performance.getEntriesByType("resource").filter((e) => e.name.includes("/node_modules/")).map((e) => ({ url: new URL(e.name).pathname, transfertOctets: e.transferSize, corpsOctets: e.encodedBodySize, ms: Number(e.duration.toFixed(1)) }));
  return { id, initMs: Number(initMs.toFixed(2)), verification, ressources, tasJsMo: performance.memory ? Number((performance.memory.usedJSHeapSize / 2 ** 20).toFixed(1)) : null };
}

// ---------------------------------------------------------------- quotas navigateur
function idb(nom) {
  return new Promise((ok, ko) => {
    const req = indexedDB.open(nom, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("blocs");
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}
function tx(db, mode, f) {
  return new Promise((ok, ko) => {
    const t = db.transaction("blocs", mode);
    const r = f(t.objectStore("blocs"));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });
}

export async function mesurerQuotas({ blocsMo = 50 } = {}) {
  const res = { storageApi: !!navigator.storage?.estimate };
  const est = async () => { const e = await navigator.storage.estimate(); return { quotaOctets: e.quota, usageOctets: e.usage, details: e.usageDetails ?? null }; };
  res.avant = await est();
  res.persisted = await navigator.storage.persisted?.() ?? null;
  try { res.persistAccorde = await navigator.storage.persist?.() ?? null; } catch (e) { res.persistAccorde = `erreur : ${e.message}`; }
  const db = await idb("banc-l0-4");
  try {
    const scene = await (await fetch("/scene/p118-scene.json", { cache: "no-store" })).text();
    let a = maintenant();
    await tx(db, "readwrite", (s) => s.put(scene, "scene"));
    res.sceneP118 = { octets: scene.length, ecritureMs: Number((maintenant() - a).toFixed(2)) };
    a = maintenant();
    const relu = await tx(db, "readonly", (s) => s.get("scene"));
    res.sceneP118.lectureMs = Number((maintenant() - a).toFixed(2));
    res.sceneP118.identique = relu === scene;
    const bloc = new Uint8Array(2 ** 20);
    for (let i = 0; i < bloc.length; i++) bloc[i] = (i * 2654435761) >>> 24; // contenu non trivial, déterministe
    const temps = [];
    let ecrits = 0, erreur = null;
    for (let i = 0; i < blocsMo; i++) {
      a = maintenant();
      try { await tx(db, "readwrite", (s) => s.put(bloc.slice(), `bloc-${i}`)); } catch (e) { erreur = `${e?.name}: ${e?.message}`; break; }
      temps.push(maintenant() - a);
      ecrits++;
    }
    res.blocs1Mo = { demandes: blocsMo, ecrits, erreur, msParBloc: stats(temps) };
    res.apres = await est();
  } finally {
    db.close();
    await new Promise((ok) => { const d = indexedDB.deleteDatabase("banc-l0-4"); d.onsuccess = d.onerror = d.onblocked = () => ok(); });
  }
  res.apresNettoyage = await est();
  return res;
}

window.__banc = { infosNavigateur, mesurerRendu, initWasmNavigateur, mesurerQuotas, pret: true };
etat.textContent = "Banc prêt.";
