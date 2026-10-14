/**
 * Recette Suivez-moi complet (lot 10c, EX-FM-01, EX-FM-06, EX-PREV-01 ; cas F-04 et F-08 de la V1), bureau 1536 px :
 * - un profil à trou balayé le long d'un chemin fermé : la paroi intérieure suit le trou ;
 * - survoler le profil montre l'aperçu calculé par le noyau (trous compris) sans rien écrire ;
 * - l'option « Capuchons » est proposée dans la barre d'options et bascule ;
 * - l'outil s'active par son raccourci Maj+F.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-suivez-moi.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-suivez-moi";
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
  await page.fill('input[name="email"]', `suivez-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · suivez-moi" })).body.id;
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
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, cliquer, survoler, saisir, consigne } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  // Chemin : rectangle 4 × 3 au sol.
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await saisir("4;3");
  await page.keyboard.press("Escape");
  // Profil vertical dans le plan x = 0 : carré de 2 m percé d'un carré de 0,8 m (assez grand pour viser l'anneau loin des arêtes) (coordonnées absolues tapées).
  await page.keyboard.press("l");
  await cliquer({ x: 0, y: 0, z: 0 });
  for (const p of ["[0;0;2]", "[0;-2;2]", "[0;-2;0]", "[0;0;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  // Le départ du trou est tapé lui aussi : un clic dans la face s'accrocherait à son arête.
  await page.keyboard.press("l");
  await survoler({ x: 0, y: -1, z: 1 });
  for (const p of ["[0;-0,6;0,6]", "[0;-0,6;1,4]", "[0;-1,4;1,4]", "[0;-1,4;0,6]", "[0;-0,6;0,6]"]) await saisir(p);
  await page.keyboard.press("Escape");
  const a = await etat();
  const percee = await page.evaluate(() => Object.values(window.fadiPlanche.modele().racine.faces).filter((f) => f.trous.length === 1).length);
  check("préparation : chemin + profil percé (une face à un trou, son bouchon, le sol)", a.faces === 3 && percee === 1, JSON.stringify({ faces: a.faces, percee }));
  // Zoom optique réel : la couronne du profil doit être plus large que le rayon
  // d’accrochage de 10 px dans le canevas intégré (dimensions du profil inchangées).
  await vue.focus();
  await page.keyboard.press("z");
  await saisir("20");
  await page.keyboard.press("Escape");
  // Chemin présélectionné, outil par son raccourci Maj+F.
  await page.keyboard.press(" ");
  await vue.focus();
  await cliquer({ x: 2, y: 1.5, z: 0 });
  await page.keyboard.press("Shift+F");
  check("Maj+F active Suivez-moi", (await etat()).outil === "suivez-moi", (await etat()).outil);
  check("option « Capuchons » dans la barre d'options (Avec par défaut)", (await page.locator('[data-planche-option-valeur="bouchons:avec"]').count()) === 1 && (await page.locator('[data-planche-option-valeur="bouchons:sans"]').count()) === 1);
  await page.locator('[data-planche-option-valeur="bouchons:sans"]').click();
  check("« Sans » : l'option bascule", (await page.evaluate(() => window.fadiPlanche.etatOutil()?.bouchons)) === false);
  await page.locator('[data-planche-option-valeur="bouchons:avec"]').click();
  await vue.focus();
  // EX-PREV-01 : survol de l'anneau du profil — aperçu du noyau, trous compris, rien d'écrit.
  const pasAvant = (await etat()).pas;
  await survoler({ x: 0, y: -0.3, z: 1 });
  await page.waitForTimeout(150);
  const ap = await page.evaluate(() => {
    const e = window.fadiPlanche.etatOutil();
    return e?.apercu ? { faces: e.apercu.faces.length, profil: e.apercu.profil } : null;
  });
  check("survol du profil : aperçu calculé (parois extérieures et intérieures), modèle inchangé", !!ap && ap.faces >= 32 && (await etat()).pas === pasAvant && (await etat()).faces === a.faces, `${JSON.stringify(ap)} ${await consigne()}`);
  await page.screenshot({ path: `${OUT}/apercu.png` });
  // F-08 : clic — le trou est balayé, l'outil reste actif.
  await cliquer({ x: 0, y: -0.3, z: 1 });
  const b = await etat();
  check("clic : 16 parois extérieures + 16 intérieures (le trou suit le chemin), un pas d'historique", b.faces - a.faces >= 30 && b.pas === pasAvant + 1, JSON.stringify({ faces: b.faces, pas: b.pas, consigne: await consigne() }));
  check("l'outil reste actif après le balayage", b.outil === "suivez-moi", b.outil);
  await page.screenshot({ path: `${OUT}/balaye.png` });
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette Suivez-moi complet (lot 10c) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
