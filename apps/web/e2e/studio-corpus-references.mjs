#!/usr/bin/env node
/**
 * Recette des références visuelles rendues du corpus (X.1-08, REF-02 §18.2) : chaque scène S1–S7 de
 * `packages/atelier-model/src/studio/corpus/fixtures/references-100.json` (100 primitives ; S6 : tête de la variante A)
 * est posée par l'API, ouverte dans Studio (application construite servie par l'API), cadrée (Maj+Z) puis
 * photographiée dans Chromium : la planche 2D (SVG) et la vue 3D (WebGL, maillage terminé). Chaque image est comparée,
 * pixel par pixel dans la page, à la référence versionnée de `references/captures/` (PNG et empreinte SHA-256 dans
 * `captures.json`) : au plus `tolerance.partPixels` des pixels peuvent s'écarter de plus de `tolerance.ecartCanal` sur
 * un canal (tolérance choisie par Fadi : rendu de polices et rastérisation logicielle selon la machine). Une empreinte
 * identique est dite telle ; une empreinte différente dans la tolérance est signalée, jamais tue.
 *
 * Limite déclarée : la vue 3D est rendue par le moteur WebGL de Chromium sans carte graphique (rastérisation logicielle
 * SwiftShader en mode sans tête) ; un rendu sur un banc matériel réel (GPU, pilote) n'est pas couvert ici.
 *
 * Écriture des références (changement délibéré du rendu ou du corpus) : STUDIO_REFERENCES_ECRIRE=1.
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-corpus-references node apps/web/e2e/studio-corpus-references.mjs
 */
import { chromium } from "playwright";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-corpus-references";
const ECRIRE = process.env.STUDIO_REFERENCES_ECRIRE === "1";
mkdirSync(OUT, { recursive: true });
const ICI = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(ICI, "../../../packages/atelier-model/src/studio/corpus");
const CAPTURES = join(CORPUS, "references/captures");
const fixture = JSON.parse(readFileSync(join(CORPUS, "fixtures/references-100.json"), "utf8"));
const MANIFESTE = join(CAPTURES, "captures.json");
const VIEWPORT = { largeur: 1280, hauteur: 900 };
const TOLERANCE = { ecartCanal: 48, partPixels: 0.02 };
const sha = (o) => createHash("sha256").update(o).digest("hex");

let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
const manifesteLu = existsSync(MANIFESTE) ? JSON.parse(readFileSync(MANIFESTE, "utf8")) : null;
const nouveau = {
  $commentaire: "Références visuelles rendues du corpus S1–S7 (X.1-08) : planche 2D et vue 3D photographiées dans Chromium par apps/web/e2e/studio-corpus-references.mjs (STUDIO_REFERENCES_ECRIRE=1), empreinte SHA-256 de chaque PNG. Vue 3D : WebGL de Chromium sans carte graphique (rastérisation logicielle), pas un banc matériel. Géométrie synthétique.",
  navigateur: `Chromium ${browser.version()}`,
  moteur3d: "WebGL de Chromium sans tête, sans carte graphique (rastérisation logicielle)",
  tolerance: TOLERANCE, viewport: VIEWPORT, scenes: {},
};

/** Compare deux PNG dans la page (décodés par le navigateur) : part des pixels qui s'écartent au-delà de la tolérance. */
async function comparer(page, png, reference) {
  return page.evaluate(async ({ a, b, ecart }) => {
    const decoder = async (b64) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data }; };
    const [x, y] = await Promise.all([decoder(a), decoder(b)]);
    if (x.w !== y.w || x.h !== y.h) return { memesDimensions: false, part: 1 };
    let n = 0;
    for (let i = 0; i < x.d.length; i += 4) if (Math.abs(x.d[i] - y.d[i]) > ecart || Math.abs(x.d[i + 1] - y.d[i + 1]) > ecart || Math.abs(x.d[i + 2] - y.d[i + 2]) > ecart) n++;
    return { memesDimensions: true, part: n / (x.w * x.h) };
  }, { a: png.toString("base64"), b: reference.toString("base64"), ecart: TOLERANCE.ecartCanal });
}

try {
  check("fixture des références : sept scènes S1–S7, synthétiques", fixture.scenes.map((s) => s.scene).join() === "S1,S2,S3,S4,S5,S6,S7" && /synthétique/.test(fixture.licence));
  const context = await browser.newContext({ viewport: { width: VIEWPORT.largeur, height: VIEWPORT.hauteur }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-corpus-ref-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-corpus-ref-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: `P.REF.${randomUUID().slice(0, 6)}`, name: "Corpus — références visuelles (synthétique)" });

  for (const sc of fixture.scenes) {
    const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: `Étude ${sc.scene} (synthétique)` });
    const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
    const pose = await api("post", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `ref-${sc.scene}-${randomUUID()}`, baseRevisionId: etude.revision.id, commands: sc.commandes });
    const d = pose.revision.document;
    const n = d.objects.length + (d.dimensions?.length ?? 0) + (d.annotations?.length ?? 0) + (d.architecture?.length ?? 0) + (d.solides?.length ?? 0) + (d.exacts?.length ?? 0) + (d.graphismes?.length ?? 0) + (d.insertions?.length ?? 0) + (d.contraintes?.length ?? 0) + (d.occurrences?.length ?? 0);
    check(`${sc.scene} : posée par l'API (${sc.primitives} primitives, booléens exacts recalculés par le serveur)`, n === sc.primitives, `${n}`);

    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
    await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
    await planche.locator("[data-studio-objet], [data-studio-architecture], [data-studio-graphisme]").first().waitFor({ state: "attached" }).catch(() => {});
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+Z");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const plan = await planche.screenshot({ animations: "disabled" });

    await page.keyboard.press("Shift+D");
    const canevas = page.locator("canvas[data-studio-vue3d-canvas]");
    await canevas.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => {
      const v = document.querySelector("[data-studio-vue3d]");
      return v?.getAttribute("data-studio-maillage") === "done" && v.getAttribute("data-studio-maillage-revision") === v.getAttribute("data-studio-revision-courante");
    }, null, { timeout: 60000 });
    await page.evaluate(async () => { if (typeof globalThis.__fadiVue3d?.rendre === "function") await globalThis.__fadiVue3d.rendre(2); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
    const vue3d = await canevas.screenshot({ animations: "disabled" });

    const images = { plan, vue3d };
    nouveau.scenes[sc.scene] = {};
    for (const [vue, png] of Object.entries(images)) {
      const fichier = `${sc.scene}-${vue}.png`;
      writeFileSync(join(OUT, fichier), png);
      const entree = { fichier, sha256: sha(png), largeur: png.readUInt32BE(16), hauteur: png.readUInt32BE(20) };
      nouveau.scenes[sc.scene][vue] = entree;
      if (ECRIRE) { mkdirSync(CAPTURES, { recursive: true }); writeFileSync(join(CAPTURES, fichier), png); continue; }
      const ref = manifesteLu?.scenes?.[sc.scene]?.[vue];
      if (!ref || !existsSync(join(CAPTURES, ref.fichier))) { check(`${sc.scene} / ${vue} : référence versionnée présente`, false, "STUDIO_REFERENCES_ECRIRE=1 pour l'écrire"); continue; }
      const reference = readFileSync(join(CAPTURES, ref.fichier));
      check(`${sc.scene} / ${vue} : référence intacte (empreinte du fichier = manifeste)`, sha(reference) === ref.sha256);
      if (entree.sha256 === ref.sha256) { check(`X.1-08 ${sc.scene} / ${vue} : rendu identique à la référence (même empreinte SHA-256)`, true, ref.sha256.slice(0, 16)); continue; }
      const c = await comparer(page, png, reference);
      check(`X.1-08 ${sc.scene} / ${vue} : rendu dans la tolérance de la référence (empreinte différente, signalée)`, c.memesDimensions && c.part <= TOLERANCE.partPixels, `${(c.part * 100).toFixed(3)} % de pixels écartés, empreinte ${entree.sha256.slice(0, 16)} au lieu de ${ref.sha256.slice(0, 16)}`);
    }
    // Une image vide (planche blanche, canevas noir) n'est jamais une référence : au moins deux couleurs distinctes.
    for (const [vue, png] of Object.entries(images)) {
      const couleurs = await page.evaluate(async (b64) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, img.width, img.height).data; const s = new Set(); for (let i = 0; i < d.length && s.size < 64; i += 4 * 97) s.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); return s.size; }, png.toString("base64"));
      check(`${sc.scene} / ${vue} : image non vide (${couleurs} couleurs échantillonnées)`, couleurs >= 2);
    }
  }
  if (ECRIRE) { writeFileSync(MANIFESTE, `${JSON.stringify(nouveau, null, 1)}\n`); console.log(`références écrites : ${MANIFESTE}`); }
  writeFileSync(join(OUT, "captures.json"), `${JSON.stringify(nouveau, null, 1)}\n`);
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
if (echecs > 0) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette des références visuelles du corpus : tout est vert.");
