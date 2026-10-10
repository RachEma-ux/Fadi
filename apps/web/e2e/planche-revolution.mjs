/**
 * Recette Révolution (lot 10d, EX-RV-01 à 04 ; cas R-01 et R-04 de la V1), bureau 1536 px :
 * - la Révolution est une méthode de Suivez-moi (Maj+F puis Alt seul), pas un outil de plus ;
 * - axe = arête présélectionnée ; survoler le profil montre l'aperçu (segments et écart de facettage annoncés) ;
 * - un clic tourne le profil (+360°, 48 segments) ; « 90 » puis « 96s » au champ Mesures corrigent depuis le profil
 *   d'origine en remplaçant le dernier pas (R-04).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-revolution.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-revolution";
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
  await page.fill('input[name="email"]', `revolution-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · révolution" })).body.id;
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
  // Profil : rectangle vertical 2 × 2 dans le plan XZ (x de 1 à 3), tapé en coordonnées absolues.
  await page.keyboard.press("l");
  await survoler({ x: 2, y: 0, z: 0 });
  for (const p of ["[1;0;0]", "[3;0;0]", "[3;0;2]", "[1;0;2]", "[1;0;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  // Axe : arête verticale (0;0;0) → (0;0;2).
  await page.keyboard.press("l");
  await survoler({ x: 0, y: 0, z: 1 });
  for (const p of ["[0;0;0]", "[0;0;2]"]) await saisir(p);
  await page.keyboard.press("Escape");
  const a = await etat();
  check("préparation : profil (1 face) et axe (5 arêtes en tout)", a.faces === 1 && a.aretes === 5, JSON.stringify({ faces: a.faces, aretes: a.aretes }));
  // Présélection de l'axe, Suivez-moi (Maj+F), méthode Révolution (Alt seul).
  await page.keyboard.press(" ");
  await vue.focus();
  await cliquer({ x: 0, y: 0, z: 1 });
  const sel = await page.evaluate(() => window.fadiPlanche.selection());
  check("axe présélectionné (une arête)", sel.length === 1 && sel[0].startsWith("a"), JSON.stringify(sel));
  await page.keyboard.press("Shift+F");
  await page.keyboard.press("Alt");
  const e0 = await page.evaluate(() => window.fadiPlanche.etatOutil());
  check("Maj+F puis Alt seul : Suivez-moi en méthode Révolution", (await etat()).outil === "suivez-moi" && e0?.methode === "revolution", JSON.stringify({ outil: (await etat()).outil, methode: e0?.methode }));
  check("options Méthode, Capuchons et « Résultat en nouveau groupe » dans la barre d'options", (await page.locator('[data-planche-option-valeur="methode:revolution"]').count()) === 1 && (await page.locator('[data-planche-option-valeur="groupe:oui"]').count()) === 1);
  // Aperçu au survol du profil.
  const pas0 = (await etat()).pas;
  await survoler({ x: 2, y: 0, z: 1 });
  await page.waitForTimeout(150);
  const ap = await page.evaluate(() => window.fadiPlanche.etatOutil()?.apercu?.faces?.length ?? 0);
  check("survol du profil : aperçu de 192 faces, segments et écart de facettage annoncés, modèle inchangé", ap === 192 && /48 segments, écart de facettage/.test(await consigne()) && (await etat()).pas === pas0, `${ap} ${await consigne()}`);
  await page.screenshot({ path: `${OUT}/apercu.png` });
  // Validation, puis corrections R-04.
  await cliquer({ x: 2, y: 0, z: 1 });
  const b = await etat();
  check("clic : corps de révolution (192 faces), un pas d'historique", b.faces === 192 && b.pas === pas0 + 1, JSON.stringify({ faces: b.faces, pas: b.pas }));
  await page.screenshot({ path: `${OUT}/tour-complet.png` });
  check("l'axe présélectionné reste sélectionné : la consigne demande déjà le profil suivant", /cliquez sur le profil/.test(await consigne()), await consigne());
  await saisir("90");
  const c = await etat();
  check("« 90 » : quart de tour (12 segments + 2 coiffes), dernier pas remplacé", c.faces === 4 * 12 + 2 && c.pas === b.pas, JSON.stringify({ faces: c.faces, pas: c.pas }));
  await saisir("96s");
  const d = await etat();
  check("« 96s » : régénéré depuis le profil d'origine (24 segments + 2 coiffes), dernier pas remplacé", d.faces === 4 * 24 + 2 && d.pas === b.pas, JSON.stringify({ faces: d.faces, pas: d.pas }));
  await page.screenshot({ path: `${OUT}/quart-96.png` });
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette Révolution (lot 10d) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
