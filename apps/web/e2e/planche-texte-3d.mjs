/**
 * Recette du Texte 3D (lot L16, D-218), bureau 1536 px :
 * - aperçu en volume (capture) puis pose : même boîte englobante, épaisseur = extrusion ;
 * - alignement « Centre » : le texte est centré sur le point ;
 * - pose sur une face verticale : le texte est dans le plan du mur, extrudé vers l'extérieur.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-texte-3d.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-texte-3d";
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
  await page.fill('input[name="email"]', `texte3d-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · texte 3D" })).body.id;
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

const boite = (page, ids) =>
  page.evaluate((ids) => {
    const m = window.fadiPlanche.modele();
    const res = [];
    for (const id of ids) {
      const o = m.racine.occurrences[id];
      const T = o.transformation;
      const c = m.definitions[o.definition].contenu;
      for (const s of Object.values(c.sommets)) {
        const p = s.position;
        res.push([T[0] * p.x + T[1] * p.y + T[2] * p.z + T[3], T[4] * p.x + T[5] * p.y + T[6] * p.z + T[7], T[8] * p.x + T[9] * p.y + T[10] * p.z + T[11]]);
      }
    }
    const b = (k) => [Math.min(...res.map((p) => p[k])), Math.max(...res.map((p) => p[k]))];
    return { x: b(0), y: b(1), z: b(2) };
  }, ids);

{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx, false);
  const { page } = s;
  const { survoler, cliquer, saisir } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  const texte3d = async (texte) => {
    await vue.focus();
    await page.keyboard.press("Shift+Z");
    await page.waitForSelector("[data-planche-texte3d]");
    await page.locator("[data-planche-texte3d-texte]").fill(texte);
    await page.locator("[data-planche-texte3d-ok]").click();
    await vue.focus();
  };
  const occurrences = () => page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.occurrences));
  // 1. Au sol : aperçu en volume, puis pose.
  await texte3d("FADI");
  await survoler({ x: 1, y: 1, z: 0 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/apercu-volume.png` });
  await cliquer({ x: 1, y: 1, z: 0 });
  const o1 = await occurrences();
  const b1 = await boite(page, o1);
  check("pose au sol : un composant, épaisseur = extrusion (0,15 m), commence au point", o1.length === 1 && Math.abs(b1.z[1] - b1.z[0] - 0.15) < 1e-6 && Math.abs(b1.x[0] - 1) < 0.05, JSON.stringify(b1));
  // 2. Alignement centre.
  await page.keyboard.press("Escape");
  await texte3d("AB");
  await page.locator('[data-planche-option-valeur="alignement:centre"]').click();
  await vue.focus();
  await cliquer({ x: 6, y: 1, z: 0 });
  const o2 = (await occurrences()).filter((x) => !o1.includes(x));
  const b2 = await boite(page, o2);
  check("alignement « Centre » : le texte est centré sur le point (x = 6)", o2.length === 1 && Math.abs((b2.x[0] + b2.x[1]) / 2 - 6) < 0.05, JSON.stringify(b2));
  // 3. Sur une face verticale : rectangle vertical dessiné à la Ligne (plan y = 3, face à la caméra par défaut).
  await page.keyboard.press("Escape");
  await vue.focus();
  await page.keyboard.press("l");
  await survoler({ x: 8, y: 3, z: 0 });
  for (const p of ["[6;3;0]", "[10;3;0]", "[10;3;3]", "[6;3;3]", "[6;3;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  await texte3d("MUR");
  await cliquer({ x: 7, y: 3, z: 1.5 });
  const o3 = (await occurrences()).filter((x) => !o1.includes(x) && !o2.includes(x));
  const b3 = await boite(page, o3);
  check("sur la face verticale : texte dans le plan du mur (épaisseur 0,15 selon y), lettres verticales, posé sur la face", o3.length === 1 && Math.abs(b3.y[1] - b3.y[0] - 0.15) < 1e-6 && b3.z[1] - b3.z[0] > 0.2 && Math.min(Math.abs(b3.y[0] - 3), Math.abs(b3.y[1] - 3)) < 1e-6, JSON.stringify(b3));
  await page.screenshot({ path: `${OUT}/sur-face.png` });
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette du Texte 3D (lot L16) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
