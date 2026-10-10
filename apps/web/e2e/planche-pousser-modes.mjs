/**
 * Recette des modes explicites de Pousser/Tirer (lot Planche 8, D-201), desktop 1536 px puis téléphone 390 px tactile :
 * barre d'options (Normal, Nouvelle face, Étirement, Tube sans fond ; Normal, Des deux côtés, Allonger) ; Alt et Ctrl
 * allument les mêmes boutons ; l'Étirement étire le toit d'un prisme incliné (6 faces) là où Normal ajoute une marche
 * (7 faces) ; au doigt, bouton Étirement puis tirage ; Maj+P depuis Pousser/Tirer choisit Polygone. Brouillon local :
 * aucune commande ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-pousser-modes.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-pousser-modes";
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
  await page.fill('input[name="email"]', `pousser-modes-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · modes" })).body.id;
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

// ————————————————————————————————————————————————————————————— Desktop
const presse = (page, opt, val) => page.locator(`[data-planche-option-valeur="${opt}:${val}"]`).getAttribute("aria-pressed");
{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, survoler, cliquer, saisir, vider } = aides(page);
  await s.ouvrirPlanche();
  await page.locator("[data-planche-vue]").focus();

  /** Boîte 4 × 3 × 2, puis l'arête haute en x = 0 montée de 1 m : toit incliné. */
  const prisme = async () => {
    await vider();
    await page.keyboard.press("r");
    await cliquer({ x: 0, y: 0, z: 0 });
    await survoler({ x: 1, y: 1, z: 0 });
    await saisir("4;3");
    await page.keyboard.press("p");
    await cliquer({ x: 2, y: 1.5, z: 0 });
    await survoler({ x: 2, y: 1.5, z: 1 });
    await saisir("2");
    await page.keyboard.press(" ");
    await cliquer({ x: -5, y: -5, z: 0 });
    await page.keyboard.press("m");
    await cliquer({ x: 0, y: 1.5, z: 2 });
    await page.keyboard.press("ArrowUp");
    await survoler({ x: 0, y: 1.5, z: 2.5 });
    await saisir("1");
    await page.keyboard.press("Escape");
  };
  await prisme();
  let e = await etat();
  check("prisme à toit incliné construit (6 faces, sommet (0;0;3))", e.faces === 6 && e.sommets.some((p) => p.x === 0 && p.z === 3), JSON.stringify({ faces: e.faces }));

  await page.keyboard.press("p");
  check("barre d'options affichée avec Pousser/Tirer", await page.locator("[data-planche-options]").isVisible());
  check("mode Normal actif par défaut", (await presse(page, "face", "normal")) === "true");
  await page.locator('[data-planche-option-valeur="face:etirement"]').click();
  check("bouton Étirement : mode actif (aria-pressed)", (await presse(page, "face", "etirement")) === "true");
  await cliquer({ x: 4, y: 1.5, z: 1 });
  await survoler({ x: 4.5, y: 1.5, z: 1 });
  await page.screenshot({ path: `${OUT}/1-apercu-etirement.png` });
  await saisir("1");
  e = await etat();
  check("Étirement du mur x = 4 de 1 m : toujours 6 faces, plus aucun sommet en x = 4, toit étiré jusqu'à x = 5", e.faces === 6 && !e.sommets.some((p) => Math.abs(p.x - 4) < 1e-6) && e.sommets.some((p) => Math.abs(p.x - 5) < 1e-6), JSON.stringify({ faces: e.faces }));
  await page.screenshot({ path: `${OUT}/2-etirement.png` });

  await page.locator("[data-planche-annuler]").click();
  await page.locator("[data-planche-vue]").focus();
  await page.locator('[data-planche-option-valeur="face:normal"]').click();
  await cliquer({ x: 4, y: 1.5, z: 1 });
  await survoler({ x: 4.5, y: 1.5, z: 1 });
  await saisir("1");
  e = await etat();
  check("Normal sur le même mur : une marche apparaît (7 faces), le toit garde son arête en x = 4", e.faces === 7 && e.sommets.some((p) => Math.abs(p.x - 4) < 1e-6), JSON.stringify({ faces: e.faces }));
  await page.screenshot({ path: `${OUT}/3-normal-marche.png` });

  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Alt");
  check("touche Alt : le bouton Étirement s'allume (même chemin)", (await presse(page, "face", "etirement")) === "true");
  await page.keyboard.press("Control");
  check("touche Ctrl : le bouton Nouvelle face s'allume, Étirement s'éteint", (await presse(page, "face", "nouvelle-face")) === "true" && (await presse(page, "face", "etirement")) === "false");
  await page.locator('[data-planche-option-valeur="face:normal"]').click();
  check("modes d'arête grisés hors d'une arête", await page.locator('[data-planche-option-valeur="arete:deux-cotes"]').isDisabled());

  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Shift+KeyP");
  check("Maj+P depuis Pousser/Tirer : outil Polygone (Maj n'est plus le tube sans fond)", (await etat()).outil === "polygone", (await etat()).outil);

  check("[desktop] aucune commande envoyée (brouillon local)", s.commandes.length === 0, s.commandes.join(" "));
  check("[desktop] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

// ————————————————————————————————————————————————————————————— Téléphone (390 px, tactile)
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, ecran, cliquer, survoler, saisir } = aides(page);
  await s.ouvrirPlanche(true);
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 1, z: 0 });
  await saisir("2;2");
  await page.keyboard.press("p");
  const p0 = await ecran({ x: 1, y: 1, z: 0 });
  await page.touchscreen.tap(p0.x, p0.y);
  await saisir("1");
  const bouton = page.locator('[data-planche-option-valeur="face:etirement"]');
  check("[téléphone] bouton Étirement visible dans la barre d'options", await bouton.isVisible());
  const bo = await page.locator("[data-planche-options]").boundingBox();
  check("[téléphone] la barre d'options tient dans l'écran", !!bo && bo.x >= 0 && bo.x + bo.width <= 390 + 1, JSON.stringify(bo));
  await bouton.tap();
  const p1 = await ecran({ x: 1, y: 1, z: 1 });
  await page.touchscreen.tap(p1.x, p1.y);
  await page.waitForTimeout(80);
  await saisir("1");
  const e = await etat();
  const hmax = Math.max(...e.sommets.map((q) => Math.abs(q.z)));
  check("[téléphone] Étirement au doigt : le dessus monte à 2 m, toujours 6 faces", e.faces === 6 && Math.abs(hmax - 2) < 1e-6, JSON.stringify({ faces: e.faces, hmax }));
  await page.screenshot({ path: `${OUT}/4-telephone.png` });
  check("[téléphone] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(echecs === 0 ? "\nRecette des modes de Pousser/Tirer : tout est vert." : `\nRecette des modes de Pousser/Tirer : ${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
