/**
 * Recette des liens d'extrusion (lot 10b, EX-LINK ; cas L-01 et L-02 de la V1), bureau 1536 px :
 * - une ligne tirée en surface est liée à son arête par défaut ;
 * - avec l'option « Indépendante », la surface est créée sans lien ;
 * - dans un groupe, la consigne dit que les liens n'existent qu'à la racine ;
 * - déplacer l'arête source d'une surface liée la recalcule en un seul pas d'historique (L-01).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-liens.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";
import { revelerPointPlanche } from "./lib-canvas-targets.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-liens";
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
  await page.fill('input[name="email"]', `liens-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · liens" })).body.id;
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
  const liens = () => page.evaluate(() => Object.keys(window.fadiPlanche.modele().annotations?.extrusions ?? {}).length);
  // Ligne de 4 m, tirée de 2 m vers le haut : surface liée.
  await page.keyboard.press("l");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 0, z: 0 });
  await saisir("4");
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await cliquer({ x: 2, y: 0, z: 0 });
  await page.keyboard.press("ArrowUp");
  await saisir("2");
  check("ligne tirée : surface liée à son arête (option « Liée » par défaut)", (await liens()) === 1, String(await liens()));
  // L-01 : déplacer l'arête source (outil Déplacer, flèche haut = axe bleu) recalcule la surface en une seule opération.
  const pasAvant = (await etat()).pas;
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  // L'arête seule, jamais la surface qu'elle porte : visée juste sous le pied du mur (le rendu peut faire gagner la face
  // au pixel près sur l'arête même, et déplacer la surface elle-même rompt le lien — c'est voulu).
  for (const dz of [-0.03, -0.06, 0]) {
    await cliquer({ x: 2, y: 0, z: dz });
    const sel = await page.evaluate(() => window.fadiPlanche.selection());
    if (sel.length === 1 && sel[0].startsWith("a")) break;
    await page.keyboard.press("Escape");
  }
  const selArete = await page.evaluate(() => window.fadiPlanche.selection());
  check("L-01 : l'arête source seule est sélectionnée", selArete.length === 1 && selArete[0].startsWith("a"), JSON.stringify(selArete));
  await page.keyboard.press("m");
  await cliquer({ x: 2, y: 0, z: 0 });
  await survoler({ x: 2, y: 1, z: 0 });
  await saisir("1");
  const apres = await etat();
  check("L-01 : arête source déplacée — surface recalculée, lien gardé, un seul pas d'historique", (await liens()) === 1 && apres.pas === pasAvant + 1 && apres.sommets.every((p) => Math.abs(p.y - 1) < 1e-6), `${await liens()} lien(s), pas ${pasAvant}→${apres.pas}`);
  // « Indépendante » : une seconde ligne tirée sans lien.
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  // Devant le mur (côté caméra) et loin des barres du bas : un clic derrière le mur s'accrocherait à son arête haute.
  await cliquer({ x: 0, y: -2.5, z: 0 });
  await survoler({ x: 1, y: -2.5, z: 0 });
  await saisir("3");
  await page.keyboard.press("Escape");
  check("seconde ligne tracée à l'écart : le premier lien tient", (await liens()) === 1, String(await liens()));
  await page.keyboard.press("p");
  const restaurerVue = await revelerPointPlanche(page, { x: 1, y: -2.5, z: 0 });
  await cliquer({ x: 1, y: -2.5, z: 0 });
  await page.locator('[data-planche-option-valeur="lien:independant"]').click();
  await vue.focus();
  await page.keyboard.press("ArrowUp");
  await saisir("1");
  check("option « Indépendante » : surface créée, aucun nouveau lien", (await liens()) === 1 && (await etat()).faces >= 2, `${await liens()} lien(s), ${(await etat()).faces} face(s), ${await consigne()}`);
  await restaurerVue();
  // L-02 : dans un groupe, la restriction « racine seulement » est dite.
  // Dessiner une arête isolée réellement accessible, puis la suivre par ID.
  // Une coordonnée estimée peut viser le vide après regroupement ou être
  // interceptée par une barre flottante : cela ne doit pas invalider le test métier.
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  const candidatsL02 = [
    [6, 3, 8, 3], [-5, 4, -3, 4], [5, 5, 7, 5],
    [-5, -4, -3, -4], [6, -5, 8, -5], [-6, 1, -4, 1],
  ];
  const accessibleL02 = (q) => page.evaluate((point) => {
    const canvas = document.querySelector("[data-planche-vue] canvas");
    const e = window.fadiPlanche.versEcran(point);
    if (!canvas || !e) return false;
    const b = canvas.getBoundingClientRect();
    const x = b.x + e.x, y = b.y + e.y;
    return [[0,0],[-12,0],[12,0],[0,-12],[0,12]].every(([dx,dy]) =>
      x+dx >= 8 && y+dy >= 8 && x+dx <= innerWidth-8 && y+dy <= innerHeight-8 &&
      document.elementFromPoint(x+dx, y+dy) === canvas);
  }, q);
  const choisirSegmentL02 = async () => {
    for (const [x0,y0,x1,y1] of candidatsL02) {
      const a = { x:x0, y:y0, z:0 }, b = { x:x1, y:y1, z:0 };
      const mid = { x:(x0+x1)/2, y:(y0+y1)/2, z:0 };
      if ((await accessibleL02(a)) && (await accessibleL02(b)) && (await accessibleL02(mid))) return { a, b };
    }
    return null;
  };
  let cibleL02 = await choisirSegmentL02();
  if (!cibleL02) {
    await revelerPointPlanche(page, { x: 7, y: 3, z: 0 });
    cibleL02 = await choisirSegmentL02();
  }
  if (!cibleL02) throw new Error("L-02 : aucun segment isolé entièrement accessible dans la Planche");
  const avantL02 = await page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.aretes));
  await page.keyboard.press("l");
  await cliquer(cibleL02.a);
  await survoler(cibleL02.b);
  await saisir("2");
  await page.keyboard.press("Escape");
  const areteL02 = await page.evaluate((ids) => {
    const c = window.fadiPlanche.modele().racine;
    const ajoutes = Object.values(c.aretes).filter((a) => !ids.includes(a.id));
    if (ajoutes.length !== 1) return { erreur: "Arêtes nouvelles : " + ajoutes.length };
    const e = ajoutes[0], a = c.sommets[e.a]?.position, b = c.sommets[e.b]?.position;
    if (!a || !b) return { erreur: "Sommets introuvables" };
    return { id: e.id, milieu: { x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:(a.z+b.z)/2 } };
  }, avantL02);
  if (!areteL02.id) throw new Error("L-02 : tracé de l'arête témoin échoué : " + JSON.stringify(areteL02));
  await page.keyboard.press(" ");
  await vue.focus();
  await revelerPointPlanche(page, areteL02.milieu);
  await cliquer(areteL02.milieu);
  const selectionL02 = await page.evaluate(() => window.fadiPlanche.selection());
  if (selectionL02.length !== 1 || selectionL02[0] !== areteL02.id)
    throw new Error("L-02 : l'arête créée n'est pas sélectionnée : " + JSON.stringify({ attendu:areteL02.id, selectionL02 }));
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  await revelerPointPlanche(page, areteL02.milieu);
  const milieuEcranL02 = await aides(page).ecran(areteL02.milieu);
  await page.mouse.dblclick(milieuEcranL02.x, milieuEcranL02.y);
  await page.waitForFunction(() => window.fadiPlanche?.dans() !== undefined, null, { timeout: 10000 });
  const groupeL02 = await page.evaluate((id) => {
    const p = window.fadiPlanche, m = p.modele(), dans = p.dans();
    const occ = m.racine.occurrences[dans];
    const def = occ && m.definitions[occ.definition];
    return { dans, aretes: Object.keys(def?.contenu.aretes ?? {}), attendue: id };
  }, areteL02.id);
  if (!groupeL02.aretes.includes(areteL02.id))
    throw new Error("L-02 : arête témoin absente du groupe : " + JSON.stringify(groupeL02));
  await revelerPointPlanche(page, areteL02.milieu);
  await vue.focus();
  await page.keyboard.press("p");
  await cliquer(areteL02.milieu);
  const dansGroupe = await page.evaluate(() => window.fadiPlanche.dans() ?? null);
  const consigneGroupe = await consigne();
  check("L-02 : dans un groupe, la consigne dit « racine de la Planche seulement »",
    dansGroupe !== null && /racine de la Planche seulement/.test(consigneGroupe),
    `${consigneGroupe} dans=${dansGroupe} étape=${await page.evaluate(() => window.fadiPlanche.etatOutil()?.etape ?? null)}`);
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette des liens (lot 10b) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
