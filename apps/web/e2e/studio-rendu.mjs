#!/usr/bin/env node
/**
 * Recette du rendu Studio (lot F5) — dégradation sûre de la vue 3D, inventaire des types 3D avancés, comparaison des
 * moteurs de rendu 2D — par l'interface (API et application construites, même origine) :
 *
 *  - TR-EX-057 / EX-057 : vue 3D d'une étude de douze boîtes ; charge simulée (`__fadiVue3d.charge`, millisecondes
 *    ajoutées à chaque rendu, comptées dans le temps de trame mesuré) → la qualité baisse palier par palier (résolution
 *    75 %, 50 %, puis anti-crénelage coupé ; la vue ne calcule aucune ombre, ce palier est sauté), l'indicateur « Qualité
 *    d’affichage réduite sous charge » le dit ; sous charge, désignation (clic sur un solide), volumes, document et
 *    révision sont identiques ; la charge ôtée, la qualité revient palier par palier et les compteurs GPU reviennent à
 *    leur ligne de base ;
 *  - A.3-08 : l'inventaire « Types 3D : inventaire de couverture » affiche chaque type avancé « Non disponible » (le booléen
 *    exact, livré au lot F2, est disponible), sans
 *    commande, et aucun outil de la barre ne le propose ;
 *  - TEST-025 : comparaison SVG / Canvas / GPU (WebGL brut, sans dépendance nouvelle) sur les scènes S1–S3 du corpus
 *    (100 et 10 000 primitives) dans le navigateur : fidélité (pixels à 1 px près, traits relus), accessibilité (textes
 *    et arbre d'accessibilité exposés), latence (tracé seul, et jusqu'à la trame suivante). Rapport JSON + Markdown dans
 *    OUT, **sans seuil ni verdict** : DEC-08 retient SVG, la comparaison sert de preuve et ne bascule rien (contrôlé :
 *    la planche 2D reste un SVG).
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-rendu node apps/web/e2e/studio-rendu.mjs
 */
import { chromium } from "playwright";
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-rendu";
const ICI = dirname(fileURLToPath(import.meta.url));
const WEB = join(ICI, "..");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-rendu-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-rendu-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.F5", name: "Studio — rendu" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude rendu" });
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const boites = Array.from({ length: 12 }, (_, i) => ({
    toolId: "studio.solide.boite",
    params: { id: `b${i}`, type: "box", placement: { origin: { x: (i % 4) * 3, y: Math.floor(i / 4) * 3, z: 0 }, rotation: 0 }, width: 2, depth: 1 + (i % 3), height: 1 + (i % 4) },
  }));
  await api("post", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `rendu-${randomUUID()}`, baseRevisionId: (await api("get", chemin)).revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "L", type: "line", start: { x: 0, y: -2 }, end: { x: 10, y: -2 } } }, ...boites,
  ] });
  const revisionAvant = (await api("get", chemin)).revision;
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();

  // ——— DEC-08 : la planche 2D reste un SVG (la comparaison ne bascule rien) ———
  const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  await page.locator('[data-studio-objet="L"]').waitFor({ state: "attached" });
  check("DEC-08 : la planche 2D est rendue en SVG (aucun canevas), la comparaison TEST-025 ne bascule rien",
    (await planche.evaluate((e) => e.tagName.toLowerCase())) === "svg" && (await planche.locator("canvas").count()) === 0);

  // ——— TR-EX-057 : dégradation sûre sous charge ———
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Shift+D");
  const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  const canevas = panneaux3d.locator("canvas[data-studio-vue3d-canvas]");
  await canevas.waitFor({ timeout: 20000 });
  await page.locator('[data-studio-vue3d][data-studio-solides-libres="12"]').waitFor();
  await page.waitForFunction(() => typeof globalThis.__fadiVue3d?.charge === "function");
  const qualite = () => page.evaluate(() => globalThis.__fadiVue3d.qualite());
  const rendre = (n) => page.evaluate((k) => globalThis.__fadiVue3d.rendre(k), n);
  const attributs = () => canevas.evaluate((c) => ({ palier: c.dataset.studioQualitePalier, pixelRatio: c.dataset.studioPixelRatio, aa: c.dataset.studioAntiCrenelage, geometries: c.dataset.studioGpuGeometries, textures: c.dataset.studioGpuTextures, largeur: c.width, css: c.clientWidth }));
  const indicateur = page.locator("[data-studio-qualite-reduite]");
  const releve = async () => ({
    solides: await panneaux3d.locator("[data-studio-solide]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-studio-solide")}:${e.textContent}`)),
    volumes: await page.locator("[data-studio-vue3d]").getAttribute("data-studio-volumes"),
    libres: await page.locator("[data-studio-vue3d]").getAttribute("data-studio-solides-libres"),
    enAttente: await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre"),
  });
  await page.waitForFunction(() => {
    const v = document.querySelector("[data-studio-vue3d]");
    return v?.getAttribute("data-studio-maillage") === "done" && v.getAttribute("data-studio-maillage-revision") === v.getAttribute("data-studio-revision-courante");
  });
  await canevas.evaluate((c) => c.scrollIntoView({ block: "center" }));
  /** Clic au centre affiché du solide `id` : identifiant désigné (le premier objet touché par le rayon), ou null. */
  const designer = async (id) => {
    const p = await page.evaluate((x) => globalThis.__fadiVue3d.ecran(x), id);
    await page.mouse.click(p.x, p.y);
    await page.locator("[data-studio-solide-choisi]").waitFor({ timeout: 5000 }).catch(() => {});
    return page.locator("[data-studio-solide-choisi]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-solide-choisi"))[0] ?? null);
  };
  await rendre(2);
  const a0 = await attributs(), q0 = await qualite();
  const dpr = await page.evaluate(() => Math.min(window.devicePixelRatio || 1, 2));
  check("TR-EX-057 : au repos, qualité complète — palier 0, rapport de pixels de l'appareil, anti-crénelage, aucun indicateur",
    q0.palier === 0 && a0.palier === "0" && Number(a0.pixelRatio) === dpr && a0.aa === "oui" && (await indicateur.count()) === 0, JSON.stringify({ a0, q0 }));
  const avant = await releve();
  const choisiAvant = await designer("b5");
  check("TR-EX-057 : au repos, un clic au centre affiché de b5 désigne un solide", choisiAvant !== null, String(choisiAvant));

  await page.evaluate(() => globalThis.__fadiVue3d.charge(40));
  const paliers = [];
  for (let k = 0; k < 3; k++) {
    await rendre(8);
    const a = await attributs(), q = await qualite();
    paliers.push({ palier: q.palier, resolution: q.resolution, antiCrenelage: q.antiCrenelage, pixelRatio: a.pixelRatio, largeur: a.largeur, css: a.css });
  }
  check("TR-EX-057 : sous charge simulée (40 ms par trame, budget 16,7 ms), résolution 75 %, puis 50 %, puis anti-crénelage coupé — un palier par fenêtre de 8 trames",
    paliers.map((p) => `${p.palier}:${p.resolution}:${p.antiCrenelage}`).join(" ") === "1:0.75:true 2:0.5:true 3:0.5:false"
      && Number(paliers[0].pixelRatio) === dpr * 0.75 && Number(paliers[1].pixelRatio) === dpr * 0.5 && paliers[1].largeur === Math.floor(paliers[1].css * dpr * 0.5),
    JSON.stringify(paliers));
  await indicateur.waitFor();
  const texte = (await indicateur.textContent()) ?? "";
  check("TR-EX-057 : indicateur visible « Qualité d’affichage réduite sous charge : résolution à 50 %, anti-crénelage coupé ; accrochage et tolérances inchangés »",
    texte === "Qualité d’affichage réduite sous charge : résolution à 50 %, anti-crénelage coupé ; accrochage et tolérances inchangés" && (await indicateur.getAttribute("role")) === "status"
      && (await canevas.getAttribute("data-studio-anti-crenelage")) === "non", texte);
  await page.screenshot({ path: join(OUT, "studio-rendu-qualite-reduite.png") });
  const choisiSous = await designer("b5");
  // Navigation sous charge : un glisser fait tourner la vue, rien n'est écrit au document.
  const boite = await canevas.boundingBox();
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 + 120, boite.y + boite.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  const sous = await releve();
  const revisionSous = (await api("get", chemin)).revision;
  check("TR-EX-057 : sous charge, même désignation au même point (même solide qu'au repos), mêmes solides et volumes, aucune commande, même révision serveur",
    choisiSous === choisiAvant && JSON.stringify(sous.solides) === JSON.stringify(avant.solides) && sous.volumes === avant.volumes && sous.libres === avant.libres && sous.enAttente === "0"
      && revisionSous.id === revisionAvant.id && JSON.stringify(revisionSous.document) === JSON.stringify(revisionAvant.document), JSON.stringify({ choisiAvant, choisiSous, sous: sous.enAttente, rev: revisionSous.id === revisionAvant.id }));

  await page.evaluate(() => globalThis.__fadiVue3d.charge(0));
  const retours = [];
  for (let k = 0; k < 4; k++) { await rendre(8); retours.push((await qualite()).palier); }
  const a1 = await attributs();
  await indicateur.waitFor({ state: "detached" });
  check("TR-EX-057 : charge ôtée, retour palier par palier (2, 1, 0) jusqu'à la qualité complète ; indicateur retiré",
    retours.join(" ") === "2 1 0 0" && a1.palier === "0" && Number(a1.pixelRatio) === dpr && a1.aa === "oui", JSON.stringify({ retours, a1 }));
  check("TR-EX-057 : compteurs GPU de la scène revenus à leur ligne de base (présentation sans anti-crénelage libérée)",
    a1.geometries === a0.geometries && a1.textures === a0.textures, JSON.stringify({ a0, a1 }));
  const apres = await releve();
  check("TR-EX-057 : après la charge, mêmes solides, volumes et document", JSON.stringify(apres.solides) === JSON.stringify(avant.solides) && apres.volumes === avant.volumes && apres.enAttente === "0");

  // ——— A.3-08 : types 3D avancés, jamais proposés comme disponibles ———
  const couverture = panneaux3d.locator("[data-studio-couverture-3d]");
  await couverture.locator("summary").click();
  const types = await couverture.locator("[data-studio-type-3d]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-studio-type-3d"), etat: e.getAttribute("data-studio-type-3d-etat"), texte: e.textContent, commandes: e.querySelectorAll("button, input, select, a").length, libelle: e.querySelector("strong")?.textContent })));
  const avances = types.filter((t) => t.etat === "non-disponible");
  check("A.3-08 : inventaire affiché — sommets et arêtes, groupe, courbe exacte 3D, BRep fournisseur « Non disponible », sans commande",
    avances.map((t) => t.id).join(" ") === "sommets-aretes groupe-3d courbe-exacte-3d brep-fournisseur"
      && avances.every((t) => t.texte.includes("— Non disponible") && t.commandes === 0), JSON.stringify(avances.map((t) => [t.id, t.commandes])));
  check("A.3-08 : composant 3D (X.1-04), surfaces NURBS et de subdivision (X.1-05) annoncés disponibles", ["composant-3d", "surface-nurbs", "surface-complexe"].every((id) => types.find((t) => t.id === id)?.etat === "disponible"), JSON.stringify(types.filter((t) => ["composant-3d", "surface-nurbs", "surface-complexe"].includes(t.id)).map((t) => [t.id, t.etat])));
  check("A.3-08 : le booléen exact (lot F2) est annoncé disponible, avec ses tests", types.find((t) => t.id === "booleen")?.etat === "disponible", JSON.stringify(types.find((t) => t.id === "booleen")));
  const libellesBarre = await page.locator("[data-studio-outil]").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").toLowerCase()));
  const proposes = avances.filter((t) => libellesBarre.some((l) => l.includes((t.libelle ?? "").split(" (")[0].toLowerCase())));
  check("A.3-08 : aucun outil de la barre ne propose un type avancé", proposes.length === 0 && libellesBarre.length > 0, JSON.stringify(proposes.map((t) => t.id)));
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  await context.close();
} catch (e) {
  console.error(e);
  await browser.close();
  process.exit(1);
}

// ——— TEST-025 : SVG / Canvas / GPU sur S1–S3 ———
const tmp = join(OUT, ".bundle");
mkdirSync(tmp, { recursive: true });
await build({
  stdin: { contents: 'export { exportStudioSvg } from "@parcours/atelier-model";\nexport { genererCorpus } from "@parcours/atelier-model/studio-corpus";\n', resolveDir: WEB, loader: "ts" },
  bundle: true, platform: "node", format: "esm", outfile: join(tmp, "corpus.mjs"), logLevel: "error",
});
const navigateur = await build({ entryPoints: [join(WEB, "src/modules/studio/planche2d/rendus/comparaison-moteurs.ts")], bundle: true, format: "iife", globalName: "__comparaison", write: false, logLevel: "error" });
const { exportStudioSvg, genererCorpus } = await import(pathToFileURL(join(tmp, "corpus.mjs")).href);

const LARGEUR = 1200, HAUTEUR = 800, REPETITIONS = 7;
const cas = [];
for (const scene of ["S1", "S2", "S3"]) for (const taille of [100, 10_000]) {
  const corpus = genererCorpus(scene, taille);
  cas.push({ scene, taille, feuillets: corpus.documents.length, svg: exportStudioSvg(corpus.documents[0]) });
}
const rapport = {
  test: "TEST-025", decision: "DEC-08 retient SVG : comparaison de preuve, aucune bascule, aucun seuil ni verdict.",
  date: new Date().toISOString(), environnement: { navigateur: browser.version(), plateforme: process.platform, node: process.version, cadre: `${LARGEUR} × ${HAUTEUR} px`, repetitions: REPETITIONS },
  methode: {
    scene: "SVG exporté par le modèle (exportStudioSvg) du premier feuillet de chaque corpus ; lu en primitives, tracé par le moteur Canvas 2D et réduit en segments pour le moteur GPU (WebGL, gl.LINES).",
    fidelite: "Encre (pixel plus sombre que 230/255 sur fond blanc) du rendu de référence (SVG rastérisé par le navigateur) comparée à celle de chaque moteur : part de l'encre de chacun à 1 px près de l'autre ; et traits relus de l'enregistreur Canvas comparés aux traits du SVG.",
    accessibilite: "Textes présents dans le document (nœuds <text>) et lignes de l'arbre d'accessibilité (Playwright ariaSnapshot) de l'hôte de chaque moteur.",
    latence: "Tracé seul (SVG : insertion + mise en page forcée ; Canvas : tracé + lecture d'un pixel ; GPU : envoi + tracé + lecture d'un pixel) et jusqu'à la trame suivante (deux requestAnimationFrame) ; ms, rang le plus proche.",
    limites: "GPU : textes non tracés (pas d'atlas de glyphes), arcs découpés au pas PAS_ARC_GPU ; rendu logiciel possible (SwiftShader en CI) : la latence GPU n'est pas celle d'une carte réelle.",
  },
  scenes: [],
};
const ctx = await browser.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
const p = await ctx.newPage();
await p.setContent(`<!doctype html><html lang="fr"><body style="margin:0;background:#fff"><div id="hote" style="width:${LARGEUR}px;height:${HAUTEUR}px"></div></body></html>`);
await p.addScriptTag({ content: navigateur.outputFiles[0].text });
for (const c of cas) {
  const m = await p.evaluate(async ({ svg, L, H, N }) => {
    const C = globalThis.__comparaison;
    const hote = document.getElementById("hote");
    const trame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dimensionne = svg.replace(/<svg\b/, `<svg width="${L}" height="${H}"`).replace(/^<\?xml[^>]*>\s*/, "");
    const scene = C.lirePrimitivesSvg(svg);
    const encre = (data) => { const out = new Uint8Array(L * H); for (let i = 0; i < L * H; i++) { const k = i * 4; out[i] = (data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114) < 230 ? 1 : 0; } return out; };
    const pres = (a, b) => { let n = 0, ok = 0; for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) { if (!a[y * L + x]) continue; n++; let t = false; for (let dy = -1; dy <= 1 && !t; dy++) for (let dx = -1; dx <= 1 && !t; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < L && Y < H && b[Y * L + X]) t = true; } if (t) ok++; } return { encre: n, aUnPixel: n ? ok / n : null }; };
    const canevas2d = () => { const k = document.createElement("canvas"); k.width = L; k.height = H; const g = k.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, L, H); return [k, g]; };
    async function raster(texte) {
      const url = URL.createObjectURL(new Blob([texte], { type: "image/svg+xml" }));
      const img = new Image(); img.src = url; await img.decode();
      const [, g] = canevas2d(); g.drawImage(img, 0, 0, L, H); URL.revokeObjectURL(url);
      return encre(g.getImageData(0, 0, L, H).data);
    }
    const refSvg = await raster(dimensionne);
    const refSansTexte = await raster(dimensionne.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, ""));
    // Canvas
    const [kc, gc] = canevas2d();
    C.dessinerCanvas(gc, scene, L, H);
    const encreCanvas = encre(gc.getImageData(0, 0, L, H).data);
    // GPU (WebGL brut)
    const kg = document.createElement("canvas"); kg.width = L; kg.height = H;
    const gl = kg.getContext("webgl", { preserveDrawingBuffer: true, antialias: true });
    let gpu = null;
    if (gl) {
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float;void main(){gl_FragColor=vec4(0.,0.,0.,1.);}"));
      gl.linkProgram(prog); gl.useProgram(prog);
      const buf = gl.createBuffer(); const loc = gl.getAttribLocation(prog, "p");
      const px = new Uint8Array(4);
      const tracerGpu = () => {
        const s = C.segmentsGpu(scene, L, H);
        gl.viewport(0, 0, L, H); gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, s.sommets, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, s.segments * 2);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return s;
      };
      const s = tracerGpu();
      const [, gg] = canevas2d(); gg.drawImage(kg, 0, 0);
      gpu = { segments: s.segments, textesNonTraces: s.textesNonTraces, encre: encre(gg.getImageData(0, 0, L, H).data), tracer: tracerGpu, renderer: (() => { const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() };
    }
    // Traits relus (enregistreur) : mêmes primitives, mêmes positions.
    const enr = new C.EnregistreurCanvas();
    C.dessinerCanvas(enr, scene, L, H);
    const traits = C.comparerTraits(C.traitsSvg(scene), C.traitsCanvas(enr.appels, C.cadreViewBox(scene.viewBox, L, H)));
    // Latence
    const mesurer = async (f) => { const seul = [], trames = []; await f(); for (let i = 0; i < N; i++) { const t0 = performance.now(); await f(); seul.push(performance.now() - t0); await trame(); trames.push(performance.now() - t0); } return { traceSeul: C.statistiquesDurees(seul), jusquALaTrame: C.statistiquesDurees(trames) }; };
    const latSvg = await mesurer(() => { hote.innerHTML = dimensionne; hote.getBoundingClientRect(); hote.firstElementChild.getBBox?.(); });
    const textesSvg = hote.querySelectorAll("svg text").length;
    const latCanvas = await mesurer(() => { gc.fillStyle = "#fff"; gc.fillRect(0, 0, L, H); C.dessinerCanvas(gc, scene, L, H); gc.getImageData(0, 0, 1, 1); });
    const latGpu = gpu ? await mesurer(() => { gpu.tracer(); }) : null;
    return {
      primitives: scene.primitives.length, elements: C.compterElementsSvg(svg), traits,
      fidelite: {
        canvasContreSvg: { canvas: pres(encreCanvas, refSvg), svg: pres(refSvg, encreCanvas) },
        gpuContreSvgSansTexte: gpu ? { gpu: pres(gpu.encre, refSansTexte), svgSansTexte: pres(refSansTexte, gpu.encre) } : null,
      },
      accessibilite: { textesDansLeDocumentSvg: textesSvg, textesTraces: scene.primitives.filter((x) => x.genre === "texte" && x.visible).length },
      latence: { svg: latSvg, canvas: latCanvas, gpu: latGpu },
      gpu: gpu ? { disponible: true, segments: gpu.segments, textesNonTraces: gpu.textesNonTraces, renderer: gpu.renderer } : { disponible: false },
    };
  }, { svg: c.svg, L: LARGEUR, H: HAUTEUR, N: REPETITIONS });
  // Arbre d'accessibilité de chaque hôte (SVG inséré, puis canevas seul).
  await p.evaluate(({ svg, L, H }) => { document.getElementById("hote").innerHTML = svg.replace(/<svg\b/, `<svg width="${L}" height="${H}"`).replace(/^<\?xml[^>]*>\s*/, ""); }, { svg: c.svg, L: LARGEUR, H: HAUTEUR });
  const ariaSvg = await p.locator("#hote").ariaSnapshot();
  await p.evaluate(({ L, H }) => { const h = document.getElementById("hote"); h.innerHTML = ""; const k = document.createElement("canvas"); k.width = L; k.height = H; h.append(k); }, { L: LARGEUR, H: HAUTEUR });
  const ariaCanvas = await p.locator("#hote").ariaSnapshot();
  const lignes = (s) => s.split("\n").filter((l) => l.trim()).length;
  m.accessibilite.arbreSvg = { lignes: lignes(ariaSvg), extrait: ariaSvg.split("\n").slice(0, 4).join("\n") };
  m.accessibilite.arbreCanvas = { lignes: ariaCanvas.trim() ? lignes(ariaCanvas) : 0, extrait: ariaCanvas.split("\n").slice(0, 4).join("\n") };
  m.accessibilite.note = "Le SVG expose ses textes dans le document (lisibles, sélectionnables) ; le canevas (Canvas ou GPU) n'expose que des pixels : aucun texte ni rôle sans couche d'accessibilité ajoutée.";
  rapport.scenes.push({ scene: c.scene, taille: c.taille, feuillets: c.feuillets, mesure: "premier feuillet", ...m });
  console.log(`✓ TEST-025 ${c.scene} (${c.taille}) : ${m.primitives} primitives, traits Canvas manquants ${m.traits.manquants} / en trop ${m.traits.enTrop}, encre Canvas à 1 px du SVG ${(m.fidelite.canvasContreSvg.canvas.aUnPixel * 100).toFixed(1)} %, GPU ${m.gpu.disponible ? "disponible" : "non disponible"}`);
}
await ctx.close();
await browser.close();

const pct = (v) => (v === null || v === undefined ? "non évalué" : `${(v * 100).toFixed(1)} %`);
const ms = (s) => (s ? `${s.p50.toFixed(2)} / ${s.p95.toFixed(2)}` : "non évalué");
const md = [
  "# TEST-025 — Comparaison des moteurs de rendu 2D (SVG / Canvas / GPU)", "",
  `${rapport.decision}`, "", `Date : ${rapport.date} · navigateur ${rapport.environnement.navigateur} · cadre ${rapport.environnement.cadre} · ${REPETITIONS} répétitions.`, "",
  "## Méthode", "", ...Object.entries(rapport.methode).map(([k, v]) => `- ${k} : ${v}`), "",
  "## Fidélité", "",
  "| Scène | Primitives | Traits Canvas manquants / en trop | Écart max (m) | Encre Canvas à 1 px du SVG | Encre SVG à 1 px du Canvas | Encre GPU à 1 px du SVG sans texte | Encre SVG sans texte à 1 px du GPU |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...rapport.scenes.map((s) => `| ${s.scene} (${s.taille}) | ${s.primitives} | ${s.traits.manquants} / ${s.traits.enTrop} | ${s.traits.ecartMax.toExponential(2)} | ${pct(s.fidelite.canvasContreSvg.canvas.aUnPixel)} | ${pct(s.fidelite.canvasContreSvg.svg.aUnPixel)} | ${pct(s.fidelite.gpuContreSvgSansTexte?.gpu.aUnPixel)} | ${pct(s.fidelite.gpuContreSvgSansTexte?.svgSansTexte.aUnPixel)} |`), "",
  "## Accessibilité", "",
  "| Scène | Textes dans le document (SVG) | Textes tracés (Canvas) | Lignes de l'arbre d'accessibilité SVG | Canvas | GPU : textes non tracés |",
  "|---|---:|---:|---:|---:|---:|",
  ...rapport.scenes.map((s) => `| ${s.scene} (${s.taille}) | ${s.accessibilite.textesDansLeDocumentSvg} | ${s.accessibilite.textesTraces} | ${s.accessibilite.arbreSvg.lignes} | ${s.accessibilite.arbreCanvas.lignes} | ${s.gpu.disponible ? s.gpu.textesNonTraces : "non évalué"} |`), "",
  "Le SVG expose ses textes dans le document ; Canvas et GPU n'exposent que des pixels (aucun texte, aucun rôle) : noté, non corrigé.", "",
  "## Latence (ms, p50 / p95)", "",
  "| Scène | SVG tracé seul | SVG jusqu'à la trame | Canvas tracé seul | Canvas jusqu'à la trame | GPU tracé seul | GPU jusqu'à la trame |",
  "|---|---:|---:|---:|---:|---:|---:|",
  ...rapport.scenes.map((s) => `| ${s.scene} (${s.taille}) | ${ms(s.latence.svg.traceSeul)} | ${ms(s.latence.svg.jusquALaTrame)} | ${ms(s.latence.canvas.traceSeul)} | ${ms(s.latence.canvas.jusquALaTrame)} | ${ms(s.latence.gpu?.traceSeul)} | ${ms(s.latence.gpu?.jusquALaTrame)} |`), "",
  `GPU : ${rapport.scenes[0]?.gpu.disponible ? `moteur WebGL « ${rapport.scenes[0].gpu.renderer} »` : "WebGL indisponible (non évalué)"}.`, "",
];
writeFileSync(join(OUT, "test-025-comparaison-moteurs.json"), JSON.stringify(rapport, null, 2));
writeFileSync(join(OUT, "test-025-comparaison-moteurs.md"), md.join("\n"));
const complet = rapport.scenes.length === 6 && rapport.scenes.every((s) => s.traits.manquants === 0 && s.traits.enTrop === 0 && Number.isFinite(s.fidelite.canvasContreSvg.canvas.aUnPixel ?? Number.NaN) && s.latence.svg.traceSeul && s.latence.canvas.traceSeul);
console.log(`${complet ? "✓" : "✗"} TEST-025 : rapport écrit (${join(OUT, "test-025-comparaison-moteurs.md")}) — S1–S3 à 100 et 10 000 primitives, traits Canvas = traits SVG, fidélité, accessibilité et latence mesurées, sans seuil`);
if (!complet) process.exit(1);
