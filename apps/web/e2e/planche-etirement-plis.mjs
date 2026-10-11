/**
 * Recette de l'Étirement à plis (lot L20, D-222), bureau 1536 px : un carré 4 × 4 percé d'un carré 1 × 1 au sol ; la
 * face intérieure étirée de 0,5 m (Pousser/Tirer, option Étirement) plie la face percée en facettes planes (arêtes de
 * pli créées), le trou reste ouvert (P-07) ; Ctrl + Z défait le tout en un pas.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-etirement-plis.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-etirement-plis";
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
  await page.fill('input[name="email"]', `plis-l20-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · étirement à plis" })).body.id;
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
  const { etat, cliquer, survoler, saisir } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  await page.keyboard.press("l");
  await survoler({ x: 1, y: 1, z: 0 });
  for (const p of ["[0;0;0]", "[4;0;0]", "[4;4;0]", "[0;4;0]", "[0;0;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  for (const p of ["[1,5;1,5;0]", "[2,5;1,5;0]", "[2,5;2,5;0]", "[1,5;2,5;0]", "[1,5;1,5;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  const avant = await etat();
  check("carré percé et carré intérieur (2 faces)", avant.faces === 2, String(avant.faces));
  await page.keyboard.press("p");
  await page.locator('[data-planche-option-valeur="face:etirement"]').click();
  await vue.focus();
  const pas0 = (await etat()).pas;
  await cliquer({ x: 2, y: 2, z: 0 });
  await survoler({ x: 2, y: 2, z: 0.3 });
  await saisir("0,5");
  const apres = await etat();
  const plis = await page.evaluate(() => {
    const m = window.fadiPlanche.modele();
    const c = m.racine;
    const pos = (id) => c.sommets[id].position;
    return Object.values(c.faces).map((f) => {
      const pts = [f.exterieur, ...f.trous].flat().map(pos);
      const d = f.normale.x * pts[0].x + f.normale.y * pts[0].y + f.normale.z * pts[0].z;
      return pts.every((p) => Math.abs(f.normale.x * p.x + f.normale.y * p.y + f.normale.z * p.z - d) < 1e-6);
    });
  });
  check("P-07 : la face percée est pliée en facettes planes, un seul pas", apres.faces > 2 && plis.every(Boolean) && apres.pas === pas0 + 1, JSON.stringify({ faces: apres.faces, plis, pas: apres.pas - pas0, consigne: await page.locator("[data-planche-etat]").first().textContent() }));
  check("arêtes de pli créées", apres.aretes > avant.aretes, `${avant.aretes} → ${apres.aretes}`);
  check("la face intérieure a quitté le sol de 0,5 m", apres.sommets.some((p) => Math.abs(Math.abs(p.z) - 0.5) < 1e-9), "");
  await page.screenshot({ path: `${OUT}/plis.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  check("Ctrl + Z : le pli est défait en un pas (2 faces)", (await etat()).faces === 2, String((await etat()).faces));
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette de l'Étirement à plis (lot L20) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
