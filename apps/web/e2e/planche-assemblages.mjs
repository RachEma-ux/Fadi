import { pointVisiblePlanche } from "./lib-cible-planche.mjs";
/**
 * Recette des assemblages de pièces (lot L13, D-216), bureau 1536 px :
 * - cadre de quatre pièces posées sans onglet sur un rectangle d'arêtes, puis recoupées deux à deux par l'outil Onglet
 *   (Alt+Maj+O) : angles de 45° enregistrés ; Ctrl + Z défait le dernier onglet ;
 * - coupe d'un poteau par une poutre (Coupe par profil, Alt+Maj+B, moteur manifold-3d) : volume réduit, métadonnées
 *   gardées ; Ctrl + Z la défait ;
 * - Allonger une pièce (Alt+Maj+A) : « 0,25 » au champ Mesures.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-assemblages.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-assemblages";
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
  await page.fill('input[name="email"]', `assemblages-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · assemblages" })).body.id;
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
  const ecran = (q) => pointVisiblePlanche(page, q);

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
  const { etat, cliquer, survoler, saisir, ecran } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  // Focus d'abord sur la vue : après « Poser », Espace sur le bouton le cliquerait encore.
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
  // 1. Cadre : rectangle d'arêtes 3 × 2, quatre pièces 100 × 100 sans onglet (bouts droits, d'angle en angle).
  await page.keyboard.press("l");
  await survoler({ x: 1, y: 1, z: 0 });
  for (const p of ["[0;0;0]", "[3;0;0]", "[3;2;0]", "[0;2;0]", "[0;0;0]"]) await saisir(p);
  await selection();
  const c = await ecran({ x: 1.5, y: 1, z: 0 });
  await page.mouse.dblclick(c.x, c.y);
  await page.waitForTimeout(100);
  await page.keyboard.press("Alt+Shift+Q");
  await dimensions("100", "100");
  await page.locator('[data-planche-option-valeur="onglets:non"]').click();
  await page.locator("[data-planche-profiles-poser]").click();
  const cadre = await pieces(page);
  check("cadre : 4 pièces posées sans onglet", cadre.length === 4 && cadre.every((p) => !p.piece.coupeDebut && !p.piece.coupeFin), String(cadre.length));
  // 2. Onglet aux quatre coins (dessus des pièces, z = 0,05).
  await vue.focus();
  await page.keyboard.press("Alt+Shift+O");
  check("Alt+Maj+O active Onglet", (await etat()).outil === "onglet", (await etat()).outil);
  const milieux = [{ x: 1.5, y: 0, z: 0.05 }, { x: 3, y: 1, z: 0.05 }, { x: 1.5, y: 2, z: 0.05 }, { x: 0, y: 1, z: 0.05 }];
  const pas0 = (await etat()).pas;
  for (let k = 0; k < 4; k++) {
    await cliquer(milieux[k]);
    await cliquer(milieux[(k + 1) % 4]);
  }
  const apres = await pieces(page);
  const angles = apres.flatMap((p) => [p.piece.coupeDebut?.angle, p.piece.coupeFin?.angle]);
  check("quatre onglets : chaque extrémité coupée à 45°, un pas par onglet", angles.length === 8 && angles.every((a) => Math.abs(a - 45) < 1e-6) && (await etat()).pas === pas0 + 4, JSON.stringify({ angles, pas: (await etat()).pas - pas0 }));
  await page.screenshot({ path: `${OUT}/cadre-onglets.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  const defait = (await pieces(page)).flatMap((p) => [p.piece.coupeDebut?.angle, p.piece.coupeFin?.angle]).filter((a) => a !== undefined);
  check("Ctrl + Z : le dernier onglet est défait (6 coupes restent)", defait.length === 6, String(defait.length));
  // 3. Coupe d'un poteau par une poutre : arête verticale (poteau 200 × 200) et arête horizontale décalée (poutre 100 × 100).
  await selection();
  await page.keyboard.press("l");
  await survoler({ x: 6, y: 0, z: 0 });
  for (const p of ["[6;0;0]", "[6;0;3]"]) await saisir(p);
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await survoler({ x: 5, y: 0, z: 0 });
  for (const p of ["[5;0,04;2]", "[7;0,04;2]"]) await saisir(p);
  await selection();
  await cliquer({ x: 6, y: 0, z: 0.8 });
  await page.keyboard.press("Alt+Shift+Q");
  await dimensions("200", "200");
  await page.locator('[data-planche-option-valeur="onglets:oui"]').click();
  await page.locator("[data-planche-profiles-poser]").click();
  await selection();
  await cliquer({ x: 5.3, y: 0.04, z: 2 });
  await page.keyboard.press("Alt+Shift+Q");
  await dimensions("100", "100");
  await page.locator("[data-planche-profiles-poser]").click();
  const avant = await pieces(page);
  check("poteau et poutre posés (6 pièces en tout)", avant.length === 6, String(avant.length));
  await selection();
  await page.keyboard.press("Alt+Shift+B");
  await page.waitForFunction(() => window.fadiPlanche.booleens() === "ok", null, { timeout: 30000 });
  const pasC = (await etat()).pas;
  await cliquer({ x: 6, y: -0.1, z: 1 });
  await cliquer({ x: 5.3, y: 0.04, z: 2.05 });
  const coupe = await pieces(page);
  const poteau = coupe.find((p) => p.piece.coupesProfil === 1);
  check("Coupe par profil : le poteau est recoupé (coupesProfil = 1), métadonnées gardées, un pas", !!poteau && poteau.piece.designation.length > 0 && (await etat()).pas === pasC + 1 && coupe.length === 6, JSON.stringify({ n: coupe.length, pas: (await etat()).pas - pasC, consigne: await page.locator("[data-planche-etat]").first().textContent() }));
  await page.screenshot({ path: `${OUT}/coupe-poteau.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  check("Ctrl + Z : la coupe est défaite", !(await pieces(page)).some((p) => p.piece.coupesProfil), "");
  // 4. Allonger une pièce : la poutre, extrémité x = 7, de 0,25 m.
  await selection();
  await page.keyboard.press("Alt+Shift+A");
  check("Alt+Maj+A active Allonger une pièce", (await etat()).outil === "allonger-piece", (await etat()).outil);
  await cliquer({ x: 6.8, y: 0.04, z: 2.05 });
  await saisir("0,25");
  const poutre = (await pieces(page)).find((p) => Math.abs(p.piece.placement.decalageFin - 0.25) < 1e-9 || Math.abs(p.piece.placement.decalageDebut - 0.25) < 1e-9);
  check("« 0,25 » : la poutre est allongée à l'extrémité visée", !!poutre, "");
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette des assemblages (lot L13) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
