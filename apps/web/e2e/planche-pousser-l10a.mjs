/**
 * Recette du lot 10a (Pousser/Tirer complet : état et nombres), bureau 1536 px : A-10 (valeur refusée puis valide, face
 * gardée, un seul pas d'historique), A-11 (Ctrl + Z pendant un aperçu : abandon explicite), P-16 (Inverser le sens au
 * bouton, appliqué une seule fois). « Jusqu'à une face » (P-04), les nombres non finis (P-17), l'aperçu troué (P-09) et la
 * boucle concave (P-13) sont couverts par les tests du noyau (`pousser-tirer-l10a.test.ts`).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-pousser-l10a.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-pousser-l10a";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

async function preparer(contexte) {
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
  await page.fill('input[name="email"]', `l10a-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · L10a" })).body.id;
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

const bouton = (page, id) => page.locator(`[data-planche-commande="${id}"]`);
const objets = (page) => page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length);
const message = (page) => page.locator("[data-planche-etat]").first().textContent().then((t) => t ?? "");

{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, cliquer, survoler, saisir, consigne } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  const zMax = () => page.evaluate(() => Math.max(...Object.values(window.fadiPlanche.modele().racine.sommets).filter((x) => x.position.x < 5).map((x) => x.position.z)));
  const zMin = () => page.evaluate(() => Math.min(...Object.values(window.fadiPlanche.modele().racine.sommets).filter((x) => x.position.x < 5).map((x) => x.position.z)));
  const champ = () => page.locator("[data-planche-mesures] input, input[data-planche-mesures]").first().inputValue().catch(() => "");
  // Sol 4 × 3 en z = 0, plateau parallèle à 75 mm plus loin (rectangle tracé puis monté par le noyau via Déplacer).
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 1, z: 0 });
  await saisir("4;3");
  await page.keyboard.press("Escape");
  // A-10 : valeur refusée (0) puis valeur valide : la face reste acquise, une seule opération.
  await page.keyboard.press("p");
  await cliquer({ x: 1, y: 1, z: 0 });
  await saisir("0");
  const apresZero = await etat();
  check("A-10 : distance nulle refusée, la face reste acquise (étape 2), message", apresZero.etape === 2 && /nulle/.test(await consigne()), `${apresZero.etape} ${await consigne()}`);
  await saisir("1");
  check("A-10 : puis 1 m — appliqué, un seul pas d'historique", Math.abs((await zMax()) - 1) < 1e-6 && (await etat()).pas === 2, `${await zMax()} pas ${(await etat()).pas}`);
  // A-11 : Ctrl + Z pendant un aperçu — l'aperçu est abandonné, le message le dit.
  await cliquer({ x: 1, y: 1, z: 1 });
  await survoler({ x: 1, y: 1.2, z: 1.5 });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(60);
  check("A-11 : Ctrl + Z pendant l'aperçu — abandon explicite, l'outil repart de zéro", (await etat()).etape === 1 && /abandonnée/.test(await consigne()), await consigne());
  // P-16 : Inverser le sens (bouton de la barre d'options) puis 0,5 : appliqué vers le bas, une seule fois.
  await vue.focus();
  await cliquer({ x: 1, y: 1, z: 0 });
  await page.locator('[data-planche-option-valeur="sens:inverse"]').click();
  await vue.focus();
  await saisir("0.5");
  check("P-16 : Inversé puis 0,5 — creusé de 0,5 m sous le sol", Math.abs((await zMin()) + 0.5) < 1e-6, String(await zMin()));
  check("P-16 : le sens revient à Direct après l'opération", (await page.locator('[data-planche-option-valeur="sens:direct"]').getAttribute("aria-pressed")) === "true");
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette Pousser/Tirer (lot 10a) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
