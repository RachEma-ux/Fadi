/**
 * Recette du lot Objets O-1 (D-203), desktop 1536 px puis téléphone 390 px tactile : Grouper, Créer un composant et
 * Éclater ont leur icône et leur bouton dans la barre d'actions, avec leur raccourci dans l'infobulle ; un bouton grisé
 * dit pourquoi ; Ctrl + G groupe, Ctrl + Maj + G éclate ; « Éclater » reste au menu, grisé, sur de la géométrie libre ;
 * grouper une surface liée à son arête annonce la rupture du lien ; Control appuyé avant G ne laisse plus « Nouvelle
 * face » allumée dans Pousser/Tirer. Objets O-2 : fil d'Ariane cliquable (Planche › …), Fermer (Maj+Échap) et Fermer
 * tout (Maj+Origine), objet verrouillé non ouvrable, statut « Liée aux arêtes sources » et « Détacher le lien » ; au
 * téléphone, le fil se superpose sans redimensionner le dessin. Objets O-3 : Rendre unique (Alt+Maj+U) nomme « #1 » puis
 * « #2 » ; Diviser en segments (Alt+Maj+C) n'apparaît dans la barre qu'avec une courbe sélectionnée. Objets O-4 : groupe
 * vide (Alt+Maj+G) ouvert aussitôt et jamais purgé, « Déplacer vers un groupe… » (Alt+Maj+V) sans bouger à l'écran,
 * Renommer (F2) en place au Navigateur, glisser-déposer dans le Navigateur. Objets O-5 : Isoler (Alt+Maj+I) puis
 * Quitter l'isolement restaure la vue sans rien écrire au modèle ; Masquer le reste du modèle (Alt+Maj+R) dans un groupe
 * ouvert, levé au retour à la racine. Brouillon local : aucune commande ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-objets.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures/planche-objets";
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
  await page.fill('input[name="email"]', `objets-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "planche-pass-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(projets|accueil)/);
  const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
  const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · objets" })).body.id;
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

// ————————————————————————————————————————————————————————————— Desktop
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

// ————————————————————————————————————————————————————————————— Objets O-2 : contexte lisible (desktop)
{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, cliquer, survoler, saisir, ecran } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  const dans = () => page.evaluate(() => window.fadiPlanche.dans() ?? null);
  // Boîte 2 × 2 × 1 groupée, puis le groupe dans un groupe (Établi › Cadre).
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
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  check("[O-2] aucun fil d'Ariane à la racine", (await page.locator("[data-planche-fil]").count()) === 0);
  const sommet = await ecran({ x: 1, y: 1, z: 1 });
  await page.waitForTimeout(700); // sinon le navigateur compte un triple-clic
  await page.mouse.dblclick(sommet.x, sommet.y);
  await page.waitForTimeout(100);
  const fil = page.locator("[data-planche-fil]");
  check("[O-2] double-clic : objet ouvert, fil d'Ariane « Planche › … » avec l'étape courante marquée", (await dans()) !== null && (await fil.count()) === 1 && (await fil.locator('[aria-current="page"]').count()) === 1 && /Planche/.test((await fil.textContent()) ?? ""), (await fil.textContent()) ?? "");
  check("[O-2] Fermer et Fermer tout dans le fil, avec leur raccourci en infobulle", /Maj\+Échap/.test((await fil.locator('[data-planche-commande="fermer"]').getAttribute("title")) ?? "") && /Maj\+Origine/.test((await fil.locator('[data-planche-commande="fermer-tout"]').getAttribute("title")) ?? ""));
  await page.waitForTimeout(700); // sinon le navigateur compte un triple-clic
  await page.mouse.dblclick(sommet.x, sommet.y);
  await page.waitForTimeout(100);
  check("[O-2] second double-clic : le groupe intérieur est ouvert (trois étapes)", (await fil.locator("li").count()) === 3, String(await fil.locator("li").count()));
  await page.screenshot({ path: `${OUT}/3-contexte-ouvert.png` });
  await page.keyboard.press("Shift+Escape");
  await page.waitForTimeout(80);
  check("[O-2] Maj+Échap : remonte d'un niveau", (await fil.locator("li").count()) === 2, String(await fil.locator("li").count()));
  await page.waitForTimeout(700); // sinon le navigateur compte un triple-clic
  await page.mouse.dblclick(sommet.x, sommet.y);
  await page.waitForTimeout(100);
  await page.keyboard.press("Shift+Home");
  await page.waitForTimeout(80);
  check("[O-2] Maj+Origine : retour à la racine, fil d'Ariane fermé", (await dans()) === null && (await fil.count()) === 0);
  await page.waitForTimeout(700); // sinon le navigateur compte un triple-clic
  await page.mouse.dblclick(sommet.x, sommet.y);
  await page.waitForTimeout(100);
  await fil.locator('[data-planche-fil-etape="racine"]').click();
  await page.waitForTimeout(80);
  check("[O-2] clic sur « Planche » dans le fil : racine", (await dans()) === null);
  // Objet verrouillé : le double-clic le sélectionne sans l'ouvrir.
  await vue.focus();
  await page.keyboard.press("Control+a");
  await page.mouse.click(sommet.x, sommet.y, { button: "right" });
  await page.locator('[data-planche-menu-contextuel] [data-planche-menu="verrouiller"]').click();
  await page.waitForTimeout(80);
  await page.waitForTimeout(700); // sinon le navigateur compte un triple-clic
  await page.mouse.dblclick(sommet.x, sommet.y);
  await page.waitForTimeout(100);
  check("[O-2] objet verrouillé : double-clic sans ouverture", (await dans()) === null && (await page.evaluate(() => window.fadiPlanche.selection().length)) === 1);
  // Surface liée à son arête : statut « Liée aux arêtes sources », puis « Détacher le lien ».
  await page.keyboard.press("Escape");
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
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  await cliquer({ x: 1.5, y: 4, z: 1 });
  check("[O-2] face de la surface sélectionnée : statut « Liée aux arêtes sources »", (await page.locator("[data-planche-lien]").count()) === 1);
  const surface = await ecran({ x: 1.5, y: 4, z: 1 });
  await page.mouse.click(surface.x, surface.y, { button: "right" });
  const detacher = page.locator('[data-planche-menu-contextuel] [data-planche-menu="detacher-lien"]');
  check("[O-2] menu : « Détacher le lien »", (await detacher.count()) === 1);
  await detacher.click();
  await page.waitForTimeout(80);
  check("[O-2] Détacher le lien : relation supprimée, statut retiré, message", (await etat()).liens === 0 && (await page.locator("[data-planche-lien]").count()) === 0 && /Lien détaché/.test(await message(page)), await message(page));
  check("[O-2] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

// ————————————————————————————————————————————————————————————— Objets O-3 : Rendre unique « #k », Diviser en segments (desktop)
{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { etat, cliquer, survoler, saisir } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  const noms = () => page.evaluate(() => Object.values(window.fadiPlanche.modele().definitions).map((d) => d.nom).sort().join(","));
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 1, z: 0 });
  await saisir("2;2");
  await page.keyboard.press(" ");
  await vue.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  const unique = bouton(page, "rendre-unique");
  check("[O-3] Rendre unique dans la barre d'actions, grisé sur un objet unique, avec le motif", (await unique.count()) === 1 && (await unique.isDisabled()) && /déjà unique/.test((await unique.getAttribute("title")) ?? ""), (await unique.getAttribute("title")) ?? "");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(80);
  check("[O-3] copie collée : Rendre unique actif, raccourci Alt+Maj+U", !(await unique.isDisabled()) && /Alt\+Maj\+U/.test((await unique.getAttribute("title")) ?? ""), (await unique.getAttribute("title")) ?? "");
  const base = await noms();
  await page.keyboard.press("Alt+Shift+KeyU");
  await page.waitForTimeout(80);
  check("[O-3] Alt+Maj+U : copie unique « Nom#1 », annoncée", (await noms()) === `${base},${base}#1` && (await message(page)).includes(`${base}#1`), `${await noms()} — ${await message(page)}`);
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(80);
  await unique.click();
  await page.waitForTimeout(80);
  check("[O-3] seconde copie rendue unique : « Nom#2 », jamais « #1#1 »", (await noms()) === `${base},${base}#1,${base}#2`, await noms());
  // Diviser en segments : cercle de rayon 1, une arête sélectionnée, la commande apparaît dans la barre.
  await page.keyboard.press("Escape");
  await vue.focus();
  check("[O-3] Diviser en segments absent de la barre sans courbe sélectionnée", (await bouton(page, "diviser-courbe").count()) === 0);
  await page.keyboard.press("c");
  await cliquer({ x: 6, y: 0, z: 0 });
  await survoler({ x: 7, y: 0, z: 0 });
  await saisir("1");
  await page.keyboard.press("Escape");
  await page.keyboard.press(" ");
  await vue.focus();
  const avant = await etat();
  check("[O-3] cercle tracé : une courbe à la racine", avant.courbes === 1, String(avant.courbes));
  await cliquer({ x: 6, y: 1, z: 0 });
  await page.waitForTimeout(80);
  const segments = bouton(page, "diviser-courbe");
  check("[O-3] arête de cercle sélectionnée : « Diviser en segments » et « Diviser » dans la barre d'actions", (await segments.count()) === 1 && (await bouton(page, "diviser").count()) === 1 && /Alt\+Maj\+C/.test((await segments.getAttribute("title")) ?? ""), (await segments.getAttribute("title")) ?? "");
  await page.keyboard.press("Alt+Shift+KeyC");
  await page.waitForTimeout(80);
  const apres = await etat();
  check("[O-3] Alt+Maj+C : la courbe devient des segments, arêtes et faces inchangées, message", apres.courbes === 0 && apres.aretes === avant.aretes && apres.faces === avant.faces && /segments/.test(await message(page)), `${apres.courbes} courbe(s), ${apres.aretes}/${avant.aretes} arêtes — ${await message(page)}`);
  await page.locator("[data-planche-outils-bouton]").click();
  await page.locator('[data-outils-famille="objets"]').click();
  const listees = await page.locator("[data-outils-commande]").evaluateAll((l) => l.map((b) => b.getAttribute("data-outils-commande")));
  check("[O-3] « Outils ▾ » : Rendre unique, Diviser et Diviser en segments listés avec leur raccourci", ["rendre-unique", "diviser", "diviser-courbe"].every((id) => listees.includes(id)) && /Alt\+Maj\+D/.test((await page.locator('[data-outils-commande="diviser"]').textContent()) ?? ""), listees.join(","));
  await page.keyboard.press("Escape");
  check("[O-3] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await page.screenshot({ path: `${OUT}/5-o3.png` });
  await ctx.close();
}

// ————————————————————————————————————————————————————————————— Objets O-4 : groupe vide, Déplacer vers…, Renommer, glisser-déposer (desktop)
{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { cliquer, survoler, saisir } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  const dans = () => page.evaluate(() => window.fadiPlanche.dans() ?? null);
  const racine = () => page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.occurrences));
  const monde = () =>
    page.evaluate(() => {
      // Sommets monde de toutes les faces (racine et objets), arrondis : « rien n'a bougé à l'écran ».
      const m = window.fadiPlanche.modele();
      const r = [];
      const mul = (A, B) => A.map((_, i) => { const l = Math.floor(i / 4), c = i % 4; let x = 0; for (let k = 0; k < 4; k++) x += A[l * 4 + k] * B[k * 4 + c]; return x; });
      const app = (M, p) => [M[0] * p.x + M[1] * p.y + M[2] * p.z + M[3], M[4] * p.x + M[5] * p.y + M[6] * p.z + M[7], M[8] * p.x + M[9] * p.y + M[10] * p.z + M[11]];
      const parcourir = (c, M) => {
        for (const f of Object.values(c.faces)) for (const s of f.exterieur) r.push(app(M, c.sommets[s].position).map((x) => x.toFixed(6)).join(","));
        for (const o of Object.values(c.occurrences)) parcourir(m.definitions[o.definition].contenu, mul(M, o.transformation));
      };
      parcourir(m.racine, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      return r.sort().join(";");
    });
  // Groupe vide : Alt + Maj + G, ouvert aussitôt.
  await page.keyboard.press("Alt+Shift+KeyG");
  await page.waitForTimeout(80);
  const boite = await dans();
  check("[O-4] Alt+Maj+G : groupe vide créé et ouvert, annoncé", boite !== null && (await racine()).length === 1 && /Groupe vide créé/.test(await message(page)), await message(page));
  await page.keyboard.press("Shift+Escape");
  await page.waitForTimeout(80);
  check("[O-4] refermé vide : il reste dans le modèle (pas de purge)", (await dans()) === null && (await racine()).includes(boite));
  // Un objet à la racine, rangé dans le groupe vide par « Déplacer vers un groupe… ».
  await page.keyboard.press("r");
  await cliquer({ x: 3, y: 0, z: 0 });
  await survoler({ x: 4, y: 1, z: 0 });
  await saisir("1;1");
  await page.keyboard.press(" ");
  await vue.focus();
  await page.keyboard.press("Escape");
  await cliquer({ x: 3.5, y: 0.5, z: 0 });
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  const objet = (await page.evaluate(() => window.fadiPlanche.selection()))[0];
  const avant = await monde();
  await page.keyboard.press("Alt+Shift+KeyV");
  await page.waitForTimeout(80);
  const dialogue = page.locator("[data-planche-deplacer]");
  check("[O-4] Alt+Maj+V : « Déplacer vers un groupe » liste le groupe vide (pas l'objet lui-même)", (await dialogue.count()) === 1 && (await dialogue.locator(`[data-planche-deplacer-cible="${boite}"]`).count()) === 1 && (await dialogue.locator(`[data-planche-deplacer-cible="${objet}"]`).count()) === 0);
  await dialogue.locator(`[data-planche-deplacer-cible="${boite}"]`).click();
  await page.waitForTimeout(80);
  const range = await page.evaluate(([b, o]) => { const m = window.fadiPlanche.modele(); return !!m.definitions[m.racine.occurrences[b].definition].contenu.occurrences[o]; }, [boite, objet]);
  check("[O-4] objet rangé dans le groupe, sans bouger à l'écran, annoncé", range && (await racine()).length === 1 && (await monde()) === avant && /sans bouger/.test(await message(page)), await message(page));
  // Renommer : F2 ouvre le Navigateur sur l'objet sélectionné.
  await vue.focus();
  await cliquer({ x: 3.5, y: 0.5, z: 0 });
  await page.keyboard.press("F2");
  await page.waitForTimeout(80);
  const champ = page.locator("[data-planche-navigateur-nom]");
  check("[O-4] F2 : Navigateur ouvert, champ de nom en place", (await champ.count()) === 1);
  await champ.fill("Établi");
  await champ.press("Enter");
  await page.waitForTimeout(80);
  check("[O-4] renommé « Établi »", await page.evaluate((b) => window.fadiPlanche.modele().racine.occurrences[b].nom === "Établi", boite));
  const barre = page.locator("[data-planche-navigateur-barre]");
  check("[O-4] barre du Navigateur : Nouveau groupe vide, Déplacer vers…, Renommer, avec leur raccourci", (await barre.locator("[data-planche-commande]").count()) === 3 && /Alt\+Maj\+G/.test((await barre.locator('[data-planche-commande="groupe-vide"]').getAttribute("title")) ?? "") && /F2/.test((await barre.locator('[data-planche-commande="renommer"]').getAttribute("title")) ?? ""));
  // Glisser-déposer : l'objet sort du groupe vers la racine.
  await page.locator(`[data-planche-navigateur-objet="${boite}"] .planche-deplier`).click();
  const ligne = page.locator(`[data-planche-navigateur-objet="${objet}"]`);
  check("[O-4] l'objet rangé apparaît sous « Établi » dans le Navigateur", (await ligne.count()) === 1);
  await ligne.dragTo(page.locator("[data-planche-navigateur-racine]"));
  await page.waitForTimeout(120);
  check("[O-4] glissé sur « Planche (racine) » : l'objet revient à la racine, sans bouger", (await racine()).includes(objet) && (await monde()) === avant, (await racine()).join(","));
  await page.locator(`[data-planche-navigateur-objet="${objet}"]`).dragTo(page.locator(`[data-planche-navigateur-objet="${boite}"]`));
  await page.waitForTimeout(120);
  check("[O-4] glissé sur « Établi » : rangé dedans", !(await racine()).includes(objet) && (await monde()) === avant, (await racine()).join(","));
  check("[O-4] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await page.screenshot({ path: `${OUT}/6-o4.png` });
  await ctx.close();
}

// ————————————————————————————————————————————————————————————— Objets O-5 : Isoler, Masquer le reste du modèle (desktop)
{
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { cliquer, survoler, saisir, ecran } = aides(page);
  await s.ouvrirPlanche();
  const vue = page.locator("[data-planche-vue]");
  await vue.focus();
  const rendues = () => page.evaluate(() => window.fadiPlanche.facesRendues());
  const masquees = () => page.evaluate(() => JSON.stringify(window.fadiPlanche.modele()).split('"masquee":true').length - 1);
  // Deux carrés groupés séparément et un troisième libre.
  for (const x of [0, 3, 6]) {
    await page.keyboard.press("r");
    await cliquer({ x, y: 0, z: 0 });
    await survoler({ x: x + 1, y: 1, z: 0 });
    await saisir("1;1");
    await page.keyboard.press(" ");
    await vue.focus();
    await page.keyboard.press("Escape");
    if (x < 6) {
      await cliquer({ x: x + 0.5, y: 0.5, z: 0 });
      await page.keyboard.press("Control+g");
      await page.waitForTimeout(60);
      await page.keyboard.press("Escape");
    }
  }
  const toutes = await rendues();
  check("[O-5] trois carrés rendus, Isoler absent de la barre sans sélection", toutes === 3 && (await bouton(page, "isoler").count()) === 0, String(toutes));
  // Masquer le carré libre avant l'isolement : il devra le rester après.
  await cliquer({ x: 6.5, y: 0.5, z: 0 });
  const libre = await ecran({ x: 6.5, y: 0.5, z: 0 });
  await page.mouse.click(libre.x, libre.y, { button: "right" });
  await page.locator('[data-planche-menu-contextuel] [data-planche-menu="masquer"]').click();
  await page.waitForTimeout(80);
  const avantIsolement = await masquees();
  await cliquer({ x: 0.5, y: 0.5, z: 0 });
  check("[O-5] objet sélectionné : Isoler dans la barre d'actions, raccourci Alt+Maj+I", (await bouton(page, "isoler").count()) === 1 && /Alt\+Maj\+I/.test((await bouton(page, "isoler").getAttribute("title")) ?? ""));
  await page.keyboard.press("Alt+Shift+KeyI");
  await page.waitForTimeout(80);
  check("[O-5] Alt+Maj+I : seul l'objet isolé est rendu, bandeau d'isolement, bouton enfoncé", (await rendues()) === 1 && (await page.locator("[data-planche-isolement]").count()) === 1 && (await bouton(page, "isoler").getAttribute("aria-pressed")) === "true", String(await rendues()));
  check("[O-5] l'isolement n'écrit rien dans le modèle", (await masquees()) === avantIsolement);
  await page.locator("[data-planche-isolement-quitter]").click();
  await page.waitForTimeout(80);
  check("[O-5] Quitter l'isolement : la vue revient telle qu'avant (le carré masqué avant reste masqué)", (await rendues()) === 2 && (await page.locator("[data-planche-isolement]").count()) === 0 && (await masquees()) === avantIsolement, String(await rendues()));
  // Masquer le reste du modèle : dans un groupe ouvert, le reste disparaît au lieu d'être délavé.
  const sommet = await ecran({ x: 0.5, y: 0.5, z: 0 });
  await page.waitForTimeout(700); // sinon le navigateur compte un triple-clic
  await page.mouse.dblclick(sommet.x, sommet.y);
  await page.waitForTimeout(100);
  const reste = page.locator('[data-planche-fil] [data-planche-commande="masquer-reste"]');
  check("[O-5] dans un groupe : bouton « Masquer le reste du modèle » dans le fil d'Ariane, raccourci Alt+Maj+R", (await reste.count()) === 1 && /Alt\+Maj\+R/.test((await reste.getAttribute("title")) ?? "") && (await rendues()) === 2);
  await page.keyboard.press("Alt+Shift+KeyR");
  await page.waitForTimeout(80);
  check("[O-5] Alt+Maj+R : le reste du modèle n'est plus rendu, bouton enfoncé", (await rendues()) === 1 && (await reste.getAttribute("aria-pressed")) === "true", String(await rendues()));
  await page.keyboard.press("Shift+Home");
  await page.waitForTimeout(80);
  check("[O-5] retour à la racine : tout est rendu de nouveau, aucun masquage résiduel", (await rendues()) === 2 && (await masquees()) === avantIsolement, String(await rendues()));
  await page.locator("[data-planche-outils-bouton]").click();
  await page.locator('[data-outils-famille="objets"]').click();
  const listees = await page.locator("[data-outils-commande]").evaluateAll((l) => l.map((b) => b.getAttribute("data-outils-commande")));
  check("[O-5] « Outils ▾ » : Isoler et Masquer le reste du modèle listés", listees.includes("isoler") && listees.includes("masquer-reste"), listees.join(","));
  await page.keyboard.press("Escape");
  check("[O-5] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

// ————————————————————————————————————————————————————————————— Téléphone (390 px, tactile)
{
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "fr-FR" });
  const s = await preparer(ctx);
  const { page } = s;
  const { cliquer, survoler, saisir } = aides(page);
  await s.ouvrirPlanche(true);
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 1, y: 1, z: 0 });
  await saisir("2;2");
  await page.keyboard.press(" ");
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(80);
  const b = await bouton(page, "groupe").boundingBox();
  check("[téléphone] bouton Grouper visible, cible d'au moins 36 px, dans l'écran", !!b && b.width >= 36 && b.height >= 36 && b.x >= 0 && b.x + b.width <= 391, JSON.stringify(b));
  await bouton(page, "groupe").tap();
  await page.waitForTimeout(80);
  check("[téléphone] Grouper au doigt : un groupe", (await objets(page)) === 1);
  await bouton(page, "eclater").tap();
  await page.waitForTimeout(80);
  check("[téléphone] Éclater au doigt : géométrie libre", (await objets(page)) === 0);
  // O-2 au téléphone : ouvrir un groupe affiche le fil d'Ariane par-dessus le dessin, sans le redimensionner.
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(80);
  const avant = await page.locator("[data-planche-vue]").boundingBox();
  const id = await page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.occurrences)[0]);
  const p = await (async () => {
    const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
    const e = await page.evaluate(() => window.fadiPlanche.versEcran({ x: 1, y: 1, z: 0 }));
    return { x: b.x + e.x, y: b.y + e.y };
  })();
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForTimeout(120);
  const apres = await page.locator("[data-planche-vue]").boundingBox();
  const bf = await page.locator("[data-planche-fil]").boundingBox();
  check("[téléphone] groupe ouvert : fil d'Ariane dans l'écran, zone de dessin inchangée", (await page.evaluate(() => window.fadiPlanche.dans())) === id && !!bf && bf.x >= 0 && bf.x + bf.width <= 391 && !!avant && !!apres && Math.abs(avant.height - apres.height) < 0.5, JSON.stringify({ bf, avant, apres }));
  await page.screenshot({ path: `${OUT}/4-telephone-contexte.png` });
  await page.locator('[data-planche-commande="fermer"]').tap();
  await page.waitForTimeout(80);
  check("[téléphone] Fermer au doigt : racine", (await page.evaluate(() => window.fadiPlanche.dans() ?? null)) === null);
  await page.screenshot({ path: `${OUT}/2-telephone.png` });
  check("[téléphone] aucune erreur JavaScript", s.erreurs.length === 0, s.erreurs.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(echecs === 0 ? "\nRecette des objets (O-1) : tout est vert." : `\nRecette des objets (O-1) : ${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
