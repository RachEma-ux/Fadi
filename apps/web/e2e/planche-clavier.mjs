/**
 * Recette du clavier de la Planche (lot 9, EX-CMD-04 ; cas A-04 et A-06 de la V1), bureau 1536 px : dans Pousser/Tirer,
 * Maj, Ctrl et Alt ne basculent un mode que frappés seuls (appui puis relâchement sans autre touche ni geste). Maj seul
 * rétablit « Surface ouverte » ; Maj + F choisit Suivez-moi sans rien basculer ; Ctrl + Z, Maj + Tab et Ctrl + Alt
 * (AltGr) ne basculent rien ; un clic pendant l'appui consomme la frappe. Barres au clavier (A-07, W3C APG Toolbar) :
 * une halte de tabulation, flèches entre les boutons sans rien envoyer au dessin ; Maj + flèche sur la poignée déplace la
 * barre sans changer de mode (A-08). Aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-clavier.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-clavier";
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
  await page.fill('input[name="email"]', `clavier-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · clavier" })).body.id;
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
  const { etat, cliquer, survoler, saisir, ecran } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  // Boîte 2 × 2 × 1.
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 1, z: 0 });
  await saisir("2;2");
  await page.keyboard.press("p");
  await cliquer({ x: 1, y: 1, z: 0 });
  await saisir("1");
  await page.keyboard.press(" ");
  await vue.focus();
  await page.keyboard.press("Escape");

  for (const id of ["groupe", "composant", "eclater"]) check(`bouton ${id} présent dans la barre d'actions, avec son icône`, (await bouton(page, id).count()) === 1 && ((await bouton(page, id).textContent()) ?? "").trim().length > 0);
  check("rien de sélectionné : Grouper grisé, avec son motif", (await bouton(page, "groupe").isDisabled()) && /sélectionnez d'abord/.test((await bouton(page, "groupe").getAttribute("title")) ?? ""), (await bouton(page, "groupe").getAttribute("title")) ?? "");
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(80);
  check("tout sélectionné : Grouper actif, raccourci dans l'infobulle", !(await bouton(page, "groupe").isDisabled()) && /Ctrl\+G/.test((await bouton(page, "groupe").getAttribute("title")) ?? ""), (await bouton(page, "groupe").getAttribute("title")) ?? "");
  check("géométrie libre : Éclater grisé, « sélectionnez un groupe ou un composant »", (await bouton(page, "eclater").isDisabled()) && /groupe ou un composant/.test((await bouton(page, "eclater").getAttribute("title")) ?? ""));
  const e0 = await ecran({ x: 1, y: 1, z: 1 });
  await page.mouse.click(e0.x, e0.y, { button: "right" });
  await page.waitForTimeout(80);
  check("menu contextuel sur géométrie libre : « Éclater » présent (grisé)", ((await page.evaluate(() => window.fadiPlanche.menu())) ?? []).includes("eclater"));
  await page.keyboard.press("Escape");
  await vue.focus();
  await page.keyboard.press("Control+a");
  await bouton(page, "groupe").click();
  await page.waitForTimeout(80);
  check("bouton Grouper : un groupe à la racine, sélectionné", (await objets(page)) === 1 && (await page.evaluate(() => window.fadiPlanche.selection().length)) === 1);
  check("objet sélectionné : Éclater actif, raccourci Ctrl+Maj+G", !(await bouton(page, "eclater").isDisabled()) && /Ctrl\+Maj\+G/.test((await bouton(page, "eclater").getAttribute("title")) ?? ""), (await bouton(page, "eclater").getAttribute("title")) ?? "");
  await page.screenshot({ path: `${OUT}/1-barre-objets.png` });
  await vue.focus();
  await page.keyboard.press("Control+Shift+G");
  await page.waitForTimeout(80);
  check("Ctrl+Maj+G : le groupe est éclaté, la boîte revient (6 faces)", (await objets(page)) === 0 && (await etat()).faces === 6, JSON.stringify({ objets: await objets(page), faces: (await etat()).faces }));
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  check("Ctrl+G : regroupé", (await objets(page)) === 1);
  check("barre d'actions : nom visible sous l'icône (« Grouper », « Composant », « Éclater »)", ((await bouton(page, "groupe").textContent()) ?? "").includes("Grouper") && ((await bouton(page, "eclater").textContent()) ?? "").includes("Éclater"));
  // « Outils ▾ » : groupe « Objets » ; Éclater depuis la liste.
  await page.locator("[data-planche-outils-bouton]").click();
  await page.locator('[data-outils-famille="objets"]').click();
  const depuisListe = page.locator('[data-outils-commande="eclater"]');
  check("« Outils ▾ » : groupe Objets avec Éclater et son raccourci", (await depuisListe.count()) === 1 && /Ctrl\+Maj\+G/.test((await depuisListe.textContent()) ?? ""), (await depuisListe.textContent()) ?? "");
  await depuisListe.click();
  await page.waitForTimeout(80);
  check("Éclater depuis « Outils ▾ » : géométrie libre", (await objets(page)) === 0);
  await vue.focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);

  // Control appuyé avant G dans Pousser/Tirer, sélection vide : « Nouvelle face » ne reste pas allumée.
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  check("Pousser/Tirer, Ctrl+G refusé : « Nouvelle face » reste éteinte", (await page.evaluate(() => window.fadiPlanche.etatOutil()?.nouvelleFace)) === false, String(await page.evaluate(() => window.fadiPlanche.etatOutil()?.nouvelleFace)));

  // Surface liée à son arête, puis groupée : la rupture du lien est annoncée.
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  await page.keyboard.press("l");
  await cliquer({ x: 0, y: 4, z: 0 });
  await survoler({ x: 1, y: 4, z: 0 });
  await saisir("3");
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await cliquer({ x: 1.5, y: 4, z: 0 });
  await page.keyboard.press("ArrowUp");
  await saisir("2");
  check("surface tirée de son arête : un lien", (await etat()).liens === 1, String((await etat()).liens));
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  check("grouper la surface liée : rupture du lien annoncée", (await etat()).liens === 0 && /deviennent indépendantes/.test(await message(page)), await message(page));
  check("[desktop] aucune commande envoyée (brouillon local)", s.commandes.length === 0, s.commandes.join(" "));
  check("[desktop] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}


{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { cliquer, survoler, saisir } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  const mode = () => page.evaluate(() => { const e = window.fadiPlanche.etatOutil() ?? {}; return e.sansFond ? "tube" : e.etirement ? "etirement" : e.nouvelleFace ? "nouvelle-face" : "normal"; });
  const outil = () => page.evaluate(() => window.fadiPlanche.outil());
  // Un carré au sol, puis Pousser/Tirer.
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 1, z: 0 });
  await saisir("2;2");
  await page.keyboard.press("p");
  await page.waitForTimeout(60);
  check("Pousser/Tirer actif, mode Normal", (await outil()) === "pousser-tirer" && (await mode()) === "normal", `${await outil()} ${await mode()}`);
  await page.keyboard.press("Shift");
  await page.waitForTimeout(40);
  check("Maj frappé seul : « Surface ouverte »", (await mode()) === "tube", await mode());
  const tube = page.locator('[data-planche-option-valeur="face:tube"]');
  check("barre d'options : Surface ouverte enfoncée, raccourci Maj en infobulle", (await tube.getAttribute("aria-pressed")) === "true" && /\(Maj\)/.test((await tube.getAttribute("title")) ?? ""), (await tube.getAttribute("title")) ?? "");
  await page.keyboard.press("Shift");
  await page.waitForTimeout(40);
  check("Maj frappé seul à nouveau : retour au mode Normal", (await mode()) === "normal", await mode());
  await page.keyboard.press("Control");
  check("Ctrl frappé seul : « Conserver la face de départ »", (await mode()) === "nouvelle-face", await mode());
  await page.keyboard.press("Control");
  await page.keyboard.press("Alt");
  check("Alt frappé seul : Étirement", (await mode()) === "etirement", await mode());
  await page.keyboard.press("Alt");
  // A-06 : Ctrl + Z, Ctrl + Maj + Z, Maj + Tab, Ctrl + Alt ne basculent rien.
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  check("A-06 : Ctrl + Z et Ctrl + Maj + Z ne basculent aucun mode", (await mode()) === "normal", await mode());
  await vue.focus();
  await page.keyboard.press("Shift+Tab");
  await vue.focus();
  check("A-06 : Maj + Tab ne bascule pas « Surface ouverte »", (await mode()) === "normal", await mode());
  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await page.keyboard.up("Alt");
  await page.keyboard.up("Control");
  check("A-06 : Ctrl + Alt (AltGr) ne bascule rien", (await mode()) === "normal", await mode());
  // Un geste du pointeur pendant l'appui consomme la frappe (Ctrl tenu pendant un clic).
  await page.keyboard.down("Control");
  await cliquer({ x: 5, y: 5, z: 0 });
  await page.keyboard.up("Control");
  check("Ctrl tenu pendant un clic : aucune bascule", (await mode()) === "normal", await mode());
  // A-04 : Maj + F choisit Suivez-moi, sans bascule intermédiaire.
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(60);
  const apres = await outil();
  check("A-04 : Maj + F choisit Suivez-moi, aucune bascule de Pousser/Tirer en chemin", apres !== "pousser-tirer" && /suivez|suivre/.test(apres), apres);
  await page.keyboard.press("p");
  check("retour à Pousser/Tirer : mode Normal intact", (await mode()) === "normal", await mode());
  // A-07 : barres au clavier (W3C APG Toolbar) — une halte de tabulation, flèches entre les boutons, rien au dessin.
  const rail = page.locator(".planche-outils[role='toolbar']");
  const haltes = () => rail.evaluate((b) => [...b.querySelectorAll("button")].filter((x) => x.closest('[role="toolbar"]') === b && x.tabIndex === 0).length);
  check("A-07 : rail d'outils — une seule halte de tabulation", (await haltes()) === 1, String(await haltes()));
  await rail.locator("button[tabindex='0']").first().focus();
  const avantFleche = await page.evaluate(() => document.activeElement?.textContent ?? "");
  await page.keyboard.press("ArrowDown");
  const apresFleche = await page.evaluate(() => document.activeElement?.textContent ?? "");
  check("A-07 : flèche bas — le focus passe au bouton suivant du rail, toujours une seule halte", avantFleche !== apresFleche && (await haltes()) === 1 && (await page.evaluate(() => document.activeElement?.closest(".planche-outils") !== null)), `${avantFleche} → ${apresFleche}`);
  check("A-07 : la flèche n'a pas atteint l'outil (aucun verrou d'axe)", await page.evaluate(() => (window.fadiPlanche.etatOutil()?.fleche ?? null) === null));
  // A-08 : Maj + flèche sur la poignée de la barre d'actions déplace la barre, sans changer de mode.
  await page.keyboard.press("Escape");
  await vue.focus();
  await page.keyboard.press("p");
  const poignee = page.locator("[data-barre-actions-poignee]");
  const avantBarre = await page.locator("[data-barre-actions]").boundingBox();
  await poignee.focus();
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  const apresBarre = await page.locator("[data-barre-actions]").boundingBox();
  check("A-08 : Maj + flèche sur la poignée — la barre bouge, Pousser/Tirer reste en mode Normal", apresBarre.x > avantBarre.x && (await mode()) === "normal", `${avantBarre.x} → ${apresBarre.x}, ${await mode()}`);
  // Revue #120 : un clic hors du dessin (bouton « ? » de la barre d'état) pendant que Maj est tenue consomme la frappe.
  await vue.focus();
  await page.keyboard.down("Shift");
  await page.locator(`.planche-bas button[title="${await page.evaluate(() => document.querySelector(".planche-bas button.lien")?.getAttribute("title") ?? "")}"]`).first().click();
  await page.keyboard.up("Shift");
  await page.waitForTimeout(40);
  check("Maj tenue pendant un clic sur un bouton de l'interface : aucun mode basculé", (await mode()) === "normal", await mode());
  check("aucune commande envoyée (brouillon local)", s.commandes.length === 0, String(s.commandes.length));
  check("aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\nRecette du clavier (lot 9) : ${echecs === 0 ? "verte" : `${echecs} échec(s)`}.`);
process.exit(echecs === 0 ? 0 : 1);
