/**
 * Recette de l'extrusion multi-faces et d'Épaissir (lot L21, D-223), bureau 1536 px :
 * - deux rectangles présélectionnés (Ctrl + A), Pousser/Tirer sur l'un, « 1 » → deux boîtes, un pas ;
 * - Épaissir (Alt + Maj + J, ▥) sur un rectangle, « 0,2 » → volume fermé (6 faces), un pas.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-epaissir.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-epaissir";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const CSV_ESSAI = "";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

async function preparer(contexte, avecCatalogue = true) {
  const page = await contexte.newPage();
  await ecarterBarreActions(page);
  const erreurs = [];
  const commandes = [];
  let enPlanche = false;
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("request", (r) => {
    if (enPlanche && r.method() === "POST" && /\/commands\b/.test(r.url())) commandes.push(r.url());
  });
  page.on("dialog", (d) => void d.accept());
  const api = async (methode, chemin, data) => {
    const r = await page.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `epaissir-l21-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · épaissir" })).body.id;
  // Catalogue d'essai fabriqué pour la recette : la colonne `source` le dit — jamais un catalogue du produit.
  if (avecCatalogue) {
  const rev = (await api("get", `/projects/${pid}/atelier/model`)).body.revision;
  const imp = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `prof-${Date.now()}`, baseRevision: rev, contract: "atelier-commands/3", label: "Catalogue d'essai", commands: [{ type: "catalogue.importer", params: { id: "cat-essai", nom: "Profilés d'essai (recette)", ontologie: "structure", csv: CSV_ESSAI } }] });
  if (imp.status !== 200) console.log("  ↳ import refusé", JSON.stringify(imp.body).slice(0, 300));
  }
  await page.goto(`${BASE}/projets/${pid}?module=atelier`);
  await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  return {
    page,
    erreurs,
    commandes,
    async ouvrirPlanche(toucher = false) {
      const b = page.locator("[data-mode-planche]");
      await b.scrollIntoViewIfNeeded();
      if (toucher) await b.tap();
      else await b.click();
      await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
      await page.waitForFunction(() => !!window.fadiPlanche, null, { timeout: 30000 });
      enPlanche = true;
    },
  };
}

/** Aides liées à une page : projection, état du brouillon (aires 3D par Newell), gestes. */
function aides(page) {
  const ecran = async (q) => {
    const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
    const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
    return e && { x: b.x + e.x, y: b.y + e.y };
  };
  const etat = () =>
    page.evaluate(() => {
      const P = window.fadiPlanche;
      const m = P.modele();
      const c = m.racine;
      const pos = (id) => c.sommets[id].position;
      const aire = (f) => {
        const q = f.exterieur.map(pos);
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < q.length; i++) {
          const u = q[i];
          const v = q[(i + 1) % q.length];
          nx += (u.y - v.y) * (u.z + v.z);
          ny += (u.z - v.z) * (u.x + v.x);
          nz += (u.x - v.x) * (u.y + v.y);
        }
        let a = Math.hypot(nx, ny, nz) / 2;
        for (const t of f.trous) {
          const r = t.map(pos);
          let tx = 0, ty = 0, tz = 0;
          for (let i = 0; i < r.length; i++) {
            const u = r[i];
            const v = r[(i + 1) % r.length];
            tx += (u.y - v.y) * (u.z + v.z);
            ty += (u.z - v.z) * (u.x + v.x);
            tz += (u.x - v.x) * (u.y + v.y);
          }
          a -= Math.hypot(tx, ty, tz) / 2;
        }
        return Math.round(a * 1e6) / 1e6;
      };
      const faces = Object.values(c.faces);
      const sommets = Object.values(c.sommets).map((s) => s.position);
      return {
        faces: faces.length,
        aires: faces.map(aire),
        aretes: Object.keys(c.aretes).length,
        courbes: Object.keys(c.courbes).length,
        liens: Object.keys(m.annotations?.extrusions ?? {}).length,
        sommets,
        outil: P.outil(),
        etape: P.etatOutil()?.etape ?? null,
        pas: P.pas(),
      };
    });
  const survoler = async (q) => {
    const e = await ecran(q);
    await page.mouse.move(e.x, e.y, { steps: 4 });
    return e;
  };
  const cliquer = async (q) => {
    const e = await survoler(q);
    await page.mouse.click(e.x, e.y);
    await page.waitForTimeout(50);
  };
  const saisir = async (t) => {
    await page.keyboard.type(t);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  };
  const consigne = () => page.locator("[data-planche-etat]").first().textContent().then((t) => t ?? "");
  const contient = (s, x, y, z) => s.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs(p.z - z) < 1e-6);
  /** Segment par l'outil Ligne : départ, direction, longueur tapée. */
  const segment = async (depart, vers, longueur) => {
    await page.locator("[data-planche-vue]").focus();
    await page.keyboard.press("l");
    await cliquer(depart);
    await survoler(vers);
    await saisir(longueur);
    await page.keyboard.press("Escape");
  };
  /** Annule jusqu'au brouillon vide, puis rend la main au dessin. */
  const vider = async () => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    for (let i = 0; i < 40 && (await etat()).pas > 0; i++) await page.locator("[data-planche-annuler]").click();
    await page.keyboard.press(" ");
    await page.locator("[data-planche-vue]").focus();
  };
  return { ecran, etat, survoler, cliquer, saisir, consigne, contient, segment, vider };
}

{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx, false);
  const { page } = s;
  const { etat, cliquer, survoler, saisir, vider } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  const selection = async () => {
    await vue.focus();
    await page.keyboard.press("Escape");
    await page.keyboard.press(" ");
    await vue.focus();
  };
  await vue.focus();
  // 1. Deux rectangles, présélectionnés ensemble, poussés en une opération.
  for (const [x0, x1] of [[0, 1], [3, 4]]) {
    await page.keyboard.press("l");
    await survoler({ x: x0 + 0.5, y: 0.5, z: 0 });
    for (const p of [`[${x0};0;0]`, `[${x1};0;0]`, `[${x1};1;0]`, `[${x0};1;0]`, `[${x0};0;0]`]) await saisir(p);
    await page.keyboard.press("Escape");
  }
  await selection();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("p");
  const pas0 = (await etat()).pas;
  await cliquer({ x: 0.5, y: 0.5, z: 0 });
  await survoler({ x: 0.5, y: 0.5, z: 0.5 });
  await saisir("1");
  const e1 = await etat();
  check("Pousser/Tirer sur une face d'une présélection de deux : deux boîtes (12 faces), un pas", e1.faces === 12 && e1.pas === pas0 + 1, JSON.stringify({ faces: e1.faces, pas: e1.pas - pas0, consigne: await page.locator("[data-planche-etat]").first().textContent() }));
  await page.screenshot({ path: `${OUT}/multi-faces.png` });
  // 2. Épaissir un rectangle.
  await vider();
  await page.keyboard.press("l");
  await survoler({ x: 0.5, y: 0.5, z: 0 });
  for (const p of ["[0;0;0]", "[1;0;0]", "[1;1;0]", "[0;1;0]", "[0;0;0]"]) await saisir(p);
  await selection();
  await page.keyboard.press("Alt+Shift+J");
  check("Alt + Maj + J active Épaissir", (await etat()).outil === "epaissir", (await etat()).outil);
  const pas1 = (await etat()).pas;
  await cliquer({ x: 0.5, y: 0.5, z: 0 });
  await survoler({ x: 0.5, y: 0.5, z: 0.1 });
  await saisir("0,2");
  const e2 = await etat();
  check("Épaissir « 0,2 » : volume fermé (6 faces), un pas", e2.faces === 6 && e2.pas === pas1 + 1 && e2.sommets.some((p) => Math.abs(Math.abs(p.z) - 0.2) < 1e-9), JSON.stringify({ faces: e2.faces, pas: e2.pas - pas1, consigne: await page.locator("[data-planche-etat]").first().textContent() }));
  await page.screenshot({ path: `${OUT}/epaissir.png` });
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette d'Épaissir et de l'extrusion multi-faces (lot L21) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
