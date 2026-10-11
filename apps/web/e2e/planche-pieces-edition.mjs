/**
 * Recette de l'édition des pièces (lot L17, D-219), bureau 1536 px :
 * - une pièce posée (Profilé depuis arête), sélectionnée seule : le bloc « Édition de la pièce » paraît ;
 * - section saisie 200 × 100 appliquée (bouton puis Alt+Maj+S) : section remplacée, axe et métadonnées gardés ;
 * - rotation axiale : 90° au bouton, puis Alt+Maj+H (180°) ; Ctrl + Z la défait ;
 * - Alt+Maj+F active « Aligner une face » ; aucune commande envoyée, aucune erreur.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-pieces-edition.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-pieces-edition";
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
  await page.fill('input[name="email"]', `pieces-edition-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · édition des pièces" })).body.id;
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
  const { etat, cliquer, survoler, saisir } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  const selection = async () => {
    await vue.focus();
    await page.keyboard.press("Escape");
    await page.keyboard.press(" ");
    await vue.focus();
  };
  const dimensions = async (l, h) => {
    await page.locator("[data-planche-profiles-mode]").selectOption("saisie");
    await page.locator('[data-planche-profiles-champ="largeur"]').fill(l);
    await page.locator('[data-planche-profiles-champ="hauteur"]').fill(h);
  };
  await vue.focus();
  // 1. Une arête de 3 m, une pièce 100 × 100 posée dessus.
  await page.keyboard.press("l");
  await survoler({ x: 1, y: 0, z: 0 });
  for (const p of ["[0;0;0]", "[3;0;0]"]) await saisir(p);
  await selection();
  await cliquer({ x: 1.5, y: 0, z: 0 });
  await page.keyboard.press("Alt+Shift+Q");
  await dimensions("100", "100");
  await page.locator("[data-planche-profiles-poser]").click();
  const [p0] = await pieces(page);
  check("une pièce 100 × 100 posée", (await pieces(page)).length === 1 && !!p0?.piece, "");
  // 2. Sélection de la pièce seule : le bloc d'édition paraît. Sous charge (CI), le clic ne doit partir qu'une fois l'outil
  // Sélection actif, et la sélection est attendue (un second clic si le premier n'a rien pris) avant de juger le bloc.
  await selection();
  await page.waitForFunction(() => window.fadiPlanche.outil() === "selection", null, { timeout: 10000 });
  await cliquer({ x: 1.5, y: 0, z: 0.05 });
  const choisie = () => page.waitForFunction(() => (window.fadiPlanche.selection?.() ?? []).length > 0, null, { timeout: 5000 }).then(() => true, () => false);
  if (!(await choisie())) {
    await cliquer({ x: 1.5, y: 0, z: 0.05 });
    await choisie();
  }
  const bloc = page.locator("[data-planche-piece-edition]");
  await bloc.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("pièce sélectionnée : bloc « Édition de la pièce » visible", await bloc.isVisible(), JSON.stringify(await page.evaluate(() => window.fadiPlanche.selection?.() ?? null)));
  // 3. Section 200 × 100 appliquée au bouton.
  await dimensions("200", "100");
  const pas0 = (await etat()).pas;
  await page.locator('[data-planche-commande="piece-section"]').click();
  const [p1] = await pieces(page);
  check(
    "Appliquer la section : section remplacée, longueur gardée, un pas",
    !!p1 && JSON.stringify(p1.piece.section) !== JSON.stringify(p0.piece.section) && Math.abs(p1.piece.longueur - p0.piece.longueur) < 1e-9 && (await etat()).pas === pas0 + 1,
    JSON.stringify({ pas: (await etat()).pas - pas0, consigne: await page.locator("[data-planche-etat]").first().textContent() }),
  );
  // Alt+Maj+S : même chemin au clavier (section 100 × 100 de retour).
  await dimensions("100", "100");
  await vue.focus();
  await page.keyboard.press("Alt+Shift+S");
  const [p2] = await pieces(page);
  check("Alt+Maj+S applique la section choisie", !!p2 && JSON.stringify(p2.piece.section) === JSON.stringify(p0.piece.section), "");
  // 4. Rotation axiale : 90° au bouton, puis Alt+Maj+H.
  await page.locator("[data-planche-piece-angle]").fill("90");
  await page.locator('[data-planche-commande="piece-rotation"]').click();
  const r1 = (await pieces(page))[0]?.piece.placement.rotationAxe;
  check("Rotation axiale 90° au bouton", r1 === 90, String(r1));
  await vue.focus();
  await page.keyboard.press("Alt+Shift+H");
  const r2 = (await pieces(page))[0]?.piece.placement.rotationAxe;
  check("Alt+Maj+H : 180° autour de l'axe", r2 === 180, String(r2));
  await page.screenshot({ path: `${OUT}/edition-piece.png` });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  const r3 = (await pieces(page))[0]?.piece.placement.rotationAxe;
  check("Ctrl + Z : la dernière rotation est défaite (90°)", r3 === 90, String(r3));
  // 5. Aligner une face.
  await selection();
  await page.keyboard.press("Alt+Shift+F");
  check("Alt+Maj+F active Aligner une face", (await etat()).outil === "aligner-face", (await etat()).outil);
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette de l'édition des pièces (lot L17) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
