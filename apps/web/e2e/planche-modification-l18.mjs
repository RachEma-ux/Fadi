/**
 * Recette des compléments des outils de modification (lot L18, D-220), bureau 1536 px :
 * - Décalage d'une face à trous (F, « 0,5 ») : contour et trou décalés ensemble (faces 1, 3, 5, 7 m²) ;
 * - option Chevauchement : Refusé par défaut, Alt frappé seul → Autorisé ;
 * - Instructeur : statut de relevé affiché à chaque touche modificatrice (écarts Fadi compris) ;
 * - Déplacer : poignée de rotation du dessus d'un groupe, « 90 » → le groupe pivote de 90° ;
 * - Retourner (Maj+V) sur ce groupe : Alt → option Axes « De l'objet ».
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-modification-l18.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-modification-l18";
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
  await page.fill('input[name="email"]', `modif-l18-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · modification L18" })).body.id;
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

const pieces = (page) =>
  page.evaluate(() => {
    const m = window.fadiPlanche.modele();
    return Object.values(m.racine.occurrences).map((o) => ({ id: o.id, piece: m.definitions[o.definition]?.piece ?? null }));
  });
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
  const presse = (id) => page.locator(`[data-planche-option-valeur="${id}"]`).getAttribute("aria-pressed");
  await vue.focus();
  // 1. Carré 4 × 4 percé d'un carré 1 × 1 centré.
  await page.keyboard.press("l");
  await survoler({ x: 1, y: 1, z: 0 });
  for (const p of ["[0;0;0]", "[4;0;0]", "[4;4;0]", "[0;4;0]", "[0;0;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  for (const p of ["[1,5;1,5;0]", "[2,5;1,5;0]", "[2,5;2,5;0]", "[1,5;2,5;0]", "[1,5;1,5;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  const avant = (await etat()).aires.slice().sort((a, b) => a - b);
  check("carré percé : face percée de 15 m² et carré intérieur de 1 m²", JSON.stringify(avant) === "[1,15]", JSON.stringify(avant));
  // 2. Décalage de la face percée : 0,5 vers l'intérieur.
  await selection();
  await page.keyboard.press("f");
  check("F active Décalage ; option Chevauchement « Refusé » par défaut", (await etat()).outil === "decalage" && (await presse("chevauchement:refuse")) === "true", (await etat()).outil);
  await cliquer({ x: 0.5, y: 0.5, z: 0 });
  await survoler({ x: 1, y: 1, z: 0 });
  await saisir("0,5");
  const apres = (await etat()).aires.slice().sort((a, b) => a - b);
  check("« 0,5 » : contour et trou décalés ensemble — faces 1, 3, 5, 7 m²", JSON.stringify(apres) === "[1,3,5,7]", JSON.stringify(apres));
  await page.keyboard.press("Alt");
  await page.waitForTimeout(80);
  check("Alt frappé seul : Chevauchement « Autorisé »", (await presse("chevauchement:autorise")) === "true", String(await presse("chevauchement:autorise")));
  // 3. Instructeur : statut de relevé de chaque touche modificatrice.
  await page.locator('[data-planche-panneau-icone="instructeur"]').click();
  const statuts = await page.locator('[data-planche-panneau="instructeur"] [data-statut-modificateur]').evaluateAll((els) => els.map((e) => e.getAttribute("data-statut-modificateur")));
  check("Instructeur (Décalage) : statut de relevé affiché par touche (Alt = écart Fadi)", statuts.length >= 1 && statuts.includes("fadi"), JSON.stringify(statuts));
  await page.screenshot({ path: `${OUT}/decalage-trous.png` });
  await page.locator('[data-planche-panneau-icone="instructeur"]').click();
  // 4. Déplacer : poignée de rotation d'un groupe.
  await vider();
  await page.keyboard.press("l");
  await survoler({ x: 1, y: 1, z: 0 });
  for (const p of ["[0;0;0]", "[2;0;0]", "[2;1;0]", "[0;1;0]", "[0;0;0]"]) await saisir(p);
  await selection();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(100);
  const occ = await page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.occurrences));
  check("groupe créé et sélectionné", occ.length === 1 && JSON.stringify(await page.evaluate(() => window.fadiPlanche.selection())) === JSON.stringify(occ), JSON.stringify({ occ, sel: await page.evaluate(() => window.fadiPlanche.selection()) }));
  await vue.focus();
  await page.keyboard.press("m");
  const pas0 = (await etat()).pas;
  await cliquer({ x: 1.5, y: 0.5, z: 0 });
  await survoler({ x: 1, y: 1.5, z: 0 });
  await page.screenshot({ path: `${OUT}/poignee-rotation.png` });
  await saisir("90");
  const T = await page.evaluate((id) => window.fadiPlanche.modele().racine.occurrences[id]?.transformation ?? null, occ[0]);
  check("poignée de rotation, « 90 » : le groupe pivote de 90° autour de la verticale, un pas", !!T && Math.abs(T[0]) < 1e-9 && Math.abs(Math.abs(T[4]) - 1) < 1e-9 && (await etat()).pas === pas0 + 1, JSON.stringify({ T, pas: (await etat()).pas - pas0, consigne: await page.locator("[data-planche-etat]").first().textContent() }));
  // 5. Retourner sur le groupe : Alt → axes de l'objet.
  await vue.focus();
  await page.keyboard.press("Shift+V");
  check("Maj+V active Retourner ; option Axes « Du contexte »", (await etat()).outil === "retourner" && (await presse("axes:contexte")) === "true", (await etat()).outil);
  await page.keyboard.press("Alt");
  await page.waitForTimeout(80);
  check("Alt frappé seul : Axes « De l'objet »", (await presse("axes:objet")) === "true", JSON.stringify({ objet: await presse("axes:objet"), sel: await page.evaluate(() => window.fadiPlanche.selection()), consigne: await page.locator("[data-planche-etat]").first().textContent() }));
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette des compléments de modification (lot L18) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
