/**
 * Recette Pousser/Tirer d'arêtes (écart Fadi, D-196 / D-197), desktop 1536 px puis téléphone 390 px tactile :
 * segment tiré vers le haut (↑, « 2,7 ») → face verticale liée ; Alt = des deux côtés ; ↓ = allonger la ligne ;
 * cercle tiré dans son plan → couronne ; déplacer l'arête source → la surface suit (lien) ; au téléphone, flèches de la
 * barre de modificateurs et geste au doigt. Brouillon local : aucune commande ne part ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-pousser-aretes.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-pousser-aretes";
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
  await page.fill('input[name="email"]', `pousser-aretes-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · pousser arêtes" })).body.id;
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

/** Pousser/Tirer actif et barre d'options affichée (lot 8) : elle réduit la zone de dessin, donc les points écran
 * ne sont calculés qu'après ce changement de mise en page (sinon le toucher tombe à côté sur une machine lente). */
async function outilPret(page) {
  await page.locator("[data-planche-options]").waitFor({ state: "visible" });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// ————————————————————————————————————————————————————————————— Desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, survoler, cliquer, saisir, consigne, contient, segment, vider } = aides(page);
  await s.ouvrirPlanche();

  // 1. Segment de 4 m tiré vers le haut : face verticale de 10,8 m², liée à son arête.
  await segment({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, "4");
  let e = await etat();
  check("segment de 4 m tracé", e.aretes === 1 && e.faces === 0, JSON.stringify({ aretes: e.aretes, faces: e.faces }));
  await page.keyboard.press("p");
  await outilPret(page);
  await survoler({ x: 2, y: 0, z: 0 });
  check("survol d'une arête : consigne du mode arêtes", /étendre en surface/.test(await consigne()), await consigne());
  await cliquer({ x: 2, y: 0, z: 0 });
  check("clic sur l'arête : consigne du tirage", /fixer la surface/.test(await consigne()), await consigne());
  await page.keyboard.press("ArrowUp");
  await survoler({ x: 2, y: 0, z: 1 });
  await page.screenshot({ path: `${OUT}/1-apercu-tirage.png` });
  await saisir("2,7");
  e = await etat();
  check("↑ puis « 2,7 » : une face verticale de 10,8 m², liée", e.faces === 1 && e.aires[0] === 10.8 && e.liens === 1, JSON.stringify({ aires: e.aires, liens: e.liens }));
  check("hauteur 2,7 m atteinte", contient(e.sommets, 4, 0, 2.7));
  await page.screenshot({ path: `${OUT}/2-face-verticale.png` });

  // 2. Lien : sélectionner l'arête source seule, puis la déplacer de 1 m vers +y → la surface suit.
  await page.keyboard.press(" ");
  await cliquer({ x: 2, y: 0, z: 0 });
  const sel = await page.evaluate(() => window.fadiPlanche.selection());
  check("Sélection : l'arête source seule", sel.length === 1 && sel[0].startsWith("a"), JSON.stringify(sel));
  await page.keyboard.press("m");
  await cliquer({ x: 2, y: 0, z: 0 });
  await page.keyboard.press("ArrowLeft");
  await survoler({ x: 2, y: 0.5, z: 0 });
  await saisir("1");
  e = await etat();
  check("Déplacer l'arête source de 1 m : la surface suit (arête haute en y = 1, toujours liée)", contient(e.sommets, 0, 1, 2.7) && !contient(e.sommets, 0, 0, 2.7) && e.liens === 1, JSON.stringify({ liens: e.liens, sommets: e.sommets }));
  await page.screenshot({ path: `${OUT}/3-lien-apres-deplacement.png` });

  // 3. Alt = des deux côtés : ← (vert) et « 1 » → 8 m² en deux faces.
  await vider();
  await segment({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, "4");
  await page.keyboard.press("p");
  await outilPret(page);
  await cliquer({ x: 2, y: 0, z: 0 });
  await page.keyboard.press("Alt");
  await page.keyboard.press("ArrowLeft");
  await survoler({ x: 2, y: 1, z: 0 });
  await saisir("1");
  e = await etat();
  check("Alt + ← + « 1 » : surface de −1 à +1 (8 m² en deux faces)", e.faces === 2 && e.aires.every((a) => a === 4) && contient(e.sommets, 0, -1, 0) && contient(e.sommets, 0, 1, 0), JSON.stringify({ aires: e.aires }));
  await page.keyboard.press("Alt");

  // 4. ↓ = le long de l'arête : la ligne de 4 m est allongée de 1 m.
  await vider();
  await segment({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, "4");
  await page.keyboard.press("p");
  await outilPret(page);
  await cliquer({ x: 3.5, y: 0, z: 0 });
  await page.keyboard.press("ArrowDown");
  await survoler({ x: 5, y: 0, z: 0 });
  await saisir("1");
  e = await etat();
  check("↓ puis « 1 » : la ligne passe à 5 m (une arête, aucune face)", e.faces === 0 && e.aretes === 1 && contient(e.sommets, 5, 0, 0), JSON.stringify({ faces: e.faces, aretes: e.aretes, sommets: e.sommets }));

  // 5. Cercle tiré dans son plan → couronne.
  await vider();
  await page.keyboard.press("c");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 0, z: 0 });
  await saisir("1");
  const cercle = await etat();
  check("cercle de rayon 1 posé", cercle.courbes === 1 && cercle.faces === 1, JSON.stringify({ courbes: cercle.courbes, faces: cercle.faces }));
  const milieu = await page.evaluate(() => {
    const c = window.fadiPlanche.modele().racine;
    const k = Object.values(c.courbes)[0];
    const a = c.aretes[k.aretes[0]];
    const A = c.sommets[a.a].position;
    const B = c.sommets[a.b].position;
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  });
  await page.keyboard.press("p");
  await outilPret(page);
  await cliquer({ x: milieu.x, y: milieu.y, z: 0 });
  await survoler({ x: milieu.x * 1.6, y: milieu.y * 1.6, z: 0 });
  await saisir("0,5");
  e = await etat();
  const total = e.aires.reduce((a, b) => a + b, 0);
  const attendu = 24 * Math.cos(Math.PI / 24) ** 2 * 0 + 24 * (Math.cos(Math.PI / 24) + 0.5) ** 2 * Math.tan(Math.PI / 24);
  check("cercle tiré dans son plan de 0,5 : disque + couronne, cercle décalé", e.faces === 2 && e.courbes === 2 && Math.abs(total - attendu) < 1e-6, JSON.stringify({ faces: e.faces, courbes: e.courbes, total, attendu }));
  await page.screenshot({ path: `${OUT}/4-couronne.png` });

  // 6. Cercle tiré par son PÉRIMÈTRE vers le haut → tube (24 faces latérales lisses) posé sur le disque.
  await vider();
  await page.keyboard.press("c");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 0, z: 0 });
  await saisir("1");
  const bord = await page.evaluate(() => {
    const c = window.fadiPlanche.modele().racine;
    const k = Object.values(c.courbes)[0];
    const a = c.aretes[k.aretes[0]];
    const A = c.sommets[a.a].position;
    const B = c.sommets[a.b].position;
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  });
  await page.keyboard.press("p");
  await outilPret(page);
  await cliquer({ x: bord.x, y: bord.y, z: 0 });
  await page.keyboard.press("ArrowUp");
  await survoler({ x: bord.x, y: bord.y, z: 1 });
  await saisir("2");
  e = await etat();
  const lisses = await page.evaluate(() => Object.values(window.fadiPlanche.modele().racine.aretes).filter((a) => a.adoucie).length);
  check("cercle tiré par son périmètre, ↑ « 2 » : tube de 24 faces lisses sur le disque (25 faces), deux cercles", e.faces === 25 && lisses === 24 && e.courbes === 2 && e.liens === 1, JSON.stringify({ faces: e.faces, lisses, courbes: e.courbes, liens: e.liens }));
  await page.screenshot({ path: `${OUT}/6-tube.png` });

  // 7. Tube sans fond : option « Tube sans fond » (lot 8 ; Maj avant), clic DANS le cercle, « 2 » → 24 faces latérales, ni fond ni dessus.
  await vider();
  await page.keyboard.press("c");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 0, z: 0 });
  await saisir("1");
  await page.keyboard.press("p");
  await outilPret(page);
  await page.locator('[data-planche-option-valeur="face:tube"]').click();
  await page.locator("[data-planche-vue]").focus();
  await survoler({ x: 0.2, y: 0.1, z: 0 });
  check("option Tube sans fond : consigne du tube sans fond", /Tube sans fond/.test(await consigne()), await consigne());
  await cliquer({ x: 0.2, y: 0.1, z: 0 });
  await survoler({ x: 0.2, y: 0.1, z: 1 });
  await saisir("2");
  e = await etat();
  const horizontales = await page.evaluate(() => Object.values(window.fadiPlanche.modele().racine.faces).filter((f) => Math.abs(f.normale.z) > 0.5).length);
  check("tube sans fond : 24 faces latérales, aucune face horizontale, lié au cercle", e.faces === 24 && horizontales === 0 && e.liens === 1, JSON.stringify({ faces: e.faces, horizontales, liens: e.liens }));
  await page.screenshot({ path: `${OUT}/7-tube-sans-fond.png` });
  await page.locator('[data-planche-option-valeur="face:normal"]').click();

  check("[desktop] aucune commande envoyée (brouillon local)", s.commandes.length === 0, s.commandes.join(" "));
  check("[desktop] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

// ————————————————————————————————————————————————————————————— Téléphone (390 px, tactile)
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, ecran, saisir, contient, segment } = aides(page);
  await s.ouvrirPlanche(true);
  await segment({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, "3");
  const barre = page.locator("[data-planche-modificateurs]");
  await page.keyboard.press("p");
  await outilPret(page);
  const p = await ecran({ x: 1.5, y: 0, z: 0 });
  await page.touchscreen.tap(p.x, p.y);
  const haut = barre.locator('[data-planche-mod="FlecheHaut"]');
  await haut.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("[téléphone] après le toucher d'une arête, la barre de modificateurs porte ↑ et ↓", (await haut.isVisible()) && (await barre.locator('[data-planche-mod="FlecheBas"]').isVisible()));
  const bm = await barre.boundingBox();
  check("[téléphone] la barre de modificateurs tient dans l'écran avec les flèches", !!bm && bm.x >= 0 && bm.x + bm.width <= 390 + 1, JSON.stringify(bm));
  await haut.tap();
  await saisir("2");
  const e = await etat();
  check("[téléphone] toucher l'arête, ↑ de la barre, « 2 » : face verticale de 6 m²", e.faces === 1 && e.aires[0] === 6 && contient(e.sommets, 3, 0, 2), JSON.stringify({ aires: e.aires, outil: e.outil }));
  await page.screenshot({ path: `${OUT}/5-telephone.png` });
  check("[téléphone] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(echecs === 0 ? "\nRecette Pousser/Tirer d'arêtes : tout est vert." : `\nRecette Pousser/Tirer d'arêtes : ${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
