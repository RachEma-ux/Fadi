/**
 * Recette des outils Profilé (lot L12, D-215), bureau 1536 px et téléphone 390 px :
 * - un catalogue **d'essai** est importé dans l'Atelier (colonne `source` : « Données d'essai, non contractuelles ») ;
 * - Profilé (Maj+Q) : la section vient d'une ligne du catalogue, la pièce de 3,00 m est posée en un pas, sa source est
 *   visible dans l'Info entité ;
 * - Profilés depuis arêtes (Alt+Maj+Q) : section saisie, aperçu au survol, « Poser » → 4 pièces liées en un pas ;
 * - sans catalogue, aucune valeur n'est proposée ; au téléphone, le panneau tient dans l'écran.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-profiles.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-profiles";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const CSV_ESSAI =
  "designation;forme;hauteur_mm;largeur_mm;epaisseur_ame_mm;epaisseur_aile_mm;masse_kg_m;source;edition;page\n" +
  "Rect essai 100x50;rectangle;50;100;;;;Données d'essai, non contractuelles;2026;1\n" +
  "I essai 100;I;100;50;4;6;;Données d'essai, non contractuelles;2026;1\n";

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
  await page.fill('input[name="email"]', `profiles-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · profilés" })).body.id;
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

const piecesDe = (page) =>
  page.evaluate(() => {
    const m = window.fadiPlanche.modele();
    return Object.values(m.racine.occurrences).map((o) => ({ id: o.id, piece: m.definitions[o.definition]?.piece ?? null }));
  });

{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, cliquer, survoler, saisir, consigne, ecran } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  // Profilé : Maj+Q, section du catalogue d'essai.
  await page.keyboard.press("Shift+Q");
  check("Maj+Q active Profilé ; le panneau Profilés s'ouvre", (await etat()).outil === "profile" && (await page.locator("[data-planche-profiles]").count()) === 1, (await etat()).outil);
  check("sans section choisie : la consigne le dit", /Choisissez d'abord une section/.test(await consigne()), await consigne());
  await page.locator("[data-planche-profiles-ligne]").selectOption({ label: "Rect essai 100x50" });
  const etatSection = await page.locator("[data-planche-profiles-section]").textContent();
  check("ligne du catalogue choisie : désignation et source d'essai affichées", /Rect essai 100x50/.test(etatSection ?? "") && /Données d'essai, non contractuelles, 2026, p\. 1, ligne 2/.test(etatSection ?? ""), etatSection);
  await vue.focus();
  const pas0 = (await etat()).pas;
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 0, z: 0 });
  const apercu = await page.evaluate(() => window.fadiPlanche.etatOutil()?.etape);
  await saisir("3");
  const p1 = await piecesDe(page);
  check("pièce de 3,00 m posée en un pas, source du catalogue copiée", p1.length === 1 && Math.abs(p1[0].piece?.longueur - 3) < 1e-9 && p1[0].piece?.source?.genre === "catalogue" && (await etat()).pas === pas0 + 1 && apercu === 2, JSON.stringify({ p1, pas: (await etat()).pas }));
  await page.screenshot({ path: `${OUT}/profile.png` });
  // Info entité : la source est visible.
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  const e = await ecran({ x: 1.5, y: 0, z: 0.025 });
  await page.mouse.click(e.x, e.y, { button: "right" });
  await page.locator('[data-planche-menu-contextuel] [data-planche-menu="info"]').click();
  await page.waitForSelector('[data-planche-panneau="info-entite"]');
  const src = await page.locator("[data-planche-info-source]").textContent().catch(() => "");
  check("Info entité : désignation et source de la pièce", /Données d'essai/.test(src ?? "") && /Rect essai/.test((await page.locator("[data-planche-info-piece]").textContent().catch(() => "")) ?? ""), src);
  await page.keyboard.press("Escape");
  // Profilés depuis arêtes : rectangle d'arêtes à l'écart, sélection des 4 arêtes, section saisie.
  await vue.focus();
  await page.keyboard.press("l");
  // Loin des barres du bas (un clic sous elles toucherait le bouton Maj ou le fil d'Ariane).
  await survoler({ x: 5, y: 1, z: 0 });
  for (const p of ["[5;1;0]", "[8;1;0]", "[8;3;0]", "[5;3;0]", "[5;1;0]"]) await saisir(p);
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  // Double-clic dans la face : la face et ses quatre arêtes (seules les arêtes servent à l'outil).
  const centreFace = await ecran({ x: 6.5, y: 2, z: 0 });
  await page.mouse.dblclick(centreFace.x, centreFace.y);
  await page.waitForTimeout(100);
  const sel = await page.evaluate(() => window.fadiPlanche.selection());
  check("double-clic : la face et ses 4 arêtes sélectionnées", sel.filter((id) => id.startsWith("a")).length === 4, JSON.stringify(sel));
  await page.keyboard.press("Alt+Shift+Q");
  check("Alt+Maj+Q active Profilés depuis arêtes", (await etat()).outil === "profiles-aretes", (await etat()).outil);
  await page.locator("[data-planche-profiles-mode]").selectOption("saisie");
  await page.locator('[data-planche-profiles-champ="largeur"]').fill("80");
  check("dimension manquante : la pose est bloquée et le panneau le dit", /Dimension manquante : hauteur/.test((await page.locator("[data-planche-profiles-section]").textContent()) ?? "") && (await page.locator("[data-planche-profiles-poser]").isDisabled()));
  await page.locator('[data-planche-profiles-champ="hauteur"]').fill("40");
  await vue.focus();
  await survoler({ x: 6.5, y: 2, z: 0 });
  await page.waitForTimeout(150);
  const ap = await page.evaluate(() => window.fadiPlanche.etatOutil()?.apercu?.faces?.length ?? 0);
  check("survol : aperçu des 4 pièces (24 faces), rien d'écrit", ap === 24, String(ap));
  const pas1 = (await etat()).pas;
  await page.locator("[data-planche-profiles-poser]").click();
  const p2 = await piecesDe(page);
  const liees = await page.evaluate(() => Object.keys(window.fadiPlanche.modele().annotations?.pieces ?? {}).length);
  check("« Poser » : 4 pièces de plus, liées à leurs arêtes, en un seul pas", p2.length === 5 && liees === 4 && (await etat()).pas === pas1 + 1, JSON.stringify({ n: p2.length, liees, pas: (await etat()).pas }));
  await page.screenshot({ path: `${OUT}/profiles-aretes.png` });
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

{
  // Téléphone 390 px, projet sans catalogue : aucune valeur proposée, le panneau tient dans l'écran.
  const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  const s = await preparer(ctx, false);
  const { page } = s;
  await s.ouvrirPlanche(true);
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Shift+Q");
  await page.waitForSelector("[data-planche-profiles]");
  const vide = (await page.locator("[data-planche-profiles-vide]").textContent().catch(() => "")) ?? "";
  check("téléphone, sans catalogue : « Aucun catalogue importé », aucune ligne proposée", /Aucun catalogue importé/.test(vide) && (await page.locator("[data-planche-profiles-ligne]").count()) === 0, vide);
  const b = await page.locator("[data-planche-profiles]").boundingBox();
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("téléphone : le panneau tient dans les 390 px, pas de défilement horizontal", !!b && b.x >= 0 && b.x + b.width <= 390 + 0.5 && debord <= 0, JSON.stringify({ b, debord }));
  await page.screenshot({ path: `${OUT}/telephone.png` });
  check("aucune erreur JavaScript (téléphone)", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette des outils Profilé (lot L12) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
