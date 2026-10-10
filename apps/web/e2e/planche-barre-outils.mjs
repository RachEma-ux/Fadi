/**
 * Recette du bouton « Outils ▾ » et des barres d'opérations flottantes de la Planche (D-198), sur ordinateur
 * (1536 × 864) puis en émulation téléphone (390 × 844, tactile) : la liste s'ouvre sous le bouton (aria-expanded,
 * rôle menu), se referme sur Échap, au clic extérieur et après le choix d'une icône ; clavier (Entrée ouvre et va au
 * champ, flèches) ; recherche (Entrée active le premier outil) ; Ligne déplie sa barre ① Créer · ② Modifier ·
 * ③ Mesurer / annoter ; « afficher » la pose sur le dessin sans le redimensionner ; la barre se glisse (souris,
 * flèches) en restant entière dans l'écran ; une icône active l'outil (surligné dans la barre et dans la liste) ;
 * raccourcis de la couche Fadi (Maj + P, Alt + Maj + M) ; position et affichage retrouvés après rechargement ; ✕ la
 * masque ; « Réinitialiser la disposition » ; au téléphone, une seule barre, rangée en bas au-dessus du volet.
 * Aucune commande émise (brouillon local), aucune erreur JavaScript, axe-core sans violation critique ou sérieuse.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-barre-outils.mjs
 */
import { createRequire } from "node:module";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreursPage = [];
let enPlanche = false;
const commandesEmises = [];
const ecouter = (p) => {
  p.on("pageerror", (e) => erreursPage.push(e.message));
  p.on("request", (r) => {
    if (enPlanche && r.method() === "POST" && /\/commands\b/.test(r.url())) commandesEmises.push(r.url());
  });
  p.on("dialog", (d) => void d.accept());
};
ecouter(page);

const api = async (methode, chemin, data, p = page) => {
  const r = await p.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const ouvrir = async (pid, p = page) => {
  await p.goto(`${BASE}/projets/${pid}?module=atelier`);
  await p.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await p.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
};
async function ouvrirPlanche(p, toucher = false) {
  const bouton = p.locator("[data-mode-planche]");
  await bouton.scrollIntoViewIfNeeded();
  if (toucher) await bouton.tap();
  else await bouton.click();
  await p.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
  await p.waitForFunction(() => !!window.fadiPlanche, null, { timeout: 30000 });
  enPlanche = true;
}
async function axe(nom, p) {
  await p.addScriptTag({ path: AXE_SCRIPT });
  const r = await p.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector("[data-planche]") ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  });
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}
const outilActif = (p) => p.evaluate(() => window.fadiPlanche.outil());
const boite = (p, sel) => p.locator(sel).first().boundingBox();
const dansEcran = (b, vp) => !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5;

const email = `planche-barre-outils-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "planche-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · barres d'outils" })).body.id;

// ──────────────────────────── Ordinateur ────────────────────────────
console.log("\n──── ordinateur (1536 × 864) ────");
const vp = { width: 1536, height: 864 };
await ouvrir(pid);
await ouvrirPlanche(page);
const B = "[data-planche-outils-bouton]";
const L = "[data-planche-outils-liste]";
const liste = () => page.locator(L).count();

// 1. Bouton et liste : dans la barre du haut de la Planche, ouverte sous le bouton.
check("le bouton « Outils » est dans la barre du haut de la Planche", (await page.locator(`.planche-haut ${B}`).count()) === 1 && (await page.locator(B).getAttribute("aria-haspopup")) === "menu");
check("le rail d'outils, la grille « … » et la recherche restent là", (await page.locator(".planche-outils [data-planche-outil]").count()) > 5 && (await page.locator("[data-planche-plus]").count()) === 1 && (await page.locator("[data-planche-recherche]").count()) === 1);
await page.locator(B).click();
const bb = await boite(page, B);
const bl = await boite(page, L);
check("un clic ouvre la liste sous le bouton (aria-expanded, rôle menu)", (await page.locator(B).getAttribute("aria-expanded")) === "true" && (await page.locator(`${L} [role=menu]`).count()) === 1 && !!bl && !!bb && bl.y >= bb.y + bb.height - 1, JSON.stringify({ bb, bl }));
const familles = await page.locator("[data-outils-famille]").evaluateAll((els) => els.map((e) => e.getAttribute("data-outils-famille")));
check("un groupe par famille du catalogue, chacun avec sa flèche, puis le groupe des commandes « Objets » (D-203)", familles.join(",") === "selection,dessin,modification,mesure,annotation,camera,solide,materiau,objets", familles.join(","));
await page.keyboard.press("Escape");
check("Échap referme la liste (l'outil actif ne change pas)", (await liste()) === 0 && (await page.locator(B).getAttribute("aria-expanded")) === "false" && (await outilActif(page)) === "selection");
await page.locator(B).click();
await page.mouse.click(vp.width / 2, vp.height / 2);
check("un clic ailleurs referme la liste", (await liste()) === 0);

// 2. Clavier : Entrée ouvre et met le focus dans le champ ; flèches ; Entrée dans le champ active le premier outil.
await page.locator(B).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(100);
check("au clavier, Entrée ouvre la liste et place le focus dans « Rechercher un outil… »", (await page.evaluate(() => document.activeElement?.hasAttribute("data-outils-recherche"))) === true);
await page.keyboard.press("ArrowDown");
check("flèche bas : premier groupe (Sélection)", (await page.evaluate(() => document.activeElement?.getAttribute("data-outils-famille"))) === "selection");
await page.keyboard.press("ArrowDown");
check("flèche bas : ligne d'outil suivante (Sélectionner)", (await page.evaluate(() => document.activeElement?.getAttribute("data-outils-outil"))) === "selection");
await page.keyboard.press("ArrowRight");
check("flèche droite déplie la barre d'opérations de l'outil", (await page.locator('[data-outils-barre="selection"]').count()) === 1);
await page.keyboard.press("ArrowLeft");
check("flèche gauche la replie", (await page.locator('[data-outils-barre="selection"]').count()) === 0);
await page.locator("[data-outils-recherche]").fill("rect");
const retenus = await page.locator("[data-outils-outil]").evaluateAll((els) => els.map((e) => e.getAttribute("data-outils-outil")));
check("la recherche filtre la liste (rect → Rectangle, Rectangle pivoté)", retenus.join(",") === "rectangle,rectangle-pivote", retenus.join(","));
await page.locator("[data-outils-recherche]").press("Enter");
check("Entrée active le premier outil retenu et referme la liste", (await outilActif(page)) === "rectangle" && (await liste()) === 0, await outilActif(page));
await page.keyboard.press("Escape");

// 3. Ligne : sa barre d'opérations dans la liste.
await page.locator(B).click();
if ((await page.locator('[data-outils-famille="dessin"]').getAttribute("aria-expanded")) !== "true") await page.locator('[data-outils-famille="dessin"]').click();
await page.locator('[data-outils-outil="ligne"]').click();
const sections = await page.locator('[data-outils-barre="ligne"] [data-outils-section]').evaluateAll((els) => els.map((e) => e.getAttribute("data-outils-section")));
check("cliquer le nom « Ligne » déplie sa barre : ① Créer, ② Modifier, ③ Mesurer / annoter", sections.join(",") === "creer,modifier,mesurer", sections.join(","));
const ops = await page.locator('[data-outils-barre="ligne"] [data-outils-operation]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-outils-operation"), titre: e.getAttribute("title"), picto: e.textContent.trim() })));
check("chaque opération a son pictogramme et « Nom — raccourci » en infobulle", ops.length >= 10 && ops.every((o) => o.picto && o.picto !== "•" && / — \S/.test(o.titre)), ops.filter((o) => !(o.picto && / — \S/.test(o.titre))).map((o) => o.id).join(","));
check("Ligne : « Ligne — L », « Main levée — Maj+L », Pousser/Tirer et Mètre présents", ops.some((o) => o.titre === "Ligne — L") && ops.some((o) => o.titre.startsWith("Main levée — Maj+L")) && ops.some((o) => o.id === "pousser-tirer") && ops.some((o) => o.id === "metre"));
await page.locator('[data-outils-barre="ligne"] [data-outils-operation="deplacer"]').click();
check("choisir une icône active l'outil (comme le rail) et referme la liste", (await outilActif(page)) === "deplacer" && (await liste()) === 0);
check("l'outil choisi est aussi surligné dans le rail de gauche", (await page.locator('.planche-outils [data-planche-outil="deplacer"]').getAttribute("aria-pressed")) === "true");

// 4. « afficher » : la barre flottante sur le dessin.
const canevasAvant = await boite(page, "[data-planche-vue] canvas");
await page.locator(B).click();
if ((await page.locator('[data-outils-famille="dessin"]').getAttribute("aria-expanded")) !== "true") await page.locator('[data-outils-famille="dessin"]').click();
await page.locator('[data-outils-afficher="ligne"]').click();
check("la case « afficher » est cochée et la liste reste ouverte", (await page.locator('[data-outils-afficher="ligne"]').getAttribute("aria-checked")) === "true" && (await liste()) === 1);
check("le pied « ⚙ Barres d'outils » liste la barre affichée", (await page.locator('[data-outils-barre-visible="ligne"]').count()) === 1);
await page.keyboard.press("Escape");
const F = '[data-barre-outils="ligne"]';
await page.waitForSelector(F);
const canevasApres = await boite(page, "[data-planche-vue] canvas");
const bf = await boite(page, F);
check("la barre flottante apparaît, entière dans l'écran", dansEcran(bf, vp), JSON.stringify(bf));
check("elle flotte sans redimensionner le dessin", JSON.stringify(canevasAvant) === JSON.stringify(canevasApres), `${JSON.stringify(canevasAvant)} / ${JSON.stringify(canevasApres)}`);
check("barre : rôle toolbar, trois sections, ✕, poignée", (await page.locator(`${F}[role=toolbar] [data-barre-outils-section]`).count()) === 3 && (await page.locator(`${F} [data-barre-outils-fermer]`).count()) === 1 && (await page.locator(`${F} [data-barre-outils-poignee]`).count()) === 1);
check("l'outil actif (Déplacer) est surligné dans la barre", (await page.locator(`${F} [data-barre-outils-operation="deplacer"]`).getAttribute("aria-pressed")) === "true");

// 5. Glisser : souris (hors écran → ramenée), flèches.
const poignee = await boite(page, `${F} [data-barre-outils-poignee]`);
await page.mouse.move(poignee.x + poignee.width / 2, poignee.y + poignee.height / 2);
await page.mouse.down();
await page.mouse.move(3000, 3000, { steps: 8 });
await page.mouse.up();
const bg = await boite(page, F);
check("glissée hors de l'écran en bas à droite, la barre reste entière dans la zone visible", dansEcran(bg, vp) && bg.x + bg.width >= vp.width - 10 && bg.y + bg.height >= vp.height - 10, JSON.stringify(bg));
await page.mouse.move(bg.x + 10, bg.y + bg.height / 2);
await page.mouse.down();
await page.mouse.move(-500, -500, { steps: 8 });
await page.mouse.up();
const bh = await boite(page, F);
check("glissée hors de l'écran en haut à gauche : ramenée dans l'écran", dansEcran(bh, vp) && bh.x <= 10 && bh.y <= 10, JSON.stringify(bh));
// Position de travail, au milieu du dessin.
await page.mouse.move(bh.x + 10, bh.y + bh.height / 2);
await page.mouse.down();
await page.mouse.move(400, 300, { steps: 6 });
await page.mouse.up();
const avantFleche = await boite(page, F);
await page.locator(`${F} [data-barre-outils-poignee]`).focus();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowDown");
const apresFleche = await boite(page, F);
check("flèches au clavier : 16 px par pas (sans toucher à l'outil actif)", Math.round(apresFleche.x - avantFleche.x) === 16 && Math.round(apresFleche.y - avantFleche.y) === 16 && (await outilActif(page)) === "deplacer", `${JSON.stringify(avantFleche)} → ${JSON.stringify(apresFleche)}`);
check("position mémorisée", (await page.locator(F).getAttribute("data-position")) === "memorisee");

// 6. Une icône de la barre active l'outil ; surligné dans la barre et dans la liste.
await page.locator(`${F} [data-barre-outils-operation="ligne"]`).click();
check("une icône de la barre flottante active l'outil (Ligne)", (await outilActif(page)) === "ligne" && (await page.locator(`${F} [data-barre-outils-operation="ligne"]`).getAttribute("aria-pressed")) === "true");
await page.locator(`${F} [data-barre-outils-operation="pousser-tirer"]`).click();
check("… puis Pousser/Tirer", (await outilActif(page)) === "pousser-tirer");
await page.locator(B).click();
if ((await page.locator('[data-outils-famille="modification"]').getAttribute("aria-expanded")) !== "true") await page.locator('[data-outils-famille="modification"]').click();
check("l'outil actif est surligné dans la liste", (await page.locator('[data-outils-ligne="pousser-tirer"].est-actif').count()) === 1 && (await page.locator('[data-outils-outil="pousser-tirer"]').getAttribute("aria-current")) === "true");
await axe("ordinateur (liste ouverte, barre affichée)", page);
await page.keyboard.press("Escape");

// 7. Raccourcis de la couche Fadi, et relevé inchangé.
await page.locator("[data-planche-vue]").focus();
await page.keyboard.press("Shift+P");
check("Maj + P active Polygone (couche Fadi)", (await outilActif(page)) === "polygone", await outilActif(page));
await page.keyboard.press("Shift+L");
check("Maj + L active Main levée (couche Fadi)", (await outilActif(page)) === "main-levee", await outilActif(page));
await page.keyboard.press("Alt+Shift+M");
check("Alt + Maj + M active Marcher (couche Fadi)", (await outilActif(page)) === "marcher", await outilActif(page));
await page.keyboard.press("l");
check("L reste Ligne (relevé inchangé)", (await outilActif(page)) === "ligne", await outilActif(page));
await page.keyboard.press("Escape");

// 8. Rechargement : barre et position retrouvées.
const posAvant = await boite(page, F);
enPlanche = false;
await ouvrir(pid);
await ouvrirPlanche(page);
await page.waitForSelector(F, { timeout: 10000 }).catch(() => null);
const posApres = await boite(page, F);
check("après rechargement, la barre Ligne est toujours affichée, à la même place", !!posApres && Math.abs(posApres.x - posAvant.x) <= 1 && Math.abs(posApres.y - posAvant.y) <= 1, `${JSON.stringify(posAvant)} / ${JSON.stringify(posApres)}`);

// 9. Réinitialiser la disposition ; ✕ masque la barre.
await page.locator(B).click();
await page.locator("[data-outils-reinitialiser]").click();
check("« Réinitialiser la disposition » remet la barre à sa position par défaut (toujours affichée)", (await page.locator(F).getAttribute("data-position")) === "defaut");
await page.keyboard.press("Escape");
await page.locator(`${F} [data-barre-outils-fermer]`).click();
check("✕ masque la barre", (await page.locator(F).count()) === 0);
await page.locator(B).click();
if ((await page.locator('[data-outils-famille="dessin"]').getAttribute("aria-expanded")) !== "true") await page.locator('[data-outils-famille="dessin"]').click();
check("… et décoche « afficher » dans la liste", (await page.locator('[data-outils-afficher="ligne"]').getAttribute("aria-checked")) === "false");
// Pour le téléphone : deux barres affichées (Ligne puis Rectangle).
await page.locator('[data-outils-afficher="ligne"]').click();
await page.locator('[data-outils-afficher="rectangle"]').click();
await page.keyboard.press("Escape");
check("au bureau, deux barres affichées en même temps", (await page.locator("[data-barre-outils]").count()) === 2);

// ──────────────────────────── Téléphone ────────────────────────────
console.log("\n──── téléphone (390 × 844, tactile) ────");
const vpt = { width: 390, height: 844 };
const c = await browser.newContext({ viewport: vpt, hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
const p = await c.newPage();
ecouter(p);
await ouvrir(pid, p);
await ouvrirPlanche(p, true);
await p.waitForSelector("[data-barre-outils]", { timeout: 10000 }).catch(() => null);
const rendues = await p.locator("[data-barre-outils]").evaluateAll((els) => els.map((e) => e.getAttribute("data-barre-outils")));
check("téléphone : une seule barre, la dernière affichée (Rectangle)", rendues.join(",") === "rectangle", rendues.join(","));
const bt = await boite(p, "[data-barre-outils]");
const volet = await boite(p, "[data-planche-volet]");
check("téléphone : barre rangée en bas, juste au-dessus du volet, sur toute la largeur, entière dans l'écran", dansEcran(bt, vpt) && !!volet && bt.y + bt.height <= volet.y + 1 && bt.y + bt.height >= volet.y - 12 && bt.width >= vpt.width - 12, `${JSON.stringify(bt)} / volet ${JSON.stringify(volet)}`);
check("téléphone : position « docquee »", (await p.locator("[data-barre-outils]").getAttribute("data-position")) === "docquee");
const petits = await p.locator("[data-barre-outils] button:visible").evaluateAll((els) => els.filter((e) => { const q = e.getBoundingClientRect(); return q.width < 43.5 || q.height < 43.5; }).length);
check("téléphone : cibles ≥ 44 px", petits === 0, `${petits} trop petites`);
await p.locator('[data-barre-outils] [data-barre-outils-operation="cercle"]').tap();
check("téléphone : une icône de la barre rangée active l'outil (Cercle)", (await outilActif(p)) === "cercle", await outilActif(p));
const actions = await boite(p, "[data-barre-actions]");
check("téléphone : la barre d'actions (position par défaut) ne recouvre pas la barre rangée", !actions || actions.y + actions.height <= bt.y + 1 || (await p.locator("[data-barre-actions]").getAttribute("data-position")) === "memorisee", `${JSON.stringify(actions)} / ${JSON.stringify(bt)}`);
await p.locator(B).tap();
const blt = await boite(p, L);
const bbt = await boite(p, B);
check("téléphone : la liste s'ouvre en surcouche sous le bouton (sans le recouvrir), entière dans l'écran", dansEcran(blt, vpt) && blt.y >= bbt.y + bbt.height - 1, `${JSON.stringify(blt)} / bouton ${JSON.stringify(bbt)}`);
await axe("téléphone (liste ouverte, barre rangée)", p);
await p.locator(B).tap();
await p.locator('[data-barre-outils] [data-barre-outils-fermer]').tap();
const apres = await p.locator("[data-barre-outils]").evaluateAll((els) => els.map((e) => e.getAttribute("data-barre-outils")));
check("téléphone : ✕ masque la barre Rectangle, la barre Ligne prend sa place", apres.join(",") === "ligne", apres.join(","));
await c.close();

// ──────────────────────────── Anglais (D-163) ────────────────────────────
console.log("\n──── anglais ────");
const ce = await browser.newContext({ viewport: vp, storageState: await ctx.storageState() });
await ce.addInitScript(() => localStorage.setItem("fadi.langue", "en"));
// Fenêtre séparée simulée (Document Picture-in-Picture) : un cadre de même origine — un autre « realm », comme la vraie
// fenêtre (ses nœuds ne sont pas des `Element` de la page) ; le traducteur du DOM ne l'observe pas.
await ce.addInitScript(() => {
  Object.defineProperty(window, "documentPictureInPicture", {
    configurable: true,
    value: {
      requestWindow: async ({ width, height }) => {
        const f = document.createElement("iframe");
        f.setAttribute("data-fenetre-detachee", "");
        f.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:2px solid #333;z-index:99999;background:#fff`;
        document.body.appendChild(f);
        f.contentWindow.close = () => {
          f.contentWindow.dispatchEvent(new Event("pagehide"));
          f.remove();
        };
        return f.contentWindow;
      },
    },
  });
});
const pe = await ce.newPage();
ecouter(pe);
await ouvrir(pid, pe).catch(() => null);
await pe.waitForSelector("[data-mode-planche]", { timeout: 30000 });
await ouvrirPlanche(pe);
await pe.locator(B).click();
if ((await pe.locator('[data-outils-famille="dessin"]').getAttribute("aria-expanded")) !== "true") await pe.locator('[data-outils-famille="dessin"]').click();
await pe.locator('[data-outils-outil="ligne"]').click();
await pe.waitForTimeout(300);
const textes = await pe.evaluate(() => ({
  bouton: document.querySelector("[data-planche-outils-bouton]")?.textContent?.trim(),
  champ: document.querySelector("[data-outils-recherche]")?.getAttribute("placeholder"),
  dessin: document.querySelector('[data-outils-famille="dessin"]')?.textContent?.trim(),
  afficher: document.querySelector('[data-outils-afficher="ligne"]')?.textContent?.trim(),
  sections: Array.from(document.querySelectorAll('[data-outils-barre="ligne"] .planche-outils-section-titre')).map((e) => e.textContent.trim()),
  pied: document.querySelector(".planche-outils-pied-titre")?.textContent?.trim(),
  reinit: document.querySelector("[data-outils-reinitialiser]")?.textContent?.trim(),
  mainLevee: document.querySelector('[data-outils-barre="ligne"] [data-outils-operation="main-levee"]')?.getAttribute("title"),
}));
check("anglais : bouton, champ, familles, « show », sections, pied et raccourcis traduits", textes.bouton?.startsWith("Tools") && textes.champ === "Search for a tool…" && textes.dessin?.endsWith("Draw") && textes.afficher?.endsWith("show") && textes.sections.join("|") === "① Create|② Modify|③ Measure / annotate" && textes.pied === "⚙ Toolbars" && textes.reinit === "Reset the layout" && textes.mainLevee === "Freehand — Shift+L", JSON.stringify(textes));
await pe.keyboard.press("Escape");

// Planche détachée (autre document) : Entrée sur le bouton « Outils » ouvre la liste (pas de validation de la Planche),
// et les textes, écrits par le code, restent en anglais.
await pe.locator("[data-barre-actions] [data-planche-detacher]").click();
await pe.waitForSelector("[data-fenetre-detachee]", { timeout: 10000 });
const fen = pe.frameLocator("[data-fenetre-detachee]");
await fen.locator(B).waitFor({ timeout: 10000 });
await fen.locator(B).focus();
await pe.keyboard.press("Enter");
await pe.waitForTimeout(200);
const focusChamp = await fen.locator("[data-outils-recherche]").evaluate((e) => e.ownerDocument.activeElement === e).catch(() => false);
check("détachée : Entrée sur le bouton « Outils » ouvre la liste et place le focus dans le champ", (await fen.locator(L).count()) === 1 && (await fen.locator(B).getAttribute("aria-expanded")) === "true" && focusChamp);
if ((await fen.locator('[data-outils-famille="dessin"]').getAttribute("aria-expanded")) !== "true") await fen.locator('[data-outils-famille="dessin"]').click();
// L'état de la liste survit au détachement (même composant, déplacé) : Ligne peut être déjà dépliée.
if ((await fen.locator('[data-outils-outil="ligne"]').getAttribute("aria-expanded")) !== "true") await fen.locator('[data-outils-outil="ligne"]').click();
const textesDetache = await fen.locator(L).evaluate((l) => ({
  bouton: l.ownerDocument.querySelector("[data-planche-outils-bouton]")?.textContent?.trim(),
  champ: l.querySelector("[data-outils-recherche]")?.getAttribute("placeholder"),
  dessin: l.querySelector('[data-outils-famille="dessin"]')?.textContent?.trim(),
  ligne: l.querySelector('[data-outils-outil="main-levee"] .planche-outils-libelle')?.textContent?.trim(),
  afficher: l.querySelector('[data-outils-afficher="main-levee"]')?.textContent?.trim(),
  sections: Array.from(l.querySelectorAll('[data-outils-barre="ligne"] .planche-outils-section-titre')).map((e) => e.textContent.trim()),
  mainLevee: l.querySelector('[data-outils-barre="ligne"] [data-outils-operation="main-levee"]')?.getAttribute("title"),
  pied: l.querySelector(".planche-outils-pied-titre")?.textContent?.trim(),
}));
check("détachée, anglais : bouton, champ, familles, noms d'outils, « show », sections et raccourcis en anglais", textesDetache.bouton?.startsWith("Tools") && textesDetache.champ === "Search for a tool…" && textesDetache.dessin?.endsWith("Draw") && textesDetache.ligne === "Freehand" && textesDetache.afficher?.endsWith("show") && textesDetache.sections.join("|") === "① Create|② Modify|③ Measure / annotate" && textesDetache.mainLevee === "Freehand — Shift+L" && textesDetache.pied === "⚙ Toolbars", JSON.stringify(textesDetache));
await fen.locator('[data-outils-barre="ligne"] [data-outils-operation="arc"]').focus();
await pe.keyboard.press("Enter");
check("détachée : Entrée sur une icône de la liste active l'outil (Arc) et referme la liste", (await outilActif(pe)) === "arc" && (await fen.locator(L).count()) === 0, await outilActif(pe));
// Une barre affichée APRÈS le détachement : ses boutons naissent dans le document de la fenêtre (autre realm). Entrée
// sur l'un d'eux doit l'activer, non être pris par la Planche pour valider la saisie (contrôle sans `instanceof`).
await fen.locator(B).click();
if ((await fen.locator('[data-outils-famille="dessin"]').getAttribute("aria-expanded")) !== "true") await fen.locator('[data-outils-famille="dessin"]').click();
if ((await fen.locator('[data-outils-afficher="cercle"]').getAttribute("aria-checked")) !== "true") await fen.locator('[data-outils-afficher="cercle"]').click();
await pe.keyboard.press("Escape");
await fen.locator('[data-barre-outils="cercle"] [data-barre-outils-operation="polygone"]').focus();
await pe.keyboard.press("Enter");
check("détachée : Entrée sur un bouton créé dans la fenêtre (barre Cercle → Polygone) active ce bouton", (await outilActif(pe)) === "polygone", await outilActif(pe));
await ce.close();

check("aucune requête POST vers /commands pendant la Planche (brouillon local)", commandesEmises.length === 0, commandesEmises.slice(0, 3).join(" | "));
check("aucune erreur JavaScript dans la page", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette des barres d'outils de la Planche : tout est vert.");
process.exit(echecs ? 1 : 0);
